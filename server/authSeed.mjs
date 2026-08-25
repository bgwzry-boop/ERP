import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import {
  createDisabledPermissionContext,
  resolvePermissionAssignment,
  roleCatalog,
} from "../shared/auth/roleCatalog.js";

const defaultSeedUserId = "U-OFFICE-A";
export const seedSessionTokenPrefix = "seed-session";
export const runtimeSessionTokenPrefix = "erp-runtime-session-v1";
const legacyRuntimePasswordHashPrefix = "runtime-password-v1";
const runtimePasswordHashPrefix = "runtime-password-v2";
const runtimePasswordSaltBytes = 16;
const runtimePasswordDigestBytes = 32;
const runtimePasswordScryptOptions = Object.freeze({
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});
const seedSessionTtlMs = 8 * 60 * 60 * 1000;
// The fallback exists only for the local prototype. Production callers must pass
// an explicit secret through the API server's strict security policy.
const prototypeSeedAuthSecret = "erp-p0-local-seed-auth-secret";
const runtimeAccountSecurityPolicy = Object.freeze({
  maxFailedLoginAttempts: 5,
  lockoutMinutes: 15,
  passwordMaxAgeDays: 90,
});

const seedUsers = [
  {
    userId: "U-OFFICE-A",
    loginName: "office.a",
    seedPassword: "office123",
    displayName: "办公室A",
    defaultRole: "office",
    department: "office",
    enabled: true,
    roles: ["office"],
  },
  {
    userId: "U-OFFICE-B",
    loginName: "office.b",
    seedPassword: "officeb123",
    displayName: "办公室B",
    defaultRole: "office",
    department: "office",
    enabled: true,
    roles: ["office"],
  },
  {
    userId: "U-WAREHOUSE-A",
    loginName: "warehouse.a",
    seedPassword: "warehouse123",
    displayName: "库房出库A",
    defaultRole: "warehouse",
    department: "warehouse",
    enabled: true,
    roles: ["warehouse"],
  },
  {
    userId: "U-FINANCE-A",
    loginName: "finance.a",
    seedPassword: "finance123",
    displayName: "财务A",
    defaultRole: "finance",
    department: "finance",
    enabled: true,
    roles: ["finance"],
  },
  {
    userId: "U-MANAGER-A",
    loginName: "manager.a",
    seedPassword: "manager123",
    displayName: "管理A",
    defaultRole: "management",
    department: "management",
    enabled: true,
    roles: ["office", "warehouse", "finance", "management"],
  },
  {
    userId: "U-STAGING-TEST",
    loginName: "a006688b",
    seedPassword: "a006688b",
    displayName: "测试账号",
    defaultRole: "management",
    department: "management",
    enabled: true,
    roles: ["office", "warehouse", "finance", "management"],
  },
  {
    userId: "U-DECISION-MOTHER",
    loginName: "decision.mother",
    seedPassword: "decisionmother123",
    displayName: "经营决策（主要）",
    defaultRole: "decision_maker",
    department: "management",
    decisionAuthority: "primary",
    preferredPage: "decisionMobile",
    enabled: true,
    roles: ["decision_maker", "decision_maker_primary"],
  },
  {
    userId: "U-DECISION-AUNT",
    loginName: "decision.aunt",
    seedPassword: "decisionaunt123",
    displayName: "经营决策（辅助）",
    defaultRole: "decision_maker",
    department: "management",
    decisionAuthority: "backup",
    preferredPage: "decisionMobile",
    enabled: true,
    roles: ["decision_maker"],
  },
  {
    userId: "U-TECH-A",
    loginName: "tech.a",
    seedPassword: "tech123",
    displayName: "技术运维A",
    defaultRole: "technical_operations",
    department: "system",
    enabled: true,
    roles: ["technical_operations"],
  },
  {
    userId: "U-MAINTENANCE-A",
    loginName: "maintenance.a",
    seedPassword: "maintenance123",
    displayName: "现场机修A",
    defaultRole: "maintenance",
    department: "maintenance",
    preferredPage: "maintenanceMobile",
    enabled: true,
    roles: ["maintenance"],
  },
  {
    userId: "U-DRIVER-A",
    loginName: "driver.a",
    seedPassword: "driver123",
    displayName: "司机A",
    defaultRole: "driver",
    department: "delivery",
    enabled: true,
    roles: ["driver"],
  },
  {
    userId: "U-WORKSHOP-A",
    loginName: "workshop.a",
    seedPassword: "workshop123",
    displayName: "车间A",
    defaultRole: "workshop",
    department: "workshop",
    defaultMachineId: "BAG-01",
    enabled: true,
    roles: ["workshop"],
  },
  {
    userId: "U-WORKSHOP-PRINT-A",
    loginName: "workshop.print.a",
    seedPassword: "workshopprint123",
    displayName: "丝印A",
    defaultRole: "workshop",
    department: "workshop",
    defaultMachineId: "PRINT-01",
    enabled: true,
    roles: ["workshop"],
  },
  {
    userId: "U-PACKING-A",
    loginName: "packing.a",
    seedPassword: "packing123",
    displayName: "打包A",
    defaultRole: "packing",
    department: "packing",
    defaultMachineId: "PACK-01",
    enabled: true,
    roles: ["packing"],
  },
  {
    userId: "U-PRINT-DRIVER-A",
    loginName: "print.driver.a",
    seedPassword: "printdriver123",
    displayName: "打印驱动服务账号A",
    defaultRole: "print_driver_service",
    department: "system",
    enabled: true,
    roles: ["print_driver_service"],
  },
];

