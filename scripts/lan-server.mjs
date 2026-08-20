import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.BE_LAN_PORT ?? "3000";

if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error("BE_LAN_PORT는 1~65535 사이의 포트 번호여야 합니다.");
  process.exit(1);
}

const requiredFiles = [
  resolve(projectRoot, ".dev.vars"),
  resolve(projectRoot, "dist/server/wrangler.json"),
];
const runtimeEnvPath = resolve(projectRoot, "dist/server/.dev.vars");

if (!existsSync(requiredFiles[0])) {
  console.error(".dev.vars 파일이 없습니다. 로그인 비밀번호 설정을 먼저 준비해 주세요.");
  process.exit(1);
}

if (!existsSync(requiredFiles[1])) {
  console.error("서버 빌드가 없습니다. npm run build를 먼저 실행해 주세요.");
  process.exit(1);
}

copyFileSync(requiredFiles[0], runtimeEnvPath);

const addresses = [];
for (const [name, entries] of Object.entries(networkInterfaces())) {
  for (const entry of entries ?? []) {
    if (entry.family === "IPv4" && !entry.internal) addresses.push({ name, address: entry.address });
  }
}

addresses.sort((left, right) => {
  const privateAddress = (value) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value) ? 0 : 1;
  return privateAddress(left.address) - privateAddress(right.address) || left.name.localeCompare(right.name);
});

console.log("\n────────────────────────────────────────────────────");
console.log("  BE · Biology Exchange LAN 서버");
console.log("────────────────────────────────────────────────────");
console.log(`  스태프 노트북: http://localhost:${port}`);
if (addresses.length) {
  console.log("  참가 조 접속 주소:");
  for (const item of addresses) console.log(`    http://${item.address}:${port}  (${item.name})`);
} else {
  console.log(`  참가 조 접속 주소: http://<스태프 노트북 IP>:${port}`);
}
console.log("\n  모든 노트북을 같은 Wi-Fi에 연결한 뒤 같은 주소를 여세요.");
console.log("  macOS 방화벽 창이 뜨면 ‘허용’을 눌러 주세요.");
console.log("  이 창을 닫으면 서버가 멈추며, 게임 데이터는 .lan-data에 보존됩니다.");
console.log("────────────────────────────────────────────────────\n");

const wranglerBin = resolve(
  projectRoot,
  "node_modules/.bin",
  process.platform === "win32" ? "wrangler.cmd" : "wrangler",
);

const child = spawn(wranglerBin, [
  "dev",
  "--config", "dist/server/wrangler.json",
  "--local",
  "--ip", "0.0.0.0",
  "--port", port,
  "--persist-to", ".lan-data",
  "--log-level", "warn",
], {
  cwd: projectRoot,
  env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/lan-server.log" },
  stdio: "inherit",
});

const removeRuntimeEnv = () => {
  try {
    unlinkSync(runtimeEnvPath);
  } catch {
    // The build folder may already have been removed after the server stopped.
  }
};

const stop = () => {
  if (!child.killed) child.kill("SIGINT");
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code, signal) => {
  removeRuntimeEnv();
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
  process.exit(code ?? (signal ? 1 : 0));
});
