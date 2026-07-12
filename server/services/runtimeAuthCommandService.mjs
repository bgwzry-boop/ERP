import {
  authenticatePrototypeSeedUser,
  authenticateSeedUser,
  createRuntimeSession,
  createSeedSession,
  getRuntimeAccountSecurityPolicyResponse,
  getRuntimePasswordExpiresAt,
  getRuntimeUserSecurityState,
  hashRuntimeUserPassword,
  isRuntimeUserPasswordHashUpgradeRequired,
  verifyRuntimeUserPassword,
} from "../authSeed.mjs";
import { getWorkspaceSecurityPolicy } from "../apiSecurityPolicy.mjs";
import { getEffectivePermissions } from "../seedData.mjs";
import { toMasterDataEmployeeAccountReview } from "./masterDataEmployeeAccountCommandService.mjs";
import {
  findRuntimeUserById,
  findRuntimeUserByIdentifiers,
  persistRuntimeIdentityState,
  sanitizeRuntimeUserForResponse,
  upsertRuntimeUser,
} from "./runtimeIdentityWorkspace.mjs";

const runtimePasswordPolicy = Object.freeze({
  minLength: 10,
  requireLetter: true,
  requireNumber: true,
  allowWhitespace: false,
  disallowAccountIdentifiers: true,
});

