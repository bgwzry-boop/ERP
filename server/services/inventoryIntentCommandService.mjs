import { createHash } from "node:crypto";

export function createInventoryIntentCommandService(options = {}) {
  const now = options.now ?? (() => new Date());

  return {
    listIntents,
    listTemporaryHolds,
    createTemporaryHold,
    releaseTemporaryHold,
    extendTemporaryHold,
    expireDueTemporaryHolds,
  };

  function listIntents({ workspace, filters = {} }) {
    const status = cleanText(filters.status);
    const intentType = cleanText(filters.intentType);
    const customerId = cleanText(filters.customerId);
    const sourceDraftId = cleanText(filters.sourceDraftId);
    return (workspace.inventoryIntents ?? [])
      .filter((intent) => !status || intent.intentStatus === status)
      .filter((intent) => !intentType || intent.intentType === intentType)
      .filter((intent) => !customerId || intent.customerId === customerId)
      .filter((intent) => !sourceDraftId || intent.sourceDraftId === sourceDraftId)
      .sort(compareUpdatedAtDesc)
      .map((intent) => toIntentSummary(workspace, intent));
  }

  function listTemporaryHolds({ workspace, filters = {} }) {
    const status = cleanText(filters.status);
    const customerId = cleanText(filters.customerId);
    return (workspace.inventoryReservations ?? [])
      .filter((reservation) => reservation.reservationType === "临时留货")
      .filter((reservation) => !status || reservation.status === status)
      .filter((reservation) => !customerId || reservation.customerId === customerId)
      .sort((left, right) => Date.parse(right.createdAt ?? 0) - Date.parse(left.createdAt ?? 0))
      .map((reservation) => toHoldSummary(workspace, reservation));
  }

  async function createTemporaryHold({ workspace, intentId, body = {}, operatorId }) {
    const intent = findIntent(workspace, intentId);
    if (!intent) return notFound("INVENTORY_INTENT_NOT_FOUND");
    if (intent.intentType !== "temporary_hold") {
      return businessError(409, "INVENTORY_INTENT_NOT_HOLD_REQUEST", "Only a temporary-hold request can create inventory hold.");
    }
    const expectedRevision = positiveInteger(body.expectedRevision);
    if (!expectedRevision) return validation("expectedRevision must be a positive integer.");
    const candidateResult = resolveHoldCandidate(intent, body);
    if (candidateResult.error) return candidateResult.error;
    const inventoryResult = resolveInventoryItem(workspace, candidateResult.candidate, body.inventoryItemId);
    if (inventoryResult.error) return inventoryResult.error;
    const qty = positiveInteger(body.qty ?? candidateResult.candidate.qty);
    if (!qty) return validation("qty must be a positive integer.");
    const requestedExpiresAt = cleanText(body.expiresAt);
    if (intent.candidate?.requiresExpiryReview === true && !requestedExpiresAt) {
      return businessError(409, "TEMPORARY_HOLD_EXPIRY_REVIEW_REQUIRED", "A future expiry must be confirmed for hold requests received at or after 19:30.");
    }
    const expiresAt = normalizeFutureTimestamp(requestedExpiresAt || intent.candidate?.expiresAt, now());
    if (!expiresAt) return validation("expiresAt must be a future timestamp.");

    const timestamp = new Date(now()).toISOString();
    const reservationId = buildStableId("HOLD", intent.id);
    const inventoryItem = inventoryResult.inventoryItem;
    const reservedBefore = number(inventoryItem.reserved ?? inventoryItem.reservedQty);
    const reservation = {
      reservationId,
      sourceIntentId: intent.id,
      customerId: intent.customerId,
      sourceMessageId: intent.sourceMessageId,
      inventoryItemId: inventoryItem.id,
      reservedQty: qty,
      reservationType: "临时留货",
      status: "生效",
      expiresAt,
      metadata: {
        candidateIndex: candidateResult.index,
        candidate: candidateResult.candidate,
        authorizedReason: cleanText(body.reason) || "客户明确要求临时留货",
      },
      revision: 1,
      createdBy: operatorId,
      createdAt: timestamp,
    };
    const ledger = {
      ledgerId: buildStableId("LEDGER-HOLD", `${intent.id}:${expectedRevision + 1}`),
      inventoryItemId: inventoryItem.id,
      changeType: "临时留货占用",
      qtyBefore: reservedBefore,
      qtyChange: qty,
      qtyAfter: reservedBefore + qty,
      sourceType: "inventory_temporary_hold",
      sourceId: intent.id,
      operatorId,
      confirmedBy: operatorId,
      occurredAt: timestamp,
      createdAt: timestamp,
      reason: cleanText(body.reason) || "客户明确要求临时留货",
      remark: `留货至 ${expiresAt}`,
    };
    const operationLog = buildOperationLog({
      action: "create_temporary_inventory_hold",
      targetId: intent.id,
      operatorId,
      before: intent,
      after: { reservationId, inventoryItemId: inventoryItem.id, qty, expiresAt },
      reason: ledger.reason,
      idempotencyKey: body.idempotencyKey,
      timestamp,
    });
    try {
      const result = await workspace.inventoryIntentTransactionRepository.createTemporaryHold({
        workspace,
        intent,
        expectedRevision,
        inventoryItem,
        reservation,
        inventoryLedgerEntry: ledger,
        operationLog,
        updatedAt: timestamp,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { intentId, expectedRevision, inventoryItemId: inventoryItem.id, qty, expiresAt, operatorId },
      });
      return success(toMutationResponse(result));
    } catch (error) {
      return repositoryError(error);
    }
  }

  async function releaseTemporaryHold({ workspace, reservationId, body = {}, operatorId, expired = false }) {
    const reservation = findReservation(workspace, reservationId);
    if (!reservation || reservation.reservationType !== "临时留货") return notFound("TEMPORARY_HOLD_NOT_FOUND");
    const intent = findIntent(workspace, reservation.sourceIntentId);
    if (!intent) return notFound("INVENTORY_INTENT_NOT_FOUND");
    const expectedRevision = positiveInteger(body.expectedRevision ?? (expired ? intent.revision : 0));
    if (!expectedRevision) return validation("expectedRevision must be a positive integer.");
    const timestamp = new Date(now()).toISOString();
    const targetStatus = expired ? "已过期" : "已取消";
    const reason = expired ? "临时留货已到期自动释放" : cleanText(body.reason) || "办公室主动释放临时留货";
    const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
    if (!inventoryItem) return notFound("INVENTORY_ITEM_NOT_FOUND");
    const qty = number(reservation.reservedQty ?? reservation.qty);
    const reservedBefore = number(inventoryItem.reserved ?? inventoryItem.reservedQty);
    const ledger = {
      ledgerId: buildStableId("LEDGER-HOLD-RELEASE", `${reservationId}:${expectedRevision + 1}:${targetStatus}`),
      inventoryItemId: reservation.inventoryItemId,
      changeType: expired ? "临时留货到期释放" : "临时留货主动释放",
      qtyBefore: reservedBefore,
      qtyChange: -qty,
      qtyAfter: Math.max(0, reservedBefore - qty),
      sourceType: expired ? "inventory_temporary_hold_expiry" : "inventory_temporary_hold_release",
      sourceId: reservationId,
      operatorId: operatorId || "",
      confirmedBy: operatorId || "",
      occurredAt: timestamp,
      createdAt: timestamp,
      reason,
      remark: `释放临时留货 ${qty}`,
    };
    const operationLog = buildOperationLog({
      action: expired ? "expire_temporary_inventory_hold" : "release_temporary_inventory_hold",
      targetId: intent.id,
      operatorId: operatorId || "",
      before: { intent, reservation },
      after: { status: targetStatus, releasedQty: qty },
      reason,
      idempotencyKey: body.idempotencyKey,
      timestamp,
    });
    try {
      const result = await workspace.inventoryIntentTransactionRepository.releaseTemporaryHold({
        workspace,
        intentId: intent.id,
        reservationId,
        inventoryItemId: reservation.inventoryItemId,
        expectedRevision,
        targetStatus,
        inventoryLedgerEntry: ledger,
        operationLog,
        updatedAt: timestamp,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { reservationId, expectedRevision, targetStatus, operatorId: operatorId || "" },
      });
      return success(toMutationResponse(result));
    } catch (error) {
      return repositoryError(error);
    }
  }

  async function extendTemporaryHold({ workspace, reservationId, body = {}, operatorId }) {
    const reservation = findReservation(workspace, reservationId);
    if (!reservation || reservation.reservationType !== "临时留货") return notFound("TEMPORARY_HOLD_NOT_FOUND");
    const intent = findIntent(workspace, reservation.sourceIntentId);
    if (!intent) return notFound("INVENTORY_INTENT_NOT_FOUND");
    const expectedRevision = positiveInteger(body.expectedRevision);
    if (!expectedRevision) return validation("expectedRevision must be a positive integer.");
    const expiresAt = normalizeFutureTimestamp(body.expiresAt, now());
    if (!expiresAt || Date.parse(expiresAt) <= Date.parse(reservation.expiresAt ?? 0)) {
      return validation("expiresAt must be later than the current expiry.");
    }
    const reason = cleanText(body.reason);
    if (!reason) return validation("reason is required when extending a temporary hold.");
    const timestamp = new Date(now()).toISOString();
    const operationLog = buildOperationLog({
      action: "extend_temporary_inventory_hold",
      targetId: intent.id,
      operatorId,
      before: { expiresAt: reservation.expiresAt },
      after: { expiresAt },
      reason,
      idempotencyKey: body.idempotencyKey,
      timestamp,
    });
    try {
      const result = await workspace.inventoryIntentTransactionRepository.extendTemporaryHold({
        workspace,
        intentId: intent.id,
        reservationId,
        expectedRevision,
        expiresAt,
        operationLog,
        updatedAt: timestamp,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { reservationId, expectedRevision, expiresAt, reason, operatorId },
      });
      return success(toMutationResponse(result));
    } catch (error) {
      return repositoryError(error);
    }
  }

  async function expireDueTemporaryHolds({ workspace, body = {} }) {
    const currentTime = new Date(now());
    const cutoff = normalizeTimestamp(body.cutoffAt ?? currentTime);
    if (!cutoff || Date.parse(cutoff) > currentTime.getTime()) {
      return validation("cutoffAt cannot be in the future.");
    }
    const due = (workspace.inventoryReservations ?? []).filter((reservation) =>
      reservation.reservationType === "临时留货"
      && reservation.status === "生效"
      && Date.parse(reservation.expiresAt ?? 0) <= Date.parse(cutoff),
    );
    const expired = [];
    const skipped = [];
    for (const reservation of due) {
      const intent = findIntent(workspace, reservation.sourceIntentId);
      if (!intent) {
        skipped.push({ reservationId: reservation.id, code: "INVENTORY_INTENT_NOT_FOUND" });
        continue;
      }
      const result = await releaseTemporaryHold({
        workspace,
        reservationId: reservation.id ?? reservation.reservationId,
        body: {
          clientRevision: intent.revision,
          idempotencyKey: buildStableId("EXPIRE", `${reservation.id}:${reservation.expiresAt}`),
        },
        operatorId: "",
        expired: true,
      });
      if (result.error) skipped.push({ reservationId: reservation.id, code: result.code });
      else expired.push(result.response);
    }
    return success({ cutoffAt: cutoff, dueCount: due.length, expiredCount: expired.length, expired, skipped });
  }
}

