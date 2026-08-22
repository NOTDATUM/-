import { env } from "cloudflare:workers";
import gameData from "../shared/game-data.json";

export function getGameDb() {
  if (!env.DB) throw new Error("게임 데이터베이스가 연결되지 않았습니다.");
  return env.DB;
}

export async function ensureGameSchema() {
  const db = getGameDb();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS game_state (
      id INTEGER PRIMARY KEY,
      round INTEGER NOT NULL DEFAULT 0,
      started INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS teams (
      team_id INTEGER PRIMARY KEY,
      seed_money INTEGER NOT NULL DEFAULT 1000,
      cash INTEGER NOT NULL DEFAULT 1000
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS team_sessions (
      team_id INTEGER PRIMARY KEY,
      session_version INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS price_schedule (
      ticker TEXT NOT NULL,
      round INTEGER NOT NULL,
      price INTEGER,
      PRIMARY KEY (ticker, round)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS holdings (
      team_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      shares INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (team_id, ticker)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
      quantity INTEGER NOT NULL,
      price INTEGER NOT NULL,
      round INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      canceled_at TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS trades_team_id_idx ON trades (team_id, id DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL DEFAULT 'staff',
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs (id DESC)"),
  ]);

  const tradeColumns = await db.prepare("PRAGMA table_info(trades)").all<{ name: string }>();
  if (!tradeColumns.results.some((column) => column.name === "canceled_at")) {
    await db.prepare("ALTER TABLE trades ADD COLUMN canceled_at TEXT").run();
  }

  await db.prepare("INSERT OR IGNORE INTO game_state (id, round, started) VALUES (1, 0, 0)").run();
  const existing = await db.prepare("SELECT COUNT(*) AS count FROM teams").first<{ count: number }>();
  if (!existing?.count) {
    const seeds = [];
    for (let team = 1; team <= 12; team += 1) {
      seeds.push(db.prepare("INSERT INTO teams (team_id, seed_money, cash) VALUES (?, 1000, 1000)").bind(team));
    }
    await db.batch(seeds);
  }
  const teamRows = await db.prepare("SELECT team_id FROM teams").all<{ team_id: number }>();
  if (teamRows.results.length) {
    await db.batch(teamRows.results.map((team) => db.prepare(
      "INSERT OR IGNORE INTO team_sessions (team_id, session_version, last_seen_at) VALUES (?, 0, NULL)",
    ).bind(team.team_id)));
  }
  const priceCount = await db.prepare("SELECT COUNT(*) AS count FROM price_schedule").first<{ count: number }>();
  if (!priceCount?.count) {
    const prices = [];
    for (const stock of gameData.stocks) {
      stock.prices.forEach((price, round) => {
        prices.push(db.prepare("INSERT INTO price_schedule (ticker, round, price) VALUES (?, ?, ?)").bind(stock.ticker, round, price));
      });
    }
    await db.batch(prices);
  }
}