export function createRuntimeAuthCommandService(dependencies = {}) {
  const { buildOperationLog, now = () => new Date() } = dependencies;
  if (typeof buildOperationLog !== "function") {
    throw new TypeError("buildOperationLog must be a function");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function");

  return {
    login,
    prototypeLogin,
    changePassword,
    getCurrentSession,
    logout,
  };

  async function login({ workspace, body = {} }) {
    const securityPolicy = getWorkspaceSecurityPolicy(workspace);
    const matchedRuntimeUser = findRuntimeUserByIdentifiers(workspace, {
      loginName: body.loginName,
      userId: body.userId,
    });
    if (matchedRuntimeUser) {
      return await loginRuntimeUser({
        workspace,
        body,
        runtimeUser: matchedRuntimeUser,
        securityPolicy,
      });
    }

    if (!securityPolicy.allowSeedUsers) {
      return result(403, {
        code: "AUTH_SEED_LOGIN_DISABLED",
        message: "Seed-user login is disabled by the ERP API security policy.",
      });
    }

    const authentication = authenticateSeedUser(body, {
      runtimeUsers: workspace.users,
      authSecret: securityPolicy.authSecret,
    });
    if (!authentication.authenticated) return result(401, authentication.error);

    const runtimeUser = findRuntimeUserById(
      workspace,
      authentication.permissions.user.userId,
    );
    const session = createSeedSession(authentication.permissions.user.userId, {
      sessionVersion: runtimeUser?.sessionVersion,
      authSecret: securityPolicy.authSecret,
    });
    return result(200, { session, permissions: authentication.permissions });
  }

  function prototypeLogin({ workspace, body = {} }) {
    const securityPolicy = getWorkspaceSecurityPolicy(workspace);
    if (securityPolicy.strictAuth || !securityPolicy.allowSeedUsers) {
      return result(403, {
        code: "AUTH_SEED_LOGIN_DISABLED",
        message: "Prototype seed login is disabled by the ERP API security policy.",
      });
    }

    const authentication = authenticatePrototypeSeedUser(body.userId);
    if (!authentication.authenticated) return result(401, authentication.error);

    const runtimeUser = findRuntimeUserById(
      workspace,
      authentication.permissions.user.userId,
    );
    const session = createSeedSession(authentication.permissions.user.userId, {
      sessionVersion: runtimeUser?.sessionVersion,
      authSecret: securityPolicy.authSecret,
    });
    return result(200, { session, permissions: authentication.permissions });
  }

  async function loginRuntimeUser({ workspace, body, runtimeUser, securityPolicy }) {
    const nowMs = getAuthEventNowMs(body, now);
    const nowIso = new Date(nowMs).toISOString();
    const securityState = getRuntimeUserSecurityState(runtimeUser, { nowMs });
    if (securityState.locked) {
      return result(423, buildRuntimeAccountLockedError(securityState));
    }

    const stagedWorkspace = stageIdentityWorkspace(workspace);
    const stagedRuntimeUser =
      findRuntimeUserById(stagedWorkspace, runtimeUser.userId ?? runtimeUser.id) ?? runtimeUser;
    if (
      !stagedRuntimeUser.loginEnabled ||
      !verifyRuntimeUserPassword(stagedRuntimeUser, body.password, {
        authSecret: securityPolicy.authSecret,
      })
    ) {
      const failedUser = recordRuntimeUserLoginFailure(stagedWorkspace, stagedRuntimeUser, {
        nowMs,
      });
      await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);
      const failedSecurityState = getRuntimeUserSecurityState(failedUser, { nowMs });
      if (failedSecurityState.locked) {
        return result(423, buildRuntimeAccountLockedError(failedSecurityState));
      }
      return result(401, {
        code: "AUTHENTICATION_FAILED",
        message: "Login name, user ID, or password is invalid.",
        securityPolicy: getRuntimeAccountSecurityPolicyResponse(),
      });
    }

    let authenticatedUser = resetRuntimeUserLoginFailures(stagedWorkspace, stagedRuntimeUser, {
      updatedAt: nowIso,
    });
    if (isRuntimeUserPasswordHashUpgradeRequired(authenticatedUser)) {
      authenticatedUser = upsertRuntimeUser(stagedWorkspace, {
        ...authenticatedUser,
        passwordHash: hashRuntimeUserPassword(body.password, {
          userId: authenticatedUser.userId ?? authenticatedUser.id,
          authSecret: securityPolicy.authSecret,
        }),
        updatedAt: nowIso,
      });
    }
    const postLoginSecurityState = getRuntimeUserSecurityState(authenticatedUser, { nowMs });
    if (postLoginSecurityState.passwordExpired) {
      authenticatedUser = markRuntimeUserPasswordExpired(
        stagedWorkspace,
        authenticatedUser,
        {
          expiredAt: nowIso,
          passwordExpiresAt: postLoginSecurityState.passwordExpiresAt,
        },
      );
    }
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);

    const permissions = getEffectivePermissions(authenticatedUser.userId, {
      runtimeUsers: workspace.users,
    });
    const session = createRuntimeSession(authenticatedUser.userId, {
      sessionVersion: authenticatedUser.sessionVersion,
      authSecret: securityPolicy.authSecret,
    });
    return result(200, { session, permissions });
  }

  async function changePassword({ workspace, body = {}, authContext = {} }) {
    if (!authContext.authenticated || authContext.source !== "runtime_session") {
      return result(401, {
        code: authContext.authError ?? "AUTH_SESSION_REQUIRED",
        message: "A valid formal employee session bearer token is required before changing password.",
      });
    }

    const userId = cleanText(authContext.userId);
    const stagedWorkspace = stageIdentityWorkspace(workspace);
    const runtimeUser = findRuntimeUserById(stagedWorkspace, userId);
    if (!runtimeUser) {
      return result(409, {
        code: "PASSWORD_CHANGE_NOT_SUPPORTED_FOR_SEED_USER",
        message: "Password changes are only supported for imported runtime employee accounts in the P0 skeleton.",
      });
    }

    const currentPassword = String(body.currentPassword ?? body.oldPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    const authSecret = getWorkspaceSecurityPolicy(stagedWorkspace).authSecret;
    const policyError = validateRuntimePasswordChange({
      currentPassword,
      newPassword,
      user: runtimeUser,
    });
    if (policyError) {
      return result(422, {
        code: policyError.code,
        message: policyError.message,
        passwordPolicy: getRuntimePasswordPolicyResponse(),
      });
    }
    if (!verifyRuntimeUserPassword(runtimeUser, currentPassword, { authSecret })) {
      return result(401, {
        code: "CURRENT_PASSWORD_INVALID",
        message: "Current password is invalid.",
      });
    }
    if (verifyRuntimeUserPassword(runtimeUser, newPassword, { authSecret })) {
      return result(422, {
        code: "NEW_PASSWORD_MUST_DIFFER",
        message: "New password must be different from the current password.",
      });
    }

    const changedAt = cleanText(body.changedAt) || now().toISOString();
    const before = {
      userId: runtimeUser.userId ?? runtimeUser.id,
      loginName: runtimeUser.loginName,
      passwordStatus: runtimeUser.passwordStatus,
      mustChangePassword: runtimeUser.mustChangePassword === true,
      passwordIssuedAt: runtimeUser.passwordIssuedAt,
      passwordChangedAt: runtimeUser.passwordChangedAt,
    };
    const updatedUser = upsertRuntimeUser(stagedWorkspace, {
      ...runtimeUser,
      loginEnabled: true,
      passwordHash: hashRuntimeUserPassword(newPassword, { userId, authSecret }),
      passwordStatus: "active",
      mustChangePassword: false,
      passwordChangedAt: changedAt,
      passwordChangedBy: userId,
      passwordExpiresAt: getRuntimePasswordExpiresAt({
        passwordStatus: "active",
        passwordChangedAt: changedAt,
      }),
      passwordExpiredAt: "",
      failedLoginCount: 0,
      lastFailedLoginAt: "",
      lockedUntil: "",
      updatedAt: changedAt,
    });
    const updatedEmployee = syncEmployeePasswordChange(stagedWorkspace, updatedUser, {
      changedAt,
    });
    const operationLog = buildOperationLog(stagedWorkspace, {
      targetType: "master_data_employee_account_password",
      targetId: cleanText(updatedEmployee?.id) || cleanText(updatedUser.employeeId) || userId,
      action: "master_data_employee_account_password_changed",
      before,
      after: {
        userId: updatedUser.userId,
        loginName: updatedUser.loginName,
        passwordStatus: updatedUser.passwordStatus,
        mustChangePassword: updatedUser.mustChangePassword === true,
        passwordChangedAt: updatedUser.passwordChangedAt,
        passwordExpiresAt: updatedUser.passwordExpiresAt,
      },
      reason: cleanText(body.changeNote ?? body.note) || "员工首次登录后修改临时密码",
      operatorId: userId,
      pageKey: "auth",
    });
    stagedWorkspace.operationLogs.unshift(operationLog);
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);

    return result(200, {
      changed: true,
      user: sanitizeRuntimeUserForResponse(updatedUser),
      permissions: getEffectivePermissions(userId, { runtimeUsers: workspace.users }),
      employeeAccountReview: updatedEmployee
        ? toMasterDataEmployeeAccountReview(updatedEmployee, workspace.users)
        : null,
      operationLogId: operationLog.id,
    });
  }

  function getCurrentSession({ permissionContext, authContext = {} }) {
    if (
      !authContext.authenticated ||
      !["runtime_session", "seed_session"].includes(authContext.source)
    ) {
      return result(401, {
        code: authContext.authError ?? "AUTH_SESSION_REQUIRED",
        message: "A valid signed ERP session bearer token is required.",
      });
    }
    return result(200, {
      authenticated: true,
      session: authContext.session,
      permissions: permissionContext,
    });
  }

  async function logout({ workspace, authContext = {} }) {
    const sessionJti = cleanText(authContext?.session?.jti);
    if (authContext.authenticated && sessionJti) {
      const stagedWorkspace = stageIdentityWorkspace(workspace);
      if (!stagedWorkspace.revokedSeedSessionJtis.includes(sessionJti)) {
        stagedWorkspace.revokedSeedSessionJtis.unshift(sessionJti);
      }
      if (
        !stagedWorkspace.revokedSeedSessions.some(
          (item) => cleanText(item?.jti) === sessionJti,
        )
      ) {
        stagedWorkspace.revokedSeedSessions.unshift({
          jti: sessionJti,
          userId: cleanText(authContext.userId),
          revokedAt: now().toISOString(),
          expiresAt: cleanText(authContext.session?.expiresAt),
          reason: "logout",
          source: `${authContext.source || "erp_session"}_logout`,
        });
      }
      await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);
    }
    return result(200, {
      loggedOut: true,
      tokenRevoked: Boolean(sessionJti),
      sessionUserId: authContext.authenticated ? authContext.userId : null,
      message: sessionJti
        ? "ERP session token has been revoked."
        : "No valid ERP session token was provided; discard the token on the client.",
    });
  }
}

