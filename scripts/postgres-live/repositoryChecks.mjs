import assert from "node:assert/strict";
import { postgresAssertions } from "./assertions.mjs";
import { buildPostgresIdempotencyRequest } from "../../server/idempotency.mjs";
import { createPostgresPoolClient } from "../../server/postgresPoolClient.mjs";
import { createPostgresAttachmentRepository } from "../../server/attachmentRepository.mjs";
import { createPostgresAttachmentAccessAuditRepository } from "../../server/attachmentAccessAuditRepository.mjs";
import { createPostgresPaymentRecordRepository } from "../../server/paymentRecordRepository.mjs";
import { createPostgresStatementPaymentTransactionRepository } from "../../server/statementPaymentTransactionRepository.mjs";
import { createPostgresStatementSettlementTransactionRepository } from "../../server/statementSettlementTransactionRepository.mjs";
import { createPostgresStatementSendTransactionRepository } from "../../server/statementSendTransactionRepository.mjs";
import { createPostgresStatementExportRepository } from "../../server/statementExportRepository.mjs";
import { createPostgresOrderConfirmationTransactionRepository } from "../../server/orderConfirmationTransactionRepository.mjs";
import { createPostgresFulfillmentActionTransactionRepository } from "../../server/fulfillmentActionTransactionRepository.mjs";
import { createPostgresDriverDeviceFieldTestRepository } from "../../server/driverDeviceFieldTestRepository.mjs";
import { createPostgresDriverDeliveryTaskReadRepository } from "../../server/driverDeliveryTaskReadRepository.mjs";
import { createPostgresInventoryLedgerReadRepository } from "../../server/inventoryLedgerReadRepository.mjs";
import { createPostgresInventoryReservationReleaseTransactionRepository } from "../../server/inventoryReservationReleaseTransactionRepository.mjs";
import { createPostgresOrderLineVoidTransactionRepository } from "../../server/orderLineVoidTransactionRepository.mjs";
import { createPostgresOrderLineQuantityAdjustmentTransactionRepository } from "../../server/orderLineQuantityAdjustmentTransactionRepository.mjs";
import { createPostgresProductionPackingReadRepository } from "../../server/productionPackingReadRepository.mjs";
import { createPostgresProductionPackingTransactionRepository } from "../../server/productionPackingTransactionRepository.mjs";
import { createPostgresProductionScheduleRecordRepository } from "../../server/productionScheduleRecordRepository.mjs";
import { createPostgresPrintBatchRepository } from "../../server/printBatchRepository.mjs";
import { createPostgresPrintDeviceRepository } from "../../server/printDeviceRepository.mjs";
import { createPostgresPrintJobRepository } from "../../server/printJobRepository.mjs";
import { createPostgresTodoActionRepository } from "../../server/todoActionRepository.mjs";
import { createPostgresMasterDataImportReviewRepository } from "../../server/masterDataImportReviewRepository.mjs";
import { createPostgresMasterDataImportTransactionRepository } from "../../server/masterDataImportTransactionRepository.mjs";
import { createPostgresCoreWorkspaceReadRepository } from "../../server/coreWorkspaceReadRepository.mjs";
import { createPostgresRuntimeIdentityRepository } from "../../server/runtimeIdentityRepository.mjs";
import { createPostgresAttendancePayrollRepository } from "../../server/attendancePayrollRepository.mjs";
import { createPostgresDeliAttendanceGatewayRepository } from "../../server/deliAttendanceGatewayRepository.mjs";
import { buildRuntimeEmployeeAccountReadiness } from "../../server/services/runtimeEmployeeAccountReadiness.mjs";
import { buildOperationLog, buildPaymentRecord, buildSendRecord, buildStatement, buildStatementDecisionRecord, buildStatementExportFile, buildStatementExportLines, buildStatementWriteOffRecord, buildTodo, buildVarianceRecord } from "../helpers/postgresLiveStatementFixtures.mjs";
import { checkPostgresLiveAttachmentRepositoryScenario } from "../helpers/postgresLiveAttachmentRepositoryScenario.mjs";
import { buildMachineCapacityBaselineRecord, buildPackageRecord, buildPackingTaskRecord, buildProductionInventoryLedgerRecord, buildProductionOperationLog, buildProductionOrderLineRecord, buildProductionReservationRecord, buildProductionScheduleDecisionRecord, buildProductionScheduleOperationLog, buildProductionScheduleRecord, buildProductionTaskRecord, buildWorkshopReportRecord } from "../helpers/postgresLiveProductionFixtures.mjs";
import { buildPrintBatchOperationLog, buildPrintBatchRecord, buildPrintDeviceOperationLog, buildPrintDeviceRecord, buildPrintJobOperationLog, buildPrintJobRecord } from "../helpers/postgresLivePrintFixtures.mjs";
import { buildFulfillmentActionRecord, buildFulfillmentExceptionRecord, buildFulfillmentOperationLog, buildFulfillmentPrintRecord, buildFulfillmentTodo } from "../helpers/postgresLiveFulfillmentFixtures.mjs";
import { buildLiveMasterDataImportConfirmationPlan, buildLiveMasterDataImportExecution, buildLiveMasterDataImportOperationLog, buildLiveMasterDataImportReviewDraft, buildLiveMasterDataImportReviewExecution, buildLiveMasterDataImportReviewExecutionOperationLog, buildLiveMasterDataImportReviewPlanOperationLog } from "../helpers/postgresLiveMasterDataFixtures.mjs";
import { buildConfirmedFulfillments, buildConfirmedInventoryLedgerEntries, buildConfirmedInventoryReservations, buildConfirmedOrder, buildConfirmedOrderDraft, buildConfirmedOrderLines, buildConfirmedPriceSnapshots, buildConfirmedTodos } from "../helpers/postgresLiveOrderConfirmationFixtures.mjs";
import { buildLiveRuntimeUser } from "../helpers/postgresLiveRuntimeIdentityFixtures.mjs";
import { checkPostgresLiveAttendancePayrollScenario } from "../helpers/postgresLiveAttendancePayrollScenario.mjs";
import pg from "pg";

const { Pool } = pg;

export async function checkPostgresIdempotencyAndConcurrency(runtime) {
  const { resolveLiveDatabaseUrl, runPsql } = runtime;
  const pool = new Pool({
    connectionString: resolveLiveDatabaseUrl(),
    max: 4,
    connectionTimeoutMillis: 5_000,
  });
  const client = createPostgresPoolClient({ pool });
  try {
    const firstRequest = buildPostgresIdempotencyRequest({
      scope: "test.live.idempotency",
      idempotencyKey: "idem-postgres-live-001",
      payload: { todoId: "T-LIVE-IDEMPOTENCY-001", summary: "first request" },
      targetType: "todo",
      targetId: "T-LIVE-IDEMPOTENCY-001",
      resourceLocks: ["todo:T-LIVE-IDEMPOTENCY-001"],
      query: buildLiveIdempotencyTodoQuery("T-LIVE-IDEMPOTENCY-001", "first request"),
    });
    const first = await client.idempotentTransactionJson(firstRequest);
    const replay = await client.idempotentTransactionJson(firstRequest);
    assert.deepEqual(replay, first, "same-key same-payload requests must replay the stored response");
    await assert.rejects(
      () =>
        client.idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            ...firstRequest,
            payload: { todoId: "T-LIVE-IDEMPOTENCY-001", summary: "different request" },
            query: buildLiveIdempotencyTodoQuery("T-LIVE-IDEMPOTENCY-001", "different request"),
          }),
        ),
      (error) => error?.statusCode === 409 && error?.code === "IDEMPOTENCY_KEY_REUSED",
    );

    const concurrentRequest = buildPostgresIdempotencyRequest({
      scope: "test.live.concurrency",
      idempotencyKey: "idem-postgres-live-concurrent-001",
      payload: { todoId: "T-LIVE-IDEMPOTENCY-002", summary: "concurrent request" },
      targetType: "todo",
      targetId: "T-LIVE-IDEMPOTENCY-002",
      resourceLocks: ["todo:T-LIVE-IDEMPOTENCY-002"],
      query: buildLiveIdempotencyTodoQuery("T-LIVE-IDEMPOTENCY-002", "concurrent request", true),
    });
    const [concurrentLeft, concurrentRight] = await Promise.all([
      client.idempotentTransactionJson(concurrentRequest),
      client.idempotentTransactionJson(concurrentRequest),
    ]);
    assert.deepEqual(concurrentRight, concurrentLeft, "concurrent retries must converge on one stored response");
  } finally {
    await pool.end();
  }

  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM todos WHERE id IN ('T-LIVE-IDEMPOTENCY-001', 'T-LIVE-IDEMPOTENCY-002');",
        { capture: true },
      ).trim(),
    ),
    2,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM operation_idempotency_keys WHERE scope IN ('test.live.idempotency', 'test.live.concurrency');",
        { capture: true },
      ).trim(),
    ),
    2,
  );
}

function buildLiveIdempotencyTodoQuery(todoId, summary, delay = false) {
  const delayCte = delay ? "delay AS MATERIALIZED (SELECT pg_sleep(0.15))," : "";
  const delayFrom = delay ? "FROM delay" : "";
  return {
    text: `
BEGIN;
WITH ${delayCte}
inserted_todo AS (
  INSERT INTO todos (id, biz_no, type, ref_type, ref_id, priority, status, summary, created_at, updated_at)
  SELECT '${todoId}', '${todoId}', '幂等验收', 'system', '${todoId}', '普通', '未处理', '${summary}', now(), now()
  ${delayFrom}
  RETURNING id
)
SELECT json_build_object(
  'todoId', (SELECT id FROM inserted_todo),
  'summary', '${summary}'
) AS result;
COMMIT;
`.trim(),
    values: [],
  };
}

