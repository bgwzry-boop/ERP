import { createHash } from "node:crypto";
import { buildInventoryIntentsFromRecognition } from "../inventoryIntentDomain.mjs";
import { assertOrderDraftSplitPlan, buildOrderDraftSplitPlan } from "../orderDraftSplitDomain.mjs";
import { buildOrderDraftQueuePlan } from "../orderDraftQueueDomain.mjs";
import { buildIdempotencyRequestHash } from "../idempotency.mjs";
import { getPendingDraftFieldReviews, mergePersistedDraftFieldReviews } from "../../shared/orderDraftFieldReview.mjs";

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
    restoreShortageCancelledDraftLine,
    linkCrossDraftShortageCancellation,
    confirmOrderDraft,
    previewOrderDraftSplit,
    confirmSplitOrderDraft,
  };

  async function recognizeOrderDraft({ workspace, body = {}, operatorId }) {
    const sourceText = body.sourceText ?? body.text ?? "";
    const recognition = recognizeOrderConversation(
      Array.isArray(body.sourceMessages) && body.sourceMessages.length ? body.sourceMessages : sourceText,
      {
        customers: workspace.customers,
        inventories: workspace.inventories,
        standardColors: workspace.standardColors,
        colorAliases: workspace.colorAliases,
        customerId: body.customerId,
        conversationId: body.conversationId ?? body.sourceMessageId,
        currentDraftStatus: body.currentDraftStatus,
        parseOrderText,
        now,
      },
    );
    if (!recognition.sourceMessages.length) {
      return businessError(422, "VALIDATION_ERROR", "sourceText or sourceMessages must contain at least one message");
    }
    const lines = recognition.orderRows;
    const recognitionContext = {
      version: recognition.version,
      sourceMessages: recognition.sourceMessages,
      draftGroups: recognition.draftGroups,
      nonOrderIntents: recognition.nonOrderIntents,
      temporaryHolds: recognition.temporaryHolds,
      summary: recognition.summary,
    };
    const draftId =
      body.draftId ??
      (body.idempotencyKey
        ? `DRAFT-API-${createHash("sha256").update(body.idempotencyKey).digest("hex").slice(0, 16).toUpperCase()}`
        : nextId("DRAFT-API", workspace.orderDrafts));
    const customerId = body.customerId ?? lines[0]?.customerId ?? "";
    const draft = buildDraftProjection(null, {
      id: draftId,
      draftId,
      sourceText,
      sourceChannel: body.sourceChannel ?? "manual",
      sourceMessageId: body.sourceMessageId ?? "",
      customerId,
      customerName: findCustomerName(workspace, customerId),
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
    const sourceText = body.sourceText ?? body.text ?? "";
    const recognition = recognizeOrderConversation(
      Array.isArray(body.sourceMessages) && body.sourceMessages.length ? body.sourceMessages : sourceText,
      {
        customers: workspace.customers,
        inventories: workspace.inventories,
        standardColors: workspace.standardColors,
        colorAliases: workspace.colorAliases,
        customerId: body.customerId,
        conversationId: body.conversationId ?? body.sourceMessageId,
        currentDraftStatus: body.currentDraftStatus,
        parseOrderText,
        now,
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
      const customerId = item.customerId ?? item.rows[0]?.customerId ?? "";
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
        customerName: findCustomerName(workspace, customerId),
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
    const lines = normalizeDraftRows(body.lines ?? [], workspace, body);
    if (!lines.length) {
      return businessError(422, "VALIDATION_ERROR", "lines must contain at least one draft line");
    }
    const expectedRevision = parseDraftExpectedRevision(body.clientRevision);
    if (!expectedRevision) {
      return businessError(422, "VALIDATION_ERROR", "clientRevision must be a positive integer");
    }
    const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
    if (!previous) return notFound("ORDER_DRAFT_NOT_FOUND");
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
    const transaction = await workspace.orderDraftRepository.saveOrderDraft({
      workspace,
      draft,
      expectedRevision,
      todos,
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
    });

    return success({
      draft: summarizeDraft(transaction.draft),
      todos: transaction.todos.map(toTodoSummary),
      operationLogId: transaction.operationLogId,
    });
  }

  async function restoreShortageCancelledDraftLine({ workspace, draftId, body = {}, operatorId }) {
    const expectedRevision = parseDraftExpectedRevision(body.clientRevision);
    if (!expectedRevision) return businessError(422, "VALIDATION_ERROR", "clientRevision must be a positive integer");
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
    const expectedRevision = parseDraftExpectedRevision(body.clientRevision);
    if (!expectedRevision) return businessError(422, "VALIDATION_ERROR", "clientRevision must be a positive integer");
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

  async function confirmOrderDraft({ workspace, draftId, body = {}, operatorId }) {
    let lines = normalizeDraftRows(body.lines ?? [], workspace, body);
    if (!lines.length) {
      return businessError(422, "VALIDATION_ERROR", "lines must contain at least one draft line");
    }
    const expectedRevision = parseDraftExpectedRevision(body.clientRevision);
    if (!expectedRevision) {
      return businessError(422, "VALIDATION_ERROR", "clientRevision must be a positive integer");
    }
    const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
    if (!previous) return notFound("ORDER_DRAFT_NOT_FOUND");
    lines = mergeDraftFieldReviewEvidence(lines, previous.lines ?? [], operatorId, nowIso(now));
    const cancellationResolution = resolveShortageCancellationApplications(workspace, draftId, lines);
    if (cancellationResolution.error) return cancellationResolution.error;
    if (!cancellationResolution.activeLines.length) {
      return closeFullyCancelledDraft({
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
    const holdResolution = resolveTemporaryHoldConversions(workspace, cancellationResolution.activeLines);
    if (holdResolution.error) return holdResolution.error;
    const confirmation = confirmDraftOrder({
      draftRows: cancellationResolution.activeLines,
      inventoryRecords: buildHoldAwareInventory(workspace.inventories, holdResolution.byHoldId),
      orderLines: workspace.orderLines,
      fulfillments: workspace.fulfillments,
      customers: workspace.customers,
    });
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
      await workspace.orderDraftRepository.saveOrderDraft({
        workspace,
        draft: blockedDraft,
        expectedRevision,
        todos: [],
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { ...body, operatorId },
      });
      return businessError(409, "ORDER_DRAFT_BLOCKED", confirmation.toast);
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
      },
    });
    const priceSnapshots = confirmation.newLines.map((line) => ({
      ...toPriceSnapshot(line),
      priceSnapshotId: `PS-${line.id}`,
      snapshotType: "order_confirm",
      versionNo: 1,
      chargeableQty: Number(line.qty ?? 0),
      finalAmount: Number(line.amount ?? 0),
      createdBy: operatorId,
    }));
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
    const todos = buildConfirmationTodos(workspace, confirmation.shortageTodoInputs, operatorId);
    const transaction = await workspace.orderConfirmationTransactionRepository.confirmOrder({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      orderDraft: confirmedDraft,
      expectedDraftRevision: expectedRevision,
      order: buildConfirmedOrderRecord(workspace, draftId, confirmation, body, operatorId),
      orderLines: confirmation.newLines.map((line) => ({ ...line, createdBy: operatorId })),
      productionTasks,
      priceSnapshots,
      fulfillmentRecords: confirmation.newFulfillments.map((fulfillment) => ({
        ...fulfillment,
        expectedQty: fulfillment.qty,
        createdBy: operatorId,
        customerSnapshot: buildCustomerSnapshot(workspace, fulfillment.customerId),
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

    return success({
      orderId: transaction.order.orderId,
      orderSummaryStatus: "处理中",
      orderLines: confirmation.newLines.map(toOrderLineSummary),
      productionTasks: transaction.productionTasks,
      priceSnapshots: confirmation.newLines.map(toPriceSnapshot),
      inventoryChecks: confirmation.checkedRows.map((line, index) =>
        toInventoryCheckResult(workspace, line, confirmation.newLines[index]),
      ),
      reservations: transaction.inventoryReservations.map(toInventoryReservationTransactionSummary),
      convertedTemporaryHoldIds: inventoryReservations
        .filter((reservation) => reservation.convertFromTemporaryHold)
        .map((reservation) => reservation.reservationId),
      cancelledDraftLineIds: cancellationResolution.cancelledDraftLineIds,
      appliedShortageCancellationIntentIds: cancellationResolution.appliedIntents.map((intent) => intent.id),
      closedWithoutOrder: false,
      fulfillmentTasks: confirmation.newFulfillments.map(toFulfillmentTaskSummary),
      todos: transaction.todos.map(toTodoSummary),
      operationLogIds: [transaction.operationLogId],
    });
  }

  async function previewOrderDraftSplit({ workspace, draftId, body = {} }) {
    const lines = normalizeDraftRows(body.lines ?? [], workspace, body);
    if (!lines.length) return businessError(422, "VALIDATION_ERROR", "lines must contain at least one draft line");
    const expectedRevision = parseDraftExpectedRevision(body.clientRevision);
    if (!expectedRevision) return businessError(422, "VALIDATION_ERROR", "clientRevision must be a positive integer");
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

  async function confirmSplitOrderDraft({ workspace, draftId, body = {}, operatorId }) {
    let lines = normalizeDraftRows(body.lines ?? [], workspace, body);
    if (!lines.length) return businessError(422, "VALIDATION_ERROR", "lines must contain at least one draft line");
    const expectedRevision = parseDraftExpectedRevision(body.clientRevision);
    if (!expectedRevision) return businessError(422, "VALIDATION_ERROR", "clientRevision must be a positive integer");
    const idempotencyPayload = {
      ...body,
      operatorId,
      action: "confirm_split_order_draft",
    };
    if (body.idempotencyKey) {
      const replay = await workspace.orderConfirmationTransactionRepository.findIdempotentReplay?.({
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload,
      });
      if (replay?.commandResponse) return success(replay.commandResponse);
    }
    const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
    if (!previous) return notFound("ORDER_DRAFT_NOT_FOUND");
    if (Number(previous.revision ?? previous.clientRevision) !== expectedRevision) {
      return businessError(409, "ORDER_DRAFT_REVISION_CONFLICT", "The draft changed before split confirmation.");
    }
    lines = mergeDraftFieldReviewEvidence(lines, previous.lines ?? [], operatorId, nowIso(now));
    const cancellationResolution = resolveShortageCancellationApplications(workspace, draftId, lines);
    if (cancellationResolution.error) return cancellationResolution.error;
    if (!cancellationResolution.activeLines.length) {
      return closeFullyCancelledDraft({
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
    const splitPlan = buildOrderDraftSplitPlan({
      draftId,
      revision: expectedRevision,
      lines: cancellationResolution.lines,
    });
    const splitPlanError = assertOrderDraftSplitPlan(splitPlan, body.splitPlanHash);
    if (splitPlanError) return splitPlanError;
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
        inventoryRecords: buildHoldAwareInventory(workspace.inventories, holdResolution.byHoldId),
        orderLines: rollingOrderNumberRows,
        fulfillments: rollingFulfillments,
        customers: workspace.customers,
      });
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
      },
    });
    const orders = confirmations.map(({ confirmation }) =>
      buildConfirmedOrderRecord(workspace, draftId, confirmation, body, operatorId));
    const priceSnapshots = newLines.map((line) => ({
      ...toPriceSnapshot(line),
      priceSnapshotId: `PS-${line.id}`,
      snapshotType: "order_confirm",
      versionNo: 1,
      chargeableQty: Number(line.qty ?? 0),
      finalAmount: Number(line.amount ?? 0),
      createdBy: operatorId,
    }));
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
      confirmations.flatMap((item) => item.confirmation.shortageTodoInputs),
      operatorId,
    );
    const commandResponse = {
      orderId: orders[0]?.orderId ?? "",
      orderIds: orders.map((order) => order.orderId),
      orderSummaryStatus: "处理中",
      splitConfirmed: true,
      splitPlan,
      orderLines: newLines.map(toOrderLineSummary),
      productionTasks,
      priceSnapshots: newLines.map(toPriceSnapshot),
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
        customerSnapshot: buildCustomerSnapshot(workspace, fulfillment.customerId),
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
      after: { status: "库存不足取消", cancelledDraftLineIds: lines.map((line) => line.id) },
      reason: "客户明确取消全部缺货/整单明细",
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

  function normalizeDraftRows(lines, workspace, body) {
    return lines.map((line, index) => {
      const customerId = line.customerId ?? body.customerId ?? "";
      const printFlag = line.printFlag ?? line.print === "是";
      return {
        id: line.draftLineId ?? line.id ?? `DRAFT-LINE-${index + 1}`,
        customerId,
        customer: line.customer ?? findCustomerName(workspace, customerId) ?? "待确认客户",
        product: line.productName ?? line.product ?? "",
        size: line.size ?? "待确认",
        color: line.bagColor ?? line.color ?? "待确认",
        handle: line.handleType ?? line.handle ?? "普通提",
        style: line.style ?? "空白袋",
        print: printFlag ? "是" : "否",
        qty: Number(line.qty ?? 0),
        fulfillment: line.fulfillmentMethod ?? line.fulfillment ?? "待确认",
        latest: line.latestNeededAt ?? line.latest ?? "待确认",
        printColor: line.printColor ?? (printFlag ? "待确认" : "非印刷"),
        printSide: mapPrintSide(line.printSide),
        artworkStatus: mapArtworkStatus(line.artworkStatus, printFlag),
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
      orderType: row.print === "是" ? "custom_print" : "stock",
      size: row.size,
      bagColor: row.color,
      handleType: row.handle,
      handleColor: row.handleColor,
      style: row.style,
      qty: row.qty,
      fulfillmentMethod: row.fulfillment,
      latestNeededAt: row.latest,
      printFlag: row.print === "是",
      printColor: row.printColor,
      printSide: mapPrintSide(row.printSide),
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
    return buildTodo(workspace, {
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
        if (row.inventory !== "可用") return null;
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
      .filter((line) => line.print === "是" || /制袋|丝印|待排产|补印/.test(String(line.status ?? "")))
      .map((line) => {
        const productionTaskId = nextPlainId("PT", line.id);
        const taskType = line.print === "是" || /丝印|补印/.test(String(line.status ?? "")) ? "丝印" : "制袋";
        return {
          productionTaskId,
          bizNo: productionTaskId,
          orderLineId: line.id,
          taskType,
          machineId: taskType === "丝印" ? "PRINT-01" : "BAG-01",
          plannedQty: Number(line.qty ?? 0),
          taskStatus: line.status || "待开始",
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
      if (reservation.expiresAt && Date.parse(reservation.expiresAt) <= new Date(now()).getTime()) {
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

  function buildConfirmationTodos(workspace, todoInputs, operatorId) {
    const todos = [];
    for (const todoInput of todoInputs) {
      todos.push(
        buildTodo(
          { ...workspace, todos: [...(workspace.todos ?? []), ...todos] },
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

function cleanCommandText(value) {
  return String(value ?? "").trim();
}

function repositoryCommandError(error) {
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
