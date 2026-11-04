// P2-03（负责人 2026-11-04）：一单分几批发，要始终能看出是同一单。
// 先发时剩下的数量会拆成「续做」明细（splitFromOrderLineId 指回原明细），这里把原明细和它所有续做明细
// 串成一个「分批发货」组：整单数量、每一批发了多少、几包、还剩多少。
// 送货单、办公室出库页面、客户的订单状态都用这里的结果，保证三边看到的一致。
const CLOSED_LINE = /作废|取消|已关闭/;
const SHIPPED_STATUS = /已交付|已出库|已拉走|配送中|已签收/;

function clean(value) {
  return String(value ?? "").trim();
}

function lineIdOf(row) {
  return clean(row?.orderLineId ?? row?.id ?? row?.order_line_id);
}

function parentOf(row) {
  return clean(row?.splitFromOrderLineId ?? row?.split_from_order_line_id);
}

export function findSplitRootId(orderLines = [], orderLineId) {
  const byId = new Map(orderLines.map((row) => [lineIdOf(row), row]));
  let current = clean(orderLineId);
  for (let guard = 0; guard < 50; guard += 1) {
    const parent = parentOf(byId.get(current));
    if (!parent || !byId.has(parent)) return current;
    current = parent;
  }
  return current;
}

export function isShippedFulfillment(row = {}) {
  return Boolean(row.physicalOutboundAt || row.physical_outbound_at || row.loadedAt || row.loaded_at
    || row.deliveredAt || row.delivered_at || row.finalDeliveryAt || row.final_delivery_at)
    || SHIPPED_STATUS.test(clean(row.status));
}

/** The batches of one order item, or null when the item was never split. */
export function buildDeliveryBatchFamily({ orderLines = [], fulfillments = [], packages = [] } = {}, orderLineId) {
  const rootId = findSplitRootId(orderLines, orderLineId);
  const members = [];
  const queue = [rootId];
  while (queue.length && members.length < 50) {
    const id = queue.shift();
    const line = orderLines.find((row) => lineIdOf(row) === id);
    if (!line) continue;
    members.push(line);
    orderLines.filter((row) => parentOf(row) === id)
      .sort((a, b) => clean(a.createdAt ?? a.created_at).localeCompare(clean(b.createdAt ?? b.created_at)) || lineIdOf(a).localeCompare(lineIdOf(b)))
      .forEach((row) => queue.push(lineIdOf(row)));
  }
  if (members.length < 2) return null;
  const active = members.filter((line) => !CLOSED_LINE.test(clean(line.lineStatus ?? line.status ?? line.line_status)));
  const batches = active.map((line, index) => {
    const id = lineIdOf(line);
    const delivery = fulfillments.filter((row) => clean(row.orderLineId ?? row.lineId ?? row.order_line_id) === id);
    const shippedRows = delivery.filter(isShippedFulfillment);
    const shipped = delivery.length > 0 && shippedRows.length === delivery.length;
    const plannedQty = Number(line.qty ?? line.originalQty ?? line.original_qty ?? 0) || 0;
    const qty = shipped
      ? shippedRows.reduce((sum, row) => sum + (Number(row.actualQty ?? row.actual_qty ?? row.expectedQty ?? row.expected_qty) || 0), 0)
      : plannedQty;
    const fulfillmentIds = delivery.map((row) => clean(row.fulfillmentId ?? row.id));
    const packageCount = packages.filter((row) => fulfillmentIds.includes(clean(row.fulfillmentId ?? row.fulfillment_id))
      && !/作废|失效|voided|invalidated/.test(clean(row.status))).length;
    const shippedAt = shippedRows.map((row) => clean(row.physicalOutboundAt ?? row.loadedAt ?? row.deliveredAt ?? row.finalDeliveryAt)).filter(Boolean).sort()[0] || "";
    return { batchNo: index + 1, orderLineId: id, fulfillmentIds, qty, plannedQty, packageCount, shipped, shippedAt };
  });
  const orderedQty = batches.reduce((sum, batch) => sum + batch.plannedQty, 0);
  const shippedQty = batches.filter((batch) => batch.shipped).reduce((sum, batch) => sum + batch.qty, 0);
  return {
    rootOrderLineId: rootId,
    orderedQty,
    shippedQty,
    pendingQty: Math.max(0, orderedQty - batches.filter((batch) => batch.shipped).reduce((sum, batch) => sum + batch.plannedQty, 0)),
    batchCount: batches.length,
    batches,
  };
}

/** One line for a delivery note (owner wording): "下单 10000 个，已发 6230 个，剩余待发 3770 个".
 *  已发 includes this delivery; 剩余待发 is what the other, not yet shipped batches still carry. */
export function describeBatchProgress(family, { fulfillmentId, orderLineId, quantity } = {}) {
  if (!family) return "";
  const batch = family.batches.find((row) => (fulfillmentId && row.fulfillmentIds.includes(clean(fulfillmentId))) || row.orderLineId === clean(orderLineId));
  if (!batch) return "";
  const thisQty = Number(quantity ?? batch.qty) || 0;
  const others = family.batches.filter((row) => row !== batch);
  const shipped = others.filter((row) => row.shipped).reduce((sum, row) => sum + row.qty, 0) + thisQty;
  const pending = others.filter((row) => !row.shipped).reduce((sum, row) => sum + row.plannedQty, 0);
  return `下单 ${family.orderedQty} 个，已发 ${shipped} 个，剩余待发 ${pending} 个`;
}
