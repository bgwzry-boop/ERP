const defaultMaxAgeHours = 24;
const maxAgeHoursEnvName = "ERP_V1_PRODUCTION_ENV_VALUES_DRY_RUN_MAX_AGE_HOURS";

export function buildV1ProductionEnvValuesMinimumFillStatus(productionEnvIntakeVerification = null) {
  const source = isPlainObject(productionEnvIntakeVerification) ? productionEnvIntakeVerification : {};
  const summary = isPlainObject(source.summary) ? source.summary : source;
  const minimumBlockingTargetCount = toNonNegativeInteger(summary.minimumBlockingTargetCount);
  const minimumBlockingSatisfiedCount = toNonNegativeInteger(summary.minimumBlockingSatisfiedCount);
  const minimumBlockingMissingCount = toNonNegativeInteger(
    summary.minimumBlockingMissingCount,
    Math.max(0, minimumBlockingTargetCount - minimumBlockingSatisfiedCount),
  );
  const minimumWarningTargetCount = toNonNegativeInteger(summary.minimumWarningTargetCount);
  const minimumWarningSatisfiedCount = toNonNegativeInteger(summary.minimumWarningSatisfiedCount);
  const minimumWarningMissingCount = toNonNegativeInteger(
    summary.minimumWarningMissingCount,
    Math.max(0, minimumWarningTargetCount - minimumWarningSatisfiedCount),
  );
  const available = source.available === true || minimumBlockingTargetCount > 0 || Boolean(cleanText(summary.minimumBlockingLabel));
  const minimumBlockingReady = available && minimumBlockingTargetCount > 0 && minimumBlockingMissingCount === 0;
  const minimumBlockingTargetSignature =
    cleanText(summary.minimumBlockingTargetSignature) ||
    buildV1ProductionEnvTargetSignatureFromItems(source.minimumBlockingItems || []);
  const minimumWarningTargetSignature = cleanText(summary.minimumWarningTargetSignature);
  return {
    available,
    intakeVerificationStatus: cleanText(source.status) || (available ? "blocked" : "missing"),
    intakeVerificationReady: source.ready === true,
    minimumBlockingReady,
    minimumBlockingLabel: cleanText(summary.minimumBlockingLabel) || `${minimumBlockingSatisfiedCount}/${minimumBlockingTargetCount}`,
    minimumBlockingTargetCount,
    minimumBlockingSatisfiedCount,
    minimumBlockingMissingCount,
    minimumBlockingVariableRowCount: toNonNegativeInteger(summary.minimumBlockingVariableRowCount),
    minimumBlockingAlternativeGroupCount: toNonNegativeInteger(summary.minimumBlockingAlternativeGroupCount),
    minimumBlockingTargetSignature,
    minimumBlockingTargetSignatureIncluded: Boolean(minimumBlockingTargetSignature),
    minimumWarningLabel: cleanText(summary.minimumWarningLabel) || `${minimumWarningSatisfiedCount}/${minimumWarningTargetCount}`,
    minimumWarningTargetCount,
    minimumWarningSatisfiedCount,
    minimumWarningMissingCount,
    minimumWarningTargetSignature,
    minimumWarningTargetSignatureIncluded: Boolean(minimumWarningTargetSignature),
    fullIntakeConfiguredLabel: cleanText(summary.fullIntakeConfiguredLabel) || cleanText(summary.configuredLabel) || "0/0",
  };
}

export function buildV1ProductionEnvTargetSignatureFromItems(items = []) {
  if (!Array.isArray(items)) return "";
  return [
    ...new Set(
      items
        .map((item) => {
          const source = isPlainObject(item) ? item : {};
          const alternativeGroup = cleanText(source.alternativeGroup || source.variableLabel);
          if (source.type === "alternative_group" && alternativeGroup) return `alternative-group:${alternativeGroup}`;
          const variableKey = cleanText(source.variableKey || source.variableLabel);
          return variableKey ? `variable:${variableKey}` : "";
        })
        .filter(Boolean),
    ),
  ]
    .sort()
    .join("|");
}

