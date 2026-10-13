import assert from "node:assert/strict";
import { createStatementExportFileService } from "../server/services/statementExportFileService.mjs";

const fixedNow = "2026-07-14T09:00:00.000Z";
const calls = { put: [], read: [], list: [], find: [] };
const previewLines = [
  {
    statementLineId: "ST-1-001",
    statementId: "ST-1",
    orderLineId: "OL-1",
    fulfillmentId: "F-1",
    orderNo: "ORD-1",
    productName: "定制袋",
    goodsSpec: "定制袋 / 30*38 / 白印黑 / 单面 / 1000个",
    remark: "加长提",
    deliveredQty: 1000,
    chargeableQty: 1000,
    freeQty: 0,
    billQty: 1000,
    unitPrice: 0.5,
    amount: 500,
    adjustmentAmount: 0,
    finalAmount: 500,
  },
];
const statement = {
  id: "ST-1",
  customerId: "C-1",
  period: "2026-07",
  receivable: 500,
  received: 100,
  variance: 400,
};
const workspace = {
  customers: [{ id: "C-1", name: "白鲸 / 测试客户" }],
  statements: [statement],
  statementExportRepository: {
    async listExportFiles(input) {
      calls.list.push(input);
      return [workspace.savedExport];
    },
    async findExportFileByToken(input) {
      calls.find.push(input);
      return input.downloadToken === workspace.savedExport.downloadToken ? workspace.savedExport : null;
    },
  },
  statementExportObjectStorage: {
    async putExportFile(input) {
      calls.put.push(input);
      return {
        storageProvider: "s3",
        storageKey: "private/statements/ST-1.xlsx",
        contentDigest: "sha256:test-digest",
        contentLength: 4096,
      };
    },
    async readExportFile(input) {
      calls.read.push(input);
      return {
        buffer: Buffer.from("stored-xlsx"),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    },
  },
};

assert.throws(() => createStatementExportFileService(), /buildStatementPreviewLines must be a function/);
const service = createStatementExportFileService({
  buildStatementPreviewLines() {
    return structuredClone(previewLines);
  },
  now: () => fixedNow,
});

const statementBefore = structuredClone(statement);
const exportFile = service.buildExportFile(workspace, statement, {
  previewType: "customer_send",
  downloadToken: "DL-ST-1",
  operationLogId: "LOG-ST-1",
  createdBy: "U-FINANCE",
});
assert.deepEqual(statement, statementBefore);
assert.equal(exportFile.statementId, "ST-1");
assert.equal(exportFile.previewType, "customer_send");
assert.equal(exportFile.downloadToken, "DL-ST-1");
assert.equal(exportFile.createdAt, fixedNow);
assert.equal(exportFile.createdBy, "U-FINANCE");
assert.equal(exportFile.contentEncoding, "base64");
assert.match(exportFile.fileName, /^statement-ST-1-白鲸-测试客户\.xlsx$/);
assert.equal(/[\/:*?"<>|\s]/.test(exportFile.fileName.replace("statement-ST-1-", "")), false);
assert.equal(Buffer.from(exportFile.content, "base64").subarray(0, 2).toString("utf8"), "PK");
assert.equal(exportFile.metadata?.workbookFormat, "XLSX Office Open XML");
assert.equal(exportFile.metadata?.templateId, "tpl-p0-statement-customer-send");

workspace.savedExport = await service.storeExportFile(workspace, exportFile);
assert.equal(calls.put.length, 1);
assert.equal(workspace.savedExport.storageProvider, "s3");
assert.equal(workspace.savedExport.storageKey, "private/statements/ST-1.xlsx");
assert.equal(workspace.savedExport.contentDigest, "sha256:test-digest");
assert.equal(workspace.savedExport.metadata.storageKeyStored, true);
assert.equal(workspace.savedExport.metadata.contentLength, 4096);

const listResult = await service.listExports({ workspace, statementId: "ST-1" });
assert.equal(calls.list.length, 1);
assert.equal(listResult.response.total, 1);
assert.equal(listResult.response.items[0].storageKeyStored, true);
assert.equal(Object.hasOwn(listResult.response.items[0], "storageKey"), false);
assert.equal(Object.hasOwn(listResult.response.items[0], "content"), false);

const download = await service.getExportDownload({ workspace, statementId: "ST-1", downloadToken: "DL-ST-1" });
assert.equal(calls.find.length, 1);
assert.equal(calls.read.length, 1);
assert.equal(download.response.body.toString("utf8"), "stored-xlsx");
assert.equal(download.response.options.contentEncoding, "");
assert.equal(download.response.options.fileName, exportFile.fileName);

const missingStatement = await service.listExports({ workspace, statementId: "ST-MISSING" });
assert.equal(missingStatement.code, "STATEMENT_NOT_FOUND");
const missingExport = await service.getExportDownload({ workspace, statementId: "ST-1", downloadToken: "DL-MISSING" });
assert.equal(missingExport.code, "STATEMENT_EXPORT_NOT_FOUND");

const fallbackWorkspace = {
  statements: [statement],
  customers: workspace.customers,
  statementExportRepository: {
    async findExportFileByToken() {
      return exportFile;
    },
  },
};
const fallbackDownload = await service.getExportDownload({
  workspace: fallbackWorkspace,
  statementId: "ST-1",
  downloadToken: "DL-ST-1",
});
assert.equal(fallbackDownload.response.body, exportFile.content);
assert.equal(fallbackDownload.response.options.contentEncoding, "base64");

const emptyContentWorkspace = {
  statements: [statement],
  statementExportRepository: {
    async findExportFileByToken() {
      return { ...exportFile, content: "" };
    },
  },
};
const missingContent = await service.getExportDownload({
  workspace: emptyContentWorkspace,
  statementId: "ST-1",
  downloadToken: "DL-ST-1",
});
assert.equal(missingContent.code, "STATEMENT_EXPORT_CONTENT_NOT_FOUND");

console.log(
  "Statement export file service checks passed: XLSX construction, safe naming, object storage, redacted summaries, downloads, and missing-content handling are isolated.",
);
