import assert from "node:assert/strict";
import { handleAuthReadRoutes } from "../server/routes/authReadRoutes.mjs";
import { handleAuthWriteRoutes } from "../server/routes/authWriteRoutes.mjs";

const calls = [];
const shared = {
  response: {},
  workspace: {},
  body: { loginName: "office" },
  authContext: { authenticated: true, userId: "U-OFFICE-A" },
};

assert.equal(
  await handleAuthReadRoutes({
    ...shared,
    url: new URL("http://erp.test/api/auth/me"),
    permissionContext: { user: { userId: "U-OFFICE-A" } },
    async getCurrentAuthSession(input) {
      calls.push({ kind: "me", ...input });
    },
  }),
  true,
);
assert.deepEqual(calls, [
  {
    kind: "me",
    response: shared.response,
    permissionContext: { user: { userId: "U-OFFICE-A" } },
    authContext: shared.authContext,
  },
]);
assert.equal(await handleAuthReadRoutes({ ...shared, url: new URL("http://erp.test/api/auth/other"), permissionContext: {}, getCurrentAuthSession() {} }), false);

for (const [pathname, handlerName, kind] of [
  ["/api/auth/login", "loginSeedAuth", "login"],
  ["/api/auth/prototype-login", "loginPrototypeSeedAuth", "prototype"],
  ["/api/auth/change-password", "changeRuntimeUserPasswordRoute", "password"],
  ["/api/auth/logout", "logoutSeedAuth", "logout"],
]) {
  calls.length = 0;
  const dependencies = {
    ...shared,
    method: "POST",
    url: new URL(`http://erp.test${pathname}`),
    loginSeedAuth: async (input) => calls.push({ kind: "login", ...input }),
    loginPrototypeSeedAuth: async (input) => calls.push({ kind: "prototype", ...input }),
    changeRuntimeUserPasswordRoute: async (input) => calls.push({ kind: "password", ...input }),
    logoutSeedAuth: async (input) => calls.push({ kind: "logout", ...input }),
  };
  assert.equal(await handleAuthWriteRoutes(dependencies), true);
  const expected = { kind, response: shared.response, workspace: shared.workspace };
  if (handlerName !== "logoutSeedAuth") expected.body = shared.body;
  if (handlerName === "changeRuntimeUserPasswordRoute" || handlerName === "logoutSeedAuth") expected.authContext = shared.authContext;
  assert.deepEqual(calls, [expected]);
}

assert.equal(
  await handleAuthWriteRoutes({
    ...shared,
    method: "GET",
    url: new URL("http://erp.test/api/auth/login"),
    loginSeedAuth() {},
    loginPrototypeSeedAuth() {},
    changeRuntimeUserPasswordRoute() {},
    logoutSeedAuth() {},
  }),
  false,
);
assert.equal(
  await handleAuthWriteRoutes({
    ...shared,
    method: "POST",
    url: new URL("http://erp.test/api/auth/unknown"),
    loginSeedAuth() {},
    loginPrototypeSeedAuth() {},
    changeRuntimeUserPasswordRoute() {},
    logoutSeedAuth() {},
  }),
  false,
);

console.log("auth read/write routes checks passed");
