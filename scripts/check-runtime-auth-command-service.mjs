import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hashRuntimeUserPassword,
  verifyRuntimeUserPassword,
} from "../server/authSeed.mjs";
import { createRuntimeAuthCommandService } from "../server/services/runtimeAuthCommandService.mjs";

const apiServerSource = readFileSync(
  new URL("../server/apiServer.mjs", import.meta.url),
  "utf8",
);
assert.match(apiServerSource, /createRuntimeAuthCommandService\(\{ buildOperationLog \}\)/);
assert.doesNotMatch(apiServerSource, /function recordRuntimeUserLoginFailure/);
assert.doesNotMatch(apiServerSource, /const runtimePasswordPolicy/);

const authSecret = "runtime-auth-command-service-secret";
const userId = "U-AUTH-COMMAND-CHECK";
const employeeId = "EMP-AUTH-COMMAND-CHECK";
const loginName = "emp.auth.command.check";
const currentPassword = "CurrentPassword2026";
const nextPassword = "NextPassword2026";
const nowIso = "2026-07-12T02:00:00.000Z";

const service = createRuntimeAuthCommandService({
  now: () => new Date(nowIso),
  buildOperationLog(workspace, input) {
    return {
      id: `LOG-AUTH-${(workspace.operationLogs?.length ?? 0) + 1}`,
      createdAt: nowIso,
      ...input,
    };
  },
});

const failedLoginWorkspace = createWorkspace({ failPersistence: true });
await assert.rejects(
  service.login({
    workspace: failedLoginWorkspace,
    body: { loginName, password: "wrong-password", attemptedAt: nowIso },
  }),
  /identity persistence failed/,
);
assert.equal(failedLoginWorkspace.users[0].failedLoginCount, 0);
assert.equal(failedLoginWorkspace.users[0].lastFailedLoginAt, "");

const workspace = createWorkspace();
const failedLogin = await service.login({
  workspace,
  body: { loginName, password: "wrong-password", attemptedAt: nowIso },
});
assert.equal(failedLogin.statusCode, 401);
assert.equal(failedLogin.response.code, "AUTHENTICATION_FAILED");
assert.equal(workspace.users[0].failedLoginCount, 1);
assert.equal(workspace.persistedStates.length, 1);

const login = await service.login({
  workspace,
  body: { loginName, password: currentPassword, attemptedAt: nowIso },
});
assert.equal(login.statusCode, 200);
assert.equal(login.response.permissions.user.userId, userId);
assert.equal(login.response.session.sessionVersion, 1);
assert.equal(workspace.users[0].failedLoginCount, 0);
assert.equal(workspace.persistedStates.length, 2);

const failedChangeWorkspace = createWorkspace({ failPersistence: true });
const beforeFailedChangeHash = failedChangeWorkspace.users[0].passwordHash;
await assert.rejects(
  service.changePassword({
    workspace: failedChangeWorkspace,
    body: { currentPassword, newPassword: nextPassword, changedAt: nowIso },
    authContext: runtimeAuthContext(),
  }),
  /identity persistence failed/,
);
assert.equal(failedChangeWorkspace.users[0].passwordHash, beforeFailedChangeHash);
assert.equal(failedChangeWorkspace.operationLogs.length, 0);
assert.equal(failedChangeWorkspace.employees[0].passwordStatus, "active");

const changed = await service.changePassword({
  workspace,
  body: { currentPassword, newPassword: nextPassword, changedAt: nowIso },
  authContext: runtimeAuthContext(),
});
assert.equal(changed.statusCode, 200);
assert.equal(changed.response.changed, true);
assert.equal(changed.response.user.passwordHash, undefined);
assert.equal(changed.response.user.passwordStatus, "active");
assert.equal(changed.response.employeeAccountReview.passwordStatus, "active");
assert.equal(workspace.operationLogs[0].action, "master_data_employee_account_password_changed");
assert.equal(
  verifyRuntimeUserPassword(workspace.users[0], nextPassword, { authSecret }),
  true,
);
assert.equal(
  verifyRuntimeUserPassword(workspace.users[0], currentPassword, { authSecret }),
  false,
);

