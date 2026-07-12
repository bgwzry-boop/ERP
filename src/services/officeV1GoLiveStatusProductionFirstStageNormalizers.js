import {
  normalizeProductionEnvSetupTargetStatus,
  normalizeProductionEnvValuesDryRunProofFingerprint,
  normalizeProductionEnvValuesDryRunProofFreshness,
  normalizeProductionEnvValuesDryRunProofStatus,
  normalizeProductionFirstStageValuesDryRunBlockingItem,
  normalizeV1ProductionEnvFileAuditConfigSourceStatus,
  normalizeV1ProductionEnvFileAuditServerConfigGuidance,
} from "./officeV1GoLiveStatusProductionEnvNormalizers.js";
import {
  cleanText,
  formatDateTimeLabel,
  formatUnblockTaskStatusLabel,
  isPlainObject,
  normalizeStringList,
} from "./officeV1GoLiveStatusNormalizerUtils.js";

export function normalizeProductionFirstStageExecution(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const execution = isPlainObject(source.execution) ? source.execution : {};
  const intakeCoverage = normalizeProductionFirstStageIntakeCoverage(source.intakeCoverage);
  const dryRunCoverage = normalizeProductionFirstStageDryRunCoverage(source.dryRunCoverage);
  const stages = Array.isArray(source.stages)
    ? source.stages.map(normalizeProductionFirstStageStage).filter((item) => item.label)
    : [];
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(normalizeProductionFirstStageStage).filter((item) => item.label)
    : [];
  const status = cleanText(source.status) || "missing";
  const available = source.available === true || status !== "missing" || Boolean(cleanText(summary.label));
  const passedCount = Number(summary.passedCount) || 0;
  const totalCount = Number(summary.totalCount) || stages.length;
  const blockingCount = Number(summary.blockingCount) || blockingStages.length;
  const errorCount = Number(summary.errorCount) || 0;
  return {
    status,
    statusLabel: source.ready === true
      ? "已通过"
      : !available
        ? "未生成"
        : status === "blocked"
          ? "阻塞"
          : status === "error"
            ? "异常"
            : status,
    ready: source.ready === true,
    available,
    checkedAt: cleanText(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (available ? `${passedCount}/${totalCount} 步骤通过` : "第一阶段执行未生成"),
      passedCount,
      plannedCount: Number(summary.plannedCount) || 0,
      totalCount,
      blockingCount,
      errorCount,
      passedLabel: cleanText(summary.passedLabel) || `${passedCount}/${totalCount}`,
      blockingLabel: cleanText(summary.blockingLabel) || `${blockingCount} 项`,
      errorLabel: cleanText(summary.errorLabel) || `${errorCount} 项`,
    },
    execution: {
      envFileCount: Number(execution.envFileCount) || 0,
      envFileSourceLabel: cleanText(execution.envFileSourceLabel),
      envFileFromProductionSetup: execution.envFileFromProductionSetup === true,
      planOnly: execution.planOnly === true,
      applyMigrations: execution.applyMigrations === true,
      restoreResetExplicitlyAllowed: execution.restoreResetExplicitlyAllowed === true,
      migrationApplyRequiresExplicitFlag: execution.migrationApplyRequiresExplicitFlag !== false,
      runtimeSmokeUsesExistingApi: execution.runtimeSmokeUsesExistingApi === true,
      fieldEvidenceManifestSourceLabel: cleanText(execution.fieldEvidenceManifestSourceLabel),
      fieldEvidenceManifestConfigured: execution.fieldEvidenceManifestConfigured === true,
      fieldEvidenceManifestDefaultTemplateUsed: execution.fieldEvidenceManifestDefaultTemplateUsed === true,
      productionEnvValuesFileProvided: execution.productionEnvValuesFileProvided === true,
      productionEnvValuesDryRun: execution.productionEnvValuesDryRun === true,
      productionEnvValuesDryRunStopsBeforeFirstStage: execution.productionEnvValuesDryRunStopsBeforeFirstStage === true,
    },
    intakeCoverage,
    dryRunCoverage,
    stages,
    blockingStages,
    nextActions: normalizeStringList(source.nextActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeProductionFirstStageStage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const evidence = isPlainObject(source.evidence) ? source.evidence : {};
  return {
    key: cleanText(source.key),
    label: cleanText(source.label),
    status: cleanText(source.status),
    statusLabel: formatUnblockTaskStatusLabel(cleanText(source.status)),
    detail: cleanText(source.detail),
    exitCode: Number.isFinite(Number(source.exitCode)) ? Number(source.exitCode) : null,
    evidence: {
      reportParsed: evidence.reportParsed === true,
      reportStatus: cleanText(evidence.reportStatus),
      reportReady: evidence.reportReady === true,
      dryRun: evidence.dryRun === true,
      dryRunProjectionIncluded: evidence.dryRunProjectionIncluded === true,
      summaryLabel: cleanText(evidence.summaryLabel),
      intakeCoverageIncluded: evidence.intakeCoverageIncluded === true,
      intakeAuditReady: evidence.intakeAuditReady === true,
      intakeCsvReady: evidence.intakeCsvReady === true,
      intakeConfiguredRowCount: Number(evidence.intakeConfiguredRowCount) || 0,
      intakeRowCount: Number(evidence.intakeRowCount) || 0,
      intakeMissingRowCount: Number(evidence.intakeMissingRowCount) || 0,
      fullIntakeConfiguredLabel: cleanText(evidence.fullIntakeConfiguredLabel),
      intakeConfiguredLabel: cleanText(evidence.intakeConfiguredLabel),
      minimumBlockingLabel: cleanText(evidence.minimumBlockingLabel),
      minimumBlockingMissingCount: Number(evidence.minimumBlockingMissingCount) || 0,
      minimumWarningLabel: cleanText(evidence.minimumWarningLabel),
      minimumWarningMissingCount: Number(evidence.minimumWarningMissingCount) || 0,
      passedCount: Number(evidence.passedCount) || 0,
      blockingCount: Number(evidence.blockingCount) || 0,
      warningCount: Number(evidence.warningCount) || 0,
      scope: cleanText(evidence.scope),
    },
    nextActions: normalizeStringList(source.nextActions),
  };
}

function normalizeProductionFirstStageIntakeCoverage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const status = cleanText(source.status) || "missing";
  const available = source.available === true || status !== "missing";
  const configuredRowCount = Number(source.configuredRowCount) || 0;
  const intakeRowCount = Number(source.intakeRowCount) || 0;
  const minimumBlockingSatisfiedCount = Number(source.minimumBlockingSatisfiedCount) || 0;
  const minimumBlockingTargetCount = Number(source.minimumBlockingTargetCount) || 0;
  const minimumWarningSatisfiedCount = Number(source.minimumWarningSatisfiedCount) || 0;
  const minimumWarningTargetCount = Number(source.minimumWarningTargetCount) || 0;
  return {
    available,
    included: source.included === true,
    status,
    statusLabel: cleanText(source.statusLabel) || (source.included === true ? "已纳入" : available ? "未纳入" : "未生成"),
    reportReady: source.reportReady === true,
    auditReady: source.auditReady === true,
    intakeCsvReady: source.intakeCsvReady === true,
    configuredRowCount,
    intakeRowCount,
    missingRowCount: Number(source.missingRowCount) || Math.max(0, intakeRowCount - configuredRowCount),
    configuredLabel: cleanText(source.configuredLabel) || `${configuredRowCount}/${intakeRowCount}`,
    fullIntakeConfiguredLabel: cleanText(source.fullIntakeConfiguredLabel) || `${configuredRowCount}/${intakeRowCount}`,
    blockingCount: Number(source.blockingCount) || 0,
    warningCount: Number(source.warningCount) || 0,
    alternativeGroupBlockingCount: Number(source.alternativeGroupBlockingCount) || 0,
    alternativeGroupWarningCount: Number(source.alternativeGroupWarningCount) || 0,
    minimumBlockingReady: source.minimumBlockingReady === true,
    minimumBlockingSatisfiedCount,
    minimumBlockingTargetCount,
    minimumBlockingMissingCount:
      Number(source.minimumBlockingMissingCount) || Math.max(0, minimumBlockingTargetCount - minimumBlockingSatisfiedCount),
    minimumBlockingVariableRowCount: Number(source.minimumBlockingVariableRowCount) || 0,
    minimumBlockingAlternativeGroupCount: Number(source.minimumBlockingAlternativeGroupCount) || 0,
    minimumBlockingLabel: cleanText(source.minimumBlockingLabel) || `${minimumBlockingSatisfiedCount}/${minimumBlockingTargetCount}`,
    minimumWarningReady: source.minimumWarningReady === true,
    minimumWarningSatisfiedCount,
    minimumWarningTargetCount,
    minimumWarningMissingCount:
      Number(source.minimumWarningMissingCount) || Math.max(0, minimumWarningTargetCount - minimumWarningSatisfiedCount),
    minimumWarningVariableRowCount: Number(source.minimumWarningVariableRowCount) || 0,
    minimumWarningAlternativeGroupCount: Number(source.minimumWarningAlternativeGroupCount) || 0,
    minimumWarningLabel: cleanText(source.minimumWarningLabel) || `${minimumWarningSatisfiedCount}/${minimumWarningTargetCount}`,
    nextAction: cleanText(source.nextAction),
  };
}

function normalizeProductionFirstStageDryRunCoverage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const status = cleanText(source.status) || "missing";
  const available = source.available === true || status !== "missing";
  return {
    available,
    included: source.included === true,
    status,
    statusLabel: cleanText(source.statusLabel) || (source.included === true ? "已纳入" : available ? "未纳入" : "未生成"),
    targetWouldBeWritten: source.targetWouldBeWritten === true,
    envPreflightReady: source.envPreflightReady === true,
    envPreflightPassedCount: Number(source.envPreflightPassedCount) || 0,
    envPreflightTotalCount: Number(source.envPreflightTotalCount) || 0,
    envPreflightBlockingCount: Number(source.envPreflightBlockingCount) || 0,
    envPreflightLabel: cleanText(source.envPreflightLabel) || `${Number(source.envPreflightPassedCount) || 0}/${Number(source.envPreflightTotalCount) || 0}`,
    intakeConfiguredRowCount: Number(source.intakeConfiguredRowCount) || 0,
    intakeRowCount: Number(source.intakeRowCount) || 0,
    intakeLabel: cleanText(source.intakeLabel) || `${Number(source.intakeConfiguredRowCount) || 0}/${Number(source.intakeRowCount) || 0}`,
    intakeMissingRequiredVariableCount: Number(source.intakeMissingRequiredVariableCount) || 0,
    intakeAlternativeGroupBlockingCount: Number(source.intakeAlternativeGroupBlockingCount) || 0,
    minimumBlockingReady: source.minimumBlockingReady === true,
    minimumBlockingSatisfiedCount: Number(source.minimumBlockingSatisfiedCount) || 0,
    minimumBlockingTargetCount: Number(source.minimumBlockingTargetCount) || 0,
    minimumBlockingMissingCount: Number(source.minimumBlockingMissingCount) || 0,
    minimumBlockingVariableRowCount: Number(source.minimumBlockingVariableRowCount) || 0,
    minimumBlockingAlternativeGroupCount: Number(source.minimumBlockingAlternativeGroupCount) || 0,
    minimumBlockingLabel: cleanText(source.minimumBlockingLabel) || `${Number(source.minimumBlockingSatisfiedCount) || 0}/${Number(source.minimumBlockingTargetCount) || 0}`,
    minimumWarningReady: source.minimumWarningReady === true,
    minimumWarningSatisfiedCount: Number(source.minimumWarningSatisfiedCount) || 0,
    minimumWarningTargetCount: Number(source.minimumWarningTargetCount) || 0,
    minimumWarningMissingCount: Number(source.minimumWarningMissingCount) || 0,
    minimumWarningLabel: cleanText(source.minimumWarningLabel) || `${Number(source.minimumWarningSatisfiedCount) || 0}/${Number(source.minimumWarningTargetCount) || 0}`,
    nextAction: cleanText(source.nextAction),
  };
}

