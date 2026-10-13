export function decideFulfillmentAction({ current, action, body = {} }) {
  if (!current) {
    const error = new Error("履约单不存在。");
    error.code = "FULFILLMENT_NOT_FOUND";
    throw error;
  }
  if (body.expectedRevision != null && Number(body.expectedRevision) !== Number(current.revision ?? 1)) {
    const error = new Error("履约单版本已变化。");
    error.code = "FULFILLMENT_REVISION_CONFLICT";
    error.statusCode = 409;
    throw error;
  }
  const nextStatus = typeof action === "string" ? action : action?.nextStatus;
  const auditAction = typeof action === "string" ? action : action?.auditAction;
  if (!nextStatus || !auditAction) {
    throw new TypeError("Fulfillment action requires a next status and audit action.");
  }
  return {
    nextStatus,
    auditAction,
    patch: body,
  };
}

export function resolveWarehouseExecutionFulfillmentStatus(result, method) {
  if (result === "已备货") return "已备货";
  if (result === "数量不符") return "数量差异待处理";
  if (result === "无法出库") return "无法出库";
  if (method === "delivery") return "待司机装车";
  if (method === "express_ltl") return "待承运方拉走";
  return "待确认自提交付";
}

export function resolveQuantityVarianceFulfillmentStatus(result) {
  const statuses = {
    "按实际数量出库": "差异已确认待重新出库",
    "补货后再出库": "待补货",
    "赠送数量": "差异已确认待重新出库",
    "暂停等待确认": "数量差异待处理",
    "作废本次出库指令": "已取消",
  };
  return statuses[result] ?? "数量差异待处理";
}

export function createFulfillmentActionOrchestrator(repository) {
  if (typeof repository?.recordFulfillmentAction !== "function"
    && typeof repository?.recordFulfillmentPrint !== "function") {
    throw new TypeError("repository must record fulfillment actions or prints");
  }
  function apply(method, { current, action, body, ...transaction }) {
    if (typeof repository[method] !== "function") {
      throw new TypeError(`repository.${method} must be a function`);
    }
    const decision = decideFulfillmentAction({ current, action, body });
    return repository[method]({ ...transaction, decision });
  }
  return {
    applyAction(input) { return apply("recordFulfillmentAction", input); },
    applyPrint(input) { return apply("recordFulfillmentPrint", input); },
  };
}
