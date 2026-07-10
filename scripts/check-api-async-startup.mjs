import assert from "node:assert/strict";
import { createApiServer } from "../server/apiServer.mjs";

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
  const { port } = server.address();
  let healthRequestCompleted = false;
  const healthRequest = fetch(`http://127.0.0.1:${port}/api/health`).then(async (response) => {
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

console.log("API async startup check passed: persistent state loads before requests are served.");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
