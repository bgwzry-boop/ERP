import assert from "node:assert/strict";
import { buildPublishedOrderPriceFixture } from "./helpers/publishedOrderPriceFixture.mjs";
import { createOrderDraftCommandService } from "../server/services/orderDraftCommandService.mjs";
import { recognizeOrderConversation } from "../src/lib/orderConversationRecognition.js";

let confirmationMode = "success";
let shortageLineIds = new Set();
const calls = { draftSaves: [], confirmations: [] };
const service = createOrderDraftCommandService({
  buildCustomerSnapshot(_workspace, customerId) {
    return { customerId, name: "张三服饰" };
  },
  buildOperationLog(_workspace, input) {
    return { id: input.id ?? `LOG-${input.action}`, ...input };
  },
  buildTodo(_workspace, input) {
    return { handled: false, ...input };
  },
  confirmDraftOrder({ draftRows, orderLines = [], fulfillments = [], resolveAmount }) {
    if (confirmationMode === "blocked") {
      return {
        blocked: true,
        draftStatus: "待补充信息",
        checkedRows: draftRows,
        toast: "库存或关键字段需要确认",
      };
    }
    const orderNo = `ORD-SERVICE-${String(orderLines.length + 1).padStart(3, "0")}`;
    return {
      blocked: false,
      draftStatus: "已生成正式订单",
      orderNo,
      checkedRows: draftRows.map((row) => ({
        ...row,
        inventory: shortageLineIds.has(row.id) ? "缺货：同规格合计 10 个，可用 0 个，转生产排产" : "可用",
        amount: resolveAmount(row),
      })),
      newLines: draftRows.map((row, index) => ({
          ...row,
          id: `${orderNo}-${String(index + 1).padStart(2, "0")}`,
          orderId: orderNo,
          customerId: row.customerId,
          qty: row.qty,
          amount: resolveAmount(row),
          status: "待出库",
        })),
      newFulfillments: draftRows.map((row, index) => ({
          id: `FUL-SERVICE-${String(fulfillments.length + index + 1).padStart(3, "0")}`,
          lineId: `${orderNo}-${String(index + 1).padStart(2, "0")}`,
          customerId: row.customerId,
          method: "自提",
          qty: row.qty,
          status: "待出库",
        })),
      shortageTodoInputs: [],
    };
  },
  findCustomerName(_workspace, customerId) {
    return customerId === "C001" ? "张三服饰" : "";
  },
  findInventoryItem(workspace, inventoryItemId) {
    return workspace.inventories.find((item) => item.id === inventoryItemId) ?? null;
  },
  findMatchingInventory(workspace, row) {
    return workspace.inventories.find(
      (item) => item.size === row.size && item.color === row.color && item.handle === row.handle,
    ) ?? null;
  },
  mapFulfillmentMethod(value) {
    return value === "自提" ? "pickup" : "delivery";
  },
  mapPrintSide(value) {
    return value === "single" ? "单面" : value === "double" ? "双面" : value || "非印刷";
  },
  nextId(prefix, rows) {
    return `${prefix}-${String(rows.length + 1).padStart(3, "0")}`;
  },
  nextPlainId(prefix, value) {
    return `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, "-")}`;
  },
  parseOrderText(sourceText) {
    return [
      {
        id: "PARSED-001",
        customerId: "C001",
        customer: "张三服饰",
        product: "空白袋",
        size: "30*38*10",
        color: "红色",
        handle: "普通提",
        style: "空白袋",
        print: "否",
        qty: 10,
        fulfillment: "自提",
        latest: "明天",
        confidence: "high",
        source: sourceText,
      },
    ];
  },
  recognizeOrderConversation,
  toFulfillmentTaskSummary(fulfillment) {
    return { fulfillmentId: fulfillment.id, expectedQty: fulfillment.qty };
  },
  toInventoryCheckResult(_workspace, row, orderLine) {
    return { orderLineId: orderLine.id, status: row.inventory };
  },
  toInventoryReservationTransactionSummary(reservation) {
    return { reservationId: reservation.reservationId, qty: reservation.reservedQty };
  },
  toOrderLineSummary(line) {
    return { id: line.id, lineStatus: line.status };
  },
  toPriceSnapshot(line) {
    return {
      orderLineId: line.id,
      bagPrice: 0.34,
      printPrice: 0,
      otherFee: 0,
      amount: line.amount,
    };
  },
  toTodoSummary(todo) {
    return { todoId: todo.id, type: todo.type };
  },
  now: () => new Date("2026-07-11T13:00:00.000Z"),
});

await checkRecognition();
await checkConversationRecognition();
await checkDraftSave();
await checkConfirmation();
await checkFieldReviewConfirmationGate();
await checkSplitPreviewAndConfirmation();
await checkCrossDraftShortageCancellationLink();
await checkShortageCancellationRestore();
await checkPartialShortageCancellation();
await checkFullyCancelledDraft();
await checkUnresolvedShortageCancellation();
await checkCustomerShortageDecision();
await checkSplitCustomerShortageDecision();
await checkDeliveryAddressChoice();
await checkBlockedConfirmation();
await checkValidation();

