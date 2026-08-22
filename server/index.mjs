import { createServer } from "node:http";
import { loadGameData, loadServerConfig } from "./config.mjs";
import { openGameDatabase } from "./database.mjs";
import { createGameService } from "./game-service.mjs";
import { createHttpHelpers } from "./http.mjs";
import { createRequestHandler } from "./router.mjs";
import { createSessionService } from "./session-service.mjs";

const DEFAULT_SEED_MONEY = 1000;
const DEFAULT_TEAM_COUNT = 12;
const MAX_TEAM_COUNT = 30;

const gameData = loadGameData();
const { stocks, lastRound } = gameData;
const config = loadServerConfig();
const db = openGameDatabase({
  databasePath: config.databasePath,
  stocks,
  defaultTeamCount: DEFAULT_TEAM_COUNT,
});
const sessions = createSessionService({
  db,
  signingKey: config.signingKey,
  maxTeamCount: MAX_TEAM_COUNT,
  teamPassword: config.teamPassword,
  staffPassword: config.staffPassword,
  viewPassword: config.viewPassword,
});
const game = createGameService({
  db,
  stocks,
  lastRound,
  defaultSeedMoney: DEFAULT_SEED_MONEY,
  maxTeamCount: MAX_TEAM_COUNT,
  publicSession: sessions.publicSession,
});
const http = createHttpHelpers(config.allowedOrigins);
const server = createServer(createRequestHandler({ http, sessions, game }));

server.listen(config.port, "0.0.0.0", () => {
  console.log(
    `Biology Exchange game server listening on 0.0.0.0:${config.port}`,
  );
  console.log(`Database: ${config.databasePath}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
