import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeMasterDataActions } from "../src/app/createOfficeMasterDataActions.js";
import { createOfficeMasterDataReadActions } from "../src/app/useOfficeMasterDataReads.js";

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

{
  let requestInput = null;
  let employeeReviews = [];
  let readiness = null;
  let assignmentOptions = null;
  const reads = createOfficeMasterDataReadActions({
    api: {
      listOfficeMasterDataEmployeeAccountReviews: async (input) => {
        requestInput = input;
        return {
          source: "api",
          items: Array.from({ length: 33 }, (_, index) => ({ employeeId: `EMP-${index + 1}` })),
          readiness: { coveredRoleCount: 7, requiredRoleCount: 8 },
          assignmentOptions: { workshops: [], machines: [] },
          machineRecords: [{ machineId: "BAG-01", status: "active" }],
          total: 33,
        };
      },
    },
    authState: { authenticated: true },
    currentUserId: "U-MANAGER-A",
    getActionState: () => ({ disabled: false, title: "" }),
    masterDataEmployeeAccountReviewsRef: { current: [] },
    masterDataImportReviewDraftsRef: { current: [] },
    permissionContext: {},
    serverRequired: () => true,
    setMasterDataEmployeeAccountReviews: (items) => {
      employeeReviews = items;
    },
    setMasterDataEmployeeAccountReadiness: (value) => {
      readiness = value;
    },
    setMasterDataEmployeeAssignmentOptions: (value) => {
      assignmentOptions = value;
    },
    setMasterDataImportReviewDrafts: () => {},
  });

  const result = await reads.refreshMasterDataEmployeeAccountReviews({ silent: true });
  assert.equal(requestInput.pageSize, 200, "employee review reads must not silently truncate at the API default page size");
  assert.equal(result.total, 33);
  assert.equal(employeeReviews.length, 33);
  assert.equal(readiness.coveredRoleCount, 7);
  assert.equal(assignmentOptions.allMachines[0].machineId, "BAG-01");
}

{
  let requestInput = null;
  const review = {
    employeeId: "ERP-0001",
    name: "负责人",
    accountActivationBlocked: true,
  };
  const harness = createHarness({
    api: {
      confirmOfficeMasterDataEmployeeIdentity: async (input) => {
        requestInput = input;
        return {
          source: "api",
          employeeAccountReview: {
            ...review,
            identityConfirmed: true,
            accountActivationBlocked: false,
          },
          operationLogId: "LOG-IDENTITY-CONFIRM-1",
        };
      },
    },
  });
  await harness.controller.confirmMasterDataEmployeeIdentity(review, {
    confirmedName: "负责人",
    reason: "负责人本人当面确认",
  });
  assert.equal(requestInput.confirmed, true);
  assert.equal(requestInput.confirmedEmployeeId, "ERP-0001");
  assert.equal(requestInput.confirmedName, "负责人");
  assert.equal(requestInput.reason, "负责人本人当面确认");
  assert.equal(harness.getEmployeeReviews()[0]?.accountActivationBlocked, false);
  assert.equal(harness.getEmployeeRefreshCount(), 1);
  assert.equal(harness.getV1StatusRefreshCount(), 1);
  assert.match(harness.toasts.at(-1), /已确认员工身份/);

  let cancelledCalls = 0;
  const cancelled = createHarness({
    confirmResult: false,
    api: {
      confirmOfficeMasterDataEmployeeIdentity: async () => {
        cancelledCalls += 1;
        return { source: "api" };
      },
    },
  });
  await cancelled.controller.confirmMasterDataEmployeeIdentity(review, {
    confirmedName: "负责人",
    reason: "负责人本人当面确认",
  });
  assert.equal(cancelledCalls, 0, "identity confirmation must require the final explicit confirmation dialog");
}

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
  let requestInput = null;
  const review = {
    employeeId: "EMP-001A",
    name: "负责人",
    recommendedRoleKey: "management",
    recommendedRoleKeys: ["management", "finance"],
    recommendedRoleLabels: ["管理", "财务 / 对账"],
  };
  const harness = createHarness({
    api: {
      enableOfficeMasterDataEmployeeAccount: async (input) => {
        requestInput = input;
        return {
          source: "api",
          employeeAccountReview: { ...review, accountEnabled: true, userId: "U-EMP-001A" },
        };
      },
    },
  });
  await harness.controller.enableMasterDataEmployeeAccount(review);
  assert.deepEqual(requestInput.roleKeys, ["management", "finance"]);
  assert.equal(harness.getEmployeeReviews()[0]?.accountEnabled, true);
  assert.equal(harness.getEmployeeRefreshCount(), 1);
  assert.equal(harness.getV1StatusRefreshCount(), 1);
}

{
  let enableCalls = 0;
  const review = {
    employeeId: "EMP-001B",
    name: "负责人",
    recommendedRoleKey: "management",
    recommendedRoleKeys: ["management", "finance"],
    recommendedRoleLabels: ["管理", "财务 / 对账"],
  };
  const harness = createHarness({
    confirmResult: false,
    api: {
      enableOfficeMasterDataEmployeeAccount: async () => {
        enableCalls += 1;
        return { source: "api", employeeAccountReview: { ...review, accountEnabled: true } };
      },
    },
  });
  await harness.controller.enableMasterDataEmployeeAccount(review);
  assert.equal(enableCalls, 0, "multi-role account enablement must require explicit confirmation");
}

