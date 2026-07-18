import assert from "node:assert/strict";
import {
  buildLiveMasterDataImportConfirmationPlan,
  buildLiveMasterDataImportExecution,
  buildLiveMasterDataImportOperationLog,
  buildLiveMasterDataImportReviewDraft,
  buildLiveMasterDataImportReviewExecution,
  buildLiveMasterDataImportReviewExecutionOperationLog,
  buildLiveMasterDataImportReviewPlanOperationLog,
} from "./helpers/postgresLiveMasterDataFixtures.mjs";

const execution = buildLiveMasterDataImportExecution();
const targetRecords = execution.importPayload.targetRecords;
const targetRecordCount = Object.values(targetRecords).reduce((total, records) => total + records.length, 0);

assert.equal(execution.status, "ready_for_transaction_writer");
assert.equal(execution.officialWriterKind, "postgres");
assert.equal(execution.officialWriteAttempted, false);
assert.equal(execution.transactionStarted, false);
assert.equal(execution.summary.targetTableCount, 16);
assert.equal(execution.summary.targetRecordCount, 16);
assert.equal(targetRecordCount, 16);
assert.equal(targetRecords.customers[0].id, "C-MD-LIVE-001");
assert.equal(targetRecords.inventoryLedgerEntries[0].sourceId, execution.executionId);
assert.equal(targetRecords.employees[0].defaultMachineId, targetRecords.machines[0].id);
assert.equal(targetRecords.machineCapacityBaselines[0].machineId, targetRecords.machines[0].id);
assert.equal(targetRecords.machineCapacityBaselines[0].dailyCapacityQty, 12000);

const reviewDraft = buildLiveMasterDataImportReviewDraft();
const confirmationPlan = buildLiveMasterDataImportConfirmationPlan(reviewDraft);
const reviewExecution = buildLiveMasterDataImportReviewExecution(confirmationPlan);

assert.equal(reviewDraft.canEnterReviewQueue, true);
assert.equal(reviewDraft.employeeRoleCoverage.coverageLabel, "1/8");
assert.equal(reviewDraft.employeeRoleCoverage.complete, false);
assert.equal(confirmationPlan.draftId, reviewDraft.draftId);
assert.equal(confirmationPlan.employeeRoleCoverage, reviewDraft.employeeRoleCoverage);
assert.equal(confirmationPlan.officialImportEnabled, false);
assert.equal(reviewExecution.planId, confirmationPlan.planId);
assert.equal(reviewExecution.officialWriteAttempted, true);
assert.equal(reviewExecution.officialWriteScope, "master_data_import_v1");

const planLog = buildLiveMasterDataImportReviewPlanOperationLog(confirmationPlan.planId);
const executionLog = buildLiveMasterDataImportReviewExecutionOperationLog(reviewExecution.executionId);
const importLog = buildLiveMasterDataImportOperationLog(execution.executionId);

assert.equal(planLog.targetId, confirmationPlan.planId);
assert.equal(planLog.after.planId, confirmationPlan.planId);
assert.equal(executionLog.targetId, reviewExecution.executionId);
assert.equal(executionLog.after.executionId, reviewExecution.executionId);
assert.equal(importLog.targetId, execution.executionId);
assert.equal(importLog.after.officialWriteScope, "master_data_import_v1");
assert.equal(planLog.operatorId, "U-OFFICE-A");

console.log("PostgreSQL live master-data fixture checks passed: import targets, review flow, transaction intent, and audit links are stable.");
