import assert from "node:assert/strict";

export async function confirmFixtureStockPreparation(service, workspace, fulfillmentId, preparedQty, idempotencyKey) {
  const batch = workspace.fulfillments.find(row => row.id === fulfillmentId);
  assert.ok(batch, fulfillmentId);
  const preparation = await service.recordStockPreparation({
    workspace, fulfillmentId, operatorId: "U-OFFICE-A",
    body: { expectedRevision: batch.revision, preparedQty, employeeId: "EMP-LIVE-MANAGER-001", idempotencyKey },
  });
  assert.ok(preparation.response?.operationLogId, JSON.stringify(preparation));
}
