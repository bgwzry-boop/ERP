export function createInitialProductionPackingState(orderLines = [], { buildPackingTaskId } = {}) {
  const buildTaskId = typeof buildPackingTaskId === "function" ? buildPackingTaskId : (line) => `PACK-${line?.id ?? "UNKNOWN"}`;
  const packingTasks = (Array.isArray(orderLines) ? orderLines : []).filter(isPackingReadyLine).map((line) => ({
    packingTaskId: buildTaskId(line),
    orderLineId: line.id,
    plannedQty: Number(line.qty ?? line.originalQty ?? 0),
    actualPackedQty: 0,
    packageCount: inferPackageCountFromQty(line.qty),
    status: "待打包",
    source: "local_seed",
  }));

  return {
    reportResultsByLineId: {},
    productionTasks: [],
    packingTasks,
    lastSource: "local",
    taskListSource: "local",
    taskListLoading: false,
    taskListError: "",
    taskListLastSyncedAt: "",
    productionTaskTotal: 0,
    packingTaskTotal: packingTasks.length,
    scheduleQueueItems: [],
    scheduleQueueMachines: [],
    scheduleQueueTotal: 0,
    scheduleQueueSource: "local",
    scheduleQueueError: "",
    scheduleQueueLastSyncedAt: "",
    scheduleQueueNote: "",
  };
}

export function getWorkshopMobileMachineId(user = {}, userId = "") {
  const fromUser = cleanProductionPackingText(
    user?.defaultMachineId ?? user?.default_machine_id ?? user?.currentMachineId ?? user?.machineId,
  );
  if (fromUser) return fromUser;
  const seedMachineByUserId = {
    "U-WORKSHOP-A": "BAG-01",
    "U-WORKSHOP-PRINT-A": "PRINT-01",
  };
  return seedMachineByUserId[cleanProductionPackingText(userId)] ?? "";
}

export function buildProductionTaskListQueryForPage(activePage, currentUser, currentUserId) {
  if (!["workshopMobile", "rawMaterialScanner"].includes(activePage)) return { pageSize: 200 };
  const machineId = getWorkshopMobileMachineId(currentUser, currentUserId);
  return {
    pageSize: 200,
    status: "open",
    visibility: "workshop_mobile",
    ...(machineId ? { machineId } : {}),
  };
}

export function mapProductionTaskListItemToLine(item, localOrderLines = []) {
  const task = item?.productionTask ?? {};
  const apiLine = item?.orderLine ?? {};
  const orderLineId = cleanProductionPackingText(apiLine.orderLineId ?? item?.orderLineId ?? task.orderLineId);
  const localLine = findLocalProductionPackingOrderLine(localOrderLines, orderLineId);
  const taskStatus = cleanProductionPackingText(task.taskStatus ?? task.status);
  const status = taskStatus || cleanProductionPackingText(apiLine.lineStatus) || localLine?.status || localLine?.lineStatus || "";
  const plannedQty = toProductionPackingNumber(task.plannedQty ?? apiLine.originalQty ?? localLine?.qty ?? localLine?.originalQty);

  return mergeProductionPackingOrderLine(apiLine, localLine, {
    id: orderLineId,
    status,
    qty: plannedQty,
    taskType: cleanProductionPackingText(task.taskType),
    machineId: cleanProductionPackingText(task.machineId),
    publishedScheduleId: cleanProductionPackingText(task.publishedScheduleId ?? item?.publishedScheduleId),
    productionTaskId: cleanProductionPackingText(item?.productionTaskId ?? task.productionTaskId),
    latestReport: item?.latestReport ?? null,
    latestException: item?.latestException ?? item?.exceptions?.[0] ?? null,
    productionExceptions: Array.isArray(item?.exceptions) ? item.exceptions : [],
    dailyProgress: item?.dailyProgress ?? null,
    finishedGoodsPhoto: item?.finishedGoodsPhoto ?? task.finishedGoodsPhoto ?? null,
    productionTask: task,
    inventoryItem: item?.inventoryItem ?? null,
    source: "api_list",
  });
}

