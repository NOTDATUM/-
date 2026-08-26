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

  const body = (await request.json()) as {
    teamId?: number;
    hintCoins?: number;
  };
  const teamId = Number(body.teamId);
  const hintCoins = Number(body.hintCoins);
  if (
    !Number.isInteger(teamId) ||
    !Number.isInteger(hintCoins) ||
    hintCoins < 0 ||
    hintCoins > 1_000_000_000
  ) {
    return Response.json(
      { error: "힌트코인 수량을 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  await ensureGameSchema();
  const db = getGameDb();
  const team = await db
    .prepare("SELECT hint_coins FROM teams WHERE team_id = ?")
    .bind(teamId)
    .first<{ hint_coins: number }>();
  if (!team) {
    return Response.json(
      { error: "해당 조를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  await db.batch([
    db
      .prepare("UPDATE teams SET hint_coins = ? WHERE team_id = ?")
      .bind(hintCoins, teamId),
    db.prepare(
      "UPDATE game_state SET updated_at = CURRENT_TIMESTAMP WHERE id = 1",
    ),
    adminAuditStatement(
      "hint_coins_update",
      `${teamId}조 힌트코인을 ${hintCoins}개로 변경했습니다.`,
      {
        teamId,
        previousHintCoins: team.hint_coins,
        hintCoins,
        delta: hintCoins - team.hint_coins,
      },
    ),
  ]);
  return Response.json({ ok: true, teamId, hintCoins });
}
