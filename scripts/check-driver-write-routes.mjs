import assert from "node:assert/strict";
import { handleDriverWriteRoutes } from "../server/routes/driverWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { idempotencyKey: "driver-write-route-check" },
  permissionContext: { actionPermissions: [] },
  authContext: { user: { userId: "U-AUTH" } },
  writeActionPermissions: {
    confirmDriverDeliveryLoaded: "delivery.load_confirm",
    recordDriverDeviceFieldTest: "delivery.device_qa.record",
    completeDriverDelivery: "delivery.complete",
    createDriverDeliveryException: "delivery.exception.create",
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-RESOLVED";
  },
  fulfillmentActionCommandService: {},
  driverDeviceFieldTestCommandService: {},
  sendCommandResponse(response, result, options) {
    calls.push({ kind: "response", response, result, options });
  },
};
for (const [serviceName, commandName, kind] of [
  ["fulfillmentActionCommandService", "confirmDriverDeliveryLoaded", "load"],
  ["driverDeviceFieldTestCommandService", "recordDriverDeviceFieldTest", "fieldTest"],
  ["fulfillmentActionCommandService", "completeDriverDelivery", "complete"],
  ["fulfillmentActionCommandService", "reportDriverDeliveryException", "exception"],
]) {
  dependencies[serviceName][commandName] = async (input) => {
    calls.push({ kind, ...input });
    return { response: { command: kind } };
  };
}

for (const [action, permission, kind] of [
  ["load-confirm", "delivery.load_confirm", "load"],
  ["device-field-tests", "delivery.device_qa.record", "fieldTest"],
  ["complete", "delivery.complete", "complete"],
  ["exception", "delivery.exception.create", "exception"],
]) {
  await expectHandled(action, permission, kind);
}

calls.length = 0;
assert.equal(
  await handleDriverWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL("http://erp.test/api/driver/delivery-tasks/F-1/complete"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
assert.equal(await handleDriverWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/driver/delivery-tasks/F-1/complete") }), false);
assert.equal(await handleDriverWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/driver/delivery-tasks/F-1") }), false);

console.log("driver write routes checks passed: permissions, authenticated operators, driver commands, response adaptation, and thin API wiring are covered");

async function expectHandled(action, permission, kind) {
  calls.length = 0;
  assert.equal(await handleDriverWriteRoutes({ ...dependencies, method: "POST", url: new URL(`http://erp.test/api/driver/delivery-tasks/F-1/${action}`) }), true);
  assert.deepEqual(calls, [
    { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission },
    { kind: "operator", permissionContext: dependencies.permissionContext, authContext: dependencies.authContext, fallback: "U-DRIVER-A" },
    {
      kind,
      workspace: dependencies.workspace,
      fulfillmentId: "F-1",
      body: dependencies.body,
      operatorId: "U-RESOLVED",
    },
    {
      kind: "response",
      response: dependencies.response,
      result: { response: { command: kind } },
      options: undefined,
    },
  ]);
}
