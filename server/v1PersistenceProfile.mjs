const postgresRepositoryOptionKeys = [
  "attachmentRepositoryOptions",
  "attachmentAccessAuditRepositoryOptions",
  "paymentRecordRepositoryOptions",
  "statementPaymentTransactionRepositoryOptions",
  "statementSettlementTransactionRepositoryOptions",
  "statementSendTransactionRepositoryOptions",
  "statementExportRepositoryOptions",
  "orderConfirmationTransactionRepositoryOptions",
  "orderPoolReadRepositoryOptions",
  "fulfillmentActionTransactionRepositoryOptions",
  "driverDeliveryDispatchRepositoryOptions",
  "driverDeviceFieldTestRepositoryOptions",
  "driverDeliveryTaskReadRepositoryOptions",
  "inventoryLedgerReadRepositoryOptions",
  "inventoryReservationReleaseTransactionRepositoryOptions",
  "orderLineVoidTransactionRepositoryOptions",
  "orderLineQuantityAdjustmentTransactionRepositoryOptions",
  "productionPackingTransactionRepositoryOptions",
  "productionPackingReadRepositoryOptions",
  "productionScheduleRecordRepositoryOptions",
  "printBatchRepositoryOptions",
  "printDeviceRepositoryOptions",
  "printJobRepositoryOptions",
  "printerDeviceFieldTestRepositoryOptions",
  "masterDataImportReviewRepositoryOptions",
  "masterDataImportTransactionRepositoryOptions",
  "rawMaterialInboundRepositoryOptions",
  "rawMaterialSupplierStatementReviewRepositoryOptions",
  "runtimeIdentityRepositoryOptions",
];

const objectStorageOptionKeys = ["attachmentObjectStorageOptions", "statementExportObjectStorageOptions"];

const repositoryObjectKeysByOptionKey = {
  attachmentRepositoryOptions: "attachmentRepository",
  attachmentAccessAuditRepositoryOptions: "attachmentAccessAuditRepository",
  paymentRecordRepositoryOptions: "paymentRecordRepository",
  statementPaymentTransactionRepositoryOptions: "statementPaymentTransactionRepository",
  statementSettlementTransactionRepositoryOptions: "statementSettlementTransactionRepository",
  statementSendTransactionRepositoryOptions: "statementSendTransactionRepository",
  statementExportRepositoryOptions: "statementExportRepository",
  orderConfirmationTransactionRepositoryOptions: "orderConfirmationTransactionRepository",
  orderPoolReadRepositoryOptions: "orderPoolReadRepository",
  fulfillmentActionTransactionRepositoryOptions: "fulfillmentActionTransactionRepository",
  driverDeliveryDispatchRepositoryOptions: "driverDeliveryDispatchRepository",
  driverDeviceFieldTestRepositoryOptions: "driverDeviceFieldTestRepository",
  driverDeliveryTaskReadRepositoryOptions: "driverDeliveryTaskReadRepository",
  inventoryLedgerReadRepositoryOptions: "inventoryLedgerReadRepository",
  inventoryReservationReleaseTransactionRepositoryOptions: "inventoryReservationReleaseTransactionRepository",
  orderLineVoidTransactionRepositoryOptions: "orderLineVoidTransactionRepository",
  orderLineQuantityAdjustmentTransactionRepositoryOptions: "orderLineQuantityAdjustmentTransactionRepository",
  productionPackingTransactionRepositoryOptions: "productionPackingTransactionRepository",
  productionPackingReadRepositoryOptions: "productionPackingReadRepository",
  productionScheduleRecordRepositoryOptions: "productionScheduleRecordRepository",
  printBatchRepositoryOptions: "printBatchRepository",
  printDeviceRepositoryOptions: "printDeviceRepository",
  printJobRepositoryOptions: "printJobRepository",
  printerDeviceFieldTestRepositoryOptions: "printerDeviceFieldTestRepository",
  masterDataImportReviewRepositoryOptions: "masterDataImportReviewRepository",
  masterDataImportTransactionRepositoryOptions: "masterDataImportTransactionRepository",
  rawMaterialInboundRepositoryOptions: "rawMaterialInboundRepository",
  rawMaterialSupplierStatementReviewRepositoryOptions: "rawMaterialSupplierStatementReviewRepository",
  runtimeIdentityRepositoryOptions: "runtimeIdentityRepository",
};

