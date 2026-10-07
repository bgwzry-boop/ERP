import { checkPayrollApi } from "./apiChecks/payroll.mjs";
import { checkOrderLineApi, checkOrderLineMutationsApi, checkOrderDraftConcurrencyApi, checkOrderDraftResumeApi } from "./apiChecks/orderLines.mjs";
import { checkDriverApi } from "./apiChecks/driver.mjs";
import { checkPrintApi } from "./apiChecks/printing.mjs";
import { checkTodoApi } from "./apiChecks/todos.mjs";
import { checkAttachmentApi } from "./apiChecks/attachments.mjs";
import { checkProductionApi, checkProductionScheduleQueueApi } from "./apiChecks/production.mjs";
import { checkStatementApi } from "./apiChecks/statements.mjs";
import { checkFulfillmentApi, checkLegacyFulfillmentApi, checkCancelledFulfillmentApi } from "./apiChecks/fulfillment.mjs";
import { checkInventoryApi } from "./apiChecks/inventory.mjs";
import { checkOrderApi } from "./apiChecks/orders.mjs";
import assert from "node:assert/strict";
import { postgresAssertions } from "./assertions.mjs";
import { createApiServer } from "../../server/apiServer.mjs";
import { createPostgresPoolClient } from "../../server/postgresPoolClient.mjs";
import { createPostgresStatementSendTransactionRepository } from "../../server/statementSendTransactionRepository.mjs";
import { createPostgresStatementExportRepository } from "../../server/statementExportRepository.mjs";
import { createPostgresOrderDraftRepository } from "../../server/orderDraftRepository.mjs";
import { createPostgresOrderConfirmationTransactionRepository } from "../../server/orderConfirmationTransactionRepository.mjs";
import { createPostgresOrderLineVoidTransactionRepository } from "../../server/orderLineVoidTransactionRepository.mjs";
import { createPostgresOrderLineQuantityAdjustmentTransactionRepository } from "../../server/orderLineQuantityAdjustmentTransactionRepository.mjs";
import { createPostgresProductionPackingTransactionRepository } from "../../server/productionPackingTransactionRepository.mjs";
import { createPostgresProductionScheduleRecordRepository } from "../../server/productionScheduleRecordRepository.mjs";
import { createPostgresPrintBatchRepository } from "../../server/printBatchRepository.mjs";
import { createPostgresPrintJobRepository } from "../../server/printJobRepository.mjs";
import { createPostgresTodoActionRepository } from "../../server/todoActionRepository.mjs";
import { createPostgresInventoryCorrectionTransactionRepository } from "../../server/inventoryCorrectionTransactionRepository.mjs";
import { createPostgresProductionFinishedGoodsPhotoTransactionRepository } from "../../server/productionFinishedGoodsPhotoTransactionRepository.mjs";
import { createPrintDriverAdapter } from "../../server/printDriverAdapter.mjs";
import { v1PersistencePostgresRepositoryOptionKeys } from "../../server/v1PersistenceProfile.mjs";
import { withLocalRepositoryFixture } from "../helpers/localRepositoryFixture.mjs";
import pg from "pg";

const { Pool } = pg;

