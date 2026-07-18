import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../db/migrations/0025_business_decisions_and_ab_concurrency.sql", import.meta.url), "utf8");

assert.match(sql, /CREATE TABLE IF NOT EXISTS business_decision_records/i);
assert.match(sql, /CREATE TABLE IF NOT EXISTS business_decision_authorizations/i);
assert.match(sql, /supersedes_decision_id/i);
assert.match(sql, /status\s+TEXT\s+NOT NULL\s+DEFAULT\s+'active'/i);
assert.doesNotMatch(sql, /INSERT\s+INTO\s+business_decision_records\s*[\s\S]{0,200}\bSELECT\b/i, "migration must not fabricate decision makers for historical rows");
assert.doesNotMatch(sql, /DROP\s+TABLE/i, "incremental migration must not drop existing business tables");

console.log("Business-decision history migration check passed: immutable supersession is available and historical rows are not assigned fabricated decision evidence.");
