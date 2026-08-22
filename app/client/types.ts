import type { PriceSchedule } from "../game-data";

export type Session =
  | { role: "staff" | "view"; teamId: null }
  | { role: "team"; teamId: number };

export type Trade = {
  id: number;
  team_id: number;
  ticker: string;
  action: "buy" | "sell";
  quantity: number;
  price: number;
  round: number;
  created_at: string;
  canceled_at?: string | null;
};

export type TeamView = {
  teamId: number;
  seedMoney: number;
  cash: number;
  totalAsset: number;
  holdings: Record<string, number>;
  trades: Trade[];
  online?: boolean;
  lastSeenAt?: string | null;
};

export type ViewTeamPerformance = {
  teamId: number;
  returnRate: number;
};

export type AdminAuditLog = {
  id: number;
  actor: string;
  action: string;
  summary: string;
  details: unknown;
  createdAt: string;
};

export type Snapshot = {
  session: Session;
  game: { round: number; started: boolean; updatedAt: string };
  market: { prices: PriceSchedule };
  team: TeamView | null;
  teams: Array<TeamView | ViewTeamPerformance> | null;
  auditLogs?: AdminAuditLog[] | null;
};

export type ClientTheme = "dark" | "light";
export type ClientChartMode = "all" | "single";

export function isTeamView(
  team: TeamView | ViewTeamPerformance,
): team is TeamView {
  return "cash" in team;
}

export function isViewTeamPerformance(
  team: TeamView | ViewTeamPerformance,
): team is ViewTeamPerformance {
  return "returnRate" in team;
}