function buildRuntimeAccountLockedError(securityState = {}) {
  return {
    code: "AUTH_ACCOUNT_LOCKED",
    message: "Runtime employee account is temporarily locked after repeated failed login attempts.",
    lockedUntil: securityState.lockedUntil,
    retryAfterSeconds: securityState.retryAfterSeconds,
    failedLoginCount: securityState.failedLoginCount,
    securityPolicy: getRuntimeAccountSecurityPolicyResponse(),
  };
}

function getAuthEventNowMs(body, now) {
  const requestedAt = cleanText(body.attemptedAt ?? body.loginAt ?? body.now);
  const requestedAtMs = Date.parse(requestedAt);
  return Number.isFinite(requestedAtMs) ? requestedAtMs : now().getTime();
}

function recordRuntimeUserLoginFailure(workspace, runtimeUser, { nowMs }) {
  if (!runtimeUser?.loginEnabled) return runtimeUser;
  const failedLoginCount = Math.max(0, Number(runtimeUser.failedLoginCount) || 0) + 1;
  const policy = getRuntimeAccountSecurityPolicyResponse();
  const failedAt = new Date(nowMs).toISOString();
  const lockedUntil =
    failedLoginCount >= policy.maxFailedLoginAttempts
      ? new Date(nowMs + policy.lockoutMinutes * 60 * 1000).toISOString()
      : cleanText(runtimeUser.lockedUntil);
  return upsertRuntimeUser(workspace, {
    ...runtimeUser,
    failedLoginCount,
    lastFailedLoginAt: failedAt,
    lockedUntil,
    updatedAt: failedAt,
  });
}

