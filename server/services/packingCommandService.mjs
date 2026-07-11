export function createPackingCommandService({
  buildOperationLog,
  distributeIntegerQty,
  findInventoryItem,
  isReleasableInventoryReservation,
  resolvePersistableCreatedBy,
  now = () => new Date(),
} = {}) {
  const dependencies = {
    buildOperationLog,
    distributeIntegerQty,
    findInventoryItem,
    isReleasableInventoryReservation,
    resolvePersistableCreatedBy,
  };
  for (const [name, value] of Object.entries(dependencies)) requireFunction(value, name);

  return {
    async completePackingTask({ workspace, packingTaskId, body = {}, operatorId }) {
      const beforeTask = findPackingTask(workspace, packingTaskId);
      if (!beforeTask) return notFound("PACKING_TASK_NOT_FOUND");
      if (body.packingTaskId && body.packingTaskId !== packingTaskId) {
        return businessError(422, "VALIDATION_ERROR", "packingTaskId in path and body must match");
      }
      const orderLineId = body.orderLineId ?? beforeTask.orderLineId ?? beforeTask.lineId;
      const beforeOrderLine = findOrderLine(workspace, orderLineId);
      if (!beforeOrderLine) return notFound("ORDER_LINE_NOT_FOUND");
      const fulfillment = findFulfillmentByOrderLineId(workspace, orderLineId);
      const actualPackedQty = Math.trunc(
        Number(body.actualPackedQty ?? beforeTask.plannedQty ?? beforeOrderLine.qty ?? 0),
      );
      if (!Number.isFinite(actualPackedQty) || actualPackedQty <= 0) {
        return businessError(422, "VALIDATION_ERROR", "actualPackedQty must be greater than 0.");
      }
      const completedAt = body.completedAt ?? nowIso(now);
      const packages = buildPackageRecordsForPacking({
        body,
        packingTaskId,
        orderLineId,
        fulfillmentId: fulfillment?.id ?? fulfillment?.fulfillmentId ?? "",
        actualPackedQty,
        operatorId,
        createdAt: completedAt,
        distributeIntegerQty,
      });
      const nextStatus = getPackingCompletionStatus({
        fulfillment,
        orderLine: beforeOrderLine,
        labelsPrinted: body.labelsPrinted === true,
      });
      const packingTask = {
        ...beforeTask,
        packingTaskId,
        orderLineId,
        plannedQty: Number(beforeTask.plannedQty ?? beforeTask.qty ?? actualPackedQty),
        actualPackedQty,
        status: "已完成",
        createdBy: resolvePersistableCreatedBy(workspace, beforeTask.createdBy, operatorId),
      };
      const orderLine = {
        ...beforeOrderLine,
        orderLineId: beforeOrderLine.orderLineId ?? beforeOrderLine.id,
        lineStatus: nextStatus.orderLineStatus,
        status: nextStatus.orderLineStatus,
        exceptionTags: beforeOrderLine.exceptionTags ?? beforeOrderLine.exceptions ?? [],
      };
      const updatedFulfillment = fulfillment
        ? {
            ...fulfillment,
            fulfillmentId: fulfillment.id ?? fulfillment.fulfillmentId,
            orderLineId,
            expectedQty: Number(fulfillment.expectedQty ?? fulfillment.qty ?? actualPackedQty),
            actualQty: actualPackedQty,
            status: nextStatus.fulfillmentStatus,
            confirmedBy: operatorId,
          }
        : null;
      const inventoryTrace = buildPackingInventoryTrace(workspace, {
        orderLineId,
        inventoryItemId: body.inventoryItemId,
        packingTaskId,
        actualPackedQty,
        operatorId,
        completedAt,
        findInventoryItem,
        isReleasableInventoryReservation,
      });
      const operationLog = buildOperationLog(workspace, {
        targetType: "packing_task",
        targetId: packingTaskId,
        action: "complete_packing_task",
        operatorId,
        before: beforeTask,
        after: {
          packingTask,
          packageIds: packages.map((record) => record.packageId),
          fulfillment: updatedFulfillment,
          inventoryDeducted: false,
        },
        reason: body.remark ?? "打包完成",
      });
      const transaction = await workspace.productionPackingTransactionRepository.completePackingTask({
        workspace,
        packingTask,
        packages,
        fulfillment: updatedFulfillment,
        orderLine,
        inventoryLedgerEntries: inventoryTrace.inventoryLedgerEntries,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { ...body, operatorId },
      });

      return success({
        packingTaskId,
        orderLineId,
        status: transaction.packingTask.status,
        actualPackedQty: transaction.packingTask.actualPackedQty,
        packageIds: transaction.packages.map((record) => record.packageId),
        fulfillmentId: transaction.fulfillment?.fulfillmentId ?? updatedFulfillment?.fulfillmentId ?? "",
        fulfillmentStatus: transaction.fulfillment?.status ?? updatedFulfillment?.status ?? "",
        orderLineStatus: transaction.orderLine?.lineStatus ?? orderLine.status,
        inventoryDeducted: false,
        inventoryLedgerIds: transaction.inventoryLedgerEntries.map((entry) => entry.ledgerId),
        operationLogId: transaction.operationLogId,
      });
    },
  };
}

