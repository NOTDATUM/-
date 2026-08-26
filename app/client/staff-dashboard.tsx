"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "../api-client";
import { LAST_ROUND, rounds } from "../game-data";
import { RoundProgress, Topbar } from "./common";
import { money } from "./constants";
import { StaffTeamDetail } from "./staff-team-detail";
import { isTeamView, type Snapshot, type Trade } from "./types";

function HintCoinEditor({
  teamId,
  value,
  busy,
  onUpdate,
}: {
  teamId: number;
  value: number;
  busy: boolean;
  onUpdate: (teamId: number, value: number) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(String(value));

  const normalized = Math.max(
    0,
    Math.min(1_000_000_000, Math.floor(Number(draft) || 0)),
  );
  const apply = (next: number) => {
    const safeNext = Math.max(0, Math.min(1_000_000_000, next));
    setDraft(String(safeNext));
    void onUpdate(teamId, safeNext);
  };

  return (
    <div className="admin-hint-editor">
      <div>
        <input
          aria-label={`${teamId}조 힌트코인`}
          disabled={busy}
          min="0"
          max="1000000000"
          type="number"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !busy) apply(normalized);
          }}
        />
        <button
          disabled={busy || normalized === value}
          onClick={() => apply(normalized)}
        >
          {busy ? "저장 중" : "저장"}
        </button>
      </div>
      <nav aria-label={`${teamId}조 힌트코인 빠른 차감`}>
        {[100, 300, 500].map((amount) => (
          <button
            disabled={busy || value < amount}
            key={amount}
            onClick={() => apply(value - amount)}
          >
            −{amount}
          </button>
        ))}
        <button disabled={busy} onClick={() => apply(value + 100)}>
          +100
        </button>
      </nav>
    </div>
  );
}

