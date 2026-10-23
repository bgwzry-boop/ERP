export function createProductionMachineQueueReadService({ now = () => new Date() } = {}) {
  return {
    async buildMachineQueue({ workspace, query = {} } = {}) {
      requireWorkspaceRepository(workspace, "productionScheduleRecordRepository", "listProductionScheduleRecords");
      requireWorkspaceRepository(workspace, "productionPackingReadRepository", "listProductionTasks");

      const filters = normalizeQuery(query);
      const productionScheduleRecords = await workspace.productionScheduleRecordRepository.listProductionScheduleRecords({
        workspace,
        filters: {},
      });
      workspace.productionScheduleRecords = productionScheduleRecords;

      const candidates = await readAllQueueCandidates(workspace, filters);
      const sequences = new Map();
      const queueWorkspace = { ...workspace, productionScheduleRecords };
      const rows = candidates
        .map((item) => buildQueueItem(queueWorkspace, item))
        .filter(Boolean)
        .filter((item) => matchesFilters(item, filters))
        .sort(sortQueueItems)
        .map((item) => {
          const queueSeq = (sequences.get(item.machineId) || 0) + 1;
          sequences.set(item.machineId, queueSeq);
          return { ...item, queueSeq };
        });

      return {
        items: rows,
        machines: buildMachineSummaries(rows),
        total: rows.length,
        generatedAt: now().toISOString(),
        source: "derived_from_production_tasks",
        note: "第一版机台排产队列由已发布排产或跨日继续生产任务派生；不代表完整排班、插单或产能排程引擎。",
      };
    },
  };
}

async function readAllQueueCandidates(workspace, filters) {
  const items = [];
  const seen = new Set();
  let total = null;
  for (let page = 1; ; page += 1) {
    // Customer display names exist only after queue projection; filtering the
    // underlying task rows first would discard valid customer-name matches.
    const result = await workspace.productionPackingReadRepository.listProductionTasks({
      workspace,
      query: {
        status: filters.status || "open",
        machineId: filters.machineId,
        taskType: filters.taskType,
        keyword: "",
        pageSize: 200,
        page,
      },
    });
    if (!Array.isArray(result?.items)) throw queueReadConflict();
    if (result.total !== undefined) {
      const nextTotal = Number(result.total);
      if (!Number.isSafeInteger(nextTotal) || nextTotal < 0 || (total !== null && nextTotal !== total)) {
        throw queueReadConflict();
      }
      total = nextTotal;
    }
    for (const item of result.items) {
      const id = cleanText(item?.productionTaskId ?? item?.productionTask?.productionTaskId);
      if (!id || seen.has(id)) throw queueReadConflict();
      seen.add(id);
      items.push(item);
    }
    if (total !== null) {
      if (items.length > total || (!result.items.length && items.length < total)) throw queueReadConflict();
      if (items.length === total) return items;
    } else if (result.items.length < 200) {
      // Older in-memory callers can supply an unpaged short collection.
      return items;
    }
  }
}

function queueReadConflict() {
  return Object.assign(new Error("机台队列读取期间发生变化或来源不完整，请刷新后重试。"), {
    statusCode: 409,
    code: "PRODUCTION_QUEUE_READ_CONFLICT",
  });
}

function normalizeQuery(query) {
  return {
    machineId: getQueryValue(query, "machineId") || getQueryValue(query, "currentMachineId"),
    taskType: getQueryValue(query, "taskType") || getQueryValue(query, "processType"),
    status: getQueryValue(query, "status") || "open",
    keyword: getQueryValue(query, "keyword"),
  };
}

