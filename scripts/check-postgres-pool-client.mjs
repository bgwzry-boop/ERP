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
  "PostgreSQL pool client check passed: pooled query, transaction wrapping, rollback, JSON decoding, and no synchronous repository psql helpers are covered.",
);
