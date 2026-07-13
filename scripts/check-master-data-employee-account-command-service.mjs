import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyRuntimeUserPassword } from "../server/authSeed.mjs";
import {
  buildEmployeeAssignmentOptions,
  createMasterDataEmployeeAccountCommandService,
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

const assignmentOptions = buildEmployeeAssignmentOptions({ machines: [] });
assert.deepEqual(assignmentOptions.workshops, ["1号车间", "2号车间", "3号车间"]);
assert.equal(assignmentOptions.machines.length, 9);
assert.equal(assignmentOptions.machines.find((machine) => machine.machineId === "BAG-04")?.workshop, "2号车间");

const assignmentWorkspace = createWorkspace();
const fixedAssignment = await service.updateEmployeeAssignment({
  workspace: assignmentWorkspace,
  employeeId: "EMP-WORKER-001",
  body: {
    assignmentMode: "fixed_machine",
    workshop: "1号车间",
    machineId: "BAG-02",
    reason: "调整到2号机",
  },
  operatorId: "U-MANAGER-A",
});
assert.equal(fixedAssignment.statusCode, 200);
assert.equal(fixedAssignment.response.employeeAccountReview.defaultWorkshop, "1号车间");
assert.equal(fixedAssignment.response.employeeAccountReview.defaultMachineId, "BAG-02");
assert.equal(fixedAssignment.response.employeeAccountReview.assignmentMode, "fixed_machine");
assert.equal(assignmentWorkspace.operationLogs[0].action, "master_data_employee_assignment_updated");
assert.equal(assignmentWorkspace.operationLogs[0].operatorId, "U-MANAGER-A");

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
    employees: [
      {
        id: "EMP-WORKER-001",
        bizNo: "EMP001",
        name: "王师傅",
        roleName: "制袋机长",
        defaultWorkshop: "制袋车间",
        defaultMachineId: "BAG-01",
        requestedEnabled: true,
        accountEnabled: false,
        profileStatus: "pending_admin_review",
        userId: "",
        loginName: "",
      },
    ],
    users: options.users ?? [],
    operationLogs: [],
    persistedStates: [],
    securityPolicy: { authSecret: "employee-command-check-secret" },
  };
  workspace.runtimeIdentityRepository = {
    async saveState({ workspace: stagedWorkspace }) {
      if (options.saveError) throw options.saveError;
      workspace.persistedStates.push({
        employees: stagedWorkspace.employees.map((item) => ({ ...item })),
        users: stagedWorkspace.users.map((item) => ({ ...item })),
        operationLogs: stagedWorkspace.operationLogs.map((item) => ({ ...item })),
      });
      return { savedUserCount: stagedWorkspace.users.length };
    },
  };
  return workspace;
}
