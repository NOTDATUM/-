"use client";

import type React from "react";
import { useState } from "react";
import { LAST_ROUND, rounds } from "../game-data";
import { apiFetch, setApiSessionToken } from "../api-client";
import type { ClientTheme, Session } from "./types";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-lockup ${compact ? "compact" : ""}`}>
      <div className="be-mark">BE</div>
      <div>
        <div className="brand-name">BIOLOGY EXCHANGE</div>
        <div className="brand-sub">생명과학부 모의주식시장</div>
      </div>
    </div>
  );
}

export function LoginScreen({
  onLogin,
}: {
  onLogin: (session: Session) => void;
}) {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const normalizedId = id.trim().toLowerCase();
  const accessMode =
    normalizedId === "staff"
      ? "staff"
      : normalizedId === "view"
        ? "view"
        : "team";
  const accessCopy =
    accessMode === "staff"
      ? {
          eyebrow: "ADMIN CONSOLE",
          title: "운영자 콘솔 로그인",
          detail: "라운드 진행, 계정 상태와 거래 운영을 관리합니다.",
          action: "관리 콘솔 입장",
        }
      : accessMode === "view"
        ? {
            eyebrow: "LIVE DISPLAY",
            title: "공용 진행 화면 연결",
            detail: "행사장 전체가 함께 보는 실시간 시장 현황판입니다.",
            action: "진행 화면 열기",
          }
        : {
            eyebrow: "MARKET ACCESS",
            title: "모의주식시장 입장",
            detail: "배정받은 조 번호와 공통 비밀번호로 로그인하세요.",
            action: "시장 입장",
          };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      });
      const data = (await response.json()) as {
        session?: Session;
        token?: string;
        error?: string;
      };
      if (!response.ok || !data.session)
        throw new Error(data.error ?? "로그인에 실패했습니다.");
      if (data.token) setApiSessionToken(data.token);
      onLogin(data.session);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "로그인에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-shell">
      <div className="login-ambient">
        <div />
        <div />
        <div />
      </div>
      <section className={`login-card login-card-${accessMode}`}>
        <Brand />
        <div className="login-copy">
          <span className="eyebrow">{accessCopy.eyebrow}</span>
          <h1>{accessCopy.title}</h1>
          <p>{accessCopy.detail}</p>
        </div>
        <form onSubmit={submit} className="login-form">
          <label>
            <span>아이디</span>
            <input
              value={id}
              onChange={(event) => setId(event.target.value)}
              placeholder="조 번호, staff 또는 view"
              autoComplete="username"
              autoFocus
            />
          </label>
          <label>
            <span>비밀번호</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="비밀번호 입력"
              autoComplete="current-password"
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button disabled={busy || !id || !password}>
            {busy ? "확인 중..." : accessCopy.action}
            <span>→</span>
          </button>
        </form>
        <div className="login-hint">
          <div>
            <strong>참가 조</strong>
            <span>숫자 ID · 거래 화면</span>
          </div>
          <div>
            <strong>운영 스태프</strong>
            <span>staff · 관리 전용</span>
          </div>
          <div>
            <strong>공용 화면</strong>
            <span>view · 읽기 전용</span>
          </div>
        </div>
      </section>
      <p className="fiction-note">
        모든 기업과 사건은 레크리에이션을 위한 가상 설정입니다.
      </p>
    </main>
  );
}

export function RoundProgress({ round }: { round: number }) {
  return (
    <div
      className="round-progress"
      aria-label={`${LAST_ROUND}라운드 진행 상황`}
    >
      {Array.from({ length: LAST_ROUND }, (_, index) => {
        const value = index + 1;
        return (
          <div
            className={`${value < round ? "done" : ""} ${value === round ? "active" : ""}`}
            key={value}
          >
            <span>{value < round ? "✓" : value}</span>
            <small>R{value}</small>
          </div>
        );
      })}
    </div>
  );
}

export function Topbar({
  session,
  round,
  onLogout,
  presentation = false,
  started = true,
  clientTheme,
  onToggleTheme,
}: {
  session: Session;
  round: number;
  onLogout: () => void;
  presentation?: boolean;
  started?: boolean;
  clientTheme?: ClientTheme;
  onToggleTheme?: () => void;
}) {
  const marketLabel = !started
    ? "MARKET READY"
    : round === LAST_ROUND
      ? "MARKET CLOSED"
      : "MARKET OPEN";
  return (
    <header
      className={`topbar ${presentation ? "presentation" : ""} ${session.role === "team" ? "client-topbar" : ""}`}
    >
      <Brand compact />
      <div className="market-center">
        <span
          className={`status-dot ${!started ? "pending" : round === LAST_ROUND ? "closed" : ""}`}
        />
        <span>{marketLabel}</span>
        <strong>{started ? rounds[round].label : "시작 전"}</strong>
      </div>
      <div className="account-actions">
        <span>
          {session.role === "staff"
            ? "STAFF CONTROL"
            : session.role === "view"
              ? "LIVE DISPLAY"
              : `${session.teamId}조 계정`}
        </span>
        {session.role === "team" && clientTheme && onToggleTheme && (
          <button
            className={`client-theme-toggle ${clientTheme}`}
            aria-label={`${clientTheme === "dark" ? "화이트" : "다크"} 모드로 전환`}
            aria-pressed={clientTheme === "dark"}
            onClick={onToggleTheme}
          >
            <i aria-hidden="true">{clientTheme === "dark" ? "☾" : "☀"}</i>
            <strong>{clientTheme === "dark" ? "다크" : "화이트"}</strong>
          </button>
        )}
        <button onClick={onLogout}>로그아웃</button>
      </div>
    </header>
  );
}

export function WaitingScreen({
  session,
  onLogout,
}: {
  session: Session;
  onLogout: () => void;
}) {
  return (
    <main className="app-shell">
      <Topbar session={session} round={0} onLogout={onLogout} started={false} />
      <section className="waiting-screen">
        <div className="waiting-orbit">
          <span>BE</span>
        </div>
        <span className="eyebrow">WAITING FOR STAFF</span>
        <h1>게임 시작을 기다리고 있습니다</h1>
        <p>
          스태프가 시드머니를 저장한 뒤 게임 시작 버튼을 누르면 자동으로 거래
          화면이 열립니다.
        </p>
      </section>
    </main>
  );
}
