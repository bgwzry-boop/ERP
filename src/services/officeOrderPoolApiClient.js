import { isOfficeApiServerRequired } from "./officeAuthService.js";
import {
  buildOfficeServerRequiredWriteError as buildServerRequiredWriteError,
  readOfficeApiJson as readJson,
  requestOfficeApi as requestOrderPoolApi,
  toOfficeApiError as toApiError,
} from "./officeApiClientCore.js";
import { getFulfillmentMethodLabel, getFulfillmentMethodValue } from "../shared/labels.js";

const defaultOrderPoolPageSize = 200;

export async function listOfficeOrderLines(input = {}, options = {}) {
  const {
    authState,
    operatorId,
    localOrderLines = [],
    page = 1,
    pageSize = defaultOrderPoolPageSize,
    includeHistory = false,
    filters = {},
  } = input;

  try {
    const response = await requestOrderPoolApi(`/order-lines${buildOrderLineQuery({ page, pageSize, includeHistory, filters })}`, {
      ...options,
      authState,
      operatorId,
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "订单池列表 API 返回错误。"),
        items: [],
        page,
        pageSize,
        total: 0,
      };
    }

    const items = Array.isArray(json?.items) ? json.items.map(mapApiOrderLineToLocal).filter(Boolean) : [];
    return {
      source: "api",
      items,
      page: toNumber(json?.page, page),
      pageSize: toNumber(json?.pageSize, pageSize),
      total: toNumber(json?.total, items.length),
    };
  } catch (error) {
    const items = localOrderLines.map(mapApiOrderLineToLocal).filter(Boolean);
    return {
      source: "local_fallback",
      error: {
        code: "ORDER_POOL_LIST_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      items,
      page,
      pageSize,
      total: items.length,
    };
  }
}

export async function getOfficeOrderLineDetail(input = {}, options = {}) {
  const {
    authState,
    orderLineId,
    operatorId,
    localOrderLines = [],
    localFulfillments = [],
    localStatements = [],
  } = input;
  const safeOrderLineId = String(orderLineId ?? "").trim();
  if (!safeOrderLineId) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "ORDER_LINE_ID_REQUIRED",
        message: "订单明细 ID 不能为空。",
      },
      detail: null,
    };
  }

  try {
    const response = await requestOrderPoolApi(`/order-lines/${encodeURIComponent(safeOrderLineId)}`, {
      ...options,
      authState,
      operatorId,
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "订单明细详情 API 返回错误。"),
        detail: null,
      };
    }

    return {
      source: "api",
      detail: mapApiOrderLineDetailToLocal(json),
    };
  } catch (error) {
    return {
      source: "local_fallback",
      error: {
        code: "ORDER_POOL_DETAIL_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      detail: buildLocalOrderLineDetail({
        orderLineId: safeOrderLineId,
        orderLines: localOrderLines,
        fulfillments: localFulfillments,
        statements: localStatements,
      }),
    };
  }
}

export async function adjustOfficeOrderLineQuantity(input = {}, options = {}) {
  const { authState, orderLine, orderLineId = orderLine?.id, newQty, reason = "customer_change", reasonText = "", operatorId } = input;
  const safeOrderLineId = cleanText(orderLineId);
  const safeNewQty = Math.trunc(Number(newQty ?? 0));
  if (!safeOrderLineId || !Number.isFinite(safeNewQty) || safeNewQty <= 0) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "ORDER_LINE_QUANTITY_INPUT_INVALID",
        message: "订单明细 ID 和新数量不能为空。",
      },
    };
  }

  try {
    const response = await requestOrderPoolApi(`/order-lines/${encodeURIComponent(safeOrderLineId)}/quantity-adjustment`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        orderLineId: safeOrderLineId,
        newQty: safeNewQty,
        reason: mapQuantityAdjustmentReasonToApi(reason),
        reasonText: reasonText || mapQuantityAdjustmentReasonText(reason),
        operatorId,
        adjustedAt: new Date().toISOString(),
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "订单明细改量 API 返回错误。"),
      };
    }

    return {
      source: "api",
      ...mapQuantityAdjustmentResponse(json, { orderLineId: safeOrderLineId, newQty: safeNewQty }),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("ORDER_LINE_QUANTITY_ADJUST_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "ORDER_LINE_QUANTITY_ADJUST_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      ...mapQuantityAdjustmentResponse(null, {
        orderLineId: safeOrderLineId,
        previousQty: orderLine?.qty,
        newQty: safeNewQty,
      }),
    };
  }
}

