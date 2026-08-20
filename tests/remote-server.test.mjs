import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const allowedOrigin = "https://notdatum.github.io";
const teamPassword = "test-team-password";
const staffPassword = "test-staff-password";
const signingKey = "test-signing-key-with-more-than-32-characters";

async function waitForServer(baseUrl, child, output) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited early\n${output.text}`);
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
      SESSION_SIGNING_KEY: signingKey,
      NODE_NO_WARNINGS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output.text += chunk; });
  child.stderr.on("data", (chunk) => { output.text += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, child, output);
  return { child, baseUrl, output };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolveExit, rejectExit) => {
    const timeout = setTimeout(() => rejectExit(new Error("server did not stop")), 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveExit();
    });
  });
}

async function api(baseUrl, path, { token, method = "GET", body, origin = allowedOrigin } = {}) {
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
  const response = await api(baseUrl, "/api/auth", { method: "POST", body: { id, password } });
  const data = await response.json();
  assert.equal(response.status, 200, data.error);
  assert.ok(data.token);
  return data;
}

test("shares staff and team state through the public game server and keeps it after restart", async () => {
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

    const seeds = Array.from({ length: 12 }, (_, index) => 1000 + index * 100);
    const setup = await api(running.baseUrl, "/api/game/setup", {
      method: "POST",
      token: staff.token,
      body: { seeds },
    });
    assert.equal(setup.status, 200);

    const round = await api(running.baseUrl, "/api/game/round", { method: "POST", token: staff.token });
    assert.deepEqual(await round.json(), { round: 1 });

    const team = await login(running.baseUrl, "1", teamPassword);
    const trade = await api(running.baseUrl, "/api/game/trade", {
      method: "POST",
      token: team.token,
      body: { ticker: "IMMU", action: "buy", quantity: 2 },
    });
    assert.deepEqual(await trade.json(), { ok: true, price: 149, quantity: 2, action: "buy" });

    const teamSnapshot = await api(running.baseUrl, "/api/game", { token: team.token });
    const teamData = await teamSnapshot.json();
    assert.equal(teamData.game.round, 1);
    assert.equal(teamData.team.cash, 702);
    assert.equal(teamData.team.holdings.IMMU, 2);
    assert.equal(teamData.teams, null);

    const staffSnapshot = await api(running.baseUrl, "/api/game", { token: staff.token });
    const staffData = await staffSnapshot.json();
    assert.equal(staffData.teams[0].cash, 702);
    assert.equal(staffData.teams[0].trades.length, 1);
    assert.equal(staffData.team, null);

    await stopServer(running.child);
    running = await startServer(port, dataDir);

    const persisted = await api(running.baseUrl, "/api/game", { token: staff.token });
    const persistedData = await persisted.json();
    assert.equal(persistedData.game.round, 1);
    assert.equal(persistedData.teams[0].holdings.IMMU, 2);
    assert.equal(persistedData.teams[0].cash, 702);
  } finally {
    if (running) await stopServer(running.child).catch(() => undefined);
    await rm(dataDir, { recursive: true, force: true });
  }
});