export async function checkPostgresRepositories(runtime) {
  const { resolveLiveDatabaseUrl, queryJson, runPsql, liveRuntimeAuthSecret, liveRuntimeUserId, liveRuntimeLoginName, liveRuntimePassword, liveOfficeRuntimeUserId, liveOfficeRuntimeLoginName, liveOfficeRuntimePassword, liveManagerRuntimeUserId, liveManagerRuntimeLoginName, liveManagerRuntimePassword } = runtime;
  runtime.attachmentPool = new Pool({ connectionString: resolveLiveDatabaseUrl(), max: 4, connectionTimeoutMillis: 5_000 });
  const attachmentRepository = createPostgresAttachmentRepository({
    postgresClient: createPostgresPoolClient({ pool: runtime.attachmentPool }),
  });
  const auditRepository = createPostgresAttachmentAccessAuditRepository({ queryJson });
  const statementPostgresClient = createPostgresPoolClient({ pool: runtime.attachmentPool });
  const paymentRepository = createPostgresPaymentRecordRepository({ queryJson });
  const paymentTransactionRepository = createPostgresStatementPaymentTransactionRepository({ queryJson });
  const settlementTransactionRepository = createPostgresStatementSettlementTransactionRepository({ queryJson });
  const sendTransactionRepository = createPostgresStatementSendTransactionRepository({ postgresClient: statementPostgresClient });
  const exportRepository = createPostgresStatementExportRepository({ postgresClient: statementPostgresClient });
  const orderConfirmationRepository = createPostgresOrderConfirmationTransactionRepository({
    postgresClient: statementPostgresClient,
  });
  const fulfillmentActionRepository = createPostgresFulfillmentActionTransactionRepository({ queryJson });
  const driverDeviceFieldTestRepository = createPostgresDriverDeviceFieldTestRepository({ queryJson });
  const driverDeliveryTaskReadRepository = createPostgresDriverDeliveryTaskReadRepository({ queryJson });
  const inventoryLedgerReadRepository = createPostgresInventoryLedgerReadRepository({ queryJson });
  const inventoryReservationReleaseRepository = createPostgresInventoryReservationReleaseTransactionRepository({ queryJson });
  const orderLineVoidRepository = createPostgresOrderLineVoidTransactionRepository({ queryJson });
  const orderLineQuantityAdjustmentRepository = createPostgresOrderLineQuantityAdjustmentTransactionRepository({ queryJson });
  const productionPackingRepository = createPostgresProductionPackingTransactionRepository({ queryJson });
  const todoFulfillmentRepairRepository = createPostgresTodoActionRepository({ postgresClient: statementPostgresClient });
  const productionPackingReadRepository = createPostgresProductionPackingReadRepository({ queryJson });
  const productionScheduleRecordRepository = createPostgresProductionScheduleRecordRepository({ queryJson });
  const printBatchRepository = createPostgresPrintBatchRepository({
    postgresClient: createPostgresPoolClient({ pool: runtime.attachmentPool }),
  });
  const printDeviceRepository = createPostgresPrintDeviceRepository({ queryJson });
  const printJobRepository = createPostgresPrintJobRepository({ queryJson });
  const masterDataImportReviewRepository = createPostgresMasterDataImportReviewRepository({ queryJson });
  const masterDataImportTransactionRepository = createPostgresMasterDataImportTransactionRepository({ queryJson });
  const coreWorkspaceReadRepository = createPostgresCoreWorkspaceReadRepository({ queryJson });
  const runtimeIdentityRepository = createPostgresRuntimeIdentityRepository({ postgresClient: statementPostgresClient });
  const attendancePayrollRepository = createPostgresAttendancePayrollRepository({
    postgresClient: statementPostgresClient,
  });
  const deliAttendanceGatewayRepository = createPostgresDeliAttendanceGatewayRepository({
    postgresClient: statementPostgresClient,
  });
  const runtimeIdentitySave = await runtimeIdentityRepository.saveState({
    workspace: {
      users: [
        buildLiveRuntimeUser({
          userId: liveRuntimeUserId,
          loginName: liveRuntimeLoginName,
          password: liveRuntimePassword,
          authSecret: liveRuntimeAuthSecret,
          displayName: "PostgreSQL 正式技术账号",
          role: "technical_operations",
          department: "system",
          employeeId: "EMP-LIVE-IDENTITY-001",
        }),
        buildLiveRuntimeUser({
          userId: liveOfficeRuntimeUserId,
          loginName: liveOfficeRuntimeLoginName,
          password: liveOfficeRuntimePassword,
          authSecret: liveRuntimeAuthSecret,
          displayName: "PostgreSQL 正式办公室账号",
          role: "office",
          department: "office",
          employeeId: "EMP-LIVE-OFFICE-001",
        }),
        buildLiveRuntimeUser({
          userId: liveManagerRuntimeUserId,
          loginName: liveManagerRuntimeLoginName,
          password: liveManagerRuntimePassword,
          authSecret: liveRuntimeAuthSecret,
          displayName: "PostgreSQL 正式管理账号",
          role: "management",
          department: "management",
          employeeId: "EMP-LIVE-MANAGER-001",
        }),
      ],
      revokedSeedSessions: [],
    },
  });
  assert.equal(runtimeIdentitySave.savedUserCount, 3);
  const runtimeIdentityState = await runtimeIdentityRepository.loadState();
  const persistedRuntimeUser = runtimeIdentityState.users.find((user) => user.userId === liveRuntimeUserId);
  assert(persistedRuntimeUser, "runtime employee should persist in PostgreSQL users");
  postgresAssertions.assertPersistedRuntimeUser({ persistedRuntimeUser, liveRuntimePassword });
  const persistedRuntimeReadiness = buildRuntimeEmployeeAccountReadiness({
    users: runtimeIdentityState.users,
    nowMs: Date.parse("2026-07-13T00:00:00.000Z"),
  });
  const persistedTechnicalRole = persistedRuntimeReadiness.roles.find((role) => role.roleKey === "technical_operations");
  assert.equal(persistedTechnicalRole?.ready, true);
  assert.equal(persistedTechnicalRole?.readyAccountCount, 1);

  await checkPostgresLiveAttendancePayrollScenario({
    repository: attendancePayrollRepository,
    runPsql,
  });

  assert.equal(await deliAttendanceGatewayRepository.readCursor(), 0);
  const deliGatewayPunch = {
    externalPunchId: "DELI-GATEWAY-LIVE-001",
    externalEmployeeId: "ERP-0001",
    punchedAt: "2026-08-10T00:01:00.000Z",
    localWorkDate: "2026-08-10",
    eventType: "fa",
    raw: {
      id: "DELI-GATEWAY-LIVE-001",
      ext_id: "ERP-0001",
      check_type: "fa",
      check_time: Date.parse("2026-08-10T00:01:00.000Z") / 1000,
      check_data: "must-not-persist",
    },
  };
  assert.deepEqual(
    await deliAttendanceGatewayRepository.saveBatch({ expectedNextId: 0, nextId: 7, records: [deliGatewayPunch] }),
    { nextId: 7, acceptedRecordCount: 1, insertedRecordCount: 1 },
  );
  assert.equal(await deliAttendanceGatewayRepository.readCursor(), 7);
  assert.deepEqual(
    await deliAttendanceGatewayRepository.saveBatch({ expectedNextId: 7, nextId: 8, records: [deliGatewayPunch] }),
    { nextId: 8, acceptedRecordCount: 1, insertedRecordCount: 0 },
  );
  const cachedDeliPunches = await deliAttendanceGatewayRepository.queryPunches({
    rangeStart: "2026-08-10T00:00:00.000Z",
    rangeEnd: "2026-08-11T00:00:00.000Z",
  });
  assert.equal(cachedDeliPunches.length, 1);
  assert.equal(cachedDeliPunches[0].externalPunchId, "DELI-GATEWAY-LIVE-001");
  assert.equal(JSON.stringify(cachedDeliPunches).includes("must-not-persist"), false);
  assert.throws(
    () => runPsql("UPDATE deli_attendance_gateway_punches SET event_type = 'fp' WHERE external_punch_id = 'DELI-GATEWAY-LIVE-001';"),
    /immutable/i,
  );

  await checkPostgresLiveAttachmentRepositoryScenario({
    attachmentRepository,
    auditRepository,
    runPsql,
  });

  const paymentWorkspace = { paymentRecords: [] };
  const paymentRecord = await paymentRepository.createPaymentRecord({
    workspace: paymentWorkspace,
    paymentRecord: buildPaymentRecord({
      paymentRecordId: "PAY-LIVE-REPO-001",
      statementId: "ST-LIVE-REPO-001",
      customerId: "C-LIVE-REPO",
      operatorId: "U-FINANCE-A",
    }),
  });
  assert.equal(paymentRecord.paymentRecordId, "PAY-LIVE-REPO-001");
  assert.equal(paymentRecord.attachmentIds[0], "ATT-PAY-LIVE-001");
  const paymentRecords = await paymentRepository.listPaymentRecords({ filters: { statementId: "ST-LIVE-REPO-001" } });
  assert.equal(paymentRecords.length, 1);
  assert.equal(paymentRecords[0].customerId, "C-LIVE-REPO");

  const masterDataWorkspace = { operationLogs: [] };
  const masterDataExecution = buildLiveMasterDataImportExecution();
  const masterDataImport = await masterDataImportTransactionRepository.applyImportExecution({
    workspace: masterDataWorkspace,
    importExecution: masterDataExecution,
    operationLog: buildLiveMasterDataImportOperationLog(masterDataExecution.executionId),
  });
  assert.equal(masterDataImport.importExecution.status, "committed");
  assert.equal(masterDataImport.importExecution.transactionSummary.repositoryKind, "postgres");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM customers WHERE id = 'C-MD-LIVE-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM price_table_items WHERE id = 'PTI-MD-LIVE-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM inventory_ledger_entries WHERE id = 'LEDGER-MD-LIVE-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM employees WHERE id = 'EMP-MD-LIVE-001' AND account_enabled = false AND profile_status = 'pending_admin_review';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ux_employees_id_case_insensitive';", { capture: true }).trim()), 1);
  assert.throws(
    () => runPsql("INSERT INTO employees (id, biz_no, name, role_name) VALUES ('emp-md-live-001', 'emp-md-live-001', '重复员工', '办公室');"),
    /ux_employees_id_case_insensitive/,
  );
  assert.throws(
    () => runPsql("INSERT INTO employees (id, biz_no, name, role_name) VALUES ('员工 001', 'invalid-employee', '非法编号员工', '办公室');"),
    /employees_id_format_check/,
  );
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM machines WHERE id = 'MACH-MD-LIVE-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-MD-LIVE-IMPORT-001';", { capture: true }).trim()), 1);

  const restartedMasterDataSnapshot = await coreWorkspaceReadRepository.loadState();
  postgresAssertions.assertRestartedMasterDataSnapshot({ restartedMasterDataSnapshot });

  const masterDataReviewWorkspace = { operationLogs: [] };
  const masterDataReviewDraft = buildLiveMasterDataImportReviewDraft();
  const masterDataReviewPlan = buildLiveMasterDataImportConfirmationPlan(masterDataReviewDraft);
  const masterDataReviewPlanLog = buildLiveMasterDataImportReviewPlanOperationLog(masterDataReviewPlan.planId);
  const savedMasterDataReviewPlan = await masterDataImportReviewRepository.saveConfirmationPlan({
    workspace: masterDataReviewWorkspace,
    reviewDraft: masterDataReviewDraft,
    confirmationPlan: masterDataReviewPlan,
    operationLog: masterDataReviewPlanLog,
  });
  assert.equal(savedMasterDataReviewPlan.confirmationPlan.planId, masterDataReviewPlan.planId);
  assert.equal(savedMasterDataReviewPlan.confirmationPlan.operationLogId, masterDataReviewPlanLog.id);
  assert.equal(savedMasterDataReviewPlan.confirmationPlan.employeeRoleCoverage.coverageLabel, "1/8");
  assert.equal((await masterDataImportReviewRepository.listConfirmationPlans({ filters: { draftId: masterDataReviewDraft.draftId } })).length, 1);

  const masterDataReviewExecution = buildLiveMasterDataImportReviewExecution(masterDataReviewPlan);
  const masterDataReviewExecutionLog = buildLiveMasterDataImportReviewExecutionOperationLog(masterDataReviewExecution.executionId);
  const savedMasterDataReviewExecution = await masterDataImportReviewRepository.saveImportExecution({
    workspace: masterDataReviewWorkspace,
    confirmationPlan: savedMasterDataReviewPlan.confirmationPlan,
    importExecution: masterDataReviewExecution,
    operationLog: masterDataReviewExecutionLog,
  });
  assert.equal(savedMasterDataReviewExecution.importExecution.executionId, masterDataReviewExecution.executionId);
  assert.equal(savedMasterDataReviewExecution.confirmationPlan.lastExecutionId, masterDataReviewExecution.executionId);
  assert.equal((await masterDataImportReviewRepository.listImportExecutions({ filters: { status: "committed" } })).length, 1);
  const reloadedMasterDataReviewState = await masterDataImportReviewRepository.loadState();
  assert.equal(reloadedMasterDataReviewState.masterDataImportConfirmationPlans.length, 1);
  assert.equal(reloadedMasterDataReviewState.masterDataImportReviewDrafts[0].employeeRoleCoverage.missingRoleCount, 7);
  assert.equal(reloadedMasterDataReviewState.masterDataImportConfirmationPlans[0].employeeRoleCoverage.coverageLabel, "1/8");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM master_data_import_review_drafts WHERE id = 'MDR-MD-LIVE-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM master_data_import_confirmation_plans WHERE id = 'MDP-MD-REVIEW-LIVE-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM master_data_import_executions WHERE id = 'MDE-MD-REVIEW-LIVE-001';", { capture: true }).trim()), 1);

  const statementBefore = buildStatement({ id: "ST-LIVE-REPO-001", customerId: "C-LIVE-REPO", status: "待生成" });
  const statementAfter = buildStatement({
    id: "ST-LIVE-REPO-001",
    customerId: "C-LIVE-REPO",
    status: "差额待确认",
    received: 200,
    variance: 73,
  });
  const transactionWorkspace = {
    statements: [statementBefore],
    paymentRecords: [],
    todos: [],
    operationLogs: [],
  };
  const paymentTransaction = await paymentTransactionRepository.recordStatementPayment({
    workspace: transactionWorkspace,
    statements: [statementAfter],
    statement: statementAfter,
    paymentRecord: buildPaymentRecord({
      paymentRecordId: "PAY-LIVE-TXN-001",
      statementId: "ST-LIVE-REPO-001",
      customerId: "C-LIVE-REPO",
      operatorId: "U-FINANCE-A",
      amount: 200,
    }),
    todo: buildTodo({
      todoId: "T-LIVE-PAY-TXN-001",
      statementId: "ST-LIVE-REPO-001",
    }),
    operationLog: buildOperationLog({ logId: "LOG-LIVE-PAY-TXN-001", before: statementBefore, after: statementAfter }),
  });
  assert.equal(paymentTransaction.statement.status, "差额待确认");
  assert.equal(paymentTransaction.payment.paymentRecordId, "PAY-LIVE-TXN-001");
  assert.equal(paymentTransaction.todo.id, "T-LIVE-PAY-TXN-001");
  assert.equal(queryJson("SELECT json_build_object('status', status, 'received', received_amount, 'variance', variance_amount) AS result FROM statements WHERE id = 'ST-LIVE-REPO-001';").status, "差额待确认");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM todos WHERE id = 'T-LIVE-PAY-TXN-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-PAY-TXN-001';", { capture: true }).trim()), 1);

  const varianceBefore = buildStatement({
    id: "ST-LIVE-VAR-001",
    customerId: "C-LIVE-REPO",
    status: "差额待确认",
    received: 200,
    variance: 73,
  });
  const varianceAfter = buildStatement({
    id: "ST-LIVE-VAR-001",
    customerId: "C-LIVE-REPO",
    status: "有欠款",
    received: 200,
    variance: 73,
  });
  const varianceTransaction = await settlementTransactionRepository.handleStatementVariance({
    workspace: { statements: [varianceBefore], varianceRecords: [], todos: [], operationLogs: [] },
    statements: [varianceAfter],
    statement: varianceAfter,
    varianceRecord: buildVarianceRecord({
      varianceRecordId: "VAR-LIVE-TXN-001",
      statementId: "ST-LIVE-VAR-001",
      amount: 73,
      operatorId: "U-FINANCE-A",
    }),
    todo: buildTodo({
      todoId: "T-LIVE-VAR-TXN-001",
      statementId: "ST-LIVE-VAR-001",
    }),
    operationLog: buildOperationLog({ logId: "LOG-LIVE-VAR-TXN-001", action: "handle_statement_variance", before: varianceBefore, after: varianceAfter }),
    decisionRecord: buildStatementDecisionRecord({
      decisionId: "BD-LIVE-VARIANCE-001",
      statementId: "ST-LIVE-VAR-001",
      decisionScope: "statement_variance",
      operationLogId: "LOG-LIVE-VAR-TXN-001",
      amount: 73,
    }),
  });
  assert.equal(varianceTransaction.varianceRecord.reason, "未收差额转欠款");
  assert.equal(queryJson("SELECT json_build_object('status', status, 'variance', variance_amount) AS result FROM statements WHERE id = 'ST-LIVE-VAR-001';").status, "有欠款");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM variance_records WHERE id = 'VAR-LIVE-TXN-001';", { capture: true }).trim()), 1);

  const varianceCommitted = varianceTransaction.statement;
  const writtenOff = {
    ...varianceCommitted,
    status: "已确认欠款",
  };
  const writeOffTransaction = await settlementTransactionRepository.writeOffStatement({
    workspace: { statements: [varianceCommitted], varianceRecords: [], todos: [], operationLogs: [] },
    statements: [writtenOff],
    statement: writtenOff,
    operationLog: buildOperationLog({
      logId: "LOG-LIVE-WRITE-TXN-001",
      action: "write_off_statement",
      before: varianceCommitted,
      after: writtenOff,
    }),
    decisionRecord: buildStatementDecisionRecord({
      decisionId: "BD-LIVE-WRITEOFF-001",
      statementId: "ST-LIVE-VAR-001",
      decisionScope: "statement_write_off",
      operationLogId: "LOG-LIVE-WRITE-TXN-001",
      amount: 73,
    }),
    writeOffRecord: buildStatementWriteOffRecord({
      writeOffId: "SWO-LIVE-WRITEOFF-001",
      statementId: "ST-LIVE-VAR-001",
      businessDecisionId: "BD-LIVE-WRITEOFF-001",
      operationLogId: "LOG-LIVE-WRITE-TXN-001",
    }),
  });
  assert.equal(writeOffTransaction.statement.status, "已确认欠款");
  assert.equal(queryJson("SELECT json_build_object('status', status, 'variance', variance_amount) AS result FROM statements WHERE id = 'ST-LIVE-VAR-001';").status, "已确认欠款");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-WRITE-TXN-001';", { capture: true }).trim()), 1);

  const orderConfirmationDraft = buildConfirmedOrderDraft({
    draftId: "DRAFT-LIVE-CONFIRM-001",
    customerId: "C-LIVE-REPO",
    createdBy: "U-FINANCE-A",
  });
  const orderConfirmationWorkspace = {
    orderDrafts: [orderConfirmationDraft],
    originalOrders: [],
    orderLines: [],
    fulfillments: [],
    operationLogs: [],
  };
  const orderConfirmation = await orderConfirmationRepository.confirmOrder({
    workspace: orderConfirmationWorkspace,
    orderDraft: { ...orderConfirmationDraft, status: "已生成正式订单" },
    expectedDraftRevision: 1,
    order: buildConfirmedOrder({
      orderId: "ORD-LIVE-CONFIRM-001",
      sourceDraftId: "DRAFT-LIVE-CONFIRM-001",
      customerId: "C-LIVE-REPO",
      createdBy: "U-FINANCE-A",
    }),
    orderLines: buildConfirmedOrderLines({
      orderId: "ORD-LIVE-CONFIRM-001",
      customerId: "C-LIVE-REPO",
      orderLineId: "OL-LIVE-CONFIRM-001",
      createdBy: "U-FINANCE-A",
    }),
    productionTasks: [{
      productionTaskId: "PT-OL-LIVE-CONFIRM-001",
      orderLineId: "OL-LIVE-CONFIRM-001",
      taskType: "丝印",
      machineId: "PRINT-01",
      plannedQty: 25,
      taskStatus: "待排产",
      createdBy: "U-FINANCE-A",
    }],
    priceSnapshots: buildConfirmedPriceSnapshots({ orderLineId: "OL-LIVE-CONFIRM-001", createdBy: "U-FINANCE-A" }),
    fulfillmentRecords: buildConfirmedFulfillments({
      fulfillmentId: "F-LIVE-CONFIRM-001",
      orderLineId: "OL-LIVE-CONFIRM-001",
      customerId: "C-LIVE-REPO",
      createdBy: "U-FINANCE-A",
    }),
    inventoryReservations: buildConfirmedInventoryReservations({
      reservationId: "RSV-LIVE-CONFIRM-001",
      orderLineId: "OL-LIVE-CONFIRM-001",
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      reservedQty: 25,
      createdBy: "U-FINANCE-A",
    }),
    inventoryLedgerEntries: buildConfirmedInventoryLedgerEntries({
      ledgerId: "LEDGER-LIVE-CONFIRM-001",
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      sourceId: "OL-LIVE-CONFIRM-001",
      qtyBefore: 10,
      qtyChange: 25,
      qtyAfter: 35,
      operatorId: "U-FINANCE-A",
    }),
    todos: buildConfirmedTodos({
      todoId: "T-LIVE-CONFIRM-001",
      refId: "ORD-LIVE-CONFIRM-001",
      customerId: "C-LIVE-REPO",
      createdBy: "U-FINANCE-A",
    }),
    operationLog: buildOperationLog({
      logId: "LOG-LIVE-ORDER-CONFIRM-001",
      action: "confirm_order_draft",
      before: null,
      after: { id: "ORD-LIVE-CONFIRM-001", orderNo: "ORD-LIVE-CONFIRM-001" },
    }),
  });
  assert.equal(orderConfirmation.orderDraft.revision, 2);
  assert.equal(orderConfirmation.orderDraft.status, "已生成正式订单");
  assert.equal(orderConfirmation.order.orderId, "ORD-LIVE-CONFIRM-001");
  assert.equal(orderConfirmation.orderLines.length, 1);
  assert.equal(orderConfirmation.productionTasks[0].productionTaskId, "PT-OL-LIVE-CONFIRM-001");
  assert.equal(orderConfirmation.priceSnapshots.length, 1);
  assert.equal(orderConfirmation.fulfillmentRecords.length, 1);
  assert.equal(orderConfirmation.inventoryReservations.length, 1);
  assert.equal(orderConfirmation.inventoryLedgerEntries.length, 1);
  assert.equal(orderConfirmation.todos.length, 1);
  assert.equal(
    queryJson("SELECT json_build_object('orderId', id, 'customerId', customer_id) AS result FROM original_orders WHERE id = 'ORD-LIVE-CONFIRM-001';").customerId,
    "C-LIVE-REPO",
  );
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM order_lines WHERE order_id = 'ORD-LIVE-CONFIRM-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM production_tasks WHERE order_line_id = 'OL-LIVE-CONFIRM-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM price_snapshots WHERE order_line_id = 'OL-LIVE-CONFIRM-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM fulfillment_records WHERE order_line_id = 'OL-LIVE-CONFIRM-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM inventory_reservations WHERE order_line_id = 'OL-LIVE-CONFIRM-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_id = 'OL-LIVE-CONFIRM-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM todos WHERE id = 'T-LIVE-CONFIRM-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()), 35);
  assert.deepEqual(
    queryJson("SELECT json_build_object('status', status, 'revision', revision) AS result FROM order_drafts WHERE id = 'DRAFT-LIVE-CONFIRM-001';"),
    { status: "已生成正式订单", revision: 2 },
  );

  const cancellationDraft = buildConfirmedOrderDraft({
    draftId: "DRAFT-LIVE-CANCEL-001",
    customerId: "C-LIVE-REPO",
    createdBy: "U-FINANCE-A",
  });
  const cancellationConfirmation = await orderConfirmationRepository.confirmOrder({
    workspace: {
      orderDrafts: [cancellationDraft],
      originalOrders: [],
      orderLines: [],
      fulfillments: [],
      inventoryIntents: [],
      operationLogs: [],
    },
    idempotencyKey: "idem-live-partial-shortage-cancel-001",
    orderDraft: { ...cancellationDraft, status: "已生成正式订单（部分缺货取消）" },
    expectedDraftRevision: 1,
    order: buildConfirmedOrder({
      orderId: "ORD-LIVE-CANCEL-001",
      sourceDraftId: "DRAFT-LIVE-CANCEL-001",
      customerId: "C-LIVE-REPO",
      createdBy: "U-FINANCE-A",
    }),
    orderLines: buildConfirmedOrderLines({
      orderId: "ORD-LIVE-CANCEL-001",
      customerId: "C-LIVE-REPO",
      orderLineId: "OL-LIVE-CANCEL-001",
      createdBy: "U-FINANCE-A",
    }),
    shortageCancellationIntents: [{
      id: "INT-LIVE-CANCEL-001",
      sourceDraftId: "DRAFT-LIVE-CANCEL-001",
      sourceMessageId: "MSG-LIVE-CANCEL-001",
      conversationId: "GROUP-LIVE-CANCEL-001",
      customerId: "C-LIVE-REPO",
      intentType: "shortage_cancellation",
      intentStatus: "库存不足取消-已应用",
      sourceText: "白色缺货不要了，红色继续",
      candidate: {
        relatedDraftLineIds: ["DRAFT-LIVE-CANCEL-001-02"],
        appliedDraftLineIds: ["DRAFT-LIVE-CANCEL-001-02"],
        continuedDraftLineIds: ["DRAFT-LIVE-CANCEL-001-01"],
        generatedOrderId: "ORD-LIVE-CANCEL-001",
      },
      cancellationScope: "shortage_lines_only",
      revision: 2,
      createdBy: "U-FINANCE-A",
    }],
    operationLog: buildOperationLog({
      logId: "LOG-LIVE-CANCEL-001",
      action: "confirm_order_draft",
      before: null,
      after: { id: "ORD-LIVE-CANCEL-001", cancelledDraftLineIds: ["DRAFT-LIVE-CANCEL-001-02"] },
    }),
  });
  assert.equal(cancellationConfirmation.orderLines.length, 1);
  assert.equal(cancellationConfirmation.inventoryIntents[0].intentStatus, "库存不足取消-已应用");
  assert.deepEqual(
    queryJson(`SELECT json_build_object(
      'status', intent_status,
      'revision', revision,
      'appliedDraftLineIds', candidate_json->'appliedDraftLineIds',
      'generatedOrderId', candidate_json->>'generatedOrderId'
    ) AS result FROM inventory_intents WHERE id = 'INT-LIVE-CANCEL-001';`),
    {
      status: "库存不足取消-已应用",
      revision: 2,
      appliedDraftLineIds: ["DRAFT-LIVE-CANCEL-001-02"],
      generatedOrderId: "ORD-LIVE-CANCEL-001",
    },
  );
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM order_lines WHERE order_id = 'ORD-LIVE-CANCEL-001';", { capture: true }).trim()), 1);

  const splitDraftBase = buildConfirmedOrderDraft({
    draftId: "DRAFT-LIVE-SPLIT-001",
    customerId: "C-LIVE-REPO",
    createdBy: "U-FINANCE-A",
  });
  const splitDraft = {
    ...splitDraftBase,
    status: "已生成多个正式订单",
    lines: [
      splitDraftBase.lines[0],
      { ...splitDraftBase.lines[0], id: "DRAFT-LIVE-SPLIT-001-02", fulfillment: "送货", latest: "后天" },
    ],
  };
  const splitOrderOne = buildConfirmedOrder({
    orderId: "ORD-LIVE-SPLIT-001",
    sourceDraftId: "DRAFT-LIVE-SPLIT-001",
    customerId: "C-LIVE-REPO",
    createdBy: "U-FINANCE-A",
  });
  const splitOrderTwo = buildConfirmedOrder({
    orderId: "ORD-LIVE-SPLIT-002",
    sourceDraftId: "DRAFT-LIVE-SPLIT-001",
    customerId: "C-LIVE-REPO",
    createdBy: "U-FINANCE-A",
  });
  const splitLineOne = buildConfirmedOrderLines({
    orderId: splitOrderOne.orderId,
    customerId: "C-LIVE-REPO",
    orderLineId: "OL-LIVE-SPLIT-001",
    createdBy: "U-FINANCE-A",
  })[0];
  const splitLineTwo = {
    ...buildConfirmedOrderLines({
      orderId: splitOrderTwo.orderId,
      customerId: "C-LIVE-REPO",
      orderLineId: "OL-LIVE-SPLIT-002",
      createdBy: "U-FINANCE-A",
    })[0],
    fulfillment: "送货",
  };
  const splitIdempotencyPayload = {
    draftId: splitDraft.id,
    clientRevision: 1,
    splitPlanHash: "SPLIT-PLAN-LIVE-001",
    action: "confirm_split_order_draft",
  };
  const splitCommandResponse = {
    orderId: splitOrderOne.orderId,
    orderIds: [splitOrderOne.orderId, splitOrderTwo.orderId],
    splitConfirmed: true,
  };
  const splitConfirmation = await orderConfirmationRepository.confirmOrder({
    workspace: {
      orderDrafts: [splitDraftBase],
      originalOrders: [],
      orderLines: [],
      fulfillments: [],
      operationLogs: [],
    },
    idempotencyKey: "idem-live-order-split-001",
    idempotencyPayload: splitIdempotencyPayload,
    orderDraft: splitDraft,
    expectedDraftRevision: 1,
    order: splitOrderOne,
    orders: [splitOrderOne, splitOrderTwo],
    orderLines: [splitLineOne, splitLineTwo],
    productionTasks: [],
    priceSnapshots: [],
    fulfillmentRecords: [],
    inventoryReservations: [],
    inventoryLedgerEntries: [],
    todos: [],
    commandResponse: splitCommandResponse,
    operationLog: buildOperationLog({
      logId: "LOG-LIVE-SPLIT-001",
      action: "confirm_split_order_draft",
      before: null,
      after: { orderNos: [splitOrderOne.orderId, splitOrderTwo.orderId] },
    }),
  });
  assert.deepEqual(splitConfirmation.orders.map((order) => order.orderId), [splitOrderOne.orderId, splitOrderTwo.orderId]);
  assert.deepEqual(splitConfirmation.commandResponse, splitCommandResponse);
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM original_orders WHERE source_draft_id = 'DRAFT-LIVE-SPLIT-001';", { capture: true }).trim()),
    2,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM order_lines WHERE order_id IN ('ORD-LIVE-SPLIT-001', 'ORD-LIVE-SPLIT-002');", { capture: true }).trim()),
    2,
  );
  const restartedSplitRepository = createPostgresOrderConfirmationTransactionRepository({
    postgresClient: statementPostgresClient,
  });
  const splitReplay = await restartedSplitRepository.findIdempotentReplay({
    idempotencyKey: "idem-live-order-split-001",
    idempotencyPayload: splitIdempotencyPayload,
  });
  assert.deepEqual(splitReplay.commandResponse, splitCommandResponse);
  assert.deepEqual(splitReplay.orders.map((order) => order.orderId), [splitOrderOne.orderId, splitOrderTwo.orderId]);
  await assert.rejects(
    () => restartedSplitRepository.findIdempotentReplay({
      idempotencyKey: "idem-live-order-split-001",
      idempotencyPayload: { ...splitIdempotencyPayload, splitPlanHash: "SPLIT-PLAN-LIVE-CHANGED" },
    }),
    (error) => error?.statusCode === 409 && error?.code === "IDEMPOTENCY_KEY_REUSED",
  );

  const reservedBeforeStaleConfirmation = Number(
    runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim(),
  );
  await assert.rejects(
    () =>
      orderConfirmationRepository.confirmOrder({
        workspace: {
          orderDrafts: [orderConfirmation.orderDraft],
          originalOrders: [],
          orderLines: [],
          fulfillments: [],
          operationLogs: [],
        },
        idempotencyKey: "idem-live-order-confirm-stale-001",
        orderDraft: orderConfirmation.orderDraft,
        expectedDraftRevision: 1,
        order: buildConfirmedOrder({
          orderId: "ORD-LIVE-CONFIRM-STALE-001",
          sourceDraftId: "DRAFT-LIVE-CONFIRM-001",
          customerId: "C-LIVE-REPO",
          createdBy: "U-FINANCE-A",
        }),
        orderLines: buildConfirmedOrderLines({
          orderId: "ORD-LIVE-CONFIRM-STALE-001",
          customerId: "C-LIVE-REPO",
          orderLineId: "OL-LIVE-CONFIRM-STALE-001",
          createdBy: "U-FINANCE-A",
        }),
        priceSnapshots: buildConfirmedPriceSnapshots({
          orderLineId: "OL-LIVE-CONFIRM-STALE-001",
          createdBy: "U-FINANCE-A",
        }),
        fulfillmentRecords: buildConfirmedFulfillments({
          fulfillmentId: "F-LIVE-CONFIRM-STALE-001",
          orderLineId: "OL-LIVE-CONFIRM-STALE-001",
          customerId: "C-LIVE-REPO",
          createdBy: "U-FINANCE-A",
        }),
        inventoryReservations: buildConfirmedInventoryReservations({
          reservationId: "RSV-LIVE-CONFIRM-STALE-001",
          orderLineId: "OL-LIVE-CONFIRM-STALE-001",
          inventoryItemId: "INV-LIVE-CONFIRM-001",
          reservedQty: 5,
          createdBy: "U-FINANCE-A",
        }),
        inventoryLedgerEntries: buildConfirmedInventoryLedgerEntries({
          ledgerId: "LEDGER-LIVE-CONFIRM-STALE-001",
          inventoryItemId: "INV-LIVE-CONFIRM-001",
          sourceId: "OL-LIVE-CONFIRM-STALE-001",
          qtyBefore: reservedBeforeStaleConfirmation,
          qtyChange: 5,
          qtyAfter: reservedBeforeStaleConfirmation + 5,
          operatorId: "U-FINANCE-A",
        }),
        todos: buildConfirmedTodos({
          todoId: "T-LIVE-CONFIRM-STALE-001",
          refId: "ORD-LIVE-CONFIRM-STALE-001",
          customerId: "C-LIVE-REPO",
          createdBy: "U-FINANCE-A",
        }),
        operationLog: buildOperationLog({
          logId: "LOG-LIVE-ORDER-CONFIRM-STALE-001",
          action: "confirm_order_draft",
          before: null,
          after: { id: "ORD-LIVE-CONFIRM-STALE-001", orderNo: "ORD-LIVE-CONFIRM-STALE-001" },
        }),
      }),
    (error) =>
      (error?.statusCode === 409 && error?.code === "BUSINESS_WRITE_CONFLICT") ||
      /ERP_ORDER_DRAFT_CONCURRENCY_CONFLICT/.test(String(error?.message ?? "")),
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM original_orders WHERE id = 'ORD-LIVE-CONFIRM-STALE-001';", { capture: true }).trim()),
    0,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM order_lines WHERE id = 'OL-LIVE-CONFIRM-STALE-001';", { capture: true }).trim()),
    0,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM fulfillment_records WHERE id = 'F-LIVE-CONFIRM-STALE-001';", { capture: true }).trim()),
    0,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM inventory_reservations WHERE id = 'RSV-LIVE-CONFIRM-STALE-001';", { capture: true }).trim()),
    0,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM inventory_ledger_entries WHERE id = 'LEDGER-LIVE-CONFIRM-STALE-001';", { capture: true }).trim()),
    0,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM todos WHERE id = 'T-LIVE-CONFIRM-STALE-001';", { capture: true }).trim()),
    0,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-ORDER-CONFIRM-STALE-001';", { capture: true }).trim()),
    0,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM operation_idempotency_keys WHERE scope = 'order.confirm' AND idempotency_key = 'idem-live-order-confirm-stale-001';",
        { capture: true },
      ).trim(),
    ),
    0,
  );
  assert.equal(
    Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()),
    reservedBeforeStaleConfirmation,
  );
  assert.deepEqual(
    queryJson("SELECT json_build_object('status', status, 'revision', revision) AS result FROM order_drafts WHERE id = 'DRAFT-LIVE-CONFIRM-001';"),
    { status: "已生成正式订单", revision: 2 },
  );

  runPsql(`
INSERT INTO order_drafts (
  id, biz_no, source_text, source_channel, customer_id, status, recognition_summary, revision, created_by
) VALUES
  ('DRAFT-LIVE-CONCURRENT-A', 'DRAFT-LIVE-CONCURRENT-A', 'Concurrent order A', 'manual', 'C-LIVE-REPO', '待审核', '{"customerName":"Postgres 仓储测试客户"}'::jsonb, 1, 'U-FINANCE-A'),
  ('DRAFT-LIVE-CONCURRENT-B', 'DRAFT-LIVE-CONCURRENT-B', 'Concurrent order B', 'manual', 'C-LIVE-REPO', '待审核', '{"customerName":"Postgres 仓储测试客户"}'::jsonb, 1, 'U-FINANCE-A')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  revision = EXCLUDED.revision,
  recognition_summary = EXCLUDED.recognition_summary,
  updated_at = now();
`);
  const concurrentConfirmationPool = new Pool({
    connectionString: resolveLiveDatabaseUrl(),
    max: 4,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const concurrentConfirmationRepository = createPostgresOrderConfirmationTransactionRepository({
      postgresClient: createPostgresPoolClient({ pool: concurrentConfirmationPool }),
    });
    const buildConcurrentConfirmationInput = (draftId, suffix) => {
      const draft = buildConfirmedOrderDraft({ draftId, customerId: "C-LIVE-REPO", createdBy: "U-FINANCE-A" });
      return {
        workspace: { orderDrafts: [draft], originalOrders: [], orderLines: [], fulfillments: [], operationLogs: [] },
        idempotencyKey: `idem-live-order-confirm-concurrent-${suffix}`,
        orderDraft: { ...draft, status: "已生成正式订单" },
        expectedDraftRevision: 1,
        order: buildConfirmedOrder({
          orderId: "ORD-LIVE-CONCURRENT-ID-001",
          sourceDraftId: draftId,
          customerId: "C-LIVE-REPO",
          createdBy: "U-FINANCE-A",
        }),
        orderLines: buildConfirmedOrderLines({
          orderId: "ORD-LIVE-CONCURRENT-ID-001",
          customerId: "C-LIVE-REPO",
          orderLineId: "OL-LIVE-CONCURRENT-ID-001",
          createdBy: "U-FINANCE-A",
        }),
        priceSnapshots: [],
        fulfillmentRecords: [],
        inventoryReservations: [],
        inventoryLedgerEntries: [],
        todos: [],
        operationLog: buildOperationLog({
          logId: `LOG-LIVE-ORDER-CONCURRENT-${suffix}`,
          action: "confirm_order_draft",
          before: null,
          after: { id: "ORD-LIVE-CONCURRENT-ID-001", sourceDraftId: draftId },
        }),
      };
    };
    const concurrentConfirmations = await Promise.allSettled([
      concurrentConfirmationRepository.confirmOrder(buildConcurrentConfirmationInput("DRAFT-LIVE-CONCURRENT-A", "A")),
      concurrentConfirmationRepository.confirmOrder(buildConcurrentConfirmationInput("DRAFT-LIVE-CONCURRENT-B", "B")),
    ]);
    assert.equal(concurrentConfirmations.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(concurrentConfirmations.filter((result) => result.status === "rejected").length, 1);
    const rejectedConcurrentConfirmation = concurrentConfirmations.find((result) => result.status === "rejected");
    assert.equal(rejectedConcurrentConfirmation.reason?.statusCode, 409);
    assert.equal(rejectedConcurrentConfirmation.reason?.code, "BUSINESS_WRITE_CONFLICT");
  } finally {
    await concurrentConfirmationPool.end();
  }
  const concurrentOrderWinner = queryJson(
    "SELECT json_build_object('sourceDraftId', source_draft_id) AS result FROM original_orders WHERE id = 'ORD-LIVE-CONCURRENT-ID-001';",
  );
  assert.ok(["DRAFT-LIVE-CONCURRENT-A", "DRAFT-LIVE-CONCURRENT-B"].includes(concurrentOrderWinner.sourceDraftId));
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM original_orders WHERE id = 'ORD-LIVE-CONCURRENT-ID-001';", { capture: true }).trim()),
    1,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM order_lines WHERE id = 'OL-LIVE-CONCURRENT-ID-001';", { capture: true }).trim()),
    1,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id LIKE 'LOG-LIVE-ORDER-CONCURRENT-%';", { capture: true }).trim()),
    1,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM order_drafts WHERE id IN ('DRAFT-LIVE-CONCURRENT-A', 'DRAFT-LIVE-CONCURRENT-B') AND revision = 2 AND status = '已生成正式订单';",
        { capture: true },
      ).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM order_drafts WHERE id IN ('DRAFT-LIVE-CONCURRENT-A', 'DRAFT-LIVE-CONCURRENT-B') AND revision = 1 AND status = '待审核';",
        { capture: true },
      ).trim(),
    ),
    1,
  );

  const releasedReservation = await inventoryReservationReleaseRepository.releaseReservation({
    workspace: {
      inventories: [{ id: "INV-LIVE-CONFIRM-001", reserved: 35 }],
      inventoryReservations: [orderConfirmation.inventoryReservations[0]],
      inventoryLedgers: [],
      operationLogs: [],
    },
    reservation: {
      ...orderConfirmation.inventoryReservations[0],
      reservedQty: 10,
      status: "部分释放",
    },
    inventoryAdjustment: {
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      reservedQtyChange: -15,
    },
    inventoryLedgerEntry: {
      ledgerId: "LEDGER-LIVE-RELEASE-001",
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      changeType: "释放占用",
      qtyBefore: 35,
      qtyChange: -15,
      qtyAfter: 20,
      sourceType: "inventory_reservation_release",
      sourceId: "RSV-LIVE-CONFIRM-001",
      operatorId: "U-FINANCE-A",
      confirmedBy: "U-FINANCE-A",
      reason: "人工释放库存占用",
      remark: "释放占用 15",
    },
    operationLog: {
      id: "LOG-LIVE-RELEASE-001",
      targetType: "inventory_reservation",
      targetId: "RSV-LIVE-CONFIRM-001",
      action: "release_inventory_reservation",
      before: orderConfirmation.inventoryReservations[0],
      after: { ...orderConfirmation.inventoryReservations[0], reservedQty: 10, status: "部分释放" },
      reason: "人工释放库存占用",
      operatorId: "U-FINANCE-A",
      pageKey: "api",
      occurredAt: "2026-07-02T10:50:00.000Z",
      createdAt: "2026-07-02T10:50:00.000Z",
    },
  });
  assert.equal(releasedReservation.reservation.status, "部分释放");
  assert.equal(
    queryJson("SELECT json_build_object('status', status, 'reservedQty', reserved_qty) AS result FROM inventory_reservations WHERE id = 'RSV-LIVE-CONFIRM-001';").status,
    "部分释放",
  );
  assert.equal(Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()), 20);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM inventory_ledger_entries WHERE id = 'LEDGER-LIVE-RELEASE-001';", { capture: true }).trim()), 1);
  const releaseLedgerRead = await inventoryLedgerReadRepository.listInventoryLedgerEntries({
    query: {
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      sourceType: "inventory_reservation_release",
      sourceId: "RSV-LIVE-CONFIRM-001",
      pageSize: 5,
    },
  });
  postgresAssertions.assertReleaseLedgerRead({ releaseLedgerRead });

  const voidMutationSnapshot = queryJson(
    `SELECT json_build_object(
      'orderLineRevision', ol.revision,
      'fulfillmentRevision', fr.revision,
      'reservationRevision', ir.revision,
      'reservationQty', ir.reserved_qty,
      'reservationStatus', ir.status,
      'inventoryRevision', ii.revision,
      'inventoryReservedQty', ii.reserved_qty
    ) AS result
    FROM order_lines ol
    JOIN fulfillment_records fr ON fr.id = 'F-LIVE-CONFIRM-001'
    JOIN inventory_reservations ir ON ir.id = 'RSV-LIVE-CONFIRM-001'
    JOIN inventory_items ii ON ii.id = 'INV-LIVE-CONFIRM-001'
    WHERE ol.id = 'OL-LIVE-CONFIRM-001';`,
  );
  const voidedOrderLine = await orderLineVoidRepository.voidOrderLine({
    workspace: {
      orderLines: orderConfirmation.orderLines,
      fulfillments: orderConfirmation.fulfillmentRecords,
      inventories: [{ id: "INV-LIVE-CONFIRM-001", reserved: 20 }],
      inventoryReservations: [releasedReservation.reservation],
      inventoryLedgers: [],
      orderLineChangeRecords: [],
      operationLogs: [],
    },
    expectedOrderLineRevision: voidMutationSnapshot.orderLineRevision,
    orderLine: {
      ...orderConfirmation.orderLines[0],
      lineStatus: "已关闭",
      status: "已关闭",
      exceptionTags: ["订单已作废"],
      voidedBy: "U-FINANCE-A",
      voidedAt: "2026-07-02T10:55:00.000Z",
      voidReason: "客户取消订单",
    },
    fulfillmentRecords: [
      {
        ...orderConfirmation.fulfillmentRecords[0],
        status: "已取消",
        confirmedBy: "U-FINANCE-A",
        revision: voidMutationSnapshot.fulfillmentRevision,
      },
    ],
    inventoryReservations: [
      {
        ...releasedReservation.reservation,
        reservedQty: 0,
        status: "已释放",
        revision: voidMutationSnapshot.reservationRevision,
        expectedRevision: voidMutationSnapshot.reservationRevision,
        expectedReservedQty: voidMutationSnapshot.reservationQty,
        expectedStatus: voidMutationSnapshot.reservationStatus,
      },
    ],
    inventoryAdjustments: [
      {
        inventoryItemId: "INV-LIVE-CONFIRM-001",
        reservedQtyChange: -10,
        expectedRevision: voidMutationSnapshot.inventoryRevision,
        expectedReservedQty: voidMutationSnapshot.inventoryReservedQty,
      },
    ],
    inventoryLedgerEntries: [
      {
        ledgerId: "LEDGER-LIVE-VOID-001",
        inventoryItemId: "INV-LIVE-CONFIRM-001",
        changeType: "释放占用",
        qtyBefore: 20,
        qtyChange: -10,
        qtyAfter: 10,
        sourceType: "order_line_void",
        sourceId: "OL-LIVE-CONFIRM-001",
        operatorId: "U-FINANCE-A",
        confirmedBy: "U-FINANCE-A",
        reason: "客户取消订单",
        remark: "订单作废释放占用 10",
      },
    ],
    orderLineChangeRecord: {
      changeRecordId: "OLCR-LIVE-VOID-001",
      orderLineId: "OL-LIVE-CONFIRM-001",
      changedFields: ["line_status", "void_reason", "inventory_reservation"],
      before: { lineStatus: "待交付确认" },
      after: { lineStatus: "已关闭" },
      reason: "客户取消订单",
      documentReprintRequired: true,
      changedBy: "U-FINANCE-A",
      createdAt: "2026-07-02T10:55:00.000Z",
    },
    operationLog: {
      id: "LOG-LIVE-VOID-001",
      targetType: "order_line",
      targetId: "OL-LIVE-CONFIRM-001",
      action: "void_order_line",
      before: { lineStatus: "待交付确认" },
      after: { lineStatus: "已关闭", releasedReservationIds: ["RSV-LIVE-CONFIRM-001"] },
      reason: "客户取消订单",
      operatorId: "U-FINANCE-A",
      pageKey: "api",
      occurredAt: "2026-07-02T10:55:00.000Z",
      createdAt: "2026-07-02T10:55:00.000Z",
    },
  });
  assert.equal(voidedOrderLine.orderLine.lineStatus, "已关闭");
  assert.equal(voidedOrderLine.inventoryReservations[0].status, "已释放");
  assert.equal(
    queryJson("SELECT json_build_object('lineStatus', line_status, 'voidReason', void_reason) AS result FROM order_lines WHERE id = 'OL-LIVE-CONFIRM-001';").lineStatus,
    "已关闭",
  );
  assert.equal(queryJson("SELECT json_build_object('status', status) AS result FROM fulfillment_records WHERE id = 'F-LIVE-CONFIRM-001';").status, "已取消");
  assert.equal(
    queryJson("SELECT json_build_object('status', status, 'reservedQty', reserved_qty) AS result FROM inventory_reservations WHERE id = 'RSV-LIVE-CONFIRM-001';").status,
    "已释放",
  );
  assert.equal(Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()), 10);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM inventory_ledger_entries WHERE id = 'LEDGER-LIVE-VOID-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM order_line_change_records WHERE id = 'OLCR-LIVE-VOID-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-VOID-001';", { capture: true }).trim()), 1);

  const quantityDraft = buildConfirmedOrderDraft({
    draftId: "DRAFT-LIVE-QTY-001",
    customerId: "C-LIVE-REPO",
    createdBy: "U-FINANCE-A",
  });
  const quantityAdjustmentOrder = await orderConfirmationRepository.confirmOrder({
    workspace: { orderDrafts: [quantityDraft], originalOrders: [], orderLines: [], fulfillments: [], operationLogs: [] },
    orderDraft: { ...quantityDraft, status: "已生成正式订单" },
    expectedDraftRevision: 1,
    order: buildConfirmedOrder({
      orderId: "ORD-LIVE-QTY-001",
      sourceDraftId: "DRAFT-LIVE-QTY-001",
      customerId: "C-LIVE-REPO",
      createdBy: "U-FINANCE-A",
    }),
    orderLines: buildConfirmedOrderLines({
      orderId: "ORD-LIVE-QTY-001",
      customerId: "C-LIVE-REPO",
      orderLineId: "OL-LIVE-QTY-001",
      createdBy: "U-FINANCE-A",
    }).map((line) => ({ ...line, qty: 20, amount: 20 })),
    priceSnapshots: buildConfirmedPriceSnapshots({ orderLineId: "OL-LIVE-QTY-001", createdBy: "U-FINANCE-A" }).map(
      (snapshot) => ({ ...snapshot, chargeableQty: 20, amount: 20, finalAmount: 20 }),
    ),
    fulfillmentRecords: buildConfirmedFulfillments({
      fulfillmentId: "F-LIVE-QTY-001",
      orderLineId: "OL-LIVE-QTY-001",
      customerId: "C-LIVE-REPO",
      createdBy: "U-FINANCE-A",
    }).map((fulfillment) => ({ ...fulfillment, qty: 20 })),
    inventoryReservations: buildConfirmedInventoryReservations({
      reservationId: "RSV-LIVE-QTY-001",
      orderLineId: "OL-LIVE-QTY-001",
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      reservedQty: 20,
      createdBy: "U-FINANCE-A",
    }),
    inventoryLedgerEntries: buildConfirmedInventoryLedgerEntries({
      ledgerId: "LEDGER-LIVE-QTY-CONFIRM-001",
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      sourceId: "OL-LIVE-QTY-001",
      qtyBefore: 10,
      qtyChange: 20,
      qtyAfter: 30,
      operatorId: "U-FINANCE-A",
    }),
    todos: [],
    operationLog: buildOperationLog({
      logId: "LOG-LIVE-QTY-CONFIRM-001",
      action: "confirm_order_draft",
      before: null,
      after: { id: "ORD-LIVE-QTY-001", orderNo: "ORD-LIVE-QTY-001" },
    }),
  });
  assert.equal(quantityAdjustmentOrder.orderLines[0].originalQty, 20);
  assert.equal(Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()), 30);

  const decreaseMutationSnapshot = queryJson(
    `SELECT json_build_object(
      'orderLineRevision', ol.revision,
      'fulfillmentRevision', fr.revision,
      'reservationRevision', ir.revision,
      'reservationQty', ir.reserved_qty,
      'reservationStatus', ir.status,
      'inventoryRevision', ii.revision,
      'inventoryReservedQty', ii.reserved_qty
    ) AS result
    FROM order_lines ol
    JOIN fulfillment_records fr ON fr.id = 'F-LIVE-QTY-001'
    JOIN inventory_reservations ir ON ir.id = 'RSV-LIVE-QTY-001'
    JOIN inventory_items ii ON ii.id = 'INV-LIVE-CONFIRM-001'
    WHERE ol.id = 'OL-LIVE-QTY-001';`,
  );
  const decreasedQuantityOrderLine = await orderLineQuantityAdjustmentRepository.adjustOrderLineQuantity({
    workspace: {
      orderLines: quantityAdjustmentOrder.orderLines,
      fulfillments: quantityAdjustmentOrder.fulfillmentRecords,
      inventories: [{ id: "INV-LIVE-CONFIRM-001", reserved: 30 }],
      priceSnapshots: quantityAdjustmentOrder.priceSnapshots,
      inventoryReservations: quantityAdjustmentOrder.inventoryReservations,
      inventoryLedgers: [],
      orderLineChangeRecords: [],
      operationLogs: [],
    },
    expectedOrderLineRevision: decreaseMutationSnapshot.orderLineRevision,
    orderLine: { ...quantityAdjustmentOrder.orderLines[0], originalQty: 12, qty: 12 },
    fulfillmentRecords: [
      {
        ...quantityAdjustmentOrder.fulfillmentRecords[0],
        expectedQty: 12,
        qty: 12,
        confirmedBy: "U-FINANCE-A",
        revision: decreaseMutationSnapshot.fulfillmentRevision,
      },
    ],
    priceSnapshots: [
      {
        priceSnapshotId: "PS-LIVE-QTY-DECREASE-001",
        orderLineId: "OL-LIVE-QTY-001",
        snapshotType: "quantity_adjustment",
        versionNo: 1,
        bagPrice: 1,
        printPrice: 0,
        otherFee: 0,
        adjustmentAmount: 0,
        chargeableQty: 12,
        finalAmount: 12,
        overrideReason: "订单改量 20 -> 12，按原订单单价重算",
        createdBy: "U-FINANCE-A",
      },
    ],
    inventoryReservations: [
      {
        ...quantityAdjustmentOrder.inventoryReservations[0],
        reservedQty: 12,
        qty: 12,
        status: "生效",
        revision: decreaseMutationSnapshot.reservationRevision,
        expectedRevision: decreaseMutationSnapshot.reservationRevision,
        expectedReservedQty: decreaseMutationSnapshot.reservationQty,
        expectedStatus: decreaseMutationSnapshot.reservationStatus,
      },
    ],
    inventoryAdjustments: [
      {
        inventoryItemId: "INV-LIVE-CONFIRM-001",
        reservedQtyChange: -8,
        expectedRevision: decreaseMutationSnapshot.inventoryRevision,
        expectedReservedQty: decreaseMutationSnapshot.inventoryReservedQty,
      },
    ],
    inventoryLedgerEntries: [
      {
        ledgerId: "LEDGER-LIVE-QTY-DECREASE-001",
        inventoryItemId: "INV-LIVE-CONFIRM-001",
        changeType: "订单改量释放占用",
        qtyBefore: 30,
        qtyChange: -8,
        qtyAfter: 22,
        sourceType: "order_line_quantity_adjustment",
        sourceId: "OL-LIVE-QTY-001",
        operatorId: "U-FINANCE-A",
        confirmedBy: "U-FINANCE-A",
        reason: "客户改量",
        remark: "订单改量 20 -> 12，释放占用 8",
      },
    ],
    orderLineChangeRecord: {
      changeRecordId: "OLCR-LIVE-QTY-DECREASE-001",
      orderLineId: "OL-LIVE-QTY-001",
      changedFields: ["original_qty", "fulfillment_expected_qty", "inventory_reservation"],
      before: { originalQty: 20 },
      after: { originalQty: 12 },
      reason: "客户改量",
      documentReprintRequired: true,
      changedBy: "U-FINANCE-A",
      createdAt: "2026-07-02T11:05:00.000Z",
    },
    operationLog: {
      id: "LOG-LIVE-QTY-DECREASE-001",
      targetType: "order_line",
      targetId: "OL-LIVE-QTY-001",
      action: "adjust_order_line_quantity",
      before: { originalQty: 20 },
      after: { originalQty: 12, adjustedReservationIds: ["RSV-LIVE-QTY-001"] },
      reason: "客户改量",
      operatorId: "U-FINANCE-A",
      pageKey: "api",
      occurredAt: "2026-07-02T11:05:00.000Z",
      createdAt: "2026-07-02T11:05:00.000Z",
    },
  });
  assert.equal(decreasedQuantityOrderLine.orderLine.originalQty, 12);
  assert.equal(decreasedQuantityOrderLine.fulfillmentRecords[0].expectedQty, 12);
  assert.equal(decreasedQuantityOrderLine.inventoryReservations[0].reservedQty, 12);
  assert.equal(
    queryJson("SELECT json_build_object('originalQty', original_qty) AS result FROM order_lines WHERE id = 'OL-LIVE-QTY-001';").originalQty,
    12,
  );
  assert.equal(queryJson("SELECT json_build_object('expectedQty', expected_qty) AS result FROM fulfillment_records WHERE id = 'F-LIVE-QTY-001';").expectedQty, 12);
  assert.equal(
    queryJson("SELECT json_build_object('chargeableQty', chargeable_qty, 'finalAmount', final_amount) AS result FROM price_snapshots WHERE id = 'PS-LIVE-QTY-DECREASE-001';").chargeableQty,
    12,
  );
  assert.equal(Number(runPsql("SELECT final_amount FROM price_snapshots WHERE id = 'PS-LIVE-QTY-DECREASE-001';", { capture: true }).trim()), 12);
  assert.equal(Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()), 22);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM inventory_ledger_entries WHERE id = 'LEDGER-LIVE-QTY-DECREASE-001';", { capture: true }).trim()), 1);

  const increaseMutationSnapshot = queryJson(
    `SELECT json_build_object(
      'orderLineRevision', ol.revision,
      'fulfillmentRevision', fr.revision,
      'reservationRevision', ir.revision,
      'reservationQty', ir.reserved_qty,
      'reservationStatus', ir.status,
      'inventoryRevision', ii.revision,
      'inventoryReservedQty', ii.reserved_qty
    ) AS result
    FROM order_lines ol
    JOIN fulfillment_records fr ON fr.id = 'F-LIVE-QTY-001'
    JOIN inventory_reservations ir ON ir.id = 'RSV-LIVE-QTY-001'
    JOIN inventory_items ii ON ii.id = 'INV-LIVE-CONFIRM-001'
    WHERE ol.id = 'OL-LIVE-QTY-001';`,
  );
  const increasedQuantityOrderLine = await orderLineQuantityAdjustmentRepository.adjustOrderLineQuantity({
    workspace: {
      orderLines: [decreasedQuantityOrderLine.orderLine],
      fulfillments: decreasedQuantityOrderLine.fulfillmentRecords,
      inventories: [{ id: "INV-LIVE-CONFIRM-001", reserved: 22 }],
      priceSnapshots: decreasedQuantityOrderLine.priceSnapshots,
      inventoryReservations: decreasedQuantityOrderLine.inventoryReservations,
      inventoryLedgers: [],
      orderLineChangeRecords: [],
      operationLogs: [],
    },
    expectedOrderLineRevision: increaseMutationSnapshot.orderLineRevision,
    orderLine: { ...decreasedQuantityOrderLine.orderLine, originalQty: 15, qty: 15 },
    fulfillmentRecords: [
      {
        ...decreasedQuantityOrderLine.fulfillmentRecords[0],
        expectedQty: 15,
        qty: 15,
        confirmedBy: "U-FINANCE-A",
        revision: increaseMutationSnapshot.fulfillmentRevision,
      },
    ],
    priceSnapshots: [
      {
        priceSnapshotId: "PS-LIVE-QTY-INCREASE-001",
        orderLineId: "OL-LIVE-QTY-001",
        snapshotType: "quantity_adjustment",
        versionNo: 2,
        bagPrice: 1,
        printPrice: 0,
        otherFee: 0,
        adjustmentAmount: 0,
        chargeableQty: 15,
        finalAmount: 15,
        overrideReason: "订单改量 12 -> 15，按原订单单价重算",
        createdBy: "U-FINANCE-A",
      },
    ],
    inventoryReservations: [
      {
        ...decreasedQuantityOrderLine.inventoryReservations[0],
        reservedQty: 15,
        qty: 15,
        status: "生效",
        revision: increaseMutationSnapshot.reservationRevision,
        expectedRevision: increaseMutationSnapshot.reservationRevision,
        expectedReservedQty: increaseMutationSnapshot.reservationQty,
        expectedStatus: increaseMutationSnapshot.reservationStatus,
      },
    ],
    inventoryAdjustments: [
      {
        inventoryItemId: "INV-LIVE-CONFIRM-001",
        reservedQtyChange: 3,
        expectedRevision: increaseMutationSnapshot.inventoryRevision,
        expectedReservedQty: increaseMutationSnapshot.inventoryReservedQty,
      },
    ],
    inventoryLedgerEntries: [
      {
        ledgerId: "LEDGER-LIVE-QTY-INCREASE-001",
        inventoryItemId: "INV-LIVE-CONFIRM-001",
        changeType: "订单改量补占用",
        qtyBefore: 22,
        qtyChange: 3,
        qtyAfter: 25,
        sourceType: "order_line_quantity_adjustment",
        sourceId: "OL-LIVE-QTY-001",
        operatorId: "U-FINANCE-A",
        confirmedBy: "U-FINANCE-A",
        reason: "客户改量",
        remark: "订单改量 12 -> 15，补占用 3",
      },
    ],
    orderLineChangeRecord: {
      changeRecordId: "OLCR-LIVE-QTY-INCREASE-001",
      orderLineId: "OL-LIVE-QTY-001",
      changedFields: ["original_qty", "fulfillment_expected_qty", "inventory_reservation"],
      before: { originalQty: 12 },
      after: { originalQty: 15 },
      reason: "客户改量",
      documentReprintRequired: true,
      changedBy: "U-FINANCE-A",
      createdAt: "2026-07-02T11:10:00.000Z",
    },
    operationLog: {
      id: "LOG-LIVE-QTY-INCREASE-001",
      targetType: "order_line",
      targetId: "OL-LIVE-QTY-001",
      action: "adjust_order_line_quantity",
      before: { originalQty: 12 },
      after: { originalQty: 15, adjustedReservationIds: ["RSV-LIVE-QTY-001"] },
      reason: "客户改量",
      operatorId: "U-FINANCE-A",
      pageKey: "api",
      occurredAt: "2026-07-02T11:10:00.000Z",
      createdAt: "2026-07-02T11:10:00.000Z",
    },
  });
  assert.equal(increasedQuantityOrderLine.orderLine.originalQty, 15);
  assert.equal(increasedQuantityOrderLine.priceSnapshots[0].finalAmount, 15);
  assert.equal(increasedQuantityOrderLine.inventoryReservations[0].reservedQty, 15);
  assert.equal(Number(runPsql("SELECT final_amount FROM price_snapshots WHERE id = 'PS-LIVE-QTY-INCREASE-001';", { capture: true }).trim()), 15);
  assert.equal(Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()), 25);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM order_line_change_records WHERE id LIKE 'OLCR-LIVE-QTY-%';", { capture: true }).trim()), 2);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id LIKE 'LOG-LIVE-QTY-%';", { capture: true }).trim()), 3);

  runPsql(
    `INSERT INTO machines (id, biz_no, name, machine_type, workshop, status, enabled, created_by)
     VALUES
       ('BAG-LIVE-01', 'BAG-LIVE-01', 'Postgres live 制袋机', 'bag_making', '1号车间', 'active', true, 'U-OFFICE-A'),
       ('BAG-LIVE-02', 'BAG-LIVE-02', 'Postgres live 备用制袋机', 'bag_making', '1号车间', 'active', true, 'U-OFFICE-A')
     ON CONFLICT (id) DO NOTHING;`,
  );
  const productionWorkspace = {
    productionTasks: [],
    workshopReports: [],
    packingTasks: [],
    packages: [],
    orderLines: [{ id: "OL-LIVE-PROD-001", status: "制袋中" }],
    fulfillments: [],
    inventories: [{ id: "INV-LIVE-PROD-001", inStock: 20, reserved: 0, locked: 0 }],
    inventoryReservations: [],
    inventoryLedgers: [],
    machineCapacityBaselines: [],
    operationLogs: [],
  };
  const productionWriteSnapshot = queryJson(
    `SELECT json_build_object(
      'orderLineRevision', ol.revision,
      'inventoryRevision', ii.revision,
      'onHandQty', ii.on_hand_qty,
      'reservedQty', ii.reserved_qty
    ) AS result
    FROM order_lines ol
    JOIN inventory_items ii ON ii.id = 'INV-LIVE-PROD-001'
    WHERE ol.id = 'OL-LIVE-PROD-001';`,
  );
  const productionReport = await productionPackingRepository.recordProductionReport({
    workspace: productionWorkspace,
    productionTask: buildProductionTaskRecord({ taskStatus: "已完成" }),
    workshopReport: buildWorkshopReportRecord({ remark: "Postgres live O'Brien production report" }),
    orderLine: buildProductionOrderLineRecord({
      lineStatus: "待打包",
      revision: productionWriteSnapshot.orderLineRevision,
    }),
    packingTask: buildPackingTaskRecord({ status: "待打包" }),
    machineCapacityBaseline: buildMachineCapacityBaselineRecord(),
    inventoryReservations: [buildProductionReservationRecord()],
    inventoryAdjustments: [
      {
        inventoryItemId: "INV-LIVE-PROD-001",
        onHandQtyChange: 80,
        reservedQtyChange: 80,
        expectedRevision: productionWriteSnapshot.inventoryRevision,
        expectedOnHandQty: productionWriteSnapshot.onHandQty,
        expectedReservedQty: productionWriteSnapshot.reservedQty,
      },
    ],
    inventoryLedgerEntries: [
      buildProductionInventoryLedgerRecord({ ledgerId: "LEDGER-LIVE-PROD-IN-001", qtyBefore: 20, qtyChange: 80, qtyAfter: 100 }),
      buildProductionInventoryLedgerRecord({
        ledgerId: "LEDGER-LIVE-PROD-RSV-001",
        changeType: "生产完成占用",
        qtyBefore: 0,
        qtyChange: 80,
        qtyAfter: 80,
        sourceType: "production_report_reservation",
      }),
    ],
    operationLog: buildProductionOperationLog({ logId: "LOG-LIVE-PROD-001", action: "complete_production_report" }),
  });
  assert.equal(productionReport.productionTask.taskStatus, "已完成");
  assert.equal(productionReport.workshopReport.machineCount, 8888);
  assert.equal(productionReport.machineCapacityBaseline.dailyCapacityQty, 80);
  assert.equal(productionWorkspace.machineCapacityBaselines[0].sourceKind, "production_report");
  assert.equal(productionReport.inventoryReservations[0].reservedQty, 80);
  assert.equal(
    queryJson("SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = 'INV-LIVE-PROD-001';").onHand,
    100,
  );
  assert.equal(
    queryJson("SELECT json_build_object('machineCount', machine_count) AS result FROM workshop_reports WHERE id = 'WR-LIVE-PROD-001';").machineCount,
    8888,
  );
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_id = 'WR-LIVE-PROD-001';", { capture: true }).trim()), 2);
  assert.equal(
    queryJson(
      "SELECT json_build_object('dailyCapacityQty', daily_capacity_qty, 'sourceKind', source_kind, 'confidence', confidence) AS result FROM machine_capacity_baselines WHERE id = 'MCB-LIVE-PROD-001';",
    ).dailyCapacityQty,
    80,
  );
  const scheduleProductionTaskId = "PT-LIVE-SCHEDULE-001";
  runPsql(
    `INSERT INTO production_tasks (
      id, biz_no, order_line_id, task_type, machine_id, planned_qty, task_status, published_schedule_id, created_by
    ) VALUES (
      '${scheduleProductionTaskId}', '${scheduleProductionTaskId}', 'OL-LIVE-PROD-001', '制袋', 'BAG-LIVE-01', 80,
      '制袋中', 'SCH-LIVE-SCHEDULE-001', 'U-OFFICE-A'
    ) ON CONFLICT (id) DO NOTHING;`,
  );
  runPsql(`
    INSERT INTO print_records (
      id, biz_no, target_type, target_id, template_id, print_action, status, printed_by, printed_at
    ) VALUES (
      'PR-LIVE-F008-001', 'PR-LIVE-F008-001', 'fulfillment', 'F008',
      'tpl-p0-fulfillment', 'first_print', 'printed', 'U-OFFICE-A', '2026-07-02T08:40:00.000Z'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO paper_outbound_documents (
      id, fulfillment_id, print_record_id, document_type, document_version,
      status, printed_by, printed_at, revision
    ) VALUES (
      'POD-LIVE-F008-001', 'F008', 'PR-LIVE-F008-001', 'fulfillment', 1,
      '已打印', 'U-OFFICE-A', '2026-07-02T08:40:00.000Z', 1
    ) ON CONFLICT (id) DO NOTHING;

    UPDATE fulfillment_records
    SET paper_outbound_status = '已打印',
        paper_outbound_document_id = 'POD-LIVE-F008-001',
        updated_at = now()
    WHERE id = 'F008';
  `);
  const scheduleRecordWorkspace = { productionScheduleRecords: [], operationLogs: [] };
  const scheduleRecordResult = await productionScheduleRecordRepository.resequenceMachineQueue({
    workspace: scheduleRecordWorkspace,
    records: [
      buildProductionScheduleRecord({
        scheduleRecordId: "SQR-LIVE-PROD-001",
        productionTaskId: scheduleProductionTaskId,
        orderLineId: "OL-LIVE-PROD-001",
        machineId: "BAG-LIVE-01",
        queueSeq: 1,
      }),
    ],
    operationLog: buildProductionScheduleOperationLog(),
    decisionRecord: buildProductionScheduleDecisionRecord({
      decisionId: "BD-LIVE-SCHEDULE-RESEQ-001",
      businessId: "BAG-LIVE-01",
      operationLogId: "LOG-LIVE-SCHEDULE-RESEQ-001",
    }),
  });
  assert.equal(scheduleRecordResult.productionScheduleRecords[0].productionTaskId, scheduleProductionTaskId);
  assert.equal(scheduleRecordResult.productionScheduleRecords[0].queueSeq, 1);
  assert.equal(scheduleRecordWorkspace.productionScheduleRecords[0].sourceKind, "manual_resequence");
  assert.equal(
    queryJson(
      "SELECT json_build_object('queueSeq', queue_seq, 'updatedBy', sequence_updated_by, 'sourceKind', source_kind) AS result FROM production_schedule_records WHERE id = 'SQR-LIVE-PROD-001';",
    ).updatedBy,
    "U-OFFICE-A",
  );
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-SCHEDULE-RESEQ-001';", { capture: true }).trim()), 1);
  const scheduleRecords = await productionScheduleRecordRepository.listProductionScheduleRecords({
    filters: { machineId: "BAG-LIVE-01", status: "active" },
  });
  assert.equal(scheduleRecords.length, 1);
  assert.equal(scheduleRecords[0].scheduleRecordId, "SQR-LIVE-PROD-001");
  const movedScheduleRecordResult = await productionScheduleRecordRepository.moveMachineQueueItem({
    workspace: scheduleRecordWorkspace,
    productionTask: buildProductionTaskRecord({
      productionTaskId: scheduleProductionTaskId,
      id: scheduleProductionTaskId,
      bizNo: scheduleProductionTaskId,
      taskStatus: "制袋中",
      machineId: "BAG-LIVE-02",
    }),
    expectedRecords: scheduleRecordWorkspace.productionScheduleRecords.filter((record) =>
      ["BAG-LIVE-01", "BAG-LIVE-02"].includes(record.machineId),
    ),
    lockedMachineIds: ["BAG-LIVE-01", "BAG-LIVE-02"],
    records: [
      buildProductionScheduleRecord({
        scheduleRecordId: "SQR-LIVE-PROD-001",
        productionTaskId: scheduleProductionTaskId,
        orderLineId: "OL-LIVE-PROD-001",
        machineId: "BAG-LIVE-01",
        queueSeq: 0,
        status: "moved",
        sourceKind: "machine_reassignment",
        remark: "Postgres live production schedule moved away from source machine",
      }),
      buildProductionScheduleRecord({
        scheduleRecordId: "SQR-BAG-LIVE-02-LIVE-PROD-001",
        productionTaskId: scheduleProductionTaskId,
        orderLineId: "OL-LIVE-PROD-001",
        machineId: "BAG-LIVE-02",
        queueSeq: 1,
        status: "active",
        sourceKind: "machine_reassignment",
        remark: "Postgres live production schedule moved to target machine",
      }),
    ],
    operationLog: buildProductionScheduleOperationLog({
      logId: "LOG-LIVE-SCHEDULE-MOVE-001",
      targetId: scheduleProductionTaskId,
      action: "move_production_schedule_queue_item",
      before: { sourceMachineId: "BAG-LIVE-01" },
      after: {
        targetMachineId: "BAG-LIVE-02",
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
      },
      reason: "Postgres live production schedule move",
    }),
    decisionRecord: buildProductionScheduleDecisionRecord({
      decisionId: "BD-LIVE-SCHEDULE-MOVE-001",
      businessId: scheduleProductionTaskId,
      operationLogId: "LOG-LIVE-SCHEDULE-MOVE-001",
    }),
  });
  assert.equal(movedScheduleRecordResult.productionTask.machineId, "BAG-LIVE-02");
  assert.equal(scheduleRecordWorkspace.productionTasks[0].machineId, "BAG-LIVE-02");
  assert.equal(
    queryJson(`SELECT json_build_object('machineId', machine_id) AS result FROM production_tasks WHERE id = '${scheduleProductionTaskId}';`).machineId,
    "BAG-LIVE-02",
  );
  assert.equal(
    queryJson(
      "SELECT json_build_object('status', schedule_status, 'sourceKind', source_kind, 'queueSeq', queue_seq) AS result FROM production_schedule_records WHERE id = 'SQR-LIVE-PROD-001';",
    ).status,
    "moved",
  );
  const movedTargetScheduleRecords = await productionScheduleRecordRepository.listProductionScheduleRecords({
    filters: { machineId: "BAG-LIVE-02", status: "active" },
  });
  assert.equal(movedTargetScheduleRecords.length, 1);
  assert.equal(movedTargetScheduleRecords[0].productionTaskId, scheduleProductionTaskId);
  assert.equal(movedTargetScheduleRecords[0].sourceKind, "machine_reassignment");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-SCHEDULE-MOVE-001';", { capture: true }).trim()), 1);

  runPsql(
    `UPDATE production_schedule_records
     SET revision = revision + 1, updated_at = now()
     WHERE machine_id = 'BAG-LIVE-02'
       AND production_task_id = '${scheduleProductionTaskId}';`,
  );
  await assert.rejects(
    productionScheduleRecordRepository.resequenceMachineQueue({
      workspace: scheduleRecordWorkspace,
      expectedRecords: movedTargetScheduleRecords,
      lockedMachineIds: ["BAG-LIVE-02"],
      records: movedTargetScheduleRecords,
      operationLog: buildProductionScheduleOperationLog({
        logId: "LOG-LIVE-SCHEDULE-STALE-001",
        targetId: "BAG-LIVE-02",
        reason: "Postgres live stale schedule snapshot",
      }),
      decisionRecord: buildProductionScheduleDecisionRecord({
        decisionId: "BD-LIVE-SCHEDULE-STALE-001",
        businessId: "BAG-LIVE-02",
        operationLogId: "LOG-LIVE-SCHEDULE-STALE-001",
      }),
    }),
    /ERP_PRODUCTION_SCHEDULE_QUEUE_CONCURRENCY_CONFLICT/,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-SCHEDULE-STALE-001';", { capture: true }).trim()),
    0,
  );

  const packingWriteSnapshot = queryJson(
    `SELECT json_build_object(
      'packingTaskRevision', pt.revision,
      'orderLineRevision', ol.revision
    ) AS result
    FROM packing_tasks pt
    JOIN order_lines ol ON ol.id = pt.order_line_id
    WHERE pt.id = 'PKT-LIVE-PROD-001';`,
  );
  const packingCompletion = await productionPackingRepository.completePackingTask({
    workspace: productionWorkspace,
    packingTask: buildPackingTaskRecord({
      status: "已完成",
      actualPackedQty: 80,
      revision: packingWriteSnapshot.packingTaskRevision,
    }),
    packages: [
      buildPackageRecord({ packageId: "PKG-LIVE-PROD-001-1", packageSeq: 1, packageCount: 2, packedQty: 40 }),
      buildPackageRecord({ packageId: "PKG-LIVE-PROD-001-2", packageSeq: 2, packageCount: 2, packedQty: 40 }),
    ],
    fulfillment: null,
    orderLine: buildProductionOrderLineRecord({
      lineStatus: "待打印标签",
      revision: packingWriteSnapshot.orderLineRevision,
    }),
    inventoryLedgerEntries: [
      buildProductionInventoryLedgerRecord({
        ledgerId: "LEDGER-LIVE-PROD-PACK-001",
        changeType: "打包完成确认",
        qtyBefore: 80,
        qtyChange: 0,
        qtyAfter: 80,
        sourceType: "packing_complete",
        sourceId: "PKT-LIVE-PROD-001",
      }),
    ],
    todo: {
      id: "T-LIVE-PACK-REMEDIATION-001",
      type: "出库交付待补建",
      refType: "order_line",
      refId: "OL-LIVE-PROD-001",
      ref: "OL-LIVE-PROD-001",
      priority: "异常",
      status: "未处理",
      summary: "PostgreSQL 打包完成后缺少出库交付记录",
      createdBy: "U-WAREHOUSE-A",
      createdAt: "2026-07-02T12:30:00.000Z",
      updatedAt: "2026-07-02T12:30:00.000Z",
    },
    todoEvent: {
      eventId: "TE-LIVE-PACK-REMEDIATION-001",
      todoId: "T-LIVE-PACK-REMEDIATION-001",
      eventType: "todo_source:packing_completed",
      eventPayload: { packingTaskId: "PKT-LIVE-PROD-001", orderLineId: "OL-LIVE-PROD-001", fulfillmentId: "" },
      operatorId: "U-WAREHOUSE-A",
      occurredAt: "2026-07-02T12:30:00.000Z",
      createdAt: "2026-07-02T12:30:00.000Z",
    },
    operationLog: buildProductionOperationLog({
      logId: "LOG-LIVE-PACK-001",
      targetType: "packing_task",
      targetId: "PKT-LIVE-PROD-001",
      action: "complete_packing_task",
    }),
  });
  postgresAssertions.assertPackingCompletion({ packingCompletion });
  const productionInventoryAfterPacking = queryJson(
    "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = 'INV-LIVE-PROD-001';",
  );
  assert.equal(Number(productionInventoryAfterPacking.onHand), 100);
  assert.equal(Number(productionInventoryAfterPacking.reserved), 80);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM packages WHERE order_line_id = 'OL-LIVE-PROD-001';", { capture: true }).trim()), 2);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM todos WHERE id = 'T-LIVE-PACK-REMEDIATION-001' AND ref_type = 'order_line' AND ref_id = 'OL-LIVE-PROD-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM todo_events WHERE id = 'TE-LIVE-PACK-REMEDIATION-001' AND todo_id = 'T-LIVE-PACK-REMEDIATION-001';", { capture: true }).trim()), 1);
  assert.equal(
    queryJson("SELECT json_build_object('lineStatus', line_status) AS result FROM order_lines WHERE id = 'OL-LIVE-PROD-001';").lineStatus,
    "待打印标签",
  );
  const fulfillmentRepairTimestamp = "2026-07-02T12:35:00.000Z";
  const fulfillmentRepairBeforeTodo = productionWorkspace.todos.find((item) => item.id === "T-LIVE-PACK-REMEDIATION-001");
  const fulfillmentRepairCompletedTodo = {
    ...fulfillmentRepairBeforeTodo,
    status: "已处理",
    handled: true,
    handledBy: "U-OFFICE-A",
    handledAt: fulfillmentRepairTimestamp,
    handlingResult: "已补建出库交付 F-REPAIR-OL-LIVE-PROD-001",
    updatedAt: fulfillmentRepairTimestamp,
  };
  const fulfillmentRepairLabelTodo = {
    id: "T-LABEL-T-LIVE-PACK-REMEDIATION-001",
    type: "待打印标签",
    refType: "fulfillment",
    refId: "F-REPAIR-OL-LIVE-PROD-001",
    ref: "F-REPAIR-OL-LIVE-PROD-001",
    priority: "普通",
    status: "未处理",
    summary: "PostgreSQL 补建出库交付后等待打印标签",
    createdBy: "U-OFFICE-A",
    createdAt: fulfillmentRepairTimestamp,
    updatedAt: fulfillmentRepairTimestamp,
  };
  const fulfillmentRepairRecord = {
    fulfillmentId: "F-REPAIR-OL-LIVE-PROD-001",
    bizNo: "F-REPAIR-OL-LIVE-PROD-001",
    orderLineId: "OL-LIVE-PROD-001",
    customerId: "C-LIVE-REPO",
    customerSnapshot: { name: "Postgres 仓储测试客户" },
    method: "快递快运",
    expectedQty: 80,
    actualQty: 80,
    status: "待打印标签",
    createdBy: "U-OFFICE-A",
    createdAt: fulfillmentRepairTimestamp,
    updatedAt: fulfillmentRepairTimestamp,
  };
  const fulfillmentRepairInput = {
    workspace: productionWorkspace,
    beforeTodo: fulfillmentRepairBeforeTodo,
    expectedUpdatedAt: fulfillmentRepairBeforeTodo.updatedAt,
    completedTodo: fulfillmentRepairCompletedTodo,
    labelTodo: fulfillmentRepairLabelTodo,
    fulfillment: fulfillmentRepairRecord,
    packages: packingCompletion.packages,
    packingTask: packingCompletion.packingTask,
    orderLine: productionWorkspace.orderLines.find((item) => item.id === "OL-LIVE-PROD-001"),
    oldTodoEvent: {
      eventId: "TE-LIVE-FULFILLMENT-REPAIR-001",
      todoId: fulfillmentRepairCompletedTodo.id,
      eventType: "fulfillment_repair_completed",
      eventPayload: { todo: fulfillmentRepairCompletedTodo, fulfillmentId: fulfillmentRepairRecord.fulfillmentId },
      operatorId: "U-OFFICE-A",
      occurredAt: fulfillmentRepairTimestamp,
      createdAt: fulfillmentRepairTimestamp,
    },
    newTodoEvent: {
      eventId: "TE-LIVE-FULFILLMENT-LABEL-001",
      todoId: fulfillmentRepairLabelTodo.id,
      eventType: "todo_source:fulfillment_repaired",
      eventPayload: { todo: fulfillmentRepairLabelTodo, fulfillmentId: fulfillmentRepairRecord.fulfillmentId },
      operatorId: "U-OFFICE-A",
      occurredAt: fulfillmentRepairTimestamp,
      createdAt: fulfillmentRepairTimestamp,
    },
    operationLog: buildProductionOperationLog({
      logId: "LOG-LIVE-FULFILLMENT-REPAIR-001",
      targetType: "todo",
      targetId: fulfillmentRepairCompletedTodo.id,
      action: "repair_missing_fulfillment",
      reason: "PostgreSQL live fulfillment repair",
    }),
    idempotencyKey: "postgres-live-fulfillment-repair-001",
    idempotencyPayload: { todoId: fulfillmentRepairCompletedTodo.id, reason: "PostgreSQL live fulfillment repair" },
  };
  const fulfillmentRepair = await todoFulfillmentRepairRepository.repairMissingFulfillment(fulfillmentRepairInput);
  postgresAssertions.assertFulfillmentRepair({ fulfillmentRepair, fulfillmentRepairRecord });
  const fulfillmentRepairReplay = await todoFulfillmentRepairRepository.repairMissingFulfillment(fulfillmentRepairInput);
  assert.equal(fulfillmentRepairReplay.operationLogId, fulfillmentRepair.operationLogId);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM fulfillment_records WHERE order_line_id = 'OL-LIVE-PROD-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM packages WHERE order_line_id = 'OL-LIVE-PROD-001' AND fulfillment_id = 'F-REPAIR-OL-LIVE-PROD-001';", { capture: true }).trim()), 2);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM todos WHERE id = 'T-LIVE-PACK-REMEDIATION-001' AND status = '已处理';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM todos WHERE id = 'T-LABEL-T-LIVE-PACK-REMEDIATION-001' AND ref_type = 'fulfillment' AND ref_id = 'F-REPAIR-OL-LIVE-PROD-001';", { capture: true }).trim()), 1);
  const coldStartProductionDetail = await productionPackingReadRepository.getProductionTaskDetail({
    productionTaskId: "PT-LIVE-PROD-001",
  });
  postgresAssertions.assertColdStartProductionDetail({ coldStartProductionDetail });
  const coldStartPackingDetail = await productionPackingReadRepository.getPackingTaskDetail({
    packingTaskId: "PKT-LIVE-PROD-001",
  });
  postgresAssertions.assertColdStartPackingDetail({ coldStartPackingDetail });

  const fulfillmentActionWorkspace = {
    fulfillments: [buildFulfillmentActionRecord({ fulfillmentId: "F001", status: "待出库" })],
    printRecords: [],
    fulfillmentExceptions: [],
    todos: [],
    operationLogs: [],
  };
  const fulfillmentAction = await fulfillmentActionRepository.recordFulfillmentAction({
    workspace: fulfillmentActionWorkspace,
    fulfillment: buildFulfillmentActionRecord({ fulfillmentId: "F001", status: "待确认拉走" }),
    printRecord: buildFulfillmentPrintRecord({ printRecordId: "PR-LIVE-FULFILLMENT-001", targetId: "F001" }),
    fulfillmentException: buildFulfillmentExceptionRecord({
      exceptionId: "FEX-LIVE-FULFILLMENT-001",
      fulfillmentId: "F001",
      todoId: "T-LIVE-FULFILLMENT-001",
    }),
    todo: buildFulfillmentTodo({ todoId: "T-LIVE-FULFILLMENT-001", refId: "ORD-0629-001-01" }),
    operationLog: buildFulfillmentOperationLog({
      logId: "LOG-LIVE-FULFILLMENT-ACTION-001",
      action: "create_fulfillment_exception",
      fulfillmentId: "F001",
    }),
  });
  assert.equal(fulfillmentAction.fulfillment.status, "待确认拉走");
  assert.equal(fulfillmentAction.printRecord.printRecordId, "PR-LIVE-FULFILLMENT-001");
  assert.equal(fulfillmentAction.fulfillmentException.exceptionId, "FEX-LIVE-FULFILLMENT-001");
  assert.equal(fulfillmentAction.todo.id, "T-LIVE-FULFILLMENT-001");
  assert.equal(fulfillmentActionWorkspace.printRecords.length, 1);
  assert.equal(
    queryJson("SELECT json_build_object('status', status, 'actualQty', actual_qty) AS result FROM fulfillment_records WHERE id = 'F001';").status,
    "待确认拉走",
  );
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM print_records WHERE id = 'PR-LIVE-FULFILLMENT-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM fulfillment_exceptions WHERE id = 'FEX-LIVE-FULFILLMENT-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM todos WHERE id = 'T-LIVE-FULFILLMENT-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-FULFILLMENT-ACTION-001';", { capture: true }).trim()), 1);

  const liveStatementCandidate = {
    statement: {
      id: "ST-LIVE-FULFILLMENT-CANDIDATE-001",
      customerId: "C-LIVE-REPO",
      status: "待生成",
      receivable: 273,
      received: 0,
      variance: 0,
      period: "2026-07-02 至 2026-07-02",
      lineIds: ["OL-LIVE-CONFIRM-001"],
      sent: false,
      createdBy: "U-FINANCE-A",
      createdAt: "2026-07-02T15:00:00.000Z",
    },
    statementLine: {
      id: "STL-LIVE-FULFILLMENT-CANDIDATE-001",
      statementId: "ST-LIVE-FULFILLMENT-CANDIDATE-001",
      orderLineId: "OL-LIVE-CONFIRM-001",
      fulfillmentId: "F-LIVE-CONFIRM-001",
      deliveredQty: 273,
      chargeableQty: 273,
      freeQty: 0,
      amount: 273,
      adjustmentAmount: 0,
      finalAmount: 273,
      createdAt: "2026-07-02T15:00:00.000Z",
    },
  };
  const fulfillmentStatementWorkspace = {
    fulfillments: [],
    statements: [],
    statementLines: [],
    operationLogs: [],
  };
  const liveFulfillmentStatementSnapshot = queryJson(
    "SELECT json_build_object('revision', revision) AS result FROM fulfillment_records WHERE id = 'F-LIVE-CONFIRM-001';",
  );
  const fulfillmentStatementAction = await fulfillmentActionRepository.recordFulfillmentAction({
    workspace: fulfillmentStatementWorkspace,
    fulfillment: buildFulfillmentActionRecord({
      fulfillmentId: "F-LIVE-CONFIRM-001",
      orderLineId: "OL-LIVE-CONFIRM-001",
      customerId: "C-LIVE-REPO",
      expectedQty: 273,
      actualQty: 273,
      status: "已交付",
      revision: liveFulfillmentStatementSnapshot.revision,
      deliveredAt: "2026-07-02T15:00:00.000Z",
      confirmedAt: "2026-07-02T15:00:00.000Z",
    }),
    statementCandidate: liveStatementCandidate,
    operationLog: buildFulfillmentOperationLog({
      logId: "LOG-LIVE-FULFILLMENT-STATEMENT-001",
      action: "complete_fulfillment",
      fulfillmentId: "F-LIVE-CONFIRM-001",
    }),
  });
  assert.equal(fulfillmentStatementAction.statement.id, "ST-LIVE-FULFILLMENT-CANDIDATE-001");
  assert.equal(fulfillmentStatementAction.statement.receivable, 273);
  assert.equal(fulfillmentStatementAction.statementLine.orderLineId, "OL-LIVE-CONFIRM-001");
  assert.equal(fulfillmentStatementWorkspace.statements[0].lineIds[0], "OL-LIVE-CONFIRM-001");
  assert.equal(
    Number(runPsql("SELECT receivable_amount FROM statements WHERE id = 'ST-LIVE-FULFILLMENT-CANDIDATE-001';", { capture: true }).trim()),
    273,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM statement_lines WHERE id = 'STL-LIVE-FULFILLMENT-CANDIDATE-001';", { capture: true }).trim()),
    1,
  );

  const deliveryEvidenceAfter = buildFulfillmentActionRecord({
    fulfillmentId: "F002",
    orderLineId: "ORD-0629-002-01",
    customerId: "C002",
    method: "送货",
    expectedQty: 1200,
    actualQty: 1200,
    status: "已交付",
    deliveredAt: "2026-07-02T09:30:00.000Z",
    confirmedAt: "2026-07-02T09:30:00.000Z",
    watermarkedPhotoAttached: true,
    watermarkedPhotoAttachmentId: "ATT-LIVE-DELIVERY-WM-001",
    watermarkedPhotoUrl: "https://assets.example.test/live-delivery-wm.jpg",
    watermarkId: "WM-LIVE-DELIVERY-001",
    watermarkText: "李四电商 / 厚街仓库门岗 / 水印 WM-LIVE-DELIVERY-001",
    watermarkCapturedAt: "2026-07-02T09:10:00.000Z",
    watermarkLocationLabel: "厚街仓库门岗",
    watermarkGeoPoint: "22.920000,113.680000",
    watermarkAddress: "厚街仓库 A 区",
    watermarkOperatorId: "U-DRIVER-A",
    watermarkOperatorName: "司机A",
    signaturePhotoAttached: true,
    signaturePhotoAttachmentId: "ATT-LIVE-DELIVERY-SIGN-001",
    deliveryEvidenceReviewStatus: "需重拍",
    deliveryEvidenceReviewedAt: "2026-07-02T10:15:00.000Z",
    deliveryEvidenceReviewedBy: "办公室A",
    deliveryEvidenceReviewedByUserId: "U-OFFICE-A",
    deliveryEvidenceIssueReason: "水印定位不清晰",
    deliveryEvidenceReviewRemark: "请司机补拍",
    deliveryEvidenceReviewUpdatedAt: "2026-07-02T10:15:00.000Z",
  });
  const deliveryEvidenceWorkspace = {
    fulfillments: [buildFulfillmentActionRecord({ fulfillmentId: "F002", status: "已备货" })],
    printRecords: [],
    fulfillmentExceptions: [],
    todos: [],
    operationLogs: [],
  };
  const deliveryEvidenceAction = await fulfillmentActionRepository.recordFulfillmentAction({
    workspace: deliveryEvidenceWorkspace,
    fulfillment: deliveryEvidenceAfter,
    todo: {
      id: "T-LIVE-DELIVERY-EVIDENCE-RETAKE-001",
      type: "照片待重拍",
      customerId: "C002",
      ref: "ORD-0629-002-01",
      summary: "李四电商送达证据需重拍：水印定位不清晰",
      latest: "2026-07-02T15:00:00.000Z",
      urgency: "异常",
      impact: "需司机补拍水印照片",
      createdBy: "U-OFFICE-A",
    },
    operationLog: {
      id: "LOG-LIVE-DELIVERY-EVIDENCE-REVIEW-001",
      targetType: "fulfillment",
      targetId: "F002",
      action: "reject_delivery_evidence",
      before: buildFulfillmentActionRecord({ fulfillmentId: "F002", status: "已交付" }),
      after: deliveryEvidenceAfter,
      reason: "水印定位不清晰",
      operatorId: "U-OFFICE-A",
      pageKey: "api",
      occurredAt: "2026-07-02T10:15:00.000Z",
      createdAt: "2026-07-02T10:15:00.000Z",
    },
  });
  postgresAssertions.assertDeliveryEvidenceAction({ deliveryEvidenceAction });
  const persistedDeliveryEvidence = queryJson(
    `SELECT json_build_object(
      'watermarkedPhotoAttached', watermarked_photo_attached,
      'watermarkedPhotoAttachmentId', watermarked_photo_attachment_id,
      'watermarkId', watermark_id,
      'watermarkGeoPoint', watermark_geo_point,
      'signaturePhotoAttachmentId', signature_photo_attachment_id,
      'reviewStatus', delivery_evidence_review_status,
      'reviewedByUserId', delivery_evidence_reviewed_by_user_id,
      'issueReason', delivery_evidence_issue_reason
    ) AS result FROM fulfillment_records WHERE id = 'F002';`,
  );
  assert.equal(persistedDeliveryEvidence.watermarkedPhotoAttached, true);
  assert.equal(persistedDeliveryEvidence.watermarkedPhotoAttachmentId, "ATT-LIVE-DELIVERY-WM-001");
  assert.equal(persistedDeliveryEvidence.watermarkId, "WM-LIVE-DELIVERY-001");
  assert.equal(persistedDeliveryEvidence.watermarkGeoPoint, "22.920000,113.680000");
  assert.equal(persistedDeliveryEvidence.signaturePhotoAttachmentId, "ATT-LIVE-DELIVERY-SIGN-001");
  assert.equal(persistedDeliveryEvidence.reviewStatus, "需重拍");
  assert.equal(persistedDeliveryEvidence.reviewedByUserId, "U-OFFICE-A");
  assert.equal(persistedDeliveryEvidence.issueReason, "水印定位不清晰");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM todos WHERE id = 'T-LIVE-DELIVERY-EVIDENCE-RETAKE-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-DELIVERY-EVIDENCE-REVIEW-001';", { capture: true }).trim()), 1);

  const repositoryDeviceFieldTest = await driverDeviceFieldTestRepository.recordDriverDeviceFieldTest({
    workspace: { fulfillments: [], operationLogs: [] },
    record: {
      recordId: "DQA-LIVE-REPO-F002",
      fulfillmentId: "F002",
      orderLineId: "ORD-0629-002-01",
      driverId: "U-DRIVER-A",
      operatorId: "U-DRIVER-A",
      operatorName: "司机A",
      checkedAt: "2026-07-02T10:45:00.000Z",
      deviceLabel: "iPhone 15 Pro",
      browserLabel: "Safari 17",
      userAgent: "Mozilla/5.0 Safari/604.1",
      language: "zh-CN",
      summary: { label: "通过 3/6，异常 1", passedCount: 3, issueCount: 1 },
      checks: [
        { key: "camera_permission", status: "passed" },
        { key: "watermark_photo", status: "passed" },
        { key: "package_label_scan", status: "passed" },
        { key: "geolocation", status: "blocked" },
      ],
      packageLabelScanSample: {
        sampleId: "DPLS-LIVE-REPO-F002-PKG-1",
        fulfillmentId: "F002",
        expectedPackageId: "PKG-LIVE-F002-1",
        scannedText: "LABEL:PKG-LIVE-F002-1",
        matchedPackageId: "PKG-LIVE-F002-1",
        method: "scanner_wedge",
        methodLabel: "扫码枪/键盘口",
        result: "matched",
        resultLabel: "已匹配",
        tone: "success",
        message: "repository live package label sample",
        checkedAt: "2026-07-02T10:44:59.000Z",
      },
      note: "repository live check",
    },
    operationLog: {
      id: "LOG-LIVE-DQA-REPO-001",
      targetType: "fulfillment",
      targetId: "F002",
      action: "driver_record_device_field_test",
      before: null,
      after: { recordId: "DQA-LIVE-REPO-F002" },
      reason: "通过 3/6，异常 1",
      operatorId: "U-DRIVER-A",
      pageKey: "api",
      occurredAt: "2026-07-02T10:45:01.000Z",
      createdAt: "2026-07-02T10:45:01.000Z",
    },
  });
  assert.equal(repositoryDeviceFieldTest.record.recordId, "DQA-LIVE-REPO-F002");
  assert.equal(repositoryDeviceFieldTest.record.packageLabelScanSample.matchedPackageId, "PKG-LIVE-F002-1");
  assert.equal(repositoryDeviceFieldTest.operationLogId, "LOG-LIVE-DQA-REPO-001");
  const persistedDeviceFieldTest = queryJson(
    "SELECT json_build_object('recordId', id, 'summary', summary_json->>'label', 'sampleMatchedPackageId', summary_json->'packageLabelScanSample'->>'matchedPackageId', 'operationLogId', operation_log_id) AS result FROM driver_device_field_tests WHERE id = 'DQA-LIVE-REPO-F002';",
  );
  assert.equal(persistedDeviceFieldTest.recordId, "DQA-LIVE-REPO-F002");
  assert.equal(persistedDeviceFieldTest.summary, "通过 3/6，异常 1");
  assert.equal(persistedDeviceFieldTest.sampleMatchedPackageId, "PKG-LIVE-F002-1");
  assert.equal(persistedDeviceFieldTest.operationLogId, "LOG-LIVE-DQA-REPO-001");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-DQA-REPO-001';", { capture: true }).trim()), 1);

  const driverDeliveryTaskList = await driverDeliveryTaskReadRepository.listDriverDeliveryTasks({
    query: { driverId: "U-DRIVER-A", status: "已完成", pageSize: 5 },
    operatorId: "U-DRIVER-A",
  });
  assert.equal(driverDeliveryTaskList.metrics.completedCount >= 1, true);
  assert.equal(driverDeliveryTaskList.items.some((item) => item.fulfillmentId === "F002"), true);
  const driverDeliveryTaskDetail = await driverDeliveryTaskReadRepository.getDriverDeliveryTask({
    fulfillmentId: "F002",
    operatorId: "U-DRIVER-A",
  });
  assert.equal(driverDeliveryTaskDetail.status, "已完成");
  assert.equal(driverDeliveryTaskDetail.driverId, "U-DRIVER-A");
  assert.equal(driverDeliveryTaskDetail.routeNo, "虎门线-A");
  assert.equal(driverDeliveryTaskDetail.routeSequence, 2);
  assert.equal(driverDeliveryTaskDetail.watermarkedPhotoAttachmentId, "ATT-LIVE-DELIVERY-WM-001");
  assert.equal(driverDeliveryTaskDetail.deliveryEvidenceReviewStatus, "需重拍");
  assert.equal(driverDeliveryTaskDetail.deviceFieldTestRecord.recordId, "DQA-LIVE-REPO-F002");
  assert.equal(driverDeliveryTaskDetail.deviceFieldTestRecord.packageLabelScanSample.matchedPackageId, "PKG-LIVE-F002-1");
  assert.equal(driverDeliveryTaskDetail.deviceFieldTestSummary.label, "通过 3/6，异常 1");
  assert.match(driverDeliveryTaskDetail.goodsSummary, /1200个/);
  assert.equal(driverDeliveryTaskDetail.packageChecklist.length, 3);
  assert.equal(driverDeliveryTaskDetail.packageChecklist[0].packageId, "PKG-LIVE-F002-1");
  assert.equal(driverDeliveryTaskDetail.packageChecklist[0].labelText, "第 1/3 包");
  assert.equal(driverDeliveryTaskDetail.packageChecklist[0].quantityText, "400个");
  assert.equal(driverDeliveryTaskDetail.packageChecklist[0].status, "已打印");

  const statementExportWorkspace = { statementExportFiles: [], statementLines: [], operationLogs: [] };
  const exportFile = buildStatementExportFile({
    statementId: "ST-LIVE-REPO-001",
    downloadToken: "DL-LIVE-EXPORT-001",
    operationLogId: "LOG-LIVE-EXPORT-001",
  });
  const exportStatementLines = buildStatementExportLines({
    statementId: "ST-LIVE-REPO-001",
    orderLineId: "OL-LIVE-EXPORT-LINE-001",
    fulfillmentId: "F-LIVE-EXPORT-001",
  });
  const exportTransaction = await exportRepository.createExportFile({
    workspace: statementExportWorkspace,
    exportFile,
    statementLines: exportStatementLines,
    operationLog: buildOperationLog({
      logId: "LOG-LIVE-EXPORT-001",
      action: "preview_statement",
      before: null,
      after: { id: "ST-LIVE-REPO-001", downloadToken: "DL-LIVE-EXPORT-001" },
    }),
  });
  assert.equal(exportTransaction.exportFile.downloadToken, "DL-LIVE-EXPORT-001");
  assert.equal(exportTransaction.statementLines.length, 1);
  assert.equal(statementExportWorkspace.statementExportFiles.length, 1);
  assert.equal(statementExportWorkspace.statementLines.length, 1);
  assert.equal(
    queryJson("SELECT json_build_object('downloadToken', download_token, 'contentLength', length(content_text)) AS result FROM statement_export_files WHERE id = 'DL-LIVE-EXPORT-001';").downloadToken,
    "DL-LIVE-EXPORT-001",
  );
  assert.equal(
    Number(
      runPsql("SELECT COUNT(*) FROM statement_lines WHERE statement_id = 'ST-LIVE-REPO-001' AND order_line_id = 'OL-LIVE-EXPORT-LINE-001';", {
        capture: true,
      }).trim(),
    ),
    1,
  );
  const listedExports = await exportRepository.listExportFiles({ statementId: "ST-LIVE-REPO-001" });
  assert.equal(listedExports.length, 1);
  assert.equal(listedExports[0].content, "");
  const foundExport = await exportRepository.findExportFileByToken({
    statementId: "ST-LIVE-REPO-001",
    downloadToken: "DL-LIVE-EXPORT-001",
  });
  assert.equal(Buffer.from(foundExport.content, "base64").toString("utf8"), "Postgres Export Live XLSX");
  assert.equal(foundExport.contentEncoding, "base64");
  assert.equal(
    (await exportRepository.findLatestExportFile({ statementId: "ST-LIVE-REPO-001", previewType: "customer_send" }))
      .downloadToken,
    "DL-LIVE-EXPORT-001",
  );

  const printDeviceWorkspace = { printDevices: [], operationLogs: [] };
  const printDevice = buildPrintDeviceRecord({
    printDeviceId: "PRN-LIVE-REPO-001",
    name: "Postgres O'Brien 标签机",
  });
  const printDeviceTransaction = await printDeviceRepository.upsertPrintDevice({
    workspace: printDeviceWorkspace,
    printDevice,
    operationLog: buildPrintDeviceOperationLog({
      logId: "LOG-LIVE-PRINT-DEVICE-001",
      printDevice,
    }),
  });
  assert.equal(printDeviceTransaction.printDevice.printDeviceId, "PRN-LIVE-REPO-001");
  assert.equal(printDeviceTransaction.operationLogId, "LOG-LIVE-PRINT-DEVICE-001");
  assert.equal(printDeviceWorkspace.printDevices.length, 1);
  assert.equal(
    queryJson(
      "SELECT json_build_object('name', name, 'paperWidthMm', paper_width_mm) AS result FROM printer_devices WHERE id = 'PRN-LIVE-REPO-001';",
    ).paperWidthMm,
    76,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-PRINT-DEVICE-001';", { capture: true }).trim()),
    1,
  );
  const paperPrintDevice = {
    ...buildPrintDeviceRecord({
      printDeviceId: "PRN-LIVE-PAPER-001",
      name: "Postgres live 针式出库单打印机",
    }),
    deviceType: "dot_matrix_printer",
    connectionUri: "system://postgres-live-paper",
    supportedDocumentTypes: ["pickup_note", "delivery_note", "outbound_note"],
    defaultDocumentTypes: ["pickup_note"],
    paperWidthMm: 241,
    paperHeightMm: 140,
    paperName: "241x140 连续纸",
    isContinuous: true,
    settings: {
      driverMode: "system_printer",
      source: "postgres-live-paper",
    },
  };
  const paperPrintDeviceTransaction = await printDeviceRepository.upsertPrintDevice({
    workspace: printDeviceWorkspace,
    printDevice: paperPrintDevice,
    operationLog: buildPrintDeviceOperationLog({
      logId: "LOG-LIVE-PRINT-DEVICE-PAPER-001",
      printDevice: paperPrintDevice,
    }),
  });
  assert.equal(paperPrintDeviceTransaction.printDevice.printDeviceId, "PRN-LIVE-PAPER-001");
  const listedPrintDevices = await printDeviceRepository.listPrintDevices({
    filters: { documentType: "express_ltl_label", status: "active" },
  });
  assert.equal(listedPrintDevices.length, 1);
  assert.equal(listedPrintDevices[0].printDeviceId, "PRN-LIVE-REPO-001");

  const printJobWorkspace = { printJobs: [], operationLogs: [] };
  const printJob = buildPrintJobRecord({
    printJobId: "PJ-LIVE-REPO-001",
    printRecordId: "PR-LIVE-FULFILLMENT-001",
    printDeviceId: "PRN-LIVE-REPO-001",
    jobStatus: "queued",
    driverMode: "system_printer",
  });
  const printJobTransaction = await printJobRepository.createPrintJob({
    workspace: printJobWorkspace,
    printJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-PRINT-JOB-001",
      printJob,
      action: "create_print_job",
    }),
  });
  assert.equal(printJobTransaction.printJob.printJobId, "PJ-LIVE-REPO-001");
  assert.equal(printJobTransaction.operationLogId, "LOG-LIVE-PRINT-JOB-001");
  const failedPrintJob = {
    ...printJobTransaction.printJob,
    jobStatus: "failed",
    finishedAt: "2026-07-02T10:40:00.000Z",
    errorCode: "LIVE_DRIVER_TIMEOUT",
    errorMessage: "Live check simulated driver timeout",
    updatedAt: "2026-07-02T10:40:00.000Z",
  };
  const failedPrintJobTransaction = await printJobRepository.updatePrintJob({
    workspace: printJobWorkspace,
    printJob: failedPrintJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-PRINT-JOB-FAILED-001",
      printJob: failedPrintJob,
      action: "update_print_job_status",
      before: printJobTransaction.printJob,
    }),
  });
  assert.equal(failedPrintJobTransaction.printJob.jobStatus, "failed");
  assert.equal(failedPrintJobTransaction.printJob.errorCode, "LIVE_DRIVER_TIMEOUT");
  const retryPrintJob = buildPrintJobRecord({
    printJobId: "PJ-LIVE-REPO-001-RETRY-2",
    printRecordId: "PR-LIVE-FULFILLMENT-001",
    printDeviceId: "PRN-LIVE-REPO-001",
    jobStatus: "queued",
    driverMode: "system_printer",
    attemptNo: 2,
    sourcePrintJobId: "PJ-LIVE-REPO-001",
  });
  const retryPrintJobTransaction = await printJobRepository.createPrintJob({
    workspace: printJobWorkspace,
    printJob: retryPrintJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-PRINT-JOB-RETRY-001",
      printJob: retryPrintJob,
      action: "retry_print_job",
      before: failedPrintJobTransaction.printJob,
    }),
  });
  assert.equal(retryPrintJobTransaction.printJob.sourcePrintJobId, "PJ-LIVE-REPO-001");
  assert.equal(retryPrintJobTransaction.printJob.attemptNo, 2);
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM print_jobs WHERE print_record_id = 'PR-LIVE-FULFILLMENT-001';", { capture: true }).trim()),
    2,
  );
  assert.equal(
    (await printJobRepository.listPrintJobs({ filters: { printRecordId: "PR-LIVE-FULFILLMENT-001" } })).length,
    2,
  );

  const printBatchWorkspace = { printBatchRecords: [], operationLogs: [] };
  const printBatchRecord = buildPrintBatchRecord({
    printBatchId: "PB-LIVE-REPO-001",
    todoId: "T-LIVE-PRINT-001",
    operatorName: "O'Brien live print",
  });
  const printBatchTransaction = await printBatchRepository.createPrintBatchRecord({
    workspace: printBatchWorkspace,
    printBatchRecord,
    operationLog: buildPrintBatchOperationLog({
      logId: "LOG-LIVE-PRINT-BATCH-001",
      printBatchRecord,
    }),
  });
  assert.equal(printBatchTransaction.printBatchRecord.printBatchId, "PB-LIVE-REPO-001");
  assert.equal(printBatchTransaction.operationLogId, "LOG-LIVE-PRINT-BATCH-001");
  assert.equal(printBatchWorkspace.printBatchRecords.length, 1);
  assert.equal(
    queryJson(
      "SELECT json_build_object('status', status, 'pending', pending_package_ids[1]) AS result FROM print_batch_records WHERE id = 'PB-LIVE-REPO-001';",
    ).pending,
    "PKG-LIVE-PRINT-002",
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-PRINT-BATCH-001';", { capture: true }).trim()),
    1,
  );
  const listedPrintBatches = await printBatchRepository.listPrintBatchRecords({ filters: { todoId: "T-LIVE-PRINT-001" } });
  assert.equal(listedPrintBatches.length, 1);
  assert.equal(listedPrintBatches[0].pendingPackageIds[0], "PKG-LIVE-PRINT-002");

  const sendBefore = buildStatement({
    id: "ST-LIVE-SEND-001",
    customerId: "C-LIVE-REPO",
    status: "待生成",
    received: 0,
    variance: 273,
  });
  const sendAfter = buildStatement({
    id: "ST-LIVE-SEND-001",
    customerId: "C-LIVE-REPO",
    status: "已发送待回款",
    received: 0,
    variance: 273,
  });
  const sendWorkspace = { statements: [sendBefore], statementSendRecords: [], statementConfirmationRecords: [], operationLogs: [] };
  const sendTransaction = await sendTransactionRepository.markStatementSent({
    workspace: sendWorkspace,
    statements: [sendAfter],
    statement: sendAfter,
    sendRecord: buildSendRecord({
      sendRecordId: "SEND-LIVE-TXN-001",
      statementId: "ST-LIVE-SEND-001",
      exportFileId: "DL-LIVE-SEND-001",
      operatorId: "U-FINANCE-A",
    }),
    operationLog: buildOperationLog({ logId: "LOG-LIVE-SEND-TXN-001", action: "mark_statement_sent", before: sendBefore, after: sendAfter }),
    idempotencyKey: "statement-send-repository-live-001",
    idempotencyPayload: { statementId: "ST-LIVE-SEND-001", channel: "wechat", operatorId: "U-FINANCE-A" },
  });
  const replayedSendTransaction = await sendTransactionRepository.markStatementSent({
    workspace: sendWorkspace,
    statements: [sendAfter],
    statement: sendAfter,
    sendRecord: buildSendRecord({
      sendRecordId: "SEND-LIVE-TXN-001",
      statementId: "ST-LIVE-SEND-001",
      exportFileId: "DL-LIVE-SEND-001",
      operatorId: "U-FINANCE-A",
    }),
    operationLog: buildOperationLog({ logId: "LOG-LIVE-SEND-TXN-001", action: "mark_statement_sent", before: sendBefore, after: sendAfter }),
    idempotencyKey: "statement-send-repository-live-001",
    idempotencyPayload: { statementId: "ST-LIVE-SEND-001", channel: "wechat", operatorId: "U-FINANCE-A" },
  });
  assert.equal(replayedSendTransaction.sendRecord.sendRecordId, sendTransaction.sendRecord.sendRecordId);
  assert.equal(sendTransaction.statement.status, "已发送待回款");
  assert.equal(sendTransaction.sendRecord.exportFileId, "DL-LIVE-SEND-001");
  assert.equal(queryJson("SELECT json_build_object('status', status, 'lastSentAt', last_sent_at) AS result FROM statements WHERE id = 'ST-LIVE-SEND-001';").status, "已发送待回款");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM statement_send_records WHERE id = 'SEND-LIVE-TXN-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-SEND-TXN-001';", { capture: true }).trim()), 1);

  const receiptRecord = {
    ...sendTransaction.sendRecord,
    receiptStatus: "read",
    receiptAt: "2026-07-01T11:00:00.000Z",
    receiptBy: "U-FINANCE-A",
    receiptNote: "postgres live customer read receipt",
  };
  const receiptTransaction = await sendTransactionRepository.markStatementSendReceipt({
    workspace: sendWorkspace,
    sendRecord: receiptRecord,
    operationLog: {
      id: "LOG-LIVE-SEND-RECEIPT-TXN-001",
      targetType: "statement_send_record",
      targetId: "SEND-LIVE-TXN-001",
      action: "mark_statement_send_receipt",
      before: sendTransaction.sendRecord,
      after: receiptRecord,
      reason: "postgres live customer read receipt",
      operatorId: "U-FINANCE-A",
      pageKey: "api",
      occurredAt: "2026-07-01T11:00:00.000Z",
      createdAt: "2026-07-01T11:00:00.000Z",
    },
    idempotencyKey: "statement-receipt-repository-live-001",
    idempotencyPayload: { sendRecordId: "SEND-LIVE-TXN-001", receiptStatus: "read", operatorId: "U-FINANCE-A" },
  });
  assert.equal(receiptTransaction.sendRecord.receiptStatus, "read");
  assert.equal(
    queryJson("SELECT json_build_object('receiptStatus', receipt_status, 'receiptBy', receipt_by) AS result FROM statement_send_records WHERE id = 'SEND-LIVE-TXN-001';").receiptStatus,
    "read",
  );
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-SEND-RECEIPT-TXN-001';", { capture: true }).trim()), 1);

  const confirmationStatement = buildStatement({
    id: "ST-LIVE-SEND-001",
    customerId: "C-LIVE-REPO",
    status: "客户已确认",
    received: 0,
    variance: 273,
    revision: sendTransaction.statement.revision,
  });
  const confirmationSendRecord = {
    ...receiptTransaction.sendRecord,
    receiptStatus: "confirmed",
    receiptAt: "2026-07-01T11:20:00.000Z",
    receiptBy: "U-FINANCE-A",
    receiptNote: "postgres live customer confirmed statement",
  };
  const confirmationRecord = {
    confirmationRecordId: "SCONF-LIVE-TXN-001",
    statementId: "ST-LIVE-SEND-001",
    sendRecordId: "SEND-LIVE-TXN-001",
    confirmationType: "customer_reply",
    channel: "wechat",
    confirmedByCustomer: "客户财务",
    confirmedAt: "2026-07-01T11:20:00.000Z",
    content: "postgres live customer confirmed statement",
    attachmentIds: ["ATT-LIVE-CONFIRM-001"],
    recordedBy: "U-FINANCE-A",
  };
  const confirmationTransaction = await sendTransactionRepository.recordStatementCustomerConfirmation({
    workspace: sendWorkspace,
    statements: [confirmationStatement],
    statement: confirmationStatement,
    sendRecord: confirmationSendRecord,
    confirmationRecord,
    operationLog: {
      id: "LOG-LIVE-SEND-CONFIRM-TXN-001",
      targetType: "statement",
      targetId: "ST-LIVE-SEND-001",
      action: "record_statement_customer_confirmation",
      before: { statement: sendAfter, sendRecord: receiptTransaction.sendRecord },
      after: { statement: confirmationStatement, sendRecord: confirmationSendRecord, confirmationRecord },
      reason: "postgres live customer confirmed statement",
      operatorId: "U-FINANCE-A",
      pageKey: "api",
      occurredAt: "2026-07-01T11:20:00.000Z",
      createdAt: "2026-07-01T11:20:00.000Z",
    },
    idempotencyKey: "statement-confirmation-repository-live-001",
    idempotencyPayload: {
      statementId: "ST-LIVE-SEND-001",
      sendRecordId: "SEND-LIVE-TXN-001",
      content: "postgres live customer confirmed statement",
      operatorId: "U-FINANCE-A",
    },
  });
  assert.equal(confirmationTransaction.statement.status, "客户已确认");
  assert.equal(confirmationTransaction.sendRecord.receiptStatus, "confirmed");
  assert.equal(confirmationTransaction.confirmationRecord.confirmationRecordId, "SCONF-LIVE-TXN-001");
  assert.equal(queryJson("SELECT json_build_object('status', status) AS result FROM statements WHERE id = 'ST-LIVE-SEND-001';").status, "客户已确认");
  assert.equal(
    queryJson("SELECT json_build_object('receiptStatus', receipt_status) AS result FROM statement_send_records WHERE id = 'SEND-LIVE-TXN-001';").receiptStatus,
    "confirmed",
  );
  assert.equal(
    queryJson("SELECT json_build_object('content', content, 'attachmentIds', attachment_ids_json) AS result FROM statement_confirmation_records WHERE id = 'SCONF-LIVE-TXN-001';").attachmentIds[0],
    "ATT-LIVE-CONFIRM-001",
  );
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-SEND-CONFIRM-TXN-001';", { capture: true }).trim()), 1);
  await assert.rejects(
    () =>
      sendTransactionRepository.markStatementSendReceipt({
        workspace: sendWorkspace,
        sendRecord: { ...receiptRecord, receiptStatus: "no_response", receiptNote: "stale receipt must roll back" },
        operationLog: {
          id: "LOG-LIVE-SEND-STALE-TXN-001",
          targetType: "statement_send_record",
          targetId: "SEND-LIVE-TXN-001",
          action: "mark_statement_send_receipt",
          before: receiptTransaction.sendRecord,
          after: receiptRecord,
          reason: "stale receipt must roll back",
          operatorId: "U-FINANCE-A",
          pageKey: "api",
          occurredAt: "2026-07-01T11:30:00.000Z",
          createdAt: "2026-07-01T11:30:00.000Z",
        },
        idempotencyKey: "statement-receipt-stale-live-001",
        idempotencyPayload: { sendRecordId: "SEND-LIVE-TXN-001", receiptStatus: "no_response" },
      }),
    (error) => error?.statusCode === 409 && error?.code === "BUSINESS_WRITE_CONFLICT",
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-SEND-STALE-TXN-001';", { capture: true }).trim()),
    0,
  );
}
