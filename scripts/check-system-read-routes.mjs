import assert from "node:assert/strict";
import { handleSystemReadRoutes } from "../server/routes/systemReadRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {
    id: "workspace",
    operationLogs: [
      { logId: "LOG-1", targetType: "order", targetId: "ORD-1" },
      { logId: "LOG-2", targetType: "inventory", targetId: "INV-1" },
    ],
  },
  openapi: { valid: true, pathCount: 1 },
  permissionContext: { user: { userId: "U-OFFICE-A" } },
  authContext: { userId: "U-AUTH" },
  sendJson(response, status, body) {
    calls.push({ kind: "json", response, status, body });
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-RESOLVED";
  },
  getSystemV1ReadinessResponse(input) {
    calls.push({ kind: "readiness", ...input });
    return { status: "blocked" };
  },
  getSystemV1GoLiveStatusResponse(input) {
    calls.push({ kind: "goLive", ...input });
    return { version: "v1" };
  },
  filterByValue(items, value, field) {
    return value ? items.filter((item) => item[field] === value) : items;
  },
};

await expectHandled("/api/system/v1-readiness", "readiness", { status: "blocked" });
await expectHandled("/api/system/v1-go-live-status", "goLive", { version: "v1" });
calls.length = 0;
assert.equal(await handleSystemReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/openapi/status") }), true);
assert.deepEqual(calls, [{ kind: "json", response: dependencies.response, status: 200, body: dependencies.openapi }]);
calls.length = 0;
assert.equal(
  await handleSystemReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/openapi/status"), openapi: { valid: false } }),
  true,
);
assert.deepEqual(calls, [{ kind: "json", response: dependencies.response, status: 500, body: { valid: false } }]);
calls.length = 0;
assert.equal(await handleSystemReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/permissions/effective") }), true);
assert.deepEqual(calls, [{ kind: "json", response: dependencies.response, status: 200, body: dependencies.permissionContext }]);
calls.length = 0;
assert.equal(
  await handleSystemReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/operation-logs?targetType=order&limit=1") }),
  true,
);
assert.deepEqual(calls, [
  {
    kind: "json",
    response: dependencies.response,
    status: 200,
    body: { items: [dependencies.workspace.operationLogs[0]], total: 1 },
  },
]);
assert.equal(await handleSystemReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/system/unknown") }), false);

console.log("system read routes checks passed");

async function expectHandled(pathname, kind, responseBody) {
  calls.length = 0;
  assert.equal(await handleSystemReadRoutes({ ...dependencies, url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls, [
    { kind: "operator", permissionContext: dependencies.permissionContext, authContext: dependencies.authContext, fallback: "SYSTEM" },
    ["readiness", "goLive"].includes(kind)
      ? { kind, workspace: dependencies.workspace, operatorId: "U-RESOLVED" }
      : { kind, operatorId: "U-RESOLVED" },
    { kind: "json", response: dependencies.response, status: 200, body: responseBody },
  ]);
}
