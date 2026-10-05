import assert from "node:assert/strict";
import http from "node:http";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { createRuntimeSession, createSeedSession, hashRuntimeUserPassword } from "../server/authSeed.mjs";
import { createApiServer } from "../server/apiServer.mjs";
import {
  closeTestServer as close,
  getTestServerBaseUrl as serverUrl,
  listenTestServer as listen,
  requestJson,
} from "./helpers/apiIntegrationTestHarness.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";

const checkStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "api-security-boundary");
const authSecret = "api-security-boundary-test-secret";
const runtimeOfficePassword = "runtime-office-password-001";
const runtimeUsers = [
  {
    userId: "U-RUNTIME-OFFICE",
    loginName: "runtime.office",
    displayName: "运行时办公室测试账号",
    defaultRole: "office",
    department: "office",
    enabled: true,
    roles: ["office"],
    loginEnabled: true,
    passwordHash: hashRuntimeUserPassword(runtimeOfficePassword, { userId: "U-RUNTIME-OFFICE", authSecret }),
    sessionVersion: 1,
  },
  {
    userId: "U-RUNTIME-FINANCE",
    loginName: "runtime.finance",
    displayName: "运行时财务测试账号",
    defaultRole: "finance",
    department: "finance",
    enabled: true,
    roles: ["finance"],
    loginEnabled: true,
    passwordHash: "runtime-password-test",
    sessionVersion: 1,
  },
];
const runtimeIdentityRepository = {
  kind: "test_memory",
  loadState: async () => ({ users: runtimeUsers, revokedSeedSessions: [] }),
  saveState: async () => ({ savedUserCount: runtimeUsers.length, revokedSessionCount: 0 }),
};
process.env.ERP_LOCAL_STORAGE_DIR = checkStorageRoot;
rmSync(checkStorageRoot, { recursive: true, force: true });

assert.throws(
  () => createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true, strictAuth: true, authSecret: "", applyProductionEnvFile: false })),
  /ERP_AUTH_SECRET/,
  "strict mode must refuse to start without an authentication secret",
);

let strictRuntimeServer = null;
let strictServer = null;

