// Locked 卷料标签 geometry, then one uniform scale into the Yunda printable area.
// The approved mock stays the content box (px * 76/864). Field structure, column
// ratios, row ratios and type hierarchy do not change. Width and height are never
// scaled separately: scale = min(printableWidth / contentWidth, printableHeight / contentHeight).
// The preprinted 韵达 top bar and bottom hint are outside that printable box, so the
// block is not stretched to the 76×130 outer frame. The scaled block is centered
// vertically and both margins stay at least 2.5mm. The QR is square before scaling.
// Print at 100% on 76×130 stock: do not use 适应宽度, and turn off 纵向压缩.

const sum = (values) => values.reduce((total, value) => total + value, 0);
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const mm = (value) => `${round2(value).toFixed(2)}mm`;
const MINIMUM_VERTICAL_MARGIN_MM = 2.5;

export const RAW_MATERIAL_ROLL_LABEL_PRINT_SETUP =
  "纸张 76×130，缩放 100%，勿「适应宽度」，关闭纵向压缩。";

export const RAW_MATERIAL_ROLL_LABEL_PRINT_PAGE_CSS =
  "@page{size:76mm 130mm;margin:0}html,body{margin:0!important;padding:0!important}";

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
  // Square side taken from the locked mock's QR width. The old 26.90mm height was a non-uniform stretch.
  qrSideMm: 25.61,
  qrLeftMm: 0.38,
  qrTopMm: 0.47,
  barcodeWidthMm: 63.14,
  barcodeOffsetMm: 5.01,
  barcodeMm: 7.39,
  // Preprinted Yunda chrome is not part of the scale target.
  yundaPreprintedTopMm: 8,
  yundaPreprintedBottomMm: 6,
  // Half the collapsed outer stroke, so the border stays inside the sheet.
  printableInsetXMm: 0.15,
});

const template = RAW_MATERIAL_ROLL_LABEL_TEMPLATE;
const tableWidthMm = sum(template.columnsMm);
const tableHeightMm = sum(template.rowsMm);

if (Math.abs(template.paddingLeftMm + tableWidthMm + template.paddingRightMm - template.pageWidthMm) > 0.02) {
  throw new Error("Roll label columns do not fill the locked 76mm content width");
}
if (Math.abs(template.paddingTopMm + template.headerMm + tableHeightMm + template.paddingBottomMm - template.artworkHeightMm) > 0.02) {
  throw new Error("Roll label artwork does not match the approved mock height");
}

export function resolveRawMaterialRollLabelPlacement(source = template) {
  const contentWidthMm = round2(sum(source.columnsMm));
  const contentHeightMm = round2(source.headerMm + sum(source.rowsMm));
  const printableWidthMm = round2(source.pageWidthMm - source.printableInsetXMm * 2);
  const printableHeightMm = round2(source.pageHeightMm - source.yundaPreprintedTopMm - source.yundaPreprintedBottomMm);
  const widthScale = printableWidthMm / contentWidthMm;
  const heightScale = printableHeightMm / contentHeightMm;
  const scale = Math.min(widthScale, heightScale);
  const scaledWidthMm = round2(contentWidthMm * scale);
  const scaledHeightMm = round2(contentHeightMm * scale);
  const marginTopMm = round2((printableHeightMm - scaledHeightMm) / 2);
  const marginBottomMm = round2(printableHeightMm - scaledHeightMm - marginTopMm);
  const offsetXMm = round2((source.pageWidthMm - scaledWidthMm) / 2);
  const offsetYMm = round2(source.yundaPreprintedTopMm + marginTopMm);
  const placement = {
    contentWidthMm,
    contentHeightMm,
    printableWidthMm,
    printableHeightMm,
    widthScale,
    heightScale,
    scale,
    scaledWidthMm,
    scaledHeightMm,
    marginTopMm,
    marginBottomMm,
    offsetXMm,
    offsetYMm,
  };
  if (!(scale > 0) || Math.abs(scale - widthScale) > 1e-9 && Math.abs(scale - heightScale) > 1e-9) {
    throw new Error("Roll label scale must be the minimum of the two printable ratios");
  }
  if (Math.abs((scaledWidthMm / contentWidthMm) - (scaledHeightMm / contentHeightMm)) > 0.002) {
    throw new Error("Roll label placement must keep one scale for width and height");
  }
  if (marginTopMm < MINIMUM_VERTICAL_MARGIN_MM || marginBottomMm < MINIMUM_VERTICAL_MARGIN_MM) {
    throw new Error("Roll label vertical margins must stay at least 2.5mm");
  }
  if (Math.abs(marginTopMm - marginBottomMm) > 0.05) {
    throw new Error("Roll label must stay vertically centered in the printable area");
  }
  return placement;
}

