import assert from "node:assert/strict";
import { handleDriverReadRoutes } from "../server/routes/driverReadRoutes.mjs";

const calls = [];
const workspace = {
  id: "workspace",
  driverDeliveryTaskReadRepository: {
    async listDriverDeliveryTasks(input) {
      calls.push({ kind: "list", ...input });
      return { items: [{ fulfillmentId: "F-1" }] };
    },
    async getDriverDeliveryTask(input) {
      calls.push({ kind: "detail", ...input });
      return input.fulfillmentId === "MISSING" ? null : { fulfillmentId: input.fulfillmentId };
    },
  },
};
const dependencies = {
  response: { id: "response" },
  workspace,
  permissionContext: { id: "permission" },
  authContext: { id: "auth" },
  writeActionPermissions: { viewDriverDeliveryTasks: "delivery.view" },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-RESOLVED";
  },
  sendJson(response, status, body) {
    calls.push({ kind: "json", response, status, body });
  },
  sendNotFound(response, code) {
    calls.push({ kind: "notFound", response, code });
  },
  async getDriverV1ReadinessResponse(input) {
    calls.push({ kind: "readiness", ...input });
    return { status: "blocked" };
  },
};

await expectRoute("/api/driver/delivery-tasks?status=%E9%85%8D%E9%80%81%E4%B8%AD", [
  { kind: "list", workspace, query: "配送中", operatorId: "U-RESOLVED" },
  { kind: "json", response: dependencies.response, status: 200, body: { items: [{ fulfillmentId: "F-1" }] } },
]);
await expectRoute("/api/driver/v1-readiness", [
  { kind: "readiness", workspace: dependencies.workspace, operatorId: "U-RESOLVED" },
  { kind: "json", response: dependencies.response, status: 200, body: { status: "blocked" } },
]);
await expectRoute("/api/driver/delivery-tasks/F%2F1", [
  { kind: "detail", workspace, fulfillmentId: "F/1", operatorId: "U-RESOLVED" },
  { kind: "json", response: dependencies.response, status: 200, body: { task: { fulfillmentId: "F/1" } } },
]);
await expectRoute("/api/driver/delivery-tasks/MISSING", [
  { kind: "detail", workspace, fulfillmentId: "MISSING", operatorId: "U-RESOLVED" },
  { kind: "notFound", response: dependencies.response, code: "DRIVER_DELIVERY_TASK_NOT_FOUND" },
]);

calls.length = 0;
assert.equal(
  await handleDriverReadRoutes({
    ...dependencies,
    url: new URL("http://erp.test/api/driver/delivery-tasks"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
assert.equal(await handleDriverReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/driver/delivery-tasks/F-1/complete") }), false);

console.log("driver read routes checks passed: list/detail/readiness permissions, repository mapping, 404, and thin API wiring are covered");

async function expectRoute(pathname, expectedCalls) {
  calls.length = 0;
  assert.equal(await handleDriverReadRoutes({ ...dependencies, url: new URL(`http://erp.test${pathname}`) }), true);
  const permissionCall = calls.shift();
  const operatorCall = calls.shift();
  assert.deepEqual(permissionCall, {
    kind: "permission",
    response: dependencies.response,
    permissionContext: dependencies.permissionContext,
    permission: "delivery.view",
  });
  assert.deepEqual(operatorCall, {
    kind: "operator",
    permissionContext: dependencies.permissionContext,
    authContext: dependencies.authContext,
    fallback: "U-DRIVER-A",
  });
  const normalizedCalls = calls.map((call) =>
    call.kind === "list" ? { ...call, query: call.query.get("status") } : call,
  );
  assert.deepEqual(normalizedCalls, expectedCalls);
}
