import assert from "node:assert/strict";
import {
  applyRawMaterialOcrLineReviews,
  buildRawMaterialOcrReviewedRolls,
  hasReviewableRawMaterialSpec,
  projectRawMaterialOcrPhysicalRollReviewRows,
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
      factoryColor: "本白",
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
      factoryColor: "天兰",
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
  values: { ...line.values },
}));

const reviewRows = projectRawMaterialOcrPhysicalRollReviewRows({ lines });
assert.equal(reviewRows.length, 3, "the phone review projection should render one row per physical roll");
assert.deepEqual(reviewRows.map((roll) => roll.weightKg), [50, 53.5, 50]);
assert.deepEqual(reviewRows.slice(0, 2).map((roll) => roll.lineId), ["OCR-T1-R2", "OCR-T1-R2"]);
assert.deepEqual(reviewRows.slice(0, 2).map((roll) => roll.lineRollIndex), [0, 1]);
assert.equal(reviewRows.some((roll) => roll.weightKg === 103.5), false, "a source-line total must never become a physical-roll row weight");
assert.equal(hasReviewableRawMaterialSpec("426928.4"), false, "a lone footer number must not become a reviewable material specification");
assert.equal(hasReviewableRawMaterialSpec("78*5*1500"), true);

const reviewedLines = applyRawMaterialOcrLineReviews({
  lines,
  lineReviews,
  operatorId: "U-OFFICE-A",
  operatorName: "办公室A",
  now: "2026-07-16T09:00:00.000Z",
});
assert.equal(reviewedLines[0].reviewStatus, "人工接受");
assert.equal(reviewedLines[1].reviewStatus, "人工接受");
assert.equal(reviewedLines[1].recognizedValues.spec, "78*5");
assert.equal(reviewedLines[1].values.spec, "78*5");
assert.deepEqual(
  [reviewedLines[1].values.gramWeightGsm, reviewedLines[1].values.widthCm, reviewedLines[1].values.lengthM],
  [78, 5, 0],
);
assert.equal(reviewedLines[1].recognizedValues.materialCategory, "提手条");
assert.equal(reviewedLines[1].recognizedValues.supplierColor, "天兰");
assert.equal(reviewedLines[1].recognizedValues.gramWeightGsm, 78, "天兰条 applies the fixed handle-strip GSM");
assert.equal(reviewedLines[1].recognizedValues.widthCm, 5, "天兰条 applies the fixed handle-strip width");
assert.equal(reviewedLines[1].recognizedValues.lengthM, 0, "天兰条 keeps an omitted meter length absent without blocking review");
assert.equal(reviewedLines[1].values.materialCategory, "提手条");
assert.equal(reviewedLines[1].values.materialType, "提手");
assert.equal(reviewedLines[1].values.productName, "提手条");
assert.equal(reviewedLines[1].values.supplierColor, "天兰");
assert.equal(reviewedLines[1].values.factoryColor, "天兰");
assert.equal(reviewedLines[1].reviewedFields.find((field) => field.key === "spec").reviewStatus, "人工接受");

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
assert.equal(rolls[2].specDisplay, "78克 × 5cm");
assert.equal(rolls[2].materialCategory, "提手条");

const falsePositiveLine = {
  lineId: "OCR-T1-FOOTER",
  sourceText: "426928.4",
  values: {
      productName: "",
      materialType: "",
      supplierColor: "",
      factoryColor: "",
    spec: "426928.4",
    rollCount: 0,
    totalWeightKg: 0,
    unit: "",
    unitPrice: 0,
    amount: 0,
    supplierRollNo: "",
    rollWeightsKg: [],
  },
};
const reviewedWithExclusion = applyRawMaterialOcrLineReviews({
  lines: [...lines, falsePositiveLine],
  lineReviews: [
    ...lineReviews,
    {
      lineId: falsePositiveLine.lineId,
      values: falsePositiveLine.values,
      excludedRollIndices: [0],
      exclusionReason: "OCR误识别；原送货单和现场实物均无此卷。",
    },
  ],
  operatorId: "U-OFFICE-A",
  operatorName: "办公室A",
  now: "2026-08-02T09:00:00.000Z",
});
assert.equal(reviewedWithExclusion[2].reviewStatus, "人工排除");
assert.equal(reviewedWithExclusion[2].reviewDisposition, "excluded_not_material");
assert.deepEqual(reviewedWithExclusion[2].excludedRollIndices, [0]);
assert.equal(reviewedWithExclusion[2].excludedByUserId, "U-OFFICE-A");
validateRawMaterialOcrLineReviewSummary({
  lines: reviewedWithExclusion,
  reviewValues: { rollCount: 3, totalWeightKg: 153.5, amount: 1535 },
});
assert.equal(
  buildRawMaterialOcrReviewedRolls({ inboundId: "RMI-OCR-EXCLUSION", lines: reviewedWithExclusion }).length,
  3,
  "an audited OCR exclusion must not create a roll or label candidate",
);
assert.throws(
  () => applyRawMaterialOcrLineReviews({
    lines: [falsePositiveLine],
    lineReviews: [{ lineId: falsePositiveLine.lineId, values: falsePositiveLine.values, excludedRollIndices: [0] }],
  }),
  (error) => error.code === "RAW_MATERIAL_OCR_REVIEW_EXCLUSION_REASON_REQUIRED",
  "audited exclusions require an explicit reason",
);

