// A delivery, not its order line, owns a photo-retake task.
export function findDeliveryEvidenceRetakeTodo(workspace, fulfillment) {
  const id = String(fulfillment.id ?? fulfillment.fulfillmentId ?? '').trim();
  const lineId = String(fulfillment.lineId ?? fulfillment.orderLineId ?? '').trim();
  if (!id) return null;
  const open = (workspace.todos ?? []).filter(todo => todo.type === '照片待重拍' && !todo.handled && todo.status !== '已处理');
  const exact = open.filter(todo => (!todo.refType || todo.refType === 'fulfillment') && (todo.refId ?? todo.ref) === id);
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  if (!lineId) return null;
  const deliveries = (workspace.fulfillments ?? []).filter(row => (row.lineId ?? row.orderLineId) === lineId);
  if (deliveries.length !== 1 || (deliveries[0].id ?? deliveries[0].fulfillmentId) !== id) return null;
  const legacy = open.filter(todo => (!todo.refType || todo.refType === 'order_line') && (todo.refId ?? todo.ref) === lineId);
  return legacy.length === 1 ? legacy[0] : null;
}
