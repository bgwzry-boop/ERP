import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import {
  buildIdempotencyConflictError,
  buildIdempotencyRequestHash,
  buildPostgresIdempotencyRequest,
  normalizeIdempotencyKey,
  readPostgresIdempotencyReplay,
} from "./idempotency.mjs";
import {
  buildBusinessDecisionAttachmentLinksCte,
  buildInsertBusinessDecisionCte,
} from "./businessDecisionEvidenceRepository.mjs";

export const rawMaterialPurchaseStatuses = Object.freeze([
  "待执行",
  "已联系供应商",
  "已下单",
  "部分到货",
  "已完成",
  "已取消",
]);

export function createRawMaterialPurchaseRepository(options = {}) {
  const mode = options.mode ?? process.env.ERP_RAW_MATERIAL_PURCHASE_STORE ?? process.env.ERP_RAW_MATERIAL_STORE ?? "local";
  if (mode === "postgres") return createPostgresRawMaterialPurchaseRepository(options);
  if (mode === "local") return createLocalRawMaterialPurchaseRepository();
  throw new Error(`Unsupported raw-material purchase repository mode: ${mode}`);
}

export function createLocalRawMaterialPurchaseRepository() {
  return Object.freeze({
    kind: "local_memory",
    loadState() { return { rawMaterialPurchaseRequests: [] }; },
    listPurchaseRequests({ workspace, filters = {} } = {}) {
      return filterPurchaseRequests(workspace?.rawMaterialPurchaseRequests ?? [], filters);
    },
    getPurchaseRequest({ workspace, requestId } = {}) {
      return findPurchaseRequest(workspace?.rawMaterialPurchaseRequests, requestId);
    },
    findIdempotentReplay(input = {}) {
      return readLocalPurchaseIdempotentReplay(input);
    },
    createPurchaseRequest(input = {}) {
      const request = normalizePurchaseRequest(input.purchaseRequest);
      if (!request || !input.decisionRecord || !input.operationLog) throw new Error("Purchase request, business decision, and operation log are required");
      const committed = input.workspace.businessDecisionEvidenceRepository.commitDecisionBundle({
        workspace: input.workspace,
        decisionRecord: input.decisionRecord,
        attachmentLinks: input.attachmentLinks,
        operationLog: input.operationLog,
        idempotencyScope: "raw_material.purchase.create",
        idempotencyKey: input.idempotencyKey,
        idempotencyPayload: input.idempotencyPayload,
        applyBusinessMutation(stagedWorkspace) {
          if (findPurchaseRequest(stagedWorkspace.rawMaterialPurchaseRequests, request.id)) {
            throw businessError(409, "RAW_MATERIAL_PURCHASE_ALREADY_EXISTS", "The purchase request already exists.");
          }
          stagedWorkspace.rawMaterialPurchaseRequests.unshift(request);
          return {
            commitKeys: ["rawMaterialPurchaseRequests"],
            result: { purchaseRequest: request, operationLogId: input.operationLog.id },
          };
        },
      });
      return {
        ...committed.businessResult,
        businessDecision: committed.businessDecision,
        replayed: committed.replayed === true,
      };
    },
    updatePurchaseRequestStatus(input = {}) {
      return updateLocalPurchaseRequestStatus(input);
    },
  });
}

