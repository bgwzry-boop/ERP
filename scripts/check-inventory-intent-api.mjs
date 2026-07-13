import assert from "node:assert/strict";
import { createApiServer } from "../server/apiServer.mjs";

const server = createApiServer({ scenarioId: "inventory-intent-api-check" });

try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  await server.ready;
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const headers = { "x-erp-user-id": "U-OFFICE-A" };

  const inventoryBefore = await getJson(baseUrl, "/inventory/items?size=30*38*10&color=%E7%BA%A2%E8%89%B2", headers);
  const inventoryItem = inventoryBefore.items.find((item) => item.size === "30*38*10" && item.color === "红色");
  assert.ok(inventoryItem, "expected seeded red 30*38 inventory item");
  const reservedBefore = Number(inventoryItem.reserved ?? inventoryItem.quantities?.reserved ?? 0);

  const afterCutoffRecognition = await writeJson(baseUrl, "/order-drafts/recognize", {
    sourceMessages: [{
      id: "MSG-HOLD-AFTER-CUTOFF-API",
      conversationId: "GROUP-HOLD-AFTER-CUTOFF-API",
      customerId: "C001",
      sender: "张三服饰",
      senderRole: "customer",
      sentAt: "2099-07-12 20:05",
      text: "30*38 红色有的话给我留5个",
    }],
    customerId: "C001",
    sourceChannel: "wechat_group",
    idempotencyKey: "inventory-hold-after-cutoff-recognize-api-001",
  }, headers);
  const afterCutoffIntent = afterCutoffRecognition.inventoryIntents[0];
  assert.equal(afterCutoffIntent.candidate.requiresExpiryReview, true);
  assert.equal(afterCutoffIntent.candidate.expiryRule, "manual_future_expiry_required_after_1930");
  const blockedAfterCutoff = await writeJson(baseUrl, `/inventory/intents/${encodeURIComponent(afterCutoffIntent.intentId)}/hold`, {
    clientRevision: afterCutoffIntent.revision,
    candidateIndex: 0,
    inventoryItemId: inventoryItem.id,
    qty: 5,
  }, headers, 409);
  assert.equal(blockedAfterCutoff.code, "TEMPORARY_HOLD_EXPIRY_REVIEW_REQUIRED");
  const reviewedAfterCutoff = await writeJson(baseUrl, `/inventory/intents/${encodeURIComponent(afterCutoffIntent.intentId)}/hold`, {
    clientRevision: afterCutoffIntent.revision,
    candidateIndex: 0,
    inventoryItemId: inventoryItem.id,
    qty: 5,
    expiresAt: "2099-07-13T19:30:00+08:00",
    reason: "办公室确认19:30后新留货到期时间",
    idempotencyKey: "inventory-hold-after-cutoff-create-api-001",
  }, headers);
  assert.equal(reviewedAfterCutoff.hold.expiresAt, "2099-07-13T11:30:00.000Z");
  await writeJson(baseUrl, `/inventory/holds/${encodeURIComponent(reviewedAfterCutoff.hold.reservationId)}/release`, {
    clientRevision: reviewedAfterCutoff.intent.revision,
    reason: "测试完成释放",
    idempotencyKey: "inventory-hold-after-cutoff-release-api-001",
  }, headers);

  const recognition = await writeJson(baseUrl, "/order-drafts/recognize", {
    sourceMessages: [{
      id: "MSG-HOLD-API-001",
      conversationId: "GROUP-HOLD-API",
      customerId: "C001",
      sender: "张三服饰",
      senderRole: "customer",
      sentAt: "2099-07-12 10:00",
      text: "30*38 红色有的话给我留20个",
    }],
    customerId: "C001",
    sourceChannel: "wechat_group",
    idempotencyKey: "inventory-intent-recognize-api-001",
  }, headers);
  assert.equal(recognition.recognition.summary.temporaryHoldCount, 1);
  assert.equal(recognition.inventoryIntents.length, 1);
  const intent = recognition.inventoryIntents[0];
  assert.equal(intent.intentType, "temporary_hold");
  assert.equal(intent.intentStatus, "临时留货-待确认");

  const intentQueue = await getJson(baseUrl, `/inventory/intents?sourceDraftId=${encodeURIComponent(recognition.draft.draftId)}`, headers);
  assert.equal(intentQueue.items[0].intentId, intent.intentId);

  const created = await writeJson(baseUrl, `/inventory/intents/${encodeURIComponent(intent.intentId)}/hold`, {
    clientRevision: intent.revision,
    candidateIndex: 0,
    inventoryItemId: inventoryItem.id,
    qty: 20,
    reason: "客户明确要求留货",
    idempotencyKey: "inventory-hold-create-api-001",
  }, headers);
  assert.equal(created.intent.intentStatus, "临时留货-生效");
  assert.equal(created.hold.reservedQty, 20);
  assert.equal(created.hold.reservationType, "临时留货");

  const inventoryAfterCreate = await getJson(baseUrl, "/inventory/items?size=30*38*10&color=%E7%BA%A2%E8%89%B2", headers);
  const createdItem = inventoryAfterCreate.items.find((item) => item.id === inventoryItem.id);
  assert.equal(Number(createdItem.reserved ?? createdItem.quantities?.reserved), reservedBefore + 20);

  const extended = await writeJson(baseUrl, `/inventory/holds/${encodeURIComponent(created.hold.reservationId)}/extend`, {
    clientRevision: created.intent.revision,
    expiresAt: "2099-07-12T20:30:00+08:00",
    reason: "客户授权延长一小时",
    idempotencyKey: "inventory-hold-extend-api-001",
  }, headers);
  assert.equal(extended.hold.expiresAt, "2099-07-12T12:30:00.000Z");

  const released = await writeJson(baseUrl, `/inventory/holds/${encodeURIComponent(created.hold.reservationId)}/release`, {
    clientRevision: extended.intent.revision,
    reason: "客户取消留货",
    idempotencyKey: "inventory-hold-release-api-001",
  }, headers);
  assert.equal(released.intent.intentStatus, "已取消");
  assert.equal(released.hold.reservedQty, 0);

  const inventoryAfterRelease = await getJson(baseUrl, "/inventory/items?size=30*38*10&color=%E7%BA%A2%E8%89%B2", headers);
  const releasedItem = inventoryAfterRelease.items.find((item) => item.id === inventoryItem.id);
  assert.equal(Number(releasedItem.reserved ?? releasedItem.quantities?.reserved), reservedBefore);

  const holds = await getJson(baseUrl, "/inventory/holds", headers);
  const savedHold = holds.items.find((item) => item.reservationId === created.hold.reservationId);
  assert.equal(savedHold.status, "已取消");

  const conversionHoldRecognition = await writeJson(baseUrl, "/order-drafts/recognize", {
    sourceMessages: [{
      id: "MSG-HOLD-CONVERT-API",
      conversationId: "GROUP-HOLD-CONVERT-API",
      customerId: "C001",
      sender: "张三服饰",
      senderRole: "customer",
      sentAt: "2099-07-12 10:10",
      text: "30*38 红色有的话给我留20个",
    }],
    customerId: "C001",
    idempotencyKey: "inventory-hold-convert-recognize-api",
  }, headers);
  const conversionIntent = conversionHoldRecognition.inventoryIntents[0];
  const conversionHold = await writeJson(baseUrl, `/inventory/intents/${encodeURIComponent(conversionIntent.intentId)}/hold`, {
    clientRevision: conversionIntent.revision,
    candidateIndex: 0,
    inventoryItemId: inventoryItem.id,
    qty: 20,
    idempotencyKey: "inventory-hold-convert-create-api",
  }, headers);
  const reservedWithConversionHold = Number(conversionHold.inventoryItem.reservedQty);

  const orderRecognition = await writeJson(baseUrl, "/order-drafts/recognize", {
    sourceMessages: [{
      id: "MSG-ORDER-CONVERT-API",
      conversationId: "GROUP-HOLD-CONVERT-API",
      customerId: "C001",
      sender: "张三服饰",
      senderRole: "customer",
      sentAt: "2099-07-12 10:12",
      text: "30*38 红色20个自提",
    }],
    customerId: "C001",
    idempotencyKey: "inventory-hold-convert-order-recognize-api",
  }, headers);
  assert.equal(orderRecognition.lines.length, 1);
  const convertedOrder = await writeJson(
    baseUrl,
    `/order-drafts/${encodeURIComponent(orderRecognition.draft.draftId)}/confirm`,
    {
      clientRevision: orderRecognition.draft.clientRevision,
      sourceText: "30*38 红色20个自提",
      lines: [{
        ...orderRecognition.lines[0],
        sourceHoldId: conversionHold.hold.reservationId,
        sourceIntentId: conversionIntent.intentId,
      }],
      idempotencyKey: "inventory-hold-convert-order-confirm-api",
    },
    headers,
  );
  assert.deepEqual(convertedOrder.convertedTemporaryHoldIds, [conversionHold.hold.reservationId]);
  const convertedIntentQueue = await getJson(baseUrl, `/inventory/intents?sourceDraftId=${encodeURIComponent(conversionHoldRecognition.draft.draftId)}`, headers);
  assert.equal(convertedIntentQueue.items[0].intentStatus, "已转订单");
  assert.ok(convertedIntentQueue.items[0].relatedOrderLineId);
  const inventoryAfterConversion = await getJson(baseUrl, "/inventory/items?size=30*38*10&color=%E7%BA%A2%E8%89%B2", headers);
  const convertedItem = inventoryAfterConversion.items.find((item) => item.id === inventoryItem.id);
  assert.equal(
    Number(convertedItem.reserved ?? convertedItem.quantities?.reserved),
    reservedWithConversionHold,
    "temporary hold conversion must not reserve stock twice",
  );

  const restoreRecognition = await writeJson(baseUrl, "/order-drafts/recognize", {
    sourceMessages: [
      {
        id: "MSG-RESTORE-CANCEL-ORDER-1",
        conversationId: "GROUP-RESTORE-CANCEL-API",
        customerId: "C001",
        sender: "张三服饰",
        senderRole: "customer",
        sentAt: "2099-07-12 10:30",
        text: "30*38 红色10个 明天自提",
      },
      {
        id: "MSG-RESTORE-CANCEL-ACTION",
        conversationId: "GROUP-RESTORE-CANCEL-API",
        customerId: "C001",
        sender: "张三服饰",
        senderRole: "customer",
        sentAt: "2099-07-12 10:31",
        text: "红色缺货不要了",
      },
    ],
    customerId: "C001",
    sourceChannel: "wechat_group",
    idempotencyKey: "inventory-restore-cancel-recognize-api-001",
  }, headers);
  const restoreTarget = restoreRecognition.lines.find((line) => line.recognitionEvidence?.cancellationStatus === "库存不足取消");
  assert.ok(restoreTarget, "restore scenario should start from a cancelled draft line");
  const restored = await writeJson(
    baseUrl,
    `/order-drafts/${encodeURIComponent(restoreRecognition.draft.draftId)}/shortage-cancellation-restore`,
    {
      clientRevision: restoreRecognition.draft.clientRevision,
      draftLineId: restoreTarget.draftLineId,
      reason: "客户确认恢复订购",
      idempotencyKey: "inventory-restore-cancel-api-001",
    },
    headers,
  );
  assert.equal(restored.draft.clientRevision, restoreRecognition.draft.clientRevision + 1);
  assert.equal(restored.line.recognitionEvidence.cancellationStatus, "");
  assert.equal(restored.line.recognitionEvidence.excludedFromConfirmation, false);
  assert.equal(restored.line.recognitionEvidence.cancellationRestoration.restoredBy, "U-OFFICE-A");
  assert.equal(restored.inventoryIntents[0].intentStatus, "库存不足取消-已恢复订购");
  assert.deepEqual(restored.inventoryIntents[0].candidate.relatedDraftLineIds, []);
  const restoredIntentQueue = await getJson(
    baseUrl,
    `/inventory/intents?sourceDraftId=${encodeURIComponent(restoreRecognition.draft.draftId)}`,
    headers,
  );
  assert.equal(restoredIntentQueue.items[0].intentStatus, "库存不足取消-已恢复订购");

  const partialCancellationRecognition = await writeJson(baseUrl, "/order-drafts/recognize", {
    sourceMessages: [
      {
        id: "MSG-PARTIAL-CANCEL-ORDER-1",
        conversationId: "GROUP-PARTIAL-CANCEL-API",
        customerId: "C001",
        sender: "张三服饰",
        senderRole: "customer",
        sentAt: "2099-07-12 11:00",
        text: "30*38 红色10个 明天自提",
      },
      {
        id: "MSG-PARTIAL-CANCEL-ORDER-2",
        conversationId: "GROUP-PARTIAL-CANCEL-API",
        customerId: "C001",
        sender: "张三服饰",
        senderRole: "customer",
        sentAt: "2099-07-12 11:02",
        text: "再加 50*40 白色10个 明天自提",
      },
      {
        id: "MSG-PARTIAL-CANCEL-ACTION",
        conversationId: "GROUP-PARTIAL-CANCEL-API",
        customerId: "C001",
        sender: "张三服饰",
        senderRole: "customer",
        sentAt: "2099-07-12 11:04",
        text: "白色缺货不要了，红色继续",
      },
    ],
    customerId: "C001",
    sourceChannel: "wechat_group",
    idempotencyKey: "inventory-partial-cancel-recognize-api-001",
  }, headers);
  assert.equal(partialCancellationRecognition.lines.length, 2);
  const cancelledRecognitionLine = partialCancellationRecognition.lines.find(
    (line) => line.recognitionEvidence?.cancellationStatus === "库存不足取消",
  );
  assert.ok(cancelledRecognitionLine, "shortage cancellation should be associated to a concrete draft line");
  const partialCancellationIntent = partialCancellationRecognition.inventoryIntents.find(
    (item) => item.intentType === "shortage_cancellation",
  );
  assert.deepEqual(partialCancellationIntent.candidate.relatedDraftLineIds, [cancelledRecognitionLine.draftLineId]);

  const partialCancellationConfirmation = await writeJson(
    baseUrl,
    `/order-drafts/${encodeURIComponent(partialCancellationRecognition.draft.draftId)}/confirm`,
    {
      clientRevision: partialCancellationRecognition.draft.clientRevision,
      sourceText: "30*38 红色10个；50*40 白色10个；白色缺货不要了，红色继续",
      lines: partialCancellationRecognition.lines,
      idempotencyKey: "inventory-partial-cancel-confirm-api-001",
    },
    headers,
  );
  assert.equal(partialCancellationConfirmation.orderLines.length, 1);
  assert.equal(partialCancellationConfirmation.inventoryChecks.length, 1);
  assert.equal(partialCancellationConfirmation.inventoryChecks[0].inventoryItemId, inventoryItem.id);
  assert.equal(partialCancellationConfirmation.inventoryChecks[0].requestedQty, 10);
  assert.deepEqual(partialCancellationConfirmation.cancelledDraftLineIds, [cancelledRecognitionLine.draftLineId]);
  assert.deepEqual(partialCancellationConfirmation.appliedShortageCancellationIntentIds, [partialCancellationIntent.intentId]);
  assert.equal(partialCancellationConfirmation.closedWithoutOrder, false);
  const partialCancellationQueue = await getJson(
    baseUrl,
    `/inventory/intents?sourceDraftId=${encodeURIComponent(partialCancellationRecognition.draft.draftId)}`,
    headers,
  );
  assert.equal(partialCancellationQueue.items[0].intentStatus, "库存不足取消-已应用");
  assert.deepEqual(partialCancellationQueue.items[0].candidate.appliedDraftLineIds, [cancelledRecognitionLine.draftLineId]);

  const denied = await writeJson(baseUrl, `/inventory/intents/${encodeURIComponent(intent.intentId)}/hold`, {
    clientRevision: 1,
    candidateIndex: 0,
    inventoryItemId: inventoryItem.id,
    qty: 20,
  }, { "x-erp-user-id": "U-FINANCE-A" }, 403);
  assert.equal(denied.code, "PERMISSION_DENIED");

  console.log("Inventory intent API check passed: recognition persistence, holds, cancellation restore, partial shortage cancellation, inventory deltas, and audit responses are covered.");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

async function getJson(baseUrl, path, headers) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const json = await response.json();
  assert.equal(response.status, 200, JSON.stringify(json));
  return json;
}

async function writeJson(baseUrl, path, body, headers, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(json));
  return json;
}
