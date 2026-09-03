"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LAST_ROUND, rounds, stocks } from "../game-data";
import { AllStocksChart } from "./charts";
import { Brand } from "./common";
import { VIEW_THEME_KEY, viewRoundBriefs } from "./constants";
import {
  isViewTeamPerformance,
  type ClientTheme,
  type Snapshot,
  type ViewTeamPerformance,
} from "./types";

type RankingWindow = "cumulative" | "assets";

function signedRate(value: number, fractionDigits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(fractionDigits)}%`;
}

function sortByRate(
  teams: ViewTeamPerformance[],
  key: "returnRate" | "roundReturnRate",
) {
  return [...teams].sort(
    (left, right) =>
      right[key] - left[key] || left.teamId - right.teamId,
  );
}

export function ViewDashboard({
  snapshot,
  onLogout,
}: {
  snapshot: Snapshot;
  onLogout: () => void;
}) {
  const rawTeams = useMemo(
    () => (snapshot.teams ?? []).filter(isViewTeamPerformance),
    [snapshot.teams],
  );
  const rankingDataReady = rawTeams.every(
    (team) =>
      Number.isFinite(team.roundReturnRate) &&
      Number.isInteger(team.assetRank) &&
      team.assetRank > 0,
  );
  const teams = useMemo(
    () =>
      rawTeams.map((team, index) => ({
        ...team,
        roundReturnRate: Number.isFinite(team.roundReturnRate)
          ? team.roundReturnRate
          : 0,
        assetRank:
          Number.isInteger(team.assetRank) && team.assetRank > 0
            ? team.assetRank
            : index + 1,
      })),
    [rawTeams],
  );
  const round = snapshot.game.round;
  const prices = snapshot.market.prices;
  const [fullscreen, setFullscreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rankingWindow, setRankingWindow] =
    useState<RankingWindow | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const menuCloseRef = useRef<HTMLButtonElement>(null);
  const menuWasOpenRef = useRef(false);
  const rankingDialogRef = useRef<HTMLDialogElement>(null);
  const [viewTheme, setViewTheme] = useState<ClientTheme>(() => {
    if (typeof window === "undefined") return "dark";
    const savedTheme = window.localStorage.getItem(VIEW_THEME_KEY);
    return savedTheme === "light" || savedTheme === "dark"
      ? savedTheme
      : "dark";
  });
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen((current) => (current ? false : current));
      }
    };
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  useEffect(() => {
    let animationFrame = 0;
    if (menuOpen) {
      menuWasOpenRef.current = true;
      animationFrame = window.requestAnimationFrame(() => {
        menuCloseRef.current?.focus();
      });
    } else if (menuWasOpenRef.current) {
      menuWasOpenRef.current = false;
      animationFrame = window.requestAnimationFrame(() => {
        menuTriggerRef.current?.focus();
      });
    }
    return () => window.cancelAnimationFrame(animationFrame);
  }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const handleMenuTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const menu = menuRef.current;
      if (!menu) return;
      const focusable = Array.from(
        menu.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleMenuTab);
    return () => document.removeEventListener("keydown", handleMenuTab);
  }, [menuOpen]);
  useEffect(() => {
    const dialog = rankingDialogRef.current;
    if (!dialog) return;
    if (rankingWindow && !dialog.open) dialog.showModal();
    if (!rankingWindow && dialog.open) dialog.close();
  }, [rankingWindow]);
  const roundStandings = useMemo(
    () => sortByRate(teams, "roundReturnRate"),
    [teams],
  );
  const cumulativeStandings = useMemo(
    () => sortByRate(teams, "returnRate"),
    [teams],
  );
  const assetStandings = useMemo(
    () =>
      [...teams].sort(
        (left, right) =>
          left.assetRank - right.assetRank || left.teamId - right.teamId,
      ),
    [teams],
  );
  const brief = viewRoundBriefs[round];
  const maxRoundReturn = Math.max(
    1,
    ...roundStandings.map((team) => Math.abs(team.roundReturnRate)),
  );
  const maxCumulativeReturn = Math.max(
    1,
    ...cumulativeStandings.map((team) => Math.abs(team.returnRate)),
  );
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    setMenuOpen(false);
  };
  const toggleTheme = () => {
    setViewTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem(VIEW_THEME_KEY, next);
      return next;
    });
    setMenuOpen(false);
  };
  const openRankingWindow = (window: RankingWindow) => {
    setMenuOpen(false);
    setRankingWindow(window);
  };
  const rankingTeams =
    rankingWindow === "assets" ? assetStandings : cumulativeStandings;
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={`view-shell theme-${viewTheme} ${teams.length > 16 ? "dense" : ""}`}
    >
      <button
        ref={menuTriggerRef}
        type="button"
        className="view-menu-trigger"
        aria-expanded={menuOpen}
        aria-controls="view-control-bar"
        aria-label={menuOpen ? "화면 메뉴 닫기" : "화면 메뉴 열기"}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span aria-hidden="true">☰</span> 화면 메뉴
      </button>
      {menuOpen && (
        <div
          className="view-menu-backdrop"
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
        />
      )}
      {menuOpen && (
        <header
          ref={menuRef}
          className="view-control-bar"
          id="view-control-bar"
          role="dialog"
          aria-modal="true"
          aria-label="공용 화면 설정"
        >
          <Brand compact />
          <div className="view-market-status">
            <i
              className={
                !snapshot.game.started
                  ? "ready"
                  : round >= LAST_ROUND
                    ? "closed"
                    : ""
              }
            />
            <span>
              {!snapshot.game.started
                ? "게임 준비"
                : round >= LAST_ROUND
                  ? "시장 종료"
                  : "시장 진행 중"}
            </span>
            <strong>
              {snapshot.game.started ? rounds[round].label : "시작 대기"}
            </strong>
          </div>
          <div className="view-screen-actions">
            <button
              type="button"
              className="view-theme-toggle"
              aria-label={`${viewTheme === "dark" ? "화이트" : "블랙"} 모드로 전환`}
              aria-pressed={viewTheme === "light"}
              onClick={toggleTheme}
            >
              <span aria-hidden="true">{viewTheme === "dark" ? "☀" : "☾"}</span>
              {viewTheme === "dark" ? "화이트" : "블랙"}
            </button>
            <button
              type="button"
              className="view-primary-action"
              aria-pressed={fullscreen}
              onClick={toggleFullscreen}
            >
              {fullscreen ? "전체화면 종료" : "전체화면"}
            </button>
            <button type="button" onClick={onLogout}>
              로그아웃
            </button>
            <button
              ref={menuCloseRef}
              type="button"
              aria-label="화면 메뉴 닫기"
              onClick={() => setMenuOpen(false)}
            >
              닫기 ×
            </button>
          </div>
        </header>
      )}
      <dialog
        ref={rankingDialogRef}
        className="view-rank-dialog"
        aria-labelledby="view-rank-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          setRankingWindow(null);
        }}
        onClose={() => setRankingWindow(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setRankingWindow(null);
        }}
      >
        {rankingWindow && (
          <section className="view-rank-window">
            <header className="view-rank-window-header">
              <div>
                <span>
                  실시간 순위 · {round === 0 ? "기준 시점" : `${round}라운드`}
                </span>
                <h2 id="view-rank-dialog-title">
                  {rankingWindow === "cumulative"
                    ? "전체 누적 수익률 순위"
                    : "전체 자산 순위"}
                </h2>
                <p>
                  {rankingWindow === "cumulative"
                    ? "시드머니 대비 현재까지의 실제 누적 수익률입니다."
                    : "총자산이 높은 순서만 공개하며 실제 BE 금액은 표시하지 않습니다."}
                </p>
              </div>
              <div className="view-rank-window-actions">
                <nav aria-label="순위 화면 전환">
                  <button
                    type="button"
                    className={
                      rankingWindow === "cumulative" ? "selected" : ""
                    }
                    aria-pressed={rankingWindow === "cumulative"}
                    onClick={() => setRankingWindow("cumulative")}
                  >
                    누적 수익률
                  </button>
                  <button
                    type="button"
                    className={rankingWindow === "assets" ? "selected" : ""}
                    aria-pressed={rankingWindow === "assets"}
                    onClick={() => setRankingWindow("assets")}
                  >
                    전체 자산
                  </button>
                </nav>
                <button
                  type="button"
                  className="view-rank-window-close"
                  onClick={() => setRankingWindow(null)}
                >
                  공용 화면으로 돌아가기
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </header>
            <ol
              className={`view-rank-board ${rankingWindow === "assets" ? "assets" : "cumulative"}`}
              aria-label={
                rankingWindow === "cumulative"
                  ? "전체 누적 수익률 순위"
                  : "전체 자산 순위, 자산 금액 비공개"
              }
            >
              {rankingTeams.map((team, index) => {
                const displayRank =
                  rankingWindow === "assets" ? team.assetRank : index + 1;
                return (
                  <li
                    key={team.teamId}
                    className={
                      displayRank <= 3 ? `rank-${displayRank}` : undefined
                    }
                    aria-label={
                      rankingWindow === "cumulative"
                        ? `${displayRank}위, ${team.teamId}조, 누적 수익률 ${signedRate(team.returnRate, 2)}`
                        : `${displayRank}위, ${team.teamId}조, 자산 금액 비공개`
                    }
                  >
                    <span className="view-rank-position">
                      <strong>{displayRank}</strong>
                      <small>위</small>
                    </span>
                    <div className="view-rank-team">
                      <strong>{team.teamId}조</strong>
                      <span>
                        {rankingWindow === "cumulative"
                          ? "누적 수익률"
                          : "총자산 순위"}
                      </span>
                    </div>
                    {rankingWindow === "cumulative" ? (
                      <div className="view-rank-result">
                        <em
                          className={team.returnRate >= 0 ? "up" : "down"}
                        >
                          {signedRate(team.returnRate, 2)}
                        </em>
                        <span aria-hidden="true">
                          <b
                            className={
                              team.returnRate >= 0 ? "positive" : "negative"
                            }
                            style={{
                              width: `${team.returnRate === 0 ? 0 : Math.max(4, (Math.abs(team.returnRate) / maxCumulativeReturn) * 100)}%`,
                            }}
                          />
                        </span>
                      </div>
                    ) : (
                      <div className="view-rank-private" aria-hidden="true">
                        <span>비공개</span>
                        <strong>BE 금액 비공개</strong>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <footer>
              <span aria-hidden="true" />
              게임 서버의 최신 기록을 2초마다 반영합니다.
            </footer>
          </section>
        )}
      </dialog>
      <section
        className="view-event-banner"
        key={`${snapshot.game.started}-${round}`}
      >
        <div className="view-round-mark">
          <span>{round === 0 ? "기준가" : "라운드"}</span>
          <strong>{round}</strong>
          <small>/ {LAST_ROUND}</small>
        </div>
        <div className="view-event-copy view-event-copy-compact">
          <span className="eyebrow">
            {snapshot.game.started
              ? "현재 라운드 주요 공지"
              : "게임 시작 전 안내"}
          </span>
          <h1>
            {snapshot.game.started
              ? rounds[round].theme
              : "게임 시작을 준비하고 있습니다"}
          </h1>
          <p>
            {snapshot.game.started
              ? rounds[round].detail
              : "스태프가 참가 조와 시드머니를 확인한 뒤 시장을 시작합니다."}
          </p>
        </div>
        <div className="view-event-tags">
          {brief.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </section>
      <section className="view-dashboard-grid">
        <section className="view-market-card">
          <header>
            <h2>{round === 0 ? "전체 종목 기준가" : "전체 종목 주가 흐름"}</h2>
          </header>
          {round === 0 ? (
            <div
              className="view-baseline-board"
              role="list"
              aria-label="전체 종목 기준가"
            >
              {stocks.map((stock) => {
                const price = (prices[stock.ticker] ?? stock.prices)[0];
                return (
                  <article
                    key={stock.ticker}
                    role="listitem"
                    aria-label={`${stock.name} ${stock.ticker}, ${price === null ? "공개 전" : `기준가 ${price} BE`}`}
                  >
                    <i style={{ background: stock.color }} aria-hidden="true" />
                    <div>
                      <strong>{stock.ticker}</strong>
                      <span>{stock.name}</span>
                    </div>
                    <em>{price === null ? "공개 전" : `${price.toLocaleString("ko-KR")} BE`}</em>
                  </article>
                );
              })}
            </div>
          ) : (
            <>
              <AllStocksChart
                round={round}
                prices={prices}
                tone={viewTheme === "light" ? "projector-light" : "projector"}
                lineStyle="solid"
                showScaleBadge={false}
              />
              <div className="view-chart-legend" aria-label="종목 색상 범례">
                {stocks.map((stock) => (
                  <span key={stock.ticker}>
                    <i style={{ background: stock.color }} />
                    <strong>{stock.ticker}</strong>
                    <small>{stock.name}</small>
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
        <aside className="view-ranking-card">
          <header>
            <div className="view-ranking-heading">
              <span className="eyebrow">
                {!rankingDataReady
                  ? "순위 동기화 중"
                  : round === 0
                    ? "기준 시점"
                    : `ROUND ${round}`}
              </span>
              <h2>
                {round === 0
                  ? "조별 기준 수익률"
                  : `${round}라운드 단회 수익률`}
              </h2>
            </div>
            <div className="view-ranking-launchers" aria-label="전체 순위 화면">
              <button
                type="button"
                disabled={!rankingDataReady}
                onClick={() => openRankingWindow("cumulative")}
              >
                <span>전체 누적</span>
                <strong>수익률 순위</strong>
                <i aria-hidden="true">↗</i>
              </button>
              <button
                type="button"
                disabled={!rankingDataReady}
                onClick={() => openRankingWindow("assets")}
              >
                <span>금액 비공개</span>
                <strong>총자산 순위</strong>
                <i aria-hidden="true">↗</i>
              </button>
            </div>
          </header>
          <div
            className="view-ranking-grid"
            role="list"
            aria-label={
              round === 0
                ? "조별 기준 수익률 순위"
                : `${round}라운드 단회 수익률 순위`
            }
          >
            {roundStandings.map((team, index) => (
              <article
                key={team.teamId}
                role="listitem"
                aria-label={`${index + 1}위, ${team.teamId}조, ${round === 0 ? "기준" : `${round}라운드 단회`} 수익률 ${team.roundReturnRate >= 0 ? "플러스 " : "마이너스 "}${Math.abs(team.roundReturnRate).toFixed(1)}퍼센트`}
              >
                <i aria-hidden="true">{index + 1}</i>
                <div>
                  <strong>{team.teamId}조</strong>
                  <span
                    role="meter"
                    aria-label={`${team.teamId}조 단회 수익률 크기`}
                    aria-valuemin={0}
                    aria-valuemax={maxRoundReturn}
                    aria-valuenow={Math.abs(team.roundReturnRate)}
                    aria-valuetext={`단회 수익률 ${team.roundReturnRate >= 0 ? "플러스 " : "마이너스 "}${Math.abs(team.roundReturnRate).toFixed(1)}퍼센트`}
                  >
                    <b
                      aria-hidden="true"
                      style={{
                        width: `${team.roundReturnRate === 0 ? 0 : Math.max(3, (Math.abs(team.roundReturnRate) / maxRoundReturn) * 100)}%`,
                      }}
                      className={
                        team.roundReturnRate >= 0 ? "positive" : "negative"
                      }
                    />
                  </span>
                </div>
                <em
                  className={team.roundReturnRate >= 0 ? "up" : "down"}
                  aria-hidden="true"
                >
                  {signedRate(team.roundReturnRate)}
                </em>
              </article>
            ))}
          </div>
        </aside>
        <section className="view-reference" aria-label="이번 라운드 참고 정보">
          <strong>이번 라운드 참고 정보</strong>
          <p>{brief.note}</p>
        </section>
      </section>
    </main>
  );
}
