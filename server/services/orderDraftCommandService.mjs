import { normalizeInventoryHoldTimestamp } from "../../shared/inventoryHoldTime.js";
import { createHash } from "node:crypto";
import { loadMiniappDraftLockedPricing, applyMiniappDraftLockedPricing } from "../miniapp/miniappDraftLockedPricing.mjs";
import { buildInventoryIntentsFromRecognition } from "../inventoryIntentDomain.mjs";
import { assertOrderDraftSplitPlan, buildOrderDraftSplitPlan } from "../orderDraftSplitDomain.mjs";
import { buildOrderDraftQueuePlan } from "../orderDraftQueueDomain.mjs";
import { buildIdempotencyRequestHash } from "../idempotency.mjs";
import { getPendingDraftFieldReviews, mergePersistedDraftFieldReviews } from "../../shared/orderDraftFieldReview.mjs";
import { isStockOrderType, normalizeOrderType, requiresProductionOrderType } from "../../shared/orderRouting.js";
import { INCOMING_ROLLS_QTY_BASIS, incomingRollCountOf, isValidIncomingRollsLine } from "../../shared/externalPrintQuantity.js";
import { customerWithAddresses, resolveDeliveryAddress } from "../../shared/deliveryAddress.js";
import { detectMessageCustomer } from "../../shared/orderMessageCustomer.js";
import { assertOrderConfirmationPriceSources } from "../orderConfirmationPriceSource.mjs";
import { loadOrderDraftPublishedPricing, applyOrderDraftPublishedPricing } from "../orderDraftPublishedPricing.mjs";
import { buildOrderPrintingPriceGroups, refreshPrintingConsumptionFacts, assertUnstartedPrintingSupplement } from "../orderPrintingPriceGroups.mjs";
import { buildOfficeDraftPricingQuote, officeQuoteProjection, assertOfficeQuoteMatches } from "../orderDraftPricingQuote.mjs";

async function readRecognitionCustomerWorkspace(workspace) {
  if (!workspace.coreWorkspaceReadRepository?.loadState) return workspace;
  const state = await workspace.coreWorkspaceReadRepository.loadState();
  return Array.isArray(state?.customers) ? { ...workspace, customers: state.customers } : workspace;
}

