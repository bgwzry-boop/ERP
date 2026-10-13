import assert from "node:assert/strict";
import { buildMasterDataImportTemplateWorkbook } from "../src/domain/masterDataImportTemplate.js";
import { precheckMasterDataImportWorkbook } from "../src/domain/masterDataImportPrecheck.js";
import { createMasterDataImportReviewDraft } from "../src/domain/masterDataImportReviewQueue.js";
import { createMasterDataImportConfirmationPlan } from "../src/domain/masterDataImportConfirmationPlan.js";
import { createMasterDataImportExecution } from "../src/domain/masterDataImportExecution.js";
import {
  buildMasterDataImportTransactionQuery,
  buildMasterDataImportTransactionSql,
  createLocalMasterDataImportTransactionRepository,
  createPostgresMasterDataImportTransactionRepository,
} from "../server/masterDataImportTransactionRepository.mjs";

const generatedAt = "2026-07-03T10:30:00.000Z";
const readyPlan = await buildReadyConfirmationPlan();
const readyExecution = createMasterDataImportExecution({
  confirmationPlan: readyPlan,
  requestedBy: "管理A",
  requestedAt: generatedAt,
  officialImportEnabled: true,
  officialWriterKind: "local_transaction",
});

assert.equal(readyExecution.status, "ready_for_transaction_writer");
assert.equal(readyExecution.officialImportEnabled, true);
assert.equal(readyExecution.officialWriteScope, "master_data_import_v1");

await checkLocalMasterDataImportTransaction();
await checkLocalEmployeeProfileReimportPreservesAccountLifecycle();
await checkLocalAttendanceIdentityConflictRollback();
await checkDepartedEmployeeProfileImportBlocked();
await checkLocalRollback();
await checkLocalEmployeeIdentityRollback();
await checkLocalIdentityPersistenceRollback();
await checkLocalMachinePersistenceCompensation();
await checkPostgresSqlBoundary();

console.log("master-data import transaction repository passed");

async function buildReadyConfirmationPlan() {
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
  return createMasterDataImportConfirmationPlan({
    reviewDraft: readyDraft,
    createdBy: "办公室A",
    createdAt: generatedAt,
  });
}

async function checkLocalMasterDataImportTransaction() {
  const repository = createLocalMasterDataImportTransactionRepository();
  const savedEmployeeCounts = [];
  const workspace = {
    operationLogs: [],
    runtimeIdentityRepository: {
      kind: "local_json",
      saveState({ workspace: savedWorkspace }) {
        savedEmployeeCounts.push(savedWorkspace.employees?.length ?? 0);
      },
    },
  };
  const transaction = await repository.applyImportExecution({
    workspace,
    importExecution: readyExecution,
    operationLog: buildOperationLog("LOG-MD-IMPORT-COMMIT-001"),
  });

  assert.equal(transaction.importExecution.status, "committed");
  assert.equal(transaction.importExecution.statusLabel, "已正式导入");
  assert.equal(transaction.importExecution.officialWriteAttempted, true);
  assert.equal(transaction.importExecution.transactionStarted, true);
  assert.equal(transaction.importExecution.transactionSummary.repositoryKind, "local_memory");
  assert.equal(transaction.importExecution.summary.transactionRecordCount, readyExecution.summary.targetRecordCount);
  assert(workspace.customers.some((record) => record.name === "张三服饰"));
  assert(workspace.customerContacts.some((record) => record.phone === "13900000001"));
  assert(workspace.standardColors.some((record) => record.name === "红色"));
  assert(workspace.priceTables.some((record) => record.status === "pending_review"));
  assert(workspace.priceTableItems.some((record) => record.enabled === false));
  assert(workspace.inventoryItems.some((record) => record.onHandQty === 2480));
  assert(workspace.inventoryLedgerEntries.some((record) => record.changeType === "initial_import"));
  assert(workspace.inventories.some((record) => record.inStock === 2480));
  assert(workspace.employees.some((record) => record.accountEnabled === false && record.profileStatus === "pending_admin_review"));
  assert(workspace.employees.some((record) => record.birthDate === "1990-03-01" && record.hireDate === "2020-02-01"));
  assert(workspace.employees.some((record) => record.attendanceProvider === "deli" && record.attendanceExternalId === "DL-1001"));
  assert(workspace.machines.some((record) => record.name === "1号制袋机"));
  assert(workspace.employeeMachineAssignments.some((record) => record.assignmentType === "default"));
  assert(workspace.machineCapacityBaselines.some((record) => record.dailyCapacityQty === 12000));
  assert.equal(workspace.operationLogs[0].id, "LOG-MD-IMPORT-COMMIT-001");
  assert.deepEqual(savedEmployeeCounts, [readyExecution.importPayload.targetRecords.employees.length]);
}

