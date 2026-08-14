import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { createRuntimeSession } from "../authSeed.mjs";
import { getWorkspaceSecurityPolicy } from "../apiSecurityPolicy.mjs";
import { getEffectivePermissions } from "../seedData.mjs";
import { resolveConfiguredMasterDataMachine } from "../../shared/masterDataMachineIdentity.js";
import {
  getEmployeeAccountDepartment,
  getInvalidEmployeeAccountRoleInputs,
  normalizeEmployeeAccountRoleKey,
  normalizeEmployeeAccountRoleKeys,
} from "./runtimeEmployeeAccountPolicy.mjs";
import {
  persistRuntimeIdentityState,
  sanitizeRuntimeUserForResponse,
  upsertRuntimeUser,
} from "./runtimeIdentityWorkspace.mjs";

const phoneIdentitySource = "phone_self_registration";
const registrationPurpose = "registration";
const loginPurpose = "login";
const verificationCodeTtlMs = 5 * 60 * 1000;
const verificationCodeRetryMs = 60 * 1000;
const verificationCodeMaxAttempts = 5;

export function createPhoneIdentityCommandService(dependencies = {}) {
  const {
    buildOperationLog,
    now = () => new Date(),
    createVerificationCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0"),
    createId = (prefix) => `${prefix}-${randomUUID()}`,
  } = dependencies;
  if (typeof buildOperationLog !== "function") throw new TypeError("buildOperationLog must be a function");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (typeof createVerificationCode !== "function") throw new TypeError("createVerificationCode must be a function");
  if (typeof createId !== "function") throw new TypeError("createId must be a function");

  return {
    requestRegistrationCode: (input) => requestVerificationCode({ ...input, purpose: registrationPurpose }),
    requestLoginCode: (input) => requestVerificationCode({ ...input, purpose: loginPurpose }),
    completeRegistration,
    loginWithPhoneCode,
    listRegistrationReviews,
    assignRegistration,
  };

  async function requestVerificationCode({ workspace, body = {}, purpose }) {
    const enabledError = requirePhoneRegistrationEnabled(workspace);
    if (enabledError) return enabledError;
    const phoneE164 = normalizeMainlandChinaPhone(body.phone ?? body.phoneNumber);
    if (!phoneE164) {
      return businessError(422, "PHONE_NUMBER_INVALID", "请输入有效的中国大陆手机号。");
    }

    const existingUser = findUserByPhone(workspace, phoneE164);
    if (purpose === registrationPurpose && existingUser) {
      return businessError(409, "PHONE_ACCOUNT_ALREADY_EXISTS", "该手机号已注册，请直接登录。");
    }
    if (purpose === loginPurpose && !existingUser) {
      return acceptedVerificationResponse(phoneE164);
    }
    if (purpose === loginPurpose && !isPhoneLoginAccount(existingUser)) {
      return businessError(409, "PHONE_LOGIN_NOT_AVAILABLE", "该账号尚未启用手机号验证码登录。");
    }

    const requestedAtMs = now().getTime();
    const latestChallenge = findLatestChallenge(workspace, phoneE164, purpose);
    const latestRequestedAtMs = Date.parse(latestChallenge?.requestedAt ?? "");
    if (
      latestChallenge &&
      !latestChallenge.consumedAt &&
      Number.isFinite(latestRequestedAtMs) &&
      requestedAtMs - latestRequestedAtMs < verificationCodeRetryMs
    ) {
      return businessError(429, "PHONE_CODE_RATE_LIMITED", "验证码发送过于频繁，请稍后再试。", {
        retryAfterSeconds: Math.max(1, Math.ceil((verificationCodeRetryMs - (requestedAtMs - latestRequestedAtMs)) / 1000)),
      });
    }

    const sender = workspace?.phoneVerificationSender;
    if (typeof sender !== "function") {
      return businessError(503, "PHONE_VERIFICATION_PROVIDER_UNAVAILABLE", "手机号验证服务尚未配置，暂时无法发送验证码。");
    }

    const challengeId = createId("PHONE-VERIFY");
    const verificationCode = String(createVerificationCode()).trim();
    if (!/^\d{6}$/.test(verificationCode)) {
      throw new Error("Phone verification code generator must return exactly six digits.");
    }
    const requestedAt = new Date(requestedAtMs).toISOString();
    const expiresAt = new Date(requestedAtMs + verificationCodeTtlMs).toISOString();
    const codeHash = hashVerificationCode({
      challengeId,
      phoneE164,
      purpose,
      code: verificationCode,
      authSecret: getWorkspaceSecurityPolicy(workspace).authSecret,
    });

    let delivery;
    try {
      delivery = await sender({
        phoneE164,
        purpose,
        verificationCode,
        expiresAt,
      });
    } catch {
      return businessError(503, "PHONE_VERIFICATION_DELIVERY_FAILED", "验证码发送失败，请稍后重试。");
    }

    const stagedWorkspace = stageIdentityWorkspace(workspace);
    stagedWorkspace.phoneVerificationChallenges = pruneChallenges([
      {
        id: challengeId,
        phoneE164,
        purpose,
        codeHash,
        requestedAt,
        expiresAt,
        consumedAt: "",
        failedAttempts: 0,
        maxAttempts: verificationCodeMaxAttempts,
        deliveryStatus: "sent",
        deliveryReference: cleanText(delivery?.deliveryReference ?? delivery?.messageId),
        createdAt: requestedAt,
        updatedAt: requestedAt,
      },
      ...stagedWorkspace.phoneVerificationChallenges,
    ], requestedAtMs);
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);
    return acceptedVerificationResponse(phoneE164, {
      expiresInSeconds: Math.floor(verificationCodeTtlMs / 1000),
      retryAfterSeconds: Math.floor(verificationCodeRetryMs / 1000),
    });
  }

  async function completeRegistration({ workspace, body = {} }) {
    const enabledError = requirePhoneRegistrationEnabled(workspace);
    if (enabledError) return enabledError;
    const phoneE164 = normalizeMainlandChinaPhone(body.phone ?? body.phoneNumber);
    if (!phoneE164) return businessError(422, "PHONE_NUMBER_INVALID", "请输入有效的中国大陆手机号。");
    if (findUserByPhone(workspace, phoneE164)) {
      return businessError(409, "PHONE_ACCOUNT_ALREADY_EXISTS", "该手机号已注册，请直接登录。");
    }
    const displayName = cleanText(body.displayName ?? body.name);
    if (displayName.length < 2 || displayName.length > 40) {
      return businessError(422, "REGISTRATION_NAME_INVALID", "请输入 2 至 40 个字符的真实姓名。");
    }

    const stagedWorkspace = stageIdentityWorkspace(workspace);
    const verification = await consumeVerificationChallenge({
      workspace,
      stagedWorkspace,
      phoneE164,
      purpose: registrationPurpose,
      code: body.code ?? body.verificationCode,
    });
    if (verification.error) return verification.error;

    const registeredAt = now().toISOString();
    const userId = createId("U-PHONE");
    const loginName = buildPhoneAccountLoginName(phoneE164, userId);
    const invitationReferenceHash = cleanText(body.invitationCode)
      ? hashOpaqueReference(body.invitationCode, getWorkspaceSecurityPolicy(workspace).authSecret)
      : "";
    const user = upsertRuntimeUser(stagedWorkspace, {
      id: userId,
      userId,
      loginName,
      displayName,
      defaultRole: "",
      department: "",
      defaultMachineId: "",
      enabled: true,
      roles: [],
      employeeId: "",
      source: phoneIdentitySource,
      loginEnabled: true,
      authMethods: ["phone_otp"],
      phoneE164,
      phoneVerifiedAt: registeredAt,
      registrationStatus: "pending_assignment",
      registrationSource: invitationReferenceHash ? "invitation" : "self_registration",
      invitationReferenceHash,
      passwordHash: "",
      passwordStatus: "not_applicable",
      mustChangePassword: false,
      sessionVersion: 0,
      updatedAt: registeredAt,
    });
    const operationLog = buildOperationLog(stagedWorkspace, {
      targetType: "phone_self_registration",
      targetId: userId,
      action: "phone_registration_verified",
      before: null,
      after: {
        userId,
        displayName,
        phone: maskPhone(phoneE164),
        registrationStatus: "pending_assignment",
        invitationPresented: Boolean(invitationReferenceHash),
        businessPermissionsGranted: false,
      },
      reason: "员工本人完成手机号验证并提交注册",
      operatorId: userId,
      pageKey: "auth",
    });
    stagedWorkspace.operationLogs.unshift(operationLog);
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);

    const permissions = getEffectivePermissions(userId, { runtimeUsers: workspace.users });
    const session = createRuntimeSession(userId, {
      sessionVersion: user.sessionVersion,
      authSecret: getWorkspaceSecurityPolicy(workspace).authSecret,
    });
    return success(201, {
      registered: true,
      assignmentRequired: true,
      registrationStatus: "pending_assignment",
      session,
      permissions,
      user: sanitizeRuntimeUserForResponse(user),
      operationLogId: operationLog.id,
    });
  }

  async function loginWithPhoneCode({ workspace, body = {} }) {
    const enabledError = requirePhoneRegistrationEnabled(workspace);
    if (enabledError) return enabledError;
    const phoneE164 = normalizeMainlandChinaPhone(body.phone ?? body.phoneNumber);
    if (!phoneE164) return businessError(422, "PHONE_NUMBER_INVALID", "请输入有效的中国大陆手机号。");
    const runtimeUser = findUserByPhone(workspace, phoneE164);
    if (!runtimeUser || !isPhoneLoginAccount(runtimeUser)) {
      return businessError(401, "PHONE_AUTHENTICATION_FAILED", "手机号或验证码不正确。");
    }
    if (runtimeUser.enabled === false || cleanText(runtimeUser.registrationStatus) === "rejected") {
      return businessError(403, "PHONE_ACCOUNT_DISABLED", "该账号当前不可登录，请联系人员管理员。");
    }

    const stagedWorkspace = stageIdentityWorkspace(workspace);
    const verification = await consumeVerificationChallenge({
      workspace,
      stagedWorkspace,
      phoneE164,
      purpose: loginPurpose,
      code: body.code ?? body.verificationCode,
    });
    if (verification.error) return verification.error;
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);

    const permissions = getEffectivePermissions(runtimeUser.userId ?? runtimeUser.id, {
      runtimeUsers: workspace.users,
    });
    const session = createRuntimeSession(runtimeUser.userId ?? runtimeUser.id, {
      sessionVersion: runtimeUser.sessionVersion,
      authSecret: getWorkspaceSecurityPolicy(workspace).authSecret,
    });
    return success(200, {
      session,
      permissions,
      assignmentRequired: cleanText(runtimeUser.registrationStatus) === "pending_assignment",
      registrationStatus: cleanText(runtimeUser.registrationStatus),
    });
  }

  function listRegistrationReviews({ workspace, filters = {} } = {}) {
    const status = cleanText(filters.status);
    const keyword = cleanText(filters.keyword).toLowerCase();
    return runtimeUsers(workspace)
      .filter((user) => cleanText(user.source) === phoneIdentitySource)
      .filter((user) => !status || cleanText(user.registrationStatus) === status)
      .filter((user) => {
        if (!keyword) return true;
        return [user.userId, user.displayName, user.phoneE164, user.employeeId]
          .some((value) => cleanText(value).toLowerCase().includes(keyword));
      })
      .map(toRegistrationReview)
      .sort((left, right) => cleanText(right.registeredAt).localeCompare(cleanText(left.registeredAt)));
  }

  async function assignRegistration({ workspace, userId, body = {}, operatorId }) {
    const safeUserId = cleanText(userId);
    const runtimeUser = runtimeUsers(workspace).find(
      (user) => cleanText(user.userId ?? user.id) === safeUserId && cleanText(user.source) === phoneIdentitySource,
    );
    if (!runtimeUser) return notFound("PHONE_REGISTRATION_NOT_FOUND");
    if (cleanText(runtimeUser.registrationStatus) !== "pending_assignment") {
      return businessError(409, "PHONE_REGISTRATION_NOT_PENDING", "该注册账号已完成岗位分配或已失效。");
    }
    if (body.confirmed !== true) {
      return businessError(400, "PERSONNEL_ASSIGNMENT_CONFIRMATION_REQUIRED", "人员绑定和岗位分配需要明确确认。");
    }
    const employeeId = cleanText(body.employeeId);
    if (!employeeId) return businessError(422, "PERSONNEL_EMPLOYEE_ID_REQUIRED", "请选择要绑定的员工档案。");
    const employeeIndex = (workspace.employees ?? []).findIndex((employee) => cleanText(employee.id) === employeeId);
    if (employeeIndex < 0) return notFound("PERSONNEL_EMPLOYEE_NOT_FOUND");
    const employee = workspace.employees[employeeIndex];
    const conflictingUser = runtimeUsers(workspace).find(
      (user) => cleanText(user.employeeId) === employeeId && cleanText(user.userId ?? user.id) !== safeUserId,
    );
    if (conflictingUser) {
      return businessError(409, "PERSONNEL_EMPLOYEE_ALREADY_BOUND", "该员工档案已绑定其他账号。");
    }
    if (cleanText(employee.userId) && cleanText(employee.userId) !== safeUserId) {
      return businessError(409, "PERSONNEL_EMPLOYEE_ALREADY_BOUND", "该员工档案已绑定其他账号。");
    }

    const roleInputs = body.roleKeys ?? body.roles ?? body.roleKey;
    if (!roleInputs || (Array.isArray(roleInputs) && roleInputs.length === 0)) {
      return businessError(422, "PERSONNEL_ROLE_REQUIRED", "请为员工分配至少一个岗位。");
    }
    const invalidRoleInputs = getInvalidEmployeeAccountRoleInputs(roleInputs);
    if (invalidRoleInputs.length) {
      return businessError(422, "PERSONNEL_ROLE_INVALID", "存在无法识别的岗位。", { invalidRoleInputs });
    }
    const defaultRole = normalizeEmployeeAccountRoleKey(body.roleKey, employee.roleName);
    const roles = normalizeEmployeeAccountRoleKeys(roleInputs, defaultRole, employee.roleName);
    const defaultWorkshop = cleanText(body.defaultWorkshop ?? employee.defaultWorkshop);
    const defaultMachineId = cleanText(body.defaultMachineId ?? employee.defaultMachineId);
    const machineError = validateWorkshopMachineAssignment(workspace, roles, defaultWorkshop, defaultMachineId);
    if (machineError) return machineError;

    const assignedAt = now().toISOString();
    const safeOperatorId = cleanText(operatorId);
    const stagedWorkspace = stageIdentityWorkspace(workspace);
    const stagedEmployee = {
      ...stagedWorkspace.employees[employeeIndex],
      userId: safeUserId,
      loginName: runtimeUser.loginName,
      name: cleanText(employee.name) || runtimeUser.displayName,
      reviewedRoleKey: defaultRole,
      reviewedRoleKeys: roles,
      defaultWorkshop,
      defaultMachineId,
      assignmentMode: defaultMachineId ? "fixed_machine" : defaultWorkshop ? "general_worker" : "unassigned",
      assignmentUpdatedBy: safeOperatorId,
      assignmentUpdatedAt: assignedAt,
      assignmentNote: cleanText(body.assignmentNote ?? body.note),
      accountEnabled: true,
      profileStatus: "account_enabled",
      requestedEnabled: true,
      updatedAt: assignedAt,
    };
    stagedWorkspace.employees[employeeIndex] = stagedEmployee;
    const assignedUser = upsertRuntimeUser(stagedWorkspace, {
      ...runtimeUser,
      displayName: stagedEmployee.name,
      defaultRole,
      roles,
      department: getEmployeeAccountDepartment(defaultRole),
      defaultMachineId,
      employeeId,
      enabled: true,
      loginEnabled: true,
      registrationStatus: "active",
      assignedAt,
      assignedBy: safeOperatorId,
      updatedAt: assignedAt,
    });
    const operationLog = buildOperationLog(stagedWorkspace, {
      targetType: "personnel_phone_registration_assignment",
      targetId: safeUserId,
      action: "phone_registration_assigned_to_employee",
      before: {
        userId: safeUserId,
        registrationStatus: runtimeUser.registrationStatus,
        employeeId: runtimeUser.employeeId || "",
        roles: runtimeUser.roles ?? [],
      },
      after: {
        userId: safeUserId,
        registrationStatus: "active",
        employeeId,
        roles,
        defaultRole,
        defaultWorkshop,
        defaultMachineId,
      },
      reason: cleanText(body.assignmentNote ?? body.note) || "人员管理完成员工绑定和岗位授权",
      operatorId: safeOperatorId,
      pageKey: "personnel_management",
    });
    stagedWorkspace.operationLogs.unshift(operationLog);
    await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);
    return success(200, {
      assigned: true,
      registrationReview: toRegistrationReview(assignedUser),
      employee: stagedEmployee,
      permissions: getEffectivePermissions(safeUserId, { runtimeUsers: workspace.users }),
      operationLogId: operationLog.id,
    });
  }

  async function consumeVerificationChallenge({ workspace, stagedWorkspace, phoneE164, purpose, code }) {
    const challenge = findLatestChallenge(stagedWorkspace, phoneE164, purpose);
    const attemptedAtMs = now().getTime();
    if (!challenge || challenge.consumedAt || Date.parse(challenge.expiresAt) <= attemptedAtMs) {
      return { error: businessError(422, "PHONE_CODE_INVALID_OR_EXPIRED", "验证码无效或已过期，请重新获取。") };
    }
    if (Number(challenge.failedAttempts) >= Number(challenge.maxAttempts || verificationCodeMaxAttempts)) {
      return { error: businessError(423, "PHONE_CODE_ATTEMPTS_EXCEEDED", "验证码尝试次数过多，请重新获取。") };
    }
    const suppliedHash = hashVerificationCode({
      challengeId: challenge.id,
      phoneE164,
      purpose,
      code: cleanText(code),
      authSecret: getWorkspaceSecurityPolicy(workspace).authSecret,
    });
    if (!safeHashEquals(challenge.codeHash, suppliedHash)) {
      challenge.failedAttempts = Number(challenge.failedAttempts) + 1;
      challenge.updatedAt = new Date(attemptedAtMs).toISOString();
      await persistAndCommitIdentityWorkspace(workspace, stagedWorkspace);
      return { error: businessError(422, "PHONE_CODE_INVALID_OR_EXPIRED", "验证码无效或已过期，请重新获取。") };
    }
    challenge.consumedAt = new Date(attemptedAtMs).toISOString();
    challenge.updatedAt = challenge.consumedAt;
    return { challenge };
  }
}

