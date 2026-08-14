import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildV1CompletionAudit,
  sanitizeV1FieldAcceptanceReport,
  sanitizeV1RuntimeReadinessBlockers,
} from "../server/services/v1CompletionAuditProjectionService.mjs";

const secrets = {
  databaseUrl: "postgresql://erp:secret@db.internal:5432/erp",
  endpoint: "https://minio.internal:9000",
  bucket: "erp-secret-bucket",
  bearer: "Bearer top-secret-token",
  envAssignment: "ERP_AUTH_SECRET=top-secret-auth",
  userPath: "/Users/xu/private/completion.json",
  varPath: "/var/private/completion.json",
  artifactPath: ".erp-local-storage/private/completion.json",
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
const registrySource = readFileSync(
  new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url),
  "utf8",
);
const statusResponseSource = readFileSync(
  new URL("../server/services/v1GoLiveStatusResponseService.mjs", import.meta.url),
  "utf8",
);
assert.match(statusResponseSource, /from "\.\/v1CompletionAuditProjectionService\.mjs"/);
assert.match(registrySource, /createV1GoLiveStatusResponseService/);
assert.doesNotMatch(apiServerSource, /function buildV1CompletionAudit/);
assert.doesNotMatch(apiServerSource, /function sanitizeV1RuntimeReadinessBlockers/);
assert.doesNotMatch(apiServerSource, /function sanitizeV1FieldAcceptanceReport/);
assert.doesNotMatch(apiServerSource, /function getV1RuntimeReadinessBlockerDefaults/);

const runtimeBlockers = sanitizeV1RuntimeReadinessBlockers({
  ready: false,
  summary: { runtimeReadiness: "5/11 通过" },
  blockingItems: [{
    gate: "运行时 V1 readiness",
    key: "system-v1-persistence",
    label: unsafeText,
    status: "pending",
    ready: false,
    detail: unsafeText,
    nextAction: unsafeText,
  }],
}, {
  ready: false,
  summary: { label: "5/11 通过", passedCount: 5, totalCount: 11, blockingCount: 6 },
}, {});
assert.equal(runtimeBlockers.status, "blocked");
assert.equal(runtimeBlockers.ready, false);
assert.equal(runtimeBlockers.summary.passedCount, 5);
assert.equal(runtimeBlockers.summary.totalCount, 11);
assert.equal(runtimeBlockers.summary.blockingCount, 6);
assert.equal(runtimeBlockers.blockers.length, 1);

const fieldAcceptance = sanitizeV1FieldAcceptanceReport({
  status: "blocked",
  ready: false,
  conclusion: unsafeText,
  summary: { label: unsafeText, passedCount: 1, totalCount: 2, blockingCount: 1 },
  modules: [
    { key: "persistence", label: "生产持久化", status: "passed", ready: true, detail: unsafeText, evidence: [unsafeText] },
    { key: "devices", label: unsafeText, status: "blocked", ready: false, detail: unsafeText, evidence: [unsafeText] },
  ],
  blockingCriteria: [{
    key: "driver-v1-readiness",
    label: unsafeText,
    status: "blocked",
    blocking: true,
    detail: unsafeText,
  }],
  requiredFieldEvidence: [{ key: "devices", label: unsafeText, required: [unsafeText] }],
  remainingV1Risks: [unsafeText],
  nextActions: [unsafeText],
});
assert.equal(fieldAcceptance.status, "blocked");
assert.equal(fieldAcceptance.ready, false);
assert.equal(fieldAcceptance.summary.passedCount, 1);
assert.equal(fieldAcceptance.summary.totalCount, 2);
assert.equal(fieldAcceptance.summary.blockingCount, 1);
assert.equal(fieldAcceptance.modules.length, 2);
assert.equal(fieldAcceptance.requiredFieldEvidence[0].requiredCount, 1);

