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
        <div className="brand-name">동행</div>
        <div className="brand-sub">
          BIOLOGY EXCHANGE · 생명과학부 모의주식 레크리에이션
        </div>
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
          eyebrow: "운영 스태프 전용",
          title: "운영자 콘솔 로그인",
          detail: "라운드 진행과 참가 조 계정, 거래 현황을 관리합니다.",
          action: "관리 콘솔 입장",
        }
      : accessMode === "view"
        ? {
            eyebrow: "공용 진행 화면",
            title: "공용 진행 화면 연결",
            detail: "행사장에서 함께 보는 실시간 시장 현황을 표시합니다.",
            action: "진행 화면 열기",
          }
        : {
            eyebrow: "참가 조 로그인",
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
    <main className="login-shell" id="main-content" tabIndex={-1}>
      <section className={`login-card login-card-${accessMode}`}>
        <Brand />
        <div className="login-copy">
          <span className="eyebrow">{accessCopy.eyebrow}</span>
          <h1>{accessCopy.title}</h1>
          <p>{accessCopy.detail}</p>
        </div>
        <form onSubmit={submit} className="login-form" aria-busy={busy}>
          <label>
            <span>아이디</span>
            <input
              value={id}
              onChange={(event) => setId(event.target.value)}
              placeholder="조 번호, staff 또는 view"
              autoComplete="username"
              autoFocus
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
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
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
            />
          </label>
          {error && (
            <div
              className="form-error"
              id="login-error"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>
          )}
          <button type="submit" disabled={busy || !id || !password}>
            {busy ? "확인 중..." : accessCopy.action}
            <span aria-hidden="true">→</span>
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
    <ol
      className="round-progress"
      aria-label={`${LAST_ROUND}라운드 진행 상황`}
    >
      {Array.from({ length: LAST_ROUND }, (_, index) => {
        const value = index + 1;
        const status =
          value < round ? "완료" : value === round ? "현재" : "예정";
        return (
          <li
            className={`${value < round ? "done" : ""} ${value === round ? "active" : ""}`}
            key={value}
            aria-current={value === round ? "step" : undefined}
            aria-label={`${value}라운드, ${status}`}
          >
            <span aria-hidden="true">{value < round ? "✓" : value}</span>
            <small aria-hidden="true">R{value}</small>
          </li>
        );
      })}
    </ol>
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
    ? "시작 준비"
    : round === LAST_ROUND
      ? "장 마감"
      : "장 운영 중";
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
            ? "운영 스태프"
            : session.role === "view"
              ? "공용 진행 화면"
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
    <main className="app-shell" id="main-content" tabIndex={-1}>
      <Topbar session={session} round={0} onLogout={onLogout} started={false} />
      <section className="waiting-screen" aria-live="polite">
        <h1>게임 시작을 기다리고 있습니다</h1>
      </section>
    </main>
  );
}
