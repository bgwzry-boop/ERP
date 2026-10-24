const executedStatuses = new Set(["配送中", "已交付", "已完成", "已出库", "已拉走"]);

export function hasExecutedDelivery(record = {}) {
  return executedStatuses.has(String(record.status ?? "").trim()) ||
    ["physicalOutboundAt", "loadedAt", "finalDeliveryAt", "deliveredAt",
      "physical_outbound_at", "loaded_at", "final_delivery_at", "delivered_at"]
      .some((key) => Boolean(record[key]));
}

export function assertOrderMutationDeliveryNotExecuted(input) {
  const orderLineId = input.orderLine?.orderLineId ?? input.orderLine?.id;
  if ((input.workspace?.fulfillments ?? []).some((record) =>
    (record.orderLineId ?? record.lineId) === orderLineId && hasExecutedDelivery(record))) {
    throw Object.assign(new Error("本订单已有实际出库或配送记录，不能直接作废或改量。"), {
      statusCode: 409, code: "ERP_ORDER_DELIVERY_ALREADY_EXECUTED",
    });
  }
}

export function orderDeliveryNotExecutedSql(alias) {
  return `${alias}.status NOT IN ('配送中', '已交付', '已完成', '已出库', '已拉走')
    AND ${alias}.physical_outbound_at IS NULL
    AND ${alias}.loaded_at IS NULL
    AND ${alias}.final_delivery_at IS NULL
    AND ${alias}.delivered_at IS NULL`;
}

export function assertOrderMutationRevision(input) {
  const id = input.orderLine?.orderLineId ?? input.orderLine?.id;
  const current = input.workspace?.orderLines?.find(line => (line.orderLineId ?? line.id) === id);
  if (!current || Number(current.revision ?? 1) !== Number(input.expectedOrderLineRevision ?? input.orderLine?.revision ?? 1)) throw Object.assign(new Error("订单版本已变化，未执行本次修改。"), {statusCode:409,code:"ORDER_LINE_REVISION_CONFLICT"});
}
