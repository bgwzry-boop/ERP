import assert from "node:assert/strict";
import { createRuntimeAuthActions } from "../src/app/createRuntimeAuthActions.js";
import { readStoredSeedSession, seedAuthStorageKey } from "../src/services/officeAuthService.js";

const originalWindow = globalThis.window;
const sessionStorage = createMemoryStorage();
globalThis.window = { sessionStorage };

try {
  const initialAuthState = {
    source: "server_required",
    authenticated: false,
    session: null,
    permissions: { actionPermissions: [] },
    reason: "initial_login_required",
  };
  const state = { auth: initialAuthState, loginForm: { loginName: "erp.0001", password: "secret" }, loading: [] };
  const deferredResults = [];
  const runtimeLoginRequestRef = { current: 0 };
  sessionStorage.setItem(seedAuthStorageKey, JSON.stringify({
    accessToken: "startup-restore-token",
    sessionType: "runtime",
    userId: "U-OLD",
  }));

  const actions = createRuntimeAuthActions({
    authState: initialAuthState,
    runtimeLoginForm: state.loginForm,
    runtimeLoginLoading: false,
    runtimePasswordChangeForm: { currentPassword: "", newPassword: "", confirmPassword: "" },
    runtimePasswordChangeLoading: false,
    runtimeServerRequired: true,
    runtimeLoginRequestRef,
    runtimeLogin: () => new Promise((resolve) => deferredResults.push(resolve)),
    setAuthState: (next) => { state.auth = typeof next === "function" ? next(state.auth) : next; },
    setRuntimeLoginForm: (next) => { state.loginForm = typeof next === "function" ? next(state.loginForm) : next; },
    setRuntimeLoginLoading: (next) => { state.loading.push(next); },
    setRuntimePasswordChangeError: () => {},
    setRuntimePasswordChangeForm: () => {},
    setRuntimePasswordChangeLoading: () => {},
    setToast: () => {},
  });

  const event = { preventDefault() {} };
  const firstLogin = actions.submitRuntimeLogin(event);
  const secondLogin = actions.submitRuntimeLogin(event);
  assert.equal(deferredResults.length, 2, "concurrent login submissions must create independently ordered requests");
  assert.equal(state.auth.reason, "runtime_login_pending", "a login request must leave the workspace in a pending unauthenticated state");
  assert.equal(readStoredSeedSession(sessionStorage), null, "a manual login must invalidate any unaccepted startup-restoration session");

  deferredResults[1](createRuntimeLoginState("runtime-newest-token", "U-NEW", "新登录"));
  await secondLogin;
  assert.equal(state.auth.session.accessToken, "runtime-newest-token", "the newest login response must enter the workspace");
  assert.equal(readStoredSeedSession(sessionStorage)?.accessToken, "runtime-newest-token", "only the accepted newest login may persist its session");
  assert.equal(state.loginForm.password, "", "a successful latest login must clear the password input");

  deferredResults[0]({
    source: "server_required",
    authenticated: false,
    session: null,
    permissions: { actionPermissions: [] },
    reason: "login_failed",
  });
  await firstLogin;
  assert.equal(state.auth.session.accessToken, "runtime-newest-token", "a stale rejected login must not remove the newer authenticated workspace");
  assert.equal(readStoredSeedSession(sessionStorage)?.accessToken, "runtime-newest-token", "a stale rejected login must not clear the newer session storage");
  assert.equal(state.loading.at(-1), false, "only the newest completed login request may finish the loading state");
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}

console.log("Runtime login ordering checks passed: startup restoration is superseded, and stale login responses cannot overwrite or clear the newest session.");

function createRuntimeLoginState(accessToken, userId, displayName) {
  return {
    source: "api_runtime",
    authenticated: true,
    session: { accessToken, sessionType: "runtime", userId },
    permissions: {
      user: { userId, displayName, mustChangePassword: false },
      actionPermissions: ["todo.read"],
    },
    reason: "login_runtime_session",
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
