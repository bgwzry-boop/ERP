import {
  createInitialAuthState,
  createLocalSeedAuthState,
  changeRuntimeUserPassword,
  changeSeedUserPassword,
  initializeSeedAuth,
  isOfficeApiServerRequired,
  loginRuntimeUser,
  loginSeedUser,
  logoutRuntimeUser,
  readStoredSeedSession,
  requiresRuntimePasswordChange,
  seedAuthStorageKey,
} from "../src/services/officeAuthService.js";
import { getRuntimePasswordChangePresentation } from "../src/app/runtimeAuthPresentation.js";

const storage = createMemoryStorage();
const apiBaseUrl = "http://127.0.0.1:8787/api";

assert(isOfficeApiServerRequired({ runtimeMode: "production", serverRequired: false }) === true, "production mode must not allow callers to disable the server requirement");
const productionInitialState = createInitialAuthState({ runtimeMode: "production" });
assert(productionInitialState.source === "server_required", "production initial auth state must require formal login");
assert(productionInitialState.permissions.actionPermissions.length === 0, "production initial auth state must not expose seed permissions");

const financeLocal = createLocalSeedAuthState("U-FINANCE-A");
assert(
  financeLocal.permissions.actionPermissions.includes("statement.payment.record") &&
    !financeLocal.permissions.actionPermissions.includes("order.draft.recognize"),
  "local finance seed permissions are incorrect",
);

const loginCalls = [];
const financeLogin = await loginSeedUser("U-FINANCE-A", {
  apiBaseUrl,
  storage,
  fetchImpl: async (url, init) => {
    loginCalls.push({ url, init, body: JSON.parse(init.body) });
    return createJsonResponse(200, {
      session: {
        accessToken: "seed-session.frontend-check",
        tokenType: "Bearer",
        userId: "U-FINANCE-A",
        issuedAt: "2026-07-01T00:00:00.000Z",
        expiresAt: "2026-07-01T08:00:00.000Z",
        expiresInSeconds: 28800,
      },
      permissions: financeLocal.permissions,
    });
  },
});

assert(financeLogin.source === "api_seed", "frontend auth service did not return an API-backed seed session");
assert(loginCalls[0]?.url === `${apiBaseUrl}/auth/prototype-login`, "frontend auth service called the wrong login URL");
assert(loginCalls[0]?.body.userId === "U-FINANCE-A", "frontend auth service did not request the selected prototype user");
assert(loginCalls[0]?.body.password === undefined, "frontend auth service must not send a seed password");
assert(readStoredSeedSession(storage)?.userId === "U-FINANCE-A", "frontend auth service did not persist the seed session");

let productionSeedFetchCalled = false;
const productionStorage = createMemoryStorage();
const blockedProductionSeedLogin = await loginSeedUser("U-OFFICE-A", {
  runtimeMode: "production",
  storage: productionStorage,
  fetchImpl: async () => {
    productionSeedFetchCalled = true;
    throw new Error("prototype endpoint must not be called");
  },
});
assert(blockedProductionSeedLogin.source === "server_required", "production seed login should remain blocked");
assert(blockedProductionSeedLogin.error.code === "AUTH_PROTOTYPE_LOGIN_DISABLED", "production seed login returned the wrong error");
assert(productionSeedFetchCalled === false, "production seed login called the prototype endpoint");

