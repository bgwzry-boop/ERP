import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";
import {
  buildBusinessDecisionAttachmentLinksCte,
  buildInsertBusinessDecisionCte,
  buildSupersedeBusinessDecisionCte,
  normalizeDecisionRecord,
} from "./businessDecisionEvidenceRepository.mjs";

export function createProductionScheduleRecordRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_PRODUCTION_SCHEDULE_RECORD_STORE ??
    process.env.ERP_PRODUCTION_SCHEDULE_STORE ??
    process.env.ERP_PRODUCTION_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresProductionScheduleRecordRepository({
      ...options,
      databaseUrl:
        options.databaseUrl ??
        process.env.ERP_PRODUCTION_SCHEDULE_DATABASE_URL ??
        process.env.ERP_PRODUCTION_DATABASE_URL ??
        process.env.DATABASE_URL ??
        process.env.PGURL,
    });
  }
  if (mode === "local") return createLocalProductionScheduleRecordRepository();
  throw new Error(`Unsupported production schedule record repository mode: ${mode}`);
}

export function createLocalProductionScheduleRecordRepository() {
  return {
    kind: "local_memory",

    loadState() {
      return { productionScheduleRecords: [] };
    },

    listProductionScheduleRecords({ workspace, filters = {} } = {}) {
      return filterProductionScheduleRecords(workspace?.productionScheduleRecords ?? [], filters);
    },

    resequenceMachineQueue(input = {}) {
      const records = normalizeProductionScheduleRecords(input.records ?? []);
      const operationLog = normalizeOperationLogForPersistence(input.operationLog);
      if (!records.length || !operationLog) {
        throw new Error("Production schedule records and operation log are required for resequencing");
      }
      return commitLocalScheduleDecision({ ...input, idempotencyScope: "production.schedule.resequence" }, (stagedWorkspace) => {
        applyProductionScheduleRecordWorkspaceMutation({
          workspace: stagedWorkspace,
          records,
        });
        return {
          productionScheduleRecords: records,
          transactionContext: normalizeTransactionContext(input.transactionContext),
          operationLogId: operationLog.id,
        };
      });
    },

    moveMachineQueueItem(input = {}) {
      const records = normalizeProductionScheduleRecords(input.records ?? []);
      const productionTask = normalizeProductionTaskForMachineMove(input.productionTask);
      const operationLog = normalizeOperationLogForPersistence(input.operationLog);
      if (!records.length || !productionTask || !operationLog) {
        throw new Error("Production task, schedule records, and operation log are required for moving a schedule item");
      }
      return commitLocalScheduleDecision({ ...input, idempotencyScope: "production.schedule.move" }, (stagedWorkspace) => {
        applyProductionScheduleRecordWorkspaceMutation({
          workspace: stagedWorkspace,
          records,
          productionTask,
        });
        return {
          productionTask,
          productionScheduleRecords: records,
          transactionContext: normalizeTransactionContext(input.transactionContext),
          operationLogId: operationLog.id,
        };
      });
    },
  };
}

export function createPostgresProductionScheduleRecordRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient =
    options.postgresClient ??
    (options.queryJson || options.transactionJson || options.idempotentTransactionJson
      ? null
      : createPostgresPoolClient({ databaseUrl }));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor({ ...options, databaseUrl, postgresClient });

  return {
    kind: "postgres",

    async loadState() {
      const builtQuery = buildListProductionScheduleRecordsQuery({});
      return {
        productionScheduleRecords: normalizeProductionScheduleRecords(
          await queryJson(builtQuery.text, builtQuery.values),
        ),
      };
    },

    async listProductionScheduleRecords({ filters = {} } = {}) {
      const builtQuery = buildListProductionScheduleRecordsQuery(filters);
      return normalizeProductionScheduleRecords(await queryJson(builtQuery.text, builtQuery.values));
    },

    async resequenceMachineQueue(input = {}) {
      const builtQuery = buildResequenceProductionScheduleRecordsTransactionQuery(input);
      const result = normalizeProductionScheduleResequenceResult(
        await executeIdempotentScheduleTransaction({
          input,
          scope: "production.schedule.resequence",
          query: builtQuery,
          idempotentTransactionJson,
          resourceLocks: buildScheduleResourceLocks(input),
        }),
      );
      if (!result.productionScheduleRecords.length) {
        throw new Error("PostgreSQL production schedule resequence returned no records");
      }
      applyProductionScheduleRecordWorkspaceMutation({
        workspace: input.workspace,
        records: result.productionScheduleRecords,
        operationLog: toSavedOperationLog(input.operationLog, result.operationLogId),
      });
      applyDecisionWorkspaceMutation(input.workspace, result.businessDecision, input.attachmentLinks);
      return result;
    },

    async moveMachineQueueItem(input = {}) {
      const builtQuery = buildMoveProductionScheduleQueueItemTransactionQuery(input);
      const result = normalizeProductionScheduleMoveResult(
        await executeIdempotentScheduleTransaction({
          input,
          scope: "production.schedule.move",
          query: builtQuery,
          idempotentTransactionJson,
          resourceLocks: buildScheduleResourceLocks(input),
        }),
      );
      if (!result.productionTask || !result.productionScheduleRecords.length) {
        throw new Error("PostgreSQL production schedule move returned no production task or schedule records");
      }
      applyProductionScheduleRecordWorkspaceMutation({
        workspace: input.workspace,
        records: result.productionScheduleRecords,
        productionTask: result.productionTask,
        operationLog: toSavedOperationLog(input.operationLog, result.operationLogId),
      });
      applyDecisionWorkspaceMutation(input.workspace, result.businessDecision, input.attachmentLinks);
      return result;
    },
  };
}

