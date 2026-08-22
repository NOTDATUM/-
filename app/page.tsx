"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LAST_ROUND, getStockPrice, isStockTradable, rounds, stocks, type PriceSchedule, type Stock } from "./game-data";
import { apiFetch, clearApiSessionToken, setApiSessionToken } from "./api-client";

type Session = { role: "staff" | "view"; teamId: null } | { role: "team"; teamId: number };
type Trade = { id: number; team_id: number; ticker: string; action: "buy" | "sell"; quantity: number; price: number; round: number; created_at: string; canceled_at?: string | null };
type TeamView = { teamId: number; seedMoney: number; cash: number; totalAsset: number; holdings: Record<string, number>; trades: Trade[]; online?: boolean; lastSeenAt?: string | null };
type ViewTeamPerformance = { teamId: number; returnRate: number };
type AdminAuditLog = { id: number; actor: string; action: string; summary: string; details: unknown; createdAt: string };
type Snapshot = { session: Session; game: { round: number; started: boolean; updatedAt: string }; market: { prices: PriceSchedule }; team: TeamView | null; teams: Array<TeamView | ViewTeamPerformance> | null; auditLogs?: AdminAuditLog[] | null };

const money = new Intl.NumberFormat("ko-KR");
const MAX_ORDER_QUANTITY = 1_000_000;
const DEFAULT_TEAM_COUNT = 12;
const MAX_TEAM_COUNT = 30;
const CLIENT_THEME_KEY = "be-client-theme";

function isTeamView(team: TeamView | ViewTeamPerformance): team is TeamView {
  return "cash" in team;
}

function isViewTeamPerformance(team: TeamView | ViewTeamPerformance): team is ViewTeamPerformance {
  return "returnRate" in team;
}

const viewRoundBriefs = [
  { tags: ["기업 정보", "분산 투자", "초기 포트폴리오"], note: "사업 구조와 위험 요인을 비교해 첫 포트폴리오의 균형을 점검하세요." },
  { tags: ["학회 성과", "재현성", "기초 연구"], note: "초기 연구성과가 공개됐습니다. 단기 반응과 장기 성장성을 구분해 보세요." },
  { tags: ["수입 시약", "웻랩 원가", "데이터 기업"], note: "실험재료 의존도가 높은 기업과 계산 중심 기업의 비용 구조가 갈립니다." },
  { tags: ["신규 변이", "진단·면역", "VACC 상장"], note: "감염 대응 기업이 주목받고 백시노바가 시장에 새로 진입합니다." },
  { tags: ["감염 우려 해소", "정밀종양학", "테마 전환"], note: "직전 라운드의 강세 테마가 빠르게 바뀔 수 있는 전환 구간입니다." },
  { tags: ["장기 연구비", "유전체", "코호트"], note: "장기 과제와 대규모 데이터 사업에 예산이 유입되는 흐름을 살펴보세요." },
  { tags: ["임상 결과", "제조 품질", "종목 차별화"], note: "같은 산업 안에서도 임상 성과와 품질 리스크에 따라 격차가 커집니다." },
  { tags: ["클라우드 비용", "계산 원가", "웻랩 반등"], note: "데이터 처리 비용 상승이 계산 중심 기업의 수익성에 미치는 영향을 확인하세요." },
  { tags: ["감염 재확산", "백신", "진단"], note: "감염 대응 수요가 다시 늘며 관련 기업으로 관심이 이동합니다." },
  { tags: ["백신 안전성", "정밀의료", "대형 수주"], note: "안전성 이슈와 신규 수주가 동시에 발생한 혼합 신호 구간입니다." },
  { tags: ["기술이전", "최종 평가", "시장 마감"], note: "마지막 계약 발표가 반영됩니다. 최종 수익률과 포트폴리오를 확인하세요." },
] as const;

type ClientTheme = "dark" | "light";
type ClientChartMode = "all" | "single";

function clampOrderQuantity(value: number, maximum: number) {
  if (maximum < 1) return 0;
  const integer = Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.min(maximum, Math.max(1, integer));
}

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

function getAllStocksViewport(round: number, selectedTicker: string | null, prices: PriceSchedule): ChartViewport {
  const visibleStocks = selectedTicker ? stocks.filter((stock) => stock.ticker === selectedTicker) : stocks;
  const values = visibleStocks.flatMap((stock) => (prices[stock.ticker] ?? stock.prices)
    .slice(0, round + 1)
    .filter((price): price is number => price !== null));
  if (!values.length) {
    return { min: 0, max: 100, xMax: Math.min(LAST_ROUND, Math.max(2, round + 1)) };
  }
  if (Math.max(...values) - Math.min(...values) < 1) {
    const center = values[0];
    const padding = Math.max(center * .12, 10);
    const step = niceScaleStep((padding * 2) / 5);
    return {
      min: Math.max(0, Math.floor((center - padding) / step) * step),
      max: Math.ceil((center + padding) / step) * step,
      xMax: Math.min(LAST_ROUND, Math.max(2, round + 1)),
    };
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

function AllStocksChart({ round, prices, compact = false, selectedTicker = null, tone = "dark" }: { round: number; prices: PriceSchedule; compact?: boolean; selectedTicker?: string | null; tone?: "light" | "dark" | "projector" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<ChartViewport | null>(null);
  const previousRoundRef = useRef<number | null>(null);
  const targetViewport = useMemo(() => getAllStocksViewport(round, selectedTicker, prices), [round, selectedTicker, prices]);
  const visibleStocks = useMemo(() => selectedTicker ? stocks.filter((stock) => stock.ticker === selectedTicker) : stocks, [selectedTicker]);

  const draw = useCallback((canvas: HTMLCanvasElement, viewport: ChartViewport, reveal: number) => {
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { context, width, height } = prepared;
    const projector = tone === "projector";
    const pad = compact ? { top: 12, right: 10, bottom: 22, left: 10 } : projector ? { top: 37, right: 32, bottom: 58, left: 88 } : { top: 31, right: 26, bottom: 46, left: 72 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const x = (index: number) => pad.left + (index / viewport.xMax) * plotWidth;
    const y = (indexValue: number) => pad.top + ((viewport.max - indexValue) / (viewport.max - viewport.min)) * plotHeight;

    if (!compact) {
      context.font = projector ? "750 15px Arial" : "650 12px Arial";
      context.fillStyle = tone === "light" ? "#6b7684" : projector ? "rgba(255,255,255,.92)" : "rgba(211,222,240,.55)";
      context.textAlign = "left";
      context.fillText("주가 (BE)", pad.left, 13);
      for (let grid = 0; grid <= 5; grid += 1) {
        const value = viewport.max - (grid / 5) * (viewport.max - viewport.min);
        const py = y(value);
        context.strokeStyle = tone === "light" ? "rgba(25,31,40,.09)" : projector ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.07)";
        context.lineWidth = projector ? 1.4 : 1;
        context.beginPath();
        context.moveTo(pad.left, py);
        context.lineTo(width - pad.right, py);
        context.stroke();
        context.fillStyle = tone === "light" ? "#8b95a1" : projector ? "rgba(255,255,255,.88)" : "rgba(211,222,240,.5)";
        context.textAlign = "right";
        context.fillText(money.format(Math.round(value)), pad.left - 11, py + 4);
      }
      context.strokeStyle = tone === "light" ? "rgba(25,31,40,.16)" : projector ? "rgba(255,255,255,.42)" : "rgba(255,255,255,.12)";
      context.lineWidth = projector ? 1.8 : 1;
      context.beginPath();
      context.moveTo(pad.left, pad.top);
      context.lineTo(pad.left, height - pad.bottom);
      context.lineTo(width - pad.right, height - pad.bottom);
      context.stroke();
      for (let index = 0; index <= Math.floor(viewport.xMax + .001); index += 1) {
        context.fillStyle = index <= round ? (tone === "light" ? "#6b7684" : projector ? "rgba(255,255,255,.94)" : "rgba(225,233,246,.7)") : (tone === "light" ? "#d1d6db" : projector ? "rgba(255,255,255,.28)" : "rgba(225,233,246,.2)");
        context.textAlign = "center";
        context.fillText(index === 0 ? "기준가" : `${index}라운드`, x(index), height - 13);
      }
    }

    visibleStocks.forEach((stock) => {
      const points = (prices[stock.ticker] ?? stock.prices)
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
      context.lineWidth = compact ? 1.4 : projector ? 3.6 : 2.2;
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
      if (!compact && selectedTicker === stock.ticker) {
        context.fillStyle = stock.color;
        context.font = "700 12px Arial";
        context.textAlign = "right";
        context.fillText(`${money.format(Math.round(last.value))} BE`, width - pad.right, Math.max(pad.top + 12, y(last.value) - 10));
      }
    });
  }, [round, compact, prices, selectedTicker, tone, visibleStocks]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const from = viewportRef.current ?? targetViewport;
    const previousRound = previousRoundRef.current;
    const roundChanged = previousRound !== null && previousRound !== round;
    const revealPoint = roundChanged && previousRound !== null && round > previousRound;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const viewportChanged = Math.abs(from.min - targetViewport.min) > .01
      || Math.abs(from.max - targetViewport.max) > .01
      || Math.abs(from.xMax - targetViewport.xMax) > .01;
    const duration = (roundChanged || viewportChanged) && !reducedMotion ? 950 : 0;
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
    <canvas ref={ref} className={compact ? "all-chart compact" : "all-chart"} aria-label={`${selectedTicker ?? "전체 종목"} 실제 주가 차트, 세로축 ${targetViewport.min} BE에서 ${targetViewport.max} BE, 가로축 기준가부터 ${round}라운드`} />
    {!compact && <span key={`${round}-${selectedTicker ?? "all"}`} className="chart-scale-pill">{selectedTicker ?? "ALL"} · AUTO SCALE · {targetViewport.min}–{targetViewport.max} BE</span>}
  </div>;
}

function StockChart({ stock, round, prices, mini = false }: { stock: Stock; round: number; prices: PriceSchedule; mini?: boolean }) {
  const paint = useCallback((canvas: HTMLCanvasElement) => {
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { context, width, height } = prepared;
    const visible = (prices[stock.ticker] ?? stock.prices).map((price, index) => ({ price, index })).filter((item) => item.index <= round && item.price !== null) as Array<{ price: number; index: number }>;
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
  }, [stock, round, prices, mini]);
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
  const normalizedId = id.trim().toLowerCase();
  const accessMode = normalizedId === "staff" ? "staff" : normalizedId === "view" ? "view" : "team";
  const accessCopy = accessMode === "staff"
    ? { eyebrow: "ADMIN CONSOLE", title: "운영자 콘솔 로그인", detail: "라운드 진행, 계정 상태와 거래 운영을 관리합니다.", action: "관리 콘솔 입장" }
    : accessMode === "view"
      ? { eyebrow: "LIVE DISPLAY", title: "공용 진행 화면 연결", detail: "행사장 전체가 함께 보는 실시간 시장 현황판입니다.", action: "진행 화면 열기" }
      : { eyebrow: "MARKET ACCESS", title: "모의주식시장 입장", detail: "배정받은 조 번호와 공통 비밀번호로 로그인하세요.", action: "시장 입장" };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await apiFetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, password }) });
      const data = await response.json() as { session?: Session; token?: string; error?: string };
      if (!response.ok || !data.session) throw new Error(data.error ?? "로그인에 실패했습니다.");
      if (data.token) setApiSessionToken(data.token);
      onLogin(data.session);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "로그인에 실패했습니다."); }
    finally { setBusy(false); }
  };
  return <main className="login-shell">
    <div className="login-ambient"><div /><div /><div /></div>
    <section className={`login-card login-card-${accessMode}`}>
      <Brand />
      <div className="login-copy"><span className="eyebrow">{accessCopy.eyebrow}</span><h1>{accessCopy.title}</h1><p>{accessCopy.detail}</p></div>
      <form onSubmit={submit} className="login-form">
        <label><span>아이디</span><input value={id} onChange={(event) => setId(event.target.value)} placeholder="조 번호, staff 또는 view" autoComplete="username" autoFocus /></label>
        <label><span>비밀번호</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="비밀번호 입력" autoComplete="current-password" /></label>
        {error && <div className="form-error">{error}</div>}
        <button disabled={busy || !id || !password}>{busy ? "확인 중..." : accessCopy.action}<span>→</span></button>
      </form>
      <div className="login-hint"><div><strong>참가 조</strong><span>숫자 ID · 거래 화면</span></div><div><strong>운영 스태프</strong><span>staff · 관리 전용</span></div><div><strong>공용 화면</strong><span>view · 읽기 전용</span></div></div>
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