export async function voidOfficeOrderLine(input = {}, options = {}) {
  const { authState, orderLine, orderLineId = orderLine?.id, reason = "order_cancelled", reasonText = "", operatorId } = input;
  const safeOrderLineId = cleanText(orderLineId);
  if (!safeOrderLineId) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "ORDER_LINE_ID_REQUIRED",
        message: "订单明细 ID 不能为空。",
      },
    };
  }

  try {
    const response = await requestOrderPoolApi(`/order-lines/${encodeURIComponent(safeOrderLineId)}/void`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        orderLineId: safeOrderLineId,
        reason: mapVoidReasonToApi(reason),
        reasonText: reasonText || mapVoidReasonText(reason),
        operatorId,
        voidedAt: new Date().toISOString(),
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "订单明细作废 API 返回错误。"),
      };
    }

    return {
      source: "api",
      ...mapVoidOrderLineResponse(json, { orderLineId: safeOrderLineId }),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("ORDER_LINE_VOID_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "ORDER_LINE_VOID_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      ...mapVoidOrderLineResponse(null, { orderLineId: safeOrderLineId }),
    };
  }
}

export function mapApiOrderLineDetailToLocal(value = {}) {
  const orderLine = mapApiOrderLineToLocal(value.orderLine ?? value.order_line ?? value);
  if (!orderLine) return null;
  return {
    orderLine,
    originalOrder: {
      orderId: cleanText(value.originalOrder?.orderId ?? value.original_order?.order_id ?? orderLine.orderId),
      orderNo: cleanText(value.originalOrder?.orderNo ?? value.original_order?.order_no ?? orderLine.orderNo),
      sourceText: cleanText(value.originalOrder?.sourceText ?? value.original_order?.source_text),
      sourceChannel: cleanText(value.originalOrder?.sourceChannel ?? value.original_order?.source_channel) || "manual",
      summaryStatus: cleanText(value.originalOrder?.summaryStatus ?? value.original_order?.summary_status ?? orderLine.status),
      createdBy: cleanText(value.originalOrder?.createdBy ?? value.original_order?.created_by),
      createdAt: cleanText(value.originalOrder?.createdAt ?? value.original_order?.created_at),
    },
    priceSnapshot: mapPriceSnapshot(value.priceSnapshot ?? value.price_snapshot, orderLine),
    production: Array.isArray(value.production) ? value.production : [],
    inventory: Array.isArray(value.inventory) ? value.inventory.map(mapInventoryTrace).filter(Boolean) : [],
    fulfillment: Array.isArray(value.fulfillment) ? value.fulfillment.map(mapFulfillmentTrace).filter(Boolean) : [],
    statement: Array.isArray(value.statement) ? value.statement.map(mapStatementTrace).filter(Boolean) : [],
    attachments: Array.isArray(value.attachments) ? value.attachments : [],
    operationLogs: Array.isArray(value.operationLogs) ? value.operationLogs : [],
  };
}