function commitLocalScheduleDecision(input, applyMutation) {
  if (!input.decisionRecord?.id || typeof applyMutation !== "function") {
    throw new Error("A business decision is required for production schedule changes");
  }
  const committed = input.workspace.businessDecisionEvidenceRepository.commitDecisionBundle({
    workspace: input.workspace,
    decisionRecord: input.decisionRecord,
    attachmentLinks: input.attachmentLinks,
    operationLog: input.operationLog,
    idempotencyScope: cleanText(input.idempotencyScope) || "production.schedule.change",
    idempotencyKey: input.idempotencyKey,
    idempotencyPayload: input.idempotencyPayload,
    applyBusinessMutation(stagedWorkspace) {
      assertLocalScheduleConcurrency(stagedWorkspace, input);
      const result = applyMutation(stagedWorkspace);
      return {
        commitKeys: ["productionScheduleRecords", "productionTasks"],
        result,
      };
    },
  });
  return {
    ...committed.businessResult,
    businessDecision: committed.businessDecision,
    replayed: committed.replayed === true,
  };
}

function buildScheduleDecisionCtes(input, parameters) {
  const decisionRecord = normalizeDecisionRecord(input.decisionRecord);
  if (!decisionRecord) throw new Error("A business decision is required for production schedule changes");
  return `superseded_business_decision AS (
  ${buildSupersedeBusinessDecisionCte(decisionRecord, parameters, "write_guard")}
),
inserted_business_decision AS (
  ${buildInsertBusinessDecisionCte(decisionRecord, parameters, "write_guard")}
),
inserted_business_decision_attachment_links AS (
  ${buildBusinessDecisionAttachmentLinksCte(input.attachmentLinks, parameters, "inserted_business_decision")}
)`;
}

function executeIdempotentScheduleTransaction({ input, scope, query, idempotentTransactionJson, resourceLocks }) {
  return idempotentTransactionJson(
    buildPostgresIdempotencyRequest({
      scope,
      idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
      payload: input.idempotencyPayload ?? {},
      operatorId: input.operationLog?.operatorId,
      targetType: input.operationLog?.targetType,
      targetId: input.operationLog?.targetId,
      resourceLocks,
      query,
    }),
  );
}

function applyDecisionWorkspaceMutation(workspace, businessDecision, attachmentLinks = []) {
  const decision = normalizeDecisionRecord(businessDecision);
  if (!workspace || !decision) return;
  workspace.businessDecisionRecords = upsertById(workspace.businessDecisionRecords ?? [], decision);
  for (const link of Array.isArray(attachmentLinks) ? attachmentLinks : []) {
    workspace.attachmentLinks = upsertById(workspace.attachmentLinks ?? [], link);
  }
}

function assertLocalScheduleConcurrency(workspace, input) {
  const machineIds = normalizeMachineIds(input);
  const currentRecords = normalizeProductionScheduleRecords(workspace.productionScheduleRecords ?? [])
    .filter((record) => machineIds.includes(record.machineId));
  if (Number.isInteger(Number(input.expectedQueueRevision))) {
    const currentQueueRevision = currentRecords.reduce((sum, record) => sum + positiveRevision(record.revision), 0);
    if (currentQueueRevision !== Number(input.expectedQueueRevision)) {
      throw scheduleConflict({ currentRevision: currentQueueRevision });
    }
  }
  const expectedRecords = normalizeExpectedScheduleRecords(input.expectedRecords ?? []);
  if (expectedRecords.length !== currentRecords.length || expectedRecords.some((expected) => {
    const current = currentRecords.find(
      (record) => record.machineId === expected.machineId && record.productionTaskId === expected.productionTaskId,
    );
    return !current || current.revision !== expected.revision;
  })) {
    throw scheduleConflict({ currentRecords: currentRecords.map((record) => ({
      productionTaskId: record.productionTaskId,
      machineId: record.machineId,
      revision: record.revision,
    })) });
  }
  const expectedTask = normalizeProductionTaskForMachineMove(input.productionTask);
  if (expectedTask) {
    const currentTask = (workspace.productionTasks ?? []).find(
      (task) => cleanText(task.productionTaskId ?? task.id) === expectedTask.productionTaskId,
    );
    if (!currentTask || positiveRevision(currentTask.revision) !== expectedTask.revision) {
      throw scheduleConflict({ currentRevision: positiveRevision(currentTask?.revision) });
    }
  }
}

