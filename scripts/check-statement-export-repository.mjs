import assert from "node:assert/strict";
import {
  buildCreateStatementExportTransactionQuery,
  buildCreateStatementExportTransactionSql,
  buildFindLatestStatementExportQuery,
  buildFindLatestStatementExportSql,
  buildFindStatementExportByTokenQuery,
  buildFindStatementExportByTokenSql,
  buildListStatementExportsQuery,
  buildListStatementExportsSql,
  createLocalStatementExportRepository,
  createPostgresStatementExportRepository,
} from "../server/statementExportRepository.mjs";

await checkLocalStatementExportRepository();
await checkPostgresStatementExportSqlBoundary();
await checkPostgresStatementExportIdempotencyBoundary();

console.log(
  "Statement export repository check passed: local workspace mutation and PostgreSQL statement lines + metadata/content SQL are covered.",
);

async function checkLocalStatementExportRepository() {
  const repository = createLocalStatementExportRepository();
  const workspace = { statementExportFiles: [], statementLines: [], operationLogs: [] };
  const exportFile = buildExportFile();
  const statementLines = buildStatementLines();
  const operationLog = buildOperationLog();

  const transaction = await repository.createExportFile({ workspace, exportFile, statementLines, operationLog });

  assert.equal(transaction.exportFile.downloadToken, "DL-ST-EXPORT-001-CUSTOMER");
  assert.equal(transaction.exportFile.metadata.templateVersion, "p0-statement-xlsx-v1");
  assert.equal(transaction.exportFile.contentEncoding, "base64");
  assert.equal(transaction.statementLines.length, 2);
  assert.equal(transaction.operationLogId, "LOG-ST-EXPORT-001");
  assert.equal(workspace.statementExportFiles.length, 1);
  assert.equal(workspace.statementLines.length, 2);
  assert.equal(workspace.operationLogs.length, 1);
  assert.equal((await repository.listExportFiles({ workspace, statementId: "ST-EXPORT-001" })).length, 1);
  assert.equal(
    (await repository.findExportFileByToken({
      workspace,
      statementId: "ST-EXPORT-001",
      downloadToken: "DL-ST-EXPORT-001-CUSTOMER",
    })).content,
    exportFile.content,
  );
  assert.equal(
    (await repository.findLatestExportFile({ workspace, statementId: "ST-EXPORT-001", previewType: "customer_send" }))
      .downloadToken,
    "DL-ST-EXPORT-001-CUSTOMER",
  );
}

async function checkPostgresStatementExportSqlBoundary() {
  const calls = [];
  const exportFile = buildExportFile({ fileName: "statement-O'Brien.xlsx" });
  const statementLines = buildStatementLines();
  const operationLog = buildOperationLog();
  const repository = createPostgresStatementExportRepository({
    queryJson(text, values) {
      calls.push({ text, values });
      if (text.includes("INSERT INTO statement_export_files")) {
        return { exportFile, statementLines, operationLogId: operationLog.id };
      }
      if (text.includes("COALESCE(json_agg")) return [{ ...exportFile, content: "" }];
      return exportFile;
    },
  });
  const workspace = { statementExportFiles: [], statementLines: [], operationLogs: [] };

  const transaction = await repository.createExportFile({ workspace, exportFile, statementLines, operationLog });
  const listed = await repository.listExportFiles({ statementId: exportFile.statementId });
  const found = await repository.findExportFileByToken({
    statementId: exportFile.statementId,
    downloadToken: exportFile.downloadToken,
  });
  const latest = await repository.findLatestExportFile({
    statementId: exportFile.statementId,
    previewType: exportFile.previewType,
  });

  assert.equal(transaction.exportFile.downloadToken, exportFile.downloadToken);
  assert.equal(transaction.statementLines[0].statementId, exportFile.statementId);
  assert.equal(listed[0].content, "");
  assert.equal(found.content, exportFile.content);
  assert.equal(latest.downloadToken, exportFile.downloadToken);
  assert.equal(workspace.statementExportFiles.length, 1);
  assert.equal(workspace.statementLines.length, 2);
  assert.equal(workspace.operationLogs.length, 1);

  const createQuery = calls[0];
  assert.match(createQuery.text, /^BEGIN;/);
  assert.match(createQuery.text, /DELETE FROM statement_lines/);
  assert.match(createQuery.text, /INSERT INTO statement_lines/);
  assert.match(createQuery.text, /chargeable_qty/);
  assert.match(createQuery.text, /INSERT INTO statement_export_files/);
  assert.match(createQuery.text, /content_text/);
  assert.match(createQuery.text, /metadata_json/);
  assert.match(createQuery.text, /INSERT INTO operation_logs/);
  assert.match(createQuery.text, /COMMIT;/);
  assert.ok(!createQuery.text.includes("p0-statement-xlsx-v1"));
  assert.ok(!createQuery.text.includes("O'Brien"));

  const listSql = buildListStatementExportsSql({ statementId: exportFile.statementId, includeContent: false });
  assert.match(listSql, /FROM statement_export_files/);
  assert.match(listSql, /''/);
  assert.ok(!listSql.includes(exportFile.statementId));

  const findSql = buildFindStatementExportByTokenSql({
    statementId: exportFile.statementId,
    downloadToken: exportFile.downloadToken,
    includeContent: true,
  });
  assert.match(findSql, /download_token = \$2::text/);
  assert.match(findSql, /content_text/);

  const latestSql = buildFindLatestStatementExportSql({
    statementId: exportFile.statementId,
    previewType: "customer_send",
  });
  assert.match(latestSql, /preview_type = \$1::text/);

  const directCreateSql = buildCreateStatementExportTransactionSql({ exportFile, statementLines, operationLog });
  assert.match(directCreateSql, /operation_log_id/);
  assert.match(directCreateSql, /statementLines/);
  assert.ok(!directCreateSql.includes(exportFile.fileName));

  const directCreateQuery = buildCreateStatementExportTransactionQuery({ exportFile, statementLines, operationLog });
  assert.equal(directCreateQuery.values.includes(exportFile.fileName), true);
  assert.equal(directCreateQuery.values.includes(exportFile.content), true);
  assert.equal(directCreateQuery.values.includes("p0-statement-xlsx-v1"), false);
  assert.equal(directCreateQuery.values.some((value) => String(value).includes("p0-statement-xlsx-v1")), true);
  assert.deepEqual(buildListStatementExportsQuery({ statementId: exportFile.statementId, limit: 10 }).values, [
    exportFile.statementId,
    10,
  ]);
  assert.deepEqual(buildFindStatementExportByTokenQuery({
    statementId: exportFile.statementId,
    downloadToken: exportFile.downloadToken,
    includeContent: true,
  }).values, [exportFile.statementId, exportFile.downloadToken]);
  assert.deepEqual(buildFindLatestStatementExportQuery({
    statementId: exportFile.statementId,
    previewType: "customer_send",
  }).values, ["customer_send", exportFile.statementId]);
}

