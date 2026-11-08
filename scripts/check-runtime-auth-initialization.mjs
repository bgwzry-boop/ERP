import assert from "node:assert/strict";
import {
  getRuntimeAuthBoundaryView,
  getTopbarLogoutAction,
  shouldShowRuntimeAuthBoundary,
} from "../src/app/runtimeAuthViewState.js";
import { createElement, useState } from "react";
import { act, create } from "react-test-renderer";
import { applyRuntimeAuthInitializationResult, useRuntimeAuthInitialization } from "../src/app/useRuntimeAuthInitialization.js";
import { getSeedPermissionContext } from "../src/auth/seedPermissions.js";
import { seedAuthStorageKey } from "../src/services/officeAuthService.js";
import { buildOfficeApiHeaders } from "../src/services/officeApiClientCore.js";

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
assert.equal(getRuntimeAuthBoundaryView({
  authState: { authenticated: false, permissions: {} },
  runtimeServerRequired: true,
}), "login", "formal unauthenticated users must remain on the login boundary");
const passwordChangeAuthState = {
  authenticated: true,
  permissions: { passwordChangeRequired: true, user: { mustChangePassword: true } },
  session: { sessionType: "runtime" },
};
assert.equal(getRuntimeAuthBoundaryView({
  authState: passwordChangeAuthState,
  runtimeServerRequired: true,
}), "password_change", "an authoritative runtime password-change requirement must open the change screen");
assert.equal(shouldShowRuntimeAuthBoundary({
  authState: passwordChangeAuthState,
  formalLoginRequired: true,
}), true, "the root and child auth boundaries must agree on the password-change screen");
assert.equal(getRuntimeAuthBoundaryView({
  authState: {
    ...passwordChangeAuthState,
    session: { sessionType: "seed" },
  },
  runtimeServerRequired: true,
}), "none", "a signed seed review session must not be trapped by formal password-change flags");
assert.equal(getRuntimeAuthBoundaryView({
  authState: {
    authenticated: true,
    permissions: { passwordChangeRequired: false, user: { mustChangePassword: false } },
    session: { sessionType: "runtime" },
  },
  runtimeServerRequired: true,
}), "none", "a fully authenticated formal user must enter the workbench");

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

// Mount the actual hook and run the real initialization/login client. A fabricated
// nextAuthState misses loginSeedUser's storage write, which caused the public-phone 403.
const originalWindow = globalThis.window;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
try {
  for (const scenario of ["first_login", "expired_seed", "logout", "new_login", "password_invalidated", "unmount"]) {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
    const expired = { ...previewSeedSession, accessToken: "seed-session.expired" };
    if (scenario === "expired_seed") storage.setItem(seedAuthStorageKey, JSON.stringify(expired));
    globalThis.window = { sessionStorage: storage, localStorage: { removeItem() {} } };
    let resolveLogin;
    const pendingLogin = new Promise((resolve) => { resolveLogin = resolve; });
    const paths = [];
    const authOptions = {
      defaultUserId: "U-MANAGER-A", stagingAuthBypass: true,
      fetchImpl: async (url, init) => {
        const path = new URL(url).pathname;
        paths.push(path);
        if (path.endsWith("/auth/me")) {
          assert.equal(init.headers.authorization, `Bearer ${expired.accessToken}`);
          return new Response(JSON.stringify({ code: "AUTH_TOKEN_EXPIRED" }), { status: 401 });
        }
        assert.ok(path.endsWith("/auth/prototype-login"));
        assert.equal(JSON.parse(init.body).userId, "U-MANAGER-A");
        return pendingLogin;
      },
    };
    let active;
    let changeAuth;
    function MountedInitialization() {
      const [auth, setAuth] = useState(initialAuthState);
      active = auth; changeAuth = setAuth;
      useRuntimeAuthInitialization({ authOptions, authState: auth, serverRequired: false, setAuthState: setAuth });
      return null;
    }
    let mounted;
    await act(async () => { mounted = create(createElement(MountedInitialization)); });
    assert.equal(paths.at(-1).endsWith("/auth/prototype-login"), true);
    let newerState;
    if (scenario === "logout" || scenario === "password_invalidated") {
      newerState = { ...initialAuthState, reason: scenario };
      await act(async () => { storage.removeItem(seedAuthStorageKey); changeAuth(newerState); });
    } else if (scenario === "new_login") {
      newerState = newLoginState;
      await act(async () => { storage.setItem(seedAuthStorageKey, JSON.stringify(newSession)); changeAuth(newerState); });
    } else if (scenario === "unmount") {
      await act(async () => { mounted.unmount(); });
    }
    await act(async () => {
      resolveLogin(new Response(JSON.stringify({ authenticated: true, session: previewSeedSession, permissions: getSeedPermissionContext("U-MANAGER-A") }), { status: 200 }));
    });
    const stored = JSON.parse(storage.getItem(seedAuthStorageKey) ?? "null");
    if (scenario === "first_login" || scenario === "expired_seed") {
      assert.equal(active.authenticated, true, `${scenario}: real hook must apply the signed response`);
      assert.deepEqual(stored, previewSeedSession);
      const headers = buildOfficeApiHeaders(active, "U-MANAGER-A", {}, { serverRequired: false });
      assert.equal(headers.authorization, `Bearer ${previewSeedSession.accessToken}`);
      assert.equal(headers["x-erp-user-id"], undefined, "signed phone requests must not use the unsigned identity header");
    } else {
      if (newerState) assert.equal(active, newerState, `${scenario}: late initialization must not revive/replace auth`);
      assert.deepEqual(stored, scenario === "new_login" ? newSession : null, `${scenario}: late login must not mutate real storage`);
    }
    if (scenario !== "unmount") await act(async () => { mounted.unmount(); });
  }
} finally {
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT; else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
}

console.log("Runtime auth initialization passed: existing CAS guards and 6 mounted real-client scenarios (first signed login, expired re-sign, logout, new login, password invalidation, unmount); signed requests carry Bearer only.");

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
