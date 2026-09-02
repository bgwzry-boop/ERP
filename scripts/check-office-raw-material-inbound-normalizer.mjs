import assert from "node:assert/strict";
import { normalizeRawMaterialInbound } from "../src/services/officeRawMaterialInboundNormalizer.js";

const source = {
  id: "  RMI-NORMALIZE-001  ",
  supplierName: "  测试供应商  ",
  deliveryNoteNo: "  DN-001  ",
  ocrPageCount: "2",
  ocrImageWidth: "1280",
  ocrImageHeight: "720",
  ocrAngle: "90",
  ocrPages: [{ requestId: "  REQ-1  ", imageWidth: "640" }],
  sourceAttachmentId: "  ATT-1  ",
  sourceAttachmentIds: [],
  ocrReviewFields: [{ key: "  supplierName  ", label: "  供应商  ", confidence: "0.91" }],
  ocrLines: [{
    lineId: "  LINE-1  ",
    sourcePageIndex: "1",
    values: { quantity: "2" },
    reviewedFields: [{ key: "  quantity  ", recognizedValue: "2", value: "2" }],
    excludedRollIndices: [0, "1", -1, "bad"],
  }],
  rolls: [{ id: "  ROLL-1  ", supplierRollNo: "  SUP-1  ", weightKg: "18.5", leftoverWeightKg: "2.5" }],
  rawMaterialIssueRecords: [
    { issueRecordId: "  ISSUE-1  ", issuedWeightKg: "10", allocatedCostAmount: "25.5" },
    { issueRecordId: "   " },
  ],
  rawMaterialConsumptionRecords: [{ consumptionRecordId: "  CONSUME-1  ", partialConsumption: 1, consumedWeightKg: "8" }],
  rawMaterialLeftoverReturnRecords: [{ leftoverReturnRecordId: "  RETURN-1  ", leftoverWeightKg: "2" }],
  rawMaterialLeftoverReviewRecords: [{ leftoverReviewRecordId: "  REVIEW-1  ", reviewedWeightKg: "1.9" }],
  rawMaterialSplitRecords: [{ splitRecordId: "  SPLIT-1  ", sourceWeightKg: "18.5", issuedWeightKg: "10" }],
  rawMaterialCostAllocationDrafts: [{ costAllocationDraftId: "  COST-1  ", unitPrice: "2.5", allocatedCostAmount: "20" }],
  rawMaterialCostAllocationConfirmations: [{ costConfirmationId: "  CONFIRM-1  ", confirmedCount: "1", confirmedCostAmount: "20" }],
  rawMaterialCostLossCalibrations: [{ lossCalibrationId: "  LOSS-1  ", lossRatePercent: "3.5" }],
  rawMaterialOrderMarginSnapshots: [{
    marginSnapshotId: "  SNAP-1  ",
    totalSalesAmount: "100",
    lineItems: [
      { orderLineId: "  LINE-A  ", salesAmount: "100", materialCostAmount: "20" },
      { orderLineId: "   ", salesAmount: "999" },
    ],
  }],
  rawMaterialOrderMarginReports: [{
    marginReportId: "  REPORT-1  ",
    grossMarginRatePercent: "80",
    lineItems: [{ marginSnapshotId: "  SNAP-1  ", orderLineId: "  LINE-A  ", grossProfitAmount: "80" }],
  }],
};
const snapshot = structuredClone(source);
const normalized = normalizeRawMaterialInbound(source);

assert.deepEqual(source, snapshot, "normalization must not mutate the API payload");
assert.notEqual(normalized, source);
assert.equal(normalized.id, "RMI-NORMALIZE-001");
assert.equal(normalized.supplierName, "测试供应商");
assert.equal(normalized.ocrPageCount, 2);
assert.deepEqual(normalized.ocrPages, [
  { sourcePageIndex: 0, pageNumber: 1, angle: 90, imageWidth: 640, imageHeight: 720, requestId: "REQ-1" },
  { sourcePageIndex: 1, pageNumber: 2, angle: 90, imageWidth: 1280, imageHeight: 720, requestId: "" },
]);
assert.deepEqual(normalized.sourceAttachmentIds, ["ATT-1"]);
assert.equal(normalized.ocrReviewFields[0].confidence, 0.91);
assert.equal(normalized.ocrLines[0].sourcePageIndex, 1);
assert.deepEqual(normalized.ocrLines[0].recognizedValues, { quantity: "2" });
assert.deepEqual(normalized.ocrLines[0].excludedRollIndices, [0, 1]);
assert.equal(normalized.rolls[0].weightKg, 18.5);
assert.equal(normalized.rolls[0].leftoverWeightKg, 2.5);
assert.equal(normalized.rawMaterialIssueRecords.length, 1);
assert.equal(normalized.rawMaterialIssueRecords[0].allocatedCostAmount, 25.5);
assert.equal(normalized.rawMaterialConsumptionRecords[0].partialConsumption, true);
assert.equal(normalized.rawMaterialLeftoverReturnRecords[0].leftoverWeightKg, 2);
assert.equal(normalized.rawMaterialLeftoverReviewRecords[0].reviewedWeightKg, 1.9);
assert.equal(normalized.rawMaterialSplitRecords[0].issuedWeightKg, 10);
assert.equal(normalized.rawMaterialCostAllocationDrafts[0].unitPrice, 2.5);
assert.equal(normalized.rawMaterialCostAllocationConfirmations[0].confirmedCostAmount, 20);
assert.equal(normalized.rawMaterialCostLossCalibrations[0].lossRatePercent, 3.5);
assert.equal(normalized.rawMaterialOrderMarginSnapshots[0].lineItems.length, 1);
assert.equal(normalized.rawMaterialOrderMarginSnapshots[0].totalSalesAmount, 100);
assert.equal(normalized.rawMaterialOrderMarginReports[0].lineItems[0].grossProfitAmount, 80);

console.log("Office raw-material inbound normalizer check passed: OCR pages, roll traceability, cost, margin, filtering, and input immutability are covered.");
