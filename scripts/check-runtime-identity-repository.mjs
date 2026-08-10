import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import {
  hashRuntimeUserPassword,
  isRuntimeUserPasswordHashCurrent,
  isRuntimeUserPasswordHashUpgradeRequired,
  verifyRuntimeUserPassword,
} from "../server/authSeed.mjs";
import {
  buildLoadRuntimeIdentityStateQuery,
  buildLoadRuntimeIdentityStateSql,
  buildSaveRuntimeIdentityStateQuery,
  buildSaveRuntimeIdentityStateSql,
  createRuntimeIdentityRepository,
  mergeRuntimeIdentityStateIntoWorkspace,
  runtimeIdentityStoreKey,
} from "../server/runtimeIdentityRepository.mjs";
import {
  closeTestServer,
  getJson,
  getTestServerBaseUrl,
  listenTestServer,
  postJson,
} from "./helpers/apiIntegrationTestHarness.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "runtime-identity");
rmSync(storageRoot, { recursive: true, force: true });
process.env.ERP_LOCAL_STORAGE_DIR = storageRoot;

const userId = "U-EMP-RUNTIME-CHECK";
const loginName = "emp.runtime.check";
const temporaryPassword = "runtime-temp-password-001";
const changedPasswordValue = "runtime-new-password-001";
const expiredUserId = "U-EMP-RUNTIME-EXPIRED-CHECK";
const expiredLoginName = "emp.runtime.expired.check";
const expiredPassword = "runtime-expired-password-001";
const expiredChangedAt = "2026-01-01T00:00:00.000Z";
const expiredLoginAt = "2026-07-04T00:00:00.000Z";
const expiredChangedPasswordValue = "runtime-expired-new-password-001";
const issuedAt = "2026-01-01T00:00:00.000Z";
const accountOperationLogId = "LOG-EMP-RUNTIME-CHECK";
const assignmentOperationLogId = "LOG-EMP-RUNTIME-ASSIGNMENT-CHECK";
const assignmentOccurredAt = "2026-01-02T08:30:00.000Z";
const assignmentReason = "运行时身份调配审计读回检查";
const mergeOperationLogId = "LOG-EMP-RUNTIME-MERGE-CHECK";
const identityConfirmationOperationLogId = "LOG-EMP-RUNTIME-IDENTITY-CONFIRMATION-CHECK";
const authSecret = "runtime-identity-check-auth-secret";
const temporaryPasswordHash = hashRuntimeUserPassword(temporaryPassword, { userId, authSecret });
const secondTemporaryPasswordHash = hashRuntimeUserPassword(temporaryPassword, { userId, authSecret });
const expiredLegacyPasswordHash = buildLegacyRuntimePasswordHash(expiredUserId, expiredPassword, authSecret);

assert.notEqual(temporaryPasswordHash, secondTemporaryPasswordHash, "scrypt hashes must use random salts");
assert.equal(isRuntimeUserPasswordHashCurrent({ userId, passwordHash: temporaryPasswordHash }), true);
assert.equal(verifyRuntimeUserPassword({ userId, passwordHash: temporaryPasswordHash }, temporaryPassword, { authSecret }), true);
assert.equal(verifyRuntimeUserPassword({ userId, passwordHash: temporaryPasswordHash }, "wrong-password", { authSecret }), false);
assert.equal(isRuntimeUserPasswordHashUpgradeRequired(expiredLegacyPasswordHash), true);