console.log(
  "Order draft command service checks passed: recognition, revisioned save, blocked confirmation, inventory/price confirmation inputs, authenticated identity, and transaction orchestration are covered.",
);

async function checkRecognition() {
  const workspace = buildWorkspace();
  const result = await service.recognizeOrderDraft({
    workspace,
    operatorId: "U-OFFICE-A",
    body: {
      sourceText: "张三服饰 30*38红10个 明天自提",
      idempotencyKey: "draft-recognize-service-001",
      operatorId: "U-SPOOFED",
    },
  });
  assert.match(result.response.draft.draftId, /^DRAFT-API-[A-F0-9]{16}$/);
  assert.equal(result.response.draft.clientRevision, 1);
  assert.equal(result.response.lines[0].recognitionStatus, "high_confidence");
  assert.equal(result.response.riskHints.length, 0);
  assert.equal(result.response.recognition.summary.originalOrderCount, 1);
  assert.equal(result.response.draft.recognitionContext.summary.orderRowCount, 1);
  const input = calls.draftSaves.at(-1);
  assert.equal(input.expectedRevision, 0);
  assert.equal(input.draft.createdBy, "U-OFFICE-A");
  assert.equal(input.idempotencyPayload.operatorId, "U-OFFICE-A");
  assert.equal(input.operationLog.operatorId, "U-OFFICE-A");
}

async function checkConversationRecognition() {
  const workspace = buildWorkspace();
  const inquiry = await service.recognizeOrderDraft({
    workspace,
    operatorId: "U-OFFICE-A",
    body: {
      sourceMessages: [
        {
          id: "MSG-SERVICE-INQUIRY",
          conversationId: "GROUP-SERVICE-1",
          customerId: "C001",
          sender: "张经理",
          sentAt: "2026-07-12 09:30",
          text: "30*38红色100个有吗？",
        },
        {
          id: "MSG-SERVICE-REPLY",
          conversationId: "GROUP-SERVICE-1",
          sender: "办公室A",
          senderRole: "office",
          sentAt: "2026-07-12 09:31",
          text: "有",
        },
      ],
      idempotencyKey: "draft-recognize-conversation-service-001",
    },
  });
  assert.equal(inquiry.response.lines.length, 0, "inventory inquiry must not become an order line");
  assert.equal(inquiry.response.recognition.nonOrderIntents[0].status, "询库存-待客户确认");
  assert.equal(inquiry.response.recognition.nonOrderIntents[1].advancesCustomerIntent, false);
  assert.equal(calls.draftSaves.at(-1).draft.recognitionContext.sourceMessages.length, 2);

  const empty = await service.recognizeOrderDraft({
    workspace,
    operatorId: "U-OFFICE-A",
    body: { idempotencyKey: "draft-recognize-empty-service-001" },
  });
  assert.equal(empty.statusCode, 422, "missing source text must be rejected instead of injecting workspace sample text");
  assert.equal(empty.code, "VALIDATION_ERROR");
}

async function checkDraftSave() {
  const workspace = buildWorkspace();
  const result = await service.saveOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: {
      expectedRevision: 1,
      draftStatus: "待补充信息",
      operatorId: "U-SPOOFED",
      lines: [buildRequestLine()],
    },
  });
  assert.equal(result.response.draft.clientRevision, 2);
  assert.equal(result.response.todos[0].type, "订单草稿待确认");
  const input = calls.draftSaves.at(-1);
  assert.equal(input.expectedRevision, 1);
  assert.equal(input.todos[0].createdBy, "U-OFFICE-A");
  assert.equal(input.idempotencyPayload.operatorId, "U-OFFICE-A");
  assert.equal(input.operationLog.operatorId, "U-OFFICE-A");

  await service.saveOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: {
      expectedRevision: 1,
      draftStatus: "待补充信息",
      lines: [{
        ...buildRequestLine(),
        productName: "美的空调",
        bagColor: "白色",
        printFlag: true,
        printColor: "黑色",
        printSide: "single",
        artworkStatus: "uploaded",
      }],
    },
  });
  const customDraftInput = calls.draftSaves.at(-1);
  assert.equal(customDraftInput.draft.lines[0].printSide, "单面");
  assert.equal(customDraftInput.draft.lines[0].artworkStatus, "已上传");
}

