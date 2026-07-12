import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMasterDataImportCommandService } from "../server/services/masterDataImportCommandService.mjs";

const apiServerSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const commandServiceSource = readFileSync(
  new URL("../server/services/masterDataImportCommandService.mjs", import.meta.url),
  "utf8",
);
assert.doesNotMatch(apiServerSource, /createMasterDataImportConfirmationPlan\(/);
assert.doesNotMatch(apiServerSource, /createMasterDataImportExecution\(/);
assert.doesNotMatch(apiServerSource, /createMasterDataImportCorrectionDraftFromFailedRows\(/);
assert.match(commandServiceSource, /createMasterDataImportConfirmationPlan\(/);
assert.match(commandServiceSource, /createMasterDataImportExecution\(/);
assert.match(commandServiceSource, /createMasterDataImportCorrectionDraftFromFailedRows\(/);

const fixedNow = new Date("2026-07-12T08:00:00.000Z");
let logSequence = 0;
const service = createMasterDataImportCommandService({
  buildOperationLog(workspace, input) {
    logSequence += 1;
    return {
      id: "LOG-" + logSequence,
      ...input,
    };
  },
  getOfficialWriterKind: () => "",
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
const committedExecution = await service.createImportExecution({
  workspace,
  body: {
    planId: planResult.response.confirmationPlan.planId,
    requestedAt: "2026-07-12T08:01:00.000Z",
    officialImportEnabled: true,
    officialWriterKind: "postgres",
  },
  operatorId: "U-MANAGER",
});
assert.equal(committedExecution.statusCode, 201);
assert.equal(committedExecution.response.importExecution.status, "committed");
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
    officialWriterKind: "postgres",
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

console.log(
  "Master-data import command service checks passed: plan, blocked/committed/rolled-back execution, and failed-row correction are isolated.",
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
