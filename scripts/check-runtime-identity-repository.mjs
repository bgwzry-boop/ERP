import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { hashRuntimeUserPassword } from "../server/authSeed.mjs";
import {
  buildLoadRuntimeIdentityStateQuery,
  buildLoadRuntimeIdentityStateSql,
  buildSaveRuntimeIdentityStateQuery,
  buildSaveRuntimeIdentityStateSql,
  createRuntimeIdentityRepository,
  runtimeIdentityStoreKey,
} from "../server/runtimeIdentityRepository.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "runtime-identity");
rmSync(storageRoot, { recursive: true, force: true });
process.env.ERP_LOCAL_STORAGE_DIR = storageRoot;

const userId = "U-EMP-RUNTIME-CHECK";
const loginName = "emp.runtime.check";
const temporaryPassword = "runtime-temp-password-001";
const changedPasswordValue = "runtime-new-password-001";
const expiredUserId = "U-EMP-RUNTIME-EXPIRED-CHECK";
const expiredLoginName = "emp.runtime.expired.check";
const expiredPassword = "runtime-expired-password-001";
const expiredChangedAt = "2026-01-01T00:00:00.000Z";
const expiredLoginAt = "2026-07-04T00:00:00.000Z";
const expiredChangedPasswordValue = "runtime-expired-new-password-001";
const issuedAt = "2026-01-01T00:00:00.000Z";

const repository = createRuntimeIdentityRepository({ storageRoot });
assert.equal(repository.kind, "local_json");
repository.saveState({
  workspace: {
    users: [
      {
        id: userId,
        userId,
        loginName,
        displayName: "运行期账号检查",
        defaultRole: "workshop",
        department: "workshop",
        defaultMachineId: "BAG-01",
        enabled: true,
        roles: ["workshop"],
        employeeId: "EMP-RUNTIME-CHECK",
        source: "master_data_import_review",
        loginEnabled: true,
        passwordHash: hashRuntimeUserPassword(temporaryPassword, { userId }),
        passwordStatus: "temporary_password_issued",
        mustChangePassword: true,
        passwordIssuedAt: issuedAt,
        sessionValidAfter: issuedAt,
        sessionVersion: 1,
        updatedAt: issuedAt,
      },
      {
        id: expiredUserId,
        userId: expiredUserId,
        loginName: expiredLoginName,
        displayName: "运行期过期账号检查",
        defaultRole: "workshop",
        department: "workshop",
        defaultMachineId: "BAG-01",
        enabled: true,
        roles: ["workshop"],
        employeeId: "EMP-RUNTIME-EXPIRED-CHECK",
        source: "master_data_import_review",
        loginEnabled: true,
        passwordHash: hashRuntimeUserPassword(expiredPassword, { userId: expiredUserId }),
        passwordStatus: "active",
        mustChangePassword: false,
        passwordChangedAt: expiredChangedAt,
        passwordExpiresAt: "2026-04-01T00:00:00.000Z",
        sessionVersion: 1,
        updatedAt: expiredChangedAt,
      },
    ],
    revokedSeedSessions: [],
  },
});

let server = null;
let restartedServer = null;
let revokedCheckServer = null;

