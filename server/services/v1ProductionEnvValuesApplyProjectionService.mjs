import { sanitizeV1SensitiveStatusText } from "./v1StatusTextSanitizer.mjs";

export function sanitizeV1ProductionEnvValuesApplyReport(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const validScope = cleanText(source.scope) === "v1_production_env_real_value_intake_apply";
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const sourceEnvFile = isPlainObject(source.sourceEnvFile) ? source.sourceEnvFile : {};
  const targetEnvFile = isPlainObject(source.targetEnvFile) ? source.targetEnvFile : {};
  const intakeCsv = isPlainObject(source.intakeCsv) ? source.intakeCsv : {};
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(sanitizeFinding).filter(Boolean)
    : [];
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(sanitizeFinding).filter(Boolean)
    : [];
  const appliedVariables = sanitizeVariableKeyList(source.appliedVariables);

  return {
    status: validScope ? cleanStatus(source.status) || "blocked" : "missing",
    ready: validScope && source.ready === true,
    checkedAt: cleanText(source.checkedAt),
    dryRun: source.dryRun === true,
    summary: {
      label: sanitizeText(summary.label),
      sourceAssignmentCount: nonNegativeInteger(summary.sourceAssignmentCount),
      allowedVariableCount: nonNegativeInteger(summary.allowedVariableCount),
      applicableValueCount: nonNegativeInteger(summary.applicableValueCount),
      blankSourceValueCount: nonNegativeInteger(summary.blankSourceValueCount),
      unknownSourceVariableCount: nonNegativeInteger(summary.unknownSourceVariableCount),
      appliedVariableCount: nonNegativeInteger(summary.appliedVariableCount, appliedVariables.length),
      targetChanged: summary.targetChanged === true,
      targetMode: cleanStatus(summary.targetMode),
      setupReady: summary.setupReady === true,
      envPreflightReady: summary.envPreflightReady === true,
      envPreflightPassedCount: nonNegativeInteger(summary.envPreflightPassedCount),
      envPreflightTotalCount: nonNegativeInteger(summary.envPreflightTotalCount),
      intakeVerificationReady: summary.intakeVerificationReady === true,
      intakeVerificationBlockingCount: nonNegativeInteger(summary.intakeVerificationBlockingCount),
      intakeVerificationWarningCount: nonNegativeInteger(summary.intakeVerificationWarningCount),
      blockingCount: nonNegativeInteger(summary.blockingCount, blockingFindings.length),
      warningCount: nonNegativeInteger(summary.warningCount, warningFindings.length),
    },
    sourceEnvFile: {
      pathIncluded: false,
      exists: sourceEnvFile.exists === true,
      auditReady: sourceEnvFile.auditReady === true,
      auditStatus: cleanStatus(sourceEnvFile.auditStatus) || "not_run",
      assignmentCount: nonNegativeInteger(sourceEnvFile.assignmentCount),
      unknownVariableCount: nonNegativeInteger(sourceEnvFile.unknownVariableCount),
      blankValueCount: nonNegativeInteger(sourceEnvFile.blankValueCount),
    },
    targetEnvFile: {
      pathIncluded: false,
      exists: targetEnvFile.exists === true,
      auditReadyBefore: targetEnvFile.auditReadyBefore === true,
      auditStatusBefore: cleanStatus(targetEnvFile.auditStatusBefore) || "not_run",
      applied: targetEnvFile.applied === true,
      changed: targetEnvFile.changed === true,
      fileMode: /^[0-7]{3,4}$/.test(cleanText(targetEnvFile.fileMode)) ? cleanText(targetEnvFile.fileMode) : "",
    },
    intakeCsv: {
      pathIncluded: false,
      ready: intakeCsv.ready === true,
      rowCount: nonNegativeInteger(intakeCsv.rowCount),
      allowedVariableCount: nonNegativeInteger(intakeCsv.allowedVariableCount),
      missingHeaderCount: nonNegativeInteger(intakeCsv.missingHeaderCount),
      missingHeaders: sanitizeTextList(intakeCsv.missingHeaders).slice(0, 8),
    },
    appliedVariables,
    skippedVariables: {
      blankSourceVariables: sanitizeVariableKeyList(source.skippedVariables?.blankSourceVariables),
      unknownSourceVariables: sanitizeVariableKeyList(source.skippedVariables?.unknownSourceVariables),
      safeLiteralMismatches: sanitizeVariableKeyList(source.skippedVariables?.safeLiteralMismatches),
    },
    alternativeGroups: Array.isArray(source.alternativeGroups)
      ? source.alternativeGroups.map(sanitizeAlternativeGroup).filter(Boolean).slice(0, 8)
      : [],
    setupRefresh: sanitizeSetupRefresh(source.setupRefresh),
    intakeVerification: sanitizeIntakeVerification(source.intakeVerification),
    blockingFindings,
    warningFindings,
    nextActions: sanitizeTextList(source.nextActions).slice(0, 8),
    safeguards: {
      envValuesExposed: false,
      envFilePathIncluded: false,
      sourceEnvFilePathIncluded: false,
      targetEnvFilePathIncluded: false,
      intakeCsvPathIncluded: false,
      connectionStringExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      spoolPathExposed: false,
      tokenIncluded: false,
      rawEnvLineIncluded: false,
      onlyIntakeVariablesApplied: source.safeguards?.onlyIntakeVariablesApplied !== false,
      targetFileMode0600: source.safeguards?.targetFileMode0600 !== false,
    },
  };
}

