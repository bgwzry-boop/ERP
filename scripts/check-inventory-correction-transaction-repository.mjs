import assert from "node:assert/strict";
import {
  buildConfirmInventoryCorrectionDraftTransactionQuery,
  buildCreateInventoryCorrectionDraftTransactionQuery,
  buildGetInventoryCorrectionDraftQuery,
  buildLinkInventoryCorrectionAttachmentsTransactionQuery,
  createPostgresInventoryCorrectionTransactionRepository,
} from "../server/inventoryCorrectionTransactionRepository.mjs";

const input = buildInput();
const createQuery = buildCreateInventoryCorrectionDraftTransactionQuery(input);
assert.match(createQuery.text, /FOR UPDATE/);
assert.match(createQuery.text, /ERP_INVENTORY_CORRECTION_CREATE_CONCURRENCY_CONFLICT/);
assert.match(createQuery.text, /INSERT INTO inventory_correction_drafts/);
assert.match(createQuery.text, /INSERT INTO todos/);
assert.match(createQuery.text, /INSERT INTO todo_events/);
assert.match(createQuery.text, /INSERT INTO operation_logs/);
assert.ok(createQuery.values.includes("ADJ-1"));
assert.ok(!createQuery.text.includes("盘点差异"), "business values must use SQL parameters");

const confirmQuery = buildConfirmInventoryCorrectionDraftTransactionQuery({
  ...input,
  correctionDraft: { ...input.correctionDraft, status: "已确认生效", revision: 2, confirmedBy: "U-2", confirmedAt: input.now },
  inventoryItem: { ...input.inventoryItem, inStock: 480, onHandQty: 480, revision: 4 },
  inventoryLedger: input.inventoryLedger,
  todo: { ...input.todo, status: "已处理", handled: true, handledBy: "U-2", handledAt: input.now },
  todoEvent: { ...input.todoEvent, eventId: "TE-2", eventType: "todo_source:inventory_correction_confirmed" },
  operationLog: { ...input.operationLog, id: "LOG-2", action: "confirm_inventory_correction_draft" },
});
assert.match(confirmQuery.text, /UPDATE inventory_items/);
assert.match(confirmQuery.text, /UPDATE inventory_correction_drafts/);
assert.match(confirmQuery.text, /INSERT INTO inventory_ledger_entries/);
assert.match(confirmQuery.text, /UPDATE todos/);
assert.match(confirmQuery.text, /ERP_INVENTORY_CORRECTION_CONFIRM_CONCURRENCY_CONFLICT/);

const getQuery = buildGetInventoryCorrectionDraftQuery("ADJ-1");
assert.match(getQuery.text, /FROM inventory_correction_drafts/);
assert.deepEqual(getQuery.values, ["ADJ-1"]);

const linkInput = {
  ...input,
  correctionDraft: { ...input.correctionDraft, attachmentIds: ["ATT-1"], revision: 2 },
  attachmentIds: ["ATT-1"],
  operationLog: { ...input.operationLog, id: "LOG-LINK-1", action: "link_inventory_correction_attachments" },
};
const linkQuery = buildLinkInventoryCorrectionAttachmentsTransactionQuery(linkInput);
assert.match(linkQuery.text, /jsonb_array_elements_text/);
assert.match(linkQuery.text, /JOIN attachment_links/);
assert.match(linkQuery.text, /attachment\.has_content = true/);
assert.match(linkQuery.text, /UPDATE inventory_correction_drafts/);
assert.match(linkQuery.text, /ERP_INVENTORY_CORRECTION_ATTACHMENT_LINK_CONFLICT/);

