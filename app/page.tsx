"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LAST_ROUND, getStockPrice, isStockTradable, rounds, stocks, type Stock } from "./game-data";

type Session = { role: "staff"; teamId: null } | { role: "team"; teamId: number };
type Trade = { id: number; team_id: number; ticker: string; action: "buy" | "sell"; quantity: number; price: number; round: number; created_at: string };
type TeamView = { teamId: number; seedMoney: number; cash: number; totalAsset: number; holdings: Record<string, number>; trades: Trade[] };
type Snapshot = { session: Session; game: { round: number; started: boolean; updatedAt: string }; team: TeamView | null; teams: TeamView[] | null };

const money = new Intl.NumberFormat("ko-KR");

function useCanvasPainter(paint: (canvas: HTMLCanvasElement) => void, dependencies: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const run = () => paint(canvas);
    run();
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(run);
    };
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  return ref;
}

function prepareCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

type ChartViewport = { min: number; max: number; xMax: number };

function niceScaleStep(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, 1)));
  const fraction = value / magnitude;
  const niceFraction = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  return niceFraction * magnitude;
}

function getAllStocksViewport(round: number): ChartViewport {
  const values = stocks.flatMap((stock) => stock.prices
    .slice(0, round + 1)
    .filter((price): price is number => price !== null));
  if (!values.length || Math.max(...values) - Math.min(...values) < 1) {
    return { min: 90, max: 110, xMax: Math.min(LAST_ROUND, Math.max(2, round + 1)) };
  }
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max((rawMax - rawMin) * .15, 5);
  const paddedMin = Math.max(0, rawMin - padding);
  const paddedMax = rawMax + padding;
  const step = niceScaleStep((paddedMax - paddedMin) / 6);
  return {
    min: Math.max(0, Math.floor(paddedMin / step) * step),
    max: Math.ceil(paddedMax / step) * step,
    xMax: Math.min(LAST_ROUND, Math.max(2, round + 1)),
  };
}

