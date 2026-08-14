import assert from "node:assert/strict";
import { createConfiguredAttendanceProvider } from "../server/attendanceProvider.mjs";

assert.equal(createConfiguredAttendanceProvider({ env: {} }), null);
assert.throws(
  () => createConfiguredAttendanceProvider({
    mode: "http_json",
    endpoint: "http://attendance.example.com/punches",
    token: "secret",
  }),
  /HTTPS/,
);
assert.throws(
  () => createConfiguredAttendanceProvider({
    mode: "http_json",
    key: "不稳定来源键",
    endpoint: "https://attendance.example.com/punches",
    token: "secret",
  }),
  /stable lowercase identifier/,
);
assert.throws(
  () => createConfiguredAttendanceProvider({
    mode: "http_json",
    endpoint: "https://user:password@attendance.example.com/punches",
    token: "secret",
  }),
  /must not contain URL credentials/,
);

let capturedRequest = null;
const provider = createConfiguredAttendanceProvider({
  mode: "http_json",
  key: "deli_gateway",
  endpoint: "http://127.0.0.1:9999/punches",
  token: "secret-token",
  allowInsecureLoopback: true,
  fetchImpl: async (url, request) => {
    capturedRequest = { url, request };
    return new Response(JSON.stringify({
      records: [{
        id: "P-001",
        employeeId: "A-001",
        time: "2026-08-11T08:01:00+08:00",
        localWorkDate: "2026-08-11",
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  },
});

const punches = await provider.fetchPunches({
  rangeStart: "2026-08-11T00:00:00+08:00",
  rangeEnd: "2026-08-12T00:00:00+08:00",
});
assert.equal(provider.key, "deli_gateway");
assert.equal(capturedRequest.request.method, "POST");
assert.equal(capturedRequest.request.headers.authorization, "Bearer secret-token");
assert.deepEqual(punches[0], {
  externalPunchId: "P-001",
  externalEmployeeId: "A-001",
  punchedAt: "2026-08-11T08:01:00+08:00",
  localWorkDate: "2026-08-11",
  eventType: "punch",
  raw: {
    id: "P-001",
    employeeId: "A-001",
    time: "2026-08-11T08:01:00+08:00",
    localWorkDate: "2026-08-11",
  },
});

await assert.rejects(
  createConfiguredAttendanceProvider({
    mode: "http_json",
    endpoint: "https://attendance.example.com/punches",
    token: "secret",
    fetchImpl: async () => new Response("{}", { status: 200 }),
  }).fetchPunches({}),
  (error) => error.code === "ATTENDANCE_PROVIDER_RESPONSE_INVALID" && error.statusCode === 502,
);

await assert.rejects(
  createConfiguredAttendanceProvider({
    mode: "http_json",
    endpoint: "https://attendance.example.com/punches",
    token: "secret",
    fetchImpl: async () => new Response("not-json", { status: 401 }),
  }).fetchPunches({}),
  (error) => error.code === "ATTENDANCE_PROVIDER_REQUEST_FAILED" && error.statusCode === 401,
);

await assert.rejects(
  createConfiguredAttendanceProvider({
    mode: "http_json",
    endpoint: "https://attendance.example.com/punches",
    token: "secret",
    fetchImpl: async () => { throw new Error("connect ECONNREFUSED private-host"); },
  }).fetchPunches({}),
  (error) =>
    error.code === "ATTENDANCE_PROVIDER_UNAVAILABLE" &&
    error.statusCode === 502 &&
    !error.message.includes("private-host"),
);

await assert.rejects(
  createConfiguredAttendanceProvider({
    mode: "http_json",
    endpoint: "https://attendance.example.com/punches",
    token: "secret",
    timeoutMs: 1,
    fetchImpl: async (_url, request) => new Promise((resolve, reject) => {
      request.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  }).fetchPunches({}),
  (error) => error.code === "ATTENDANCE_PROVIDER_TIMEOUT" && error.statusCode === 504,
);

console.log("attendance provider check passed");