export function createOrderDraftCommandService(dependencies = {}) {
  const {
    buildCustomerSnapshot,
    buildOperationLog,
    buildTodo,
    confirmDraftOrder,
    findCustomerName,
    findInventoryItem,
    findMatchingInventory,
    mapFulfillmentMethod,
    mapPrintSide,
    nextId,
    nextPlainId,
    parseOrderText,
    recognizeOrderConversation,
    toFulfillmentTaskSummary,
    toInventoryCheckResult,
    toInventoryReservationTransactionSummary,
    toOrderLineSummary,
    toPriceSnapshot,
    toTodoSummary,
    now = () => new Date(),
  } = dependencies;
  for (const [name, value] of Object.entries({
    buildCustomerSnapshot,
    buildOperationLog,
    buildTodo,
    confirmDraftOrder,
    findCustomerName,
    findInventoryItem,
    findMatchingInventory,
    mapFulfillmentMethod,
    mapPrintSide,
    nextId,
    nextPlainId,
    parseOrderText,
    recognizeOrderConversation,
    toFulfillmentTaskSummary,
    toInventoryCheckResult,
    toInventoryReservationTransactionSummary,
    toOrderLineSummary,
    toPriceSnapshot,
    toTodoSummary,
  })) {
    requireFunction(value, name);
  }

  return {
    recognizeOrderDraft,
    recognizeOrderDraftQueue,
    saveOrderDraft,
    quoteOrderDraftPrice,
    restoreShortageCancelledDraftLine,
    linkCrossDraftShortageCancellation,
    confirmOrderDraft,
    previewOrderDraftSplit,
    previewOrderDraftInventory,
    confirmSplitOrderDraft,
  };

  async function recognizeOrderDraft({ workspace, body = {}, operatorId }) {
    const draftId = body.draftId ?? (body.idempotencyKey
      ? `DRAFT-API-${createHash("sha256").update(body.idempotencyKey).digest("hex").slice(0, 16).toUpperCase()}`
      : nextId("DRAFT-API", workspace.orderDrafts));
    if (body.idempotencyKey && workspace.orderDraftRepository.readSaveReceipt) {
      const prior = await workspace.orderDraftRepository.readSaveReceipt({ workspace, draftId, idempotencyKey: body.idempotencyKey, idempotencyPayload: { ...body, operatorId } });
      if (prior?.draft) {
        const context = prior.draft.recognitionContext ?? {};
        return success({ draft: summarizeDraft(prior.draft), lines: prior.draft.lines.map(toRecognizedDraftLine), recognition: context,
          inventoryIntents: prior.inventoryIntents, riskHints: [...buildDraftRiskHints(prior.draft.lines), ...(context.riskHints ?? [])], operationLogId: prior.operationLogId });
      }
    }
    const customerWorkspace = await readRecognitionCustomerWorkspace(workspace);
    const sourceText = body.sourceText ?? body.text ?? "";
    const recognition = recognizeOrderConversation(
      Array.isArray(body.sourceMessages) && body.sourceMessages.length ? body.sourceMessages : sourceText,
      {
        customers: customerWorkspace.customers,
        inventories: workspace.inventories,
        standardColors: workspace.standardColors,
        colorAliases: workspace.colorAliases,
        customerId: body.customerId,
        conversationId: body.conversationId ?? body.sourceMessageId,
        currentDraftStatus: body.currentDraftStatus,
        parseOrderText,
        now,
        // 2026-11-07 实测缺陷：只传 sourceText 时消息 id 固定为 MSG-001，组 id 和明细 id
        // 对每张草稿都一样，第二张草稿必然撞 order_draft_lines 主键。明细编号必须落在草稿内。
        messageIdScope: `${draftId}-`,
      },
    );
    if (!recognition.sourceMessages.length) {
      return businessError(422, "VALIDATION_ERROR", "sourceText or sourceMessages must contain at least one message");
    }
    let lines = recognition.orderRows;
    // 负责人 2026-11-05：消息开头或结尾写了客户名字，没认出客户的明细自动用这个客户；不对再在开单页改。
    const customerHint = body.customerId ? null : detectMessageCustomer(sourceText || recognition.sourceMessages.map((message) => message.text).join("\n"), customerWorkspace.customers ?? []);
    if (customerHint?.customerId) {
      lines = lines.map((line) => (line.customerId ? line : { ...line, customerId: customerHint.customerId, customer: customerHint.name }));
    }
    const sourceHoldId = String(body.sourceHoldId ?? "").trim();
    const sourceIntentId = String(body.sourceIntentId ?? "").trim();
    let sourceHoldGuard = null;
    if (sourceHoldId || sourceIntentId) {
      if (!sourceHoldId || !sourceIntentId || lines.length !== 1) {
        return businessError(422, "TEMPORARY_HOLD_SOURCE_REQUIRED", "留货转单必须提供完整来源，并且只对应一条商品明细。");
      }
      lines = lines.map(line => ({ ...line, sourceHoldId, sourceIntentId }));
      const conversions = resolveTemporaryHoldConversions(workspace, lines);
      if (conversions.error) return conversions.error;
      sourceHoldGuard = structuredClone(conversions.byHoldId.get(sourceHoldId));
    }
    const recognitionContext = {
      version: recognition.version,
      sourceMessages: recognition.sourceMessages,
      draftGroups: recognition.draftGroups,
      nonOrderIntents: recognition.nonOrderIntents,
      temporaryHolds: recognition.temporaryHolds,
      summary: recognition.summary,
      riskHints: recognition.riskHints,
      ...(customerHint ? { customerHint } : {}),
    };
    const customerId = body.customerId ?? lines[0]?.customerId ?? "";
    const draft = buildDraftProjection(null, {
      id: draftId,
      draftId,
      sourceText,
      sourceChannel: body.sourceChannel ?? "manual",
      sourceMessageId: body.sourceMessageId ?? "",
      customerId,
      customerName: findCustomerName(customerWorkspace, customerId),
      status: "待审核",
      lines,
      recognitionContext,
      revision: 0,
      clientRevision: 0,
      createdBy: operatorId,
    });
    const operationLog = buildOperationLog(workspace, {
      id: buildDraftOperationLogId("recognize", draftId, 1, body.idempotencyKey),
      targetType: "order_draft",
      targetId: draftId,
      action: "recognize_order_draft",
      operatorId,
      after: { lineCount: lines.length, sourceText, recognitionSummary: recognition.summary },
    });
    const inventoryIntents = buildInventoryIntentsFromRecognition({
      recognition,
      draftId,
      customerId,
      operatorId,
      now,
    });
    const transaction = await workspace.orderDraftRepository.saveOrderDraft({
      workspace,
      draft,
      expectedRevision: 0,
      inventoryIntents,
      todos: [],
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      sourceHoldGuard,
    });
    const savedLines = transaction.draft.lines;

    return success({
      draft: summarizeDraft(transaction.draft),
      lines: savedLines.map(toRecognizedDraftLine),
      recognition: recognitionContext,
      inventoryIntents: transaction.inventoryIntents,
      riskHints: [...buildDraftRiskHints(savedLines), ...recognition.riskHints],
      operationLogId: transaction.operationLogId,
    });
  }

  async function recognizeOrderDraftQueue({ workspace, body = {}, operatorId }) {
    const customerWorkspace = await readRecognitionCustomerWorkspace(workspace);
    const sourceText = body.sourceText ?? body.text ?? "";
    const recognition = recognizeOrderConversation(
      Array.isArray(body.sourceMessages) && body.sourceMessages.length ? body.sourceMessages : sourceText,
      {
        customers: customerWorkspace.customers,
        inventories: workspace.inventories,
        standardColors: workspace.standardColors,
        colorAliases: workspace.colorAliases,
        customerId: body.customerId,
        conversationId: body.conversationId ?? body.sourceMessageId,
        currentDraftStatus: body.currentDraftStatus,
        parseOrderText,
        now,
        // 2026-11-07：批量识别一次会生成多张草稿，整批共用批次作用域，
        // 不同批次不撞，同批次回放稳定。
        messageIdScope: `${buildQueueScope(body)}-`,
      },
    );
    if (!recognition.sourceMessages.length) {
      return businessError(422, "VALIDATION_ERROR", "sourceText or sourceMessages must contain at least one message");
    }
    const queueRequestHash = buildIdempotencyRequestHash({ ...body, operatorId });
    const batchId = buildQueueBatchId(body.idempotencyKey, recognition.sourceMessages);
    if (workspace.orderDraftRepository?.kind === "postgres" && workspace.orderDraftRepository.loadState) {
      const persistedState = await workspace.orderDraftRepository.loadState();
      workspace.orderDrafts = persistedState.orderDrafts ?? [];
    }
    const existingBatchDraft = (workspace.orderDrafts ?? []).find(
      (draft) => draft.recognitionContext?.queueBatchId === batchId,
    );
    if (existingBatchDraft && existingBatchDraft.recognitionContext?.queueRequestHash !== queueRequestHash) {
      return businessError(409, "ORDER_DRAFT_QUEUE_IDEMPOTENCY_CONFLICT", `Queue batch ${batchId} was already created from different content.`);
    }
    const plan = buildOrderDraftQueuePlan(recognition, { batchId });
    if (!plan.items.length) {
      return businessError(422, "ORDER_DRAFT_QUEUE_EMPTY", "The conversation contains no order or actionable intent queue items.");
    }

    const plannedItems = await Promise.all(plan.items.map(async (item, index) => {
      const draftId = buildQueueDraftId(batchId, item.queueItemId);
      const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
      return { item, index, draftId, previous };
    }));
    const conflictingItem = plannedItems.find(({ item, previous }) => {
      if (!previous) return false;
      const context = previous.recognitionContext ?? {};
      return context.queueRequestHash !== queueRequestHash || context.queueItemId !== item.queueItemId;
    });
    if (conflictingItem) {
      return businessError(409, "ORDER_DRAFT_QUEUE_IDEMPOTENCY_CONFLICT", `Queue item ${conflictingItem.item.queueItemId} was already created from different content.`);
    }

    const savedItems = [];
    for (const { item, index, draftId, previous } of plannedItems) {
      if (previous) {
        savedItems.push(buildSavedQueueItem(item, previous, workspace));
        continue;
      }

      const scopedRecognition = buildScopedQueueRecognition(recognition, item);
      const customerId = item.customerId || item.rows[0]?.customerId || "";
      const recognitionContext = {
        version: recognition.version,
        queueVersion: plan.version,
        queueBatchId: batchId,
        queueItemId: item.queueItemId,
        queueKind: item.kind,
        queueRequestHash,
        originalOrderGroupId: item.originalOrderGroupId,
        sourceMessages: item.sourceMessages,
        draftGroups: scopedRecognition.draftGroups,
        nonOrderIntents: item.nonOrderIntents,
        temporaryHolds: scopedRecognition.temporaryHolds,
        summary: scopedRecognition.summary,
      };
      const draft = buildDraftProjection(null, {
        id: draftId,
        draftId,
        sourceText: item.sourceText,
        sourceChannel: body.sourceChannel ?? "wechat_group_queue",
        sourceMessageId: item.sourceMessageIds[0] ?? "",
        customerId,
        customerName: findCustomerName(customerWorkspace, customerId),
        status: item.status,
        lines: item.rows,
        recognitionContext,
        revision: 0,
        clientRevision: 0,
        createdBy: operatorId,
      });
      const operationLog = buildOperationLog(workspace, {
        id: buildDraftOperationLogId("queue-recognize", draftId, 1, item.queueItemId),
        targetType: "order_draft",
        targetId: draftId,
        action: "recognize_order_draft_queue_item",
        operatorId,
        after: {
          queueBatchId: batchId,
          queueItemId: item.queueItemId,
          queueKind: item.kind,
          lineCount: item.rows.length,
          sourceMessageIds: item.sourceMessageIds,
        },
      });
      const inventoryIntents = buildInventoryIntentsFromRecognition({
        recognition: scopedRecognition,
        draftId,
        customerId,
        operatorId,
        now,
      });
      const transaction = await workspace.orderDraftRepository.saveOrderDraft({
        workspace,
        draft,
        expectedRevision: 0,
        inventoryIntents,
        todos: [],
        operationLog,
        idempotencyKey: buildQueueItemIdempotencyKey(body.idempotencyKey, batchId, item.queueItemId, index),
        idempotencyPayload: { queueRequestHash, queueItemId: item.queueItemId, operatorId },
      });
      savedItems.push(buildSavedQueueItem(item, transaction.draft, workspace, transaction.inventoryIntents));
    }

    return success({
      queueBatch: {
        version: plan.version,
        batchId,
        queueRequestHash,
        summary: plan.summary,
        unassignedSourceMessages: plan.unassignedSourceMessages,
      },
      drafts: savedItems,
      recognition: {
        version: recognition.version,
        summary: recognition.summary,
      },
    });
  }

  async function saveOrderDraft({ workspace, draftId, body = {}, operatorId }) {
    if(hasInvalidDraftQuantity(body.lines,{allowUnknown:true}))return businessError(422,"ORDER_DRAFT_QUANTITY_INVALID","数量须为大于零的整数；尚未确认时可留空，不能自动取整保存。");
    const lines = normalizeDraftRows(body.lines ?? [], workspace, body, draftId);
    // 2026-11-07：同一请求里重复的临时编号按顺序补号，不丢行、不误拦。
    {
      const seenIds = new Set();
      lines.forEach((line, index) => {
        if (seenIds.has(line.id)) line.id = draftLineIdFor(draftId, index);
        seenIds.add(line.id);
      });
    }
    if (!lines.length) {
      return businessError(422, "VALIDATION_ERROR", "lines must contain at least one draft line");
    }
    const expectedRevision = parseDraftExpectedRevision(body.expectedRevision);
    if (!expectedRevision) {
      return businessError(422, "EXPECTED_REVISION_REQUIRED", "expectedRevision must be a positive integer");
    }
    const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
    if (!previous) return notFound("ORDER_DRAFT_NOT_FOUND");
    if (["已生成正式订单", "已生成多个正式订单", "已确认"].includes(previous.status)) {
      return businessError(409, "ORDER_DRAFT_ALREADY_CONFIRMED", "草稿已生成正式订单，不能重新保存；请从正式订单处理后续变更。");
    }
    if (previous.sourceChannel === "mini_program" && ["sourceChannel", "sourceMessageId", "customerId"].some(key =>
      body[key] !== undefined && String(body[key] ?? "") !== String(previous[key] ?? "")
    )) {
      return businessError(409, "MINIAPP_DRAFT_SOURCE_IMMUTABLE", "小程序草稿的来源渠道、源订单号和客户归属不能通过保存草稿改写。");
    }
    const draft = buildDraftProjection(previous, {
      id: draftId,
      draftId,
      sourceText: body.sourceText ?? previous.sourceText ?? "",
      sourceChannel: body.sourceChannel ?? previous.sourceChannel ?? "manual",
      sourceMessageId: body.sourceMessageId ?? previous.sourceMessageId ?? "",
      customerId: body.customerId ?? previous.customerId ?? lines[0]?.customerId ?? "",
      customerName: findCustomerName(
        workspace,
        body.customerId ?? previous.customerId ?? lines[0]?.customerId,
      ),
      status: body.draftStatus ?? "待审核",
      recognitionContext: { ...previous.recognitionContext, officePriceQuote: null },
      lines,
      revision: expectedRevision,
      clientRevision: expectedRevision,
    });
    const todos = draft.status === "待补充信息" ? [buildDraftTodo(workspace, draft, lines, operatorId)] : [];
    const operationLog = buildOperationLog(workspace, {
      id: buildDraftOperationLogId("save", draftId, expectedRevision + 1, body.idempotencyKey),
      targetType: "order_draft",
      targetId: draftId,
      action: "save_order_draft",
      operatorId,
      before: previous,
      after: summarizeDraft(draft),
      reason: body.saveReason,
    });
    let transaction;
    try {
      transaction = await workspace.orderDraftRepository.saveOrderDraft({
        workspace,
        draft,
        expectedRevision,
        todos,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { ...body, operatorId },
      });
    } catch (error) {
      // 2026-11-07：明细编号若属于别的草稿，数据库会报 23505。
      // 转成明确业务错误；事务整体回滚，不留半条明细，也不把 PG 原文回给前端。
      if (String(error?.code ?? "") === "23505" && String(error?.constraint ?? "").includes("order_draft_lines")) {
        return businessError(409, "ORDER_DRAFT_LINE_ID_OWNED_BY_OTHER_DRAFT",
          "明细编号属于另一张草稿，请重新读取本草稿后核对。");
      }
      throw error;
    }

    return success({
      draft: summarizeDraft(transaction.draft),
      todos: transaction.todos.map(toTodoSummary),
      operationLogId: transaction.operationLogId,
    });
  }

  async function quoteOrderDraftPrice({ workspace, draftId, body = {}, operatorId, actionPermissions = [] }) {
    if (hasInvalidDraftQuantity(body.lines)) return businessError(422, "ORDER_DRAFT_QUANTITY_INVALID", "报价数量须为有效正整数。");
    const expectedRevision = parseDraftExpectedRevision(body.expectedRevision);
    if (!expectedRevision) return businessError(422, "EXPECTED_REVISION_REQUIRED", "请先保存有效草稿版本。");
    const payload = { ...body, operatorId, action: "quote_order_draft_price" };
    const replay = await workspace.orderDraftRepository.readSaveReceipt?.({ workspace, draftId, idempotencyKey: body.idempotencyKey, idempotencyPayload: payload });
    if (replay?.draft?.recognitionContext?.officePriceQuote) return success({ quote: officeQuoteProjection(replay.draft.recognitionContext.officePriceQuote), draft: summarizeDraft(replay.draft), operationLogId: replay.operationLogId });
    const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
    if (!previous) return notFound("ORDER_DRAFT_NOT_FOUND");
    if (Number(previous.revision) !== expectedRevision || /已生成|已确认/u.test(previous.status)) return businessError(409, "ORDER_DRAFT_REVISION_CONFLICT", "草稿已变化，请重新读取后报价。");
    if (["mini_program", "wechat_mini_program"].includes(previous.sourceChannel) || (await workspace.orderDraftRepository.getMiniappConfirmationSources?.({ workspace, draftId }))?.length) return businessError(409, "MINIAPP_PRICE_LOCKED", "小程序已锁定客户报价，办公室不能通过本单价覆盖。");
    const lines = mergeDraftFieldReviewEvidence(normalizeDraftRows(body.lines ?? [], workspace, body, draftId), previous.lines ?? [], operatorId, nowIso(now));
    if (!lines.length) return businessError(422, "ORDER_DRAFT_LINES_REQUIRED", "请先填写订单明细。");
    // 2026-11-07：同一请求里重复的临时编号按顺序补号，不丢行、不误拦报价。
    {
      const seenIds = new Set();
      lines.forEach((line, index) => {
        if (seenIds.has(line.id)) line.id = draftLineIdFor(draftId, index);
        seenIds.add(line.id);
      });
    }
    const cancellation = resolveShortageCancellationApplications(workspace, draftId, lines);
    if (cancellation.error) return cancellation.error;
    if (!cancellation.activeLines.length) return businessError(422, "ORDER_DRAFT_NO_BILLABLE_LINES", "本草稿已无待下单明细，请核对取消记录，不能生成空报价。");
    const reviewError = assertNoPendingFieldReviews(cancellation.activeLines);
    if (reviewError) return reviewError;
    try {
      const quote = await buildOfficeDraftPricingQuote({ workspace, draft: previous, rows: cancellation.activeLines, body, operatorId, actionPermissions, now: nowIso(now) });
      quote.excludedDraftLineIds = cancellation.cancelledDraftLineIds;
      const draft = buildDraftProjection(previous, { id: draftId, draftId, lines: cancellation.lines,
        sourceText: body.sourceText ?? previous.sourceText, recognitionContext: { ...previous.recognitionContext, officePriceQuote: quote },
        revision: expectedRevision, clientRevision: expectedRevision });
      const operationLog = buildOperationLog(workspace, { id: buildDraftOperationLogId("price-quote", draftId, expectedRevision + 1, body.idempotencyKey),
        targetType: "order_draft", targetId: draftId, action: "quote_order_draft_price", operatorId,
        before: { quoteId: previous.recognitionContext?.officePriceQuote?.id ?? null }, after: officeQuoteProjection(quote), reason: "办公室服务端报价与本单价依据" });
      const saved = await workspace.orderDraftRepository.saveOrderDraft({ workspace, draft, expectedRevision, operationLog, todos: [], idempotencyKey: body.idempotencyKey, idempotencyPayload: payload });
      return success({ quote: officeQuoteProjection(quote), draft: summarizeDraft(saved.draft), operationLogId: saved.operationLogId });
    } catch (error) {
      if (!error.statusCode) throw error;
      return { ...businessError(error.statusCode, error.code, error.message), details: { draftId } };
    }
  }

  async function restoreShortageCancelledDraftLine({ workspace, draftId, body = {}, operatorId }) {
    const expectedRevision = parseDraftExpectedRevision(body.expectedRevision);
    if (!expectedRevision) return businessError(422, "EXPECTED_REVISION_REQUIRED", "expectedRevision must be a positive integer");
    const draftLineId = cleanCommandText(body.draftLineId);
    if (!draftLineId) return businessError(422, "VALIDATION_ERROR", "draftLineId is required");
    const reason = cleanCommandText(body.reason);
    if (!reason) return businessError(422, "VALIDATION_ERROR", "reason is required");

    const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
    if (!previous) return notFound("ORDER_DRAFT_NOT_FOUND");
    if (["已生成正式订单", "已生成多个正式订单", "已确认"].includes(previous.status)) {
      return businessError(409, "SHORTAGE_CANCELLATION_RESTORE_AFTER_CONFIRMATION_FORBIDDEN", "A confirmed draft cannot restore a cancelled line; create a new original order instead.");
    }
    const targetLine = (previous.lines ?? []).find((line) => line.id === draftLineId);
    if (!targetLine) return businessError(404, "ORDER_DRAFT_LINE_NOT_FOUND", `Draft line ${draftLineId} was not found.`);

    const matchingIntents = (workspace.inventoryIntents ?? []).filter((intent) =>
      (intent.sourceDraftId === draftId || intent.candidate?.targetDraftId === draftId)
      && intent.intentType === "shortage_cancellation"
      && Array.isArray(intent.candidate?.relatedDraftLineIds)
      && intent.candidate.relatedDraftLineIds.includes(draftLineId),
    );
    if (!matchingIntents.length) {
      return businessError(409, "SHORTAGE_CANCELLATION_NOT_FOUND", `Draft line ${draftLineId} has no active shortage cancellation.`);
    }
    if (matchingIntents.some((intent) => intent.intentStatus === "库存不足取消-已应用")) {
      return businessError(409, "SHORTAGE_CANCELLATION_RESTORE_AFTER_CONFIRMATION_FORBIDDEN", "An applied shortage cancellation cannot be restored; create a new original order instead.");
    }

    const timestamp = nowIso(now);
    const restoredIntents = matchingIntents.map((intent) => {
      const relatedDraftLineIds = intent.candidate.relatedDraftLineIds.filter((lineId) => lineId !== draftLineId);
      const restorationHistory = Array.isArray(intent.candidate?.restorationHistory) ? intent.candidate.restorationHistory : [];
      return {
        ...intent,
        intentStatus: relatedDraftLineIds.length ? "库存不足取消-部分恢复订购" : "库存不足取消-已恢复订购",
        candidate: {
          ...(intent.candidate ?? {}),
          relatedDraftLineIds,
          requiresReview: false,
          restoredDraftLineIds: [...new Set([...(intent.candidate?.restoredDraftLineIds ?? []), draftLineId])],
          restorationHistory: [...restorationHistory, { draftLineId, reason, restoredBy: operatorId, restoredAt: timestamp }],
        },
        revision: Number(intent.revision ?? 1) + 1,
        updatedAt: timestamp,
      };
    });
    const restoredLines = (previous.lines ?? []).map((line) => line.id === draftLineId ? {
      ...line,
      cancellationStatus: "",
      cancellationScope: "",
      cancellationSourceMessageId: "",
      excludedFromConfirmation: false,
      cancellationRestoration: { reason, restoredBy: operatorId, restoredAt: timestamp },
    } : line);
    const draft = buildDraftProjection(previous, {
      id: draftId,
      draftId,
      status: "待审核",
      lines: restoredLines,
      revision: expectedRevision,
      clientRevision: expectedRevision,
    });
    const operationLog = buildOperationLog(workspace, {
      id: buildDraftOperationLogId("shortage-restore", draftId, expectedRevision + 1, body.idempotencyKey),
      targetType: "order_draft",
      targetId: draftId,
      action: "restore_order_draft_shortage_cancellation",
      operatorId,
      before: { status: previous.status, draftLineId, intentIds: matchingIntents.map((intent) => intent.id) },
      after: { status: draft.status, restoredDraftLineId: draftLineId, intentStatuses: restoredIntents.map((intent) => intent.intentStatus) },
      reason,
    });
    try {
      const transaction = await workspace.orderDraftRepository.saveOrderDraft({
        workspace,
        draft,
        expectedRevision,
        inventoryIntents: restoredIntents,
        todos: [],
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { draftId, draftLineId, expectedRevision, reason, operatorId, action: "restore_shortage_cancellation" },
      });
      const savedLine = transaction.draft.lines.find((line) => line.id === draftLineId);
      return success({
        draft: summarizeDraft(transaction.draft),
        line: toRecognizedDraftLine(savedLine),
        inventoryIntents: transaction.inventoryIntents,
        operationLogId: transaction.operationLogId,
      });
    } catch (error) {
      return repositoryCommandError(error);
    }
  }

  async function linkCrossDraftShortageCancellation({ workspace, draftId, body = {}, operatorId }) {
    const expectedRevision = parseDraftExpectedRevision(body.expectedRevision);
    if (!expectedRevision) return businessError(422, "EXPECTED_REVISION_REQUIRED", "expectedRevision must be a positive integer");
    const draftLineId = cleanCommandText(body.draftLineId);
    const intentId = cleanCommandText(body.intentId);
    const reason = cleanCommandText(body.reason);
    if (!draftLineId || !intentId || !reason) {
      return businessError(422, "VALIDATION_ERROR", "intentId, draftLineId and reason are required");
    }
    const targetDraft = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
    if (!targetDraft) return notFound("ORDER_DRAFT_NOT_FOUND");
    if (["已生成正式订单", "已生成多个正式订单", "已确认", "已作废", "库存不足取消"].includes(targetDraft.status)) {
      return businessError(409, "CROSS_DRAFT_CANCELLATION_TARGET_CLOSED", "Cross-draft cancellation can only target an open, unconfirmed draft.");
    }
    const targetLine = (targetDraft.lines ?? []).find((line) => line.id === draftLineId);
    if (!targetLine) return businessError(404, "ORDER_DRAFT_LINE_NOT_FOUND", `Draft line ${draftLineId} was not found.`);
    const intent = (workspace.inventoryIntents ?? []).find((item) => item.id === intentId || item.intentId === intentId);
    if (!intent || intent.intentType !== "shortage_cancellation") {
      return businessError(404, "SHORTAGE_CANCELLATION_NOT_FOUND", `Shortage cancellation ${intentId} was not found.`);
    }
    if (intent.intentStatus === "库存不足取消-已应用" || intent.intentStatus === "库存不足取消-已恢复订购") {
      return businessError(409, "CROSS_DRAFT_CANCELLATION_INTENT_CLOSED", "The shortage cancellation is already closed or applied.");
    }
    const linkedTargetDraftId = cleanCommandText(intent.candidate?.targetDraftId);
    if (linkedTargetDraftId && linkedTargetDraftId !== draftId) {
      return businessError(409, "CROSS_DRAFT_CANCELLATION_ALREADY_LINKED", `The cancellation is already linked to draft ${linkedTargetDraftId}.`);
    }
    const intentCustomerId = cleanCommandText(intent.customerId);
    const targetCustomerId = cleanCommandText(targetLine.customerId || targetDraft.customerId);
    if (!intentCustomerId) {
      return businessError(409, "CROSS_DRAFT_CANCELLATION_CUSTOMER_UNRESOLVED", "The cancellation customer must be resolved before linking.");
    }
    if (!targetCustomerId || intentCustomerId !== targetCustomerId) {
      return businessError(409, "CROSS_DRAFT_CANCELLATION_CUSTOMER_MISMATCH", "The cancellation and target draft belong to different customers.");
    }

    const timestamp = nowIso(now);
    const updatedIntent = {
      ...intent,
      intentStatus: "库存不足取消-已关联跨草稿明细",
      candidate: {
        ...(intent.candidate ?? {}),
        relatedDraftLineIds: [draftLineId],
        targetDraftId: draftId,
        linkedFromDraftId: intent.sourceDraftId,
        requiresReview: false,
        crossDraftLink: { reason, linkedBy: operatorId, linkedAt: timestamp },
      },
      revision: Number(intent.revision ?? 1) + 1,
      updatedAt: timestamp,
    };
    const linkedLines = (targetDraft.lines ?? []).map((line) => line.id === draftLineId ? {
      ...line,
      cancellationStatus: "库存不足取消",
      cancellationScope: intent.cancellationScope || "shortage_lines_only",
      cancellationSourceMessageId: intent.sourceMessageId,
      excludedFromConfirmation: true,
      crossDraftCancellation: {
        sourceIntentId: intent.id,
        sourceDraftId: intent.sourceDraftId,
        reason,
        linkedBy: operatorId,
        linkedAt: timestamp,
      },
    } : line);
    const draft = buildDraftProjection(targetDraft, {
      id: draftId,
      draftId,
      status: "待审核",
      lines: linkedLines,
      revision: expectedRevision,
      clientRevision: expectedRevision,
    });
    const operationLog = buildOperationLog(workspace, {
      id: buildDraftOperationLogId("cross-draft-shortage-link", draftId, expectedRevision + 1, body.idempotencyKey),
      targetType: "order_draft",
      targetId: draftId,
      action: "link_cross_draft_shortage_cancellation",
      operatorId,
      before: { status: targetDraft.status, draftLineId, sourceIntentId: intent.id, sourceDraftId: intent.sourceDraftId },
      after: { status: draft.status, cancelledDraftLineId: draftLineId, targetDraftId: draftId },
      reason,
    });
    try {
      const transaction = await workspace.orderDraftRepository.saveOrderDraft({
        workspace,
        draft,
        expectedRevision,
        inventoryIntents: [updatedIntent],
        todos: [],
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { draftId, draftLineId, intentId, expectedRevision, reason, operatorId, action: "link_cross_draft_shortage_cancellation" },
      });
      return success({
        draft: summarizeDraft(transaction.draft),
        line: toRecognizedDraftLine(transaction.draft.lines.find((line) => line.id === draftLineId)),
        inventoryIntent: transaction.inventoryIntents?.[0] ?? updatedIntent,
        operationLogId: transaction.operationLogId,
      });
    } catch (error) {
      return repositoryCommandError(error);
    }
  }

  async function confirmOrderDraft({ workspace, draftId, body = {}, operatorId, actionPermissions = [] }) {
    let lines = normalizeDraftRows(body.lines ?? [], workspace, body, draftId);
    // 2026-11-07：同一请求里重复的临时编号按顺序补号，不丢行、不误拦。
    {
      const seenIds = new Set();
      lines.forEach((line, index) => {
        if (seenIds.has(line.id)) line.id = draftLineIdFor(draftId, index);
        seenIds.add(line.id);
      });
    }
    if (!lines.length) {
      return businessError(422, "VALIDATION_ERROR", "lines must contain at least one draft line");
    }
    const expectedRevision = parseDraftExpectedRevision(body.expectedRevision);
    if (!expectedRevision) {
      return businessError(422, "EXPECTED_REVISION_REQUIRED", "expectedRevision must be a positive integer");
    }
    if (body.idempotencyKey) {
      const replay = await workspace.orderConfirmationTransactionRepository.findIdempotentReplay?.({
        draftId,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { ...body, operatorId },
      });
      if (replay?.commandResponse) return success(replay.commandResponse);
      const rejected = await workspace.orderDraftRepository.readSaveReceipt?.({ workspace, draftId,
        idempotencyKey: body.idempotencyKey, idempotencyPayload: { ...body, operatorId, action: "blocked_order_confirmation" } });
      if (rejected?.draft?.recognitionContext?.confirmationBlockReason) {
        return { ...businessError(409, "ORDER_DRAFT_BLOCKED", rejected.draft.recognitionContext.confirmationBlockReason),
          details: { draftId, clientRevision: rejected.draft.revision ?? rejected.draft.clientRevision, operationLogId: rejected.operationLogId } };
      }
    }
    if(hasInvalidDraftQuantity(body.lines))return businessError(422,"ORDER_DRAFT_QUANTITY_INVALID","正式订单数量须为大于零的整数，不能自动取整。");
    const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
    if (!previous) return notFound("ORDER_DRAFT_NOT_FOUND");
    if (["已生成正式订单", "已生成多个正式订单", "已确认"].includes(previous.status)) return businessError(409, "ORDER_DRAFT_ALREADY_CONFIRMED", "本草稿已生成正式订单，请在订单池核对，不能再次下单。");
    lines = mergeDraftFieldReviewEvidence(lines, previous.lines ?? [], operatorId, nowIso(now));
    if (["mini_program","wechat_mini_program"].includes(previous.sourceChannel) && body.customerId !== undefined && body.customerId !== previous.customerId) {
      return businessError(409, "MINIAPP_DRAFT_SOURCE_IMMUTABLE", "小程序订单必须按原客户归属确认。");
    }
    const miniappPricing = await loadMiniappDraftLockedPricing(workspace.orderDraftRepository, previous, lines, workspace);
    const resolvedCancellations = resolveShortageCancellationApplications(workspace, draftId, lines);
    if (resolvedCancellations.error) return resolvedCancellations.error;
    // Owner decision 2026-10-29: on a stock shortage the office records the customer's choice.
    const shortage = applyCustomerShortageDecision(workspace, resolvedCancellations, body.shortageDecision);
    if (shortage.error) return shortage.error;
    const cancellationResolution = shortage.resolution;
    if (!cancellationResolution.activeLines.length) {
      return closeFullyCancelledDraft({
        reason: shortage.decision ? shortageDecisionReason(shortage.decision) : undefined,
        shortageDecision: shortage.decision,
        workspace,
        previous,
        draftId,
        body,
        operatorId,
        expectedRevision,
        lines: cancellationResolution.lines,
        cancellationIntents: cancellationResolution.appliedIntents,
      });
    }
    const reviewError = assertNoPendingFieldReviews(cancellationResolution.activeLines);
    if (reviewError) return reviewError;
    const deliveryAddressError = findDeliveryAddressError(workspace, cancellationResolution.activeLines);
    if (deliveryAddressError) return deliveryAddressError;
    const officePriceQuote = previous.recognitionContext?.officePriceQuote;
    if (officePriceQuote || body.pricingQuoteId) {
      try {
        // The quote covers the lines as priced; a shortage decision may only drop some of them.
        assertOfficeQuoteMatches(officePriceQuote, previous, resolvedCancellations.activeLines, body, actionPermissions);
        if (officePriceQuote.relatedRevisions.length) {
          await refreshPrintingConsumptionFacts(workspace);
          const related = officePriceQuote.relatedRevisions.map(row => {
            const line = workspace.orderLines.find(line => (line.id ?? line.orderLineId) === row.orderLineId);
            if (!line) throw Object.assign(new Error("关联原印刷订单已变化，请重新核对。"), {statusCode:409,code:"ORDER_PRINT_SUPPLEMENT_NOT_ELIGIBLE"});
            return {...line, printContent:row.priorPrice.sourceEvidence?.officeQuoteInput?.printContent || line.printContent};
          });
          assertUnstartedPrintingSupplement(workspace, related, previous.customerId);
        }
      }
      catch (error) { return { ...businessError(error.statusCode, error.code, error.message), details: { draftId } }; }
    }
    let publishedPricing;
    if (!miniappPricing && !officePriceQuote && buildOrderPrintingPriceGroups(cancellationResolution.activeLines.map(row => ({ ...row, printingScope: row.originalOrderGroupId || previous.id }))).some(group => group.memberCount > 1)) {
      return businessError(409, "ORDER_PRINT_GROUP_QUOTE_REQUIRED", "同内容同尺寸的多行印刷需先生成合组报价，再确认订单；草稿已保留。");
    }
    if (!miniappPricing && !officePriceQuote) {
      try { publishedPricing = await loadOrderDraftPublishedPricing(workspace, cancellationResolution.activeLines, now()); }
      catch (error) {
        if (error.code !== "ORDER_PRICE_SOURCE_REQUIRED") throw error;
        return { ...businessError(error.statusCode, error.code, error.message), details: { draftId } };
      }
    }
    const holdResolution = resolveTemporaryHoldConversions(workspace, cancellationResolution.activeLines);
    if (holdResolution.error) return holdResolution.error;
    const confirmation = confirmDraftOrder({
      draftRows: cancellationResolution.activeLines,
      resolveAmount: row => officePriceQuote ? officePriceQuote.linePrices.find(price => price.draftLineId === row.id)?.finalAmount : (miniappPricing ?? publishedPricing).prices.get(row.id)?.amount,
      inventoryRecords: buildHoldAwareInventory(workspace.inventories, holdResolution.byHoldId),
      orderLines: workspace.orderLines,
      fulfillments: workspace.fulfillments,
      customers: workspace.customers,
    });
    applyMiniappDraftLockedPricing(confirmation, miniappPricing);
    applyOrderDraftPublishedPricing(confirmation, publishedPricing);
    applyOfficePricingQuote(confirmation, officePriceQuote);
    if (confirmation.blocked) {
      const blockedDraft = buildDraftProjection(previous, {
        id: draftId,
        draftId,
        sourceText: body.sourceText ?? previous.sourceText ?? "",
        customerId: body.customerId ?? previous.customerId ?? lines[0]?.customerId ?? "",
        customerName: findCustomerName(
          workspace,
          body.customerId ?? previous.customerId ?? lines[0]?.customerId,
        ),
        status: confirmation.draftStatus,
        recognitionContext: { ...previous.recognitionContext, confirmationBlockReason: confirmation.toast },
        lines: mergeDraftLineChecks(cancellationResolution.lines, confirmation.checkedRows),
        revision: expectedRevision,
        clientRevision: expectedRevision,
      });
      const operationLog = buildOperationLog(workspace, {
        id: buildDraftOperationLogId("blocked", draftId, expectedRevision + 1, body.idempotencyKey),
        targetType: "order_draft",
        targetId: draftId,
        action: "block_order_draft_confirmation",
        operatorId,
        before: summarizeDraft(previous),
        after: summarizeDraft(blockedDraft),
        reason: confirmation.toast,
      });
      const saved = await workspace.orderDraftRepository.saveOrderDraft({
        workspace,
        draft: blockedDraft,
        expectedRevision,
        todos: [],
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { ...body, operatorId, action: "blocked_order_confirmation" },
      });
      return { ...businessError(409, "ORDER_DRAFT_BLOCKED", confirmation.toast), details: { draftId, clientRevision: saved.draft.revision ?? saved.draft.clientRevision, operationLogId: saved.operationLogId } };
    }

    const confirmedDraft = buildDraftProjection(previous, {
      id: draftId,
      draftId,
      sourceText: body.sourceText ?? previous.sourceText ?? "",
      customerId: body.customerId ?? previous.customerId ?? lines[0]?.customerId ?? "",
      customerName: findCustomerName(
        workspace,
        body.customerId ?? previous.customerId ?? lines[0]?.customerId,
      ),
      status: confirmation.draftStatus,
      lines: mergeDraftLineChecks(cancellationResolution.lines, confirmation.checkedRows),
      generatedOrderNo: confirmation.orderNo,
      ...(shortage.decision ? { recognitionContext: { ...previous.recognitionContext, shortageDecision: shortage.decision } } : {}),
      revision: expectedRevision,
      clientRevision: expectedRevision,
    });
    const operationLog = buildOperationLog(workspace, {
      id: buildDraftOperationLogId("confirm", draftId, expectedRevision + 1, body.idempotencyKey),
      targetType: "order_draft",
      targetId: draftId,
      action: "confirm_order_draft",
      operatorId,
      after: {
        orderNo: confirmation.orderNo,
        lineCount: confirmation.newLines.length,
        cancelledDraftLineIds: cancellationResolution.cancelledDraftLineIds,
        ...(shortage.decision ? { shortageDecision: shortage.decision } : {}),
      },
      ...(shortage.decision ? { reason: shortageDecisionReason(shortage.decision) } : {}),
    });
    const priceSnapshots = confirmation.newLines.map((line) => ({
      ...toPriceSnapshot(line),
      ...line.confirmedMiniappPrice,
      ...line.confirmedPublishedPrice,
      ...line.confirmedOfficePrice,
      priceSnapshotId: `PS-${line.id}`,
      snapshotType: "order_confirm",
      versionNo: 1,
      chargeableQty: line.confirmedOfficePrice?.chargeableQty ?? Number(line.qty ?? 0),
      finalAmount: Number(line.amount ?? 0),
      createdBy: operatorId,
    }));
    try {
      assertOrderConfirmationPriceSources({ orderLines: confirmation.newLines, priceSnapshots, miniappPriceSource: miniappPricing?.source, publishedPriceSource: publishedPricing?.source, officePriceQuote });
    } catch (error) {
      return { ...businessError(error.statusCode, error.code, error.message), details: { ...error.details, draftId } };
    }
    const productionTasks = buildProductionTasks(confirmation.newLines, operatorId);
    const inventoryReservations = buildInventoryReservations(
      workspace,
      confirmation.checkedRows,
      confirmation.newLines,
      operatorId,
      holdResolution.byHoldId,
    );
    const inventoryLedgerEntries = buildInventoryLedgerEntries(
      workspace,
      inventoryReservations,
      operatorId,
    );
    const todos = buildConfirmationTodos(workspace, pricingReviewTodos(confirmation.shortageTodoInputs, officePriceQuote), operatorId, confirmation.newLines);
    const commandResponse = {
      orderId: confirmation.orderNo,
      orderSummaryStatus: "处理中",
      orderLines: confirmation.newLines.map(toOrderLineSummary),
      productionTasks: productionTasks,
      priceSnapshots: priceSnapshots.map(snapshot => ({ ...snapshot, amount: snapshot.finalAmount })),
      inventoryChecks: confirmation.checkedRows.map((line, index) =>
        toInventoryCheckResult(workspace, line, confirmation.newLines[index]),
      ),
      reservations: inventoryReservations.map(toInventoryReservationTransactionSummary),
      convertedTemporaryHoldIds: inventoryReservations
        .filter((reservation) => reservation.convertFromTemporaryHold)
        .map((reservation) => reservation.reservationId),
      cancelledDraftLineIds: cancellationResolution.cancelledDraftLineIds,
      appliedShortageCancellationIntentIds: cancellationResolution.appliedIntents.map((intent) => intent.id),
      closedWithoutOrder: false,
      fulfillmentTasks: confirmation.newFulfillments.map(toFulfillmentTaskSummary),
      todos: todos.map(toTodoSummary),
      operationLogIds: [operationLog.id],
    };
    const transaction = await workspace.orderConfirmationTransactionRepository.confirmOrder({
      workspace,
      commandResponse,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      orderDraft: confirmedDraft,
      miniappPriceSource: miniappPricing?.source,
      publishedPriceSource: publishedPricing?.source,
      officePriceQuote,
      expectedDraftRevision: expectedRevision,
      order: buildConfirmedOrderRecord(workspace, draftId, confirmation, body, operatorId),
      orderLines: confirmation.newLines.map((line) => ({ ...line, createdBy: operatorId })),
      productionTasks,
      priceSnapshots,
      fulfillmentRecords: confirmation.newFulfillments.map((fulfillment) => ({
        ...fulfillment,
        expectedQty: fulfillment.qty,
        createdBy: operatorId,
        customerSnapshot: buildFulfillmentCustomerSnapshot(workspace, fulfillment, confirmation.newLines),
      })),
      inventoryReservations,
      inventoryLedgerEntries,
      todos,
      shortageCancellationIntents: buildAppliedShortageCancellationIntents(
        cancellationResolution.appliedIntents,
        cancellationResolution.cancelledDraftLineIds,
        cancellationResolution.activeLines.map((line) => line.id),
        confirmation.orderNo,
      ),
      operationLog,
    });

    return success(transaction.commandResponse ?? commandResponse);
  }

  async function previewOrderDraftInventory({ workspace, draftId, body = {} }) {
    if (workspace.coreWorkspaceReadRepository?.kind === "postgres") {
      const state = await workspace.coreWorkspaceReadRepository.loadState();
      workspace = { ...workspace, inventories: state.inventories, inventoryReservations: state.inventoryReservations,
        orderLines: state.orderLines, fulfillments: state.fulfillments, customers: state.customers };
    }
    const expectedRevision = parseDraftExpectedRevision(body.expectedRevision);
    if (!expectedRevision) return businessError(422, "EXPECTED_REVISION_REQUIRED", "请先保存有效草稿版本。");
    const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
    if (!previous) return notFound("ORDER_DRAFT_NOT_FOUND");
    if (Number(previous.revision ?? previous.clientRevision) !== expectedRevision) return businessError(409, "ORDER_DRAFT_REVISION_CONFLICT", "草稿已更新，请重新读取后校验。");
    const lines = normalizeDraftRows(body.lines ?? [], workspace, body, draftId);
    // 2026-11-07：同一请求里重复的临时编号按顺序补号，不丢行、不误拦。
    {
      const seenIds = new Set();
      lines.forEach((line, index) => {
        if (seenIds.has(line.id)) line.id = draftLineIdFor(draftId, index);
        seenIds.add(line.id);
      });
    }
    if (!lines.length || lines.some(line => !Number.isSafeInteger(line.qty) || line.qty <= 0)) return businessError(422, "VALIDATION_ERROR", "请填写有效的正整数数量。");
    const holdResolution = resolveTemporaryHoldConversions(workspace, lines);
    if (holdResolution.error) return holdResolution.error;
    const result = confirmDraftOrder({ draftRows: lines,
      inventoryRecords: buildHoldAwareInventory(workspace.inventories, holdResolution.byHoldId),
      orderLines: workspace.orderLines, fulfillments: workspace.fulfillments, customers: workspace.customers });
    return success({ draftId, revision: expectedRevision, checkedAt: nowIso(now),
      checks: result.checkedRows.map(line => ({ draftLineId: line.id, inventory: line.inventory })) });
  }

  async function previewOrderDraftSplit({ workspace, draftId, body = {} }) {
    const lines = normalizeDraftRows(body.lines ?? [], workspace, body, draftId);
    // 2026-11-07：同一请求里重复的临时编号按顺序补号，不丢行、不误拦。
    {
      const seenIds = new Set();
      lines.forEach((line, index) => {
        if (seenIds.has(line.id)) line.id = draftLineIdFor(draftId, index);
        seenIds.add(line.id);
      });
    }
    if (!lines.length) return businessError(422, "VALIDATION_ERROR", "lines must contain at least one draft line");
    const expectedRevision = parseDraftExpectedRevision(body.expectedRevision);
    if (!expectedRevision) return businessError(422, "EXPECTED_REVISION_REQUIRED", "expectedRevision must be a positive integer");
    const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
    if (!previous) return notFound("ORDER_DRAFT_NOT_FOUND");
    if (Number(previous.revision ?? previous.clientRevision) !== expectedRevision) {
      return businessError(409, "ORDER_DRAFT_REVISION_CONFLICT", "The draft changed before split preview.");
    }
    const cancellationResolution = resolveShortageCancellationApplications(workspace, draftId, lines);
    if (cancellationResolution.error) return cancellationResolution.error;
    const splitPlan = buildOrderDraftSplitPlan({
      draftId,
      revision: expectedRevision,
      lines: cancellationResolution.lines,
    });
    return success({ splitPlan });
  }

  async function confirmSplitOrderDraft({ workspace, draftId, body = {}, operatorId, actionPermissions = [] }) {
    let lines = normalizeDraftRows(body.lines ?? [], workspace, body, draftId);
    // 2026-11-07：同一请求里重复的临时编号按顺序补号，不丢行、不误拦。
    {
      const seenIds = new Set();
      lines.forEach((line, index) => {
        if (seenIds.has(line.id)) line.id = draftLineIdFor(draftId, index);
        seenIds.add(line.id);
      });
    }
    if (!lines.length) return businessError(422, "VALIDATION_ERROR", "lines must contain at least one draft line");
    const expectedRevision = parseDraftExpectedRevision(body.expectedRevision);
    if (!expectedRevision) return businessError(422, "EXPECTED_REVISION_REQUIRED", "expectedRevision must be a positive integer");
    const idempotencyPayload = {
      ...body,
      operatorId,
      action: "confirm_split_order_draft",
    };
    if (body.idempotencyKey) {
      const replay = await workspace.orderConfirmationTransactionRepository.findIdempotentReplay?.({
        draftId,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload,
      });
      if (replay?.commandResponse) return success(replay.commandResponse);
    }
    if(hasInvalidDraftQuantity(body.lines))return businessError(422,"ORDER_DRAFT_QUANTITY_INVALID","正式订单数量须为大于零的整数，不能自动取整。");
    const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
    if (!previous) return notFound("ORDER_DRAFT_NOT_FOUND");
    if (["已生成正式订单", "已生成多个正式订单", "已确认"].includes(previous.status)) return businessError(409, "ORDER_DRAFT_ALREADY_CONFIRMED", "本草稿已生成正式订单，请在订单池核对，不能再次下单。");
    if (Number(previous.revision ?? previous.clientRevision) !== expectedRevision) {
      return businessError(409, "ORDER_DRAFT_REVISION_CONFLICT", "The draft changed before split confirmation.");
    }
    lines = mergeDraftFieldReviewEvidence(lines, previous.lines ?? [], operatorId, nowIso(now));
    if (["mini_program","wechat_mini_program"].includes(previous.sourceChannel) && body.customerId !== undefined && body.customerId !== previous.customerId) {
      return businessError(409, "MINIAPP_DRAFT_SOURCE_IMMUTABLE", "小程序订单必须按原客户归属确认。");
    }
    const miniappPricing = await loadMiniappDraftLockedPricing(workspace.orderDraftRepository, previous, lines, workspace);
    const resolvedCancellations = resolveShortageCancellationApplications(workspace, draftId, lines);
    if (resolvedCancellations.error) return resolvedCancellations.error;
    // Owner decision 2026-10-29: the customer's shortage choice applies to split confirmation too.
    const shortage = applyCustomerShortageDecision(workspace, resolvedCancellations, body.shortageDecision);
    if (shortage.error) return shortage.error;
    const cancellationResolution = shortage.resolution;
    if (!cancellationResolution.activeLines.length) {
      return closeFullyCancelledDraft({
        reason: shortage.decision ? shortageDecisionReason(shortage.decision) : undefined,
        shortageDecision: shortage.decision,
        workspace,
        previous,
        draftId,
        body,
        operatorId,
        expectedRevision,
        lines: cancellationResolution.lines,
        cancellationIntents: cancellationResolution.appliedIntents,
      });
    }
    const reviewError = assertNoPendingFieldReviews(resolvedCancellations.activeLines);
    if (reviewError) return reviewError;
    const deliveryAddressError = findDeliveryAddressError(workspace, cancellationResolution.activeLines);
    if (deliveryAddressError) return deliveryAddressError;
    const officePriceQuote = previous.recognitionContext?.officePriceQuote;
    if (officePriceQuote || body.pricingQuoteId) {
      try {
        // The quote covers the lines as quoted, before the customer's shortage choice dropped any.
        assertOfficeQuoteMatches(officePriceQuote, previous, resolvedCancellations.activeLines, body, actionPermissions);
        if (officePriceQuote.relatedRevisions.length) {
          await refreshPrintingConsumptionFacts(workspace);
          const related = officePriceQuote.relatedRevisions.map(row => {
            const line = workspace.orderLines.find(line => (line.id ?? line.orderLineId) === row.orderLineId);
            if (!line) throw Object.assign(new Error("关联原印刷订单已变化，请重新核对。"), {statusCode:409,code:"ORDER_PRINT_SUPPLEMENT_NOT_ELIGIBLE"});
            return {...line, printContent:row.priorPrice.sourceEvidence?.officeQuoteInput?.printContent || line.printContent};
          });
          assertUnstartedPrintingSupplement(workspace, related, previous.customerId);
        }
      }
      catch (error) { return { ...businessError(error.statusCode, error.code, error.message), details: { draftId } }; }
    }
    let publishedPricing;
    if (!miniappPricing && !officePriceQuote && buildOrderPrintingPriceGroups(cancellationResolution.activeLines.map(row => ({ ...row, printingScope: row.originalOrderGroupId || previous.id }))).some(group => group.memberCount > 1)) {
      return businessError(409, "ORDER_PRINT_GROUP_QUOTE_REQUIRED", "同内容同尺寸的多行印刷需先生成合组报价，再确认订单；草稿已保留。");
    }
    if (!miniappPricing && !officePriceQuote) {
      try { publishedPricing = await loadOrderDraftPublishedPricing(workspace, cancellationResolution.activeLines, now()); }
      catch (error) {
        if (error.code !== "ORDER_PRICE_SOURCE_REQUIRED") throw error;
        return { ...businessError(error.statusCode, error.code, error.message), details: { draftId } };
      }
    }
    // The office reviewed the plan before the shortage choice; check that plan, then run the
    // plan for the lines the customer still wants.
    const reviewedSplitPlan = buildOrderDraftSplitPlan({
      draftId,
      revision: expectedRevision,
      lines: resolvedCancellations.lines,
    });
    const splitPlanError = assertOrderDraftSplitPlan(reviewedSplitPlan, body.splitPlanHash);
    if (splitPlanError) return splitPlanError;
    const splitPlan = shortage.resolution === resolvedCancellations
      ? reviewedSplitPlan
      : { ...buildOrderDraftSplitPlan({ draftId, revision: expectedRevision, lines: cancellationResolution.lines }), planHash: reviewedSplitPlan.planHash };
    const holdResolution = resolveTemporaryHoldConversions(workspace, cancellationResolution.activeLines);
    if (holdResolution.error) return holdResolution.error;

    const linesById = new Map(cancellationResolution.activeLines.map((line) => [line.id, line]));
    const confirmations = [];
    const rollingOrderNumberRows = [...(workspace.orderLines ?? [])];
    const rollingFulfillments = [...(workspace.fulfillments ?? [])];
    for (const group of splitPlan.groups) {
      const groupLines = group.draftLineIds.map((lineId) => linesById.get(lineId)).filter(Boolean);
      const confirmation = confirmDraftOrder({
        draftRows: groupLines,
        resolveAmount: row => officePriceQuote ? officePriceQuote.linePrices.find(price => price.draftLineId === row.id)?.finalAmount : (miniappPricing ?? publishedPricing).prices.get(row.id)?.amount,
        inventoryRecords: buildHoldAwareInventory(workspace.inventories, holdResolution.byHoldId),
        orderLines: rollingOrderNumberRows,
        fulfillments: rollingFulfillments,
        customers: workspace.customers,
      });
      applyMiniappDraftLockedPricing(confirmation, miniappPricing);
      applyOrderDraftPublishedPricing(confirmation, publishedPricing);
      applyOfficePricingQuote(confirmation, officePriceQuote);
      if (confirmation.blocked) {
        return businessError(409, "ORDER_DRAFT_SPLIT_GROUP_BLOCKED", `${group.groupId}: ${confirmation.toast}`);
      }
      confirmations.push({ group, confirmation });
      rollingOrderNumberRows.push({ id: confirmation.orderNo, orderNo: confirmation.orderNo });
      rollingFulfillments.push(...confirmation.newFulfillments);
    }

    const checkedRows = confirmations.flatMap((item) => item.confirmation.checkedRows);
    const newLines = confirmations.flatMap((item) => item.confirmation.newLines);
    const newFulfillments = confirmations.flatMap((item) => item.confirmation.newFulfillments);
    const orderNos = confirmations.map((item) => item.confirmation.orderNo);
    const confirmedDraft = buildDraftProjection(previous, {
      id: draftId,
      draftId,
      sourceText: body.sourceText ?? previous.sourceText ?? "",
      customerId: body.customerId ?? previous.customerId ?? lines[0]?.customerId ?? "",
      customerName: findCustomerName(workspace, body.customerId ?? previous.customerId ?? lines[0]?.customerId),
      status: "已生成多个正式订单",
      lines: mergeDraftLineChecks(cancellationResolution.lines, checkedRows),
      generatedOrderNo: orderNos[0],
      generatedOrderNos: orderNos,
      splitPlanHash: splitPlan.planHash,
      revision: expectedRevision,
      ...(shortage.decision ? { recognitionContext: { ...(previous.recognitionContext ?? {}), shortageDecision: shortage.decision } } : {}),
      clientRevision: expectedRevision,
    });
    const operationLog = buildOperationLog(workspace, {
      id: buildDraftOperationLogId("split-confirm", draftId, expectedRevision + 1, body.idempotencyKey),
      targetType: "order_draft",
      targetId: draftId,
      action: "confirm_split_order_draft",
      operatorId,
      before: summarizeDraft(previous),
      after: {
        orderNos,
        splitPlanHash: splitPlan.planHash,
        groupCount: splitPlan.groups.length,
        lineCount: newLines.length,
        cancelledDraftLineIds: cancellationResolution.cancelledDraftLineIds,
        shortageDecision: shortage.decision,
      },
      ...(shortage.decision ? { reason: shortageDecisionReason(shortage.decision) } : {}),
    });
    const orders = confirmations.map(({ confirmation }) =>
      buildConfirmedOrderRecord(workspace, draftId, confirmation, body, operatorId));
    const priceSnapshots = newLines.map((line) => ({
      ...toPriceSnapshot(line),
      ...line.confirmedMiniappPrice,
      ...line.confirmedPublishedPrice,
      ...line.confirmedOfficePrice,
      priceSnapshotId: `PS-${line.id}`,
      snapshotType: "order_confirm",
      versionNo: 1,
      chargeableQty: line.confirmedOfficePrice?.chargeableQty ?? Number(line.qty ?? 0),
      finalAmount: Number(line.amount ?? 0),
      createdBy: operatorId,
    }));
    try {
      assertOrderConfirmationPriceSources({ orderLines: newLines, priceSnapshots, miniappPriceSource: miniappPricing?.source, publishedPriceSource: publishedPricing?.source, officePriceQuote });
    } catch (error) {
      return { ...businessError(error.statusCode, error.code, error.message), details: { ...error.details, draftId } };
    }
    const productionTasks = buildProductionTasks(newLines, operatorId);
    const inventoryReservations = buildInventoryReservations(
      workspace,
      checkedRows,
      newLines,
      operatorId,
      holdResolution.byHoldId,
    );
    const todos = buildConfirmationTodos(
      workspace,
      pricingReviewTodos(confirmations.flatMap((item) => item.confirmation.shortageTodoInputs), officePriceQuote),
      operatorId,
      newLines,
    );
    const commandResponse = {
      orderId: orders[0]?.orderId ?? "",
      orderIds: orders.map((order) => order.orderId),
      orderSummaryStatus: "处理中",
      splitConfirmed: true,
      splitPlan,
      orderLines: newLines.map(toOrderLineSummary),
      productionTasks,
      priceSnapshots: priceSnapshots.map(snapshot => ({ ...snapshot, amount: snapshot.finalAmount })),
      inventoryChecks: checkedRows.map((line, index) => toInventoryCheckResult(workspace, line, newLines[index])),
      reservations: inventoryReservations.map(toInventoryReservationTransactionSummary),
      convertedTemporaryHoldIds: inventoryReservations
        .filter((reservation) => reservation.convertFromTemporaryHold)
        .map((reservation) => reservation.reservationId),
      cancelledDraftLineIds: cancellationResolution.cancelledDraftLineIds,
      appliedShortageCancellationIntentIds: cancellationResolution.appliedIntents.map((intent) => intent.id),
      closedWithoutOrder: false,
      fulfillmentTasks: newFulfillments.map(toFulfillmentTaskSummary),
      todos: todos.map(toTodoSummary),
      operationLogIds: [operationLog.id],
    };
    const transaction = await workspace.orderConfirmationTransactionRepository.confirmOrder({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload,
      orderDraft: confirmedDraft,
      miniappPriceSource: miniappPricing?.source,
      publishedPriceSource: publishedPricing?.source,
      officePriceQuote,
      expectedDraftRevision: expectedRevision,
      order: orders[0],
      orders,
      orderLines: newLines.map((line) => ({ ...line, createdBy: operatorId })),
      productionTasks,
      priceSnapshots,
      fulfillmentRecords: newFulfillments.map((fulfillment) => ({
        ...fulfillment,
        expectedQty: fulfillment.qty,
        createdBy: operatorId,
        customerSnapshot: buildFulfillmentCustomerSnapshot(workspace, fulfillment, newLines),
      })),
      inventoryReservations,
      inventoryLedgerEntries: buildInventoryLedgerEntries(workspace, inventoryReservations, operatorId),
      todos,
      shortageCancellationIntents: buildAppliedShortageCancellationIntents(
        cancellationResolution.appliedIntents,
        cancellationResolution.cancelledDraftLineIds,
        cancellationResolution.activeLines.map((line) => line.id),
        orderNos,
      ),
      operationLog,
      commandResponse,
    });

    return success(transaction.commandResponse ?? commandResponse);
  }

  async function closeFullyCancelledDraft({
    workspace,
    previous,
    draftId,
    body,
    operatorId,
    expectedRevision,
    lines,
    cancellationIntents,
    reason,
    shortageDecision = null,
  }) {
    const cancelledDraft = buildDraftProjection(previous, {
      id: draftId,
      draftId,
      sourceText: body.sourceText ?? previous.sourceText ?? "",
      customerId: body.customerId ?? previous.customerId ?? lines[0]?.customerId ?? "",
      customerName: findCustomerName(workspace, body.customerId ?? previous.customerId ?? lines[0]?.customerId),
      status: "库存不足取消",
      lines,
      revision: expectedRevision,
      clientRevision: expectedRevision,
    });
    const appliedIntents = buildAppliedShortageCancellationIntents(
      cancellationIntents,
      lines.map((line) => line.id),
      [],
      "",
    );
    const operationLog = buildOperationLog(workspace, {
      id: buildDraftOperationLogId("shortage-cancel", draftId, expectedRevision + 1, body.idempotencyKey),
      targetType: "order_draft",
      targetId: draftId,
      action: "close_order_draft_shortage_cancellation",
      operatorId,
      before: summarizeDraft(previous),
      after: { status: "库存不足取消", cancelledDraftLineIds: lines.map((line) => line.id), ...(shortageDecision ? { shortageDecision } : {}) },
      reason: reason || "客户明确取消全部缺货/整单明细",
    });
    const transaction = await workspace.orderDraftRepository.saveOrderDraft({
      workspace,
      draft: cancelledDraft,
      expectedRevision,
      inventoryIntents: appliedIntents,
      todos: [],
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId, action: "close_shortage_cancelled_draft" },
    });
    return success({
      orderId: "",
      orderSummaryStatus: "库存不足取消",
      orderLines: [],
      productionTasks: [],
      priceSnapshots: [],
      inventoryChecks: [],
      reservations: [],
      convertedTemporaryHoldIds: [],
      cancelledDraftLineIds: lines.map((line) => line.id),
      appliedShortageCancellationIntentIds: appliedIntents.map((intent) => intent.id),
      closedWithoutOrder: true,
      fulfillmentTasks: [],
      todos: [],
      operationLogIds: [transaction.operationLogId],
    });
  }

  function buildSavedQueueItem(item, draft, workspace, persistedInventoryIntents = []) {
    const inventoryIntents = persistedInventoryIntents.length
      ? persistedInventoryIntents
      : (workspace.inventoryIntents ?? []).filter((intent) => intent.sourceDraftId === draft.id);
    return {
      queueItemId: item.queueItemId,
      kind: item.kind,
      status: draft.status,
      requiresReview: item.requiresReview,
      excludedFromFormalOrder: item.excludedFromFormalOrder,
      sourceMessageIds: item.sourceMessageIds,
      originalOrderGroupId: item.originalOrderGroupId,
      draft: summarizeDraft(draft),
      lines: (draft.lines ?? []).map(toRecognizedDraftLine),
      inventoryIntents,
    };
  }

  function buildDraftProjection(previous, draft) {
    const timestamp = nowIso(now);
    return {
      ...(previous ?? {}),
      ...draft,
      createdAt: previous?.createdAt ?? draft.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
  }

  function normalizeDraftRows(lines, workspace, body, draftId = "") {
    return lines.map((line, index) => {
      const customerId = line.customerId ?? body.customerId ?? "";
      const printFlag = line.printFlag ?? line.print === "是";
      return {
        // 明细主键必须全局唯一：固定 DRAFT-LINE-N 会让第二张草稿撞上一张的主键。
        // 2026-11-07：客户端带来的编号可能属于别的草稿（手工复制/误用）。
        // 只保留本草稿自己的编号，其余一律重新归属，避免撞库级主键；
        // 同一草稿同序号的编号是稳定的，所以保存/重试不会改号。
        // 2026-11-07：已有编号一律原样保留（历史/批量/识别编号都不能改），
        // 只有没有编号的新行才分配草稿内编号；空串按"没有编号"处理。
        id: cleanCommandText(line.draftLineId ?? line.id) || draftLineIdFor(draftId, index),
        customerId,
        customer: line.customer ?? findCustomerName(workspace, customerId) ?? "待确认客户",
        product: line.productName ?? line.product ?? "",
        orderType: normalizeOrderType(line.orderType ?? line.productType),
        size: line.size ?? "待确认",
        color: line.bagColor ?? line.color ?? "待确认",
        handle: line.handleType ?? line.handle ?? "普通提",
        style: line.style ?? "空白袋",
        print: printFlag ? "是" : "否",
        qty: ["number", "string"].includes(typeof line.qty) ? Number(line.qty) : 0,
        ...normalizeDraftQtyBasis(line),
        ...(line.printMethod ? { printMethod: String(line.printMethod) } : {}),
        ...(String(line.deliveryAddressId ?? "").trim() ? { deliveryAddressId: String(line.deliveryAddressId).trim() } : {}),
        ...(String(line.deliveryAddress ?? "").trim() ? { deliveryAddress: String(line.deliveryAddress).replace(/\s+/gu, " ").trim() } : {}),
        ...(Number.isSafeInteger(Number(line.printColorCount)) && Number(line.printColorCount) >= 1 ? { printColorCount: Number(line.printColorCount) } : {}),
        fulfillment: line.fulfillmentMethod ?? line.fulfillment ?? "待确认",
        latest: line.latestNeededAt ?? line.latest ?? "待确认",
        printColor: line.printColor ?? (printFlag ? "待确认" : "非印刷"),
        printContent: String(line.printContent ?? "").trim(),
        specialRequirements: Array.isArray(line.specialRequirements) ? [...new Set(line.specialRequirements.map(String))].sort() : [],
        printSide: mapPrintSide(line.printSide),
        artworkStatus: mapArtworkStatus(line.artworkStatus, printFlag),
        artworkAttachment: normalizeArtworkAttachment(line.artworkAttachment),
        handleColor: line.handleColor ?? "",
        note: line.officeNote ?? line.customerNote ?? line.note ?? "",
        source: body.sourceText ?? line.source ?? "",
        inventory: line.inventory ?? "",
        confidence: line.confidence ?? "",
        amount: line.estimatedAmount ?? line.amount ?? 0,
        originalOrderGroupId: line.originalOrderGroupId ?? line.recognitionEvidence?.originalOrderGroupId ?? "",
        intentType: line.intentType ?? line.recognitionEvidence?.intentType ?? "explicit_order",
        appendDecision: line.appendDecision ?? line.recognitionEvidence?.appendDecision ?? "",
        sourceMessageId: line.sourceMessageId ?? line.recognitionEvidence?.sourceMessageId ?? "",
        sourceSender: line.sourceSender ?? line.recognitionEvidence?.sourceSender ?? "",
        sourceSenderRole: line.sourceSenderRole ?? line.recognitionEvidence?.sourceSenderRole ?? "",
        sourceSentAt: line.sourceSentAt ?? line.recognitionEvidence?.sourceSentAt ?? "",
        sourceSequence: line.sourceSequence ?? line.recognitionEvidence?.sourceSequence ?? 0,
        sourceConversationId: line.sourceConversationId ?? line.recognitionEvidence?.sourceConversationId ?? "",
        reviewReasons: line.reviewReasons ?? line.recognitionEvidence?.reviewReasons ?? [],
        fieldReviews: line.fieldReviews ?? line.recognitionEvidence?.fieldReviews ?? [],
        dimensionEvidence: line.dimensionEvidence ?? line.recognitionEvidence?.dimensionEvidence,
        aliasEvidence: line.aliasEvidence ?? line.recognitionEvidence?.aliasEvidence,
        sourceHoldId: line.sourceHoldId ?? line.recognitionEvidence?.sourceHoldId ?? "",
        sourceIntentId: line.sourceIntentId ?? line.recognitionEvidence?.sourceIntentId ?? "",
        cancellationStatus: line.cancellationStatus ?? line.recognitionEvidence?.cancellationStatus ?? "",
        cancellationScope: line.cancellationScope ?? line.recognitionEvidence?.cancellationScope ?? "",
        cancellationSourceMessageId: line.cancellationSourceMessageId ?? line.recognitionEvidence?.cancellationSourceMessageId ?? "",
        cancellationRestoration: line.cancellationRestoration ?? line.recognitionEvidence?.cancellationRestoration,
        crossDraftCancellation: line.crossDraftCancellation ?? line.recognitionEvidence?.crossDraftCancellation,
        excludedFromConfirmation: line.excludedFromConfirmation === true
          || line.recognitionEvidence?.excludedFromConfirmation === true,
      };
    });
  }

  function toRecognizedDraftLine(row) {
    return {
      draftLineId: row.id,
      customerId: row.customerId,
      customerName: row.customer,
      productName: row.product,
      orderType: row.orderType,
      size: row.size,
      bagColor: row.color,
      handleType: row.handle,
      handleColor: row.handleColor,
      style: row.style,
      qty: row.qty,
      ...(row.qtyBasis ? { qtyBasis: row.qtyBasis, incomingRollCount: row.incomingRollCount } : {}),
      ...(row.printMethod ? { printMethod: row.printMethod } : {}),
      ...(row.deliveryAddressId ? { deliveryAddressId: row.deliveryAddressId } : {}),
      ...(row.deliveryAddress ? { deliveryAddress: row.deliveryAddress } : {}),
      ...(row.printColorCount ? { printColorCount: row.printColorCount } : {}),
      fulfillmentMethod: row.fulfillment,
      latestNeededAt: row.latest,
      printFlag: row.print === "是",
      printColor: row.printColor,
      printSide: mapPrintSide(row.printSide),
      artworkStatus: mapArtworkStatus(row.artworkStatus, row.print === "是"),
      artworkAttachment: normalizeArtworkAttachment(row.artworkAttachment),
      customerNote: row.note,
      officeNote: "",
      recognitionStatus:
        row.confidence === "high"
          ? "high_confidence"
          : row.confidence === "low"
            ? "low_confidence"
            : "medium_confidence",
      missingFields: getMissingDraftFields(row),
      recognitionEvidence: {
        sourceText: row.source,
        sourceMessageId: row.sourceMessageId ?? "",
        sourceSender: row.sourceSender ?? "",
        sourceSenderRole: row.sourceSenderRole ?? "",
        sourceSentAt: row.sourceSentAt ?? "",
        sourceSequence: row.sourceSequence ?? 0,
        sourceConversationId: row.sourceConversationId ?? "",
        originalOrderGroupId: row.originalOrderGroupId ?? "",
        intentType: row.intentType ?? "explicit_order",
        appendDecision: row.appendDecision ?? "",
        reviewReasons: row.reviewReasons ?? [],
        fieldReviews: row.fieldReviews ?? [],
        dimensionEvidence: row.dimensionEvidence,
        aliasEvidence: row.aliasEvidence,
        sourceHoldId: row.sourceHoldId ?? "",
        sourceIntentId: row.sourceIntentId ?? "",
        cancellationStatus: row.cancellationStatus ?? "",
        cancellationScope: row.cancellationScope ?? "",
        cancellationSourceMessageId: row.cancellationSourceMessageId ?? "",
        cancellationRestoration: row.cancellationRestoration,
        crossDraftCancellation: row.crossDraftCancellation,
        excludedFromConfirmation: row.excludedFromConfirmation === true,
      },
    };
  }

  function normalizeArtworkAttachment(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const attachmentId = cleanCommandText(value.attachmentId);
    if (!attachmentId) return undefined;
    return {
      attachmentId,
      fileName: cleanCommandText(value.fileName),
      mimeType: cleanCommandText(value.mimeType),
      fileSize: Number.isFinite(Number(value.fileSize)) ? Number(value.fileSize) : 0,
      status: cleanCommandText(value.status) || "uploaded",
      version: Math.max(1, Number(value.version) || 1),
    };
  }

  function buildDraftRiskHints(lines) {
    return lines.flatMap((line) =>
      getMissingDraftFields(line).map((field) => ({
        riskType: "missing_required_field",
        level: "blocking",
        message: `${line.id} 缺 ${field}`,
        relatedField: field,
        relatedId: line.id,
      })),
    );
  }

  function buildDraftTodo(workspace, draft, lines, operatorId) {
    const draftWorkspace = {
      ...workspace,
      orderDrafts: [
        ...(workspace.orderDrafts ?? []).filter((item) => (item.id ?? item.draftId) !== draft.id),
        draft,
      ],
    };
    return buildTodo(draftWorkspace, {
      id: nextPlainId("T-DRAFT", draft.id),
      type: "订单草稿待确认",
      customerId: draft.customerId || "C001",
      ref: draft.id,
      refType: "order_draft",
      refId: draft.id,
      summary: `${lines.length} 行草稿需要补充信息`,
      latest: lines[0]?.latest ?? "待确认",
      urgency: "普通",
      impact: "草稿未生成正式订单",
      createdBy: operatorId,
    });
  }

  function buildInventoryReservations(workspace, checkedRows, orderLines, operatorId, holdsById = new Map()) {
    return checkedRows
      .map((row, index) => {
        if (!isStockOrderType(row.orderType) || row.inventory !== "可用") return null;
        const orderLine = orderLines[index];
        const temporaryHold = holdsById.get(row.sourceHoldId);
        const inventoryItem = temporaryHold
          ? findInventoryItem(workspace, temporaryHold.inventoryItemId)
          : findMatchingInventory(workspace, row);
        if (!inventoryItem || !orderLine) return null;
        if (temporaryHold) {
          return {
            reservationId: temporaryHold.reservationId ?? temporaryHold.id,
            orderLineId: orderLine.id,
            sourceIntentId: temporaryHold.sourceIntentId,
            customerId: temporaryHold.customerId,
            sourceMessageId: temporaryHold.sourceMessageId,
            inventoryItemId: temporaryHold.inventoryItemId,
            reservedQty: Number(row.qty ?? 0),
            inventoryDeltaQty: 0,
            reservationType:
              mapFulfillmentMethod(row.fulfillment) === "pickup" ? "待提货锁定" : "出库占用",
            status: "生效",
            expiresAt: "",
            metadata: {
              ...(temporaryHold.metadata ?? {}),
              convertedFromTemporaryHold: true,
            },
            convertFromTemporaryHold: true,
            createdBy: temporaryHold.createdBy || operatorId,
          };
        }
        return {
          reservationId: nextPlainId("RSV", orderLine.id),
          orderLineId: orderLine.id,
          inventoryItemId: inventoryItem.id,
          reservedQty: Number(row.qty ?? 0),
          inventoryDeltaQty: Number(row.qty ?? 0),
          reservationType:
            mapFulfillmentMethod(row.fulfillment) === "pickup" ? "待提货锁定" : "出库占用",
          status: "生效",
          createdBy: operatorId,
        };
      })
      .filter(Boolean);
  }

  function buildProductionTasks(orderLines, operatorId) {
    return orderLines
      .filter((line) => requiresProductionOrderType(line.orderType, line.inventory) || /补印/.test(String(line.status ?? "")))
      .map((line) => {
        const productionTaskId = nextPlainId("PT", line.id);
        const orderType = normalizeOrderType(line.orderType);
        // 外加工印刷 only goes through the silk-screen workshop (no bag-making, no stock).
        const taskType = orderType === "external_print" || orderType === "stock_printed" || orderType === "custom_print" || line.print === "是" || /丝印|补印/.test(String(line.status ?? "")) ? "丝印" : "制袋";
        return {
          productionTaskId,
          bizNo: productionTaskId,
          orderLineId: line.id,
          taskType,
          machineId: "",
          plannedQty: Number(line.qty ?? 0),
          taskStatus: "待排产",
          publishedScheduleId: "",
          revision: 1,
          createdBy: operatorId,
        };
      });
  }

  function buildInventoryLedgerEntries(workspace, reservations, operatorId) {
    const runningReservedByInventory = new Map();
    return reservations.map((reservation) => {
      const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
      const qtyBefore = runningReservedByInventory.has(reservation.inventoryItemId)
        ? runningReservedByInventory.get(reservation.inventoryItemId)
        : Number(inventoryItem?.reserved ?? 0);
      const qtyChange = Number(reservation.inventoryDeltaQty ?? reservation.reservedQty ?? 0);
      runningReservedByInventory.set(reservation.inventoryItemId, qtyBefore + qtyChange);
      return {
        ledgerId: nextPlainId("LEDGER", reservation.reservationId),
        inventoryItemId: reservation.inventoryItemId,
        changeType: reservation.convertFromTemporaryHold ? "临时留货转订单占用" : "订单占用",
        qtyBefore,
        qtyChange,
        qtyAfter: qtyBefore + qtyChange,
        sourceType: "order_confirm",
        sourceId: reservation.orderLineId,
        operatorId,
        confirmedBy: operatorId,
        reason: reservation.convertFromTemporaryHold ? "临时留货原位转为正式订单占用" : "订单确认占用库存",
        remark: reservation.reservationType,
      };
    });
  }

  function resolveTemporaryHoldConversions(workspace, lines) {
    const byHoldId = new Map();
    for (const line of lines) {
      const holdId = String(line.sourceHoldId ?? "").trim();
      if (!holdId) continue;
      if (byHoldId.has(holdId)) {
        return { error: businessError(409, "TEMPORARY_HOLD_REUSED", "One temporary hold cannot be converted into multiple order lines.") };
      }
      const reservation = (workspace.inventoryReservations ?? []).find(
        (item) => (item.id ?? item.reservationId) === holdId,
      );
      if (!reservation || reservation.reservationType !== "临时留货" || reservation.status !== "生效") {
        return { error: businessError(409, "TEMPORARY_HOLD_NOT_ACTIVE", "The linked temporary hold is not active.") };
      }
      const expiry = Date.parse(normalizeInventoryHoldTimestamp(reservation.expiresAt));
      if (!Number.isFinite(expiry)) {
        return { error: businessError(409, "TEMPORARY_HOLD_EXPIRY_INVALID", "临时留货到期时间缺失或无效，请核对留货记录后再转订单。") };
      }
      if (expiry <= new Date(now()).getTime()) {
        return { error: businessError(409, "TEMPORARY_HOLD_EXPIRED", "The linked temporary hold has expired.") };
      }
      if (Number(reservation.reservedQty ?? reservation.qty) !== Number(line.qty)) {
        return { error: businessError(409, "TEMPORARY_HOLD_QTY_MISMATCH", "The order quantity must match the temporary hold quantity.") };
      }
      if (reservation.customerId && line.customerId && reservation.customerId !== line.customerId) {
        return { error: businessError(409, "TEMPORARY_HOLD_CUSTOMER_MISMATCH", "The temporary hold belongs to another customer.") };
      }
      if (line.sourceIntentId && reservation.sourceIntentId !== line.sourceIntentId) {
        return { error: businessError(409, "TEMPORARY_HOLD_INTENT_MISMATCH", "The temporary hold source intent does not match the order line.") };
      }
      const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
      if (!inventoryItem || !doesInventoryItemMatchLine(inventoryItem, line)) {
        return { error: businessError(409, "TEMPORARY_HOLD_SPEC_MISMATCH", "The order specification does not match the held inventory item.") };
      }
      byHoldId.set(holdId, reservation);
    }
    return { byHoldId };
  }

  function doesInventoryItemMatchLine(inventoryItem, line) {
    const normalize = (value) => String(value ?? "").trim();
    return normalize(inventoryItem.size) === normalize(line.size)
      && normalize(inventoryItem.color) === normalize(line.color)
      && (!normalize(line.handle) || normalize(inventoryItem.handle ?? inventoryItem.handleType) === normalize(line.handle))
      && (!normalize(line.style) || normalize(inventoryItem.style) === normalize(line.style));
  }

  function buildHoldAwareInventory(inventories, holdsById) {
    const heldQtyByInventory = new Map();
    for (const hold of holdsById.values()) {
      heldQtyByInventory.set(
        hold.inventoryItemId,
        Number(heldQtyByInventory.get(hold.inventoryItemId) ?? 0) + Number(hold.reservedQty ?? hold.qty ?? 0),
      );
    }
    return (inventories ?? []).map((inventory) => {
      const heldQty = heldQtyByInventory.get(inventory.id) ?? 0;
      if (!heldQty) return inventory;
      const reserved = Math.max(0, Number(inventory.reserved ?? inventory.reservedQty ?? 0) - heldQty);
      return { ...inventory, reserved, reservedQty: reserved };
    });
  }

  function pricingReviewTodos(inputs, quote) {
    return [...inputs, ...(quote?.linePrices ?? []).filter(price => price.sourceEvidence.override?.managerReviewRequired).map(price => ({
      type: "本单改价待查看", refType: "order_draft", refId: quote.draftId, ref: quote.draftId, customerId: price.sourceEvidence.officeQuoteInput.customerId,
      summary: `本单价格已生效，请查看改价依据：${price.overrideReason}`, urgency: "普通", impact: "仅提醒，不阻塞订单生产交付" }))];
  }

  function applyOfficePricingQuote(confirmation, quote) {
    if (!quote || confirmation.blocked) return;
    confirmation.newLines.forEach((line, index) => {
      const price = quote.linePrices.find(price => price.draftLineId === confirmation.checkedRows[index]?.id);
      if (!price) throw Object.assign(new Error("报价明细不匹配"), { code: "ORDER_PRICE_QUOTE_CHANGED", statusCode: 409 });
      line.confirmedOfficePrice = structuredClone(price);
      line.amount = price.finalAmount;
      if (price.sourceEvidence.override) line.exceptions = [...new Set([...(line.exceptions ?? []), "本单改价"] )];
    });
  }

  function buildConfirmationTodos(workspace, todoInputs, operatorId, orderLines = []) {
    const todos = [];
    const referenceWorkspace = { ...workspace, orderLines: [...(workspace.orderLines ?? []), ...orderLines] };
    for (const todoInput of todoInputs) {
      todos.push(
        buildTodo(
          { ...referenceWorkspace, todos: [...(workspace.todos ?? []), ...todos] },
          { ...todoInput, createdBy: operatorId },
        ),
      );
    }
    return todos;
  }

  function resolveShortageCancellationApplications(workspace, draftId, lines) {
    const intents = (workspace.inventoryIntents ?? []).filter(
      (intent) => (intent.sourceDraftId === draftId || intent.candidate?.targetDraftId === draftId)
        && intent.intentType === "shortage_cancellation"
        && intent.intentStatus !== "库存不足取消-已应用"
        && intent.intentStatus !== "库存不足取消-已恢复订购",
    );
    const unresolved = intents.find(
      (intent) => intent.candidate?.requiresReview === true
        || !Array.isArray(intent.candidate?.relatedDraftLineIds)
        || intent.candidate.relatedDraftLineIds.length === 0,
    );
    if (unresolved) {
      return {
        error: businessError(
          409,
          "SHORTAGE_CANCELLATION_REVIEW_REQUIRED",
          `Shortage cancellation ${unresolved.id} must be linked to specific draft lines before confirmation.`,
        ),
      };
    }
    const knownLineIds = new Set(lines.map((line) => line.id));
    const cancelledDraftLineIds = [...new Set(intents.flatMap((intent) => intent.candidate.relatedDraftLineIds))];
    const staleLineId = cancelledDraftLineIds.find((lineId) => !knownLineIds.has(lineId));
    if (staleLineId) {
      return {
        error: businessError(
          409,
          "SHORTAGE_CANCELLATION_TARGET_CHANGED",
          `Shortage cancellation target ${staleLineId} no longer exists in the draft.`,
        ),
      };
    }
    const cancelledSet = new Set(cancelledDraftLineIds);
    const normalizedLines = lines.map((line) => cancelledSet.has(line.id)
      ? {
          ...line,
          cancellationStatus: "库存不足取消",
          excludedFromConfirmation: true,
        }
      : line);
    return {
      lines: normalizedLines,
      activeLines: normalizedLines.filter((line) => !cancelledSet.has(line.id)),
      cancelledDraftLineIds,
      appliedIntents: intents,
    };
  }

  function buildAppliedShortageCancellationIntents(intents, cancelledDraftLineIds, continuedDraftLineIds, orderIds) {
    const timestamp = nowIso(now);
    const normalizedOrderIds = Array.isArray(orderIds) ? orderIds : [orderIds].filter(Boolean);
    return intents.map((intent) => ({
      ...intent,
      intentStatus: "库存不足取消-已应用",
      candidate: {
        ...(intent.candidate ?? {}),
        appliedDraftLineIds: cancelledDraftLineIds.filter((lineId) => intent.candidate.relatedDraftLineIds.includes(lineId)),
        continuedDraftLineIds,
        generatedOrderId: normalizedOrderIds[0] ?? "",
        generatedOrderIds: normalizedOrderIds,
        appliedAt: timestamp,
      },
      revision: Number(intent.revision ?? 1) + 1,
      updatedAt: timestamp,
    }));
  }

  function mergeDraftLineChecks(lines, checkedRows) {
    const checkedById = new Map(checkedRows.map((line) => [line.id, line]));
    return lines.map((line) => checkedById.get(line.id) ?? line);
  }

  // Shortage = a stock line the current (hold-aware) inventory cannot cover; such a line is
  // otherwise turned into production. The office picks what this customer wants this time:
  //   cancel_whole     整单取消
  //   ship_available   有什么发什么，缺的取消
  //   split_produce    同意分批，缺的安排生产（the previous default）
  // An older client that sends no decision keeps the previous default, recorded as such.
  function applyCustomerShortageDecision(workspace, resolution, rawDecision) {
    const activeLines = resolution.activeLines;
    if (!activeLines.length) return { resolution, decision: null };
    const holds = resolveTemporaryHoldConversions(workspace, activeLines);
    // A hold problem is reported by the confirmation itself; a whole-order cancel does not need stock.
    if (holds.error && cleanCommandText(rawDecision?.choice) !== "cancel_whole") return { resolution, decision: null };
    const preview = holds.error ? { checkedRows: [] } : confirmDraftOrder({
      draftRows: activeLines,
      // Only the inventory verdict is used here; prices are resolved later for the kept lines.
      resolveAmount: () => 0,
      inventoryRecords: buildHoldAwareInventory(workspace.inventories, holds.byHoldId),
      orderLines: workspace.orderLines,
      fulfillments: workspace.fulfillments,
      customers: workspace.customers,
    });
    const shortageLineIds = preview.checkedRows
      .filter((row) => isStockOrderType(row.orderType) && String(row.inventory ?? "").startsWith("缺货"))
      .map((row) => row.id);
    const choice = cleanCommandText(rawDecision?.choice);
    const note = cleanCommandText(rawDecision?.note).slice(0, 500);
    if (choice && !Object.hasOwn(SHORTAGE_DECISION_LABELS, choice)) {
      return { error: businessError(422, "ORDER_SHORTAGE_DECISION_INVALID", "缺货处理只能选：整单取消 / 有什么发什么、缺的取消 / 同意分批、缺的安排生产。") };
    }
    if (!shortageLineIds.length) {
      // A customer who said "cancel the whole order" has cancelled it, even if stock arrived
      // before the office pressed confirm. The other two answers only concern short lines.
      if (choice !== "cancel_whole") return { resolution, decision: null };
    }
    // The desktop entry page always sends an object, so it must record the customer's answer;
    // only an older client that sends nothing falls back to the previous default.
    if (!choice && rawDecision && typeof rawDecision === "object") {
      const described = activeLines
        .filter((line) => shortageLineIds.includes(line.id))
        .map((line) => [line.size, line.color, Number.isFinite(Number(line.qty)) ? `${line.qty}个` : ""].filter(Boolean).join(" "))
        .join("；");
      return { error: businessError(409, "ORDER_SHORTAGE_DECISION_REQUIRED", `库存不够：${described || "部分明细"}。请先问客户：整单取消、有什么发什么（缺的取消），还是同意分批（缺的安排生产），选好再确认下单。`) };
    }
    const decision = {
      choice: choice || "split_produce",
      label: SHORTAGE_DECISION_LABELS[choice || "split_produce"],
      note,
      shortageDraftLineIds: shortageLineIds,
      source: choice ? "office_customer_choice" : "legacy_default_production",
      ...(shortageLineIds.length ? {} : { stockCoveredAtConfirm: true }),
    };
    if (decision.choice === "split_produce") return { resolution, decision };
    const cancelled = new Set(decision.choice === "cancel_whole" ? activeLines.map((line) => line.id) : shortageLineIds);
    const lines = resolution.lines.map((line) => cancelled.has(line.id)
      ? { ...line, cancellationStatus: `客户选择：${decision.label}`, excludedFromConfirmation: true }
      : line);
    return {
      decision,
      resolution: {
        ...resolution,
        lines,
        activeLines: lines.filter((line) => !line.excludedFromConfirmation),
        cancelledDraftLineIds: [...new Set([...resolution.cancelledDraftLineIds, ...cancelled])],
      },
    };
  }

  function shortageDecisionReason(decision) {
    return `缺货按客户意见：${decision.label}${decision.note ? `（${decision.note}）` : ""}`;
  }

  // The address and contact this delivery goes to are frozen on the fulfillment (the driver
  // task reads them from here); a line may pick one of the customer's addresses or a one-off one.
  function buildFulfillmentCustomerSnapshot(workspace, fulfillment, newLines) {
    const base = buildCustomerSnapshot(workspace, fulfillment.customerId);
    const customer = customerWithAddresses(workspace, (workspace.customers ?? []).find((item) => (item.id ?? item.customerId) === fulfillment.customerId) ?? {});
    const line = newLines.find((item) => item.id === fulfillment.lineId) ?? {};
    const delivery = resolveDeliveryAddress(customer, line);
    if (delivery.error || !delivery.address) return base;
    return {
      ...base,
      address: delivery.address,
      deliveryAddressId: delivery.addressId,
      deliveryAddressSource: delivery.source,
      contactName: String(customer.contact ?? "").trim(),
      contactPhone: String(customer.phone ?? "").trim(),
    };
  }

  // Reject a chosen address that does not belong to the line's customer before anything is written.
  function findDeliveryAddressError(workspace, lines) {
    for (const line of lines) {
      if (!line.deliveryAddressId && !line.deliveryAddress) continue;
      const customer = customerWithAddresses(workspace, (workspace.customers ?? []).find((item) => (item.id ?? item.customerId) === line.customerId) ?? {});
      const delivery = resolveDeliveryAddress(customer, line);
      if (delivery.error) return businessError(422, "ORDER_DELIVERY_ADDRESS_INVALID", delivery.error);
    }
    return null;
  }

  function buildConfirmedOrderRecord(workspace, draftId, confirmation, body, operatorId) {
    const customerId = confirmation.newLines[0]?.customerId ?? body.customerId ?? "";
    return {
      orderId: confirmation.orderNo,
      bizNo: confirmation.orderNo,
      sourceDraftId: draftId,
      draftId,
      customerId,
      customerSnapshot: buildCustomerSnapshot(workspace, customerId),
      sourceText: body.sourceText ?? "",
      summaryStatus: "处理中",
      createdBy: operatorId,
    };
  }
}