try {
  server = createApiServer({ runtimeIdentityRepositoryOptions: { storageRoot } });
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const health = await getJson(baseUrl, "/api/health");
  assert.equal(health.seed.runtimeIdentityRepository, "local_json");

  const temporaryLogin = await postJson(baseUrl, "/api/auth/login", {
    loginName,
    password: temporaryPassword,
  });
  assert.equal(temporaryLogin.permissions.user.userId, userId);
  assert.equal(temporaryLogin.permissions.user.mustChangePassword, true);
  assert.equal(temporaryLogin.permissions.actionPermissions.length, 0);
  assert.equal(temporaryLogin.session.sessionVersion, 1);

  const changedPassword = await postJson(
    baseUrl,
    "/api/auth/change-password",
    {
      currentPassword: temporaryPassword,
      newPassword: changedPasswordValue,
      changeNote: "runtime identity persistence check",
    },
    { headers: { authorization: `Bearer ${temporaryLogin.session.accessToken}` } },
  );
  assert.equal(changedPassword.changed, true);
  assert.equal(changedPassword.user.passwordHash, undefined);
  assert.equal(changedPassword.user.mustChangePassword, false);
  assert.equal(changedPassword.user.passwordStatus, "active");
  assert(changedPassword.permissions.actionPermissions.includes("production.report.complete"));

  await closeServer(server);
  server = null;

  restartedServer = createApiServer({ runtimeIdentityRepositoryOptions: { storageRoot } });
  await listen(restartedServer);
  const restartedBaseUrl = `http://127.0.0.1:${restartedServer.address().port}`;

  const oldPasswordAfterRestart = await postJson(
    restartedBaseUrl,
    "/api/auth/login",
    {
      loginName,
      password: temporaryPassword,
    },
    { expectedStatus: 401 },
  );
  assert.equal(oldPasswordAfterRestart.code, "AUTHENTICATION_FAILED");

  const changedLoginAfterRestart = await postJson(restartedBaseUrl, "/api/auth/login", {
    loginName,
    password: changedPasswordValue,
  });
  assert.equal(changedLoginAfterRestart.permissions.user.userId, userId);
  assert.equal(changedLoginAfterRestart.permissions.user.mustChangePassword, false);
  assert(changedLoginAfterRestart.permissions.actionPermissions.includes("production.report.complete"));

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const failedLogin = await postJson(
      restartedBaseUrl,
      "/api/auth/login",
      {
        loginName,
        password: `wrong-runtime-password-${attempt}`,
      },
      { expectedStatus: 401 },
    );
    assert.equal(failedLogin.code, "AUTHENTICATION_FAILED");
  }
  const lockedLogin = await postJson(
    restartedBaseUrl,
    "/api/auth/login",
    {
      loginName,
      password: "wrong-runtime-password-5",
    },
    { expectedStatus: 423 },
  );
  assert.equal(lockedLogin.code, "AUTH_ACCOUNT_LOCKED");
  assert(lockedLogin.lockedUntil, "locked login response should expose lockedUntil");
  assert.equal(lockedLogin.securityPolicy.maxFailedLoginAttempts, 5);
  const correctPasswordWhileLocked = await postJson(
    restartedBaseUrl,
    "/api/auth/login",
    {
      loginName,
      password: changedPasswordValue,
    },
    { expectedStatus: 423 },
  );
  assert.equal(correctPasswordWhileLocked.code, "AUTH_ACCOUNT_LOCKED");

  const expiredLogin = await postJson(restartedBaseUrl, "/api/auth/login", {
    loginName: expiredLoginName,
    password: expiredPassword,
    attemptedAt: expiredLoginAt,
  });
  assert.equal(expiredLogin.permissions.user.userId, expiredUserId);
  assert.equal(expiredLogin.permissions.passwordChangeRequired, true);
  assert.equal(expiredLogin.permissions.user.passwordStatus, "password_expired");
  assert.equal(expiredLogin.permissions.actionPermissions.length, 0);
  const expiredPasswordChange = await postJson(
    restartedBaseUrl,
    "/api/auth/change-password",
    {
      currentPassword: expiredPassword,
      newPassword: expiredChangedPasswordValue,
      changedAt: expiredLoginAt,
      changeNote: "runtime identity expiry check",
    },
    { headers: { authorization: `Bearer ${expiredLogin.session.accessToken}` } },
  );
  assert.equal(expiredPasswordChange.changed, true);
  assert.equal(expiredPasswordChange.user.passwordStatus, "active");
  assert.equal(expiredPasswordChange.user.mustChangePassword, false);
  assert(expiredPasswordChange.user.passwordExpiresAt, "changed password should store next password expiry");
  assert(expiredPasswordChange.permissions.actionPermissions.includes("production.report.complete"));

  const logout = await postJson(
    restartedBaseUrl,
    "/api/auth/logout",
    {},
    { headers: { authorization: `Bearer ${changedLoginAfterRestart.session.accessToken}` } },
  );
  assert.equal(logout.loggedOut, true);
  assert.equal(logout.tokenRevoked, true);

  await closeServer(restartedServer);
  restartedServer = null;

  revokedCheckServer = createApiServer({ runtimeIdentityRepositoryOptions: { storageRoot } });
  await listen(revokedCheckServer);
  const revokedCheckBaseUrl = `http://127.0.0.1:${revokedCheckServer.address().port}`;
  const revokedSessionAfterRestart = await getJson(revokedCheckBaseUrl, "/api/auth/me", {
    headers: { authorization: `Bearer ${changedLoginAfterRestart.session.accessToken}` },
    expectedStatus: 401,
  });
  assert.equal(revokedSessionAfterRestart.code, "AUTH_TOKEN_REVOKED");

  const reloaded = createRuntimeIdentityRepository({ storageRoot }).loadState();
  const persistedUser = reloaded.users.find((item) => item.userId === userId);
  assert(persistedUser, "runtime user should reload from local identity store");
  assert.equal(persistedUser.passwordStatus, "active");
  assert.equal(persistedUser.mustChangePassword, false);
  assert.equal(persistedUser.failedLoginCount, 5);
  assert(persistedUser.lockedUntil, "runtime user lock state should persist");
  const expiredPersistedUser = reloaded.users.find((item) => item.userId === expiredUserId);
  assert(expiredPersistedUser, "expired runtime user should reload from local identity store");
  assert.equal(expiredPersistedUser.passwordStatus, "active");
  assert.equal(expiredPersistedUser.mustChangePassword, false);
  assert(expiredPersistedUser.passwordExpiresAt);
  assert(reloaded.revokedSeedSessionJtis.includes(changedLoginAfterRestart.session.jti));

  const persistedJson = readFileSync(join(storageRoot, runtimeIdentityStoreKey), "utf8");
  assert.equal(persistedJson.includes(temporaryPassword), false);
  assert.equal(persistedJson.includes(changedPasswordValue), false);
  assert.equal(persistedJson.includes(expiredPassword), false);
  assert.equal(persistedJson.includes(expiredChangedPasswordValue), false);

  const loadSql = buildLoadRuntimeIdentityStateSql();
  assert(loadSql.includes("seed_session_revocations"));
  assert(loadSql.includes("source = 'master_data_import_review'"));
  const loadQuery = buildLoadRuntimeIdentityStateQuery();
  assert.equal(loadQuery.text, loadSql);
  assert.deepEqual(loadQuery.values, []);
  const saveQuery = buildSaveRuntimeIdentityStateQuery(reloaded);
  const saveSql = buildSaveRuntimeIdentityStateSql(reloaded);
  assert(saveSql.includes("ON CONFLICT (id) DO UPDATE"));
  assert(saveSql.includes("ON CONFLICT (jti) DO UPDATE"));
  assert.doesNotMatch(saveSql, /runtime-new-password-001/);
  assert.match(saveSql, /\$\d+::jsonb/);
  assert.equal(saveQuery.text, saveSql);
  assert.ok(saveQuery.values.length > 30);

