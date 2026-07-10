export const STATEMENT_EXCEL_TEMPLATE_VERSION = "p0-statement-xlsx-v1";
export const STATEMENT_EXCEL_WORKBOOK_FORMAT = "XLSX Office Open XML";
export const STATEMENT_EXCEL_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const STATEMENT_EXCEL_FILE_EXTENSION = ".xlsx";
export const STATEMENT_LEGACY_SPREADSHEETML_FORMAT = "SpreadsheetML 2003";
export const STATEMENT_EXCEL_WORKSHEET_NAMES = ["对账汇总", "交付明细"];

const templateIdByPreviewType = {
  customer_send: "tpl-p0-statement-customer-send",
  internal_archive: "tpl-p0-statement-internal-archive",
};

const summaryColumnWidths = [118, 180, 102, 150, 102, 150, 118];
const detailColumnWidths = [48, 112, 142, 126, 300, 76, 76, 86, 76, 92, 92, 92, 190];

export function getStatementExcelTemplateId(previewType = "customer_send") {
  return normalizePreviewType(previewType) === "internal_archive"
    ? templateIdByPreviewType.internal_archive
    : templateIdByPreviewType.customer_send;
}

export function getStatementExcelPreviewTypeLabel(previewType = "customer_send") {
  return normalizePreviewType(previewType) === "internal_archive" ? "内部留档版" : "客户发送版";
}

export function buildStatementExcelMetadata(preview, context = {}) {
  const model = buildWorkbookModel(preview, context);
  return {
    templateId: model.templateId,
    templateVersion: STATEMENT_EXCEL_TEMPLATE_VERSION,
    workbookFormat: STATEMENT_EXCEL_WORKBOOK_FORMAT,
    workbookExtension: STATEMENT_EXCEL_FILE_EXTENSION,
    contentType: STATEMENT_EXCEL_CONTENT_TYPE,
    contentEncoding: "base64",
    worksheetNames: [...STATEMENT_EXCEL_WORKSHEET_NAMES],
    previewType: model.previewType,
    previewTypeLabel: model.previewTypeLabel,
    statementId: model.statementId,
    customerId: model.customerId,
    customerName: model.customerName,
    period: model.period,
    generatedAt: model.generatedAt,
    generatedBy: model.generatedBy,
    downloadToken: model.downloadToken,
    lineCount: model.lines.length,
    receivable: model.summary.receivable,
    received: model.summary.received,
    variance: model.summary.variance,
  };
}

export function buildStatementExcelWorkbook(preview, context = {}) {
  const model = buildWorkbookModel(preview, context);
  return buildXlsxWorkbook(model);
}

export function buildStatementExcelWorkbookBase64(preview, context = {}) {
  return bytesToBase64(buildStatementExcelWorkbook(preview, context));
}

export function buildStatementSpreadsheetMlWorkbook(preview, context = {}) {
  const model = buildWorkbookModel(preview, context);
  return buildSpreadsheetMlWorkbook({
    title: `对账单 ${model.statementId}`,
    worksheets: [buildSummaryWorksheet(model), buildDetailWorksheet(model)],
  });
}

function buildWorkbookModel(preview, context = {}) {
  const statement = context.statement ?? {};
  const customer = context.customer ?? {};
  const previewType = normalizePreviewType(preview?.previewType ?? context.previewType ?? "customer_send");
  const lines = normalizeLines(preview?.lines ?? []);
  const generatedAt = context.generatedAt ?? new Date().toISOString();
  return {
    statementId: String(preview?.statementId ?? statement.id ?? "").trim(),
    customerId: String(customer.id ?? customer.customerId ?? statement.customerId ?? "").trim(),
    customerName: String(customer.name ?? customer.customerName ?? "").trim(),
    period: String(statement.period ?? preview?.period ?? "").trim(),
    previewType,
    previewTypeLabel: getStatementExcelPreviewTypeLabel(previewType),
    templateId: context.templateId ?? getStatementExcelTemplateId(previewType),
    generatedAt,
    generatedBy: String(context.generatedBy ?? context.operatorId ?? "").trim(),
    downloadToken: String(context.downloadToken ?? preview?.downloadToken ?? "").trim(),
    summary: {
      receivable: toFiniteNumber(preview?.summary?.receivable ?? statement.receivable),
      received: toFiniteNumber(preview?.summary?.received ?? statement.received),
      variance: toFiniteNumber(
        preview?.summary?.variance ??
          statement.variance ??
          Math.max(0, toFiniteNumber(statement.receivable) - toFiniteNumber(statement.received)),
      ),
      lineCount: toFiniteNumber(preview?.summary?.lineCount ?? lines.length),
    },
    lines,
  };
}

