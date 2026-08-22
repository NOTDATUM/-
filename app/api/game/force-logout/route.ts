import { ensureGameSchema, getGameDb } from "../../../../db/game";
import { adminAuditStatement } from "../../../lib/admin-audit";
import { readSession } from "../../../lib/session";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "staff") {
    return Response.json(
      { error: "스태프 권한이 필요합니다." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as { teamId?: number };
  const teamId = Number(body.teamId);
  if (!Number.isInteger(teamId) || teamId < 1 || teamId > 30) {
    return Response.json(
      { error: "로그아웃할 조를 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  await ensureGameSchema();
  const db = getGameDb();
  const team = await db
    .prepare("SELECT 1 AS present FROM teams WHERE team_id = ?")
    .bind(teamId)
    .first();
  if (!team)
    return Response.json({ error: "존재하지 않는 조입니다." }, { status: 404 });

  await db.batch([
    db
      .prepare(
        "UPDATE team_sessions SET session_version = session_version + 1, last_seen_at = NULL WHERE team_id = ?",
      )
      .bind(teamId),
    adminAuditStatement(
      "force_logout",
      `${teamId}조를 강제 로그아웃했습니다.`,
      { teamId },
    ),
  ]);
  return Response.json({ ok: true, teamId });
}
