import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeRawMaterialInbound,
  resolveRawMaterialProductionTaskMatch,
} from "../server/rawMaterialInboundRecordService.mjs";

const repositorySource = readFileSync(new URL("../server/rawMaterialInboundRepository.mjs", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("../server/rawMaterialInboundRecordService.mjs", import.meta.url), "utf8");

assert.match(repositorySource, /from "\.\/rawMaterialInboundRecordService\.mjs"/);
assert.ok(repositorySource.split("\n").length <= 2_250, "repository should delegate inbound record normalization");
assert.ok(serviceSource.split("\n").length < 450, "inbound record service should stay independently reviewable");

const workspace = {
  productionTasks: [{ id: "TASK-1", machineId: "BAG-01", orderLineId: "LINE-1", plannedQty: 800 }],
  orderLines: [{ id: "LINE-1", productName: "无纺布袋", size: "30*38", bagColor: "白色", qty: 800 }],
};
const match = resolveRawMaterialProductionTaskMatch({
  workspace,
  inbound: { materialType: "无纺布", productName: "白色无纺布", factoryColor: "本白" },
  productionTaskId: "TASK-1",
  machineId: "制袋机-01",
});
assert.equal(match.status, "已匹配");
assert.equal(match.goodsSpec, "无纺布袋 30*38 白色 800个");
assert.throws(
  () => resolveRawMaterialProductionTaskMatch({ ...{ workspace }, inbound: { materialType: "无纺布", factoryColor: "黑色" }, productionTaskId: "TASK-1" }),
  /does not match production task bag color/,
);
assert.throws(
  () => resolveRawMaterialProductionTaskMatch({
    workspace: {
      productionTasks: [{ id: "TASK-WIDTH", machineId: "BAG-01", orderLineId: "LINE-WIDTH", plannedQty: 1000 }],
      orderLines: [{ id: "LINE-WIDTH", productName: "无纺布袋", size: "30*38*8", bagColor: "白色", qty: 1000 }],
    },
    inbound: { materialType: "无纺布", factoryColor: "白色", widthCm: 88 },
    productionTaskId: "TASK-WIDTH",
    machineId: "BAG-01",
  }),
  (error) => error.code === "RAW_MATERIAL_PRODUCTION_TASK_WIDTH_MISMATCH",
);
const fiveCentimeterHandleMatch = resolveRawMaterialProductionTaskMatch({
  workspace,
  inbound: { materialType: "无纺布", productName: "无纺布卷料", factoryColor: "白色", widthCm: 5 },
  productionTaskId: "TASK-1",
  machineId: "BAG-01",
});
assert.equal(fiveCentimeterHandleMatch.status, "需复核", "5cm material is handle raw material even if stale text still says nonwoven roll");

const normalized = normalizeRawMaterialInbound({
  id: " RMI-001 ",
  status: "已打印待贴标",
  nextStep: "把系统标签贴到对应卷料，手机扫码并上传签单信息后才可用。",
  signedNoteStatus: "待上传签单信息",
  ocrProvider: "tencent_cloud_table_v3",
  ocrReviewFields: [{ key: "supplierName", value: "供应商A" }],
  rolls: [{ id: "ROLL-1", weightKg: 12, signedNoteStatus: "待扫码/签单" }],
  rawMaterialIssueRecords: [{ id: "ISSUE-1", rollId: "ROLL-1" }],
});
assert.equal(normalized.id, "RMI-001");
assert.equal(normalized.rolls[0].inventoryStatus, "不可用");
assert.equal(normalized.rawMaterialIssueRecords[0].issueRecordId, "ISSUE-1");
assert.equal(normalized.ocrReviewFields[0].reviewStatus, "待人工复核");
assert.equal(normalized.nextStep, "把系统标签贴到对应卷料，逐卷人工核对重量、颜色、规格和库位后才可用。");
assert.equal(normalized.signedNoteStatus, "单据附件可选，未作为入库门禁");
assert.equal(normalized.rolls[0].signedNoteStatus, "入库无需逐卷扫码或签单");
assert.equal(
  normalizeRawMaterialInbound({ id: "RMI-002", nextStep: "确认后才能打印一卷一标，贴标扫码后才可用。" }).nextStep,
  "确认后才能打印一卷一标，逐卷人工贴标核对后才可用。",
);
assert.equal(
  normalizeRawMaterialInbound({ id: "RMI-003", signedNoteStatus: "待贴标扫码上传" }).signedNoteStatus,
  "单据附件可选，未作为入库门禁",
);

console.log("Raw-material inbound record service checks passed: production matching and persisted record normalization are isolated.");
