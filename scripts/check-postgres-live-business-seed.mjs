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
assert.equal((postgresLiveBusinessSeedSql.match(/ON CONFLICT \(id\) DO UPDATE SET/g) ?? []).length, 14);
assert.throws(
  () => seedPostgresLiveBusinessRows(),
  /requires runPsql\(sql\)/,
);

console.log("PostgreSQL live business seed checks passed: stable SQL, idempotent fixture rows, and injected execution boundary are locked.");
