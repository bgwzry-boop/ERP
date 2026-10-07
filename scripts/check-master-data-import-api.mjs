import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import {
  closeTestServer as closeServer,
  getJson,
  getTestServerBaseUrl,
  listenTestServer as listen,
  postJson,
} from "./helpers/apiIntegrationTestHarness.mjs";
import {
  getEmployeeAccountDepartment,
  getEmployeeAccountRoleLabel,
  normalizeEmployeeAccountRoleKey,
  validateEmployeeAccountIdentity,
  validateEnabledEmployeeAccountReview,
} from "../server/services/runtimeEmployeeAccountPolicy.mjs";
import { buildMasterDataImportTemplateWorkbook } from "../src/domain/masterDataImportTemplate.js";
import { precheckMasterDataImportWorkbook } from "../src/domain/masterDataImportPrecheck.js";
import { createMasterDataImportReviewDraft } from "../src/domain/masterDataImportReviewQueue.js";
import { createLocalSeedAuthState } from "../src/services/officeAuthService.js";
import {
  createOfficeMasterDataImportConfirmationPlan,
  createOfficeMasterDataImportFailedRowsCorrectionDraft,
  createOfficeMasterDataImportExecution,
  createOfficeMasterDataMachine,
  downloadOfficeMasterDataImportFailedRows,
  enableOfficeMasterDataEmployeeAccount,
  enableOfficeMasterDataEmployeeAccounts,
  issueOfficeMasterDataEmployeeAccountPassword,
  listOfficeMasterDataEmployeeAccountReviews,
  listOfficeMasterDataMachines,
  listOfficeMasterDataImportExecutions,
  listOfficeMasterDataImportReviewDrafts,
  revokeOfficeMasterDataEmployeeAccountPassword,
  updateOfficeMasterDataEmployeeAssignment,
  updateOfficeMasterDataMachine,
} from "../src/services/officeMasterDataImportApiClient.js";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";

const checkStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "master-data-import-api");
rmSync(checkStorageRoot, { recursive: true, force: true });
process.env.ERP_LOCAL_STORAGE_DIR = checkStorageRoot;

assert.equal(normalizeEmployeeAccountRoleKey("", "技术运维"), "technical_operations");
assert.equal(getEmployeeAccountRoleLabel("technical_operations"), "技术运维");
assert.equal(getEmployeeAccountDepartment("technical_operations"), "system");
assert.equal(
  validateEmployeeAccountIdentity({}, { employeeId: "EMP-TECH", userId: "U-OFFICE-A", loginName: "tech.ops" })?.code,
  "MASTER_DATA_EMPLOYEE_ACCOUNT_SEED_IDENTITY_CONFLICT",
);
assert.equal(
  validateEmployeeAccountIdentity(
    { users: [{ userId: "U-OTHER", loginName: "Existing.Login", employeeId: "EMP-OTHER" }] },
    { employeeId: "EMP-TECH", userId: "U-TECH-RUNTIME", loginName: "existing.login" },
  )?.code,
  "MASTER_DATA_EMPLOYEE_ACCOUNT_IDENTITY_CONFLICT",
);
assert.equal(
  validateEnabledEmployeeAccountReview(
    { accountEnabled: true, userId: "U-EMP-1", loginName: "emp.1", reviewedRoleKey: "office" },
    { userId: "U-EMP-2", loginName: "emp.1", roleKey: "office" },
  )?.code,
  "MASTER_DATA_EMPLOYEE_ACCOUNT_REVIEW_LOCKED",
);

const generatedAt = "2026-07-03T10:30:00.000Z";
const workbook = buildMasterDataImportTemplateWorkbook({
  templateKey: "all",
  includeFixtureRows: true,
  generatedAt,
  generatedBy: "office-admin",
});
const passedPrecheck = await precheckMasterDataImportWorkbook({
  bytes: workbook,
  fileName: "erp-master-data-import-template-2026-07-03.xlsx",
  checkedAt: generatedAt,
});
const readyDraft = createMasterDataImportReviewDraft({
  precheckResult: passedPrecheck,
  requestedBy: "办公室A",
  createdAt: generatedAt,
});

let server = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true }));
let restartedServer = null;

