import { createHash } from "node:crypto";

const actionableIntentTypes = new Set([
  "inventory_inquiry",
  "merchant_reply",
  "inventory_confirmation",
  "temporary_hold",
  "shortage_cancellation",
  "duplicate_candidate",
]);

export function buildInventoryIntentsFromRecognition({ recognition, draftId, customerId, operatorId, now = () => new Date() }) {
  const timestamp = new Date(now()).toISOString();
  return (recognition?.nonOrderIntents ?? [])
    .filter((intent) => actionableIntentTypes.has(cleanText(intent.intentType)))
    .map((intent) => normalizeInventoryIntent({
      id: buildInventoryIntentId(draftId, intent),
      sourceDraftId: draftId,
      sourceMessageId: intent.id,
      conversationId: intent.conversationId,
      customerId: intent.customerId || customerId,
      intentType: intent.intentType,
      intentStatus: intent.status,
      sourceText: intent.text,
      candidate: {
        parsedCandidates: intent.parsedCandidates ?? [],
        relatedMessageId: intent.relatedMessageId ?? "",
        relatedOrderGroupId: intent.relatedOrderGroupId ?? "",
        relatedDraftLineIds: normalizeTextList(intent.relatedDraftLineIds),
        targetBasis: cleanText(intent.targetBasis),
        requiresReview: intent.requiresReview === true,
        expiresAt: intent.expiresAt ?? "",
        requiresExpiryReview: intent.requiresExpiryReview === true,
        expiryRule: intent.expiryRule ?? "",
        holdType: intent.holdType ?? "",
        reservesInventory: intent.reservesInventory ?? false,
        duplicateOf: intent.duplicateOf ?? "",
        sender: intent.sender ?? "",
        senderId: intent.senderId ?? "",
        senderRole: intent.senderRole ?? "customer",
        sentAt: intent.sentAt ?? "",
        sequence: intent.sequence ?? 0,
      },
      cancellationScope: intent.cancellationScope,
      revision: 1,
      createdBy: operatorId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
    .filter(Boolean);
}

export function normalizeInventoryIntents(value) {
  return (Array.isArray(value) ? value : []).map(normalizeInventoryIntent).filter(Boolean);
}

export function normalizeInventoryIntent(value) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id ?? value.intentId ?? value.intent_id);
  const sourceDraftId = cleanText(value.sourceDraftId ?? value.source_draft_id);
  const sourceMessageId = cleanText(value.sourceMessageId ?? value.source_message_id);
  const intentType = cleanText(value.intentType ?? value.intent_type);
  if (!id || !sourceDraftId || !sourceMessageId || !intentType) return null;
  const createdAt = normalizeTimestamp(value.createdAt ?? value.created_at, new Date().toISOString());
  return {
    ...value,
    id,
    intentId: id,
    sourceDraftId,
    sourceMessageId,
    conversationId: cleanText(value.conversationId ?? value.conversation_id),
    customerId: cleanText(value.customerId ?? value.customer_id),
    intentType,
    intentStatus: cleanText(value.intentStatus ?? value.intent_status ?? value.status) || "待处理",
    sourceText: cleanText(value.sourceText ?? value.source_text),
    candidate: normalizeObject(value.candidate ?? value.candidateJson ?? value.candidate_json),
    cancellationScope: cleanText(value.cancellationScope ?? value.cancellation_scope),
    relatedReservationId: cleanText(value.relatedReservationId ?? value.related_reservation_id),
    relatedOrderLineId: cleanText(value.relatedOrderLineId ?? value.related_order_line_id),
    revision: Math.max(1, toInteger(value.revision, 1)),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    createdAt,
    updatedAt: normalizeTimestamp(value.updatedAt ?? value.updated_at, createdAt),
  };
}

export function buildInventoryIntentId(draftId, intent) {
  const digest = createHash("sha256")
    .update([
      cleanText(draftId),
      cleanText(intent?.conversationId),
      cleanText(intent?.id ?? intent?.sourceMessageId),
      cleanText(intent?.intentType),
    ].join(":"))
    .digest("hex")
    .slice(0, 20)
    .toUpperCase();
  return `INT-${digest}`;
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeTextList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(cleanText).filter(Boolean))];
}

function normalizeTimestamp(value, fallback) {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function toInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