function scheduleConflict(details) {
  const error = new Error("排产记录已被另一位办公室人员更新，请刷新后重新确认。");
  error.statusCode = 409;
  error.code = "BUSINESS_WRITE_CONFLICT";
  error.details = details;
  return error;
}

function buildScheduleResourceLocks(input) {
  const machineIds = normalizeMachineIds(input);
  const taskIds = [
    input.productionTask?.productionTaskId ?? input.productionTask?.id,
    ...(input.records ?? []).map((record) => record.productionTaskId ?? record.production_task_id),
  ];
  return [
    ...machineIds.map((machineId) => `production-schedule-machine:${machineId}`),
    ...taskIds.map((taskId) => cleanText(taskId)).filter(Boolean).map((taskId) => `production-task:${taskId}`),
  ];
}

function toSavedOperationLog(operationLog, operationLogId) {
  const id = cleanText(operationLogId);
  return operationLog && id ? { ...operationLog, id } : null;
}

export function buildResequenceProductionScheduleRecordsTransactionSql(input = {}) {
  return buildResequenceProductionScheduleRecordsTransactionQuery(input).text;
}

export function buildResequenceProductionScheduleRecordsTransactionQuery(input = {}) {
  const records = normalizeProductionScheduleRecords(input.records ?? []);
  const expectedRecords = normalizeExpectedScheduleRecords(input.expectedRecords ?? input.expected_records ?? []);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!records.length || !operationLog) {
    throw new Error("Production schedule records and operation log are required for resequencing");
  }

  const parameters = createPostgresParameterBinder();
  const machineIds = normalizeMachineIds({ ...input, records, expectedRecords });
  const writeGuardCtes = buildScheduleWriteGuardCtes({
    expectedRecords,
    machineIds,
    expectedQueueRevision: input.expectedQueueRevision,
  }, parameters);
  const operationLogSql = buildInsertOperationLogSql(operationLog, parameters, "write_guard");
  const decisionCtes = buildScheduleDecisionCtes(input, parameters);
  const transactionContext = parameters.json(normalizeTransactionContext(input.transactionContext));
  return {
    text: `
BEGIN;
WITH ${writeGuardCtes}
upserted_schedule_records AS (
  ${buildUpsertProductionScheduleRecordsSql(records, parameters, "write_guard")}
),
inserted_operation_log AS (
  ${operationLogSql}
),
${decisionCtes}
SELECT json_build_object(
  'productionScheduleRecords', (
    SELECT COALESCE(json_agg(result ORDER BY (result->>'machineId'), (result->>'queueSeq')::int, result->>'productionTaskId'), '[]'::json)
    FROM upserted_schedule_records
  ),
  'transactionContext', ${transactionContext},
  'businessDecision', (SELECT result FROM inserted_business_decision),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildUpsertProductionScheduleRecordsSql(records, parameters, dependency = "") {
  const normalized = normalizeProductionScheduleRecords(records ?? []);
  if (!normalized.length) return "SELECT NULL::json AS result WHERE false";
  const values = normalized
    .map((record) => buildProductionScheduleRecordValuesSql(record, parameters))
    .join(",\n    ");
  return `INSERT INTO production_schedule_records (
    id,
    biz_no,
    production_task_id,
    order_line_id,
    published_schedule_id,
    machine_id,
    queue_seq,
    schedule_status,
    source_kind,
    revision,
    planned_start_at,
    planned_end_at,
    sequence_updated_at,
    sequence_updated_by,
    remark,
    created_by,
    created_at,
    updated_at
  ) ${buildScheduleRecordsInsertSource(values, dependency)}
  ON CONFLICT (machine_id, production_task_id) DO UPDATE SET
    order_line_id = EXCLUDED.order_line_id,
    published_schedule_id = EXCLUDED.published_schedule_id,
    queue_seq = EXCLUDED.queue_seq,
    schedule_status = EXCLUDED.schedule_status,
    source_kind = EXCLUDED.source_kind,
    revision = production_schedule_records.revision + 1,
    planned_start_at = EXCLUDED.planned_start_at,
    planned_end_at = EXCLUDED.planned_end_at,
    sequence_updated_at = EXCLUDED.sequence_updated_at,
    sequence_updated_by = EXCLUDED.sequence_updated_by,
    remark = EXCLUDED.remark,
    updated_at = now()
  RETURNING ${productionScheduleRecordJsonExpression("production_schedule_records")} AS result`;
}

export function buildMoveProductionScheduleQueueItemTransactionSql(input = {}) {
  return buildMoveProductionScheduleQueueItemTransactionQuery(input).text;
}

export function buildMoveProductionScheduleQueueItemTransactionQuery(input = {}) {
  const records = normalizeProductionScheduleRecords(input.records ?? []);
  const expectedRecords = normalizeExpectedScheduleRecords(input.expectedRecords ?? input.expected_records ?? []);
  const productionTask = normalizeProductionTaskForMachineMove(input.productionTask);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!records.length || !productionTask || !operationLog) {
    throw new Error("Production task, schedule records, and operation log are required for moving a schedule item");
  }

  const parameters = createPostgresParameterBinder();
  const machineId = parameters.text(productionTask.machineId);
  const productionTaskId = parameters.text(productionTask.productionTaskId);
  const scheduleRecordValues = records.map((record) => buildProductionScheduleRecordValuesSql(record, parameters)).join(",\n    ");
  const machineIds = normalizeMachineIds({ ...input, records, expectedRecords });
  const writeGuardCtes = buildScheduleWriteGuardCtes({ expectedRecords, machineIds, productionTask }, parameters);
  const operationLogSql = buildInsertOperationLogSql(operationLog, parameters, "write_guard");
  const decisionCtes = buildScheduleDecisionCtes(input, parameters);
  const transactionContext = parameters.json(normalizeTransactionContext(input.transactionContext));
  return {
    text: `
BEGIN;
WITH ${writeGuardCtes}
updated_production_task AS (
  UPDATE production_tasks
  SET
    machine_id = ${machineId},
    revision = production_tasks.revision + 1,
    updated_at = now()
  WHERE id = ${productionTaskId}
    AND EXISTS (SELECT 1 FROM write_guard WHERE ok)
  RETURNING ${productionTaskJsonExpression("production_tasks")} AS result
),
upserted_schedule_records AS (
  INSERT INTO production_schedule_records (
    id,
    biz_no,
    production_task_id,
    order_line_id,
    published_schedule_id,
    machine_id,
    queue_seq,
    schedule_status,
    source_kind,
    revision,
    planned_start_at,
    planned_end_at,
    sequence_updated_at,
    sequence_updated_by,
    remark,
    created_by,
    created_at,
    updated_at
  ) ${buildScheduleRecordsInsertSource(scheduleRecordValues, "write_guard")}
  ON CONFLICT (machine_id, production_task_id) DO UPDATE SET
    order_line_id = EXCLUDED.order_line_id,
    published_schedule_id = EXCLUDED.published_schedule_id,
    queue_seq = EXCLUDED.queue_seq,
    schedule_status = EXCLUDED.schedule_status,
    source_kind = EXCLUDED.source_kind,
    revision = production_schedule_records.revision + 1,
    planned_start_at = EXCLUDED.planned_start_at,
    planned_end_at = EXCLUDED.planned_end_at,
    sequence_updated_at = EXCLUDED.sequence_updated_at,
    sequence_updated_by = EXCLUDED.sequence_updated_by,
    remark = EXCLUDED.remark,
    updated_at = now()
  RETURNING ${productionScheduleRecordJsonExpression("production_schedule_records")} AS result
),
inserted_operation_log AS (
  ${operationLogSql}
),
${decisionCtes}
SELECT json_build_object(
  'productionTask', (SELECT result FROM updated_production_task),
  'productionScheduleRecords', (
    SELECT COALESCE(json_agg(result ORDER BY (result->>'machineId'), (result->>'queueSeq')::int, result->>'productionTaskId'), '[]'::json)
    FROM upserted_schedule_records
  ),
  'transactionContext', ${transactionContext},
  'businessDecision', (SELECT result FROM inserted_business_decision),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildListProductionScheduleRecordsSql(filters = {}) {
  return buildListProductionScheduleRecordsQuery(filters).text;
}

export function buildListProductionScheduleRecordsQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const where = buildProductionScheduleRecordWhereClause(filters, parameters);
  return {
    text: `
SELECT COALESCE(json_agg(record ORDER BY record->>'machineId', (record->>'queueSeq')::int, record->>'productionTaskId'), '[]'::json) AS result
FROM (
  SELECT ${productionScheduleRecordJsonExpression("production_schedule_records")} AS record
  FROM production_schedule_records
  ${where}
  ORDER BY machine_id ASC, queue_seq ASC, production_task_id ASC
) AS ordered_schedule_records;
`.trim(),
    values: parameters.values,
  };
}

export function normalizeProductionScheduleResequenceResult(value) {
  return {
    productionScheduleRecords: normalizeProductionScheduleRecords(
      value?.productionScheduleRecords ?? value?.production_schedule_records ?? [],
    ),
    transactionContext: normalizeTransactionContext(value?.transactionContext ?? value?.transaction_context),
    businessDecision: normalizeDecisionRecord(value?.businessDecision ?? value?.business_decision),
    operationLogId: cleanText(value?.operationLogId ?? value?.operation_log_id),
  };
}

export function normalizeProductionScheduleMoveResult(value) {
  return {
    productionTask: normalizeProductionTaskForMachineMove(value?.productionTask ?? value?.production_task),
    productionScheduleRecords: normalizeProductionScheduleRecords(
      value?.productionScheduleRecords ?? value?.production_schedule_records ?? [],
    ),
    transactionContext: normalizeTransactionContext(value?.transactionContext ?? value?.transaction_context),
    businessDecision: normalizeDecisionRecord(value?.businessDecision ?? value?.business_decision),
    operationLogId: cleanText(value?.operationLogId ?? value?.operation_log_id),
  };
}

export function normalizeProductionScheduleRecords(value) {
  if (!Array.isArray(value)) return [];
  return value.map((record) => normalizeProductionScheduleRecord(record)).filter(Boolean);
}

export function ensurePublishedTaskScheduleRecords({ productionTasks = [], records = [] } = {}) {
  const normalized = normalizeProductionScheduleRecords(records);
  const existingKeys = new Set(
    normalized.map((record) => `${record.machineId}::${record.productionTaskId}`),
  );
  for (const task of Array.isArray(productionTasks) ? productionTasks : []) {
    const productionTaskId = cleanText(task?.productionTaskId ?? task?.id);
    const machineId = cleanText(task?.machineId ?? task?.machine_id);
    const publishedScheduleId = cleanText(task?.publishedScheduleId ?? task?.published_schedule_id);
    const key = `${machineId}::${productionTaskId}`;
    if (!productionTaskId || !machineId || !publishedScheduleId || existingKeys.has(key)) continue;
    const createdAt = cleanText(task?.createdAt ?? task?.created_at) || new Date().toISOString();
    const updatedAt = cleanText(task?.updatedAt ?? task?.updated_at) || createdAt;
    const scheduleRecordId = `SQR-BACKFILL-${scheduleRecordPart(machineId)}-${scheduleRecordPart(productionTaskId)}`;
    normalized.push(normalizeProductionScheduleRecord({
      id: scheduleRecordId,
      scheduleRecordId,
      productionTaskId,
      orderLineId: cleanText(task?.orderLineId ?? task?.order_line_id ?? task?.lineId),
      publishedScheduleId,
      machineId,
      queueSeq: 0,
      status: "active",
      sourceKind: "schedule_publish_backfill",
      revision: 1,
      sequenceUpdatedAt: updatedAt,
      sequenceUpdatedBy: cleanText(task?.createdBy ?? task?.created_by),
      remark: "已发布排产记录补齐",
      createdBy: cleanText(task?.createdBy ?? task?.created_by),
      createdAt,
      updatedAt,
    }));
    existingKeys.add(key);
  }
  return normalized.filter(Boolean);
}

function normalizeExpectedScheduleRecords(value) {
  if (!Array.isArray(value)) return [];
  const records = value
    .map((record) => {
      const machineId = cleanText(record?.machineId ?? record?.machine_id);
      const productionTaskId = cleanText(record?.productionTaskId ?? record?.production_task_id);
      if (!machineId || !productionTaskId) return null;
      return {
        machineId,
        productionTaskId,
        revision: positiveRevision(record?.revision),
      };
    })
    .filter(Boolean);
  return [...new Map(records.map((record) => [`${record.machineId}::${record.productionTaskId}`, record])).values()];
}

function normalizeTransactionContext(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function normalizeMachineIds(input = {}) {
  const values = [
    ...(Array.isArray(input.machineIds) ? input.machineIds : []),
    ...(Array.isArray(input.lockedMachineIds) ? input.lockedMachineIds : []),
    ...(Array.isArray(input.records) ? input.records.map((record) => record.machineId ?? record.machine_id) : []),
    ...(Array.isArray(input.expectedRecords)
      ? input.expectedRecords.map((record) => record.machineId ?? record.machine_id)
      : []),
  ];
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))].sort();
}