async function checkLocalEmployeeProfileReimportPreservesAccountLifecycle() {
  const repository = createLocalMasterDataImportTransactionRepository();
  const importedEmployee = readyExecution.importPayload.targetRecords.employees[0];
  const blankProfileExecution = {
    ...readyExecution,
    executionId: "MDE-PROFILE-REIMPORT",
    importPayload: {
      ...readyExecution.importPayload,
      targetRecords: {
        ...readyExecution.importPayload.targetRecords,
        employees: readyExecution.importPayload.targetRecords.employees.map((employee) => ({
          ...employee,
          birthDate: "",
          hireDate: "",
          payrollPositionKey: "",
          baseHourlyWage: 0,
          positionAllowanceHourly: 0,
          wageEffectiveFrom: "",
          attendanceProvider: "",
          attendanceExternalId: "",
          profileFieldPresence: {},
        })),
      },
    },
  };
  const workspace = {
    employees: [{
      ...importedEmployee,
      userId: "U-EMP-IMPORT-001",
      accountEnabled: true,
      profileStatus: "account_enabled",
      requestedEnabled: true,
      birthDate: "1980-04-05",
      hireDate: "2019-06-07",
      payrollPositionKey: "PAY-OFFICE",
      baseHourlyWage: 18,
      positionAllowanceHourly: 3,
      wageEffectiveFrom: "2025-01-01",
      attendanceProvider: "deli",
      attendanceExternalId: "D5FN-EXISTING",
    }],
    operationLogs: [],
  };
  await repository.applyImportExecution({
    workspace,
    importExecution: blankProfileExecution,
    operationLog: buildOperationLog("LOG-MD-PROFILE-REIMPORT"),
  });
  const employee = workspace.employees.find((record) => record.id === importedEmployee.id);
  assert.equal(employee.userId, "U-EMP-IMPORT-001");
  assert.equal(employee.accountEnabled, true);
  assert.equal(employee.profileStatus, "account_enabled");
  assert.equal(employee.birthDate, "1980-04-05");
  assert.equal(employee.hireDate, "2019-06-07");
  assert.equal(employee.payrollPositionKey, "PAY-OFFICE");
  assert.equal(employee.baseHourlyWage, 18);
  assert.equal(employee.attendanceExternalId, "D5FN-EXISTING");
}

async function checkLocalAttendanceIdentityConflictRollback() {
  const repository = createLocalMasterDataImportTransactionRepository();
  const existingEmployee = {
    id: "ERP-OTHER-001",
    bizNo: "ERP-OTHER-001",
    name: "既有考勤员工",
    roleName: "办公室",
    attendanceProvider: "DELI",
    attendanceExternalId: "DL-1001",
  };
  const workspace = { employees: [existingEmployee], operationLogs: [] };
  await assert.rejects(
    repository.applyImportExecution({
      workspace,
      importExecution: readyExecution,
      operationLog: buildOperationLog("LOG-MD-ATTENDANCE-CONFLICT"),
    }),
    /duplicate attendance identity: deli \/ DL-1001/,
  );
  assert.deepEqual(workspace.employees, [existingEmployee]);
  assert.deepEqual(workspace.operationLogs, []);
}

async function checkDepartedEmployeeProfileImportBlocked() {
  const repository = createLocalMasterDataImportTransactionRepository();
  const importedEmployee = readyExecution.importPayload.targetRecords.employees[0];
  const departedEmployee = {
    ...importedEmployee,
    profileStatus: "departed",
    accountEnabled: false,
    attendanceProvider: "",
    attendanceExternalId: "",
  };
  const workspace = { employees: [departedEmployee], operationLogs: [] };
  await assert.rejects(
    repository.applyImportExecution({
      workspace,
      importExecution: readyExecution,
      operationLog: buildOperationLog("LOG-MD-DEPARTED-PROFILE-BLOCKED"),
    }),
    /not eligible for active profile import: EMP-IMPORT-001/,
  );
  assert.deepEqual(workspace.employees, [departedEmployee]);
  assert.deepEqual(workspace.operationLogs, []);
}