function buildPackageRecordsForPacking(input) {
  const rawPackages = Array.isArray(input.body.packages) ? input.body.packages : [];
  const requestedPackageCount = input.body.packageCount ?? input.body.packagesCount ?? rawPackages.length;
  const packageCount = Math.max(1, Math.trunc(Number(requestedPackageCount || 1)));
  const quantities = rawPackages.length
    ? rawPackages.map((item) => Math.max(0, Math.trunc(Number(item.packedQty ?? item.qty ?? 0))))
    : input.distributeIntegerQty(input.actualPackedQty, packageCount);
  const normalizedQuantities =
    quantities.reduce((sum, qty) => sum + qty, 0) > 0
      ? quantities
      : input.distributeIntegerQty(input.actualPackedQty, packageCount);
  const recordCount = Math.max(packageCount, normalizedQuantities.length);
  return Array.from({ length: recordCount }, (_, index) => {
    const source = rawPackages[index] ?? {};
    const packageSeq = Math.trunc(Number(source.packageSeq ?? index + 1));
    const packageId = source.packageId ?? nextPlainId("PKG", `${input.packingTaskId}-${packageSeq}`);
    return {
      packageId,
      bizNo: source.bizNo ?? packageId,
      orderLineId: source.orderLineId ?? input.orderLineId,
      fulfillmentId: source.fulfillmentId ?? input.fulfillmentId,
      packageSeq,
      packageCount: recordCount,
      packedQty: Math.max(0, Math.trunc(Number(source.packedQty ?? source.qty ?? normalizedQuantities[index] ?? 0))),
      labelPrintRecordId: source.labelPrintRecordId ?? input.body.labelPrintRecordId ?? "",
      status: source.status ?? (input.body.labelsPrinted === true ? "待提货" : "待打印标签"),
      createdBy: input.operatorId,
      createdAt: source.createdAt ?? input.createdAt,
    };
  });
}

function getPackingCompletionStatus({ fulfillment, orderLine, labelsPrinted }) {
  const method = String(
    fulfillment?.method ?? fulfillment?.fulfillmentMethod ?? orderLine?.fulfillmentMethod ?? orderLine?.fulfillment ?? "",
  ).trim();
  if (method === "快递快运" || method === "express_ltl") {
    return labelsPrinted
      ? { orderLineStatus: "待快运拉走", fulfillmentStatus: "待确认拉走" }
      : { orderLineStatus: "待打印标签", fulfillmentStatus: "待打印标签" };
  }
  return { orderLineStatus: "待出库", fulfillmentStatus: "已备货" };
}

function buildPackingInventoryTrace(workspace, input) {
  const activeReservations = (workspace.inventoryReservations ?? []).filter(
    (reservation) =>
      reservation.orderLineId === input.orderLineId && input.isReleasableInventoryReservation(reservation),
  );
  const reservation = activeReservations[0] ?? null;
  const inventoryItem = input.inventoryItemId
    ? input.findInventoryItem(workspace, input.inventoryItemId)
    : reservation
      ? input.findInventoryItem(workspace, reservation.inventoryItemId)
      : null;
  if (!inventoryItem) return { inventoryLedgerEntries: [] };

  const reservedBefore = Number(reservation?.reservedQty ?? reservation?.qty ?? inventoryItem.reserved ?? 0);
  return {
    inventoryLedgerEntries: [
      {
        ledgerId: input.ledgerId ?? nextPlainId("LEDGER", `${input.packingTaskId}-PACK`),
        inventoryItemId: inventoryItem.id,
        changeType: "打包完成确认",
        qtyBefore: reservedBefore,
        qtyChange: 0,
        qtyAfter: reservedBefore,
        sourceType: "packing_complete",
        sourceId: input.packingTaskId,
        operatorId: input.operatorId,
        confirmedBy: input.operatorId,
        occurredAt: input.completedAt,
        createdAt: input.completedAt,
        reason: "打包完成不扣减库存",
        remark: `打包 ${input.actualPackedQty}，仍保留库存占用，出库/拉走确认时再扣减`,
      },
    ],
  };
}

function findPackingTask(workspace, id) {
  return (workspace.packingTasks ?? []).find((item) => item.id === id || item.packingTaskId === id) ?? null;
}

function findOrderLine(workspace, id) {
  return (workspace.orderLines ?? []).find((item) => item.id === id || item.orderLineId === id) ?? null;
}

function findFulfillmentByOrderLineId(workspace, orderLineId) {
  return (workspace.fulfillments ?? []).find((item) => (item.orderLineId ?? item.lineId) === orderLineId) ?? null;
}

function success(response) {
  return { response };
}

function notFound(code) {
  return { notFound: true, code };
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}

function nextPlainId(prefix, value) {
  return `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, "-")}`;
}

function nowIso(now) {
  return new Date(now()).toISOString();
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
