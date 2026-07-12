import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeV1GoLiveStatus,
  sanitizeV1GoLiveSummary,
  sanitizeV1ModuleCompletion,
  sanitizeV1ModuleDifferences,
  sanitizeV1OwnerDecisionBrief,
  sanitizeV1ReleaseCandidate,
  sanitizeV1StatusTextList,
  sanitizeV1TopBlockers,
} from "../server/services/v1ReleaseStatusProjectionService.mjs";

const secrets = {
  databaseUrl: "postgresql://erp:secret@db.internal:5432/erp",
  endpoint: "https://minio.internal:9000",
  bucket: "erp-secret-bucket",
  bearer: "Bearer top-secret-token",
  envAssignment: "ERP_AUTH_SECRET=top-secret-auth",
  userPath: "/Users/xu/private/release.json",
  varPath: "/var/private/release.json",
  artifactPath: ".erp-local-storage/private/release.json",
};
const unsafeText = [
  `database-url=${secrets.databaseUrl}`,
  `endpoint=${secrets.endpoint}`,
  `bucket=${secrets.bucket}`,
  secrets.bearer,
  secrets.envAssignment,
  secrets.userPath,
  secrets.varPath,
  secrets.artifactPath,
].join(" ");

const apiServerSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
assert.match(apiServerSource, /from "\.\/services\/v1ReleaseStatusProjectionService\.mjs"/);
assert.doesNotMatch(apiServerSource, /function sanitizeV1GoLiveSummary/);
assert.doesNotMatch(apiServerSource, /function sanitizeV1OwnerDecisionBrief/);
assert.doesNotMatch(apiServerSource, /function sanitizeV1TopBlockers/);
assert.doesNotMatch(apiServerSource, /function sanitizeV1ModuleDifferences/);
assert.match(
  apiServerSource,
  /sanitizeV1SensitiveStatusText\(completion\.conclusion \|\| suite\.conclusion \|\| v1V2Scope\.conclusion\)/,
);
assert.match(apiServerSource, /label: sanitizeV1SensitiveStatusText\(artifact\.label\)/);
assert.match(apiServerSource, /reason: sanitizeV1SensitiveStatusText\(artifact\.reason\)/);

assert.equal(normalizeV1GoLiveStatus("ready"), "ready");
assert.equal(normalizeV1GoLiveStatus("unexpected"), "blocked");

const summary = sanitizeV1GoLiveSummary({
  label: unsafeText,
  requirements: "85-90%",
  p0Prototype: "97-98%",
  v1Readiness: "80-83%",
  releaseGate: "0/4 发布门禁通过",
  runtimeReadiness: unsafeText,
  fieldEvidence: "0/34",
  fieldAcceptance: unsafeText,
  onsiteTaskCount: 53,
  v2DifferenceCount: 17,
});
assert.equal(summary.releaseGate, "0/4 发布门禁通过");
assert.equal(summary.onsiteTaskCount, 53);
assert.equal(summary.v2DifferenceCount, 17);

const releaseCandidate = sanitizeV1ReleaseCandidate({
  status: "blocked",
  ready: false,
  summary: {
    label: unsafeText,
    passedGateCount: 0,
    totalGateCount: 4,
    blockingCount: 4,
    envPreflight: unsafeText,
    fieldEvidence: "0/34",
    runtimeReadiness: "5/11",
    fieldAcceptance: unsafeText,
  },
  gates: [{
    key: "env",
    label: unsafeText,
    status: "blocked",
    ready: false,
    summary: unsafeText,
    detail: unsafeText,
  }],
});
assert.equal(releaseCandidate.status, "blocked");
assert.equal(releaseCandidate.summary.totalGateCount, 4);
assert.equal(releaseCandidate.gates.length, 1);

const modules = sanitizeV1ModuleCompletion([{
  module: "订单与库存",
  requirementCompletion: "95%",
  p0CodeCompletion: "98%",
  v1Readiness: "88%",
  currentStatus: unsafeText,
  remaining: unsafeText,
}]);
assert.equal(modules.length, 1);
assert.equal(modules[0].module, "订单与库存");
assert.equal(modules[0].p0CodeCompletion, "98%");

const ownerDecision = sanitizeV1OwnerDecisionBrief({
  status: "blocked_owner_brief_written",
  ready: false,
  canDeclareV1Complete: false,
  conclusion: unsafeText,
  decision: {
    label: unsafeText,
    recommendation: unsafeText,
    ownerQuestion: unsafeText,
  },
  completion: {
    requirements: "85-90%",
    p0Prototype: "97-98%",
    v1Readiness: "80-83%",
    releaseGate: "0/4 发布门禁通过",
    runtimeReadiness: "5/11 通过",
    fieldEvidence: "证据 0/34，签字 0/6",
    fieldAcceptance: "5/11 通过",
    onsiteTaskCount: 53,
  },
  doneHighlights: [unsafeText],
  unfinishedItems: [{ type: "release", label: unsafeText, detail: unsafeText }],
  releaseGates: [{ label: unsafeText, status: "blocked", summary: unsafeText, detail: unsafeText }],
  blockerGroups: [{ gate: unsafeText, count: 4 }],
  nextActions: [unsafeText],
  topBlockers: [{ gate: unsafeText, label: unsafeText, status: "blocked", detail: unsafeText }],
});
assert.equal(ownerDecision.ready, false);
assert.equal(ownerDecision.canDeclareV1Complete, false);
assert.equal(ownerDecision.completion.releaseGate, "0/4 发布门禁通过");
assert.equal(ownerDecision.completion.onsiteTaskCount, 53);
assert.equal(ownerDecision.summary.unfinishedItemCount, 1);
assert.equal(ownerDecision.summary.releaseGateCount, 1);
assert.equal(ownerDecision.summary.topBlockerCount, 1);

const topBlockers = sanitizeV1TopBlockers([{
  gate: unsafeText,
  key: "production-env",
  label: unsafeText,
  status: "blocked",
  detail: unsafeText,
}]);
assert.equal(topBlockers.length, 1);
assert.equal(topBlockers[0].key, "production-env");

const moduleDifferences = sanitizeV1ModuleDifferences([{
  module: "生产环境",
  v1: unsafeText,
  v2: unsafeText,
}]);
assert.equal(moduleDifferences.length, 1);
assert.equal(moduleDifferences[0].module, "生产环境");

const safeVariableGuidance = "ERP_V1_DATABASE_URL or DATABASE_URL or PGURL";
assert.deepEqual(sanitizeV1StatusTextList([safeVariableGuidance]), [safeVariableGuidance]);

const serialized = JSON.stringify({
  summary,
  releaseCandidate,
  modules,
  ownerDecision,
  topBlockers,
  moduleDifferences,
});
for (const secret of Object.values(secrets)) {
  assert.equal(serialized.includes(secret), false, `${secret} must not enter release status projections`);
}

console.log(
  "V1 release-status projection service checks passed: summary, owner decision, module status, and blockers are isolated and redacted.",
);
