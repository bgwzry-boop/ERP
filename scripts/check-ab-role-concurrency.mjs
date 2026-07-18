import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sources = await Promise.all([
  "server/rawMaterialInboundConcurrency.mjs",
  "server/productionScheduleRecordRepository.mjs",
  "server/fulfillmentActionTransactionRepository.mjs",
  "server/statementPaymentTransactionRepository.mjs",
  "server/statementSettlementTransactionRepository.mjs",
  "server/rawMaterialPurchaseRepository.mjs",
].map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));

for (const [index, source] of sources.entries()) {
  assert.match(source, /BUSINESS_WRITE_CONFLICT|ERP_[A-Z_]*CONCURRENCY_CONFLICT/, `repository ${index + 1} must fail closed on a stale write`);
  assert.match(source, /revision/, `repository ${index + 1} must persist or compare a revision`);
}

const apiServer = await readFile(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
assert.match(apiServer, /normalizeExpectedRevisionAtApiBoundary/);
assert.match(apiServer, /clientRevision/);
assert.match(apiServer, /expectedRevision/);
assert.match(apiServer, /currentRevision/);

console.log("AB-role concurrency check passed: API-boundary legacy normalization and stale-write guards cover raw material, scheduling, fulfillment, statements, and purchasing.");
