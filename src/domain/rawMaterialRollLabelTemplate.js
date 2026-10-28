// 76×130mm 韵达强力面单。内容铺满纸张高度，只做等比排版。
// 顶栏韵达标识是纸上自带的，模板不打印它；preprintedHeaderClearanceMm 把正文让开这段。
// 字号和行高按版面重排，禁止 scaleX / scaleY 或非等比拉伸。二维码宽高必须相等。
// 打印时纸张选 76×130，缩放 100% / 实际大小，不要选「适应页面」。

const sum = (values) => values.reduce((total, value) => total + value, 0);
const mm = (value) => `${value.toFixed(2)}mm`;

export const RAW_MATERIAL_ROLL_LABEL_PRINT_SETUP =
  "纸张 76×130，缩放 100%（实际大小），不要选「适应页面」。";

export const RAW_MATERIAL_ROLL_LABEL_PRINT_PAGE_CSS =
  "@page{size:76mm 130mm;margin:0}html,body{margin:0!important;padding:0!important}";

export const RAW_MATERIAL_ROLL_LABEL_TEMPLATE = Object.freeze({
  pageWidthMm: 76,
  pageHeightMm: 130,
  preprintedHeaderClearanceMm: 8,
  paddingTopMm: 8,
  paddingRightMm: 0.7,
  paddingBottomMm: 0.5,
  paddingLeftMm: 0.7,
  headerMm: 9.2,
  columnsMm: Object.freeze([15, 14, 9.2, 11.2, 25.2]),
  rowsMm: Object.freeze([8.1, 7.5, 7.9, 7.9, 7.9, 7.9, 7.7, 7.7, 8.3, 7.1, 6.9, 7.1, 20.3]),
  qrQuietInsetMm: 1.6,
  barcodeHeightMm: 13.2,
});

const template = RAW_MATERIAL_ROLL_LABEL_TEMPLATE;
const tableWidthMm = sum(template.columnsMm);
const tableHeightMm = sum(template.rowsMm);
const qrSpanMm = sum(template.rowsMm.slice(1, 6));
const qrMm = Math.round(Math.min(template.columnsMm[4] - template.qrQuietInsetMm, qrSpanMm - template.qrQuietInsetMm) * 100) / 100;
const barcodeWidthMm = Math.round((tableWidthMm - 4.2) * 100) / 100;

if (Math.abs(template.paddingLeftMm + tableWidthMm + template.paddingRightMm - template.pageWidthMm) > 0.02) {
  throw new Error("Roll label columns do not fill 76mm");
}
if (Math.abs(template.paddingTopMm + template.headerMm + tableHeightMm + template.paddingBottomMm - template.pageHeightMm) > 0.02) {
  throw new Error("Roll label rows do not fill 130mm");
}
if (template.paddingTopMm !== template.preprintedHeaderClearanceMm) {
  throw new Error("Roll label top padding must stay equal to the preprinted header clearance");
}
if (!(qrMm >= 20) || Math.abs(qrMm - (template.columnsMm[4] - template.qrQuietInsetMm)) > 0.02) {
  throw new Error("Roll label QR must stay square inside the specification cell");
}

const rowRule = (index) => `.raw-material-roll-label-grid tr:nth-child(${index + 1}) { height: ${mm(template.rowsMm[index])}; }`;