const storageObjectKeysByOptionKey = {
  attachmentObjectStorageOptions: "attachmentObjectStorage",
  statementExportObjectStorageOptions: "statementExportObjectStorage",
};

export const v1PersistencePostgresRepositoryOptionKeys = [...postgresRepositoryOptionKeys];
export const v1PersistenceObjectStorageOptionKeys = [...objectStorageOptionKeys];
export const v1PersistenceRepositoryObjectKeys = Object.freeze(Object.values(repositoryObjectKeysByOptionKey));
export const v1PersistenceStorageObjectKeys = Object.freeze(Object.values(storageObjectKeysByOptionKey));

export function applyV1PersistenceProfileOptions(options = {}, env = process.env) {
  const profile = normalizeProfileInput(options.v1PersistenceProfile ?? options.persistenceProfile);
  const runtimeMode = normalizeRuntimeMode(options.runtimeMode ?? env.ERP_RUNTIME_MODE);
  const configuredRepositoryMode = normalizeMode(
    profile.repositoryMode ??
      profile.mode ??
      options.v1PersistenceRepositoryMode ??
      env.ERP_V1_PERSISTENCE_PROFILE ??
      env.ERP_V1_REPOSITORY_STORE,
  );
  const configuredFileStorageMode = normalizeMode(
    profile.fileStorageMode ??
      profile.objectStorageMode ??
      options.v1PersistenceFileStorageMode ??
      env.ERP_V1_FILE_STORAGE_PROFILE ??
      env.ERP_V1_OBJECT_STORAGE_PROFILE,
  );
  const productionEnforced = runtimeMode === "production";
  const repositoryMode = productionEnforced ? "postgres" : configuredRepositoryMode;
  const fileStorageMode = productionEnforced ? "object_storage" : configuredFileStorageMode;
  const databaseUrl =
    profile.databaseUrl ?? options.v1PersistenceDatabaseUrl ?? env.ERP_V1_DATABASE_URL ?? env.DATABASE_URL ?? env.PGURL;
  const queryJson = profile.queryJson ?? options.v1PersistenceQueryJson;
  const objectStorageOptions = normalizeObject(profile.objectStorageOptions);
  const effectiveOptions = { ...options };
  const appliedRepositoryOptionKeys = [];
  const skippedRepositoryOptionKeys = [];
  const appliedObjectStorageOptionKeys = [];
  const skippedObjectStorageOptionKeys = [];

  if (productionEnforced && !String(databaseUrl ?? "").trim()) {
    throw productionPersistenceError("Production runtime requires a PostgreSQL connection URL.", {
      missing: ["ERP_V1_DATABASE_URL or DATABASE_URL or PGURL"],
    });
  }

  if (repositoryMode === "postgres") {
    for (const optionKey of postgresRepositoryOptionKeys) {
      const repositoryObjectKey = repositoryObjectKeysByOptionKey[optionKey];
      if (effectiveOptions[repositoryObjectKey]) {
        skippedRepositoryOptionKeys.push(optionKey);
        continue;
      }
      const current = normalizeObject(effectiveOptions[optionKey]);
      if (current.mode !== undefined) {
        skippedRepositoryOptionKeys.push(optionKey);
        effectiveOptions[optionKey] = current;
        continue;
      }
      effectiveOptions[optionKey] = {
        ...current,
        mode: "postgres",
        ...(databaseUrl ? { databaseUrl } : {}),
        ...(queryJson ? { queryJson } : {}),
      };
      appliedRepositoryOptionKeys.push(optionKey);
    }
  }

  if (fileStorageMode === "object_storage") {
    for (const optionKey of objectStorageOptionKeys) {
      const storageObjectKey = storageObjectKeysByOptionKey[optionKey];
      if (effectiveOptions[storageObjectKey]) {
        skippedObjectStorageOptionKeys.push(optionKey);
        continue;
      }
      const current = normalizeObject(effectiveOptions[optionKey]);
      if (current.mode !== undefined) {
        skippedObjectStorageOptionKeys.push(optionKey);
        effectiveOptions[optionKey] = current;
        continue;
      }
      effectiveOptions[optionKey] = {
        ...objectStorageOptions,
        ...current,
        mode: "object_storage",
      };
      appliedObjectStorageOptionKeys.push(optionKey);
    }
  }

  const summary = {
    repositoryProfile: repositoryMode || "disabled",
    fileStorageProfile: fileStorageMode || "disabled",
    postgresRepositoryDefaultsApplied: appliedRepositoryOptionKeys.length,
    postgresRepositoryDefaultsSkipped: skippedRepositoryOptionKeys.length,
    objectStorageDefaultsApplied: appliedObjectStorageOptionKeys.length,
    objectStorageDefaultsSkipped: skippedObjectStorageOptionKeys.length,
    databaseUrlConfigured: Boolean(databaseUrl),
    queryJsonConfigured: typeof queryJson === "function",
    runtimeMode,
    productionEnforced,
    unsupportedRepositoryCount: 0,
    unsupportedRepositories: [],
    connectionStringExposed: false,
    localPathExposed: false,
    secretFieldsExposed: false,
  };

  return {
    options: effectiveOptions,
    summary,
    appliedRepositoryOptionKeys,
    skippedRepositoryOptionKeys,
    appliedObjectStorageOptionKeys,
    skippedObjectStorageOptionKeys,
  };
}

