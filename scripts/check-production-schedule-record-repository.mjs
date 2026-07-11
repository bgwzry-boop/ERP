import assert from "node:assert/strict";
import {
  buildListProductionScheduleRecordsQuery,
  buildListProductionScheduleRecordsSql,
  buildMoveProductionScheduleQueueItemTransactionQuery,
  buildMoveProductionScheduleQueueItemTransactionSql,
  buildResequenceProductionScheduleRecordsTransactionQuery,
  buildResequenceProductionScheduleRecordsTransactionSql,
  createLocalProductionScheduleRecordRepository,
  createPostgresProductionScheduleRecordRepository,
} from "../server/productionScheduleRecordRepository.mjs";

await checkLocalRepository();
await checkPostgresSqlBoundary();

console.log(
  "Production schedule record repository check passed: local queue records, list filters, PostgreSQL resequence, and machine-move transaction boundaries are covered.",
);

async function checkLocalRepository() {
  const repository = createLocalProductionScheduleRecordRepository();
  const workspace = {
    productionScheduleRecords: [buildScheduleRecord({ scheduleRecordId: "SQR-OTHER", machineId: "PRINT-01", productionTaskId: "PT-PRINT-001", queueSeq: 1 })],
    operationLogs: [],
  };
  const result = await repository.resequenceMachineQueue({
    workspace,
    records: [
      buildScheduleRecord({ scheduleRecordId: "SQR-BAG-002", productionTaskId: "PT-BAG-002", queueSeq: 1 }),
      buildScheduleRecord({ scheduleRecordId: "SQR-BAG-001", productionTaskId: "PT-BAG-001", queueSeq: 2 }),
    ],
    transactionContext: { machineId: "BAG-01", updatedAt: "2026-07-03T10:30:00.000Z" },
    operationLog: buildOperationLog(),
  });

  assert.equal(result.operationLogId, "LOG-SCHEDULE-RESEQ-001");
  assert.equal(result.productionScheduleRecords.length, 2);
  assert.equal(result.transactionContext.machineId, "BAG-01");
  assert.equal(workspace.productionScheduleRecords.length, 3);
  assert.equal(
    workspace.productionScheduleRecords
      .filter((item) => item.machineId === "BAG-01")
      .map((item) => `${item.queueSeq}:${item.productionTaskId}`)
      .join("|"),
    "1:PT-BAG-002|2:PT-BAG-001",
  );
  assert.equal(workspace.operationLogs[0].action, "resequence_production_schedule_queue");

  const bagRecords = await repository.listProductionScheduleRecords({ workspace, filters: { machineId: "BAG-01", status: "active" } });
  assert.equal(bagRecords.length, 2);
  assert.equal(bagRecords[0].sequenceUpdatedBy, "U-OFFICE-A");
  assert.equal(bagRecords[0].sourceKind, "manual_resequence");

  const moveResult = await repository.moveMachineQueueItem({
    workspace,
    productionTask: buildProductionTask({ machineId: "BAG-02" }),
    records: [
      buildScheduleRecord({ scheduleRecordId: "SQR-BAG-001", productionTaskId: "PT-BAG-001", machineId: "BAG-01", queueSeq: 0, status: "moved", sourceKind: "machine_reassignment" }),
      buildScheduleRecord({ scheduleRecordId: "SQR-BAG-02-001", productionTaskId: "PT-BAG-001", machineId: "BAG-02", queueSeq: 1, sourceKind: "machine_reassignment" }),
    ],
    operationLog: buildOperationLog({ id: "LOG-SCHEDULE-MOVE-001", action: "move_production_schedule_queue_item" }),
  });
  assert.equal(moveResult.productionTask.machineId, "BAG-02");
  assert.equal(workspace.productionTasks[0].machineId, "BAG-02");
  assert.equal((await repository.listProductionScheduleRecords({ workspace, filters: { machineId: "BAG-01", status: "active" } })).length, 1);
  assert.equal((await repository.listProductionScheduleRecords({ workspace, filters: { machineId: "BAG-02", status: "active" } }))[0].productionTaskId, "PT-BAG-001");
}

