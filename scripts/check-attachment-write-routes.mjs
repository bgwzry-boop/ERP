import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleAttachmentWriteRoutes } from "../server/routes/attachmentWriteRoutes.mjs";

const calls = [];
const attachment = { attachmentId: "ATT-1", fileName: "proof.png", storageKey: "must-not-leak" };
const dependencies = {
  response: {},
  workspace: {},
  body: { purpose: "delivery_watermark_photo" },
  permissionContext: { actionPermissions: [] },
  authContext: { user: { userId: "U-AUTH" } },
  requireAttachmentCreatePermission(response, permissionContext, body) {
    calls.push({ kind: "permission", response, permissionContext, body });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext) {
    calls.push({ kind: "operator", permissionContext, authContext });
    return "U-RESOLVED";
  },
  attachmentCreateCommandService: {
    async createAttachment(input) {
      calls.push({ kind: "create", ...input });
      return {
        ok: true,
        attachment,
        deduplicated: false,
        duplicateOfAttachmentId: "",
        operationLogId: "LOG-1",
      };
    },
  },
  attachmentFileAccessService: {
    toAttachmentSummary(value) {
      calls.push({ kind: "summary", value });
      return { attachmentId: value.attachmentId, fileName: value.fileName, storageKeyStored: Boolean(value.storageKey) };
    },
  },
  sendJson(response, statusCode, result) {
    calls.push({ kind: "json", response, statusCode, result });
  },
  sendBusinessError(response, statusCode, code, message) {
    calls.push({ kind: "businessError", response, statusCode, code, message });
  },
};

assert.equal(await run("POST", "/api/attachments"), true);
assert.deepEqual(calls, [
  { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, body: dependencies.body },
  { kind: "operator", permissionContext: dependencies.permissionContext, authContext: dependencies.authContext },
  { kind: "create", workspace: dependencies.workspace, body: dependencies.body, operatorId: "U-RESOLVED" },
  { kind: "summary", value: attachment },
  {
    kind: "json",
    response: dependencies.response,
    statusCode: 200,
    result: {
      attachmentId: "ATT-1",
      fileName: "proof.png",
      storageKeyStored: true,
      deduplicated: false,
      duplicateOfAttachmentId: "",
      operationLogId: "LOG-1",
    },
  },
]);

calls.length = 0;
assert.equal(
  await run("POST", "/api/attachments", {
    attachmentCreateCommandService: {
      async createAttachment() {
        return { ok: false, statusCode: 422, errorCode: "VALIDATION_ERROR", message: "file required" };
      },
    },
  }),
  true,
);
assert.deepEqual(calls, [
  { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, body: dependencies.body },
  { kind: "operator", permissionContext: dependencies.permissionContext, authContext: dependencies.authContext },
  { kind: "businessError", response: dependencies.response, statusCode: 422, code: "VALIDATION_ERROR", message: "file required" },
]);

calls.length = 0;
assert.equal(
  await run("POST", "/api/attachments", {
    requireAttachmentCreatePermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);

calls.length = 0;
const binaryContent = Buffer.from("8BPS-print-artwork");
const binaryRequest = Readable.from([binaryContent]);
binaryRequest.headers = {
  "content-length": String(binaryContent.length),
  "content-type": "application/octet-stream",
};
const binaryBody = {
  ownerType: "order_draft_line",
  ownerId: "DRAFT-001:LINE-01",
  fileType: "other",
  purpose: "print_artwork",
  fileName: "approved.psd",
  contentRef: "order-draft-artwork://DRAFT-001/LINE-01/approved.psd",
  mimeType: "application/octet-stream",
  fileSize: binaryContent.length,
};
assert.equal(await run("POST", "/api/attachments/binary", { request: binaryRequest, body: binaryBody }), true);
const binaryCreate = calls.find((call) => call.kind === "create");
assert.equal(binaryCreate.body, binaryBody);
assert.deepEqual(binaryCreate.contentPayload.buffer, binaryContent);
assert.equal(binaryCreate.contentPayload.contentType, "application/octet-stream");

assert.equal(await run("GET", "/api/attachments"), false);
assert.equal(await run("POST", "/api/attachments/ATT-1"), false);

console.log("attachment write routes checks passed: permission-first operator resolution, command ownership, safe summaries, failures, and thin API wiring are covered");

function run(method, pathname, overrides = {}) {
  return handleAttachmentWriteRoutes({
    ...dependencies,
    ...overrides,
    method,
    url: new URL(`http://erp.test${pathname}`),
  });
}
