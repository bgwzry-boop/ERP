import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCreatePrintBatchRecordTransactionQuery,
  buildCreatePrintBatchRecordTransactionSql,
  buildListPrintBatchRecordsQuery,
  buildListPrintBatchRecordsSql,
  createLocalPrintBatchRepository,
  createPostgresPrintBatchRepository,
} from "../server/printBatchRepository.mjs";

await checkLocalPrintBatchRepository();
await checkPostgresPrintBatchSqlBoundary();

console.log(
  "Print batch repository check passed: local JSON persistence and PostgreSQL print batch + operation log SQL are covered.",
);

async function checkLocalPrintBatchRepository() {
  const storageRoot = mkdtempSync(join(tmpdir(), "erp-print-batch-check-"));
  try {
    const repository = createLocalPrintBatchRepository({ storageRoot });
    const workspace = { printBatchRecords: [], operationLogs: [] };
    const printBatchRecord = buildPrintBatchRecord();
    const operationLog = buildOperationLog();

    const transaction = await repository.createPrintBatchRecord({ workspace, printBatchRecord, operationLog });

    assert.equal(transaction.printBatchRecord.printBatchId, "PB-CHECK-1");
    assert.equal(transaction.operationLogId, "LOG-PB-CHECK-1");
    assert.equal(workspace.printBatchRecords.length, 1);
    assert.equal(workspace.operationLogs.length, 1);
    assert.equal((await repository.listPrintBatchRecords({ workspace, filters: { todoId: "T-PRINT-A" } })).length, 1);
    assert.equal((await repository.listPrintBatchRecords({ workspace, filters: { status: "partial" } })).length, 1);
    assert.equal((await repository.listPrintBatchRecords({ workspace, filters: { status: "printed" } })).length, 0);

    const storePath = join(storageRoot, "metadata", "print-batch-records.json");
    assert.equal(existsSync(storePath), true);
    const savedJson = JSON.parse(readFileSync(storePath, "utf8"));
    assert.equal(savedJson.printBatchRecords[0].printBatchId, "PB-CHECK-1");

    const reloadedRepository = createLocalPrintBatchRepository({ storageRoot });
    const reloadedState = reloadedRepository.loadState();
    assert.equal(reloadedState.printBatchRecords.length, 1);
    assert.equal(reloadedState.printBatchRecords[0].pendingPackageIds[0], "PKG-2");
  } finally {
    rmSync(storageRoot, { recursive: true, force: true });
  }
}

