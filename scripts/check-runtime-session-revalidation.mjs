import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  revalidateRuntimeUserSession,
  readStoredSeedSession,
  seedAuthStorageKey,
} from "../src/services/officeAuthService.js";
import { shouldRevalidateRuntimeSession } from "../src/app/useRuntimeSessionExpiry.js";
import { createRuntimeAuthActions } from "../src/app/createRuntimeAuthActions.js";

const runtimeAuthState = {
  authenticated: true,
  session: {
    accessToken: "runtime-revalidate-token",
    sessionType: "runtime",
    userId: "U-EMP-001",
  },
};
const permissions = {
  user: { userId: "U-EMP-001", displayName: "正式员工", mustChangePassword: false },
  roles: ["office"],
  grants: [],
  buttonPermissions: [],
  actionPermissions: ["todo.read"],
};

assert.equal(shouldRevalidateRuntimeSession(runtimeAuthState, "visible"), true, "visible formal runtime sessions must be revalidated");
assert.equal(shouldRevalidateRuntimeSession(runtimeAuthState, "hidden"), false, "hidden tabs must not poll the formal session");
assert.equal(shouldRevalidateRuntimeSession({ authenticated: true, session: { sessionType: "seed" } }, "visible"), false, "seed sessions must stay outside runtime revalidation");

const storage = createMemoryStorage();
const validResult = await revalidateRuntimeUserSession({
  apiBaseUrl: "http://127.0.0.1:8787/api",
  authState: runtimeAuthState,
  storage,
  fetchImpl: async (url, init) => {
    assert.equal(url, "http://127.0.0.1:8787/api/auth/me", "runtime revalidation must use the authoritative current-session route");
    assert.equal(init.method, "GET", "runtime revalidation must remain read-only");
    assert.equal(init.headers.authorization, "Bearer runtime-revalidate-token", "runtime revalidation must send the current bearer token");
    return createJsonResponse(200, {
      authenticated: true,
      session: {
        ...runtimeAuthState.session,
        expiresAt: "2026-07-16T00:00:00.000Z",
        expiresInSeconds: 3600,
      },
      permissions,
    });
  },
});
assert.equal(validResult.valid, true, "a current formal session must be accepted");
assert.equal(validResult.authState.reason, "runtime_session_revalidated", "a successful revalidation must refresh the formal auth state");
assert.equal(validResult.authState.permissions.user.displayName, "正式员工", "a successful revalidation must refresh server permissions");
assert.equal(readStoredSeedSession(storage), null, "the transport must not write a revalidation response before the active browser session accepts it");

const revokedResult = await revalidateRuntimeUserSession({
  apiBaseUrl: "http://127.0.0.1:8787/api",
  authState: runtimeAuthState,
  storage,
  fetchImpl: async () => createJsonResponse(401, {
    code: "AUTH_TOKEN_REVOKED",
    message: "server detail is not displayed by the browser invalidation path",
  }),
});
assert.equal(revokedResult.valid, false, "a revoked formal session must fail revalidation");
assert.equal(revokedResult.retryable, false, "a revoked formal session must not be retried as a transient failure");
assert.equal(revokedResult.invalidation?.error.code, "AUTH_TOKEN_REVOKED", "a revoked formal session must drive the shared invalidation path");

const transientResult = await revalidateRuntimeUserSession({
  authState: runtimeAuthState,
  storage,
  fetchImpl: async () => {
    throw new Error("temporary network failure");
  },
});
assert.equal(transientResult.valid, false, "a network failure must not claim session validation");
assert.equal(transientResult.retryable, true, "a network failure must remain retryable instead of logging the user out");
assert.equal(transientResult.invalidation, undefined, "a network failure must not fabricate a server invalidation");