export function buildRawMaterialRollLabelCss() {
  const [columnA, columnB, columnC, columnD, columnE] = template.columnsMm;
  return `/* Generated from src/domain/rawMaterialRollLabelTemplate.js. Do not edit by hand.
   纸张 76.00mm × 130.00mm。打印缩放 100% / 实际大小，边距无，不要选「适应页面」。
   顶栏韵达标识是纸上自带的，模板不打印。 */
@page roll-label {
  size: ${mm(template.pageWidthMm)} ${mm(template.pageHeightMm)};
  margin: 0;
}

.raw-material-roll-print-label {
  --roll-label-header-clearance: ${mm(template.preprintedHeaderClearanceMm)};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: ${mm(template.pageWidthMm)};
  height: ${mm(template.pageHeightMm)};
  margin: 0;
  padding: ${mm(template.paddingTopMm)} ${mm(template.paddingRightMm)} ${mm(template.paddingBottomMm)} ${mm(template.paddingLeftMm)};
  overflow: hidden;
  page: roll-label;
  background: #fff;
  color: #111;
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Source Han Sans SC", "WenQuanYi Micro Hei", "Droid Sans Fallback", sans-serif;
  font-synthesis: none;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.raw-material-roll-label-header {
  position: relative;
  display: flex;
  box-sizing: border-box;
  flex: 0 0 ${mm(template.headerMm)};
  align-items: center;
  height: ${mm(template.headerMm)};
  padding: 0 0 0 0.40mm;
}

.raw-material-roll-label-brand {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.80mm;
}

.raw-material-roll-label-mark {
  display: block;
  width: 7.40mm;
  height: 7.40mm;
}

.raw-material-roll-label-brand strong {
  color: #111;
  font-size: 14pt;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1;
}

.raw-material-roll-label-header h1 {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  color: #111;
  font-size: 16pt;
  font-weight: 800;
  letter-spacing: 0.08em;
  line-height: 1;
  text-align: center;
}

.raw-material-roll-label-grid {
  width: ${mm(tableWidthMm)};
  height: ${mm(tableHeightMm)};
  border-collapse: collapse;
  border-spacing: 0;
  table-layout: fixed;
}

.raw-material-roll-label-col-a { width: ${mm(columnA)}; }
.raw-material-roll-label-col-b { width: ${mm(columnB)}; }
.raw-material-roll-label-col-c { width: ${mm(columnC)}; }
.raw-material-roll-label-col-d { width: ${mm(columnD)}; }
.raw-material-roll-label-col-e { width: ${mm(columnE)}; }

.raw-material-roll-label-grid th,
.raw-material-roll-label-grid td {
  box-sizing: border-box;
  margin: 0;
  overflow: hidden;
  border: 0.28mm solid #111;
  padding: 0 0.35mm;
  color: #111;
  font-weight: 700;
  line-height: 1.05;
  vertical-align: middle;
  white-space: nowrap;
}

.raw-material-roll-label-grid th {
  padding-inline: 0.12mm;
  font-size: 10pt;
  font-weight: 700;
  text-align: center;
}

.raw-material-roll-label-grid .is-spec th:not([rowspan]) {
  font-size: 8.5pt;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.raw-material-roll-label-grid .is-pair th,
.raw-material-roll-label-grid .is-company th {
  font-size: 9.5pt;
  font-weight: 700;
}

.raw-material-roll-label-grid .is-product td {
  padding-left: 1.20mm;
  font-size: 13.5pt;
  font-weight: 800;
  letter-spacing: 0;
  text-align: left;
}

.raw-material-roll-label-grid .is-standard td {
  padding-left: 1.20mm;
  font-size: 11pt;
  font-weight: 800;
  letter-spacing: 0;
  text-align: left;
}

.raw-material-roll-label-grid .is-pair td {
  padding-left: 1.10mm;
  font-size: 12pt;
  font-weight: 800;
  letter-spacing: 0;
  text-align: left;
}

.raw-material-roll-label-grid .is-company td {
  padding-left: 1.20mm;
  font-size: 10.5pt;
  font-weight: 700;
  letter-spacing: 0;
  text-align: left;
}

.raw-material-roll-label-grid .is-measure {
  padding-left: 1.40mm;
  font-size: 16pt;
  font-weight: 800;
  letter-spacing: 0;
  text-align: left;
}

.raw-material-roll-label-grid .is-pair td.is-inbound-no {
  font-size: 9pt;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.raw-material-roll-label-grid .is-pair td.is-date {
  font-size: 12pt;
  font-weight: 800;
}

.raw-material-roll-label-grid .is-banner td {
  font-size: 15pt;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-align: center;
}

.raw-material-roll-label-grid .is-qr {
  position: relative;
  padding: 0;
  line-height: 0;
  vertical-align: middle;
  white-space: normal;
}

.raw-material-roll-label-grid .is-barcode {
  padding: 0.70mm 0 0.30mm;
  text-align: center;
  white-space: normal;
}

.raw-material-roll-print-label .raw-material-qr {
  position: absolute;
  left: 50%;
  top: 50%;
  display: block;
  width: ${mm(qrMm)};
  height: ${mm(qrMm)};
  transform: translate(-50%, -50%);
  fill: #000;
}

.raw-material-roll-print-label .raw-material-code39 {
  display: block;
  width: ${mm(barcodeWidthMm)};
  height: ${mm(template.barcodeHeightMm)};
  margin: 0.30mm auto 0;
  fill: #000;
}

.raw-material-roll-print-label .raw-material-roll-code-text {
  display: block;
  margin-top: 0.45mm;
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "WenQuanYi Micro Hei", sans-serif;
  font-size: 11pt;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1;
  text-align: center;
}

${template.rowsMm.map((_, index) => rowRule(index)).join("\n")}
`;
}