export function normalizeMainlandChinaPhone(value) {
  const digits = String(value ?? "").replace(/[^0-9+]/g, "");
  const local = digits.startsWith("+86")
    ? digits.slice(3)
    : digits.startsWith("0086")
      ? digits.slice(4)
      : digits.startsWith("86") && digits.length === 13
        ? digits.slice(2)
        : digits;
  return /^1[3-9]\d{9}$/.test(local) ? `+86${local}` : "";
}

function requirePhoneRegistrationEnabled(workspace) {
  return getWorkspaceSecurityPolicy(workspace).phoneRegistrationEnabled === true
    ? null
    : businessError(404, "PHONE_IDENTITY_FLOW_DISABLED", "手机号注册登录功能当前未开放。");
}

function acceptedVerificationResponse(phoneE164, options = {}) {
  return success(202, {
    accepted: true,
    phone: maskPhone(phoneE164),
    expiresInSeconds: options.expiresInSeconds ?? Math.floor(verificationCodeTtlMs / 1000),
    retryAfterSeconds: options.retryAfterSeconds ?? Math.floor(verificationCodeRetryMs / 1000),
  });
}

function findUserByPhone(workspace, phoneE164) {
  return runtimeUsers(workspace).find((user) => cleanText(user.phoneE164) === phoneE164) ?? null;
}

