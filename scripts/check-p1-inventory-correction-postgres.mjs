import assert from "node:assert/strict";
import pg from "pg";
import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresInventoryCorrectionTransactionRepository } from "../server/inventoryCorrectionTransactionRepository.mjs";
import { createInventoryCorrectionCommandService } from "../server/services/inventoryCorrectionCommandService.mjs";
import { buildInventoryQuantitySnapshot } from "../server/services/inventoryCorrectionReadProjectionService.mjs";

// Creates its own migrated loopback PostgreSQL container; never accepts a live DB URL.
const runtime = await startLivePostgres();
const pool = new pg.Pool({ connectionString: runtime.resolveLiveDatabaseUrl(), max: 8 });
const now = "2026-10-23T04:00:00.000Z";
const actor = "U-MANAGER-A";
const service = createInventoryCorrectionCommandService({
  now: () => new Date(now),
  buildOperationLog: (_workspace, input) => ({ ...input, occurredAt: now, createdAt: now, pageKey: "api" }),
  buildTodo: (_workspace, input) => ({ ...input, handled: false }),
  findAttachment: (workspace, id) => workspace.attachments.find(item => item.attachmentId === id),
  findInventoryItem: (workspace, id) => workspace.inventories.find(item => item.id === id),
  toInventoryQuantitySnapshot: buildInventoryQuantitySnapshot,
});
const repository = () => createPostgresInventoryCorrectionTransactionRepository({ postgresClient: createPostgresPoolClient({ pool }) });

