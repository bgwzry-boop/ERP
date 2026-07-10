import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildProductionObjectStoragePreflight,
  formatProductionObjectStoragePreflight,
  redactObjectStorageText,
} from "./run-v1-production-object-storage-preflight.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-object-storage-preflight");
const envFilePath = join(storageRoot, "prod-object-storage.env");
const runnerScript = join(process.cwd(), "scripts", "run-v1-production-object-storage-preflight.mjs");
const sensitiveEndpoint = "https://oss-secret.example.com";
const sensitiveAttachmentBucket = "erp-v1-private-attachment-bucket";
const sensitiveStatementBucket = "erp-v1-private-statement-bucket";
const sensitiveAccessKey = "AKIA_OBJECT_STORAGE_SECRET";
const sensitiveSecretKey = "SUPER_SECRET_OBJECT_STORAGE_VALUE";
const sensitiveSessionToken = "SUPER_SECRET_SESSION_TOKEN";
const sensitiveInvalidAttachmentPrefix = "https://bad-prefix.example.com/path";
const sensitiveInvalidStatementPrefix = "../secret-prefix";

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

try {
  await checkBlockedEmptyEnv();
  await checkInvalidKeyPrefixBlocksLiveProbe();
  await checkReadyFakeObjectStorage();
  await checkFailureRedaction();
  await checkCliBlockedAndRedaction();
  console.log(
    "V1 production object storage preflight check passed: blocked env, key-prefix guard, fake S3 live probes, fallback, CLI, cleanup, and redaction are covered.",
  );
} finally {
  rmSync(storageRoot, { recursive: true, force: true });
}