async function checkLocalRollback() {
  const repository = createLocalMasterDataImportTransactionRepository();
  const workspace = { operationLogs: [] };
  const brokenExecution = {
    ...readyExecution,
    executionId: "MDE-ROLLBACK-CHECK",
    importPayload: {
      ...readyExecution.importPayload,
      targetRecords: {
        ...readyExecution.importPayload.targetRecords,
        priceTables: [],
      },
    },
  };

  await assert.rejects(
    repository.applyImportExecution({
      workspace,
      importExecution: brokenExecution,
      operationLog: buildOperationLog("LOG-MD-IMPORT-ROLLBACK-001"),
    }),
    /priceTableItems\..*priceTableId references missing record/,
  );

  assert.deepEqual(workspace.operationLogs, []);
  assert.equal(workspace.customers, undefined);
  assert.equal(workspace.inventoryItems, undefined);
  assert.equal(workspace.employees, undefined);
}

async function checkLocalEmployeeIdentityRollback() {
  const repository = createLocalMasterDataImportTransactionRepository();
  const existingEmployee = {
    id: "emp-import-001",
    bizNo: "emp-import-001",
    name: "既有员工",
    roleName: "办公室",
  };
  const workspace = { employees: [existingEmployee], operationLogs: [] };
  await assert.rejects(
    repository.applyImportExecution({
      workspace,
      importExecution: readyExecution,
      operationLog: buildOperationLog("LOG-MD-EMPLOYEE-IDENTITY-CONFLICT"),
    }),
    /conflicts with existing employee number: EMP-IMPORT-001/,
  );
  assert.deepEqual(workspace.employees, [existingEmployee]);
  assert.deepEqual(workspace.operationLogs, []);

  const invalidIdentityExecution = {
    ...readyExecution,
    executionId: "MDE-INVALID-EMPLOYEE-IDENTITY",
    importPayload: {
      ...readyExecution.importPayload,
      targetRecords: {
        ...readyExecution.importPayload.targetRecords,
        employees: readyExecution.importPayload.targetRecords.employees.map((employee) => ({
          ...employee,
          id: "员工 001",
          bizNo: "员工 001",
        })),
      },
    },
  };
  await assert.rejects(
    repository.applyImportExecution({
      workspace: { operationLogs: [] },
      importExecution: invalidIdentityExecution,
      operationLog: buildOperationLog("LOG-MD-INVALID-EMPLOYEE-IDENTITY"),
    }),
    /invalid stable employee number/,
  );
}

async function checkLocalIdentityPersistenceRollback() {
  const repository = createLocalMasterDataImportTransactionRepository();
  const workspace = {
    operationLogs: [],
    runtimeIdentityRepository: {
      kind: "local_json",
      saveState() {
        throw new Error("identity persistence unavailable");
      },
    },
  };

  await assert.rejects(
    repository.applyImportExecution({
      workspace,
      importExecution: readyExecution,
      operationLog: buildOperationLog("LOG-MD-IDENTITY-PERSISTENCE-ROLLBACK"),
    }),
    /identity persistence unavailable/,
  );
  assert.deepEqual(workspace.operationLogs, []);
  assert.equal(workspace.employees, undefined);
  assert.equal(workspace.machines, undefined);
}

async function checkLocalMachinePersistenceCompensation() {
  const repository = createLocalMasterDataImportTransactionRepository();
  const identitySnapshots = [];
  const machineSnapshots = [];
  let machineSaveCount = 0;
  const workspace = {
    operationLogs: [],
    runtimeIdentityRepository: {
      kind: "local_json",
      saveState({ workspace: savedWorkspace }) {
        identitySnapshots.push(savedWorkspace.employees?.length ?? -1);
      },
    },
    masterDataMachineConfigurationRepository: {
      saveState({ workspace: savedWorkspace }) {
        machineSaveCount += 1;
        if (machineSaveCount === 1) throw new Error("machine persistence unavailable");
        machineSnapshots.push(savedWorkspace.machines?.length ?? -1);
      },
    },
  };

  await assert.rejects(
    repository.applyImportExecution({
      workspace,
      importExecution: readyExecution,
      operationLog: buildOperationLog("LOG-MD-MACHINE-PERSISTENCE-ROLLBACK"),
    }),
    /machine persistence unavailable/,
  );
  assert.deepEqual(identitySnapshots, [readyExecution.importPayload.targetRecords.employees.length, -1]);
  assert.deepEqual(machineSnapshots, [-1]);
  assert.deepEqual(workspace.operationLogs, []);
  assert.equal(workspace.employees, undefined);
  assert.equal(workspace.machines, undefined);
}

