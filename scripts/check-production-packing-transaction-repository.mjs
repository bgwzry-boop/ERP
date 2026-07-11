import assert from "node:assert/strict";
import {
  buildCompletePackingTaskTransactionQuery,
  buildCompletePackingTaskTransactionSql,
  buildPublishProductionScheduleTransactionQuery,
  buildPublishProductionScheduleTransactionSql,
  buildRecordProductionDailyProgressTransactionQuery,
  buildRecordProductionDailyProgressTransactionSql,
  buildRecordProductionReportTransactionQuery,
  buildRecordProductionReportTransactionSql,
  createLocalProductionPackingTransactionRepository,
  createPostgresProductionPackingTransactionRepository,
} from "../server/productionPackingTransactionRepository.mjs";

checkLocalWorkspaceMutation();
await checkPostgresSqlBoundary();

console.log(
  "Production packing transaction repository check passed: schedule publish, local production report, packing completion, and PostgreSQL SQL boundaries are covered.",
);

function checkLocalWorkspaceMutation() {
  const repository = createLocalProductionPackingTransactionRepository();
  const workspace = {
    productionTasks: [buildProductionTask()],
    workshopReports: [],
    packingTasks: [],
    packages: [],
    orderLines: [buildOrderLine()],
    fulfillments: [buildFulfillment()],
    inventories: [{ id: "INV-PROD-001", inStock: 100, reserved: 0, locked: 0 }],
    inventoryReservations: [],
    inventoryLedgers: [],
    machineCapacityBaselines: [],
    operationLogs: [],
  };

  const publishTransaction = repository.publishProductionSchedule({
    workspace,
    productionTask: buildProductionTask({
      taskStatus: "制袋已排产",
      publishedScheduleId: "SCH-BAG-01-PT-PROD-001",
    }),
    orderLine: buildOrderLine({ lineStatus: "制袋已排产", status: "制袋已排产" }),
    operationLog: buildOperationLog({
      id: "LOG-SCHEDULE-001",
      action: "publish_production_schedule",
      after: { inventoryCreated: false, reservationCreated: false, packingTaskCreated: false },
    }),
  });
  assert.equal(publishTransaction.productionTask.publishedScheduleId, "SCH-BAG-01-PT-PROD-001");
  assert.equal(publishTransaction.productionTask.taskStatus, "制袋已排产");
  assert.equal(publishTransaction.orderLine.lineStatus, "制袋已排产");
  assert.equal(workspace.productionTasks[0].publishedScheduleId, "SCH-BAG-01-PT-PROD-001");
  assert.equal(workspace.orderLines[0].status, "制袋已排产");
  assert.equal(workspace.inventories[0].inStock, 100);
  assert.equal(workspace.inventoryReservations.length, 0);
  assert.equal(workspace.packingTasks.length, 0);
  assert.equal(workspace.operationLogs[0].action, "publish_production_schedule");

  const reportTransaction = repository.recordProductionReport({
    workspace,
    productionTask: buildProductionTask({ taskStatus: "已完成" }),
    workshopReport: buildWorkshopReport({ machineCount: 12345 }),
    orderLine: buildOrderLine({ lineStatus: "待打包", status: "待打包" }),
    packingTask: buildPackingTask({ status: "待打包" }),
    machineCapacityBaseline: buildMachineCapacityBaseline({ dailyCapacityQty: 80 }),
    inventoryReservations: [buildReservation()],
    inventoryAdjustments: [
      {
        inventoryItemId: "INV-PROD-001",
        onHandQtyChange: 80,
        reservedQtyChange: 80,
        expectedRevision: 1,
        expectedOnHandQty: 100,
        expectedReservedQty: 0,
      },
    ],
    inventoryLedgerEntries: [
      buildLedger({ ledgerId: "LEDGER-WR-PROD-001-IN", qtyBefore: 100, qtyChange: 80, qtyAfter: 180 }),
      buildLedger({
        ledgerId: "LEDGER-WR-PROD-001-RSV",
        changeType: "生产完成占用",
        qtyBefore: 0,
        qtyChange: 80,
        qtyAfter: 80,
        sourceType: "production_report_reservation",
      }),
    ],
    operationLog: buildOperationLog({ id: "LOG-PROD-001", action: "complete_production_report" }),
  });

  assert.equal(reportTransaction.productionTask.taskStatus, "已完成");
  assert.equal(reportTransaction.workshopReport.qualifiedQty, 80);
  assert.equal(reportTransaction.workshopReport.machineCount, 12345);
  assert.equal(reportTransaction.packingTask.status, "待打包");
  assert.equal(workspace.inventories[0].inStock, 180);
  assert.equal(workspace.inventories[0].reserved, 80);
  assert.equal(workspace.inventoryReservations[0].reservedQty, 80);
  assert.equal(workspace.inventoryLedgers.length, 2);
  assert.equal(reportTransaction.machineCapacityBaseline.dailyCapacityQty, 80);
  assert.equal(workspace.machineCapacityBaselines[0].dailyCapacityQty, 80);
  assert.equal(workspace.machineCapacityBaselines[0].sourceKind, "production_report");
  assert.equal(workspace.machineCapacityBaselines[0].confidence, "medium");
  assert.equal(workspace.orderLines[0].status, "待打包");
  assert.equal(workspace.packingTasks[0].status, "待打包");

  const dailyWorkspace = {
    productionTasks: [buildProductionTask()],
    workshopReports: [],
    packingTasks: [],
    packages: [],
    orderLines: [buildOrderLine()],
    fulfillments: [buildFulfillment()],
    inventories: [{ id: "INV-PROD-001", inStock: 100, reserved: 0, locked: 0 }],
    inventoryReservations: [],
    inventoryLedgers: [],
    machineCapacityBaselines: [],
    operationLogs: [],
  };
  const dailyProgressTransaction = repository.recordProductionDailyProgress({
    workspace: dailyWorkspace,
    productionTask: buildProductionTask({ taskStatus: "跨日继续" }),
    workshopReport: buildWorkshopReport({
      reportId: "WDP-PROD-001",
      qualifiedQty: 45,
      machineCount: 7777,
      evidence: {
        reportKind: "daily_progress",
        dailyQualifiedQty: 45,
        cumulativeQualifiedQty: 45,
        remainingQty: 35,
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        machineCountAffectsInventory: false,
      },
    }),
    operationLog: buildOperationLog({ id: "LOG-PROD-DAY-001", action: "record_production_daily_progress" }),
  });
  assert.equal(dailyProgressTransaction.productionTask.taskStatus, "跨日继续");
  assert.equal(dailyProgressTransaction.workshopReport.qualifiedQty, 45);
  assert.equal(dailyProgressTransaction.workshopReport.evidence.reportKind, "daily_progress");
  assert.equal(dailyWorkspace.inventories[0].inStock, 100);
  assert.equal(dailyWorkspace.inventories[0].reserved, 0);
  assert.equal(dailyWorkspace.inventoryReservations.length, 0);
  assert.equal(dailyWorkspace.inventoryLedgers.length, 0);
  assert.equal(dailyWorkspace.packingTasks.length, 0);
  assert.equal(dailyWorkspace.machineCapacityBaselines.length, 0);

  repository.recordProductionReport({
    workspace,
    productionTask: buildProductionTask({ taskStatus: "已完成" }),
    workshopReport: buildWorkshopReport({ reportId: "WR-PROD-002", machineCount: 12888 }),
    orderLine: buildOrderLine({ lineStatus: "待打包", status: "待打包" }),
    packingTask: buildPackingTask({ status: "待打包" }),
    machineCapacityBaseline: buildMachineCapacityBaseline({ capacityBaselineId: "MCB-PROD-002", dailyCapacityQty: 20 }),
    inventoryReservations: [buildReservation({ reservationId: "RSV-PROD-002" })],
    inventoryAdjustments: [{ inventoryItemId: "INV-PROD-001", onHandQtyChange: 20, reservedQtyChange: 20 }],
    inventoryLedgerEntries: [buildLedger({ ledgerId: "LEDGER-WR-PROD-002", qtyBefore: 180, qtyChange: 20, qtyAfter: 200 })],
    operationLog: buildOperationLog({ id: "LOG-PROD-002", action: "complete_production_report" }),
  });
  assert.equal(workspace.machineCapacityBaselines.length, 1);
  assert.equal(workspace.machineCapacityBaselines[0].dailyCapacityQty, 100);

  const beforePackingInventory = { ...workspace.inventories[0] };
  const packingTransaction = repository.completePackingTask({
    workspace,
    packingTask: buildPackingTask({ status: "已完成", actualPackedQty: 80 }),
    packages: [
      buildPackage({ packageId: "PKG-PKT-PROD-001-1", packageSeq: 1, packedQty: 40 }),
      buildPackage({ packageId: "PKG-PKT-PROD-001-2", packageSeq: 2, packedQty: 40 }),
    ],
    fulfillment: buildFulfillment({ status: "待打印标签", actualQty: 80 }),
    orderLine: buildOrderLine({ lineStatus: "待打印标签", status: "待打印标签" }),
    inventoryLedgerEntries: [
      buildLedger({
        ledgerId: "LEDGER-PKT-PROD-001-PACK",
        changeType: "打包完成确认",
        qtyBefore: 80,
        qtyChange: 0,
        qtyAfter: 80,
        sourceType: "packing_complete",
        sourceId: "PKT-PROD-001",
      }),
    ],
    operationLog: buildOperationLog({ id: "LOG-PACK-001", targetType: "packing_task", targetId: "PKT-PROD-001", action: "complete_packing_task" }),
  });

  assert.equal(packingTransaction.packingTask.status, "已完成");
  assert.equal(packingTransaction.packages.length, 2);
  assert.equal(packingTransaction.fulfillment.status, "待打印标签");
  assert.equal(packingTransaction.inventoryLedgerEntries[0].qtyChange, 0);
  assert.equal(workspace.inventories[0].inStock, beforePackingInventory.inStock);
  assert.equal(workspace.inventories[0].reserved, beforePackingInventory.reserved);
  assert.equal(workspace.packages.length, 2);
  assert.equal(workspace.fulfillments[0].actualQty, 80);
  assert.equal(workspace.inventoryLedgers.length, 4);
}

