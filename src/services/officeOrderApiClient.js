import { normalizeOrderType } from "../../shared/orderRouting.js";
import { enrichDraftRow } from "../lib/orderDraftProjection.js";
import { recognizeOrderConversation } from "../lib/orderConversationRecognition.js";
import { isOfficeApiServerRequired } from "./officeAuthService.js";
import {
  readOfficeApiJson as readJson,
  requestOfficeApi as requestOrderApi,
  toOfficeApiError as toApiError,
} from "./officeApiClientCore.js";
export { resolveOfficeOrderConfirmationStrategy } from "./officeOrderSelectors.js";

const defaultDraftStatus = "待补充信息";

export async function recognizeOfficeDraft(input, options = {}) {
  const { authState, customerId, customers = [], inventories = [], operatorId, sourceMessages, sourceText } = input;
  try {
    const response = await requestOrderApi("/order-drafts/recognize", {
      ...options,
      idempotencyKey: input.idempotencyKey ?? options.idempotencyKey,
      authState,
      method: "POST",
      operatorId,
      body: {
        sourceText,
        sourceMessages,
        customerId,
        sourceHoldId: input.sourceHoldId,
        sourceIntentId: input.sourceIntentId,
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
      customerId,
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
    const query = new URLSearchParams({ queueOnly: "true", page: String(input.page ?? 1), pageSize: String(input.pageSize ?? 100) });
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
      page: Number(json.page ?? input.page ?? 1),
      pageSize: Number(json.pageSize ?? input.pageSize ?? 100),
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
      idempotencyKey: input.idempotencyKey ?? options.idempotencyKey,
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
      idempotencyKey: input.idempotencyKey ?? options.idempotencyKey,
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
        pricingQuoteId: input.pricingQuoteId,
        confirmedAffectedOrderLineIds: input.confirmedAffectedOrderLineIds,
        shortageDecision: input.shortageDecision,
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
      idempotencyKey: input.idempotencyKey ?? options.idempotencyKey,
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
        pricingQuoteId: input.pricingQuoteId,
        confirmedAffectedOrderLineIds: input.confirmedAffectedOrderLineIds,
        shortageDecision: input.shortageDecision,
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
    const row = enrichDraftRow(
      {
        id: line.draftLineId ?? `DRAFT-API-${index + 1}`,
        customer: line.customerName ?? draft.customerName ?? "待确认客户",
        customerId: line.customerId ?? draft.customerId ?? "",
        product: line.productName ?? "空白袋",
        orderType: normalizeOrderType(line.orderType ?? line.productType),
        size: line.size ?? "待确认",
        color: line.bagColor ?? "待确认",
        handle: line.handleType ?? "普通提",
        style: line.style ?? "空白袋",
        print,
        qty: Number(line.qty ?? 0),
        ...(line.qtyBasis === "incoming_rolls" ? { qtyBasis: "incoming_rolls", incomingRollCount: Number(line.incomingRollCount ?? 0) } : {}),
        ...(line.printMethod ? { printMethod: line.printMethod } : {}),
        ...(line.deliveryAddressId ? { deliveryAddressId: line.deliveryAddressId } : {}),
        ...(line.deliveryAddress ? { deliveryAddress: line.deliveryAddress } : {}),
        ...(Number(line.printColorCount) >= 1 ? { printColorCount: Number(line.printColorCount) } : {}),
        fulfillment: line.fulfillmentMethod ?? "待确认",
        latest: line.latestNeededAt ?? "待确认",
        printColor: line.printColor ?? (print === "是" ? "待确认" : "非印刷"),
        printSide: mapApiPrintSide(line.printSide, print),
        artworkStatus: mapApiArtworkStatus(line.artworkStatus, print),
        artworkAttachment: line.artworkAttachment,
        handleColor: line.handleColor ?? "",
        printContent: line.printContent ?? "",
        specialRequirements: line.specialRequirements ?? [],
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
    const lockedAmount = line.recognitionEvidence?.normalizedLine?.quoteSnapshot?.amount;
    if (["mini_program", "wechat_mini_program"].includes(draft.sourceChannel) && Number.isFinite(lockedAmount)) row.amount = lockedAmount;
    return row;
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
    orderType: line.orderType,
    size: line.size,
    bagColor: line.color,
    handleType: line.handle,
    handleColor: line.handleColor,
    style: line.style,
    qty: line.qty,
    fulfillmentMethod: line.fulfillment,
    latestNeededAt: line.latest,
    printFlag: line.print === "是",
    printContent: line.printContent,
    specialRequirements: line.specialRequirements,
    printColor: line.printColor,
    printSide: line.printSide,
    artworkStatus: line.artworkStatus,
    artworkAttachment: line.artworkAttachment,
    customerNote: line.note,
    recognitionEvidence: {
      normalizedLine: line.normalizedLine ?? line.recognitionEvidence?.normalizedLine,
      sourceHoldId: line.sourceHoldId,
      sourceIntentId: line.sourceIntentId,
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
    // 外加工印刷一定是印刷单。
    const printFlag = row.print === "是" || normalizeOrderType(row.orderType) === "external_print";
    const byIncomingRolls = normalizeOrderType(row.orderType) === "external_print" && row.qtyBasis === "incoming_rolls";
    return removeUndefinedFields({
      draftLineId: row.id ?? `DRAFT-LINE-${index + 1}`,
      customerId: row.customerId,
      customer: row.customer,
      productName: row.product || "空白袋",
      orderType: normalizeOrderType(row.orderType),
      size: row.size || "待确认",
      bagColor: row.color || "待确认",
      handleType: row.handle || "普通提",
      handleColor: row.handleColor || undefined,
      style: row.style || "空白袋",
      qty: byIncomingRolls ? 0 : Number(row.qty ?? 0),
      qtyBasis: byIncomingRolls ? "incoming_rolls" : undefined,
      incomingRollCount: byIncomingRolls ? Number(row.incomingRollCount ?? 0) : undefined,
      printMethod: row.printMethod || undefined,
      deliveryAddressId: row.deliveryAddressId || undefined,
      deliveryAddress: row.deliveryAddress || undefined,
      printColorCount: Number(row.printColorCount) >= 1 ? Number(row.printColorCount) : undefined,
      estimatedAmount: Number(row.amount ?? 0),
      fulfillmentMethod: row.fulfillment || "待确认",
      latestNeededAt: row.latest || "待确认",
      printFlag,
      printContent: printFlag ? row.printContent || "" : undefined,
      specialRequirements: row.specialRequirements ?? [],
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
  if (value === "double" || value === "双面" || value === "双面相同") return "双面";
  if (value === "double_different" || value === "双面不同") return "双面不同";
  return "待确认";
}

function mapDraftPrintSideToApi(value) {
  if (value === "单面" || value === "single") return "single";
  if (value === "双面" || value === "double" || value === "双面相同") return "double";
  // 负责人 2026-11-08：双面不同（两面内容不一样）单独一种；服务端按中文原样保存。
  if (value === "双面不同" || value === "double_different") return "双面不同";
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

// 负责人 2026-11-04：一个客户可能有多个收货地址；开送货单时列出来让办公室选。
export async function getOfficeCustomerDeliveryAddresses(input = {}, options = {}) {
  const customerId = String(input.customerId ?? "").trim();
  if (!customerId) return { source: "ui_error", blocked: true, error: { code: "CUSTOMER_ID_REQUIRED", message: "请先确认客户。" }, addresses: [] };
  try {
    const response = await requestOrderApi(`/master-data/customers/${encodeURIComponent(customerId)}/delivery-addresses`, {
      ...options,
      authState: input.authState,
      operatorId: input.operatorId,
    });
    const json = await readJson(response);
    if (!response.ok) {
      return { source: "api_error", blocked: true, error: toApiError(json, response.status, "客户收货地址读取失败。"), addresses: [] };
    }
    return {
      source: "api",
      customerId,
      addresses: Array.isArray(json.addresses) ? json.addresses : [],
      defaultAddressId: String(json.defaultAddressId ?? ""),
    };
  } catch (error) {
    return { source: "api_error", blocked: true, error: { code: "CUSTOMER_ADDRESS_API_UNAVAILABLE", message: error?.message ?? String(error) }, addresses: [] };
  }
}

// 客户资料随用随补：开单时另填的地址可以顺手存进客户档案（负责人 2026-11-04）。
export async function addOfficeCustomerDeliveryAddress(input = {}, options = {}) {
  const customerId = String(input.customerId ?? "").trim();
  if (!customerId) return { source: "ui_error", blocked: true, error: { code: "CUSTOMER_ID_REQUIRED", message: "请先确认客户。" } };
  try {
    const response = await requestOrderApi(`/master-data/customers/${encodeURIComponent(customerId)}/delivery-addresses`, {
      ...options,
      method: "POST",
      authState: input.authState,
      operatorId: input.operatorId,
      body: { address: input.address, area: input.area, remark: input.remark, source: input.source || "order_entry" },
    });
    const json = await readJson(response);
    if (!response.ok) return { source: "api_error", blocked: true, error: toApiError(json, response.status, "送货地址保存失败。") };
    return { source: "api", address: json.address ?? null, created: json.created === true };
  } catch (error) {
    return { source: "api_error", blocked: true, error: { code: "CUSTOMER_ADDRESS_API_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

// 客户资料可编辑：改地址（会清掉旧定位）、设为默认、清除定位（负责人 2026-11-04）。
export async function updateOfficeCustomerDeliveryAddress(input = {}, options = {}) {
  const customerId = String(input.customerId ?? "").trim();
  const addressId = String(input.addressId ?? "").trim();
  if (!customerId || !addressId) return { source: "ui_error", blocked: true, error: { code: "CUSTOMER_ADDRESS_ID_REQUIRED", message: "请先选择要改的地址。" } };
  try {
    const response = await requestOrderApi(`/master-data/customers/${encodeURIComponent(customerId)}/delivery-addresses/${encodeURIComponent(addressId)}`, {
      ...options,
      method: "PATCH",
      authState: input.authState,
      operatorId: input.operatorId,
      body: { address: input.address, remark: input.remark, makeDefault: input.makeDefault === true, clearLocation: input.clearLocation === true, expected: input.expected },
    });
    const json = await readJson(response);
    if (!response.ok) return { source: "api_error", blocked: true, error: toApiError(json, response.status, "收货地址修改失败。") };
    return { source: "api", address: json.address ?? null, changed: json.changed === true, locationCleared: json.locationCleared === true };
  } catch (error) {
    return { source: "api_error", blocked: true, error: { code: "CUSTOMER_ADDRESS_API_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

// 开单时选客户（负责人 2026-11-05）：按名称、简称、联系人、电话找。
export async function searchOfficeCustomers(input = {}, options = {}) {
  const query = String(input.query ?? "").trim().slice(0, 40);
  try {
    const response = await requestOrderApi(`/master-data/customers?q=${encodeURIComponent(query)}&limit=${Number(input.limit) || 20}`, { ...options, authState: input.authState, operatorId: input.operatorId });
    const json = await readJson(response);
    if (!response.ok) return { source: "api_error", blocked: true, items: [], error: toApiError(json, response.status, "客户列表读取失败。") };
    return { source: "api", items: Array.isArray(json.items) ? json.items : [], total: Number(json.total) || 0 };
  } catch (error) {
    return { source: "api_error", blocked: true, items: [], error: { code: "CUSTOMER_SEARCH_API_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

// 开单时直接新建客户（负责人 2026-11-05）：客户名称必填，电话、地址可不填。
export async function createOfficeCustomer(input = {}, options = {}) {
  try {
    const response = await requestOrderApi("/master-data/customers", {
      ...options,
      method: "POST",
      authState: input.authState,
      operatorId: input.operatorId,
      body: { name: input.name, contactName: input.contactName, phone: input.phone, address: input.address },
    });
    const json = await readJson(response);
    if (response.status === 409 && json?.code === "CUSTOMER_NAME_EXISTS" && json.customer) {
      return { source: "api", existing: true, customer: json.customer, message: json.message };
    }
    if (!response.ok) return { source: "api_error", blocked: true, error: toApiError(json, response.status, "新建客户没有保存。") };
    return { source: "api", created: true, customer: json.customer ?? null, addressId: json.addressId ?? "" };
  } catch (error) {
    return { source: "api_error", blocked: true, error: { code: "CUSTOMER_CREATE_API_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

// 客户资料可编辑：名称、简称、结算周期、默认联系人和电话（负责人 2026-11-04）。
export async function getOfficeCustomerProfile(input = {}, options = {}) {
  const customerId = String(input.customerId ?? "").trim();
  if (!customerId) return { source: "ui_error", blocked: true, error: { code: "CUSTOMER_ID_REQUIRED", message: "请先选择客户。" } };
  try {
    const response = await requestOrderApi(`/master-data/customers/${encodeURIComponent(customerId)}/profile`, { ...options, authState: input.authState, operatorId: input.operatorId });
    const json = await readJson(response);
    if (!response.ok) return { source: "api_error", blocked: true, error: toApiError(json, response.status, "客户资料读取失败。") };
    return { source: "api", profile: json.profile ?? null, settlementCycleOptions: Array.isArray(json.settlementCycleOptions) ? json.settlementCycleOptions : [] };
  } catch (error) {
    return { source: "api_error", blocked: true, error: { code: "CUSTOMER_PROFILE_API_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

export async function updateOfficeCustomerProfile(input = {}, options = {}) {
  const customerId = String(input.customerId ?? "").trim();
  if (!customerId) return { source: "ui_error", blocked: true, error: { code: "CUSTOMER_ID_REQUIRED", message: "请先选择客户。" } };
  try {
    const response = await requestOrderApi(`/master-data/customers/${encodeURIComponent(customerId)}/profile`, {
      ...options, method: "PATCH", authState: input.authState, operatorId: input.operatorId,
      body: { name: input.name, shortName: input.shortName, settlementCycle: input.settlementCycle, contactName: input.contactName, phone: input.phone, expected: input.expected },
    });
    const json = await readJson(response);
    if (!response.ok) return { source: "api_error", blocked: true, error: toApiError(json, response.status, "客户资料保存失败。") };
    return { source: "api", profile: json.profile ?? null, changed: json.changed === true };
  } catch (error) {
    return { source: "api_error", blocked: true, error: { code: "CUSTOMER_PROFILE_API_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}
