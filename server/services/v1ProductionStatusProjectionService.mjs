import { sanitizeV1RoleTaskActionText } from "./v1StatusTextSanitizer.mjs";

export function sanitizeV1ProductionEnvGate(envPreflight = {}, envFileAudit = {}, fallbackFixChecklist = []) {
  const preflight = isPlainServerObject(envPreflight) ? envPreflight : {};
  const preflightSummary = isPlainServerObject(preflight.summary) ? preflight.summary : {};
  const checksSource = Array.isArray(preflight.fixChecklist) && preflight.fixChecklist.length
    ? preflight.fixChecklist
    : fallbackFixChecklist;
  const checks = Array.isArray(checksSource)
    ? checksSource.map(sanitizeV1ProductionEnvFixItem).filter(Boolean)
    : [];
  const passedCount = normalizeV1NonNegativeInteger(
    preflightSummary.passedCount,
    checks.filter((item) => item.ready || item.status === "passed").length,
  );
  const totalCount = normalizeV1NonNegativeInteger(preflightSummary.totalCount, checks.length);
  const blockingCount = normalizeV1NonNegativeInteger(
    preflightSummary.blockingCount,
    checks.filter((item) => item.severity === "blocking" && !item.ready).length,
  );
  const warningCount = normalizeV1NonNegativeInteger(
    preflightSummary.warningCount,
    checks.filter((item) => item.severity === "warning" && !item.ready).length,
  );
  const placeholderValueCount = normalizeV1NonNegativeInteger(preflightSummary.placeholderValueCount);
  const audit = sanitizeV1ProductionEnvFileAudit(envFileAudit);
  const rawStatus = cleanServerText(preflight.status);
  const status = ["blocked", "warning", "passed", "ready"].includes(rawStatus)
    ? (rawStatus === "ready" ? "passed" : rawStatus)
    : blockingCount > 0
      ? "blocked"
      : warningCount > 0
        ? "warning"
        : "passed";
  const readinessLabel = totalCount ? `${passedCount}/${totalCount}` : cleanServerText(preflightSummary.label);
  const nextActions = sanitizeStringList(preflight.nextActions).slice(0, 6);

  return {
    status,
    ready: Boolean(preflight.ready === true && blockingCount === 0 && status === "passed"),
    available: Object.keys(preflight).length > 0 || checks.length > 0 || audit.available,
    checkedAt: cleanServerText(preflight.checkedAt || envFileAudit?.checkedAt),
    summary: {
      label: totalCount
        ? `生产配置门禁：${readinessLabel} 通过，${blockingCount} 项阻塞`
        : "生产配置门禁未生成",
      readinessLabel,
      passedCount,
      totalCount,
      blockingCount,
      warningCount,
      placeholderValueCount,
      envFileCount: audit.envFileCount,
      auditStatus: audit.status,
      auditLabel: audit.statusLabel,
    },
    checks,
    audit,
    nextActions,
    nextAction: nextActions[0] || "先补齐生产 env 文件，再重新跑 env 文件审计和生产环境变量预检。",
    safeguards: {
      nonMutating: true,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      rawEnvFileIncluded: false,
      rawEnvFileAuditIncluded: false,
      rawProductionEnvPreflightIncluded: false,
      rawLineContentIncluded: false,
      envFilePathExposed: false,
      artifactPathExposed: false,
    },
  };
}

export function sanitizeV1ProductionEnvSetupReport(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const validScope = cleanServerText(source.scope) === "v1_production_env_setup";
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const envFile = isPlainServerObject(source.envFile) ? source.envFile : {};
  const audit = isPlainServerObject(source.audit) ? source.audit : {};
  const envPreflight = isPlainServerObject(source.envPreflight) ? source.envPreflight : {};
  const remainingFixItems = Array.isArray(envPreflight.remainingFixItems)
    ? envPreflight.remainingFixItems.map(sanitizeV1ProductionEnvSetupRemainingFixItem).filter(Boolean).slice(0, 10)
    : [];
  const setupFindings = Array.isArray(source.setupFindings)
    ? source.setupFindings.map(sanitizeV1ProductionEnvSetupFinding).filter(Boolean).slice(0, 8)
    : [];
  const commands = Array.isArray(source.commands)
    ? source.commands.map(sanitizeV1ProductionEnvSetupCommand).filter(Boolean).slice(0, 10)
    : [];
  const envPreflightPassedCount = normalizeV1NonNegativeInteger(summary.envPreflightPassedCount ?? envPreflight.passedCount);
  const envPreflightTotalCount = normalizeV1NonNegativeInteger(summary.envPreflightTotalCount ?? envPreflight.totalCount);
  const envPreflightBlockingCount = normalizeV1NonNegativeInteger(summary.envPreflightBlockingCount ?? envPreflight.blockingCount);
  const envPreflightWarningCount = normalizeV1NonNegativeInteger(summary.envPreflightWarningCount ?? envPreflight.warningCount);
  const remainingFixItemCount = normalizeV1NonNegativeInteger(summary.remainingFixItemCount, remainingFixItems.length);
  const status = validScope
    ? cleanServerText(source.status) || (source.ready === true ? "ready" : source.setupReady === true ? "prepared" : "blocked")
    : "missing";
  const available = validScope && (Object.keys(summary).length > 0 || Object.keys(envFile).length > 0);
  const setupReady = validScope && source.setupReady === true;
  const ready = validScope && source.ready === true;
  return {
    status,
    ready,
    setupReady,
    available,
    checkedAt: cleanServerText(source.checkedAt),
    summary: {
      label: available
        ? sanitizeProductionStatusText(summary.label) ||
          (ready ? "生产 env 文件已通过安全审计和变量预检" : "生产 env 安全草稿已准备")
        : "生产 env setup 报告未生成",
      generated: summary.generated === true,
      imported: summary.imported === true,
      overwritten: summary.overwritten === true,
      targetExistedBefore: summary.targetExistedBefore === true,
      setupBlockingCount: normalizeV1NonNegativeInteger(summary.setupBlockingCount, setupFindings.length),
      auditReady: summary.auditReady === true || audit.ready === true,
      envPreflightReady: summary.envPreflightReady === true || envPreflight.ready === true,
      envPreflightPassedCount,
      envPreflightTotalCount,
      envPreflightBlockingCount,
      envPreflightWarningCount,
      envPreflightLabel: envPreflightTotalCount ? `${envPreflightPassedCount}/${envPreflightTotalCount}` : "",
      remainingFixItemCount,
    },
    envFile: {
      insideWorkspace: envFile.insideWorkspace === true,
      gitIgnored: envFile.gitIgnored === true,
      gitTracked: envFile.gitTracked === true,
      existedBefore: envFile.existedBefore === true,
      generated: envFile.generated === true,
      imported: envFile.imported === true,
      overwritten: envFile.overwritten === true,
      fileMode: cleanServerText(envFile.fileMode),
      assignmentCount: normalizeV1NonNegativeInteger(envFile.assignmentCount),
      placeholderAssignmentCount: normalizeV1NonNegativeInteger(envFile.placeholderAssignmentCount),
      pathExposed: false,
    },
    audit: {
      status: cleanServerText(audit.status) || "not_run",
      ready: audit.ready === true,
      blockingCount: normalizeV1NonNegativeInteger(audit.blockingCount),
      warningCount: normalizeV1NonNegativeInteger(audit.warningCount),
      crossFileDuplicateVariableCount: normalizeV1NonNegativeInteger(audit.crossFileDuplicateVariableCount),
    },
    envPreflight: {
      status: cleanServerText(envPreflight.status) || (remainingFixItemCount ? "blocked" : "not_run"),
      ready: envPreflight.ready === true,
      passedCount: envPreflightPassedCount,
      totalCount: envPreflightTotalCount,
      readinessLabel: envPreflightTotalCount ? `${envPreflightPassedCount}/${envPreflightTotalCount}` : "",
      blockingCount: envPreflightBlockingCount,
      warningCount: envPreflightWarningCount,
      remainingFixItems,
    },
    setupFindings,
    commands,
    nextActions: sanitizeStringList(source.nextActions).slice(0, 8),
    safeguards: {
      envValuesExposed: false,
      connectionStringExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      spoolPathExposed: false,
      rawTemplateValuesCopied: false,
      importedEnvValuesExposed: false,
      envValueIntakeRealValuesExposed: false,
      productionEnvValueIntakeChecklistIncluded: source.safeguards?.productionEnvValueIntakeChecklistIncluded === true,
      productionEnvMinimumValuesFragmentTemplateIncluded: source.safeguards?.productionEnvMinimumValuesFragmentTemplateIncluded === true,
      productionEnvMinimumValuesFragmentTemplateRealValuesExposed: false,
      productionEnvValuesFragmentTemplateIncluded: source.safeguards?.productionEnvValuesFragmentTemplateIncluded === true,
      productionEnvValuesFragmentTemplateRealValuesExposed: false,
      generatedFileMode0600: source.safeguards?.generatedFileMode0600 === true || cleanServerText(envFile.fileMode) === "600",
      targetMustBeIgnoredOrOutsideWorkspace: true,
      envFilePathExposed: false,
      importSourcePathExposed: false,
      rawReportIncluded: false,
    },
  };
}