async function checkConfirmation() {
  confirmationMode = "success";
  const workspace = buildWorkspace();
  const result = await service.confirmOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: {
      sourceText: "张三服饰 30*38红10个 明天自提",
      expectedRevision: 1,
      idempotencyKey: "draft-confirm-service-001",
      operatorId: "U-SPOOFED",
      lines: [buildRequestLine()],
    },
  });
  assert.equal(result.response.orderId, "ORD-SERVICE-001");
  assert.equal(result.response.reservations[0].qty, 10);
  assert.equal(result.response.fulfillmentTasks[0].expectedQty, 10);
  const input = calls.confirmations.at(-1);
  assert.equal(input.expectedDraftRevision, 1);
  assert.equal(input.idempotencyPayload.operatorId, "U-OFFICE-A");
  assert.equal(input.order.createdBy, "U-OFFICE-A");
  assert.equal(input.orderLines[0].createdBy, "U-OFFICE-A");
  assert.equal(input.priceSnapshots[0].createdBy, "U-OFFICE-A");
  assert.equal(input.fulfillmentRecords[0].createdBy, "U-OFFICE-A");
  assert.equal(input.inventoryReservations[0].inventoryItemId, "INV-001");
  assert.equal(input.inventoryReservations[0].reservationType, "待提货锁定");
  assert.equal(input.inventoryLedgerEntries[0].qtyBefore, 20);
  assert.equal(input.inventoryLedgerEntries[0].qtyAfter, 30);
  assert.equal(input.inventoryLedgerEntries[0].operatorId, "U-OFFICE-A");
  assert.equal(input.operationLog.operatorId, "U-OFFICE-A");
}

async function checkFieldReviewConfirmationGate() {
  confirmationMode = "success";
  const pendingReview = {
    reviewId: "MSG-SERVICE-TYPO:size",
    field: "size",
    fieldLabel: "尺寸",
    originalValue: "40+30",
    suggestedValue: "40*30*10",
    reason: "疑似尺寸输入错误：40+30",
    status: "pending",
  };
  const blockedWorkspace = buildWorkspace();
  blockedWorkspace.orderDrafts[0].lines = [{
    id: "DRAFT-SERVICE-001-01",
    fieldReviews: [pendingReview],
    dimensionEvidence: { original: "40+30", suggested: "40*30*10", requiresConfirmation: true },
  }];
  const beforeConfirmationCount = calls.confirmations.length;
  const blocked = await service.confirmOrderDraft({
    workspace: blockedWorkspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: { expectedRevision: 1, lines: [buildRequestLine()] },
  });
  assert.equal(blocked.statusCode, 409);
  assert.equal(blocked.code, "ORDER_DRAFT_FIELD_REVIEW_REQUIRED");
  assert.equal(calls.confirmations.length, beforeConfirmationCount, "omitting persisted reviews must not bypass the gate");

  const confirmedWorkspace = buildWorkspace();
  confirmedWorkspace.orderDrafts[0].lines = blockedWorkspace.orderDrafts[0].lines;
  const confirmed = await service.confirmOrderDraft({
    workspace: confirmedWorkspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: {
      expectedRevision: 1,
      idempotencyKey: "draft-confirm-reviewed-field-001",
      lines: [{
        ...buildRequestLine(),
        recognitionEvidence: {
          fieldReviews: [{ ...pendingReview, status: "confirmed", confirmationMethod: "accepted", confirmedValue: "40*30*10" }],
          dimensionEvidence: { original: "40+30", suggested: "40*30*10", requiresConfirmation: false, reviewStatus: "confirmed" },
        },
      }],
    },
  });
  assert.equal(confirmed.response.orderId, "ORD-SERVICE-001");
  assert.equal(calls.confirmations.at(-1).orderDraft.lines[0].fieldReviews[0].status, "confirmed");
  assert.equal(calls.confirmations.at(-1).orderDraft.lines[0].fieldReviews[0].confirmedBy, "U-OFFICE-A");
  assert.equal(calls.confirmations.at(-1).orderDraft.lines[0].fieldReviews[0].confirmedAt, "2026-07-11T13:00:00.000Z");
}

async function checkSplitPreviewAndConfirmation() {
  confirmationMode = "success";
  const workspace = buildWorkspace();
  const firstLine = {
    ...buildRequestLine(),
    recognitionEvidence: { originalOrderGroupId: "ODG-SERVICE-001" },
  };
  const secondLine = {
    ...buildRequestLine(),
    draftLineId: "DRAFT-SERVICE-001-02",
    fulfillmentMethod: "送货",
    latestNeededAt: "后天",
    recognitionEvidence: { originalOrderGroupId: "ODG-SERVICE-001" },
  };
  const preview = await service.previewOrderDraftSplit({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: { expectedRevision: 1, lines: [firstLine, secondLine] },
  });
  assert.equal(preview.response.splitPlan.groups.length, 2);
  assert.equal(preview.response.splitPlan.canConfirm, true);
  assert.equal(preview.response.splitPlan.groups.reduce((sum, group) => sum + group.quantityTotal, 0), 20);

  const beforeConfirmationCount = calls.confirmations.length;
  const result = await service.confirmSplitOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: {
      expectedRevision: 1,
      lines: [firstLine, secondLine],
      splitPlanHash: preview.response.splitPlan.planHash,
      idempotencyKey: "draft-split-confirm-service-001",
    },
  });
  assert.equal(result.response.splitConfirmed, true);
  assert.equal(result.response.orderIds.length, 2);
  assert.equal(new Set(result.response.orderIds).size, 2);
  assert.equal(result.response.orderLines.length, 2);
  assert.equal(calls.confirmations.length, beforeConfirmationCount + 1, "split orders must use one transaction call");
  const transactionInput = calls.confirmations.at(-1);
  assert.equal(transactionInput.orders.length, 2);
  assert.equal(transactionInput.orderLines.length, 2);
  assert.equal(transactionInput.orderDraft.status, "已生成多个正式订单");
  assert.equal(transactionInput.operationLog.action, "confirm_split_order_draft");

  const stale = await service.confirmSplitOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: {
      expectedRevision: 1,
      lines: [firstLine, { ...secondLine, qty: 25 }],
      splitPlanHash: preview.response.splitPlan.planHash,
    },
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.code, "ORDER_DRAFT_SPLIT_PLAN_CHANGED");
}

