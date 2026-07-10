import assert from "node:assert/strict";

export function readZipEntries(bytes) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const entries = new Map();
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const signature = readUint32(buffer, offset);
    if (signature !== 0x04034b50) break;
    const compressionMethod = readUint16(buffer, offset + 8);
    const compressedSize = readUint32(buffer, offset + 18);
    const uncompressedSize = readUint32(buffer, offset + 22);
    const fileNameLength = readUint16(buffer, offset + 26);
    const extraLength = readUint16(buffer, offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    const contentStart = nameEnd + extraLength;
    const contentEnd = contentStart + compressedSize;
    const name = decodeUtf8(buffer.slice(nameStart, nameEnd));
    if (compressionMethod !== 0) {
      throw new Error(`Unsupported compressed XLSX entry in test helper: ${name}`);
    }
    if (compressedSize !== uncompressedSize) {
      throw new Error(`Unexpected XLSX entry size mismatch in test helper: ${name}`);
    }
    entries.set(name, buffer.slice(contentStart, contentEnd));
    offset = contentEnd;
  }
  return entries;
}

export function readZipTextEntry(entries, name) {
  const entry = entries.get(name);
  assert(entry, `XLSX missed required entry: ${name}`);
  return decodeUtf8(entry);
}

export function assertStatementXlsxWorkbook(bytes, expected = {}) {
  const entries = readZipEntries(bytes);
  const workbookXml = readZipTextEntry(entries, "xl/workbook.xml");
  const summaryXml = readZipTextEntry(entries, "xl/worksheets/sheet1.xml");
  const detailXml = readZipTextEntry(entries, "xl/worksheets/sheet2.xml");
  const stylesXml = readZipTextEntry(entries, "xl/styles.xml");

  assert(workbookXml.includes('name="对账汇总"'), "XLSX missed summary sheet name");
  assert(workbookXml.includes('name="交付明细"'), "XLSX missed detail sheet name");
  assert(summaryXml.includes("虎门工厂客户对账单"), "XLSX missed statement title");
  assert(summaryXml.includes("客户确认"), "XLSX missed customer confirmation area");
  assert(summaryXml.includes("内部复核"), "XLSX missed internal review area");
  assert(summaryXml.includes("模板信息"), "XLSX missed template metadata row");
  assert(detailXml.includes("赠送/不计费"), "XLSX missed free quantity column");
  assert(stylesXml.includes("&quot;¥&quot;#,##0.00"), "XLSX missed money number format");
  if (expected.templateVersion) {
    assert(summaryXml.includes(expected.templateVersion), "XLSX missed expected template version");
  }
  if (expected.customerName) {
    assert(summaryXml.includes(expected.customerName), "XLSX missed expected customer name");
  }
  if (expected.productName) {
    assert(detailXml.includes(expected.productName), "XLSX missed expected product name");
  }
  if (expected.goodsSpec) {
    assert(detailXml.includes(expected.goodsSpec), "XLSX missed expected goods spec");
  }
  if (expected.amount) {
    assert(detailXml.includes(String(expected.amount)), "XLSX missed expected amount");
  }
  assert(!summaryXml.includes("占位") && !detailXml.includes("占位"), "XLSX should not describe itself as a placeholder");
  return { entries, workbookXml, summaryXml, detailXml, stylesXml };
}

function readUint16(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

function readUint32(buffer, offset) {
  return (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24)) >>> 0;
}

function decodeUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}