const runtimeLoginCalls = [];
const runtimeLogin = await loginRuntimeUser(
  { loginName: "employee.001", password: "formal-password-001" },
  {
    apiBaseUrl,
    runtimeMode: "production",
    storage: productionStorage,
    fetchImpl: async (url, init) => {
      runtimeLoginCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        session: {
          accessToken: "erp-runtime-session-v1.runtime-check",
          tokenType: "Bearer",
          sessionType: "runtime",
          userId: "U-EMP-001",
          issuedAt: "2026-07-01T00:00:00.000Z",
          expiresAt: "2026-07-01T08:00:00.000Z",
          expiresInSeconds: 28800,
        },
        permissions: {
          ...financeLocal.permissions,
          user: {
            ...financeLocal.permissions.user,
            userId: "U-EMP-001",
            loginName: "employee.001",
            mustChangePassword: true,
          },
          passwordChangeRequired: true,
        },
        passwordPolicy: {
          minLength: 10,
          requireLetter: true,
          requireNumber: true,
          allowWhitespace: false,
          disallowAccountIdentifiers: true,
          description: "至少 10 位，必须同时包含字母和数字。",
        },
      });
    },
  },
);
assert(runtimeLogin.source === "api_runtime", "formal runtime login did not return an API runtime session");
assert(runtimeLoginCalls[0]?.url === `${apiBaseUrl}/auth/login`, "formal runtime login called the wrong endpoint");
assert(runtimeLoginCalls[0]?.body.loginName === "employee.001", "formal runtime login omitted the login name");
assert(runtimeLoginCalls[0]?.body.password === "formal-password-001", "formal runtime login omitted the password");
assert(readStoredSeedSession(productionStorage) === null, "formal runtime login transport must return a candidate without persisting it");
assert(requiresRuntimePasswordChange(runtimeLogin), "temporary runtime login did not enter the mandatory password-change state");
assert(runtimeLogin.passwordPolicy?.minLength === 10, "temporary runtime login did not retain the password policy");
assert(
  !requiresRuntimePasswordChange({ ...runtimeLogin, session: { ...runtimeLogin.session, sessionType: "seed" } }),
  "seed sessions must not enter the formal-account password-change state",
);
const expiredPresentation = getRuntimePasswordChangePresentation({ passwordStatus: "password_expired" });
assert(expiredPresentation.title === "密码已过期", "expired runtime users should receive the password-expiry title");
assert(expiredPresentation.currentPasswordLabel === "当前密码", "expired runtime users should not be prompted for a temporary password");
assert(expiredPresentation.submitLabel === "更新密码", "expired runtime users should receive the password-update action");
assert(
  getRuntimePasswordChangePresentation({ passwordStatus: "temporary_password_issued" }).currentPasswordLabel === "当前临时密码",
  "temporary runtime users should retain the first-password presentation",
);

const malformedRuntimeLoginStorage = createMemoryStorage();
malformedRuntimeLoginStorage.setItem(seedAuthStorageKey, JSON.stringify({ accessToken: "previous-runtime-token", sessionType: "runtime", userId: "U-OLD" }));
const malformedRuntimeLogin = await loginRuntimeUser(
  { loginName: "employee.001", password: "formal-password-001" },
  {
    apiBaseUrl,
    runtimeMode: "production",
    storage: malformedRuntimeLoginStorage,
    fetchImpl: async () => createJsonResponse(200, {
      session: { accessToken: "malformed-runtime-token", sessionType: "runtime", userId: "U-EMP-001" },
      permissions: { user: { userId: "U-EMP-001" } },
    }),
  },
);
assert(malformedRuntimeLogin.authenticated === false, "a malformed successful formal login must not authenticate the browser");
assert(malformedRuntimeLogin.error?.code === "AUTH_LOGIN_RESPONSE_INVALID", "a malformed successful formal login must expose a safe error");
assert(readStoredSeedSession(malformedRuntimeLoginStorage)?.accessToken === "previous-runtime-token", "formal login transport must not mutate browser storage before an action accepts the candidate");

productionStorage.setItem(seedAuthStorageKey, JSON.stringify(runtimeLogin.session));
const runtimeLogoutCalls = [];
const runtimeLogout = await logoutRuntimeUser({
  apiBaseUrl,
  authState: runtimeLogin,
  storage: productionStorage,
  fetchImpl: async (url, init) => {
    runtimeLogoutCalls.push({ url, init });
    return createJsonResponse(200, {
      loggedOut: true,
      tokenRevoked: true,
      sessionUserId: "U-EMP-001",
    });
  },
});
assert(runtimeLogout.loggedOut === true && runtimeLogout.tokenRevoked === true, "formal runtime logout did not report the server token revocation");
assert(runtimeLogoutCalls[0]?.url === `${apiBaseUrl}/auth/logout`, "formal runtime logout called the wrong URL");
assert(runtimeLogoutCalls[0]?.init.method === "POST", "formal runtime logout must use POST");
assert(
  runtimeLogoutCalls[0]?.init.headers.authorization === "Bearer erp-runtime-session-v1.runtime-check",
  "formal runtime logout did not send the runtime bearer token",
);
assert(readStoredSeedSession(productionStorage) === null, "formal runtime logout did not clear the browser session after server revocation");

