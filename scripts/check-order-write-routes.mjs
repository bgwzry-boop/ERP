import assert from "node:assert/strict";
import { handleOrderWriteRoutes } from "../server/routes/orderWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { operatorId: "U-OFFICE-A" },
  permissionContext: { actionPermissions: [] },
  authContext: { userId: "U-AUTHENTICATED" },
  getPermissionOperatorId(_permissionContext, authContext) {
    return authContext.userId;
  },
  writeActionPermissions: {
    recognizeOrderDraft: "order.draft.recognize",
    saveOrderDraft: "order.draft.save",
    confirmOrderDraft: "order.confirm",
    voidOrderLine: "order.void",
    adjustOrderLineQuantity: "order.quantity.adjust",
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  orderDraftCommandService: {},
  orderLineMutationCommandService: {},
  sendCommandResponse(response, result) {
    calls.push({ kind: "response", response, result });
    return "response-sent";
  },
};
for (const [serviceName, commandName, kind] of [
  ["orderDraftCommandService", "recognizeOrderDraft", "recognize"],
  ["orderDraftCommandService", "recognizeOrderDraftQueue", "recognize-queue"],
  ["orderDraftCommandService", "saveOrderDraft", "save"],
  ["orderDraftCommandService", "linkCrossDraftShortageCancellation", "link-cross-cancel"],
  ["orderDraftCommandService", "restoreShortageCancelledDraftLine", "restore-shortage"],
  ["orderDraftCommandService", "previewOrderDraftSplit", "split-preview"],
  ["orderDraftCommandService", "confirmSplitOrderDraft", "split-confirm"],
  ["orderDraftCommandService", "confirmOrderDraft", "confirm"],
  ["orderLineMutationCommandService", "voidOrderLine", "void"],
  ["orderLineMutationCommandService", "adjustOrderLineQuantity", "adjust"],
]) {
  dependencies[serviceName][commandName] = async (input) => {
    calls.push({ kind, ...input });
    return { response: { command: kind } };
  };
}

await expectHandled("POST", "/api/order-drafts/recognize", "order.draft.recognize", "recognize", {});
await expectHandled("POST", "/api/order-draft-queues/recognize", "order.draft.recognize", "recognize-queue", {});
await expectHandled("PATCH", "/api/order-drafts/DRAFT-1", "order.draft.save", "save", { draftId: "DRAFT-1" });
await expectHandled("POST", "/api/order-drafts/DRAFT-1/cross-draft-shortage-cancellation", "order.draft.save", "link-cross-cancel", { draftId: "DRAFT-1" });
await expectHandled("POST", "/api/order-drafts/DRAFT-1/shortage-cancellation-restore", "order.draft.save", "restore-shortage", { draftId: "DRAFT-1" });
await expectHandled("POST", "/api/order-drafts/DRAFT-1/split-preview", "order.confirm", "split-preview", { draftId: "DRAFT-1" });
await expectHandled("POST", "/api/order-drafts/DRAFT-1/split-confirm", "order.confirm", "split-confirm", { draftId: "DRAFT-1" });
await expectHandled("POST", "/api/order-drafts/DRAFT-1/confirm", "order.confirm", "confirm", { draftId: "DRAFT-1" });
await expectHandled("POST", "/api/order-lines/OL-1/void", "order.void", "void", { orderLineId: "OL-1" });
await expectHandled("POST", "/api/order-lines/OL-1/quantity-adjustment", "order.quantity.adjust", "adjust", { orderLineId: "OL-1" });

calls.length = 0;
assert.equal(
  await handleOrderWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL("http://erp.test/api/order-drafts/recognize"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
assert.equal(await handleOrderWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/order-drafts/recognize") }), false);
assert.equal(await handleOrderWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/order-drafts/DRAFT-1") }), false);
assert.equal(await handleOrderWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/order-lines/OL-1") }), false);

console.log("order write routes checks passed: permissions, authenticated operators, direct command ownership, response adaptation, and thin API wiring are covered");

async function expectHandled(method, pathname, permission, kind, identifiers) {
  calls.length = 0;
  assert.equal(await handleOrderWriteRoutes({ ...dependencies, method, url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls, [
    { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission },
    {
      kind,
      workspace: dependencies.workspace,
      body: dependencies.body,
      operatorId: "U-AUTHENTICATED",
      ...identifiers,
    },
    {
      kind: "response",
      response: dependencies.response,
      result: { response: { command: kind } },
    },
  ]);
}