const SHORTAGE_DECISION_LABELS = Object.freeze({
  cancel_whole: "整单取消",
  ship_available: "有什么发什么，缺的取消",
  split_produce: "同意分批，缺的安排生产",
});

function cleanCommandText(value) {
  return String(value ?? "").trim();
}

// 2026-11-07 实测缺陷：明细编号固定为 DRAFT-LINE-N 时，第二张草稿会撞上第一张的
// order_draft_lines 主键，识别接口直接 500。编号必须带上所属草稿。

// 编号里带草稿身份才算本草稿的；其它一律视为外来编号。

// 批次作用域：同一个幂等键/同一段原文 → 同一作用域，回放稳定；不同批次不同。
function buildQueueScope(body = {}) {
  const seed = cleanCommandText(body.idempotencyKey) || cleanCommandText(body.sourceText) || "queue";
  return `QB-${createHash("sha256").update(seed).digest("hex").slice(0, 12).toUpperCase()}`;
}

function ownDraftLineId(candidate, draftId) {
  const id = cleanCommandText(candidate);
  const scope = cleanCommandText(draftId);
  if (!id || !scope) return "";
  return id.includes(scope) ? id : "";
}

function draftLineIdFor(draftId, index) {
  const scope = cleanCommandText(draftId);
  return scope ? `${scope}-L${String(index + 1).padStart(2, "0")}` : `DRAFT-LINE-${index + 1}`;
}

