import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRawMaterialQrMatrix } from "../src/domain/rawMaterialLabelQr.js";
import { buildRawMaterialRollLabelCss } from "../src/domain/rawMaterialRollLabelTemplate.js";
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
assert.equal(strip.gramWeightText, "78");

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
assert.match(css, /\.is-measure\s*\{[^}]*font-size:\s*11pt/s);
assert.match(css, /\.is-measure\s*\{[^}]*text-align:\s*right/s);
assert.match(css, /\.raw-material-roll-label-grid th\s*\{[^}]*font-size:\s*7pt/s);
assert.match(css, /\.raw-material-roll-label-grid th\s*\{[^}]*text-align:\s*left/s);
assert.match(css, /width:\s*25\.40mm;\s*height:\s*25\.40mm/);
assert.match(css, /top:\s*0\.40mm;\s*right:\s*0\.32mm/);
assert.match(css, /\.raw-material-code39\s*\{[^}]*width:\s*100%/s);
assert.match(css, /\.raw-material-code39\s*\{[^}]*height:\s*12\.00mm/s);
assert.match(css, /margin-top:\s*0\.80mm/);
const fontSizes = [...new Set([...css.matchAll(/font-size:\s*([0-9.]+)pt/g)].map((match) => match[1]))].sort();
assert.deepEqual(fontSizes, ["11", "7", "7.5"], "the label uses exactly three type sizes");
assert.equal(css.includes("font-size: 16pt"), false);
assert.equal(css.includes("BAGWIN"), false);
assert.match(css, /page:\s*roll-label/);
assert.match(readFileSync(new URL("../src/styles/features/raw-material.css", import.meta.url), "utf8"), /@import "\.\/raw-material-roll-label\.css"/);

console.log("raw-material roll label checks passed: locked 76×130mm template, company facts, and scannable roll-code QR.");
