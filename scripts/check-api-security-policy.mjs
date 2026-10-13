import assert from "node:assert/strict";
import {
  buildApiSecurityPolicy,
  defaultMaxJsonBodyBytes,
  getCorsAllowedRequestHeaders,
  getWorkspaceSecurityPolicy,
  isCorsRequestAllowed,
  isPublicApiRoute,
} from "../server/apiSecurityPolicy.mjs";

assert.throws(
  () => buildApiSecurityPolicy({ strictAuth: true }, {}),
  /ERP_AUTH_SECRET/,
);

const strictPolicy = buildApiSecurityPolicy(
  {
    authMode: "strict",
    authSecret: "test-secret",
    allowSeedUsers: true,
    allowLegacyIdentityHeaders: true,
    allowActionPermissionOverride: true,
    allowDefaultSeedUser: true,
    corsAllowedOrigins: "https://erp.example.test, https://office.example.test",
    maxJsonBodyBytes: 321.8,
  },
  {},
);
assert.equal(strictPolicy.strictAuth, true);
assert.equal(strictPolicy.allowSeedUsers, false);
assert.equal(strictPolicy.allowLegacyIdentityHeaders, false);
assert.equal(strictPolicy.allowActionPermissionOverride, false);
assert.equal(strictPolicy.allowDefaultSeedUser, false);
assert.equal(strictPolicy.maxJsonBodyBytes, 321);
assert.equal(isCorsRequestAllowed(strictPolicy, "https://erp.example.test"), true);
assert.equal(isCorsRequestAllowed(strictPolicy, "https://untrusted.example.test"), false);
assert.equal(getCorsAllowedRequestHeaders(strictPolicy), "content-type, authorization, idempotency-key");

const productionRuntimePolicy = buildApiSecurityPolicy(
  {
    runtimeMode: "production",
    strictAuth: false,
    authSecret: "production-runtime-secret",
    allowSeedUsers: true,
    allowLegacyIdentityHeaders: true,
  },
  {},
);
assert.equal(productionRuntimePolicy.strictAuth, true);
assert.equal(productionRuntimePolicy.allowSeedUsers, false);
assert.equal(productionRuntimePolicy.allowLegacyIdentityHeaders, false);

const localPolicy = buildApiSecurityPolicy({}, { ERP_API_MAX_JSON_BODY_BYTES: "invalid" });
assert.equal(localPolicy.strictAuth, false);
assert.equal(localPolicy.allowSeedUsers, true);
assert.equal(localPolicy.maxJsonBodyBytes, defaultMaxJsonBodyBytes);
assert.equal(localPolicy.fixedPreviewUserId, "");
assert.equal(buildApiSecurityPolicy({ runtimeMode: "test" }, {}).fixedPreviewUserId, "U-MANAGER-A");
assert.equal(isCorsRequestAllowed(localPolicy, "https://untrusted.example.test"), true);
assert.equal(
  getCorsAllowedRequestHeaders(localPolicy),
  "content-type, authorization, idempotency-key, x-erp-user-id, x-erp-action-permissions",
);
assert.equal(isPublicApiRoute("GET", "/api/health"), true);
assert.equal(isPublicApiRoute("POST", "/api/auth/login"), true);
assert.equal(isPublicApiRoute("POST", "/api/auth/prototype-login", strictPolicy), false);
assert.equal(isPublicApiRoute("POST", "/api/auth/prototype-login", localPolicy), true);
assert.equal(isPublicApiRoute("GET", "/api/permissions/effective"), false);
assert.equal(getWorkspaceSecurityPolicy({}).maxJsonBodyBytes, defaultMaxJsonBodyBytes);

console.log("API security policy checks passed");
