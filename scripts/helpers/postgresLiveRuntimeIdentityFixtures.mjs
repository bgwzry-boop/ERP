import { hashRuntimeUserPassword } from "../../server/authSeed.mjs";

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
    passwordChangedAt: "2026-07-12T00:00:00.000Z",
    passwordExpiresAt: "2026-10-10T00:00:00.000Z",
    sessionVersion: 1,
    updatedAt: "2026-07-12T00:00:00.000Z",
  };
}
