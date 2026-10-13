import { resolveStoreMode } from "./storeMode.mjs";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import {
  buildIdempotencyRequestHash,
  buildPostgresIdempotencyRequest,
  resolveRepositoryIdempotencyKey,
} from "./idempotency.mjs";

export const businessDecisionAuthorizationStoreKey = "metadata/business-decision-authorizations.json";

export function createBusinessDecisionAuthorizationRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_BUSINESS_DECISION_STORE", "ERP_V1_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
  if (mode === "postgres") return createPostgresBusinessDecisionAuthorizationRepository(options);
  if (mode === "local") return createLocalBusinessDecisionAuthorizationRepository(options);
  throw new Error(`Unsupported business decision authorization repository mode: ${mode}`);
}

export function createLocalBusinessDecisionAuthorizationRepository(options = {}) {
  const storageRoot = options.storageRoot ?? getLocalStorageRoot();
  return Object.freeze({
    kind: "local_json",
    loadState() {
      return loadLocalState(storageRoot);
    },
    listAuthorizations({ workspace, filters = {} } = {}) {
      return filterAuthorizations(workspace?.businessDecisionAuthorizations, filters);
    },
    writeAuthorization(input = {}) {
      const result = commitLocalAuthorizationWrite(input);
      persistLocalState(storageRoot, input.workspace);
      return result;
    },
  });
}

