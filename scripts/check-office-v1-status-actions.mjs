import assert from "node:assert/strict";
import fs from "node:fs";
import { createOfficeV1StatusActions } from "../src/app/createOfficeV1StatusActions.js";

function createHarness({ api = {}, readFileAsDataUrl = async () => "data:image/png;base64,AA==" } = {}) {
  const actionStates = new Map();
  const actionUpdates = new Map();
  const calls = [];
  const refreshes = [];
  let toast = "";
  const actionSetters = new Proxy({}, {
    get(_target, key) {
      if (!actionUpdates.has(key)) actionUpdates.set(key, []);
      return (value) => {
        const current = actionStates.get(key) ?? { loading: false, error: "stale", result: null };
        const next = typeof value === "function" ? value(current) : value;
        actionStates.set(key, next);
        actionUpdates.get(key).push(next);
      };
    },
  });
  const authState = { session: { accessToken: "session-token" } };
  const actions = createOfficeV1StatusActions({
    actionSetters,
    api,
    authState,
    currentUserId: "U-TECH-1",
    now: () => "2026-07-12T08:00:00.000Z",
    readFileAsDataUrl,
    refreshV1GoLiveStatus: async (options) => refreshes.push(options),
    setToast: (value) => { toast = value; },
  });
  return {
    actions,
    actionStates,
    actionUpdates,
    authState,
    calls,
    refreshes,
    get toast() { return toast; },
  };
}

{
  let receivedInput;
  const harness = createHarness({
    api: {
      precheckOfficeV1ProductionEnv: async (input) => {
        receivedInput = input;
        return {
          precheckResult: {
            statusLabel: "仍未通过",
            summary: { readinessLabel: "4/10", blockerLabel: "6 项" },
          },
          error: null,
        };
      },
    },
  });
  const result = await harness.actions.precheckV1ProductionEnv();
  assert.equal(result.precheckResult.summary.readinessLabel, "4/10");
  assert.deepEqual(receivedInput, { authState: harness.authState, operatorId: "U-TECH-1" });
  assert.equal(harness.actionUpdates.get("productionEnvPrecheck")[0].loading, true);
  assert.deepEqual(harness.actionStates.get("productionEnvPrecheck"), {
    loading: false,
    error: "",
    result: result.precheckResult,
    lastSyncedAt: "2026-07-12T08:00:00.000Z",
  });
  assert.equal(harness.toast, "当前生产 env 预检：仍未通过；通过 4/10，阻塞 6 项。");
  assert.deepEqual(harness.refreshes, [{ showToast: false }]);
}

{
  const row = { type: "evidence", groupKey: "print_hardware", key: "sample" };
  let receivedInput;
  const harness = createHarness({
    api: {
      stageOfficeV1FieldEvidenceIntakeRow: async (input) => {
        receivedInput = input;
        return {
          blocked: true,
          error: { requiredPermission: "system.v1_field_evidence_manage", message: "权限不足" },
          stageResult: { statusLabel: "已阻断", summary: { rowLabel: "打印样张" } },
        };
      },
    },
  });
  await harness.actions.stageV1FieldEvidenceIntakeRow(row);
  assert.equal(receivedInput.row, row);
  assert.match(harness.toast, /打印样张 已阻断/);
  assert.match(harness.toast, /缺少权限 system\.v1_field_evidence_manage/);
}

{
  const harness = createHarness({
    api: {
      precheckOfficeV1RuntimeReadiness: async () => ({
        precheckResult: null,
        error: { message: "运行态不可用" },
      }),
    },
  });
  await harness.actions.precheckV1RuntimeReadiness();
  assert.equal(harness.actionStates.get("runtimeReadinessPrecheck").result, null);
  assert.equal(harness.actionStates.get("runtimeReadinessPrecheck").error, "运行态不可用");
  assert.equal(harness.toast, "当前运行时总门禁预检失败：运行态不可用。");
  assert.equal(harness.refreshes.length, 1);
}

