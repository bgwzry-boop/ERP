// 负责人 2026-11-08「打送货单扣库存」在装好全部迁移的真实 PostgreSQL 上：
// 开关关着时一切照旧；打开后，送货单 / 自提单确认打出来就扣成品库存（有占用按占用扣），重复确认不再扣，
// 库房登记实物出库不扣第二次；线上库存对不上时要出库工确认才能打，打出来不扣并留提醒；取消出库把扣掉的退回库存。
import { checkFulfillmentNoteReadinessPostgres } from "./helpers/checkFulfillmentNoteReadinessPostgres.mjs";
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

const name = `erp-note-stock-${process.pid}-${Date.now()}`;
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
  // 一个能唯一对上的现货：40*30*10 红 普通提 空白袋，在库 1000，两张自提单各占用 300 / 200。
  await pool.query(`
    INSERT INTO inventory_items (id, inventory_key, size, standard_color_id, handle_type, style, zone, inventory_state, on_hand_qty, reserved_qty, waiting_pickup_locked_qty, pending_handling_qty, trust_level)
    VALUES ('INV-NP-1', 'np|40*30*10|红色|普通提|空白袋', '40*30*10', 'SC-RED', '普通提', '空白袋', 'NP区', '仓库已清点', 1000, 500, 0, 0, '已清点');
    INSERT INTO order_lines (id, biz_no, order_id, customer_id, product_name, order_type, size, bag_color, handle_type, style, original_qty, fulfillment_method, line_status, created_by)
    VALUES ('ORD-NP-01', 'ORD-NP-01', 'ORD-0629-001', 'C001', '空白袋', '现货有货', '40*30*10', '红色', '普通提', '空白袋', 300, '自提', '待出库', 'U-OFFICE-A'),
           ('ORD-NP-02', 'ORD-NP-02', 'ORD-0629-001', 'C001', '空白袋', '现货有货', '40*30*10', '红色', '普通提', '空白袋', 200, '自提', '待出库', 'U-OFFICE-A');
    INSERT INTO fulfillment_records (id, biz_no, order_line_id, customer_id, customer_snapshot, method, expected_qty, actual_qty, status, created_by)
    VALUES ('F-NP-1', 'F-NP-1', 'ORD-NP-01', 'C001', '{"name":"张三服饰"}'::jsonb, '自提', 300, 300, '待出库', 'U-OFFICE-A'),
           ('F-NP-2', 'F-NP-2', 'ORD-NP-02', 'C001', '{"name":"张三服饰"}'::jsonb, '自提', 200, 200, '待出库', 'U-OFFICE-A');
    INSERT INTO inventory_reservations (id, order_line_id, inventory_item_id, reserved_qty, status, created_by)
    VALUES ('RSV-NP-1', 'ORD-NP-01', 'INV-NP-1', 300, '生效', 'U-OFFICE-A'), ('RSV-NP-2', 'ORD-NP-02', 'INV-NP-1', 200, '生效', 'U-OFFICE-A');
    INSERT INTO price_snapshots (id, order_line_id, snapshot_type, version_no, bag_price, chargeable_qty, final_amount, created_by)
    VALUES ('PRICE-NP-1', 'ORD-NP-01', 'confirmation', 1, 0.43, 300, 129, 'U-OFFICE-A'), ('PRICE-NP-2', 'ORD-NP-02', 'confirmation', 1, 0.43, 200, 86, 'U-OFFICE-A'),
           ('PRICE-NP-F001', 'ORD-0629-001-01', 'confirmation', 1, 0.36, 500, 180, 'U-OFFICE-A');`);
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
  await checkFulfillmentNoteReadinessPostgres({ pool, services, prepare });
  const stock = async () => (await pool.query("SELECT on_hand_qty, reserved_qty FROM inventory_items WHERE id = 'INV-NP-1'")).rows[0];
  const fulfillment = async (id) => (await pool.query("SELECT stock_deducted_at, stock_deduction_note, status FROM fulfillment_records WHERE id = $1", [id])).rows[0];
  const print = async (id, key, extra = {}) => services.fulfillmentPrintCommandService.printFulfillment({ workspace: await prepare(), fulfillmentId: id, operatorId: "U-OFFICE-A",
    body: { documentType: "pickup_note", pickerName: "提货人甲", idempotencyKey: key, ...extra } });
  const confirm = async (jobId, key) => services.printJobLifecycleService.confirmBrowserPrint({ workspace: await prepare(), printJobId: jobId, operatorId: "U-OFFICE-A", body: { confirmed: true, idempotencyKey: key } });

  // 0) 开关默认关：打印、确认都不扣库存
  assert.equal((await readCompanyPrintProfile({ printDeviceRepository: createPostgresPrintDeviceRepository({ postgresClient: client }) })).deductStockAtNotePrint, false);
  await pool.query("INSERT INTO production_tasks(id,biz_no,order_line_id,task_type,planned_qty,task_status) VALUES ('PT-NP-CANCEL','PT-NP-CANCEL','ORD-NP-02','制袋',200,'已取消')");
  await pool.query("UPDATE order_lines SET line_status='缺货待处理' WHERE id='ORD-NP-02'");
  assert.equal((await print("F-NP-2", "np-short-route")).code, "FULFILLMENT_NOTE_NOT_READY", "缺货记录即使库存有历史占用也不能伪装有货");
  await pool.query("UPDATE order_lines SET line_status='待出库' WHERE id='ORD-NP-02'");
  const off = await print("F-NP-2", "np-off-print");
  assert.ok(off.printJob, JSON.stringify(off));
  assert.ok((await confirm(off.printJob.printJobId, "np-off-confirm")).printJob);
  assert.deepEqual(await stock(), { on_hand_qty: 1000, reserved_qty: 500 }, "开关关着不扣");
  assert.equal((await fulfillment("F-NP-2")).stock_deducted_at, null);

  // 打开开关（单据抬头里勾上）
  const profileWorkspace = { printDeviceRepository: createPostgresPrintDeviceRepository({ postgresClient: client }) };
  const current = await readCompanyPrintProfile(profileWorkspace);
  const turnedOn = await saveCompanyPrintProfile({ workspace: profileWorkspace, operatorId: "U-OFFICE-A", body: { ...current, deductStockAtNotePrint: true, expectedRevision: current.revision, idempotencyKey: "np-turn-on-0001" } });
  assert.equal(turnedOn.companyPrintProfile.deductStockAtNotePrint, true);

  // 1) 有占用：确认打出来按占用扣 300，重复确认不再扣
  const first = await print("F-NP-1", "np-print-1");
  assert.ok(first.printJob, JSON.stringify(first));
  assert.deepEqual(await stock(), { on_hand_qty: 1000, reserved_qty: 500 }, "只是排队打印还不扣");
  const confirmed = await confirm(first.printJob.printJobId, "np-confirm-1");
  assert.ok(confirmed.printJob, JSON.stringify(confirmed));
  assert.deepEqual(await stock(), { on_hand_qty: 700, reserved_qty: 200 }, "确认打出来扣在库 300、释放占用 300");
  assert.equal((await pool.query("SELECT status FROM inventory_reservations WHERE id = 'RSV-NP-1'")).rows[0].status, "已出库");
  const ledger = (await pool.query("SELECT qty_before, qty_change, qty_after, source_type FROM inventory_ledger_entries WHERE source_id = 'F-NP-1'")).rows;
  assert.deepEqual(ledger, [{ qty_before: 1000, qty_change: -300, qty_after: 700, source_type: "fulfillment_note_print" }]);
  const deducted = await fulfillment("F-NP-1");
  assert.ok(deducted.stock_deducted_at);
  assert.equal(deducted.stock_deduction_note, "打单已扣库存 300 个");
  const again = await confirm(first.printJob.printJobId, "np-confirm-1b");
  assert.equal(again.alreadyConfirmed, true);
  assert.deepEqual(await stock(), { on_hand_qty: 700, reserved_qty: 200 }, "重复确认不再扣");

  // 2) 库房拿单出库：交库房 → 登记实物已出库，不扣第二次
  let w = await prepare();
  const paper = (await pool.query("SELECT id, document_version, revision FROM paper_outbound_documents WHERE print_record_id = $1", [first.printRecord.printRecordId ?? first.printRecord.id])).rows[0];
  const handed = await services.fulfillmentActionCommandService.handoffPaperOutboundDocument({ workspace: w, fulfillmentId: "F-NP-1", operatorId: "U-OFFICE-A",
    body: { expectedRevision: (await pool.query("SELECT revision FROM fulfillment_records WHERE id='F-NP-1'")).rows[0].revision, paperOutboundDocumentId: paper.id, paperDocumentVersion: paper.document_version, paperDocumentRevision: paper.revision, idempotencyKey: "np-handoff-1" } });
  assert.ok(!handed.code, JSON.stringify(handed));
  w = await prepare();
  const handedPaper = (await pool.query("SELECT id, document_version, revision FROM paper_outbound_documents WHERE id = $1", [paper.id])).rows[0];
  const outbound = await services.fulfillmentActionCommandService.recordWarehouseOutboundExecution({ workspace: w, fulfillmentId: "F-NP-1", operatorId: "U-OFFICE-A",
    body: { expectedRevision: (await pool.query("SELECT revision FROM fulfillment_records WHERE id='F-NP-1'")).rows[0].revision, paperOutboundDocumentId: handedPaper.id, paperDocumentVersion: handedPaper.document_version, paperDocumentRevision: handedPaper.revision,
      result: "实物已出库", actualQty: 300, physicalExecutorEmployeeId: "EMP-LIVE-MANAGER-001", feedbackChannel: "当面", idempotencyKey: "np-outbound-1" } });
  assert.ok(!outbound.error && !outbound.code, JSON.stringify(outbound));
  assert.deepEqual(await stock(), { on_hand_qty: 700, reserved_qty: 200 }, "库房登记实物出库不再扣");
  assert.equal(Number((await pool.query("SELECT count(*) FROM inventory_ledger_entries WHERE source_id = 'F-NP-1'")).rows[0].count), 1);

  // 已经出库的货发现拿货人写错。走正式作废更正、重新生成、冷启动回读并确认打印。
  const corrected = await services.fulfillmentPrintCommandService.correctFulfillmentNote({ workspace: await prepare(), fulfillmentId: "F-NP-1", operatorId: "U-OFFICE-A",
    body: { pickerName: "更正提货人", reason: "客户核实后更正提货人", idempotencyKey: "np-shipped-correction" } });
  assert.ok(corrected.response, JSON.stringify(corrected));
  const historyNote = await print("F-NP-1", "np-shipped-reprint", { pickerName: "更正提货人", printAction: "reprint", previousPrintRecordId: corrected.response.previousPrintRecordId, reprintReason: "更正提货人" });
  assert.ok(historyNote.printJob, JSON.stringify(historyNote));
  assert.equal(historyNote.paperOutboundDocument ?? null, null);
  assert.equal((await confirm(historyNote.printJob.printJobId, "np-shipped-reconfirm")).printJob.jobStatus, "printed");
  assert.deepEqual(await stock(), { on_hand_qty: 700, reserved_qty: 200 }, "已出库的单据更正重打仍只扣一次");
  assert.equal(Number((await pool.query("SELECT count(*) FROM inventory_ledger_entries WHERE source_id='F-NP-1'")).rows[0].count), 1);

  // 3) 线上库存对不上（F001 同款有两处库存）：不确认不让打；出库工确认后能打，打出来不扣、留提醒
  const short = await print("F001", "np-short-1");
  assert.equal(short.code, "FULFILLMENT_NOTE_STOCK_SHORT");
  assert.match(short.message, /出库工/u);
  const items = async () => (await pool.query("SELECT id, on_hand_qty, reserved_qty FROM inventory_items ORDER BY id")).rows;
  const before = await items();
  const shortOk = await print("F001", "np-short-2", { warehouseStockConfirmation: { confirmedBy: "出库工老王" } });
  assert.ok(shortOk.printJob, JSON.stringify(shortOk));
  assert.ok((await confirm(shortOk.printJob.printJobId, "np-short-confirm")).printJob);
  assert.deepEqual(await items(), before, "对不上的不扣任何库存");
  const shortNote = await fulfillment("F001");
  assert.ok(shortNote.stock_deducted_at);
  assert.match(shortNote.stock_deduction_note, /出库工老王.*没扣库存，请盘点修正/u);

  // 4) 打单扣过的取消出库：扣掉的 200 退回库存
  const voided = await services.fulfillmentPrintCommandService.voidPrintRecord({ workspace: await prepare(), printRecordId: off.printRecord.printRecordId ?? off.printRecord.id, operatorId: "U-OFFICE-A",
    body: { voidReason: "开关打开后重打", idempotencyKey: "np-void-off" } });
  assert.ok(!voided.error && !voided.code, JSON.stringify(voided));
  const second = await print("F-NP-2", "np-print-2", { printAction: "reprint", previousPrintRecordId: off.printRecord.printRecordId ?? off.printRecord.id, reprintReason: "开关打开后重打" });
  assert.ok(second.printJob, JSON.stringify(second));
  assert.ok((await confirm(second.printJob.printJobId, "np-confirm-2")).printJob);
  assert.deepEqual(await stock(), { on_hand_qty: 500, reserved_qty: 0 });
  w = await prepare();
  const canceled = await services.fulfillmentActionCommandService.cancelFulfillment({ workspace: w, fulfillmentId: "F-NP-2", operatorId: "U-OFFICE-A",
    body: { reason: "office_correction", reasonText: "客户不要了", expectedRevision: (await pool.query("SELECT revision FROM fulfillment_records WHERE id='F-NP-2'")).rows[0].revision, idempotencyKey: "np-cancel-2" } });
  assert.ok(!canceled.error && !canceled.code, JSON.stringify(canceled));
  assert.deepEqual(await stock(), { on_hand_qty: 700, reserved_qty: 0 }, "取消后退回 200");
  const returned = (await pool.query("SELECT qty_change, source_type FROM inventory_ledger_entries WHERE source_id = 'F-NP-2' ORDER BY qty_change")).rows;
  assert.deepEqual(returned, [{ qty_change: -200, source_type: "fulfillment_note_print" }, { qty_change: 200, source_type: "fulfillment_cancel_note_print_return" }]);

  console.log(`PASS note print stock PG (${migrations.length} migrations): 开关默认关不扣；打开后确认打出来按占用扣、重复确认不扣、库房实物出库不扣第二次；库存对不上要出库工确认、不扣并提醒盘点；取消出库退回库存。`);
} finally {
  if (pool) await pool.end();
  spawnSync("docker", ["rm", "-f", name], { encoding: "utf8" });
}
