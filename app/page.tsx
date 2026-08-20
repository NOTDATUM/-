"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Stock = {
  ticker: string;
  name: string;
  english: string;
  field: string;
  color: string;
  prices: Array<number | null>;
};

type Portfolio = {
  cash: number;
  holdings: Record<string, number>;
};

type Trade = {
  id: number;
  team: number;
  ticker: string;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  round: number;
};

const stocks: Stock[] = [
  { ticker: "IMMU", name: "이뮤노스피카", english: "ImmunoSpica", field: "면역학", color: "#B7F34C", prices: [120, 149, 127, 184, 129] },
  { ticker: "VIRO", name: "바이로베리타스", english: "ViroVeritas", field: "바이러스학", color: "#63D9FF", prices: [95, 84, 80, 148, 44] },
  { ticker: "PEPT", name: "펩타이드리스", english: "PeptideLys", field: "단백질학", color: "#FFCE69", prices: [110, 119, 93, 107, 171] },
  { ticker: "GENO", name: "지노믹스코리아", english: "GenomicsKorea", field: "유전체학", color: "#A99CFF", prices: [130, 137, 181, 235, 458] },
  { ticker: "SYNP", name: "시냅스코어", english: "SynapseCore", field: "신경과학", color: "#5BE0C2", prices: [85, 82, 103, 77, 104] },
  { ticker: "MICR", name: "마이크로바이옴틱스", english: "Microbiomtics", field: "미생물학", color: "#FF9D67", prices: [75, 84, 60, 63, 35] },
  { ticker: "CANC", name: "캔서세라퓨틱스", english: "CancerTx", field: "암생물학", color: "#FF6B85", prices: [140, 162, 113, 73, 172] },
  { ticker: "CELL", name: "셀바이오제닉스", english: "CellBiogenics", field: "세포생물학", color: "#66A3FF", prices: [100, 94, 56, 45, 54] },
  { ticker: "VACC", name: "백시노바", english: "VacciNova", field: "백신 개발", color: "#F497FF", prices: [null, null, 80, 176, 26] },
];

const rounds = [
  { label: "장 시작", short: "OPEN", theme: "기준가 공개 · 1라운드 투자", detail: "기업 소개와 힌트를 확인하고 첫 포트폴리오를 구성하세요." },
  { label: "1라운드", short: "R1", theme: "학회·연구성과 공개", detail: "완만한 탐색장 · 상승 5종목 / 하락 3종목" },
  { label: "2라운드", short: "R2", theme: "글로벌 시약·배지 공급 충격", detail: "강한 하락장 · 데이터 중심 기업만 상대적 강세" },
  { label: "3라운드", short: "R3", theme: "신규 변이 확산 + 백시노바 상장", detail: "감염 테마 급등 · 백시노바 신규상장" },
  { label: "4라운드", short: "R4", theme: "감염 우려 종식 + 정밀종양학 호재", detail: "최종 장 마감 · 보유 자산으로 순위를 확정합니다." },
];

const createPortfolios = (): Record<number, Portfolio> =>
  Object.fromEntries(
    Array.from({ length: 11 }, (_, i) => [i + 1, { cash: 1000, holdings: {} }]),
  );

const money = new Intl.NumberFormat("ko-KR");

function currentPrice(stock: Stock, round: number) {
  return stock.prices[round];
}

function isTradable(stock: Stock, round: number) {
  return currentPrice(stock, round) !== null && round < 4;
}

