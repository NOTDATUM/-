import { ensureGameSchema, getGameDb } from "../../../../db/game";
import { readSession } from "../../../lib/session";
import gameData from "../../../../shared/game-data.json";

const DEFAULT_SEED_MONEY = 1000;

export async function POST() {
  const session = await readSession();
  if (!session || session.role !== "staff") return Response.json({ error: "스태프 권한이 필요합니다." }, { status: 403 });
  await ensureGameSchema();
  const db = getGameDb();
  const statements = [
    db.prepare("DELETE FROM holdings"),
    db.prepare("DELETE FROM trades"),
    db.prepare("DELETE FROM price_schedule"),
    db.prepare("UPDATE teams SET seed_money = ?, cash = ?").bind(DEFAULT_SEED_MONEY, DEFAULT_SEED_MONEY),
    db.prepare("UPDATE game_state SET round = 0, started = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 1"),
  ];
  for (const stock of gameData.stocks) {
    stock.prices.forEach((price, round) => {
      statements.push(db.prepare("INSERT INTO price_schedule (ticker, round, price) VALUES (?, ?, ?)").bind(stock.ticker, round, price));
    });
  }
  await db.batch(statements);
  return Response.json({ ok: true });
}
