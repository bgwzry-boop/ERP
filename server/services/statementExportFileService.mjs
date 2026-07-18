import {
  STATEMENT_EXCEL_CONTENT_TYPE,
  STATEMENT_EXCEL_FILE_EXTENSION,
  buildStatementExcelMetadata,
  buildStatementExcelWorkbookBase64,
  getStatementExcelTemplateId,
} from "../../src/domain/statementExcelTemplate.js";

export function createStatementExportFileService({ buildStatementPreviewLines, now = () => new Date().toISOString() } = {}) {
  requireFunction(buildStatementPreviewLines, "buildStatementPreviewLines");

  return {
    buildExportFile,
    getExportDownload,
    listExports,
    storeExportFile,
    toExportSummary,
  };

  function buildExportFile(workspace, statement, options = {}) {
    const customer = (workspace.customers ?? []).find((item) => item.id === statement.customerId) ?? {};
    const previewType = options.previewType === "internal_archive" ? "internal_archive" : "customer_send";
    const lines = options.lines ?? buildStatementPreviewLines(workspace, statement);
    const summary = options.summary ?? {
      receivable: Number(statement.receivable ?? 0),
      received: Number(statement.received ?? 0),
      variance: Number(statement.variance ?? 0),
      lineCount: lines.length,
    };
    const createdAt = options.createdAt ?? now();
    const preview = {
      statementId: statement.id,
      previewType,
      summary,
      lines,
      downloadToken: options.downloadToken ?? "",
    };
    const templateContext = {
      statement,
      customer,
      generatedAt: createdAt,
      generatedBy: options.createdBy ?? "",
      templateId: options.templateId ?? getStatementExcelTemplateId(previewType),
    };

    return {
      exportFileId: options.downloadToken ?? "",
      statementId: statement.id,
      previewType,
      downloadToken: options.downloadToken ?? "",
      operationLogId: options.operationLogId ?? "",
      fileName: `statement-${statement.id}-${sanitizeDownloadFileName(customer.name)}${STATEMENT_EXCEL_FILE_EXTENSION}`,
      contentType: STATEMENT_EXCEL_CONTENT_TYPE,
      content: buildStatementExcelWorkbookBase64(preview, templateContext),
      contentEncoding: "base64",
      storageProvider: "database",
      storageKey: "",
      contentDigest: "",
      createdBy: options.createdBy ?? "",
      createdAt,
      metadata: buildStatementExcelMetadata(preview, templateContext),
    };
  }

  async function storeExportFile(workspace, exportFile) {
    if (typeof workspace.statementExportObjectStorage?.putExportFile !== "function") return exportFile;
    const storage = await workspace.statementExportObjectStorage.putExportFile({ exportFile });
    return {
      ...exportFile,
      storageProvider: storage.storageProvider || exportFile.storageProvider,
      storageKey: storage.storageKey || exportFile.storageKey,
      contentDigest: storage.contentDigest || exportFile.contentDigest,
      metadata: {
        ...exportFile.metadata,
        storageProvider: storage.storageProvider || exportFile.storageProvider,
        storageKeyStored: Boolean(storage.storageKey || exportFile.storageKey),
        contentDigest: storage.contentDigest || exportFile.contentDigest,
        contentLength: storage.contentLength ?? Buffer.byteLength(String(exportFile.content ?? ""), "utf8"),
        contentEncoding: exportFile.contentEncoding || "",
      },
    };
  }

  function toExportSummary(exportFile) {
    return {
      statementId: exportFile.statementId,
      previewType: exportFile.previewType,
      downloadToken: exportFile.downloadToken,
      operationLogId: exportFile.operationLogId,
      fileName: exportFile.fileName,
      contentType: exportFile.contentType,
      createdAt: exportFile.createdAt,
      templateId: exportFile.metadata?.templateId ?? "",
      templateVersion: exportFile.metadata?.templateVersion ?? "",
      workbookFormat: exportFile.metadata?.workbookFormat ?? "",
      worksheetNames: exportFile.metadata?.worksheetNames ?? [],
      storageProvider: exportFile.storageProvider ?? "",
      storageKeyStored: Boolean(exportFile.storageKey),
      contentDigest: exportFile.contentDigest ?? "",
      contentLength: Number(exportFile.metadata?.contentLength ?? 0),
    };
  }

  async function listExports({ workspace, statementId }) {
    if (!findStatement(workspace, statementId)) return notFound("STATEMENT_NOT_FOUND");
    requireRepositoryMethod(workspace, "listExportFiles");
    const items = (await workspace.statementExportRepository.listExportFiles({ workspace, statementId })).map(toExportSummary);
    return { response: { items, total: items.length } };
  }

  async function getExportDownload({ workspace, statementId, downloadToken }) {
    if (!findStatement(workspace, statementId)) return notFound("STATEMENT_NOT_FOUND");
    requireRepositoryMethod(workspace, "findExportFileByToken");
    const exportFile = await workspace.statementExportRepository.findExportFileByToken({
      workspace,
      statementId,
      downloadToken,
    });
    if (!exportFile) return notFound("STATEMENT_EXPORT_NOT_FOUND");

    const storedContent = await readStoredContent(workspace, exportFile);
    if (!storedContent && !exportFile.content) return notFound("STATEMENT_EXPORT_CONTENT_NOT_FOUND");
    return {
      response: {
        body: storedContent?.buffer ?? exportFile.content,
        options: {
          contentType: storedContent?.contentType ?? exportFile.contentType,
          contentEncoding: storedContent ? "" : exportFile.contentEncoding,
          fileName: exportFile.fileName,
        },
      },
    };
  }

  async function readStoredContent(workspace, exportFile) {
    if (typeof workspace.statementExportObjectStorage?.readExportFile !== "function") return null;
    return workspace.statementExportObjectStorage.readExportFile({ exportFile });
  }
}

function findStatement(workspace, statementId) {
  return (workspace.statements ?? []).find((item) => item.id === statementId) ?? null;
}

function sanitizeDownloadFileName(value) {
  const sanitized = String(value ?? "customer").replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "customer";
}

function notFound(code) {
  return { notFound: true, code };
}

function requireRepositoryMethod(workspace, methodName) {
  if (typeof workspace.statementExportRepository?.[methodName] !== "function") {
    throw new TypeError(`workspace.statementExportRepository.${methodName} must be a function`);
  }
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
