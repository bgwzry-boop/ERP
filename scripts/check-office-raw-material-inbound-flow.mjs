import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OFFICE_LABEL_PAPER,
  applyOfficeRollCorrection,
  buildOfficeMatchedAttachPayload,
  buildOfficeReviewRows,
  evaluateOfficeInboundCompletion,
  officeInboundUsesCountGate,
  officeReviewFieldsForSubmit,
  officeReviewSubmitBlocker,
  receivingReceiptTab,
  replaceWidthInSpec,
  resolveOfficeInboundStep,
} from "../src/domain/officeRawMaterialInboundFlow.js";

const reviewInbound = {
  id: "RMI-1",
  status: "已识别待复核",
  documentDirection: "supplier_delivery",
  supplierName: "腾胜",
  factoryColor: "多色",
  rollCount: 2,
  totalWeightKg: 200,
  spec: "78*70*2000",
  ocrLines: [
    {
      lineId: "L1",
      values: {
        productName: "无纺布卷料",
        materialType: "无纺布",
        supplierColor: "本白",
        factoryColor: "本白",
        spec: "78*70*2000",
        rollCount: 1,
        totalWeightKg: 109.9,
        unit: "kg",
        rollWeightsKg: [109.9],
      },
    },
    {
      lineId: "L2",
      values: {
        productName: "无纺布卷料",
        materialType: "无纺布",
        supplierColor: "大红",
        factoryColor: "大红",
        spec: "78*80*1500",
        rollCount: 1,
        totalWeightKg: 90.1,
        unit: "kg",
        rollWeightsKg: [90.1],
      },
    },
  ],
  rolls: [
    { id: "RM-1", weightKg: 109.9, labelStatus: "待生成标签", inventoryStatus: "不可用" },
    { id: "RM-2", weightKg: 90.1, labelStatus: "待生成标签", inventoryStatus: "不可用" },
  ],
};

assert.equal(OFFICE_LABEL_PAPER.widthMm, 76);
assert.equal(OFFICE_LABEL_PAPER.heightMm, 130);
assert.equal(resolveOfficeInboundStep(null), "scan");
assert.equal(resolveOfficeInboundStep(reviewInbound), "review");
assert.equal(resolveOfficeInboundStep({ id: "RMI-2", status: "已复核待打印标签", rolls: [{ inventoryStatus: "不可用", weightKg: 10 }] }), "print");

const rows = buildOfficeReviewRows(reviewInbound, {});
assert.equal(rows.length, 2);
assert.equal(rows[0].color, "本白");
assert.equal(rows[0].widthCm, 70);
assert.equal(rows[0].weightKg, 109.9);
assert.equal(rows[0].blocker, "");
assert.equal(rows[1].widthCm, 80);

const corrected = applyOfficeRollCorrection({
  lineDrafts: {
    L1: { ...reviewInbound.ocrLines[0].values, rollWeightsKg: "109.9" },
    L2: { ...reviewInbound.ocrLines[1].values, rollWeightsKg: "90.1" },
  },
  documentDraft: { totalWeightKg: 200 },
  row: rows[1],
  correction: { color: "枣红", widthCm: 85, weightKg: 91.2 },
});
assert.equal(corrected.lineDrafts.L2.factoryColor, "枣红");
assert.equal(corrected.lineDrafts.L2.supplierColor, "大红", "factory color correction must preserve supplier evidence");
assert.equal(corrected.lineDrafts.L2.spec, "78*85*1500");
assert.equal(corrected.lineDrafts.L2.rollWeightsKg, "91.2");
assert.equal(corrected.lineDrafts.L2.totalWeightKg, "91.2");
assert.equal(corrected.documentDraft.totalWeightKg, 201.1);
assert.equal(corrected.lineDrafts.L1.supplierColor, "本白", "editing one roll must leave the other row unchanged");
assert.equal(replaceWidthInSpec("78*70*2000", 72), "78*72*2000");
assert.equal(replaceWidthInSpec("78克*5宽", 5), "78*5");

