"use client";

import { getStockPrice, stocks, type PriceSchedule } from "../game-data";
import { money } from "./constants";
import type { TeamView, Trade } from "./types";

export function StaffTeamDetail({
  team,
  round,
  prices,
  onBack,
  onCancelTrade,
  cancelTradeBusy,
}: {
  team: TeamView;
  round: number;
  prices: PriceSchedule;
  onBack: () => void;
  onCancelTrade: (trade: Trade) => void | Promise<void>;
  cancelTradeBusy: number | null;
}) {
  const stockValue = team.totalAsset - team.cash;
  const pnl = team.totalAsset - team.seedMoney;
  const canceledCount = team.trades.filter((trade) => trade.canceled_at).length;
  return (
    <section className="staff-detail-page">
      <button className="back-button" onClick={onBack}>
        ← 운영 관리 콘솔
      </button>
      <div className="detail-heading">
        <div>
          <span className="eyebrow">참가 조 상세 관리</span>
          <h1>{team.teamId}조 거래 현황</h1>
          <p>
            보유 주식과 라운드별 매수·매도 내역을 확인하고 잘못된 체결을 취소할
            수 있습니다.
          </p>
        </div>
        <div className="detail-total">
          <span>현재 총 자산</span>
          <strong>
            {money.format(team.totalAsset)} <em>BE</em>
          </strong>
          <small className={pnl >= 0 ? "up" : "down"}>
            {pnl >= 0 ? "+" : ""}
            {money.format(pnl)} BE
          </small>
        </div>
      </div>
      <div className="detail-metrics">
        <div>
          <span>시드머니</span>
          <strong>{money.format(team.seedMoney)} BE</strong>
        </div>
        <div>
          <span>보유 현금</span>
          <strong>{money.format(team.cash)} BE</strong>
        </div>
        <div>
          <span>주식 평가액</span>
          <strong>{money.format(stockValue)} BE</strong>
        </div>
        <div>
          <span>현재 라운드</span>
          <strong>{round === 0 ? "장 시작" : `${round}R`}</strong>
        </div>
      </div>
      <div className="detail-grid">
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">현재 보유 현황</span>
              <h2>보유 주식</h2>
            </div>
          </div>
          <div
            className="data-table"
            role="region"
            aria-label={`${team.teamId}조 보유 주식`}
            tabIndex={0}
          >
            <table>
              <caption className="sr-only">
                {team.teamId}조의 현재 보유 주식과 평가액
              </caption>
              <thead>
                <tr>
                  <th scope="col">종목</th>
                  <th scope="col">보유 수량</th>
                  <th scope="col">현재가</th>
                  <th scope="col">평가액</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((stock) => {
                  const shares = team.holdings[stock.ticker] ?? 0;
                  const price = getStockPrice(stock.ticker, round, prices);
                  return shares > 0 ? (
                    <tr key={stock.ticker}>
                      <td>
                        <i style={{ background: stock.color }} />
                        <strong>{stock.name}</strong>
                        <small>{stock.ticker}</small>
                      </td>
                      <td>{shares}주</td>
                      <td>
                        {price === null ? "—" : `${money.format(price)} BE`}
                      </td>
                      <td>
                        {price === null
                          ? "—"
                          : `${money.format(price * shares)} BE`}
                      </td>
                    </tr>
                  ) : null;
                })}
                {Object.values(team.holdings).every(
                  (shares) => shares <= 0,
                ) && (
                  <tr>
                    <td colSpan={4} className="empty-cell">
                      보유 주식이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel table-panel trade-history">
          <div className="panel-title">
            <div>
              <span className="eyebrow">체결·취소 기록</span>
              <h2>전체 매수·매도 내역</h2>
            </div>
            <span>
              {team.trades.length - canceledCount}건 유효
              {canceledCount ? ` · ${canceledCount}건 취소` : ""}
            </span>
          </div>
          <div
            className="data-table"
            role="region"
            aria-label={`${team.teamId}조 전체 거래내역`}
            tabIndex={0}
          >
            <table>
              <caption className="sr-only">
                {team.teamId}조의 라운드별 매수, 매도, 취소 내역
              </caption>
              <thead>
                <tr>
                  <th scope="col">라운드</th>
                  <th scope="col">구분</th>
                  <th scope="col">종목</th>
                  <th scope="col">수량</th>
                  <th scope="col">체결가</th>
                  <th scope="col">금액</th>
                  <th scope="col">관리</th>
                </tr>
              </thead>
              <tbody>
                {team.trades.map((trade) => {
                  const stock = stocks.find(
                    (item) => item.ticker === trade.ticker,
                  )!;
                  const canceled = Boolean(trade.canceled_at);
                  const canCancel =
                    !canceled &&
                    (trade.action === "buy"
                      ? (team.holdings[trade.ticker] ?? 0) >= trade.quantity
                      : team.cash >= trade.quantity * trade.price);
                  return (
                    <tr
                      className={canceled ? "canceled-trade-row" : ""}
                      key={trade.id}
                    >
                      <td>
                        {trade.round === 0 ? "기준가" : `${trade.round}R`}
                      </td>
                      <td>
                        {canceled ? (
                          <span className="trade-pill canceled">취소됨</span>
                        ) : (
                          <span className={`trade-pill ${trade.action}`}>
                            {trade.action === "buy" ? "매수" : "매도"}
                          </span>
                        )}
                      </td>
                      <td>
                        <strong>{stock.name}</strong>
                        <small>{stock.ticker}</small>
                      </td>
                      <td>{trade.quantity}주</td>
                      <td>{money.format(trade.price)} BE</td>
                      <td
                        className={
                          canceled
                            ? "neutral"
                            : trade.action === "buy"
                              ? "down"
                              : "up"
                        }
                      >
                        {trade.action === "buy" ? "−" : "+"}
                        {money.format(trade.quantity * trade.price)} BE
                      </td>
                      <td>
                        <button
                          className="trade-cancel-button"
                          disabled={!canCancel || cancelTradeBusy === trade.id}
                          title={
                            !canCancel && !canceled
                              ? "현재 잔액 또는 보유 수량으로 되돌릴 수 없습니다."
                              : undefined
                          }
                          onClick={() => onCancelTrade(trade)}
                        >
                          {canceled
                            ? "취소 완료"
                            : cancelTradeBusy === trade.id
                              ? "처리 중"
                              : canCancel
                                ? "거래 취소"
                                : "취소 불가"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {team.trades.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-cell">
                      아직 거래 내역이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
