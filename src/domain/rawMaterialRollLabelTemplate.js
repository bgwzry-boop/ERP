// Frozen geometry of the approved 76×130mm 卷料标签 mock.
// Positions are the mock's ruled grid mapped onto the waybill.
// Only per-roll text, the QR, and the Code 39 may change.

const sum = (values) => values.reduce((total, value) => total + value, 0);
const mm = (value) => `${value.toFixed(2)}mm`;

export const RAW_MATERIAL_ROLL_LABEL_TEMPLATE = Object.freeze({
  pageWidthMm: 76,
  pageHeightMm: 130,
  paddingRightMm: 1.63,
  paddingBottomMm: 1.47,
  paddingLeftMm: 1.54,
  headerMm: 9.14,
  columnsMm: Object.freeze([14.38, 11.04, 11.08, 10.29, 26.04]),
  rowsMm: Object.freeze([7.84, 8.41, 8.74, 8.8, 8.69, 8.8, 8.35, 8.35, 7.79, 8.58, 8.4, 8.41, 18.23]),
  qrMm: 24,
  barcodeMm: 9.2,
});

const template = RAW_MATERIAL_ROLL_LABEL_TEMPLATE;
const tableWidthMm = sum(template.columnsMm);
const tableHeightMm = sum(template.rowsMm);

if (Math.abs(template.paddingLeftMm + tableWidthMm + template.paddingRightMm - template.pageWidthMm) > 0.02) {
  throw new Error("Roll label columns do not fill 76mm");
}
if (Math.abs(template.headerMm + tableHeightMm + template.paddingBottomMm - template.pageHeightMm) > 0.02) {
  throw new Error("Roll label rows do not fill 130mm");
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
  height: ${mm(template.pageHeightMm)};
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
  flex: 0 0 ${mm(template.headerMm)};
  align-items: center;
  height: ${mm(template.headerMm)};
  padding: 0 0.4mm;
}

.raw-material-roll-label-brand {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 1.2mm;
}

.raw-material-roll-label-mark {
  display: block;
  width: 6.40mm;
  height: 6.40mm;
}

.raw-material-roll-label-brand strong {
  color: #111;
  font-size: 12pt;
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
  font-size: 12pt;
  font-weight: 800;
  letter-spacing: 0.04em;
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
  padding-inline: 0.2mm;
  font-size: 7.5pt;
  font-weight: 600;
  text-align: center;
}

.raw-material-roll-label-grid .is-product td,
.raw-material-roll-label-grid .is-standard td,
.raw-material-roll-label-grid .is-pair td,
.raw-material-roll-label-grid .is-company td {
  padding-left: 1.80mm;
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0;
  text-align: left;
}

.raw-material-roll-label-grid .is-measure {
  padding-left: 3.00mm;
  font-size: 10pt;
  font-weight: 800;
  letter-spacing: 0;
  text-align: left;
}

.raw-material-roll-label-grid .is-banner td {
  font-size: 10pt;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-align: center;
}

.raw-material-roll-label-grid .is-qr {
  padding: 0.70mm 0.70mm 0;
  line-height: 0;
  text-align: center;
  vertical-align: top;
  white-space: normal;
}

.raw-material-roll-label-grid .is-barcode {
  padding: 1.60mm 2.20mm 1.10mm;
  text-align: center;
  white-space: normal;
}

.raw-material-roll-print-label .raw-material-qr {
  display: block;
  width: ${mm(template.qrMm)};
  height: ${mm(template.qrMm)};
  margin: 0 auto;
  fill: #000;
}

.raw-material-roll-print-label .raw-material-code39 {
  display: block;
  width: 100%;
  height: ${mm(template.barcodeMm)};
  fill: #000;
}

.raw-material-roll-print-label .raw-material-roll-code-text {
  display: block;
  margin-top: 0.80mm;
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "WenQuanYi Micro Hei", sans-serif;
  font-size: 8pt;
  font-weight: 800;
  letter-spacing: 0.06em;
  line-height: 1;
  text-align: center;
}

${template.rowsMm.map((_, index) => rowRule(index)).join("\n")}
`;
}
