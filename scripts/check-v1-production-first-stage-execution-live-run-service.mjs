import assert from "node:assert/strict";
import { createV1ProductionFirstStageExecutionLiveRunService } from "../server/services/v1ProductionFirstStageExecutionLiveRunService.mjs";

const FIXED_NOW = "2026-07-14T07:00:00.000Z";
const SAFE_API_BASE_URL = "http://127.0.0.1:8787/api";
const maliciousRequest = {
  url: "/api/system/v1-production-first-stage-execution/live-run?apiBaseUrl=https://evil.example/api",
  headers: {
    host: "evil.example",
    "x-forwarded-host": "attacker.example",
    authorization: "Bearer secret-token",
  },
  body: {
    apiBaseUrl: "https://evil.example/api",
    envFilePath: "/Users/private/production.env",
    databaseUrl: "postgres://user:secret@prod/db",
  },
};
const commandCalls = [];
const resolverCalls = [];
const blockingCalls = [];
const service = createV1ProductionFirstStageExecutionLiveRunService({
  runCommand: async (...args) => {
    commandCalls.push(args);
    return buildReport({ ready: true });
  },
  resolveApiBaseUrl: (...args) => {
    resolverCalls.push(args);
    return SAFE_API_BASE_URL;
  },
  sanitizeBlockingItem: (item) => {
    blockingCalls.push(item);
    return item?.key ? { key: item.key, label: "已脱敏", status: item.status || "blocked", detail: "", nextAction: "" } : null;
  },
  now: () => new Date(FIXED_NOW),
});

const readyResult = await service.run({ request: maliciousRequest, operatorId: "U-MANAGER-A" });
assert.equal(readyResult.httpStatus, 200);
assert.equal(readyResult.body.status, "passed");
assert.equal(readyResult.body.ready, true);
assert.equal(readyResult.body.checkedAt, FIXED_NOW);
assert.equal(readyResult.body.operatorId, "U-MANAGER-A");
assert.equal(readyResult.body.summary.firstStageStatus, "passed");
assert.equal(readyResult.body.summary.requestBodyIgnored, true);
assert.equal(readyResult.body.summary.runtimeSmokeUsesCurrentApi, true);
assert.equal(readyResult.body.serverConfigGuidance.acceptsFrontendPath, false);
assert.equal(readyResult.body.serverConfigGuidance.runtimeSmokeApiBaseUrlAcceptedFromFrontend, false);
assert.equal(readyResult.body.serverConfigGuidance.applyMigrationsByDefault, false);
assert.equal(readyResult.body.serverConfigGuidance.restoreResetAllowedByDefault, false);
assert.equal(readyResult.body.safeguards.nonMutating, true);
assert.equal(readyResult.body.safeguards.apiBaseUrlAcceptedFromRequest, false);
assert.equal(readyResult.body.safeguards.apiBaseUrlExposed, false);
assert.equal(readyResult.body.safeguards.productionEnvValuesApplyExecuted, false);
assert.equal(readyResult.body.safeguards.businessDataMutated, false);
assert.equal(readyResult.body.safeguards.physicalPrinterCalled, false);
assert.deepEqual(commandCalls, [[{ apiBaseUrl: SAFE_API_BASE_URL }]]);
assert.deepEqual(resolverCalls, [[{ request: maliciousRequest }]]);
assert.equal(JSON.stringify(readyResult).includes("evil.example"), false);
assert.equal(JSON.stringify(readyResult).includes("secret-token"), false);
assert.equal(JSON.stringify(readyResult).includes("/Users/private/production.env"), false);
assert.equal(JSON.stringify(readyResult).includes("user:secret"), false);
assert.equal(JSON.stringify(readyResult).includes(SAFE_API_BASE_URL), false);

const blockedService = createV1ProductionFirstStageExecutionLiveRunService({
  runCommand: async ({ apiBaseUrl }) => {
    assert.equal(apiBaseUrl, SAFE_API_BASE_URL);
    return buildReport({ ready: false });
  },
  resolveApiBaseUrl: () => SAFE_API_BASE_URL,
  sanitizeBlockingItem: (item) => item,
  now: () => new Date(FIXED_NOW),
});
const blockedResult = await blockedService.run({ operatorId: "U-TECH-A" });
assert.equal(blockedResult.body.status, "blocked");
assert.equal(blockedResult.body.ready, false);
assert.equal(blockedResult.body.summary.blockingCount, 1);
assert.equal(blockedResult.body.nextAction.includes("第一阶段"), true);