function Topbar({ session, round, onLogout, presentation = false, started = true, clientTheme, onToggleTheme }: { session: Session; round: number; onLogout: () => void; presentation?: boolean; started?: boolean; clientTheme?: ClientTheme; onToggleTheme?: () => void }) {
  const marketLabel = !started ? "MARKET READY" : round === LAST_ROUND ? "MARKET CLOSED" : "MARKET OPEN";
  return <header className={`topbar ${presentation ? "presentation" : ""} ${session.role === "team" ? "client-topbar" : ""}`}>
    <Brand compact />
    <div className="market-center"><span className={`status-dot ${!started ? "pending" : round === LAST_ROUND ? "closed" : ""}`} /><span>{marketLabel}</span><strong>{started ? rounds[round].label : "시작 전"}</strong></div>
    <div className="account-actions">
      <span>{session.role === "staff" ? "STAFF CONTROL" : session.role === "view" ? "LIVE DISPLAY" : `${session.teamId}조 계정`}</span>
      {session.role === "team" && clientTheme && onToggleTheme && <button className={`client-theme-toggle ${clientTheme}`} aria-label={`${clientTheme === "dark" ? "화이트" : "다크"} 모드로 전환`} aria-pressed={clientTheme === "dark"} onClick={onToggleTheme}><i aria-hidden="true">{clientTheme === "dark" ? "☾" : "☀"}</i><strong>{clientTheme === "dark" ? "다크" : "화이트"}</strong></button>}
      <button onClick={onLogout}>로그아웃</button>
    </div>
  </header>;
}

function WaitingScreen({ session, onLogout }: { session: Session; onLogout: () => void }) {
  return <main className="app-shell"><Topbar session={session} round={0} onLogout={onLogout} started={false} /><section className="waiting-screen"><div className="waiting-orbit"><span>BE</span></div><span className="eyebrow">WAITING FOR STAFF</span><h1>게임 시작을 기다리고 있습니다</h1><p>스태프가 시드머니를 저장한 뒤 게임 시작 버튼을 누르면 자동으로 거래 화면이 열립니다.</p></section></main>;
}

function SeedSetup({ initial, onStarted, onOpenPriceBoard, onForceLogout, forceLogoutBusy }: { initial?: TeamView[] | null; onStarted: () => void | Promise<void>; onOpenPriceBoard: () => void; onForceLogout: (teamId: number) => void | Promise<void>; forceLogoutBusy: number | null }) {
  const [seeds, setSeeds] = useState(() => initial?.length
    ? [...initial].sort((left, right) => left.teamId - right.teamId).map((team) => team.seedMoney)
    : Array.from({ length: DEFAULT_TEAM_COUNT }, () => 1000));
  const [busy, setBusy] = useState<"save" | "start" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const persistSeeds = async () => {
    const response = await apiFetch("/api/game/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seeds }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error ?? "시드머니를 저장하지 못했습니다.");
  };
  const save = async () => {
    setBusy("save"); setError("");
    try {
      await persistSeeds();
      setSaved(true);
      await onStarted();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "시드머니를 저장하지 못했습니다."); }
    finally { setBusy(null); }
  };
  const start = async () => {
    if (!window.confirm("입력한 시드머니로 게임을 시작하고 기준가를 공개할까요?")) return;
    setBusy("start"); setError("");
    try {
      await persistSeeds();
      const response = await apiFetch("/api/game/start", { method: "POST" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "게임을 시작하지 못했습니다.");
      await onStarted();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "게임을 시작하지 못했습니다."); }
    finally { setBusy(null); }
  };
  const updateSeeds = (next: number[]) => { setSeeds(next); setSaved(false); };
  const setAll = (value: number) => updateSeeds(seeds.map(() => value));
  const addTeam = () => {
    if (seeds.length >= MAX_TEAM_COUNT) return;
    updateSeeds([...seeds, 1000]);
  };
  const removeTeam = () => {
    if (seeds.length <= 1) return;
    updateSeeds(seeds.slice(0, -1));
  };
  const onlineTeams = Array.from({ length: seeds.length }, (_, index) => initial?.find((team) => team.teamId === index + 1)).filter((team) => team?.online).length;
  return <section className="seed-page"><div className="seed-hero"><span className="eyebrow">GAME ADMINISTRATION</span><h1>게임 운영 초기 설정</h1><p>참가 조 구성과 초기 자산을 확정한 뒤 공용 진행 화면과 참가자 화면을 시작합니다.</p><div className="seed-admin-shortcuts"><button onClick={onOpenPriceBoard}>주가 시나리오 관리 <span>→</span></button></div><div className="team-count-control"><div><span>참가 조 구성</span><strong>현재 {seeds.length}개 조</strong><small>로그인 ID는 1부터 {seeds.length}까지 자동으로 배정됩니다.</small></div><div><button disabled={busy !== null || seeds.length <= 1} onClick={removeTeam}>− 마지막 조 삭제</button><button disabled={busy !== null || seeds.length >= MAX_TEAM_COUNT} onClick={addTeam}>＋ 조 추가</button></div></div><div className="seed-presets"><button onClick={() => setAll(1000)}>전체 1,000 BE</button><button onClick={() => setAll(1500)}>전체 1,500 BE</button><button onClick={() => setAll(2000)}>전체 2,000 BE</button></div></div><section className="seed-presence-board"><header><div><span className="eyebrow">TEAM CONNECTIONS</span><h2>조별 접속 상태</h2></div><strong><i />온라인 {onlineTeams}/{seeds.length}</strong></header><div>{seeds.map((_, index) => { const teamId = index + 1; const presence = initial?.find((team) => team.teamId === teamId); return <article className={presence?.online ? "online" : "offline"} key={teamId}><span><i />{teamId}조</span><em>{presence?.online ? "온라인" : "오프라인"}</em><button disabled={!presence || forceLogoutBusy === teamId} onClick={() => onForceLogout(teamId)}>{forceLogoutBusy === teamId ? "처리 중" : "강제 로그아웃"}</button></article>; })}</div></section><div className="seed-grid">{seeds.map((seed, index) => <label key={index}><span><i>{index + 1}</i>{index + 1}조</span><div><input type="number" min="1" step="100" value={seed} onChange={(event) => updateSeeds(seeds.map((value, itemIndex) => itemIndex === index ? Math.max(1, Math.floor(Number(event.target.value) || 1)) : value))} /><em>BE</em></div></label>)}</div>{error && <div className="form-error wide">{error}</div>}{saved && !error && <div className="setup-success" role="status">{seeds.length}개 조의 구성과 시드머니가 저장되었습니다. 참가자들은 아직 대기 중입니다.</div>}<div className="seed-actions"><button className="secondary-button" disabled={busy !== null} onClick={save}>{busy === "save" ? "저장 중..." : "구성·시드머니 저장"}</button><button className="primary-button" disabled={busy !== null} onClick={start}>{busy === "start" ? "게임 시작 중..." : "게임 시작 · 기준가 공개"}<span>→</span></button></div><p className="reset-warning">게임을 시작하면 공용 진행 화면과 1~{seeds.length}조의 화면이 약 2초 안에 전환됩니다.</p></section>;
}

