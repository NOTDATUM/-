import { cookies } from "next/headers";
import { getRuntimeSecrets } from "./config";

export type GameSession = { role: "staff"; teamId: null } | { role: "team"; teamId: number };

const COOKIE_NAME = "be_game_session";

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sign(payload: string) {
  const { sessionSigningKey } = getRuntimeSecrets();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionSigningKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

export async function createSessionToken(session: GameSession) {
  const payload = session.role === "staff" ? "staff" : `team:${session.teamId}`;
  return `${payload}.${await sign(payload)}`;
}

export async function readSession(): Promise<GameSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const split = token.lastIndexOf(".");
  if (split < 0) return null;
  const payload = token.slice(0, split);
  const signature = token.slice(split + 1);
  if (signature !== await sign(payload)) return null;
  if (payload === "staff") return { role: "staff", teamId: null };
  const match = payload.match(/^team:(\d{1,2})$/);
  const teamId = match ? Number(match[1]) : 0;
  if (teamId < 1 || teamId > 12) return null;
  return { role: "team", teamId };
}

export async function setSession(session: GameSession) {
  const store = await cookies();
  store.set(COOKIE_NAME, await createSessionToken(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}
