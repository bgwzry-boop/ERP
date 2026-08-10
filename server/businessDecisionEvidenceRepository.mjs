import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { attachmentUploadLimits } from "../shared/attachmentUploadPolicy.js";
import {
  buildIdempotencyRequestHash,
  buildPostgresIdempotencyRequest,
  normalizeIdempotencyKey,
  resolveRepositoryIdempotencyKey,
} from "./idempotency.mjs";

const committedWorkspaceKeys = Object.freeze([
  "businessDecisionRecords",
  "businessDecisionAuthorizations",
  "businessDecisionEvidenceDrafts",
  "attachmentLinks",
  "operationLogs",
  "operationIdempotencyRecords",
]);

export function createBusinessDecisionEvidenceRepository(options = {}) {
  const mode = options.mode ?? process.env.ERP_BUSINESS_DECISION_STORE ?? process.env.ERP_V1_STORE ?? "local";
  if (mode === "postgres") return createPostgresBusinessDecisionEvidenceRepository(options);
  if (mode === "local") return createLocalBusinessDecisionEvidenceRepository();
  throw new Error(`Unsupported business decision evidence repository mode: ${mode}`);
}

export function createLocalBusinessDecisionEvidenceRepository() {
  return Object.freeze({
    kind: "local_memory",
    loadState() {
      return { businessDecisionRecords: [], businessDecisionAuthorizations: [] };
    },
    listBusinessDecisions({ workspace, filters = {} } = {}) {
      return filterDecisionRecords(workspace?.businessDecisionRecords ?? [], filters);
    },
    listBusinessDecisionAuthorizations({ workspace, filters = {} } = {}) {
      return filterAuthorizations(workspace?.businessDecisionAuthorizations ?? [], filters);
    },
    commitDecisionBundle(input = {}) {
      return commitLocalDecisionBundle(input);
    },
    writeDecisionDirective(input = {}) {
      return commitLocalDecisionBundle({
        ...input,
        applyBusinessMutation(stagedWorkspace) {
          assertNoActiveTerminalDecision(stagedWorkspace.businessDecisionRecords, input.decisionRecord);
          stagedWorkspace.todos = upsertById(stagedWorkspace.todos, input.todo);
          return { commitKeys: ["todos"], result: { todo: cloneJson(input.todo) } };
        },
      });
    },
  });
}

