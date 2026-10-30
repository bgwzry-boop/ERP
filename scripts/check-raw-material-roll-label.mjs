import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRawMaterialQrMatrix } from "../src/domain/rawMaterialLabelQr.js";
import { RAW_MATERIAL_ROLL_LABEL_FIT_CELLS, buildRawMaterialRollLabelCss, fitRollLabelCellText } from "../src/domain/rawMaterialRollLabelTemplate.js";
import {
  RAW_MATERIAL_ROLL_LABEL_COMPANY,
  RAW_MATERIAL_ROLL_LABEL_EXECUTION_STANDARD,
  RAW_MATERIAL_ROLL_LABEL_SIZE,
  buildRawMaterialRollLabelModel,
} from "../src/domain/rawMaterialRollLabel.js";

const label = buildRawMaterialRollLabelModel({
  supplierName: "白侯无纺布",
  deliveryNoteNo: "BH-240704-015",
  receivedAt: "2024-07-04 09:30",
  materialType: "无纺布",
  productName: "白色无纺布",
  spec: "78*40*1300",
}, {
  id: "RM-240704-002-01",
  factoryColor: "天兰",
  widthCm: 40,
  lengthM: 1300,
  gramWeightGsm: 78,
  weightKg: 52.9,
  inventoryStatus: "不可用",
});

assert.equal(label.productName, "无纺布");
assert.equal(label.executionStandard, RAW_MATERIAL_ROLL_LABEL_EXECUTION_STANDARD);
assert.equal(label.widthText, "40");
assert.equal(label.lengthText, "1300");
assert.equal(label.gramWeightText, "78");
assert.equal(label.weightText, "52.9");
assert.equal(label.color, "天兰");
assert.equal(label.supplierName, "白侯无纺布");
assert.equal(label.inboundNo, "BH-240704-015");
assert.equal(label.date, "2024-07-04");
assert.equal(label.companyName, RAW_MATERIAL_ROLL_LABEL_COMPANY.name);
assert.equal(label.companyPhone, "17367893639");
assert.equal(label.companyAddress, "河北省邢台市宁晋县河渠镇大召村");
assert.equal(label.rollCode, "RM-240704-002-01");
assert.deepEqual(RAW_MATERIAL_ROLL_LABEL_SIZE, { widthMm: 76, heightMm: 130 });

const strip = buildRawMaterialRollLabelModel({ materialType: "提手", spec: "条" }, { id: "RM-STRIP-01", weightKg: 2.4 });
assert.equal(strip.productName, "提手条");
assert.equal(strip.lengthText, "", "a supplier strip without meters must not invent a length");
assert.equal(strip.widthText, "5");
assert.equal(strip.gramWeightText, "65");

const qr = buildRawMaterialQrMatrix("RM-240704-002-01");
assert.equal(qr.version, 1);
assert.equal(qr.size, 21);
assert.equal(qr.modules[0].slice(0, 7).every(Boolean), true, "QR finder must be dark");
assert.equal(qr.modules[1][0] && !qr.modules[1][1] && qr.modules[1][6], true);
assert.equal(qr.modules[qr.size - 8][8], true, "QR dark module must stay set");
const row = (index) => qr.modules[index].map((cell) => (cell ? "1" : "0")).join("");
assert.equal(row(0), "111111100000001111111");
assert.equal(row(10), "000110111111000100010");

const sheet = readFileSync(new URL("../src/features/raw-materials/RawMaterialLabelPrintSheet.jsx", import.meta.url), "utf8");
const cssPath = new URL("../src/styles/features/raw-material-roll-label.css", import.meta.url);
const css = readFileSync(cssPath, "utf8");
assert.equal(css, buildRawMaterialRollLabelCss(), "label CSS must stay equal to the locked template");
for (const text of ["品名称", "执行标准", "产品规格", "幅宽cm", "卷长m", "克重g/㎡", "重量kg", "出库时扫描本卷码", "公司名称", "联系方式", "公司地址", "卷料标签", "袋袋赢"]) {
  assert.equal(sheet.includes(text), true, `print sheet should render ${text}`);
}
assert.equal(sheet.includes("BAGWIN"), false);
assert.equal(sheet.includes('colSpan="4"'), true);
assert.equal(sheet.includes('colSpan="5"'), true);
assert.match(css, /@page roll-label\s*\{[^}]*size:\s*76\.00mm 130\.00mm/s);
assert.match(css, /\.raw-material-roll-print-page\s*\{[^}]*height:\s*130\.00mm[^}]*padding-top:\s*14\.33mm/s, "artwork is centred on the 130mm page even when the dialog sets 边距 无");
assert.match(sheet, /createPortal\(sheet, document\.body\)/, "print sheet sits directly under <body> so the label is not shrunk");
assert.match(readFileSync(new URL("../src/styles/features/raw-material-print.css", import.meta.url), "utf8"), /body\.raw-material-label-printing > :not\(\.raw-material-label-print-sheet\)\s*\{[^}]*display:\s*none/s);
assert.match(css, /\.is-measure\s*\{[^}]*font-size:\s*9pt/s);
assert.match(css, /\.is-measure\s*\{[^}]*padding-left:\s*2\.90mm/s);
assert.match(css, /\.is-measure\s*\{[^}]*text-align:\s*left/s);
assert.match(css, /width:\s*25\.61mm;\s*height:\s*26\.90mm/);
assert.match(css, /left:\s*0\.38mm;\s*top:\s*0\.47mm/);
assert.match(css, /height:\s*101\.33mm/);
assert.match(css, /padding:\s*0\.00mm /);
assert.match(css, /width:\s*63\.14mm/);
assert.match(css, /height:\s*7\.39mm/);
assert.equal(css.includes("font-size: 16pt"), false);
assert.match(css, /page:\s*roll-label/);
assert.match(readFileSync(new URL("../src/styles/features/raw-material.css", import.meta.url), "utf8"), /@import "\.\/raw-material-roll-label\.css"/);

// Long supplier names and inbound numbers shrink to fit, then wrap; never clip.
const fitCells = RAW_MATERIAL_ROLL_LABEL_FIT_CELLS;
assert.deepEqual(fitRollLabelCellText("白侯无纺布", fitCells.supplier), { fontPt: 7.5, wrap: false });
assert.deepEqual(fitRollLabelCellText("宁晋县腾胜无纺布有限公司", fitCells.supplier), { fontPt: 5.5, wrap: false });
assert.equal(fitRollLabelCellText("邢台市宁晋县某某某某无纺布制品有限责任公司", fitCells.supplier).wrap, true);
assert.deepEqual(fitRollLabelCellText("BH-240704-015", fitCells.inboundNo), { fontPt: 7, wrap: false });
const longInbound = fitRollLabelCellText("XS-2026-08-19-61", fitCells.inboundNo);
assert.equal(longInbound.wrap, false);
assert.equal(longInbound.fontPt < 7 && longInbound.fontPt >= 5.5, true);
assert.equal(fitRollLabelCellText("XS-2026-08-19-6789-ABCDEFGH", fitCells.inboundNo).wrap, true);
assert.match(sheet, /fitRollLabelCellText\(label\.supplierName/);
assert.match(sheet, /fitRollLabelCellText\(label\.inboundNo/);
assert.match(css, /td\.is-fit-wrap\s*\{[^}]*white-space:\s*normal/s);

console.log("raw-material roll label checks passed: locked 76×130mm template, company facts, and scannable roll-code QR.");
