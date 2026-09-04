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
  assert.match(page, /라운드 수익률/);
  assert.doesNotMatch(page, /단회 수익률/);
  assert.match(page, /전체 누적 수익률 순위/);
  assert.match(page, /조별 순위/);
  assert.match(page, /실제 BE 금액은 표시하지 않습니다/);
  assert.match(page, /이번 라운드 참고 정보/);
  assert.match(page, /통합생명과학학회 개막/);
  assert.match(page, /실험 물자 공급난/);
  assert.match(page, /호흡기 감염 급증/);
  assert.match(page, /자금·발주·심사 재개/);
  assert.match(page, /정부 바이오 기업 감사/);
  assert.match(page, /기록적 폭염/);
  assert.match(page, /신종 인수공통감염병 확산/);
  assert.doesNotMatch(page, /감염 우려 해소/);
  assert.doesNotMatch(page, /클라우드 비용/);
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
  assert.match(server, /VIEW_PASSWORD \|\| "12345678"/);
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
  const teamDetail = await readFile(
    new URL("../app/client/team-detail.tsx", import.meta.url),
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
  assert.match(teamDashboard, /보유 주식 최대 수량 입력/);
  assert.match(teamDashboard, /매수 가능한 최대 수량 입력/);
  assert.match(teamDashboard, /setQuantity\(maxSellQuantity\)/);
  assert.match(teamDashboard, /setQuantity\(maxBuyQuantity\)/);
  assert.doesNotMatch(teamDashboard, /setQuantity\(maxOrderQuantity\)/);
  assert.match(
    teamDashboard,
    /<span>보유 현금<\/span>[\s\S]*?money\.format\(team\.cash\)/,
  );
  assert.match(
    teamDashboard,
    /<span>\{team\.teamId\}조 총 자산<\/span>[\s\S]*?money\.format\(team\.totalAsset\)/,
  );
  assert.doesNotMatch(teamDetail, /긍정 요인|주의 요인/);
  assert.doesNotMatch(teamDetail, /stock-profile-balance/);
  assert.match(
    css,
    /\.client-quick-quantity \{[^}]*grid-template-columns: repeat\(5,\s*minmax\(0,\s*1fr\)\)/,
  );
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
  const viewDashboard = await readFile(
    new URL("../app/client/view-dashboard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.view-event-copy h1[^}]*\{[^}]*font-size: clamp\(44px, 3vw, 54px\)/);
  assert.match(css, /\.view-chart-legend \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.view-ranking-grid article > em[^}]*\{[^}]*font: 790 30px/);
  assert.match(css, /\.view-reference p[^}]*\{[^}]*font-size: 20px/);
  assert.match(css, /\.view-baseline-board \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.view-rank-dialog,/);
  assert.match(css, /\.view-rank-board \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.view-asset-podium \{[^}]*grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.view-asset-podium > li \{[^}]*grid-row: 1/);
  assert.match(css, /\.view-asset-podium > li\.podium-first \{[^}]*grid-column: 5 \/ 9/);
  assert.match(css, /\.view-asset-rank-rest,[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(min-width: 1180px\)[\s\S]*?\.view-asset-rank-rest\.balanced-nine \{[^}]*grid-template-columns: repeat\(10, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.view-asset-rank-rest\.balanced-nine > li:nth-child\(1\) \{[^}]*grid-column: 2 \/ 4;[^}]*grid-row: 1/);
  assert.match(css, /\.view-asset-rank-rest\.balanced-nine > li:nth-child\(5\) \{[^}]*grid-column: 1 \/ 3;[^}]*grid-row: 2/);
  assert.match(css, /\.podium-first \.view-asset-team \{[^}]*font-size: clamp\(44px, 4vw, 68px\)/);
  assert.match(viewDashboard, /hasAssetPodium/);
  assert.match(viewDashboard, /assetRankCounts\.get\(1\) === 1/);
  assert.match(viewDashboard, /assetRankCounts\.get\(2\) === 1/);
  assert.match(viewDashboard, /assetRankCounts\.get\(3\) === 1/);
  assert.match(viewDashboard, /assetRankingTabRef\.current/);
  assert.match(viewDashboard, /assetStandings\.slice\(0, 3\)/);
  assert.match(viewDashboard, /assetStandings\.slice\(3\)/);
  assert.match(viewDashboard, /assetStandings\.length === 12/);
  assert.doesNotMatch(viewDashboard, /view-rank-private/);
  assert.doesNotMatch(viewDashboard, /team\.totalAsset/);
  assert.match(css, /@media \(max-width: 1179px\)/);
  assert.match(css, /\.view-shell,[^}]*\.view-shell\.theme-light \{[^}]*height: auto/);
  assert.match(css, /@media \(min-width: 900px\) and \(max-width: 1179px\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.35fr\) minmax\(360px, 0\.8fr\)/);
  assert.match(charts, /Math\.max\(22, Math\.min\(26, width \/ 48\)\)/);
  assert.match(charts, /projector \? 5\.2/);
  assert.match(charts, /endpointLabels/);
  assert.match(charts, /context\.lineTo\(px, py\)/);
  assert.match(charts, /context\.strokeText\(text, labelX, label\.labelY\)/);
  assert.match(charts, /context\.fillText\(text, labelX, label\.labelY\)/);
  assert.doesNotMatch(charts, /context\.moveTo\(label\.x \+ 7, label\.y\)/);
  assert.doesNotMatch(charts, /context\.lineTo\(labelX - 6, label\.labelY\)/);
  assert.match(charts, /narrowChart/);
  assert.match(charts, /projectorLight/);
  assert.match(charts, /lightChartColors/);
  assert.match(charts, /lineDashPatterns/);
  assert.match(charts, /lineStyle === "solid"/);
  assert.match(charts, /showScaleBadge/);
});
