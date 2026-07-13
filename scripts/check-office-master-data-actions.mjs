import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeMasterDataActions } from "../src/app/createOfficeMasterDataActions.js";

const readyDraft = {
  draftId: "MDI-CONTROLLER-001",
  status: "ready_for_import_confirmation",
  canEnterReviewQueue: true,
  summary: { errorCount: 0, dataRowCount: 1 },
};
const readyPlan = {
  planId: "MDP-CONTROLLER-001",
  draftId: readyDraft.draftId,
  status: "ready_for_import_confirmation",
  statusLabel: "待最终确认",
};

function createHarness({ allowLocalFallback = false, api = {}, confirmResult = true } = {}) {
  let confirmationPlans = [];
  let executions = [];
  let reviewDrafts = [];
  let employeeReviews = [];
  let issuedCredential = null;
  let maintenanceDrafts = [];
  let employeeRefreshCount = 0;
  let v1StatusRefreshCount = 0;
  const toasts = [];
  const controller = createOfficeMasterDataActions({
    allowLocalFallback,
    api,
    authState: { authenticated: true },
    confirmAction: () => confirmResult,
    currentUser: { displayName: "管理A" },
    currentUserId: "U-MANAGER-A",
    downloadMasterDataImportTemplateWorkbook: () => ({ templateLabel: "客户", fileName: "customers.xlsx" }),
    downloadTextFile: () => true,
    getActionState: () => ({ disabled: false, title: "" }),
    lastIssuedEmployeeCredential: issuedCredential,
    masterDataMaintenanceTab: "价格表",
    masterDataPrecheckState: { status: "idle" },
    now: () => new Date("2026-07-12T09:00:00.000Z"),
    refreshMasterDataEmployeeAccountReviews: async () => {
      employeeRefreshCount += 1;
    },
    refreshMasterDataImportReviewDrafts: async () => {},
    refreshV1GoLiveStatus: async () => {
      v1StatusRefreshCount += 1;
    },
    setLastIssuedEmployeeCredential: (value) => {
      issuedCredential = typeof value === "function" ? value(issuedCredential) : value;
    },
    setMasterDataEmployeeAccountReviews: (updater) => {
      employeeReviews = typeof updater === "function" ? updater(employeeReviews) : updater;
    },
    setMasterDataImportConfirmationPlans: (updater) => {
      confirmationPlans = typeof updater === "function" ? updater(confirmationPlans) : updater;
    },
    setMasterDataImportExecutions: (updater) => {
      executions = typeof updater === "function" ? updater(executions) : updater;
    },
    setMasterDataImportReviewDrafts: (updater) => {
      reviewDrafts = typeof updater === "function" ? updater(reviewDrafts) : updater;
    },
    setMasterDataMaintenanceDrafts: (updater) => {
      maintenanceDrafts = typeof updater === "function" ? updater(maintenanceDrafts) : updater;
    },
    setMasterDataPrecheckState: () => {},
    setToast: (message) => toasts.push(message),
    showMasterDataTemplatePanel: () => {},
  });
  return {
    controller,
    getConfirmationPlans: () => confirmationPlans,
    getEmployeeRefreshCount: () => employeeRefreshCount,
    getEmployeeReviews: () => employeeReviews,
    getV1StatusRefreshCount: () => v1StatusRefreshCount,
    getExecutions: () => executions,
    getIssuedCredential: () => issuedCredential,
    getMaintenanceDrafts: () => maintenanceDrafts,
    getReviewDrafts: () => reviewDrafts,
    toasts,
  };
}

{
  const harness = createHarness();
  const draft = harness.controller.saveMasterDataMaintenanceDraft({
    recordId: "PRICE-1",
    recordLabel: "客户A价格",
    field: "unitPrice",
    fieldLabel: "单价",
    nextValue: "0.45",
  });
  assert.equal(draft.tab, "价格表");
  assert.equal(draft.createdBy, "管理A");
  assert.equal(harness.getMaintenanceDrafts()[0].draftId, draft.draftId);
  assert.match(harness.toasts.at(-1), /正式写入仍需走导入确认/);
}

{
  const optionsSeen = [];
  const harness = createHarness({
    api: {
      createOfficeMasterDataImportConfirmationPlan: async (_input, options) => {
        optionsSeen.push(options);
        return { source: "local_fallback", confirmationPlan: readyPlan };
      },
    },
  });
  await harness.controller.createMasterDataImportConfirmationPlanFromDraft(readyDraft);
  assert.equal(optionsSeen[0]?.serverRequired, true);
  assert.equal(harness.getConfirmationPlans().length, 0, "formal fallback must not save a local confirmation plan");
  assert.match(harness.toasts.at(-1), /生成导入确认计划失败/);
}