export function mapApiOrderLineToLocal(value = {}) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id ?? value.orderLineId ?? value.order_line_id);
  if (!id) return null;
  const orderNo = cleanText(value.orderNo ?? value.order_no ?? value.bizNo ?? value.biz_no) || id.replace(/-\d{2}$/, "");
  const lineNo = cleanText(value.lineNo ?? value.line_no) || id.split("-").at(-1) || "";
  const printFlag = Boolean(value.printFlag ?? value.print_flag ?? value.print === "是");
  const inventory = cleanText(value.inventory) || mapReservationToInventoryLabel(value.reservationStatus ?? value.reservation_status);
  const orderType = mapOrderTypeToLocal(value.orderType ?? value.order_type, { printFlag, inventory });
  const exceptions = toStringArray(value.exceptionTags ?? value.exception_tags ?? value.exceptions);

  return {
    id,
    orderLineId: id,
    orderId: cleanText(value.orderId ?? value.order_id ?? orderNo),
    orderNo,
    lineNo,
    shortNo: cleanText(value.shortNo ?? value.short_no) || id.slice(-5),
    customerId: cleanText(value.customerId ?? value.customer_id),
    customerName: cleanText(value.customerName ?? value.customer_name),
    productName: cleanText(value.productName ?? value.product_name ?? value.product) || "空白袋",
    product: cleanText(value.product ?? value.productName ?? value.product_name) || "空白袋",
    size: cleanText(value.size) || "待确认",
    bagColor: cleanText(value.bagColor ?? value.bag_color ?? value.color) || "待确认",
    color: cleanText(value.color ?? value.bagColor ?? value.bag_color) || "待确认",
    handleType: cleanText(value.handleType ?? value.handle_type ?? value.handle) || "普通提",
    handle: cleanText(value.handle ?? value.handleType ?? value.handle_type) || "普通提",
    style: cleanText(value.style) || "空白袋",
    printFlag,
    print: printFlag ? "是" : "否",
    printColor: cleanText(value.printColor ?? value.print_color),
    printSide: mapPrintSideToLocal(value.printSide ?? value.print_side, printFlag),
    handleColor: cleanText(value.handleColor ?? value.handle_color),
    qty: toNumber(value.qty ?? value.originalQty ?? value.original_qty, 0),
    originalQty: toNumber(value.originalQty ?? value.original_qty ?? value.qty, 0),
    orderType,
    lineStatus: cleanText(value.lineStatus ?? value.line_status ?? value.status) || "待确认",
    status: cleanText(value.status ?? value.lineStatus ?? value.line_status) || "待确认",
    fulfillmentMethod: getFulfillmentMethodLabel(value.fulfillmentMethod ?? value.fulfillment_method ?? value.fulfillment),
    fulfillment: getFulfillmentMethodLabel(value.fulfillment ?? value.fulfillmentMethod ?? value.fulfillment_method),
    latestNeededAt: cleanText(value.latestNeededAt ?? value.latest_needed_at),
    latest: cleanText(value.latest ?? value.latestNeededAt ?? value.latest_needed_at) || "待确认",
    amount: toNumber(value.amount ?? value.finalAmount ?? value.final_amount, 0),
    financeState: mapFinanceStateToLocal(value.financeState ?? value.finance_state),
    exceptionTags: exceptions,
    exceptions,
    inventory,
    reservationStatus: cleanText(value.reservationStatus ?? value.reservation_status),
    reservedQty: toNumber(value.reservedQty ?? value.reserved_qty, 0),
    fulfillmentStatus: cleanText(value.fulfillmentStatus ?? value.fulfillment_status),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    createdAt: cleanText(value.createdAt ?? value.created_at),
    note: cleanText(value.note ?? value.customerNote ?? value.customer_note ?? value.officeNote ?? value.office_note),
  };
}

export function mapOrderTypeToLocal(value, context = {}) {
  const normalized = cleanText(value);
  if (normalized === "custom_print") return "定制印刷";
  if (normalized === "external_print") return "外加工印刷";
  if (normalized === "replenishment") return "印刷通货";
  if (normalized === "stock") return context.inventory?.startsWith("缺货") ? "现货缺货" : "现货有货";
  if (["定制印刷", "外加工印刷", "印刷通货", "现货缺货", "现货有货"].includes(normalized)) return normalized;
  if (context.printFlag) return "定制印刷";
  return context.inventory?.startsWith("缺货") ? "现货缺货" : "现货有货";
}