export function createPostgresBusinessDecisionEvidenceRepository(options = {}) {
  const databaseUrl = options.databaseUrl ?? process.env.ERP_BUSINESS_DECISION_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL;
  const client = options.postgresClient ?? (options.queryJson || options.transactionJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson = options.queryJson ?? ((text, values) => client.queryJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor({ ...options, databaseUrl, postgresClient: client });
  return Object.freeze({
    kind: "postgres",
    async loadState() {
      const [businessDecisionRecords, businessDecisionAuthorizations] = await Promise.all([
        queryJson(buildListBusinessDecisionsQuery({}).text, []),
        queryJson(buildListBusinessDecisionAuthorizationsQuery({}).text, []),
      ]);
      return {
        businessDecisionRecords: normalizeDecisionRecords(businessDecisionRecords),
        businessDecisionAuthorizations: normalizeAuthorizations(businessDecisionAuthorizations),
      };
    },
    async listBusinessDecisions({ filters = {} } = {}) {
      const query = buildListBusinessDecisionsQuery(filters);
      return normalizeDecisionRecords(await queryJson(query.text, query.values));
    },
    async listBusinessDecisionAuthorizations({ filters = {} } = {}) {
      const query = buildListBusinessDecisionAuthorizationsQuery(filters);
      return normalizeAuthorizations(await queryJson(query.text, query.values));
    },
    async writeDecisionDirective(input = {}) {
      const query = buildWriteDecisionDirectiveTransactionQuery(input);
      const result = await idempotentTransactionJson(buildPostgresIdempotencyRequest({
        scope: input.idempotencyScope || "business_decision.directive.create",
        idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
        payload: input.idempotencyPayload ?? { decisionRecord: input.decisionRecord, todo: input.todo },
        operatorId: input.operationLog?.operatorId,
        targetType: input.decisionRecord?.businessType,
        targetId: input.decisionRecord?.businessId,
        resourceLocks: [
          `business-decision:${input.decisionRecord?.businessType ?? ""}:${input.decisionRecord?.businessId ?? ""}:${input.decisionRecord?.decisionScope ?? ""}`,
          `todo:${input.todo?.id ?? ""}`,
        ],
        query,
      }));
      const normalized = normalizeDecisionDirectiveResult(result, input);
      if (!normalized.businessDecision || !normalized.todo) {
        throw new Error("PostgreSQL business decision directive returned invalid data");
      }
      applyDecisionDirectiveWorkspaceMutation(input.workspace, normalized, input.operationLog);
      return normalized;
    },
  });
}

export function buildWriteDecisionDirectiveTransactionQuery(input = {}) {
  const decisionRecord = normalizeDecisionRecord(input.decisionRecord);
  const todo = normalizeDecisionTodo(input.todo);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!decisionRecord || !todo || !operationLog) {
    throw new Error("Decision record, office todo, and operation log are required");
  }
  const parameters = createPostgresParameterBinder();
  return {
    text: `
BEGIN;
WITH locked_active_decision AS MATERIALIZED (
  SELECT id
  FROM business_decision_records
  WHERE business_type = ${parameters.text(decisionRecord.businessType)}
    AND business_id = ${parameters.text(decisionRecord.businessId)}
    AND decision_scope = ${parameters.text(decisionRecord.decisionScope)}
    AND status = 'active'
  FOR UPDATE
),
business_write_guard AS MATERIALIZED (
  SELECT erp_require(
    NOT EXISTS (SELECT 1 FROM locked_active_decision),
    'ERP_BUSINESS_DECISION_ALREADY_TERMINAL'
  ) AS ok
),
inserted_business_decision AS (
  ${buildInsertBusinessDecisionCte(decisionRecord, parameters)}
),
inserted_todo AS (
  INSERT INTO todos (
    id, biz_no, type, ref_type, ref_id, priority, status, summary, due_at, remind_at,
    handled_by, handled_at, handling_result, created_by, created_at, updated_at
  )
  SELECT
    ${parameters.text(todo.id)}, ${parameters.text(todo.bizNo)}, ${parameters.text(todo.type)},
    ${parameters.text(todo.refType)}, ${parameters.text(todo.refId)}, ${parameters.text(todo.priority)},
    ${parameters.text(todo.status)}, ${parameters.text(todo.summary)}, ${parameters.nullableTimestamp(todo.dueAt)},
    ${parameters.nullableTimestamp(todo.remindAt)}, ${parameters.nullableText(todo.handledBy)},
    ${parameters.nullableTimestamp(todo.handledAt)}, ${parameters.nullableText(todo.handlingResult)},
    ${parameters.nullableText(todo.createdBy)}, ${parameters.timestamp(todo.createdAt)}, ${parameters.timestamp(todo.updatedAt)}
  FROM inserted_business_decision
  ON CONFLICT (id) DO NOTHING
  RETURNING ${todoJsonExpression("todos")} AS result
),
inserted_operation_log AS (
  INSERT INTO operation_logs (
    id, target_type, target_id, action, before_json, after_json, reason,
    operator_id, page_key, occurred_at, created_at
  )
  SELECT
    ${parameters.text(operationLog.id)}, ${parameters.text(operationLog.targetType)},
    ${parameters.text(operationLog.targetId)}, ${parameters.text(operationLog.action)},
    ${parameters.json(operationLog.before)}, ${parameters.json(operationLog.after)},
    ${parameters.text(operationLog.reason)}, ${parameters.nullableText(operationLog.operatorId)},
    ${parameters.text(operationLog.pageKey)}, ${parameters.timestamp(operationLog.occurredAt)},
    ${parameters.timestamp(operationLog.createdAt)}
  FROM inserted_business_decision
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
SELECT json_build_object(
  'businessDecision', (SELECT result FROM inserted_business_decision LIMIT 1),
  'todo', (SELECT result FROM inserted_todo LIMIT 1),
  'operationLogId', (SELECT id FROM inserted_operation_log LIMIT 1)
) AS result;
COMMIT;`,
    values: parameters.values,
  };
}

export function commitLocalDecisionBundle({
  workspace,
  decisionRecord,
  attachmentLinks = [],
  operationLog,
  applyBusinessMutation,
  idempotencyScope = "",
  idempotencyKey = "",
  idempotencyPayload = {},
} = {}) {
  if (!workspace || !decisionRecord?.id || typeof applyBusinessMutation !== "function") {
    throw new Error("workspace, decisionRecord, and applyBusinessMutation are required");
  }
  const normalizedKey = normalizeIdempotencyKey(idempotencyKey);
  const normalizedScope = cleanText(idempotencyScope);
  const requestHash = normalizedKey ? buildIdempotencyRequestHash(idempotencyPayload) : "";
  const storedIdempotency = (workspace.operationIdempotencyRecords ?? []).find(
    (record) => record.scope === normalizedScope && record.idempotencyKey === normalizedKey,
  );
  if (storedIdempotency) {
    if (storedIdempotency.requestHash !== requestHash) {
      throw businessError(409, "IDEMPOTENCY_KEY_REUSED", "The idempotency key was already used with different request content.");
    }
    return { ...cloneJson(storedIdempotency.response), replayed: true };
  }
  const existing = (workspace.businessDecisionRecords ?? []).find((record) => record.id === decisionRecord.id);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(decisionRecord)) {
      throw businessError(409, "IDEMPOTENCY_KEY_REUSED", "The decision identity was already used with different request content.");
    }
    return { replayed: true, businessDecision: existing };
  }
  const stagedWorkspace = stageWorkspace(workspace);
  const supersedesDecisionId = cleanText(decisionRecord.supersedesDecisionId);
  if (supersedesDecisionId) {
    const index = stagedWorkspace.businessDecisionRecords.findIndex((record) => record.id === supersedesDecisionId);
    if (index < 0) throw businessError(409, "BUSINESS_DECISION_SUPERSEDED_TARGET_NOT_FOUND", "The decision being corrected no longer exists.");
    stagedWorkspace.businessDecisionRecords[index] = {
      ...stagedWorkspace.businessDecisionRecords[index],
      status: "superseded",
      revision: Math.max(1, Number(stagedWorkspace.businessDecisionRecords[index].revision) || 1) + 1,
      updatedAt: decisionRecord.enteredAt,
    };
  }
  consumeLocalEvidenceDraft(stagedWorkspace, decisionRecord);
  const businessResult = applyBusinessMutation(stagedWorkspace);
  stagedWorkspace.businessDecisionRecords.unshift(cloneJson(decisionRecord));
  for (const link of attachmentLinks) {
    const attachment = (stagedWorkspace.attachments ?? []).find((item) => cleanText(item.attachmentId ?? item.id) === cleanText(link.attachmentId));
    if (!attachment) throw businessError(422, "BUSINESS_DECISION_EVIDENCE_INVALID", "A decision evidence attachment no longer exists.");
    stagedWorkspace.attachmentLinks = upsertById(stagedWorkspace.attachmentLinks, link);
  }
  if (operationLog) stagedWorkspace.operationLogs = upsertById(stagedWorkspace.operationLogs, operationLog);
  const response = { replayed: false, businessDecision: decisionRecord, businessResult: businessResult?.result ?? businessResult };
  if (normalizedKey) {
    stagedWorkspace.operationIdempotencyRecords.unshift({
      scope: normalizedScope,
      idempotencyKey: normalizedKey,
      requestHash,
      response: cloneJson(response),
    });
  }
  workspace.businessDecisionEvidenceDraftRepository?.saveState?.({ workspace: stagedWorkspace });
  for (const key of committedWorkspaceKeys) workspace[key] = stagedWorkspace[key];
  if (businessResult?.commitKeys) {
    for (const key of businessResult.commitKeys) workspace[key] = stagedWorkspace[key];
  }
  return response;
}

