import assert from "node:assert/strict";
import {
  normalizeRawMaterialCostAllocationConfirmations,
  normalizeRawMaterialCostAllocationDrafts,
  normalizeRawMaterialCostLossCalibrations,
  normalizeRawMaterialOrderMarginReports,
  normalizeRawMaterialOrderMarginSnapshots,
} from "../server/rawMaterialCostMarginRecordNormalizer.mjs";

const [draft] = normalizeRawMaterialCostAllocationDrafts([
  {
    id: " DRAFT-1 ",
    consumptionRecordId: " CONS-1 ",
    issueRecordId: " ISS-1 ",
    unitPrice: "9",
    allocatedWeightKg: "30",
    allocationStatus: "",
    costEffect: "",
    marginEffect: "",
    lossCalibrationStatus: "",
    note: "  草稿  ",
  },
  { id: "DRAFT-MISSING-ISSUE", consumptionRecordId: "CONS-2" },
]);
assert.equal(draft.costAllocationDraftId, "DRAFT-1");
assert.equal(draft.unitPrice, 9);
assert.equal(draft.allocatedWeightKg, 30);
assert.equal(draft.allocationStatus, "草稿/待成本复核");
assert.equal(draft.costEffect, "draft_only");
assert.equal(draft.marginEffect, "none");
assert.equal(draft.lossCalibrationStatus, "待损耗校准");
assert.equal(draft.note, "草稿");
assert.equal(
  normalizeRawMaterialCostAllocationDrafts([{ id: "DRAFT-MISSING-ISSUE", consumptionRecordId: "CONS-2" }]).length,
  0,
);

const [confirmation] = normalizeRawMaterialCostAllocationConfirmations([
  {
    id: " CONFIRM-1 ",
    costAllocationDraftIds: [" DRAFT-1 ", ""],
    confirmedCostAmount: "270",
  },
]);
assert.deepEqual(confirmation.costAllocationDraftIds, ["DRAFT-1"]);
assert.equal(confirmation.confirmedCostAmount, 270);
assert.equal(confirmation.reviewStatus, "已复核/待损耗校准");
assert.equal(confirmation.costEffect, "confirmed_material_cost_snapshot");

const [calibration] = normalizeRawMaterialCostLossCalibrations([
  {
    id: " LOSS-1 ",
    costConfirmationIds: [" CONFIRM-1 "],
    expectedOutputQuantity: "1000",
    actualQualifiedOutputQuantity: "950",
  },
]);
assert.deepEqual(calibration.costConfirmationIds, ["CONFIRM-1"]);
assert.equal(calibration.expectedOutputQuantity, 1000);
assert.equal(calibration.actualQualifiedOutputQuantity, 950);
assert.equal(calibration.calibrationStatus, "已校准/待毛利确认");
assert.equal(calibration.marginEffect, "pending_margin_snapshot");

const [snapshot] = normalizeRawMaterialOrderMarginSnapshots([
  {
    id: " SNAPSHOT-1 ",
    lossCalibrationIds: [" LOSS-1 "],
    lineItems: [
      { orderLineId: " LINE-1 ", salesAmount: "900", materialCostAmount: "270", warnings: "ignored" },
      { orderLineId: "" },
    ],
    warnings: [" 待财务复核 ", ""],
  },
]);
assert.deepEqual(snapshot.lossCalibrationIds, ["LOSS-1"]);
assert.equal(snapshot.lineItems.length, 1);
assert.equal(snapshot.lineItems[0].orderLineId, "LINE-1");
assert.equal(snapshot.lineItems[0].salesAmount, 900);
assert.equal(snapshot.lineItems[0].marginStatus, "已生成/待财务复核");
assert.deepEqual(snapshot.warnings, ["待财务复核"]);

const [report] = normalizeRawMaterialOrderMarginReports([
  {
    id: " REPORT-1 ",
    marginSnapshotIds: [" SNAPSHOT-1 "],
    lineItems: [{ marginSnapshotId: " SNAPSHOT-1 ", orderLineId: " LINE-1 " }],
  },
]);
assert.deepEqual(report.marginSnapshotIds, ["SNAPSHOT-1"]);
assert.equal(report.lineItems[0].marginSnapshotId, "SNAPSHOT-1");
assert.equal(report.lineItems[0].marginStatus, "已财务复核/报表可用");
assert.equal(report.reviewStatus, "已财务复核/报表可用");
assert.equal(report.marginEffect, "reviewed_margin_report_snapshot");

console.log(
  "Raw-material cost/margin normalizers check passed: record schemas, defaults, numeric/text cleanup, and line filtering are covered.",
);
