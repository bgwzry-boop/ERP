// P2-07 送货单 / 自提单 / 出库单的针式打印版式，照旧 ERP「三个单价」模板排：
// 抬头（logo、公司名、地址电话、单据名称、单号、日期、客户信息），表格（序号、产品名称、规格、颜色、仓库、
// 单位、数量、袋子单价、印刷单价、长提单价、金额、备注），合计行（大写金额、合计数量、合计金额），
// 底部说明和双方签章，右边竖排三联名称。纸张 241mm 连续纸二等分（241×140mm），一页放不下就续页。
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { amountInChineseUppercase, deliveryNoteColumns } from "../shared/deliveryNoteLayout.js";

const fontUrl = new URL("./print-assets/ERPLabelSansSC-Regular.ttf", import.meta.url);
const sourceUrl = new URL("./print-assets/source.json", import.meta.url);
const logoUrl = new URL("./print-assets/company-logo.png", import.meta.url);
const mm = value => (value * 72) / 25.4;
const black = rgb(0, 0, 0);
const NOTE_TYPES = new Set(["delivery_note", "pickup_note", "outbound_note"]);
const fail = message => { throw Object.assign(new Error(message), { code: "FULFILLMENT_NOTE_PDF_INVALID" }); };

export function isFulfillmentNoteTemplate(template) {
  return Boolean(template && NOTE_TYPES.has(template.documentType) && template.priceHidden !== true
    && Array.isArray(template.fields?.lineItems) && template.fields.lineItems.length);
}

