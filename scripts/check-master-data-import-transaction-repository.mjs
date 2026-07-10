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
await checkLocalRollback();
await checkPostgresSqlBoundary();

console.log("master-data import transaction repository passed");

async function buildReadyConfirmationPlan() {
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
  return createMasterDataImportConfirmationPlan({
    reviewDraft: readyDraft,
    createdBy: "办公室A",
    createdAt: generatedAt,
  });
}

async function checkLocalMasterDataImportTransaction() {
  const repository = createLocalMasterDataImportTransactionRepository();
  const workspace = { operationLogs: [] };
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
  assert(workspace.machines.some((record) => record.name === "1号制袋机"));
  assert(workspace.employeeMachineAssignments.some((record) => record.assignmentType === "default"));
  assert(workspace.machineCapacityBaselines.some((record) => record.dailyCapacityQty === 12000));
  assert.equal(workspace.operationLogs[0].id, "LOG-MD-IMPORT-COMMIT-001");
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

  assert.throws(
    () => repository.applyImportExecution({
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
