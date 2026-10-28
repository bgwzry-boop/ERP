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
const printHook = readFileSync(new URL("../src/features/raw-materials/useInboundPageState.js", import.meta.url), "utf8");
const officeFlow = readFileSync(new URL("../src/features/raw-materials/OfficeInboundFlow.jsx", import.meta.url), "utf8");
const mobileReceiving = readFileSync(new URL("../src/features/raw-materials/RawMaterialMobileReceiving.jsx", import.meta.url), "utf8");
assert.equal(css, buildRawMaterialRollLabelCss(), "label CSS must stay equal to the locked template");
for (const text of ["品名称", "执行标准", "产品规格", "幅宽cm", "卷长m", "克重g/㎡", "重量kg", "出库时扫描本卷码", "公司名称", "联系方式", "公司地址", "卷料标签", "袋袋赢"]) {
  assert.equal(sheet.includes(text), true, `print sheet should render ${text}`);
}
assert.equal(sheet.includes("BAGWIN"), false);
assert.equal(sheet.includes('colSpan="4"'), true);
assert.equal(sheet.includes('colSpan="5"'), true);
assert.match(css, /@page roll-label\s*\{[^}]*size:\s*76\.00mm 130\.00mm;\s*margin:\s*0;/s);
assert.match(css, /实际大小/);
assert.match(css, /不要选「适应页面」/);
assert.match(css, /\.raw-material-roll-print-label\s*\{[^}]*width:\s*76\.00mm;\s*height:\s*130\.00mm/s);
assert.equal(css.includes("101.33mm"), false, "the label must fill the 130mm stock instead of stopping at the old mock height");
assert.match(css, /\.is-standard td\s*\{[^}]*font-size:\s*11pt/s);
assert.match(css, /\.is-measure\s*\{[^}]*font-size:\s*16pt/s);
assert.match(css, /\.is-measure\s*\{[^}]*padding-left:\s*1\.40mm/s);
assert.match(css, /\.is-measure\s*\{[^}]*text-align:\s*left/s);
const qrBox = css.match(/\.raw-material-qr\s*\{[^}]*width:\s*([\d.]+)mm;\s*height:\s*\1mm/s);
assert.ok(qrBox, "QR box must be square");
assert.ok(Number(qrBox[1]) >= 20, "QR must stay large enough to scan");
assert.equal(css.includes("scaleX"), false);
assert.equal(css.includes("scaleY"), false);
assert.match(css, /\.raw-material-code39\s*\{[^}]*width:\s*70\.40mm;\s*height:\s*13\.20mm/s);
assert.match(css, /page:\s*roll-label/);
assert.equal(sheet.match(/preserveAspectRatio="xMidYMid meet"/g)?.length, 1);
assert.equal(sheet.match(/preserveAspectRatio="none"/g)?.length, 1, "only the Code 39 may ignore aspect ratio, and only to set bar height");
assert.match(printHook, /RAW_MATERIAL_ROLL_LABEL_PRINT_PAGE_CSS/);
assert.match(printHook, /不要用「适应页面」/);
assert.match(officeFlow, /RAW_MATERIAL_ROLL_LABEL_PRINT_SETUP/);
assert.match(mobileReceiving, /RAW_MATERIAL_ROLL_LABEL_PRINT_SETUP/);
assert.match(readFileSync(new URL("../src/styles/features/raw-material.css", import.meta.url), "utf8"), /@import "\.\/raw-material-roll-label\.css"/);

console.log("raw-material roll label checks passed: 76×130mm filled template, square QR, and 100% print setup.");
