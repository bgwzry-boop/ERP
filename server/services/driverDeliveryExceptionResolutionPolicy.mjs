const text = (value) => String(value ?? "").trim();
const fail = (code, message, statusCode = 409) => ({ error: true, statusCode, code, message });
export function prepareDriverDeliveryExceptionResolution({ workspace, fulfillmentId, body = {}, operatorId, now = new Date() }) {
  const before = (workspace.fulfillments ?? []).find((item) => text(item.id ?? item.fulfillmentId) === fulfillmentId);
  if (!before) return fail("FULFILLMENT_NOT_FOUND", "出库任务不存在。", 404);
  if (!["送货", "delivery"].includes(before.method) || before.status !== "送货异常" || before.finalDeliveryAt || before.deliveredAt) return fail("DRIVER_EXCEPTION_NOT_OPEN", "当前任务不是待处理的送货异常，请刷新。");
  const actualQty = Number(before.actualQty ?? before.expectedQty ?? before.qty);
  if (!Number.isSafeInteger(actualQty) || actualQty <= 0) return fail("DRIVER_EXCEPTION_QUANTITY_UNVERIFIED", "原出库数量不完整，不能直接恢复配送，请先核实。", 422);
  if (before.loadedAt && (!Number.isFinite(Date.parse(before.loadedAt)) || !before.physicalOutboundAt)) return fail("DRIVER_EXCEPTION_LOADING_UNVERIFIED", "装车与实出记录不完整，请先核实。", 422);
  const revision = Number(body.expectedRevision);
  if (!Number.isInteger(revision) || revision < 1) return fail("EXPECTED_REVISION_REQUIRED", "请重新读取当前任务版本。", 422);
  if (revision !== Number(before.revision)) return fail("BUSINESS_WRITE_CONFLICT", "任务已被更新，请刷新后重新核对。");
  if (body.confirmed !== true || body.quantityVerified !== true) return fail("DRIVER_EXCEPTION_CONFIRMATION_REQUIRED", "请核对原出库数量、包裹和单据，并确认恢复。", 422);
  const reason = text(body.reason);
  if (reason.length < 2 || reason.length > 500) return fail("DRIVER_EXCEPTION_RESOLUTION_REASON_REQUIRED", "请填写 2–500 字处理说明。", 422);
  const open = (workspace.fulfillmentExceptions ?? []).filter((item) => text(item.fulfillmentId) === fulfillmentId && item.exceptionType === "delivery_exception" && !["已解决", "已作废"].includes(item.status));
  const exception = open.find((item) => text(item.exceptionId ?? item.id) === text(body.exceptionId));
  if (!exception) return fail("DRIVER_EXCEPTION_NOT_OPEN", "该异常已处理或不属于当前任务，请刷新。");
  const currentTodo = (workspace.todos ?? []).find((item) => text(item.id ?? item.todoId) === text(exception.todoId));
  if (!currentTodo || currentTodo.type !== "送货异常待处理" || text(currentTodo.refId ?? currentTodo.ref) !== fulfillmentId) return fail("DRIVER_EXCEPTION_TODO_INVALID", "原异常待办关联不完整，请先核实业务引用。");
  const remaining = open.filter((item) => item !== exception);
  const nextStatus = remaining.length ? "送货异常" : before.loadedAt ? "配送中" : "待送货";
  const timestamp = now.toISOString();
  return {
    ok: true, before, exception, currentTodo, reason, remainingCount: remaining.length,
    after: { ...before, status: nextStatus, driverStatus: nextStatus,
      exceptionReason: remaining.length ? before.exceptionReason : "",
      exceptionReasonCode: remaining.length ? before.exceptionReasonCode : "",
      exceptionOccurredAt: remaining.length ? before.exceptionOccurredAt : "" },
    updatedException: { ...exception, status: "已解决" },
    todo: currentTodo.handled || currentTodo.status === "已处理" ? { ...currentTodo } : { ...currentTodo, handled: true, status: "已处理", handledBy: operatorId, handledAt: timestamp,
      handlingResult: `${reason}；${remaining.length ? `仍有 ${remaining.length} 条异常待处理` : nextStatus}`, updatedAt: timestamp },
  };
}
