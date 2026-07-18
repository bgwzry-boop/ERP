import {
  getLineColorSpecLabel,
  getLinePrintSide,
  getLineRemark,
  getOrderLineShortNo,
  shortColorName,
} from "../../src/domain/officeRules.js";

export function buildDriverDeliveryTask(workspace = {}, fulfillment, options = {}) {
  if (!fulfillment || fulfillment.method !== "送货") return null;

  const fulfillmentId = cleanText(fulfillment.id ?? fulfillment.fulfillmentId);
  const orderLineId = cleanText(fulfillment.orderLineId ?? fulfillment.lineId);
  const orderLine = findOrderLine(workspace, orderLineId) ?? {};
  const customerId = cleanText(fulfillment.customerId ?? orderLine.customerId);
  const customer = (workspace.customers ?? []).find((item) => cleanText(item.id) === customerId) ?? {};
  const printRecord = findActiveFulfillmentPrintRecord(workspace, fulfillment);
  const dispatch = findActiveDriverDeliveryDispatch(workspace, fulfillmentId);
  const status = mapDriverDeliveryStatus(fulfillment.status);
  const packageCount = parseDriverPackageCount(fulfillment.packages ?? fulfillment.packageSummary);
  const qty = Math.max(0, Number(fulfillment.actualQty ?? fulfillment.qty ?? orderLine.qty ?? 0));
  const address = firstText(customer.address, fulfillment.address) || "地址待补";

  return {
    driverTaskId: fulfillmentId,
    fulfillmentId,
    driverId: firstText(dispatch.driverId, fulfillment.driverId, options.driverId),
    orderLineId,
    orderTail: getDriverOrderTail(orderLine, orderLineId),
    customerId,
    customerName: cleanText(customer.name) || "客户待确认",
    contactName: firstText(customer.contact, fulfillment.contactName) || "联系人待确认",
    contactPhone: firstText(customer.phone, fulfillment.contactPhone) || "电话待确认",
    address,
    addressArea: inferDriverAddressArea(address),
    deliveryNoteNo:
      firstText(
        fulfillment.deliveryNoteNo,
        fulfillment.printBatch,
        printRecord?.batchNo,
        printRecord?.printRecordId,
        printRecord?.id,
      ) || "待打印/回填",
    goodsSummary: buildDriverGoodsSummary({ fulfillment, orderLine, qty }),
    packageSummary: cleanText(fulfillment.packages ?? fulfillment.packageSummary) || `${packageCount}包`,
    packageCount,
    packageChecklist: buildDriverPackageChecklist(workspace, {
      fulfillment,
      orderLineId,
      packageCount,
      qty,
    }),
    qty,
    expectedQty: Math.max(0, Number(fulfillment.qty ?? orderLine.qty ?? qty)),
    latest: cleanText(fulfillment.latest ?? orderLine.latest),
    latestNeededAt: cleanText(fulfillment.latestNeededAt ?? fulfillment.latest ?? orderLine.latest),
    status,
    inventorySource: [fulfillment.zone, fulfillment.source].map(cleanText).filter(Boolean).join(" / "),
    nextStep: getDriverDeliveryNextStep(status),
    customerNote: getLineRemark(orderLine) || cleanText(fulfillment.customerNote) || "无",
    officeNote:
      cleanText(fulfillment.exceptionReason) ||
      (Array.isArray(orderLine.exceptions) ? orderLine.exceptions.map(cleanText).filter(Boolean).join("、") : "") ||
      "无",
    exceptionReasonCode: cleanText(fulfillment.exceptionReasonCode ?? fulfillment.reasonCode),
    exceptionReason: cleanText(fulfillment.exceptionReason),
    exceptionOccurredAt: cleanText(fulfillment.exceptionOccurredAt ?? fulfillment.occurredAt),
    routeDate: cleanText(dispatch.routeDate ?? dispatch.route_date ?? fulfillment.routeDate),
    routeNo: cleanText(
      dispatch.routeNo ??
        dispatch.routeBatchNo ??
        dispatch.route_batch_no ??
        fulfillment.routeNo ??
        fulfillment.routeBatchNo,
    ),
    routeSequence: finiteNumber(
      dispatch.stopSequence ??
        dispatch.routeSequence ??
        dispatch.stop_sequence ??
        fulfillment.routeSequence,
    ),
    dispatchStatus: cleanText(dispatch.dispatchStatus ?? dispatch.dispatch_status ?? fulfillment.dispatchStatus),
    plannedDepartureAt: cleanText(dispatch.plannedDepartureAt ?? dispatch.planned_departure_at ?? fulfillment.plannedDepartureAt),
    dispatchAssignedAt: cleanText(
      dispatch.assignedAt ?? dispatch.assigned_at ?? fulfillment.dispatchAssignedAt,
    ),
    receiverName: cleanText(fulfillment.receiverName),
    paperNoteStatus: cleanText(fulfillment.paperNoteStatus),
    watermarkedPhotoAttached: fulfillment.watermarkedPhotoAttached === true,
    watermarkedPhotoAttachmentId: cleanText(fulfillment.watermarkedPhotoAttachmentId),
    watermarkedPhotoUrl: cleanText(fulfillment.watermarkedPhotoUrl),
    watermarkId: cleanText(fulfillment.watermarkId),
    watermarkText: cleanText(fulfillment.watermarkText),
    watermarkCapturedAt: cleanText(fulfillment.watermarkCapturedAt),
    watermarkLocationLabel: cleanText(fulfillment.watermarkLocationLabel),
    watermarkGeoPoint: cleanText(fulfillment.watermarkGeoPoint),
    watermarkAddress: cleanText(fulfillment.watermarkAddress),
    watermarkOperatorId: cleanText(fulfillment.watermarkOperatorId),
    watermarkOperatorName: cleanText(fulfillment.watermarkOperatorName),
    signaturePhotoAttached: fulfillment.signaturePhotoAttached === true,
    signaturePhotoAttachmentId: cleanText(fulfillment.signaturePhotoAttachmentId),
    deliveryEvidenceReviewStatus: cleanText(fulfillment.deliveryEvidenceReviewStatus),
    deliveryEvidenceReviewedAt: cleanText(fulfillment.deliveryEvidenceReviewedAt),
    deliveryEvidenceReviewedBy: cleanText(fulfillment.deliveryEvidenceReviewedBy),
    deliveryEvidenceReviewedByUserId: cleanText(fulfillment.deliveryEvidenceReviewedByUserId),
    deliveryEvidenceIssueReason: cleanText(fulfillment.deliveryEvidenceIssueReason),
    deviceFieldTestRecord: fulfillment.deviceFieldTestRecord ?? null,
    deviceFieldTestSummary: fulfillment.deviceFieldTestSummary ?? fulfillment.deviceFieldTestRecord?.summary ?? null,
    completedAt: cleanText(fulfillment.completedAt ?? fulfillment.deliveredAt),
    loadedAt: cleanText(fulfillment.loadedAt),
    loadedBy: cleanText(fulfillment.loadedBy),
    driverRemark: cleanText(fulfillment.driverRemark),
    sortSequence: finiteNumber(options.sortSequence ?? getFulfillmentSortSequence(workspace, fulfillmentId), 9999),
  };
}

