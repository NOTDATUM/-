import { ensureGameSchema, getGameDb } from "../../../db/game";
import { LAST_ROUND, getStockPrice, stocks, type PriceSchedule } from "../../game-data";
import { publicGameSession, readSession } from "../../lib/session";

type TeamRow = { team_id: number; seed_money: number; cash: number };
type HoldingRow = { team_id: number; ticker: string; shares: number };
type TradeRow = { id: number; team_id: number; ticker: string; action: "buy" | "sell"; quantity: number; price: number; round: number; created_at: string };
type PriceRow = { ticker: string; round: number; price: number | null };
type PresenceRow = { team_id: number; last_seen_at: string | null; online: number };

export async function GET() {
  const session = await readSession();
  if (!session) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  await ensureGameSchema();
  const db = getGameDb();
  const [gameResult, teamResult, holdingResult, tradeResult, priceResult, presenceResult] = await Promise.all([
    db.prepare("SELECT round, started, updated_at FROM game_state WHERE id = 1").first<{ round: number; started: number; updated_at: string }>(),
    db.prepare("SELECT team_id, seed_money, cash FROM teams ORDER BY team_id").all<TeamRow>(),
    db.prepare("SELECT team_id, ticker, shares FROM holdings WHERE shares > 0 ORDER BY team_id, ticker").all<HoldingRow>(),
    db.prepare("SELECT id, team_id, ticker, action, quantity, price, round, created_at FROM trades ORDER BY id DESC LIMIT 500").all<TradeRow>(),
    db.prepare("SELECT ticker, round, price FROM price_schedule ORDER BY ticker, round").all<PriceRow>(),
    db.prepare(`SELECT team_id, last_seen_at,
      CASE WHEN last_seen_at IS NOT NULL AND last_seen_at >= datetime('now', '-12 seconds') THEN 1 ELSE 0 END AS online
      FROM team_sessions`).all<PresenceRow>(),
  ]);
  const game = gameResult ?? { round: 0, started: 0, updated_at: "" };
  const holdings = holdingResult.results ?? [];
  const trades = tradeResult.results ?? [];
  const priceRows = priceResult.results ?? [];
  const presenceRows = presenceResult.results ?? [];
  const fullPrices: PriceSchedule = Object.fromEntries(stocks.map((stock) => [
    stock.ticker,
    Array.from({ length: LAST_ROUND + 1 }, (_, round) => priceRows.find((row) => row.ticker === stock.ticker && row.round === round)?.price ?? null),
  ]));
  const teamViews = (teamResult.results ?? []).map((team) => {
    const teamHoldings = holdings.filter((item) => item.team_id === team.team_id);
    const stockValue = teamHoldings.reduce((sum, item) => sum + item.shares * (getStockPrice(item.ticker, game.round, fullPrices) ?? 0), 0);
    return {
      teamId: team.team_id,
      seedMoney: team.seed_money,
      cash: team.cash,
      totalAsset: team.cash + stockValue,
      holdings: Object.fromEntries(teamHoldings.map((item) => [item.ticker, item.shares])),
      trades: trades.filter((item) => item.team_id === team.team_id),
      online: Boolean(presenceRows.find((presence) => presence.team_id === team.team_id)?.online),
      lastSeenAt: presenceRows.find((presence) => presence.team_id === team.team_id)?.last_seen_at ?? null,
    };
  });
  const response = {
    session: publicGameSession(session),
    game: { round: game.round, started: Boolean(game.started), updatedAt: game.updated_at },
    market: {
      prices: session.role === "staff"
        ? fullPrices
        : Object.fromEntries(Object.entries(fullPrices).map(([ticker, prices]) => [ticker, prices.map((price, round) => round <= game.round ? price : null)])),
    },
    team: session.role === "team" ? teamViews.find((item) => item.teamId === session.teamId) : null,
    teams: session.role === "staff"
      ? teamViews
      : session.role === "view"
        ? teamViews.map(({ teamId, seedMoney, totalAsset }) => ({ teamId, seedMoney, totalAsset }))
        : null,
  };
  return Response.json(response, { headers: { "Cache-Control": "no-store" } });
}
