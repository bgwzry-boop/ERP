import assert from "node:assert/strict";
import { createMasterDataImportCommandService } from "../server/services/masterDataImportCommandService.mjs";
import { createLocalMasterDataImportTransactionRepository, createPostgresMasterDataImportTransactionRepository } from "../server/masterDataImportTransactionRepository.mjs";

const fixedNow = new Date("2026-07-12T08:00:00.000Z");
let logSequence = 0;
let officialWriterKind = "";
const service = createMasterDataImportCommandService({
  buildOperationLog(workspace, input) {
    logSequence += 1;
    return {
      id: "LOG-" + logSequence,
      ...input,
    };
  },
  getOfficialWriterKind: () => officialWriterKind,
  now: () => fixedNow,
});

assert.throws(
  () => createMasterDataImportCommandService(),
  /buildOperationLog must be a function/,
);

{
  const result = await service.createConfirmationPlan({
    workspace: createWorkspace(),
    body: {},
    operatorId: "U-MANAGER",
  });
  assert.deepEqual(result, {
    error: true,
    statusCode: 400,
    code: "MASTER_DATA_IMPORT_REVIEW_DRAFT_REQUIRED",
    message: "reviewDraft is required.",
  });
}

const workspace = createWorkspace();
const reviewDraft = createReviewDraft();
const planResult = await service.createConfirmationPlan({
  workspace,
  body: { reviewDraft, createdAt: fixedNow.toISOString() },
  operatorId: "U-MANAGER",
});
assert.equal(planResult.statusCode, 201);
assert.equal(planResult.response.confirmationPlan.createdBy, "管理A");
assert.equal(planResult.response.confirmationPlan.officialImportEnabled, false);
assert.equal(planResult.response.officialWriteScope, "none");
assert.equal(workspace.savedConfirmationPlans.length, 1);
assert.equal(workspace.savedConfirmationPlans[0].operationLog.operatorId, "U-MANAGER");

{
  const result = await service.createImportExecution({
    workspace,
    body: {},
    operatorId: "U-MANAGER",
  });
  assert.equal(result.error, true);
  assert.equal(result.code, "MASTER_DATA_IMPORT_CONFIRMATION_PLAN_ID_REQUIRED");
}

{
  const result = await service.createImportExecution({
    workspace,
    body: { planId: "MDP-MISSING" },
    operatorId: "U-MANAGER",
  });
  assert.deepEqual(result, {
    notFound: true,
    code: "MASTER_DATA_IMPORT_CONFIRMATION_PLAN_NOT_FOUND",
  });
}

workspace.confirmationPlans = [planResult.response.confirmationPlan];
const blockedExecution = await service.createImportExecution({
  workspace,
  body: {
    planId: planResult.response.confirmationPlan.planId,
    requestedAt: fixedNow.toISOString(),
  },
  operatorId: "U-MANAGER",
});
assert.equal(blockedExecution.statusCode, 201);
assert.equal(blockedExecution.response.importExecution.status, "blocked_official_writer_not_configured");
assert.equal(blockedExecution.response.importExecution.requestedBy, "管理A");
assert.equal(blockedExecution.response.officialWriteAttempted, false);

workspace.masterDataImportTransactionRepository.applyImportExecution = async ({ importExecution }) => ({
  importExecution: {
    ...importExecution,
    status: "committed",
    statusLabel: "已正式导入",
    officialWriteAttempted: true,
    transactionStarted: true,
    finishedAt: fixedNow.toISOString(),
  },
  summary: {
    committed: true,
    insertedCount: 1,
  },
});
officialWriterKind = "postgres";
const committedExecution = await service.createImportExecution({
  workspace,
  body: {
    planId: planResult.response.confirmationPlan.planId,
    requestedAt: "2026-07-12T08:01:00.000Z",
    officialImportEnabled: true,
    officialWriterKind: "local_transaction",
  },
  operatorId: "U-MANAGER",
});
assert.equal(committedExecution.statusCode, 201);
assert.equal(committedExecution.response.importExecution.status, "committed");
assert.equal(committedExecution.response.importExecution.officialWriterKind, "postgres");
assert.equal(committedExecution.response.transactionSummary.committed, true);
assert.equal(committedExecution.response.officialWriteScope, "master_data_import_v1");

workspace.masterDataImportTransactionRepository.applyImportExecution = async () => {
  throw new Error("transaction rolled back");
};
const failedExecution = await service.createImportExecution({
  workspace,
  body: {
    planId: planResult.response.confirmationPlan.planId,
    requestedAt: "2026-07-12T08:02:00.000Z",
    officialImportEnabled: true,
    officialWriterKind: "local_transaction",
  },
  operatorId: "U-MANAGER",
});
assert.equal(failedExecution.statusCode, 422);
assert.equal(failedExecution.response.code, "MASTER_DATA_IMPORT_TRANSACTION_FAILED_ROLLED_BACK");
assert.equal(failedExecution.response.importExecution.status, "failed");
assert.equal(failedExecution.response.importExecution.transactionSummary.rollbackApplied, true);
assert.equal(workspace.savedImportExecutions.at(-1).operationLog.action, "master_data_import_execution_failed_rolled_back");

