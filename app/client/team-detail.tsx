"use client";

import type React from "react";
import { useEffect, useRef } from "react";
import {
  getStockPrice,
  stocks,
  type PriceSchedule,
  type Stock,
} from "../game-data";
import { money } from "./constants";
import type { TeamView } from "./types";

export function StockProfile({ stock }: { stock: Stock }) {
  return (
    <section
      className="stock-profile"
      style={{ "--stock-accent": stock.color } as React.CSSProperties}
    >
      <div className="stock-profile-intro">
        <span className="eyebrow">기업 상세 정보</span>
        <h3>{stock.sector}</h3>
        <p>{stock.description}</p>
      </div>
      <div className="revenue-block">
        <span>주요 수익원</span>
        <div>
          {stock.revenueStreams.map((stream) => (
            <em key={stream}>{stream}</em>
          ))}
        </div>
      </div>
      <div className="stock-profile-balance">
        <article className="growth">
          <span>긍정 요인</span>
          <h4>성장 동력</h4>
          <p>{stock.strength}</p>
        </article>
        <article className="risk">
          <span>주의 요인</span>
          <h4>핵심 리스크</h4>
          <p>{stock.risk}</p>
        </article>
      </div>
    </section>
  );
}

export type ClientDetailView = "assets" | "trades";

export function ClientDetailModal({
  view,
  team,
  round,
  prices,
  onClose,
}: {
  view: ClientDetailView;
  team: TeamView;
  round: number;
  prices: PriceSchedule;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const stockValue = team.totalAsset - team.cash;
  const pnl = team.totalAsset - team.seedMoney;
  const positions = stocks.flatMap((stock) => {
    const shares = team.holdings[stock.ticker] ?? 0;
    if (shares < 1) return [];
    const currentPrice = getStockPrice(stock.ticker, round, prices);
    return [
      { stock, shares, currentPrice, value: shares * (currentPrice ?? 0) },
    ];
  });
  const headingId = `client-detail-${view}-heading`;
  const descriptionId = `client-detail-${view}-description`;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    dialog?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === dialog || document.activeElement === first)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div
      className="client-detail-modal"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={dialogRef}
        className="client-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="client-detail-close"
          aria-label="상세 화면 닫기"
          onClick={onClose}
        >
          ×
        </button>
        <header className="client-detail-heading">
          <span>{view === "assets" ? "자산 구성" : "거래 기록"}</span>
          <h2 id={headingId}>
            {view === "assets" ? `${team.teamId}조 자산 상세` : "전체 거래내역"}
          </h2>
          <p id={descriptionId}>
            {view === "assets"
              ? "현금과 보유 주식의 현재 평가액을 확인합니다."
              : `지금까지 체결된 매수·매도 ${team.trades.length}건을 모두 확인합니다.`}
          </p>
        </header>
        {view === "assets" ? (
          <>
            <div className="client-detail-metrics">
              <article className="primary">
                <span>현재 총 자산</span>
                <strong>
                  {money.format(team.totalAsset)} <em>BE</em>
                </strong>
                <small className={pnl >= 0 ? "up" : "down"}>
                  {pnl >= 0 ? "+" : ""}
                  {money.format(pnl)} BE
                </small>
              </article>
              <article>
                <span>보유 현금</span>
                <strong>
                  {money.format(team.cash)} <em>BE</em>
                </strong>
              </article>
              <article>
                <span>주식 평가액</span>
                <strong>
                  {money.format(stockValue)} <em>BE</em>
                </strong>
              </article>
              <article>
                <span>시드머니</span>
                <strong>
                  {money.format(team.seedMoney)} <em>BE</em>
                </strong>
              </article>
            </div>
            <div className="client-detail-table">
              <div className="client-detail-table-title">
                <h3 id="client-assets-table-heading">보유 종목</h3>
                <span>{positions.length}개 종목</span>
              </div>
              <div
                className="client-detail-table-scroll"
                role="region"
                aria-labelledby="client-assets-table-heading"
                tabIndex={0}
              >
                <table>
                  <caption className="sr-only">
                    보유 종목별 수량, 현재가, 평가액
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
                    {positions.map(({ stock, shares, currentPrice, value }) => (
                      <tr key={stock.ticker}>
                        <td>
                          <span className="client-detail-stock">
                            <i style={{ background: stock.color }} />
                            <span>
                              <strong>{stock.name}</strong>
                              <small>{stock.ticker}</small>
                            </span>
                          </span>
                        </td>
                        <td>{money.format(shares)}주</td>
                        <td>
                          {currentPrice === null
                            ? "상장 전"
                            : `${money.format(currentPrice)} BE`}
                        </td>
                        <td>
                          <strong>{money.format(value)} BE</strong>
                        </td>
                      </tr>
                    ))}
                    {positions.length === 0 && (
                      <tr>
                        <td className="client-detail-empty" colSpan={4}>
                          아직 보유한 주식이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="client-detail-table trades">
            <div className="client-detail-table-title">
              <h3 id="client-trades-table-heading">체결 내역</h3>
              <span>최신 거래순</span>
            </div>
            <div
              className="client-detail-table-scroll"
              role="region"
              aria-labelledby="client-trades-table-heading"
              tabIndex={0}
            >
              <table>
                <caption className="sr-only">
                  라운드별 매수·매도 전체 체결 내역
                </caption>
                <thead>
                  <tr>
                    <th scope="col">라운드</th>
                    <th scope="col">구분</th>
                    <th scope="col">종목</th>
                    <th scope="col">수량</th>
                    <th scope="col">체결가</th>
                    <th scope="col">거래금액</th>
                  </tr>
                </thead>
                <tbody>
                  {team.trades.map((tradeItem) => {
                    const itemStock = stocks.find(
                      (item) => item.ticker === tradeItem.ticker,
                    );
                    return (
                      <tr key={tradeItem.id}>
                        <td>
                          {tradeItem.round === 0
                            ? "기준가"
                            : `${tradeItem.round}R`}
                        </td>
                        <td>
                          <span
                            className={`client-detail-trade ${tradeItem.action}`}
                          >
                            {tradeItem.action === "buy" ? "매수" : "매도"}
                          </span>
                        </td>
                        <td className="client-detail-company">
                          <span>
                            <strong>
                              {itemStock?.name ?? tradeItem.ticker}
                            </strong>
                            <small>{tradeItem.ticker}</small>
                          </span>
                        </td>
                        <td>{money.format(tradeItem.quantity)}주</td>
                        <td>{money.format(tradeItem.price)} BE</td>
                        <td>
                          <strong
                            className={
                              tradeItem.action === "buy" ? "down" : "up"
                            }
                          >
                            {tradeItem.action === "buy" ? "−" : "+"}
                            {money.format(
                              tradeItem.quantity * tradeItem.price,
                            )}{" "}
                            BE
                          </strong>
                        </td>
                      </tr>
                    );
                  })}
                  {team.trades.length === 0 && (
                    <tr>
                      <td className="client-detail-empty" colSpan={6}>
                        아직 거래 내역이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