const statusActionCases = [
  ["generateV1FieldEvidenceDraftManifest", "generateOfficeV1FieldEvidenceDraftManifest", "draftResult", "fieldEvidenceDraft"],
  ["validateV1FieldEvidenceDraftManifest", "validateOfficeV1FieldEvidenceDraftManifest", "validationResult", "fieldEvidenceValidation"],
  ["precheckV1ProductionEnv", "precheckOfficeV1ProductionEnv", "precheckResult", "productionEnvPrecheck"],
  ["runV1ProductionEnvSetup", "runOfficeV1ProductionEnvSetup", "setupResult", "productionEnvSetup"],
  ["precheckV1ProductionEnvIntake", "precheckOfficeV1ProductionEnvIntake", "precheckResult", "productionEnvIntakePrecheck"],
  ["precheckV1ProductionEnvFileAudit", "precheckOfficeV1ProductionEnvFileAudit", "precheckResult", "productionEnvFileAuditPrecheck"],
  ["precheckV1RuntimeReadiness", "precheckOfficeV1RuntimeReadiness", "precheckResult", "runtimeReadinessPrecheck"],
  ["precheckV1ProductionEnvFilePreview", "precheckOfficeV1ProductionEnvFilePreview", "precheckResult", "productionEnvFilePreviewPrecheck"],
  ["precheckV1ProductionGoLive", "precheckOfficeV1ProductionGoLive", "precheckResult", "productionGoLivePrecheck"],
  ["precheckV1ProductionFirstStageValuesDryRun", "precheckOfficeV1ProductionFirstStageValuesDryRun", "precheckResult", "productionFirstStageValuesDryRun"],
  ["runV1ProductionFirstStageExecution", "runOfficeV1ProductionFirstStageExecution", "executionResult", "productionFirstStageExecution"],
  ["runV1ProductionPersistenceEvidence", "runOfficeV1ProductionPersistenceEvidence", "evidenceResult", "productionPersistenceEvidence"],
  ["applyV1ProductionFirstStageValues", "applyOfficeV1ProductionFirstStageValues", "applyResult", "productionFirstStageValuesApply"],
  ["precheckV1Persistence", "precheckOfficeV1Persistence", "precheckResult", "persistencePrecheck"],
  ["precheckV1AttachmentRetention", "precheckOfficeV1AttachmentRetention", "precheckResult", "attachmentRetentionPrecheck"],
  ["precheckV1PrintSpool", "getOfficePrintDriverSpoolDiagnostics", "diagnostics", "printSpoolPrecheck"],
  ["precheckV1PrintCups", "getOfficePrintDriverCupsDiagnostics", "diagnostics", "printCupsPrecheck"],
  ["precheckV1PrintReadiness", "getOfficePrintDriverV1Readiness", "readiness", "printReadinessPrecheck"],
  ["precheckV1DriverReadiness", "precheckOfficeV1DriverReadiness", "precheckResult", "driverReadinessPrecheck"],
  ["precheckV1V2Boundary", "precheckOfficeV1V2Boundary", "precheckResult", "v1V2BoundaryPrecheck"],
  ["refreshV1V2ScopeBrief", "refreshOfficeV1V2ScopeBrief", "refreshResult", "v1V2ScopeBriefRefresh"],
  ["precheckV1ReleaseCandidateRefresh", "precheckOfficeV1ReleaseCandidateRefresh", "precheckResult", "releaseCandidateRefreshPrecheck"],
  ["refreshV1ReleaseCandidate", "refreshOfficeV1ReleaseCandidate", "refreshResult", "releaseCandidateRefresh"],
];

for (const [actionName, apiName, resultKey, stateKey] of statusActionCases) {
  let callCount = 0;
  const expectedResult = { statusLabel: `${actionName}-done`, summary: {} };
  const harness = createHarness({
    api: {
      [apiName]: async () => {
        callCount += 1;
        return { [resultKey]: expectedResult, error: null };
      },
    },
  });
  await harness.actions[actionName]();
  assert.equal(callCount, 1, `${actionName} must call ${apiName}`);
  assert.equal(harness.actionStates.get(stateKey).result, expectedResult, `${actionName} must update ${stateKey}`);
  assert.deepEqual(harness.refreshes, [{ showToast: false }], `${actionName} must refresh V1 truth`);
}

