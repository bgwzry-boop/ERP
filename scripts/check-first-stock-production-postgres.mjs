// Isolated PostgreSQL only: first common-goods completion must create its stock
// atomically with the report, reservation and ledger. Never uses an external DB.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";
import { postgresLiveBusinessSeedSql } from "./helpers/postgresLiveBusinessSeed.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresCoreWorkspaceReadRepository } from "../server/coreWorkspaceReadRepository.mjs";
import { createLocalProductionPackingTransactionRepository, createPostgresProductionPackingTransactionRepository } from "../server/productionPackingTransactionRepository.mjs";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";

const container = `erp-first-stock-${process.pid}-${Date.now()}`;
const docker = args => {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};
let pool;
try {
  docker(["run", "--rm", "-d", "--name", container, "-p", "127.0.0.1::5432", "-e", "POSTGRES_DB=erp", "-e", "POSTGRES_USER=erp", "-e", "POSTGRES_PASSWORD=erp", "postgres:16-alpine"]);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "erp"], { stdio: "ignore" }).status === 0) break;
    if (attempt === 59) throw new Error("ISOLATED_POSTGRES_START_TIMEOUT");
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const port = Number(docker(["port", container, "5432/tcp"]).split(":").at(-1));
  pool = new pg.Pool({ host: "127.0.0.1", port, database: "erp", user: "erp", password: "erp", statement_timeout: 15000 });
  const migrations = loadMigrationFiles();
  validateMigrationSet(migrations);
  for (const migration of migrations) await pool.query(migration.sql);
  await pool.query(postgresLiveBusinessSeedSql);
  // Migration 0046 and the legacy synthetic seed both define red. This fixture
  // explicitly keeps SC-RED authoritative; ambiguity is exercised below.
  await pool.query("UPDATE standard_colors SET enabled=false WHERE name='红色' AND id<>'SC-RED'");

  const client = createPostgresPoolClient({ pool });
  const readRepository = createPostgresCoreWorkspaceReadRepository({ postgresClient: client });
  const repository = createPostgresProductionPackingTransactionRepository({ postgresClient: client });
  const service = createApiSharedServiceRegistry().productionReportingCommandService;
  const prepare = async () => ({ ...await readRepository.loadState(), productionPackingTransactionRepository: repository });
  await pool.query("INSERT INTO machines(id,biz_no,name,machine_type,workshop,status,enabled) VALUES('PRINT-FIRST','PRINT-FIRST','隔离丝印机','screen_printing','隔离车间','active',true)");
  const addTask = async (id, { size = "30*37*10", qty = 500, orderType = "stock", method = "送货", taskType = "制袋", color = "红色", style = "空白袋", handle = "普通提" } = {}) => {
    const lineId = `OL-FIRST-${id}`;
    const taskId = `PT-FIRST-${id}`;
    await pool.query(`INSERT INTO order_lines(id,biz_no,order_id,customer_id,product_name,order_type,size,bag_color,handle_type,style,original_qty,fulfillment_method,line_status,created_by)
      VALUES($1,$1,'ORD-0629-001','C001','隔离测试通货',$2,$3,$4,$9,$5,$6,$7,$8,'U-OFFICE-A')`,
    [lineId, orderType, size, color, style, qty, method, taskType === "丝印" ? "丝印中" : "制袋中", handle]);
    await pool.query(`INSERT INTO production_tasks(id,biz_no,order_line_id,task_type,machine_id,planned_qty,task_status,created_by)
      VALUES($1,$1,$2,$3,$6,$4,$5,'U-WORKSHOP-A')`, [taskId, lineId, taskType, qty, taskType === "丝印" ? "丝印中" : "制袋中", taskType === "丝印" ? "PRINT-FIRST" : "BAG-03"]);
    return { taskId, lineId, qty, size };
  };
  const complete = async (task, key, extra = {}, workspace) => service.completeProductionReport({
    workspace: workspace ?? await prepare(), productionTaskId: task.taskId, operatorId: "U-WORKSHOP-A",
    body: { qualifiedQty: task.qty, idempotencyKey: key, ...extra },
  });
  const success = (result, label) => {
    assert.ok(result.response?.reportId, `${label}: ${result.code || result.error?.code || JSON.stringify(result)}`);
    return result.response;
  };
  const stocks = async () => (await pool.query("SELECT id,inventory_key,size,standard_color_id,handle_type,style,zone,inventory_state,on_hand_qty,reserved_qty,waiting_pickup_locked_qty,pending_handling_qty,trust_level,revision FROM inventory_items ORDER BY id")).rows;
  const colors = async () => (await pool.query("SELECT id,color_key,name,enabled FROM standard_colors ORDER BY id")).rows;
  const stockFor = async size => (await stocks()).filter(row => row.size === size && row.standard_color_id === "SC-RED" && row.handle_type === "普通提" && row.style === "空白袋");
  const buckets = row => [row.on_hand_qty, row.reserved_qty, row.waiting_pickup_locked_qty, row.pending_handling_qty];
  const effects = async task => (await pool.query(`SELECT
    (SELECT count(*)::int FROM workshop_reports WHERE production_task_id=$1) AS reports,
    (SELECT count(*)::int FROM inventory_reservations WHERE order_line_id=$2) AS reservations,
    (SELECT count(*)::int FROM packing_tasks WHERE order_line_id=$2) AS packing,
    (SELECT count(*)::int FROM operation_logs WHERE target_id=$1) AS logs`, [task.taskId, task.lineId])).rows[0];
  const rejectWithoutEffects = async (task, run, label, expectedCode) => {
    const before = await stocks();
    let result;
    try { result = await run(); } catch (error) { result = { code: error.code, message: error.message, statusCode: error.statusCode }; }
    assert.ok(!result.response?.reportId, `${label}: completion unexpectedly succeeded`);
    assert.match(`${result.code || ""} ${result.message || ""}`, new RegExp(expectedCode), `${label}: precise rejection reason`);
    assert.deepEqual(await effects(task), { reports: 0, reservations: 0, packing: 0, logs: 0 }, `${label}: no partial report/stock side effects`);
    assert.deepEqual(await stocks(), before, `${label}: all inventory rows unchanged`);
    assert.equal((await pool.query("SELECT task_status FROM production_tasks WHERE id=$1", [task.taskId])).rows[0].task_status, "制袋中");
  };
  const originalStocks = await stocks();
  const originalColors = await colors();

  const first = await addTask("CUSTOMER");
  assert.equal(Number((await pool.query("SELECT count(*) FROM inventory_items WHERE size=$1", [first.size])).rows[0].count), 0);
  const firstWorkspace = await prepare();
  const firstReceipt = success(await complete(first, "first-stock-customer-1", {}, firstWorkspace), "first stock completion must create the missing inventory item");
  const [firstStock] = await stockFor(first.size);
  assert.equal((await stockFor(first.size)).length, 1);
  assert.deepEqual(buckets(firstStock), [500, 500, 0, 0]);
  assert.equal(firstStock.zone, "未分区", "first completion must not invent a real warehouse location");
  assert.equal(firstStock.trust_level, "生产报工", "production evidence must not masquerade as warehouse stocktaking");
  assert.equal(firstStock.standard_color_id, "SC-RED", "reuse the maintained standard color identity");
  assert.equal(firstReceipt.inventoryItemId, firstStock.id);
  assert.deepEqual(await effects(first), { reports: 1, reservations: 1, packing: 1, logs: 1 });
  const firstLedger = (await pool.query("SELECT source_type,qty_before,qty_change,qty_after FROM inventory_ledger_entries WHERE source_id=$1 ORDER BY source_type", [firstReceipt.reportId])).rows;
  assert.deepEqual(firstLedger, [
    { source_type: "production_report", qty_before: 0, qty_change: 500, qty_after: 500 },
    { source_type: "production_report_reservation", qty_before: 0, qty_change: 500, qty_after: 500 },
  ]);
  for (const workspace of [firstWorkspace, await prepare()]) {
    const saved = workspace.inventories.find(row => row.id === firstStock.id);
    assert.ok(saved, "new stock must be available both immediately and after a cold read");
    assert.equal(saved.size, first.size);
    assert.equal(saved.color, "红色");
    assert.equal(saved.handle ?? saved.handleType, "普通提");
    assert.equal(saved.style, "空白袋");
    assert.equal(saved.zone, "未分区");
    assert.equal(saved.trustLevel, "生产报工");
    assert.deepEqual([saved.inStock, saved.reserved, saved.locked, saved.pending], [500, 500, 0, 0]);
  }
  const replayBefore = await stocks();
  const replay = success(await complete(first, "first-stock-customer-1"), "cold replay");
  assert.deepEqual(replay, firstReceipt, "same command returns its original receipt");
  assert.deepEqual(await stocks(), replayBefore);
  assert.deepEqual(await effects(first), { reports: 1, reservations: 1, packing: 1, logs: 1 });

  const tailored = await addTask("TAILORED", { orderType: "custom_print" });
  await rejectWithoutEffects(tailored, () => complete(tailored, "custom-wrong-stock", { inventoryItemId: firstStock.id }),
    "customer artwork cannot be reported into the generic blank SKU", "PRODUCTION_CUSTOM_SIZE_MUST_NOT_USE_STOCK_INVENTORY");
  for (const task of [tailored, await addTask("TAILORED-NO-STOCK", { orderType: "定制印刷", size: "42*35*10" })]) {
    const before = await stocks();
    const receipt = success(await complete(task, `direct-production-${task.taskId}`), "customer-printed order enters packing");
    assert.equal(receipt.orderLineStatus, "待打包");
    assert.deepEqual(await effects(task), { reports: 1, reservations: 0, packing: 1, logs: 1 });
    assert.deepEqual(await stocks(), before, "customer-printed bags never change common-goods inventory");
  }
  let changedPayload;
  try { changedPayload = await complete(first, "first-stock-customer-1", { qualifiedQty: 501 }); }
  catch (error) { changedPayload = { code: error.code || error.message }; }
  assert.ok(!changedPayload.response?.reportId, "same idempotency key with a different quantity must fail");
  assert.deepEqual(await stocks(), replayBefore);
  assert.ok(!(await complete(first, "first-stock-customer-different-key")).response?.reportId, "another key cannot complete the same task twice");

  const local = await addTask("LOCAL", { size: "29*32*14", qty: 18 });
  const localWorkspace = await readRepository.loadState();
  localWorkspace.productionPackingTransactionRepository = createLocalProductionPackingTransactionRepository();
  const localReceipt = success(await complete(local, "first-stock-local", {}, localWorkspace), "local repository first stock");
  const localStock = localWorkspace.inventories.find(row => row.id === localReceipt.inventoryItemId);
  assert.ok(localStock);
  assert.deepEqual([localStock.size, localStock.color, localStock.handle, localStock.style, localStock.zone, localStock.trustLevel],
    [local.size, "红色", "普通提", "空白袋", "未分区", "生产报工"]);
  assert.deepEqual([localStock.inStock, localStock.reserved, localStock.locked, localStock.pending], [18, 18, 0, 0]);
  assert.deepEqual(success(await complete(local, "first-stock-local", {}, localWorkspace), "local replay"), localReceipt);
  assert.equal(localWorkspace.inventories.filter(row => row.id === localReceipt.inventoryItemId).length, 1);
  assert.deepEqual([localStock.inStock, localStock.reserved, localStock.locked, localStock.pending], [18, 18, 0, 0]);
  assert.equal((await stockFor(local.size)).length, 0, "local repository test must not write PostgreSQL inventory");

  const replenishment = await addTask("REPLENISHMENT", { size: "35*41*12", qty: 120, method: "补库入库" });
  const replenishmentReceipt = success(await complete(replenishment, "first-stock-replenishment-1"), "replenishment first stock");
  assert.deepEqual(buckets((await stockFor(replenishment.size))[0]), [120, 0, 0, 0]);
  assert.equal(replenishmentReceipt.orderLineStatus, "已入库");
  assert.deepEqual(await effects(replenishment), { reports: 1, reservations: 0, packing: 0, logs: 1 });
  assert.equal(Number((await pool.query("SELECT count(*) FROM inventory_ledger_entries WHERE source_id=$1", [replenishmentReceipt.reportId])).rows[0].count), 1);

  const duplicate = await addTask("SAME-KEY", { size: "40*30*10", qty: 25 });
  const duplicateWorkspaces = await Promise.all([prepare(), prepare()]);
  const duplicateResults = await Promise.all(duplicateWorkspaces.map(workspace => complete(duplicate, "first-stock-concurrent-same-key", {}, workspace)));
  const duplicateReceipts = duplicateResults.map(result => success(result, "concurrent identical completion"));
  assert.deepEqual(duplicateReceipts[0], duplicateReceipts[1]);
  assert.equal((await stockFor(duplicate.size)).length, 1);
  assert.deepEqual(buckets((await stockFor(duplicate.size))[0]), [25, 25, 0, 0]);
  assert.deepEqual(await effects(duplicate), { reports: 1, reservations: 1, packing: 1, logs: 1 });

  // Both callers start without this SKU. One may lose the first-insert race,
  // but retrying that exact command from fresh state must add only its own lot.
  const contenders = await Promise.all([
    addTask("RACE-A", { size: "50*40*12", qty: 30 }),
    addTask("RACE-B", { size: "50*40*12", qty: 40 }),
  ]);
  const staleWorkspaces = await Promise.all([prepare(), prepare()]);
  const race = await Promise.allSettled(contenders.map((task, index) => complete(task, `first-stock-race-${index}`, {}, staleWorkspaces[index])));
  assert.ok(race.some(result => result.status === "fulfilled" && result.value.response?.reportId), "at least one first-insert contender must complete");
  for (let index = 0; index < race.length; index++) {
    if (race[index].status !== "fulfilled" || !race[index].value.response?.reportId) {
      const failure = race[index].status === "rejected" ? race[index].reason : race[index].value;
      assert.equal(failure.code, "BUSINESS_WRITE_CONFLICT", "pooled client maps the first-insert SQL guard to a business concurrency conflict");
      assert.equal(failure.statusCode, 409);
      success(await complete(contenders[index], `first-stock-race-${index}`), "fresh retry after first-insert conflict");
    }
  }
  assert.equal((await stockFor("50*40*12")).length, 1, "concurrent first lots share one stock identity");
  assert.deepEqual(buckets((await stockFor("50*40*12"))[0]), [70, 70, 0, 0]);
  for (const task of contenders) assert.deepEqual(await effects(task), { reports: 1, reservations: 1, packing: 1, logs: 1 });
  const raceLedger = (await pool.query("SELECT qty_before,qty_change,qty_after FROM inventory_ledger_entries WHERE inventory_item_id=$1 AND source_type='production_report' ORDER BY qty_before", [(await stockFor("50*40*12"))[0].id])).rows;
  assert.equal(raceLedger.length, 2);
  assert.equal(raceLedger[0].qty_before, 0);
  assert.equal(raceLedger[1].qty_before, raceLedger[0].qty_after, "ledger before/after values reflect the serialized stock balance");
  assert.equal(raceLedger[1].qty_after, 70);

  await pool.query(`INSERT INTO inventory_items(id,inventory_key,size,standard_color_id,handle_type,style,zone,inventory_state,on_hand_qty,reserved_qty,waiting_pickup_locked_qty,pending_handling_qty,trust_level)
    VALUES('INV-FIRST-FOUR','first-stock|four-buckets','25*32*10','SC-RED','普通提','空白袋','原库区','仓库已清点',100,30,12,7,'已清点')`);
  const existing = await addTask("FOUR-BUCKETS", { size: "25*32*10", qty: 20 });
  const existingReceipt = success(await complete(existing, "first-stock-existing-four"), "existing stock completion");
  assert.equal(existingReceipt.inventoryItemId, "INV-FIRST-FOUR");
  const existingStock = (await stockFor(existing.size))[0];
  assert.deepEqual(buckets(existingStock), [120, 50, 12, 7], "existing locked/pending buckets must not be cleared");
  assert.equal(existingStock.zone, "原库区");
  assert.equal(existingStock.trust_level, "已清点");

  const special = await addTask("SPECIAL", { size: "33*36*9", qty: 10, orderType: "custom_special" });
  const beforeSpecial = await stocks();
  success(await complete(special, "first-stock-special-1"), "custom size completion");
  assert.deepEqual(await stocks(), beforeSpecial, "custom sizes create no common-goods inventory");
  assert.deepEqual(await effects(special), { reports: 1, reservations: 0, packing: 1, logs: 1 });
  const silk = await addTask("SILK", { size: "45*37*10", qty: 15, orderType: "stock_printed", taskType: "丝印" });
  const silkReceipt = success(await complete(silk, "first-stock-silk-1", { machineCount: 15 }), "intermediate silk completion");
  assert.ok(silkReceipt.downstreamProductionTaskId);
  assert.deepEqual(await stocks(), beforeSpecial, "intermediate silk completion creates no finished goods");
  assert.deepEqual(await effects(silk), { reports: 1, reservations: 0, packing: 0, logs: 1 });

  const mismatched = await addTask("MISMATCH", { size: "35*27*10", qty: 8 });
  await rejectWithoutEffects(mismatched, () => complete(mismatched, "first-stock-wrong-explicit", { inventoryItemId: firstStock.id }), "explicit inventory belongs to another SKU", "PRODUCTION_INVENTORY_BINDING_MISMATCH");
  const missingExplicit = await addTask("MISSING-ID", { size: "35*27*10", qty: 8 });
  await rejectWithoutEffects(missingExplicit, () => complete(missingExplicit, "first-stock-missing-explicit", { inventoryItemId: "INV-FIRST-DOES-NOT-EXIST" }), "unknown explicit inventory must not silently create a replacement", "INVENTORY_ITEM_NOT_FOUND");
  const unknownColor = await addTask("UNKNOWN-COLOR", { size: "35*27*10", qty: 8, color: "未维护测试颜色" });
  await rejectWithoutEffects(unknownColor, () => complete(unknownColor, "first-stock-unknown-color"), "unmaintained color cannot create a standard color implicitly", "PRODUCTION_INVENTORY_COLOR_REQUIRED");
  await pool.query("INSERT INTO standard_colors(id,color_key,name,enabled) VALUES('SC-FIRST-DUPLICATE','first-duplicate-red','红色',true)");
  const ambiguousColor = await addTask("AMBIGUOUS-COLOR", { size: "35*27*10", qty: 8 });
  await rejectWithoutEffects(ambiguousColor, () => complete(ambiguousColor, "first-stock-ambiguous-color"), "duplicate active color names require explicit maintenance", "PRODUCTION_INVENTORY_COLOR_REQUIRED");
  await pool.query("DELETE FROM standard_colors WHERE id='SC-FIRST-DUPLICATE'");
  const incomplete = await addTask("INCOMPLETE", { size: "35*27*10", qty: 8, handle: "" });
  await rejectWithoutEffects(incomplete, () => complete(incomplete, "first-stock-incomplete-sku"), "incomplete stock identity", "PRODUCTION_INVENTORY_SPEC_REQUIRED");

  await pool.query(`INSERT INTO inventory_items(id,inventory_key,size,standard_color_id,handle_type,style,zone,inventory_state,on_hand_qty,trust_level)
    VALUES('INV-FIRST-OTHER-ZONE','first-stock|second-zone','30*37*10','SC-RED','普通提','空白袋','另一库位','可用',1,'生产报工')`);
  const ambiguousStock = await addTask("AMBIGUOUS-STOCK", { qty: 8 });
  await rejectWithoutEffects(ambiguousStock, () => complete(ambiguousStock, "first-stock-ambiguous-stock"), "multiple matching stock locations must not create a third item", "PRODUCTION_INVENTORY_SELECTION_REQUIRED");

  const stale = await addTask("STALE", { size: "40*32*10", qty: 11 });
  const staleWorkspace = await prepare();
  await pool.query("UPDATE order_lines SET revision=revision+1 WHERE id=$1", [stale.lineId]);
  await rejectWithoutEffects(stale, () => complete(stale, "first-stock-stale-order", {}, staleWorkspace), "stale order rolls back new inventory and all completion effects", "BUSINESS_WRITE_CONFLICT");

  const finalStocks = await stocks();
  assert.deepEqual(finalStocks.filter(row => originalStocks.some(original => original.id === row.id)), originalStocks, "unrelated existing stocks remain byte-for-byte unchanged");
  assert.deepEqual(await colors(), originalColors, "completion never creates or rewrites standard colors");
  console.log(`PASS first-stock PostgreSQL (${migrations.length} migrations): customer/replenishment first stock, exact replay and concurrent inserts, four buckets, cold reads, existing color identity, custom/silk exclusions, SKU binding and transaction rollback.`);
} finally {
  if (pool) await pool.end();
  spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
}
