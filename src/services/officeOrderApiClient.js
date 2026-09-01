import { enrichDraftRow } from "../lib/orderParser.js";
import { recognizeOrderConversation } from "../lib/orderConversationRecognition.js";
import { isOfficeApiServerRequired } from "./officeAuthService.js";
import {
  readOfficeApiJson as readJson,
  requestOfficeApi as requestOrderApi,
  toOfficeApiError as toApiError,
} from "./officeApiClientCore.js";

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
        error: toApiError(json, response.status, "订单识别 API 返回错误。"),
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

export async function recognizeOfficeDraftQueue(input, options = {}) {
  const { authState, customerId, operatorId, sourceMessages, sourceText } = input;
  try {
    const response = await requestOrderApi("/order-draft-queues/recognize", {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        sourceText,
        sourceMessages,
        customerId,
        sourceChannel: "wechat_group_queue",
        currentDraftStatus: "待审核",
        idempotencyKey: input.idempotencyKey ?? buildQueueIdempotencyKey(sourceMessages, sourceText),
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "批量订单草稿识别 API 返回错误。"),
        drafts: [],
      };
    }
    return {
      source: "api",
      queueBatch: json.queueBatch,
      drafts: (json.drafts ?? []).map((item) => mapQueueDraftItem(item, input.inventories ?? [])),
      recognition: json.recognition,
    };
  } catch (error) {
    return buildServerRequiredWriteError("ORDER_DRAFT_QUEUE_API_UNAVAILABLE", error, "");
  }
}

export async function listOfficeDraftQueue(input = {}, options = {}) {
  try {
    const query = new URLSearchParams({ queueOnly: "true", pageSize: String(input.pageSize ?? 100) });
    if (input.queueBatchId) query.set("queueBatchId", input.queueBatchId);
    if (input.queueKind) query.set("queueKind", input.queueKind);
    if (input.status) query.set("status", input.status);
    const response = await requestOrderApi(`/order-drafts?${query.toString()}`, {
      ...options,
      authState: input.authState,
      operatorId: input.operatorId,
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "订单草稿队列读取 API 返回错误。"),
        items: [],
      };
    }
    return {
      source: "api",
      items: (json.items ?? []).map((draft) => mapQueuedDraftRecord(draft, input.inventories ?? [])),
      summary: json.summary ?? {},
      total: Number(json.total ?? 0),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: { code: "ORDER_DRAFT_QUEUE_READ_API_UNAVAILABLE", message: error?.message ?? String(error) },
      items: [],
    };
  }
}