function isPhoneLoginAccount(user = {}) {
  return (
    user.enabled !== false &&
    user.loginEnabled === true &&
    cleanText(user.phoneVerifiedAt) &&
    (Array.isArray(user.authMethods) ? user.authMethods : []).includes("phone_otp")
  );
}

function findLatestChallenge(workspace, phoneE164, purpose) {
  return (workspace.phoneVerificationChallenges ?? [])
    .filter((challenge) => challenge.phoneE164 === phoneE164 && challenge.purpose === purpose)
    .sort((left, right) => cleanText(right.requestedAt).localeCompare(cleanText(left.requestedAt)))[0] ?? null;
}

function pruneChallenges(challenges, nowMs) {
  const retentionBoundary = nowMs - 24 * 60 * 60 * 1000;
  const counts = new Map();
  return challenges.filter((challenge) => {
    const requestedAtMs = Date.parse(challenge.requestedAt);
    if (Number.isFinite(requestedAtMs) && requestedAtMs < retentionBoundary) return false;
    const key = `${challenge.phoneE164}:${challenge.purpose}`;
    const count = counts.get(key) ?? 0;
    counts.set(key, count + 1);
    return count < 20;
  });
}

function hashVerificationCode({ challengeId, phoneE164, purpose, code, authSecret }) {
  return createHmac("sha256", cleanText(authSecret) || "erp-local-phone-verification")
    .update(`${challengeId}:${phoneE164}:${purpose}:${cleanText(code)}`)
    .digest("hex");
}

