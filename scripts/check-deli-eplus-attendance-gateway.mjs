import assert from "node:assert/strict";
import {
  buildDeliEplusSignature,
  createDeliEplusAttendanceClient,
} from "../server/deliEplusAttendanceClient.mjs";
import { createDeliAttendanceGatewayService } from "../server/deliAttendanceGatewayService.mjs";
import { createDeliAttendanceGatewayServer } from "../server/deliAttendanceGatewayServer.mjs";
import {
  buildQueryPunchesSql,
  buildReadCursorSql,
  buildSaveBatchSql,
  createPostgresDeliAttendanceGatewayRepository,
} from "../server/deliAttendanceGatewayRepository.mjs";

const fixedTimestamp = 1786406400123;
const insideRangeSeconds = Date.parse("2026-08-10T08:00:00+08:00") / 1000;
const outsideRangeSeconds = Date.parse("2026-08-11T08:00:00+08:00") / 1000;
const requests = [];
const pages = [
  {
    code: 0,
    data: {
      next_id: 101,
      data: [
        { id: 100, user_id: "D-U-1", ext_id: "ERP-0001", check_type: "fa", check_time: insideRangeSeconds, check_data: "sensitive-device-data" },
        { id: 101, user_id: "D-U-2", ext_id: "ERP-0002", check_type: "fp", check_time: outsideRangeSeconds },
      ],
    },
  },
  { code: 0, data: { next_id: 101, data: [] } },
];
const client = createDeliEplusAttendanceClient({
  appKey: "test-app-key",
  appSecret: "test-app-secret",
  pageSize: 500,
  now: () => fixedTimestamp,
  fetchImpl: async (url, request) => {
    requests.push({ url: String(url), request, body: JSON.parse(request.body) });
    return new Response(JSON.stringify(pages.shift()), { status: 200, headers: { "content-type": "application/json" } });
  },
});
const records = await client.fetchPunches({
  rangeStart: "2026-08-10T00:00:00+08:00",
  rangeEnd: "2026-08-11T00:00:00+08:00",
});
assert.equal(requests.length, 2);
assert.equal(requests[0].url, "https://v2-api.delicloud.com/v2.0/cloudappapi");
assert.deepEqual(requests[0].body, { next_id: 0, page_size: 500 });
assert.deepEqual(requests[1].body, { next_id: 101, page_size: 500 });
assert.equal(requests[0].request.headers["Api-Module"], "CHECKIN");
assert.equal(requests[0].request.headers["Api-Cmd"], "checkin_query");
assert.equal(requests[0].request.headers["App-Key"], "test-app-key");
assert.equal(requests[0].request.headers["App-Timestamp"], String(fixedTimestamp));
assert.equal(
  requests[0].request.headers["App-Sig"],
  buildDeliEplusSignature({ timestamp: fixedTimestamp, appKey: "test-app-key", appSecret: "test-app-secret" }),
);
assert.equal(records.length, 1, "the official adapter must return only the requested half-open time range");
assert.equal(records[0].externalEmployeeId, "ERP-0001", "stable Deli ext_id must own employee mapping");
assert.equal(records[0].externalPunchId, "100");
assert.equal(records[0].localWorkDate, "2026-08-10");
assert.equal(JSON.stringify(records[0]).includes("sensitive-device-data"), false, "check_data must not enter ERP raw attendance evidence");

const gateway = createDeliAttendanceGatewayService({
  client: { fetchPunches: async () => records },
  bearerToken: "gateway-secret",
  allowStatelessForTests: true,
});
assert.throws(
  () => createDeliAttendanceGatewayService({ client: { fetchPunches: async () => records }, bearerToken: "unsafe" }),
  /persistent cursor storage/,
);
await assert.rejects(
  gateway.fetchPunches({ authorization: "Bearer wrong", body: {} }),
  (error) => error.code === "DELI_ATTENDANCE_GATEWAY_UNAUTHORIZED" && error.statusCode === 401,
);
const gatewayResult = await gateway.fetchPunches({
  authorization: "Bearer gateway-secret",
  body: { rangeStart: "2026-08-10T00:00:00+08:00", rangeEnd: "2026-08-11T00:00:00+08:00" },
});
assert.deepEqual(gatewayResult, { records });

