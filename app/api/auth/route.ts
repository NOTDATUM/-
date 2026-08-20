import { clearSession, readSession, setSession } from "../../lib/session";
import { getRuntimeSecrets } from "../../lib/config";

export async function GET() {
  const session = await readSession();
  return session ? Response.json({ session }) : Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
}

export async function POST(request: Request) {
  const body = await request.json() as { id?: string; password?: string };
  const id = String(body.id ?? "").trim();
  const password = String(body.password ?? "");
  const { staffPassword, teamPassword } = getRuntimeSecrets();
  if (id === "staff" && password === staffPassword) {
    const session = { role: "staff" as const, teamId: null };
    await setSession(session, request);
    return Response.json({ session });
  }
  const teamId = Number(id);
  if (/^\d{1,2}$/.test(id) && teamId >= 1 && teamId <= 12 && password === teamPassword) {
    const session = { role: "team" as const, teamId };
    await setSession(session, request);
    return Response.json({ session });
  }
  return Response.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
}

export async function DELETE(request: Request) {
  await clearSession(request);
  return Response.json({ ok: true });
}
