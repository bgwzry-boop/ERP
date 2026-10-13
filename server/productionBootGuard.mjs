import {
  v1PersistenceObjectStorageOptionKeys,
  v1PersistencePostgresRepositoryOptionKeys,
  v1PersistenceRepositoryObjectKeys,
  v1PersistenceStorageObjectKeys,
} from "./v1PersistenceProfile.mjs";

const seedEnvironmentKeys = new Set([
  "ERP_OFFICE_SEED_SOURCE",
  "ERP_REAL_SAMPLE_SEED_FILE",
  "ERP_SCENARIO_ID",
]);
const fileStorageProfileEnvironmentKeys = new Set([
  "ERP_V1_FILE_STORAGE_PROFILE",
  "ERP_V1_OBJECT_STORAGE_PROFILE",
]);

export function assertProductionBootAllowed({ options = {}, env = process.env, runtimeConfig } = {}) {
  if (runtimeConfig?.isProduction !== true) return;

  const forbiddenSeedOptions = ["scenarioId", "seedSource", "realSampleSeedFile", "rawMaterialSupplierStatementReviewSeeds"]
    .filter((key) => options[key] !== undefined && options[key] !== null && options[key] !== "");
  if (forbiddenSeedOptions.length) {
    const error = new Error("Production runtime cannot load an office scenario or seed dataset.");
    error.code = "ERP_PRODUCTION_SEED_NOT_ALLOWED";
    error.details = { optionKeys: forbiddenSeedOptions };
    throw error;
  }

  const forbiddenEnvironmentKeys = Object.keys(env).filter((key) => {
    if (key.startsWith("ERP_E2E_")) return true;
    if (key.startsWith("ERP_STAGING_TEST_")) return true;
    if (seedEnvironmentKeys.has(key)) return String(env[key] ?? "").trim() !== "";
    if (fileStorageProfileEnvironmentKeys.has(key) || /^ERP_[A-Z0-9_]+_OBJECT_STORAGE$/.test(key)) {
      return isConflictingMode(env[key], "object_storage");
    }
    if (key === "ERP_V1_PERSISTENCE_PROFILE" || /^ERP_[A-Z0-9_]+_STORE$/.test(key)) {
      return isConflictingMode(env[key], "postgres");
    }
    return false;
  });

  const forbiddenOptionKeys = [];
  const profile = options.v1PersistenceProfile ?? options.persistenceProfile;
  const profileOptions = profile && typeof profile === "object" ? profile : {};
  for (const [key, value] of Object.entries({
    v1PersistenceProfile: typeof profile === "string" ? profile : undefined,
    "v1PersistenceProfile.mode": profileOptions.mode,
    "v1PersistenceProfile.repositoryMode": profileOptions.repositoryMode,
    v1PersistenceRepositoryMode: options.v1PersistenceRepositoryMode,
  })) {
    if (isConflictingMode(value, "postgres")) forbiddenOptionKeys.push(key);
  }
  for (const [key, value] of Object.entries({
    "v1PersistenceProfile.fileStorageMode": profileOptions.fileStorageMode,
    "v1PersistenceProfile.objectStorageMode": profileOptions.objectStorageMode,
    "v1PersistenceProfile.objectStorageOptions.mode": profileOptions.objectStorageOptions?.mode,
    v1PersistenceFileStorageMode: options.v1PersistenceFileStorageMode,
  })) {
    if (isConflictingMode(value, "object_storage")) forbiddenOptionKeys.push(key);
  }
  for (const key of v1PersistencePostgresRepositoryOptionKeys) {
    if (isConflictingMode(options[key]?.mode, "postgres")) forbiddenOptionKeys.push(`${key}.mode`);
  }
  for (const key of v1PersistenceObjectStorageOptionKeys) {
    if (isConflictingMode(options[key]?.mode, "object_storage")) forbiddenOptionKeys.push(`${key}.mode`);
  }
  for (const key of v1PersistenceRepositoryObjectKeys) {
    if (options[key] && normalizeMode(options[key].kind) !== "postgres") forbiddenOptionKeys.push(key);
  }
  for (const key of v1PersistenceStorageObjectKeys) {
    if (options[key] && normalizeMode(options[key].kind) !== "object_storage") forbiddenOptionKeys.push(key);
  }

  if (forbiddenEnvironmentKeys.length || forbiddenOptionKeys.length) {
    const error = new Error("Production startup refuses demo fixtures and incompatible persistence configuration.");
    error.code = "ERP_PRODUCTION_BOOT_REFUSED";
    error.details = {
      environmentKeys: forbiddenEnvironmentKeys.sort(),
      optionKeys: forbiddenOptionKeys.sort(),
    };
    throw error;
  }
}

function normalizeMode(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isConflictingMode(value, requiredMode) {
  const mode = normalizeMode(value);
  return Boolean(mode && mode !== requiredMode);
}
