import assert from "node:assert/strict";
import { hashRuntimeUserPassword } from "../server/authSeed.mjs";
import { buildDefaultMasterDataMachines } from "../server/masterDataMachineConfigurationRepository.mjs";
import {
  buildRuntimeEmployeeAccountReadiness,
  requiredV1RuntimeEmployeeRoles,
} from "../server/services/runtimeEmployeeAccountReadiness.mjs";

const nowMs = Date.parse("2026-07-12T08:00:00.000Z");
const authSecret = "runtime-account-readiness-check-secret";
const machines = buildDefaultMasterDataMachines();

const empty = buildRuntimeEmployeeAccountReadiness({ users: [], nowMs });
assert.equal(empty.ready, false);
assert.equal(empty.requiredRoleCount, 8);
assert.equal(empty.coveredRoleCount, 0);
assert.equal(empty.missingRoleCount, 8);

const readyUsers = requiredV1RuntimeEmployeeRoles.map((roleKey) => buildReadyUser(roleKey));
const ready = buildRuntimeEmployeeAccountReadiness({ users: readyUsers, machines, nowMs });
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
const blocked = buildRuntimeEmployeeAccountReadiness({ users: blockedUsers, machines, nowMs });
assert.equal(blocked.ready, false);
assert.equal(blocked.coveredRoleCount, 4);
assert.deepEqual(blockerCodes(blocked, "workshop"), ["machine_scope_missing"]);
assert.deepEqual(blockerCodes(blocked, "finance"), ["password_change_required", "password_not_active"]);
assert.deepEqual(blockerCodes(blocked, "driver"), ["account_locked"]);
assert.deepEqual(blockerCodes(blocked, "office"), ["password_expired"]);

const unknownMachineUsers = readyUsers.map((user) => ({ ...user, roles: [...user.roles] }));
unknownMachineUsers.find((user) => user.defaultRole === "workshop").defaultMachineId = "MISSING-01";
const unknownMachine = buildRuntimeEmployeeAccountReadiness({ users: unknownMachineUsers, machines, nowMs });
assert.deepEqual(blockerCodes(unknownMachine, "workshop"), ["machine_configuration_missing"]);

const inactiveMachines = machines.map((machine) => machine.machineId === "BAG-01" ? { ...machine, status: "maintenance", enabled: false } : machine);
const inactiveMachine = buildRuntimeEmployeeAccountReadiness({ users: readyUsers, machines: inactiveMachines, nowMs });
assert.deepEqual(blockerCodes(inactiveMachine, "workshop"), ["machine_not_active"]);

const seedLikeUsers = readyUsers.map((user) => ({ ...user, source: "seed" }));
const seedLike = buildRuntimeEmployeeAccountReadiness({ users: seedLikeUsers, machines, nowMs });
assert.equal(seedLike.formalAccountCount, 0);
assert.equal(seedLike.coveredRoleCount, 0);

const nonAccountDecisionMakers = buildRuntimeEmployeeAccountReadiness({
  users: [{
    employeeId: "ERP-DECISION-MAKER-001",
    displayName: "未开通账号的经营决定人",
    source: "business_decision_authorization",
    roles: ["management", "finance"],
    enabled: true,
  }],
  machines,
  nowMs,
});
assert.equal(nonAccountDecisionMakers.formalAccountCount, 0, "a decision-maker authorization is not a formal ERP account");
assert.equal(nonAccountDecisionMakers.coveredRoleCount, 0, "non-account decision makers must not satisfy D49 role coverage");

const multiRoleUsers = readyUsers
  .filter((user) => user.defaultRole !== "finance")
  .map((user) => ({ ...user, roles: [...user.roles] }));
const multiRoleManager = multiRoleUsers.find((user) => user.defaultRole === "management");
multiRoleManager.roles = ["management", "finance"];
const multiRoleCoverage = buildRuntimeEmployeeAccountReadiness({ users: multiRoleUsers, machines, nowMs });
assert.equal(multiRoleCoverage.ready, true, "one formal account may satisfy management and finance roles");
assert.equal(multiRoleCoverage.formalAccountCount, 7, "multi-role coverage must not duplicate the formal account count");
assert.equal(multiRoleCoverage.readyFormalAccountCount, 7);
assert.equal(multiRoleCoverage.roles.find((role) => role.roleKey === "management").accountCount, 1);
assert.equal(multiRoleCoverage.roles.find((role) => role.roleKey === "finance").accountCount, 1);
assert.equal(multiRoleCoverage.roles.find((role) => role.roleKey === "finance").ready, true);

console.log("runtime employee account readiness check passed, including seed and non-account decision-maker exclusion");

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