function resetRuntimeUserLoginFailures(workspace, runtimeUser, { updatedAt }) {
  if (
    !Number(runtimeUser?.failedLoginCount) &&
    !cleanText(runtimeUser?.lastFailedLoginAt) &&
    !cleanText(runtimeUser?.lockedUntil)
  ) {
    return runtimeUser;
  }
  return upsertRuntimeUser(workspace, {
    ...runtimeUser,
    failedLoginCount: 0,
    lastFailedLoginAt: "",
    lockedUntil: "",
    updatedAt,
  });
}

function markRuntimeUserPasswordExpired(workspace, runtimeUser, options) {
  const updatedUser = upsertRuntimeUser(workspace, {
    ...runtimeUser,
    mustChangePassword: true,
    passwordStatus: "password_expired",
    passwordExpiresAt: options.passwordExpiresAt,
    passwordExpiredAt: options.expiredAt,
    updatedAt: options.expiredAt,
  });
  syncEmployeePasswordExpired(workspace, updatedUser, options);
  return updatedUser;
}

function getRuntimePasswordPolicyResponse() {
  return {
    ...runtimePasswordPolicy,
    description: "至少 10 位，必须同时包含字母和数字，不能包含空白字符，不能包含登录名、用户 ID 或员工 ID。",
  };
}

