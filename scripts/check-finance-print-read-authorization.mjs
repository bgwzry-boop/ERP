import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { createRuntimeSession } from "../server/authSeed.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { listenTestServer, closeTestServer, getTestServerBaseUrl, requestJson } from "./helpers/apiIntegrationTestHarness.mjs";

const storageRoot = mkdtempSync(join(tmpdir(), "erp-finance-permissions-"));
const authSecret = "isolated-finance-domain-authorization-secret";
const users = ["office", "finance", "driver"].map((role) => ({ id: `U-P1-${role}`, userId: `U-P1-${role}`, loginName: `p1.${role}`, displayName: `合成${role}`, source: "subaccount_admin_created", roles: [role], defaultRole: role, enabled: true, loginEnabled: true, passwordStatus: "active", passwordHash: "synthetic-hash", sessionVersion: 1 }));
const attachments = [{ attachmentId: "ATT-PAYROLL-P1", ownerType: "payroll_run", ownerId: "PAYROLL-P1", purpose: "payroll_adjustment_evidence", fileName: "合成工资依据.png", status: "uploaded", hasContent: true }];
const server = createApiServer(withLocalRepositoryFixture({
  strictAuth: true, authSecret, applyProductionEnvFile: false,
  runtimeIdentityRepository: { kind: "test_memory", loadState: async () => ({ users }), saveState: async () => ({}) },
  attachmentRepository: { kind: "test_memory", loadState: async () => ({ attachments }), listAttachments: async () => attachments, findAttachmentById: async ({ attachmentId }) => attachments.find((item) => item.attachmentId === attachmentId) },
  attachmentAccessAuditRepositoryOptions: { storageRoot },
  printJobRepositoryOptions: { storageRoot }, printDeviceRepositoryOptions: { storageRoot }, printBatchRepositoryOptions: { storageRoot },
}));
try {
  await server.ready;
  await listenTestServer(server);
  const baseUrl = getTestServerBaseUrl(server);
  const get = (role, path) => requestJson(baseUrl, path, { headers: { authorization: `Bearer ${createRuntimeSession(`U-P1-${role}`, { authSecret, sessionVersion: 1 }).accessToken}` } });
  for (const path of ["/api/statements/customers", "/api/statements/SYNTHETIC", "/api/print-jobs", "/api/print-jobs/SYNTHETIC", "/api/print-batches", "/api/print-devices"]) {
    assert.equal((await get("driver", path)).status, 403, path);
  }
  assert.equal((await get("office", "/api/statements/customers")).status, 200);
  assert.equal((await get("office", "/api/print-jobs")).status, 200);
  const officeList = await get("office", "/api/attachments?ownerType=payroll_run");
  assert.equal(officeList.status, 200);
  assert.deepEqual(officeList.body.items, []);
  for (const suffix of ["content", "access-url", "access-logs"]) {
    const denied = await get("office", `/api/attachments/ATT-PAYROLL-P1/${suffix}`);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, "ATTACHMENT_OWNER_PERMISSION_DENIED");
  }
  const financeList = await get("finance", "/api/attachments?ownerType=payroll_run");
  assert.equal(financeList.status, 200);
  assert.equal(financeList.body.items[0].attachmentId, "ATT-PAYROLL-P1");
  console.log("Strict authenticated HTTP finance/print authorization passed: driver denied, office retains allowed work, payroll evidence restricted to finance.");
} finally {
  await closeTestServer(server, { forceAfterMs: 1000 });
  rmSync(storageRoot, { recursive: true, force: true });
}
