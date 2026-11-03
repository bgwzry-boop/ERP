import assert from "node:assert/strict";
import { getPackageGroupContext, replacePackageGroup } from "../server/services/packageGroupService.mjs";

const stockLine = { id: "OL-1", orderId: "ORD-1", orderType: "现货通货", status: "已备货", qty: 800, customerId: "C1", size: "30×38×10", color: "红色" };
const stockLineB = { ...stockLine, id: "OL-2", color: "蓝色", qty: 200 };
const customLine = { ...stockLine, id: "OL-C", orderId: "ORD-C", orderType: "定制印刷", qty: 1000 };
// Owner 2026-10-29: 500 × 35 + 500 × 40 of one custom order may share a package if the customer agrees.
const customLine35 = { ...stockLine, id: "OL-D1", orderId: "ORD-D", orderType: "定制印刷", qty: 500, size: "35" };
const customLine40 = { ...stockLine, id: "OL-D2", orderId: "ORD-D", orderType: "定制印刷", qty: 500, size: "40" };
const fulfillments = [
  { id: "F1", lineId: "OL-1", customerId: "C1", method: "自提", status: "待出库", qty: 800, expectedQty: 800, revision: 1 },
  { id: "F2", lineId: "OL-2", customerId: "C1", method: "自提", status: "待出库", qty: 200, expectedQty: 200, revision: 1 },
  { id: "FC", lineId: "OL-C", customerId: "C1", method: "自提", status: "待打包", qty: 1000, expectedQty: 1000, revision: 1 },
  { id: "FD1", lineId: "OL-D1", customerId: "C1", method: "自提", status: "待打包", qty: 500, expectedQty: 500, revision: 1 },
  { id: "FD2", lineId: "OL-D2", customerId: "C1", method: "自提", status: "待打包", qty: 500, expectedQty: 500, revision: 1 },
];
const workspace = {
  orderLines: [stockLine, stockLineB, customLine, customLine35, customLine40],
  fulfillments,
  packages: [],
  packingTasks: [
    { id: "PKT-C", orderLineId: "OL-C", status: "待打包" },
    { id: "PKT-D1", orderLineId: "OL-D1", status: "待打包" },
    { id: "PKT-D2", orderLineId: "OL-D2", status: "待打包" },
  ],
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
const customContext = getPackageGroupContext(workspace, { fulfillmentId: "FD1" });
assert.deepEqual(customContext.lines.map((row) => row.orderLineId).sort(), ["OL-D1", "OL-D2"], "a custom order offers its own lines, never another order's");
assert.ok(customContext.lines.every((row) => row.custom === true));

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

const mixedCustom = (consent) => replacePackageGroup({
  workspace,
  fulfillmentId: "FD1",
  operatorId: "U-OFFICE-A",
  body: {
    snapshotToken: getPackageGroupContext(workspace, { fulfillmentId: "FD1" }).snapshotToken,
    fulfillmentIds: ["FD1", "FD2"],
    physicalContentsConfirmed: true,
    reason: "按实物核对 1 包",
    idempotencyKey: `custom-mix-${Boolean(consent)}`,
    ...consent,
    packages: [{ confirmed: true, items: [
      { fulfillmentId: "FD1", orderLineId: "OL-D1", packedQty: 500 },
      { fulfillmentId: "FD2", orderLineId: "OL-D2", packedQty: 500 },
    ] }],
  },
});
await assert.rejects(() => mixedCustom({}), (error) => error.code === "PACKING_CUSTOM_MIXED_CONSENT_REQUIRED" && error.statusCode === 422);
await assert.rejects(() => mixedCustom({ customerMixedPackingConsent: true, customerConsentNote: "" }), (error) => error.code === "PACKING_CUSTOM_MIXED_CONSENT_REQUIRED");
let recordedReason = "";
const originalWrite = workspace.productionPackingTransactionRepository.writePackageGroup;
workspace.productionPackingTransactionRepository.writePackageGroup = async (input) => { recordedReason = input.reason; return originalWrite(input); };
const customSaved = await mixedCustom({ customerMixedPackingConsent: true, customerConsentNote: "客户微信同意 35、40 混装一包" });
assert.equal(customSaved.packages.length, 1);
assert.deepEqual(customSaved.packages[0].contents.map((item) => [item.orderLineId, item.packedQty]), [["OL-D1", 500], ["OL-D2", 500]], "the package keeps per-item counts for its label");
assert.match(recordedReason, /客户同意定制单混装：客户微信同意 35、40 混装一包/);
// Separate packages for each custom line need no consent.
const separate = await replacePackageGroup({
  workspace,
  fulfillmentId: "FD1",
  operatorId: "U-OFFICE-A",
  body: {
    snapshotToken: getPackageGroupContext(workspace, { fulfillmentId: "FD1" }).snapshotToken,
    fulfillmentIds: ["FD1", "FD2"],
    physicalContentsConfirmed: true,
    reason: "各自成包",
    idempotencyKey: "custom-separate",
    packages: [
      { confirmed: true, items: [{ fulfillmentId: "FD1", orderLineId: "OL-D1", packedQty: 500 }] },
      { confirmed: true, items: [{ fulfillmentId: "FD2", orderLineId: "OL-D2", packedQty: 500 }] },
    ],
  },
});
assert.equal(separate.packages.length, 2);
assert.doesNotMatch(recordedReason, /客户同意定制单混装/);

console.log("Stock mixed packing checks passed: common goods accept one package with two lines, custom orders mix only with the customer's recorded agreement.");