export function createPostgresRawMaterialPurchaseRepository(options = {}) {
  const { queryJson, idempotentTransactionJson } = createPostgresTransactionExecutor({
    ...options,
    databaseUrl: options.databaseUrl ?? process.env.ERP_RAW_MATERIAL_PURCHASE_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
  });
  return Object.freeze({
    kind: "postgres",
    async loadState() {
      return { rawMaterialPurchaseRequests: normalizePurchaseRequests(await queryJson(buildListPurchaseRequestsQuery({}).text, [])) };
    },
    async listPurchaseRequests({ filters = {} } = {}) {
      const query = buildListPurchaseRequestsQuery(filters);
      return normalizePurchaseRequests(await queryJson(query.text, query.values));
    },
    async getPurchaseRequest({ requestId } = {}) {
      const query = buildListPurchaseRequestsQuery({ requestId });
      return normalizePurchaseRequests(await queryJson(query.text, query.values))[0] ?? null;
    },
    async findIdempotentReplay(input = {}) {
      const replay = await readPostgresIdempotencyReplay({
        queryJson,
        scope: input.scope || "raw_material.purchase.create",
        idempotencyKey: input.idempotencyKey,
        payload: input.idempotencyPayload,
      });
      return replay ? { ...normalizePurchaseTransactionResult(replay), replayed: true } : null;
    },
    async createPurchaseRequest(input = {}) {
      const query = buildCreatePurchaseRequestTransactionQuery(input);
      const saved = normalizePurchaseTransactionResult(await idempotentTransactionJson(buildPostgresIdempotencyRequest({
        scope: "raw_material.purchase.create",
        idempotencyKey: input.idempotencyKey,
        payload: input.idempotencyPayload,
        operatorId: input.operationLog?.operatorId,
        targetType: "raw_material_purchase_request",
        targetId: input.purchaseRequest?.id,
        resourceLocks: [`raw-material-purchase:${input.purchaseRequest?.id}`],
        query,
      })));
      applyPurchaseWorkspaceMutation(input.workspace, saved.purchaseRequest, input.operationLog, saved.businessDecision);
      return saved;
    },
    async updatePurchaseRequestStatus(input = {}) {
      const query = buildUpdatePurchaseRequestStatusTransactionQuery(input);
      const saved = normalizePurchaseTransactionResult(await idempotentTransactionJson(buildPostgresIdempotencyRequest({
        scope: "raw_material.purchase.status",
        idempotencyKey: input.idempotencyKey,
        payload: input.idempotencyPayload,
        operatorId: input.operationLog?.operatorId,
        targetType: "raw_material_purchase_request",
        targetId: input.purchaseRequest?.id,
        resourceLocks: [`raw-material-purchase:${input.purchaseRequest?.id}`],
        query,
      })));
      applyPurchaseWorkspaceMutation(input.workspace, saved.purchaseRequest, input.operationLog, saved.businessDecision);
      return saved;
    },
  });
}

export function buildCreatePurchaseRequestTransactionQuery(input = {}) {
  const request = normalizePurchaseRequest(input.purchaseRequest);
  if (!request || !input.decisionRecord || !input.operationLog) throw new Error("Purchase request, business decision, and operation log are required");
  const parameters = createPostgresParameterBinder();
  const operationLogSql = buildInsertOperationLogSql(input.operationLog, parameters);
  const decisionSql = buildInsertBusinessDecisionCte(input.decisionRecord, parameters, "business_write_guard");
  const attachmentLinksSql = buildBusinessDecisionAttachmentLinksCte(input.attachmentLinks, parameters, "inserted_business_decision");
  return {
    text: `BEGIN;
WITH inserted_operation_log AS (
  ${operationLogSql}
),
business_write_guard AS MATERIALIZED (
  SELECT erp_require((SELECT COUNT(*) FROM inserted_operation_log) = 1, 'ERP_RAW_MATERIAL_PURCHASE_OPERATION_LOG_CONFLICT') AS ok
),
inserted_business_decision AS (
  ${decisionSql}
),
inserted_attachment_links AS (
  ${attachmentLinksSql}
),
inserted_purchase_request AS (
  INSERT INTO raw_material_purchase_requests (
    id, supplier_id, supplier_name_snapshot, material_lines_json, required_at, status,
    business_decision_id, created_by, revision, created_at, updated_at
  ) SELECT
    ${parameters.text(request.id)}, ${parameters.text(request.supplierId)}, ${parameters.text(request.supplierNameSnapshot)},
    ${parameters.json(request.materialLines)}, ${parameters.nullableTimestamp(request.requiredAt)}, ${parameters.text(request.status)},
    ${parameters.text(request.businessDecisionId)}, ${parameters.text(request.createdBy)}, 1,
    ${parameters.timestamp(request.createdAt)}, ${parameters.timestamp(request.updatedAt)}
  WHERE EXISTS (SELECT 1 FROM inserted_business_decision)
  ON CONFLICT (id) DO NOTHING
  RETURNING ${purchaseRequestJsonExpression("raw_material_purchase_requests")} AS result
),
purchase_write_guard AS MATERIALIZED (
  SELECT erp_require((SELECT COUNT(*) FROM inserted_purchase_request) = 1, 'ERP_RAW_MATERIAL_PURCHASE_CREATE_CONFLICT') AS ok
)
SELECT json_build_object(
  'purchaseRequest', (SELECT result FROM inserted_purchase_request),
  'businessDecision', (SELECT result FROM inserted_business_decision),
  'operationLogId', (SELECT id FROM inserted_operation_log),
  'writeGuard', (SELECT ok FROM purchase_write_guard)
) AS result;
COMMIT;`,
    values: parameters.values,
  };
}

