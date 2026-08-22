import { ensureGameSchema, getGameDb } from "../../../../db/game";
import { adminAuditStatement } from "../../../lib/admin-audit";
import { readSession } from "../../../lib/session";

export async function POST() {
  const session = await readSession();
  if (!session || session.role !== "staff")
    return Response.json(
      { error: "스태프 권한이 필요합니다." },
      { status: 403 },
    );
  await ensureGameSchema();
  const db = getGameDb();
  const game = await db
    .prepare("SELECT started FROM game_state WHERE id = 1")
    .first<{ started: number }>();
  if (game?.started)
    return Response.json(
      { error: "이미 게임이 시작되었습니다." },
      { status: 409 },
    );
  await db.batch([
    db.prepare(
      "UPDATE game_state SET round = 0, started = 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
    ),
    adminAuditStatement("game_start", "게임을 시작했습니다.", { round: 0 }),
  ]);
  return Response.json({ round: 0, started: true });
}
