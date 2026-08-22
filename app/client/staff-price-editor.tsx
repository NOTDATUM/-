"use client";

import { useState } from "react";
import { apiFetch } from "../api-client";
import { LAST_ROUND, stocks, type PriceSchedule } from "../game-data";
import { ScenarioPriceChart } from "./charts";
import { Topbar } from "./common";
import { money } from "./constants";
import type { Snapshot } from "./types";

export function PriceScheduleEditor({
  snapshot,
  refresh,
  onBack,
  onLogout,
}: {
  snapshot: Snapshot;
  refresh: () => Promise<void>;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [draft, setDraft] = useState<PriceSchedule>(() =>
    Object.fromEntries(
      Object.entries(snapshot.market.prices).map(([ticker, values]) => [
        ticker,
        [...values],
      ]),
    ),
  );
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const [selectedTicker, setSelectedTicker] = useState(stocks[0].ticker);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const firstEditableRound = snapshot.game.started
    ? snapshot.game.round + 1
    : 0;
  const updateDraft = (
    ticker: string,
    round: number,
    rawValue: string | number,
  ) => {
    const value =
      rawValue === ""
        ? null
        : Math.max(1, Math.min(100_000_000, Math.floor(Number(rawValue) || 1)));
    setDraft((current) => ({
      ...current,
      [ticker]: current[ticker].map((price, index) =>
        index === round ? value : price,
      ),
    }));
    setDirty((current) => new Set(current).add(`${ticker}:${round}`));
    setMessage("");
  };
  const close = () => {
    if (
      dirty.size &&
      !window.confirm("저장하지 않은 주가 변경을 버리고 돌아갈까요?")
    )
      return;
    onBack();
  };
  const save = async () => {
    const updates = [...dirty].map((key) => {
      const [ticker, roundText] = key.split(":");
      const round = Number(roundText);
      return { ticker, round, price: draft[ticker][round] };
    });
    if (!updates.length) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await apiFetch("/api/game/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = (await response.json()) as {
        error?: string;
        updated?: number;
      };
      if (!response.ok)
        throw new Error(data.error ?? "주가 변동표를 저장하지 못했습니다.");
      setDirty(new Set());
      setMessage(`${data.updated ?? updates.length}개 주가를 저장했습니다.`);
      await refresh();
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "주가 변동표를 저장하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="staff-shell price-editor-shell">
      <Topbar
        session={snapshot.session}
        round={snapshot.game.round}
        onLogout={onLogout}
        presentation
        started={snapshot.game.started}
      />
      <section className="price-editor-page">
        <header className="price-editor-heading">
          <div>
            <button onClick={close}>← 운영 화면</button>
            <span className="eyebrow">MARKET SCENARIO CONTROL</span>
            <h1>주가 시나리오 관리</h1>
            <p>
              지나간 라운드는 기록으로 잠기며, 아직 공개되지 않은 가격만 수정할
              수 있습니다.
            </p>
          </div>
          <div>
            <span className="price-lock-summary">
              {snapshot.game.started
                ? `${snapshot.game.round}라운드까지 잠김`
                : "게임 시작 전 · 전체 수정 가능"}
            </span>
            <button
              className="price-save-button"
              disabled={busy || dirty.size === 0}
              onClick={save}
            >
              {busy
                ? "저장 중..."
                : `변경사항 저장${dirty.size ? ` · ${dirty.size}개` : ""}`}
            </button>
          </div>
        </header>
        <div className="price-editor-guide">
          <span>● 현재/진행 완료</span>
          <span>● 다음 공개 라운드</span>
          <span>빈칸은 해당 라운드 거래 불가</span>
          {message && <strong>{message}</strong>}
        </div>
        <section className="scenario-chart-panel">
          <header>
            <div>
              <span className="eyebrow">DRAG TO EDIT</span>
              <h2>차트로 가격 수정</h2>
              <p>
                종목을 선택한 뒤 공개되지 않은 점을 위아래로 움직이세요. 아래
                표가 즉시 같은 값으로 바뀝니다.
              </p>
            </div>
            <em>
              {stocks.find((stock) => stock.ticker === selectedTicker)?.name}
            </em>
          </header>
          <div className="scenario-stock-tabs">
            {stocks.map((stock) => (
              <button
                className={stock.ticker === selectedTicker ? "selected" : ""}
                onClick={() => setSelectedTicker(stock.ticker)}
                key={stock.ticker}
              >
                <i style={{ background: stock.color }} />
                <span>{stock.name}</span>
                <strong>{stock.ticker}</strong>
              </button>
            ))}
          </div>
          <ScenarioPriceChart
            stock={
              stocks.find((stock) => stock.ticker === selectedTicker) ??
              stocks[0]
            }
            values={draft[selectedTicker] ?? []}
            firstEditableRound={firstEditableRound}
            dirty={dirty}
            onChange={updateDraft}
          />
        </section>
        <div className="price-table-wrap">
          <table className="price-schedule-table">
            <thead>
              <tr>
                <th>종목</th>
                {Array.from({ length: LAST_ROUND + 1 }, (_, round) => (
                  <th
                    className={
                      round === firstEditableRound
                        ? "next"
                        : round < firstEditableRound
                          ? "locked"
                          : ""
                    }
                    key={round}
                  >
                    <span>{round === 0 ? "기준가" : `${round}R`}</span>
                    <small>
                      {round < firstEditableRound
                        ? "잠김"
                        : round === firstEditableRound
                          ? "다음"
                          : "미래"}
                    </small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stocks.map((stock) => (
                <tr key={stock.ticker}>
                  <th>
                    <i style={{ background: stock.color }} />
                    <span>
                      <strong>{stock.name}</strong>
                      <small>{stock.ticker}</small>
                    </span>
                  </th>
                  {Array.from({ length: LAST_ROUND + 1 }, (_, round) => {
                    const value = draft[stock.ticker]?.[round] ?? null;
                    const previous =
                      round > 0
                        ? (draft[stock.ticker]?.[round - 1] ?? null)
                        : null;
                    const percent =
                      value !== null && previous !== null && previous > 0
                        ? ((value - previous) / previous) * 100
                        : null;
                    const locked = round < firstEditableRound;
                    return (
                      <td
                        className={`${locked ? "locked" : "editable"} ${round === firstEditableRound ? "next" : ""}`}
                        key={round}
                      >
                        {locked ? (
                          <div className="locked-price">
                            <strong>
                              {value === null ? "—" : money.format(value)}
                            </strong>
                            <small
                              className={
                                percent === null
                                  ? "neutral"
                                  : percent >= 0
                                    ? "up"
                                    : "down"
                              }
                            >
                              {percent === null
                                ? "기준"
                                : `${percent >= 0 ? "+" : ""}${percent.toFixed(0)}%`}
                            </small>
                          </div>
                        ) : (
                          <label>
                            <input
                              aria-label={`${stock.name} ${round === 0 ? "기준가" : `${round}라운드`} 주가`}
                              type="number"
                              min="1"
                              max="100000000"
                              value={value ?? ""}
                              placeholder="—"
                              onChange={(event) =>
                                updateDraft(
                                  stock.ticker,
                                  round,
                                  event.target.value,
                                )
                              }
                            />
                            <small
                              className={
                                percent === null
                                  ? "neutral"
                                  : percent >= 0
                                    ? "up"
                                    : "down"
                              }
                            >
                              {percent === null
                                ? "거래 불가"
                                : `${percent >= 0 ? "+" : ""}${percent.toFixed(0)}%`}
                            </small>
                          </label>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="price-editor-footnote">
          저장한 가격은 모든 스태프·참가자 화면과 실제 매수·매도 체결가에 즉시
          적용됩니다. 참가자에게는 현재 라운드까지의 가격만 공개됩니다.
        </p>
      </section>
    </main>
  );
}