function buildSummaryWorksheet(model) {
  const tokenLabel = model.downloadToken || "本地生成";
  const generatedBy = model.generatedBy || "未记录";
  return {
    name: "对账汇总",
    columns: summaryColumnWidths,
    rows: [
      [cell("虎门工厂客户对账单", { styleId: "Title", mergeAcross: 6 })],
      [
        cell("客户", { styleId: "Label" }),
        cell(model.customerName || "未命名客户"),
        cell("账期", { styleId: "Label" }),
        cell(model.period || "-"),
        cell("版本", { styleId: "Label" }),
        cell(model.previewTypeLabel),
      ],
      [
        cell("对账单号", { styleId: "Label" }),
        cell(model.statementId),
        cell("生成时间", { styleId: "Label" }),
        cell(formatDateTime(model.generatedAt)),
        cell("经办人", { styleId: "Label" }),
        cell(generatedBy),
      ],
      [],
      [cell("金额汇总", { styleId: "Section", mergeAcross: 6 })],
      [
        cell("应收合计", { styleId: "Label" }),
        cell(model.summary.receivable, { styleId: "Money" }),
        cell("已登记实收", { styleId: "Label" }),
        cell(model.summary.received, { styleId: "Money" }),
        cell("差额/欠款", { styleId: "Label" }),
        cell(model.summary.variance, { styleId: model.summary.variance > 0 ? "MoneyWarning" : "Money" }),
      ],
      [
        cell("明细行数", { styleId: "Label" }),
        cell(model.summary.lineCount, { styleId: "Number" }),
        cell("文件用途", { styleId: "Label" }),
        cell(model.previewTypeLabel),
        cell("导出令牌", { styleId: "Label" }),
        cell(tokenLabel),
      ],
      [],
      [cell("客户确认", { styleId: "Section", mergeAcross: 6 })],
      [
        cell("确认金额", { styleId: "Label" }),
        cell("", { styleId: "Input" }),
        cell("确认人", { styleId: "Label" }),
        cell("", { styleId: "Input" }),
        cell("确认日期", { styleId: "Label" }),
        cell("", { styleId: "Input" }),
      ],
      [cell("内部复核", { styleId: "Section", mergeAcross: 6 })],
      [
        cell("收款截图", { styleId: "Label" }),
        cell("", { styleId: "Input" }),
        cell("差额处理", { styleId: "Label" }),
        cell("", { styleId: "Input" }),
        cell("作废/重打", { styleId: "Label" }),
        cell("", { styleId: "Input" }),
      ],
      [],
      [
        cell("口径说明", { styleId: "Label" }),
        cell("按已交付且可计费明细生成；赠送/不计费数量在明细中单独列示。", {
          mergeAcross: 5,
          styleId: "Muted",
        }),
      ],
      [
        cell("模板信息", { styleId: "Label" }),
        cell(`${model.templateId} / ${STATEMENT_EXCEL_TEMPLATE_VERSION} / ${STATEMENT_EXCEL_WORKBOOK_FORMAT}`, {
          mergeAcross: 5,
          styleId: "Muted",
        }),
      ],
    ],
  };
}

