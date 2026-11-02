import assert from "node:assert/strict";
import { applyRawMaterialInboundAction } from "../server/services/rawMaterialInboundCommandService.mjs";
import { applyRawMaterialInboundLocalAction } from "../src/domain/rawMaterialInboundLocalActions.js";
import { initialRawMaterialInbounds } from "../src/data/fixtures.js";

const now = "2026-11-02T10:00:00.000Z";
const operator = { operatorId: "REVIEWER", operatorName: "复核员" };
const manual = {
  id: "RMI-MANUAL", revision: 3, status: "已识别待复核", ocrProvider: "legacy_manual",
  documentDirection: "supplier_delivery", supplierName: "手工单供应商", materialType: "布料",
  spec: "78*90*1500", unit: "kg", rollCount: 2, totalWeightKg: 30,
  sourceAttachmentId: "ORIGINAL-KEPT", ocrRawText: "", ocrLines: [],
  rolls: [
    { id: "LEGACY-001", supplierColor: "海兰", factoryColor: "", weightKg: 10, widthCm: 90, inventoryStatus: "不可用", labelStatus: "待生成标签" },
    { id: "LEGACY-002", supplierColor: "本白", factoryColor: "白色", weightKg: 20, widthCm: 90, inventoryStatus: "不可用", labelStatus: "待生成标签" },
  ],
};

function serverReview(before, body = {}) {
  return applyRawMaterialInboundAction({
    inbounds: [before], inboundId: before.id, action: "review", ...operator, serverNow: now,
    body: { expectedRevision: before.revision ?? 1, ...body },
  });
}
function localReview(before, options = {}) {
  return applyRawMaterialInboundLocalAction([before], {
    action: "复核送货单", inboundId: before.id, options, ...operator, now,
  }).updatedItem;
}
function rejectedByBoth(before, body, code) {
  const snapshot = structuredClone(before);
  for (const review of [serverReview, localReview]) assert.throws(() => review(before, body), (error) => error.code === code, `${code} must guard both review paths`);
  assert.deepEqual(before, snapshot, "a rejected review must not mutate source facts");
}

const result = serverReview(manual);
const local = localReview(manual);
assert.equal(result.inbound.status, "已复核待打印标签");
assert.equal(result.inbound.revision, 4);
assert.equal(result.inbound.reviewedByUserId, "REVIEWER");
assert.equal(result.inbound.sourceAttachmentId, "ORIGINAL-KEPT");
assert.deepEqual(result.inbound.rolls.map((roll) => roll.id), ["LEGACY-001", "LEGACY-002"], "manual trace identities must not be regenerated");
assert.equal(result.inbound.rolls[0].factoryColor, "", "supplier-only color is never invented as factory color");
assert.equal(result.inbound.rolls[0].factoryColorMappingStatus, "supplier_provisional");
assert.equal(result.inbound.rolls[0].inventoryStatus, "不可用");
assert.equal(result.inbound.ocrLines.length, 0, "manual review must not fabricate OCR rows");
assert.equal(result.inbound.unitPrice, 0, "manual review does not require invented OCR pricing");
assert.equal(result.operationLog.operatorId, "REVIEWER");
assert.equal(local.status, result.inbound.status);
assert.equal(local.rolls[0].factoryColorMappingStatus, "supplier_provisional");

for (const [patch, code] of [
  [{ supplierName: "" }, "RAW_MATERIAL_INBOUND_REVIEW_SUPPLIER_REQUIRED"],
  [{ rollCount: 3 }, "RAW_MATERIAL_INBOUND_REVIEW_ROLL_COUNT_MISMATCH"],
  [{ totalWeightKg: 0 }, "RAW_MATERIAL_INBOUND_REVIEW_WEIGHT_REQUIRED"],
  [{ totalWeightKg: 45 }, "RAW_MATERIAL_INBOUND_REVIEW_WEIGHT_MISMATCH"],
  [{ status: "已作废" }, "RAW_MATERIAL_OCR_REVIEW_NOT_ALLOWED"],
  [{ status: "已复核待打印标签" }, "RAW_MATERIAL_OCR_REVIEW_NOT_ALLOWED"],
]) rejectedByBoth({ ...manual, ...patch }, {}, code);
for (const patch of [{ supplierColor: "", factoryColor: "" }, { factoryColor: "梦幻紫" }, { weightKg: 0 }, { widthCm: 0, spec: "待核实" }]) {
  const before = { ...manual, spec: "待核实", rolls: manual.rolls.map((roll, index) => index === 0 ? { ...roll, ...patch } : roll) };
  rejectedByBoth(before, {}, "RAW_MATERIAL_INBOUND_REVIEW_ROLL_REQUIRED_FIELDS_MISSING");
}
rejectedByBoth({ ...manual, rolls: manual.rolls.map((roll) => ({ ...roll, inventoryStatus: "可用" })) }, {}, "RAW_MATERIAL_OCR_REVIEW_NOT_ALLOWED");
rejectedByBoth({ ...manual, ocrRawText: "销售退货单\n彩布 -30公斤" }, {}, "RAW_MATERIAL_DOCUMENT_DIRECTION_CONFLICT");
const manualReturn = { ...manual, documentDirection: "supplier_return", totalWeightKg: -30, amount: -270, rolls: [] };
for (const reviewed of [serverReview(manualReturn).inbound, localReview(manualReturn)]) {
  assert.equal(reviewed.status, "退货单已复核");
  assert.equal(reviewed.amount, -270);
  assert.deepEqual(reviewed.rolls, [], "supplier returns must never generate incoming roll labels");
}

const seeded = structuredClone(initialRawMaterialInbounds.find((item) => item.id === "RMI-0704-001"));
seeded.revision = 1;
const payload = {
  reviewFields: Object.fromEntries(seeded.ocrReviewFields.map((field) => [field.key, field.value])),
  lineReviews: seeded.ocrLines.map((line) => ({ lineId: line.lineId, values: { ...line.values, factoryColor: "" } })),
};
for (const provider of ["tencent_cloud_table_v3", "old_ocr", ""]) {
  const before = { ...seeded, ocrProvider: provider };
  const reviewed = serverReview(before, payload).inbound;
  assert.equal(reviewed.rolls[0].factoryColorMappingStatus, "supplier_provisional");
  assert.equal(localReview(before, payload).rolls[0].weightKg, reviewed.rolls[0].weightKg);
  assert.deepEqual(reviewed.ocrLines.map((line) => line.sourceText), before.ocrLines.map((line) => line.sourceText), "review must preserve source evidence for every provider");
  rejectedByBoth(before, { ...payload, lineReviews: [] }, "RAW_MATERIAL_OCR_REVIEW_LINE_REQUIRED");
  rejectedByBoth(before, { ...payload, lineReviews: payload.lineReviews.map((entry, index) => index === 0 ? { ...entry, values: { ...entry.values, supplierColor: "", factoryColor: "" } } : entry) }, "RAW_MATERIAL_OCR_REVIEW_LINE_REQUIRED_FIELDS_MISSING");
  rejectedByBoth(before, { ...payload, reviewFields: { ...payload.reviewFields, totalWeightKg: 500 } }, "RAW_MATERIAL_OCR_REVIEW_LINE_WEIGHT_MISMATCH");
}
rejectedByBoth({ ...manual, ocrProvider: "tencent_cloud_table_v3" }, {}, "RAW_MATERIAL_OCR_REVIEW_LINES_MISSING");
assert.throws(() => serverReview(manual, { expectedRevision: 2 }), (error) => error.statusCode === 409, "optimistic revision guard must still precede review");

console.log("raw-material inbound review consistency check passed");
