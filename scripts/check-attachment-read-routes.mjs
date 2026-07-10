import assert from "node:assert/strict";
import { handleAttachmentReadRoutes } from "../server/routes/attachmentReadRoutes.mjs";

const calls = [];
const workspace = {
  attachmentObjectStorage: {
    validateAccessToken() {
      return { valid: false, present: false, message: "" };
    },
  },
};
const dependencies = {
  response: {},
  workspace,
  permissionContext: { actionPermissions: [] },
  authContext: { userId: "U-OFFICE-A" },
  writeActionPermissions: { viewAttachment: "attachment.view" },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-RESOLVED";
  },
  sendBusinessError(response, statusCode, code, message) {
    calls.push({ kind: "error", response, statusCode, code, message });
  },
};
for (const [name, kind] of [
  ["listAttachmentsRoute", "list"],
  ["getAttachmentStorageDiagnosticsRoute", "storage"],
  ["getAttachmentV1ReadinessRoute", "readiness"],
  ["createAttachmentAccessUrlRoute", "accessUrl"],
  ["listAttachmentAccessLogsRoute", "accessLogs"],
  ["getAttachmentContentRoute", "content"],
]) {
  dependencies[name] = async (input) => calls.push({ kind, ...input });
}

await expectDirect("/api/attachments?ownerId=ORD-1", "list");
await expectDirect("/api/attachments/storage-diagnostics", "storage");
await expectDirect("/api/attachments/v1-readiness", "readiness", true);
await expectChild("/api/attachments/ATT-1/access-url?ttlSeconds=120", "accessUrl");
await expectChild("/api/attachments/ATT-1/access-logs?limit=20", "accessLogs");

calls.length = 0;
assert.equal(await handleAttachmentReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/attachments/ATT-1/content") }), true);
assert.deepEqual(calls, [
  { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission: "attachment.view" },
  { kind: "content", response: dependencies.response, workspace, attachmentId: "ATT-1", authContext: dependencies.authContext, accessMode: "permission" },
]);
calls.length = 0;
assert.equal(
  await handleAttachmentReadRoutes({
    ...dependencies,
    url: new URL("http://erp.test/api/attachments/ATT-1/content?accessToken=signed&expiresAt=soon"),
    workspace: {
      attachmentObjectStorage: {
        validateAccessToken() {
          return { valid: true, present: true, message: "" };
        },
      },
    },
  }),
  true,
);
assert.deepEqual(calls, [
  {
    kind: "content",
    response: dependencies.response,
    workspace: {
      attachmentObjectStorage: {
        validateAccessToken: calls[0]?.workspace?.attachmentObjectStorage?.validateAccessToken,
      },
    },
    attachmentId: "ATT-1",
    authContext: dependencies.authContext,
    accessMode: "signed_url",
  },
]);
calls.length = 0;
assert.equal(
  await handleAttachmentReadRoutes({
    ...dependencies,
    url: new URL("http://erp.test/api/attachments/ATT-1/content?accessToken=bad"),
    workspace: { attachmentObjectStorage: { validateAccessToken: () => ({ valid: false, present: true, message: "expired" }) } },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "error", response: dependencies.response, statusCode: 403, code: "ATTACHMENT_ACCESS_TOKEN_INVALID", message: "expired" }]);
calls.length = 0;
assert.equal(
  await handleAttachmentReadRoutes({
    ...dependencies,
    url: new URL("http://erp.test/api/attachments"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
assert.equal(await handleAttachmentReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/attachments/ATT-1") }), false);

console.log("attachment read routes checks passed");

async function expectDirect(pathname, kind, needsOperator = false) {
  calls.length = 0;
  assert.equal(await handleAttachmentReadRoutes({ ...dependencies, url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls.shift(), { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission: "attachment.view" });
  if (needsOperator) {
    assert.deepEqual(calls.shift(), { kind: "operator", permissionContext: dependencies.permissionContext, authContext: dependencies.authContext, fallback: "U-OFFICE-A" });
  }
  assert.equal(calls[0].kind, kind);
}

async function expectChild(pathname, kind) {
  calls.length = 0;
  assert.equal(await handleAttachmentReadRoutes({ ...dependencies, url: new URL(`http://erp.test${pathname}`) }), true);
  assert.equal(calls[0].kind, "permission");
  assert.equal(calls[1].kind, kind);
  assert.equal(calls[1].attachmentId, "ATT-1");
}