const projected = service.buildResponseBody({
  operatorId: "U-MANAGER-A",
  checkedAt: FIXED_NOW,
  status: "blocked",
  report: {},
  blockingItems: [{ key: "sensitive", label: "postgres://secret@host/db", status: "blocked" }],
});
assert.equal(projected.blockingItems[0].label, "已脱敏");
assert.equal(blockingCalls.length, 1);
assert.equal(JSON.stringify(projected).includes("postgres://secret@host/db"), false);

const errorService = createV1ProductionFirstStageExecutionLiveRunService({
  runCommand: async () => {
    throw new Error("postgres://user:secret@prod/db /Users/private/env");
  },
  resolveApiBaseUrl: () => SAFE_API_BASE_URL,
  sanitizeBlockingItem: (item) => item,
  now: () => new Date(FIXED_NOW),
});
const errorResult = await errorService.run({ request: maliciousRequest, operatorId: "U-MANAGER-A" });
assert.equal(errorResult.httpStatus, 200);
assert.equal(errorResult.body.status, "error");
assert.equal(errorResult.body.ready, false);
assert.equal(errorResult.body.error.code, "V1_PRODUCTION_FIRST_STAGE_EXECUTION_LIVE_RUN_FAILED");
assert.equal(JSON.stringify(errorResult).includes("user:secret"), false);
assert.equal(JSON.stringify(errorResult).includes("/Users/private/env"), false);
assert.equal(errorResult.body.safeguards.businessDataMutated, false);

const resolverErrorService = createV1ProductionFirstStageExecutionLiveRunService({
  runCommand: async () => assert.fail("command must not run when target resolution fails"),
  resolveApiBaseUrl: () => {
    throw new Error("https://private-api.example/api");
  },
  sanitizeBlockingItem: (item) => item,
  now: () => new Date(FIXED_NOW),
});
const resolverErrorResult = await resolverErrorService.run({ request: maliciousRequest });
assert.equal(resolverErrorResult.body.status, "error");
assert.equal(JSON.stringify(resolverErrorResult).includes("private-api.example"), false);

assert.throws(
  () => createV1ProductionFirstStageExecutionLiveRunService({ sanitizeBlockingItem: () => null }),
  /runCommand must be a function/,
);
assert.throws(
  () => createV1ProductionFirstStageExecutionLiveRunService({ runCommand: () => {}, sanitizeBlockingItem: () => null }),
  /resolveApiBaseUrl must be a function/,
);
const invalidClockService = createV1ProductionFirstStageExecutionLiveRunService({
  runCommand: async () => ({}),
  resolveApiBaseUrl: () => SAFE_API_BASE_URL,
  sanitizeBlockingItem: (item) => item,
  now: () => new Date("invalid"),
});
await assert.rejects(() => invalidClockService.run({}), /now\(\) must return a valid Date/);

console.log("V1 production first-stage execution live-run service checks passed: safe target resolution, command isolation, redacted projection, blocked/error handling, and thin API composition are covered.");

function buildReport({ ready }) {
  return {
    scope: "v1_production_first_stage_execution",
    status: ready ? "passed" : "blocked",
    ready,
    checkedAt: FIXED_NOW,
    summary: {
      label: ready ? "5/5 步骤通过" : "4/5 步骤通过",
      passedCount: ready ? 5 : 4,
      totalCount: 5,
      blockingCount: ready ? 0 : 1,
      errorCount: 0,
    },
    execution: {
      envFileCount: 1,
      envFileSourceLabel: "production setup",
      envFileFromProductionSetup: true,
      applyMigrations: false,
      restoreResetExplicitlyAllowed: false,
      runtimeSmokeUsesExistingApi: true,
    },
    stages: ready ? [] : [{ key: "postgres", label: "PostgreSQL", status: "blocked", detail: "待配置" }],
    blockingStages: ready ? [] : [{ key: "postgres", label: "PostgreSQL", status: "blocked", detail: "待配置" }],
    nextActions: ready ? ["继续现场证据"] : [],
  };
}
