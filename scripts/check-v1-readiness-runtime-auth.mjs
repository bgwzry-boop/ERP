import assert from "node:assert/strict";
import {
  authenticateV1ReadinessRole,
  buildV1ReadinessAuthInput,
  isProductionRuntime,
} from "./v1ReadinessRuntimeAuth.mjs";

const apiBaseUrl = "http://127.0.0.1:8787/api";
const productionHealth = { seed: { runtimeConfig: { mode: "production", production: true } } };
const loginName = "v1.readiness.operator";
const password = "SUPER_SECRET_READINESS_LOGIN_PASSWORD";
const userId = "U-V1-READINESS-OPERATOR";
const runtimeToken = "erp-runtime-session-v1.readiness-auth-check";

assert.equal(isProductionRuntime({ health: productionHealth }), true);
assert.equal(isProductionRuntime({ runtimeMode: "test" }), false);

await assert.rejects(
  () =>
    authenticateV1ReadinessRole({
      apiBaseUrl,
      health: productionHealth,
      authInput: buildV1ReadinessAuthInput({ role: "operator", env: {} }),
      fetchImpl: unexpectedFetch,
    }),
  /ERP_V1_READINESS_TOKEN.*ERP_V1_READINESS_LOGIN_NAME.*ERP_V1_READINESS_PASSWORD/,
);

await assert.rejects(
  () =>
    authenticateV1ReadinessRole({
      apiBaseUrl,
      health: productionHealth,
      authInput: buildV1ReadinessAuthInput({
        role: "operator",
        env: { ERP_V1_READINESS_TOKEN: "seed-session.invalid-production-token" },
      }),
      fetchImpl: unexpectedFetch,
    }),
  /formal runtime session/,
);

const loginCalls = [];
const formalLogin = await authenticateV1ReadinessRole({
  apiBaseUrl,
  health: productionHealth,
  authInput: buildV1ReadinessAuthInput({
    role: "operator",
    env: {
      ERP_V1_READINESS_OPERATOR_ID: userId,
      ERP_V1_READINESS_LOGIN_NAME: loginName,
      ERP_V1_READINESS_PASSWORD: password,
    },
  }),
  fetchImpl: async (url, init) => {
    loginCalls.push({ url, init });
    return new Response(
      JSON.stringify({
        session: { accessToken: runtimeToken, userId },
        permissions: { user: { userId } },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  },
});
assert.equal(formalLogin.source, "formal_login");
assert.equal(formalLogin.formalRuntimeSession, true);
assert.equal(formalLogin.legacyIdentityHeaderUsed, false);
assert.equal(formalLogin.headers.authorization, `Bearer ${runtimeToken}`);
assert.equal(formalLogin.headers["x-erp-user-id"], undefined);
assert.equal(loginCalls.length, 1);
assert.equal(loginCalls[0].url, `${apiBaseUrl}/auth/login`);
assert.deepEqual(JSON.parse(loginCalls[0].init.body), { loginName, password });
assert.doesNotMatch(JSON.stringify(formalLogin), new RegExp(password));
assert.doesNotMatch(JSON.stringify(formalLogin), new RegExp(loginName));

const providedToken = await authenticateV1ReadinessRole({
  apiBaseUrl,
  health: productionHealth,
  authInput: buildV1ReadinessAuthInput({
    role: "driver",
    env: {
      ERP_V1_READINESS_DRIVER_OPERATOR_ID: "U-V1-DRIVER",
      ERP_V1_READINESS_DRIVER_TOKEN: runtimeToken,
    },
  }),
  fetchImpl: unexpectedFetch,
});
assert.equal(providedToken.source, "runtime_token");
assert.equal(providedToken.headers["x-erp-user-id"], undefined);

const demoFallback = await authenticateV1ReadinessRole({
  apiBaseUrl,
  runtimeMode: "demo",
  authInput: buildV1ReadinessAuthInput({
    role: "driver",
    env: { ERP_V1_READINESS_DRIVER_OPERATOR_ID: "U-DRIVER-A" },
  }),
  fetchImpl: unexpectedFetch,
});
assert.equal(demoFallback.source, "legacy_identity_header");
assert.equal(demoFallback.headers["x-erp-user-id"], "U-DRIVER-A");

console.log("V1 readiness runtime-auth check passed");

async function unexpectedFetch() {
  throw new Error("fetch should not be called");
}