const repository = createRuntimeIdentityRepository({ storageRoot });
assert.equal(repository.kind, "local_json");
repository.saveState({
  workspace: {
    users: [
      {
        id: userId,
        userId,
        loginName,
        displayName: "运行期账号检查",
        defaultRole: "workshop",
        department: "workshop",
        defaultMachineId: "BAG-01",
        enabled: true,
        roles: ["workshop"],
        employeeId: "EMP-RUNTIME-CHECK",
        source: "master_data_import_review",
        loginEnabled: true,
        passwordHash: temporaryPasswordHash,
        passwordStatus: "temporary_password_issued",
        mustChangePassword: true,
        passwordIssuedAt: issuedAt,
        sessionValidAfter: issuedAt,
        sessionVersion: 1,
        updatedAt: issuedAt,
      },
      {
        id: expiredUserId,
        userId: expiredUserId,
        loginName: expiredLoginName,
        displayName: "运行期过期账号检查",
        defaultRole: "workshop",
        department: "workshop",
        defaultMachineId: "BAG-01",
        enabled: true,
        roles: ["workshop"],
        employeeId: "EMP-RUNTIME-EXPIRED-CHECK",
        source: "master_data_import_review",
        loginEnabled: true,
        passwordHash: expiredLegacyPasswordHash,
        passwordStatus: "active",
        mustChangePassword: false,
        passwordChangedAt: expiredChangedAt,
        passwordExpiresAt: "2026-04-01T00:00:00.000Z",
        sessionVersion: 1,
        updatedAt: expiredChangedAt,
      },
    ],
    employees: [
      {
        id: "EMP-RUNTIME-CHECK",
        bizNo: "EMP-RUNTIME-CHECK",
        userId,
        loginName,
        name: "运行期账号检查",
        roleName: "车间报工",
        defaultWorkshop: "1号车间",
        defaultMachineId: "BAG-01",
        assignmentMode: "fixed_machine",
        assignmentUpdatedBy: "U-STALE-AUDIT",
        assignmentUpdatedAt: issuedAt,
        assignmentNote: "陈旧摘要",
        accountEnabled: true,
        profileStatus: "account_enabled",
        requestedEnabled: true,
        updatedAt: assignmentOccurredAt,
      },
    ],
    phoneVerificationChallenges: [
      {
        id: "PHONE-VERIFY-RUNTIME-CHECK",
        phoneE164: "+8613800000001",
        purpose: "registration",
        codeHash: createHmac("sha256", authSecret).update("runtime-phone-code-check").digest("hex"),
        requestedAt: issuedAt,
        expiresAt: "2026-01-01T00:05:00.000Z",
        failedAttempts: 0,
        maxAttempts: 5,
        deliveryStatus: "sent",
        deliveryReference: "CHECK-DELIVERY-1",
        createdAt: issuedAt,
        updatedAt: issuedAt,
      },
    ],
    revokedSeedSessions: [],
    operationLogs: [
      {
        id: accountOperationLogId,
        targetType: "master_data_employee_account_review",
        targetId: "EMP-RUNTIME-CHECK",
        action: "master_data_employee_account_enabled",
        before: { accountEnabled: false },
        after: { accountEnabled: true, userId },
        reason: "runtime identity persistence check",
        operatorId: "U-MANAGER-A",
        pageKey: "master_data",
        occurredAt: issuedAt,
        createdAt: issuedAt,
      },
      {
        id: assignmentOperationLogId,
        targetType: "master_data_employee_assignment",
        targetId: "EMP-RUNTIME-CHECK",
        action: "master_data_employee_assignment_updated",
        before: { defaultWorkshop: "", defaultMachineId: "" },
        after: { defaultWorkshop: "1号车间", defaultMachineId: "BAG-01" },
        reason: assignmentReason,
        operatorId: "U-MANAGER-A",
        pageKey: "master_data",
        occurredAt: assignmentOccurredAt,
        createdAt: assignmentOccurredAt,
      },
      {
        id: mergeOperationLogId,
        targetType: "master_data_employee_identity_merge",
        targetId: "EMP-RUNTIME-DUPLICATE-CHECK",
        action: "master_data_employee_identity_merged",
        before: { sourceEmployeeId: "EMP-RUNTIME-DUPLICATE-CHECK" },
        after: { targetEmployeeId: "EMP-RUNTIME-CANONICAL-CHECK" },
        reason: "runtime identity merge persistence check",
        operatorId: "U-MANAGER-A",
        pageKey: "master_data",
        occurredAt: issuedAt,
        createdAt: issuedAt,
      },
      {
        id: identityConfirmationOperationLogId,
        targetType: "master_data_employee_identity_confirmation",
        targetId: "ERP-0001",
        action: "master_data_employee_identity_confirmed",
        before: { employeeId: "ERP-0001", status: "pending_confirmation" },
        after: {
          employeeId: "ERP-0001",
          name: "负责人",
          primaryRoleKey: "management",
          roleKeys: ["management", "finance"],
          status: "confirmed",
        },
        reason: "负责人本人确认员工号和正式显示名",
        operatorId: "U-MANAGER-A",
        pageKey: "master_data",
        occurredAt: issuedAt,
        createdAt: issuedAt,
      },
    ],
  },
});
assert.equal(statSync(join(storageRoot, "metadata")).mode & 0o777, 0o700);
assert.equal(statSync(join(storageRoot, runtimeIdentityStoreKey)).mode & 0o777, 0o600);

