import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRuntimeAuthActions } from "../src/app/createRuntimeAuthActions.js";
import { requestOfficeApi } from "../src/services/officeApiClientCore.js";
import { seedAuthStorageKey } from "../src/services/officeAuthService.js";
import {
  getRuntimeAuthInvalidation,
  runtimeAuthInvalidationEventName,
  subscribeRuntimeAuthInvalidation,
} from "../src/services/runtimeAuthInvalidation.js";

const runtimeAuthState = {
  authenticated: true,
  session: { sessionType: "runtime", accessToken: "runtime-invalidated-token" },
};

assert.deepEqual(
  getRuntimeAuthInvalidation({ authState: runtimeAuthState, status: 401, error: { code: "AUTH_TOKEN_REVOKED" } }),
  {
    reason: "runtime_session_revoked",
    error: { code: "AUTH_TOKEN_REVOKED", message: "当前登录已被撤销，请重新登录。" },
  },
  "a revoked formal runtime token must request browser workspace exit",
);
assert.equal(
  getRuntimeAuthInvalidation({ authState: runtimeAuthState, status: 403, error: { code: "AUTH_TOKEN_REVOKED" } }),
  null,
  "permission denials must not be mistaken for session invalidation",
);
assert.equal(
  getRuntimeAuthInvalidation({ authState: { session: { sessionType: "seed" } }, status: 401, error: { code: "AUTH_TOKEN_REVOKED" } }),
  null,
  "local seed sessions must stay outside the formal runtime invalidation flow",
);
assert.equal(
  getRuntimeAuthInvalidation({ authState: runtimeAuthState, status: 401, error: { code: "AUTH_SESSION_REQUIRED" } }),
  null,
  "a generic missing-session response must not clear an otherwise active workspace",
);

const originalWindow = globalThis.window;
const originalCustomEvent = globalThis.CustomEvent;
const sessionStorage = createMemoryStorage();
const listeners = new Map();
globalThis.window = {
  sessionStorage,
  addEventListener(type, listener) {
    listeners.set(type, listener);
  },
  removeEventListener(type, listener) {
    if (listeners.get(type) === listener) listeners.delete(type);
  },
  dispatchEvent(event) {
    listeners.get(event.type)?.(event);
    return true;
  },
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};

try {
  const state = { auth: null, loginForm: null, passwordForm: null, passwordError: "old error" };
  sessionStorage.setItem(seedAuthStorageKey, JSON.stringify(runtimeAuthState.session));
  const actions = createRuntimeAuthActions({
    authState: runtimeAuthState,
    runtimeLoginForm: { loginName: "erp.0001", password: "" },
    runtimeLoginLoading: false,
    runtimePasswordChangeForm: { currentPassword: "old", newPassword: "new", confirmPassword: "new" },
    runtimePasswordChangeLoading: false,
    runtimeServerRequired: true,
    setAuthState: (value) => { state.auth = value; },
    setRuntimeLoginForm: (value) => { state.loginForm = value; },
    setRuntimeLoginLoading: () => {},
    setRuntimePasswordChangeError: (value) => { state.passwordError = value; },
    setRuntimePasswordChangeForm: (value) => { state.passwordForm = value; },
    setRuntimePasswordChangeLoading: () => {},
    setToast: () => {},
  });
  const received = [];
  const unsubscribe = subscribeRuntimeAuthInvalidation((invalidation) => {
    received.push(invalidation);
    actions.invalidateRuntimeUserSession(invalidation);
  });
  await requestOfficeApi("/todos", {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    authState: runtimeAuthState,
    fetchImpl: async () => createJsonResponse(401, { code: "AUTH_USER_DISABLED", message: "ignored server detail" }),
  });
  unsubscribe();

  assert.equal(received.length, 1, "one rejected business API response must publish one invalidation event");
  assert.equal(received[0].error.code, "AUTH_USER_DISABLED", "the invalidation must preserve the authoritative rejection code");
  assert.equal(sessionStorage.getItem(seedAuthStorageKey), null, "server-disabled runtime users must lose tab storage immediately");
  assert.equal(state.auth.authenticated, false, "server-disabled runtime users must leave the business workspace");
  assert.equal(state.auth.error.code, "AUTH_USER_DISABLED", "the login boundary must identify the invalidation cause");
  assert.deepEqual(state.loginForm, { loginName: "", password: "" }, "invalidation must clear pending login input");
  assert.deepEqual(state.passwordForm, { currentPassword: "", newPassword: "", confirmPassword: "" }, "invalidation must clear pending password input");
  assert.equal(state.passwordError, "", "invalidation must clear stale password errors");
  assert.equal(listeners.has(runtimeAuthInvalidationEventName), false, "the root listener must clean up on unsubscribe");
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
  else globalThis.CustomEvent = originalCustomEvent;
}

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const authServiceSource = readFileSync(new URL("../src/services/officeAuthService.js", import.meta.url), "utf8");
assert.match(appSource, /useRuntimeAuthInvalidation\(\{ enabled: runtimeServerRequired, onInvalidate: invalidateRuntimeUserSession \}\)/);
assert.match(authServiceSource, /notifyRuntimeAuthInvalidationForResponse\(response/);

console.log("Runtime auth invalidation checks passed: authoritative 401 revocation/disable handling clears the formal browser workspace without treating ordinary denials as logout.");

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
