import { sanitizeV1SensitiveStatusText } from "./v1StatusTextSanitizer.mjs";

const repositoryHealthKeys = Object.freeze([
  "attachmentRepository",
  "attachmentAccessAuditRepository",
  "attachmentObjectStorage",
  "paymentRecordRepository",
  "statementPaymentTransactionRepository",
  "statementSettlementTransactionRepository",
  "statementSendTransactionRepository",
  "statementExportRepository",
  "statementExportObjectStorage",
  "coreWorkspaceReadRepository",
  "todoActionRepository",
  "inventoryCorrectionTransactionRepository",
  "productionFinishedGoodsPhotoTransactionRepository",
  "orderDraftRepository",
  "orderConfirmationTransactionRepository",
  "orderPoolReadRepository",
  "fulfillmentActionTransactionRepository",
  "driverDeliveryDispatchRepository",
  "driverDeviceFieldTestRepository",
  "driverDeliveryTaskReadRepository",
  "inventoryLedgerReadRepository",
  "inventoryReservationReleaseTransactionRepository",
  "inventoryIntentTransactionRepository",
  "orderLineVoidTransactionRepository",
  "orderLineQuantityAdjustmentTransactionRepository",
  "productionPackingTransactionRepository",
  "productionPackingReadRepository",
  "productionScheduleRecordRepository",
  "printBatchRepository",
  "printDeviceRepository",
  "printJobRepository",
  "printerDeviceFieldTestRepository",
  "masterDataImportReviewRepository",
  "masterDataImportTransactionRepository",
  "masterDataMachineConfigurationRepository",
  "rawMaterialInboundRepository",
  "rawMaterialSupplierStatementReviewRepository",
  "rawMaterialPurchaseRepository",
  "runtimeIdentityRepository",
  "businessDecisionEvidenceRepository",
  "printDriverAdapter",
]);

const productionEnvSafeguardKeys = Object.freeze([
  "startupOnly",
  "processEnvMutated",
  "auditRequiredBeforeApply",
  "auditOnlyPathApplied",
  "frontendPathAccepted",
  "envFilePathExposed",
  "rawEnvFileIncluded",
  "rawEnvFileAuditIncluded",
  "rawLineContentIncluded",
  "envValuesIncluded",
  "secretValuesIncluded",
  "commandValuesIncluded",
  "connectionStringExposed",
  "objectStorageEndpointExposed",
  "objectStorageBucketExposed",
  "localPathExposed",
]);

export function buildSystemHealthResponse({ workspace = {}, openapi = {}, now = () => new Date() } = {}) {
  const seed = {
    runtimeConfig: projectRuntimeConfig(workspace.runtimeConfig),
    productionPersistenceValidation: projectProductionPersistenceValidation(
      workspace.productionPersistenceValidation,
    ),
    scenarioId: safeIdentifier(workspace.scenario?.id, "unknown"),
    customers: collectionCount(workspace.customers),
    orderLines: collectionCount(workspace.orderLines),
    inventories: collectionCount(workspace.inventories),
    todos: collectionCount(workspace.todos),
    fulfillments: collectionCount(workspace.fulfillments),
    statements: collectionCount(workspace.statements),
  };

  for (const key of repositoryHealthKeys) seed[key] = safeKind(workspace[key]?.kind);
  seed.productionEnvFileApplication = projectProductionEnvFileApplication(
    workspace.productionEnvFileApplication,
  );
  seed.v1PersistenceProfile = projectV1PersistenceProfile(workspace.v1PersistenceProfile);

  return {
    status: "ok",
    service: "erp-p0-api",
    now: toIsoTimestamp(now()),
    release: projectReleaseIdentity(workspace.releaseIdentity),
    firstReleaseScope: projectFirstReleaseScope(workspace.firstReleaseScope),
    openapi: {
      valid: openapi.valid === true,
      pathCount: nonNegativeInteger(openapi.pathCount),
      schemaCount: nonNegativeInteger(openapi.schemaCount),
      refCount: nonNegativeInteger(openapi.refCount),
    },
    seed,
  };
}

function projectReleaseIdentity(value = {}) {
  const commit = /^[a-f0-9]{40}$/.test(value.commit ?? "") ? value.commit : "";
  const lockDigest = /^[a-f0-9]{64}$/.test(value.lockDigest ?? "") ? value.lockDigest : "";
  return {
    ready: value.ready === true && Boolean(commit && lockDigest),
    target: safeKind(value.target),
    version: safeIdentifier(value.version),
    commit,
    shortCommit: commit.slice(0, 12),
    lockDigest,
    builtAt: safeTimestamp(value.builtAt),
  };
}

function projectFirstReleaseScope(value) {
  const enabled = value === "raw_material_only";
  return {
    enabled,
    scope: enabled ? "raw_material_only" : "none",
    writePolicy: enabled ? "allowlist" : "unrestricted",
    allowedBusinessDomains: enabled ? ["raw_material"] : [],
  };
}

function projectRuntimeConfig(value = {}) {
  return {
    mode: safeKind(value.mode),
    dataPartition: safeKind(value.dataPartition),
    production: value.production === true,
    localDataAllowed: value.localDataAllowed === true,
    storageRootExplicit: value.storageRootExplicit === true,
    storagePathExposed: value.storagePathExposed === true,
  };
}

