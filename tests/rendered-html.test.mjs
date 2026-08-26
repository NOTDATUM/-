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
  assert.match(page, /BIOLOGY EXCHANGE/);
  assert.match(page, /생명과학부 모의주식시장/);
  assert.match(page, /모의주식시장 입장/);
  assert.match(page, /운영자 콘솔 로그인/);
  assert.match(page, /공용 진행 화면 연결/);
  assert.match(page, /운영 관리 콘솔/);
  assert.match(page, /참가 조 관리/);
  assert.match(page, /CURRENT MARKET EVENT/);
  assert.match(page, /조별 수익률/);
  assert.match(page, /이번 라운드 참고 포인트/);
  assert.match(page, /자산 비공개/);
  assert.match(page, /화면 메뉴/);
  assert.match(page, /종목 색상 범례/);
  assert.match(page, /전체화면/);
  assert.match(page, /전체 주식시장/);
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

test("keeps participant and staff tables inside the viewport", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /\.client-holdings \{[^}]*display: grid/);
  assert.match(css, /\.client-side-column \{[^}]*grid-template-rows: auto auto minmax\(0,1fr\)/);
  assert.match(css, /\.admin-hint-editor \{[^}]*grid-template-columns:/);
  assert.match(css, /\.admin-team-table table \{[^}]*table-layout: fixed/);
  assert.match(css, /\.price-schedule-table \{[^}]*table-layout: fixed/);
  assert.doesNotMatch(css, /min-width: 1130px/);
  assert.doesNotMatch(css, /min-width: 1450px/);
});
