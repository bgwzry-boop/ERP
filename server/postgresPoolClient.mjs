import pg from "pg";
import { buildIdempotencyConflictError } from "./idempotency.mjs";

const { Pool } = pg;
const sharedPools = new Map();

export async function closeSharedPostgresPools() {
  const pools = [...sharedPools.values()];
  sharedPools.clear();
  await Promise.all(pools.map((pool) => pool.end()));
}

export function createPostgresPoolClient(options = {}) {
  const pool = options.pool ?? getSharedPostgresPool(options);
  return {
    kind: "pg_pool",

    async query(text, values = []) {
      return pool.query({ text, values });
    },

    async queryJson(text, values = []) {
      return readJsonQueryResult(await pool.query({ text, values }));
    },

    async transactionJson(text, values = []) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query({ text: removeOuterTransactionStatements(text), values });
        await client.query("COMMIT");
        return readJsonQueryResult(result);
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original database failure when rollback cannot run.
        }
        throw normalizePostgresWriteError(error);
      } finally {
        client.release();
      }
    },

    async idempotentTransactionJson(request = {}) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const resourceLock of normalizeResourceLocks(request)) {
          await client.query({
            text: "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0));",
            values: [resourceLock],
          });
        }

        const existing = await client.query({
          text: `SELECT request_hash, response_json
FROM operation_idempotency_keys
WHERE scope = $1 AND idempotency_key = $2
FOR UPDATE;`,
          values: [request.scope, request.idempotencyKey],
        });
        const existingRow = existing.rows?.[0];
        if (existingRow) {
          if (existingRow.request_hash !== request.requestHash) throw buildIdempotencyConflictError();
          await client.query("COMMIT");
          return normalizeStoredJson(existingRow.response_json);
        }

        const result = await client.query({
          text: removeOuterTransactionStatements(request.text),
          values: Array.isArray(request.values) ? request.values : [],
        });
        const responseValue = readJsonQueryResult(result);
        await client.query({
          text: `INSERT INTO operation_idempotency_keys (
  scope,
  idempotency_key,
  request_hash,
  response_json,
  operator_id,
  target_type,
  target_id,
  created_at,
  completed_at
) VALUES ($1, $2, $3, $4::jsonb, NULLIF($5, ''), $6, $7, now(), now());`,
          values: [
            request.scope,
            request.idempotencyKey,
            request.requestHash,
            JSON.stringify(responseValue ?? null),
            String(request.operatorId ?? ""),
            String(request.targetType ?? ""),
            String(request.targetId ?? ""),
          ],
        });
        await client.query("COMMIT");
        return responseValue;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original database failure when rollback cannot run.
        }
        throw normalizePostgresWriteError(error);
      } finally {
        client.release();
      }
    },
  };
}

function getSharedPostgresPool(options = {}) {
  const connectionString = String(options.connectionString ?? options.databaseUrl ?? "").trim();
  if (!connectionString) {
    throw new Error("A PostgreSQL connection string is required for the pooled database client.");
  }
  const key = `${connectionString}:${Number(options.max ?? 10)}:${Number(options.idleTimeoutMillis ?? 30_000)}`;
  if (!sharedPools.has(key)) {
    sharedPools.set(
      key,
      new Pool({
        connectionString,
        max: Number(options.max ?? 10),
        idleTimeoutMillis: Number(options.idleTimeoutMillis ?? 30_000),
        connectionTimeoutMillis: Number(options.connectionTimeoutMillis ?? 5_000),
      }),
    );
  }
  return sharedPools.get(key);
}

function removeOuterTransactionStatements(text) {
  return String(text ?? "")
    .replace(/^\s*BEGIN\s*;\s*/i, "")
    .replace(/\s*COMMIT\s*;\s*$/i, "");
}

function readJsonQueryResult(result) {
  const queryResult = Array.isArray(result) ? result.at(-1) : result;
  const row = queryResult?.rows?.[0];
  if (!row) return null;
  const value = Object.hasOwn(row, "result") ? row.result : Object.values(row)[0];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function normalizeResourceLocks(request) {
  const locks = Array.isArray(request.resourceLocks) ? request.resourceLocks : [];
  return [...new Set(locks.map((value) => String(value ?? "").trim()).filter(Boolean))].sort();
}

function normalizeStoredJson(value) {
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function normalizePostgresWriteError(error) {
  if (error?.statusCode || error?.code === "IDEMPOTENCY_KEY_REUSED") return error;
  if (/ERP_[A-Z_]+_CONCURRENCY_CONFLICT/.test(String(error?.message ?? ""))) {
    const conflict = new Error("The business record changed before this transaction could be committed.");
    conflict.statusCode = 409;
    conflict.code = "BUSINESS_WRITE_CONFLICT";
    return conflict;
  }
  return error;
}
