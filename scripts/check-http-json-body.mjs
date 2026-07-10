import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { readJsonRequestBody } from "../server/httpJsonBody.mjs";

assert.deepEqual(await readJsonRequestBody(createRequest([" {\"orderNo\":\"ORD-1\"} "], {}), 128), {
  orderNo: "ORD-1",
});

await assert.rejects(
  () => readJsonRequestBody(createRequest(["{}"], { "content-length": "129" }), 128),
  (error) => error?.statusCode === 413 && error?.code === "REQUEST_BODY_TOO_LARGE",
);

await assert.rejects(
  () => readJsonRequestBody(createRequest(["{\"note\":\"", "x".repeat(128), "\"}"], {}), 128),
  (error) => error?.statusCode === 413 && error?.code === "REQUEST_BODY_TOO_LARGE",
);

await assert.rejects(
  () => readJsonRequestBody(createRequest(["{invalid"], {}), 128),
  (error) => error?.statusCode === 400,
);

for (const primitiveBody of ["null", "[]", '"text"', "42"]) {
  await assert.rejects(
    () => readJsonRequestBody(createRequest([primitiveBody], {}), 128),
    (error) => error?.statusCode === 400 && error?.code === "JSON_OBJECT_REQUIRED",
  );
}

console.log("HTTP JSON body checks passed");

function createRequest(chunks, headers) {
  const request = Readable.from(chunks.map((chunk) => Buffer.from(chunk)));
  request.headers = headers;
  return request;
}
