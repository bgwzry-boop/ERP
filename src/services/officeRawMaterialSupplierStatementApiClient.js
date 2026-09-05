import {
  readOfficeApiJson as readJson,
  requestOfficeApi as requestRawMaterialApi,
} from "./officeApiClientCore.js";
import { cleanText, toNumber, toRawMaterialApiError } from "./officeRawMaterialApiSupport.js";

export async function listOfficeRawMaterialSupplierStatementReviews(input = {}, options = {}) {
  const { authState, operatorId, page = 1, pageSize = 20, filters = {} } = input;

  try {
    const response = await requestRawMaterialApi(
      `/raw-material-supplier-statement-reviews${buildSupplierStatementReviewQuery({ page, pageSize, filters })}`,
      {
        ...options,
        authState,
        operatorId,
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        items: [],
        page,
        pageSize,
        total: 0,
        metrics: {},
        error: toRawMaterialApiError(json, response.status, "供应商月结复核草稿 API 返回错误。"),
      };
    }
    const items = Array.isArray(json?.items) ? json.items.map(normalizeSupplierStatementReview).filter((item) => item.reviewId) : [];
    return {
      source: "api",
      items,
      page: toNumber(json?.page, page),
      pageSize: toNumber(json?.pageSize, pageSize),
      total: toNumber(json?.total, items.length),
      metrics: json?.metrics ?? {},
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      items: [],
      page,
      pageSize,
      total: 0,
      metrics: {},
      error: {
        code: "RAW_MATERIAL_SUPPLIER_STATEMENT_REVIEW_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function createOfficeRawMaterialSupplierStatementReviewDraft(input = {}, options = {}) {
  const { authState, operatorId, statementResult, supplierName, fileName, note } = input;
  if (!statementResult || typeof statementResult !== "object") {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_STATEMENT_REVIEW_INVALID",
        message: "缺少供应商月结预检结果。",
      },
    };
  }

  try {
    const response = await requestRawMaterialApi("/raw-material-supplier-statement-reviews", {
      ...options,
      authState,
      operatorId,
      method: "POST",
      body: {
        operatorId,
        supplierName,
        fileName,
        note,
        statementResult,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toRawMaterialApiError(json, response.status, "保存供应商月结复核草稿失败。"),
      };
    }
    return {
      source: "api",
      review: normalizeSupplierStatementReview(json?.review),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_STATEMENT_REVIEW_CREATE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function confirmOfficeRawMaterialSupplierStatementReview(input = {}, options = {}) {
  const { authState, operatorId, reviewId, decision, adjustments, note } = input;
  const safeReviewId = cleanText(reviewId);
  if (!safeReviewId) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_STATEMENT_REVIEW_ID_REQUIRED",
        message: "缺少供应商月结复核草稿号。",
      },
    };
  }
  try {
    const response = await requestRawMaterialApi(
      `/raw-material-supplier-statement-reviews/${encodeURIComponent(safeReviewId)}/confirm-review`,
      {
        ...options,
        authState,
        operatorId,
        method: "POST",
        body: {
          operatorId,
          decision,
          adjustments,
          note,
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toRawMaterialApiError(json, response.status, "确认供应商月结复核草稿失败。"),
      };
    }
    return {
      source: "api",
      review: normalizeSupplierStatementReview(json?.review),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_STATEMENT_REVIEW_CONFIRM_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function confirmOfficeRawMaterialSupplierStatement(input = {}, options = {}) {
  const { authState, operatorId, reviewId, note } = input;
  const safeReviewId = cleanText(reviewId);
  if (!safeReviewId) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_STATEMENT_ID_REQUIRED",
        message: "缺少供应商月结复核草稿号。",
      },
    };
  }
  try {
    const response = await requestRawMaterialApi(
      `/raw-material-supplier-statement-reviews/${encodeURIComponent(safeReviewId)}/confirm-statement`,
      {
        ...options,
        authState,
        operatorId,
        method: "POST",
        body: {
          operatorId,
          note,
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toRawMaterialApiError(json, response.status, "确认供应商月结对账失败。"),
      };
    }
    return {
      source: "api",
      review: normalizeSupplierStatementReview(json?.review),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_STATEMENT_CONFIRM_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function generateOfficeRawMaterialSupplierPayableDraft(input = {}, options = {}) {
  const { authState, operatorId, reviewId, note } = input;
  const safeReviewId = cleanText(reviewId);
  if (!safeReviewId) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_PAYABLE_REVIEW_ID_REQUIRED",
        message: "缺少供应商月结复核草稿号。",
      },
    };
  }
  try {
    const response = await requestRawMaterialApi(
      `/raw-material-supplier-statement-reviews/${encodeURIComponent(safeReviewId)}/generate-payable`,
      {
        ...options,
        authState,
        operatorId,
        method: "POST",
        body: {
          operatorId,
          note,
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toRawMaterialApiError(json, response.status, "生成供应商应付草稿失败。"),
      };
    }
    return {
      source: "api",
      review: normalizeSupplierStatementReview(json?.review),
      payableDraft: normalizeSupplierPayableDraft(json?.payableDraft ?? json?.review?.supplierPayableDraft),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_PAYABLE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function confirmOfficeRawMaterialSupplierPayment(input = {}, options = {}) {
  const { authState, operatorId, reviewId, paidAmount, paymentMethod, paymentAccount, paymentReferenceNo, paymentVoucherNo, paidAt, note } = input;
  const safeReviewId = cleanText(reviewId);
  if (!safeReviewId) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_PAYMENT_REVIEW_ID_REQUIRED",
        message: "缺少供应商月结复核草稿号。",
      },
    };
  }
  try {
    const response = await requestRawMaterialApi(
      `/raw-material-supplier-statement-reviews/${encodeURIComponent(safeReviewId)}/confirm-payment`,
      {
        ...options,
        authState,
        operatorId,
        method: "POST",
        body: {
          operatorId,
          paidAmount,
          paymentMethod,
          paymentAccount,
          paymentReferenceNo,
          paymentVoucherNo,
          paidAt,
          note,
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toRawMaterialApiError(json, response.status, "确认供应商付款失败。"),
      };
    }
    return {
      source: "api",
      review: normalizeSupplierStatementReview(json?.review),
      paymentRecord: normalizeSupplierPaymentRecord(json?.paymentRecord ?? json?.review?.supplierPaymentRecord),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_PAYMENT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

function buildSupplierStatementReviewQuery({ page, pageSize, filters = {} }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (filters.keyword) params.set("keyword", cleanText(filters.keyword));
  if (filters.status && filters.status !== "全部") params.set("status", cleanText(filters.status));
  if (filters.reviewStatus && filters.reviewStatus !== "全部") params.set("reviewStatus", cleanText(filters.reviewStatus));
  if (filters.supplierName) params.set("supplierName", cleanText(filters.supplierName));
  const query = params.toString();
  return query ? `?${query}` : "";
}

function normalizeSupplierStatementReview(input = {}) {
  const item = { ...(input ?? {}) };
  item.reviewId = cleanText(item.reviewId ?? item.id);
  item.id = item.reviewId;
  item.supplierName = cleanText(item.supplierName);
  item.fileName = cleanText(item.fileName);
  item.status = cleanText(item.status);
  item.reviewStatus = cleanText(item.reviewStatus);
  item.summaryText = cleanText(item.summaryText);
  item.summary = item.summary && typeof item.summary === "object" ? item.summary : {};
  item.adapter = item.adapter && typeof item.adapter === "object" ? item.adapter : {};
  item.rows = Array.isArray(item.rows) ? item.rows : [];
  item.adjustments = Array.isArray(item.adjustments) ? item.adjustments : [];
  item.issues = Array.isArray(item.issues) ? item.issues : [];
  item.matchedInboundIds = Array.isArray(item.matchedInboundIds) ? item.matchedInboundIds : [];
  item.statementStatus = cleanText(item.statementStatus);
  item.statementConfirmationId = cleanText(item.statementConfirmationId);
  item.statementConfirmedAt = cleanText(item.statementConfirmedAt);
  item.statementConfirmedBy = cleanText(item.statementConfirmedBy);
  item.paymentStatus = cleanText(item.paymentStatus);
  item.supplierPayableId = cleanText(item.supplierPayableId);
  item.payableStatus = cleanText(item.payableStatus);
  item.supplierPayableDraft = normalizeSupplierPayableDraft(item.supplierPayableDraft);
  item.supplierPayableGeneratedAt = cleanText(item.supplierPayableGeneratedAt);
  item.supplierPayableGeneratedBy = cleanText(item.supplierPayableGeneratedBy);
  item.supplierPaymentConfirmationId = cleanText(item.supplierPaymentConfirmationId);
  item.supplierPaymentRecord = normalizeSupplierPaymentRecord(item.supplierPaymentRecord);
  item.supplierPaymentConfirmedAt = cleanText(item.supplierPaymentConfirmedAt);
  item.supplierPaymentConfirmedBy = cleanText(item.supplierPaymentConfirmedBy);
  return item;
}

function normalizeSupplierPayableDraft(input = {}) {
  if (!input || typeof input !== "object") return null;
  const supplierPayableId = cleanText(input.supplierPayableId ?? input.payableId);
  if (!supplierPayableId) return null;
  return {
    ...input,
    supplierPayableId,
    payableId: supplierPayableId,
    status: cleanText(input.status),
    currency: cleanText(input.currency) || "CNY",
    lineSubtotal: toNumber(input.lineSubtotal, 0),
    currentAdjustmentSubtotal: toNumber(input.currentAdjustmentSubtotal, 0),
    payableAmount: toNumber(input.payableAmount, 0),
    currentAdjustments: Array.isArray(input.currentAdjustments) ? input.currentAdjustments : [],
    referenceAdjustments: Array.isArray(input.referenceAdjustments) ? input.referenceAdjustments : [],
    nextStep: cleanText(input.nextStep),
    generatedAt: cleanText(input.generatedAt),
    generatedBy: cleanText(input.generatedBy),
    note: cleanText(input.note),
  };
}
function normalizeSupplierPaymentRecord(input = {}) {
  if (!input || typeof input !== "object") return null;
  const supplierPaymentConfirmationId = cleanText(input.supplierPaymentConfirmationId ?? input.paymentConfirmationId);
  if (!supplierPaymentConfirmationId) return null;
  return {
    ...input,
    supplierPaymentConfirmationId,
    paymentConfirmationId: supplierPaymentConfirmationId,
    supplierPayableId: cleanText(input.supplierPayableId),
    status: cleanText(input.status) || "已确认付款",
    currency: cleanText(input.currency) || "CNY",
    paidAmount: toNumber(input.paidAmount ?? input.amount, 0),
    paymentMethod: cleanText(input.paymentMethod),
    paymentAccount: cleanText(input.paymentAccount),
    paymentReferenceNo: cleanText(input.paymentReferenceNo),
    paymentVoucherNo: cleanText(input.paymentVoucherNo),
    paidAt: cleanText(input.paidAt),
    confirmedAt: cleanText(input.confirmedAt),
    confirmedBy: cleanText(input.confirmedBy),
    note: cleanText(input.note),
  };
}
