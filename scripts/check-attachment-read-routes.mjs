import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleAttachmentReadRoutes } from "../server/routes/attachmentReadRoutes.mjs";

const calls = [];
const workspace = createWorkspace();
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
  sendJson(response, statusCode, result) {
    calls.push({ kind: "json", response, statusCode, result });
  },
  sendNotFound(response, code) {
    calls.push({ kind: "notFound", response, code });
  },
  sendBusinessError(response, statusCode, code, message) {
    calls.push({ kind: "error", response, statusCode, code, message });
  },
  sendInlineFile(response, statusCode, body, options) {
    calls.push({ kind: "inlineFile", response, statusCode, body, options });
  },
  paginate(items, searchParams) {
    return { items, page: Number(searchParams.get("page") ?? 1), total: items.length };
  },
  attachmentFileAccessService: {
    async listAttachments(input) {
      calls.push({ kind: "list", ...input });
      return { items: [{ attachmentId: "ATT-1", storageKeyStored: true }] };
    },
    async createAccessUrl(input) {
      calls.push({ kind: "accessUrl", ...input });
      if (input.attachmentId === "MISSING") return { notFound: true, code: "ATTACHMENT_NOT_FOUND" };
      return { response: { attachmentId: input.attachmentId, accessUrl: "/signed" } };
    },
    async listAccessLogs(input) {
      calls.push({ kind: "accessLogs", ...input });
      return { response: { items: [{ accessLogId: "AL-1" }] } };
    },
    async getContent(input) {
      calls.push({ kind: "content", ...input });
      if (input.attachmentId === "MISSING") return { notFound: true, code: "ATTACHMENT_NOT_FOUND" };
      return { file: { body: Buffer.from("image"), options: { contentType: "image/png", fileName: "proof.png" } } };
    },
  },
  async runAttachmentStorageDiagnostics(storage) {
    calls.push({ kind: "storage", storage });
    return { status: "ready" };
  },
  async buildAttachmentV1Readiness(input) {
    calls.push({ kind: "readiness", ...input });
    return { status: "blocked" };
  },
};

await expectList();
await expectStorageDiagnostics();
await expectReadiness();
await expectAccessUrl();
await expectAccessLogs();
await expectContentPermission();
await expectSignedContent();
await expectInvalidSignedContent();
await expectMissingAccessUrl();
await expectMissingContent();

