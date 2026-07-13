export function resolveTodoReference(workspace, todo = {}) {
  const refId = cleanText(todo.refId) || cleanText(todo.ref);
  const refType = normalizeRefType(todo.refType) || normalizeRefType(inferTodoRefType(todo, refId));
  if (!refId) return referenceResult("missing", refType, refId, "待办缺少业务引用");

  const target = findReferenceTarget(workspace, refType, refId);
  if (target) {
    return referenceResult("valid", refType, target.id, "引用有效");
  }
  if (!supportedRefTypes.has(refType)) {
    return referenceResult("unverifiable", refType, refId, "该引用类型暂不支持自动校验");
  }
  return referenceResult("missing", refType, refId, "引用目标不存在或已失效");
}

export const TODO_REFERENCE_TYPES = [
  "order_draft",
  "order_line",
  "fulfillment",
  "statement",
  "inventory_item",
  "inventory_correction",
  "production_task",
];

const supportedRefTypes = new Set(TODO_REFERENCE_TYPES);
const referenceTypeLabels = {
  order_draft: "订单草稿",
  order_line: "订单行",
  fulfillment: "出库交付",
  statement: "对账单",
  inventory_item: "库存货品",
  inventory_correction: "库存修正",
  production_task: "生产任务",
};

export function listTodoReferenceCandidates(workspace, todo = {}, limit = 20) {
  const current = resolveTodoReference(workspace, todo);
  if (current.referenceStatus === "valid") return [];
  const customerId = cleanText(todo.customerId);
  const preferredType = normalizeRefType(todo.refType) || normalizeRefType(inferTodoRefType(todo, cleanText(todo.refId ?? todo.ref)));
  const candidates = TODO_REFERENCE_TYPES.flatMap((refType) => referenceRows(workspace, refType).map((target) => {
    const refId = referenceTargetId(target, refType);
    return refId ? {
      refType,
      refId,
      label: `${referenceTypeLabels[refType]} · ${refId}${referenceTargetStatus(target) ? ` · ${referenceTargetStatus(target)}` : ""}`,
      sameCustomer: Boolean(customerId) && referenceCustomerId(workspace, target, refType) === customerId,
    } : null;
  }).filter(Boolean));

  return candidates
    .sort((left, right) => Number(right.sameCustomer) - Number(left.sameCustomer)
      || Number(right.refType === preferredType) - Number(left.refType === preferredType)
      || left.refId.localeCompare(right.refId, "zh-CN"))
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 20)))
    .map(({ sameCustomer: _sameCustomer, ...candidate }) => candidate);
}

function findReferenceTarget(workspace, refType, refId) {
  if (refType === "order_draft") return findById(workspace.orderDrafts, refId);
  if (refType === "order_line") {
    return findById(workspace.orderLines, refId)
      ?? (workspace.orderLines ?? []).find((item) => cleanText(item.orderNo) === refId || cleanText(item.id).startsWith(`${refId}-`));
  }
  if (refType === "fulfillment") {
    return findById(workspace.fulfillments, refId)
      ?? (workspace.fulfillments ?? []).find((item) => {
        const lineId = cleanText(item.lineId ?? item.orderLineId);
        return lineId === refId || lineId.startsWith(`${refId}-`);
      });
  }
  if (refType === "statement") {
    return findById(workspace.statements, refId)
      ?? (workspace.statements ?? []).find((item) => (item.lineIds ?? []).some((lineId) => cleanText(lineId) === refId));
  }
  if (refType === "inventory_item") return findById(workspace.inventories ?? workspace.inventoryRecords, refId, "inventoryKey");
  if (refType === "inventory_correction") return findById(workspace.inventoryCorrectionDrafts, refId, "correctionDraftId");
  if (refType === "production_task") return findById(workspace.productionTasks ?? workspace.productionPacking?.productionTasks, refId, "productionTaskId");
  return null;
}

function referenceRows(workspace, refType) {
  if (refType === "order_draft") return workspace.orderDrafts ?? [];
  if (refType === "order_line") return workspace.orderLines ?? [];
  if (refType === "fulfillment") return workspace.fulfillments ?? [];
  if (refType === "statement") return workspace.statements ?? [];
  if (refType === "inventory_item") return workspace.inventories ?? workspace.inventoryRecords ?? [];
  if (refType === "inventory_correction") return workspace.inventoryCorrectionDrafts ?? [];
  if (refType === "production_task") return workspace.productionTasks ?? workspace.productionPacking?.productionTasks ?? [];
  return [];
}

function referenceTargetId(target, refType) {
  if (refType === "inventory_item") return cleanText(target.id ?? target.inventoryKey);
  if (refType === "inventory_correction") return cleanText(target.id ?? target.correctionDraftId);
  if (refType === "production_task") return cleanText(target.id ?? target.productionTaskId);
  return cleanText(target.id);
}

function referenceTargetStatus(target) {
  return cleanText(target.status ?? target.state ?? target.inventoryStatus ?? target.stage);
}

function referenceCustomerId(workspace, target, refType) {
  const direct = cleanText(target.customerId);
  if (direct) return direct;
  if (refType === "fulfillment" || refType === "production_task") {
    const lineId = cleanText(target.lineId ?? target.orderLineId);
    return cleanText((workspace.orderLines ?? []).find((line) => cleanText(line.id) === lineId)?.customerId);
  }
  return "";
}

function inferTodoRefType(todo, refId) {
  const type = cleanText(todo.type);
  if (type.includes("订单草稿")) return "order_draft";
  if (type.includes("对账") || type.includes("收款")) return "statement";
  if (type.includes("打印") || type.includes("标签") || type.includes("快递") || type.includes("快运") || type.includes("数量")) return "fulfillment";
  if (type.includes("库存修正")) return "inventory_correction";
  if (refId.startsWith("ST-")) return "statement";
  if (refId.startsWith("DRAFT")) return "order_draft";
  if (refId.startsWith("F")) return "fulfillment";
  return "order_line";
}

function normalizeRefType(value) {
  return cleanText(value).toLowerCase();
}

function findById(rows, id, alternateKey = "") {
  return (rows ?? []).find((item) => cleanText(item?.id ?? item?.[alternateKey]) === id) ?? null;
}

function referenceResult(status, refType, resolvedRefId, reason) {
  return {
    referenceStatus: status,
    resolvedRefType: refType,
    resolvedRefId,
    referenceReason: reason,
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}