function findDuplicateDraftLineIds(lines) {
  const seen = new Set();
  const duplicated = new Set();
  for (const line of lines ?? []) {
    if (seen.has(line.id)) duplicated.add(line.id);
    seen.add(line.id);
  }
  return [...duplicated];
}

// 数据库约束错误不能把表名和约束名原样回给办公室。
const POSTGRES_INTEGRITY_FAILURES = new Map([
  ["23505", { statusCode: 409, code: "ORDER_DRAFT_DUPLICATE_RECORD", message: "同一笔记录已存在，请重新读取草稿后再试。" }],
  ["23503", { statusCode: 409, code: "ORDER_DRAFT_REFERENCE_CONFLICT", message: "关联的数据不存在或已变更，请刷新后重试。" }],
  ["23502", { statusCode: 422, code: "ORDER_DRAFT_REQUIRED_VALUE_MISSING", message: "缺少必填内容，请补全后重试。" }],
  ["23514", { statusCode: 422, code: "ORDER_DRAFT_RULE_VIOLATION", message: "数据不满足业务规则，请核对后重试。" }],
  ["40001", { statusCode: 409, code: "ORDER_DRAFT_SERIALIZATION_RETRY", message: "数据同时在改，请重试。" }],
  ["40P01", { statusCode: 409, code: "ORDER_DRAFT_DEADLOCK_RETRY", message: "数据同时在改，请重试。" }],
]);

