import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const gameState = sqliteTable("game_state", {
  id: integer("id").primaryKey(),
  round: integer("round").notNull().default(0),
  started: integer("started").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const teams = sqliteTable("teams", {
  teamId: integer("team_id").primaryKey(),
  seedMoney: integer("seed_money").notNull().default(1000),
  cash: integer("cash").notNull().default(1000),
});

export const holdings = sqliteTable("holdings", {
  teamId: integer("team_id").notNull(),
  ticker: text("ticker").notNull(),
  shares: integer("shares").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.teamId, table.ticker] })]);

export const trades = sqliteTable("trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull(),
  ticker: text("ticker").notNull(),
  action: text("action", { enum: ["buy", "sell"] }).notNull(),
  quantity: integer("quantity").notNull(),
  price: integer("price").notNull(),
  round: integer("round").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
