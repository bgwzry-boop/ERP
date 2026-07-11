import { roleCatalog } from "../../shared/auth/roleCatalog.js";
import { getRuntimeUserSecurityState, isRuntimeUserPasswordHashCurrent } from "../authSeed.mjs";

export const requiredV1RuntimeEmployeeRoles = Object.freeze([
  "office",
  "warehouse",
  "finance",
  "workshop",
  "packing",
  "driver",
  "management",
  "technical_operations",
]);

const blockerLabels = Object.freeze({
  account_disabled: "账号已停用",
  login_disabled: "登录未启用",
  password_missing: "未设置密码",
  password_hash_upgrade_required: "密码摘要尚未升级",
  password_change_required: "仍需首次修改密码",
  password_change_timestamp_missing: "缺少正式改密时间",
  password_not_active: "密码状态不是有效",
  password_expiry_missing: "未设置密码有效期",
  password_expired: "密码已过期",
  account_locked: "账号仍被锁定",
  machine_scope_missing: "车间账号未绑定默认机器",
});

export function buildRuntimeEmployeeAccountReadiness({ users = [], nowMs = Date.now() } = {}) {
  const formalUsers = (Array.isArray(users) ? users : []).filter(
    (user) => String(user?.source ?? "").trim() === "master_data_import_review",
  );
  const roles = requiredV1RuntimeEmployeeRoles.map((roleKey) => {
    const candidates = formalUsers.filter((user) => getPrimaryRole(user) === roleKey);
    const evaluations = candidates.map((user) => evaluateRuntimeEmployeeAccount(user, { roleKey, nowMs }));
    const readyAccountCount = evaluations.filter((item) => item.ready).length;
    return {
      roleKey,
      roleLabel: roleCatalog[roleKey]?.displayName ?? roleKey,
      ready: readyAccountCount > 0,
      accountCount: candidates.length,
      readyAccountCount,
      blockers: aggregateBlockers(evaluations.flatMap((item) => item.blockers)),
    };
  });
  const coveredRoleCount = roles.filter((role) => role.ready).length;
  return {
    ready: coveredRoleCount === roles.length,
    requiredRoleCount: roles.length,
    coveredRoleCount,
    missingRoleCount: roles.length - coveredRoleCount,
    formalAccountCount: formalUsers.length,
    readyFormalAccountCount: formalUsers.filter((user) =>
      evaluateRuntimeEmployeeAccount(user, { roleKey: getPrimaryRole(user), nowMs }).ready,
    ).length,
    roles,
  };
}

function evaluateRuntimeEmployeeAccount(user, { roleKey, nowMs }) {
  const blockers = [];
  const passwordHash = String(user?.passwordHash ?? "").trim();
  const passwordStatus = String(user?.passwordStatus ?? "").trim();
  const passwordChangedAtMs = Date.parse(String(user?.passwordChangedAt ?? ""));
  const passwordExpiresAtMs = Date.parse(String(user?.passwordExpiresAt ?? ""));
  const securityState = getRuntimeUserSecurityState(user, { nowMs });

  if (user?.enabled !== true) blockers.push("account_disabled");
  if (user?.loginEnabled !== true) blockers.push("login_disabled");
  if (!passwordHash) blockers.push("password_missing");
  else if (!isRuntimeUserPasswordHashCurrent(user)) blockers.push("password_hash_upgrade_required");
  if (user?.mustChangePassword === true) blockers.push("password_change_required");
  if (passwordStatus !== "active") blockers.push("password_not_active");
  if (!Number.isFinite(passwordChangedAtMs)) blockers.push("password_change_timestamp_missing");
  if (!Number.isFinite(passwordExpiresAtMs)) blockers.push("password_expiry_missing");
  if (securityState.passwordExpired) blockers.push("password_expired");
  if (securityState.locked) blockers.push("account_locked");
  if (roleKey === "workshop" && !String(user?.defaultMachineId ?? "").trim()) {
    blockers.push("machine_scope_missing");
  }

  return { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
}

function getPrimaryRole(user = {}) {
  const defaultRole = String(user.defaultRole ?? "").trim();
  if (defaultRole) return defaultRole;
  return String(Array.isArray(user.roles) ? user.roles[0] ?? "" : "").trim();
}

function aggregateBlockers(blockers) {
  const counts = new Map();
  for (const code of blockers) counts.set(code, (counts.get(code) ?? 0) + 1);
  return [...counts.entries()].map(([code, count]) => ({
    code,
    label: blockerLabels[code] ?? code,
    count,
  }));
}