export function buildInsertBusinessDecisionCte(decisionRecord, parameters, guardCte = "business_write_guard") {
  const record = normalizeDecisionRecord(decisionRecord);
  if (!record) throw new Error("A valid business decision record is required");
  return `INSERT INTO business_decision_records (
  id, business_type, business_id, decision_scope, decision_type,
  decision_maker_employee_id, decision_maker_employee_no_snapshot, decision_maker_name_snapshot,
  decision_channel, decided_at, decision_content_json, authorization_id,
  authorization_snapshot_json, authorization_basis, amount_snapshot, currency,
  evidence_attachment_ids_json, evidence_draft_id, entered_by_user_id, entered_at, status,
  supersedes_decision_id, late_entry, late_entry_reason, revision, operation_log_id,
  created_at, updated_at
) SELECT
  ${parameters.text(record.id)}, ${parameters.text(record.businessType)}, ${parameters.text(record.businessId)},
  ${parameters.text(record.decisionScope)}, ${parameters.text(record.decisionType)},
  ${parameters.text(record.decisionMakerEmployeeId)}, ${parameters.text(record.decisionMakerEmployeeNoSnapshot)},
  ${parameters.text(record.decisionMakerNameSnapshot)}, ${parameters.text(record.decisionChannel)},
  ${parameters.timestamp(record.decidedAt)}, ${parameters.json(record.decisionContent)},
  ${parameters.nullableText(record.authorizationId)}, ${parameters.json(record.authorizationSnapshot)},
  ${parameters.text(record.authorizationBasis)}, ${parameters.nullableNumber(record.amountSnapshot)},
  ${parameters.text(record.currency)}, ${parameters.json(record.evidenceAttachmentIds)}, ${parameters.nullableText(record.evidenceDraftId)},
  ${parameters.text(record.enteredByUserId)}, ${parameters.timestamp(record.enteredAt)},
  ${parameters.text(record.status)}, ${parameters.nullableText(record.supersedesDecisionId)},
  ${parameters.boolean(record.lateEntry)}, ${parameters.text(record.lateEntryReason)},
  ${parameters.integer(record.revision)}, ${parameters.nullableText(record.operationLogId)},
  ${parameters.timestamp(record.createdAt)}, ${parameters.timestamp(record.updatedAt)}
WHERE EXISTS (SELECT 1 FROM ${guardCte} WHERE ok)
ON CONFLICT (id) DO NOTHING
RETURNING ${businessDecisionJsonExpression("business_decision_records")} AS result`;
}