export function normalizeProductionScheduleRecord(value = {}) {
  if (!value || typeof value !== "object") return null;
  const scheduleRecordId = cleanText(value.scheduleRecordId ?? value.schedule_record_id ?? value.id);
  const productionTaskId = cleanText(value.productionTaskId ?? value.production_task_id);
  const machineId = cleanText(value.machineId ?? value.machine_id);
  if (!scheduleRecordId || !productionTaskId || !machineId) return null;
  const updatedAt = cleanText(value.updatedAt ?? value.updated_at ?? value.sequenceUpdatedAt ?? value.sequence_updated_at);
  const createdAt = cleanText(value.createdAt ?? value.created_at) || updatedAt || new Date().toISOString();
  const sourceKind = cleanText(value.sourceKind ?? value.source_kind ?? value.source) || "manual_resequence";
  const status = cleanText(value.status ?? value.scheduleStatus ?? value.schedule_status) || "active";
  return {
    id: scheduleRecordId,
    scheduleRecordId,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || scheduleRecordId,
    productionTaskId,
    orderLineId: cleanText(value.orderLineId ?? value.order_line_id),
    publishedScheduleId: cleanText(value.publishedScheduleId ?? value.published_schedule_id),
    machineId,
    queueSeq: Math.max(0, toFiniteInteger(value.queueSeq ?? value.queue_seq, 0)),
    status,
    scheduleStatus: status,
    source: sourceKind,
    sourceKind,
    revision: positiveRevision(value.revision),
    plannedStartAt: cleanText(value.plannedStartAt ?? value.planned_start_at),
    plannedEndAt: cleanText(value.plannedEndAt ?? value.planned_end_at),
    sequenceUpdatedAt: cleanText(value.sequenceUpdatedAt ?? value.sequence_updated_at ?? updatedAt),
    sequenceUpdatedBy: cleanText(value.sequenceUpdatedBy ?? value.sequence_updated_by ?? value.updatedBy ?? value.updated_by),
    remark: cleanText(value.remark),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    createdAt,
    updatedBy: cleanText(value.updatedBy ?? value.updated_by ?? value.sequenceUpdatedBy ?? value.sequence_updated_by),
    updatedAt: updatedAt || createdAt,
  };
}

