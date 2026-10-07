import assert from "node:assert/strict";
import { postgresAssertions } from "../assertions.mjs";

export async function checkProductionApi(runtime, { baseUrl, headers, postJson, getJson }) {
  const { queryJson, runPsql, sqlLiteral } = runtime;
  const apiProductionInventoryBefore = queryJson(
    "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = '30*38*10-白色-普通提-空白袋-待快运区';",
  );
  runPsql(
    `INSERT INTO machines (id, biz_no, name, machine_type, workshop, status, enabled, created_by)
     VALUES ('BAG-03', 'BAG-03', 'API live 制袋机', 'bag_making', '1号车间', 'active', true, 'U-OFFICE-A')
     ON CONFLICT (id) DO NOTHING;`,
  );
  const apiDailyProgressBody = {
    orderLineId: "ORD-0629-003-01",
    dailyQualifiedQty: 400,
    exceptionQty: 2,
    machineCount: 900,
    machineId: "BAG-03",
    operatorId: "U-SPOOFED",
    reportedAt: "2026-07-02T12:30:00.000Z",
    remark: "postgres live daily progress route",
    idempotencyKey: "production-daily-progress-live-001",
  };
  const apiDailyProgress = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/daily-progress",
    apiDailyProgressBody,
    { headers },
  );
  const replayedApiDailyProgress = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/daily-progress",
    apiDailyProgressBody,
    { headers },
  );
  assert.equal(replayedApiDailyProgress.reportId, apiDailyProgress.reportId);
  assert.equal(replayedApiDailyProgress.operationLogId, apiDailyProgress.operationLogId);
  assert.equal(replayedApiDailyProgress.cumulativeQualifiedQty, apiDailyProgress.cumulativeQualifiedQty);
  assert.equal(replayedApiDailyProgress.remainingQty, apiDailyProgress.remainingQty);
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM workshop_reports WHERE production_task_id = 'PT-ORD-0629-003-01' AND evidence_json->>'reportKind' = 'daily_progress';",
        { capture: true },
      ).trim(),
    ),
    1,
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('operatorId', operator_id) AS result FROM operation_logs WHERE id = ${sqlLiteral(apiDailyProgress.operationLogId)};`,
    ).operatorId,
    "U-OFFICE-A",
  );
  const apiProductionExceptionInventoryBefore = queryJson(
    "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = '30*38*10-白色-普通提-空白袋-待快运区';",
  );
  const apiProductionExceptionReservationCountBefore = Number(
    runPsql(
      "SELECT COUNT(*) FROM inventory_reservations WHERE order_line_id = 'ORD-0629-003-01';",
      { capture: true },
    ).trim(),
  );
  const apiProductionExceptionPackingTaskCountBefore = Number(
    runPsql(
      "SELECT COUNT(*) FROM packing_tasks WHERE order_line_id = 'ORD-0629-003-01';",
      { capture: true },
    ).trim(),
  );
  const apiProductionExceptionBody = {
    orderLineId: "ORD-0629-003-01",
    exceptionType: "机器问题",
    continuationMode: "暂停等确认",
    estimatedLossQty: 6,
    affectsDelivery: true,
    operatorId: "U-SPOOFED",
    occurredAt: "2026-07-02T12:45:00.000Z",
    remark: "postgres live production exception route",
    idempotencyKey: "production-exception-live-001",
  };
  const apiProductionException = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/exception",
    apiProductionExceptionBody,
    { headers },
  );
  const replayedApiProductionException = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/exception",
    apiProductionExceptionBody,
    { headers },
  );
  assert.equal(apiProductionException.exceptionType, "机器问题");
  assert.equal(apiProductionException.continuationMode, "暂停等确认");
  assert.equal(apiProductionException.inventoryCreated, false);
  assert.equal(apiProductionException.reservationCreated, false);
  assert.equal(apiProductionException.packingTaskCreated, false);
  assert.equal(apiProductionException.statementUpdated, false);
  assert.ok(apiProductionException.productionExceptionId);
  assert.ok(apiProductionException.todoId);
  assert.equal(replayedApiProductionException.productionExceptionId, apiProductionException.productionExceptionId);
  assert.equal(replayedApiProductionException.operationLogId, apiProductionException.operationLogId);
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM production_exception_records WHERE production_task_id = 'PT-ORD-0629-003-01' AND exception_type = '机器问题';",
        { capture: true },
      ).trim(),
    ),
    1,
  );
  const apiProductionExceptionTodo = queryJson(
    `SELECT json_build_object('type', type, 'refType', ref_type, 'refId', ref_id, 'status', status) AS result FROM todos WHERE id = ${sqlLiteral(apiProductionException.todoId)};`,
  );
  assert.equal(apiProductionExceptionTodo.type, "生产异常");
  assert.equal(apiProductionExceptionTodo.refType, "production_task");
  assert.equal(apiProductionExceptionTodo.refId, "PT-ORD-0629-003-01");
  assert.deepEqual(
    queryJson(
      "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = '30*38*10-白色-普通提-空白袋-待快运区';",
    ),
    apiProductionExceptionInventoryBefore,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM inventory_reservations WHERE order_line_id = 'ORD-0629-003-01';",
        { capture: true },
      ).trim(),
    ),
    apiProductionExceptionReservationCountBefore,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM packing_tasks WHERE order_line_id = 'ORD-0629-003-01';",
        { capture: true },
      ).trim(),
    ),
    apiProductionExceptionPackingTaskCountBefore,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_id = ${sqlLiteral(apiProductionException.productionExceptionId)};`,
        { capture: true },
      ).trim(),
    ),
    0,
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('operatorId', operator_id) AS result FROM operation_logs WHERE id = ${sqlLiteral(apiProductionException.operationLogId)};`,
    ).operatorId,
    "U-OFFICE-A",
  );
  const apiProductionExceptionResolutionBody = {
    productionExceptionId: apiProductionException.productionExceptionId,
    resolutionCode: "继续生产",
    resolutionNote: "主管确认机器已调整",
    resolutionConfirmed: true,
  };
  const apiProductionExceptionResolutionHeaders = { ...headers, "idempotency-key": "production-exception-resolution-live-001" };
  const apiProductionExceptionResolution = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/exception-resolution",
    apiProductionExceptionResolutionBody,
    { headers: apiProductionExceptionResolutionHeaders },
  );
  const replayedApiProductionExceptionResolution = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/exception-resolution",
    apiProductionExceptionResolutionBody,
    { headers: apiProductionExceptionResolutionHeaders },
  );
  assert.equal(apiProductionExceptionResolution.exceptionStatus, "已恢复生产");
  assert.equal(apiProductionExceptionResolution.resolutionCode, "继续生产");
  assert.equal(apiProductionExceptionResolution.taskStatus, "跨日继续");
  assert.equal(apiProductionExceptionResolution.todoStatus, "已处理");
  assert.equal(apiProductionExceptionResolution.resolvedBy, "U-OFFICE-A");
  assert.ok(apiProductionExceptionResolution.resolvedAt);
  assert.equal(replayedApiProductionExceptionResolution.operationLogId, apiProductionExceptionResolution.operationLogId);
  assert.deepEqual(
    queryJson(
      `SELECT json_build_object('status', status, 'resolutionCode', resolution_code, 'resolutionNote', resolution_note, 'resolvedBy', resolved_by, 'resolvedAt', resolved_at) AS result FROM production_exception_records WHERE id = ${sqlLiteral(apiProductionException.productionExceptionId)};`,
    ),
    {
      status: "已恢复生产",
      resolutionCode: "继续生产",
      resolutionNote: "主管确认机器已调整",
      resolvedBy: "U-OFFICE-A",
      resolvedAt: apiProductionExceptionResolution.resolvedAt,
    },
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status, 'handlingResult', handling_result) AS result FROM todos WHERE id = ${sqlLiteral(apiProductionException.todoId)};`,
    ).status,
    "已处理",
  );
  assert.deepEqual(
    queryJson(
      "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = '30*38*10-白色-普通提-空白袋-待快运区';",
    ),
    apiProductionExceptionInventoryBefore,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM inventory_reservations WHERE order_line_id = 'ORD-0629-003-01';",
        { capture: true },
      ).trim(),
    ),
    apiProductionExceptionReservationCountBefore,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM packing_tasks WHERE order_line_id = 'ORD-0629-003-01';",
        { capture: true },
      ).trim(),
    ),
    apiProductionExceptionPackingTaskCountBefore,
  );
  const apiProductionReportBody = {
    orderLineId: "ORD-0629-003-01",
    qualifiedQty: 1000,
    exceptionQty: 0,
    machineCount: 1888,
    machineId: "BAG-03",
    inventoryItemId: "30*38*10-白色-普通提-空白袋-待快运区",
    operatorId: "U-SPOOFED",
    completedAt: "2026-07-02T13:00:00.000Z",
    remark: "postgres live production report route",
    idempotencyKey: "production-report-complete-live-001",
  };
  const apiProductionReport = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/report-complete",
    apiProductionReportBody,
    { headers },
  );
  postgresAssertions.assertApiProduction({ apiProductionReport });
  const apiProductionInventoryAfterReport = queryJson(
    "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = '30*38*10-白色-普通提-空白袋-待快运区';",
  );
  assert.equal(Number(apiProductionInventoryAfterReport.onHand), Number(apiProductionInventoryBefore.onHand) + 1000);
  assert.equal(Number(apiProductionInventoryAfterReport.reserved), Number(apiProductionInventoryBefore.reserved) + 1000);
  const replayedApiProductionReport = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/report-complete",
    apiProductionReportBody,
    { headers },
  );
  assert.equal(replayedApiProductionReport.reportId, apiProductionReport.reportId);
  assert.equal(replayedApiProductionReport.operationLogId, apiProductionReport.operationLogId);
  const apiProductionInventoryAfterReplay = queryJson(
    "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = '30*38*10-白色-普通提-空白袋-待快运区';",
  );
  assert.deepEqual(apiProductionInventoryAfterReplay, apiProductionInventoryAfterReport);
  assert.equal(
    queryJson(
      `SELECT json_build_object('operatorId', operator_id) AS result FROM operation_logs WHERE id = ${sqlLiteral(apiProductionReport.operationLogId)};`,
    ).operatorId,
    "U-OFFICE-A",
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('machineCount', machine_count) AS result FROM workshop_reports WHERE id = ${sqlLiteral(apiProductionReport.reportId)};`,
    ).machineCount,
    1888,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type IN ('production_report', 'production_report_reservation') AND source_id = ${sqlLiteral(
          apiProductionReport.reportId,
        )};`,
        { capture: true },
      ).trim(),
    ),
    2,
  );
  assert.equal(
    queryJson(
      "SELECT json_build_object('dailyCapacityQty', daily_capacity_qty, 'sourceKind', source_kind) AS result FROM machine_capacity_baselines WHERE machine_id = 'BAG-03' AND size_key = '30*38*10' AND source_kind = 'production_report' AND effective_from = '2026-07-02';",
    ).dailyCapacityQty,
    1000,
  );

  const warehouseHeaders = { "x-erp-user-id": "U-WAREHOUSE-A" };
  const apiPackingCompleteBody = {
    orderLineId: "ORD-0629-003-01",
    actualPackedQty: 1000,
    packageCount: 3,
    labelsPrinted: false,
    inventoryItemId: "30*38*10-白色-普通提-空白袋-待快运区",
    operatorId: "U-SPOOFED",
    completedAt: "2026-07-02T13:20:00.000Z",
    remark: "postgres live packing complete route",
    idempotencyKey: "packing-complete-live-001",
  };
  const apiPackingComplete = await postJson(
    baseUrl,
    `/api/packing-tasks/${apiProductionReport.packingTaskId}/complete`,
    apiPackingCompleteBody,
    { headers: warehouseHeaders },
  );
  postgresAssertions.assertApiPackingComplete({ apiPackingComplete });
  const apiProductionInventoryAfterPacking = queryJson(
    "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = '30*38*10-白色-普通提-空白袋-待快运区';",
  );
  assert.equal(Number(apiProductionInventoryAfterPacking.onHand), Number(apiProductionInventoryAfterReport.onHand));
  assert.equal(Number(apiProductionInventoryAfterPacking.reserved), Number(apiProductionInventoryAfterReport.reserved));
  const replayedApiPackingComplete = await postJson(
    baseUrl,
    `/api/packing-tasks/${apiProductionReport.packingTaskId}/complete`,
    apiPackingCompleteBody,
    { headers: warehouseHeaders },
  );
  assert.equal(replayedApiPackingComplete.operationLogId, apiPackingComplete.operationLogId);
  assert.deepEqual(replayedApiPackingComplete.packageIds, apiPackingComplete.packageIds);
  assert.equal(
    queryJson(
      `SELECT json_build_object('operatorId', operator_id) AS result FROM operation_logs WHERE id = ${sqlLiteral(apiPackingComplete.operationLogId)};`,
    ).operatorId,
    "U-WAREHOUSE-A",
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM packages WHERE order_line_id = 'ORD-0629-003-01';", { capture: true }).trim()),
    3,
  );
  assert.equal(
    queryJson("SELECT json_build_object('status', status, 'actualPackedQty', actual_packed_qty) AS result FROM packing_tasks WHERE id = 'PKT-ORD-0629-003-01';").status,
    "已完成",
  );
  assert.equal(
    queryJson("SELECT json_build_object('lineStatus', line_status) AS result FROM order_lines WHERE id = 'ORD-0629-003-01';").lineStatus,
    "待打印标签",
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type = 'packing_complete' AND source_id = ${sqlLiteral(
          apiProductionReport.packingTaskId,
        )};`,
        { capture: true },
      ).trim(),
    ),
    1,
  );
  const apiProductionDetail = await getJson(baseUrl, `/api/production-tasks/${apiProductionReport.productionTaskId}`, {
    headers,
  });
  postgresAssertions.assertApiProduction2({ apiProductionDetail, apiProductionReport });
  const apiPackingDetail = await getJson(baseUrl, `/api/packing-tasks/${apiProductionReport.packingTaskId}`, {
    headers: warehouseHeaders,
  });
  postgresAssertions.assertApiPackingDetail({ apiPackingDetail });
  const apiProductionList = await getJson(
    baseUrl,
    `/api/production-tasks?status=${encodeURIComponent("已完成")}&keyword=${encodeURIComponent("美的")}&pageSize=5`,
    { headers },
  );
  assert.ok(
    apiProductionList.items.some(
      (item) =>
        item.productionTaskId === apiProductionReport.productionTaskId &&
        item.latestReport?.machineCountAffectsInventory === false &&
        item.packingTask?.packingTaskId === apiProductionReport.packingTaskId,
    ),
  );
  const apiPackingList = await getJson(
    baseUrl,
    `/api/packing-tasks?status=${encodeURIComponent("已完成")}&keyword=${encodeURIComponent("美的")}&pageSize=5`,
    { headers: warehouseHeaders },
  );
  assert.ok(
    apiPackingList.items.some(
      (item) =>
        item.packingTaskId === apiProductionReport.packingTaskId &&
        item.packingTask?.packageCount === 3 &&
        item.inventoryDeducted === false,
    ),
  );
  return { warehouseHeaders };
}

export async function checkProductionScheduleQueueApi(runtime, {
  baseUrl, scheduleHeaders, apiScheduleTaskId, apiSchedulePublish, postJson, liveManagerRuntimeUserId,
}) {
  const { runPsql, queryJson, sqlLiteral } = runtime;
  const apiScheduleQueueRevision = Number(
    runPsql(
      `SELECT revision FROM production_schedule_records
       WHERE production_task_id = '${apiScheduleTaskId}' AND schedule_status = 'active';`,
      { capture: true },
    ).trim(),
  );
  const apiScheduleResequenceBody = {
    machineId: "BAG-LIVE-01",
    orderedProductionTaskIds: [apiScheduleTaskId],
    expectedRevision: apiScheduleQueueRevision,
    affectedRevisions: [{ productionTaskId: apiScheduleTaskId, revision: apiScheduleQueueRevision }],
    businessDecisionTargetId: apiScheduleTaskId,
    directDecisionContent: { summary: "负责人确认调整排产顺序" },
    operatorId: "U-SPOOFED",
    updatedAt: "2026-07-02T12:50:00.000Z",
    remark: "postgres live schedule resequence",
    idempotencyKey: "production-schedule-resequence-live-001",
  };
  const apiScheduleResequence = await postJson(
    baseUrl,
    "/api/production-schedules/machine-queue/resequence",
    apiScheduleResequenceBody,
    { headers: scheduleHeaders },
  );
  const replayedApiScheduleResequence = await postJson(
    baseUrl,
    "/api/production-schedules/machine-queue/resequence",
    apiScheduleResequenceBody,
    { headers: scheduleHeaders },
  );
  postgresAssertions.assertReplayedApiScheduleResequence({ replayedApiScheduleResequence, apiScheduleResequence, liveManagerRuntimeUserId });

  const apiScheduleMoveTaskRevision = Number(
    runPsql(
      `SELECT revision FROM production_tasks WHERE id = '${apiScheduleTaskId}';`,
      { capture: true },
    ).trim(),
  );
  const apiScheduleMoveBody = {
    productionTaskId: apiScheduleTaskId,
    targetMachineId: "BAG-LIVE-02",
    targetQueueSeq: 2,
    expectedRevision: apiScheduleMoveTaskRevision,
    directDecisionContent: { summary: "负责人确认调整生产机台" },
    operatorId: "U-SPOOFED",
    updatedAt: "2026-07-02T12:55:00.000Z",
    remark: "postgres live schedule move",
    idempotencyKey: "production-schedule-move-live-001",
  };
  const apiScheduleMove = await postJson(
    baseUrl,
    "/api/production-schedules/machine-queue/move",
    apiScheduleMoveBody,
    { headers: scheduleHeaders },
  );
  const replayedApiScheduleMove = await postJson(
    baseUrl,
    "/api/production-schedules/machine-queue/move",
    apiScheduleMoveBody,
    { headers: scheduleHeaders },
  );
  assert.equal(replayedApiScheduleMove.operationLogId, apiScheduleMove.operationLogId);
  assert.equal(replayedApiScheduleMove.sourceMachineId, "BAG-LIVE-01");
  assert.equal(replayedApiScheduleMove.targetMachineId, "BAG-LIVE-02");
  assert.equal(replayedApiScheduleMove.targetQueueSeq, apiScheduleMove.targetQueueSeq);
  assert.equal(replayedApiScheduleMove.updatedBy, liveManagerRuntimeUserId);
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM production_schedule_records WHERE production_task_id = '${apiScheduleTaskId}';`,
        { capture: true },
      ).trim(),
    ),
    2,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM operation_idempotency_keys WHERE scope IN ('production.schedule.publish', 'production.schedule.resequence', 'production.schedule.move') AND idempotency_key LIKE '%live-001';",
        { capture: true },
      ).trim(),
    ),
    3,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM operation_logs WHERE id IN (${[
          apiSchedulePublish.operationLogId,
          apiScheduleResequence.operationLogId,
          apiScheduleMove.operationLogId,
        ].map(sqlLiteral).join(", ")});`,
        { capture: true },
      ).trim(),
    ),
    3,
  );
}