export function mapPackingTaskListItemToTask(item, localOrderLines = []) {
  const task = item?.packingTask ?? {};
  const apiLine = item?.orderLine ?? {};
  const orderLineId = cleanProductionPackingText(apiLine.orderLineId ?? item?.orderLineId ?? task.orderLineId);
  const localLine = findLocalProductionPackingOrderLine(localOrderLines, orderLineId);
  const plannedQty = toProductionPackingNumber(task.plannedQty ?? apiLine.originalQty ?? localLine?.qty ?? localLine?.originalQty);
  const orderLine = mergeProductionPackingOrderLine(apiLine, localLine, {
    id: orderLineId,
    qty: plannedQty,
    status: cleanProductionPackingText(apiLine.lineStatus) || localLine?.status || localLine?.lineStatus || "",
    source: "api_list",
  });
  const packageCount = toProductionPackingNumber(item?.packageCount ?? task.packageCount, 0) || inferPackageCountFromQty(plannedQty);

  return {
    packingTaskId: cleanProductionPackingText(item?.packingTaskId ?? task.packingTaskId),
    orderLineId,
    orderLine,
    plannedQty,
    actualPackedQty: toProductionPackingNumber(task.actualPackedQty, 0),
    packageCount,
    status: cleanProductionPackingText(task.status ?? task.taskStatus) || "待打包",
    packages: Array.isArray(item?.packages) ? item.packages : [],
    fulfillment: item?.fulfillment ?? null,
    inventoryItem: item?.inventoryItem ?? null,
    inventoryDeducted: item?.inventoryDeducted === true,
    source: "api_list",
  };
}

export function mergeProductionPackingOrderLine(apiLine = {}, localLine = null, overrides = {}) {
  const id = cleanProductionPackingText(overrides.id ?? apiLine.orderLineId ?? apiLine.id ?? localLine?.id ?? localLine?.orderLineId);
  const product = cleanProductionPackingText(apiLine.productName ?? apiLine.product) || localLine?.product || localLine?.productName || "";
  const size = cleanProductionPackingText(apiLine.size) || localLine?.size || "";
  const color = cleanProductionPackingText(apiLine.bagColor ?? apiLine.color) || localLine?.color || localLine?.bagColor || "";
  const handle = cleanProductionPackingText(apiLine.handleType ?? apiLine.handle) || localLine?.handle || localLine?.handleType || "";
  const style = cleanProductionPackingText(apiLine.style) || localLine?.style || "";
  const qty = toProductionPackingNumber(overrides.qty ?? apiLine.originalQty ?? apiLine.qty ?? localLine?.qty ?? localLine?.originalQty);
  const status = cleanProductionPackingText(overrides.status ?? apiLine.lineStatus ?? apiLine.status ?? localLine?.status ?? localLine?.lineStatus);
  const fulfillment = cleanProductionPackingText(apiLine.fulfillmentMethod ?? apiLine.fulfillment) || localLine?.fulfillment || localLine?.fulfillmentMethod || "";
  const exceptionTags = Array.isArray(apiLine.exceptionTags)
    ? apiLine.exceptionTags
    : Array.isArray(apiLine.exceptions)
      ? apiLine.exceptions
      : localLine?.exceptions ?? [];

  return {
    ...(localLine ?? {}),
    id,
    orderLineId: id,
    orderId: cleanProductionPackingText(apiLine.orderId) || localLine?.orderId || localLine?.orderNo || "",
    orderNo: localLine?.orderNo || cleanProductionPackingText(apiLine.orderId) || "",
    customerId: cleanProductionPackingText(apiLine.customerId) || localLine?.customerId || "",
    product,
    productName: product,
    size,
    color,
    bagColor: color,
    handle,
    handleType: handle,
    style,
    qty,
    originalQty: qty,
    status,
    lineStatus: status,
    fulfillment,
    fulfillmentMethod: fulfillment,
    latest: localLine?.latest ?? "待确认",
    exceptions: exceptionTags,
    ...overrides,
  };
}

export function findLocalProductionPackingOrderLine(orderLines, orderLineId) {
  const safeOrderLineId = cleanProductionPackingText(orderLineId);
  if (!safeOrderLineId) return null;
  return (orderLines ?? []).find((item) => cleanProductionPackingText(item?.id ?? item?.orderLineId) === safeOrderLineId) ?? null;
}

export function toProductionPackingNumber(value, fallback = 0) {
  const number = Number(value ?? fallback ?? 0);
  return Number.isFinite(number) ? Math.trunc(number) : Math.trunc(Number(fallback ?? 0));
}

export function cleanProductionPackingText(value) {
  return String(value ?? "").trim();
}

export function isPackingReadyLine(line) {
  const status = String(line?.status ?? line?.lineStatus ?? "");
  return status.includes("待打包");
}

export function inferPackageCountFromQty(qty) {
  const amount = Number(qty || 0);
  if (amount >= 1800) return 4;
  if (amount >= 1000) return 3;
  if (amount >= 500) return 2;
  return 1;
}