calls.length = 0;
assert.equal(
  await run("/api/attachments", {
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
assert.equal(await run("/api/attachments/ATT-1"), false);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
for (const removedWrapper of [
  "listAttachmentsRoute",
  "getAttachmentStorageDiagnosticsRoute",
  "getAttachmentV1ReadinessRoute",
  "createAttachmentAccessUrlRoute",
  "listAttachmentAccessLogsRoute",
  "getAttachmentContentRoute",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`async function ${removedWrapper}\\b`));
}
assert.match(apiSource, /handleAttachmentReadRoutes\([\s\S]*attachmentFileAccessService,[\s\S]*runAttachmentStorageDiagnostics,[\s\S]*buildAttachmentV1Readiness,/);

console.log("attachment read routes checks passed: list redaction, diagnostics, readiness, signed/permission content, access audit, 404, and thin API wiring are covered");

async function expectList() {
  calls.length = 0;
  assert.equal(await run("/api/attachments?ownerType=statement&ownerId=ST-1&purpose=payment_screenshot&fileType=image&keyword=proof&page=2"), true);
  assert.deepEqual(calls, [
    permissionCall(),
    {
      kind: "list",
      workspace,
      filters: { ownerType: "statement", ownerId: "ST-1", purpose: "payment_screenshot", fileType: "image", keyword: "proof" },
    },
    {
      kind: "json",
      response: dependencies.response,
      statusCode: 200,
      result: { items: [{ attachmentId: "ATT-1", storageKeyStored: true }], page: 2, total: 1 },
    },
  ]);
}

async function expectStorageDiagnostics() {
  calls.length = 0;
  assert.equal(await run("/api/attachments/storage-diagnostics"), true);
  assert.deepEqual(calls, [
    permissionCall(),
    { kind: "storage", storage: workspace.attachmentObjectStorage },
    { kind: "json", response: dependencies.response, statusCode: 200, result: { status: "ready" } },
  ]);
}

async function expectReadiness() {
  calls.length = 0;
  assert.equal(await run("/api/attachments/v1-readiness"), true);
  assert.deepEqual(calls, [
    permissionCall(),
    operatorCall(),
    { kind: "readiness", workspace, operatorId: "U-RESOLVED" },
    { kind: "json", response: dependencies.response, statusCode: 200, result: { status: "blocked" } },
  ]);
}

async function expectAccessUrl() {
  calls.length = 0;
  assert.equal(await run("/api/attachments/ATT-1/access-url?ttlSeconds=120"), true);
  assert.deepEqual(calls, [
    permissionCall(),
    { kind: "accessUrl", workspace, attachmentId: "ATT-1", ttlSeconds: "120", operatorId: "U-OFFICE-A" },
    { kind: "json", response: dependencies.response, statusCode: 200, result: { attachmentId: "ATT-1", accessUrl: "/signed" } },
  ]);
}

async function expectAccessLogs() {
  calls.length = 0;
  assert.equal(await run("/api/attachments/ATT-1/access-logs?limit=20"), true);
  assert.deepEqual(calls, [
    permissionCall(),
    { kind: "accessLogs", workspace, attachmentId: "ATT-1", limit: "20" },
    { kind: "json", response: dependencies.response, statusCode: 200, result: { items: [{ accessLogId: "AL-1" }] } },
  ]);
}

async function expectContentPermission() {
  calls.length = 0;
  assert.equal(await run("/api/attachments/ATT-1/content"), true);
  assert.deepEqual(calls, [
    permissionCall(),
    { kind: "content", workspace, attachmentId: "ATT-1", operatorId: "U-OFFICE-A", accessMode: "permission" },
    inlineFileCall(),
  ]);
}

async function expectSignedContent() {
  calls.length = 0;
  const signedWorkspace = createWorkspace({ valid: true, present: true });
  assert.equal(await run("/api/attachments/ATT-1/content?accessToken=signed&expiresAt=soon", { workspace: signedWorkspace }), true);
  assert.deepEqual(calls, [
    { kind: "content", workspace: signedWorkspace, attachmentId: "ATT-1", operatorId: "U-OFFICE-A", accessMode: "signed_url" },
    inlineFileCall(),
  ]);
}

async function expectInvalidSignedContent() {
  calls.length = 0;
  const invalidWorkspace = createWorkspace({ valid: false, present: true, message: "expired" });
  assert.equal(await run("/api/attachments/ATT-1/content?accessToken=bad", { workspace: invalidWorkspace }), true);
  assert.deepEqual(calls, [
    { kind: "error", response: dependencies.response, statusCode: 403, code: "ATTACHMENT_ACCESS_TOKEN_INVALID", message: "expired" },
  ]);
}

async function expectMissingAccessUrl() {
  calls.length = 0;
  assert.equal(await run("/api/attachments/MISSING/access-url"), true);
  assert.deepEqual(calls, [
    permissionCall(),
    { kind: "accessUrl", workspace, attachmentId: "MISSING", ttlSeconds: null, operatorId: "U-OFFICE-A" },
    { kind: "notFound", response: dependencies.response, code: "ATTACHMENT_NOT_FOUND" },
  ]);
}

async function expectMissingContent() {
  calls.length = 0;
  assert.equal(await run("/api/attachments/MISSING/content"), true);
  assert.deepEqual(calls, [
    permissionCall(),
    { kind: "content", workspace, attachmentId: "MISSING", operatorId: "U-OFFICE-A", accessMode: "permission" },
    { kind: "notFound", response: dependencies.response, code: "ATTACHMENT_NOT_FOUND" },
  ]);
}

function createWorkspace({ valid = false, present = false, message = "" } = {}) {
  return {
    attachmentObjectStorage: {
      validateAccessToken() {
        return { valid, present, message };
      },
    },
  };
}

function run(pathname, overrides = {}) {
  return handleAttachmentReadRoutes({ ...dependencies, ...overrides, url: new URL(`http://erp.test${pathname}`) });
}

function permissionCall() {
  return { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission: "attachment.view" };
}

function operatorCall() {
  return { kind: "operator", permissionContext: dependencies.permissionContext, authContext: dependencies.authContext, fallback: "U-OFFICE-A" };
}

function inlineFileCall() {
  return { kind: "inlineFile", response: dependencies.response, statusCode: 200, body: Buffer.from("image"), options: { contentType: "image/png", fileName: "proof.png" } };
}
