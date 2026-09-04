"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { money } from "./constants";
import type { FinaleTeamResult } from "./types";

function signedRate(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function finaleRevealGroups(teams: FinaleTeamResult[]) {
  const groupsByRank = new Map<number, FinaleTeamResult[]>();
  for (const team of teams) {
    const group = groupsByRank.get(team.assetRank) ?? [];
    group.push(team);
    groupsByRank.set(team.assetRank, group);
  }

  const lowerRanks = [...groupsByRank.entries()]
    .filter(([rank]) => rank > 2)
    .sort(([left], [right]) => right - left)
    .map(([, group]) => group);
  const winners = teams.filter((team) => team.assetRank <= 2);

  return winners.length > 0 ? [...lowerRanks, winners] : lowerRanks;
}

function revealLabel(group: FinaleTeamResult[] | undefined) {
  if (!group?.length) return "모든 최종 결과 공개 완료";
  const ranks = [...new Set(group.map((team) => team.assetRank))].sort(
    (left, right) => right - left,
  );
  if (ranks.includes(1) && ranks.includes(2)) return "2위와 1위 결과 공개";
  if (group.length > 1) return `공동 ${ranks[0]}위 결과 공개`;
  return `${ranks[0]}위 결과 공개`;
}

function FinaleResultCard({
  team,
  revealed,
  podiumSlot,
}: {
  team: FinaleTeamResult;
  revealed: boolean;
  podiumSlot?: 1 | 2 | 3;
}) {
  return (
    <li
      className={`view-finale-result rank-${team.assetRank} ${podiumSlot ? `podium-slot-${podiumSlot}` : ""} ${revealed ? "revealed" : "concealed"}`}
      aria-hidden={!revealed}
      aria-label={`${team.assetRank}위, ${team.teamId}조, 누적 수익률 ${signedRate(team.returnRate)}, 총자산 ${money.format(team.totalAsset)} BE, 시드머니 ${money.format(team.seedMoney)} BE`}
    >
      {team.assetRank === 1 && (
        <span className="view-finale-crown" aria-hidden="true">
          ♛
        </span>
      )}
      <div className="view-finale-identity">
        <span className="view-finale-rank">
          <strong>{team.assetRank}</strong>
          <small>위</small>
        </span>
        <strong className="view-finale-team">{team.teamId}조</strong>
      </div>
      <dl>
        <div>
          <dt>누적 수익률</dt>
          <dd className={team.returnRate >= 0 ? "up" : "down"}>
            {signedRate(team.returnRate)}
          </dd>
        </div>
        <div>
          <dt>총자산</dt>
          <dd>{money.format(team.totalAsset)} BE</dd>
        </div>
        <div>
          <dt>시드머니</dt>
          <dd>{money.format(team.seedMoney)} BE</dd>
        </div>
      </dl>
    </li>
  );
}

export function ViewFinaleStage({ teams }: { teams: FinaleTeamResult[] }) {
  const [revealStep, setRevealStep] = useState(0);
  const [revealLocked, setRevealLocked] = useState(false);
  const revealUnlockTimerRef = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState(
    "최종 결과 공개를 시작할 준비가 되었습니다.",
  );
  const orderedTeams = useMemo(
    () =>
      [...teams].sort(
        (left, right) =>
          left.assetRank - right.assetRank || left.teamId - right.teamId,
      ),
    [teams],
  );
  const revealGroups = useMemo(
    () => finaleRevealGroups(orderedTeams),
    [orderedTeams],
  );
  const revealedTeamIds = useMemo(
    () =>
      new Set(
        revealGroups
          .slice(0, revealStep)
          .flat()
          .map((team) => team.teamId),
      ),
    [revealGroups, revealStep],
  );
  const podiumTeams = useMemo(
    () => {
      const topThree = orderedTeams.slice(0, 3);
      return [topThree[1], topThree[0], topThree[2]].filter(
        (team): team is FinaleTeamResult => Boolean(team),
      );
    },
    [orderedTeams],
  );
  const podiumSlotByTeam = useMemo(
    () =>
      new Map(
        orderedTeams.slice(0, 3).map((team, index) => [
          team.teamId,
          (index === 0 ? 2 : index === 1 ? 1 : 3) as 1 | 2 | 3,
        ]),
      ),
    [orderedTeams],
  );
  const remainingTeams = orderedTeams.slice(3);
  const complete = revealStep >= revealGroups.length;
  const nextGroup = revealGroups[revealStep];
  const nextLabel = revealLabel(nextGroup);

  useEffect(
    () => () => {
      if (revealUnlockTimerRef.current !== null) {
        window.clearTimeout(revealUnlockTimerRef.current);
      }
    },
    [],
  );

  const unlockReveal = () => {
    if (revealUnlockTimerRef.current !== null) {
      window.clearTimeout(revealUnlockTimerRef.current);
      revealUnlockTimerRef.current = null;
    }
    setRevealLocked(false);
  };

  const revealNext = () => {
    if (complete || revealLocked || !nextGroup) return;
    setRevealLocked(true);
    revealUnlockTimerRef.current = window.setTimeout(unlockReveal, 650);
    setRevealStep((current) => current + 1);
    const teamNames = nextGroup.map((team) => `${team.teamId}조`).join(", ");
    setAnnouncement(`${revealLabel(nextGroup)}: ${teamNames}`);
  };

  return (
    <section className="view-finale-stage" aria-labelledby="view-finale-title">
      <h1 className="sr-only" id="view-finale-title">
        최종 결과 공개
      </h1>
      <div
        className="view-finale-board"
        onAnimationEnd={(event) => {
          if (
            event.animationName === "view-finale-result-in" &&
            (event.target as HTMLElement).classList.contains(
              "view-finale-result",
            )
          ) {
            unlockReveal();
          }
        }}
      >
        <ol className="view-finale-podium" aria-label="최종 상위 순위">
          {podiumTeams.map((team) => (
            <FinaleResultCard
              key={team.teamId}
              team={team}
              revealed={revealedTeamIds.has(team.teamId)}
              podiumSlot={podiumSlotByTeam.get(team.teamId)}
            />
          ))}
        </ol>
        <ol className="view-finale-rest" aria-label="최종 4위 이하 순위">
          {remainingTeams.map((team) => (
            <FinaleResultCard
              key={team.teamId}
              team={team}
              revealed={revealedTeamIds.has(team.teamId)}
            />
          ))}
        </ol>
      </div>
      <button
        type="button"
        className="view-finale-reveal-target"
        disabled={complete || revealLocked || revealGroups.length === 0}
        aria-busy={revealLocked}
        aria-label={nextLabel}
        onClick={revealNext}
      >
        <span className="sr-only">{nextLabel}</span>
      </button>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
