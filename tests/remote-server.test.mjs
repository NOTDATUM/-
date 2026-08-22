import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const allowedOrigin = "https://notdatum.github.io";
const teamPassword = "test-team-password";
const staffPassword = "test-staff-password";
const viewPassword = "test-view-password";
const signingKey = "test-signing-key-with-more-than-32-characters";

async function waitForServer(baseUrl, child, output) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null)
      throw new Error(`server exited early\n${output.text}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`server did not start\n${output.text}`);
}

async function startServer(port, dataDir) {
  const output = { text: "" };
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      ALLOWED_ORIGINS: allowedOrigin,
      TEAM_PASSWORD: teamPassword,
      STAFF_PASSWORD: staffPassword,
      VIEW_PASSWORD: viewPassword,
      SESSION_SIGNING_KEY: signingKey,
      NODE_NO_WARNINGS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    output.text += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output.text += chunk;
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, child, output);
  return { child, baseUrl, output };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolveExit, rejectExit) => {
    const timeout = setTimeout(
      () => rejectExit(new Error("server did not stop")),
      3000,
    );
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveExit();
    });
  });
}

async function api(
  baseUrl,
  path,
  { token, method = "GET", body, origin = allowedOrigin } = {},
) {
  const headers = { Origin: origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function login(baseUrl, id, password) {
  const response = await api(baseUrl, "/api/auth", {
    method: "POST",
    body: { id, password },
  });
  const data = await response.json();
  assert.equal(response.status, 200, data.error);
  assert.ok(data.token);
  return data;
}

test("migrates an existing game database for cancellations and audit logs", async () => {
  const dataDir = await mkdtemp(resolve(tmpdir(), "be-legacy-server-"));
  const databasePath = resolve(dataDir, "be-game.sqlite");
  const legacyDb = new DatabaseSync(databasePath);
  legacyDb.exec(`CREATE TABLE trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    action TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price INTEGER NOT NULL,
    round INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;`);
  legacyDb.close();
  const port = 44000 + Math.floor(Math.random() * 1000);
  let running;
  try {
    running = await startServer(port, dataDir);
    const staff = await login(running.baseUrl, "staff", staffPassword);
    const snapshot = await api(running.baseUrl, "/api/game", {
      token: staff.token,
    });
    const data = await snapshot.json();
    assert.equal(snapshot.status, 200);
    assert.deepEqual(data.auditLogs, []);
    await stopServer(running.child);
    running = null;
    const migratedDb = new DatabaseSync(databasePath);
    const columns = migratedDb.prepare("PRAGMA table_info(trades)").all();
    assert.ok(columns.some((column) => column.name === "canceled_at"));
    const auditTable = migratedDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'admin_audit_logs'",
      )
      .get();
    assert.equal(auditTable.name, "admin_audit_logs");
    migratedDb.close();
  } finally {
    if (running) await stopServer(running.child).catch(() => undefined);
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("shares staff, view, and team state through the public game server and keeps it after restart", async () => {
  const dataDir = await mkdtemp(resolve(tmpdir(), "be-remote-server-"));
  const port = 43000 + Math.floor(Math.random() * 1000);
  let running;
  try {
    running = await startServer(port, dataDir);

    const denied = await api(running.baseUrl, "/api/auth", {
      method: "POST",
      body: { id: "staff", password: staffPassword },
      origin: "https://example.com",
    });
    assert.equal(denied.status, 403);

    const staff = await login(running.baseUrl, "staff", staffPassword);
    assert.deepEqual(staff.session, { role: "staff", teamId: null });
    const view = await login(running.baseUrl, "view", viewPassword);
    assert.deepEqual(view.session, { role: "view", teamId: null });

    const seeds = Array.from({ length: 5 }, (_, index) => 1000 + index * 100);
    const setup = await api(running.baseUrl, "/api/game/setup", {
      method: "POST",
      token: staff.token,
      body: { seeds },
    });
    assert.equal(setup.status, 200);

    const preparedSnapshot = await api(running.baseUrl, "/api/game", {
      token: staff.token,
    });
    const preparedData = await preparedSnapshot.json();
    assert.equal(preparedData.game.started, false);
    assert.equal(preparedData.game.round, 0);
    assert.equal(preparedData.teams.length, 5);
    assert.equal(preparedData.teams[1].seedMoney, 1100);
    assert.equal(preparedData.teams[0].online, false);
    assert.equal(preparedData.teams[0].lastSeenAt, null);

    const preparedViewSnapshot = await api(running.baseUrl, "/api/game", {
      token: view.token,
    });
    const preparedViewData = await preparedViewSnapshot.json();
    assert.equal(preparedViewData.teams.length, 5);
    assert.equal(preparedViewData.team, null);
    assert.equal(preparedViewData.teams[0].returnRate, 0);
    assert.equal(preparedViewData.teams[0].totalAsset, undefined);
    assert.equal(preparedViewData.auditLogs, null);
    assert.equal(preparedViewData.market.prices.IMMU[0], 120);
    assert.equal(preparedViewData.market.prices.IMMU[1], null);

    const viewDeniedStart = await api(running.baseUrl, "/api/game/start", {
      method: "POST",
      token: view.token,
    });
    assert.equal(viewDeniedStart.status, 403);
    const viewDeniedForceLogout = await api(
      running.baseUrl,
      "/api/game/force-logout",
      {
        method: "POST",
        token: view.token,
        body: { teamId: 1 },
      },
    );
    assert.equal(viewDeniedForceLogout.status, 403);

    const updateFuturePrice = await api(running.baseUrl, "/api/game/prices", {
      method: "POST",
      token: staff.token,
      body: { updates: [{ ticker: "IMMU", round: 2, price: 777 }] },
    });
    assert.deepEqual(await updateFuturePrice.json(), { ok: true, updated: 1 });

    const removedTeamLogin = await api(running.baseUrl, "/api/auth", {
      method: "POST",
      body: { id: "6", password: teamPassword },
    });
    assert.equal(removedTeamLogin.status, 401);

    let team = await login(running.baseUrl, "1", teamPassword);
    const onlineSnapshot = await api(running.baseUrl, "/api/game", {
      token: staff.token,
    });
    const onlineData = await onlineSnapshot.json();
    assert.equal(onlineData.teams[0].online, true);
    assert.ok(onlineData.teams[0].lastSeenAt);

    const deniedForceLogout = await api(
      running.baseUrl,
      "/api/game/force-logout",
      {
        method: "POST",
        token: team.token,
        body: { teamId: 2 },
      },
    );
    assert.equal(deniedForceLogout.status, 403);

    const forceLogout = await api(running.baseUrl, "/api/game/force-logout", {
      method: "POST",
      token: staff.token,
      body: { teamId: 1 },
    });
    assert.deepEqual(await forceLogout.json(), { ok: true, teamId: 1 });

    const invalidatedSession = await api(running.baseUrl, "/api/game", {
      token: team.token,
    });
    assert.equal(invalidatedSession.status, 401);
    const offlineSnapshot = await api(running.baseUrl, "/api/game", {
      token: staff.token,
    });
    const offlineData = await offlineSnapshot.json();
    assert.equal(offlineData.teams[0].online, false);
    assert.equal(offlineData.teams[0].lastSeenAt, null);

    team = await login(running.baseUrl, "1", teamPassword);
    const blockedTrade = await api(running.baseUrl, "/api/game/trade", {
      method: "POST",
      token: team.token,
      body: { ticker: "IMMU", action: "buy", quantity: 1 },
    });
    assert.equal(blockedTrade.status, 400);

    const deniedStart = await api(running.baseUrl, "/api/game/start", {
      method: "POST",
      token: team.token,
    });
    assert.equal(deniedStart.status, 403);

    const start = await api(running.baseUrl, "/api/game/start", {
      method: "POST",
      token: staff.token,
    });
    assert.deepEqual(await start.json(), { round: 0, started: true });

    const lockedPrice = await api(running.baseUrl, "/api/game/prices", {
      method: "POST",
      token: staff.token,
      body: { updates: [{ ticker: "IMMU", round: 0, price: 999 }] },
    });
    assert.equal(lockedPrice.status, 400);

    const round = await api(running.baseUrl, "/api/game/round", {
      method: "POST",
      token: staff.token,
    });
    assert.deepEqual(await round.json(), { round: 1 });

    const trade = await api(running.baseUrl, "/api/game/trade", {
      method: "POST",
      token: team.token,
      body: { ticker: "IMMU", action: "buy", quantity: 2 },
    });
    assert.deepEqual(await trade.json(), {
      ok: true,
      price: 149,
      quantity: 2,
      action: "buy",
    });

    const teamSnapshot = await api(running.baseUrl, "/api/game", {
      token: team.token,
    });
    const teamData = await teamSnapshot.json();
    assert.equal(teamData.game.round, 1);
    assert.equal(teamData.team.cash, 702);
    assert.equal(teamData.team.holdings.IMMU, 2);
    assert.equal(teamData.teams, null);
    assert.equal(teamData.market.prices.IMMU[1], 149);
    assert.equal(teamData.market.prices.IMMU[2], null);

    const staffSnapshot = await api(running.baseUrl, "/api/game", {
      token: staff.token,
    });
    const staffData = await staffSnapshot.json();
    assert.equal(staffData.teams[0].cash, 702);
    assert.equal(staffData.teams[0].trades.length, 1);
    assert.equal(staffData.teams[0].online, true);
    assert.equal(staffData.team, null);
    assert.equal(staffData.market.prices.IMMU[2], 777);

    const viewSnapshot = await api(running.baseUrl, "/api/game", {
      token: view.token,
    });
    const viewData = await viewSnapshot.json();
    assert.equal(viewData.game.round, 1);
    assert.equal(viewData.teams[0].returnRate, 0);
    assert.equal(viewData.teams[0].totalAsset, undefined);
    assert.equal(viewData.teams[0].cash, undefined);
    assert.equal(viewData.teams[0].holdings, undefined);
    assert.equal(viewData.teams[0].trades, undefined);
    assert.equal(viewData.team, null);
    assert.equal(viewData.market.prices.IMMU[1], 149);
    assert.equal(viewData.market.prices.IMMU[2], null);

    const viewDeniedPriceUpdate = await api(
      running.baseUrl,
      "/api/game/prices",
      {
        method: "POST",
        token: view.token,
        body: { updates: [{ ticker: "IMMU", round: 3, price: 888 }] },
      },
    );
    assert.equal(viewDeniedPriceUpdate.status, 403);

    const deniedPriceUpdate = await api(running.baseUrl, "/api/game/prices", {
      method: "POST",
      token: team.token,
      body: { updates: [{ ticker: "IMMU", round: 3, price: 888 }] },
    });
    assert.equal(deniedPriceUpdate.status, 403);

    const viewDeniedCancel = await api(
      running.baseUrl,
      "/api/game/cancel-trade",
      {
        method: "POST",
        token: view.token,
        body: { tradeId: staffData.teams[0].trades[0].id },
      },
    );
    assert.equal(viewDeniedCancel.status, 403);
    const teamDeniedCancel = await api(
      running.baseUrl,
      "/api/game/cancel-trade",
      {
        method: "POST",
        token: team.token,
        body: { tradeId: staffData.teams[0].trades[0].id },
      },
    );
    assert.equal(teamDeniedCancel.status, 403);

    const sellTrade = await api(running.baseUrl, "/api/game/trade", {
      method: "POST",
      token: team.token,
      body: { ticker: "IMMU", action: "sell", quantity: 1 },
    });
    assert.deepEqual(await sellTrade.json(), {
      ok: true,
      price: 149,
      quantity: 1,
      action: "sell",
    });
    const staffAfterSell = await api(running.baseUrl, "/api/game", {
      token: staff.token,
    });
    const staffAfterSellData = await staffAfterSell.json();
    const sellTradeId = staffAfterSellData.teams[0].trades.find(
      (item) => item.action === "sell",
    ).id;
    const cancelSell = await api(running.baseUrl, "/api/game/cancel-trade", {
      method: "POST",
      token: staff.token,
      body: { tradeId: sellTradeId },
    });
    assert.deepEqual(await cancelSell.json(), {
      ok: true,
      tradeId: sellTradeId,
      teamId: 1,
    });
    const afterSellCancel = await api(running.baseUrl, "/api/game", {
      token: team.token,
    });
    const afterSellCancelData = await afterSellCancel.json();
    assert.equal(afterSellCancelData.team.cash, 702);
    assert.equal(afterSellCancelData.team.holdings.IMMU, 2);
    assert.equal(afterSellCancelData.team.trades.length, 1);

    const cancel = await api(running.baseUrl, "/api/game/cancel-trade", {
      method: "POST",
      token: staff.token,
      body: { tradeId: staffData.teams[0].trades[0].id },
    });
    assert.deepEqual(await cancel.json(), {
      ok: true,
      tradeId: staffData.teams[0].trades[0].id,
      teamId: 1,
    });

    const duplicateCancel = await api(
      running.baseUrl,
      "/api/game/cancel-trade",
      {
        method: "POST",
        token: staff.token,
        body: { tradeId: staffData.teams[0].trades[0].id },
      },
    );
    assert.equal(duplicateCancel.status, 409);

    const canceledTeamSnapshot = await api(running.baseUrl, "/api/game", {
      token: team.token,
    });
    const canceledTeamData = await canceledTeamSnapshot.json();
    assert.equal(canceledTeamData.team.cash, 1000);
    assert.equal(canceledTeamData.team.holdings.IMMU, undefined);
    assert.equal(canceledTeamData.team.trades.length, 0);

    const canceledStaffSnapshot = await api(running.baseUrl, "/api/game", {
      token: staff.token,
    });
    const canceledStaffData = await canceledStaffSnapshot.json();
    assert.equal(canceledStaffData.teams[0].cash, 1000);
    assert.equal(canceledStaffData.teams[0].holdings.IMMU, undefined);
    assert.ok(canceledStaffData.teams[0].trades[0].canceled_at);
    assert.equal(
      canceledStaffData.auditLogs.filter((log) => log.action === "trade_cancel")
        .length,
      2,
    );
    assert.ok(
      canceledStaffData.auditLogs.some((log) => log.action === "round_advance"),
    );

    await stopServer(running.child);
    running = await startServer(port, dataDir);

    const persisted = await api(running.baseUrl, "/api/game", {
      token: staff.token,
    });
    const persistedData = await persisted.json();
    assert.equal(persistedData.game.round, 1);
    assert.equal(persistedData.teams[0].holdings.IMMU, undefined);
    assert.equal(persistedData.teams[0].cash, 1000);
    assert.ok(persistedData.teams[0].trades[0].canceled_at);
    assert.ok(
      persistedData.auditLogs.some((log) => log.action === "trade_cancel"),
    );

    const deniedReset = await api(running.baseUrl, "/api/game/reset", {
      method: "POST",
      token: team.token,
    });
    assert.equal(deniedReset.status, 403);

    const reset = await api(running.baseUrl, "/api/game/reset", {
      method: "POST",
      token: staff.token,
    });
    assert.deepEqual(await reset.json(), { ok: true });

    const resetSnapshot = await api(running.baseUrl, "/api/game", {
      token: staff.token,
    });
    const resetData = await resetSnapshot.json();
    assert.equal(resetData.game.started, false);
    assert.equal(resetData.game.round, 0);
    assert.equal(resetData.teams.length, 5);
    assert.equal(resetData.teams[0].seedMoney, 1000);
    assert.equal(resetData.teams[0].cash, 1000);
    assert.deepEqual(resetData.teams[0].holdings, {});
    assert.equal(resetData.teams[0].trades.length, 0);
    assert.equal(resetData.market.prices.IMMU[2], 777);
    assert.ok(resetData.auditLogs.some((log) => log.action === "game_reset"));

    await stopServer(running.child);
    running = await startServer(port, dataDir);
    const persistedReset = await api(running.baseUrl, "/api/game", {
      token: staff.token,
    });
    const persistedResetData = await persistedReset.json();
    assert.equal(persistedResetData.game.started, false);
    assert.equal(persistedResetData.teams.length, 5);
    assert.equal(persistedResetData.teams[0].trades.length, 0);
    assert.equal(persistedResetData.market.prices.IMMU[2], 777);
  } finally {
    if (running) await stopServer(running.child).catch(() => undefined);
    await rm(dataDir, { recursive: true, force: true });
  }
});
