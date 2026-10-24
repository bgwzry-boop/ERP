import assert from "node:assert/strict";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";
import { createLocalFulfillmentActionTransactionRepository } from "../server/fulfillmentActionTransactionRepository.mjs";
import { createFulfillmentReadProjectionService } from "../server/services/fulfillmentReadProjectionService.mjs";
import { loadSeedWorkspace } from "../server/seedData.mjs";
import { mapApiFulfillmentToLocal } from "../src/services/officeFulfillmentSelectors.js";
import { isWarehouseTaskVisible } from "../shared/warehousePaperTrust.js";
import { normalizeCarrierHandoffTimestamp, carrierFinalDeliveryPayload } from "../shared/fulfillmentHandoffTime.js";
import { buildIdempotencyRequestHash } from "../server/idempotency.mjs";

const service = createApiSharedServiceRegistry().fulfillmentActionCommandService;
const projection = createFulfillmentReadProjectionService();
function fixture() {
  const workspace = loadSeedWorkspace({ runtimeMode: "test", source: "synthetic" });
  const fulfillment = workspace.fulfillments.find(row => row.id === "F003");
  Object.assign(fulfillment, { revision: 1, status: "待出库", actualQty: 1500, legacyStateReviewRequired: false });
  workspace.employees = [{ id: "ERP-TEST-WAREHOUSE", name: "合成库房员工" }];
  workspace.printRecords = [{ printRecordId: "PR-TEST", targetId: "F003", status: "printed" }];
  workspace.paperOutboundDocuments = [{ paperOutboundDocumentId: "POD-TEST", fulfillmentId: "F003", printRecordId: "PR-TEST", documentVersion: 1, revision: 1, status: "待打印确认", createdAt: "2026-07-01T00:00:00Z" }];
  workspace.fulfillmentActionTransactionRepository = createLocalFulfillmentActionTransactionRepository();
  return workspace;
}
for (const status of ["submitted", "failed", "voided", "printed", "reprinted"]) {
  const workspace = fixture();
  workspace.printRecords[0].status = status;
  const local = mapApiFulfillmentToLocal(projection.getFulfillment({ workspace, fulfillmentId: "F003" }));
  assert.equal(isWarehouseTaskVisible(local), ["printed", "reprinted"].includes(status));
}
{
  const workspace = fixture(); workspace.paperOutboundDocuments[0].status = "已作废";
  assert.equal(projection.getFulfillment({ workspace, fulfillmentId: "F003" }).warehouseTaskVisible, false);
}
const workspace = fixture();
const body = { expectedRevision: 1, paperOutboundDocumentId: "POD-TEST", paperDocumentVersion: 1, paperDocumentRevision: 1,
  result: "已备货", physicalExecutorEmployeeId: "ERP-TEST-WAREHOUSE", feedbackChannel: "当面", executedAt: "2026-07-01T01:00:00Z", idempotencyKey: "prepare-print-before-paper" };
const inventoryBefore = structuredClone(workspace.inventories);
const prepared = await service.recordWarehouseOutboundExecution({ workspace, fulfillmentId: "F003", body, operatorId: "U-WAREHOUSE-A" });
assert.ok(prepared.response, JSON.stringify(prepared));
assert.equal(workspace.fulfillments.find(row => row.id === "F003").paperOutboundStatus, "已打印待交库房");
assert.deepEqual(workspace.inventories, inventoryBefore);
const persisted = structuredClone({ warehouseOutboundExecutions: workspace.warehouseOutboundExecutions });
const replay = await service.recordWarehouseOutboundExecution({ workspace, fulfillmentId: "F003", body, operatorId: "U-WAREHOUSE-A" });
assert.equal(replay.response.replayed, true);
assert.equal(workspace.warehouseOutboundExecutions.length, persisted.warehouseOutboundExecutions.length);
await assert.rejects(() => service.recordWarehouseOutboundExecution({ workspace, fulfillmentId: "F003", body: { ...body, note: "changed" }, operatorId: "U-WAREHOUSE-A" }), { code: "IDEMPOTENCY_KEY_REUSED" });