function applyProductionScheduleRecordWorkspaceMutation(input = {}) {
  const workspace = input.workspace;
  if (!workspace) return;
  const productionTask = normalizeProductionTaskForMachineMove(input.productionTask);
  if (productionTask) {
    workspace.productionTasks = upsertProductionTask(workspace.productionTasks ?? [], productionTask);
  }
  for (const record of normalizeProductionScheduleRecords(input.records ?? [])) {
    workspace.productionScheduleRecords = upsertProductionScheduleRecord(
      workspace.productionScheduleRecords ?? [],
      toWorkspaceProductionScheduleRecord(record),
    );
  }
  if (input.operationLog) {
    workspace.operationLogs = upsertById(workspace.operationLogs ?? [], input.operationLog);
  }
}

function filterProductionScheduleRecords(records = [], filters = {}) {
  const machineId = cleanText(filters.machineId ?? filters.machine_id);
  const status = cleanText(filters.status ?? filters.scheduleStatus ?? filters.schedule_status);
  const productionTaskId = cleanText(filters.productionTaskId ?? filters.production_task_id);
  return normalizeProductionScheduleRecords(records)
    .filter((record) => !machineId || record.machineId === machineId)
    .filter((record) => !status || record.status === status)
    .filter((record) => !productionTaskId || record.productionTaskId === productionTaskId)
    .sort(sortProductionScheduleRecord);
}

