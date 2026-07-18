import { makeTodo } from "../../src/data/fixtures.js";
import { normalizeTodoReferenceForWrite } from "./todoReferenceService.mjs";

export function createWorkspaceRecordService({ now = () => new Date() } = {}) {
  if (typeof now !== "function") {
    throw new TypeError("createWorkspaceRecordService requires now to be a function.");
  }

  function cleanServerText(value) {
    return String(value ?? "").trim();
  }

  function nextId(prefix, rows) {
    return `${prefix}-${String(rows.length + 1).padStart(3, "0")}`;
  }

  function nextPlainId(prefix, value) {
    return `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, "-")}`;
  }

  function findAttachmentRecord(workspace, attachmentId) {
    const safeAttachmentId = cleanServerText(attachmentId);
    if (!safeAttachmentId) return null;
    return (
      (workspace.attachments ?? []).find(
        (item) => item.attachmentId === safeAttachmentId || item.id === safeAttachmentId,
      ) ?? null
    );
  }

  function findFulfillment(workspace, id) {
    return workspace.fulfillments.find((item) => item.id === id || item.fulfillmentId === id);
  }

  function findInventoryCorrectionDraft(workspace, id) {
    return (workspace.inventoryCorrectionDrafts ?? []).find(
      (item) => item.id === id || item.correctionDraftId === id,
    );
  }

  function findInventoryItem(workspace, id) {
    return workspace.inventories.find((item) => item.id === id);
  }

  function findInventoryReservation(workspace, id) {
    return (workspace.inventoryReservations ?? []).find(
      (item) => item.id === id || item.reservationId === id,
    );
  }

  function findOrderLine(workspace, id) {
    return workspace.orderLines.find((item) => item.id === id || item.orderLineId === id);
  }

  async function findPrintDevice(workspace, id) {
    const normalizedId = cleanServerText(id);
    if (!normalizedId) return null;
    const workspaceDevice = (workspace.printDevices ?? []).find(
      (item) => item.printDeviceId === normalizedId || item.id === normalizedId,
    );
    if (workspaceDevice) return workspaceDevice;
    const items = await workspace.printDeviceRepository.listPrintDevices({ workspace, filters: {} });
    return items.find((item) => item.printDeviceId === normalizedId || item.id === normalizedId) ?? null;
  }

  async function findPrintJob(workspace, id) {
    const normalizedId = cleanServerText(id);
    if (!normalizedId) return null;
    const workspaceJob = (workspace.printJobs ?? []).find(
      (item) => item.printJobId === normalizedId || item.id === normalizedId,
    );
    if (workspaceJob) return workspaceJob;
    const items = await workspace.printJobRepository.listPrintJobs({ workspace, filters: {} });
    return items.find((item) => item.printJobId === normalizedId || item.id === normalizedId) ?? null;
  }

  function findProductionTask(workspace, id) {
    return (workspace.productionTasks ?? []).find(
      (item) => item.id === id || item.productionTaskId === id,
    );
  }

  function findStatement(workspace, id) {
    return workspace.statements.find((item) => item.id === id);
  }

  function findCustomerName(workspace, customerId) {
    return workspace.customers.find((customer) => customer.id === customerId)?.name ?? "";
  }

  function buildCustomerSnapshot(workspace, customerId) {
    const customer = workspace.customers.find((item) => item.id === customerId) ?? {};
    return {
      customerId,
      name: customer.name ?? "",
      shortName: customer.shortName ?? customer.name ?? "",
      settlementCycle: customer.settlementCycle ?? "",
    };
  }

  function resolvePersistableCreatedBy(workspace, candidateUserId, fallbackUserId) {
    const candidate = cleanServerText(candidateUserId);
    const knownUserIds = new Set(
      (Array.isArray(workspace.users) ? workspace.users : []).map((user) =>
        cleanServerText(user?.userId ?? user?.id),
      ),
    );
    return candidate && knownUserIds.has(candidate) ? candidate : cleanServerText(fallbackUserId);
  }

  function buildTodo(workspace, input) {
    const timestamp = toIsoTimestamp(now());
    return normalizeTodoReferenceForWrite(
      workspace,
      makeTodo({
        id: input.id ?? nextId("T-API", workspace.todos),
        wait: "刚刚",
        createdAt: input.createdAt ?? timestamp,
        updatedAt: input.updatedAt ?? timestamp,
        ...input,
      }),
    );
  }

  function buildFulfillmentActionRecord(workspace, fulfillment, input = {}) {
    const orderLineId = fulfillment.orderLineId ?? fulfillment.lineId ?? "";
    const orderLine = workspace.orderLines.find((item) => item.id === orderLineId) ?? {};
    const customerId = fulfillment.customerId ?? orderLine.customerId ?? "";
    const hasExplicitActualQty = Object.prototype.hasOwnProperty.call(input, "actualQty");
    const actualQty = hasExplicitActualQty ? input.actualQty : fulfillment.actualQty ?? fulfillment.qty;
    return {
      ...fulfillment,
      fulfillmentId: fulfillment.fulfillmentId ?? fulfillment.id,
      bizNo: fulfillment.bizNo ?? fulfillment.id,
      orderLineId,
      customerId,
      customerSnapshot: buildCustomerSnapshot(workspace, customerId),
      method: fulfillment.method,
      expectedQty: Number(fulfillment.expectedQty ?? fulfillment.qty ?? orderLine.qty ?? 0),
      actualQty: actualQty === null || actualQty === "" ? null : Number(actualQty ?? 0),
      status: fulfillment.status,
      latestNeededAt: fulfillment.latestNeededAt ?? fulfillment.latest ?? orderLine.latest ?? "",
      deliveredAt: input.deliveredAt ?? fulfillment.deliveredAt ?? "",
      confirmedAt: input.confirmedAt ?? fulfillment.confirmedAt ?? "",
      confirmedBy: input.confirmedBy ?? input.operatorId ?? fulfillment.confirmedBy ?? "",
      paperOutboundStatus: input.paperOutboundStatus ?? fulfillment.paperOutboundStatus ?? "待生成纸单",
      paperOutboundDocumentId: input.paperOutboundDocumentId ?? fulfillment.paperOutboundDocumentId ?? "",
      physicalOutboundAt: input.physicalOutboundAt ?? fulfillment.physicalOutboundAt ?? "",
      physicalExecutorEmployeeId:
        input.physicalExecutorEmployeeId ?? fulfillment.physicalExecutorEmployeeId ?? "",
      physicalOutboundDocumentId:
        input.physicalOutboundDocumentId ?? fulfillment.physicalOutboundDocumentId ?? "",
      physicalOutboundDocumentVersion:
        input.physicalOutboundDocumentVersion ?? fulfillment.physicalOutboundDocumentVersion ?? 0,
      finalDeliveryStatus: input.finalDeliveryStatus ?? fulfillment.finalDeliveryStatus ?? "待最终交付",
      finalDeliveryAt: input.finalDeliveryAt ?? fulfillment.finalDeliveryAt ?? "",
      legacyStateReviewRequired:
        input.legacyStateReviewRequired ?? fulfillment.legacyStateReviewRequired === true,
      createdBy: input.createdBy ?? input.operatorId ?? fulfillment.createdBy ?? "",
    };
  }

  function summarizeOrderLineForChange(orderLine) {
    return {
      orderLineId: orderLine.orderLineId ?? orderLine.id,
      orderId: orderLine.orderId ?? orderLine.orderNo,
      customerId: orderLine.customerId,
      productName: orderLine.productName ?? orderLine.product,
      size: orderLine.size,
      bagColor: orderLine.bagColor ?? orderLine.color,
      handleType: orderLine.handleType ?? orderLine.handle,
      style: orderLine.style,
      originalQty: Number(orderLine.originalQty ?? orderLine.qty ?? 0),
      lineStatus: orderLine.lineStatus ?? orderLine.status,
      fulfillmentMethod: orderLine.fulfillmentMethod ?? orderLine.fulfillment,
      exceptionTags: orderLine.exceptionTags ?? orderLine.exceptions ?? [],
      voidReason: orderLine.voidReason ?? "",
      voidedBy: orderLine.voidedBy ?? "",
      voidedAt: orderLine.voidedAt ?? "",
    };
  }

  function buildOperationLog(workspace, input) {
    return {
      id: input.id ?? nextId("LOG", workspace.operationLogs),
      targetType: input.targetType,
      targetId: input.targetId,
      action: input.action,
      before: input.before ?? null,
      after: input.after ?? null,
      reason: input.reason ?? "",
      operatorId: input.operatorId ?? "U-OFFICE-A",
      pageKey: input.pageKey ?? "api",
      occurredAt: toIsoTimestamp(now()),
      createdAt: toIsoTimestamp(now()),
    };
  }

  function addOperationLog(workspace, input) {
    const operationLog = buildOperationLog(workspace, input);
    workspace.operationLogs.unshift(operationLog);
    return operationLog.id;
  }

  return Object.freeze({
    addOperationLog,
    buildCustomerSnapshot,
    buildFulfillmentActionRecord,
    buildOperationLog,
    buildTodo,
    cleanServerText,
    findAttachmentRecord,
    findCustomerName,
    findFulfillment,
    findInventoryCorrectionDraft,
    findInventoryItem,
    findInventoryReservation,
    findOrderLine,
    findPrintDevice,
    findPrintJob,
    findProductionTask,
    findStatement,
    nextId,
    nextPlainId,
    resolvePersistableCreatedBy,
    summarizeOrderLineForChange,
  });
}

function toIsoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