export function assertV1ProductionPersistenceRuntime({
  runtimeMode,
  repositories = {},
  fileStorages = {},
} = {}) {
  if (normalizeRuntimeMode(runtimeMode) !== "production") {
    return {
      ready: true,
      productionEnforced: false,
      invalidRepositories: [],
      invalidFileStorages: [],
    };
  }

  const invalidRepositories = v1PersistenceRepositoryObjectKeys.filter(
    (objectKey) => String(repositories[objectKey]?.kind ?? "").trim() !== "postgres",
  );
  const invalidFileStorages = v1PersistenceStorageObjectKeys.filter((objectKey) => {
    const storage = fileStorages[objectKey];
    return String(storage?.kind ?? "").trim() !== "object_storage" || storage?.configured === false;
  });

  if (invalidRepositories.length || invalidFileStorages.length) {
    throw productionPersistenceError(
      "Production runtime prohibits local or in-memory repositories and requires configured object storage.",
      {
        invalidRepositories,
        invalidFileStorages,
      },
    );
  }

  return {
    ready: true,
    productionEnforced: true,
    invalidRepositories: [],
    invalidFileStorages: [],
  };
}

function normalizeProfileInput(value) {
  if (!value) return {};
  if (typeof value === "string") return { repositoryMode: value };
  if (typeof value === "object") return value;
  return {};
}

function normalizeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeMode(value) {
  const mode = String(value ?? "").trim();
  if (!mode || mode === "none" || mode === "off" || mode === "disabled" || mode === "local") return "";
  return mode;
}

function normalizeRuntimeMode(value) {
  const mode = String(value ?? "").trim().toLowerCase();
  return mode === "strict" ? "production" : mode;
}

function productionPersistenceError(message, details = {}) {
  const error = new Error(message);
  error.code = "ERP_PRODUCTION_PERSISTENCE_REQUIRED";
  error.details = details;
  return error;
}