export function createPostgresBusinessDecisionAuthorizationRepository(options = {}) {
  const databaseUrl = options.databaseUrl ?? process.env.ERP_BUSINESS_DECISION_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL;
  const postgresClient = options.postgresClient ??
    (options.queryJson || options.idempotentTransactionJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson = options.queryJson ?? ((text, values) => postgresClient.queryJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor({ ...options, databaseUrl, postgresClient });
  return Object.freeze({
    kind: "postgres",
    async loadState() {
      return { businessDecisionAuthorizations: normalizeAuthorizations(await queryJson(buildListQuery({}).text, [])) };
    },
    async listAuthorizations({ filters = {} } = {}) {
      const query = buildListQuery(filters);
      return normalizeAuthorizations(await queryJson(query.text, query.values));
    },
    async writeAuthorization(input = {}) {
      const query = buildWriteAuthorizationQuery(input);
      const authorizationId = cleanText(input.authorization?.authorizationId ?? input.authorization?.id);
      const value = await idempotentTransactionJson(buildPostgresIdempotencyRequest({
        scope: `business-decision.authorization.${cleanText(input.action)}`,
        idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
        payload: input.idempotencyPayload,
        operatorId: input.operationLog?.operatorId,
        targetType: "business_decision_authorization",
        targetId: authorizationId,
        resourceLocks: [
          `business-decision-authorization:${authorizationId}`,
          `business-decision-authorization-scope:${cleanText(input.authorization?.employeeId)}:${cleanText(input.authorization?.decisionScope)}`,
        ],
        query,
      }));
      const result = normalizeWriteResult(value);
      applyWorkspaceWrite(input.workspace, result.authorization, input.operationLog, result.replayed);
      return result;
    },
  });
}

export function commitLocalAuthorizationWrite(input = {}) {
  const workspace = input.workspace;
  const authorization = normalizeAuthorization(input.authorization);
  if (!workspace || !authorization || !["create", "update", "deactivate"].includes(input.action)) {
    throw new Error("A workspace, authorization, and valid authorization action are required.");
  }
  const scope = `business-decision.authorization.${input.action}`;
  const key = cleanText(input.idempotencyKey);
  const requestHash = buildIdempotencyRequestHash(input.idempotencyPayload);
  const replay = (workspace.operationIdempotencyRecords ?? []).find(
    (item) => item.scope === scope && item.idempotencyKey === key,
  );
  if (replay) {
    if (replay.requestHash !== requestHash) throw repositoryError(409, "IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同的授权请求。");
    return { ...clone(replay.response), replayed: true };
  }

  const records = normalizeAuthorizations(workspace.businessDecisionAuthorizations);
  const current = records.find((item) => item.authorizationId === authorization.authorizationId);
  if (input.action === "create" && current) {
    throw repositoryError(409, "BUSINESS_DECISION_AUTHORIZATION_ALREADY_EXISTS", "授权记录已存在。", { currentVersion: current });
  }
  if (input.action !== "create") {
    if (!current) throw repositoryError(404, "BUSINESS_DECISION_AUTHORIZATION_NOT_FOUND", "授权记录不存在。");
    if (current.revision !== Number(input.expectedRevision)) {
      throw repositoryError(409, "BUSINESS_DECISION_AUTHORIZATION_WRITE_CONFLICT", "授权已被其他操作人更新，请刷新后重试。", {
        currentVersion: current,
        submittedVersion: { expectedRevision: Number(input.expectedRevision), ...authorization },
      });
    }
    if (current.status !== "active") {
      throw repositoryError(409, "BUSINESS_DECISION_AUTHORIZATION_INACTIVE_IMMUTABLE", "已停用授权不能重新启用或覆盖，请新建授权。", {
        currentVersion: current,
      });
    }
  }
  if (authorization.status === "active") assertNoOverlap(records, authorization);

  const nextRecords = [authorization, ...records.filter((item) => item.authorizationId !== authorization.authorizationId)];
  workspace.businessDecisionAuthorizations = nextRecords;
  if (input.operationLog) workspace.operationLogs = upsertById(workspace.operationLogs, input.operationLog);
  const result = { authorization, operationLogId: cleanText(input.operationLog?.id), replayed: false };
  if (key) {
    workspace.operationIdempotencyRecords = [{ scope, idempotencyKey: key, requestHash, response: clone(result) }, ...(workspace.operationIdempotencyRecords ?? [])];
  }
  return result;
}

export function buildWriteAuthorizationQuery(input = {}) {
  const action = cleanText(input.action);
  const authorization = normalizeAuthorization(input.authorization);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!authorization || !operationLog || !["create", "update", "deactivate"].includes(action)) {
    throw new Error("A valid authorization write is required.");
  }
  const p = createPostgresParameterBinder();
  const expectedRevision = Number(input.expectedRevision);
  const overlapCondition = `candidate.employee_id = ${p.text(authorization.employeeId)}
      AND candidate.decision_scope = ${p.text(authorization.decisionScope)}
      AND candidate.status = 'active'
      AND candidate.id <> ${p.text(authorization.authorizationId)}
      AND candidate.active_from <= COALESCE(${p.nullableTimestamp(authorization.activeTo)}, 'infinity'::timestamptz)
      AND COALESCE(candidate.active_to, 'infinity'::timestamptz) >= ${p.timestamp(authorization.activeFrom)}`;
  const locked = action === "create"
    ? `SELECT id FROM business_decision_authorizations
       WHERE employee_id = ${p.text(authorization.employeeId)} AND decision_scope = ${p.text(authorization.decisionScope)}
       FOR UPDATE`
    : `SELECT * FROM business_decision_authorizations WHERE id = ${p.text(authorization.authorizationId)} FOR UPDATE`;
  const guard = action === "create"
    ? `NOT EXISTS (SELECT 1 FROM business_decision_authorizations WHERE id = ${p.text(authorization.authorizationId)})
       AND NOT EXISTS (SELECT 1 FROM business_decision_authorizations candidate WHERE ${overlapCondition})`
    : action === "update"
      ? `EXISTS (SELECT 1 FROM locked_authorization WHERE revision = ${p.integer(expectedRevision)} AND status = 'active')
         AND NOT EXISTS (SELECT 1 FROM business_decision_authorizations candidate WHERE ${overlapCondition})`
      : `EXISTS (SELECT 1 FROM locked_authorization WHERE revision = ${p.integer(expectedRevision)} AND status = 'active')`;
  const writeSql = action === "create"
    ? `INSERT INTO business_decision_authorizations (
        id, employee_id, decision_scope, max_amount, active_from, active_to, status,
        authorization_note, revision, created_by, updated_by, created_at, updated_at, operation_log_id
      ) SELECT
        ${p.text(authorization.authorizationId)}, ${p.text(authorization.employeeId)}, ${p.text(authorization.decisionScope)},
        ${p.nullableNumber(authorization.maxAmount)}, ${p.timestamp(authorization.activeFrom)}, ${p.nullableTimestamp(authorization.activeTo)},
        'active', ${p.text(authorization.authorizationNote)}, 1, ${p.text(authorization.createdBy)},
        ${p.text(authorization.updatedBy)}, ${p.timestamp(authorization.createdAt)}, ${p.timestamp(authorization.updatedAt)},
        inserted_operation_log.id
      FROM write_guard, inserted_operation_log
      RETURNING ${authorizationJsonExpression("business_decision_authorizations")} AS result`
    : action === "update"
      ? `UPDATE business_decision_authorizations SET
          employee_id = ${p.text(authorization.employeeId)}, decision_scope = ${p.text(authorization.decisionScope)},
          max_amount = ${p.nullableNumber(authorization.maxAmount)}, active_from = ${p.timestamp(authorization.activeFrom)},
          active_to = ${p.nullableTimestamp(authorization.activeTo)}, authorization_note = ${p.text(authorization.authorizationNote)},
          revision = revision + 1, updated_by = ${p.text(authorization.updatedBy)}, updated_at = ${p.timestamp(authorization.updatedAt)},
          operation_log_id = inserted_operation_log.id
        FROM inserted_operation_log, write_guard
        WHERE business_decision_authorizations.id = ${p.text(authorization.authorizationId)}
        RETURNING ${authorizationJsonExpression("business_decision_authorizations")} AS result`
      : `UPDATE business_decision_authorizations SET
          status = 'inactive', deactivated_by = ${p.text(authorization.deactivatedBy)},
          deactivated_at = ${p.timestamp(authorization.deactivatedAt)}, deactivation_reason = ${p.text(authorization.deactivationReason)},
          revision = revision + 1, updated_by = ${p.text(authorization.updatedBy)}, updated_at = ${p.timestamp(authorization.updatedAt)},
          operation_log_id = inserted_operation_log.id
        FROM inserted_operation_log, write_guard
        WHERE business_decision_authorizations.id = ${p.text(authorization.authorizationId)}
        RETURNING ${authorizationJsonExpression("business_decision_authorizations")} AS result`;
  return {
    text: `BEGIN;
WITH locked_authorization AS MATERIALIZED (${locked}),
write_guard AS MATERIALIZED (
  SELECT erp_require(${guard}, 'ERP_BUSINESS_DECISION_AUTHORIZATION_WRITE_CONFLICT') AS ok
),
inserted_operation_log AS (
  INSERT INTO operation_logs (id, target_type, target_id, action, before_json, after_json, reason, operator_id, page_key, occurred_at, created_at)
  SELECT ${p.text(operationLog.id)}, ${p.text(operationLog.targetType)}, ${p.text(operationLog.targetId)},
    ${p.text(operationLog.action)}, ${p.json(operationLog.before)}, ${p.json(operationLog.after)}, ${p.text(operationLog.reason)},
    ${p.text(operationLog.operatorId)}, ${p.text(operationLog.pageKey)}, ${p.timestamp(operationLog.occurredAt)}, ${p.timestamp(operationLog.createdAt)}
  FROM write_guard
  ON CONFLICT (id) DO NOTHING
  RETURNING id
),
written_authorization AS (${writeSql})
SELECT json_build_object(
  'authorization', (SELECT result FROM written_authorization),
  'operationLogId', (SELECT id FROM inserted_operation_log),
  'replayed', false
) AS result;
COMMIT;`,
    values: p.values,
  };
}

export function buildListQuery(filters = {}) {
  const p = createPostgresParameterBinder();
  const clauses = [];
  if (cleanText(filters.employeeId)) clauses.push(`employee_id = ${p.text(filters.employeeId)}`);
  if (cleanText(filters.scope ?? filters.decisionScope)) clauses.push(`decision_scope = ${p.text(filters.scope ?? filters.decisionScope)}`);
  if (cleanText(filters.status)) clauses.push(`status = ${p.text(filters.status)}`);
  return {
    text: `SELECT COALESCE(json_agg(record ORDER BY record->>'activeFrom' DESC), '[]'::json) AS result
FROM (SELECT ${authorizationJsonExpression("business_decision_authorizations")} AS record
  FROM business_decision_authorizations${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}) AS authorization_records;`,
    values: p.values,
  };
}

export function normalizeAuthorizations(value) {
  return (Array.isArray(value) ? value : []).map(normalizeAuthorization).filter(Boolean);
}

export function normalizeAuthorization(value = {}) {
  const authorizationId = cleanText(value.authorizationId ?? value.id);
  const employeeId = cleanText(value.employeeId ?? value.employee_id);
  const decisionScope = cleanText(value.decisionScope ?? value.decision_scope);
  if (!authorizationId || !employeeId || !decisionScope) return null;
  return {
    id: authorizationId,
    authorizationId,
    employeeId,
    decisionScope,
    maxAmount: nullableNumber(value.maxAmount ?? value.max_amount),
    activeFrom: iso(value.activeFrom ?? value.active_from),
    activeTo: nullableIso(value.activeTo ?? value.active_to),
    status: cleanText(value.status) || "active",
    authorizationNote: cleanText(value.authorizationNote ?? value.authorization_note),
    revision: Math.max(1, Math.trunc(Number(value.revision) || 1)),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    updatedBy: cleanText(value.updatedBy ?? value.updated_by),
    deactivatedBy: cleanText(value.deactivatedBy ?? value.deactivated_by),
    deactivatedAt: nullableIso(value.deactivatedAt ?? value.deactivated_at),
    deactivationReason: cleanText(value.deactivationReason ?? value.deactivation_reason),
    operationLogId: cleanText(value.operationLogId ?? value.operation_log_id),
    createdAt: iso(value.createdAt ?? value.created_at),
    updatedAt: iso(value.updatedAt ?? value.updated_at),
    history: Array.isArray(value.history) ? clone(value.history) : [],
  };
}

function filterAuthorizations(records, filters = {}) {
  return normalizeAuthorizations(records)
    .filter((item) => !cleanText(filters.employeeId) || item.employeeId === cleanText(filters.employeeId))
    .filter((item) => !cleanText(filters.scope ?? filters.decisionScope) || item.decisionScope === cleanText(filters.scope ?? filters.decisionScope))
    .filter((item) => !cleanText(filters.status) || item.status === cleanText(filters.status));
}

function assertNoOverlap(records, candidate) {
  const start = Date.parse(candidate.activeFrom);
  const end = Date.parse(candidate.activeTo || "9999-12-31T23:59:59.999Z");
  const overlapping = records.find((item) =>
    item.authorizationId !== candidate.authorizationId && item.status === "active" &&
    item.employeeId === candidate.employeeId && item.decisionScope === candidate.decisionScope &&
    Date.parse(item.activeFrom) <= end && Date.parse(item.activeTo || "9999-12-31T23:59:59.999Z") >= start,
  );
  if (overlapping) throw repositoryError(409, "BUSINESS_DECISION_AUTHORIZATION_OVERLAP", "同一决定人与授权范围存在重叠的有效授权。", { conflictingAuthorization: overlapping });
}

function applyWorkspaceWrite(workspace, authorization, operationLog, replayed) {
  if (!workspace || !authorization) return;
  workspace.businessDecisionAuthorizations = [authorization, ...(workspace.businessDecisionAuthorizations ?? []).filter(
    (item) => cleanText(item.authorizationId ?? item.id) !== authorization.authorizationId,
  )];
  if (!replayed && operationLog) workspace.operationLogs = upsertById(workspace.operationLogs, operationLog);
}

function loadLocalState(storageRoot) {
  const path = join(storageRoot, businessDecisionAuthorizationStoreKey);
  if (!existsSync(path)) return { businessDecisionAuthorizations: [], operationLogs: [] };
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return {
      businessDecisionAuthorizations: normalizeAuthorizations(data.businessDecisionAuthorizations),
      operationLogs: Array.isArray(data.operationLogs) ? data.operationLogs : [],
    };
  } catch {
    return { businessDecisionAuthorizations: [], operationLogs: [] };
  }
}