function buildProductionScheduleRecordWhereClause(filters = {}, parameters) {
  const clauses = [];
  const machineId = cleanText(filters.machineId ?? filters.machine_id);
  const status = cleanText(filters.status ?? filters.scheduleStatus ?? filters.schedule_status);
  const productionTaskId = cleanText(filters.productionTaskId ?? filters.production_task_id);
  if (machineId) clauses.push(`machine_id = ${parameters.text(machineId)}`);
  if (status) clauses.push(`schedule_status = ${parameters.text(status)}`);
  if (productionTaskId) clauses.push(`production_task_id = ${parameters.text(productionTaskId)}`);
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function buildScheduleWriteGuardCtes({ expectedRecords, machineIds, productionTask, expectedQueueRevision }, parameters) {
  const expectedPayload = expectedRecords.map((record) => ({
    machine_id: record.machineId,
    production_task_id: record.productionTaskId,
    revision: record.revision,
  }));
  const productionTaskCondition = productionTask
    ? `EXISTS (
      SELECT 1 FROM locked_production_task
      WHERE revision = ${parameters.integer(productionTask.revision)}
        AND task_status <> '已完成'
    )`
    : "TRUE";
  const queueRevisionCondition = Number.isInteger(Number(expectedQueueRevision))
    ? `(SELECT COALESCE(SUM(revision), 0) FROM locked_schedule_records) = ${parameters.integer(Number(expectedQueueRevision))}`
    : "TRUE";
  return `expected_schedule_records AS MATERIALIZED (
  SELECT
    expected.machine_id,
    expected.production_task_id,
    expected.revision
  FROM jsonb_to_recordset(${parameters.json(expectedPayload)}) AS expected(
    machine_id text,
    production_task_id text,
    revision integer
  )
),
locked_schedule_records AS MATERIALIZED (
  SELECT id, machine_id, production_task_id, revision
  FROM production_schedule_records
  WHERE machine_id = ANY(${parameters.textArray(machineIds)})
  FOR UPDATE
),
locked_production_task AS MATERIALIZED (
  SELECT id, revision, task_status
  FROM production_tasks
  WHERE id = ${parameters.text(productionTask?.productionTaskId ?? "")}
  FOR UPDATE
),
write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM locked_schedule_records) = (SELECT COUNT(*) FROM expected_schedule_records)
    AND NOT EXISTS (
      SELECT 1
      FROM expected_schedule_records AS expected
      LEFT JOIN locked_schedule_records AS locked
        ON locked.machine_id = expected.machine_id
       AND locked.production_task_id = expected.production_task_id
       AND locked.revision = expected.revision
      WHERE locked.id IS NULL
    ),
    'ERP_PRODUCTION_SCHEDULE_QUEUE_CONCURRENCY_CONFLICT'
  )
  AND erp_require(${queueRevisionCondition}, 'ERP_PRODUCTION_SCHEDULE_QUEUE_CONCURRENCY_CONFLICT')
  AND erp_require(${productionTaskCondition}, 'ERP_PRODUCTION_TASK_CONCURRENCY_CONFLICT') AS ok
),`;
}

function buildScheduleRecordsInsertSource(values, dependency) {
  const columns = [
    "id",
    "biz_no",
    "production_task_id",
    "order_line_id",
    "published_schedule_id",
    "machine_id",
    "queue_seq",
    "schedule_status",
    "source_kind",
    "revision",
    "planned_start_at",
    "planned_end_at",
    "sequence_updated_at",
    "sequence_updated_by",
    "remark",
    "created_by",
    "created_at",
    "updated_at",
  ];
  return `SELECT payload.*
FROM (VALUES
    ${values}
) AS payload(${columns.join(", ")})
JOIN ${dependency} ON ${dependency}.ok`;
}

function buildProductionScheduleRecordValuesSql(record, parameters) {
  return `(
      ${parameters.text(record.scheduleRecordId)},
      ${parameters.text(record.bizNo || record.scheduleRecordId)},
      ${parameters.text(record.productionTaskId)},
      ${parameters.nullableText(record.orderLineId)},
      ${parameters.text(record.publishedScheduleId)},
      ${parameters.text(record.machineId)},
      ${parameters.integer(record.queueSeq)},
      ${parameters.text(record.status)},
      ${parameters.text(record.sourceKind)},
      1,
      ${parameters.nullableTimestamp(record.plannedStartAt)},
      ${parameters.nullableTimestamp(record.plannedEndAt)},
      ${parameters.nullableTimestamp(record.sequenceUpdatedAt || record.updatedAt)},
      ${parameters.nullableText(record.sequenceUpdatedBy || record.updatedBy)},
      ${parameters.text(record.remark)},
      ${parameters.nullableText(record.createdBy)},
      ${parameters.timestamp(record.createdAt)},
      ${parameters.timestamp(record.updatedAt)}
    )`;
}

function productionTaskJsonExpression(alias) {
  return `json_build_object(
    'productionTaskId', ${alias}.id,
    'id', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'taskType', ${alias}.task_type,
    'machineId', ${alias}.machine_id,
    'plannedQty', ${alias}.planned_qty,
    'taskStatus', ${alias}.task_status,
    'status', ${alias}.task_status,
    'publishedScheduleId', ${alias}.published_schedule_id,
    'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
  )`;
}

function productionScheduleRecordJsonExpression(alias) {
  return `json_build_object(
    'scheduleRecordId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'productionTaskId', ${alias}.production_task_id,
    'orderLineId', ${alias}.order_line_id,
    'publishedScheduleId', ${alias}.published_schedule_id,
    'machineId', ${alias}.machine_id,
    'queueSeq', ${alias}.queue_seq,
    'status', ${alias}.schedule_status,
    'scheduleStatus', ${alias}.schedule_status,
    'source', ${alias}.source_kind,
    'sourceKind', ${alias}.source_kind,
    'revision', ${alias}.revision,
    'plannedStartAt', ${alias}.planned_start_at,
    'plannedEndAt', ${alias}.planned_end_at,
    'sequenceUpdatedAt', ${alias}.sequence_updated_at,
    'sequenceUpdatedBy', ${alias}.sequence_updated_by,
    'remark', ${alias}.remark,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'updatedBy', ${alias}.sequence_updated_by,
    'updatedAt', ${alias}.updated_at
  )`;
}

function buildInsertOperationLogSql(operationLog, parameters, dependency = "") {
  const values = `${parameters.text(operationLog.id)},
  ${parameters.text(operationLog.targetType)},
  ${parameters.text(operationLog.targetId)},
  ${parameters.text(operationLog.action)},
  ${parameters.json(operationLog.before)},
  ${parameters.json(operationLog.after)},
  ${parameters.nullableText(operationLog.reason)},
  ${parameters.nullableText(operationLog.operatorId)},
  ${parameters.text(operationLog.pageKey)},
  ${parameters.timestamp(operationLog.occurredAt)},
  ${parameters.timestamp(operationLog.createdAt)}`;
  return `INSERT INTO operation_logs (
  id,
  target_type,
  target_id,
  action,
  before_json,
  after_json,
  reason,
  operator_id,
  page_key,
  occurred_at,
  created_at
) ${dependency ? `SELECT ${values} FROM ${dependency} WHERE ok` : `VALUES (${values})`}
ON CONFLICT (id) DO UPDATE SET
  target_type = EXCLUDED.target_type,
  target_id = EXCLUDED.target_id,
  action = EXCLUDED.action,
  before_json = EXCLUDED.before_json,
  after_json = EXCLUDED.after_json,
  reason = EXCLUDED.reason,
  operator_id = EXCLUDED.operator_id,
  page_key = EXCLUDED.page_key
RETURNING id`;
}

function normalizeOperationLogForPersistence(value = {}) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id);
  if (!id) return null;
  const createdAt = cleanText(value.createdAt ?? value.created_at) || new Date().toISOString();
  return {
    id,
    targetType: cleanText(value.targetType ?? value.target_type),
    targetId: cleanText(value.targetId ?? value.target_id),
    action: cleanText(value.action),
    before: value.before ?? value.before_json ?? null,
    after: value.after ?? value.after_json ?? null,
    reason: cleanText(value.reason),
    operatorId: cleanText(value.operatorId ?? value.operator_id),
    pageKey: cleanText(value.pageKey ?? value.page_key) || "api",
    occurredAt: cleanText(value.occurredAt ?? value.occurred_at) || createdAt,
    createdAt,
  };
}

