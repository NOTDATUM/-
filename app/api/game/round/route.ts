import { ensureGameSchema, getGameDb } from "../../../../db/game";
import { LAST_ROUND } from "../../../game-data";
import { adminAuditStatement } from "../../../lib/admin-audit";
import { readSession } from "../../../lib/session";

export async function POST() {
  const session = await readSession();
  if (!session || session.role !== "staff") return Response.json({ error: "스태프 권한이 필요합니다." }, { status: 403 });
  await ensureGameSchema();
  const db = getGameDb();
  const game = await db.prepare("SELECT round, started FROM game_state WHERE id = 1").first<{ round: number; started: number }>();
  if (!game?.started) return Response.json({ error: "먼저 시드머니를 설정해 게임을 시작해 주세요." }, { status: 400 });
  if (game.round >= LAST_ROUND) return Response.json({ error: "모든 라운드가 종료되었습니다." }, { status: 400 });
  const nextRound = game.round + 1;
  await db.batch([
    db.prepare("UPDATE game_state SET round = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1").bind(nextRound),
    adminAuditStatement("round_advance", `${nextRound}라운드를 공개했습니다.`, { previousRound: game.round, round: nextRound }),
  ]);
  return Response.json({ round: nextRound });
}
