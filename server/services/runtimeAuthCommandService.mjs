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
      phone: body.phone ?? body.phoneNumber,
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
        message: "生产模式已禁用演示账号登录。",
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
        message: "生产模式已禁用演示账号登录。",
      });
    }

    const requestedUserId = String(body.userId ?? "").trim();
    if (securityPolicy.fixedPreviewUserId && requestedUserId !== securityPolicy.fixedPreviewUserId) {
      return result(403, {
        code: "AUTH_PREVIEW_IDENTITY_FIXED",
        message: "公开评审只能使用固定测试身份。",
      });
    }

    const authentication = authenticatePrototypeSeedUser(requestedUserId);
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
        message: "登录名、用户编号或密码不正确。",
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
    return result(200, {
      session,
      permissions,
      ...getPendingPasswordChangeResponseFields(permissions),
    });
  }

  async function changePassword({ workspace, body = {}, authContext = {} }) {
    if (!authContext.authenticated || authContext.source !== "runtime_session") {
      return result(401, {
        code: authContext.authError ?? "AUTH_SESSION_REQUIRED",
        message: "修改密码前需要有效的正式员工登录会话。",
      });
    }

    const userId = cleanText(authContext.userId);
    const stagedWorkspace = stageIdentityWorkspace(workspace);
    const runtimeUser = findRuntimeUserById(stagedWorkspace, userId);
    if (!runtimeUser) {
      return result(409, {
        code: "PASSWORD_CHANGE_NOT_SUPPORTED_FOR_SEED_USER",
        message: "当前账号不支持修改密码，请使用正式员工账号登录。",
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
        message: "当前密码不正确，请重新输入。",
      });
    }
    if (verifyRuntimeUserPassword(runtimeUser, newPassword, { authSecret })) {
      return result(422, {
        code: "NEW_PASSWORD_MUST_DIFFER",
        message: "新密码不能与当前密码相同。",
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
      reason: cleanText(body.changeNote ?? body.note) || getRuntimePasswordChangeReason(runtimeUser),
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
        ? toMasterDataEmployeeAccountReview(updatedEmployee, workspace.users, workspace.machines, workspace.operationLogs)
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
        message: "需要有效的 ERP 登录会话。",
      });
    }
    return result(200, {
      authenticated: true,
      session: authContext.session,
      permissions: permissionContext,
      ...getPendingPasswordChangeResponseFields(permissionContext),
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
        ? "ERP 登录会话已退出。"
        : "未提供有效的 ERP 登录会话，本地会话可以清除。",
    });
  }
}

function buildRuntimeAccountLockedError(securityState = {}) {
  return {
    code: "AUTH_ACCOUNT_LOCKED",
    message: "连续登录失败次数过多，账号已暂时锁定，请稍后再试。",
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

function getPendingPasswordChangeResponseFields(permissions) {
  return permissions?.passwordChangeRequired === true
    ? { passwordPolicy: getRuntimePasswordPolicyResponse() }
    : {};
}

function getRuntimePasswordChangeReason(runtimeUser = {}) {
  return String(runtimeUser.passwordStatus ?? "").trim() === "password_expired"
    ? "员工密码过期后修改密码"
    : "员工首次登录后修改临时密码";
}

function validateRuntimePasswordChange({ currentPassword, newPassword, user = {} }) {
  if (!currentPassword) {
    return { code: "CURRENT_PASSWORD_REQUIRED", message: "请输入当前密码。" };
  }
  if (!newPassword) {
    return { code: "NEW_PASSWORD_REQUIRED", message: "请输入新密码。" };
  }
  if (newPassword.length < runtimePasswordPolicy.minLength) {
    return {
      code: "NEW_PASSWORD_TOO_SHORT",
      message: `新密码至少需要 ${runtimePasswordPolicy.minLength} 位。`,
    };
  }
  if (/\s/.test(newPassword)) {
    return {
      code: "NEW_PASSWORD_CONTAINS_SPACE",
      message: "新密码不能包含空白字符。",
    };
  }
  if (!/[A-Za-z]/.test(newPassword)) {
    return {
      code: "NEW_PASSWORD_REQUIRES_LETTER",
      message: "新密码至少需要包含一个字母。",
    };
  }
  if (!/[0-9]/.test(newPassword)) {
    return {
      code: "NEW_PASSWORD_REQUIRES_NUMBER",
      message: "新密码至少需要包含一个数字。",
    };
  }
  const normalizedNewPassword = newPassword.toLowerCase();
  const blockedIdentifiers = [user.loginName, user.userId, user.id, user.employeeId]
    .map((item) => cleanText(item).toLowerCase())
    .filter((item) => item.length >= 4);
  if (blockedIdentifiers.some((item) => normalizedNewPassword.includes(item))) {
    return {
      code: "NEW_PASSWORD_CONTAINS_ACCOUNT_IDENTIFIER",
      message: "新密码不能包含登录名、用户 ID 或员工编号。",
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
