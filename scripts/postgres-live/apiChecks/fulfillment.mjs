import assert from "node:assert/strict";

export async function checkFulfillmentApi({
  confirmedOrder, baseUrl, headers, printDriverHeaders,
  postJson, getJson, queryJson, runPsql, sqlLiteral, assertPostgresOperationLogOperator,
}) {
  const finalFulfillmentId = confirmedOrder.fulfillmentTasks[0].fulfillmentId;
  const finalOutboundPrint = await postJson(
    baseUrl,
    `/api/fulfillments/${finalFulfillmentId}/print`,
    {
      templateId: "tpl-p0-pickup-note",
      documentType: "pickup_note",
      printDeviceId: "PRN-LIVE-PAPER-001",
      printAction: "first_print",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  const finalOutboundPrintCallback = await postJson(
    baseUrl,
    `/api/print-jobs/${finalOutboundPrint.printJob.printJobId}/driver-status`,
    {
      status: "printed",
      adapterName: "postgres-live-dot-matrix",
      eventSource: "driver_callback",
      driverStatus: "completed",
      eventAt: "2026-07-02T10:30:00.000Z",
      operatorId: "PRINT-DRIVER",
    },
    { headers: printDriverHeaders },
  );
  assert.equal(finalOutboundPrintCallback.printRecord.status, "printed");
  const finalPaperReady = await getJson(baseUrl, `/api/fulfillments/${finalFulfillmentId}`, { headers });
  const finalPaperDocument = finalPaperReady.paperOutboundDocument;
  const finalPaperHandoff = await postJson(
    baseUrl,
    `/api/fulfillments/${finalFulfillmentId}/paper-handoff`,
    {
      expectedRevision: finalPaperReady.revision,
      paperOutboundDocumentId: finalPaperDocument.paperOutboundDocumentId,
      paperDocumentVersion: finalPaperDocument.documentVersion,
      paperDocumentRevision: finalPaperDocument.revision,
      note: "PostgreSQL live 自提纸单交库房",
      idempotencyKey: "final-paper-handoff-live-api-001",
    },
    { headers },
  );
  assert.equal(finalPaperHandoff.paperOutboundDocument.status, "已交库房");
  const finalBeforeWarehouseExecution = await getJson(baseUrl, `/api/fulfillments/${finalFulfillmentId}`, { headers });
  const finalHandedPaperDocument = finalBeforeWarehouseExecution.paperOutboundDocument;
  const finalWarehouseExecution = await postJson(
    baseUrl,
    `/api/fulfillments/${finalFulfillmentId}/warehouse-execution`,
    {
      expectedRevision: finalBeforeWarehouseExecution.revision,
      paperOutboundDocumentId: finalHandedPaperDocument.paperOutboundDocumentId,
      paperDocumentVersion: finalHandedPaperDocument.documentVersion,
      paperDocumentRevision: finalHandedPaperDocument.revision,
      result: "实物已出库",
      actualQty: 10,
      physicalExecutorEmployeeId: "EMP-MD-LIVE-001",
      feedbackChannel: "纸面",
      executedAt: "2026-07-02T10:40:00.000Z",
      note: "库房按当前纸单完成实物出库",
      idempotencyKey: "final-warehouse-execution-live-api-001",
    },
    { headers },
  );
  assert.equal(finalWarehouseExecution.status, "待确认自提交付");
  const finalDeliveryReady = await getJson(baseUrl, `/api/fulfillments/${finalFulfillmentId}`, { headers });
  const completedFulfillment = await postJson(
    baseUrl,
    `/api/fulfillments/${finalFulfillmentId}/complete`,
    {
      fulfillmentId: finalFulfillmentId,
      actualQty: 10,
      expectedRevision: finalDeliveryReady.revision,
      confirmedFinalDelivery: true,
      operatorId: "U-SPOOFED",
      completedAt: "2026-07-02T11:00:00.000Z",
      remark: "postgres live fulfillment action route",
    },
    { headers },
  );
  assert.equal(completedFulfillment.status, "已交付");
  assert.ok(completedFulfillment.operationLogId);
  assertPostgresOperationLogOperator(queryJson, completedFulfillment.operationLogId);
  assert.equal(completedFulfillment.inventoryDeductionMode, "already_deducted_at_physical_outbound");
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status, 'actualQty', actual_qty) AS result FROM fulfillment_records WHERE id = ${sqlLiteral(
        confirmedOrder.fulfillmentTasks[0].fulfillmentId,
      )};`,
    ).status,
    "已交付",
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM operation_logs WHERE target_type = 'fulfillment' AND target_id = ${sqlLiteral(
          confirmedOrder.fulfillmentTasks[0].fulfillmentId,
        )} AND action = 'confirm_self_pickup_final_delivery';`,
        { capture: true },
      ).trim(),
    ),
    1,
  );
  const inventoryAfterFulfillment = queryJson(
    "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';",
  );
  assert.equal(Number(inventoryAfterFulfillment.onHand), 2474);
  assert.equal(Number(inventoryAfterFulfillment.reserved), 1320);
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status) AS result FROM inventory_reservations WHERE order_line_id = ${sqlLiteral(
        confirmedOrder.orderLines[0].id,
      )};`,
    ).status,
    "已出库",
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type = 'warehouse_physical_outbound' AND source_id = ${sqlLiteral(
          confirmedOrder.fulfillmentTasks[0].fulfillmentId,
        )};`,
        { capture: true },
      ).trim(),
    ),
    1,
  );
}