async function checkPostgresSqlBoundary() {
  const transactionSql = buildResequenceProductionScheduleRecordsTransactionSql({
    records: [
      buildScheduleRecord({ productionTaskId: "PT-BAG-SQL-002", queueSeq: 1, remark: "O'Brien urgent" }),
      buildScheduleRecord({ productionTaskId: "PT-BAG-SQL-001", queueSeq: 2 }),
    ],
    operationLog: buildOperationLog({ reason: "O'Brien resequence" }),
  });
  assert.match(transactionSql, /^BEGIN;/);
  assert.match(transactionSql, /INSERT INTO production_schedule_records/);
  assert.match(transactionSql, /ON CONFLICT \(machine_id, production_task_id\) DO UPDATE SET/);
  assert.match(transactionSql, /locked_schedule_records AS MATERIALIZED/);
  assert.match(transactionSql, /FOR UPDATE/);
  assert.match(transactionSql, /ERP_PRODUCTION_SCHEDULE_QUEUE_CONCURRENCY_CONFLICT/);
  assert.match(transactionSql, /revision = production_schedule_records\.revision \+ 1/);
  assert.match(transactionSql, /JOIN write_guard ON write_guard\.ok/);
  assert.match(transactionSql, /INSERT INTO operation_logs/);
  assert.ok(!transactionSql.includes("O'Brien urgent"));
  assert.ok(!transactionSql.includes("O'Brien resequence"));
  assert.match(transactionSql, /COMMIT/);
  assert.doesNotMatch(transactionSql, /INSERT INTO inventory_/);
  assert.doesNotMatch(transactionSql, /INSERT INTO packing_tasks/);
  assert.doesNotMatch(transactionSql, /INSERT INTO workshop_reports/);

  const listSql = buildListProductionScheduleRecordsSql({ machineId: "BAG-01", status: "active" });
  assert.match(listSql, /FROM production_schedule_records/);
  assert.match(listSql, /WHERE machine_id = \$1::text AND schedule_status = \$2::text/);
  assert.deepEqual(buildListProductionScheduleRecordsQuery({ machineId: "BAG-01", status: "active" }).values, [
    "BAG-01",
    "active",
  ]);

  let capturedQuery = null;
  const repository = createPostgresProductionScheduleRecordRepository({
    queryJson(text, values) {
      capturedQuery = { text, values };
      return {
        productionScheduleRecords: [
          buildScheduleRecord({ productionTaskId: "PT-BAG-SQL-002", queueSeq: 1 }),
          buildScheduleRecord({ productionTaskId: "PT-BAG-SQL-001", queueSeq: 2 }),
        ],
        operationLogId: "LOG-SCHEDULE-RESEQ-001",
      };
    },
  });
  const workspace = { productionScheduleRecords: [], operationLogs: [] };
  const result = await repository.resequenceMachineQueue({
    workspace,
    records: [
      buildScheduleRecord({ productionTaskId: "PT-BAG-SQL-002", queueSeq: 1 }),
      buildScheduleRecord({ productionTaskId: "PT-BAG-SQL-001", queueSeq: 2 }),
    ],
    operationLog: buildOperationLog(),
  });
  assert.equal(result.operationLogId, "LOG-SCHEDULE-RESEQ-001");
  assert.equal(workspace.productionScheduleRecords[0].productionTaskId, "PT-BAG-SQL-002");
  assert.match(capturedQuery.text, /production_schedule_records/);

  const moveSql = buildMoveProductionScheduleQueueItemTransactionSql({
    productionTask: buildProductionTask({ machineId: "BAG-02" }),
    records: [
      buildScheduleRecord({ productionTaskId: "PT-BAG-SQL-001", machineId: "BAG-01", queueSeq: 0, status: "moved", sourceKind: "machine_reassignment" }),
      buildScheduleRecord({ productionTaskId: "PT-BAG-SQL-001", machineId: "BAG-02", queueSeq: 1, sourceKind: "machine_reassignment" }),
    ],
    operationLog: buildOperationLog({ id: "LOG-SCHEDULE-MOVE-001", action: "move_production_schedule_queue_item" }),
  });
  assert.match(moveSql, /UPDATE production_tasks/);
  assert.match(moveSql, /revision = production_tasks\.revision \+ 1/);
  assert.match(moveSql, /ERP_PRODUCTION_TASK_CONCURRENCY_CONFLICT/);
  assert.match(moveSql, /machine_id = \$1::text/);
  assert.match(moveSql, /INSERT INTO production_schedule_records/);
  assert.ok(!moveSql.includes("machine_reassignment"));
  assert.match(moveSql, /INSERT INTO operation_logs/);
  assert.doesNotMatch(moveSql, /INSERT INTO inventory_/);
  assert.doesNotMatch(moveSql, /INSERT INTO packing_tasks/);
  assert.doesNotMatch(moveSql, /INSERT INTO workshop_reports/);

  const resequenceQuery = buildResequenceProductionScheduleRecordsTransactionQuery({
    records: [
      buildScheduleRecord({ productionTaskId: "PT-BAG-SQL-002", queueSeq: 1, remark: "O'Brien urgent" }),
      buildScheduleRecord({ productionTaskId: "PT-BAG-SQL-001", queueSeq: 2 }),
    ],
    operationLog: buildOperationLog({ reason: "O'Brien resequence" }),
  });
  assert.equal(resequenceQuery.values.includes("O'Brien urgent"), true);
  assert.equal(resequenceQuery.values.includes("O'Brien resequence"), true);
  assert.deepEqual(buildMoveProductionScheduleQueueItemTransactionQuery({
    productionTask: buildProductionTask({ machineId: "BAG-02" }),
    records: [buildScheduleRecord({ productionTaskId: "PT-BAG-SQL-001", machineId: "BAG-02", queueSeq: 1, sourceKind: "machine_reassignment" })],
    operationLog: buildOperationLog({ id: "LOG-SCHEDULE-MOVE-001", action: "move_production_schedule_queue_item" }),
  }).values.slice(0, 2), ["BAG-02", "PT-BAG-001"]);
}