export function getV1ProductionEnvValuesDryRunProofMaxAgeHours(env = process.env) {
  const rawValue = cleanText(env?.[maxAgeHoursEnvName]);
  if (!rawValue) return defaultMaxAgeHours;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultMaxAgeHours;
}

export function buildV1ProductionEnvValuesDryRunProofFreshness({ checkedAt = "", maxAgeHours = null, now = null } = {}) {
  const normalizedMaxAgeHours =
    maxAgeHours === null || maxAgeHours === undefined ? getV1ProductionEnvValuesDryRunProofMaxAgeHours() : Number(maxAgeHours);
  const effectiveMaxAgeHours =
    Number.isFinite(normalizedMaxAgeHours) && normalizedMaxAgeHours >= 0 ? normalizedMaxAgeHours : defaultMaxAgeHours;
  const checkedAtText = cleanText(checkedAt);
  if (effectiveMaxAgeHours <= 0) {
    return {
      status: "disabled",
      ready: true,
      checkedAt: checkedAtText,
      checkedAtIncluded: Boolean(checkedAtText),
      maxAgeHours: 0,
      ageHours: null,
      expiresAt: "",
      remainingHours: null,
      label: "dry-run 新鲜度门禁已关闭",
      nextAction: "负责人已关闭 dry-run 新鲜度门禁；仍需确认 dry-run 匹配当前最小补值路径。",
    };
  }
  const checkedAtMs = checkedAtText ? Date.parse(checkedAtText) : NaN;
  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  const validCheckedAt = Number.isFinite(checkedAtMs);
  const ageHours = validCheckedAt ? Math.max(0, (nowMs - checkedAtMs) / 3600000) : null;
  const expiresAtMs = validCheckedAt ? checkedAtMs + effectiveMaxAgeHours * 3600000 : NaN;
  const remainingHours = validCheckedAt ? Math.max(0, (expiresAtMs - nowMs) / 3600000) : null;
  const ready = validCheckedAt && ageHours <= effectiveMaxAgeHours;
  const status = ready ? "fresh" : validCheckedAt ? "stale" : "missing";
  return {
    status,
    ready,
    checkedAt: checkedAtText,
    checkedAtIncluded: Boolean(checkedAtText),
    maxAgeHours: effectiveMaxAgeHours,
    ageHours: ageHours === null ? null : Number(ageHours.toFixed(2)),
    expiresAt: Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : "",
    remainingHours: remainingHours === null ? null : Number(remainingHours.toFixed(2)),
    label: ready
      ? `dry-run 证明在 ${effectiveMaxAgeHours} 小时内`
      : validCheckedAt
        ? `dry-run 证明超过 ${effectiveMaxAgeHours} 小时`
        : "dry-run 证明缺少检查时间",
    nextAction: ready ? "dry-run 证明仍在有效时间窗口内。" : "重新执行真实值 dry-run，刷新上线状态后再正式合并。",
  };
}

