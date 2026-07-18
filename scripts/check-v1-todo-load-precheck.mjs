import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import {
  formatV1TodoLoadPrecheck,
  helpText,
  parseArgs,
  writeV1TodoLoadPrecheckArtifacts,
} from "./run-v1-todo-load-precheck.mjs";
import {
  V1_TODO_LOAD_PRECHECK_LIMITS,
  runV1TodoLoadPrecheck,
} from "./v1TodoLoadPrecheckService.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-todo-load-precheck");
const outputDir = join(storageRoot, "evidence");
const runnerPath = join(process.cwd(), "scripts", "run-v1-todo-load-precheck.mjs");
const runtimeToken = "erp-runtime-session-v1.SENSITIVE_RUNTIME_TOKEN_VALUE";
const loginName = "sensitive.todo.load.operator";
const password = "SUPER_SECRET_TODO_LOAD_PASSWORD";
const todoIds = ["TODO-SENSITIVE-001", "TODO-SENSITIVE-002", "TODO-SENSITIVE-003"];

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

try {
  await checkCliParsingAndLimits();
  await checkExplicitConfirmationGuard();
  await checkReadyTokenAndArtifacts();
  await checkFormalLoginAndCli();
  await checkAuthenticationFailures();
  await checkReadFailuresAndContracts();
  await checkLatencyAndSnapshotWarning();
  console.log(
    "V1 todo load precheck passed: explicit confirmation, bounded concurrency, formal token/login, auth/permission/contract/latency blockers, snapshot warning, CLI, artifacts, and redaction are covered.",
  );
} finally {
  rmSync(storageRoot, { recursive: true, force: true });
}

async function checkCliParsingAndLimits() {
  const parsed = parseArgs([
    "--confirm-read-load",
    "--api-base-url",
    "https://erp.example.test/api",
    "--requests",
    "25",
    "--concurrency",
    "5",
    "--page-size",
    "50",
    "--timeout-ms",
    "2500",
    "--max-p95-ms",
    "800",
    "--max-error-rate",
    "0.01",
    "--no-write",
    "--json",
  ]);
  assert.equal(parsed.confirmed, true);
  assert.equal(parsed.requestCount, 25);
  assert.equal(parsed.concurrency, 5);
  assert.equal(parsed.maxErrorRate, 0.01);
  assert.equal(parsed.write, false);
  assert.equal(parsed.json, true);
  assert.match(helpText(), /never accepts a token\/password argument/);
  assert.throws(() => parseArgs(["--bearer-token", runtimeToken]), /Unknown argument/);
  await assert.rejects(
    runV1TodoLoadPrecheck({
      apiBaseUrl: "http://127.0.0.1:8787/api",
      confirmed: true,
      authInput: tokenAuthInput(),
      requestCount: V1_TODO_LOAD_PRECHECK_LIMITS.requestCount + 1,
    }),
    /requestCount must be an integer/,
  );
}

async function checkExplicitConfirmationGuard() {
  let requestCount = 0;
  await assert.rejects(
    runV1TodoLoadPrecheck({
      apiBaseUrl: "http://127.0.0.1:8787/api",
      confirmed: false,
      authInput: tokenAuthInput(),
      fetchImpl: async () => {
        requestCount += 1;
        throw new Error("must not be called");
      },
    }),
    /confirmation is required/,
  );
  assert.equal(requestCount, 0);
  await assert.rejects(
    runV1TodoLoadPrecheck({
      apiBaseUrl: "https://user:secret@erp.example.test/api",
      confirmed: true,
      authInput: tokenAuthInput(),
    }),
    /must not contain credentials/,
  );
  await assert.rejects(
    runV1TodoLoadPrecheck({
      apiBaseUrl: "http://127.0.0.1:8787/api",
      confirmed: true,
      authInput: tokenAuthInput(),
      requestCount: 5,
      concurrency: 6,
    }),
    /must not exceed requestCount/,
  );
}