export function getSeedUsers() {
  return seedUsers.map(({ seedPassword, ...user }) => ({ ...user, roles: [...user.roles] }));
}

export function getSeedUser(userId = defaultSeedUserId) {
  return seedUsers.find((user) => user.userId === userId) ?? null;
}

export function authenticatePrototypeSeedUser(userId) {
  const user = getSeedUser(String(userId ?? "").trim());
  if (user && user.enabled !== false) {
    return {
      authenticated: true,
      permissions: getEffectivePermissionsForUser(user.userId),
    };
  }
  return buildAuthenticationFailedResult();
}

export function authenticateSeedUser({ loginName, userId, password }, options = {}) {
  const normalizedLoginName = String(loginName ?? "").trim();
  const normalizedUserId = String(userId ?? "").trim();
  const user =
    seedUsers.find((candidate) => candidate.loginName === normalizedLoginName || candidate.userId === normalizedUserId) ??
    null;

  if (user) {
    if (user.enabled !== false && timingSafeEqualString(String(password ?? ""), user.seedPassword)) {
      return {
        authenticated: true,
        permissions: getEffectivePermissionsForUser(user.userId),
      };
    }
    return buildAuthenticationFailedResult();
  }

  const runtimeUser = findRuntimeUser(options.runtimeUsers, { loginName: normalizedLoginName, userId: normalizedUserId });
  if (
    runtimeUser &&
    isRuntimeUserLoginEnabled(runtimeUser) &&
    verifyRuntimeUserPassword(runtimeUser, password, options)
  ) {
    return {
      authenticated: true,
      permissions: getEffectivePermissionsForRuntimeUser(runtimeUser),
    };
  }

  return buildAuthenticationFailedResult();
}

export function createSeedSession(userId, options = {}) {
  return createSignedSession(userId, seedSessionTokenPrefix, options);
}

export function createRuntimeSession(userId, options = {}) {
  return createSignedSession(userId, runtimeSessionTokenPrefix, options);
}

function createSignedSession(userId, tokenPrefix, options = {}) {
  const issuedAtMs = Number(options.nowMs ?? Date.now());
  const expiresAtMs = issuedAtMs + seedSessionTtlMs;
  const payload = {
    type: tokenPrefix,
    userId,
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    jti: randomUUID(),
  };
  if (options.sessionVersion !== undefined && options.sessionVersion !== null) {
    payload.sessionVersion = Number(options.sessionVersion) || 0;
  }
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signSeedPayload(encodedPayload, options);

  return {
    accessToken: `${tokenPrefix}.${encodedPayload}.${signature}`,
    tokenType: "Bearer",
    sessionType: tokenPrefix === runtimeSessionTokenPrefix ? "runtime" : "seed",
    userId,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    expiresInSeconds: Math.floor(seedSessionTtlMs / 1000),
    jti: payload.jti,
    sessionVersion: payload.sessionVersion,
  };
}

export function verifySeedSessionToken(token, options = {}) {
  return verifySignedSessionToken(token, seedSessionTokenPrefix, "seed", options);
}