function sanitizeV1ProductionEnvSetupRemainingFixItem(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const key = cleanServerText(source.key);
  const label = sanitizeProductionStatusText(source.label);
  if (!key && !label) return null;
  return {
    key,
    label: label || key,
    ownerRole: sanitizeProductionStatusText(source.ownerRole),
    status: cleanServerText(source.status) || "pending",
    missingVariables: sanitizeStringList(source.missingVariables).slice(0, 12),
    placeholderVariables: sanitizeStringList(source.placeholderVariables).slice(0, 12),
    nextAction: sanitizeProductionStatusText(source.nextAction),
  };
}

export function sanitizeV1ProductionEnvSetupFinding(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const key = cleanServerText(source.key);
  const label = sanitizeProductionStatusText(source.label);
  if (!key && !label) return null;
  return {
    key,
    label: label || key,
    status: cleanServerText(source.status) || "blocked",
    severity: cleanServerText(source.severity || source.status) || "blocking",
    detail: sanitizeProductionStatusText(source.detail),
    nextAction: sanitizeProductionStatusText(source.nextAction),
  };
}

function sanitizeV1ProductionEnvSetupCommand(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const key = cleanServerText(source.key);
  const label = sanitizeProductionStatusText(source.label);
  if (!key && !label) return null;
  const command = sanitizeV1ProductionEnvSetupCommandText(source.command);
  return {
    key,
    label: label || key,
    command,
  };
}

