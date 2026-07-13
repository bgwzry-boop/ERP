export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const XLSX_FILE_EXTENSION = ".xlsx";

export function buildXlsxWorkbookFromWorksheets(input = {}) {
  const worksheets = normalizeWorksheets(input.worksheets);
  const metadata = {
    title: cleanText(input.title) || "ERP Workbook",
    creator: cleanText(input.creator) || "ERP",
    createdAt: cleanText(input.createdAt) || new Date().toISOString(),
  };
  const files = [
    { path: "[Content_Types].xml", content: buildContentTypes(worksheets) },
    { path: "_rels/.rels", content: buildRootRels() },
    { path: "docProps/core.xml", content: buildCoreProperties(metadata) },
    { path: "docProps/app.xml", content: buildAppProperties(worksheets) },
    { path: "xl/workbook.xml", content: buildWorkbookXml(worksheets) },
    { path: "xl/_rels/workbook.xml.rels", content: buildWorkbookRels(worksheets) },
    { path: "xl/styles.xml", content: buildStyles() },
    ...worksheets.map((worksheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      content: buildWorksheet(worksheet),
    })),
  ];
  return createZipArchive(files);
}

export function buildXlsxWorkbookBase64(input = {}) {
  return bytesToBase64(buildXlsxWorkbookFromWorksheets(input));
}

export function cell(value, options = {}) {
  return { value, ...options };
}

function normalizeWorksheets(value) {
  const worksheets = Array.isArray(value) ? value : [];
  return worksheets.length
    ? worksheets.map((worksheet, index) => ({
        name: cleanText(worksheet.name) || `Sheet${index + 1}`,
        columns: Array.isArray(worksheet.columns) ? worksheet.columns : [],
        rows: Array.isArray(worksheet.rows) ? worksheet.rows : [],
        dataValidations: normalizeDataValidations(worksheet.dataValidations),
      }))
    : [{ name: "Sheet1", columns: [], rows: [] }];
}