export function buildBusinessDecisionAttachmentLinksCte(attachmentLinks, parameters, guardCte = "inserted_business_decision") {
  const records = (Array.isArray(attachmentLinks) ? attachmentLinks : []).filter((item) => item?.id && item?.attachmentId);
  if (!records.length) return "SELECT NULL::json AS result WHERE false";
  const values = records.map((record) => `(
    ${parameters.text(record.id)}, ${parameters.text(record.attachmentId)}, 'business_decision',
    ${parameters.text(record.ownerId)}, 'business_decision_evidence', ${parameters.timestamp(record.createdAt)}
  )`).join(",\n");
  return `INSERT INTO attachment_links (id, attachment_id, owner_type, owner_id, purpose, created_at)
SELECT input.* FROM (VALUES ${values}) AS input(id, attachment_id, owner_type, owner_id, purpose, created_at)
WHERE EXISTS (SELECT 1 FROM ${guardCte})
ON CONFLICT (attachment_id, owner_type, owner_id, purpose) DO NOTHING
RETURNING json_build_object('id', id, 'attachmentId', attachment_id) AS result`;
}

export function buildSupersedeBusinessDecisionCte(decisionRecord, parameters, guardCte = "business_write_guard") {
  const supersedesDecisionId = cleanText(decisionRecord?.supersedesDecisionId);
  if (!supersedesDecisionId) return "SELECT NULL::text AS id WHERE false";
  return `UPDATE business_decision_records
SET status = 'superseded', revision = revision + 1, updated_at = now()
WHERE id = ${parameters.text(supersedesDecisionId)}
  AND status = 'active'
  AND EXISTS (SELECT 1 FROM ${guardCte} WHERE ok)
RETURNING id`;
}

export function buildListBusinessDecisionsQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const clauses = [];
  if (cleanText(filters.businessType)) clauses.push(`business_type = ${parameters.text(cleanText(filters.businessType))}`);
  if (cleanText(filters.businessId)) clauses.push(`business_id = ${parameters.text(cleanText(filters.businessId))}`);
  if (cleanText(filters.decisionScope)) clauses.push(`decision_scope = ${parameters.text(cleanText(filters.decisionScope))}`);
  if (cleanText(filters.status)) clauses.push(`status = ${parameters.text(cleanText(filters.status))}`);
  return {
    text: `SELECT COALESCE(json_agg(result ORDER BY result->>'decidedAt' DESC), '[]'::json) AS result
FROM (SELECT ${businessDecisionJsonExpression("business_decision_records")} AS result
  FROM business_decision_records${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}) AS decisions;`,
    values: parameters.values,
  };
}

export function buildListBusinessDecisionAuthorizationsQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const clauses = [];
  if (cleanText(filters.scope ?? filters.decisionScope)) clauses.push(`decision_scope = ${parameters.text(cleanText(filters.scope ?? filters.decisionScope))}`);
  if (cleanText(filters.employeeId)) clauses.push(`employee_id = ${parameters.text(cleanText(filters.employeeId))}`);
  return {
    text: `SELECT COALESCE(json_agg(json_build_object(
  'authorizationId', id, 'employeeId', employee_id, 'decisionScope', decision_scope,
  'maxAmount', max_amount, 'activeFrom', active_from, 'activeTo', active_to,
  'status', status, 'authorizationNote', authorization_note, 'revision', revision
) ORDER BY active_from DESC), '[]'::json) AS result
FROM business_decision_authorizations${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""};`,
    values: parameters.values,
  };
}

export function normalizeDecisionRecords(value) {
  return (Array.isArray(value) ? value : []).map(normalizeDecisionRecord).filter(Boolean);
}

export function normalizeDecisionRecord(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = cleanText(value.id ?? value.businessDecisionId);
  if (!id) return null;
  return {
    id,
    businessDecisionId: id,
    businessType: cleanText(value.businessType ?? value.business_type),
    businessId: cleanText(value.businessId ?? value.business_id),
    decisionScope: cleanText(value.decisionScope ?? value.decision_scope),
    decisionType: cleanText(value.decisionType ?? value.decision_type),
    decisionMakerEmployeeId: cleanText(value.decisionMakerEmployeeId ?? value.decision_maker_employee_id),
    decisionMakerEmployeeNoSnapshot: cleanText(value.decisionMakerEmployeeNoSnapshot ?? value.decision_maker_employee_no_snapshot),
    decisionMakerNameSnapshot: cleanText(value.decisionMakerNameSnapshot ?? value.decision_maker_name_snapshot),
    decisionChannel: cleanText(value.decisionChannel ?? value.decision_channel),
    decidedAt: cleanText(value.decidedAt ?? value.decided_at),
    decisionContent: cloneJson(value.decisionContent ?? value.decision_content_json ?? {}),
    authorizationId: cleanText(value.authorizationId ?? value.authorization_id),
    authorizationSnapshot: cloneJson(value.authorizationSnapshot ?? value.authorization_snapshot_json ?? {}),
    authorizationBasis: cleanText(value.authorizationBasis ?? value.authorization_basis),
    amountSnapshot: nullableNumber(value.amountSnapshot ?? value.amount_snapshot),
    currency: cleanText(value.currency || "CNY"),
    evidenceAttachmentIds: normalizeJsonArray(value.evidenceAttachmentIds ?? value.evidence_attachment_ids_json),
    evidenceDraftId: cleanText(value.evidenceDraftId ?? value.evidence_draft_id),
    enteredByUserId: cleanText(value.enteredByUserId ?? value.entered_by_user_id),
    enteredAt: cleanText(value.enteredAt ?? value.entered_at),
    status: cleanText(value.status || "active"),
    supersedesDecisionId: cleanText(value.supersedesDecisionId ?? value.supersedes_decision_id),
    lateEntry: value.lateEntry === true || value.late_entry === true,
    lateEntryReason: cleanText(value.lateEntryReason ?? value.late_entry_reason),
    revision: Math.max(1, Math.trunc(Number(value.revision ?? 1) || 1)),
    operationLogId: cleanText(value.operationLogId ?? value.operation_log_id),
    createdAt: cleanText(value.createdAt ?? value.created_at),
    updatedAt: cleanText(value.updatedAt ?? value.updated_at),
  };
}

