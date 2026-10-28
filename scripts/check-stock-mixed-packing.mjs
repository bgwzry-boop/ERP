import assert from "node:assert/strict";
import { getPackageGroupContext, replacePackageGroup } from "../server/services/packageGroupService.mjs";

const stockLine = { id: "OL-1", orderId: "ORD-1", orderType: "现货通货", status: "已备货", qty: 800, customerId: "C1", size: "30×38×10", color: "红色" };
const stockLineB = { ...stockLine, id: "OL-2", color: "蓝色", qty: 200 };
const customLine = { ...stockLine, id: "OL-C", orderId: "ORD-C", orderType: "定制印刷", qty: 1000 };
const fulfillments = [
  { id: "F1", lineId: "OL-1", customerId: "C1", method: "自提", status: "待出库", qty: 800, expectedQty: 800, revision: 1 },
  { id: "F2", lineId: "OL-2", customerId: "C1", method: "自提", status: "待出库", qty: 200, expectedQty: 200, revision: 1 },
  { id: "FC", lineId: "OL-C", customerId: "C1", method: "自提", status: "待打包", qty: 1000, expectedQty: 1000, revision: 1 },
];
const workspace = {
  orderLines: [stockLine, stockLineB, customLine],
  fulfillments,
  packages: [],
  packingTasks: [],
  customers: [{ id: "C1", name: "来厂客户" }],
  productionPackingTransactionRepository: {
    async refreshPackageGroupWorkspace() {},
    async findPackageGroupReplay() { return null; },
    async writePackageGroup(input) {
      return { packageIds: input.packages.map((row) => row.packageId), packages: input.packages, fulfillmentIds: input.snapshot.fulfillments.map((row) => row.id) };
    },
  },
};

const context = getPackageGroupContext(workspace, { fulfillmentId: "F1" });
assert.deepEqual(context.lines.map((row) => row.orderLineId).sort(), ["OL-1", "OL-2"]);
assert.throws(() => getPackageGroupContext(workspace, { fulfillmentId: "FC" }), (error) => error.code === "PACKING_CUSTOM_MIXED_FORBIDDEN");

const saved = await replacePackageGroup({
  workspace,
  fulfillmentId: "F1",
  operatorId: "U-OFFICE-A",
  body: {
    snapshotToken: context.snapshotToken,
    fulfillmentIds: ["F1", "F2"],
    physicalContentsConfirmed: true,
    reason: "不足约1000，来厂自提，红蓝混装一包",
    idempotencyKey: "stock-mix-1",
    packages: [{ confirmed: true, items: [
      { fulfillmentId: "F1", orderLineId: "OL-1", packedQty: 800 },
      { fulfillmentId: "F2", orderLineId: "OL-2", packedQty: 200 },
    ] }],
  },
});
assert.equal(saved.packages.length, 1);
assert.equal(saved.packages[0].packedQty, 1000);
assert.equal(saved.packages[0].contents.length, 2);

await assert.rejects(() => replacePackageGroup({
  workspace,
  fulfillmentId: "FC",
  operatorId: "U-OFFICE-A",
  body: {
    snapshotToken: "ignored",
    fulfillmentIds: ["FC"],
    physicalContentsConfirmed: true,
    reason: "定制单试图混装",
    idempotencyKey: "custom-mix",
    packages: [{ confirmed: true, items: [{ fulfillmentId: "FC", orderLineId: "OL-C", packedQty: 1000 }] }],
  },
}), (error) => error.code === "PACKING_CUSTOM_MIXED_FORBIDDEN");

console.log("Stock mixed packing checks passed: common goods accept one package with two lines, custom orders are refused.");
