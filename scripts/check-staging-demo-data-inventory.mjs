import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LIST_TABLES_SQL,
  buildFixturePredicate,
  buildInventorySql,
  formatInventory,
  summarizeInventory,
} from "./run-staging-demo-data-inventory.mjs";

// Predicate only targets fixture markers on id/biz_no and display-name columns.
const predicate = buildFixturePredicate(["id", "biz_no", "name", "amount", "phone"]);
assert.match(predicate, /"id"::text ILIKE '%-LIVE-%'/);
assert.match(predicate, /"biz_no"::text ILIKE '%-LIVE-%'/);
assert.match(predicate, /"name"::text ILIKE '%测试%'/);
assert.equal(predicate.includes('"amount"'), false);
assert.equal(predicate.includes('"phone"'), false);
assert.equal(buildFixturePredicate(["created_at"]), "FALSE");
assert.match(buildFixturePredicate(['we"ird']), /^FALSE$/);

// Tables without an id column are skipped; identifiers are quoted.
const sql = buildInventorySql([
  { schema: "public", name: "customers", columns: ["id", "biz_no", "name"] },
  { schema: "public", name: "no_id_table", columns: ["key", "value"] },
  { schema: "public", name: 'odd"name', columns: ["id"] },
]);
assert.match(sql, /"public"\."customers"/);
assert.equal(sql.includes("no_id_table"), false);
assert.match(sql, /"public"\."odd""name"/);
assert.match(sql, /LIMIT 5/);

// Read-only: the generated SQL never contains a write statement.
const source = readFileSync(new URL("./run-staging-demo-data-inventory.mjs", import.meta.url), "utf8");
for (const statement of [sql, LIST_TABLES_SQL]) {
  for (const keyword of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "DROP", "ALTER", "CREATE", "GRANT"]) {
    assert.equal(new RegExp(`\\b${keyword}\\b`, "i").test(statement), false, `inventory SQL must not contain ${keyword}`);
  }
}
assert.match(source, /READ ONLY/);
assert.match(source, /default_transaction_read_only=on/);

const report = summarizeInventory([
  { table: "customers", total: 12, fixtures: 3, sampleIds: ["C-LIVE-REPO", "CUST-LIVE-001", "CUST-LIVE-002"] },
  { table: "empty_table", total: 0, fixtures: 0, sampleIds: [] },
  { table: "orders", total: 40, fixtures: 0, sampleIds: [] },
]);
assert.equal(report.readOnly, true);
assert.equal(report.tablesWithRows, 2);
assert.equal(report.tablesWithFixtures, 1);
assert.equal(report.fixtureRows, 3);
assert.equal(report.tables[0].table, "customers");
assert.match(formatInventory(report), /疑似测试数据 3 行/);

console.log("staging demo data inventory check passed: read-only SQL, fixture markers, id-only samples, and summary.");