async function checkReadyTokenAndArtifacts() {
  const server = await startFakeApi({ todoDelayMs: 8 });
  try {
    const report = await runPrecheck(server, {
      requestCount: 24,
      concurrency: 4,
      maxP95Ms: 500,
    });
    assert.equal(report.ready, true);
    assert.equal(report.status, "ready");
    assert.equal(report.authentication.serverVerified, true);
    assert.equal(report.authentication.sessionType, "runtime");
    assert.equal(report.summary.successCount, 24);
    assert.equal(report.summary.errorCount, 0);
    assert.equal(report.summary.snapshotVariantCount, 1);
    assert.equal(report.summary.snapshotChanged, false);
    assert.ok(report.summary.throughputPerSecond > 0);
    assert.ok(report.summary.latencyMs.p95 >= 1);
    assert.ok(server.state.maxActiveTodoRequests <= 4);
    assert.equal(server.state.loginCount, 0);
    assert.equal(server.state.authMeCount, 1);
    assert.equal(server.state.todoCount, 24);
    assert.deepEqual([...server.state.businessMethods], ["GET"]);
    assert.equal(server.state.legacyIdentityHeaderUsed, false);
    assertNoSensitiveOutput(JSON.stringify(report) + formatV1TodoLoadPrecheck(report));

    const paths = writeV1TodoLoadPrecheckArtifacts(report, { outputDir });
    assert.equal(existsSync(paths.latestJsonPath), true);
    assert.equal(existsSync(paths.latestMarkdownPath), true);
    assert.equal(statSync(outputDir).mode & 0o777, 0o700);
    assert.equal(statSync(paths.latestJsonPath).mode & 0o777, 0o600);
    assertNoSensitiveOutput(readFileSync(paths.latestJsonPath, "utf8"));
    assertNoSensitiveOutput(readFileSync(paths.latestMarkdownPath, "utf8"));
  } finally {
    await server.close();
  }
}

async function checkFormalLoginAndCli() {
  const server = await startFakeApi();
  try {
    const report = await runPrecheck(server, {
      authInput: loginAuthInput(),
      requestCount: 6,
      concurrency: 2,
    });
    assert.equal(report.ready, true);
    assert.equal(report.authentication.source, "formal_login");
    assert.equal(server.state.loginCount, 1);
    assert.equal(server.state.todoCount, 6);

    const cli = await runCli([
      "--confirm-read-load",
      "--api-base-url",
      server.apiBaseUrl,
      "--requests",
      "4",
      "--concurrency",
      "2",
      "--max-p95-ms",
      "1000",
      "--no-write",
      "--json",
    ], {
      ERP_V1_READINESS_LOGIN_NAME: loginName,
      ERP_V1_READINESS_PASSWORD: password,
      ERP_V1_READINESS_TOKEN: "",
    });
    assert.equal(cli.code, 0, cli.stderr || cli.stdout);
    const cliReport = JSON.parse(cli.stdout);
    assert.equal(cliReport.ready, true);
    assert.equal(cliReport.environment.envFilePathExposed, false);
    assert.equal(cliReport.artifacts.written, false);
    assertNoSensitiveOutput(cli.stdout + cli.stderr);
  } finally {
    await server.close();
  }
}

async function checkAuthenticationFailures() {
  let fetchCount = 0;
  const seedReport = await runV1TodoLoadPrecheck({
    apiBaseUrl: "http://127.0.0.1:8787/api",
    confirmed: true,
    authInput: { ...tokenAuthInput(), bearerToken: "seed-session.SENSITIVE_SEED_TOKEN" },
    requestCount: 2,
    concurrency: 1,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("must not be called");
    },
  });
  assert.equal(seedReport.ready, false);
  assert.equal(seedReport.blockingStages[0].key, "formal-runtime-auth");
  assert.equal(fetchCount, 0);
  assertNoSensitiveOutput(JSON.stringify(seedReport));

  const server = await startFakeApi({ sessionType: "seed" });
  try {
    const report = await runPrecheck(server, { requestCount: 2, concurrency: 1 });
    assert.equal(report.ready, false);
    assert.equal(report.authentication.serverVerified, false);
    assert.equal(server.state.todoCount, 0);
  } finally {
    await server.close();
  }
}