function AllStocksChart({ round, compact = false }: { round: number; compact?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<ChartViewport | null>(null);
  const previousRoundRef = useRef<number | null>(null);
  const targetViewport = useMemo(() => getAllStocksViewport(round), [round]);

  const draw = useCallback((canvas: HTMLCanvasElement, viewport: ChartViewport, reveal: number) => {
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { context, width, height } = prepared;
    const pad = compact ? { top: 12, right: 10, bottom: 22, left: 10 } : { top: 20, right: 20, bottom: 34, left: 42 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const x = (index: number) => pad.left + (index / viewport.xMax) * plotWidth;
    const y = (indexValue: number) => pad.top + ((viewport.max - indexValue) / (viewport.max - viewport.min)) * plotHeight;

    if (!compact) {
      context.font = "500 10px Arial";
      for (let grid = 0; grid <= 5; grid += 1) {
        const value = viewport.max - (grid / 5) * (viewport.max - viewport.min);
        const py = y(value);
        context.strokeStyle = "rgba(255,255,255,.07)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(pad.left, py);
        context.lineTo(width - pad.right, py);
        context.stroke();
        context.fillStyle = "rgba(211,222,240,.38)";
        context.textAlign = "right";
        context.fillText(String(Math.round(value)), pad.left - 8, py + 3);
      }
      for (let index = 0; index <= Math.floor(viewport.xMax + .001); index += 1) {
        context.fillStyle = index <= round ? "rgba(225,233,246,.7)" : "rgba(225,233,246,.2)";
        context.textAlign = "center";
        context.fillText(index === 0 ? "기준가" : `${index}R`, x(index), height - 10);
      }
    }

    stocks.forEach((stock) => {
      const points = stock.prices
        .map((price, index) => ({ index, value: price }))
        .filter((point) => point.index <= round && point.value !== null) as Array<{ index: number; value: number }>;
      if (!points.length) return;
      const animatedPoints = points.map((point, index) => {
        if (point.index !== round || index === 0 || reveal >= 1) return point;
        const previous = points[index - 1];
        return {
          index: previous.index + (point.index - previous.index) * reveal,
          value: previous.value + (point.value - previous.value) * reveal,
        };
      });
      const entering = points.length === 1 && points[0].index === round && reveal < 1;
      context.beginPath();
      animatedPoints.forEach((point, index) => {
        const px = x(point.index);
        const py = y(point.value);
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.strokeStyle = stock.color;
      context.lineWidth = compact ? 1.4 : 2.2;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.globalAlpha = (compact ? .8 : .92) * (entering ? Math.max(.15, reveal) : 1);
      context.stroke();
      context.globalAlpha = 1;
      const last = animatedPoints.at(-1)!;
      const pulse = Math.sin(reveal * Math.PI);
      context.save();
      context.shadowColor = stock.color;
      context.shadowBlur = pulse * (compact ? 7 : 14);
      context.beginPath();
      context.arc(x(last.index), y(last.value), (compact ? 2 : 3.2) + pulse * (compact ? 1 : 2), 0, Math.PI * 2);
      context.fillStyle = stock.color;
      context.globalAlpha = entering ? Math.max(.15, reveal) : 1;
      context.fill();
      context.restore();
    });
  }, [round, compact]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const from = viewportRef.current ?? targetViewport;
    const previousRound = previousRoundRef.current;
    const roundChanged = previousRound !== null && previousRound !== round;
    const revealPoint = roundChanged && previousRound !== null && round > previousRound;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = roundChanged && !reducedMotion ? 950 : 0;
    const startedAt = performance.now();
    let animationFrame = 0;
    let resizeFrame = 0;

    previousRoundRef.current = round;
    const animate = (now: number) => {
      const progress = duration ? Math.min(1, (now - startedAt) / duration) : 1;
      const eased = 1 - (1 - progress) ** 3;
      const viewport = {
        min: from.min + (targetViewport.min - from.min) * eased,
        max: from.max + (targetViewport.max - from.max) * eased,
        xMax: from.xMax + (targetViewport.xMax - from.xMax) * eased,
      };
      viewportRef.current = viewport;
      draw(canvas, viewport, revealPoint ? eased : 1);
      if (progress < 1) animationFrame = requestAnimationFrame(animate);
    };
    animate(startedAt);

    const resize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => draw(canvas, viewportRef.current ?? targetViewport, 1));
    };
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animationFrame);
      cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", resize);
    };
  }, [draw, round, targetViewport]);

  return <div className="all-chart-shell">
    <canvas ref={ref} className={compact ? "all-chart compact" : "all-chart"} aria-label={`전체 종목 실제 주가 차트, 자동 축 ${targetViewport.min} BE에서 ${targetViewport.max} BE`} />
    {!compact && <span key={round} className="chart-scale-pill">AUTO SCALE · {targetViewport.min}–{targetViewport.max} BE</span>}
  </div>;
}

