import assert from "node:assert/strict";
import {
  buildInventoryQuantitySnapshot,
  createInventoryCorrectionReadProjectionService,
} from "../server/services/inventoryCorrectionReadProjectionService.mjs";

const service = createInventoryCorrectionReadProjectionService();
const workspace = {
  users: [
    { user_id: "U-WAREHOUSE", display_name: "库房A" },
    { id: "U-MANAGER", displayName: "主管A" },
  ],
  inventories: [
    {
      id: "INV-1",
      inventory_key: "30*38-WHITE",
      size: "30*38",
      color_name: "白色",
      handle_type: "普通提",
      style: "空白袋",
      zone: "A01",
      inventory_state: "可用",
      in_stock: "500",
      reserved: "20",
      locked: "5",
      pending: "3",
    },
  ],
  inventoryCorrectionDrafts: [
    {
      correction_draft_id: "ADJ-1",
      inventory_item_id: "INV-1",
      status: "已确认生效",
      reason: "盘点差异",
      remark: "白袋复核",
      qty_before: { on_hand: "500", reserved: "not-a-number" },
      requested_qty_after: { on_hand: "480", available: "999999" },
      operator_id: "U-WAREHOUSE",
      confirmed_by: "U-MANAGER",
      todo_id: "T-1",
      attachment_ids: ["ATT-1", "ATT-1", ""],
      created_at: "2026-07-14T01:00:00.000Z",
      updated_at: "2026-07-14T02:00:00.000Z",
      confirmed_at: "2026-07-14T02:00:00.000Z",
    },
    {
      correctionDraftId: "ADJ-2",
      inventoryItemId: "INV-1",
      status: "待确认生效",
      reason: "复盘",
      expectedQty: "invalid",
      actualQty: "invalid",
      operatorId: "U-WAREHOUSE",
    },
  ],
  inventoryLedgers: [
    {
      ledger_id: "LED-NEW",
      inventory_item_id: "INV-1",
      correction_draft_id: "ADJ-1",
      qty_before: "500",
      qty_change: "invalid",
      qty_after: "480",
      operator_id: "U-MANAGER",
      confirmed_by: "U-MANAGER",
      created_at: "2026-07-14T02:00:00.000Z",
    },
    {
      ledgerId: "LED-OLD",
      inventoryItemId: "INV-1",
      sourceId: "ADJ-1",
      qtyBefore: 500,
      qtyChange: -10,
      qtyAfter: 490,
      createdAt: "2026-07-14T01:30:00.000Z",
    },
  ],
  operationLogs: [
    {
      operation_log_id: "LOG-1",
      target_type: "inventory_correction",
      target_id: "ADJ-1",
      action: "confirm_inventory_correction_draft",
      before: { onHand: 500 },
      after: { onHand: 480 },
      operator_id: "U-MANAGER",
      created_at: "2026-07-14T02:00:00.000Z",
    },
  ],
};

assert.deepEqual(
  buildInventoryQuantitySnapshot(workspace.inventories[0], {
    onHand: "480.9",
    reserved: "bad",
    waiting_pickup_locked: -5,
  }),
  {
    onHand: 480,
    reserved: 20,
    available: 457,
    waitingPickupLocked: 0,
    pendingHandling: 3,
  },
);

const all = service.listDraftSummaries({
  workspace,
  searchParams: new URLSearchParams({ status: "全部", keyword: "库房a" }),
});
assert.equal(all.items.length, 2);
assert.equal(all.items[0].inventoryKey, "30*38-WHITE");
assert.equal(all.items[0].operatorName, "库房A");
assert.equal(all.items[0].confirmedByName, "主管A");
assert.deepEqual(all.items[0].attachmentIds, ["ATT-1"]);
assert.deepEqual(all.items[0].qtyBefore, {
  onHand: 500,
  reserved: 20,
  available: 472,
  waitingPickupLocked: 5,
  pendingHandling: 3,
});
assert.deepEqual(all.items[0].requestedQtyAfter, {
  onHand: 480,
  reserved: 20,
  available: 452,
  waitingPickupLocked: 5,
  pendingHandling: 3,
});
assert.equal(JSON.stringify(all).includes("NaN"), false);

const filtered = service.listDraftSummaries({
  workspace,
  searchParams: { status: "待确认生效", inventoryItemId: "INV-1", keyword: "复盘" },
});
assert.deepEqual(filtered.items.map((item) => item.correctionDraftId), ["ADJ-2"]);
assert.equal(filtered.items[0].qtyBefore.onHand, 500);
assert.equal(filtered.items[0].requestedQtyAfter.onHand, 500);

const detail = service.buildDraftDetail({ workspace, draft: workspace.inventoryCorrectionDrafts[0] });
assert.equal(detail.ledger.ledgerId, "LED-NEW");
assert.equal(detail.ledger.qtyChange, 0);
assert.equal(detail.ledger.operatorName, "主管A");
assert.deepEqual(detail.qtyAfter, {
  onHand: 480,
  reserved: 20,
  available: 452,
  waitingPickupLocked: 5,
  pendingHandling: 3,
});
assert.equal(detail.operationLogs[0].operationLogId, "LOG-1");
assert.deepEqual(detail.operationLogs[0].after, { onHand: 480 });
assert.equal(JSON.stringify(detail).includes("NaN"), false);

const standaloneLedger = service.buildLedgerSummary({
  entry: { qtyBefore: Infinity, qtyChange: "-20", qtyAfter: "480" },
  inventoryItem: workspace.inventories[0],
  workspace,
  correctionDraftId: "ADJ-1",
});
assert.equal(standaloneLedger.qtyBefore, 0);
assert.equal(standaloneLedger.qtyChange, -20);
assert.equal(standaloneLedger.qtyAfter, 480);
assert.equal(standaloneLedger.sourceId, "ADJ-1");

console.log("inventory correction read projection service checks passed");
