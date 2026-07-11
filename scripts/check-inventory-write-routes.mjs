import assert from "node:assert/strict";
import { handleInventoryWriteRoutes } from "../server/routes/inventoryWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { operatorId: "U-OFFICE-A" },
  authContext: { authenticated: true, userId: "U-AUTH" },
  permissionContext: { actionPermissions: ["inventory.correction.create"] },
  writeActionPermissions: {
    createInventoryCorrectionDraft: "inventory.correction.create",
    linkInventoryCorrectionAttachments: "inventory.correction.create",
    confirmInventoryCorrectionDraft: "inventory.correction.confirm",
    releaseInventoryReservation: "inventory.reservation.release",
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallbackUserId) {
    calls.push({ kind: "operator", permissionContext, authContext, fallbackUserId });
    return authContext.userId;
  },
  async createInventoryCorrectionDraftRoute({ response, workspace, body, operatorId }) {
    calls.push({ kind: "create", response, workspace, body, operatorId });
  },
  async linkInventoryCorrectionAttachmentsRoute({ response, workspace, correctionDraftId, body, operatorId }) {
    calls.push({ kind: "link", response, workspace, correctionDraftId, body, operatorId });
  },
  async confirmInventoryCorrectionDraftRoute({ response, workspace, correctionDraftId, body, operatorId }) {
    calls.push({ kind: "confirm", response, workspace, correctionDraftId, body, operatorId });
  },
  async releaseInventoryReservationRoute({ response, workspace, reservationId, body, operatorId }) {
    calls.push({ kind: "release", response, workspace, reservationId, body, operatorId });
  },
};

await expectHandled("/api/inventory/correction-drafts", "inventory.correction.create", { kind: "create" });
await expectHandled("/api/inventory/correction-drafts/ICD-1/attachments", "inventory.correction.create", { kind: "link", correctionDraftId: "ICD-1" });
await expectHandled("/api/inventory/correction-drafts/ICD-1/confirm", "inventory.correction.confirm", { kind: "confirm", correctionDraftId: "ICD-1" });
await expectHandled("/api/inventory/reservations/RSV-1/release", "inventory.reservation.release", { kind: "release", reservationId: "RSV-1" });

calls.length = 0;
assert.equal(
  await handleInventoryWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL("http://erp.test/api/inventory/correction-drafts"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
assert.equal(
  await handleInventoryWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/inventory/correction-drafts") }),
  false,
);
assert.equal(
  await handleInventoryWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/inventory/reservations/RSV-1") }),
  false,
);

console.log("inventory write routes checks passed");

async function expectHandled(pathname, permission, expectedCall) {
  calls.length = 0;
  assert.equal(await handleInventoryWriteRoutes({ ...dependencies, method: "POST", url: new URL(`http://erp.test${pathname}`) }), true);
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
      fallbackUserId: "U-OFFICE-A",
    },
    {
      ...expectedCall,
      response: dependencies.response,
      workspace: dependencies.workspace,
      body: dependencies.body,
      operatorId: "U-AUTH",
    },
  ]);
}
