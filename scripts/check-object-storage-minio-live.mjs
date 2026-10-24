import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  createAttachmentObjectStorage,
  createS3SignedRequest,
  resolveObjectStorageConfig,
} from "../server/attachmentObjectStorage.mjs";
import { createStatementExportObjectStorage } from "../server/statementExportObjectStorage.mjs";
import { createStatementExportFileService } from "../server/services/statementExportFileService.mjs";
import {
  buildAttachmentV1Readiness,
  buildStatementExportV1Readiness,
} from "../server/services/fileRetentionV1ReadinessService.mjs";

const image =
  process.env.ERP_MINIO_DOCKER_IMAGE ||
  "ghcr.io/coollabsio/minio@sha256:69b55a1c1c5dc285ce04db96689f5b2102317fc77a50680a1874ca6efd1c87f9";
const containerName = `erp-minio-live-${process.pid}-${Date.now()}`;
const accessKeyId = "erpminio";
const secretAccessKey = "ERP_MINIO_LIVE_SECRET_2026";
const region = "us-east-1";
const attachmentBucket = "erp-v1-attachment-live";
const statementBucket = "erp-v1-statement-live";
let containerStarted = false;

installSignalCleanup();

try {
  requireDocker();
  containerStarted = true;
  startMinio();

  const endpoint = await waitForMinio();
  const attachmentConfig = buildStorageConfig({
    endpoint,
    bucket: attachmentBucket,
    keyPrefix: "attachments-live",
  });
  const statementConfig = buildStorageConfig({
    endpoint,
    bucket: statementBucket,
    keyPrefix: "statement-exports-live",
  });

  await createBucket(attachmentConfig);
  await createBucket(statementConfig);

  const attachmentStorage = createAttachmentObjectStorage({
    mode: "object_storage",
    ...attachmentConfig,
  });
  const statementStorage = createStatementExportObjectStorage({
    mode: "object_storage",
    ...statementConfig,
  });

  await checkAttachmentRoundTrip(attachmentStorage);
  await checkStatementExportRoundTrip(statementStorage, statementConfig);
  await checkStatementDownloadIntegrity(statementStorage, statementConfig);
  await checkProductionReadiness({ attachmentStorage, statementStorage });
  await checkStatementReadbackFailures(statementStorage, statementConfig);

  console.log(
    "MinIO live check passed: two private buckets, attachment round trip and signed URL, content-addressed immutable statement exports, denied anonymous/invalid-signature reads, real missing/corrupt-object readiness failures, cleanup, and production V1 readiness are covered.",
  );
} finally {
  cleanupContainer();
}

function requireDocker() {
  runDocker(["info", "--format", "{{.ServerVersion}}"], {
    timeout: 15_000,
    failureMessage: "Docker is required for the MinIO live check.",
  });
}

function startMinio() {
  runDocker(
    [
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "--publish",
      "127.0.0.1::9000",
      "--env",
      "MINIO_ROOT_USER",
      "--env",
      "MINIO_ROOT_PASSWORD",
      image,
      "server",
      "/data",
      "--address",
      ":9000",
    ],
    {
      timeout: readPositiveInteger(process.env.ERP_MINIO_START_TIMEOUT_MS, 180_000),
      environment: {
        MINIO_ROOT_USER: accessKeyId,
        MINIO_ROOT_PASSWORD: secretAccessKey,
      },
      failureMessage: "Unable to start the temporary MinIO container.",
    },
  );
}

async function waitForMinio() {
  let endpoint = "";
  let lastError = "MinIO did not expose a mapped port.";
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      endpoint ||= readMappedEndpoint();
      if (endpoint) {
        const response = await fetch(`${endpoint}/minio/health/ready`);
        if (response.ok) return endpoint;
        lastError = `MinIO health check returned HTTP ${response.status}.`;
      }
    } catch (error) {
      lastError = sanitizeError(error);
    }
    await delay(500);
  }
  const logs = runDocker(["logs", "--tail", "40", containerName], {
    allowFailure: true,
    timeout: 10_000,
  }).slice(0, 2_000);
  throw new Error(`MinIO readiness timed out: ${lastError}${logs ? `\n${logs}` : ""}`);
}

