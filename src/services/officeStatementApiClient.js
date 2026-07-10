import { isOfficeApiServerRequired } from "./officeAuthService.js";
import { requestOfficeApi as requestStatementApi } from "./officeApiClientCore.js";
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

export async function markOfficeStatementSentViaApi(input, options = {}) {
  const { authState, statement, operatorId, channel = "wechat", sentTo = "", remark = "" } = input;

  try {
    const response = await requestStatementApi(`/statements/${encodeURIComponent(statement.id)}/mark-sent`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
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
  const { authState, statement, varianceAmount, reason, operatorId, paymentRecordId = "" } = input;

  try {
    const response = await requestStatementApi(`/statements/${encodeURIComponent(statement.id)}/variance`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        statementId: statement.id,
        paymentRecordId: paymentRecordId || undefined,
        varianceAmount: Number(varianceAmount ?? 0),
        handlingResult: mapStatementVarianceHandlingResult(reason),
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
  const { authState, statement, operatorId, confirmReason = "确认核销" } = input;

  try {
    const response = await requestStatementApi(`/statements/${encodeURIComponent(statement.id)}/write-off`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
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

function mapStatementPreviewLine(line) {
  return {
    statementLineId: line.statementLineId ?? line.orderLineId ?? "",
    orderLineId: line.orderLineId ?? line.statementLineId ?? "",
    orderNo: line.orderNo ?? "",
    productName: line.productName ?? "",
    goodsSpec: line.goodsSpec ?? "",
    billQty: Number(line.billQty ?? 0),
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
