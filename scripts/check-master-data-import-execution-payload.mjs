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
import { resolveImportedMasterDataMachineId } from "../shared/masterDataMachineIdentity.js";

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
assert(payload.targetRecords.machines.some((record) => record.id === "M-01" && record.name === "1号制袋机" && record.workshop === "1号车间"));
assert(payload.targetRecords.employees.some((record) => record.defaultMachineId === "M-01"));
assert.equal(resolveImportedMasterDataMachineId({ machineName: "1号机", workshop: "1号车间" }), "BAG-01");
assert.equal(resolveImportedMasterDataMachineId({ machineName: "9号制袋机", workshop: "3号车间" }), "BAG-09");
assert(payload.targetRecords.employeeMachineAssignments.some((record) => record.assignmentType === "default"));
assert(payload.targetRecords.machineCapacityBaselines.some((record) => (
  record.dailyCapacityQty === 12000
    && record.sourceKind === "manual_estimate"
    && record.confidence === "low"
)));

const employeeRolePayload = buildMasterDataImportExecutionPayload({
  planId: "MDP-ROLE-COVERAGE",
  draftId: "MDI-ROLE-COVERAGE",
  stagedRows: [{
    sheetKey: "employees_machines",
    worksheetName: "员工机台",
    rows: [
      { rowNumber: 3, values: { 员工编号: "EMP-OFFICE-001", 员工姓名: "陈文员", 角色: "办公室", 附加角色: "财务 / 对账", 默认车间: "", 默认机台: "", 启用状态: "启用" } },
      { rowNumber: 4, values: { 员工编号: "EMP-WORKSHOP-001", 员工姓名: "李师傅", 角色: "车间报工", 默认车间: "", 默认机台: "", 启用状态: "启用" } },
      { rowNumber: 5, values: { 员工编号: "EMP-UNKNOWN-001", 员工姓名: "未知员工", 角色: "未知岗位", 启用状态: "启用" } },
      { rowNumber: 6, values: { 员工编号: "emp-office-001", 员工姓名: "重复员工", 角色: "办公室", 启用状态: "启用" } },
      { rowNumber: 7, values: { 员工编号: "", 员工姓名: "缺编号员工", 角色: "办公室", 启用状态: "启用" } },
      { rowNumber: 8, values: { 员工编号: "员工 001", 员工姓名: "非法编号员工", 角色: "办公室", 启用状态: "启用" } },
    ],
  }],
});
assert.equal(employeeRolePayload.summary.writableRowCount, 2);
assert.equal(employeeRolePayload.summary.failedRowCount, 4);
assert(employeeRolePayload.targetRecords.employees.some((record) => record.id === "EMP-OFFICE-001" && record.defaultWorkshop === ""));
assert.deepEqual(
  employeeRolePayload.targetRecords.employees.find((record) => record.id === "EMP-OFFICE-001")?.roleKeys,
  ["office", "finance"],
);
assert.equal(
  employeeRolePayload.targetRecords.employees.find((record) => record.id === "EMP-OFFICE-001")?.roleName,
  "办公室；财务 / 对账",
);
assert(employeeRolePayload.targetRecords.employees.some((record) => record.id === "EMP-WORKSHOP-001" && record.defaultMachineId === ""));
assert(employeeRolePayload.failedRows.some((row) => row.reason.includes("角色无法映射到V1正式岗位")));
assert(employeeRolePayload.failedRows.some((row) => row.reason.includes("员工编号重复")));
assert(employeeRolePayload.failedRows.some((row) => row.reason.includes("员工编号、员工姓名和角色必须完整")));
assert(employeeRolePayload.failedRows.some((row) => row.reason.includes("员工编号须为1-32位")));

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
