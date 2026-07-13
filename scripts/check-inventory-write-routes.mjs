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
    createTemporaryInventoryHold: "inventory.reservation.create",
    extendTemporaryInventoryHold: "inventory.reservation.create",
    releaseTemporaryInventoryHold: "inventory.reservation.release",
    expireTemporaryInventoryHolds: "inventory.reservation.release",
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
  inventoryIntentRouteModule: {
    async handleWriteRoutes(input) {
      const route = resolveIntentRoute(input.url.pathname);
      if (!route) return false;
      if (!input.requireActionPermission(input.response, input.permissionContext, route.permission)) return true;
      const operatorId = route.kind === "hold-expire"
        ? undefined
        : input.getPermissionOperatorId(input.permissionContext, input.authContext, "U-OFFICE-A");
      calls.push({
        kind: route.kind,
        response: input.response,
        workspace: input.workspace,
        body: input.body,
        operatorId,
        ...route.params,
      });
      input.sendJson(input.response, 200, { action: route.kind });
      return true;
    },
  },
  sendJson(response, status, body) {
    calls.push({ kind: "send", response, status, body });
  },
  sendNotFound(response, code) {
    calls.push({ kind: "not-found", response, code });
  },
  sendBusinessError(response, status, code, message) {
    calls.push({ kind: "business-error", response, status, code, message });
  },
};

await expectHandled("/api/inventory/correction-drafts", "inventory.correction.create", { kind: "create" });
await expectHandled("/api/inventory/correction-drafts/ICD-1/attachments", "inventory.correction.create", { kind: "link", correctionDraftId: "ICD-1" });
await expectHandled("/api/inventory/correction-drafts/ICD-1/confirm", "inventory.correction.confirm", { kind: "confirm", correctionDraftId: "ICD-1" });
await expectHandled("/api/inventory/reservations/RSV-1/release", "inventory.reservation.release", { kind: "release", reservationId: "RSV-1" });

await expectIntentRoute("/api/inventory/intents/INT-1/hold", "inventory.reservation.create", "hold-create", { intentId: "INT-1" });
await expectIntentRoute("/api/inventory/holds/HOLD-1/extend", "inventory.reservation.create", "hold-extend", { reservationId: "HOLD-1" });
await expectIntentRoute("/api/inventory/holds/HOLD-1/release", "inventory.reservation.release", "hold-release", { reservationId: "HOLD-1" });

calls.length = 0;
assert.equal(await handleInventoryWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/inventory/holds/expire-due") }), true);
assert.equal(calls[0].permission, "inventory.reservation.release");
assert.equal(calls[1].kind, "hold-expire");
assert.equal(calls[2].kind, "send");

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

async function expectIntentRoute(pathname, permission, kind, expected) {
  calls.length = 0;
  assert.equal(await handleInventoryWriteRoutes({ ...dependencies, method: "POST", url: new URL(`http://erp.test${pathname}`) }), true);
  assert.equal(calls[0].kind, "permission");
  assert.equal(calls[0].permission, permission);
  assert.equal(calls[1].kind, "operator");
  assert.equal(calls[2].kind, kind);
  for (const [key, value] of Object.entries(expected)) assert.equal(calls[2][key], value);
  assert.equal(calls.at(-1).kind, "send");
}

function resolveIntentRoute(pathname) {
  const createMatch = pathname.match(/^\/api\/inventory\/intents\/([^/]+)\/hold$/);
  if (createMatch) return { kind: "hold-create", permission: "inventory.reservation.create", params: { intentId: createMatch[1] } };
  const extendMatch = pathname.match(/^\/api\/inventory\/holds\/([^/]+)\/extend$/);
  if (extendMatch) return { kind: "hold-extend", permission: "inventory.reservation.create", params: { reservationId: extendMatch[1] } };
  const releaseMatch = pathname.match(/^\/api\/inventory\/holds\/([^/]+)\/release$/);
  if (releaseMatch) return { kind: "hold-release", permission: "inventory.reservation.release", params: { reservationId: releaseMatch[1] } };
  if (pathname === "/api/inventory/holds/expire-due") return { kind: "hold-expire", permission: "inventory.reservation.release", params: {} };
  return null;
}
