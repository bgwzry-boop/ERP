import assert from "node:assert/strict";
import { createRuntimeAuthActions } from "../src/app/createRuntimeAuthActions.js";
import {
  getRuntimeSessionExpiryDecision,
  startRuntimeSessionExpiryMonitor,
} from "../src/app/useRuntimeSessionExpiry.js";
import { seedAuthStorageKey } from "../src/services/officeAuthService.js";

const nowMs = Date.parse("2026-07-15T00:00:00.000Z");
assert.deepEqual(getRuntimeSessionExpiryDecision({}, nowMs), { kind: "inactive" });
assert.deepEqual(
  getRuntimeSessionExpiryDecision({ authenticated: true, session: { sessionType: "seed", expiresAt: "2026-07-15T01:00:00.000Z" } }, nowMs),
  { kind: "inactive" },
);
assert.deepEqual(
  getRuntimeSessionExpiryDecision({ authenticated: true, session: { sessionType: "runtime", expiresAt: "2026-07-15T00:00:01.250Z" } }, nowMs),
  { kind: "schedule", delayMs: 1250 },
);
assert.equal(
  getRuntimeSessionExpiryDecision({ authenticated: true, session: { sessionType: "runtime", expiresAt: "2026-07-14T23:59:59.999Z" } }, nowMs).error.code,
  "AUTH_TOKEN_EXPIRED",
);
assert.equal(
  getRuntimeSessionExpiryDecision({ authenticated: true, session: { sessionType: "runtime", expiresAt: "" } }, nowMs).error.code,
  "AUTH_SESSION_EXPIRY_INVALID",
);

let scheduledTimeout = null;
let clearedTimeoutId = null;
let monitorNowMs = nowMs;
const monitorExpirations = [];
const disposeExpiryMonitor = startRuntimeSessionExpiryMonitor({
  authState: {
    authenticated: true,
    session: { sessionType: "runtime", expiresAt: "2026-07-15T00:00:01.250Z" },
  },
  onExpire: (decision) => monitorExpirations.push(decision),
  now: () => monitorNowMs,
  setTimeoutImpl: (callback, delayMs) => {
    scheduledTimeout = { callback, delayMs, id: "runtime-expiry-timer" };
    return scheduledTimeout.id;
  },
  clearTimeoutImpl: (timeoutId) => { clearedTimeoutId = timeoutId; },
});
assert.equal(scheduledTimeout.delayMs, 1250, "the expiry monitor must schedule the exact remaining session lifetime");
monitorNowMs = Date.parse("2026-07-15T00:00:01.250Z");
scheduledTimeout.callback();
assert.equal(monitorExpirations.length, 1, "the scheduled check must expire the session once its deadline arrives");
assert.equal(monitorExpirations[0].error.code, "AUTH_TOKEN_EXPIRED");
disposeExpiryMonitor();
assert.equal(clearedTimeoutId, "runtime-expiry-timer", "disposing the monitor must clear its outstanding browser timer");

const invalidExpiryDecisions = [];
const disposeInvalidExpiryMonitor = startRuntimeSessionExpiryMonitor({
  authState: { authenticated: true, session: { sessionType: "runtime", expiresAt: "" } },
  onExpire: (decision) => invalidExpiryDecisions.push(decision),
  now: () => nowMs,
  setTimeoutImpl: () => assert.fail("an invalid expiry must fail closed without scheduling a timer"),
});
assert.equal(invalidExpiryDecisions[0].error.code, "AUTH_SESSION_EXPIRY_INVALID");
disposeInvalidExpiryMonitor();

const originalWindow = globalThis.window;
const sessionStorage = createMemoryStorage();
globalThis.window = { sessionStorage };
try {
  sessionStorage.setItem(seedAuthStorageKey, JSON.stringify({ accessToken: "runtime-session" }));
  const state = { auth: null, loginForm: null, passwordForm: null, passwordError: "old error" };
  const actions = createRuntimeAuthActions({
    authState: {
      authenticated: true,
      session: { sessionType: "runtime", expiresAt: "2026-07-14T23:59:59.999Z" },
    },
    runtimeLoginForm: { loginName: "office.001", password: "" },
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
  actions.expireRuntimeUserSession(getRuntimeSessionExpiryDecision({
    authenticated: true,
    session: { sessionType: "runtime", expiresAt: "2026-07-14T23:59:59.999Z" },
  }, nowMs));
  assert.equal(sessionStorage.getItem(seedAuthStorageKey), null, "expired runtime session must be removed from tab storage");
  assert.equal(state.auth.authenticated, false, "expired runtime session must leave the business workspace");
  assert.equal(state.auth.error.code, "AUTH_TOKEN_EXPIRED", "expired runtime session must show the login-boundary error");
  assert.deepEqual(state.loginForm, { loginName: "", password: "" }, "expired runtime session must clear the login form");
  assert.deepEqual(state.passwordForm, { currentPassword: "", newPassword: "", confirmPassword: "" }, "expired runtime session must clear the password form");
  assert.equal(state.passwordError, "", "expired runtime session must clear password errors");
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}

console.log("Runtime session expiry checks passed: active-session scheduling, fail-closed expiry, tab cleanup, and workspace exit are covered.");

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
