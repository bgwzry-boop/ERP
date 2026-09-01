import { isOfficeApiServerRequired } from "./officeAuthService.js";
import {
  buildOfficeServerRequiredWriteError as buildServerRequiredWriteError,
  readOfficeApiJson as readJson,
  requestOfficeApi as requestStatementApi,
  toOfficeApiError as toApiError,
} from "./officeApiClientCore.js";
import {
  buildStatementExcelWorkbook as buildStatementExcelWorkbookFromTemplate,
  getStatementExcelTemplateId,
} from "../domain/statementExcelTemplate.js";

export { buildStatementExcelWorkbookFromTemplate as buildStatementExcelWorkbook };

const varianceHandlingCodeByLabel = {
  未收差额转欠款: "carry_to_debt",
  "抹零/减免已审批": "approved_allowance",
  账单有误待重算: "bill_needs_recalc",
  多笔付款待齐: "waiting_more_payments",
  其他: "other",
};

export async function listOfficeStatementCustomers(input = {}, options = {}) {
  const { authState, operatorId, filters = {}, page = 1, pageSize = 200, localStatements = [] } = input;
  try {
    const response = await requestStatementApi(
      `/statements/customers${buildStatementCustomerQuery({ filters, page, pageSize })}`,
      { ...options, authState, method: "GET", operatorId },
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
        error: toApiError(json, response.status, "客户对账列表 API 返回错误。"),
      };
    }
    const items = (Array.isArray(json?.items) ? json.items : []).map(normalizeStatementCustomerSummary).filter(Boolean);
    return {
      source: "api",
      items,
      page: Number(json?.page ?? page),
      pageSize: Number(json?.pageSize ?? pageSize),
      total: Number(json?.total ?? items.length),
    };
  } catch (error) {
    const items = (Array.isArray(localStatements) ? localStatements : []).map(mapLocalStatementCustomerSummary).filter(Boolean);
    return {
      source: "local_fallback",
      items,
      page,
      pageSize,
      total: items.length,
      error: { code: "STATEMENT_CUSTOMER_LIST_API_UNAVAILABLE", message: error?.message ?? String(error) },
    };
  }
}

export async function getOfficeStatementDetail(input = {}, options = {}) {
  const { authState, operatorId, statementId, localStatement = null } = input;
  const safeStatementId = String(statementId ?? "").trim();
  if (!safeStatementId) {
    return {
      source: "api_error",
      blocked: true,
      detail: null,
      error: { code: "STATEMENT_ID_REQUIRED", message: "对账单 ID 不能为空。" },
    };
  }
  try {
    const response = await requestStatementApi(`/statements/${encodeURIComponent(safeStatementId)}`, {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        detail: null,
        error: toApiError(json, response.status, "对账单详情 API 返回错误。"),
      };
    }
    return { source: "api", detail: normalizeStatementDetail(json, localStatement) };
  } catch (error) {
    return {
      source: "local_fallback",
      detail: localStatement ? normalizeStatementDetail(localStatement, localStatement) : null,
      error: { code: "STATEMENT_DETAIL_API_UNAVAILABLE", message: error?.message ?? String(error) },
    };
  }
}