const requests = [];
const repository = createPostgresInventoryCorrectionTransactionRepository({
  async queryJson() {
    return input.correctionDraft;
  },
  async idempotentTransactionJson(request) {
    requests.push(request);
    if (request.scope === "inventory.correction.attachments.link") {
      return {
        correctionDraft: linkInput.correctionDraft,
        attachmentIds: linkInput.attachmentIds,
        operationLogId: linkInput.operationLog.id,
      };
    }
    return {
      correctionDraft: input.correctionDraft,
      todo: input.todo,
      todoEventId: input.todoEvent.eventId,
      operationLogId: input.operationLog.id,
    };
  },
});
const workspace = { inventoryCorrectionDrafts: [], todos: [], todoEvents: [], operationLogs: [] };
const saved = await repository.createCorrectionDraft({
  ...input,
  workspace,
  idempotencyKey: "inventory-create-0001",
  idempotencyPayload: { inventoryItemId: "INV-1", actualQty: 480 },
});
assert.equal(saved.correctionDraft.correctionDraftId, "ADJ-1");
assert.equal(workspace.inventoryCorrectionDrafts.length, 1);
assert.equal(requests[0].scope, "inventory.correction.create");
assert.deepEqual(requests[0].resourceLocks, [
  "idempotency:inventory.correction.create:inventory-create-0001",
  "inventory-correction:ADJ-1",
  "inventory-item:INV-1",
  "todo:T-1",
]);

const linked = await repository.linkCorrectionAttachments({
  ...linkInput,
  workspace,
  idempotencyKey: "inventory-link-0001",
  idempotencyPayload: { correctionDraftId: "ADJ-1", attachmentIds: ["ATT-1"] },
});
assert.deepEqual(linked.attachmentIds, ["ATT-1"]);
assert.equal(workspace.inventoryCorrectionDrafts[0].revision, 2);
assert.equal(workspace.operationLogs[0].id, "LOG-LINK-1");
assert.deepEqual(requests[1].resourceLocks, [
  "attachment:ATT-1",
  "idempotency:inventory.correction.attachments.link:inventory-link-0001",
  "inventory-correction:ADJ-1",
]);

console.log("inventory correction transaction repository checks passed");

function buildInput() {
  const now = "2026-07-11T02:30:00.000Z";
  return {
    now,
    correctionDraft: {
      id: "ADJ-1",
      correctionDraftId: "ADJ-1",
      bizNo: "ADJ-1",
      inventoryItemId: "INV-1",
      expectedQty: 500,
      actualQty: 480,
      deltaQty: -20,
      reason: "盘点差异",
      remark: "复盘后确认",
      attachmentIds: ["ATT-1"],
      status: "待确认生效",
      revision: 1,
      todoId: "T-1",
      createdBy: "U-1",
      createdAt: now,
      updatedAt: now,
      qtyBefore: { onHand: 500 },
      requestedQtyAfter: { onHand: 480 },
    },
    inventoryItem: { id: "INV-1", inventoryKey: "INV-1", inStock: 500, onHandQty: 500, revision: 3 },
    inventoryLedger: {
      ledgerId: "LEDGER-1",
      inventoryItemId: "INV-1",
      changeType: "correction",
      qtyBefore: 500,
      qtyChange: -20,
      qtyAfter: 480,
      sourceType: "inventory_correction",
      sourceId: "ADJ-1",
      operatorId: "U-2",
      confirmedBy: "U-2",
      occurredAt: now,
      createdAt: now,
      reason: "主管复核通过",
      remark: "",
    },
    todo: {
      id: "T-1",
      bizNo: "T-1",
      type: "库存修正待确认",
      refType: "inventory_correction",
      refId: "ADJ-1",
      ref: "ADJ-1",
      priority: "关注",
      status: "未处理",
      summary: "库存修正待确认",
      createdBy: "U-1",
      createdAt: now,
      updatedAt: now,
    },
    todoEvent: {
      eventId: "TE-1",
      todoId: "T-1",
      eventType: "todo_source:inventory_correction_created",
      eventPayload: {},
      operatorId: "U-1",
      occurredAt: now,
      createdAt: now,
    },
    operationLog: {
      id: "LOG-1",
      targetType: "inventory_correction",
      targetId: "ADJ-1",
      action: "create_inventory_correction_draft",
      before: { onHand: 500 },
      after: { onHand: 480 },
      reason: "盘点差异",
      operatorId: "U-1",
      pageKey: "api",
      occurredAt: now,
      createdAt: now,
    },
  };
}