const printed = {
  id: "RMI-3",
  status: "已打印待贴标",
  rollCount: 2,
  rolls: [
    { id: "RM-A", factoryColor: "本白", spec: "78*70*2000", weightKg: 10, labelStatus: "已打印待贴标", inventoryStatus: "不可用" },
    { id: "RM-B", factoryColor: "大红", spec: "78*80*1500", weightKg: 11, labelStatus: "已打印待贴标", inventoryStatus: "不可用" },
  ],
};
assert.equal(resolveOfficeInboundStep(printed), "complete");
assert.equal(officeInboundUsesCountGate(printed), true);
assert.equal(evaluateOfficeInboundCompletion(printed, "").allowed, false);
assert.match(evaluateOfficeInboundCompletion(printed, "1").reason, /张数对不上/);
assert.equal(evaluateOfficeInboundCompletion(printed, "2").allowed, true);
assert.deepEqual(
  evaluateOfficeInboundCompletion(printed, "2").pending.map((roll) => roll.id),
  ["RM-A", "RM-B"],
);
assert.equal(buildOfficeMatchedAttachPayload(printed, printed.rolls[0]).matchResult, "matched");
assert.equal(buildOfficeMatchedAttachPayload(printed, printed.rolls[0]).checkedColor, "本白");

const mismatched = {
  ...printed,
  rolls: [
    printed.rolls[0],
    { ...printed.rolls[1], labelStatus: "标签或实物不符/待确认", inventoryStatus: "待确认" },
  ],
};
assert.equal(evaluateOfficeInboundCompletion(mismatched, "2").allowed, false);
assert.match(evaluateOfficeInboundCompletion(mismatched, "2").reason, /对不上/);
assert.equal(officeInboundUsesCountGate(mismatched), false);

assert.equal(receivingReceiptTab({ status: "已识别待复核" }), "待核对");
assert.equal(receivingReceiptTab({ status: "已复核待打印标签" }), "待打印");
assert.equal(receivingReceiptTab({ status: "入库异常/待确认" }), "异常");
assert.equal(receivingReceiptTab({ documentDirection: "supplier_return", status: "已识别待复核" }), "退货单");
assert.match(officeReviewSubmitBlocker({ supplierName: "", documentDirection: "supplier_delivery" }, {}), /供应商还没确认/);
assert.match(officeReviewSubmitBlocker({ documentDirection: "supplier_delivery" }, { supplierName: "" }), /供应商还没确认/);
assert.equal(officeReviewSubmitBlocker({ supplierName: "河北宏尚无纺布有限公司" }, { supplierName: "" }), "");
assert.equal(officeReviewFieldsForSubmit({ supplierName: "河北宏尚无纺布有限公司" }, { supplierName: "" }).supplierName, "河北宏尚无纺布有限公司");
assert.equal(officeReviewSubmitBlocker({ documentDirection: "supplier_return", supplierName: "" }, {}), "");

const pageSource = [
  "../src/features/raw-materials/OfficeInboundFlow.jsx",
  "../src/features/raw-materials/InboundDetail.jsx",
  "../src/features/raw-materials/RawMaterialLabelPrintSheet.jsx",
  "../src/features/raw-materials/useInboundPageState.js",
  "../docs/prototypes/raw-material-roll-inventory-review/src/App.jsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
const officeHandler = readFileSync(new URL("../src/features/raw-materials/useInboundPageState.js", import.meta.url), "utf8");
const desktopConfirm = officeHandler.slice(
  officeHandler.indexOf("async function handleOfficeReviewConfirm"),
  officeHandler.indexOf("async function handleOfficeException"),
);
assert.ok(desktopConfirm.includes("officeReviewFieldsForSubmit"), "desktop confirm should submit the office review fields");
assert.equal(desktopConfirm.includes("暂缓打印"), false, "desktop「这批都对，去打印」must stay on the print step instead of deferring labels");
assert.ok(pageSource.includes("receivingReceiptTab"), "receiving list should follow the acted sheet into its next tab");
assert.ok(pageSource.includes("actedRecord"), "receiving detail should stay on the sheet that was just confirmed or marked");
const printCss = readFileSync(new URL("../src/styles/features/raw-material-roll-label.css", import.meta.url), "utf8");
for (const text of ["扫描或上传", "核对每一卷的颜色、宽幅、公斤", "这批都对，去打印", "改这一卷", "已贴张数", "确认入库", "76×130"]) {
  assert.ok(pageSource.includes(text), `office inbound screen should say ${text}`);
}
assert.match(printCss, /size:\s*76(?:\.00)?mm 130(?:\.00)?mm/, "label print page should use 76×130 waybill paper");
assert.equal(pageSource.includes("原材料卷标"), false, "the printed label should not repeat a generic label heading");

console.log("office raw-material inbound flow check passed");
