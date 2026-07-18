import assert from "node:assert/strict";
import {
  applyRawMaterialOcrLineReviews,
  buildRawMaterialOcrReviewedRolls,
  validateRawMaterialOcrLineReviewSummary,
} from "../shared/rawMaterialOcrLineReview.js";

const lines = [
  {
    lineId: "OCR-T1-R2",
    sourceText: "白色 90g*1.6米 2卷 103.5kg",
    values: {
      productName: "无纺布卷料",
      materialType: "无纺布",
      supplierColor: "白色",
      spec: "90g*1.6米",
      rollCount: 2,
      totalWeightKg: 103.5,
      unit: "kg",
      unitPrice: 10,
      amount: 1035,
      supplierRollNo: "BH-1",
      rollWeightsKg: [50, 53.5],
    },
  },
  {
    lineId: "OCR-T1-R3",
    sourceText: "天兰条 1卷 50kg 500元",
    values: {
      productName: "无纺布卷料",
      materialType: "无纺布",
      supplierColor: "天兰条",
      spec: "",
      rollCount: 1,
      totalWeightKg: 50,
      unit: "kg",
      unitPrice: 10,
      amount: 500,
      supplierRollNo: "BH-3",
      rollWeightsKg: [50],
    },
  },
];

const lineReviews = lines.map((line) => ({
  lineId: line.lineId,
  values: {
    ...line.values,
    ...(line.lineId === "OCR-T1-R3" ? { spec: "78*80*1300" } : {}),
  },
}));

const reviewedLines = applyRawMaterialOcrLineReviews({
  lines,
  lineReviews,
  operatorId: "U-OFFICE-A",
  operatorName: "办公室A",
  now: "2026-07-16T09:00:00.000Z",
});
assert.equal(reviewedLines[0].reviewStatus, "人工接受");
assert.equal(reviewedLines[1].reviewStatus, "人工修改");
assert.equal(reviewedLines[1].recognizedValues.spec, "");
assert.equal(reviewedLines[1].values.spec, "78*80*1300");
assert.deepEqual(
  [reviewedLines[1].values.gramWeightGsm, reviewedLines[1].values.widthCm, reviewedLines[1].values.lengthM],
  [78, 80, 1300],
);
assert.equal(reviewedLines[1].reviewedFields.find((field) => field.key === "spec").reviewStatus, "人工修改");

validateRawMaterialOcrLineReviewSummary({
  lines: reviewedLines,
  reviewValues: { rollCount: 3, totalWeightKg: 153.5, amount: 1535 },
});
const rolls = buildRawMaterialOcrReviewedRolls({
  inboundId: "RMI-OCR-1",
  existingRolls: [{ id: "RM-OCR-1-01", ocrLineId: "OCR-T1-R2", supplierRollNo: "原卷1" }],
  lines: reviewedLines,
});
assert.equal(rolls.length, 3);
assert.deepEqual(rolls.map((roll) => roll.weightKg), [50, 53.5, 50]);
assert.equal(rolls.every((roll) => roll.inventoryStatus === "不可用"), true);
assert.equal(rolls[0].id, "RM-OCR-1-01");
assert.equal(rolls[2].ocrLineId, "OCR-T1-R3");
assert.equal(rolls[2].specDisplay, "78克 × 80cm × 1300米");

assert.throws(
  () => applyRawMaterialOcrLineReviews({ lines, lineReviews: [lineReviews[0]] }),
  (error) => error.code === "RAW_MATERIAL_OCR_REVIEW_LINE_REQUIRED",
);
assert.throws(
  () => applyRawMaterialOcrLineReviews({
    lines,
    lineReviews: lineReviews.map((entry) => entry.lineId === "OCR-T1-R3"
      ? { ...entry, values: { ...entry.values, spec: "" } }
      : entry),
  }),
  (error) => error.code === "RAW_MATERIAL_OCR_REVIEW_LINE_REQUIRED_FIELDS_MISSING",
);
assert.throws(
  () => applyRawMaterialOcrLineReviews({
    lines,
    lineReviews: lineReviews.map((entry) => entry.lineId === "OCR-T1-R3"
      ? { ...entry, values: { ...entry.values, amount: "五百" } }
      : entry),
  }),
  (error) => error.code === "RAW_MATERIAL_OCR_REVIEW_LINE_NUMBER_INVALID",
);
assert.throws(
  () => validateRawMaterialOcrLineReviewSummary({
    lines: reviewedLines,
    reviewValues: { rollCount: 2, totalWeightKg: 153.5, amount: 1535 },
  }),
  (error) => error.code === "RAW_MATERIAL_OCR_REVIEW_LINE_ROLL_COUNT_MISMATCH",
);

console.log("Raw-material OCR line-review checks passed: all lines are explicit, original values are preserved, summaries reconcile, and rolls stay unavailable.");
