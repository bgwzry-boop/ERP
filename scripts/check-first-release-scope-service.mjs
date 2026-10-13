import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import {
  RAW_MATERIAL_FIRST_RELEASE_SCOPE,
  buildFirstReleaseBlockedResponse,
  evaluateFirstReleaseWrite,
  resolveFirstReleaseScope,
} from "../server/services/firstReleaseScopeService.mjs";
import {
  closeTestServer,
  getTestServerBaseUrl,
  listenTestServer,
  requestJson,
} from "./helpers/apiIntegrationTestHarness.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";

const checkStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "first-release-scope");
rmSync(checkStorageRoot, { recursive: true, force: true });

assert.equal(resolveFirstReleaseScope({}, {}), null);
assert.throws(
  () => resolveFirstReleaseScope({ runtimeMode: "production" }, {}),
  (error) => error?.code === "FIRST_RELEASE_SCOPE_REQUIRED" && /ERP_FIRST_RELEASE_SCOPE=raw_material/.test(error.message),
);
assert.throws(
  () => resolveFirstReleaseScope(
    { runtimeMode: "production" },
    { ERP_RAW_MATERIAL_FIRST_RELEASE: "true" },
  ),
  (error) => error?.code === "FIRST_RELEASE_SCOPE_REQUIRED",
  "production must not silently rely on the retired compatibility switch",
);
assert.throws(
  () => resolveFirstReleaseScope(
    { runtimeMode: "production" },
    { ERP_FIRST_RELEASE_SCOPE: "false" },
  ),
  (error) => error?.code === "FIRST_RELEASE_SCOPE_REQUIRED",
);
assert.equal(
  resolveFirstReleaseScope(
    { runtimeMode: "production" },
    { ERP_FIRST_RELEASE_SCOPE: "raw_material" },
  ),
  RAW_MATERIAL_FIRST_RELEASE_SCOPE,
);
for (const alias of ["raw_material", "raw_material_only", "raw-material", true]) {
  assert.equal(resolveFirstReleaseScope({ firstReleaseScope: alias }, {}), RAW_MATERIAL_FIRST_RELEASE_SCOPE);
}
assert.equal(
  resolveFirstReleaseScope({}, { ERP_FIRST_RELEASE_SCOPE: "raw_material" }),
  RAW_MATERIAL_FIRST_RELEASE_SCOPE,
);
assert.equal(
  resolveFirstReleaseScope({}, { ERP_RAW_MATERIAL_FIRST_RELEASE: "true" }),
  RAW_MATERIAL_FIRST_RELEASE_SCOPE,
);
assert.equal(
  resolveFirstReleaseScope(
    { firstReleaseScope: false },
    { ERP_FIRST_RELEASE_SCOPE: "raw_material" },
  ),
  null,
  "explicit server options must take precedence over environment wiring",
);
assert.throws(
  () => resolveFirstReleaseScope({}, { ERP_FIRST_RELEASE_SCOPE: "raw_material_and_orders" }),
  (error) => error?.code === "FIRST_RELEASE_SCOPE_INVALID",
);