function resolveHoldCandidate(intent, body) {
  const candidates = Array.isArray(intent.candidate?.parsedCandidates) ? intent.candidate.parsedCandidates : [];
  const requestedIndex = body.candidateIndex === undefined ? (candidates.length === 1 ? 0 : -1) : Number(body.candidateIndex);
  if (!Number.isInteger(requestedIndex) || requestedIndex < 0 || requestedIndex >= candidates.length) {
    return { error: businessError(422, "TEMPORARY_HOLD_CANDIDATE_REQUIRED", "candidateIndex must select one parsed hold candidate.") };
  }
  return { candidate: candidates[requestedIndex], index: requestedIndex };
}

function resolveInventoryItem(workspace, candidate, requestedId) {
  if (cleanText(requestedId)) {
    const item = findInventoryItem(workspace, requestedId);
    if (!item) return { error: notFound("INVENTORY_ITEM_NOT_FOUND") };
    if (!sameText(item.size, candidate.size)
      || !sameText(item.color, candidate.color ?? candidate.bagColor)
      || !optionalSame(item.handle ?? item.handleType, candidate.handle ?? candidate.handleType)
      || !optionalSame(item.style, candidate.style)) {
      return { error: businessError(409, "TEMPORARY_HOLD_SPEC_MISMATCH", "The selected inventory item does not match the hold candidate.") };
    }
    return { inventoryItem: item };
  }
  const matches = (workspace.inventories ?? []).filter((item) =>
    sameText(item.size, candidate.size)
    && sameText(item.color, candidate.color ?? candidate.bagColor)
    && optionalSame(item.handle ?? item.handleType, candidate.handle ?? candidate.handleType)
    && optionalSame(item.style, candidate.style),
  );
  if (matches.length !== 1) {
    return { error: businessError(422, "TEMPORARY_HOLD_INVENTORY_SELECTION_REQUIRED", "inventoryItemId is required when the candidate does not match exactly one inventory item.") };
  }
  return { inventoryItem: matches[0] };
}

