import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";

export const masterDataImportReviewStoreKey = "metadata/master-data-import-review.json";

export function createMasterDataImportReviewRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_MASTER_DATA_IMPORT_REVIEW_STORE ??
    process.env.ERP_MASTER_DATA_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresMasterDataImportReviewRepository({
      databaseUrl:
        options.databaseUrl ?? process.env.ERP_MASTER_DATA_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") {
    return createLocalMasterDataImportReviewRepository({
      storageRoot: options.storageRoot,
    });
  }
  throw new Error(`Unsupported master data import review repository mode: ${mode}`);
}

export function createLocalMasterDataImportReviewRepository(options = {}) {
  const storageRoot = options.storageRoot ?? getLocalStorageRoot();

  return {
    kind: "local_json",

    loadState() {
      return loadPersistentMasterDataImportReviewState(storageRoot);
    },

    saveReviewDraft({ workspace, reviewDraft, operationLog }) {
      const draft = normalizeReviewDraft(reviewDraft);
      const log = normalizeOperationLog(operationLog);
      if (!draft || !log) {
        throw new Error("Review draft and operation log are required.");
      }
      const draftWithLog = {
        ...draft,
        operationLogId: log.id,
      };
      applyWorkspaceMutation({
        workspace,
        reviewDraft: draftWithLog,
        operationLog: log,
      });
      persistPersistentMasterDataImportReviewState(storageRoot, workspace);
      return {
        reviewDraft: draftWithLog,
        operationLogId: log.id,
      };
    },

    saveConfirmationPlan({ workspace, reviewDraft, confirmationPlan, operationLog }) {
      const draft = normalizeReviewDraft(reviewDraft);
      const plan = normalizeConfirmationPlan(confirmationPlan);
      const log = normalizeOperationLog(operationLog);
      if (!draft || !plan || !log) {
        throw new Error("Review draft, confirmation plan, and operation log are required.");
      }
      const planWithLog = {
        ...plan,
        operationLogId: log.id,
        officialImportEnabled: false,
        officialWriteScope: "none",
      };
      applyWorkspaceMutation({
        workspace,
        reviewDraft: draft,
        confirmationPlan: planWithLog,
        operationLog: log,
      });
      persistPersistentMasterDataImportReviewState(storageRoot, workspace);
      return {
        reviewDraft: draft,
        confirmationPlan: planWithLog,
        operationLogId: log.id,
      };
    },

    saveImportExecution({ workspace, confirmationPlan, importExecution, operationLog }) {
      const plan = normalizeConfirmationPlan(confirmationPlan);
      const execution = normalizeImportExecution(importExecution);
      const log = normalizeOperationLog(operationLog);
      if (!plan || !execution || !log) {
        throw new Error("Confirmation plan, import execution, and operation log are required.");
      }
      const planWithExecution = {
        ...plan,
        lastExecutionId: execution.executionId,
        lastExecutionStatus: execution.status,
        lastExecutionAt: execution.requestedAt,
        officialImportEnabled: false,
        officialWriteScope: "none",
      };
      const executionWithLog = {
        ...execution,
        operationLogId: log.id,
        officialWriteAttempted: execution.officialWriteAttempted === true,
        officialWriteScope: cleanText(execution.officialWriteScope) || "none",
      };
      applyWorkspaceMutation({
        workspace,
        confirmationPlan: planWithExecution,
        importExecution: executionWithLog,
        operationLog: log,
      });
      persistPersistentMasterDataImportReviewState(storageRoot, workspace);
      return {
        confirmationPlan: planWithExecution,
        importExecution: executionWithLog,
        operationLogId: log.id,
      };
    },

    listReviewDrafts({ workspace, filters = {} } = {}) {
      return filterReviewDrafts(workspace.masterDataImportReviewDrafts ?? [], filters);
    },

    listConfirmationPlans({ workspace, filters = {} } = {}) {
      return filterConfirmationPlans(workspace.masterDataImportConfirmationPlans ?? [], filters);
    },

    listImportExecutions({ workspace, filters = {} } = {}) {
      return filterImportExecutions(workspace.masterDataImportExecutions ?? [], filters);
    },
  };
}

export function createPostgresMasterDataImportReviewRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));
  const transactionJson =
    options.transactionJson ??
    options.queryJson ??
    ((text, values) => postgresClient.transactionJson(text, values));

  return {
    kind: "postgres",

    async loadState() {
      return normalizePostgresReviewState(await queryJson(buildLoadMasterDataImportReviewStateSql(), []));
    },

    async saveReviewDraft({ workspace, reviewDraft, operationLog }) {
      const draft = normalizeReviewDraft(reviewDraft);
      const log = normalizeOperationLogForPersistence(operationLog);
      if (!draft || !log) {
        throw new Error("Review draft and operation log are required.");
      }
      const draftWithLog = {
        ...draft,
        operationLogId: log.id,
      };
      const builtQuery = buildSaveReviewDraftTransactionQuery({ reviewDraft: draftWithLog, operationLog: log });
      const saved = normalizeSaveReviewDraftResult(
        await transactionJson(builtQuery.text, builtQuery.values),
      );
      if (!saved.reviewDraft) {
        throw new Error("PostgreSQL master data import review draft save returned an invalid result.");
      }
      applyWorkspaceMutation({
        workspace,
        reviewDraft: saved.reviewDraft,
        operationLog: log,
      });
      return saved;
    },

    async saveConfirmationPlan({ workspace, reviewDraft, confirmationPlan, operationLog }) {
      const draft = normalizeReviewDraft(reviewDraft);
      const plan = normalizeConfirmationPlan(confirmationPlan);
      const log = normalizeOperationLogForPersistence(operationLog);
      if (!draft || !plan || !log) {
        throw new Error("Review draft, confirmation plan, and operation log are required.");
      }
      const planWithLog = {
        ...plan,
        operationLogId: log.id,
        officialImportEnabled: false,
        officialWriteScope: "none",
      };
      const builtQuery = buildSaveConfirmationPlanTransactionQuery({
        reviewDraft: draft,
        confirmationPlan: planWithLog,
        operationLog: log,
      });
      const saved = normalizeSaveConfirmationPlanResult(
        await transactionJson(builtQuery.text, builtQuery.values),
      );
      if (!saved.reviewDraft || !saved.confirmationPlan) {
        throw new Error("PostgreSQL master data import confirmation plan save returned an invalid result.");
      }
      applyWorkspaceMutation({
        workspace,
        reviewDraft: saved.reviewDraft,
        confirmationPlan: saved.confirmationPlan,
        operationLog: log,
      });
      return saved;
    },

    async saveImportExecution({ workspace, confirmationPlan, importExecution, operationLog }) {
      const plan = normalizeConfirmationPlan(confirmationPlan);
      const execution = normalizeImportExecution(importExecution);
      const log = normalizeOperationLogForPersistence(operationLog);
      if (!plan || !execution || !log) {
        throw new Error("Confirmation plan, import execution, and operation log are required.");
      }
      const planWithExecution = {
        ...plan,
        lastExecutionId: execution.executionId,
        lastExecutionStatus: execution.status,
        lastExecutionAt: execution.requestedAt,
        officialImportEnabled: false,
        officialWriteScope: "none",
      };
      const executionWithLog = {
        ...execution,
        operationLogId: log.id,
        officialWriteAttempted: execution.officialWriteAttempted === true,
        officialWriteScope: cleanText(execution.officialWriteScope) || "none",
      };
      const builtQuery = buildSaveImportExecutionTransactionQuery({
        confirmationPlan: planWithExecution,
        importExecution: executionWithLog,
        operationLog: log,
      });
      const saved = normalizeSaveImportExecutionResult(
        await transactionJson(builtQuery.text, builtQuery.values),
      );
      if (!saved.confirmationPlan || !saved.importExecution) {
        throw new Error("PostgreSQL master data import execution save returned an invalid result.");
      }
      applyWorkspaceMutation({
        workspace,
        confirmationPlan: saved.confirmationPlan,
        importExecution: saved.importExecution,
        operationLog: log,
      });
      return saved;
    },

    async listReviewDrafts({ filters = {} } = {}) {
      const builtQuery = buildListReviewDraftsQuery(filters);
      return normalizeReviewDrafts(await queryJson(builtQuery.text, builtQuery.values));
    },

    async listConfirmationPlans({ filters = {} } = {}) {
      const builtQuery = buildListConfirmationPlansQuery(filters);
      return normalizeConfirmationPlans(await queryJson(builtQuery.text, builtQuery.values));
    },

    async listImportExecutions({ filters = {} } = {}) {
      const builtQuery = buildListImportExecutionsQuery(filters);
      return normalizeImportExecutions(await queryJson(builtQuery.text, builtQuery.values));
    },
  };
}

