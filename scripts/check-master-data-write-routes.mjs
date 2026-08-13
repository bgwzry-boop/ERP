import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleMasterDataWriteRoutes } from "../server/routes/masterDataWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { operatorId: "U-REQUESTED" },
  permissionContext: { actionPermissions: [] },
  authContext: { userId: "U-AUTH" },
  writeActionPermissions: {
    createMasterDataImportConfirmationPlan: "master_data.import.plan.create",
    executeMasterDataImport: "master_data.import.execute",
    reviewMasterDataEmployeeAccount: "master_data.employee_account.review",
    manageEmployeeProfile: "master_data.employee_profile.manage",
    issueMasterDataEmployeeAccountPassword: "master_data.employee_account.password.issue",
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-RESOLVED";
  },
  masterDataImportCommandService: {},
  masterDataEmployeeAccountCommandService: {},
  masterDataMachineCommandService: {},
  phoneIdentityCommandService: {},
  sendCommandResponse(response, result, options) {
    calls.push({ kind: "response", response, result, options });
    return "response-sent";
  },
};
for (const [serviceName, commandName, kind] of [
  ["masterDataImportCommandService", "createConfirmationPlan", "plan"],
  ["masterDataImportCommandService", "createImportExecution", "execution"],
  ["masterDataImportCommandService", "createFailedRowsCorrectionDraft", "correction"],
  ["masterDataEmployeeAccountCommandService", "enableEmployeeAccount", "enable"],
  ["masterDataEmployeeAccountCommandService", "enableEmployeeAccounts", "batch-enable"],
  ["masterDataEmployeeAccountCommandService", "updateEmployeeAssignment", "assignment"],
  ["masterDataEmployeeAccountCommandService", "updateEmployeeProfile", "profile"],
  ["masterDataEmployeeAccountCommandService", "mergeEmployeeIdentity", "merge"],
  ["masterDataEmployeeAccountCommandService", "departEmployeeAccount", "depart"],
  ["masterDataEmployeeAccountCommandService", "confirmEmployeeIdentity", "identity-confirmation"],
  ["masterDataEmployeeAccountCommandService", "issueEmployeeTemporaryPassword", "password"],
  ["masterDataEmployeeAccountCommandService", "revokeEmployeePassword", "revoke"],
  ["masterDataMachineCommandService", "createMachine", "machine-create"],
  ["masterDataMachineCommandService", "updateMachine", "machine-update"],
  ["phoneIdentityCommandService", "assignRegistration", "phone-registration-assign"],
]) {
  dependencies[serviceName][commandName] = async (input) => {
    calls.push({ kind, ...input });
    return { statusCode: 202, response: { command: kind } };
  };
}

