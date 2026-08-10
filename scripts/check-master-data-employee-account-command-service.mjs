import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyRuntimeUserPassword } from "../server/authSeed.mjs";
import { buildDefaultMasterDataMachines } from "../server/masterDataMachineConfigurationRepository.mjs";
import { buildLegacyImportedMachineId } from "../shared/masterDataMachineIdentity.js";
import {
  buildEmployeeAssignmentOptions,
  createMasterDataEmployeeAccountCommandService,
  listMasterDataEmployeeAccountReviews,
  toMasterDataEmployeeAccountReview,
} from "../server/services/masterDataEmployeeAccountCommandService.mjs";

const apiServerSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const commandServiceSource = readFileSync(
  new URL("../server/services/masterDataEmployeeAccountCommandService.mjs", import.meta.url),
  "utf8",
);
assert.doesNotMatch(apiServerSource, /issueRuntimeUserTemporaryPassword\(/);
assert.doesNotMatch(apiServerSource, /function upsertMasterDataEmployeeUser\(/);
assert.match(commandServiceSource, /issueRuntimeUserTemporaryPassword\(/);
assert.match(commandServiceSource, /persistAndCommitIdentityWorkspace\(/);
assert.match(commandServiceSource, /enableEmployeeAccounts/);
assert.match(commandServiceSource, /atomic: true/);
assert.match(commandServiceSource, /mergeEmployeeIdentity/);
assert.match(commandServiceSource, /merged_duplicate/);
assert.match(commandServiceSource, /confirmEmployeeIdentity/);
assert.match(commandServiceSource, /departEmployeeAccount/);
assert.match(commandServiceSource, /master_data_employee_departed/);
assert.match(commandServiceSource, /validateEmployeeAccountIdentityConfirmation/);

const fixedNow = new Date("2026-07-12T09:00:00.000Z");
let logSequence = 0;
const service = createMasterDataEmployeeAccountCommandService({
  buildOperationLog(_workspace, input) {
    logSequence += 1;
    return {
      id: `LOG-EMP-${logSequence}`,
      ...input,
      occurredAt: fixedNow.toISOString(),
      createdAt: fixedNow.toISOString(),
    };
  },
  now: () => fixedNow,
});

assert.throws(
  () => createMasterDataEmployeeAccountCommandService(),
  /buildOperationLog must be a function/,
);

const assignmentOptions = buildEmployeeAssignmentOptions({ machines: buildDefaultMasterDataMachines() });
assert.deepEqual(assignmentOptions.workshops, ["丝印车间", "1号车间", "2号车间", "3号车间"]);
assert.equal(assignmentOptions.machines.length, 13);
assert.equal(assignmentOptions.machines.find((machine) => machine.machineId === "BAG-04")?.workshop, "2号车间");
assert.equal(assignmentOptions.machines.find((machine) => machine.machineId === "PRINT-04")?.workshop, "丝印车间");
assert.deepEqual(buildEmployeeAssignmentOptions({ machines: [] }), { workshops: [], machines: [] });

const reviewWorkspace = createWorkspace({
  employees: [
    createEmployee("EMP-WORKER-001", "EMP001", "王师傅"),
    { ...createEmployee("EMP-WORKER-002", "EMP002", "李师傅"), profileStatus: "account_enabled", accountEnabled: true },
  ],
});
assert.equal(listMasterDataEmployeeAccountReviews(reviewWorkspace).length, 2);
assert.equal(listMasterDataEmployeeAccountReviews(reviewWorkspace)[0].machineConfigurationStatus, "active");
assert.deepEqual(
  listMasterDataEmployeeAccountReviews(reviewWorkspace, { keyword: "EMP002" }).map((item) => item.employeeId),
  ["EMP-WORKER-002"],
);
assert.deepEqual(
  listMasterDataEmployeeAccountReviews(reviewWorkspace, { status: "pending_admin_review" }).map((item) => item.employeeId),
  ["EMP-WORKER-001"],
);
assert.doesNotMatch(apiServerSource, /function listMasterDataEmployeeAccountReviews/);

{
  const departureWorkspace = createWorkspace({
    employees: [{
      ...createEmployee("EMP-DEPART-001", "EMP0032", "张帅"),
      roleName: "打包",
      defaultWorkshop: "打包区",
      defaultMachineId: "PACK-01",
    }],
  });
  const missingConfirmation = await service.departEmployeeAccount({
    workspace: departureWorkspace,
    employeeId: "EMP-DEPART-001",
    body: { reason: "员工已离职" },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(missingConfirmation.code, "MASTER_DATA_EMPLOYEE_DEPARTURE_CONFIRMATION_REQUIRED");

  const departed = await service.departEmployeeAccount({
    workspace: departureWorkspace,
    employeeId: "EMP-DEPART-001",
    body: { confirmed: true, reason: "员工已离职" },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(departed.statusCode, 200);
  assert.equal(departed.response.employeeAccountReview.status, "departed");
  assert.equal(departed.response.employeeAccountReview.statusLabel, "已离职");
  assert.equal(departed.response.employeeAccountReview.actionRequired, false);
  assert.equal(departureWorkspace.employees[0].profileStatus, "departed");
  assert.equal(departureWorkspace.employees[0].requestedEnabled, false);
  assert.equal(departureWorkspace.employees[0].defaultMachineId, "");
  assert.equal(departureWorkspace.employees[0].defaultWorkshop, "");
  assert.equal(departureWorkspace.operationLogs[0].action, "master_data_employee_departed");
  assert.equal(departureWorkspace.persistedStates[0].identityEmployeeUpdates[0].profileStatus, "departed");
  assert.deepEqual(
    listMasterDataEmployeeAccountReviews(departureWorkspace, { status: "departed" }).map((item) => item.employeeId),
    ["EMP-DEPART-001"],
  );
  const cannotEnable = await service.enableEmployeeAccount({
    workspace: departureWorkspace,
    employeeId: "EMP-DEPART-001",
    operatorId: "U-MANAGER-A",
  });
  assert.equal(cannotEnable.code, "MASTER_DATA_EMPLOYEE_DEPARTED");
}

{
  const identityMergeWorkspace = createWorkspace({
    employees: [
      createEmployee("EMP-DUPLICATE-001", "EMP001", "孔李扬"),
      {
        ...createEmployee("EMP-CANONICAL-001", "EMP002", "孔李杨"),
        defaultWorkshop: "",
        defaultMachineId: "",
      },
    ],
  });
  const missingConfirmation = await service.mergeEmployeeIdentity({
    workspace: identityMergeWorkspace,
    employeeId: "EMP-DUPLICATE-001",
    body: {
      targetEmployeeId: "EMP-CANONICAL-001",
      canonicalName: "孔李杨",
      reason: "确认两条记录为同一员工",
    },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(missingConfirmation.code, "MASTER_DATA_EMPLOYEE_IDENTITY_MERGE_CONFIRMATION_REQUIRED");

  const merged = await service.mergeEmployeeIdentity({
    workspace: identityMergeWorkspace,
    employeeId: "EMP-DUPLICATE-001",
    body: {
      confirmed: true,
      targetEmployeeId: "EMP-CANONICAL-001",
      canonicalName: "孔李杨",
      reason: "确认两条记录为同一员工",
    },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(merged.statusCode, 200);
  assert.equal(merged.response.retainedEmployee.employeeId, "EMP-CANONICAL-001");
  assert.equal(merged.response.retainedEmployee.name, "孔李杨");
  assert.equal(merged.response.retiredEmployeeId, "EMP-DUPLICATE-001");
  assert.equal(identityMergeWorkspace.employees[0].profileStatus, "merged_duplicate");
  assert.equal(identityMergeWorkspace.employees[0].accountEnabled, false);
  assert.equal(identityMergeWorkspace.employees[1].name, "孔李杨");
  assert.equal(identityMergeWorkspace.employees[1].defaultMachineId, "BAG-01");
  assert.equal(identityMergeWorkspace.employees[1].assignmentMode, "fixed_machine");
  assert.deepEqual(
    listMasterDataEmployeeAccountReviews(identityMergeWorkspace).map((item) => item.employeeId),
    ["EMP-CANONICAL-001"],
  );
  assert.equal(identityMergeWorkspace.operationLogs[0].action, "master_data_employee_identity_merged");
  assert.equal(identityMergeWorkspace.persistedStates[0].identityEmployeeUpdates.length, 2);

  const replay = await service.mergeEmployeeIdentity({
    workspace: identityMergeWorkspace,
    employeeId: "EMP-DUPLICATE-001",
    body: {
      confirmed: true,
      targetEmployeeId: "EMP-CANONICAL-001",
      canonicalName: "孔李杨",
      reason: "重复操作",
    },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(replay.code, "MASTER_DATA_EMPLOYEE_IDENTITY_MERGE_ALREADY_RESOLVED");
}

const assignmentWorkspace = createWorkspace();
const fixedAssignment = await service.updateEmployeeAssignment({
  workspace: assignmentWorkspace,
  employeeId: "EMP-WORKER-001",
  body: {
    assignmentMode: "fixed_machine",
    workshop: "1号车间",
    machineId: "BAG-02",
    reason: "调整到2号机",
    changedAt: "2000-01-01T00:00:00.000Z",
  },
  operatorId: "U-MANAGER-A",
});
assert.equal(fixedAssignment.statusCode, 200);
assert.equal(fixedAssignment.response.employeeAccountReview.defaultWorkshop, "1号车间");
assert.equal(fixedAssignment.response.employeeAccountReview.defaultMachineId, "BAG-02");
assert.equal(fixedAssignment.response.employeeAccountReview.assignmentMode, "fixed_machine");
assert.equal(fixedAssignment.response.employeeAccountReview.assignmentUpdatedAt, fixedNow.toISOString());
assert.equal(assignmentWorkspace.employees[0].updatedAt, fixedNow.toISOString());
assert.equal(assignmentWorkspace.operationLogs[0].action, "master_data_employee_assignment_updated");
assert.equal(assignmentWorkspace.operationLogs[0].operatorId, "U-MANAGER-A");

const missingWorkshopAssignment = await service.updateEmployeeAssignment({
  workspace: assignmentWorkspace,
  employeeId: "EMP-WORKER-001",
  body: { assignmentMode: "fixed_machine", machineId: "BAG-02" },
  operatorId: "U-MANAGER-A",
});
assert.equal(missingWorkshopAssignment.code, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_WORKSHOP_REQUIRED");

const unknownWorkshopAssignment = await service.updateEmployeeAssignment({
  workspace: assignmentWorkspace,
  employeeId: "EMP-WORKER-001",
  body: { assignmentMode: "general_worker", workshop: "不存在车间" },
  operatorId: "U-MANAGER-A",
});
assert.equal(unknownWorkshopAssignment.code, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_WORKSHOP_NOT_FOUND");

const generalWorkerAssignment = await service.updateEmployeeAssignment({
  workspace: assignmentWorkspace,
  employeeId: "EMP-WORKER-001",
  body: {
    assignmentMode: "general_worker",
    workshop: "2号车间",
    machineId: "BAG-04",
    reason: "改为2号车间杂工",
  },
  operatorId: "U-MANAGER-A",
});
assert.equal(generalWorkerAssignment.statusCode, 200);
assert.equal(generalWorkerAssignment.response.employeeAccountReview.defaultWorkshop, "2号车间");
assert.equal(generalWorkerAssignment.response.employeeAccountReview.defaultMachineId, "");
assert.equal(generalWorkerAssignment.response.employeeAccountReview.assignmentMode, "general_worker");

const unassignedAssignment = await service.updateEmployeeAssignment({
  workspace: assignmentWorkspace,
  employeeId: "EMP-WORKER-001",
  body: {
    assignmentMode: "unassigned",
    workshop: "2号车间",
    machineId: "BAG-04",
    reason: "暂时取消车间安排",
  },
  operatorId: "U-MANAGER-A",
});
assert.equal(unassignedAssignment.statusCode, 200);
assert.equal(unassignedAssignment.response.employeeAccountReview.defaultWorkshop, "");
assert.equal(unassignedAssignment.response.employeeAccountReview.defaultMachineId, "");
assert.equal(unassignedAssignment.response.employeeAccountReview.assignmentMode, "unassigned");

const beforeMismatch = structuredClone(assignmentWorkspace.employees);
const mismatchAssignment = await service.updateEmployeeAssignment({
  workspace: assignmentWorkspace,
  employeeId: "EMP-WORKER-001",
  body: { assignmentMode: "fixed_machine", workshop: "1号车间", machineId: "BAG-04" },
  operatorId: "U-MANAGER-A",
});
assert.equal(mismatchAssignment.code, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_WORKSHOP_MISMATCH");
assert.deepEqual(assignmentWorkspace.employees, beforeMismatch);

const failedAssignmentWorkspace = createWorkspace({ saveError: new Error("assignment persistence unavailable") });
const failedAssignmentSnapshot = structuredClone(failedAssignmentWorkspace.employees);
await assert.rejects(
  service.updateEmployeeAssignment({
    workspace: failedAssignmentWorkspace,
    employeeId: "EMP-WORKER-001",
    body: { assignmentMode: "general_worker", workshop: "3号车间" },
    operatorId: "U-MANAGER-A",
  }),
  /assignment persistence unavailable/,
);
assert.deepEqual(failedAssignmentWorkspace.employees, failedAssignmentSnapshot);

{
  const missingMachineWorkspace = createWorkspace({ machines: [] });
  const missingMachine = await service.enableEmployeeAccount({
    workspace: missingMachineWorkspace,
    employeeId: "EMP-WORKER-001",
    operatorId: "U-MANAGER-A",
  });
  assert.equal(missingMachine.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_MACHINE_NOT_CONFIGURED");
  assert.equal(missingMachineWorkspace.employees[0].accountEnabled, false);

  const legacyMachineWorkspace = createWorkspace({
    employees: [{
      ...createEmployee("EMP-WORKER-001", "EMP001", "王师傅"),
      defaultMachineId: buildLegacyImportedMachineId("1号机", "1号车间"),
    }],
  });
  const legacyMachine = await service.enableEmployeeAccount({
    workspace: legacyMachineWorkspace,
    employeeId: "EMP-WORKER-001",
    operatorId: "U-MANAGER-A",
  });
  assert.equal(legacyMachine.statusCode, 200);
  assert.equal(legacyMachineWorkspace.employees[0].defaultMachineId, "BAG-01");
  assert.equal(legacyMachine.response.employeeAccountReview.machineConfigurationStatus, "active");

  const missingId = await service.enableEmployeeAccount({
    workspace: createWorkspace(),
    employeeId: "",
    operatorId: "U-MANAGER-A",
  });
  assert.equal(missingId.code, "MASTER_DATA_EMPLOYEE_ID_REQUIRED");

  const notFound = await service.enableEmployeeAccount({
    workspace: createWorkspace(),
    employeeId: "EMP-MISSING",
    operatorId: "U-MANAGER-A",
  });
  assert.deepEqual(notFound, {
    notFound: true,
    code: "MASTER_DATA_EMPLOYEE_NOT_FOUND",
  });
}

{
  const multiRoleWorkspace = createWorkspace({
    employees: [{
      ...createEmployee("EMP-OWNER-001", "ERP-OWNER-001", "负责人待确认"),
      roleName: "管理",
      roleKeys: ["management"],
      defaultWorkshop: "",
      defaultMachineId: "",
    }],
  });
  const invalidRole = await service.enableEmployeeAccount({
    workspace: multiRoleWorkspace,
    employeeId: "EMP-OWNER-001",
    body: { roleKey: "management", roleKeys: ["management", "unknown-role"] },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(invalidRole.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_ROLES_INVALID");
  assert.equal(multiRoleWorkspace.employees[0].accountEnabled, false);

  const enabled = await service.enableEmployeeAccount({
    workspace: multiRoleWorkspace,
    employeeId: "EMP-OWNER-001",
    body: {
      roleKey: "management",
      roleKeys: ["management", "finance"],
      reviewNote: "负责人保留管理权限并兼任财务对账。",
    },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(enabled.statusCode, 200);
  assert.deepEqual(enabled.response.employeeAccountReview.recommendedRoleKeys, ["management", "finance"]);
  assert.deepEqual(enabled.response.employeeAccountReview.recommendedRoleLabels, ["管理", "财务 / 对账"]);
  assert.deepEqual(enabled.response.user.roles, ["management", "finance"]);
  assert.deepEqual(multiRoleWorkspace.employees[0].reviewedRoleKeys, ["management", "finance"]);
  assert.deepEqual(multiRoleWorkspace.users[0].roles, ["management", "finance"]);
  assert.deepEqual(multiRoleWorkspace.operationLogs[0].after.reviewedRoleKeys, ["management", "finance"]);

  const roleDowngrade = await service.issueEmployeeTemporaryPassword({
    workspace: multiRoleWorkspace,
    employeeId: "EMP-OWNER-001",
    body: { roleKeys: ["management"] },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(roleDowngrade.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_REVIEW_LOCKED");

  const issued = await service.issueEmployeeTemporaryPassword({
    workspace: multiRoleWorkspace,
    employeeId: "EMP-OWNER-001",
    body: { temporaryPassword: "OwnerTemp001" },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(issued.statusCode, 200);
  assert.deepEqual(issued.response.employeeAccountReview.recommendedRoleKeys, ["management", "finance"]);
  assert.deepEqual(issued.response.user.roles, ["management", "finance"], "password issue must preserve all reviewed roles");

  const secondaryWorkshopWorkspace = createWorkspace({
    employees: [{
      ...createEmployee("EMP-MULTI-WORKSHOP", "EMP-MULTI-WORKSHOP", "跨岗员工"),
      roleName: "管理",
      roleKeys: ["management"],
      defaultWorkshop: "",
      defaultMachineId: "",
    }],
  });
  const secondaryWorkshop = await service.enableEmployeeAccount({
    workspace: secondaryWorkshopWorkspace,
    employeeId: "EMP-MULTI-WORKSHOP",
    body: { roleKey: "management", roleKeys: ["management", "workshop"] },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(secondaryWorkshop.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_MACHINE_REQUIRED");
  assert.equal(secondaryWorkshopWorkspace.employees[0].accountEnabled, false);
}

{
  const batchWorkspace = createWorkspace({
    employees: [
      createEmployee("EMP-WORKER-001", "EMP001", "王师傅"),
      createEmployee("EMP-WORKER-002", "EMP002", "李师傅"),
    ],
  });
  const missingConfirmation = await service.enableEmployeeAccounts({
    workspace: batchWorkspace,
    body: { employeeIds: ["EMP-WORKER-001"] },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(missingConfirmation.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_BATCH_CONFIRMATION_REQUIRED");

  const enabledBatch = await service.enableEmployeeAccounts({
    workspace: batchWorkspace,
    body: {
      employeeIds: ["EMP-WORKER-001", "EMP-WORKER-002", "EMP-WORKER-001"],
      confirmed: true,
      reviewNote: "批量核对岗位和默认机台。",
    },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(enabledBatch.statusCode, 200);
  assert.equal(enabledBatch.response.requestedCount, 2);
  assert.equal(enabledBatch.response.enabledCount, 2);
  assert.equal(enabledBatch.response.skippedCount, 0);
  assert.equal(enabledBatch.response.atomic, true);
  assert.equal(enabledBatch.response.operationLogIds.length, 2);
  assert.equal(enabledBatch.response.employeeAccountReviews.every((review) => review.accountEnabled), true);
  assert.equal(batchWorkspace.persistedStates.length, 1, "the full batch must persist once");
  assert.equal(batchWorkspace.employees.every((employee) => employee.accountEnabled), true);
  assert.equal(batchWorkspace.operationLogs.filter((log) => log.action === "master_data_employee_account_enabled").length, 2);

  const replayedBatch = await service.enableEmployeeAccounts({
    workspace: batchWorkspace,
    body: { employeeIds: ["EMP-WORKER-001", "EMP-WORKER-002"], confirmed: true },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(replayedBatch.response.enabledCount, 0);
  assert.equal(replayedBatch.response.skippedCount, 2);
  assert.equal(batchWorkspace.persistedStates.length, 1, "an all-skipped replay must not persist again");
}

{
  const ownerWorkspace = createWorkspace({
    employees: [{
      ...createEmployee("ERP-0001", "ERP-0001", "负责人"),
      roleName: "管理；财务 / 对账",
      defaultWorkshop: "",
      defaultMachineId: "",
    }],
  });
  const ownerReviewBefore = listMasterDataEmployeeAccountReviews(ownerWorkspace)[0];
  assert.equal(ownerReviewBefore.identityConfirmationRequired, true);
  assert.equal(ownerReviewBefore.identityConfirmed, false);
  assert.equal(ownerReviewBefore.accountActivationBlocked, true);
  assert.equal(ownerReviewBefore.status, "identity_confirmation_required");

  const blockedOwner = await service.enableEmployeeAccount({
    workspace: ownerWorkspace,
    employeeId: "ERP-0001",
    body: { reviewNote: "负责人保留管理并兼任财务。" },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(blockedOwner.statusCode, 409);
  assert.equal(blockedOwner.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_IDENTITY_CONFIRMATION_REQUIRED");
  assert.equal(ownerWorkspace.employees[0].accountEnabled, false);

  const missingIdentityConfirmation = await service.confirmEmployeeIdentity({
    workspace: ownerWorkspace,
    employeeId: "ERP-0001",
    body: {
      confirmedEmployeeId: "ERP-0001",
      confirmedName: "负责人",
      reason: "负责人本人确认",
    },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(missingIdentityConfirmation.code, "MASTER_DATA_EMPLOYEE_IDENTITY_CONFIRMATION_REQUIRED");
  const mismatchedName = await service.confirmEmployeeIdentity({
    workspace: ownerWorkspace,
    employeeId: "ERP-0001",
    body: {
      confirmed: true,
      confirmedEmployeeId: "ERP-0001",
      confirmedName: "其他人员",
      reason: "负责人本人确认",
    },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(mismatchedName.code, "MASTER_DATA_EMPLOYEE_IDENTITY_CONFIRMATION_NAME_MISMATCH");
  const identityConfirmation = await service.confirmEmployeeIdentity({
    workspace: ownerWorkspace,
    employeeId: "ERP-0001",
    body: {
      confirmed: true,
      confirmedEmployeeId: "ERP-0001",
      confirmedName: "负责人",
      reason: "负责人本人当面确认该员工号和正式显示名。",
    },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(identityConfirmation.statusCode, 200);
  assert.equal(identityConfirmation.response.employeeAccountReview.identityConfirmed, true);
  assert.equal(identityConfirmation.response.employeeAccountReview.accountActivationBlocked, false);
  assert.equal(ownerWorkspace.operationLogs[0].action, "master_data_employee_identity_confirmed");
  assert.deepEqual(ownerWorkspace.operationLogs[0].after.roleKeys, ["management", "finance"]);
  assert.equal(ownerWorkspace.persistedStates.length, 1);

  const enabledOwner = await service.enableEmployeeAccount({
    workspace: ownerWorkspace,
    employeeId: "ERP-0001",
    body: { reviewNote: "负责人保留管理并兼任财务。" },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(enabledOwner.statusCode, 200);
  assert.equal(enabledOwner.response.user.defaultRole, "management");
  assert.deepEqual(enabledOwner.response.user.roles, ["management", "finance"]);
  assert.deepEqual(
    enabledOwner.response.employeeAccountReview.recommendedRoleKeys,
    ["management", "finance"],
  );
  const issuedOwner = await service.issueEmployeeTemporaryPassword({
    workspace: ownerWorkspace,
    employeeId: "ERP-0001",
    body: { temporaryPassword: "OwnerTemp001" },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(issuedOwner.statusCode, 200);
  assert.deepEqual(ownerWorkspace.users[0].roles, ["management", "finance"]);

  const changedOwner = {
    ...ownerWorkspace.employees[0],
    accountEnabled: false,
    profileStatus: "pending_admin_review",
    userId: "",
    loginName: "",
    name: "负责人新显示名",
  };
  const invalidatedReview = toMasterDataEmployeeAccountReview(
    changedOwner,
    [],
    ownerWorkspace.machines,
    ownerWorkspace.operationLogs,
  );
  assert.equal(invalidatedReview.identityConfirmed, false, "name changes must invalidate the old identity confirmation");
  assert.equal(invalidatedReview.accountActivationBlocked, true);

  const atomicWorkspace = createWorkspace({
    employees: [
      {
        ...createEmployee("ERP-0001", "ERP-0001", "负责人"),
        roleName: "管理；财务 / 对账",
        defaultWorkshop: "",
        defaultMachineId: "",
      },
      createEmployee("EMP-WORKER-ATOMIC", "EMP-WORKER-ATOMIC", "批量员工"),
    ],
  });
  const blockedBatch = await service.enableEmployeeAccounts({
    workspace: atomicWorkspace,
    body: { employeeIds: ["EMP-WORKER-ATOMIC", "ERP-0001"], confirmed: true },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(blockedBatch.statusCode, 409);
  assert.equal(blockedBatch.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_BATCH_VALIDATION_FAILED");
  assert.equal(blockedBatch.details.employeeId, "ERP-0001");
  assert.equal(blockedBatch.details.causeCode, "MASTER_DATA_EMPLOYEE_ACCOUNT_IDENTITY_CONFIRMATION_REQUIRED");
  assert.equal(atomicWorkspace.employees.every((employee) => employee.accountEnabled === false), true);
  assert.equal(atomicWorkspace.users.length, 0);
  assert.equal(atomicWorkspace.persistedStates.length, 0, "identity-blocked batches must not persist partial users");

  const invalidRoleWorkspace = createWorkspace({
    employees: [{
      ...createEmployee("ERP-0099", "ERP-0099", "异常角色"),
      roleName: "管理",
      defaultWorkshop: "",
      defaultMachineId: "",
    }],
  });
  const invalidRole = await service.enableEmployeeAccount({
    workspace: invalidRoleWorkspace,
    employeeId: "ERP-0099",
    body: { roleKeys: ["management", "unknown_role"] },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(invalidRole.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_ROLES_INVALID");
  assert.equal(invalidRoleWorkspace.employees[0].accountEnabled, false);
}

{
  const atomicFailureWorkspace = createWorkspace({
    employees: [
      createEmployee("EMP-WORKER-001", "EMP001", "王师傅"),
      createEmployee("EMP-WORKER-002", "EMP002", "李师傅"),
    ],
  });
  const snapshot = structuredClone({
    employees: atomicFailureWorkspace.employees,
    users: atomicFailureWorkspace.users,
    operationLogs: atomicFailureWorkspace.operationLogs,
  });
  const failedBatch = await service.enableEmployeeAccounts({
    workspace: atomicFailureWorkspace,
    body: { employeeIds: ["EMP-WORKER-001", "EMP-MISSING"], confirmed: true },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(failedBatch.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_BATCH_VALIDATION_FAILED");
  assert.deepEqual(failedBatch.details, {
    employeeId: "EMP-MISSING",
    causeCode: "MASTER_DATA_EMPLOYEE_NOT_FOUND",
  });
  assert.deepEqual(atomicFailureWorkspace.employees, snapshot.employees);
  assert.deepEqual(atomicFailureWorkspace.users, snapshot.users);
  assert.deepEqual(atomicFailureWorkspace.operationLogs, snapshot.operationLogs);
  assert.equal(atomicFailureWorkspace.persistedStates.length, 0);
}

{
  const persistenceFailureWorkspace = createWorkspace({
    employees: [
      createEmployee("EMP-WORKER-001", "EMP001", "王师傅"),
      createEmployee("EMP-WORKER-002", "EMP002", "李师傅"),
    ],
    saveError: new Error("batch persistence unavailable"),
  });
  const snapshot = structuredClone({
    employees: persistenceFailureWorkspace.employees,
    users: persistenceFailureWorkspace.users,
    operationLogs: persistenceFailureWorkspace.operationLogs,
  });
  await assert.rejects(
    service.enableEmployeeAccounts({
      workspace: persistenceFailureWorkspace,
      body: { employeeIds: ["EMP-WORKER-001", "EMP-WORKER-002"], confirmed: true },
      operatorId: "U-MANAGER-A",
    }),
    /batch persistence unavailable/,
  );
  assert.deepEqual(persistenceFailureWorkspace.employees, snapshot.employees);
  assert.deepEqual(persistenceFailureWorkspace.users, snapshot.users);
  assert.deepEqual(persistenceFailureWorkspace.operationLogs, snapshot.operationLogs);
}

const workspace = createWorkspace();
const beforeEnable = structuredClone({
  employees: workspace.employees,
  users: workspace.users,
  operationLogs: workspace.operationLogs,
});
const enableResult = await service.enableEmployeeAccount({
  workspace,
  employeeId: "EMP-WORKER-001",
  body: {
    roleKey: "workshop",
    reviewNote: "管理员已核对岗位和默认机台。",
  },
  operatorId: "U-MANAGER-A",
});
assert.equal(enableResult.statusCode, 200);
assert.equal(enableResult.response.employeeAccountReview.accountEnabled, true);
assert.equal(enableResult.response.user.defaultRole, "workshop");
assert.equal(enableResult.response.user.passwordHash, undefined);
assert.equal(workspace.persistedStates.length, 1);
assert.equal(beforeEnable.employees[0].accountEnabled, false);
assert.equal(workspace.employees[0].accountEnabled, true);
assert.equal(workspace.operationLogs[0].action, "master_data_employee_account_enabled");

const issueResult = await service.issueEmployeeTemporaryPassword({
  workspace,
  employeeId: "EMP-WORKER-001",
  body: {
    temporaryPassword: "TempPassword001",
    issueNote: "发放一次性临时密码。",
  },
  operatorId: "U-MANAGER-A",
});
assert.equal(issueResult.statusCode, 200);
assert.equal(issueResult.response.issuedCredential.temporaryPassword, "TempPassword001");
assert.equal(issueResult.response.issuedCredential.visibleOnce, true);
assert.equal(issueResult.response.user.passwordHash, undefined);
assert.equal(issueResult.response.employeeAccountReview.loginEnabled, true);
assert.equal(issueResult.response.employeeAccountReview.passwordStatus, "temporary_password_issued");
assert.notEqual(workspace.users[0].passwordHash, "TempPassword001");
assert.equal(
  verifyRuntimeUserPassword(workspace.users[0], "TempPassword001", {
    authSecret: workspace.securityPolicy.authSecret,
  }),
  true,
);
const issuedSessionVersion = workspace.users[0].sessionVersion;

const revokeResult = await service.revokeEmployeePassword({
  workspace,
  employeeId: "EMP-WORKER-001",
  body: { revokeNote: "员工账号暂停使用。" },
  operatorId: "U-MANAGER-A",
});
assert.equal(revokeResult.statusCode, 200);
assert.equal(revokeResult.response.revoked, true);
assert.equal(revokeResult.response.employeeAccountReview.accountEnabled, true);
assert.equal(revokeResult.response.employeeAccountReview.loginEnabled, false);
assert.equal(revokeResult.response.employeeAccountReview.passwordStatus, "password_revoked");
assert.equal(workspace.users[0].passwordHash, "");
assert.equal(workspace.users[0].sessionVersion, issuedSessionVersion + 1);
assert.equal(workspace.persistedStates.length, 3);

const restartedWorkspace = createWorkspace({
  users: workspace.users.map((user) => ({ ...user })),
});
const restartedReview = toMasterDataEmployeeAccountReview(
  restartedWorkspace.employees[0],
  restartedWorkspace.users,
);
assert.equal(restartedWorkspace.employees[0].userId, "");
assert.equal(restartedReview.accountEnabled, true);
assert.equal(restartedReview.userId, workspace.users[0].userId);
assert.equal(restartedReview.loginEnabled, false);
assert.equal(restartedReview.passwordStatus, "password_revoked");

const reissuedAfterRestart = await service.issueEmployeeTemporaryPassword({
  workspace: restartedWorkspace,
  employeeId: "EMP-WORKER-001",
  body: { temporaryPassword: "RestartTemp001" },
  operatorId: "U-MANAGER-A",
});
assert.equal(reissuedAfterRestart.statusCode, 200);
assert.equal(reissuedAfterRestart.response.employeeAccountReview.accountEnabled, true);
assert.equal(reissuedAfterRestart.response.issuedCredential.temporaryPassword, "RestartTemp001");

const failedWorkspace = createWorkspace({ saveError: new Error("identity repository unavailable") });
const failedSnapshot = structuredClone({
  employees: failedWorkspace.employees,
  users: failedWorkspace.users,
  operationLogs: failedWorkspace.operationLogs,
});
await assert.rejects(
  service.enableEmployeeAccount({
    workspace: failedWorkspace,
    employeeId: "EMP-WORKER-001",
    operatorId: "U-MANAGER-A",
  }),
  /identity repository unavailable/,
);
assert.deepEqual(failedWorkspace.employees, failedSnapshot.employees);
assert.deepEqual(failedWorkspace.users, failedSnapshot.users);
assert.deepEqual(failedWorkspace.operationLogs, failedSnapshot.operationLogs);

console.log(
  "Master-data employee account command checks passed: enable, password issue/revoke, restart recovery, and failed-persistence rollback are isolated.",
);

function createWorkspace(options = {}) {
  const workspace = {
    employees: options.employees ?? [createEmployee("EMP-WORKER-001", "EMP001", "王师傅")],
    users: options.users ?? [],
    operationLogs: options.operationLogs ?? [],
    machines: options.machines ?? buildDefaultMasterDataMachines(),
    persistedStates: [],
    securityPolicy: { authSecret: "employee-command-check-secret" },
  };
  workspace.runtimeIdentityRepository = {
    async saveState({ workspace: stagedWorkspace, identityEmployeeUpdates = [] }) {
      if (options.saveError) throw options.saveError;
      workspace.persistedStates.push({
        employees: stagedWorkspace.employees.map((item) => ({ ...item })),
        users: stagedWorkspace.users.map((item) => ({ ...item })),
        operationLogs: stagedWorkspace.operationLogs.map((item) => ({ ...item })),
        identityEmployeeUpdates: identityEmployeeUpdates.map((item) => ({ ...item })),
      });
      return { savedUserCount: stagedWorkspace.users.length };
    },
  };
  return workspace;
}

function createEmployee(id, bizNo, name) {
  return {
    id,
    bizNo,
    name,
    roleName: "制袋机长",
    defaultWorkshop: "1号车间",
    defaultMachineId: "BAG-01",
    requestedEnabled: true,
    accountEnabled: false,
    profileStatus: "pending_admin_review",
    userId: "",
    loginName: "",
  };
}
