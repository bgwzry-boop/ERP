import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  createAttachmentObjectStorage,
  createS3SignedRequest,
  resolveObjectStorageConfig,
} from "../server/attachmentObjectStorage.mjs";
import { createStatementExportObjectStorage } from "../server/statementExportObjectStorage.mjs";
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
  await checkStatementExportRoundTrip(statementStorage);
  await checkProductionReadiness({ attachmentStorage, statementStorage });

  console.log(
    "MinIO live check passed: container startup, two buckets, attachment and statement-export round trips, signed URL, cleanup, and production V1 readiness are covered.",
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

async function checkStatementExportRoundTrip(storage) {
  const buffer = Buffer.from("ERP MinIO statement export integration proof", "utf8");
  const exportFile = {
    exportFileId: "DL-STMT-MINIO-LIVE-001",
    fileName: "statement-proof.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: buffer,
  };
  const stored = await storage.putExportFile({ exportFile });
  assert.equal(stored.storageProvider, "object_storage");
  assert.match(stored.storageKey, /^statement-exports-live\/DL-STMT-MINIO-LIVE-001\//);
  assert.equal(stored.contentDigest, `sha256:${sha256(buffer)}`);

  const read = await storage.readExportFile({ exportFile: { ...exportFile, ...stored } });
  assert.deepEqual(read?.buffer, buffer);
  const deleted = await storage.deleteExportFile({ storageKey: stored.storageKey });
  assert.equal(deleted.deleted, true);
  assert.equal(await storage.readExportFile({ exportFile: { ...exportFile, ...stored } }), null);
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
