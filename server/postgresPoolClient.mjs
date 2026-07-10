import pg from "pg";

const { Pool } = pg;
const sharedPools = new Map();

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
        throw error;
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