export function buildLoadMasterDataImportReviewStateSql() {
  return `
SELECT json_build_object(
  'masterDataImportReviewDrafts', COALESCE((
    SELECT json_agg(record ORDER BY record->>'createdAt' DESC, record->>'draftId' DESC)
    FROM (
      SELECT ${reviewDraftJsonExpression("master_data_import_review_drafts")} AS record
      FROM master_data_import_review_drafts
      ORDER BY created_at DESC, id DESC
      LIMIT 500
    ) AS ordered_review_drafts
  ), '[]'::json),
  'masterDataImportConfirmationPlans', COALESCE((
    SELECT json_agg(record ORDER BY record->>'createdAt' DESC, record->>'planId' DESC)
    FROM (
      SELECT ${confirmationPlanJsonExpression("master_data_import_confirmation_plans")} AS record
      FROM master_data_import_confirmation_plans
      ORDER BY created_at DESC, id DESC
      LIMIT 500
    ) AS ordered_confirmation_plans
  ), '[]'::json),
  'masterDataImportExecutions', COALESCE((
    SELECT json_agg(record ORDER BY record->>'requestedAt' DESC, record->>'executionId' DESC)
    FROM (
      SELECT ${importExecutionJsonExpression("master_data_import_executions")} AS record
      FROM master_data_import_executions
      ORDER BY requested_at DESC, id DESC
      LIMIT 500
    ) AS ordered_import_executions
  ), '[]'::json),
  'operationLogs', COALESCE((
    SELECT json_agg(record ORDER BY record->>'occurredAt' DESC, record->>'id' DESC)
    FROM (
      SELECT ${operationLogJsonExpression("operation_logs")} AS record
      FROM operation_logs
      WHERE target_type IN ('master_data_import_review_draft', 'master_data_import_confirmation_plan', 'master_data_import_execution')
      ORDER BY occurred_at DESC, id DESC
      LIMIT 500
    ) AS ordered_operation_logs
  ), '[]'::json)
) AS result;
`.trim();
}

export function buildSaveReviewDraftTransactionSql(input = {}) {
  return buildSaveReviewDraftTransactionQuery(input).text;
}

