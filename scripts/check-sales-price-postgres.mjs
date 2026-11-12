// 负责人 2026-11-12「销售价格」在装好全部迁移的真实 PostgreSQL 上：建立 10-28 价目表、改价存新版本、
// 旧版本停用、两人同时改只成功一个、操作日志，以及开单读到的生效版本和确认时的价格源校验一致。
// 默认起一个一次性 docker 库；本地没有 docker 时可设 ERP_SALES_PRICE_PG_URL 指向一个空库。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresMasterDataImportTransactionRepository } from "../server/masterDataImportTransactionRepository.mjs";
import { createPostgresCoreWorkspaceReadRepository } from "../server/coreWorkspaceReadRepository.mjs";
import { readSalesPrices, saveSalesPriceVersion } from "../server/services/salesPriceService.mjs";
import { buildPublishedOrderPriceSourceGuard, getPublishedOrderPriceSource, resolvePublishedRow } from "../server/orderDraftPublishedPricing.mjs";
import { createPostgresParameterBinder } from "../server/postgresSqlParameters.mjs";
import { FACTORY_SALES_PRICE_LIST_20261028 as LIST } from "../shared/pricing/factorySalesPriceList.js";

const external = process.env.ERP_SALES_PRICE_PG_URL;
const name = `erp-sales-price-${process.pid}-${Date.now()}`;
const docker = (args) => { const r = spawnSync("docker", args, { encoding: "utf8" }); if (r.status !== 0) throw Error(r.stderr || r.stdout); return r.stdout.trim(); };
let pool;
try {
  if (external) {
    pool = new pg.Pool({ connectionString: external, statement_timeout: 15000 });
  } else {
    docker(["run", "--rm", "-d", "--name", name, "-p", "127.0.0.1::5432", "-e", "POSTGRES_DB=erp", "-e", "POSTGRES_USER=erp", "-e", "POSTGRES_PASSWORD=erp", "postgres:16-alpine"]);
    for (let i = 0; i < 60; i++) { if (spawnSync("docker", ["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "erp"]).status === 0) break; if (i === 59) throw Error("PG timeout"); await new Promise((r) => setTimeout(r, 200)); }
    const port = Number(docker(["port", name, "5432/tcp"]).split(":").at(-1));
    pool = new pg.Pool({ host: "127.0.0.1", port, database: "erp", user: "erp", password: "erp", statement_timeout: 15000 });
  }
  const migrations = loadMigrationFiles(); validateMigrationSet(migrations);
  for (const migration of migrations) await pool.query(migration.sql);
  await pool.query(`INSERT INTO users (id, login_name, display_name, department) VALUES ('U-MANAGER-A', 'manager.a', '管理A', 'management'), ('U-MANAGER-B', 'manager.b', '管理B', 'management') ON CONFLICT DO NOTHING`);
  const client = createPostgresPoolClient({ pool });
  const workspace = { masterDataImportTransactionRepository: createPostgresMasterDataImportTransactionRepository({ postgresClient: client }) };
  const body = (overrides = {}) => ({ items: LIST.items.map((item) => ({ ...item })), rules: structuredClone(LIST.rules), changeSummary: "按 2026-10-28 价目表建立", ...overrides });

  assert.equal((await readSalesPrices({ workspace })).salesPrices.current, null, "空库没有价格表");
  const first = await saveSalesPriceVersion({ workspace, operatorId: "U-MANAGER-A", body: body({ expectedCurrentId: "", idempotencyKey: "sales-price-pg-0001" }) });
  assert.equal(first.error, undefined, first.message);
  assert.deepEqual([first.salesPrices.current.versionNo, first.salesPrices.current.items.length, first.salesPrices.history[0].createdByName], [1, 33, "管理A"]);
  const firstId = first.salesPrices.current.id;
  const table = (await pool.query("SELECT biz_no, status, rules_json, change_summary FROM price_tables WHERE id = $1", [firstId])).rows[0];
  assert.deepEqual([table.biz_no, table.status, table.change_summary, table.rules_json.giftDiscount.minQty], ["SALES-PRICE-0001", "active", "按 2026-10-28 价目表建立", 1000]);
  const item = (await pool.query("SELECT label, category, bag_price::text AS price, sort_order FROM price_table_items WHERE price_table_id = $1 AND style_key = '空白袋' AND size_key = '30*37*10'", [firstId])).rows[0];
  assert.deepEqual([item.label, item.category, item.price, item.sort_order], ["裸布-竖中号", "regular", "0.4100", 2]);

  // 开单读到的就是这一版，确认时的价格源校验在库里也成立
  const state = await createPostgresCoreWorkspaceReadRepository({ postgresClient: client }).loadState();
  const source = getPublishedOrderPriceSource(state);
  assert.equal(source.priceTable.id, firstId);
  assert.equal(resolvePublishedRow(source, { id: "L1", orderType: "stock_plain", style: "空白袋", handle: "加长提60cm", qty: 500, size: "30*37*10" }).bagPrice, 0.54);
  const p = createPostgresParameterBinder();
  const guard = await pool.query(`WITH locked_order_price_tables AS (SELECT * FROM price_tables), locked_order_price_items AS (SELECT * FROM price_table_items)
    SELECT ${buildPublishedOrderPriceSourceGuard(source, p)} AS ok`, p.values);
  assert.equal(guard.rows[0].ok, true, "确认订单时的价格源校验要认这一版");

  // 两个人拿着同一版同时改，只能成功一个
  const editA = body({ expectedCurrentId: firstId, idempotencyKey: "sales-price-pg-a-0002", changeSummary: "A 改竖中号" });
  editA.items.find((row) => row.styleKey === "空白袋" && row.sizeKey === "30*37*10").bagPrice = "0.42";
  const editB = body({ expectedCurrentId: firstId, idempotencyKey: "sales-price-pg-b-0003", changeSummary: "B 改竖小号" });
  editB.items.find((row) => row.styleKey === "空白袋" && row.sizeKey === "25*32*10").bagPrice = "0.34";
  const results = await Promise.all([
    saveSalesPriceVersion({ workspace, operatorId: "U-MANAGER-A", body: editA }),
    saveSalesPriceVersion({ workspace, operatorId: "U-MANAGER-B", body: editB }),
  ]);
  assert.equal(results.filter((result) => !result.error).length, 1, JSON.stringify(results.map((result) => result.code ?? "ok")));
  assert.equal(results.filter((result) => result.code === "SALES_PRICE_CHANGED").length, 1);
  const tables = (await pool.query("SELECT id, version_no, status, effective_to FROM price_tables ORDER BY version_no")).rows;
  assert.deepEqual(tables.map((row) => [row.version_no, row.status]), [[1, "superseded"], [2, "active"]]);
  assert.ok(tables[0].effective_to, "旧版本写上停用时间");
  const winner = results.find((result) => !result.error);
  const log = (await pool.query("SELECT target_type, action, operator_id, reason, after_json FROM operation_logs WHERE action = 'save_sales_price_version' ORDER BY occurred_at DESC, id DESC LIMIT 1")).rows[0];
  assert.deepEqual([log.target_type, log.action, log.after_json.versionNo], ["price_table", "save_sales_price_version", 2]);
  assert.equal(log.reason, winner.salesPrices.history[0].changeSummary);
  assert.equal(log.after_json.changes.length, 1);
  const read = await readSalesPrices({ workspace });
  assert.equal(read.salesPrices.history.length, 2);
  assert.equal(read.salesPrices.history[0].changes.length, 1);
  const nextSource = getPublishedOrderPriceSource(await createPostgresCoreWorkspaceReadRepository({ postgresClient: client }).loadState());
  assert.equal(nextSource.priceTable.versionNo, 2, "改完立即对之后开的单生效");

  console.log(`PASS sales price PG (${migrations.length} migrations): 10-28 价目表建立、规则与品名入库、开单读到生效版本且确认校验一致、两人同时改只成功一个、旧版停用、操作日志。`);
} finally {
  if (pool) await pool.end();
  if (!external) spawnSync("docker", ["rm", "-f", name], { encoding: "utf8" });
}
