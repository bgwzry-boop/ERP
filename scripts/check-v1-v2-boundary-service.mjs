import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createV1V2BoundaryService } from "../server/services/v1V2BoundaryService.mjs";

const checkedAt = "2026-07-13T22:00:00.000Z";
const operatorId = "U-MANAGER-TEST";
const sensitiveText = "postgres://owner:secret@db.internal/prod https://erp.internal/api /Users/private/artifact";

assert.throws(() => createV1V2BoundaryService(), /readStatusArtifacts/);

const missing = createHarness({ artifacts: buildArtifacts({ scope: {}, boundaryReady: false }) });
const missingResult = missing.service.precheck({ operatorId });
assert.equal(missingResult.httpStatus, 200);
assert.equal(missingResult.body.status, "pending_confirmation");
assert.equal(missingResult.body.ready, false);
assert.deepEqual(blockerKeys(missingResult), [
  "owner-review-rule-missing",
  "v1-v2-boundary-confirmation-missing",
  "v1-v2-brief-missing",
]);
assert.equal(missingResult.body.safeguards.nonMutating, true);
assert.equal(missingResult.body.safeguards.boundaryConfirmationMutated, false);

const openV1 = createHarness({
  artifacts: buildArtifacts({
    boundaryReady: true,
    scope: buildScope({ ready: false, canDeclareV1Complete: false, v1MustContinue: [`生产配置 ${sensitiveText}`] }),
  }),
});
const openV1Result = openV1.service.precheck({ operatorId });
assert.equal(openV1Result.body.status, "confirmed_but_v1_blocked");
assert.deepEqual(blockerKeys(openV1Result), ["v1-must-continue-open"]);
assertSensitiveTextAbsent(openV1Result);

const ready = createHarness({
  artifacts: buildArtifacts({
    boundaryReady: true,
    scope: buildScope({ ready: true, canDeclareV1Complete: true, v1MustContinue: [] }),
  }),
});
const readyResult = ready.service.precheck({ operatorId });
assert.equal(readyResult.body.status, "ready");
assert.equal(readyResult.body.ready, true);
assert.equal(readyResult.body.summary.boundaryReady, true);
assert.equal(readyResult.body.summary.canDeclareV1Complete, true);
assert.equal(readyResult.body.blockers.length, 0);

const refreshed = await ready.service.refreshScopeBrief({ operatorId });
assert.equal(refreshed.httpStatus, 200);
assert.equal(refreshed.body.status, "ready_scope_brief_refreshed");
assert.equal(refreshed.body.summary.scopeBriefRefreshed, true);
assert.equal(refreshed.body.summary.boundaryConfirmationMutated, false);
assert.equal(refreshed.body.summary.releaseCandidateRefreshed, false);
assert.deepEqual(ready.calls.commandInput, { artifactRoot: "/private/erp/artifacts" });
assertSensitiveTextAbsent(refreshed);

const failed = createHarness({
  artifacts: buildArtifacts({ scope: buildScope({}), boundaryReady: false }),
  commandError: new Error(sensitiveText),
});
const failedResult = await failed.service.refreshScopeBrief({ operatorId });
assert.equal(failedResult.httpStatus, 500);
assert.equal(failedResult.body.status, "scope_brief_refresh_failed");
assert.equal(failedResult.body.error.code, "V1_V2_SCOPE_BRIEF_REFRESH_FAILED");
assert.equal(failedResult.body.safeguards.rawCommandStderrIncluded, false);
assertSensitiveTextAbsent(failedResult);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("../server/services/v1V2BoundaryService.mjs", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../server/routes/systemWriteRoutes.mjs", import.meta.url), "utf8");
assert.doesNotMatch(apiSource, /function precheckSystemV1V2Boundary|async function refreshSystemV1V2ScopeBrief/);
assert.match(routeSource, /precheckV1V2Boundary:[\s\S]*v1V2BoundaryService\.precheck\(\{ operatorId \}\)/);
assert.match(routeSource, /refreshV1V2ScopeBrief:[\s\S]*v1V2BoundaryService\.refreshScopeBrief\(\{ operatorId \}\)/);
assert.doesNotMatch(routeSource, /readV1GoLiveStatusArtifacts|summarizeV1FieldEvidence|runV1V2ScopeBriefRefreshCommand/);
for (const oldHelper of [
  "buildV1V2BoundaryPrecheckBlockers",
  "buildV1V2BoundaryPrecheckBlocker",
  "buildV1V2BoundaryPrecheckSafeguards",
  "buildV1V2ScopeBriefRefreshSuccessBody",
  "buildV1V2ScopeBriefRefreshErrorBody",
  "buildV1V2ScopeBriefRefreshSafeguards",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`function ${oldHelper}\\(`));
}
assert.doesNotMatch(serviceSource, /request\.body|body\.path|body\.token|process\.env/);

console.log(
  "V1/V2 boundary service checks passed: missing/open/confirmed/ready gates, refresh isolation, redaction, and thin API composition are covered.",
);

function createHarness({ artifacts, commandError = null }) {
  const calls = { commandInput: null };
  const service = createV1V2BoundaryService({
    now: () => new Date(checkedAt),
    readStatusArtifacts: () => artifacts,
    getArtifactRoot: () => "/private/erp/artifacts",
    async runScopeBriefRefreshCommand(input) {
      calls.commandInput = input;
      if (commandError) throw commandError;
      return { scope: "v1_v2_scope_brief" };
    },
  });
  return { service, calls };
}

function buildArtifacts({ scope, boundaryReady }) {
  return {
    completionSnapshot: { value: {} },
    v1V2Scope: { value: scope },
    fieldEvidenceSignoffBoundaryCsv: {
      value: boundaryReady
        ? "recordType,required,onsiteStatus,onsiteConfirmedBy,onsiteConfirmedAt\nboundary,true,confirmed,manager,2026-07-13T21:00:00.000Z\n"
        : "recordType,required,onsiteStatus,onsiteConfirmedBy,onsiteConfirmedAt\nboundary,true,pending,,\n",
    },
  };
}

function buildScope({ ready = true, canDeclareV1Complete = true, v1MustContinue = [] } = {}) {
  return {
    ready,
    canDeclareV1Complete,
    conclusion: `范围结论 ${sensitiveText}`,
    v1MustContinue,
    v2Categories: ["企业微信自动化"],
    v2Differences: [`V2 延后 ${sensitiveText}`],
    moduleDifferences: [{ module: "高级BI", v1: "基础报表", v2: `深度分析 ${sensitiveText}` }],
    ownerReview: {
      question: "是否确认边界？",
      recommendation: "保持D49-D53为V1硬门禁。",
      approvalRule: "必须完成现场证据和签字。",
    },
  };
}

function blockerKeys(result) {
  return result.body.blockers.map((item) => item.key).sort();
}

function assertSensitiveTextAbsent(value) {
  const serialized = JSON.stringify(value);
  for (const fragment of ["postgres://", "owner:secret", "db.internal", "erp.internal", "/Users/private"]) {
    assert.equal(serialized.includes(fragment), false, `response must redact ${fragment}`);
  }
}
