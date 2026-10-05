import { resolveStoreMode } from "./storeMode.mjs";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildIdempotencyRequestHash, buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export const businessDecisionEvidenceDraftStoreKey = "metadata/business-decision-evidence-drafts.json";

export function createBusinessDecisionEvidenceDraftRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_BUSINESS_DECISION_STORE", "ERP_V1_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
  if (mode === "postgres") return createPostgresRepository(options);
  if (mode === "local") return createLocalRepository(options);
  throw new Error(`Unsupported business decision evidence draft repository mode: ${mode}`);
}

function createLocalRepository(options) {
  const storageRoot = options.storageRoot ?? getLocalStorageRoot();
  return Object.freeze({
    kind: "local_json",
    loadState() { return loadLocalState(storageRoot); },
    saveState({ workspace } = {}) { persistLocalState(storageRoot, workspace); },
    listDrafts({ workspace, filters = {} } = {}) { return filterDrafts(workspace?.businessDecisionEvidenceDrafts, filters); },
    findDraft({ workspace, draftId } = {}) { return findDraft(workspace?.businessDecisionEvidenceDrafts, draftId); },
    writeDraft(input = {}) {
      const result = commitLocalDraftWrite(input);
      persistLocalState(storageRoot, input.workspace);
      return result;
    },
  });
}

