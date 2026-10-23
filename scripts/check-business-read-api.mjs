import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { createRuntimeSession } from "../server/authSeed.mjs";
import { listenTestServer, closeTestServer, getTestServerBaseUrl, requestJson } from "./helpers/apiIntegrationTestHarness.mjs";

const storage = mkdtempSync(join(tmpdir(), "erp-business-read-"));
const priorStorage = process.env.ERP_LOCAL_STORAGE_DIR;
process.env.ERP_LOCAL_STORAGE_DIR = storage;
const authSecret = "isolated-business-read-regression-secret";
const users = ["office", "driver", "workshop", "packing", "finance"].map((role) => ({ userId: `TEST-${role}`, loginName: role, displayName: role, roles: [role], defaultRole: role, enabled: true, loginEnabled: true, passwordHash: "fixture", passwordStatus: "active", sessionVersion: 1, defaultMachineId: role === "workshop" ? "BAG-01" : "" }));
users.push(
  {...users.find(user => user.defaultRole === "finance"), userId: "TEST-finance-no-statements", loginName: "finance-no-statements", permissionDenylist: ["statement.preview"]},
  {...users.find(user => user.defaultRole === "finance"), userId: "TEST-finance-no-payroll", loginName: "finance-no-payroll", permissionDenylist: ["payroll.preview"]},
  {...users[0], userId: "TEST-office-readonly", loginName: "office-readonly", permissionDenylist: ["production.schedule.publish", "production.report.complete", "packing.complete", "todo.handle", "fulfillment.print", "fulfillment.dispatch.update", "fulfillment.complete"]},
  {...users[0], userId: "TEST-office-denied-reads", loginName: "office-denied-reads", permissionDenylist: ["production.read", "packing.read", "todo.read", "fulfillment.read", "print.read"]},
);
const server = createApiServer({ applyProductionEnvFile: false, runtimeMode: "test", strictAuth: true, authSecret, runtimeIdentityRepository: { kind: "test_memory", loadState: async () => ({ users, revokedSeedSessions: [] }), saveState: async () => ({}) } });
try {
  await listenTestServer(server);
  const base = getTestServerBaseUrl(server);
  const read = (path, role) => requestJson(base, path, { headers: role ? { authorization: `Bearer ${createRuntimeSession(`TEST-${role}`, { authSecret, sessionVersion: 1 }).accessToken}` } : {} });
  assert.equal((await read("/api/order-lines")).status, 401);
  for (const path of ["order-lines", "order-drafts", "production-tasks", "packing-tasks", "inventory/items", "statements", "fulfillments", "todos", "raw-material-inbounds", "operation-logs", "system/status", "office/workspace"]) {
    const response = await read(`/api/${path}`, "driver");
    assert.equal(response.status, 403, path);
    assert.equal(response.body.code, "PERMISSION_DENIED", path);
  }
  for (const [role, path] of [["office", "order-lines"], ["office", "packing-tasks"], ["finance", "statements/customers"], ["workshop", "production-tasks"], ["packing", "packing-tasks"]]) {
    const response = await read(`/api/${path}`, role);
    assert.equal(response.status, 200, `${role}:${path}:${JSON.stringify(response.body)}`);
  }
  assert.equal((await read("/api/packing-tasks", "workshop")).status, 403);
  assert.equal((await read("/api/production-tasks", "packing")).status, 403);
  for (const path of ["production-tasks", "production-schedules/machine-queue", "packing-tasks", "todos", "fulfillments", "print-jobs", "print-devices"]) {
    assert.equal((await read(`/api/${path}`, "office-readonly")).status, 200, `Read-only office: ${path}`);
  }
  for (const path of ["production-tasks", "packing-tasks", "todos", "fulfillments", "print-jobs", "print-devices"]) {
    assert.equal((await read(`/api/${path}`, "office-denied-reads")).status, 403, `Explicit denied read: ${path}`);
  }
  for (const path of ["production-tasks/TEST/publish-schedule", "production-tasks/TEST/report-complete", "packing-tasks/TEST/complete", "todos/TEST/handle", "fulfillments/TEST/dispatch", "fulfillments/TEST/print", "fulfillments/TEST/complete"]) {
    const denied = await requestJson(base, `/api/${path}`, {method: "POST", headers: {"content-type": "application/json", authorization: `Bearer ${createRuntimeSession("TEST-office-readonly", {authSecret, sessionVersion: 1}).accessToken}`}, body: "{}"});
    assert.equal(denied.status, 403, `Read-only writes must be denied: ${path}`);
    assert.equal(denied.body.code, "PERMISSION_DENIED");
  }
  assert.equal((await read("/api/payroll/workbench", "office")).status, 403, "Ordinary office cannot read factory payroll");
  assert.equal((await read("/api/payroll/workbench", "finance")).status, 200, "Finance retains payroll preview");
  assert.equal((await read("/api/payroll/workbench", "finance-no-statements")).status, 200);
  assert.equal((await read("/api/payroll/workbench", "finance-no-payroll")).status, 403);
  console.log("business read HTTP checks passed: signed runtime roles, anonymous rejection, denied cross-role routes and permitted operational reads");
} finally {
  await closeTestServer(server);
  rmSync(storage, { recursive: true, force: true });
  if (priorStorage === undefined) delete process.env.ERP_LOCAL_STORAGE_DIR;
  else process.env.ERP_LOCAL_STORAGE_DIR = priorStorage;
}
