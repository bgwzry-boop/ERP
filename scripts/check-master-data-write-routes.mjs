import assert from "node:assert/strict";
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
};
for (const [routeName, kind] of [
  ["createMasterDataImportConfirmationPlanRoute", "plan"],
  ["createMasterDataImportExecutionRoute", "execution"],
  ["createMasterDataFailedRowsCorrectionDraftRoute", "correction"],
  ["enableMasterDataEmployeeAccountRoute", "enable"],
  ["updateMasterDataEmployeeAssignmentRoute", "assignment"],
  ["issueMasterDataEmployeeAccountPasswordRoute", "password"],
  ["revokeMasterDataEmployeeAccountPasswordRoute", "revoke"],
]) {
  dependencies[routeName] = async (input) => calls.push({ kind, ...input });
}

await expectHandled("/api/master-data/import-confirmation-plans", "master_data.import.plan.create", "plan", {}, "U-OFFICE-A");
await expectHandled("/api/master-data/import-executions", "master_data.import.execute", "execution", {}, "U-MANAGER-A");
await expectHandled("/api/master-data/import-executions/EX-1/failed-rows/correction-draft", "master_data.import.plan.create", "correction", { executionId: "EX-1" }, "U-OFFICE-A");
await expectHandled("/api/master-data/employee-account-reviews/EMP-1/enable", "master_data.employee_account.review", "enable", { employeeId: "EMP-1" }, "U-MANAGER-A");
await expectHandled("/api/master-data/employee-account-reviews/EMP-1/assignment", "master_data.employee_account.review", "assignment", { employeeId: "EMP-1" }, "U-MANAGER-A");
await expectHandled("/api/master-data/employee-account-reviews/EMP-1/password", "master_data.employee_account.password.issue", "password", { employeeId: "EMP-1" }, "U-MANAGER-A");
await expectHandled("/api/master-data/employee-account-reviews/EMP-1/password/revoke", "master_data.employee_account.password.issue", "revoke", { employeeId: "EMP-1" }, "U-MANAGER-A");

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

console.log("master-data write routes checks passed");

async function expectHandled(pathname, permission, kind, identifiers, fallback) {
  calls.length = 0;
  assert.equal(await handleMasterDataWriteRoutes({ ...dependencies, method: "POST", url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls, [
    { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission },
    { kind: "operator", permissionContext: dependencies.permissionContext, authContext: dependencies.authContext, fallback },
    { kind, response: dependencies.response, workspace: dependencies.workspace, body: dependencies.body, ...identifiers, operatorId: "U-RESOLVED" },
  ]);
}
