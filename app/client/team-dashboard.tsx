"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../api-client";
import { getStockPrice, isStockTradable, rounds, stocks } from "../game-data";
import { AllStocksChart } from "./charts";
import { RoundProgress, Topbar } from "./common";
import {
  CLIENT_THEME_KEY,
  MAX_ORDER_QUANTITY,
  clampOrderQuantity,
  money,
} from "./constants";
import {
  ClientDetailModal,
  StockProfile,
  type ClientDetailView,
} from "./team-detail";
import type { ClientChartMode, ClientTheme, Snapshot } from "./types";

export function TeamDashboard({
  snapshot,
  refresh,
  onLogout,
}: {
  snapshot: Snapshot;
  refresh: () => Promise<void>;
  onLogout: () => void;
}) {
  const team = snapshot.team!;
  const round = snapshot.game.round;
  const prices = snapshot.market.prices;
  const [ticker, setTicker] = useState("IMMU");
  const [chartMode, setChartMode] = useState<ClientChartMode>("all");
  const [clientTheme, setClientTheme] = useState<ClientTheme>(() => {
    if (typeof window === "undefined") return "dark";
    const savedTheme = window.localStorage.getItem(CLIENT_THEME_KEY);
    return savedTheme === "light" || savedTheme === "dark"
      ? savedTheme
      : "dark";
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [detailView, setDetailView] = useState<ClientDetailView | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const stock = stocks.find((item) => item.ticker === ticker) ?? stocks[0];
  const price = getStockPrice(ticker, round, prices);
  const prior = round > 0 ? getStockPrice(ticker, round - 1, prices) : null;
  const change =
    price !== null && prior !== null ? ((price - prior) / prior) * 100 : null;
  const owned = team.holdings[ticker] ?? 0;
  const stockValue = team.totalAsset - team.cash;
  const pnl = team.totalAsset - team.seedMoney;
  const tradable = isStockTradable(ticker, round, prices);
  const maxBuyQuantity =
    tradable && price
      ? Math.min(MAX_ORDER_QUANTITY, Math.floor(team.cash / price))
      : 0;
  const maxSellQuantity = tradable ? Math.min(MAX_ORDER_QUANTITY, owned) : 0;
  const maxOrderQuantity = Math.max(maxBuyQuantity, maxSellQuantity);
  const minOrderQuantity = maxOrderQuantity > 0 ? 1 : 0;
  const orderQuantity = clampOrderQuantity(quantity, maxOrderQuantity);
  const selectedChartTicker = chartMode === "single" ? ticker : null;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const selectStock = (nextTicker: string) => {
    setTicker(nextTicker);
    setChartMode("single");
    setQuantity(1);
  };

  const toggleTheme = () => {
    setClientTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem(CLIENT_THEME_KEY, next);
      return next;
    });
  };

  const trade = async (action: "buy" | "sell") => {
    setBusy(true);
    try {
      const response = await apiFetch("/api/game/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, action, quantity: orderQuantity }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "주문을 처리하지 못했습니다.");
      setToast(
        `${stock.name} ${orderQuantity}주를 ${action === "buy" ? "매수" : "매도"}했습니다.`,
      );
      setQuantity(1);
      await refresh();
    } catch (caught) {
      setToast(
        caught instanceof Error
          ? caught.message
          : "주문을 처리하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={`app-shell toss-client theme-${clientTheme}`}>
      <Topbar
        session={snapshot.session}
        round={round}
        onLogout={onLogout}
        clientTheme={clientTheme}
        onToggleTheme={toggleTheme}
      />
      <section className="client-dashboard">
        <div className="client-main-column">
          <section className="client-round-strip">
            <div>
              <span>{round === 0 ? "장 시작" : `${round}R`}</span>
              <div>
                <strong>{rounds[round].theme}</strong>
                <small>{rounds[round].detail}</small>
              </div>
            </div>
            <RoundProgress round={round} />
          </section>
          <section className="client-market-card">
            <header className="client-market-head">
              <div>
                <span className="client-kicker">
                  {chartMode === "single"
                    ? `${stock.ticker} · ${stock.field}`
                    : "전체 주식시장"}
                </span>
                <div className="client-market-title">
                  <h1>{chartMode === "single" ? stock.name : "시장 흐름"}</h1>
                  {chartMode === "single" && (
                    <strong>
                      {price === null ? "상장 전" : `${money.format(price)} BE`}
                      <small
                        className={
                          change === null
                            ? "neutral"
                            : change >= 0
                              ? "up"
                              : "down"
                        }
                      >
                        {change === null
                          ? "기준가"
                          : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}
                      </small>
                    </strong>
                  )}
                </div>
              </div>
              <div className="client-chart-actions" aria-label="차트 보기 방식">
                <button
                  className={chartMode === "all" ? "active" : ""}
                  aria-pressed={chartMode === "all"}
                  onClick={() => setChartMode("all")}
                >
                  전체 차트
                </button>
                <button
                  className={chartMode === "single" ? "active" : ""}
                  aria-pressed={chartMode === "single"}
                  onClick={() => setChartMode("single")}
                >
                  단일 차트
                </button>
              </div>
            </header>
            <AllStocksChart
              round={round}
              prices={prices}
              selectedTicker={selectedChartTicker}
              tone={clientTheme}
            />
            <div className="client-stock-strip" aria-label="거래 종목 선택">
              {stocks.map((item) => {
                const itemPrice = getStockPrice(item.ticker, round, prices);
                const itemPrior =
                  round > 0
                    ? getStockPrice(item.ticker, round - 1, prices)
                    : null;
                const itemChange =
                  itemPrice !== null && itemPrior !== null
                    ? ((itemPrice - itemPrior) / itemPrior) * 100
                    : null;
                return (
                  <button
                    aria-pressed={ticker === item.ticker}
                    className={ticker === item.ticker ? "active" : ""}
                    onClick={() => selectStock(item.ticker)}
                    key={item.ticker}
                  >
                    <i style={{ background: item.color }} />
                    <span>
                      <strong>{item.ticker}</strong>
                      <small>{item.name}</small>
                    </span>
                    <em>
                      {itemPrice === null ? "상장 전" : money.format(itemPrice)}
                      <small
                        className={
                          itemChange === null
                            ? "neutral"
                            : itemChange >= 0
                              ? "up"
                              : "down"
                        }
                      >
                        {itemChange === null
                          ? "—"
                          : `${itemChange >= 0 ? "+" : ""}${itemChange.toFixed(0)}%`}
                      </small>
                    </em>
                  </button>
                );
              })}
            </div>
            {chartMode === "single" && (
              <div className="client-stock-summary">
                <span style={{ background: stock.color }} />
                <p>
                  <strong>{stock.name}</strong>
                  {stock.description}
                </p>
                <button onClick={() => setProfileOpen(true)}>상세보기 →</button>
              </div>
            )}
          </section>
        </div>

        <aside className="client-side-column">
          <section className="client-account-card">
            <div className="client-account-top">
              <div>
                <span>{team.teamId}조 총 자산</span>
                <strong>
                  {money.format(team.totalAsset)} <em>BE</em>
                </strong>
              </div>
              <div className="client-account-side">
                <button
                  className="client-card-link"
                  onClick={() => setDetailView("assets")}
                >
                  자산 상세
                </button>
                <small className={pnl >= 0 ? "up" : "down"}>
                  {pnl >= 0 ? "+" : ""}
                  {money.format(pnl)} BE ·{" "}
                  {team.seedMoney
                    ? `${pnl >= 0 ? "+" : ""}${((pnl / team.seedMoney) * 100).toFixed(1)}%`
                    : "0%"}
                </small>
              </div>
            </div>
            <div className="client-account-metrics">
              <div>
                <span>보유 현금</span>
                <strong>{money.format(team.cash)}</strong>
              </div>
              <div>
                <span>주식 평가액</span>
                <strong>{money.format(stockValue)}</strong>
              </div>
              <div>
                <span>시드머니</span>
                <strong>{money.format(team.seedMoney)}</strong>
              </div>
            </div>
            <div className="client-holdings">
              {Object.entries(team.holdings)
                .filter(([, shares]) => shares > 0)
                .map(([holdingTicker, shares]) => (
                  <button
                    key={holdingTicker}
                    onClick={() => selectStock(holdingTicker)}
                  >
                    <span>{holdingTicker}</span>
                    <strong>{shares}주</strong>
                  </button>
                ))}
              {Object.values(team.holdings).every((shares) => shares <= 0) && (
                <small>보유 주식이 없습니다</small>
              )}
            </div>
          </section>

          <section className="client-order-card">
            <header>
              <div>
                <span>주문 종목</span>
                <h2>
                  <i style={{ background: stock.color }} />
                  {stock.name}
                  <small>{stock.ticker}</small>
                </h2>
              </div>
              <strong>
                {price === null ? "—" : `${money.format(price)} BE`}
              </strong>
            </header>
            <div className="client-position">
              <span>
                현재 보유 <strong>{owned}주</strong>
              </span>
              <em className={tradable ? "open" : "closed"}>
                {tradable ? "거래 가능" : "거래 불가"}
              </em>
            </div>
            <label className="client-quantity">
              <span>
                주문 수량{" "}
                <small>
                  매수 가능 {maxBuyQuantity}주 · 매도 가능 {maxSellQuantity}주
                </small>
              </span>
              <div>
                <button
                  aria-label="수량 1주 줄이기"
                  disabled={busy || orderQuantity <= minOrderQuantity}
                  onClick={() =>
                    setQuantity(
                      clampOrderQuantity(orderQuantity - 1, maxOrderQuantity),
                    )
                  }
                >
                  −
                </button>
                <input
                  aria-label="주문 수량"
                  value={orderQuantity}
                  min={minOrderQuantity}
                  max={maxOrderQuantity}
                  disabled={busy || maxOrderQuantity < 1}
                  type="number"
                  onChange={(event) =>
                    setQuantity(
                      clampOrderQuantity(
                        Number(event.target.value),
                        maxOrderQuantity,
                      ),
                    )
                  }
                />
                <button
                  aria-label="수량 1주 늘리기"
                  disabled={busy || orderQuantity >= maxOrderQuantity}
                  onClick={() =>
                    setQuantity(
                      clampOrderQuantity(orderQuantity + 1, maxOrderQuantity),
                    )
                  }
                >
                  ＋
                </button>
              </div>
            </label>
            <div className="client-quick-quantity">
              {[1, 5, 10].map((value) => (
                <button
                  disabled={busy || orderQuantity >= maxOrderQuantity}
                  onClick={() =>
                    setQuantity(
                      clampOrderQuantity(
                        orderQuantity + value,
                        maxOrderQuantity,
                      ),
                    )
                  }
                  key={value}
                >
                  +{value}
                </button>
              ))}
              <button
                disabled={
                  busy ||
                  maxOrderQuantity < 1 ||
                  orderQuantity >= maxOrderQuantity
                }
                onClick={() => setQuantity(maxOrderQuantity)}
              >
                최대
              </button>
            </div>
            <div className="client-order-total">
              <span>예상 주문금액</span>
              <strong>
                {price === null || orderQuantity < 1
                  ? "—"
                  : `${money.format(price * orderQuantity)} BE`}
              </strong>
            </div>
            <div className="client-trade-actions">
              <button
                className="sell"
                disabled={
                  busy ||
                  !tradable ||
                  orderQuantity < 1 ||
                  owned < orderQuantity
                }
                onClick={() => trade("sell")}
              >
                매도
              </button>
              <button
                className="buy"
                disabled={
                  busy ||
                  !tradable ||
                  orderQuantity < 1 ||
                  price === null ||
                  team.cash < price * orderQuantity
                }
                onClick={() => trade("buy")}
              >
                매수
              </button>
            </div>
          </section>

          <section className="client-recent-card">
            <header>
              <strong>최근 거래</strong>
              <div>
                <span>{team.trades.length}건</span>
                <button
                  className="client-card-link"
                  onClick={() => setDetailView("trades")}
                >
                  전체보기
                </button>
              </div>
            </header>
            <div>
              {team.trades.slice(0, 3).map((tradeItem) => (
                <article key={tradeItem.id}>
                  <span className={tradeItem.action}>
                    {tradeItem.action === "buy" ? "매수" : "매도"}
                  </span>
                  <p>
                    <strong>{tradeItem.ticker}</strong>
                    <small>
                      {tradeItem.quantity}주 · {money.format(tradeItem.price)}{" "}
                      BE
                    </small>
                  </p>
                  <em>
                    {tradeItem.action === "buy" ? "−" : "+"}
                    {money.format(tradeItem.quantity * tradeItem.price)}
                  </em>
                </article>
              ))}
              {team.trades.length === 0 && (
                <small className="client-empty">
                  아직 거래 내역이 없습니다
                </small>
              )}
            </div>
          </section>
        </aside>
      </section>

      {profileOpen && (
        <div
          className="stock-profile-modal"
          role="presentation"
          onMouseDown={() => setProfileOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${stock.name} 기업 상세정보`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="profile-close"
              aria-label="상세정보 닫기"
              onClick={() => setProfileOpen(false)}
            >
              ×
            </button>
            <header>
              <span style={{ background: stock.color }} />
              <div>
                <small>
                  {stock.ticker} · {stock.english}
                </small>
                <h2>{stock.name}</h2>
              </div>
              <strong>
                {price === null ? "상장 전" : `${money.format(price)} BE`}
              </strong>
            </header>
            <StockProfile stock={stock} />
          </section>
        </div>
      )}
      {detailView && (
        <ClientDetailModal
          view={detailView}
          team={team}
          round={round}
          prices={prices}
          onClose={() => setDetailView(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