export function buildV1ProductionEnvValuesDryRunProofStatus(
  productionFirstStageExecution = null,
  currentMinimumFillSource = null,
  options = {},
) {
  const currentMinimumFillStatus =
    isPlainObject(currentMinimumFillSource) &&
    Object.hasOwn(currentMinimumFillSource, "minimumBlockingTargetSignature")
      ? currentMinimumFillSource
      : buildV1ProductionEnvValuesMinimumFillStatus(currentMinimumFillSource);
  const currentMinimumBlockingTargetSignature = cleanText(currentMinimumFillStatus.minimumBlockingTargetSignature);
  const source = isPlainObject(productionFirstStageExecution) ? productionFirstStageExecution : {};
  const buildFileBindingStatus =
    typeof options.buildFileBindingStatus === "function"
      ? options.buildFileBindingStatus
      : () => buildDefaultFileBindingStatus();
  const rawFileBindingStatus = buildFileBindingStatus({
    valuesFileConfig: options.valuesFileConfig,
    configuredValuesFileCount: options.configuredValuesFileCount,
    checkFileBinding: options.checkFileBinding === true,
    source,
  });
  const fileBindingStatus = isPlainObject(rawFileBindingStatus)
    ? rawFileBindingStatus
    : buildDefaultFileBindingStatus();
  if (
    cleanText(source.scope) !== "v1_production_first_stage_execution" &&
    !isPlainObject(source.dryRunCoverage) &&
    (Object.hasOwn(source, "included") ||
      Object.hasOwn(source, "minimumBlockingLabel") ||
      Object.hasOwn(source, "statusLabel"))
  ) {
    const minimumBlockingTargetCount = toNonNegativeInteger(source.minimumBlockingTargetCount);
    const minimumBlockingSatisfiedCount = toNonNegativeInteger(source.minimumBlockingSatisfiedCount);
    const minimumBlockingMissingCount = toNonNegativeInteger(
      source.minimumBlockingMissingCount,
      Math.max(0, minimumBlockingTargetCount - minimumBlockingSatisfiedCount),
    );
    const sourceStatus = cleanText(source.status) || (source.ready === true ? "ready" : "missing");
    const proofMinimumBlockingTargetSignature = cleanText(
      source.minimumBlockingTargetSignature || source.dryRunMinimumBlockingTargetSignature,
    );
    const dryRunMatchesCurrentMinimumPath =
      source.dryRunMatchesCurrentMinimumPath === true ||
      Boolean(
        currentMinimumBlockingTargetSignature &&
          proofMinimumBlockingTargetSignature &&
          currentMinimumBlockingTargetSignature === proofMinimumBlockingTargetSignature,
      );
    const proofIncluded = source.included === true || source.ready === true || source.minimumBlockingReady === true;
    const freshness = buildV1ProductionEnvValuesDryRunProofFreshness({
      checkedAt: proofIncluded ? source.checkedAt || source.dryRunCheckedAt : "",
    });
    const minimumAndEnvReady =
      (source.ready === true || source.minimumBlockingReady === true) && source.envPreflightReady !== false;
    const fileBindingRequired = fileBindingStatus.checked === true;
    const fileBindingReady = !fileBindingRequired || fileBindingStatus.ready === true;
    const baseReady = minimumAndEnvReady && dryRunMatchesCurrentMinimumPath && freshness.ready;
    const ready = baseReady && fileBindingReady;
    const status = ready
      ? "ready"
      : baseReady && fileBindingRequired && !fileBindingReady
        ? fileBindingStatus.status || "file_binding_blocked"
      : minimumAndEnvReady && dryRunMatchesCurrentMinimumPath && !freshness.ready
        ? "stale_or_expired"
        : minimumAndEnvReady
          ? "stale_or_mismatched"
          : sourceStatus;
    return {
      available: source.available === true || Boolean(status),
      status,
      ready,
      included: source.included === true,
      statusLabel: getDryRunProofStatusLabel(status, cleanText(source.statusLabel)),
      label: getDryRunProofLabel(status, cleanText(source.label)),
      checkedAt: freshness.checkedAt,
      dryRunCheckedAt: freshness.checkedAt,
      freshnessStatus: freshness.status,
      fresh: freshness.ready,
      freshnessLabel: freshness.label,
      maxAgeHours: freshness.maxAgeHours,
      ageHours: freshness.ageHours,
      expiresAt: freshness.expiresAt,
      remainingHours: freshness.remainingHours,
      checkedAtIncluded: freshness.checkedAtIncluded,
      firstStageStatus: cleanText(source.firstStageStatus),
      firstStageLabel: cleanText(source.firstStageLabel),
      minimumBlockingReady: ready,
      minimumBlockingLabel:
        cleanText(source.minimumBlockingLabel) || `${minimumBlockingSatisfiedCount}/${minimumBlockingTargetCount}`,
      minimumBlockingTargetCount,
      minimumBlockingSatisfiedCount,
      minimumBlockingMissingCount,
      envPreflightReady: source.envPreflightReady !== false,
      envPreflightLabel: cleanText(source.envPreflightLabel),
      intakeLabel: cleanText(source.intakeLabel),
      dryRunMatchesCurrentMinimumPath,
      valuesFingerprintStatus: cleanText(fileBindingStatus.status),
      valuesFingerprintStatusLabel: cleanText(fileBindingStatus.statusLabel),
      valuesFingerprintCompared: fileBindingStatus.valuesFingerprintCompared === true,
      valuesFingerprintIncluded: fileBindingStatus.valuesFingerprintIncluded === true,
      valuesFingerprintMatched: fileBindingStatus.valuesFingerprintMatched === true,
      valuesFingerprintDigestExposed: false,
      valuesFingerprintValuesExposed: false,
      valuesFileUnchangedAfterProof: fileBindingStatus.valuesFileUnchangedAfterProof === true,
      targetEnvFileUnchangedAfterProof: fileBindingStatus.targetEnvFileUnchangedAfterProof === true,
      fileBindingStatus,
      currentMinimumBlockingTargetSignatureIncluded: Boolean(currentMinimumBlockingTargetSignature),
      dryRunMinimumBlockingTargetSignatureIncluded: Boolean(proofMinimumBlockingTargetSignature),
      targetWouldBeWritten: false,
      nextAction:
        baseReady && fileBindingRequired && !fileBindingReady
          ? cleanText(fileBindingStatus.nextAction)
          : status === "stale_or_expired"
            ? freshness.nextAction
            : cleanText(source.nextAction),
      safeguards: buildDryRunProofSafeguards({
        sourceSafeguards: source.safeguards,
        freshness,
        fileBindingStatus,
        mergeSourceSafeguards: true,
      }),
    };
  }
  const sanitizeExecution =
    typeof options.sanitizeExecution === "function" ? options.sanitizeExecution : (value) => value;
  const sanitizedExecution = sanitizeExecution(source);
  const execution =
    cleanText(source.scope) === "v1_production_first_stage_execution" && isPlainObject(sanitizedExecution)
      ? sanitizedExecution
      : source;
  const coverage = isPlainObject(execution.dryRunCoverage) ? execution.dryRunCoverage : {};
  const executionSummary = isPlainObject(execution.summary) ? execution.summary : {};
  const available = execution.available === true && coverage.available === true;
  const included = available && coverage.included === true;
  const minimumBlockingReady = included && coverage.minimumBlockingReady === true;
  const envPreflightReady = included && coverage.envPreflightReady === true;
  const dryRunMinimumBlockingTargetSignature = cleanText(coverage.minimumBlockingTargetSignature);
  const dryRunMatchesCurrentMinimumPath = Boolean(
    minimumBlockingReady &&
      envPreflightReady &&
      currentMinimumBlockingTargetSignature &&
      dryRunMinimumBlockingTargetSignature &&
      currentMinimumBlockingTargetSignature === dryRunMinimumBlockingTargetSignature,
  );
  const freshness = buildV1ProductionEnvValuesDryRunProofFreshness({
    checkedAt: included ? coverage.checkedAt || execution.checkedAt : "",
  });
  const coverageReady = minimumBlockingReady && envPreflightReady;
  const fileBindingRequired = fileBindingStatus.checked === true;
  const fileBindingReady = !fileBindingRequired || fileBindingStatus.ready === true;
  const baseReady = coverageReady && dryRunMatchesCurrentMinimumPath && freshness.ready;
  const ready = baseReady && fileBindingReady;
  const status = ready
    ? "ready"
    : baseReady && fileBindingRequired && !fileBindingReady
      ? fileBindingStatus.status || "file_binding_blocked"
    : coverageReady && dryRunMatchesCurrentMinimumPath && !freshness.ready
      ? "stale_or_expired"
      : coverageReady
        ? "stale_or_mismatched"
        : included
          ? "blocked"
          : available
            ? "not_included"
            : "missing";
  const minimumBlockingTargetCount = toNonNegativeInteger(coverage.minimumBlockingTargetCount);
  const minimumBlockingSatisfiedCount = toNonNegativeInteger(coverage.minimumBlockingSatisfiedCount);
  const minimumBlockingMissingCount = toNonNegativeInteger(
    coverage.minimumBlockingMissingCount,
    Math.max(0, minimumBlockingTargetCount - minimumBlockingSatisfiedCount),
  );
  const nextAction =
    cleanText(coverage.nextAction) ||
    (status === "ready"
      ? "最近真实值 dry-run 已证明最小阻塞补值覆盖；负责人确认后可正式合并。"
      : baseReady && fileBindingRequired && !fileBindingReady
        ? cleanText(fileBindingStatus.nextAction)
        : status === "stale_or_expired"
          ? freshness.nextAction
          : status === "stale_or_mismatched"
            ? "用当前交接包最小片段重新执行真实值 dry-run，刷新上线状态后再正式合并。"
            : status === "blocked"
              ? "按 dry-run 阻塞项修正真实值片段，重新执行真实值 dry-run。"
              : status === "not_included"
                ? "先运行真实值 dry-run 并刷新上线状态，再启用正式合并。"
                : "先生成生产环境 / 持久化第一阶段真实值 dry-run 报告。");
  return {
    available,
    status,
    ready,
    included,
    statusLabel: getDryRunProofStatusLabel(status),
    label: getDryRunProofLabel(status),
    checkedAt: freshness.checkedAt,
    dryRunCheckedAt: freshness.checkedAt,
    freshnessStatus: freshness.status,
    fresh: freshness.ready,
    freshnessLabel: freshness.label,
    maxAgeHours: freshness.maxAgeHours,
    ageHours: freshness.ageHours,
    expiresAt: freshness.expiresAt,
    remainingHours: freshness.remainingHours,
    checkedAtIncluded: freshness.checkedAtIncluded,
    firstStageStatus: cleanText(execution.status) || (available ? "blocked" : "missing"),
    firstStageLabel: cleanText(executionSummary.label),
    minimumBlockingReady,
    minimumBlockingLabel:
      cleanText(coverage.minimumBlockingLabel) || `${minimumBlockingSatisfiedCount}/${minimumBlockingTargetCount}`,
    minimumBlockingTargetCount,
    minimumBlockingSatisfiedCount,
    minimumBlockingMissingCount,
    envPreflightReady,
    envPreflightLabel: cleanText(coverage.envPreflightLabel),
    intakeLabel: cleanText(coverage.intakeLabel),
    dryRunMatchesCurrentMinimumPath,
    valuesFingerprintStatus: cleanText(fileBindingStatus.status),
    valuesFingerprintStatusLabel: cleanText(fileBindingStatus.statusLabel),
    valuesFingerprintCompared: fileBindingStatus.valuesFingerprintCompared === true,
    valuesFingerprintIncluded: fileBindingStatus.valuesFingerprintIncluded === true,
    valuesFingerprintMatched: fileBindingStatus.valuesFingerprintMatched === true,
    valuesFingerprintDigestExposed: false,
    valuesFingerprintValuesExposed: false,
    valuesFileUnchangedAfterProof: fileBindingStatus.valuesFileUnchangedAfterProof === true,
    targetEnvFileUnchangedAfterProof: fileBindingStatus.targetEnvFileUnchangedAfterProof === true,
    fileBindingStatus,
    currentMinimumBlockingTargetSignatureIncluded: Boolean(currentMinimumBlockingTargetSignature),
    dryRunMinimumBlockingTargetSignatureIncluded: Boolean(dryRunMinimumBlockingTargetSignature),
    targetWouldBeWritten: false,
    nextAction,
    safeguards: buildDryRunProofSafeguards({ freshness, fileBindingStatus }),
  };
}

