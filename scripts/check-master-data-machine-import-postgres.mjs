import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createMasterDataImportExecution } from "../src/domain/masterDataImportExecution.js";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresMasterDataImportTransactionRepository } from "../server/masterDataImportTransactionRepository.mjs";
import { createPostgresMasterDataMachineConfigurationRepository } from "../server/masterDataMachineConfigurationRepository.mjs";

// Disposable database only: no application environment or saved credentials.
const container = `erp-machine-import-${randomUUID()}`;
const password = randomUUID();
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let started = false;
let pool;
let blocker;
try {
  docker("run", "-d", "--rm", "--name", container, "-e", `POSTGRES_PASSWORD=${password}`, "-p", "127.0.0.1::5432", "postgres:16-alpine");
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { docker("exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"); ready = true; break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  assert(ready, "isolated PostgreSQL must become ready");
  const port = Number(docker("port", container, "5432/tcp").split(":").pop());
  pool = new pg.Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "postgres", max: 5 });
  await pool.query(`
CREATE TABLE customers (id TEXT PRIMARY KEY, biz_no TEXT, name TEXT, short_name TEXT, settlement_cycle TEXT, risk_status TEXT,
  enabled BOOLEAN, created_by TEXT, updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE machines (id TEXT PRIMARY KEY, biz_no TEXT, name TEXT, machine_type TEXT, workshop TEXT, status TEXT,
  enabled BOOLEAN, settings_json JSONB, created_by TEXT, updated_by TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE employees (id TEXT PRIMARY KEY, biz_no TEXT, user_id TEXT, name TEXT, role_name TEXT, default_workshop TEXT,
  default_machine_id TEXT REFERENCES machines(id), birth_date DATE, hire_date DATE, payroll_position_key TEXT,
  base_hourly_wage NUMERIC, position_allowance_hourly NUMERIC, wage_effective_from DATE, attendance_provider TEXT,
  attendance_external_id TEXT, attendance_mapping_updated_by TEXT, attendance_mapping_updated_at TIMESTAMPTZ,
  account_enabled BOOLEAN, profile_status TEXT, requested_enabled BOOLEAN, remark TEXT, created_by TEXT, updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE employee_machine_assignments (id TEXT PRIMARY KEY, employee_id TEXT REFERENCES employees(id), machine_id TEXT REFERENCES machines(id),
  assignment_type TEXT, workshop TEXT, effective_from DATE, enabled BOOLEAN, created_by TEXT, updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE operation_logs (id TEXT PRIMARY KEY, target_type TEXT, target_id TEXT, action TEXT, before_json JSONB, after_json JSONB,
  reason TEXT, operator_id TEXT, page_key TEXT, occurred_at TIMESTAMPTZ, created_at TIMESTAMPTZ);`);

  const client = createPostgresPoolClient({ pool });
  const repository = createPostgresMasterDataImportTransactionRepository({ postgresClient: client });
  const machineRepository = createPostgresMasterDataMachineConfigurationRepository({ postgresClient: client });
  const confirmationPlan = {
    planId: "MDP-FICTITIOUS-CONCURRENT-MACHINE", status: "ready_for_import_confirmation",
    stagedRows: [
      { sheetKey: "customers", worksheetName: "客户档案", rows: [{ rowNumber: 3, values: { 客户编号: "C-FICTITIOUS", 客户名称: "虚构测试客户" } }] },
      { sheetKey: "employees_machines", worksheetName: "员工机台", rows: [{ rowNumber: 3, values: {
        员工编号: "EMP-FICTITIOUS", 员工姓名: "虚构测试人员", 角色: "车间报工", 默认车间: "1号车间", 默认机台: "1号机",
      } }] },
    ],
  };
  const execution = (machines) => createMasterDataImportExecution({
    confirmationPlan, configuredMachines: machines, officialImportEnabled: true, officialWriterKind: "postgres",
    requestedAt: "2026-11-15T08:00:00.000Z", requestedBy: "U-FICTITIOUS",
  });
  const operationLog = {
    id: "LOG-FICTITIOUS-IMPORT", targetType: "master_data_import_execution", targetId: confirmationPlan.planId,
    action: "master_data_import_execution_requested", operatorId: "U-FICTITIOUS",
  };
  const staleMachines = (await machineRepository.loadState()).machines;
  assert.deepEqual(staleMachines, []);
  const staleExecution = execution(staleMachines);
  assert.equal(staleExecution.importPayload.targetRecords.machines.length, 1);

  blocker = await pool.connect();
  await blocker.query("BEGIN");
  await blocker.query(`INSERT INTO machines (id, biz_no, name, machine_type, workshop, status, enabled, settings_json)
    VALUES ('BAG-01', 'BAG-01', '已维护切割设备', 'cutting', '1号车间', 'maintenance', false, '{"maintained":true}');`);
  const workspace = { machines: [], employees: [], operationLogs: [] };
  const before = structuredClone(workspace);
  const pending = repository.applyImportExecution({ workspace, importExecution: staleExecution, operationLog })
    .then((value) => ({ value }), (error) => ({ error }));
  let waiting = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = (await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'INSERT INTO machines%'" )).rows;
    if (rows.length) { waiting = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert(waiting, "the import must actually wait on the concurrent machine insert");
  await blocker.query("COMMIT");
  blocker.release();
  blocker = null;
  const result = await pending;
  assert.equal(result.error?.code, "23505", "concurrent duplicate machine must reject, never update");
  assert.deepEqual(workspace, before);
  for (const table of ["customers", "employees", "employee_machine_assignments", "operation_logs"]) {
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 0, `${table} must roll back with the machine conflict`);
  }
  const persistedBefore = (await pool.query("SELECT * FROM machines WHERE id = 'BAG-01'")).rows[0];
  assert.equal(persistedBefore.machine_type, "cutting");
  assert.deepEqual(persistedBefore.settings_json, { maintained: true });

  const refreshedMachines = (await machineRepository.loadState()).machines;
  const retry = execution(refreshedMachines);
  assert.deepEqual(retry.importPayload.targetRecords.machines, []);
  const committed = await repository.applyImportExecution({ workspace, importExecution: retry, operationLog });
  assert.equal(committed.importExecution.status, "committed");
  assert.deepEqual(workspace.machines, [], "fresh machine directory is not written back over the shared cache");
  assert.deepEqual((await pool.query("SELECT * FROM machines WHERE id = 'BAG-01'")).rows[0], persistedBefore);
  assert.equal((await pool.query("SELECT default_machine_id FROM employees WHERE id = 'EMP-FICTITIOUS'")).rows[0].default_machine_id, "BAG-01");
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM operation_logs")).rows[0].count, 1);
  console.log("PASS machine import PostgreSQL: concurrent creation rejects and rolls back the entire batch; fresh-directory retry binds without overwriting maintained data.");
} finally {
  if (blocker) { await blocker.query("ROLLBACK").catch(() => {}); blocker.release(); }
  await pool?.end().catch(() => {});
  if (started) { try { docker("rm", "-f", container); } catch { /* already removed */ } }
}
