// 负责人 2026-11-05：开单时新建客户，在跑完全部迁移的 PostgreSQL 上真实写入：客户、默认联系人、默认地址和操作日志；
// 新客户马上能搜到、能读地址；同名不重复建。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";
import { postgresLiveBusinessSeedSql } from "./helpers/postgresLiveBusinessSeed.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresMasterDataImportTransactionRepository } from "../server/masterDataImportTransactionRepository.mjs";
import { createPostgresCoreWorkspaceReadRepository } from "../server/coreWorkspaceReadRepository.mjs";
import { createCustomerAddressCommandService } from "../server/services/customerAddressCommandService.mjs";
import { customerDeliveryAddresses, customerWithAddresses } from "../shared/deliveryAddress.js";

const name = `erp-customer-create-${process.pid}-${Date.now()}`;
const docker = args => { const r = spawnSync("docker", args, { encoding: "utf8" }); if (r.status !== 0) throw Error(r.stderr || r.stdout); return r.stdout.trim(); };
let pool;
try {
  docker(["run", "--rm", "-d", "--name", name, "-p", "127.0.0.1::5432", "-e", "POSTGRES_DB=erp", "-e", "POSTGRES_USER=erp", "-e", "POSTGRES_PASSWORD=erp", "postgres:16-alpine"]);
  for (let i = 0; i < 60; i++) { if (spawnSync("docker", ["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "erp"]).status === 0) break; if (i === 59) throw Error("PG timeout"); await new Promise(r => setTimeout(r, 200)); }
  const port = Number(docker(["port", name, "5432/tcp"]).split(":").at(-1));
  pool = new pg.Pool({ host: "127.0.0.1", port, database: "erp", user: "erp", password: "erp", statement_timeout: 15000 });
  const migrations = loadMigrationFiles(); validateMigrationSet(migrations);
  for (const m of migrations) await pool.query(m.sql);
  await pool.query(postgresLiveBusinessSeedSql);
  const postgresClient = createPostgresPoolClient({ pool });
  const reader = createPostgresCoreWorkspaceReadRepository({ postgresClient });
  const repository = createPostgresMasterDataImportTransactionRepository({ postgresClient });
  let logSeq = 0;
  const service = createCustomerAddressCommandService({ buildOperationLog: (_workspace, log) => ({ id: `LOG-CUSTOMER-${++logSeq}`, ...log }) });
  const workspace = async () => ({ ...(await reader.loadState()), masterDataImportTransactionRepository: repository });
  const operator = (await pool.query("SELECT id FROM users ORDER BY id LIMIT 1")).rows[0]?.id ?? null;

  const made = await service.createCustomer({ workspace: await workspace(), body: { name: "张大姐", contactName: "张姐", phone: "13600000009", address: "宁晋县河渠镇大召村东头" }, operatorId: operator });
  assert.equal(made.statusCode, 201, JSON.stringify(made));
  const id = made.response.customer.customerId;
  const row = (await pool.query("SELECT name, short_name, settlement_cycle, enabled FROM customers WHERE id = $1", [id])).rows[0];
  assert.deepEqual(row, { name: "张大姐", short_name: "张大姐", settlement_cycle: "未设置", enabled: true });
  const contact = (await pool.query("SELECT contact_name, phone, is_default FROM customer_contacts WHERE customer_id = $1", [id])).rows;
  assert.deepEqual(contact, [{ contact_name: "张姐", phone: "13600000009", is_default: true }]);
  const log = (await pool.query("SELECT action, target_id FROM operation_logs WHERE target_type = 'customer' AND target_id = $1", [id])).rows;
  assert.deepEqual(log, [{ action: "create_customer", target_id: id }]);

  const after = await workspace();
  assert.deepEqual(service.searchCustomers({ workspace: after, query: "张大姐" }).response.items.map(item => [item.customerId, item.contactName, item.phone]), [[id, "张姐", "13600000009"]]);
  const addresses = customerDeliveryAddresses(customerWithAddresses(after, after.customers.find(item => item.id === id)));
  assert.deepEqual(addresses.map(item => [item.address, item.isDefault]), [["宁晋县河渠镇大召村东头", true]]);
  assert.equal(service.readCustomerProfile({ workspace: after, customerId: id }).response.profile.phone, "13600000009");

  const again = await service.createCustomer({ workspace: after, body: { name: "张大姐" }, operatorId: operator });
  assert.deepEqual([again.statusCode, again.response.customer.customerId], [409, id], "same name returns the existing customer");
  const nameOnly = await service.createCustomer({ workspace: after, body: { name: "李哥" }, operatorId: operator });
  assert.equal(nameOnly.statusCode, 201, JSON.stringify(nameOnly));
  assert.equal(Number((await pool.query("SELECT count(*) FROM customer_contacts WHERE customer_id = $1", [nameOnly.response.customer.customerId])).rows[0].count), 0);
  console.log(`PASS customer create PG (${migrations.length} migrations): customer, default contact and address, audit log; found right away; same name not created twice.`);
} finally {
  await pool?.end().catch(() => {});
  spawnSync("docker", ["rm", "-f", name]);
}