export function buildV1ProductionEnvValuesDryRunProofFileBindingStatus(
  {
    valuesFileConfig = {},
    configuredValuesFileCount = null,
    checkFileBinding = false,
    source = {},
  } = {},
  { readProofReport = null } = {},
) {
  const embeddedSource = isPlainObject(source?.fileBindingStatus)
    ? source.fileBindingStatus
    : isPlainObject(source)
      ? source
      : {};
  const normalizedConfiguredValuesFileCount = toNonNegativeInteger(
    configuredValuesFileCount ?? valuesFileConfig.configuredEnvFileCount ?? valuesFileConfig.envFiles?.length,
  );
  const buildBase = ({
    status = "not_checked",
    ready = false,
    checked = false,
    statusLabel = "",
    label = "",
    nextAction = "",
    valuesFingerprintCompared = false,
    valuesFingerprintIncluded = false,
    valuesFingerprintMatched = false,
    valuesFileUnchangedAfterProof = false,
    targetEnvFileUnchangedAfterProof = false,
    proofReportStatus = "",
    proofReportReady = false,
    blockingCount = 0,
    blockingKeys = [],
  } = {}) => ({
    available: true,
    status,
    ready: ready === true,
    checked: checked === true,
    statusLabel: statusLabel || buildV1ProductionEnvValuesFingerprintStatusLabel(status),
    label: label || buildV1ProductionEnvValuesFingerprintStatusLabel(status),
    valuesFingerprintCompared: valuesFingerprintCompared === true,
    valuesFingerprintIncluded: valuesFingerprintIncluded === true,
    valuesFingerprintMatched: valuesFingerprintMatched === true,
    valuesFingerprintDigestExposed: false,
    valuesFingerprintValuesExposed: false,
    valuesFileUnchangedAfterProof: valuesFileUnchangedAfterProof === true,
    targetEnvFileUnchangedAfterProof: targetEnvFileUnchangedAfterProof === true,
    proofReportStatus: cleanText(proofReportStatus),
    proofReportReady: proofReportReady === true,
    blockingCount: toNonNegativeInteger(blockingCount),
    blockingKeys: Array.isArray(blockingKeys) ? blockingKeys.map(cleanText).filter(Boolean).slice(0, 8) : [],
    nextAction:
      cleanText(nextAction) ||
      (ready === true
        ? "真实值片段指纹已和最近 dry-run 报告匹配。"
        : "重新执行当前真实值片段的 dry-run，确认通过后再正式合并。"),
    safeguards: {
      nonMutating: true,
      valuesFilePathExposed: false,
      targetEnvFilePathExposed: false,
      envValuesIncluded: false,
      secretValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      commandValuesIncluded: false,
      spoolPathIncluded: false,
      localPathExposed: false,
      valuesFingerprintDigestExposed: false,
      valuesFingerprintValuesExposed: false,
    },
  });

  const embeddedStatus = cleanText(embeddedSource.valuesFingerprintStatus);
  if (checkFileBinding !== true) {
    return buildBase({
      status: embeddedStatus || "not_checked",
      ready: embeddedSource.valuesFingerprintMatched === true,
      checked: embeddedSource.valuesFingerprintCompared === true,
      statusLabel: cleanText(embeddedSource.valuesFingerprintStatusLabel),
      valuesFingerprintCompared: embeddedSource.valuesFingerprintCompared === true,
      valuesFingerprintIncluded: embeddedSource.valuesFingerprintIncluded === true,
      valuesFingerprintMatched: embeddedSource.valuesFingerprintMatched === true,
      valuesFileUnchangedAfterProof: embeddedSource.valuesFileUnchangedAfterProof === true,
      targetEnvFileUnchangedAfterProof: embeddedSource.targetEnvFileUnchangedAfterProof === true,
      nextAction: cleanText(embeddedSource.nextAction),
    });
  }

  const envFiles = Array.isArray(valuesFileConfig.envFiles) ? valuesFileConfig.envFiles : [];
  if (normalizedConfiguredValuesFileCount !== 1 || !envFiles[0]) {
    return buildBase({
      status: normalizedConfiguredValuesFileCount > 1 ? "values_file_count_invalid" : "not_configured",
      checked: false,
      nextAction:
        normalizedConfiguredValuesFileCount > 1
          ? "只保留一个安全未跟踪真实值片段来源，重启 API 后重新 dry-run。"
          : "先配置服务端真实值片段来源并执行 dry-run。",
    });
  }

  try {
    if (typeof readProofReport !== "function") throw new Error("Proof report reader is unavailable");
    const report = readProofReport({ valuesEnvFile: envFiles[0], maxAgeHours: getV1ProductionEnvValuesDryRunProofMaxAgeHours() });
    const blockingFindings = Array.isArray(report?.blockingFindings) ? report.blockingFindings : [];
    const blockingKeys = blockingFindings.map((item) => cleanText(item?.key)).filter(Boolean);
    const status = report?.ready === true ? "matched" : mapV1ProductionEnvValuesDryRunProofFileBindingStatus(blockingKeys);
    return buildBase({
      status,
      ready: report?.ready === true,
      checked: true,
      label: cleanText(report?.summary?.label),
      valuesFingerprintCompared: report?.safeguards?.valuesEnvFileFingerprintCompared === true,
      valuesFingerprintIncluded: report?.summary?.valuesFingerprintIncluded === true,
      valuesFingerprintMatched: report?.summary?.valuesFingerprintMatched === true,
      valuesFileUnchangedAfterProof: report?.summary?.valuesFileUnchangedAfterProof === true,
      targetEnvFileUnchangedAfterProof: report?.summary?.targetEnvFileUnchangedAfterProof === true,
      proofReportStatus: report?.status,
      proofReportReady: report?.ready === true,
      blockingCount: blockingFindings.length,
      blockingKeys,
      nextAction: report?.nextActions?.map(cleanText).find(Boolean),
    });
  } catch {
    return buildBase({
      status: "proof_check_error",
      checked: true,
      blockingCount: 1,
      blockingKeys: ["dry-run-proof-check-error"],
      nextAction: "由技术/管理检查服务端真实值片段、production env setup 报告和 dry-run proof latest 后重试。",
    });
  }
}