function StockChart({ stock, round, mini = false }: { stock: Stock; round: number; mini?: boolean }) {
  const paint = useCallback((canvas: HTMLCanvasElement) => {
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { context, width, height } = prepared;
    const visible = stock.prices.map((price, index) => ({ price, index })).filter((item) => item.index <= round && item.price !== null) as Array<{ price: number; index: number }>;
    if (!visible.length) {
      context.fillStyle = "rgba(220,230,244,.42)";
      context.font = mini ? "500 9px Arial" : "600 12px Arial";
      context.textAlign = "center";
      context.fillText("3R 신규상장", width / 2, height / 2);
      return;
    }
    const pad = mini ? { top: 8, right: 7, bottom: 7, left: 7 } : { top: 24, right: 20, bottom: 34, left: 42 };
    let min = Math.min(...visible.map((item) => item.price));
    let max = Math.max(...visible.map((item) => item.price));
    const spread = Math.max(max - min, max * .18, 15);
    min = Math.max(0, min - spread * .28);
    max += spread * .28;
    const x = (index: number) => pad.left + (index / LAST_ROUND) * (width - pad.left - pad.right);
    const y = (value: number) => pad.top + ((max - value) / (max - min)) * (height - pad.top - pad.bottom);

    if (!mini) {
      context.font = "500 10px Arial";
      for (let grid = 0; grid < 4; grid += 1) {
        const py = pad.top + (grid / 3) * (height - pad.top - pad.bottom);
        context.strokeStyle = "rgba(255,255,255,.07)";
        context.beginPath(); context.moveTo(pad.left, py); context.lineTo(width - pad.right, py); context.stroke();
        context.fillStyle = "rgba(220,229,242,.38)";
        context.textAlign = "right";
        context.fillText(String(Math.round(max - (grid / 3) * (max - min))), pad.left - 8, py + 3);
      }
      for (let index = 0; index <= LAST_ROUND; index += 1) {
        context.fillStyle = index <= round ? "rgba(225,233,246,.68)" : "rgba(225,233,246,.18)";
        context.textAlign = "center";
        context.fillText(index === 0 ? "기준가" : `${index}R`, x(index), height - 10);
      }
    }

    if (!mini && visible.length > 1) {
      const gradient = context.createLinearGradient(0, pad.top, 0, height - pad.bottom);
      gradient.addColorStop(0, `${stock.color}40`);
      gradient.addColorStop(1, `${stock.color}00`);
      context.beginPath();
      visible.forEach((item, index) => index === 0 ? context.moveTo(x(item.index), y(item.price)) : context.lineTo(x(item.index), y(item.price)));
      context.lineTo(x(visible.at(-1)!.index), height - pad.bottom);
      context.lineTo(x(visible[0].index), height - pad.bottom);
      context.closePath(); context.fillStyle = gradient; context.fill();
    }
    context.beginPath();
    visible.forEach((item, index) => index === 0 ? context.moveTo(x(item.index), y(item.price)) : context.lineTo(x(item.index), y(item.price)));
    context.strokeStyle = stock.color;
    context.lineWidth = mini ? 1.7 : 3;
    context.lineJoin = "round"; context.lineCap = "round"; context.stroke();
    const last = visible.at(-1)!;
    context.beginPath(); context.arc(x(last.index), y(last.price), mini ? 2.5 : 4.5, 0, Math.PI * 2); context.fillStyle = stock.color; context.fill();
  }, [stock, round, mini]);
  const ref = useCanvasPainter(paint, [paint]);
  return <canvas ref={ref} className={mini ? "mini-chart" : "stock-chart"} aria-label={`${stock.name} 가격 차트`} />;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-lockup ${compact ? "compact" : ""}`}><div className="be-mark">BE</div><div><div className="brand-name">BIOLOGY EXCHANGE</div><div className="brand-sub">생명과학부 모의주식시장</div></div></div>;
}

function LoginScreen({ onLogin }: { onLogin: (session: Session) => void }) {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, password }) });
      const data = await response.json() as { session?: Session; error?: string };
      if (!response.ok || !data.session) throw new Error(data.error ?? "로그인에 실패했습니다.");
      onLogin(data.session);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "로그인에 실패했습니다."); }
    finally { setBusy(false); }
  };
  return <main className="login-shell">
    <div className="login-ambient"><div /><div /><div /></div>
    <section className="login-card">
      <Brand />
      <div className="login-copy"><span className="eyebrow">MARKET ACCESS</span><h1>모의주식시장 입장</h1><p>배정받은 조 번호 또는 스태프 계정으로 로그인하세요.</p></div>
      <form onSubmit={submit} className="login-form">
        <label><span>아이디</span><input value={id} onChange={(event) => setId(event.target.value)} placeholder="조 번호 또는 staff" autoComplete="username" autoFocus /></label>
        <label><span>비밀번호</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="비밀번호 입력" autoComplete="current-password" /></label>
        {error && <div className="form-error">{error}</div>}
        <button disabled={busy || !id || !password}>{busy ? "확인 중..." : "시장 입장"}<span>→</span></button>
      </form>
      <div className="login-hint"><div><strong>참가 조</strong><span>ID 1–12 · 공통 비밀번호</span></div><div><strong>운영 스태프</strong><span>스태프 전용 계정</span></div></div>
    </section>
    <p className="fiction-note">모든 기업과 사건은 레크리에이션을 위한 가상 설정입니다.</p>
  </main>;
}

function RoundProgress({ round }: { round: number }) {
  return <div className="round-progress" aria-label="10라운드 진행 상황">{Array.from({ length: 10 }, (_, index) => {
    const value = index + 1;
    return <div className={`${value < round ? "done" : ""} ${value === round ? "active" : ""}`} key={value}><span>{value < round ? "✓" : value}</span><small>R{value}</small></div>;
  })}</div>;
}

function Topbar({ session, round, onLogout, presentation = false }: { session: Session; round: number; onLogout: () => void; presentation?: boolean }) {
  return <header className={`topbar ${presentation ? "presentation" : ""}`}><Brand compact /><div className="market-center"><span className={`status-dot ${round === LAST_ROUND ? "closed" : ""}`} /><span>{round === LAST_ROUND ? "MARKET CLOSED" : "MARKET OPEN"}</span><strong>{rounds[round].label}</strong></div><div className="account-actions"><span>{session.role === "staff" ? "STAFF CONTROL" : `${session.teamId}조 계정`}</span><button onClick={onLogout}>로그아웃</button></div></header>;
}

function WaitingScreen({ session, onLogout }: { session: Session; onLogout: () => void }) {
  return <main className="app-shell"><Topbar session={session} round={0} onLogout={onLogout} /><section className="waiting-screen"><div className="waiting-orbit"><span>BE</span></div><span className="eyebrow">WAITING FOR STAFF</span><h1>게임 시작을 기다리고 있습니다</h1><p>스태프가 조별 시드머니를 설정하면 자동으로 거래 화면이 열립니다.</p></section></main>;
}

function SeedSetup({ initial, onSaved, onCancel }: { initial?: TeamView[] | null; onSaved: () => void; onCancel?: () => void }) {
  const [seeds, setSeeds] = useState(() => Array.from({ length: 12 }, (_, index) => initial?.find((team) => team.teamId === index + 1)?.seedMoney ?? 1000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/game/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seeds }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "저장하지 못했습니다.");
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  };
  const setAll = (value: number) => setSeeds(Array.from({ length: 12 }, () => value));
  return <section className="seed-page"><div className="seed-hero"><span className="eyebrow">INITIAL CAPITAL SETUP</span><h1>조별 시드머니 설정</h1><p>1라운드 시작 전에 각 조의 초기 BE Coin을 입력하세요. 게임 시작 후 모든 거래와 순위는 이 금액을 기준으로 계산됩니다.</p><div className="seed-presets"><button onClick={() => setAll(1000)}>전체 1,000 BE</button><button onClick={() => setAll(1500)}>전체 1,500 BE</button><button onClick={() => setAll(2000)}>전체 2,000 BE</button></div></div><div className="seed-grid">{seeds.map((seed, index) => <label key={index}><span><i>{index + 1}</i>{index + 1}조</span><div><input type="number" min="1" step="100" value={seed} onChange={(event) => setSeeds((current) => current.map((value, itemIndex) => itemIndex === index ? Math.max(1, Math.floor(Number(event.target.value) || 1)) : value))} /><em>BE</em></div></label>)}</div>{error && <div className="form-error wide">{error}</div>}<div className="seed-actions">{onCancel && <button className="secondary-button" onClick={onCancel}>취소</button>}<button className="primary-button" disabled={busy} onClick={save}>{busy ? "게임 준비 중..." : "시드머니 확정 · 게임 시작"}<span>→</span></button></div><p className="reset-warning">시작된 게임에서 다시 확정하면 기존 보유 주식과 거래 내역이 초기화됩니다.</p></section>;
}

function TeamDashboard({ snapshot, refresh, onLogout }: { snapshot: Snapshot; refresh: () => Promise<void>; onLogout: () => void }) {
  const team = snapshot.team!;
  const round = snapshot.game.round;
  const [ticker, setTicker] = useState("IMMU");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const stock = stocks.find((item) => item.ticker === ticker) ?? stocks[0];
  const price = getStockPrice(ticker, round);
  const prior = round > 0 ? getStockPrice(ticker, round - 1) : null;
  const change = price !== null && prior !== null ? ((price - prior) / prior) * 100 : null;
  const owned = team.holdings[ticker] ?? 0;
  const stockValue = team.totalAsset - team.cash;
  const pnl = team.totalAsset - team.seedMoney;
  const tradable = isStockTradable(ticker, round);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2400); return () => clearTimeout(timer); }, [toast]);
  const trade = async (action: "buy" | "sell") => {
    setBusy(true);
    try {
      const response = await fetch("/api/game/trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker, action, quantity }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "주문을 처리하지 못했습니다.");
      setToast(`${stock.name} ${quantity}주를 ${action === "buy" ? "매수" : "매도"}했습니다.`);
      setQuantity(1); await refresh();
    } catch (caught) { setToast(caught instanceof Error ? caught.message : "주문을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  };
  return <main className="app-shell"><Topbar session={snapshot.session} round={round} onLogout={onLogout} /><section className="team-round-band"><div><span className="eyebrow">CURRENT MARKET EVENT</span><h1>{rounds[round].theme}</h1><p>{rounds[round].detail}</p></div><RoundProgress round={round} /></section><section className="team-workspace"><div className="panel all-market-panel"><div className="panel-title"><div><span className="eyebrow">ALL STOCKS · ACTUAL PRICE</span><h2>전체 종목 흐름</h2></div><span>라운드별 실제 주가 · BE</span></div><AllStocksChart round={round} /><div className="chart-legend">{stocks.map((item) => <button className={ticker === item.ticker ? "selected" : ""} onClick={() => setTicker(item.ticker)} key={item.ticker}><i style={{ background: item.color }} />{item.ticker}</button>)}</div></div><aside className="panel team-account-panel"><span className="eyebrow">TEAM {team.teamId} PORTFOLIO</span><h2>{team.teamId}조 투자 계좌</h2><div className="hero-asset"><span>총 평가자산</span><strong>{money.format(team.totalAsset)} <em>BE</em></strong><small className={pnl >= 0 ? "up" : "down"}>{pnl >= 0 ? "+" : ""}{money.format(pnl)} BE · {team.seedMoney ? `${pnl >= 0 ? "+" : ""}${((pnl / team.seedMoney) * 100).toFixed(1)}%` : "0%"}</small></div><div className="account-split"><div><span>보유 현금</span><strong>{money.format(team.cash)}</strong></div><div><span>주식 평가액</span><strong>{money.format(stockValue)}</strong></div><div><span>시드머니</span><strong>{money.format(team.seedMoney)}</strong></div></div><div className="holdings-mini"><span>보유 종목</span>{Object.entries(team.holdings).filter(([, shares]) => shares > 0).map(([holdingTicker, shares]) => { const item = stocks.find((value) => value.ticker === holdingTicker)!; return <button key={holdingTicker} onClick={() => setTicker(holdingTicker)}><i style={{ background: item.color }} /><strong>{item.name}</strong><em>{shares}주</em></button>; })}{Object.values(team.holdings).every((shares) => shares <= 0) && <p>아직 보유한 주식이 없습니다.</p>}</div></aside><div className="panel selected-stock-panel"><div className="stock-detail-head"><div><span className="stock-color-bar" style={{ background: stock.color }} /><div><span>{stock.ticker} · {stock.field}</span><h2>{stock.name}</h2><p>{stock.english}</p></div></div><div>{price === null ? <><strong className="unlisted">상장 전</strong><span>3R 신규상장</span></> : <><strong>{money.format(price)} <em>BE</em></strong><span className={change === null ? "neutral" : change >= 0 ? "up" : "down"}>{change === null ? "기준가" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(0)}%`}</span></>}</div></div><StockChart stock={stock} round={round} /><div className="stock-selector">{stocks.map((item) => <button key={item.ticker} className={item.ticker === ticker ? "active" : ""} onClick={() => { setTicker(item.ticker); setQuantity(1); }}><i style={{ background: item.color }} /><span>{item.name}</span><strong>{getStockPrice(item.ticker, round) === null ? "거래불가" : `${money.format(getStockPrice(item.ticker, round)!)} BE`}</strong></button>)}</div></div><aside className="right-stack"><section className="panel order-panel"><div className="panel-title"><div><span className="eyebrow">ORDER TICKET</span><h2>주문하기</h2></div><span className={tradable ? "market-open-tag" : "market-closed-tag"}>{tradable ? "거래 가능" : "거래 불가"}</span></div><div className="order-stock"><div><i style={{ background: stock.color }} /><span><strong>{stock.name}</strong><small>{stock.ticker}</small></span></div><strong>{price === null ? "—" : `${money.format(price)} BE`}</strong></div><div className="position-row"><span>현재 보유</span><strong>{owned}주</strong></div><label className="quantity-label"><span>주문 수량 <small>1주 단위</small></span><div><button onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><input value={quantity} min="1" type="number" onChange={(event) => setQuantity(Math.max(1, Math.floor(Number(event.target.value) || 1)))} /><button onClick={() => setQuantity((value) => value + 1)}>＋</button></div></label><div className="quick-quantity">{[1, 5, 10].map((value) => <button onClick={() => setQuantity(value)} key={value}>+{value}주</button>)}<button onClick={() => setQuantity(price ? Math.max(1, Math.floor(team.cash / price)) : 1)}>최대</button></div><div className="order-total"><span>예상 주문금액</span><strong>{price === null ? "—" : `${money.format(price * quantity)} BE`}</strong></div><div className="trade-actions"><button className="sell-button" disabled={busy || !tradable || owned < quantity} onClick={() => trade("sell")}><span>매도</span><small>SELL</small></button><button className="buy-button" disabled={busy || !tradable || price === null || team.cash < price * quantity} onClick={() => trade("buy")}><span>매수</span><small>BUY</small></button></div></section><section className="panel recent-panel"><div className="panel-title"><div><span className="eyebrow">RECENT ORDERS</span><h2>최근 거래</h2></div></div><div className="recent-list">{team.trades.slice(0, 5).map((tradeItem) => { const item = stocks.find((value) => value.ticker === tradeItem.ticker)!; return <div key={tradeItem.id}><span className={tradeItem.action}>{tradeItem.action === "buy" ? "매수" : "매도"}</span><div><strong>{item.name}</strong><small>R{tradeItem.round} · {tradeItem.quantity}주 × {money.format(tradeItem.price)}</small></div><em>{tradeItem.action === "buy" ? "−" : "+"}{money.format(tradeItem.quantity * tradeItem.price)}</em></div>; })}{team.trades.length === 0 && <p>아직 거래 내역이 없습니다.</p>}</div></section></aside></section>{toast && <div className="toast">{toast}</div>}</main>;
}