function normalizeProductionTaskForMachineMove(value = {}) {
  if (!value || typeof value !== "object") return null;
  const productionTaskId = cleanText(value.productionTaskId ?? value.production_task_id ?? value.id);
  const machineId = cleanText(value.machineId ?? value.machine_id);
  if (!productionTaskId || !machineId) return null;
  return {
    ...value,
    id: productionTaskId,
    productionTaskId,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || productionTaskId,
    orderLineId: cleanText(value.orderLineId ?? value.order_line_id),
    taskType: cleanText(value.taskType ?? value.task_type),
    machineId,
    plannedQty: toFiniteInteger(value.plannedQty ?? value.planned_qty, 0),
    taskStatus: cleanText(value.taskStatus ?? value.task_status ?? value.status),
    status: cleanText(value.status ?? value.taskStatus ?? value.task_status),
    publishedScheduleId: cleanText(value.publishedScheduleId ?? value.published_schedule_id),
    revision: positiveRevision(value.revision),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    createdAt: cleanText(value.createdAt ?? value.created_at),
    updatedAt: cleanText(value.updatedAt ?? value.updated_at) || new Date().toISOString(),
  };
}

function toWorkspaceProductionScheduleRecord(record) {
  return {
    ...record,
    id: record.scheduleRecordId,
    scheduleRecordId: record.scheduleRecordId,
    status: record.status,
    source: record.sourceKind,
    updatedBy: record.updatedBy || record.sequenceUpdatedBy,
    updatedAt: record.updatedAt,
  };
}

