import assert from "node:assert/strict";
import {
  normalizeRawMaterialConsumptionRecords,
  normalizeRawMaterialIssueRecords,
  normalizeRawMaterialLeftoverReturnRecords,
  normalizeRawMaterialLeftoverReviewRecords,
  normalizeRawMaterialSplitRecords,
} from "../server/rawMaterialTraceabilityRecordNormalizer.mjs";

const [issue] = normalizeRawMaterialIssueRecords([
  {
    id: " ISSUE-1 ",
    rollId: " ROLL-1 ",
    issuedWeightKg: "12.5",
    issuePurpose: "",
    issueMode: "",
    consumptionStatus: "",
    note: "  领料  ",
  },
]);
assert.equal(issue.issueRecordId, "ISSUE-1");
assert.equal(issue.rollId, "ROLL-1");
assert.equal(issue.issuedWeightKg, 12.5);
assert.equal(issue.issuePurpose, "生产领料");
assert.equal(issue.issueMode, "整卷/整件领料");
assert.equal(issue.consumptionStatus, "待生产消耗确认");
assert.equal(issue.note, "领料");
assert.equal(normalizeRawMaterialIssueRecords([{ id: "ISSUE-MISSING-ROLL" }]).length, 0);

const [consumption] = normalizeRawMaterialConsumptionRecords([
  {
    id: " CONSUME-1 ",
    rollId: " ROLL-1 ",
    consumedWeightKg: "4.2",
    partialConsumption: 1,
    consumptionStatus: "",
  },
]);
assert.equal(consumption.consumptionRecordId, "CONSUME-1");
assert.equal(consumption.consumedWeightKg, 4.2);
assert.equal(consumption.partialConsumption, true);
assert.equal(consumption.consumptionStatus, "已确认消耗");
assert.equal(normalizeRawMaterialConsumptionRecords([{ id: "CONSUME-MISSING-ROLL" }]).length, 0);

const [leftoverReturn] = normalizeRawMaterialLeftoverReturnRecords([
  {
    id: " RETURN-1 ",
    rollId: " ROLL-1 ",
    leftoverWeightKg: "2.3",
    returnLocation: "",
    returnReason: "",
    consumptionStatus: "",
  },
]);
assert.equal(leftoverReturn.leftoverReturnRecordId, "RETURN-1");
assert.equal(leftoverReturn.leftoverWeightKg, 2.3);
assert.equal(leftoverReturn.returnLocation, "余料区");
assert.equal(leftoverReturn.returnReason, "机边余料退回");
assert.equal(leftoverReturn.consumptionStatus, "已退回余料/待复核");

const [leftoverReview] = normalizeRawMaterialLeftoverReviewRecords([
  {
    id: " REVIEW-1 ",
    rollId: " ROLL-1 ",
    reviewedWeightKg: "2",
    reviewLocation: "",
    reviewStatus: "",
  },
]);
assert.equal(leftoverReview.leftoverReviewRecordId, "REVIEW-1");
assert.equal(leftoverReview.reviewedWeightKg, 2);
assert.equal(leftoverReview.reviewLocation, "原料库-余料可用区");
assert.equal(leftoverReview.reviewStatus, "复核通过/可用");

const [split] = normalizeRawMaterialSplitRecords([
  {
    id: " SPLIT-1 ",
    sourceRollId: " ROLL-1 ",
    issuedRollId: " SPLIT-ROLL-1 ",
    issuedWeightKg: "5.8",
    splitMode: "",
  },
]);
assert.equal(split.splitRecordId, "SPLIT-1");
assert.equal(split.sourceRollId, "ROLL-1");
assert.equal(split.issuedRollId, "SPLIT-ROLL-1");
assert.equal(split.issuedWeightKg, 5.8);
assert.equal(split.splitMode, "部分领料/拆卷");
assert.equal(
  normalizeRawMaterialSplitRecords([{ id: "SPLIT-MISSING-CHILD", sourceRollId: "ROLL-1" }]).length,
  0,
);

console.log(
  "Raw-material traceability normalizers check passed: record schemas, defaults, numeric/text cleanup, and filters are covered.",
);
