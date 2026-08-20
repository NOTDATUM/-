import { ensureGameSchema, getGameDb } from "../../../../db/game";
import { readSession } from "../../../lib/session";

const DEFAULT_SEED_MONEY = 1000;

export async function POST() {
  const session = await readSession();
  if (!session || session.role !== "staff") return Response.json({ error: "스태프 권한이 필요합니다." }, { status: 403 });
  await ensureGameSchema();
  const db = getGameDb();
  await db.batch([
    db.prepare("DELETE FROM holdings"),
    db.prepare("DELETE FROM trades"),
    db.prepare("UPDATE teams SET seed_money = ?, cash = ?").bind(DEFAULT_SEED_MONEY, DEFAULT_SEED_MONEY),
    db.prepare("UPDATE game_state SET round = 0, started = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 1"),
  ]);
  return Response.json({ ok: true });
}
