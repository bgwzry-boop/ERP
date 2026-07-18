import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";

import { getEffectivePermissionsForUser } from "../server/authSeed.mjs";
import { createApiServer } from "../server/apiServer.mjs";
import {
  getV1RuntimeEmployeeRoleInputLabels,
  normalizeV1RuntimeEmployeeRoleKey,
  normalizeV1RuntimeEmployeeRoleKeys,
  roleCatalog,
  systemV1ActionPermissions,
  v1RuntimeEmployeeRoleKeys,
} from "../shared/auth/roleCatalog.js";
import { getSeedPermissionContext, seedUserOptions } from "../src/auth/seedPermissions.js";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "role-catalog");
rmSync(storageRoot, { recursive: true, force: true });

for (const user of seedUserOptions) {
  const frontend = getSeedPermissionContext(user.userId);
  const server = getEffectivePermissionsForUser(user.userId);
  assert.deepEqual(frontend.roles, server.roles, `${user.userId} role projection drifted`);
  assert.deepEqual(frontend.buttonPermissions, server.buttonPermissions, `${user.userId} button permissions drifted`);
  assert.deepEqual(frontend.actionPermissions, server.actionPermissions, `${user.userId} action permissions drifted`);
}

const office = getEffectivePermissionsForUser("U-OFFICE-A");
const officeBackup = getEffectivePermissionsForUser("U-OFFICE-B");
const manager = getEffectivePermissionsForUser("U-MANAGER-A");
const warehouse = getEffectivePermissionsForUser("U-WAREHOUSE-A");
const technical = getEffectivePermissionsForUser("U-TECH-A");
const printWorkshop = getEffectivePermissionsForUser("U-WORKSHOP-PRINT-A");
const decisionPrimary = getEffectivePermissionsForUser("U-DECISION-MOTHER");
const decisionBackup = getEffectivePermissionsForUser("U-DECISION-AUNT");
const maintenance = getEffectivePermissionsForUser("U-MAINTENANCE-A");
assert.deepEqual(printWorkshop.roles, ["workshop"]);
assert.equal(printWorkshop.user.defaultMachineId, "PRINT-01");
assert.deepEqual(printWorkshop.actionPermissions, roleCatalog.workshop.actionPermissions);
assert.equal(printWorkshop.actionPermissions.includes("raw_material.issue.create"), true, "printing/workshop workers must be able to scan a raw-material roll");
assert.equal(decisionPrimary.user.decisionAuthority, "primary");
assert.equal(decisionBackup.user.decisionAuthority, "backup");
assert.equal(decisionPrimary.actionPermissions.includes("business_decision.act_directly"), true);
assert.equal(decisionPrimary.actionPermissions.includes("major_exception.direct"), true);
assert.equal(decisionBackup.actionPermissions.includes("major_exception.direct"), false);
assert.deepEqual(maintenance.roles, ["maintenance"]);
assert.equal(maintenance.actionPermissions.includes("maintenance.task.create"), true);
assert.equal(maintenance.actionPermissions.includes("maintenance.task.update"), true);
assert.equal(office.actionPermissions.includes("maintenance.task.read"), true);
assert.equal(office.actionPermissions.includes("maintenance.task.create"), true);
assert.equal(office.actionPermissions.includes("maintenance.task.update"), false);
assert.equal(technical.actionPermissions.includes("maintenance.task.update"), false, "platform operations must stay separate from onsite maintenance");
assert.equal(warehouse.actionPermissions.includes("fulfillment.warehouse.execute"), true, "finished-goods warehouse must be able to record paper-gated physical outbound results");
assert.equal(office.actionPermissions.some((permission) => permission.startsWith("system.v1_")), false);
assert.deepEqual(officeBackup.roles, office.roles, "office A/B must retain the same role set");
assert.deepEqual(officeBackup.buttonPermissions, office.buttonPermissions, "office A/B must retain the same button permissions");
assert.deepEqual(officeBackup.actionPermissions, office.actionPermissions, "office A/B must retain the same action permissions");
for (const permission of [
  "order.priority.record_delegated",
  "production.schedule.record_delegated",
  "raw_material.purchase.record_delegated",
  "fulfillment.quantity_variance.record_delegated",
  "statement.variance.record_delegated",
  "statement.write_off.record_delegated",
]) {
  assert.equal(office.actionPermissions.includes(permission), true, `office A/B are missing delegated-entry permission ${permission}`);
}
for (const permission of [
  "order.priority.direct",
  "production.schedule.direct",
  "raw_material.purchase.direct",
  "fulfillment.quantity_variance.direct",
  "statement.variance.direct",
  "statement.write_off.direct",
]) {
  assert.equal(office.actionPermissions.includes(permission), false, `office A/B must not gain management authority ${permission}`);
}
for (const permission of systemV1ActionPermissions) {
  assert.equal(manager.actionPermissions.includes(permission), true, `management is missing ${permission}`);
  assert.equal(technical.actionPermissions.includes(permission), true, `technical operations is missing ${permission}`);
}
assert.deepEqual(technical.roles, ["technical_operations"]);
assert.equal(roleCatalog.technical_operations.department, "system");
assert.equal(v1RuntimeEmployeeRoleKeys.length, 8);
assert.equal(getV1RuntimeEmployeeRoleInputLabels().length, 8);
assert.equal(normalizeV1RuntimeEmployeeRoleKey("", "办公室文员"), "office");
assert.equal(normalizeV1RuntimeEmployeeRoleKey("", "仓库出库"), "warehouse");
assert.equal(normalizeV1RuntimeEmployeeRoleKey("", "财务对账"), "finance");
assert.equal(normalizeV1RuntimeEmployeeRoleKey("", "制袋工"), "workshop");
assert.equal(normalizeV1RuntimeEmployeeRoleKey("", "打包杂工"), "packing");
assert.equal(normalizeV1RuntimeEmployeeRoleKey("", "送货司机"), "driver");
assert.equal(normalizeV1RuntimeEmployeeRoleKey("", "管理主管"), "management");
assert.equal(normalizeV1RuntimeEmployeeRoleKey("", "系统运维"), "technical_operations");
assert.equal(normalizeV1RuntimeEmployeeRoleKey("", "办公室主管"), "management");
assert.equal(normalizeV1RuntimeEmployeeRoleKey("", "财务负责人"), "management");
assert.equal(normalizeV1RuntimeEmployeeRoleKey("", "神秘岗位"), "");
assert.deepEqual(
  normalizeV1RuntimeEmployeeRoleKeys(["管理", "财务 / 对账、管理"]),
  ["management", "finance"],
);

