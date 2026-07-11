import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import {
  buildProductionRuntimeSmoke,
  formatProductionRuntimeSmoke,
  parseArgs,
  redactRuntimeSmokeText,
  resolveProductionRuntimeSmokeEnvFiles,
  writeProductionRuntimeSmokeArtifacts,
} from "./run-v1-production-runtime-smoke.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-runtime-smoke");
const envFilePath = join(storageRoot, "prod-runtime.env");
const setupJsonPath = join(storageRoot, "production-env-setup.json");
const fakeApiPath = join(storageRoot, "fake-runtime-api.mjs");
const outputDir = join(storageRoot, "evidence");
const runnerScript = join(process.cwd(), "scripts", "run-v1-production-runtime-smoke.mjs");
const sensitiveDatabaseUrl = "postgres://erp_user:SUPER_SECRET_RUNTIME_PASSWORD@prod-db.internal:5432/erp";
const sensitiveEndpoint = "https://oss-runtime-secret.example.com";
const sensitiveBucket = "erp-v1-runtime-private-bucket";
const sensitiveAccessKey = "AKIA_RUNTIME_SECRET";
const sensitiveSecretKey = "SUPER_SECRET_RUNTIME_OBJECT_STORAGE_VALUE";
const sensitiveReadinessLoginName = "v1.runtime.smoke.operator";
const sensitiveReadinessPassword = "SUPER_SECRET_RUNTIME_LOGIN_PASSWORD";
const fakeRuntimeToken = "erp-runtime-session-v1.fake-runtime-smoke-token";

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

try {
  writeFakeApi();
  await checkBlockedWithoutEnvFile();
  await checkReadyRuntimeSmoke();
  await checkSetupEnvFileResolution();
  await checkReadyExternalApiRuntimeSmoke();
  await checkBlockedLocalRuntimeProfile();
  await checkCliAndRedaction();
  console.log(
    "V1 production runtime smoke check passed: env-file gate, secure-env API startup, external API probe, production profile, blocked local runtime, artifacts, CLI, termination, and redaction are covered.",
  );
} finally {
  rmSync(storageRoot, { recursive: true, force: true });
}

async function checkBlockedWithoutEnvFile() {
  const report = await buildProductionRuntimeSmoke({
    envFiles: [],
    baseEnv: buildBaseEnv({ fakeMode: "ready" }),
    apiCommand: process.execPath,
    apiArgs: [fakeApiPath],
    checkedAt: "2026-07-08T03:00:00.000Z",
    timeoutMs: 5000,
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.equal(report.stages.find((item) => item.key === "production-env-file-audit")?.status, "blocked");
  assert.equal(report.stages.find((item) => item.key === "api-runtime-startup")?.status, "passed");
  assert.equal(report.safeguards.apiProcessTerminated, true);
  assert.equal(report.safeguards.formalRuntimeAuthentication, true);
  assert.equal(report.safeguards.legacyIdentityHeaderUsed, false);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionRuntimeSmoke(report));
}

async function checkReadyRuntimeSmoke() {
  writeEnvFile(envFilePath, buildReadyEnv());
  chmodSync(envFilePath, 0o600);
  const report = await buildProductionRuntimeSmoke({
    envFiles: [envFilePath],
    baseEnv: buildBaseEnv({ fakeMode: "ready" }),
    apiCommand: process.execPath,
    apiArgs: [fakeApiPath],
    checkedAt: "2026-07-08T03:30:00.000Z",
    timeoutMs: 5000,
  });
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.envFileSource, "cli");
  assert.equal(report.envFileFromProductionSetup, false);
  assert.equal(report.summary.envFileSource, "cli");
  assert.equal(report.summary.passedCount, report.summary.totalCount);
  assert.equal(report.stages.find((item) => item.key === "production-persistence-env-subset")?.status, "passed");
  assert.equal(report.stages.find((item) => item.key === "api-runtime-startup")?.status, "passed");
  assert.equal(report.stages.find((item) => item.key === "runtime-production-profile")?.status, "passed");
  assert.equal(report.stages.find((item) => item.key === "runtime-production-profile")?.summary.label, "7/7 通过");
  assert.equal(report.runtime.productionEnvFileApplication.applied, true);
  assert.equal(report.safeguards.productionEnvAppliedToProcess, true);
  assert.equal(report.safeguards.formalLoginPerformed, true);
  assert.equal(report.safeguards.readOnlyHttpProbesOnly, false);
  assert.equal(report.safeguards.businessReadOnly, true);
  assert.equal(report.safeguards.businessDataMutated, false);
  assert.equal(report.runtime.repositoryProfile.repositoryProfile, "postgres");
  assert.equal(report.runtime.storageProfile.attachmentObjectStorageKind, "object_storage");
  assert.equal(report.runtime.storageProfile.statementExportObjectStorageKind, "object_storage");
  assert.equal(report.safeguards.apiProcessTerminated, true);
  assert.equal(report.safeguards.commandValueExposed, false);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionRuntimeSmoke(report));

  const artifacts = writeProductionRuntimeSmokeArtifacts(report, { outputDir });
  assert.equal(existsSync(artifacts.latestJsonPath), true);
  assert.equal(existsSync(artifacts.latestMarkdownPath), true);
  assertNoSensitiveOutput(readFileSync(artifacts.latestJsonPath, "utf8"));
  assertNoSensitiveOutput(readFileSync(artifacts.latestMarkdownPath, "utf8"));
}

