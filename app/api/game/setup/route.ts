import { ensureGameSchema, getGameDb } from "../../../../db/game";
import { readSession } from "../../../lib/session";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "staff") return Response.json({ error: "스태프 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as { seeds?: number[] };
  const seeds = body.seeds;
  if (!Array.isArray(seeds) || seeds.length < 1 || seeds.length > 30 || seeds.some((value) => !Number.isInteger(value) || value < 1 || value > 100000000)) {
    return Response.json({ error: "1개 이상 30개 이하의 조와 올바른 시드머니를 입력해 주세요." }, { status: 400 });
  }
  await ensureGameSchema();
  const db = getGameDb();
  const statements = [
    db.prepare("DELETE FROM holdings"),
    db.prepare("DELETE FROM trades"),
    db.prepare("DELETE FROM teams"),
    db.prepare("UPDATE game_state SET round = 0, started = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 1"),
  ];
  seeds.forEach((seed, index) => statements.push(db.prepare("INSERT INTO teams (team_id, seed_money, cash) VALUES (?, ?, ?)").bind(index + 1, seed, seed)));
  await db.batch(statements);
  return Response.json({ ok: true });
}
