import assert from "node:assert/strict";

import { buildOrderDraftQueuePlan } from "../server/orderDraftQueueDomain.mjs";
import { orderConversationCorpus } from "../shared/orderConversationCorpus.mjs";
import { customers, initialInventories } from "../src/data/fixtures.js";
import { recognizeOrderConversation } from "../src/lib/orderConversationRecognition.js";

const sample = orderConversationCorpus[0];
const recognition = recognizeOrderConversation(sample.messages, {
  customers,
  inventories: initialInventories,
  currentDraftStatus: sample.options.currentDraftStatus,
  now: () => new Date(sample.options.now),
});
const plan = buildOrderDraftQueuePlan(recognition, { batchId: "QUEUE-BATCH-CORPUS-001" });

assert.equal(plan.version, "order-draft-queue-plan-v1");
assert.equal(plan.summary.sourceMessageCount, 9);
assert.equal(plan.summary.queueItemCount, 5);
assert.equal(plan.summary.orderDraftCount, 2);
assert.equal(plan.summary.intentDraftCount, 3);
assert.equal(plan.summary.unassignedSourceMessageCount, 0);
assert.equal(new Set(plan.items.flatMap((item) => item.sourceMessageIds)).size, 9);

const orderItems = plan.items.filter((item) => item.kind === "order_draft");
assert.deepEqual(orderItems.map((item) => item.rows.length), [2, 2]);
assert.notEqual(orderItems[0].originalOrderGroupId, orderItems[1].originalOrderGroupId);
assert.deepEqual(
  orderItems[1].sourceMessageIds,
  ["CORPUS-001-PM-ORDER", "CORPUS-001-PM-ADD", "CORPUS-001-SHORTAGE-CANCEL"],
);
assert.equal(orderItems[1].nonOrderIntents[0].intentType, "shortage_cancellation");

const inquiryItem = plan.items.find((item) => item.kind === "inventory_inquiry");
assert.deepEqual(inquiryItem.sourceMessageIds, [
  "CORPUS-001-INQUIRY",
  "CORPUS-001-OFFICE-REPLY",
  "CORPUS-001-CUSTOMER-CONFIRM",
]);
assert.equal(inquiryItem.rows.length, 0);
assert.equal(inquiryItem.excludedFromFormalOrder, true);
assert.equal(plan.items.find((item) => item.kind === "temporary_hold").status, "临时留货-待确认");
assert.equal(plan.items.find((item) => item.kind === "duplicate_review").requiresReview, true);

const replayedPlan = buildOrderDraftQueuePlan(recognition, { batchId: "QUEUE-BATCH-CORPUS-001" });
assert.deepEqual(replayedPlan, plan, "queue planning must be deterministic for safe retries");

console.log("Order draft queue domain check passed: source messages split into two independent order drafts and three non-order intent contexts without merging or loss.");