function buildProductionTask(overrides = {}) {
  const productionTaskId = overrides.productionTaskId ?? "PT-BAG-001";
  return {
    productionTaskId,
    id: productionTaskId,
    bizNo: productionTaskId,
    orderLineId: overrides.orderLineId ?? productionTaskId.replace(/^PT-/, "OL-"),
    taskType: overrides.taskType ?? "制袋",
    machineId: overrides.machineId ?? "BAG-01",
    plannedQty: overrides.plannedQty ?? 1000,
    taskStatus: overrides.taskStatus ?? "制袋中",
    status: overrides.status ?? "制袋中",
    publishedScheduleId: overrides.publishedScheduleId ?? `SCH-${productionTaskId}`,
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-03T10:00:00.000Z",
    updatedAt: "2026-07-03T10:30:00.000Z",
  };
}

function buildScheduleRecord(overrides = {}) {
  const productionTaskId = overrides.productionTaskId ?? "PT-BAG-001";
  return {
    scheduleRecordId: overrides.scheduleRecordId ?? `SQR-${productionTaskId}`,
    productionTaskId,
    orderLineId: overrides.orderLineId ?? productionTaskId.replace(/^PT-/, "OL-"),
    publishedScheduleId: overrides.publishedScheduleId ?? `SCH-${productionTaskId}`,
    machineId: overrides.machineId ?? "BAG-01",
    queueSeq: overrides.queueSeq ?? 1,
    status: overrides.status ?? "active",
    sourceKind: overrides.sourceKind ?? "manual_resequence",
    sequenceUpdatedAt: overrides.sequenceUpdatedAt ?? "2026-07-03T10:30:00.000Z",
    sequenceUpdatedBy: overrides.sequenceUpdatedBy ?? "U-OFFICE-A",
    remark: overrides.remark ?? "queue sequence check",
    createdBy: overrides.createdBy ?? "U-OFFICE-A",
    createdAt: overrides.createdAt ?? "2026-07-03T10:00:00.000Z",
    updatedBy: overrides.updatedBy ?? "U-OFFICE-A",
    updatedAt: overrides.updatedAt ?? "2026-07-03T10:30:00.000Z",
  };
}

function buildOperationLog(overrides = {}) {
  return {
    id: overrides.id ?? "LOG-SCHEDULE-RESEQ-001",
    targetType: "production_schedule_queue",
    targetId: "BAG-01",
    action: overrides.action ?? "resequence_production_schedule_queue",
    before: { items: [] },
    after: {
      items: [],
      inventoryCreated: false,
      reservationCreated: false,
      packingTaskCreated: false,
    },
    reason: overrides.reason ?? "queue sequence check",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-03T10:30:00.000Z",
    createdAt: "2026-07-03T10:30:00.000Z",
  };
}
