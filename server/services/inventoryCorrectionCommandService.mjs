import { createHash, randomUUID } from "node:crypto";
import { validateBusinessAttachment } from "./businessAttachmentValidationService.mjs";

export function createInventoryCorrectionCommandService({
  buildOperationLog,
  buildTodo,
  findAttachment,
  findInventoryItem,
  toInventoryQuantitySnapshot,
  now = () => new Date(),
} = {}) {
  requireFunction(buildOperationLog, "buildOperationLog");
  requireFunction(buildTodo, "buildTodo");
  requireFunction(findAttachment, "findAttachment");
  requireFunction(findInventoryItem, "findInventoryItem");
  requireFunction(toInventoryQuantitySnapshot, "toInventoryQuantitySnapshot");

  return {
    async createCorrectionDraft({ workspace, body = {}, operatorId }) {
      const inventoryItem = findInventoryItem(workspace, body.inventoryItemId);
      if (!inventoryItem) return notFound("INVENTORY_ITEM_NOT_FOUND");

      const expectedQty = parseQuantity(body.expectedQty);
      const actualQty = parseQuantity(body.actualQty);
      if (expectedQty === null || actualQty === null) {
        return businessError(422, "VALIDATION_ERROR", "expectedQty and actualQty must be non-negative integers");
      }
      const currentOnHandQty = getOnHandQty(inventoryItem);
      if (expectedQty !== currentOnHandQty) {
        return businessError(
          409,
          "INVENTORY_QUANTITY_CHANGED",
          "Inventory quantity changed before the correction draft was created.",
        );
      }
      const attachmentIds = stringList(body.attachmentIds);
      if (attachmentIds.length) {
        return businessError(
          422,
          "INVENTORY_CORRECTION_ATTACHMENT_FLOW_UNAVAILABLE",
          "Inventory correction attachments require a persisted correction draft and cannot be linked during draft creation yet.",
        );
      }

      const timestamp = nowIso(now);
      const correctionDraftId = buildRecordId("ADJ-API", body.idempotencyKey);
      const todoId = buildRecordId("T-API", body.idempotencyKey, "todo");
      const operationLogId = buildRecordId("LOG-ADJ", body.idempotencyKey, "create");
      const qtyBefore = toInventoryQuantitySnapshot(inventoryItem);
      const requestedQtyAfter = toInventoryQuantitySnapshot(inventoryItem, { onHand: actualQty });
      const reason = cleanText(body.reason) || "manual_review";
      const todo = buildTodo(workspace, {
        id: todoId,
        bizNo: todoId,
        type: "库存修正待确认",
        refType: "inventory_correction",
        refId: correctionDraftId,
        ref: correctionDraftId,
        customerId: "C001",
        summary: `${inventoryItem.size} ${inventoryItem.color} ${inventoryItem.handle} ${inventoryItem.style}：系统 ${expectedQty}，实盘 ${actualQty}，差异 ${actualQty - expectedQty}`,
        latest: "今天",
        urgency: "关注",
        priority: "关注",
        status: "未处理",
        impact: "需有库存调整确认权限账号确认后才改库存",
        createdBy: operatorId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const correctionDraft = {
        id: correctionDraftId,
        correctionDraftId,
        bizNo: correctionDraftId,
        inventoryItemId: inventoryItem.id,
        expectedQty,
        actualQty,
        deltaQty: actualQty - expectedQty,
        status: "待确认生效",
        revision: 1,
        qtyBefore,
        requestedQtyAfter,
        reason,
        remark: cleanText(body.remark),
        attachmentIds,
        operatorId,
        createdBy: operatorId,
        todoId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const operationLog = buildOperationLog(workspace, {
        id: operationLogId,
        targetType: "inventory_correction",
        targetId: correctionDraftId,
        action: "create_inventory_correction_draft",
        operatorId,
        before: qtyBefore,
        after: { status: correctionDraft.status, requestedQtyAfter, todoId },
        reason,
      });
      const todoEvent = buildTodoEvent({
        operationLog,
        todoId,
        eventType: "todo_source:inventory_correction_created",
        eventPayload: { correctionDraftId, inventoryItemId: inventoryItem.id, todo },
        operatorId,
        timestamp,
      });

      return workspace.inventoryCorrectionTransactionRepository.createCorrectionDraft({
        workspace,
        correctionDraft,
        inventoryItem: { ...inventoryItem, revision: positiveRevision(inventoryItem.revision) },
        todo,
        todoEvent,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: sanitizeIdempotencyPayload(body, { operatorId }),
      });
    },

    async linkCorrectionAttachments({ workspace, correctionDraftId, body = {}, operatorId }) {
      if (body.correctionDraftId && cleanText(body.correctionDraftId) !== correctionDraftId) {
        return businessError(422, "VALIDATION_ERROR", "correctionDraftId in path and body must match");
      }
      const beforeDraft = await workspace.inventoryCorrectionTransactionRepository.getCorrectionDraft({
        workspace,
        correctionDraftId,
      });
      if (!beforeDraft) return notFound("INVENTORY_CORRECTION_DRAFT_NOT_FOUND");
      if (beforeDraft.status !== "待确认生效") {
        return businessError(
          409,
          "INVENTORY_CORRECTION_ATTACHMENT_DRAFT_NOT_OPEN",
          "Attachments can only be linked to an open correction draft.",
        );
      }

      const requestedAttachmentIds = stringList(body.attachmentIds);
      if (!requestedAttachmentIds.length) {
        return businessError(422, "INVENTORY_CORRECTION_ATTACHMENT_REQUIRED", "At least one attachment ID is required.");
      }
      const existingAttachmentIds = stringList(beforeDraft.attachmentIds);
      const attachmentIds = [...new Set([...existingAttachmentIds, ...requestedAttachmentIds])];
      if (attachmentIds.length > 10) {
        return businessError(
          422,
          "INVENTORY_CORRECTION_ATTACHMENT_LIMIT",
          "An inventory correction draft supports at most 10 attachments.",
        );
      }
      const attachmentValidation = validateCorrectionAttachments({ workspace, correctionDraftId, attachmentIds });
      if (attachmentValidation.error) return attachmentValidation;
      if (attachmentIds.length === existingAttachmentIds.length) {
        const replayOperationLogId = buildRecordId(
          "LOG-ADJ",
          body.idempotencyKey,
          `attachments:${correctionDraftId}`,
        );
        const replayOperationLog = findById(workspace.operationLogs, replayOperationLogId);
        return {
          correctionDraft: beforeDraft,
          attachmentIds,
          operationLogId: replayOperationLog?.id ?? "",
          unchanged: true,
        };
      }

      const timestamp = nowIso(now);
      const linkedDraft = {
        ...beforeDraft,
        id: correctionDraftId,
        correctionDraftId,
        attachmentIds,
        revision: positiveRevision(beforeDraft.revision) + 1,
        updatedAt: timestamp,
      };
      const operationLog = buildOperationLog(workspace, {
        id: buildRecordId("LOG-ADJ", body.idempotencyKey, `attachments:${correctionDraftId}`),
        targetType: "inventory_correction",
        targetId: correctionDraftId,
        action: "link_inventory_correction_attachments",
        operatorId,
        before: { attachmentIds: existingAttachmentIds, revision: positiveRevision(beforeDraft.revision) },
        after: { attachmentIds, revision: linkedDraft.revision },
        reason: cleanText(body.remark) || "关联库存修正凭证",
      });
      return workspace.inventoryCorrectionTransactionRepository.linkCorrectionAttachments({
        workspace,
        correctionDraft: linkedDraft,
        attachmentIds,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: sanitizeIdempotencyPayload(body, { correctionDraftId, attachmentIds, operatorId }),
      });
    },

    async confirmCorrectionDraft({ workspace, correctionDraftId, body = {}, operatorId }) {
      if (body.correctionDraftId && cleanText(body.correctionDraftId) !== correctionDraftId) {
        return businessError(422, "VALIDATION_ERROR", "correctionDraftId in path and body must match");
      }
      const beforeDraft = await workspace.inventoryCorrectionTransactionRepository.getCorrectionDraft({
        workspace,
        correctionDraftId,
      });
      if (!beforeDraft) return notFound("INVENTORY_CORRECTION_DRAFT_NOT_FOUND");
      if (!['待确认生效', '已确认生效'].includes(beforeDraft.status)) {
        return businessError(
          409,
          "INVENTORY_CORRECTION_DRAFT_NOT_OPEN",
          "Only open correction drafts can be confirmed.",
        );
      }
      const attachmentValidation = validateCorrectionAttachments({
        workspace,
        correctionDraftId,
        attachmentIds: beforeDraft.attachmentIds,
      });
      if (attachmentValidation.error) return attachmentValidation;

      const inventoryItem = findInventoryItem(workspace, beforeDraft.inventoryItemId);
      if (!inventoryItem) return notFound("INVENTORY_ITEM_NOT_FOUND");
      const todo = findById(workspace.todos, beforeDraft.todoId);
      if (!todo) return notFound("INVENTORY_CORRECTION_TODO_NOT_FOUND");

      const timestamp = nowIso(now);
      const qtyBefore = toInventoryQuantitySnapshot(inventoryItem);
      const actualQty = parseQuantity(beforeDraft.actualQty ?? beforeDraft.requestedQtyAfter?.onHand);
      if (actualQty === null) {
        return businessError(409, "INVENTORY_CORRECTION_DRAFT_INVALID", "Correction draft actual quantity is invalid.");
      }
      const qtyAfter = toInventoryQuantitySnapshot(inventoryItem, { onHand: actualQty });
      const reason = cleanText(body.approvalReason) || cleanText(beforeDraft.reason);
      const operationLogId = buildRecordId("LOG-ADJ", body.idempotencyKey, `confirm:${correctionDraftId}`);
      const confirmedDraft = {
        ...beforeDraft,
        id: correctionDraftId,
        correctionDraftId,
        expectedQty: Number(beforeDraft.expectedQty ?? beforeDraft.qtyBefore?.onHand ?? qtyBefore.onHand),
        actualQty,
        deltaQty: actualQty - Number(beforeDraft.expectedQty ?? beforeDraft.qtyBefore?.onHand ?? qtyBefore.onHand),
        status: "已确认生效",
        revision: positiveRevision(beforeDraft.revision) + 1,
        qtyBefore: beforeDraft.qtyBefore ?? qtyBefore,
        requestedQtyAfter: beforeDraft.requestedQtyAfter ?? qtyAfter,
        confirmedBy: operatorId,
        confirmedAt: timestamp,
        updatedAt: timestamp,
      };
      const updatedInventoryItem = {
        ...inventoryItem,
        inStock: actualQty,
        onHandQty: actualQty,
        revision: positiveRevision(inventoryItem.revision) + 1,
        updatedAt: timestamp,
      };
      const ledgerId = buildRecordId("LEDGER", body.idempotencyKey, `confirm:${correctionDraftId}`);
      const inventoryLedger = {
        ledgerId,
        inventoryItemId: inventoryItem.id,
        inventoryKey: inventoryItem.inventoryKey ?? inventoryItem.id,
        size: inventoryItem.size,
        colorName: inventoryItem.color,
        handleType: inventoryItem.handle,
        style: inventoryItem.style,
        zone: inventoryItem.zone,
        inventoryState: inventoryItem.state,
        changeType: "correction",
        qtyBefore: qtyBefore.onHand,
        qtyChange: actualQty - qtyBefore.onHand,
        qtyAfter: actualQty,
        sourceType: "inventory_correction",
        sourceId: correctionDraftId,
        correctionDraftId,
        reason,
        remark: cleanText(body.remark) || cleanText(beforeDraft.remark),
        operatorId,
        confirmedBy: operatorId,
        occurredAt: timestamp,
        createdAt: timestamp,
      };
      const handledTodo = {
        ...todo,
        status: "已处理",
        handled: true,
        handledBy: operatorId,
        handledAt: timestamp,
        handlingResult: "库存修正已确认生效",
        lastAction: "库存修正已确认生效",
        updatedAt: timestamp,
      };
      const operationLog = buildOperationLog(workspace, {
        id: operationLogId,
        targetType: "inventory_correction",
        targetId: correctionDraftId,
        action: "confirm_inventory_correction_draft",
        operatorId,
        before: qtyBefore,
        after: qtyAfter,
        reason,
      });
      const todoEvent = buildTodoEvent({
        operationLog,
        todoId: handledTodo.id,
        eventType: "todo_source:inventory_correction_confirmed",
        eventPayload: { correctionDraftId, inventoryItemId: inventoryItem.id, todo: handledTodo },
        operatorId,
        timestamp,
      });

      return workspace.inventoryCorrectionTransactionRepository.confirmCorrectionDraft({
        workspace,
        correctionDraft: confirmedDraft,
        inventoryItem: updatedInventoryItem,
        inventoryLedger,
        todo: handledTodo,
        todoEvent,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: sanitizeIdempotencyPayload(body, { correctionDraftId, operatorId }),
      });
    },
  };

  function validateCorrectionAttachments({ workspace, correctionDraftId, attachmentIds }) {
    for (const attachmentId of stringList(attachmentIds)) {
      const validation = validateBusinessAttachment({
        workspace,
        attachmentId,
        findAttachment,
        expectedOwnerType: "inventory_correction",
        expectedOwnerId: correctionDraftId,
        expectedPurpose: "inventory_correction_evidence",
        requireUploader: true,
        allowedFileTypes: ["image", "pdf"],
        allowedMimePrefixes: ["image/"],
        allowedMimeTypes: ["application/pdf"],
        errorCodePrefix: "INVENTORY_CORRECTION_ATTACHMENT",
        label: "inventory correction attachment",
      });
      if (!validation.ok) {
        return businessError(validation.statusCode, validation.errorCode, validation.message);
      }
    }
    return { attachmentIds: stringList(attachmentIds) };
  }
}

function buildTodoEvent({ operationLog, todoId, eventType, eventPayload, operatorId, timestamp }) {
  return {
    eventId: `TE-${operationLog.id}`,
    todoId,
    eventType,
    eventPayload,
    operatorId,
    occurredAt: timestamp,
    createdAt: timestamp,
  };
}

function sanitizeIdempotencyPayload(body, context) {
  const { operatorId: ignoredOperatorId, ...requestBody } = body ?? {};
  return { requestBody, context };
}

function buildRecordId(prefix, idempotencyKey, discriminator = "record") {
  const key = cleanText(idempotencyKey);
  const source = key || randomUUID();
  const digest = createHash("sha256").update(`${prefix}:${discriminator}:${source}`).digest("hex").slice(0, 20).toUpperCase();
  return `${prefix}-${digest}`;
}

function getOnHandQty(inventoryItem) {
  return Number(inventoryItem.onHandQty ?? inventoryItem.inStock ?? 0);
}

function parseQuantity(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function positiveRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 1 ? revision : 1;
}

function stringList(value) {
  return Array.isArray(value) ? [...new Set(value.map(cleanText).filter(Boolean))] : [];
}

function findById(rows = [], id) {
  const key = cleanText(id);
  return rows.find((item) => cleanText(item?.id ?? item?.todoId) === key) ?? null;
}

function nowIso(now) {
  return new Date(now()).toISOString();
}

function notFound(code) {
  return { notFound: true, code };
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}

function requireFunction(value, label) {
  if (typeof value !== "function") throw new TypeError(`${label} must be a function`);
}

function cleanText(value) {
  return String(value ?? "").trim();
}
