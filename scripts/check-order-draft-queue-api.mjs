import assert from "node:assert/strict";

import { createApiServer } from "../server/apiServer.mjs";
import { orderConversationCorpus } from "../shared/orderConversationCorpus.mjs";

const server = createApiServer({ runtimeMode: "test", applyProductionEnvFile: false });
await server.ready;
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

try {
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const headers = { "content-type": "application/json", "x-erp-user-id": "U-OFFICE-A" };
  const sample = orderConversationCorpus[0];
  const requestBody = {
    sourceMessages: sample.messages,
    currentDraftStatus: sample.options.currentDraftStatus,
    idempotencyKey: "order-draft-queue-api-corpus-001",
  };
  const created = await writeJson(baseUrl, "/order-draft-queues/recognize", requestBody, headers);

  assert.equal(created.queueBatch.summary.sourceMessageCount, 9);
  assert.equal(created.queueBatch.summary.queueItemCount, 5);
  assert.equal(created.queueBatch.summary.orderDraftCount, 2);
  assert.equal(created.queueBatch.summary.intentDraftCount, 3);
  assert.equal(created.queueBatch.summary.unassignedSourceMessageCount, 0);
  assert.equal(created.drafts.length, 5);
  assert.equal(new Set(created.drafts.map((item) => item.draft.draftId)).size, 5);

  const orderDrafts = created.drafts.filter((item) => item.kind === "order_draft");
  assert.deepEqual(orderDrafts.map((item) => item.lines.length), [2, 2]);
  assert.notEqual(orderDrafts[0].originalOrderGroupId, orderDrafts[1].originalOrderGroupId);
  assert.equal(orderDrafts[1].inventoryIntents[0].intentType, "shortage_cancellation");
  assert.equal(orderDrafts[1].inventoryIntents[0].sourceDraftId, orderDrafts[1].draft.draftId);

  const crossDraftIntent = orderDrafts[1].inventoryIntents.find((intent) => intent.intentType === "shortage_cancellation");
  const crossDraftTarget = orderDrafts[0];
  const crossDraftTargetLine = crossDraftTarget.lines[0];
  const linkedCancellation = await writeJson(
    baseUrl,
    `/order-drafts/${encodeURIComponent(crossDraftTarget.draft.draftId)}/cross-draft-shortage-cancellation`,
    {
      clientRevision: crossDraftTarget.draft.clientRevision,
      draftLineId: crossDraftTargetLine.draftLineId,
      intentId: crossDraftIntent.intentId,
      reason: "办公室核对来源消息后关联到当前草稿明细",
      idempotencyKey: "order-draft-queue-cross-cancel-001",
    },
    headers,
  );
  assert.equal(linkedCancellation.line.recognitionEvidence.excludedFromConfirmation, true);
  assert.equal(linkedCancellation.line.recognitionEvidence.crossDraftCancellation.sourceDraftId, orderDrafts[1].draft.draftId);
  assert.equal(linkedCancellation.inventoryIntent.sourceDraftId, orderDrafts[1].draft.draftId);
  assert.equal(linkedCancellation.inventoryIntent.candidate.targetDraftId, orderDrafts[0].draft.draftId);

  const inquiryDraft = created.drafts.find((item) => item.kind === "inventory_inquiry");
  assert.equal(inquiryDraft.lines.length, 0);
  assert.deepEqual(inquiryDraft.inventoryIntents.map((intent) => intent.intentType), [
    "inventory_inquiry",
    "merchant_reply",
    "inventory_confirmation",
  ]);
  assert(inquiryDraft.inventoryIntents.every((intent) => intent.sourceDraftId === inquiryDraft.draft.draftId));
  assert.equal(created.drafts.find((item) => item.kind === "temporary_hold").inventoryIntents.length, 1);
  assert.equal(created.drafts.find((item) => item.kind === "duplicate_review").inventoryIntents.length, 1);

  const replay = await writeJson(baseUrl, "/order-draft-queues/recognize", requestBody, headers);
  assert.deepEqual(
    replay.drafts.map((item) => item.draft.draftId),
    created.drafts.map((item) => item.draft.draftId),
  );

  const queueList = await getJson(
    baseUrl,
    `/order-drafts?queueOnly=true&queueBatchId=${encodeURIComponent(created.queueBatch.batchId)}&pageSize=20`,
    headers,
  );
  assert.equal(queueList.total, 5);
  assert.equal(queueList.summary.orderDraftCount, 2);
  assert.equal(queueList.summary.intentDraftCount, 3);
  assert(queueList.items.every((draft) => draft.recognitionContext.queueBatchId === created.queueBatch.batchId));
  const linkedSourceDraft = queueList.items.find((draft) => draft.id === orderDrafts[1].draft.draftId);
  assert.equal(linkedSourceDraft.inventoryIntents[0].intentStatus, "库存不足取消-已关联跨草稿明细");

  const changed = structuredClone(requestBody);
  changed.sourceMessages.unshift({
    id: "CORPUS-001-NEW-EARLY-ORDER",
    conversationId: "ANON-GROUP-001",
    customerId: "C001",
    sender: "客户甲",
    senderRole: "customer",
    sentAt: "2026-07-12 08:30",
    text: "30*38 红色50个 明天自提",
  });
  const conflict = await writeJson(baseUrl, "/order-draft-queues/recognize", changed, headers, 409);
  assert.equal(conflict.code, "ORDER_DRAFT_QUEUE_IDEMPOTENCY_CONFLICT");
  const queueListAfterConflict = await getJson(
    baseUrl,
    `/order-drafts?queueOnly=true&queueBatchId=${encodeURIComponent(created.queueBatch.batchId)}&pageSize=20`,
    headers,
  );
  assert.equal(queueListAfterConflict.total, 5);

  console.log("Order draft queue API check passed: one conversation creates independent order/intent drafts, retries are stable, changed reuse conflicts, and queue reads preserve source boundaries.");
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
    headers,
    body: JSON.stringify(body),
  });
  const json = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(json));
  return json;
}