{
  let batchCalls = 0;
  const reviews = [
    { employeeId: "EMP-BATCH-1", name: "批量员工1", accountEnabled: false },
    { employeeId: "EMP-BATCH-2", name: "批量员工2", accountEnabled: false },
  ];
  const cancelled = createHarness({
    confirmResult: false,
    api: {
      enableOfficeMasterDataEmployeeAccounts: async () => {
        batchCalls += 1;
        return { source: "api", atomic: true, employeeAccountReviews: [] };
      },
    },
  });
  await cancelled.controller.enableMasterDataEmployeeAccounts(reviews);
  assert.equal(batchCalls, 0, "batch account enablement must require explicit confirmation");

  let requestInput = null;
  const enabled = createHarness({
    api: {
      enableOfficeMasterDataEmployeeAccounts: async (input) => {
        requestInput = input;
        return {
          source: "api",
          atomic: true,
          employeeAccountReviews: reviews.map((review) => ({ ...review, accountEnabled: true })),
          enabledCount: 2,
          skippedCount: 0,
        };
      },
    },
  });
  await enabled.controller.enableMasterDataEmployeeAccounts([...reviews, reviews[0]]);
  assert.equal(requestInput.confirmed, true);
  assert.deepEqual(requestInput.employeeIds, ["EMP-BATCH-1", "EMP-BATCH-2"]);
  assert.equal(enabled.getEmployeeReviews().length, 2);
  assert.equal(enabled.getEmployeeReviews().every((review) => review.accountEnabled), true);
  assert.equal(enabled.getEmployeeRefreshCount(), 1);
  assert.equal(enabled.getV1StatusRefreshCount(), 1);
  assert.match(enabled.toasts.at(-1), /已批量启用 2 个员工账号/);
}

{
  let requestInput = null;
  const review = {
    employeeId: "EMP-002",
    name: "负责人",
    accountEnabled: true,
    recommendedRoleKey: "management",
    recommendedRoleKeys: ["management", "finance"],
  };
  const harness = createHarness({
    api: {
      issueOfficeMasterDataEmployeeAccountPassword: async (input) => {
        requestInput = input;
        return {
          source: "api",
          employeeAccountReview: { ...review, userId: "U-EMP-002", loginName: "li" },
          issuedCredential: { userId: "U-EMP-002", loginName: "li", temporaryPassword: "one-time" },
          operationLogId: "LOG-PASSWORD-1",
        };
      },
    },
  });
  await harness.controller.issueMasterDataEmployeeAccountPassword(review);
  assert.deepEqual(requestInput.roleKeys, ["management", "finance"]);
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
  let requestInput = null;
  const harness = createHarness({
    api: {
      createOfficeMasterDataMachine: async (input) => {
        requestInput = input;
        return {
          source: "api",
          machine: {
            machineId: input.machineId,
            name: input.name,
            machineType: input.machineType,
            workshop: input.workshop,
            status: input.status,
            updatedAt: "2026-07-12T09:00:00.000Z",
          },
          operationLogId: "LOG-MACHINE-1",
        };
      },
    },
  });
  const saved = await harness.controller.saveMasterDataMachine({
    isNew: true,
    machineId: "BAG-10",
    name: "10号制袋机",
    machineType: "bag_making",
    workshop: "4号车间",
    status: "active",
    reason: "新增现场机台",
  });
  assert.equal(requestInput.operatorId, "U-MANAGER-A");
  assert.equal(saved.machineId, "BAG-10");
  assert.equal(harness.getEmployeeRefreshCount(), 1);
  assert.equal(harness.getV1StatusRefreshCount(), 1);
  assert.match(harness.toasts.at(-1), /已新增机台/);
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

const appSource = [
  readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/OfficeWorkbench.jsx", import.meta.url), "utf8"),
].join("\n");
const actionsSource = readFileSync(new URL("../src/app/createOfficeMasterDataActions.js", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../server/services/masterDataImportCommandService.mjs", import.meta.url), "utf8");
assert.match(appSource, /createOfficeMasterDataActions\(\{/);
assert.match(appSource, /allowLocalFallback: !runtimeServerRequired/);
for (const functionName of [
  "commitMasterDataImportExecutionFromPlan",
  "createMasterDataImportConfirmationPlanFromDraft",
  "confirmMasterDataEmployeeIdentity",
  "enableMasterDataEmployeeAccount",
  "enableMasterDataEmployeeAccounts",
  "issueMasterDataEmployeeAccountPassword",
]) {
  assert.doesNotMatch(appSource, new RegExp(`(?:async )?function ${functionName}\\(`));
}
assert.doesNotMatch(serverSource, /cleanText\(body\.officialWriterKind\)/);
assert.match(actionsSource, /Promise\.allSettled\(\[/, "successful employee writes should settle read-model refreshes independently");
assert.match(appSource, /onSaveMachine: saveMasterDataMachine/, "App should pass machine writes through the master-data route action adapter");

console.log("Office master-data actions check passed: imports and employee accounts are isolated, formal writes fail closed, and the server owns writer selection.");