function toIntentSummary(workspace, intent) {
  const reservation = intent.relatedReservationId ? findReservation(workspace, intent.relatedReservationId) : null;
  return { ...intent, hold: reservation ? toHoldSummary(workspace, reservation) : null };
}

function toHoldSummary(workspace, reservation) {
  return {
    ...reservation,
    intent: findIntent(workspace, reservation.sourceIntentId),
    inventoryItem: findInventoryItem(workspace, reservation.inventoryItemId),
  };
}

function toMutationResponse(result) {
  return {
    intent: result.intent,
    hold: result.reservation,
    inventoryItem: result.inventoryItem,
    ledger: result.ledger,
    operationLogId: result.operationLogId,
  };
}

function buildOperationLog({ action, targetId, operatorId, before, after, reason, idempotencyKey, timestamp }) {
  return {
    id: buildStableId("LOG-INTENT", `${action}:${targetId}:${idempotencyKey || timestamp}`),
    targetType: "inventory_intent",
    targetId,
    action,
    before,
    after,
    reason,
    operatorId,
    pageKey: "inventory",
    occurredAt: timestamp,
    createdAt: timestamp,
  };
}

function buildStableId(prefix, value) {
  return `${prefix}-${createHash("sha256").update(String(value)).digest("hex").slice(0, 20).toUpperCase()}`;
}