export function verifyRuntimeSessionToken(token, options = {}) {
  return verifySignedSessionToken(token, runtimeSessionTokenPrefix, "runtime", options);
}

function verifySignedSessionToken(token, tokenPrefix, userKind, options = {}) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3 || parts[0] !== tokenPrefix) {
    return { valid: false, reason: "AUTH_TOKEN_INVALID" };
  }

  const [, encodedPayload, signature] = parts;
  const expectedSignature = signSeedPayload(encodedPayload, options);
  if (!timingSafeEqualString(signature, expectedSignature)) {
    return { valid: false, reason: "AUTH_TOKEN_INVALID" };
  }

  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    return { valid: false, reason: "AUTH_TOKEN_INVALID" };
  }
  if (payload.type !== tokenPrefix) return { valid: false, reason: "AUTH_TOKEN_INVALID" };

  const seedUser = getSeedUser(payload.userId);
  const runtimeUser = findRuntimeUser(options.runtimeUsers, { userId: payload.userId });
  const userAvailable = userKind === "runtime"
    ? !seedUser && runtimeUser && isRuntimeUserLoginEnabled(runtimeUser)
    : seedUser && seedUser.enabled !== false;
  if (!userAvailable) {
    return { valid: false, reason: "AUTH_USER_DISABLED" };
  }

  const nowMs = Number(options.nowMs ?? Date.now());
  const expiresAtMs = Date.parse(payload.expiresAt);
  if (expiresAtMs <= nowMs) {
    return { valid: false, reason: "AUTH_TOKEN_EXPIRED" };
  }

  const jti = String(payload.jti ?? "").trim();
  const revokedSessionIds = new Set(
    (Array.isArray(options.revokedSessionIds) ? options.revokedSessionIds : []).map((item) => String(item ?? "").trim()).filter(Boolean),
  );
  if (jti && revokedSessionIds.has(jti)) {
    return { valid: false, reason: "AUTH_TOKEN_REVOKED" };
  }

  const sessionValidAfter = String(runtimeUser?.sessionValidAfter ?? "").trim();
  const sessionValidAfterMs = sessionValidAfter ? Date.parse(sessionValidAfter) : NaN;
  const issuedAtMs = Date.parse(payload.issuedAt);
  if (Number.isFinite(sessionValidAfterMs) && Number.isFinite(issuedAtMs) && issuedAtMs < sessionValidAfterMs) {
    return { valid: false, reason: "AUTH_TOKEN_REVOKED" };
  }
  if (runtimeUser && runtimeUser.sessionVersion !== undefined && runtimeUser.sessionVersion !== null) {
    const expectedSessionVersion = Number(runtimeUser.sessionVersion) || 0;
    const payloadSessionVersion = Number(payload.sessionVersion);
    if (!Number.isFinite(payloadSessionVersion) || payloadSessionVersion !== expectedSessionVersion) {
      return { valid: false, reason: "AUTH_TOKEN_REVOKED" };
    }
  }

  return {
    valid: true,
    userId: payload.userId,
    session: {
      accessToken: token,
      tokenType: "Bearer",
      userId: payload.userId,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      expiresInSeconds: Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000)),
      jti: payload.jti,
      sessionVersion: payload.sessionVersion,
      sessionType: userKind,
    },
  };
}

export function getEffectivePermissionsForUser(userId = defaultSeedUserId) {
  const user = getSeedUser(userId);
  if (!user || user.enabled === false) {
    return buildDisabledPermissionContext(userId);
  }

  return buildEffectivePermissionContext(user);
}