async function fixture(key) {
  const inventoryItemId = `INV-CORRECTION-${key}`;
  await pool.query("INSERT INTO inventory_items(id,inventory_key,size,standard_color_id,handle_type,style,zone,inventory_state,on_hand_qty,reserved_qty,trust_level) VALUES($1,$1,'30*38*10','SC-WHITE','普通提','空白袋',$1,'仓库已清点',500,0,'已清点')", [inventoryItemId]);
  const workspace = { inventories: [{ id: inventoryItemId, inStock: 500, onHandQty: 500, revision: 1,
    size: "30*38*10", color: "白色", handle: "普通提", style: "空白袋", zone: inventoryItemId,
    reserved: 0, locked: 0, pending: 0 }], inventoryCorrectionDrafts: [], attachments: [],
    todos: [], todoEvents: [], operationLogs: [], inventoryLedgers: [], inventoryCorrectionTransactionRepository: repository() };
  const created = await service.createCorrectionDraft({ workspace, operatorId: actor,
    body: { inventoryItemId, expectedQty: 500, actualQty: 480, reason: "隔离盘点", idempotencyKey: `create-${key}` } });
  const id = created.correctionDraft.correctionDraftId;
  const empty = await service.confirmCorrectionDraft({ workspace, correctionDraftId: id, operatorId: actor,
    body: { idempotencyKey: `empty-${key}` } });
  assert.equal(empty.code, "INVENTORY_CORRECTION_ATTACHMENT_REQUIRED");
  const attachmentId = `ATT-CORRECTION-${key}`;
  await pool.query("INSERT INTO attachments(id,file_name,file_type,purpose,mime_type,has_content,uploaded_by) VALUES($1,'count.png','image','inventory_correction_evidence','image/png',true,$2)", [attachmentId, actor]);
  await pool.query("INSERT INTO attachment_links(id,attachment_id,owner_type,owner_id,purpose) VALUES($1,$2,'inventory_correction',$3,'inventory_correction_evidence')", [`LINK-${key}`, attachmentId, id]);
  workspace.attachments.push({ attachmentId, ownerType: "inventory_correction", ownerId: id,
    purpose: "inventory_correction_evidence", fileType: "image", mimeType: "image/png", hasContent: true,
    uploadedBy: actor, status: "uploaded" });
  await service.linkCorrectionAttachments({ workspace, correctionDraftId: id, operatorId: actor,
    body: { attachmentIds: [attachmentId], idempotencyKey: `link-${key}` } });
  return { workspace, id, inventoryItemId, attachmentId, key };
}
const confirm = (f, key = `confirm-${f.key}`) => service.confirmCorrectionDraft({
  workspace: f.workspace, correctionDraftId: f.id, operatorId: actor,
  body: { idempotencyKey: key, approvalReason: "隔离复盘确认" },
});
async function waitForBlocked(pid) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if ((await pool.query("SELECT pid FROM pg_stat_activity WHERE $1::integer=ANY(pg_blocking_pids(pid))", [pid])).rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  throw new Error("Expected real PostgreSQL row-lock wait did not occur.");
}
async function assertUntouched(f) {
  const row = (await pool.query("SELECT on_hand_qty,revision FROM inventory_items WHERE id=$1", [f.inventoryItemId])).rows[0];
  assert.deepEqual(row, { on_hand_qty: 500, revision: 1 });
  assert.equal((await pool.query("SELECT count(*)::int count FROM inventory_ledger_entries WHERE source_id=$1", [f.id])).rows[0].count, 0);
  assert.equal((await pool.query("SELECT count(*)::int count FROM operation_logs WHERE target_id=$1 AND action='confirm_inventory_correction_draft'", [f.id])).rows[0].count, 0);
}
try {
  // Defense at the DB boundary: a stale request waits while persisted quantity
  // changes without a revision increment. Do not merely test generated SQL text.
  for (const kind of ["actual", "owner", "evidence", "evidence-owner"]) {
    const f = await fixture(kind);
    const blocker = await pool.connect();
    let pending;
    try {
      await blocker.query("BEGIN");
      const pid = (await blocker.query("SELECT pg_backend_pid() pid")).rows[0].pid;
      if (kind.startsWith("evidence")) await blocker.query("SELECT id FROM attachments WHERE id=$1 FOR UPDATE", [f.attachmentId]);
      else await blocker.query("SELECT id FROM inventory_correction_drafts WHERE id=$1 FOR UPDATE", [f.id]);
      pending = confirm(f).then(value => ({ value }), error => ({ error }));
      await waitForBlocked(pid);
      if (kind === "actual") await blocker.query("UPDATE inventory_correction_drafts SET actual_qty=470,delta_qty=-30 WHERE id=$1", [f.id]);
      else if (kind === "owner") await blocker.query("UPDATE inventory_correction_drafts SET inventory_item_id=(SELECT id FROM inventory_items WHERE id<>$2 LIMIT 1) WHERE id=$1", [f.id, f.inventoryItemId]);
      else if (kind === "evidence") await blocker.query("UPDATE attachments SET status='deleted' WHERE id=$1", [f.attachmentId]);
      else await blocker.query("UPDATE attachment_links SET owner_id='OTHER-CORRECTION' WHERE attachment_id=$1", [f.attachmentId]);
      await blocker.query("COMMIT");
      const outcome = await pending;
      assert.equal(outcome.error?.statusCode, 409, `${kind}: ${JSON.stringify(outcome)}`);
      await assertUntouched(f);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); if (pending) await pending; }
  }
  // Two independent repositories contend for the same draft; only one wins.
  const f = await fixture("concurrent");
  const clone = { ...f, workspace: structuredClone({ ...f.workspace, inventoryCorrectionTransactionRepository: undefined }) };
  clone.workspace.inventoryCorrectionTransactionRepository = repository();
  const outcomes = await Promise.allSettled([confirm(f, "confirm-first"), confirm(clone, "confirm-second")]);
  const wins = outcomes.filter(item => item.status === "fulfilled" && item.value.correctionDraft?.status === "已确认生效");
  assert.equal(wins.length, 1);
  const winnerIndex = outcomes.findIndex(item => item === wins[0]);
  const winner = winnerIndex === 0 ? f : clone;
  const winnerKey = winnerIndex === 0 ? "confirm-first" : "confirm-second";
  assert.equal((await pool.query("SELECT on_hand_qty FROM inventory_items WHERE id=$1", [f.inventoryItemId])).rows[0].on_hand_qty, 480);
  assert.equal((await pool.query("SELECT count(*)::int count FROM inventory_ledger_entries WHERE source_id=$1", [f.id])).rows[0].count, 1);
  const again = await confirm(winner, "confirm-third-key");
  assert.equal(again.code, "INVENTORY_CORRECTION_DRAFT_NOT_OPEN");
  // A historical same-key receipt stays readable after later stock movement,
  // without rolling the live process cache or database back to that receipt.
  await pool.query("UPDATE inventory_items SET on_hand_qty=460,revision=revision+1 WHERE id=$1", [f.inventoryItemId]);
  winner.workspace.inventories[0] = { ...winner.workspace.inventories[0], inStock: 460, onHandQty: 460, revision: 3 };
  const snapshot = JSON.stringify(winner.workspace);
  const replay = await confirm(winner, winnerKey);
  assert.equal(replay.inventoryItem.inStock, 480);
  assert.equal(JSON.stringify(winner.workspace), snapshot);
  assert.equal((await pool.query("SELECT on_hand_qty FROM inventory_items WHERE id=$1", [f.inventoryItemId])).rows[0].on_hand_qty, 460);
  assert.equal((await pool.query("SELECT count(*)::int count FROM inventory_ledger_entries WHERE source_id=$1", [f.id])).rows[0].count, 1);
  const same = await fixture("same-key");
  const other = { ...same, workspace: structuredClone({ ...same.workspace, inventoryCorrectionTransactionRepository: undefined }) };
  other.workspace.inventoryCorrectionTransactionRepository = repository();
  const receipts = await Promise.all([confirm(same, "shared-confirm-key"), confirm(other, "shared-confirm-key")]);
  assert.deepEqual(receipts[0], receipts[1]);
  assert.equal((await pool.query("SELECT count(*)::int count FROM inventory_ledger_entries WHERE source_id=$1", [same.id])).rows[0].count, 1);
  console.log("P1 inventory correction PostgreSQL passed: evidence required; real row-lock quantity/owner/evidence conflicts roll back; independent concurrent confirmation has one ledger; old replay never restores stock.");
} finally { await pool.end(); await stopLivePostgres(runtime); }
