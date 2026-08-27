import { DatabaseSync } from "node:sqlite";

const tickerRenames = [
  {
    from: "VIRO",
    to: "CBLS",
    textReplacements: [
      ["바이로베리타스", "큐비오랩스"],
      ["바이오베리타스", "큐비오랩스"],
      ["ViroVeritas", "Cubio Labs"],
    ],
  },
  {
    from: "SYNP",
    to: "MCAT",
    textReplacements: [
      ["시냅스코어", "메디코호트"],
      ["SynapseCore", "MediCohort"],
    ],
  },
  {
    from: "CELL",
    to: "BRTE",
    textReplacements: [
      ["셀바이오제닉스", "블루루트"],
      ["CellBiogenics", "BlueRoot"],
    ],
  },
];

const schema = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS game_state (
    id INTEGER PRIMARY KEY,
    round INTEGER NOT NULL DEFAULT 0,
    started INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;
  CREATE TABLE IF NOT EXISTS teams (
    team_id INTEGER PRIMARY KEY,
    seed_money INTEGER NOT NULL DEFAULT 1000,
    cash INTEGER NOT NULL DEFAULT 1000,
    hint_coins INTEGER NOT NULL DEFAULT 0
  ) STRICT;
  CREATE TABLE IF NOT EXISTS team_sessions (
    team_id INTEGER PRIMARY KEY,
    session_version INTEGER NOT NULL DEFAULT 0,
    last_seen_at TEXT
  ) STRICT;
  CREATE TABLE IF NOT EXISTS price_schedule (
    ticker TEXT NOT NULL,
    round INTEGER NOT NULL,
    price INTEGER,
    PRIMARY KEY (ticker, round)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS holdings (
    team_id INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    shares INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (team_id, ticker),
    FOREIGN KEY (team_id) REFERENCES teams(team_id)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
    quantity INTEGER NOT NULL,
    price INTEGER NOT NULL,
    round INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    canceled_at TEXT,
    FOREIGN KEY (team_id) REFERENCES teams(team_id)
  ) STRICT;
  CREATE INDEX IF NOT EXISTS trades_team_id_idx ON trades (team_id, id DESC);
  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL DEFAULT 'staff',
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;
  CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs (id DESC);
  INSERT OR IGNORE INTO game_state (id, round, started) VALUES (1, 0, 0);
`;

function migrateLegacyDatabase(db) {
  const tradeColumns = db.prepare("PRAGMA table_info(trades)").all();
  if (!tradeColumns.some((column) => column.name === "canceled_at")) {
    db.exec("ALTER TABLE trades ADD COLUMN canceled_at TEXT");
  }
  const teamColumns = db.prepare("PRAGMA table_info(teams)").all();
  if (!teamColumns.some((column) => column.name === "hint_coins")) {
    db.exec(
      "ALTER TABLE teams ADD COLUMN hint_coins INTEGER NOT NULL DEFAULT 0",
    );
  }
}

function replaceAuditLogText(db, from, to) {
  db.prepare(
    "UPDATE admin_audit_logs SET summary = replace(summary, ?, ?) WHERE instr(summary, ?) > 0",
  ).run(from, to, from);
  db.prepare(
    "UPDATE admin_audit_logs SET details = replace(details, ?, ?) WHERE details IS NOT NULL AND instr(details, ?) > 0",
  ).run(from, to, from);
}

function migrateRenamedTickers(db) {
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const rename of tickerRenames) {
      const oldPriceCount = db
        .prepare(
          "SELECT COUNT(*) AS count FROM price_schedule WHERE ticker = ?",
        )
        .get(rename.from).count;
      if (oldPriceCount > 0) {
        db.prepare("DELETE FROM price_schedule WHERE ticker = ?").run(
          rename.to,
        );
        db.prepare(
          "UPDATE price_schedule SET ticker = ? WHERE ticker = ?",
        ).run(rename.to, rename.from);
      }

      const oldHoldings = db
        .prepare(
          "SELECT team_id, shares FROM holdings WHERE ticker = ? ORDER BY team_id",
        )
        .all(rename.from);
      for (const holding of oldHoldings) {
        const target = db
          .prepare(
            "SELECT shares FROM holdings WHERE team_id = ? AND ticker = ?",
          )
          .get(holding.team_id, rename.to);
        if (target) {
          db.prepare(
            "UPDATE holdings SET shares = ? WHERE team_id = ? AND ticker = ?",
          ).run(target.shares + holding.shares, holding.team_id, rename.to);
          db.prepare(
            "DELETE FROM holdings WHERE team_id = ? AND ticker = ?",
          ).run(holding.team_id, rename.from);
        } else {
          db.prepare(
            "UPDATE holdings SET ticker = ? WHERE team_id = ? AND ticker = ?",
          ).run(rename.to, holding.team_id, rename.from);
        }
      }

      db.prepare("UPDATE trades SET ticker = ? WHERE ticker = ?").run(
        rename.to,
        rename.from,
      );
      replaceAuditLogText(db, rename.from, rename.to);
      for (const [from, to] of rename.textReplacements) {
        replaceAuditLogText(db, from, to);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function seedTeams(db, defaultTeamCount) {
  const configuredTeamCount = db
    .prepare("SELECT COUNT(*) AS count FROM teams")
    .get().count;
  if (configuredTeamCount === 0) {
    const insertTeam = db.prepare(
      "INSERT OR IGNORE INTO teams (team_id, seed_money, cash) VALUES (?, 1000, 1000)",
    );
    for (let teamId = 1; teamId <= defaultTeamCount; teamId += 1) {
      insertTeam.run(teamId);
    }
  }

  const insertSession = db.prepare(
    "INSERT OR IGNORE INTO team_sessions (team_id, session_version, last_seen_at) VALUES (?, 0, NULL)",
  );
  for (const team of db.prepare("SELECT team_id FROM teams").all()) {
    insertSession.run(team.team_id);
  }
}

function seedPrices(db, stocks) {
  const configuredPriceCount = db
    .prepare("SELECT COUNT(*) AS count FROM price_schedule")
    .get().count;
  const expectedPriceCount = stocks.reduce(
    (count, stock) => count + stock.prices.length,
    0,
  );
  if (configuredPriceCount === expectedPriceCount) return;

  db.prepare("DELETE FROM price_schedule").run();

  const insertPrice = db.prepare(
    "INSERT INTO price_schedule (ticker, round, price) VALUES (?, ?, ?)",
  );
  for (const stock of stocks) {
    stock.prices.forEach((price, round) =>
      insertPrice.run(stock.ticker, round, price),
    );
  }
  const lastRound = Math.max(...stocks.map((stock) => stock.prices.length - 1));
  db.prepare("UPDATE game_state SET round = ? WHERE round > ?").run(
    lastRound,
    lastRound,
  );
}

export function openGameDatabase({ databasePath, stocks, defaultTeamCount }) {
  const db = new DatabaseSync(databasePath);
  db.exec(schema);
  migrateLegacyDatabase(db);
  migrateRenamedTickers(db);
  seedTeams(db, defaultTeamCount);
  seedPrices(db, stocks);
  return db;
}
