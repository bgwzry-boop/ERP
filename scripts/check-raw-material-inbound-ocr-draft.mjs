import assert from "node:assert/strict";
import {
  OCR_LINE_REVIEW_FIELDS,
  buildOcrLineReviewDraft,
  formatOcrLineRecognizedValue,
  isNumericOcrField,
  isNumericOcrLineField,
} from "../src/features/raw-materials/rawMaterialInboundOcrDraft.js";

assert.deepEqual(
  OCR_LINE_REVIEW_FIELDS.map(([key]) => key),
  [
    "productName",
    "materialType",
    "supplierColor",
    "returnMaterialCategory",
    "factoryColor",
    "spec",
    "rollCount",
    "totalWeightKg",
    "unit",
    "unitPrice",
    "amount",
    "supplierRollNo",
    "rollWeightsKg",
  ],
  "OCR line review should retain every editable business field in display order",
);

assert.deepEqual(buildOcrLineReviewDraft({
  values: {
    productName: "无纺布",
    rollCount: 2,
    totalWeightKg: 102.5,
    rollWeightsKg: [50.25, 52.25],
  },
}), {
  productName: "无纺布",
  materialType: "",
  supplierColor: "",
  returnMaterialCategory: "",
  factoryColor: "",
  spec: "",
  rollCount: 2,
  totalWeightKg: 102.5,
  unit: "",
  unitPrice: "",
  amount: "",
  supplierRollNo: "",
  rollWeightsKg: "50.25, 52.25",
}, "OCR line draft should preserve recognized values, fill absent fields and expose roll weights for editing");

for (const key of ["rollCount", "totalWeightKg", "unitPrice", "amount"]) {
  assert.equal(isNumericOcrField(key), true, `${key} should use a numeric document field`);
  assert.equal(isNumericOcrLineField(key), true, `${key} should use a numeric line field`);
}
for (const key of ["productName", "factoryColor", "rollWeightsKg"]) {
  assert.equal(isNumericOcrField(key), false, `${key} should not use a numeric document field`);
  assert.equal(isNumericOcrLineField(key), false, `${key} should not use a numeric line field`);
}

assert.equal(formatOcrLineRecognizedValue([50.25, 52.25]), "50.25, 52.25");
assert.equal(formatOcrLineRecognizedValue([]), "未识别");
assert.equal(formatOcrLineRecognizedValue("  宝兰  "), "宝兰");
assert.equal(formatOcrLineRecognizedValue(null), "未识别");
assert.equal(buildOcrLineReviewDraft({ values: { supplierColor: "彩色" } }, "supplier_return").returnMaterialCategory, "彩布");
assert.equal(buildOcrLineReviewDraft({ values: { returnMaterialCategory: "黑白布" } }, "supplier_return").returnMaterialCategory, "黑白布");

console.log("raw-material inbound OCR draft check passed");