const text = value => String(value ?? "").trim();
const money = value => (Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "");
const groupedMoney = value => (Number.isFinite(Number(value))
  ? `¥${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "");
const quantityOf = item => {
  const value = Number(item.quantity);
  if (Number.isFinite(value)) return value;
  const match = text(item.quantityText).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
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
  if (widthMm < 180 || widthMm > 260 || heightMm < 90 || heightMm > 300) fail("单据纸张须为 241mm 连续纸（宽 180–260、高 90–300 毫米）。");
  const pageWidth = mm(widthMm), pageHeight = mm(heightMm);
  // Tractor-feed strips with the holes take ~12.7mm each side; print inside them.
  const left = mm(14), right = pageWidth - mm(20), copyColumnX = pageWidth - mm(17);
  const tableWidth = right - left;
  // 袋子单价 always; 印刷 / 长提 / 加扣 only when a line on this sheet uses them.
  const sheetColumns = deliveryNoteColumns(items);
  const totalWeight = sheetColumns.reduce((sum, column) => sum + column.width, 0);
  const columns = sheetColumns.map(column => ({ ...column, w: (column.width / totalWeight) * tableWidth }));
  let x = left;
  for (const column of columns) { column.x = x; x += column.w; }
  const rowHeight = mm(6);
  const headerTop = pageHeight - mm(8);
  const tableTop = pageHeight - mm(37);
  const footerHeight = mm(22); // 合计 row + 说明 + 注 + signatures
  const rowsPerPage = Math.max(1, Math.floor((tableTop - 2 * rowHeight - footerHeight - mm(6)) / rowHeight));
  const pages = Math.max(1, Math.ceil(items.length / rowsPerPage));

  const draw = (page, value, xPos, y, size = 9) => page.drawText(safe(value), { x: xPos, y, size, font, color: black });
  const width = (value, size) => font.widthOfTextAtSize(safe(value), size);
  const fit = (value, size, maxWidth) => {
    let out = safe(value), current = size;
    while (current > 5 && width(out, current) > maxWidth) current -= 0.5;
    while (out && width(out, current) > maxWidth) out = out.slice(0, -1);
    return { value: out, size: current };
  };
  const cell = (page, value, column, y, size = 8.5) => {
    const pad = mm(1);
    const { value: out, size: fitted } = fit(value, size, column.w - 2 * pad);
    if (!out) return;
    const w = width(out, fitted);
    const xPos = column.align === "right" ? column.x + column.w - pad - w : column.align === "center" ? column.x + (column.w - w) / 2 : column.x + pad;
    page.drawText(out, { x: xPos, y: y + (rowHeight - fitted) / 2 + 0.8, size: fitted, font, color: black });
  };
  const line = (page, x1, y1, x2, y2, thickness = 0.6) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: black });

  const delivered = item => { const value = Number(item.deliveredQty ?? item.deliveredQtyText); return Number.isFinite(value) ? value : quantityOf(item); };
  const chargeable = item => { const value = Number(item.chargeableQty ?? item.chargeableQtyText); return Number.isFinite(value) ? value : delivered(item); };
  const totalDelivered = items.reduce((sum, item) => sum + (Number.isFinite(delivered(item)) ? delivered(item) : 0), 0);
  const totalChargeable = items.reduce((sum, item) => sum + (Number.isFinite(chargeable(item)) ? chargeable(item) : 0), 0);
  const amounts = items.map(item => (item.amount === null || item.amount === undefined ? NaN : Number(item.amount)));
  const allPriced = amounts.every(Number.isFinite);
  const totalAmount = Number.isFinite(Number(fields.totalAmount)) && items.length === 1 ? Number(fields.totalAmount)
    : allPriced ? Math.round(amounts.reduce((sum, value) => sum + value, 0) * 100) / 100 : NaN;
  const hasGift = items.some(item => delivered(item) > chargeable(item));
  const priceColumns = columns.filter(column => column.group);

  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    const page = doc.addPage([pageWidth, pageHeight]);
    // Header: logo, company; under it 联系人 / 电话 / 工厂地址; title and number on the right.
    const logoSize = mm(13);
    page.drawImage(logo, { x: left + mm(18), y: headerTop - logoSize + mm(2), width: logoSize, height: logoSize });
    const company = fit(fields.companyName || "", 17, mm(110));
    draw(page, company.value, left + mm(34), headerTop - mm(5), company.size);
    const contact = [fields.companyContactName && `联系人：${text(fields.companyContactName)}`, fields.companyPhone && `电话：${text(fields.companyPhone)}`,
      fields.companyAddress && `工厂地址：${text(fields.companyAddress)}`].filter(Boolean).join("    ");
    if (contact) { const c = fit(contact, 8, mm(125)); draw(page, c.value, left + mm(34), headerTop - mm(10.5), c.size); }
    const title = `[${[...text(template.title || "送货单")].join(" ")}]`;
    draw(page, title, right - width(title, 15), headerTop - mm(5), 15);
    const number = `No. ${text(fields.documentNo)}`;
    const n = fit(number, 9, mm(70));
    draw(page, n.value, right - width(n.value, n.size), headerTop - mm(11), n.size);
    if (pages > 1) { const pageText = `第 ${pageIndex + 1}/${pages} 页`; draw(page, pageText, right - width(n.value, n.size) - mm(5) - width(pageText, 8), headerTop - mm(11), 8); }

    // Customer block (负责人 2026-11-04): first line only 客户名称 and 提货人 (a size larger);
    // second line 联系人、联系电话、地址, with 日期 at the right end.
    const infoY1 = pageHeight - mm(26.5), infoY2 = pageHeight - mm(33);
    const pair = (label, value, xPos, y, maxWidth, size = 9) => { const f = fit(`${label}${text(value)}`, size, maxWidth); draw(page, f.value, xPos, y, f.size); };
    pair("客户名称：", fields.customerName, left, infoY1, mm(68), 10.5);
    if (text(fields.pickerName)) pair(`${text(fields.pickerLabel) || "提货人"}：`, fields.pickerName, left + mm(70), infoY1, mm(80), 10.5);
    const dateText = `日期：${text(fields.documentDateText)}`;
    pair("联系人：", fields.contactName, left, infoY2, mm(48));
    pair("联系电话：", fields.phoneTail ? `尾号${text(fields.phoneTail)}` : "", left + mm(52), infoY2, mm(38));
    pair("地址：", fields.address, left + mm(93), infoY2, right - width(dateText, 9) - mm(4) - (left + mm(93)));
    draw(page, dateText, right - width(dateText, 9), infoY2, 9);

    // Table header: two rows; the price columns sit under one 单价（元/个） heading.
    const headerBottom = tableTop - 2 * rowHeight;
    line(page, left, tableTop, right, tableTop, 0.8);
    for (const column of columns) {
      if (column.group) cell(page, column.label, { ...column, align: "center" }, headerBottom, 8.5);
      else cell(page, column.label, { ...column, align: "center" }, headerBottom + rowHeight / 2, 8.5);
    }
    if (priceColumns.length) {
      const groupX = priceColumns[0].x, groupW = priceColumns.reduce((sum, column) => sum + column.w, 0);
      cell(page, priceColumns[0].group, { x: groupX, w: groupW, align: "center" }, headerBottom + rowHeight, 8.5);
      line(page, groupX, headerBottom + rowHeight, groupX + groupW, headerBottom + rowHeight, 0.4);
    }
    line(page, left, headerBottom, right, headerBottom);
    let y = headerBottom;
    const rows = items.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    rows.forEach((item, rowIndex) => {
      y -= rowHeight;
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
      for (const column of columns) cell(page, values[column.key], column, y);
      line(page, left, y, right, y, 0.4);
    });
    // 合计 row on the last page.
    const lastPage = pageIndex === pages - 1;
    const firstQuantity = columns.find(column => column.key === "deliveredQtyText");
    if (lastPage) {
      y -= rowHeight;
      const amountColumn = columns.find(column => column.key === "amountText");
      const uppercase = Number.isFinite(totalAmount) ? (fields.totalAmountUppercase && items.length === 1 ? fields.totalAmountUppercase : amountInChineseUppercase(totalAmount)) : "待核价";
      cell(page, `合计：${uppercase}`, { x: left, w: firstQuantity.x - left, align: "left" }, y, 9);
      cell(page, String(totalDelivered), firstQuantity, y, 9);
      cell(page, String(totalChargeable), columns.find(column => column.key === "chargeableQtyText"), y, 9);
      cell(page, Number.isFinite(totalAmount) ? groupedMoney(totalAmount) : "待核价", { x: amountColumn.x, w: amountColumn.w + (right - amountColumn.x - amountColumn.w), align: "left" }, y, 9);
      line(page, left, y, right, y, 0.8);
    }
    // Vertical rules (the 合计 text spans the columns before 实发数量; price sub-columns start under the group heading).
    for (const column of columns) {
      if (column.x === left) continue;
      const top = column.group && column !== priceColumns[0] ? headerBottom + rowHeight : tableTop;
      const bottom = lastPage && column.x < firstQuantity.x ? y + rowHeight : y;
      line(page, column.x, top, column.x, bottom, 0.4);
    }
    line(page, left, tableTop, left, y, 0.8);
    line(page, right, tableTop, right, y, 0.8);
    // Footer on the last page.
    if (lastPage) {
      const explanation = [hasGift ? "实发多于计价的部分为多做赠送，不收费" : "", text(fields.batchProgressText)].filter(Boolean).join("；");
      const notes = [explanation && `说明：${explanation}。`, fields.footerNote && `注：${text(fields.footerNote)}`].filter(Boolean);
      let footerY = y - mm(5);
      for (const note of notes) {
        const f = fit(note, 8.5, tableWidth);
        draw(page, f.value, left, footerY, f.size);
        footerY -= mm(5);
      }
      draw(page, fields.senderSignatureText || "送货单位及经手人(签章)：", left, footerY - mm(1), 9);
      draw(page, fields.receiverSignatureText || "收货单位及经手人(签章)：", left + tableWidth / 2, footerY - mm(1), 9);
    } else {
      draw(page, "（续下页）", right - width("（续下页）", 8), y - mm(5), 8);
    }
    // Copy names stacked vertically on the right edge (①白存根联 ②红客户联 ③黄回单联).
    const copyNames = Array.isArray(template.paper?.copyNames) ? template.paper.copyNames : [];
    let copyY = tableTop - mm(1);
    for (const name of copyNames) {
      for (const char of safe(name)) {
        const size = 8;
        draw(page, char, copyColumnX + (mm(4) - width(char, size)) / 2, copyY - size, size);
        copyY -= size + 1.5;
      }
      copyY -= mm(2);
    }
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