export async function getOfficeDraft(input = {}, options = {}) {
  const draftId = String(input.draftId ?? "").trim();
  if (!draftId) {
    return {
      source: "ui_error",
      blocked: true,
      error: { code: "ORDER_DRAFT_ID_REQUIRED", message: "缺少订单草稿 ID。" },
      item: null,
    };
  }
  try {
    const query = new URLSearchParams({ draftId, pageSize: "1" });
    const response = await requestOrderApi(`/order-drafts?${query.toString()}`, {
      ...options,
      authState: input.authState,
      operatorId: input.operatorId,
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "订单草稿读取 API 返回错误。"),
        item: null,
      };
    }
    const draft = json.items?.[0];
    return {
      source: "api",
      item: draft ? mapQueuedDraftRecord(draft, input.inventories ?? []) : null,
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: { code: "ORDER_DRAFT_READ_API_UNAVAILABLE", message: error?.message ?? String(error) },
      item: null,
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
        expectedRevision: clientRevision,
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

export async function restoreOfficeDraftShortageCancellation(input, options = {}) {
  const { authState, draftId, draftLineId, clientRevision = 0, operatorId, reason } = input;
  try {
    const response = await requestOrderApi(`/order-drafts/${encodeURIComponent(draftId)}/shortage-cancellation-restore`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        expectedRevision: clientRevision,
        draftLineId,
        reason,
        idempotencyKey: input.idempotencyKey ?? `restore-shortage:${draftId}:${draftLineId}:${clientRevision}`,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        draftId,
        error: toApiError(json, response.status, "恢复订购 API 返回错误。"),
      };
    }
    return {
      source: "api",
      draftId,
      draft: json.draft,
      line: mapRecognizedDraftRows({ draft: json.draft, lines: [json.line] })[0],
      inventoryIntents: json.inventoryIntents ?? [],
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    return buildServerRequiredWriteError("ORDER_DRAFT_SHORTAGE_RESTORE_API_UNAVAILABLE", error, draftId);
  }
}

export async function linkOfficeDraftShortageCancellation(input, options = {}) {
  const { authState, draftId, draftLineId, intentId, clientRevision = 0, operatorId, reason } = input;
  try {
    const response = await requestOrderApi(`/order-drafts/${encodeURIComponent(draftId)}/cross-draft-shortage-cancellation`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        expectedRevision: clientRevision,
        draftLineId,
        intentId,
        reason,
        idempotencyKey: input.idempotencyKey ?? `cross-draft-shortage:${draftId}:${draftLineId}:${intentId}:${clientRevision}`,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        draftId,
        error: toApiError(json, response.status, "跨草稿取消关联 API 返回错误。"),
      };
    }
    return {
      source: "api",
      draftId,
      draft: json.draft,
      line: mapRecognizedDraftRows({ draft: json.draft, lines: [json.line] })[0],
      inventoryIntent: json.inventoryIntent,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    return buildServerRequiredWriteError("ORDER_DRAFT_CROSS_CANCELLATION_API_UNAVAILABLE", error, draftId);
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
        expectedRevision: clientRevision,
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

export async function previewOfficeDraftSplit(input, options = {}) {
  return requestOfficeDraftSplit("split-preview", input, options, "ORDER_DRAFT_SPLIT_PREVIEW_API_UNAVAILABLE");
}

export async function confirmOfficeDraftSplit(input, options = {}) {
  return requestOfficeDraftSplit("split-confirm", input, options, "ORDER_DRAFT_SPLIT_CONFIRM_API_UNAVAILABLE");
}

async function requestOfficeDraftSplit(action, input, options, unavailableCode) {
  const {
    authState,
    draftRows = [],
    draftId,
    clientRevision = 0,
    operatorId,
    sourceText = "",
    splitPlanHash = "",
  } = input;
  const resolvedDraftId = draftId || createClientDraftId();
  try {
    const response = await requestOrderApi(`/order-drafts/${encodeURIComponent(resolvedDraftId)}/${action}`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        draftId: resolvedDraftId,
        sourceText,
        sourceChannel: "manual",
        customerId: getPrimaryCustomerId(draftRows),
        expectedRevision: clientRevision,
        splitPlanHash: splitPlanHash || undefined,
        lines: mapDraftRowsToApiLines(draftRows, sourceText),
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        draftId: resolvedDraftId,
        error: toApiError(json, response.status, "订单拆单 API 返回错误。"),
      };
    }
    return {
      source: "api",
      draftId: resolvedDraftId,
      draft: {
        draftId: resolvedDraftId,
        clientRevision: action === "split-confirm" ? Number(clientRevision ?? 0) + 1 : Number(clientRevision ?? 0),
      },
      splitPlan: json.splitPlan,
      confirmation: action === "split-confirm" ? json : null,
    };
  } catch (error) {
    return buildServerRequiredWriteError(unavailableCode, error, resolvedDraftId);
  }
}

export function resolveOfficeOrderConfirmationStrategy(result, options = {}) {
  if (
    result?.source === "api"
    && result?.blocked !== true
    && (result?.confirmation?.orderId || result?.confirmation?.closedWithoutOrder === true)
  ) {
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
        artworkAttachment: line.artworkAttachment,
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
        fieldReviews: line.recognitionEvidence?.fieldReviews ?? [],
        dimensionEvidence: line.recognitionEvidence?.dimensionEvidence,
        aliasEvidence: line.recognitionEvidence?.aliasEvidence,
        sourceHoldId: line.recognitionEvidence?.sourceHoldId ?? "",
        sourceIntentId: line.recognitionEvidence?.sourceIntentId ?? "",
        cancellationStatus: line.recognitionEvidence?.cancellationStatus ?? "",
        cancellationScope: line.recognitionEvidence?.cancellationScope ?? "",
        cancellationSourceMessageId: line.recognitionEvidence?.cancellationSourceMessageId ?? "",
        cancellationRestoration: line.recognitionEvidence?.cancellationRestoration,
        crossDraftCancellation: line.recognitionEvidence?.crossDraftCancellation,
        excludedFromConfirmation: line.recognitionEvidence?.excludedFromConfirmation === true,
      },
      inventories,
    );
  });
}