async function checkBlockedConfirmation() {
  confirmationMode = "blocked";
  const workspace = buildWorkspace();
  const beforeSaveCount = calls.draftSaves.length;
  const result = await service.confirmOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: { expectedRevision: 1, lines: [buildRequestLine()] },
  });
  assert.equal(result.statusCode, 409);
  assert.equal(result.code, "ORDER_DRAFT_BLOCKED");
  assert.equal(calls.draftSaves.length, beforeSaveCount + 1);
  assert.equal(calls.draftSaves.at(-1).draft.status, "待补充信息");
  assert.equal(calls.draftSaves.at(-1).operationLog.action, "block_order_draft_confirmation");
  confirmationMode = "success";
}

async function checkPartialShortageCancellation() {
  confirmationMode = "success";
  const workspace = buildWorkspace();
  workspace.inventoryIntents = [buildShortageCancellationIntent({
    relatedDraftLineIds: ["DRAFT-SERVICE-001-01"],
  })];
  const cancelledLine = buildRequestLine();
  const continuingLine = {
    ...buildRequestLine(),
    draftLineId: "DRAFT-SERVICE-001-02",
    bagColor: "黑色",
  };
  const result = await service.confirmOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: {
      expectedRevision: 1,
      idempotencyKey: "draft-confirm-partial-shortage-cancel-001",
      lines: [cancelledLine, continuingLine],
    },
  });
  assert.equal(result.response.closedWithoutOrder, false);
  assert.deepEqual(result.response.cancelledDraftLineIds, [cancelledLine.draftLineId]);
  assert.equal(result.response.orderLines.length, 1, "only the available continuing line becomes formal");
  const input = calls.confirmations.at(-1);
  assert.equal(input.orderDraft.lines.length, 2, "cancelled line remains in draft evidence");
  assert.equal(input.orderLines.length, 1);
  assert.equal(input.orderLines[0].customerId, continuingLine.customerId);
  assert.equal(input.shortageCancellationIntents[0].intentStatus, "库存不足取消-已应用");
  assert.deepEqual(input.shortageCancellationIntents[0].candidate.appliedDraftLineIds, [cancelledLine.draftLineId]);
  assert.deepEqual(input.shortageCancellationIntents[0].candidate.continuedDraftLineIds, [continuingLine.draftLineId]);
}

async function checkShortageCancellationRestore() {
  const workspace = buildWorkspace();
  workspace.orderDrafts[0].lines = [{
    id: "DRAFT-SERVICE-001-01",
    customerId: "C001",
    customer: "张三服饰",
    product: "空白袋",
    size: "30*38*10",
    color: "红色",
    handle: "普通提",
    style: "空白袋",
    print: "否",
    qty: 10,
    fulfillment: "自提",
    latest: "明天",
    cancellationStatus: "库存不足取消",
    cancellationScope: "shortage_lines_only",
    cancellationSourceMessageId: "MSG-SHORTAGE-CANCEL-001",
    excludedFromConfirmation: true,
  }];
  workspace.inventoryIntents = [buildShortageCancellationIntent({ relatedDraftLineIds: ["DRAFT-SERVICE-001-01"] })];
  const result = await service.restoreShortageCancelledDraftLine({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: {
      expectedRevision: 1,
      draftLineId: "DRAFT-SERVICE-001-01",
    orderType: "stock",
      reason: "客户确认恢复订购",
      idempotencyKey: "restore-shortage-service-001",
    },
  });
  assert.equal(result.response.draft.clientRevision, 2);
  assert.equal(result.response.line.recognitionEvidence.cancellationStatus, "");
  assert.equal(result.response.line.recognitionEvidence.excludedFromConfirmation, false);
  assert.equal(result.response.line.recognitionEvidence.cancellationRestoration.restoredBy, "U-OFFICE-A");
  const input = calls.draftSaves.at(-1);
  assert.equal(input.operationLog.action, "restore_order_draft_shortage_cancellation");
  assert.equal(input.inventoryIntents[0].intentStatus, "库存不足取消-已恢复订购");
  assert.deepEqual(input.inventoryIntents[0].candidate.relatedDraftLineIds, []);
  assert.deepEqual(input.inventoryIntents[0].candidate.restoredDraftLineIds, ["DRAFT-SERVICE-001-01"]);
  assert.equal(input.idempotencyPayload.operatorId, "U-OFFICE-A");

  const confirmedWorkspace = buildWorkspace();
  confirmedWorkspace.orderDrafts[0].status = "已生成正式订单";
  confirmedWorkspace.orderDrafts[0].lines = workspace.orderDrafts[0].lines;
  confirmedWorkspace.inventoryIntents = [buildShortageCancellationIntent({ relatedDraftLineIds: ["DRAFT-SERVICE-001-01"] })];
  const forbidden = await service.restoreShortageCancelledDraftLine({
    workspace: confirmedWorkspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: { expectedRevision: 1, draftLineId: "DRAFT-SERVICE-001-01", reason: "客户又要了" },
  });
  assert.equal(forbidden.code, "SHORTAGE_CANCELLATION_RESTORE_AFTER_CONFIRMATION_FORBIDDEN");
}

