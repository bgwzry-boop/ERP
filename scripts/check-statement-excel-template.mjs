import assert from "node:assert/strict";
import {
  STATEMENT_EXCEL_CONTENT_TYPE,
  STATEMENT_EXCEL_FILE_EXTENSION,
  STATEMENT_EXCEL_TEMPLATE_VERSION,
  buildStatementExcelMetadata,
  buildStatementExcelWorkbook,
  buildStatementExcelWorkbookBase64,
  buildStatementSpreadsheetMlWorkbook,
  getStatementExcelTemplateId,
} from "../src/domain/statementExcelTemplate.js";
import { assertStatementXlsxWorkbook } from "./xlsxTestUtils.mjs";

const statement = {
  id: "ST-TEMPLATE-001",
  customerId: "C-TEMPLATE",
  period: "2026-06",
  receivable: 108000,
  received: 80000,
  variance: 28000,
};

const customer = {
  id: "C-TEMPLATE",
  name: "白鲸自营店",
};

const preview = {
  statementId: statement.id,
  previewType: "customer_send",
  summary: {
    receivable: 108000,
    received: 80000,
    variance: 28000,
    lineCount: 1,
  },
  lines: [
    {
      statementLineId: "ST-TEMPLATE-001-001",
      orderLineId: "ORD-0629-010-01",
      orderNo: "ORD-0629-010",
      productName: "白鲸活动袋",
      goodsSpec: "白鲸活动袋 / 35*27 / 白印黑 / 白袋黑提 / 单面 / 1500个 / 3包",
      deliveredQty: 1500,
      billQty: 1500,
      freeQty: 0,
      unitPrice: 72,
      amount: 108000,
      adjustmentAmount: 0,
      finalAmount: 108000,
      remark: "加长提",
    },
  ],
  downloadToken: "DL-ST-TEMPLATE-001-CUSTOMER",
};

const workbookBytes = buildStatementExcelWorkbook(preview, {
  statement,
  customer,
  generatedAt: "2026-07-02T10:30:00.000Z",
  generatedBy: "U-OFFICE-A",
});
const workbookBase64 = buildStatementExcelWorkbookBase64(preview, {
  statement,
  customer,
  generatedAt: "2026-07-02T10:30:00.000Z",
  generatedBy: "U-OFFICE-A",
});
const legacyWorkbookXml = buildStatementSpreadsheetMlWorkbook(preview, {
  statement,
  customer,
  generatedAt: "2026-07-02T10:30:00.000Z",
  generatedBy: "U-OFFICE-A",
});
const metadata = buildStatementExcelMetadata(preview, {
  statement,
  customer,
  generatedAt: "2026-07-02T10:30:00.000Z",
  generatedBy: "U-OFFICE-A",
});

assert(workbookBytes instanceof Uint8Array, "statement workbook should be XLSX bytes");
assert.equal(workbookBytes[0], 0x50, "statement workbook should start with ZIP local header");
assert.equal(workbookBytes[1], 0x4b, "statement workbook should start with ZIP local header");
assert(Buffer.from(workbookBase64, "base64").equals(Buffer.from(workbookBytes)), "base64 workbook should match XLSX bytes");
assertStatementXlsxWorkbook(workbookBytes, {
  templateVersion: STATEMENT_EXCEL_TEMPLATE_VERSION,
  customerName: "白鲸自营店",
  productName: "白鲸活动袋",
  goodsSpec: "白印黑 / 白袋黑提",
  amount: 108000,
});
assert(legacyWorkbookXml.includes('ss:Name="对账汇总"'), "legacy SpreadsheetML fallback missed summary worksheet");
assert(legacyWorkbookXml.includes("白印黑 / 白袋黑提"), "legacy SpreadsheetML fallback missed compact custom color shorthand");

assert.equal(getStatementExcelTemplateId("customer_send"), "tpl-p0-statement-customer-send");
assert.equal(getStatementExcelTemplateId("internal_archive"), "tpl-p0-statement-internal-archive");
assert.equal(metadata.templateVersion, STATEMENT_EXCEL_TEMPLATE_VERSION);
assert.equal(metadata.workbookFormat, "XLSX Office Open XML");
assert.equal(metadata.workbookExtension, STATEMENT_EXCEL_FILE_EXTENSION);
assert.equal(metadata.contentType, STATEMENT_EXCEL_CONTENT_TYPE);
assert.equal(metadata.contentEncoding, "base64");
assert.deepEqual(metadata.worksheetNames, ["对账汇总", "交付明细"]);
assert.equal(metadata.lineCount, 1);
assert.equal(metadata.receivable, 108000);
assert.equal(metadata.customerName, "白鲸自营店");

console.log("Statement Excel template check passed.");
