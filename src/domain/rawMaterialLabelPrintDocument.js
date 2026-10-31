import { buildRawMaterialRollLabelCss, RAW_MATERIAL_ROLL_LABEL_TEMPLATE } from "./rawMaterialRollLabelTemplate.js";

const page = RAW_MATERIAL_ROLL_LABEL_TEMPLATE;

// A document that contains only the roll label. The desktop shell pins
// html/body/#root to min-width:1180px; if that shell is still in the print
// layout, Chrome shrinks the 76mm label (about a 67% floor). This document
// never includes that shell.
export function buildRawMaterialLabelPrintDocument(sheetHtml = "") {
  const width = page.pageWidthMm.toFixed(2);
  const height = page.pageHeightMm.toFixed(2);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>卷料标签</title>
<style>
@page {
  size: ${width}mm ${height}mm;
  margin: 0;
}
html, body {
  margin: 0;
  padding: 0;
  width: ${width}mm;
  min-width: 0 !important;
  height: auto;
  background: #fff;
}
${buildRawMaterialRollLabelCss()}
.raw-material-label-print-sheet {
  display: block;
  width: ${width}mm;
  margin: 0;
}
.raw-material-roll-print-page {
  break-after: page;
  page-break-after: always;
}
.raw-material-roll-print-page:last-child {
  break-after: auto;
  page-break-after: auto;
}
</style>
</head>
<body>${sheetHtml}</body>
</html>`;
}