export async function getDriverDeliveryTaskResponseProjection(
  workspace,
  { fulfillmentId, operatorId, fallbackFulfillment } = {},
) {
  const task = await workspace.driverDeliveryTaskReadRepository.getDriverDeliveryTask({
    workspace,
    fulfillmentId,
    operatorId,
  });
  return task ?? buildDriverDeliveryTask(
    workspace,
    fallbackFulfillment ?? findDriverDeliveryFulfillment(workspace, fulfillmentId),
    {
      driverId: operatorId,
      sortSequence: getFulfillmentSortSequence(workspace, fulfillmentId),
    },
  );
}

export function buildDriverPackageChecklist(
  workspace = {},
  { fulfillment = {}, orderLineId = "", packageCount = 1, qty = 0 } = {},
) {
  const fulfillmentId = cleanText(fulfillment.id ?? fulfillment.fulfillmentId);
  const safeOrderLineId = cleanText(orderLineId);
  const packageRows = (workspace.packages ?? [])
    .filter((item) => {
      const itemFulfillmentId = cleanText(item.fulfillmentId);
      const itemOrderLineId = cleanText(item.orderLineId);
      if (fulfillmentId && itemFulfillmentId === fulfillmentId) return true;
      return !itemFulfillmentId && safeOrderLineId && itemOrderLineId === safeOrderLineId;
    })
    .sort((a, b) => finiteNumber(a.packageSeq) - finiteNumber(b.packageSeq));

  if (packageRows.length) {
    return packageRows.map((item, index) =>
      toDriverPackageChecklistItem(item, {
        index,
        packageCount: packageRows.length,
        fulfillmentId,
      }),
    );
  }

  const count = Math.max(
    1,
    Math.trunc(Number(packageCount || parseDriverPackageCount(fulfillment.packages ?? fulfillment.packageSummary) || 1)),
  );
  const quantities = distributeDriverPackageQty(qty, count);
  return Array.from({ length: count }, (_, index) =>
    toDriverPackageChecklistItem({}, {
      index,
      packageCount: count,
      fulfillmentId,
      fallbackQty: quantities[index],
      packageSummary: fulfillment.packages ?? fulfillment.packageSummary,
    }),
  );
}

