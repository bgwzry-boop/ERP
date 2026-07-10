import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildProductionPersistenceEvidence,
  formatProductionPersistenceEvidence,
  parseArgs,
  redactPersistenceEvidenceText,
  writeProductionPersistenceEvidenceArtifacts,
} from "./run-v1-production-persistence-evidence.mjs";
import { loadMigrationFiles, requiredTableColumns, requiredTables } from "./dbMigrationUtils.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-persistence-evidence");
const envFilePath = join(storageRoot, "prod-persistence.env");
const outputDir = join(storageRoot, "evidence");
const setupJsonPath = join(storageRoot, "production-env-setup.json");
const runnerScript = join(process.cwd(), "scripts", "run-v1-production-persistence-evidence.mjs");
const migrations = loadMigrationFiles();
const sensitiveDatabaseUrl = "postgres://erp_user:SUPER_SECRET_PASSWORD@prod-db.internal:5432/erp";
const sensitiveRestoreDatabaseUrl = "postgres://restore_user:RESTORE_SECRET@restore-db.internal:5432/erp_restore";
const sensitiveEndpoint = "https://oss-secret.example.com";
const sensitiveAttachmentBucket = "erp-v1-private-attachment-bucket";
const sensitiveAccessKey = "AKIA_OBJECT_STORAGE_SECRET";
const sensitiveSecretKey = "SUPER_SECRET_OBJECT_STORAGE_VALUE";

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

try {
  await checkBlockedWithoutEnvFile();
  await checkSetupEnvFileResolution();
  await checkHelpTextPrefersSetupEnv();
  await checkReadyPersistenceEvidence();
  await checkFailureRedaction();
  console.log(
    "V1 production persistence evidence check passed: env-file gate, persistence env subset, migration plan, fake PostgreSQL, backup/restore validation, fake object storage, artifacts, CLI, and redaction are covered.",
  );
} finally {
  rmSync(storageRoot, { recursive: true, force: true });
}

async function checkHelpTextPrefersSetupEnv() {
  const help = await runNodeCli([runnerScript, "--help"], { env: { PATH: process.env.PATH || "" } });
  assert.equal(help.status, 0, help.stderr || help.stdout);
  assert.match(
    help.stdout,
    /Usage: node -- scripts\/run-v1-production-persistence-evidence\.mjs --use-production-env-setup-env-file/,
  );
  assert.match(help.stdout, /--env-file <path>[\s\S]+Use only when bypassing setup/);
  assert.doesNotMatch(help.stdout.split("\n")[0], /--env-file <secure-env-file>/);
  assertNoSensitiveOutput(help.stdout + help.stderr);
}

async function checkBlockedWithoutEnvFile() {
  const report = await buildProductionPersistenceEvidence({
    envFiles: [],
    baseEnv: {},
    checkedAt: "2026-07-08T00:00:00.000Z",
    commandRunner: fakePsqlRunner(),
    fetchImpl: async () => {
      throw new Error("missing object storage config should not call fetch");
    },
  });
    assert.equal(report.status, "blocked");
    assert.equal(report.ready, false);
    assert.equal(report.stages.find((item) => item.key === "production-env-file-audit")?.status, "blocked");
    assert.equal(report.safeguards.migrationApplyExecuted, false);
    assert.equal(report.safeguards.objectStorageKeyPrefixExposed, false);
    assert.match(formatProductionPersistenceEvidence(report), /Object-storage key prefix exposed: no/);
    assertNoSensitiveOutput(JSON.stringify(report) + formatProductionPersistenceEvidence(report));

  const cli = await runNodeCli([runnerScript, "--json", "--no-write"], { env: { PATH: process.env.PATH || "" } });
  assert.equal(cli.status, 2, cli.stderr || cli.stdout);
  const cliReport = JSON.parse(cli.stdout);
  assert.equal(cliReport.status, "blocked");
  assert.equal(cliReport.ready, false);
  assertNoSensitiveOutput(cli.stdout + cli.stderr);
}

