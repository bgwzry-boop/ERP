import assert from "node:assert/strict";

import { customers, initialInventories } from "../src/data/fixtures.js";
import { recognizeOrderConversation } from "../src/lib/orderConversationRecognition.js";
import {
  orderConversationCorpus,
  orderConversationCorpusVersion,
} from "../shared/orderConversationCorpus.mjs";

assert.match(orderConversationCorpusVersion, /^order-conversation-corpus-v\d+$/);
assert(orderConversationCorpus.length > 0, "the order conversation corpus must contain at least one confirmed case");

const caseIds = new Set();
for (const sample of orderConversationCorpus) {
  assert(!caseIds.has(sample.id), `duplicate corpus case id: ${sample.id}`);
  caseIds.add(sample.id);
  assert.equal(sample.sourceKind, "confirmed_anonymized_business_case");
  assert(sample.messages.length > 0, `${sample.id} must retain source messages`);
  assertNoDirectIdentifiers(sample);

  const messageIds = new Set();
  for (const message of sample.messages) {
    assert(!messageIds.has(message.id), `${sample.id} has duplicate message id ${message.id}`);
    messageIds.add(message.id);
  }

  const recognition = recognizeOrderConversation(sample.messages, {
    customers,
    inventories: initialInventories,
    currentDraftStatus: sample.options.currentDraftStatus,
    now: () => new Date(sample.options.now),
  });

  for (const [key, expectedValue] of Object.entries(sample.expected.summary)) {
    assert.equal(recognition.summary[key], expectedValue, `${sample.id} summary.${key}`);
  }
  for (const [messageId, expectedIntent] of Object.entries(sample.expected.messageIntents)) {
    assert.equal(
      recognition.sourceMessages.find((message) => message.id === messageId)?.intentType,
      expectedIntent,
      `${sample.id} message ${messageId}`,
    );
  }
  for (const expectedRow of sample.expected.rows) {
    const row = recognition.orderRows.find((item) =>
      item.sourceMessageId === expectedRow.sourceMessageId
      && item.color === expectedRow.color
      && Number(item.qty) === Number(expectedRow.qty));
    assert(row, `${sample.id} missing expected row ${JSON.stringify(expectedRow)}`);
    for (const [key, expectedValue] of Object.entries(expectedRow)) {
      if (["sourceMessageId", "requiresDimensionConfirmation"].includes(key)) continue;
      assert.equal(row[key], expectedValue, `${sample.id} row ${expectedRow.sourceMessageId}.${key}`);
    }
    if (expectedRow.requiresDimensionConfirmation) {
      assert.equal(row.dimensionEvidence?.requiresConfirmation, true);
      assert.equal(row.fieldReviews?.find((review) => review.field === "size")?.status, "pending");
    }
  }
  assert.equal(recognition.temporaryHolds[0]?.expiresAt, sample.expected.holdExpiresAt);
  assert.equal(
    recognition.sourceMessages.find((message) => message.intentType === "duplicate_candidate")?.duplicateOf,
    sample.expected.duplicateOf,
  );
}

console.log(`Order conversation corpus check passed: ${orderConversationCorpus.length} versioned anonymized case(s) satisfy traceability and recognition contracts.`);

function assertNoDirectIdentifiers(sample) {
  const serialized = JSON.stringify(sample);
  assert(!/(?:\+?86[- ]?)?1[3-9]\d{9}/.test(serialized), `${sample.id} contains a mobile number`);
  assert(!/\b\d{15,18}[0-9Xx]\b/.test(serialized), `${sample.id} contains an identity number candidate`);
  assert(!/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(serialized), `${sample.id} contains an email address`);
  assert(!/张三服饰|美的空调|白鲸自营店/.test(serialized), `${sample.id} contains a prototype customer name`);
}
