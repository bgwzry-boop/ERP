import assert from "node:assert/strict";
import { createMasterDataSubaccountCommandService } from "../server/services/masterDataSubaccountCommandService.mjs";
import { getEffectivePermissionsForRuntimeUser } from "../server/authSeed.mjs";
import { resolvePermissionAssignment } from "../shared/auth/roleCatalog.js";

let logSequence = 0;
const clock = { value: Date.parse("2026-08-26T02:00:00.000Z") };
const now = () => new Date(clock.value += 1_000);
const service = createMasterDataSubaccountCommandService({
  now,
  createId: () => "subaccount-check-0001",
  buildOperationLog(_workspace, input) {
    return { id: `LOG-SUB-${++logSequence}`, createdAt: input.occurredAt, ...input };
  },
});
const managerPermissions = resolvePermissionAssignment({ roles: ["management"] });
const operatorPermissions = [...new Set([
  ...managerPermissions.buttonPermissions,
  ...managerPermissions.actionPermissions,
])];
const persistedSnapshots = [];
const workspace = {
  employees: [{ id: "EMP-001", name: "库房甲", profileStatus: "active" }],
  users: [],
  operationLogs: [],
  securityPolicy: { authSecret: "subaccount-check-secret" },
  runtimeIdentityRepository: {
    async saveState({ workspace: next }) {
      persistedSnapshots.push(structuredClone({ users: next.users, operationLogs: next.operationLogs }));
    },
  },
};

const created = await service.createSubaccount({
  workspace,
  operatorId: "U-MANAGER-A",
  operatorPermissions,
  body: {
    displayName: "库房李师傅",
    loginName: "warehouse.lisi",
    employeeId: "EMP-001",
    roleKeys: ["warehouse"],
    permissionAllowlist: ["maintenance.task.read"],
    permissionDenylist: ["inventory.correction.create"],
    reason: "子账号试用",
  },
});
assert.equal(created.statusCode, 201);
assert.equal(created.response.subaccount.accountStatus, "draft");
assert.equal(created.response.subaccount.loginEnabled, false);
assert.equal(created.response.subaccount.permissionRevision, 1);
assert.equal(created.response.subaccount.employeeName, "库房甲");
assert.equal(workspace.users[0].passwordHash, undefined);
assert.equal(persistedSnapshots.length, 1);

const conflict = await service.updateSubaccount({
  workspace,
  userId: created.response.subaccount.userId,
  operatorId: "U-MANAGER-A",
  operatorPermissions,
  body: { ...created.response.subaccount, roleKeys: ["warehouse"], expectedRevision: 0, reason: "过期版本" },
});
assert.equal(conflict.code, "SUBACCOUNT_PERMISSION_REVISION_CONFLICT");

const escalation = await service.updateSubaccount({
  workspace,
  userId: created.response.subaccount.userId,
  operatorId: "U-TECH-A",
  operatorPermissions: ["permission.manage"],
  body: {
    displayName: "库房李师傅",
    employeeId: "EMP-001",
    roleKeys: ["warehouse"],
    permissionAllowlist: ["payroll.export"],
    expectedRevision: 1,
    reason: "越权测试",
  },
});
assert.equal(escalation.code, "SUBACCOUNT_PERMISSION_ESCALATION_BLOCKED");

const updated = await service.updateSubaccount({
  workspace,
  userId: created.response.subaccount.userId,
  operatorId: "U-MANAGER-A",
  operatorPermissions,
  body: {
    displayName: "库房李师傅",
    employeeId: "EMP-001",
    roleKeys: ["warehouse", "packing"],
    permissionAllowlist: ["maintenance.task.read"],
    permissionDenylist: ["inventory.correction.create"],
    expectedRevision: 1,
    reason: "补充打包模板",
  },
});
assert.equal(updated.response.subaccount.permissionRevision, 2);
assert.deepEqual(updated.response.subaccount.roles, ["warehouse", "packing"]);

const issued = await service.issueTemporaryPassword({
  workspace,
  userId: created.response.subaccount.userId,
  operatorId: "U-MANAGER-A",
  body: { reason: "现场交付一次性密码" },
});
assert.equal(issued.response.subaccount.accountStatus, "active");
assert.match(issued.response.credential.temporaryPassword, /^EMP-/);
assert.equal("passwordHash" in issued.response.subaccount, false);
assert.equal("temporaryPassword" in issued.response.subaccount, false);
assert.ok(workspace.users[0].passwordHash);
assert.equal("temporaryPassword" in workspace.users[0], false);

const activeUser = {
  ...workspace.users[0],
  mustChangePassword: false,
  passwordStatus: "active",
};
const effective = getEffectivePermissionsForRuntimeUser(activeUser);
assert.equal(effective.actionPermissions.includes("maintenance.task.read"), true);
assert.equal(effective.actionPermissions.includes("inventory.correction.create"), false);

const suspended = await service.suspendSubaccount({
  workspace,
  userId: created.response.subaccount.userId,
  operatorId: "U-MANAGER-A",
  body: { reason: "临时离岗" },
});
assert.equal(suspended.response.subaccount.accountStatus, "suspended");
assert.equal(suspended.response.subaccount.loginEnabled, false);

const reactivated = await service.reactivateSubaccount({
  workspace,
  userId: created.response.subaccount.userId,
  operatorId: "U-MANAGER-A",
  body: { reason: "返岗" },
});
assert.equal(reactivated.response.subaccount.accountStatus, "active");
assert.equal(reactivated.response.subaccount.loginEnabled, true);

const selfBlocked = await service.suspendSubaccount({
  workspace,
  userId: created.response.subaccount.userId,
  operatorId: created.response.subaccount.userId,
  body: { reason: "自停用" },
});
assert.equal(selfBlocked.code, "SUBACCOUNT_SELF_MUTATION_BLOCKED");

const disabled = await service.disableSubaccount({
  workspace,
  userId: created.response.subaccount.userId,
  operatorId: "U-MANAGER-A",
  body: { reason: "永久停用测试" },
});
assert.equal(disabled.response.subaccount.accountStatus, "disabled");
assert.equal(disabled.response.subaccount.loginEnabled, false);
assert.equal(workspace.operationLogs[0].targetType, "master_data_subaccount");

console.log("master-data subaccount command service checks passed");