export function isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus(status) {
  return [
    "values_fingerprint_mismatch",
    "values_fingerprint_missing",
    "values_fingerprint_invalid",
    "values_fingerprint_unreadable",
    "values_file_changed_after_proof",
    "target_file_changed_after_proof",
    "target_source_mismatch",
    "file_binding_blocked",
    "proof_check_error",
  ].includes(cleanText(status));
}

function mapV1ProductionEnvValuesDryRunProofFileBindingStatus(blockingKeys = []) {
  const keySet = new Set(Array.isArray(blockingKeys) ? blockingKeys : []);
  if (keySet.has("values-env-file-fingerprint-mismatch")) return "values_fingerprint_mismatch";
  if (keySet.has("values-env-file-fingerprint-algorithm-mismatch")) return "values_fingerprint_invalid";
  if (keySet.has("dry-run-values-fingerprint-invalid")) return "values_fingerprint_invalid";
  if (keySet.has("dry-run-values-fingerprint-missing")) return "values_fingerprint_missing";
  if (keySet.has("values-env-file-fingerprint-unreadable")) return "values_fingerprint_unreadable";
  if (keySet.has("values-env-file-newer-than-dry-run")) return "values_file_changed_after_proof";
  if (keySet.has("target-env-file-newer-than-dry-run")) return "target_file_changed_after_proof";
  if (keySet.has("dry-run-proof-stale")) return "stale_or_expired";
  if (keySet.has("dry-run-target-source-mismatch")) return "target_source_mismatch";
  return "file_binding_blocked";
}