const importOptions = { useResultStatusCode: true };
const employeeOptions = { includeErrorDetails: true, useResultStatusCode: true };
await expectHandled("/api/master-data/import-confirmation-plans", "master_data.import.plan.create", "plan", {}, "U-OFFICE-A", importOptions);
await expectHandled("/api/master-data/import-executions", "master_data.import.execute", "execution", {}, "U-MANAGER-A", importOptions);
await expectHandled("/api/master-data/import-executions/EX-1/failed-rows/correction-draft", "master_data.import.plan.create", "correction", { executionId: "EX-1" }, "U-OFFICE-A", importOptions);
await expectHandled("/api/master-data/employee-account-reviews/batch-enable", "master_data.employee_account.review", "batch-enable", {}, "U-MANAGER-A", employeeOptions);
await expectHandled("/api/master-data/employee-account-reviews/EMP-1/enable", "master_data.employee_account.review", "enable", { employeeId: "EMP-1" }, "U-MANAGER-A", employeeOptions);
await expectHandled("/api/master-data/employee-account-reviews/EMP-1/assignment", "master_data.employee_account.review", "assignment", { employeeId: "EMP-1" }, "U-MANAGER-A", employeeOptions);
await expectHandled("/api/master-data/employee-account-reviews/EMP-1/profile", "master_data.employee_profile.manage", "profile", { employeeId: "EMP-1" }, "U-MANAGER-A", employeeOptions);
await expectHandled("/api/master-data/employee-account-reviews/EMP-1/merge", "master_data.employee_account.review", "merge", { employeeId: "EMP-1" }, "U-MANAGER-A", employeeOptions);
await expectHandled("/api/master-data/employee-account-reviews/EMP-1/depart", "master_data.employee_account.review", "depart", { employeeId: "EMP-1" }, "U-MANAGER-A", employeeOptions);
await expectHandled("/api/master-data/employee-account-reviews/EMP-1/identity-confirmation", "master_data.employee_account.review", "identity-confirmation", { employeeId: "EMP-1" }, "U-MANAGER-A", employeeOptions);
await expectHandled("/api/master-data/employee-account-reviews/EMP-1/password", "master_data.employee_account.password.issue", "password", { employeeId: "EMP-1" }, "U-MANAGER-A", employeeOptions);
await expectHandled("/api/master-data/employee-account-reviews/EMP-1/password/revoke", "master_data.employee_account.password.issue", "revoke", { employeeId: "EMP-1" }, "U-MANAGER-A", employeeOptions);
await expectHandled("/api/master-data/machines", "master_data.employee_account.review", "machine-create", {}, "U-MANAGER-A", employeeOptions);
await expectHandled("/api/master-data/machines/BAG-10", "master_data.employee_account.review", "machine-update", { machineId: "BAG-10" }, "U-MANAGER-A", employeeOptions, "PATCH");
await expectHandled("/api/master-data/personnel/registration-reviews/U-PHONE-1/assign", "master_data.employee_account.review", "phone-registration-assign", { userId: "U-PHONE-1" }, "U-MANAGER-A", employeeOptions);

calls.length = 0;
assert.equal(
  await handleMasterDataWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL("http://erp.test/api/master-data/import-executions"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
assert.equal(await handleMasterDataWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/master-data/import-executions") }), false);
assert.equal(await handleMasterDataWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/master-data/employee-account-reviews/EMP-1") }), false);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
for (const removedWrapper of [
  "createMasterDataFailedRowsCorrectionDraftRoute",
  "createMasterDataImportConfirmationPlanRoute",
  "createMasterDataImportExecutionRoute",
  "sendMasterDataImportCommandResult",
  "enableMasterDataEmployeeAccountRoute",
  "enableMasterDataEmployeeAccountsRoute",
  "updateMasterDataEmployeeAssignmentRoute",
  "mergeMasterDataEmployeeIdentityRoute",
  "issueMasterDataEmployeeAccountPasswordRoute",
  "revokeMasterDataEmployeeAccountPasswordRoute",
  "sendMasterDataEmployeeAccountCommandResult",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`(?:async )?function ${removedWrapper}\\b`));
}
assert.match(apiSource, /handleMasterDataWriteRoutes\([\s\S]*masterDataImportCommandService,[\s\S]*masterDataEmployeeAccountCommandService,[\s\S]*masterDataMachineCommandService,[\s\S]*sendCommandResponse,/);

console.log("master-data write routes checks passed: permissions, operators, direct command ownership, dynamic statuses, trusted error details, and thin API wiring are covered");

async function expectHandled(pathname, permission, kind, identifiers, fallback, responseOptions, method = "POST") {
  calls.length = 0;
  assert.equal(await handleMasterDataWriteRoutes({ ...dependencies, method, url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls, [
    { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission },
    { kind: "operator", permissionContext: dependencies.permissionContext, authContext: dependencies.authContext, fallback },
    {
      kind,
      workspace: dependencies.workspace,
      body: dependencies.body,
      ...identifiers,
      operatorId: "U-RESOLVED",
    },
    {
      kind: "response",
      response: dependencies.response,
      result: { statusCode: 202, response: { command: kind } },
      options: responseOptions,
    },
  ]);
}