const rejectedLogoutStorage = createMemoryStorage();
rejectedLogoutStorage.setItem(seedAuthStorageKey, JSON.stringify(runtimeLogin.session));
const rejectedLogout = await logoutRuntimeUser({
  apiBaseUrl,
  authState: runtimeLogin,
  storage: rejectedLogoutStorage,
  fetchImpl: async () => createJsonResponse(401, {
    code: "AUTH_TOKEN_REVOKED",
    message: "The ERP session has already been revoked.",
  }),
});
assert(rejectedLogout.loggedOut === true && rejectedLogout.tokenRevoked === false, "an already-revoked session should complete local logout without claiming another revocation");
assert(readStoredSeedSession(rejectedLogoutStorage) === null, "an already-revoked session should be cleared from browser storage");

const malformedLogoutStorage = createMemoryStorage();
malformedLogoutStorage.setItem(seedAuthStorageKey, JSON.stringify(runtimeLogin.session));
const malformedLogout = await logoutRuntimeUser({
  apiBaseUrl,
  authState: runtimeLogin,
  storage: malformedLogoutStorage,
  fetchImpl: async () => createJsonResponse(200, {
    tokenRevoked: true,
  }),
});
assert(malformedLogout.loggedOut === false && malformedLogout.error?.code === "LOGOUT_RESPONSE_INVALID", "a malformed success response must not complete client logout");
assert(readStoredSeedSession(malformedLogoutStorage)?.accessToken === runtimeLogin.session.accessToken, "a malformed success response must retain the browser session for retry");

const failedLogoutStorage = createMemoryStorage();
failedLogoutStorage.setItem(seedAuthStorageKey, JSON.stringify(runtimeLogin.session));
const failedLogout = await logoutRuntimeUser({
  apiBaseUrl,
  authState: runtimeLogin,
  storage: failedLogoutStorage,
  fetchImpl: async () => createJsonResponse(503, {
    code: "AUTH_SERVICE_UNAVAILABLE",
    message: "Authentication service unavailable.",
  }),
});
assert(failedLogout.loggedOut === false, "a server-side logout failure must remain visible to the operator");
assert(readStoredSeedSession(failedLogoutStorage)?.accessToken === runtimeLogin.session.accessToken, "a server-side logout failure must not falsely discard an active browser session");

productionStorage.removeItem(seedAuthStorageKey);
const productionNoSession = await initializeSeedAuth({ runtimeMode: "production", storage: productionStorage });
assert(productionNoSession.source === "server_required", "production without a session must stay on the login boundary");
assert(productionNoSession.permissions.actionPermissions.length === 0, "production without a session exposed local permissions");

const originalWindow = globalThis.window;
const legacyLocalStorage = createMemoryStorage();
const tabSessionStorage = createMemoryStorage();
legacyLocalStorage.setItem("erp.seedAuthSession.v1", JSON.stringify({ accessToken: "legacy-local-token" }));
globalThis.window = {
  localStorage: legacyLocalStorage,
  sessionStorage: tabSessionStorage,
};
try {
  const tabScopedLogin = await loginSeedUser("U-OFFICE-A", {
    apiBaseUrl,
    fetchImpl: async () =>
      createJsonResponse(200, {
        session: {
          accessToken: "seed-session.tab-scoped",
          tokenType: "Bearer",
          userId: "U-OFFICE-A",
          issuedAt: "2026-07-01T00:00:00.000Z",
          expiresAt: "2026-07-01T08:00:00.000Z",
          expiresInSeconds: 28800,
        },
        permissions: createLocalSeedAuthState("U-OFFICE-A").permissions,
      }),
  });
  assert(tabScopedLogin.source === "api_seed", "tab-scoped login did not return an API session");
  assert(readStoredSeedSession(tabSessionStorage)?.accessToken === "seed-session.tab-scoped", "session token was not written to session storage");
  assert(legacyLocalStorage.getItem(seedAuthStorageKey) === null, "session token must not be written to local storage");
  assert(legacyLocalStorage.getItem("erp.seedAuthSession.v1") === null, "legacy local-storage token was not cleared");
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}