function StockChart({ stock, round }: { stock: Stock; round: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const paint = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const width = rect.width;
      const height = rect.height;
      const pad = { top: 30, right: 26, bottom: 42, left: 48 };
      const visible = stock.prices
        .map((price, index) => ({ price, index }))
        .filter((item) => item.index <= round && item.price !== null) as Array<{ price: number; index: number }>;

      context.clearRect(0, 0, width, height);
      const allValues = visible.map((item) => item.price);
      if (allValues.length === 0) {
        context.fillStyle = "rgba(224, 232, 245, .58)";
        context.font = "600 14px Arial";
        context.textAlign = "center";
        context.fillText("3라운드 시작 시 신규 상장됩니다", width / 2, height / 2);
        return;
      }

      let min = Math.min(...allValues);
      let max = Math.max(...allValues);
      const spread = Math.max(max - min, max * 0.22, 20);
      min = Math.max(0, min - spread * 0.28);
      max += spread * 0.28;

      const x = (index: number) => pad.left + (index / 4) * (width - pad.left - pad.right);
      const y = (price: number) => pad.top + ((max - price) / (max - min)) * (height - pad.top - pad.bottom);

      context.lineWidth = 1;
      context.font = "500 11px Arial";
      for (let grid = 0; grid < 4; grid += 1) {
        const gy = pad.top + (grid / 3) * (height - pad.top - pad.bottom);
        const value = Math.round(max - (grid / 3) * (max - min));
        context.strokeStyle = "rgba(255,255,255,.08)";
        context.beginPath();
        context.moveTo(pad.left, gy);
        context.lineTo(width - pad.right, gy);
        context.stroke();
        context.fillStyle = "rgba(210,220,238,.45)";
        context.textAlign = "right";
        context.fillText(String(value), pad.left - 10, gy + 4);
      }

      const labels = ["기준", "1R", "2R", "3R", "4R"];
      labels.forEach((label, index) => {
        context.fillStyle = index <= round ? "rgba(230,237,248,.72)" : "rgba(230,237,248,.2)";
        context.textAlign = "center";
        context.fillText(label, x(index), height - 14);
      });

      if (visible.length > 1) {
        const gradient = context.createLinearGradient(0, pad.top, 0, height - pad.bottom);
        gradient.addColorStop(0, `${stock.color}42`);
        gradient.addColorStop(1, `${stock.color}00`);
        context.beginPath();
        visible.forEach((item, index) => {
          if (index === 0) context.moveTo(x(item.index), y(item.price));
          else context.lineTo(x(item.index), y(item.price));
        });
        context.lineTo(x(visible.at(-1)!.index), height - pad.bottom);
        context.lineTo(x(visible[0].index), height - pad.bottom);
        context.closePath();
        context.fillStyle = gradient;
        context.fill();
      }

      context.beginPath();
      visible.forEach((item, index) => {
        if (index === 0) context.moveTo(x(item.index), y(item.price));
        else context.lineTo(x(item.index), y(item.price));
      });
      context.strokeStyle = stock.color;
      context.lineWidth = 3;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.shadowColor = stock.color;
      context.shadowBlur = 12;
      context.stroke();
      context.shadowBlur = 0;

      visible.forEach((item, index) => {
        const px = x(item.index);
        const py = y(item.price);
        context.beginPath();
        context.arc(px, py, index === visible.length - 1 ? 5 : 3.5, 0, Math.PI * 2);
        context.fillStyle = index === visible.length - 1 ? stock.color : "#0E1524";
        context.fill();
        context.strokeStyle = stock.color;
        context.lineWidth = 2;
        context.stroke();
        if (index === visible.length - 1) {
          context.fillStyle = stock.color;
          context.font = "700 12px Arial";
          context.textAlign = item.index === 4 ? "right" : "center";
          context.fillText(`${money.format(item.price)} BE`, px, py - 14);
        }
      });
    };

    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [stock, round]);

  return <canvas className="stock-chart" ref={canvasRef} aria-label={`${stock.name} 가격 차트`} />;
}

