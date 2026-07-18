import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createV1ProductionGoLivePrecheckService,
  sanitizeV1ProductionGoLiveGateForReleasePrecheck,
} from "../server/services/v1ProductionGoLivePrecheckService.mjs";

const checkedAt = "2026-07-13T23:00:00.000Z";
const operatorId = "U-MANAGER-TEST";
const request = { marker: "server-request" };
const sensitiveText = "postgres://owner:secret@db.internal/prod https://erp.internal/api /Users/private/artifact";

assert.throws(() => createV1ProductionGoLivePrecheckService(), /buildRuntimeReadinessReport/);

const missing = createHarness({ envFiles: [] });
const missingResult = await missing.service.precheck({ request, operatorId });
assert.equal(missingResult.httpStatus, 200);
assert.equal(missing.calls.audit, 0);
assert.equal(missing.calls.preview, 0);
assert.equal(missing.calls.intake, 0);
assert.deepEqual(missing.calls.preflightInput, { env: missing.serverEnv, envFiles: [] });
assert.equal(missing.calls.reportInput.envFileAudit.status, "not_configured");
assert.equal(missing.calls.reportInput.envIntakeVerification.status, "blocked");
assert.equal(missing.calls.reportInput.envFileCount, 0);
assert.equal(missingResult.body.summary.configuredEnvFileCount, 0);
assert.equal(missingResult.body.safeguards.requestBodyIgnored, true);

const auditBlocked = createHarness({ envFiles: ["/private/secure.env"], auditReady: false });
await auditBlocked.service.precheck({ request, operatorId });
assert.equal(auditBlocked.calls.audit, 1);
assert.equal(auditBlocked.calls.preview, 0);
assert.equal(auditBlocked.calls.intake, 1);
assert.deepEqual(auditBlocked.calls.preflightInput, { env: auditBlocked.serverEnv, envFiles: [] });

const ready = createHarness({
  envFiles: ["/private/secure.env"],
  auditReady: true,
  report: buildGoLiveReport({ ready: true }),
});
const readyResult = await ready.service.precheck({ request, operatorId });
assert.equal(readyResult.httpStatus, 200);
assert.equal(readyResult.body.status, "ready");
assert.equal(readyResult.body.ready, true);
assert.equal(readyResult.body.summary.readinessLabel, "5/5");
assert.equal(readyResult.body.summary.configuredEnvFileCount, 1);
assert.equal(ready.calls.preview, 1);
assert.equal(ready.calls.intake, 1);
assert.deepEqual(ready.calls.runtimeInput, { request, operatorId });
assert.deepEqual(ready.calls.previewInput, ["/private/secure.env"]);
assert.deepEqual(ready.calls.preflightInput, {
  env: { ERP_RUNTIME_MODE: "production" },
  envFiles: ["/private/secure.env"],
});
assertSensitiveTextAbsent(readyResult);

const blocked = createHarness({
  envFiles: ["/private/secure.env"],
  auditReady: true,
  report: buildGoLiveReport({ ready: false }),
});
const blockedResult = await blocked.service.precheck({ request, operatorId });
assert.equal(blockedResult.body.status, "blocked");
assert.equal(blockedResult.body.summary.blockerCount, 1);
assert.equal(blockedResult.body.blockingStages.length, 1);
assertSensitiveTextAbsent(blockedResult);

const failed = createHarness({ envFiles: ["/private/secure.env"], auditError: new Error(sensitiveText) });
const failedResult = await failed.service.precheck({ request, operatorId });
assert.equal(failedResult.httpStatus, 500);
assert.equal(failedResult.body.status, "error");
assert.equal(failedResult.body.error.code, "V1_PRODUCTION_GO_LIVE_LIVE_PRECHECK_FAILED");
assert.equal(failedResult.body.summary.configuredEnvFileCount, 1);
assertSensitiveTextAbsent(failedResult);

