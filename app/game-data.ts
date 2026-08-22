import gameData from "../shared/game-data.json";

export type Stock = {
  ticker: string;
  name: string;
  english: string;
  field: string;
  sector: string;
  description: string;
  revenueStreams: string[];
  strength: string;
  risk: string;
  sensitivities: Record<string, string>;
  color: string;
  prices: Array<number | null>;
};

export type PriceSchedule = Record<string, Array<number | null>>;

export const stocks = gameData.stocks as Stock[];
export const rounds = gameData.rounds;
export const LAST_ROUND = gameData.lastRound;

export function getStockPrice(
  ticker: string,
  round: number,
  schedule?: PriceSchedule,
) {
  if (schedule && Object.prototype.hasOwnProperty.call(schedule, ticker)) {
    return schedule[ticker]?.[round] ?? null;
  }
  return stocks.find((stock) => stock.ticker === ticker)?.prices[round] ?? null;
}

export function isStockTradable(
  ticker: string,
  round: number,
  schedule?: PriceSchedule,
) {
  return round < LAST_ROUND && getStockPrice(ticker, round, schedule) !== null;
}