let server = null;
let restartedServer = null;
let revokedCheckServer = null;

try {
  server = createApiServer({ authSecret, runtimeIdentityRepositoryOptions: { storageRoot } });
  await listenTestServer(server);
  const baseUrl = getTestServerBaseUrl(server);
  const health = await getJson(baseUrl, "/api/health");
  assert.equal(health.seed.runtimeIdentityRepository, "local_json");

  const temporaryLogin = await postJson(baseUrl, "/api/auth/login", {
    loginName,
    password: temporaryPassword,
  });
  assert.equal(temporaryLogin.permissions.user.userId, userId);
  assert.equal(temporaryLogin.permissions.user.mustChangePassword, true);
  assert.equal(temporaryLogin.permissions.actionPermissions.length, 0);
  assert.equal(temporaryLogin.session.sessionVersion, 1);
  assert.equal(temporaryLogin.session.sessionType, "runtime");
  assert(temporaryLogin.session.accessToken.startsWith("erp-runtime-session-v1."));

  const changedPassword = await postJson(
    baseUrl,
    "/api/auth/change-password",
    {
      currentPassword: temporaryPassword,
      newPassword: changedPasswordValue,
      changeNote: "runtime identity persistence check",
    },
    { headers: { authorization: `Bearer ${temporaryLogin.session.accessToken}` } },
  );
  assert.equal(changedPassword.changed, true);
  assert.equal(changedPassword.user.passwordHash, undefined);
  assert.equal(changedPassword.user.mustChangePassword, false);
  assert.equal(changedPassword.user.passwordStatus, "active");
  assert(changedPassword.permissions.actionPermissions.includes("production.report.complete"));

  await closeTestServer(server);
  server = null;

  restartedServer = createApiServer({ authSecret, runtimeIdentityRepositoryOptions: { storageRoot } });
  await listenTestServer(restartedServer);
  const restartedBaseUrl = getTestServerBaseUrl(restartedServer);

  const oldPasswordAfterRestart = await postJson(
    restartedBaseUrl,
    "/api/auth/login",
    {
      loginName,
      password: temporaryPassword,
    },
    { expectedStatus: 401 },
  );
  assert.equal(oldPasswordAfterRestart.code, "AUTHENTICATION_FAILED");

  const changedLoginAfterRestart = await postJson(restartedBaseUrl, "/api/auth/login", {
    loginName,
    password: changedPasswordValue,
  });
  assert.equal(changedLoginAfterRestart.permissions.user.userId, userId);
  assert.equal(changedLoginAfterRestart.permissions.user.mustChangePassword, false);
  assert(changedLoginAfterRestart.permissions.actionPermissions.includes("production.report.complete"));
  assert.equal(changedLoginAfterRestart.session.sessionType, "runtime");

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const failedLogin = await postJson(
      restartedBaseUrl,
      "/api/auth/login",
      {
        loginName,
        password: `wrong-runtime-password-${attempt}`,
      },
      { expectedStatus: 401 },
    );
    assert.equal(failedLogin.code, "AUTHENTICATION_FAILED");
  }
  const lockedLogin = await postJson(
    restartedBaseUrl,
    "/api/auth/login",
    {
      loginName,
      password: "wrong-runtime-password-5",
    },
    { expectedStatus: 423 },
  );
  assert.equal(lockedLogin.code, "AUTH_ACCOUNT_LOCKED");
  assert(lockedLogin.lockedUntil, "locked login response should expose lockedUntil");
  assert.equal(lockedLogin.securityPolicy.maxFailedLoginAttempts, 5);
  const correctPasswordWhileLocked = await postJson(
    restartedBaseUrl,
    "/api/auth/login",
    {
      loginName,
      password: changedPasswordValue,
    },
    { expectedStatus: 423 },
  );
  assert.equal(correctPasswordWhileLocked.code, "AUTH_ACCOUNT_LOCKED");

  const expiredLogin = await postJson(restartedBaseUrl, "/api/auth/login", {
    loginName: expiredLoginName,
    password: expiredPassword,
    attemptedAt: expiredLoginAt,
  });
  assert.equal(expiredLogin.permissions.user.userId, expiredUserId);
  assert.equal(expiredLogin.permissions.passwordChangeRequired, true);
  assert.equal(expiredLogin.permissions.user.passwordStatus, "password_expired");
  assert.equal(expiredLogin.permissions.actionPermissions.length, 0);
  const migratedExpiredUser = createRuntimeIdentityRepository({ storageRoot })
    .loadState()
    .users.find((item) => item.userId === expiredUserId);
  assert.equal(isRuntimeUserPasswordHashCurrent(migratedExpiredUser), true);
  assert.equal(isRuntimeUserPasswordHashUpgradeRequired(migratedExpiredUser), false);
  const expiredPasswordChange = await postJson(
    restartedBaseUrl,
    "/api/auth/change-password",
    {
      currentPassword: expiredPassword,
      newPassword: expiredChangedPasswordValue,
      changedAt: expiredLoginAt,
      changeNote: "runtime identity expiry check",
    },
    { headers: { authorization: `Bearer ${expiredLogin.session.accessToken}` } },
  );
  assert.equal(expiredPasswordChange.changed, true);
  assert.equal(expiredPasswordChange.user.passwordStatus, "active");
  assert.equal(expiredPasswordChange.user.mustChangePassword, false);
  assert(expiredPasswordChange.user.passwordExpiresAt, "changed password should store next password expiry");
  assert(expiredPasswordChange.permissions.actionPermissions.includes("production.report.complete"));

  const logout = await postJson(
    restartedBaseUrl,
    "/api/auth/logout",
    {},
    { headers: { authorization: `Bearer ${changedLoginAfterRestart.session.accessToken}` } },
  );
  assert.equal(logout.loggedOut, true);
  assert.equal(logout.tokenRevoked, true);

  await closeTestServer(restartedServer);
  restartedServer = null;

  revokedCheckServer = createApiServer({ authSecret, runtimeIdentityRepositoryOptions: { storageRoot } });
  await listenTestServer(revokedCheckServer);
  const revokedCheckBaseUrl = getTestServerBaseUrl(revokedCheckServer);
  const revokedSessionAfterRestart = await getJson(revokedCheckBaseUrl, "/api/auth/me", {
    headers: { authorization: `Bearer ${changedLoginAfterRestart.session.accessToken}` },
    expectedStatus: 401,
  });
  assert.equal(revokedSessionAfterRestart.code, "AUTH_TOKEN_REVOKED");

  const reloaded = createRuntimeIdentityRepository({ storageRoot }).loadState();
  const persistedUser = reloaded.users.find((item) => item.userId === userId);
  assert(persistedUser, "runtime user should reload from local identity store");
  assert.equal(persistedUser.passwordStatus, "active");
  assert.equal(persistedUser.mustChangePassword, false);
  assert.equal(persistedUser.failedLoginCount, 5);
  assert(persistedUser.lockedUntil, "runtime user lock state should persist");
  const expiredPersistedUser = reloaded.users.find((item) => item.userId === expiredUserId);
  assert(expiredPersistedUser, "expired runtime user should reload from local identity store");
  assert.equal(expiredPersistedUser.passwordStatus, "active");
  assert.equal(expiredPersistedUser.mustChangePassword, false);
  assert(expiredPersistedUser.passwordExpiresAt);
  assert(reloaded.revokedSeedSessionJtis.includes(changedLoginAfterRestart.session.jti));
  assert.equal(reloaded.phoneVerificationChallenges.length, 1);
  assert(reloaded.operationLogs.some((log) => log.id === accountOperationLogId));
  assert(reloaded.operationLogs.some((log) => log.id === assignmentOperationLogId));
  assert(reloaded.operationLogs.some((log) => log.id === mergeOperationLogId));
  assert(reloaded.operationLogs.some((log) => log.id === identityConfirmationOperationLogId));
  const reloadedEmployeeAccount = reloaded.employeeAccounts.find((item) => item.id === "EMP-RUNTIME-CHECK");
  assert(reloadedEmployeeAccount, "runtime employee account should reload from local identity store");
  assert.equal(reloadedEmployeeAccount.assignmentUpdatedBy, "U-MANAGER-A");
  assert.equal(reloadedEmployeeAccount.assignmentUpdatedAt, assignmentOccurredAt);
  assert.equal(reloadedEmployeeAccount.assignmentNote, assignmentReason);

  const mergedWorkspace = { users: [], operationLogs: [] };
  const merged = mergeRuntimeIdentityStateIntoWorkspace(mergedWorkspace, reloaded);
  assert(merged.operationLogs.some((log) => log.id === accountOperationLogId));

  const persistedJson = readFileSync(join(storageRoot, runtimeIdentityStoreKey), "utf8");
  assert.equal(persistedJson.includes(temporaryPassword), false);
  assert.equal(persistedJson.includes(changedPasswordValue), false);
  assert.equal(persistedJson.includes(expiredPassword), false);
  assert.equal(persistedJson.includes(expiredChangedPasswordValue), false);

  const loadSql = buildLoadRuntimeIdentityStateSql();
  assert(loadSql.includes("seed_session_revocations"));
  assert(loadSql.includes("source IN ('master_data_import_review', 'phone_self_registration')"));
  assert(loadSql.includes("phone_verification_challenges"));
  assert(loadSql.includes("master_data_employee_account_review"));
  assert(loadSql.includes("master_data_employee_account_password"));
  assert(loadSql.includes("master_data_employee_assignment"));
  assert(loadSql.includes("master_data_employee_identity_confirmation"));
  const loadQuery = buildLoadRuntimeIdentityStateQuery();
  assert.equal(loadQuery.text, loadSql);
  assert.deepEqual(loadQuery.values, []);
  const identityEmployeeUpdates = [
    {
      id: "EMP-RUNTIME-DUPLICATE-CHECK",
      name: "重复员工",
      accountEnabled: false,
      profileStatus: "merged_duplicate",
      requestedEnabled: false,
      remark: "已合并至 EMP-RUNTIME-CANONICAL-CHECK",
      updatedAt: issuedAt,
    },
  ];
  const saveQuery = buildSaveRuntimeIdentityStateQuery(reloaded, { identityEmployeeUpdates });
  const saveSql = buildSaveRuntimeIdentityStateSql(reloaded, { identityEmployeeUpdates });
  assert(saveSql.includes("ON CONFLICT (id) DO UPDATE"));
  assert(saveSql.includes("ON CONFLICT (jti) DO UPDATE"));
  assert(saveSql.includes("INSERT INTO phone_verification_challenges"));
  assert(saveSql.includes("UPDATE employees"));
  assert(saveSql.includes("employee_assignment_updates"));
  assert(saveSql.includes("employee_identity_updates"));
  assert(saveSql.includes("updated_employee_identities"));
  assert(saveSql.includes("default_workshop = employee_assignment_updates.default_workshop"));
  assert(saveSql.includes("INSERT INTO operation_logs"));
  assert(saveSql.includes("savedOperationLogCount"));
  assert.doesNotMatch(saveSql, /runtime-new-password-001/);
  assert.match(saveSql, /\$\d+::jsonb/);
  assert.equal(saveQuery.text, saveSql);
  assert.ok(saveQuery.values.length > 30);

