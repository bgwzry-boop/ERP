import assert from "node:assert/strict";
import fs from "node:fs";
import { createOfficeRawMaterialActions } from "../src/app/createOfficeRawMaterialActions.js";
import {
  applyRawMaterialInboundLocalAction,
  buildRawMaterialInboundToastText,
} from "../src/domain/rawMaterialInboundLocalActions.js";

const baseInbound = {
  id: "RMI-1",
  supplierName: "测试供应商",
  deliveryNoteNo: "",
  materialType: "无纺布",
  productName: "白色袋料",
  spec: "80g",
  factoryColor: "白色",
  unit: "kg",
  status: "已贴标入库/可用",
  rolls: [
    {
      id: "ROLL-1",
      supplierRollNo: "SUP-1",
      weightKg: 100,
      labelStatus: "已贴标入库/可用",
      inventoryStatus: "可用",
      location: "原料库-可用区",
    },
  ],
};

function createHarness({ allowLocalFallback, api = {}, guard = true } = {}) {
  let rawMaterialInbounds = [structuredClone(baseInbound)];
  let rawMaterialInboundMeta = { source: "api", error: "" };
  let supplierReviews = [{ reviewId: "RMSR-1", status: "待复核" }];
  let supplierReviewMeta = { source: "api", total: 1, error: "" };
  let selectedInboundId = "RMI-1";
  let toast = "";
  const rawMaterialInboundsRef = { current: rawMaterialInbounds };
  const rawMaterialSupplierStatementReviewsRef = { current: supplierReviews };
  const calls = [];

  const setRawMaterialInbounds = (value) => {
    rawMaterialInbounds = typeof value === "function" ? value(rawMaterialInbounds) : value;
    rawMaterialInboundsRef.current = rawMaterialInbounds;
  };
  const setRawMaterialSupplierStatementReviews = (value) => {
    supplierReviews = typeof value === "function" ? value(supplierReviews) : value;
    rawMaterialSupplierStatementReviewsRef.current = supplierReviews;
  };
  const actions = createOfficeRawMaterialActions({
    allowLocalFallback,
    api,
    authState: { session: { accessToken: "runtime-token" } },
    customers: [{ id: "C-1", name: "测试客户" }],
    currentUser: { displayName: "库房A" },
    currentUserId: "U-WAREHOUSE-A",
    guardUiAction: (surface, action) => {
      calls.push(["guard", surface, action]);
      return guard;
    },
    now: () => "2026-07-12T08:00:00.000Z",
    nowTimeLabel: () => "16:00",
    orderLines: [],
    rawMaterialInboundsRef,
    rawMaterialSupplierStatementReviewsRef,
    setRawMaterialInboundMeta: (value) => {
      rawMaterialInboundMeta = typeof value === "function" ? value(rawMaterialInboundMeta) : value;
    },
    setRawMaterialInbounds,
    setRawMaterialSupplierStatementReviewMeta: (value) => {
      supplierReviewMeta = typeof value === "function" ? value(supplierReviewMeta) : value;
    },
    setRawMaterialSupplierStatementReviews,
    setSelectedRawMaterialInboundId: (value) => { selectedInboundId = value; },
    setToast: (value) => { toast = value; },
  });

  return {
    actions,
    calls,
    get rawMaterialInboundMeta() { return rawMaterialInboundMeta; },
    get rawMaterialInbounds() { return rawMaterialInbounds; },
    get selectedInboundId() { return selectedInboundId; },
    get supplierReviewMeta() { return supplierReviewMeta; },
    get supplierReviews() { return supplierReviews; },
    get toast() { return toast; },
  };
}

assert.equal(
  buildRawMaterialInboundToastText("打印卷标", baseInbound),
  "已打印 RMI-1（供应商未提供单号） 的卷标；打印只是待贴标状态，不能直接作为可用库存。",
);

{
  const reviewed = applyRawMaterialInboundLocalAction([baseInbound], {
    action: "复核送货单",
    inboundId: "RMI-1",
    now: "2026-07-12T08:00:00.000Z",
    operatorName: "库房A",
  }).updatedItem;
  assert.equal(reviewed.status, "已复核待打印标签");
  assert.equal(reviewed.rolls[0].inventoryStatus, "可用", "review must not downgrade already available inventory");
}