export async function checkApiWithPostgresRepositories(runtime) {
  const { storageRoot, resolveLiveDatabaseUrl, queryJson, runPsql, sqlLiteral,
    liveRuntimeAuthSecret, liveRuntimeUserId, liveRuntimeLoginName, liveRuntimePassword,
    liveOfficeRuntimeUserId, liveOfficeRuntimeLoginName, liveOfficeRuntimePassword,
    liveManagerRuntimeUserId, liveManagerRuntimeLoginName, liveManagerRuntimePassword } = runtime;
  const printJobRepository = createPostgresPrintJobRepository({ queryJson });
  runtime.orderDraftPool = new Pool({ connectionString: resolveLiveDatabaseUrl(), max: 4, connectionTimeoutMillis: 5_000 });
  const apiPostgresClient = createPostgresPoolClient({ pool: runtime.orderDraftPool });
  const orderDraftRepository = createPostgresOrderDraftRepository({
    postgresClient: apiPostgresClient,
  });
  const postgresOrderConfirmationRepository = createPostgresOrderConfirmationTransactionRepository({
    postgresClient: apiPostgresClient,
  });
  const orderConfirmationTransactionRepository = {
    kind: "postgres",
    confirmOrder(input) {
      const conversion = input.inventoryReservations?.find((reservation) => reservation.convertFromTemporaryHold);
      if (conversion) {
        assert.ok(conversion.sourceIntentId);
        assert.equal(conversion.inventoryDeltaQty, 0);
        assert.equal(conversion.reservedQty, 5);
        assert.equal(conversion.inventoryItemId, "INV-LIVE-CONFIRM-001");
      }
      return postgresOrderConfirmationRepository.confirmOrder(input);
    },
  };
  const printBatchRepository = createPostgresPrintBatchRepository({ postgresClient: apiPostgresClient });
  const todoActionRepository = createPostgresTodoActionRepository({ postgresClient: apiPostgresClient });
  const inventoryCorrectionTransactionRepository = createPostgresInventoryCorrectionTransactionRepository({
    postgresClient: apiPostgresClient,
  });
  const productionFinishedGoodsPhotoTransactionRepository = createPostgresProductionFinishedGoodsPhotoTransactionRepository({
    postgresClient: apiPostgresClient,
  });
  const productionPackingTransactionRepository = createPostgresProductionPackingTransactionRepository({
    postgresClient: apiPostgresClient,
  });
  const productionScheduleRecordRepository = createPostgresProductionScheduleRecordRepository({
    postgresClient: apiPostgresClient,
  });
  const statementSendTransactionRepository = createPostgresStatementSendTransactionRepository({
    postgresClient: apiPostgresClient,
  });
  const statementExportRepository = createPostgresStatementExportRepository({
    postgresClient: apiPostgresClient,
  });
  const orderLineVoidTransactionRepository = createPostgresOrderLineVoidTransactionRepository({
    postgresClient: apiPostgresClient,
  });
  const orderLineQuantityAdjustmentTransactionRepository =
    createPostgresOrderLineQuantityAdjustmentTransactionRepository({
      postgresClient: apiPostgresClient,
    });
  runPsql(
    `INSERT INTO production_tasks (
      id, biz_no, order_line_id, task_type, machine_id, planned_qty, task_status, published_schedule_id, created_by
    ) VALUES (
      'PT-LIVE-API-SCHEDULE-001', 'PT-LIVE-API-SCHEDULE-001', 'OL-LIVE-PROD-001', '制袋', 'BAG-LIVE-01', 80,
      '待排产', '', 'U-OFFICE-A'
    ) ON CONFLICT (id) DO NOTHING;`,
  );
  const guardedPrintDriverAdapter = createPrintDriverAdapter({ dryRunEnabled: false, systemPrinterEnabled: false });
  const dryRunPollingAdapter = createPrintDriverAdapter({ dryRunEnabled: true, systemPrinterEnabled: false });
  const apiServerOptions = {
    // This suite exercises every PostgreSQL-backed route. Production-scope allowlisting
    // is covered separately by the production-profile live gate.
    runtimeMode: "test",
    firstReleaseScope: null,
    authSecret: liveRuntimeAuthSecret,
    v1PersistenceProfile: { repositoryMode: "postgres", queryJson },
    orderDraftRepository,
    orderConfirmationTransactionRepository,
    printBatchRepository,
    todoActionRepository,
    inventoryCorrectionTransactionRepository,
    productionFinishedGoodsPhotoTransactionRepository,
    productionPackingTransactionRepository,
    productionScheduleRecordRepository,
    statementSendTransactionRepository,
    statementExportRepository,
    orderLineVoidTransactionRepository,
    orderLineQuantityAdjustmentTransactionRepository,
    printDriverAdapter: {
      kind: guardedPrintDriverAdapter.kind,
      getConfiguration: guardedPrintDriverAdapter.getConfiguration,
      dispatchPrintJob: guardedPrintDriverAdapter.dispatchPrintJob,
      pollPrintJobStatus: dryRunPollingAdapter.pollPrintJobStatus,
    },
    attachmentObjectStorageOptions: { storageRoot },
    statementExportObjectStorageOptions: { storageRoot },
  };
  runtime.server = createApiServer(apiServerOptions);
  await listen(runtime.server);
  let baseUrl = `http://127.0.0.1:${runtime.server.address().port}`;
  const headers = { "x-erp-user-id": "U-OFFICE-A" };
  const driverHeaders = { "x-erp-user-id": "U-DRIVER-A" };
  const printDriverHeaders = { "x-erp-user-id": "U-PRINT-DRIVER-A" };

  const health = await getJson(baseUrl, "/api/health", { headers });
  postgresAssertions.assertHealth({ health, v1PersistencePostgresRepositoryOptionKeys });
  const restartedPendingEmployeeReviews = await getJson(
    baseUrl,
    "/api/master-data/employee-account-reviews?employeeId=EMP-MD-LIVE-001",
    { headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  postgresAssertions.assertRestartedPendingEmployeeReviews({ restartedPendingEmployeeReviews });
  const generalWorkerAssignment = await postJson(
    baseUrl,
    "/api/master-data/employee-account-reviews/EMP-MD-LIVE-001/assignment",
    { assignmentMode: "general_worker", workshop: "2号车间", reason: "PostgreSQL杂工调配验证" },
    { headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  assert.equal(generalWorkerAssignment.employeeAccountReview.assignmentMode, "general_worker");
  assert.equal(generalWorkerAssignment.employeeAccountReview.defaultMachineId, "");
  assert.equal(
    runPsql("SELECT default_workshop || '|' || COALESCE(default_machine_id, '') FROM employees WHERE id = 'EMP-MD-LIVE-001';", { capture: true }).trim(),
    "2号车间|",
  );
  const fixedMachineAssignment = await postJson(
    baseUrl,
    "/api/master-data/employee-account-reviews/EMP-MD-LIVE-001/assignment",
    { assignmentMode: "fixed_machine", workshop: "1号车间", machineId: "BAG-03", reason: "PostgreSQL固定机台验证" },
    { headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  postgresAssertions.assertFixedMachineAssignment({ fixedMachineAssignment });
  assert(fixedMachineAssignment.employeeAccountReview.assignmentUpdatedAt);
  assert.equal(fixedMachineAssignment.employeeAccountReview.assignmentNote, "PostgreSQL固定机台验证");
  assert.equal(
    runPsql("SELECT default_workshop || '|' || COALESCE(default_machine_id, '') FROM employees WHERE id = 'EMP-MD-LIVE-001';", { capture: true }).trim(),
    "1号车间|BAG-03",
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE target_type = 'master_data_employee_assignment' AND target_id = 'EMP-MD-LIVE-001';", { capture: true }).trim()),
    2,
  );
  const formalRuntimeLogin = await postJson(baseUrl, "/api/auth/login", {
    loginName: liveRuntimeLoginName,
    password: liveRuntimePassword,
  });
  assert(formalRuntimeLogin.session.accessToken.startsWith("erp-runtime-session-v1."));
  assert.equal(formalRuntimeLogin.session.sessionType, "runtime");
  assert.deepEqual(formalRuntimeLogin.permissions.roles, ["technical_operations"]);
  assert(formalRuntimeLogin.permissions.actionPermissions.includes("system.v1_production_env.precheck"));
  const formalRuntimeSession = await getJson(baseUrl, "/api/auth/me", {
    headers: { authorization: `Bearer ${formalRuntimeLogin.session.accessToken}` },
  });
  assert.equal(formalRuntimeSession.permissions.user.userId, liveRuntimeUserId);
  const formalRuntimeLogout = await postJson(
    baseUrl,
    "/api/auth/logout",
    {},
    { headers: { authorization: `Bearer ${formalRuntimeLogin.session.accessToken}` } },
  );
  assert.equal(formalRuntimeLogout.tokenRevoked, true);
  assert.equal(
    Number(runPsql(`SELECT COUNT(*) FROM seed_session_revocations WHERE jti = ${sqlLiteral(formalRuntimeLogin.session.jti)};`, { capture: true }).trim()),
    1,
  );
  const formalManagerScheduleLogin = await postJson(baseUrl, "/api/auth/login", {
    loginName: liveManagerRuntimeLoginName,
    password: liveManagerRuntimePassword,
  });
  const scheduleHeaders = {
    authorization: `Bearer ${formalManagerScheduleLogin.session.accessToken}`,
  };
  await checkPayrollApi(runtime, { baseUrl, scheduleHeaders, postJson });
  const apiScheduleTaskId = "PT-LIVE-API-SCHEDULE-001";
  const apiScheduleTaskRevision = Number(
    runPsql(
      `SELECT revision FROM production_tasks WHERE id = '${apiScheduleTaskId}';`,
      { capture: true },
    ).trim(),
  );
  const apiSchedulePublishBody = {
    orderLineId: "OL-LIVE-PROD-001",
    machineId: "BAG-LIVE-01",
    plannedQty: 80,
    expectedRevision: apiScheduleTaskRevision,
    directDecisionContent: { summary: "负责人确认发布排产" },
    operatorId: "U-SPOOFED",
    publishedAt: "2026-07-02T12:45:00.000Z",
    remark: "postgres live schedule publish",
    idempotencyKey: "production-schedule-publish-live-001",
  };
  const apiSchedulePublish = await postJson(
    baseUrl,
    `/api/production-tasks/${apiScheduleTaskId}/publish-schedule`,
    apiSchedulePublishBody,
    { headers: scheduleHeaders },
  );
  const replayedApiSchedulePublish = await postJson(
    baseUrl,
    `/api/production-tasks/${apiScheduleTaskId}/publish-schedule`,
    apiSchedulePublishBody,
    { headers: scheduleHeaders },
  );
  assert.equal(replayedApiSchedulePublish.operationLogId, apiSchedulePublish.operationLogId);
  assert.equal(replayedApiSchedulePublish.publishedScheduleId, apiSchedulePublish.publishedScheduleId);
  assert.equal(replayedApiSchedulePublish.publishedAt, apiSchedulePublish.publishedAt);
  assert.equal(
    queryJson(
      `SELECT json_build_object('operatorId', operator_id) AS result FROM operation_logs WHERE id = ${sqlLiteral(apiSchedulePublish.operationLogId)};`,
    ).operatorId,
    liveManagerRuntimeUserId,
  );

  await checkProductionScheduleQueueApi(runtime, {
    baseUrl, scheduleHeaders, apiScheduleTaskId, apiSchedulePublish,
    postJson, liveManagerRuntimeUserId,
  });
  await checkTodoApi(runtime, { baseUrl, headers, postJson });

  const startupOperationLogs = await getJson(baseUrl, "/api/operation-logs?limit=200", { headers });
  assert.equal(
    startupOperationLogs.total,
    Number(runPsql("SELECT COUNT(*) FROM operation_logs;", { capture: true }).trim()),
  );
  const printDriverConfig = await getJson(baseUrl, "/api/print-driver/config", { headers });
  postgresAssertions.assertPrintDriverConfig({ printDriverConfig });

  const databaseOnlyOrderLines = await getJson(
    baseUrl,
    "/api/order-lines?keyword=OL-LIVE-CONFIRM-001&includeHistory=true&pageSize=5",
    { headers },
  );
  postgresAssertions.assertDatabaseOnlyOrderLines({ databaseOnlyOrderLines });
  const { correctionManagerHeaders, createdCorrection, correctionConfirmBody, confirmedCorrection,
    photoAttachment, photoReviewBody, reviewedPhoto } = await checkInventoryApi({
    baseUrl, headers, queryJson, runPsql, sqlLiteral, getJson, postJson,
  });

  await checkDriverApi(runtime, { baseUrl, headers, driverHeaders, databaseOnlyOrderLines, postJson, getJson, assertPostgresOperationLogOperator });

  await checkOrderLineApi(runtime, { baseUrl, headers, getJson });

  await checkAttachmentApi({ baseUrl, headers, postJson, getJson });

  const { convertedHoldOrder, confirmedOrder } = await checkOrderApi({
    baseUrl, headers, queryJson, runPsql, sqlLiteral,
    postJson, getJson, patchJson, assertPostgresOperationLogOperator,
  });

  await checkFulfillmentApi({
    confirmedOrder, baseUrl, headers, printDriverHeaders,
    postJson, getJson, queryJson, runPsql, sqlLiteral, assertPostgresOperationLogOperator,
  });

  runPsql(
    `INSERT INTO print_records (
       id, biz_no, target_type, target_id, template_id, print_action, status, printed_by, printed_at
     ) VALUES (
       'PR-LIVE-F002-LEGACY-001', 'PR-LIVE-F002-LEGACY-001', 'fulfillment', 'F002',
       'tpl-p0-fulfillment', 'first_print', 'printed', 'U-OFFICE-A', '2026-07-02T11:30:00.000Z'
     ) ON CONFLICT (id) DO NOTHING;

     INSERT INTO paper_outbound_documents (
       id, fulfillment_id, print_record_id, document_type, document_version,
       status, printed_by, printed_at, revision
     ) VALUES (
       'POD-LIVE-F002-LEGACY-001', 'F002', 'PR-LIVE-F002-LEGACY-001', 'delivery_note', 99,
       '已打印', 'U-OFFICE-A', '2026-07-02T11:30:00.000Z', 1
     ) ON CONFLICT (id) DO NOTHING;

     UPDATE fulfillment_records
     SET status = '已备货', actual_qty = 1200, revision = 1,
         paper_outbound_status = '已打印',
         paper_outbound_document_id = 'POD-LIVE-F002-LEGACY-001',
         physical_outbound_at = NULL,
         physical_executor_employee_id = NULL,
         physical_outbound_document_id = NULL,
         physical_outbound_document_version = NULL,
         final_delivery_status = '待最终交付',
         final_delivery_at = NULL,
         legacy_state_review_required = false,
         updated_at = now()
     WHERE id = 'F002';`,
  );
  await closeServer(runtime.server);
  runtime.server = null;
  runtime.server = createApiServer(apiServerOptions);
  await listen(runtime.server);
  baseUrl = `http://127.0.0.1:${runtime.server.address().port}`;
  const restartedAssignedEmployeeReview = await getJson(
    baseUrl,
    "/api/master-data/employee-account-reviews?employeeId=EMP-MD-LIVE-001",
    { headers: { "x-erp-user-id": "U-MANAGER-A" } },
  );
  postgresAssertions.assertRestartedAssignedEmployeeReview({ restartedAssignedEmployeeReview });
  assert(restartedAssignedEmployeeReview.items[0].assignmentUpdatedAt);
  assert.equal(restartedAssignedEmployeeReview.items[0].assignmentNote, "PostgreSQL固定机台验证");
  const restartedHoldIntents = await getJson(
    baseUrl,
    "/api/inventory/intents?sourceDraftId=DRAFT-LIVE-HOLD-001",
    { headers },
  );
  assert.equal(restartedHoldIntents.items[0].intentStatus, "已转订单");
  assert.equal(restartedHoldIntents.items[0].relatedOrderLineId, convertedHoldOrder.orderLines[0].id);
  await checkLegacyFulfillmentApi(runtime, { baseUrl, headers, getJson, postJson, assertPostgresOperationLogOperator });

  const { warehouseHeaders } = await checkProductionApi(runtime, { baseUrl, headers, postJson, getJson });

  await checkPrintApi(runtime, { baseUrl, headers, warehouseHeaders, printDriverHeaders, printJobRepository, postJson, getJson, assertPostgresOperationLogOperator });

  const { quantityCandidateOrder } = await checkOrderLineMutationsApi(runtime, {
    baseUrl, headers, postJson, queryJson, runPsql, sqlLiteral, assertPostgresOperationLogOperator,
  });
  await checkCancelledFulfillmentApi(runtime, { baseUrl, headers, quantityCandidateOrder, postJson, assertPostgresOperationLogOperator });


  await checkStatementApi(runtime, { baseUrl, headers, scheduleHeaders, postJson, getJson, getBinary });

  const { concurrentDraftId, concurrentBody } = await checkOrderDraftConcurrencyApi(runtime, {
    baseUrl, headers, postJson, queryJson, sqlLiteral,
  });
  await closeServer(runtime.server);
  runtime.server = null;
  runtime.server = createApiServer(apiServerOptions);
  await listen(runtime.server);
  baseUrl = `http://127.0.0.1:${runtime.server.address().port}`;
  const restartedHealth = await getJson(baseUrl, "/api/health", { headers });
  assert.equal(restartedHealth.seed.customers, Number(runPsql("SELECT COUNT(*) FROM customers;", { capture: true }).trim()));
  assert.equal(restartedHealth.seed.orderLines, Number(runPsql("SELECT COUNT(*) FROM order_lines;", { capture: true }).trim()));
  assert.equal(restartedHealth.seed.inventories, Number(runPsql("SELECT COUNT(*) FROM inventory_items;", { capture: true }).trim()));
  assert.equal(restartedHealth.seed.fulfillments, Number(runPsql("SELECT COUNT(*) FROM fulfillment_records;", { capture: true }).trim()));
  assert.equal(restartedHealth.seed.statements, Number(runPsql("SELECT COUNT(*) FROM statements;", { capture: true }).trim()));
  const restartedHandledTodos = await getJson(baseUrl, "/api/todos?status=handled&pageSize=200", { headers });
  const restartedTodoAction = restartedHandledTodos.items.find((item) => item.todoId === "T-LIVE-IDEMPOTENCY-001");
  postgresAssertions.assertRestartedTodoAction({ restartedTodoAction });
  const restartedOpenTodos = await getJson(baseUrl, "/api/todos?status=open&pageSize=200", { headers });
  const restartedCustomerPending = restartedOpenTodos.items.find((item) => item.todoId === "T-LIVE-IDEMPOTENCY-002");
  postgresAssertions.assertRestartedCustomerPending({ restartedCustomerPending });
  const restartedCorrectionDetail = await getJson(
    baseUrl,
    `/api/inventory/correction-drafts/${createdCorrection.correctionDraftId}`,
    { headers },
  );
  postgresAssertions.assertRestartedCorrectionDetail({ restartedCorrectionDetail, confirmedCorrection });
  const restartedCorrectionReplay = await postJson(
    baseUrl,
    `/api/inventory/correction-drafts/${createdCorrection.correctionDraftId}/confirm`,
    correctionConfirmBody,
    { headers: correctionManagerHeaders },
  );
  assert.equal(restartedCorrectionReplay.operationLogId, confirmedCorrection.operationLogId);
  const restartedPhotoTask = await getJson(baseUrl, "/api/production-tasks/PT-LIVE-PROD-001", { headers });
  assert.equal(restartedPhotoTask.finishedGoodsPhoto.status, "已接受");
  assert.equal(restartedPhotoTask.finishedGoodsPhoto.attachmentId, photoAttachment.attachmentId);
  const restartedPhotoReviewReplay = await postJson(
    baseUrl,
    "/api/production-tasks/PT-LIVE-PROD-001/finished-goods-photo-review",
    photoReviewBody,
    { headers },
  );
  assert.equal(restartedPhotoReviewReplay.operationLogId, reviewedPhoto.operationLogId);
  await checkOrderDraftResumeApi(runtime, { baseUrl, headers, patchJson, concurrentDraftId, concurrentBody });

  await closeServer(runtime.server);
  runtime.server = null;
  const formalConcurrentTodoId = "T-LIVE-FORMAL-CONCURRENT-001";
  runPsql(`
INSERT INTO todos (
  id, biz_no, type, ref_type, ref_id, priority, status, summary, created_by, created_at, updated_at
) VALUES (
  '${formalConcurrentTodoId}', '${formalConcurrentTodoId}', '正式账号并发验收', 'system',
  '${formalConcurrentTodoId}', '普通', '未处理', '两个正式账号同时处理同一待办',
  '${liveOfficeRuntimeUserId}', now(), now()
);
`);
  const strictTodoRepository = createTodoReadBarrierRepository(todoActionRepository, formalConcurrentTodoId);
  runtime.server = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true,
    ...apiServerOptions,
    strictAuth: true,
    todoActionRepository: strictTodoRepository,
  }));
  await listen(runtime.server);
  baseUrl = `http://127.0.0.1:${runtime.server.address().port}`;
  const [formalOfficeLogin, formalManagerLogin] = await Promise.all([
    postJson(baseUrl, "/api/auth/login", {
      loginName: liveOfficeRuntimeLoginName,
      password: liveOfficeRuntimePassword,
    }),
    postJson(baseUrl, "/api/auth/login", {
      loginName: liveManagerRuntimeLoginName,
      password: liveManagerRuntimePassword,
    }),
  ]);
  assert.deepEqual(formalOfficeLogin.permissions.roles, ["office"]);
  assert.deepEqual(formalManagerLogin.permissions.roles, ["management"]);
  assert(formalOfficeLogin.permissions.actionPermissions.includes("todo.handle"));
  assert(formalManagerLogin.permissions.actionPermissions.includes("todo.handle"));

  const formalConcurrentResponses = await Promise.all([
    [formalOfficeLogin, "todo-formal-concurrent-office-001", "办公室正式账号处理"],
    [formalManagerLogin, "todo-formal-concurrent-manager-001", "管理正式账号处理"],
  ].map(([login, idempotencyKey, handlingResult]) => fetch(
    `${baseUrl}/api/todos/${formalConcurrentTodoId}/handle`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${login.session.accessToken}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({ action: "mark_handled", handlingResult, idempotencyKey }),
    },
  )));
  assert.deepEqual(
    formalConcurrentResponses.map((response) => response.status).sort((left, right) => left - right),
    [200, 409],
  );
  const formalConcurrentPayloads = await Promise.all(formalConcurrentResponses.map((response) => response.json()));
  const formalConcurrentSuccess = formalConcurrentPayloads.find((payload) => payload.todo);
  const formalConcurrentConflict = formalConcurrentPayloads.find((payload) => payload.code);
  assert.equal(formalConcurrentConflict?.code, "BUSINESS_WRITE_CONFLICT");
  assert.equal(formalConcurrentSuccess?.todo.handled, true);
  assert([liveOfficeRuntimeUserId, liveManagerRuntimeUserId].includes(formalConcurrentSuccess?.todo.handledBy));
  assert.equal(strictTodoRepository.metrics.barrierReadCount, 2);
  const formalConcurrentPersisted = queryJson(`
SELECT json_build_object(
  'status', status,
  'handledBy', handled_by,
  'eventCount', (SELECT COUNT(*) FROM todo_events WHERE todo_id = '${formalConcurrentTodoId}'),
  'logCount', (SELECT COUNT(*) FROM operation_logs WHERE target_type = 'todo' AND target_id = '${formalConcurrentTodoId}'),
  'idempotencyCount', (
    SELECT COUNT(*) FROM operation_idempotency_keys
    WHERE scope = 'todo.action.mark_handled'
      AND idempotency_key IN ('todo-formal-concurrent-office-001', 'todo-formal-concurrent-manager-001')
  )
) AS result
FROM todos
WHERE id = '${formalConcurrentTodoId}';
`);
  assert.equal(formalConcurrentPersisted.status, "已处理");
  assert([liveOfficeRuntimeUserId, liveManagerRuntimeUserId].includes(formalConcurrentPersisted.handledBy));
  postgresAssertions.assertFormalConcurrentPersisted({ formalConcurrentPersisted });


  function assertPostgresOperationLogOperator(query, operationLogId, expectedOperatorId = "U-OFFICE-A") {
    const operationLog = query(
      `SELECT json_build_object('operatorId', operator_id) AS result FROM operation_logs WHERE id = ${sqlLiteral(operationLogId)};`,
    );
    assert.equal(operationLog?.operatorId, expectedOperatorId, `unexpected operator for operation log ${operationLogId}`);
  }
}

function createTodoReadBarrierRepository(repository, todoId) {
  let releaseBarrier;
  let rejectBarrier;
  let barrierTimer;
  const metrics = { barrierReadCount: 0 };
  const barrier = new Promise((resolve, reject) => {
    releaseBarrier = resolve;
    rejectBarrier = reject;
    barrierTimer = setTimeout(() => reject(new Error(`Timed out waiting for concurrent todo reads: ${todoId}`)), 5_000);
  });
  return {
    ...repository,
    metrics,
    async getTodo(input) {
      const snapshot = await repository.getTodo(input);
      if (input.todoId !== todoId || metrics.barrierReadCount >= 2) return snapshot;
      metrics.barrierReadCount += 1;
      if (metrics.barrierReadCount === 2) {
        clearTimeout(barrierTimer);
        releaseBarrier();
      }
      await barrier;
      return snapshot;
    },
    closeBarrier() {
      clearTimeout(barrierTimer);
      rejectBarrier(new Error(`Todo read barrier closed before completion: ${todoId}`));
    },
  };
}

function listen(httpServer) {
  return new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
}

function closeServer(httpServer) {
  return new Promise((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
}

async function getJson(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, { headers: options.headers ?? {} });
  const json = await response.json();
  assert.equal(response.status, options.expectedStatus ?? 200, `${route} returned ${response.status}: ${JSON.stringify(json)}`);
  return json;
}

async function postJson(baseUrl, route, body, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  assert.equal(response.status, options.expectedStatus ?? 200, `${route} returned ${response.status}: ${JSON.stringify(json)}`);
  return json;
}

async function patchJson(baseUrl, route, body, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  assert.equal(response.status, options.expectedStatus ?? 200, `${route} returned ${response.status}: ${JSON.stringify(json)}`);
  return json;
}

async function getBinary(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, { headers: options.headers ?? {} });
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(
    response.status,
    options.expectedStatus ?? 200,
    `${route} returned ${response.status}: ${new TextDecoder().decode(bytes)}`,
  );
  return {
    bytes,
    contentType: response.headers.get("content-type") ?? "",
  };
}