{
  let uploadInput;
  const harness = createHarness({
    api: {
      createOfficeAttachment: async (input) => {
        uploadInput = input;
        return {
          source: "api",
          attachment: {
            attachmentId: "ATT-EVIDENCE-1",
            fileName: "sample.png",
            ownerId: "print_hardware:sample",
            status: "available",
          },
        };
      },
    },
  });
  const result = await harness.actions.uploadV1FieldEvidenceAttachment({
    evidenceItem: { groupKey: "print_hardware", key: "sample", label: "打印样张" },
    file: { name: "sample.png", type: "image/png", size: 10 },
    remark: "现场打印",
  });
  assert.equal(result.blocked, false);
  assert.equal(uploadInput.ownerType, "v1_field_evidence");
  assert.equal(uploadInput.ownerId, "print_hardware:sample");
  assert.equal(uploadInput.contentDataUrl, "data:image/png;base64,AA==");
  assert.equal(uploadInput.uploadedBy, "U-TECH-1");
  assert.equal(harness.actionStates.get("fieldEvidenceAttachment").result.attachmentId, "ATT-EVIDENCE-1");
  assert.match(harness.toast, /现场证据附件已登记：ATT-EVIDENCE-1/);
  assert.equal(harness.refreshes.length, 0);
}

{
  const harness = createHarness({
    api: {
      createOfficeAttachment: async () => ({ source: "local", attachment: { attachmentId: "LOCAL-1" } }),
    },
  });
  const result = await harness.actions.uploadV1SignoffBoundaryAttachment({
    signoffItem: { type: "signoff", key: "management", label: "管理签字" },
    file: null,
  });
  assert.equal(result.blocked, true);
  assert.equal(result.error.code, "V1_SIGNOFF_BOUNDARY_ATTACHMENT_NOT_BACKEND_REGISTERED");
  assert.equal(harness.actionStates.get("signoffBoundaryAttachment").result, null);
  assert.match(harness.toast, /签字 \/ 边界附件登记失败/);
}

{
  const harness = createHarness({
    api: {
      listOfficeAttachments: async () => ({
        source: "api",
        total: 8,
        items: [
          { attachmentId: "LOCAL-1", fileName: "local.png" },
          ...Array.from({ length: 6 }, (_, index) => ({
            attachmentId: `ATT-${index + 1}`,
            fileName: `evidence-${index + 1}.png`,
            hasContent: index % 2 === 0,
          })),
        ],
      }),
    },
  });
  const result = await harness.actions.listV1FieldEvidenceAttachments({
    evidenceItem: { groupKey: "print_hardware", key: "sample" },
  });
  assert.equal(result.blocked, false);
  assert.equal(result.items.length, 6);
  const state = harness.actionStates.get("fieldEvidenceAttachmentList");
  assert.equal(state.result.total, 8);
  assert.equal(state.result.items.length, 5);
  assert.equal(state.result.items[0].attachmentId, "ATT-1");
  assert.equal(harness.toast, "现场证据附件已查询：6 个可复用后端附件。");
}

const appSource = [
  fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"),
  fs.readFileSync(new URL("../src/OfficeWorkbench.jsx", import.meta.url), "utf8"),
].join("\n");
const controllerSource = fs.readFileSync(new URL("../src/app/createOfficeV1StatusActions.js", import.meta.url), "utf8");
assert.match(appSource, /createOfficeV1StatusActions\(\{/);
assert.doesNotMatch(appSource, /from "\.\/services\/officeV1GoLiveStatusApiClient\.js"/);
assert.doesNotMatch(appSource, /async function generateV1FieldEvidenceDraftManifest/);
assert.doesNotMatch(appSource, /async function precheckV1ProductionEnv/);
assert.doesNotMatch(appSource, /async function uploadV1FieldEvidenceAttachment/);
assert.ok(appSource.split("\n").length < 5_100, "App.jsx should remain below the V8.32 extraction ceiling");
assert.match(controllerSource, /const registered = result\.source === "api" && \/\^ATT-/);
assert.match(controllerSource, /await refreshV1GoLiveStatus\(\{ showToast: false \}\)/);

console.log("Office V1 status action checks passed: action wiring, refresh sequencing, fail-closed attachments, and App ownership are centralized.");
