import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { closeTestServer, getTestServerBaseUrl, listenTestServer } from "./helpers/apiIntegrationTestHarness.mjs";
import { exactPaymentFixture, exactPaymentBody } from "./helpers/statementExactPaymentFixture.mjs";

const fixture = exactPaymentFixture(), storage = await mkdtemp(join(tmpdir(), "erp-exact-http-"));
const server = createApiServer(withLocalRepositoryFixture({ runtimeMode: "test", runtimeStorageRoot: storage, applyProductionEnvFile: false,
  seedSource: "synthetic", authMode: "prototype", fixedPreviewUserId: "", authSecret: randomBytes(32).toString("hex"), allowLegacyIdentityHeaders: false,
  allowDefaultSeedUser: false, allowActionPermissionOverride: false,
  coreWorkspaceReadRepository: { kind: "test_memory", loadState: async () => ({ statements: fixture.statements, statementSendRecords: fixture.statementSendRecords,
    statementConfirmationRecords: fixture.statementConfirmationRecords }) },
  paymentRecordRepository: { kind: "test_memory", loadState: async () => ({ paymentRecords: fixture.paymentRecords }) },
  attachmentRepository: { kind: "test_memory", loadState: async () => ({ attachments: fixture.attachments }) },
}));
try {
  await server.ready; await listenTestServer(server);
  const base = getTestServerBaseUrl(server);
  const request = async (path, body, token) => {
    const response = await fetch(base + "/api" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const office = (await request("/auth/prototype-login", { userId: "U-OFFICE-A" })).body.session.accessToken;
  const warehouse = (await request("/auth/prototype-login", { userId: "U-WAREHOUSE-A" })).body.session.accessToken;
  const path = `/statements/${fixture.statements[0].id}/exact-payment-settle`;
  assert.ok([401, 403].includes((await request(path, exactPaymentBody(), undefined)).status));
  assert.equal((await request(path, { ...exactPaymentBody(), actionPermissions: ["statement.exact_payment.settle"] }, warehouse)).status, 403);
  const denied = await request(path, { ...exactPaymentBody(), customerAttachmentId: "ATT-EXACT-PAY" }, office);
  assert.equal(denied.status, 409);
  const body = { ...exactPaymentBody(), operatorId: "U-SPOOFED", confirmedAt: "1999-01-01T00:00:00Z", varianceAmount: -100 };
  const accepted = await request(path, body, office);
  assert.equal(accepted.status, 200, JSON.stringify(accepted));
  assert.equal(accepted.body.writeOffRecord.recordedBy, "U-OFFICE-A");
  assert.equal(accepted.body.writeOffRecord.receiptConfirmation.operatorId, "U-OFFICE-A");
  assert.notEqual(accepted.body.writeOffRecord.receiptConfirmation.confirmedAt, body.confirmedAt);
  assert.deepEqual(await request(path, body, office), accepted);
  const detail = await request(`/statements/${fixture.statements[0].id}`, undefined, office);
  assert.equal(detail.status, 200); assert.equal(detail.body.writeOffRecords.length, 1);
  assert.equal(detail.body.writeOffRecords[0].receiptConfirmation.paymentRecordId, exactPaymentBody().paymentRecordId);
  assert.equal(detail.body.received, 100);
  const changed = await request(path, { ...body, matchNote: "changed" }, office);
  assert.equal(changed.status, 409); assert.equal(changed.body.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal((await request(`/statements/${fixture.statements[0].id}/payments`, { amount: 90, expectedRevision: 2 }, office)).status, 409);
  console.log("PASS signed HTTP exact settlement: authentication, scoped permission, dual evidence, authenticated operator/server clock, exact replay, readable audit and closed-period protection.");
} finally { await closeTestServer(server); await rm(storage, { recursive: true, force: true }); }