function StaffTeamDetail({ team, round, onBack }: { team: TeamView; round: number; onBack: () => void }) {
  const stockValue = team.totalAsset - team.cash;
  const pnl = team.totalAsset - team.seedMoney;
  return <section className="staff-detail-page"><button className="back-button" onClick={onBack}>← 전체 진행 화면</button><div className="detail-heading"><div><span className="eyebrow">TEAM {team.teamId} ACTIVITY</span><h1>{team.teamId}조 거래 현황</h1><p>보유 주식과 라운드별 매수·매도 내역을 확인합니다.</p></div><div className="detail-total"><span>현재 총 자산</span><strong>{money.format(team.totalAsset)} <em>BE</em></strong><small className={pnl >= 0 ? "up" : "down"}>{pnl >= 0 ? "+" : ""}{money.format(pnl)} BE</small></div></div><div className="detail-metrics"><div><span>시드머니</span><strong>{money.format(team.seedMoney)} BE</strong></div><div><span>보유 현금</span><strong>{money.format(team.cash)} BE</strong></div><div><span>주식 평가액</span><strong>{money.format(stockValue)} BE</strong></div><div><span>현재 라운드</span><strong>{round === 0 ? "장 시작" : `${round}R`}</strong></div></div><div className="detail-grid"><section className="panel table-panel"><div className="panel-title"><div><span className="eyebrow">POSITIONS</span><h2>보유 주식</h2></div></div><div className="data-table"><table><thead><tr><th>종목</th><th>보유 수량</th><th>현재가</th><th>평가액</th></tr></thead><tbody>{stocks.map((stock) => { const shares = team.holdings[stock.ticker] ?? 0; const price = getStockPrice(stock.ticker, round); return shares > 0 ? <tr key={stock.ticker}><td><i style={{ background: stock.color }} /><strong>{stock.name}</strong><small>{stock.ticker}</small></td><td>{shares}주</td><td>{price === null ? "—" : `${money.format(price)} BE`}</td><td>{price === null ? "—" : `${money.format(price * shares)} BE`}</td></tr> : null; })}{Object.values(team.holdings).every((shares) => shares <= 0) && <tr><td colSpan={4} className="empty-cell">보유 주식이 없습니다.</td></tr>}</tbody></table></div></section><section className="panel table-panel trade-history"><div className="panel-title"><div><span className="eyebrow">ORDER HISTORY</span><h2>전체 매수·매도 내역</h2></div><span>{team.trades.length}건</span></div><div className="data-table"><table><thead><tr><th>라운드</th><th>구분</th><th>종목</th><th>수량</th><th>체결가</th><th>금액</th></tr></thead><tbody>{team.trades.map((trade) => { const stock = stocks.find((item) => item.ticker === trade.ticker)!; return <tr key={trade.id}><td>{trade.round === 0 ? "OPEN" : `${trade.round}R`}</td><td><span className={`trade-pill ${trade.action}`}>{trade.action === "buy" ? "매수" : "매도"}</span></td><td><strong>{stock.name}</strong><small>{stock.ticker}</small></td><td>{trade.quantity}주</td><td>{money.format(trade.price)} BE</td><td className={trade.action === "buy" ? "down" : "up"}>{trade.action === "buy" ? "−" : "+"}{money.format(trade.quantity * trade.price)} BE</td></tr>; })}{team.trades.length === 0 && <tr><td colSpan={6} className="empty-cell">아직 거래 내역이 없습니다.</td></tr>}</tbody></table></div></section></div></section>;
}

