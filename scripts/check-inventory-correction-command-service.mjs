import assert from "node:assert/strict";
import { createLocalInventoryCorrectionTransactionRepository } from "../server/inventoryCorrectionTransactionRepository.mjs";
import { createInventoryCorrectionCommandService } from "../server/services/inventoryCorrectionCommandService.mjs";

const fixedNow = new Date("2026-07-11T02:30:00.000Z");
const workspace = {
  inventories: [
    {
      id: "INV-1",
      inventoryKey: "30x38-white",
      size: "30*38",
      color: "白色",
      handle: "普通提",
      style: "空白袋",
      zone: "A区",
      state: "仓库已清点",
      inStock: 500,
      onHandQty: 500,
      reserved: 20,
      locked: 10,
      pending: 5,
      revision: 3,
    },
  ],
  inventoryCorrectionDrafts: [],
  inventoryLedgers: [],
  todos: [],
  todoEvents: [],
  operationLogs: [],
  attachments: [],
  inventoryCorrectionTransactionRepository: createLocalInventoryCorrectionTransactionRepository(),
};

const service = createInventoryCorrectionCommandService({
  now: () => fixedNow,
  buildOperationLog(currentWorkspace, input) {
    return {
      id: input.id,
      targetType: input.targetType,
      targetId: input.targetId,
      action: input.action,
      before: input.before,
      after: input.after,
      reason: input.reason,
      operatorId: input.operatorId,
      pageKey: "api",
      occurredAt: fixedNow.toISOString(),
      createdAt: fixedNow.toISOString(),
    };
  },
  buildTodo(currentWorkspace, input) {
    return { wait: "刚刚", handled: false, ...input };
  },
  findAttachment(currentWorkspace, attachmentId) {
    return currentWorkspace.attachments.find((item) => item.attachmentId === attachmentId) ?? null;
  },
  findInventoryItem(currentWorkspace, id) {
    return currentWorkspace.inventories.find((item) => item.id === id);
  },
  toInventoryQuantitySnapshot(item, overrides = {}) {
    const onHand = Number(overrides.onHand ?? item.inStock);
    return {
      onHand,
      reserved: Number(item.reserved),
      available: onHand - Number(item.reserved) - Number(item.locked) - Number(item.pending),
      waitingPickupLocked: Number(item.locked),
      pendingHandling: Number(item.pending),
    };
  },
});

const createBody = {
  inventoryItemId: "INV-1",
  expectedQty: 500,
  actualQty: 480,
  reason: "盘点差异",
  remark: "复盘后确认",
  attachmentIds: [],
  operatorId: "U-SPOOFED",
  idempotencyKey: "inventory-create-0001",
};
const blockedAttachmentDraft = await service.createCorrectionDraft({
  workspace,
  body: { ...createBody, attachmentIds: ["ATT-1"] },
  operatorId: "U-AUTH",
});
assert.equal(blockedAttachmentDraft.code, "INVENTORY_CORRECTION_ATTACHMENT_FLOW_UNAVAILABLE");
const created = await service.createCorrectionDraft({
  workspace,
  body: createBody,
  operatorId: "U-AUTH",
});
assert.equal(created.correctionDraft.createdBy, "U-AUTH");
assert.equal(created.correctionDraft.expectedQty, 500);
assert.equal(created.correctionDraft.actualQty, 480);
assert.equal(created.correctionDraft.deltaQty, -20);
assert.deepEqual(created.correctionDraft.attachmentIds, []);
assert.equal(created.todo.createdBy, "U-AUTH");
assert.equal(workspace.inventories[0].inStock, 500, "draft creation must not change stock");
assert.equal(workspace.todos.length, 1);
assert.equal(workspace.todoEvents[0].eventType, "todo_source:inventory_correction_created");
assert.equal(workspace.operationLogs[0].operatorId, "U-AUTH");

workspace.attachments.push(
  correctionAttachment("ATT-VALID", created.correctionDraft.correctionDraftId),
  correctionAttachment("ATT-WRONG-OWNER", "ADJ-OTHER"),
);
const blockedLink = await service.linkCorrectionAttachments({
  workspace,
  correctionDraftId: created.correctionDraft.correctionDraftId,
  body: { attachmentIds: ["ATT-WRONG-OWNER"], idempotencyKey: "inventory-link-invalid-0001" },
  operatorId: "U-WAREHOUSE",
});
assert.equal(blockedLink.code, "INVENTORY_CORRECTION_ATTACHMENT_OWNER_MISMATCH");