function normalizeAuthorizations(value) {
  return (Array.isArray(value) ? value : []).map((record) => ({
    authorizationId: cleanText(record.authorizationId ?? record.id),
    employeeId: cleanText(record.employeeId ?? record.employee_id),
    decisionScope: cleanText(record.decisionScope ?? record.decision_scope),
    maxAmount: nullableNumber(record.maxAmount ?? record.max_amount),
    activeFrom: cleanText(record.activeFrom ?? record.active_from),
    activeTo: cleanText(record.activeTo ?? record.active_to),
    status: cleanText(record.status || "active"),
    authorizationNote: cleanText(record.authorizationNote ?? record.authorization_note),
    revision: Math.max(1, Math.trunc(Number(record.revision ?? 1) || 1)),
  })).filter((record) => record.authorizationId);
}

function filterDecisionRecords(records, filters) {
  return normalizeDecisionRecords(records)
    .filter((record) => !cleanText(filters.businessType) || record.businessType === cleanText(filters.businessType))
    .filter((record) => !cleanText(filters.businessId) || record.businessId === cleanText(filters.businessId))
    .filter((record) => !cleanText(filters.decisionScope) || record.decisionScope === cleanText(filters.decisionScope))
    .filter((record) => !cleanText(filters.status) || record.status === cleanText(filters.status));
}

function filterAuthorizations(records, filters) {
  return normalizeAuthorizations(records)
    .filter((record) => !cleanText(filters.scope ?? filters.decisionScope) || record.decisionScope === cleanText(filters.scope ?? filters.decisionScope))
    .filter((record) => !cleanText(filters.employeeId) || record.employeeId === cleanText(filters.employeeId));
}

function assertNoActiveTerminalDecision(records, decisionRecord) {
  const active = normalizeDecisionRecords(records).find((record) =>
    record.status === "active"
    && record.businessType === cleanText(decisionRecord?.businessType)
    && record.businessId === cleanText(decisionRecord?.businessId)
    && record.decisionScope === cleanText(decisionRecord?.decisionScope));
  if (active) {
    const error = businessError(409, "BUSINESS_DECISION_ALREADY_TERMINAL", "该事项已经形成有效决定，请刷新后查看决定记录。");
    error.details = { currentDecision: active };
    throw error;
  }
}

function normalizeDecisionDirectiveResult(value, input) {
  return {
    businessDecision: normalizeDecisionRecord(value?.businessDecision) ?? normalizeDecisionRecord(input.decisionRecord),
    todo: normalizeDecisionTodo(value?.todo) ?? normalizeDecisionTodo(input.todo),
    operationLogId: cleanText(value?.operationLogId || input.operationLog?.id),
    replayed: value?.replayed === true,
  };
}

function applyDecisionDirectiveWorkspaceMutation(workspace, result, operationLog) {
  if (!workspace) return;
  workspace.businessDecisionRecords = upsertById(workspace.businessDecisionRecords, result.businessDecision);
  workspace.todos = upsertById(workspace.todos, result.todo);
  if (operationLog && result.operationLogId === cleanText(operationLog.id)) {
    workspace.operationLogs = upsertById(workspace.operationLogs, operationLog);
  }
}