async function checkPostgresPrintBatchSqlBoundary() {
  const calls = [];
  const printBatchRecord = buildPrintBatchRecord({ operatorName: "O'Brien" });
  const operationLog = buildOperationLog();
  const repository = createPostgresPrintBatchRepository({
    postgresClient: {
      queryJson(text, values) {
        calls.push({ kind: "query", text, values });
        return [printBatchRecord];
      },
      transactionJson(text, values) {
        calls.push({ kind: "transaction", text, values });
        return { printBatchRecord, operationLogId: operationLog.id };
      },
    },
  });
  const workspace = { printBatchRecords: [], operationLogs: [] };

  const transaction = await repository.createPrintBatchRecord({ workspace, printBatchRecord, operationLog });
  const listed = await repository.listPrintBatchRecords({ filters: { todoId: "T-PRINT-A", status: "partial" } });

  assert.equal(transaction.printBatchRecord.printBatchId, "PB-CHECK-1");
  assert.equal(transaction.operationLogId, "LOG-PB-CHECK-1");
  assert.equal(listed.length, 1);
  assert.equal(workspace.printBatchRecords.length, 1);
  assert.equal(workspace.operationLogs.length, 1);

  const createCall = calls[0];
  assert.equal(createCall.kind, "transaction");
  assert.match(createCall.text, /^BEGIN;/);
  assert.match(createCall.text, /INSERT INTO print_batch_records/);
  assert.match(createCall.text, /todo_ids/);
  assert.match(createCall.text, /print_packages_json/);
  assert.match(createCall.text, /pending_package_ids/);
  assert.match(createCall.text, /INSERT INTO operation_logs/);
  assert.match(createCall.text, /COMMIT;/);
  assert.match(createCall.text, /\$\d+::text\[\]/);
  assert.doesNotMatch(createCall.text, /O''Brien/);
  assert.ok(createCall.values.includes("O'Brien"));

  const listCall = calls[1];
  assert.equal(listCall.kind, "query");
  assert.match(listCall.text, /FROM print_batch_records/);
  assert.match(listCall.text, /status = \$1::text/);
  assert.match(listCall.text, /\$2::text = ANY\(todo_ids\)/);
  assert.deepEqual(listCall.values, ["partial", "T-PRINT-A", 100]);

  const directCreateQuery = buildCreatePrintBatchRecordTransactionQuery({ printBatchRecord, operationLog });
  const directCreateSql = buildCreatePrintBatchRecordTransactionSql({ printBatchRecord, operationLog });
  assert.match(directCreateSql, /operation_log_id/);
  assert.match(directCreateSql, /printed_packages_json/);
  assert.equal(directCreateQuery.text, directCreateSql);
  assert.ok(directCreateQuery.values.length > 30);

  const directListQuery = buildListPrintBatchRecordsQuery({ todoId: "T-PRINT-A", limit: 20 });
  const directListSql = buildListPrintBatchRecordsSql({ todoId: "T-PRINT-A", limit: 20 });
  assert.match(directListSql, /LIMIT \$2::integer/);
  assert.equal(directListQuery.text, directListSql);
  assert.deepEqual(directListQuery.values, ["T-PRINT-A", 20]);
}

function buildPrintBatchRecord(overrides = {}) {
  return {
    printBatchId: "PB-CHECK-1",
    action: "批量打印标签",
    resultLabel: "部分打出",
    status: "partial",
    todoIds: ["T-PRINT-A"],
    todoRefs: ["ORD-PRINT-001"],
    totalTaskCount: 1,
    totalLabelCount: 3,
    printedLabelCount: 1,
    pendingLabelCount: 2,
    printedPackageIds: ["PKG-1"],
    pendingPackageIds: ["PKG-2"],
    printPackages: [
      {
        packageId: "PKG-1",
        packageSeq: 1,
        packageCount: 1,
        labelText: "白鲸自营店 / 白鲸活动袋 35*27 白印黑 / 1500个 / 3包",
        status: "printed",
      },
      {
        packageId: "PKG-2",
        packageSeq: 2,
        packageCount: 1,
        labelText: "白鲸自营店 / 白鲸活动袋 35*27 白印黑 / 1500个 / 3包",
        status: "pending",
      },
    ],
    printedPackages: [
      {
        packageId: "PKG-1",
        packageSeq: 1,
        packageCount: 1,
        labelText: "白鲸自营店 / 白鲸活动袋 35*27 白印黑 / 1500个 / 3包",
        status: "printed",
      },
    ],
    pendingPackages: [
      {
        packageId: "PKG-2",
        packageSeq: 2,
        packageCount: 1,
        labelText: "白鲸自营店 / 白鲸活动袋 35*27 白印黑 / 1500个 / 3包",
        status: "pending",
      },
    ],
    summary: "部分打出：1/3，待处理 2 张",
    operatorId: "U-OFFICE-A",
    operatorName: overrides.operatorName ?? "办公室A",
    createdAt: "2026-07-02T10:30:00.000Z",
    operationLogId: "LOG-PB-CHECK-1",
    metadata: {
      source: "repository-check",
    },
  };
}

function buildOperationLog() {
  return {
    id: "LOG-PB-CHECK-1",
    targetType: "print_batch",
    targetId: "PB-CHECK-1",
    action: "create_print_batch",
    before: null,
    after: buildPrintBatchRecord(),
    reason: "部分打出：1/3，待处理 2 张",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:30:00.000Z",
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}