function buildV1ProductionEnvValuesFingerprintStatusLabel(status) {
  const normalizedStatus = cleanText(status);
  if (normalizedStatus === "matched") return "已匹配";
  if (normalizedStatus === "values_fingerprint_mismatch") return "指纹不一致";
  if (normalizedStatus === "values_fingerprint_missing") return "缺指纹";
  if (normalizedStatus === "values_fingerprint_invalid") return "指纹无效";
  if (normalizedStatus === "values_fingerprint_unreadable") return "片段不可读";
  if (normalizedStatus === "values_file_changed_after_proof") return "片段已修改";
  if (normalizedStatus === "target_file_changed_after_proof") return "目标 env 已修改";
  if (normalizedStatus === "stale_or_expired") return "已过期";
  if (normalizedStatus === "target_source_mismatch") return "目标来源不一致";
  if (normalizedStatus === "not_configured") return "未配置";
  if (normalizedStatus === "values_file_count_invalid") return "来源不唯一";
  if (normalizedStatus === "proof_check_error") return "检查失败";
  if (normalizedStatus === "file_binding_blocked") return "未通过";
  return "未检查";
}

function buildDefaultFileBindingStatus() {
  return {
    available: false,
    status: "not_checked",
    ready: false,
    checked: false,
    statusLabel: "未检查",
    valuesFingerprintCompared: false,
    valuesFingerprintIncluded: false,
    valuesFingerprintMatched: false,
    valuesFileUnchangedAfterProof: false,
    targetEnvFileUnchangedAfterProof: false,
    nextAction: "重新执行当前真实值片段的 dry-run，确认通过后再正式合并。",
  };
}