const allowedRoutes = [
  "/api/master-data/raw-material-supplier-colors",
  "/api/raw-material-inbounds/recognize-delivery-note",
  "/api/raw-material-inbounds/RMI-1/review",
  "/api/raw-material-inbounds/RMI-1/reparse-ocr",
  "/api/raw-material-inbounds/RMI-1/reparse_ocr",
  "/api/raw-material-inbounds/RMI-1/void-draft",
  "/api/raw-material-inbounds/RMI-1/void_draft",
  "/api/raw-material-inbounds/RMI-1/print-labels",
  "/api/raw-material-inbounds/RMI-1/print_labels",
  "/api/raw-material-inbounds/RMI-1/attach-confirm",
  "/api/raw-material-inbounds/RMI-1/attach_confirm",
  "/api/raw-material-inbounds/RMI-1/void-label",
  "/api/raw-material-inbounds/RMI-1/void_label",
  "/api/raw-material-inbounds/RMI-1/reprint-label",
  "/api/raw-material-inbounds/RMI-1/reprint_label",
  "/api/raw-material-inbounds/RMI-1/stage-supplier-return",
  "/api/raw-material-inbounds/RMI-1/stage_supplier_return",
  "/api/raw-material-inbounds/RMI-1/confirm-supplier-return-shipment",
  "/api/raw-material-inbounds/RMI-1/confirm_supplier_return_shipment",
  "/api/raw-material-inbounds/RMI-1/issue-to-machine",
  "/api/raw-material-inbounds/RMI-1/issue_to_machine",
  "/api/raw-material-inbounds/RMI-1/exception",
  "/api/raw-material-supplier-statement-reviews",
  "/api/raw-material-supplier-statement-reviews/RMSSR-1/confirm-review",
  "/api/raw-material-supplier-statement-reviews/RMSSR-1/confirm-statement",
];
for (const pathname of allowedRoutes) {
  assert.equal(evaluate(pathname).allowed, true, `first-release write should allow ${pathname}`);
}
for (const pathname of [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/system/v1/readiness/refresh",
  "/api/master-data/personnel/registration-reviews/U-PHONE-1/assign",
]) {
  assert.equal(evaluate(pathname).allowed, true, `operational write should allow ${pathname}`);
}
assert.equal(evaluate("/api/order-drafts", "GET").allowed, true, "GET reads must remain available");
assert.equal(evaluate("/api/order-drafts", "OPTIONS").allowed, true, "OPTIONS must remain available");
assert.equal(evaluateFirstReleaseWrite({
  scope: RAW_MATERIAL_FIRST_RELEASE_SCOPE,
  method: "POST",
  pathname: "/api/attachments/binary",
  body: { ownerType: "raw_material_inbound_capture", purpose: "raw_material_delivery_note" },
}).allowed, true, "raw-material source binaries must be accepted during first release");
assert.equal(evaluateFirstReleaseWrite({
  scope: RAW_MATERIAL_FIRST_RELEASE_SCOPE,
  method: "POST",
  pathname: "/api/attachments/binary",
  body: { ownerType: "production_task", purpose: "finished_goods_photo" },
}).allowed, false, "unrelated binary attachments must remain blocked during first release");

const blockedRoutes = [
  "/api/master-data/import-confirmation-plans",
  "/api/master-data/raw-material-supplier-colors/unknown",
  "/api/order-drafts/recognize",
  "/api/production-tasks/PT-1/complete",
  "/api/raw-material-purchase-requests",
  "/api/raw-material-inbounds/RMI-1/confirm-consumption",
  "/api/raw-material-inbounds/RMI-1/confirm_consumption",
  "/api/raw-material-inbounds/RMI-1/return-leftover",
  "/api/raw-material-inbounds/RMI-1/review-leftover",
  "/api/raw-material-inbounds/RMI-1/generate-cost-draft",
  "/api/raw-material-inbounds/RMI-1/confirm-cost-draft",
  "/api/raw-material-inbounds/RMI-1/calibrate-loss",
  "/api/raw-material-inbounds/RMI-1/generate-margin-snapshot",
  "/api/raw-material-inbounds/RMI-1/review-margin-snapshot",
  "/api/raw-material-supplier-statement-reviews/RMSSR-1/generate-payable",
  "/api/raw-material-supplier-statement-reviews/RMSSR-1/confirm-payment",
];
for (const pathname of blockedRoutes) {
  assert.equal(evaluate(pathname).allowed, false, `first-release write should block ${pathname}`);
}
assert.equal(evaluate("/api/raw-material-inbounds/RMI-1/review", "PATCH").allowed, false);
assert.equal(evaluate("/api/master-data/raw-material-supplier-colors", "PATCH").allowed, false);

