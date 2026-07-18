export function buildFulfillmentActionRecord(overrides = {}) {
  const fulfillmentId = overrides.fulfillmentId ?? "F001";
  return {
    fulfillmentId,
    id: fulfillmentId,
    bizNo: fulfillmentId,
    orderLineId: overrides.orderLineId ?? "ORD-0629-001-01",
    lineId: overrides.orderLineId ?? "ORD-0629-001-01",
    customerId: overrides.customerId ?? "C001",
    customerSnapshot: { name: "张三服饰" },
    method: overrides.method ?? "自提",
    expectedQty: overrides.expectedQty ?? 500,
    qty: overrides.expectedQty ?? 500,
    actualQty: overrides.actualQty ?? 500,
    status: overrides.status ?? "待出库",
    latestNeededAt: "2026-07-02T15:00:00.000Z",
    deliveredAt: overrides.deliveredAt ?? "",
    confirmedAt: overrides.confirmedAt ?? "",
    confirmedBy: overrides.confirmedBy ?? "U-OFFICE-A",
    createdBy: "U-OFFICE-A",
    ...overrides,
  };
}

export function buildFulfillmentPrintRecord({ printRecordId, targetId }) {
  return {
    printRecordId,
    targetType: "fulfillment",
    targetId,
    templateId: "tpl-p0-fulfillment",
    batchNo: `${printRecordId}-BATCH`,
    status: "printed",
    printAction: "first_print",
    operatorId: "U-OFFICE-A",
    printedAt: "2026-07-02T10:40:00.000Z",
    createdAt: "2026-07-02T10:40:00.000Z",
  };
}

export function buildFulfillmentExceptionRecord({ exceptionId, fulfillmentId, todoId }) {
  return {
    exceptionId,
    fulfillmentId,
    exceptionType: "quantity_mismatch",
    expectedQty: 500,
    actualQty: 490,
    reason: "stock_shortage",
    status: "待办公室处理",
    todoId,
    reportedBy: "U-WAREHOUSE-A",
    createdAt: "2026-07-02T10:45:00.000Z",
  };
}

export function buildFulfillmentTodo({ todoId, refId }) {
  return {
    id: todoId,
    type: "数量差异待处理",
    customerId: "C001",
    ref: refId,
    summary: "张三服饰自提单数量差异，需办公室确认",
    latest: "2026-07-02T15:00:00.000Z",
    urgency: "异常",
    impact: "影响出库交付",
    createdBy: "U-WAREHOUSE-A",
  };
}

export function buildFulfillmentOperationLog({ logId, action, fulfillmentId }) {
  const before = buildFulfillmentActionRecord({ fulfillmentId, status: "待出库" });
  const after = buildFulfillmentActionRecord({ fulfillmentId, status: "待确认拉走", actualQty: 490 });
  return {
    id: logId,
    targetType: "fulfillment",
    targetId: fulfillmentId,
    action,
    before,
    after,
    reason: "postgres live fulfillment action",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:45:00.000Z",
    createdAt: "2026-07-02T10:45:00.000Z",
  };
}
