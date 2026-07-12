import { enrichDraftRow } from "../lib/orderParser.js";
import { recognizeOrderConversation } from "../lib/orderConversationRecognition.js";
import { isOfficeApiServerRequired } from "./officeAuthService.js";
import { requestOfficeApi as requestOrderApi } from "./officeApiClientCore.js";

const defaultDraftStatus = "待补充信息";

export async function recognizeOfficeDraft(input, options = {}) {
  const { authState, customers = [], inventories = [], operatorId, sourceMessages, sourceText } = input;
  try {
    const response = await requestOrderApi("/order-drafts/recognize", {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        sourceText,
        sourceMessages,
        sourceChannel: "manual",
        operatorId,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: {
          code: json?.code ?? `HTTP_${response.status}`,
          message: json?.message ?? "订单识别 API 返回错误。",
          requiredPermission: json?.requiredPermission,
        },
        rows: [],
      };
    }

    return {
      source: "api",
      draft: json.draft,
      rows: mapRecognizedDraftRows(json, { inventories, sourceText }),
      recognition: json.recognition ?? null,
      riskHints: json.riskHints ?? [],
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    const recognition = recognizeOrderConversation(sourceMessages?.length ? sourceMessages : sourceText, {
      customers,
      inventories,
    });
    return {
      source: "local_fallback",
      error: {
        code: "ORDER_RECOGNIZE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      rows: recognition.orderRows,
      recognition,
    };
  }
}

export async function saveOfficeDraft(input, options = {}) {
  const {
    authState,
    draftRows = [],
    draftId,
    clientRevision = 0,
    operatorId,
    sourceText = "",
    draftStatus = defaultDraftStatus,
    saveReason = "office_entry_save_draft",
  } = input;
  const resolvedDraftId = draftId || createClientDraftId();

  try {
    const response = await requestOrderApi(`/order-drafts/${encodeURIComponent(resolvedDraftId)}`, {
      ...options,
      authState,
      method: "PATCH",
      operatorId,
      body: {
        draftId: resolvedDraftId,
        sourceText,
        sourceChannel: "manual",
        customerId: getPrimaryCustomerId(draftRows),
        operatorId,
        clientRevision,
        draftStatus,
        saveReason,
        lines: mapDraftRowsToApiLines(draftRows, sourceText),
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        draftId: resolvedDraftId,
        error: toApiError(json, response.status, "订单草稿保存 API 返回错误。"),
        todos: [],
      };
    }

    return {
      source: "api",
      draftId: resolvedDraftId,
      draft: json.draft,
      todos: mapApiTodosToLocalTodoInputs(json.todos, { draftRows, draftId: resolvedDraftId }),
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("ORDER_DRAFT_SAVE_API_UNAVAILABLE", error, resolvedDraftId);
    }
    return {
      source: "local_fallback",
      draftId: resolvedDraftId,
      error: {
        code: "ORDER_DRAFT_SAVE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      todos: [],
    };
  }
}

export async function confirmOfficeDraftViaApi(input, options = {}) {
  const {
    authState,
    draftRows = [],
    draftId,
    clientRevision = 0,
    operatorId,
    sourceText = "",
    confirmMode = "confirm_now",
  } = input;
  const resolvedDraftId = draftId || createClientDraftId();

  try {
    const response = await requestOrderApi(`/order-drafts/${encodeURIComponent(resolvedDraftId)}/confirm`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        draftId: resolvedDraftId,
        sourceText,
        sourceChannel: "manual",
        customerId: getPrimaryCustomerId(draftRows),
        operatorId,
        confirmMode,
        clientRevision,
        lines: mapDraftRowsToApiLines(draftRows, sourceText),
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        draftId: resolvedDraftId,
        error: toApiError(json, response.status, "订单草稿确认 API 返回错误。"),
        confirmation: null,
      };
    }

    return {
      source: "api",
      draftId: resolvedDraftId,
      draft: {
        draftId: resolvedDraftId,
        clientRevision: Number(clientRevision ?? 0) + 1,
      },
      confirmation: json,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("ORDER_DRAFT_CONFIRM_API_UNAVAILABLE", error, resolvedDraftId);
    }
    return {
      source: "local_fallback",
      draftId: resolvedDraftId,
      error: {
        code: "ORDER_DRAFT_CONFIRM_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      confirmation: null,
    };
  }
}

export function resolveOfficeOrderConfirmationStrategy(result, options = {}) {
  if (result?.source === "api" && result?.blocked !== true && result?.confirmation?.orderId) {
    return { kind: "server", confirmation: result.confirmation };
  }
  if (result?.source === "local_fallback" && result?.blocked !== true && !isOfficeApiServerRequired(options)) {
    return { kind: "local_fallback" };
  }
  return {
    kind: "blocked",
    error: result?.error ?? {
      code: "ORDER_DRAFT_CONFIRMATION_UNVERIFIED",
      message: "订单确认未获得可验证的后端事务结果。",
    },
  };
}

function buildServerRequiredWriteError(code, error, draftId) {
  return {
    source: "api_error",
    blocked: true,
    draftId,
    error: {
      code,
      message: `生产模式要求后端确认，未执行本地降级：${error?.message ?? String(error)}`,
    },
    confirmation: null,
  };
}

export function mapRecognizedDraftRows(response, { inventories = [], sourceText = "" } = {}) {
  const draft = response?.draft ?? {};
  return (response?.lines ?? []).map((line, index) => {
    const print = line.printFlag ? "是" : "否";
    const note = uniqueText([line.customerNote, line.officeNote]).join("、");
    return enrichDraftRow(
      {
        id: line.draftLineId ?? `DRAFT-API-${index + 1}`,
        customer: line.customerName ?? draft.customerName ?? "待确认客户",
        customerId: line.customerId ?? draft.customerId ?? "",
        product: line.productName ?? "空白袋",
        size: line.size ?? "待确认",
        color: line.bagColor ?? "待确认",
        handle: line.handleType ?? "普通提",
        style: line.style ?? "空白袋",
        print,
        qty: Number(line.qty ?? 0),
        fulfillment: line.fulfillmentMethod ?? "待确认",
        latest: line.latestNeededAt ?? "待确认",
        printColor: line.printColor ?? (print === "是" ? "待确认" : "非印刷"),
        printSide: mapApiPrintSide(line.printSide, print),
        artworkStatus: mapApiArtworkStatus(line.artworkStatus, print),
        handleColor: line.handleColor ?? "",
        note,
        source: line.recognitionEvidence?.sourceText ?? draft.sourceText ?? sourceText,
        sourceMessageId: line.recognitionEvidence?.sourceMessageId ?? "",
        sourceSender: line.recognitionEvidence?.sourceSender ?? "",
        sourceSenderRole: line.recognitionEvidence?.sourceSenderRole ?? "",
        sourceSentAt: line.recognitionEvidence?.sourceSentAt ?? "",
        sourceSequence: line.recognitionEvidence?.sourceSequence ?? 0,
        sourceConversationId: line.recognitionEvidence?.sourceConversationId ?? "",
        originalOrderGroupId: line.recognitionEvidence?.originalOrderGroupId ?? "",
        intentType: line.recognitionEvidence?.intentType ?? "explicit_order",
        appendDecision: line.recognitionEvidence?.appendDecision ?? "",
        reviewReasons: line.recognitionEvidence?.reviewReasons ?? [],
        dimensionEvidence: line.recognitionEvidence?.dimensionEvidence,
        aliasEvidence: line.recognitionEvidence?.aliasEvidence,
      },
      inventories,
    );
  });
}

export function mapDraftRowsToApiLines(draftRows, sourceText = "") {
  return draftRows.map((row, index) => {
    const printFlag = row.print === "是";
    return removeUndefinedFields({
      draftLineId: row.id ?? `DRAFT-LINE-${index + 1}`,
      customerId: row.customerId,
      customer: row.customer,
      productName: row.product || "空白袋",
      orderType: printFlag ? "custom_print" : "stock",
      size: row.size || "待确认",
      bagColor: row.color || "待确认",
      handleType: row.handle || "普通提",
      handleColor: row.handleColor || undefined,
      style: row.style || "空白袋",
      qty: Number(row.qty ?? 0),
      fulfillmentMethod: row.fulfillment || "待确认",
      latestNeededAt: row.latest || "待确认",
      printFlag,
      printColor: printFlag ? row.printColor || "待确认" : undefined,
      printSide: printFlag ? mapDraftPrintSideToApi(row.printSide) : undefined,
      artworkStatus: printFlag ? mapDraftArtworkStatusToApi(row.artworkStatus) : undefined,
      customerNote: row.note || "",
      officeNote: "",
      recognitionEvidence: {
        sourceText: row.source || sourceText,
        sourceMessageId: row.sourceMessageId || undefined,
        sourceSender: row.sourceSender || undefined,
        sourceSenderRole: row.sourceSenderRole || undefined,
        sourceSentAt: row.sourceSentAt || undefined,
        sourceSequence: row.sourceSequence || undefined,
        sourceConversationId: row.sourceConversationId || undefined,
        originalOrderGroupId: row.originalOrderGroupId || undefined,
        intentType: row.intentType || undefined,
        appendDecision: row.appendDecision || undefined,
        reviewReasons: row.reviewReasons?.length ? row.reviewReasons : undefined,
        dimensionEvidence: row.dimensionEvidence,
        aliasEvidence: row.aliasEvidence,
      },
    });
  });
}

export function createClientDraftId() {
  return `DRAFT-FE-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
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

function getPrimaryCustomerId(draftRows) {
  return draftRows.find((row) => row.customerId)?.customerId ?? "";
}

function mapApiTodosToLocalTodoInputs(todos = [], { draftRows = [], draftId = "" } = {}) {
  const first = draftRows[0];
  return todos.map((todo) => ({
    id: todo.todoId,
    type: todo.type ?? "订单草稿待确认",
    customerId: first?.customerId || "C001",
    ref: todo.refId ?? draftId,
    summary: todo.summary ?? `${draftRows.length} 行草稿需要补充信息`,
    latest: todo.latestNeededAt ?? first?.latest ?? "待确认",
    urgency: "普通",
    impact: "草稿未生成正式订单",
  }));
}

function mapApiPrintSide(value, print) {
  if (print !== "是") return "非印刷";
  if (value === "single" || value === "单面") return "单面";
  if (value === "double" || value === "双面") return "双面";
  return "待确认";
}

function mapDraftPrintSideToApi(value) {
  if (value === "单面" || value === "single") return "single";
  if (value === "双面" || value === "double") return "double";
  return undefined;
}

function mapDraftArtworkStatusToApi(value) {
  if (value === "已上传" || value === "uploaded") return "uploaded";
  if (value === "已有稿件" || value === "existing_artwork") return "existing_artwork";
  if (value === "客户待补" || value === "customer_pending") return "customer_pending";
  if (value === "待上传" || value === "pending") return "pending";
  return "side_panel_required";
}

function mapApiArtworkStatus(value, print) {
  if (print !== "是") return "非印刷";
  if (value === "uploaded" || value === "已上传") return "已上传";
  if (value === "existing_artwork" || value === "已有稿件") return "已有稿件";
  if (value === "customer_pending" || value === "客户待补") return "客户待补";
  if (value === "pending" || value === "待上传") return "待上传";
  return "客户待补";
}

function removeUndefinedFields(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function uniqueText(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}
