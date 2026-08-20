import { ensureGameSchema, getGameDb } from "../../../../db/game";
import { LAST_ROUND, stocks } from "../../../game-data";
import { readSession } from "../../../lib/session";

type PriceUpdate = { ticker?: string; round?: number; price?: number | null };

export async function POST(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "staff") return Response.json({ error: "스태프 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as { updates?: PriceUpdate[] };
  if (!Array.isArray(body.updates) || body.updates.length < 1 || body.updates.length > stocks.length * (LAST_ROUND + 1)) {
    return Response.json({ error: "수정할 주가를 다시 확인해 주세요." }, { status: 400 });
  }
  await ensureGameSchema();
  const db = getGameDb();
  const game = await db.prepare("SELECT round, started FROM game_state WHERE id = 1").first<{ round: number; started: number }>();
  if (!game) return Response.json({ error: "게임 상태를 불러오지 못했습니다." }, { status: 500 });
  const firstEditableRound = game.started ? game.round + 1 : 0;
  const updates = body.updates.map((item) => {
    const ticker = String(item.ticker ?? "");
    const round = Number(item.round);
    const price = item.price === null ? null : Number(item.price);
    return { ticker, round, price };
  });
  if (updates.some((item) => !stocks.some((stock) => stock.ticker === item.ticker)
    || !Number.isInteger(item.round) || item.round < firstEditableRound || item.round > LAST_ROUND
    || (item.price !== null && (!Number.isInteger(item.price) || item.price < 1 || item.price > 100_000_000)))) {
    return Response.json({ error: "진행되지 않은 라운드의 올바른 주가만 수정할 수 있습니다." }, { status: 400 });
  }
  await db.batch([
    ...updates.map((item) => db.prepare("UPDATE price_schedule SET price = ? WHERE ticker = ? AND round = ?").bind(item.price, item.ticker, item.round)),
    db.prepare("UPDATE game_state SET updated_at = CURRENT_TIMESTAMP WHERE id = 1"),
  ]);
  return Response.json({ ok: true, updated: updates.length });
}
