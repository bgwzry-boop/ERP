import assert from "node:assert/strict";
import { handleAttachmentWriteRoutes } from "../server/routes/attachmentWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { purpose: "delivery_watermark_photo" },
  permissionContext: { actionPermissions: [] },
  operatorId: "U-DRIVER-A",
  requireAttachmentCreatePermission(response, permissionContext, body) {
    calls.push({ kind: "permission", response, permissionContext, body });
    return true;
  },
  async createAttachmentRoute(input) {
    calls.push({ kind: "create", ...input });
  },
};

assert.equal(await handleAttachmentWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/attachments") }), true);
assert.deepEqual(calls, [
  { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, body: dependencies.body },
  {
    kind: "create",
    response: dependencies.response,
    workspace: dependencies.workspace,
    body: dependencies.body,
    operatorId: dependencies.operatorId,
  },
]);
calls.length = 0;
assert.equal(
  await handleAttachmentWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL("http://erp.test/api/attachments"),
    requireAttachmentCreatePermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
assert.equal(await handleAttachmentWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/attachments") }), false);
assert.equal(await handleAttachmentWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/attachments/ATT-1") }), false);

console.log("attachment write routes checks passed");