function buildDetailWorksheet(model) {
  const rows = [
    [cell("交付明细", { styleId: "Title", mergeAcross: 12 })],
    [
      "序号",
      "订单号",
      "明细ID",
      "品名",
      "货品摘要",
      "交付数量",
      "计费数量",
      "赠送/不计费",
      "单价",
      "原金额",
      "调整",
      "应收",
      "备注",
    ].map((value) => cell(value, { styleId: "Header" })),
    ...model.lines.map((line, index) => [
      cell(index + 1, { styleId: "Number" }),
      cell(line.orderNo),
      cell(line.orderLineId || line.statementLineId),
      cell(line.productName),
      cell(line.goodsSpec),
      cell(line.deliveredQty, { styleId: "Number" }),
      cell(line.billQty, { styleId: "Number" }),
      cell(line.freeQty, { styleId: "Number" }),
      cell(line.unitPrice, { styleId: "Money" }),
      cell(line.amount, { styleId: "Money" }),
      cell(line.adjustmentAmount, { styleId: line.adjustmentAmount ? "MoneyWarning" : "Money" }),
      cell(line.finalAmount, { styleId: "Money" }),
      cell(line.remark),
    ]),
    [
      cell("合计", { styleId: "Total", mergeAcross: 4 }),
      cell(sumBy(model.lines, "deliveredQty"), { styleId: "NumberTotal" }),
      cell(sumBy(model.lines, "billQty"), { styleId: "NumberTotal" }),
      cell(sumBy(model.lines, "freeQty"), { styleId: "NumberTotal" }),
      cell("", { styleId: "Total" }),
      cell(sumBy(model.lines, "amount"), { styleId: "MoneyTotal" }),
      cell(sumBy(model.lines, "adjustmentAmount"), { styleId: "MoneyTotal" }),
      cell(sumBy(model.lines, "finalAmount"), { styleId: "MoneyTotal" }),
      cell("", { styleId: "Total" }),
    ],
  ];

  return {
    name: "交付明细",
    columns: detailColumnWidths,
    rows,
  };
}

function normalizeLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((line) => {
    const deliveredQty = toFiniteNumber(line.deliveredQty ?? line.delivered_qty ?? line.billQty);
    const billQty = toFiniteNumber(line.billQty ?? line.chargeableQty ?? line.chargeable_qty ?? deliveredQty);
    const amount = toFiniteNumber(line.amount);
    const finalAmount = toFiniteNumber(line.finalAmount ?? line.final_amount ?? amount);
    return {
      statementLineId: String(line.statementLineId ?? line.id ?? "").trim(),
      orderLineId: String(line.orderLineId ?? line.order_line_id ?? line.statementLineId ?? "").trim(),
      orderNo: String(line.orderNo ?? line.order_no ?? "").trim(),
      productName: String(line.productName ?? line.product_name ?? "").trim(),
      goodsSpec: String(line.goodsSpec ?? line.goods_spec ?? "").trim(),
      deliveredQty,
      billQty,
      freeQty: toFiniteNumber(line.freeQty ?? line.free_qty ?? Math.max(0, deliveredQty - billQty)),
      unitPrice: toFiniteNumber(line.unitPrice ?? line.unit_price ?? (billQty > 0 ? amount / billQty : 0)),
      amount,
      adjustmentAmount: toFiniteNumber(line.adjustmentAmount ?? line.adjustment_amount),
      finalAmount,
      remark: String(line.remark ?? line.note ?? "").trim(),
    };
  });
}

function buildXlsxWorkbook(model) {
  const worksheets = [buildSummaryWorksheet(model), buildDetailWorksheet(model)];
  const files = [
    {
      path: "[Content_Types].xml",
      content: buildXlsxContentTypes(),
    },
    {
      path: "_rels/.rels",
      content: buildXlsxRootRels(),
    },
    {
      path: "docProps/core.xml",
      content: buildXlsxCoreProperties(model),
    },
    {
      path: "docProps/app.xml",
      content: buildXlsxAppProperties(),
    },
    {
      path: "xl/workbook.xml",
      content: buildXlsxWorkbookXml(worksheets),
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      content: buildXlsxWorkbookRels(worksheets),
    },
    {
      path: "xl/styles.xml",
      content: buildXlsxStyles(),
    },
    ...worksheets.map((worksheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      content: buildXlsxWorksheet(worksheet),
    })),
  ];
  return createZipArchive(files);
}

function buildXlsxContentTypes() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="xml" ContentType="application/xml"/>
 <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
 <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
 <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
 <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
 <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
 <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function buildXlsxRootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
 <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
 <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildXlsxCoreProperties(model) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <dc:title>${escapeXmlText(`对账单 ${model.statementId}`)}</dc:title>
 <dc:creator>${escapeXmlText(model.generatedBy || "ERP")}</dc:creator>
 <cp:lastModifiedBy>${escapeXmlText(model.generatedBy || "ERP")}</cp:lastModifiedBy>
 <dcterms:created xsi:type="dcterms:W3CDTF">${escapeXmlText(toIsoDate(model.generatedAt))}</dcterms:created>
 <dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXmlText(toIsoDate(model.generatedAt))}</dcterms:modified>