function stageWorkspace(workspace) {
  return {
    ...workspace,
    businessDecisionRecords: cloneJson(workspace.businessDecisionRecords ?? []),
    businessDecisionAuthorizations: cloneJson(workspace.businessDecisionAuthorizations ?? []),
    businessDecisionEvidenceDrafts: cloneJson(workspace.businessDecisionEvidenceDrafts ?? []),
    attachments: cloneJson(workspace.attachments ?? []),
    attachmentLinks: cloneJson(workspace.attachmentLinks ?? []),
    operationLogs: cloneJson(workspace.operationLogs ?? []),
    operationIdempotencyRecords: cloneJson(workspace.operationIdempotencyRecords ?? []),
    productionScheduleRecords: cloneJson(workspace.productionScheduleRecords ?? []),
    productionTasks: cloneJson(workspace.productionTasks ?? []),
    orderLines: cloneJson(workspace.orderLines ?? []),
    rawMaterialPurchaseRequests: cloneJson(workspace.rawMaterialPurchaseRequests ?? []),
    fulfillments: cloneJson(workspace.fulfillments ?? []),
    fulfillmentExceptions: cloneJson(workspace.fulfillmentExceptions ?? []),
    todos: cloneJson(workspace.todos ?? []),
    fulfillmentQuantityVarianceResolutions: cloneJson(workspace.fulfillmentQuantityVarianceResolutions ?? []),
    statements: cloneJson(workspace.statements ?? []),
    varianceRecords: cloneJson(workspace.varianceRecords ?? []),
    statementWriteOffRecords: cloneJson(workspace.statementWriteOffRecords ?? []),
  };
}

function upsertById(records = [], record) {
  return [record, ...records.filter((item) => cleanText(item.id) !== cleanText(record.id))];
}

function businessDecisionJsonExpression(alias) {
  return `json_build_object(
    'businessDecisionId', ${alias}.id, 'businessType', ${alias}.business_type,
    'businessId', ${alias}.business_id, 'decisionScope', ${alias}.decision_scope,
    'decisionType', ${alias}.decision_type, 'decisionMakerEmployeeId', ${alias}.decision_maker_employee_id,
    'decisionMakerEmployeeNoSnapshot', ${alias}.decision_maker_employee_no_snapshot,
    'decisionMakerNameSnapshot', ${alias}.decision_maker_name_snapshot,
    'decisionChannel', ${alias}.decision_channel, 'decidedAt', ${alias}.decided_at,
    'decisionContent', ${alias}.decision_content_json, 'authorizationId', ${alias}.authorization_id,
    'authorizationSnapshot', ${alias}.authorization_snapshot_json, 'authorizationBasis', ${alias}.authorization_basis,
    'amountSnapshot', ${alias}.amount_snapshot, 'currency', ${alias}.currency,
    'evidenceAttachmentIds', ${alias}.evidence_attachment_ids_json,
    'evidenceDraftId', ${alias}.evidence_draft_id,
    'enteredByUserId', ${alias}.entered_by_user_id, 'enteredAt', ${alias}.entered_at,
    'status', ${alias}.status, 'supersedesDecisionId', ${alias}.supersedes_decision_id,
    'lateEntry', ${alias}.late_entry, 'lateEntryReason', ${alias}.late_entry_reason,
    'revision', ${alias}.revision, 'operationLogId', ${alias}.operation_log_id,
    'createdAt', ${alias}.created_at, 'updatedAt', ${alias}.updated_at
  )`;
}

function todoJsonExpression(alias) {
  return `json_build_object(
    'todoId', ${alias}.id, 'bizNo', ${alias}.biz_no, 'type', ${alias}.type,
    'refType', ${alias}.ref_type, 'refId', ${alias}.ref_id, 'priority', ${alias}.priority,
    'status', ${alias}.status, 'summary', ${alias}.summary, 'dueAt', ${alias}.due_at,
    'remindAt', ${alias}.remind_at, 'handledBy', ${alias}.handled_by, 'handledAt', ${alias}.handled_at,
    'handlingResult', ${alias}.handling_result, 'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at, 'updatedAt', ${alias}.updated_at
  )`;
}

function normalizeDecisionTodo(value = {}) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id ?? value.todoId);
  if (!id) return null;
  return {
    ...value,
    id,
    todoId: id,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || id,
    type: cleanText(value.type) || "经营决定待执行",
    refType: cleanText(value.refType ?? value.ref_type),
    refId: cleanText(value.refId ?? value.ref_id ?? value.ref),
    priority: cleanText(value.priority ?? value.urgency) || "关注",
    status: cleanText(value.status) || "未处理",
    summary: cleanText(value.summary),
    dueAt: cleanText(value.dueAt ?? value.due_at),
    remindAt: cleanText(value.remindAt ?? value.remind_at),
    handledBy: cleanText(value.handledBy ?? value.handled_by),
    handledAt: cleanText(value.handledAt ?? value.handled_at),
    handlingResult: cleanText(value.handlingResult ?? value.handling_result),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    createdAt: cleanText(value.createdAt ?? value.created_at),
    updatedAt: cleanText(value.updatedAt ?? value.updated_at),
  };
}