function persistLocalState(storageRoot, workspace) {
  const path = join(storageRoot, businessDecisionAuthorizationStoreKey);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const authorizationIds = new Set(normalizeAuthorizations(workspace.businessDecisionAuthorizations).map((item) => item.authorizationId));
  const operationLogs = (workspace.operationLogs ?? []).filter((item) =>
    cleanText(item.targetType) === "business_decision_authorization" && authorizationIds.has(cleanText(item.targetId)),
  );
  writeFileSync(path, `${JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    businessDecisionAuthorizations: normalizeAuthorizations(workspace.businessDecisionAuthorizations),
    operationLogs,
  }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function authorizationJsonExpression(alias) {
  return `json_build_object(
    'authorizationId', ${alias}.id, 'employeeId', ${alias}.employee_id,
    'decisionScope', ${alias}.decision_scope, 'maxAmount', ${alias}.max_amount,
    'activeFrom', ${alias}.active_from, 'activeTo', ${alias}.active_to,
    'status', ${alias}.status, 'authorizationNote', ${alias}.authorization_note,
    'revision', ${alias}.revision, 'createdBy', ${alias}.created_by, 'updatedBy', ${alias}.updated_by,
    'deactivatedBy', ${alias}.deactivated_by, 'deactivatedAt', ${alias}.deactivated_at,
    'deactivationReason', ${alias}.deactivation_reason, 'operationLogId', ${alias}.operation_log_id,
    'createdAt', ${alias}.created_at, 'updatedAt', ${alias}.updated_at,
    'history', COALESCE((
      SELECT json_agg(json_build_object(
        'operationLogId', operation_logs.id, 'action', operation_logs.action,
        'reason', COALESCE(operation_logs.reason, ''), 'operatorId', COALESCE(operation_logs.operator_id, ''),
        'occurredAt', operation_logs.occurred_at, 'before', operation_logs.before_json, 'after', operation_logs.after_json
      ) ORDER BY operation_logs.occurred_at DESC)
      FROM operation_logs
      WHERE operation_logs.target_type = 'business_decision_authorization' AND operation_logs.target_id = ${alias}.id
    ), '[]'::json)
  )`;
}

function normalizeOperationLog(value = {}) {
  if (!cleanText(value.id)) return null;
  return {
    id: cleanText(value.id), targetType: cleanText(value.targetType), targetId: cleanText(value.targetId),
    action: cleanText(value.action), before: clone(value.before), after: clone(value.after), reason: cleanText(value.reason),
    operatorId: cleanText(value.operatorId), pageKey: cleanText(value.pageKey) || "master_data",
    occurredAt: iso(value.occurredAt), createdAt: iso(value.createdAt),
  };
}

function normalizeWriteResult(value = {}) {
  return {
    authorization: normalizeAuthorization(value.authorization),
    operationLogId: cleanText(value.operationLogId ?? value.operation_log_id),
    replayed: value.replayed === true,
  };
}

function upsertById(records = [], record) {
  return [record, ...(records ?? []).filter((item) => cleanText(item.id) !== cleanText(record.id))];
}

function repositoryError(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function iso(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function nullableIso(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function getLocalStorageRoot() {
  return process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage");
}
