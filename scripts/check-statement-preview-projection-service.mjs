import assert from "node:assert/strict";
import { createStatementPreviewProjectionService } from "../server/services/statementPreviewProjectionService.mjs";

const service = createStatementPreviewProjectionService();
const workspace = {
  orderLines: [
    {
      orderLineId: "OL-1",
      orderNo: "ORD-1",
      productName: "定制袋",
      orderType: "定制印刷",
      size: "35*41",
      color: "白色",
      handle: "加长提",
      handleColor: "黑色",
      print: true,
      printColor: "黑色",
      printSide: "double",
      quantity: "1200",
      amount: "600",
      note: "提手颜色更换",
    },
  ],
  fulfillments: [{ fulfillmentId: "F-1", orderLineId: "OL-1", packages: "3包" }],
  statementLines: [
    {
      statement_line_id: "SL-1",
      statement_id: "ST-1",
      order_line_id: "OL-1",
      fulfillment_id: "F-PERSISTED",
      delivered_qty: "1200",
      chargeable_qty: "1000",
      free_qty: "200",
      amount: "500",
      adjustment_amount: "-20",
      final_amount: "480",
    },
  ],
};
const statement = { statementId: "ST-1", lineIds: ["OL-IGNORED"] };
const before = structuredClone(workspace);

const persisted = service.buildPreviewLines(workspace, statement);
assert.equal(persisted.length, 1);
assert.equal(persisted[0].statementLineId, "SL-1");
assert.equal(persisted[0].orderLineId, "OL-1");
assert.equal(persisted[0].fulfillmentId, "F-PERSISTED");
assert.equal(persisted[0].productName, "定制袋");
assert.equal(persisted[0].deliveredQty, 1200);
assert.equal(persisted[0].chargeableQty, 1000);
assert.equal(persisted[0].freeQty, 200);
assert.equal(persisted[0].billQty, 1000);
assert.equal(persisted[0].unitPrice, 0.5);
assert.equal(persisted[0].amount, 500);
assert.equal(persisted[0].adjustmentAmount, -20);
assert.equal(persisted[0].finalAmount, 480);
assert.equal(
  persisted[0].goodsSpec,
  "定制袋 / 35*41 / 白印黑 / 白袋黑提 / 双面 / 1200个 / 3包 / 加长提、提手颜色更换",
);
assert.equal(persisted[0].remark, "加长提、提手颜色更换");
assert.deepEqual(workspace, before, "statement preview projection must not mutate workspace data");

const fallback = service.buildPreviewLines(
  {
    orderLines: [
      {
        id: "OL-2",
        orderId: "ORD-2",
        product: "现货袋",
        size: "25*32",
        color: "黄色",
        print: "否",
        qty: 600,
        amount: "invalid",
      },
    ],
    fulfillments: [{ id: "F-2", lineId: "OL-2", packageLabel: "2包" }],
    statementLines: [],
  },
  { id: "ST-2", line_ids: ["OL-2", "OL-MISSING"] },
);
assert.equal(fallback.length, 2);
assert.deepEqual(fallback[0], {
  statementLineId: "ST-2-001",
  statementId: "ST-2",
  orderLineId: "OL-2",
  fulfillmentId: "F-2",
  orderNo: "ORD-2",
  productName: "现货袋",
  goodsSpec: "现货袋 / 25*32 / 黄色 / 600个 / 2包",
  remark: "",
  deliveredQty: 600,
  chargeableQty: 600,
  freeQty: 0,
  billQty: 600,
  unitPrice: 0,
  amount: 0,
  adjustmentAmount: 0,
  finalAmount: 0,
});
assert.equal(fallback[1].statementLineId, "ST-2-002");
assert.equal(fallback[1].orderLineId, "OL-MISSING");
assert.equal(fallback[1].productName, "未找到明细");
assert.equal(fallback[1].goodsSpec, "");
for (const field of [
  "deliveredQty",
  "chargeableQty",
  "freeQty",
  "billQty",
  "unitPrice",
  "amount",
  "adjustmentAmount",
  "finalAmount",
]) {
  assert.equal(Number.isFinite(fallback[1][field]), true, `${field} must remain a finite number`);
}

const invalidPersisted = service.toPreviewLine(
  { fulfillments: [] },
  { id: "ST-3" },
  "OL-3",
  { id: "OL-3", product: "测试袋", qty: 10, amount: 5 },
  0,
  {
    deliveredQty: "not-a-number",
    chargeableQty: "",
    freeQty: null,
    amount: "not-a-number",
    adjustmentAmount: "invalid",
    finalAmount: "invalid",
  },
);
assert.equal(invalidPersisted.deliveredQty, 10);
assert.equal(invalidPersisted.chargeableQty, 10);
assert.equal(invalidPersisted.freeQty, 0);
assert.equal(invalidPersisted.amount, 5);
assert.equal(invalidPersisted.adjustmentAmount, 0);
assert.equal(invalidPersisted.finalAmount, 5);

console.log(
  "Statement preview projection service checks passed: persisted and legacy lines, factory shorthand, finite amounts, and missing records are covered.",
);