try {
  await listen(server);
  const baseUrl = getTestServerBaseUrl(server);

  const health = await getJson(baseUrl, "/api/health");
  assert.equal(health.seed.masterDataImportReviewRepository, "local_json");
  assert.equal(health.seed.masterDataImportTransactionRepository, "local_memory");

  const denied = await postJson(
    baseUrl,
    "/api/master-data/import-confirmation-plans",
    { reviewDraft: readyDraft, createdAt: generatedAt },
    { expectedStatus: 403, headers: { "x-erp-user-id": "U-WAREHOUSE-A" } },
  );
  assert.equal(denied.requiredPermission, "master_data.import.plan.create");

  const blockedDraft = createMasterDataImportReviewDraft({
    precheckResult: {
      ...passedPrecheck,
      summary: {
        ...passedPrecheck.summary,
        status: "blocked",
        errorCount: 1,
        warningCount: 0,
        importAllowed: false,
      },
      issues: [
        {
          severity: "error",
          severityLabel: "阻断",
          sheet: "客户档案",
          row: 3,
          field: "客户名称",
          message: "客户名称 不能为空。",
        },
      ],
    },
    requestedBy: "办公室A",
    createdAt: generatedAt,
  });
  const rejected = await postJson(
    baseUrl,
    "/api/master-data/import-confirmation-plans",
    { reviewDraft: blockedDraft, createdAt: generatedAt },
    { expectedStatus: 422, headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  assert.equal(rejected.code, "MASTER_DATA_IMPORT_CONFIRMATION_PLAN_INVALID");

  const clientCreated = await createOfficeMasterDataImportConfirmationPlan(
    {
      authState: createLocalSeedAuthState("U-OFFICE-A"),
      operatorId: "U-OFFICE-A",
      reviewDraft: readyDraft,
      createdAt: generatedAt,
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientCreated.source, "api", JSON.stringify(clientCreated.error));
  const created = {
    confirmationPlan: clientCreated.confirmationPlan,
    operationLogId: clientCreated.operationLogId,
    officialImportEnabled: clientCreated.officialImportEnabled,
  };
  assert(created.confirmationPlan?.planId?.startsWith("MDP-20260703-"));
  assert.equal(created.confirmationPlan.draftId, readyDraft.draftId);
  assert.equal(created.confirmationPlan.officialImportEnabled, false);
  assert.equal(created.confirmationPlan.officialWriteScope, "none");
  assert.equal(created.confirmationPlan.summary.stagedRowCount, 5);
  assert.equal(created.confirmationPlan.employeeRoleCoverage.coverageLabel, "1/8");
  assert.equal(created.confirmationPlan.employeeRoleCoverage.missingRoleCount, 7);
  assert.equal(created.confirmationPlan.stagedRows.length, 5);
  assert.equal(created.officialImportEnabled, false);
  assert(created.operationLogId, "created plan should return an operation log id");
  assert.equal(created.confirmationPlan.operationLogId, created.operationLogId);
  assert(created.confirmationPlan.targetTables.includes("inventory_ledger_entries"));

  const list = await getJson(
    baseUrl,
    `/api/master-data/import-confirmation-plans?draftId=${encodeURIComponent(readyDraft.draftId)}`,
    { headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  assert.equal(list.total, 1);
  assert.equal(list.items[0].planId, created.confirmationPlan.planId);
  assert.equal(list.items[0].employeeRoleCoverage.coverageLabel, "1/8");

  const operationLogs = await getJson(
    baseUrl,
    `/api/operation-logs?targetType=master_data_import_confirmation_plan&targetId=${encodeURIComponent(created.confirmationPlan.planId)}`,
  );
  assert(operationLogs.items.some((log) => log.id === created.operationLogId));

  const executionDenied = await postJson(
    baseUrl,
    "/api/master-data/import-executions",
    { planId: created.confirmationPlan.planId, requestedAt: generatedAt },
    { expectedStatus: 403, headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  assert.equal(executionDenied.requiredPermission, "master_data.import.execute");

  const clientExecution = await createOfficeMasterDataImportExecution(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      planId: created.confirmationPlan.planId,
      requestedAt: generatedAt,
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientExecution.source, "api", JSON.stringify(clientExecution.error));
  assert(clientExecution.importExecution?.executionId?.startsWith("MDE-20260703-"));
  assert.equal(clientExecution.importExecution.planId, created.confirmationPlan.planId);
  assert.equal(clientExecution.importExecution.status, "blocked_official_writer_not_configured");
  assert.equal(clientExecution.importExecution.officialWriteAttempted, false);
  assert.equal(clientExecution.importExecution.officialWriteScope, "none");
  assert.equal(clientExecution.importExecution.summary.stagedRowCount, 5);
  assert.equal(clientExecution.importExecution.summary.writableRowCount, 5);
  assert.equal(clientExecution.importExecution.summary.failedRowCount, 0);
  assert.equal(clientExecution.importExecution.failedRowsDownload.required, false);
  assert(clientExecution.importExecution.importPayload.targetRecords.employees.some((record) => record.name === "王师傅"));
  assert.equal(clientExecution.importExecution.officialWriterKind, "local_transaction");
  assert(clientExecution.importExecution.blockingReasons.some((reason) => reason.includes("officialImportEnabled=false")));
  assert(clientExecution.operationLogId, "created execution should return an operation log id");
  assert.equal(clientExecution.importExecution.operationLogId, clientExecution.operationLogId);

  const strictPlanFallback = await createOfficeMasterDataImportConfirmationPlan(
    {
      authState: createLocalSeedAuthState("U-OFFICE-A"),
      operatorId: "U-OFFICE-A",
      reviewDraft: readyDraft,
      createdAt: generatedAt,
    },
    strictOfflineOptions(),
  );
  assert.equal(strictPlanFallback.blocked, true, "strict import-plan creation must not use the local projection");
  assert.equal(strictPlanFallback.source, "api_error", "strict import-plan creation should report an API error");
  assert.equal(strictPlanFallback.error?.code, "MASTER_DATA_IMPORT_API_UNAVAILABLE");

  const strictExecutionFallback = await createOfficeMasterDataImportExecution(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      planId: created.confirmationPlan.planId,
      confirmationPlan: created.confirmationPlan,
      requestedAt: generatedAt,
    },
    strictOfflineOptions(),
  );
  assert.equal(strictExecutionFallback.blocked, true, "strict import execution must not use the local projection");
  assert.equal(strictExecutionFallback.source, "api_error", "strict import execution should report an API error");
  assert.equal(strictExecutionFallback.error?.code, "MASTER_DATA_IMPORT_API_UNAVAILABLE");

  const executionList = await listOfficeMasterDataImportExecutions(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      filters: { planId: created.confirmationPlan.planId },
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(executionList.source, "api", JSON.stringify(executionList.error));
  assert.equal(executionList.total, 1);
  assert.equal(executionList.items[0].executionId, clientExecution.importExecution.executionId);

  const committedClientExecution = await createOfficeMasterDataImportExecution(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      planId: created.confirmationPlan.planId,
      requestedAt: "2026-07-03T10:31:00.000Z",
      officialImportEnabled: true,
      officialWriterKind: "postgres",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(committedClientExecution.source, "api", JSON.stringify(committedClientExecution.error));
  assert.equal(committedClientExecution.importExecution.status, "committed");
  assert.equal(committedClientExecution.importExecution.statusLabel, "已正式导入");
  assert.equal(committedClientExecution.importExecution.officialImportEnabled, true);
  assert.equal(committedClientExecution.importExecution.officialWriteAttempted, true);
  assert.equal(committedClientExecution.importExecution.officialWriteScope, "master_data_import_v1");
  assert.equal(
    committedClientExecution.importExecution.officialWriterKind,
    "local_transaction",
    "the server must ignore a browser-supplied writer kind and use its configured repository",
  );
  assert.equal(committedClientExecution.importExecution.transactionStarted, true);
  assert.equal(committedClientExecution.importExecution.transactionSummary.repositoryKind, "local_memory");
  assert.equal(
    committedClientExecution.importExecution.summary.transactionRecordCount,
    committedClientExecution.importExecution.summary.targetRecordCount,
  );
  assert.equal(committedClientExecution.importExecution.blockingReasons.length, 0);

  const committedExecutionList = await listOfficeMasterDataImportExecutions(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      filters: { planId: created.confirmationPlan.planId, status: "committed" },
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(committedExecutionList.source, "api", JSON.stringify(committedExecutionList.error));
  assert.equal(committedExecutionList.total, 1);
  assert.equal(committedExecutionList.items[0].executionId, committedClientExecution.importExecution.executionId);

  const committedExecutionLogs = await getJson(
    baseUrl,
    `/api/operation-logs?targetType=master_data_import_execution&targetId=${encodeURIComponent(committedClientExecution.importExecution.executionId)}`,
  );
  assert(committedExecutionLogs.items.some((log) => log.id === committedClientExecution.operationLogId));

  const planAfterExecution = await getJson(
    baseUrl,
    `/api/master-data/import-confirmation-plans?planId=${encodeURIComponent(created.confirmationPlan.planId)}`,
    { headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  assert.equal(planAfterExecution.items[0].lastExecutionId, committedClientExecution.importExecution.executionId);
  assert.equal(planAfterExecution.items[0].lastExecutionStatus, "committed");

  const employeeReviewListDenied = await getJson(
    baseUrl,
    "/api/master-data/employee-account-reviews",
    { expectedStatus: 403, headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  assert.equal(employeeReviewListDenied.requiredPermission, "master_data.employee_account.review");

  const employeeReviewList = await listOfficeMasterDataEmployeeAccountReviews(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(employeeReviewList.source, "api", JSON.stringify(employeeReviewList.error));
  assert(employeeReviewList.total >= 1);
  assert.equal(employeeReviewList.readiness.requiredRoleCount, 8);
  assert.equal(employeeReviewList.readiness.ready, false);
  assert.equal(employeeReviewList.readiness.roles.length, 8);
  assert.equal(employeeReviewList.readiness.roles.some((role) => role.roleKey === "technical_operations"), true);
  assert.equal(employeeReviewList.assignmentOptions.workshops.length >= 3, true);
  assert.equal(employeeReviewList.assignmentOptions.machines.some((machine) => machine.machineId === "BAG-09"), true);
  assert.equal(employeeReviewList.machineRecords.some((machine) => machine.machineId === "PRINT-04"), true);
  const pendingEmployeeReview = employeeReviewList.items.find((item) => item.name === "王师傅");
  assert(pendingEmployeeReview, "formal import should create a pending employee account review");
  assert.equal(JSON.stringify(employeeReviewList.readiness).includes(pendingEmployeeReview.loginName), false);
  assert.equal(pendingEmployeeReview.accountEnabled, false);
  assert.equal(pendingEmployeeReview.status, "pending_admin_review");
  assert.equal(pendingEmployeeReview.recommendedRoleKey, "workshop");
  const pendingD49WorkshopRole = await getD49EmployeeRole(baseUrl, "workshop");
  assert.equal(pendingD49WorkshopRole.ready, false);
  assert.equal(pendingD49WorkshopRole.readyAccountCount, 0);

  const machineListDenied = await getJson(
    baseUrl,
    "/api/master-data/machines",
    { expectedStatus: 403, headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  assert.equal(machineListDenied.requiredPermission, "master_data.employee_account.review");
  const initialMachineList = await listOfficeMasterDataMachines(
    { authState: createLocalSeedAuthState("U-MANAGER-A"), operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(initialMachineList.source, "api", JSON.stringify(initialMachineList.error));
  assert.equal(initialMachineList.total >= 13, true);
  assert.equal(initialMachineList.items.some((machine) => machine.machineId === "BAG-10"), false);
  const createdMachine = await createOfficeMasterDataMachine(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      machineId: "BAG-10",
      name: "10号制袋机",
      machineType: "bag_making",
      workshop: "4号车间",
      status: "active",
      reason: "新增4号车间现场机台",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(createdMachine.source, "api", JSON.stringify(createdMachine.error));
  assert.equal(createdMachine.machine.workshop, "4号车间");
  assert.equal(createdMachine.machine.lastChange.operatorId, "U-MANAGER-A");
  assert.equal(createdMachine.machine.lastChange.reason, "新增4号车间现场机台");
  assert(createdMachine.operationLogId);
  const updatedMachine = await updateOfficeMasterDataMachine(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      ...createdMachine.machine,
      name: "10号制袋机（备用）",
      status: "maintenance",
      reason: "新增后转入现场调试",
      expectedUpdatedAt: createdMachine.machine.updatedAt,
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(updatedMachine.source, "api", JSON.stringify(updatedMachine.error));
  assert.equal(updatedMachine.machine.status, "maintenance");
  assert.equal(updatedMachine.machine.lastChange.reason, "新增后转入现场调试");
  const filteredMachineList = await listOfficeMasterDataMachines(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      filters: { workshop: "4号车间", status: "maintenance" },
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.deepEqual(filteredMachineList.items.map((machine) => machine.machineId), ["BAG-10"]);
  assert.equal(filteredMachineList.items[0].lastChange.operatorId, "U-MANAGER-A");

  const assignmentDenied = await postJson(
    baseUrl,
    `/api/master-data/employee-account-reviews/${encodeURIComponent(pendingEmployeeReview.employeeId)}/assignment`,
    { assignmentMode: "general_worker", workshop: "2号车间" },
    { expectedStatus: 403, headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  assert.equal(assignmentDenied.requiredPermission, "master_data.employee_account.review");

  const unknownWorkshopAssignment = await postJson(
    baseUrl,
    `/api/master-data/employee-account-reviews/${encodeURIComponent(pendingEmployeeReview.employeeId)}/assignment`,
    { assignmentMode: "general_worker", workshop: "不存在车间" },
    { expectedStatus: 409, headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  assert.equal(unknownWorkshopAssignment.code, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_WORKSHOP_NOT_FOUND");

  const missingFixedWorkshopAssignment = await postJson(
    baseUrl,
    `/api/master-data/employee-account-reviews/${encodeURIComponent(pendingEmployeeReview.employeeId)}/assignment`,
    { assignmentMode: "fixed_machine", machineId: "BAG-03" },
    { expectedStatus: 400, headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  assert.equal(missingFixedWorkshopAssignment.code, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_WORKSHOP_REQUIRED");

  const generalWorkerAssignment = await updateOfficeMasterDataEmployeeAssignment(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      employeeId: pendingEmployeeReview.employeeId,
      assignmentMode: "general_worker",
      workshop: "2号车间",
      machineId: "BAG-04",
      reason: "临时安排为2号车间杂工",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(generalWorkerAssignment.source, "api", JSON.stringify(generalWorkerAssignment.error));
  assert.equal(generalWorkerAssignment.employeeAccountReview.assignmentMode, "general_worker");
  assert.equal(generalWorkerAssignment.employeeAccountReview.defaultWorkshop, "2号车间");
  assert.equal(generalWorkerAssignment.employeeAccountReview.defaultMachineId, "");
  assert.equal(generalWorkerAssignment.employeeAccountReview.assignmentUpdatedBy, "U-MANAGER-A");
  assert(generalWorkerAssignment.employeeAccountReview.assignmentUpdatedAt);
  assert.equal(generalWorkerAssignment.employeeAccountReview.assignmentNote, "临时安排为2号车间杂工");
  assert(generalWorkerAssignment.operationLogId);

  const unassignedAssignment = await updateOfficeMasterDataEmployeeAssignment(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      employeeId: pendingEmployeeReview.employeeId,
      assignmentMode: "unassigned",
      workshop: "2号车间",
      machineId: "BAG-04",
      reason: "专项脚本暂时取消分配",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(unassignedAssignment.source, "api", JSON.stringify(unassignedAssignment.error));
  assert.equal(unassignedAssignment.employeeAccountReview.assignmentMode, "unassigned");
  assert.equal(unassignedAssignment.employeeAccountReview.defaultWorkshop, "");
  assert.equal(unassignedAssignment.employeeAccountReview.defaultMachineId, "");
  assert(unassignedAssignment.operationLogId);

  const mismatchedAssignment = await postJson(
    baseUrl,
    `/api/master-data/employee-account-reviews/${encodeURIComponent(pendingEmployeeReview.employeeId)}/assignment`,
    { assignmentMode: "fixed_machine", workshop: "1号车间", machineId: "BAG-04" },
    { expectedStatus: 409, headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  assert.equal(mismatchedAssignment.code, "MASTER_DATA_EMPLOYEE_ASSIGNMENT_WORKSHOP_MISMATCH");

  const fixedMachineAssignment = await updateOfficeMasterDataEmployeeAssignment(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      employeeId: pendingEmployeeReview.employeeId,
      assignmentMode: "fixed_machine",
      workshop: "1号车间",
      machineId: "BAG-03",
      reason: "调整到1号车间3号机",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(fixedMachineAssignment.source, "api", JSON.stringify(fixedMachineAssignment.error));
  assert.equal(fixedMachineAssignment.employeeAccountReview.defaultWorkshop, "1号车间");
  assert.equal(fixedMachineAssignment.employeeAccountReview.defaultMachineId, "BAG-03");
  assert.equal(fixedMachineAssignment.employeeAccountReview.assignmentMode, "fixed_machine");
  assert.equal(fixedMachineAssignment.employeeAccountReview.assignmentUpdatedBy, "U-MANAGER-A");
  assert(fixedMachineAssignment.employeeAccountReview.assignmentUpdatedAt);
  assert.equal(fixedMachineAssignment.employeeAccountReview.assignmentNote, "调整到1号车间3号机");

  const seedIdentityConflict = await postJson(
    baseUrl,
    `/api/master-data/employee-account-reviews/${encodeURIComponent(pendingEmployeeReview.employeeId)}/enable`,
    { userId: "U-OFFICE-A", loginName: "employee.office.conflict", roleKey: "workshop" },
    { expectedStatus: 409, headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  assert.equal(seedIdentityConflict.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_SEED_IDENTITY_CONFLICT");

  const seedLoginConflict = await postJson(
    baseUrl,
    `/api/master-data/employee-account-reviews/${encodeURIComponent(pendingEmployeeReview.employeeId)}/enable`,
    { userId: "U-EMP-UNIQUE-CHECK", loginName: "OFFICE.A", roleKey: "workshop" },
    { expectedStatus: 409, headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  assert.equal(seedLoginConflict.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_SEED_IDENTITY_CONFLICT");

  const employeePasswordBeforeEnable = await postJson(
    baseUrl,
    `/api/master-data/employee-account-reviews/${encodeURIComponent(pendingEmployeeReview.employeeId)}/password`,
    { issueNote: "enabled account should be required" },
    { expectedStatus: 409, headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  assert.equal(employeePasswordBeforeEnable.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_NOT_ENABLED");

  const employeeReviewEnableDenied = await postJson(
    baseUrl,
    `/api/master-data/employee-account-reviews/${encodeURIComponent(pendingEmployeeReview.employeeId)}/enable`,
    { reviewNote: "office should not enable employee accounts" },
    { expectedStatus: 403, headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  assert.equal(employeeReviewEnableDenied.requiredPermission, "master_data.employee_account.review");

  const employeeReviewBatchEnableDenied = await postJson(
    baseUrl,
    "/api/master-data/employee-account-reviews/batch-enable",
    { employeeIds: [pendingEmployeeReview.employeeId], confirmed: true },
    { expectedStatus: 403, headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  assert.equal(employeeReviewBatchEnableDenied.requiredPermission, "master_data.employee_account.review");

  const employeeReviewBatchUnconfirmed = await postJson(
    baseUrl,
    "/api/master-data/employee-account-reviews/batch-enable",
    { employeeIds: [pendingEmployeeReview.employeeId], confirmed: false },
    { expectedStatus: 400, headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  assert.equal(employeeReviewBatchUnconfirmed.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_BATCH_CONFIRMATION_REQUIRED");

  const employeeReviewBatchAtomicFailure = await postJson(
    baseUrl,
    "/api/master-data/employee-account-reviews/batch-enable",
    { employeeIds: [pendingEmployeeReview.employeeId, "EMP-MISSING"], confirmed: true },
    { expectedStatus: 409, headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  assert.equal(employeeReviewBatchAtomicFailure.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_BATCH_VALIDATION_FAILED");
  const pendingAfterBatchFailure = await listOfficeMasterDataEmployeeAccountReviews(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      filters: { employeeId: pendingEmployeeReview.employeeId },
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(pendingAfterBatchFailure.items[0].accountEnabled, false, "a failed batch must not enable an earlier member");

  const enabledEmployeeReview = await enableOfficeMasterDataEmployeeAccount(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      employeeId: pendingEmployeeReview.employeeId,
      roleKey: pendingEmployeeReview.recommendedRoleKey,
      roleKeys: ["workshop", "finance"],
      reviewNote: "专项脚本复核员工岗位、默认机台、主角色和附加角色后启用。",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(enabledEmployeeReview.source, "api", JSON.stringify(enabledEmployeeReview.error));
  assert.equal(enabledEmployeeReview.employeeAccountReview.accountEnabled, true);
  assert.equal(enabledEmployeeReview.employeeAccountReview.status, "account_enabled");
  assert.equal(enabledEmployeeReview.employeeAccountReview.profileStatus, "account_enabled");
  assert(enabledEmployeeReview.employeeAccountReview.loginName);
  assert(enabledEmployeeReview.employeeAccountReview.userId);
  assert.equal(enabledEmployeeReview.user.enabled, true);
  assert.equal(enabledEmployeeReview.user.defaultRole, "workshop");
  assert.deepEqual(enabledEmployeeReview.user.roles, ["workshop", "finance"]);
  assert.deepEqual(enabledEmployeeReview.employeeAccountReview.recommendedRoleKeys, ["workshop", "finance"]);
  assert.deepEqual(enabledEmployeeReview.employeeAccountReview.recommendedRoleLabels, ["车间报工", "财务 / 对账"]);
  assert(enabledEmployeeReview.operationLogId);

  const repeatedEmployeeBatch = await enableOfficeMasterDataEmployeeAccounts(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      employeeIds: [pendingEmployeeReview.employeeId],
      confirmed: true,
      reviewNote: "重复批量请求只应跳过已启用账号。",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(repeatedEmployeeBatch.source, "api", JSON.stringify(repeatedEmployeeBatch.error));
  assert.equal(repeatedEmployeeBatch.atomic, true);
  assert.equal(repeatedEmployeeBatch.enabledCount, 0);
  assert.equal(repeatedEmployeeBatch.skippedCount, 1);

  const enabledIdentityMutation = await postJson(
    baseUrl,
    `/api/master-data/employee-account-reviews/${encodeURIComponent(pendingEmployeeReview.employeeId)}/password`,
    {
      userId: `${enabledEmployeeReview.employeeAccountReview.userId}-CHANGED`,
      loginName: enabledEmployeeReview.employeeAccountReview.loginName,
      roleKey: "workshop",
    },
    { expectedStatus: 409, headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  assert.equal(enabledIdentityMutation.code, "MASTER_DATA_EMPLOYEE_ACCOUNT_REVIEW_LOCKED");

  const employeePasswordIssueDenied = await postJson(
    baseUrl,
    `/api/master-data/employee-account-reviews/${encodeURIComponent(pendingEmployeeReview.employeeId)}/password`,
    { issueNote: "office should not issue employee passwords" },
    { expectedStatus: 403, headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  assert.equal(employeePasswordIssueDenied.requiredPermission, "master_data.employee_account.password.issue");

  const issuedEmployeePassword = await issueOfficeMasterDataEmployeeAccountPassword(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      employeeId: pendingEmployeeReview.employeeId,
      roleKey: pendingEmployeeReview.recommendedRoleKey,
      roleKeys: ["workshop", "finance"],
      loginName: enabledEmployeeReview.employeeAccountReview.loginName,
      userId: enabledEmployeeReview.employeeAccountReview.userId,
      issueNote: "专项脚本发放临时密码。",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(issuedEmployeePassword.source, "api", JSON.stringify(issuedEmployeePassword.error));
  assert(issuedEmployeePassword.issuedCredential?.temporaryPassword);
  assert.equal(issuedEmployeePassword.issuedCredential.loginName, enabledEmployeeReview.employeeAccountReview.loginName);
  assert.equal(issuedEmployeePassword.employeeAccountReview.loginEnabled, true);
  assert(issuedEmployeePassword.employeeAccountReview.passwordIssuedAt);
  assert.equal(issuedEmployeePassword.employeeAccountReview.passwordStatus, "temporary_password_issued");
  assert.equal(issuedEmployeePassword.employeeAccountReview.mustChangePassword, true);
  assert.deepEqual(issuedEmployeePassword.employeeAccountReview.recommendedRoleKeys, ["workshop", "finance"]);
  assert.deepEqual(issuedEmployeePassword.user.roles, ["workshop", "finance"]);
  assert.equal(issuedEmployeePassword.user.passwordHash, undefined);
  assert(issuedEmployeePassword.operationLogId);
  const temporaryPasswordD49WorkshopRole = await getD49EmployeeRole(baseUrl, "workshop");
  assert.equal(temporaryPasswordD49WorkshopRole.ready, false);
  assert.equal(temporaryPasswordD49WorkshopRole.accountCount, 1);
  assert.equal(temporaryPasswordD49WorkshopRole.readyAccountCount, 0);
  const temporaryPasswordD49FinanceRole = await getD49EmployeeRole(baseUrl, "finance");
  assert.equal(temporaryPasswordD49FinanceRole.ready, false);
  assert.equal(temporaryPasswordD49FinanceRole.accountCount, 1);
  assert.equal(temporaryPasswordD49FinanceRole.readyAccountCount, 0);

  const deniedDynamicLogin = await postJson(
    baseUrl,
    "/api/auth/login",
    {
      loginName: issuedEmployeePassword.issuedCredential.loginName,
      password: "wrong-temporary-password",
    },
    { expectedStatus: 401 },
  );
  assert.equal(deniedDynamicLogin.code, "AUTHENTICATION_FAILED");

  const dynamicLogin = await postJson(baseUrl, "/api/auth/login", {
    loginName: issuedEmployeePassword.issuedCredential.loginName,
    password: issuedEmployeePassword.issuedCredential.temporaryPassword,
  });
  assert.equal(dynamicLogin.permissions.user.userId, issuedEmployeePassword.issuedCredential.userId);
  assert.equal(dynamicLogin.permissions.user.loginName, issuedEmployeePassword.issuedCredential.loginName);
  assert.deepEqual(dynamicLogin.permissions.roles, ["workshop", "finance"]);
  assert.equal(dynamicLogin.permissions.user.mustChangePassword, true);
  assert.equal(dynamicLogin.permissions.passwordChangeRequired, true);
  assert.equal(dynamicLogin.permissions.actionPermissions.length, 0);
  assert(!dynamicLogin.permissions.actionPermissions.includes("master_data.employee_account.review"));
  assert(dynamicLogin.session.accessToken.startsWith("erp-runtime-session-v1."));
  assert.equal(dynamicLogin.session.sessionType, "runtime");

  const dynamicSession = await getJson(baseUrl, "/api/auth/me", {
    headers: { authorization: `Bearer ${dynamicLogin.session.accessToken}` },
  });
  assert.equal(dynamicSession.authenticated, true);
  assert.equal(dynamicSession.permissions.user.userId, issuedEmployeePassword.issuedCredential.userId);
  assert.equal(dynamicSession.permissions.user.defaultRole, "workshop");
  assert.equal(dynamicSession.permissions.user.mustChangePassword, true);
  assert.equal(dynamicSession.permissions.actionPermissions.length, 0);

  const dynamicEffectivePermissions = await getJson(baseUrl, "/api/permissions/effective", {
    headers: { authorization: `Bearer ${dynamicLogin.session.accessToken}` },
  });
  assert.equal(dynamicEffectivePermissions.user.userId, issuedEmployeePassword.issuedCredential.userId);
  assert.deepEqual(dynamicEffectivePermissions.roles, ["workshop", "finance"]);
  assert.equal(dynamicEffectivePermissions.passwordChangeRequired, true);
  assert.equal(dynamicEffectivePermissions.actionPermissions.length, 0);

  const tooShortPasswordChange = await postJson(
    baseUrl,
    "/api/auth/change-password",
    {
      currentPassword: issuedEmployeePassword.issuedCredential.temporaryPassword,
      newPassword: "short",
    },
    { expectedStatus: 422, headers: { authorization: `Bearer ${dynamicLogin.session.accessToken}` } },
  );
  assert.equal(tooShortPasswordChange.code, "NEW_PASSWORD_TOO_SHORT");
  assert.equal(tooShortPasswordChange.passwordPolicy.minLength, 10);

  const noLetterPasswordChange = await postJson(
    baseUrl,
    "/api/auth/change-password",
    {
      currentPassword: issuedEmployeePassword.issuedCredential.temporaryPassword,
      newPassword: "12345678901",
    },
    { expectedStatus: 422, headers: { authorization: `Bearer ${dynamicLogin.session.accessToken}` } },
  );
  assert.equal(noLetterPasswordChange.code, "NEW_PASSWORD_REQUIRES_LETTER");

  const noNumberPasswordChange = await postJson(
    baseUrl,
    "/api/auth/change-password",
    {
      currentPassword: issuedEmployeePassword.issuedCredential.temporaryPassword,
      newPassword: "workerpasswordonly",
    },
    { expectedStatus: 422, headers: { authorization: `Bearer ${dynamicLogin.session.accessToken}` } },
  );
  assert.equal(noNumberPasswordChange.code, "NEW_PASSWORD_REQUIRES_NUMBER");

  const containsSpacePasswordChange = await postJson(
    baseUrl,
    "/api/auth/change-password",
    {
      currentPassword: issuedEmployeePassword.issuedCredential.temporaryPassword,
      newPassword: "worker new 001",
    },
    { expectedStatus: 422, headers: { authorization: `Bearer ${dynamicLogin.session.accessToken}` } },
  );
  assert.equal(containsSpacePasswordChange.code, "NEW_PASSWORD_CONTAINS_SPACE");

  const containsIdentifierPasswordChange = await postJson(
    baseUrl,
    "/api/auth/change-password",
    {
      currentPassword: issuedEmployeePassword.issuedCredential.temporaryPassword,
      newPassword: `${issuedEmployeePassword.issuedCredential.loginName}Strong001`,
    },
    { expectedStatus: 422, headers: { authorization: `Bearer ${dynamicLogin.session.accessToken}` } },
  );
  assert.equal(containsIdentifierPasswordChange.code, "NEW_PASSWORD_CONTAINS_ACCOUNT_IDENTIFIER");

  const wrongCurrentPasswordChange = await postJson(
    baseUrl,
    "/api/auth/change-password",
    {
      currentPassword: "wrong-temporary-password",
      newPassword: "worker-new-password-001",
    },
    { expectedStatus: 401, headers: { authorization: `Bearer ${dynamicLogin.session.accessToken}` } },
  );
  assert.equal(wrongCurrentPasswordChange.code, "CURRENT_PASSWORD_INVALID");

  const changedPassword = await postJson(
    baseUrl,
    "/api/auth/change-password",
    {
      currentPassword: issuedEmployeePassword.issuedCredential.temporaryPassword,
      newPassword: "worker-new-password-001",
      changeNote: "专项脚本首次登录改密。",
    },
    { headers: { authorization: `Bearer ${dynamicLogin.session.accessToken}` } },
  );
  assert.equal(changedPassword.changed, true);
  assert.equal(changedPassword.user.passwordHash, undefined);
  assert.equal(changedPassword.user.mustChangePassword, false);
  assert.equal(changedPassword.user.passwordStatus, "active");
  assert.equal(changedPassword.permissions.user.mustChangePassword, false);
  assert.equal(changedPassword.permissions.user.passwordStatus, "active");
  assert(changedPassword.permissions.actionPermissions.includes("production.report.complete"));
  assert(changedPassword.permissions.actionPermissions.includes("statement.payment.record"));
  assert.equal(changedPassword.employeeAccountReview.mustChangePassword, false);
  assert.equal(changedPassword.employeeAccountReview.passwordStatus, "active");
  assert(changedPassword.operationLogId);
  const changedPasswordD49WorkshopRole = await getD49EmployeeRole(baseUrl, "workshop");
  assert.equal(changedPasswordD49WorkshopRole.ready, true);
  assert.equal(changedPasswordD49WorkshopRole.readyAccountCount, 1);
  const changedPasswordD49FinanceRole = await getD49EmployeeRole(baseUrl, "finance");
  assert.equal(changedPasswordD49FinanceRole.ready, true);
  assert.equal(changedPasswordD49FinanceRole.readyAccountCount, 1);

  const sessionAfterPasswordChange = await getJson(baseUrl, "/api/auth/me", {
    headers: { authorization: `Bearer ${dynamicLogin.session.accessToken}` },
  });
  assert.equal(sessionAfterPasswordChange.authenticated, true);
  assert.equal(sessionAfterPasswordChange.permissions.user.mustChangePassword, false);
  assert(sessionAfterPasswordChange.permissions.actionPermissions.includes("production.report.complete"));
  assert(sessionAfterPasswordChange.permissions.actionPermissions.includes("statement.payment.record"));

  const oldTemporaryPasswordLogin = await postJson(
    baseUrl,
    "/api/auth/login",
    {
      loginName: issuedEmployeePassword.issuedCredential.loginName,
      password: issuedEmployeePassword.issuedCredential.temporaryPassword,
    },
    { expectedStatus: 401 },
  );
  assert.equal(oldTemporaryPasswordLogin.code, "AUTHENTICATION_FAILED");

  const changedPasswordLogin = await postJson(baseUrl, "/api/auth/login", {
    loginName: issuedEmployeePassword.issuedCredential.loginName,
    password: "worker-new-password-001",
  });
  assert.equal(changedPasswordLogin.permissions.user.userId, issuedEmployeePassword.issuedCredential.userId);
  assert.equal(changedPasswordLogin.permissions.user.mustChangePassword, false);
  assert(changedPasswordLogin.permissions.actionPermissions.includes("production.report.complete"));
  assert(changedPasswordLogin.permissions.actionPermissions.includes("statement.payment.record"));

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const failedChangedPasswordLogin = await postJson(
      baseUrl,
      "/api/auth/login",
      {
        loginName: issuedEmployeePassword.issuedCredential.loginName,
        password: `wrong-worker-password-${attempt}`,
      },
      { expectedStatus: 401 },
    );
    assert.equal(failedChangedPasswordLogin.code, "AUTHENTICATION_FAILED");
  }
  const lockedChangedPasswordLogin = await postJson(
    baseUrl,
    "/api/auth/login",
    {
      loginName: issuedEmployeePassword.issuedCredential.loginName,
      password: "wrong-worker-password-5",
    },
    { expectedStatus: 423 },
  );
  assert.equal(lockedChangedPasswordLogin.code, "AUTH_ACCOUNT_LOCKED");
  assert(lockedChangedPasswordLogin.lockedUntil);
  assert.equal(lockedChangedPasswordLogin.securityPolicy.maxFailedLoginAttempts, 5);
  const lockedD49WorkshopRole = await getD49EmployeeRole(baseUrl, "workshop");
  assert.equal(lockedD49WorkshopRole.ready, false);
  assert(lockedD49WorkshopRole.blockers.some((blocker) => blocker.code === "account_locked"));
  const correctChangedPasswordWhileLocked = await postJson(
    baseUrl,
    "/api/auth/login",
    {
      loginName: issuedEmployeePassword.issuedCredential.loginName,
      password: "worker-new-password-001",
    },
    { expectedStatus: 423 },
  );
  assert.equal(correctChangedPasswordWhileLocked.code, "AUTH_ACCOUNT_LOCKED");

  const resetEmployeePassword = await issueOfficeMasterDataEmployeeAccountPassword(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      employeeId: pendingEmployeeReview.employeeId,
      loginName: enabledEmployeeReview.employeeAccountReview.loginName,
      userId: enabledEmployeeReview.employeeAccountReview.userId,
      issueNote: "专项脚本管理员重置临时密码。",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(resetEmployeePassword.source, "api", JSON.stringify(resetEmployeePassword.error));
  assert.equal(resetEmployeePassword.employeeAccountReview.passwordStatus, "temporary_password_issued");
  assert.equal(resetEmployeePassword.employeeAccountReview.mustChangePassword, true);
  assert.equal(resetEmployeePassword.employeeAccountReview.failedLoginCount, 0);
  assert.equal(resetEmployeePassword.employeeAccountReview.lockedUntil, "");
  assert.deepEqual(resetEmployeePassword.employeeAccountReview.recommendedRoleKeys, ["workshop", "finance"]);
  assert(resetEmployeePassword.issuedCredential.temporaryPassword);
  const resetD49WorkshopRole = await getD49EmployeeRole(baseUrl, "workshop");
  assert.equal(resetD49WorkshopRole.ready, false);
  assert(resetD49WorkshopRole.blockers.some((blocker) => blocker.code === "password_change_required"));
  assert.equal(resetD49WorkshopRole.blockers.some((blocker) => blocker.code === "account_locked"), false);
  assert.notEqual(
    resetEmployeePassword.issuedCredential.temporaryPassword,
    issuedEmployeePassword.issuedCredential.temporaryPassword,
  );

  const oldChangedPasswordSessionAfterReset = await getJson(baseUrl, "/api/auth/me", {
    headers: { authorization: `Bearer ${changedPasswordLogin.session.accessToken}` },
    expectedStatus: 401,
  });
  assert.equal(oldChangedPasswordSessionAfterReset.code, "AUTH_TOKEN_REVOKED");

  const changedPasswordAfterResetLogin = await postJson(
    baseUrl,
    "/api/auth/login",
    {
      loginName: issuedEmployeePassword.issuedCredential.loginName,
      password: "worker-new-password-001",
    },
    { expectedStatus: 401 },
  );
  assert.equal(changedPasswordAfterResetLogin.code, "AUTHENTICATION_FAILED");

  const resetTemporaryLogin = await postJson(baseUrl, "/api/auth/login", {
    loginName: resetEmployeePassword.issuedCredential.loginName,
    password: resetEmployeePassword.issuedCredential.temporaryPassword,
  });
  assert.equal(resetTemporaryLogin.permissions.user.mustChangePassword, true);
  assert.equal(resetTemporaryLogin.permissions.passwordChangeRequired, true);
  assert.equal(resetTemporaryLogin.permissions.actionPermissions.length, 0);

  const passwordRevokeDenied = await postJson(
    baseUrl,
    `/api/master-data/employee-account-reviews/${encodeURIComponent(pendingEmployeeReview.employeeId)}/password/revoke`,
    { revokeNote: "库房无权撤销员工密码。" },
    { expectedStatus: 403, headers: { "x-erp-user-id": "U-WAREHOUSE-A" } },
  );
  assert.equal(passwordRevokeDenied.requiredPermission, "master_data.employee_account.password.issue");

  const revokedEmployeePassword = await revokeOfficeMasterDataEmployeeAccountPassword(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      employeeId: pendingEmployeeReview.employeeId,
      revokeNote: "专项脚本撤销员工登录密码。",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(revokedEmployeePassword.source, "api", JSON.stringify(revokedEmployeePassword.error));
  assert.equal(revokedEmployeePassword.revoked, true);
  assert.equal(revokedEmployeePassword.employeeAccountReview.loginEnabled, false);
  assert.equal(revokedEmployeePassword.employeeAccountReview.passwordStatus, "password_revoked");
  assert.equal(revokedEmployeePassword.employeeAccountReview.mustChangePassword, false);
  assert(revokedEmployeePassword.sessionsRevokedAfter);
  assert(revokedEmployeePassword.operationLogId);
  const revokedD49WorkshopRole = await getD49EmployeeRole(baseUrl, "workshop");
  assert.equal(revokedD49WorkshopRole.ready, false);
  assert.equal(revokedD49WorkshopRole.readyAccountCount, 0);
  const revokedD49FinanceRole = await getD49EmployeeRole(baseUrl, "finance");
  assert.equal(revokedD49FinanceRole.ready, false);
  assert.equal(revokedD49FinanceRole.readyAccountCount, 0);

  const resetTemporarySessionAfterRevoke = await getJson(baseUrl, "/api/auth/me", {
    headers: { authorization: `Bearer ${resetTemporaryLogin.session.accessToken}` },
    expectedStatus: 401,
  });
  assert.equal(resetTemporarySessionAfterRevoke.code, "AUTH_USER_DISABLED");

  const resetTemporaryAfterRevokeLogin = await postJson(
    baseUrl,
    "/api/auth/login",
    {
      loginName: resetEmployeePassword.issuedCredential.loginName,
      password: resetEmployeePassword.issuedCredential.temporaryPassword,
    },
    { expectedStatus: 401 },
  );
  assert.equal(resetTemporaryAfterRevokeLogin.code, "AUTHENTICATION_FAILED");

  const enabledEmployeeReviewList = await listOfficeMasterDataEmployeeAccountReviews(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      filters: { status: "account_enabled" },
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(enabledEmployeeReviewList.source, "api", JSON.stringify(enabledEmployeeReviewList.error));
  assert(enabledEmployeeReviewList.items.some((item) => item.employeeId === pendingEmployeeReview.employeeId));

  const employeeReviewLogs = await getJson(
    baseUrl,
    `/api/operation-logs?targetType=master_data_employee_account_review&targetId=${encodeURIComponent(pendingEmployeeReview.employeeId)}`,
  );
  assert(employeeReviewLogs.items.some((log) => log.id === enabledEmployeeReview.operationLogId));

  const employeePasswordLogs = await getJson(
    baseUrl,
    `/api/operation-logs?targetType=master_data_employee_account_password&targetId=${encodeURIComponent(pendingEmployeeReview.employeeId)}`,
  );
  assert(employeePasswordLogs.items.some((log) => log.id === issuedEmployeePassword.operationLogId));
  assert(employeePasswordLogs.items.some((log) => log.id === resetEmployeePassword.operationLogId));
  assert(employeePasswordLogs.items.some((log) => log.id === changedPassword.operationLogId));
  assert(employeePasswordLogs.items.some((log) => log.id === revokedEmployeePassword.operationLogId));

  const futureDraft = {
    draftId: "MDI-20260703-FUTURE",
    status: "ready_for_import_confirmation",
    statusLabel: "待确认导入",
    statusTone: "passed",
    canEnterReviewQueue: true,
    fileName: "future-master-data.xlsx",
    requestedBy: "办公室A",
    createdAt: generatedAt,
    summary: {
      dataRowCount: 1,
      sheetCount: 1,
      errorCount: 0,
      warningCount: 0,
      requiresManualReview: false,
    },
    sheets: [
      {
        key: "future_materials",
        label: "未来资料",
        worksheetName: "未来资料",
        status: "ok",
        dataRowCount: 1,
      },
    ],
    stagedRows: [
      {
        sheetKey: "future_materials",
        worksheetName: "未来资料",
        rows: [
          {
            rowNumber: 2,
            values: {
              字段: "暂未支持",
              备注: "用于验证失败行下载",
            },
          },
        ],
      },
    ],
  };
  const futurePlan = await createOfficeMasterDataImportConfirmationPlan(
    {
      authState: createLocalSeedAuthState("U-OFFICE-A"),
      operatorId: "U-OFFICE-A",
      reviewDraft: futureDraft,
      createdAt: "2026-07-03T10:32:00.000Z",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(futurePlan.source, "api", JSON.stringify(futurePlan.error));
  const failedRowsExecution = await createOfficeMasterDataImportExecution(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      planId: futurePlan.confirmationPlan.planId,
      requestedAt: "2026-07-03T10:33:00.000Z",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(failedRowsExecution.source, "api", JSON.stringify(failedRowsExecution.error));
  assert.equal(failedRowsExecution.importExecution.status, "blocked_failed_rows_ready");
  assert.equal(failedRowsExecution.importExecution.failedRowsDownload.required, true);
  assert.equal(failedRowsExecution.importExecution.failedRowsDownload.rowCount, 1);

  const failedRowsDownloadDenied = await getJson(
    baseUrl,
    `/api/master-data/import-executions/${encodeURIComponent(failedRowsExecution.importExecution.executionId)}/failed-rows`,
    { expectedStatus: 403, headers: { "x-erp-user-id": "U-WAREHOUSE-A" } },
  );
  assert.equal(failedRowsDownloadDenied.requiredPermission, "master_data.import.plan.create");

  const failedRowsDownload = await downloadOfficeMasterDataImportFailedRows(
    {
      authState: createLocalSeedAuthState("U-OFFICE-A"),
      operatorId: "U-OFFICE-A",
      executionId: failedRowsExecution.importExecution.executionId,
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(failedRowsDownload.source, "api", JSON.stringify(failedRowsDownload.error));
  assert(failedRowsDownload.fileName.includes(futurePlan.confirmationPlan.planId));
  assert(failedRowsDownload.content.includes("未来资料"));
  assert(failedRowsDownload.content.includes("该 sheet 暂未接入正式导入写入器"));

  const failedRowsCorrectionDraftDenied = await postJson(
    baseUrl,
    `/api/master-data/import-executions/${encodeURIComponent(failedRowsExecution.importExecution.executionId)}/failed-rows/correction-draft`,
    { operatorId: "U-WAREHOUSE-A" },
    { expectedStatus: 403, headers: { "x-erp-user-id": "U-WAREHOUSE-A" } },
  );
  assert.equal(failedRowsCorrectionDraftDenied.requiredPermission, "master_data.import.plan.create");

  const failedRowsCorrectionDraft = await createOfficeMasterDataImportFailedRowsCorrectionDraft(
    {
      authState: createLocalSeedAuthState("U-OFFICE-A"),
      operatorId: "U-OFFICE-A",
      executionId: failedRowsExecution.importExecution.executionId,
      createdAt: "2026-07-03T10:34:00.000Z",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(failedRowsCorrectionDraft.source, "api", JSON.stringify(failedRowsCorrectionDraft.error));
  assert.equal(failedRowsCorrectionDraft.reviewDraft.sourceExecutionId, failedRowsExecution.importExecution.executionId);
  assert.equal(failedRowsCorrectionDraft.reviewDraft.correctionMode, "failed_rows_reimport");
  assert.equal(failedRowsCorrectionDraft.reviewDraft.correctionSummary.failedRowCount, 1);
  assert.equal(failedRowsCorrectionDraft.reviewDraft.correctionSummary.unresolvedRowCount, 1);
  assert.equal(failedRowsCorrectionDraft.reviewDraft.status, "pending_review");
  assert.equal(failedRowsCorrectionDraft.reviewDraft.summary.errorCount, 0);
  assert.equal(failedRowsCorrectionDraft.officialImportEnabled, false);
  assert.equal(failedRowsCorrectionDraft.officialWriteScope, "none");

  const correctedFailedRowsCorrectionDraft = await createOfficeMasterDataImportFailedRowsCorrectionDraft(
    {
      authState: createLocalSeedAuthState("U-OFFICE-A"),
      operatorId: "U-OFFICE-A",
      executionId: failedRowsExecution.importExecution.executionId,
      rowCorrections: [
        {
          sheetKey: "future_materials",
          rowNumber: 2,
          values: {
            字段: "已按失败原因修正",
            备注: "页面内联字段修正",
          },
        },
      ],
      createdAt: "2026-07-03T10:34:30.000Z",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(correctedFailedRowsCorrectionDraft.source, "api", JSON.stringify(correctedFailedRowsCorrectionDraft.error));
  assert.equal(correctedFailedRowsCorrectionDraft.reviewDraft.sourceExecutionId, failedRowsExecution.importExecution.executionId);
  assert.equal(correctedFailedRowsCorrectionDraft.reviewDraft.correctionSummary.failedRowCount, 1);
  assert.equal(correctedFailedRowsCorrectionDraft.reviewDraft.correctionSummary.correctedRowCount, 1);
  assert.equal(correctedFailedRowsCorrectionDraft.reviewDraft.correctionSummary.unresolvedRowCount, 0);
  assert.equal(correctedFailedRowsCorrectionDraft.reviewDraft.status, "ready_for_import_confirmation");
  assert.equal(correctedFailedRowsCorrectionDraft.reviewDraft.summary.requiresManualReview, false);
  assert.equal(correctedFailedRowsCorrectionDraft.reviewDraft.stagedRows[0].rows[0].values["字段"], "已按失败原因修正");

  const failedRowsCorrectionDraftList = await listOfficeMasterDataImportReviewDrafts(
    {
      authState: createLocalSeedAuthState("U-OFFICE-A"),
      operatorId: "U-OFFICE-A",
      filters: { sourceExecutionId: failedRowsExecution.importExecution.executionId },
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(failedRowsCorrectionDraftList.source, "api", JSON.stringify(failedRowsCorrectionDraftList.error));
  assert.equal(failedRowsCorrectionDraftList.total, 2);
  assert(failedRowsCorrectionDraftList.items.some((item) => item.draftId === failedRowsCorrectionDraft.reviewDraft.draftId));
  assert(failedRowsCorrectionDraftList.items.some((item) => item.draftId === correctedFailedRowsCorrectionDraft.reviewDraft.draftId));

  const failedRowsCorrectionPlan = await createOfficeMasterDataImportConfirmationPlan(
    {
      authState: createLocalSeedAuthState("U-OFFICE-A"),
      operatorId: "U-OFFICE-A",
      reviewDraft: failedRowsCorrectionDraft.reviewDraft,
      createdAt: "2026-07-03T10:35:00.000Z",
    },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(failedRowsCorrectionPlan.source, "api", JSON.stringify(failedRowsCorrectionPlan.error));
  assert.equal(failedRowsCorrectionPlan.confirmationPlan.draftId, failedRowsCorrectionDraft.reviewDraft.draftId);
  assert.equal(failedRowsCorrectionPlan.confirmationPlan.status, "manual_review_required");

  const executionLogs = await getJson(
    baseUrl,
    `/api/operation-logs?targetType=master_data_import_execution&targetId=${encodeURIComponent(clientExecution.importExecution.executionId)}`,
  );
  assert(executionLogs.items.some((log) => log.id === clientExecution.operationLogId));

  await closeServer(server);
  server = null;

  restartedServer = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true }));
  await listen(restartedServer);
  const restartedBaseUrl = getTestServerBaseUrl(restartedServer);
  const restartedList = await getJson(
    restartedBaseUrl,
    `/api/master-data/import-confirmation-plans?draftId=${encodeURIComponent(readyDraft.draftId)}`,
    { headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  assert.equal(restartedList.total, 1);
  assert.equal(restartedList.items[0].planId, created.confirmationPlan.planId);
  assert.equal(restartedList.items[0].employeeRoleCoverage.coverageLabel, "1/8");
  assert.equal(restartedList.items[0].employeeRoleCoverage.missingRoleCount, 7);
  assert.equal(restartedList.items[0].lastExecutionId, committedClientExecution.importExecution.executionId);

  const restartedExecutionList = await getJson(
    restartedBaseUrl,
    `/api/master-data/import-executions?planId=${encodeURIComponent(created.confirmationPlan.planId)}`,
    { headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  assert.equal(restartedExecutionList.total, 2);
  assert(restartedExecutionList.items.some((item) => item.executionId === clientExecution.importExecution.executionId));
  assert(restartedExecutionList.items.some((item) => item.executionId === committedClientExecution.importExecution.executionId));

  const restartedEmployeeReviews = await listOfficeMasterDataEmployeeAccountReviews(
    {
      authState: createLocalSeedAuthState("U-MANAGER-A"),
      operatorId: "U-MANAGER-A",
      filters: { employeeId: pendingEmployeeReview.employeeId },
    },
    { apiBaseUrl: `${restartedBaseUrl}/api` },
  );
  assert.equal(restartedEmployeeReviews.source, "api", JSON.stringify(restartedEmployeeReviews.error));
  assert.equal(restartedEmployeeReviews.total, 1);
  assert.equal(restartedEmployeeReviews.items[0].accountEnabled, true);
  assert.equal(
    restartedEmployeeReviews.items[0].userId,
    enabledEmployeeReview.employeeAccountReview.userId,
  );
  assert.equal(restartedEmployeeReviews.items[0].loginEnabled, false);
  assert.equal(restartedEmployeeReviews.items[0].passwordStatus, "password_revoked");
  assert.deepEqual(restartedEmployeeReviews.items[0].recommendedRoleKeys, ["workshop", "finance"]);
  assert.equal(restartedEmployeeReviews.items[0].assignmentUpdatedBy, "U-MANAGER-A");
  assert(restartedEmployeeReviews.items[0].assignmentUpdatedAt);
  assert.equal(restartedEmployeeReviews.items[0].assignmentNote, "调整到1号车间3号机");
  const restartedD49WorkshopRole = await getD49EmployeeRole(restartedBaseUrl, "workshop");
  assert.equal(restartedD49WorkshopRole.ready, false);
  assert.equal(restartedD49WorkshopRole.readyAccountCount, 0);

  const restartedEmployeeReviewLogs = await getJson(
    restartedBaseUrl,
    `/api/operation-logs?targetType=master_data_employee_account_review&targetId=${encodeURIComponent(pendingEmployeeReview.employeeId)}`,
  );
  assert(
    restartedEmployeeReviewLogs.items.some(
      (log) => log.id === enabledEmployeeReview.operationLogId,
    ),
  );
  const restartedEmployeePasswordLogs = await getJson(
    restartedBaseUrl,
    `/api/operation-logs?targetType=master_data_employee_account_password&targetId=${encodeURIComponent(pendingEmployeeReview.employeeId)}`,
  );
  assert(
    restartedEmployeePasswordLogs.items.some(
      (log) => log.id === revokedEmployeePassword.operationLogId,
    ),
  );

  const restartedFailedRowsDownload = await downloadOfficeMasterDataImportFailedRows(
    {
      authState: createLocalSeedAuthState("U-OFFICE-A"),
      operatorId: "U-OFFICE-A",
      executionId: failedRowsExecution.importExecution.executionId,
    },
    { apiBaseUrl: `${restartedBaseUrl}/api` },
  );
  assert.equal(restartedFailedRowsDownload.source, "api", JSON.stringify(restartedFailedRowsDownload.error));
  assert(restartedFailedRowsDownload.fileName.includes(futurePlan.confirmationPlan.planId));
  assert(restartedFailedRowsDownload.content.includes("未来资料"));

  const restartedCorrectionDraftList = await listOfficeMasterDataImportReviewDrafts(
    {
      authState: createLocalSeedAuthState("U-OFFICE-A"),
      operatorId: "U-OFFICE-A",
      filters: { sourceExecutionId: failedRowsExecution.importExecution.executionId },
    },
    { apiBaseUrl: `${restartedBaseUrl}/api` },
  );
  assert.equal(restartedCorrectionDraftList.source, "api", JSON.stringify(restartedCorrectionDraftList.error));
  assert(restartedCorrectionDraftList.items.some((item) => item.draftId === failedRowsCorrectionDraft.reviewDraft.draftId));
  assert(restartedCorrectionDraftList.items.some((item) => item.draftId === correctedFailedRowsCorrectionDraft.reviewDraft.draftId));

  const restartedLogs = await getJson(
    restartedBaseUrl,
    `/api/operation-logs?targetType=master_data_import_confirmation_plan&targetId=${encodeURIComponent(created.confirmationPlan.planId)}`,
  );
  assert(restartedLogs.items.some((log) => log.id === created.operationLogId));

  const restartedExecutionLogs = await getJson(
    restartedBaseUrl,
    `/api/operation-logs?targetType=master_data_import_execution&targetId=${encodeURIComponent(clientExecution.importExecution.executionId)}`,
  );
  assert(restartedExecutionLogs.items.some((log) => log.id === clientExecution.operationLogId));

  const restartedCorrectionDraftLogs = await getJson(
    restartedBaseUrl,
    `/api/operation-logs?targetType=master_data_import_review_draft&targetId=${encodeURIComponent(failedRowsCorrectionDraft.reviewDraft.draftId)}`,
  );
  assert(restartedCorrectionDraftLogs.items.some((log) => log.id === failedRowsCorrectionDraft.operationLogId));
} finally {
  await closeServer(server);
  await closeServer(restartedServer);
}

console.log("master-data import API passed");

function strictOfflineOptions() {
  return {
    serverRequired: true,
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  };
}

async function getD49EmployeeRole(baseUrl, roleKey) {
  const status = await getJson(baseUrl, "/api/system/v1-go-live-status", {
    headers: { "x-erp-user-id": "U-MANAGER-A" },
  });
  const role = status.d49Readiness?.employees?.roles?.find((item) => item.roleKey === roleKey);
  assert(role, `D49 readiness should include ${roleKey}`);
  return role;
}
