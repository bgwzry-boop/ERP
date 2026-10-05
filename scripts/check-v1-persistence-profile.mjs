import assert from "node:assert/strict";
import {
  applyV1PersistenceProfileOptions,
  assertV1ProductionPersistenceRuntime,
  v1PersistenceObjectStorageOptionKeys,
  v1PersistencePostgresRepositoryOptionKeys,
  v1PersistenceRepositoryObjectKeys,
  v1PersistenceStorageObjectKeys,
} from "../server/v1PersistenceProfile.mjs";

const emptyEnv = {};

const defaultProfile = applyV1PersistenceProfileOptions({}, emptyEnv);
assert.equal(defaultProfile.summary.repositoryProfile, "postgres");
assert.equal(defaultProfile.summary.fileStorageProfile, "disabled");
assert.equal(defaultProfile.summary.postgresRepositoryDefaultsApplied, v1PersistencePostgresRepositoryOptionKeys.length);
assert.equal(defaultProfile.summary.objectStorageDefaultsApplied, 0);
assert.equal(defaultProfile.options.attachmentRepositoryOptions.mode, "postgres");

const fixtureProfile = applyV1PersistenceProfileOptions({ runtimeMode: "test", allowLocalFixture: true }, emptyEnv);
assert.equal(fixtureProfile.summary.repositoryProfile, "local");
assert.equal(fixtureProfile.options.attachmentRepositoryOptions.mode, "local");
assert.equal(fixtureProfile.options.attachmentRepositoryOptions.allowLocalFixture, true);

const queryJson = () => [];
const postgresProfile = applyV1PersistenceProfileOptions(
  {
    v1PersistenceProfile: {
      repositoryMode: "postgres",
      databaseUrl: "postgres://erp:secret@example.invalid/erp",
      queryJson,
    },
  },
  emptyEnv,
);

assert.equal(
  postgresProfile.appliedRepositoryOptionKeys.length,
  v1PersistencePostgresRepositoryOptionKeys.length,
);
assert.equal(postgresProfile.summary.repositoryProfile, "postgres");
assert.equal(postgresProfile.summary.databaseUrlConfigured, true);
assert.equal(postgresProfile.summary.queryJsonConfigured, true);
assert.equal(postgresProfile.summary.unsupportedRepositoryCount, 0);
assert.deepEqual(postgresProfile.summary.unsupportedRepositories, []);
assert.equal(postgresProfile.options.masterDataImportReviewRepositoryOptions.mode, "postgres");

for (const optionKey of v1PersistencePostgresRepositoryOptionKeys) {
  assert.equal(postgresProfile.options[optionKey].mode, "postgres", `${optionKey} should default to postgres`);
  assert.equal(postgresProfile.options[optionKey].queryJson, queryJson, `${optionKey} should receive queryJson`);
}

const postgresProfileText = JSON.stringify(postgresProfile.summary);
assert.equal(postgresProfileText.includes("postgres://"), false);
assert.equal(postgresProfileText.includes("erp:secret@example.invalid"), false);
assert.equal(postgresProfile.summary.connectionStringExposed, false);

const objectStorageProfile = applyV1PersistenceProfileOptions(
  {
    v1PersistenceProfile: {
      repositoryMode: "postgres",
      fileStorageMode: "object_storage",
      objectStorageOptions: {
        provider: "s3_compatible",
        endpoint: "https://object-storage.example.invalid",
        bucket: "erp-v1",
      },
    },
  },
  { DATABASE_URL: "postgres://erp:secret@example.invalid/erp" },
);

assert.equal(
  objectStorageProfile.appliedObjectStorageOptionKeys.length,
  v1PersistenceObjectStorageOptionKeys.length,
);
for (const optionKey of v1PersistenceObjectStorageOptionKeys) {
  assert.equal(objectStorageProfile.options[optionKey].mode, "object_storage", `${optionKey} should use object storage`);
  assert.equal(objectStorageProfile.options[optionKey].bucket, "erp-v1", `${optionKey} should inherit shared bucket`);
}
assert.equal(JSON.stringify(objectStorageProfile.summary).includes("object-storage.example.invalid"), false);

const explicitOverrideProfile = applyV1PersistenceProfileOptions(
  {
    runtimeMode: "test",
    allowLocalFixture: true,
    v1PersistenceProfile: "postgres",
    attachmentRepositoryOptions: { mode: "local", storageRoot: "/tmp/erp-local-override" },
    printDeviceRepository: { kind: "custom_print_device_repository" },
  },
  { DATABASE_URL: "postgres://erp:secret@example.invalid/erp" },
);

assert.equal(explicitOverrideProfile.options.attachmentRepositoryOptions.mode, "local");
assert.equal(explicitOverrideProfile.options.attachmentRepositoryOptions.storageRoot, "/tmp/erp-local-override");
assert.equal(explicitOverrideProfile.options.printDeviceRepository.kind, "custom_print_device_repository");
assert.ok(explicitOverrideProfile.skippedRepositoryOptionKeys.includes("attachmentRepositoryOptions"));
assert.ok(explicitOverrideProfile.skippedRepositoryOptionKeys.includes("printDeviceRepositoryOptions"));
assert.equal(
  explicitOverrideProfile.summary.postgresRepositoryDefaultsApplied,
  v1PersistencePostgresRepositoryOptionKeys.length - 2,
);

assert.throws(
  () => applyV1PersistenceProfileOptions({ runtimeMode: "production" }, emptyEnv),
  (error) => error?.code === "ERP_PRODUCTION_PERSISTENCE_REQUIRED",
);

const productionProfile = applyV1PersistenceProfileOptions(
  {
    runtimeMode: "production",
    v1PersistenceProfile: {
      databaseUrl: "postgres://erp:secret@example.invalid/erp",
      objectStorageOptions: { provider: "s3_compatible" },
    },
  },
  emptyEnv,
);
assert.equal(productionProfile.summary.productionEnforced, true);
assert.equal(productionProfile.summary.repositoryProfile, "postgres");
assert.equal(productionProfile.summary.fileStorageProfile, "object_storage");

const productionRepositories = Object.fromEntries(
  v1PersistenceRepositoryObjectKeys.map((objectKey) => [objectKey, { kind: "postgres" }]),
);
const productionFileStorages = Object.fromEntries(
  v1PersistenceStorageObjectKeys.map((objectKey) => [objectKey, { kind: "object_storage", configured: true }]),
);
assert.equal(
  assertV1ProductionPersistenceRuntime({
    runtimeMode: "production",
    repositories: productionRepositories,
    fileStorages: productionFileStorages,
  }).ready,
  true,
);
assert.throws(
  () =>
    assertV1ProductionPersistenceRuntime({
      runtimeMode: "production",
      repositories: { ...productionRepositories, attachmentRepository: { kind: "local_json" } },
      fileStorages: productionFileStorages,
    }),
  (error) =>
    error?.code === "ERP_PRODUCTION_PERSISTENCE_REQUIRED" &&
    error?.details?.invalidRepositories?.includes("attachmentRepository"),
);

console.log("V1 persistence profile check passed: defaults, overrides, production enforcement, object storage, and redaction are covered.");
