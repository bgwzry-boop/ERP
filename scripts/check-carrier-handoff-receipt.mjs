import assert from "node:assert/strict";
import { confirmOfficeFulfillmentPickup } from "../src/services/officeFulfillmentApiClient.js";
const input = { fulfillment: { id: "F-CARRIER-RECEIPT", revision: 1 }, expectedRevision: 1, confirmedFinalDelivery: true,
  actualHandoffAt: "2026-07-31T13:00:00Z", idempotencyKey: "carrier-receipt-original" };
const receipt = { fulfillmentId: input.fulfillment.id, status: "已交付", operationLogId: "LOG-CARRIER-RECEIPT", finalDeliveryAt: input.actualHandoffAt,
  statementCandidate: true, statementId: "ST-CARRIER-RECEIPT" };
for (const body of [{}, { ...receipt, operationLogId: "" }, { ...receipt, fulfillmentId: "F-OTHER" }, { ...receipt, finalDeliveryAt: "2026-08-01T01:00:00Z" },
  { ...receipt, finalDeliveryAt: "2026-02-30T01:00:00Z" }, { ...receipt, status: "待承运方拉走" }, { ...receipt, statementId: "" }]) {
  const result = await confirmOfficeFulfillmentPickup(input, { serverRequired: true, fetchImpl: async () => new Response(JSON.stringify(body), { status: 200 }) });
  assert.equal(result.blocked, true); assert.equal(result.error.code, "CARRIER_HANDOFF_UNCONFIRMED"); assert.equal(result.error.status, undefined);
}
const result = await confirmOfficeFulfillmentPickup(input, { serverRequired: true, fetchImpl: async () => new Response(JSON.stringify(receipt), { status: 200 }) });
assert.equal(result.source, "api"); assert.equal(result.finalDeliveryAt, receipt.finalDeliveryAt);
const legacy = await confirmOfficeFulfillmentPickup({ ...input, actualHandoffAt: undefined }, { serverRequired: true, fetchImpl: async () => new Response(JSON.stringify(receipt), { status: 200 }) });
assert.equal(legacy.source, "api");
console.log("PASS empty/foreign/mismatched actual-time or incomplete carrier 200 receipts remain unconfirmed; exact receipt and pre-field legacy replay remain readable.");
