import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  buildListConfirmationPlansQuery,
  buildListReviewDraftsSql,
  buildListReviewDraftsQuery,
  buildListConfirmationPlansSql,
  buildListImportExecutionsQuery,
  buildListImportExecutionsSql,
  buildLoadMasterDataImportReviewStateSql,
  buildSaveReviewDraftTransactionQuery,
  buildSaveReviewDraftTransactionSql,
  buildSaveConfirmationPlanTransactionQuery,
  buildSaveConfirmationPlanTransactionSql,
  buildSaveImportExecutionTransactionQuery,
  buildSaveImportExecutionTransactionSql,
  createLocalMasterDataImportReviewRepository,
  createPostgresMasterDataImportReviewRepository,
} from "../server/masterDataImportReviewRepository.mjs";

const now = "2026-07-03T10:30:00.000Z";
const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "master-data-import-review-repository");
rmSync(storageRoot, { recursive: true, force: true });

const reviewDraft = {
  draftId: "MDR-CHECK-001",
  status: "ready_for_review_queue",
  statusLabel: "可进入复核",
  fileName: "erp-master-data-import-template-2026-07-03.xlsx",
  requestedBy: "办公室A",
  createdAt: now,
  checkedAt: now,
  canEnterReviewQueue: true,
  summary: { stagedRowCount: 2, employeeRoleCoverageLabel: "1/8" },
  employeeRoleCoverage: {
    available: true,
    complete: false,
    employeeRowCount: 1,
    requiredRoleCount: 8,
    coveredRoleCount: 1,
    missingRoleCount: 7,
    coverageLabel: "1/8",
    missingRoleLabels: ["管理人员", "办公室", "仓库", "包装", "司机", "财务", "技术运维"],
    roles: [{ roleKey: "workshop", roleLabel: "车间", rowCount: 1 }],
  },
};

const confirmationPlan = {
  planId: "MDP-CHECK-001",
  draftId: reviewDraft.draftId,
  status: "ready_for_final_confirmation",
  statusLabel: "待最终确认",
  fileName: reviewDraft.fileName,
  createdBy: "办公室A",
  createdAt: now,
  summary: { stagedRowCount: 2, employeeRoleCoverageLabel: "1/8" },
  employeeRoleCoverage: reviewDraft.employeeRoleCoverage,
  stagedRows: [{ sheetKey: "customers", rowCount: 1 }],
  targetTables: ["customers", "price_table_items"],
};

const importExecution = {
  executionId: "MDE-CHECK-001",
  planId: confirmationPlan.planId,
  draftId: reviewDraft.draftId,
  status: "committed",
  statusLabel: "已正式导入",
  fileName: reviewDraft.fileName,
  requestedBy: "管理员A",
  requestedAt: "2026-07-03T10:31:00.000Z",
  officialWriterKind: "postgres",
  officialImportEnabled: true,
  officialWriteAttempted: true,
  officialWriteScope: "master_data_import_v1",
  summary: { stagedRowCount: 2, transactionRecordCount: 2 },
};

const correctionDraft = {
  draftId: "MDR-CHECK-CORRECTION-001",
  status: "pending_review",
  statusLabel: "待人工确认",
  fileName: "失败行修正草稿-MDE-CHECK-001.csv",
  requestedBy: "办公室A",
  createdAt: "2026-07-03T10:32:00.000Z",
  checkedAt: "2026-07-03T10:32:00.000Z",
  canEnterReviewQueue: true,
  sourceExecutionId: importExecution.executionId,
  sourcePlanId: confirmationPlan.planId,
  correctionMode: "failed_rows_reimport",
  correctionSummary: { failedRowCount: 1, correctedRowCount: 0, unresolvedRowCount: 1 },
  summary: { dataRowCount: 1, warningCount: 1, errorCount: 0 },
};

