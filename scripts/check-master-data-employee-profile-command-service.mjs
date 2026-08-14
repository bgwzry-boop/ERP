import assert from "node:assert/strict";
import { createMasterDataEmployeeAccountCommandService } from "../server/services/masterDataEmployeeAccountCommandService.mjs";

const persisted = [];
const workspace = {
  employees: [
    { id: "ERP-0001", name: "员工一", roleName: "办公室", profileStatus: "active" },
    { id: "ERP-0002", name: "员工二", roleName: "打包", profileStatus: "active", attendanceProvider: "deli", attendanceExternalId: "DL-0002" },
  ],
  users: [],
  machines: [],
  operationLogs: [],
  runtimeIdentityRepository: {
    async saveState(input) {
      persisted.push(input);
      return { saved: true };
    },
  },
};
let operationSequence = 0;
const service = createMasterDataEmployeeAccountCommandService({
  now: () => new Date("2026-08-11T08:00:00Z"),
  buildOperationLog(_workspace, input) {
    operationSequence += 1;
    return { id: `OP-${operationSequence}`, ...input };
  },
});

const saved = await service.updateEmployeeProfile({
  workspace,
  employeeId: "ERP-0001",
  operatorId: "U-MANAGER-A",
  body: {
    birthDate: "1992-05-06",
    hireDate: "2020-03-01",
    baseHourlyWage: 12.5,
    positionAllowanceHourly: 3,
    wageEffectiveFrom: "2026-08-01",
    attendanceProvider: "DELI",
    attendanceExternalId: "DL-0001",
    remark: "正式员工档案",
    reason: "首次维护正式考勤和计薪资料",
  },
});
assert.equal(saved.statusCode, 200);
assert.equal(saved.response.employeeAccountReview.employeeId, "ERP-0001");
assert.equal(saved.response.employeeAccountReview.attendanceMapped, true);
assert.equal(saved.response.employeeAccountReview.baseHourlyWage, 12.5);
assert.equal(workspace.employees[0].attendanceExternalId, "DL-0001");
assert.equal(workspace.employees[0].attendanceProvider, "deli");
assert.equal(workspace.employees[0].attendanceMappingUpdatedBy, "U-MANAGER-A");
assert.equal(persisted.length, 1);
assert.equal(persisted[0].identityEmployeeUpdates[0].id, "ERP-0001");
assert.equal(workspace.operationLogs[0].targetType, "master_data_employee_profile");

const conflict = await service.updateEmployeeProfile({
  workspace,
  employeeId: "ERP-0001",
  operatorId: "U-MANAGER-A",
  body: { attendanceProvider: "deli", attendanceExternalId: "DL-0002" },
});
assert.equal(conflict.code, "MASTER_DATA_EMPLOYEE_ATTENDANCE_MAPPING_CONFLICT");
assert.equal(persisted.length, 1);

const incomplete = await service.updateEmployeeProfile({
  workspace,
  employeeId: "ERP-0001",
  operatorId: "U-MANAGER-A",
  body: { attendanceProvider: "deli", attendanceExternalId: "" },
});
assert.equal(incomplete.code, "MASTER_DATA_EMPLOYEE_ATTENDANCE_MAPPING_INCOMPLETE");

const invalidDate = await service.updateEmployeeProfile({
  workspace,
  employeeId: "ERP-0001",
  operatorId: "U-MANAGER-A",
  body: { hireDate: "2026-02-30" },
});
assert.equal(invalidDate.code, "MASTER_DATA_EMPLOYEE_PROFILE_DATE_INVALID");

const invalidWage = await service.updateEmployeeProfile({
  workspace,
  employeeId: "ERP-0001",
  operatorId: "U-MANAGER-A",
  body: { baseHourlyWage: -1 },
});
assert.equal(invalidWage.code, "MASTER_DATA_EMPLOYEE_PROFILE_WAGE_INVALID");

const birthAfterHire = await service.updateEmployeeProfile({
  workspace,
  employeeId: "ERP-0001",
  operatorId: "U-MANAGER-A",
  body: { birthDate: "2020-03-01", hireDate: "2020-03-01", reason: "核对日期先后关系" },
});
assert.equal(birthAfterHire.code, "MASTER_DATA_EMPLOYEE_PROFILE_DATE_ORDER_INVALID");

const wageBeforeHire = await service.updateEmployeeProfile({
  workspace,
  employeeId: "ERP-0001",
  operatorId: "U-MANAGER-A",
  body: { hireDate: "2020-03-01", wageEffectiveFrom: "2020-02-29", reason: "核对工资生效日期" },
});
assert.equal(wageBeforeHire.code, "MASTER_DATA_EMPLOYEE_WAGE_EFFECTIVE_DATE_INVALID");

const missingReason = await service.updateEmployeeProfile({
  workspace,
  employeeId: "ERP-0001",
  operatorId: "U-MANAGER-A",
  body: { birthDate: "1992-05-06", hireDate: "2020-03-01" },
});
assert.equal(missingReason.code, "MASTER_DATA_EMPLOYEE_PROFILE_REASON_REQUIRED");
assert.equal(persisted.length, 1);

console.log("Master-data employee profile command checks passed.");
