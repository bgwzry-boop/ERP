import assert from "node:assert/strict";

import {
  buildIdempotencyRequestHash,
  buildPostgresIdempotencyRequest,
  isProductionBusinessWritePath,
  normalizeIdempotencyKey,
  readHttpIdempotencyKey,
  requireHttpIdempotencyKey,
  resolveRepositoryIdempotencyKey,
} from "../server/idempotency.mjs";

assert.equal(
  buildIdempotencyRequestHash({ amount: 100, statementId: "ST-001" }),
  buildIdempotencyRequestHash({ statementId: "ST-001", amount: 100 }),
  "request hashes must not depend on object-key order",
);
assert.notEqual(
  buildIdempotencyRequestHash({ amount: 100, statementId: "ST-001" }),
  buildIdempotencyRequestHash({ amount: 101, statementId: "ST-001" }),
);
assert.equal(normalizeIdempotencyKey(" idem-payment-001 "), "idem-payment-001");
assert.throws(
  () => normalizeIdempotencyKey("short"),
  (error) => error?.code === "IDEMPOTENCY_KEY_INVALID" && error?.statusCode === 400,
);
assert.equal(resolveRepositoryIdempotencyKey("idem-payment-001", "LOG-IGNORED"), "idem-payment-001");
assert.equal(
  resolveRepositoryIdempotencyKey("", "LOG-INTERNAL-001"),
  resolveRepositoryIdempotencyKey("", "LOG-INTERNAL-001"),
  "internal operation-log fallback keys must be deterministic",
);
assert.notEqual(
  resolveRepositoryIdempotencyKey("", "LOG-INTERNAL-001"),
  resolveRepositoryIdempotencyKey("", "LOG-INTERNAL-002"),
);

const request = { headers: { "idempotency-key": "idem-order-confirm-001" } };
assert.equal(readHttpIdempotencyKey(request, {}), "idem-order-confirm-001");
assert.equal(requireHttpIdempotencyKey(request, {}), "idem-order-confirm-001");
assert.throws(
  () => requireHttpIdempotencyKey({ headers: {} }, {}),
  (error) => error?.code === "IDEMPOTENCY_KEY_REQUIRED" && error?.statusCode === 400,
);
assert.equal(isProductionBusinessWritePath("/api/order-drafts/D-1/confirm"), true);
assert.equal(isProductionBusinessWritePath("/api/auth/login"), false);
assert.equal(isProductionBusinessWritePath("/api/system/v1-persistence/live-precheck"), false);

const postgresRequest = buildPostgresIdempotencyRequest({
  scope: "order.confirm",
  idempotencyKey: "idem-order-confirm-001",
  payload: { draftId: "D-1", lines: [{ qty: 100 }] },
  operatorId: "U-OFFICE-A",
  targetType: "original_order",
  targetId: "ORD-1",
  resourceLocks: ["inventory:INV-2", "inventory:INV-1", "inventory:INV-2"],
  query: { text: "BEGIN; SELECT 1; COMMIT;", values: [] },
});
assert.equal(postgresRequest.requestHash.length, 64);
assert.deepEqual(postgresRequest.resourceLocks, [
  "idempotency:order.confirm:idem-order-confirm-001",
  "inventory:INV-1",
  "inventory:INV-2",
]);
assert.equal(Object.hasOwn(postgresRequest, "payload"), false, "raw request payloads must not be retained");

console.log("Idempotency checks passed: HTTP validation, stable request hashes, redaction, and lock normalization are covered.");
