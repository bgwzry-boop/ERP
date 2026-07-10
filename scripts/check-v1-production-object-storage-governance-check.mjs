import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildProductionObjectStorageGovernanceCheck,
  formatProductionObjectStorageGovernanceCheck,
} from "./run-v1-production-object-storage-governance-check.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-object-storage-governance");
const envFilePath = join(storageRoot, "prod-object-storage-governance.env");
const runnerScript = join(process.cwd(), "scripts", "run-v1-production-object-storage-governance-check.mjs");
const sensitiveEndpoint = "https://oss-secret.example.com";
const sensitiveAttachmentBucket = "erp-v1-private-attachment-bucket";
const sensitiveStatementBucket = "erp-v1-private-statement-bucket";
const sensitiveAccessKey = "AKIA_OBJECT_STORAGE_GOVERNANCE_SECRET";
const sensitiveSecretKey = "SUPER_SECRET_OBJECT_STORAGE_GOVERNANCE_VALUE";
const sensitiveSessionToken = "SUPER_SECRET_GOVERNANCE_SESSION_TOKEN";

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

try {
  await checkBlockedEmptyEnv();
  await checkReadyFakeGovernance();
  await checkLifecycleBlockedAndPolicyWarning();
  await checkFailureRedaction();
  console.log(
    "V1 production object storage governance check passed: empty env block, fake S3 governance, lifecycle block, policy warning, CLI, and redaction are covered.",
  );
} finally {
  rmSync(storageRoot, { recursive: true, force: true });
}

async function checkBlockedEmptyEnv() {
  let fetchCalled = false;
  const report = await buildProductionObjectStorageGovernanceCheck({
    env: {},
    checkedAt: "2026-07-08T00:00:00.000Z",
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error("empty env should not call fetch");
    },
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.equal(fetchCalled, false);
  assert.ok(report.blockingCriteria.some((item) => item.key === "attachment-object-storage-governance-config"));
  assert.equal(report.safeguards.writesDiagnosticObjects, false);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionObjectStorageGovernanceCheck(report));
}

