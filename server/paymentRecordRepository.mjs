import { resolveStoreMode } from "./storeMode.mjs";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";

export function createPaymentRecordRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_PAYMENT_RECORD_STORE", "ERP_STATEMENT_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
  if (mode === "postgres") {
    return createPostgresPaymentRecordRepository({
      databaseUrl: options.databaseUrl ?? process.env.ERP_PAYMENT_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") {
    return createLocalPaymentRecordRepository();
  }
  throw new Error(`Unsupported payment record repository mode: ${mode}`);
}

export function createLocalPaymentRecordRepository() {
  return {
    kind: "local_memory",

    loadState() {
      return { paymentRecords: [] };
    },

    createPaymentRecord({ workspace, paymentRecord }) {
      const normalized = normalizePaymentRecord(paymentRecord);
      if (!normalized) throw new Error("Invalid payment record");
      workspace.paymentRecords.unshift(normalized);
      return normalized;
    },

    listPaymentRecords({ workspace, filters = {} }) {
      return filterPaymentRecords(workspace.paymentRecords, filters);
    },
  };
}

export function createPostgresPaymentRecordRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson =
    options.queryJson ??
    ((sql, values = []) => postgresClient.queryJson(sql, values));

  return {
    kind: "postgres",

    async loadState() {
      return { paymentRecords: normalizePaymentRecords(await executeQueryJson(queryJson, buildListPaymentRecordsQuery({}))) };
    },

    async createPaymentRecord({ workspace, paymentRecord }) {
      const saved = normalizePaymentRecord(await executeQueryJson(queryJson, buildInsertPaymentRecordQuery(paymentRecord)));
      if (!saved) throw new Error("PostgreSQL payment record insert returned an invalid record");
      workspace.paymentRecords.unshift(saved);
      return saved;
    },

    async listPaymentRecords({ filters = {} }) {
      return normalizePaymentRecords(await executeQueryJson(queryJson, buildListPaymentRecordsQuery(filters)));
    },
  };
}

export function buildInsertPaymentRecordQuery(paymentRecord) {
  const attachmentIds = Array.isArray(paymentRecord.attachmentIds) ? paymentRecord.attachmentIds : [];
  return {
    text: `
INSERT INTO payment_records (
  id,
  biz_no,
  statement_id,
  customer_id,
  amount,
  payment_method,
  payment_at,
  status,
  registered_by,
  evidence_attachment_id,
  remark,
  created_at,
  updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11, now(), now()
)
ON CONFLICT (id) DO UPDATE SET
  biz_no = EXCLUDED.biz_no,
  statement_id = EXCLUDED.statement_id,
  customer_id = EXCLUDED.customer_id,
  amount = EXCLUDED.amount,
  payment_method = EXCLUDED.payment_method,
  payment_at = EXCLUDED.payment_at,
  status = EXCLUDED.status,
  registered_by = EXCLUDED.registered_by,
  evidence_attachment_id = EXCLUDED.evidence_attachment_id,
  remark = EXCLUDED.remark,
  updated_at = now()
RETURNING ${paymentRecordJsonExpression("payment_records")} AS result;
`.trim(),
    values: [
      String(paymentRecord.paymentRecordId ?? "").trim(),
      String(paymentRecord.bizNo ?? paymentRecord.paymentRecordId ?? "").trim(),
      String(paymentRecord.statementId ?? "").trim(),
      String(paymentRecord.customerId ?? "").trim(),
      sqlNumberValue(paymentRecord.amount),
      String(paymentRecord.method ?? "other").trim() || "other",
      normalizeTimestampValue(paymentRecord.paidAt),
      String(paymentRecord.status ?? "recorded").trim() || "recorded",
      String(paymentRecord.operatorId ?? "").trim(),
      normalizeNullableValue(attachmentIds[0]),
      String(paymentRecord.remark ?? ""),
    ],
  };
}

export function buildListPaymentRecordsQuery(filters = {}) {
  const values = [];
  const clauses = [];
  if (filters.statementId) {
    values.push(String(filters.statementId));
    clauses.push(`statement_id = $${values.length}`);
  }
  if (filters.customerId) {
    values.push(String(filters.customerId));
    clauses.push(`customer_id = $${values.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join("\n  AND ")}` : "";
  return {
    text: `
SELECT COALESCE(json_agg(${paymentRecordJsonExpression("payment_records")} ORDER BY payment_at DESC NULLS LAST, id DESC), '[]'::json) AS result
FROM payment_records
${where};
`.trim(),
    values,
  };
}

export function buildInsertPaymentRecordSql(paymentRecord) {
  return buildInsertPaymentRecordQuery(paymentRecord).text;
}

export function buildListPaymentRecordsSql(filters = {}) {
  return buildListPaymentRecordsQuery(filters).text;
}

export function normalizePaymentRecords(value) {
  if (!Array.isArray(value)) return [];
  return value.map((record) => normalizePaymentRecord(record)).filter(Boolean);
}

export function normalizePaymentRecord(record) {
  if (!record || typeof record !== "object") return null;
  const paymentRecordId = String(record.paymentRecordId ?? record.id ?? "").trim();
  const statementId = String(record.statementId ?? record.statement_id ?? "").trim();
  const amount = Number(record.amount);
  const paidAt = String(record.paidAt ?? record.paymentAt ?? record.payment_at ?? "").trim();
  const method = String(record.method ?? record.paymentMethod ?? record.payment_method ?? "other").trim() || "other";
  const status = String(record.status ?? "recorded").trim() || "recorded";
  if (!paymentRecordId || !statementId || !Number.isFinite(amount)) return null;
  const evidenceAttachmentId = String(record.evidenceAttachmentId ?? record.evidence_attachment_id ?? "").trim();
  const attachmentIds = Array.isArray(record.attachmentIds)
    ? record.attachmentIds.map((item) => String(item ?? "").trim()).filter(Boolean)
    : evidenceAttachmentId
      ? [evidenceAttachmentId]
      : [];
  return {
    paymentRecordId,
    bizNo: String(record.bizNo ?? record.biz_no ?? paymentRecordId).trim(),
    statementId,
    customerId: String(record.customerId ?? record.customer_id ?? "").trim(),
    amount,
    paidAt,
    method,
    status,
    attachmentIds,
    operatorId: String(record.operatorId ?? record.registeredBy ?? record.registered_by ?? "").trim(),
    remark: String(record.remark ?? "").trim(),
  };
}

function filterPaymentRecords(paymentRecords, filters = {}) {
  let items = Array.isArray(paymentRecords) ? paymentRecords : [];
  if (filters.statementId) items = items.filter((item) => item.statementId === filters.statementId);
  if (filters.customerId) items = items.filter((item) => item.customerId === filters.customerId);
  return items;
}

async function executeQueryJson(queryJson, query) {
  return queryJson(query.text, query.values);
}

function normalizeNullableValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeTimestampValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || new Date().toISOString();
}

function sqlNumberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function paymentRecordJsonExpression(alias) {
  return `json_build_object(
    'paymentRecordId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'statementId', ${alias}.statement_id,
    'customerId', ${alias}.customer_id,
    'amount', ${alias}.amount,
    'paidAt', ${alias}.payment_at,
    'method', ${alias}.payment_method,
    'status', ${alias}.status,
    'attachmentIds', CASE
      WHEN ${alias}.evidence_attachment_id IS NULL OR ${alias}.evidence_attachment_id = '' THEN '[]'::json
      ELSE json_build_array(${alias}.evidence_attachment_id)
    END,
    'operatorId', ${alias}.registered_by,
    'remark', ${alias}.remark
  )`;
}