const postgresCalls = [];
const postgresLoadState = {
  ...reloaded,
  employeeAccounts: reloaded.employeeAccounts.map((account) => ({
    ...account,
    assignmentUpdatedBy: "",
    assignmentUpdatedAt: "",
    assignmentNote: "",
  })),
};
const postgresRepository = createRuntimeIdentityRepository({
  mode: "postgres",
  queryJson(text, values) {
    postgresCalls.push({ kind: "query", text, values });
    return postgresLoadState;
  },
  transactionJson(text, values) {
    postgresCalls.push({ kind: "transaction", text, values });
    return {
      savedUserCount: reloaded.users.length,
      revokedSessionCount: reloaded.revokedSeedSessions.length,
      savedOperationLogCount: reloaded.operationLogs.length,
      updatedEmployeeCount: 1,
      updatedEmployeeAssignmentCount: 1,
      updatedEmployeeIdentityCount: identityEmployeeUpdates.length,
    };
  },
});
const postgresState = await postgresRepository.loadState();
const postgresSaved = await postgresRepository.saveState({
  workspace: {
    users: reloaded.users,
    revokedSeedSessions: reloaded.revokedSeedSessions,
    operationLogs: reloaded.operationLogs,
  },
  identityEmployeeUpdates,
});
assert.equal(postgresRepository.kind, "postgres");
assert.equal(postgresState.users.length, reloaded.users.length);
assert.equal(postgresState.employeeAccounts[0].assignmentUpdatedBy, "U-MANAGER-A");
assert.equal(postgresState.employeeAccounts[0].assignmentUpdatedAt, assignmentOccurredAt);
assert.equal(postgresState.employeeAccounts[0].assignmentNote, assignmentReason);
assert.equal(postgresSaved.savedUserCount, reloaded.users.length);
assert.equal(postgresSaved.revokedSessionCount, reloaded.revokedSeedSessions.length);
assert.equal(postgresSaved.savedOperationLogCount, reloaded.operationLogs.length);
assert.equal(postgresSaved.updatedEmployeeCount, 1);
assert.equal(postgresSaved.updatedEmployeeAssignmentCount, 1);
assert.equal(postgresSaved.updatedEmployeeIdentityCount, identityEmployeeUpdates.length);
assert.equal(postgresCalls[0].kind, "query");
assert.equal(postgresCalls[1].kind, "transaction");
assert.match(postgresCalls[1].text, /^\s*WITH saved_users AS/);
assert.match(postgresCalls[1].text, /saved_revoked_sessions AS/);
assert.match(postgresCalls[1].text, /updated_employees AS/);
assert.match(postgresCalls[1].text, /updated_employee_assignments AS/);
assert.match(postgresCalls[1].text, /updated_employee_identities AS/);
assert.match(postgresCalls[1].text, /saved_operation_logs AS/);
assert.match(postgresCalls[1].text, /AS result;\s*$/);
assert.doesNotMatch(postgresCalls[1].text, /\bBEGIN\b|\bCOMMIT\b/);
assert.ok(postgresCalls[1].values.length > 30);
} finally {
  await closeTestServer(server);
  await closeTestServer(restartedServer);
  await closeTestServer(revokedCheckServer);
}

console.log("runtime identity repository check passed");

function buildLegacyRuntimePasswordHash(targetUserId, password, secret) {
  const encodedUserId = Buffer.from(targetUserId, "utf8").toString("base64url");
  const digest = createHmac("sha256", secret)
    .update(`runtime-password-v1:${targetUserId}:${password}`)
    .digest("base64url");
  return `runtime-password-v1.${encodedUserId}.${digest}`;
}