try {
  strictRuntimeServer = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true,
    strictAuth: true,
    authSecret,
    allowSeedUsers: true,
    allowLegacyIdentityHeaders: true,
    allowActionPermissionOverride: true,
    allowDefaultSeedUser: true,
    corsAllowedOrigins: ["https://erp.example.test"],
    maxJsonBodyBytes: 256,
    runtimeIdentityRepository,
    applyProductionEnvFile: false,
  }));
  await listen(strictRuntimeServer);
  const baseUrl = serverUrl(strictRuntimeServer);
  const runtimeOfficeSession = createRuntimeSession("U-RUNTIME-OFFICE", { authSecret, sessionVersion: 1 });
  const authorization = { authorization: `Bearer ${runtimeOfficeSession.accessToken}` };
  assert(runtimeOfficeSession.accessToken.startsWith("erp-runtime-session-v1."));
  assert.equal(runtimeOfficeSession.sessionType, "runtime");

  const health = await requestJson(baseUrl, "/api/health");
  assert.equal(health.status, 200);

  const anonymous = await requestJson(baseUrl, "/api/permissions/effective");
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.code, "AUTH_SESSION_REQUIRED");

  const formalLogin = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginName: "runtime.office", password: runtimeOfficePassword }),
  });
  assert.equal(formalLogin.status, 200);
  assert(formalLogin.body.session.accessToken.startsWith("erp-runtime-session-v1."));
  assert.equal(formalLogin.body.session.sessionType, "runtime");
  assert.equal(formalLogin.body.permissions.user.userId, "U-RUNTIME-OFFICE");
  const formalSessionRead = await requestJson(baseUrl, "/api/auth/me", {
    headers: { authorization: `Bearer ${formalLogin.body.session.accessToken}` },
  });
  assert.equal(formalSessionRead.status, 200);
  assert.equal(formalSessionRead.body.permissions.user.userId, "U-RUNTIME-OFFICE");

  const forgedHeaders = await requestJson(baseUrl, "/api/permissions/effective", {
    headers: {
      "x-erp-user-id": "U-OFFICE-A",
      "x-erp-action-permissions": "system.v1_go_live",
    },
  });
  assert.equal(forgedHeaders.status, 401);

  const seedSession = createSeedSession("U-OFFICE-A", { authSecret });
  const explicitSeed = await requestJson(baseUrl, "/api/permissions/effective", {
    headers: { authorization: `Bearer ${seedSession.accessToken}` },
  });
  assert.equal(explicitSeed.status, 401);
  assert.equal(explicitSeed.body.code, "AUTH_SEED_USER_DISABLED");

  const legacyRuntimeSeedSession = createSeedSession("U-RUNTIME-OFFICE", { authSecret, sessionVersion: 1 });
  const rejectedLegacyRuntimeSeedSession = await requestJson(baseUrl, "/api/permissions/effective", {
    headers: { authorization: `Bearer ${legacyRuntimeSeedSession.accessToken}` },
  });
  assert.equal(rejectedLegacyRuntimeSeedSession.status, 401);
  assert.equal(rejectedLegacyRuntimeSeedSession.body.code, "AUTH_USER_DISABLED");

  const allowedPreflight = await requestJson(baseUrl, "/api/permissions/effective", {
    method: "OPTIONS",
    headers: {
      origin: "https://erp.example.test",
      "access-control-request-method": "GET",
      "access-control-request-headers": "authorization, content-type, idempotency-key",
    },
  });
  assert.equal(allowedPreflight.status, 204);
  assert.equal(allowedPreflight.headers.get("access-control-allow-origin"), "https://erp.example.test");
  assert.equal(
    allowedPreflight.headers.get("access-control-allow-headers"),
    "content-type, authorization, idempotency-key",
  );

  const deniedPreflight = await requestJson(baseUrl, "/api/permissions/effective", {
    method: "OPTIONS",
    headers: { origin: "https://untrusted.example.test", "access-control-request-method": "GET" },
  });
  assert.equal(deniedPreflight.status, 403);
  assert.equal(deniedPreflight.headers.get("access-control-allow-origin"), null);

  const authenticated = await requestJson(baseUrl, "/api/permissions/effective", { headers: authorization });
  assert.equal(authenticated.status, 200);
  assert.equal(authenticated.body.user?.userId, "U-RUNTIME-OFFICE");

  const safeWorkspaceProjection = await requestJson(baseUrl, "/api/office/workspace", {
    headers: authorization,
  });
  assert.equal(safeWorkspaceProjection.status, 200);
  assert.equal(safeWorkspaceProjection.body.projectionVersion, "office-workspace-legacy-v1");
  assert.equal(safeWorkspaceProjection.body.users, undefined);
  assert.equal(safeWorkspaceProjection.body.securityPolicy, undefined);
  assert.equal(safeWorkspaceProjection.body.runtimeIdentityRepository, undefined);
  const serializedWorkspaceProjection = JSON.stringify(safeWorkspaceProjection.body);
  assert.equal(serializedWorkspaceProjection.includes(authSecret), false);
  assert.equal(serializedWorkspaceProjection.includes(runtimeUsers[0].passwordHash), false);

  const financeSession = createRuntimeSession("U-RUNTIME-FINANCE", { authSecret, sessionVersion: 1 });
  const forgedPermission = await requestJson(baseUrl, "/api/order-drafts/recognize", {
    method: "POST",
    headers: {
      authorization: `Bearer ${financeSession.accessToken}`,
      "content-type": "application/json",
      "x-erp-action-permissions": "order.draft.recognize",
    },
    body: JSON.stringify({ sourceText: "测试客户 30*40 100个" }),
  });
  assert.equal(forgedPermission.status, 403);
  assert.equal(forgedPermission.body.code, "PERMISSION_DENIED");

  const tooLarge = await requestChunkedJson(baseUrl, "/api/order-drafts/recognize", {
    headers: { ...authorization, "content-type": "application/json" },
    chunks: ['{"sourceText":"', "x".repeat(512), '"}'],
  });
  assert.equal(tooLarge.status, 413);
  assert.equal(tooLarge.body.code, "REQUEST_BODY_TOO_LARGE");

  strictServer = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true,
    strictAuth: true,
    authSecret,
    corsAllowedOrigins: ["https://erp.example.test"],
    applyProductionEnvFile: false,
  }));
  await listen(strictServer);
  const strictBaseUrl = serverUrl(strictServer);
  const seedLogin = await requestJson(strictBaseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "U-OFFICE-A", password: "invalid-seed-credential" }),
  });
  assert.equal(seedLogin.status, 403);
  assert.equal(seedLogin.body.code, "AUTH_SEED_LOGIN_DISABLED");

  const prototypeSeedLogin = await requestJson(strictBaseUrl, "/api/auth/prototype-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "U-OFFICE-A" }),
  });
  assert.equal(prototypeSeedLogin.status, 401);
  assert.equal(prototypeSeedLogin.body.code, "AUTH_SESSION_REQUIRED");

  const strictSeedRequest = await requestJson(strictBaseUrl, "/api/permissions/effective", {
    headers: { authorization: `Bearer ${seedSession.accessToken}` },
  });
  assert.equal(strictSeedRequest.status, 401);
  assert.equal(strictSeedRequest.body.code, "AUTH_SEED_USER_DISABLED");

  process.stdout.write("API security-boundary checks passed.\n");
} finally {
  await close(strictServer);
  await close(strictRuntimeServer);
  rmSync(checkStorageRoot, { recursive: true, force: true });
}

function requestChunkedJson(baseUrl, pathname, options = {}) {
  const url = new URL(`${baseUrl}${pathname}`);
  return new Promise((resolvePromise, reject) => {
    const request = http.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: options.headers,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolvePromise({
            status: response.statusCode,
            headers: new Headers(response.headers),
            body: text ? JSON.parse(text) : {},
          });
        });
      },
    );
    request.on("error", reject);
    for (const chunk of options.chunks ?? []) request.write(chunk);
    request.end();
  });
}
