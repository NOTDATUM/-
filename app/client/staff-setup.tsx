"use client";

import { useState } from "react";
import { apiFetch } from "../api-client";
import { DEFAULT_TEAM_COUNT, MAX_TEAM_COUNT } from "./constants";
import type { TeamView } from "./types";

export function SeedSetup({
  initial,
  onStarted,
  onOpenPriceBoard,
  onForceLogout,
  forceLogoutBusy,
}: {
  initial?: TeamView[] | null;
  onStarted: () => void | Promise<void>;
  onOpenPriceBoard: () => void;
  onForceLogout: (teamId: number) => void | Promise<void>;
  forceLogoutBusy: number | null;
}) {
  const [seeds, setSeeds] = useState(() =>
    initial?.length
      ? [...initial]
          .sort((left, right) => left.teamId - right.teamId)
          .map((team) => team.seedMoney)
      : Array.from({ length: DEFAULT_TEAM_COUNT }, () => 1000),
  );
  const [busy, setBusy] = useState<"save" | "start" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const persistSeeds = async () => {
    const response = await apiFetch("/api/game/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seeds }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok)
      throw new Error(data.error ?? "시드머니를 저장하지 못했습니다.");
  };
  const save = async () => {
    setBusy("save");
    setError("");
    try {
      await persistSeeds();
      setSaved(true);
      await onStarted();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "시드머니를 저장하지 못했습니다.",
      );
    } finally {
      setBusy(null);
    }
  };
  const start = async () => {
    if (
      !window.confirm("입력한 시드머니로 게임을 시작하고 기준가를 공개할까요?")
    )
      return;
    setBusy("start");
    setError("");
    try {
      await persistSeeds();
      const response = await apiFetch("/api/game/start", { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "게임을 시작하지 못했습니다.");
      await onStarted();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "게임을 시작하지 못했습니다.",
      );
    } finally {
      setBusy(null);
    }
  };
  const updateSeeds = (next: number[]) => {
    setSeeds(next);
    setSaved(false);
  };
  const setAll = (value: number) => updateSeeds(seeds.map(() => value));
  const addTeam = () => {
    if (seeds.length >= MAX_TEAM_COUNT) return;
    updateSeeds([...seeds, 1000]);
  };
  const removeTeam = () => {
    if (seeds.length <= 1) return;
    updateSeeds(seeds.slice(0, -1));
  };
  const onlineTeams = Array.from({ length: seeds.length }, (_, index) =>
    initial?.find((team) => team.teamId === index + 1),
  ).filter((team) => team?.online).length;
  return (
    <section className="seed-page">
      <div className="seed-hero">
        <span className="eyebrow">GAME ADMINISTRATION</span>
        <h1>게임 운영 초기 설정</h1>
        <p>
          참가 조 구성과 초기 자산을 확정한 뒤 공용 진행 화면과 참가자 화면을
          시작합니다.
        </p>
        <div className="seed-admin-shortcuts">
          <button onClick={onOpenPriceBoard}>
            주가 시나리오 관리 <span>→</span>
          </button>
        </div>
        <div className="team-count-control">
          <div>
            <span>참가 조 구성</span>
            <strong>현재 {seeds.length}개 조</strong>
            <small>
              로그인 ID는 1부터 {seeds.length}까지 자동으로 배정됩니다.
            </small>
          </div>
          <div>
            <button
              disabled={busy !== null || seeds.length <= 1}
              onClick={removeTeam}
            >
              − 마지막 조 삭제
            </button>
            <button
              disabled={busy !== null || seeds.length >= MAX_TEAM_COUNT}
              onClick={addTeam}
            >
              ＋ 조 추가
            </button>
          </div>
        </div>
        <div className="seed-presets">
          <button onClick={() => setAll(1000)}>전체 1,000 BE</button>
          <button onClick={() => setAll(1500)}>전체 1,500 BE</button>
          <button onClick={() => setAll(2000)}>전체 2,000 BE</button>
        </div>
      </div>
      <section className="seed-presence-board">
        <header>
          <div>
            <span className="eyebrow">TEAM CONNECTIONS</span>
            <h2>조별 접속 상태</h2>
          </div>
          <strong>
            <i />
            온라인 {onlineTeams}/{seeds.length}
          </strong>
        </header>
        <div>
          {seeds.map((_, index) => {
            const teamId = index + 1;
            const presence = initial?.find((team) => team.teamId === teamId);
            return (
              <article
                className={presence?.online ? "online" : "offline"}
                key={teamId}
              >
                <span>
                  <i />
                  {teamId}조
                </span>
                <em>{presence?.online ? "온라인" : "오프라인"}</em>
                <button
                  disabled={!presence || forceLogoutBusy === teamId}
                  onClick={() => onForceLogout(teamId)}
                >
                  {forceLogoutBusy === teamId ? "처리 중" : "강제 로그아웃"}
                </button>
              </article>
            );
          })}
        </div>
      </section>
      <div className="seed-grid">
        {seeds.map((seed, index) => (
          <label key={index}>
            <span>
              <i>{index + 1}</i>
              {index + 1}조
            </span>
            <div>
              <input
                type="number"
                min="1"
                step="100"
                value={seed}
                onChange={(event) =>
                  updateSeeds(
                    seeds.map((value, itemIndex) =>
                      itemIndex === index
                        ? Math.max(
                            1,
                            Math.floor(Number(event.target.value) || 1),
                          )
                        : value,
                    ),
                  )
                }
              />
              <em>BE</em>
            </div>
          </label>
        ))}
      </div>
      {error && <div className="form-error wide">{error}</div>}
      {saved && !error && (
        <div className="setup-success" role="status">
          {seeds.length}개 조의 구성과 시드머니가 저장되었습니다. 참가자들은
          아직 대기 중입니다.
        </div>
      )}
      <div className="seed-actions">
        <button
          className="secondary-button"
          disabled={busy !== null}
          onClick={save}
        >
          {busy === "save" ? "저장 중..." : "구성·시드머니 저장"}
        </button>
        <button
          className="primary-button"
          disabled={busy !== null}
          onClick={start}
        >
          {busy === "start" ? "게임 시작 중..." : "게임 시작 · 기준가 공개"}
          <span>→</span>
        </button>
      </div>
      <p className="reset-warning">
        게임을 시작하면 공용 진행 화면과 1~{seeds.length}조의 화면이 약 2초 안에
        전환됩니다.
      </p>
    </section>
  );
}
