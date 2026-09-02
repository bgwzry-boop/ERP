import assert from "node:assert/strict";
import { createRuntimeSession, createSeedSession } from "../server/authSeed.mjs";
import {
  getRequestAuthContext,
  getRequestHeaderValue,
  getRequestPermissionContext,
  parseActionPermissionOverride,
} from "../server/services/requestAuthContextService.mjs";

const authSecret = "request-auth-context-service-secret";
const runtimeUser = {
  id: "U-RUNTIME-FINANCE",
  userId: "U-RUNTIME-FINANCE",
  loginName: "runtime.finance",
  displayName: "正式财务",
  defaultRole: "finance",
  department: "finance",
  enabled: true,
  roles: ["finance"],
  loginEnabled: true,
  passwordHash: "test-password-hash",
  passwordStatus: "active",
  sessionVersion: 2,
};
const strictWorkspace = {
  users: [runtimeUser],
  revokedSeedSessionJtis: [],
  securityPolicy: {
    runtimeMode: "production",
    strictAuth: true,
    authSecret,
    allowSeedUsers: false,
    allowLegacyIdentityHeaders: false,
    allowActionPermissionOverride: false,
    allowDefaultSeedUser: false,
  },
};
const demoWorkspace = {
  users: [],
  revokedSeedSessionJtis: [],
  securityPolicy: {
    runtimeMode: "demo",
    strictAuth: false,
    authSecret,
    allowSeedUsers: true,
    allowLegacyIdentityHeaders: true,
    allowActionPermissionOverride: true,
    allowDefaultSeedUser: true,
  },
};

const runtimeSession = createRuntimeSession(runtimeUser.userId, {
  authSecret,
  sessionVersion: runtimeUser.sessionVersion,
});
const runtimeRequest = requestWithHeaders({
  authorization: `Bearer ${runtimeSession.accessToken}`,
});
const runtimeAuth = getRequestAuthContext(runtimeRequest, strictWorkspace);
assert.equal(runtimeAuth.authenticated, true);
assert.equal(runtimeAuth.source, "runtime_session");
assert.equal(runtimeAuth.userId, runtimeUser.userId);
assert.equal(runtimeAuth.session.sessionVersion, 2);

const invalidRuntimeToken = `${runtimeSession.accessToken.slice(0, -1)}${runtimeSession.accessToken.endsWith("a") ? "b" : "a"}`;
const invalidRuntimeAuth = getRequestAuthContext(
  requestWithHeaders({ authorization: `Bearer ${invalidRuntimeToken}` }),
  strictWorkspace,
);
assert.equal(invalidRuntimeAuth.authenticated, false);
assert.equal(invalidRuntimeAuth.source, "invalid_runtime_session");
assert.equal(invalidRuntimeAuth.userId, "INVALID-RUNTIME-SESSION");
assert.ok(invalidRuntimeAuth.authError);

const seedSession = createSeedSession("U-OFFICE-A", { authSecret });
const demoSeedAuth = getRequestAuthContext(
  requestWithHeaders({ authorization: `Bearer ${seedSession.accessToken}` }),
  demoWorkspace,
);
assert.equal(demoSeedAuth.authenticated, true);
assert.equal(demoSeedAuth.source, "seed_session");
assert.equal(demoSeedAuth.userId, "U-OFFICE-A");

const blockedSeedAuth = getRequestAuthContext(
  requestWithHeaders({ authorization: `Bearer ${seedSession.accessToken}` }),
  strictWorkspace,
);
assert.deepEqual(
  {
    authenticated: blockedSeedAuth.authenticated,
    source: blockedSeedAuth.source,
    userId: blockedSeedAuth.userId,
    authError: blockedSeedAuth.authError,
  },
  {
    authenticated: false,
    source: "seed_session_disabled",
    userId: "SEED-SESSION-DISABLED",
    authError: "AUTH_SEED_USER_DISABLED",
  },
);

assert.deepEqual(
  getRequestAuthContext(
    requestWithHeaders({ authorization: "Bearer seed:U-FINANCE-A" }),
    demoWorkspace,
  ),
  {
    authenticated: false,
    source: "legacy_seed_bearer",
    userId: "U-FINANCE-A",
  },
);
assert.deepEqual(
  getRequestAuthContext(requestWithHeaders({ "x-erp-user-id": "U-FINANCE-A" }), demoWorkspace),
  {
    authenticated: false,
    source: "seed_user_header",
    userId: "U-FINANCE-A",
  },
);
assert.deepEqual(getRequestAuthContext(requestWithHeaders({}), demoWorkspace), {
  authenticated: false,
  source: "default_seed_user",
  userId: "U-OFFICE-A",
});

const strictForgedRequest = requestWithHeaders({
  "x-erp-user-id": "U-OFFICE-A",
  "x-erp-action-permissions": "order.draft.recognize",
});
assert.deepEqual(getRequestAuthContext(strictForgedRequest, strictWorkspace), {
  authenticated: false,
  source: "unauthenticated",
  userId: "UNAUTHENTICATED",
  authError: "AUTH_SESSION_REQUIRED",
});
const strictForgedPermissions = getRequestPermissionContext(
  strictForgedRequest,
  undefined,
  strictWorkspace,
);
assert.equal(strictForgedPermissions.user.userId, "UNAUTHENTICATED");
assert.deepEqual(strictForgedPermissions.actionPermissions, []);

const demoOverrideRequest = requestWithHeaders({
  "x-erp-user-id": "U-FINANCE-A",
  "x-erp-action-permissions": ["order.draft.recognize", "inventory.correction.confirm"],
});
const demoOverridePermissions = getRequestPermissionContext(
  demoOverrideRequest,
  undefined,
  demoWorkspace,
);
assert.equal(demoOverridePermissions.user.userId, "U-FINANCE-A");
assert.deepEqual(demoOverridePermissions.actionPermissions, [
  "order.draft.recognize",
  "inventory.correction.confirm",
]);

const strictRuntimePermissions = getRequestPermissionContext(
  requestWithHeaders({ "x-erp-action-permissions": "order.draft.recognize" }),
  runtimeAuth,
  strictWorkspace,
);
assert.equal(strictRuntimePermissions.user.userId, runtimeUser.userId);
assert.equal(strictRuntimePermissions.actionPermissions.includes("order.draft.recognize"), false);
assert.equal(strictRuntimePermissions.actionPermissions.includes("statement.payment.record"), true);

assert.deepEqual(parseActionPermissionOverride("none"), []);
assert.deepEqual(parseActionPermissionOverride(" a, b ,, c "), ["a", "b", "c"]);
assert.deepEqual(parseActionPermissionOverride(["a", "b,c"]), ["a", "b", "c"]);
assert.equal(
  getRequestHeaderValue(requestWithHeaders({ origin: ["https://a.example", "https://b.example"] }), "Origin"),
  "https://a.example,https://b.example",
);
assert.equal(getRequestHeaderValue(requestWithHeaders({}), "missing"), "");

console.log(
  "request auth-context service checks passed: runtime/seed verification, strict fail-closed identity, demo compatibility, workspace-aware permission resolution, and override isolation are locked",
);

function requestWithHeaders(headers) {
  return { headers };
}