async function checkSetupEnvFileResolution() {
  writeEnvFile(envFilePath, buildReadyEnv());
  chmodSync(envFilePath, 0o600);
  writeFileSync(
    setupJsonPath,
    `${JSON.stringify(
      {
        scope: "v1_production_env_setup",
        status: "prepared",
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

  const resolution = resolveProductionRuntimeSmokeEnvFiles({
    useProductionEnvSetupEnvFile: true,
    productionEnvSetupJsonPath: setupJsonPath,
  });
  assert.equal(resolution.source, "production_env_setup");
  assert.equal(resolution.usedProductionEnvSetup, true);
  assert.deepEqual(resolution.envFiles, [envFilePath]);

  writeFileSync(
    setupJsonPath,
    `${JSON.stringify(
      {
        scope: "v1_production_env_setup",
        status: "prepared",
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
      resolveProductionRuntimeSmokeEnvFiles({
        useProductionEnvSetupEnvFile: true,
        productionEnvSetupJsonPath: setupJsonPath,
      }),
    /setup report is stale/,
  );
  writeFileSync(
    setupJsonPath,
    `${JSON.stringify(
      {
        scope: "v1_production_env_setup",
        status: "prepared",
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

  const explicitResolution = resolveProductionRuntimeSmokeEnvFiles({
    envFiles: [envFilePath],
    useProductionEnvSetupEnvFile: true,
    productionEnvSetupJsonPath: setupJsonPath,
  });
  assert.equal(explicitResolution.source, "cli");
  assert.equal(explicitResolution.usedProductionEnvSetup, false);
  assert.deepEqual(explicitResolution.envFiles, [envFilePath]);

  const parsed = parseArgs([
    "--use-production-env-setup-env-file",
    "--production-env-setup-json",
    setupJsonPath,
    "--api-command",
    process.execPath,
    "--api-args-json",
    JSON.stringify([fakeApiPath]),
    "--json",
    "--no-write",
  ]);
  assert.deepEqual(parsed.envFiles, [envFilePath]);
  assert.equal(parsed.envFileSource, "production_env_setup");
  assert.equal(parsed.envFileFromProductionSetup, true);
  assert.match(parsed.envFileSourceSummary, /setup/);

  const report = await buildProductionRuntimeSmoke({
    envFiles: parsed.envFiles,
    envFileSource: parsed.envFileSource,
    envFileSourceSummary: parsed.envFileSourceSummary,
    envFileFromProductionSetup: parsed.envFileFromProductionSetup,
    baseEnv: buildBaseEnv({ fakeMode: "ready" }),
    apiCommand: process.execPath,
    apiArgs: [fakeApiPath],
    checkedAt: "2026-07-08T03:35:00.000Z",
    timeoutMs: 5000,
  });
  assert.equal(report.status, "ready");
  assert.equal(report.envFileSource, "production_env_setup");
  assert.equal(report.envFileSourceLabel, "生产 env setup 安全文件");
  assert.equal(report.envFileFromProductionSetup, true);
  assert.equal(report.summary.envFileFromProductionSetup, true);
  assert.equal(report.safeguards.envFileReadFromProductionSetup, true);
  assert.equal(report.safeguards.envFilePathExposed, false);
  assert.match(formatProductionRuntimeSmoke(report), /Env file source: 生产 env setup 安全文件/);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionRuntimeSmoke(report));

  const cliRun = await runNodeCli(
    [
      runnerScript,
      "--use-production-env-setup-env-file",
      "--production-env-setup-json",
      setupJsonPath,
      "--api-command",
      process.execPath,
      "--api-args-json",
      JSON.stringify([fakeApiPath]),
      "--timeout-ms",
      "5000",
      "--json",
      "--no-write",
    ],
    { env: buildBaseEnv({ fakeMode: "ready", includePath: true }) },
  );
  assert.equal(cliRun.status, 0, cliRun.stderr || cliRun.stdout);
  const cliReport = JSON.parse(cliRun.stdout);
  assert.equal(cliReport.ready, true);
  assert.equal(cliReport.envFileSource, "production_env_setup");
  assert.equal(cliReport.envFileFromProductionSetup, true);
  assert.equal(cliReport.safeguards.envFileReadFromProductionSetup, true);
  assertNoSensitiveOutput(cliRun.stdout + cliRun.stderr);
}

async function checkReadyExternalApiRuntimeSmoke() {
  writeEnvFile(envFilePath, buildReadyEnv());
  chmodSync(envFilePath, 0o600);
  const externalApi = await startExternalFakeApi({ mode: "ready" });
  try {
    const report = await buildProductionRuntimeSmoke({
      envFiles: [envFilePath],
      baseEnv: buildBaseEnv({ fakeMode: "ready" }),
      apiBaseUrl: externalApi.baseUrl,
      checkedAt: "2026-07-08T03:45:00.000Z",
      timeoutMs: 5000,
    });
    assert.equal(report.status, "ready");
    assert.equal(report.ready, true);
    assert.equal(report.runtime.runtimeMode, "external_service");
    assert.equal(report.runtime.externalApiProbed, true);
    assert.equal(report.runtime.productionEnvFileApplication.applied, true);
    assert.equal(report.safeguards.productionEnvAppliedToProcess, true);
    assert.equal(report.safeguards.apiProcessSpawned, false);
    assert.equal(report.safeguards.apiProcessTerminated, false);
    assert.equal(report.safeguards.externalApiProbed, true);
    assert.equal(report.stages.find((item) => item.key === "api-runtime-startup")?.status, "passed");
    assert.equal(report.stages.find((item) => item.key === "runtime-production-profile")?.status, "passed");
    assert.match(formatProductionRuntimeSmoke(report), /Runtime mode: external_service/);
    assertNoSensitiveOutput(JSON.stringify(report) + formatProductionRuntimeSmoke(report));

    const run = await runNodeCli(
      [
        runnerScript,
        "--env-file",
        envFilePath,
        "--api-base-url",
        externalApi.baseUrl,
        "--timeout-ms",
        "5000",
        "--json",
        "--no-write",
      ],
      { env: buildBaseEnv({ fakeMode: "ready", includePath: true }) },
    );
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const cliReport = JSON.parse(run.stdout);
    assert.equal(cliReport.ready, true);
    assert.equal(cliReport.runtime.runtimeMode, "external_service");
    assert.equal(cliReport.safeguards.externalApiProbed, true);
    assert.equal(cliReport.safeguards.apiProcessSpawned, false);
    assertNoSensitiveOutput(run.stdout + run.stderr);
  } finally {
    await closeServer(externalApi.server);
  }
}

async function checkBlockedLocalRuntimeProfile() {
  writeEnvFile(envFilePath, buildReadyEnv());
  chmodSync(envFilePath, 0o600);
  const report = await buildProductionRuntimeSmoke({
    envFiles: [envFilePath],
    baseEnv: buildBaseEnv({ fakeMode: "local" }),
    apiCommand: process.execPath,
    apiArgs: [fakeApiPath],
    checkedAt: "2026-07-08T04:00:00.000Z",
    timeoutMs: 5000,
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  const runtimeStage = report.stages.find((item) => item.key === "runtime-production-profile");
  assert.equal(runtimeStage?.status, "blocked");
  assert.ok(
    runtimeStage.blockingItems.some((item) => item.key === "postgres-repository-profile"),
    "local runtime must block postgres profile check",
  );
  assert.ok(
    runtimeStage.blockingItems.some((item) => item.key === "attachment-object-storage-runtime"),
    "local runtime must block attachment object storage check",
  );
  assert.equal(report.safeguards.apiProcessTerminated, true);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionRuntimeSmoke(report));
}

function startExternalFakeApi({ mode }) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === "/api/health") {
      const ready = mode === "ready";
      sendJson(response, 200, {
        status: "ok",
        service: "erp-p0-api",
        now: "2026-07-08T03:45:00.000Z",
        openapi: { valid: true, pathCount: 120, schemaCount: 320 },
        seed: {
          runtimeConfig: { mode: "production", production: true },
          attachmentObjectStorage: ready ? "object_storage" : "local_fs",
          statementExportObjectStorage: ready ? "object_storage" : "local_fs",
        v1PersistenceProfile: {
          repositoryProfile: ready ? "postgres" : "local_json",
          postgresRepositoryDefaultsApplied: ready ? 31 : 0,
          unsupportedRepositoryCount: ready ? 0 : 2,
          connectionStringExposed: false,
        },
        productionEnvFileApplication: buildFakeProductionEnvFileApplication({ applied: ready }),
      },
    });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      sendJson(response, 200, {
        session: { accessToken: fakeRuntimeToken, userId: "U-V1-RUNTIME-SMOKE" },
        permissions: { user: { userId: "U-V1-RUNTIME-SMOKE" } },
      });
      return;
    }
    if (url.pathname === "/api/system/v1-readiness") {
      if (request.headers.authorization !== `Bearer ${fakeRuntimeToken}` || request.headers["x-erp-user-id"]) {
        sendJson(response, 401, { code: "AUTH_SESSION_REQUIRED" });
        return;
      }
      const ready = mode === "ready";
      sendJson(response, 200, {
        status: ready ? "ready" : "blocked",
        ready,
        summary: {
          label: ready ? "31/31 通过" : "3/31 通过",
          passedCount: ready ? 31 : 3,
          totalCount: 31,
          blockingCount: ready ? 0 : 28,
        },
        localRepositoryCount: ready ? 0 : 28,
        localMemoryCount: 0,
        localPersistenceAcceptance: { accepted: false },
        repositories: [
          {
            key: "orderPoolReadRepository",
            label: "订单池读取",
            kind: ready ? "postgres" : "local_json",
            productionReady: ready,
            localKind: ready ? "" : "local_json",
          },
        ],
        safeguards: { localPersistenceAcceptedForV1: false },
      });
      return;
    }
    sendJson(response, 404, { error: { message: "not found" } });
  });
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolveListen({ server, baseUrl: `http://127.0.0.1:${port}/api` });
    });
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function buildFakeProductionEnvFileApplication({ applied }) {
  return {
    status: applied ? "applied" : "not_configured",
    ready: applied === true,
    applied: applied === true,
    selectedSourceKind: applied ? "primary" : "none",
    configuredEnvFileCount: applied ? 1 : 0,
    assignmentCount: applied ? 12 : 0,
    auditReady: applied === true,
    auditStatus: applied ? "passed" : "not_configured",
    auditBlockingCount: 0,
    auditWarningCount: 0,
    safeguards: {
      envValuesIncluded: false,
      envFilePathExposed: false,
      secretValuesIncluded: false,
      commandValuesIncluded: false,
      connectionStringExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      localPathExposed: false,
    },
  };
}

function closeServer(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

async function checkCliAndRedaction() {
  writeEnvFile(envFilePath, buildReadyEnv());
  chmodSync(envFilePath, 0o600);
  const run = await runNodeCli(
    [
      runnerScript,
      "--env-file",
      envFilePath,
      "--api-command",
      process.execPath,
      "--api-args-json",
      JSON.stringify([fakeApiPath]),
      "--timeout-ms",
      "5000",
      "--json",
      "--no-write",
    ],
    { env: buildBaseEnv({ fakeMode: "ready", includePath: true }) },
  );
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.safeguards.apiProcessTerminated, true);
  assertNoSensitiveOutput(run.stdout + run.stderr);

  const writeRun = await runNodeCli(
    [
      runnerScript,
      "--env-file",
      envFilePath,
      "--api-command",
      process.execPath,
      "--api-args-json",
      JSON.stringify([fakeApiPath]),
      "--timeout-ms",
      "5000",
      "--output-dir",
      outputDir,
      "--json",
    ],
    { env: buildBaseEnv({ fakeMode: "ready", includePath: true }) },
  );
  assert.equal(writeRun.status, 0, writeRun.stderr || writeRun.stdout);
  assertNoSensitiveOutput(writeRun.stdout + writeRun.stderr);

  const redacted = redactRuntimeSmokeText(
    `${sensitiveDatabaseUrl} ${sensitiveEndpoint}/${sensitiveBucket} ${sensitiveAccessKey} ${sensitiveSecretKey} ${fakeApiPath}`,
  );
  assertNoSensitiveOutput(redacted);
}

function buildReadyEnv() {
  return {
    ERP_RUNTIME_MODE: "production",
    ERP_V1_PERSISTENCE_PROFILE: "postgres",
    ERP_V1_FILE_STORAGE_PROFILE: "object_storage",
    ERP_V1_DATABASE_URL: sensitiveDatabaseUrl,
    ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER: "s3_compatible",
    ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT: sensitiveEndpoint,
    ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET: sensitiveBucket,
    ERP_ATTACHMENT_OBJECT_STORAGE_REGION: "cn-v1",
    ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID: sensitiveAccessKey,
    ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY: sensitiveSecretKey,
    ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX: "erp-v1/attachments",
    ERP_ATTACHMENT_OBJECT_STORAGE_FORCE_PATH_STYLE: "true",
  };
}

function buildBaseEnv({ fakeMode, includePath = false }) {
  return {
    PATH: process.env.PATH || "",
    ...(includePath ? { ERP_FAKE_RUNTIME_SENSITIVE_PATH: fakeApiPath } : {}),
    ERP_FAKE_RUNTIME_MODE: fakeMode,
    ERP_V1_READINESS_OPERATOR_ID: "U-V1-RUNTIME-SMOKE",
    ERP_V1_READINESS_LOGIN_NAME: sensitiveReadinessLoginName,
    ERP_V1_READINESS_PASSWORD: sensitiveReadinessPassword,
  };
}

function writeEnvFile(filePath, env) {
  const lines = Object.entries(env).map(([key, value]) => `${key}=${quoteEnvValue(value)}`);
  writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function quoteEnvValue(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function writeFakeApi() {
  writeFileSync(
    fakeApiPath,
    `
import http from "node:http";

const mode = process.env.ERP_FAKE_RUNTIME_MODE || "ready";
const port = Number(process.env.ERP_API_PORT || 0);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname === "/api/health") {
    const ready = mode === "ready";
    const productionEnvConfigured = Boolean(process.env.ERP_V1_PRODUCTION_ENV_FILE);
    sendJson(response, 200, {
      status: "ok",
      service: "erp-p0-api",
      now: "2026-07-08T03:00:00.000Z",
      openapi: { valid: true, pathCount: 120, schemaCount: 320 },
      seed: {
        runtimeConfig: { mode: "production", production: true },
        attachmentObjectStorage: ready ? "object_storage" : "local_fs",
        statementExportObjectStorage: ready ? "object_storage" : "local_fs",
        v1PersistenceProfile: {
          repositoryProfile: ready ? "postgres" : "local_json",
          postgresRepositoryDefaultsApplied: ready ? 31 : 0,
          unsupportedRepositoryCount: ready ? 0 : 2,
          connectionStringExposed: false
        },
        productionEnvFileApplication: {
          status: productionEnvConfigured ? "applied" : "not_configured",
          ready: productionEnvConfigured,
          applied: productionEnvConfigured,
          selectedSourceKind: productionEnvConfigured ? "primary" : "none",
          configuredEnvFileCount: productionEnvConfigured ? 1 : 0,
          assignmentCount: productionEnvConfigured ? 12 : 0,
          auditReady: productionEnvConfigured,
          auditStatus: productionEnvConfigured ? "passed" : "not_configured",
          auditBlockingCount: 0,
          auditWarningCount: 0,
          safeguards: {
            envValuesIncluded: false,
            envFilePathExposed: false,
            secretValuesIncluded: false,
            commandValuesIncluded: false,
            connectionStringExposed: false,
            objectStorageEndpointExposed: false,
            objectStorageBucketExposed: false,
            localPathExposed: false
          }
        }
      }
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    sendJson(response, 200, {
      session: { accessToken: ${JSON.stringify(fakeRuntimeToken)}, userId: "U-V1-RUNTIME-SMOKE" },
      permissions: { user: { userId: "U-V1-RUNTIME-SMOKE" } }
    });
    return;
  }
  if (url.pathname === "/api/system/v1-readiness") {
    if (request.headers.authorization !== "Bearer ${fakeRuntimeToken}" || request.headers["x-erp-user-id"]) {
      sendJson(response, 401, { code: "AUTH_SESSION_REQUIRED" });
      return;
    }
    const ready = mode === "ready";
    sendJson(response, 200, {
      status: ready ? "ready" : "blocked",
      ready,
      summary: { label: ready ? "31/31 通过" : "3/31 通过", passedCount: ready ? 31 : 3, totalCount: 31, blockingCount: ready ? 0 : 28 },
      localRepositoryCount: ready ? 0 : 28,
      localMemoryCount: 0,
      localPersistenceAcceptance: { accepted: false },
      repositories: [
        { key: "orderPoolReadRepository", label: "订单池读取", kind: ready ? "postgres" : "local_json", productionReady: ready, localKind: ready ? "" : "local_json" },
        { key: "runtimeIdentityRepository", label: "运行期身份", kind: ready ? "postgres" : "local_json", productionReady: ready, localKind: ready ? "" : "local_json" }
      ],
      safeguards: { localPersistenceAcceptedForV1: false }
    });
    return;
  }
  sendJson(response, 404, { error: { message: "not found" } });
});

server.listen(port, "127.0.0.1");
`,
  );
}

function runNodeCli(args, { env }) {
  return new Promise((resolve) => {
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
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function assertNoSensitiveOutput(value) {
  const text = String(value || "");
  for (const sensitive of [
    sensitiveDatabaseUrl,
    "SUPER_SECRET_RUNTIME_PASSWORD",
    sensitiveEndpoint,
    sensitiveBucket,
    sensitiveAccessKey,
    sensitiveSecretKey,
    sensitiveReadinessLoginName,
    sensitiveReadinessPassword,
    envFilePath,
    setupJsonPath,
    fakeApiPath,
    outputDir,
  ]) {
    assert.doesNotMatch(text, new RegExp(escapeRegExp(sensitive)), `sensitive output leaked: ${sensitive}`);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
