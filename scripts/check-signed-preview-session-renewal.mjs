import assert from "node:assert/strict";
import { createSeedSession, verifySeedSessionToken } from "../server/authSeed.mjs";
import { createRuntimeAuthCommandService } from "../server/services/runtimeAuthCommandService.mjs";
import { getAuthWorkspaceIdentity, startSignedPreviewSessionMonitor } from "../src/app/useSignedPreviewSessionRenewal.js";
import { requestOfficeApi } from "../src/services/officeApiClientCore.js";
import { signedPreviewAuthInvalidationEventName } from "../src/services/runtimeAuthInvalidation.js";

const authSecret = "isolated-preview-renewal-check";
const expired = createSeedSession("U-MANAGER-A", { authSecret, nowMs: Date.now() - 9 * 3600_000, sessionVersion: 1 });
const users = [{ userId: "U-MANAGER-A", identityKind: "seed_fixture", enabled: true, sessionVersion: 1 }];
const workspace = { users, revokedSeedSessionJtis: [], securityPolicy: { runtimeMode: "test", strictAuth: false, allowSeedUsers: true, fixedPreviewUserId: "U-MANAGER-A", authSecret } };
const service = createRuntimeAuthCommandService({ buildOperationLog: () => ({}) });
const renewBody = { userId: "U-MANAGER-A", previousAccessToken: expired.accessToken };
const renewed = service.prototypeLogin({ workspace, body: renewBody });
assert.equal(renewed.statusCode, 200);
assert.equal(renewed.response.session.sessionVersion, 1);
assert.equal(verifySeedSessionToken(renewed.response.session.accessToken, { authSecret, runtimeUsers: users }).valid, true);
for (const [change, code] of [
  [{ revokedSeedSessionJtis: [expired.jti] }, "AUTH_TOKEN_REVOKED"],
  [{ users: [{ ...users[0], sessionVersion: 2 }] }, "AUTH_TOKEN_REVOKED"],
  [{ users: [{ ...users[0], enabled: false }] }, "AUTH_USER_DISABLED"],
]) {
  const changed = { ...workspace, ...change };
  assert.equal(service.prototypeLogin({ workspace: changed, body: renewBody }).response.code, code);
  assert.equal(verifySeedSessionToken(expired.accessToken, { authSecret, runtimeUsers: changed.users, revokedSessionIds: changed.revokedSeedSessionJtis }).reason, code, "revocation/disable must precede expiry");
}
assert.equal(service.prototypeLogin({ workspace, body: { ...renewBody, previousAccessToken: "invalid" } }).response.code, "AUTH_TOKEN_INVALID");
assert.equal(service.prototypeLogin({ workspace, body: { ...renewBody, previousAccessToken: createSeedSession("U-FINANCE-A", { authSecret }).accessToken } }).response.code, "AUTH_TOKEN_INVALID");

const permissions = renewed.response.permissions;
const initial = { authenticated: true, source: "api_seed", session: expired, permissions };
const authOptions = { defaultUserId: "U-MANAGER-A", stagingAuthBypass: true, serverRequired: false };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
  let current = initial, stored = expired, callback, exchanges = 0;
  const statuses = [], timers = [], listeners = new Map();
  const instance = startSignedPreviewSessionMonitor({
    authState: current, authOptions, getCurrentAuthState: () => current,
    readSession: () => stored, writeSession: value => { stored = value; },
    setAuthState: update => { current = update(current); }, onStatus: value => statuses.push(value),
    subscribe: handler => { callback = handler; return () => { callback = null; }; },
    browser: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
    documentRef: { visibilityState: "visible", addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
    setTimeoutImpl: fn => { timers.push(fn); return timers.length; }, clearTimeoutImpl() {},
    exchange: async (_options, previousAccessToken) => { exchanges++; assert.equal(previousAccessToken, expired.accessToken); return { authenticated: true, source: "api_seed", ...renewed.response }; },
    ...options,
  });
  return { instance, statuses, timers, listeners, emit: value => callback?.(value), state: () => current, stored: () => stored, exchanges: () => exchanges, replace: value => { current = value; stored = value.session; } };
}
const first = fixture();
await tick();
assert.equal(first.exchanges(), 1);
assert.equal(first.state().session.accessToken, renewed.response.session.accessToken);
assert.equal(getAuthWorkspaceIdentity(first.state()), expired.accessToken, "same identity renewal preserves editors and unknown-write recovery identity");
assert.equal(first.statuses.at(-1).blocked, false);
first.instance.dispose();
assert.equal(first.listeners.size, 0);