async function checkReadFailuresAndContracts() {
  const forbidden = await startFakeApi({ todoStatus: 403 });
  try {
    const report = await runPrecheck(forbidden, { requestCount: 5, concurrency: 2, maxErrorRate: 0.2 });
    assert.equal(report.ready, false);
    assert.equal(report.summary.errorCount, 5);
    assert.equal(report.summary.errorRate, 1);
    assert.deepEqual(report.errorBreakdown, [{ category: "http_403", count: 5 }]);
    assert.equal(report.blockingStages.some((item) => item.key === "todo-read-load"), true);
  } finally {
    await forbidden.close();
  }

  const invalidSort = await startFakeApi({ invalidSort: true });
  try {
    const report = await runPrecheck(invalidSort, { requestCount: 4, concurrency: 2 });
    assert.equal(report.ready, false);
    assert.deepEqual(report.errorBreakdown, [{ category: "server_sort_contract", count: 4 }]);
    assert.equal(report.blockingStages.some((item) => item.key === "todo-server-contract"), true);
  } finally {
    await invalidSort.close();
  }

  const invalidPolicy = await startFakeApi({ invalidPolicy: true });
  try {
    const report = await runPrecheck(invalidPolicy, { requestCount: 3, concurrency: 1 });
    assert.equal(report.ready, false);
    assert.deepEqual(report.errorBreakdown, [{ category: "reminder_policy_contract", count: 3 }]);
  } finally {
    await invalidPolicy.close();
  }

  const tolerated = await startFakeApi({ todoFailureEvery: 4 });
  try {
    const report = await runPrecheck(tolerated, {
      requestCount: 4,
      concurrency: 1,
      maxErrorRate: 0.25,
    });
    assert.equal(report.ready, true);
    assert.equal(report.summary.errorCount, 1);
    assert.equal(report.summary.errorRate, 0.25);
    assert.equal(report.stages.find((item) => item.key === "todo-error-rate-threshold")?.ready, true);
  } finally {
    await tolerated.close();
  }
}

async function checkLatencyAndSnapshotWarning() {
  const slow = await startFakeApi({ todoDelayMs: 20 });
  try {
    const report = await runPrecheck(slow, {
      requestCount: 5,
      concurrency: 1,
      maxP95Ms: 5,
    });
    assert.equal(report.ready, false);
    assert.ok(report.summary.latencyMs.p95 > 5);
    assert.equal(report.blockingStages.some((item) => item.key === "todo-latency-threshold"), true);
  } finally {
    await slow.close();
  }

  const changing = await startFakeApi({ changingSnapshot: true });
  try {
    const report = await runPrecheck(changing, { requestCount: 6, concurrency: 1 });
    assert.equal(report.ready, true);
    assert.equal(report.summary.snapshotChanged, true);
    assert.equal(report.summary.snapshotVariantCount, 2);
    assert.deepEqual(report.warnings.map((item) => item.key), ["snapshot_changed"]);
  } finally {
    await changing.close();
  }
}

function runPrecheck(server, overrides = {}) {
  return runV1TodoLoadPrecheck({
    apiBaseUrl: server.apiBaseUrl,
    confirmed: true,
    authInput: overrides.authInput || tokenAuthInput(),
    requestCount: overrides.requestCount ?? 10,
    concurrency: overrides.concurrency ?? 2,
    pageSize: 20,
    timeoutMs: 1_000,
    maxP95Ms: overrides.maxP95Ms ?? 500,
    maxErrorRate: overrides.maxErrorRate ?? 0,
  });
}

function tokenAuthInput() {
  return {
    role: "operator",
    operatorId: "",
    bearerToken: runtimeToken,
    loginName: "",
    password: "",
    envKeys: authEnvKeys(),
  };
}

function loginAuthInput() {
  return {
    role: "operator",
    operatorId: "U-RUNTIME-TODO-LOAD",
    bearerToken: "",
    loginName,
    password,
    envKeys: authEnvKeys(),
  };
}

