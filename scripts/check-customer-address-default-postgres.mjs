import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresMasterDataImportTransactionRepository } from "../server/masterDataImportTransactionRepository.mjs";

// Release review 2026-11-04: in an isolated PostgreSQL two people set different addresses of one
// customer as the default at the same moment, both saves succeeded and two defaults remained.
// Reproduce it deterministically: a third session holds both rows, both edits take their statement
// snapshot while waiting, then the rows are released. Only one default may be left.
// Dedicated disposable database. Never reads application credentials or env files.
const container = `erp-address-default-${randomUUID()}`;
const password = randomUUID();
let started = false;
let pool;
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
try {
  docker("run", "-d", "--rm", "--name", container, "-e", `POSTGRES_PASSWORD=${password}`, "-p", "127.0.0.1::5432", "postgres:16-alpine");
  started = true;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { docker("exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"); ready = true; break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  assert.ok(ready, "isolated PostgreSQL must become ready");
  const port = Number(docker("port", container, "5432/tcp").split(":").pop());
  pool = new pg.Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "postgres", max: 6 });
  await pool.query(`
CREATE FUNCTION erp_require(condition BOOLEAN, message TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN IF NOT condition THEN RAISE EXCEPTION '%', message USING ERRCODE = 'P0001'; END IF; RETURN TRUE; END; $$;
CREATE TABLE users (id TEXT PRIMARY KEY);
CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, short_name TEXT, settlement_cycle TEXT NOT NULL DEFAULT '未设置', updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE customer_contacts (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), contact_name TEXT, phone TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE customer_addresses (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), contact_id TEXT, address TEXT NOT NULL,
  area TEXT, default_fulfillment_method TEXT, is_default BOOLEAN NOT NULL DEFAULT false, remark TEXT,
  latitude NUMERIC(9, 6), longitude NUMERIC(9, 6), location_captured_at TIMESTAMPTZ, location_source TEXT, location_fulfillment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE operation_logs (id TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT NOT NULL, action TEXT NOT NULL,
  before_json JSONB NOT NULL DEFAULT '{}'::jsonb, after_json JSONB NOT NULL DEFAULT '{}'::jsonb, reason TEXT,
  operator_id TEXT REFERENCES users(id), page_key TEXT, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO users VALUES ('U-A'), ('U-B');
INSERT INTO customers (id, name) VALUES ('C1', '李记');
INSERT INTO customer_addresses (id, customer_id, address, is_default) VALUES ('A1', 'C1', '一厂', true), ('A2', 'C1', '二厂', false), ('A3', 'C1', '三厂', false);`);
  const repository = createPostgresMasterDataImportTransactionRepository({ postgresClient: createPostgresPoolClient({ pool }) });
  const setDefault = (addressId, address, operatorId) => repository.updateCustomerAddress({
    customerId: "C1", addressId, makeDefault: true, expected: { address, isDefault: false, located: false },
    operationLog: { id: `LOG-${addressId}`, before: null, after: { addressId }, reason: "设为默认地址", operatorId },
  });
  const blocker = await pool.connect();
  await blocker.query("BEGIN");
  await blocker.query("SELECT id FROM customer_addresses WHERE id IN ('A2', 'A3') FOR UPDATE");
  const both = Promise.allSettled([setDefault("A2", "二厂", "U-A"), setDefault("A3", "三厂", "U-B")]);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await blocker.query("COMMIT");
  blocker.release();
  const results = await both;
  assert.ok(results.some((result) => result.status === "fulfilled"), JSON.stringify(results.map((result) => result.reason?.message)));
  const defaults = (await pool.query("SELECT id FROM customer_addresses WHERE customer_id = 'C1' AND is_default ORDER BY id")).rows.map((row) => row.id);
  assert.equal(defaults.length, 1, `exactly one default address must remain, found ${defaults.join(", ")}`);
  console.log(`PASS concurrent default change: one default (${defaults[0]}) after two simultaneous edits of one customer's addresses.`);
} finally {
  await pool?.end().catch(() => {});
  if (started) { try { docker("rm", "-f", container); } catch { /* already gone */ } }
}