const failClosedAudit = buildV1CompletionAudit({
  ready: true,
  summary: {
    releaseGate: unsafeText,
    runtimeReadiness: unsafeText,
    fieldEvidence: unsafeText,
    fieldAcceptance: unsafeText,
    onsiteTaskCount: 53,
    v2DifferenceCount: 17,
  },
  releaseCandidate: {
    ready: false,
    summary: { label: unsafeText },
    gates: [{ key: "env", label: unsafeText, status: "blocked", ready: false, detail: unsafeText }],
  },
  ownerDecisionBrief: { completion: { onsiteTaskCount: 53 } },
  runtimeReadinessBlockers: runtimeBlockers,
  fieldAcceptanceReport: fieldAcceptance,
  productionEnvGate: {
    ready: false,
    summary: { label: unsafeText },
    checks: [{ key: "env", label: unsafeText, status: "blocked", ready: false, detail: unsafeText }],
    nextAction: unsafeText,
  },
  fieldEvidenceProgress: {
    summary: {
      requiredEvidenceItemsTotal: 40,
      requiredEvidenceItemsCompleted: 0,
      requiredSignoffsTotal: 6,
      requiredSignoffsCompleted: 0,
      evidenceItemsLabel: "0/40",
      signoffLabel: "0/6",
    },
    groupSummaries: [{ key: "devices", label: unsafeText, ready: false, missingCount: 34, requiredTotal: 34 }],
    signoffs: [{ role: unsafeText, ready: false, status: "pending" }],
    boundary: { ready: false, nextAction: unsafeText },
  },
  roleTaskBoard: { summary: { taskCount: 53 } },
  v1V2BoundaryBrief: {
    ready: false,
    conclusion: unsafeText,
    nextAction: unsafeText,
    summary: {
      label: unsafeText,
      v1MustContinueCount: 6,
      v2CategoryCount: 7,
      v2DifferenceCount: 17,
      moduleDifferenceCount: 11,
    },
  },
});
assert.equal(failClosedAudit.status, "blocked");
assert.equal(failClosedAudit.ready, false);
assert.equal(failClosedAudit.canDeclareV1Complete, false);
assert.equal(failClosedAudit.summary.criteriaCount, 7);
assert.equal(failClosedAudit.summary.blockingCriteriaCount, 7);
assert.equal(failClosedAudit.summary.sourceReady, true);
assert.equal(failClosedAudit.summary.sourceReadyRejectedByCriteria, true);
assert.equal(failClosedAudit.safeguards.completionRequiresAllCriteria, true);

const readyAudit = buildV1CompletionAudit({
  ready: true,
  summary: { releaseGate: "4/4", runtimeReadiness: "11/11", fieldEvidence: "40/40", fieldAcceptance: "11/11" },
  releaseCandidate: { ready: true, summary: { label: "4/4 发布门禁通过" }, gates: [] },
  ownerDecisionBrief: { completion: { onsiteTaskCount: 0 } },
  runtimeReadinessBlockers: { ready: true, summary: { label: "11/11", readinessLabel: "11/11" }, blockers: [] },
  fieldAcceptanceReport: { ready: true, summary: { label: "11/11" }, blockingCriteria: [], nextActions: [] },
  productionEnvGate: { ready: true, summary: { label: "10/10", readinessLabel: "10/10" }, checks: [] },
  fieldEvidenceProgress: {
    summary: {
      requiredEvidenceItemsTotal: 40,
      requiredEvidenceItemsCompleted: 40,
      requiredSignoffsTotal: 6,
      requiredSignoffsCompleted: 6,
      evidenceItemsLabel: "40/40",
      signoffLabel: "6/6",
    },
    groupSummaries: [],
    signoffs: [],
    boundary: { ready: true },
  },
  roleTaskBoard: { summary: { taskCount: 0 } },
  v1V2BoundaryBrief: {
    ready: true,
    conclusion: "边界已确认",
    summary: { label: "边界已确认", v1MustContinueCount: 0, v2CategoryCount: 7, v2DifferenceCount: 17, moduleDifferenceCount: 11 },
  },
});
assert.equal(readyAudit.status, "ready");
assert.equal(readyAudit.ready, true);
assert.equal(readyAudit.canDeclareV1Complete, true);
assert.equal(readyAudit.summary.passedCriteriaCount, 7);
assert.equal(readyAudit.summary.blockingCriteriaCount, 0);
assert.equal(readyAudit.summary.sourceReadyRejectedByCriteria, false);

const serialized = JSON.stringify({ runtimeBlockers, fieldAcceptance, failClosedAudit, readyAudit });
for (const secret of Object.values(secrets)) {
  assert.equal(serialized.includes(secret), false, `${secret} must not enter completion audit projections`);
}

console.log(
  "V1 completion-audit projection service checks passed: runtime, field acceptance, seven-criterion truth, and redaction are isolated.",
);