function normalizeOperationLog(value = {}) {
  if (!value || typeof value !== "object" || !cleanText(value.id)) return null;
  return {
    ...value,
    id: cleanText(value.id),
    targetType: cleanText(value.targetType ?? value.target_type),
    targetId: cleanText(value.targetId ?? value.target_id),
    action: cleanText(value.action),
    before: value.before ?? value.before_json ?? null,
    after: value.after ?? value.after_json ?? null,
    reason: cleanText(value.reason),
    operatorId: cleanText(value.operatorId ?? value.operator_id),
    pageKey: cleanText(value.pageKey ?? value.page_key) || "decision_mobile",
    occurredAt: cleanText(value.occurredAt ?? value.occurred_at),
    createdAt: cleanText(value.createdAt ?? value.created_at),
  };
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  if (typeof value === "string") {
    try { return normalizeJsonArray(JSON.parse(value)); } catch { return []; }
  }
  return [];
}

function consumeLocalEvidenceDraft(workspace, decisionRecord) {
  const draftId = cleanText(decisionRecord.evidenceDraftId);
  const attachmentIds = normalizeJsonArray(decisionRecord.evidenceAttachmentIds);
  if (!draftId) {
    if (attachmentIds.length) throw businessError(422, "BUSINESS_DECISION_EVIDENCE_DRAFT_REQUIRED", "Decision evidence must be bound to an evidence draft.");
    return;
  }
  const index = (workspace.businessDecisionEvidenceDrafts ?? []).findIndex((item) => cleanText(item.draftId ?? item.id) === draftId);
  if (index < 0) throw businessError(422, "BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_FOUND", "The decision evidence draft no longer exists.");
  const draft = workspace.businessDecisionEvidenceDrafts[index];
  if (cleanText(draft.status) !== "pending") throw businessError(409, "BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_PENDING", "The decision evidence draft was already consumed or voided.");
  if (
    cleanText(draft.businessType ?? draft.business_type) !== cleanText(decisionRecord.businessType) ||
    cleanText(draft.businessId ?? draft.business_id) !== cleanText(decisionRecord.businessId) ||
    cleanText(draft.decisionScope ?? draft.decision_scope) !== cleanText(decisionRecord.decisionScope)
  ) {
    throw businessError(422, "BUSINESS_DECISION_EVIDENCE_DRAFT_TARGET_MISMATCH", "The decision evidence draft is bound to another business target.");
  }
  const validIds = (workspace.attachments ?? [])
    .filter((item) => cleanText(item.ownerType) === "business_decision_evidence_draft" && cleanText(item.ownerId) === draftId && cleanText(item.purpose) === "business_decision_evidence" && cleanText(item.status) === "uploaded")
    .filter((item) => item.hasContent === true && cleanText(item.uploadedBy) && ["image", "pdf", "document", "spreadsheet"].includes(cleanText(item.fileType)) && Number(item.fileSize ?? 0) > 0 && Number(item.fileSize ?? 0) <= attachmentUploadLimits.documentBytes)
    .map((item) => cleanText(item.attachmentId ?? item.id))
    .sort();
  if (attachmentIds.length > 5 || JSON.stringify([...attachmentIds].sort()) !== JSON.stringify(validIds)) {
    throw businessError(422, "BUSINESS_DECISION_EVIDENCE_ATTACHMENT_INVALID", "The decision evidence attachments changed or are invalid.");
  }
  workspace.businessDecisionEvidenceDrafts[index] = {
    ...draft,
    status: "consumed",
    consumedByDecisionId: cleanText(decisionRecord.id),
    revision: Math.max(1, Number(draft.revision) || 1) + 1,
    updatedAt: cleanText(decisionRecord.enteredAt),
  };
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function businessError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