function StaffDashboard({ snapshot, refresh, onLogout }: { snapshot: Snapshot; refresh: () => Promise<void>; onLogout: () => void }) {
  const teams = useMemo(() => snapshot.teams ?? [], [snapshot.teams]);
  const round = snapshot.game.round;
  const [view, setView] = useState<"dashboard" | "setup">("dashboard");
  const [detailTeam, setDetailTeam] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const standings = useMemo(() => [...teams].sort((a, b) => b.totalAsset - a.totalAsset), [teams]);
  const advance = async () => {
    if (!window.confirm(`${round + 1}라운드 주가를 공개할까요?`)) return;
    setBusy(true);
    try { const response = await fetch("/api/game/round", { method: "POST" }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error ?? "라운드를 진행하지 못했습니다."); await refresh(); }
    catch (caught) { window.alert(caught instanceof Error ? caught.message : "라운드를 진행하지 못했습니다."); }
    finally { setBusy(false); }
  };
  if (view === "setup") return <main className="staff-shell"><Topbar session={snapshot.session} round={round} onLogout={onLogout} presentation /><SeedSetup initial={teams} onSaved={async () => { await refresh(); setView("dashboard"); }} onCancel={() => setView("dashboard")} /></main>;
  const selected = detailTeam ? teams.find((team) => team.teamId === detailTeam) : null;
  if (selected) return <main className="staff-shell"><Topbar session={snapshot.session} round={round} onLogout={onLogout} presentation /><StaffTeamDetail team={selected} round={round} onBack={() => setDetailTeam(null)} /></main>;
  return <main className="staff-shell"><Topbar session={snapshot.session} round={round} onLogout={onLogout} presentation /><section className="staff-control-band"><div><span className="eyebrow">LIVE MARKET CONTROL</span><h1>{rounds[round].theme}</h1><p>{rounds[round].detail}</p></div><div className="staff-control-actions"><button className="secondary-button" onClick={() => setView("setup")}>시드머니 재설정</button><button className="primary-button" disabled={busy || round >= LAST_ROUND} onClick={advance}>{round >= LAST_ROUND ? "모든 라운드 종료" : `다음 라운드 공개 · R${round + 1}`}<span>→</span></button></div></section><section className="staff-presentation-grid"><div className="panel staff-market-panel"><div className="panel-title"><div><span className="eyebrow">ALL STOCKS · LIVE PRICE</span><h2>전체 주식시장</h2></div><div className="round-badge"><span>{round === 0 ? "OPEN" : `ROUND ${round}`}</span><strong>{round}/10</strong></div></div><AllStocksChart round={round} /><div className="chart-legend staff">{stocks.map((stock) => <span key={stock.ticker}><i style={{ background: stock.color }} />{stock.name}<strong>{getStockPrice(stock.ticker, round) === null ? "—" : money.format(getStockPrice(stock.ticker, round)!)}</strong></span>)}</div></div><aside className="panel staff-scoreboard"><div className="panel-title"><div><span className="eyebrow">TEAM ASSET BOARD</span><h2>조별 현재 총 자산</h2></div><span>클릭해 거래 확인</span></div><div className="scoreboard-list">{standings.map((team, index) => { const pnl = team.totalAsset - team.seedMoney; return <button key={team.teamId} onClick={() => setDetailTeam(team.teamId)}><i>{index + 1}</i><span><strong>{team.teamId}조</strong><small>현금 {money.format(team.cash)} · 거래 {team.trades.length}건</small></span><em>{money.format(team.totalAsset)} <small>BE</small><b className={pnl >= 0 ? "up" : "down"}>{pnl >= 0 ? "+" : ""}{money.format(pnl)}</b></em></button>; })}</div></aside><section className="individual-market-section"><div className="individual-heading"><div><span className="eyebrow">INDIVIDUAL STOCKS</span><h2>종목별 가격 차트</h2></div><RoundProgress round={round} /></div><div className="mini-chart-grid">{stocks.map((stock) => { const price = getStockPrice(stock.ticker, round); const prior = round > 0 ? getStockPrice(stock.ticker, round - 1) : null; const change = price !== null && prior !== null ? ((price - prior) / prior) * 100 : null; return <article className="panel mini-stock-card" key={stock.ticker}><div><span><i style={{ background: stock.color }} />{stock.ticker}</span><strong>{stock.name}</strong></div><MiniQuote price={price} change={change} /><StockChart stock={stock} round={round} mini /></article>; })}</div></section></section></main>;
}