const passwordChangeCalls = [];
const passwordChange = await changeRuntimeUserPassword(
  {
    currentPassword: "TEMP-PASS-001",
    newPassword: "new-password-001",
    changeNote: "首次登录改密",
  },
  {
    apiBaseUrl,
    authState: runtimeLogin,
    storage,
    fetchImpl: async (url, init) => {
      passwordChangeCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        changed: true,
        user: {
          userId: "U-EMP-001",
          loginName: "emp.001",
          mustChangePassword: false,
          passwordStatus: "active",
        },
        permissions: {
          ...financeLocal.permissions,
          user: {
            ...financeLocal.permissions.user,
            userId: "U-EMP-001",
            loginName: "emp.001",
            mustChangePassword: false,
            passwordStatus: "active",
          },
        },
        operationLogId: "LOG-PASSWORD-CHANGE-001",
      });
    },
  },
);
assert(passwordChange.changed === true, "frontend auth service did not return successful password change");
assert(
  passwordChangeCalls[0]?.url === `${apiBaseUrl}/auth/change-password`,
  "frontend auth service called the wrong change-password URL",
);
assert(
  passwordChangeCalls[0]?.init.headers.authorization === "Bearer erp-runtime-session-v1.runtime-check",
  "frontend auth service did not send bearer token for password change",
);
assert(
  passwordChangeCalls[0]?.body.currentPassword === "TEMP-PASS-001" &&
    passwordChangeCalls[0]?.body.newPassword === "new-password-001",
  "frontend auth service did not send the password-change payload",
);
assert(passwordChange.permissions.user.mustChangePassword === false, "frontend auth service did not normalize changed permissions");
assert(
  !requiresRuntimePasswordChange({ ...runtimeLogin, permissions: passwordChange.permissions }),
  "changed formal runtime account remained on the mandatory password-change state",
);

const malformedPasswordChange = await changeRuntimeUserPassword(
  {
    currentPassword: "TEMP-PASS-001",
    newPassword: "new-password-001",
  },
  {
    apiBaseUrl,
    authState: runtimeLogin,
    storage,
    fetchImpl: async () => createJsonResponse(200, {
      changed: true,
      permissions: { user: { userId: "U-EMP-001" } },
    }),
  },
);
assert(malformedPasswordChange.changed === false, "a malformed successful password-change response must fail closed");
assert(malformedPasswordChange.error?.code === "PASSWORD_CHANGE_RESPONSE_INVALID", "a malformed password-change response must expose a safe error");

const passwordPolicyError = await changeSeedUserPassword(
  {
    currentPassword: "TEMP-PASS-001",
    newPassword: "short",
  },
  {
    apiBaseUrl,
    storage,
    fetchImpl: async () => createJsonResponse(422, {
      code: "NEW_PASSWORD_TOO_SHORT",
      message: "New password must be at least 10 characters.",
      passwordPolicy: {
        minLength: 10,
        requireLetter: true,
        requireNumber: true,
        allowWhitespace: false,
        disallowAccountIdentifiers: true,
        description: "至少 10 位，必须同时包含字母和数字。",
      },
    }),
  },
);
assert(passwordPolicyError.changed === false, "frontend auth service treated a policy error as changed");
assert(passwordPolicyError.error.passwordPolicy.minLength === 10, "frontend auth service did not expose password policy details");
assert(passwordPolicyError.error.passwordPolicy.requireLetter === true, "frontend auth service did not normalize password policy flags");

