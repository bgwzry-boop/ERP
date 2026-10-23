import assert from "node:assert/strict";
import { getJson, postJson } from "./apiIntegrationTestHarness.mjs";

// Synthetic integration fixture, created through the normal packing transaction.
// Quantities represent the explicit physical count in this test, never a guessed
// package checklist derived from a fulfillment's display text.
export async function completePhysicalPackingFixture(baseUrl) {
  const packingTaskId = "PKT-ORD-0629-009-01";
  const task = await getJson(baseUrl, `/api/packing-tasks/${packingTaskId}`);
  assert.equal(Number(task.packingTask?.plannedQty), 2000);
  const packing = await postJson(baseUrl, `/api/packing-tasks/${packingTaskId}/complete`, {
    actualPackedQty: 2000,
    packages: [{ packedQty: 500 }, { packedQty: 500 }, { packedQty: 500 }, { packedQty: 500 }],
    remark: "合成测试：已核对四个实际包裹，每包500个",
  }, { headers: { "x-erp-user-id": "U-WAREHOUSE-A" } });
  assert.ok(packing.fulfillmentId);
  assert.equal(packing.packageIds?.length, 4);
  assert.equal(new Set(packing.packageIds).size, 4);
  return packing;
}
