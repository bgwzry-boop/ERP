import assert from "node:assert/strict";
import {
  MASTER_DATA_IMPORT_CONTENT_TYPE,
  MASTER_DATA_IMPORT_FILE_EXTENSION,
  MASTER_DATA_IMPORT_TEMPLATE_VERSION,
  buildMasterDataImportTemplateMetadata,
  buildMasterDataImportTemplateWorkbook,
  buildMasterDataImportTemplateWorkbookBase64,
  getMasterDataImportTemplateDefinitions,
  getMasterDataImportTemplateSets,
  getMasterDataImportTemplateSummary,
} from "../src/domain/masterDataImportTemplate.js";
import { readZipEntries, readZipTextEntry } from "./xlsxTestUtils.mjs";

const generatedAt = "2026-07-03T09:30:00.000Z";
const generatedBy = "office-admin";
const workbook = buildMasterDataImportTemplateWorkbook({
  templateKey: "all",
  generatedAt,
  generatedBy,
});
const workbookBase64 = buildMasterDataImportTemplateWorkbookBase64({
  templateKey: "all",
  generatedAt,
  generatedBy,
});
const decodedWorkbook = Buffer.from(workbookBase64, "base64");

assert(workbook instanceof Uint8Array, "template workbook should be Uint8Array");
assert(workbook.length > 12000, "template workbook should contain workbook XML entries");
assert.equal(workbook[0], 0x50, "template workbook should start with ZIP signature");
assert.equal(workbook[1], 0x4b, "template workbook should start with ZIP signature");
assert.equal(decodedWorkbook.length, workbook.length, "base64 workbook should decode to the same byte length");
assert.equal(Buffer.compare(Buffer.from(workbook), decodedWorkbook), 0, "base64 workbook should match raw workbook bytes");

const metadata = buildMasterDataImportTemplateMetadata({
  templateKey: "all",
  generatedAt,
  generatedBy,
});
assert.equal(metadata.templateVersion, MASTER_DATA_IMPORT_TEMPLATE_VERSION);
assert.equal(metadata.contentType, MASTER_DATA_IMPORT_CONTENT_TYPE);
assert.equal(metadata.workbookExtension, MASTER_DATA_IMPORT_FILE_EXTENSION);
assert.equal(metadata.templateLabel, "全量基础资料");
assert.equal(metadata.sheetCount, 5);
assert.equal(metadata.fileName, "erp-master-data-import-template-2026-07-03.xlsx");
assert.deepEqual(metadata.worksheetNames, ["客户档案", "价格表", "尺寸颜色款式", "初始库存", "员工机台"]);

const definitions = getMasterDataImportTemplateDefinitions();
const sets = getMasterDataImportTemplateSets();
assert.equal(definitions.length, 5);
assert.deepEqual(
  sets.map((item) => item.key),
  ["all", "customers", "prices", "inventory", "workshop"],
);
assert(getMasterDataImportTemplateSummary("prices").includes("2 个 sheet"), "prices template should include price and specs sheets");

const entries = readZipEntries(workbook);
const workbookXml = readZipTextEntry(entries, "xl/workbook.xml");
const readmeXml = readZipTextEntry(entries, "xl/worksheets/sheet1.xml");
const customerXml = readZipTextEntry(entries, "xl/worksheets/sheet2.xml");
const priceXml = readZipTextEntry(entries, "xl/worksheets/sheet3.xml");
const specXml = readZipTextEntry(entries, "xl/worksheets/sheet4.xml");
const inventoryXml = readZipTextEntry(entries, "xl/worksheets/sheet5.xml");
const employeeXml = readZipTextEntry(entries, "xl/worksheets/sheet6.xml");

for (const sheetName of ["导入说明", "客户档案", "价格表", "尺寸颜色款式", "初始库存", "员工机台"]) {
  assert(workbookXml.includes(`name="${sheetName}"`), `workbook should include ${sheetName} sheet`);
}
assert(readmeXml.includes(MASTER_DATA_IMPORT_TEMPLATE_VERSION), "readme should include template version");
assert(readmeXml.includes("整表预检查"), "readme should include precheck rule");
assert(customerXml.includes("客户名称"), "customer sheet should include customer name column");
assert(customerXml.includes("联系人姓名"), "customer sheet should include contact column");
assert(customerXml.includes("张三服饰"), "customer sheet should include sample customer");
assert(priceXml.includes("价格表名称"), "price sheet should include price table name column");
assert(priceXml.includes("袋子价格表1"), "price sheet should include sample price table");
assert(priceXml.includes("待审核"), "price sheet should include review status sample");
assert(specXml.includes("30*37*10"), "spec sheet should include canonical size sample");
assert(specXml.includes("大红/红袋"), "spec sheet should include color aliases");
assert(inventoryXml.includes("在库数量"), "inventory sheet should include quantity column");
assert(inventoryXml.includes("2480"), "inventory sheet should include sample inventory quantity");
assert(employeeXml.includes("王师傅"), "employee sheet should include sample worker");
assert(!readmeXml.includes("占位"), "master data template should not describe itself as a placeholder");

console.log("master-data import template check passed");