function MiniQuote({ price, change }: { price: number | null; change: number | null }) {
  return <div className="mini-quote"><strong>{price === null ? "상장 전" : `${money.format(price)} BE`}</strong><span className={change === null ? "neutral" : change >= 0 ? "up" : "down"}>{change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`}</span></div>;
}

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/game", { cache: "no-store" });
    if (response.status === 401) { setSession(null); setSnapshot(null); return; }
    const data = await response.json() as Snapshot & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "게임 정보를 불러오지 못했습니다.");
    setSnapshot(data); setSession(data.session); setError("");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((caught) => {
        setSession(null);
        setError(caught instanceof Error ? caught.message : "게임 정보를 불러오지 못했습니다.");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => refresh().catch(() => undefined), 2000);
    return () => window.clearInterval(timer);
  }, [session, refresh]);

  const login = async (nextSession: Session) => { setSession(nextSession); await refresh(); };
  const logout = async () => { await fetch("/api/auth", { method: "DELETE" }); setSession(null); setSnapshot(null); };

  if (session === undefined) return <main className="loading-shell"><Brand /><div className="loading-line"><span /></div><p>시장을 불러오고 있습니다</p></main>;
  if (!session) return <><LoginScreen onLogin={login} />{error && <div className="toast error">{error}</div>}</>;
  if (!snapshot) return <main className="loading-shell"><Brand /><div className="loading-line"><span /></div><p>게임 데이터를 연결하고 있습니다</p></main>;
  if (!snapshot.game.started) {
    if (session.role === "staff") return <main className="staff-shell"><Topbar session={session} round={0} onLogout={logout} presentation /><SeedSetup initial={snapshot.teams} onSaved={refresh} /></main>;
    return <WaitingScreen session={session} onLogout={logout} />;
  }
  return session.role === "staff" ? <StaffDashboard snapshot={snapshot} refresh={refresh} onLogout={logout} /> : <TeamDashboard snapshot={snapshot} refresh={refresh} onLogout={logout} />;
}
