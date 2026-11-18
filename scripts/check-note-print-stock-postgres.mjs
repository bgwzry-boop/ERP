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
  const prepareStock = async (id, key, preparedQty, note = "") => {
    const workspace = await prepare();
    const row = workspace.fulfillments.find(fulfillment => fulfillment.id === id);
    const body = { expectedRevision: row.revision, employeeId: "EMP-LIVE-MANAGER-001", preparedQty: preparedQty ?? row.expectedQty, location: "测试备货区", note, idempotencyKey: key };
    const result = await services.fulfillmentActionCommandService.recordStockPreparation({ workspace, fulfillmentId: id, operatorId: "U-OFFICE-A", body });
    assert.ok(result.response?.operationLogId, JSON.stringify(result));
    return { body, result };
  };

  // 0) 开关默认关：打印、确认都不扣库存
  assert.equal((await readCompanyPrintProfile({ printDeviceRepository: createPostgresPrintDeviceRepository({ postgresClient: client }) })).deductStockAtNotePrint, false);
  await pool.query("INSERT INTO production_tasks(id,biz_no,order_line_id,task_type,planned_qty,task_status) VALUES ('PT-NP-CANCEL','PT-NP-CANCEL','ORD-NP-02','制袋',200,'已取消')");
  await pool.query("UPDATE order_lines SET line_status='缺货待处理' WHERE id='ORD-NP-02'");
  assert.equal((await print("F-NP-2", "np-short-route")).code, "FULFILLMENT_NOTE_NOT_READY", "缺货记录即使库存有历史占用也不能伪装有货");
  await pool.query("UPDATE order_lines SET line_status='待出库' WHERE id='ORD-NP-02'");
  const unprepared = await print("F-NP-2", "np-before-prep");
  assert.equal(unprepared.code, "FULFILLMENT_NOTE_NOT_READY");
  assert.match(unprepared.message, /备货/u);
  await prepareStock("F-NP-2", "np-prep-2-partial", 190, "还差十个");
  assert.equal((await print("F-NP-2", "np-partial-prep")).code, "FULFILLMENT_NOTE_NOT_READY");
  const completePrep = await prepareStock("F-NP-2", "np-prep-2");
  const preparationReplay = await services.fulfillmentActionCommandService.recordStockPreparation({
    workspace: await prepare(), fulfillmentId: "F-NP-2", operatorId: "U-OFFICE-A", body: completePrep.body,
  });
  assert.deepEqual(preparationReplay.response, { ...completePrep.result.response, replayed: true });
  assert.deepEqual(await stock(), { on_hand_qty: 1000, reserved_qty: 500 }, "确认备货不扣库、不释放占用");
  const off = await print("F-NP-2", "np-off-print");
  assert.ok(off.printJob, JSON.stringify(off));
  await prepareStock("F-NP-2", "np-prep-2-recheck", 190, "交纸单前重新清点后发现差十个");
  assert.equal((await confirm(off.printJob.printJobId, "np-stale-confirm")).code, "FULFILLMENT_NOTE_NOT_READY");
  await prepareStock("F-NP-2", "np-prep-2-verified");
  assert.ok((await confirm(off.printJob.printJobId, "np-off-confirm")).printJob);
  assert.deepEqual(await stock(), { on_hand_qty: 1000, reserved_qty: 500 }, "开关关着不扣");
  assert.equal((await fulfillment("F-NP-2")).stock_deducted_at, null);

  // 打开开关（单据抬头里勾上）
  const profileWorkspace = { printDeviceRepository: createPostgresPrintDeviceRepository({ postgresClient: client }) };
  const current = await readCompanyPrintProfile(profileWorkspace);
  const turnedOn = await saveCompanyPrintProfile({ workspace: profileWorkspace, operatorId: "U-OFFICE-A", body: { ...current, deductStockAtNotePrint: true, expectedRevision: current.revision, idempotencyKey: "np-turn-on-0001" } });
  assert.equal(turnedOn.companyPrintProfile.deductStockAtNotePrint, true);

  // 1) 有占用：确认打出来按占用扣 300，重复确认不再扣
  await prepareStock("F-NP-1", "np-prep-1");
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

  // Regular delivery with no packages cannot deduct via the print switch or
  // through warehouse execution. Single-line package labels use the same
  // trusted printer receipt as mixed packages.
  await pool.query(`
    INSERT INTO inventory_items (id, inventory_key, size, standard_color_id, handle_type, style, zone, inventory_state, on_hand_qty, reserved_qty)
    VALUES ('INV-NP-DISPATCH', 'np-delivery', '40*30*10', 'SC-RED', '普通提', '空白袋', '隔离验收送货区', '仓库已清点', 180, 180);
    INSERT INTO order_lines (id, biz_no, order_id, customer_id, product_name, order_type, size, bag_color, handle_type, style, original_qty, fulfillment_method, line_status, created_by)
    VALUES ('ORD-NP-D1', 'ORD-NP-D1', 'ORD-0629-001', 'C001', '空白袋', '现货有货', '40*30*10', '红色', '普通提', '空白袋', 100, '送货', '待出库', 'U-OFFICE-A'),
           ('ORD-NP-D2', 'ORD-NP-D2', 'ORD-0629-001', 'C001', '空白袋', '现货有货', '40*30*10', '红色', '普通提', '空白袋', 80, '送货', '待出库', 'U-OFFICE-A');
    INSERT INTO fulfillment_records (id, biz_no, order_line_id, customer_id, customer_snapshot, method, expected_qty, actual_qty, status, created_by)
    VALUES ('F-NP-D1', 'F-NP-D1', 'ORD-NP-D1', 'C001', '{"name":"合成送货客户"}'::jsonb, '送货', 100, 100, '待出库', 'U-OFFICE-A'),
           ('F-NP-D2', 'F-NP-D2', 'ORD-NP-D2', 'C001', '{"name":"合成送货客户"}'::jsonb, '送货', 80, 80, '待出库', 'U-OFFICE-A');
    INSERT INTO inventory_reservations (id, order_line_id, inventory_item_id, reserved_qty, status, created_by)
    VALUES ('RSV-NP-D1', 'ORD-NP-D1', 'INV-NP-DISPATCH', 100, '生效', 'U-OFFICE-A'), ('RSV-NP-D2', 'ORD-NP-D2', 'INV-NP-DISPATCH', 80, '生效', 'U-OFFICE-A');
    INSERT INTO price_snapshots (id, order_line_id, snapshot_type, version_no, bag_price, chargeable_qty, final_amount, created_by)
    VALUES ('PRICE-NP-D1', 'ORD-NP-D1', 'confirmation', 1, 0.43, 100, 43, 'U-OFFICE-A'), ('PRICE-NP-D2', 'ORD-NP-D2', 'confirmation', 1, 0.43, 80, 34.4, 'U-OFFICE-A');
    INSERT INTO printer_devices(id,biz_no,name,device_type,connection_type,supported_document_types,default_document_types,settings_json,created_by)
    VALUES('PRN-NP-LABEL','PRN-NP-LABEL','合成包裹标签机','label','system_printer',ARRAY['package_label'],ARRAY['package_label'],'{"driverMode":"system_printer"}','U-OFFICE-A');
  `);
  const deliveryStock = async () => (await pool.query("SELECT on_hand_qty,reserved_qty FROM inventory_items WHERE id='INV-NP-DISPATCH'")).rows[0];
  const warehouse = services.fulfillmentActionCommandService;
  await prepareStock("F-NP-D1", "np-prep-delivery-1");
  await prepareStock("F-NP-D2", "np-prep-delivery-2");
  const deliveryPaper = await print("F-NP-D1", "np-delivery-no-pack", { documentType: "delivery_note" });
  assert.ok(deliveryPaper.printJob, JSON.stringify(deliveryPaper));
  assert.equal((await confirm(deliveryPaper.printJob.printJobId, "np-delivery-no-pack-print")).printJob.jobStatus, "printed");
  assert.equal((await fulfillment("F-NP-D1")).stock_deducted_at, null);
  assert.match((await fulfillment("F-NP-D1")).stock_deduction_note, /没扣库存.*实际包裹/);
  assert.deepEqual(await deliveryStock(), { on_hand_qty: 180, reserved_qty: 180 });
  const packageProof = async (id, lineId, qty) => {
    await pool.query("INSERT INTO packages(id,biz_no,order_line_id,fulfillment_id,packed_qty) VALUES($1,$1,$2,$3,$4)", ["PKG-"+id, lineId, id, qty]);
    const queued = await print(id, "np-delivery-label-"+id, { documentType: "package_label", printDeviceId: "PRN-NP-LABEL" });
    assert.ok(queued.printJob, JSON.stringify(queued));
    let workspace = await prepare();
    const job = workspace.printJobs.find(row => row.printJobId === queued.printJob.printJobId);
    const now = new Date().toISOString();
    const result = await services.printJobBusinessProjectionService.persistFulfillmentPrintJobProjection({
      workspace, printJob: { ...job, jobStatus: "printed", finishedAt: now }, operatorId: "U-OFFICE-A",
      idempotencyKey: "np-delivery-label-confirm-"+id,
      printJobOperationLog: { id: "LOG-LABEL-"+id, targetType: "print_job", targetId: job.printJobId,
        action: "record_print_job_driver_status", operatorId: "U-OFFICE-A", occurredAt: now, createdAt: now },
    });
    assert.equal(result.physicalPrintConfirmed, true, JSON.stringify(result));
  };
  const instruction = async () => {
    const workspace = await prepare();
    const f = workspace.fulfillments.find(row => row.id === "F-NP-D1");
    const paper = workspace.paperOutboundDocuments.find(row => row.fulfillmentId === f.id);
    return { workspace, fulfillmentId: f.id, operatorId: "U-OFFICE-A",
      body: { expectedRevision: f.revision, paperOutboundDocumentId: paper.id ?? paper.paperOutboundDocumentId,
        paperDocumentRevision: paper.revision, paperDocumentVersion: paper.documentVersion } };
  };
  let handoff = await instruction();
  assert.ok((await warehouse.handoffPaperOutboundDocument({ ...handoff, body: { ...handoff.body, idempotencyKey: "np-delivery-handoff" } })).response);
  const execute = (input, key) => {
    return warehouse.recordWarehouseOutboundExecution({ ...input, body: { ...input.body, result: "实物已出库", actualQty: 100,
      physicalExecutorEmployeeId: "EMP-LIVE-MANAGER-001", feedbackChannel: "当面", idempotencyKey: key } });
  };
  assert.equal((await execute(await instruction(), "np-delivery-cannot-deduct")).code, "WAREHOUSE_REAL_PACKAGES_REQUIRED");
  assert.deepEqual(await deliveryStock(), { on_hand_qty: 180, reserved_qty: 180 });
  await packageProof("F-NP-D1", "ORD-NP-D1", 100);
  const readyExecution = await instruction();
  assert.equal((await execute(readyExecution, "np-delivery-confirmed")).response.status, "待司机装车");
  assert.equal((await execute(readyExecution, "np-delivery-confirmed")).response.replayed, true);
  assert.deepEqual(await deliveryStock(), { on_hand_qty: 80, reserved_qty: 80 });
  await packageProof("F-NP-D2", "ORD-NP-D2", 80);
  const packedPaper = await print("F-NP-D2", "np-delivery-packed", { documentType: "delivery_note" });
  assert.ok(packedPaper.printJob, JSON.stringify(packedPaper));
  assert.equal((await confirm(packedPaper.printJob.printJobId, "np-delivery-packed-print")).printJob.jobStatus, "printed");
  assert.ok((await fulfillment("F-NP-D2")).stock_deducted_at);
  assert.deepEqual(await deliveryStock(), { on_hand_qty: 0, reserved_qty: 0 });

  // 3) 线上库存对不上（F001 同款有两处库存）：不确认不让打；出库工确认后能打，打出来不扣、留提醒
  await prepareStock("F001", "np-prep-f001");
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
