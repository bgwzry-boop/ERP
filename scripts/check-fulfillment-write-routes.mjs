import assert from "node:assert/strict";
import { handleFulfillmentWriteRoutes } from "../server/routes/fulfillmentWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { operatorId: "U-OFFICE-A" },
  permissionContext: { actionPermissions: [] },
  authContext: { user: { userId: "U-OFFICE-A" } },
  writeActionPermissions: {
    createFulfillmentException: "fulfillment.exception.create",
    updateFulfillmentDispatch: "fulfillment.dispatch.update",
    printFulfillment: "fulfillment.print",
    completeFulfillment: "fulfillment.complete",
    confirmFulfillmentPickup: "fulfillment.pickup.confirm",
    cancelFulfillment: "fulfillment.cancel",
    reviewDeliveryEvidence: "delivery.evidence.review",
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(_permissionContext, _authContext, fallback) {
    return `resolved:${fallback}`;
  },
  async createFulfillmentExceptionRoute(input) {
    calls.push({ kind: "exception", ...input });
  },
  async upsertFulfillmentDispatchRoute(input) {
    calls.push({ kind: "dispatch", ...input });
  },
  async printFulfillmentRoute(input) {
    calls.push({ kind: "print", ...input });
  },
  async voidPrintRecordRoute(input) {
    calls.push({ kind: "void", ...input });
  },
  async updateFulfillmentStatusRoute(input) {
    calls.push({ kind: "status", ...input });
  },
  async cancelFulfillmentRoute(input) {
    calls.push({ kind: "cancel", ...input });
  },
  async reviewDeliveryEvidenceRoute(input) {
    calls.push({ kind: "review", ...input });
  },
};

await expectHandled("/api/fulfillments/F-1/exception", "fulfillment.exception.create", "exception", { fulfillmentId: "F-1" });
await expectHandled("/api/fulfillments/F-1/dispatch", "fulfillment.dispatch.update", "dispatch", { fulfillmentId: "F-1", operatorId: "resolved:U-OFFICE-A" });
await expectHandled("/api/fulfillments/F-1/print", "fulfillment.print", "print", { fulfillmentId: "F-1" });
await expectHandled("/api/print-records/PR-1/void", "fulfillment.print", "void", { printRecordId: "PR-1" });
await expectHandled("/api/fulfillments/F-1/complete", "fulfillment.complete", "status", { fulfillmentId: "F-1", action: "完成出库/交付" });
await expectHandled("/api/fulfillments/F-1/pickup-confirm", "fulfillment.pickup.confirm", "status", { fulfillmentId: "F-1", action: "确认已拉走" });
await expectHandled("/api/fulfillments/F-1/cancel", "fulfillment.cancel", "cancel", { fulfillmentId: "F-1" });
await expectHandled("/api/fulfillments/F-1/delivery-evidence-review", "delivery.evidence.review", "review", { fulfillmentId: "F-1", operatorId: "resolved:U-OFFICE-A" });

calls.length = 0;
assert.equal(
  await handleFulfillmentWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL("http://erp.test/api/fulfillments/F-1/complete"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
assert.equal(
  await handleFulfillmentWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/fulfillments/F-1/complete") }),
  false,
);
assert.equal(
  await handleFulfillmentWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/fulfillments/F-1/unknown") }),
  false,
);

console.log("fulfillment write routes checks passed");

async function expectHandled(pathname, permission, kind, expected) {
  calls.length = 0;
  assert.equal(await handleFulfillmentWriteRoutes({ ...dependencies, method: "POST", url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls, [
    {
      kind: "permission",
      response: dependencies.response,
      permissionContext: dependencies.permissionContext,
      permission,
    },
    { kind, response: dependencies.response, workspace: dependencies.workspace, body: dependencies.body, ...expected },
  ]);
}
