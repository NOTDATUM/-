import { LAST_ROUND, getStockPrice, isStockTradable, stocks } from "./game-data";

const TOKEN_KEY = "be_game_session_token";
const SESSION_KEY = "be_game_static_session";
const GAME_KEY = "be_game_static_state_v1";

type Session = { role: "staff"; teamId: null } | { role: "team"; teamId: number };
type StaticTrade = {
  id: number;
  team_id: number;
  ticker: string;
  action: "buy" | "sell";
  quantity: number;
  price: number;
  round: number;
  created_at: string;
};
type StaticTeam = {
  teamId: number;
  seedMoney: number;
  cash: number;
  holdings: Record<string, number>;
};
type StaticGame = {
  round: number;
  started: boolean;
  updatedAt: string;
  nextTradeId: number;
  teams: StaticTeam[];
  trades: StaticTrade[];
};

declare global {
  interface Window {
    __BE_API_URL__?: string;
    __BE_STATIC_MODE__?: boolean;
  }
}

function initialGame(): StaticGame {
  return {
    round: 0,
    started: false,
    updatedAt: new Date().toISOString(),
    nextTradeId: 1,
    teams: Array.from({ length: 12 }, (_, index) => ({
      teamId: index + 1,
      seedMoney: 1000,
      cash: 1000,
      holdings: {},
    })),
    trades: [],
  };
}

function readGame() {
  const saved = window.localStorage.getItem(GAME_KEY);
  if (!saved) {
    const game = initialGame();
    window.localStorage.setItem(GAME_KEY, JSON.stringify(game));
    return game;
  }
  try {
    const game = JSON.parse(saved) as StaticGame;
    if (!Array.isArray(game.teams) || game.teams.length !== 12) throw new Error("invalid game");
    return game;
  } catch {
    const game = initialGame();
    window.localStorage.setItem(GAME_KEY, JSON.stringify(game));
    return game;
  }
}

function writeGame(game: StaticGame) {
  game.updatedAt = new Date().toISOString();
  window.localStorage.setItem(GAME_KEY, JSON.stringify(game));
}

function readSession(): Session | null {
  const saved = window.sessionStorage.getItem(SESSION_KEY);
  if (!saved) return null;
  try {
    const session = JSON.parse(saved) as Session;
    if (session.role === "staff" && session.teamId === null) return session;
    if (session.role === "team" && session.teamId >= 1 && session.teamId <= 12) return session;
  } catch {
    return null;
  }
  return null;
}

function apiResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function parseBody(init: RequestInit) {
  if (typeof init.body !== "string") return {};
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function snapshot(game: StaticGame, session: Session) {
  const teams = game.teams.map((team) => {
    const stockValue = Object.entries(team.holdings).reduce(
      (sum, [ticker, shares]) => sum + shares * (getStockPrice(ticker, game.round) ?? 0),
      0,
    );
    return {
      ...team,
      totalAsset: team.cash + stockValue,
      trades: game.trades.filter((trade) => trade.team_id === team.teamId),
    };
  });
  return {
    session,
    game: { round: game.round, started: game.started, updatedAt: game.updatedAt },
    team: session.role === "team" ? teams.find((team) => team.teamId === session.teamId) ?? null : null,
    teams: session.role === "staff" ? teams : null,
  };
}

async function staticApiFetch(path: string, init: RequestInit) {
  const method = (init.method ?? "GET").toUpperCase();
  if (path === "/api/auth" && method === "POST") {
    const body = parseBody(init);
    const id = String(body.id ?? "").trim();
    const password = String(body.password ?? "");
    let session: Session | null = null;
    if (id === "staff" && password === "12345678") session = { role: "staff", teamId: null };
    const teamId = Number(id);
    if (/^\d{1,2}$/.test(id) && teamId >= 1 && teamId <= 12 && password === "donghaeng") {
      session = { role: "team", teamId };
    }
    if (!session) return apiResponse({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401);
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return apiResponse({ session });
  }
  if (path === "/api/auth" && method === "DELETE") {
    window.sessionStorage.removeItem(SESSION_KEY);
    return apiResponse({ ok: true });
  }
  const session = readSession();
  if (!session) return apiResponse({ error: "로그인이 필요합니다." }, 401);
  const game = readGame();
  if (path === "/api/game" && method === "GET") return apiResponse(snapshot(game, session));
  if (path === "/api/game/setup" && method === "POST") {
    if (session.role !== "staff") return apiResponse({ error: "스태프 권한이 필요합니다." }, 403);
    const seeds = parseBody(init).seeds;
    if (!Array.isArray(seeds) || seeds.length !== 12 || seeds.some((value) => !Number.isInteger(value) || Number(value) < 1 || Number(value) > 100000000)) {
      return apiResponse({ error: "1조부터 12조까지 올바른 시드머니를 입력해 주세요." }, 400);
    }
    game.round = 0;
    game.started = true;
    game.nextTradeId = 1;
    game.trades = [];
    game.teams = seeds.map((seed, index) => ({
      teamId: index + 1,
      seedMoney: Number(seed),
      cash: Number(seed),
      holdings: {},
    }));
    writeGame(game);
    return apiResponse({ ok: true });
  }
  if (path === "/api/game/round" && method === "POST") {
    if (session.role !== "staff") return apiResponse({ error: "스태프 권한이 필요합니다." }, 403);
    if (!game.started) return apiResponse({ error: "먼저 시드머니를 설정해 게임을 시작해 주세요." }, 400);
    if (game.round >= LAST_ROUND) return apiResponse({ error: "모든 라운드가 종료되었습니다." }, 400);
    game.round += 1;
    writeGame(game);
    return apiResponse({ round: game.round });
  }
  if (path === "/api/game/trade" && method === "POST") {
    if (session.role !== "team") return apiResponse({ error: "조 계정으로 로그인해 주세요." }, 403);
    const body = parseBody(init);
    const ticker = String(body.ticker ?? "");
    const action = body.action;
    const quantity = Number(body.quantity);
    if (!stocks.some((stock) => stock.ticker === ticker) || (action !== "buy" && action !== "sell") || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000000) {
      return apiResponse({ error: "주문 내용을 다시 확인해 주세요." }, 400);
    }
    if (!game.started) return apiResponse({ error: "아직 게임이 시작되지 않았습니다." }, 400);
    if (!isStockTradable(ticker, game.round)) return apiResponse({ error: "현재 거래할 수 없는 종목입니다." }, 400);
    const price = getStockPrice(ticker, game.round);
    if (price === null) return apiResponse({ error: "현재 가격이 없습니다." }, 400);
    const team = game.teams.find((item) => item.teamId === session.teamId)!;
    const shares = team.holdings[ticker] ?? 0;
    const total = price * quantity;
    if (action === "buy" && team.cash < total) return apiResponse({ error: "보유 BE Coin이 부족합니다." }, 400);
    if (action === "sell" && shares < quantity) return apiResponse({ error: "보유한 수량보다 많이 팔 수 없습니다." }, 400);
    team.cash += action === "buy" ? -total : total;
    team.holdings[ticker] = shares + (action === "buy" ? quantity : -quantity);
    game.trades.unshift({
      id: game.nextTradeId,
      team_id: session.teamId,
      ticker,
      action,
      quantity,
      price,
      round: game.round,
      created_at: new Date().toISOString(),
    });
    game.nextTradeId += 1;
    writeGame(game);
    return apiResponse({ ok: true, price, quantity, action });
  }
  return apiResponse({ error: "요청한 경로를 찾을 수 없습니다." }, 404);
}

function getApiBase() {
  if (typeof window === "undefined") return "";
  return (window.__BE_API_URL__ ?? "").replace(/\/$/, "");
}

export function setApiSessionToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearApiSessionToken() {
  if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY);
}

export function apiFetch(path: string, init: RequestInit = {}) {
  if (typeof window !== "undefined" && window.__BE_STATIC_MODE__) return staticApiFetch(path, init);
  const base = getApiBase();
  const headers = new Headers(init.headers);
  if (base) {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(`${base}${path}`, { ...init, headers, credentials: base ? "omit" : init.credentials });
}