function sanitizeFinding(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const label = sanitizeText(source.label);
  const key = cleanKey(source.key);
  if (!label && !key) return null;
  return {
    key,
    label: label || key,
    severity: cleanStatus(source.severity) || "blocking",
    status: cleanStatus(source.status) || (source.severity === "warning" ? "warning" : "blocked"),
    detail: sanitizeText(source.detail),
    nextAction: sanitizeText(source.nextAction),
    variables: sanitizeVariableKeyList(source.variables).slice(0, 8),
  };
}

function sanitizeAlternativeGroup(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const groupKey = cleanKey(source.groupKey);
  if (!groupKey) return null;
  return {
    groupKey,
    variableCount: nonNegativeInteger(source.variableCount),
    configuredKeyCount: nonNegativeInteger(source.configuredKeyCount),
    configuredKeys: sanitizeVariableKeyList(source.configuredKeys).slice(0, 8),
    status: cleanStatus(source.status),
    severity: cleanStatus(source.severity),
    rawValuesIncluded: false,
  };
}

function sanitizeSetupRefresh(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const envPreflight = isPlainObject(source.envPreflight) ? source.envPreflight : {};
  return {
    status: cleanStatus(source.status),
    ready: source.ready === true,
    setupReady: source.setupReady === true,
    checkedAt: cleanText(source.checkedAt),
    summary: {
      label: sanitizeText(source.summary?.label),
      remainingFixItemCount: nonNegativeInteger(source.summary?.remainingFixItemCount),
    },
    envPreflight: {
      ready: envPreflight.ready === true,
      status: cleanStatus(envPreflight.status),
      passedCount: nonNegativeInteger(envPreflight.passedCount),
      totalCount: nonNegativeInteger(envPreflight.totalCount),
      blockingCount: nonNegativeInteger(envPreflight.blockingCount),
      warningCount: nonNegativeInteger(envPreflight.warningCount),
      firstRemainingFixItems: Array.isArray(envPreflight.firstRemainingFixItems)
        ? envPreflight.firstRemainingFixItems.map(sanitizeRemainingFixItem).filter(Boolean).slice(0, 6)
        : [],
    },
    safeguards: {
      envFilePathIncluded: false,
      envValuesExposed: false,
      connectionStringExposed: false,
      secretFieldsExposed: false,
    },
  };
}

function sanitizeRemainingFixItem(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const label = sanitizeText(source.label);
  const key = cleanKey(source.key);
  if (!label && !key) return null;
  return {
    key,
    label: label || key,
    status: cleanStatus(source.status),
    missingVariables: sanitizeVariableKeyList(source.missingVariables).slice(0, 8),
  };
}

function sanitizeIntakeVerification(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    status: cleanStatus(source.status),
    ready: source.ready === true,
    checkedAt: cleanText(source.checkedAt),
    summary: {
      intakeRowCount: nonNegativeInteger(source.summary?.intakeRowCount),
      configuredRowCount: nonNegativeInteger(source.summary?.configuredRowCount),
      missingRowCount: nonNegativeInteger(source.summary?.missingRowCount),
      blockingCount: nonNegativeInteger(source.summary?.blockingCount),
      warningCount: nonNegativeInteger(source.summary?.warningCount),
      alternativeGroupBlockingCount: nonNegativeInteger(source.summary?.alternativeGroupBlockingCount),
    },
    firstBlockingFindings: Array.isArray(source.firstBlockingFindings)
      ? source.firstBlockingFindings.map(sanitizeIntakeFinding).filter(Boolean).slice(0, 6)
      : [],
    safeguards: {
      envFilePathIncluded: false,
      envValuesIncluded: false,
      rawEvidenceRefIncluded: false,
    },
  };
}

function sanitizeIntakeFinding(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const label = sanitizeText(source.label);
  const variableKey = cleanVariableKey(source.variableKey);
  if (!label && !variableKey) return null;
  return {
    type: cleanStatus(source.type),
    label: label || variableKey,
    variableKey,
    status: cleanStatus(source.status),
    detail: sanitizeText(source.detail),
    nextAction: sanitizeText(source.nextAction),
  };
}

function sanitizeVariableKeyList(values) {
  return (Array.isArray(values) ? values : []).map(cleanVariableKey).filter(Boolean);
}

function sanitizeTextList(values) {
  return (Array.isArray(values) ? values : []).map(sanitizeText).filter(Boolean);
}

function cleanVariableKey(value) {
  const text = cleanText(value);
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? text : "";
}

function cleanKey(value) {
  const text = cleanText(value);
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(text) ? text : "";
}

function cleanStatus(value) {
  const text = cleanText(value);
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(text) ? text : "";
}

function sanitizeText(value) {
  return sanitizeV1SensitiveStatusText(value);
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