function StockProfile({ stock }: { stock: Stock }) {
  return <section className="stock-profile" style={{ "--stock-accent": stock.color } as React.CSSProperties}>
    <div className="stock-profile-intro"><span className="eyebrow">COMPANY PROFILE</span><h3>{stock.sector}</h3><p>{stock.description}</p></div>
    <div className="revenue-block"><span>주요 수익원</span><div>{stock.revenueStreams.map((stream) => <em key={stream}>{stream}</em>)}</div></div>
    <div className="stock-profile-balance"><article className="growth"><span>GROWTH DRIVER</span><h4>성장 동력</h4><p>{stock.strength}</p></article><article className="risk"><span>CORE RISK</span><h4>핵심 리스크</h4><p>{stock.risk}</p></article></div>
    <div className="sensitivity-row"><span>사업 민감도</span><div>{Object.entries(stock.sensitivities).map(([label, value]) => <em key={label}><small>{label}</small><strong>{value}</strong></em>)}</div></div>
  </section>;
}

type ClientDetailView = "assets" | "trades";

function ClientDetailModal({ view, team, round, prices, onClose }: { view: ClientDetailView; team: TeamView; round: number; prices: PriceSchedule; onClose: () => void }) {
  const stockValue = team.totalAsset - team.cash;
  const pnl = team.totalAsset - team.seedMoney;
  const positions = stocks.flatMap((stock) => {
    const shares = team.holdings[stock.ticker] ?? 0;
    if (shares < 1) return [];
    const currentPrice = getStockPrice(stock.ticker, round, prices);
    return [{ stock, shares, currentPrice, value: shares * (currentPrice ?? 0) }];
  });

  return <div className="client-detail-modal" role="presentation" onMouseDown={onClose}>
    <section className="client-detail-dialog" role="dialog" aria-modal="true" aria-label={view === "assets" ? `${team.teamId}조 자산 상세` : `${team.teamId}조 전체 거래내역`} onMouseDown={(event) => event.stopPropagation()}>
      <button className="client-detail-close" aria-label="상세 화면 닫기" onClick={onClose}>×</button>
      <header className="client-detail-heading"><span>{view === "assets" ? "ASSET DETAILS" : "TRADE HISTORY"}</span><h2>{view === "assets" ? `${team.teamId}조 자산 상세` : "전체 거래내역"}</h2><p>{view === "assets" ? "현금과 보유 주식의 현재 평가액을 확인합니다." : `지금까지 체결된 매수·매도 ${team.trades.length}건을 모두 확인합니다.`}</p></header>
      {view === "assets" ? <>
        <div className="client-detail-metrics"><article className="primary"><span>현재 총 자산</span><strong>{money.format(team.totalAsset)} <em>BE</em></strong><small className={pnl >= 0 ? "up" : "down"}>{pnl >= 0 ? "+" : ""}{money.format(pnl)} BE</small></article><article><span>보유 현금</span><strong>{money.format(team.cash)} <em>BE</em></strong></article><article><span>주식 평가액</span><strong>{money.format(stockValue)} <em>BE</em></strong></article><article><span>시드머니</span><strong>{money.format(team.seedMoney)} <em>BE</em></strong></article></div>
        <div className="client-detail-table"><div className="client-detail-table-title"><h3>보유 종목</h3><span>{positions.length}개 종목</span></div><div><table><thead><tr><th>종목</th><th>보유 수량</th><th>현재가</th><th>평가액</th></tr></thead><tbody>{positions.map(({ stock, shares, currentPrice, value }) => <tr key={stock.ticker}><td><span className="client-detail-stock"><i style={{ background: stock.color }} /><span><strong>{stock.name}</strong><small>{stock.ticker}</small></span></span></td><td>{money.format(shares)}주</td><td>{currentPrice === null ? "상장 전" : `${money.format(currentPrice)} BE`}</td><td><strong>{money.format(value)} BE</strong></td></tr>)}{positions.length === 0 && <tr><td className="client-detail-empty" colSpan={4}>아직 보유한 주식이 없습니다.</td></tr>}</tbody></table></div></div>
      </> : <div className="client-detail-table trades"><div className="client-detail-table-title"><h3>체결 내역</h3><span>최신 거래순</span></div><div><table><thead><tr><th>라운드</th><th>구분</th><th>종목</th><th>수량</th><th>체결가</th><th>거래금액</th></tr></thead><tbody>{team.trades.map((tradeItem) => { const itemStock = stocks.find((item) => item.ticker === tradeItem.ticker); return <tr key={tradeItem.id}><td>{tradeItem.round === 0 ? "기준가" : `${tradeItem.round}R`}</td><td><span className={`client-detail-trade ${tradeItem.action}`}>{tradeItem.action === "buy" ? "매수" : "매도"}</span></td><td className="client-detail-company"><span><strong>{itemStock?.name ?? tradeItem.ticker}</strong><small>{tradeItem.ticker}</small></span></td><td>{money.format(tradeItem.quantity)}주</td><td>{money.format(tradeItem.price)} BE</td><td><strong className={tradeItem.action === "buy" ? "down" : "up"}>{tradeItem.action === "buy" ? "−" : "+"}{money.format(tradeItem.quantity * tradeItem.price)} BE</strong></td></tr>; })}{team.trades.length === 0 && <tr><td className="client-detail-empty" colSpan={6}>아직 거래 내역이 없습니다.</td></tr>}</tbody></table></div></div>}
    </section>
  </div>;
}

