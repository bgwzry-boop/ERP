import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresSilkScreenClaimRepository } from "../server/silkScreenTaskClaimRepository.mjs";

// P2-02 (owner 2026-11-04): two silk-screen printers press 领取 on the same task at the same moment.
// Reproduce it deterministically in a disposable PostgreSQL: a third session holds the task row,
// both claims queue up behind it, then the row is released. Exactly one claim may win.
// Dedicated disposable database. Never reads application credentials or env files.
const container = `erp-silk-claim-${randomUUID()}`;
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
CREATE TABLE machines (id TEXT PRIMARY KEY, machine_type TEXT NOT NULL, enabled BOOLEAN NOT NULL, status TEXT NOT NULL);
CREATE TABLE order_lines (id TEXT PRIMARY KEY, line_status TEXT, revision INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE production_tasks (id TEXT PRIMARY KEY, biz_no TEXT, order_line_id TEXT NOT NULL REFERENCES order_lines(id), task_type TEXT NOT NULL,
  machine_id TEXT, planned_qty INTEGER NOT NULL DEFAULT 0, task_status TEXT NOT NULL, published_schedule_id TEXT, revision INTEGER NOT NULL DEFAULT 1,
  created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE workshop_reports (id TEXT PRIMARY KEY, production_task_id TEXT REFERENCES production_tasks(id));
CREATE TABLE operation_logs (id TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT NOT NULL, action TEXT NOT NULL,
  before_json JSONB NOT NULL DEFAULT '{}'::jsonb, after_json JSONB NOT NULL DEFAULT '{}'::jsonb, reason TEXT,
  operator_id TEXT REFERENCES users(id), page_key TEXT, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE operation_idempotency_keys (scope TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, response_json JSONB NOT NULL,
  operator_id TEXT, target_type TEXT NOT NULL DEFAULT '', target_id TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(scope, idempotency_key));
INSERT INTO users VALUES ('U-P1'), ('U-P2');
INSERT INTO machines VALUES ('PRINT-01', 'screen_printing', true, 'active'), ('PRINT-02', 'screen_printing', true, 'active');
INSERT INTO order_lines (id, line_status) VALUES ('OL-1', '待排产');
INSERT INTO production_tasks (id, biz_no, order_line_id, task_type, machine_id, planned_qty, task_status, published_schedule_id)
  VALUES ('PT-1', 'PT-1', 'OL-1', '丝印', NULL, 1000, '待排产', NULL);`);
  await pool.query(readFileSync(new URL("../db/migrations/0060_silk_screen_task_claims.sql", import.meta.url), "utf8"));

  const repository = createPostgresSilkScreenClaimRepository({ idempotentTransactionJson: createPostgresPoolClient({ pool }).idempotentTransactionJson });
  const claim = (userId, machineId) => repository.claimSilkScreenTask({
    workspace: {},
    productionTask: { productionTaskId: "PT-1", orderLineId: "OL-1", taskType: "丝印", machineId, publishedScheduleId: `CLAIM-${machineId}-PT-1`,
      claimedByUserId: userId, claimedByName: userId, claimedAt: "2026-11-04T08:00:00.000Z", revision: 1 },
    operationLog: { id: `LOG-${userId}`, targetType: "production_task", targetId: "PT-1", action: "claim_silk_screen_task", operatorId: userId, before: null, after: null },
    idempotencyKey: `claim-${userId}-pt-1`,
    idempotencyPayload: { productionTaskId: "PT-1", operatorId: userId },
  });
  const blocker = await pool.connect();
  await blocker.query("BEGIN");
  await blocker.query("SELECT id FROM production_tasks WHERE id = 'PT-1' FOR UPDATE");
  const both = Promise.allSettled([claim("U-P1", "PRINT-01"), claim("U-P2", "PRINT-02")]);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await blocker.query("COMMIT");
  blocker.release();
  const results = await both;
  const winners = results.filter((result) => result.status === "fulfilled");
  assert.equal(winners.length, 1, JSON.stringify(results.map((result) => result.reason?.message ?? "ok")));
  const loser = results.find((result) => result.status === "rejected").reason;
  assert.equal(loser.statusCode, 409);
  assert.equal(loser.code, "BUSINESS_WRITE_CONFLICT");
  const row = (await pool.query("SELECT machine_id, claimed_by_user_id, task_status, revision FROM production_tasks WHERE id = 'PT-1'")).rows[0];
  const winner = winners[0].value.productionTask;
  assert.equal(row.claimed_by_user_id, winner.claimedByUserId);
  assert.equal(row.machine_id, winner.machineId);
  assert.deepEqual([row.task_status, row.revision], ["丝印已排产", 2]);
  assert.equal((await pool.query("SELECT line_status FROM order_lines WHERE id = 'OL-1'")).rows[0].line_status, "丝印已排产");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs")).rows[0].n, 1, "the losing claim leaves no log");

  // Release by the claimer returns it to the pool; a started task cannot be released.
  const release = (revision, key) => repository.releaseSilkScreenTask({
    workspace: {},
    productionTask: { productionTaskId: "PT-1", orderLineId: "OL-1", taskType: "丝印", revision },
    claimedByUserId: winner.claimedByUserId,
    operationLog: { id: `LOG-REL-${key}`, targetType: "production_task", targetId: "PT-1", action: "release_silk_screen_task", operatorId: winner.claimedByUserId, before: null, after: null },
    idempotencyKey: `release-${key}-pt-1`,
    idempotencyPayload: { productionTaskId: "PT-1", key },
  });
  await pool.query("INSERT INTO workshop_reports VALUES ('WR-1', 'PT-1')");
  await assert.rejects(release(2, "started"), (error) => error.statusCode === 409);
  await pool.query("DELETE FROM workshop_reports");
  const released = await release(2, "ok");
  assert.deepEqual([released.productionTask.taskStatus, released.productionTask.machineId, released.productionTask.claimedByUserId], ["待排产", "", ""]);
  assert.equal((await pool.query("SELECT line_status FROM order_lines WHERE id = 'OL-1'")).rows[0].line_status, "待排产");

  // The table itself refuses a claim on a non-silk-screen task.
  await pool.query("INSERT INTO order_lines (id, line_status) VALUES ('OL-2', '待排产')");
  await pool.query("INSERT INTO production_tasks (id, order_line_id, task_type, task_status) VALUES ('PT-2', 'OL-2', '制袋', '待排产')");
  await assert.rejects(pool.query("UPDATE production_tasks SET claimed_by_user_id = 'U-P1', claimed_at = now() WHERE id = 'PT-2'"), /production_tasks_claim_check/);
  console.log(`PASS concurrent silk-screen claim: one winner (${winner.claimedByUserId}), the other got 409; release returns the task to the pool.`);
} finally {
  await pool?.end().catch(() => {});
  if (started) { try { docker("rm", "-f", container); } catch { /* already gone */ } }
}
