// 负责人 2026-11-08「通货先下补库订单，做好入库，客户要货再出库」在装好全部迁移的真实 PostgreSQL 上：
// 补库单挂在「本厂补库」名下，金额 0、不进对账；确认后只排生产，不建发货、不占现货；
// 制袋做好直接加到本厂库存，不锁给任何客户、不建打包任务，订单到「已入库」结束。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";
import { postgresLiveBusinessSeedSql } from "./helpers/postgresLiveBusinessSeed.mjs";
import { buildPriceSourceWorkspace } from "./check-order-confirmation-price-source.mjs";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";
import { createPostgresOrderDraftRepository } from "../server/orderDraftRepository.mjs";
import { createPostgresOrderConfirmationTransactionRepository } from "../server/orderConfirmationTransactionRepository.mjs";
import { createPostgresProductionPackingTransactionRepository } from "../server/productionPackingTransactionRepository.mjs";
import { createPostgresCoreWorkspaceReadRepository } from "../server/coreWorkspaceReadRepository.mjs";
import { closeSharedPostgresPools } from "../server/postgresPoolClient.mjs";
import { REPLENISHMENT_CUSTOMER_ID, REPLENISHMENT_FULFILLMENT } from "../shared/orderRouting.js";

const container = `erp-replenish-${process.pid}-${Date.now()}`;
const docker = (args) => { const r = spawnSync("docker", args, { encoding: "utf8" }); if (r.status !== 0) throw Error(r.stderr || r.stdout); return r.stdout.trim(); };
let pool;
try {
  docker(["run", "--rm", "-d", "--name", container, "-p", "127.0.0.1::5432", "-e", "POSTGRES_DB=erp", "-e", "POSTGRES_USER=erp", "-e", "POSTGRES_PASSWORD=erp", "postgres:16-alpine"]);
  for (let i = 0; i < 60; i++) { if (spawnSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "erp"]).status === 0) break; if (i === 59) throw Error("PG timeout"); await new Promise((r) => setTimeout(r, 250)); }
  const port = Number(docker(["port", container, "5432/tcp"]).split(":").at(-1));
  const databaseUrl = `postgres://erp:erp@127.0.0.1:${port}/erp`;
  pool = new pg.Pool({ connectionString: databaseUrl });
  const migrations = loadMigrationFiles(); validateMigrationSet(migrations);
  for (const migration of migrations) await pool.query(migration.sql);
  await pool.query(postgresLiveBusinessSeedSql);
  const internal = (await pool.query("SELECT name, settlement_cycle FROM customers WHERE id = $1", [REPLENISHMENT_CUSTOMER_ID])).rows[0];
  assert.deepEqual(internal, { name: "本厂补库", settlement_cycle: "不结算" }, "迁移建好「本厂补库」");
  await pool.query(`
    INSERT INTO users(id, login_name, display_name) VALUES ('U-PRICE', 'replenish.test', '合成补库核对');
    INSERT INTO inventory_items (id, inventory_key, size, standard_color_id, handle_type, style, zone, inventory_state, on_hand_qty, reserved_qty, waiting_pickup_locked_qty, pending_handling_qty, trust_level)
    VALUES ('INV-RP-1', 'rp|33*40*10|红色|普通提|空白袋', '33*40*10', 'SC-RED', '普通提', '空白袋', 'RP区', '仓库已清点', 200, 50, 0, 0, '已清点');
    INSERT INTO machines (id, biz_no, name, machine_type, workshop, status, enabled) VALUES ('RP-BAG', 'RP-BAG', '补库制袋机', 'bag_making', '测试', 'active', true) ON CONFLICT DO NOTHING;`);
  const stock = async () => (await pool.query("SELECT on_hand_qty, reserved_qty FROM inventory_items WHERE id = 'INV-RP-1'")).rows[0];

  const workspace = buildPriceSourceWorkspace({ size: "33*40*10", orderType: "stock" });
  const draft = workspace.orderDrafts[0];
  draft.customerId = REPLENISHMENT_CUSTOMER_ID;
  draft.lines = draft.lines.map((line) => ({ ...line, customerId: REPLENISHMENT_CUSTOMER_ID, customer: "本厂补库", fulfillment: REPLENISHMENT_FULFILLMENT, fulfillmentMethod: REPLENISHMENT_FULFILLMENT }));
  workspace.customers = [{ id: REPLENISHMENT_CUSTOMER_ID, name: "本厂补库" }];
  const core = createPostgresCoreWorkspaceReadRepository({ databaseUrl });
  workspace.coreWorkspaceReadRepository = core;
  workspace.inventories = (await core.loadState()).inventories ?? [];
  assert.ok(workspace.inventories.some((item) => item.id === "INV-RP-1"), "现货读得到");
  workspace.orderDraftRepository = createPostgresOrderDraftRepository({ databaseUrl });
  workspace.orderConfirmationTransactionRepository = createPostgresOrderConfirmationTransactionRepository({ databaseUrl });
  const saved = await workspace.orderDraftRepository.saveOrderDraft({ workspace, draft: { ...draft, createdBy: "U-PRICE" }, expectedRevision: 0, idempotencyKey: "rp-draft", operationLog: { id: "LOG-RP-DRAFT", targetType: "order_draft", targetId: "D-PRICE", action: "save_order_draft", operatorId: "U-PRICE" } });

  // 1) 确认补库单：金额 0，只排生产，不建发货、不占现货
  const service = createApiSharedServiceRegistry().orderDraftCommandService;
  const confirmed = await service.confirmOrderDraft({ workspace, draftId: "D-PRICE", operatorId: "U-PRICE", body: { expectedRevision: saved.draft.revision, idempotencyKey: "rp-confirm", lines: saved.draft.lines } });
  assert.ok(confirmed.response, JSON.stringify(confirmed));
  const lineId = confirmed.response.orderLines[0].id;
  const price = (await pool.query("SELECT final_amount, source_evidence_json FROM price_snapshots WHERE order_line_id = $1", [lineId])).rows[0];
  assert.equal(Number(price.final_amount), 0, "补库单不计钱");
  assert.equal(price.source_evidence_json.kind, "internal_replenishment");
  const line = (await pool.query("SELECT customer_id, fulfillment_method FROM order_lines WHERE id = $1", [lineId])).rows[0];
  assert.deepEqual(line, { customer_id: REPLENISHMENT_CUSTOMER_ID, fulfillment_method: REPLENISHMENT_FULFILLMENT });
  assert.equal((await pool.query("SELECT count(*)::int n FROM fulfillment_records WHERE order_line_id = $1", [lineId])).rows[0].n, 0, "补库单没有发货任务");
  assert.equal((await pool.query("SELECT count(*)::int n FROM inventory_reservations WHERE order_line_id = $1", [lineId])).rows[0].n, 0, "补库单不占现货");
  assert.equal((await pool.query("SELECT count(*)::int n FROM production_tasks WHERE order_line_id = $1", [lineId])).rows[0].n, 1, "补库单排进生产");
  assert.deepEqual(await stock(), { on_hand_qty: 200, reserved_qty: 50 });

  // 2) 制袋做好：加到本厂库存，不锁给客户、不建打包任务，订单「已入库」
  const task = workspace.productionTasks.find((row) => row.orderLineId === lineId);
  assert.ok(task, "工作区里有生产任务");
  await pool.query("UPDATE production_tasks SET task_status = '制袋中', task_type = '制袋', machine_id = 'RP-BAG' WHERE id = $1", [task.productionTaskId ?? task.id]);
  Object.assign(task, { machineId: "RP-BAG", taskStatus: "制袋中", status: "制袋中", taskType: "制袋" });
  workspace.productionPackingTransactionRepository = createPostgresProductionPackingTransactionRepository({ databaseUrl });
  const production = createApiSharedServiceRegistry().productionReportingCommandService;
  const done = await production.completeProductionReport({ workspace, productionTaskId: task.productionTaskId ?? task.id, operatorId: "U-PRICE", body: { qualifiedQty: 100, idempotencyKey: "rp-complete" } });
  assert.ok(done.response, JSON.stringify(done));
  assert.deepEqual(await stock(), { on_hand_qty: 300, reserved_qty: 50 }, "做好的 100 个进库存，占用不变");
  assert.equal((await pool.query("SELECT line_status FROM order_lines WHERE id = $1", [lineId])).rows[0].line_status, "已入库");
  assert.equal((await pool.query("SELECT count(*)::int n FROM packing_tasks WHERE order_line_id = $1", [lineId])).rows[0].n, 0, "补库不建打包任务");
  assert.equal((await pool.query("SELECT count(*)::int n FROM inventory_reservations WHERE order_line_id = $1", [lineId])).rows[0].n, 0, "补库不锁给客户");
  assert.equal((await pool.query("SELECT count(*)::int n FROM fulfillment_records WHERE order_line_id = $1", [lineId])).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM statement_lines WHERE order_line_id = $1", [lineId])).rows[0].n, 0, "补库不进对账单");
  const ledgers = (await pool.query("SELECT reason FROM inventory_ledger_entries WHERE inventory_item_id = 'INV-RP-1' ORDER BY created_at")).rows.map((row) => row.reason);
  assert.ok(ledgers.some((reason) => reason.includes("补库生产入库")), JSON.stringify(ledgers));
  assert.ok(!ledgers.some((reason) => reason.includes("锁定给订单")), JSON.stringify(ledgers));

  // 3) 重复提交不再加库存
  const replay = await production.completeProductionReport({ workspace, productionTaskId: task.productionTaskId ?? task.id, operatorId: "U-PRICE", body: { qualifiedQty: 100, idempotencyKey: "rp-complete" } });
  assert.ok(replay.response || replay.error, JSON.stringify(replay));
  assert.deepEqual(await stock(), { on_hand_qty: 300, reserved_qty: 50 }, "重复提交不重复入库");
  console.log("check-stock-replenishment-postgres passed");
} finally {
  await pool?.end().catch(() => {});
  await closeSharedPostgresPools?.().catch?.(() => {});
  spawnSync("docker", ["rm", "-f", container]);
}