async function checkPostgresSqlBoundary() {
  const calls = [];
  const repository = createPostgresMasterDataImportTransactionRepository({
    queryJson(text, values) {
      calls.push({ text, values });
      return {
        executionId: readyExecution.executionId,
        status: "committed",
        recordCount: readyExecution.summary.targetRecordCount,
        affectedTableCount: readyExecution.summary.targetTableCount,
        operationLogId: "LOG-MD-IMPORT-PG-001",
      };
    },
  });
  const postgresExecution = {
    ...readyExecution,
    officialWriterKind: "postgres",
  };
  const workspace = { operationLogs: [] };
  const transaction = await repository.applyImportExecution({
    workspace,
    importExecution: postgresExecution,
    operationLog: buildOperationLog("LOG-MD-IMPORT-PG-001"),
  });

  assert.equal(transaction.importExecution.status, "committed");
  assert.equal(transaction.importExecution.transactionSummary.repositoryKind, "postgres");
  assert(workspace.priceTables.some((record) => record.name === "袋子价格表1"));

  const builtQuery = calls[0];
  assert.match(builtQuery.text, /^BEGIN;/);
  assert.match(builtQuery.text, /INSERT INTO customers/);
  assert.match(builtQuery.text, /INSERT INTO customer_contacts/);
  assert.match(builtQuery.text, /INSERT INTO standard_colors/);
  assert.match(builtQuery.text, /INSERT INTO price_tables/);
  assert.match(builtQuery.text, /INSERT INTO price_table_items/);
  assert.match(builtQuery.text, /INSERT INTO inventory_items/);
  assert.match(builtQuery.text, /INSERT INTO inventory_ledger_entries/);
  assert.match(builtQuery.text, /INSERT INTO employees/);
  assert.match(builtQuery.text, /birth_date/);
  assert.match(builtQuery.text, /payroll_position_key/);
  assert.match(builtQuery.text, /attendance_provider/);
  assert.doesNotMatch(builtQuery.text, /account_enabled = EXCLUDED\.account_enabled/);
  assert.doesNotMatch(builtQuery.text, /profile_status = EXCLUDED\.profile_status/);
  assert.match(builtQuery.text, /INSERT INTO machines/);
  assert.match(builtQuery.text, /INSERT INTO employee_machine_assignments/);
  assert.match(builtQuery.text, /INSERT INTO machine_capacity_baselines/);
  assert.match(builtQuery.text, /INSERT INTO operation_logs/);
  assert.ok(!builtQuery.text.includes("pending_admin_review"));
  assert.equal(builtQuery.values.includes("pending_admin_review"), true);
  assert.match(builtQuery.text, /COMMIT;/);

  const directSql = buildMasterDataImportTransactionSql({
    importExecution: postgresExecution,
    operationLog: buildOperationLog("LOG-MD-IMPORT-PG-DIRECT"),
  });
  assert.ok(!directSql.includes("master_data_import_v1"));
  assert.match(directSql, /json_build_object/);
  const directQuery = buildMasterDataImportTransactionQuery({
    importExecution: postgresExecution,
    operationLog: buildOperationLog("LOG-MD-IMPORT-PG-DIRECT"),
  });
  assert.ok(!directQuery.text.includes("master_data_import_v1"));
  assert.equal(directQuery.values.some((value) => String(value).includes("master_data_import_v1")), true);
}

function buildOperationLog(id) {
  return {
    id,
    targetType: "master_data_import_execution",
    targetId: readyExecution.executionId,
    action: "master_data_import_execution_committed",
    before: { status: "ready_for_transaction_writer" },
    after: {
      executionId: readyExecution.executionId,
      officialWriteScope: "master_data_import_v1",
    },
    reason: "基础资料正式导入事务提交",
    operatorId: "U-MANAGER-A",
    pageKey: "master_data",
    occurredAt: generatedAt,
    createdAt: generatedAt,
  };
}