const singleRollUsingLineWeight = applyRawMaterialOcrLineReviews({
  lines: [{
    ...lines[1],
    values: { ...lines[1].values, rollWeightsKg: [] },
  }],
  lineReviews: [{
    lineId: lines[1].lineId,
    values: { ...lines[1].values, spec: "78*5*1300", rollWeightsKg: [] },
  }],
});
assert.deepEqual(
  buildRawMaterialOcrReviewedRolls({ inboundId: "RMI-OCR-SINGLE", lines: singleRollUsingLineWeight })
    .map((roll) => roll.weightKg),
  [50],
  "a one-roll line may use its own line weight as the physical-roll weight",
);

for (const incompleteRollWeights of [[], [50]]) {
  assert.throws(
    () => applyRawMaterialOcrLineReviews({
      lines,
      lineReviews: lineReviews.map((entry) => entry.lineId === "OCR-T1-R2"
        ? { ...entry, values: { ...entry.values, rollWeightsKg: incompleteRollWeights } }
        : entry),
    }),
    (error) => error.code === "RAW_MATERIAL_OCR_REVIEW_LINE_WEIGHT_COUNT_MISMATCH",
    "a multi-roll line must be blocked until every physical-roll weight is present",
  );
}
assert.throws(
  () => buildRawMaterialOcrReviewedRolls({
    inboundId: "RMI-OCR-NO-AVERAGE",
    lines: [{
      ...reviewedLines[0],
      values: { ...reviewedLines[0].values, rollWeightsKg: [] },
    }],
  }),
  (error) => error.code === "RAW_MATERIAL_OCR_REVIEW_LINE_WEIGHT_COUNT_MISMATCH",
  "roll creation must never silently divide a line total across several physical rolls",
);

assert.throws(
  () => applyRawMaterialOcrLineReviews({ lines, lineReviews: [lineReviews[0]] }),
  (error) => error.code === "RAW_MATERIAL_OCR_REVIEW_LINE_REQUIRED",
);
assert.throws(
  () => applyRawMaterialOcrLineReviews({
    lines,
    lineReviews: lineReviews.map((entry) => entry.lineId === "OCR-T1-R3"
      ? { ...entry, values: { ...entry.values, factoryColor: "待确认" } }
      : entry),
  }),
  (error) => error.code === "RAW_MATERIAL_OCR_REVIEW_LINE_REQUIRED_FIELDS_MISSING",
  "each physical material line requires a human-confirmed canonical factory color",
);

