// 负责人 2026-11-12「作废重打」在装好全部迁移的真实 PostgreSQL 上：
// 已入对账单的单子改数量（对账单这一行和合计跟着改、订单补价格快照、重打的纸单是新数量新金额）、改单价、只改地址、
// 已发给客户的对账单改完提示重发、收过款的对账单不能改、打单扣过库存的整张作废把库存退回、改数量按差额退库存、
// 页面过期拒绝、同一次提交重试不重复改。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";
import { postgresLiveBusinessSeedSql } from "./helpers/postgresLiveBusinessSeed.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresCoreWorkspaceReadRepository } from "../server/coreWorkspaceReadRepository.mjs";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";
import { createPostgresPrintDeviceRepository } from "../server/printDeviceRepository.mjs";
import { createPostgresPrintJobRepository } from "../server/printJobRepository.mjs";
import { createPostgresFulfillmentActionTransactionRepository } from "../server/fulfillmentActionTransactionRepository.mjs";
import { readCompanyPrintProfile, saveCompanyPrintProfile } from "../server/services/companyPrintProfileService.mjs";

const name = `erp-note-fix-${process.pid}-${Date.now()}`;
const docker = (args) => { const r = spawnSync("docker", args, { encoding: "utf8" }); if (r.status !== 0) throw Error(r.stderr || r.stdout); return r.stdout.trim(); };
let pool;
try {
  docker(["run", "--rm", "-d", "--name", name, "-p", "127.0.0.1::5432", "-e", "POSTGRES_DB=erp", "-e", "POSTGRES_USER=erp", "-e", "POSTGRES_PASSWORD=erp", "postgres:16-alpine"]);
  for (let i = 0; i < 60; i++) { if (spawnSync("docker", ["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "erp"]).status === 0) break; if (i === 59) throw Error("PG timeout"); await new Promise((r) => setTimeout(r, 200)); }
  const port = Number(docker(["port", name, "5432/tcp"]).split(":").at(-1));
  pool = new pg.Pool({ host: "127.0.0.1", port, database: "erp", user: "erp", password: "erp", statement_timeout: 15000 });
  const migrations = loadMigrationFiles(); validateMigrationSet(migrations);
  for (const migration of migrations) await pool.query(migration.sql);
  await pool.query(postgresLiveBusinessSeedSql);
  await pool.query(`
    INSERT INTO price_snapshots (id, order_line_id, snapshot_type, version_no, bag_price, chargeable_qty, final_amount, created_by)
    VALUES ('PRICE-FIX-F001', 'ORD-0629-001-01', 'confirmation', 1, 0.36, 500, 180, 'U-OFFICE-A');
    INSERT INTO inventory_items (id, inventory_key, size, standard_color_id, handle_type, style, zone, inventory_state, on_hand_qty, reserved_qty, waiting_pickup_locked_qty, pending_handling_qty, trust_level)
    VALUES ('INV-FIX-1', 'fix|40*30*10|红色|普通提|空白袋', '40*30*10', 'SC-RED', '普通提', '空白袋', 'FIX区', '仓库已清点', 1000, 500, 0, 0, '已清点');
    INSERT INTO order_lines (id, biz_no, order_id, customer_id, product_name, order_type, size, bag_color, handle_type, style, original_qty, fulfillment_method, line_status, created_by)
    VALUES ('ORD-FIX-01', 'ORD-FIX-01', 'ORD-0629-001', 'C001', '空白袋', '现货有货', '40*30*10', '红色', '普通提', '空白袋', 300, '自提', '待出库', 'U-OFFICE-A'),
           ('ORD-FIX-02', 'ORD-FIX-02', 'ORD-0629-001', 'C001', '空白袋', '现货有货', '40*30*10', '红色', '普通提', '空白袋', 200, '自提', '待出库', 'U-OFFICE-A');
    INSERT INTO fulfillment_records (id, biz_no, order_line_id, customer_id, customer_snapshot, method, expected_qty, actual_qty, status, created_by)
    VALUES ('F-FIX-1', 'F-FIX-1', 'ORD-FIX-01', 'C001', '{"name":"张三服饰"}'::jsonb, '自提', 300, 300, '待出库', 'U-OFFICE-A'),
           ('F-FIX-2', 'F-FIX-2', 'ORD-FIX-02', 'C001', '{"name":"张三服饰"}'::jsonb, '自提', 200, 200, '待出库', 'U-OFFICE-A');
    INSERT INTO inventory_reservations (id, order_line_id, inventory_item_id, reserved_qty, status, created_by)
    VALUES ('RSV-FIX-1', 'ORD-FIX-01', 'INV-FIX-1', 300, '生效', 'U-OFFICE-A'), ('RSV-FIX-2', 'ORD-FIX-02', 'INV-FIX-1', 200, '生效', 'U-OFFICE-A');
    INSERT INTO price_snapshots (id, order_line_id, snapshot_type, version_no, bag_price, chargeable_qty, final_amount, created_by)
    VALUES ('PRICE-FIX-1', 'ORD-FIX-01', 'confirmation', 1, 0.43, 300, 129, 'U-OFFICE-A'), ('PRICE-FIX-2', 'ORD-FIX-02', 'confirmation', 1, 0.43, 200, 86, 'U-OFFICE-A');`);
  const client = createPostgresPoolClient({ pool });
  const services = createApiSharedServiceRegistry();
  const prepare = async () => {
    const w = { ...await createPostgresCoreWorkspaceReadRepository({ postgresClient: client }).loadState() };
    w.printDeviceRepository = createPostgresPrintDeviceRepository({ postgresClient: client });
    w.fulfillmentActionTransactionRepository = createPostgresFulfillmentActionTransactionRepository({ postgresClient: client });
    w.printJobRepository = createPostgresPrintJobRepository({ postgresClient: client });
    Object.assign(w, await w.printJobRepository.loadState());
    return w;
  };
  const revision = async (id) => (await pool.query("SELECT revision FROM fulfillment_records WHERE id = $1", [id])).rows[0].revision;
  const printAndConfirm = async (id, key, extra = {}) => {
    const printed = await services.fulfillmentPrintCommandService.printFulfillment({ workspace: await prepare(), fulfillmentId: id, operatorId: "U-OFFICE-A",
      body: { documentType: "pickup_note", idempotencyKey: `${key}-print`, ...extra } });
    assert.ok(printed.printJob, JSON.stringify(printed));
    const confirmed = await services.printJobLifecycleService.confirmBrowserPrint({ workspace: await prepare(), printJobId: printed.printJob.printJobId, operatorId: "U-OFFICE-A", body: { confirmed: true, idempotencyKey: `${key}-confirm` } });
    assert.ok(confirmed.printJob, JSON.stringify(confirmed));
    return printed;
  };
  const correct = async (id, body) => services.fulfillmentPrintCommandService.correctFulfillmentNote({ workspace: await prepare(), fulfillmentId: id, operatorId: "U-OFFICE-A",
    body: { expectedRevision: await revision(id), ...body } });
  const statement = async () => (await pool.query("SELECT receivable_amount::float AS receivable, variance_amount::float AS variance, corrected_after_send_at FROM statements WHERE id = 'ST-0629-001'")).rows[0];
  const line = async () => (await pool.query("SELECT delivered_qty, chargeable_qty, final_amount::float AS amount FROM statement_lines WHERE id = 'ST-0629-001-001'")).rows[0];

  // 1) 已入对账单（F001：500 个 180 元），对账单已发给客户
  await pool.query("UPDATE statements SET last_sent_at = now() - interval '1 day' WHERE id = 'ST-0629-001'");
  const first = await printAndConfirm("F001", "fix-f001");
  assert.equal((await correct("F001", { reason: "", idempotencyKey: "fix-noreason" })).code, "NOTE_CORRECTION_REASON_REQUIRED");
  assert.equal((await correct("F001", { reason: "没改", idempotencyKey: "fix-nothing" })).code, "NOTE_CORRECTION_NOTHING_CHANGED");
  const stale = await services.fulfillmentPrintCommandService.correctFulfillmentNote({ workspace: await prepare(), fulfillmentId: "F001", operatorId: "U-OFFICE-A",
    body: { expectedRevision: 1, correctedQty: 480, reason: "旧页面", idempotencyKey: "fix-stale" } });
  assert.equal(stale.code, "NOTE_CORRECTION_CHANGED", "页面过期要拒绝");
  const qtyFix = await correct("F001", { correctedQty: 480, reason: "实际只拉走 480 个", idempotencyKey: "fix-qty-0001" });
  assert.ok(qtyFix.response, JSON.stringify(qtyFix));
  assert.deepEqual(qtyFix.response.changes, ["数量 500 → 480"]);
  assert.equal(qtyFix.response.statementNeedsResend, true);
  assert.deepEqual(await line(), { delivered_qty: 480, chargeable_qty: 480, amount: 172.8 }, "对账单这一行按原单价 0.36 改成 480 个 172.8");
  const afterQty = await statement();
  assert.deepEqual([afterQty.receivable, afterQty.variance], [265.8, 265.8], "对账单合计 273 → 265.8");
  assert.ok(afterQty.corrected_after_send_at, "已发给客户的对账单要提示重发");
  assert.equal((await pool.query("SELECT status FROM print_records WHERE id = $1", [first.printRecord.printRecordId ?? first.printRecord.id])).rows[0].status, "voided");
  assert.equal((await pool.query("SELECT actual_qty FROM fulfillment_records WHERE id = 'F001'")).rows[0].actual_qty, 480);
  const snapshot = (await pool.query("SELECT snapshot_type, chargeable_qty, final_amount::float AS amount FROM price_snapshots WHERE order_line_id = 'ORD-0629-001-01' ORDER BY created_at DESC, id DESC LIMIT 1")).rows[0];
  assert.deepEqual(snapshot, { snapshot_type: "note_correction", chargeable_qty: 480, amount: 172.8 });
  const replay = await services.fulfillmentPrintCommandService.correctFulfillmentNote({ workspace: await prepare(), fulfillmentId: "F001", operatorId: "U-OFFICE-A",
    body: { expectedRevision: (await revision("F001")) - 1, correctedQty: 480, reason: "实际只拉走 480 个", idempotencyKey: "fix-qty-0001" } });
  assert.ok(replay.code === "NOTE_CORRECTION_CHANGED" || replay.response, "重试不会重复改");
  assert.deepEqual(await line(), { delivered_qty: 480, chargeable_qty: 480, amount: 172.8 });

  // 重打：纸上是新数量、新金额
  const reprinted = await services.fulfillmentPrintCommandService.printFulfillment({ workspace: await prepare(), fulfillmentId: "F001", operatorId: "U-OFFICE-A",
    body: { documentType: "pickup_note", printAction: "reprint", previousPrintRecordId: first.printRecord.printRecordId ?? first.printRecord.id, reprintReason: "作废重打", idempotencyKey: "fix-reprint-1" } });
  assert.ok(reprinted.printJob, JSON.stringify(reprinted));
  const fields = reprinted.printTemplate.fields;
  assert.equal(Number(fields.totalQuantity ?? fields.lineItems?.[0]?.deliveredQty), 480);
  assert.equal(Number(fields.totalAmount), 172.8);
  await services.printJobLifecycleService.confirmBrowserPrint({ workspace: await prepare(), printJobId: reprinted.printJob.printJobId, operatorId: "U-OFFICE-A", body: { confirmed: true, idempotencyKey: "fix-reprint-1-confirm" } });

  // 2) 改单价 0.36 → 0.4，同时只改地址
  const priceFix = await correct("F001", { correctedUnitPrice: "0.4", address: "宁晋县河渠镇新地址 8 号", reason: "单价按 0.4 结", idempotencyKey: "fix-price-0002" });
  assert.ok(priceFix.response, JSON.stringify(priceFix));
  assert.deepEqual(priceFix.response.changes, ["单价 0.36 → 0.4", "地址改为「宁晋县河渠镇新地址 8 号」"]);
  assert.deepEqual(await line(), { delivered_qty: 480, chargeable_qty: 480, amount: 192 });
  assert.equal((await statement()).receivable, 285);
  assert.equal((await pool.query("SELECT customer_snapshot->>'address' AS address FROM fulfillment_records WHERE id = 'F001'")).rows[0].address, "宁晋县河渠镇新地址 8 号");

  // 3) 收过款的对账单不能改
  await pool.query("UPDATE statements SET received_amount = 10 WHERE id = 'ST-0629-001'");
  const reprinted2 = await services.fulfillmentPrintCommandService.printFulfillment({ workspace: await prepare(), fulfillmentId: "F001", operatorId: "U-OFFICE-A",
    body: { documentType: "pickup_note", printAction: "reprint", previousPrintRecordId: reprinted.printRecord.printRecordId ?? reprinted.printRecord.id, reprintReason: "作废重打", idempotencyKey: "fix-reprint-2" } });
  await services.printJobLifecycleService.confirmBrowserPrint({ workspace: await prepare(), printJobId: reprinted2.printJob.printJobId, operatorId: "U-OFFICE-A", body: { confirmed: true, idempotencyKey: "fix-reprint-2-confirm" } });
  assert.equal((await correct("F001", { correctedQty: 470, reason: "再改", idempotencyKey: "fix-settled" })).code, "NOTE_CORRECTION_STATEMENT_SETTLED");
  await pool.query("UPDATE statements SET received_amount = 0 WHERE id = 'ST-0629-001'");

  // 4) 打单扣过库存的：整张作废退回库存；改数量按差额退
  const profileWorkspace = { printDeviceRepository: createPostgresPrintDeviceRepository({ postgresClient: client }) };
  const profile = await readCompanyPrintProfile(profileWorkspace);
  await saveCompanyPrintProfile({ workspace: profileWorkspace, operatorId: "U-OFFICE-A", body: { ...profile, deductStockAtNotePrint: true, expectedRevision: profile.revision, idempotencyKey: "fix-turn-on-01" } });
  const stock = async () => (await pool.query("SELECT on_hand_qty FROM inventory_items WHERE id = 'INV-FIX-1'")).rows[0].on_hand_qty;
  await printAndConfirm("F-FIX-2", "fix-f2");
  assert.equal(await stock(), 800, "打单扣 200");
  const voidWhole = await correct("F-FIX-2", { voidWhole: true, reason: "客户整单不要了", idempotencyKey: "fix-void-0003" });
  assert.ok(voidWhole.response, JSON.stringify(voidWhole));
  assert.equal(await stock(), 1000, "整张作废退回 200");
  assert.equal((await pool.query("SELECT status FROM fulfillment_records WHERE id = 'F-FIX-2'")).rows[0].status, "已取消");

  await printAndConfirm("F-FIX-1", "fix-f1");
  assert.equal(await stock(), 700, "打单扣 300");
  assert.equal((await correct("F-FIX-1", { correctedQty: 280, reason: "还没拉走", idempotencyKey: "fix-unbilled" })).code, "NOTE_CORRECTION_NOT_BILLED_YET", "还没入账的改数量去订单里改");
  // 模拟拉走入账：对账单一行 300 个 129 元
  await pool.query(`INSERT INTO statements (id, biz_no, customer_id, period_start, period_end, status, receivable_amount, received_amount, variance_amount, created_by)
      VALUES ('ST-FIX', 'ST-FIX', 'C001', '2026-11-01', '2026-11-30', '待生成', 129, 0, 129, 'U-OFFICE-A');
    INSERT INTO statement_lines (id, statement_id, order_line_id, fulfillment_id, delivered_qty, chargeable_qty, free_qty, amount, adjustment_amount, final_amount)
      VALUES ('ST-FIX-1', 'ST-FIX', 'ORD-FIX-01', 'F-FIX-1', 300, 300, 0, 129, 0, 129);`);
  const fixQty = await correct("F-FIX-1", { correctedQty: 280, reason: "实际 280 个", idempotencyKey: "fix-qty-0004" });
  assert.ok(fixQty.response, JSON.stringify(fixQty));
  assert.equal(await stock(), 720, "改成 280 退回 20");
  assert.equal(fixQty.response.statementNeedsResend, false, "没发过的对账单不用提示重发");
  assert.deepEqual((await pool.query("SELECT final_amount::float AS amount FROM statement_lines WHERE id = 'ST-FIX-1'")).rows[0], { amount: 120.4 });
  const ledgers = (await pool.query("SELECT qty_change, source_type FROM inventory_ledger_entries WHERE source_id = 'F-FIX-1' ORDER BY occurred_at, qty_change")).rows;
  assert.deepEqual(ledgers, [{ qty_change: -300, source_type: "fulfillment_note_print" }, { qty_change: 20, source_type: "fulfillment_note_correction_return" }]);
  const log = (await pool.query("SELECT action, reason FROM operation_logs WHERE target_id = 'F-FIX-1' AND action = 'correct_fulfillment_note'")).rows[0];
  assert.deepEqual(log, { action: "correct_fulfillment_note", reason: "实际 280 个" });

  console.log(`PASS note correction PG (${migrations.length} migrations): 改数量（对账单行与合计、订单价格快照、重打纸单）、改单价、改地址、已发对账单提示重发、收过款不能改、整张作废退库存、改数量按差额退库存、页面过期拒绝。`);
} finally {
  if (pool) await pool.end();
  spawnSync("docker", ["rm", "-f", name], { encoding: "utf8" });
}