function isPostgresDriverError(error) {
  return typeof error?.code === "string"
    && /^[0-9A-Z]{5}$/.test(error.code)
    && error.code !== "P0001"
    && Boolean(error.severity || error.detail || error.table || error.constraint || error.routine);
}

function repositoryCommandError(error) {
  if (isPostgresDriverError(error)) {
    const mapped = POSTGRES_INTEGRITY_FAILURES.get(error.code);
    if (mapped) return businessError(mapped.statusCode, mapped.code, mapped.message);
    return businessError(409, "ORDER_DRAFT_WRITE_FAILED", "订单草稿保存失败，请重试；若持续失败请联系管理员。");
  }
  const code = cleanCommandText(error?.code) || "ORDER_DRAFT_WRITE_FAILED";
  return businessError(Number(error?.statusCode ?? 409), code, error?.message || code);
}

function parseDraftExpectedRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) return 0;
  return revision;
}

function buildScopedQueueRecognition(recognition, item) {
  const sourceIds = new Set(item.sourceMessageIds);
  const temporaryHolds = (recognition.temporaryHolds ?? []).filter((intent) => sourceIds.has(intent.id));
  const draftGroups = (recognition.draftGroups ?? []).filter((group) => group.id === item.originalOrderGroupId);
  return {
    version: recognition.version,
    sourceMessages: item.sourceMessages,
    orderRows: item.rows,
    draftGroups,
    nonOrderIntents: item.nonOrderIntents,
    temporaryHolds,
    riskHints: (recognition.riskHints ?? []).filter((hint) =>
      sourceIds.has(hint.sourceMessageId ?? hint.messageId)
      || hint.relatedOrderGroupId === item.originalOrderGroupId),
    summary: {
      messageCount: item.sourceMessages.length,
      orderMessageCount: item.sourceMessages.filter((message) => ["explicit_order", "follow_up"].includes(message.intentType)).length,
      orderRowCount: item.rows.length,
      originalOrderCount: draftGroups.length,
      inventoryInquiryCount: item.nonOrderIntents.filter((intent) => intent.intentType === "inventory_inquiry").length,
      temporaryHoldCount: temporaryHolds.length,
      duplicateCandidateCount: item.nonOrderIntents.filter((intent) => intent.intentType === "duplicate_candidate").length,
      shortageCancellationCount: item.nonOrderIntents.filter((intent) => intent.intentType === "shortage_cancellation").length,
      cancelledDraftLineCount: item.rows.filter((row) => row.excludedFromConfirmation).length,
      reviewCount: item.requiresReview ? 1 : 0,
    },
  };
}

