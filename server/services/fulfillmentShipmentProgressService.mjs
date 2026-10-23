const clean = value => String(value ?? '').trim();
const quantity = value => {
  if (value === null || value === undefined || clean(value) === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};
const physicallyIssued = item => Boolean(item.physicalOutboundAt ?? item.physical_outbound_at);
const legacyUnverified = item => !physicallyIssued(item) && (item.finalDeliveryAt || item.final_delivery_at || item.deliveredAt || item.delivered_at || ['已出库','已交付','已完成'].includes(item.status));

// Full workspace aggregate: planned tasks never count as physical shipments.
// Missing historical execution evidence remains unknown rather than zero.
export function buildFulfillmentShipmentProgress(workspace, fulfillment, orderLine = {}) {
  const lineId = clean(fulfillment.lineId ?? fulfillment.orderLineId ?? fulfillment.order_line_id);
  const orderedQty = quantity(orderLine.originalQty ?? orderLine.qty);
  const related = lineId ? (workspace.fulfillments ?? []).filter(item => clean(item.lineId ?? item.orderLineId ?? item.order_line_id) === lineId) : [];
  const issued = related.filter(physicallyIssued);
  const quantities = issued.map(item => quantity(item.actualQty ?? item.actual_qty));
  const known = Boolean(lineId) && !related.some(legacyUnverified) && quantities.every(value => value !== null);
  const totalIssuedQty = known ? quantities.reduce((sum, value) => sum + value, 0) : null;
  const currentIssued = physicallyIssued(fulfillment);
  const currentQty = currentIssued ? quantity(fulfillment.actualQty ?? fulfillment.actual_qty) : quantity(fulfillment.expectedQty ?? fulfillment.expected_qty ?? fulfillment.qty);
  return {
    orderedQty,
    totalIssuedQty,
    currentQty,
    currentQtyLabel: currentIssued ? '本次实出' : '本次计划',
    remainingQty: orderedQty !== null && totalIssuedQty !== null ? Math.max(0, orderedQty - totalIssuedQty) : null,
    evidenceComplete: known,
  };
}
