import assert from "node:assert/strict";
import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";
import { createPostgresRuntimeIdentityRepository, mergeRuntimeIdentityStateIntoWorkspace } from "../server/runtimeIdentityRepository.mjs";
import { closeSharedPostgresPools } from "../server/postgresPoolClient.mjs";
import { createRuntimeAuthCommandService } from "../server/services/runtimeAuthCommandService.mjs";
import { hashRuntimeUserPassword, verifyRuntimeUserPassword } from "../server/authSeed.mjs";

const runtime = await startLivePostgres();
try {
  const authSecret = "isolated-identity-concurrency-check-secret";
  const userId = "U-IDENTITY-CONCURRENT";
  const password = "CurrentPassword2026";
  const now = "2026-10-23T01:00:00.000Z";
  const repository = () => createPostgresRuntimeIdentityRepository({ databaseUrl: runtime.resolveLiveDatabaseUrl() });
  const service = createRuntimeAuthCommandService({ now: () => new Date(now), buildOperationLog: (_workspace, input) => ({ id: `LOG-ID-${crypto.randomUUID()}`, occurredAt: now, ...input }) });
  async function workspace() {
    const state = { runtimeIdentityRepository: repository(), securityPolicy: { runtimeMode: "production", strictAuth: true, authSecret, allowSeedUsers: false } };
    mergeRuntimeIdentityStateIntoWorkspace(state, await state.runtimeIdentityRepository.loadState());
    return state;
  }
  const initial = await workspace();
  initial.users.push({ id: userId, userId, loginName: "concurrent.employee", displayName: "合成并发测试", source: "subaccount_admin_created", enabled: true, loginEnabled: true, passwordStatus: "active", passwordHash: hashRuntimeUserPassword(password, { userId, authSecret }), mustChangePassword: false, passwordChangedAt: now, passwordExpiresAt: "2027-01-01T00:00:00Z", sessionVersion: 1 });
  await initial.runtimeIdentityRepository.saveState({ workspace: initial });

  // Six distinct repositories/workspaces model independent API processes.
  const workers = await Promise.all(Array.from({ length: 6 }, workspace));
  const attempts = await Promise.all(workers.map((state) => service.login({ workspace: state, body: { loginName: "concurrent.employee", password: "wrong", attemptedAt: "2050-01-01T00:00:00Z" } })));
  assert.ok(attempts.every((result) => [401, 423].includes(result.statusCode)));
  let persisted = await workspace();
  let user = persisted.users.find((item) => item.id === userId);
  assert.equal(user.failedLoginCount, 5);
  assert.ok(Date.parse(user.lockedUntil) > Date.parse(now));
  assert.equal((await service.login({ workspace: persisted, body: { loginName: "concurrent.employee", password, attemptedAt: "2050-01-01T00:00:00Z" } })).statusCode, 423);

  user.failedLoginCount = 0;
  user.lockedUntil = "";
  await persisted.runtimeIdentityRepository.saveState({ workspace: persisted });
  const stale = await workspace();
  const changed = await service.changePassword({ workspace: persisted, body: { currentPassword: password, newPassword: "ReplacementPassword2026", changedAt: "2050-01-01T00:00:00Z" }, authContext: { authenticated: true, source: "runtime_session", userId, sessionVersion: 1 } });
  assert.equal(changed.statusCode, 200);
  stale.users.find((item) => item.id === userId).loginEnabled = false;
  await assert.rejects(stale.runtimeIdentityRepository.saveState({ workspace: stale }), (error) => error.code === "RUNTIME_IDENTITY_CONFLICT");
  persisted = await workspace();
  user = persisted.users.find((item) => item.id === userId);
  assert.equal(Date.parse(user.passwordChangedAt), Date.parse(now));
  assert.equal(verifyRuntimeUserPassword(user, "ReplacementPassword2026", { authSecret }), true);
  assert.equal(user.loginEnabled, true);

  // A later explicit suspension wins. A stale login reloads and cannot enable it.
  const oldLogin = await workspace();
  user.loginEnabled = false;
  user.enabled = false;
  user.sessionVersion += 1;
  await persisted.runtimeIdentityRepository.saveState({ workspace: persisted });
  const disabledLogin = await service.login({ workspace: oldLogin, body: { loginName: "concurrent.employee", password: "ReplacementPassword2026" } });
  assert.notEqual(disabledLogin.statusCode, 200);
  const finalUser = (await workspace()).users.find((item) => item.id === userId);
  assert.equal(finalUser.enabled, false);
  assert.equal(finalUser.loginEnabled, false);
  assert.equal(finalUser.sessionVersion, user.sessionVersion);
  console.log("PostgreSQL identity concurrency passed: six repositories retain lockout; stale state cannot revert password or suspension; client clocks ignored.");
} finally {
  await closeSharedPostgresPools();
  await stopLivePostgres(runtime);
}