function getDryRunProofStatusLabel(status, fallback = "") {
  if (status === "ready") return "已通过";
  if (status === "values_fingerprint_mismatch") return "指纹不一致";
  if (status === "values_fingerprint_missing" || status === "values_fingerprint_invalid") return "缺指纹";
  if (status === "file_binding_blocked") return "片段需重跑";
  if (status === "stale_or_expired") return "已过期";
  if (status === "stale_or_mismatched") return "需重跑";
  if (status === "blocked") return "未覆盖";
  if (status === "not_included") return "未纳入";
  return fallback || "未生成";
}

function getDryRunProofLabel(status, fallback = "") {
  if (status === "ready") return "最近真实值 dry-run 证明已通过";
  if (status === "values_fingerprint_mismatch") return "最近真实值 dry-run 证明与当前真实值片段指纹不一致";
  if (status === "values_fingerprint_missing" || status === "values_fingerprint_invalid") {
    return "最近真实值 dry-run 报告缺少有效真实值片段指纹";
  }
  if (status === "file_binding_blocked") return "最近真实值 dry-run 与当前片段 / 目标 env 绑定检查未通过";
  if (status === "stale_or_expired") return "最近真实值 dry-run 已匹配当前最小补值路径，但证明已过期";
  if (status === "stale_or_mismatched") return "最近真实值 dry-run 计数已通过，但未匹配当前最小补值路径";
  if (status === "blocked") return "最近真实值 dry-run 已纳入，但最小阻塞补值未覆盖";
  if (status === "not_included") return "最近第一阶段报告未纳入真实值 dry-run";
  return fallback || "尚未生成第一阶段真实值 dry-run 证明";
}

