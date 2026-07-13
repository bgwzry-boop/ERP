import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createV1ReleaseCandidateRefreshService } from "../server/services/v1ReleaseCandidateRefreshService.mjs";

const checkedAt = "2026-07-13T20:00:00.000Z";
const operatorId = "U-MANAGER-TEST";
const request = { marker: "server-request" };
const sensitiveText = "postgres://owner:secret@db.internal/prod https://erp.internal/api /Users/private/artifact";

assert.throws(() => createV1ReleaseCandidateRefreshService(), /precheckRefresh/);

const blocked = createHarness({
  precheck: {
    status: "blocked",
    ready: false,
    summary: {
      evidenceProgress: "0/34",
      signoffProgress: "0/6",
      productionEnvPreflightLabel: "1/10",
      productionGoLiveReadinessLabel: "1/5",
      productionGoLiveBlockingCount: 4,
      productionGoLiveFirstBlockedStageKey: "env-file-audit",
      productionGoLiveFirstBlockedStageLabel: `环境审计 ${sensitiveText}`,
      boundaryLabel: `待确认 ${sensitiveText}`,
      blockerCount: 1,
    },
    blockers: [
      {
        key: "production-env",
        label: `生产环境 ${sensitiveText}`,
        status: "blocked",
        detail: sensitiveText,
        nextAction: sensitiveText,
      },
    ],
  },
});
const blockedResult = await blocked.service.refresh({ request, operatorId });
assert.equal(blockedResult.httpStatus, 409);
assert.equal(blockedResult.body.status, "blocked_by_precheck");
assert.equal(blockedResult.body.summary.evidenceProgress, "0/34");
assert.equal(blockedResult.body.summary.releaseCandidateRefreshed, false);
assert.equal(blockedResult.body.safeguards.serverConfiguredEnvFileCount, 1);
assert.equal(blocked.calls.command, 0);
assertSensitiveTextAbsent(blockedResult);

const ready = createHarness({ commandResult: buildCommandResult({ ready: true }) });
const readyResult = await ready.service.refresh({ request, operatorId });
assert.equal(readyResult.httpStatus, 200);
assert.equal(readyResult.body.status, "ready_after_refresh");
assert.equal(readyResult.body.ready, true);
assert.equal(readyResult.body.summary.releaseCandidateRefreshed, true);
assert.equal(readyResult.body.summary.goLiveSuiteRefreshed, true);
assert.equal(readyResult.body.checkedAt, checkedAt);
assert.deepEqual(ready.calls.resolveInput, {
  request,
  configuredApiBaseUrl: "https://configured.internal/api",
});
assert.deepEqual(ready.calls.commandInput, {
  artifactRoot: "/private/erp/artifacts",
  apiBaseUrl: "http://127.0.0.1:8787/api",
  operatorId,
  driverOperatorId: "U-DRIVER-RELEASE",
  envFiles: ["/private/erp/production.env"],
});
assertSensitiveTextAbsent(readyResult);

const stillBlocked = createHarness({ commandResult: buildCommandResult({ ready: false }) });
const stillBlockedResult = await stillBlocked.service.refresh({ request, operatorId });
assert.equal(stillBlockedResult.httpStatus, 200);
assert.equal(stillBlockedResult.body.status, "blocked_after_refresh");
assert.equal(stillBlockedResult.body.summary.releaseCandidateRefreshed, true);
assert.equal(stillBlockedResult.body.ready, false);

const failed = createHarness({ commandError: new Error(sensitiveText) });
const failedResult = await failed.service.refresh({ request, operatorId });
assert.equal(failedResult.httpStatus, 500);
assert.equal(failedResult.body.status, "refresh_failed");
assert.equal(failedResult.body.error.code, "V1_RELEASE_CANDIDATE_REFRESH_FAILED");
assert.equal(failedResult.body.summary.releaseCandidateRefreshed, false);
assertSensitiveTextAbsent(failedResult);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const serviceSource = readFileSync(
  new URL("../server/services/v1ReleaseCandidateRefreshService.mjs", import.meta.url),
  "utf8",
);
const apiFunction = apiSource.match(
  /async function refreshSystemV1ReleaseCandidate\(\{ request, operatorId \}\) \{([\s\S]*?)\n\}/,
)?.[1];
assert.ok(apiFunction, "API release refresh composition function should exist");
assert.match(
  apiFunction,
  /return v1ReleaseCandidateRefreshService\.refresh\(\{ request, operatorId \}\);/,
);
assert.doesNotMatch(
  apiFunction,
  /process\.env|runV1ReleaseCandidateRefreshCommand|getV1GoLiveArtifactRoot|blockingItems|try\s*\{/,
);
for (const oldHelper of [
  "buildV1ReleaseCandidateRefreshBlockedBody",
  "buildV1ReleaseCandidateRefreshSuccessBody",
  "buildV1ReleaseCandidateRefreshErrorBody",
  "buildV1ReleaseCandidateRefreshSafeguards",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`function ${oldHelper}\\(`));
}
assert.doesNotMatch(serviceSource, /request\.body|body\.env|body\.path|body\.token/);

console.log(
  "V1 release-candidate refresh service checks passed: mandatory precheck, server-owned command inputs, ready/blocked/error projection, sensitive-text redaction, and thin API composition are covered.",
);

function createHarness({
  precheck = { status: "ready_to_refresh", ready: true, summary: {}, blockers: [] },
  commandResult = buildCommandResult({ ready: true }),
  commandError = null,
} = {}) {
  const calls = { command: 0, commandInput: null, resolveInput: null };
  const service = createV1ReleaseCandidateRefreshService({
    env: {
      ERP_V1_RELEASE_API_BASE_URL: "https://configured.internal/api",
      ERP_V1_RELEASE_DRIVER_OPERATOR_ID: "U-DRIVER-RELEASE",
      ERP_V1_FIELD_ACCEPTANCE_DRIVER_OPERATOR_ID: "U-DRIVER-FIELD",
    },
    now: () => new Date(checkedAt),
    async precheckRefresh(input) {
      assert.deepEqual(input, { request, operatorId });
      return { httpStatus: 200, body: precheck };
    },
    getArtifactRoot: () => "/private/erp/artifacts",
    resolveApiBaseUrl(input) {
      calls.resolveInput = input;
      return "http://127.0.0.1:8787/api";
    },
    async runRefreshCommand(input) {
      calls.command += 1;
      calls.commandInput = input;
      if (commandError) throw commandError;
      return commandResult;
    },
    getConfiguredEnvFiles: () => ["/private/erp/production.env"],
  });
  return { service, calls };
}

function buildCommandResult({ ready }) {
  return {
    ready,
    generatedAt: checkedAt,
    summary: {
      releaseCandidate: `0/4 ${sensitiveText}`,
      ownerDecision: `不可上线 ${sensitiveText}`,
      p0Prototype: "97-98%",
      v1Readiness: "80-83%",
      fieldEvidence: "0/34",
      onsiteTasks: 53,
      v2DifferenceCount: 5,
    },
  };
}

function assertSensitiveTextAbsent(value) {
  const serialized = JSON.stringify(value);
  for (const fragment of ["postgres://", "erp.internal", "/Users/private", "owner:secret"]) {
    assert.equal(serialized.includes(fragment), false, `response must redact ${fragment}`);
  }
}
