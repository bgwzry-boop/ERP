import assert from "node:assert/strict";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { loadV1ProductionEnvFilesIntoProcess } from "../server/productionEnvFileLoader.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-env-startup-loader");
const safeEnvPath = join(storageRoot, "secure-startup.env");
const fallbackEnvPath = join(storageRoot, "secure-startup-fallback.env");
const unsafeTemplatePath = join(process.cwd(), "docs", "development", "v1-production.env.example");
const sentinelValue = "STARTUP_LOADER_SECRET_SHOULD_NOT_LEAK";
const fallbackValue = "FALLBACK_STARTUP_LOADER_SECRET_SHOULD_NOT_LEAK";

const originalProductionEnvFile = process.env.ERP_V1_PRODUCTION_ENV_FILE;
const originalV1EnvFile = process.env.ERP_V1_ENV_FILE;
const originalAuditPaths = process.env.ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS;
const originalSentinel = process.env.ERP_STARTUP_LOADER_SENTINEL;
const originalFallbackSentinel = process.env.ERP_STARTUP_LOADER_FALLBACK_SENTINEL;

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });
writeFileSync(
  safeEnvPath,
  [
    "ERP_STARTUP_LOADER_SENTINEL=STARTUP_LOADER_SECRET_SHOULD_NOT_LEAK",
    "ERP_STARTUP_LOADER_SECOND_VALUE=secondary",
    "",
  ].join("\n"),
  { mode: 0o600 },
);
chmodSync(safeEnvPath, 0o600);
writeFileSync(
  fallbackEnvPath,
  [
    "ERP_STARTUP_LOADER_FALLBACK_SENTINEL=FALLBACK_STARTUP_LOADER_SECRET_SHOULD_NOT_LEAK",
    "",
  ].join("\n"),
  { mode: 0o600 },
);
chmodSync(fallbackEnvPath, 0o600);