const placement = resolveRawMaterialRollLabelPlacement(template);

function scaleParts(values, scale, targetSum) {
  const scaled = values.map((value) => round2(value * scale));
  const drift = round2(targetSum - sum(scaled));
  scaled[scaled.length - 1] = round2(scaled[scaled.length - 1] + drift);
  return scaled;
}

export function buildRawMaterialRollLabelCss() {
  const fit = resolveRawMaterialRollLabelPlacement(template);
  const scaledHeaderMm = round2(template.headerMm * fit.scale);
  const scaledColumns = scaleParts(template.columnsMm, fit.scale, fit.scaledWidthMm);
  const scaledRows = scaleParts(template.rowsMm, fit.scale, round2(fit.scaledHeightMm - scaledHeaderMm));
  const [columnA, columnB, columnC, columnD, columnE] = scaledColumns;
  const sMm = (value) => mm(value * fit.scale);
  const sPt = (value) => `${round2(value * fit.scale).toFixed(2)}pt`;
  const qrSideMm = round2(template.qrSideMm * fit.scale);
  const rowRule = (height, index) => `.raw-material-roll-label-grid tr:nth-child(${index + 1}) { height: ${mm(height)}; }`;
  return `/* Generated from src/domain/rawMaterialRollLabelTemplate.js. Do not edit by hand.
   Locked content ${fit.contentWidthMm.toFixed(2)}mm × ${fit.contentHeightMm.toFixed(2)}mm.
   Printable area ${fit.printableWidthMm.toFixed(2)}mm × ${fit.printableHeightMm.toFixed(2)}mm
   (page ${mm(template.pageWidthMm)} × ${mm(template.pageHeightMm)} minus 韵达顶栏 ${mm(template.yundaPreprintedTopMm)} and 底提示 ${mm(template.yundaPreprintedBottomMm)}).
   Uniform scale ${fit.scale.toFixed(4)} = min(width ratio, height ratio). Width and height share that one scale.
   Placed at ${mm(fit.offsetXMm)}, ${mm(fit.offsetYMm)}; vertical margins ${mm(fit.marginTopMm)} / ${mm(fit.marginBottomMm)}.
   ${RAW_MATERIAL_ROLL_LABEL_PRINT_SETUP} */
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
  padding: ${mm(fit.offsetYMm)} ${mm(round2(template.pageWidthMm - fit.offsetXMm - fit.scaledWidthMm))} ${mm(round2(template.pageHeightMm - fit.offsetYMm - fit.scaledHeightMm))} ${mm(fit.offsetXMm)};
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
  flex: 0 0 ${mm(scaledHeaderMm)};
  align-items: flex-start;
  height: ${mm(scaledHeaderMm)};
  padding: ${sMm(0.35)} 0 0 ${sMm(0.85)};
}

.raw-material-roll-label-brand {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: ${sMm(0.70)};
}

.raw-material-roll-label-mark {
  display: block;
  width: ${sMm(5.80)};
  height: ${sMm(5.80)};
}

.raw-material-roll-label-brand strong {
  color: #111;
  margin-top: ${sMm(0.50)};
  font-size: ${sPt(11)};
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
  font-size: ${sPt(11.5)};
  font-weight: 800;
  letter-spacing: 0.12em;
  line-height: 1;
  text-align: center;
  transform: translate(${sMm(0.40)}, ${sMm(-0.40)});
}

.raw-material-roll-label-grid {
  width: ${mm(fit.scaledWidthMm)};
  height: ${mm(round2(fit.scaledHeightMm - scaledHeaderMm))};
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
  border: ${sMm(0.25)} solid #111;
  padding: 0 ${sMm(0.4)};
  color: #111;
  font-weight: 700;
  line-height: 1;
  vertical-align: middle;
  white-space: nowrap;
}

.raw-material-roll-label-grid th {
  padding-inline: ${sMm(0.2)};
  font-size: ${sPt(7.5)};
  font-weight: 600;
  text-align: center;
}

.raw-material-roll-label-grid .is-spec th:not([rowspan]),
.raw-material-roll-label-grid .is-pair th,
.raw-material-roll-label-grid .is-company th {
  font-size: ${sPt(7)};
}

.raw-material-roll-label-grid .is-spec th:not([rowspan]) {
  letter-spacing: -0.06em;
}

.raw-material-roll-label-grid .is-spec th[rowspan] {
  transform: translateY(${sMm(-0.55)});
}

.raw-material-roll-label-grid .is-product td,
.raw-material-roll-label-grid .is-standard td,
.raw-material-roll-label-grid .is-pair td {
  padding-left: ${sMm(1.65)};
  font-size: ${sPt(7.5)};
  font-weight: 700;
  letter-spacing: 0;
  text-align: left;
}

.raw-material-roll-label-grid .is-company td {
  padding-left: ${sMm(1.65)};
  font-size: ${sPt(7)};
  font-weight: 700;
  letter-spacing: -0.02em;
  text-align: left;
}

.raw-material-roll-label-grid .is-pair td:last-child {
  padding-left: ${sMm(2.80)};
}

.raw-material-roll-label-grid .is-measure {
  padding-left: ${sMm(2.90)};
  font-size: ${sPt(9)};
  font-weight: 800;
  letter-spacing: 0;
  text-align: left;
}

.raw-material-roll-label-grid .is-pair td.is-inbound-no,
.raw-material-roll-label-grid .is-pair td.is-date {
  font-size: ${sPt(7)};
  font-weight: 700;
}

.raw-material-roll-label-grid .is-pair td.is-inbound-no {
  letter-spacing: -0.04em;
}

.raw-material-roll-label-grid .is-banner td {
  font-size: ${sPt(9.5)};
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
  padding: ${sMm(1.85)} 0 ${sMm(0.40)};
  text-align: center;
  white-space: normal;
}

.raw-material-roll-print-label .raw-material-qr {
  position: absolute;
  left: ${sMm(template.qrLeftMm)};
  top: ${sMm(template.qrTopMm)};
  display: block;
  width: ${mm(qrSideMm)};
  height: ${mm(qrSideMm)};
  fill: #000;
}

.raw-material-roll-print-label .raw-material-code39 {
  display: block;
  width: ${sMm(template.barcodeWidthMm)};
  height: ${sMm(template.barcodeMm)};
  margin: 0 0 0 ${sMm(template.barcodeOffsetMm)};
  fill: #000;
}

.raw-material-roll-print-label .raw-material-roll-code-text {
  display: block;
  margin-top: ${sMm(0.50)};
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "WenQuanYi Micro Hei", sans-serif;
  font-size: ${sPt(7.4)};
  font-weight: 700;
  letter-spacing: 0;
  transform: translateX(${sMm(0.50)});
  line-height: 1;
  text-align: center;
}

${scaledRows.map((height, index) => rowRule(height, index)).join("\n")}
`;
}