assert.deepEqual(buildFirstReleaseBlockedResponse(RAW_MATERIAL_FIRST_RELEASE_SCOPE), {
  code: "FIRST_RELEASE_SCOPE_BLOCKED",
  message: "当前正式系统处于原材料首发模式，此业务写接口暂未开放。",
  releaseScope: RAW_MATERIAL_FIRST_RELEASE_SCOPE,
  allowedBusinessDomain: "raw_material",
});

await checkApiBoundary();
await checkReceiptMaintenanceApi();
await checkAuthenticationPrecedence();

rmSync(checkStorageRoot, { recursive: true, force: true });
console.log("First-release scope checks passed: resolution, write allowlist, auth precedence, health projection, no-mutation blocking, and response redaction are covered.");

function evaluate(pathname, method = "POST") {
  return evaluateFirstReleaseWrite({
    scope: RAW_MATERIAL_FIRST_RELEASE_SCOPE,
    method,
    pathname,
  });
}

async function checkApiBoundary() {
  const server = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true,
    firstReleaseScope: "raw_material",
    runtimeMode: "test",
    runtimeStorageRoot: join(checkStorageRoot, "api"),
    applyProductionEnvFile: false,
  }));
  await listenTestServer(server);
  const baseUrl = getTestServerBaseUrl(server);
  const officeHeaders = { "x-erp-user-id": "U-OFFICE-A" };
  const managerHeaders = { "x-erp-user-id": "U-MANAGER-A" };

  try {
    const health = await requestJson(baseUrl, "/api/health", { expectedStatus: 200 });
    assert.deepEqual(health.body.firstReleaseScope, {
      enabled: true,
      scope: RAW_MATERIAL_FIRST_RELEASE_SCOPE,
      writePolicy: "allowlist",
      allowedBusinessDomains: ["raw_material"],
    });

    const draftsBefore = await requestJson(baseUrl, "/api/order-drafts?pageSize=200", {
      headers: officeHeaders,
      expectedStatus: 200,
    });
    const inboundsBefore = await requestJson(baseUrl, "/api/raw-material-inbounds?pageSize=200", {
      headers: officeHeaders,
      expectedStatus: 200,
    });

    const blockedOrder = await requestJson(baseUrl, "/api/order-drafts/recognize", {
      method: "POST",
      headers: { ...officeHeaders, "content-type": "application/json" },
      body: '{"sourceText":"SENSITIVE-FIRST-RELEASE-BODY"',
      expectedStatus: 403,
    });
    assert.deepEqual(blockedOrder.body, buildFirstReleaseBlockedResponse(RAW_MATERIAL_FIRST_RELEASE_SCOPE));

    for (const pathname of [
      "/api/raw-material-purchase-requests",
      "/api/raw-material-inbounds/RMI-0704-001/generate-cost-draft",
      "/api/raw-material-supplier-statement-reviews/RMSSR-1/confirm-payment",
    ]) {
      const blocked = await requestJson(baseUrl, pathname, {
        method: "POST",
        headers: { ...managerHeaders, "content-type": "application/json" },
        body: JSON.stringify({ secret: "SENSITIVE-FIRST-RELEASE-BODY" }),
        expectedStatus: 403,
      });
      assert.equal(blocked.body.code, "FIRST_RELEASE_SCOPE_BLOCKED");
      assert.equal(JSON.stringify(blocked.body).includes("SENSITIVE-FIRST-RELEASE-BODY"), false);
      assert.equal(JSON.stringify(blocked.body).includes(pathname), false);
    }

    const prototypeLogin = await requestJson(baseUrl, "/api/auth/prototype-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "U-MANAGER-A" }),
      expectedStatus: 200,
    });
    assert.equal(prototypeLogin.body.permissions.user.userId, "U-MANAGER-A");
    const alternatePreviewLogin = await requestJson(baseUrl, "/api/auth/prototype-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "U-OFFICE-A" }),
      expectedStatus: 403,
    });
    assert.equal(alternatePreviewLogin.body.code, "AUTH_PREVIEW_IDENTITY_FIXED");

    const ocrValidation = await requestJson(baseUrl, "/api/raw-material-inbounds/recognize-delivery-note", {
      method: "POST",
      headers: { ...officeHeaders, "content-type": "application/json" },
      body: JSON.stringify({}),
      expectedStatus: 422,
    });
    assert.equal(ocrValidation.body.code, "RAW_MATERIAL_DELIVERY_NOTE_PAGE_REQUIRED");

    const captureQuery = new URLSearchParams({
      ownerType: "raw_material_inbound_capture",
      ownerId: "RMCAP-FIRST-RELEASE-CHECK",
      fileType: "image",
      purpose: "raw_material_delivery_note",
      fileName: "送货单.jpg",
      contentRef: "raw-material-capture:RMCAP-FIRST-RELEASE-CHECK:page:1",
      mimeType: "image/jpeg",
      fileSize: "4",
      metadata: JSON.stringify({ pageNumber: 1, pageCount: 1 }),
    });
    const captureResponse = await fetch(`${baseUrl}/api/attachments/binary?${captureQuery.toString()}`, {
      method: "POST",
      headers: { ...officeHeaders, "content-type": "image/jpeg" },
      body: Buffer.from("test"),
    });
    assert.equal(captureResponse.status, 200, await captureResponse.text());

    const blockedAttachment = await fetch(`${baseUrl}/api/attachments/binary?${new URLSearchParams({
      ownerType: "production_task",
      ownerId: "PT-BLOCKED",
      purpose: "finished_goods_photo",
      fileName: "blocked.jpg",
      contentRef: "blocked",
      mimeType: "image/jpeg",
      fileSize: "4",
    }).toString()}`, {
      method: "POST",
      headers: { ...managerHeaders, "content-type": "image/jpeg" },
      body: Buffer.from("test"),
    });
    assert.equal(blockedAttachment.status, 403);
    assert.equal((await blockedAttachment.json()).code, "FIRST_RELEASE_SCOPE_BLOCKED");

    const draftsAfter = await requestJson(baseUrl, "/api/order-drafts?pageSize=200", {
      headers: officeHeaders,
      expectedStatus: 200,
    });
    const inboundsAfter = await requestJson(baseUrl, "/api/raw-material-inbounds?pageSize=200", {
      headers: officeHeaders,
      expectedStatus: 200,
    });
    assert.deepEqual(draftsAfter.body, draftsBefore.body, "blocked order write must not change order drafts");
    assert.deepEqual(inboundsAfter.body, inboundsBefore.body, "blocked writes must not change raw-material state");
  } finally {
    await closeTestServer(server, { forceAfterMs: 2_000 });
  }
}

