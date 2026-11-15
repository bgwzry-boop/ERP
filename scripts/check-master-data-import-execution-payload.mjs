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
import { buildDefaultMasterDataMachines } from "../server/masterDataMachineConfigurationRepository.mjs";

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
    && record.birthDate === "1990-03-01"
    && record.hireDate === "2020-02-01"
    && record.attendanceProvider === "deli"
    && record.attendanceExternalId === "DL-1001"
    && record.accountEnabled === false
    && record.profileStatus === "pending_admin_review"
)));
assert(payload.targetRecords.machines.some((record) => record.id === "BAG-01" && record.name === "1号制袋机" && record.workshop === "1号车间"));
assert(payload.targetRecords.employees.some((record) => record.defaultMachineId === "BAG-01"));
assert.equal(resolveImportedMasterDataMachineId({ machineName: "1号机", workshop: "1号车间" }), "BAG-01");
assert.equal(resolveImportedMasterDataMachineId({ machineName: "9号制袋机", workshop: "3号车间" }), "BAG-09");

function machinePayload(rows, configuredMachines) {
  return buildMasterDataImportExecutionPayload({
    planId: "MDP-MACHINE-IDENTITY",
    stagedRows: [{
      sheetKey: "employees_machines",
      worksheetName: "员工机台",
      rows: rows.map((values, index) => ({
        rowNumber: index + 3,
        values: { 员工编号: `EMP-FICTITIOUS-${index + 1}`, 员工姓名: `测试人员${index + 1}`, 角色: "车间报工", ...values },
      })),
    }],
  }, { configuredMachines });
}

const printMachinePayload = machinePayload(Array.from({ length: 4 }, (_, index) => ({
  默认车间: "丝印车间",
  默认机台: `${index + 1}号丝印机`,
  ...(index % 2 === 0 ? { 机台编号: `PRINT-0${index + 1}` } : {}),
})));
assert.equal(printMachinePayload.summary.failedRowCount, 0);
assert.deepEqual(printMachinePayload.targetRecords.machines.map(({ id, machineType }) => ({ id, machineType })),
  [1, 2, 3, 4].map((number) => ({ id: `PRINT-0${number}`, machineType: "screen_printing" })));
assert.deepEqual(printMachinePayload.targetRecords.employees.map((employee) => employee.defaultMachineId),
  ["PRINT-01", "PRINT-02", "PRINT-03", "PRINT-04"]);
assert.equal(printMachinePayload.targetRecords.machines.some((machine) => machine.id.startsWith("MACH-IMP-")), false);
const defaultCatalog = buildDefaultMasterDataMachines();
const defaultMachinePayload = machinePayload(defaultCatalog.map((machine) => ({
  默认机台: machine.name, 默认车间: machine.workshop,
})));
assert.equal(defaultMachinePayload.summary.failedRowCount, 0);
assert.deepEqual(defaultMachinePayload.targetRecords.machines.map(({ id, name, machineType, workshop }) => ({ id, name, machineType, workshop })),
  defaultCatalog.map(({ id, name, machineType, workshop }) => ({ id, name, machineType, workshop })));

const legacyNamedMachine = machinePayload([{ 默认机台: "1号机", 默认车间: "1号车间" }], [
  { id: "MAINTAINED-BAG", name: "1号制袋机", machineType: "bag_making", workshop: "1号车间" },
]);
assert.equal(legacyNamedMachine.summary.failedRowCount, 0);
assert.equal(legacyNamedMachine.targetRecords.employees[0].defaultMachineId, "MAINTAINED-BAG");
assert.deepEqual(legacyNamedMachine.targetRecords.machines, [], "已维护旧编号及确认的短名称不得再生成第二台机台");

const maintainedMachine = {
  id: "MAINTAINED-1", machineId: "MAINTAINED-1", name: "已维护设备", machineType: "cutting",
  workshop: "裁切车间", status: "maintenance", enabled: false,
  settings: { legacyMachineIds: ["OLD-MACHINE-1"], approvedSetting: "keep" },
};
const preservedMachine = structuredClone(maintainedMachine);
for (const row of [
  { 机台编号: "MAINTAINED-1" },
  { 机台编号: "old-machine-1" },
  { 默认机台: "已维护设备", 默认车间: "裁切车间" },
]) {
  const existingPayload = machinePayload([row], [maintainedMachine]);
  assert.equal(existingPayload.summary.failedRowCount, 0);
  assert.equal(existingPayload.targetRecords.employees[0].defaultMachineId, "MAINTAINED-1");
  assert.equal(existingPayload.targetRecords.employeeMachineAssignments[0].machineId, "MAINTAINED-1");
  assert.deepEqual(existingPayload.targetRecords.machines, [], "员工导入只绑定已维护机台，不覆盖类型、状态或设置");
  assert.deepEqual(maintainedMachine, preservedMachine);
}

