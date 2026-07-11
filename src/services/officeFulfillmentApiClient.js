import { isOfficeApiServerRequired } from "./officeAuthService.js";
import { requestOfficeApi as requestFulfillmentApi } from "./officeApiClientCore.js";
import { getFulfillmentMethodLabel, getFulfillmentMethodValue } from "../shared/labels.js";

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

export async function printOfficeFulfillment(input, options = {}) {
  const { authState, fulfillment, action = "打印预览", operatorId, printAction } = input;
  const resolvedPrintAction = printAction ?? getFulfillmentPrintAction(action, fulfillment);
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
        templateId: getFulfillmentTemplateId(fulfillment),
        documentType: getFulfillmentDocumentType(fulfillment),
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

export async function completeOfficeFulfillment(input, options = {}) {
  const { authState, fulfillment, operatorId, actualQty = fulfillment?.qty ?? 0, remark = "" } = input;

  try {
    const response = await requestFulfillmentApi(`/fulfillments/${encodeURIComponent(fulfillment.id)}/complete`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        fulfillmentId: fulfillment.id,
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
      statementCandidate: json.statementCandidate,
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
  const { authState, fulfillment, operatorId, remark = "" } = input;

  try {
    const response = await requestFulfillmentApi(`/fulfillments/${encodeURIComponent(fulfillment.id)}/pickup-confirm`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        fulfillmentId: fulfillment.id,
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
      statementCandidate: json.statementCandidate,
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

export function mapFulfillmentExceptionReason(reason) {
  return exceptionReasonCodeByLabel[reason] ?? "other";
}

export function mapPrintVoidReason(reason) {
  return printVoidReasonCodeByLabel[reason] ?? "other";
}

export function getFulfillmentDocumentType(fulfillment) {
  if (fulfillment?.method === "快递快运") return "express_ltl_label";
  if (fulfillment?.method === "送货") return "delivery_note";
  if (fulfillment?.method === "自提") return "pickup_note";
  return "outbound_note";
}

export function getFulfillmentPrintAction(action, fulfillment) {
  if (action === "打印预览") return "preview";
  if (String(action ?? "").includes("重打")) return "reprint";
  if (fulfillment?.printed) return "reprint";
  return "first_print";
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
    printRecordStatus: cleanText(value.printRecordStatus ?? value.print_record_status),
    activePrintRecordId: cleanText(value.activePrintRecordId ?? value.active_print_record_id),
    printRecordId: cleanText(value.printRecordId ?? value.print_record_id),
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

function getFulfillmentTemplateId(fulfillment) {
  if (fulfillment?.method === "快递快运") return "tpl-p0-express-ltl-label";
  if (fulfillment?.method === "送货") return "tpl-p0-delivery-note";
  return "tpl-p0-pickup-note";
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toApiError(json, status, fallbackMessage) {
  return {
    code: json?.code ?? `HTTP_${status}`,
    message: json?.message ?? fallbackMessage,
    requiredPermission: json?.requiredPermission,
  };
}

function buildServerRequiredWriteError(code, error) {
  return {
    source: "api_error",
    blocked: true,
    error: {
      code,
      message: `生产模式要求后端事务，未执行本地降级：${error?.message ?? String(error)}`,
    },
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
