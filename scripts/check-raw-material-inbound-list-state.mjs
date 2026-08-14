import assert from "node:assert/strict";
import {
  buildRawMaterialInboundMetrics,
  buildRawMaterialInboundViewItems,
  canConfirmRawMaterialConsumptionRoll,
  canConfirmRawMaterialAttachment,
  canIssueRawMaterialRoll,
  canIssueRawMaterialToMachine,
  canPrintRawMaterialLabels,
  canReturnRawMaterialLeftoverRoll,
  canReviewRawMaterialInbound,
  canReviewRawMaterialLeftoverRoll,
  filterRawMaterialInboundsByKeyword,
  filterRawMaterialInboundsByTab,
  formatRawMaterialDeliveryNoteNo,
  formatSupplierPayableAmount,
  getRawMaterialNextActionLabel,
  getRawMaterialInboundSourceLabel,
  getRawMaterialInboundTone,
  getSupplierStatementReviewTone,
} from "../src/domain/rawMaterialInboundListState.js";

const inbounds = [
  {
    id: "RMI-1", supplierName: "白侯供应商", status: "已打印待贴标", materialType: "袋料",
    rolls: [{ id: "ROLL-1", inventoryStatus: "可用", labelStatus: "已贴标/可用库存" }, { id: "ROLL-2", inventoryStatus: "机边领用" }],
    rawMaterialSplitRecords: [{ splitRecordId: "SPLIT-1" }],
  },
  { id: "RMI-2", supplierName: "红色供应商", status: "已识别待复核", rolls: [{ id: "ROLL-3", inventoryStatus: "余料待复核" }] },
];
const metrics = buildRawMaterialInboundMetrics(inbounds);
assert.deepEqual(buildRawMaterialInboundViewItems(inbounds).map(({ key, count }) => [key, count]), [
  ["入库单", 2],
  ["待贴标", 1],
  ["机边领料", 2],
  ["供应商对账", 2],
]);
assert.deepEqual(metrics.find(([label]) => label === "待复核"), ["待复核", 1, "warning"]);
assert.deepEqual(metrics.find(([label]) => label === "可用卷/件"), ["可用卷/件", 1, "success"]);
assert.deepEqual(filterRawMaterialInboundsByTab(inbounds, "待贴标").map((item) => item.id), ["RMI-1"]);
assert.deepEqual(filterRawMaterialInboundsByTab(inbounds, "机边领料").map((item) => item.id), ["RMI-1", "RMI-2"]);
assert.deepEqual(filterRawMaterialInboundsByKeyword(inbounds, "白侯").map((item) => item.id), ["RMI-1"]);
assert.equal(canConfirmRawMaterialAttachment({ rolls: [{ labelStatus: "已打印待贴标", inventoryStatus: "待贴标" }] }), true);
assert.equal(canIssueRawMaterialToMachine(inbounds[0]), true);
assert.equal(canIssueRawMaterialRoll({ inventoryStatus: "可用", labelStatus: "已贴标/可用库存" }), true);
assert.equal(canIssueRawMaterialRoll({ inventoryStatus: "可用", labelStatus: "已打印待贴标" }), false);
assert.equal(canConfirmRawMaterialConsumptionRoll({ inventoryStatus: "机边领用" }), true);
assert.equal(canReturnRawMaterialLeftoverRoll({ inventoryStatus: "机边领用" }), true);
assert.equal(canReviewRawMaterialLeftoverRoll({ inventoryStatus: "余料待复核" }), true);
assert.equal(canPrintRawMaterialLabels({
  status: "已复核待打印标签",
  rolls: [{ id: "ROLL-PRINT-1", inventoryStatus: "不可用", weightKg: 106.2 }],
}), true);
assert.equal(canPrintRawMaterialLabels({
  status: "已复核待打印标签",
  rolls: [{ id: "ROLL-PRINT-2", inventoryStatus: "不可用", weightKg: 0 }],
}), false);
assert.equal(canReviewRawMaterialInbound(inbounds[1]), true);
assert.equal(getRawMaterialInboundTone("已消耗确认"), "success");
assert.equal(getSupplierStatementReviewTone("存在差异"), "danger");
assert.equal(getRawMaterialInboundSourceLabel({ source: "api", lastSyncedAt: "10:30" }), "后端 API 已同步 · 10:30");
assert.equal(getRawMaterialNextActionLabel({ status: "已识别待复核" }), "核对送货单");
assert.equal(getRawMaterialNextActionLabel({ status: "已打印待贴标" }), "贴标并核对");
assert.equal(getRawMaterialNextActionLabel({ status: "部分贴标" }), "继续贴标");
assert.equal(formatRawMaterialDeliveryNoteNo({ id: "RMI-1" }), "供应商未提供单号 / RMI-1");
assert.equal(formatSupplierPayableAmount(1234.5), "¥1,234.50");

console.log("raw-material inbound list-state checks passed");
