import assert from "node:assert/strict";
import { applyRawMaterialInboundAction } from "../server/rawMaterialInboundRepository.mjs";
import { buildRawMaterialInboundDraftFromOcr } from "../server/services/rawMaterialOcrParserService.mjs";
import { RAW_MATERIAL_OCR_LINE_REVIEW_KEYS } from "../shared/rawMaterialOcrLineReview.js";
import { enrichRawMaterialSpecValues, formatRawMaterialMobileSpec, parseRawMaterialSpec } from "../shared/rawMaterialSpec.js";

assert.deepEqual(
  pickSpec(parseRawMaterialSpec("78克*宽幅80*米数1300米")),
  ["78克*宽幅80*米数1300米", 78, 80, 1300, "布料", false],
);
assert.deepEqual(pickSpec(parseRawMaterialSpec("78*090*1500")), ["78*090*1500", 78, 90, 1500, "布料", false]);
assert.deepEqual(pickSpec(parseRawMaterialSpec("70*78*2000")), ["70*78*2000", 78, 70, 2000, "布料", false]);
assert.deepEqual(pickSpec(parseRawMaterialSpec("5*78*1500")), ["5*78*1500", 78, 5, 1500, "提手条", false]);
assert.deepEqual(pickSpec(parseRawMaterialSpec("78*5*1500")), ["78*5*1500", 78, 5, 1500, "提手条", false]);
assert.deepEqual(
  pickSpec(parseRawMaterialSpec("78克*5宽*1500米")),
  ["78克*5宽*1500米", 78, 5, 1500, "提手条", false],
);
assert.deepEqual(pickSpec(parseRawMaterialSpec("条")), ["条", 78, 5, 0, "提手条", false]);
assert.deepEqual(pickSpec(parseRawMaterialSpec("宽5cm")), ["宽5cm", 78, 5, 0, "提手条", false]);
assert.deepEqual(pickSpec(parseRawMaterialSpec("78*5*1200")), ["78*5*1200", 78, 5, 1200, "提手条", false]);
assert.equal(parseRawMaterialSpec("宽15cm").materialCategory, "", "15cm must not be misread as a 5cm handle strip");
const explicitStripWithoutSpec = enrichRawMaterialSpecValues({
  productName: "无纺布卷料",
  materialType: "无纺布",
  supplierColor: "天兰条",
  spec: "",
});
assert.equal(explicitStripWithoutSpec.materialCategory, "提手条");
assert.equal(explicitStripWithoutSpec.materialType, "提手");
assert.equal(explicitStripWithoutSpec.productName, "提手条");
assert.equal(explicitStripWithoutSpec.supplierColor, "天兰");
assert.equal(explicitStripWithoutSpec.gramWeightGsm, 78, "the strip category uses the factory-standard GSM");
assert.equal(explicitStripWithoutSpec.widthCm, 5, "the strip category uses the factory-standard width");
assert.equal(explicitStripWithoutSpec.lengthM, 0, "an omitted strip meter length remains absent without blocking review");
assert.equal(explicitStripWithoutSpec.spec, "78*5");
assert.equal(explicitStripWithoutSpec.specNeedsReview, false);
assert.equal(explicitStripWithoutSpec.specDisplay, "78克 × 5cm");
assert.equal(parseRawMaterialSpec("70*82*2000").specNeedsReview, true);
assert.equal(parseRawMaterialSpec("70*82*2000").widthCm, 0, "unlabeled non-standard pairs must not guess gram weight versus width");
assert.equal(parseRawMaterialSpec("90克*1.6米").gramWeightGsm, 0, "legacy two-part specs must not be guessed into the three-part structure");
assert.equal(parseRawMaterialSpec("").specNeedsReview, true, "missing specifications must stay pending review");
assert.equal(formatRawMaterialMobileSpec("70*78*2000"), "78克*70宽*2000米");
assert.equal(formatRawMaterialMobileSpec("76*78*1500"), "78克*76宽*1500米");
assert.equal(formatRawMaterialMobileSpec("条"), "78克*5宽");

