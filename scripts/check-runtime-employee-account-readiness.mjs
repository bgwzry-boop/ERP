import assert from "node:assert/strict";
import { hashRuntimeUserPassword } from "../server/authSeed.mjs";
import {
  buildRuntimeEmployeeAccountReadiness,
  requiredV1RuntimeEmployeeRoles,
} from "../server/services/runtimeEmployeeAccountReadiness.mjs";

const nowMs = Date.parse("2026-07-12T08:00:00.000Z");
const authSecret = "runtime-account-readiness-check-secret";

const empty = buildRuntimeEmployeeAccountReadiness({ users: [], nowMs });
assert.equal(empty.ready, false);
assert.equal(empty.requiredRoleCount, 8);
assert.equal(empty.coveredRoleCount, 0);
assert.equal(empty.missingRoleCount, 8);

const readyUsers = requiredV1RuntimeEmployeeRoles.map((roleKey) => buildReadyUser(roleKey));
const ready = buildRuntimeEmployeeAccountReadiness({ users: readyUsers, nowMs });
assert.equal(ready.ready, true);
assert.equal(ready.requiredRoleCount, 8);
assert.equal(ready.coveredRoleCount, 8);
assert.equal(ready.readyFormalAccountCount, 8);
assert(ready.roles.every((role) => role.ready && role.readyAccountCount === 1));

const blockedUsers = readyUsers.map((user) => ({ ...user, roles: [...user.roles] }));
const workshop = blockedUsers.find((user) => user.defaultRole === "workshop");
workshop.defaultMachineId = "";
const finance = blockedUsers.find((user) => user.defaultRole === "finance");
finance.mustChangePassword = true;
finance.passwordStatus = "temporary_password_issued";
const driver = blockedUsers.find((user) => user.defaultRole === "driver");
driver.lockedUntil = "2026-07-12T08:15:00.000Z";
const office = blockedUsers.find((user) => user.defaultRole === "office");
office.passwordExpiresAt = "2026-07-12T07:59:59.000Z";
const blocked = buildRuntimeEmployeeAccountReadiness({ users: blockedUsers, nowMs });
assert.equal(blocked.ready, false);
assert.equal(blocked.coveredRoleCount, 4);
assert.deepEqual(blockerCodes(blocked, "workshop"), ["machine_scope_missing"]);
assert.deepEqual(blockerCodes(blocked, "finance"), ["password_change_required", "password_not_active"]);
assert.deepEqual(blockerCodes(blocked, "driver"), ["account_locked"]);
assert.deepEqual(blockerCodes(blocked, "office"), ["password_expired"]);

const seedLikeUsers = readyUsers.map((user) => ({ ...user, source: "seed" }));
const seedLike = buildRuntimeEmployeeAccountReadiness({ users: seedLikeUsers, nowMs });
assert.equal(seedLike.formalAccountCount, 0);
assert.equal(seedLike.coveredRoleCount, 0);

const multiRoleShortcut = readyUsers.map((user) => ({ ...user, roles: [...user.roles] }));
multiRoleShortcut[0].roles = [...requiredV1RuntimeEmployeeRoles];
const withoutWarehousePrimary = multiRoleShortcut.filter((user) => user.defaultRole !== "warehouse");
const primaryRoleCoverage = buildRuntimeEmployeeAccountReadiness({ users: withoutWarehousePrimary, nowMs });
assert.equal(primaryRoleCoverage.roles.find((role) => role.roleKey === "warehouse").ready, false);

console.log("runtime employee account readiness check passed");

function buildReadyUser(roleKey) {
  const userId = `U-V1-${roleKey.toUpperCase()}`;
  return {
    id: userId,
    userId,
    loginName: `v1.${roleKey}`,
    displayName: roleKey,
    defaultRole: roleKey,
    roles: [roleKey],
    source: "master_data_import_review",
    enabled: true,
    loginEnabled: true,
    passwordHash: hashRuntimeUserPassword(`D47-${roleKey}-password`, { userId, authSecret }),
    passwordStatus: "active",
    mustChangePassword: false,
    passwordChangedAt: "2026-07-01T00:00:00.000Z",
    passwordExpiresAt: "2026-09-29T00:00:00.000Z",
    lockedUntil: "",
    defaultMachineId: roleKey === "workshop" ? "BAG-01" : "",
  };
}

function blockerCodes(readiness, roleKey) {
  return readiness.roles
    .find((role) => role.roleKey === roleKey)
    .blockers.map((blocker) => blocker.code)
    .sort();
}
