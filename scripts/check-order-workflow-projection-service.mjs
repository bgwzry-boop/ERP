import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOrderWorkflowProjectionService } from "../server/services/orderWorkflowProjectionService.mjs";

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
assert.match(registrySource, /createOrderWorkflowProjectionService\(\{ calculateLinePricing \}\)/);
assert.match(registrySource, /\} = orderWorkflowProjectionService;/);

const methodNames = [
  "findMatchingInventory",
  "mapFulfillmentMethod",
  "mapInventoryCheckStatus",
  "mapInventoryReservationApiStatus",
  "mapPrintSide",
  "toFulfillmentTaskSummary",
  "toInventoryCheckResult",
  "toInventoryReservationTransactionSummary",
  "toOrderLineSummary",
  "toPriceSnapshot",
];
for (const functionName of methodNames) {
  assert.doesNotMatch(apiSource, new RegExp(`function ${functionName}\\(`));
}

const pricingCalls = [];
const service = createOrderWorkflowProjectionService({
  calculateLinePricing(input) {
    pricingCalls.push(input);
    return {
      bagPrice: 0.34,
      printPrice: input.print === "是" ? 0.13 : 0,
      amount: 47,
      priceVersion: "PRICE-V1",
    };
  },
});

assert.equal(Object.isFrozen(service), true);
assert.deepEqual(Object.keys(service).sort(), [...methodNames].sort());

assert.deepEqual(
  service.toOrderLineSummary({ id: "OL-1", status: "待出库", flags: ["加急"] }),
  { id: "OL-1", lineStatus: "待出库", exceptionTags: ["加急"] },
);
assert.deepEqual(
  service.toOrderLineSummary({ id: "OL-2", status: "已关闭" }),
  { id: "OL-2", lineStatus: "已关闭", exceptionTags: [] },
);

assert.deepEqual(
  service.toPriceSnapshot({
    id: "OL-1",
    originalQty: 100,
    printFlag: true,
    amount: 49,
  }),
  {
    orderLineId: "OL-1",
    bagPrice: 0.34,
    printPrice: 0.13,
    otherFee: 0,
    amount: 49,
    priceVersion: "PRICE-V1",
  },
);
assert.equal(pricingCalls[0].print, "是");
assert.equal(pricingCalls[0].qty, 100);
assert.equal(service.toPriceSnapshot({ id: "OL-2", qty: 10, print: "否" }).amount, 47);

const workspace = {
  inventories: [
    {
      id: "INV-1",
      size: "30*38*10",
      color: "白色",
      handle: "黑提",
      style: "空白袋",
      available: 60,
    },
  ],
};
const draftLine = {
  id: "DRAFT-LINE-1",
  size: "30*38*10",
  color: "白色",
  handle: "黑提",
  style: "空白袋",
  inventory: "缺货",
  qty: 100,
};
assert.equal(service.findMatchingInventory(workspace, draftLine), workspace.inventories[0]);
assert.deepEqual(service.toInventoryCheckResult(workspace, draftLine, { id: "OL-1" }), {
  orderLineId: "OL-1",
  inventoryItemId: "INV-1",
  status: "insufficient",
  requestedQty: 100,
  recognizedAvailableQty: 60,
  currentAvailableQty: 60,
  shortageQty: 40,
});
assert.deepEqual(
  service.toInventoryCheckResult(
    workspace,
    { ...draftLine, id: "DRAFT-LINE-2", color: "黄色", inventory: "需复核", qty: 30 },
    null,
  ),
  {
    orderLineId: "DRAFT-LINE-2",
    inventoryItemId: "",
    status: "pending_review",
    requestedQty: 30,
    recognizedAvailableQty: 0,
    currentAvailableQty: 0,
    shortageQty: 30,
  },
);

assert.deepEqual(
  service.toInventoryReservationTransactionSummary({
    reservationId: "RES-1",
    orderLineId: "OL-1",
    inventoryItemId: "INV-1",
    reservedQty: 60,
    status: "部分释放",
  }),
  {
    reservationId: "RES-1",
    orderLineId: "OL-1",
    inventoryItemId: "INV-1",
    qty: 60,
    status: "partially_released",
  },
);
assert.deepEqual(
  ["生效", "已释放", "部分释放", "已出库", "reserved", ""].map(
    service.mapInventoryReservationApiStatus,
  ),
  ["active", "released", "partially_released", "converted_to_outbound", "reserved", "active"],
);

assert.deepEqual(
  service.toFulfillmentTaskSummary({
    id: "FUL-1",
    lineId: "OL-1",
    method: "快递快运",
    status: "待打印标签",
    qty: 100,
  }),
  {
    fulfillmentId: "FUL-1",
    orderLineId: "OL-1",
    method: "express_ltl",
    status: "待打印标签",
    expectedQty: 100,
  },
);
assert.deepEqual(
  ["自提", "送货", "快递快运", "待确认", "pickup", null].map(service.mapFulfillmentMethod),
  ["pickup", "delivery", "express_ltl", "pending", "pickup", "pending"],
);
assert.deepEqual(
  ["可用", "有货", "缺货", "需复核", "待确认"].map(service.mapInventoryCheckStatus),
  ["available", "available", "insufficient", "pending_review", "changed_since_recognition"],
);
assert.deepEqual(
  ["single", "double", "单面", "双面", ""].map(service.mapPrintSide),
  ["单面", "双面", "单面", "双面", "非印刷"],
);

assert.throws(
  () => createOrderWorkflowProjectionService({ calculateLinePricing: null }),
  /requires calculateLinePricing to be a function/,
);

console.log(
  "Order workflow projection service checks passed: price, inventory, reservation, fulfillment, and enum projections are isolated",
);