async function checkSetupEnvFileResolution() {
  writeEnvFile(envFilePath, buildReadyEnv({ endpoint: "http://127.0.0.1:65530/s3-root" }));
  chmodSync(envFilePath, 0o600);
  writeFileSync(
    setupJsonPath,
    `${JSON.stringify(
      {
        scope: "v1_production_env_setup",
        setupReady: true,
        checkedAt: new Date(Date.now() + 60_000).toISOString(),
        envFile: {
          path: envFilePath,
          gitIgnored: true,
          gitTracked: false,
          fileMode: "600",
        },
      },
      null,
      2,
    )}\n`,
  );

  const parsed = parseArgs([
    "--use-production-env-setup-env-file",
    "--production-env-setup-json",
    setupJsonPath,
    "--json",
    "--no-write",
  ]);
  assert.deepEqual(parsed.envFiles, [envFilePath]);
  assert.equal(parsed.envFileSource, "production_env_setup");
  assert.equal(parsed.envFileFromProductionSetup, true);
  assert.match(parsed.envFileSourceSummary, /setup/);

  writeFileSync(
    setupJsonPath,
    `${JSON.stringify(
      {
        scope: "v1_production_env_setup",
        setupReady: true,
        checkedAt: "2000-01-01T00:00:00.000Z",
        envFile: {
          path: envFilePath,
          gitIgnored: true,
          gitTracked: false,
          fileMode: "600",
        },
      },
      null,
      2,
    )}\n`,
  );
  assert.throws(
    () =>
      parseArgs([
        "--use-production-env-setup-env-file",
        "--production-env-setup-json",
        setupJsonPath,
        "--json",
        "--no-write",
      ]),
    /setup report is stale/,
  );
  writeFileSync(
    setupJsonPath,
    `${JSON.stringify(
      {
        scope: "v1_production_env_setup",
        setupReady: true,
        checkedAt: new Date(Date.now() + 60_000).toISOString(),
        envFile: {
          path: envFilePath,
          gitIgnored: true,
          gitTracked: false,
          fileMode: "600",
        },
      },
      null,
      2,
    )}\n`,
  );

  const report = await buildProductionPersistenceEvidence({
    envFiles: parsed.envFiles,
    envFileSource: parsed.envFileSource,
    envFileSourceSummary: parsed.envFileSourceSummary,
    envFileFromProductionSetup: parsed.envFileFromProductionSetup,
    baseEnv: {},
    checkedAt: "2026-07-08T00:30:00.000Z",
    commandRunner: fakePsqlRunner(),
    fetchImpl: async () => {
      throw new Error("fake object storage endpoint is intentionally unavailable in setup-resolution check");
    },
  });
  assert.equal(report.envFileSource, "production_env_setup");
  assert.equal(report.envFileFromProductionSetup, true);
  assert.equal(report.summary.envFileFromProductionSetup, true);
  assert.equal(report.safeguards.envFileReadFromProductionSetup, true);
  assert.equal(report.safeguards.envFilePathAcceptedFromRequest, false);
  assert.equal(report.safeguards.envFilePathExposed, false);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionPersistenceEvidence(report));
}

async function checkReadyPersistenceEvidence() {
  const fake = createFakeS3CompatibleServer({ buckets: [sensitiveAttachmentBucket] });
  try {
    await listen(fake.server);
    const endpoint = `http://127.0.0.1:${fake.server.address().port}/s3-root`;
    writeEnvFile(envFilePath, buildReadyEnv({ endpoint }));
    chmodSync(envFilePath, 0o600);

    const report = await buildProductionPersistenceEvidence({
      envFiles: [envFilePath],
      allowRestoreReset: true,
      baseEnv: {},
      checkedAt: "2026-07-08T01:02:03.000Z",
      now: new Date("2026-07-08T01:02:03.000Z"),
      commandRunner: fakePsqlRunner(),
      signedUrlTtlSeconds: 90,
    });
    assert.equal(report.status, "ready");
    assert.equal(report.ready, true);
    assert.equal(report.summary.passedCount, report.summary.totalCount);
    assert.equal(report.stages.find((item) => item.key === "production-persistence-env-subset")?.status, "passed");
    assert.ok(
      report.stages.find((item) => item.key === "production-persistence-env-subset")?.evidence.fullEnvBlockingCount > 0,
      "full V1 env can still show later print/CUPS blockers while persistence subset is ready",
    );
    assert.equal(report.stages.find((item) => item.key === "db-migration-plan")?.evidence.migrationApplyExecuted, false);
    assert.equal(report.stages.find((item) => item.key === "production-postgres-preflight")?.status, "passed");
    assert.equal(report.stages.find((item) => item.key === "production-postgres-backup-restore-check")?.status, "passed");
    assert.equal(report.stages.find((item) => item.key === "production-object-storage-preflight")?.status, "passed");
    assert.equal(report.stages.find((item) => item.key === "production-object-storage-preflight")?.evidence.keyPrefixExposed, false);
    assert.equal(report.stages.find((item) => item.key === "production-object-storage-governance-check")?.status, "passed");
    assert.equal(report.summary.objectStorageGovernanceReady, true);
    assert.equal(report.safeguards.postgresBackupRestoreSourceDatabaseMutated, false);
    assert.equal(report.safeguards.postgresBackupRestoreRestoreDatabaseMutated, true);
    assert.equal(report.safeguards.postgresBackupRestoreResetExplicitlyAllowed, true);
    assert.equal(report.safeguards.postgresBackupRestoreDumpFilesRemoved, true);
    assert.equal(report.safeguards.objectStorageGovernanceWritesObjects, false);
    assert.equal(report.safeguards.objectStorageGovernanceReadsBucketMetadata, true);
    assert.equal(report.safeguards.objectStorageKeyPrefixExposed, false);
    assert.match(formatProductionPersistenceEvidence(report), /Object-storage key prefix exposed: no/);
    assert.equal(fake.objects.size, 0, "diagnostic object storage probes should be cleaned up");
    assertNoSensitiveOutput(JSON.stringify(report) + formatProductionPersistenceEvidence(report));

    const artifacts = writeProductionPersistenceEvidenceArtifacts(report, { outputDir });
    assert.equal(existsSync(artifacts.latestJsonPath), true);
    assert.equal(existsSync(artifacts.latestMarkdownPath), true);
    assertNoSensitiveOutput(formatProductionPersistenceEvidence({ ...report, artifacts }));
  } finally {
    await closeServer(fake.server);
  }
}

