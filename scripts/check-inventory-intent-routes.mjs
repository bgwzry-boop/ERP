import assert from "node:assert/strict";
import { createInventoryIntentRouteModule } from "../server/routes/inventoryIntentRoutes.mjs";

const calls = [];
const commandService = {
  listIntents({ filters }) {
    return [{ intentId: "INT-1", filters }];
  },
  listTemporaryHolds({ filters }) {
    return [{ reservationId: "HOLD-1", filters }];
  },
  async createTemporaryHold(input) {
    calls.push({ kind: "create", input });
    return { response: { action: "created" } };
  },
  async releaseTemporaryHold(input) {
    calls.push({ kind: "release", input });
    return { notFound: true, code: "TEMPORARY_HOLD_NOT_FOUND" };
  },
  async extendTemporaryHold(input) {
    calls.push({ kind: "extend", input });
    return { error: true, statusCode: 409, code: "TEMPORARY_HOLD_CONFLICT", message: "conflict" };
  },
  async expireDueTemporaryHolds(input) {
    calls.push({ kind: "expire", input });
    return { response: { action: "expired" } };
  },
};
const routes = createInventoryIntentRouteModule({ commandService });
const dependencies = {
  response: {},
  workspace: { inventoryIntents: [] },
  body: { reason: "办公室确认" },
  permissionContext: { userId: "U-OFFICE-A" },
  authContext: { authenticated: true, userId: "U-AUTH" },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallbackUserId) {
    calls.push({ kind: "operator", permissionContext, authContext, fallbackUserId });
    return authContext.userId;
  },
  sendJson(response, status, body) {
    calls.push({ kind: "json", response, status, body });
  },
  sendNotFound(response, code) {
    calls.push({ kind: "not-found", response, code });
  },
  sendBusinessError(response, status, code, message) {
    calls.push({ kind: "business-error", response, status, code, message });
  },
};

assert.equal(await routes.handleReadRoutes({
  ...dependencies,
  url: new URL("http://erp.test/api/inventory/intents?intentType=temporary_hold&customerId=C-1"),
}), true);
assert.equal(calls.pop().body.items[0].filters.intentType, "temporary_hold");

assert.equal(await routes.handleReadRoutes({
  ...dependencies,
  url: new URL("http://erp.test/api/inventory/holds?status=%E7%94%9F%E6%95%88"),
}), true);
assert.equal(calls.pop().body.items[0].filters.status, "生效");
assert.equal(await routes.handleReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/inventory/items") }), false);

await expectWrite("/api/inventory/intents/INT%2F1/hold", "inventory.reservation.create", "create", "json");
await expectWrite("/api/inventory/holds/HOLD%2F1/release", "inventory.reservation.release", "release", "not-found");
await expectWrite("/api/inventory/holds/HOLD%2F1/extend", "inventory.reservation.create", "extend", "business-error");
await expectWrite("/api/inventory/holds/expire-due", "inventory.reservation.release", "expire", "json");

calls.length = 0;
assert.equal(await routes.handleWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/inventory/holds") }), false);
assert.equal(await routes.handleWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/inventory/items") }), false);

calls.length = 0;
assert.equal(await routes.handleWriteRoutes({
  ...dependencies,
  method: "POST",
  url: new URL("http://erp.test/api/inventory/intents/INT-1/hold"),
  requireActionPermission() {
    calls.push({ kind: "denied" });
    return false;
  },
}), true);
assert.deepEqual(calls, [{ kind: "denied" }]);

console.log("inventory intent routes checks passed");

async function expectWrite(pathname, permission, commandKind, responseKind) {
  calls.length = 0;
  assert.equal(await routes.handleWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL(`http://erp.test${pathname}`),
  }), true);
  assert.equal(calls[0].kind, "permission");
  assert.equal(calls[0].permission, permission);
  if (commandKind !== "expire") assert.equal(calls[1].kind, "operator");
  const commandCall = calls.find((item) => item.kind === commandKind);
  assert.ok(commandCall);
  if (commandKind === "create") assert.equal(commandCall.input.intentId, "INT/1");
  if (commandKind === "release" || commandKind === "extend") assert.equal(commandCall.input.reservationId, "HOLD/1");
  if (commandKind !== "expire") assert.equal(commandCall.input.operatorId, "U-AUTH");
  assert.equal(calls.at(-1).kind, responseKind);
}