const fixedStripDefaultsOverrideSupplierNumbers = enrichRawMaterialSpecValues({
  supplierColor: "米黄条",
  spec: "80*4*1500",
});
assert.equal(fixedStripDefaultsOverrideSupplierNumbers.specRaw, "80*4*1500", "supplier wording remains audit evidence");
assert.deepEqual(
  [
    fixedStripDefaultsOverrideSupplierNumbers.supplierColor,
    fixedStripDefaultsOverrideSupplierNumbers.gramWeightGsm,
    fixedStripDefaultsOverrideSupplierNumbers.widthCm,
    fixedStripDefaultsOverrideSupplierNumbers.lengthM,
  ],
  ["米黄", 78, 5, 1500],
  "factory-authoritative handle-strip GSM and width do not change with omitted or conflicting supplier text",
);

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
const supplierMappedDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-SUPPLIER-COLOR-CHECK",
  knownSupplierNames: ["白侯无纺布有限公司"],
  recognizedAt: "2026-07-16T08:00:00.000Z",
  standardColors: [{ id: "SC-FACTORY-WHITE", name: "本白", enabled: true }],
  colorAliases: [{
    id: "CA-BAIHOU-MIBEI",
    alias: "米白",
    standardColorId: "SC-FACTORY-WHITE",
    sourceType: "supplier",
    sourceId: "白侯无纺布有限公司",
    enabled: true,
  }],
  ocr: {
    action: "RecognizeTableAccurateOCR",
    requestId: "ocr-request-supplier-color-check",
    tables: [{ cells }],
  },
});
assert.equal(supplierMappedDraft.ocrLines[0].values.supplierColor, "米白", "supplier ticket wording remains audit evidence");
assert.equal(supplierMappedDraft.ocrLines[0].values.factoryColor, "本白", "supplier-scoped mapping resolves the factory standard color");
assert.equal(supplierMappedDraft.ocrLines[0].factoryColorResolution.status, "supplier_rule");
assert.equal(supplierMappedDraft.rolls[0].factoryColorMappingAliasId, "CA-BAIHOU-MIBEI");
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
assert.deepEqual(
  draft.rolls.map((roll) => roll.weightKg),
  [0, 0, 0],
  "a three-roll detail line with only a line total must not be silently averaged into physical-roll weights",
);
assert.equal(draft.rolls.every((roll) => roll.weightReviewStatus === "分卷重量待复核"), true);
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
assert.equal(
  variableWeightDraft.rolls.every((roll) => roll.weightReviewStatus === "OCR重量待人工复核"),
  true,
  "complete per-roll OCR weights may populate draft rolls but still require human review",
);
assert.deepEqual(variableWeightDraft.rolls.map((roll) => [roll.gramWeightGsm, roll.widthCm, roll.lengthM]), [
  [78, 80, 1300],
  [78, 70, 1300],
  [78, 70, 1300],
]);
assert.equal(variableWeightDraft.ocrLines.some((line) => /合计/.test(line.sourceText)), false);

const mixedBodyAndStripDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-MIXED-BODY-STRIP",
  ocr: {
    tables: [{ cells: buildCells([
      ["商品名称", "颜色", "数量", "重量", "单位:千克", "总重", "单价", "金额"],
      ["78*80*1300", "豆沙绿", "1", "80.8", "80.8", "9.7", "783.76"],
      ["78克*5宽*1500米", "大红", "1", "20", "20", "9.7", "194"],
    ]) }],
  },
});
assert.equal(mixedBodyAndStripDraft.rollCount, 2, "a 5cm strip row must not prevent normal rolls from being recognized");
assert.deepEqual(
  mixedBodyAndStripDraft.ocrLines.map((line) => line.values.spec),
  ["78*80*1300", "78*5*1500"],
  "handle strips should use the canonical fixed GSM/width while preserving a meter value that really exists",
);
assert.deepEqual(mixedBodyAndStripDraft.rolls.map((roll) => roll.widthCm), [80, 5]);
assert.deepEqual(mixedBodyAndStripDraft.rolls.map((roll) => roll.materialCategory), ["布料", "提手条"]);
assert.equal(mixedBodyAndStripDraft.rolls.every((roll) => roll.specNeedsReview === false), true);

const fiveWidthCountDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-FIVE-WIDTH-COUNT",
  ocr: {
    tables: [{ cells: buildCells([
      ["序号", "货物名称", "规格型号", "件数", "数量", "单价", "金额", "重量/KG"],
      ["1", "大红", "5*78*1500", "2", "40", "9.7", "388", "20", "20"],
    ]) }],
  },
});
assert.equal(fiveWidthCountDraft.rollCount, 2);
assert.equal(fiveWidthCountDraft.spec, "78*5*1500", "handle-strip specifications use one canonical GSM × width × meters order");
assert.deepEqual(fiveWidthCountDraft.rolls.map((roll) => roll.weightKg), [20, 20]);
assert.deepEqual(fiveWidthCountDraft.rolls.map((roll) => roll.widthCm), [5, 5]);
assert.equal(fiveWidthCountDraft.rolls.every((roll) => roll.materialCategory === "提手条"), true);

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

const numericFooterFalsePositiveDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-NUMERIC-FOOTER",
  ocr: {
    tables: [{ cells: buildCells([
      ["商品名称", "颜色", "数量", "重量", "单位:千克", "总重", "单价", "金额"],
      ["78*70*1500", "大红", "1", "83.4", "83.4", "9.7", "808.98"],
      ["426928.4"],
    ]) }],
  },
});
assert.equal(numericFooterFalsePositiveDraft.ocrLines.length, 1, "a numeric footer without material identity or measure must not become an OCR material line");
assert.equal(numericFooterFalsePositiveDraft.rolls.length, 1, "a rejected numeric footer must not fabricate a physical roll");

const debtFooterFalsePositiveDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-DEBT-FOOTER-FALSE-POSITIVE",
  knownSupplierNames: ["人意无纺布"],
  ocr: {
    tables: [{ cells: buildCells([
      ["商品名称", "颜色", "数量", "重量", "单位:千克", "总重", "单价", "金额"],
      ["78*70*1500", "玫红", "2", "82.8", "83.8", "166.6", "9.7", "1616.02"],
      ["欠款", "13", "壹万贰仟零柒.捌玖", "12007.89"],
    ]) }],
  },
});
assert.equal(debtFooterFalsePositiveDraft.ocrLines.length, 1, "a debt summary row must never become a material line");
assert.equal(debtFooterFalsePositiveDraft.rolls.length, 2, "a debt summary count must not fabricate physical rolls");
assert.deepEqual(debtFooterFalsePositiveDraft.rolls.map((roll) => roll.weightKg), [82.8, 83.8]);
assert.equal(debtFooterFalsePositiveDraft.rolls.some((roll) => roll.weightKg === 12007.89), false);

const partialRollWeightsDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-PARTIAL-ROLL-WEIGHTS",
  ocr: {
    tables: [{ cells: buildCells([
      ["序号", "货物名称", "规格型号", "件数", "数量", "单价", "金额", "重量/KG"],
      ["1", "黑色", "78*70*1500", "2", "163.8", "9.3", "1523.34", "82"],
    ]) }],
  },
});
assert.equal(partialRollWeightsDraft.rollCount, 2);
assert.deepEqual(
  partialRollWeightsDraft.rolls.map((roll) => roll.weightKg),
  [82, 0],
  "known physical-roll weights are preserved while a missing sibling weight stays zero",
);
assert.deepEqual(
  partialRollWeightsDraft.rolls.map((roll) => roll.weightReviewStatus),
  ["OCR重量待人工复核", "分卷重量待复核"],
);

const missingRollWeightsDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-MISSING-ROLL-WEIGHTS",
  ocr: {
    tables: [{ cells: buildCells([
      ["序号", "货物名称", "规格型号", "件数", "数量", "单价", "金额", "重量/KG"],
      ["1", "黑色", "78*70*1500", "2", "163.8", "9.3", "1523.34"],
    ]) }],
  },
});
assert.equal(missingRollWeightsDraft.rollCount, 2);
assert.deepEqual(missingRollWeightsDraft.rolls.map((roll) => roll.weightKg), [0, 0]);
assert.equal(missingRollWeightsDraft.rolls.every((roll) => roll.weightReviewStatus === "分卷重量待复核"), true);

const oneRollPerRowDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-REAL-LAYOUT-C",
  ocr: {
    imageWidth: 1200,
    imageHeight: 900,
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

const tengshengTwoPageDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-TENGSHENG-TWO-PAGES",
  knownSupplierNames: ["宁晋县腾胜无纺布有限公司"],
  ocr: {
    pageCount: 2,
    pages: [
      { sourcePageIndex: 0, angle: 90, imageWidth: 1200, imageHeight: 900, requestId: "tengsheng-page-1" },
      { sourcePageIndex: 1, angle: 90, imageWidth: 1200, imageHeight: 900, requestId: "tengsheng-page-2" },
    ],
    tables: [
      { sourcePageIndex: 0, imageWidth: 1200, imageHeight: 900, cells: buildCells([
        ["宁晋县腾胜无纺布有限公司销货单"],
        ["No: XS-2026-08-12-539"],
        ["57", "商品全名", "规格", "单位", "数量", "单价", "金额", "备注"],
        ["11", "本白", "78*70*1500", "公斤", "101.3", "9.588", "971.27"],
        ["总计大写", "玖佰柒拾壹元贰角柒分", "101.3", "页小计", "971.27元"],
        ["本单金额:", "1855.23"],
      ]) },
      { sourcePageIndex: 1, imageWidth: 1200, imageHeight: 900, cells: buildCells([
        ["宁晋县腾胜无纺布有限公司销货单"],
        ["No: XS-2026-08-12-539"],
        ["号", "规格", "单位", "数量", "单价", "金额", "备注"],
        ["11", "桔红", "78*80*1500", "公斤", "93", "9.505", "883.96"],
        ["总计大写", "壹仟捌佰伍拾伍元贰角叁分", "194.3", "页小计", "883.96元"],
        ["本单金额:", "1855.23"],
      ]) },
    ],
  },
});
assert.equal(tengshengTwoPageDraft.ocrPageCount, 2);
assert.equal(tengshengTwoPageDraft.ocrLines.length, 2, "both Tengsheng pages must survive displaced or missing leading header text");
assert.deepEqual(tengshengTwoPageDraft.ocrLines.map((line) => line.sourcePageIndex), [0, 1]);
assert.deepEqual(tengshengTwoPageDraft.ocrLines.map((line) => line.values.supplierColor), ["本白", "桔红"]);
assert.equal(tengshengTwoPageDraft.totalWeightKg, 194.3, "full-document weight must win over either page subtotal");
assert.equal(tengshengTwoPageDraft.amount, 1855.23, "the declared full-document amount must reconcile against both pages");
assert.deepEqual(tengshengTwoPageDraft.ocrReconciliationIssues, []);
assert.equal(oneRollPerRowDraft.ocrLines.length, 2);
assert.deepEqual(oneRollPerRowDraft.ocrLines[0].sourceBounds, {
  left: 0,
  top: 40,
  right: 700,
  bottom: 80,
  imageWidth: 1200,
  imageHeight: 900,
}, "OCR line review should retain the real source-row crop coordinates");
assert.equal(oneRollPerRowDraft.ocrImageWidth, 1200);
assert.equal(oneRollPerRowDraft.ocrImageHeight, 900);

const summaryMustNotCreateRollsDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-SUMMARY-NO-ROLLS",
  ocr: {
    tables: [{ cells: buildCells([
      ["品名", "材质", "颜色", "规格", "卷数", "净重", "单位", "单价", "金额"],
      ["无纺布", "无纺布", "米白", "90*80*1300", "1", "80", "kg", "8.2", "656"],
      ["合计", "4", "320", "2624"],
    ]) }],
  },
});
assert.equal(summaryMustNotCreateRollsDraft.rollCount, 1, "physical-roll count must come from detail rows");
assert.equal(summaryMustNotCreateRollsDraft.totalWeightKg, 320, "the whole-note total remains available only as a summary fact");
assert.equal(summaryMustNotCreateRollsDraft.rolls.length, 1, "a whole-note count must never fabricate missing physical rolls");
assert.deepEqual(summaryMustNotCreateRollsDraft.rolls.map((roll) => roll.weightKg), [80]);

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

const supplierWrittenStripDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-SUPPLIER-WRITTEN-STRIP",
  ocr: { tables: [{ cells: buildCells([
    ["编号", "商品全名", "规格", "单位", "数量", "单价", "金额", "备注"],
    ["17", "大红", "条", "公斤", "74", "9.7", "717.8", ""],
  ]) }] },
});
assert.equal(supplierWrittenStripDraft.materialCategory, "提手条");
assert.equal(supplierWrittenStripDraft.materialType, "提手");
assert.equal(supplierWrittenStripDraft.productName, "提手条");
assert.equal(supplierWrittenStripDraft.spec, "78*5");
assert.equal(supplierWrittenStripDraft.gramWeightGsm, 78, "supplier text 条 applies the fixed handle-strip GSM");
assert.equal(supplierWrittenStripDraft.widthCm, 5, "supplier text 条 applies the fixed handle-strip width");
assert.equal(supplierWrittenStripDraft.lengthM, 0, "supplier text 条 keeps an omitted meter length absent");
assert.equal(supplierWrittenStripDraft.specNeedsReview, false);
assert.equal(supplierWrittenStripDraft.rolls[0].materialCategory, "提手条");

const colorSuffixStripDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-COLOR-SUFFIX-STRIP",
  ocr: { tables: [{ cells: buildCells([
    ["商品名称", "颜色", "数量", "重量", "单位:千克", "总重", "单价", "金额"],
    ["天兰条", "1", "68", "68", "9.8"],
  ]) }] },
});
assert.equal(colorSuffixStripDraft.materialCategory, "提手条");
assert.equal(colorSuffixStripDraft.supplierColor, "天兰");
assert.equal(colorSuffixStripDraft.gramWeightGsm, 78);
assert.equal(colorSuffixStripDraft.widthCm, 5);
assert.equal(colorSuffixStripDraft.lengthM, 0);
assert.equal(colorSuffixStripDraft.specDisplay, "78克 × 5cm");
assert.equal(colorSuffixStripDraft.specNeedsReview, false);

const actualRenyiStripRowsDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-RENYI-STRIP-ROWS",
  ocr: { tables: [{ cells: buildCells([
    ["商品名称", "颜色", "数量", "重量", "单位:千克", "总重", "单价", "金额"],
    ["米黄条", "2", "88", "100", "0"],
    ["咖啡条", "1", "93.5", "281.5", "10.3", "2899.45"],
  ]) }] },
});
assert.deepEqual(actualRenyiStripRowsDraft.ocrLines.map((line) => line.values.supplierColor), ["米黄", "咖啡"]);
assert.equal(actualRenyiStripRowsDraft.ocrLines.every((line) => line.values.materialCategory === "提手条"), true);
assert.equal(actualRenyiStripRowsDraft.ocrLines.every((line) => line.values.gramWeightGsm === 78), true);
assert.equal(actualRenyiStripRowsDraft.ocrLines.every((line) => line.values.widthCm === 5), true);
assert.equal(actualRenyiStripRowsDraft.ocrLines.every((line) => line.values.lengthM === 0), true);
assert.equal(actualRenyiStripRowsDraft.ocrLines.every((line) => line.values.spec === "78*5"), true);
assert.deepEqual(actualRenyiStripRowsDraft.rolls.map((roll) => roll.weightKg), [88, 100, 93.5]);

const renyiSeptemberMixedMaterialDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-RENYI-SEPTEMBER-MIXED",
  knownSupplierNames: ["人意无纺布"],
  ocr: { tables: [{ cells: buildCells([
    ["人意无纺布销售单"],
    ["客户：测试客户", "单据日期：", "2026.9.01", "送货人：测试送货员"],
    ["商品名称", "颜色", "数量", "重量", "单位：千克", "总重", "单价", "金额"],
    ["78*090*1500", "桔红", "3", "108.8", "108.3", "107.3", "0"],
    ["78*070*1500", "桔红", "2", "85.3", "84.8", "494.5", "10.1", "4994.45"],
    ["咖啡条", "1", "76.5", "0"],
    ["海兰条", "1", "95", "171.5", "10.3", "1766.45"],
    ["合计", "7", "陆仟柒佰陆拾.玖", "6760.9"],
    ["本单金额", "6760.90"],
  ]) }] },
});
assert.equal(renyiSeptemberMixedMaterialDraft.supplierName, "人意无纺布");
assert.equal(renyiSeptemberMixedMaterialDraft.receivedAt, "2026-09-01");
assert.equal(renyiSeptemberMixedMaterialDraft.supplierOcrProfileKey, "renyi_zhengheng");
assert.equal(renyiSeptemberMixedMaterialDraft.documentPriceReferenceOnly, true);
assert.equal(renyiSeptemberMixedMaterialDraft.rollCount, 7);
assert.equal(renyiSeptemberMixedMaterialDraft.totalWeightKg, 666);
assert.equal(renyiSeptemberMixedMaterialDraft.amount, 6760.9);
assert.deepEqual(renyiSeptemberMixedMaterialDraft.rolls.map((roll) => roll.weightKg), [108.8, 108.3, 107.3, 85.3, 84.8, 76.5, 95]);
assert.deepEqual(renyiSeptemberMixedMaterialDraft.rolls.map((roll) => roll.materialCategory), ["布料", "布料", "布料", "布料", "布料", "提手条", "提手条"]);
assert.deepEqual(renyiSeptemberMixedMaterialDraft.ocrLines.slice(-2).map((line) => ({
  color: line.values.supplierColor,
  spec: line.values.specDisplay,
  lengthM: line.values.lengthM,
})), [
  { color: "咖啡", spec: "78克 × 5cm", lengthM: 0 },
  { color: "海兰", spec: "78克 × 5cm", lengthM: 0 },
]);
assert.deepEqual(renyiSeptemberMixedMaterialDraft.ocrReconciliationIssues, []);

const daxiangMultiWeightDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-DAXIANG-MULTI-WEIGHT",
  ocr: { tables: [{ cells: buildCells([
    ["号", "货物名称", "规格型号", "件数", "数量", "单价", "金额", "重量/KG"],
    ["1", "2", "3", "4", "5"],
    ["消光白", "78*90*1500", "2", "209.8", "9.70", "2035.06", "105.4", "104.4"],
    ["消光白", "78*76*1500", "2", "185", "9.70", "1794.5", "92", "93"],
    ["消光白", "78*70*1500", "4", "334", "9.70", "3239.8", "83.6", "84", "82.8", "83.6"],
    ["合计:", "8", "728.8", "7069.36"],
  ]) }] },
});
assert.equal(daxiangMultiWeightDraft.rollCount, 8, "Daxiang piece counts must not be replaced by the 78 GSM value");
assert.equal(daxiangMultiWeightDraft.totalWeightKg, 728.8, "Daxiang total quantity is the document weight");
assert.equal(daxiangMultiWeightDraft.amount, 7069.36, "Daxiang amount must remain an amount instead of becoming weight");
assert.deepEqual(daxiangMultiWeightDraft.ocrLines.map((line) => line.values.spec), ["78*90*1500", "78*76*1500", "78*70*1500"]);
assert.deepEqual(daxiangMultiWeightDraft.ocrLines.map((line) => line.values.rollCount), [2, 2, 4]);
assert.deepEqual(daxiangMultiWeightDraft.rolls.map((roll) => roll.weightKg), [105.4, 104.4, 92, 93, 83.6, 84, 82.8, 83.6]);

const daxiangMultilineDebtFooterDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-DAXIANG-MULTILINE-DEBT-FOOTER",
  knownSupplierNames: ["宁晋县达翔塑料制品有限公司"],
  ocr: { tables: [{ cells: buildCells([
    ["宁晋县达翔塑料制品有限公司销货单"],
    ["号 货物名称", "规格型号", "件数", "数量", "单价", "金额", "重量/KG"],
    ["浅紫", "78*70*1500", "4", "331.6", "10.1", "3349.16", "81.6", "82.4", "82.2", "85.4"],
    ["合计:", "4", "331.6", "3349.16"],
    ["期欠款:\n1197614.08\n本单金额:\n3349.16\n本单收款:\n0\n累计欠款:\n1200963.24"],
    ["期欠款:", "1197614.08"],
    ["本单金额:", "3349.16"],
  ]) }] },
});
assert.equal(daxiangMultilineDebtFooterDraft.amount, 3349.16, "a multiline debt footer must use 本单金额, never the previous or cumulative balance");
assert.equal(daxiangMultilineDebtFooterDraft.ocrDeclaredAmount, 3349.16);
assert.deepEqual(daxiangMultilineDebtFooterDraft.ocrReconciliationIssues, []);
const daxiangMultilineDebtFooterReviewed = applyRawMaterialInboundAction({
  workspace: { users: [{ id: "U-OFFICE-A", displayName: "办公室A" }] },
  inbounds: [daxiangMultilineDebtFooterDraft],
  inboundId: daxiangMultilineDebtFooterDraft.id,
  action: "review",
  operatorId: "U-OFFICE-A",
  operatorName: "办公室A",
  body: {
    expectedRevision: daxiangMultilineDebtFooterDraft.revision,
    now: "2026-08-03T10:00:00.000Z",
    reviewFields: Object.fromEntries(daxiangMultilineDebtFooterDraft.ocrReviewFields.map((field) => [field.key, field.value])),
    lineReviews: daxiangMultilineDebtFooterDraft.ocrLines.map((line) => ({
      lineId: line.lineId,
      values: Object.fromEntries(RAW_MATERIAL_OCR_LINE_REVIEW_KEYS.map((key) => [key, line.values[key]])),
    })),
  },
});
assert.equal(daxiangMultilineDebtFooterReviewed.inbound.status, "已复核待打印标签", "the exact Daxiang debt-footer regression must complete the review write boundary");
assert.equal(daxiangMultilineDebtFooterReviewed.inbound.amount, 3349.16);
assert.equal(daxiangMultilineDebtFooterReviewed.inbound.rolls.length, 4);
assert.equal(daxiangMultilineDebtFooterReviewed.inbound.rolls.every((roll) => roll.labelStatus === "待打印标签" && roll.inventoryStatus === "不可用"), true);

const tengshengSeparatedNumberDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-TENGSHENG-DOC-NO",
  knownSupplierNames: ["宁晋县腾胜无纺布有限公司"],
  ocr: { tables: [
    { cells: buildCells([["宁晋县腾胜无纺布有限公司销货单"]]) },
    { cells: buildCells([["单据编号:"], ["XS-2026-08-02-408"]]) },
    { cells: buildCells([
      ["编号", "商品全名", "规格", "单位", "数量", "单价", "金额", "备注"],
      ["12", "梅兰", "78*90*1500", "公斤", "107.9", "9.7", "1046.63", ""],
      ["12", "梅兰", "78*90*1500", "公斤", "107.3", "9.7", "1040.81", ""],
    ]) },
    { cells: buildCells([["期欠款", "460680.52", "本单金额:", "19329.19\n累计欠款:", "480009.71"]]) },
  ] },
});
assert.equal(tengshengSeparatedNumberDraft.deliveryNoteNo, "XS-2026-08-02-408", "a generic 编号 table header must not replace the separated document number");
assert.equal(tengshengSeparatedNumberDraft.ocrDeclaredAmount, 19329.19);
assert.equal(tengshengSeparatedNumberDraft.ocrCalculatedLineAmount, 2087.44);
assert.equal(tengshengSeparatedNumberDraft.ocrReconciliationIssues.length, 1, "declared and recognized line amounts must fail closed instead of silently choosing one");

const renyiSignedReturnDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-RENYI-SIGNED-RETURN",
  knownSupplierNames: ["人意无纺布有限公司"],
  ocr: { tables: [{ cells: buildCells([
    ["人意无纺布有限公司销售单"],
    ["商品名称", "颜色", "数量", "重量", "单位:千克", "总重", "单价", "金额"],
    ["退带色布", "4", "-4.2", "-24.2", "-73.7", "-5.2", "-107.3", "9.6", "-1030.08"],
    ["退带色条", "1", "-14.5", "-14.5", "9.8", "-142.1"],
    ["合计", "5", "负壹仟壹佰柒拾贰.壹捌", "-1172.18"],
  ]) }] },
});
assert.equal(renyiSignedReturnDraft.documentDirection, "supplier_return");
assert.equal(renyiSignedReturnDraft.documentTypeLabel, "退货单");
assert.equal(renyiSignedReturnDraft.supplierOcrProfileKey, "renyi_zhengheng");
assert.equal(renyiSignedReturnDraft.documentPriceReferenceOnly, true, "人意/振恒 ticket prices are source evidence, not authoritative actual prices");
assert.equal(renyiSignedReturnDraft.priceAuthority, "supplier_document_reference_only");
assert.equal(renyiSignedReturnDraft.rollCount, 5);
assert.equal(renyiSignedReturnDraft.totalWeightKg, -121.8);
assert.equal(renyiSignedReturnDraft.amount, -1172.18);
assert.deepEqual(renyiSignedReturnDraft.ocrLines.map((line) => line.values.rollWeightsKg), [
  [-4.2, -24.2, -73.7, -5.2],
  [-14.5],
]);
assert.equal(renyiSignedReturnDraft.rolls.length, 0, "supplier returns must never create inbound roll or label candidates");

const renyiReferencePriceDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-RENYI-REFERENCE-PRICE",
  knownSupplierNames: ["振恒"],
  ocr: { tables: [{ cells: buildCells([
    ["人意无纺布销售单"],
    ["商品名称", "颜色", "数量", "重量", "单位:千克", "总重", "单价", "金额"],
    ["78*80*1500", "大黄", "1", "100", "100", "1", "100"],
    ["合计", "1", "100", "999"],
  ]) }] },
});
assert.equal(renyiReferencePriceDraft.supplierOcrProfileKey, "renyi_zhengheng");
assert.equal(renyiReferencePriceDraft.documentPriceReferenceOnly, true);
assert.deepEqual(renyiReferencePriceDraft.ocrReconciliationIssues, [], "人意/振恒票面价格差异 is retained as evidence but does not block raw-material review");

const beichenExplicitReturnDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-BEICHEN-EXPLICIT-RETURN",
  ocr: { tables: [
    { cells: buildCells([["河北北陈无纺布有限公司退货单"]]) },
    { cells: buildCells([
      ["行次", "货物名称", "规格型号", "件数", "数量", "单价", "金额", "重量/KG"],
      ["1", "雾霾蓝", "78*80*1500", "1", "96.2", "10.40", "1000.48", "96.2"],
      ["合计:", "1", "96.2", "1000.48"],
    ]) },
  ] },
});
assert.equal(beichenExplicitReturnDraft.supplierName, "河北北陈无纺布有限公司");
assert.equal(beichenExplicitReturnDraft.supplierOcrProfileKey, "daxiang_beichen");
assert.equal(beichenExplicitReturnDraft.documentDirection, "supplier_return");
assert.equal(beichenExplicitReturnDraft.totalWeightKg, -96.2, "an explicit return title gives positive printed magnitudes a negative business direction");
assert.equal(beichenExplicitReturnDraft.amount, -1000.48);
assert.deepEqual(beichenExplicitReturnDraft.ocrLines[0].values.rollWeightsKg, [-96.2]);
assert.equal(beichenExplicitReturnDraft.rolls.length, 0);

const operatorSelectedReturnDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-OPERATOR-SELECTED-RETURN",
  documentDirectionHint: "supplier_return",
  ocr: { tables: [{ cells: buildCells([
    ["宁晋县腾胜无纺布有限公司销货单"],
    ["编号", "商品全名", "规格", "单位", "数量", "单价", "金额", "备注"],
    ["16", "大红", "78*90*1500", "公斤", "107.7", "9.7", "1044.69", ""],
  ]) }] },
});
assert.equal(operatorSelectedReturnDraft.documentDirection, "supplier_return", "the operator's capture-time return selection must override OCR wording");
assert.equal(operatorSelectedReturnDraft.documentDirectionSource, "operator_capture_selection");
assert.equal(operatorSelectedReturnDraft.totalWeightKg, -107.7);
assert.equal(operatorSelectedReturnDraft.amount, -1044.69);
assert.equal(operatorSelectedReturnDraft.rolls.length, 0, "an explicitly selected supplier return must not allocate new roll codes");

const hongshangNegativeReturnDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-HONGSHANG-NEGATIVE-RETURN",
  ocr: { tables: [{ cells: buildCells([
    ["河北宏尚无纺布有限公司销货单"],
    ["商品名称", "颜色", "数量", "重量", "单位:千克", "总重", "单价", "金额"],
    ["布", "彩色", "1", "-84.4", "-84.4", "10.1", "-852.44"],
    ["布", "废布", "1", "-13", "-13", "10.1", "-131.3"],
    ["78*90*1300", "梦幻紫", "1", "-92.8", "-92.8", "10.1", "-937.28"],
    ["合计", "3", "-190.2", "-1921.02"],
    ["退货单"],
  ]) }] },
});
assert.equal(hongshangNegativeReturnDraft.documentDirection, "supplier_return");
assert.equal(hongshangNegativeReturnDraft.supplierOcrProfileKey, "hongshang_baihou");
assert.equal(hongshangNegativeReturnDraft.rollCount, 3);
assert.equal(hongshangNegativeReturnDraft.totalWeightKg, -190.2);
assert.equal(hongshangNegativeReturnDraft.amount, -1921.02);
assert.deepEqual(hongshangNegativeReturnDraft.ocrLines.map((line) => line.values.totalWeightKg), [-84.4, -13, -92.8]);
assert.equal(hongshangNegativeReturnDraft.rolls.length, 0);

const renyiOneMeterWidthDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-RENYI-ONE-METER-WIDTH",
  knownSupplierNames: ["人意无纺布有限公司"],
  ocr: { tables: [{ cells: buildCells([
    ["人意无纺布有限公司销售单"],
    ["商品名称", "颜色", "数量", "重量", "单位:千克", "总重", "单价", "金额"],
    ["78*1*1500", "大黄", "1", "120.8", "120.8", "10.1", "1220.08"],
    ["78*1*1500", "大红", "2", "119.8", "118.3", "238.1", "10.1", "2404.81"],
  ]) }] },
});
assert.deepEqual(renyiOneMeterWidthDraft.ocrLines.map((line) => line.values.spec), ["78*100*1500", "78*100*1500"]);
assert.deepEqual(renyiOneMeterWidthDraft.ocrLines.map((line) => line.values.specRaw), ["78*1*1500", "78*1*1500"]);
assert.equal(renyiOneMeterWidthDraft.ocrLines.every((line) => line.values.widthCm === 100), true);
assert.match(renyiOneMeterWidthDraft.ocrLines[0].values.specNormalizationReason, /人意单据/);

const otherSupplierOneWidthDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-OTHER-SUPPLIER-ONE-WIDTH",
  knownSupplierNames: ["其他无纺布有限公司"],
  ocr: { tables: [{ cells: buildCells([
    ["其他无纺布有限公司销售单"],
    ["商品名称", "颜色", "数量", "重量", "单位:千克", "总重", "单价", "金额"],
    ["78*1*1500", "测试色", "1", "100", "100", "10", "1000"],
  ]) }] },
});
assert.equal(otherSupplierOneWidthDraft.ocrLines[0].values.widthCm, 1, "the 人意 1米 adapter must not contaminate other suppliers");
assert.equal(otherSupplierOneWidthDraft.supplierOcrProfileKey, "generic");
assert.equal(otherSupplierOneWidthDraft.documentPriceReferenceOnly, false);

const renyiCompactReturnDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-RENYI-COMPACT-RETURN",
  documentDirectionHint: "supplier_return",
  knownSupplierNames: ["人意无纺布"],
  supplierNameHint: "人意无纺布",
  ocr: { tables: [{ cells: buildCells([
    ["人意无纺布销售单"],
    ["品名称", "颜色", "数量", "重\n量\n单位:千克\n单价", "金额"],
    ["退带色布", "1", "-58", "-58", "10.1", "-585.8"],
    ["计", "1", "负伍佰捌拾伍.捌", "-585.8"],
  ]) }] },
});
assert.equal(renyiCompactReturnDraft.supplierName, "人意无纺布");
assert.equal(renyiCompactReturnDraft.supplierNameSource, "operator_capture_selection");
assert.equal(renyiCompactReturnDraft.ocrLines.length, 1, "the compact 计 footer must never become a second return material line");
assert.equal(renyiCompactReturnDraft.ocrLines[0].values.productName, "退带色布");
assert.equal(renyiCompactReturnDraft.totalWeightKg, -58, "the printed quantity 1 must not replace the -58kg return detail");
assert.equal(renyiCompactReturnDraft.amount, -585.8);
assert.deepEqual(renyiCompactReturnDraft.ocrReconciliationIssues, []);

const tengshengDetachedDocumentNumberReturnDraft = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-OCR-TENGSHENG-DETACHED-DOC-NO",
  documentDirectionHint: "supplier_return",
  knownSupplierNames: ["宁晋县腾胜无纺布有限公司"],
  supplierNameHint: "宁晋县腾胜无纺布有限公司",
  ocr: { tables: [
    { cells: buildCells([["销售退货单"], ["录单日期:", "2026-08-08"], ["单据编号:"]]) },
    { cells: buildCells([["XT-2026-08-08-027"]]) },
    { cells: buildCells([
      ["商品全名", "商品规格", "单位", "数量", "单价", "金额", "备注"],
      ["黑", "78*76*1500", "公斤", "3.8", "9.7", "36.86", ""],
      ["页小计", "3.8", "36.86元"],
    ]) },
  ] },
});
assert.equal(tengshengDetachedDocumentNumberReturnDraft.deliveryNoteNo, "XT-2026-08-08-027");
assert.equal(tengshengDetachedDocumentNumberReturnDraft.supplierName, "宁晋县腾胜无纺布有限公司");
assert.equal(tengshengDetachedDocumentNumberReturnDraft.totalWeightKg, -3.8);
assert.equal(tengshengDetachedDocumentNumberReturnDraft.rolls.length, 0);

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
    polygon: [
      { x: column * 100, y: row * 40 },
      { x: (column + 1) * 100, y: row * 40 },
      { x: (column + 1) * 100, y: (row + 1) * 40 },
      { x: column * 100, y: (row + 1) * 40 },
    ],
  })));
}

function pickSpec(spec) {
  return [spec.specRaw, spec.gramWeightGsm, spec.widthCm, spec.lengthM, spec.materialCategory, spec.specNeedsReview];
}