const restoredSession = await initializeSeedAuth({
  apiBaseUrl,
  storage,
  fetchImpl: async (url, init) => {
    assert(url === `${apiBaseUrl}/auth/me`, "frontend auth service called the wrong current-session URL");
    assert(
      init.headers.authorization === "Bearer seed-session.frontend-check",
      "frontend auth service did not send the stored bearer token",
    );
    return createJsonResponse(200, {
      authenticated: true,
      session: {
        ...readStoredSeedSession(storage),
        accessToken: "seed-session.frontend-check-restored-candidate",
      },
      permissions: financeLocal.permissions,
    });
  },
});

assert(restoredSession.source === "api_seed", "frontend auth service did not restore the stored seed session");
assert(restoredSession.permissions.user.userId === "U-FINANCE-A", "restored seed session user is incorrect");
assert(restoredSession.session.accessToken === "seed-session.frontend-check-restored-candidate", "frontend auth service did not return the candidate restored session");
assert(readStoredSeedSession(storage)?.accessToken === "seed-session.frontend-check", "the startup transport must not rewrite browser storage before the app accepts restoration");

const malformedRestoreStorage = createMemoryStorage();
malformedRestoreStorage.setItem(seedAuthStorageKey, JSON.stringify(runtimeLogin.session));
const malformedRestore = await initializeSeedAuth({
  apiBaseUrl,
  runtimeMode: "production",
  storage: malformedRestoreStorage,
  fetchImpl: async () => createJsonResponse(200, {
    authenticated: true,
    session: runtimeLogin.session,
    permissions: { user: { userId: "U-EMP-001" } },
  }),
});
assert(malformedRestore.authenticated === false, "a malformed formal restoration response must not restore the workspace");
assert(malformedRestore.error?.code === "AUTH_RESTORE_RESPONSE_INVALID", "a malformed formal restoration response must expose a safe error");
assert(readStoredSeedSession(malformedRestoreStorage)?.accessToken === runtimeLogin.session.accessToken, "the startup transport must not clear storage before the app accepts an invalid restore result");

const unauthenticatedRestoreStorage = createMemoryStorage();
unauthenticatedRestoreStorage.setItem(seedAuthStorageKey, JSON.stringify(runtimeLogin.session));
const unauthenticatedRestore = await initializeSeedAuth({
  apiBaseUrl,
  runtimeMode: "production",
  storage: unauthenticatedRestoreStorage,
  fetchImpl: async () => createJsonResponse(200, {
    authenticated: false,
    session: runtimeLogin.session,
    permissions: runtimeLogin.permissions,
  }),
});
assert(unauthenticatedRestore.authenticated === false, "a formal restore that explicitly denies authentication must not restore the workspace");
assert(unauthenticatedRestore.error?.code === "AUTH_RESTORE_RESPONSE_INVALID", "an explicitly unauthenticated formal restore must expose a safe error");
assert(readStoredSeedSession(unauthenticatedRestoreStorage)?.accessToken === runtimeLogin.session.accessToken, "the startup transport must not clear storage before the app accepts an explicitly unauthenticated restore result");

const warehouseFallback = await loginSeedUser("U-WAREHOUSE-A", {
  apiBaseUrl,
  storage,
  fetchImpl: async () => {
    throw new Error("api offline");
  },
});

assert(warehouseFallback.source === "local_seed", "frontend auth service did not fall back to local seed permissions");
assert(warehouseFallback.permissions.user.userId === "U-WAREHOUSE-A", "local fallback user is incorrect");
assert(
  warehouseFallback.permissions.actionPermissions.includes("fulfillment.print") &&
    !warehouseFallback.permissions.actionPermissions.includes("statement.payment.record"),
  "warehouse local fallback permissions are incorrect",
);
assert(!storage.getItem(seedAuthStorageKey), "failed seed login fallback should clear the old stored token");

console.log("Frontend auth service check passed: formal login, mandatory password change, seed-login blocking, session restore, and demo fallback are covered.");

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
