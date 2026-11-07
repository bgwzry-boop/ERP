// 盘点纠正「驳回」链路的持久回归：真实一次性 PostgreSQL。
// 由 check-p1-inventory-correction-postgres.mjs 调用，复用其连接；
// 不再接受外部 ROOT 参数，也不依赖 /tmp 快照。
import assert from "node:assert/strict";
import { createPostgresPoolClient } from "../../server/postgresPoolClient.mjs";
import { createPostgresInventoryCorrectionTransactionRepository } from "../../server/inventoryCorrectionTransactionRepository.mjs";
import { createInventoryCorrectionCommandService } from "../../server/services/inventoryCorrectionCommandService.mjs";
import { buildInventoryQuantitySnapshot, createInventoryCorrectionReadProjectionService } from "../../server/services/inventoryCorrectionReadProjectionService.mjs";
import { createPostgresCoreWorkspaceReadRepository } from "../../server/coreWorkspaceReadRepository.mjs";

export async function runInventoryCorrectionRejectSuite({ pool }) {
const now = '2026-11-07T14:00:00.000Z';
const actor = 'U-MANAGER-A';
const results = [];
const service = createInventoryCorrectionCommandService({
  now: () => new Date(now),
  buildOperationLog: (_w, input) => ({ ...input, occurredAt: now, createdAt: now, pageKey: 'api' }),
  buildTodo: (_w, input) => ({ ...input, handled: false }),
  findAttachment: (w, id) => w.attachments.find(a => a.attachmentId === id),
  findInventoryItem: (w, id) => w.inventories.find(i => i.id === id),
  toInventoryQuantitySnapshot: buildInventoryQuantitySnapshot,
});
const db = async (sql, params = []) => (await pool.query(sql, params)).rows;
const failed = value => Boolean(value?.error || value?.notFound);
async function outcome(fn) { try { return await fn(); } catch (error) { return { error: true, code: error.code, statusCode: error.statusCode, message: error.message }; } }
async function check(name, fn) { try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); } catch (e) { results.push({ name, ok: false, error: e.message, stack: e.stack }); console.log('FAIL', name, e.stack); } }
function repo() { return createPostgresInventoryCorrectionTransactionRepository({ postgresClient: createPostgresPoolClient({ pool }) }); }
async function fixture(key, evidence = false) {
  const inventoryItemId = `INV-NEW-CORRECTION-${key}`;
  await db("INSERT INTO inventory_items(id,inventory_key,size,standard_color_id,handle_type,style,zone,inventory_state,on_hand_qty,reserved_qty,waiting_pickup_locked_qty,pending_handling_qty,trust_level) VALUES($1,$1,'30*38','SC-WHITE','普通提','空白袋',$1,'仓库已清点',500,400,80,20,'已清点')", [inventoryItemId]);
  const workspace = { inventories: [{ id: inventoryItemId, inventoryKey: inventoryItemId, inStock: 500, onHandQty: 500, revision: 1, size: '30*38', color: '白色', handle: '普通提', style: '空白袋', zone: inventoryItemId, state: '仓库已清点', reserved: 400, locked: 80, pending: 20 }], inventoryCorrectionDrafts: [], attachments: [], todos: [], todoEvents: [], operationLogs: [], inventoryLedgers: [], inventoryCorrectionTransactionRepository: repo() };
  const created = await service.createCorrectionDraft({ workspace, operatorId: actor, body: { inventoryItemId, expectedQty: 500, actualQty: 450, reason: '盘点少货', remark: '隔离验收实物复盘', idempotencyKey: `review-create-${key}` } });
  assert.ok(created.correctionDraft, JSON.stringify(created));
  const f = { key, workspace, inventoryItemId, id: created.correctionDraft.correctionDraftId, created };
  if (evidence) {
    const attachmentId = `ATT-NEW-CORRECTION-${key}`;
    await db("INSERT INTO attachments(id,file_name,file_type,purpose,mime_type,has_content,uploaded_by) VALUES($1,'count.png','image','inventory_correction_evidence','image/png',true,$2)", [attachmentId, actor]);
    await db("INSERT INTO attachment_links(id,attachment_id,owner_type,owner_id,purpose) VALUES($1,$2,'inventory_correction',$3,'inventory_correction_evidence')", [`LINK-NEW-${key}`, attachmentId, f.id]);
    workspace.attachments.push({ attachmentId, ownerType: 'inventory_correction', ownerId: f.id, purpose: 'inventory_correction_evidence', fileType: 'image', mimeType: 'image/png', hasContent: true, uploadedBy: actor, status: 'uploaded' });
    const linked = await service.linkCorrectionAttachments({ workspace, operatorId: actor, correctionDraftId: f.id, body: { attachmentIds: [attachmentId], idempotencyKey: `review-link-${key}` } });
    assert.ok(!failed(linked), JSON.stringify(linked));
  }
  return f;
}
const rejectBody = f => ({ reason: '实物需重新核对，退回处理', idempotencyKey: `review-reject-${f.key}` });
const reject = (f, body = rejectBody(f)) => service.rejectCorrectionDraft({ workspace: f.workspace, operatorId: actor, correctionDraftId: f.id, body });
const confirm = f => service.confirmCorrectionDraft({ workspace: f.workspace, operatorId: actor, correctionDraftId: f.id, body: { approvalReason: '实物与凭证复盘确认', idempotencyKey: `review-confirm-${f.key}` } });
const stock = f => db('SELECT on_hand_qty,reserved_qty,waiting_pickup_locked_qty,pending_handling_qty,revision FROM inventory_items WHERE id=$1', [f.inventoryItemId]);
async function snapshot(f) {
  return {
    stock: await stock(f),
    draft: await db('SELECT * FROM inventory_correction_drafts WHERE id=$1', [f.id]),
    todos: await db('SELECT * FROM todos WHERE ref_id=$1 ORDER BY id', [f.id]),
    events: await db('SELECT * FROM todo_events WHERE todo_id IN (SELECT id FROM todos WHERE ref_id=$1) ORDER BY id', [f.id]),
    logs: await db('SELECT * FROM operation_logs WHERE target_id=$1 ORDER BY id', [f.id]),
    ledgers: await db('SELECT * FROM inventory_ledger_entries WHERE source_id=$1 ORDER BY id', [f.id]),
    receipts: await db('SELECT * FROM operation_idempotency_keys WHERE target_id=$1 ORDER BY scope,idempotency_key', [f.id]),
  };
}
try {
  await check('驳回后立即读详情，内存草稿及待办保持完整', async () => {
    const f = await fixture('immediate-read', true);
    const result = await outcome(() => reject(f)); assert.ok(!failed(result), JSON.stringify(result));
    const cached = f.workspace.inventoryCorrectionDrafts.find(d => d.correctionDraftId === f.id);
    const detail = createInventoryCorrectionReadProjectionService().buildDraftDetail({ workspace: f.workspace, draft: cached });
    const todo = f.workspace.todos.find(t => t.id === f.created.todo.id);
    console.log('IMMEDIATE-READ', JSON.stringify({ cached, detail: { inventoryItemId: detail.inventoryItemId, reason: detail.reason, requestedQtyAfter: detail.requestedQtyAfter, attachmentIds: detail.attachmentIds, todoId: detail.todoId }, todo: { refType: todo.refType, ref_type: todo.ref_type, refId: todo.refId, ref_id: todo.ref_id, handledBy: todo.handledBy, handled_by: todo.handled_by } }));
    assert.equal(cached.inventoryItemId, f.inventoryItemId, 'command must not replace a complete draft with a partial result');
    assert.equal(cached.expectedQty, 500); assert.equal(cached.actualQty, 450); assert.ok(cached.todoId); assert.ok(cached.attachmentIds.length);
    assert.equal(detail.inventoryItemId, f.inventoryItemId); assert.equal(detail.requestedQtyAfter.onHand, 450); assert.ok(detail.attachmentIds.length);
    assert.equal(todo.refType, 'inventory_correction'); assert.equal(todo.refId, f.id); assert.equal(todo.handledBy, actor);
    assert.ok(result.todoEventId, 'rejection must return its persisted todo event');
    const eventInDb = (await db('SELECT id,event_type FROM todo_events WHERE id=$1', [result.todoEventId]))[0];
    assert.equal(eventInDb?.event_type, 'todo_source:inventory_correction_rejected');
    assert.ok(f.workspace.todoEvents.some(event => event.eventId === result.todoEventId), 'the committed rejection todo event must also be visible in the current workspace');
  });
  await check('登记真实少货，不改库存', async () => {
    const f = await fixture('create');
    assert.equal(f.created.correctionDraft.status, '待确认生效');
    assert.equal((await stock(f))[0].on_hand_qty, 500);
    assert.equal((await db('SELECT count(*)::int n FROM inventory_ledger_entries WHERE source_id=$1', [f.id]))[0].n, 0);
  });
  await check('少货紧急等级落库，冷加载不降回关注', async () => {
    const f = await fixture('urgency');
    assert.equal((await db('SELECT priority FROM todos WHERE ref_id=$1', [f.id]))[0].priority, '紧急');
    const cold = await createPostgresCoreWorkspaceReadRepository({ postgresClient: createPostgresPoolClient({ pool }) }).loadState();
    const todo = cold.todos.find(t => (t.id ?? t.todoId) === f.created.todo.id);
    assert.ok(todo); assert.equal(todo.priority, '紧急');
  });
  await check('正常驳回留完整记录，重载可读', async () => {
    const f = await fixture('reject');
    const initial = await stock(f);
    const r = await outcome(() => reject(f));
    assert.ok(!failed(r), JSON.stringify(r));
    const draft = (await db('SELECT * FROM inventory_correction_drafts WHERE id=$1', [f.id]))[0];
    assert.equal(draft.status, '已驳回'); assert.equal(draft.rejected_by, actor); assert.ok(draft.rejected_at); assert.equal(draft.reject_reason, rejectBody(f).reason);
    assert.deepEqual(await stock(f), initial);
    const todo = (await db('SELECT * FROM todos WHERE ref_id=$1', [f.id]))[0];
    assert.equal(todo.status, '已处理'); assert.equal(todo.handled_by, actor); assert.ok(todo.handled_at);
    assert.equal(r.todo?.status, '已处理', 'response must return the updated todo, not the statement snapshot before UPDATE');
    assert.equal((await db("SELECT count(*)::int n FROM operation_logs WHERE target_id=$1 AND action='reject_inventory_correction_draft'", [f.id]))[0].n, 1);
    assert.equal((await db('SELECT count(*)::int n FROM inventory_ledger_entries WHERE source_id=$1', [f.id]))[0].n, 0);
    const reread = await repo().getCorrectionDraft({ workspace: { ...f.workspace, inventoryCorrectionDrafts: [] }, correctionDraftId: f.id });
    assert.equal(reread.status, '已驳回'); assert.equal(reread.rejectedBy, actor); assert.ok(reread.rejectedAt); assert.equal(reread.rejectReason, rejectBody(f).reason);
  });
  await check('新建核心读取仓储冷加载，保留驳回人时间理由及业务字段', async () => {
    const f = await fixture('coldreload');
    const r = await outcome(() => reject(f)); assert.ok(!failed(r), JSON.stringify(r));
    // Load all authoritative collections using the same PostgreSQL path as startup.
    // Do not reuse the command's workspace or manually insert the missing fields.
    const cold = await createPostgresCoreWorkspaceReadRepository({ postgresClient: createPostgresPoolClient({ pool }) }).loadState();
    const draft = cold.inventoryCorrectionDrafts.find(d => d.correctionDraftId === f.id);
    assert.ok(draft); assert.equal(draft.status, '已驳回'); assert.equal(draft.rejectedBy, actor); assert.ok(draft.rejectedAt); assert.equal(draft.rejectReason, rejectBody(f).reason);
    assert.equal(draft.inventoryItemId, f.inventoryItemId); assert.equal(draft.expectedQty, 500); assert.equal(draft.actualQty, 450); assert.ok(draft.todoId);
    const detail = createInventoryCorrectionReadProjectionService().buildDraftDetail({ workspace: cold, draft });
    assert.equal(detail.rejectedBy, actor); assert.ok(detail.rejectedAt); assert.equal(detail.rejectReason, rejectBody(f).reason);
    const todo = cold.todos.find(t => (t.id ?? t.todoId) === draft.todoId);
    assert.ok(todo); assert.equal(todo.status, '已处理'); assert.equal(todo.handledBy, actor); assert.ok(todo.handledAt);
  });
  await check('驳回同请求回放不重复，改内容同键冲突', async () => {
    const f = await fixture('replay');
    const first = await outcome(() => reject(f)); assert.ok(!failed(first), JSON.stringify(first));
    const saved = await snapshot(f);
    const replay = await outcome(() => reject(f)); assert.ok(!failed(replay), JSON.stringify(replay));
    assert.deepEqual(await snapshot(f), saved);
    const changed = await outcome(() => reject(f, { ...rejectBody(f), reason: '不同内容不应被当回放' }));
    assert.ok(failed(changed)); assert.equal(changed.statusCode, 409, JSON.stringify(changed));
    assert.deepEqual(await snapshot(f), saved);
  });
  await check('读取后版本变化，驳回冲突且零残留', async () => {
    const f = await fixture('stale');
    const original = f.workspace.inventoryCorrectionTransactionRepository.rejectCorrectionDraft.bind(f.workspace.inventoryCorrectionTransactionRepository);
    let afterConcurrentChange;
    f.workspace.inventoryCorrectionTransactionRepository.rejectCorrectionDraft = async input => {
      await db('UPDATE inventory_correction_drafts SET revision=revision+1 WHERE id=$1', [f.id]);
      afterConcurrentChange = await snapshot(f);
      return original(input);
    };
    const result = await outcome(() => reject(f));
    assert.ok(failed(result)); assert.equal(result.statusCode, 409, JSON.stringify(result));
    assert.deepEqual(await snapshot(f), afterConcurrentChange);
  });
  await check('审核通过修正真实在库，保留占用及订单状态', async () => {
    const f = await fixture('confirm', true);
    const ordersBefore = await db('SELECT to_jsonb(t) row FROM original_orders t ORDER BY id');
    const linesBefore = await db('SELECT to_jsonb(t) row FROM order_lines t ORDER BY id');
    const r = await outcome(() => confirm(f)); assert.ok(!failed(r), JSON.stringify(r));
    const item = (await stock(f))[0];
    assert.equal(item.on_hand_qty, 450); assert.equal(item.reserved_qty, 400); assert.equal(item.waiting_pickup_locked_qty, 80); assert.equal(item.pending_handling_qty, 20);
    assert.deepEqual(await db('SELECT to_jsonb(t) row FROM original_orders t ORDER BY id'), ordersBefore);
    assert.deepEqual(await db('SELECT to_jsonb(t) row FROM order_lines t ORDER BY id'), linesBefore);
    const ledger = (await db('SELECT qty_before,qty_change,qty_after FROM inventory_ledger_entries WHERE source_id=$1', [f.id]))[0];
    assert.deepEqual(ledger, { qty_before: 500, qty_change: -50, qty_after: 450 });
  });
  await check('确认与驳回同时使用旧版本，只允许一方成功', async () => {
    const f = await fixture('race', true);
    const repository = f.workspace.inventoryCorrectionTransactionRepository;
    const jobs = [];
    let ready;
    const both = new Promise(r => { ready = r; });
    for (const method of ['confirmCorrectionDraft', 'rejectCorrectionDraft']) {
      const original = repository[method].bind(repository);
      repository[method] = input => new Promise((resolveJob, rejectJob) => {
        jobs.push(() => original(input).then(resolveJob, rejectJob));
        if (jobs.length === 2) ready();
      });
    }
    const pending = [outcome(() => confirm(f)), outcome(() => reject(f))];
    await Promise.race([both, new Promise((_, rejectWait) => setTimeout(() => rejectWait(new Error('Both mutation paths did not reach the repository')), 10000))]);
    await Promise.all(jobs.map(run => run()));
    const values = await Promise.all(pending);
    assert.equal(values.filter(v => !failed(v)).length, 1, JSON.stringify(values));
    const loser = values.find(failed); assert.equal(loser.statusCode, 409, JSON.stringify(loser));
    const state = (await db('SELECT status FROM inventory_correction_drafts WHERE id=$1', [f.id]))[0].status;
    assert.ok(['已确认生效', '已生效', '已驳回'].includes(state), state);
    const mutations = await db("SELECT action FROM operation_logs WHERE target_id=$1 AND action IN ('confirm_inventory_correction_draft','reject_inventory_correction_draft')", [f.id]);
    assert.equal(mutations.length, 1);
    assert.equal((await stock(f))[0].on_hand_qty, state === '已驳回' ? 500 : 450);
  });
} finally { /* 连接由调用方关闭 */ }
console.log(JSON.stringify({ isolatedDatabase: true, results }, null, 2));
  const failedCases = results.filter((item) => !item.ok);
  if (failedCases.length) {
    throw new Error(`inventory correction reject suite failed: ${failedCases.map((item) => item.name).join(", ")}`);
  }
  return results;
}