async function checkCrossDraftShortageCancellationLink() {
  const workspace = buildWorkspace();
  workspace.orderDrafts[0].lines = [{
    id: "DRAFT-SERVICE-001-01",
    customerId: "C001",
    customer: "张三服饰",
    product: "空白袋",
    size: "30*38*10",
    color: "红色",
    handle: "普通提",
    style: "空白袋",
    print: "否",
    qty: 10,
    fulfillment: "自提",
    latest: "明天",
  }];
  workspace.inventoryIntents = [{
    ...buildShortageCancellationIntent({ relatedDraftLineIds: [], requiresReview: true }),
    id: "INT-CROSS-DRAFT-001",
    intentId: "INT-CROSS-DRAFT-001",
    sourceDraftId: "DRAFT-CANCELLATION-CONTEXT-001",
    intentStatus: "库存不足取消-待关联明细",
    sourceText: "上一单红色缺货不要了",
  }];
  const result = await service.linkCrossDraftShortageCancellation({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: {
      expectedRevision: 1,
      intentId: "INT-CROSS-DRAFT-001",
      draftLineId: "DRAFT-SERVICE-001-01",
    orderType: "stock",
      reason: "办公室核对来源消息后关联",
      idempotencyKey: "cross-draft-link-service-001",
    },
  });
  assert.equal(result.response.draft.clientRevision, 2);
  assert.equal(result.response.line.recognitionEvidence.cancellationStatus, "库存不足取消");
  assert.equal(result.response.line.recognitionEvidence.excludedFromConfirmation, true);
  assert.equal(result.response.line.recognitionEvidence.crossDraftCancellation.sourceDraftId, "DRAFT-CANCELLATION-CONTEXT-001");
  assert.equal(result.response.inventoryIntent.intentStatus, "库存不足取消-已关联跨草稿明细");
  assert.equal(result.response.inventoryIntent.candidate.targetDraftId, "DRAFT-SERVICE-001");
  const input = calls.draftSaves.at(-1);
  assert.equal(input.operationLog.action, "link_cross_draft_shortage_cancellation");
  assert.equal(input.idempotencyPayload.operatorId, "U-OFFICE-A");

  const mismatchWorkspace = buildWorkspace();
  mismatchWorkspace.orderDrafts[0].lines = workspace.orderDrafts[0].lines;
  mismatchWorkspace.inventoryIntents = [{
    ...workspace.inventoryIntents[0],
    customerId: "C-OTHER",
  }];
  const mismatch = await service.linkCrossDraftShortageCancellation({
    workspace: mismatchWorkspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: { expectedRevision: 1, intentId: "INT-CROSS-DRAFT-001", draftLineId: "DRAFT-SERVICE-001-01", reason: "错误关联" },
  });
  assert.equal(mismatch.code, "CROSS_DRAFT_CANCELLATION_CUSTOMER_MISMATCH");

  const unresolvedWorkspace = buildWorkspace();
  unresolvedWorkspace.orderDrafts[0].lines = workspace.orderDrafts[0].lines;
  unresolvedWorkspace.inventoryIntents = [{ ...workspace.inventoryIntents[0], customerId: "" }];
  const unresolved = await service.linkCrossDraftShortageCancellation({
    workspace: unresolvedWorkspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: { expectedRevision: 1, intentId: "INT-CROSS-DRAFT-001", draftLineId: "DRAFT-SERVICE-001-01", reason: "客户未知" },
  });
  assert.equal(unresolved.code, "CROSS_DRAFT_CANCELLATION_CUSTOMER_UNRESOLVED");
}