{
  const result = await service.createFailedRowsCorrectionDraft({
    workspace,
    executionId: "MDE-MISSING",
    body: {},
    operatorId: "U-MANAGER",
  });
  assert.deepEqual(result, {
    notFound: true,
    code: "MASTER_DATA_IMPORT_EXECUTION_NOT_FOUND",
  });
}

workspace.importExecutions = [
  {
    executionId: "MDE-FAILED",
    planId: planResult.response.confirmationPlan.planId,
    draftId: reviewDraft.draftId,
    status: "failed",
    statusLabel: "导入失败已回滚",
    requestedAt: fixedNow.toISOString(),
    importPayloadVersion: "payload-v1",
    failedRows: [
      {
        sheetKey: "customers",
        worksheetName: "客户档案",
        rowNumber: 3,
        reason: "客户名称为空",
        values: { 客户名称: "" },
      },
    ],
  },
];
const correctionResult = await service.createFailedRowsCorrectionDraft({
  workspace,
  executionId: "MDE-FAILED",
  body: {
    createdAt: fixedNow.toISOString(),
    rowCorrections: [
      {
        sheetKey: "customers",
        rowNumber: 3,
        values: { 客户名称: "修正客户" },
      },
    ],
  },
  operatorId: "U-MANAGER",
});
assert.equal(correctionResult.statusCode, 201);
assert.equal(correctionResult.response.reviewDraft.requestedBy, "管理A");
assert.equal(correctionResult.response.correctionSummary.correctedRowCount, 1);
assert.equal(correctionResult.response.correctionSummary.unresolvedRowCount, 0);
assert.equal(correctionResult.response.officialImportEnabled, false);

const downloadWorkspace = createWorkspace();
assert.deepEqual(await service.getFailedRowsDownload({ workspace: downloadWorkspace, executionId: "MISSING" }), {
  notFound: true,
  code: "MASTER_DATA_IMPORT_EXECUTION_NOT_FOUND",
});
downloadWorkspace.importExecutions = [{ executionId: "MDE-NO-ROWS" }];
assert.equal((await service.getFailedRowsDownload({ workspace: downloadWorkspace, executionId: "MDE-NO-ROWS" })).code, "MASTER_DATA_IMPORT_FAILED_ROWS_NOT_AVAILABLE");
downloadWorkspace.importExecutions = [{
  executionId: "MDE-DOWNLOAD",
  failedRowsDownload: { required: true, content: "row,error", fileName: "failed.csv", contentType: "text/csv" },
}];
assert.deepEqual(await service.getFailedRowsDownload({ workspace: downloadWorkspace, executionId: "MDE-DOWNLOAD" }), {
  file: { body: "row,error", options: { contentType: "text/csv", fileName: "failed.csv" } },
});

