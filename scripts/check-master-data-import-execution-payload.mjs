import assert from "node:assert/strict";
import { buildMasterDataImportTemplateWorkbook } from "../src/domain/masterDataImportTemplate.js";
import { precheckMasterDataImportWorkbook } from "../src/domain/masterDataImportPrecheck.js";
import { createMasterDataImportReviewDraft } from "../src/domain/masterDataImportReviewQueue.js";
import { createMasterDataImportConfirmationPlan } from "../src/domain/masterDataImportConfirmationPlan.js";
import {
  MASTER_DATA_IMPORT_EXECUTION_PAYLOAD_VERSION,
  buildMasterDataImportExecutionPayload,
} from "../src/domain/masterDataImportExecutionPayload.js";
import {
  MASTER_DATA_IMPORT_EXECUTION_VERSION,
  createMasterDataImportExecution,
} from "../src/domain/masterDataImportExecution.js";

const generatedAt = "2026-07-03T10:30:00.000Z";
const workbook = buildMasterDataImportTemplateWorkbook({
  templateKey: "all",
  generatedAt,
  generatedBy: "office-admin",
});
const passedPrecheck = await precheckMasterDataImportWorkbook({
  bytes: workbook,
  fileName: "erp-master-data-import-template-2026-07-03.xlsx",
  checkedAt: generatedAt,
});
const readyDraft = createMasterDataImportReviewDraft({
  precheckResult: passedPrecheck,
  requestedBy: "办公室A",
  createdAt: generatedAt,
});
const readyPlan = createMasterDataImportConfirmationPlan({
  reviewDraft: readyDraft,
  createdBy: "办公室A",
  createdAt: generatedAt,
});
const payload = buildMasterDataImportExecutionPayload(readyPlan);

assert.equal(payload.version, MASTER_DATA_IMPORT_EXECUTION_PAYLOAD_VERSION);
assert.equal(payload.summary.stagedRowCount, 5);
assert.equal(payload.summary.writableRowCount, 5);
assert.equal(payload.summary.failedRowCount, 0);
assert.equal(payload.failedRowsDownload.required, false);
assert(payload.targetRecords.customers.some((record) => record.name === "张三服饰"));
assert(payload.targetRecords.customerContacts.some((record) => record.phone === "13900000001"));
assert(payload.targetRecords.standardColors.some((record) => record.name === "红色"));
assert(payload.targetRecords.priceTables.some((record) => record.name === "袋子价格表1" && record.status === "pending_review"));
assert(payload.targetRecords.inventoryItems.some((record) => record.onHandQty === 2480));
assert(payload.targetRecords.inventoryLedgerEntries.some((record) => record.changeType === "initial_import"));
assert(payload.targetRecords.employees.some((record) => (
  record.name === "王师傅"
    && record.accountEnabled === false
    && record.profileStatus === "pending_admin_review"
)));
assert(payload.targetRecords.machines.some((record) => record.name === "1号制袋机" && record.workshop === "1号车间"));
assert(payload.targetRecords.employeeMachineAssignments.some((record) => record.assignmentType === "default"));
assert(payload.targetRecords.machineCapacityBaselines.some((record) => (
  record.dailyCapacityQty === 12000
    && record.sourceKind === "manual_estimate"
    && record.confidence === "low"
)));

const execution = createMasterDataImportExecution({
  confirmationPlan: readyPlan,
  requestedBy: "管理A",
  requestedAt: generatedAt,
});

assert.equal(execution.version, MASTER_DATA_IMPORT_EXECUTION_VERSION);
assert.equal(execution.status, "blocked_official_writer_not_configured");
assert.equal(execution.statusLabel, "未接正式写入");
assert.equal(execution.importPayloadVersion, MASTER_DATA_IMPORT_EXECUTION_PAYLOAD_VERSION);
assert.equal(execution.summary.stagedRowCount, 5);
assert.equal(execution.summary.writableRowCount, 5);
assert.equal(execution.summary.failedRowCount, 0);
assert.equal(execution.officialWriteAttempted, false);
assert.equal(execution.failedRowsDownload.required, false);
assert(execution.blockingReasons.some((reason) => reason.includes("正式主数据 PostgreSQL 写入器尚未配置")));

const oldPlanWithoutRows = {
  ...readyPlan,
  stagedRows: [],
  summary: {
    ...readyPlan.summary,
    stagedRowCount: 0,
  },
};
const missingRowsExecution = createMasterDataImportExecution({
  confirmationPlan: oldPlanWithoutRows,
  requestedBy: "管理A",
  requestedAt: generatedAt,
});
assert.equal(missingRowsExecution.status, "blocked_import_rows_missing");
assert(missingRowsExecution.blockingReasons.some((reason) => reason.includes("缺少经过预检查的行数据")));

console.log("master-data import execution payload passed");