let resolveExchange, exchangeCount = 0;
const pending = fixture({ exchange: () => { exchangeCount++; return new Promise(resolve => { resolveExchange = resolve; }); } });
pending.emit({ accessToken: expired.accessToken, error: { code: "AUTH_TOKEN_EXPIRED" } });
pending.listeners.get("focus")();
assert.equal(exchangeCount, 1, "timer/focus/401 share one pending exchange");
const replacement = { ...initial, session: { ...renewed.response.session, userId: "U-OFFICE-A", accessToken: "new-account-token" }, permissions: { user: { userId: "U-OFFICE-A" } } };
pending.replace(replacement);
resolveExchange({ authenticated: true, ...renewed.response });
await tick();
assert.equal(pending.state(), replacement);
assert.equal(pending.stored().accessToken, "new-account-token", "late renewal cannot overwrite another login");
pending.instance.dispose();

const beforeExpiry = Date.parse(expired.expiresAt) - 1000;
const revoked = fixture({ now: () => beforeExpiry });
revoked.emit({ accessToken: "stale-token", error: { code: "AUTH_TOKEN_EXPIRED" } });
assert.equal(revoked.exchanges(), 0);
revoked.emit({ accessToken: expired.accessToken, error: { code: "AUTH_TOKEN_REVOKED" } });
await revoked.instance.renew();
assert.equal(revoked.exchanges(), 0, "revoked sessions cannot automatically or manually renew through this monitor");
assert.equal(revoked.statuses.at(-1).canRetry, false);
revoked.instance.dispose();

let attempts = 0;
const failing = fixture({ exchange: async () => { attempts++; return attempts === 1 ? { authenticated: false, error: { code: "REQUEST_UNAVAILABLE" } } : { authenticated: true, ...renewed.response }; } });
await tick();
assert.equal(failing.statuses.at(-1).blocked, true);
assert.equal(failing.state(), initial);
await failing.instance.renew();
assert.equal(failing.statuses.at(-1).blocked, false);
assert.equal(attempts, 2);
failing.instance.dispose();

for (const result of [
  { authenticated: false, error: { code: "AUTH_TOKEN_REVOKED" } },
  { authenticated: false, error: { code: "AUTH_USER_DISABLED" } },
  { authenticated: true, ...renewed.response, session: { ...renewed.response.session, userId: "U-FINANCE-A" } },
]) {
  const denied = fixture({ exchange: async () => result });
  await tick();
  assert.equal(denied.statuses.at(-1).blocked, true);
  assert.equal(denied.stored(), expired);
  denied.instance.dispose();
}
let lateResolve;
const disposed = fixture({ exchange: () => new Promise(resolve => { lateResolve = resolve; }) });
disposed.instance.dispose();
lateResolve({ authenticated: true, ...renewed.response });
await tick();
assert.equal(disposed.stored(), expired, "unmounted previews cannot write session storage");
const formal = fixture({ authState: { ...initial, session: { ...expired, sessionType: "runtime" } } });
assert.equal(formal.exchanges(), 0, "formal runtime login remains outside the preview renewal path");

// Exercise the actual request client event without retrying the business POST.
const savedWindow = globalThis.window, savedEvent = globalThis.CustomEvent;
let event, requests = 0;
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
globalThis.window = { dispatchEvent(value) { event = value; } };
try {
  const response = await requestOfficeApi("/production-tasks/fixture/publish-schedule", {
    authState: initial, method: "POST", body: {}, idempotencyKey: "keep-original-write-key",
    fetchImpl: async (_url, request) => { requests++; assert.equal(request.headers["idempotency-key"], "keep-original-write-key"); return new Response(JSON.stringify({ code: "AUTH_TOKEN_EXPIRED" }), { status: 401 }); },
  });
  assert.equal(response.status, 401);
  assert.equal(requests, 1);
  assert.equal(event.type, signedPreviewAuthInvalidationEventName);
  assert.equal(event.detail.accessToken, expired.accessToken);
} finally { globalThis.window = savedWindow; globalThis.CustomEvent = savedEvent; }
console.log("PASS signed preview renewal: expiry/focus/401 dedupe, stable editor identity, no write replay, stale/unmounted guards, retryable network failure, revoked/disabled/version/mismatched identities refused, formal runtime untouched.");
