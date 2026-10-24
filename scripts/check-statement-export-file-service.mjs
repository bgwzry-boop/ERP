import assert from "node:assert/strict";
import { createStatementExportFileService } from "../server/services/statementExportFileService.mjs";
import { statementExportContentDigest } from "../server/statementExportContent.mjs";
import { normalizeStatementExportFile } from "../server/statementExportRepository.mjs";

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
        contentDigest: statementExportContentDigest(Buffer.from(input.exportFile.content, "base64")),
        contentLength: Buffer.from(input.exportFile.content, "base64").length,
      };
    },
    async readExportFile(input) {
      calls.read.push(input);
      return {
        buffer: Buffer.from(input.exportFile.content, "base64"),
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
const expectedBytes = Buffer.from(exportFile.content, "base64");
assert.equal(workspace.savedExport.contentDigest, statementExportContentDigest(expectedBytes));
assert.equal(workspace.savedExport.metadata.storageKeyStored, true);
assert.equal(workspace.savedExport.metadata.contentLength, expectedBytes.length);

const listResult = await service.listExports({ workspace, statementId: "ST-1" });
assert.equal(calls.list.length, 1);
assert.equal(listResult.response.total, 1);
assert.equal(listResult.response.items[0].storageKeyStored, true);
assert.equal(Object.hasOwn(listResult.response.items[0], "storageKey"), false);
assert.equal(Object.hasOwn(listResult.response.items[0], "content"), false);

const download = await service.getExportDownload({ workspace, statementId: "ST-1", downloadToken: "DL-ST-1" });
assert.equal(calls.find.length, 1);
assert.equal(calls.read.length, 1);
assert.deepEqual(download.response.body, expectedBytes);
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

const integrityError = error => error.statusCode === 409 && error.code === "STATEMENT_EXPORT_CONTENT_INTEGRITY_MISMATCH";
function downloadWorkspace(file, buffer = expectedBytes) {
  return {
    statements: [statement],
    statementExportRepository: { async findExportFileByToken() { return file; } },
    statementExportObjectStorage: { async readExportFile() { return buffer === null ? null : { buffer, contentType: file.contentType }; } },
  };
}
const getDownload = current => service.getExportDownload({ workspace: current, statementId: "ST-1", downloadToken: "DL-ST-1" });
const frozenFile = structuredClone(workspace.savedExport);
const originalFile = structuredClone(frozenFile);
await assert.rejects(() => getDownload(downloadWorkspace(frozenFile, Buffer.from("corrupted workbook"))), integrityError);
for (const changed of [
  { ...frozenFile, contentDigest: `sha256:${"0".repeat(64)}` },
  { ...frozenFile, content: "", contentLength: 0 },
  { ...frozenFile, metadata: { ...frozenFile.metadata, contentDigest: `sha256:${"1".repeat(64)}` } },
  { ...frozenFile, metadata: { ...frozenFile.metadata, contentLength: expectedBytes.length + 1 } },
  { ...frozenFile, metadata: { ...frozenFile.metadata, contentLength: String(expectedBytes.length) } },
  { ...frozenFile, storageKey: `statement-exports/sha256/00/${"0".repeat(64)}` },
  { ...frozenFile, storageKey: `statement-exports/sha256/ff/${frozenFile.contentDigest.slice(7)}` },
  { ...frozenFile, storageKey: "statement-exports/sha256/invalid" },
]) await assert.rejects(() => getDownload(downloadWorkspace(changed)), integrityError);
const missingObject = await getDownload(downloadWorkspace({ ...frozenFile, storageProvider: "object_storage" }, null));
assert.equal(missingObject.code, "STATEMENT_EXPORT_CONTENT_NOT_FOUND", "a retained DB copy cannot conceal a missing authoritative object");
const missingAdapter = downloadWorkspace({ ...frozenFile, storageProvider: "object_storage" });
delete missingAdapter.statementExportObjectStorage;
assert.equal((await getDownload(missingAdapter)).code, "STATEMENT_EXPORT_CONTENT_NOT_FOUND");
assert.deepEqual(frozenFile, originalFile, "failed downloads never rewrite frozen metadata");

const legacyDatabase = { ...exportFile, contentDigest: statementExportContentDigest(Buffer.from(exportFile.content, "utf8")) };
assert.equal((await getDownload({ ...fallbackWorkspace, statementExportRepository: { async findExportFileByToken() { return legacyDatabase; } } })).response.body, exportFile.content,
  "legacy database-only base64-text digests remain readable against the same frozen workbook");
const legacyTextLength = Buffer.byteLength(exportFile.content, "utf8");
assert.notEqual(legacyTextLength, expectedBytes.length, "legacy fixture must distinguish text length from decoded workbook length");
const legacyLengthFile = { ...legacyDatabase, metadata: { ...legacyDatabase.metadata, contentLength: legacyTextLength } };
const databaseDownload = file => getDownload({ ...fallbackWorkspace, statementExportRepository: { async findExportFileByToken() { return file; } } });
assert.equal((await databaseDownload(legacyLengthFile)).response.body, exportFile.content,
  "verified legacy database text digest permits its matching historical text length");
await assert.rejects(() => databaseDownload({ ...legacyLengthFile, metadata: { ...legacyLengthFile.metadata, contentLength: legacyTextLength + 1 } }), integrityError);
await assert.rejects(() => databaseDownload({ ...legacyLengthFile, content: Buffer.from("changed legacy workbook").toString("base64") }), integrityError);
for (const storageProvider of ["object_storage", "local_fs"]) {
  await assert.rejects(() => getDownload(downloadWorkspace({ ...legacyLengthFile, storageProvider })), integrityError,
    "legacy text digest/length exceptions are never valid for object or local-file sources");
}
await assert.rejects(() => databaseDownload({ ...legacyLengthFile, contentDigest: statementExportContentDigest(expectedBytes) }), integrityError,
  "a current decoded-byte digest cannot authorize an old text-length exception");
const normalized = normalizeStatementExportFile({ ...exportFile, contentDigest: "" });
assert.equal(normalized.contentDigest, statementExportContentDigest(expectedBytes), "new repository digests identify decoded workbook bytes");
await assert.rejects(() => service.storeExportFile({ statementExportObjectStorage: {
  async putExportFile() { return { storageProvider: "object_storage", contentDigest: `sha256:${"f".repeat(64)}` }; },
} }, exportFile), integrityError, "a mismatched storage receipt cannot become persisted metadata");

console.log(
  "Statement export file service checks passed: frozen XLSX digest/length/key integrity, corrupt or missing object rejection without DB fallback, verified legacy database archives, safe naming and redacted summaries.",
);
