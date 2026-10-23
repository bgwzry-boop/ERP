export function resolveTodoReference(workspace, todo = {}) {
  const refId = cleanText(todo.refId) || cleanText(todo.ref);
  const refType = normalizeRefType(todo.refType) || normalizeRefType(inferTodoRefType(todo, refId));
  if (!refId) return referenceResult("missing", refType, refId, "待办缺少业务引用");
  if (supportedRefTypes.has(refType) && !getAllowedTodoReferenceTypes(todo).includes(refType)) {
    return referenceResult("missing", refType, refId, "引用类型与当前待办业务不兼容");
  }

  const targets = findReferenceTargets(workspace, refType, refId);
  if (targets.length > 1) return referenceResult("unverifiable", refType, refId, "引用匹配到多条业务记录，请选择明确的业务编号");
  if (targets.length === 1) {
    const targetId = referenceTargetId(targets[0], refType);
    if (!targetId) return referenceResult("unverifiable", refType, refId, "引用目标缺少明确业务编号");
    const customerIds = referenceCustomerIds(workspace, targets[0], refType);
    const todoCustomerId = cleanText(todo.customerId);
    if (hasCustomerConflict(customerIds, todoCustomerId)) {
      return referenceResult("unverifiable", refType, targetId, "待办与引用目标的客户归属不一致，请核对业务编号");
    }
    return referenceResult("valid", refType, targetId, "引用有效");
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
  "maintenance_task",
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
  maintenance_task: "设备任务",
};

export function getTodoReferenceTypeLabel(refType) {
  return referenceTypeLabels[normalizeRefType(refType)] ?? "其他业务";
}

export function getAllowedTodoReferenceTypes(todo = {}) {
  const type = cleanText(todo.type);
  if (type.includes("订单草稿")) return ["order_draft"];
  if (type.includes("库存修正")) return ["inventory_correction"];
  if (type.includes("对账") || type.includes("收款")) return ["statement"];
  if (type.includes("打印") || type.includes("标签") || type.includes("快递") || type.includes("快运") || type.includes("数量")) return ["fulfillment"];
  if (type.includes("缺货") || type.includes("库存")) return ["order_line", "inventory_item"];
  if (type.includes("生产") || type.includes("制袋") || type.includes("丝印")) return ["production_task"];
  if (type.includes("设备") || type.includes("报修") || type.includes("巡检") || type.includes("维护")) return ["maintenance_task"];
  const currentType = normalizeRefType(todo.refType) || normalizeRefType(inferTodoRefType(todo, cleanText(todo.refId ?? todo.ref)));
  return supportedRefTypes.has(currentType) ? [currentType] : [...TODO_REFERENCE_TYPES];
}

export function normalizeTodoReferenceForWrite(workspace, todo = {}) {
  const refId = cleanText(todo.refId) || cleanText(todo.ref);
  const refType = normalizeRefType(todo.refType) || normalizeRefType(inferTodoRefType(todo, refId));
  const normalized = { ...todo, ref: refId, refType, refId };
  const resolution = resolveTodoReference(workspace, normalized);
  if (resolution.referenceStatus === "valid") {
    return {
      ...normalized,
      ref: resolution.resolvedRefId,
      refType: resolution.resolvedRefType,
      refId: resolution.resolvedRefId,
    };
  }

  const error = new Error(resolution.referenceReason || "待办业务引用无效");
  error.code = getTodoReferenceErrorCode(resolution, refId, refType);
  error.referenceStatus = resolution.referenceStatus;
  error.refType = refType;
  error.refId = refId;
  throw error;
}

export function listTodoReferenceCandidates(workspace, todo = {}, limit = 20) {
  const current = resolveTodoReference(workspace, todo);
  if (current.referenceStatus === "valid") return [];
  const customerId = cleanText(todo.customerId);
  const allowedRefTypes = getAllowedTodoReferenceTypes(todo);
  const preferredType = allowedRefTypes[0];
  const candidates = allowedRefTypes.flatMap((refType) => {
    const rows = referenceRows(workspace, refType);
    const identityCounts = new Map();
    for (const target of rows) {
      const id = referenceTargetId(target, refType);
      identityCounts.set(id, (identityCounts.get(id) ?? 0) + 1);
    }
    return rows.map((target) => {
      const refId = referenceTargetId(target, refType);
      const customerIds = referenceCustomerIds(workspace, target, refType);
      if (!refId || identityCounts.get(refId) !== 1 || hasCustomerConflict(customerIds, customerId)) return null;
      return {
        refType,
        refId,
        label: `${getTodoReferenceTypeLabel(refType)} · ${refId}${referenceTargetStatus(target) ? ` · ${referenceTargetStatus(target)}` : ""}`,
        sameCustomer: Boolean(customerId) && customerIds.includes(customerId),
      };
    }).filter(Boolean);
  });

  return candidates
    .sort((left, right) => Number(right.sameCustomer) - Number(left.sameCustomer)
      || Number(right.refType === preferredType) - Number(left.refType === preferredType)
      || left.refId.localeCompare(right.refId, "zh-CN"))
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 20)))
    .map(({ sameCustomer: _sameCustomer, ...candidate }) => candidate);
}