function authEnvKeys() {
  return {
    operatorId: "ERP_V1_READINESS_OPERATOR_ID",
    bearerToken: "ERP_V1_READINESS_TOKEN",
    loginName: "ERP_V1_READINESS_LOGIN_NAME",
    password: "ERP_V1_READINESS_PASSWORD",
  };
}

async function startFakeApi({
  sessionType = "runtime",
  todoStatus = 200,
  todoFailureEvery = 0,
  invalidSort = false,
  invalidPolicy = false,
  todoDelayMs = 0,
  changingSnapshot = false,
} = {}) {
  const state = {
    loginCount: 0,
    authMeCount: 0,
    todoCount: 0,
    activeTodoRequests: 0,
    maxActiveTodoRequests: 0,
    businessMethods: new Set(),
    legacyIdentityHeaderUsed: false,
  };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    state.legacyIdentityHeaderUsed ||= Boolean(request.headers["x-erp-user-id"]);
    if (url.pathname === "/api/auth/login") {
      state.loginCount += 1;
      assert.equal(request.method, "POST");
      const body = await readJsonBody(request);
      assert.equal(body.loginName, loginName);
      assert.equal(body.password, password);
      return sendJson(response, 200, {
        session: { accessToken: runtimeToken, sessionType: "runtime", userId: "U-RUNTIME-TODO-LOAD" },
        permissions: { user: { userId: "U-RUNTIME-TODO-LOAD" } },
      });
    }
    if (url.pathname === "/api/auth/me") {
      state.authMeCount += 1;
      assert.equal(request.method, "GET");
      assert.equal(request.headers.authorization, `Bearer ${runtimeToken}`);
      return sendJson(response, 200, {
        authenticated: true,
        session: { sessionType },
        permissions: { user: { userId: "U-RUNTIME-TODO-LOAD" } },
      });
    }
    if (url.pathname === "/api/todos") {
      state.todoCount += 1;
      state.businessMethods.add(request.method);
      state.activeTodoRequests += 1;
      state.maxActiveTodoRequests = Math.max(state.maxActiveTodoRequests, state.activeTodoRequests);
      try {
        assert.equal(request.method, "GET");
        assert.equal(request.headers.authorization, `Bearer ${runtimeToken}`);
        assert.equal(url.searchParams.get("status"), "all");
        assert.equal(url.searchParams.get("page"), "1");
        if (todoDelayMs) await delay(todoDelayMs);
        const effectiveStatus = todoFailureEvery > 0 && state.todoCount % todoFailureEvery === 0 ? 503 : todoStatus;
        if (effectiveStatus !== 200) return sendJson(response, effectiveStatus, { code: "SENSITIVE_SERVER_ERROR" });
        const ids = changingSnapshot && state.todoCount % 2 === 0
          ? [todoIds[0], todoIds[2]]
          : todoIds;
        const items = ids.map((todoId, index) => ({
          todoId,
          summary: "sensitive business payload",
          serverSortIndex: invalidSort && index === 0 ? 1 : index,
        }));
        return sendJson(response, 200, {
          items,
          total: items.length,
          page: 1,
          pageSize: items.length,
          reminderPolicy: invalidPolicy ? { source: "client", version: "" } : { source: "server", version: "v1" },
        });
      } finally {
        state.activeTodoRequests -= 1;
      }
    }
    sendJson(response, 404, {});
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const port = server.address().port;
  return {
    apiBaseUrl: `http://127.0.0.1:${port}/api`,
    state,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

function runCli(args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [runnerPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolveRun({ code, stdout, stderr }));
  });
}

function readJsonBody(request) {
  return new Promise((resolveBody, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function assertNoSensitiveOutput(value) {
  const output = String(value);
  for (const sensitive of [runtimeToken, loginName, password, ...todoIds, "sensitive business payload", "SENSITIVE_SERVER_ERROR"]) {
    assert.doesNotMatch(output, new RegExp(escapeRegExp(sensitive)), `output leaked ${sensitive}`);
  }
  assert.doesNotMatch(output, /127\.0\.0\.1:\d+/);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