function TeamDashboard({ snapshot, refresh, onLogout }: { snapshot: Snapshot; refresh: () => Promise<void>; onLogout: () => void }) {
  const team = snapshot.team!;
  const round = snapshot.game.round;
  const prices = snapshot.market.prices;
  const [ticker, setTicker] = useState("IMMU");
  const [chartMode, setChartMode] = useState<ClientChartMode>("all");
  const [clientTheme, setClientTheme] = useState<ClientTheme>(() => {
    if (typeof window === "undefined") return "dark";
    const savedTheme = window.localStorage.getItem(CLIENT_THEME_KEY);
    return savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [detailView, setDetailView] = useState<ClientDetailView | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const stock = stocks.find((item) => item.ticker === ticker) ?? stocks[0];
  const price = getStockPrice(ticker, round, prices);
  const prior = round > 0 ? getStockPrice(ticker, round - 1, prices) : null;
  const change = price !== null && prior !== null ? ((price - prior) / prior) * 100 : null;
  const owned = team.holdings[ticker] ?? 0;
  const stockValue = team.totalAsset - team.cash;
  const pnl = team.totalAsset - team.seedMoney;
  const tradable = isStockTradable(ticker, round, prices);
  const maxBuyQuantity = tradable && price ? Math.min(MAX_ORDER_QUANTITY, Math.floor(team.cash / price)) : 0;
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
      const response = await apiFetch("/api/game/trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker, action, quantity: orderQuantity }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "주문을 처리하지 못했습니다.");
      setToast(`${stock.name} ${orderQuantity}주를 ${action === "buy" ? "매수" : "매도"}했습니다.`);
      setQuantity(1);
      await refresh();
    } catch (caught) {
      setToast(caught instanceof Error ? caught.message : "주문을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return <main className={`app-shell toss-client theme-${clientTheme}`}>
    <Topbar session={snapshot.session} round={round} onLogout={onLogout} clientTheme={clientTheme} onToggleTheme={toggleTheme} />
    <section className="client-dashboard">
      <div className="client-main-column">
        <section className="client-round-strip">
          <div><span>{round === 0 ? "장 시작" : `${round}R`}</span><div><strong>{rounds[round].theme}</strong><small>{rounds[round].detail}</small></div></div>
          <RoundProgress round={round} />
        </section>
        <section className="client-market-card">
          <header className="client-market-head">
            <div>
              <span className="client-kicker">{chartMode === "single" ? `${stock.ticker} · ${stock.field}` : "전체 주식시장"}</span>
              <div className="client-market-title">
                <h1>{chartMode === "single" ? stock.name : "시장 흐름"}</h1>
                {chartMode === "single" && <strong>{price === null ? "상장 전" : `${money.format(price)} BE`}<small className={change === null ? "neutral" : change >= 0 ? "up" : "down"}>{change === null ? "기준가" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}</small></strong>}
              </div>
            </div>
            <div className="client-chart-actions" aria-label="차트 보기 방식">
              <button className={chartMode === "all" ? "active" : ""} aria-pressed={chartMode === "all"} onClick={() => setChartMode("all")}>전체 차트</button>
              <button className={chartMode === "single" ? "active" : ""} aria-pressed={chartMode === "single"} onClick={() => setChartMode("single")}>단일 차트</button>
            </div>
          </header>
          <AllStocksChart round={round} prices={prices} selectedTicker={selectedChartTicker} tone={clientTheme} />
          <div className="client-stock-strip" aria-label="거래 종목 선택">
            {stocks.map((item) => {
              const itemPrice = getStockPrice(item.ticker, round, prices);
              const itemPrior = round > 0 ? getStockPrice(item.ticker, round - 1, prices) : null;
              const itemChange = itemPrice !== null && itemPrior !== null ? ((itemPrice - itemPrior) / itemPrior) * 100 : null;
              return <button aria-pressed={ticker === item.ticker} className={ticker === item.ticker ? "active" : ""} onClick={() => selectStock(item.ticker)} key={item.ticker}>
                <i style={{ background: item.color }} />
                <span><strong>{item.ticker}</strong><small>{item.name}</small></span>
                <em>{itemPrice === null ? "상장 전" : money.format(itemPrice)}<small className={itemChange === null ? "neutral" : itemChange >= 0 ? "up" : "down"}>{itemChange === null ? "—" : `${itemChange >= 0 ? "+" : ""}${itemChange.toFixed(0)}%`}</small></em>
              </button>;
            })}
          </div>
          {chartMode === "single" && <div className="client-stock-summary"><span style={{ background: stock.color }} /><p><strong>{stock.name}</strong>{stock.description}</p><button onClick={() => setProfileOpen(true)}>상세보기 →</button></div>}
        </section>
      </div>

      <aside className="client-side-column">
        <section className="client-account-card">
          <div className="client-account-top"><div><span>{team.teamId}조 총 자산</span><strong>{money.format(team.totalAsset)} <em>BE</em></strong></div><div className="client-account-side"><button className="client-card-link" onClick={() => setDetailView("assets")}>자산 상세</button><small className={pnl >= 0 ? "up" : "down"}>{pnl >= 0 ? "+" : ""}{money.format(pnl)} BE · {team.seedMoney ? `${pnl >= 0 ? "+" : ""}${((pnl / team.seedMoney) * 100).toFixed(1)}%` : "0%"}</small></div></div>
          <div className="client-account-metrics"><div><span>보유 현금</span><strong>{money.format(team.cash)}</strong></div><div><span>주식 평가액</span><strong>{money.format(stockValue)}</strong></div><div><span>시드머니</span><strong>{money.format(team.seedMoney)}</strong></div></div>
          <div className="client-holdings">{Object.entries(team.holdings).filter(([, shares]) => shares > 0).map(([holdingTicker, shares]) => <button key={holdingTicker} onClick={() => selectStock(holdingTicker)}><span>{holdingTicker}</span><strong>{shares}주</strong></button>)}{Object.values(team.holdings).every((shares) => shares <= 0) && <small>보유 주식이 없습니다</small>}</div>
        </section>

        <section className="client-order-card">
          <header><div><span>주문 종목</span><h2><i style={{ background: stock.color }} />{stock.name}<small>{stock.ticker}</small></h2></div><strong>{price === null ? "—" : `${money.format(price)} BE`}</strong></header>
          <div className="client-position"><span>현재 보유 <strong>{owned}주</strong></span><em className={tradable ? "open" : "closed"}>{tradable ? "거래 가능" : "거래 불가"}</em></div>
          <label className="client-quantity">
            <span>주문 수량 <small>매수 가능 {maxBuyQuantity}주 · 매도 가능 {maxSellQuantity}주</small></span>
            <div><button aria-label="수량 1주 줄이기" disabled={busy || orderQuantity <= minOrderQuantity} onClick={() => setQuantity(clampOrderQuantity(orderQuantity - 1, maxOrderQuantity))}>−</button><input aria-label="주문 수량" value={orderQuantity} min={minOrderQuantity} max={maxOrderQuantity} disabled={busy || maxOrderQuantity < 1} type="number" onChange={(event) => setQuantity(clampOrderQuantity(Number(event.target.value), maxOrderQuantity))} /><button aria-label="수량 1주 늘리기" disabled={busy || orderQuantity >= maxOrderQuantity} onClick={() => setQuantity(clampOrderQuantity(orderQuantity + 1, maxOrderQuantity))}>＋</button></div>
          </label>
          <div className="client-quick-quantity">{[1, 5, 10].map((value) => <button disabled={busy || orderQuantity >= maxOrderQuantity} onClick={() => setQuantity(clampOrderQuantity(orderQuantity + value, maxOrderQuantity))} key={value}>+{value}</button>)}<button disabled={busy || maxOrderQuantity < 1 || orderQuantity >= maxOrderQuantity} onClick={() => setQuantity(maxOrderQuantity)}>최대</button></div>
          <div className="client-order-total"><span>예상 주문금액</span><strong>{price === null || orderQuantity < 1 ? "—" : `${money.format(price * orderQuantity)} BE`}</strong></div>
          <div className="client-trade-actions"><button className="sell" disabled={busy || !tradable || orderQuantity < 1 || owned < orderQuantity} onClick={() => trade("sell")}>매도</button><button className="buy" disabled={busy || !tradable || orderQuantity < 1 || price === null || team.cash < price * orderQuantity} onClick={() => trade("buy")}>매수</button></div>
        </section>

        <section className="client-recent-card">
          <header><strong>최근 거래</strong><div><span>{team.trades.length}건</span><button className="client-card-link" onClick={() => setDetailView("trades")}>전체보기</button></div></header>
          <div>{team.trades.slice(0, 3).map((tradeItem) => <article key={tradeItem.id}><span className={tradeItem.action}>{tradeItem.action === "buy" ? "매수" : "매도"}</span><p><strong>{tradeItem.ticker}</strong><small>{tradeItem.quantity}주 · {money.format(tradeItem.price)} BE</small></p><em>{tradeItem.action === "buy" ? "−" : "+"}{money.format(tradeItem.quantity * tradeItem.price)}</em></article>)}{team.trades.length === 0 && <small className="client-empty">아직 거래 내역이 없습니다</small>}</div>
        </section>
      </aside>
    </section>

    {profileOpen && <div className="stock-profile-modal" role="presentation" onMouseDown={() => setProfileOpen(false)}><section role="dialog" aria-modal="true" aria-label={`${stock.name} 기업 상세정보`} onMouseDown={(event) => event.stopPropagation()}><button className="profile-close" aria-label="상세정보 닫기" onClick={() => setProfileOpen(false)}>×</button><header><span style={{ background: stock.color }} /><div><small>{stock.ticker} · {stock.english}</small><h2>{stock.name}</h2></div><strong>{price === null ? "상장 전" : `${money.format(price)} BE`}</strong></header><StockProfile stock={stock} /></section></div>}
    {detailView && <ClientDetailModal view={detailView} team={team} round={round} prices={prices} onClose={() => setDetailView(null)} />}
    {toast && <div className="toast">{toast}</div>}
  </main>;
}

function StaffTeamDetail({ team, round, prices, onBack, onCancelTrade, cancelTradeBusy }: { team: TeamView; round: number; prices: PriceSchedule; onBack: () => void; onCancelTrade: (trade: Trade) => void | Promise<void>; cancelTradeBusy: number | null }) {
  const stockValue = team.totalAsset - team.cash;
  const pnl = team.totalAsset - team.seedMoney;
  const canceledCount = team.trades.filter((trade) => trade.canceled_at).length;
  return <section className="staff-detail-page"><button className="back-button" onClick={onBack}>← 운영 관리 콘솔</button><div className="detail-heading"><div><span className="eyebrow">TEAM {team.teamId} ACTIVITY</span><h1>{team.teamId}조 거래 현황</h1><p>보유 주식과 라운드별 매수·매도 내역을 확인하고 잘못된 체결을 취소할 수 있습니다.</p></div><div className="detail-total"><span>현재 총 자산</span><strong>{money.format(team.totalAsset)} <em>BE</em></strong><small className={pnl >= 0 ? "up" : "down"}>{pnl >= 0 ? "+" : ""}{money.format(pnl)} BE</small></div></div><div className="detail-metrics"><div><span>시드머니</span><strong>{money.format(team.seedMoney)} BE</strong></div><div><span>보유 현금</span><strong>{money.format(team.cash)} BE</strong></div><div><span>주식 평가액</span><strong>{money.format(stockValue)} BE</strong></div><div><span>현재 라운드</span><strong>{round === 0 ? "장 시작" : `${round}R`}</strong></div></div><div className="detail-grid"><section className="panel table-panel"><div className="panel-title"><div><span className="eyebrow">POSITIONS</span><h2>보유 주식</h2></div></div><div className="data-table"><table><thead><tr><th>종목</th><th>보유 수량</th><th>현재가</th><th>평가액</th></tr></thead><tbody>{stocks.map((stock) => { const shares = team.holdings[stock.ticker] ?? 0; const price = getStockPrice(stock.ticker, round, prices); return shares > 0 ? <tr key={stock.ticker}><td><i style={{ background: stock.color }} /><strong>{stock.name}</strong><small>{stock.ticker}</small></td><td>{shares}주</td><td>{price === null ? "—" : `${money.format(price)} BE`}</td><td>{price === null ? "—" : `${money.format(price * shares)} BE`}</td></tr> : null; })}{Object.values(team.holdings).every((shares) => shares <= 0) && <tr><td colSpan={4} className="empty-cell">보유 주식이 없습니다.</td></tr>}</tbody></table></div></section><section className="panel table-panel trade-history"><div className="panel-title"><div><span className="eyebrow">ORDER HISTORY</span><h2>전체 매수·매도 내역</h2></div><span>{team.trades.length - canceledCount}건 유효{canceledCount ? ` · ${canceledCount}건 취소` : ""}</span></div><div className="data-table"><table><thead><tr><th>라운드</th><th>구분</th><th>종목</th><th>수량</th><th>체결가</th><th>금액</th><th>관리</th></tr></thead><tbody>{team.trades.map((trade) => { const stock = stocks.find((item) => item.ticker === trade.ticker)!; const canceled = Boolean(trade.canceled_at); const canCancel = !canceled && (trade.action === "buy" ? (team.holdings[trade.ticker] ?? 0) >= trade.quantity : team.cash >= trade.quantity * trade.price); return <tr className={canceled ? "canceled-trade-row" : ""} key={trade.id}><td>{trade.round === 0 ? "OPEN" : `${trade.round}R`}</td><td>{canceled ? <span className="trade-pill canceled">취소됨</span> : <span className={`trade-pill ${trade.action}`}>{trade.action === "buy" ? "매수" : "매도"}</span>}</td><td><strong>{stock.name}</strong><small>{stock.ticker}</small></td><td>{trade.quantity}주</td><td>{money.format(trade.price)} BE</td><td className={canceled ? "neutral" : trade.action === "buy" ? "down" : "up"}>{trade.action === "buy" ? "−" : "+"}{money.format(trade.quantity * trade.price)} BE</td><td><button className="trade-cancel-button" disabled={!canCancel || cancelTradeBusy === trade.id} title={!canCancel && !canceled ? "현재 잔액 또는 보유 수량으로 되돌릴 수 없습니다." : undefined} onClick={() => onCancelTrade(trade)}>{canceled ? "취소 완료" : cancelTradeBusy === trade.id ? "처리 중" : canCancel ? "거래 취소" : "취소 불가"}</button></td></tr>; })}{team.trades.length === 0 && <tr><td colSpan={7} className="empty-cell">아직 거래 내역이 없습니다.</td></tr>}</tbody></table></div></section></div></section>;
}

function ScenarioPriceChart({ stock, values, firstEditableRound, dirty, onChange }: { stock: Stock; values: Array<number | null>; firstEditableRound: number; dirty: Set<string>; onChange: (ticker: string, round: number, value: number) => void }) {
  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [hoveredRound, setHoveredRound] = useState<number | null>(null);
  const activeRoundRef = useRef<number | null>(null);
  const dragViewportRef = useRef<{ min: number; max: number } | null>(null);
  const calculatedViewport = useMemo(() => {
    const numeric = values.filter((value): value is number => value !== null);
    if (!numeric.length) return { min: 1, max: 101 };
    const rawMin = Math.min(...numeric);
    const rawMax = Math.max(...numeric);
    const spread = Math.max(rawMax - rawMin, rawMax * .22, 20);
    const step = niceScaleStep(spread / 5);
    const min = Math.max(1, Math.floor((rawMin - spread * .28) / step) * step);
    const max = Math.max(min + 10, Math.ceil((rawMax + spread * .28) / step) * step);
    return { min, max };
  }, [values]);
  const viewport = activeRound !== null && dragViewportRef.current ? dragViewportRef.current : calculatedViewport;

  const paint = useCallback((canvas: HTMLCanvasElement) => {
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { context, width, height } = prepared;
    const pad = { top: 38, right: 28, bottom: 50, left: 76 };
    const plotWidth = Math.max(1, width - pad.left - pad.right);
    const plotHeight = Math.max(1, height - pad.top - pad.bottom);
    const x = (round: number) => pad.left + (round / LAST_ROUND) * plotWidth;
    const y = (value: number) => pad.top + ((viewport.max - value) / (viewport.max - viewport.min)) * plotHeight;

    if (firstEditableRound > 0) {
      const lockEnd = Math.min(width - pad.right, x(Math.min(LAST_ROUND, firstEditableRound - .5)));
      context.fillStyle = "rgba(255,255,255,.025)";
      context.fillRect(pad.left, pad.top, Math.max(0, lockEnd - pad.left), plotHeight);
    }
    for (let grid = 0; grid <= 5; grid += 1) {
      const value = Math.round(viewport.max - (grid / 5) * (viewport.max - viewport.min));
      const py = y(value);
      context.strokeStyle = "rgba(187,207,232,.105)";
      context.lineWidth = 1;
      context.beginPath(); context.moveTo(pad.left, py); context.lineTo(width - pad.right, py); context.stroke();
      context.fillStyle = "#8090a6";
      context.font = "650 11px Arial";
      context.textAlign = "right";
      context.fillText(money.format(value), pad.left - 12, py + 4);
    }
    for (let round = 0; round <= LAST_ROUND; round += 1) {
      const px = x(round);
      context.strokeStyle = "rgba(187,207,232,.055)";
      context.beginPath(); context.moveTo(px, pad.top); context.lineTo(px, height - pad.bottom); context.stroke();
      context.fillStyle = round < firstEditableRound ? "#58667a" : round === firstEditableRound ? "#c9fa70" : "#91a0b5";
      context.font = round === firstEditableRound ? "750 11px Arial" : "650 10px Arial";
      context.textAlign = "center";
      context.fillText(round === 0 ? "기준" : `R${round}`, px, height - 18);
    }
    if (firstEditableRound <= LAST_ROUND) {
      context.save();
      context.setLineDash([5, 5]);
      context.strokeStyle = "rgba(183,243,76,.5)";
      context.lineWidth = 1.5;
      context.beginPath(); context.moveTo(x(firstEditableRound), pad.top); context.lineTo(x(firstEditableRound), height - pad.bottom); context.stroke();
      context.restore();
    }

    let segmentOpen = false;
    context.beginPath();
    values.slice(0, LAST_ROUND + 1).forEach((value, round) => {
      if (value === null) { segmentOpen = false; return; }
      if (!segmentOpen) { context.moveTo(x(round), y(value)); segmentOpen = true; }
      else context.lineTo(x(round), y(value));
    });
    context.strokeStyle = stock.color;
    context.lineWidth = 3;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.shadowColor = `${stock.color}55`;
    context.shadowBlur = 8;
    context.stroke();
    context.shadowBlur = 0;

    values.slice(0, LAST_ROUND + 1).forEach((value, round) => {
      const editable = round >= firstEditableRound;
      const focused = round === activeRound || round === hoveredRound;
      const changed = dirty.has(`${stock.ticker}:${round}`);
      const px = x(round);
      const py = y(value ?? viewport.min);
      context.beginPath();
      context.arc(px, py, focused ? 9 : editable ? 6.5 : 4.5, 0, Math.PI * 2);
      context.fillStyle = value === null ? "#0b1422" : editable ? stock.color : "#526177";
      context.fill();
      context.lineWidth = changed ? 3 : editable ? 2 : 1.5;
      context.strokeStyle = changed ? "#d9ff93" : editable ? "#f4f8ff" : "#7a889b";
      context.stroke();
      if (focused && editable) {
        const label = value === null ? "값 없음" : `${money.format(value)} BE`;
        context.font = "750 11px Arial";
        const bubbleWidth = context.measureText(label).width + 18;
        const bubbleX = Math.min(width - pad.right - bubbleWidth, Math.max(pad.left, px - bubbleWidth / 2));
        const bubbleY = Math.max(5, py - 35);
        context.fillStyle = "rgba(4,10,18,.96)";
        context.strokeStyle = stock.color;
        context.lineWidth = 1;
        context.beginPath(); context.roundRect(bubbleX, bubbleY, bubbleWidth, 25, 6); context.fill(); context.stroke();
        context.fillStyle = "#f7fbff";
        context.textAlign = "center";
        context.fillText(label, bubbleX + bubbleWidth / 2, bubbleY + 16.5);
      }
    });
    context.fillStyle = "#728198";
    context.font = "700 10px Arial";
    context.textAlign = "left";
    context.fillText("주가 (BE)", pad.left, 18);
  }, [activeRound, dirty, firstEditableRound, hoveredRound, stock, values, viewport]);
  const canvasRef = useCanvasPainter(paint, [paint]);

  const geometry = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const pad = { top: 38, right: 28, bottom: 50, left: 76 };
    return { rect, pad, plotWidth: Math.max(1, rect.width - pad.left - pad.right), plotHeight: Math.max(1, rect.height - pad.top - pad.bottom) };
  };
  const nearestEditableRound = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { rect, pad, plotWidth, plotHeight } = geometry(event.currentTarget);
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    let nearest: { round: number; distance: number } | null = null;
    for (let round = Math.max(0, firstEditableRound); round <= LAST_ROUND; round += 1) {
      const px = pad.left + (round / LAST_ROUND) * plotWidth;
      const value = values[round];
      const py = pad.top + ((viewport.max - (value ?? viewport.min)) / (viewport.max - viewport.min)) * plotHeight;
      const distance = Math.hypot(pointerX - px, pointerY - py);
      if (!nearest || distance < nearest.distance) nearest = { round, distance };
    }
    return nearest && nearest.distance <= 24 ? nearest.round : null;
  };
  const changeFromPointer = (event: React.PointerEvent<HTMLCanvasElement>, round: number) => {
    const { rect, pad, plotHeight } = geometry(event.currentTarget);
    const activeViewport = dragViewportRef.current ?? viewport;
    const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top - pad.top) / plotHeight));
    const value = Math.max(1, Math.round(activeViewport.max - ratio * (activeViewport.max - activeViewport.min)));
    onChange(stock.ticker, round, value);
  };
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const round = nearestEditableRound(event);
    if (round === null) return;
    event.preventDefault();
    dragViewportRef.current = viewport;
    activeRoundRef.current = round;
    setActiveRound(round);
    setHoveredRound(round);
    event.currentTarget.setPointerCapture(event.pointerId);
    changeFromPointer(event, round);
  };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeRoundRef.current !== null) {
      event.preventDefault();
      changeFromPointer(event, activeRoundRef.current);
      return;
    }
    setHoveredRound(nearestEditableRound(event));
  };
  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeRoundRef.current === null) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activeRoundRef.current = null;
    dragViewportRef.current = null;
    setActiveRound(null);
  };

  return <div className="scenario-canvas-shell">
    <canvas ref={canvasRef} className={`scenario-canvas ${activeRound !== null ? "dragging" : ""}`} aria-label={`${stock.name} 주가 시나리오 차트. 공개되지 않은 점을 위아래로 드래그해 1 BE 단위로 수정`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={() => { if (activeRoundRef.current === null) setHoveredRound(null); }} />
    <div className="scenario-chart-guide"><span><i style={{ background: stock.color }} />선을 따라 가격 흐름 확인</span><span><b />테두리가 밝은 점은 수정 가능</span><strong>점을 위·아래로 드래그 · 1 BE 단위</strong></div>
  </div>;
}

