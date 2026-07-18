import {
  buildDriverGoodsSummary,
  findActiveDriverDeliveryDispatch,
} from "./driverDeliveryTaskProjectionService.mjs";

const methodValueByLabel = new Map([
  ["自提", "pickup"],
  ["送货", "delivery"],
  ["快递快运", "express_ltl"],
  ["待确认", "pending"],
]);
const methodLabelByValue = new Map([...methodValueByLabel].map(([label, value]) => [value, label]));

export function createFulfillmentReadProjectionService() {
  return {
    listFulfillments({ workspace = {}, searchParams } = {}) {
      const filters = readFilters(searchParams);
      const projected = list(workspace.fulfillments).map((item, index) => ({
        item: projectFulfillment(workspace, item),
        index,
      }));
      const metrics = buildMetrics(projected.map(({ item }) => item));
      const items = projected
        .filter(({ item }) => matchesFilters(item, filters))
        .sort(comparePriority)
        .map(({ item }) => item);
      return { items, metrics, filters };
    },

    getFulfillment({ workspace = {}, fulfillmentId = "" } = {}) {
      const id = cleanText(fulfillmentId);
      const item = list(workspace.fulfillments).find(
        (candidate) => cleanText(candidate.id ?? candidate.fulfillmentId ?? candidate.fulfillment_id) === id,
      );
      return item ? projectFulfillment(workspace, item) : null;
    },

    projectFulfillment({ workspace = {}, fulfillment = {} } = {}) {
      return projectFulfillment(workspace, fulfillment);
    },
  };
}

export function normalizeFulfillmentMethod(value) {
  const normalized = cleanText(value);
  if (methodLabelByValue.has(normalized)) return normalized;
  return methodValueByLabel.get(normalized) ?? "pending";
}

export function getFulfillmentMethodLabel(value) {
  const normalized = normalizeFulfillmentMethod(value);
  return methodLabelByValue.get(normalized) ?? "待确认";
}