export function buildSaveReviewDraftTransactionQuery(input = {}) {
  const draft = normalizeReviewDraft(input.reviewDraft);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!draft || !operationLog) {
    throw new Error("Review draft and operation log are required.");
  }
  const draftWithLog = { ...draft, operationLogId: operationLog.id };

  const parameters = createPostgresParameterBinder();
  const operationLogSql = buildInsertOperationLogSql(operationLog, parameters);
  return {
    text: `
BEGIN;
WITH inserted_operation_log AS (
  ${operationLogSql}
),
upserted_review_draft AS (
  INSERT INTO master_data_import_review_drafts (
    id,
    status,
    file_name,
    requested_by,
    checked_at,
    payload_json,
    created_at,
    updated_at
  ) VALUES (
    ${parameters.text(draftWithLog.draftId)},
    ${parameters.text(draftWithLog.status)},
    ${parameters.text(draftWithLog.fileName)},
    ${parameters.text(draftWithLog.requestedBy)},
    ${parameters.nullableTimestamp(draftWithLog.checkedAt)},
    ${parameters.json(draftWithLog)},
    ${parameters.timestamp(draftWithLog.createdAt)},
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    file_name = EXCLUDED.file_name,
    requested_by = EXCLUDED.requested_by,
    checked_at = EXCLUDED.checked_at,
    payload_json = EXCLUDED.payload_json,
    updated_at = now()
  RETURNING ${reviewDraftJsonExpression("master_data_import_review_drafts")} AS result
)
SELECT json_build_object(
  'reviewDraft', (SELECT result FROM upserted_review_draft),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildSaveConfirmationPlanTransactionSql(input = {}) {
  return buildSaveConfirmationPlanTransactionQuery(input).text;
}

export function buildSaveConfirmationPlanTransactionQuery(input = {}) {
  const draft = normalizeReviewDraft(input.reviewDraft);
  const plan = normalizeConfirmationPlan(input.confirmationPlan);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!draft || !plan || !operationLog) {
    throw new Error("Review draft, confirmation plan, and operation log are required.");
  }
  const planWithLog = { ...plan, operationLogId: operationLog.id };

  const parameters = createPostgresParameterBinder();
  const operationLogSql = buildInsertOperationLogSql(operationLog, parameters);
  return {
    text: `
BEGIN;
WITH inserted_operation_log AS (
  ${operationLogSql}
),
upserted_review_draft AS (
  INSERT INTO master_data_import_review_drafts (
    id,
    status,
    file_name,
    requested_by,
    checked_at,
    payload_json,
    created_at,
    updated_at
  ) VALUES (
    ${parameters.text(draft.draftId)},
    ${parameters.text(draft.status)},
    ${parameters.text(draft.fileName)},
    ${parameters.text(draft.requestedBy)},
    ${parameters.nullableTimestamp(draft.checkedAt)},
    ${parameters.json(draft)},
    ${parameters.timestamp(draft.createdAt)},
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    file_name = EXCLUDED.file_name,
    requested_by = EXCLUDED.requested_by,
    checked_at = EXCLUDED.checked_at,
    payload_json = EXCLUDED.payload_json,
    updated_at = now()
  RETURNING ${reviewDraftJsonExpression("master_data_import_review_drafts")} AS result
),
upserted_confirmation_plan AS (
  INSERT INTO master_data_import_confirmation_plans (
    id,
    draft_id,
    status,
    file_name,
    created_by,
    operation_log_id,
    last_execution_id,
    last_execution_status,
    last_execution_at,
    payload_json,
    created_at,
    updated_at
  ) VALUES (
    ${parameters.text(planWithLog.planId)},
    ${parameters.text(planWithLog.draftId)},
    ${parameters.text(planWithLog.status)},
    ${parameters.text(planWithLog.fileName)},
    ${parameters.text(planWithLog.createdBy)},
    (SELECT id FROM inserted_operation_log),
    ${parameters.text(planWithLog.lastExecutionId)},
    ${parameters.text(planWithLog.lastExecutionStatus)},
    ${parameters.nullableTimestamp(planWithLog.lastExecutionAt)},
    ${parameters.json(planWithLog)},
    ${parameters.timestamp(planWithLog.createdAt)},
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    draft_id = EXCLUDED.draft_id,
    status = EXCLUDED.status,
    file_name = EXCLUDED.file_name,
    created_by = EXCLUDED.created_by,
    operation_log_id = EXCLUDED.operation_log_id,
    last_execution_id = EXCLUDED.last_execution_id,
    last_execution_status = EXCLUDED.last_execution_status,
    last_execution_at = EXCLUDED.last_execution_at,
    payload_json = EXCLUDED.payload_json,
    updated_at = now()
  RETURNING ${confirmationPlanJsonExpression("master_data_import_confirmation_plans")} AS result
)
SELECT json_build_object(
  'reviewDraft', (SELECT result FROM upserted_review_draft),
  'confirmationPlan', (SELECT result FROM upserted_confirmation_plan),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildSaveImportExecutionTransactionSql(input = {}) {
  return buildSaveImportExecutionTransactionQuery(input).text;
}

export function buildSaveImportExecutionTransactionQuery(input = {}) {
  const plan = normalizeConfirmationPlan(input.confirmationPlan);
  const execution = normalizeImportExecution(input.importExecution);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!plan || !execution || !operationLog) {
    throw new Error("Confirmation plan, import execution, and operation log are required.");
  }
  const executionWithLog = { ...execution, operationLogId: operationLog.id };

  const parameters = createPostgresParameterBinder();
  const operationLogSql = buildInsertOperationLogSql(operationLog, parameters);
  return {
    text: `
BEGIN;
WITH inserted_operation_log AS (
  ${operationLogSql}
),
upserted_confirmation_plan AS (
  INSERT INTO master_data_import_confirmation_plans (
    id,
    draft_id,
    status,
    file_name,
    created_by,
    operation_log_id,
    last_execution_id,
    last_execution_status,
    last_execution_at,
    payload_json,
    created_at,
    updated_at
  ) VALUES (
    ${parameters.text(plan.planId)},
    ${parameters.text(plan.draftId)},
    ${parameters.text(plan.status)},
    ${parameters.text(plan.fileName)},
    ${parameters.text(plan.createdBy)},
    ${parameters.nullableText(plan.operationLogId)},
    ${parameters.text(plan.lastExecutionId)},
    ${parameters.text(plan.lastExecutionStatus)},
    ${parameters.nullableTimestamp(plan.lastExecutionAt)},
    ${parameters.json(plan)},
    ${parameters.timestamp(plan.createdAt)},
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    draft_id = EXCLUDED.draft_id,
    status = EXCLUDED.status,
    file_name = EXCLUDED.file_name,
    created_by = EXCLUDED.created_by,
    last_execution_id = EXCLUDED.last_execution_id,
    last_execution_status = EXCLUDED.last_execution_status,
    last_execution_at = EXCLUDED.last_execution_at,
    payload_json = EXCLUDED.payload_json,
    updated_at = now()
  RETURNING ${confirmationPlanJsonExpression("master_data_import_confirmation_plans")} AS result
),
upserted_import_execution AS (
  INSERT INTO master_data_import_executions (
    id,
    plan_id,
    draft_id,
    status,
    file_name,
    requested_by,
    requested_at,
    official_writer_kind,
    operation_log_id,
    payload_json,
    created_at,
    updated_at
  ) VALUES (
    ${parameters.text(executionWithLog.executionId)},
    ${parameters.text(executionWithLog.planId)},
    ${parameters.text(executionWithLog.draftId)},
    ${parameters.text(executionWithLog.status)},
    ${parameters.text(executionWithLog.fileName)},
    ${parameters.text(executionWithLog.requestedBy)},
    ${parameters.timestamp(executionWithLog.requestedAt)},
    ${parameters.text(executionWithLog.officialWriterKind)},
    (SELECT id FROM inserted_operation_log),
    ${parameters.json(executionWithLog)},
    ${parameters.timestamp(executionWithLog.requestedAt)},
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    draft_id = EXCLUDED.draft_id,
    status = EXCLUDED.status,
    file_name = EXCLUDED.file_name,
    requested_by = EXCLUDED.requested_by,
    requested_at = EXCLUDED.requested_at,
    official_writer_kind = EXCLUDED.official_writer_kind,
    operation_log_id = EXCLUDED.operation_log_id,
    payload_json = EXCLUDED.payload_json,
    updated_at = now()
  RETURNING ${importExecutionJsonExpression("master_data_import_executions")} AS result
)
SELECT json_build_object(
  'confirmationPlan', (SELECT result FROM upserted_confirmation_plan),
  'importExecution', (SELECT result FROM upserted_import_execution),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildListConfirmationPlansSql(filters = {}) {
  return buildListConfirmationPlansQuery(filters).text;
}

export function buildListConfirmationPlansQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const where = buildConfirmationPlanWhereClause(filters, parameters);
  const limit = normalizeLimit(filters.limit ?? 100);
  return {
    text: `
SELECT COALESCE(json_agg(record ORDER BY record->>'createdAt' DESC, record->>'planId' DESC), '[]'::json) AS result
FROM (
  SELECT ${confirmationPlanJsonExpression("master_data_import_confirmation_plans")} AS record
  FROM master_data_import_confirmation_plans
  ${where}
  ORDER BY created_at DESC, id DESC
  LIMIT ${parameters.integer(limit)}
) AS ordered_confirmation_plans;
`.trim(),
    values: parameters.values,
  };
}

export function buildListReviewDraftsSql(filters = {}) {
  return buildListReviewDraftsQuery(filters).text;
}

export function buildListReviewDraftsQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const where = buildReviewDraftWhereClause(filters, parameters);
  const limit = normalizeLimit(filters.limit ?? 100);
  return {
    text: `
SELECT COALESCE(json_agg(record ORDER BY record->>'createdAt' DESC, record->>'draftId' DESC), '[]'::json) AS result
FROM (
  SELECT ${reviewDraftJsonExpression("master_data_import_review_drafts")} AS record
  FROM master_data_import_review_drafts
  ${where}
  ORDER BY created_at DESC, id DESC
  LIMIT ${parameters.integer(limit)}
) AS ordered_review_drafts;
`.trim(),
    values: parameters.values,
  };
}

export function buildListImportExecutionsSql(filters = {}) {
  return buildListImportExecutionsQuery(filters).text;
}

export function buildListImportExecutionsQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const where = buildImportExecutionWhereClause(filters, parameters);
  const limit = normalizeLimit(filters.limit ?? 100);
  return {
    text: `
SELECT COALESCE(json_agg(record ORDER BY record->>'requestedAt' DESC, record->>'executionId' DESC), '[]'::json) AS result
FROM (
  SELECT ${importExecutionJsonExpression("master_data_import_executions")} AS record
  FROM master_data_import_executions
  ${where}
  ORDER BY requested_at DESC, id DESC
  LIMIT ${parameters.integer(limit)}
) AS ordered_import_executions;
`.trim(),
    values: parameters.values,
  };
}

function loadPersistentMasterDataImportReviewState(storageRoot) {
  const path = getStorePath(storageRoot);
  if (!existsSync(path)) {
    return {
      masterDataImportReviewDrafts: [],
      masterDataImportConfirmationPlans: [],
      masterDataImportExecutions: [],
      operationLogs: [],
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return {
      masterDataImportReviewDrafts: normalizeReviewDrafts(parsed.masterDataImportReviewDrafts),
      masterDataImportConfirmationPlans: normalizeConfirmationPlans(parsed.masterDataImportConfirmationPlans),
      masterDataImportExecutions: normalizeImportExecutions(parsed.masterDataImportExecutions),
      operationLogs: normalizeOperationLogs(parsed.operationLogs),
    };
  } catch {
    return {
      masterDataImportReviewDrafts: [],
      masterDataImportConfirmationPlans: [],
      masterDataImportExecutions: [],
      operationLogs: [],
    };
  }
}

function persistPersistentMasterDataImportReviewState(storageRoot, workspace) {
  const path = getStorePath(storageRoot);
  mkdirSync(dirname(path), { recursive: true });
  const payload = {
    masterDataImportReviewDrafts: normalizeReviewDrafts(workspace.masterDataImportReviewDrafts),
    masterDataImportConfirmationPlans: normalizeConfirmationPlans(workspace.masterDataImportConfirmationPlans),
    masterDataImportExecutions: normalizeImportExecutions(workspace.masterDataImportExecutions),
    operationLogs: normalizeOperationLogs(workspace.operationLogs).filter(
      (log) => [
        "master_data_import_review_draft",
        "master_data_import_confirmation_plan",
        "master_data_import_execution",
      ].includes(log.targetType),
    ),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
}

function applyWorkspaceMutation({ workspace, reviewDraft, confirmationPlan, importExecution, operationLog }) {
  if (reviewDraft) {
    workspace.masterDataImportReviewDrafts = upsertByKey(
      workspace.masterDataImportReviewDrafts ?? [],
      reviewDraft,
      "draftId",
    );
  }
  if (confirmationPlan) {
    workspace.masterDataImportConfirmationPlans = upsertByKey(
      workspace.masterDataImportConfirmationPlans ?? [],
      confirmationPlan,
      "planId",
    );
  }
  if (importExecution) {
    workspace.masterDataImportExecutions = upsertByKey(
      workspace.masterDataImportExecutions ?? [],
      importExecution,
      "executionId",
    );
  }
  if (operationLog) {
    workspace.operationLogs = upsertByKey(workspace.operationLogs ?? [], operationLog, "id");
  }
}

function filterReviewDrafts(drafts, filters = {}) {
  const draftId = cleanText(filters.draftId);
  const status = cleanText(filters.status);
  const sourceExecutionId = cleanText(filters.sourceExecutionId);
  return normalizeReviewDrafts(drafts)
    .filter((draft) => !draftId || draft.draftId === draftId)
    .filter((draft) => !status || draft.status === status)
    .filter((draft) => !sourceExecutionId || draft.sourceExecutionId === sourceExecutionId)
    .sort((a, b) => cleanText(b.createdAt).localeCompare(cleanText(a.createdAt)));
}

function filterConfirmationPlans(plans, filters = {}) {
  const draftId = cleanText(filters.draftId);
  const planId = cleanText(filters.planId);
  const status = cleanText(filters.status);
  return normalizeConfirmationPlans(plans)
    .filter((plan) => !draftId || plan.draftId === draftId)
    .filter((plan) => !planId || plan.planId === planId)
    .filter((plan) => !status || plan.status === status)
    .sort((a, b) => cleanText(b.createdAt).localeCompare(cleanText(a.createdAt)));
}

function filterImportExecutions(executions, filters = {}) {
  const draftId = cleanText(filters.draftId);
  const planId = cleanText(filters.planId);
  const executionId = cleanText(filters.executionId);
  const status = cleanText(filters.status);
  return normalizeImportExecutions(executions)
    .filter((execution) => !draftId || execution.draftId === draftId)
    .filter((execution) => !planId || execution.planId === planId)
    .filter((execution) => !executionId || execution.executionId === executionId)
    .filter((execution) => !status || execution.status === status)
    .sort((a, b) => cleanText(b.requestedAt).localeCompare(cleanText(a.requestedAt)));
}

function normalizePostgresReviewState(value = {}) {
  return {
    masterDataImportReviewDrafts: normalizeReviewDrafts(value?.masterDataImportReviewDrafts),
    masterDataImportConfirmationPlans: normalizeConfirmationPlans(value?.masterDataImportConfirmationPlans),
    masterDataImportExecutions: normalizeImportExecutions(value?.masterDataImportExecutions),
    operationLogs: normalizeOperationLogs(value?.operationLogs),
  };
}

function normalizeSaveConfirmationPlanResult(value = {}) {
  return {
    reviewDraft: normalizeReviewDraft(value?.reviewDraft),
    confirmationPlan: normalizeConfirmationPlan(value?.confirmationPlan),
    operationLogId: cleanText(value?.operationLogId ?? value?.operation_log_id),
  };
}

function normalizeSaveReviewDraftResult(value = {}) {
  return {
    reviewDraft: normalizeReviewDraft(value?.reviewDraft),
    operationLogId: cleanText(value?.operationLogId ?? value?.operation_log_id),
  };
}

function normalizeSaveImportExecutionResult(value = {}) {
  return {
    confirmationPlan: normalizeConfirmationPlan(value?.confirmationPlan),
    importExecution: normalizeImportExecution(value?.importExecution),
    operationLogId: cleanText(value?.operationLogId ?? value?.operation_log_id),
  };
}

function reviewDraftJsonExpression(alias) {
  return `(${alias}.payload_json || jsonb_build_object(
    'draftId', ${alias}.id,
    'status', ${alias}.status,
    'fileName', ${alias}.file_name,
    'requestedBy', ${alias}.requested_by,
    'checkedAt', ${alias}.checked_at,
    'createdAt', ${alias}.created_at,
    'officialImportEnabled', false,
    'officialWriteScope', 'none'
  ))`;
}

function confirmationPlanJsonExpression(alias) {
  return `(${alias}.payload_json || jsonb_build_object(
    'planId', ${alias}.id,
    'draftId', ${alias}.draft_id,
    'status', ${alias}.status,
    'fileName', ${alias}.file_name,
    'createdBy', ${alias}.created_by,
    'operationLogId', ${alias}.operation_log_id,
    'lastExecutionId', COALESCE(${alias}.last_execution_id, ''),
    'lastExecutionStatus', COALESCE(${alias}.last_execution_status, ''),
    'lastExecutionAt', ${alias}.last_execution_at,
    'createdAt', ${alias}.created_at,
    'officialImportEnabled', false,
    'officialWriteScope', 'none'
  ))`;
}

function importExecutionJsonExpression(alias) {
  return `(${alias}.payload_json || jsonb_build_object(
    'executionId', ${alias}.id,
    'planId', ${alias}.plan_id,
    'draftId', ${alias}.draft_id,
    'status', ${alias}.status,
    'fileName', ${alias}.file_name,
    'requestedBy', ${alias}.requested_by,
    'requestedAt', ${alias}.requested_at,
    'officialWriterKind', ${alias}.official_writer_kind,
    'operationLogId', ${alias}.operation_log_id
  ))`;
}

function operationLogJsonExpression(alias) {
  return `jsonb_build_object(
    'id', ${alias}.id,
    'targetType', ${alias}.target_type,
    'targetId', ${alias}.target_id,
    'action', ${alias}.action,
    'before', ${alias}.before_json,
    'after', ${alias}.after_json,
    'reason', ${alias}.reason,
    'operatorId', ${alias}.operator_id,
    'pageKey', ${alias}.page_key,
    'occurredAt', ${alias}.occurred_at,
    'createdAt', ${alias}.created_at
  )`;
}

function buildInsertOperationLogSql(operationLog, parameters) {
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
) VALUES (
  ${parameters.text(operationLog.id)},
  ${parameters.text(operationLog.targetType)},
  ${parameters.text(operationLog.targetId)},
  ${parameters.text(operationLog.action)},
  ${parameters.json(operationLog.before)},
  ${parameters.json(operationLog.after)},
  ${parameters.text(operationLog.reason)},
  ${parameters.nullableText(operationLog.operatorId)},
  ${parameters.text(operationLog.pageKey)},
  ${parameters.timestamp(operationLog.occurredAt)},
  ${parameters.timestamp(operationLog.createdAt)}
)
ON CONFLICT (id) DO UPDATE SET
  target_type = EXCLUDED.target_type,
  target_id = EXCLUDED.target_id,
  action = EXCLUDED.action,
  before_json = EXCLUDED.before_json,
  after_json = EXCLUDED.after_json,
  reason = EXCLUDED.reason,
  operator_id = EXCLUDED.operator_id,
  page_key = EXCLUDED.page_key,
  occurred_at = EXCLUDED.occurred_at
RETURNING id`;
}

function buildConfirmationPlanWhereClause(filters = {}, parameters) {
  const clauses = [];
  const draftId = cleanText(filters.draftId);
  const planId = cleanText(filters.planId);
  const status = cleanText(filters.status);
  if (draftId) clauses.push(`draft_id = ${parameters.text(draftId)}`);
  if (planId) clauses.push(`id = ${parameters.text(planId)}`);
  if (status) clauses.push(`status = ${parameters.text(status)}`);
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function buildReviewDraftWhereClause(filters = {}, parameters) {
  const clauses = [];
  const draftId = cleanText(filters.draftId);
  const status = cleanText(filters.status);
  const sourceExecutionId = cleanText(filters.sourceExecutionId);
  if (draftId) clauses.push(`id = ${parameters.text(draftId)}`);
  if (status) clauses.push(`status = ${parameters.text(status)}`);
  if (sourceExecutionId) clauses.push(`payload_json->>'sourceExecutionId' = ${parameters.text(sourceExecutionId)}`);
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function buildImportExecutionWhereClause(filters = {}, parameters) {
  const clauses = [];
  const draftId = cleanText(filters.draftId);
  const planId = cleanText(filters.planId);
  const executionId = cleanText(filters.executionId);
  const status = cleanText(filters.status);
  if (draftId) clauses.push(`draft_id = ${parameters.text(draftId)}`);
  if (planId) clauses.push(`plan_id = ${parameters.text(planId)}`);
  if (executionId) clauses.push(`id = ${parameters.text(executionId)}`);
  if (status) clauses.push(`status = ${parameters.text(status)}`);
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function normalizeReviewDrafts(items) {
  return (Array.isArray(items) ? items : []).map(normalizeReviewDraft).filter(Boolean);
}

function normalizeReviewDraft(value) {
  if (!value || typeof value !== "object") return null;
  const draftId = cleanText(value.draftId);
  if (!draftId) return null;
  return {
    ...value,
    draftId,
    status: cleanText(value.status),
    statusLabel: cleanText(value.statusLabel),
    fileName: cleanText(value.fileName),
    requestedBy: cleanText(value.requestedBy),
    createdAt: cleanText(value.createdAt),
    checkedAt: cleanText(value.checkedAt),
    operationLogId: cleanText(value.operationLogId),
    sourceExecutionId: cleanText(value.sourceExecutionId),
    sourcePlanId: cleanText(value.sourcePlanId),
    sourceDraftId: cleanText(value.sourceDraftId),
    correctionMode: cleanText(value.correctionMode),
    canEnterReviewQueue: value.canEnterReviewQueue !== false,
    officialImportEnabled: false,
    officialWriteScope: "none",
  };
}

function normalizeConfirmationPlans(items) {
  return (Array.isArray(items) ? items : []).map(normalizeConfirmationPlan).filter(Boolean);
}

function normalizeConfirmationPlan(value) {
  if (!value || typeof value !== "object") return null;
  const planId = cleanText(value.planId);
  if (!planId) return null;
  return {
    ...value,
    planId,
    draftId: cleanText(value.draftId),
    status: cleanText(value.status),
    statusLabel: cleanText(value.statusLabel),
    fileName: cleanText(value.fileName),
    createdBy: cleanText(value.createdBy),
    createdAt: cleanText(value.createdAt),
    operationLogId: cleanText(value.operationLogId),
    lastExecutionId: cleanText(value.lastExecutionId),
    lastExecutionStatus: cleanText(value.lastExecutionStatus),
    lastExecutionAt: cleanText(value.lastExecutionAt),
    officialImportEnabled: false,
    officialWriteScope: "none",
  };
}

function normalizeImportExecutions(items) {
  return (Array.isArray(items) ? items : []).map(normalizeImportExecution).filter(Boolean);
}

function normalizeImportExecution(value) {
  if (!value || typeof value !== "object") return null;
  const executionId = cleanText(value.executionId);
  if (!executionId) return null;
  return {
    ...value,
    executionId,
    planId: cleanText(value.planId),
    draftId: cleanText(value.draftId),
    status: cleanText(value.status),
    statusLabel: cleanText(value.statusLabel),
    fileName: cleanText(value.fileName),
    requestedBy: cleanText(value.requestedBy),
    requestedAt: cleanText(value.requestedAt),
    officialWriterKind: cleanText(value.officialWriterKind),
    operationLogId: cleanText(value.operationLogId),
    officialImportEnabled: value.officialImportEnabled === true,
    officialWriteAttempted: value.officialWriteAttempted === true,
    officialWriteScope: cleanText(value.officialWriteScope) || "none",
  };
}

function normalizeOperationLogs(items) {
  return (Array.isArray(items) ? items : []).map(normalizeOperationLog).filter(Boolean);
}

function normalizeOperationLog(value) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id ?? value.operationLogId);
  if (!id) return null;
  return {
    id,
    targetType: cleanText(value.targetType ?? value.target_type),
    targetId: cleanText(value.targetId ?? value.target_id),
    action: cleanText(value.action),
    before: value.before ?? null,
    after: value.after ?? null,
    reason: cleanText(value.reason),
    operatorId: cleanText(value.operatorId ?? value.operator_id),
    pageKey: cleanText(value.pageKey ?? value.page_key) || "api",
    occurredAt: cleanText(value.occurredAt ?? value.occurred_at),
    createdAt: cleanText(value.createdAt ?? value.created_at),
  };
}

function normalizeOperationLogForPersistence(value) {
  const log = normalizeOperationLog(value);
  if (!log) return null;
  return {
    ...log,
    pageKey: log.pageKey || "api",
    occurredAt: log.occurredAt || new Date().toISOString(),
    createdAt: log.createdAt || new Date().toISOString(),
  };
}

function upsertByKey(items, item, key) {
  const safeItems = Array.isArray(items) ? items : [];
  return [item, ...safeItems.filter((current) => cleanText(current?.[key]) !== cleanText(item?.[key]))];
}

function getStorePath(storageRoot) {
  return join(storageRoot, masterDataImportReviewStoreKey);
}

function getLocalStorageRoot() {
  return process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage");
}

function normalizeLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.min(500, Math.max(1, Math.trunc(number)));
}

function cleanText(value) {
  return String(value ?? "").trim();
}