const rejectedMachines = machinePayload([
  { 默认机台: "新购丝印设备", 默认车间: "丝印车间" },
  { 机台编号: "PRINT-99", 默认机台: "99号丝印机", 默认车间: "丝印车间" },
  { 机台编号: "PRINT-01", 默认机台: "1号制袋机", 默认车间: "1号车间" },
  { 默认机台: "2号丝印机", 默认车间: "1号车间" },
  { 默认机台: "1号丝印机", 默认车间: "1号车间", 机台车间: "丝印车间" },
  { 默认机台: "1号丝印机", 机台名称: "2号丝印机", 默认车间: "丝印车间" },
]);
assert.equal(rejectedMachines.summary.failedRowCount, 6);
assert.equal(rejectedMachines.summary.writableRowCount, 0);
assert.equal(rejectedMachines.targetRecords.employees.length, 0);
assert.equal(rejectedMachines.targetRecords.machines.length, 0);
assert.equal(rejectedMachines.targetRecords.employeeMachineAssignments.length, 0);
assert.equal(rejectedMachines.failedRowsDownload.required, true);

const mismatchedExisting = machinePayload([
  { 机台编号: "NEW-ID", 默认机台: "已维护设备", 默认车间: "裁切车间" },
  { 机台编号: "MAINTAINED-1", 默认机台: "已维护设备", 默认车间: "错误车间" },
], [maintainedMachine]);
assert.equal(mismatchedExisting.summary.failedRowCount, 2, "编号或车间冲突不能创建重复机台或移动已有机台");

const ambiguousExisting = machinePayload([{ 默认机台: "同名设备", 默认车间: "测试车间" }], [
  { id: "DUP-1", name: "同名设备", machineType: "packing", workshop: "测试车间" },
  { id: "DUP-2", name: "同名设备", machineType: "cutting", workshop: "测试车间" },
]);
assert.equal(ambiguousExisting.summary.failedRowCount, 1);
assert.match(ambiguousExisting.failedRows[0].reason, /不唯一/);
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

const attendanceMappingPayload = buildMasterDataImportExecutionPayload({
  planId: "MDP-ATTENDANCE-MAPPING",
  draftId: "MDI-ATTENDANCE-MAPPING",
  stagedRows: [{
    sheetKey: "employees_machines",
    worksheetName: "员工机台",
    rows: [
      { rowNumber: 3, values: { 员工编号: "EMP-ATT-001", 员工姓名: "员工甲", 角色: "办公室", 出生日期: "1991-01-02", 入职日期: "2020-02-03", 工资岗位键: "PAY-OFFICE", 基础时薪: "12.5", "岗位补贴/小时": "2", 生效日期: "2026-08-01", 考勤来源: "DELI", 考勤人员编号: "D5FN-001" } },
      { rowNumber: 4, values: { 员工编号: "EMP-ATT-002", 员工姓名: "员工乙", 角色: "办公室", 考勤来源: "deli", 考勤人员编号: "D5FN-001" } },
      { rowNumber: 5, values: { 员工编号: "EMP-ATT-003", 员工姓名: "员工丙", 角色: "办公室", 考勤来源: "deli" } },
      { rowNumber: 6, values: { 员工编号: "EMP-ATT-004", 员工姓名: "员工丁", 角色: "办公室", 出生日期: "2026-02-30" } },
    ],
  }],
});
assert.equal(attendanceMappingPayload.summary.writableRowCount, 1);
assert.equal(attendanceMappingPayload.summary.failedRowCount, 3);
assert.equal(attendanceMappingPayload.targetRecords.employees[0].attendanceProvider, "deli");
assert.equal(attendanceMappingPayload.targetRecords.employees[0].baseHourlyWage, 12.5);
assert.equal(attendanceMappingPayload.targetRecords.employees[0].payrollPositionKey, "PAY-OFFICE");
assert(attendanceMappingPayload.failedRows.some((row) => row.reason.includes("考勤身份重复")));
assert(attendanceMappingPayload.failedRows.some((row) => row.reason.includes("必须同时填写")));
assert(attendanceMappingPayload.failedRows.some((row) => row.reason.includes("有效的 YYYY-MM-DD")));

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
