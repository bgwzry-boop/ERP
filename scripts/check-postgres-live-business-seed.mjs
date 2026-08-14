import assert from "node:assert/strict";
import {
  postgresLiveBusinessSeedSql,
  seedPostgresLiveBusinessRows,
} from "./helpers/postgresLiveBusinessSeed.mjs";

const executions = [];
const result = seedPostgresLiveBusinessRows({
  runPsql(sql) {
    executions.push(sql);
    return "seeded";
  },
});

assert.equal(result, "seeded");
assert.deepEqual(executions, [postgresLiveBusinessSeedSql]);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO users \(id, login_name, display_name, department\)/);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO employees \(id, biz_no, name, role_name\)/);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO business_decision_authorizations/);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO machines/);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO print_templates/);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO customers/);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO inventory_items/);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO order_drafts/);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO original_orders/);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO order_lines/);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO fulfillment_records/);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO driver_delivery_dispatches/);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO packages/);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO statements/);
assert.match(postgresLiveBusinessSeedSql, /INSERT INTO statement_lines/);
const insertedTableCount = (postgresLiveBusinessSeedSql.match(/^INSERT INTO /gm) ?? []).length;
assert.equal(insertedTableCount, 17);
assert.equal(
  (postgresLiveBusinessSeedSql.match(/^ON CONFLICT \(id\) DO UPDATE SET/gm) ?? []).length,
  insertedTableCount,
  "every live business fixture table must keep an idempotent primary-key upsert",
);
assert.throws(
  () => seedPostgresLiveBusinessRows(),
  /requires runPsql\(sql\)/,
);

console.log("PostgreSQL live business seed checks passed: stable SQL, idempotent fixture rows, and injected execution boundary are locked.");