{
  const harness = createHarness({
    api: {
      createOfficeMasterDataImportExecution: async () => ({
        source: "local_fallback",
        importExecution: { executionId: "MDE-LOCAL", statusLabel: "本地阻断" },
      }),
    },
  });
  await harness.controller.createMasterDataImportExecutionFromPlan(readyPlan);
  assert.equal(harness.getExecutions().length, 0, "formal fallback must not save a local execution projection");
  assert.match(harness.toasts.at(-1), /生成导入执行记录失败/);
}

{
  let requestInput = null;
  const harness = createHarness({
    api: {
      createOfficeMasterDataImportExecution: async (input) => {
        requestInput = input;
        return {
          source: "api",
          importExecution: {
            executionId: "MDE-COMMITTED",
            status: "committed",
            statusLabel: "已正式导入",
            officialWriteAttempted: true,
            officialWriteScope: "master_data_import_v1",
            summary: { transactionRecordCount: 5 },
          },
        };
      },
    },
  });
  await harness.controller.commitMasterDataImportExecutionFromPlan(readyPlan);
  assert.equal(Object.hasOwn(requestInput, "officialWriterKind"), false, "the browser must not choose an infrastructure writer");
  assert.equal(harness.getExecutions()[0]?.status, "committed");
  assert.equal(harness.getEmployeeRefreshCount(), 1);
  assert.equal(harness.getV1StatusRefreshCount(), 1);
  assert.match(harness.toasts.at(-1), /已正式导入/);
}

{
  const harness = createHarness({
    api: {
      createOfficeMasterDataImportExecution: async () => ({
        source: "api",
        importExecution: {
          executionId: "MDE-BLOCKED",
          status: "blocked_official_writer_not_configured",
          statusLabel: "未接正式写入",
          officialWriteAttempted: false,
          officialWriteScope: "master_data_import_v1",
        },
      }),
    },
  });
  await harness.controller.commitMasterDataImportExecutionFromPlan(readyPlan);
  assert.equal(harness.getExecutions()[0]?.status, "blocked_official_writer_not_configured");
  assert.equal(harness.getEmployeeRefreshCount(), 0);
  assert.equal(harness.getV1StatusRefreshCount(), 0);
  assert.match(harness.toasts.at(-1), /正式导入未完成/);
}

{
  const harness = createHarness({
    allowLocalFallback: true,
    api: {
      createOfficeMasterDataImportExecution: async () => ({
        source: "local_fallback",
        importExecution: {
          executionId: "MDE-DEMO-BLOCKED",
          status: "blocked_official_writer_not_configured",
          statusLabel: "API 不可用，本地阻断记录",
          officialWriteAttempted: false,
          officialWriteScope: "none",
        },
      }),
    },
  });
  await harness.controller.commitMasterDataImportExecutionFromPlan(readyPlan);
  assert.equal(harness.getExecutions()[0]?.executionId, "MDE-DEMO-BLOCKED", "demo may retain a failure record");
  assert.equal(harness.getEmployeeRefreshCount(), 0);
  assert.match(harness.toasts.at(-1), /正式主数据只能由后端事务提交/);
}

{
  const review = { employeeId: "EMP-001", name: "王师傅", recommendedRoleKey: "workshop" };
  const harness = createHarness({
    api: {
      enableOfficeMasterDataEmployeeAccount: async () => ({
        source: "local_fallback",
        employeeAccountReview: { ...review, accountEnabled: true },
      }),
    },
  });
  await harness.controller.enableMasterDataEmployeeAccount(review);
  assert.equal(harness.getEmployeeReviews().length, 0, "formal fallback must not enable an employee account locally");
  assert.equal(harness.getV1StatusRefreshCount(), 0);
  assert.match(harness.toasts.at(-1), /启用员工账号失败/);
}

{
  const review = { employeeId: "EMP-001A", name: "王师傅", recommendedRoleKey: "workshop" };
  const harness = createHarness({
    api: {
      enableOfficeMasterDataEmployeeAccount: async () => ({
        source: "api",
        employeeAccountReview: { ...review, accountEnabled: true, userId: "U-EMP-001A" },
      }),
    },
  });
  await harness.controller.enableMasterDataEmployeeAccount(review);
  assert.equal(harness.getEmployeeReviews()[0]?.accountEnabled, true);
  assert.equal(harness.getEmployeeRefreshCount(), 1);
  assert.equal(harness.getV1StatusRefreshCount(), 1);
}

