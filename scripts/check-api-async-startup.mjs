import assert from "node:assert/strict";
import { createApiServer } from "../server/apiServer.mjs";
import {
  closeTestServer as close,
  getTestServerBaseUrl,
  listenTestServer as listen,
} from "./helpers/apiIntegrationTestHarness.mjs";

let releasePaymentState;
let paymentStateLoadStarted = false;
const paymentStateLoaded = new Promise((resolve) => {
  releasePaymentState = resolve;
});
const server = createApiServer({
  paymentRecordRepository: {
    kind: "async_startup_fixture",
    async loadState() {
      paymentStateLoadStarted = true;
      await paymentStateLoaded;
      return { paymentRecords: [] };
    },
  },
});

await delay(0);
assert.equal(paymentStateLoadStarted, true, "API startup should begin loading persistent state before serving requests");
assert.ok(server.ready && typeof server.ready.then === "function", "API server should expose a startup readiness promise");

try {
  await listen(server);
  const baseUrl = getTestServerBaseUrl(server);
  let healthRequestCompleted = false;
  const healthRequest = fetch(`${baseUrl}/api/health`).then(async (response) => {
    healthRequestCompleted = true;
    assert.equal(response.status, 200);
    return response.json();
  });

  await delay(20);
  assert.equal(healthRequestCompleted, false, "API requests must wait until persistent startup state is loaded");

  releasePaymentState();
  await server.ready;
  const health = await healthRequest;
  assert.equal(health.status, "ok");
  assert.equal(health.seed.paymentRecordRepository, "async_startup_fixture");
} finally {
  await close(server);
}

const authoritativeEmptyDraftServer = createApiServer({
  runtimeMode: "test",
  orderDraftRepository: {
    kind: "postgres",
    async loadState() {
      return { orderDrafts: [] };
    },
  },
});

try {
  await listen(authoritativeEmptyDraftServer);
  await authoritativeEmptyDraftServer.ready;
  const baseUrl = getTestServerBaseUrl(authoritativeEmptyDraftServer);
  const response = await fetch(`${baseUrl}/api/order-drafts?pageSize=20`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.total, 0, "authoritative persistent empty state must not receive synthetic demo drafts");
  assert.deepEqual(payload.items, []);
} finally {
  await close(authoritativeEmptyDraftServer);
}

console.log("API async startup check passed: requests wait for persistence and authoritative empty drafts stay empty.");

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