function projectFulfillment(workspace, value) {
  const item = record(value);
  const fulfillmentId = cleanText(item.id ?? item.fulfillmentId ?? item.fulfillment_id);
  const orderLineId = cleanText(item.lineId ?? item.orderLineId ?? item.order_line_id);
  const orderLine = findOrderLine(workspace, orderLineId);
  const customerId = cleanText(item.customerId ?? item.customer_id ?? orderLine.customerId ?? orderLine.customer_id);
  const customer = findCustomer(workspace, customerId);
  const method = normalizeFulfillmentMethod(item.method ?? item.fulfillmentMethod ?? item.fulfillment_method);
  const expectedQty = nonNegativeInteger(
    item.expectedQty ?? item.expected_qty ?? item.qty,
    orderLine.qty,
  );
  const actualQty = optionalNonNegativeInteger(item.actualQty ?? item.actual_qty);
  const packageCount = resolvePackageCount(workspace, {
    fulfillmentId,
    orderLineId,
    explicitCount: item.packageCount ?? item.package_count,
    packageLabel: item.packages ?? item.package ?? item.packageSummary ?? item.package_summary,
  });
  const packageLabel =
    cleanText(item.packages ?? item.package ?? item.packageSummary ?? item.package_summary) ||
    (packageCount > 0 ? `${packageCount}包` : "待打包");
  const dispatch = findActiveDriverDeliveryDispatch(workspace, fulfillmentId);
  const paperOutboundDocument = findCurrentPaperOutboundDocument(workspace, fulfillmentId);
  const latestWarehouseExecution = findLatestWarehouseOutboundExecution(workspace, fulfillmentId);
  const currentPrintRecord = paperOutboundDocument
    ? findPrintRecord(workspace, paperOutboundDocument.printRecordId ?? paperOutboundDocument.print_record_id)
    : null;
  const latestLabelPrintRecord = findLatestLabelPrintRecord(workspace, fulfillmentId);
  const labelsPrinted = method === "express_ltl" && Boolean(
    latestLabelPrintRecord && list(workspace.packages)
      .filter((record) => cleanText(record.fulfillmentId ?? record.fulfillment_id) === fulfillmentId)
      .every((record) => cleanText(record.labelPrintRecordId ?? record.label_print_record_id) === cleanText(latestLabelPrintRecord.printRecordId ?? latestLabelPrintRecord.id)),
  );
  const paperOutboundStatus = resolvePaperOutboundStatus(workspace, item, paperOutboundDocument);
  const goodsSpec = buildDriverGoodsSummary({ fulfillment: item, orderLine, qty: expectedQty });
  const status = cleanText(item.status) || "待处理";
  return {
    fulfillmentId,
    customerId,
    orderLineId,
    orderNo: cleanText(item.orderNo ?? item.order_no) || orderLineId,
    customerName: cleanText(customer.name ?? item.customerName ?? item.customer_name) || "客户待确认",
    method,
    methodLabel: getFulfillmentMethodLabel(method),
    goodsSpec: goodsSpec || cleanText(item.goods ?? item.goodsSpec ?? item.goods_spec) || "货品待确认",
    expectedQty,
    actualQty,
    packageCount,
    package: packageLabel,
    packages: packageLabel,
    latestNeededAt: cleanText(item.latestNeededAt ?? item.latest_needed_at ?? item.latest),
    status,
    revision: nonNegativeInteger(item.revision, 1) || 1,
    printed: ["printed", "reprinted"].includes(cleanText(currentPrintRecord?.status)),
    labelsPrinted,
    labelPrintRecordId: cleanText(latestLabelPrintRecord?.printRecordId ?? latestLabelPrintRecord?.id),
    activePrintRecordId: cleanText(currentPrintRecord?.printRecordId ?? currentPrintRecord?.id),
    printRecordId: cleanText(currentPrintRecord?.printRecordId ?? currentPrintRecord?.id),
    printRecordStatus: cleanText(currentPrintRecord?.status),
    printBatch: cleanText(currentPrintRecord?.batchNo ?? currentPrintRecord?.batch_no),
    inventorySource: cleanText(item.inventorySource ?? item.inventory_source),
    zone: cleanText(item.zone ?? item.inventorySource ?? item.inventory_source),
    noteFlags: textList(item.noteFlags ?? item.note_flags),
    watermarkedPhotoAttached: item.watermarkedPhotoAttached === true || item.watermarked_photo_attached === true,
    watermarkedPhotoAttachmentId: cleanText(
      item.watermarkedPhotoAttachmentId ?? item.watermarked_photo_attachment_id,
    ),
    signaturePhotoAttached: item.signaturePhotoAttached === true || item.signature_photo_attached === true,
    signaturePhotoAttachmentId: cleanText(item.signaturePhotoAttachmentId ?? item.signature_photo_attachment_id),
    deliveryEvidenceReviewStatus: cleanText(
      item.deliveryEvidenceReviewStatus ?? item.delivery_evidence_review_status,
    ),
    deliveryEvidenceReviewedAt: cleanText(
      item.deliveryEvidenceReviewedAt ?? item.delivery_evidence_reviewed_at,
    ),
    deliveryEvidenceReviewedBy: cleanText(
      item.deliveryEvidenceReviewedBy ?? item.delivery_evidence_reviewed_by,
    ),
    deliveryEvidenceReviewedByUserId: cleanText(
      item.deliveryEvidenceReviewedByUserId ?? item.delivery_evidence_reviewed_by_user_id,
    ),
    deliveryEvidenceIssueReason: cleanText(
      item.deliveryEvidenceIssueReason ?? item.delivery_evidence_issue_reason,
    ),
    driverId: cleanText(dispatch.driverId ?? dispatch.driver_id ?? item.driverId ?? item.driver_id),
    routeDate: cleanText(dispatch.routeDate ?? dispatch.route_date ?? item.routeDate ?? item.route_date),
    routeNo: cleanText(
      dispatch.routeNo ??
        dispatch.routeBatchNo ??
        dispatch.route_batch_no ??
        item.routeNo ??
        item.routeBatchNo ??
        item.route_batch_no,
    ),
    routeSequence: nonNegativeInteger(
      dispatch.routeSequence ??
        dispatch.stopSequence ??
        dispatch.stop_sequence ??
        item.routeSequence ??
        item.stopSequence ??
        item.stop_sequence,
    ),
    dispatchStatus: cleanText(
      dispatch.dispatchStatus ?? dispatch.dispatch_status ?? item.dispatchStatus ?? item.dispatch_status,
    ),
    plannedDepartureAt: cleanText(
      dispatch.plannedDepartureAt ?? dispatch.planned_departure_at ?? item.plannedDepartureAt ?? item.planned_departure_at,
    ),
    dispatchAssignedAt: cleanText(
      dispatch.assignedAt ??
        dispatch.dispatchAssignedAt ??
        dispatch.assigned_at ??
        item.dispatchAssignedAt ??
        item.dispatch_assigned_at,
    ),
    dispatchRemark: cleanText(dispatch.remark ?? item.dispatchRemark ?? item.dispatch_remark),
    paperOutboundStatus,
    paperOutboundDocument: paperOutboundDocument ? projectPaperOutboundDocument(workspace, paperOutboundDocument) : null,
    paperOutboundDocumentId: cleanText(item.paperOutboundDocumentId ?? item.paper_outbound_document_id ?? paperOutboundDocument?.paperOutboundDocumentId ?? paperOutboundDocument?.id),
    paperOutboundDocumentVersion: nonNegativeInteger(
      item.paperOutboundDocumentVersion ?? item.paper_outbound_document_version ?? paperOutboundDocument?.documentVersion ?? paperOutboundDocument?.document_version,
    ),
    physicalOutboundAt: cleanText(item.physicalOutboundAt ?? item.physical_outbound_at),
    physicalExecutorEmployeeId: cleanText(item.physicalExecutorEmployeeId ?? item.physical_executor_employee_id),
    physicalOutboundDocumentId: cleanText(item.physicalOutboundDocumentId ?? item.physical_outbound_document_id),
    physicalOutboundDocumentVersion: nonNegativeInteger(
      item.physicalOutboundDocumentVersion ?? item.physical_outbound_document_version,
    ),
    finalDeliveryStatus: cleanText(item.finalDeliveryStatus ?? item.final_delivery_status) || "待最终交付",
    finalDeliveryAt: cleanText(item.finalDeliveryAt ?? item.final_delivery_at),
    legacyStateReviewRequired: item.legacyStateReviewRequired === true || item.legacy_state_review_required === true,
    latestWarehouseExecution: latestWarehouseExecution ? projectWarehouseOutboundExecution(latestWarehouseExecution) : null,
  };
}