export function buildUpdatePurchaseRequestStatusTransactionQuery(input = {}) {
  const request = normalizePurchaseRequest(input.purchaseRequest);
  if (!request || !input.operationLog) throw new Error("Purchase request and operation log are required");
  const parameters = createPostgresParameterBinder();
  const hasDecision = Boolean(input.decisionRecord);
  const operationLogSql = buildInsertOperationLogSql(input.operationLog, parameters);
  const decisionCte = hasDecision
    ? `inserted_business_decision AS (${buildInsertBusinessDecisionCte(input.decisionRecord, parameters, "business_write_guard")}),`
    : "inserted_business_decision AS (SELECT NULL::json AS result WHERE false),";
  const attachmentCte = hasDecision
    ? `inserted_attachment_links AS (${buildBusinessDecisionAttachmentLinksCte(input.attachmentLinks, parameters, "inserted_business_decision")}),`
    : "inserted_attachment_links AS (SELECT NULL::json AS result WHERE false),";
  return {
    text: `BEGIN;
WITH locked_request AS MATERIALIZED (
  SELECT id, revision FROM raw_material_purchase_requests
  WHERE id = ${parameters.text(request.id)} FOR UPDATE
),
updated_request AS (
  UPDATE raw_material_purchase_requests
  SET status = ${parameters.text(request.status)}, revision = revision + 1, updated_at = now()
  FROM locked_request AS locked
  WHERE raw_material_purchase_requests.id = locked.id
    AND locked.revision = ${parameters.integer(request.expectedRevision)}
  RETURNING ${purchaseRequestJsonExpression("raw_material_purchase_requests")} AS result
),
business_write_guard AS MATERIALIZED (
  SELECT erp_require((SELECT COUNT(*) FROM updated_request) = 1, 'ERP_RAW_MATERIAL_PURCHASE_CONCURRENCY_CONFLICT') AS ok
),
inserted_operation_log AS (
  ${operationLogSql}
),
${decisionCte}
${attachmentCte}
purchase_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM inserted_operation_log) = 1
    AND (${hasDecision ? "(SELECT COUNT(*) FROM inserted_business_decision) = 1" : "true"}),
    'ERP_RAW_MATERIAL_PURCHASE_EVIDENCE_CONFLICT'
  ) AS ok
)
SELECT json_build_object(
  'purchaseRequest', (SELECT result FROM updated_request),
  'businessDecision', (SELECT result FROM inserted_business_decision),
  'operationLogId', (SELECT id FROM inserted_operation_log),
  'writeGuard', (SELECT ok FROM purchase_write_guard)
) AS result;
COMMIT;`,
    values: parameters.values,
  };
}

export function buildListPurchaseRequestsQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const clauses = [];
  if (cleanText(filters.requestId)) clauses.push(`id = ${parameters.text(cleanText(filters.requestId))}`);
  if (cleanText(filters.status)) clauses.push(`status = ${parameters.text(cleanText(filters.status))}`);
  if (cleanText(filters.supplierId)) clauses.push(`supplier_id = ${parameters.text(cleanText(filters.supplierId))}`);
  return {
    text: `SELECT COALESCE(json_agg(result ORDER BY result->>'createdAt' DESC), '[]'::json) AS result
FROM (SELECT ${purchaseRequestJsonExpression("raw_material_purchase_requests")} AS result
  FROM raw_material_purchase_requests${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}) AS requests;`,
    values: parameters.values,
  };
}

