import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = dirname(fileURLToPath(import.meta.url));
const gameData = JSON.parse(readFileSync(resolve(serverDir, "../shared/game-data.json"), "utf8"));
const { stocks, lastRound } = gameData;
const defaultSeedMoney = 1000;
const defaultTeamCount = 12;
const maxTeamCount = 30;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경 변수가 필요합니다.`);
  return value;
}

const teamPassword = requiredEnv("TEAM_PASSWORD");
const staffPassword = requiredEnv("STAFF_PASSWORD");
const viewPassword = process.env.VIEW_PASSWORD?.trim() || staffPassword;
const signingKey = requiredEnv("SESSION_SIGNING_KEY");
if (signingKey.length < 32) throw new Error("SESSION_SIGNING_KEY는 32자 이상이어야 합니다.");

const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT가 올바르지 않습니다.");

const defaultOrigins = "https://notdatum.github.io,http://localhost:4173,http://localhost:5173,http://localhost:3000";
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? defaultOrigins)
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean));

const dataDir = process.env.DATA_DIR?.trim() || resolve(serverDir, "data");
const databasePath = process.env.DB_PATH?.trim() || resolve(dataDir, "be-game.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS game_state (
    id INTEGER PRIMARY KEY,
    round INTEGER NOT NULL DEFAULT 0,
    started INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;
  CREATE TABLE IF NOT EXISTS teams (
    team_id INTEGER PRIMARY KEY,
    seed_money INTEGER NOT NULL DEFAULT 1000,
    cash INTEGER NOT NULL DEFAULT 1000
  ) STRICT;
  CREATE TABLE IF NOT EXISTS team_sessions (
    team_id INTEGER PRIMARY KEY,
    session_version INTEGER NOT NULL DEFAULT 0,
    last_seen_at TEXT
  ) STRICT;
  CREATE TABLE IF NOT EXISTS price_schedule (
    ticker TEXT NOT NULL,
    round INTEGER NOT NULL,
    price INTEGER,
    PRIMARY KEY (ticker, round)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS holdings (
    team_id INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    shares INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (team_id, ticker),
    FOREIGN KEY (team_id) REFERENCES teams(team_id)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
    quantity INTEGER NOT NULL,
    price INTEGER NOT NULL,
    round INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    canceled_at TEXT,
    FOREIGN KEY (team_id) REFERENCES teams(team_id)
  ) STRICT;
  CREATE INDEX IF NOT EXISTS trades_team_id_idx ON trades (team_id, id DESC);
  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL DEFAULT 'staff',
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;
  CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs (id DESC);
  INSERT OR IGNORE INTO game_state (id, round, started) VALUES (1, 0, 0);
`);

const tradeColumns = db.prepare("PRAGMA table_info(trades)").all();
if (!tradeColumns.some((column) => column.name === "canceled_at")) {
  db.exec("ALTER TABLE trades ADD COLUMN canceled_at TEXT");
}

const insertInitialTeam = db.prepare("INSERT OR IGNORE INTO teams (team_id, seed_money, cash) VALUES (?, 1000, 1000)");
const configuredTeamCount = db.prepare("SELECT COUNT(*) AS count FROM teams").get().count;
if (configuredTeamCount === 0) {
  for (let teamId = 1; teamId <= defaultTeamCount; teamId += 1) insertInitialTeam.run(teamId);
}
const insertInitialTeamSession = db.prepare("INSERT OR IGNORE INTO team_sessions (team_id, session_version, last_seen_at) VALUES (?, 0, NULL)");
for (const team of db.prepare("SELECT team_id FROM teams").all()) insertInitialTeamSession.run(team.team_id);