async function checkFullyCancelledDraft() {
  const workspace = buildWorkspace();
  workspace.inventoryIntents = [buildShortageCancellationIntent({
    scope: "whole_order",
    relatedDraftLineIds: ["DRAFT-SERVICE-001-01"],
  })];
  const beforeConfirmationCount = calls.confirmations.length;
  const result = await service.confirmOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: {
      expectedRevision: 1,
      idempotencyKey: "draft-close-full-shortage-cancel-001",
      lines: [buildRequestLine()],
    },
  });
  assert.equal(result.response.closedWithoutOrder, true);
  assert.equal(result.response.orderId, "");
  assert.equal(calls.confirmations.length, beforeConfirmationCount, "closed draft must not run order confirmation transaction");
  assert.equal(calls.draftSaves.at(-1).draft.status, "库存不足取消");
  assert.equal(calls.draftSaves.at(-1).inventoryIntents[0].intentStatus, "库存不足取消-已应用");
}

async function checkUnresolvedShortageCancellation() {
  const workspace = buildWorkspace();
  workspace.inventoryIntents = [buildShortageCancellationIntent({
    relatedDraftLineIds: [],
    requiresReview: true,
  })];
  const result = await service.confirmOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: { expectedRevision: 1, lines: [buildRequestLine()] },
  });
  assert.equal(result.statusCode, 409);
  assert.equal(result.code, "SHORTAGE_CANCELLATION_REVIEW_REQUIRED");
}

async function checkValidation() {
  const workspace = buildWorkspace();
  const empty = await service.saveOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: { expectedRevision: 1, lines: [] },
  });
  assert.equal(empty.statusCode, 422);
  const invalidRevision = await service.confirmOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: { expectedRevision: 0, lines: [buildRequestLine()] },
  });
  assert.equal(invalidRevision.code, "EXPECTED_REVISION_REQUIRED");
  workspace.orderDrafts = [];
  const missing = await service.saveOrderDraft({
    workspace,
    draftId: "DRAFT-MISSING",
    operatorId: "U-OFFICE-A",
    body: { expectedRevision: 1, lines: [buildRequestLine()] },
  });
  assert.equal(missing.code, "ORDER_DRAFT_NOT_FOUND");
}

function buildSecondRequestLine() {
  return { ...buildRequestLine(), draftLineId: "DRAFT-SERVICE-001-02", bagColor: "白色", qty: 20 };
}

async function confirmWithShortage(shortageDecision, key) {
  const workspace = buildWorkspace();
  const result = await service.confirmOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: {
      expectedRevision: 1,
      idempotencyKey: key,
      lines: [buildRequestLine(), buildSecondRequestLine()],
      ...(shortageDecision === undefined ? {} : { shortageDecision }),
    },
  });
  return { workspace, result };
}

// Owner decision 2026-10-29: on a shortage the office records the customer's choice.
async function checkCustomerShortageDecision() {
  shortageLineIds = new Set(["DRAFT-SERVICE-001-02"]);
  try {
    const invalid = await confirmWithShortage({ choice: "whatever" }, "shortage-invalid");
    assert.equal(invalid.result.statusCode, 422);
    assert.equal(invalid.result.code, "ORDER_SHORTAGE_DECISION_INVALID");

    const unanswered = await confirmWithShortage({ choice: "", note: "" }, "shortage-unanswered");
    assert.equal(unanswered.result.statusCode, 409);
    assert.equal(unanswered.result.code, "ORDER_SHORTAGE_DECISION_REQUIRED");
    assert.match(unanswered.result.message, /白色 20个/);

    const noShortage = new Set(shortageLineIds);
    shortageLineIds = new Set();
    const plain = await confirmWithShortage({ choice: "", note: "" }, "shortage-none");
    assert.ok(plain.result.response.orderId, "没有缺货时不用选");
    // GPT regression 2026-11-03: the customer chose 整单取消, then stock arrived before confirm.
    const restockedBefore = calls.confirmations.length;
    const restocked = await confirmWithShortage({ choice: "cancel_whole", note: "客户说不要了" }, "shortage-restocked-cancel");
    assert.equal(restocked.result.response?.closedWithoutOrder, true, JSON.stringify(restocked.result));
    assert.equal(calls.confirmations.length, restockedBefore, "客户已整单取消，库存补足也不能生成订单");
    assert.match(JSON.stringify(calls.draftSaves.at(-1)), /stockCoveredAtConfirm/);
    const restockedShip = await confirmWithShortage({ choice: "ship_available" }, "shortage-restocked-ship");
    assert.equal(calls.confirmations.at(-1).orderLines.length, 2, "库存已够时有什么发什么就是全发");
    assert.ok(restockedShip.result.response.orderId);
    shortageLineIds = noShortage;

    const confirmationsBefore = calls.confirmations.length;
    const whole = await confirmWithShortage({ choice: "cancel_whole", note: "客户说不要了" }, "shortage-cancel-whole");
    assert.equal(whole.result.response.closedWithoutOrder, true, JSON.stringify(whole.result));
    assert.equal(calls.confirmations.length, confirmationsBefore, "整单取消不能生成正式订单");
    const closedSave = calls.draftSaves.at(-1);
    assert.equal(closedSave.draft.status, "库存不足取消");
    assert.match(JSON.stringify(closedSave), /缺货按客户意见：整单取消（客户说不要了）/);

    const ship = await confirmWithShortage({ choice: "ship_available" }, "shortage-ship-available");
    assert.ok(ship.result.response.orderId, JSON.stringify(ship.result));
    const shipConfirmation = calls.confirmations.at(-1);
    const shipText = JSON.stringify(shipConfirmation);
    assert.match(shipText, /DRAFT-SERVICE-001-01/);
    assert.doesNotMatch(JSON.stringify(shipConfirmation.orderLines ?? shipConfirmation.newLines ?? []), /白色/, "缺货行不能进正式订单");
    assert.match(shipText, /ship_available/);

    const split = await confirmWithShortage({ choice: "split_produce", note: "客户同意先发有的" }, "shortage-split");
    assert.ok(split.result.response.orderId);
    assert.match(JSON.stringify(calls.confirmations.at(-1)), /split_produce/);
    assert.match(JSON.stringify(calls.confirmations.at(-1).orderLines ?? calls.confirmations.at(-1).newLines ?? []), /白色/);

    const legacy = await confirmWithShortage(undefined, "shortage-legacy");
    assert.ok(legacy.result.response.orderId);
    assert.match(JSON.stringify(calls.confirmations.at(-1)), /legacy_default_production/);
  } finally {
    shortageLineIds = new Set();
  }
}

