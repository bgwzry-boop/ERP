import assert from "node:assert/strict";
import pg from "pg";
import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresProductionPackingTransactionRepository } from "../server/productionPackingTransactionRepository.mjs";
import { getPackageGroupContext, replacePackageGroup } from "../server/services/packageGroupService.mjs";

const runtime = await startLivePostgres();
let pool;
try {
  pool = new pg.Pool({ connectionString: runtime.resolveLiveDatabaseUrl(), statement_timeout: 15000 });
  const query = async (sql, values = []) => (await pool.query(sql, values)).rows;
  const postgres = createPostgresPoolClient({ pool });
  const repo = createPostgresProductionPackingTransactionRepository({ postgresClient: postgres });
  const inventoryId = "25*32*10-白色-加长提-空白袋-B区-服装";
  async function seed(id, type) {
    await query(`INSERT INTO order_lines(id,biz_no,order_id,customer_id,product_name,order_type,size,bag_color,handle_type,style,original_qty,fulfillment_method,line_status)
      VALUES($1,$1,'ORD-0629-002','C002','空白袋',$2,'25*32*10','白色','加长提','空白袋',100,'送货','待出库')`, [`LINE-COR-${id}`, type]);
    await query(`INSERT INTO fulfillment_records(id,biz_no,order_line_id,customer_id,method,expected_qty,actual_qty,status,stock_deducted_at)
      VALUES($1,$1,$2,'C002','送货',100,100,'待出库',now())`, [`F-COR-${id}`, `LINE-COR-${id}`]);
    await query(`INSERT INTO packing_tasks(id,biz_no,order_line_id,planned_qty,actual_packed_qty,status)
      VALUES($1,$1,$2,100,100,'已完成')`, [`T-COR-${id}`, `LINE-COR-${id}`]);
    await query(`INSERT INTO packages(id,biz_no,order_line_id,fulfillment_id,packed_qty,status)
      VALUES($1,$1,$2,$3,100,'待打印标签')`, [`P-COR-${id}`, `LINE-COR-${id}`, `F-COR-${id}`]);
  }
  async function deduct(id) {
    const [{ on_hand_qty: before }] = await query("SELECT on_hand_qty FROM inventory_items WHERE id=$1", [inventoryId]);
    await query("UPDATE inventory_items SET on_hand_qty=on_hand_qty-100,revision=revision+1 WHERE id=$1", [inventoryId]);
    await query(`INSERT INTO inventory_ledger_entries(id,inventory_item_id,change_type,qty_before,qty_change,qty_after,source_type,source_id)
      VALUES($1,$2,'打单扣减',$3::int,-100,$3::int-100,'fulfillment_note_print',$4)`,
    [`LED-COR-${id}`,inventoryId,before,`F-COR-${id}`]);
  }
  async function request(id, qty, key, repository = repo) {
    const fulfillmentId = `F-COR-${id}`;
    const workspace = { productionPackingTransactionRepository: repository };
    await repository.refreshPackageGroupWorkspace({ workspace });
    const context = getPackageGroupContext(workspace, { fulfillmentId });
    assert.ok(context.lines.some(line => line.fulfillmentId === fulfillmentId));
    return replacePackageGroup({
      workspace, fulfillmentId, operatorId: "U-OFFICE-A",
      body: {
        fulfillmentIds: [fulfillmentId], snapshotToken: context.snapshotToken, idempotencyKey: key,
        physicalContentsConfirmed: true, reason: "隔离验收，核对当前实物",
        packages: [{ confirmed: true, items: [{ orderLineId: `LINE-COR-${id}`, fulfillmentId, packedQty: qty }] }],
      },
    });
  }

  await seed("STOCK", "现货通货");
  await deduct("STOCK");
  await assert.rejects(request("STOCK", 90, "repack-stock-unsafe"), { code: "PACKING_GROUP_STOCK_ADJUSTMENT_REQUIRED" });
  assert.deepEqual(await query("SELECT status,revision FROM packages WHERE id='P-COR-STOCK'"), [{ status: "待打印标签",revision:1 }]);
  const same = await request("STOCK", 100, "repack-stock-same");
  assert.equal(same.packages[0].packedQty, 100);
  assert.deepEqual(await query("SELECT status FROM packages WHERE id='P-COR-STOCK'"), [{ status: "已失效" }]);
  assert.equal((await query("SELECT -sum(qty_change)::int AS net FROM inventory_ledger_entries WHERE source_id='F-COR-STOCK'"))[0].net,100);

  await seed("CUSTOM", "定制印刷");
  const custom = await request("CUSTOM", 90, "repack-custom-no-stock");
  assert.equal(custom.packages[0].packedQty, 90, "未实际扣库的独立定制可更正，不要求混装同意");
  assert.equal(custom.packages[0].contents.length, 1);
  assert.equal(custom.quantityDifferences[0].actualQty,90);
  assert.deepEqual(await query("SELECT status FROM packages WHERE id='P-COR-CUSTOM'"), [{ status: "已失效" }]);
  assert.ok(!custom.packageIds.includes("P-COR-CUSTOM"));

  await seed("RACE", "现货通货");
  let arrived = false;
  const raceRepo = createPostgresProductionPackingTransactionRepository({
    queryJson: postgres.queryJson,
    idempotentTransactionJson: async input => {
      arrived = true;
      await deduct("RACE"); // 业务读取后才出现已扣库存事实；不改变包裹或订单版本。
      return postgres.idempotentTransactionJson(input);
    },
  });
  await assert.rejects(request("RACE",90,"repack-race",raceRepo), { statusCode: 409 });
  assert.equal(arrived,true,"测试应达到数据库更正边界");
  assert.deepEqual(await query("SELECT status,revision FROM packages WHERE id='P-COR-RACE'"), [{ status: "待打印标签",revision:1 }]);
  assert.equal((await query("SELECT count(*)::int AS n FROM operation_idempotency_keys WHERE idempotency_key='repack-race'"))[0].n,0);
  console.log("PASS package correction with real PostgreSQL: single custom without consent, old code invalidation, identical quantity allowed after stock deduction, quantity change stopped both on fresh read and at commit.");
} finally {
  await pool?.end();
  await stopLivePostgres(runtime);
}
