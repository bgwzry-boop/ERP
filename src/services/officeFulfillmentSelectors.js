import { getFulfillmentMethodLabel } from "../shared/labels.js";

const exceptionReasonCodeByLabel = {
  库存不足: "stock_shortage",
  找不到货: "not_found",
  "颜色/尺寸不符": "wrong_color_or_size",
  "包装/标签问题": "packing_label_issue",
  其他: "other",
};

const printVoidReasonCodeByLabel = {
  信息变更需重打: "info_changed",
  包裹数量变化: "qty_changed",
  纸张损坏: "damaged_paper",
  客户信息变化: "customer_change",
  交付方式变化: "fulfillment_changed",
  其他: "other",
};

const fulfillmentPrintActionByLabel = Object.freeze({
  打印预览: "preview",
  打印标签: "first_print",
  打印出库单: "first_print",
  打印自提单: "first_print",
  打印送货单: "first_print",
  重打标签: "reprint",
  重打出库单: "reprint",
  重打自提单: "reprint",
  重打送货单: "reprint",
});

const supportedFulfillmentPrintActions = new Set(Object.values(fulfillmentPrintActionByLabel));

export function mapFulfillmentExceptionReason(reason) {
  return exceptionReasonCodeByLabel[reason] ?? "other";
}

export function mapPrintVoidReason(reason) {
  return printVoidReasonCodeByLabel[reason] ?? "other";
}

export function getFulfillmentDocumentType(fulfillment, action = "") {
  if (fulfillment?.method === "快递快运" && ["打印出库单", "重打出库单"].includes(cleanText(action))) return "outbound_note";
  if (fulfillment?.method === "快递快运") return "express_ltl_label";
  if (fulfillment?.method === "送货") return "delivery_note";
  if (fulfillment?.method === "自提") return "pickup_note";
  return "outbound_note";
}

export function getFulfillmentPrintAction(action, fulfillment) {
  const mappedAction = fulfillmentPrintActionByLabel[cleanText(action)] ?? "";
  if (mappedAction === "first_print" && fulfillment?.printed) return "reprint";
  return mappedAction;
}

export function isFulfillmentPrintActionLabel(action) {
  return Object.hasOwn(fulfillmentPrintActionByLabel, cleanText(action));
}

export function isSupportedFulfillmentPrintAction(printAction) {
  return supportedFulfillmentPrintActions.has(cleanText(printAction));
}

export function mapApiFulfillmentToLocal(value = {}) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.fulfillmentId ?? value.id);
  if (!id) return null;
  const packageCount = toNumber(value.packageCount, 0);
  const packageLabel = cleanText(value.packages ?? value.package) || (packageCount > 0 ? `${packageCount}包` : "待打包");
  const status = cleanText(value.status) || "待处理";
  return {
    id,
    fulfillmentId: id,
    customerId: cleanText(value.customerId ?? value.customer_id),
    lineId: cleanText(value.orderLineId ?? value.order_line_id),
    orderLineId: cleanText(value.orderLineId ?? value.order_line_id),
    method: getFulfillmentMethodLabel(value.method),
    goods: cleanText(value.goodsSpec ?? value.goods),
    qty: toNumber(value.expectedQty ?? value.qty, 0),
    actualQty: value.actualQty === undefined || value.actualQty === null ? null : toNumber(value.actualQty, 0),
    packages: packageLabel,
    package: packageLabel,
    packageCount,
    latest: cleanText(value.latestNeededAt ?? value.latest) || "待确认",
    status,
    printed: value.printed === true || status === "待确认拉走",
    labelsPrinted: value.labelsPrinted === true || value.labels_printed === true,
    labelPrintRecordId: cleanText(value.labelPrintRecordId ?? value.label_print_record_id),
    printRecordStatus: cleanText(value.printRecordStatus ?? value.print_record_status),
    activePrintRecordId: cleanText(value.activePrintRecordId ?? value.active_print_record_id),
    printRecordId: cleanText(value.printRecordId ?? value.print_record_id),
    revision: toNumber(value.revision, 1),
    paperOutboundDocumentId: cleanText(value.paperOutboundDocumentId ?? value.paper_outbound_document_id),
    paperOutboundDocumentVersion: toNumber(value.paperOutboundDocumentVersion ?? value.paper_outbound_document_version, 0),
    paperOutboundStatus: cleanText(value.paperOutboundStatus ?? value.paper_outbound_status),
    physicalOutboundAt: cleanText(value.physicalOutboundAt ?? value.physical_outbound_at),
    physicalExecutorEmployeeId: cleanText(value.physicalExecutorEmployeeId ?? value.physical_executor_employee_id),
    physicalOutboundDocumentId: cleanText(value.physicalOutboundDocumentId ?? value.physical_outbound_document_id),
    physicalOutboundDocumentVersion: toNumber(value.physicalOutboundDocumentVersion ?? value.physical_outbound_document_version, 0),
    finalDeliveryStatus: cleanText(value.finalDeliveryStatus ?? value.final_delivery_status),
    finalDeliveryAt: cleanText(value.finalDeliveryAt ?? value.final_delivery_at),
    legacyStateReviewRequired: value.legacyStateReviewRequired === true || value.legacy_state_review_required === true,
    paperOutboundDocument: value.paperOutboundDocument ?? value.paper_outbound_document ?? null,
    latestWarehouseExecution: value.latestWarehouseExecution ?? value.latest_warehouse_execution ?? null,
    zone: cleanText(value.zone ?? value.inventorySource),
    inventorySource: cleanText(value.inventorySource),
    source: "后端交付任务",
    noteFlags: Array.isArray(value.noteFlags) ? value.noteFlags : [],
    watermarkedPhotoAttached: value.watermarkedPhotoAttached === true,
    watermarkedPhotoAttachmentId: cleanText(value.watermarkedPhotoAttachmentId),
    signaturePhotoAttached: value.signaturePhotoAttached === true,
    signaturePhotoAttachmentId: cleanText(value.signaturePhotoAttachmentId),
    deliveryEvidenceReviewStatus: cleanText(value.deliveryEvidenceReviewStatus),
    deliveryEvidenceReviewedAt: cleanText(value.deliveryEvidenceReviewedAt),
    deliveryEvidenceReviewedBy: cleanText(value.deliveryEvidenceReviewedBy),
    deliveryEvidenceReviewedByUserId: cleanText(value.deliveryEvidenceReviewedByUserId),
    deliveryEvidenceIssueReason: cleanText(value.deliveryEvidenceIssueReason),
    driverId: cleanText(value.driverId ?? value.driver_id),
    routeDate: cleanText(value.routeDate ?? value.route_date),
    routeNo: cleanText(value.routeNo ?? value.routeBatchNo ?? value.route_batch_no),
    routeBatchNo: cleanText(value.routeBatchNo ?? value.routeNo ?? value.route_batch_no),
    routeSequence: toNumber(value.routeSequence ?? value.stopSequence ?? value.stop_sequence, 0),
    stopSequence: toNumber(value.stopSequence ?? value.routeSequence ?? value.stop_sequence, 0),
    dispatchStatus: cleanText(value.dispatchStatus ?? value.dispatch_status),
    plannedDepartureAt: cleanText(value.plannedDepartureAt ?? value.planned_departure_at),
    dispatchAssignedAt: cleanText(value.dispatchAssignedAt ?? value.assignedAt ?? value.assigned_at),
    dispatchRemark: cleanText(value.dispatchRemark ?? value.remark),
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
