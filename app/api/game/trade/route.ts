import { ensureGameSchema, getGameDb } from "../../../../db/game";
import { LAST_ROUND, stocks } from "../../../game-data";
import { readSession } from "../../../lib/session";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "team")
    return Response.json(
      { error: "조 계정으로 로그인해 주세요." },
      { status: 403 },
    );
  const body = (await request.json()) as {
    ticker?: string;
    action?: "buy" | "sell";
    quantity?: number;
  };
  const ticker = String(body.ticker ?? "");
  const action = body.action;
  const quantity = Number(body.quantity);
  if (
    !stocks.some((stock) => stock.ticker === ticker) ||
    !["buy", "sell"].includes(String(action)) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 1000000
  ) {
    return Response.json(
      { error: "주문 내용을 다시 확인해 주세요." },
      { status: 400 },
    );
  }
  await ensureGameSchema();
  const db = getGameDb();
  const game = await db
    .prepare("SELECT round, started FROM game_state WHERE id = 1")
    .first<{ round: number; started: number }>();
  if (!game?.started)
    return Response.json(
      { error: "아직 게임이 시작되지 않았습니다." },
      { status: 400 },
    );
  const priceRow = await db
    .prepare("SELECT price FROM price_schedule WHERE ticker = ? AND round = ?")
    .bind(ticker, game.round)
    .first<{ price: number | null }>();
  const price = priceRow?.price ?? null;
  if (game.round >= LAST_ROUND || price === null)
    return Response.json(
      { error: "현재 거래할 수 없는 종목입니다." },
      { status: 400 },
    );
  const team = await db
    .prepare("SELECT cash FROM teams WHERE team_id = ?")
    .bind(session.teamId)
    .first<{ cash: number }>();
  const holding = await db
    .prepare("SELECT shares FROM holdings WHERE team_id = ? AND ticker = ?")
    .bind(session.teamId, ticker)
    .first<{ shares: number }>();
  const shares = holding?.shares ?? 0;
  const total = price * quantity;
  if (action === "buy" && (!team || team.cash < total))
    return Response.json(
      { error: "보유 BE Coin이 부족합니다." },
      { status: 400 },
    );
  if (action === "sell" && shares < quantity)
    return Response.json(
      { error: "보유한 수량보다 많이 팔 수 없습니다." },
      { status: 400 },
    );
  const nextCash = (team?.cash ?? 0) + (action === "buy" ? -total : total);
  const nextShares = shares + (action === "buy" ? quantity : -quantity);
  await db.batch([
    db
      .prepare("UPDATE teams SET cash = ? WHERE team_id = ?")
      .bind(nextCash, session.teamId),
    db
      .prepare(
        `INSERT INTO holdings (team_id, ticker, shares) VALUES (?, ?, ?)
      ON CONFLICT(team_id, ticker) DO UPDATE SET shares = excluded.shares`,
      )
      .bind(session.teamId, ticker, nextShares),
    db
      .prepare(
        "INSERT INTO trades (team_id, ticker, action, quantity, price, round) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(session.teamId, ticker, action, quantity, price, game.round),
  ]);
  return Response.json({ ok: true, price, quantity, action });
}
