import { createHash } from "node:crypto";

const queueableIntentTypes = new Set([
  "inventory_inquiry",
  "merchant_reply",
  "inventory_confirmation",
  "temporary_hold",
  "duplicate_candidate",
  "shortage_cancellation",
]);

export function buildOrderDraftQueuePlan(recognition, options = {}) {
  const sourceMessages = Array.isArray(recognition?.sourceMessages) ? recognition.sourceMessages : [];
  const draftGroups = Array.isArray(recognition?.draftGroups) ? recognition.draftGroups : [];
  const orderRows = Array.isArray(recognition?.orderRows) ? recognition.orderRows : [];
  const nonOrderIntents = Array.isArray(recognition?.nonOrderIntents) ? recognition.nonOrderIntents : [];
  const batchId = cleanText(options.batchId) || buildStableId("BATCH", sourceMessages.map((item) => item.id));
  const sourceById = new Map(sourceMessages.map((item) => [item.id, item]));
  const intentById = new Map(nonOrderIntents.map((item) => [item.id, item]));
  const assignedSourceMessageIds = new Set();
  const items = [];

  for (const group of draftGroups) {
    const relatedIntents = nonOrderIntents.filter((intent) => intent.relatedOrderGroupId === group.id);
    const sourceMessageIds = uniqueText([
      ...(group.sourceMessageIds ?? []),
      ...relatedIntents.map((intent) => intent.id),
    ]);
    const source = resolveSourceMessages(sourceMessageIds, sourceById);
    sourceMessageIds.forEach((id) => assignedSourceMessageIds.add(id));
    items.push(buildQueueItem({
      batchId,
      kind: "order_draft",
      sourceKey: group.id,
      status: "待审核",
      customerId: group.customerId,
      conversationId: group.conversationId,
      originalOrderGroupId: group.id,
      sourceMessages: source,
      rows: orderRows.filter((row) => row.originalOrderGroupId === group.id),
      nonOrderIntents: relatedIntents,
      requiresReview: relatedIntents.some((intent) => intent.requiresReview === true),
    }));
  }

  const clusteredIntentIds = new Set();
  for (const intent of nonOrderIntents) {
    if (assignedSourceMessageIds.has(intent.id) || clusteredIntentIds.has(intent.id)) continue;
    if (!queueableIntentTypes.has(intent.intentType)) continue;
    if (intent.relatedMessageId && intentById.has(intent.relatedMessageId)) continue;

    const cluster = [
      intent,
      ...nonOrderIntents.filter((candidate) => candidate.relatedMessageId === intent.id),
    ];
    cluster.forEach((item) => clusteredIntentIds.add(item.id));
    const sourceMessageIds = uniqueText(cluster.map((item) => item.id));
    const source = resolveSourceMessages(sourceMessageIds, sourceById);
    sourceMessageIds.forEach((id) => assignedSourceMessageIds.add(id));
    const kind = mapIntentQueueKind(intent);
    items.push(buildQueueItem({
      batchId,
      kind,
      sourceKey: intent.id,
      status: mapIntentQueueStatus(intent),
      customerId: intent.customerId,
      conversationId: intent.conversationId,
      sourceMessages: source,
      rows: [],
      nonOrderIntents: cluster,
      requiresReview: intent.requiresReview === true || kind === "duplicate_review",
    }));
  }

  items.sort((left, right) => left.firstSourceSequence - right.firstSourceSequence || left.queueItemId.localeCompare(right.queueItemId));
  const unassignedSourceMessages = sourceMessages.filter((item) => !assignedSourceMessageIds.has(item.id));

  return {
    version: "order-draft-queue-plan-v1",
    batchId,
    sourceMessages,
    items,
    unassignedSourceMessages,
    summary: {
      sourceMessageCount: sourceMessages.length,
      queueItemCount: items.length,
      orderDraftCount: items.filter((item) => item.kind === "order_draft").length,
      intentDraftCount: items.filter((item) => item.kind !== "order_draft").length,
      reviewItemCount: items.filter((item) => item.requiresReview).length,
      unassignedSourceMessageCount: unassignedSourceMessages.length,
    },
  };
}

function buildQueueItem(input) {
  const sourceMessages = [...input.sourceMessages].sort(compareSourceMessage);
  return {
    queueItemId: buildStableId("QITEM", [input.batchId, input.kind, input.sourceKey]),
    batchId: input.batchId,
    kind: input.kind,
    status: input.status,
    customerId: cleanText(input.customerId ?? sourceMessages.find((item) => item.customerId)?.customerId),
    conversationId: cleanText(input.conversationId ?? sourceMessages[0]?.conversationId),
    originalOrderGroupId: cleanText(input.originalOrderGroupId),
    sourceMessageIds: sourceMessages.map((item) => item.id),
    sourceMessages,
    sourceText: sourceMessages.map(formatSourceMessage).join("\n"),
    rows: input.rows ?? [],
    nonOrderIntents: input.nonOrderIntents ?? [],
    requiresReview: input.requiresReview === true,
    excludedFromFormalOrder: input.kind !== "order_draft",
    firstSourceSequence: Number(sourceMessages[0]?.sequence ?? 0),
  };
}

function mapIntentQueueKind(intent) {
  if (intent.intentType === "inventory_inquiry") return "inventory_inquiry";
  if (intent.intentType === "temporary_hold") return "temporary_hold";
  if (intent.intentType === "duplicate_candidate") return "duplicate_review";
  if (intent.intentType === "shortage_cancellation") return "cancellation_review";
  return "intent_review";
}

function mapIntentQueueStatus(intent) {
  if (intent.intentType === "inventory_inquiry") return "询库存-待客户确认";
  if (intent.intentType === "temporary_hold") return "临时留货-待确认";
  if (intent.intentType === "duplicate_candidate") return "疑似重复待确认";
  if (intent.intentType === "shortage_cancellation") return intent.status || "库存不足取消-待关联明细";
  return intent.status || "意图待确认";
}

function resolveSourceMessages(ids, sourceById) {
  return ids.map((id) => sourceById.get(id)).filter(Boolean).sort(compareSourceMessage);
}

function compareSourceMessage(left, right) {
  return Number(left.sequence ?? 0) - Number(right.sequence ?? 0)
    || cleanText(left.sentAt).localeCompare(cleanText(right.sentAt))
    || cleanText(left.id).localeCompare(cleanText(right.id));
}

function formatSourceMessage(message) {
  const time = cleanText(message.sentAt);
  const sender = cleanText(message.sender) || "未知发送人";
  return `${time ? `[${time}] ` : ""}${sender}：${cleanText(message.text)}`;
}

function buildStableId(prefix, parts) {
  const digest = createHash("sha256").update(parts.map(cleanText).join("|")).digest("hex").slice(0, 20).toUpperCase();
  return `${prefix}-${digest}`;
}

function uniqueText(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function cleanText(value) {
  return String(value ?? "").trim();
}
