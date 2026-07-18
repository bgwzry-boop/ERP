import assert from "node:assert/strict";
import { buildRawMaterialInboundDraftFromOcr } from "../server/services/rawMaterialOcrParserService.mjs";
import { parseRawMaterialSpec } from "../shared/rawMaterialSpec.js";

assert.deepEqual(
  pickSpec(parseRawMaterialSpec("78克*宽幅80*米数1300米")),
  ["78克*宽幅80*米数1300米", 78, 80, 1300, "布料", false],
);
assert.deepEqual(pickSpec(parseRawMaterialSpec("78*090*1500")), ["78*090*1500", 78, 90, 1500, "布料", false]);
assert.deepEqual(pickSpec(parseRawMaterialSpec("70*78*2000")), ["70*78*2000", 78, 70, 2000, "布料", false]);
assert.deepEqual(pickSpec(parseRawMaterialSpec("5*78*1500")), ["5*78*1500", 78, 5, 1500, "提手条", false]);
assert.equal(parseRawMaterialSpec("70*82*2000").specNeedsReview, true);
assert.equal(parseRawMaterialSpec("70*82*2000").widthCm, 0, "unlabeled non-standard pairs must not guess gram weight versus width");
assert.equal(parseRawMaterialSpec("90克*1.6米").gramWeightGsm, 0, "legacy two-part specs must not be guessed into the three-part structure");
assert.equal(parseRawMaterialSpec("").specNeedsReview, true, "missing specifications must stay pending review");

const cells = [];
addRow(0, ["供应商", "白侯无纺布有限公司"]);
addRow(1, ["送货单号", "BH-20260716-01"]);
addRow(2, ["品名", "材质", "颜色", "规格", "卷数", "净重", "单位", "单价", "金额"]);
addRow(3, ["无纺布", "无纺布", "米白", "90克*1.6米", "3", "150", "kg", "8.2", "1230"]);

const draft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-CHECK",
  knownSupplierNames: ["白侯无纺布有限公司"],
  recognizedAt: "2026-07-16T08:00:00.000Z",
  ocr: {
    action: "RecognizeTableAccurateOCR",
    requestId: "ocr-request-check",
    tables: [{ cells }],
  },
});

assert.equal(draft.supplierName, "白侯无纺布有限公司");
assert.equal(draft.deliveryNoteNo, "BH-20260716-01");
assert.equal(draft.productName, "无纺布");
assert.equal(draft.materialType, "无纺布");
assert.equal(draft.supplierColor, "米白");
assert.equal(draft.spec, "90克*1.6米");
assert.equal(draft.specRaw, "90克*1.6米");
assert.equal(draft.gramWeightGsm, 0);
assert.equal(draft.widthCm, 0);
assert.equal(draft.lengthM, 0);
assert.equal(draft.rollCount, 3);
assert.equal(draft.totalWeightKg, 150);
assert.equal(draft.unitPrice, 8.2);
assert.equal(draft.amount, 1230);
assert.equal(draft.status, "已识别待复核");
assert.equal(draft.rolls.length, 3);
assert.equal(draft.rolls.every((roll) => roll.inventoryStatus === "不可用"), true);
assert.equal(draft.rolls.every((roll) => roll.labelStatus === "待人工复核"), true);
assert.equal(draft.ocrLines.length, 1);
assert.equal(draft.ocrReviewFields.some((field) => field.key === "supplierName" && field.required), true);
assert.match(draft.note, /不直接增加库存/);

const variableWeightDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-REAL-LAYOUT-A",
  recognizedAt: "2026-07-16T09:00:00.000Z",
  ocr: {
    requestId: "ocr-real-layout-a",
    tables: [
      { cells: buildCells([["某无纺布有限公司销货单"]]) },
      { cells: buildCells([["No: 202607043387"]]) },
      { cells: buildCells([
        ["商品名称", "颜色", "数量", "重量", "单位:千克", "总重", "单价", "金额"],
        ["78*80*1300", "豆沙绿", "1", "80.8", "80.8", "9.7", "783.76"],
        ["78*70*1300", "枣红", "2", "83.6", "80.4", "164", "9.7", "1590.8"],
        ["合计", "3", "244.8", "2374.56"],
      ]) },
    ],
  },
});
assert.equal(variableWeightDraft.supplierName, "某无纺布有限公司");
assert.equal(variableWeightDraft.deliveryNoteNo, "202607043387");
assert.equal(variableWeightDraft.materialType, "无纺布");
assert.equal(variableWeightDraft.productName, "无纺布卷料");
assert.equal(variableWeightDraft.spec, "78*80*1300");
assert.equal(variableWeightDraft.specRaw, "78*80*1300");
assert.equal(variableWeightDraft.gramWeightGsm, 78);
assert.equal(variableWeightDraft.widthCm, 80);
assert.equal(variableWeightDraft.lengthM, 1300);
assert.equal(variableWeightDraft.specDisplay, "78克 × 80cm × 1300米");
assert.equal(variableWeightDraft.supplierColor, "豆沙绿");
assert.equal(variableWeightDraft.rollCount, 3);
assert.equal(variableWeightDraft.totalWeightKg, 244.8);
assert.equal(variableWeightDraft.amount, 2374.56);
assert.deepEqual(variableWeightDraft.rolls.map((roll) => roll.weightKg), [80.8, 83.6, 80.4]);
assert.deepEqual(variableWeightDraft.rolls.map((roll) => [roll.gramWeightGsm, roll.widthCm, roll.lengthM]), [
  [78, 80, 1300],
  [78, 70, 1300],
  [78, 70, 1300],
]);
assert.equal(variableWeightDraft.ocrLines.some((line) => /合计/.test(line.sourceText)), false);

const trailingRollWeightsDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-REAL-LAYOUT-B",
  ocr: {
    tables: [{ cells: buildCells([
      ["序号", "货物名称", "规格型号", "件数", "数量", "单价", "金额", "重量/KG"],
      ["1", "2", "3", "4", "5"],
      ["1", "黑色", "78*70*1500", "2", "163.8", "9.3", "1523.34", "82", "81.8"],
      ["2", "焦糖", "78*70*1500", "2", "164", "9.7", "1590.8", "82", "82"],
      ["合计:", "4", "327.8", "3114.14"],
      ["上期欠款: 100 本单金额: 3114.14 累计欠款: 100"],
    ]) }],
  },
});
assert.equal(trailingRollWeightsDraft.rollCount, 4);
assert.equal(trailingRollWeightsDraft.totalWeightKg, 327.8);
assert.equal(trailingRollWeightsDraft.amount, 3114.14);
assert.equal(trailingRollWeightsDraft.spec, "78*70*1500");
assert.deepEqual(
  [trailingRollWeightsDraft.gramWeightGsm, trailingRollWeightsDraft.widthCm, trailingRollWeightsDraft.lengthM],
  [78, 70, 1500],
);
assert.equal(trailingRollWeightsDraft.supplierColor, "黑色");
assert.deepEqual(trailingRollWeightsDraft.rolls.map((roll) => roll.weightKg), [82, 81.8, 82, 82]);
assert.equal(trailingRollWeightsDraft.ocrLines.length, 2);

const oneRollPerRowDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-REAL-LAYOUT-C",
  ocr: {
    tables: [{ cells: buildCells([
      ["编号", "商品全名", "规格", "单位", "数量", "单价", "金额", "备注"],
      ["11", "本白", "78*70*2000", "公斤", "109.9", "9.1", "1000.09"],
      ["11", "本白", "78*70*2000", "公斤", "109.8", "9.1", "999.18"],
      ["总计大写", "壹仟玖佰玖拾玖元贰角柒分", "219.7", "页小计", "1999.27元"],
      ["上期欠款", "0", "本单金额:", "1999.27", "累计欠款:", "1999.27"],
    ]) }],
  },
});
assert.equal(oneRollPerRowDraft.rollCount, 2);
assert.equal(oneRollPerRowDraft.totalWeightKg, 219.7);
assert.equal(oneRollPerRowDraft.amount, 1999.27);
assert.equal(oneRollPerRowDraft.unitPrice, 9.1);
assert.deepEqual(
  [oneRollPerRowDraft.gramWeightGsm, oneRollPerRowDraft.widthCm, oneRollPerRowDraft.lengthM],
  [78, 70, 2000],
);
assert.deepEqual(oneRollPerRowDraft.rolls.map((roll) => roll.weightKg), [109.9, 109.8]);
assert.equal(oneRollPerRowDraft.ocrLines.length, 2);

const implausibleCountDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-COUNT-GUARD",
  ocr: { tables: [{ cells: buildCells([
    ["品名", "颜色", "规格", "卷数", "净重", "单价", "金额"],
    ["无纺布", "红色", "78*70*1500", "1375749", "100", "9.5", "950"],
  ]) }] },
});
assert.equal(implausibleCountDraft.rollCount, 0);
assert.equal(implausibleCountDraft.rolls.length, 0, "implausible OCR counts must never create a capped batch of fake rolls");

const splitSpecColumnsDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-SPLIT-SPEC-COLUMNS",
  ocr: { tables: [{ cells: buildCells([
    ["品名", "克重", "宽幅", "米数", "卷数", "净重", "单位"],
    ["无纺布", "78", "80", "1300", "1", "80.8", "kg"],
  ]) }] },
});
assert.equal(splitSpecColumnsDraft.spec, "78*80*1300");
assert.deepEqual(
  [splitSpecColumnsDraft.gramWeightGsm, splitSpecColumnsDraft.widthCm, splitSpecColumnsDraft.lengthM],
  [78, 80, 1300],
  "separate OCR columns must be assembled as gram weight × width × length",
);

const handleStripDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-HANDLE-STRIP",
  ocr: { tables: [{ cells: buildCells([
    ["品名", "颜色", "规格", "卷数", "净重", "单位"],
    ["提手材料", "红色", "5*78*1500", "1", "20", "kg"],
  ]) }] },
});
assert.equal(handleStripDraft.widthCm, 5);
assert.equal(handleStripDraft.gramWeightGsm, 78);
assert.equal(handleStripDraft.materialType, "提手");
assert.equal(handleStripDraft.productName, "提手条");
assert.equal(handleStripDraft.materialCategory, "提手条");

console.log("Raw-material OCR parser checks passed: table fields, supplier identity, roll expansion, review evidence, and unavailable-inventory defaults are covered.");

function addRow(row, values) {
  values.forEach((text, column) => cells.push({
    colTl: column,
    colBr: column,
    rowTl: row,
    rowBr: row,
    text,
    confidence: column === 3 ? 82 : 96,
  }));
}

function buildCells(rows) {
  return rows.flatMap((values, row) => values.map((text, column) => ({
    colTl: column,
    colBr: column,
    rowTl: row,
    rowBr: row,
    text,
    confidence: 96,
  })));
}

function pickSpec(spec) {
  return [spec.specRaw, spec.gramWeightGsm, spec.widthCm, spec.lengthM, spec.materialCategory, spec.specNeedsReview];
}
