import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDeliAttendanceGatewayProductionPreflight } from "./run-deli-attendance-gateway-production-preflight.mjs";

const secrets = {
  appKey: "deli-live-app-key-001",
  appSecret: "deli-live-app-secret-002",
  token: "gateway-token-003-with-at-least-32-bytes",
  databaseUrl: "postgres://gateway_user:secret-password@db.internal:5432/erp",
};

const readyEnv = {
  DELI_EPLUS_APP_KEY: secrets.appKey,
  DELI_EPLUS_APP_SECRET: secrets.appSecret,
  DELI_EPLUS_API_BASE_URL: "https://v2-api.delicloud.com",
  DELI_EPLUS_PAGE_SIZE: "500",
  DELI_EPLUS_MAX_PAGES: "400",
  DELI_EPLUS_TIMEOUT_MS: "10000",
  DELI_ATTENDANCE_GATEWAY_DATABASE_URL: secrets.databaseUrl,
  DELI_ATTENDANCE_GATEWAY_TOKEN: secrets.token,
  DELI_ATTENDANCE_GATEWAY_HOST: "127.0.0.1",
  DELI_ATTENDANCE_GATEWAY_PORT: "8792",
  DELI_ATTENDANCE_GATEWAY_PATH: "/v1/punches/query",
};

const blocked = buildDeliAttendanceGatewayProductionPreflight({ env: {} });
assert.equal(blocked.ready, false);
assert.equal(blocked.status, "blocked");
assert.ok(blocked.summary.blockingCount >= 3);
assert.equal(blocked.safeguards.networkRequested, false);
assert.equal(blocked.safeguards.databaseConnected, false);
assertRedacted(blocked);

const ready = buildDeliAttendanceGatewayProductionPreflight({
  env: readyEnv,
  envFileCount: 1,
  envFileAudit: { regularFiles: 1, permissionsRestricted: 1, symbolicLinks: 0 },
});
assert.equal(ready.ready, true);
assert.equal(ready.status, "ready");
assert.equal(ready.summary.blockingCount, 0);
assert.equal(ready.envFileCount, 1);
assert.equal(ready.criteria.find((item) => item.key === "official-deli-api")?.status, "passed");
assert.equal(ready.criteria.find((item) => item.key === "secure-gateway-env-file")?.status, "passed");
assert.equal(ready.criteria.find((item) => item.key === "persistent-gateway-database")?.status, "passed");
assert.equal(ready.criteria.find((item) => item.key === "loopback-gateway-boundary")?.status, "passed");
assert.equal(ready.criteria.find((item) => item.key === "secret-isolation")?.status, "passed");
assertRedacted(ready);

const publicHost = buildDeliAttendanceGatewayProductionPreflight({
  env: { ...readyEnv, DELI_ATTENDANCE_GATEWAY_HOST: "0.0.0.0" },
});
assert.equal(publicHost.ready, false);
assert.equal(publicHost.criteria.find((item) => item.key === "loopback-gateway-boundary")?.status, "pending");

const nonOfficialApi = buildDeliAttendanceGatewayProductionPreflight({
  env: { ...readyEnv, DELI_EPLUS_API_BASE_URL: "https://proxy.internal/deli" },
});
assert.equal(nonOfficialApi.ready, false);
assert.equal(nonOfficialApi.criteria.find((item) => item.key === "official-deli-api")?.status, "pending");

const sharedSecret = buildDeliAttendanceGatewayProductionPreflight({
  env: {
    ...readyEnv,
    DELI_EPLUS_APP_SECRET: secrets.token,
  },
});
assert.equal(sharedSecret.ready, false);
assert.equal(sharedSecret.criteria.find((item) => item.key === "secret-isolation")?.status, "pending");

const placeholder = buildDeliAttendanceGatewayProductionPreflight({
  env: {
    ...readyEnv,
    DELI_EPLUS_APP_KEY: "<REPLACE_WITH_DELI_APP_KEY>",
  },
});
assert.equal(placeholder.ready, false);
assert.equal(placeholder.criteria.find((item) => item.key === "deli-credentials")?.status, "pending");
assert.equal(placeholder.summary.placeholderValueCount, 1);

const invalidDatabase = buildDeliAttendanceGatewayProductionPreflight({
  env: { ...readyEnv, DELI_ATTENDANCE_GATEWAY_DATABASE_URL: "mysql://db.internal/erp" },
});
assert.equal(invalidDatabase.ready, false);
assert.equal(invalidDatabase.criteria.find((item) => item.key === "persistent-gateway-database")?.status, "pending");

const invalidPagination = buildDeliAttendanceGatewayProductionPreflight({
  env: { ...readyEnv, DELI_EPLUS_PAGE_SIZE: "501" },
});
assert.equal(invalidPagination.ready, false);
assert.equal(invalidPagination.criteria.find((item) => item.key === "incremental-query-safety")?.status, "pending");

const serviceTemplate = readFileSync(
  join(process.cwd(), "deploy", "production", "deli-attendance-gateway.service.example"),
  "utf8",
);
assert.match(
  serviceTemplate,
  /ExecStartPre=\/usr\/bin\/npm run deli-attendance-gateway:production-preflight -- --env-file \/etc\/erp\/deli-attendance-gateway\.env/,
);
assert.match(serviceTemplate, /EnvironmentFile=\/etc\/erp\/deli-attendance-gateway\.env/);
assert.match(serviceTemplate, /UMask=0077/);

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "deli-attendance-gateway-production-preflight");
const envPath = join(storageRoot, "gateway.env");
rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });
writeFileSync(envPath, Object.entries(readyEnv).map(([key, value]) => `${key}=${value}`).join("\n"), { mode: 0o600 });

const cliReady = await runCli(["--env-file", envPath, "--json"]);
assert.equal(cliReady.code, 0, cliReady.stderr);
const cliReport = JSON.parse(cliReady.stdout);
assert.equal(cliReport.ready, true);
assert.equal(cliReport.envFileCount, 1);
assertRedacted(`${cliReady.stdout}\n${cliReady.stderr}`);

chmodSync(envPath, 0o644);
const insecureFile = await runCli(["--env-file", envPath, "--json"]);
assert.equal(insecureFile.code, 2, insecureFile.stderr);
assert.equal(
  JSON.parse(insecureFile.stdout).criteria.find((item) => item.key === "secure-gateway-env-file")?.status,
  "pending",
);
assertRedacted(`${insecureFile.stdout}\n${insecureFile.stderr}`);

const cliBlocked = await runCli(["--json"], { PATH: process.env.PATH ?? "" });
assert.equal(cliBlocked.code, 2, cliBlocked.stderr);
assert.equal(JSON.parse(cliBlocked.stdout).ready, false);
assertRedacted(`${cliBlocked.stdout}\n${cliBlocked.stderr}`);

rmSync(storageRoot, { recursive: true, force: true });
process.stdout.write("Deli attendance gateway production preflight checks passed.\n");

function runCli(args, env = { PATH: process.env.PATH ?? "" }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      join(process.cwd(), "scripts", "run-deli-attendance-gateway-production-preflight.mjs"),
      ...args,
    ], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function assertRedacted(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const secret of Object.values(secrets)) {
    assert.equal(text.includes(secret), false, `preflight output exposed a sensitive value`);
  }
}