export function StaffDashboard({
  snapshot,
  refresh,
  onLogout,
  onOpenPriceBoard,
  onForceLogout,
  forceLogoutBusy,
  onCancelTrade,
  cancelTradeBusy,
}: {
  snapshot: Snapshot;
  refresh: () => Promise<void>;
  onLogout: () => void;
  onOpenPriceBoard: () => void;
  onForceLogout: (teamId: number) => void | Promise<void>;
  forceLogoutBusy: number | null;
  onCancelTrade: (trade: Trade) => void | Promise<void>;
  cancelTradeBusy: number | null;
}) {
  const teams = useMemo(
    () => (snapshot.teams ?? []).filter(isTeamView),
    [snapshot.teams],
  );
  const auditLogs = snapshot.auditLogs ?? [];
  const round = snapshot.game.round;
  const prices = snapshot.market.prices;
  const [detailTeam, setDetailTeam] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [hintCoinBusy, setHintCoinBusy] = useState<number | null>(null);
  const onlineCount = teams.filter((team) => team.online).length;
  const totalTrades = teams.reduce(
    (sum, team) =>
      sum + team.trades.filter((trade) => !trade.canceled_at).length,
    0,
  );
  const totalAssets = teams.reduce((sum, team) => sum + team.totalAsset, 0);
  const recentActivity = useMemo(
    () =>
      teams
        .flatMap((team) =>
          team.trades
            .filter((trade) => !trade.canceled_at)
            .map((trade) => ({ ...trade, teamId: team.teamId })),
        )
        .sort((left, right) => right.id - left.id)
        .slice(0, 8),
    [teams],
  );
  const nextEvent = round < LAST_ROUND ? rounds[round + 1] : null;
  const updateHintCoins = async (teamId: number, hintCoins: number) => {
    setHintCoinBusy(teamId);
    try {
      const response = await apiFetch("/api/game/hint-coins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, hintCoins }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "힌트코인을 변경하지 못했습니다.");
      await refresh();
    } catch (caught) {
      window.alert(
        caught instanceof Error
          ? caught.message
          : "힌트코인을 변경하지 못했습니다.",
      );
    } finally {
      setHintCoinBusy(null);
    }
  };
  const advance = async () => {
    if (!window.confirm(`${round + 1}라운드 주가를 공개할까요?`)) return;
    setBusy(true);
    try {
      const response = await apiFetch("/api/game/round", { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "라운드를 진행하지 못했습니다.");
      await refresh();
    } catch (caught) {
      window.alert(
        caught instanceof Error
          ? caught.message
          : "라운드를 진행하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (
      !window.confirm(
        "게임을 초기화할까요? 거래 내역·보유 주식이 삭제되고 시드머니는 기본값으로 돌아갑니다. 마지막으로 저장한 주가 시나리오는 유지됩니다.",
      )
    )
      return;
    setBusy(true);
    try {
      const response = await apiFetch("/api/game/reset", { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "게임을 초기화하지 못했습니다.");
      setDetailTeam(null);
      await refresh();
    } catch (caught) {
      window.alert(
        caught instanceof Error
          ? caught.message
          : "게임을 초기화하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };
  const selected = detailTeam
    ? teams.find((team) => team.teamId === detailTeam)
    : null;
  if (selected)
    return (
      <main className="staff-shell">
        <Topbar
          session={snapshot.session}
          round={round}
          onLogout={onLogout}
          presentation
        />
        <StaffTeamDetail
          team={selected}
          round={round}
          prices={prices}
          onBack={() => setDetailTeam(null)}
          onCancelTrade={onCancelTrade}
          cancelTradeBusy={cancelTradeBusy}
        />
      </main>
    );
  return (
    <main className="staff-shell admin-shell">
      <Topbar
        session={snapshot.session}
        round={round}
        onLogout={onLogout}
        presentation
      />
      <section className="admin-console">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">GAME OPERATIONS</span>
            <h1>운영 관리 콘솔</h1>
            <p>
              게임 상태와 참가 조 접속·거래를 관리합니다. 발표용 정보는 view
              화면에 분리되어 있습니다.
            </p>
          </div>
          <div className="admin-heading-actions">
            <button onClick={onOpenPriceBoard}>주가 시나리오 관리</button>
            <button className="danger" disabled={busy} onClick={reset}>
              게임 초기화
            </button>
          </div>
        </header>
        <section className="admin-metric-grid">
          <article>
            <span>진행 상태</span>
            <strong>{round === 0 ? "장 시작" : `${round}라운드`}</strong>
            <small>
              {round}/{LAST_ROUND} 진행
            </small>
          </article>
          <article>
            <span>참가 조 접속</span>
            <strong>
              {onlineCount}
              <em> / {teams.length}</em>
            </strong>
            <small>{teams.length - onlineCount}개 조 오프라인</small>
          </article>
          <article>
            <span>누적 체결</span>
            <strong>
              {money.format(totalTrades)}
              <em>건</em>
            </strong>
            <small>전체 조 거래 합계</small>
          </article>
          <article>
            <span>전체 총자산</span>
            <strong>
              {money.format(totalAssets)}
              <em> BE</em>
            </strong>
            <small>실시간 평가 기준</small>
          </article>
        </section>
        <section className="admin-workspace">
          <div className="panel admin-team-panel">
            <div className="admin-panel-heading">
              <div>
                <span className="eyebrow">TEAM MANAGEMENT</span>
                <h2>참가 조 관리</h2>
              </div>
              <span className="admin-live-count">
                <i />
                {onlineCount} online
              </span>
            </div>
            <div className="admin-team-table">
              <table>
                <thead>
                  <tr>
                    <th>조</th>
                    <th>접속</th>
                    <th>총 자산</th>
                    <th>수익률</th>
                    <th>현금</th>
                    <th>힌트코인</th>
                    <th>거래</th>
                    <th>계정 작업</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => {
                    const returnRate = team.seedMoney
                      ? ((team.totalAsset - team.seedMoney) / team.seedMoney) *
                        100
                      : 0;
                    const activeTrades = team.trades.filter(
                      (trade) => !trade.canceled_at,
                    ).length;
                    return (
                      <tr key={team.teamId}>
                        <td>
                          <button
                            className="admin-team-link"
                            onClick={() => setDetailTeam(team.teamId)}
                          >
                            {team.teamId}조
                          </button>
                        </td>
                        <td>
                          <span
                            className={`admin-presence ${team.online ? "online" : "offline"}`}
                          >
                            <i />
                            {team.online ? "온라인" : "오프라인"}
                          </span>
                        </td>
                        <td>
                          <strong>{money.format(team.totalAsset)} BE</strong>
                        </td>
                        <td>
                          <span className={returnRate >= 0 ? "up" : "down"}>
                            {returnRate >= 0 ? "+" : ""}
                            {returnRate.toFixed(1)}%
                          </span>
                        </td>
                        <td>{money.format(team.cash)} BE</td>
                        <td>
                          <HintCoinEditor
                            key={`${team.teamId}:${team.hintCoins}`}
                            teamId={team.teamId}
                            value={team.hintCoins}
                            busy={hintCoinBusy === team.teamId}
                            onUpdate={updateHintCoins}
                          />
                        </td>
                        <td>{activeTrades}건</td>
                        <td>
                          <div className="admin-row-actions">
                            <button onClick={() => setDetailTeam(team.teamId)}>
                              상세
                            </button>
                            <button
                              className="logout"
                              disabled={forceLogoutBusy === team.teamId}
                              onClick={() => onForceLogout(team.teamId)}
                            >
                              {forceLogoutBusy === team.teamId
                                ? "처리 중"
                                : "강제 로그아웃"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <aside className="admin-side-column">
            <section className="panel admin-round-panel">
              <div className="admin-panel-heading">
                <div>
                  <span className="eyebrow">ROUND CONTROL</span>
                  <h2>라운드 제어</h2>
                </div>
                <strong>R{round}</strong>
              </div>
              <div className="admin-current-event">
                <span>현재 공지</span>
                <h3>{rounds[round].theme}</h3>
                <p>{rounds[round].detail}</p>
              </div>
              {nextEvent && (
                <div className="admin-next-event">
                  <span>다음 공개</span>
                  <strong>
                    R{round + 1} · {nextEvent.theme}
                  </strong>
                </div>
              )}
              <button
                className="admin-advance"
                disabled={busy || round >= LAST_ROUND}
                onClick={advance}
              >
                {round >= LAST_ROUND
                  ? "모든 라운드 종료"
                  : `R${round + 1} 공개 및 진행`}
                <span>→</span>
              </button>
              <RoundProgress round={round} />
            </section>
            <section className="panel admin-activity-panel">
              <div className="admin-panel-heading">
                <div>
                  <span className="eyebrow">RECENT ACTIVITY</span>
                  <h2>최근 체결 · 취소 관리</h2>
                </div>
                <span>{recentActivity.length}건 표시</span>
              </div>
              <div className="admin-activity-list">
                {recentActivity.map((trade) => {
                  const team = teams.find(
                    (item) => item.teamId === trade.teamId,
                  );
                  const canCancel =
                    Boolean(team) &&
                    (trade.action === "buy"
                      ? (team?.holdings[trade.ticker] ?? 0) >= trade.quantity
                      : (team?.cash ?? 0) >= trade.quantity * trade.price);
                  return (
                    <article key={trade.id}>
                      <span className={trade.action}>
                        {trade.action === "buy" ? "매수" : "매도"}
                      </span>
                      <p>
                        <strong>
                          {trade.teamId}조 · {trade.ticker}
                        </strong>
                        <small>
                          R{trade.round} · {trade.quantity}주 ×{" "}
                          {money.format(trade.price)} BE
                        </small>
                      </p>
                      <em>{money.format(trade.quantity * trade.price)} BE</em>
                      <button
                        className="activity-cancel-button"
                        disabled={!canCancel || cancelTradeBusy === trade.id}
                        onClick={() => onCancelTrade(trade)}
                      >
                        {cancelTradeBusy === trade.id
                          ? "처리 중"
                          : canCancel
                            ? "취소"
                            : "불가"}
                      </button>
                    </article>
                  );
                })}
                {recentActivity.length === 0 && (
                  <p className="admin-empty">아직 체결된 거래가 없습니다.</p>
                )}
              </div>
            </section>
            <section className="panel admin-audit-panel">
              <div className="admin-panel-heading">
                <div>
                  <span className="eyebrow">ADMIN AUDIT LOG</span>
                  <h2>운영 감사 로그</h2>
                </div>
                <span>최근 {auditLogs.length}건</span>
              </div>
              <div className="admin-audit-list">
                {auditLogs.map((log) => (
                  <article key={log.id}>
                    <i>{log.id}</i>
                    <p>
                      <strong>{log.summary}</strong>
                      <small>
                        {log.actor} ·{" "}
                        {new Date(`${log.createdAt}Z`).toLocaleString("ko-KR", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </p>
                    <span>{log.action.replaceAll("_", " ")}</span>
                  </article>
                ))}
                {auditLogs.length === 0 && (
                  <p className="admin-empty">
                    아직 기록된 관리자 조작이 없습니다.
                  </p>
                )}
              </div>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}