export function normalizeV1ProductionFirstStageExecutionLiveRunResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const firstStageExecution = normalizeProductionFirstStageExecution(source.firstStageExecution);
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(normalizeProductionFirstStageValuesDryRunBlockingItem).filter((item) => item.label)
    : [];
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(normalizeProductionFirstStageStage).filter((item) => item.label)
    : firstStageExecution.blockingStages;
  const status = cleanText(source.status) || (source.ready === true ? "ready" : firstStageExecution.status || "blocked");
  const blockingCount = Number(summary.blockingCount) || blockingItems.length + blockingStages.length;
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "error"
          ? "执行失败"
          : status === "missing"
            ? "未生成"
            : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "生产环境 / 持久化第一阶段仍有阻塞",
      firstStageLabel: cleanText(summary.firstStageLabel) || firstStageExecution.summary.label,
      firstStageStatus: cleanText(summary.firstStageStatus) || firstStageExecution.status,
      passedCount: Number(summary.passedCount) || firstStageExecution.summary.passedCount,
      totalCount: Number(summary.totalCount) || firstStageExecution.summary.totalCount,
      passedLabel: cleanText(summary.passedLabel) || firstStageExecution.summary.passedLabel,
      blockingCount,
      blockerLabel: cleanText(summary.blockerLabel) || `${blockingCount} 项`,
      errorCount: Number(summary.errorCount) || firstStageExecution.summary.errorCount,
      errorLabel: cleanText(summary.errorLabel) || firstStageExecution.summary.errorLabel,
      envFileFromProductionSetup: summary.envFileFromProductionSetup === true,
      envFileSourceLabel: cleanText(summary.envFileSourceLabel),
      requestBodyIgnored: summary.requestBodyIgnored === true,
      envFilePathAccepted: summary.envFilePathAccepted === true,
      envFilePathExposed: summary.envFilePathExposed === true,
      productionEnvValuesFileAccepted: summary.productionEnvValuesFileAccepted === true,
      productionEnvValuesApplyExecuted: summary.productionEnvValuesApplyExecuted === true,
      productionEnvFileMutated: summary.productionEnvFileMutated === true,
      applyMigrations: summary.applyMigrations === true,
      schemaMigrationApplyExecuted: summary.schemaMigrationApplyExecuted === true,
      runtimeSmokeUsesCurrentApi: summary.runtimeSmokeUsesCurrentApi === true || firstStageExecution.execution.runtimeSmokeUsesExistingApi === true,
      runtimeSmokeApiBaseUrlAccepted: summary.runtimeSmokeApiBaseUrlAccepted === true,
      runtimeSmokeApiBaseUrlExposed: summary.runtimeSmokeApiBaseUrlExposed === true,
      restoreResetExplicitlyAllowed: summary.restoreResetExplicitlyAllowed === true,
      businessDataMutated: summary.businessDataMutated === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      physicalPrinterCalled: summary.physicalPrinterCalled === true,
      driverDeliveryStatusChanged: summary.driverDeliveryStatusChanged === true,
    },
    firstStageExecution,
    blockingItems,
    blockingStages,
    serverConfigGuidance: normalizeV1ProductionFirstStageExecutionServerConfigGuidance(source.serverConfigGuidance),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionFirstStageExecutionServerConfigGuidance(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    label: cleanText(source.label),
    status: cleanText(source.status),
    ready: source.ready === true,
    envFileSource: cleanText(source.envFileSource),
    primaryInput: cleanText(source.primaryInput),
    acceptsFrontendPath: source.acceptsFrontendPath === true,
    pathValueExposed: source.pathValueExposed === true,
    restartRequired: source.restartRequired === true,
    applyMigrationsByDefault: source.applyMigrationsByDefault === true,
    restoreResetAllowedByDefault: source.restoreResetAllowedByDefault === true,
    productionEnvValuesFileAccepted: source.productionEnvValuesFileAccepted === true,
    runtimeSmokeApiBaseUrlSource: cleanText(source.runtimeSmokeApiBaseUrlSource),
    runtimeSmokeApiBaseUrlAcceptedFromFrontend: source.runtimeSmokeApiBaseUrlAcceptedFromFrontend === true,
    runtimeSmokeApiBaseUrlExposed: source.runtimeSmokeApiBaseUrlExposed === true,
    steps: normalizeStringList(source.steps),
    verificationActions: normalizeStringList(source.verificationActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

export function normalizeV1ProductionPersistenceEvidenceLiveRunResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const persistenceEvidence = normalizeV1ProductionPersistenceEvidence(source.persistenceEvidence);
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(normalizeProductionFirstStageValuesDryRunBlockingItem).filter((item) => item.label)
    : [];
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(normalizeV1ProductionPersistenceEvidenceStage).filter((item) => item.label)
    : persistenceEvidence.blockingStages;
  const status = cleanText(source.status) || (source.ready === true ? "ready" : persistenceEvidence.status || "blocked");
  const blockingCount = Number(summary.blockingCount) || blockingItems.length + blockingStages.length;
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "error"
          ? "执行失败"
          : status === "missing"
            ? "未生成"
            : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "生产持久化留证仍有阻塞",
      evidenceLabel: cleanText(summary.evidenceLabel) || persistenceEvidence.summary.label,
      evidenceStatus: cleanText(summary.evidenceStatus) || persistenceEvidence.status,
      passedCount: Number(summary.passedCount) || persistenceEvidence.summary.passedCount,
      totalCount: Number(summary.totalCount) || persistenceEvidence.summary.totalCount,
      passedLabel: cleanText(summary.passedLabel) || persistenceEvidence.summary.passedLabel,
      blockingCount,
      blockerLabel: cleanText(summary.blockerLabel) || `${blockingCount} 项`,
      warningCount: Number(summary.warningCount) || persistenceEvidence.summary.warningCount,
      warningLabel: cleanText(summary.warningLabel) || `${Number(summary.warningCount) || persistenceEvidence.summary.warningCount} 项`,
      envFileFromProductionSetup: summary.envFileFromProductionSetup === true,
      envFileSourceLabel: cleanText(summary.envFileSourceLabel) || persistenceEvidence.envFileSourceLabel,
      persistenceEnvReady: summary.persistenceEnvReady === true,
      postgresReady: summary.postgresReady === true,
      postgresBackupRestoreReady: summary.postgresBackupRestoreReady === true,
      objectStorageReady: summary.objectStorageReady === true,
      objectStorageGovernanceReady: summary.objectStorageGovernanceReady === true,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      envFilePathAccepted: summary.envFilePathAccepted === true,
      envFilePathExposed: summary.envFilePathExposed === true,
      schemaMigrationApplyExecuted: summary.schemaMigrationApplyExecuted === true,
      restoreResetExplicitlyAllowed: summary.restoreResetExplicitlyAllowed === true,
      restoreDatabaseMutated: summary.restoreDatabaseMutated === true,
      businessDataMutated: summary.businessDataMutated === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      physicalPrinterCalled: summary.physicalPrinterCalled === true,
      driverDeliveryStatusChanged: summary.driverDeliveryStatusChanged === true,
    },
    persistenceEvidence,
    blockingItems,
    blockingStages,
    serverConfigGuidance: normalizeV1ProductionPersistenceEvidenceServerConfigGuidance(source.serverConfigGuidance),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

export function normalizeV1ProductionPersistenceEvidence(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const stages = Array.isArray(source.stages)
    ? source.stages.map(normalizeV1ProductionPersistenceEvidenceStage).filter((item) => item.label)
    : [];
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(normalizeV1ProductionPersistenceEvidenceStage).filter((item) => item.label)
    : stages.filter((item) => item.status !== "passed");
  const status = cleanText(source.status) || "missing";
  const available = source.available === true || status !== "missing" || Boolean(cleanText(summary.label));
  const passedCount = Number(summary.passedCount) || 0;
  const totalCount = Number(summary.totalCount) || stages.length;
  const blockingCount = Number(summary.blockingCount) || blockingStages.length;
  const warningCount = Number(summary.warningCount) || 0;
  const nextActions = normalizeStringList(source.nextActions);
  return {
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "missing"
          ? "未生成"
          : status === "error"
            ? "执行失败"
            : "仍未通过",
    available,
    checkedAt: cleanText(source.checkedAt),
    envFileCount: Number(source.envFileCount) || 0,
    envFileSource: cleanText(source.envFileSource),
    envFileSourceLabel: cleanText(source.envFileSourceLabel),
    envFileFromProductionSetup: source.envFileFromProductionSetup === true,
    summary: {
      label: cleanText(summary.label) || (available ? `${passedCount}/${totalCount} 阶段通过` : "生产持久化留证未生成"),
      passedCount,
      totalCount,
      blockingCount,
      warningCount,
      passedLabel: cleanText(summary.passedLabel) || `${passedCount}/${totalCount}`,
      blockingLabel: cleanText(summary.blockingLabel) || `${blockingCount} 项`,
      warningLabel: cleanText(summary.warningLabel) || `${warningCount} 项`,
      postgresReady: summary.postgresReady === true,
      postgresBackupRestoreReady: summary.postgresBackupRestoreReady === true,
      objectStorageReady: summary.objectStorageReady === true,
      objectStorageGovernanceReady: summary.objectStorageGovernanceReady === true,
      persistenceEnvReady: summary.persistenceEnvReady === true,
      envFileFromProductionSetup: summary.envFileFromProductionSetup === true || source.envFileFromProductionSetup === true,
      envFileSource: cleanText(summary.envFileSource || source.envFileSource),
      envFileSourceLabel: cleanText(summary.envFileSourceLabel || source.envFileSourceLabel),
    },
    stages,
    blockingStages,
    nextActions,
    nextAction: nextActions[0] || "",
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionPersistenceEvidenceStage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const evidence = isPlainObject(source.evidence) ? source.evidence : {};
  return {
    key: cleanText(source.key),
    label: cleanText(source.label),
    status: cleanText(source.status),
    statusLabel: formatUnblockTaskStatusLabel(cleanText(source.status)),
    ready: source.ready === true,
    detail: cleanText(source.detail),
    nextAction: cleanText(source.nextAction),
    evidence: {
      passedCount: Number(evidence.passedCount) || 0,
      totalCount: Number(evidence.totalCount) || 0,
      blockingCount: Number(evidence.blockingCount) || 0,
      warningCount: Number(evidence.warningCount) || 0,
      reportStatus: cleanText(evidence.reportStatus),
      migrationApplyExecuted: evidence.migrationApplyExecuted === true,
      restoreDatabaseMutated: evidence.restoreDatabaseMutated === true,
      dumpFilesRemoved: evidence.dumpFilesRemoved === true,
      readsBucketGovernanceOnly: evidence.readsBucketGovernanceOnly === true,
    },
  };
}

function normalizeV1ProductionPersistenceEvidenceServerConfigGuidance(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    label: cleanText(source.label),
    status: cleanText(source.status),
    ready: source.ready === true,
    envFileSource: cleanText(source.envFileSource),
    primaryInput: cleanText(source.primaryInput),
    acceptsFrontendPath: source.acceptsFrontendPath === true,
    pathValueExposed: source.pathValueExposed === true,
    applyMigrationsByDefault: source.applyMigrationsByDefault === true,
    restoreResetAllowedByDefault: source.restoreResetAllowedByDefault === true,
    writesBusinessData: source.writesBusinessData === true,
    steps: normalizeStringList(source.steps),
    verificationActions: normalizeStringList(source.verificationActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

export function normalizeV1ProductionFirstStageValuesDryRunLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const firstStageExecution = normalizeProductionFirstStageExecution(source.firstStageExecution);
  const dryRunCoverage = normalizeProductionFirstStageDryRunCoverage(source.dryRunCoverage || firstStageExecution.dryRunCoverage);
  const targetSetupStatus = normalizeProductionEnvSetupTargetStatus(source.targetSetupStatus);
  const serverConfigGuidance = normalizeV1ProductionEnvFileAuditServerConfigGuidance(source.serverConfigGuidance, {
    primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
    fallbackEnvVariables: ["ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE", "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE"],
  });
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(normalizeProductionFirstStageValuesDryRunBlockingItem).filter((item) => item.label)
    : [];
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(normalizeProductionFirstStageStage).filter((item) => item.label)
    : [];
  const sourceStatuses = Array.isArray(summary.sourceStatuses)
    ? summary.sourceStatuses.map(normalizeV1ProductionEnvFileAuditConfigSourceStatus).filter((item) => item.envVariable)
    : [];
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "not_configured"
        ? "未配置"
        : status === "error"
          ? "预检失败"
          : status === "audit_blocked"
            ? "审计未过"
          : status === "target_not_ready"
            ? "目标 env 未就绪"
          : status === "dry_run_file_binding_blocked"
            ? "dry-run 指纹未过"
            : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "第一阶段真实值 dry-run 仍未通过",
      configuredValuesFileCount: Number(summary.configuredValuesFileCount) || 0,
      valuesFilePathConfigured: summary.valuesFilePathConfigured === true,
      selectedEnvVariable: cleanText(summary.selectedEnvVariable),
      selectedEnvVariableLabel: cleanText(summary.selectedEnvVariableLabel),
      selectedSourceKind: cleanText(summary.selectedSourceKind) || "none",
      fallbackSourceUsed: summary.fallbackSourceUsed === true,
      configuredSourceVariableCount: Number(summary.configuredSourceVariableCount) || 0,
      sourceStatuses,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      valuesFilePathAccepted: summary.valuesFilePathAccepted === true,
      valuesFilePathExposed: summary.valuesFilePathExposed === true,
      targetEnvFromProductionSetup: summary.targetEnvFromProductionSetup === true,
      targetEnvFilePathExposed: summary.targetEnvFilePathExposed === true,
      targetSetupStatus: cleanText(summary.targetSetupStatus) || targetSetupStatus.status,
      targetSetupReady: summary.targetSetupReady === true,
      targetSetupReportAvailable: summary.targetSetupReportAvailable === true,
      targetSetupEnvFileCount: Number(summary.targetSetupEnvFileCount) || targetSetupStatus.summary.envFileCount,
      targetEnvFileConfigured: summary.targetEnvFileConfigured === true || targetSetupStatus.summary.targetEnvFileConfigured,
      valuesFileAuditStatus: cleanText(summary.valuesFileAuditStatus) || "not_run",
      valuesFileAuditReady: summary.valuesFileAuditReady === true,
      valuesFileAuditExecuted: summary.valuesFileAuditExecuted === true,
      valuesFileAuditBlockingCount: Number(summary.valuesFileAuditBlockingCount) || 0,
      valuesFileAuditWarningCount: Number(summary.valuesFileAuditWarningCount) || 0,
      valuesFileAuditPathExposed: summary.valuesFileAuditPathExposed === true,
      valuesFileAuditValuesIncluded: summary.valuesFileAuditValuesIncluded === true,
      dryRunProofStatus: cleanText(summary.dryRunProofStatus) || serverConfigGuidance.dryRunProofStatus,
      dryRunProofReady: summary.dryRunProofReady === true,
      dryRunProofIncluded: summary.dryRunProofIncluded === true,
      dryRunProofStatusLabel: cleanText(summary.dryRunProofStatusLabel) || serverConfigGuidance.dryRunProofStatusLabel,
      ...normalizeProductionEnvValuesDryRunProofFreshness(summary, serverConfigGuidance),
      ...normalizeProductionEnvValuesDryRunProofFingerprint(summary, serverConfigGuidance),
      dryRunProofMinimumBlockingLabel:
        cleanText(summary.dryRunProofMinimumBlockingLabel) || serverConfigGuidance.dryRunProofMinimumBlockingLabel,
      dryRunProofMinimumBlockingTargetCount:
        Number(summary.dryRunProofMinimumBlockingTargetCount) || serverConfigGuidance.dryRunProofMinimumBlockingTargetCount,
      dryRunProofMinimumBlockingSatisfiedCount:
        Number(summary.dryRunProofMinimumBlockingSatisfiedCount) ||
        serverConfigGuidance.dryRunProofMinimumBlockingSatisfiedCount,
      dryRunProofMinimumBlockingMissingCount:
        Number(summary.dryRunProofMinimumBlockingMissingCount) ||
        serverConfigGuidance.dryRunProofMinimumBlockingMissingCount,
      dryRunProofNextAction: cleanText(summary.dryRunProofNextAction) || serverConfigGuidance.dryRunProofNextAction,
      productionEnvFileMutated: summary.productionEnvFileMutated === true,
      businessDataMutated: summary.businessDataMutated === true,
      schemaMigrationApplyExecuted: summary.schemaMigrationApplyExecuted === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      dryRunStatusLabel: cleanText(summary.dryRunStatusLabel) || dryRunCoverage.statusLabel,
      minimumBlockingLabel: cleanText(summary.minimumBlockingLabel) || dryRunCoverage.minimumBlockingLabel,
      minimumWarningLabel: cleanText(summary.minimumWarningLabel) || dryRunCoverage.minimumWarningLabel,
      envPreflightLabel: cleanText(summary.envPreflightLabel) || dryRunCoverage.envPreflightLabel,
      intakeLabel: cleanText(summary.intakeLabel) || dryRunCoverage.intakeLabel,
      firstStageStatus: cleanText(summary.firstStageStatus) || firstStageExecution.status,
      firstStageLabel: cleanText(summary.firstStageLabel) || firstStageExecution.summary.label,
      blockingCount: Number(summary.blockingCount) || blockingItems.length + blockingStages.length,
      blockerLabel: cleanText(summary.blockerLabel) || `${blockingItems.length + blockingStages.length} 项`,
    },
    dryRunCoverage,
    firstStageExecution,
    targetSetupStatus,
    dryRunProofStatus: normalizeProductionEnvValuesDryRunProofStatus(source.dryRunProofStatus),
    blockingItems,
    blockingStages,
    serverConfigGuidance,
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

export function normalizeV1ProductionFirstStageValuesApplyLiveRunResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const applyReport = normalizeV1ProductionEnvValuesApplyReport(source.applyReport);
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(normalizeProductionFirstStageValuesDryRunBlockingItem).filter((item) => item.label)
    : [];
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(normalizeV1ProductionEnvValuesApplyFinding).filter((item) => item.label)
    : applyReport.blockingFindings;
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(normalizeV1ProductionEnvValuesApplyFinding).filter((item) => item.label)
    : applyReport.warningFindings;
  const targetSetupStatus = normalizeProductionEnvSetupTargetStatus(source.targetSetupStatus);
  const sourceStatuses = Array.isArray(summary.sourceStatuses)
    ? summary.sourceStatuses.map(normalizeV1ProductionEnvFileAuditConfigSourceStatus).filter((item) => item.envVariable)
    : [];
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  const applied = summary.productionEnvFileMutated === true || applyReport.targetEnvFile.applied === true;
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "disabled"
          ? "未启用"
          : status === "not_configured"
            ? "未配置"
            : status === "audit_blocked"
              ? "审计未过"
            : status === "target_not_ready"
              ? "目标 env 未就绪"
              : status === "dry_run_expired"
                ? "dry-run 已过期"
              : status === "dry_run_stale_or_mismatched"
                ? "dry-run 需重跑"
              : status === "dry_run_file_binding_blocked"
                ? "dry-run 指纹未过"
              : status === "dry_run_not_ready"
                ? "dry-run 未通过"
              : status === "error"
                ? "执行失败"
                : applied
                  ? "已合并待补"
                  : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "真实值正式合并未完成",
      applyEnabled: summary.applyEnabled === true,
      applyEnableEnvVariable: cleanText(summary.applyEnableEnvVariable) || "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED",
      configuredValuesFileCount: Number(summary.configuredValuesFileCount) || 0,
      valuesFilePathConfigured: summary.valuesFilePathConfigured === true,
      selectedEnvVariable: cleanText(summary.selectedEnvVariable),
      selectedEnvVariableLabel: cleanText(summary.selectedEnvVariableLabel),
      selectedSourceKind: cleanText(summary.selectedSourceKind) || "none",
      fallbackSourceUsed: summary.fallbackSourceUsed === true,
      configuredSourceVariableCount: Number(summary.configuredSourceVariableCount) || 0,
      sourceStatuses,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      valuesFilePathAccepted: summary.valuesFilePathAccepted === true,
      valuesFilePathExposed: summary.valuesFilePathExposed === true,
      targetEnvFromProductionSetup: summary.targetEnvFromProductionSetup === true,
      targetEnvFilePathExposed: summary.targetEnvFilePathExposed === true,
      targetSetupStatus: cleanText(summary.targetSetupStatus) || targetSetupStatus.status,
      targetSetupReady: summary.targetSetupReady === true,
      targetSetupReportAvailable: summary.targetSetupReportAvailable === true,
      targetSetupEnvFileCount: Number(summary.targetSetupEnvFileCount) || targetSetupStatus.summary.envFileCount,
      targetEnvFileConfigured: summary.targetEnvFileConfigured === true || targetSetupStatus.summary.targetEnvFileConfigured,
      valuesFileAuditStatus: cleanText(summary.valuesFileAuditStatus) || "not_run",
      valuesFileAuditReady: summary.valuesFileAuditReady === true,
      valuesFileAuditExecuted: summary.valuesFileAuditExecuted === true,
      valuesFileAuditBlockingCount: Number(summary.valuesFileAuditBlockingCount) || 0,
      valuesFileAuditWarningCount: Number(summary.valuesFileAuditWarningCount) || 0,
      valuesFileAuditPathExposed: summary.valuesFileAuditPathExposed === true,
      valuesFileAuditValuesIncluded: summary.valuesFileAuditValuesIncluded === true,
      dryRunProofStatus: cleanText(summary.dryRunProofStatus) || "missing",
      dryRunProofReady: summary.dryRunProofReady === true,
      dryRunProofIncluded: summary.dryRunProofIncluded === true,
      dryRunProofStatusLabel: cleanText(summary.dryRunProofStatusLabel) || "未生成",
      ...normalizeProductionEnvValuesDryRunProofFreshness(summary),
      ...normalizeProductionEnvValuesDryRunProofFingerprint(summary),
      dryRunProofMinimumBlockingLabel: cleanText(summary.dryRunProofMinimumBlockingLabel),
      dryRunProofMinimumBlockingTargetCount: Number(summary.dryRunProofMinimumBlockingTargetCount) || 0,
      dryRunProofMinimumBlockingSatisfiedCount: Number(summary.dryRunProofMinimumBlockingSatisfiedCount) || 0,
      dryRunProofMinimumBlockingMissingCount: Number(summary.dryRunProofMinimumBlockingMissingCount) || 0,
      dryRunProofNextAction: cleanText(summary.dryRunProofNextAction),
      targetEnvFileMayBeMutated: summary.targetEnvFileMayBeMutated === true,
      productionEnvFileMutated: summary.productionEnvFileMutated === true,
      targetEnvChanged: summary.targetEnvChanged === true,
      targetFileMode0600: summary.targetFileMode0600 === true,
      appliedVariableCount: Number(summary.appliedVariableCount) || applyReport.summary.appliedVariableCount,
      applicableValueCount: Number(summary.applicableValueCount) || applyReport.summary.applicableValueCount,
      blankSourceValueCount: Number(summary.blankSourceValueCount) || applyReport.summary.blankSourceValueCount,
      unknownSourceVariableCount: Number(summary.unknownSourceVariableCount) || applyReport.summary.unknownSourceVariableCount,
      setupReady: summary.setupReady === true,
      envPreflightReady: summary.envPreflightReady === true,
      envPreflightLabel: cleanText(summary.envPreflightLabel) || applyReport.summary.envPreflightLabel,
      intakeVerificationReady: summary.intakeVerificationReady === true,
      intakeVerificationBlockingCount: Number(summary.intakeVerificationBlockingCount) || 0,
      intakeVerificationWarningCount: Number(summary.intakeVerificationWarningCount) || 0,
      businessDataMutated: summary.businessDataMutated === true,
      schemaMigrationApplyExecuted: summary.schemaMigrationApplyExecuted === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      blockingCount: Number(summary.blockingCount) || blockingItems.length + blockingFindings.length,
      blockerLabel: cleanText(summary.blockerLabel) || `${blockingItems.length + blockingFindings.length} 项`,
      warningCount: Number(summary.warningCount) || warningFindings.length,
    },
    applyReport,
    targetSetupStatus,
    blockingItems,
    blockingFindings,
    warningFindings,
    serverConfigGuidance: normalizeV1ProductionEnvFileAuditServerConfigGuidance(source.serverConfigGuidance, {
      primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
      fallbackEnvVariables: ["ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE", "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE"],
    }),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvValuesApplyReport(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(normalizeV1ProductionEnvValuesApplyFinding).filter((item) => item.label)
    : [];
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(normalizeV1ProductionEnvValuesApplyFinding).filter((item) => item.label)
    : [];
  const envPreflightPassedCount = Number(summary.envPreflightPassedCount) || 0;
  const envPreflightTotalCount = Number(summary.envPreflightTotalCount) || 0;
  return {
    status: cleanText(source.status),
    ready: source.ready === true,
    checkedAt: formatDateTimeLabel(source.checkedAt),
    dryRun: source.dryRun === true,
    summary: {
      label: cleanText(summary.label),
      sourceAssignmentCount: Number(summary.sourceAssignmentCount) || 0,
      allowedVariableCount: Number(summary.allowedVariableCount) || 0,
      applicableValueCount: Number(summary.applicableValueCount) || 0,
      blankSourceValueCount: Number(summary.blankSourceValueCount) || 0,
      unknownSourceVariableCount: Number(summary.unknownSourceVariableCount) || 0,
      appliedVariableCount: Number(summary.appliedVariableCount) || 0,
      targetChanged: summary.targetChanged === true,
      targetMode: cleanText(summary.targetMode),
      setupReady: summary.setupReady === true,
      envPreflightReady: summary.envPreflightReady === true,
      envPreflightPassedCount,
      envPreflightTotalCount,
      envPreflightLabel: `${envPreflightPassedCount}/${envPreflightTotalCount}`,
      intakeVerificationReady: summary.intakeVerificationReady === true,
      intakeVerificationBlockingCount: Number(summary.intakeVerificationBlockingCount) || 0,
      intakeVerificationWarningCount: Number(summary.intakeVerificationWarningCount) || 0,
      blockingCount: Number(summary.blockingCount) || blockingFindings.length,
      warningCount: Number(summary.warningCount) || warningFindings.length,
    },
    sourceEnvFile: normalizeV1ProductionEnvValuesApplyFile(source.sourceEnvFile),
    targetEnvFile: normalizeV1ProductionEnvValuesApplyTargetFile(source.targetEnvFile),
    intakeCsv: normalizeV1ProductionEnvValuesApplyIntakeCsv(source.intakeCsv),
    appliedVariables: normalizeStringList(source.appliedVariables),
    skippedVariables: {
      blankSourceVariables: normalizeStringList(source.skippedVariables?.blankSourceVariables),
      unknownSourceVariables: normalizeStringList(source.skippedVariables?.unknownSourceVariables),
      safeLiteralMismatches: normalizeStringList(source.skippedVariables?.safeLiteralMismatches),
    },
    alternativeGroups: Array.isArray(source.alternativeGroups)
      ? source.alternativeGroups.map(normalizeV1ProductionEnvValuesApplyAlternativeGroup).filter((item) => item.groupKey)
      : [],
    setupRefresh: normalizeV1ProductionEnvValuesApplySetupRefresh(source.setupRefresh),
    intakeVerification: normalizeV1ProductionEnvValuesApplyIntakeVerification(source.intakeVerification),
    blockingFindings,
    warningFindings,
    nextActions: normalizeStringList(source.nextActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvValuesApplyFile(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    pathIncluded: source.pathIncluded === true,
    exists: source.exists === true,
    auditReady: source.auditReady === true,
    auditStatus: cleanText(source.auditStatus) || "not_run",
    assignmentCount: Number(source.assignmentCount) || 0,
    unknownVariableCount: Number(source.unknownVariableCount) || 0,
    blankValueCount: Number(source.blankValueCount) || 0,
  };
}

function normalizeV1ProductionEnvValuesApplyTargetFile(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    pathIncluded: source.pathIncluded === true,
    exists: source.exists === true,
    auditReadyBefore: source.auditReadyBefore === true,
    auditStatusBefore: cleanText(source.auditStatusBefore) || "not_run",
    applied: source.applied === true,
    changed: source.changed === true,
    fileMode: cleanText(source.fileMode),
  };
}

function normalizeV1ProductionEnvValuesApplyIntakeCsv(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    pathIncluded: source.pathIncluded === true,
    ready: source.ready === true,
    rowCount: Number(source.rowCount) || 0,
    allowedVariableCount: Number(source.allowedVariableCount) || 0,
    missingHeaderCount: Number(source.missingHeaderCount) || 0,
    missingHeaders: normalizeStringList(source.missingHeaders),
  };
}

function normalizeV1ProductionEnvValuesApplyAlternativeGroup(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    groupKey: cleanText(source.groupKey),
    variableCount: Number(source.variableCount) || 0,
    configuredKeyCount: Number(source.configuredKeyCount) || 0,
    configuredKeys: normalizeStringList(source.configuredKeys),
    status: cleanText(source.status),
    severity: cleanText(source.severity),
    rawValuesIncluded: source.rawValuesIncluded === true,
  };
}

function normalizeV1ProductionEnvValuesApplyFinding(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    key: cleanText(source.key),
    label: cleanText(source.label),
    severity: cleanText(source.severity) || "blocking",
    status: cleanText(source.status) || "blocked",
    statusLabel: formatUnblockTaskStatusLabel(cleanText(source.status) || "blocked"),
    detail: cleanText(source.detail),
    nextAction: cleanText(source.nextAction),
    variables: normalizeStringList(source.variables),
  };
}

