import { isOfficeApiServerRequired } from "./officeAuthService.js";
import {
  buildOfficeServerRequiredWriteError as buildServerRequiredWriteError,
  readOfficeApiJson as readJson,
  requestOfficeApi as requestFulfillmentApi,
  toOfficeApiError as toApiError,
} from "./officeApiClientCore.js";
import { getFulfillmentMethodValue } from "../shared/labels.js";
import {
  getFulfillmentDocumentType,
  getFulfillmentPrintAction,
  isSupportedFulfillmentPrintAction,
  mapApiFulfillmentToLocal,
  mapFulfillmentExceptionReason,
  mapPrintVoidReason,
} from "./officeFulfillmentSelectors.js";

export {
  getFulfillmentDocumentType,
  getFulfillmentPrintAction,
  isFulfillmentPrintActionLabel,
  isSupportedFulfillmentPrintAction,
  mapApiFulfillmentToLocal,
  mapFulfillmentExceptionReason,
  mapPrintVoidReason,
} from "./officeFulfillmentSelectors.js";

const defaultFulfillmentPageSize = 200;

export async function listOfficeFulfillments(input = {}, options = {}) {
  const { authState, operatorId, localFulfillments = [], page = 1, pageSize = defaultFulfillmentPageSize, filters = {} } = input;
  try {
    const response = await requestFulfillmentApi(`/fulfillments${buildFulfillmentListQuery({ page, pageSize, filters })}`, {
      ...options,
      authState,
      operatorId,
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "出库交付列表 API 返回错误。"),
        items: [],
        total: 0,
      };
    }
    const items = Array.isArray(json?.items) ? json.items.map(mapApiFulfillmentToLocal).filter(Boolean) : [];
    return {
      source: "api",
      items,
      total: toNumber(json?.total, items.length),
      metrics: json?.metrics ?? {},
    };
  } catch (error) {
    return {
      source: "local_fallback",
      error: {
        code: "FULFILLMENT_LIST_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      items: localFulfillments.map(mapApiFulfillmentToLocal).filter(Boolean),
      total: localFulfillments.length,
      metrics: {},
    };
  }
}