async function confirmSplitWithShortage(shortageDecision, key) {
  confirmationMode = "success";
  const workspace = buildWorkspace();
  const firstLine = { ...buildRequestLine(), recognitionEvidence: { originalOrderGroupId: "ODG-SERVICE-001" } };
  const secondLine = {
    ...buildSecondRequestLine(),
    fulfillmentMethod: "送货",
    latestNeededAt: "后天",
    recognitionEvidence: { originalOrderGroupId: "ODG-SERVICE-001" },
  };
  const preview = await service.previewOrderDraftSplit({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: { expectedRevision: 1, lines: [firstLine, secondLine] },
  });
  assert.equal(preview.response.splitPlan.groups.length, 2);
  return service.confirmSplitOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: {
      expectedRevision: 1,
      lines: [firstLine, secondLine],
      splitPlanHash: preview.response.splitPlan.planHash,
      idempotencyKey: key,
      ...(shortageDecision === undefined ? {} : { shortageDecision }),
    },
  });
}

// The same customer choice applies when the office confirms by customer/delivery groups.
async function checkSplitCustomerShortageDecision() {
  shortageLineIds = new Set(["DRAFT-SERVICE-001-02"]);
  try {
    const unanswered = await confirmSplitWithShortage({ choice: "", note: "" }, "split-shortage-unanswered");
    assert.equal(unanswered.code, "ORDER_SHORTAGE_DECISION_REQUIRED");

    const ship = await confirmSplitWithShortage({ choice: "ship_available", note: "先发有的" }, "split-shortage-ship");
    assert.equal(ship.response.splitConfirmed, true, JSON.stringify(ship));
    assert.equal(ship.response.orderIds.length, 1, "缺货那组取消后只剩一张订单");
    const shipInput = calls.confirmations.at(-1);
    assert.equal(shipInput.orderLines.length, 1);
    assert.doesNotMatch(JSON.stringify(shipInput.orderLines), /白色/);
    assert.equal(shipInput.orderDraft.recognitionContext.shortageDecision.choice, "ship_available");
    assert.equal(shipInput.operationLog.reason, "缺货按客户意见：有什么发什么，缺的取消（先发有的）");

    const confirmationsBefore = calls.confirmations.length;
    const whole = await confirmSplitWithShortage({ choice: "cancel_whole" }, "split-shortage-whole");
    assert.equal(whole.response.closedWithoutOrder, true, JSON.stringify(whole));
    assert.equal(calls.confirmations.length, confirmationsBefore);

    shortageLineIds = new Set();
    const restockedBefore = calls.confirmations.length;
    const restocked = await confirmSplitWithShortage({ choice: "cancel_whole" }, "split-shortage-restocked-cancel");
    assert.equal(restocked.response?.closedWithoutOrder, true, "拆单时客户已整单取消，库存补足也不能出单");
    assert.equal(calls.confirmations.length, restockedBefore);
    shortageLineIds = new Set(["DRAFT-SERVICE-001-02"]);

    const split = await confirmSplitWithShortage({ choice: "split_produce" }, "split-shortage-produce");
    assert.equal(split.response.orderIds.length, 2);
    assert.equal(calls.confirmations.at(-1).orderDraft.recognitionContext.shortageDecision.choice, "split_produce");
  } finally {
    shortageLineIds = new Set();
  }
}