assert.throws(
  () => applyRawMaterialOcrLineReviews({
    lines,
    lineReviews: lineReviews.map((entry) => entry.lineId === "OCR-T1-R3"
      ? { ...entry, values: { ...entry.values, unitPrice: 0 } }
      : entry),
  }),
  (error) => error.code === "RAW_MATERIAL_OCR_REVIEW_LINE_UNIT_PRICE_REQUIRED",
  "unit price must be positive",
);
assert.throws(
  () => applyRawMaterialOcrLineReviews({
    lines,
    lineReviews: lineReviews.map((entry) => entry.lineId === "OCR-T1-R3"
      ? { ...entry, values: { ...entry.values, amount: 499 } }
      : entry),
  }),
  (error) => error.code === "RAW_MATERIAL_OCR_REVIEW_LINE_AMOUNT_CALCULATION_MISMATCH",
  "weight multiplied by unit price must reconcile to the row amount",
);
const stripWithoutMeters = applyRawMaterialOcrLineReviews({
  lines,
  lineReviews: lineReviews.map((entry) => entry.lineId === "OCR-T1-R3"
    ? { ...entry, values: { ...entry.values, spec: "条" } }
    : entry),
});
const stripWithoutMetersLine = stripWithoutMeters.find((line) => line.lineId === "OCR-T1-R3");
assert.equal(stripWithoutMetersLine.values.spec, "78*5");
assert.equal(stripWithoutMetersLine.values.gramWeightGsm, 78);
assert.equal(stripWithoutMetersLine.values.widthCm, 5);
assert.equal(stripWithoutMetersLine.values.lengthM, 0);
assert.equal(stripWithoutMetersLine.values.specNeedsReview, false);
const stripWithBlankSpec = applyRawMaterialOcrLineReviews({
  lines,
  lineReviews: lineReviews.map((entry) => entry.lineId === "OCR-T1-R3"
    ? { ...entry, values: { ...entry.values, spec: "" } }
    : entry),
});
const stripWithBlankSpecLine = stripWithBlankSpec.find((line) => line.lineId === "OCR-T1-R3");
assert.equal(stripWithBlankSpecLine.values.spec, "78*5", "a confirmed strip identity carries the fixed GSM/width even if the supplier leaves specification blank");
assert.equal(stripWithBlankSpecLine.values.lengthM, 0, "missing strip meters stay absent and do not block review");
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
assert.throws(
  () => applyRawMaterialOcrLineReviews({
    lines: [{
      ...lines[1],
      lineId: "OCR-T1-MISSING-WEIGHT",
      values: { ...lines[1].values, totalWeightKg: 0, rollWeightsKg: [] },
    }],
    lineReviews: [{
      lineId: "OCR-T1-MISSING-WEIGHT",
      values: { ...lineReviews[1].values, totalWeightKg: 0, rollWeightsKg: [] },
    }],
  }),
  (error) => error.code === "RAW_MATERIAL_OCR_REVIEW_ROLL_WEIGHT_REQUIRED",
  "a single physical roll without its own weight must remain blocked",
);

const returnLines = [{
  lineId: "OCR-RETURN-1",
  sourceText: "退带色布 | 2 | -4.2 | -24.2 | -28.4 | 9.6 | -272.64",
  values: {
    productName: "退带色布",
    materialType: "无纺布",
    supplierColor: "带色",
    spec: "",
    rollCount: 2,
    totalWeightKg: -28.4,
    unit: "kg",
    unitPrice: 9.6,
    amount: -272.64,
    supplierRollNo: "",
    rollWeightsKg: [-4.2, -24.2],
  },
}];
const returnReviewRows = projectRawMaterialOcrPhysicalRollReviewRows({
  lines: returnLines,
  documentDirection: "supplier_return",
});
assert.deepEqual(returnReviewRows.map((row) => row.weightKg), [-4.2, -24.2], "return review projections must preserve signed physical weights");
const reviewedReturnLines = applyRawMaterialOcrLineReviews({
  lines: returnLines,
  lineReviews: returnLines.map((line) => ({ lineId: line.lineId, values: { ...line.values } })),
  documentDirection: "supplier_return",
  operatorId: "U-OFFICE-A",
  operatorName: "办公室A",
  now: "2026-08-03T12:00:00.000Z",
});
assert.equal(reviewedReturnLines[0].values.spec, "", "a supplier return without a printed specification must not be forced to invent one");
assert.equal(reviewedReturnLines[0].values.totalWeightKg, -28.4);
assert.deepEqual(reviewedReturnLines[0].values.rollWeightsKg, [-4.2, -24.2]);
validateRawMaterialOcrLineReviewSummary({
  lines: reviewedReturnLines,
  reviewValues: { rollCount: 2, totalWeightKg: -28.4, amount: -272.64 },
  documentDirection: "supplier_return",
});
validateRawMaterialOcrLineReviewSummary({
  lines: reviewedReturnLines,
  reviewValues: { rollCount: 2, totalWeightKg: -28.4, amount: -9999 },
  documentDirection: "supplier_return",
  amountReferenceOnly: true,
});
assert.deepEqual(
  buildRawMaterialOcrReviewedRolls({
    inboundId: "RMI-OCR-RETURN",
    lines: reviewedReturnLines,
    documentDirection: "supplier_return",
  }),
  [],
  "a reviewed return must never create inbound roll or label candidates",
);

console.log("Raw-material OCR line-review checks passed: all lines are explicit, original values are preserved, summaries reconcile, and rolls stay unavailable.");
