import assert from "node:assert/strict";
import {
  buildCompletePackingTaskTransactionQuery,
  buildCompletePackingTaskTransactionSql,
  buildPublishProductionScheduleTransactionQuery,
  buildPublishProductionScheduleTransactionSql,
  buildRecordProductionDailyProgressTransactionQuery,
  buildRecordProductionDailyProgressTransactionSql,
  buildRecordProductionExceptionTransactionQuery,
  buildRecordProductionExceptionTransactionSql,
  buildResolveProductionExceptionTransactionQuery,
  buildResolveProductionExceptionTransactionSql,
  buildRecordProductionReportTransactionQuery,
  buildRecordProductionReportTransactionSql,
  createLocalProductionPackingTransactionRepository,
  createPostgresProductionPackingTransactionRepository,
} from "../server/productionPackingTransactionRepository.mjs";
import { createLocalBusinessDecisionEvidenceRepository } from "../server/businessDecisionEvidenceRepository.mjs";

checkLocalWorkspaceMutation();
await checkPostgresSqlBoundary();

console.log(
  "Production packing transaction repository check passed: schedule publish, local production report, packing completion, and PostgreSQL SQL boundaries are covered.",
);

function checkLocalWorkspaceMutation() {
  const repository = createLocalProductionPackingTransactionRepository();
  const workspace = {
    productionTasks: [buildProductionTask()],
    productionScheduleRecords: [],
    workshopReports: [],
    productionExceptions: [],
    packingTasks: [],
    packages: [],
    orderLines: [buildOrderLine()],
    fulfillments: [buildFulfillment()],
    inventories: [{ id: "INV-PROD-001", inStock: 100, reserved: 0, locked: 0 }],
    inventoryReservations: [],
    inventoryLedgers: [],
    machineCapacityBaselines: [],
    todos: [],
    todoEvents: [],
    operationLogs: [],
    businessDecisionRecords: [],
    businessDecisionAuthorizations: [],
    attachmentLinks: [],
    operationIdempotencyRecords: [],
    businessDecisionEvidenceRepository: createLocalBusinessDecisionEvidenceRepository(),
  };

  const publishTransaction = repository.publishProductionSchedule({
    workspace,
    productionTask: buildProductionTask({
      taskStatus: "制袋已排产",
      publishedScheduleId: "SCH-BAG-01-PT-PROD-001",
    }),
    productionScheduleRecord: buildProductionScheduleRecord(),
    orderLine: buildOrderLine({ lineStatus: "制袋已排产", status: "制袋已排产" }),
    operationLog: buildOperationLog({
      id: "LOG-SCHEDULE-001",
      action: "publish_production_schedule",
      after: { inventoryCreated: false, reservationCreated: false, packingTaskCreated: false },
    }),
    decisionRecord: buildScheduleDecision("BD-SCHEDULE-LOCAL", "LOG-SCHEDULE-001"),
  });
  assert.equal(publishTransaction.productionTask.publishedScheduleId, "SCH-BAG-01-PT-PROD-001");
  assert.equal(publishTransaction.productionTask.taskStatus, "制袋已排产");
  assert.equal(publishTransaction.orderLine.lineStatus, "制袋已排产");
  assert.equal(workspace.productionTasks[0].publishedScheduleId, "SCH-BAG-01-PT-PROD-001");
  assert.equal(workspace.productionScheduleRecords[0].productionTaskId, "PT-PROD-001");
  assert.equal(workspace.productionScheduleRecords[0].revision, 1);
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
    businessDecisionRecords: [],
    attachmentLinks: [],
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

  const exceptionTransaction = repository.recordProductionException({
    workspace: dailyWorkspace,
    productionTask: buildProductionTask({ taskStatus: "异常暂停" }),
    productionException: buildProductionException(),
    orderLine: buildOrderLine(),
    todo: buildProductionExceptionTodo(),
    todoEvent: buildProductionExceptionTodoEvent(),
    operationLog: buildOperationLog({ id: "LOG-PROD-EXCEPTION-001", action: "record_production_exception" }),
  });
  assert.equal(exceptionTransaction.productionTask.taskStatus, "异常暂停");
  assert.equal(exceptionTransaction.productionException.exceptionType, "机器问题");
  assert.equal(exceptionTransaction.todo.type, "生产异常");
  assert.equal(exceptionTransaction.todoEvent.eventType, "todo_source:production_exception_reported");
  assert.equal(dailyWorkspace.productionExceptions.length, 1);
  assert.equal(dailyWorkspace.inventories[0].inStock, 100);
  assert.equal(dailyWorkspace.inventories[0].reserved, 0);
  assert.equal(dailyWorkspace.inventoryReservations.length, 0);
  assert.equal(dailyWorkspace.inventoryLedgers.length, 0);
  assert.equal(dailyWorkspace.packingTasks.length, 0);

  const resolutionTransaction = repository.resolveProductionException({
    workspace: dailyWorkspace,
    productionTask: buildProductionTask({ taskStatus: "制袋中", revision: 2 }),
    productionException: {
      ...exceptionTransaction.productionException,
      status: "已恢复生产",
      resolutionCode: "继续生产",
      resolutionNote: "主管确认机器已调整",
      resolvedBy: "U-MANAGER-A",
      resolvedAt: "2026-07-02T12:20:00.000Z",
      evidence: { taskStatusBeforePause: "制袋中", resolutionHistory: [{ resolutionCode: "继续生产" }] },
    },
    todo: {
      ...exceptionTransaction.todo,
      status: "已处理",
      handled: true,
      handledBy: "U-MANAGER-A",
      handledAt: "2026-07-02T12:20:00.000Z",
      handlingResult: "继续生产：主管确认机器已调整",
      updatedAt: "2026-07-02T12:20:00.000Z",
    },
    todoEvent: buildProductionExceptionTodoEvent({ eventId: "TE-PEX-PROD-001-RES-1", eventType: "todo_source:production_exception_resolved" }),
    operationLog: buildOperationLog({ id: "LOG-PROD-EXCEPTION-RES-001", action: "resolve_production_exception" }),
    idempotencyKey: "production-exception-resolution-local-001",
    idempotencyPayload: { resolutionCode: "继续生产", resolutionNote: "主管确认机器已调整" },
  });
  assert.equal(resolutionTransaction.productionTask.taskStatus, "制袋中");
  assert.equal(resolutionTransaction.productionException.status, "已恢复生产");
  assert.equal(resolutionTransaction.productionException.resolutionCode, "继续生产");
  assert.equal(resolutionTransaction.todo.status, "已处理");
  assert.equal(resolutionTransaction.todoEvent.eventType, "todo_source:production_exception_resolved");
  assert.equal(dailyWorkspace.productionExceptions[0].resolutionNote, "主管确认机器已调整");
  assert.equal(dailyWorkspace.inventories[0].inStock, 100);
  assert.equal(dailyWorkspace.inventories[0].reserved, 0);
  assert.equal(dailyWorkspace.machineCapacityBaselines.length, 0);
  const replayedResolutionTransaction = repository.resolveProductionException({
    workspace: dailyWorkspace,
    productionTask: buildProductionTask({ taskStatus: "制袋中", revision: 2 }),
    productionException: resolutionTransaction.productionException,
    todo: resolutionTransaction.todo,
    todoEvent: resolutionTransaction.todoEvent,
    operationLog: buildOperationLog({ id: "LOG-PROD-EXCEPTION-RES-001", action: "resolve_production_exception" }),
    idempotencyKey: "production-exception-resolution-local-001",
    idempotencyPayload: { resolutionCode: "继续生产", resolutionNote: "主管确认机器已调整" },
  });
  assert.equal(replayedResolutionTransaction.operationLogId, resolutionTransaction.operationLogId);

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
    todo: buildTodo(),
    todoEvent: buildTodoEvent(),
    operationLog: buildOperationLog({ id: "LOG-PACK-001", targetType: "packing_task", targetId: "PKT-PROD-001", action: "complete_packing_task" }),
  });

  assert.equal(packingTransaction.packingTask.status, "已完成");
  assert.equal(packingTransaction.packages.length, 2);
  assert.equal(packingTransaction.fulfillment.status, "待打印标签");
  assert.equal(packingTransaction.inventoryLedgerEntries[0].qtyChange, 0);
  assert.equal(packingTransaction.todo.refType, "fulfillment");
  assert.equal(packingTransaction.todoEvent.eventType, "todo_source:packing_completed");
  assert.equal(workspace.inventories[0].inStock, beforePackingInventory.inStock);
  assert.equal(workspace.inventories[0].reserved, beforePackingInventory.reserved);
  assert.equal(workspace.packages.length, 2);
  assert.equal(workspace.fulfillments[0].actualQty, 80);
  assert.equal(workspace.inventoryLedgers.length, 4);
  assert.equal(workspace.todos[0].refId, "FUL-PROD-001");
  assert.equal(workspace.todoEvents[0].todoId, "T-PACK-PROD-001");
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

  let capturedExceptionQuery = null;
  const exceptionRepository = createPostgresProductionPackingTransactionRepository({
    queryJson(text, values) {
      capturedExceptionQuery = { text, values };
      return {
        productionTask: buildProductionTask({ taskStatus: "异常暂停" }),
        productionException: buildProductionException(),
        todo: buildProductionExceptionTodo(),
        todoEvent: buildProductionExceptionTodoEvent(),
        operationLogId: "LOG-PROD-EXCEPTION-SQL-001",
      };
    },
  });
  const exceptionTransaction = await exceptionRepository.recordProductionException({
    workspace,
    productionTask: buildProductionTask({ taskStatus: "异常暂停" }),
    productionException: buildProductionException({ remark: "machine O'Brien exception" }),
    orderLine: buildOrderLine(),
    todo: buildProductionExceptionTodo(),
    todoEvent: buildProductionExceptionTodoEvent(),
    operationLog: buildOperationLog({ id: "LOG-PROD-EXCEPTION-SQL-001", action: "record_production_exception" }),
  });
  assert.equal(exceptionTransaction.productionException.continuationMode, "暂停等确认");
  assert.equal(exceptionTransaction.todo.refType, "production_task");
  assert.match(capturedExceptionQuery.text, /^BEGIN;/);
  assert.match(capturedExceptionQuery.text, /INSERT INTO production_tasks/);
  assert.match(capturedExceptionQuery.text, /INSERT INTO production_exception_records/);
  assert.match(capturedExceptionQuery.text, /INSERT INTO todos/);
  assert.match(capturedExceptionQuery.text, /INSERT INTO todo_events/);
  assert.match(capturedExceptionQuery.text, /INSERT INTO operation_logs/);
  assert.match(capturedExceptionQuery.text, /write_guard AS MATERIALIZED/);
  assert.match(capturedExceptionQuery.text, /ERP_PRODUCTION_TASK_CONCURRENCY_CONFLICT/);
  assert.doesNotMatch(capturedExceptionQuery.text, /UPDATE inventory_items AS item/);
  assert.doesNotMatch(capturedExceptionQuery.text, /INSERT INTO inventory_reservations/);
  assert.doesNotMatch(capturedExceptionQuery.text, /INSERT INTO inventory_ledger_entries/);
  assert.doesNotMatch(capturedExceptionQuery.text, /INSERT INTO packing_tasks/);
  assert.ok(!capturedExceptionQuery.text.includes("machine O'Brien exception"));
  assert.equal(capturedExceptionQuery.values.includes("machine O'Brien exception"), true);
  assert.match(capturedExceptionQuery.text, /COMMIT/);

  let capturedScheduleQuery = null;
  const scheduleRepository = createPostgresProductionPackingTransactionRepository({
    queryJson(text, values) {
      capturedScheduleQuery = { text, values };
      return {
        productionTask: buildProductionTask({
          taskStatus: "制袋已排产",
          publishedScheduleId: "SCH-BAG-01-PT-PROD-SQL-001",
        }),
        productionScheduleRecord: buildProductionScheduleRecord({
          publishedScheduleId: "SCH-BAG-01-PT-PROD-SQL-001",
        }),
        orderLine: buildOrderLine({ lineStatus: "制袋已排产" }),
        businessDecision: buildScheduleDecision("BD-SCHEDULE-PG", "LOG-SCHEDULE-SQL-001"),
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
    productionScheduleRecord: buildProductionScheduleRecord({
      publishedScheduleId: "SCH-BAG-01-PT-PROD-SQL-001",
    }),
    orderLine: buildOrderLine({ lineStatus: "制袋已排产" }),
    operationLog: buildOperationLog({ id: "LOG-SCHEDULE-SQL-001", action: "publish_production_schedule" }),
    decisionRecord: buildScheduleDecision("BD-SCHEDULE-PG", "LOG-SCHEDULE-SQL-001"),
  });
  assert.equal(scheduleTransaction.productionTask.publishedScheduleId, "SCH-BAG-01-PT-PROD-SQL-001");
  assert.equal(scheduleTransaction.orderLine.lineStatus, "制袋已排产");
  assert.match(capturedScheduleQuery.text, /^BEGIN;/);
  assert.match(capturedScheduleQuery.text, /INSERT INTO production_tasks/);
  assert.match(capturedScheduleQuery.text, /INSERT INTO production_schedule_records/);
  assert.match(capturedScheduleQuery.text, /UPDATE order_lines/);
  assert.match(capturedScheduleQuery.text, /INSERT INTO operation_logs/);
  assert.match(capturedScheduleQuery.text, /write_guard AS MATERIALIZED/);
  assert.match(capturedScheduleQuery.text, /FOR UPDATE/);
  assert.match(capturedScheduleQuery.text, /ERP_PRODUCTION_TASK_CONCURRENCY_CONFLICT/);
  assert.match(capturedScheduleQuery.text, /ERP_ORDER_LINE_CONCURRENCY_CONFLICT/);
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
        todo: buildTodo(),
        todoEvent: buildTodoEvent(),
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
    todo: buildTodo(),
    todoEvent: buildTodoEvent(),
    operationLog: buildOperationLog({ id: "LOG-PACK-SQL-001", targetType: "packing_task", targetId: "PKT-PROD-001", action: "complete_packing_task" }),
  });

  assert.equal(packingTransaction.operationLogId, "LOG-PACK-SQL-001");
  assert.equal(packingTransaction.packages.length, 1);
  assert.equal(packingTransaction.todo.refId, "FUL-PROD-001");
  assert.match(capturedPackingQuery.text, /^BEGIN;/);
  assert.match(capturedPackingQuery.text, /INSERT INTO packing_tasks/);
  assert.match(capturedPackingQuery.text, /INSERT INTO packages/);
  assert.match(capturedPackingQuery.text, /UPDATE fulfillment_records/);
  assert.match(capturedPackingQuery.text, /UPDATE order_lines/);
  assert.match(capturedPackingQuery.text, /INSERT INTO inventory_ledger_entries/);
  assert.match(capturedPackingQuery.text, /INSERT INTO todos/);
  assert.match(capturedPackingQuery.text, /INSERT INTO todo_events/);
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
  const directExceptionSql = buildRecordProductionExceptionTransactionSql({
    productionTask: buildProductionTask({ taskStatus: "异常暂停" }),
    productionException: buildProductionException(),
    orderLine: buildOrderLine(),
    todo: buildProductionExceptionTodo(),
    todoEvent: buildProductionExceptionTodoEvent(),
    operationLog: buildOperationLog({ action: "record_production_exception" }),
  });
  assert.match(directExceptionSql, /INSERT INTO production_exception_records/);
  assert.doesNotMatch(directExceptionSql, /UPDATE inventory_items AS item/);
  assert.doesNotMatch(directExceptionSql, /INSERT INTO inventory_reservations/);
  assert.equal(buildRecordProductionExceptionTransactionQuery({
    productionTask: buildProductionTask({ taskStatus: "异常暂停" }),
    productionException: buildProductionException(),
    orderLine: buildOrderLine(),
    todo: buildProductionExceptionTodo(),
    todoEvent: buildProductionExceptionTodoEvent(),
    operationLog: buildOperationLog({ action: "record_production_exception" }),
  }).values.includes("record_production_exception"), true);
  const directExceptionResolutionSql = buildResolveProductionExceptionTransactionSql({
    productionTask: buildProductionTask({ taskStatus: "制袋中", revision: 2 }),
    productionException: buildProductionException({
      status: "已恢复生产",
      resolutionCode: "继续生产",
      resolutionNote: "主管确认机器已调整",
      resolvedBy: "U-MANAGER-A",
      resolvedAt: "2026-07-02T12:20:00.000Z",
    }),
    todo: buildProductionExceptionTodo({
      status: "已处理",
      handledBy: "U-MANAGER-A",
      handledAt: "2026-07-02T12:20:00.000Z",
      handlingResult: "继续生产：主管确认机器已调整",
      updatedAt: "2026-07-02T12:20:00.000Z",
    }),
    todoEvent: buildProductionExceptionTodoEvent({ eventType: "todo_source:production_exception_resolved" }),
    operationLog: buildOperationLog({ action: "resolve_production_exception" }),
  });
  assert.match(directExceptionResolutionSql, /UPDATE production_exception_records/);
  assert.match(directExceptionResolutionSql, /UPDATE todos/);
  assert.match(directExceptionResolutionSql, /INSERT INTO todo_events/);
  assert.match(directExceptionResolutionSql, /ERP_PRODUCTION_EXCEPTION_CONCURRENCY_CONFLICT/);
  assert.match(directExceptionResolutionSql, /ERP_TODO_CONCURRENCY_CONFLICT/);
  assert.doesNotMatch(directExceptionResolutionSql, /UPDATE inventory_items AS item/);
  assert.doesNotMatch(directExceptionResolutionSql, /INSERT INTO inventory_reservations/);
  assert.doesNotMatch(directExceptionResolutionSql, /INSERT INTO inventory_ledger_entries/);
  assert.equal(buildResolveProductionExceptionTransactionQuery({
    productionTask: buildProductionTask({ taskStatus: "制袋中", revision: 2 }),
    productionException: buildProductionException({ status: "已恢复生产", resolutionCode: "继续生产", resolutionNote: "主管确认机器已调整", resolvedBy: "U-MANAGER-A", resolvedAt: "2026-07-02T12:20:00.000Z" }),
    todo: buildProductionExceptionTodo({ status: "已处理", updatedAt: "2026-07-02T12:20:00.000Z" }),
    todoEvent: buildProductionExceptionTodoEvent({ eventType: "todo_source:production_exception_resolved" }),
    operationLog: buildOperationLog({ action: "resolve_production_exception" }),
  }).values.includes("resolve_production_exception"), true);
  const directScheduleSql = buildPublishProductionScheduleTransactionSql({
    productionTask: buildProductionTask({ taskStatus: "制袋已排产", publishedScheduleId: "SCH-BAG-01-PT-PROD-001" }),
    productionScheduleRecord: buildProductionScheduleRecord(),
    orderLine: buildOrderLine({ lineStatus: "制袋已排产" }),
    operationLog: buildOperationLog({ action: "publish_production_schedule" }),
    decisionRecord: buildScheduleDecision("BD-SCHEDULE-SQL", "LOG-PROD-001"),
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
    productionScheduleRecord: buildProductionScheduleRecord(),
    orderLine: buildOrderLine({ lineStatus: "制袋已排产" }),
    operationLog: buildOperationLog({ action: "publish_production_schedule" }),
    decisionRecord: buildScheduleDecision("BD-SCHEDULE-QUERY", "LOG-PROD-001"),
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

function buildScheduleDecision(id, operationLogId) {
  return {
    id,
    businessType: "production_task",
    businessId: "PT-PROD-001",
    decisionScope: "production_schedule",
    decisionType: "delegated",
    decisionMakerEmployeeId: "ERP-MOTHER",
    decisionMakerEmployeeNoSnapshot: "031",
    decisionMakerNameSnapshot: "负责人",
    decisionChannel: "wechat",
    decidedAt: "2026-07-02T08:50:00.000Z",
    decisionContent: { summary: "确认发布排产" },
    authorizationId: "AUTH-SCHEDULE",
    authorizationSnapshot: { authorizationId: "AUTH-SCHEDULE" },
    authorizationBasis: "微信确认",
    amountSnapshot: null,
    currency: "CNY",
    evidenceAttachmentIds: [],
    enteredByUserId: "U-OFFICE-A",
    enteredAt: "2026-07-02T09:00:00.000Z",
    status: "active",
    lateEntry: false,
    lateEntryReason: "",
    revision: 1,
    operationLogId,
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T09:00:00.000Z",
  };
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

function buildProductionScheduleRecord(overrides = {}) {
  return {
    scheduleRecordId: "SQR-BAG-01-PT-PROD-001",
    id: "SQR-BAG-01-PT-PROD-001",
    productionTaskId: "PT-PROD-001",
    orderLineId: "OL-PROD-001",
    publishedScheduleId: "SCH-BAG-01-PT-PROD-001",
    machineId: "BAG-01",
    queueSeq: 0,
    status: "active",
    sourceKind: "schedule_publish",
    revision: 1,
    sequenceUpdatedBy: "U-OFFICE-A",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T09:00:00.000Z",
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

function buildProductionException(overrides = {}) {
  return {
    productionExceptionId: "PEX-PROD-001",
    id: "PEX-PROD-001",
    bizNo: "PEX-PROD-001",
    productionTaskId: "PT-PROD-001",
    orderLineId: "OL-PROD-001",
    processType: "制袋",
    machineId: "BAG-01",
    operatorId: "U-OFFICE-A",
    exceptionType: "机器问题",
    continuationMode: "暂停等确认",
    status: "待生产确认",
    estimatedLossQty: 6,
    affectsDelivery: true,
    remark: "机器异响",
    evidence: { inventoryCreated: false, reservationCreated: false, packingTaskCreated: false, statementUpdated: false },
    occurredAt: "2026-07-02T12:10:00.000Z",
    createdAt: "2026-07-02T12:10:00.000Z",
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

function buildTodo(overrides = {}) {
  return {
    id: "T-PACK-PROD-001",
    todoId: "T-PACK-PROD-001",
    bizNo: "T-PACK-PROD-001",
    type: "待打印标签",
    refType: "fulfillment",
    refId: "FUL-PROD-001",
    ref: "FUL-PROD-001",
    priority: "普通",
    status: "未处理",
    summary: "打包完成待打印标签",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T12:30:00.000Z",
    updatedAt: "2026-07-02T12:30:00.000Z",
    ...overrides,
  };
}

function buildProductionExceptionTodo(overrides = {}) {
  return buildTodo({
    id: "T-PEX-PROD-001",
    todoId: "T-PEX-PROD-001",
    bizNo: "T-PEX-PROD-001",
    type: "生产异常",
    refType: "production_task",
    refId: "PT-PROD-001",
    ref: "PT-PROD-001",
    priority: "紧急",
    summary: "机器问题 / 暂停等确认",
    createdAt: "2026-07-02T12:10:00.000Z",
    updatedAt: "2026-07-02T12:10:00.000Z",
    ...overrides,
  });
}

function buildTodoEvent(overrides = {}) {
  return {
    eventId: "TE-PACK-PROD-001",
    todoId: "T-PACK-PROD-001",
    eventType: "todo_source:packing_completed",
    eventPayload: { fulfillmentId: "FUL-PROD-001" },
    operatorId: "U-OFFICE-A",
    occurredAt: "2026-07-02T12:30:00.000Z",
    createdAt: "2026-07-02T12:30:00.000Z",
    ...overrides,
  };
}

function buildProductionExceptionTodoEvent(overrides = {}) {
  return buildTodoEvent({
    eventId: "TE-PEX-PROD-001",
    todoId: "T-PEX-PROD-001",
    eventType: "todo_source:production_exception_reported",
    eventPayload: { productionExceptionId: "PEX-PROD-001", productionTaskId: "PT-PROD-001" },
    occurredAt: "2026-07-02T12:10:00.000Z",
    createdAt: "2026-07-02T12:10:00.000Z",
    ...overrides,
  });
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