const linkBody = {
  correctionDraftId: created.correctionDraft.correctionDraftId,
  attachmentIds: ["ATT-VALID", "ATT-VALID"],
  remark: "盘点照片",
  idempotencyKey: "inventory-link-0001",
};
const linked = await service.linkCorrectionAttachments({
  workspace,
  correctionDraftId: created.correctionDraft.correctionDraftId,
  body: linkBody,
  operatorId: "U-WAREHOUSE",
});
assert.deepEqual(linked.attachmentIds, ["ATT-VALID"]);
assert.equal(linked.correctionDraft.revision, 2);
assert.deepEqual(workspace.inventoryCorrectionDrafts[0].attachmentIds, ["ATT-VALID"]);
assert.equal(workspace.operationLogs[0].action, "link_inventory_correction_attachments");
assert.equal(workspace.operationLogs[0].operatorId, "U-WAREHOUSE");

const replayedLink = await service.linkCorrectionAttachments({
  workspace,
  correctionDraftId: created.correctionDraft.correctionDraftId,
  body: linkBody,
  operatorId: "U-WAREHOUSE",
});
assert.deepEqual(replayedLink.attachmentIds, ["ATT-VALID"]);
assert.equal(workspace.operationLogs.filter((item) => item.action === "link_inventory_correction_attachments").length, 1);

const replayedCreate = await service.createCorrectionDraft({ workspace, body: createBody, operatorId: "U-AUTH" });
assert.equal(replayedCreate.correctionDraft.correctionDraftId, created.correctionDraft.correctionDraftId);
assert.equal(workspace.inventoryCorrectionDrafts.length, 1);
assert.equal(workspace.todos.length, 1);

const confirmBody = {
  correctionDraftId: created.correctionDraft.correctionDraftId,
  approvalReason: "主管复核通过",
  operatorId: "U-SPOOFED",
  idempotencyKey: "inventory-confirm-0001",
};
const confirmed = await service.confirmCorrectionDraft({
  workspace,
  correctionDraftId: created.correctionDraft.correctionDraftId,
  body: confirmBody,
  operatorId: "U-MANAGER",
});
assert.equal(confirmed.correctionDraft.status, "已确认生效");
assert.equal(confirmed.correctionDraft.confirmedBy, "U-MANAGER");
assert.equal(confirmed.inventoryItem.inStock, 480);
assert.equal(confirmed.inventoryItem.revision, 4);
assert.equal(confirmed.inventoryLedger.qtyBefore, 500);
assert.equal(confirmed.inventoryLedger.qtyChange, -20);
assert.equal(confirmed.inventoryLedger.qtyAfter, 480);
assert.equal(confirmed.inventoryLedger.operatorId, "U-MANAGER");
assert.equal(confirmed.todo.handledBy, "U-MANAGER");
assert.equal(workspace.inventoryLedgers.length, 1);
assert.equal(workspace.todoEvents.length, 2);
assert.equal(workspace.operationLogs.length, 3);

const replayedConfirm = await service.confirmCorrectionDraft({
  workspace,
  correctionDraftId: created.correctionDraft.correctionDraftId,
  body: confirmBody,
  operatorId: "U-MANAGER",
});
assert.equal(replayedConfirm.inventoryLedger.ledgerId, confirmed.inventoryLedger.ledgerId);
assert.equal(workspace.inventoryLedgers.length, 1);
assert.equal(workspace.inventories[0].revision, 4);

const blockedClosedDraftLink = await service.linkCorrectionAttachments({
  workspace,
  correctionDraftId: created.correctionDraft.correctionDraftId,
  body: { attachmentIds: ["ATT-VALID"], idempotencyKey: "inventory-link-closed-0001" },
  operatorId: "U-WAREHOUSE",
});
assert.equal(blockedClosedDraftLink.code, "INVENTORY_CORRECTION_ATTACHMENT_DRAFT_NOT_OPEN");

const invalid = await service.createCorrectionDraft({
  workspace,
  body: { inventoryItemId: "INV-1", expectedQty: 480, actualQty: 1.5 },
  operatorId: "U-AUTH",
});
assert.equal(invalid.code, "VALIDATION_ERROR");

console.log("inventory correction command service checks passed");

function correctionAttachment(attachmentId, ownerId, overrides = {}) {
  return {
    attachmentId,
    ownerType: "inventory_correction",
    ownerId,
    purpose: "inventory_correction_evidence",
    uploadedBy: "U-WAREHOUSE",
    status: "uploaded",
    hasContent: true,
    fileType: "image",
    mimeType: "image/jpeg",
    ...overrides,
  };
}
