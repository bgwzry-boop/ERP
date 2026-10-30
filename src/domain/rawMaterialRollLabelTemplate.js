// Frozen geometry of the approved 卷料标签 mock.
// The mock is scaled evenly onto a 76mm width (px * 76/864). Rows are not
// stretched independently, so the grid, QR, and barcode keep one aspect.
// Only per-roll text, the QR, and the Code 39 may change.
//
// 2026-10-30: Yunda 76×130 face paper keeps preprinted logos in the top corners
// and small type in the bottom corners. The locked art is placed in the
// printable band (8mm top, 6mm bottom) at the largest uniform scale that still
// fits that band. Width is the limiting edge, so the scale stays 1; a taller
// scale would exceed 76mm and Chrome would shrink the page back down.

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
  // Logo safe band on the physical 76×130 Yunda sheet. Not an @page margin:
  // the print dialog's 边距「无」would discard a page margin.
  safeTopMm: 8,
  safeBottomMm: 6,
});

const template = RAW_MATERIAL_ROLL_LABEL_TEMPLATE;
const tableWidthMm = sum(template.columnsMm);
const tableHeightMm = sum(template.rowsMm);

// Largest uniform scale of the locked 76×101.33 art inside the logo-safe band.
const printableWidthMm = template.pageWidthMm;
const printableHeightMm = template.pageHeightMm - template.safeTopMm - template.safeBottomMm;
export const RAW_MATERIAL_ROLL_LABEL_PRINT_SCALE = Math.min(
  printableWidthMm / template.pageWidthMm,
  printableHeightMm / template.artworkHeightMm,
);

export function rawMaterialRollLabelPlacement() {
  const scale = RAW_MATERIAL_ROLL_LABEL_PRINT_SCALE;
  const widthMm = roundMm(template.pageWidthMm * scale);
  const heightMm = roundMm(template.artworkHeightMm * scale);
  const offsetTopMm = template.safeTopMm;
  const bottomGapMm = roundMm(template.pageHeightMm - offsetTopMm - heightMm);
  return {
    scale,
    pageWidthMm: template.pageWidthMm,
    pageHeightMm: template.pageHeightMm,
    offsetTopMm,
    widthMm,
    heightMm,
    bottomGapMm,
    safeTopMm: template.safeTopMm,
    safeBottomMm: template.safeBottomMm,
    qrMm: roundMm(template.qrMm * scale),
  };
}

function roundMm(value) {
  return Math.round(value * 100) / 100;
}

const placement = rawMaterialRollLabelPlacement();

if (Math.abs(template.paddingLeftMm + tableWidthMm + template.paddingRightMm - template.pageWidthMm) > 0.02) {
  throw new Error("Roll label columns do not fill 76mm");
}
if (placement.offsetTopMm + placement.heightMm > template.pageHeightMm) {
  throw new Error("Roll label artwork must fit below the page offset");
}
if (placement.bottomGapMm + 0.02 < template.safeBottomMm) {
  throw new Error("Roll label artwork overlaps the bottom logo band");
}
if (Math.abs(template.paddingTopMm + template.headerMm + tableHeightMm + template.paddingBottomMm - template.artworkHeightMm) > 0.02) {
  throw new Error("Roll label artwork does not match the approved mock height");
}
if (placement.scale > 1 && placement.widthMm - template.pageWidthMm > 0.02) {
  throw new Error("Uniform roll-label scale must not exceed the 76mm paper width");
}

// Long per-roll text (supplier full names, inbound numbers) must stay on the
// label instead of being clipped by the fixed cells. Shrink the type to fit one
// line down to minPt; past that, wrap onto two lines at minPt.
const PT_TO_MM = 25.4 / 72;
const isWideChar = (char) => /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/.test(char);
export function estimateRollLabelTextEm(text) {
  return Array.from(String(text ?? "")).reduce((total, char) => total + (isWideChar(char) ? 1 : 0.56), 0);
}

const CELL_PADDING_MM = 1.65 + 0.4;
export const RAW_MATERIAL_ROLL_LABEL_FIT_CELLS = Object.freeze({
  supplier: Object.freeze({ widthMm: template.columnsMm[4] - CELL_PADDING_MM, basePt: 7.5, minPt: 5.5 }),
  inboundNo: Object.freeze({ widthMm: template.columnsMm[1] + template.columnsMm[2] - CELL_PADDING_MM, basePt: 7, minPt: 5.5 }),
});

export function fitRollLabelCellText(text, cell) {
  const em = estimateRollLabelTextEm(text);
  if (!em) return { fontPt: cell.basePt, wrap: false };
  const fitPt = Math.floor((cell.widthMm / (em * PT_TO_MM)) * 4) / 4;
  if (fitPt >= cell.basePt) return { fontPt: cell.basePt, wrap: false };
  if (fitPt >= cell.minPt) return { fontPt: fitPt, wrap: false };
  return { fontPt: cell.minPt, wrap: true };
}

const rowRule = (index) => `.raw-material-roll-label-grid tr:nth-child(${index + 1}) { height: ${mm(template.rowsMm[index])}; }`;

export function buildRawMaterialRollLabelCss() {
  const [columnA, columnB, columnC, columnD, columnE] = template.columnsMm;
  return `/* Generated from src/domain/rawMaterialRollLabelTemplate.js. Do not edit by hand. */
@page roll-label {
  size: ${mm(template.pageWidthMm)} ${mm(template.pageHeightMm)};
  margin: 0;
}

/* The print dialog's 边距「无」overrides @page margins, so the offset lives on the page box. */
.raw-material-roll-print-page {
  box-sizing: border-box;
  width: ${mm(template.pageWidthMm)};
  height: ${mm(template.pageHeightMm)};
  margin: 0;
  padding-top: ${mm(placement.offsetTopMm)};
  overflow: hidden;
  page: roll-label;
}

.raw-material-roll-print-label {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: ${mm(placement.widthMm)};
  height: ${mm(placement.heightMm)};
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

.raw-material-roll-label-grid td.is-fit-wrap {
  padding-top: 0.2mm;
  padding-bottom: 0.2mm;
  line-height: 1.08;
  white-space: normal;
  word-break: break-all;
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
  width: ${mm(placement.qrMm)};
  height: ${mm(placement.qrMm)};
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
