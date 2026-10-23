import assert from "node:assert/strict";
import { createLocalFulfillmentActionTransactionRepository } from "../server/fulfillmentActionTransactionRepository.mjs";

const repository = createLocalFulfillmentActionTransactionRepository();
let sequence = 0;
function fixture({ actual = 10, held = 10, onHand = 100, reserved = held, deduct = actual, reservation = true, type = "stock", physicalOutboundAt = "" } = {}) {
  const key = `LOCAL-CONSERVATION-${++sequence}`;
  const prior = { id: key, orderLineId: "OL1", expectedQty: actual, actualQty: actual, status: "配送中", revision: 1, physicalOutboundAt };
  const hold = { id: "RSV1", orderLineId: "OL1", inventoryItemId: "INV1", qty: held, status: "生效" };
  const workspace = {
    fulfillments: [prior], orderLines: [{ id: "OL1", orderType: type }],
    inventories: [{ id: "INV1", inStock: onHand, reserved: reservation ? reserved : 0 }],
    inventoryReservations: reservation ? [hold] : [], inventoryLedgers: [], operationLogs: [],
  };
  const input = {
    workspace, fulfillment: { ...prior, status: "已交付" }, idempotencyKey: key, idempotencyPayload: { key },
    operationLog: { id: `LOG-${key}`, action: "driver_complete_delivery", targetId: key, operatorId: "TEST" },
    inventoryAdjustments: deduct ? [{ inventoryItemId: "INV1", onHandQtyChange: -deduct, reservedQtyChange: reservation ? -held : 0 }] : [],
    inventoryReservations: reservation ? [{ ...hold, status: "已出库" }] : [],
    inventoryLedgerEntries: deduct ? [{ id: `LED-${key}`, inventoryItemId: "INV1", qtyBefore: onHand, qtyChange: -deduct, qtyAfter: onHand - deduct, sourceId: key }] : [],
  };
  return { workspace, input };
}
function rejectUnchanged(fixture, mutate = () => {}) {
  mutate(fixture);
  const before = structuredClone(fixture.workspace);
  assert.throws(() => repository.recordFulfillmentAction(fixture.input), error => error.statusCode === 409 && error.code === "ERP_FULFILLMENT_INVENTORY_CONSERVATION_CONFLICT");
  assert.deepEqual(fixture.workspace, before, "invalid outbound must not mutate any workspace collection");
}

rejectUnchanged(fixture({ actual: 100, held: 100, onHand: 50 }), () => {});
rejectUnchanged(fixture({ actual: 100, held: 100, reserved: 50 }));
rejectUnchanged(fixture({ held: 6, deduct: 6 }));
rejectUnchanged(fixture({ held: 6, deduct: 10 }));
rejectUnchanged(fixture({ reservation: false, deduct: 0 }));
rejectUnchanged(fixture(), f => { f.workspace.inventoryReservations[0].orderLineId = "OTHER"; });
rejectUnchanged(fixture(), f => { f.workspace.inventoryReservations[0].inventoryItemId = "OTHER"; });
rejectUnchanged(fixture(), f => { f.workspace.inventoryReservations[0].qty = 6; });
rejectUnchanged(fixture(), f => { f.workspace.inventories[0].inStock = 95; });
rejectUnchanged(fixture(), f => { f.input.inventoryLedgerEntries[0].qtyChange = -6; });
rejectUnchanged(fixture(), f => { f.input.inventoryAdjustments[0].onHandQtyChange = -9.5; });
rejectUnchanged(fixture(), f => { f.input.inventoryReservations.push({ ...f.input.inventoryReservations[0] }); });
rejectUnchanged(fixture({ physicalOutboundAt: "2026-10-23T04:00:00Z" }));

for (const config of [{}, { actual: 6, held: 10 }, { reservation: false }]) {
  const f = fixture(config);
  const result = repository.recordFulfillmentAction(f.input);
  assert.equal(result.fulfillment.status, "已交付");
  assert.equal(f.workspace.inventories[0].inStock, 100 - (config.actual ?? 10));
  assert.equal(f.workspace.inventories[0].reserved, 0);
  const snapshot = structuredClone(f.workspace);
  const replay = repository.recordFulfillmentAction(f.input);
  assert.equal(replay.replayed, true);
  assert.deepEqual(f.workspace, snapshot, "replay must not deduct twice");
}
for (const type of ["custom_special", "特殊尺寸空白袋", "external_print", "外加工印刷"]) {
  const f = fixture({ type, reservation: false, deduct: 0 });
  assert.equal(repository.recordFulfillmentAction(f.input).fulfillment.status, "已交付");
  assert.equal(f.workspace.inventories[0].inStock, 100);
}
const alreadyOutbound = fixture({ physicalOutboundAt: "2026-10-23T04:00:00Z", reservation: false, deduct: 0 });
assert.equal(repository.recordFulfillmentAction(alreadyOutbound.input).fulfillment.status, "已交付");
assert.equal(alreadyOutbound.workspace.inventories[0].inStock, 100);
console.log("PASS local outbound inventory conservation: insufficient on-hand/reserved, underdeduction, ownership/quantity/ledger drift, duplicate holds and repeated physical outbound reject atomically; special/external direct delivery, short delivery/full hold release, legacy full deduction and replay remain valid.");