try {
  const noConfigTarget = {};
  const noConfigReport = loadV1ProductionEnvFilesIntoProcess({
    env: {},
    targetEnv: noConfigTarget,
    throwOnBlocked: false,
  });
  assert.equal(noConfigReport.status, "not_configured");
  assert.equal(noConfigReport.ready, false);
  assert.equal(noConfigReport.applied, false);
  assert.equal(noConfigReport.configuredEnvFileCount, 0);
  assert.equal(noConfigReport.safeguards.auditRequiredBeforeApply, true);
  assert.deepEqual(noConfigTarget, {});

  const auditOnlyTarget = {};
  const auditOnlyReport = loadV1ProductionEnvFilesIntoProcess({
    env: { ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS: safeEnvPath },
    targetEnv: auditOnlyTarget,
    throwOnBlocked: false,
  });
  assert.equal(auditOnlyReport.status, "not_configured");
  assert.equal(auditOnlyReport.applied, false);
  assert.equal(auditOnlyReport.auditOnlySourceConfigured, true);
  assert.equal(auditOnlyReport.configuredAuditOnlySourceVariableCount, 1);
  assert.ok(
    auditOnlyReport.sourceStatuses.some(
      (item) => item.envVariable === "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS" && item.ignoredForApplication === true,
    ),
    "audit-only source should be visible but never applied to process env",
  );
  assert.equal(auditOnlyTarget.ERP_STARTUP_LOADER_SENTINEL, undefined);

  const primaryTarget = {};
  const primaryReport = loadV1ProductionEnvFilesIntoProcess({
    env: {
      ERP_V1_PRODUCTION_ENV_FILE: safeEnvPath,
      ERP_V1_ENV_FILE: fallbackEnvPath,
      ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS: fallbackEnvPath,
    },
    targetEnv: primaryTarget,
    throwOnBlocked: false,
  });
  assert.equal(primaryReport.status, "applied");
  assert.equal(primaryReport.ready, true);
  assert.equal(primaryReport.applied, true);
  assert.equal(primaryReport.selectedEnvVariable, "ERP_V1_PRODUCTION_ENV_FILE");
  assert.equal(primaryReport.selectedSourceKind, "primary");
  assert.equal(primaryReport.configuredEnvFileCount, 1);
  assert.equal(primaryReport.configuredSourceVariableCount, 3);
  assert.equal(primaryReport.configuredApplicationSourceVariableCount, 2);
  assert.equal(primaryReport.configuredAuditOnlySourceVariableCount, 1);
  assert.equal(primaryReport.ignoredConfiguredFallbackVariableCount, 1);
  assert.equal(primaryReport.assignmentCount, 2);
  assert.equal(primaryTarget.ERP_STARTUP_LOADER_SENTINEL, sentinelValue);
  assert.equal(primaryTarget.ERP_STARTUP_LOADER_FALLBACK_SENTINEL, undefined);
  assert.equal(primaryReport.safeguards.processEnvMutated, true);
  assert.equal(primaryReport.safeguards.auditOnlyPathApplied, false);
  assertNoSensitiveOutput(JSON.stringify(primaryReport));

  const fallbackTarget = {};
  const fallbackReport = loadV1ProductionEnvFilesIntoProcess({
    env: { ERP_V1_ENV_FILE: fallbackEnvPath },
    targetEnv: fallbackTarget,
    throwOnBlocked: false,
  });
  assert.equal(fallbackReport.status, "applied");
  assert.equal(fallbackReport.selectedEnvVariable, "ERP_V1_ENV_FILE");
  assert.equal(fallbackReport.selectedSourceKind, "fallback");
  assert.equal(fallbackReport.fallbackSourceUsed, true);
  assert.equal(fallbackReport.assignmentCount, 1);
  assert.equal(fallbackTarget.ERP_STARTUP_LOADER_FALLBACK_SENTINEL, fallbackValue);
  assertNoSensitiveOutput(JSON.stringify(fallbackReport));

  const blockedTarget = {};
  const blockedReport = loadV1ProductionEnvFilesIntoProcess({
    env: { ERP_V1_PRODUCTION_ENV_FILE: unsafeTemplatePath },
    targetEnv: blockedTarget,
    throwOnBlocked: false,
  });
  assert.equal(blockedReport.status, "audit_blocked");
  assert.equal(blockedReport.ready, false);
  assert.equal(blockedReport.applied, false);
  assert.equal(blockedReport.auditBlockingCount > 0, true);
  assert.deepEqual(blockedTarget, {});
  assert.throws(
    () =>
      loadV1ProductionEnvFilesIntoProcess({
        env: { ERP_V1_PRODUCTION_ENV_FILE: unsafeTemplatePath },
        targetEnv: {},
      }),
    /startup load blocked by env file audit/,
  );

  delete process.env.ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS;
  process.env.ERP_V1_PRODUCTION_ENV_FILE = safeEnvPath;
  delete process.env.ERP_V1_ENV_FILE;
  const server = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true }));
  try {
    await listen(server);
    const { port } = server.address();
    const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    const application = health.seed?.productionEnvFileApplication;
    assert.equal(application.status, "applied");
    assert.equal(application.ready, true);
    assert.equal(application.applied, true);
    assert.equal(application.selectedEnvVariable, "ERP_V1_PRODUCTION_ENV_FILE");
    assert.equal(application.assignmentCount, 2);
    assert.equal(application.safeguards.envValuesIncluded, false);
    assert.equal(application.safeguards.envFilePathExposed, false);
    assert.equal(process.env.ERP_STARTUP_LOADER_SENTINEL, sentinelValue);
    assertNoSensitiveOutput(JSON.stringify(health));
  } finally {
    await closeServer(server);
  }
} finally {
  restoreEnv("ERP_V1_PRODUCTION_ENV_FILE", originalProductionEnvFile);
  restoreEnv("ERP_V1_ENV_FILE", originalV1EnvFile);
  restoreEnv("ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS", originalAuditPaths);
  restoreEnv("ERP_STARTUP_LOADER_SENTINEL", originalSentinel);
  restoreEnv("ERP_STARTUP_LOADER_FALLBACK_SENTINEL", originalFallbackSentinel);
}

console.log(
  "V1 production env startup loader check passed: no-op default, audit-only separation, startup application, audit blocking, health redaction are covered.",
);

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
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function assertNoSensitiveOutput(output) {
  assert.doesNotMatch(output, /STARTUP_LOADER_SECRET_SHOULD_NOT_LEAK/);
  assert.doesNotMatch(output, /FALLBACK_STARTUP_LOADER_SECRET_SHOULD_NOT_LEAK/);
  assert.doesNotMatch(output, /secure-startup(?:-fallback)?\.env/);
  assert.doesNotMatch(output, /\.erp-local-storage/);
  assert.doesNotMatch(output, /\/Users\/|\/private\//);
}