</cp:coreProperties>`;
}

function buildXlsxAppProperties() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
 <Application>ERP P0</Application>
 <DocSecurity>0</DocSecurity>
 <ScaleCrop>false</ScaleCrop>
 <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>2</vt:i4></vt:variant></vt:vector></HeadingPairs>
 <TitlesOfParts><vt:vector size="2" baseType="lpstr"><vt:lpstr>对账汇总</vt:lpstr><vt:lpstr>交付明细</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>`;
}

function buildXlsxWorkbookXml(worksheets) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="18000" windowHeight="10000"/></bookViews>
 <sheets>
${worksheets.map((worksheet, index) => `  <sheet name="${escapeXmlAttribute(worksheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("\n")}
 </sheets>
 <calcPr calcId="0"/>
</workbook>`;
}

function buildXlsxWorkbookRels(worksheets) {
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

function buildXlsxStyles() {
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

function buildXlsxWorksheet({ rows, columns = [] }) {
  const merges = [];
  const rowXml = rows
    .map((row, rowIndex) => buildXlsxRow(Array.isArray(row) ? row : [], rowIndex + 1, merges))
    .join("\n");
  const mergeText = merges.length
    ? `\n <mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
 <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
 <cols>
${columns.map((width, index) => `  <col min="${index + 1}" max="${index + 1}" width="${toExcelColumnWidth(width)}" customWidth="1"/>`).join("\n")}
 </cols>
 <sheetData>
${rowXml}
 </sheetData>${mergeText}
 <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
}

function buildXlsxRow(row, rowNumber, merges) {
  let columnNumber = 1;
  const cells = row
    .map((value) => {
      const normalized = normalizeCell(value);
      const ref = `${columnName(columnNumber)}${rowNumber}`;
      if (normalized.mergeAcross > 0) {
        merges.push(`${ref}:${columnName(columnNumber + normalized.mergeAcross)}${rowNumber}`);
      }
      const cellXml = buildXlsxCell(ref, normalized);
      columnNumber += normalized.mergeAcross + 1;
      return cellXml;
    })
    .join("");
  return `  <row r="${rowNumber}">${cells}</row>`;
}

function buildXlsxCell(ref, cellValue) {
  const styleIndex = getXlsxStyleIndex(cellValue.styleId);
  const styleText = styleIndex ? ` s="${styleIndex}"` : "";
  if (cellValue.type === "Number") {
    return `<c r="${ref}"${styleText}><v>${toFiniteNumber(cellValue.value)}</v></c>`;
  }
  return `<c r="${ref}"${styleText} t="inlineStr"><is><t>${escapeXmlText(cellValue.value)}</t></is></c>`;
}

function getXlsxStyleIndex(styleId) {
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

function buildSpreadsheetMlWorkbook({ title, worksheets }) {
  return `\uFEFF<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>${escapeXmlText(title)}</Title>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Microsoft YaHei" ss:Size="10"/></Style>
  <Style ss:ID="Title"><Alignment ss:Vertical="Center"/><Font ss:FontName="Microsoft YaHei" ss:Size="15" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1F4E79" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Section"><Font ss:FontName="Microsoft YaHei" ss:Size="10" ss:Bold="1" ss:Color="#1F2937"/><Interior ss:Color="#EAF2F8" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Microsoft YaHei" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/><Borders>${allBorders()}</Borders></Style>
  <Style ss:ID="Label"><Font ss:FontName="Microsoft YaHei" ss:Size="10" ss:Bold="1" ss:Color="#44546A"/><Interior ss:Color="#F4F6F8" ss:Pattern="Solid"/><Borders>${allBorders()}</Borders></Style>
  <Style ss:ID="Input"><Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/><Borders>${allBorders()}</Borders></Style>
  <Style ss:ID="Muted"><Font ss:FontName="Microsoft YaHei" ss:Size="9" ss:Color="#667085"/></Style>
  <Style ss:ID="Number"><NumberFormat ss:Format="#,##0"/></Style>
  <Style ss:ID="Money"><NumberFormat ss:Format="&quot;¥&quot;#,##0.00"/></Style>
  <Style ss:ID="MoneyWarning"><Font ss:FontName="Microsoft YaHei" ss:Size="10" ss:Color="#C00000"/><NumberFormat ss:Format="&quot;¥&quot;#,##0.00"/></Style>
  <Style ss:ID="Total"><Font ss:FontName="Microsoft YaHei" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#E2F0D9" ss:Pattern="Solid"/><Borders>${allBorders()}</Borders></Style>
  <Style ss:ID="NumberTotal"><Font ss:FontName="Microsoft YaHei" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#E2F0D9" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0"/><Borders>${allBorders()}</Borders></Style>
  <Style ss:ID="MoneyTotal"><Font ss:FontName="Microsoft YaHei" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#E2F0D9" ss:Pattern="Solid"/><NumberFormat ss:Format="&quot;¥&quot;#,##0.00"/><Borders>${allBorders()}</Borders></Style>
 </Styles>
 ${worksheets.map((worksheet) => buildSpreadsheetMlWorksheet(worksheet)).join("\n ")}
</Workbook>`;
}

function buildSpreadsheetMlWorksheet({ name, rows, columns = [] }) {
  return `<Worksheet ss:Name="${escapeXmlAttribute(name)}">
  <Table>
${columns.map((width) => `   <Column ss:AutoFitWidth="0" ss:Width="${width}"/>`).join("\n")}
${rows.map((row) => buildSpreadsheetMlRow(row)).join("\n")}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>1</SplitHorizontal>
   <TopRowBottomPane>1</TopRowBottomPane>
   <ActivePane>2</ActivePane>
  </WorksheetOptions>
 </Worksheet>`;
}

function buildSpreadsheetMlRow(row) {
  const values = Array.isArray(row) ? row : [];
  return `   <Row>${values.map((value) => buildSpreadsheetMlCell(value)).join("")}</Row>`;
}

function buildSpreadsheetMlCell(value) {
  const normalized = normalizeCell(value);
  const attributes = [
    normalized.styleId ? `ss:StyleID="${escapeXmlAttribute(normalized.styleId)}"` : "",
    normalized.mergeAcross ? `ss:MergeAcross="${Number(normalized.mergeAcross)}"` : "",
  ].filter(Boolean);
  const attributeText = attributes.length ? ` ${attributes.join(" ")}` : "";
  return `<Cell${attributeText}><Data ss:Type="${normalized.type}">${escapeXmlText(normalized.value)}</Data></Cell>`;
}

function cell(value, options = {}) {
  return { value, ...options };
}

function normalizeCell(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "value")) {
    return {
      value: value.value ?? "",
      styleId: value.styleId ?? "",
      mergeAcross: Number(value.mergeAcross ?? 0),
      type: value.type ?? inferSpreadsheetMlType(value.value),
    };
  }
  return {
    value: value ?? "",
    styleId: "",
    mergeAcross: 0,
    type: inferSpreadsheetMlType(value),
  };
}

function inferSpreadsheetMlType(value) {
  return typeof value === "number" && Number.isFinite(value) ? "Number" : "String";
}

function normalizePreviewType(value) {
  return value === "internal_archive" ? "internal_archive" : "customer_send";
}

function toFiniteNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function sumBy(rows, key) {
  return toFiniteNumber(rows.reduce((sum, row) => sum + toFiniteNumber(row[key]), 0));
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value ?? "");
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function allBorders() {
  return '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/>';
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

function createZipLocalHeader({ nameBytes, contentBytes, crc }) {
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
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
  view.setUint16(8, 0x0800, true);
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

function concatUint8Arrays(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new TextEncoder().encode(String(value ?? ""));
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

function crc32(bytes) {
  const table = getCrc32Table();
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[index]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let crc32Table = null;

function getCrc32Table() {
  if (crc32Table) return crc32Table;
  crc32Table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crc32Table[index] = value >>> 0;
  }
  return crc32Table;
}

function columnName(columnNumber) {
  let value = Number(columnNumber);
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name || "A";
}

function toExcelColumnWidth(width) {
  const numericWidth = Number(width);
  if (!Number.isFinite(numericWidth) || numericWidth <= 0) return "10";
  return String(Math.round((numericWidth / 7.2) * 100) / 100);
}

function toIsoDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}
