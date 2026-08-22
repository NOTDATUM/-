import { cookies } from "next/headers";
import { getRuntimeSecrets } from "./config";
import { ensureGameSchema, getGameDb } from "../../db/game";

export type GameSession =
  | { role: "staff" | "view"; teamId: null; sessionVersion: null }
  | { role: "team"; teamId: number; sessionVersion: number };
export type PublicGameSession =
  | { role: "staff" | "view"; teamId: null }
  | { role: "team"; teamId: number };

const COOKIE_NAME = "be_game_session";

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(payload: string) {
  const { sessionSigningKey } = getRuntimeSecrets();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSigningKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
}

export async function createSessionToken(session: GameSession) {
  const payload =
    session.role === "team"
      ? `team:${session.teamId}:${session.sessionVersion}`
      : session.role;
  return `${payload}.${await sign(payload)}`;
}

export function publicGameSession(session: GameSession): PublicGameSession {
  return session.role === "team"
    ? { role: "team", teamId: session.teamId }
    : { role: session.role, teamId: null };
}

export async function readSession(): Promise<GameSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const split = token.lastIndexOf(".");
  if (split < 0) return null;
  const payload = token.slice(0, split);
  const signature = token.slice(split + 1);
  if (signature !== (await sign(payload))) return null;
  if (payload === "staff")
    return { role: "staff", teamId: null, sessionVersion: null };
  if (payload === "view")
    return { role: "view", teamId: null, sessionVersion: null };
  const match = payload.match(/^team:(\d{1,2}):(\d+)$/);
  const teamId = match ? Number(match[1]) : 0;
  const sessionVersion = match ? Number(match[2]) : -1;
  if (
    teamId < 1 ||
    teamId > 30 ||
    !Number.isInteger(sessionVersion) ||
    sessionVersion < 0
  )
    return null;
  await ensureGameSchema();
  const db = getGameDb();
  const current = await db
    .prepare(
      `SELECT ts.session_version
    FROM team_sessions ts INNER JOIN teams t ON t.team_id = ts.team_id
    WHERE ts.team_id = ?`,
    )
    .bind(teamId)
    .first<{ session_version: number }>();
  if (!current || current.session_version !== sessionVersion) return null;
  await db
    .prepare(
      "UPDATE team_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE team_id = ?",
    )
    .bind(teamId)
    .run();
  return { role: "team", teamId, sessionVersion };
}

function isSecureRequest(request: Request) {
  return new URL(request.url).protocol === "https:";
}

export async function setSession(session: GameSession, request: Request) {
  const store = await cookies();
  store.set(COOKIE_NAME, await createSessionToken(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSession(request: Request) {
  const store = await cookies();
  store.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: 0,
  });
}