function findCurrentPaperOutboundDocument(workspace, fulfillmentId) {
  return (workspace.paperOutboundDocuments ?? [])
    .filter((item) => cleanText(item.fulfillmentId ?? item.fulfillment_id) === fulfillmentId)
    .sort((left, right) => {
      const versionDelta = nonNegativeInteger(right.documentVersion ?? right.document_version) - nonNegativeInteger(left.documentVersion ?? left.document_version);
      if (versionDelta) return versionDelta;
      return cleanText(right.createdAt ?? right.created_at).localeCompare(cleanText(left.createdAt ?? left.created_at));
    })[0] ?? null;
}

function findLatestWarehouseOutboundExecution(workspace, fulfillmentId) {
  return (workspace.warehouseOutboundExecutions ?? [])
    .filter((item) => cleanText(item.fulfillmentId ?? item.fulfillment_id) === fulfillmentId)
    .sort((left, right) => cleanText(right.executedAt ?? right.executed_at).localeCompare(cleanText(left.executedAt ?? left.executed_at)))[0] ?? null;
}

function findPrintRecord(workspace, printRecordId) {
  const id = cleanText(printRecordId);
  if (!id) return null;
  return (workspace.printRecords ?? []).find(
    (item) => cleanText(item.printRecordId ?? item.id) === id,
  ) ?? null;
}

function findLatestLabelPrintRecord(workspace, fulfillmentId) {
  return list(workspace.printRecords)
    .filter((item) => cleanText(item.targetType) === "fulfillment")
    .filter((item) => cleanText(item.targetId) === fulfillmentId)
    .filter(isExpressLabelPrintRecord)
    .filter((item) => ["printed", "reprinted"].includes(cleanText(item.status)))
    .sort((left, right) => cleanText(right.printedAt ?? right.createdAt).localeCompare(cleanText(left.printedAt ?? left.createdAt)))[0] ?? null;
}