function upsertProductionScheduleRecord(records, record) {
  const key = getProductionScheduleRecordKey(record);
  const next = [...records];
  const index = next.findIndex((item) => getProductionScheduleRecordKey(item) === key || cleanText(item.id ?? item.scheduleRecordId) === record.scheduleRecordId);
  if (index >= 0) next[index] = { ...next[index], ...record };
  else next.push(record);
  return next.sort(sortProductionScheduleRecord);
}

function upsertProductionTask(records, productionTask) {
  const id = cleanText(productionTask?.productionTaskId ?? productionTask?.id);
  if (!id) return records;
  const next = [...records];
  const index = next.findIndex((item) => cleanText(item.productionTaskId ?? item.id) === id);
  if (index >= 0) next[index] = { ...next[index], ...productionTask, id, productionTaskId: id };
  else next.push({ ...productionTask, id, productionTaskId: id });
  return next;
}

function getProductionScheduleRecordKey(record = {}) {
  return `${cleanText(record.machineId ?? record.machine_id)}::${cleanText(record.productionTaskId ?? record.production_task_id)}`;
}

function sortProductionScheduleRecord(left, right) {
  const leftMachine = cleanText(left.machineId ?? left.machine_id);
  const rightMachine = cleanText(right.machineId ?? right.machine_id);
  if (leftMachine !== rightMachine) return leftMachine.localeCompare(rightMachine);
  const leftSeq = toFiniteInteger(left.queueSeq ?? left.queue_seq, 0);
  const rightSeq = toFiniteInteger(right.queueSeq ?? right.queue_seq, 0);
  if (leftSeq !== rightSeq) return leftSeq - rightSeq;
  return cleanText(left.productionTaskId ?? left.production_task_id).localeCompare(
    cleanText(right.productionTaskId ?? right.production_task_id),
  );
}

function upsertById(records, record) {
  const id = cleanText(record?.id);
  if (!id) return records;
  const next = [...records];
  const index = next.findIndex((item) => cleanText(item.id) === id);
  if (index >= 0) next[index] = { ...next[index], ...record };
  else next.push(record);
  return next;
}


function toFiniteInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function positiveRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 1 ? revision : 1;
}

function scheduleRecordPart(value) {
  return cleanText(value).replace(/[^a-z0-9_-]/gi, "").slice(-36) || "UNKNOWN";
}

function cleanText(value) {
  return String(value ?? "").trim();
}