const malformedResult = await revalidateRuntimeUserSession({
  authState: runtimeAuthState,
  storage,
  fetchImpl: async () => createJsonResponse(200, {
    authenticated: true,
    session: runtimeAuthState.session,
    permissions: { user: { userId: "U-EMP-001" } },
  }),
});
assert.equal(malformedResult.valid, false, "a malformed successful revalidation response must not refresh the workspace");
assert.equal(malformedResult.error?.code, "AUTH_REVALIDATION_RESPONSE_INVALID", "a malformed successful revalidation must expose a safe error");
assert.equal(malformedResult.retryable, false, "a malformed successful revalidation response must fail closed instead of remaining retryable");
assert.equal(malformedResult.invalidation?.reason, "runtime_session_response_invalid", "a malformed successful revalidation must invalidate the active browser session");

const originalWindow = globalThis.window;
const sessionStorage = createMemoryStorage();
globalThis.window = { sessionStorage };
try {
  sessionStorage.setItem(seedAuthStorageKey, JSON.stringify(runtimeAuthState.session));
  const state = { auth: runtimeAuthState, loginForm: null, passwordForm: null, passwordError: "old error" };
  const acceptedActions = createRuntimeAuthActions(createActionDependencies({
    state,
    revalidateRuntimeSession: async () => validResult,
  }));
  const accepted = await acceptedActions.revalidateRuntimeUserSession();
  assert.equal(accepted.applied, true, "the active runtime session must accept its matching revalidation response");
  assert.equal(state.auth.reason, "runtime_session_revalidated", "the accepted revalidation must refresh the workspace auth state");
  assert.equal(readStoredSeedSession(sessionStorage)?.expiresAt, "2026-07-16T00:00:00.000Z", "only an accepted revalidation may refresh tab storage");

  sessionStorage.setItem(seedAuthStorageKey, JSON.stringify(runtimeAuthState.session));
  state.auth = runtimeAuthState;
  const malformedActions = createRuntimeAuthActions(createActionDependencies({
    state,
    revalidateRuntimeSession: async () => malformedResult,
  }));
  const invalidated = await malformedActions.revalidateRuntimeUserSession();
  assert.equal(invalidated.invalidation?.reason, "runtime_session_response_invalid", "the malformed result must reach the action-layer invalidation path");
  assert.equal(state.auth.authenticated, false, "a malformed successful revalidation must leave the formal workspace");
  assert.equal(state.auth.reason, "runtime_session_response_invalid", "the failed-closed revalidation must retain its invalidation reason");
  assert.equal(readStoredSeedSession(sessionStorage), null, "a malformed successful revalidation must clear the tab session");

  sessionStorage.setItem(seedAuthStorageKey, JSON.stringify(runtimeAuthState.session));
  state.auth = runtimeAuthState;
  state.toast = "";
  let resolvePasswordChange;
  const passwordChangeActions = createRuntimeAuthActions(createActionDependencies({
    state,
    revalidateRuntimeSession: async () => validResult,
    runtimePasswordChange: () => new Promise((resolve) => { resolvePasswordChange = resolve; }),
  }));
  const delayedPasswordChange = passwordChangeActions.submitRuntimePasswordChange({ preventDefault() {} });
  passwordChangeActions.invalidateRuntimeUserSession({
    reason: "runtime_session_revoked",
    error: { code: "AUTH_TOKEN_REVOKED", message: "当前登录已被撤销，请重新登录。" },
  });
  resolvePasswordChange({ changed: true, permissions: { ...permissions, passwordChangeRequired: false } });
  const stalePasswordChange = await delayedPasswordChange;
  assert.equal(stalePasswordChange.stale, true, "a password-change response after invalidation must be marked stale");
  assert.equal(stalePasswordChange.applied, false, "a password-change response after invalidation must not restore permissions");
  assert.equal(state.auth.authenticated, false, "a stale password-change response must not restore the formal workspace");
  assert.equal(readStoredSeedSession(sessionStorage), null, "a stale password-change response must not restore tab storage");
  assert.equal(state.toast, "", "a stale password-change response must not claim that business permissions were restored");

  sessionStorage.setItem(seedAuthStorageKey, JSON.stringify(runtimeAuthState.session));
  state.auth = runtimeAuthState;
  let resolveDelayedRevalidation;
  const delayedActions = createRuntimeAuthActions(createActionDependencies({
    state,
    revalidateRuntimeSession: () => new Promise((resolve) => { resolveDelayedRevalidation = resolve; }),
  }));
  const delayed = delayedActions.revalidateRuntimeUserSession();
  delayedActions.invalidateRuntimeUserSession({
    reason: "runtime_session_revoked",
    error: { code: "AUTH_TOKEN_REVOKED", message: "当前登录已被撤销，请重新登录。" },
  });
  resolveDelayedRevalidation(validResult);
  const stale = await delayed;
  assert.equal(stale.applied, false, "a response that returns after logout/invalidation must be discarded");
  assert.equal(stale.stale, true, "a response that returns after logout/invalidation must be labeled stale");
  assert.equal(state.auth.authenticated, false, "a stale successful revalidation must not restore the workspace");
  assert.equal(readStoredSeedSession(sessionStorage), null, "a stale successful revalidation must not restore tab storage");

  sessionStorage.setItem(seedAuthStorageKey, JSON.stringify(runtimeAuthState.session));
  state.auth = runtimeAuthState;
  let resolveStateChangedRevalidation;
  const sameTokenActions = createRuntimeAuthActions(createActionDependencies({
    state,
    revalidateRuntimeSession: () => new Promise((resolve) => { resolveStateChangedRevalidation = resolve; }),
  }));
  const sameTokenDelayed = sameTokenActions.revalidateRuntimeUserSession();
  const passwordChangedState = {
    ...runtimeAuthState,
    reason: "runtime_password_changed",
    passwordPolicy: null,
    permissions: {
      ...permissions,
      passwordChangeRequired: false,
      user: { ...permissions.user, mustChangePassword: false },
    },
  };
  state.auth = passwordChangedState;
  resolveStateChangedRevalidation({
    ...validResult,
    authState: {
      ...validResult.authState,
      passwordPolicy: { minLength: 8 },
      permissions: {
        ...validResult.authState.permissions,
        passwordChangeRequired: true,
        user: { ...validResult.authState.permissions.user, mustChangePassword: true },
      },
    },
  });
  await sameTokenDelayed;
  assert.equal(state.auth, passwordChangedState, "a delayed revalidation must not overwrite a newer auth state when the token itself did not rotate");
  assert.equal(state.auth.passwordPolicy, null, "a delayed pre-change response must not restore the password-change screen");
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../src/app/useRuntimeSessionExpiry.js", import.meta.url), "utf8");
assert.match(appSource, /useRuntimeSessionRevalidation\(\{ authState, enabled: runtimeServerRequired, onRevalidate: revalidateRuntimeUserSession \}\)/);
assert.match(hookSource, /documentRef\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
assert.match(hookSource, /browser\.addEventListener\("focus", handleFocus\)/);
assert.match(hookSource, /setInterval\(\(\) =>/);
assert.match(hookSource, /clearInterval\(intervalId\)/);

console.log("Runtime session revalidation checks passed: current-session refresh, visible-tab scheduling, invalidation handoff, and transient-network retention are covered.");

function createActionDependencies({ state, revalidateRuntimeSession, runtimePasswordChange }) {
  return {
    authState: runtimeAuthState,
    runtimeLoginForm: { loginName: "erp.0001", password: "" },
    runtimeLoginLoading: false,
    runtimePasswordChangeForm: { currentPassword: "old", newPassword: "new", confirmPassword: "new" },
    runtimePasswordChangeLoading: false,
    runtimeServerRequired: true,
    revalidateRuntimeSession,
    runtimePasswordChange,
    setAuthState: (next) => { state.auth = typeof next === "function" ? next(state.auth) : next; },
    setRuntimeLoginForm: (next) => { state.loginForm = typeof next === "function" ? next(state.loginForm) : next; },
    setRuntimeLoginLoading: () => {},
    setRuntimePasswordChangeError: (next) => { state.passwordError = next; },
    setRuntimePasswordChangeForm: (next) => { state.passwordForm = typeof next === "function" ? next(state.passwordForm) : next; },
    setRuntimePasswordChangeLoading: () => {},
    setToast: (next) => { state.toast = next; },
  };
}

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    clone() {
      return { json: async () => body };
    },
    json: async () => body,
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