{
  const review = { employeeId: "EMP-002", name: "李师傅", accountEnabled: true, recommendedRoleKey: "workshop" };
  const harness = createHarness({
    api: {
      issueOfficeMasterDataEmployeeAccountPassword: async () => ({
        source: "api",
        employeeAccountReview: { ...review, userId: "U-EMP-002", loginName: "li" },
        issuedCredential: { userId: "U-EMP-002", loginName: "li", temporaryPassword: "one-time" },
        operationLogId: "LOG-PASSWORD-1",
      }),
    },
  });
  await harness.controller.issueMasterDataEmployeeAccountPassword(review);
  assert.equal(harness.getEmployeeReviews()[0]?.userId, "U-EMP-002");
  assert.equal(harness.getIssuedCredential()?.operationLogId, "LOG-PASSWORD-1");
  assert.equal(harness.getEmployeeRefreshCount(), 1);
  assert.equal(harness.getV1StatusRefreshCount(), 1);
}

{
  const review = { employeeId: "EMP-ASSIGN-001", name: "调配员工", recommendedRoleKey: "packing" };
  let requestInput = null;
  const harness = createHarness({
    api: {
      updateOfficeMasterDataEmployeeAssignment: async (input) => {
        requestInput = input;
        return {
          source: "api",
          employeeAccountReview: {
            ...review,
            defaultWorkshop: "2号车间",
            defaultMachineId: "",
            assignmentMode: "general_worker",
          },
          operationLogId: "LOG-ASSIGN-1",
        };
      },
    },
  });
  await harness.controller.updateMasterDataEmployeeAssignment(review, {
    assignmentMode: "general_worker",
    workshop: "2号车间",
    machineId: "BAG-04",
    reason: "临时支援2号车间",
  });
  assert.equal(requestInput.operatorId, "U-MANAGER-A");
  assert.equal(requestInput.assignmentMode, "general_worker");
  assert.equal(harness.getEmployeeReviews()[0]?.defaultWorkshop, "2号车间");
  assert.equal(harness.getEmployeeReviews()[0]?.defaultMachineId, "");
  assert.equal(harness.getEmployeeRefreshCount(), 1);
  assert.equal(harness.getV1StatusRefreshCount(), 1);
}

{
  let revokeCalls = 0;
  const harness = createHarness({
    confirmResult: false,
    api: {
      revokeOfficeMasterDataEmployeeAccountPassword: async () => {
        revokeCalls += 1;
        return { source: "api" };
      },
    },
  });
  await harness.controller.revokeMasterDataEmployeeAccountPassword({
    employeeId: "EMP-003",
    userId: "U-EMP-003",
    accountEnabled: true,
    loginEnabled: true,
  });
  assert.equal(revokeCalls, 0, "password revocation must require explicit confirmation");
  assert.equal(harness.getEmployeeRefreshCount(), 0);
  assert.equal(harness.getV1StatusRefreshCount(), 0);
}

{
  const review = {
    employeeId: "EMP-004",
    name: "赵师傅",
    userId: "U-EMP-004",
    accountEnabled: true,
    loginEnabled: true,
  };
  const harness = createHarness({
    api: {
      revokeOfficeMasterDataEmployeeAccountPassword: async () => ({
        source: "api",
        employeeAccountReview: { ...review, loginEnabled: false, passwordStatus: "password_revoked" },
      }),
    },
  });
  await harness.controller.revokeMasterDataEmployeeAccountPassword(review);
  assert.equal(harness.getEmployeeReviews()[0]?.passwordStatus, "password_revoked");
  assert.equal(harness.getEmployeeRefreshCount(), 1);
  assert.equal(harness.getV1StatusRefreshCount(), 1);
}

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../src/app/createOfficeMasterDataActions.js", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../server/services/masterDataImportCommandService.mjs", import.meta.url), "utf8");
assert.match(appSource, /createOfficeMasterDataActions\(\{/);
assert.match(appSource, /allowLocalFallback: !runtimeServerRequired/);
for (const functionName of [
  "commitMasterDataImportExecutionFromPlan",
  "createMasterDataImportConfirmationPlanFromDraft",
  "enableMasterDataEmployeeAccount",
  "issueMasterDataEmployeeAccountPassword",
]) {
  assert.doesNotMatch(appSource, new RegExp(`(?:async )?function ${functionName}\\(`));
}
assert.doesNotMatch(serverSource, /cleanText\(body\.officialWriterKind\)/);
assert.match(actionsSource, /Promise\.allSettled\(\[/, "successful employee writes should settle read-model refreshes independently");

console.log("Office master-data actions check passed: imports and employee accounts are isolated, formal writes fail closed, and the server owns writer selection.");
