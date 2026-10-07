import { checkTodoApi } from "./apiChecks/todos.mjs";
import { checkAttachmentApi } from "./apiChecks/attachments.mjs";
import { checkProductionApi } from "./apiChecks/production.mjs";
import { checkStatementApi } from "./apiChecks/statements.mjs";
import { checkFulfillmentApi } from "./apiChecks/fulfillment.mjs";
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
import { createPostgresDriverDeliveryTaskReadRepository } from "../../server/driverDeliveryTaskReadRepository.mjs";
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
import { buildPrintJobOperationLog, buildPrintJobRecord } from "../helpers/postgresLivePrintFixtures.mjs";
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
  const payrollEvidenceWithoutEmployee = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "payroll_run",
      ownerId: "PAY-LIVE-API-EVIDENCE-202608",
      purpose: "payroll_adjustment_evidence",
      fileType: "pdf",
      fileName: "payroll-adjustment-missing-employee-live.pdf",
      mimeType: "application/pdf",
      contentRef: "p0://payroll-adjustment/PAY-LIVE-API-EVIDENCE-202608/missing-employee",
      contentDataUrl: "data:application/pdf;base64,JVBERi0xLjQtbWlzc2luZy1lbXBsb3llZQ==",
      metadata: {},
      uploadedBy: "U-SPOOFED",
      idempotencyKey: "payroll-adjustment-missing-employee-live-001",
    },
    { headers: scheduleHeaders },
  );
  assert.equal(payrollEvidenceWithoutEmployee.uploadedBy, liveManagerRuntimeUserId);
  const rejectedPayrollEvidenceWithoutEmployee = await postJson(
    baseUrl,
    "/api/payroll/runs/PAY-LIVE-API-EVIDENCE-202608/lines/EMP-LIVE-MANAGER-001/adjustment",
    {
      performanceAward: 320,
      leaveDeduction: 40,
      otherDeduction: 10,
      reason: "PostgreSQL live missing employee evidence must fail closed",
      evidenceAttachmentIds: [payrollEvidenceWithoutEmployee.attachmentId],
    },
    { headers: scheduleHeaders, expectedStatus: 422 },
  );
  assert.equal(rejectedPayrollEvidenceWithoutEmployee.code, "PAYROLL_ADJUSTMENT_EVIDENCE_EMPLOYEE_REQUIRED");
  const payrollEvidenceAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "payroll_run",
      ownerId: "PAY-LIVE-API-EVIDENCE-202608",
      purpose: "payroll_adjustment_evidence",
      fileType: "pdf",
      fileName: "payroll-adjustment-EMP-LIVE-MANAGER-001-live.pdf",
      mimeType: "application/pdf",
      contentRef: "p0://payroll-adjustment/PAY-LIVE-API-EVIDENCE-202608/EMP-LIVE-MANAGER-001",
      contentDataUrl: "data:application/pdf;base64,JVBERi0xLjQtcGF5cm9sbC1ldmlkZW5jZQ==",
      metadata: {
        payrollRunId: "PAY-LIVE-API-EVIDENCE-202608",
        employeeId: "EMP-LIVE-MANAGER-001",
      },
      uploadedBy: "U-SPOOFED",
      idempotencyKey: "payroll-adjustment-evidence-live-001",
    },
    { headers: scheduleHeaders },
  );
  assert.equal(payrollEvidenceAttachment.uploadedBy, liveManagerRuntimeUserId);
  const apiPayrollAdjustment = await postJson(
    baseUrl,
    "/api/payroll/runs/PAY-LIVE-API-EVIDENCE-202608/lines/EMP-LIVE-MANAGER-001/adjustment",
    {
      performanceAward: 320,
      leaveDeduction: 40,
      otherDeduction: 10,
      reason: "PostgreSQL live authenticated payroll adjustment evidence",
      evidenceAttachmentIds: [payrollEvidenceAttachment.attachmentId],
    },
    { headers: scheduleHeaders },
  );
  assert.deepEqual(apiPayrollAdjustment.adjustment.evidenceAttachmentIds, [payrollEvidenceAttachment.attachmentId]);
  assert.equal(
    runPsql(
      `SELECT evidence_attachment_ids_json->>0 FROM payroll_line_adjustments WHERE id = ${sqlLiteral(apiPayrollAdjustment.adjustment.id)};`,
      { capture: true },
    ).trim(),
    payrollEvidenceAttachment.attachmentId,
  );
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

  const apiScheduleQueueRevision = Number(
    runPsql(
      `SELECT revision FROM production_schedule_records
       WHERE production_task_id = '${apiScheduleTaskId}' AND schedule_status = 'active';`,
      { capture: true },
    ).trim(),
  );
  const apiScheduleResequenceBody = {
    machineId: "BAG-LIVE-01",
    orderedProductionTaskIds: [apiScheduleTaskId],
    expectedRevision: apiScheduleQueueRevision,
    affectedRevisions: [{ productionTaskId: apiScheduleTaskId, revision: apiScheduleQueueRevision }],
    businessDecisionTargetId: apiScheduleTaskId,
    directDecisionContent: { summary: "负责人确认调整排产顺序" },
    operatorId: "U-SPOOFED",
    updatedAt: "2026-07-02T12:50:00.000Z",
    remark: "postgres live schedule resequence",
    idempotencyKey: "production-schedule-resequence-live-001",
  };
  const apiScheduleResequence = await postJson(
    baseUrl,
    "/api/production-schedules/machine-queue/resequence",
    apiScheduleResequenceBody,
    { headers: scheduleHeaders },
  );
  const replayedApiScheduleResequence = await postJson(
    baseUrl,
    "/api/production-schedules/machine-queue/resequence",
    apiScheduleResequenceBody,
    { headers: scheduleHeaders },
  );
  postgresAssertions.assertReplayedApiScheduleResequence({ replayedApiScheduleResequence, apiScheduleResequence, liveManagerRuntimeUserId });

  const apiScheduleMoveTaskRevision = Number(
    runPsql(
      `SELECT revision FROM production_tasks WHERE id = '${apiScheduleTaskId}';`,
      { capture: true },
    ).trim(),
  );
  const apiScheduleMoveBody = {
    productionTaskId: apiScheduleTaskId,
    targetMachineId: "BAG-LIVE-02",
    targetQueueSeq: 2,
    expectedRevision: apiScheduleMoveTaskRevision,
    directDecisionContent: { summary: "负责人确认调整生产机台" },
    operatorId: "U-SPOOFED",
    updatedAt: "2026-07-02T12:55:00.000Z",
    remark: "postgres live schedule move",
    idempotencyKey: "production-schedule-move-live-001",
  };
  const apiScheduleMove = await postJson(
    baseUrl,
    "/api/production-schedules/machine-queue/move",
    apiScheduleMoveBody,
    { headers: scheduleHeaders },
  );
  const replayedApiScheduleMove = await postJson(
    baseUrl,
    "/api/production-schedules/machine-queue/move",
    apiScheduleMoveBody,
    { headers: scheduleHeaders },
  );
  assert.equal(replayedApiScheduleMove.operationLogId, apiScheduleMove.operationLogId);
  assert.equal(replayedApiScheduleMove.sourceMachineId, "BAG-LIVE-01");
  assert.equal(replayedApiScheduleMove.targetMachineId, "BAG-LIVE-02");
  assert.equal(replayedApiScheduleMove.targetQueueSeq, apiScheduleMove.targetQueueSeq);
  assert.equal(replayedApiScheduleMove.updatedBy, liveManagerRuntimeUserId);
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM production_schedule_records WHERE production_task_id = '${apiScheduleTaskId}';`,
        { capture: true },
      ).trim(),
    ),
    2,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM operation_idempotency_keys WHERE scope IN ('production.schedule.publish', 'production.schedule.resequence', 'production.schedule.move') AND idempotency_key LIKE '%live-001';",
        { capture: true },
      ).trim(),
    ),
    3,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM operation_logs WHERE id IN (${[
          apiSchedulePublish.operationLogId,
          apiScheduleResequence.operationLogId,
          apiScheduleMove.operationLogId,
        ].map(sqlLiteral).join(", ")});`,
        { capture: true },
      ).trim(),
    ),
    3,
  );
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

  const databaseDriverTasks = await getJson(
    baseUrl,
    "/api/driver/delivery-tasks?driverId=U-DRIVER-A&status=%E5%B7%B2%E5%AE%8C%E6%88%90&pageSize=5",
    { headers: driverHeaders },
  );
  assert.equal(databaseDriverTasks.items.some((item) => item.fulfillmentId === "F002"), true);
  const databaseDriverTaskDetail = await getJson(baseUrl, "/api/driver/delivery-tasks/F002", { headers: driverHeaders });
  postgresAssertions.assertDatabaseDriverTaskDetail({ databaseDriverTaskDetail });

  const driverExceptionOccurredAt = "2026-07-02T09:40:00.000Z";
  const apiDriverException = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F006/exception",
    {
      fulfillmentId: "F006",
      reasonCode: "customer_unavailable",
      reasonText: "客户不在",
      actualQty: 0,
      operatorId: "U-DRIVER-A",
      occurredAt: driverExceptionOccurredAt,
      remark: "postgres live driver exception check",
    },
    { headers: driverHeaders },
  );
  postgresAssertions.assertApiDriverException({ apiDriverException, driverExceptionOccurredAt });
  const persistedDriverException = queryJson(
    "SELECT json_build_object('status', f.status, 'actualQty', f.actual_qty, 'reasonCode', e.reason_code, 'reason', e.reason, 'actualQtyException', e.actual_qty, 'todoId', e.todo_id, 'occurredAt', e.occurred_at) AS result FROM fulfillment_records AS f JOIN fulfillment_exceptions AS e ON e.fulfillment_id = f.id WHERE f.id = 'F006' ORDER BY e.created_at DESC, e.id DESC LIMIT 1;",
  );
  postgresAssertions.assertPersistedDriverException({ persistedDriverException, apiDriverException, driverExceptionOccurredAt });
  const coldStartAfterDriverException = await createPostgresDriverDeliveryTaskReadRepository({ queryJson }).getDriverDeliveryTask({
    fulfillmentId: "F006",
    operatorId: "U-DRIVER-A",
  });
  postgresAssertions.assertColdStartAfterDriverException({ coldStartAfterDriverException, driverExceptionOccurredAt });

  const driverPaperReady = await getJson(baseUrl, "/api/fulfillments/F008", { headers });
  const driverPaperDocument = driverPaperReady.paperOutboundDocument;
  const driverPaperHandoff = await postJson(
    baseUrl,
    "/api/fulfillments/F008/paper-handoff",
    {
      expectedRevision: driverPaperReady.revision,
      paperOutboundDocumentId: driverPaperDocument.paperOutboundDocumentId,
      paperDocumentVersion: driverPaperDocument.documentVersion,
      paperDocumentRevision: driverPaperDocument.revision,
      note: "PostgreSQL live 纸单交库房",
      idempotencyKey: "driver-paper-handoff-f008-live-001",
    },
    { headers },
  );
  assert.equal(driverPaperHandoff.paperOutboundDocument.status, "已交库房");
  const driverBeforeWarehouseExecution = await getJson(baseUrl, "/api/fulfillments/F008", { headers });
  const handedDriverPaperDocument = driverBeforeWarehouseExecution.paperOutboundDocument;
  const driverWarehouseExecution = await postJson(
    baseUrl,
    "/api/fulfillments/F008/warehouse-execution",
    {
      expectedRevision: driverBeforeWarehouseExecution.revision,
      paperOutboundDocumentId: handedDriverPaperDocument.paperOutboundDocumentId,
      paperDocumentVersion: handedDriverPaperDocument.documentVersion,
      paperDocumentRevision: handedDriverPaperDocument.revision,
      result: "实物已出库",
      actualQty: 3000,
      physicalExecutorEmployeeId: "EMP-MD-LIVE-001",
      feedbackChannel: "纸面",
      executedAt: "2026-07-02T08:50:00.000Z",
      note: "库房按纸单完成规格和数量核对",
      idempotencyKey: "driver-warehouse-execution-f008-live-001",
    },
    { headers },
  );
  assert.equal(driverWarehouseExecution.status, "待司机装车");
  assert.equal(driverWarehouseExecution.warehouseOutboundExecution.result, "实物已出库");

  const driverLoadAt = "2026-07-02T09:05:00.000Z";
  const driverLoadRemark = "postgres live driver load check；装车核对：6/6包";
  const apiDriverLoad = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F008/load-confirm",
    {
      fulfillmentId: "F008",
      loadedAt: driverLoadAt,
      operatorId: "U-DRIVER-A",
      checkedPackageIds: [
        "PKG-LIVE-F008-1",
        "PKG-LIVE-F008-2",
        "PKG-LIVE-F008-3",
        "PKG-LIVE-F008-4",
        "PKG-LIVE-F008-5",
        "PKG-LIVE-F008-6",
      ],
      packageCheckSummary: "6/6包",
      remark: driverLoadRemark,
    },
    { headers: driverHeaders },
  );
  postgresAssertions.assertApiDriverLoad({ apiDriverLoad, driverLoadAt, driverLoadRemark });
  const persistedDriverLoad = queryJson(
    "SELECT json_build_object('status', status, 'loadedAt', loaded_at, 'loadedBy', loaded_by, 'driverRemark', driver_remark) AS result FROM fulfillment_records WHERE id = 'F008';",
  );
  postgresAssertions.assertPersistedDriverLoad({ persistedDriverLoad, driverLoadAt, driverLoadRemark });
  const coldStartAfterDriverLoad = await createPostgresDriverDeliveryTaskReadRepository({ queryJson }).getDriverDeliveryTask({
    fulfillmentId: "F008",
    operatorId: "U-DRIVER-A",
  });
  postgresAssertions.assertColdStartAfterDriverLoad({ coldStartAfterDriverLoad, driverLoadAt, driverLoadRemark });

  const driverCompletedAt = "2026-07-02T10:20:00.000Z";
  const driverCompleteRemark = "postgres live driver complete check";
  const driverWatermarkAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "fulfillment",
      ownerId: "F008",
      purpose: "delivery_watermark_photo",
      fileType: "image",
      fileName: "driver-watermark-f008.png",
      mimeType: "image/png",
      contentRef: "p0://postgres-live/driver/F008/watermark",
      contentDataUrl: "data:image/png;base64,cG9zdGdyZXMtbGl2ZS13YXRlcm1hcms=",
      uploadedBy: "U-SPOOFED",
      idempotencyKey: "driver-watermark-f008-live-001",
      metadata: {
        watermarkId: "WM-LIVE-DRIVER-F008",
        watermarkText: "李四电商 / 厚街客户仓 / 水印 WM-LIVE-DRIVER-F008",
        watermarkCapturedAt: "2026-07-02T10:18:00.000Z",
        watermarkLocationLabel: "厚街客户仓门口",
        watermarkGeoPoint: "22.910000,113.670000",
        watermarkAddress: "厚街客户仓",
      },
    },
    { headers: driverHeaders },
  );
  assert.equal(driverWatermarkAttachment.uploadedBy, "U-DRIVER-A");
  const driverSignatureAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "fulfillment",
      ownerId: "F008",
      purpose: "signature_photo",
      fileType: "image",
      fileName: "driver-signature-f008.png",
      mimeType: "image/png",
      contentRef: "p0://postgres-live/driver/F008/signature",
      contentDataUrl: "data:image/png;base64,cG9zdGdyZXMtbGl2ZS1zaWduYXR1cmU=",
      uploadedBy: "U-SPOOFED",
      idempotencyKey: "driver-signature-f008-live-001",
    },
    { headers: driverHeaders },
  );
  const apiDriverComplete = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F008/complete",
    {
      fulfillmentId: "F008",
      actualQty: 3000,
      operatorId: "U-DRIVER-A",
      watermarkedPhotoAttachmentId: driverWatermarkAttachment.attachmentId,
      watermarkId: "WM-LIVE-DRIVER-F008",
      watermarkText: "李四电商 / 厚街客户仓 / 水印 WM-LIVE-DRIVER-F008",
      watermarkCapturedAt: "2026-07-02T10:18:00.000Z",
      watermarkLocationLabel: "厚街客户仓门口",
      watermarkGeoPoint: "22.910000,113.670000",
      watermarkAddress: "厚街客户仓",
      watermarkOperatorId: "U-DRIVER-A",
      watermarkOperatorName: "司机A",
      signaturePhotoAttached: true,
      signaturePhotoAttachmentId: driverSignatureAttachment.attachmentId,
      receiverName: "客户仓管",
      paperNoteStatus: "已交回",
      completedAt: driverCompletedAt,
      remark: driverCompleteRemark,
    },
    { headers: driverHeaders },
  );
  postgresAssertions.assertApiDriverComplete({ apiDriverComplete, driverLoadAt, driverWatermarkAttachment, driverSignatureAttachment });
  const persistedDriverComplete = queryJson(
    "SELECT json_build_object('status', status, 'loadedAt', loaded_at, 'loadedBy', loaded_by, 'driverRemark', driver_remark, 'receiverName', receiver_name, 'paperNoteStatus', paper_note_status, 'watermarkId', watermark_id) AS result FROM fulfillment_records WHERE id = 'F008';",
  );
  postgresAssertions.assertPersistedDriverComplete({ persistedDriverComplete, driverLoadAt, driverCompleteRemark });
  const coldStartAfterDriverComplete = await createPostgresDriverDeliveryTaskReadRepository({ queryJson }).getDriverDeliveryTask({
    fulfillmentId: "F008",
    operatorId: "U-DRIVER-A",
  });
  postgresAssertions.assertColdStartAfterDriverComplete({ coldStartAfterDriverComplete, driverLoadAt, driverCompleteRemark, driverWatermarkAttachment });

  const apiDeliveryEvidenceRetake = await postJson(
    baseUrl,
    "/api/fulfillments/F008/delivery-evidence-review",
    {
      fulfillmentId: "F008",
      reviewStatus: "retake_required",
      operatorId: "U-SPOOFED",
      reviewerName: "办公室A",
      reason: "水印定位不清晰",
    },
    { headers },
  );
  postgresAssertions.assertApiDeliveryEvidenceRetake({ apiDeliveryEvidenceRetake });
  assertPostgresOperationLogOperator(queryJson, apiDeliveryEvidenceRetake.operationLogId);

  const driverRetakeSubmittedAt = "2026-07-02T10:45:00.000Z";
  const driverRetakeAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "fulfillment",
      ownerId: "F008",
      purpose: "delivery_watermark_photo",
      fileType: "image",
      fileName: "driver-watermark-f008-retake.png",
      mimeType: "image/png",
      contentRef: "p0://postgres-live/driver/F008/watermark-retake",
      contentDataUrl: "data:image/png;base64,cG9zdGdyZXMtbGl2ZS13YXRlcm1hcmstcmV0YWtl",
      uploadedBy: "U-SPOOFED",
      idempotencyKey: "driver-watermark-f008-retake-live-001",
      metadata: {
        watermarkId: "WM-LIVE-DRIVER-F008-RETAKE",
        watermarkText: "李四电商 / 厚街客户仓 / 补拍水印 WM-LIVE-DRIVER-F008-RETAKE",
        watermarkCapturedAt: driverRetakeSubmittedAt,
        watermarkLocationLabel: "厚街客户仓门口补拍",
        watermarkGeoPoint: "22.910001,113.670001",
        watermarkAddress: "厚街客户仓",
      },
    },
    { headers: driverHeaders },
  );
  const apiDriverEvidenceResubmission = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F008/complete",
    {
      fulfillmentId: "F008",
      operatorId: "U-DRIVER-A",
      watermarkedPhotoAttachmentId: driverRetakeAttachment.attachmentId,
      watermarkId: "WM-LIVE-DRIVER-F008-RETAKE",
      watermarkText: "李四电商 / 厚街客户仓 / 补拍水印 WM-LIVE-DRIVER-F008-RETAKE",
      watermarkCapturedAt: driverRetakeSubmittedAt,
      watermarkLocationLabel: "厚街客户仓门口补拍",
      watermarkGeoPoint: "22.910001,113.670001",
      watermarkAddress: "厚街客户仓",
      completedAt: driverRetakeSubmittedAt,
      remark: "postgres live driver retake evidence check",
    },
    { headers: driverHeaders },
  );
  postgresAssertions.assertApiDriverEvidenceResubmission({ apiDriverEvidenceResubmission, apiDeliveryEvidenceRetake, driverRetakeAttachment });
  const persistedDriverEvidenceResubmission = queryJson(
    `SELECT json_build_object(
      'status', f.status,
      'watermarkedPhotoAttachmentId', f.watermarked_photo_attachment_id,
      'watermarkId', f.watermark_id,
      'reviewStatus', f.delivery_evidence_review_status,
      'reviewedAt', f.delivery_evidence_reviewed_at,
      'issueReason', f.delivery_evidence_issue_reason,
      'todoStatus', t.status,
      'todoHandledBy', t.handled_by,
      'todoHandledAt', t.handled_at,
      'todoHandlingResult', t.handling_result
    ) AS result
    FROM fulfillment_records AS f
    LEFT JOIN todos AS t ON t.id = ${sqlLiteral(apiDeliveryEvidenceRetake.todoId)}
    WHERE f.id = 'F008';`,
  );
  postgresAssertions.assertPersistedDriverEvidenceResubmission({ persistedDriverEvidenceResubmission, driverRetakeAttachment, driverRetakeSubmittedAt });
  const coldStartAfterDriverEvidenceResubmission = await createPostgresDriverDeliveryTaskReadRepository({ queryJson }).getDriverDeliveryTask({
    fulfillmentId: "F008",
    operatorId: "U-DRIVER-A",
  });
  postgresAssertions.assertColdStartAfterDriverEvidenceResubmission({ coldStartAfterDriverEvidenceResubmission, driverRetakeAttachment });

  const apiDeviceFieldTest = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F002/device-field-tests",
    {
      recordId: "DQA-LIVE-API-F002",
      fulfillmentId: "F002",
      orderLineId: "ORD-0629-002-01",
      driverId: "U-DRIVER-A",
      operatorId: "U-DRIVER-A",
      operatorName: "司机A",
      checkedAt: "2026-07-02T11:20:00.000Z",
      deviceLabel: "iPhone 15 Pro",
      browserLabel: "Safari 17",
      userAgent: "Mozilla/5.0 Safari/604.1",
      language: "zh-CN",
      checks: [
        { key: "camera_permission", status: "passed" },
        { key: "watermark_photo", status: "passed" },
        { key: "package_label_scan", status: "failed" },
        { key: "geolocation", status: "blocked" },
        { key: "file_upload", status: "untested" },
        { key: "navigation", status: "untested" },
      ],
      packageLabelScanSample: {
        sampleId: "DPLS-LIVE-API-F002-PKG-1",
        fulfillmentId: "F002",
        expectedPackageId: "PKG-LIVE-F002-1",
        scannedText: "PKG-LIVE-F002-404",
        matchedPackageId: "",
        method: "camera",
        result: "not_found",
        message: "api live package label mismatch sample",
        checkedAt: "2026-07-02T11:19:59.000Z",
      },
      note: "api live cold-start field test",
    },
    { headers: driverHeaders },
  );
  assert.equal(apiDeviceFieldTest.record.recordId, "DQA-LIVE-API-F002");
  assert.equal(apiDeviceFieldTest.record.summary.label, "通过 2/6，异常 2");
  assert.equal(apiDeviceFieldTest.record.packageLabelScanSample.scannedText, "PKG-LIVE-F002-404");
  assert.equal(apiDeviceFieldTest.task.deviceFieldTestRecord.recordId, "DQA-LIVE-API-F002");
  assert.equal(apiDeviceFieldTest.task.deviceFieldTestRecord.packageLabelScanSample.result, "not_found");
  assert.equal(apiDeviceFieldTest.task.deviceFieldTestSummary.label, "通过 2/6，异常 2");
  assert.ok(apiDeviceFieldTest.operationLogId);
  const apiPersistedDeviceFieldTest = queryJson(
    "SELECT json_build_object('recordId', id, 'summary', summary_json->>'label', 'sampleResult', summary_json->'packageLabelScanSample'->>'result', 'operationLogId', operation_log_id) AS result FROM driver_device_field_tests WHERE id = 'DQA-LIVE-API-F002';",
  );
  assert.equal(apiPersistedDeviceFieldTest.recordId, "DQA-LIVE-API-F002");
  assert.equal(apiPersistedDeviceFieldTest.summary, "通过 2/6，异常 2");
  assert.equal(apiPersistedDeviceFieldTest.sampleResult, "not_found");
  assert.equal(apiPersistedDeviceFieldTest.operationLogId, apiDeviceFieldTest.operationLogId);
  const coldStartDriverTaskReadRepository = createPostgresDriverDeliveryTaskReadRepository({ queryJson });
  const coldStartDeviceFieldTask = await coldStartDriverTaskReadRepository.getDriverDeliveryTask({
    fulfillmentId: "F002",
    operatorId: "U-DRIVER-A",
  });
  assert.equal(coldStartDeviceFieldTask.deviceFieldTestRecord.recordId, "DQA-LIVE-API-F002");
  assert.equal(coldStartDeviceFieldTask.deviceFieldTestRecord.packageLabelScanSample.scannedText, "PKG-LIVE-F002-404");
  assert.equal(coldStartDeviceFieldTask.deviceFieldTestSummary.label, "通过 2/6，异常 2");
  assert.equal(databaseOnlyOrderLines.items[0].amount, 273);

  const databaseOnlyOrderLineDetail = await getJson(baseUrl, "/api/order-lines/OL-LIVE-CONFIRM-001", { headers });
  postgresAssertions.assertDatabaseOnlyOrderLineDetail({ databaseOnlyOrderLineDetail });

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
  const legacyPaperReady = await getJson(baseUrl, "/api/fulfillments/F002", { headers });
  const legacyPaperDocument = legacyPaperReady.paperOutboundDocument;
  const legacyPaperHandoff = await postJson(
    baseUrl,
    "/api/fulfillments/F002/paper-handoff",
    {
      expectedRevision: legacyPaperReady.revision,
      paperOutboundDocumentId: legacyPaperDocument.paperOutboundDocumentId,
      paperDocumentVersion: legacyPaperDocument.documentVersion,
      paperDocumentRevision: legacyPaperDocument.revision,
      note: "PostgreSQL live 历史订单纸单交库房",
      idempotencyKey: "legacy-paper-handoff-f002-live-001",
    },
    { headers },
  );
  assert.equal(legacyPaperHandoff.paperOutboundDocument.status, "已交库房");
  const legacyBeforeWarehouseExecution = await getJson(baseUrl, "/api/fulfillments/F002", { headers });
  const legacyHandedPaperDocument = legacyBeforeWarehouseExecution.paperOutboundDocument;
  const legacyWarehouseExecution = await postJson(
    baseUrl,
    "/api/fulfillments/F002/warehouse-execution",
    {
      expectedRevision: legacyBeforeWarehouseExecution.revision,
      paperOutboundDocumentId: legacyHandedPaperDocument.paperOutboundDocumentId,
      paperDocumentVersion: legacyHandedPaperDocument.documentVersion,
      paperDocumentRevision: legacyHandedPaperDocument.revision,
      result: "实物已出库",
      actualQty: 1200,
      physicalExecutorEmployeeId: "EMP-MD-LIVE-001",
      feedbackChannel: "纸面",
      executedAt: "2026-07-02T12:00:00.000Z",
      note: "PostgreSQL live 历史库存匹配",
      allowUnreservedInventoryDeduction: true,
      idempotencyKey: "legacy-warehouse-execution-f002-live-001",
    },
    { headers },
  );
  assert.equal(legacyWarehouseExecution.status, "待司机装车");
  assert.equal(legacyWarehouseExecution.inventoryDeductionMode, "legacy_reserved_stock_match");
  assertPostgresOperationLogOperator(queryJson, legacyWarehouseExecution.operationLogId);
  const legacyInventoryAfterFulfillment = queryJson(
    "SELECT json_build_object('onHand', on_hand_qty, 'reserved', reserved_qty) AS result FROM inventory_items WHERE id = '25*32*10-白色-加长提-空白袋-B区-服装';",
  );
  assert.equal(Number(legacyInventoryAfterFulfillment.onHand), 900);
  assert.equal(Number(legacyInventoryAfterFulfillment.reserved), 0);
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM inventory_reservations WHERE order_line_id = 'ORD-0629-002-01';",
        { capture: true },
      ).trim(),
    ),
    0,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type = 'warehouse_physical_outbound_legacy' AND source_id = 'F002';",
        { capture: true },
      ).trim(),
    ),
    1,
  );

  const { warehouseHeaders } = await checkProductionApi(runtime, { baseUrl, headers, postJson, getJson });

  const apiPrintDevice = await postJson(
    baseUrl,
    "/api/print-devices",
    {
      printDeviceId: "PRN-LIVE-API-001",
      name: "API Postgres 标签机",
      deviceType: "label_printer",
      status: "active",
      connectionType: "system_printer",
      connectionUri: "system://postgres-live-label",
      driverName: "Postgres Live 203dpi Driver",
      supportedDocumentTypes: ["express_ltl_label", "package_label", "pickup_note", "delivery_note", "outbound_note"],
      defaultDocumentTypes: ["express_ltl_label", "pickup_note", "delivery_note"],
      paperWidthMm: 76,
      paperHeightMm: 50,
      paperName: "76x50 热敏标签",
      dpi: 203,
      defaultCopies: 1,
      darkness: 9,
      speed: 4,
      cutterEnabled: false,
      settings: { driverMode: "preview_only", source: "postgres-live-api" },
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  assert.equal(apiPrintDevice.printDevice.printDeviceId, "PRN-LIVE-API-001");
  assert.ok(apiPrintDevice.operationLogId);
  assertPostgresOperationLogOperator(queryJson, apiPrintDevice.operationLogId);
  assert.equal(
    queryJson(
      "SELECT json_build_object('paperWidthMm', paper_width_mm, 'driver', driver_name) AS result FROM printer_devices WHERE id = 'PRN-LIVE-API-001';",
    ).driver,
    "Postgres Live 203dpi Driver",
  );
  const apiPrintDevices = await getJson(baseUrl, "/api/print-devices?documentType=express_ltl_label", { headers });
  assert.ok(apiPrintDevices.total >= 1);
  assert.ok(apiPrintDevices.items.some((device) => device.printDeviceId === "PRN-LIVE-API-001"));

  const apiLivePrintDeviceMode = await postJson(
    baseUrl,
    "/api/print-devices/PRN-LIVE-API-001/driver-mode",
    {
      driverMode: "system_printer",
      operatorId: "U-SPOOFED",
      reason: "postgres live trusted print projection check",
    },
    { headers },
  );
  assert.equal(apiLivePrintDeviceMode.driverMode, "system_printer");
  const apiPrintCandidateFulfillments = await getJson(baseUrl, "/api/fulfillments?pageSize=50", { headers });
  const apiTrustedPrintFulfillment = apiPrintCandidateFulfillments.items.find((item) => {
    const count = queryJson(
      `SELECT json_build_object('count', COUNT(*)) AS result FROM print_records WHERE target_type = 'fulfillment' AND target_id = ${sqlLiteral(item.fulfillmentId)};`,
    ).count;
    return Number(count) === 0 && item.status !== "已交付";
  });
  assert.ok(apiTrustedPrintFulfillment?.fulfillmentId, "postgres live needs one unprinted fulfillment");
  const apiTrustedPrintInitialStatus = apiTrustedPrintFulfillment.status;
  const apiTrustedPrintMethod =
    apiTrustedPrintFulfillment.method === "express" || apiTrustedPrintFulfillment.method === "快递快运"
      ? "express"
      : apiTrustedPrintFulfillment.method === "delivery" || apiTrustedPrintFulfillment.method === "送货"
        ? "delivery"
        : "pickup";
  const apiTrustedPrintExpectedStatus =
    apiTrustedPrintMethod === "express" ? "待确认拉走" : apiTrustedPrintInitialStatus;
  const apiTrustedPrintRequest = await postJson(
    baseUrl,
    `/api/fulfillments/${apiTrustedPrintFulfillment.fulfillmentId}/print`,
    {
      templateId:
        apiTrustedPrintMethod === "express"
          ? "tpl-p0-express-ltl-label"
          : apiTrustedPrintMethod === "delivery"
            ? "tpl-p0-delivery-note"
            : "tpl-p0-pickup-note",
      documentType:
        apiTrustedPrintMethod === "express"
          ? "express_ltl_label"
          : apiTrustedPrintMethod === "delivery"
            ? "delivery_note"
            : "pickup_note",
      printDeviceId: "PRN-LIVE-API-001",
      printAction: "first_print",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  postgresAssertions.assertApiTrustedPrintInitial({ apiTrustedPrintRequest, apiTrustedPrintInitialStatus });
  assertPostgresOperationLogOperator(queryJson, apiTrustedPrintRequest.operationLogId);
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status) AS result FROM print_records WHERE id = ${sqlLiteral(apiTrustedPrintRequest.printRecord.printRecordId)};`,
    ).status,
    "submitted",
  );
  const apiTrustedPrintCallback = await postJson(
    baseUrl,
    `/api/print-jobs/${apiTrustedPrintRequest.printJob.printJobId}/driver-status`,
    {
      status: "printed",
      adapterName: "postgres-live-driver",
      eventSource: "driver_callback",
      driverStatus: "completed",
      eventAt: "2026-07-02T10:29:00.000Z",
      operatorId: "PRINT-DRIVER-FREEFORM",
    },
    { headers: printDriverHeaders },
  );
  assert.equal(apiTrustedPrintCallback.printRecord.status, "printed");
  assert.equal(apiTrustedPrintCallback.fulfillment.status, apiTrustedPrintExpectedStatus);
  assert.equal(apiTrustedPrintCallback.physicalPrintConfirmed, true);
  assert.ok(apiTrustedPrintCallback.operationLogId);
  assert.ok(apiTrustedPrintCallback.fulfillmentOperationLogId);
  assert.notEqual(apiTrustedPrintCallback.operationLogId, apiTrustedPrintCallback.fulfillmentOperationLogId);
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status) AS result FROM print_records WHERE id = ${sqlLiteral(apiTrustedPrintRequest.printRecord.printRecordId)};`,
    ).status,
    "printed",
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status) AS result FROM fulfillment_records WHERE id = ${sqlLiteral(apiTrustedPrintFulfillment.fulfillmentId)};`,
    ).status,
    apiTrustedPrintExpectedStatus,
  );
  const apiTrustedPrintProjectionLog = queryJson(
    `SELECT json_build_object('operatorId', operator_id, 'action', action) AS result FROM operation_logs WHERE id = ${sqlLiteral(apiTrustedPrintCallback.fulfillmentOperationLogId)};`,
  );
  assert.equal(apiTrustedPrintProjectionLog.operatorId, "U-PRINT-DRIVER-A");
  assert.equal(apiTrustedPrintProjectionLog.action, "confirm_fulfillment_print_from_driver");

  const apiSeedPrintJobWorkspace = { printJobs: [], operationLogs: [] };
  const apiSeedPrintJob = buildPrintJobRecord({
    printJobId: "PJ-LIVE-API-001",
    printRecordId: "PR-LIVE-FULFILLMENT-001",
    printDeviceId: "PRN-LIVE-API-001",
    jobStatus: "queued",
    driverMode: "system_printer",
  });
  await printJobRepository.createPrintJob({
    workspace: apiSeedPrintJobWorkspace,
    printJob: apiSeedPrintJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-API-PRINT-JOB-001",
      printJob: apiSeedPrintJob,
      action: "create_print_job",
    }),
  });
  const apiPrintJobList = await getJson(baseUrl, "/api/print-jobs?printRecordId=PR-LIVE-FULFILLMENT-001", {
    headers,
  });
  assert.ok(apiPrintJobList.items.some((job) => job.printJobId === "PJ-LIVE-API-001"));
  const apiDispatchedPrintJob = await postJson(
    baseUrl,
    "/api/print-jobs/PJ-LIVE-API-001/dispatch",
    {
      reason: "postgres live dispatch boundary",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  postgresAssertions.assertApiDispatchedPrintJob({ apiDispatchedPrintJob });
  assertPostgresOperationLogOperator(queryJson, apiDispatchedPrintJob.operationLogId);
  const apiFailedPrintJob = await postJson(
    baseUrl,
    "/api/print-jobs/PJ-LIVE-API-001/status",
    {
      status: "failed",
      errorCode: "LIVE_API_DRIVER_TIMEOUT",
      errorMessage: "postgres live API simulated driver timeout",
      reason: "postgres live status callback",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  postgresAssertions.assertApiFailedPrintJob({ apiFailedPrintJob });
  assertPostgresOperationLogOperator(queryJson, apiFailedPrintJob.operationLogId);
  const apiRetryPrintJob = await postJson(
    baseUrl,
    "/api/print-jobs/PJ-LIVE-API-001/retry",
    {
      retryReason: "postgres live retry",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  postgresAssertions.assertApiRetryPrintJob({ apiRetryPrintJob });
  assertPostgresOperationLogOperator(queryJson, apiRetryPrintJob.operationLogId);

  const apiPollingPrintJob = {
    ...buildPrintJobRecord({
      printJobId: "PJ-LIVE-API-POLL-001",
      printRecordId: "PR-LIVE-FULFILLMENT-001",
      printDeviceId: "PRN-LIVE-API-001",
      jobStatus: "sent",
      driverMode: "system_printer",
    }),
    queuedAt: "2026-07-02T10:40:00.000Z",
    sentAt: "2026-07-02T10:41:00.000Z",
    metadata: {
      source: "postgres-live",
      externalJobId: "DRY-PJ-LIVE-API-POLL-001",
    },
  };
  await printJobRepository.createPrintJob({
    workspace: apiSeedPrintJobWorkspace,
    printJob: apiPollingPrintJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-API-PRINT-JOB-POLL-001",
      printJob: apiPollingPrintJob,
      action: "create_print_job",
    }),
  });
  const deniedApiStatusPoll = await postJson(
    baseUrl,
    "/api/print-jobs/status-poll",
    {
      statuses: ["sent"],
      reason: "postgres live warehouse poll denial",
    },
    { headers: warehouseHeaders, expectedStatus: 403 },
  );
  assert.equal(deniedApiStatusPoll.requiredPermission, "print.job.callback");
  const apiStatusPoll = await postJson(
    baseUrl,
    "/api/print-jobs/status-poll",
    {
      statuses: ["sent"],
      reason: "postgres live dry-run poll",
    },
    { headers: printDriverHeaders },
  );
  const apiStatusPollItem = apiStatusPoll.items.find((item) => item.printJobId === "PJ-LIVE-API-POLL-001");
  assert.equal(apiStatusPollItem.beforeStatus, "sent");
  assert.equal(apiStatusPollItem.afterStatus, "printed");
  assert.equal(apiStatusPollItem.pollResult.adapterStatus, "dry_run_completed");
  assert.equal(apiStatusPollItem.driverStatusEvent.operatorId, "U-PRINT-DRIVER-A");
  assert.ok(apiStatusPollItem.operationLogId);
  assert.equal(
    queryJson(
      "SELECT json_build_object('status', job_status, 'eventSource', metadata_json->'lastDriverStatusEvent'->>'eventSource') AS result FROM print_jobs WHERE id = 'PJ-LIVE-API-POLL-001';",
    ).status,
    "printed",
  );
  const apiStatusPollOperationLog = queryJson(
    `SELECT json_build_object('operatorId', operator_id, 'action', action) AS result FROM operation_logs WHERE id = ${sqlLiteral(apiStatusPollItem.operationLogId)};`,
  );
  assert.equal(apiStatusPollOperationLog.operatorId, "U-PRINT-DRIVER-A");
  assert.equal(apiStatusPollOperationLog.action, "record_print_job_driver_status");

  const apiCallbackPrintJob = {
    ...buildPrintJobRecord({
      printJobId: "PJ-LIVE-API-CALLBACK-001",
      printRecordId: "PR-LIVE-FULFILLMENT-001",
      printDeviceId: "PRN-LIVE-API-001",
      jobStatus: "sent",
      driverMode: "system_printer",
    }),
    queuedAt: "2026-07-02T10:30:00.000Z",
    sentAt: "2026-07-02T10:31:00.000Z",
    metadata: {
      source: "postgres-live",
      externalJobId: "SYS-LIVE-API-CALLBACK-001",
    },
  };
  await printJobRepository.createPrintJob({
    workspace: apiSeedPrintJobWorkspace,
    printJob: apiCallbackPrintJob,
    operationLog: buildPrintJobOperationLog({
      logId: "LOG-LIVE-API-PRINT-JOB-CALLBACK-001",
      printJob: apiCallbackPrintJob,
      action: "create_print_job",
    }),
  });
  const apiCallbackPrintJobDetail = await getJson(baseUrl, "/api/print-jobs/PJ-LIVE-API-CALLBACK-001", {
    headers,
  });
  assert.equal(apiCallbackPrintJobDetail.printJob.jobStatus, "sent");
  const apiDriverStatusPrintJob = await postJson(
    baseUrl,
    "/api/print-jobs/PJ-LIVE-API-CALLBACK-001/driver-status",
    {
      status: "printed",
      externalJobId: "SYS-LIVE-API-CALLBACK-001",
      adapterName: "postgres-live-driver",
      eventSource: "driver_callback",
      driverStatus: "completed",
      eventAt: "2026-07-02T10:32:00.000Z",
      message: "postgres live callback completed",
      operatorId: "PRINT-DRIVER-FREEFORM",
    },
    { headers: printDriverHeaders },
  );
  postgresAssertions.assertApiDriverStatusPrintJob({ apiDriverStatusPrintJob });
  const apiDriverStatusOperationLog = queryJson(
    `SELECT json_build_object('operatorId', operator_id, 'action', action) AS result FROM operation_logs WHERE id = ${sqlLiteral(apiDriverStatusPrintJob.operationLogId)};`,
  );
  assert.equal(apiDriverStatusOperationLog.operatorId, "U-PRINT-DRIVER-A");
  assert.equal(apiDriverStatusOperationLog.action, "record_print_job_driver_status");

  const apiPrintBatchBody = {
    printBatchId: "PB-LIVE-API-001",
    idempotencyKey: "print-batch-live-api-001",
    action: "批量打印标签",
    resultLabel: "部分打出",
    status: "partial",
    todoIds: ["T-LIVE-API-PRINT-001"],
    todoRefs: ["ORD-LIVE-API-PRINT-001"],
    totalTaskCount: 1,
    totalLabelCount: 3,
    printedLabelCount: 2,
    pendingLabelCount: 1,
    printedPackageIds: ["PKG-LIVE-API-PRINT-001", "PKG-LIVE-API-PRINT-002"],
    pendingPackageIds: ["PKG-LIVE-API-PRINT-003"],
    printPackages: [
      { packageId: "PKG-LIVE-API-PRINT-001", packageSeq: 1, packageCount: 3, status: "printed" },
      { packageId: "PKG-LIVE-API-PRINT-002", packageSeq: 2, packageCount: 3, status: "printed" },
      { packageId: "PKG-LIVE-API-PRINT-003", packageSeq: 3, packageCount: 3, status: "not_printed" },
    ],
    operatorId: "U-SPOOFED",
    operatorName: "伪造操作人",
    createdAt: "今天 10:30",
  };
  const apiPrintBatch = await postJson(
    baseUrl,
    "/api/print-batches",
    apiPrintBatchBody,
    { headers },
  );
  postgresAssertions.assertApiPrintBatch({ apiPrintBatch });
  const replayedApiPrintBatch = await postJson(baseUrl, "/api/print-batches", apiPrintBatchBody, { headers });
  assert.equal(replayedApiPrintBatch.operationLogId, apiPrintBatch.operationLogId);
  assert.equal(
    queryJson(
      "SELECT json_build_object('status', status, 'pending', pending_package_ids[1]) AS result FROM print_batch_records WHERE id = 'PB-LIVE-API-001';",
    ).pending,
    "PKG-LIVE-API-PRINT-003",
  );
  const apiPrintBatchList = await getJson(baseUrl, "/api/print-batches?todoId=T-LIVE-API-PRINT-001", { headers });
  assert.equal(apiPrintBatchList.total, 1);
  assert.equal(apiPrintBatchList.items[0].printBatchId, "PB-LIVE-API-001");

  const voidCandidateDraft = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      draftId: "DRAFT-LIVE-VOID-001",
      sourceText: "张三服饰 30*38红5个 明天自提后取消",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  assert.equal(voidCandidateDraft.draft.clientRevision, 1);
  const voidCandidateOrder = await postJson(
    baseUrl,
    "/api/order-drafts/DRAFT-LIVE-VOID-001/confirm",
    {
      draftId: "DRAFT-LIVE-VOID-001",
      sourceText: "张三服饰 30*38红5个 明天自提后取消",
      customerId: "C001",
      operatorId: "U-OFFICE-A",
      confirmMode: "confirm_now",
      clientRevision: voidCandidateDraft.draft.clientRevision,
      lines: [
        {
          draftLineId: "DRAFT-LIVE-VOID-001-01",
          customerId: "C001",
          customer: "张三服饰",
          productName: "空白袋",
          size: "30*38*10",
          bagColor: "红色",
          handleType: "普通提",
          style: "空白袋",
          qty: 5,
          fulfillmentMethod: "自提",
          latestNeededAt: "明天",
          printFlag: false,
        },
      ],
    },
    { headers },
  );
  assert.equal(voidCandidateOrder.reservations.length, 1);
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1325,
  );
  const voidHeaders = { ...headers, "idempotency-key": "live-order-line-void-001" };
  const voidRequestBody = {
    reason: "order_cancelled",
    operatorId: "U-SPOOFED",
  };
  const apiVoidedOrderLine = await postJson(
    baseUrl,
    `/api/order-lines/${voidCandidateOrder.orderLines[0].id}/void`,
    voidRequestBody,
    { headers: voidHeaders },
  );
  postgresAssertions.assertApiVoidedOrderLine({ apiVoidedOrderLine, voidCandidateOrder });
  const replayedApiVoidedOrderLine = await postJson(
    baseUrl,
    `/api/order-lines/${voidCandidateOrder.orderLines[0].id}/void`,
    voidRequestBody,
    { headers: voidHeaders },
  );
  assert.deepEqual(replayedApiVoidedOrderLine, apiVoidedOrderLine);
  const rejectedVoidKeyReuse = await postJson(
    baseUrl,
    `/api/order-lines/${voidCandidateOrder.orderLines[0].id}/void`,
    { ...voidRequestBody, reason: "duplicate_order" },
    { headers: voidHeaders, expectedStatus: 409 },
  );
  assert.equal(rejectedVoidKeyReuse.code, "IDEMPOTENCY_KEY_REUSED");
  assertPostgresOperationLogOperator(queryJson, apiVoidedOrderLine.operationLogId);
  assert.equal(
    queryJson(
      `SELECT json_build_object('lineStatus', line_status, 'voidReason', void_reason) AS result FROM order_lines WHERE id = ${sqlLiteral(
        voidCandidateOrder.orderLines[0].id,
      )};`,
    ).lineStatus,
    "已关闭",
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status) AS result FROM fulfillment_records WHERE id = ${sqlLiteral(
        voidCandidateOrder.fulfillmentTasks[0].fulfillmentId,
      )};`,
    ).status,
    "已取消",
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status, 'reservedQty', reserved_qty) AS result FROM inventory_reservations WHERE id = ${sqlLiteral(
        voidCandidateOrder.reservations[0].reservationId,
      )};`,
    ).status,
    "已释放",
  );
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1320,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type = 'order_line_void' AND source_id = ${sqlLiteral(
          voidCandidateOrder.orderLines[0].id,
        )};`,
        { capture: true },
      ).trim(),
    ),
    1,
  );

  const quantityCandidateDraft = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      draftId: "DRAFT-LIVE-QTY-API-001",
      sourceText: "张三服饰 30*38红10个 明天自提改量",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  assert.equal(quantityCandidateDraft.draft.clientRevision, 1);
  const quantityCandidateOrder = await postJson(
    baseUrl,
    "/api/order-drafts/DRAFT-LIVE-QTY-API-001/confirm",
    {
      draftId: "DRAFT-LIVE-QTY-API-001",
      sourceText: "张三服饰 30*38红10个 明天自提改量",
      customerId: "C001",
      operatorId: "U-OFFICE-A",
      confirmMode: "confirm_now",
      clientRevision: quantityCandidateDraft.draft.clientRevision,
      lines: [
        {
          draftLineId: "DRAFT-LIVE-QTY-API-001-01",
          customerId: "C001",
          customer: "张三服饰",
          productName: "空白袋",
          size: "30*38*10",
          bagColor: "红色",
          handleType: "普通提",
          style: "空白袋",
          qty: 10,
          fulfillmentMethod: "自提",
          latestNeededAt: "明天",
          printFlag: false,
        },
      ],
    },
    { headers },
  );
  assert.equal(quantityCandidateOrder.reservations.length, 1);
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1330,
  );
  const decreaseHeaders = { ...headers, "idempotency-key": "live-order-line-qty-decrease-001" };
  const decreaseRequestBody = {
    orderLineId: quantityCandidateOrder.orderLines[0].id,
    newQty: 6,
    reason: "customer_change",
    operatorId: "U-SPOOFED",
  };
  const apiDecreasedOrderLine = await postJson(
    baseUrl,
    `/api/order-lines/${quantityCandidateOrder.orderLines[0].id}/quantity-adjustment`,
    decreaseRequestBody,
    { headers: decreaseHeaders },
  );
  postgresAssertions.assertApiDecreasedOrderLine({ apiDecreasedOrderLine, quantityCandidateOrder });
  const replayedApiDecreasedOrderLine = await postJson(
    baseUrl,
    `/api/order-lines/${quantityCandidateOrder.orderLines[0].id}/quantity-adjustment`,
    decreaseRequestBody,
    { headers: decreaseHeaders },
  );
  assert.deepEqual(replayedApiDecreasedOrderLine, apiDecreasedOrderLine);
  const rejectedQuantityKeyReuse = await postJson(
    baseUrl,
    `/api/order-lines/${quantityCandidateOrder.orderLines[0].id}/quantity-adjustment`,
    { ...decreaseRequestBody, newQty: 7 },
    { headers: decreaseHeaders, expectedStatus: 409 },
  );
  assert.equal(rejectedQuantityKeyReuse.code, "IDEMPOTENCY_KEY_REUSED");
  assertPostgresOperationLogOperator(queryJson, apiDecreasedOrderLine.operationLogId);
  assert.equal(
    queryJson(
      `SELECT json_build_object('originalQty', original_qty) AS result FROM order_lines WHERE id = ${sqlLiteral(
        quantityCandidateOrder.orderLines[0].id,
      )};`,
    ).originalQty,
    6,
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('expectedQty', expected_qty) AS result FROM fulfillment_records WHERE id = ${sqlLiteral(
        quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId,
      )};`,
    ).expectedQty,
    6,
  );
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1326,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT final_amount FROM price_snapshots WHERE id = ${sqlLiteral(apiDecreasedOrderLine.priceSnapshot.priceSnapshotId)};`,
        { capture: true },
      ).trim(),
    ),
    2.04,
  );

  const apiIncreasedOrderLine = await postJson(
    baseUrl,
    `/api/order-lines/${quantityCandidateOrder.orderLines[0].id}/quantity-adjustment`,
    {
      orderLineId: quantityCandidateOrder.orderLines[0].id,
      newQty: 8,
      reason: "customer_change",
      operatorId: "U-SPOOFED",
    },
    { headers: { ...headers, "idempotency-key": "live-order-line-qty-increase-001" } },
  );
  postgresAssertions.assertApiIncreasedOrderLine({ apiIncreasedOrderLine });
  assertPostgresOperationLogOperator(queryJson, apiIncreasedOrderLine.operationLogId);
  assert.equal(
    queryJson(
      `SELECT json_build_object('reservedQty', reserved_qty) AS result FROM inventory_reservations WHERE id = ${sqlLiteral(
        quantityCandidateOrder.reservations[0].reservationId,
      )};`,
    ).reservedQty,
    8,
  );
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1328,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT final_amount FROM price_snapshots WHERE id = ${sqlLiteral(apiIncreasedOrderLine.priceSnapshot.priceSnapshotId)};`,
        { capture: true },
      ).trim(),
    ),
    2.72,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type = 'order_line_quantity_adjustment' AND source_id = ${sqlLiteral(
          quantityCandidateOrder.orderLines[0].id,
        )};`,
        { capture: true },
      ).trim(),
    ),
    2,
  );
  const apiCancelledFulfillment = await postJson(
    baseUrl,
    `/api/fulfillments/${quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId}/cancel`,
    {
      fulfillmentId: quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId,
      reason: "office_correction",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  postgresAssertions.assertApiCancelledFulfillment({ apiCancelledFulfillment });
  assertPostgresOperationLogOperator(queryJson, apiCancelledFulfillment.operationLogId);
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status, 'actualQty', actual_qty) AS result FROM fulfillment_records WHERE id = ${sqlLiteral(
        quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId,
      )};`,
    ).status,
    "已取消",
  );
  const cancelledReservation = queryJson(
    `SELECT json_build_object('status', status, 'reservedQty', reserved_qty) AS result FROM inventory_reservations WHERE id = ${sqlLiteral(
      quantityCandidateOrder.reservations[0].reservationId,
    )};`,
  );
  assert.equal(cancelledReservation.status, "已释放");
  assert.equal(Number(cancelledReservation.reservedQty), 0);
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1320,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type = 'fulfillment_cancel' AND source_id = ${sqlLiteral(
          quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId,
        )};`,
        { capture: true },
      ).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM operation_logs WHERE target_type = 'fulfillment' AND target_id = ${sqlLiteral(
          quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId,
        )} AND action = 'cancel_fulfillment';`,
        { capture: true },
      ).trim(),
    ),
    1,
  );

  await checkStatementApi(runtime, { baseUrl, headers, scheduleHeaders, postJson, getJson, getBinary });

  const concurrentDraftId = "DRAFT-LIVE-CONCURRENT-001";
  const concurrentRecognition = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      draftId: concurrentDraftId,
      sourceText: "张三服饰 30*38白色20个 明天自提",
      operatorId: "U-OFFICE-A",
    },
    { headers: { ...headers, "idempotency-key": "live-concurrent-recognize-001" } },
  );
  assert.equal(concurrentRecognition.draft.clientRevision, 1);
  const concurrentLine = {
    draftLineId: `${concurrentDraftId}-01`,
    customerId: "C001",
    customer: "张三服饰",
    productName: "空白袋",
    size: "30*38*10",
    bagColor: "白色",
    handleType: "普通提",
    style: "空白袋",
    qty: 20,
    fulfillmentMethod: "自提",
    latestNeededAt: "明天",
    printFlag: false,
  };
  const concurrentBody = {
    sourceText: "张三服饰 30*38白色20个 明天自提",
    customerId: "C001",
    operatorId: "U-OFFICE-A",
    clientRevision: 1,
    draftStatus: "待审核",
    lines: [concurrentLine],
  };
  const concurrentResponses = await Promise.all(
    ["live-concurrent-save-a-001", "live-concurrent-save-b-001"].map((idempotencyKey) =>
      fetch(`${baseUrl}/api/order-drafts/${concurrentDraftId}`, {
        method: "PATCH",
        headers: {
          ...headers,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(concurrentBody),
      }),
    ),
  );
  assert.deepEqual(
    concurrentResponses.map((response) => response.status).sort((left, right) => left - right),
    [200, 409],
  );
  const concurrentPayloads = await Promise.all(concurrentResponses.map((response) => response.json()));
  assert.equal(concurrentPayloads.find((payload) => payload.draft)?.draft.clientRevision, 2);
  assert.equal(concurrentPayloads.find((payload) => payload.code)?.code, "BUSINESS_WRITE_CONFLICT");
  assert.equal(
    queryJson(`SELECT json_build_object('revision', revision) AS result FROM order_drafts WHERE id = ${sqlLiteral(concurrentDraftId)};`).revision,
    2,
  );

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
  const resumedDraft = await patchJson(
    baseUrl,
    `/api/order-drafts/${concurrentDraftId}`,
    { ...concurrentBody, clientRevision: 2, sourceText: "API 重启后继续保存草稿" },
    { headers: { ...headers, "idempotency-key": "live-restart-save-001" } },
  );
  assert.equal(resumedDraft.draft.clientRevision, 3);

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