function PriceScheduleEditor({ snapshot, refresh, onBack, onLogout }: { snapshot: Snapshot; refresh: () => Promise<void>; onBack: () => void; onLogout: () => void }) {
  const [draft, setDraft] = useState<PriceSchedule>(() => Object.fromEntries(Object.entries(snapshot.market.prices).map(([ticker, values]) => [ticker, [...values]])));
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const [selectedTicker, setSelectedTicker] = useState(stocks[0].ticker);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const firstEditableRound = snapshot.game.started ? snapshot.game.round + 1 : 0;
  const updateDraft = (ticker: string, round: number, rawValue: string | number) => {
    const value = rawValue === "" ? null : Math.max(1, Math.min(100_000_000, Math.floor(Number(rawValue) || 1)));
    setDraft((current) => ({ ...current, [ticker]: current[ticker].map((price, index) => index === round ? value : price) }));
    setDirty((current) => new Set(current).add(`${ticker}:${round}`));
    setMessage("");
  };
  const close = () => {
    if (dirty.size && !window.confirm("저장하지 않은 주가 변경을 버리고 돌아갈까요?")) return;
    onBack();
  };
  const save = async () => {
    const updates = [...dirty].map((key) => {
      const [ticker, roundText] = key.split(":");
      const round = Number(roundText);
      return { ticker, round, price: draft[ticker][round] };
    });
    if (!updates.length) return;
    setBusy(true); setMessage("");
    try {
      const response = await apiFetch("/api/game/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates }) });
      const data = await response.json() as { error?: string; updated?: number };
      if (!response.ok) throw new Error(data.error ?? "주가 변동표를 저장하지 못했습니다.");
      setDirty(new Set());
      setMessage(`${data.updated ?? updates.length}개 주가를 저장했습니다.`);
      await refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "주가 변동표를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };
  return <main className="staff-shell price-editor-shell">
    <Topbar session={snapshot.session} round={snapshot.game.round} onLogout={onLogout} presentation started={snapshot.game.started} />
    <section className="price-editor-page">
      <header className="price-editor-heading"><div><button onClick={close}>← 운영 화면</button><span className="eyebrow">MARKET SCENARIO CONTROL</span><h1>주가 시나리오 관리</h1><p>지나간 라운드는 기록으로 잠기며, 아직 공개되지 않은 가격만 수정할 수 있습니다.</p></div><div><span className="price-lock-summary">{snapshot.game.started ? `${snapshot.game.round}라운드까지 잠김` : "게임 시작 전 · 전체 수정 가능"}</span><button className="price-save-button" disabled={busy || dirty.size === 0} onClick={save}>{busy ? "저장 중..." : `변경사항 저장${dirty.size ? ` · ${dirty.size}개` : ""}`}</button></div></header>
      <div className="price-editor-guide"><span>● 현재/진행 완료</span><span>● 다음 공개 라운드</span><span>빈칸은 해당 라운드 거래 불가</span>{message && <strong>{message}</strong>}</div>
      <section className="scenario-chart-panel"><header><div><span className="eyebrow">DRAG TO EDIT</span><h2>차트로 가격 수정</h2><p>종목을 선택한 뒤 공개되지 않은 점을 위아래로 움직이세요. 아래 표가 즉시 같은 값으로 바뀝니다.</p></div><em>{stocks.find((stock) => stock.ticker === selectedTicker)?.name}</em></header><div className="scenario-stock-tabs">{stocks.map((stock) => <button className={stock.ticker === selectedTicker ? "selected" : ""} onClick={() => setSelectedTicker(stock.ticker)} key={stock.ticker}><i style={{ background: stock.color }} /><span>{stock.name}</span><strong>{stock.ticker}</strong></button>)}</div><ScenarioPriceChart stock={stocks.find((stock) => stock.ticker === selectedTicker) ?? stocks[0]} values={draft[selectedTicker] ?? []} firstEditableRound={firstEditableRound} dirty={dirty} onChange={updateDraft} /></section>
      <div className="price-table-wrap"><table className="price-schedule-table"><thead><tr><th>종목</th>{Array.from({ length: LAST_ROUND + 1 }, (_, round) => <th className={round === firstEditableRound ? "next" : round < firstEditableRound ? "locked" : ""} key={round}><span>{round === 0 ? "기준가" : `${round}R`}</span><small>{round < firstEditableRound ? "잠김" : round === firstEditableRound ? "다음" : "미래"}</small></th>)}</tr></thead><tbody>{stocks.map((stock) => <tr key={stock.ticker}><th><i style={{ background: stock.color }} /><span><strong>{stock.name}</strong><small>{stock.ticker}</small></span></th>{Array.from({ length: LAST_ROUND + 1 }, (_, round) => {
        const value = draft[stock.ticker]?.[round] ?? null;
        const previous = round > 0 ? draft[stock.ticker]?.[round - 1] ?? null : null;
        const percent = value !== null && previous !== null && previous > 0 ? ((value - previous) / previous) * 100 : null;
        const locked = round < firstEditableRound;
        return <td className={`${locked ? "locked" : "editable"} ${round === firstEditableRound ? "next" : ""}`} key={round}>{locked ? <div className="locked-price"><strong>{value === null ? "—" : money.format(value)}</strong><small className={percent === null ? "neutral" : percent >= 0 ? "up" : "down"}>{percent === null ? "기준" : `${percent >= 0 ? "+" : ""}${percent.toFixed(0)}%`}</small></div> : <label><input aria-label={`${stock.name} ${round === 0 ? "기준가" : `${round}라운드`} 주가`} type="number" min="1" max="100000000" value={value ?? ""} placeholder="—" onChange={(event) => updateDraft(stock.ticker, round, event.target.value)} /><small className={percent === null ? "neutral" : percent >= 0 ? "up" : "down"}>{percent === null ? "거래 불가" : `${percent >= 0 ? "+" : ""}${percent.toFixed(0)}%`}</small></label>}</td>;
      })}</tr>)}</tbody></table></div>
      <p className="price-editor-footnote">저장한 가격은 모든 스태프·참가자 화면과 실제 매수·매도 체결가에 즉시 적용됩니다. 참가자에게는 현재 라운드까지의 가격만 공개됩니다.</p>
    </section>
  </main>;
}

function StaffDashboard({ snapshot, refresh, onLogout, onOpenPriceBoard, onForceLogout, forceLogoutBusy, onCancelTrade, cancelTradeBusy }: { snapshot: Snapshot; refresh: () => Promise<void>; onLogout: () => void; onOpenPriceBoard: () => void; onForceLogout: (teamId: number) => void | Promise<void>; forceLogoutBusy: number | null; onCancelTrade: (trade: Trade) => void | Promise<void>; cancelTradeBusy: number | null }) {
  const teams = useMemo(() => (snapshot.teams ?? []).filter(isTeamView), [snapshot.teams]);
  const auditLogs = snapshot.auditLogs ?? [];
  const round = snapshot.game.round;
  const prices = snapshot.market.prices;
  const [detailTeam, setDetailTeam] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const onlineCount = teams.filter((team) => team.online).length;
  const totalTrades = teams.reduce((sum, team) => sum + team.trades.filter((trade) => !trade.canceled_at).length, 0);
  const totalAssets = teams.reduce((sum, team) => sum + team.totalAsset, 0);
  const recentActivity = useMemo(() => teams.flatMap((team) => team.trades.filter((trade) => !trade.canceled_at).map((trade) => ({ ...trade, teamId: team.teamId }))).sort((left, right) => right.id - left.id).slice(0, 8), [teams]);
  const nextEvent = round < LAST_ROUND ? rounds[round + 1] : null;
  const advance = async () => {
    if (!window.confirm(`${round + 1}라운드 주가를 공개할까요?`)) return;
    setBusy(true);
    try { const response = await apiFetch("/api/game/round", { method: "POST" }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error ?? "라운드를 진행하지 못했습니다."); await refresh(); }
    catch (caught) { window.alert(caught instanceof Error ? caught.message : "라운드를 진행하지 못했습니다."); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    if (!window.confirm("게임을 초기화할까요? 거래 내역·보유 주식이 삭제되고, 주가 변동표와 시드머니가 기본값으로 돌아갑니다.")) return;
    setBusy(true);
    try {
      const response = await apiFetch("/api/game/reset", { method: "POST" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "게임을 초기화하지 못했습니다.");
      setDetailTeam(null);
      await refresh();
    } catch (caught) { window.alert(caught instanceof Error ? caught.message : "게임을 초기화하지 못했습니다."); }
    finally { setBusy(false); }
  };
  const selected = detailTeam ? teams.find((team) => team.teamId === detailTeam) : null;
  if (selected) return <main className="staff-shell"><Topbar session={snapshot.session} round={round} onLogout={onLogout} presentation /><StaffTeamDetail team={selected} round={round} prices={prices} onBack={() => setDetailTeam(null)} onCancelTrade={onCancelTrade} cancelTradeBusy={cancelTradeBusy} /></main>;
  return <main className="staff-shell admin-shell">
    <Topbar session={snapshot.session} round={round} onLogout={onLogout} presentation />
    <section className="admin-console">
      <header className="admin-heading"><div><span className="eyebrow">GAME OPERATIONS</span><h1>운영 관리 콘솔</h1><p>게임 상태와 참가 조 접속·거래를 관리합니다. 발표용 정보는 view 화면에 분리되어 있습니다.</p></div><div className="admin-heading-actions"><button onClick={onOpenPriceBoard}>주가 시나리오 관리</button><button className="danger" disabled={busy} onClick={reset}>게임 초기화</button></div></header>
      <section className="admin-metric-grid"><article><span>진행 상태</span><strong>{round === 0 ? "장 시작" : `${round}라운드`}</strong><small>{round}/10 진행</small></article><article><span>참가 조 접속</span><strong>{onlineCount}<em> / {teams.length}</em></strong><small>{teams.length - onlineCount}개 조 오프라인</small></article><article><span>누적 체결</span><strong>{money.format(totalTrades)}<em>건</em></strong><small>전체 조 거래 합계</small></article><article><span>전체 총자산</span><strong>{money.format(totalAssets)}<em> BE</em></strong><small>실시간 평가 기준</small></article></section>
      <section className="admin-workspace">
        <div className="panel admin-team-panel"><div className="admin-panel-heading"><div><span className="eyebrow">TEAM MANAGEMENT</span><h2>참가 조 관리</h2></div><span className="admin-live-count"><i />{onlineCount} online</span></div><div className="admin-team-table"><table><thead><tr><th>조</th><th>접속</th><th>총 자산</th><th>수익률</th><th>현금</th><th>거래</th><th>계정 작업</th></tr></thead><tbody>{teams.map((team) => { const returnRate = team.seedMoney ? ((team.totalAsset - team.seedMoney) / team.seedMoney) * 100 : 0; const activeTrades = team.trades.filter((trade) => !trade.canceled_at).length; return <tr key={team.teamId}><td><button className="admin-team-link" onClick={() => setDetailTeam(team.teamId)}>{team.teamId}조</button></td><td><span className={`admin-presence ${team.online ? "online" : "offline"}`}><i />{team.online ? "온라인" : "오프라인"}</span></td><td><strong>{money.format(team.totalAsset)} BE</strong></td><td><span className={returnRate >= 0 ? "up" : "down"}>{returnRate >= 0 ? "+" : ""}{returnRate.toFixed(1)}%</span></td><td>{money.format(team.cash)} BE</td><td>{activeTrades}건</td><td><div className="admin-row-actions"><button onClick={() => setDetailTeam(team.teamId)}>상세</button><button className="logout" disabled={forceLogoutBusy === team.teamId} onClick={() => onForceLogout(team.teamId)}>{forceLogoutBusy === team.teamId ? "처리 중" : "강제 로그아웃"}</button></div></td></tr>; })}</tbody></table></div></div>
        <aside className="admin-side-column">
          <section className="panel admin-round-panel"><div className="admin-panel-heading"><div><span className="eyebrow">ROUND CONTROL</span><h2>라운드 제어</h2></div><strong>R{round}</strong></div><div className="admin-current-event"><span>현재 공지</span><h3>{rounds[round].theme}</h3><p>{rounds[round].detail}</p></div>{nextEvent && <div className="admin-next-event"><span>다음 공개</span><strong>R{round + 1} · {nextEvent.theme}</strong></div>}<button className="admin-advance" disabled={busy || round >= LAST_ROUND} onClick={advance}>{round >= LAST_ROUND ? "모든 라운드 종료" : `R${round + 1} 공개 및 진행`}<span>→</span></button><RoundProgress round={round} /></section>
          <section className="panel admin-activity-panel"><div className="admin-panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>최근 체결 · 취소 관리</h2></div><span>{recentActivity.length}건 표시</span></div><div className="admin-activity-list">{recentActivity.map((trade) => { const team = teams.find((item) => item.teamId === trade.teamId); const canCancel = Boolean(team) && (trade.action === "buy" ? (team?.holdings[trade.ticker] ?? 0) >= trade.quantity : (team?.cash ?? 0) >= trade.quantity * trade.price); return <article key={trade.id}><span className={trade.action}>{trade.action === "buy" ? "매수" : "매도"}</span><p><strong>{trade.teamId}조 · {trade.ticker}</strong><small>R{trade.round} · {trade.quantity}주 × {money.format(trade.price)} BE</small></p><em>{money.format(trade.quantity * trade.price)} BE</em><button className="activity-cancel-button" disabled={!canCancel || cancelTradeBusy === trade.id} onClick={() => onCancelTrade(trade)}>{cancelTradeBusy === trade.id ? "처리 중" : canCancel ? "취소" : "불가"}</button></article>; })}{recentActivity.length === 0 && <p className="admin-empty">아직 체결된 거래가 없습니다.</p>}</div></section>
          <section className="panel admin-audit-panel"><div className="admin-panel-heading"><div><span className="eyebrow">ADMIN AUDIT LOG</span><h2>운영 감사 로그</h2></div><span>최근 {auditLogs.length}건</span></div><div className="admin-audit-list">{auditLogs.map((log) => <article key={log.id}><i>{log.id}</i><p><strong>{log.summary}</strong><small>{log.actor} · {new Date(`${log.createdAt}Z`).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></p><span>{log.action.replaceAll("_", " ")}</span></article>)}{auditLogs.length === 0 && <p className="admin-empty">아직 기록된 관리자 조작이 없습니다.</p>}</div></section>
        </aside>
      </section>
    </section>
  </main>;
}

function ViewDashboard({ snapshot, onLogout }: { snapshot: Snapshot; onLogout: () => void }) {
  const teams = useMemo(() => (snapshot.teams ?? []).filter(isViewTeamPerformance), [snapshot.teams]);
  const round = snapshot.game.round;
  const prices = snapshot.market.prices;
  const [fullscreen, setFullscreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("fullscreenchange", update); document.removeEventListener("keydown", closeOnEscape); };
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const timer = window.setTimeout(() => setMenuOpen(false), 7000);
    return () => window.clearTimeout(timer);
  }, [menuOpen]);
  const standings = useMemo(() => [...teams].sort((left, right) => right.returnRate - left.returnRate), [teams]);
  const brief = viewRoundBriefs[round];
  const maxReturn = Math.max(1, ...standings.map((team) => Math.abs(team.returnRate)));
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    setMenuOpen(false);
  };
  return <main className={`view-shell ${teams.length > 16 ? "dense" : ""}`}>
    {!menuOpen && <button className="view-menu-trigger" aria-expanded="false" aria-controls="view-control-bar" onClick={() => setMenuOpen(true)}><span>☰</span> 화면 메뉴</button>}
    {menuOpen && <button className="view-menu-backdrop" aria-label="화면 메뉴 닫기" onClick={() => setMenuOpen(false)} />}
    {menuOpen && <header className="view-control-bar" id="view-control-bar"><Brand compact /><div className="view-market-status"><i className={!snapshot.game.started ? "ready" : round >= LAST_ROUND ? "closed" : ""} /><span>{!snapshot.game.started ? "GAME READY" : round >= LAST_ROUND ? "MARKET CLOSED" : "LIVE MARKET"}</span><strong>{snapshot.game.started ? rounds[round].label : "시작 대기"}</strong></div><div className="view-screen-actions"><button onClick={toggleFullscreen}>{fullscreen ? "전체화면 종료" : "전체화면"}</button><button onClick={onLogout}>로그아웃</button><button aria-label="화면 메뉴 닫기" onClick={() => setMenuOpen(false)}>닫기 ×</button></div></header>}
    <section className="view-event-banner" key={`${snapshot.game.started}-${round}`}><div className="view-round-mark"><span>{round === 0 ? "OPEN" : "ROUND"}</span><strong>{round}</strong><small>/ 10</small></div><div className="view-event-copy"><span className="eyebrow">{snapshot.game.started ? "CURRENT MARKET EVENT" : "MARKET PREPARATION"}</span><h1>{snapshot.game.started ? rounds[round].theme : "게임 시작을 준비하고 있습니다"}</h1><p>{snapshot.game.started ? rounds[round].detail : "스태프가 참가 조와 시드머니를 확인한 뒤 시장을 시작합니다."}</p></div><div className="view-event-tags">{brief.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section>
    <section className="view-dashboard-grid">
      <section className="view-market-card"><header><div><span className="eyebrow">LIVE MARKET OVERVIEW</span><h2>전체 시장 · 실제 주가</h2></div><span>2초마다 자동 갱신</span></header><AllStocksChart round={round} prices={prices} tone="projector" /><div className="view-chart-legend" aria-label="종목 색상 범례">{stocks.map((stock) => <span key={stock.ticker}><i style={{ background: stock.color }} /><strong>{stock.name}</strong><small>{stock.ticker}</small></span>)}</div></section>
      <aside className="view-ranking-card"><header><div><span className="eyebrow">TEAM PERFORMANCE</span><h2>조별 수익률</h2></div><span>자산 비공개 · {teams.length}개 조</span></header><div className="view-ranking-grid">{standings.map((team, index) => <article key={team.teamId}><i>{index + 1}</i><div><strong>{team.teamId}조</strong><span><b style={{ width: `${Math.max(3, Math.abs(team.returnRate) / maxReturn * 100)}%` }} className={team.returnRate >= 0 ? "positive" : "negative"} /></span></div><em className={team.returnRate >= 0 ? "up" : "down"}>{team.returnRate >= 0 ? "+" : ""}{team.returnRate.toFixed(1)}%</em></article>)}</div><section className="view-reference"><span>MARKET NOTE</span><strong>이번 라운드 참고 포인트</strong><p>{brief.note}</p></section></aside>
    </section>
  </main>;
}

function MiniQuote({ price, change }: { price: number | null; change: number | null }) {
  return <div className="mini-quote"><strong>{price === null ? "상장 전" : `${money.format(price)} BE`}</strong><span className={change === null ? "neutral" : change >= 0 ? "up" : "down"}>{change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`}</span></div>;
}

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [priceBoardOpen, setPriceBoardOpen] = useState(false);
  const [forceLogoutBusy, setForceLogoutBusy] = useState<number | null>(null);
  const [cancelTradeBusy, setCancelTradeBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await apiFetch("/api/game", { cache: "no-store" });
    if (response.status === 401) { clearApiSessionToken(); setSession(null); setSnapshot(null); return; }
    const data = await response.json() as Snapshot & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "게임 정보를 불러오지 못했습니다.");
    if (!data.market?.prices) {
      data.market = {
        prices: Object.fromEntries(stocks.map((stock) => [stock.ticker, [...stock.prices]])),
      };
    }
    setSnapshot(data); setSession(data.session); setError("");
  }, []);

  const forceLogoutTeam = useCallback(async (teamId: number) => {
    if (!window.confirm(`${teamId}조를 강제 로그아웃할까요? 해당 조의 현재 로그인은 즉시 해제됩니다.`)) return;
    setForceLogoutBusy(teamId);
    try {
      const response = await apiFetch("/api/game/force-logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "강제 로그아웃하지 못했습니다.");
      await refresh();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "강제 로그아웃하지 못했습니다.");
    } finally {
      setForceLogoutBusy(null);
    }
  }, [refresh]);

  const cancelTrade = useCallback(async (trade: Trade) => {
    if (!window.confirm(`${trade.team_id}조의 ${trade.ticker} ${trade.action === "buy" ? "매수" : "매도"} ${trade.quantity}주 거래를 취소할까요?\n현금과 보유 수량이 체결 전 상태로 되돌아갑니다.`)) return;
    setCancelTradeBusy(trade.id);
    try {
      const response = await apiFetch("/api/game/cancel-trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tradeId: trade.id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "거래를 취소하지 못했습니다.");
      await refresh();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "거래를 취소하지 못했습니다.");
    } finally {
      setCancelTradeBusy(null);
    }
  }, [refresh]);

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
  const logout = async () => { await apiFetch("/api/auth", { method: "DELETE" }); clearApiSessionToken(); setPriceBoardOpen(false); setSession(null); setSnapshot(null); };

  if (session === undefined) return <main className="loading-shell"><Brand /><div className="loading-line"><span /></div><p>시장을 불러오고 있습니다</p></main>;
  if (!session) return <><LoginScreen onLogin={login} />{error && <div className="toast error">{error}</div>}</>;
  if (!snapshot) return <main className="loading-shell"><Brand /><div className="loading-line"><span /></div><p>게임 데이터를 연결하고 있습니다</p></main>;
  if (session.role === "staff" && priceBoardOpen) return <PriceScheduleEditor snapshot={snapshot} refresh={refresh} onBack={() => setPriceBoardOpen(false)} onLogout={logout} />;
  if (session.role === "view") return <ViewDashboard snapshot={snapshot} onLogout={logout} />;
  if (!snapshot.game.started) {
    if (session.role === "staff") return <main className="staff-shell"><Topbar session={session} round={0} onLogout={logout} presentation started={false} /><SeedSetup initial={(snapshot.teams ?? []).filter(isTeamView)} onStarted={refresh} onOpenPriceBoard={() => setPriceBoardOpen(true)} onForceLogout={forceLogoutTeam} forceLogoutBusy={forceLogoutBusy} /></main>;
    return <WaitingScreen session={session} onLogout={logout} />;
  }
  return session.role === "staff" ? <StaffDashboard snapshot={snapshot} refresh={refresh} onLogout={logout} onOpenPriceBoard={() => setPriceBoardOpen(true)} onForceLogout={forceLogoutTeam} forceLogoutBusy={forceLogoutBusy} onCancelTrade={cancelTrade} cancelTradeBusy={cancelTradeBusy} /> : <TeamDashboard snapshot={snapshot} refresh={refresh} onLogout={logout} />;
}