const planLog = {
  id: "LOG-MDP-CHECK-001",
  targetType: "master_data_import_confirmation_plan",
  targetId: confirmationPlan.planId,
  action: "master_data_import_confirmation_plan_created",
  before: null,
  after: { planId: confirmationPlan.planId },
  reason: "repository check",
  operatorId: "U-OFFICE-A",
  pageKey: "master_data",
  occurredAt: now,
  createdAt: now,
};

const executionLog = {
  id: "LOG-MDE-CHECK-001",
  targetType: "master_data_import_execution",
  targetId: importExecution.executionId,
  action: "master_data_import_execution_committed",
  before: { planId: confirmationPlan.planId },
  after: { executionId: importExecution.executionId },
  reason: "repository check",
  operatorId: "U-MANAGER-A",
  pageKey: "master_data",
  occurredAt: importExecution.requestedAt,
  createdAt: importExecution.requestedAt,
};

const correctionDraftLog = {
  id: "LOG-MDR-CORRECTION-CHECK-001",
  targetType: "master_data_import_review_draft",
  targetId: correctionDraft.draftId,
  action: "master_data_import_failed_rows_correction_draft_created",
  before: { executionId: importExecution.executionId },
  after: { draftId: correctionDraft.draftId, sourceExecutionId: importExecution.executionId },
  reason: "repository check correction draft",
  operatorId: "U-OFFICE-A",
  pageKey: "master_data",
  occurredAt: correctionDraft.createdAt,
  createdAt: correctionDraft.createdAt,
};

const localWorkspace = {};
const localRepository = createLocalMasterDataImportReviewRepository({ storageRoot });
const localSavedPlan = localRepository.saveConfirmationPlan({
  workspace: localWorkspace,
  reviewDraft,
  confirmationPlan,
  operationLog: planLog,
});
assert.equal(localRepository.kind, "local_json");
assert.equal(localSavedPlan.confirmationPlan.operationLogId, planLog.id);
assert.equal(localSavedPlan.confirmationPlan.employeeRoleCoverage.coverageLabel, "1/8");
assert.equal(localRepository.listConfirmationPlans({ workspace: localWorkspace, filters: { draftId: reviewDraft.draftId } }).length, 1);

const localSavedExecution = localRepository.saveImportExecution({
  workspace: localWorkspace,
  confirmationPlan: localSavedPlan.confirmationPlan,
  importExecution,
  operationLog: executionLog,
});
assert.equal(localSavedExecution.importExecution.operationLogId, executionLog.id);
assert.equal(localSavedExecution.confirmationPlan.lastExecutionId, importExecution.executionId);
assert.equal(localRepository.listImportExecutions({ workspace: localWorkspace, filters: { status: "committed" } }).length, 1);

const localSavedCorrectionDraft = localRepository.saveReviewDraft({
  workspace: localWorkspace,
  reviewDraft: correctionDraft,
  operationLog: correctionDraftLog,
});
assert.equal(localSavedCorrectionDraft.reviewDraft.operationLogId, correctionDraftLog.id);
assert.equal(
  localRepository.listReviewDrafts({ workspace: localWorkspace, filters: { sourceExecutionId: importExecution.executionId } })[0].draftId,
  correctionDraft.draftId,
);

const reloadedLocalRepository = createLocalMasterDataImportReviewRepository({ storageRoot });
const reloadedState = reloadedLocalRepository.loadState();
assert.equal(reloadedState.masterDataImportReviewDrafts.length, 2);
assert(reloadedState.masterDataImportReviewDrafts.some((draft) => draft.draftId === correctionDraft.draftId));
assert.equal(reloadedState.masterDataImportConfirmationPlans[0].planId, confirmationPlan.planId);
assert.equal(reloadedState.masterDataImportConfirmationPlans[0].employeeRoleCoverage.missingRoleCount, 7);
assert.equal(reloadedState.masterDataImportExecutions[0].executionId, importExecution.executionId);
assert(reloadedState.operationLogs.some((log) => log.id === correctionDraftLog.id));

