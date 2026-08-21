import { clearSession, publicGameSession, readSession, setSession, type GameSession } from "../../lib/session";
import { getRuntimeSecrets } from "../../lib/config";
import { ensureGameSchema, getGameDb } from "../../../db/game";

export async function GET() {
  const session = await readSession();
  return session ? Response.json({ session: publicGameSession(session) }) : Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
}

export async function POST(request: Request) {
  const body = await request.json() as { id?: string; password?: string };
  const id = String(body.id ?? "").trim();
  const password = String(body.password ?? "");
  const { staffPassword, teamPassword } = getRuntimeSecrets();
  if (id === "staff" && password === staffPassword) {
    const session: GameSession = { role: "staff", teamId: null, sessionVersion: null };
    await setSession(session, request);
    return Response.json({ session: publicGameSession(session) });
  }
  const teamId = Number(id);
  await ensureGameSchema();
  const configuredTeam = Number.isInteger(teamId) && teamId >= 1 && teamId <= 30
    ? await getGameDb().prepare("SELECT 1 AS present FROM teams WHERE team_id = ?").bind(teamId).first()
    : null;
  if (/^\d{1,2}$/.test(id) && configuredTeam && password === teamPassword) {
    const db = getGameDb();
    await db.prepare("INSERT OR IGNORE INTO team_sessions (team_id, session_version, last_seen_at) VALUES (?, 0, NULL)").bind(teamId).run();
    const sessionRow = await db.prepare("SELECT session_version FROM team_sessions WHERE team_id = ?").bind(teamId).first<{ session_version: number }>();
    if (!sessionRow) return Response.json({ error: "로그인 상태를 만들지 못했습니다." }, { status: 500 });
    await db.prepare("UPDATE team_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE team_id = ?").bind(teamId).run();
    const session: GameSession = { role: "team", teamId, sessionVersion: sessionRow.session_version };
    await setSession(session, request);
    return Response.json({ session: publicGameSession(session) });
  }
  return Response.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
}

export async function DELETE(request: Request) {
  const session = await readSession();
  if (session?.role === "team") {
    await getGameDb().prepare("UPDATE team_sessions SET session_version = session_version + 1, last_seen_at = NULL WHERE team_id = ?").bind(session.teamId).run();
  }
  await clearSession(request);
  return Response.json({ ok: true });
}
