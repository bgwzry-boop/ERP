import assert from "node:assert/strict";
import {
  MASTER_DATA_IMPORT_TEMPLATE_VERSION,
  buildMasterDataImportTemplateWorkbook,
} from "../src/domain/masterDataImportTemplate.js";
import {
  MASTER_DATA_IMPORT_PRECHECK_VERSION,
  precheckMasterDataImportWorkbook,
} from "../src/domain/masterDataImportPrecheck.js";
import {
  MASTER_DATA_IMPORT_REVIEW_VERSION,
  canCreateMasterDataImportReviewDraft,
  createMasterDataImportReviewDraft,
  getMasterDataImportReviewDraftSummary,
} from "../src/domain/masterDataImportReviewQueue.js";

const generatedAt = "2026-07-03T10:30:00.000Z";
const workbook = buildMasterDataImportTemplateWorkbook({
  templateKey: "all",
  includeFixtureRows: true,
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

assert.equal(readyDraft.version, MASTER_DATA_IMPORT_REVIEW_VERSION);
assert.equal(readyDraft.precheckVersion, MASTER_DATA_IMPORT_PRECHECK_VERSION);
assert.equal(readyDraft.templateVersion, MASTER_DATA_IMPORT_TEMPLATE_VERSION);
assert.equal(readyDraft.status, "ready_for_import_confirmation");
assert.equal(readyDraft.statusLabel, "待确认导入");
assert.equal(readyDraft.canEnterReviewQueue, true);
assert.equal(readyDraft.officialImportEnabled, false);
assert.equal(readyDraft.summary.dataRowCount, 5);
assert.equal(readyDraft.summary.sheetCount, 5);
assert.equal(readyDraft.summary.errorCount, 0);
assert.equal(readyDraft.summary.warningCount, 0);
assert.equal(readyDraft.employeeRoleCoverage.coverageLabel, "1/8");
assert.equal(readyDraft.employeeRoleCoverage.missingRoleCount, 7);
assert.equal(readyDraft.summary.employeeRoleCoverageLabel, "1/8");
assert.equal(readyDraft.employeePayrollAttendanceCoverage.coverageLabel, "1/1");
assert.equal(readyDraft.employeePayrollAttendanceCoverage.complete, true);
assert.equal(readyDraft.summary.employeePayrollAttendanceCoverageLabel, "1/1");
assert.equal(readyDraft.sheets.length, 5);
assert.equal(readyDraft.stagedRows.length, 5);
assert(readyDraft.stagedRows.some((sheet) => sheet.sheetKey === "price_tables" && sheet.rows[0].values["价格表名称"] === "袋子价格表1"));
assert.match(readyDraft.draftId, /^MDI-20260703-[0-9A-Z]{6}$/);
assert(getMasterDataImportReviewDraftSummary(readyDraft).includes("待确认导入"));
assert(getMasterDataImportReviewDraftSummary(readyDraft).includes("岗位 1/8"));
assert.equal(canCreateMasterDataImportReviewDraft(passedPrecheck), true);

const sameReadyDraft = createMasterDataImportReviewDraft({
  precheckResult: passedPrecheck,
  requestedBy: "办公室A",
  createdAt: generatedAt,
});
assert.equal(sameReadyDraft.draftId, readyDraft.draftId, "same precheck input should produce a stable draft id");

const warningPrecheck = {
  ...passedPrecheck,
  summary: {
    ...passedPrecheck.summary,
    status: "review",
    statusLabel: "需人工确认",
    warningCount: 1,
    issueCount: 1,
  },
  issues: [
    {
      severity: "warning",
      severityLabel: "需确认",
      sheet: "价格表",
      row: 3,
      field: "单价",
      message: "单价明显偏高，导入前需要人工确认价格表。",
    },
  ],
};
const reviewDraft = createMasterDataImportReviewDraft({
  precheckResult: warningPrecheck,
  requestedBy: "办公室A",
  createdAt: generatedAt,
});
assert.equal(reviewDraft.status, "pending_review");
assert.equal(reviewDraft.statusLabel, "待人工确认");
assert.equal(reviewDraft.canEnterReviewQueue, true);
assert.equal(reviewDraft.summary.requiresManualReview, true);
assert.equal(canCreateMasterDataImportReviewDraft(warningPrecheck), true);

const blockedPrecheck = {
  version: MASTER_DATA_IMPORT_PRECHECK_VERSION,
  templateVersion: MASTER_DATA_IMPORT_TEMPLATE_VERSION,
  fileName: "invalid-master-data.xlsx",
  checkedAt: generatedAt,
  summary: {
    status: "blocked",
    dataRowCount: 1,
    sheetCount: 1,
    checkedSheetCount: 1,
    errorCount: 1,
    warningCount: 0,
    issueCount: 1,
    importAllowed: false,
  },
  sheets: [
    {
      key: "customers",
      label: "客户档案",
      worksheetName: "客户档案",
      status: "error",
      dataRowCount: 1,
      issues: [{ severity: "error" }],
    },
  ],
  issues: [
    {
      severity: "error",
      severityLabel: "阻断",
      sheet: "客户档案",
      row: 3,
      field: "客户名称",
      message: "客户名称 不能为空。",
    },
  ],
};
const blockedDraft = createMasterDataImportReviewDraft({
  precheckResult: blockedPrecheck,
  requestedBy: "办公室A",
  createdAt: generatedAt,
});
assert.equal(blockedDraft.status, "blocked");
assert.equal(blockedDraft.statusLabel, "存在阻断");
assert.equal(blockedDraft.canEnterReviewQueue, false);
assert.equal(blockedDraft.summary.importAllowed, false);
assert.equal(canCreateMasterDataImportReviewDraft(blockedPrecheck), false);

console.log("master-data import review queue passed");
