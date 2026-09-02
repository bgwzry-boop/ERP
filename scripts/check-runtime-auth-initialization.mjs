import assert from "node:assert/strict";
import {
  getTopbarLogoutAction,
  shouldShowRuntimeAuthBoundary,
} from "../src/app/runtimeAuthViewState.js";
import { applyRuntimeAuthInitializationResult } from "../src/app/useRuntimeAuthInitialization.js";

const initialAuthState = {
  authenticated: false,
  source: "server_required",
  session: null,
};
const restoredSession = {
  accessToken: "runtime-stored-token",
  sessionType: "runtime",
  userId: "U-EMP-001",
};
const restoredAuthState = {
  authenticated: true,
  source: "api_runtime",
  session: restoredSession,
  permissions: { user: { userId: "U-EMP-001", displayName: "旧会话用户" } },
};
const newSession = {
  accessToken: "runtime-new-login-token",
  sessionType: "runtime",
  userId: "U-EMP-002",
};
const newLoginState = {
  authenticated: true,
  source: "api_runtime",
  session: newSession,
  permissions: { user: { userId: "U-EMP-002", displayName: "新登录用户" } },
};

assert.equal(shouldShowRuntimeAuthBoundary({ formalLoginRequired: false }), false);
assert.equal(shouldShowRuntimeAuthBoundary({
  authState: { authenticated: false, permissions: {} },
  formalLoginRequired: true,
}), true, "formal unauthenticated users must remain on the login boundary");
assert.equal(shouldShowRuntimeAuthBoundary({
  authState: { authenticated: true, permissions: { passwordChangeRequired: true } },
  currentUser: { mustChangePassword: false },
  formalLoginRequired: true,
}), true, "an authoritative password-change requirement must keep the formal auth boundary open");
assert.equal(shouldShowRuntimeAuthBoundary({
  authState: { authenticated: true, permissions: {} },
  currentUser: { mustChangePassword: true },
  formalLoginRequired: true,
}), true, "a user-level password-change requirement must keep the formal auth boundary open");
assert.equal(shouldShowRuntimeAuthBoundary({
  authState: { authenticated: true, permissions: {} },
  currentUser: { mustChangePassword: false },
  formalLoginRequired: true,
}), false, "a fully authenticated formal user must enter the workbench");

const logoutRuntimeUserSession = () => {};
assert.equal(getTopbarLogoutAction({
  authState: { authenticated: true },
  formalLoginRequired: true,
  logoutRuntimeUserSession,
}), logoutRuntimeUserSession, "an authenticated formal user must receive the real logout action");
assert.equal(getTopbarLogoutAction({
  authState: { authenticated: false },
  formalLoginRequired: true,
  logoutRuntimeUserSession,
}), undefined, "an unauthenticated formal user must not receive a topbar logout action");
assert.equal(getTopbarLogoutAction({
  authState: { authenticated: true },
  formalLoginRequired: false,
  logoutRuntimeUserSession,
}), undefined, "the review seed switcher must not masquerade as formal logout");

const previewSeedSession = {
  accessToken: "seed-session.staging-preview",
  sessionType: "seed",
  userId: "U-MANAGER-A",
};
const previewSeedState = {
  authenticated: true,
  source: "api_seed",
  reason: "login_seed_session",
  session: previewSeedSession,
  permissions: { user: { userId: "U-MANAGER-A", displayName: "管理A" } },
};
const previewBootstrap = createAuthHarness({
  authState: initialAuthState,
  session: null,
});
assert.equal(applyRuntimeAuthInitializationResult({
  expectedAuthState: initialAuthState,
  expectedSession: null,
  nextAuthState: previewSeedState,
  ...previewBootstrap,
}), true, "an explicit staging preview may install its newly issued signed seed session");
assert.equal(previewBootstrap.state.auth, previewSeedState, "the staging preview seed state must become active");
assert.deepEqual(previewBootstrap.readSession(), previewSeedSession, "the staging preview seed token must be retained");

const matching = createAuthHarness({
  authState: initialAuthState,
  session: restoredSession,
});
assert.equal(applyRuntimeAuthInitializationResult({
  expectedAuthState: initialAuthState,
  expectedSession: restoredSession,
  nextAuthState: restoredAuthState,
  ...matching,
}), true, "an unchanged stored session must be restorable");
assert.equal(matching.state.auth, restoredAuthState, "the matching startup restoration must apply its returned auth state");
assert.deepEqual(matching.readSession(), restoredSession, "the matching startup restoration must retain the restored session");

const newLoginDuringRestore = createAuthHarness({
  authState: newLoginState,
  session: newSession,
});
assert.equal(applyRuntimeAuthInitializationResult({
  expectedAuthState: initialAuthState,
  expectedSession: restoredSession,
  nextAuthState: restoredAuthState,
  ...newLoginDuringRestore,
}), false, "an old startup response must not apply after a newer login changed the tab session");
assert.equal(newLoginDuringRestore.state.auth, newLoginState, "an old startup response must not replace the newer logged-in workspace");
assert.deepEqual(newLoginDuringRestore.readSession(), newSession, "an old startup response must not rewrite the newer stored session");

const invalidOldSessionAfterNewLogin = createAuthHarness({
  authState: newLoginState,
  session: newSession,
});
assert.equal(applyRuntimeAuthInitializationResult({
  expectedAuthState: initialAuthState,
  expectedSession: restoredSession,
  nextAuthState: { authenticated: false, source: "server_required", session: null },
  ...invalidOldSessionAfterNewLogin,
}), false, "an old rejected startup response must not clear a newer stored login");
assert.deepEqual(invalidOldSessionAfterNewLogin.readSession(), newSession, "an old rejected startup response must preserve the new stored login");

const sameTokenStateChange = createAuthHarness({
  authState: {
    ...initialAuthState,
    reason: "newer_auth_transition",
  },
  session: restoredSession,
});
assert.equal(applyRuntimeAuthInitializationResult({
  expectedAuthState: initialAuthState,
  expectedSession: restoredSession,
  nextAuthState: restoredAuthState,
  ...sameTokenStateChange,
}), false, "the startup response must not apply when the auth-state generation changed without token rotation");
assert.equal(sameTokenStateChange.state.auth.reason, "newer_auth_transition", "a same-token newer auth state must remain intact");

console.log("Runtime auth initialization checks passed: matching restore, newer-login retention, rejected-old-session retention, and same-token state protection are covered.");

function createAuthHarness({ authState, session }) {
  const state = { auth: authState, session };
  return {
    getCurrentAuthState: () => state.auth,
    readSession: () => state.session,
    writeSession: (next) => { state.session = next; },
    clearSession: () => { state.session = null; },
    setAuthState: (next) => { state.auth = typeof next === "function" ? next(state.auth) : next; },
    state,
  };
}
