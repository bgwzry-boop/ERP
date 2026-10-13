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
    handoffPaperOutboundDocument: "fulfillment.paper.handoff",
    recordWarehouseOutboundExecution: "fulfillment.warehouse.execute",
    completeFulfillment: "fulfillment.complete",
    confirmFulfillmentPickup: "fulfillment.pickup.confirm",
    cancelFulfillment: "fulfillment.cancel",
    reviewDeliveryEvidence: "delivery.evidence.review",
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return `resolved:${fallback}`;
  },
  fulfillmentActionCommandService: {},
  fulfillmentPrintCommandService: {},
  sendCommandResponse(response, result, options) {
    calls.push({ kind: "response", response, result, options });
  },
  sendCommandRecord(response, result, options) {
    calls.push({ kind: "record", response, result, options });
  },
};
for (const [serviceName, commandName, kind] of [
  ["fulfillmentActionCommandService", "createFulfillmentException", "exception"],
  ["fulfillmentActionCommandService", "upsertDriverDispatch", "dispatch"],
  ["fulfillmentActionCommandService", "handoffPaperOutboundDocument", "paperHandoff"],
  ["fulfillmentActionCommandService", "recordWarehouseOutboundExecution", "warehouseExecution"],
  ["fulfillmentActionCommandService", "updateFulfillmentStatus", "status"],
  ["fulfillmentActionCommandService", "cancelFulfillment", "cancel"],
  ["fulfillmentActionCommandService", "reviewDeliveryEvidence", "review"],
  ["fulfillmentPrintCommandService", "printFulfillment", "print"],
  ["fulfillmentPrintCommandService", "voidPrintRecord", "void"],
]) {
  dependencies[serviceName][commandName] = async (input) => {
    calls.push({ kind, ...input });
    return { response: { command: kind } };
  };
}

await expectHandled("/api/fulfillments/F-1/exception", "fulfillment.exception.create", "exception", { fulfillmentId: "F-1" });
await expectHandled("/api/fulfillments/F-1/dispatch", "fulfillment.dispatch.update", "dispatch", { fulfillmentId: "F-1" });
await expectHandled("/api/fulfillments/F-1/paper-handoff", "fulfillment.paper.handoff", "paperHandoff", { fulfillmentId: "F-1" });
await expectHandled("/api/fulfillments/F-1/warehouse-execution", "fulfillment.warehouse.execute", "warehouseExecution", { fulfillmentId: "F-1" });
await expectHandled("/api/fulfillments/F-1/print", "fulfillment.print", "print", { fulfillmentId: "F-1" }, "record", { notFoundCode: "FULFILLMENT_NOT_FOUND" });
await expectHandled("/api/print-records/PR-1/void", "fulfillment.print", "void", { printRecordId: "PR-1" }, "record", { notFoundCode: "PRINT_RECORD_NOT_FOUND" });
await expectHandled("/api/fulfillments/F-1/prepared", "fulfillment.complete", "status", { fulfillmentId: "F-1", action: "标记已备货" });
await expectHandled("/api/fulfillments/F-1/complete", "fulfillment.complete", "status", { fulfillmentId: "F-1", action: "完成出库/交付" });
await expectHandled("/api/fulfillments/F-1/pickup-confirm", "fulfillment.pickup.confirm", "status", { fulfillmentId: "F-1", action: "确认已拉走" });
await expectHandled("/api/fulfillments/F-1/cancel", "fulfillment.cancel", "cancel", { fulfillmentId: "F-1" });
await expectHandled("/api/fulfillments/F-1/delivery-evidence-review", "delivery.evidence.review", "review", { fulfillmentId: "F-1" });

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

console.log("fulfillment write routes checks passed: permissions, authenticated operators, action/print commands, response modes, and thin API wiring are covered");

async function expectHandled(pathname, permission, kind, identifiers, responseKind = "response", options) {
  calls.length = 0;
  assert.equal(
    await handleFulfillmentWriteRoutes({ ...dependencies, method: "POST", url: new URL(`http://erp.test${pathname}`) }),
    true,
  );
  assert.deepEqual(calls, [
    {
      kind: "permission",
      response: dependencies.response,
      permissionContext: dependencies.permissionContext,
      permission,
    },
    {
      kind: "operator",
      permissionContext: dependencies.permissionContext,
      authContext: dependencies.authContext,
      fallback: "U-OFFICE-A",
    },
    {
      kind,
      workspace: dependencies.workspace,
      body: dependencies.body,
      operatorId: "resolved:U-OFFICE-A",
      ...identifiers,
    },
    {
      kind: responseKind,
      response: dependencies.response,
      result: { response: { command: kind } },
      options,
    },
  ]);
}
