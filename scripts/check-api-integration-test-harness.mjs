import assert from "node:assert/strict";
import http from "node:http";
import {
  closeTestServer,
  getBinary,
  getJson,
  getTestServerBaseUrl,
  getText,
  listenTestServer,
  patchJson,
  postJson,
  requestJson,
} from "./helpers/apiIntegrationTestHarness.mjs";

const server = http.createServer(async (request, response) => {
  const body = await readRequestBody(request);

  if (request.url === "/json") {
    return sendJson(response, 200, { ok: true });
  }
  if (request.url === "/echo") {
    return sendJson(response, 201, {
      method: request.method,
      body: body ? JSON.parse(body) : {},
      traceId: request.headers["x-trace-id"] ?? null,
    });
  }
  if (request.url === "/text") {
    response.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": 'attachment; filename="check.txt"',
    });
    return response.end("plain response");
  }
  if (request.url === "/binary") {
    response.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-disposition": 'attachment; filename="check.bin"',
    });
    return response.end(Buffer.from([0, 1, 2, 255]));
  }
  if (request.url === "/empty") {
    response.writeHead(204);
    return response.end();
  }
  if (request.url === "/invalid-json") {
    response.writeHead(200, { "content-type": "application/json" });
    return response.end("{invalid");
  }
  if (request.url === "/slow") {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return sendJson(response, 200, { ok: true });
  }

  return sendJson(response, 418, { code: "TEAPOT", method: request.method });
});

try {
  await listenTestServer(server);
  const baseUrl = getTestServerBaseUrl(server);

  assert.deepEqual(await getJson(baseUrl, "/json"), { ok: true });
  const emptyResult = await requestJson(baseUrl, "/empty");
  assert.equal(emptyResult.status, 204);
  assert(emptyResult.headers instanceof Headers);
  assert.deepEqual(emptyResult.body, {});

  const posted = await postJson(
    baseUrl,
    "/echo",
    { quantity: 12 },
    { expectedStatus: 201, headers: { "x-trace-id": "POST-1" } },
  );
  assert.deepEqual(posted, { method: "POST", body: { quantity: 12 }, traceId: "POST-1" });
  const successfulRange = await requestJson(baseUrl, "/echo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quantity: 13 }),
    closeConnection: true,
    expectedStatus: "ok",
    timeoutMs: 1_000,
  });
  assert.equal(successfulRange.status, 201);
  assert.deepEqual(successfulRange.body.body, { quantity: 13 });

  const patched = await patchJson(
    baseUrl,
    "/echo",
    { status: "ready" },
    { expectedStatus: 201, headers: { "x-trace-id": "PATCH-1" } },
  );
  assert.deepEqual(patched, { method: "PATCH", body: { status: "ready" }, traceId: "PATCH-1" });

  const textResult = await getText(baseUrl, "/text");
  assert.equal(textResult.text, "plain response");
  assert.match(textResult.contentType, /^text\/plain/);
  assert.match(textResult.contentDisposition, /check\.txt/);

  const binaryResult = await getBinary(baseUrl, "/binary");
  assert.deepEqual([...binaryResult.bytes], [0, 1, 2, 255]);
  assert.equal(binaryResult.contentType, "application/octet-stream");

  const expectedError = await requestJson(baseUrl, "/problem", { expectedStatus: 418 });
  assert.equal(expectedError.body.code, "TEAPOT");
  await assert.rejects(
    getJson(baseUrl, "/problem"),
    /GET \/problem expected HTTP 200 but returned HTTP 418.*TEAPOT/,
  );
  await assert.rejects(
    getJson(baseUrl, "/invalid-json"),
    /GET \/invalid-json returned invalid JSON \(HTTP 200\)/,
  );
  await assert.rejects(
    getJson(baseUrl, "/slow", { timeoutMs: 5 }),
    /GET \/slow timed out after 5ms/,
  );
} finally {
  await closeTestServer(server, { forceAfterMs: 1_000 });
  await closeTestServer(server);
}

assert.equal(server.listening, false);
console.log("API integration test harness check passed.");

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
