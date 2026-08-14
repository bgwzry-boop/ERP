import { createPostgresPoolClient } from "./postgresPoolClient.mjs";

export function createPostgresDeliAttendanceGatewayRepository(options = {}) {
  const databaseUrl = cleanText(
    options.databaseUrl
      ?? process.env.DELI_ATTENDANCE_GATEWAY_DATABASE_URL
      ?? process.env.ERP_V1_DATABASE_URL,
  );
  const postgresClient = options.postgresClient ?? (
    options.queryJson || options.transactionJson ? null : createPostgresPoolClient({ databaseUrl })
  );
  const queryJson = options.queryJson ?? postgresClient.queryJson.bind(postgresClient);
  const transactionJson = options.transactionJson ?? postgresClient.transactionJson.bind(postgresClient);
  const providerKey = normalizeProviderKey(options.providerKey ?? "deli");

  return Object.freeze({
    kind: "postgres",
    providerKey,
    async readCursor() {
      const result = await queryJson(buildReadCursorSql(), [providerKey]);
      return normalizeCursor(result?.nextId ?? 0);
    },
    async saveBatch({ expectedNextId, nextId, records = [] } = {}) {
      const expected = normalizeCursor(expectedNextId);
      const next = normalizeCursor(nextId);
      if (next < expected) throw repositoryError("DELI_ATTENDANCE_CURSOR_REGRESSION", "得力考勤游标不能倒退。", 409);
      const normalizedRecords = records.map(normalizeRecord);
      const result = await transactionJson(buildSaveBatchSql(), [
        providerKey,
        String(expected),
        String(next),
        JSON.stringify(normalizedRecords),
      ]);
      if (!result) {
        throw repositoryError("DELI_ATTENDANCE_CURSOR_CONFLICT", "得力考勤游标已被其他同步更新，请重试。", 409);
      }
      return {
        nextId: normalizeCursor(result.nextId),
        acceptedRecordCount: nonNegativeInteger(result.acceptedRecordCount),
        insertedRecordCount: nonNegativeInteger(result.insertedRecordCount),
      };
    },
    async queryPunches({ rangeStart, rangeEnd } = {}) {
      const range = normalizeRange(rangeStart, rangeEnd);
      const result = await queryJson(buildQueryPunchesSql(), [providerKey, range.start, range.end]);
      return Array.isArray(result) ? result.map(normalizeRecord) : [];
    },
  });
}

export function buildReadCursorSql() {
  return `SELECT json_build_object(
  'nextId', COALESCE((
    SELECT next_id::text
    FROM deli_attendance_gateway_cursors
    WHERE provider = $1
  ), '0')
) AS result;`;
}

export function buildSaveBatchSql() {
  return `WITH updated_cursor AS (
  INSERT INTO deli_attendance_gateway_cursors (provider, next_id, created_at, updated_at)
  SELECT $1, $3::bigint, now(), now()
  WHERE $2::bigint = 0
     OR EXISTS (
       SELECT 1
       FROM deli_attendance_gateway_cursors
       WHERE provider = $1 AND next_id = $2::bigint
     )
  ON CONFLICT (provider) DO UPDATE
  SET next_id = EXCLUDED.next_id, updated_at = now()
  WHERE deli_attendance_gateway_cursors.next_id = $2::bigint
  RETURNING next_id
), source_records AS (
  SELECT *
  FROM jsonb_to_recordset($4::jsonb) AS source(
    "externalPunchId" text,
    "externalEmployeeId" text,
    "punchedAt" timestamptz,
    "localWorkDate" date,
    "eventType" text,
    raw jsonb
  )
), inserted_records AS (
  INSERT INTO deli_attendance_gateway_punches (
    provider,
    external_punch_id,
    external_employee_id,
    punched_at,
    local_work_date,
    event_type,
    raw_payload,
    received_at
  )
  SELECT
    $1,
    source."externalPunchId",
    source."externalEmployeeId",
    source."punchedAt",
    source."localWorkDate",
    source."eventType",
    source.raw,
    now()
  FROM source_records AS source
  CROSS JOIN updated_cursor
  ON CONFLICT (provider, external_punch_id) DO NOTHING
  RETURNING external_punch_id
)
SELECT json_build_object(
  'nextId', updated_cursor.next_id::text,
  'acceptedRecordCount', jsonb_array_length($4::jsonb),
  'insertedRecordCount', (SELECT count(*) FROM inserted_records)
) AS result
FROM updated_cursor;`;
}

export function buildQueryPunchesSql() {
  return `SELECT COALESCE(json_agg(json_build_object(
  'externalPunchId', external_punch_id,
  'externalEmployeeId', external_employee_id,
  'punchedAt', to_char(punched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'localWorkDate', to_char(local_work_date, 'YYYY-MM-DD'),
  'eventType', event_type,
  'raw', raw_payload
) ORDER BY punched_at, external_punch_id), '[]'::json) AS result
FROM deli_attendance_gateway_punches
WHERE provider = $1
  AND punched_at >= $2::timestamptz
  AND punched_at < $3::timestamptz;`;
}

function normalizeRecord(value = {}) {
  const externalPunchId = cleanText(value.externalPunchId);
  const externalEmployeeId = cleanText(value.externalEmployeeId);
  const punchedAt = normalizeTimestamp(value.punchedAt);
  const localWorkDate = cleanText(value.localWorkDate);
  if (!externalPunchId || !externalEmployeeId || !/^\d{4}-\d{2}-\d{2}$/.test(localWorkDate)) {
    throw repositoryError("DELI_ATTENDANCE_RECORD_INVALID", "得力考勤缓存记录字段无效。", 502);
  }
  const sourceRaw = value.raw && typeof value.raw === "object" && !Array.isArray(value.raw) ? value.raw : {};
  return {
    externalPunchId,
    externalEmployeeId,
    punchedAt,
    localWorkDate,
    eventType: cleanText(value.eventType) || "punch",
    raw: {
      id: cleanText(sourceRaw.id) || externalPunchId,
      ext_id: cleanText(sourceRaw.ext_id) || externalEmployeeId,
      check_type: cleanText(sourceRaw.check_type) || cleanText(value.eventType),
      check_time: normalizeCheckTime(sourceRaw.check_time, punchedAt),
    },
  };
}

function normalizeRange(rangeStart, rangeEnd) {
  const start = normalizeTimestamp(rangeStart);
  const end = normalizeTimestamp(rangeEnd);
  if (Date.parse(end) <= Date.parse(start)) {
    throw repositoryError("DELI_ATTENDANCE_RANGE_INVALID", "考勤查询结束时间必须晚于开始时间。", 400);
  }
  return { start, end };
}

function normalizeTimestamp(value) {
  const timestamp = Date.parse(cleanText(value));
  if (!Number.isFinite(timestamp)) {
    throw repositoryError("DELI_ATTENDANCE_TIMESTAMP_INVALID", "得力考勤时间无效。", 502);
  }
  return new Date(timestamp).toISOString();
}

function normalizeCursor(value) {
  const cursor = Number(value);
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    throw repositoryError("DELI_ATTENDANCE_CURSOR_INVALID", "得力考勤游标无效。", 502);
  }
  return cursor;
}

function normalizeCheckTime(value, punchedAt) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : Math.floor(Date.parse(punchedAt) / 1000);
}

function normalizeProviderKey(value) {
  const providerKey = cleanText(value).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(providerKey)) {
    throw new Error("Deli attendance gateway provider key is invalid.");
  }
  return providerKey;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function repositoryError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
