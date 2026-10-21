// Frozen 卷料标签 geometry. The outer frame is the approved mock scaled evenly
// to 76mm wide on 76×130mm stock. Three black sizes only: 11pt title / spec
// numbers / outbound hint, 7.5pt values, 7pt labels. Only per-roll text, the
// QR, and the Code 39 may change.

const sum = (values) => values.reduce((total, value) => total + value, 0);
const mm = (value) => `${value.toFixed(2)}mm`;

export const RAW_MATERIAL_ROLL_LABEL_TEMPLATE = Object.freeze({
  pageWidthMm: 76,
  pageHeightMm: 130,
  artworkHeightMm: 103.49,
  paddingRightMm: 1.63,
  paddingBottomMm: 1.14,
  paddingLeftMm: 1.54,
  headerMm: 7.13,
  columnsMm: Object.freeze([14.38, 10.99, 11.13, 10.29, 26.04]),
  rowsMm: Object.freeze([6.11, 6.55, 6.83, 6.83, 6.83, 6.83, 6.47, 6.51, 6.16, 6.64, 6.55, 6.51, 16.40]),
  qrMm: 25.4,
  barcodeMm: 12,
});

const template = RAW_MATERIAL_ROLL_LABEL_TEMPLATE;
const tableWidthMm = sum(template.columnsMm);
const tableHeightMm = sum(template.rowsMm);

if (Math.abs(template.paddingLeftMm + tableWidthMm + template.paddingRightMm - template.pageWidthMm) > 0.02) {
  throw new Error("Roll label columns do not fill 76mm");
}
if (Math.abs(template.headerMm + tableHeightMm + template.paddingBottomMm - template.artworkHeightMm) > 0.02) {
  throw new Error("Roll label artwork does not match the approved mock height");
}
if (new Set(template.rowsMm.slice(2, 6)).size !== 1) {
  throw new Error("The four spec rows must share one height");
}
if (template.barcodeMm < 12) {
  throw new Error("Code 39 bar height must be at least 12mm");
}

const rowRule = (index) => `.raw-material-roll-label-grid tr:nth-child(${index + 1}) { height: ${mm(template.rowsMm[index])}; }`;

export function buildRawMaterialRollLabelCss() {
  const [columnA, columnB, columnC, columnD, columnE] = template.columnsMm;
  return `/* Generated from src/domain/rawMaterialRollLabelTemplate.js. Do not edit by hand. */
@page roll-label {
  size: ${mm(template.pageWidthMm)} ${mm(template.pageHeightMm)};
  margin: 0;
}

.raw-material-roll-print-label {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: ${mm(template.pageWidthMm)};
  height: ${mm(template.artworkHeightMm)};
  margin: 0;
  padding: 0 ${mm(template.paddingRightMm)} ${mm(template.paddingBottomMm)} ${mm(template.paddingLeftMm)};
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
  align-items: flex-start;
  height: ${mm(template.headerMm)};
  padding: 0.35mm 0 0 0.85mm;
}

.raw-material-roll-label-brand {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.70mm;
}

.raw-material-roll-label-mark {
  display: block;
  width: 5.80mm;
  height: 5.80mm;
}

.raw-material-roll-label-brand strong {
  color: #111;
  margin-top: 0.50mm;
  font-size: 11pt;
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
  font-size: 11pt;
  font-weight: 800;
  letter-spacing: 0.06em;
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
  border: 0.25mm solid #111;
  padding: 0 0.4mm;
  color: #111;
  font-weight: 700;
  line-height: 1;
  vertical-align: middle;
  white-space: nowrap;
}

.raw-material-roll-label-grid th {
  padding-left: 0.65mm;
  padding-right: 0.30mm;
  font-size: 7pt;
  font-weight: 600;
  text-align: left;
}

.raw-material-roll-label-grid .is-product td,
.raw-material-roll-label-grid .is-standard td,
.raw-material-roll-label-grid .is-pair td,
.raw-material-roll-label-grid .is-company td {
  padding-left: 1.65mm;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0;
  text-align: left;
}

.raw-material-roll-label-grid .is-pair td:last-child {
  padding-left: 2.80mm;
}

.raw-material-roll-label-grid .is-measure {
  padding-right: 1.50mm;
  padding-left: 0.40mm;
  font-size: 11pt;
  font-weight: 800;
  letter-spacing: 0;
  text-align: right;
}

.raw-material-roll-label-grid .is-banner td {
  font-size: 11pt;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-align: center;
}

.raw-material-roll-label-grid .is-qr {
  position: relative;
  padding: 0;
  line-height: 0;
  vertical-align: top;
  white-space: normal;
}

.raw-material-roll-label-grid .is-barcode {
  padding: 0.45mm 0 0.35mm;
  text-align: center;
  white-space: normal;
}

.raw-material-roll-print-label .raw-material-qr {
  position: absolute;
  top: 0.40mm;
  right: 0.32mm;
  display: block;
  width: ${mm(template.qrMm)};
  height: ${mm(template.qrMm)};
  fill: #000;
}

.raw-material-roll-print-label .raw-material-code39 {
  display: block;
  width: 100%;
  height: ${mm(template.barcodeMm)};
  margin: 0;
  fill: #000;
}

.raw-material-roll-print-label .raw-material-roll-code-text {
  display: block;
  margin-top: 0.80mm;
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "WenQuanYi Micro Hei", sans-serif;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1;
  text-align: center;
}

${template.rowsMm.map((_, index) => rowRule(index)).join("\n")}
`;
}