function buildQueueItem(workspace, item) {
  const productionTask = item?.productionTask ?? {};
  const productionTaskId = cleanText(item?.productionTaskId ?? productionTask.productionTaskId);
  if (!productionTaskId) return null;

  const status = cleanText(productionTask.taskStatus ?? productionTask.status);
  if (isCompletedStatus(status)) return null;

  const publishedScheduleId = cleanText(productionTask.publishedScheduleId);
  const dailyProgress = normalizeDailyProgress(item?.dailyProgress);
  const carryOver = dailyProgress?.carryOver === true || status === "跨日继续" || status === "待完工确认";
  if (!publishedScheduleId && !carryOver) return null;

  const orderLine = item?.orderLine ?? findOrderLine(workspace, item?.orderLineId ?? productionTask.orderLineId) ?? {};
  const orderLineId = cleanText(item?.orderLineId ?? productionTask.orderLineId ?? orderLine.orderLineId ?? orderLine.id);
  const machineId = cleanText(productionTask.machineId) || inferMachineId(productionTask.taskType);
  const plannedQty = toNonNegativeInteger(productionTask.plannedQty ?? orderLine.originalQty ?? orderLine.qty);
  const remainingQty = dailyProgress ? toNonNegativeInteger(dailyProgress.remainingQty) : plannedQty;
  const createdAt = cleanText(productionTask.createdAt);
  const scheduleRecord = findScheduleRecord(workspace, { productionTaskId, publishedScheduleId, machineId });

  return {
    scheduleRecordId:
      cleanText(scheduleRecord?.scheduleRecordId) ||
      (publishedScheduleId
        ? `SQR-${safeRecordPart(publishedScheduleId)}`
        : `SQR-CARRY-${safeRecordPart(productionTaskId)}`),
    revision: Math.max(1, toNonNegativeInteger(scheduleRecord?.revision ?? 1)),
    queueSeq: 0,
    manualQueueSeq: toNonNegativeInteger(scheduleRecord?.queueSeq),
    machineId,
    machineLabel: machineId,
    publishedScheduleId,
    productionTaskId,
    orderLineId,
    taskType: cleanText(productionTask.taskType) || "制袋",
    status,
    taskStatus: status,
    queueReason: publishedScheduleId ? "已发布排产" : "跨日继续",
    customerId: cleanText(orderLine.customerId),
    customerName: findCustomerName(workspace, orderLine.customerId),
    productName: cleanText(orderLine.productName ?? orderLine.product),
    size: cleanText(orderLine.size),
    bagColor: cleanText(orderLine.bagColor ?? orderLine.color),
    handleType: cleanText(orderLine.handleType ?? orderLine.handle),
    style: cleanText(orderLine.style),
    plannedQty,
    remainingQty,
    dailyProgress,
    sequenceUpdatedAt: cleanText(scheduleRecord?.updatedAt),
    sequenceUpdatedBy: cleanText(scheduleRecord?.updatedBy),
    sequenceRemark: cleanText(scheduleRecord?.remark),
    scheduleRecordSource: cleanText(scheduleRecord?.source),
    createdAt,
    queueSortAt: createdAt || cleanText(item?.latestReport?.createdAt ?? item?.latestReport?.completedAt),
  };
}

function normalizeDailyProgress(progress) {
  if (!progress || typeof progress !== "object") return null;
  const cumulativeQualifiedQty = toNonNegativeInteger(progress.cumulativeQualifiedQty);
  const remainingQty = toNonNegativeInteger(progress.remainingQty);
  const latestDailyQualifiedQty = toNonNegativeInteger(progress.latestDailyQualifiedQty);
  if (cumulativeQualifiedQty <= 0 && remainingQty <= 0 && latestDailyQualifiedQty <= 0) return null;
  return {
    latestReportId: cleanText(progress.latestReportId),
    progressDate: cleanText(progress.progressDate),
    latestDailyQualifiedQty,
    cumulativeQualifiedQty,
    remainingQty,
    plannedQty: toNonNegativeInteger(progress.plannedQty),
    carryOver: progress.carryOver === true || remainingQty > 0,
    nextWorkDate: cleanText(progress.nextWorkDate),
    machineCount:
      progress.machineCount === undefined || progress.machineCount === null
        ? null
        : Math.trunc(Number(progress.machineCount)),
    machineCountAffectsInventory: false,
    inventoryCreated: false,
    reservationCreated: false,
    packingTaskCreated: false,
  };
}

function matchesFilters(item, filters) {
  if (filters.machineId && item.machineId !== filters.machineId) return false;
  if (filters.taskType && item.taskType !== filters.taskType) return false;
  if (filters.status && filters.status !== "open" && filters.status !== "未完成" && item.status !== filters.status) {
    return false;
  }
  const keyword = cleanText(filters.keyword).toLowerCase();
  if (!keyword) return true;
  return [
    item.machineId,
    item.publishedScheduleId,
    item.productionTaskId,
    item.orderLineId,
    item.customerName,
    item.productName,
    item.size,
    item.bagColor,
    item.handleType,
    item.style,
    item.status,
  ].some((value) => cleanText(value).toLowerCase().includes(keyword));
}