async function checkPostgresStatementExportIdempotencyBoundary() {
  const requests = [];
  const exportFile = buildExportFile();
  const statementLines = buildStatementLines();
  const operationLog = buildOperationLog();
  const repository = createPostgresStatementExportRepository({
    queryJson() {
      return null;
    },
    async idempotentTransactionJson(request) {
      requests.push(request);
      return { exportFile, statementLines, operationLogId: operationLog.id };
    },
  });
  const workspace = { statementExportFiles: [], statementLines: [], operationLogs: [] };
  await repository.createExportFile({
    workspace,
    exportFile,
    statementLines,
    operationLog,
    idempotencyKey: "statement-export-idempotency-001",
    idempotencyPayload: { statementId: exportFile.statementId, previewType: exportFile.previewType },
  });

  assert.equal(requests[0].scope, "statement.export.create");
  assert.ok(requests[0].resourceLocks.includes(`statement:${exportFile.statementId}`));
  assert.equal(requests[0].operatorId, operationLog.operatorId);
}

function buildExportFile(overrides = {}) {
  return {
    exportFileId: "DL-ST-EXPORT-001-CUSTOMER",
    statementId: "ST-EXPORT-001",
    previewType: "customer_send",
    downloadToken: "DL-ST-EXPORT-001-CUSTOMER",
    operationLogId: "LOG-ST-EXPORT-001",
    fileName: overrides.fileName ?? "statement-ST-EXPORT-001.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: Buffer.from("customer send xlsx").toString("base64"),
    contentEncoding: "base64",
    storageProvider: "database",
    storageKey: "",
    contentDigest: "",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T10:30:00.000Z",
    metadata: {
      lineCount: 1,
      receivable: 273,
      templateId: "tpl-p0-statement-customer-send",
      templateVersion: "p0-statement-xlsx-v1",
      workbookFormat: "XLSX Office Open XML",
      contentEncoding: "base64",
      worksheetNames: ["对账汇总", "交付明细"],
    },
  };
}

function buildStatementLines() {
  return [
    {
      statementLineId: "ST-EXPORT-001-001",
      statementId: "ST-EXPORT-001",
      orderLineId: "ORD-EXPORT-001-01",
      fulfillmentId: "F-EXPORT-001",
      deliveredQty: 500,
      chargeableQty: 500,
      freeQty: 0,
      amount: 180,
      adjustmentAmount: 0,
      finalAmount: 180,
      createdAt: "2026-07-02T10:30:00.000Z",
    },
    {
      statementLineId: "ST-EXPORT-001-002",
      statementId: "ST-EXPORT-001",
      orderLineId: "ORD-EXPORT-002-01",
      fulfillmentId: "",
      deliveredQty: 100,
      chargeableQty: 100,
      freeQty: 0,
      amount: 36,
      adjustmentAmount: 0,
      finalAmount: 36,
      createdAt: "2026-07-02T10:30:00.000Z",
    },
  ];
}

function buildOperationLog() {
  return {
    id: "LOG-ST-EXPORT-001",
    targetType: "statement",
    targetId: "ST-EXPORT-001",
    action: "preview_statement",
    before: null,
    after: {
      previewType: "customer_send",
      lineCount: 1,
      downloadToken: "DL-ST-EXPORT-001-CUSTOMER",
    },
    reason: "",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:30:00.000Z",
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}
