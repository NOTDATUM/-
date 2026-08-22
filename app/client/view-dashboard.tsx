"use client";

import { useEffect, useMemo, useState } from "react";
import { LAST_ROUND, rounds, stocks } from "../game-data";
import { AllStocksChart } from "./charts";
import { Brand } from "./common";
import { viewRoundBriefs } from "./constants";
import { isViewTeamPerformance, type Snapshot } from "./types";

export function ViewDashboard({
  snapshot,
  onLogout,
}: {
  snapshot: Snapshot;
  onLogout: () => void;
}) {
  const teams = useMemo(
    () => (snapshot.teams ?? []).filter(isViewTeamPerformance),
    [snapshot.teams],
  );
  const round = snapshot.game.round;
  const prices = snapshot.market.prices;
  const [fullscreen, setFullscreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const timer = window.setTimeout(() => setMenuOpen(false), 7000);
    return () => window.clearTimeout(timer);
  }, [menuOpen]);
  const standings = useMemo(
    () => [...teams].sort((left, right) => right.returnRate - left.returnRate),
    [teams],
  );
  const brief = viewRoundBriefs[round];
  const maxReturn = Math.max(
    1,
    ...standings.map((team) => Math.abs(team.returnRate)),
  );
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    setMenuOpen(false);
  };
  return (
    <main className={`view-shell ${teams.length > 16 ? "dense" : ""}`}>
      {!menuOpen && (
        <button
          className="view-menu-trigger"
          aria-expanded="false"
          aria-controls="view-control-bar"
          onClick={() => setMenuOpen(true)}
        >
          <span>☰</span> 화면 메뉴
        </button>
      )}
      {menuOpen && (
        <button
          className="view-menu-backdrop"
          aria-label="화면 메뉴 닫기"
          onClick={() => setMenuOpen(false)}
        />
      )}
      {menuOpen && (
        <header className="view-control-bar" id="view-control-bar">
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
                ? "GAME READY"
                : round >= LAST_ROUND
                  ? "MARKET CLOSED"
                  : "LIVE MARKET"}
            </span>
            <strong>
              {snapshot.game.started ? rounds[round].label : "시작 대기"}
            </strong>
          </div>
          <div className="view-screen-actions">
            <button onClick={toggleFullscreen}>
              {fullscreen ? "전체화면 종료" : "전체화면"}
            </button>
            <button onClick={onLogout}>로그아웃</button>
            <button
              aria-label="화면 메뉴 닫기"
              onClick={() => setMenuOpen(false)}
            >
              닫기 ×
            </button>
          </div>
        </header>
      )}
      <section
        className="view-event-banner"
        key={`${snapshot.game.started}-${round}`}
      >
        <div className="view-round-mark">
          <span>{round === 0 ? "OPEN" : "ROUND"}</span>
          <strong>{round}</strong>
          <small>/ 10</small>
        </div>
        <div className="view-event-copy">
          <span className="eyebrow">
            {snapshot.game.started
              ? "CURRENT MARKET EVENT"
              : "MARKET PREPARATION"}
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
            <div>
              <span className="eyebrow">LIVE MARKET OVERVIEW</span>
              <h2>전체 시장 · 실제 주가</h2>
            </div>
            <span>2초마다 자동 갱신</span>
          </header>
          <AllStocksChart round={round} prices={prices} tone="projector" />
          <div className="view-chart-legend" aria-label="종목 색상 범례">
            {stocks.map((stock) => (
              <span key={stock.ticker}>
                <i style={{ background: stock.color }} />
                <strong>{stock.name}</strong>
                <small>{stock.ticker}</small>
              </span>
            ))}
          </div>
        </section>
        <aside className="view-ranking-card">
          <header>
            <div>
              <span className="eyebrow">TEAM PERFORMANCE</span>
              <h2>조별 수익률</h2>
            </div>
            <span>자산 비공개 · {teams.length}개 조</span>
          </header>
          <div className="view-ranking-grid">
            {standings.map((team, index) => (
              <article key={team.teamId}>
                <i>{index + 1}</i>
                <div>
                  <strong>{team.teamId}조</strong>
                  <span>
                    <b
                      style={{
                        width: `${Math.max(3, (Math.abs(team.returnRate) / maxReturn) * 100)}%`,
                      }}
                      className={team.returnRate >= 0 ? "positive" : "negative"}
                    />
                  </span>
                </div>
                <em className={team.returnRate >= 0 ? "up" : "down"}>
                  {team.returnRate >= 0 ? "+" : ""}
                  {team.returnRate.toFixed(1)}%
                </em>
              </article>
            ))}
          </div>
          <section className="view-reference">
            <span>MARKET NOTE</span>
            <strong>이번 라운드 참고 포인트</strong>
            <p>{brief.note}</p>
          </section>
        </aside>
      </section>
    </main>
  );
}