function buildDryRunProofSafeguards({
  sourceSafeguards = null,
  freshness = {},
  fileBindingStatus = {},
  mergeSourceSafeguards = false,
} = {}) {
  const shared = {
    dryRunProofFresh: freshness.ready === true,
    dryRunProofMaxAgeHours: freshness.maxAgeHours,
    dryRunProofExpiresAt: freshness.expiresAt,
    dryRunProofRemainingHours: freshness.remainingHours,
    dryRunProofCheckedAtIncluded: freshness.checkedAtIncluded === true,
    dryRunProofValuesFingerprintCompared: fileBindingStatus.valuesFingerprintCompared === true,
    dryRunProofValuesFingerprintIncluded: fileBindingStatus.valuesFingerprintIncluded === true,
    dryRunProofValuesFingerprintMatched: fileBindingStatus.valuesFingerprintMatched === true,
    dryRunProofValuesFingerprintDigestExposed: false,
    dryRunProofValuesFingerprintValuesExposed: false,
    dryRunProofValuesFileUnchangedAfterProof: fileBindingStatus.valuesFileUnchangedAfterProof === true,
    dryRunProofTargetEnvFileUnchangedAfterProof: fileBindingStatus.targetEnvFileUnchangedAfterProof === true,
  };
  if (mergeSourceSafeguards && isPlainObject(sourceSafeguards)) return { ...sourceSafeguards, ...shared };
  return {
    nonMutating: true,
    dryRunProofValuesIncluded: false,
    dryRunProofTargetSignatureIncludesOnlyVariableNames: true,
    envValuesIncluded: false,
    secretValuesIncluded: false,
    connectionStringIncluded: false,
    objectStorageEndpointIncluded: false,
    objectStorageBucketIncluded: false,
    productionEnvValuesFilePathIncluded: false,
    envFilePathIncluded: false,
    localPathExposed: false,
    targetWouldBeWritten: false,
    ...shared,
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