const machineWorkspace = createWorkspace();
officialWriterKind = "local_transaction";
machineWorkspace.machines = [{
  id: "PRINT-02", machineId: "PRINT-02", name: "已维护旋转印机", machineType: "screen_printing",
  workshop: "丝印车间", status: "maintenance", enabled: false,
  settings: { legacyMachineIds: ["LEGACY-PRINT-2"], maintained: true },
}];
machineWorkspace.employees = [];
machineWorkspace.operationLogs = [];
machineWorkspace.masterDataImportTransactionRepository = createLocalMasterDataImportTransactionRepository();
const existingMachineBefore = structuredClone(machineWorkspace.machines[0]);
const usersBefore = structuredClone(machineWorkspace.users);
const machineRows = [
  { 员工编号: "EMP-FICTITIOUS-PRINT-1", 员工姓名: "虚构印刷员甲", 角色: "车间报工", 机台编号: "LEGACY-PRINT-2", 默认车间: "丝印车间" },
  { 员工编号: "EMP-FICTITIOUS-PRINT-2", 员工姓名: "虚构印刷员乙", 角色: "车间报工", 默认机台: "3号丝印机", 默认车间: "丝印车间" },
];
const machineReviewDraft = createReviewDraft();
machineReviewDraft.draftId = "MDI-FICTITIOUS-MACHINES";
machineReviewDraft.summary.dataRowCount = machineRows.length;
machineReviewDraft.sheets = [{ key: "employees_machines", label: "员工机台", worksheetName: "员工机台", dataRowCount: machineRows.length }];
machineReviewDraft.stagedRows = [{
  sheetKey: "employees_machines", worksheetName: "员工机台",
  rows: machineRows.map((values, index) => ({ rowNumber: index + 3, values })),
}];
const machinePlanResult = await service.createConfirmationPlan({
  workspace: machineWorkspace, body: { reviewDraft: machineReviewDraft }, operatorId: "U-MANAGER",
});
for (let attempt = 0; attempt < 2; attempt += 1) {
  const result = await service.createImportExecution({
    workspace: machineWorkspace,
    body: { planId: machinePlanResult.response.confirmationPlan.planId, officialImportEnabled: true, requestedAt: fixedNow.toISOString() },
    operatorId: "U-MANAGER",
  });
  assert.equal(result.response.importExecution.status, "committed");
  assert.deepEqual(machineWorkspace.machines.find((machine) => machine.id === "PRINT-02"), existingMachineBefore);
  assert.equal(machineWorkspace.machines.length, 2);
  assert.equal(machineWorkspace.machines.find((machine) => machine.id === "PRINT-03").machineType, "screen_printing");
  assert.equal(machineWorkspace.employees.length, 2);
  assert.deepEqual(machineWorkspace.employees.map((employee) => employee.defaultMachineId), ["PRINT-02", "PRINT-03"]);
  assert.equal(machineWorkspace.employeeMachineAssignments.length, 2);
  assert.deepEqual(machineWorkspace.users, usersBefore);
}
const storedMachines = structuredClone(machineWorkspace.machines);
const staleWorkspace = createWorkspace();
staleWorkspace.machines = [];
staleWorkspace.employees = [];
staleWorkspace.operationLogs = [];
staleWorkspace.confirmationPlans = [machinePlanResult.response.confirmationPlan];
officialWriterKind = "postgres";
let machineReads = 0;
staleWorkspace.masterDataMachineConfigurationRepository = {
  kind: "postgres",
  async loadState() { machineReads += 1; return { machines: structuredClone(storedMachines) }; },
};
staleWorkspace.masterDataImportTransactionRepository = createPostgresMasterDataImportTransactionRepository({
  async queryJson(text) {
    assert.doesNotMatch(text, /INSERT INTO machines/, "权威目录已经存在的机台不应再进入新增SQL");
    return { status: "committed", operationLogId: "LOG-PG-STALE-MACHINE" };
  },
});
for (let attempt = 0; attempt < 2; attempt += 1) {
  const cacheBefore = staleWorkspace.machines;
  const result = await service.createImportExecution({
    workspace: staleWorkspace,
    body: { planId: machinePlanResult.response.confirmationPlan.planId, officialImportEnabled: true },
    operatorId: "U-MANAGER",
  });
  assert.equal(result.response.importExecution.status, "committed", "PG成功提交后不得因启动缓存缺机器误报回滚");
  assert.deepEqual(result.response.importExecution.importPayload.targetRecords.machines, []);
  assert.strictEqual(staleWorkspace.machines, cacheBefore, "异步权威快照不能倒写共享机器目录");
  assert.deepEqual(staleWorkspace.employees.map((employee) => employee.defaultMachineId), ["PRINT-02", "PRINT-03"]);
}
assert.equal(machineReads, 2, "每次正式导入均须读取权威机台目录，不能使用启动缓存");

const unavailableMachines = createWorkspace();
unavailableMachines.confirmationPlans = [machinePlanResult.response.confirmationPlan];
unavailableMachines.machines = storedMachines;
let unavailableWrites = 0;
unavailableMachines.masterDataImportTransactionRepository.applyImportExecution = async () => { unavailableWrites += 1; };
const unavailableResult = await service.createImportExecution({
  workspace: unavailableMachines,
  body: { planId: machinePlanResult.response.confirmationPlan.planId, officialImportEnabled: true },
  operatorId: "U-MANAGER",
});
assert.equal(unavailableResult.code, "MASTER_DATA_IMPORT_EXECUTION_INVALID");
assert.match(unavailableResult.message, /机台目录读取能力不可用/);
assert.equal(unavailableWrites, 0);
unavailableMachines.coreWorkspaceReadRepository = { kind: "postgres", async loadState() { return {}; } };
const incompleteResult = await service.createImportExecution({
  workspace: unavailableMachines,
  body: { planId: machinePlanResult.response.confirmationPlan.planId, officialImportEnabled: true },
  operatorId: "U-MANAGER",
});
assert.match(incompleteResult.message, /机台目录读取不完整/);
assert.equal(unavailableWrites, 0);

