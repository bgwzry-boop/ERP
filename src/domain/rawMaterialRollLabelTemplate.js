// Frozen geometry of the approved 卷料标签 mock.
// The mock is scaled evenly onto a 76mm width (px * 76/864). Rows are not
// stretched to fill the 130mm stock, so type, QR, and barcode stay the mock size.
// Only per-roll text, the QR, and the Code 39 may change.

const sum = (values) => values.reduce((total, value) => total + value, 0);
const mm = (value) => `${value.toFixed(2)}mm`;

export const RAW_MATERIAL_ROLL_LABEL_TEMPLATE = Object.freeze({
  pageWidthMm: 76,
  pageHeightMm: 130,
  artworkHeightMm: 101.33,
  paddingTopMm: 0,
  paddingRightMm: 1.63,
  paddingBottomMm: 1.14,
  paddingLeftMm: 1.54,
  headerMm: 7.13,
  columnsMm: Object.freeze([14.38, 10.99, 11.13, 10.29, 26.04]),
  rowsMm: Object.freeze([6.11, 6.55, 6.82, 6.86, 6.77, 6.86, 6.47, 6.51, 6.16, 6.64, 6.55, 6.51, 14.25]),
  qrMm: 25.4,
  barcodeMm: 7.39,
});

const template = RAW_MATERIAL_ROLL_LABEL_TEMPLATE;
const tableWidthMm = sum(template.columnsMm);
const tableHeightMm = sum(template.rowsMm);

if (Math.abs(template.paddingLeftMm + tableWidthMm + template.paddingRightMm - template.pageWidthMm) > 0.02) {
  throw new Error("Roll label columns do not fill 76mm");
}
if (Math.abs(template.paddingTopMm + template.headerMm + tableHeightMm + template.paddingBottomMm - template.artworkHeightMm) > 0.02) {
  throw new Error("Roll label artwork does not match the approved mock height");
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
  letter-spacing: -0.08em;
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
  font-size: 11.5pt;
  font-weight: 800;
  letter-spacing: 0.12em;
  line-height: 1;
  text-align: center;
  transform: translate(0.40mm, -0.40mm);
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

.raw-material-roll-label-grid .is-spec th:not([rowspan]),
.raw-material-roll-label-grid .is-pair th,
.raw-material-roll-label-grid .is-company th {
  font-size: 7pt;
}

.raw-material-roll-label-grid .is-spec th:not([rowspan]) {
  letter-spacing: -0.06em;
}

.raw-material-roll-label-grid .is-spec th[rowspan] {
  transform: translateY(-0.55mm);
}

.raw-material-roll-label-grid .is-product td,
.raw-material-roll-label-grid .is-standard td,
.raw-material-roll-label-grid .is-pair td {
  padding-left: 1.65mm;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0;
  text-align: left;
}

.raw-material-roll-label-grid .is-company td {
  padding-left: 1.65mm;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-align: left;
}

.raw-material-roll-label-grid .is-pair td:last-child {
  padding-left: 2.80mm;
}

.raw-material-roll-label-grid .is-measure {
  padding-left: 2.90mm;
  font-size: 9pt;
  font-weight: 800;
  letter-spacing: 0;
  text-align: left;
}

.raw-material-roll-label-grid .is-pair td.is-inbound-no,
.raw-material-roll-label-grid .is-pair td.is-date {
  font-size: 7pt;
  font-weight: 700;
}

.raw-material-roll-label-grid .is-pair td.is-inbound-no {
  letter-spacing: -0.04em;
}

.raw-material-roll-label-grid .is-banner td {
  font-size: 9.5pt;
  font-weight: 800;
  letter-spacing: 0.03em;
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
  padding: 1.85mm 0 0.40mm;
  text-align: center;
  white-space: normal;
}

.raw-material-roll-print-label .raw-material-qr {
  position: absolute;
  left: 0.38mm;
  top: 0.47mm;
  display: block;
  width: 25.61mm;
  height: 26.90mm;
  fill: #000;
}

.raw-material-roll-print-label .raw-material-code39 {
  display: block;
  width: 63.14mm;
  height: ${mm(template.barcodeMm)};
  margin: 0 0 0 5.01mm;
  fill: #000;
}

.raw-material-roll-print-label .raw-material-roll-code-text {
  display: block;
  margin-top: 0.50mm;
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "WenQuanYi Micro Hei", sans-serif;
  font-size: 7.4pt;
  font-weight: 700;
  letter-spacing: 0;
  transform: translateX(0.50mm);
  line-height: 1;
  text-align: center;
}

${template.rowsMm.map((_, index) => rowRule(index)).join("\n")}
`;
}
