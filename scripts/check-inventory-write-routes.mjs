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
  inventoryCorrectionCommandService: {
    async createCorrectionDraft(input) {
      calls.push({ kind: "create", ...input });
      return {
        correctionDraft: {
          correctionDraftId: "ICD-NEW",
          inventoryItemId: "INV-1",
          status: "待复核",
          revision: 1,
          attachmentIds: ["ATT-1"],
          qtyBefore: { onHand: 10 },
          requestedQtyAfter: { onHand: 12 },
        },
        todo: { id: "TODO-1" },
        operationLogId: "LOG-CREATE",
      };
    },
    async linkCorrectionAttachments(input) {
      calls.push({ kind: "link", ...input });
      return {
        correctionDraft: { correctionDraftId: input.correctionDraftId, revision: 2, attachmentIds: ["ATT-2"] },
        attachmentIds: ["ATT-2"],
        unchanged: false,
        operationLogId: "LOG-LINK",
      };
    },
    async confirmCorrectionDraft(input) {
      calls.push({ kind: "confirm", ...input });
      return {
        correctionDraft: { correctionDraftId: input.correctionDraftId, qtyBefore: { onHand: 10 } },
        inventoryItem: { id: "INV-1", onHandQty: 12, reserved: 2, waitingPickupLocked: 1, pendingHandling: 1 },
        inventoryLedger: { id: "LED-1" },
        todo: { id: "TODO-2" },
        operationLogId: "LOG-CONFIRM",
      };
    },
  },
  inventoryReservationReleaseCommandService: {
    async releaseReservation(input) {
      calls.push({ kind: "release", ...input });
      return { response: { reservationId: input.reservationId, released: true } };
    },
  },
  inventoryCorrectionReadProjectionService: {
    buildLedgerSummary(input) {
      calls.push({ kind: "ledger", ...input });
      return { ledgerId: "LED-1" };
    },
  },
  todoReadProjectionService: {
    projectTodo(input) {
      calls.push({ kind: "todo", ...input });
      return { todoId: input.todo.id };
    },
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
  sendCommandResponse(response, result, options) {
    calls.push({ kind: "command-response", response, result, options });
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

await expectCreateCorrection();
await expectLinkAttachments();
await expectConfirmCorrection();
await expectReleaseReservation();

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

calls.length = 0;
assert.equal(
  await handleInventoryWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL("http://erp.test/api/inventory/correction-drafts"),
    inventoryCorrectionCommandService: {
      ...dependencies.inventoryCorrectionCommandService,
      async createCorrectionDraft(input) {
        calls.push({ kind: "create-error", ...input });
        return { error: true, statusCode: 422, code: "INVENTORY_CORRECTION_INVALID", message: "invalid" };
      },
    },
  }),
  true,
);
assert.equal(calls.at(-1).kind, "command-response");
assert.equal(calls.at(-1).result.statusCode, 422);
assert.equal(calls.some((call) => call.kind === "send"), false);

assert.equal(
  await handleInventoryWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/inventory/correction-drafts") }),
  false,
);
assert.equal(
  await handleInventoryWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/inventory/reservations/RSV-1") }),
  false,
);

console.log("inventory write routes checks passed: direct commands, custom correction projections, failures, permissions, intents, and thin API wiring are covered");

async function expectCreateCorrection() {
  calls.length = 0;
  assert.equal(await handle("/api/inventory/correction-drafts"), true);
  assert.deepEqual(calls.map(({ kind }) => kind), ["permission", "operator", "create", "send"]);
  assert.deepEqual(calls.at(-1).body, {
    correctionDraftId: "ICD-NEW",
    inventoryItemId: "INV-1",
    status: "待复核",
    revision: 1,
    attachmentIds: ["ATT-1"],
    qtyBefore: { onHand: 10 },
    requestedQtyAfter: { onHand: 12 },
    todoId: "TODO-1",
    operationLogId: "LOG-CREATE",
  });
}

async function expectLinkAttachments() {
  calls.length = 0;
  assert.equal(await handle("/api/inventory/correction-drafts/ICD-1/attachments"), true);
  assert.deepEqual(calls.map(({ kind }) => kind), ["permission", "operator", "link", "send"]);
  assert.equal(calls[2].correctionDraftId, "ICD-1");
  assert.deepEqual(calls.at(-1).body, {
    correctionDraftId: "ICD-1",
    attachmentIds: ["ATT-2"],
    revision: 2,
    unchanged: false,
    operationLogId: "LOG-LINK",
  });
}

async function expectConfirmCorrection() {
  calls.length = 0;
  assert.equal(await handle("/api/inventory/correction-drafts/ICD-1/confirm"), true);
  assert.deepEqual(calls.map(({ kind }) => kind), ["permission", "operator", "confirm", "ledger", "todo", "send"]);
  assert.equal(calls[2].correctionDraftId, "ICD-1");
  assert.deepEqual(calls.at(-1).body, {
    correctionDraftId: "ICD-1",
    inventoryItemId: "INV-1",
    qtyBefore: { onHand: 10 },
    qtyAfter: { onHand: 12, reserved: 2, available: 8, waitingPickupLocked: 1, pendingHandling: 1 },
    ledger: { ledgerId: "LED-1" },
    todo: { todoId: "TODO-2" },
    operationLogId: "LOG-CONFIRM",
  });
}

async function expectReleaseReservation() {
  calls.length = 0;
  assert.equal(await handle("/api/inventory/reservations/RSV-1/release"), true);
  assert.deepEqual(calls.map(({ kind }) => kind), ["permission", "operator", "release", "command-response"]);
  assert.equal(calls[2].reservationId, "RSV-1");
  assert.deepEqual(calls.at(-1).result, { response: { reservationId: "RSV-1", released: true } });
}

async function handle(pathname) {
  return handleInventoryWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL(`http://erp.test${pathname}`),
  });
}

async function expectIntentRoute(pathname, permission, kind, expected) {
  calls.length = 0;
  assert.equal(await handle(pathname), true);
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
