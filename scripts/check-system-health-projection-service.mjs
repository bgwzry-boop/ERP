import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSystemHealthResponse } from "../server/services/systemHealthProjectionService.mjs";

const secretUrl = "postgresql://erp_user:secret@db.internal:5432/erp";
const secretToken = "health-secret-token";
const secretPath = "/Users/xu/private/production.env";

const workspace = {
  scenario: { id: "p0-office-core", secret: secretToken },
  customers: [{ id: "C-1" }, { id: "C-2" }],
  orderLines: [{ id: "L-1" }],
  inventories: [],
  todos: [{ id: "T-1" }],
  fulfillments: [{ id: "F-1" }],
  statements: [{ id: "ST-1" }],
  firstReleaseScope: "raw_material_only",
  runtimeConfig: {
    mode: "production",
    dataPartition: "production",
    production: true,
    localDataAllowed: false,
    storageRootExplicit: true,
    storagePathExposed: false,
    storageRoot: secretPath,
  },
  productionPersistenceValidation: {
    ready: true,
    productionEnforced: true,
    invalidRepositories: ["orderDraftRepository", secretPath],
    invalidFileStorages: ["attachmentObjectStorage"],
    databaseUrl: secretUrl,
  },
  attachmentRepository: { kind: "postgres", databaseUrl: secretUrl },
  attachmentAccessAuditRepository: { kind: "postgres" },
  attachmentObjectStorage: { kind: "object_storage", endpoint: "https://storage.internal" },
  statementExportObjectStorage: { kind: "object_storage" },
  orderDraftRepository: { kind: `${secretPath}/local_json` },
  printDriverAdapter: { kind: "guarded_adapter", command: secretPath },
  productionEnvFileApplication: {
    scope: "v1_production_env_file_startup_application",
    status: "ready",
    ready: true,
    applied: true,
    checkedAt: "2026-07-14T08:30:00+08:00",
    selectedEnvVariable: "ERP_V1_PRODUCTION_ENV_FILE",
    selectedSourceKind: "primary",
    selectedEnvVariableLabel: `生产来源 ${secretUrl}`,
    configuredEnvFileCount: 1,
    configuredSourceVariableCount: 1,
    configuredApplicationSourceVariableCount: 1,
    configuredAuditOnlySourceVariableCount: 0,
    fallbackSourceUsed: false,
    auditOnlySourceConfigured: false,
    auditOnlyEnvVariables: ["ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS", secretPath],
    ignoredConfiguredFallbackVariableCount: 0,
    sourceStatuses: [
      {
        envVariable: "ERP_V1_PRODUCTION_ENV_FILE",
        kind: "primary",
        label: `已应用 ${secretPath}`,
        order: 1,
        configured: true,
        selected: true,
        ignored: false,
        ignoredForApplication: false,
        envFileCount: 1,
        rawPath: secretPath,
      },
    ],
    assignmentCount: 29,
    auditReady: true,
    auditStatus: "ready",
    auditBlockingCount: 0,
    auditWarningCount: 0,
    nextAction: `检查 ${secretUrl} Bearer ${secretToken} ${secretPath}`,
    envFilePath: secretPath,
    rawEnv: `DATABASE_URL=${secretUrl}`,
    safeguards: {
      startupOnly: true,
      processEnvMutated: false,
      auditRequiredBeforeApply: true,
      envFilePathExposed: false,
      envValuesIncluded: false,
      secretValuesIncluded: false,
      commandValuesIncluded: false,
      connectionStringExposed: false,
      localPathExposed: false,
      unknownSecret: secretToken,
    },
  },
  v1PersistenceProfile: {
    repositoryProfile: "postgres",
    fileStorageProfile: "object_storage",
    postgresRepositoryDefaultsApplied: 33,
    postgresRepositoryDefaultsSkipped: 0,
    objectStorageDefaultsApplied: 2,
    objectStorageDefaultsSkipped: 0,
    databaseUrlConfigured: true,
    queryJsonConfigured: false,
    runtimeMode: "production",
    productionEnforced: true,
    unsupportedRepositoryCount: 1,
    unsupportedRepositories: ["legacyRepository", secretPath],
    connectionStringExposed: false,
    localPathExposed: false,
    secretFieldsExposed: false,
    databaseUrl: secretUrl,
    credentials: { token: secretToken },
  },
};

const response = buildSystemHealthResponse({
  workspace,
  openapi: {
    valid: true,
    pathCount: 155.9,
    schemaCount: 375,
    refCount: 394,
    sourcePath: secretPath,
  },
  now: () => new Date("2026-07-14T09:00:00+08:00"),
});