export function getEffectivePermissionsForRuntimeUser(user, fallbackUserId) {
  const userId = String(user?.userId ?? user?.id ?? fallbackUserId ?? "").trim();
  if (!user || !isRuntimeUserLoginEnabled(user)) {
    return buildDisabledPermissionContext(userId);
  }

  const permissionContext = buildEffectivePermissionContext({
    userId,
    loginName: String(user.loginName ?? "").trim(),
    displayName: String(user.displayName ?? user.name ?? userId).trim() || userId,
    defaultRole: String(user.defaultRole ?? "").trim(),
    department: String(user.department ?? "").trim(),
    enabled: user.enabled !== false,
    roles: Array.isArray(user.roles) ? user.roles : [],
    defaultMachineId: user.defaultMachineId,
    decisionAuthority: user.decisionAuthority,
    preferredPage: user.preferredPage,
    employeeId: user.employeeId,
    loginEnabled: user.loginEnabled,
    authMethods: user.authMethods,
    phoneE164: user.phoneE164,
    phoneVerifiedAt: user.phoneVerifiedAt,
    registrationStatus: user.registrationStatus,
    mustChangePassword: user.mustChangePassword,
    passwordStatus: user.passwordStatus,
    permissionAllowlist: user.permissionAllowlist,
    permissionDenylist: user.permissionDenylist,
  });

  const passwordChangeRequired = user.mustChangePassword === true || String(user.passwordStatus ?? "").trim() === "password_expired";
  if (passwordChangeRequired) {
    return {
      ...permissionContext,
      grants: [],
      buttonPermissions: [],
      actionPermissions: [],
      passwordChangeRequired: true,
      user: {
        ...permissionContext.user,
        mustChangePassword: true,
        passwordStatus: String(user.passwordStatus ?? "").trim() || "temporary_password_issued",
      },
    };
  }

  return permissionContext;
}

export function issueRuntimeUserTemporaryPassword(user = {}, options = {}) {
  const userId = String(user.userId ?? user.id ?? "").trim();
  const issuedAtMs = Number(options.nowMs ?? Date.now());
  const temporaryPassword = String(options.temporaryPassword ?? "").trim() || buildRuntimeTemporaryPassword();
  return {
    temporaryPassword,
    passwordHash: hashRuntimeUserPassword(temporaryPassword, { userId, authSecret: options.authSecret }),
    passwordIssuedAt: new Date(issuedAtMs).toISOString(),
    mustChangePassword: true,
    passwordStatus: "temporary_password_issued",
  };
}

export function getRuntimeAccountSecurityPolicyResponse() {
  return {
    ...runtimeAccountSecurityPolicy,
    description: "导入员工连续登录失败 5 次锁定 15 分钟；正式密码 90 天过期，过期后必须先改密才恢复业务权限。",
  };
}

export function getRuntimeUserSecurityState(user = {}, options = {}) {
  const nowMs = Number(options.nowMs ?? Date.now());
  const lockedUntil = String(user.lockedUntil ?? "").trim();
  const lockedUntilMs = lockedUntil ? Date.parse(lockedUntil) : NaN;
  const locked = Number.isFinite(lockedUntilMs) && lockedUntilMs > nowMs;
  const retryAfterSeconds = locked ? Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 1000)) : 0;
  const passwordExpiresAt = getRuntimePasswordExpiresAt(user);
  const passwordExpiresAtMs = passwordExpiresAt ? Date.parse(passwordExpiresAt) : NaN;
  const passwordExpired =
    isRuntimeUserLoginEnabled(user) &&
    (String(user.passwordStatus ?? "").trim() === "password_expired" ||
      (String(user.passwordStatus ?? "").trim() === "active" &&
        Number.isFinite(passwordExpiresAtMs) &&
        passwordExpiresAtMs <= nowMs));

  return {
    policy: getRuntimeAccountSecurityPolicyResponse(),
    locked,
    lockedUntil,
    retryAfterSeconds,
    failedLoginCount: Number(user.failedLoginCount) || 0,
    passwordExpired,
    passwordExpiresAt,
  };
}

export function getRuntimePasswordExpiresAt(user = {}, options = {}) {
  const explicitExpiresAt = String(options.passwordExpiresAt ?? user.passwordExpiresAt ?? "").trim();
  if (Number.isFinite(Date.parse(explicitExpiresAt))) return new Date(Date.parse(explicitExpiresAt)).toISOString();
  if (String(user.passwordStatus ?? "").trim() !== "active") return "";
  const changedAt = String(user.passwordChangedAt ?? "").trim();
  const changedAtMs = Date.parse(changedAt);
  if (!Number.isFinite(changedAtMs)) return "";
  return new Date(changedAtMs + runtimeAccountSecurityPolicy.passwordMaxAgeDays * 24 * 60 * 60 * 1000).toISOString();
}

