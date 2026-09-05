import assert from "node:assert/strict";
import { handleMasterDataReadRoutes } from "../server/routes/masterDataReadRoutes.mjs";

const calls = [];
const workspace = {
  masterDataImportReviewRepository: {
    async listConfirmationPlans({ filters }) {
      calls.push({ kind: "plans", filters });
      return [{ planId: "PLAN-1" }];
    },
    async listReviewDrafts({ filters }) {
      calls.push({ kind: "drafts", filters });
      return [{ draftId: "DRAFT-1" }];
    },
    async listImportExecutions({ filters }) {
      calls.push({ kind: "executions", filters });
      return [{ executionId: "EX-1" }];
    },
  },
};
const dependencies = {
  response: {},
  workspace,
  permissionContext: { actionPermissions: [] },
  writeActionPermissions: {
    createMasterDataImportConfirmationPlan: "master_data.import.plan.create",
    executeMasterDataImport: "master_data.import.execute",
    reviewMasterDataEmployeeAccount: "master_data.employee_account.review",
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  sendJson(response, status, body) {
    calls.push({ kind: "json", response, status, body });
  },
  paginate(items, searchParams) {
    return { items, page: Number(searchParams.get("page") ?? 1) };
  },
  listMasterDataEmployeeAccountReviews(sourceWorkspace, filters) {
    calls.push({ kind: "employees", sourceWorkspace, filters });
    return [{ employeeId: "EMP-1" }];
  },
  buildRuntimeEmployeeAccountReadiness({ users }) {
    calls.push({ kind: "employeeReadiness", users });
    return { ready: false, requiredRoleCount: 8, coveredRoleCount: 0, missingRoleCount: 8, formalAccountCount: 0, readyFormalAccountCount: 0, roles: [] };
  },
  buildEmployeeAssignmentOptions(sourceWorkspace) {
    calls.push({ kind: "employeeAssignmentOptions", sourceWorkspace });
    return { workshops: ["1号车间", "2号车间", "3号车间"], machines: [] };
  },
  listMasterDataMachines(sourceWorkspace, filters = {}) {
    calls.push({ kind: "machines", sourceWorkspace, filters });
    return [{ machineId: "BAG-01", workshop: "1号车间", status: "active" }];
  },
  masterDataImportCommandService: {
    async getFailedRowsDownload(input) {
      calls.push({ kind: "failedRows", ...input });
      return { file: { body: "row,error", options: { contentType: "text/csv", fileName: "failed.csv" } } };
    },
  },
  phoneIdentityCommandService: {
    listRegistrationReviews(input) {
      calls.push({ kind: "phoneRegistrations", ...input });
      return [{ userId: "U-PHONE-1" }];
    },
  },
  sendNotFound(response, code) {
    calls.push({ kind: "notFound", response, code });
  },
  sendBusinessError(response, statusCode, code, message) {
    calls.push({ kind: "businessError", response, statusCode, code, message });
  },
  sendFile(response, statusCode, body, options) {
    calls.push({ kind: "file", response, statusCode, body, options });
  },
};

await expectList("/api/master-data/import-confirmation-plans?draftId=DRAFT-1&planId=PLAN-1&status=待确认&page=2", "master_data.import.plan.create", "plans", { draftId: "DRAFT-1", planId: "PLAN-1", status: "待确认" }, { planId: "PLAN-1" });
await expectList("/api/master-data/import-review-drafts?draftId=DRAFT-1&status=待修正&sourceExecutionId=EX-1", "master_data.import.plan.create", "drafts", { draftId: "DRAFT-1", status: "待修正", sourceExecutionId: "EX-1" }, { draftId: "DRAFT-1" });
await expectList("/api/master-data/import-executions?draftId=DRAFT-1&planId=PLAN-1&executionId=EX-1&status=已完成", "master_data.import.execute", "executions", { draftId: "DRAFT-1", planId: "PLAN-1", executionId: "EX-1", status: "已完成" }, { executionId: "EX-1" });
await expectList("/api/master-data/employee-account-reviews?status=待启用&employeeId=EMP-1&keyword=张", "master_data.employee_account.review", "employees", { status: "待启用", employeeId: "EMP-1", keyword: "张" }, { employeeId: "EMP-1" });
await expectList("/api/master-data/machines?keyword=1号&status=active&workshop=1号车间", "master_data.employee_account.review", "machines", { keyword: "1号", status: "active", workshop: "1号车间" }, { machineId: "BAG-01", workshop: "1号车间", status: "active" });
await expectList("/api/master-data/personnel/registration-reviews?status=pending_assignment&keyword=138", "master_data.employee_account.review", "phoneRegistrations", { status: "pending_assignment", keyword: "138" }, { userId: "U-PHONE-1" });

calls.length = 0;
assert.equal(await handleMasterDataReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/master-data/import-executions/EX-1/failed-rows") }), true);
assert.deepEqual(calls, [
  { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission: "master_data.import.plan.create" },
  { kind: "failedRows", workspace, executionId: "EX-1" },
  { kind: "file", response: dependencies.response, statusCode: 200, body: "row,error", options: { contentType: "text/csv", fileName: "failed.csv" } },
]);
await expectFailedRowsFailure(
  { notFound: true, code: "MASTER_DATA_IMPORT_EXECUTION_NOT_FOUND" },
  { kind: "notFound", response: dependencies.response, code: "MASTER_DATA_IMPORT_EXECUTION_NOT_FOUND" },
);
await expectFailedRowsFailure(
  { error: true, statusCode: 409, code: "MASTER_DATA_IMPORT_FAILED_ROWS_NOT_AVAILABLE", message: "no rows" },
  { kind: "businessError", response: dependencies.response, statusCode: 409, code: "MASTER_DATA_IMPORT_FAILED_ROWS_NOT_AVAILABLE", message: "no rows" },
);
calls.length = 0;
assert.equal(
  await handleMasterDataReadRoutes({
    ...dependencies,
    url: new URL("http://erp.test/api/master-data/import-executions"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
assert.equal(await handleMasterDataReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/master-data/import-executions/EX-1") }), false);

console.log("master-data read routes checks passed: lists, failed-row download results, permissions, and thin API wiring are covered");

async function expectFailedRowsFailure(result, responseCall) {
  calls.length = 0;
  assert.equal(
    await handleMasterDataReadRoutes({
      ...dependencies,
      url: new URL("http://erp.test/api/master-data/import-executions/EX-1/failed-rows"),
      masterDataImportCommandService: { getFailedRowsDownload: async () => result },
    }),
    true,
  );
  assert.deepEqual(calls, [
    { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission: "master_data.import.plan.create" },
    responseCall,
  ]);
}

async function expectList(pathname, permission, kind, filters, item) {
  calls.length = 0;
  assert.equal(await handleMasterDataReadRoutes({ ...dependencies, url: new URL(`http://erp.test${pathname}`) }), true);
  const expectedCalls = [
    { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission },
    ["employees", "machines"].includes(kind)
      ? { kind, sourceWorkspace: workspace, filters }
      : kind === "phoneRegistrations"
        ? { kind, workspace, filters }
        : { kind, filters },
  ];
  const body = { items: [item], page: pathname.includes("page=2") ? 2 : 1 };
  if (kind === "employees") {
    expectedCalls.push({ kind: "employeeReadiness", users: workspace.users });
    expectedCalls.push({ kind: "employeeAssignmentOptions", sourceWorkspace: workspace });
    expectedCalls.push({ kind: "machines", sourceWorkspace: workspace, filters: {} });
    body.readiness = { ready: false, requiredRoleCount: 8, coveredRoleCount: 0, missingRoleCount: 8, formalAccountCount: 0, readyFormalAccountCount: 0, roles: [] };
    body.assignmentOptions = { workshops: ["1号车间", "2号车间", "3号车间"], machines: [] };
    body.machineRecords = [{ machineId: "BAG-01", workshop: "1号车间", status: "active" }];
  }
  expectedCalls.push({ kind: "json", response: dependencies.response, status: 200, body });
  assert.deepEqual(calls, expectedCalls);
}