export default function Home() {
  const [round, setRound] = useState(0);
  const [team, setTeam] = useState(1);
  const [selectedTicker, setSelectedTicker] = useState("IMMU");
  const [quantity, setQuantity] = useState(1);
  const [portfolios, setPortfolios] = useState<Record<number, Portfolio>>(createPortfolios);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [staffOpen, setStaffOpen] = useState(false);
  const [confirmNext, setConfirmNext] = useState(false);
  const [toast, setToast] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("be-exchange-game-v1");
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (typeof state.round === "number") setRound(state.round);
        if (state.portfolios) setPortfolios(state.portfolios);
        if (Array.isArray(state.trades)) setTrades(state.trades);
      } catch {
        window.localStorage.removeItem("be-exchange-game-v1");
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("be-exchange-game-v1", JSON.stringify({ round, portfolios, trades }));
  }, [hydrated, portfolios, round, trades]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedStock = stocks.find((stock) => stock.ticker === selectedTicker) ?? stocks[0];
  const price = currentPrice(selectedStock, round);
  const portfolio = portfolios[team] ?? { cash: 1000, holdings: {} };
  const owned = portfolio.holdings[selectedTicker] ?? 0;
  const tradable = isTradable(selectedStock, round);

  const stockValue = stocks.reduce((sum, stock) => {
    const holding = portfolio.holdings[stock.ticker] ?? 0;
    const mark = currentPrice(stock, round) ?? 0;
    return sum + holding * mark;
  }, 0);
  const totalAsset = portfolio.cash + stockValue;
  const pnl = totalAsset - 1000;

  const standings = useMemo(() =>
    Object.entries(portfolios)
      .map(([teamNumber, item]) => {
        const value = item.cash + stocks.reduce((sum, stock) => sum + (item.holdings[stock.ticker] ?? 0) * (currentPrice(stock, round) ?? 0), 0);
        return { team: Number(teamNumber), value };
      })
      .sort((a, b) => b.value - a.value), [portfolios, round]);

  const change = price !== null && round > 0 && selectedStock.prices[round - 1] !== null
    ? ((price - Number(selectedStock.prices[round - 1])) / Number(selectedStock.prices[round - 1])) * 100
    : null;

  const transact = (type: "buy" | "sell") => {
    if (!tradable || price === null || quantity < 1) return;
    if (type === "buy" && portfolio.cash < price * quantity) {
      setToast("보유 BE Coin이 부족합니다.");
      return;
    }
    if (type === "sell" && owned < quantity) {
      setToast("보유한 수량보다 많이 팔 수 없습니다.");
      return;
    }
    setPortfolios((current) => ({
      ...current,
      [team]: {
        cash: current[team].cash + (type === "buy" ? -1 : 1) * price * quantity,
        holdings: {
          ...current[team].holdings,
          [selectedTicker]: owned + (type === "buy" ? 1 : -1) * quantity,
        },
      },
    }));
    setTrades((current) => [
      { id: Date.now(), team, ticker: selectedTicker, type, quantity, price, round },
      ...current,
    ].slice(0, 40));
    setToast(`${selectedStock.name} ${quantity}주를 ${type === "buy" ? "매수" : "매도"}했습니다.`);
    setQuantity(1);
  };

  const advanceRound = () => {
    if (round >= 4) return;
    const next = round + 1;
    setRound(next);
    setConfirmNext(false);
    setStaffOpen(false);
    setQuantity(1);
    setToast(next === 4 ? "4라운드가 공개되었습니다. 시장이 마감되었습니다." : `${next}라운드 주가가 공개되었습니다.`);
  };

  const resetGame = () => {
    setRound(0);
    setPortfolios(createPortfolios());
    setTrades([]);
    setSelectedTicker("IMMU");
    setQuantity(1);
    setConfirmNext(false);
    setStaffOpen(false);
    window.localStorage.removeItem("be-exchange-game-v1");
    setToast("게임을 처음 상태로 초기화했습니다.");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="be-mark">BE</div>
          <div>
            <div className="brand-name">BIOLOGY EXCHANGE</div>
            <div className="brand-sub">생명과학부 모의주식시장</div>
          </div>
        </div>
        <div className="market-center">
          <span className={`status-dot ${round === 4 ? "closed" : ""}`} />
          <span>{round === 4 ? "MARKET CLOSED" : "MARKET OPEN"}</span>
          <strong>{rounds[round].label}</strong>
        </div>
        <button className="staff-button" onClick={() => setStaffOpen(true)}>
          <span className="staff-icon">●</span> 스태프 모드
        </button>
      </header>

      <section className="round-strip">
        <div className="round-copy">
          <span className="eyebrow">CURRENT MARKET EVENT</span>
          <h1>{rounds[round].theme}</h1>
          <p>{rounds[round].detail}</p>
        </div>
        <div className="round-track" aria-label="라운드 진행 상황">
          {rounds.map((item, index) => (
            <div className={`round-node ${index < round ? "done" : ""} ${index === round ? "active" : ""}`} key={item.short}>
              <span>{index < round ? "✓" : item.short}</span>
              <small>{index === 0 ? "시작" : `${index}라운드`}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="workspace">
        <div className="market-column">
          <div className="panel chart-panel">
            <div className="chart-head">
              <div>
                <div className="ticker-line"><span style={{ background: selectedStock.color }} />{selectedStock.ticker} · {selectedStock.field}</div>
                <h2>{selectedStock.name}</h2>
                <p>{selectedStock.english}</p>
              </div>
              <div className="quote-block">
                {price === null ? (
                  <><strong className="unlisted-price">상장 전</strong><span>3라운드 시작가 80 BE</span></>
                ) : (
                  <><strong>{money.format(price)} <em>BE</em></strong><span className={change === null ? "neutral" : change >= 0 ? "up" : "down"}>{change === null ? "기준가" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(0)}%`}</span></>
                )}
              </div>
            </div>
            <StockChart stock={selectedStock} round={round} />
            <div className="chart-foot">
              <span>표시된 가격은 현재 라운드까지 공개됩니다.</span>
              <span><i style={{ background: selectedStock.color }} />{selectedStock.name}</span>
            </div>
          </div>

          <div className="panel stock-board">
            <div className="section-title-row">
              <div><span className="eyebrow">MARKET BOARD</span><h3>상장 종목</h3></div>
              <span className="board-note">종목을 선택해 차트와 주문창을 확인하세요</span>
            </div>
            <div className="stock-grid">
              {stocks.map((stock) => {
                const itemPrice = currentPrice(stock, round);
                const prior = round > 0 ? stock.prices[round - 1] : null;
                const itemChange = itemPrice !== null && prior !== null ? ((itemPrice - prior) / prior) * 100 : null;
                const holding = portfolio.holdings[stock.ticker] ?? 0;
                return (
                  <button className={`stock-card ${selectedTicker === stock.ticker ? "selected" : ""}`} key={stock.ticker} onClick={() => { setSelectedTicker(stock.ticker); setQuantity(1); }}>
                    <div className="stock-card-top"><span className="stock-swatch" style={{ background: stock.color }} /><strong>{stock.ticker}</strong><em>{holding > 0 ? `${holding}주` : stock.field}</em></div>
                    <div className="stock-card-name">{stock.name}</div>
                    <div className="stock-card-quote">
                      <strong>{itemPrice === null ? "거래불가" : `${money.format(itemPrice)} BE`}</strong>
                      <span className={itemChange === null ? "neutral" : itemChange >= 0 ? "up" : "down"}>{itemChange === null ? (stock.ticker === "VACC" ? "3R 상장" : "기준가") : `${itemChange >= 0 ? "+" : ""}${itemChange.toFixed(0)}%`}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="side-column">
          <div className="panel account-panel">
            <div className="account-head">
              <div><span className="eyebrow">TEAM PORTFOLIO</span><h3>{team}조 투자 계좌</h3></div>
              <label className="team-picker">
                <span>조 선택</span>
                <select value={team} onChange={(event) => { setTeam(Number(event.target.value)); setQuantity(1); }}>
                  {Array.from({ length: 11 }, (_, i) => <option value={i + 1} key={i + 1}>{i + 1}조</option>)}
                </select>
              </label>
            </div>
            <div className="asset-total">
              <span>총 평가자산</span>
              <strong>{money.format(totalAsset)} <em>BE</em></strong>
              <small className={pnl >= 0 ? "up" : "down"}>{pnl >= 0 ? "+" : ""}{money.format(pnl)} BE ({pnl >= 0 ? "+" : ""}{((pnl / 1000) * 100).toFixed(1)}%)</small>
            </div>
            <div className="asset-split">
              <div><span>보유 현금</span><strong>{money.format(portfolio.cash)}</strong></div>
              <div><span>주식 평가액</span><strong>{money.format(stockValue)}</strong></div>
              <div><span>현재 순위</span><strong>{standings.findIndex((item) => item.team === team) + 1}<em>위</em></strong></div>
            </div>
          </div>

          <div className="panel order-panel">
            <div className="order-head">
              <div><span className="eyebrow">ORDER TICKET</span><h3>주문하기</h3></div>
              <span className="order-status">{round === 4 ? "장 마감" : tradable ? "거래 가능" : "거래 불가"}</span>
            </div>
            <div className="order-stock">
              <div><span className="stock-swatch large" style={{ background: selectedStock.color }} /><div><strong>{selectedStock.name}</strong><small>{selectedStock.ticker}</small></div></div>
              <strong>{price === null ? "—" : `${money.format(price)} BE`}</strong>
            </div>
            <div className="position-row"><span>현재 보유</span><strong>{owned}주</strong></div>
            <div className="quantity-label"><span>주문 수량</span><small>1주 단위</small></div>
            <div className="quantity-control">
              <button aria-label="수량 줄이기" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
              <input aria-label="주문 수량" type="number" min="1" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.floor(Number(event.target.value) || 1)))} />
              <button aria-label="수량 늘리기" onClick={() => setQuantity((value) => value + 1)}>＋</button>
            </div>
            <div className="quick-quantity">
              {[1, 5, 10].map((value) => <button onClick={() => setQuantity(value)} key={value}>+{value}주</button>)}
              <button onClick={() => setQuantity(price ? Math.max(1, Math.floor(portfolio.cash / price)) : 1)}>최대</button>
            </div>
            <div className="order-summary"><span>예상 주문금액</span><strong>{price === null ? "—" : `${money.format(price * quantity)} BE`}</strong></div>
            <div className="trade-actions">
              <button className="sell-button" disabled={!tradable || owned < quantity} onClick={() => transact("sell")}><span>매도</span><small>SELL</small></button>
              <button className="buy-button" disabled={!tradable || price === null || portfolio.cash < price * quantity} onClick={() => transact("buy")}><span>매수</span><small>BUY</small></button>
            </div>
            <p className="order-help">라운드가 공개되면 보유 주식의 가격이 자동으로 바뀝니다. 다음 라운드 전까지 자유롭게 매수·매도하세요.</p>
          </div>

          <div className="panel activity-panel">
            <div className="section-title-row compact"><div><span className="eyebrow">RECENT ORDERS</span><h3>{team}조 거래 내역</h3></div></div>
            <div className="activity-list">
              {trades.filter((trade) => trade.team === team).slice(0, 4).map((trade) => {
                const stock = stocks.find((item) => item.ticker === trade.ticker)!;
                return <div className="activity-item" key={trade.id}><span className={trade.type}>{trade.type === "buy" ? "매수" : "매도"}</span><div><strong>{stock.name}</strong><small>{rounds[trade.round].short} · {trade.quantity}주 × {money.format(trade.price)}</small></div><em>{trade.type === "buy" ? "−" : "+"}{money.format(trade.quantity * trade.price)}</em></div>;
              })}
              {trades.filter((trade) => trade.team === team).length === 0 && <div className="empty-activity">아직 거래 내역이 없습니다.</div>}
            </div>
          </div>
        </aside>
      </section>

      <footer className="footer-bar"><span>BE · Biology Exchange</span><span>모든 기업과 사건은 레크리에이션을 위한 가상 설정입니다.</span><span>LOCAL GAME DATA</span></footer>

      {staffOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => { setStaffOpen(false); setConfirmNext(false); }}>
          <section className="staff-modal" role="dialog" aria-modal="true" aria-labelledby="staff-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="닫기" onClick={() => { setStaffOpen(false); setConfirmNext(false); }}>×</button>
            <span className="eyebrow">STAFF CONTROL</span>
            <h2 id="staff-title">라운드 진행 관리</h2>
            <p>이 화면에서 라운드를 넘기면 모든 조의 평가자산과 주가 차트가 동시에 갱신됩니다.</p>
            <div className="staff-current"><span>현재</span><strong>{rounds[round].label}</strong><small>{rounds[round].theme}</small></div>
            <div className="staff-rankings">
              <span>실시간 상위 3개 조</span>
              <div>{standings.slice(0, 3).map((item, index) => <div key={item.team}><i>{index + 1}</i><strong>{item.team}조</strong><em>{money.format(item.value)} BE</em></div>)}</div>
            </div>
            {round < 4 && !confirmNext && <button className="next-round-button" onClick={() => setConfirmNext(true)}>다음 라운드 공개 <span>→</span></button>}
            {round < 4 && confirmNext && <div className="confirm-box"><strong>{round + 1}라운드 주가를 공개할까요?</strong><p>공개 후 이전 가격으로 되돌릴 수 없습니다.</p><div><button onClick={() => setConfirmNext(false)}>취소</button><button onClick={advanceRound}>공개하기</button></div></div>}
            {round === 4 && <div className="market-finished"><strong>모든 라운드가 종료되었습니다.</strong><span>최종 자산 기준으로 순위가 확정되었습니다.</span></div>}
            <button className="reset-button" onClick={() => { if (window.confirm("모든 조의 거래 내역과 자산을 초기화할까요?")) resetGame(); }}>게임 전체 초기화</button>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