function mapQueueDraftItem(item, inventories) {
  return {
    ...item,
    rows: mapRecognizedDraftRows(
      { draft: item.draft, lines: item.lines },
      { inventories, sourceText: item.draft?.sourceText ?? "" },
    ),
  };
}

function mapQueuedDraftRecord(draft, inventories) {
  const context = draft.recognitionContext ?? {};
  const lines = (draft.lines ?? []).map((line) => ({
    draftLineId: line.id,
    customerId: line.customerId ?? draft.customerId,
    customerName: line.customer ?? draft.customerName,
    productName: line.product,
    size: line.size,
    bagColor: line.color,
    handleType: line.handle,
    handleColor: line.handleColor,
    style: line.style,
    qty: line.qty,
    fulfillmentMethod: line.fulfillment,
    latestNeededAt: line.latest,
    printFlag: line.print === "是",
    printColor: line.printColor,
    printSide: line.printSide,
    artworkStatus: line.artworkStatus,
    artworkAttachment: line.artworkAttachment,
    customerNote: line.note,
    recognitionEvidence: {
      sourceText: line.source,
      sourceMessageId: line.sourceMessageId,
      sourceSender: line.sourceSender,
      sourceSenderRole: line.sourceSenderRole,
      sourceSentAt: line.sourceSentAt,
      sourceSequence: line.sourceSequence,
      sourceConversationId: line.sourceConversationId,
      originalOrderGroupId: line.originalOrderGroupId,
      intentType: line.intentType,
      appendDecision: line.appendDecision,
      reviewReasons: line.reviewReasons,
      fieldReviews: line.fieldReviews,
      dimensionEvidence: line.dimensionEvidence,
      aliasEvidence: line.aliasEvidence,
      cancellationStatus: line.cancellationStatus,
      cancellationScope: line.cancellationScope,
      cancellationSourceMessageId: line.cancellationSourceMessageId,
      cancellationRestoration: line.cancellationRestoration,
      crossDraftCancellation: line.crossDraftCancellation,
      excludedFromConfirmation: line.excludedFromConfirmation,
    },
  }));
  return {
    queueItemId: context.queueItemId,
    kind: context.queueKind,
    status: draft.inventoryIntents?.find((intent) => intent.intentStatus)?.intentStatus ?? draft.status,
    sourceMessageIds: (context.sourceMessages ?? []).map((message) => message.id),
    originalOrderGroupId: context.originalOrderGroupId,
    inventoryIntents: draft.inventoryIntents ?? [],
    draft,
    rows: mapRecognizedDraftRows({ draft, lines }, { inventories, sourceText: draft.sourceText }),
  };
}

function buildQueueIdempotencyKey(sourceMessages, sourceText) {
  const source = JSON.stringify(sourceMessages?.length ? sourceMessages : sourceText ?? "");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `order-draft-queue:${(hash >>> 0).toString(16).padStart(8, "0")}`;
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
      estimatedAmount: Number(row.amount ?? 0),
      fulfillmentMethod: row.fulfillment || "待确认",
      latestNeededAt: row.latest || "待确认",
      printFlag,
      printColor: printFlag ? row.printColor || "待确认" : undefined,
      printSide: printFlag ? mapDraftPrintSideToApi(row.printSide) : undefined,
      artworkStatus: printFlag ? mapDraftArtworkStatusToApi(row.artworkStatus) : undefined,
      artworkAttachment: printFlag ? row.artworkAttachment : undefined,
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
        fieldReviews: row.fieldReviews?.length ? row.fieldReviews : undefined,
        dimensionEvidence: row.dimensionEvidence,
        aliasEvidence: row.aliasEvidence,
        sourceHoldId: row.sourceHoldId || undefined,
        sourceIntentId: row.sourceIntentId || undefined,
        cancellationStatus: row.cancellationStatus || undefined,
        cancellationScope: row.cancellationScope || undefined,
        cancellationSourceMessageId: row.cancellationSourceMessageId || undefined,
        cancellationRestoration: row.cancellationRestoration,
        crossDraftCancellation: row.crossDraftCancellation,
        excludedFromConfirmation: row.excludedFromConfirmation === true || undefined,
      },
    });
  });
}

export function createClientDraftId() {
  return `DRAFT-FE-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
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