function normalizeV1ProductionEnvValuesApplySetupRefresh(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const envPreflight = isPlainObject(source.envPreflight) ? source.envPreflight : {};
  return {
    status: cleanText(source.status),
    ready: source.ready === true,
    setupReady: source.setupReady === true,
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(source.summary?.label),
      remainingFixItemCount: Number(source.summary?.remainingFixItemCount) || 0,
    },
    envPreflight: {
      ready: envPreflight.ready === true,
      status: cleanText(envPreflight.status),
      passedCount: Number(envPreflight.passedCount) || 0,
      totalCount: Number(envPreflight.totalCount) || 0,
      blockingCount: Number(envPreflight.blockingCount) || 0,
      warningCount: Number(envPreflight.warningCount) || 0,
      firstRemainingFixItems: Array.isArray(envPreflight.firstRemainingFixItems)
        ? envPreflight.firstRemainingFixItems.map((item) => ({
            key: cleanText(item?.key),
            label: cleanText(item?.label),
            status: cleanText(item?.status),
            missingVariables: normalizeStringList(item?.missingVariables),
          }))
        : [],
    },
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvValuesApplyIntakeVerification(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    status: cleanText(source.status),
    ready: source.ready === true,
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      intakeRowCount: Number(source.summary?.intakeRowCount) || 0,
      configuredRowCount: Number(source.summary?.configuredRowCount) || 0,
      missingRowCount: Number(source.summary?.missingRowCount) || 0,
      blockingCount: Number(source.summary?.blockingCount) || 0,
      warningCount: Number(source.summary?.warningCount) || 0,
      alternativeGroupBlockingCount: Number(source.summary?.alternativeGroupBlockingCount) || 0,
    },
    firstBlockingFindings: Array.isArray(source.firstBlockingFindings)
      ? source.firstBlockingFindings.map((item) => ({
          type: cleanText(item?.type),
          label: cleanText(item?.label),
          variableKey: cleanText(item?.variableKey),
          status: cleanText(item?.status),
          detail: cleanText(item?.detail),
          nextAction: cleanText(item?.nextAction),
        }))
      : [],
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}
