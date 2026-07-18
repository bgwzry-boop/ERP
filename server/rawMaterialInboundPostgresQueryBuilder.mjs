import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { buildRawMaterialInboundOcrInsertTransactionQuery } from "./rawMaterialInboundOcrSupport.mjs";
import { normalizeOperationLog, normalizeRawMaterialInbound } from "./rawMaterialInboundRecordService.mjs";
import { normalizeRawMaterialInboundListQuery } from "./services/rawMaterialInboundReadProjectionService.mjs";

export function buildListRawMaterialInboundPayloadsSql({ query } = {}) {
  return buildListRawMaterialInboundPayloadsQuery({ query }).text;
}

export function buildListRawMaterialInboundPayloadsQuery({ query } = {}) {
  const filters = normalizeRawMaterialInboundListQuery(query);
  const parameters = createPostgresParameterBinder();
  const where = [];
  if (filters.status && filters.status !== "全部") {
    where.push(`status = ${parameters.text(filters.status)}`);
  }
  if (filters.keyword) {
    where.push(`payload_json::text ILIKE ${parameters.text(`%${filters.keyword}%`)}`);
  }
  return {
    text: `
SELECT COALESCE(
  json_agg(payload_json || jsonb_build_object('revision', revision) ORDER BY updated_at DESC, id DESC),
  '[]'::json
) AS result
FROM raw_material_inbounds
${where.length ? `WHERE ${where.join(" AND ")}` : ""};
`.trim(),
    values: parameters.values,
  };
}

export function buildFindRawMaterialInboundPayloadSql(inboundId) {
  return buildFindRawMaterialInboundPayloadQuery(inboundId).text;
}

export function buildFindRawMaterialInboundPayloadQuery(inboundId) {
  const safeInboundId = cleanText(inboundId);
  if (!safeInboundId) throw new Error("raw material inbound id is required");
  const parameters = createPostgresParameterBinder();
  return {
    text: `
SELECT payload_json || jsonb_build_object('revision', revision) AS result
FROM raw_material_inbounds
WHERE id = ${parameters.text(safeInboundId)}
LIMIT 1;
`.trim(),
    values: parameters.values,
  };
}

export function buildUpsertRawMaterialInboundPayloadTransactionSql(inbound, operationLog = null) {
  return buildUpsertRawMaterialInboundPayloadTransactionQuery(inbound, operationLog).text;
}

export function buildInsertRawMaterialInboundDraftTransactionSql(inbound, operationLog = null) {
  return buildInsertRawMaterialInboundDraftTransactionQuery(inbound, operationLog).text;
}

export function buildInsertRawMaterialInboundDraftTransactionQuery(inbound, operationLog = null) {
  const safeInbound = normalizeRawMaterialInbound(inbound);
  if (!safeInbound?.id) throw new Error("raw material inbound id is required");
  return buildRawMaterialInboundOcrInsertTransactionQuery(safeInbound, normalizeOperationLog(operationLog));
}

export function buildUpsertRawMaterialInboundPayloadTransactionQuery(inbound, operationLog = null) {
  const safeInbound = normalizeRawMaterialInbound(inbound);
  if (!safeInbound?.id) throw new Error("raw material inbound id is required");
  const safeOperationLog = normalizeOperationLog(operationLog);
  const expectedRevision = Math.max(1, Number(safeInbound.revision) || 1);
  const nextInbound = { ...safeInbound, revision: expectedRevision + 1 };
  const parameters = createPostgresParameterBinder();
  const operationLogSql = safeOperationLog ? buildInsertOperationLogSql(safeOperationLog, parameters) : "";
  return {
    text: `
BEGIN;
WITH locked_inbound AS MATERIALIZED (
  SELECT id, revision
  FROM raw_material_inbounds
  WHERE id = ${parameters.text(safeInbound.id)}
  FOR UPDATE
),
updated_inbound AS (
  UPDATE raw_material_inbounds
  SET
    delivery_note_no = ${parameters.text(safeInbound.deliveryNoteNo)},
    supplier_name = ${parameters.text(safeInbound.supplierName)},
    status = ${parameters.text(safeInbound.status)},
    payload_json = ${parameters.json(nextInbound)},
    revision = raw_material_inbounds.revision + 1,
    updated_at = now()
  FROM locked_inbound AS locked
  WHERE raw_material_inbounds.id = locked.id
    AND locked.revision = ${parameters.integer(expectedRevision)}
  RETURNING payload_json || jsonb_build_object('revision', revision) AS result
),
inbound_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM updated_inbound) = 1,
    'ERP_RAW_MATERIAL_INBOUND_CONCURRENCY_CONFLICT'
  ) AS ok
)
${safeOperationLog ? `, inserted_operation_log AS (${operationLogSql})` : ""}
SELECT json_build_object(
  'inbound', (SELECT result FROM updated_inbound),
  'operationLogId', ${safeOperationLog ? "(SELECT id FROM inserted_operation_log)" : "NULL"},
  'writeGuard', (SELECT ok FROM inbound_write_guard)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
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
ON CONFLICT (id) DO NOTHING
RETURNING id`;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