export function mapQuantityAdjustmentReasonToApi(value) {
  const normalized = cleanText(value);
  const reasonByLabel = {
    客户改量: "customer_change",
    识别数量修正: "recognition_error",
    库存复核后改量: "stock_recheck",
    办公室修正数量: "office_correction",
    管理批准改量: "management_approved",
    其他原因改量: "other",
  };
  if (["customer_change", "recognition_error", "stock_recheck", "office_correction", "management_approved", "other"].includes(normalized)) {
    return normalized;
  }
  return reasonByLabel[normalized] ?? "customer_change";
}

export function mapQuantityAdjustmentReasonText(value) {
  const normalized = cleanText(value);
  const labelByCode = {
    customer_change: "客户改量",
    recognition_error: "识别数量修正",
    stock_recheck: "库存复核后改量",
    office_correction: "办公室修正数量",
    management_approved: "管理批准改量",
    other: "其他原因改量",
  };
  return (labelByCode[normalized] ?? normalized) || "客户改量";
}

export function mapVoidReasonToApi(value) {
  const normalized = cleanText(value);
  const reasonByLabel = {
    客户取消订单: "order_cancelled",
    重复订单作废: "duplicate_order",
    识别错误作废: "recognition_error",
    库存不足取消: "stock_not_available",
    管理拒绝接单: "management_rejected",
    订单改量作废重建: "qty_changed",
    客户拒绝等待取消: "customer_rejected",
    其他原因作废: "other",
  };
  if (["order_cancelled", "duplicate_order", "recognition_error", "stock_not_available", "management_rejected", "qty_changed", "customer_rejected", "other"].includes(normalized)) {
    return normalized;
  }
  return reasonByLabel[normalized] ?? "order_cancelled";
}

export function mapVoidReasonText(value) {
  const normalized = cleanText(value);
  const labelByCode = {
    order_cancelled: "客户取消订单",
    duplicate_order: "重复订单作废",
    recognition_error: "识别错误作废",
    stock_not_available: "库存不足取消",
    management_rejected: "管理拒绝接单",
    qty_changed: "订单改量作废重建",
    customer_rejected: "客户拒绝等待取消",
    other: "其他原因作废",
  };
  return (labelByCode[normalized] ?? normalized) || "客户取消订单";
}