function updateLocalPurchaseRequestStatus(input) {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const idempotencyScope = "raw_material.purchase.status";
  const requestHash = idempotencyKey ? buildIdempotencyRequestHash(input.idempotencyPayload) : "";
  const stored = (input.workspace?.operationIdempotencyRecords ?? []).find(
    (record) => record.scope === idempotencyScope && record.idempotencyKey === idempotencyKey,
  );
  if (stored) {
    if (stored.requestHash !== requestHash) {
      throw businessError(409, "IDEMPOTENCY_KEY_REUSED", "The idempotency key was already used with different request content.");
    }
    const replay = cloneJson(stored.response);
    return replay.businessResult
      ? { ...replay.businessResult, businessDecision: replay.businessDecision, replayed: true }
      : { ...replay, replayed: true };
  }
  const current = findPurchaseRequest(input.workspace?.rawMaterialPurchaseRequests, input.purchaseRequest?.id);
  if (!current) throw businessError(404, "RAW_MATERIAL_PURCHASE_NOT_FOUND", "The purchase request does not exist.");
  const expectedRevision = positiveInteger(input.purchaseRequest?.expectedRevision, 0);
  if (current.revision !== expectedRevision) throw conflict(current.revision);
  const next = { ...current, status: input.purchaseRequest.status, revision: current.revision + 1, updatedAt: input.purchaseRequest.updatedAt };
  if (input.decisionRecord) {
    const committed = input.workspace.businessDecisionEvidenceRepository.commitDecisionBundle({
      workspace: input.workspace,
      decisionRecord: input.decisionRecord,
      attachmentLinks: input.attachmentLinks,
      operationLog: input.operationLog,
      idempotencyScope: "raw_material.purchase.status",
      idempotencyKey: input.idempotencyKey,
      idempotencyPayload: input.idempotencyPayload,
      applyBusinessMutation(stagedWorkspace) {
        const stagedCurrent = findPurchaseRequest(stagedWorkspace.rawMaterialPurchaseRequests, next.id);
        if (!stagedCurrent || stagedCurrent.revision !== expectedRevision) throw conflict(stagedCurrent?.revision ?? 0);
        stagedWorkspace.rawMaterialPurchaseRequests = upsertPurchaseRequest(stagedWorkspace.rawMaterialPurchaseRequests, next);
        return { commitKeys: ["rawMaterialPurchaseRequests"], result: { purchaseRequest: next, operationLogId: input.operationLog.id } };
      },
    });
    return {
      ...committed.businessResult,
      businessDecision: committed.businessDecision,
      replayed: committed.replayed === true,
    };
  }
  const result = { purchaseRequest: next, businessDecision: null, operationLogId: input.operationLog.id, replayed: false };
  const nextRequests = upsertPurchaseRequest(input.workspace.rawMaterialPurchaseRequests, next);
  const nextLogs = upsertById(input.workspace.operationLogs, input.operationLog);
  const nextIdempotencyRecords = [...(input.workspace.operationIdempotencyRecords ?? [])];
  if (idempotencyKey) {
    nextIdempotencyRecords.unshift({
      scope: idempotencyScope,
      idempotencyKey,
      requestHash,
      response: cloneJson(result),
    });
  }
  input.workspace.rawMaterialPurchaseRequests = nextRequests;
  input.workspace.operationLogs = nextLogs;
  input.workspace.operationIdempotencyRecords = nextIdempotencyRecords;
  return result;
}

function readLocalPurchaseIdempotentReplay({
  workspace,
  scope = "raw_material.purchase.create",
  idempotencyKey,
  idempotencyPayload,
} = {}) {
  const key = normalizeIdempotencyKey(idempotencyKey);
  if (!key) return null;
  const stored = (workspace?.operationIdempotencyRecords ?? []).find(
    (record) => record.scope === scope && record.idempotencyKey === key,
  );
  if (!stored) return null;
  if (stored.requestHash !== buildIdempotencyRequestHash(idempotencyPayload)) {
    throw buildIdempotencyConflictError();
  }
  const replay = cloneJson(stored.response);
  return replay.businessResult
    ? { ...replay.businessResult, businessDecision: replay.businessDecision, replayed: true }
    : { ...normalizePurchaseTransactionResult(replay), replayed: true };
}

function applyPurchaseWorkspaceMutation(workspace, purchaseRequest, operationLog, businessDecision) {
  if (!workspace || !purchaseRequest) return;
  workspace.rawMaterialPurchaseRequests = upsertPurchaseRequest(workspace.rawMaterialPurchaseRequests, purchaseRequest);
  if (operationLog) workspace.operationLogs = upsertById(workspace.operationLogs, operationLog);
  if (businessDecision) workspace.businessDecisionRecords = upsertById(workspace.businessDecisionRecords, businessDecision);
}

