// P2-07 送货单 / 自提单 / 出库单的针式打印版式（负责人 2026-11-04 定稿，方案二）。
// 纸张：241mm 连续纸二等分（241×139.7mm），三联无碳复写（①白存根 ②红客户 ③黄回单）。
// 版式：
// - 抬头：黑白 logo、公司名；下面「联系人 / 电话 / 工厂地址」；右边单据名称和单号；下面一道双线。
// - 客户：第一行只放客户名称、提货人（大一号）；第二行联系人、联系电话、地址，日期靠右。
// - 表格：序号、产品名称、规格、颜色、实发数量、计价数量、单价（元/个：袋子、印刷、长提、加扣，用到才出）、金额、备注。
//   表格固定行数（不足补空行），合计行、说明、签章每张都在同一位置，撕下来三联对得齐，也方便手写补充。
// - 底部：合计（大写金额、实发合计、计价合计、金额合计），说明（有赠送才印），注意事项，双方签章横线。
// 针式打印的照顾：字号不小于 8.5pt（第三联也看得清）；线条不细于 0.6pt（细线针头打不出来）；不用灰色和填充；
// logo 转成纯黑白；页边避开两侧孔边和上下撕口。
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { amountInChineseUppercase, deliveryNoteColumns } from "../shared/deliveryNoteLayout.js";

const fontUrl = new URL("./print-assets/ERPLabelSansSC-Regular.ttf", import.meta.url);
const sourceUrl = new URL("./print-assets/source.json", import.meta.url);
const logoUrl = new URL("./print-assets/company-logo-mono.png", import.meta.url);
const mm = value => (value * 72) / 25.4;
const black = rgb(0, 0, 0);
const NOTE_TYPES = new Set(["delivery_note", "pickup_note", "outbound_note"]);
const fail = message => { throw Object.assign(new Error(message), { code: "FULFILLMENT_NOTE_PDF_INVALID" }); };

// Layout in millimetres from the top-left corner of one half-letter sheet.
const LAYOUT = Object.freeze({
  left: 14, right: 20, top: 7, bottom: 7,  // tractor holes left/right, perforation top/bottom
  headerRule: 20,                          // double rule under logo + company + contact line
  infoRow1: 26.2, infoRow2: 32.4,          // baselines of the two customer lines
  tableTop: 35.6,
  headerRow: 5,                            // each of the two table-heading rows
  row: 6.4,
  totalRow: 6.8,
  noteLine: 4.6,
  signature: 9,
  copyColumn: 16,                          // distance of the copy names from the right edge
});
const LINE = Object.freeze({ outer: 1.1, rule: 0.7, inner: 0.6 });
const SIZE = Object.freeze({ company: 16, title: 16, contact: 8.5, number: 9.5, info1: 10.5, info2: 9.5, head: 9, cell: 9.5, total: 10, note: 8.5, sign: 9.5, copy: 8.5 });

export function isFulfillmentNoteTemplate(template) {
  return Boolean(template && NOTE_TYPES.has(template.documentType) && template.priceHidden !== true
    && Array.isArray(template.fields?.lineItems) && template.fields.lineItems.length);
}