const configuredPriceCount = db.prepare("SELECT COUNT(*) AS count FROM price_schedule").get().count;
if (configuredPriceCount === 0) {
  const insertInitialPrice = db.prepare("INSERT INTO price_schedule (ticker, round, price) VALUES (?, ?, ?)");
  for (const stock of stocks) {
    stock.prices.forEach((price, round) => insertInitialPrice.run(stock.ticker, round, price));
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function safeEqualText(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function recordAdminAction(action, summary, details = null) {
  db.prepare("INSERT INTO admin_audit_logs (actor, action, summary, details) VALUES ('staff', ?, ?, ?)")
    .run(action, summary, details === null ? null : JSON.stringify(details));
}

function parseAuditDetails(details) {
  if (!details) return null;
  try { return JSON.parse(details); } catch { return null; }
}

function createSessionToken(session) {
  const payload = Buffer.from(JSON.stringify({
    role: session.role,
    teamId: session.teamId,
    sessionVersion: session.sessionVersion,
    exp: Date.now() + 18 * 60 * 60 * 1000,
  })).toString("base64url");
  const signature = createHmac("sha256", signingKey).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function publicSession(session) {
  if (session.role === "team") return { role: "team", teamId: session.teamId };
  return { role: session.role, teamId: null };
}

function readSession(request, { touch = true } = {}) {
  const authorization = request.headers.authorization ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  const split = token.lastIndexOf(".");
  if (split < 1) return null;
  const payload = token.slice(0, split);
  const signature = token.slice(split + 1);
  const expected = createHmac("sha256", signingKey).update(payload).digest("base64url");
  if (!safeEqualText(signature, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isFinite(session.exp) || session.exp < Date.now()) return null;
    if (session.role === "staff" && session.teamId === null) return { role: "staff", teamId: null, sessionVersion: null };
    if (session.role === "view" && session.teamId === null) return { role: "view", teamId: null, sessionVersion: null };
    if (session.role === "team" && Number.isInteger(session.teamId) && session.teamId >= 1 && session.teamId <= maxTeamCount && Number.isInteger(session.sessionVersion)) {
      const teamSession = db.prepare(`SELECT ts.session_version
        FROM team_sessions ts INNER JOIN teams t ON t.team_id = ts.team_id
        WHERE ts.team_id = ?`).get(session.teamId);
      if (teamSession && teamSession.session_version === session.sessionVersion) {
        if (touch) db.prepare("UPDATE team_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE team_id = ?").run(session.teamId);
        return { role: "team", teamId: session.teamId, sessionVersion: session.sessionVersion };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function corsOrigin(request) {
  const origin = request.headers.origin?.replace(/\/$/, "");
  if (!origin) return null;
  if (!allowedOrigins.has(origin)) throw new HttpError(403, "허용되지 않은 사이트에서 보낸 요청입니다.");
  return origin;
}

function setCommonHeaders(response, origin) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Access-Control-Max-Age", "86400");
    response.setHeader("Vary", "Origin");
  }
}

function sendJson(response, status, value, origin = null) {
  setCommonHeaders(response, origin);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 100_000) throw new HttpError(413, "요청 내용이 너무 큽니다.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "요청 형식이 올바르지 않습니다.");
  }
}

function transaction(work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function getStockPrice(ticker, round) {
  const row = db.prepare("SELECT price FROM price_schedule WHERE ticker = ? AND round = ?").get(ticker, round);
  return row?.price ?? null;
}

function isStockTradable(ticker, round) {
  return round < lastRound && getStockPrice(ticker, round) !== null;
}

function gameSnapshot(session) {
  const game = db.prepare("SELECT round, started, updated_at FROM game_state WHERE id = 1").get()
    ?? { round: 0, started: 0, updated_at: "" };
  const teams = db.prepare("SELECT team_id, seed_money, cash FROM teams ORDER BY team_id").all();
  const holdings = db.prepare("SELECT team_id, ticker, shares FROM holdings WHERE shares > 0 ORDER BY team_id, ticker").all();
  const trades = db.prepare("SELECT id, team_id, ticker, action, quantity, price, round, created_at, canceled_at FROM trades ORDER BY id DESC LIMIT 500").all();
  const auditRows = session.role === "staff"
    ? db.prepare("SELECT id, actor, action, summary, details, created_at FROM admin_audit_logs ORDER BY id DESC LIMIT 100").all()
    : [];
  const priceRows = db.prepare("SELECT ticker, round, price FROM price_schedule ORDER BY ticker, round").all();
  const presenceRows = db.prepare(`SELECT team_id, last_seen_at,
    CASE WHEN last_seen_at IS NOT NULL AND last_seen_at >= datetime('now', '-12 seconds') THEN 1 ELSE 0 END AS online
    FROM team_sessions`).all();
  const fullPrices = Object.fromEntries(stocks.map((stock) => [
    stock.ticker,
    Array.from({ length: lastRound + 1 }, (_, round) => priceRows.find((row) => row.ticker === stock.ticker && row.round === round)?.price ?? null),
  ]));
  const teamViews = teams.map((team) => {
    const teamHoldings = holdings.filter((holding) => holding.team_id === team.team_id);
    const stockValue = teamHoldings.reduce(
      (sum, holding) => sum + holding.shares * (fullPrices[holding.ticker]?.[game.round] ?? 0),
      0,
    );
    return {
      teamId: team.team_id,
      seedMoney: team.seed_money,
      cash: team.cash,
      totalAsset: team.cash + stockValue,
      holdings: Object.fromEntries(teamHoldings.map((holding) => [holding.ticker, holding.shares])),
      trades: trades.filter((trade) => trade.team_id === team.team_id && (session.role === "staff" || trade.canceled_at === null)),
      online: Boolean(presenceRows.find((presence) => presence.team_id === team.team_id)?.online),
      lastSeenAt: presenceRows.find((presence) => presence.team_id === team.team_id)?.last_seen_at ?? null,
    };
  });
  return {
    session: publicSession(session),
    game: { round: game.round, started: Boolean(game.started), updatedAt: game.updated_at },
    market: {
      prices: session.role === "staff"
        ? fullPrices
        : Object.fromEntries(Object.entries(fullPrices).map(([ticker, prices]) => [
          ticker,
          prices.map((price, round) => round <= game.round ? price : null),
        ])),
    },
    team: session.role === "team" ? teamViews.find((team) => team.teamId === session.teamId) ?? null : null,
    teams: session.role === "staff"
      ? teamViews
      : session.role === "view"
        ? teamViews.map(({ teamId, seedMoney, totalAsset }) => ({
          teamId,
          returnRate: seedMoney ? Math.round((((totalAsset - seedMoney) / seedMoney) * 100) * 100) / 100 : 0,
        }))
        : null,
    auditLogs: session.role === "staff" ? auditRows.map((log) => ({
      id: log.id,
      actor: log.actor,
      action: log.action,
      summary: log.summary,
      details: parseAuditDetails(log.details),
      createdAt: log.created_at,
    })) : null,
  };
}

function setupGame(seeds) {
  if (!Array.isArray(seeds) || seeds.length < 1 || seeds.length > maxTeamCount
    || seeds.some((value) => !Number.isInteger(value) || value < 1 || value > 100_000_000)) {
    throw new HttpError(400, `1개 이상 ${maxTeamCount}개 이하의 조와 올바른 시드머니를 입력해 주세요.`);
  }
  transaction(() => {
    db.exec("DELETE FROM holdings; DELETE FROM trades;");
    db.prepare("UPDATE team_sessions SET session_version = session_version + 1, last_seen_at = NULL WHERE team_id > ?").run(seeds.length);
    db.prepare("UPDATE game_state SET round = 0, started = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 1").run();
    db.prepare("DELETE FROM teams").run();
    const insertTeam = db.prepare("INSERT INTO teams (team_id, seed_money, cash) VALUES (?, ?, ?)");
    const insertTeamSession = db.prepare("INSERT OR IGNORE INTO team_sessions (team_id, session_version, last_seen_at) VALUES (?, 0, NULL)");
    seeds.forEach((seed, index) => {
      insertTeam.run(index + 1, seed, seed);
      insertTeamSession.run(index + 1);
    });
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'trades'").run();
    recordAdminAction("game_setup", `${seeds.length}개 조 게임 구성을 저장했습니다.`, { teamCount: seeds.length, seeds });
  });
}

function forceLogoutTeam(teamId, { audit = true } = {}) {
  if (!Number.isInteger(teamId) || teamId < 1 || teamId > maxTeamCount
    || !db.prepare("SELECT 1 AS present FROM teams WHERE team_id = ?").get(teamId)) {
    throw new HttpError(400, "로그아웃할 조를 다시 확인해 주세요.");
  }
  transaction(() => {
    db.prepare("UPDATE team_sessions SET session_version = session_version + 1, last_seen_at = NULL WHERE team_id = ?").run(teamId);
    if (audit) recordAdminAction("force_logout", `${teamId}조를 강제 로그아웃했습니다.`, { teamId });
  });
}

function startGame() {
  return transaction(() => {
    const game = db.prepare("SELECT round, started FROM game_state WHERE id = 1").get();
    if (!game) throw new HttpError(500, "게임 상태를 불러오지 못했습니다.");
    if (game.started) throw new HttpError(409, "이미 게임이 시작되었습니다.");
    db.prepare("UPDATE game_state SET round = 0, started = 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1").run();
    recordAdminAction("game_start", "게임을 시작했습니다.", { round: 0 });
    return { round: 0, started: true };
  });
}

function resetGame() {
  transaction(() => {
    db.exec("DELETE FROM holdings; DELETE FROM trades;");
    db.prepare("UPDATE teams SET seed_money = ?, cash = ?").run(defaultSeedMoney, defaultSeedMoney);
    db.prepare("UPDATE game_state SET round = 0, started = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 1").run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'trades'").run();
    db.prepare("DELETE FROM price_schedule").run();
    const insertPrice = db.prepare("INSERT INTO price_schedule (ticker, round, price) VALUES (?, ?, ?)");
    for (const stock of stocks) {
      stock.prices.forEach((price, round) => insertPrice.run(stock.ticker, round, price));
    }
    recordAdminAction("game_reset", "게임 상태와 주가 시나리오를 초기화했습니다.");
  });
}

function updateFuturePrices(updates) {
  if (!Array.isArray(updates) || updates.length < 1 || updates.length > stocks.length * (lastRound + 1)) {
    throw new HttpError(400, "수정할 주가를 다시 확인해 주세요.");
  }
  return transaction(() => {
    const game = db.prepare("SELECT round, started FROM game_state WHERE id = 1").get();
    if (!game) throw new HttpError(500, "게임 상태를 불러오지 못했습니다.");
    const firstEditableRound = game.started ? game.round + 1 : 0;
    const normalized = updates.map((item) => {
      const ticker = String(item?.ticker ?? "");
      const round = Number(item?.round);
      const price = item?.price === null ? null : Number(item?.price);
      if (!stocks.some((stock) => stock.ticker === ticker)
        || !Number.isInteger(round) || round < firstEditableRound || round > lastRound
        || (price !== null && (!Number.isInteger(price) || price < 1 || price > 100_000_000))) {
        throw new HttpError(400, "진행되지 않은 라운드의 올바른 주가만 수정할 수 있습니다.");
      }
      return { ticker, round, price };
    });
    const updatePrice = db.prepare("UPDATE price_schedule SET price = ? WHERE ticker = ? AND round = ?");
    normalized.forEach((item) => updatePrice.run(item.price, item.ticker, item.round));
    db.prepare("UPDATE game_state SET updated_at = CURRENT_TIMESTAMP WHERE id = 1").run();
    recordAdminAction("price_update", `미공개 주가 ${normalized.length}개를 수정했습니다.`, { updates: normalized });
    return normalized.length;
  });
}

function advanceRound() {
  return transaction(() => {
    const game = db.prepare("SELECT round, started FROM game_state WHERE id = 1").get();
    if (!game?.started) throw new HttpError(400, "먼저 시드머니를 설정해 게임을 시작해 주세요.");
    if (game.round >= lastRound) throw new HttpError(400, "모든 라운드가 종료되었습니다.");
    const nextRound = game.round + 1;
    db.prepare("UPDATE game_state SET round = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1").run(nextRound);
    recordAdminAction("round_advance", `${nextRound}라운드를 공개했습니다.`, { previousRound: game.round, round: nextRound });
    return nextRound;
  });
}

function executeTrade(teamId, body) {
  const ticker = String(body.ticker ?? "");
  const action = body.action;
  const quantity = Number(body.quantity);
  if (!stocks.some((stock) => stock.ticker === ticker)
    || (action !== "buy" && action !== "sell")
    || !Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
    throw new HttpError(400, "주문 내용을 다시 확인해 주세요.");
  }

  return transaction(() => {
    const game = db.prepare("SELECT round, started FROM game_state WHERE id = 1").get();
    if (!game?.started) throw new HttpError(400, "아직 게임이 시작되지 않았습니다.");
    if (!isStockTradable(ticker, game.round)) throw new HttpError(400, "현재 거래할 수 없는 종목입니다.");
    const price = getStockPrice(ticker, game.round);
    if (price === null) throw new HttpError(400, "현재 가격이 없습니다.");

    const team = db.prepare("SELECT cash FROM teams WHERE team_id = ?").get(teamId);
    const holding = db.prepare("SELECT shares FROM holdings WHERE team_id = ? AND ticker = ?").get(teamId, ticker);
    const shares = holding?.shares ?? 0;
    const total = price * quantity;
    if (action === "buy" && (!team || team.cash < total)) throw new HttpError(400, "보유 BE Coin이 부족합니다.");
    if (action === "sell" && shares < quantity) throw new HttpError(400, "보유한 수량보다 많이 팔 수 없습니다.");

    const nextCash = team.cash + (action === "buy" ? -total : total);
    const nextShares = shares + (action === "buy" ? quantity : -quantity);
    db.prepare("UPDATE teams SET cash = ? WHERE team_id = ?").run(nextCash, teamId);
    db.prepare(`INSERT INTO holdings (team_id, ticker, shares) VALUES (?, ?, ?)
      ON CONFLICT(team_id, ticker) DO UPDATE SET shares = excluded.shares`).run(teamId, ticker, nextShares);
    db.prepare("INSERT INTO trades (team_id, ticker, action, quantity, price, round) VALUES (?, ?, ?, ?, ?, ?)")
      .run(teamId, ticker, action, quantity, price, game.round);
    db.prepare("UPDATE game_state SET updated_at = CURRENT_TIMESTAMP WHERE id = 1").run();
    return { price, quantity, action };
  });
}

function cancelTrade(tradeId) {
  if (!Number.isInteger(tradeId) || tradeId < 1) throw new HttpError(400, "취소할 거래를 다시 확인해 주세요.");
  return transaction(() => {
    const trade = db.prepare(`SELECT id, team_id, ticker, action, quantity, price, round, canceled_at
      FROM trades WHERE id = ?`).get(tradeId);
    if (!trade) throw new HttpError(404, "거래 내역을 찾을 수 없습니다.");
    if (trade.canceled_at) throw new HttpError(409, "이미 취소된 거래입니다.");
    const team = db.prepare("SELECT cash FROM teams WHERE team_id = ?").get(trade.team_id);
    const holding = db.prepare("SELECT shares FROM holdings WHERE team_id = ? AND ticker = ?").get(trade.team_id, trade.ticker);
    if (!team) throw new HttpError(404, "거래 조를 찾을 수 없습니다.");
    const shares = holding?.shares ?? 0;
    const total = trade.quantity * trade.price;
    if (trade.action === "buy" && shares < trade.quantity) {
      throw new HttpError(409, "이후 매도로 보유 수량이 부족해 해당 매수를 취소할 수 없습니다.");
    }
    if (trade.action === "sell" && team.cash < total) {
      throw new HttpError(409, "이후 거래로 현금이 부족해 해당 매도를 취소할 수 없습니다.");
    }
    const nextCash = team.cash + (trade.action === "buy" ? total : -total);
    const nextShares = shares + (trade.action === "buy" ? -trade.quantity : trade.quantity);
    db.prepare("UPDATE teams SET cash = ? WHERE team_id = ?").run(nextCash, trade.team_id);
    db.prepare(`INSERT INTO holdings (team_id, ticker, shares) VALUES (?, ?, ?)
      ON CONFLICT(team_id, ticker) DO UPDATE SET shares = excluded.shares`).run(trade.team_id, trade.ticker, nextShares);
    db.prepare("UPDATE trades SET canceled_at = CURRENT_TIMESTAMP WHERE id = ?").run(trade.id);
    db.prepare("UPDATE game_state SET updated_at = CURRENT_TIMESTAMP WHERE id = 1").run();
    recordAdminAction("trade_cancel", `${trade.team_id}조 ${trade.ticker} ${trade.action === "buy" ? "매수" : "매도"} 거래를 취소했습니다.`, {
      tradeId: trade.id,
      teamId: trade.team_id,
      ticker: trade.ticker,
      action: trade.action,
      quantity: trade.quantity,
      price: trade.price,
      round: trade.round,
    });
    return { tradeId: trade.id, teamId: trade.team_id };
  });
}

const server = createServer(async (request, response) => {
  let origin = null;
  try {
    origin = corsOrigin(request);
    if (request.method === "OPTIONS") {
      setCommonHeaders(response, origin);
      response.statusCode = 204;
      response.end();
      return;
    }

    const pathname = new URL(request.url ?? "/", "http://localhost").pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (pathname === "/" || pathname === "/health")) {
      sendJson(response, 200, { ok: true, service: "Biology Exchange game server" }, origin);
      return;
    }

    if (pathname === "/api/auth" && request.method === "POST") {
      const body = await readJson(request);
      const id = String(body.id ?? "").trim();
      const password = String(body.password ?? "");
      let session = null;
      if (id === "staff" && safeEqualText(password, staffPassword)) session = { role: "staff", teamId: null, sessionVersion: null };
      if (id === "view" && safeEqualText(password, viewPassword)) session = { role: "view", teamId: null, sessionVersion: null };
      const teamId = Number(id);
      const teamExists = Number.isInteger(teamId) && teamId >= 1 && teamId <= maxTeamCount
        && db.prepare("SELECT 1 AS present FROM teams WHERE team_id = ?").get(teamId);
      if (/^\d{1,2}$/.test(id) && teamExists && safeEqualText(password, teamPassword)) {
        db.prepare("INSERT OR IGNORE INTO team_sessions (team_id, session_version, last_seen_at) VALUES (?, 0, NULL)").run(teamId);
        const sessionState = db.prepare("SELECT session_version FROM team_sessions WHERE team_id = ?").get(teamId);
        db.prepare("UPDATE team_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE team_id = ?").run(teamId);
        session = { role: "team", teamId, sessionVersion: sessionState.session_version };
      }
      if (!session) throw new HttpError(401, "아이디 또는 비밀번호가 올바르지 않습니다.");
      sendJson(response, 200, { session: publicSession(session), token: createSessionToken(session) }, origin);
      return;
    }

    if (pathname === "/api/auth" && request.method === "DELETE") {
      const logoutSession = readSession(request, { touch: false });
      if (logoutSession?.role === "team") forceLogoutTeam(logoutSession.teamId, { audit: false });
      sendJson(response, 200, { ok: true }, origin);
      return;
    }

    const session = readSession(request);
    if (!session) throw new HttpError(401, "로그인이 필요합니다.");

    if (pathname === "/api/auth" && request.method === "GET") {
      sendJson(response, 200, { session: publicSession(session) }, origin);
      return;
    }
    if (pathname === "/api/game" && request.method === "GET") {
      sendJson(response, 200, gameSnapshot(session), origin);
      return;
    }
    if (pathname === "/api/game/setup" && request.method === "POST") {
      if (session.role !== "staff") throw new HttpError(403, "스태프 권한이 필요합니다.");
      const body = await readJson(request);
      setupGame(body.seeds);
      sendJson(response, 200, { ok: true }, origin);
      return;
    }
    if (pathname === "/api/game/start" && request.method === "POST") {
      if (session.role !== "staff") throw new HttpError(403, "스태프 권한이 필요합니다.");
      sendJson(response, 200, startGame(), origin);
      return;
    }
    if (pathname === "/api/game/reset" && request.method === "POST") {
      if (session.role !== "staff") throw new HttpError(403, "스태프 권한이 필요합니다.");
      resetGame();
      sendJson(response, 200, { ok: true }, origin);
      return;
    }
    if (pathname === "/api/game/prices" && request.method === "POST") {
      if (session.role !== "staff") throw new HttpError(403, "스태프 권한이 필요합니다.");
      const body = await readJson(request);
      sendJson(response, 200, { ok: true, updated: updateFuturePrices(body.updates) }, origin);
      return;
    }
    if (pathname === "/api/game/force-logout" && request.method === "POST") {
      if (session.role !== "staff") throw new HttpError(403, "스태프 권한이 필요합니다.");
      const body = await readJson(request);
      const teamId = Number(body.teamId);
      forceLogoutTeam(teamId);
      sendJson(response, 200, { ok: true, teamId }, origin);
      return;
    }
    if (pathname === "/api/game/round" && request.method === "POST") {
      if (session.role !== "staff") throw new HttpError(403, "스태프 권한이 필요합니다.");
      sendJson(response, 200, { round: advanceRound() }, origin);
      return;
    }
    if (pathname === "/api/game/cancel-trade" && request.method === "POST") {
      if (session.role !== "staff") throw new HttpError(403, "스태프 권한이 필요합니다.");
      const result = cancelTrade(Number((await readJson(request)).tradeId));
      sendJson(response, 200, { ok: true, ...result }, origin);
      return;
    }
    if (pathname === "/api/game/trade" && request.method === "POST") {
      if (session.role !== "team") throw new HttpError(403, "조 계정으로 로그인해 주세요.");
      const result = executeTrade(session.teamId, await readJson(request));
      sendJson(response, 200, { ok: true, ...result }, origin);
      return;
    }

    throw new HttpError(404, "요청한 경로를 찾을 수 없습니다.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "게임 서버에서 오류가 발생했습니다.";
    if (!(error instanceof HttpError)) console.error(error);
    if (!response.headersSent) sendJson(response, status, { error: message }, origin);
    else response.end();
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Biology Exchange game server listening on 0.0.0.0:${port}`);
  console.log(`Database: ${databasePath}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