export async function printOfficeFulfillment(input, options = {}) {
  const { authState, fulfillment, action = "打印预览", operatorId, printAction } = input;
  const resolvedPrintAction = cleanText(printAction) || getFulfillmentPrintAction(action);
  if (!isSupportedFulfillmentPrintAction(resolvedPrintAction)) {
    return {
      source: "ui_error",
      blocked: true,
      error: {
        code: "FULFILLMENT_PRINT_ACTION_UNSUPPORTED",
        message: "不支持的出库打印动作，未创建打印记录。",
      },
    };
  }
  const previousPrintRecordId =
    input.previousPrintRecordId ??
    fulfillment?.activePrintRecordId ??
    fulfillment?.printRecordId ??
    fulfillment?.lastPrintRecordId ??
    "";
  const reprintReason = input.reprintReason ?? mapPrintVoidReason(input.reason ?? "信息变更需重打");

  try {
    const response = await requestFulfillmentApi(`/fulfillments/${encodeURIComponent(fulfillment.id)}/print`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        templateId: getFulfillmentTemplateId(fulfillment, action),
        documentType: getFulfillmentDocumentType(fulfillment, action),
        printAction: resolvedPrintAction,
        ...(resolvedPrintAction === "reprint" ? { previousPrintRecordId, reprintReason } : {}),
        operatorId,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "出库打印 API 返回错误。"),
      };
    }

    return {
      source: "api",
      fulfillmentId: json.fulfillmentId,
      nextStatus: json.nextStatus,
      printRecord: json.printRecord,
      printTemplate: json.printTemplate,
      printJob: json.printJob,
      printJobId: json.printJobId,
      printJobOperationLogId: json.printJobOperationLogId,
      operationLogId: json.operationLogId,
      physicalPrintConfirmed: json.physicalPrintConfirmed === true,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("FULFILLMENT_PRINT_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "FULFILLMENT_PRINT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function voidOfficePrintRecord(input, options = {}) {
  const { authState, printRecordId, operatorId, reason = "信息变更需重打", relatedPrintRecordId = "" } = input;

  try {
    const response = await requestFulfillmentApi(`/print-records/${encodeURIComponent(printRecordId)}/void`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        voidReason: mapPrintVoidReason(reason),
        relatedPrintRecordId,
        operatorId,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "打印记录作废 API 返回错误。"),
      };
    }

    return {
      source: "api",
      printRecord: json.printRecord,
      nextStatus: json.nextStatus,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("PRINT_RECORD_VOID_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "PRINT_RECORD_VOID_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function handoffOfficePaperOutbound(input, options = {}) {
  const { authState, fulfillment, paperOutboundDocument, operatorId, note = "" } = input;
  try {
    const response = await requestFulfillmentApi(`/fulfillments/${encodeURIComponent(fulfillment.id)}/paper-handoff`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        fulfillmentId: fulfillment.id,
        expectedRevision: Number(fulfillment.revision ?? 0),
        paperOutboundDocumentId: paperOutboundDocument.paperOutboundDocumentId ?? paperOutboundDocument.id,
        paperDocumentVersion: Number(paperOutboundDocument.documentVersion ?? 0),
        paperDocumentRevision: Number(paperOutboundDocument.revision ?? 0),
        note,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return { source: "api_error", blocked: true, error: toApiError(json, response.status, "纸单交库房 API 返回错误。") };
    }
    return {
      source: "api",
      fulfillmentId: json.fulfillmentId,
      status: json.status,
      paperOutboundDocument: json.paperOutboundDocument,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    return isOfficeApiServerRequired(options)
      ? buildServerRequiredWriteError("PAPER_OUTBOUND_HANDOFF_API_UNAVAILABLE", error)
      : { source: "local_fallback", error: { code: "PAPER_OUTBOUND_HANDOFF_API_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

export async function recordOfficeWarehouseOutboundExecution(input, options = {}) {
  const {
    authState,
    fulfillment,
    paperOutboundDocument,
    operatorId,
    result,
    actualQty,
    physicalExecutorEmployeeId,
    feedbackChannel,
    executedAt,
    note = "",
  } = input;
  try {
    const response = await requestFulfillmentApi(`/fulfillments/${encodeURIComponent(fulfillment.id)}/warehouse-execution`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        fulfillmentId: fulfillment.id,
        expectedRevision: Number(fulfillment.revision ?? 0),
        paperOutboundDocumentId: paperOutboundDocument.paperOutboundDocumentId ?? paperOutboundDocument.id,
        paperDocumentVersion: Number(paperOutboundDocument.documentVersion ?? 0),
        paperDocumentRevision: Number(paperOutboundDocument.revision ?? 0),
        result,
        actualQty: actualQty === "" || actualQty === undefined ? undefined : Number(actualQty),
        physicalExecutorEmployeeId,
        feedbackChannel,
        executedAt,
        note,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return { source: "api_error", blocked: true, error: toApiError(json, response.status, "库房回录 API 返回错误。") };
    }
    return {
      source: "api",
      fulfillmentId: json.fulfillmentId,
      status: json.status,
      warehouseOutboundExecution: json.warehouseOutboundExecution,
      statementCandidate: json.statementCandidate === true,
      statementId: cleanText(json.statementId),
      todoId: cleanText(json.todoId),
      inventoryDeductionMode: cleanText(json.inventoryDeductionMode),
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    return isOfficeApiServerRequired(options)
      ? buildServerRequiredWriteError("WAREHOUSE_OUTBOUND_EXECUTION_API_UNAVAILABLE", error)
      : { source: "local_fallback", error: { code: "WAREHOUSE_OUTBOUND_EXECUTION_API_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

export async function resolveOfficeFulfillmentQuantityVariance(input, options = {}) {
  const {
    authState,
    fulfillment,
    operatorId,
    resolutionResult,
    reason = "",
    delegatedDecision,
    directDecisionContent,
    expectedRevision = fulfillment?.revision,
    idempotencyKey,
  } = input;
  try {
    const response = await requestFulfillmentApi(
      `/fulfillments/${encodeURIComponent(fulfillment.id)}/quantity-variance-resolution`,
      {
        ...options,
        authState,
        method: "POST",
        operatorId,
        idempotencyKey,
        body: {
          expectedRevision: Number(expectedRevision ?? 0),
          idempotencyKey,
          resolutionResult,
          reason,
          delegatedDecision,
          directDecisionContent,
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) return { source: "api_error", blocked: true, error: toApiError(json, response.status, "数量差异处理失败。") };
    return {
      source: "api",
      fulfillment: json.fulfillment,
      quantityVarianceResolution: json.quantityVarianceResolution,
      businessDecision: json.businessDecision,
      todo: json.todo,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    return isOfficeApiServerRequired(options)
      ? buildServerRequiredWriteError("FULFILLMENT_QUANTITY_VARIANCE_API_UNAVAILABLE", error)
      : { source: "local_fallback", blocked: true, error: { code: "FULFILLMENT_QUANTITY_VARIANCE_API_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

export async function completeOfficeFulfillment(input, options = {}) {
  const {
    authState,
    fulfillment,
    operatorId,
    actualQty = fulfillment?.qty ?? 0,
    expectedRevision = fulfillment?.revision,
    idempotencyKey,
    confirmedFinalDelivery = false,
    remark = "",
  } = input;

  try {
    const response = await requestFulfillmentApi(`/fulfillments/${encodeURIComponent(fulfillment.id)}/complete`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      idempotencyKey,
      body: {
        fulfillmentId: fulfillment.id,
        expectedRevision: Number(expectedRevision ?? 0),
        idempotencyKey,
        confirmedFinalDelivery,
        actualQty: Number(actualQty ?? 0),
        handoverEvidence: [],
        operatorId,
        completedAt: new Date().toISOString(),
        remark,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "出库完成 API 返回错误。"),
      };
    }

    return {
      source: "api",
      fulfillmentId: json.fulfillmentId,
      status: json.status,
      finalDeliveryStatus: json.finalDeliveryStatus,
      finalDeliveryAt: json.finalDeliveryAt,
      statementCandidate: json.statementCandidate,
      statementId: json.statementId,
      inventoryDeductionMode: json.inventoryDeductionMode,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("FULFILLMENT_COMPLETE_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "FULFILLMENT_COMPLETE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function markOfficeFulfillmentPrepared(input, options = {}) {
  const { authState, fulfillment, operatorId, remark = "" } = input;
  try {
    const response = await requestFulfillmentApi(`/fulfillments/${encodeURIComponent(fulfillment.id)}/prepared`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        fulfillmentId: fulfillment.id,
        operatorId,
        preparedAt: new Date().toISOString(),
        remark,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "标记备货 API 返回错误。"),
      };
    }
    return {
      source: "api",
      fulfillmentId: json.fulfillmentId,
      status: json.status,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("FULFILLMENT_PREPARED_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: { code: "FULFILLMENT_PREPARED_API_UNAVAILABLE", message: error?.message ?? String(error) },
      fulfillmentId: fulfillment?.id ?? "",
      status: "已备货",
    };
  }
}

export async function confirmOfficeFulfillmentPickup(input, options = {}) {
  const {
    authState,
    fulfillment,
    operatorId,
    expectedRevision = fulfillment?.revision,
    idempotencyKey,
    confirmedFinalDelivery = false,
    remark = "",
  } = input;

  try {
    const response = await requestFulfillmentApi(`/fulfillments/${encodeURIComponent(fulfillment.id)}/pickup-confirm`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      idempotencyKey,
      body: {
        fulfillmentId: fulfillment.id,
        expectedRevision: Number(expectedRevision ?? 0),
        idempotencyKey,
        confirmedFinalDelivery,
        pickedAt: new Date().toISOString(),
        operatorId,
        pickupBatchNo: `P0-${fulfillment.id}`,
        remark,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "快递/快运拉走确认 API 返回错误。"),
      };
    }

    return {
      source: "api",
      fulfillmentId: json.fulfillmentId,
      status: json.status,
      finalDeliveryStatus: json.finalDeliveryStatus,
      finalDeliveryAt: json.finalDeliveryAt,
      statementCandidate: json.statementCandidate,
      statementId: json.statementId,
      inventoryDeductionMode: json.inventoryDeductionMode,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("FULFILLMENT_PICKUP_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "FULFILLMENT_PICKUP_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function createOfficeFulfillmentException(input, options = {}) {
  const { authState, fulfillment, modalType, actualQty, reason, operatorId, remark = "" } = input;
  const exceptionType = modalType === "unable" ? "unable_to_outbound" : "quantity_mismatch";

  try {
    const response = await requestFulfillmentApi(`/fulfillments/${encodeURIComponent(fulfillment.id)}/exception`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        fulfillmentId: fulfillment.id,
        orderLineId: fulfillment.lineId,
        exceptionType,
        expectedQty: Number(fulfillment.qty ?? 0),
        actualQty: modalType === "unable" ? 0 : Number(actualQty ?? 0),
        reasonCode: mapFulfillmentExceptionReason(reason),
        remark: remark || reason || "",
        attachmentIds: [],
        operatorId,
        occurredAt: new Date().toISOString(),
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "出库异常 API 返回错误。"),
      };
    }

    return {
      source: "api",
      fulfillmentId: json.fulfillmentId,
      status: json.status,
      todoId: json.todoId,
      todoType: json.todoType,
      inventoryHoldStatus: json.inventoryHoldStatus,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("FULFILLMENT_EXCEPTION_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "FULFILLMENT_EXCEPTION_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function updateOfficeFulfillmentDispatch(input, options = {}) {
  const {
    authState,
    fulfillment,
    operatorId,
    driverId,
    routeDate,
    routeNo,
    routeSequence,
    plannedDepartureAt = "",
    remark = "",
  } = input;

  try {
    const response = await requestFulfillmentApi(`/fulfillments/${encodeURIComponent(fulfillment.id)}/dispatch`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        fulfillmentId: fulfillment.id,
        driverId,
        routeDate,
        routeNo,
        routeSequence: Number(routeSequence ?? 0),
        plannedDepartureAt,
        remark,
        operatorId,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "司机派单 API 返回错误。"),
      };
    }

    return {
      source: "api",
      fulfillmentId: json.fulfillmentId,
      dispatch: json.dispatch,
      task: json.task,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("FULFILLMENT_DISPATCH_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "FULFILLMENT_DISPATCH_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function cancelOfficeFulfillment(input, options = {}) {
  const { authState, fulfillment, operatorId, reason = "office_correction", reasonText = "" } = input;

  try {
    const response = await requestFulfillmentApi(`/fulfillments/${encodeURIComponent(fulfillment.id)}/cancel`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        fulfillmentId: fulfillment.id,
        reason,
        reasonText,
        operatorId,
        canceledAt: new Date().toISOString(),
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "取消出库 API 返回错误。"),
      };
    }

    return {
      source: "api",
      fulfillmentId: json.fulfillmentId,
      orderLineId: json.orderLineId,
      status: json.status,
      releasedReservations: json.releasedReservations ?? [],
      inventoryLedgerIds: json.inventoryLedgerIds ?? [],
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("FULFILLMENT_CANCEL_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "FULFILLMENT_CANCEL_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function reviewOfficeDeliveryEvidence(input, options = {}) {
  const {
    authState,
    fulfillment,
    operatorId,
    reviewerName = "",
    reviewStatus,
    reason = "",
    remark = "",
  } = input;

  try {
    const response = await requestFulfillmentApi(
      `/fulfillments/${encodeURIComponent(fulfillment.id)}/delivery-evidence-review`,
      {
        ...options,
        authState,
        method: "POST",
        operatorId,
        body: {
          fulfillmentId: fulfillment.id,
          reviewStatus,
          reason,
          remark,
          operatorId,
          reviewerName,
          reviewedAt: new Date().toISOString(),
        },
      },
    );
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "送达证据复核 API 返回错误。"),
      };
    }

    return {
      source: "api",
      fulfillmentId: json.fulfillmentId,
      reviewStatus: json.reviewStatus,
      reviewedAt: json.reviewedAt,
      reviewedBy: json.reviewedBy,
      reviewedByUserId: json.reviewedByUserId,
      issueReason: json.issueReason,
      todoId: json.todoId,
      todoType: json.todoType,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("DELIVERY_EVIDENCE_REVIEW_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "DELIVERY_EVIDENCE_REVIEW_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

function buildFulfillmentListQuery({ page, pageSize, filters = {} }) {
  const params = new URLSearchParams();
  params.set("page", String(Math.max(1, toNumber(page, 1))));
  params.set("pageSize", String(Math.max(1, Math.min(defaultFulfillmentPageSize, toNumber(pageSize, defaultFulfillmentPageSize)))));
  if (cleanText(filters.method) && cleanText(filters.method) !== "全部") {
    params.set("method", getFulfillmentMethodValue(filters.method, cleanText(filters.method)));
  }
  if (cleanText(filters.status) && cleanText(filters.status) !== "全部") params.set("status", cleanText(filters.status));
  if (cleanText(filters.keyword)) params.set("keyword", cleanText(filters.keyword));
  const query = params.toString();
  return query ? `?${query}` : "";
}

function getFulfillmentTemplateId(fulfillment, action = "") {
  if (fulfillment?.method === "快递快运" && ["打印出库单", "重打出库单"].includes(cleanText(action))) return "tpl-p0-pickup-note";
  if (fulfillment?.method === "快递快运") return "tpl-p0-express-ltl-label";
  if (fulfillment?.method === "送货") return "tpl-p0-delivery-note";
  return "tpl-p0-pickup-note";
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
