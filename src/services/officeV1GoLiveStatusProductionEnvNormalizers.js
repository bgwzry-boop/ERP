import {
  normalizeProductionEnvFixItem,
} from "./officeV1GoLiveStatusProductionTemplateNormalizers.js";
import {
  cleanText,
  formatDateTimeLabel,
  formatUnblockTaskStatusLabel,
  isPlainObject,
  normalizeStringList,
} from "./officeV1GoLiveStatusNormalizerUtils.js";

export function normalizeV1ProductionEnvFileAuditConfigSourceStatus(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    envVariable: cleanText(source.envVariable),
    kind: cleanText(source.kind) || "fallback",
    label: cleanText(source.label) || "变量",
    order: Number(source.order) || 0,
    selectable: source.selectable !== false,
    configured: source.configured === true,
    selected: source.selected === true,
    ignored: source.ignored === true,
    envFileCount: Number(source.envFileCount) || 0,
  };
}

export function normalizeV1ProductionEnvLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const checks = Array.isArray(source.checks)
    ? source.checks.map(normalizeProductionEnvFixItem).filter((item) => item.label)
    : [];
  const blockingChecks = Array.isArray(source.blockingChecks) && source.blockingChecks.length
    ? source.blockingChecks.map(normalizeProductionEnvFixItem).filter((item) => item.label)
    : checks.filter((item) => item.severity === "blocking" && !item.ready);
  const warningChecks = Array.isArray(source.warningChecks) && source.warningChecks.length
    ? source.warningChecks.map(normalizeProductionEnvFixItem).filter((item) => item.label)
    : checks.filter((item) => item.severity === "warning" && !item.ready);
  const passedCount = Number(summary.passedCount) || checks.filter((item) => item.ready || item.status === "passed").length;
  const totalCount = Number(summary.totalCount) || checks.length;
  const blockingCount = Number(summary.blockingCount) || blockingChecks.length;
  const warningCount = Number(summary.warningCount) || warningChecks.length;
  const readinessLabel = cleanText(summary.readinessLabel) || (totalCount ? `${passedCount}/${totalCount}` : "0/10");
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  const stageDiagnosisSource = isPlainObject(source.stageDiagnosis) ? source.stageDiagnosis : {};
  const summarySourceStatuses = Array.isArray(summary.sourceStatuses)
    ? summary.sourceStatuses.map(normalizeV1ProductionEnvFileAuditConfigSourceStatus).filter((item) => item.envVariable)
    : [];
  const stageDiagnosisSourceStatuses = Array.isArray(stageDiagnosisSource.sourceStatuses)
    ? stageDiagnosisSource.sourceStatuses
        .map(normalizeV1ProductionEnvFileAuditConfigSourceStatus)
        .filter((item) => item.envVariable)
    : [];
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
          : status === "audit_blocked"
            ? "审计阻塞"
            : status === "error"
              ? "预检失败"
              : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (source.ready === true ? "当前运行环境已通过生产 env 预检" : "当前运行环境仍未通过生产 env 预检"),
      readinessLabel,
      passedCount,
      totalCount,
      passedLabel: readinessLabel,
      blockingCount,
      blockingLabel: `${blockingCount} 项`,
      warningCount,
      warningLabel: `${warningCount} 项`,
      placeholderValueCount: Number(summary.placeholderValueCount) || 0,
      envFileCount: Number(summary.envFileCount) || 0,
      configuredEnvFileCount: Number(summary.configuredEnvFileCount) || 0,
      currentRuntime: summary.currentRuntime === true,
      envFilePathAccepted: summary.envFilePathAccepted === true,
      envFilePathConfigured: summary.envFilePathConfigured === true,
      selectedEnvVariable: cleanText(summary.selectedEnvVariable),
      selectedEnvVariableLabel: cleanText(summary.selectedEnvVariableLabel),
      selectedSourceKind: cleanText(summary.selectedSourceKind),
      fallbackSourceUsed: summary.fallbackSourceUsed === true,
      auditOnlySourceUsed: summary.auditOnlySourceUsed === true,
      configuredSourceVariableCount: Number(summary.configuredSourceVariableCount) || 0,
      ignoredConfiguredFallbackVariableCount: Number(summary.ignoredConfiguredFallbackVariableCount) || 0,
      ignoredConfiguredAuditOnlyVariableCount: Number(summary.ignoredConfiguredAuditOnlyVariableCount) || 0,
      sourceStatuses: summarySourceStatuses,
      appliedInMemory: summary.appliedInMemory === true,
      processEnvMutated: summary.processEnvMutated === true,
      envPreflightReady: summary.envPreflightReady === true,
      envFileAuditReady: summary.envFileAuditReady === true,
      envFileAuditStatus: cleanText(summary.envFileAuditStatus),
      envFileAuditStatusLabel: cleanText(summary.envFileAuditStatusLabel),
      envFileAuditBlockingCount: Number(summary.envFileAuditBlockingCount) || 0,
      currentStage: cleanText(summary.currentStage),
      currentStageLabel: cleanText(summary.currentStageLabel),
      stageStatus: cleanText(summary.stageStatus),
      stageStatusLabel: cleanText(summary.stageStatusLabel),
      nextStage: cleanText(summary.nextStage),
      nextStageLabel: cleanText(summary.nextStageLabel),
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      blockerCount: Number(summary.blockerCount) || blockingChecks.length,
      blockerLabel: `${Number(summary.blockerCount) || blockingChecks.length} 项`,
      warningCheckCount: Number(summary.warningCheckCount) || warningChecks.length,
    },
    checks,
    blockingChecks,
    warningChecks,
    stageDiagnosis: {
      currentStage: cleanText(stageDiagnosisSource.currentStage) || cleanText(summary.currentStage),
      currentStageLabel: cleanText(stageDiagnosisSource.currentStageLabel) || cleanText(summary.currentStageLabel),
      stageStatus: cleanText(stageDiagnosisSource.stageStatus) || cleanText(summary.stageStatus),
      stageStatusLabel: cleanText(stageDiagnosisSource.stageStatusLabel) || cleanText(summary.stageStatusLabel),
      nextStage: cleanText(stageDiagnosisSource.nextStage) || cleanText(summary.nextStage),
      nextStageLabel: cleanText(stageDiagnosisSource.nextStageLabel) || cleanText(summary.nextStageLabel),
      auditReady: stageDiagnosisSource.auditReady === true || summary.envFileAuditReady === true,
      envPreflightReady: stageDiagnosisSource.envPreflightReady === true || summary.envPreflightReady === true,
      envFilePathConfigured: stageDiagnosisSource.envFilePathConfigured === true || summary.envFilePathConfigured === true,
      appliedInMemory: stageDiagnosisSource.appliedInMemory === true || summary.appliedInMemory === true,
      processEnvMutated: stageDiagnosisSource.processEnvMutated === true || summary.processEnvMutated === true,
      selectedEnvVariable: cleanText(stageDiagnosisSource.selectedEnvVariable) || cleanText(summary.selectedEnvVariable),
      selectedEnvVariableLabel: cleanText(stageDiagnosisSource.selectedEnvVariableLabel) || cleanText(summary.selectedEnvVariableLabel),
      selectedSourceKind: cleanText(stageDiagnosisSource.selectedSourceKind) || cleanText(summary.selectedSourceKind),
      fallbackSourceUsed: stageDiagnosisSource.fallbackSourceUsed === true || summary.fallbackSourceUsed === true,
      auditOnlySourceUsed: stageDiagnosisSource.auditOnlySourceUsed === true || summary.auditOnlySourceUsed === true,
      configuredSourceVariableCount:
        Number(stageDiagnosisSource.configuredSourceVariableCount) || Number(summary.configuredSourceVariableCount) || 0,
      ignoredConfiguredFallbackVariableCount:
        Number(stageDiagnosisSource.ignoredConfiguredFallbackVariableCount) ||
        Number(summary.ignoredConfiguredFallbackVariableCount) ||
        0,
      ignoredConfiguredAuditOnlyVariableCount:
        Number(stageDiagnosisSource.ignoredConfiguredAuditOnlyVariableCount) ||
        Number(summary.ignoredConfiguredAuditOnlyVariableCount) ||
        0,
      sourceStatuses: stageDiagnosisSourceStatuses.length ? stageDiagnosisSourceStatuses : summarySourceStatuses,
      pathValueExposed: stageDiagnosisSource.pathValueExposed === true,
      detail: cleanText(stageDiagnosisSource.detail),
      nextAction: cleanText(stageDiagnosisSource.nextAction),
    },
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

export function normalizeV1ProductionEnvFileAuditLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const files = Array.isArray(source.files)
    ? source.files.map(normalizeV1ProductionEnvFileAuditFile).filter((item) => item.label)
    : [];
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(normalizeV1ProductionEnvFileAuditFinding).filter((item) => item.label)
    : [];
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(normalizeV1ProductionEnvFileAuditFinding).filter((item) => item.label)
    : [];
  const blockingCount = Number(summary.blockingCount) || blockingFindings.length;
  const warningCount = Number(summary.warningCount) || warningFindings.length;
  const status = cleanText(source.status) || (source.ready === true ? "passed" : "blocked");
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
            : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "服务端 env 文件安全审计仍未通过",
      auditLabel: cleanText(summary.auditLabel),
      auditStatus: cleanText(summary.auditStatus),
      auditStatusLabel: cleanText(summary.auditStatusLabel),
      envFileCount: Number(summary.envFileCount) || files.length,
      configuredEnvFileCount: Number(summary.configuredEnvFileCount) || 0,
      fileCount: Number(summary.fileCount) || files.length,
      blockingCount,
      blockingLabel: cleanText(summary.blockingLabel) || `${blockingCount} 项`,
      warningCount,
      warningLabel: cleanText(summary.warningLabel) || `${warningCount} 项`,
      passedCount: Number(summary.passedCount) || 0,
      placeholderAssignmentCount: Number(summary.placeholderAssignmentCount) || 0,
      uncommentedAssignmentCount: Number(summary.uncommentedAssignmentCount) || 0,
      sensitiveVariableNameCount: Number(summary.sensitiveVariableNameCount) || 0,
      crossFileDuplicateVariableCount: Number(summary.crossFileDuplicateVariableCount) || 0,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      envFilePathAccepted: summary.envFilePathAccepted === true,
      envFilePathConfigured: summary.envFilePathConfigured === true,
      selectedEnvVariable: cleanText(summary.selectedEnvVariable),
      selectedEnvVariableLabel: cleanText(summary.selectedEnvVariableLabel),
      selectedSourceKind: cleanText(summary.selectedSourceKind),
      fallbackSourceUsed: summary.fallbackSourceUsed === true,
      auditOnlySourceUsed: summary.auditOnlySourceUsed === true,
      configuredSourceVariableCount: Number(summary.configuredSourceVariableCount) || 0,
      ignoredConfiguredFallbackVariableCount: Number(summary.ignoredConfiguredFallbackVariableCount) || 0,
      ignoredConfiguredAuditOnlyVariableCount: Number(summary.ignoredConfiguredAuditOnlyVariableCount) || 0,
      currentRuntime: summary.currentRuntime === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
    },
    files,
    blockingFindings,
    warningFindings,
    serverConfigGuidance: normalizeV1ProductionEnvFileAuditServerConfigGuidance(source.serverConfigGuidance),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