function sanitizeV1ProductionEnvSetupCommandText(value) {
  const text = cleanServerText(value);
  if (!text) return "";
  return sanitizeProductionStatusText(text)
    .replace(/(?:\/Users|\/private|\/var|\/tmp)[^\s'"]+/g, "<server-path>")
    .replace(/\.erp-local-storage\/[^\s'"]+/g, "<server-artifact>")
    .replace(/secure-prod\.env/g, "<secure-env-file>");
}

export function sanitizeV1ProductionEnvFileAudit(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const included = Boolean(source.included);
  const status = cleanServerText(source.status) || (included ? "missing" : "not_applicable");
  const ready = Boolean(source.ready);
  const envFileCount = normalizeV1NonNegativeInteger(source.envFileCount ?? summary.fileCount);
  const blockingCount = normalizeV1NonNegativeInteger(summary.blockingCount);
  const warningCount = normalizeV1NonNegativeInteger(summary.warningCount);
  const statusLabel = !included && status === "not_applicable"
    ? "未执行"
    : ready && blockingCount === 0
      ? "已通过"
      : blockingCount > 0
        ? "阻塞"
        : warningCount > 0
          ? "警告"
          : sanitizeProductionStatusText(summary.label) || status;
  return {
    status,
    statusLabel,
    ready,
    included,
    available: Object.keys(source).length > 0,
    envFileCount,
    summary: {
      label: sanitizeProductionStatusText(summary.label) || (included ? "env 文件安全审计未生成" : "未提供 --env-file，未执行 env 文件安全审计"),
      fileCount: normalizeV1NonNegativeInteger(summary.fileCount, envFileCount),
      blockingCount,
      warningCount,
      passedCount: normalizeV1NonNegativeInteger(summary.passedCount),
      placeholderAssignmentCount: normalizeV1NonNegativeInteger(summary.placeholderAssignmentCount),
      uncommentedAssignmentCount: normalizeV1NonNegativeInteger(summary.uncommentedAssignmentCount),
      sensitiveVariableNameCount: normalizeV1NonNegativeInteger(summary.sensitiveVariableNameCount),
      crossFileDuplicateVariableCount: normalizeV1NonNegativeInteger(summary.crossFileDuplicateVariableCount),
    },
    nextActions: sanitizeStringList(source.nextActions).slice(0, 4),
    safeguards: {
      nonMutating: true,
      envValuesIncluded: false,
      connectionStringExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      commentsCopied: false,
      rawLineContentCopied: false,
      envFilePathExposed: false,
    },
  };
}

export function sanitizeV1ProductionEnvIntakeVerification(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const allowedScopes = new Set([
    "v1_production_env_real_value_intake_verification",
    "v1_production_env_intake_verify",
  ]);
  const validScope = allowedScopes.has(cleanServerText(source.scope));
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(sanitizeV1ProductionEnvIntakeFinding).filter(Boolean)
    : [];
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(sanitizeV1ProductionEnvIntakeFinding).filter(Boolean)
    : [];
  const alternativeGroups = Array.isArray(source.alternativeGroups)
    ? source.alternativeGroups.map(sanitizeV1ProductionEnvIntakeFinding).filter(Boolean)
    : [];
  const intakeRowCount = normalizeV1NonNegativeInteger(summary.intakeRowCount);
  const configuredRowCount = normalizeV1NonNegativeInteger(summary.configuredRowCount);
  const missingRowCount = normalizeV1NonNegativeInteger(
    summary.missingRowCount,
    Math.max(0, intakeRowCount - configuredRowCount),
  );
  const blockingCount = normalizeV1NonNegativeInteger(summary.blockingCount, blockingFindings.length);
  const warningCount = normalizeV1NonNegativeInteger(summary.warningCount, warningFindings.length);
  const minimumBlockingTargetCount = normalizeV1NonNegativeInteger(summary.minimumBlockingTargetCount);
  const minimumBlockingSatisfiedCount = normalizeV1NonNegativeInteger(summary.minimumBlockingSatisfiedCount);
  const minimumWarningTargetCount = normalizeV1NonNegativeInteger(summary.minimumWarningTargetCount);
  const minimumWarningSatisfiedCount = normalizeV1NonNegativeInteger(summary.minimumWarningSatisfiedCount);
  const status = validScope
    ? cleanServerText(source.status) || (blockingCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "passed")
    : "missing";
  const ready = validScope && source.ready === true && blockingCount === 0;
  const available = validScope && (Object.keys(summary).length > 0 || blockingFindings.length > 0 || warningFindings.length > 0);
  const minimumBlockingItems = blockingFindings
    .filter((item) =>
      item.severity === "blocking" &&
      (item.type === "alternative_group" || item.type === "variable_row")
    )
    .slice(0, minimumBlockingTargetCount || 12);

  return {
    status,
    ready,
    available,
    checkedAt: cleanServerText(source.checkedAt),
    summary: {
      label: available
        ? sanitizeProductionStatusText(summary.label) ||
          `${blockingCount} 项真实值 intake / env 校验${blockingCount > 0 ? "阻塞" : warningCount > 0 ? "提醒" : "通过"}`
        : "生产 env 真实值校验未生成",
      envFileCount: normalizeV1NonNegativeInteger(summary.envFileCount),
      envFilePathIncluded: false,
      intakeCsvPathIncluded: false,
      intakeRowCount,
      configuredRowCount,
      missingRowCount,
      configuredLabel: cleanServerText(summary.configuredLabel) || `${configuredRowCount}/${intakeRowCount}`,
      fullIntakeConfiguredLabel: cleanServerText(summary.fullIntakeConfiguredLabel) || `${configuredRowCount}/${intakeRowCount}`,
      alternativeGroupCount: normalizeV1NonNegativeInteger(summary.alternativeGroupCount, alternativeGroups.length),
      alternativeGroupBlockingCount: normalizeV1NonNegativeInteger(summary.alternativeGroupBlockingCount),
      alternativeGroupWarningCount: normalizeV1NonNegativeInteger(summary.alternativeGroupWarningCount),
      minimumBlockingTargetCount,
      minimumBlockingSatisfiedCount,
      minimumBlockingMissingCount: normalizeV1NonNegativeInteger(
        summary.minimumBlockingMissingCount,
        Math.max(0, minimumBlockingTargetCount - minimumBlockingSatisfiedCount),
      ),
      minimumBlockingVariableRowCount: normalizeV1NonNegativeInteger(summary.minimumBlockingVariableRowCount),
      minimumBlockingAlternativeGroupCount: normalizeV1NonNegativeInteger(summary.minimumBlockingAlternativeGroupCount),
      minimumBlockingTargetSignatureIncluded: Boolean(cleanServerText(summary.minimumBlockingTargetSignature)),
      minimumBlockingLabel: cleanServerText(summary.minimumBlockingLabel) || `${minimumBlockingSatisfiedCount}/${minimumBlockingTargetCount}`,
      minimumWarningTargetCount,
      minimumWarningSatisfiedCount,
      minimumWarningMissingCount: normalizeV1NonNegativeInteger(
        summary.minimumWarningMissingCount,
        Math.max(0, minimumWarningTargetCount - minimumWarningSatisfiedCount),
      ),
      minimumWarningVariableRowCount: normalizeV1NonNegativeInteger(summary.minimumWarningVariableRowCount),
      minimumWarningAlternativeGroupCount: normalizeV1NonNegativeInteger(summary.minimumWarningAlternativeGroupCount),
      minimumWarningTargetSignatureIncluded: Boolean(cleanServerText(summary.minimumWarningTargetSignature)),
      minimumWarningLabel: cleanServerText(summary.minimumWarningLabel) || `${minimumWarningSatisfiedCount}/${minimumWarningTargetCount}`,
      passedRowCount: normalizeV1NonNegativeInteger(summary.passedRowCount),
      blockingCount,
      warningCount,
      blockingLabel: `${blockingCount} 项`,
      warningLabel: `${warningCount} 项`,
      auditReady: summary.auditReady === true,
      intakeCsvReady: summary.intakeCsvReady === true,
      minimumBlockingItemCount: minimumBlockingItems.length,
    },
    minimumBlockingItems,
    alternativeGroups: alternativeGroups.slice(0, 6),
    blockingFindings: blockingFindings.slice(0, 12),
    warningFindings: warningFindings.slice(0, 8),
    nextActions: sanitizeStringList(source.nextActions).slice(0, 8),
    safeguards: {
      nonMutating: true,
      envFilePathIncluded: false,
      intakeCsvPathIncluded: false,
      envValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      secretFieldsIncluded: false,
      commandValueIncluded: false,
      spoolPathIncluded: false,
      tokenIncluded: false,
      rawEnvLineIncluded: false,
      rawProofRefIncluded: false,
      artifactPathExposed: false,
    },
  };
}

export function sanitizeV1ProductionPersistenceEvidence(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const validScope = cleanServerText(source.scope) === "v1_production_persistence_evidence";
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const stages = Array.isArray(source.stages)
    ? source.stages.map(sanitizeV1ProductionPersistenceEvidenceStage).filter(Boolean)
    : [];
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(sanitizeV1ProductionPersistenceEvidenceStage).filter(Boolean)
    : stages.filter((stage) => stage.status === "blocked" || stage.status === "error");
  const passedCount = normalizeV1NonNegativeInteger(summary.passedCount);
  const totalCount = normalizeV1NonNegativeInteger(summary.totalCount, stages.length);
  const blockingCount = normalizeV1NonNegativeInteger(summary.blockingCount, blockingStages.length);
  const warningCount = normalizeV1NonNegativeInteger(summary.warningCount);
  const status = validScope
    ? cleanServerText(source.status) || (blockingCount > 0 ? "blocked" : "ready")
    : "missing";
  const available = validScope && (Object.keys(summary).length > 0 || stages.length > 0 || blockingStages.length > 0);
  const ready = available && source.ready === true && blockingCount === 0;
  return {
    status,
    ready,
    available,
    checkedAt: cleanServerText(source.checkedAt),
    envFileCount: normalizeV1NonNegativeInteger(source.envFileCount),
    envFileSource: cleanServerText(source.envFileSource),
    envFileSourceLabel: cleanServerText(source.envFileSourceLabel),
    envFileFromProductionSetup: source.envFileFromProductionSetup === true,
    summary: {
      label: available
        ? sanitizeProductionStatusText(summary.label) || `${passedCount}/${totalCount} 阶段通过`
        : "生产持久化留证未生成",
      passedCount,
      totalCount,
      blockingCount,
      warningCount,
      passedLabel: `${passedCount}/${totalCount}`,
      blockingLabel: `${blockingCount} 项`,
      warningLabel: `${warningCount} 项`,
      postgresReady: summary.postgresReady === true,
      postgresBackupRestoreReady: summary.postgresBackupRestoreReady === true,
      objectStorageReady: summary.objectStorageReady === true,
      objectStorageGovernanceReady: summary.objectStorageGovernanceReady === true,
      persistenceEnvReady: summary.persistenceEnvReady === true,
      envFileFromProductionSetup: summary.envFileFromProductionSetup === true || source.envFileFromProductionSetup === true,
      envFileSource: cleanServerText(summary.envFileSource || source.envFileSource),
      envFileSourceLabel: cleanServerText(summary.envFileSourceLabel || source.envFileSourceLabel),
    },
    stages: stages.slice(0, 8),
    blockingStages: blockingStages.slice(0, 6),
    nextActions: sanitizeStringList(source.nextActions).slice(0, 8),
    safeguards: sanitizeV1ProductionPersistenceEvidenceSafeguards(source.safeguards),
  };
}

function sanitizeV1ProductionPersistenceEvidenceStage(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const label = sanitizeProductionStatusText(source.label);
  const key = cleanServerText(source.key);
  if (!label && !key) return null;
  const evidence = isPlainServerObject(source.evidence) ? source.evidence : {};
  return {
    key,
    label: label || key,
    status: cleanServerText(source.status) || "blocked",
    ready: source.ready === true,
    detail: sanitizeProductionStatusText(source.detail),
    nextAction: sanitizeProductionStatusText(source.nextAction),
    evidence: {
      passedCount: normalizeV1NonNegativeInteger(evidence.passedCount),
      totalCount: normalizeV1NonNegativeInteger(evidence.totalCount),
      blockingCount: normalizeV1NonNegativeInteger(evidence.blockingCount),
      warningCount: normalizeV1NonNegativeInteger(evidence.warningCount),
      reportStatus: cleanServerText(evidence.reportStatus),
      migrationApplyExecuted: evidence.migrationApplyExecuted === true,
      restoreDatabaseMutated: evidence.restoreDatabaseMutated === true,
      dumpFilesRemoved: evidence.dumpFilesRemoved === true,
      readsBucketGovernanceOnly: evidence.readsBucketGovernanceOnly === true,
      envFilePathIncluded: false,
      databaseUrlIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      objectKeyIncluded: false,
      signedUrlIncluded: false,
      rawBucketPolicyIncluded: false,
      commandValueIncluded: false,
      payloadIncluded: false,
    },
  };
}

function sanitizeV1ProductionPersistenceEvidenceSafeguards(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  return {
    nonMutatingBusinessData: source.nonMutatingBusinessData !== false,
    migrationApplyExecuted: source.migrationApplyExecuted === true,
    postgresTempTableWriteProbeRolledBack: source.postgresTempTableWriteProbeRolledBack === true,
    postgresBackupRestoreSourceDatabaseMutated: source.postgresBackupRestoreSourceDatabaseMutated === true,
    postgresBackupRestoreRestoreDatabaseMutated: source.postgresBackupRestoreRestoreDatabaseMutated === true,
    postgresBackupRestoreResetExplicitlyAllowed: source.postgresBackupRestoreResetExplicitlyAllowed === true,
    postgresBackupRestoreDumpFilesRemoved: source.postgresBackupRestoreDumpFilesRemoved === true,
    objectStorageDiagnosticObjectsDeleted: source.objectStorageDiagnosticObjectsDeleted === true,
    objectStorageGovernanceWritesObjects: source.objectStorageGovernanceWritesObjects === true,
    objectStorageGovernanceReadsBucketMetadata: source.objectStorageGovernanceReadsBucketMetadata === true,
    envFileReadFromProductionSetup: source.envFileReadFromProductionSetup === true,
    envFilePathAcceptedFromRequest: source.envFilePathAcceptedFromRequest === true,
    envFilePathExposed: false,
    envValuesExposed: false,
    databaseUrlExposed: false,
    objectStorageEndpointExposed: false,
    objectStorageBucketExposed: false,
    secretFieldsExposed: false,
    objectKeyExposed: false,
    signedUrlExposed: false,
    rawBucketPolicyExposed: false,
    payloadExposed: false,
  };
}

export function sanitizeV1ProductionFirstStageExecution(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const validScope = cleanServerText(source.scope) === "v1_production_first_stage_execution";
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const execution = isPlainServerObject(source.execution) ? source.execution : {};
  const stages = Array.isArray(source.stages)
    ? source.stages.map(sanitizeV1ProductionFirstStage).filter(Boolean)
    : [];
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(sanitizeV1ProductionFirstStage).filter(Boolean)
    : stages.filter((stage) => stage.status === "blocked" || stage.status === "error");
  const passedCount = normalizeV1NonNegativeInteger(summary.passedCount);
  const totalCount = normalizeV1NonNegativeInteger(summary.totalCount, stages.length);
  const blockingCount = normalizeV1NonNegativeInteger(summary.blockingCount, blockingStages.length);
  const errorCount = normalizeV1NonNegativeInteger(summary.errorCount);
  const status = validScope
    ? cleanServerText(source.status) || (blockingCount > 0 || errorCount > 0 ? "blocked" : "passed")
    : "missing";
  const available = validScope && (Object.keys(summary).length > 0 || stages.length > 0 || blockingStages.length > 0);
  const ready = available && source.ready === true && blockingCount === 0 && errorCount === 0;
  const dryRunCoverage = sanitizeV1ProductionFirstStageDryRunCoverage(
    summary.productionEnvValuesDryRunCoverage,
    available,
  );
  const intakeCoverage = sanitizeV1ProductionFirstStageIntakeCoverage(
    summary.productionEnvIntakeCoverage,
    available,
  );
  const nextActions = sanitizeStringList(source.nextActions).slice(0, 8);
  const defaultNextAction = dryRunCoverage.included
    ? dryRunCoverage.minimumBlockingReady
      ? "真实值片段 dry-run 的最小阻塞补值已覆盖；确认真实值后去掉 dry-run 正式合并，再继续第一阶段。"
      : "修正真实值片段后重新运行第一阶段 values dry-run。"
    : "先运行第一阶段真实值片段 dry-run，确认最小 blocking 补值覆盖后再正式合并。";

  return {
    status,
    ready,
    available,
    checkedAt: cleanServerText(source.checkedAt),
    summary: {
      label: available
        ? sanitizeProductionStatusText(summary.label) || `${passedCount}/${totalCount} 步骤通过`
        : "生产环境 / 持久化第一阶段执行未生成",
      passedCount,
      plannedCount: normalizeV1NonNegativeInteger(summary.plannedCount),
      totalCount,
      blockingCount,
      errorCount,
      passedLabel: `${passedCount}/${totalCount}`,
      blockingLabel: `${blockingCount} 项`,
      errorLabel: `${errorCount} 项`,
    },
    execution: {
      envFileCount: normalizeV1NonNegativeInteger(execution.envFileCount),
      envFileSourceLabel: cleanServerText(execution.envFileSourceLabel),
      envFileFromProductionSetup: execution.envFileFromProductionSetup === true,
      planOnly: execution.planOnly === true,
      applyMigrations: execution.applyMigrations === true,
      restoreResetExplicitlyAllowed: execution.restoreResetExplicitlyAllowed === true,
      migrationApplyRequiresExplicitFlag: execution.migrationApplyRequiresExplicitFlag !== false,
      runtimeSmokeUsesExistingApi: execution.runtimeSmokeUsesExistingApi === true,
      fieldEvidenceManifestSourceLabel: cleanServerText(execution.fieldEvidenceManifestSourceLabel),
      fieldEvidenceManifestConfigured: execution.fieldEvidenceManifestConfigured === true,
      fieldEvidenceManifestDefaultTemplateUsed: execution.fieldEvidenceManifestDefaultTemplateUsed === true,
      productionEnvValuesFileProvided: execution.productionEnvValuesFileProvided === true,
      productionEnvValuesDryRun: execution.productionEnvValuesDryRun === true,
      productionEnvValuesDryRunStopsBeforeFirstStage: execution.productionEnvValuesDryRunStopsBeforeFirstStage === true,
      actualEnvFilePathsIncluded: false,
      fieldEvidenceManifestPathIncluded: false,
      productionEnvValuesFilePathIncluded: false,
      productionEnvIntakeCsvPathIncluded: false,
      outputDirIncluded: false,
      apiBaseUrlIncluded: false,
    },
    intakeCoverage,
    dryRunCoverage,
    stages: stages.slice(0, 8),
    blockingStages: blockingStages.slice(0, 5),
    nextActions: nextActions.length ? nextActions : (available ? [defaultNextAction] : []),
    safeguards: {
      nonMutating: true,
      envValuesIncluded: false,
      databaseUrlIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      secretFieldsIncluded: false,
      commandValueIncluded: false,
      commandArgsIncluded: false,
      spoolPathIncluded: false,
      tokenIncluded: false,
      envFilePathIncluded: false,
      productionEnvValuesFilePathIncluded: false,
      fieldEvidenceManifestPathIncluded: false,
      rawStageCommandsIncluded: false,
      businessDataMutated: false,
      productionEnvFileMutated: false,
      schemaMigrationApplyExecuted: execution.applyMigrations === true,
      declaresFullV1Complete: false,
      artifactPathExposed: false,
    },
  };
}

function sanitizeV1ProductionFirstStage(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const label = sanitizeProductionStatusText(source.label);
  const key = cleanServerText(source.key);
  if (!label && !key) return null;
  const evidence = isPlainServerObject(source.evidence) ? source.evidence : {};
  return {
    key,
    label: label || key,
    status: cleanServerText(source.status),
    detail: sanitizeProductionStatusText(source.detail),
    exitCode: Number.isFinite(Number(source.exitCode)) ? Number(source.exitCode) : null,
    commandIncluded: false,
    evidence: {
      reportParsed: evidence.reportParsed === true,
      reportStatus: cleanServerText(evidence.reportStatus),
      reportReady: evidence.reportReady === true,
      dryRun: evidence.dryRun === true,
      dryRunProjectionIncluded: evidence.dryRunProjectionIncluded === true,
      summaryLabel: sanitizeProductionStatusText(evidence.summaryLabel),
      intakeCoverageIncluded: evidence.intakeCoverageIncluded === true,
      intakeAuditReady: evidence.intakeAuditReady === true,
      intakeCsvReady: evidence.intakeCsvReady === true,
      intakeConfiguredRowCount: normalizeV1NonNegativeInteger(evidence.intakeConfiguredRowCount),
      intakeRowCount: normalizeV1NonNegativeInteger(evidence.intakeRowCount),
      intakeMissingRowCount: normalizeV1NonNegativeInteger(evidence.intakeMissingRowCount),
      fullIntakeConfiguredLabel: cleanServerText(evidence.fullIntakeConfiguredLabel),
      intakeConfiguredLabel: cleanServerText(evidence.intakeConfiguredLabel),
      minimumBlockingLabel: cleanServerText(evidence.minimumBlockingLabel),
      minimumBlockingMissingCount: normalizeV1NonNegativeInteger(evidence.minimumBlockingMissingCount),
      minimumWarningLabel: cleanServerText(evidence.minimumWarningLabel),
      minimumWarningMissingCount: normalizeV1NonNegativeInteger(evidence.minimumWarningMissingCount),
      passedCount: normalizeV1NonNegativeInteger(evidence.passedCount),
      blockingCount: normalizeV1NonNegativeInteger(evidence.blockingCount),
      warningCount: normalizeV1NonNegativeInteger(evidence.warningCount),
      scope: cleanServerText(evidence.scope),
      actualCommandArgsIncluded: false,
      envFilePathIncluded: false,
    },
    nextActions: sanitizeStringList(source.nextActions).slice(0, 5),
  };
}

function sanitizeV1ProductionFirstStageIntakeCoverage(value = {}, firstStageAvailable = false) {
  const source = isPlainServerObject(value) ? value : {};
  const included = firstStageAvailable && source.included === true;
  const configuredRowCount = normalizeV1NonNegativeInteger(source.configuredRowCount);
  const intakeRowCount = normalizeV1NonNegativeInteger(source.intakeRowCount);
  const minimumBlockingSatisfiedCount = normalizeV1NonNegativeInteger(source.minimumBlockingSatisfiedCount);
  const minimumBlockingTargetCount = normalizeV1NonNegativeInteger(source.minimumBlockingTargetCount);
  const minimumWarningSatisfiedCount = normalizeV1NonNegativeInteger(source.minimumWarningSatisfiedCount);
  const minimumWarningTargetCount = normalizeV1NonNegativeInteger(source.minimumWarningTargetCount);
  const minimumBlockingMissingCount = normalizeV1NonNegativeInteger(
    source.minimumBlockingMissingCount,
    Math.max(0, minimumBlockingTargetCount - minimumBlockingSatisfiedCount),
  );
  const minimumWarningMissingCount = normalizeV1NonNegativeInteger(
    source.minimumWarningMissingCount,
    Math.max(0, minimumWarningTargetCount - minimumWarningSatisfiedCount),
  );
  return {
    available: firstStageAvailable,
    included,
    status: included ? cleanServerText(source.stageStatus) || "unknown" : firstStageAvailable ? "not_included" : "missing",
    statusLabel: included
      ? source.reportReady === true
        ? "已通过"
        : "阻塞"
      : firstStageAvailable
        ? "未纳入"
        : "未生成",
    reportReady: included && source.reportReady === true,
    auditReady: included && source.auditReady === true,
    intakeCsvReady: included && source.intakeCsvReady === true,
    configuredRowCount,
    intakeRowCount,
    missingRowCount: normalizeV1NonNegativeInteger(source.missingRowCount, Math.max(0, intakeRowCount - configuredRowCount)),
    configuredLabel: cleanServerText(source.configuredLabel) || `${configuredRowCount}/${intakeRowCount}`,
    fullIntakeConfiguredLabel: cleanServerText(source.fullIntakeConfiguredLabel) || `${configuredRowCount}/${intakeRowCount}`,
    blockingCount: normalizeV1NonNegativeInteger(source.blockingCount),
    warningCount: normalizeV1NonNegativeInteger(source.warningCount),
    alternativeGroupBlockingCount: normalizeV1NonNegativeInteger(source.alternativeGroupBlockingCount),
    alternativeGroupWarningCount: normalizeV1NonNegativeInteger(source.alternativeGroupWarningCount),
    minimumBlockingReady: included && source.reportReady === true && minimumBlockingMissingCount === 0,
    minimumBlockingSatisfiedCount,
    minimumBlockingTargetCount,
    minimumBlockingMissingCount,
    minimumBlockingVariableRowCount: normalizeV1NonNegativeInteger(source.minimumBlockingVariableRowCount),
    minimumBlockingAlternativeGroupCount: normalizeV1NonNegativeInteger(source.minimumBlockingAlternativeGroupCount),
    minimumBlockingLabel: cleanServerText(source.minimumBlockingLabel) || `${minimumBlockingSatisfiedCount}/${minimumBlockingTargetCount}`,
    minimumWarningReady: included && minimumWarningMissingCount === 0,
    minimumWarningSatisfiedCount,
    minimumWarningTargetCount,
    minimumWarningMissingCount,
    minimumWarningVariableRowCount: normalizeV1NonNegativeInteger(source.minimumWarningVariableRowCount),
    minimumWarningAlternativeGroupCount: normalizeV1NonNegativeInteger(source.minimumWarningAlternativeGroupCount),
    minimumWarningLabel: cleanServerText(source.minimumWarningLabel) || `${minimumWarningSatisfiedCount}/${minimumWarningTargetCount}`,
    nextAction: included
      ? source.reportReady === true
        ? "真实值 intake 已通过；继续生产 env 变量预检和第一阶段后续步骤。"
        : "先补齐最小阻塞真实值片段并运行 values dry-run，通过后再正式合并。"
      : firstStageAvailable
        ? "当前第一阶段 latest 未纳入真实值 intake 覆盖；重新执行第一阶段后刷新。"
        : "先生成生产环境 / 持久化第一阶段执行报告。",
  };
}

function sanitizeV1ProductionFirstStageDryRunCoverage(value = {}, firstStageAvailable = false) {
  const source = isPlainServerObject(value) ? value : {};
  const included = firstStageAvailable && source.included === true;
  const minimumBlockingSatisfiedCount = normalizeV1NonNegativeInteger(source.minimumBlockingSatisfiedCount);
  const minimumBlockingTargetCount = normalizeV1NonNegativeInteger(source.minimumBlockingTargetCount);
  const minimumWarningSatisfiedCount = normalizeV1NonNegativeInteger(source.minimumWarningSatisfiedCount);
  const minimumWarningTargetCount = normalizeV1NonNegativeInteger(source.minimumWarningTargetCount);
  const envPreflightPassedCount = normalizeV1NonNegativeInteger(source.envPreflightPassedCount);
  const envPreflightTotalCount = normalizeV1NonNegativeInteger(source.envPreflightTotalCount);
  const intakeConfiguredRowCount = normalizeV1NonNegativeInteger(source.intakeConfiguredRowCount);
  const intakeRowCount = normalizeV1NonNegativeInteger(source.intakeRowCount);

  return {
    available: firstStageAvailable,
    included,
    status: included ? cleanServerText(source.stageStatus) || "unknown" : firstStageAvailable ? "not_included" : "missing",
    statusLabel: included ? (source.stageStatus === "passed" ? "已纳入" : "需复核") : firstStageAvailable ? "未纳入" : "未生成",
    targetWouldBeWritten: false,
    envPreflightReady: included && source.envPreflightReady === true,
    envPreflightPassedCount,
    envPreflightTotalCount,
    envPreflightBlockingCount: normalizeV1NonNegativeInteger(source.envPreflightBlockingCount),
    envPreflightLabel: `${envPreflightPassedCount}/${envPreflightTotalCount}`,
    intakeConfiguredRowCount,
    intakeRowCount,
    intakeLabel: `${intakeConfiguredRowCount}/${intakeRowCount}`,
    intakeMissingRequiredVariableCount: normalizeV1NonNegativeInteger(source.intakeMissingRequiredVariableCount),
    intakeAlternativeGroupBlockingCount: normalizeV1NonNegativeInteger(source.intakeAlternativeGroupBlockingCount),
    minimumBlockingReady: included && source.minimumBlockingReady === true,
    minimumBlockingSatisfiedCount,
    minimumBlockingTargetCount,
    minimumBlockingMissingCount: normalizeV1NonNegativeInteger(
      source.minimumBlockingMissingCount,
      Math.max(0, minimumBlockingTargetCount - minimumBlockingSatisfiedCount),
    ),
    minimumBlockingVariableRowCount: normalizeV1NonNegativeInteger(source.minimumBlockingVariableRowCount),
    minimumBlockingAlternativeGroupCount: normalizeV1NonNegativeInteger(source.minimumBlockingAlternativeGroupCount),
    minimumBlockingTargetSignatureIncluded: Boolean(cleanServerText(source.minimumBlockingTargetSignature)),
    minimumBlockingLabel: `${minimumBlockingSatisfiedCount}/${minimumBlockingTargetCount}`,
    minimumWarningReady: included && source.minimumWarningReady === true,
    minimumWarningSatisfiedCount,
    minimumWarningTargetCount,
    minimumWarningMissingCount: normalizeV1NonNegativeInteger(
      source.minimumWarningMissingCount,
      Math.max(0, minimumWarningTargetCount - minimumWarningSatisfiedCount),
    ),
    minimumWarningLabel: `${minimumWarningSatisfiedCount}/${minimumWarningTargetCount}`,
    minimumWarningTargetSignatureIncluded: Boolean(cleanServerText(source.minimumWarningTargetSignature)),
    nextAction: included
      ? source.minimumBlockingReady === true
        ? "最小阻塞补值 dry-run 已覆盖；确认后可正式合并并继续第一阶段。"
        : "dry-run 已纳入但最小阻塞补值仍未覆盖，需修正真实值片段。"
      : firstStageAvailable
        ? "当前第一阶段 latest 不是 values dry-run 产物；先运行 `--production-env-values-dry-run` 后刷新上线状态。"
        : "先生成生产环境 / 持久化第一阶段执行报告。",
  };
}

function sanitizeV1ProductionEnvIntakeFinding(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const label = sanitizeProductionStatusText(source.label);
  const variableKey = cleanServerText(source.variableKey);
  const alternativeGroup = cleanServerText(source.alternativeGroup);
  if (!label && !variableKey && !alternativeGroup) return null;
  return {
    type: cleanServerText(source.type),
    key: cleanServerText(source.key),
    itemKey: cleanServerText(source.itemKey),
    label: label || variableKey || alternativeGroup,
    ownerRole: sanitizeProductionStatusText(source.ownerRole),
    severity: cleanServerText(source.severity) || "warning",
    status: cleanServerText(source.status),
    variableKey,
    alternativeGroup,
    variables: sanitizeStringList(source.variables).slice(0, 6),
    configuredKeyCount: normalizeV1NonNegativeInteger(source.configuredKeyCount),
    sourceSystem: cleanServerText(source.sourceSystem),
    expectedValueType: cleanServerText(source.expectedValueType),
    configured: source.configured === true,
    safeLiteralRequired: source.safeLiteralRequired === true,
    safeLiteralMatches: source.safeLiteralMatches !== false,
    filledMarked: source.filledMarked === true,
    verifiedMarked: source.verifiedMarked === true,
    evidenceProvided: source.evidenceRefProvided === true,
    rawProofRefIncluded: false,
    detail: sanitizeProductionStatusText(source.detail),
    nextAction: sanitizeProductionStatusText(source.nextAction),
  };
}

export function sanitizeV1ProductionEnvFixChecklist(value = []) {
  const items = Array.isArray(value)
    ? value.map(sanitizeV1ProductionEnvFixItem).filter(Boolean)
    : [];
  const blockingCount = items.filter((item) => item.severity === "blocking").length;
  const warningCount = items.filter((item) => item.severity === "warning").length;
  const passedCount = items.filter((item) => item.status === "passed" || item.ready).length;
  const configuredVariableCount = items.reduce(
    (total, item) => total + normalizeV1NonNegativeInteger(item.configuredVariableCount),
    0,
  );
  const totalVariableCount = items.reduce(
    (total, item) => total + normalizeV1NonNegativeInteger(item.totalVariableCount),
    0,
  );
  return {
    status: blockingCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "passed",
    ready: blockingCount === 0 && warningCount === 0 && items.length > 0,
    summary: {
      label: items.length
        ? `生产环境修正清单：${items.length} 项，${blockingCount} 项阻塞`
        : "生产环境修正清单未生成",
      itemCount: items.length,
      blockingCount,
      warningCount,
      passedCount,
      configuredVariableCount,
      totalVariableCount,
    },
    items,
    safeguards: {
      environmentValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      artifactPathExposed: false,
    },
  };
}

export function sanitizeV1ProductionEnvFillTemplate(value = "", options = {}) {
  const raw = typeof value === "string" ? value : "";
  const rawLines = raw.split(/\r?\n/);
  const sanitizedLines = rawLines
    .map(sanitizeV1ProductionEnvTemplateLine)
    .filter((line) => line !== null);
  const variableNames = Array.from(
    new Set(
      sanitizedLines
        .map((line) => line.match(/^\s*#?\s*([A-Z][A-Z0-9_]+)=/)?.[1] ?? "")
        .filter(Boolean),
    ),
  );
  const placeholderCount = sanitizedLines.filter((line) => line.includes("<待填写>")).length;
  const blockingSectionCount = sanitizedLines.filter((line) => line.includes("# BLOCKING |")).length;
  const warningSectionCount = sanitizedLines.filter((line) => line.includes("# WARNING |")).length;
  const label = cleanServerText(options.label) || "安全 env 填写草稿";
  const missingLabel = cleanServerText(options.missingLabel) || `${label}未生成`;
  const targetLabel = cleanServerText(options.targetLabel);
  return {
    status: raw ? "available" : "missing",
    ready: false,
    summary: {
      label: raw
        ? `${label}：${variableNames.length} 个变量，${placeholderCount} 个待填写`
        : missingLabel,
      lineCount: sanitizedLines.length,
      variableCount: variableNames.length,
      placeholderCount,
      blockingSectionCount,
      warningSectionCount,
      templateKind: cleanServerText(options.templateKind) || "env_fill_template",
      fileName: cleanServerText(options.fileName),
      targetLabel,
      commandLineCount: sanitizedLines.filter((line) => line.includes("node ") || line.includes("npm ")).length,
    },
    variableNames,
    previewLines: sanitizedLines,
    safeguards: {
      realEnvValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
      placeholderValuesOnly: true,
      templateOnly: true,
      browserEnvValuesAccepted: false,
      targetEnvMutated: false,
      productionEnvFileMutated: false,
    },
  };
}

function sanitizeV1ProductionEnvTemplateLine(line) {
  const text = cleanServerText(line);
  if (!text) return "";
  const assignment = text.match(/^(\s*#?\s*)([A-Z][A-Z0-9_]+)=(.*)$/);
  if (!assignment) {
    return text
      .replace(/<REPLACE_WITH_[^>]+>/g, "<待填写>")
      .replace(/<OPTIONAL_[^>]+>/g, "<待填写>");
  }
  const [, prefix, key, rawValue] = assignment;
  const value = cleanServerText(rawValue);
  const safeLiteralValues = new Set([
    "postgres",
    "object_storage",
    "true",
    "command_bridge",
    "cups_lp",
  ]);
  const safeValue = safeLiteralValues.has(value) ? value : "<待填写>";
  return `${prefix}${key}=${safeValue}`;
}

export function sanitizeV1ProductionEnvFixItem(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const label = sanitizeProductionStatusText(value.label);
  if (!label) return null;
  const severity = normalizeV1FixSeverity(value.severity);
  const status = cleanServerText(value.status) || (value.ready ? "passed" : "pending");
  return {
    key: cleanServerText(value.key),
    label,
    ownerRole: sanitizeProductionStatusText(value.ownerRole) || "技术/管理",
    severity,
    status,
    ready: Boolean(value.ready || status === "passed"),
    blocking: Boolean(value.blocking || severity === "blocking"),
    configuredVariableCount: normalizeV1NonNegativeInteger(value.configuredVariableCount),
    totalVariableCount: normalizeV1NonNegativeInteger(value.totalVariableCount),
    requiredVariables: sanitizeStringList(value.requiredVariables),
    missingVariables: sanitizeStringList(value.missingVariables),
    placeholderVariables: sanitizeStringList(value.placeholderVariables),
    valueGuidance: sanitizeStringList(value.valueGuidance).slice(0, 5),
    verificationSteps: sanitizeStringList(value.verificationSteps).slice(0, 5),
    nextAction: sanitizeProductionStatusText(value.nextAction),
  };
}

function normalizeV1FixSeverity(value) {
  const severity = cleanServerText(value);
  if (["blocking", "warning", "ok"].includes(severity)) return severity;
  return "warning";
}

function cleanServerText(value) {
  return String(value ?? "").trim();
}

function sanitizeStringList(value = []) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return raw.map((item) => sanitizeProductionStatusText(item)).filter(Boolean);
}

function sanitizeProductionStatusText(value) {
  return sanitizeV1RoleTaskActionText(value)
    .replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'",;]+/gi, "<连接串已隐藏>")
    .replace(/\bhttps?:\/\/[^\s'",;]+/gi, "<服务地址已隐藏>")
    .replace(/\bBearer\s+[^\s'",;]+/gi, "Bearer <令牌已隐藏>")
    .replace(/(?:\/var|\/tmp)\/[^\s'",;]+/g, "<本地路径已隐藏>")
    .replace(
      /(--(?:token|secret|password|database-url|endpoint|bucket|access-key(?:-id)?|secret-access-key))(?:=|\s+)(?:"[^"]*"|'[^']*'|[^\s]+)/gi,
      "$1 <值已隐藏>",
    )
    .replace(
      /\b((?:database[-_ ]?url|connection[-_ ]?string|endpoint|bucket|access[-_ ]?key(?:[-_ ]?id)?|secret[-_ ]?access[-_ ]?key|token|password|secret))(?:=|:\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1=<值已隐藏>",
    )
    .replace(
      /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|DATABASE_URL|ACCESS_KEY|ENDPOINT|BUCKET)[A-Z0-9_]*)=([^\s,;]+)/g,
      "$1=<值已隐藏>",
    );
}

function normalizeV1NonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function isPlainServerObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