const failedLogoutWorkspace = createWorkspace({ failPersistence: true });
await assert.rejects(
  service.logout({ workspace: failedLogoutWorkspace, authContext: runtimeAuthContext() }),
  /identity persistence failed/,
);
assert.deepEqual(failedLogoutWorkspace.revokedSeedSessionJtis, []);
assert.deepEqual(failedLogoutWorkspace.revokedSeedSessions, []);

const logout = await service.logout({ workspace, authContext: runtimeAuthContext() });
assert.equal(logout.statusCode, 200);
assert.equal(logout.response.tokenRevoked, true);
assert.deepEqual(workspace.revokedSeedSessionJtis, ["JTI-AUTH-COMMAND-CHECK"]);
assert.equal(workspace.revokedSeedSessions[0].userId, userId);

const currentSession = service.getCurrentSession({
  permissionContext: login.response.permissions,
  authContext: runtimeAuthContext(),
});
assert.equal(currentSession.statusCode, 200);
assert.equal(currentSession.response.authenticated, true);
const missingSession = service.getCurrentSession({
  permissionContext: {},
  authContext: { authenticated: false, authError: "AUTH_SESSION_REQUIRED" },
});
assert.equal(missingSession.statusCode, 401);

const prototypeLogin = service.prototypeLogin({
  workspace,
  body: { userId: "U-OFFICE-A" },
});
assert.equal(prototypeLogin.statusCode, 403);
assert.equal(prototypeLogin.response.code, "AUTH_SEED_LOGIN_DISABLED");

function createWorkspace({ failPersistence = false } = {}) {
  const workspace = {
    securityPolicy: {
      runtimeMode: "production",
      strictAuth: true,
      authSecret,
      allowSeedUsers: false,
      allowLegacyIdentityHeaders: false,
      allowActionPermissionOverride: false,
      allowDefaultSeedUser: false,
    },
    users: [
      {
        id: userId,
        userId,
        employeeId,
        loginName,
        displayName: "认证命令测试员工",
        enabled: true,
        loginEnabled: true,
        source: "master_data_import_review",
        defaultRole: "office",
        passwordHash: hashRuntimeUserPassword(currentPassword, { userId, authSecret }),
        passwordStatus: "active",
        mustChangePassword: false,
        passwordChangedAt: "2026-07-01T00:00:00.000Z",
        passwordExpiresAt: "2026-10-01T00:00:00.000Z",
        failedLoginCount: 0,
        lastFailedLoginAt: "",
        lockedUntil: "",
        sessionVersion: 1,
      },
    ],
    employees: [
      {
        id: employeeId,
        bizNo: "EMP-AUTH-001",
        name: "认证命令测试员工",
        roleName: "录单 / 对账",
        userId,
        loginName,
        accountEnabled: true,
        profileStatus: "account_enabled",
        reviewedRoleKey: "office",
        loginEnabled: true,
        passwordStatus: "active",
      },
    ],
    operationLogs: [],
    revokedSeedSessionJtis: [],
    revokedSeedSessions: [],
    persistedStates: [],
  };
  workspace.runtimeIdentityRepository = {
    kind: "check",
    async saveState({ workspace: stagedWorkspace }) {
      if (failPersistence) throw new Error("identity persistence failed");
      workspace.persistedStates.push({
        users: stagedWorkspace.users.map((item) => ({ ...item })),
        employees: stagedWorkspace.employees.map((item) => ({ ...item })),
        operationLogs: stagedWorkspace.operationLogs.map((item) => ({ ...item })),
        revokedSeedSessionJtis: [...stagedWorkspace.revokedSeedSessionJtis],
        revokedSeedSessions: stagedWorkspace.revokedSeedSessions.map((item) => ({ ...item })),
      });
    },
  };
  return workspace;
}

function runtimeAuthContext() {
  return {
    authenticated: true,
    source: "runtime_session",
    userId,
    session: {
      jti: "JTI-AUTH-COMMAND-CHECK",
      userId,
      expiresAt: "2026-07-13T02:00:00.000Z",
    },
  };
}

console.log(
  "Runtime auth command service checks passed: login, password, logout, and persistence-failure rollback are isolated.",
);