async function checkReadyFakeGovernance() {
  const fake = createFakeS3GovernanceServer({
    buckets: [sensitiveAttachmentBucket, sensitiveStatementBucket],
    policyStatusByBucket: new Map([[sensitiveStatementBucket, 404]]),
  });
  try {
    await listen(fake.server);
    const endpoint = `http://127.0.0.1:${fake.server.address().port}/s3-root`;
    const env = buildReadyEnv({ endpoint, includeStatementExport: true });
    const report = await buildProductionObjectStorageGovernanceCheck({
      env,
      checkedAt: "2026-07-08T01:02:03.000Z",
      now: new Date("2026-07-08T01:02:03.000Z"),
    });
    assert.equal(report.status, "ready");
    assert.equal(report.ready, true);
    assert.equal(report.summary.bucketTargetCount, 2);
    assert.equal(report.summary.warningCount, 1, "statement bucket policy 404 should be warning only");
    assert.equal(report.criteria.find((item) => item.key === "bucket-1-versioning-enabled")?.status, "passed");
    assert.equal(report.criteria.find((item) => item.key === "bucket-1-lifecycle-enabled")?.status, "passed");
    assert.equal(report.criteria.find((item) => item.key === "bucket-1-server-side-encryption")?.status, "passed");
    assert.equal(report.criteria.find((item) => item.key === "bucket-2-policy-readable")?.status, "warning");
    assert.ok(fake.requests.every((item) => item.signed), "bucket governance requests should be signed");
    assert.deepEqual(
      fake.requests.map((item) => item.subresource).sort(),
      ["encryption", "encryption", "lifecycle", "lifecycle", "policy", "policy", "versioning", "versioning"],
    );
    assertNoSensitiveOutput(JSON.stringify(report) + formatProductionObjectStorageGovernanceCheck(report));

    writeEnvFile(envFilePath, env);
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

async function checkLifecycleBlockedAndPolicyWarning() {
  const fake = createFakeS3GovernanceServer({
    buckets: [sensitiveAttachmentBucket],
    lifecycleEnabledByBucket: new Map([[sensitiveAttachmentBucket, false]]),
    policyStatusByBucket: new Map([[sensitiveAttachmentBucket, 403]]),
  });
  try {
    await listen(fake.server);
    const endpoint = `http://127.0.0.1:${fake.server.address().port}/s3-root`;
    const report = await buildProductionObjectStorageGovernanceCheck({
      env: buildReadyEnv({ endpoint, includeStatementExport: false }),
      checkedAt: "2026-07-08T02:00:00.000Z",
      now: new Date("2026-07-08T02:00:00.000Z"),
    });
    assert.equal(report.status, "blocked");
    assert.equal(report.ready, false);
    assert.equal(report.summary.bucketTargetCount, 1);
    assert.equal(report.criteria.find((item) => item.key === "bucket-1-lifecycle-enabled")?.status, "pending");
    assert.equal(report.criteria.find((item) => item.key === "bucket-1-policy-readable")?.status, "warning");
    assertNoSensitiveOutput(JSON.stringify(report) + formatProductionObjectStorageGovernanceCheck(report));
  } finally {
    await closeServer(fake.server);
  }
}

async function checkFailureRedaction() {
  const report = await buildProductionObjectStorageGovernanceCheck({
    env: buildReadyEnv({ endpoint: sensitiveEndpoint, includeStatementExport: true }),
    checkedAt: "2026-07-08T03:00:00.000Z",
    fetchImpl: async () => {
      throw new Error(`${sensitiveEndpoint}/${sensitiveAttachmentBucket} ${sensitiveAccessKey} ${sensitiveSecretKey}`);
    },
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  const output = JSON.stringify(report) + formatProductionObjectStorageGovernanceCheck(report);
  assertNoSensitiveOutput(output);
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

function createFakeS3GovernanceServer({
  buckets,
  lifecycleEnabledByBucket = new Map(),
  policyStatusByBucket = new Map(),
}) {
  const expectedBuckets = new Set(buckets);
  const requests = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const bucket = extractBucket({ pathname: url.pathname, expectedBuckets });
      if (!bucket) {
        sendText(response, 404, "bucket not found");
        return;
      }
      const method = String(request.method ?? "GET").toUpperCase();
      const subresource = firstKnownSubresource(url);
      const signed = Boolean(request.headers.authorization);
      requests.push({ method, bucket, subresource, signed });
      assert.equal(method, "GET");
      assert.equal(signed, true, "bucket governance request should be signed");

      if (subresource === "versioning") {
        sendXml(response, 200, "<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>");
        return;
      }
      if (subresource === "lifecycle") {
        const enabled = lifecycleEnabledByBucket.get(bucket) !== false;
        sendXml(
          response,
          200,
          enabled
            ? "<LifecycleConfiguration><Rule><ID>erp-v1-retention</ID><Status>Enabled</Status><AbortIncompleteMultipartUpload><DaysAfterInitiation>7</DaysAfterInitiation></AbortIncompleteMultipartUpload></Rule></LifecycleConfiguration>"
            : "<LifecycleConfiguration><Rule><ID>disabled</ID><Status>Disabled</Status></Rule></LifecycleConfiguration>",
        );
        return;
      }
      if (subresource === "encryption") {
        sendXml(
          response,
          200,
          "<ServerSideEncryptionConfiguration><Rule><ApplyServerSideEncryptionByDefault><SSEAlgorithm>AES256</SSEAlgorithm></ApplyServerSideEncryptionByDefault></Rule></ServerSideEncryptionConfiguration>",
        );
        return;
      }
      if (subresource === "policy") {
        const policyStatus = policyStatusByBucket.get(bucket) || 200;
        if (policyStatus !== 200) {
          sendText(response, policyStatus, "policy not readable");
          return;
        }
        sendText(response, 200, JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Deny", Principal: "*" }] }));
        return;
      }
      sendText(response, 404, "subresource not found");
    } catch (error) {
      sendText(response, 500, error?.message || "fake governance error");
    }
  });
  return { server, requests };
}

function firstKnownSubresource(url) {
  for (const key of ["versioning", "lifecycle", "encryption", "policy"]) {
    if (url.searchParams.has(key)) return key;
  }
  return "";
}

function extractBucket({ pathname, expectedBuckets }) {
  const parts = decodeURIComponent(String(pathname ?? ""))
    .split("/")
    .filter(Boolean);
  return parts.find((part) => expectedBuckets.has(part)) || "";
}

function sendXml(response, status, text) {
  response.writeHead(status, {
    "content-type": "application/xml",
    "content-length": Buffer.byteLength(text),
    connection: "close",
  });
  response.end(text);
}

function sendText(response, status, text) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
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

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function runNodeCli(args) {
  return new Promise((resolve, reject) => {
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
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
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
  assert.equal(/Version.*Statement.*Principal/.test(text), false, "raw bucket policy should not be printed");
}
