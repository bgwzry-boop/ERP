import assert from "node:assert/strict";
import {
  buildConfirmedFulfillments,
  buildConfirmedInventoryLedgerEntries,
  buildConfirmedInventoryReservations,
  buildConfirmedOrder,
  buildConfirmedOrderDraft,
  buildConfirmedOrderLines,
  buildConfirmedPriceSnapshots,
  buildConfirmedTodos,
} from "./helpers/postgresLiveOrderConfirmationFixtures.mjs";

const customerId = "C-ORDER-CONFIRM-FIXTURE-001";
const createdBy = "U-OFFICE-FIXTURE-001";
const draft = buildConfirmedOrderDraft({ draftId: "DRAFT-ORDER-CONFIRM-FIXTURE-001", customerId, createdBy });
const order = buildConfirmedOrder({
  orderId: "ORD-ORDER-CONFIRM-FIXTURE-001",
  sourceDraftId: draft.draftId,
  customerId,
  createdBy,
});
const orderLine = buildConfirmedOrderLines({ orderId: order.orderId, customerId, orderLineId: "OL-ORDER-CONFIRM-FIXTURE-001", createdBy })[0];
const priceSnapshot = buildConfirmedPriceSnapshots({ orderLineId: orderLine.id, createdBy })[0];
const fulfillment = buildConfirmedFulfillments({
  fulfillmentId: "F-ORDER-CONFIRM-FIXTURE-001",
  orderLineId: orderLine.id,
  customerId,
  createdBy,
})[0];
const reservation = buildConfirmedInventoryReservations({
  reservationId: "RSV-ORDER-CONFIRM-FIXTURE-001",
  orderLineId: orderLine.id,
  inventoryItemId: "INV-ORDER-CONFIRM-FIXTURE-001",
  reservedQty: orderLine.qty,
  createdBy,
})[0];
const ledger = buildConfirmedInventoryLedgerEntries({
  ledgerId: "LEDGER-ORDER-CONFIRM-FIXTURE-001",
  inventoryItemId: reservation.inventoryItemId,
  sourceId: orderLine.id,
  qtyBefore: 500,
  qtyChange: -orderLine.qty,
  qtyAfter: 500 - orderLine.qty,
  operatorId: createdBy,
})[0];
const todo = buildConfirmedTodos({ todoId: "TODO-ORDER-CONFIRM-FIXTURE-001", refId: order.orderId, customerId, createdBy })[0];

assert.equal(draft.id, draft.draftId);
assert.equal(draft.lines[0].customerId, customerId);
assert.equal(order.sourceDraftId, draft.draftId);
assert.equal(order.bizNo, order.orderId);
assert.equal(orderLine.orderNo, order.orderId);
assert.equal(orderLine.customerId, customerId);
assert.equal(priceSnapshot.orderLineId, orderLine.id);
assert.equal(priceSnapshot.chargeableQty, orderLine.qty);
assert.equal(fulfillment.lineId, orderLine.id);
assert.equal(fulfillment.customerId, customerId);
assert.equal(reservation.orderLineId, orderLine.id);
assert.equal(reservation.reservedQty, orderLine.qty);
assert.equal(ledger.inventoryItemId, reservation.inventoryItemId);
assert.equal(ledger.sourceId, orderLine.id);
assert.equal(ledger.qtyBefore + ledger.qtyChange, ledger.qtyAfter);
assert.equal(ledger.confirmedBy, createdBy);
assert.equal(todo.ref, order.orderId);
assert.equal(todo.customerId, customerId);

console.log("PostgreSQL live order-confirmation fixture checks passed: draft, order, line, pricing, fulfillment, reservation, ledger, and todo links are stable.");