export async function markOfficeStatementSentViaApi(input, options = {}) {
  const { authState, statement, operatorId, channel = "wechat", sentTo = "", remark = "" } = input;

  try {
    const response = await requestStatementApi(`/statements/${encodeURIComponent(statement.id)}/mark-sent`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        expectedRevision: Number(statement.revision ?? 0),
        channel,
        sentTo,
        sentAt: new Date().toISOString(),
        operatorId,
        remark,
        attachmentIds: [],
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "对账发送 API 返回错误。"),
      };
    }

    return {
      source: "api",
      statementId: json.statementId,
      status: json.status,
      sendRecordId: json.sendRecordId,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("STATEMENT_MARK_SENT_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "STATEMENT_MARK_SENT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function recordOfficeStatementSendReceipt(input, options = {}) {
  const {
    authState,
    statement,
    operatorId,
    sendRecordId = statement?.sendRecordId ?? "",
    receiptStatus = "read",
    remark = "",
  } = input;

  try {
    const response = await requestStatementApi(`/statements/${encodeURIComponent(statement.id)}/send-receipt`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        expectedRevision: Number(statement.sendRecordRevision ?? statement.latestSendRecord?.revision ?? statement.revision ?? 0),
        sendRecordId,
        receiptStatus,
        receiptAt: new Date().toISOString(),
        operatorId,
        remark,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "对账发送回执 API 返回错误。"),
      };
    }

    return {
      source: "api",
      statementId: json.statementId,
      status: json.status,
      sendRecordId: json.sendRecordId,
      receiptStatus: json.receiptStatus,
      receiptAt: json.receiptAt,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("STATEMENT_SEND_RECEIPT_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "STATEMENT_SEND_RECEIPT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function recordOfficeStatementCustomerConfirmation(input, options = {}) {
  const {
    authState,
    statement,
    operatorId,
    sendRecordId = statement?.sendRecordId ?? "",
    confirmationType = "customer_reply",
    channel = statement?.sendChannel ?? "wechat",
    confirmedByCustomer = statement?.sendRecipient ?? "",
    content = "客户回复确认无误",
    attachmentIds = [],
    remark = "",
  } = input;

  try {
    const response = await requestStatementApi(`/statements/${encodeURIComponent(statement.id)}/customer-confirmation`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        expectedRevision: Number(statement.revision ?? 0),
        sendRecordId,
        confirmationType,
        channel,
        confirmedByCustomer,
        confirmedAt: new Date().toISOString(),
        content,
        attachmentIds,
        operatorId,
        remark,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "登记客户确认 API 返回错误。"),
      };
    }

    return {
      source: "api",
      statementId: json.statementId,
      status: json.status,
      sendRecordId: json.sendRecordId,
      receiptStatus: json.receiptStatus,
      confirmationRecord: json.confirmationRecord ?? null,
      confirmationRecordId: json.confirmationRecordId ?? json.confirmationRecord?.confirmationRecordId ?? "",
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("STATEMENT_CUSTOMER_CONFIRMATION_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "STATEMENT_CUSTOMER_CONFIRMATION_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function recordOfficeStatementPayment(input, options = {}) {
  const { authState, statement, amount, reason = "", operatorId, method = "other", attachmentIds = [] } = input;

  try {
    const response = await requestStatementApi(`/statements/${encodeURIComponent(statement.id)}/payments`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        expectedRevision: Number(statement.revision ?? 0),
        amount: Number(amount ?? 0),
        paidAt: new Date().toISOString(),
        method,
        operatorId,
        attachmentIds,
        remark: reason,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "登记实收 API 返回错误。"),
      };
    }

    return {
      source: "api",
      payment: json.payment,
      statementStatus: json.statementStatus,
      statementRevision: Number(json.statementRevision ?? 0),
      varianceAmount: json.varianceAmount,
      todoId: json.todoId,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("STATEMENT_PAYMENT_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "STATEMENT_PAYMENT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function handleOfficeStatementVariance(input, options = {}) {
  const {
    authState,
    statement,
    varianceAmount,
    reason,
    handlingResult,
    operatorId,
    paymentRecordId = "",
    delegatedDecision,
    directDecisionContent,
    expectedRevision = statement?.revision,
    idempotencyKey,
  } = input;

  try {
    const response = await requestStatementApi(`/statements/${encodeURIComponent(statement.id)}/variance`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      idempotencyKey,
      body: {
        statementId: statement.id,
        expectedRevision: Number(expectedRevision ?? 0),
        idempotencyKey,
        delegatedDecision,
        directDecisionContent,
        paymentRecordId: paymentRecordId || undefined,
        varianceAmount: Number(varianceAmount ?? 0),
        handlingResult: handlingResult || mapStatementVarianceHandlingResult(reason),
        reason,
        customerConfirmed: reason === "未收差额转欠款",
        attachmentIds: [],
        operatorId,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "差额处理 API 返回错误。"),
      };
    }

    return {
      source: "api",
      varianceRecord: json.varianceRecord,
      statementStatus: json.statementStatus,
      statementRevision: Number(json.statementRevision ?? 0),
      debtAmount: json.debtAmount,
      todoId: json.todoId,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("STATEMENT_VARIANCE_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "STATEMENT_VARIANCE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function writeOffOfficeStatement(input, options = {}) {
  const {
    authState,
    statement,
    operatorId,
    confirmReason = "确认核销",
    delegatedDecision,
    directDecisionContent,
    expectedRevision = statement?.revision,
    idempotencyKey,
  } = input;

  try {
    const response = await requestStatementApi(`/statements/${encodeURIComponent(statement.id)}/write-off`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      idempotencyKey,
      body: {
        expectedRevision: Number(expectedRevision ?? 0),
        idempotencyKey,
        delegatedDecision,
        directDecisionContent,
        confirmReason,
        operatorId,
        confirmedAt: new Date().toISOString(),
        paymentRecordIds: [],
        attachmentIds: [],
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "确认核销 API 返回错误。"),
      };
    }

    return {
      source: "api",
      statementId: json.statementId,
      status: json.status,
      statementRevision: Number(json.statementRevision ?? 0),
      receivable: json.receivable,
      received: json.received,
      variance: json.variance,
      debtAmount: json.debtAmount,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("STATEMENT_WRITE_OFF_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "STATEMENT_WRITE_OFF_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function previewOfficeStatement(input, options = {}) {
  const {
    authState,
    statement,
    orderLines = [],
    customer = null,
    operatorId,
    previewType = "customer_send",
  } = input;

  try {
    const response = await requestStatementApi(`/statements/${encodeURIComponent(statement.id)}/preview`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        templateId: getStatementTemplateId(previewType),
        previewType,
        operatorId,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "对账预览 API 返回错误。"),
      };
    }

    const preview = mapStatementPreview(json, { statement, orderLines, previewType });
    return {
      source: "api",
      ...preview,
      preview,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("STATEMENT_PREVIEW_API_UNAVAILABLE", error);
    }
    const preview = createLocalStatementPreview({ statement, orderLines, customer, previewType });
    return {
      source: "local_fallback",
      preview,
      error: {
        code: "STATEMENT_PREVIEW_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function downloadOfficeStatementExport(input, options = {}) {
  const { authState, statement, preview, exportRecord, operatorId } = input;
  const allowLocalFallback = input.allowLocalFallback !== false;
  const downloadToken = preview?.downloadToken ?? exportRecord?.downloadToken ?? input.downloadToken ?? "";
  if (!downloadToken) {
    return {
      source: allowLocalFallback ? "local_fallback" : "api_error",
      blocked: !allowLocalFallback,
      error: {
        code: "STATEMENT_EXPORT_TOKEN_MISSING",
        message: allowLocalFallback ? "对账导出令牌不存在，使用本地 Excel 模板生成。" : "对账导出令牌不存在，无法下载历史文件。",
      },
    };
  }

  try {
    const response = await requestStatementApi(
      `/statements/${encodeURIComponent(statement.id)}/exports/${encodeURIComponent(downloadToken)}`,
      {
        ...options,
        authState,
        method: "GET",
        operatorId,
      },
    );

    if (!response.ok) {
      const json = await readJson(response);
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "对账导出文件 API 返回错误。"),
      };
    }

    return {
      source: "api",
      workbookData: await readResponseWorkbookData(response),
      fileName: getFileNameFromContentDisposition(getResponseHeader(response, "content-disposition")),
      contentType:
        getResponseHeader(response, "content-type") ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  } catch (error) {
    if (!allowLocalFallback) {
      return {
        source: "api_unavailable",
        error: {
          code: "STATEMENT_EXPORT_API_UNAVAILABLE",
          message: error?.message ?? String(error),
        },
      };
    }
    return {
      source: "local_fallback",
      error: {
        code: "STATEMENT_EXPORT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function listOfficeStatementExports(input, options = {}) {
  const { authState, statement, operatorId } = input;

  try {
    const response = await requestStatementApi(`/statements/${encodeURIComponent(statement.id)}/exports`, {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "对账导出记录 API 返回错误。"),
      };
    }

    const items = mapStatementExportRecords(json?.items);
    return {
      source: "api",
      items,
      total: Number(json?.total ?? items.length),
    };
  } catch (error) {
    const items = mapLocalStatementExportRecords(statement);
    return {
      source: "local_fallback",
      items,
      total: items.length,
      error: {
        code: "STATEMENT_EXPORT_LIST_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export function mapStatementVarianceHandlingResult(reason) {
  return varianceHandlingCodeByLabel[reason] ?? "other";
}

export function getStatementTemplateId(previewType = "customer_send") {
  return getStatementExcelTemplateId(previewType);
}

export function buildStatementPreviewCsv(preview, context = {}) {
  const statement = context.statement ?? {};
  const customer = context.customer ?? {};
  const summary = preview?.summary ?? {};
  const previewTypeLabel = preview?.previewType === "internal_archive" ? "内部留档版" : "客户发送版";
  const rows = [
    ["对账单", preview?.statementId ?? statement.id ?? ""],
    ["客户", customer.name ?? customer.customerName ?? ""],
    ["账期", statement.period ?? ""],
    ["类型", previewTypeLabel],
    [],
    ["订单号", "明细ID", "产品", "货品摘要", "计费数量", "原金额", "调整", "应收"],
    ...(preview?.lines ?? []).map((line) => [
      line.orderNo ?? "",
      line.orderLineId ?? line.statementLineId ?? "",
      line.productName ?? "",
      line.goodsSpec ?? "",
      line.billQty ?? 0,
      line.amount ?? 0,
      line.adjustmentAmount ?? 0,
      line.finalAmount ?? line.amount ?? 0,
    ]),
    [],
    ["合计", "", "", "", summary.lineCount ?? preview?.lines?.length ?? 0, summary.receivable ?? 0, "", summary.receivable ?? 0],
    ["已登记实收", summary.received ?? 0],
    ["差额/欠款", summary.variance ?? 0],
  ];
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}`;
}

function mapStatementPreview(json, context = {}) {
  const statement = context.statement ?? {};
  const fallback = createLocalStatementPreview(context);
  return {
    statementId: json?.statementId ?? statement.id,
    previewType: json?.previewType ?? context.previewType ?? "customer_send",
    templateId: json?.templateId ?? getStatementTemplateId(json?.previewType ?? context.previewType ?? "customer_send"),
    templateVersion: json?.templateVersion ?? "",
    summary: {
      receivable: Number(json?.summary?.receivable ?? statement.receivable ?? 0),
      received: Number(json?.summary?.received ?? statement.received ?? 0),
      variance: Number(json?.summary?.variance ?? statement.variance ?? 0),
      lineCount: Number(json?.summary?.lineCount ?? json?.lines?.length ?? fallback.lines.length),
    },
    lines: Array.isArray(json?.lines) && json.lines.length ? json.lines.map(mapStatementPreviewLine) : fallback.lines,
    downloadToken: json?.downloadToken ?? "",
    operationLogId: json?.operationLogId ?? "",
  };
}

function buildStatementCustomerQuery({ filters = {}, page = 1, pageSize = 200 } = {}) {
  const params = new URLSearchParams();
  const keyword = String(filters.keyword ?? "").trim();
  const status = String(filters.status ?? "").trim();
  const period = String(filters.period ?? "").trim();
  if (keyword) params.set("keyword", keyword);
  if (status) params.set("status", status);
  if (period) params.set("period", period);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return `?${params.toString()}`;
}

function normalizeStatementCustomerSummary(item) {
  if (!item || typeof item !== "object") return null;
  const statementId = String(item.statementId ?? item.statement_id ?? "").trim();
  if (!statementId) return null;
  return {
    customerId: String(item.customerId ?? item.customer_id ?? "").trim(),
    customerName: String(item.customerName ?? item.customer_name ?? "").trim(),
    settlementCycle: String(item.settlementCycle ?? item.settlement_cycle ?? "").trim(),
    currentReceivable: Number(item.currentReceivable ?? item.current_receivable ?? 0),
    debtAmount: Number(item.debtAmount ?? item.debt_amount ?? 0),
    overdueAmount: Number(item.overdueAmount ?? item.overdue_amount ?? 0),
    paymentPending: item.paymentPending === true || item.payment_pending === true,
    lastStatementAt: String(item.lastStatementAt ?? item.last_statement_at ?? "").trim(),
    status: String(item.status ?? "current_period").trim(),
    statementId,
    revision: Math.max(1, Number(item.revision ?? 1) || 1),
  };
}

function mapLocalStatementCustomerSummary(statement) {
  if (!statement?.id) return null;
  return normalizeStatementCustomerSummary({
    customerId: statement.customerId,
    customerName: statement.customerName,
    settlementCycle: statement.settlementCycle,
    currentReceivable: statement.receivable,
    debtAmount: statement.variance ?? statement.debtAmount ?? 0,
    paymentPending: String(statement.status ?? "").includes("收款"),
    lastStatementAt: statement.lastStatementAt,
    status: mapLocalStatementStatus(statement.status),
    statementId: statement.id,
    revision: statement.revision,
  });
}

function mapLocalStatementStatus(status) {
  const value = String(status ?? "");
  if (value.includes("欠款") || value.includes("差额")) return "debt_or_variance";
  if (value.includes("收款")) return "payment_pending";
  if (value.includes("结清") || value.includes("核销")) return "settled";
  return "current_period";
}

function mapStatementSummaryStatus(status) {
  const labels = {
    current_period: "待生成",
    debt_or_variance: "有欠款",
    payment_pending: "收款待确认",
    settled: "已结清",
  };
  return labels[status] ?? status ?? "待生成";
}

export function mapStatementCustomerSummaryToLocal(item, localStatement = null) {
  const summary = normalizeStatementCustomerSummary(item);
  if (!summary) return null;
  return {
    ...(localStatement ?? {}),
    id: summary.statementId,
    customerId: summary.customerId,
    customerName: summary.customerName,
    settlementCycle: summary.settlementCycle,
    status: mapStatementSummaryStatus(summary.status),
    receivable: summary.currentReceivable,
    variance: summary.debtAmount,
    debtAmount: summary.debtAmount,
    paymentPending: summary.paymentPending,
    lastStatementAt: summary.lastStatementAt,
    lineIds: Array.isArray(localStatement?.lineIds) ? localStatement.lineIds : [],
    readSummaryStatus: summary.status,
    revision: summary.revision,
  };
}

export function normalizeStatementDetail(value, localStatement = null) {
  const wrapper = value && typeof value === "object" ? value : {};
  const source = wrapper.statement && typeof wrapper.statement === "object" ? wrapper.statement : wrapper;
  const id = String(source.id ?? source.statementId ?? source.statement_id ?? localStatement?.id ?? "").trim();
  if (!id) return null;
  const lines = Array.isArray(wrapper.lines) ? wrapper.lines : [];
  const lineIds = Array.isArray(source.lineIds)
    ? source.lineIds
    : Array.isArray(source.line_ids)
      ? source.line_ids
      : lines.map((line) => String(line.orderLineId ?? line.order_line_id ?? "").trim()).filter(Boolean);
  return {
    ...(localStatement ?? {}),
    ...source,
    id,
    customerId: String(source.customerId ?? source.customer_id ?? localStatement?.customerId ?? "").trim(),
    status: String(source.status ?? localStatement?.status ?? "待生成").trim(),
    period: String(source.period ?? localStatement?.period ?? "").trim(),
    receivable: Number(source.receivable ?? localStatement?.receivable ?? 0),
    received: Number(source.received ?? localStatement?.received ?? 0),
    variance: Number(source.variance ?? localStatement?.variance ?? 0),
    lineIds,
    statementLines: lines.length ? lines : localStatement?.statementLines ?? [],
    payments: Array.isArray(wrapper.payments) ? wrapper.payments : localStatement?.payments ?? [],
    varianceRecords: Array.isArray(wrapper.varianceRecords)
      ? wrapper.varianceRecords
      : localStatement?.varianceRecords ?? [],
    operationLogs: Array.isArray(wrapper.operationLogs) ? wrapper.operationLogs : localStatement?.operationLogs ?? [],
  };
}

function mapStatementPreviewLine(line) {
  return {
    statementLineId: line.statementLineId ?? line.orderLineId ?? "",
    orderLineId: line.orderLineId ?? line.statementLineId ?? "",
    orderNo: line.orderNo ?? "",
    productName: line.productName ?? "",
    goodsSpec: line.goodsSpec ?? "",
    billQty: Number(line.billQty ?? line.chargeableQty ?? line.chargeable_qty ?? 0),
    deliveredQty: Number(line.deliveredQty ?? line.billQty ?? 0),
    freeQty: Number(line.freeQty ?? 0),
    unitPrice: Number(line.unitPrice ?? 0),
    amount: Number(line.amount ?? 0),
    adjustmentAmount: Number(line.adjustmentAmount ?? 0),
    finalAmount: Number(line.finalAmount ?? line.amount ?? 0),
    remark: line.remark ?? "",
  };
}

function mapStatementExportRecords(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    statementId: item.statementId ?? "",
    previewType: item.previewType ?? "internal_archive",
    downloadToken: item.downloadToken ?? "",
    operationLogId: item.operationLogId ?? "",
    fileName: item.fileName ?? "",
    contentType: item.contentType ?? "",
    createdAt: item.createdAt ?? "",
    source: item.source ?? "后端 API 文件",
    templateId: item.templateId ?? "",
    templateVersion: item.templateVersion ?? "",
    workbookFormat: item.workbookFormat ?? "",
    worksheetNames: Array.isArray(item.worksheetNames) ? item.worksheetNames : [],
    storageProvider: item.storageProvider ?? "",
    storageKeyStored: Boolean(item.storageKeyStored),
    contentDigest: item.contentDigest ?? "",
    contentLength: Number(item.contentLength ?? 0),
  }));
}

async function readResponseWorkbookData(response) {
  if (typeof response.arrayBuffer === "function") {
    return new Uint8Array(await response.arrayBuffer());
  }
  return response.text();
}

function mapLocalStatementExportRecords(statement) {
  if (Array.isArray(statement?.exportRecords) && statement.exportRecords.length) {
    return mapStatementExportRecords(statement.exportRecords);
  }
  if (!statement?.lastExportFileName) return [];
  return mapStatementExportRecords([
    {
      statementId: statement.id,
      previewType: statement.lastExportType ?? "internal_archive",
      downloadToken: statement.lastExportToken ?? "",
      fileName: statement.lastExportFileName,
      createdAt: statement.lastExportAt ?? "",
      source: statement.lastExportSource ?? "本地记录",
    },
  ]);
}

function createLocalStatementPreview({ statement, orderLines = [], previewType = "customer_send" }) {
  const lines = (statement?.lineIds ?? []).map((lineId, index) => {
    const line = orderLines.find((item) => item.id === lineId);
    return mapLocalStatementLine(statement, lineId, line, index);
  });
  return {
    statementId: statement?.id ?? "",
    previewType,
    summary: {
      receivable: Number(statement?.receivable ?? 0),
      received: Number(statement?.received ?? 0),
      variance: Number(statement?.variance ?? Math.max(0, Number(statement?.receivable ?? 0) - Number(statement?.received ?? 0))),
      lineCount: lines.length,
    },
    lines,
    downloadToken: "",
    operationLogId: "",
  };
}

function mapLocalStatementLine(statement, lineId, line, index) {
  const amount = Number(line?.amount ?? 0);
  const qty = Number(line?.qty ?? 0);
  return {
    statementLineId: `${statement?.id ?? "ST"}-${String(index + 1).padStart(3, "0")}`,
    orderLineId: line?.id ?? lineId,
    orderNo: line?.orderNo ?? lineId,
    productName: line?.product ?? "未找到明细",
    goodsSpec: buildLocalGoodsSpec(line),
    billQty: qty,
    unitPrice: qty > 0 ? roundMoney(amount / qty) : 0,
    amount,
    adjustmentAmount: 0,
    finalAmount: amount,
  };
}

function buildLocalGoodsSpec(line) {
  if (!line) return "";
  const colorSpec = buildLocalLineColorSpec(line);
  const printSide = line.print === "是" ? mapPrintSide(line.printSide) : "";
  const remark = buildLocalLineRemark(line, colorSpec);
  return [line.product, line.size, colorSpec, printSide, `${Number(line.qty ?? 0)}个`, remark].filter(Boolean).join(" / ");
}

function buildLocalLineColorSpec(line) {
  const labels = [];
  if (line.print === "是" && line.printColor && line.printColor !== "非印刷" && line.printColor !== "待确认") {
    labels.push(`${shortColorName(line.color)}印${shortColorName(line.printColor)}`);
  }
  if (line.handleColor && line.handleColor !== "待确认") {
    labels.push(`${shortColorName(line.color)}袋${shortColorName(line.handleColor)}提`);
  }
  return labels.length ? labels.join(" / ") : line.color;
}

function buildLocalLineRemark(line, colorSpec = "") {
  const remarks = [];
  if (line.handle && line.handle !== "普通提") remarks.push(line.handle);
  const note = String(line.note ?? "").trim();
  if (note && !colorSpec.includes(note) && !remarks.includes(note)) remarks.push(note);
  for (const exception of line.exceptions ?? []) {
    if (exception && !remarks.includes(exception)) remarks.push(exception);
  }
  return remarks.join("、");
}

function mapPrintSide(value) {
  if (value === "single") return "单面";
  if (value === "double") return "双面";
  return value || "";
}

function roundMoney(value) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

function shortColorName(color = "") {
  return color.endsWith("色") ? color.slice(0, -1) : color;
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function getResponseHeader(response, name) {
  if (!response?.headers?.get) return "";
  return response.headers.get(name) ?? "";
}

function getFileNameFromContentDisposition(value) {
  const header = String(value ?? "");
  const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }
  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? "";
}