const saveReviewDraftSql = buildSaveReviewDraftTransactionSql({ reviewDraft: correctionDraft, operationLog: correctionDraftLog });
assert.match(saveReviewDraftSql, /INSERT INTO master_data_import_review_drafts/);
assert.ok(!saveReviewDraftSql.includes("master_data_import_failed_rows_correction_draft_created"));
assert.ok(!saveReviewDraftSql.includes("LOG-MDR-CORRECTION-CHECK-001"));
assert.equal(buildSaveReviewDraftTransactionQuery({ reviewDraft: correctionDraft, operationLog: correctionDraftLog }).values.includes(
  "master_data_import_failed_rows_correction_draft_created",
), true);

const savePlanSql = buildSaveConfirmationPlanTransactionSql({ reviewDraft, confirmationPlan, operationLog: planLog });
assert.match(savePlanSql, /INSERT INTO master_data_import_review_drafts/);
assert.match(savePlanSql, /INSERT INTO master_data_import_confirmation_plans/);
assert.match(savePlanSql, /INSERT INTO operation_logs/);
assert.ok(!savePlanSql.includes("LOG-MDP-CHECK-001"));
assert.equal(buildSaveConfirmationPlanTransactionQuery({ reviewDraft, confirmationPlan, operationLog: planLog }).values.includes(
  "LOG-MDP-CHECK-001",
), true);

const saveExecutionSql = buildSaveImportExecutionTransactionSql({
  confirmationPlan: localSavedExecution.confirmationPlan,
  importExecution,
  operationLog: executionLog,
});
assert.match(saveExecutionSql, /INSERT INTO master_data_import_executions/);
assert.match(saveExecutionSql, /last_execution_id/);
assert.ok(!saveExecutionSql.includes("LOG-MDE-CHECK-001"));
assert.equal(buildSaveImportExecutionTransactionQuery({
  confirmationPlan: localSavedExecution.confirmationPlan,
  importExecution,
  operationLog: executionLog,
}).values.includes("LOG-MDE-CHECK-001"), true);

const listPlanSql = buildListConfirmationPlansSql({ draftId: reviewDraft.draftId, planId: confirmationPlan.planId, status: confirmationPlan.status });
assert.match(listPlanSql, /WHERE draft_id = \$1::text AND id = \$2::text AND status = \$3::text/);
assert.deepEqual(buildListConfirmationPlansQuery({
  draftId: reviewDraft.draftId,
  planId: confirmationPlan.planId,
  status: confirmationPlan.status,
}).values, [reviewDraft.draftId, confirmationPlan.planId, confirmationPlan.status, 100]);

const listReviewDraftSql = buildListReviewDraftsSql({ sourceExecutionId: importExecution.executionId, status: correctionDraft.status });
assert.match(listReviewDraftSql, /FROM master_data_import_review_drafts/);
assert.match(listReviewDraftSql, /payload_json->>'sourceExecutionId' = \$2::text/);
assert.deepEqual(buildListReviewDraftsQuery({
  sourceExecutionId: importExecution.executionId,
  status: correctionDraft.status,
}).values, [correctionDraft.status, importExecution.executionId, 100]);

const listExecutionSql = buildListImportExecutionsSql({ draftId: reviewDraft.draftId, planId: confirmationPlan.planId, executionId: importExecution.executionId, status: importExecution.status });
assert.match(listExecutionSql, /WHERE draft_id = \$1::text AND plan_id = \$2::text AND id = \$3::text AND status = \$4::text/);
assert.deepEqual(buildListImportExecutionsQuery({
  draftId: reviewDraft.draftId,
  planId: confirmationPlan.planId,
  executionId: importExecution.executionId,
  status: importExecution.status,
}).values, [reviewDraft.draftId, confirmationPlan.planId, importExecution.executionId, importExecution.status, 100]);
assert.match(buildLoadMasterDataImportReviewStateSql(), /master_data_import_review_drafts/);

