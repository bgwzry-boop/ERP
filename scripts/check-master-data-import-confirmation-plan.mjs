import assert from "node:assert/strict";
import { buildMasterDataImportTemplateWorkbook } from "../src/domain/masterDataImportTemplate.js";
import { precheckMasterDataImportWorkbook } from "../src/domain/masterDataImportPrecheck.js";
import {
  createMasterDataImportReviewDraft,
} from "../src/domain/masterDataImportReviewQueue.js";
import {
  MASTER_DATA_IMPORT_CONFIRMATION_PLAN_VERSION,
  canCreateMasterDataImportConfirmationPlan,
  createMasterDataImportConfirmationPlan,
  getMasterDataImportConfirmationPlanSummary,
} from "../src/domain/masterDataImportConfirmationPlan.js";

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
const readyPlan = createMasterDataImportConfirmationPlan({
  reviewDraft: readyDraft,
  createdBy: "办公室A",
  createdAt: generatedAt,
});

assert.equal(readyPlan.version, MASTER_DATA_IMPORT_CONFIRMATION_PLAN_VERSION);
assert.equal(readyPlan.status, "ready_for_final_confirmation");
assert.equal(readyPlan.statusLabel, "待最终确认");
assert.equal(readyPlan.officialImportEnabled, false);
assert.equal(readyPlan.transactionPolicy.required, true);
assert.equal(readyPlan.transactionPolicy.rollbackOnAnyFailedRow, true);
assert.equal(readyPlan.transactionPolicy.failedRowDownloadRequired, true);
assert.equal(readyPlan.operationLogDraft.action, "master_data_import_confirmation_plan_created");
assert.equal(readyPlan.summary.dataRowCount, 5);
assert.equal(readyPlan.summary.sheetCount, 5);
assert.equal(readyPlan.summary.stagedRowCount, 5);
assert.equal(readyPlan.employeeRoleCoverage.coverageLabel, "1/8");
assert.equal(readyPlan.employeeRoleCoverage.missingRoleCount, 7);
assert.equal(readyPlan.summary.employeeRoleCoverageLabel, "1/8");
assert.equal(readyPlan.employeePayrollAttendanceCoverage.coverageLabel, "1/1");
assert.equal(readyPlan.employeePayrollAttendanceCoverage.complete, true);
assert.equal(readyPlan.summary.employeePayrollAttendanceCoverageLabel, "1/1");
assert.equal(readyPlan.stagedRows.length, 5);
assert(readyPlan.stagedRows.some((sheet) => sheet.sheetKey === "employees_machines" && sheet.rows[0].values["员工姓名"] === "王师傅"));
assert(readyPlan.writeBatches.some((batch) => batch.sheetKey === "inventory_items" && batch.targetTables.includes("inventory_ledger_entries")));
assert(readyPlan.writeBatches.some((batch) => batch.sheetKey === "price_tables" && batch.writeMode === "insert_pending_review"));
assert(readyPlan.targetTables.includes("customers"));
assert(readyPlan.targetTables.includes("price_table_items"));
assert(readyPlan.targetTables.includes("standard_colors"));
assert.match(getMasterDataImportConfirmationPlanSummary(readyPlan), /待最终确认 · 5 行/);
assert.match(getMasterDataImportConfirmationPlanSummary(readyPlan), /岗位 1\/8/);
assert.equal(canCreateMasterDataImportConfirmationPlan(readyDraft), true);

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
const warningDraft = createMasterDataImportReviewDraft({
  precheckResult: warningPrecheck,
  requestedBy: "办公室A",
  createdAt: generatedAt,
});
const warningPlan = createMasterDataImportConfirmationPlan({
  reviewDraft: warningDraft,
  createdBy: "办公室A",
  createdAt: generatedAt,
});
assert.equal(warningPlan.status, "manual_review_required");
assert.equal(warningPlan.statusLabel, "需先复核");
assert.equal(warningPlan.summary.requiresManualReview, true);
assert.equal(canCreateMasterDataImportConfirmationPlan(warningDraft), true);

const blockedDraft = createMasterDataImportReviewDraft({
  precheckResult: {
    ...passedPrecheck,
    summary: {
      ...passedPrecheck.summary,
      status: "blocked",
      errorCount: 1,
      warningCount: 0,
      importAllowed: false,
    },
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
  },
  requestedBy: "办公室A",
  createdAt: generatedAt,
});

assert.equal(canCreateMasterDataImportConfirmationPlan(blockedDraft), false);
assert.throws(
  () => createMasterDataImportConfirmationPlan({ reviewDraft: blockedDraft, createdBy: "办公室A", createdAt: generatedAt }),
  /无阻断项/,
);

console.log("master-data import confirmation plan passed");