{
  const issued = applyRawMaterialInboundLocalAction([baseInbound], {
    action: "机边领料",
    inboundId: "RMI-1",
    now: "2026-07-12T08:00:00.000Z",
    operatorName: "车间A",
    options: {
      rollId: "ROLL-1",
      machineId: "BAG-01",
      issuedWeightKg: 30,
      partialIssue: true,
    },
  }).updatedItem;
  assert.equal(issued.rolls.length, 2);
  assert.equal(issued.rolls.find((roll) => roll.id === "ROLL-1").weightKg, 70);
  const machineRoll = issued.rolls.find((roll) => roll.parentRollId === "ROLL-1");
  assert.equal(machineRoll.weightKg, 30);
  assert.equal(machineRoll.inventoryStatus, "机边领用");
  assert.equal(issued.rawMaterialSplitRecords.length, 1);
  assert.equal(issued.rawMaterialIssueRecords[0].consumptionStatus, "待生产消耗确认");
  assert.equal(issued.qualifiedOutputQuantity, undefined, "machine issue must not create qualified output");

  const partiallyConsumed = applyRawMaterialInboundLocalAction([issued], {
    action: "确认消耗",
    inboundId: "RMI-1",
    now: "2026-07-12T09:00:00.000Z",
    operatorName: "车间A",
    options: { rollId: machineRoll.id, consumedWeightKg: 10, partialConsumption: true },
  }).updatedItem;
  assert.equal(partiallyConsumed.rolls.find((roll) => roll.id === machineRoll.id).weightKg, 20);
  assert.equal(partiallyConsumed.rolls.find((roll) => roll.id === machineRoll.id).inventoryStatus, "机边领用");
  assert.equal(partiallyConsumed.rawMaterialConsumptionRecords[0].remainingMachineSideWeightKg, 20);

  const returned = applyRawMaterialInboundLocalAction([partiallyConsumed], {
    action: "余料退回",
    inboundId: "RMI-1",
    now: "2026-07-12T10:00:00.000Z",
    operatorName: "车间A",
    options: { rollId: machineRoll.id, leftoverWeightKg: 20, returnLocation: "余料区" },
  }).updatedItem;
  assert.equal(returned.rolls.find((roll) => roll.id === machineRoll.id).inventoryStatus, "余料待复核");

  const availableAgain = applyRawMaterialInboundLocalAction([returned], {
    action: "复核余料可用",
    inboundId: "RMI-1",
    now: "2026-07-12T11:00:00.000Z",
    operatorName: "库房A",
    options: { rollId: machineRoll.id, reviewedWeightKg: 19.5, reviewLocation: "原料库-余料可用区" },
  }).updatedItem;
  assert.equal(availableAgain.rolls.find((roll) => roll.id === machineRoll.id).inventoryStatus, "可用");
  assert.equal(availableAgain.rolls.find((roll) => roll.id === machineRoll.id).weightKg, 19.5);
  assert.equal(availableAgain.rawMaterialLeftoverReviewRecords.length, 1);
}

{
  const before = structuredClone(baseInbound);
  const harness = createHarness({
    allowLocalFallback: false,
    api: {
      updateOfficeRawMaterialInboundAction: async () => ({
        source: "api_error",
        blocked: true,
        error: { code: "RAW_MATERIAL_API_UNAVAILABLE", message: "后端不可用" },
      }),
    },
  });
  const result = await harness.actions.updateRawMaterialInbound("打印卷标", "RMI-1");
  assert.equal(result, null);
  assert.deepEqual(harness.rawMaterialInbounds[0], before, "formal mode must not mutate the local projection after API failure");
  assert.equal(harness.rawMaterialInboundMeta.source, "api_error");
  assert.match(harness.toast, /生产\/正式后端模式禁止本地降级/);
}

{
  const harness = createHarness({
    allowLocalFallback: true,
    api: {
      updateOfficeRawMaterialInboundAction: async () => ({
        source: "api_error",
        blocked: true,
        error: { message: "演示 API 不可用" },
      }),
    },
  });
  const result = await harness.actions.updateRawMaterialInbound("打印卷标", "RMI-1");
  assert.equal(result.status, "已打印待贴标");
  assert.equal(harness.rawMaterialInbounds[0].rolls[0].inventoryStatus, "可用");
  assert.equal(harness.rawMaterialInboundMeta.source, "local_fallback");
}