async function checkPostgresSqlBoundary() {
  let capturedProductionQuery = null;
  const repository = createPostgresProductionPackingTransactionRepository({
    queryJson(text, values) {
      capturedProductionQuery = { text, values };
      return {
        productionTask: buildProductionTask({ taskStatus: "已完成" }),
        workshopReport: buildWorkshopReport({ remark: "O'Brien report" }),
        orderLine: buildOrderLine({ lineStatus: "待打包" }),
        packingTask: buildPackingTask(),
        machineCapacityBaseline: buildMachineCapacityBaseline(),
        inventoryReservations: [buildReservation()],
        inventoryLedgerEntries: [buildLedger()],
        operationLogId: "LOG-PROD-SQL-001",
      };
    },
  });
  const workspace = {
    productionTasks: [buildProductionTask()],
    workshopReports: [],
    packingTasks: [],
    packages: [],
    orderLines: [buildOrderLine()],
    fulfillments: [buildFulfillment()],
    inventories: [{ id: "INV-PROD-001", inStock: 100, reserved: 0 }],
    inventoryReservations: [],
    inventoryLedgers: [],
    machineCapacityBaselines: [],
    operationLogs: [],
  };
  const productionTransaction = await repository.recordProductionReport({
    workspace,
    productionTask: buildProductionTask({ taskStatus: "已完成" }),
    workshopReport: buildWorkshopReport({ remark: "O'Brien report" }),
    orderLine: buildOrderLine({ lineStatus: "待打包" }),
    packingTask: buildPackingTask(),
    machineCapacityBaseline: buildMachineCapacityBaseline(),
    inventoryReservations: [buildReservation()],
    inventoryAdjustments: [
      {
        inventoryItemId: "INV-PROD-001",
        onHandQtyChange: 80,
        reservedQtyChange: 80,
        expectedRevision: 1,
        expectedOnHandQty: 100,
        expectedReservedQty: 0,
      },
    ],
    inventoryLedgerEntries: [buildLedger()],
    operationLog: buildOperationLog({ id: "LOG-PROD-SQL-001", action: "complete_production_report" }),
  });

  assert.equal(productionTransaction.operationLogId, "LOG-PROD-SQL-001");
  assert.equal(productionTransaction.machineCapacityBaseline.sourceKind, "production_report");
  assert.equal(workspace.inventories[0].inStock, 180);
  assert.match(capturedProductionQuery.text, /^BEGIN;/);
  assert.match(capturedProductionQuery.text, /INSERT INTO production_tasks/);
  assert.match(capturedProductionQuery.text, /INSERT INTO workshop_reports/);
  assert.match(capturedProductionQuery.text, /UPDATE order_lines/);
  assert.match(capturedProductionQuery.text, /INSERT INTO packing_tasks/);
  assert.match(capturedProductionQuery.text, /INSERT INTO inventory_reservations/);
  assert.match(capturedProductionQuery.text, /UPDATE inventory_items AS item/);
  assert.match(capturedProductionQuery.text, /INSERT INTO inventory_ledger_entries/);
  assert.match(capturedProductionQuery.text, /INSERT INTO operation_logs/);
  assert.match(capturedProductionQuery.text, /INSERT INTO machine_capacity_baselines/);
  assert.match(capturedProductionQuery.text, /FOR UPDATE/);
  assert.match(capturedProductionQuery.text, /write_guard AS MATERIALIZED/);
  assert.match(capturedProductionQuery.text, /ERP_PRODUCTION_TASK_CONCURRENCY_CONFLICT/);
  assert.match(capturedProductionQuery.text, /ERP_ORDER_LINE_CONCURRENCY_CONFLICT/);
  assert.match(capturedProductionQuery.text, /ERP_INVENTORY_CONCURRENCY_CONFLICT/);
  assert.match(capturedProductionQuery.text, /JOIN write_guard ON write_guard\.ok/);
  assert.match(capturedProductionQuery.text, /WHERE EXISTS \(SELECT 1 FROM machines/);
  assert.match(capturedProductionQuery.text, /ON CONFLICT \(machine_id, size_key, source_kind, effective_from\) DO UPDATE SET/);
  assert.match(capturedProductionQuery.text, /daily_capacity_qty = machine_capacity_baselines\.daily_capacity_qty \+ EXCLUDED\.daily_capacity_qty/);
  assert.match(capturedProductionQuery.text, /machine_count/);
  assert.ok(!capturedProductionQuery.text.includes("O'Brien report"));
  assert.equal(capturedProductionQuery.values.includes("O'Brien report"), true);
  assert.match(capturedProductionQuery.text, /COMMIT/);

  let capturedDailyProgressQuery = null;
  const dailyProgressRepository = createPostgresProductionPackingTransactionRepository({
    queryJson(text, values) {
      capturedDailyProgressQuery = { text, values };
      return {
        productionTask: buildProductionTask({ taskStatus: "跨日继续" }),
        workshopReport: buildWorkshopReport({
          reportId: "WDP-PROD-SQL-001",
          qualifiedQty: 45,
          evidence: { reportKind: "daily_progress", remainingQty: 35 },
        }),
        operationLogId: "LOG-PROD-DAY-SQL-001",
      };
    },
  });
  const dailyProgressTransaction = await dailyProgressRepository.recordProductionDailyProgress({
    workspace,
    productionTask: buildProductionTask({ taskStatus: "跨日继续" }),
    workshopReport: buildWorkshopReport({
      reportId: "WDP-PROD-SQL-001",
      qualifiedQty: 45,
      remark: "cross-day O'Brien progress",
      evidence: {
        reportKind: "daily_progress",
        cumulativeQualifiedQty: 45,
        remainingQty: 35,
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
      },
    }),
    operationLog: buildOperationLog({ id: "LOG-PROD-DAY-SQL-001", action: "record_production_daily_progress" }),
  });
  assert.equal(dailyProgressTransaction.productionTask.taskStatus, "跨日继续");
  assert.equal(dailyProgressTransaction.workshopReport.evidence.reportKind, "daily_progress");
  assert.match(capturedDailyProgressQuery.text, /^BEGIN;/);
  assert.match(capturedDailyProgressQuery.text, /INSERT INTO production_tasks/);
  assert.match(capturedDailyProgressQuery.text, /INSERT INTO workshop_reports/);
  assert.match(capturedDailyProgressQuery.text, /INSERT INTO operation_logs/);
  assert.match(capturedDailyProgressQuery.text, /write_guard AS MATERIALIZED/);
  assert.ok(!capturedDailyProgressQuery.text.includes("daily_progress"));
  assert.ok(!capturedDailyProgressQuery.text.includes("cross-day O'Brien progress"));
  assert.match(capturedDailyProgressQuery.values.map(String).join("\n"), /daily_progress/);
  assert.match(capturedDailyProgressQuery.values.map(String).join("\n"), /cross-day O'Brien progress/);
  assert.doesNotMatch(capturedDailyProgressQuery.text, /UPDATE order_lines/);
  assert.doesNotMatch(capturedDailyProgressQuery.text, /INSERT INTO packing_tasks/);
  assert.doesNotMatch(capturedDailyProgressQuery.text, /INSERT INTO inventory_reservations/);
  assert.doesNotMatch(capturedDailyProgressQuery.text, /UPDATE inventory_items AS item/);
  assert.doesNotMatch(capturedDailyProgressQuery.text, /INSERT INTO inventory_ledger_entries/);
  assert.doesNotMatch(capturedDailyProgressQuery.text, /INSERT INTO machine_capacity_baselines/);
  assert.match(capturedDailyProgressQuery.text, /COMMIT/);

  let capturedScheduleQuery = null;
  const scheduleRepository = createPostgresProductionPackingTransactionRepository({
    queryJson(text, values) {
      capturedScheduleQuery = { text, values };
      return {
        productionTask: buildProductionTask({
          taskStatus: "制袋已排产",
          publishedScheduleId: "SCH-BAG-01-PT-PROD-SQL-001",
        }),
        orderLine: buildOrderLine({ lineStatus: "制袋已排产" }),
        operationLogId: "LOG-SCHEDULE-SQL-001",
      };
    },
  });
  const scheduleTransaction = await scheduleRepository.publishProductionSchedule({
    workspace,
    productionTask: buildProductionTask({
      taskStatus: "制袋已排产",
      publishedScheduleId: "SCH-BAG-01-PT-PROD-SQL-001",
    }),
    orderLine: buildOrderLine({ lineStatus: "制袋已排产" }),
    operationLog: buildOperationLog({ id: "LOG-SCHEDULE-SQL-001", action: "publish_production_schedule" }),
  });
  assert.equal(scheduleTransaction.productionTask.publishedScheduleId, "SCH-BAG-01-PT-PROD-SQL-001");
  assert.equal(scheduleTransaction.orderLine.lineStatus, "制袋已排产");
  assert.match(capturedScheduleQuery.text, /^BEGIN;/);
  assert.match(capturedScheduleQuery.text, /INSERT INTO production_tasks/);
  assert.match(capturedScheduleQuery.text, /UPDATE order_lines/);
  assert.match(capturedScheduleQuery.text, /INSERT INTO operation_logs/);
  assert.ok(!capturedScheduleQuery.text.includes("publish_production_schedule"));
  assert.equal(capturedScheduleQuery.values.includes("publish_production_schedule"), true);
  assert.doesNotMatch(capturedScheduleQuery.text, /INSERT INTO workshop_reports/);
  assert.doesNotMatch(capturedScheduleQuery.text, /INSERT INTO packing_tasks/);
  assert.doesNotMatch(capturedScheduleQuery.text, /INSERT INTO inventory_reservations/);
  assert.doesNotMatch(capturedScheduleQuery.text, /UPDATE inventory_items AS item/);
  assert.doesNotMatch(capturedScheduleQuery.text, /INSERT INTO inventory_ledger_entries/);
  assert.doesNotMatch(capturedScheduleQuery.text, /INSERT INTO machine_capacity_baselines/);
  assert.match(capturedScheduleQuery.text, /COMMIT/);

  let capturedPackingQuery = null;
  const packingRepository = createPostgresProductionPackingTransactionRepository({
    queryJson(text, values) {
      capturedPackingQuery = { text, values };
      return {
        packingTask: buildPackingTask({ status: "已完成", actualPackedQty: 80 }),
        packages: [buildPackage()],
        fulfillment: buildFulfillment({ status: "待打印标签", actualQty: 80 }),
        orderLine: buildOrderLine({ lineStatus: "待打印标签" }),
        inventoryLedgerEntries: [buildLedger({ sourceType: "packing_complete", qtyChange: 0 })],
        operationLogId: "LOG-PACK-SQL-001",
      };
    },
  });
  const packingTransaction = await packingRepository.completePackingTask({
    workspace,
    packingTask: buildPackingTask({ status: "已完成", actualPackedQty: 80 }),
    packages: [buildPackage()],
    fulfillment: buildFulfillment({ status: "待打印标签", actualQty: 80 }),
    orderLine: buildOrderLine({ lineStatus: "待打印标签" }),
    inventoryLedgerEntries: [buildLedger({ sourceType: "packing_complete", qtyChange: 0 })],
    operationLog: buildOperationLog({ id: "LOG-PACK-SQL-001", targetType: "packing_task", targetId: "PKT-PROD-001", action: "complete_packing_task" }),
  });

  assert.equal(packingTransaction.operationLogId, "LOG-PACK-SQL-001");
  assert.equal(packingTransaction.packages.length, 1);
  assert.match(capturedPackingQuery.text, /^BEGIN;/);
  assert.match(capturedPackingQuery.text, /INSERT INTO packing_tasks/);
  assert.match(capturedPackingQuery.text, /INSERT INTO packages/);
  assert.match(capturedPackingQuery.text, /UPDATE fulfillment_records/);
  assert.match(capturedPackingQuery.text, /UPDATE order_lines/);
  assert.match(capturedPackingQuery.text, /INSERT INTO inventory_ledger_entries/);
  assert.match(capturedPackingQuery.text, /INSERT INTO operation_logs/);
  assert.match(capturedPackingQuery.text, /FOR UPDATE/);
  assert.match(capturedPackingQuery.text, /ERP_PACKING_TASK_CONCURRENCY_CONFLICT/);
  assert.match(capturedPackingQuery.text, /ERP_FULFILLMENT_CONCURRENCY_CONFLICT/);
  assert.match(capturedPackingQuery.text, /JOIN write_guard ON write_guard\.ok/);
  assert.ok(!capturedPackingQuery.text.includes("packing_complete"));
  assert.equal(capturedPackingQuery.values.includes("packing_complete"), true);
  assert.match(capturedPackingQuery.text, /COMMIT/);

  const directProductionSql = buildRecordProductionReportTransactionSql({
    productionTask: buildProductionTask(),
    workshopReport: buildWorkshopReport(),
    orderLine: null,
    packingTask: null,
    machineCapacityBaseline: null,
    inventoryReservations: [],
    inventoryAdjustments: [],
    inventoryLedgerEntries: [],
    operationLog: buildOperationLog(),
  });
  assert.match(directProductionSql, /SELECT NULL::json AS result WHERE false/);
  const directDailyProgressSql = buildRecordProductionDailyProgressTransactionSql({
    productionTask: buildProductionTask({ taskStatus: "跨日继续" }),
    workshopReport: buildWorkshopReport({ reportId: "WDP-PROD-001", evidence: { reportKind: "daily_progress" } }),
    operationLog: buildOperationLog({ action: "record_production_daily_progress" }),
  });
  assert.match(directDailyProgressSql, /INSERT INTO workshop_reports/);
  assert.doesNotMatch(directDailyProgressSql, /UPDATE inventory_items AS item/);
  const directScheduleSql = buildPublishProductionScheduleTransactionSql({
    productionTask: buildProductionTask({ taskStatus: "制袋已排产", publishedScheduleId: "SCH-BAG-01-PT-PROD-001" }),
    orderLine: buildOrderLine({ lineStatus: "制袋已排产" }),
    operationLog: buildOperationLog({ action: "publish_production_schedule" }),
  });
  assert.match(directScheduleSql, /published_schedule_id/);
  assert.doesNotMatch(directScheduleSql, /INSERT INTO workshop_reports/);
  assert.doesNotMatch(directScheduleSql, /UPDATE inventory_items AS item/);
  const directPackingSql = buildCompletePackingTaskTransactionSql({
    packingTask: buildPackingTask(),
    packages: [],
    fulfillment: null,
    orderLine: null,
    inventoryLedgerEntries: [],
    operationLog: buildOperationLog({ targetType: "packing_task", targetId: "PKT-PROD-001" }),
  });
  assert.match(directPackingSql, /SELECT NULL::json AS result WHERE false/);
  assert.equal(buildRecordProductionReportTransactionQuery({
    productionTask: buildProductionTask(),
    workshopReport: buildWorkshopReport({ remark: "O'Brien report" }),
    orderLine: null,
    packingTask: null,
    machineCapacityBaseline: null,
    inventoryReservations: [],
    inventoryAdjustments: [],
    inventoryLedgerEntries: [],
    operationLog: buildOperationLog(),
  }).values.includes("O'Brien report"), true);
  assert.equal(buildRecordProductionDailyProgressTransactionQuery({
    productionTask: buildProductionTask({ taskStatus: "跨日继续" }),
    workshopReport: buildWorkshopReport({ reportId: "WDP-PROD-001", evidence: { reportKind: "daily_progress" } }),
    operationLog: buildOperationLog({ action: "record_production_daily_progress" }),
  }).values.includes("record_production_daily_progress"), true);
  assert.equal(buildPublishProductionScheduleTransactionQuery({
    productionTask: buildProductionTask({ taskStatus: "制袋已排产" }),
    orderLine: buildOrderLine({ lineStatus: "制袋已排产" }),
    operationLog: buildOperationLog({ action: "publish_production_schedule" }),
  }).values.includes("publish_production_schedule"), true);
  assert.equal(buildCompletePackingTaskTransactionQuery({
    packingTask: buildPackingTask(),
    packages: [],
    fulfillment: null,
    orderLine: null,
    inventoryLedgerEntries: [],
    operationLog: buildOperationLog({ targetType: "packing_task", targetId: "PKT-PROD-001" }),
  }).values.includes("PKT-PROD-001"), true);
}

function buildProductionTask(overrides = {}) {
  return {
    productionTaskId: "PT-PROD-001",
    id: "PT-PROD-001",
    bizNo: "PT-PROD-001",
    orderLineId: "OL-PROD-001",
    taskType: "制袋",
    machineId: "BAG-01",
    plannedQty: 80,
    taskStatus: "制袋中",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T09:00:00.000Z",
    ...overrides,
  };
}

function buildWorkshopReport(overrides = {}) {
  return {
    reportId: "WR-PROD-001",
    productionTaskId: "PT-PROD-001",
    orderLineId: "OL-PROD-001",
    processType: "制袋",
    machineId: "BAG-01",
    operatorId: "U-OFFICE-A",
    qualifiedQty: 80,
    exceptionQty: 0,
    machineCount: 999,
    completedAt: "2026-07-02T12:00:00.000Z",
    remark: "合格报工",
    evidence: { machineCountLabel: "机器计数/动作次数，非合格成品数量" },
    createdAt: "2026-07-02T12:00:00.000Z",
    ...overrides,
  };
}

function buildPackingTask(overrides = {}) {
  return {
    packingTaskId: "PKT-PROD-001",
    id: "PKT-PROD-001",
    bizNo: "PKT-PROD-001",
    orderLineId: "OL-PROD-001",
    plannedQty: 80,
    actualPackedQty: 0,
    status: "待打包",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:00:00.000Z",
    ...overrides,
  };
}

function buildMachineCapacityBaseline(overrides = {}) {
  return {
    capacityBaselineId: "MCB-PROD-001",
    id: "MCB-PROD-001",
    machineId: "BAG-01",
    sizeKey: "30*38*10",
    dailyCapacityQty: 80,
    hourlyCapacityQty: null,
    sourceKind: "production_report",
    confidence: "medium",
    effectiveFrom: "2026-07-02",
    remark: "生产报工校准样本",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:00:00.000Z",
    ...overrides,
  };
}

function buildOrderLine(overrides = {}) {
  return {
    orderLineId: "OL-PROD-001",
    id: "OL-PROD-001",
    orderId: "ORD-PROD-001",
    customerId: "C001",
    productName: "美的空调",
    size: "30*38*10",
    bagColor: "白色",
    handleType: "普通提",
    style: "空白袋",
    originalQty: 80,
    lineStatus: "制袋中",
    status: "制袋中",
    exceptionTags: [],
    ...overrides,
  };
}

function buildFulfillment(overrides = {}) {
  return {
    fulfillmentId: "FUL-PROD-001",
    id: "FUL-PROD-001",
    orderLineId: "OL-PROD-001",
    lineId: "OL-PROD-001",
    method: "快递快运",
    expectedQty: 80,
    qty: 80,
    status: "待打包",
    confirmedBy: "U-OFFICE-A",
    ...overrides,
  };
}

function buildReservation(overrides = {}) {
  return {
    reservationId: "RSV-PROD-001",
    id: "RSV-PROD-001",
    orderLineId: "OL-PROD-001",
    inventoryItemId: "INV-PROD-001",
    reservedQty: 80,
    reservationType: "生产完成待出库占用",
    status: "生效",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:00:00.000Z",
    ...overrides,
  };
}

function buildLedger(overrides = {}) {
  return {
    ledgerId: "LEDGER-WR-PROD-001",
    inventoryItemId: "INV-PROD-001",
    changeType: "生产入库",
    qtyBefore: 100,
    qtyChange: 80,
    qtyAfter: 180,
    sourceType: "production_report",
    sourceId: "WR-PROD-001",
    operatorId: "U-OFFICE-A",
    confirmedBy: "U-OFFICE-A",
    occurredAt: "2026-07-02T12:00:00.000Z",
    createdAt: "2026-07-02T12:00:00.000Z",
    reason: "车间合格报工入库",
    remark: "机器计数不参与库存",
    ...overrides,
  };
}

function buildPackage(overrides = {}) {
  return {
    packageId: "PKG-PKT-PROD-001-1",
    id: "PKG-PKT-PROD-001-1",
    bizNo: "PKG-PKT-PROD-001-1",
    orderLineId: "OL-PROD-001",
    fulfillmentId: "FUL-PROD-001",
    packageSeq: 1,
    packageCount: 1,
    packedQty: 80,
    labelPrintRecordId: "",
    status: "待打印标签",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:30:00.000Z",
    ...overrides,
  };
}

function buildOperationLog(overrides = {}) {
  return {
    id: "LOG-PROD-001",
    targetType: "production_task",
    targetId: "PT-PROD-001",
    action: "complete_production_report",
    before: null,
    after: null,
    reason: "check",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T12:00:00.000Z",
    createdAt: "2026-07-02T12:00:00.000Z",
    ...overrides,
  };
}