function findIntent(workspace, id) {
  return (workspace.inventoryIntents ?? []).find((item) => (item.id ?? item.intentId) === id) ?? null;
}

function findReservation(workspace, id) {
  return (workspace.inventoryReservations ?? []).find((item) => (item.id ?? item.reservationId) === id) ?? null;
}

function findInventoryItem(workspace, id) {
  return (workspace.inventories ?? []).find((item) => (item.id ?? item.inventoryItemId) === id) ?? null;
}

function repositoryError(error) {
  const code = cleanText(error?.code) || "INVENTORY_INTENT_WRITE_FAILED";
  return businessError(Number(error?.statusCode ?? 409), code, error?.message || code);
}

function success(response) {
  return { response };
}

function notFound(code) {
  return { notFound: true, code };
}

function validation(message) {
  return businessError(422, "VALIDATION_ERROR", message);
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}

function normalizeFutureTimestamp(value, reference) {
  const timestamp = normalizeTimestamp(value);
  return timestamp && Date.parse(timestamp) > new Date(reference).getTime() ? timestamp : "";
}

function normalizeTimestamp(value) {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function sameText(left, right) {
  return cleanText(left) && cleanText(left) === cleanText(right);
}

function optionalSame(left, right) {
  return !cleanText(right) || cleanText(left) === cleanText(right);
}

function compareUpdatedAtDesc(left, right) {
  return Date.parse(right.updatedAt ?? 0) - Date.parse(left.updatedAt ?? 0);
}

function cleanText(value) {
  return String(value ?? "").trim();
}
