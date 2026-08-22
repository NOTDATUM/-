import { env } from "cloudflare:workers";

type GameRuntimeEnv = {
  TEAM_PASSWORD?: string;
  STAFF_PASSWORD?: string;
  VIEW_PASSWORD?: string;
  SESSION_SIGNING_KEY?: string;
};

export function getRuntimeSecrets() {
  const runtime = env as unknown as GameRuntimeEnv;
  if (
    !runtime.TEAM_PASSWORD ||
    !runtime.STAFF_PASSWORD ||
    !runtime.SESSION_SIGNING_KEY
  ) {
    throw new Error("게임 로그인 설정이 연결되지 않았습니다.");
  }
  return {
    teamPassword: runtime.TEAM_PASSWORD,
    staffPassword: runtime.STAFF_PASSWORD,
    viewPassword: runtime.VIEW_PASSWORD || runtime.STAFF_PASSWORD,
    sessionSigningKey: runtime.SESSION_SIGNING_KEY,
  };
}