const text = value => String(value ?? "").trim();
const money = value => (Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "");
const groupedMoney = value => (Number.isFinite(Number(value))
  ? `¥${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "");
const numberFrom = (...values) => {
  for (const value of values) {
    const match = text(value).match(/^-?\d+(?:\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return NaN;
};

export async function buildFulfillmentNotePdf(template) {
  if (!isFulfillmentNoteTemplate(template)) fail("缺少送货单/自提单的明细，未提交打印。");
  const fontBytes = readFileSync(fontUrl);
  const source = JSON.parse(readFileSync(sourceUrl, "utf8"));
  if (createHash("sha256").update(fontBytes).digest("hex") !== source.fontSha256) fail("单据字体校验失败，请恢复经过核对的字体资产。");
  const fields = template.fields;
  const items = fields.lineItems;
  if (items.length > 500) fail("单据明细过多，未提交打印。");

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false, features: { locl: false, liga: false, clig: false, calt: false } });
  const supported = new Set(font.getCharacterSet());
  const logo = await doc.embedPng(readFileSync(logoUrl));
  const safe = value => {
    const out = text(value);
    for (const char of out) if (!supported.has(char.codePointAt(0))) fail(`单据内容含字体不支持的字「${char}」，请修改后重打。`);
    return out;
  };

  const widthMm = Number(template.paper?.widthMm) || 241;
  const heightMm = Number(template.paper?.heightMm) || 140;
  if (widthMm < 180 || widthMm > 260 || heightMm < 120 || heightMm > 300) fail("单据纸张须为 241mm 连续纸（宽 180–260、高 120–300 毫米）。");
  const pageWidth = mm(widthMm), pageHeight = mm(heightMm);
  const yOf = fromTop => pageHeight - mm(fromTop);       // y coordinate of a distance from the top edge
  const left = mm(LAYOUT.left), right = pageWidth - mm(LAYOUT.right);
  const tableWidth = right - left;

  // Columns: 袋子 always; 印刷 / 长提 / 加扣 only when a line on this sheet uses them.
  const sheetColumns = deliveryNoteColumns(items);
  const totalWeight = sheetColumns.reduce((sum, column) => sum + column.width, 0);
  const columns = sheetColumns.map(column => ({ ...column, w: (column.width / totalWeight) * tableWidth }));
  let cursor = left;
  for (const column of columns) { column.x = cursor; cursor += column.w; }
  const priceColumns = columns.filter(column => column.group);
  const deliveredColumn = columns.find(column => column.key === "deliveredQtyText");
  const chargeableColumn = columns.find(column => column.key === "chargeableQtyText");
  const amountColumn = columns.find(column => column.key === "amountText");

  // A fixed number of rows per sheet: the totals, notes and signatures always sit in the same place.
  const footerHeight = LAYOUT.totalRow + 2 * LAYOUT.noteLine + LAYOUT.signature;
  const bodyTop = LAYOUT.tableTop + 2 * LAYOUT.headerRow;
  const rowsPerPage = Math.max(3, Math.floor((heightMm - LAYOUT.bottom - footerHeight - bodyTop) / LAYOUT.row));
  const pages = Math.max(1, Math.ceil(items.length / rowsPerPage));

  const width = (value, size) => font.widthOfTextAtSize(safe(value), size);
  const draw = (page, value, x, y, size) => page.drawText(safe(value), { x, y, size, font, color: black });
  const fit = (value, size, maxWidth) => {
    let out = safe(value), current = size;
    while (current > 7 && width(out, current) > maxWidth) current -= 0.5;
    while (out && width(out, current) > maxWidth) out = out.slice(0, -1);
    return { value: out, size: current };
  };
  // Text vertically centred in a band [topMm, topMm + bandMm].
  const cell = (page, value, box, topMm, bandMm, size) => {
    const pad = mm(1.3);
    const { value: out, size: fitted } = fit(value, size, box.w - 2 * pad);
    if (!out) return;
    const w = width(out, fitted);
    const x = box.align === "right" ? box.x + box.w - pad - w : box.align === "center" ? box.x + (box.w - w) / 2 : box.x + pad;
    const baseline = yOf(topMm + bandMm / 2) - fitted * 0.36;
    page.drawText(out, { x, y: baseline, size: fitted, font, color: black });
  };
  const hLine = (page, topMm, thickness, x1 = left, x2 = right) => page.drawLine({ start: { x: x1, y: yOf(topMm) }, end: { x: x2, y: yOf(topMm) }, thickness, color: black });
  const vLine = (page, x, topMm, bottomMm, thickness) => page.drawLine({ start: { x, y: yOf(topMm) }, end: { x, y: yOf(bottomMm) }, thickness, color: black });

  const delivered = item => numberFrom(item.deliveredQty, item.deliveredQtyText, item.quantity, item.quantityText);
  const chargeable = item => { const value = numberFrom(item.chargeableQty, item.chargeableQtyText); return Number.isFinite(value) ? value : delivered(item); };
  const sum = values => values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
  const amounts = items.map(item => (item.amount === null || item.amount === undefined ? NaN : Number(item.amount)));
  const totalAmount = Number.isFinite(Number(fields.totalAmount)) && items.length === 1 ? Number(fields.totalAmount)
    : amounts.every(Number.isFinite) ? Math.round(sum(amounts) * 100) / 100 : NaN;
  const hasGift = items.some(item => delivered(item) > chargeable(item));

  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    const page = doc.addPage([pageWidth, pageHeight]);
    const lastPage = pageIndex === pages - 1;

    // ── Header ──────────────────────────────────────────────────────────────
    const logoSize = mm(11);
    page.drawImage(logo, { x: left + mm(1), y: yOf(LAYOUT.top + 11.6), width: logoSize, height: logoSize });
    const nameX = left + mm(15);
    const company = fit(fields.companyName || "", SIZE.company, mm(115));
    draw(page, company.value, nameX, yOf(LAYOUT.top + 5.8), company.size);
    const contact = [fields.companyContactName && `联系人：${text(fields.companyContactName)}`, fields.companyPhone && `电话：${text(fields.companyPhone)}`,
      fields.companyAddress && `工厂地址：${text(fields.companyAddress)}`].filter(Boolean).join("　　");
    if (contact) { const c = fit(contact, SIZE.contact, mm(140)); draw(page, c.value, nameX, yOf(LAYOUT.top + 10.8), c.size); }
    const title = [...text(template.title || "送货单")].join("  ");
    draw(page, title, right - width(title, SIZE.title), yOf(LAYOUT.top + 5.8), SIZE.title);
    const number = fit(`No. ${text(fields.documentNo)}`, SIZE.number, mm(60));
    draw(page, number.value, right - width(number.value, number.size), yOf(LAYOUT.top + 10.8), number.size);
    if (pages > 1) {
      const pageText = `第 ${pageIndex + 1} / ${pages} 页`;
      draw(page, pageText, right - width(number.value, number.size) - mm(6) - width(pageText, SIZE.note), yOf(LAYOUT.top + 10.8), SIZE.note);
    }
    // Double rule under the header.
    hLine(page, LAYOUT.headerRule, LINE.outer);
    hLine(page, LAYOUT.headerRule + 0.8, LINE.inner);

    // ── Customer ────────────────────────────────────────────────────────────
    const pair = (label, value, x, baselineMm, maxWidth, size) => {
      const f = fit(`${label}${text(value)}`, size, maxWidth);
      draw(page, f.value, x, yOf(baselineMm), f.size);
    };
    pair("客户名称：", fields.customerName, left, LAYOUT.infoRow1, mm(80), SIZE.info1);
    if (text(fields.pickerName)) pair(`${text(fields.pickerLabel) || "提货人"}：`, fields.pickerName, left + mm(85), LAYOUT.infoRow1, mm(80), SIZE.info1);
    const dateText = `日期：${text(fields.documentDateText)}`;
    pair("联系人：", fields.contactName, left, LAYOUT.infoRow2, mm(40), SIZE.info2);
    pair("联系电话：", fields.phoneTail ? `尾号${text(fields.phoneTail)}` : "", left + mm(42), LAYOUT.infoRow2, mm(40), SIZE.info2);
    const addressX = left + mm(85);
    pair("地址：", fields.address, addressX, LAYOUT.infoRow2, right - width(dateText, SIZE.info2) - mm(5) - addressX, SIZE.info2);
    draw(page, dateText, right - width(dateText, SIZE.info2), yOf(LAYOUT.infoRow2), SIZE.info2);

    // ── Table heading: two rows; the prices sit under one 单价（元/个） heading ────
    const top = LAYOUT.tableTop;
    for (const column of columns) {
      if (column.group) cell(page, column.label, { ...column, align: "center" }, top + LAYOUT.headerRow, LAYOUT.headerRow, SIZE.head);
      else cell(page, column.label, { ...column, align: "center" }, top, 2 * LAYOUT.headerRow, SIZE.head);
    }
    if (priceColumns.length) {
      const groupX = priceColumns[0].x, groupW = priceColumns.reduce((total, column) => total + column.w, 0);
      cell(page, priceColumns[0].group, { x: groupX, w: groupW, align: "center" }, top, LAYOUT.headerRow, SIZE.head);
      hLine(page, top + LAYOUT.headerRow, LINE.inner, groupX, groupX + groupW);
    }
    hLine(page, bodyTop, LINE.rule);

    // ── Rows (blank rows fill the sheet) ───────────────────────────────────
    const rows = items.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    for (let rowIndex = 0; rowIndex < rowsPerPage; rowIndex += 1) {
      const rowTop = bodyTop + rowIndex * LAYOUT.row;
      const item = rows[rowIndex];
      if (item) {
        const index = pageIndex * rowsPerPage + rowIndex;
        const values = {
          lineNo: String(index + 1),
          productName: item.productName || item.goodsSummary,
          size: item.size,
          color: item.color,
          deliveredQtyText: Number.isFinite(delivered(item)) ? String(delivered(item)) : "",
          chargeableQtyText: Number.isFinite(chargeable(item)) ? String(chargeable(item)) : "",
          bagUnitPriceText: item.bagUnitPriceText,
          printingUnitPriceText: item.printingUnitPriceText,
          handleUnitPriceText: item.handleUnitPriceText,
          snapUnitPriceText: item.snapUnitPriceText,
          amountText: Number.isFinite(amounts[index]) ? money(amounts[index]) : "待核价",
          remark: item.remark,
        };
        for (const column of columns) cell(page, values[column.key], column, rowTop, LAYOUT.row, SIZE.cell);
      }
      if (rowIndex > 0) hLine(page, rowTop, LINE.inner);
    }
    const bodyBottom = bodyTop + rowsPerPage * LAYOUT.row;
    hLine(page, bodyBottom, LINE.rule);

    // ── 合计 row ─────────────────────────────────────────────────────────────
    const totalTop = bodyBottom, totalBottom = bodyBottom + LAYOUT.totalRow;
    if (lastPage) {
      const uppercase = Number.isFinite(totalAmount) ? (fields.totalAmountUppercase && items.length === 1 ? fields.totalAmountUppercase : amountInChineseUppercase(totalAmount)) : "待核价";
      cell(page, `合计（大写）：${uppercase}`, { x: left, w: deliveredColumn.x - left, align: "left" }, totalTop, LAYOUT.totalRow, SIZE.total);
      cell(page, String(sum(items.map(delivered))), deliveredColumn, totalTop, LAYOUT.totalRow, SIZE.total);
      cell(page, String(sum(items.map(chargeable))), chargeableColumn, totalTop, LAYOUT.totalRow, SIZE.total);
      cell(page, Number.isFinite(totalAmount) ? groupedMoney(totalAmount) : "待核价", amountColumn, totalTop, LAYOUT.totalRow, SIZE.total);
    } else {
      cell(page, "（续下页）", { x: left, w: deliveredColumn.x - left, align: "left" }, totalTop, LAYOUT.totalRow, SIZE.total);
    }

    // ── Grid ────────────────────────────────────────────────────────────────
    for (const column of columns) {
      if (column.x === left) continue;
      const lineTop = column.group && column !== priceColumns[0] ? top + LAYOUT.headerRow : top;
      // The 合计 text spans the columns before 实发数量.
      const lineBottom = column.x < deliveredColumn.x ? bodyBottom : totalBottom;
      vLine(page, column.x, lineTop, lineBottom, LINE.inner);
    }
    page.drawRectangle({ x: left, y: yOf(totalBottom), width: tableWidth, height: mm(totalBottom - top), borderWidth: LINE.outer, borderColor: black });

    // ── Notes and signatures ────────────────────────────────────────────────
    let noteTop = totalBottom + 1.2;
    const explanation = lastPage ? [hasGift ? "实发多于计价的部分为多做赠送，不收费" : "", text(fields.batchProgressText)].filter(Boolean).join("；") : "";
    for (const note of [explanation && `说明：${explanation}。`, fields.footerNote && `注：${text(fields.footerNote)}`].filter(Boolean)) {
      const f = fit(note, SIZE.note, tableWidth);
      draw(page, f.value, left, yOf(noteTop + LAYOUT.noteLine * 0.72), f.size);
      noteTop += LAYOUT.noteLine;
    }
    const signBaseline = heightMm - LAYOUT.bottom - 2;
    const signatures = [fields.senderSignatureText || "送货单位及经手人(签章)：", fields.receiverSignatureText || "收货单位及经手人(签章)："];
    signatures.forEach((label, index) => {
      const x = left + index * (tableWidth / 2);
      draw(page, label, x, yOf(signBaseline), SIZE.sign);
      const lineStart = x + width(label, SIZE.sign) + mm(1);
      page.drawLine({ start: { x: lineStart, y: yOf(signBaseline) - 2 }, end: { x: x + tableWidth / 2 - mm(8), y: yOf(signBaseline) - 2 }, thickness: LINE.inner, color: black });
    });

    // ── Copy names stacked on the right edge (①白存根联 ②红客户联 ③黄回单联) ──
    const copyNames = Array.isArray(template.paper?.copyNames) ? template.paper.copyNames : [];
    const copyX = pageWidth - mm(LAYOUT.copyColumn);
    let copyTop = LAYOUT.tableTop + 1;
    for (const name of copyNames) {
      for (const char of safe(name)) {
        draw(page, char, copyX + (mm(4.5) - width(char, SIZE.copy)) / 2, yOf(copyTop) - SIZE.copy, SIZE.copy);
        copyTop += (SIZE.copy + 1.6) * 25.4 / 72;
      }
      copyTop += 2.5;
    }
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
