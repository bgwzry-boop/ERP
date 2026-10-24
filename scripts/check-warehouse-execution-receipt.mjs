import assert from "node:assert/strict";
import { recordOfficeWarehouseOutboundExecution } from "../src/services/officeFulfillmentApiClient.js";
import { confirmWarehouseExecution } from "../src/app/confirmWarehouseExecution.js";
import { submitWarehouseExecution } from "../src/app/submitWarehouseExecution.js";

const input = { fulfillment: { id: "F-RECEIPT", revision: 1 }, paperOutboundDocument: { paperOutboundDocumentId: "POD-RECEIPT", documentVersion: 3, revision: 4 },
  result: "已备货", physicalExecutorEmployeeId: "EMP-RECEIPT", feedbackChannel: "当面", executedAt: "2026-10-24T01:05:12", idempotencyKey: "warehouse-receipt-original" };
const receipt = { fulfillmentId: "F-RECEIPT", status: "已备货", operationLogId: "LOG-RECEIPT", warehouseOutboundExecution: {
  warehouseOutboundExecutionId: "WEX-RECEIPT", fulfillmentId: "F-RECEIPT", paperOutboundDocumentId: "POD-RECEIPT", paperDocumentVersion: 3, result: "已备货" } };
const cases = [ {}, { ...receipt, operationLogId: "" }, { ...receipt, warehouseOutboundExecution: {} },
  { ...receipt, fulfillmentId: "F-OTHER" }, { ...receipt, warehouseOutboundExecution: { ...receipt.warehouseOutboundExecution, fulfillmentId: "F-OTHER" } },
  { ...receipt, warehouseOutboundExecution: { ...receipt.warehouseOutboundExecution, paperOutboundDocumentId: "POD-OTHER" } },
  { ...receipt, warehouseOutboundExecution: { ...receipt.warehouseOutboundExecution, paperDocumentVersion: 2 } },
  { ...receipt, warehouseOutboundExecution: { ...receipt.warehouseOutboundExecution, result: "实物已出库" } } ];
for (const body of cases) {
  const result = await recordOfficeWarehouseOutboundExecution(input, { serverRequired: true, fetchImpl: async () => new Response(JSON.stringify(body), { status: 200 }) });
  assert.equal(result.blocked, true); assert.equal(result.error.code, "WAREHOUSE_EXECUTION_UNCONFIRMED"); assert.equal(result.error.status, undefined);
  const activeModal = { type: "warehouseExecution", fulfillmentId: input.fulfillment.id };
  let closed = false, uncertain = false, reset = false;
  const payload = { ...input, fulfillmentSnapshot: { ...input.fulfillment, paperOutboundDocument: input.paperOutboundDocument }, paperDocumentSnapshot: input.paperOutboundDocument };
  const snapshot = structuredClone(payload);
  const confirm = () => confirmWarehouseExecution({ payload, activeModal, permissionContext: { actionPermissions: ["fulfillment.warehouse.execute"] }, fulfillments: [],
    recordWarehouseExecution: async () => ({ source: "api", ...body }), getModal: () => activeModal, closeModal: () => { closed = true; } });
  assert.equal((await confirm()).error.code, "WAREHOUSE_EXECUTION_UNCONFIRMED"); assert.equal(closed, false);
  await submitWarehouseExecution({ request: payload, onConfirm: confirm, mounted: { current: true }, pending: { current: true }, setSubmitting() {}, setError() {},
    setUncertain(value) { uncertain = value; }, reset() { reset = true; } });
  assert.equal(uncertain, true); assert.equal(reset, false); assert.equal(closed, false); assert.deepEqual(payload, snapshot);
}
const valid = await recordOfficeWarehouseOutboundExecution(input, { serverRequired: true, fetchImpl: async () => new Response(JSON.stringify(receipt), { status: 200 }) });
assert.equal(valid.source, "api"); assert.equal(valid.operationLogId, receipt.operationLogId);
console.log("PASS empty/missing/foreign task/paper/version/result 200 receipts remain unconfirmed, keep original request/key, and never close or reset the warehouse confirmation.");