// 负责人 2026-11-04：一个客户可能有多个收货地址；送货单冻结所选地址，别人的地址不能用。
async function checkDeliveryAddressChoice() {
  confirmationMode = "success";
  const confirmWith = async (extra, key) => {
    const workspace = buildWorkspace();
    workspace.customers = [{ id: "C001", name: "张三服饰", contact: "张老板", phone: "13900000001",
      addresses: [{ addressId: "A1", address: "虎门大道 36 号", isDefault: true }, { addressId: "A2", address: "厚街某村 李记制袋厂" }] }];
    return service.confirmOrderDraft({ workspace, draftId: "DRAFT-SERVICE-001", operatorId: "U-OFFICE-A",
      body: { expectedRevision: 1, idempotencyKey: key, lines: [{ ...buildRequestLine(), fulfillmentMethod: "送货", ...extra }] } });
  };
  await confirmWith({ deliveryAddressId: "A2" }, "address-chosen");
  const chosen = calls.confirmations.at(-1).fulfillmentRecords[0].customerSnapshot;
  assert.deepEqual([chosen.address, chosen.deliveryAddressId, chosen.deliveryAddressSource, chosen.contactName], ["厚街某村 李记制袋厂", "A2", "customer_address", "张老板"]);
  await confirmWith({ deliveryAddress: "长安镇 某工业区 3 栋" }, "address-one-off");
  assert.equal(calls.confirmations.at(-1).fulfillmentRecords[0].customerSnapshot.address, "长安镇 某工业区 3 栋");
  await confirmWith({}, "address-default");
  assert.equal(calls.confirmations.at(-1).fulfillmentRecords[0].customerSnapshot.address, "虎门大道 36 号");
  const before = calls.confirmations.length;
  const foreign = await confirmWith({ deliveryAddressId: "SOMEONE-ELSE" }, "address-foreign");
  assert.equal(foreign.code, "ORDER_DELIVERY_ADDRESS_INVALID");
  assert.equal(calls.confirmations.length, before, "nothing is written for another customer's address");
}

function buildWorkspace() {
  const draft = {
    id: "DRAFT-SERVICE-001",
    draftId: "DRAFT-SERVICE-001",
    sourceText: "张三服饰 30*38红10个 明天自提",
    sourceChannel: "manual",
    sourceMessageId: "",
    customerId: "C001",
    customerName: "张三服饰",
    status: "待审核",
    revision: 1,
    clientRevision: 1,
    createdAt: "2026-07-11T12:00:00.000Z",
    updatedAt: "2026-07-11T12:00:00.000Z",
    lines: [],
  };
  return {
    ...buildPublishedOrderPriceFixture(),
    sampleText: "张三服饰 30*38红10个 明天自提",
    customers: [{ id: "C001", name: "张三服饰" }],
    inventories: [
      {
        id: "INV-001",
        size: "30*38*10",
        color: "红色",
        handle: "普通提",
        reserved: 20,
        available: 100,
      },
    ],
    orderDrafts: [draft],
    orderLines: [],
    fulfillments: [],
    todos: [],
    operationLogs: [],
    inventoryIntents: [],
    orderDraftRepository: {
      async getOrderDraft({ workspace, draftId }) {
        return workspace.orderDrafts.find((item) => item.id === draftId) ?? null;
      },
      async saveOrderDraft(input) {
        calls.draftSaves.push(input);
        return {
          draft: {
            ...input.draft,
            revision: input.expectedRevision + 1,
            clientRevision: input.expectedRevision + 1,
          },
          todos: input.todos,
          operationLogId: input.operationLog.id,
        };
      },
    },
    orderConfirmationTransactionRepository: {
      async confirmOrder(input) {
        calls.confirmations.push(input);
        return {
          order: input.order,
          orders: input.orders ?? [input.order],
          productionTasks: input.productionTasks ?? [],
          inventoryReservations: input.inventoryReservations,
          todos: input.todos,
          operationLogId: input.operationLog.id,
        };
      },
    },
  };
}

function buildRequestLine() {
  return {
    draftLineId: "DRAFT-SERVICE-001-01",
    orderType: "stock",
    customerId: "C001",
    customer: "张三服饰",
    productName: "空白袋",
    size: "30*38*10",
    bagColor: "红色",
    handleType: "普通提",
    style: "空白袋",
    qty: 10,
    fulfillmentMethod: "自提",
    latestNeededAt: "明天",
    printFlag: false,
  };
}

function buildShortageCancellationIntent({
  relatedDraftLineIds,
  requiresReview = false,
  scope = "shortage_lines_only",
}) {
  return {
    id: "INT-SHORTAGE-CANCEL-001",
    intentId: "INT-SHORTAGE-CANCEL-001",
    sourceDraftId: "DRAFT-SERVICE-001",
    sourceMessageId: "MSG-SHORTAGE-CANCEL-001",
    conversationId: "GROUP-SERVICE-1",
    customerId: "C001",
    intentType: "shortage_cancellation",
    intentStatus: requiresReview ? "库存不足取消-待关联明细" : "库存不足取消-已关联草稿明细",
    sourceText: "缺货的不要了，其他继续",
    candidate: { relatedDraftLineIds, requiresReview, targetBasis: "current_inventory_shortage" },
    cancellationScope: scope,
    revision: 1,
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-11T12:00:00.000Z",
    updatedAt: "2026-07-11T12:00:00.000Z",
  };
}