async function checkReceiptMaintenanceApi() {
  const server = createApiServer(withLocalRepositoryFixture({
    firstReleaseScope: "raw_material",
    runtimeMode: "test",
    runtimeStorageRoot: join(checkStorageRoot, "receipt-maintenance"),
    applyProductionEnvFile: false,
  }));
  await listenTestServer(server);
  const baseUrl = getTestServerBaseUrl(server);
  const managerHeaders = { "x-erp-user-id": "U-MANAGER-A", "content-type": "application/json" };
  const mappingBody = {
    supplierName: "首发测试供应商",
    supplierColor: "票面黑",
    factoryColor: "黑色",
    reason: "首发颜色规则回归夹具",
    operatorId: "U-SPOOFED",
  };
  try {
    const deniedMapping = await requestJson(baseUrl, "/api/master-data/raw-material-supplier-colors", {
      method: "POST",
      headers: { "x-erp-user-id": "U-DRIVER-A", "content-type": "application/json" },
      body: JSON.stringify(mappingBody),
      expectedStatus: 403,
    });
    assert.equal(deniedMapping.body.requiredPermission, "master_data.raw_material_color.manage");

    const savedMapping = await requestJson(baseUrl, "/api/master-data/raw-material-supplier-colors", {
      method: "POST", headers: managerHeaders, body: JSON.stringify(mappingBody), expectedStatus: 200,
    });
    assert.equal(savedMapping.body.mapping.factoryColor, "黑色");
    assert.ok(savedMapping.body.operationLogId, "first-release mapping still requires an audited write");
    const mappings = await requestJson(baseUrl, "/api/master-data/raw-material-supplier-colors", {
      headers: managerHeaders, expectedStatus: 200,
    });
    assert.ok(mappings.body.items.some((item) => item.id === savedMapping.body.mapping.id));

    const reparse = await requestJson(baseUrl, "/api/raw-material-inbounds/RMI-260704-001/reparse-ocr", {
      method: "POST", headers: managerHeaders,
      body: JSON.stringify({ expectedRevision: 1, documentDirectionHint: "supplier_return", supplierNameHint: "首发测试供应商" }),
      expectedStatus: 409,
    });
    assert.equal(reparse.body.code, "RAW_MATERIAL_OCR_REPARSE_NOT_AVAILABLE",
      "the original no-table fixture must reach the reparse preparation guard instead of the scope gate");

    const missingRevision = await requestJson(baseUrl, "/api/raw-material-inbounds/RMI-0704-001/void-draft", {
      method: "POST", headers: managerHeaders, body: JSON.stringify({ reason: "首发作废回归夹具" }), expectedStatus: 422,
    });
    assert.equal(missingRevision.body.code, "EXPECTED_REVISION_REQUIRED");
    const staleRevision = await requestJson(baseUrl, "/api/raw-material-inbounds/RMI-0704-001/void-draft", {
      method: "POST", headers: managerHeaders, body: JSON.stringify({ expectedRevision: 2, reason: "首发作废回归夹具" }), expectedStatus: 409,
    });
    assert.equal(staleRevision.body.code, "BUSINESS_WRITE_CONFLICT");
    const voided = await requestJson(baseUrl, "/api/raw-material-inbounds/RMI-0704-001/void-draft", {
      method: "POST", headers: managerHeaders, body: JSON.stringify({ expectedRevision: 1, reason: "首发作废回归夹具" }), expectedStatus: 200,
    });
    assert.equal(voided.body.inbound.status, "已作废");
    assert.equal(voided.body.inbound.voidedByUserId, "U-MANAGER-A");
    assert.ok(voided.body.operationLogId);
    const inbounds = await requestJson(baseUrl, "/api/raw-material-inbounds?pageSize=200", {
      headers: managerHeaders, expectedStatus: 200,
    });
    assert.equal(inbounds.body.items.some((item) => item.id === "RMI-0704-001"), false,
      "voided drafts must remain outside the operational inbound view");
  } finally {
    await closeTestServer(server, { forceAfterMs: 2_000 });
  }
}

async function checkAuthenticationPrecedence() {
  const server = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true,
    firstReleaseScope: "raw_material",
    runtimeMode: "test",
    runtimeStorageRoot: join(checkStorageRoot, "strict-api"),
    strictAuth: true,
    authSecret: "first-release-auth-precedence-secret",
    applyProductionEnvFile: false,
  }));
  await listenTestServer(server);
  try {
    for (const pathname of [
      "/api/order-drafts/recognize",
      "/api/master-data/raw-material-supplier-colors",
      "/api/raw-material-inbounds/RMI-1/void-draft",
      "/api/raw-material-inbounds/RMI-1/reparse-ocr",
    ]) {
      const response = await requestJson(getTestServerBaseUrl(server), pathname, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"sourceText":"body-must-not-be-read"',
        expectedStatus: 401,
      });
      assert.equal(response.body.code, "AUTH_SESSION_REQUIRED");
    }
  } finally {
    await closeTestServer(server, { forceAfterMs: 2_000 });
  }
}