function readMappedEndpoint() {
  const output = runDocker(["port", containerName, "9000/tcp"], {
    allowFailure: true,
    timeout: 10_000,
  });
  const match = output.match(/(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]|::):(\d+)/);
  return match ? `http://127.0.0.1:${match[1]}` : "";
}

function buildStorageConfig({ endpoint, bucket, keyPrefix }) {
  return {
    provider: "s3_compatible",
    endpoint,
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    keyPrefix,
    forcePathStyle: true,
  };
}

async function createBucket(options) {
  const config = resolveObjectStorageConfig(options);
  assert.equal(config.configured, true);
  const payloadHash = createHash("sha256").update("").digest("hex");
  const request = createS3SignedRequest({
    config,
    method: "PUT",
    storageKey: "",
    payloadHash,
  });
  const response = await fetch(request.url, {
    method: "PUT",
    headers: request.headers,
  });
  if (!response.ok && response.status !== 409) {
    throw new Error(`MinIO bucket creation failed with HTTP ${response.status}.`);
  }
}

async function checkAttachmentRoundTrip(storage) {
  const buffer = Buffer.from("ERP MinIO attachment integration proof", "utf8");
  const stored = await storage.putObject({
    attachmentId: "ATT-MINIO-LIVE-001",
    fileName: "attachment-proof.txt",
    contentPayload: { contentType: "text/plain", buffer },
  });
  assert.equal(stored.storageProvider, "object_storage");
  assert.match(stored.storageKey, /^attachments-live\/ATT-MINIO-LIVE-001\//);
  assert.equal(stored.contentDigest, sha256(buffer));

  const attachment = {
    attachmentId: "ATT-MINIO-LIVE-001",
    storageProvider: stored.storageProvider,
    storageKey: stored.storageKey,
    mimeType: "text/plain",
  };
  const read = await storage.readObject({ attachment });
  assert.deepEqual(read?.buffer, buffer);

  const access = storage.createAccessUrl({
    attachmentId: attachment.attachmentId,
    storageKey: attachment.storageKey,
    ttlSeconds: 300,
  });
  assert.equal(access.deliveryMode, "object_storage_signed_url");
  assert.doesNotMatch(access.accessUrl, new RegExp(secretAccessKey));
  const signedRead = await fetch(access.accessUrl);
  assert.equal(signedRead.status, 200);
  assert.deepEqual(Buffer.from(await signedRead.arrayBuffer()), buffer);

  const deleted = await storage.deleteObject({ storageKey: stored.storageKey });
  assert.equal(deleted.deleted, true);
  assert.equal(await storage.readObject({ attachment }), null);
}

async function checkStatementExportRoundTrip(storage, options) {
  const buffer = Buffer.from("ERP MinIO statement export integration proof", "utf8");
  const exportFile = {
    exportFileId: "DL-STMT-MINIO-LIVE-001",
    fileName: "statement-proof.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: buffer,
  };
  const stored = await storage.putExportFile({ exportFile });
  const digest = sha256(buffer);
  assert.equal(stored.storageProvider, "object_storage");
  assert.equal(stored.storageKey, `statement-exports-live/sha256/${digest.slice(0, 2)}/${digest}`);
  assert.equal(stored.contentDigest, `sha256:${digest}`);
  assert.equal(stored.contentLength, buffer.length);

  const read = await storage.readExportFile({ exportFile: { ...exportFile, ...stored } });
  assert.deepEqual(read?.buffer, buffer);
  assert.equal(read.contentType, exportFile.contentType);
  assert.equal(sha256(read.buffer), digest);

  const config = resolveObjectStorageConfig(options);
  const unsignedUrl = createS3SignedRequest({ config, method: "GET", storageKey: stored.storageKey }).url;
  const anonymousRead = await fetch(unsignedUrl);
  assert.equal(anonymousRead.status, 403, "a private statement object must not be readable without authentication");
  await anonymousRead.arrayBuffer();
  const invalidCredentials = createStatementExportObjectStorage({
    mode: "object_storage", ...options, secretAccessKey: "INVALID_MINIO_LIVE_SIGNATURE",
  });
  await assert.rejects(
    () => invalidCredentials.readExportFile({ exportFile: { ...exportFile, ...stored } }),
    /readObject failed with HTTP 403/,
    "a storage key alone must not grant download access",
  );

  const laterBuffer = Buffer.from("ERP MinIO changed statement export integration proof", "utf8");
  const later = await storage.putExportFile({ exportFile: { ...exportFile, content: laterBuffer } });
  const laterDigest = sha256(laterBuffer);
  assert.equal(later.storageKey, `statement-exports-live/sha256/${laterDigest.slice(0, 2)}/${laterDigest}`);
  assert.notEqual(later.storageKey, stored.storageKey, "reusing an export identity cannot overwrite different original bytes");
  assert.deepEqual((await storage.readExportFile({ exportFile: { ...exportFile, ...stored } })).buffer, buffer);
  assert.deepEqual((await storage.readExportFile({ exportFile: { ...exportFile, ...later, content: laterBuffer } })).buffer, laterBuffer);
  const identical = await storage.putExportFile({
    exportFile: { ...exportFile, exportFileId: "DL-STMT-MINIO-LIVE-IDENTICAL" },
  });
  assert.equal(identical.storageKey, stored.storageKey, "object identity follows verified content, not an arbitrary export token");

  assert.equal((await storage.deleteExportFile({ storageKey: later.storageKey })).deleted, true);
  const deleted = await storage.deleteExportFile({ storageKey: stored.storageKey });
  assert.equal(deleted.deleted, true);
  assert.equal(await storage.readExportFile({ exportFile: { ...exportFile, ...stored } }), null);
}

async function checkStatementDownloadIntegrity(storage, options) {
  const buffer = Buffer.from("Frozen real MinIO workbook download proof", "utf8");
  const source = {
    exportFileId: "DL-STMT-MINIO-INTEGRITY", downloadToken: "DL-STMT-MINIO-INTEGRITY", statementId: "ST-MINIO-INTEGRITY",
    fileName: "integrity-proof.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: buffer.toString("base64"), contentEncoding: "base64", metadata: { contentLength: buffer.length },
  };
  const exportFile = { ...source, ...await storage.putExportFile({ exportFile: source }) };
  const before = structuredClone(exportFile);
  const service = createStatementExportFileService({ buildStatementPreviewLines: () => [] });
  const workspace = {
    statements: [{ id: source.statementId }], statementExportObjectStorage: storage,
    statementExportRepository: { async findExportFileByToken() { return exportFile; } },
  };
  const download = () => service.getExportDownload({ workspace, statementId: source.statementId, downloadToken: source.downloadToken });
  assert.deepEqual((await download()).response.body, buffer);
  const corrupt = Buffer.from("Damaged real MinIO workbook must never return HTTP file success", "utf8");
  const request = createS3SignedRequest({
    config: resolveObjectStorageConfig(options), method: "PUT", storageKey: exportFile.storageKey,
    payloadHash: sha256(corrupt), contentType: source.contentType,
  });
  const overwrite = await fetch(request.url, { method: "PUT", headers: request.headers, body: corrupt });
  assert.equal(overwrite.ok, true);
  await overwrite.arrayBuffer();
  await assert.rejects(download, error => error.statusCode === 409 && error.code === "STATEMENT_EXPORT_CONTENT_INTEGRITY_MISMATCH");
  await assert.rejects(
    () => storage.readExportFile({ exportFile: { ...exportFile, content: "" } }),
    error => error.statusCode === 409 && error.code === "STATEMENT_EXPORT_CONTENT_INTEGRITY_MISMATCH",
    "frozen digest and content-addressed key reject corrupt actual bytes even without an inline copy",
  );
  await storage.putExportFile({ exportFile: source });
  assert.deepEqual((await download()).response.body, buffer, "only restored original bytes may be downloaded");
  assert.equal((await storage.deleteExportFile({ storageKey: exportFile.storageKey })).deleted, true);
  assert.equal((await download()).code, "STATEMENT_EXPORT_CONTENT_NOT_FOUND", "missing real storage must not fall back to retained database content");
  assert.deepEqual(exportFile, before, "read failures preserve the frozen export record");
}

async function checkStatementReadbackFailures(storage, options) {
  const config = resolveObjectStorageConfig(options);
  for (const fault of ["missing", "corrupt"]) {
    let probeFile;
    let writeCount = 0;
    const faultedStorage = {
      ...storage,
      async putExportFile(input) {
        const stored = await storage.putExportFile(input);
        writeCount += 1;
        probeFile = { ...input.exportFile, ...stored };
        if (fault === "missing") {
          assert.equal((await storage.deleteExportFile({ storageKey: stored.storageKey })).deleted, true);
        } else {
          const corrupt = Buffer.from("MinIO diagnostic object deliberately corrupted after successful PUT", "utf8");
          const request = createS3SignedRequest({
            config, method: "PUT", storageKey: stored.storageKey,
            payloadHash: sha256(corrupt), contentType: input.exportFile.contentType,
          });
          const overwrite = await fetch(request.url, { method: "PUT", headers: request.headers, body: corrupt });
          assert.equal(overwrite.ok, true, "the corruption fixture must alter actual MinIO bytes before the real read");
          await overwrite.arrayBuffer();
        }
        return stored;
      },
    };
    const readiness = await buildStatementExportV1Readiness({
      workspace: { runtimeConfig: { mode: "production" }, statementExportObjectStorage: faultedStorage },
      operatorId: "U-MINIO-LIVE-CHECK", env: {},
    });
    assert.equal(writeCount, 1, "the readiness probe must successfully write one real diagnostic object");
    assert.equal(readiness.ready, false, `${fault} storage bytes must block production readiness`);
    assert.equal(readiness.status, "blocked");
    assert.equal(readiness.diagnostics.writeOk, true);
    assert.equal(readiness.diagnostics.readOk, false);
    assert.equal(readiness.diagnostics.digestOk, false);
    assert.ok(readiness.blockingCriteria.some(item => item.key === "statement-export-storage-diagnostic-readwrite"));
    assert.equal(readiness.safeguards.diagnosticObjectCleanedUp, true);
    assert.equal(readiness.safeguards.secretFieldsExposed, false);
    assert.doesNotMatch(JSON.stringify(readiness), new RegExp(secretAccessKey));
    assert.equal(await storage.readExportFile({ exportFile: probeFile }), null, "failed diagnostics must leave no object behind");
  }
}

async function checkProductionReadiness({ attachmentStorage, statementStorage }) {
  const runtimeConfig = { mode: "production" };
  const attachmentReadiness = await buildAttachmentV1Readiness({
    workspace: { runtimeConfig, attachmentObjectStorage: attachmentStorage },
    operatorId: "U-MINIO-LIVE-CHECK",
    env: {},
  });
  const statementReadiness = await buildStatementExportV1Readiness({
    workspace: { runtimeConfig, statementExportObjectStorage: statementStorage },
    operatorId: "U-MINIO-LIVE-CHECK",
    env: {},
  });
  for (const readiness of [attachmentReadiness, statementReadiness]) {
    assert.equal(readiness.ready, true);
    assert.equal(readiness.summary.label, "5/5 通过");
    assert.equal(readiness.storageMode.objectStorageLive, true);
    assert.equal(readiness.safeguards.diagnosticObjectCleanedUp, true);
    assert.equal(readiness.safeguards.secretFieldsExposed, false);
    assert.doesNotMatch(JSON.stringify(readiness), new RegExp(secretAccessKey));
  }
}

function runDocker(
  args,
  { allowFailure = false, timeout = 30_000, environment = {}, failureMessage = "Docker command failed." } = {},
) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    env: { ...process.env, ...environment },
    killSignal: "SIGKILL",
    maxBuffer: 2 * 1024 * 1024,
    timeout,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (!allowFailure && (result.error || result.status !== 0)) {
    const reason =
      result.error?.code === "ETIMEDOUT" ? "command timed out" : sanitizeSensitiveText(output) || sanitizeError(result.error);
    throw new Error(`${failureMessage} ${reason}`.trim());
  }
  return output;
}

function installSignalCleanup() {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      cleanupContainer();
      process.exit(128 + (signal === "SIGINT" ? 2 : 15));
    });
  }
}

function cleanupContainer() {
  if (!containerStarted) return;
  runDocker(["rm", "--force", containerName], { allowFailure: true, timeout: 15_000 });
  containerStarted = false;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeError(error) {
  return sanitizeSensitiveText(error?.message || error || "unknown error");
}

function sanitizeSensitiveText(value) {
  return String(value).replaceAll(secretAccessKey, "[REDACTED]");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