const postgresCalls = [];
const postgresRepository = createRuntimeIdentityRepository({
  mode: "postgres",
  queryJson(text, values) {
    postgresCalls.push({ kind: "query", text, values });
    return reloaded;
  },
  transactionJson(text, values) {
    postgresCalls.push({ kind: "transaction", text, values });
    return {
      savedUserCount: reloaded.users.length,
      revokedSessionCount: reloaded.revokedSeedSessions.length,
    };
  },
});
const postgresState = await postgresRepository.loadState();
const postgresSaved = await postgresRepository.saveState({
  workspace: {
    users: reloaded.users,
    revokedSeedSessions: reloaded.revokedSeedSessions,
  },
});
assert.equal(postgresRepository.kind, "postgres");
assert.equal(postgresState.users.length, reloaded.users.length);
assert.equal(postgresSaved.savedUserCount, reloaded.users.length);
assert.equal(postgresSaved.revokedSessionCount, reloaded.revokedSeedSessions.length);
assert.equal(postgresCalls[0].kind, "query");
assert.equal(postgresCalls[1].kind, "transaction");
assert.match(postgresCalls[1].text, /^\s*BEGIN;/);
assert.match(postgresCalls[1].text, /AS result;\s*COMMIT;\s*$/);
assert.ok(postgresCalls[1].values.length > 30);
} finally {
  if (server?.listening) await closeServer(server);
  if (restartedServer?.listening) await closeServer(restartedServer);
  if (revokedCheckServer?.listening) await closeServer(revokedCheckServer);
}

console.log("runtime identity repository check passed");

function listen(targetServer) {
  return new Promise((resolve, reject) => {
    targetServer.listen(0, "127.0.0.1", () => resolve());
    targetServer.once("error", reject);
  });
}

function closeServer(targetServer) {
  return new Promise((resolve, reject) => {
    targetServer.close((error) => (error ? reject(error) : resolve()));
  });
}

async function getJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: options.headers,
  });
  const json = await response.json();
  assert.equal(response.status, options.expectedStatus ?? 200, JSON.stringify(json));
  return json;
}

async function postJson(baseUrl, path, body, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  assert.equal(response.status, options.expectedStatus ?? 200, JSON.stringify(json));
  return json;
}
