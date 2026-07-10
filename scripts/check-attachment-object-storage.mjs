import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAttachmentObjectStorage,
  createLocalAttachmentObjectStorage,
  createS3CompatibleAttachmentObjectStorage,
  parseDataUrl,
  resolveObjectStorageConfig,
  sanitizeStorageFileName,
} from "../server/attachmentObjectStorage.mjs";

const tempRoot = mkdtempSync(join(tmpdir(), "erp-attachment-object-storage-"));

try {
  await checkLocalObjectStorage();
  await checkS3CompatibleObjectStorage();
  await checkConfiguredFactory();
  console.log("Attachment object storage check passed: local storage, S3-compatible signing, access URLs, token validation, and factory defaults are covered.");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

async function checkLocalObjectStorage() {
  const storage = createLocalAttachmentObjectStorage({
    storageRoot: tempRoot,
    tokenSecret: "attachment-storage-check-secret",
  });
  const contentPayload = parseDataUrl("data:image/png;base64,cGF5bWVudC1wcm9vZg==");
  assert.equal(contentPayload.contentType, "image/png");
  assert.equal(contentPayload.buffer.toString("utf8"), "payment-proof");
  assert.equal(sanitizeStorageFileName("payment proof/../proof.png"), "payment_proof-..-proof.png");

  const stored = await storage.putObject({
    attachmentId: "ATT-STORAGE-001",
    fileName: "payment proof.png",
    contentPayload,
  });
  assert.equal(stored.storageProvider, "local_fs");
  assert.equal(stored.storageKey, "attachments/ATT-STORAGE-001/payment_proof.png");
  assert.equal(stored.contentDigest, createHash("sha256").update("payment-proof").digest("hex"));
  const objectPath = join(tempRoot, stored.storageKey);
  assert.equal(existsSync(objectPath), true, "local object storage should write the file");
  assert.equal(readFileSync(objectPath, "utf8"), "payment-proof");

  const contentAddressed = await storage.putObject({
    attachmentId: "ATT-STORAGE-002",
    fileName: "payment proof copy.png",
    contentPayload,
    contentDigest: stored.contentDigest,
  });
  assert.equal(
    contentAddressed.storageKey,
    `attachments/sha256/${stored.contentDigest.slice(0, 2)}/${stored.contentDigest}`,
  );
  assert.equal(readFileSync(join(tempRoot, contentAddressed.storageKey), "utf8"), "payment-proof");
  await assert.rejects(
    async () =>
      storage.putObject({
        attachmentId: "ATT-STORAGE-003",
        fileName: "tampered.png",
        contentPayload,
        contentDigest: "0".repeat(64),
      }),
    /digest does not match/,
  );

  const attachment = {
    attachmentId: "ATT-STORAGE-001",
    storageProvider: stored.storageProvider,
    storageKey: stored.storageKey,
    mimeType: "image/png",
  };
  const read = await storage.readObject({ attachment });
  assert.equal(read.contentType, "image/png");
  assert.equal(read.buffer.toString("utf8"), "payment-proof");
  assert.throws(
    () =>
      storage.readObject({
        attachment: {
          attachmentId: "ATT-ESCAPE-001",
          storageProvider: "local_fs",
          storageKey: "../escape.txt",
        },
      }),
    /outside the local storage root/,
  );

  const deleted = await storage.deleteObject({ storageKey: stored.storageKey });
  assert.equal(deleted.storageProvider, "local_fs");
  assert.equal(deleted.deleted, true);
  assert.equal(existsSync(objectPath), false, "local object storage should clean up the diagnostic file");
  await storage.deleteObject({ storageKey: contentAddressed.storageKey });

  const fallbackRead = await storage.readObject({
    attachment: {
      attachmentId: "ATT-FALLBACK-001",
      storageProvider: "",
      storageKey: "",
      mimeType: "text/plain",
      contentDataUrl: "data:text/plain,hello%20fallback",
    },
  });
  assert.equal(fallbackRead.buffer.toString("utf8"), "hello fallback");

  const now = new Date("2026-07-01T00:00:00.000Z");
  const access = storage.createAccessUrl({
    attachmentId: "ATT-STORAGE-001",
    ttlSeconds: 120,
    now,
  });
  assert.equal(access.deliveryMode, "api_proxy");
  assert.equal(access.expiresAt, "2026-07-01T00:02:00.000Z");
  assert.match(access.accessUrl, /\/api\/attachments\/ATT-STORAGE-001\/content\?accessToken=/);
  const accessUrl = new URL(access.accessUrl, "http://127.0.0.1");
  const valid = storage.validateAccessToken({
    attachmentId: "ATT-STORAGE-001",
    accessToken: accessUrl.searchParams.get("accessToken"),
    expiresAt: accessUrl.searchParams.get("expiresAt"),
    now: new Date("2026-07-01T00:01:00.000Z"),
  });
  assert.equal(valid.valid, true);

  const expired = storage.validateAccessToken({
    attachmentId: "ATT-STORAGE-001",
    accessToken: accessUrl.searchParams.get("accessToken"),
    expiresAt: accessUrl.searchParams.get("expiresAt"),
    now: new Date("2026-07-01T00:03:00.000Z"),
  });
  assert.equal(expired.valid, false);
  assert.equal(expired.present, true);
  assert.equal(expired.message, "Attachment access token is expired.");

  const invalid = storage.validateAccessToken({
    attachmentId: "ATT-STORAGE-001",
    accessToken: "invalid-token",
    expiresAt: accessUrl.searchParams.get("expiresAt"),
    now: new Date("2026-07-01T00:01:00.000Z"),
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.message, "Attachment access token is invalid.");
}

async function checkS3CompatibleObjectStorage() {
  const fetchCalls = [];
  const storage = createS3CompatibleAttachmentObjectStorage({
    endpoint: "https://storage.example.test",
    bucket: "erp-bucket",
    region: "cn-east-1",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "SECRETEXAMPLE",
    keyPrefix: "erp-attachments",
    forcePathStyle: true,
    now: new Date("2026-07-01T08:00:00.000Z"),
    fetch: async (url, init = {}) => {
      fetchCalls.push({ url: String(url), init });
      if (init.method === "GET") {
        const buffer = Buffer.from("remote-proof");
        return {
          ok: true,
          status: 200,
          headers: new Map([["content-type", "image/png"]]),
          arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
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
  const contentPayload = parseDataUrl("data:image/png;base64,cmVtb3RlLXByb29m");
  const expectedDigest = createHash("sha256").update("remote-proof").digest("hex");
  const stored = await storage.putObject({
    attachmentId: "ATT-OBJECT-001",
    fileName: "remote proof.png",
    contentPayload,
    contentDigest: expectedDigest,
  });
  assert.equal(stored.storageProvider, "object_storage");
  assert.equal(stored.storageKey, `erp-attachments/sha256/${expectedDigest.slice(0, 2)}/${expectedDigest}`);
  assert.equal(stored.contentDigest, expectedDigest);
  assert.equal(
    fetchCalls[0].url,
    `https://storage.example.test/erp-bucket/erp-attachments/sha256/${expectedDigest.slice(0, 2)}/${expectedDigest}`,
  );
  assert.equal(fetchCalls[0].init.method, "PUT");
  assert.equal(fetchCalls[0].init.headers["x-amz-content-sha256"], stored.contentDigest);
  assert.match(fetchCalls[0].init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260701\/cn-east-1\/s3\/aws4_request/);

  const access = storage.createAccessUrl({
    attachmentId: "ATT-OBJECT-001",
    storageKey: stored.storageKey,
    ttlSeconds: 300,
    now: new Date("2026-07-01T08:30:00.000Z"),
  });
  assert.equal(access.deliveryMode, "object_storage_signed_url");
  assert.equal(access.expiresAt, "2026-07-01T08:35:00.000Z");
  const accessUrl = new URL(access.accessUrl);
  assert.equal(accessUrl.origin, "https://storage.example.test");
  assert.equal(accessUrl.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(accessUrl.searchParams.get("X-Amz-Expires"), "300");
  assert.match(accessUrl.searchParams.get("X-Amz-Signature"), /^[a-f0-9]{64}$/);

  const downloaded = await storage.readObject({
    attachment: {
      attachmentId: "ATT-OBJECT-001",
      storageProvider: "object_storage",
      storageKey: stored.storageKey,
      mimeType: "image/png",
    },
  });
  assert.equal(downloaded.contentType, "image/png");
  assert.equal(downloaded.buffer.toString("utf8"), "remote-proof");
  assert.equal(fetchCalls[1].init.method, "GET");
  assert.match(fetchCalls[1].init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260701\/cn-east-1\/s3\/aws4_request/);

  const deleted = await storage.deleteObject({ storageKey: stored.storageKey });
  assert.equal(deleted.storageProvider, "object_storage");
  assert.equal(deleted.deleted, true);
  assert.equal(fetchCalls[2].init.method, "DELETE");
  assert.match(fetchCalls[2].init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260701\/cn-east-1\/s3\/aws4_request/);
}

async function checkConfiguredFactory() {
  const storage = createAttachmentObjectStorage({
    mode: "local_fs",
    storageRoot: tempRoot,
    tokenSecret: "factory-check-secret",
  });
  assert.equal(storage.kind, "local_fs");

  const placeholder = createAttachmentObjectStorage({
    mode: "object_storage",
  });
  assert.equal(placeholder.kind, "object_storage");
  assert.equal(placeholder.configured, false);
  assert.throws(() => placeholder.putObject({}), /not configured yet/);
  assert.throws(() => placeholder.deleteObject({}), /not configured yet/);

  const objectStorage = createAttachmentObjectStorage({
    mode: "object_storage",
    endpoint: "https://storage.example.test",
    bucket: "erp-bucket",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "SECRETEXAMPLE",
    fetch: async () => ({ ok: true, status: 200, text: async () => "" }),
  });
  assert.equal(objectStorage.kind, "object_storage");
  assert.equal(resolveObjectStorageConfig({ endpoint: "", bucket: "bucket" }).configured, false);
}