export function upsertPackingTask(tasks = [], nextTask) {
  if (!nextTask?.packingTaskId) return tasks;
  const exists = tasks.some((item) => item.packingTaskId === nextTask.packingTaskId);
  if (exists) {
    return tasks.map((item) => (item.packingTaskId === nextTask.packingTaskId ? { ...item, ...nextTask } : item));
  }
  return [nextTask, ...tasks];
}

export function upsertProductionTaskLine(tasks = [], nextLine) {
  if (!nextLine?.id && !nextLine?.orderLineId && !nextLine?.productionTaskId) return tasks;
  const nextOrderLineId = cleanProductionPackingText(nextLine.id ?? nextLine.orderLineId);
  const nextProductionTaskId = cleanProductionPackingText(nextLine.productionTaskId);
  const matches = (item) => {
    const itemOrderLineId = cleanProductionPackingText(item?.id ?? item?.orderLineId);
    const itemProductionTaskId = cleanProductionPackingText(item?.productionTaskId);
    return (
      (nextOrderLineId && itemOrderLineId === nextOrderLineId) ||
      (nextProductionTaskId && itemProductionTaskId === nextProductionTaskId)
    );
  };
  return tasks.some(matches) ? tasks.map((item) => (matches(item) ? { ...item, ...nextLine } : item)) : [nextLine, ...tasks];
}

export function buildFulfillmentFromPacking({ orderLine = {}, packingResult = {}, packageCount = 1 } = {}) {
  const method = orderLine.fulfillment;
  const fallbackStatus = method === "快递快运" ? "待打印标签" : "已备货";
  const fulfillmentId = packingResult.fulfillmentId || `F-PACK-${orderLine.id}`;
  return {
    id: fulfillmentId,
    fulfillmentId,
    method,
    customerId: orderLine.customerId,
    lineId: orderLine.id,
    orderLineId: orderLine.id,
    goods: `${orderLine.product} ${orderLine.size} ${orderLine.color}${orderLine.print === "是" ? "印刷" : ""}`,
    qty: packingResult.actualPackedQty,
    actualQty: packingResult.actualPackedQty,
    packages: `${packageCount}包`,
    status: packingResult.fulfillmentStatus || fallbackStatus,
    latest: orderLine.latest,
    zone: method === "快递快运" ? "待快运区" : "打包区",
    source: "打包完成",
    printed: packingResult.fulfillmentStatus === "待确认拉走",
  };
}

export function applyPrintRecordProjection(fulfillments = [], fulfillmentId, printRecord, previousFulfillment = {}) {
  if (!printRecord?.printRecordId) return fulfillments;
  return fulfillments.map((item) => {
    if (item.id !== fulfillmentId) return item;
    if (printRecord.status === "previewed") {
      return {
        ...item,
        printed: Boolean(previousFulfillment.printed),
        status: previousFulfillment.status ?? item.status,
        printRecordStatus: "previewed",
        printPreviewRecordId: printRecord.printRecordId,
      };
    }
    if (["submitted", "reprint_submitted", "failed", "canceled"].includes(printRecord.status)) {
      return {
        ...item,
        printed: false,
        status: previousFulfillment.status ?? item.status,
        printRecordStatus: printRecord.status,
        activePrintRecordId: ["submitted", "reprint_submitted"].includes(printRecord.status)
          ? printRecord.printRecordId
          : "",
        printRecordId: printRecord.printRecordId,
        previousPrintRecordId: printRecord.previousPrintRecordId ?? item.previousPrintRecordId ?? "",
        printAction: printRecord.printAction ?? item.printAction,
        printJobId: printRecord.printJobId ?? item.printJobId ?? "",
      };
    }
    return {
      ...item,
      printed: true,
      printRecordStatus: printRecord.status,
      activePrintRecordId: printRecord.printRecordId,
      printRecordId: printRecord.printRecordId,
      previousPrintRecordId: printRecord.previousPrintRecordId ?? item.previousPrintRecordId ?? "",
      printAction: printRecord.printAction ?? item.printAction,
      printBatch: printRecord.batchNo ?? item.printBatch,
      printedAt: printRecord.printedAt ?? item.printedAt,
    };
  });
}

export function findFulfillmentForPrintTodo(todo, fulfillments = []) {
  const ref = String(todo?.ref ?? "").trim();
  if (!ref) return null;
  return (
    fulfillments.find((item) => item.id === ref || item.fulfillmentId === ref) ??
    fulfillments.find((item) => item.lineId === ref || item.orderLineId === ref) ??
    fulfillments.find((item) => String(item.lineId ?? item.orderLineId ?? "").startsWith(ref)) ??
    null
  );
}