export function hashRuntimeUserPassword(password, options = {}) {
  const userId = String(options.userId ?? "").trim();
  if (!userId) throw new Error("A runtime user ID is required before hashing a password.");
  const encodedUserId = encodeBase64Url(userId);
  const salt = resolveRuntimePasswordSalt(options.salt);
  const passwordInput = createHmac("sha256", resolveAuthSecret(options))
    .update(`${runtimePasswordHashPrefix}:${userId}:${String(password ?? "")}`)
    .digest();
  const digest = scryptSync(passwordInput, salt, runtimePasswordDigestBytes, runtimePasswordScryptOptions);
  return `${runtimePasswordHashPrefix}.${encodedUserId}.${salt.toString("base64url")}.${digest.toString("base64url")}`;
}

export function verifyRuntimeUserPassword(user = {}, password, options = {}) {
  const passwordHash = String(user.passwordHash ?? "").trim();
  const userId = String(user.userId ?? user.id ?? "").trim();
  if (!passwordHash || !userId) return false;

  if (passwordHash.startsWith(`${legacyRuntimePasswordHashPrefix}.`)) {
    return timingSafeEqualString(
      passwordHash,
      hashLegacyRuntimeUserPassword(password, { userId, authSecret: options.authSecret }),
    );
  }

  const parts = passwordHash.split(".");
  if (parts.length !== 4 || parts[0] !== runtimePasswordHashPrefix || parts[1] !== encodeBase64Url(userId)) {
    return false;
  }
  const salt = decodeCanonicalBase64UrlBuffer(parts[2], runtimePasswordSaltBytes);
  const expectedDigest = decodeCanonicalBase64UrlBuffer(parts[3], runtimePasswordDigestBytes);
  if (!salt || !expectedDigest) return false;

  const passwordInput = createHmac("sha256", resolveAuthSecret(options))
    .update(`${runtimePasswordHashPrefix}:${userId}:${String(password ?? "")}`)
    .digest();
  const actualDigest = scryptSync(passwordInput, salt, runtimePasswordDigestBytes, runtimePasswordScryptOptions);
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function isRuntimeUserPasswordHashUpgradeRequired(userOrHash = {}) {
  const passwordHash = String(
    typeof userOrHash === "string" ? userOrHash : userOrHash?.passwordHash ?? "",
  ).trim();
  return passwordHash.startsWith(`${legacyRuntimePasswordHashPrefix}.`);
}

export function isRuntimeUserPasswordHashCurrent(user = {}) {
  const passwordHash = String(user?.passwordHash ?? "").trim();
  const userId = String(user?.userId ?? user?.id ?? "").trim();
  const parts = passwordHash.split(".");
  return Boolean(
    userId &&
      parts.length === 4 &&
      parts[0] === runtimePasswordHashPrefix &&
      parts[1] === encodeBase64Url(userId) &&
      decodeCanonicalBase64UrlBuffer(parts[2], runtimePasswordSaltBytes) &&
      decodeCanonicalBase64UrlBuffer(parts[3], runtimePasswordDigestBytes),
  );
}

function hashLegacyRuntimeUserPassword(password, options = {}) {
  const userId = String(options.userId ?? "").trim();
  const encodedUserId = encodeBase64Url(userId);
  const digest = createHmac("sha256", resolveAuthSecret(options))
    .update(`${legacyRuntimePasswordHashPrefix}:${userId}:${String(password ?? "")}`)
    .digest("base64url");
  return `${legacyRuntimePasswordHashPrefix}.${encodedUserId}.${digest}`;
}

function resolveRuntimePasswordSalt(value) {
  if (Buffer.isBuffer(value)) {
    if (value.length !== runtimePasswordSaltBytes) {
      throw new Error(`Runtime password salt must be ${runtimePasswordSaltBytes} bytes.`);
    }
    return Buffer.from(value);
  }
  return randomBytes(runtimePasswordSaltBytes);
}

function decodeCanonicalBase64UrlBuffer(value, expectedLength) {
  try {
    const encoded = String(value ?? "");
    if (encoded.length !== Buffer.alloc(expectedLength).toString("base64url").length) return null;
    const decoded = Buffer.from(encoded, "base64url");
    if (decoded.length !== expectedLength || decoded.toString("base64url") !== encoded) return null;
    return decoded;
  } catch {
    return null;
  }
}

function buildEffectivePermissionContext(user) {
  const { roles, buttonPermissions, actionPermissions, allowPermissions } = resolvePermissionAssignment({
    roles: user.roles?.length ? user.roles : [user.defaultRole],
    permissionAllowlist: user.permissionAllowlist,
    permissionDenylist: user.permissionDenylist,
  });
  const explicitAllowSet = new Set(allowPermissions);
  const grants = unique([...buttonPermissions, ...actionPermissions]).map((permissionKey) =>
    explicitAllowSet.has(permissionKey) && !findGrantSourceRole(permissionKey, roles)
      ? buildExplicitGrant(permissionKey)
      : buildGrant(permissionKey, findGrantSourceRole(permissionKey, roles)),
  );

  return {
    user: {
      userId: user.userId,
      loginName: user.loginName,
      displayName: user.displayName,
      defaultRole: user.defaultRole,
      department: user.department,
      defaultMachineId: user.defaultMachineId ?? "",
      decisionAuthority: user.decisionAuthority ?? "",
      preferredPage: user.preferredPage ?? "",
      enabled: user.enabled,
      employeeId: user.employeeId ?? "",
      loginEnabled: user.loginEnabled === true,
      mustChangePassword: user.mustChangePassword === true,
      passwordStatus: String(user.passwordStatus ?? "").trim(),
      phoneE164: String(user.phoneE164 ?? "").trim(),
      phoneVerifiedAt: String(user.phoneVerifiedAt ?? "").trim(),
      registrationStatus: String(user.registrationStatus ?? "").trim(),
    },
    roles,
    grants,
    buttonPermissions,
    actionPermissions,
  };
}

function buildExplicitGrant(permissionKey) {
  return {
    permissionKey,
    scope: "subaccount",
    source: "explicit:allow",
  };
}

function buildAuthenticationFailedResult() {
  return {
    authenticated: false,
    error: {
      code: "AUTHENTICATION_FAILED",
      message: "登录名、用户编号或密码不正确。",
    },
  };
}

function findRuntimeUser(runtimeUsers = [], identifiers = {}) {
  const normalizedLoginName = String(identifiers.loginName ?? "").trim();
  const normalizedUserId = String(identifiers.userId ?? "").trim();
  return (
    (Array.isArray(runtimeUsers) ? runtimeUsers : []).find((candidate) => {
      const candidateUserId = String(candidate?.userId ?? candidate?.id ?? "").trim();
      const candidateLoginName = String(candidate?.loginName ?? "").trim();
      return (
        (normalizedUserId && candidateUserId === normalizedUserId) ||
        (normalizedLoginName && candidateLoginName === normalizedLoginName)
      );
    }) ?? null
  );
}

function isRuntimeUserLoginEnabled(user = {}) {
  const authMethods = Array.isArray(user.authMethods) ? user.authMethods : [];
  const phoneOtpEnabled =
    authMethods.includes("phone_otp") &&
    Boolean(String(user.phoneE164 ?? "").trim()) &&
    Boolean(String(user.phoneVerifiedAt ?? "").trim());
  return (
    user.enabled !== false &&
    user.loginEnabled === true &&
    (Boolean(String(user.passwordHash ?? "").trim()) || phoneOtpEnabled)
  );
}

function buildRuntimeTemporaryPassword() {
  return `EMP-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function buildDisabledPermissionContext(userId) {
  return createDisabledPermissionContext(userId || "UNKNOWN-SEED-USER");
}

function buildGrant(permissionKey, roleKey) {
  return {
    permissionKey,
    scope: roleCatalog[roleKey]?.department ?? "seed",
    source: roleKey ? `role:${roleKey}` : "role:unknown",
  };
}

function findGrantSourceRole(permissionKey, roles) {
  return (
    roles.find(
      (roleKey) =>
        roleCatalog[roleKey]?.buttonPermissions.includes(permissionKey) ||
        roleCatalog[roleKey]?.actionPermissions.includes(permissionKey),
    ) ?? roles[0]
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function signSeedPayload(encodedPayload, options = {}) {
  return createHmac("sha256", resolveAuthSecret(options)).update(encodedPayload).digest("base64url");
}

function resolveAuthSecret(options = {}) {
  const configuredSecret = String(options.authSecret ?? process.env.ERP_AUTH_SECRET ?? "").trim();
  return configuredSecret || prototypeSeedAuthSecret;
}

function encodeBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
