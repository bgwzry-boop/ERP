import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleSystemWriteRoutes } from "../server/routes/systemWriteRoutes.mjs";

const cases = [
  ["/api/system/v1-field-evidence-intake/draft-manifest", "applyV1FieldEvidenceIntake", "generateFieldEvidenceDraftManifest", "operator"],
  ["/api/system/v1-field-evidence-intake/validate-draft-manifest", "validateV1FieldEvidenceDraft", "validateFieldEvidenceDraftManifest", "operator"],
  ["/api/system/v1-field-evidence-intake/stage-row", "applyV1FieldEvidenceIntake", "stageFieldEvidenceRow", "body"],
  ["/api/system/v1-production-env/live-precheck", "precheckV1ProductionEnv", "precheckProductionEnv", "operator"],
  ["/api/system/v1-production-env-setup/live-run", "runV1ProductionEnvSetup", "runProductionEnvSetup", "operator"],
  ["/api/system/v1-production-env-intake/live-precheck", "precheckV1ProductionEnvIntake", "precheckProductionEnvIntake", "operator"],
  ["/api/system/v1-production-env-file-audit/live-precheck", "precheckV1ProductionEnvFileAudit", "precheckProductionEnvFileAudit", "operator"],
  ["/api/system/v1-production-env-file-preview/live-precheck", "precheckV1ProductionEnvFilePreview", "precheckProductionEnvFilePreview", "operator"],
  ["/api/system/v1-production-go-live/live-precheck", "precheckV1ProductionGoLive", "precheckProductionGoLive", "request"],
  ["/api/system/v1-production-persistence-evidence/live-run", "runV1ProductionPersistenceEvidence", "runProductionPersistenceEvidence", "operator"],
  ["/api/system/v1-production-first-stage-execution/live-run", "runV1ProductionFirstStageExecution", "runProductionFirstStageExecution", "request"],
  ["/api/system/v1-production-first-stage-values-dry-run/live-precheck", "precheckV1ProductionFirstStageValuesDryRun", "precheckProductionFirstStageValuesDryRun", "operator"],
  ["/api/system/v1-production-first-stage-values-apply/live-run", "applyV1ProductionFirstStageValues", "runProductionFirstStageValuesApply", "operator"],
  ["/api/system/v1-persistence/live-precheck", "precheckV1Persistence", "precheckPersistence", "workspace"],
  ["/api/system/v1-attachment-retention/live-precheck", "precheckV1AttachmentRetention", "precheckAttachmentRetention", "workspace"],
  ["/api/system/v1-driver-readiness/live-precheck", "precheckV1DriverReadiness", "precheckDriverReadiness", "workspace"],
  ["/api/system/v1-runtime-readiness/live-precheck", "precheckV1RuntimeReadiness", "precheckRuntimeReadiness", "request"],
  ["/api/system/v1-v2-boundary/precheck", "precheckV1V2Boundary", "precheckV1V2Boundary", "operator"],
  ["/api/system/v1-v2-scope-brief/refresh", "refreshV1V2ScopeBrief", "refreshV1V2ScopeBrief", "operator"],
  ["/api/system/v1-release-candidate/refresh-precheck", "precheckV1ReleaseCandidateRefresh", "precheckV1ReleaseCandidateRefresh", "request"],
  ["/api/system/v1-release-candidate/refresh", "refreshV1ReleaseCandidate", "refreshV1ReleaseCandidate", "request"],
];