export function buildDriverGoodsSummary({ fulfillment = {}, orderLine = {}, qty = 0 } = {}) {
  const colorSpec = getDriverColorSpecLabel(orderLine);
  const printSide = getLinePrintSide(orderLine);
  const remark = getLineRemark(orderLine);
  return [
    firstText(orderLine.product, orderLine.productName, fulfillment.goods, fulfillment.productName),
    cleanText(orderLine.size),
    colorSpec && colorSpec !== "待确认" ? colorSpec : "",
    printSide && printSide !== "无需印刷" ? printSide : "",
    `${Math.max(0, Number(qty || 0))}个`,
    remark,
  ].filter(Boolean).join(" ");
}

export function getDriverColorSpecLabel(orderLine = {}) {
  const labels = [];
  const printEnabled = cleanText(orderLine.print) === "是" || orderLine.printFlag === true;
  const printColor = cleanText(orderLine.printColor);
  const handleColor = cleanText(orderLine.handleColor);
  const bagColor = orderLine.color ?? orderLine.bagColor;
  if (printEnabled && printColor && printColor !== "待确认") {
    labels.push(`${shortColorName(bagColor)}印${shortColorName(printColor)}`);
  }
  if (handleColor && handleColor !== "待确认") {
    labels.push(`${shortColorName(bagColor)}袋${shortColorName(handleColor)}提`);
  }
  return labels.length ? labels.join(" / ") : getLineColorSpecLabel(orderLine);
}

export function findDriverDeliveryFulfillment(workspace = {}, fulfillmentId) {
  const id = cleanText(fulfillmentId);
  const fulfillment = (workspace.fulfillments ?? []).find(
    (item) => cleanText(item.id ?? item.fulfillmentId) === id,
  );
  return fulfillment?.method === "送货" ? fulfillment : null;
}

export function findActiveFulfillmentPrintRecord(workspace = {}, fulfillment = {}) {
  const activePrintRecordId = cleanText(fulfillment.activePrintRecordId ?? fulfillment.printRecordId);
  const records = workspace.printRecords ?? [];
  if (activePrintRecordId) {
    const activeRecord = records.find(
      (item) => cleanText(item.printRecordId ?? item.id) === activePrintRecordId && !isVoidedPrintRecord(item),
    );
    if (activeRecord) return activeRecord;
  }

  const fulfillmentId = cleanText(fulfillment.id ?? fulfillment.fulfillmentId);
  return records
    .filter((item) => {
      const targetType = cleanText(item.targetType);
      const targetId = cleanText(item.targetId ?? item.fulfillmentId);
      return (!targetType || targetType === "fulfillment") && targetId === fulfillmentId && !isVoidedPrintRecord(item);
    })
    .sort((a, b) => {
      const timestampDiff = cleanText(b.printedAt ?? b.createdAt).localeCompare(
        cleanText(a.printedAt ?? a.createdAt),
      );
      if (timestampDiff) return timestampDiff;
      return cleanText(b.printRecordId ?? b.id).localeCompare(cleanText(a.printRecordId ?? a.id));
    })[0] ?? null;
}

export function findActiveDriverDeliveryDispatch(workspace = {}, fulfillmentId) {
  const id = cleanText(fulfillmentId);
  return (workspace.driverDeliveryDispatches ?? [])
    .filter((dispatch) => {
      const dispatchFulfillmentId = cleanText(dispatch.fulfillmentId ?? dispatch.fulfillment_id);
      const status = cleanText(dispatch.dispatchStatus ?? dispatch.dispatch_status);
      return dispatchFulfillmentId === id && !["已取消", "canceled", "voided"].includes(status);
    })
    .sort((a, b) => {
      const dateDiff = cleanText(a.routeDate ?? a.route_date).localeCompare(cleanText(b.routeDate ?? b.route_date));
      if (dateDiff) return dateDiff;
      const routeDiff = cleanText(a.routeNo ?? a.routeBatchNo ?? a.route_batch_no).localeCompare(
        cleanText(b.routeNo ?? b.routeBatchNo ?? b.route_batch_no),
        "zh-Hans-CN",
      );
      if (routeDiff) return routeDiff;
      const sequenceDiff =
        finiteNumber(a.stopSequence ?? a.routeSequence ?? a.stop_sequence) -
        finiteNumber(b.stopSequence ?? b.routeSequence ?? b.stop_sequence);
      if (sequenceDiff) return sequenceDiff;
      return cleanText(b.assignedAt ?? b.assigned_at ?? b.createdAt).localeCompare(
        cleanText(a.assignedAt ?? a.assigned_at ?? a.createdAt),
      );
    })[0] ?? {};
}