const releaseGate = sanitizeV1ProductionGoLiveGateForReleasePrecheck(buildGoLiveReport({ ready: false }));
assert.equal(releaseGate.status, "blocked");
assert.equal(releaseGate.ready, false);
assert.equal(releaseGate.summary.firstBlockedStageKey, "runtime");
assertSensitiveTextAbsent(releaseGate);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const serviceSource = readFileSync(
  new URL("../server/services/v1ProductionGoLivePrecheckService.mjs", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(new URL("../server/routes/systemWriteRoutes.mjs", import.meta.url), "utf8");
assert.doesNotMatch(apiSource, /async function precheckSystemV1ProductionGoLive/);
assert.match(
  routeSource,
  /precheckProductionGoLive:[\s\S]*v1ProductionGoLivePrecheckService\.precheck\(\{ request, operatorId \}\)/,
);
assert.doesNotMatch(
  routeSource,
  /process\.env|buildProductionEnv|buildCurrentV1RuntimeReadinessReport|try\s*\{/,
);
for (const oldHelper of [
  "buildV1ProductionGoLiveMissingEnvFileAudit",
  "buildV1ProductionGoLiveMissingEnvIntakeVerification",
  "buildV1ProductionGoLivePrecheckBody",
  "buildV1ProductionGoLivePrecheckErrorBody",
  "sanitizeV1ProductionGoLiveStage",
  "sanitizeV1ProductionGoLiveBlockingItem",
  "sanitizeV1ProductionGoLiveUnblockItem",
  "sanitizeV1ProductionGoLiveFieldEvidenceCoverage",
  "sanitizeV1ProductionGoLiveRuntimeReadiness",
  "sanitizeV1ProductionGoLiveSafeguards",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`function ${oldHelper}\\(`));
}
assert.doesNotMatch(serviceSource, /request\.body|body\.env|body\.path|body\.token/);

console.log(
  "V1 production go-live precheck service checks passed: missing/audit-blocked/ready/blocked/error paths, server-owned env files, redaction, and thin API composition are covered.",
);

function createHarness({
  envFiles,
  auditReady = true,
  auditError = null,
  report = buildGoLiveReport({ ready: false }),
}) {
  const serverEnv = { ERP_RUNTIME_MODE: "demo", SECRET_SENTINEL: sensitiveText };
  const calls = {
    audit: 0,
    preview: 0,
    intake: 0,
    previewInput: null,
    preflightInput: null,
    runtimeInput: null,
    reportInput: null,
  };
  const service = createV1ProductionGoLivePrecheckService({
    env: serverEnv,
    now: () => new Date(checkedAt),
    getEnvFileConfig(input) {
      assert.deepEqual(input, { allowAuditOnlyFallback: false });
      return {
        envFiles,
        selectedEnvVariable: "ERP_V1_PRODUCTION_ENV_FILE",
        selectedSourceKind: "primary",
        sources: [{ envVariable: "ERP_V1_PRODUCTION_ENV_FILE", configured: envFiles.length > 0 }],
      };
    },
    buildEnvFileAuditReport(input) {
      calls.audit += 1;
      assert.deepEqual(input, { envFiles });
      if (auditError) throw auditError;
      return { status: auditReady ? "ready" : "blocked", ready: auditReady, summary: {} };
    },
    buildEnvPreviewEnvironment(input) {
      calls.preview += 1;
      calls.previewInput = input;
      return { ERP_RUNTIME_MODE: "production" };
    },
    buildEnvPreflight(input) {
      calls.preflightInput = input;
      return { status: "ready", ready: true, summary: {} };
    },
    buildEnvIntakeVerification(input) {
      calls.intake += 1;
      assert.deepEqual(input, { envFiles });
      return { status: "ready", ready: true, summary: {} };
    },
    async buildRuntimeReadinessReport(input) {
      calls.runtimeInput = input;
      return { status: "ready", ready: true, summary: { passedCount: 11, totalCount: 11 } };
    },
    buildGoLiveReport(input) {
      calls.reportInput = input;
      return report;
    },
  });
  return { service, calls, serverEnv };
}

function buildGoLiveReport({ ready }) {
  const stage = {
    key: "runtime",
    label: `运行时 ${sensitiveText}`,
    status: ready ? "passed" : "blocked",
    ready,
    summary: {
      label: `阶段摘要 ${sensitiveText}`,
      passedCount: ready ? 1 : 0,
      totalCount: 1,
      blockingCount: ready ? 0 : 1,
    },
    blockingItems: ready ? [] : [{
      key: "runtime-blocked",
      label: `运行时阻塞 ${sensitiveText}`,
      status: "blocked",
      detail: sensitiveText,
    }],
    nextActions: [`修正 ${sensitiveText}`],
  };
  return {
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt,
    envFileCount: 1,
    summary: {
      label: `组合预检 ${sensitiveText}`,
      passedCount: ready ? 5 : 4,
      totalCount: 5,
      blockingCount: ready ? 0 : 1,
      warningCount: 0,
      readinessLabel: ready ? "5/5" : "4/5",
      blockerLabel: ready ? "0 项" : "1 项",
      sourceStatuses: [{ envVariable: "ERP_V1_PRODUCTION_ENV_FILE", configured: true }],
    },
    stages: ready ? Array.from({ length: 5 }, (_, index) => ({ ...stage, key: `stage-${index}` })) : [stage],
    fixChecklist: [],
    unblockChecklist: [{
      key: "runtime-unblock",
      label: `解除阻塞 ${sensitiveText}`,
      status: ready ? "ready" : "blocked",
      ready,
      nextAction: sensitiveText,
      verificationSteps: [sensitiveText],
      evidenceToKeep: [sensitiveText],
    }],
    fieldEvidenceCoverage: {
      summary: { label: sensitiveText, totalCount: 1, nextAction: sensitiveText },
      items: [{
        groupKey: "runtime",
        groupLabel: sensitiveText,
        itemKey: "runtime-proof",
        itemLabel: `运行证明 ${sensitiveText}`,
        status: "waiting_for_stage",
        nextAction: sensitiveText,
      }],
    },
    runtimeReadiness: {
      status: ready ? "ready" : "blocked",
      ready,
      summary: { label: sensitiveText, passedCount: ready ? 11 : 5, totalCount: 11, blockingCount: ready ? 0 : 6 },
      remainingV1Risks: [sensitiveText],
    },
    nextActions: [sensitiveText],
    safeguards: {
      nonMutating: true,
      productionEnvAppliedToProcess: ready,
      physicalPrinterCalled: false,
      driverReadOnly: true,
      readinessRunnerReadOnly: true,
    },
  };
}

function assertSensitiveTextAbsent(value) {
  const serialized = JSON.stringify(value);
  for (const fragment of ["postgres://", "owner:secret", "db.internal", "erp.internal", "/Users/private", "SECRET_SENTINEL"]) {
    assert.equal(serialized.includes(fragment), false, `response must redact ${fragment}`);
  }
}