function sortQueueItems(left, right) {
  if (left.machineId !== right.machineId) return left.machineId.localeCompare(right.machineId);
  const leftManualSeq = toNonNegativeInteger(left.manualQueueSeq);
  const rightManualSeq = toNonNegativeInteger(right.manualQueueSeq);
  if (leftManualSeq || rightManualSeq) {
    if (leftManualSeq && rightManualSeq && leftManualSeq !== rightManualSeq) return leftManualSeq - rightManualSeq;
    if (leftManualSeq && !rightManualSeq) return -1;
    if (!leftManualSeq && rightManualSeq) return 1;
  }
  const leftCarryOver = left.queueReason === "跨日继续" ? 0 : 1;
  const rightCarryOver = right.queueReason === "跨日继续" ? 0 : 1;
  if (leftCarryOver !== rightCarryOver) return leftCarryOver - rightCarryOver;
  const leftTime = Date.parse(left.queueSortAt || left.createdAt || "") || 0;
  const rightTime = Date.parse(right.queueSortAt || right.createdAt || "") || 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.productionTaskId.localeCompare(right.productionTaskId);
}

function buildMachineSummaries(items) {
  return Array.from(
    items.reduce((map, item) => {
      const machine = map.get(item.machineId) ?? {
        machineId: item.machineId,
        machineLabel: item.machineLabel || item.machineId,
        total: 0,
        plannedQty: 0,
        remainingQty: 0,
        items: [],
      };
      machine.total += 1;
      machine.plannedQty += toNonNegativeInteger(item.plannedQty);
      machine.remainingQty += toNonNegativeInteger(item.remainingQty);
      machine.items.push(item);
      map.set(item.machineId, machine);
      return map;
    }, new Map()).values(),
  ).sort((left, right) => left.machineId.localeCompare(right.machineId));
}

function findOrderLine(workspace, id) {
  const key = cleanText(id);
  return (workspace.orderLines ?? []).find((item) => item.id === key || item.orderLineId === key) ?? null;
}

function findCustomerName(workspace, customerId) {
  return (workspace.customers ?? []).find((customer) => customer.id === customerId)?.name ?? "";
}

function findScheduleRecord(workspace, { productionTaskId, publishedScheduleId, machineId }) {
  const records = (workspace.productionScheduleRecords ?? []).filter(
    (record) => !machineId || cleanText(record.machineId) === machineId,
  );
  const exact = records.filter((record) => productionTaskId && cleanText(record.productionTaskId) === productionTaskId);
  if (exact.length > 1) throw queueReadConflict();
  if (exact.length === 1) return exact[0];
  // Publication-only legacy records may fill a missing task link; a record
  // explicitly owned by another task must never supply revision/order/audit.
  const legacy = records.filter(
    (record) => !cleanText(record.productionTaskId) && publishedScheduleId && cleanText(record.publishedScheduleId) === publishedScheduleId,
  );
  if (legacy.length > 1) throw queueReadConflict();
  return legacy[0] ?? null;
}

function getQueryValue(query, key) {
  if (!query) return "";
  if (typeof query.get === "function") return cleanText(query.get(key));
  return cleanText(query instanceof Map ? query.get(key) : query[key]);
}

function inferMachineId(taskType) {
  return cleanText(taskType).includes("丝印") ? "PRINT-01" : "BAG-01";
}

function isCompletedStatus(status) {
  const text = cleanText(status);
  return text === "已完成" || text.toLowerCase() === "completed" || text.toLowerCase() === "done";
}

function safeRecordPart(value) {
  return cleanText(value).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "TASK";
}

function toNonNegativeInteger(value) {
  return Math.max(0, Math.trunc(Number(value ?? 0)) || 0);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function requireWorkspaceRepository(workspace, repositoryKey, methodName) {
  if (typeof workspace?.[repositoryKey]?.[methodName] !== "function") {
    throw new TypeError(`workspace.${repositoryKey}.${methodName} must be a function`);
  }
}