export function buildOrderLineQuery(input = {}) {
  const params = new URLSearchParams();
  params.set("page", String(Math.max(1, toNumber(input.page, 1))));
  params.set("pageSize", String(Math.max(1, Math.min(defaultOrderPoolPageSize, toNumber(input.pageSize, defaultOrderPoolPageSize)))));
  if (input.includeHistory !== undefined) params.set("includeHistory", input.includeHistory ? "true" : "false");

  const filters = input.filters ?? {};
  setQueryParam(params, "customerId", filters.customerId, (value) => value !== "全部");
  setQueryParam(params, "status", filters.status, (value) => value !== "全部");
  setQueryParam(params, "orderType", mapOrderTypeToApi(filters.orderType), Boolean);
  setQueryParam(
    params,
    "fulfillmentMethod",
    getFulfillmentMethodValue(filters.fulfillment, filters.fulfillment),
    (value) => value !== "全部",
  );
  if (filters.exception === "仅异常") params.set("exceptionOnly", "true");
  setQueryParam(params, "financeState", mapFinanceStateToApi(filters.finance), Boolean);
  setQueryParam(params, "keyword", filters.keyword, Boolean);

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildLocalOrderLineDetail({ orderLineId, orderLines, fulfillments, statements }) {
  const orderLine = orderLines.map(mapApiOrderLineToLocal).find((item) => item?.id === orderLineId);
  if (!orderLine) return null;
  return {
    orderLine,
    originalOrder: {
      orderId: orderLine.orderId,
      orderNo: orderLine.orderNo,
      sourceText: "",
      sourceChannel: "manual",
      summaryStatus: orderLine.status,
      createdBy: "",
      createdAt: "",
    },
    priceSnapshot: mapPriceSnapshot(null, orderLine),
    production: [],
    inventory: [],
    fulfillment: fulfillments
      .filter((item) => item.lineId === orderLineId || item.orderLineId === orderLineId)
      .map((item) =>
        mapFulfillmentTrace({
          fulfillmentId: item.id,
          orderLineId: item.lineId,
          method: item.method,
          status: item.status,
          expectedQty: item.qty,
          actualQty: item.actualQty,
          latestNeededAt: item.latest,
        }),
      )
      .filter(Boolean),
    statement: statements
      .filter((item) => Array.isArray(item.lineIds) && item.lineIds.includes(orderLineId))
      .map((item) =>
        mapStatementTrace({
          statementId: item.id,
          period: item.period,
          status: item.status,
          receivable: item.receivable,
          received: item.received,
          variance: item.variance,
        }),
      )
      .filter(Boolean),
    attachments: [],
    operationLogs: [],
  };
}

function mapQuantityAdjustmentResponse(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  const previousQty = toNumber(source.previousQty ?? source.previous_qty ?? fallback.previousQty, 0);
  const newQty = toNumber(source.newQty ?? source.new_qty ?? fallback.newQty, fallback.newQty);
  const priceSnapshot = mapQuantityAdjustmentPriceSnapshot(source.priceSnapshot ?? source.price_snapshot, {
    orderLineId: fallback.orderLineId,
    chargeableQty: newQty,
  });
  return {
    orderLineId: cleanText(source.orderLineId ?? source.order_line_id) || fallback.orderLineId,
    previousQty,
    newQty,
    qtyDelta: toNumber(source.qtyDelta ?? source.qty_delta, newQty - previousQty),
    status: cleanText(source.status),
    priceSnapshot,
    finalAmount: toNumber(source.finalAmount ?? source.final_amount ?? priceSnapshot?.finalAmount, priceSnapshot?.finalAmount),
    adjustedReservations: Array.isArray(source.adjustedReservations)
      ? source.adjustedReservations
      : [],
    adjustedFulfillmentIds: toStringArray(source.adjustedFulfillmentIds ?? source.adjusted_fulfillment_ids),
    inventoryLedgerIds: toStringArray(source.inventoryLedgerIds ?? source.inventory_ledger_ids),
    adjustedStatementLines: Array.isArray(source.adjustedStatementLines)
      ? source.adjustedStatementLines.map(mapAdjustedStatementLine).filter(Boolean)
      : [],
    adjustedStatements: Array.isArray(source.adjustedStatements)
      ? source.adjustedStatements.map(mapAdjustedStatementRecord).filter(Boolean)
      : [],
    orderLineChangeRecordId: cleanText(source.orderLineChangeRecordId ?? source.order_line_change_record_id),
    operationLogId: cleanText(source.operationLogId ?? source.operation_log_id),
  };
}

function mapQuantityAdjustmentPriceSnapshot(value, fallback = {}) {
  if (!value || typeof value !== "object") return null;
  return {
    priceSnapshotId: cleanText(value.priceSnapshotId ?? value.id ?? value.price_snapshot_id),
    orderLineId: cleanText(value.orderLineId ?? value.order_line_id) || fallback.orderLineId,
    snapshotType: cleanText(value.snapshotType ?? value.snapshot_type),
    versionNo: toNumber(value.versionNo ?? value.version_no, 0),
    bagPrice: toNumber(value.bagPrice ?? value.bag_price, 0),
    printPrice: toNumber(value.printPrice ?? value.print_price, 0),
    otherFee: toNumber(value.otherFee ?? value.other_fee, 0),
    adjustmentAmount: toNumber(value.adjustmentAmount ?? value.adjustment_amount, 0),
    chargeableQty: toNumber(value.chargeableQty ?? value.chargeable_qty, fallback.chargeableQty),
    finalAmount: toNumber(value.finalAmount ?? value.final_amount ?? value.amount, 0),
    amount: toNumber(value.amount ?? value.finalAmount ?? value.final_amount, 0),
    overrideReason: cleanText(value.overrideReason ?? value.override_reason),
  };
}

function mapAdjustedStatementLine(value) {
  if (!value || typeof value !== "object") return null;
  const statementLineId = cleanText(value.statementLineId ?? value.id ?? value.statement_line_id);
  if (!statementLineId) return null;
  return {
    statementLineId,
    statementId: cleanText(value.statementId ?? value.statement_id),
    orderLineId: cleanText(value.orderLineId ?? value.order_line_id),
    deliveredQty: toNumber(value.deliveredQty ?? value.delivered_qty, 0),
    chargeableQty: toNumber(value.chargeableQty ?? value.chargeable_qty, 0),
    amount: toNumber(value.amount, 0),
    adjustmentAmount: toNumber(value.adjustmentAmount ?? value.adjustment_amount, 0),
    finalAmount: toNumber(value.finalAmount ?? value.final_amount ?? value.amount, 0),
  };
}

function mapAdjustedStatementRecord(value) {
  if (!value || typeof value !== "object") return null;
  const statementId = cleanText(value.statementId ?? value.id ?? value.statement_id);
  if (!statementId) return null;
  return {
    statementId,
    id: statementId,
    status: cleanText(value.status),
    receivable: toNumber(value.receivable ?? value.receivableAmount ?? value.receivable_amount, 0),
    received: toNumber(value.received ?? value.receivedAmount ?? value.received_amount, 0),
    variance: toNumber(value.variance ?? value.varianceAmount ?? value.variance_amount, 0),
  };
}

function mapVoidOrderLineResponse(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  return {
    orderLineId: cleanText(source.orderLineId ?? source.order_line_id) || fallback.orderLineId,
    status: cleanText(source.status) || "已关闭",
    releasedReservations: Array.isArray(source.releasedReservations)
      ? source.releasedReservations
      : [],
    canceledFulfillmentIds: toStringArray(source.canceledFulfillmentIds ?? source.canceled_fulfillment_ids),
    inventoryLedgerIds: toStringArray(source.inventoryLedgerIds ?? source.inventory_ledger_ids),
    orderLineChangeRecordId: cleanText(source.orderLineChangeRecordId ?? source.order_line_change_record_id),
    operationLogId: cleanText(source.operationLogId ?? source.operation_log_id),
  };
}

function mapPrintSideToLocal(value, printFlag) {
  if (!printFlag) return "";
  const normalized = cleanText(value);
  if (normalized === "single") return "单面";
  if (normalized === "double") return "双面";
  return normalized;
}

function mapReservationToInventoryLabel(value) {
  const normalized = cleanText(value);
  if (normalized === "生效") return "已占用";
  return normalized;
}

function mapPriceSnapshot(value, orderLine) {
  const source = value && typeof value === "object" ? value : {};
  return {
    priceSnapshotId: cleanText(source.priceSnapshotId ?? source.id ?? source.price_snapshot_id),
    orderLineId: cleanText(source.orderLineId ?? source.order_line_id) || orderLine.id,
    snapshotType: cleanText(source.snapshotType ?? source.snapshot_type) || "order_confirm",
    versionNo: toNumber(source.versionNo ?? source.version_no, 1),
    bagPrice: toNumber(source.bagPrice ?? source.bag_price, 0),
    printPrice: toNumber(source.printPrice ?? source.print_price, 0),
    otherFee: toNumber(source.otherFee ?? source.other_fee, 0),
    adjustmentAmount: toNumber(source.adjustmentAmount ?? source.adjustment_amount, 0),
    chargeableQty: toNumber(source.chargeableQty ?? source.chargeable_qty ?? orderLine.qty, orderLine.qty),
    finalAmount: toNumber(source.finalAmount ?? source.final_amount ?? source.amount ?? orderLine.amount, orderLine.amount),
    amount: toNumber(source.amount ?? source.finalAmount ?? source.final_amount ?? orderLine.amount, orderLine.amount),
    overrideReason: cleanText(source.overrideReason ?? source.override_reason),
    createdBy: cleanText(source.createdBy ?? source.created_by),
    createdAt: cleanText(source.createdAt ?? source.created_at),
  };
}

function mapInventoryTrace(value) {
  if (!value || typeof value !== "object") return null;
  const reservationId = cleanText(value.reservationId ?? value.reservation_id ?? value.id);
  const inventoryItemId = cleanText(value.inventoryItemId ?? value.inventory_item_id);
  if (!reservationId && !inventoryItemId) return null;
  return {
    reservationId,
    inventoryItemId,
    inventoryKey: cleanText(value.inventoryKey ?? value.inventory_key),
    zone: cleanText(value.zone),
    state: cleanText(value.state ?? value.inventoryState ?? value.inventory_state),
    trustLevel: cleanText(value.trustLevel ?? value.trust_level),
    reservedQty: toNumber(value.reservedQty ?? value.reserved_qty ?? value.qty, 0),
    availableQty: toNumber(value.availableQty ?? value.available_qty ?? value.available, 0),
    ledgerIds: toStringArray(value.ledgerIds ?? value.ledger_ids),
  };
}

function mapFulfillmentTrace(value) {
  if (!value || typeof value !== "object") return null;
  const fulfillmentId = cleanText(value.fulfillmentId ?? value.fulfillment_id ?? value.id);
  if (!fulfillmentId) return null;
  return {
    fulfillmentId,
    orderLineId: cleanText(value.orderLineId ?? value.order_line_id ?? value.lineId),
    method: getFulfillmentMethodLabel(value.method),
    status: cleanText(value.status),
    expectedQty: toNumber(value.expectedQty ?? value.expected_qty ?? value.qty, 0),
    actualQty: value.actualQty ?? value.actual_qty,
    latestNeededAt: cleanText(value.latestNeededAt ?? value.latest_needed_at ?? value.latest),
  };
}

function mapStatementTrace(value) {
  if (!value || typeof value !== "object") return null;
  const statementId = cleanText(value.statementId ?? value.statement_id ?? value.id);
  if (!statementId) return null;
  return {
    statementId,
    period: cleanText(value.period),
    status: cleanText(value.status),
    receivable: toNumber(value.receivable ?? value.receivable_amount, 0),
    received: toNumber(value.received ?? value.received_amount, 0),
    variance: toNumber(value.variance ?? value.variance_amount, 0),
  };
}

function mapOrderTypeToApi(value) {
  const normalized = cleanText(value);
  if (normalized === "定制印刷") return "custom_print";
  if (normalized === "外加工印刷") return "external_print";
  if (normalized === "印刷通货") return "replenishment";
  if (normalized === "现货有货" || normalized === "现货缺货") return "stock";
  if (["stock", "custom_print", "external_print", "replenishment"].includes(normalized)) return normalized;
  return "";
}

function mapFinanceStateToLocal(value) {
  const normalized = cleanText(value);
  const labelByState = {
    unbilled: "未入账",
    pending_statement: "待对账",
    sent: "待对账",
    variance: "差额/欠款",
    debt: "差额/欠款",
    settled: "已结清/无差额",
  };
  return labelByState[normalized] ?? normalized;
}

function mapFinanceStateToApi(value) {
  const normalized = cleanText(value);
  const stateByLabel = {
    未入账: "unbilled",
    待对账: "pending_statement",
    差额: "variance",
    欠款: "debt",
    "差额/欠款": "variance",
    收款待确认: "sent",
    "已结清/无差额": "settled",
  };
  return stateByLabel[normalized] ?? "";
}

function setQueryParam(params, key, value, predicate) {
  const normalized = cleanText(value);
  if (normalized && predicate(normalized)) params.set(key, normalized);
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean);
  if (!value) return [];
  return [cleanText(value)].filter(Boolean);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