for (const [roleKey, definition] of Object.entries(roleCatalog)) {
  assert.equal(new Set(definition.buttonPermissions).size, definition.buttonPermissions.length, `${roleKey} has duplicate button permissions`);
  assert.equal(new Set(definition.actionPermissions).size, definition.actionPermissions.length, `${roleKey} has duplicate action permissions`);
}

const server = createApiServer({ runtimeMode: "test", runtimeStorageBaseDir: storageRoot });
await server.ready;
await listen(server);
try {
  const { port } = server.address();
  const endpoint = `http://127.0.0.1:${port}/api/system/v1-persistence/live-precheck`;
  const officeResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-erp-user-id": "U-OFFICE-A" },
    body: "{}",
  });
  assert.equal(officeResponse.status, 403);
  const officeJson = await officeResponse.json();
  assert.equal(officeJson.requiredPermission, "system.v1_persistence.precheck");

  const managerResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-erp-user-id": "U-MANAGER-A" },
    body: "{}",
  });
  assert.notEqual(managerResponse.status, 403);
} finally {
  await close(server);
}

console.log("Role catalog check passed: frontend/server parity, office V1 denial, and management/technical V1 authorization are covered.");

function listen(serverInstance) {
  return new Promise((resolvePromise, reject) => {
    serverInstance.once("error", reject);
    serverInstance.listen(0, "127.0.0.1", resolvePromise);
  });
}

function close(serverInstance) {
  return new Promise((resolvePromise) => serverInstance.close(resolvePromise));
}