function projectProductionPersistenceValidation(value = {}) {
  return {
    ready: value.ready === true,
    productionEnforced: value.productionEnforced === true,
    invalidRepositories: safeIdentifierList(value.invalidRepositories),
    invalidFileStorages: safeIdentifierList(value.invalidFileStorages),
  };
}

function projectProductionEnvFileApplication(value = {}) {
  const safeguards = value.safeguards && typeof value.safeguards === "object" ? value.safeguards : {};
  return {
    scope: safeIdentifier(value.scope, "v1_production_env_file_startup_application"),
    status: safeKind(value.status),
    ready: value.ready === true,
    applied: value.applied === true,
    checkedAt: safeTimestamp(value.checkedAt),
    selectedEnvVariable: safeEnvVariable(value.selectedEnvVariable),
    selectedSourceKind: safeKind(value.selectedSourceKind || "none"),
    selectedEnvVariableLabel: safeText(value.selectedEnvVariableLabel),
    configuredEnvFileCount: nonNegativeInteger(value.configuredEnvFileCount),
    configuredSourceVariableCount: nonNegativeInteger(value.configuredSourceVariableCount),
    configuredApplicationSourceVariableCount: nonNegativeInteger(
      value.configuredApplicationSourceVariableCount,
    ),
    configuredAuditOnlySourceVariableCount: nonNegativeInteger(
      value.configuredAuditOnlySourceVariableCount,
    ),
    fallbackSourceUsed: value.fallbackSourceUsed === true,
    auditOnlySourceConfigured: value.auditOnlySourceConfigured === true,
    auditOnlyEnvVariables: Array.isArray(value.auditOnlyEnvVariables)
      ? value.auditOnlyEnvVariables.map(safeEnvVariable).filter(Boolean)
      : [],
    ignoredConfiguredFallbackVariableCount: nonNegativeInteger(
      value.ignoredConfiguredFallbackVariableCount,
    ),
    sourceStatuses: Array.isArray(value.sourceStatuses)
      ? value.sourceStatuses.map(projectProductionEnvSourceStatus)
      : [],
    assignmentCount: nonNegativeInteger(value.assignmentCount),
    auditReady: value.auditReady === true,
    auditStatus: safeKind(value.auditStatus),
    auditBlockingCount: nonNegativeInteger(value.auditBlockingCount),
    auditWarningCount: nonNegativeInteger(value.auditWarningCount),
    nextAction: safeText(value.nextAction),
    safeguards: Object.fromEntries(
      productionEnvSafeguardKeys.map((key) => [
        key,
        key === "startupOnly" || key === "auditRequiredBeforeApply"
          ? safeguards[key] !== false
          : safeguards[key] === true,
      ]),
    ),
  };
}

function projectProductionEnvSourceStatus(value = {}) {
  return {
    envVariable: safeEnvVariable(value.envVariable),
    kind: safeKind(value.kind),
    label: safeText(value.label),
    order: nonNegativeInteger(value.order),
    configured: value.configured === true,
    selected: value.selected === true,
    ignored: value.ignored === true,
    ignoredForApplication: value.ignoredForApplication === true,
    envFileCount: nonNegativeInteger(value.envFileCount),
  };
}

function projectV1PersistenceProfile(value = {}) {
  return {
    repositoryProfile: safeKind(value.repositoryProfile),
    fileStorageProfile: safeKind(value.fileStorageProfile),
    postgresRepositoryDefaultsApplied: nonNegativeInteger(value.postgresRepositoryDefaultsApplied),
    postgresRepositoryDefaultsSkipped: nonNegativeInteger(value.postgresRepositoryDefaultsSkipped),
    objectStorageDefaultsApplied: nonNegativeInteger(value.objectStorageDefaultsApplied),
    objectStorageDefaultsSkipped: nonNegativeInteger(value.objectStorageDefaultsSkipped),
    databaseUrlConfigured: value.databaseUrlConfigured === true,
    queryJsonConfigured: value.queryJsonConfigured === true,
    runtimeMode: safeKind(value.runtimeMode),
    productionEnforced: value.productionEnforced === true,
    unsupportedRepositoryCount: nonNegativeInteger(value.unsupportedRepositoryCount),
    unsupportedRepositories: safeIdentifierList(value.unsupportedRepositories),
    connectionStringExposed: value.connectionStringExposed === true,
    localPathExposed: value.localPathExposed === true,
    secretFieldsExposed: value.secretFieldsExposed === true,
  };
}

function safeIdentifierList(value) {
  return Array.isArray(value) ? value.map((item) => safeIdentifier(item, "")).filter(Boolean) : [];
}

function safeEnvVariable(value) {
  const text = String(value ?? "").trim();
  return /^[A-Z][A-Z0-9_]{0,127}$/.test(text) ? text : "";
}

function safeKind(value) {
  const text = String(value ?? "").trim();
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(text) ? text : "unknown";
}

function safeIdentifier(value, fallback = "") {
  const text = String(value ?? "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(text) ? text : fallback;
}

function safeText(value) {
  return sanitizeV1SensitiveStatusText(value).slice(0, 500);
}

function safeTimestamp(value) {
  const text = String(value ?? "").trim();
  if (!text || !Number.isFinite(Date.parse(text))) return "";
  return new Date(text).toISOString();
}

function toIsoTimestamp(value) {
  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : new Date(0).toISOString();
}

function collectionCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}