function findReferenceTargets(workspace, refType, refId) {
  const rows = referenceRows(workspace, refType);
  const exact = rows.filter((item) => referenceTargetId(item, refType) === refId);
  if (exact.length) return exact;
  // Historical aliases remain usable only when they identify exactly one row.
  if (refType === "order_line") {
    return rows.filter((item) => cleanText(item.orderNo) === refId || cleanText(item.id).startsWith(`${refId}-`));
  }
  if (refType === "fulfillment") {
    return rows.filter((item) => {
      const lineId = cleanText(item.lineId ?? item.orderLineId);
      return lineId === refId || lineId.startsWith(`${refId}-`);
    });
  }
  if (refType === "statement") return rows.filter((item) => (item.lineIds ?? []).some((lineId) => cleanText(lineId) === refId));
  return [];
}

function referenceRows(workspace, refType) {
  if (refType === "order_draft") return workspace.orderDrafts ?? [];
  if (refType === "order_line") return workspace.orderLines ?? [];
  if (refType === "fulfillment") return workspace.fulfillments ?? [];
  if (refType === "statement") return workspace.statements ?? [];
  if (refType === "inventory_item") return workspace.inventories ?? workspace.inventoryRecords ?? [];
  if (refType === "inventory_correction") return workspace.inventoryCorrectionDrafts ?? [];
  if (refType === "production_task") return workspace.productionTasks ?? workspace.productionPacking?.productionTasks ?? [];
  if (refType === "maintenance_task") return workspace.maintenanceTasks ?? [];
  return [];
}

function referenceTargetId(target, refType) {
  if (refType === "inventory_item") return cleanText(target.id ?? target.inventoryKey);
  if (refType === "inventory_correction") return cleanText(target.id ?? target.correctionDraftId);
  if (refType === "production_task") return cleanText(target.id ?? target.productionTaskId);
  if (refType === "maintenance_task") return cleanText(target.id ?? target.taskId);
  return cleanText(target.id);
}

function referenceTargetStatus(target) {
  return cleanText(target.status ?? target.state ?? target.inventoryStatus ?? target.stage);
}

function referenceCustomerIds(workspace, target, refType) {
  const values = [cleanText(target.customerId)];
  if (refType === "fulfillment" || refType === "production_task") {
    const lineId = cleanText(target.lineId ?? target.orderLineId);
    const lines = (workspace.orderLines ?? []).filter((line) => cleanText(line.id) === lineId);
    values.push(...lines.map((line) => cleanText(line.customerId)));
  }
  return [...new Set(values.filter(Boolean))];
}

function hasCustomerConflict(customerIds, todoCustomerId) {
  return customerIds.length > 1 || Boolean(todoCustomerId && customerIds.some((id) => id !== todoCustomerId));
}

function inferTodoRefType(todo, refId) {
  const type = cleanText(todo.type);
  if (type.includes("设备") || type.includes("报修") || type.includes("巡检") || type.includes("维护")) return "maintenance_task";
  if (type.includes("订单草稿")) return "order_draft";
  if (type.includes("对账") || type.includes("收款")) return "statement";
  if (type.includes("打印") || type.includes("标签") || type.includes("快递") || type.includes("快运") || type.includes("数量")) return "fulfillment";
  if (type.includes("库存修正")) return "inventory_correction";
  if (refId.startsWith("ST-")) return "statement";
  if (refId.startsWith("DRAFT")) return "order_draft";
  if (refId.startsWith("F")) return "fulfillment";
  if (refId.startsWith("MT-")) return "maintenance_task";
  return "order_line";
}

export function getTodoReferenceErrorCode(resolution, refId, refType) {
  if (!refId) return "TODO_REFERENCE_REQUIRED";
  if (resolution.referenceReason === "待办与引用目标的客户归属不一致，请核对业务编号") return "TODO_REFERENCE_CUSTOMER_MISMATCH";
  if (!supportedRefTypes.has(refType)) return "TODO_REFERENCE_TYPE_UNSUPPORTED";
  if (resolution.referenceReason === "引用匹配到多条业务记录，请选择明确的业务编号") return "TODO_REFERENCE_AMBIGUOUS";
  if (resolution.referenceReason === "引用类型与当前待办业务不兼容") return "TODO_REFERENCE_TYPE_INCOMPATIBLE";
  return "TODO_REFERENCE_TARGET_NOT_FOUND";
}

function normalizeRefType(value) {
  return cleanText(value).toLowerCase();
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