let persistedCursor = 42;
const persistedPunches = [];
const requestedCursors = [];
const persistentGateway = createDeliAttendanceGatewayService({
  bearerToken: "persistent-secret",
  client: {
    async fetchIncremental({ nextId }) {
      requestedCursors.push(nextId);
      return requestedCursors.length === 1
        ? { nextId: 44, records }
        : { nextId, records: [] };
    },
  },
  repository: {
    async readCursor() {
      return persistedCursor;
    },
    async saveBatch({ expectedNextId, nextId, records: batchRecords }) {
      assert.equal(expectedNextId, persistedCursor);
      persistedPunches.push(...batchRecords);
      persistedCursor = nextId;
      return { nextId, acceptedRecordCount: batchRecords.length, insertedRecordCount: batchRecords.length };
    },
    async queryPunches() {
      return persistedPunches;
    },
  },
});
await persistentGateway.fetchPunches({
  authorization: "Bearer persistent-secret",
  body: { rangeStart: "2026-08-10T00:00:00+08:00", rangeEnd: "2026-08-11T00:00:00+08:00" },
});
await persistentGateway.fetchPunches({
  authorization: "Bearer persistent-secret",
  body: { rangeStart: "2026-08-10T00:00:00+08:00", rangeEnd: "2026-08-11T00:00:00+08:00" },
});
assert.deepEqual(requestedCursors, [42, 44], "the gateway must continue from its persisted official next_id");
assert.equal(persistedPunches.length, 1, "a second range read must not re-ingest the same official page");

const repositoryCalls = [];
const postgresRepository = createPostgresDeliAttendanceGatewayRepository({
  queryJson: async (sql, values) => {
    repositoryCalls.push({ kind: "query", sql, values });
    if (sql === buildReadCursorSql()) return { nextId: "44" };
    return records;
  },
  transactionJson: async (sql, values) => {
    repositoryCalls.push({ kind: "transaction", sql, values });
    return { nextId: "45", acceptedRecordCount: 1, insertedRecordCount: 1 };
  },
});
assert.equal(await postgresRepository.readCursor(), 44);
assert.deepEqual(
  await postgresRepository.saveBatch({
    expectedNextId: 44,
    nextId: 45,
    records: [{ ...records[0], raw: { ...records[0].raw, check_data: "sensitive-device-data" } }],
  }),
  { nextId: 45, acceptedRecordCount: 1, insertedRecordCount: 1 },
);
assert.deepEqual(await postgresRepository.queryPunches({
  rangeStart: "2026-08-10T00:00:00+08:00",
  rangeEnd: "2026-08-11T00:00:00+08:00",
}), records);
assert.equal(repositoryCalls[1].sql, buildSaveBatchSql());
assert.equal(repositoryCalls[2].sql, buildQueryPunchesSql());
assert.equal(JSON.stringify(repositoryCalls).includes("sensitive-device-data"), false);

const gatewayServer = createDeliAttendanceGatewayServer({ service: gateway });
await new Promise((resolve, reject) => {
  gatewayServer.once("error", reject);
  gatewayServer.listen(0, "127.0.0.1", resolve);
});
try {
  const address = gatewayServer.address();
  const gatewayUrl = `http://127.0.0.1:${address.port}`;
  const healthResponse = await fetch(`${gatewayUrl}/healthz`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { status: "ok", service: "deli-attendance-gateway" });

  const unauthorizedResponse = await fetch(`${gatewayUrl}/v1/punches/query`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer wrong" },
    body: JSON.stringify({ rangeStart: "2026-08-10T00:00:00+08:00", rangeEnd: "2026-08-11T00:00:00+08:00" }),
  });
  assert.equal(unauthorizedResponse.status, 401);
  assert.equal((await unauthorizedResponse.json()).code, "DELI_ATTENDANCE_GATEWAY_UNAUTHORIZED");

  const queryResponse = await fetch(`${gatewayUrl}/v1/punches/query`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer gateway-secret" },
    body: JSON.stringify({ rangeStart: "2026-08-10T00:00:00+08:00", rangeEnd: "2026-08-11T00:00:00+08:00" }),
  });
  assert.equal(queryResponse.status, 200);
  assert.deepEqual(await queryResponse.json(), { records });
} finally {
  await new Promise((resolve, reject) => gatewayServer.close((error) => error ? reject(error) : resolve()));
}

await assert.rejects(
  createDeliEplusAttendanceClient({
    appKey: "key",
    appSecret: "secret",
    fetchImpl: async () => new Response(JSON.stringify({ code: 103, msg: "request signature leaked detail" }), { status: 200 }),
  }).fetchPunches({ rangeStart: "2026-08-10T00:00:00+08:00", rangeEnd: "2026-08-11T00:00:00+08:00" }),
  (error) => error.code === "DELI_EPLUS_API_ERROR" && !error.message.includes("leaked detail"),
);

await assert.rejects(
  createDeliEplusAttendanceClient({
    appKey: "key",
    appSecret: "secret",
    maxPages: 1,
    fetchImpl: async () => new Response(JSON.stringify({
      code: 0,
      data: { next_id: 1, data: [{ id: 1, ext_id: "ERP-0001", check_type: "fa", check_time: insideRangeSeconds }] },
    }), { status: 200 }),
  }).fetchPunches({ rangeStart: "2026-08-10T00:00:00+08:00", rangeEnd: "2026-08-11T00:00:00+08:00" }),
  (error) => error.code === "DELI_EPLUS_PAGE_LIMIT_EXCEEDED",
);

console.log("Deli E+ attendance gateway checks passed: official signature, CHECKIN incremental cursor persistence, stable ext_id mapping, range queries, redaction, auth, and page-limit fail-closed are covered.");