{
  const committedInbound = { ...baseInbound, status: "已复核待打印标签", reviewedBy: "API" };
  let receivedInput;
  const harness = createHarness({
    allowLocalFallback: false,
    api: {
      updateOfficeRawMaterialInboundAction: async (input) => {
        receivedInput = input;
        return { source: "api", blocked: false, inbound: committedInbound };
      },
    },
  });
  const result = await harness.actions.updateRawMaterialInbound("复核送货单", "RMI-1", { note: "已核对" });
  assert.equal(result, committedInbound);
  assert.equal(receivedInput.operatorId, "U-WAREHOUSE-A");
  assert.equal(receivedInput.operatorName, "库房A");
  assert.equal(receivedInput.note, "已核对");
  assert.equal(harness.rawMaterialInbounds[0], committedInbound);
  assert.equal(harness.rawMaterialInboundMeta.source, "api");
}

{
  const harness = createHarness({
    allowLocalFallback: true,
    api: {
      updateOfficeRawMaterialInboundAction: async () => ({
        source: "api_error",
        blocked: true,
        error: { status: 403, requiredPermission: "raw_material.label.print", message: "权限不足" },
      }),
    },
  });
  await harness.actions.updateRawMaterialInbound("打印卷标", "RMI-1");
  assert.equal(harness.rawMaterialInbounds[0].status, baseInbound.status, "permission denial must never use demo fallback");
  assert.match(harness.toast, /缺少权限 raw_material\.label\.print/);
}

const supplierActionCases = [
  ["confirmRawMaterialSupplierStatementReviewDraft", "confirmOfficeRawMaterialSupplierStatementReview", "复核送货单"],
  ["confirmRawMaterialSupplierStatement", "confirmOfficeRawMaterialSupplierStatement", "复核送货单"],
  ["generateRawMaterialSupplierPayableDraft", "generateOfficeRawMaterialSupplierPayableDraft", "生成应付"],
  ["confirmRawMaterialSupplierPayment", "confirmOfficeRawMaterialSupplierPayment", "确认付款"],
];

for (const [actionName, apiName, guardAction] of supplierActionCases) {
  let callCount = 0;
  const review = {
    reviewId: "RMSR-1",
    status: "已确认",
    supplierPayableId: "RMP-1",
    supplierPayableDraft: { payableAmount: 100 },
    supplierPaymentConfirmationId: "RMPAY-1",
    supplierPaymentRecord: { paidAmount: 100 },
  };
  const harness = createHarness({
    allowLocalFallback: false,
    api: {
      [apiName]: async () => {
        callCount += 1;
        return { source: "api", blocked: false, review };
      },
    },
  });
  const result = await harness.actions[actionName]("RMSR-1", {});
  assert.equal(callCount, 1, `${actionName} must call ${apiName}`);
  assert.equal(result, review);
  assert.equal(harness.supplierReviews[0], review);
  assert.deepEqual(harness.calls[0], ["guard", "rawMaterial", guardAction]);
}

{
  const review = { reviewId: "RMSR-2", status: "待复核" };
  const harness = createHarness({
    allowLocalFallback: false,
    api: {
      createOfficeRawMaterialSupplierStatementReviewDraft: async (input) => ({
        source: "api",
        blocked: false,
        review: { ...review, sourceFileName: input.fileName },
      }),
    },
  });
  const result = await harness.actions.saveRawMaterialSupplierStatementReviewDraft(
    { supplierName: "测试供应商" },
    { fileName: "statement.xlsx" },
  );
  assert.equal(result.reviewId, "RMSR-2");
  assert.equal(harness.supplierReviews[0].sourceFileName, "statement.xlsx");
  assert.equal(harness.supplierReviewMeta.source, "api");
  assert.match(harness.toast, /仍不写库存、不生成应付、不确认付款/);
}

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const controllerSource = fs.readFileSync(new URL("../src/app/createOfficeRawMaterialActions.js", import.meta.url), "utf8");
assert.match(appSource, /createOfficeRawMaterialActions\(\{/);
assert.match(appSource, /allowLocalFallback: !runtimeServerRequired/);
assert.doesNotMatch(appSource, /function applyRawMaterialInboundLocalAction/);
assert.doesNotMatch(appSource, /updateOfficeRawMaterialInboundAction/);
assert.ok(appSource.split("\n").length < 4_000, "App.jsx should meet the B6.5 intermediate ceiling");
assert.match(controllerSource, /if \(!allowLocalFallback\)/);
assert.match(controllerSource, /生产\/正式后端模式禁止本地降级/);

console.log("Office raw-material action checks passed: local traceability, API wiring, permissions, and formal-mode fail-closed behavior are isolated.");