function createPostgresRepository(options) {
  const databaseUrl = options.databaseUrl ?? process.env.ERP_BUSINESS_DECISION_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL;
  const postgresClient = options.postgresClient ??
    (options.queryJson || options.idempotentTransactionJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson = options.queryJson ?? ((text, values) => postgresClient.queryJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor({ ...options, databaseUrl, postgresClient });
  return Object.freeze({
    kind: "postgres",
    async loadState() { return { businessDecisionEvidenceDrafts: normalizeDrafts(await queryJson(buildListDraftsQuery({}).text, [])) }; },
    async saveState() { return null; },
    async listDrafts({ filters = {} } = {}) {
      const query = buildListDraftsQuery(filters);
      return normalizeDrafts(await queryJson(query.text, query.values));
    },
    async findDraft({ draftId } = {}) {
      const query = buildListDraftsQuery({ draftId });
      return normalizeDrafts(await queryJson(query.text, query.values))[0] ?? null;
    },
    async writeDraft(input = {}) {
      const query = buildWriteDraftQuery(input);
      const result = normalizeWriteResult(await idempotentTransactionJson(buildPostgresIdempotencyRequest({
        scope: `business-decision.evidence-draft.${cleanText(input.action)}`,
        idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
        payload: input.idempotencyPayload,
        operatorId: input.operationLog?.operatorId,
        targetType: "business_decision_evidence_draft",
        targetId: input.draft?.draftId,
        resourceLocks: [`business-decision-evidence-draft:${cleanText(input.draft?.draftId)}`],
        query,
      })));
      applyWorkspaceWrite(input.workspace, result.draft, input.operationLog, result.replayed);
      if (input.action === "void" && input.workspace) {
        input.workspace.attachments = (input.workspace.attachments ?? []).map((attachment) =>
          cleanText(attachment.ownerType) === "business_decision_evidence_draft" && cleanText(attachment.ownerId) === result.draft.draftId
            ? { ...attachment, status: "voided" }
            : attachment,
        );
      }
      return result;
    },
  });
}

export function commitLocalDraftWrite(input = {}) {
  const workspace = input.workspace;
  const draft = normalizeDraft(input.draft);
  const action = cleanText(input.action);
  if (!workspace || !draft || !["create", "void"].includes(action)) throw new Error("A valid evidence draft write is required.");
  const scope = `business-decision.evidence-draft.${action}`;
  const key = cleanText(input.idempotencyKey);
  const hash = buildIdempotencyRequestHash(input.idempotencyPayload);
  const replay = (workspace.operationIdempotencyRecords ?? []).find((item) => item.scope === scope && item.idempotencyKey === key);
  if (replay) {
    if (replay.requestHash !== hash) throw draftError(409, "IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同的凭据草稿请求。");
    return { ...clone(replay.response), replayed: true };
  }
  const current = findDraft(workspace.businessDecisionEvidenceDrafts, draft.draftId);
  if (action === "create" && current) throw draftError(409, "BUSINESS_DECISION_EVIDENCE_DRAFT_ALREADY_EXISTS", "凭据草稿已存在。", { currentVersion: current });
  if (action === "void") {
    if (!current) throw draftError(404, "BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_FOUND", "凭据草稿不存在。");
    if (current.status !== "pending") throw draftError(409, "BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_PENDING", "只有待提交凭据草稿可以作废。", { currentVersion: current });
    if (current.revision !== Number(input.expectedRevision)) throw draftError(409, "BUSINESS_DECISION_EVIDENCE_DRAFT_WRITE_CONFLICT", "凭据草稿已被更新，请刷新后重试。", { currentVersion: current });
  }
  applyWorkspaceWrite(workspace, draft, input.operationLog, false);
  if (action === "void") {
    workspace.attachments = (workspace.attachments ?? []).map((attachment) =>
      cleanText(attachment.ownerType) === "business_decision_evidence_draft" && cleanText(attachment.ownerId) === draft.draftId
        ? { ...attachment, status: "voided" }
        : attachment,
    );
  }
  const result = { draft, operationLogId: cleanText(input.operationLog?.id), replayed: false };
  workspace.operationIdempotencyRecords = [{ scope, idempotencyKey: key, requestHash: hash, response: clone(result) }, ...(workspace.operationIdempotencyRecords ?? [])];
  return result;
}

export function buildWriteDraftQuery(input = {}) {
  const action = cleanText(input.action);
  const draft = normalizeDraft(input.draft);
  const log = input.operationLog;
  if (!draft || !log?.id || !["create", "void"].includes(action)) throw new Error("A valid evidence draft write is required.");
  const p = createPostgresParameterBinder();
  const expectedRevision = Number(input.expectedRevision);
  const locked = action === "create"
    ? `SELECT id FROM business_decision_evidence_drafts WHERE id = ${p.text(draft.draftId)} FOR UPDATE`
    : `SELECT * FROM business_decision_evidence_drafts WHERE id = ${p.text(draft.draftId)} FOR UPDATE`;
  const guard = action === "create"
    ? "NOT EXISTS (SELECT 1 FROM locked_draft)"
    : `EXISTS (SELECT 1 FROM locked_draft WHERE status = 'pending' AND revision = ${p.integer(expectedRevision)})`;
  const write = action === "create"
    ? `INSERT INTO business_decision_evidence_drafts (
        id, business_type, business_id, decision_scope, status, created_by, revision, created_at, updated_at
      ) SELECT ${p.text(draft.draftId)}, ${p.text(draft.businessType)}, ${p.text(draft.businessId)}, ${p.text(draft.decisionScope)},
        'pending', ${p.text(draft.createdBy)}, 1, ${p.timestamp(draft.createdAt)}, ${p.timestamp(draft.updatedAt)}
      FROM write_guard
      RETURNING ${draftJsonExpression("business_decision_evidence_drafts")} AS result`
    : `UPDATE business_decision_evidence_drafts SET status = 'voided', revision = revision + 1, updated_at = ${p.timestamp(draft.updatedAt)}
      FROM write_guard WHERE business_decision_evidence_drafts.id = ${p.text(draft.draftId)}
      RETURNING ${draftJsonExpression("business_decision_evidence_drafts")} AS result`;
  return {
    text: `BEGIN;
WITH locked_draft AS MATERIALIZED (${locked}),
write_guard AS MATERIALIZED (SELECT erp_require(${guard}, 'ERP_BUSINESS_DECISION_EVIDENCE_DRAFT_WRITE_CONFLICT') AS ok),
inserted_log AS (
  INSERT INTO operation_logs (id, target_type, target_id, action, before_json, after_json, reason, operator_id, page_key, occurred_at, created_at)
  SELECT ${p.text(log.id)}, ${p.text(log.targetType)}, ${p.text(log.targetId)}, ${p.text(log.action)},
    ${p.json(log.before ?? null)}, ${p.json(log.after ?? null)}, ${p.text(log.reason ?? "")}, ${p.text(log.operatorId)},
    ${p.text(log.pageKey ?? "api")}, ${p.timestamp(log.occurredAt)}, ${p.timestamp(log.createdAt)} FROM write_guard
  ON CONFLICT (id) DO NOTHING RETURNING id
),
written_draft AS (${write}),
voided_attachments AS (
  UPDATE attachments SET status = 'voided', updated_at = now()
  WHERE ${p.text(action)} = 'void' AND id IN (
    SELECT attachment_id FROM attachment_links
    WHERE owner_type = 'business_decision_evidence_draft' AND owner_id = ${p.text(draft.draftId)} AND purpose = 'business_decision_evidence'
  )
  RETURNING id
)
SELECT json_build_object('draft', (SELECT result FROM written_draft), 'operationLogId', (SELECT id FROM inserted_log), 'replayed', false) AS result;
COMMIT;`,
    values: p.values,
  };
}

export function buildListDraftsQuery(filters = {}) {
  const p = createPostgresParameterBinder();
  const clauses = [];
  if (cleanText(filters.draftId)) clauses.push(`id = ${p.text(filters.draftId)}`);
  if (cleanText(filters.businessType)) clauses.push(`business_type = ${p.text(filters.businessType)}`);
  if (cleanText(filters.businessId)) clauses.push(`business_id = ${p.text(filters.businessId)}`);
  if (cleanText(filters.decisionScope)) clauses.push(`decision_scope = ${p.text(filters.decisionScope)}`);
  if (cleanText(filters.status)) clauses.push(`status = ${p.text(filters.status)}`);
  return {
    text: `SELECT COALESCE(json_agg(record ORDER BY record->>'updatedAt' DESC), '[]'::json) AS result
FROM (SELECT ${draftJsonExpression("business_decision_evidence_drafts")} AS record
  FROM business_decision_evidence_drafts${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}) AS draft_records;`,
    values: p.values,
  };
}

export function normalizeDrafts(value) {
  return (Array.isArray(value) ? value : []).map(normalizeDraft).filter(Boolean);
}

export function normalizeDraft(value = {}) {
  const draftId = cleanText(value.draftId ?? value.id);
  const businessType = cleanText(value.businessType ?? value.business_type);
  const businessId = cleanText(value.businessId ?? value.business_id);
  const decisionScope = cleanText(value.decisionScope ?? value.decision_scope);
  if (!draftId || !businessType || !businessId || !decisionScope) return null;
  return {
    id: draftId, draftId, businessType, businessId, decisionScope,
    status: cleanText(value.status) || "pending",
    createdBy: cleanText(value.createdBy ?? value.created_by),
    revision: Math.max(1, Math.trunc(Number(value.revision) || 1)),
    createdAt: iso(value.createdAt ?? value.created_at), updatedAt: iso(value.updatedAt ?? value.updated_at),
    consumedByDecisionId: cleanText(value.consumedByDecisionId ?? value.consumed_by_decision_id),
  };
}

function filterDrafts(records, filters) {
  return normalizeDrafts(records)
    .filter((item) => !cleanText(filters.draftId) || item.draftId === cleanText(filters.draftId))
    .filter((item) => !cleanText(filters.businessType) || item.businessType === cleanText(filters.businessType))
    .filter((item) => !cleanText(filters.businessId) || item.businessId === cleanText(filters.businessId))
    .filter((item) => !cleanText(filters.decisionScope) || item.decisionScope === cleanText(filters.decisionScope))
    .filter((item) => !cleanText(filters.status) || item.status === cleanText(filters.status));
}

function findDraft(records, draftId) {
  return normalizeDrafts(records).find((item) => item.draftId === cleanText(draftId)) ?? null;
}

function applyWorkspaceWrite(workspace, draft, operationLog, replayed) {
  if (!workspace || !draft) return;
  workspace.businessDecisionEvidenceDrafts = [draft, ...(workspace.businessDecisionEvidenceDrafts ?? []).filter((item) => cleanText(item.draftId ?? item.id) !== draft.draftId)];
  if (!replayed && operationLog) workspace.operationLogs = [operationLog, ...(workspace.operationLogs ?? []).filter((item) => cleanText(item.id) !== cleanText(operationLog.id))];
}

function loadLocalState(storageRoot) {
  const path = join(storageRoot, businessDecisionEvidenceDraftStoreKey);
  if (!existsSync(path)) return { businessDecisionEvidenceDrafts: [], operationLogs: [] };
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return { businessDecisionEvidenceDrafts: normalizeDrafts(data.businessDecisionEvidenceDrafts), operationLogs: Array.isArray(data.operationLogs) ? data.operationLogs : [] };
  } catch { return { businessDecisionEvidenceDrafts: [], operationLogs: [] }; }
}

function persistLocalState(storageRoot, workspace) {
  const path = join(storageRoot, businessDecisionEvidenceDraftStoreKey);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const ids = new Set(normalizeDrafts(workspace.businessDecisionEvidenceDrafts).map((item) => item.draftId));
  const operationLogs = (workspace.operationLogs ?? []).filter((item) => cleanText(item.targetType) === "business_decision_evidence_draft" && ids.has(cleanText(item.targetId)));
  writeFileSync(path, `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), businessDecisionEvidenceDrafts: normalizeDrafts(workspace.businessDecisionEvidenceDrafts), operationLogs }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function draftJsonExpression(alias) {
  return `json_build_object('draftId', ${alias}.id, 'businessType', ${alias}.business_type, 'businessId', ${alias}.business_id,
    'decisionScope', ${alias}.decision_scope, 'status', ${alias}.status, 'createdBy', ${alias}.created_by,
    'revision', ${alias}.revision, 'createdAt', ${alias}.created_at, 'updatedAt', ${alias}.updated_at,
    'consumedByDecisionId', ${alias}.consumed_by_decision_id)`;
}

function normalizeWriteResult(value = {}) {
  return { draft: normalizeDraft(value.draft), operationLogId: cleanText(value.operationLogId ?? value.operation_log_id), replayed: value.replayed === true };
}

function draftError(statusCode, code, message, details) {
  const error = new Error(message); error.statusCode = statusCode; error.code = code; if (details) error.details = details; return error;
}

function iso(value) {
  const parsed = Date.parse(value ?? ""); return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function clone(value) { return JSON.parse(JSON.stringify(value ?? null)); }
function cleanText(value) { return String(value ?? "").trim(); }
function getLocalStorageRoot() { return process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage"); }
