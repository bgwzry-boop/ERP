import { createHash } from "node:crypto";

export function statementExportContentBuffer(exportFile) {
  if (Buffer.isBuffer(exportFile?.content)) return exportFile.content;
  if (exportFile?.content instanceof Uint8Array) return Buffer.from(exportFile.content);
  if (exportFile?.content instanceof ArrayBuffer) return Buffer.from(exportFile.content);
  return Buffer.from(String(exportFile?.content ?? ""), exportFile?.contentEncoding === "base64" ? "base64" : "utf8");
}

export function statementExportContentDigest(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

// Frozen metadata, the content-addressed key and retained workbook bytes are
// independent sources of identity. A mismatch must never become a file response.
export function assertStatementExportContent(exportFile, buffer) {
  if (!Buffer.isBuffer(buffer)) throw integrityError();
  const actualDigest = statementExportContentDigest(buffer);
  const inlinePresent = exportFile?.content !== undefined && exportFile?.content !== null && exportFile.content !== "";
  const inline = inlinePresent ? statementExportContentBuffer(exportFile) : null;
  if (inline && !inline.equals(buffer)) throw integrityError();
  const key = String(exportFile?.storageKey ?? "");
  const address = key.match(/(?:^|\/)sha256\/([a-f0-9]{2})\/([a-f0-9]{64})$/);
  if (key.includes("/sha256/") && !address) throw integrityError();
  if (address && (address[1] !== address[2].slice(0, 2) || actualDigest !== `sha256:${address[2]}`)) throw integrityError();

  for (const digest of [exportFile?.contentDigest, exportFile?.metadata?.contentDigest]) {
    if (digest === undefined || digest === null || digest === "") continue;
    if (typeof digest !== "string" || !/^(?:sha256:)?[a-f0-9]{64}$/.test(digest)) throw integrityError();
    const expected = digest.startsWith("sha256:") ? digest : `sha256:${digest}`;
    if (expected === actualDigest) continue;
    // Historical database-only rows hashed their persisted base64 text. Keep
    // those immutable archives readable only with the same retained text/bytes.
    const legacyDatabaseDigest = exportFile?.storageProvider === "database" && exportFile?.contentEncoding === "base64" &&
      typeof exportFile.content === "string" && inline && expected === statementExportContentDigest(Buffer.from(exportFile.content, "utf8"));
    if (!legacyDatabaseDigest) throw integrityError();
  }
  for (const length of [exportFile?.contentLength, exportFile?.metadata?.contentLength]) {
    if (length === undefined || length === null) continue;
    if (!Number.isSafeInteger(length) || length < 0 || length !== buffer.length) throw integrityError();
  }
  return buffer;
}

function integrityError() {
  return Object.assign(new Error("对账导出文件与原存档摘要不一致，请重新核对存档。"), {
    code: "STATEMENT_EXPORT_CONTENT_INTEGRITY_MISMATCH", statusCode: 409,
  });
}