function buildContentTypes(worksheets) {
  const sheetOverrides = worksheets
    .map(
      (_, index) =>
        ` <Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="xml" ContentType="application/xml"/>
 <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheetOverrides}
 <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
 <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
 <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function buildRootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
 <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
 <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildCoreProperties(metadata) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <dc:title>${escapeXmlText(metadata.title)}</dc:title>
 <dc:creator>${escapeXmlText(metadata.creator)}</dc:creator>
 <cp:lastModifiedBy>${escapeXmlText(metadata.creator)}</cp:lastModifiedBy>
 <dcterms:created xsi:type="dcterms:W3CDTF">${escapeXmlText(toIsoDate(metadata.createdAt))}</dcterms:created>
 <dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXmlText(toIsoDate(metadata.createdAt))}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppProperties(worksheets) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
 <Application>ERP P0</Application>
 <DocSecurity>0</DocSecurity>
 <ScaleCrop>false</ScaleCrop>
 <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${worksheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>
 <TitlesOfParts><vt:vector size="${worksheets.length}" baseType="lpstr">${worksheets.map((worksheet) => `<vt:lpstr>${escapeXmlText(worksheet.name)}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts>
</Properties>`;
}

function buildWorkbookXml(worksheets) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="18000" windowHeight="10000"/></bookViews>
 <sheets>
${worksheets.map((worksheet, index) => `  <sheet name="${escapeXmlAttribute(worksheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("\n")}
 </sheets>
 <calcPr calcId="0"/>
</workbook>`;
}

function buildWorkbookRels(worksheets) {
  const worksheetRels = worksheets
    .map(
      (_, index) =>
        ` <Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${worksheetRels}
 <Relationship Id="rId${worksheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function buildStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
 <numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;¥&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0"/></numFmts>
 <fonts count="6">
  <font><sz val="10"/><name val="Microsoft YaHei"/></font>
  <font><b/><sz val="15"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font>
  <font><b/><sz val="10"/><color rgb="FF1F2937"/><name val="Microsoft YaHei"/></font>
  <font><b/><sz val="10"/><color rgb="FF44546A"/><name val="Microsoft YaHei"/></font>
  <font><sz val="9"/><color rgb="FF667085"/><name val="Microsoft YaHei"/></font>
  <font><sz val="10"/><color rgb="FFC00000"/><name val="Microsoft YaHei"/></font>
 </fonts>
 <fills count="8">
  <fill><patternFill patternType="none"/></fill>
  <fill><patternFill patternType="gray125"/></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFEAF2F8"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFF4F6F8"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/><bgColor indexed="64"/></patternFill></fill>
 </fills>
 <borders count="2">
  <border><left/><right/><top/><bottom/><diagonal/></border>
  <border><left style="thin"><color rgb="FFD0D5DD"/></left><right style="thin"><color rgb="FFD0D5DD"/></right><top style="thin"><color rgb="FFD0D5DD"/></top><bottom style="thin"><color rgb="FFD0D5DD"/></bottom><diagonal/></border>
 </borders>
 <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
 <cellXfs count="13">
  <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
  <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
  <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
  <xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  <xf numFmtId="164" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
  <xf numFmtId="0" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  <xf numFmtId="165" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/>
  <xf numFmtId="164" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/>
 </cellXfs>
 <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function buildWorksheet({ rows, columns = [], dataValidations = [] }) {
  const merges = [];
  const rowXml = rows
    .map((row, rowIndex) => buildRow(Array.isArray(row) ? row : [], rowIndex + 1, merges))
    .join("\n");
  const mergeText = merges.length
    ? `\n <mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";
  const dataValidationText = dataValidations.length
    ? `\n <dataValidations count="${dataValidations.length}">${dataValidations.map(buildDataValidation).join("")}</dataValidations>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
 <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
 <cols>
${columns.map((width, index) => `  <col min="${index + 1}" max="${index + 1}" width="${toExcelColumnWidth(width)}" customWidth="1"/>`).join("\n")}
 </cols>
 <sheetData>
${rowXml}
 </sheetData>${mergeText}${dataValidationText}
 <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
}

function normalizeDataValidations(value) {
  return (Array.isArray(value) ? value : [])
    .map((validation) => ({
      sqref: cleanText(validation?.sqref),
      type: cleanText(validation?.type) || "list",
      formula1: cleanText(validation?.formula1),
      allowBlank: validation?.allowBlank !== false,
      promptTitle: cleanText(validation?.promptTitle),
      prompt: cleanText(validation?.prompt),
      errorTitle: cleanText(validation?.errorTitle),
      error: cleanText(validation?.error),
    }))
    .filter((validation) => validation.sqref && validation.formula1);
}

function buildDataValidation(validation) {
  const attributes = [
    `type="${escapeXmlAttribute(validation.type)}"`,
    `sqref="${escapeXmlAttribute(validation.sqref)}"`,
    `allowBlank="${validation.allowBlank ? 1 : 0}"`,
    'showInputMessage="1"',
    'showErrorMessage="1"',
    'errorStyle="stop"',
  ];
  for (const [key, value] of [
    ["promptTitle", validation.promptTitle],
    ["prompt", validation.prompt],
    ["errorTitle", validation.errorTitle],
    ["error", validation.error],
  ]) {
    if (value) attributes.push(`${key}="${escapeXmlAttribute(value)}"`);
  }
  return `<dataValidation ${attributes.join(" ")}><formula1>${escapeXmlText(validation.formula1)}</formula1></dataValidation>`;
}

function buildRow(row, rowNumber, merges) {
  let columnNumber = 1;
  const cells = row
    .map((value) => {
      const normalized = normalizeCell(value);
      const ref = `${columnName(columnNumber)}${rowNumber}`;
      if (normalized.mergeAcross > 0) {
        merges.push(`${ref}:${columnName(columnNumber + normalized.mergeAcross)}${rowNumber}`);
      }
      const cellXml = buildCell(ref, normalized);
      columnNumber += normalized.mergeAcross + 1;
      return cellXml;
    })
    .join("");
  return `  <row r="${rowNumber}">${cells}</row>`;
}

function buildCell(ref, cellValue) {
  const styleIndex = getStyleIndex(cellValue.styleId);
  const styleText = styleIndex ? ` s="${styleIndex}"` : "";
  if (cellValue.type === "Number") {
    return `<c r="${ref}"${styleText}><v>${toFiniteNumber(cellValue.value)}</v></c>`;
  }
  return `<c r="${ref}"${styleText} t="inlineStr"><is><t>${escapeXmlText(cellValue.value)}</t></is></c>`;
}

function getStyleIndex(styleId) {
  const styleMap = {
    Title: 1,
    Section: 2,
    Header: 3,
    Label: 4,
    Input: 5,
    Muted: 6,
    Number: 7,
    Money: 8,
    MoneyWarning: 9,
    Total: 10,
    NumberTotal: 11,
    MoneyTotal: 12,
  };
  return styleMap[styleId] ?? 0;
}

function normalizeCell(value) {
  if (isPlainObject(value) && Object.hasOwn(value, "value")) {
    return {
      value: value.value ?? "",
      styleId: value.styleId ?? "",
      mergeAcross: Number(value.mergeAcross ?? 0),
      type: value.type ?? inferCellType(value.value),
    };
  }
  return {
    value: value ?? "",
    styleId: "",
    mergeAcross: 0,
    type: inferCellType(value),
  };
}

function inferCellType(value) {
  return typeof value === "number" && Number.isFinite(value) ? "Number" : "String";
}

function toFiniteNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function toExcelColumnWidth(pixelWidth) {
  const width = Number(pixelWidth);
  if (!Number.isFinite(width) || width <= 0) return 12;
  return Math.max(8, Math.round((width / 7) * 100) / 100);
}

function columnName(index) {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name || "A";
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function escapeXmlText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeXmlAttribute(value) {
  return escapeXmlText(value);
}

function toIsoDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function createZipArchive(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.path);
    const contentBytes = toUint8Array(file.content);
    const crc = crc32(contentBytes);
    const localHeader = createZipLocalHeader({ nameBytes, contentBytes, crc });
    localParts.push(localHeader, contentBytes);
    centralParts.push(createZipCentralDirectoryHeader({ nameBytes, contentBytes, crc, offset }));
    offset += localHeader.length + contentBytes.length;
  });

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = createZipEndRecord({
    fileCount: files.length,
    centralDirectorySize,
    centralDirectoryOffset,
  });
  return concatUint8Arrays([...localParts, ...centralParts, endRecord]);
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  return new TextEncoder().encode(String(value ?? ""));
}

function concatUint8Arrays(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function createZipLocalHeader({ nameBytes, contentBytes, crc }) {
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, contentBytes.length, true);
  view.setUint32(22, contentBytes.length, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  header.set(nameBytes, 30);
  return header;
}

function createZipCentralDirectoryHeader({ nameBytes, contentBytes, crc, offset }) {
  const header = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, contentBytes.length, true);
  view.setUint32(24, contentBytes.length, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  header.set(nameBytes, 46);
  return header;
}

function createZipEndRecord({ fileCount, centralDirectorySize, centralDirectoryOffset }) {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return record;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crc32Table = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
