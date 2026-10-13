import { getRuntimePasswordExpiresAt, hashRuntimeUserPassword } from "../../server/authSeed.mjs";

export function buildLiveRuntimeUser({
  userId,
  loginName,
  password,
  authSecret,
  displayName,
  role,
  department,
  employeeId,
}) {
  const resolvedAuthSecret = String(authSecret ?? "").trim();
  if (!resolvedAuthSecret) {
    throw new Error("A PostgreSQL live runtime-auth secret is required for a runtime user fixture.");
  }

  const passwordChangedAt = new Date().toISOString();
  const passwordExpiresAt = getRuntimePasswordExpiresAt({ passwordChangedAt, passwordStatus: "active" });

  return {
    userId,
    loginName,
    displayName,
    defaultRole: role,
    department,
    enabled: true,
    roles: [role],
    employeeId,
    source: "master_data_import_review",
    loginEnabled: true,
    passwordHash: hashRuntimeUserPassword(password, { userId, authSecret: resolvedAuthSecret }),
    passwordStatus: "active",
    mustChangePassword: false,
    passwordChangedAt,
    passwordExpiresAt,
    sessionVersion: 1,
    updatedAt: passwordChangedAt,
  };
}