// The core PostgreSQL snapshot is a valid fallback when a dedicated reader is absent.
unavailableMachines.coreWorkspaceReadRepository.loadState = async () => ({ machines: storedMachines });
const refreshedPreview = await service.createImportExecution({
  workspace: unavailableMachines,
  body: { planId: machinePlanResult.response.confirmationPlan.planId },
  operatorId: "U-MANAGER",
});
assert.equal(refreshedPreview.response.importExecution.status, "blocked_official_writer_not_configured");
assert.deepEqual(refreshedPreview.response.importExecution.importPayload.targetRecords.machines, []);
assert.equal(unavailableWrites, 0);

const invalidMachineWorkspace = createWorkspace();
officialWriterKind = "local_transaction";
const invalidMachineDraft = structuredClone(machineReviewDraft);
invalidMachineDraft.draftId = "MDI-FICTITIOUS-UNKNOWN-MACHINE";
invalidMachineDraft.stagedRows[0].rows[0].values = {
  员工编号: "EMP-FICTITIOUS-UNKNOWN", 员工姓名: "虚构人员丙", 角色: "车间报工",
  机台编号: "UNKNOWN-1", 默认机台: "丝印自动设备", 默认车间: "丝印车间",
};
const invalidMachinePlan = await service.createConfirmationPlan({
  workspace: invalidMachineWorkspace, body: { reviewDraft: invalidMachineDraft }, operatorId: "U-MANAGER",
});
let invalidWriterCalls = 0;
invalidMachineWorkspace.masterDataImportTransactionRepository.applyImportExecution = async () => { invalidWriterCalls += 1; };
const invalidMachineExecution = await service.createImportExecution({
  workspace: invalidMachineWorkspace,
  body: {
    planId: invalidMachinePlan.response.confirmationPlan.planId, officialImportEnabled: true,
    configuredMachines: [{ id: "UNKNOWN-1", name: "丝印自动设备", machineType: "bag_making", workshop: "丝印车间" }],
  },
  operatorId: "U-MANAGER",
});
assert.equal(invalidMachineExecution.response.importExecution.status, "blocked_failed_rows_ready");
assert.equal(invalidMachineExecution.response.officialWriteAttempted, false);
assert.equal(invalidWriterCalls, 0, "未知机台阻断整批写入，不能信任客户端提供的机台目录");

console.log(
  "Master-data import command service checks passed: plan, blocked/committed/rolled-back execution, failed-row correction, and failed-row download are isolated.",
);

function createWorkspace() {
  const state = {
    users: [{ id: "U-MANAGER", displayName: "管理A" }],
    confirmationPlans: [],
    importExecutions: [],
    savedConfirmationPlans: [],
    savedImportExecutions: [],
    savedReviewDrafts: [],
  };
  state.masterDataImportReviewRepository = {
    async listConfirmationPlans({ filters }) {
      return state.confirmationPlans.filter((item) => item.planId === filters.planId);
    },
    async listImportExecutions({ filters }) {
      return state.importExecutions.filter((item) => item.executionId === filters.executionId);
    },
    async saveConfirmationPlan({ confirmationPlan, operationLog }) {
      const saved = {
        confirmationPlan: { ...confirmationPlan, operationLogId: operationLog.id },
        operationLogId: operationLog.id,
      };
      state.savedConfirmationPlans.push({ ...saved, operationLog });
      state.confirmationPlans = [
        ...state.confirmationPlans.filter((item) => item.planId !== confirmationPlan.planId),
        saved.confirmationPlan,
      ];
      return saved;
    },
    async saveImportExecution({ importExecution, operationLog }) {
      const saved = {
        importExecution: { ...importExecution, operationLogId: operationLog.id },
        operationLogId: operationLog.id,
      };
      state.savedImportExecutions.push({ ...saved, operationLog });
      return saved;
    },
    async saveReviewDraft({ reviewDraft, operationLog }) {
      const saved = {
        reviewDraft: { ...reviewDraft, operationLogId: operationLog.id },
        operationLogId: operationLog.id,
      };
      state.savedReviewDrafts.push({ ...saved, operationLog });
      return saved;
    },
  };
  state.masterDataImportTransactionRepository = {
    async applyImportExecution() {
      throw new Error("transaction repository not configured");
    },
  };
  return state;
}

function createReviewDraft() {
  return {
    draftId: "MDI-READY",
    fileName: "master-data.xlsx",
    status: "ready_for_import_confirmation",
    canEnterReviewQueue: true,
    summary: {
      dataRowCount: 1,
      errorCount: 0,
      warningCount: 0,
      requiresManualReview: false,
    },
    sheets: [
      {
        key: "customers",
        label: "客户档案",
        worksheetName: "客户档案",
        dataRowCount: 1,
      },
    ],
    stagedRows: [
      {
        sheetKey: "customers",
        worksheetName: "客户档案",
        rows: [
          {
            rowNumber: 3,
            values: {
              客户名称: "测试客户",
              联系人姓名: "测试联系人",
              手机号: "13800000000",
            },
          },
        ],
      },
    ],
  };
}