async function checkFailureRedaction() {
  const report = await buildProductionPersistenceEvidence({
    envFiles: [],
    baseEnv: {
      ERP_V1_DATABASE_URL: sensitiveDatabaseUrl,
      ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT: sensitiveEndpoint,
      ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET: sensitiveAttachmentBucket,
      ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID: sensitiveAccessKey,
      ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY: sensitiveSecretKey,
    },
    checkedAt: "2026-07-08T02:00:00.000Z",
    commandRunner: fakePsqlRunner({ connectionFails: true }),
    fetchImpl: async () => {
      throw new Error(`${sensitiveEndpoint}/${sensitiveAttachmentBucket} ${sensitiveAccessKey} ${sensitiveSecretKey}`);
    },
  });
  assert.equal(report.status, "blocked");
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionPersistenceEvidence(report));
  const redacted = redactPersistenceEvidenceText(
    `${sensitiveDatabaseUrl} ${sensitiveEndpoint}/${sensitiveAttachmentBucket} ${sensitiveAccessKey} ${sensitiveSecretKey}`,
  );
  assertNoSensitiveOutput(redacted);
}

function buildReadyEnv({ endpoint }) {
  return {
    ERP_V1_PERSISTENCE_PROFILE: "postgres",
    ERP_V1_FILE_STORAGE_PROFILE: "object_storage",
    ERP_V1_DATABASE_URL: sensitiveDatabaseUrl,
    ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL: sensitiveRestoreDatabaseUrl,
    ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED: "false",
    ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER: "s3_compatible",
    ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT: endpoint,
    ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET: sensitiveAttachmentBucket,
    ERP_ATTACHMENT_OBJECT_STORAGE_REGION: "cn-v1",
    ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID: sensitiveAccessKey,
    ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY: sensitiveSecretKey,
    ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX: "erp-v1/attachments",
    ERP_ATTACHMENT_OBJECT_STORAGE_FORCE_PATH_STYLE: "true",
  };
}