const postgresWorkspace = {};
const queryCalls = [];
const postgresRepository = createPostgresMasterDataImportReviewRepository({
  queryJson(text, values) {
    queryCalls.push({ text, values });
    if (text.includes("masterDataImportReviewDrafts")) {
      return {
        masterDataImportReviewDrafts: [correctionDraft, reviewDraft],
        masterDataImportConfirmationPlans: [{ ...confirmationPlan, operationLogId: planLog.id }],
        masterDataImportExecutions: [{ ...importExecution, operationLogId: executionLog.id }],
        operationLogs: [correctionDraftLog, planLog, executionLog],
      };
    }
    if (text.includes("upserted_review_draft") && !text.includes("upserted_confirmation_plan")) {
      return {
        reviewDraft: { ...correctionDraft, operationLogId: correctionDraftLog.id },
        operationLogId: correctionDraftLog.id,
      };
    }
    if (text.includes("upserted_review_draft")) {
      return {
        reviewDraft,
        confirmationPlan: { ...confirmationPlan, operationLogId: planLog.id, officialImportEnabled: false, officialWriteScope: "none" },
        operationLogId: planLog.id,
      };
    }
    if (text.includes("upserted_import_execution")) {
      return {
        confirmationPlan: {
          ...confirmationPlan,
          operationLogId: planLog.id,
          lastExecutionId: importExecution.executionId,
          lastExecutionStatus: importExecution.status,
          lastExecutionAt: importExecution.requestedAt,
          officialImportEnabled: false,
          officialWriteScope: "none",
        },
        importExecution: { ...importExecution, operationLogId: executionLog.id },
        operationLogId: executionLog.id,
      };
    }
    if (text.includes("FROM master_data_import_review_drafts")) {
      return [{ ...correctionDraft, operationLogId: correctionDraftLog.id }];
    }
    if (text.includes("FROM master_data_import_confirmation_plans")) {
      return [{ ...confirmationPlan, operationLogId: planLog.id }];
    }
    if (text.includes("FROM master_data_import_executions")) {
      return [{ ...importExecution, operationLogId: executionLog.id }];
    }
    return null;
  },
});

assert.equal(postgresRepository.kind, "postgres");
const postgresSavedCorrectionDraft = await postgresRepository.saveReviewDraft({
  workspace: postgresWorkspace,
  reviewDraft: correctionDraft,
  operationLog: correctionDraftLog,
});
assert.equal(postgresSavedCorrectionDraft.reviewDraft.operationLogId, correctionDraftLog.id);
assert.equal(postgresWorkspace.masterDataImportReviewDrafts.length, 1);

const postgresSavedPlan = await postgresRepository.saveConfirmationPlan({
  workspace: postgresWorkspace,
  reviewDraft,
  confirmationPlan,
  operationLog: planLog,
});
assert.equal(postgresSavedPlan.confirmationPlan.operationLogId, planLog.id);
assert.equal(postgresSavedPlan.confirmationPlan.employeeRoleCoverage.coverageLabel, "1/8");
assert.equal(postgresWorkspace.masterDataImportConfirmationPlans.length, 1);

const postgresSavedExecution = await postgresRepository.saveImportExecution({
  workspace: postgresWorkspace,
  confirmationPlan: postgresSavedPlan.confirmationPlan,
  importExecution,
  operationLog: executionLog,
});
assert.equal(postgresSavedExecution.importExecution.operationLogId, executionLog.id);
assert.equal(postgresWorkspace.masterDataImportExecutions.length, 1);
assert.equal((await postgresRepository.listReviewDrafts({ filters: { sourceExecutionId: importExecution.executionId } }))[0].draftId, correctionDraft.draftId);
assert.equal((await postgresRepository.listConfirmationPlans({ filters: { planId: confirmationPlan.planId } }))[0].planId, confirmationPlan.planId);
assert.equal((await postgresRepository.listImportExecutions({ filters: { executionId: importExecution.executionId } }))[0].executionId, importExecution.executionId);
assert.equal((await postgresRepository.loadState()).operationLogs.length, 3);
assert(queryCalls.some((call) => call.text.includes("master_data_import_review_drafts")));

console.log("master-data import review repository check passed");