function isExpressLabelPrintRecord(record = {}) {
  const documentType = cleanText(record.documentType ?? record.document_type);
  if (documentType) return documentType === "express_ltl_label";
  const templateId = cleanText(record.templateId ?? record.template_id);
  if (templateId) return templateId === "tpl-p0-express-ltl-label";
  return list(record.packageSnapshot ?? record.package_snapshot_json).length > 0;
}

function resolvePaperOutboundStatus(workspace, fulfillment, document) {
  if (fulfillment.legacyStateReviewRequired === true || fulfillment.legacy_state_review_required === true) return "历史待复核";
  if (!document) return cleanText(fulfillment.paperOutboundStatus ?? fulfillment.paper_outbound_status) || "待生成纸单";
  if (cleanText(document.status) === "已作废") return "已作废待重打";
  if (cleanText(document.status) === "已交库房") return "已交库房";
  const printRecord = findPrintRecord(workspace, document.printRecordId ?? document.print_record_id);
  return ["printed", "reprinted"].includes(cleanText(printRecord?.status)) ? "已打印待交库房" : "待打印确认";
}

function projectPaperOutboundDocument(workspace, document) {
  const printRecord = findPrintRecord(workspace, document.printRecordId ?? document.print_record_id);
  return {
    paperOutboundDocumentId: cleanText(document.paperOutboundDocumentId ?? document.id),
    fulfillmentId: cleanText(document.fulfillmentId ?? document.fulfillment_id),
    printRecordId: cleanText(document.printRecordId ?? document.print_record_id),
    documentType: cleanText(document.documentType ?? document.document_type),
    documentVersion: nonNegativeInteger(document.documentVersion ?? document.document_version, 1) || 1,
    status: resolvePaperOutboundStatus(workspace, {}, document),
    storedStatus: cleanText(document.status),
    revision: nonNegativeInteger(document.revision, 1) || 1,
    printedBy: cleanText(document.printedBy ?? document.printed_by),
    printedAt: cleanText(printRecord?.printedAt ?? printRecord?.printed_at ?? document.printedAt ?? document.printed_at),
    handedToWarehouseAt: cleanText(document.handedToWarehouseAt ?? document.handed_to_warehouse_at),
    handedToWarehouseBy: cleanText(document.handedToWarehouseBy ?? document.handed_to_warehouse_by),
    handoverNote: cleanText(document.handoverNote ?? document.handover_note),
    voidedAt: cleanText(document.voidedAt ?? document.voided_at),
    voidReason: cleanText(document.voidReason ?? document.void_reason),
  };
}

function projectWarehouseOutboundExecution(execution) {
  return {
    warehouseOutboundExecutionId: cleanText(execution.warehouseOutboundExecutionId ?? execution.id),
    paperOutboundDocumentId: cleanText(execution.paperOutboundDocumentId ?? execution.paper_outbound_document_id),
    paperDocumentVersion: nonNegativeInteger(execution.paperDocumentVersion ?? execution.paper_document_version),
    paperDocumentRevision: nonNegativeInteger(execution.paperDocumentRevision ?? execution.paper_document_revision),
    result: cleanText(execution.result),
    expectedQty: nonNegativeInteger(execution.expectedQty ?? execution.expected_qty),
    actualQty: optionalNonNegativeInteger(execution.actualQty ?? execution.actual_qty),
    physicalExecutorEmployeeId: cleanText(execution.physicalExecutorEmployeeId ?? execution.physical_executor_employee_id),
    feedbackChannel: cleanText(execution.feedbackChannel ?? execution.feedback_channel),
    executedAt: cleanText(execution.executedAt ?? execution.executed_at),
    note: cleanText(execution.note),
    authenticatedOperatorId: cleanText(execution.authenticatedOperatorId ?? execution.authenticated_operator_id),
  };
}