function hashOpaqueReference(value, authSecret) {
  return createHmac("sha256", cleanText(authSecret) || "erp-local-phone-verification")
    .update(cleanText(value))
    .digest("hex");
}

function safeHashEquals(left, right) {
  const leftBuffer = Buffer.from(cleanText(left), "hex");
  const rightBuffer = Buffer.from(cleanText(right), "hex");
  return leftBuffer.length > 0 && leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function buildPhoneAccountLoginName(phoneE164, userId) {
  return `mobile.${phoneE164.slice(-4)}.${cleanText(userId).replace(/[^a-zA-Z0-9]/g, "").slice(-8).toLowerCase()}`;
}

function validateWorkshopMachineAssignment(workspace, roles, workshop, machineId) {
  if (!roles.includes("workshop")) return null;
  if (!workshop || !machineId) {
    return businessError(422, "PERSONNEL_WORKSHOP_MACHINE_REQUIRED", "车间岗位需要同时分配车间和默认机台。");
  }
  const machine = resolveConfiguredMasterDataMachine(workspace.machines, machineId);
  if (!machine || machine.enabled === false || cleanText(machine.status) !== "active") {
    return businessError(409, "PERSONNEL_MACHINE_NOT_ACTIVE", "所选默认机台不存在或未启用。");
  }
  if (cleanText(machine.workshop) !== workshop) {
    return businessError(409, "PERSONNEL_MACHINE_WORKSHOP_MISMATCH", "所选机台与员工车间不一致。");
  }
  return null;
}

function toRegistrationReview(user = {}) {
  return {
    userId: cleanText(user.userId ?? user.id),
    displayName: cleanText(user.displayName),
    phoneE164: cleanText(user.phoneE164),
    phoneMasked: maskPhone(user.phoneE164),
    phoneVerifiedAt: cleanText(user.phoneVerifiedAt),
    registrationStatus: cleanText(user.registrationStatus),
    registrationSource: cleanText(user.registrationSource),
    employeeId: cleanText(user.employeeId),
    roles: Array.isArray(user.roles) ? [...user.roles] : [],
    defaultRole: cleanText(user.defaultRole),
    department: cleanText(user.department),
    assignedAt: cleanText(user.assignedAt),
    assignedBy: cleanText(user.assignedBy),
    registeredAt: cleanText(user.phoneVerifiedAt ?? user.updatedAt),
    actionRequired: cleanText(user.registrationStatus) === "pending_assignment",
  };
}

function maskPhone(value) {
  const phone = normalizeMainlandChinaPhone(value);
  return phone ? `${phone.slice(0, 6)}****${phone.slice(-4)}` : "";
}

function stageIdentityWorkspace(workspace = {}) {
  return {
    ...workspace,
    users: runtimeUsers(workspace).map((item) => ({ ...item })),
    employees: (workspace.employees ?? []).map((item) => ({ ...item })),
    operationLogs: [...(workspace.operationLogs ?? [])],
    phoneVerificationChallenges: (workspace.phoneVerificationChallenges ?? []).map((item) => ({ ...item })),
  };
}

async function persistAndCommitIdentityWorkspace(workspace, stagedWorkspace) {
  await persistRuntimeIdentityState(stagedWorkspace);
  workspace.users = stagedWorkspace.users;
  workspace.employees = stagedWorkspace.employees;
  workspace.operationLogs = stagedWorkspace.operationLogs;
  workspace.phoneVerificationChallenges = stagedWorkspace.phoneVerificationChallenges;
}

function runtimeUsers(workspace) {
  return Array.isArray(workspace?.users) ? workspace.users : [];
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function success(statusCode, response) {
  return { statusCode, response };
}

function notFound(code) {
  return { notFound: true, code };
}

function businessError(statusCode, code, message, details = undefined) {
  return { error: true, statusCode, code, message, ...(details ? { details } : {}) };
}
