import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = dirname(fileURLToPath(import.meta.url));
const defaultOrigins =
  "https://notdatum.github.io,http://localhost:4173,http://localhost:5173,http://localhost:3000";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경 변수가 필요합니다.`);
  return value;
}

function parsePort() {
  const port = Number(process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT가 올바르지 않습니다.");
  }
  return port;
}

function parseAllowedOrigins() {
  return new Set(
    (process.env.ALLOWED_ORIGINS ?? defaultOrigins)
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

export function loadServerConfig() {
  const teamPassword = requiredEnv("TEAM_PASSWORD");
  const staffPassword = requiredEnv("STAFF_PASSWORD");
  const viewPassword = process.env.VIEW_PASSWORD?.trim() || "12345678";
  const signingKey = requiredEnv("SESSION_SIGNING_KEY");
  if (signingKey.length < 32) {
    throw new Error("SESSION_SIGNING_KEY는 32자 이상이어야 합니다.");
  }

  const port = parsePort();
  const allowedOrigins = parseAllowedOrigins();
  const dataDir = process.env.DATA_DIR?.trim() || resolve(serverDir, "data");
  const databasePath =
    process.env.DB_PATH?.trim() || resolve(dataDir, "be-game.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });

  return {
    port,
    allowedOrigins,
    databasePath,
    teamPassword,
    staffPassword,
    viewPassword,
    signingKey,
  };
}

export function loadGameData() {
  return JSON.parse(
    readFileSync(resolve(serverDir, "../shared/game-data.json"), "utf8"),
  );
}