export function getFulfillmentSortSequence(workspace = {}, fulfillmentId) {
  const id = cleanText(fulfillmentId);
  const index = (workspace.fulfillments ?? []).findIndex(
    (item) => cleanText(item.id ?? item.fulfillmentId) === id,
  );
  return index >= 0 ? index + 1 : 9999;
}

export function mapDriverDeliveryStatus(value) {
  const status = cleanText(value);
  if (status === "配送中") return "配送中";
  if (status === "已交付" || status === "已完成") return "已完成";
  if (status.includes("异常") || status.includes("无法") || status.includes("数量")) return "送货异常";
  return "待送货";
}

export function getDriverDeliveryNextStep(status) {
  if (status === "配送中") return "到达客户处后提交水印照片，确认完成送货。";
  if (status === "已完成") return "送货已完成，回单进入办公室复核和对账候选。";
  if (status === "送货异常") return "异常已回到办公室处理，司机等待下一步通知。";
  return "先确认已装车，出发后状态进入配送中。";
}

export function inferDriverAddressArea(address) {
  const text = cleanText(address);
  if (!text) return "地址待补";
  const firstToken = text.split(/\s+/)[0];
  return firstToken.length > 8 ? firstToken.slice(0, 8) : firstToken;
}

export function getDriverOrderTail(orderLine = {}, orderLineId = "") {
  if (orderLine.orderNo && orderLine.lineNo) return getOrderLineShortNo(orderLine);
  const id = cleanText(orderLine.id ?? orderLine.orderLineId ?? orderLineId);
  const match = id.match(/ORD-\d{4}-(\d+)-(\d+)/);
  if (match) return `#${match[1]}-${match[2]}`;
  return id.slice(-5);
}

function toDriverPackageChecklistItem(item = {}, options = {}) {
  const packageSeq = Math.max(1, finiteNumber(item.packageSeq ?? item.sequence ?? options.index + 1, 1));
  const packageCount = Math.max(1, finiteNumber(item.packageCount ?? options.packageCount, 1));
  const packageId =
    cleanText(item.packageId ?? item.id) ||
    `${cleanText(options.fulfillmentId) || "DRIVER-PKG"}-PKG-${packageSeq}`;
  const packedQty = Math.max(0, finiteNumber(item.packedQty ?? item.qty ?? item.expectedQty ?? options.fallbackQty));
  const labelText =
    cleanText(item.labelText) ||
    (cleanText(options.packageSummary) && packageCount === 1
      ? cleanText(options.packageSummary)
      : `第 ${packageSeq}/${packageCount} 包`);
  return {
    packageId,
    labelText,
    packageSeq,
    packageCount,
    packedQty,
    quantityText: packedQty ? `${packedQty}个` : "数量待核",
    status: cleanText(item.status) || "待装车核对",
    labelPrintRecordId: cleanText(item.labelPrintRecordId),
    checked: item.checked === true,
  };
}

function findOrderLine(workspace, orderLineId) {
  const id = cleanText(orderLineId);
  return (workspace.orderLines ?? []).find((item) => cleanText(item.id ?? item.orderLineId) === id);
}

function parseDriverPackageCount(value) {
  const match = cleanText(value).match(/\d+/);
  return Math.max(1, match ? Number(match[0]) : 1);
}

function distributeDriverPackageQty(totalQty, packageCount) {
  const count = Math.max(1, Math.trunc(Number(packageCount || 1)));
  const total = Math.max(0, Math.trunc(Number(totalQty || 0)));
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function isVoidedPrintRecord(record = {}) {
  return ["voided", "已作废"].includes(cleanText(record.status));
}

function firstText(...values) {
  return values.map(cleanText).find(Boolean) ?? "";
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
