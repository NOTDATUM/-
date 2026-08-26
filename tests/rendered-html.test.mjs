import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function builtSources() {
  const server = await readFile(
    new URL("../dist/server/index.js", import.meta.url),
    "utf8",
  );
  const ssrDir = new URL("../dist/server/ssr/assets/", import.meta.url);
  const files = await readdir(ssrDir);
  const pageFile = files.find(
    (file) => file.startsWith("page-") && file.endsWith(".js"),
  );
  assert.ok(pageFile, "the built page bundle should exist");
  const page = await readFile(new URL(pageFile, ssrDir), "utf8");
  return { page, server };
}

test("builds the Biology Exchange login and role-based game", async () => {
  const { page, server } = await builtSources();

  assert.match(server, /BE · Biology Exchange/);
  assert.match(page, /동행/);
  assert.match(page, /생명과학부 모의주식 레크리에이션/);
  assert.match(page, /모의주식시장 입장/);
  assert.match(page, /운영자 콘솔 로그인/);
  assert.match(page, /공용 진행 화면 연결/);
  assert.match(page, /운영 관리 콘솔/);
  assert.match(page, /참가 조 관리/);
  assert.match(page, /현재 라운드 주요 공지/);
  assert.match(page, /조별 누적 수익률/);
  assert.match(page, /이번 라운드 참고 정보/);
  assert.doesNotMatch(page, /실제 자산은 공개하지 않음/);
  assert.match(page, /화면 메뉴/);
  assert.match(page, /종목 색상 범례/);
  assert.match(page, /전체화면/);
  assert.match(page, /be-view-theme/);
  assert.match(page, /projector-light/);
  assert.match(page, /전체 시장/);
  assert.match(page, /전체 차트/);
  assert.match(page, /단일 차트/);
  assert.match(page, /상세보기/);
  assert.match(page, /화이트.*모드로 전환/);
  assert.match(page, /주가 \(BE\)/);
  assert.match(page, /주가 시나리오 관리/);
  assert.match(page, /차트로 가격 수정/);
  assert.match(page, /1 BE 단위/);
  assert.doesNotMatch(page, /ROUND PROGRESS/);
  assert.doesNotMatch(page, /ALL STOCKS · INDEXED/);
  assert.match(page, /전체 총자산/);
  assert.match(page, /참가 조 접속/);
  assert.match(page, /강제 로그아웃/);
  assert.match(page, /운영 감사 로그/);
  assert.match(page, /거래 취소/);
  assert.match(page, /힌트코인/);
  assert.match(page, /자산 상세/);
  assert.match(page, /전체보기/);
  assert.match(page, /전체 보기/);
  assert.doesNotMatch(page, /사업 민감도/);
  assert.match(page, /["']?label["']?: "7라운드"/);
  assert.match(server, /TEAM_PASSWORD/);
  assert.match(server, /STAFF_PASSWORD/);
  assert.match(server, /VIEW_PASSWORD/);
  assert.match(server, /admin_audit_logs/);
  assert.match(server, /cancel-trade/);
  assert.match(server, /hint-coins/);
  assert.match(server, /SESSION_SIGNING_KEY/);
  assert.doesNotMatch(page, /codex-preview/);
  assert.doesNotMatch(page, /Your site is taking shape/);
});

test("uses a responsive service design system for participant and staff screens", async () => {
  const css = await readFile(
    new URL("../app/service-design.css", import.meta.url),
    "utf8",
  );
  const staffDashboard = await readFile(
    new URL("../app/client/staff-dashboard.tsx", import.meta.url),
    "utf8",
  );
  const teamDashboard = await readFile(
    new URL("../app/client/team-dashboard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.client-holdings \{[^}]*display: grid/);
  assert.match(css, /--ds-action:/);
  assert.match(css, /\.skip-link \{/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.admin-hint-editor \{[^}]*grid-template-columns:/);
  assert.match(css, /\.admin-team-table td \{[^}]*height: 58px/);
  assert.match(css, /\.admin-hint-editor input \{[^}]*height: 38px/);
  assert.doesNotMatch(staffDashboard, /apply\(value \+ 100\)/);
  assert.match(css, /\.admin-team-table table \{[^}]*table-layout: fixed/);
  assert.match(css, /\.price-schedule-table \{[^}]*table-layout: fixed/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /\.price-schedule-table \{[^}]*width: 980px/);
  assert.match(css, /pretendardvariable-dynamic-subset/);
  assert.match(css, /\.admin-history-modal \{/);
  assert.match(css, /\.admin-history-preview \{/);
  assert.doesNotMatch(staffDashboard, /<RoundProgress round=\{round\}/);
  assert.match(staffDashboard, /setHistoryView\("trades"\)/);
  assert.match(staffDashboard, /setHistoryView\("audit"\)/);
  assert.match(teamDashboard, /lineStyle="solid"/);
  assert.match(teamDashboard, /showScaleBadge=\{false\}/);
  assert.match(teamDashboard, /client-recent-summary/);
  assert.doesNotMatch(teamDashboard, />시장 흐름</);
});

test("keeps the public view legible on a projector", async () => {
  const css = await readFile(
    new URL("../app/service-design.css", import.meta.url),
    "utf8",
  );
  const charts = await readFile(
    new URL("../app/client/charts.tsx", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.view-event-copy h1[^}]*\{[^}]*font-size: clamp\(36px, 3vw, 46px\)/);
  assert.match(css, /\.view-chart-legend \{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.view-ranking-grid article > em[^}]*\{[^}]*font: 780 22px/);
  assert.match(css, /\.view-reference p \{[^}]*font-size: 14px/);
  assert.match(css, /@media \(max-width: 1179px\)/);
  assert.match(css, /\.view-shell,[^}]*\.view-shell\.theme-light \{[^}]*height: auto/);
  assert.match(css, /@media \(min-width: 900px\) and \(max-width: 1179px\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.35fr\) minmax\(340px, 0\.65fr\)/);
  assert.match(charts, /Math\.max\(18, Math\.min\(21, width \/ 68\)\)/);
  assert.match(charts, /narrowChart/);
  assert.match(charts, /projectorLight/);
  assert.match(charts, /lightChartColors/);
  assert.match(charts, /lineDashPatterns/);
  assert.match(charts, /lineStyle === "solid"/);
  assert.match(charts, /showScaleBadge/);
});