async function checkBlockedEmptyEnv() {
  let fetchCalled = false;
  const report = await buildProductionObjectStoragePreflight({
    env: {},
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error("empty env should not call fetch");
    },
    checkedAt: "2026-07-08T00:00:00.000Z",
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.equal(fetchCalled, false);
  assert.ok(report.blockingCriteria.some((item) => item.key === "attachment-object-storage-config"));
  assert.ok(report.blockingCriteria.some((item) => item.key === "statement-export-object-storage-config"));
  assert.equal(report.safeguards.endpointExposed, false);
  assert.equal(report.safeguards.signedUrlExposed, false);
  assertNoSensitiveOutput(JSON.stringify(report));
}

async function checkInvalidKeyPrefixBlocksLiveProbe() {
  let fetchCalled = false;
  const invalidEnv = buildReadyEnv({ endpoint: sensitiveEndpoint, includeStatementExport: true });
  invalidEnv.ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX = sensitiveInvalidAttachmentPrefix;
  invalidEnv.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX = sensitiveInvalidStatementPrefix;
  const report = await buildProductionObjectStoragePreflight({
    env: invalidEnv,
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error("invalid key prefix should block before object storage requests");
    },
    checkedAt: "2026-07-08T00:30:00.000Z",
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.equal(fetchCalled, false);
  assert.equal(report.safeguards.objectStorageKeyPrefixExposed, false);

  const attachmentConfig = report.criteria.find((item) => item.key === "attachment-object-storage-config");
  assert.equal(attachmentConfig?.status, "pending");
  assert.equal(attachmentConfig?.evidence.keyPrefixConfigured, true);
  assert.equal(attachmentConfig?.evidence.keyPrefixValid, false);
  assert.match(attachmentConfig?.nextAction ?? "", /ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX/);

  const statementConfig = report.criteria.find((item) => item.key === "statement-export-object-storage-config");
  assert.equal(statementConfig?.status, "pending");
  assert.equal(statementConfig?.evidence.explicitKeyPrefixConfigured, true);
  assert.equal(statementConfig?.evidence.keyPrefixValid, false);
  assert.match(statementConfig?.nextAction ?? "", /ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX/);

  assert.equal(report.criteria.find((item) => item.key === "attachment-object-storage-live-probe")?.evidence.skipped, true);
  assert.equal(report.criteria.find((item) => item.key === "attachment-object-storage-signed-url-probe")?.evidence.skipped, true);
  assert.equal(report.criteria.find((item) => item.key === "statement-export-object-storage-live-probe")?.evidence.skipped, true);
  const serialized = JSON.stringify(report) + formatProductionObjectStoragePreflight(report);
  assertNoSensitiveOutput(serialized);
}

async function checkReadyFakeObjectStorage() {
  const fake = createFakeS3CompatibleServer({
    buckets: [sensitiveAttachmentBucket, sensitiveStatementBucket],
  });
  try {
    await listen(fake.server);
    const endpoint = `http://127.0.0.1:${fake.server.address().port}/s3-root`;
    const explicitEnv = buildReadyEnv({ endpoint, includeStatementExport: true });
    const explicitReport = await buildProductionObjectStoragePreflight({
      env: explicitEnv,
      checkedAt: "2026-07-08T01:02:03.000Z",
      now: new Date("2026-07-08T01:02:03.000Z"),
      signedUrlTtlSeconds: 90,
    });
    assert.equal(explicitReport.status, "ready");
    assert.equal(explicitReport.ready, true);
    assert.equal(explicitReport.summary.blockingCount, 0);
    assert.equal(explicitReport.criteria.find((item) => item.key === "attachment-object-storage-live-probe")?.status, "passed");
    assert.equal(explicitReport.criteria.find((item) => item.key === "attachment-object-storage-signed-url-probe")?.status, "passed");
    assert.equal(explicitReport.criteria.find((item) => item.key === "statement-export-object-storage-live-probe")?.status, "passed");
    assert.equal(explicitReport.criteria.some((item) => item.key.endsWith("-bucket-governance")), false);
    assert.equal(explicitReport.safeguards.readsBucketGovernance, false);
    assert.equal(
      explicitReport.criteria.find((item) => item.key === "statement-export-object-storage-live-probe")?.evidence.usesAttachmentFallback,
      false,
    );
    assert.equal(fake.objects.size, 0, "all diagnostic objects should be cleaned up after explicit config probe");
    assert.deepEqual(
      fake.requests.map((item) => item.method),
      ["PUT", "GET", "GET", "DELETE", "PUT", "GET", "DELETE"],
    );
    assert.ok(fake.requests.every((item) => item.signed === true), "all object storage requests should be signed");
    assertNoSensitiveOutput(JSON.stringify(explicitReport) + formatProductionObjectStoragePreflight(explicitReport));

    fake.requests.length = 0;
    const fallbackReport = await buildProductionObjectStoragePreflight({
      env: buildReadyEnv({ endpoint, includeStatementExport: false }),
      checkedAt: "2026-07-08T01:03:03.000Z",
      now: new Date("2026-07-08T01:03:03.000Z"),
    });
    assert.equal(fallbackReport.status, "ready");
    assert.equal(fallbackReport.ready, true);
    assert.equal(fallbackReport.criteria.find((item) => item.key === "statement-export-object-storage-config")?.evidence.usesAttachmentFallback, true);
    assert.equal(
      fallbackReport.criteria.find((item) => item.key === "statement-export-object-storage-live-probe")?.evidence.usesAttachmentFallback,
      true,
    );
    assert.equal(fallbackReport.criteria.some((item) => item.key.endsWith("-bucket-governance")), false);
    assert.equal(fake.objects.size, 0, "all diagnostic objects should be cleaned up after fallback probe");
    assertNoSensitiveOutput(JSON.stringify(fallbackReport) + formatProductionObjectStoragePreflight(fallbackReport));

    writeEnvFile(envFilePath, explicitEnv);
    chmodSync(envFilePath, 0o600);
    const cliRun = await runNodeCli([runnerScript, "--env-file", envFilePath, "--json"]);
    assert.equal(cliRun.status, 0, cliRun.stderr || cliRun.stdout);
    const cliReport = JSON.parse(cliRun.stdout);
    assert.equal(cliReport.status, "ready");
    assert.equal(cliReport.ready, true);
    assertNoSensitiveOutput(cliRun.stdout + cliRun.stderr);
  } finally {
    await closeServer(fake.server);
  }
}

async function checkFailureRedaction() {
  const failingEnv = buildReadyEnv({ endpoint: sensitiveEndpoint, includeStatementExport: true });
  const report = await buildProductionObjectStoragePreflight({
    env: failingEnv,
    fetchImpl: async () => {
      throw new Error(
        `failed to reach ${sensitiveEndpoint}/${sensitiveAttachmentBucket}/diag with ${sensitiveAccessKey} and ${sensitiveSecretKey}`,
      );
    },
    checkedAt: "2026-07-08T02:00:00.000Z",
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  const serialized = JSON.stringify(report) + formatProductionObjectStoragePreflight(report);
  assert.match(serialized, /\[redacted\]|\[redacted-url\]/);
  assertNoSensitiveOutput(serialized);
}

async function checkCliBlockedAndRedaction() {
  const blockedRun = await runNodeCli([runnerScript, "--json"]);
  assert.equal(blockedRun.status, 2, blockedRun.stderr || blockedRun.stdout);
  const report = JSON.parse(blockedRun.stdout);
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assertNoSensitiveOutput(blockedRun.stdout + blockedRun.stderr);

  const redacted = redactObjectStorageText(
    `GET ${sensitiveEndpoint}/${sensitiveAttachmentBucket}/key?X-Amz-Credential=${sensitiveAccessKey}&X-Amz-Signature=abcdef ${sensitiveSecretKey}`,
    [sensitiveEndpoint, sensitiveAttachmentBucket, sensitiveAccessKey, sensitiveSecretKey],
  );
  assertNoSensitiveOutput(redacted);
  assert.match(redacted, /\[redacted-url\]|\[redacted\]/);
}

function buildReadyEnv({ endpoint, includeStatementExport }) {
  const env = {
    ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER: "s3_compatible",
    ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT: endpoint,
    ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET: sensitiveAttachmentBucket,
    ERP_ATTACHMENT_OBJECT_STORAGE_REGION: "cn-v1",
    ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID: sensitiveAccessKey,
    ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY: sensitiveSecretKey,
    ERP_ATTACHMENT_OBJECT_STORAGE_SESSION_TOKEN: sensitiveSessionToken,
    ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX: "erp-v1/attachments",
    ERP_ATTACHMENT_OBJECT_STORAGE_FORCE_PATH_STYLE: "true",
  };
  if (includeStatementExport) {
    Object.assign(env, {
      ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT: endpoint,
      ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET: sensitiveStatementBucket,
      ERP_STATEMENT_EXPORT_OBJECT_STORAGE_REGION: "cn-v1",
      ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID: sensitiveAccessKey,
      ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY: sensitiveSecretKey,
      ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SESSION_TOKEN: sensitiveSessionToken,
      ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX: "erp-v1/statement-exports",
      ERP_STATEMENT_EXPORT_OBJECT_STORAGE_FORCE_PATH_STYLE: "true",
    });
  }
  return env;
}

function writeEnvFile(filePath, env) {
  const lines = Object.entries(env).map(([key, value]) => `${key}=${quoteEnvValue(value)}`);
  writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function quoteEnvValue(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function createFakeS3CompatibleServer({ buckets }) {
  const expectedBuckets = new Set(buckets);
  const objects = new Map();
  const requests = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const target = extractBucketAndKey({ pathname: url.pathname, expectedBuckets });
      if (!target) {
        sendText(response, 404, "bucket or object key not found");
        return;
      }
      const method = String(request.method ?? "GET").toUpperCase();
      const signed = Boolean(request.headers.authorization || url.searchParams.get("X-Amz-Signature"));
      requests.push({
        method,
        bucket: target.bucket,
        key: target.key,
        signed,
        hasAmzDate: Boolean(request.headers["x-amz-date"] || url.searchParams.get("X-Amz-Date")),
      });
      assert.equal(signed, true, `${method} should be signed`);

      const objectMapKey = `${target.bucket}/${target.key}`;
      if (method === "GET" && !target.key && url.searchParams.has("versioning")) {
        sendXml(
          response,
          200,
          '<?xml version="1.0" encoding="UTF-8"?><VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>',
        );
        return;
      }
      if (method === "GET" && !target.key && url.searchParams.has("lifecycle")) {
        sendXml(
          response,
          200,
          '<?xml version="1.0" encoding="UTF-8"?><LifecycleConfiguration><Rule><ID>erp-v1-retention</ID><Status>Enabled</Status></Rule></LifecycleConfiguration>',
        );
        return;
      }
      if (method === "PUT") {
        const body = await readBody(request);
        objects.set(objectMapKey, {
          buffer: body,
          contentType: String(request.headers["content-type"] ?? "application/octet-stream"),
        });
        sendText(response, 200, "");
        return;
      }
      if (method === "GET") {
        const object = objects.get(objectMapKey);
        if (!object) {
          sendText(response, 404, "object not found");
          return;
        }
        response.writeHead(200, {
          "content-type": object.contentType,
          "content-length": String(object.buffer.length),
          connection: "close",
        });
        response.end(object.buffer);
        return;
      }
      if (method === "DELETE") {
        const existed = objects.delete(objectMapKey);
        sendText(response, existed ? 204 : 404, "");
        return;
      }
      sendText(response, 405, "method not allowed");
    } catch (error) {
      sendText(response, 500, error?.message || "fake object storage error");
    }
  });
  return { server, objects, requests };
}

function extractBucketAndKey({ pathname, expectedBuckets }) {
  const parts = decodeURIComponent(String(pathname ?? ""))
    .split("/")
    .filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    if (!expectedBuckets.has(parts[index])) continue;
    const key = parts.slice(index + 1).join("/");
    return { bucket: parts[index], key };
  }
  return null;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function sendText(response, status, text) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    connection: "close",
  });
  response.end(text);
}

function sendXml(response, status, text) {
  response.writeHead(status, {
    "content-type": "application/xml; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    connection: "close",
  });
  response.end(text);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function runNodeCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function assertNoSensitiveOutput(text) {
  assert.equal(text.includes(sensitiveEndpoint), false);
  assert.equal(text.includes("oss-secret.example.com"), false);
  assert.equal(text.includes(sensitiveAttachmentBucket), false);
  assert.equal(text.includes(sensitiveStatementBucket), false);
  assert.equal(text.includes(sensitiveAccessKey), false);
  assert.equal(text.includes(sensitiveSecretKey), false);
  assert.equal(text.includes(sensitiveSessionToken), false);
  assert.equal(text.includes(sensitiveInvalidAttachmentPrefix), false);
  assert.equal(text.includes("bad-prefix.example.com"), false);
  assert.equal(text.includes(sensitiveInvalidStatementPrefix), false);
  assert.equal(text.includes("secret-prefix"), false);
  assert.equal(text.includes(`X-Amz-Credential=${sensitiveAccessKey}`), false);
  assert.equal(text.includes("X-Amz-Signature=abcdef"), false);
}
