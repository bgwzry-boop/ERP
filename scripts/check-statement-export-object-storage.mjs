import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStatementExportObjectStorage } from "../server/statementExportObjectStorage.mjs";

const tempRoot = mkdtempSync(join(tmpdir(), "erp-statement-export-storage-"));

try {
  await checkLocalStatementExportStorage();
  await checkS3CompatibleStatementExportStorage();
  await checkMissingObjectStorageConfiguration();
  console.log(
    "Statement export object storage check passed: local file retention, S3-compatible PUT/GET signing, and missing-config failures are covered.",
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

async function checkLocalStatementExportStorage() {
  const storage = createStatementExportObjectStorage({
    mode: "local_fs",
    storageRoot: tempRoot,
  });
  const exportFile = buildExportFile();
  const stored = await storage.putExportFile({ exportFile });
  const expectedBytes = Buffer.from(exportFile.content, "base64");
  const expectedDigest = createHash("sha256").update(expectedBytes).digest("hex");

  assert.equal(storage.kind, "local_fs");
  assert.equal(stored.storageProvider, "local_fs");
  assert.equal(stored.storageKey, "statement-exports/DL-STORAGE-001/statement-STORAGE-001.xlsx");
  assert.equal(stored.contentDigest, `sha256:${expectedDigest}`);
  assert.equal(stored.contentLength, expectedBytes.length);

  const objectPath = join(tempRoot, stored.storageKey);
  assert.equal(existsSync(objectPath), true);
  assert.equal(readFileSync(objectPath).toString("utf8"), expectedBytes.toString("utf8"));

  const read = await storage.readExportFile({
    exportFile: {
      ...exportFile,
      storageProvider: stored.storageProvider,
      storageKey: stored.storageKey,
    },
  });
  assert.equal(read.contentType, exportFile.contentType);
  assert.equal(read.buffer.toString("utf8"), expectedBytes.toString("utf8"));

  const databaseOnlyRead = await storage.readExportFile({
    exportFile: {
      ...exportFile,
      storageProvider: "database",
      storageKey: "",
    },
  });
  assert.equal(databaseOnlyRead, null);

  const deleted = await storage.deleteExportFile({ storageKey: stored.storageKey });
  assert.equal(deleted.storageProvider, "local_fs");
  assert.equal(deleted.deleted, true);
  assert.equal(existsSync(objectPath), false);
}

async function checkS3CompatibleStatementExportStorage() {
  const fetchCalls = [];
  const storage = createStatementExportObjectStorage({
    mode: "object_storage",
    endpoint: "https://storage.example.test",
    bucket: "erp-bucket",
    region: "cn-east-1",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "SECRETEXAMPLE",
    keyPrefix: "erp-statement-exports",
    forcePathStyle: true,
    now: new Date("2026-07-02T08:00:00.000Z"),
    fetch: async (url, init = {}) => {
      fetchCalls.push({ url: String(url), init });
      if (init.method === "GET") {
        const buffer = Buffer.from(buildExportFile().content, "base64");
        return {
          ok: true,
          status: 200,
          headers: new Map([["content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]]),
          arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
          text: async () => "",
        };
      }
      if (init.method === "DELETE") {
        return {
          ok: true,
          status: 204,
          text: async () => "",
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => "",
      };
    },
  });
  const exportFile = buildExportFile({ exportFileId: "DL-STORAGE-REMOTE-001" });
  const stored = await storage.putExportFile({ exportFile });

  assert.equal(storage.kind, "object_storage");
  assert.equal(stored.storageProvider, "object_storage");
  assert.equal(stored.storageKey, "erp-statement-exports/DL-STORAGE-REMOTE-001/statement-STORAGE-001.xlsx");
  assert.equal(fetchCalls[0].url, "https://storage.example.test/erp-bucket/erp-statement-exports/DL-STORAGE-REMOTE-001/statement-STORAGE-001.xlsx");
  assert.equal(fetchCalls[0].init.method, "PUT");
  assert.match(fetchCalls[0].init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260702\/cn-east-1\/s3\/aws4_request/);

  const read = await storage.readExportFile({
    exportFile: {
      ...exportFile,
      storageProvider: stored.storageProvider,
      storageKey: stored.storageKey,
    },
  });
  assert.equal(read.buffer.toString("utf8"), Buffer.from(buildExportFile().content, "base64").toString("utf8"));
  assert.equal(fetchCalls[1].init.method, "GET");
  assert.match(fetchCalls[1].init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260702\/cn-east-1\/s3\/aws4_request/);

  const deleted = await storage.deleteExportFile({ storageKey: stored.storageKey });
  assert.equal(deleted.storageProvider, "object_storage");
  assert.equal(deleted.deleted, true);
  assert.equal(fetchCalls[2].init.method, "DELETE");
  assert.match(fetchCalls[2].init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260702\/cn-east-1\/s3\/aws4_request/);
}

async function checkMissingObjectStorageConfiguration() {
  const storage = createStatementExportObjectStorage({
    mode: "object_storage",
    endpoint: "",
    bucket: "",
    accessKeyId: "",
    secretAccessKey: "",
  });
  assert.equal(storage.kind, "object_storage");
  assert.equal(storage.configured, false);
  await assert.rejects(() => storage.putExportFile({ exportFile: buildExportFile() }), /not configured yet/);
}

function buildExportFile(overrides = {}) {
  return {
    exportFileId: overrides.exportFileId ?? "DL-STORAGE-001",
    statementId: "ST-STORAGE-001",
    previewType: "customer_send",
    downloadToken: overrides.exportFileId ?? "DL-STORAGE-001",
    fileName: "statement-STORAGE-001.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: Buffer.from("xlsx-binary-proof").toString("base64"),
    contentEncoding: "base64",
  };
}
