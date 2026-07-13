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

const supportedRefTypes = new Set([
  "order_draft",
  "order_line",
  "fulfillment",
  "statement",
  "inventory_item",
  "inventory_correction",
  "production_task",
]);

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