export function normalizeV1ProductionEnvFileAuditServerConfigGuidance(value = {}, defaults = {}) {
  const source = isPlainObject(value) ? value : {};
  const fallbackEnvVariables = normalizeStringList(source.fallbackEnvVariables);
  const defaultFallbackEnvVariables = normalizeStringList(defaults.fallbackEnvVariables);
  const sourceStatuses = Array.isArray(source.sourceStatuses)
    ? source.sourceStatuses.map(normalizeV1ProductionEnvFileAuditConfigSourceStatus).filter((item) => item.envVariable)
    : [];
  return {
    label: cleanText(source.label),
    status: cleanText(source.status) || "not_configured",
    ready: source.ready === true,
    applyEnableEnvVariable: cleanText(source.applyEnableEnvVariable),
    applyEnabled: source.applyEnabled === true,
    primaryEnvVariable: cleanText(source.primaryEnvVariable) || cleanText(defaults.primaryEnvVariable) || "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS",
    fallbackEnvVariables: fallbackEnvVariables.length
      ? fallbackEnvVariables
      : defaultFallbackEnvVariables.length
        ? defaultFallbackEnvVariables
        : ["ERP_V1_PRODUCTION_ENV_FILE", "ERP_V1_ENV_FILE"],
    selectedEnvVariable: cleanText(source.selectedEnvVariable),
    selectedEnvVariableLabel: cleanText(source.selectedEnvVariableLabel),
    selectedSourceKind: cleanText(source.selectedSourceKind) || "none",
    fallbackSourceUsed: source.fallbackSourceUsed === true,
    auditOnlySourceUsed: source.auditOnlySourceUsed === true,
    configuredSourceVariableCount: Number(source.configuredSourceVariableCount) || 0,
    ignoredConfiguredFallbackVariableCount: Number(source.ignoredConfiguredFallbackVariableCount) || 0,
    ignoredConfiguredAuditOnlyVariableCount: Number(source.ignoredConfiguredAuditOnlyVariableCount) || 0,
    sourceStatuses,
    configuredEnvFileCount: Number(source.configuredEnvFileCount) || 0,
    configuredValuesFileCount: Number(source.configuredValuesFileCount) || 0,
    targetSetupStatus: normalizeProductionEnvSetupTargetStatus(source.targetSetupStatus),
    targetSetupReady: source.targetSetupReady === true,
    targetSetupReportAvailable: source.targetSetupReportAvailable === true,
    targetSetupEnvFileCount: Number(source.targetSetupEnvFileCount) || 0,
    targetEnvFileConfigured: source.targetEnvFileConfigured === true,
    targetEnvFilePathExposed: source.targetEnvFilePathExposed === true,
    valuesFileAuditStatus: cleanText(source.valuesFileAuditStatus) || "not_run",
    valuesFileAuditReady: source.valuesFileAuditReady === true,
    valuesFileAuditExecuted: source.valuesFileAuditExecuted === true,
    valuesFileAuditBlockingCount: Number(source.valuesFileAuditBlockingCount) || 0,
    valuesFileAuditWarningCount: Number(source.valuesFileAuditWarningCount) || 0,
    valuesFileAuditPathExposed: source.valuesFileAuditPathExposed === true,
    valuesFileAuditValuesIncluded: source.valuesFileAuditValuesIncluded === true,
    dryRunProofStatus: cleanText(source.dryRunProofStatus) || "missing",
    dryRunProofReady: source.dryRunProofReady === true,
    dryRunProofIncluded: source.dryRunProofIncluded === true,
    dryRunProofStatusLabel: cleanText(source.dryRunProofStatusLabel) || "未生成",
    ...normalizeProductionEnvValuesDryRunProofFreshness(source),
    ...normalizeProductionEnvValuesDryRunProofFingerprint(source),
    dryRunProofMinimumBlockingLabel: cleanText(source.dryRunProofMinimumBlockingLabel),
    dryRunProofMinimumBlockingTargetCount: Number(source.dryRunProofMinimumBlockingTargetCount) || 0,
    dryRunProofMinimumBlockingSatisfiedCount: Number(source.dryRunProofMinimumBlockingSatisfiedCount) || 0,
    dryRunProofMinimumBlockingMissingCount: Number(source.dryRunProofMinimumBlockingMissingCount) || 0,
    dryRunProofNextAction: cleanText(source.dryRunProofNextAction),
    intakeVerificationStatus: cleanText(source.intakeVerificationStatus),
    intakeVerificationReady: source.intakeVerificationReady === true,
    intakeVerificationAvailable: source.intakeVerificationAvailable === true,
    minimumBlockingReady: source.minimumBlockingReady === true,
    minimumBlockingLabel: cleanText(source.minimumBlockingLabel),
    minimumBlockingTargetCount: Number(source.minimumBlockingTargetCount) || 0,
    minimumBlockingSatisfiedCount: Number(source.minimumBlockingSatisfiedCount) || 0,
    minimumBlockingMissingCount: Number(source.minimumBlockingMissingCount) || 0,
    minimumBlockingVariableRowCount: Number(source.minimumBlockingVariableRowCount) || 0,
    minimumBlockingAlternativeGroupCount: Number(source.minimumBlockingAlternativeGroupCount) || 0,
    minimumWarningLabel: cleanText(source.minimumWarningLabel),
    minimumWarningMissingCount: Number(source.minimumWarningMissingCount) || 0,
    fullIntakeConfiguredLabel: cleanText(source.fullIntakeConfiguredLabel),
    acceptsFrontendPath: source.acceptsFrontendPath === true,
    pathValueExposed: source.pathValueExposed === true,
    restartRequired: source.restartRequired !== false,
    currentAuditStatus: cleanText(source.currentAuditStatus),
    steps: normalizeStringList(source.steps),
    verificationActions: normalizeStringList(source.verificationActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

export function normalizeProductionEnvValuesDryRunProofStatus(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const freshness = normalizeProductionEnvValuesDryRunProofFreshness(source);
  return {
    available: source.available === true,
    status: cleanText(source.status) || "missing",
    ready: source.ready === true,
    included: source.included === true,
    statusLabel: cleanText(source.statusLabel) || "未生成",
    label: cleanText(source.label),
    ...freshness,
    valuesFingerprintStatus: cleanText(source.valuesFingerprintStatus) || "not_checked",
    valuesFingerprintStatusLabel: cleanText(source.valuesFingerprintStatusLabel) || "未检查",
    valuesFingerprintCompared: source.valuesFingerprintCompared === true,
    valuesFingerprintIncluded: source.valuesFingerprintIncluded === true,
    valuesFingerprintMatched: source.valuesFingerprintMatched === true,
    valuesFingerprintDigestExposed: source.valuesFingerprintDigestExposed === true,
    valuesFingerprintValuesExposed: source.valuesFingerprintValuesExposed === true,
    valuesFileUnchangedAfterProof: source.valuesFileUnchangedAfterProof === true,
    targetEnvFileUnchangedAfterProof: source.targetEnvFileUnchangedAfterProof === true,
    fileBindingStatus: isPlainObject(source.fileBindingStatus) ? source.fileBindingStatus : {},
    firstStageStatus: cleanText(source.firstStageStatus),
    firstStageLabel: cleanText(source.firstStageLabel),
    minimumBlockingReady: source.minimumBlockingReady === true,
    minimumBlockingLabel: cleanText(source.minimumBlockingLabel),
    minimumBlockingTargetCount: Number(source.minimumBlockingTargetCount) || 0,
    minimumBlockingSatisfiedCount: Number(source.minimumBlockingSatisfiedCount) || 0,
    minimumBlockingMissingCount: Number(source.minimumBlockingMissingCount) || 0,
    envPreflightLabel: cleanText(source.envPreflightLabel),
    intakeLabel: cleanText(source.intakeLabel),
    targetWouldBeWritten: source.targetWouldBeWritten === true,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

export function normalizeProductionEnvValuesDryRunProofFreshness(source = {}, fallback = {}) {
  const normalizedSource = isPlainObject(source) ? source : {};
  const normalizedFallback = isPlainObject(fallback) ? fallback : {};
  const maxAgeRaw = normalizedSource.dryRunProofMaxAgeHours ?? normalizedSource.maxAgeHours ?? normalizedFallback.dryRunProofMaxAgeHours;
  const ageRaw = normalizedSource.dryRunProofAgeHours ?? normalizedSource.ageHours ?? normalizedFallback.dryRunProofAgeHours;
  const remainingRaw =
    normalizedSource.dryRunProofRemainingHours ??
    normalizedSource.remainingHours ??
    normalizedFallback.dryRunProofRemainingHours;
  const maxAgeNumber = Number(maxAgeRaw);
  const ageNumber = Number(ageRaw);
  const remainingNumber =
    remainingRaw === null || remainingRaw === undefined || remainingRaw === "" ? NaN : Number(remainingRaw);
  const freshnessStatus =
    cleanText(normalizedSource.dryRunProofFreshnessStatus || normalizedSource.freshnessStatus) ||
    cleanText(normalizedFallback.dryRunProofFreshnessStatus) ||
    "missing";
  const freshnessLabel =
    cleanText(normalizedSource.dryRunProofFreshnessLabel || normalizedSource.freshnessLabel) ||
    cleanText(normalizedFallback.dryRunProofFreshnessLabel) ||
    "未生成";
  return {
    dryRunProofFresh:
      normalizedSource.dryRunProofFresh === true ||
      normalizedSource.fresh === true ||
      normalizedFallback.dryRunProofFresh === true,
    dryRunProofFreshnessStatus: freshnessStatus,
    dryRunProofFreshnessLabel: freshnessLabel,
    dryRunProofMaxAgeHours: Number.isFinite(maxAgeNumber) ? maxAgeNumber : Number(normalizedFallback.dryRunProofMaxAgeHours) || 0,
    dryRunProofAgeHours: Number.isFinite(ageNumber) ? ageNumber : null,
    dryRunProofExpiresAt: formatDateTimeLabel(
      normalizedSource.dryRunProofExpiresAt ||
        normalizedSource.expiresAt ||
        normalizedFallback.dryRunProofExpiresAt,
    ),
    dryRunProofRemainingHours: Number.isFinite(remainingNumber) ? remainingNumber : null,
    dryRunProofCheckedAtIncluded:
      normalizedSource.dryRunProofCheckedAtIncluded === true ||
      normalizedSource.checkedAtIncluded === true ||
      normalizedFallback.dryRunProofCheckedAtIncluded === true,
    dryRunProofCheckedAt:
      formatDateTimeLabel(
        normalizedSource.dryRunProofCheckedAt ||
          normalizedSource.checkedAt ||
          normalizedSource.dryRunCheckedAt ||
          normalizedFallback.dryRunProofCheckedAt,
      ),
  };
}

export function normalizeProductionEnvValuesDryRunProofFingerprint(source = {}, fallback = {}) {
  const normalizedSource = isPlainObject(source) ? source : {};
  const normalizedFallback = isPlainObject(fallback) ? fallback : {};
  return {
    dryRunProofValuesFingerprintStatus:
      cleanText(normalizedSource.dryRunProofValuesFingerprintStatus || normalizedSource.valuesFingerprintStatus) ||
      cleanText(normalizedFallback.dryRunProofValuesFingerprintStatus) ||
      "not_checked",
    dryRunProofValuesFingerprintStatusLabel:
      cleanText(
        normalizedSource.dryRunProofValuesFingerprintStatusLabel ||
          normalizedSource.valuesFingerprintStatusLabel,
      ) ||
      cleanText(normalizedFallback.dryRunProofValuesFingerprintStatusLabel) ||
      "未检查",
    dryRunProofValuesFingerprintCompared:
      normalizedSource.dryRunProofValuesFingerprintCompared === true ||
      normalizedSource.valuesFingerprintCompared === true ||
      normalizedFallback.dryRunProofValuesFingerprintCompared === true,
    dryRunProofValuesFingerprintIncluded:
      normalizedSource.dryRunProofValuesFingerprintIncluded === true ||
      normalizedSource.valuesFingerprintIncluded === true ||
      normalizedFallback.dryRunProofValuesFingerprintIncluded === true,
    dryRunProofValuesFingerprintMatched:
      normalizedSource.dryRunProofValuesFingerprintMatched === true ||
      normalizedSource.valuesFingerprintMatched === true ||
      normalizedFallback.dryRunProofValuesFingerprintMatched === true,
    dryRunProofValuesFingerprintDigestExposed:
      normalizedSource.dryRunProofValuesFingerprintDigestExposed === true ||
      normalizedFallback.dryRunProofValuesFingerprintDigestExposed === true,
    dryRunProofValuesFingerprintValuesExposed:
      normalizedSource.dryRunProofValuesFingerprintValuesExposed === true ||
      normalizedFallback.dryRunProofValuesFingerprintValuesExposed === true,
    dryRunProofValuesFileUnchangedAfterProof:
      normalizedSource.dryRunProofValuesFileUnchangedAfterProof === true ||
      normalizedSource.valuesFileUnchangedAfterProof === true ||
      normalizedFallback.dryRunProofValuesFileUnchangedAfterProof === true,
    dryRunProofTargetEnvFileUnchangedAfterProof:
      normalizedSource.dryRunProofTargetEnvFileUnchangedAfterProof === true ||
      normalizedSource.targetEnvFileUnchangedAfterProof === true ||
      normalizedFallback.dryRunProofTargetEnvFileUnchangedAfterProof === true,
  };
}


export function normalizeProductionEnvSetupTargetStatus(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const envFileCount = Number(summary.envFileCount) || 0;
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(normalizeProductionFirstStageValuesDryRunBlockingItem).filter((item) => item.label)
    : [];
  return {
    available: source.available === true,
    status: cleanText(source.status) || "not_configured",
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已就绪"
        : cleanText(source.status) === "not_configured"
          ? "未配置"
          : "未就绪",
    summary: {
      label: cleanText(summary.label) || "production env setup 目标 env 未就绪",
      setupReportAvailable: summary.setupReportAvailable === true,
      setupReady: summary.setupReady === true,
      envFileCount,
      targetEnvFileConfigured: summary.targetEnvFileConfigured === true || envFileCount > 0,
      targetEnvFromProductionSetup: summary.targetEnvFromProductionSetup !== false,
      targetEnvFilePathExposed: summary.targetEnvFilePathExposed === true,
    },
    blockingItems,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

export function normalizeV1ProductionEnvSetupLiveRunResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const setup = normalizeProductionEnvSetupReport(source.setup);
  const setupFindings = Array.isArray(source.setupFindings)
    ? source.setupFindings.map(normalizeProductionEnvSetupFinding).filter((item) => item.label)
    : setup.setupFindings;
  const remainingFixItems = Array.isArray(source.remainingFixItems)
    ? source.remainingFixItems.map(normalizeProductionEnvSetupRemainingFixItem).filter((item) => item.label)
    : setup.envPreflight.remainingFixItems;
  const status = cleanText(source.status) || (source.ready === true ? "ready" : setup.status || "blocked");
  const blockingCount = Number(summary.blockingCount) || setupFindings.length;
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "prepared"
          ? "草稿已准备"
          : status === "error"
            ? "执行失败"
            : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "生产 env 安全草稿已准备",
      setupLabel: cleanText(summary.setupLabel) || setup.summary.label,
      setupStatus: cleanText(summary.setupStatus) || setup.status,
      setupReady: summary.setupReady === true || setup.setupReady === true,
      productionReady: summary.productionReady === true || source.ready === true,
      generated: summary.generated === true,
      imported: summary.imported === true,
      overwritten: summary.overwritten === true,
      targetExistedBefore: summary.targetExistedBefore === true,
      auditReady: summary.auditReady === true || setup.audit.ready === true,
      auditStatus: cleanText(summary.auditStatus) || setup.audit.status,
      envPreflightReady: summary.envPreflightReady === true || setup.envPreflight.ready === true,
      envPreflightStatus: cleanText(summary.envPreflightStatus) || setup.envPreflight.status,
      envPreflightLabel: cleanText(summary.envPreflightLabel) || setup.envPreflight.readinessLabel,
      envPreflightPassedCount: Number(summary.envPreflightPassedCount) || setup.envPreflight.passedCount,
      envPreflightTotalCount: Number(summary.envPreflightTotalCount) || setup.envPreflight.totalCount,
      envPreflightBlockingCount: Number(summary.envPreflightBlockingCount) || setup.envPreflight.blockingCount,
      envPreflightWarningCount: Number(summary.envPreflightWarningCount) || setup.envPreflight.warningCount,
      remainingFixItemCount: Number(summary.remainingFixItemCount) || remainingFixItems.length,
      blockingCount,
      blockerLabel: cleanText(summary.blockerLabel) || `${blockingCount} 项`,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      frontendTargetPathAccepted: summary.frontendTargetPathAccepted === true,
      frontendImportPathAccepted: summary.frontendImportPathAccepted === true,
      frontendEnvValuesAccepted: summary.frontendEnvValuesAccepted === true,
      targetEnvFilePathExposed: summary.targetEnvFilePathExposed === true,
      targetEnvFileConfigured: summary.targetEnvFileConfigured === true,
      targetEnvFileWritten: summary.targetEnvFileWritten === true,
      targetEnvFileOverwritten: summary.targetEnvFileOverwritten === true,
      targetEnvDraftMayBeCreated: summary.targetEnvDraftMayBeCreated === true,
      productionEnvRealValuesWritten: summary.productionEnvRealValuesWritten === true,
      setupReportRefreshed: summary.setupReportRefreshed === true,
      productionEnvValuesApplyExecuted: summary.productionEnvValuesApplyExecuted === true,
      businessDataMutated: summary.businessDataMutated === true,
      schemaMigrationApplyExecuted: summary.schemaMigrationApplyExecuted === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      physicalPrinterCalled: summary.physicalPrinterCalled === true,
      driverDeliveryStatusChanged: summary.driverDeliveryStatusChanged === true,
    },
    setup,
    setupFindings,
    remainingFixItems,
    serverConfigGuidance: normalizeProductionEnvSetupServerConfigGuidance(source.serverConfigGuidance),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeProductionEnvSetupReport(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const envFile = isPlainObject(source.envFile) ? source.envFile : {};
  const audit = isPlainObject(source.audit) ? source.audit : {};
  const envPreflight = isPlainObject(source.envPreflight) ? source.envPreflight : {};
  const remainingFixItems = Array.isArray(envPreflight.remainingFixItems)
    ? envPreflight.remainingFixItems.map(normalizeProductionEnvSetupRemainingFixItem).filter((item) => item.label)
    : [];
  const setupFindings = Array.isArray(source.setupFindings)
    ? source.setupFindings.map(normalizeProductionEnvSetupFinding).filter((item) => item.label)
    : [];
  const commands = Array.isArray(source.commands)
    ? source.commands.map((item) => ({
        key: cleanText(item?.key),
        label: cleanText(item?.label),
        command: cleanText(item?.command),
      })).filter((item) => item.label)
    : [];
  return {
    available: source.available === true,
    status: cleanText(source.status) || "missing",
    ready: source.ready === true,
    setupReady: source.setupReady === true,
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "生产 env setup 报告未生成",
      generated: summary.generated === true,
      imported: summary.imported === true,
      overwritten: summary.overwritten === true,
      targetExistedBefore: summary.targetExistedBefore === true,
      setupBlockingCount: Number(summary.setupBlockingCount) || setupFindings.length,
      auditReady: summary.auditReady === true,
      envPreflightReady: summary.envPreflightReady === true,
      envPreflightPassedCount: Number(summary.envPreflightPassedCount) || 0,
      envPreflightTotalCount: Number(summary.envPreflightTotalCount) || 0,
      envPreflightBlockingCount: Number(summary.envPreflightBlockingCount) || 0,
      envPreflightWarningCount: Number(summary.envPreflightWarningCount) || 0,
      envPreflightLabel: cleanText(summary.envPreflightLabel),
      remainingFixItemCount: Number(summary.remainingFixItemCount) || remainingFixItems.length,
    },
    envFile: {
      insideWorkspace: envFile.insideWorkspace === true,
      gitIgnored: envFile.gitIgnored === true,
      gitTracked: envFile.gitTracked === true,
      existedBefore: envFile.existedBefore === true,
      generated: envFile.generated === true,
      imported: envFile.imported === true,
      overwritten: envFile.overwritten === true,
      fileMode: cleanText(envFile.fileMode),
      assignmentCount: Number(envFile.assignmentCount) || 0,
      placeholderAssignmentCount: Number(envFile.placeholderAssignmentCount) || 0,
      pathExposed: envFile.pathExposed === true,
    },
    audit: {
      status: cleanText(audit.status),
      ready: audit.ready === true,
      blockingCount: Number(audit.blockingCount) || 0,
      warningCount: Number(audit.warningCount) || 0,
      crossFileDuplicateVariableCount: Number(audit.crossFileDuplicateVariableCount) || 0,
    },
    envPreflight: {
      status: cleanText(envPreflight.status),
      ready: envPreflight.ready === true,
      passedCount: Number(envPreflight.passedCount) || 0,
      totalCount: Number(envPreflight.totalCount) || 0,
      readinessLabel: cleanText(envPreflight.readinessLabel),
      blockingCount: Number(envPreflight.blockingCount) || 0,
      warningCount: Number(envPreflight.warningCount) || 0,
      remainingFixItems,
    },
    setupFindings,
    commands,
    nextActions: normalizeStringList(source.nextActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeProductionEnvSetupRemainingFixItem(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    ownerRole: cleanText(value?.ownerRole),
    status: cleanText(value?.status) || "pending",
    statusLabel: formatUnblockTaskStatusLabel(cleanText(value?.status) || "pending"),
    missingVariables: normalizeStringList(value?.missingVariables),
    placeholderVariables: normalizeStringList(value?.placeholderVariables),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeProductionEnvSetupFinding(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || "blocked",
    severity: cleanText(value?.severity) || "blocking",
    detail: cleanText(value?.detail),
    nextAction: cleanText(value?.nextAction),
  };
}

function normalizeProductionEnvSetupServerConfigGuidance(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    label: cleanText(source.label),
    status: cleanText(source.status),
    ready: source.ready === true,
    setupReady: source.setupReady === true,
    targetSource: cleanText(source.targetSource),
    templateSource: cleanText(source.templateSource),
    primaryInput: cleanText(source.primaryInput),
    acceptsFrontendTargetPath: source.acceptsFrontendTargetPath === true,
    acceptsFrontendImportPath: source.acceptsFrontendImportPath === true,
    acceptsFrontendEnvValues: source.acceptsFrontendEnvValues === true,
    targetEnvFilePathExposed: source.targetEnvFilePathExposed === true,
    forceOverwriteEnabled: source.forceOverwriteEnabled === true,
    importFromEnabled: source.importFromEnabled === true,
    setupReportRefreshed: source.setupReportRefreshed === true,
    steps: normalizeStringList(source.steps),
    verificationActions: normalizeStringList(source.verificationActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

export function normalizeProductionEnvValuesFragmentSourceStatus(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const serverConfigGuidance = normalizeV1ProductionEnvFileAuditServerConfigGuidance(source.serverConfigGuidance, {
    primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
    fallbackEnvVariables: ["ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE", "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE"],
  });
  const sourceStatuses = Array.isArray(summary.sourceStatuses)
    ? summary.sourceStatuses.map(normalizeV1ProductionEnvFileAuditConfigSourceStatus).filter((item) => item.envVariable)
    : serverConfigGuidance.sourceStatuses;
  const status = cleanText(source.status) || "not_configured";
  const configuredValuesFileCount = Number(summary.configuredValuesFileCount) || 0;
  const targetSetupStatus = normalizeProductionEnvSetupTargetStatus(source.targetSetupStatus);
  return {
    available: source.available === true,
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已配置"
        : status === "multiple_configured"
          ? "来源不唯一"
          : status === "audit_blocked"
            ? "审计未过"
          : status === "target_not_ready"
            ? "目标 env 未就绪"
            : status === "dry_run_not_ready"
              ? "dry-run 未通过"
              : "未配置",
    summary: {
      label: cleanText(summary.label) || "服务端真实值片段来源未配置",
      configuredValuesFileCount,
      valuesFilePathConfigured: summary.valuesFilePathConfigured === true,
      selectedEnvVariable: cleanText(summary.selectedEnvVariable),
      selectedEnvVariableLabel: cleanText(summary.selectedEnvVariableLabel),
      selectedSourceKind: cleanText(summary.selectedSourceKind) || "none",
      fallbackSourceUsed: summary.fallbackSourceUsed === true,
      configuredSourceVariableCount: Number(summary.configuredSourceVariableCount) || 0,
      sourceStatuses,
      primaryEnvVariable: cleanText(summary.primaryEnvVariable) || serverConfigGuidance.primaryEnvVariable,
      fallbackEnvVariables: normalizeStringList(summary.fallbackEnvVariables).length
        ? normalizeStringList(summary.fallbackEnvVariables)
        : serverConfigGuidance.fallbackEnvVariables,
      acceptsFrontendPath: summary.acceptsFrontendPath === true,
      pathValueExposed: summary.pathValueExposed === true,
      restartRequired: summary.restartRequired !== false,
      dryRunExecuted: summary.dryRunExecuted === true,
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
      intakeVerificationStatus: cleanText(summary.intakeVerificationStatus),
      intakeVerificationReady: summary.intakeVerificationReady === true,
      intakeVerificationAvailable: summary.intakeVerificationAvailable === true,
      minimumBlockingReady: summary.minimumBlockingReady === true,
      minimumBlockingLabel: cleanText(summary.minimumBlockingLabel) || serverConfigGuidance.minimumBlockingLabel,
      minimumBlockingTargetCount: Number(summary.minimumBlockingTargetCount) || serverConfigGuidance.minimumBlockingTargetCount,
      minimumBlockingSatisfiedCount:
        Number(summary.minimumBlockingSatisfiedCount) || serverConfigGuidance.minimumBlockingSatisfiedCount,
      minimumBlockingMissingCount:
        Number(summary.minimumBlockingMissingCount) || serverConfigGuidance.minimumBlockingMissingCount,
      minimumBlockingVariableRowCount:
        Number(summary.minimumBlockingVariableRowCount) || serverConfigGuidance.minimumBlockingVariableRowCount,
      minimumBlockingAlternativeGroupCount:
        Number(summary.minimumBlockingAlternativeGroupCount) || serverConfigGuidance.minimumBlockingAlternativeGroupCount,
      minimumWarningLabel: cleanText(summary.minimumWarningLabel) || serverConfigGuidance.minimumWarningLabel,
      minimumWarningMissingCount:
        Number(summary.minimumWarningMissingCount) || serverConfigGuidance.minimumWarningMissingCount,
      fullIntakeConfiguredLabel: cleanText(summary.fullIntakeConfiguredLabel) || serverConfigGuidance.fullIntakeConfiguredLabel,
      productionEnvFileMutated: summary.productionEnvFileMutated === true,
      businessDataMutated: summary.businessDataMutated === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
    },
    targetSetupStatus,
    serverConfigGuidance,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

export function normalizeProductionEnvValuesApplyGateStatus(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const serverConfigGuidance = normalizeV1ProductionEnvFileAuditServerConfigGuidance(source.serverConfigGuidance, {
    primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
    fallbackEnvVariables: ["ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE", "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE"],
  });
  const sourceStatuses = Array.isArray(summary.sourceStatuses)
    ? summary.sourceStatuses.map(normalizeV1ProductionEnvFileAuditConfigSourceStatus).filter((item) => item.envVariable)
    : serverConfigGuidance.sourceStatuses;
  const status = cleanText(source.status) || "disabled";
  const configuredValuesFileCount = Number(summary.configuredValuesFileCount) || 0;
  const targetSetupStatus = normalizeProductionEnvSetupTargetStatus(source.targetSetupStatus);
  return {
    available: source.available === true,
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "可合并"
        : status === "disabled"
          ? "未启用"
          : status === "multiple_configured"
            ? "来源不唯一"
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
              : "未配置",
    summary: {
      label: cleanText(summary.label) || "正式合并开关未启用",
      applyEnabled: summary.applyEnabled === true,
      applyEnableEnvVariable: cleanText(summary.applyEnableEnvVariable) || "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED",
      configuredValuesFileCount,
      valuesFilePathConfigured: summary.valuesFilePathConfigured === true,
      selectedEnvVariable: cleanText(summary.selectedEnvVariable),
      selectedEnvVariableLabel: cleanText(summary.selectedEnvVariableLabel),
      selectedSourceKind: cleanText(summary.selectedSourceKind) || "none",
      fallbackSourceUsed: summary.fallbackSourceUsed === true,
      configuredSourceVariableCount: Number(summary.configuredSourceVariableCount) || 0,
      sourceStatuses,
      primaryEnvVariable: cleanText(summary.primaryEnvVariable) || serverConfigGuidance.primaryEnvVariable,
      fallbackEnvVariables: normalizeStringList(summary.fallbackEnvVariables).length
        ? normalizeStringList(summary.fallbackEnvVariables)
        : serverConfigGuidance.fallbackEnvVariables,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      acceptsFrontendPath: summary.acceptsFrontendPath === true,
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
      intakeVerificationStatus: cleanText(summary.intakeVerificationStatus),
      intakeVerificationReady: summary.intakeVerificationReady === true,
      intakeVerificationAvailable: summary.intakeVerificationAvailable === true,
      minimumBlockingReady: summary.minimumBlockingReady === true,
      minimumBlockingLabel: cleanText(summary.minimumBlockingLabel) || serverConfigGuidance.minimumBlockingLabel,
      minimumBlockingTargetCount: Number(summary.minimumBlockingTargetCount) || serverConfigGuidance.minimumBlockingTargetCount,
      minimumBlockingSatisfiedCount:
        Number(summary.minimumBlockingSatisfiedCount) || serverConfigGuidance.minimumBlockingSatisfiedCount,
      minimumBlockingMissingCount:
        Number(summary.minimumBlockingMissingCount) || serverConfigGuidance.minimumBlockingMissingCount,
      minimumBlockingVariableRowCount:
        Number(summary.minimumBlockingVariableRowCount) || serverConfigGuidance.minimumBlockingVariableRowCount,
      minimumBlockingAlternativeGroupCount:
        Number(summary.minimumBlockingAlternativeGroupCount) || serverConfigGuidance.minimumBlockingAlternativeGroupCount,
      minimumWarningLabel: cleanText(summary.minimumWarningLabel) || serverConfigGuidance.minimumWarningLabel,
      minimumWarningMissingCount:
        Number(summary.minimumWarningMissingCount) || serverConfigGuidance.minimumWarningMissingCount,
      fullIntakeConfiguredLabel: cleanText(summary.fullIntakeConfiguredLabel) || serverConfigGuidance.fullIntakeConfiguredLabel,
      targetEnvFileMayBeMutated: summary.targetEnvFileMayBeMutated === true,
      applyExecuted: summary.applyExecuted === true,
      productionEnvFileMutated: summary.productionEnvFileMutated === true,
      businessDataMutated: summary.businessDataMutated === true,
      schemaMigrationApplyExecuted: summary.schemaMigrationApplyExecuted === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
    },
    targetSetupStatus,
    serverConfigGuidance,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvFileAuditFile(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    insideWorkspace: value?.insideWorkspace === true,
    outsideWorkspace: value?.outsideWorkspace === true,
    gitTracked: value?.gitTracked === true,
    gitIgnored: value?.gitIgnored === true,
    fileMode: cleanText(value?.fileMode),
    uncommentedAssignmentCount: Number(value?.uncommentedAssignmentCount) || 0,
    placeholderAssignmentCount: Number(value?.placeholderAssignmentCount) || 0,
    duplicateVariableCount: Number(value?.duplicateVariableCount) || 0,
    sensitiveVariableNameCount: Number(value?.sensitiveVariableNameCount) || 0,
    variableCount: Number(value?.variableCount) || 0,
  };
}

function normalizeV1ProductionEnvFileAuditFinding(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || "blocked",
    severity: cleanText(value?.severity) || "blocking",
    detail: cleanText(value?.detail),
    variables: normalizeStringList(value?.variables),
    variableLabel: cleanText(value?.variableLabel),
    nextAction: cleanText(value?.nextAction),
  };
}

export function normalizeProductionEnvIntakeVerification(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const alternativeGroups = Array.isArray(source.alternativeGroups)
    ? source.alternativeGroups.map(normalizeProductionEnvIntakeFinding).filter((item) => item.label)
    : [];
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(normalizeProductionEnvIntakeFinding).filter((item) => item.label)
    : [];
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(normalizeProductionEnvIntakeFinding).filter((item) => item.label)
    : [];
  const minimumBlockingItems = Array.isArray(source.minimumBlockingItems)
    ? source.minimumBlockingItems.map(normalizeProductionEnvIntakeFinding).filter((item) => item.label)
    : blockingFindings.filter((item) =>
      item.severity === "blocking" &&
      (item.type === "alternative_group" || item.type === "variable_row")
    );
  const intakeRowCount = Number(summary.intakeRowCount) || 0;
  const configuredRowCount = Number(summary.configuredRowCount) || 0;
  const missingRowCount = Number(summary.missingRowCount) || Math.max(0, intakeRowCount - configuredRowCount);
  const blockingCount = Number(summary.blockingCount) || blockingFindings.length;
  const warningCount = Number(summary.warningCount) || warningFindings.length;
  const minimumBlockingTargetCount = Number(summary.minimumBlockingTargetCount) || 0;
  const minimumBlockingSatisfiedCount = Number(summary.minimumBlockingSatisfiedCount) || 0;
  const minimumWarningTargetCount = Number(summary.minimumWarningTargetCount) || 0;
  const minimumWarningSatisfiedCount = Number(summary.minimumWarningSatisfiedCount) || 0;
  const status = cleanText(source.status) || "missing";
  const available = source.available === true || status !== "missing" || Boolean(cleanText(summary.label));
  return {
    status,
    statusLabel: source.ready === true
      ? "已通过"
      : !available
        ? "未生成"
        : status === "blocked"
          ? "阻塞"
          : status === "warning"
            ? "提醒"
            : status,
    ready: source.ready === true,
    available,
    checkedAt: cleanText(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (available ? "生产 env 真实值校验待复核" : "生产 env 真实值校验未生成"),
      envFileCount: Number(summary.envFileCount) || 0,
      envFilePathIncluded: summary.envFilePathIncluded === true,
      intakeCsvPathIncluded: summary.intakeCsvPathIncluded === true,
      intakeRowCount,
      configuredRowCount,
      missingRowCount,
      configuredLabel: cleanText(summary.configuredLabel) || `${configuredRowCount}/${intakeRowCount}`,
      fullIntakeConfiguredLabel: cleanText(summary.fullIntakeConfiguredLabel) || `${configuredRowCount}/${intakeRowCount}`,
      alternativeGroupCount: Number(summary.alternativeGroupCount) || alternativeGroups.length,
      alternativeGroupBlockingCount: Number(summary.alternativeGroupBlockingCount) || 0,
      alternativeGroupWarningCount: Number(summary.alternativeGroupWarningCount) || 0,
      minimumBlockingTargetCount,
      minimumBlockingSatisfiedCount,
      minimumBlockingMissingCount: Number(summary.minimumBlockingMissingCount) || Math.max(0, minimumBlockingTargetCount - minimumBlockingSatisfiedCount),
      minimumBlockingVariableRowCount: Number(summary.minimumBlockingVariableRowCount) || 0,
      minimumBlockingAlternativeGroupCount: Number(summary.minimumBlockingAlternativeGroupCount) || 0,
      minimumBlockingLabel: cleanText(summary.minimumBlockingLabel) || `${minimumBlockingSatisfiedCount}/${minimumBlockingTargetCount}`,
      minimumWarningTargetCount,
      minimumWarningSatisfiedCount,
      minimumWarningMissingCount: Number(summary.minimumWarningMissingCount) || Math.max(0, minimumWarningTargetCount - minimumWarningSatisfiedCount),
      minimumWarningVariableRowCount: Number(summary.minimumWarningVariableRowCount) || 0,
      minimumWarningAlternativeGroupCount: Number(summary.minimumWarningAlternativeGroupCount) || 0,
      minimumWarningLabel: cleanText(summary.minimumWarningLabel) || `${minimumWarningSatisfiedCount}/${minimumWarningTargetCount}`,
      passedRowCount: Number(summary.passedRowCount) || 0,
      blockingCount,
      warningCount,
      blockingLabel: cleanText(summary.blockingLabel) || `${blockingCount} 项`,
      warningLabel: cleanText(summary.warningLabel) || `${warningCount} 项`,
      auditReady: summary.auditReady === true,
      intakeCsvReady: summary.intakeCsvReady === true,
      minimumBlockingItemCount: Number(summary.minimumBlockingItemCount) || minimumBlockingItems.length,
    },
    minimumBlockingItems,
    alternativeGroups,
    blockingFindings,
    warningFindings,
    nextActions: normalizeStringList(source.nextActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

export function normalizeV1ProductionEnvIntakeLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const verification = normalizeProductionEnvIntakeVerification(source.verification);
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(normalizeProductionFirstStageValuesDryRunBlockingItem).filter((item) => item.label)
    : [];
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(normalizeProductionEnvIntakeFinding).filter((item) => item.label)
    : verification.blockingFindings;
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(normalizeProductionEnvIntakeFinding).filter((item) => item.label)
    : verification.warningFindings;
  const minimumBlockingItems = Array.isArray(source.minimumBlockingItems)
    ? source.minimumBlockingItems.map(normalizeProductionEnvIntakeFinding).filter((item) => item.label)
    : verification.minimumBlockingItems;
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  const blockingCount = Number(summary.blockingCount) || blockingItems.length + blockingFindings.length;
  const warningCount = Number(summary.warningCount) || warningFindings.length;
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
            ? "校验失败"
            : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || "生产 env 真实值校验仍有阻塞",
      verificationLabel: cleanText(summary.verificationLabel) || verification.summary.label,
      verificationStatus: cleanText(summary.verificationStatus) || verification.status,
      configuredLabel: cleanText(summary.configuredLabel) || verification.summary.configuredLabel,
      fullIntakeConfiguredLabel: cleanText(summary.fullIntakeConfiguredLabel) || verification.summary.fullIntakeConfiguredLabel,
      intakeRowCount: Number(summary.intakeRowCount) || verification.summary.intakeRowCount,
      configuredRowCount: Number(summary.configuredRowCount) || verification.summary.configuredRowCount,
      missingRowCount: Number(summary.missingRowCount) || verification.summary.missingRowCount,
      minimumBlockingLabel: cleanText(summary.minimumBlockingLabel) || verification.summary.minimumBlockingLabel,
      minimumWarningLabel: cleanText(summary.minimumWarningLabel) || verification.summary.minimumWarningLabel,
      minimumBlockingMissingCount:
        Number(summary.minimumBlockingMissingCount) || verification.summary.minimumBlockingMissingCount,
      minimumWarningMissingCount: Number(summary.minimumWarningMissingCount) || verification.summary.minimumWarningMissingCount,
      blockingCount,
      warningCount,
      blockerLabel: cleanText(summary.blockerLabel) || `${blockingCount} 项`,
      warningLabel: cleanText(summary.warningLabel) || `${warningCount} 项`,
      auditReady: summary.auditReady === true || verification.summary.auditReady === true,
      intakeCsvReady: summary.intakeCsvReady === true || verification.summary.intakeCsvReady === true,
      setupReportAvailable: summary.setupReportAvailable === true,
      setupReady: summary.setupReady === true,
      envFileFromProductionSetup: summary.envFileFromProductionSetup === true,
      envFileCount: Number(summary.envFileCount) || 0,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      envFilePathAccepted: summary.envFilePathAccepted === true,
      envFilePathExposed: summary.envFilePathExposed === true,
      intakeCsvPathExposed: summary.intakeCsvPathExposed === true,
      productionEnvFileMutated: summary.productionEnvFileMutated === true,
      productionEnvValuesApplyExecuted: summary.productionEnvValuesApplyExecuted === true,
      businessDataMutated: summary.businessDataMutated === true,
      schemaMigrationApplyExecuted: summary.schemaMigrationApplyExecuted === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      physicalPrinterCalled: summary.physicalPrinterCalled === true,
      driverDeliveryStatusChanged: summary.driverDeliveryStatusChanged === true,
    },
    verification,
    blockingItems,
    minimumBlockingItems,
    blockingFindings,
    warningFindings,
    serverConfigGuidance: normalizeV1ProductionEnvIntakeServerConfigGuidance(source.serverConfigGuidance),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionEnvIntakeServerConfigGuidance(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    label: cleanText(source.label),
    status: cleanText(source.status),
    ready: source.ready === true,
    envFileSource: cleanText(source.envFileSource),
    intakeCsvSource: cleanText(source.intakeCsvSource),
    primaryInput: cleanText(source.primaryInput),
    acceptsFrontendPath: source.acceptsFrontendPath === true,
    pathValueExposed: source.pathValueExposed === true,
    restartRequired: source.restartRequired === true,
    setupReportAvailable: source.setupReportAvailable === true,
    setupReady: source.setupReady === true,
    envFileCount: Number(source.envFileCount) || 0,
    steps: normalizeStringList(source.steps),
    verificationActions: normalizeStringList(source.verificationActions),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

export function normalizeProductionFirstStageValuesDryRunBlockingItem(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || "blocked",
    statusLabel: formatUnblockTaskStatusLabel(cleanText(value?.status) || "blocked"),
    detail: cleanText(value?.detail),
    nextAction: cleanText(value?.nextAction),
  };
}

export function normalizeProductionEnvIntakeFinding(value = {}) {
  const variables = normalizeStringList(value?.variables);
  return {
    type: cleanText(value?.type),
    key: cleanText(value?.key),
    itemKey: cleanText(value?.itemKey),
    label: cleanText(value?.label),
    ownerRole: cleanText(value?.ownerRole),
    severity: cleanText(value?.severity) || "warning",
    status: cleanText(value?.status),
    variableKey: cleanText(value?.variableKey),
    alternativeGroup: cleanText(value?.alternativeGroup),
    variables,
    configuredKeyCount: Number(value?.configuredKeyCount) || 0,
    sourceSystem: cleanText(value?.sourceSystem),
    expectedValueType: cleanText(value?.expectedValueType),
    configured: value?.configured === true,
    safeLiteralRequired: value?.safeLiteralRequired === true,
    safeLiteralMatches: value?.safeLiteralMatches !== false,
    filledMarked: value?.filledMarked === true,
    verifiedMarked: value?.verifiedMarked === true,
    evidenceProvided: value?.evidenceProvided === true,
    rawProofRefIncluded: value?.rawProofRefIncluded === true,
    detail: cleanText(value?.detail),
    nextAction: cleanText(value?.nextAction),
    variableLabel: cleanText(value?.variableKey) || variables.join(" / ") || cleanText(value?.alternativeGroup),
  };
}