assert.equal(response.status, "ok");
assert.equal(response.service, "erp-p0-api");
assert.equal(response.now, "2026-07-14T01:00:00.000Z");
assert.deepEqual(response.firstReleaseScope, {
  enabled: true,
  scope: "raw_material_only",
  writePolicy: "allowlist",
  allowedBusinessDomains: ["raw_material"],
});
assert.deepEqual(response.openapi, { valid: true, pathCount: 155, schemaCount: 375, refCount: 394 });
assert.equal(response.seed.runtimeConfig.mode, "production");
assert.equal(response.seed.runtimeConfig.production, true);
assert.equal(response.seed.customers, 2);
assert.equal(response.seed.orderLines, 1);
assert.equal(response.seed.attachmentRepository, "postgres");
assert.equal(response.seed.attachmentObjectStorage, "object_storage");
assert.equal(response.seed.orderDraftRepository, "unknown");
assert.equal(response.seed.paymentRecordRepository, "unknown");
assert.deepEqual(response.seed.productionPersistenceValidation.invalidRepositories, ["orderDraftRepository"]);
assert.equal(response.seed.productionEnvFileApplication.status, "ready");
assert.equal(response.seed.productionEnvFileApplication.applied, true);
assert.equal(response.seed.productionEnvFileApplication.checkedAt, "2026-07-14T00:30:00.000Z");
assert.deepEqual(response.seed.productionEnvFileApplication.auditOnlyEnvVariables, [
  "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS",
]);
assert.equal(response.seed.productionEnvFileApplication.sourceStatuses.length, 1);
assert.equal(response.seed.productionEnvFileApplication.safeguards.startupOnly, true);
assert.equal(response.seed.productionEnvFileApplication.safeguards.auditRequiredBeforeApply, true);
assert.equal(response.seed.productionEnvFileApplication.safeguards.envValuesIncluded, false);
assert.equal(response.seed.v1PersistenceProfile.repositoryProfile, "postgres");
assert.deepEqual(response.seed.v1PersistenceProfile.unsupportedRepositories, ["legacyRepository"]);

const serialized = JSON.stringify(response);
for (const secret of [secretUrl, secretToken, secretPath, "storage.internal"]) {
  assert.equal(serialized.includes(secret), false, `health projection must not expose ${secret}`);
}
for (const forbiddenKey of [
  '"storageRoot":',
  '"databaseUrl":',
  '"envFilePath":',
  '"rawEnv":',
  '"credentials":',
  '"sourcePath":',
  '"rawPath":',
]) {
  assert.equal(serialized.includes(forbiddenKey), false, `health projection must drop ${forbiddenKey}`);
}
assert.match(response.seed.productionEnvFileApplication.nextAction, /连接串已隐藏/);
assert.match(response.seed.productionEnvFileApplication.nextAction, /令牌已隐藏/);
assert.match(response.seed.productionEnvFileApplication.nextAction, /本地路径已隐藏/);

const empty = buildSystemHealthResponse({ now: () => "invalid" });
assert.equal(empty.now, "1970-01-01T00:00:00.000Z");
assert.deepEqual(empty.firstReleaseScope, {
  enabled: false,
  scope: "none",
  writePolicy: "unrestricted",
  allowedBusinessDomains: [],
});
assert.equal(empty.seed.customers, 0);
assert.equal(empty.seed.runtimeConfig.mode, "unknown");
assert.equal(empty.seed.productionEnvFileApplication.safeguards.startupOnly, true);
assert.equal(empty.seed.productionEnvFileApplication.safeguards.auditRequiredBeforeApply, true);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const serviceSource = readFileSync(
  new URL("../server/services/systemHealthProjectionService.mjs", import.meta.url),
  "utf8",
);
assert.match(apiSource, /buildSystemHealthResponse\(\{ workspace, openapi \}\)/);
assert.doesNotMatch(apiSource, /productionEnvFileApplication:\s*workspace\.productionEnvFileApplication/);
assert.doesNotMatch(apiSource, /v1PersistenceProfile:\s*workspace\.v1PersistenceProfile/);
assert.doesNotMatch(serviceSource, /\b(?:readFile|writeFile|spawn|execFile|fetch)\s*\(/);
assert.ok(serviceSource.split("\n").length <= 280, "health projection service should remain focused");

console.log(
  "System health projection checks passed: public runtime, repository, env, and persistence fields are allowlisted and sensitive extensions are redacted.",
);