function validateRuntimePasswordChange({ currentPassword, newPassword, user = {} }) {
  if (!currentPassword) {
    return { code: "CURRENT_PASSWORD_REQUIRED", message: "Current password is required." };
  }
  if (!newPassword) {
    return { code: "NEW_PASSWORD_REQUIRED", message: "New password is required." };
  }
  if (newPassword.length < runtimePasswordPolicy.minLength) {
    return {
      code: "NEW_PASSWORD_TOO_SHORT",
      message: `New password must be at least ${runtimePasswordPolicy.minLength} characters.`,
    };
  }
  if (/\s/.test(newPassword)) {
    return {
      code: "NEW_PASSWORD_CONTAINS_SPACE",
      message: "New password must not contain spaces.",
    };
  }
  if (!/[A-Za-z]/.test(newPassword)) {
    return {
      code: "NEW_PASSWORD_REQUIRES_LETTER",
      message: "New password must contain at least one letter.",
    };
  }
  if (!/[0-9]/.test(newPassword)) {
    return {
      code: "NEW_PASSWORD_REQUIRES_NUMBER",
      message: "New password must contain at least one number.",
    };
  }
  const normalizedNewPassword = newPassword.toLowerCase();
  const blockedIdentifiers = [user.loginName, user.userId, user.id, user.employeeId]
    .map((item) => cleanText(item).toLowerCase())
    .filter((item) => item.length >= 4);
  if (blockedIdentifiers.some((item) => normalizedNewPassword.includes(item))) {
    return {
      code: "NEW_PASSWORD_CONTAINS_ACCOUNT_IDENTIFIER",
      message: "New password must not contain the login name, user ID, or employee ID.",
    };
  }
  return null;
}

function syncEmployeePasswordChange(workspace, user, { changedAt }) {
  const userId = cleanText(user?.userId ?? user?.id);
  if (!userId || !Array.isArray(workspace.employees)) return null;
  const index = workspace.employees.findIndex(
    (employee) => cleanText(employee.userId) === userId,
  );
  if (index < 0) return null;
  workspace.employees[index] = {
    ...workspace.employees[index],
    loginEnabled: true,
    passwordStatus: "active",
    mustChangePassword: false,
    passwordChangedAt: changedAt,
    passwordChangedBy: userId,
    passwordExpiresAt: getRuntimePasswordExpiresAt({
      passwordStatus: "active",
      passwordChangedAt: changedAt,
    }),
    passwordExpiredAt: "",
    failedLoginCount: 0,
    lastFailedLoginAt: "",
    lockedUntil: "",
    updatedAt: changedAt,
  };
  return workspace.employees[index];
}

function syncEmployeePasswordExpired(workspace, user, options) {
  const userId = cleanText(user?.userId ?? user?.id);
  if (!userId || !Array.isArray(workspace.employees)) return null;
  const index = workspace.employees.findIndex(
    (employee) => cleanText(employee.userId) === userId,
  );
  if (index < 0) return null;
  workspace.employees[index] = {
    ...workspace.employees[index],
    passwordStatus: "password_expired",
    mustChangePassword: true,
    passwordExpiresAt: options.passwordExpiresAt,
    passwordExpiredAt: options.expiredAt,
    updatedAt: options.expiredAt,
  };
  return workspace.employees[index];
}

function stageIdentityWorkspace(workspace) {
  return {
    ...workspace,
    users: (workspace.users ?? []).map((item) => ({ ...item })),
    employees: (workspace.employees ?? []).map((item) => ({ ...item })),
    operationLogs: [...(workspace.operationLogs ?? [])],
    revokedSeedSessionJtis: [...(workspace.revokedSeedSessionJtis ?? [])],
    revokedSeedSessions: (workspace.revokedSeedSessions ?? []).map((item) => ({ ...item })),
  };
}

async function persistAndCommitIdentityWorkspace(workspace, stagedWorkspace) {
  await persistRuntimeIdentityState(stagedWorkspace);
  workspace.users = stagedWorkspace.users;
  workspace.employees = stagedWorkspace.employees;
  workspace.operationLogs = stagedWorkspace.operationLogs;
  workspace.revokedSeedSessionJtis = stagedWorkspace.revokedSeedSessionJtis;
  workspace.revokedSeedSessions = stagedWorkspace.revokedSeedSessions;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function result(statusCode, response) {
  return { statusCode, response };
}
