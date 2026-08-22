import { ensureGameSchema, getGameDb } from "../../../../db/game";
import { adminAuditStatement } from "../../../lib/admin-audit";
import { readSession } from "../../../lib/session";

type TradeRow = {
  id: number;
  team_id: number;
  ticker: string;
  action: "buy" | "sell";
  quantity: number;
  price: number;
  round: number;
  canceled_at: string | null;
};

export async function POST(request: Request) {
  const session = await readSession();
  if (!session || session.role !== "staff")
    return Response.json(
      { error: "스태프 권한이 필요합니다." },
      { status: 403 },
    );
  const body = (await request.json()) as { tradeId?: number };
  const tradeId = Number(body.tradeId);
  if (!Number.isInteger(tradeId) || tradeId < 1)
    return Response.json(
      { error: "취소할 거래를 다시 확인해 주세요." },
      { status: 400 },
    );

  await ensureGameSchema();
  const db = getGameDb();
  const trade = await db
    .prepare(
      `SELECT id, team_id, ticker, action, quantity, price, round, canceled_at
    FROM trades WHERE id = ?`,
    )
    .bind(tradeId)
    .first<TradeRow>();
  if (!trade)
    return Response.json(
      { error: "거래 내역을 찾을 수 없습니다." },
      { status: 404 },
    );
  if (trade.canceled_at)
    return Response.json({ error: "이미 취소된 거래입니다." }, { status: 409 });
  const team = await db
    .prepare("SELECT cash FROM teams WHERE team_id = ?")
    .bind(trade.team_id)
    .first<{ cash: number }>();
  const holding = await db
    .prepare("SELECT shares FROM holdings WHERE team_id = ? AND ticker = ?")
    .bind(trade.team_id, trade.ticker)
    .first<{ shares: number }>();
  if (!team)
    return Response.json(
      { error: "거래 조를 찾을 수 없습니다." },
      { status: 404 },
    );
  const shares = holding?.shares ?? 0;
  const total = trade.quantity * trade.price;
  if (trade.action === "buy" && shares < trade.quantity) {
    return Response.json(
      {
        error: "이후 매도로 보유 수량이 부족해 해당 매수를 취소할 수 없습니다.",
      },
      { status: 409 },
    );
  }
  if (trade.action === "sell" && team.cash < total) {
    return Response.json(
      { error: "이후 거래로 현금이 부족해 해당 매도를 취소할 수 없습니다." },
      { status: 409 },
    );
  }
  const nextCash = team.cash + (trade.action === "buy" ? total : -total);
  const nextShares =
    shares + (trade.action === "buy" ? -trade.quantity : trade.quantity);
  await db.batch([
    db
      .prepare("UPDATE teams SET cash = ? WHERE team_id = ?")
      .bind(nextCash, trade.team_id),
    db
      .prepare(
        `INSERT INTO holdings (team_id, ticker, shares) VALUES (?, ?, ?)
      ON CONFLICT(team_id, ticker) DO UPDATE SET shares = excluded.shares`,
      )
      .bind(trade.team_id, trade.ticker, nextShares),
    db
      .prepare(
        "UPDATE trades SET canceled_at = CURRENT_TIMESTAMP WHERE id = ? AND canceled_at IS NULL",
      )
      .bind(trade.id),
    db.prepare(
      "UPDATE game_state SET updated_at = CURRENT_TIMESTAMP WHERE id = 1",
    ),
    adminAuditStatement(
      "trade_cancel",
      `${trade.team_id}조 ${trade.ticker} ${trade.action === "buy" ? "매수" : "매도"} 거래를 취소했습니다.`,
      {
        tradeId: trade.id,
        teamId: trade.team_id,
        ticker: trade.ticker,
        action: trade.action,
        quantity: trade.quantity,
        price: trade.price,
        round: trade.round,
      },
    ),
  ]);
  return Response.json({ ok: true, tradeId: trade.id, teamId: trade.team_id });
}
