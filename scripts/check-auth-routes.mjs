import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleAuthReadRoutes } from "../server/routes/authReadRoutes.mjs";
import { handleAuthWriteRoutes } from "../server/routes/authWriteRoutes.mjs";

const calls = [];
const shared = {
  response: {},
  workspace: {},
  body: { loginName: "office" },
  permissionContext: { user: { userId: "U-OFFICE-A" } },
  authContext: { authenticated: true, userId: "U-OFFICE-A" },
  runtimeAuthCommandService: {},
  sendCommandResponse(response, result, options) {
    calls.push({ kind: "response", response, result, options });
    return "response-sent";
  },
};
for (const [commandName, kind] of [
  ["login", "login"],
  ["prototypeLogin", "prototype"],
  ["changePassword", "password"],
  ["getCurrentSession", "me"],
  ["logout", "logout"],
]) {
  shared.runtimeAuthCommandService[commandName] = async (input) => {
    calls.push({ kind, ...input });
    return { statusCode: 423, response: { command: kind } };
  };
}

calls.length = 0;
assert.equal(
  await handleAuthReadRoutes({
    ...shared,
    url: new URL("http://erp.test/api/auth/me"),
  }),
  true,
);
assert.deepEqual(calls, [
  {
    kind: "me",
    permissionContext: shared.permissionContext,
    authContext: shared.authContext,
  },
  {
    kind: "response",
    response: shared.response,
    result: { statusCode: 423, response: { command: "me" } },
    options: { useResultStatusCode: true },
  },
]);
assert.equal(
  await handleAuthReadRoutes({ ...shared, url: new URL("http://erp.test/api/auth/other") }),
  false,
);

for (const [pathname, kind] of [
  ["/api/auth/login", "login"],
  ["/api/auth/prototype-login", "prototype"],
  ["/api/auth/change-password", "password"],
  ["/api/auth/logout", "logout"],
]) {
  calls.length = 0;
  assert.equal(
    await handleAuthWriteRoutes({
      ...shared,
      method: "POST",
      url: new URL(`http://erp.test${pathname}`),
    }),
    true,
  );
  const command = { kind, workspace: shared.workspace };
  if (kind !== "logout") command.body = shared.body;
  if (kind === "password" || kind === "logout") command.authContext = shared.authContext;
  assert.deepEqual(calls, [
    command,
    {
      kind: "response",
      response: shared.response,
      result: { statusCode: 423, response: { command: kind } },
      options: { useResultStatusCode: true },
    },
  ]);
}

assert.equal(
  await handleAuthWriteRoutes({
    ...shared,
    method: "GET",
    url: new URL("http://erp.test/api/auth/login"),
  }),
  false,
);
assert.equal(
  await handleAuthWriteRoutes({
    ...shared,
    method: "POST",
    url: new URL("http://erp.test/api/auth/unknown"),
  }),
  false,
);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
for (const removedWrapper of [
  "loginSeedAuth",
  "loginPrototypeSeedAuth",
  "changeRuntimeUserPasswordRoute",
  "getCurrentAuthSession",
  "logoutSeedAuth",
  "sendRuntimeAuthCommandResult",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`(?:async )?function ${removedWrapper}\\b`));
}
assert.match(apiSource, /handleAuthReadRoutes\([\s\S]*runtimeAuthCommandService,[\s\S]*sendCommandResponse,/);
assert.match(apiSource, /handleAuthWriteRoutes\([\s\S]*runtimeAuthCommandService,[\s\S]*sendCommandResponse,/);

console.log("auth read/write routes checks passed: direct command ownership, dynamic statuses, and thin API wiring are covered");
