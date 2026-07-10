import assert from "node:assert/strict";

import { nextId } from "../src/domain/officeRules.js";
import { confirmDraftOrder } from "../src/state/officeOrderActions.js";

const sparseFulfillments = [
  { id: "F001" },
  { id: "F002" },
  { id: "F006" },
  { id: "F008" },
  { id: "F-LIVE-EXPORT-001" },
];

assert.equal(nextId("F", sparseFulfillments), "F009");
assert.equal(nextId("F", sparseFulfillments, 1), "F010");
assert.equal(
  nextId("ORD-P0-", [{ orderNo: "ORD-P0-002" }, { id: "ORD-P0-009-01", orderNo: "ORD-P0-009" }]),
  "ORD-P0-010",
);
assert.equal(nextId("F", 7), "F008");

const result = confirmDraftOrder({
  draftRows: [
    {
      id: "DRAFT-SPARSE-ID-01",
      customerId: "C001",
      customer: "张三服饰",
      product: "空白袋",
      size: "30*38*10",
      color: "红色",
      handle: "普通提",
      style: "空白袋",
      print: "否",
      qty: 10,
      fulfillment: "自提",
      latest: "明天",
      printSide: "非印刷",
      printColor: "非印刷",
      artworkStatus: "不需要",
      handleColor: "",
      note: "",
    },
  ],
  inventoryRecords: [
    {
      id: "30*38*10-红色-普通提-空白袋-A区",
      size: "30*38*10",
      color: "红色",
      handle: "普通提",
      style: "空白袋",
      state: "仓库已清点",
      inStock: 100,
      reserved: 0,
      locked: 0,
      pending: 0,
      estimated: false,
    },
  ],
  orderLines: [
    { id: "ORD-P0-002-01", orderNo: "ORD-P0-002" },
    { id: "ORD-P0-009-01", orderNo: "ORD-P0-009" },
  ],
  fulfillments: sparseFulfillments,
  customers: [{ id: "C001", name: "张三服饰" }],
});

assert.equal(result.blocked, false);
assert.equal(result.orderNo, "ORD-P0-010");
assert.equal(result.newLines[0].id, "ORD-P0-010-01");
assert.equal(result.newFulfillments[0].id, "F009");

console.log("Office order action checks passed.");
