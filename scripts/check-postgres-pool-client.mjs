import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";

const calls = [];
const fakeClient = {
  async query(input) {
    calls.push(input);
    if (input === "BEGIN" || input === "COMMIT" || input === "ROLLBACK") return { rows: [] };
    return { rows: [{ result: { orderId: "ORD-POOL-001", accepted: true } }] };
  },
  release() {
    calls.push("RELEASE");
  },
};
const fakePool = {
  async connect() {
    return fakeClient;
  },
  async query(input) {
    calls.push(input);
    return { rows: [{ result: { total: 1 } }] };
  },
};

const client = createPostgresPoolClient({ pool: fakePool });
const transactionResult = await client.transactionJson("BEGIN; SELECT json_build_object('orderId', 'ORD-POOL-001') AS result; COMMIT;");
assert.deepEqual(transactionResult, { orderId: "ORD-POOL-001", accepted: true });
assert.equal(calls[0], "BEGIN");
assert.match(calls[1].text, /^SELECT json_build_object/);
assert.doesNotMatch(calls[1].text, /\bBEGIN\b|\bCOMMIT\b/i);
assert.equal(calls[2], "COMMIT");
assert.equal(calls[3], "RELEASE");

const queryResult = await client.queryJson("SELECT json_build_object('total', 1) AS result");
assert.deepEqual(queryResult, { total: 1 });

const idempotentCalls = [];
let storedIdempotency = null;
let businessExecutionCount = 0;
const idempotentClient = {
  async query(input) {
    idempotentCalls.push(input);
    if (input === "BEGIN" || input === "COMMIT" || input === "ROLLBACK") return { rows: [] };
    if (input.text.includes("pg_advisory_xact_lock")) return { rows: [{ pg_advisory_xact_lock: null }] };
    if (input.text.includes("FROM operation_idempotency_keys")) {
      return { rows: storedIdempotency ? [storedIdempotency] : [] };
    }
    if (input.text.includes("INSERT INTO operation_idempotency_keys")) {
      storedIdempotency = {
        request_hash: input.values[2],
        response_json: JSON.parse(input.values[3]),
      };
      return { rows: [] };
    }
    businessExecutionCount += 1;
    return { rows: [{ result: { paymentId: "PAY-IDEMPOTENT-001" } }] };
  },
  release() {
    idempotentCalls.push("RELEASE");
  },
};
const idempotentPool = { async connect() { return idempotentClient; } };
const idempotentDbClient = createPostgresPoolClient({ pool: idempotentPool });
const idempotentRequest = {
  scope: "statement.payment.record",
  idempotencyKey: "idem-payment-001",
  requestHash: "a".repeat(64),
  operatorId: "U-FINANCE-A",
  targetType: "statement",
  targetId: "ST-001",
  resourceLocks: ["statement:ST-001", "statement:ST-001"],
  text: "BEGIN; SELECT json_build_object('paymentId', 'PAY-IDEMPOTENT-001') AS result; COMMIT;",
  values: [],
};
assert.deepEqual(await idempotentDbClient.idempotentTransactionJson(idempotentRequest), {
  paymentId: "PAY-IDEMPOTENT-001",
});
assert.deepEqual(await idempotentDbClient.idempotentTransactionJson(idempotentRequest), {
  paymentId: "PAY-IDEMPOTENT-001",
});
assert.equal(businessExecutionCount, 1, "a replay must return the retained response without executing business SQL twice");
assert.equal(
  idempotentCalls.filter((input) => typeof input === "object" && input.text.includes("pg_advisory_xact_lock")).length,
  2,
  "duplicate resource locks should be normalized before each transaction",
);
await assert.rejects(
  () => idempotentDbClient.idempotentTransactionJson({ ...idempotentRequest, requestHash: "b".repeat(64) }),
  (error) => error?.code === "IDEMPOTENCY_KEY_REUSED" && error?.statusCode === 409,
);

const failingCalls = [];
const failingClient = {
  async query(input) {
    failingCalls.push(input);
    if (input !== "BEGIN" && input !== "ROLLBACK") throw new Error("database write failed");
    return { rows: [] };
  },
  release() {
    failingCalls.push("RELEASE");
  },
};
const failingPool = { async connect() { return failingClient; } };
await assert.rejects(
  () => createPostgresPoolClient({ pool: failingPool }).transactionJson("BEGIN; SELECT 1; COMMIT;"),
  /database write failed/,
);
assert.deepEqual(failingCalls, ["BEGIN", { text: "SELECT 1;", values: [] }, "ROLLBACK", "RELEASE"]);

const serverDirectory = fileURLToPath(new URL("../server/", import.meta.url));
const synchronousRepositoryFiles = readdirSync(serverDirectory)
  .filter((fileName) => fileName.endsWith("Repository.mjs"))
  .filter((fileName) => /\bspawnSync\b|\brunPsqlJson\b/.test(readFileSync(`${serverDirectory}/${fileName}`, "utf8")));
assert.deepEqual(
  synchronousRepositoryFiles,
  [],
  `PostgreSQL repositories must use the shared async pool: ${synchronousRepositoryFiles.join(", ")}`,
);

console.log(
  "PostgreSQL pool client check passed: pooled queries, rollback, idempotent replay/conflict handling, resource locks, and async repository boundaries are covered.",
);