function buildQueueBatchId(idempotencyKey, sourceMessages) {
  const source = idempotencyKey || sourceMessages.map((message) => message.id).join("|");
  return `QBAT-${createHash("sha256").update(source).digest("hex").slice(0, 20).toUpperCase()}`;
}

function buildQueueDraftId(batchId, queueItemId) {
  const digest = createHash("sha256").update(`${batchId}:${queueItemId}`).digest("hex").slice(0, 20).toUpperCase();
  return `DRAFT-Q-${digest}`;
}

function buildQueueItemIdempotencyKey(explicitKey, batchId, queueItemId, index) {
  const digest = createHash("sha256")
    .update(`${explicitKey || batchId}:${queueItemId}:${index}`)
    .digest("hex")
    .slice(0, 32);
  return `order-draft-queue:${digest}`;
}

function buildDraftOperationLogId(action, draftId, revision, idempotencyKey = "") {
  const digest = createHash("sha256")
    .update([action, draftId, revision, idempotencyKey].join(":"))
    .digest("hex")
    .slice(0, 20)
    .toUpperCase();
  return `LOG-DRAFT-${digest}`;
}

function summarizeDraft(draft) {
  return {
    draftId: draft.id,
    status: draft.status,
    sourceText: draft.sourceText,
    sourceChannel: draft.sourceChannel,
    sourceMessageId: draft.sourceMessageId,
    customerId: draft.customerId,
    customerName: draft.customerName,
    recognitionContext: draft.recognitionContext,
    clientRevision: draft.clientRevision,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

function getMissingDraftFields(row) {
  const missing = [];
  if (!row.customerId) missing.push("customerId");
  if (!row.size || row.size === "待确认") missing.push("size");
  if (!row.color || row.color === "待确认") missing.push("bagColor");
  if (!row.qty) missing.push("qty");
  return missing;
}

function mergeDraftFieldReviewEvidence(lines, persistedLines, operatorId, confirmedAt) {
  const persistedById = new Map((persistedLines ?? []).map((line) => [line.id ?? line.draftLineId, line]));
  return lines.map((line) => {
    const merged = mergePersistedDraftFieldReviews(line, persistedById.get(line.id));
    return {
      ...merged,
      fieldReviews: (merged.fieldReviews ?? []).map((review) => review.status === "confirmed" && !review.confirmedBy ? {
        ...review,
        confirmedBy: operatorId,
        confirmedAt,
      } : review),
    };
  });
}

function assertNoPendingFieldReviews(lines) {
  const blocked = lines
    .map((line) => ({ line, reviews: getPendingDraftFieldReviews(line) }))
    .find((item) => item.reviews.length);
  if (!blocked) return null;
  const fields = [...new Set(blocked.reviews.map((review) => review.fieldLabel || review.field))].join("、");
  return businessError(
    409,
    "ORDER_DRAFT_FIELD_REVIEW_REQUIRED",
    `${blocked.line.id} 的${fields}仍需人工确认；接受候选值或修改字段后才能生成正式订单。`,
  );
}

function mapArtworkStatus(value, printFlag) {
  if (!printFlag) return "非印刷";
  if (value === "uploaded" || value === "已上传") return "已上传";
  if (value === "existing_artwork" || value === "已有稿件") return "已有稿件";
  if (value === "customer_pending" || value === "客户待补") return "客户待补";
  if (value === "pending" || value === "待上传") return "待上传";
  return "客户待补";
}

function nowIso(now) {
  return new Date(now()).toISOString();
}

function success(response) {
  return { response };
}

function notFound(code) {
  return { notFound: true, code };
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}

function hasInvalidDraftQuantity(lines,{allowUnknown=false}={}) {
 return Array.isArray(lines) && lines.some(line=>{
  // 按来料卷数下单的外加工行：数量 0、卷数有效即可（印完才知道数量）。
  if(isValidIncomingRollsLine({ ...line, orderType: normalizeOrderType(line?.orderType ?? line?.productType) }))return false;
  const raw=line?.qty;
  if(allowUnknown && (raw===undefined || raw===null || raw==="" || raw===0))return false;
  return !["number","string"].includes(typeof raw) || !Number.isSafeInteger(Number(raw)) || Number(raw)<=0 || Number(raw)>2147483647;
 });
}

function normalizeDraftQtyBasis(line) {
  const orderType = normalizeOrderType(line.orderType ?? line.productType);
  if (orderType !== "external_print" || String(line.qtyBasis ?? "").trim() !== INCOMING_ROLLS_QTY_BASIS) return {};
  return { qtyBasis: INCOMING_ROLLS_QTY_BASIS, incomingRollCount: incomingRollCountOf(line), qty: 0 };
}