function carrierFixture() {
  const w = fixture(); const f = w.fulfillments.find(row => row.id === "F003");
  Object.assign(f, { physicalOutboundAt: "2026-07-31T12:00:00.000Z", physicalOutboundDocumentId: "POD-TEST", status: "待承运方拉走" });
  w.statements = [{ id: "ST-TEST-JULY", customerId: f.customerId, period: "2026-07-01 至 2026-07-31", status: "待生成", revision: 1, receivable: 0, received: 0, lineIds: [] }];
  w.statementLines = [];
  return w;
}
const carrierBody = { expectedRevision: 1, confirmedFinalDelivery: true, actualHandoffAt: "2026-07-31T13:00:00.000Z", idempotencyKey: "carrier-actual-month" };
for (const value of [undefined, "2026-02-30T13:00:00+08:00", "2026-07-31T21:00", "2099-01-01T00:00:00Z", "2026-07-31T11:59:59Z"]) {
  const w = carrierFixture(); const before = structuredClone(w.fulfillments);
  const result = await service.updateFulfillmentStatus({ workspace: w, fulfillmentId: "F003", action: "确认已拉走", body: { ...carrierBody, actualHandoffAt: value }, operatorId: "U-OFFICE-A" });
  assert.equal(result.code, "CARRIER_HANDOFF_TIME_INVALID", String(value)); assert.deepEqual(w.fulfillments, before);
}
assert.equal(normalizeCarrierHandoffTimestamp("2026-07-31T21:00:00+08:00"), carrierBody.actualHandoffAt);
{
  const w = carrierFixture(); w.statements[0].status = "已结清";
  await assert.rejects(() => service.updateFulfillmentStatus({ workspace: w, fulfillmentId: "F003", action: "确认已拉走", body: carrierBody, operatorId: "U-OFFICE-A" }), { code: "FULFILLMENT_BILLING_PERIOD_CLOSED" });
}
{
  const w = carrierFixture(); const f = w.fulfillments.find(row => row.id === "F003");
  await service.updateFulfillmentStatus({ workspace: w, fulfillmentId: "F003", action: "确认已拉走", body: carrierBody, operatorId: "U-OFFICE-A" });
  const saved = w.fulfillments.find(row => row.id === "F003");
  assert.equal(saved.finalDeliveryAt, carrierBody.actualHandoffAt); assert.notEqual(saved.confirmedAt, carrierBody.actualHandoffAt);
  assert.equal(w.statementLines.at(-1).statementId, "ST-TEST-JULY");
  const lineCount = w.statementLines.length; const inventory = structuredClone(w.inventories);
  const replayed = await service.updateFulfillmentStatus({ workspace: w, fulfillmentId: "F003", action: "确认已拉走", body: carrierBody, operatorId: "U-OFFICE-A" });
  assert.equal(replayed.response.replayed, true); assert.equal(w.statementLines.length, lineCount); assert.deepEqual(w.inventories, inventory);
  await assert.rejects(() => service.updateFulfillmentStatus({ workspace: w, fulfillmentId: "F003", action: "确认已拉走", body: { ...carrierBody, actualHandoffAt: "2026-07-31T13:01:00Z" }, operatorId: "U-OFFICE-A" }), { code: "IDEMPOTENCY_KEY_REUSED" });
  assert.equal(f.physicalOutboundAt, saved.physicalOutboundAt);
}
console.log("PASS warehouse print trust, prepare-before-paper, immutable replay, explicit carrier actual time, closed-period rejection and single accounting entry.");
{
  const w = carrierFixture(), oldBody = { expectedRevision: 1, confirmedFinalDelivery: true, idempotencyKey: "carrier-legacy-receipt" };
  const oldAt = "2026-08-01T01:00:00.000Z", saved = w.fulfillments.find(row => row.id === "F003");
  Object.assign(saved, { revision: 2, status: "已交付", finalDeliveryAt: oldAt, deliveredAt: oldAt, confirmedAt: oldAt });
  w.operationIdempotencyRecords = [{ scope: "fulfillment.confirm_carrier_final_handoff", idempotencyKey: oldBody.idempotencyKey,
    requestHash: buildIdempotencyRequestHash(carrierFinalDeliveryPayload({ fulfillmentId: "F003", action: "确认已拉走", body: oldBody, operatorId: "U-OFFICE-A" })),
    response: { fulfillment: { ...saved, fulfillmentId: "F003" }, operationLogId: "LOG-LEGACY-RECEIPT" } }];
  const snapshot = structuredClone(w.fulfillments);
  const replay = await service.updateFulfillmentStatus({ workspace: w, fulfillmentId: "F003", action: "确认已拉走", body: oldBody, operatorId: "U-OFFICE-A" });
  assert.equal(replay.response.replayed, true); assert.equal(replay.response.finalDeliveryAt, oldAt); assert.deepEqual(w.fulfillments, snapshot);
  assert.equal(w.statementLines.length, 0);
  console.log("PASS pre-field legacy receipt replays its original timestamp without creating accounting or rewriting history.");
}