function buildInsertOperationLogSql(operationLog, parameters) {
  return `INSERT INTO operation_logs (
    id, target_type, target_id, action, before_json, after_json, reason,
    operator_id, page_key, occurred_at, created_at
  ) VALUES (
    ${parameters.text(operationLog.id)}, ${parameters.text(operationLog.targetType)},
    ${parameters.text(operationLog.targetId)}, ${parameters.text(operationLog.action)},
    ${parameters.json(operationLog.before ?? null)}, ${parameters.json(operationLog.after ?? null)},
    ${parameters.text(operationLog.reason)}, ${parameters.text(operationLog.operatorId)},
    ${parameters.text(operationLog.pageKey ?? "raw_materials")},
    ${parameters.timestamp(operationLog.occurredAt)}, ${parameters.timestamp(operationLog.createdAt)}
  ) ON CONFLICT (id) DO NOTHING RETURNING id`;
}

function purchaseRequestJsonExpression(alias) {
  return `json_build_object(
    'requestId', ${alias}.id, 'supplierId', ${alias}.supplier_id,
    'supplierNameSnapshot', ${alias}.supplier_name_snapshot,
    'materialLines', ${alias}.material_lines_json, 'requiredAt', ${alias}.required_at,
    'status', ${alias}.status, 'businessDecisionId', ${alias}.business_decision_id,
    'createdBy', ${alias}.created_by, 'revision', ${alias}.revision,
    'createdAt', ${alias}.created_at, 'updatedAt', ${alias}.updated_at
  )`;
}

export function normalizePurchaseTransactionResult(value = {}) {
  return {
    purchaseRequest: normalizePurchaseRequest(value.purchaseRequest),
    businessDecision: value.businessDecision ?? null,
    operationLogId: cleanText(value.operationLogId),
  };
}

export function normalizePurchaseRequests(value) {
  return (Array.isArray(value) ? value : []).map(normalizePurchaseRequest).filter(Boolean);
}

export function normalizePurchaseRequest(value = {}) {
  const id = cleanText(value.id ?? value.requestId);
  if (!id) return null;
  const status = cleanText(value.status || "待执行");
  if (!rawMaterialPurchaseStatuses.includes(status)) return null;
  return {
    id,
    requestId: id,
    supplierId: cleanText(value.supplierId ?? value.supplier_id),
    supplierNameSnapshot: cleanText(value.supplierNameSnapshot ?? value.supplier_name_snapshot),
    materialLines: normalizeMaterialLines(value.materialLines ?? value.material_lines_json),
    requiredAt: cleanText(value.requiredAt ?? value.required_at),
    status,
    businessDecisionId: cleanText(value.businessDecisionId ?? value.business_decision_id),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    revision: positiveInteger(value.revision, 1),
    expectedRevision: positiveInteger(value.expectedRevision ?? value.expected_revision, 0),
    createdAt: cleanText(value.createdAt ?? value.created_at),
    updatedAt: cleanText(value.updatedAt ?? value.updated_at),
  };
}

function normalizeMaterialLines(value) {
  if (!Array.isArray(value)) return [];
  return value.map((line, index) => ({
    lineNo: positiveInteger(line?.lineNo ?? line?.line_no, index + 1),
    materialName: cleanText(line?.materialName ?? line?.name),
    color: cleanText(line?.color),
    specification: cleanText(line?.specification ?? line?.spec),
    plannedQty: Number(line?.plannedQty ?? line?.qty ?? 0),
    unit: cleanText(line?.unit || "kg"),
    remark: cleanText(line?.remark),
  }));
}

function filterPurchaseRequests(records, filters) {
  return normalizePurchaseRequests(records)
    .filter((record) => !cleanText(filters.status) || record.status === cleanText(filters.status))
    .filter((record) => !cleanText(filters.supplierId) || record.supplierId === cleanText(filters.supplierId));
}

function findPurchaseRequest(records = [], requestId) {
  const target = cleanText(requestId);
  return normalizePurchaseRequests(records).find((record) => record.id === target) ?? null;
}

function upsertPurchaseRequest(records = [], request) {
  return [request, ...normalizePurchaseRequests(records).filter((item) => item.id !== request.id)];
}

function upsertById(records = [], record) {
  return [record, ...(Array.isArray(records) ? records : []).filter((item) => cleanText(item.id) !== cleanText(record.id))];
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function conflict(currentRevision) {
  const error = businessError(409, "BUSINESS_WRITE_CONFLICT", "该采购请求已被另一位办公室人员更新，请刷新后重新确认。");
  error.currentRevision = currentRevision;
  return error;
}

function businessError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
