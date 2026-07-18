import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createV1ProductionPersistenceEvidenceLiveRunService } from "../server/services/v1ProductionPersistenceEvidenceLiveRunService.mjs";

const FIXED_NOW = "2026-07-14T06:00:00.000Z";
const commandCalls = [];
const blockingCalls = [];
const service = createV1ProductionPersistenceEvidenceLiveRunService({
  runCommand: async (...args) => {
    commandCalls.push(args);
    return buildReport({ ready: true });
  },
  sanitizeBlockingItem: (item) => {
    blockingCalls.push(item);
    return item?.key ? { key: item.key, label: "已脱敏", status: item.status || "blocked", detail: "", nextAction: "" } : null;
  },
  now: () => new Date(FIXED_NOW),
});

const readyResult = await service.run({ operatorId: "U-MANAGER-A", ignoredPath: "/tmp/secret.env" });
assert.equal(readyResult.httpStatus, 200);
assert.equal(readyResult.body.status, "ready");
assert.equal(readyResult.body.ready, true);
assert.equal(readyResult.body.checkedAt, FIXED_NOW);
assert.equal(readyResult.body.operatorId, "U-MANAGER-A");
assert.equal(readyResult.body.summary.postgresReady, true);
assert.equal(readyResult.body.summary.objectStorageReady, true);
assert.equal(readyResult.body.summary.requestBodyIgnored, true);
assert.equal(readyResult.body.serverConfigGuidance.acceptsFrontendPath, false);
assert.equal(readyResult.body.serverConfigGuidance.applyMigrationsByDefault, false);
assert.equal(readyResult.body.serverConfigGuidance.restoreResetAllowedByDefault, false);
assert.equal(readyResult.body.safeguards.nonMutating, true);
assert.equal(readyResult.body.safeguards.rawCommandStdoutIncluded, false);
assert.deepEqual(commandCalls, [[]]);
assert.equal(JSON.stringify(readyResult).includes("/tmp/secret.env"), false);

const blockedService = createV1ProductionPersistenceEvidenceLiveRunService({
  runCommand: async () => buildReport({ ready: false }),
  sanitizeBlockingItem: (item) => item,
  now: () => new Date(FIXED_NOW),
});
const blockedResult = await blockedService.run({ operatorId: "U-TECH-A" });
assert.equal(blockedResult.body.status, "blocked");
assert.equal(blockedResult.body.ready, false);
assert.equal(blockedResult.body.summary.blockingCount, 1);
assert.equal(blockedResult.body.nextAction.includes("补齐真实 PostgreSQL"), true);

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

const errorService = createV1ProductionPersistenceEvidenceLiveRunService({
  runCommand: async () => {
    throw new Error("postgres://user:secret@prod/db /Users/private/env");
  },
  sanitizeBlockingItem: (item) => item,
  now: () => new Date(FIXED_NOW),
});
const errorResult = await errorService.run({ operatorId: "U-MANAGER-A" });
assert.equal(errorResult.httpStatus, 200);
assert.equal(errorResult.body.status, "error");
assert.equal(errorResult.body.ready, false);
assert.equal(errorResult.body.error.code, "V1_PRODUCTION_PERSISTENCE_EVIDENCE_LIVE_RUN_FAILED");
assert.equal(JSON.stringify(errorResult).includes("user:secret"), false);
assert.equal(JSON.stringify(errorResult).includes("/Users/private/env"), false);
assert.equal(errorResult.body.safeguards.businessDataMutated, false);

assert.throws(
  () => createV1ProductionPersistenceEvidenceLiveRunService({ sanitizeBlockingItem: () => null }),
  /runCommand must be a function/,
);
const invalidClockService = createV1ProductionPersistenceEvidenceLiveRunService({
  runCommand: async () => ({}),
  sanitizeBlockingItem: (item) => item,
  now: () => new Date("invalid"),
});
await assert.rejects(() => invalidClockService.run({}), /now\(\) must return a valid Date/);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../server/routes/systemWriteRoutes.mjs", import.meta.url), "utf8");
assert.doesNotMatch(apiSource, /function buildV1ProductionPersistenceEvidenceLiveRunBody/);
assert.doesNotMatch(apiSource, /function buildV1ProductionPersistenceEvidenceServerConfigGuidance/);
assert.doesNotMatch(apiSource, /async function runSystemV1ProductionPersistenceEvidence/);
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
assert.match(registrySource, /createV1ProductionPersistenceEvidenceLiveRunService/);
assert.match(routeSource, /runProductionPersistenceEvidence:[\s\S]*v1ProductionPersistenceEvidenceLiveRunService\.run\(\{ operatorId \}\)/);

console.log("V1 production persistence-evidence live-run service checks passed: command isolation, safe projection, blocked/error handling, and thin API composition are covered.");

function buildReport({ ready }) {
  return {
    scope: "v1_production_persistence_evidence",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: FIXED_NOW,
    envFileFromProductionSetup: true,
    envFileSourceLabel: "production setup",
    summary: {
      label: ready ? "5/5 阶段通过" : "4/5 阶段通过",
      passedCount: ready ? 5 : 4,
      totalCount: 5,
      blockingCount: ready ? 0 : 1,
      warningCount: 0,
      persistenceEnvReady: true,
      postgresReady: ready,
      postgresBackupRestoreReady: ready,
      objectStorageReady: true,
      objectStorageGovernanceReady: true,
    },
    stages: ready ? [] : [{ key: "postgres", label: "PostgreSQL", status: "blocked", detail: "待配置" }],
    blockingStages: ready ? [] : [{ key: "postgres", label: "PostgreSQL", status: "blocked", detail: "待配置" }],
    nextActions: ready ? ["继续 runtime smoke"] : [],
    safeguards: {
      postgresBackupRestoreRestoreDatabaseMutated: false,
      envValuesIncluded: false,
      commandValuesIncluded: false,
    },
  };
}