const calls = [];
const recordHandler = (name) => async (input) => {
  calls.push({ kind: "handler", name, input });
  return { httpStatus: 207, body: { name } };
};
const runV1ProductionEnvSetupCommand = async () => ({ status: "unused" });
const dependencies = {
  response: { id: "response" },
  request: { id: "request" },
  workspace: { id: "workspace" },
  body: { id: "body" },
  permissionContext: { id: "permission" },
  authContext: { id: "auth" },
  writeActionPermissions: Object.fromEntries(cases.map(([, key]) => [key, `permission.${key}`])),
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-RESOLVED";
  },
  sendJson(response, status, body) {
    calls.push({ kind: "json", response, status, body });
  },
  v1FieldEvidenceDraftService: {
    generateDraft: recordHandler("generateFieldEvidenceDraftManifest"),
    validateDraft: recordHandler("validateFieldEvidenceDraftManifest"),
  },
  v1FieldEvidenceStagingService: {
    stageRow: recordHandler("stageFieldEvidenceRow"),
  },
  precheckV1ProductionEnv: recordHandler("precheckProductionEnv"),
  runV1ProductionEnvSetup: recordHandler("runProductionEnvSetup"),
  v1LocalCommandRunnerService: { runV1ProductionEnvSetupCommand },
  precheckV1ProductionEnvIntake: recordHandler("precheckProductionEnvIntake"),
  precheckV1ProductionEnvFileAudit: recordHandler("precheckProductionEnvFileAudit"),
  precheckV1ProductionEnvFilePreview: recordHandler("precheckProductionEnvFilePreview"),
  v1ProductionGoLivePrecheckService: {
    precheck: recordHandler("precheckProductionGoLive"),
  },
  v1ProductionPersistenceEvidenceLiveRunService: {
    run: recordHandler("runProductionPersistenceEvidence"),
  },
  v1ProductionFirstStageExecutionLiveRunService: {
    run: recordHandler("runProductionFirstStageExecution"),
  },
  v1ProductionFirstStageValuesDryRunLivePrecheckService: {
    precheck: recordHandler("precheckProductionFirstStageValuesDryRun"),
  },
  v1ProductionEnvValuesApplyService: {
    run: recordHandler("runProductionFirstStageValuesApply"),
  },
  precheckV1Persistence: recordHandler("precheckPersistence"),
  precheckV1AttachmentRetention: recordHandler("precheckAttachmentRetention"),
  precheckV1DriverReadiness: recordHandler("precheckDriverReadiness"),
  precheckV1RuntimeReadiness: recordHandler("precheckRuntimeReadiness"),
  v1V2BoundaryService: {
    precheck: recordHandler("precheckV1V2Boundary"),
    refreshScopeBrief: recordHandler("refreshV1V2ScopeBrief"),
  },
  v1ReleaseCandidateRefreshPrecheckService: {
    precheck: recordHandler("precheckV1ReleaseCandidateRefresh"),
  },
  v1ReleaseCandidateRefreshService: {
    refresh: recordHandler("refreshV1ReleaseCandidate"),
  },
};

for (const [pathname, permissionKey, handlerName, inputKind] of cases) {
  calls.length = 0;
  assert.equal(await handleSystemWriteRoutes({ ...dependencies, method: "POST", url: new URL(`http://erp.test${pathname}`) }), true);
  const handlerInput = {
    operatorId: "U-RESOLVED",
    ...(inputKind === "body" ? { body: dependencies.body } : {}),
    ...(inputKind === "request" ? { request: dependencies.request } : {}),
    ...(inputKind === "workspace" ? { workspace: dependencies.workspace } : {}),
    ...(handlerName === "runProductionEnvSetup" ? { runCommand: runV1ProductionEnvSetupCommand } : {}),
  };
  assert.deepEqual(calls, [
    { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission: `permission.${permissionKey}` },
    { kind: "operator", permissionContext: dependencies.permissionContext, authContext: dependencies.authContext, fallback: "SYSTEM" },
    {
      kind: "handler",
      name: handlerName,
      input: handlerInput,
    },
    { kind: "json", response: dependencies.response, status: 207, body: { name: handlerName } },
  ]);
}

calls.length = 0;
assert.equal(await handleSystemWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/system/v1-persistence/live-precheck"), requireActionPermission: () => false }), true);
assert.deepEqual(calls, []);
assert.equal(await handleSystemWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/system/v1-persistence/live-precheck") }), false);
assert.equal(await handleSystemWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/system/unknown") }), false);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../server/routes/systemWriteRoutes.mjs", import.meta.url), "utf8");
for (const oldWrapper of [
  "generateSystemV1FieldEvidenceIntakeDraftManifest",
  "precheckSystemV1ProductionEnv",
  "runSystemV1ProductionEnvSetup",
  "precheckSystemV1ProductionGoLive",
  "runSystemV1ProductionFirstStageValuesApply",
  "precheckSystemV1V2Boundary",
  "refreshSystemV1ReleaseCandidate",
]) {
  assert.equal(apiSource.includes(oldWrapper), false, `${oldWrapper} should not remain in the API composition root`);
}
assert.match(routeSource, /v1FieldEvidenceDraftService\.generateDraft/);
assert.match(routeSource, /v1ProductionGoLivePrecheckService\.precheck/);
assert.match(routeSource, /v1ProductionEnvValuesApplyService\.run/);
assert.match(routeSource, /v1ReleaseCandidateRefreshService\.refresh/);

console.log("system write routes checks passed: 21 V1 actions, permissions, exact inputs, responses, and direct route ownership are covered");