function readFilters(searchParams) {
  const rawMethod = cleanText(readQuery(searchParams, "method"));
  return {
    keyword: cleanText(readQuery(searchParams, "keyword")),
    method: rawMethod ? normalizeFulfillmentMethod(rawMethod) : "",
    status: cleanText(readQuery(searchParams, "status")),
    date: cleanText(readQuery(searchParams, "date")),
    exceptionOnly: ["true", "1", "yes"].includes(cleanText(readQuery(searchParams, "exceptionOnly")).toLowerCase()),
  };
}

function matchesFilters(item, filters) {
  if (filters.method && item.method !== filters.method) return false;
  if (filters.status && item.status !== filters.status) return false;
  if (filters.date && item.routeDate !== filters.date && !item.latestNeededAt.startsWith(filters.date)) return false;
  if (filters.exceptionOnly && !isException(item.status)) return false;
  if (!filters.keyword) return true;
  const keyword = filters.keyword.toLowerCase();
  return [
    item.fulfillmentId,
    item.orderLineId,
    item.orderNo,
    item.customerName,
    item.method,
    item.methodLabel,
    item.goodsSpec,
    item.status,
    item.inventorySource,
    item.zone,
    item.routeNo,
    ...item.noteFlags,
  ]
    .join(" ")
    .toLowerCase()
    .includes(keyword);
}

function buildMetrics(items) {
  return {
    openCount: items.filter((item) => !isCompleted(item.status)).length,
    todayUrgentCount: items.filter((item) => item.latestNeededAt.includes("今天")).length,
    exceptionCount: items.filter((item) => isException(item.status)).length,
    waitingPickupCount: items.filter((item) => item.status.includes("待确认拉走")).length,
  };
}

function comparePriority(left, right) {
  const score = priorityScore(right.item) - priorityScore(left.item);
  return score || left.index - right.index;
}

function priorityScore(item) {
  if (isException(item.status)) return 4;
  if (!isCompleted(item.status) && item.latestNeededAt.includes("今天")) return 3;
  if (!isCompleted(item.status)) return 2;
  return 1;
}

function isException(status) {
  return ["差异", "无法", "异常", "缺货", "取消待处理"].some((marker) => cleanText(status).includes(marker));
}

function isCompleted(status) {
  return ["已交付", "已完成", "已取消"].some((marker) => cleanText(status).includes(marker));
}

function resolvePackageCount(workspace, { fulfillmentId, orderLineId, explicitCount, packageLabel }) {
  const packageRows = list(workspace.packages).filter((item) => {
    const itemFulfillmentId = cleanText(item.fulfillmentId ?? item.fulfillment_id);
    if (itemFulfillmentId) return itemFulfillmentId === fulfillmentId;
    return orderLineId && cleanText(item.orderLineId ?? item.order_line_id) === orderLineId;
  });
  if (packageRows.length) return packageRows.length;
  const explicit = optionalNonNegativeInteger(explicitCount);
  if (explicit !== null) return explicit;
  const label = cleanText(packageLabel);
  const fraction = label.match(/\/\s*(\d+)/);
  if (fraction) return nonNegativeInteger(fraction[1]);
  const unitCount = [...label.matchAll(/(\d+)\s*(?:包|件)/g)].at(-1);
  if (unitCount) return nonNegativeInteger(unitCount[1]);
  const anyCount = [...label.matchAll(/\d+/g)].at(-1);
  return anyCount ? nonNegativeInteger(anyCount[0]) : 0;
}

function findOrderLine(workspace, orderLineId) {
  return (
    list(workspace.orderLines).find(
      (item) => cleanText(item.id ?? item.orderLineId ?? item.order_line_id) === orderLineId,
    ) ?? {}
  );
}

function findCustomer(workspace, customerId) {
  return (
    list(workspace.customers).find(
      (item) => cleanText(item.id ?? item.customerId ?? item.customer_id) === customerId,
    ) ?? {}
  );
}

function optionalNonNegativeInteger(value) {
  if (!cleanText(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = optionalNonNegativeInteger(value);
  if (parsed !== null) return parsed;
  return optionalNonNegativeInteger(fallback) ?? 0;
}

function textList(value) {
  return [...new Set(list(value).map(cleanText).filter(Boolean))];
}

function readQuery(searchParams, key) {
  if (typeof searchParams?.get === "function") return searchParams.get(key);
  return record(searchParams)[key];
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return String(value ?? "").trim();
}
