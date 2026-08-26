"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, clearApiSessionToken } from "./api-client";
import { stocks } from "./game-data";
import { Brand, LoginScreen, Topbar, WaitingScreen } from "./client/common";
import { StaffDashboard } from "./client/staff-dashboard";
import { PriceScheduleEditor } from "./client/staff-price-editor";
import { SeedSetup } from "./client/staff-setup";
import { TeamDashboard } from "./client/team-dashboard";
import { ViewDashboard } from "./client/view-dashboard";
import {
  isTeamView,
  type Session,
  type Snapshot,
  type Trade,
} from "./client/types";

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [priceBoardOpen, setPriceBoardOpen] = useState(false);
  const [forceLogoutBusy, setForceLogoutBusy] = useState<number | null>(null);
  const [cancelTradeBusy, setCancelTradeBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await apiFetch("/api/game", { cache: "no-store" });
    if (response.status === 401) {
      clearApiSessionToken();
      setSession(null);
      setSnapshot(null);
      return;
    }
    const data = (await response.json()) as Snapshot & { error?: string };
    if (!response.ok)
      throw new Error(data.error ?? "게임 정보를 불러오지 못했습니다.");
    if (!data.market?.prices) {
      data.market = {
        prices: Object.fromEntries(
          stocks.map((stock) => [stock.ticker, [...stock.prices]]),
        ),
      };
    }
    setSnapshot(data);
    setSession(data.session);
    setError("");
  }, []);

  const forceLogoutTeam = useCallback(
    async (teamId: number) => {
      if (
        !window.confirm(
          `${teamId}조를 강제 로그아웃할까요? 해당 조의 현재 로그인은 즉시 해제됩니다.`,
        )
      )
        return;
      setForceLogoutBusy(teamId);
      try {
        const response = await apiFetch("/api/game/force-logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok)
          throw new Error(data.error ?? "강제 로그아웃하지 못했습니다.");
        await refresh();
      } catch (caught) {
        window.alert(
          caught instanceof Error
            ? caught.message
            : "강제 로그아웃하지 못했습니다.",
        );
      } finally {
        setForceLogoutBusy(null);
      }
    },
    [refresh],
  );

  const cancelTrade = useCallback(
    async (trade: Trade) => {
      if (
        !window.confirm(
          `${trade.team_id}조의 ${trade.ticker} ${trade.action === "buy" ? "매수" : "매도"} ${trade.quantity}주 거래를 취소할까요?\n현금과 보유 수량이 체결 전 상태로 되돌아갑니다.`,
        )
      )
        return;
      setCancelTradeBusy(trade.id);
      try {
        const response = await apiFetch("/api/game/cancel-trade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tradeId: trade.id }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok)
          throw new Error(data.error ?? "거래를 취소하지 못했습니다.");
        await refresh();
      } catch (caught) {
        window.alert(
          caught instanceof Error
            ? caught.message
            : "거래를 취소하지 못했습니다.",
        );
      } finally {
        setCancelTradeBusy(null);
      }
    },
    [refresh],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((caught) => {
        setSession(null);
        setError(
          caught instanceof Error
            ? caught.message
            : "게임 정보를 불러오지 못했습니다.",
        );
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(
      () => refresh().catch(() => undefined),
      2000,
    );
    return () => window.clearInterval(timer);
  }, [session, refresh]);

  const login = async (nextSession: Session) => {
    setSession(nextSession);
    await refresh();
  };
  const logout = async () => {
    await apiFetch("/api/auth", { method: "DELETE" });
    clearApiSessionToken();
    setPriceBoardOpen(false);
    setSession(null);
    setSnapshot(null);
  };

  if (session === undefined)
    return (
      <main
        className="loading-shell"
        id="main-content"
        aria-busy="true"
        aria-live="polite"
      >
        <Brand />
        <div className="loading-line">
          <span />
        </div>
        <p>시장을 불러오고 있습니다</p>
      </main>
    );
  if (!session)
    return (
      <>
        <LoginScreen onLogin={login} />
        {error && (
          <div className="toast error" role="alert">
            {error}
          </div>
        )}
      </>
    );
  if (!snapshot)
    return (
      <main
        className="loading-shell"
        id="main-content"
        aria-busy="true"
        aria-live="polite"
      >
        <Brand />
        <div className="loading-line">
          <span />
        </div>
        <p>게임 데이터를 연결하고 있습니다</p>
      </main>
    );
  if (session.role === "staff" && priceBoardOpen)
    return (
      <PriceScheduleEditor
        snapshot={snapshot}
        refresh={refresh}
        onBack={() => setPriceBoardOpen(false)}
        onLogout={logout}
      />
    );
  if (session.role === "view")
    return <ViewDashboard snapshot={snapshot} onLogout={logout} />;
  if (!snapshot.game.started) {
    if (session.role === "staff")
      return (
        <main className="staff-shell" id="main-content" tabIndex={-1}>
          <Topbar
            session={session}
            round={0}
            onLogout={logout}
            presentation
            started={false}
          />
          <SeedSetup
            initial={(snapshot.teams ?? []).filter(isTeamView)}
            onStarted={refresh}
            onOpenPriceBoard={() => setPriceBoardOpen(true)}
            onForceLogout={forceLogoutTeam}
            forceLogoutBusy={forceLogoutBusy}
          />
        </main>
      );
    return <WaitingScreen session={session} onLogout={logout} />;
  }
  return session.role === "staff" ? (
    <StaffDashboard
      snapshot={snapshot}
      refresh={refresh}
      onLogout={logout}
      onOpenPriceBoard={() => setPriceBoardOpen(true)}
      onForceLogout={forceLogoutTeam}
      forceLogoutBusy={forceLogoutBusy}
      onCancelTrade={cancelTrade}
      cancelTradeBusy={cancelTradeBusy}
    />
  ) : (
    <TeamDashboard snapshot={snapshot} refresh={refresh} onLogout={logout} />
  );
}