function writeEnvFile(filePath, env) {
  const lines = Object.entries(env).map(([key, value]) => `${key}=${quoteEnvValue(value)}`);
  writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function quoteEnvValue(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function fakePsqlRunner(options = {}) {
  return (command, args = []) => {
    if (args.includes("--version")) return { status: 0, stdout: "psql (PostgreSQL) 16.0\n", stderr: "" };
    if (command.includes("pg_dump")) {
      const filePath = valueAfter(args, "--file");
      mkdirSync(dirname(filePath), { recursive: true });
      if (args.includes("--schema-only")) {
        writeFileSync(filePath, `CREATE TABLE schema_migrations (id text, checksum text);\n-- restored ${requiredTables.length} tables\n`);
        return { status: 0, stdout: "", stderr: "" };
      }
      if (args.includes("--data-only")) {
        writeFileSync(filePath, "INSERT INTO schema_migrations (id, checksum) VALUES ('001', 'abc');\n");
        return { status: 0, stdout: "", stderr: "" };
      }
      return { status: 1, stdout: "", stderr: `unexpected pg_dump args for ${sensitiveDatabaseUrl}` };
    }
    if (args.includes("--file")) return { status: 0, stdout: "", stderr: "" };
    const sql = args[args.length - 1] || "";
    if (options.connectionFails && /current_database\(\)/.test(sql)) {
      return {
        status: 2,
        stdout: "",
        stderr: `psql: error: connection to server at "prod-db.internal" failed for ${sensitiveDatabaseUrl}`,
      };
    }
    if (/current_database\(\)/.test(sql)) return { status: 0, stdout: "t|t|t\n", stderr: "" };
    if (/COUNT\(\*\) FROM schema_migrations/.test(sql)) return { status: 0, stdout: "1\n", stderr: "" };
    if (/FROM schema_migrations/.test(sql)) {
      return {
        status: 0,
        stdout: migrations.map((migration) => `${migration.id}|${migration.checksum}`).join("\n"),
        stderr: "",
      };
    }
    if (/information_schema\.tables/.test(sql)) {
      return { status: 0, stdout: `${requiredTables.slice().sort().join("\n")}\n`, stderr: "" };
    }
    if (/information_schema\.columns/.test(sql)) {
      const rows = [];
      for (const [table, columns] of Object.entries(requiredTableColumns)) {
        for (const column of columns) rows.push(`${table}|${column}`);
      }
      return { status: 0, stdout: `${rows.join("\n")}\n`, stderr: "" };
    }
    if (/has_table_privilege/.test(sql)) {
      const tables = [
        "attachments",
        "customers",
        "fulfillment_records",
        "inventory_items",
        "operation_logs",
        "order_lines",
        "original_orders",
        "statements",
        "users",
      ];
      return {
        status: 0,
        stdout: `${tables.map((table) => `${table}|t|t|t`).join("\n")}\n`,
        stderr: "",
      };
    }
    if (/erp_v1_preflight_probe/.test(sql)) return { status: 0, stdout: "t\n", stderr: "" };
    if (/DROP SCHEMA IF EXISTS public/.test(sql)) return { status: 0, stdout: "", stderr: "" };
    return { status: 1, stdout: "", stderr: `unexpected SQL for ${command}` };
  };
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function createFakeS3CompatibleServer({ buckets }) {
  const expectedBuckets = new Set(buckets);
  const objects = new Map();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const target = extractBucketAndKey({ pathname: url.pathname, expectedBuckets });
      if (!target) {
        sendText(response, 404, "bucket or object key not found");
        return;
      }
      const method = String(request.method ?? "GET").toUpperCase();
      assert.ok(request.headers.authorization || url.searchParams.get("X-Amz-Signature"), `${method} should be signed`);
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
      if (method === "GET" && !target.key && url.searchParams.has("encryption")) {
        sendXml(
          response,
          200,
          '<?xml version="1.0" encoding="UTF-8"?><ServerSideEncryptionConfiguration><Rule><ApplyServerSideEncryptionByDefault><SSEAlgorithm>AES256</SSEAlgorithm></ApplyServerSideEncryptionByDefault></Rule></ServerSideEncryptionConfiguration>',
        );
        return;
      }
      if (method === "GET" && !target.key && url.searchParams.has("policy")) {
        sendText(response, 403, "policy not readable");
        return;
      }
      if (method === "PUT") {
        objects.set(objectMapKey, await readBody(request));
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
          "content-type": "application/octet-stream",
          "content-length": String(object.length),
          connection: "close",
        });
        response.end(object);
        return;
      }
      if (method === "DELETE") {
        const existed = objects.delete(objectMapKey);
        sendText(response, existed ? 204 : 404, "");
        return;
      }
      sendText(response, 405, "method not allowed");
    } catch (error) {
      sendText(response, 500, String(error?.message || error));
    }
  });
  return { server, objects };
}

function extractBucketAndKey({ pathname, expectedBuckets }) {
  const parts = pathname.split("/").filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    const candidate = decodeURIComponent(parts[index]);
    if (expectedBuckets.has(candidate)) {
      return {
        bucket: candidate,
        key: parts.slice(index + 1).map(decodeURIComponent).join("/"),
      };
    }
  }
  return null;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function sendText(response, status, text) {
  const body = Buffer.from(text);
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": String(body.length),
    connection: "close",
  });
  response.end(body);
}

function sendXml(response, status, text) {
  const body = Buffer.from(text);
  response.writeHead(status, {
    "content-type": "application/xml; charset=utf-8",
    "content-length": String(body.length),
    connection: "close",
  });
  response.end(body);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function runNodeCli(args, { env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function assertNoSensitiveOutput(text) {
  assert.doesNotMatch(
    String(text),
    /SUPER_SECRET_PASSWORD|RESTORE_SECRET|prod-db\.internal|restore-db\.internal|postgres:\/\/erp_user|postgres:\/\/restore_user|oss-secret\.example\.com|erp-v1-private-attachment-bucket|AKIA_OBJECT_STORAGE_SECRET|SUPER_SECRET_OBJECT_STORAGE_VALUE/i,
  );
}
