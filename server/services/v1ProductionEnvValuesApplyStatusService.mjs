import {
  getConfiguredV1ProductionEnvValuesFileConfig,
  sanitizeV1ProductionEnvFileConfigSourceStatuses,
} from "./v1ProductionEnvFileAuditService.mjs";
import { sanitizeV1ProductionEnvValuesApplyReport } from "./v1ProductionEnvValuesApplyProjectionService.mjs";
import { sanitizeV1SensitiveStatusText } from "./v1StatusTextSanitizer.mjs";
import {
  buildV1ProductionEnvValuesMinimumFillStatus,
  isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus,
} from "../v1ProductionEnvDryRunProofCore.mjs";

export function createV1ProductionEnvValuesApplyStatusService({
  buildTargetSetupStatus,
  readStatusArtifacts,
  buildDryRunProofStatus,
  buildValuesFileAuditStatus,
  sanitizeBlockingItem,
  getValuesFileConfig = getConfiguredV1ProductionEnvValuesFileConfig,
  env = process.env,
  now = () => new Date(),
} = {}) {
  requireFunction(buildTargetSetupStatus, "buildTargetSetupStatus");
  requireFunction(readStatusArtifacts, "readStatusArtifacts");
  requireFunction(buildDryRunProofStatus, "buildDryRunProofStatus");
  requireFunction(buildValuesFileAuditStatus, "buildValuesFileAuditStatus");
  requireFunction(sanitizeBlockingItem, "sanitizeBlockingItem");

  return {
    buildGateStatus,
    buildResponseBody,
    buildServerConfigGuidance,
  };

  function buildGateStatus({
    productionEnvIntakeVerification = null,
    productionFirstStageExecution = null,
  } = {}) {
    const valuesFileConfig = getValuesFileConfig(env);
    const configuredValuesFileCount = nonNegativeInteger(valuesFileConfig?.configuredEnvFileCount);
    const applyEnabled = isApplyEnabled(env);
    const targetSetupStatus = sanitizeTargetSetupStatusProjection(
      buildTargetSetupStatus(),
      sanitizeBlockingItem,
    );
    const targetSetupReady = targetSetupStatus?.ready === true;
    const valuesFileAuditStatus = sanitizeValuesFileAuditStatusProjection(
      buildValuesFileAuditStatus({ valuesFileConfig, configuredValuesFileCount }),
      sanitizeBlockingItem,
    );
    const valuesFileAuditReady = valuesFileAuditStatus?.ready === true;
    const minimumFillStatus = buildV1ProductionEnvValuesMinimumFillStatus(
      productionEnvIntakeVerification,
    );
    const dryRunProofStatus = sanitizeDryRunProofStatusProjection(
      buildDryRunProofStatus(productionFirstStageExecution, minimumFillStatus),
    );
    const dryRunProofReady = dryRunProofStatus?.ready === true;
    const ready =
      applyEnabled &&
      configuredValuesFileCount === 1 &&
      targetSetupReady &&
      valuesFileAuditReady &&
      dryRunProofReady;
    const status = resolveApplyGateStatus({
      ready,
      applyEnabled,
      configuredValuesFileCount,
      targetSetupReady,
      valuesFileAuditReady,
      dryRunProofStatus,
    });
    const serverConfigGuidance = buildServerConfigGuidance({
      valuesFileConfig,
      configuredValuesFileCount,
      ready,
      status,
      applyEnabled,
      targetSetupStatus,
      valuesFileAuditStatus,
      productionEnvMinimumFillStatus: minimumFillStatus,
      productionEnvValuesDryRunProofStatus: dryRunProofStatus,
    });
    const label = buildApplyGateLabel({
      ready,
      applyEnabled,
      configuredValuesFileCount,
      targetSetupReady,
      valuesFileAuditReady,
      dryRunProofStatus,
    });
    const nextAction = buildApplyGateNextAction({
      ready,
      applyEnabled,
      configuredValuesFileCount,
      targetSetupReady,
      valuesFileAuditReady,
      targetSetupStatus,
      valuesFileAuditStatus,
      dryRunProofStatus,
    });
    const sourceSummary = buildSourceSummary(
      valuesFileConfig,
      serverConfigGuidance,
      configuredValuesFileCount,
    );
    const targetAuditSummary = buildTargetAuditSummary(targetSetupStatus, valuesFileAuditStatus);
    const proofSummary = buildDryRunProofSummary(dryRunProofStatus);
    const proofSafeguards = buildDryRunProofSafeguards(dryRunProofStatus, {
      includeMinimumCounts: true,
    });

    return {
      available: true,
      status,
      ready,
      summary: {
        label,
        applyEnabled,
        applyEnableEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED",
        ...sourceSummary,
        primaryEnvVariable: serverConfigGuidance.primaryEnvVariable,
        fallbackEnvVariables: serverConfigGuidance.fallbackEnvVariables,
        requestBodyIgnored: true,
        acceptsFrontendPath: false,
        valuesFilePathAccepted: false,
        valuesFilePathExposed: false,
        targetEnvFromProductionSetup: true,
        targetEnvFilePathExposed: false,
        ...targetAuditSummary,
        ...proofSummary,
        intakeVerificationStatus: minimumFillStatus.intakeVerificationStatus,
        intakeVerificationReady: minimumFillStatus.intakeVerificationReady,
        intakeVerificationAvailable: minimumFillStatus.available,
        minimumBlockingReady: minimumFillStatus.minimumBlockingReady,
        minimumBlockingLabel: minimumFillStatus.minimumBlockingLabel,
        minimumBlockingTargetCount: minimumFillStatus.minimumBlockingTargetCount,
        minimumBlockingSatisfiedCount: minimumFillStatus.minimumBlockingSatisfiedCount,
        minimumBlockingMissingCount: minimumFillStatus.minimumBlockingMissingCount,
        minimumBlockingVariableRowCount: minimumFillStatus.minimumBlockingVariableRowCount,
        minimumBlockingAlternativeGroupCount: minimumFillStatus.minimumBlockingAlternativeGroupCount,
        minimumWarningLabel: minimumFillStatus.minimumWarningLabel,
        minimumWarningMissingCount: minimumFillStatus.minimumWarningMissingCount,
        fullIntakeConfiguredLabel: minimumFillStatus.fullIntakeConfiguredLabel,
        targetEnvFileMayBeMutated: ready,
        applyExecuted: false,
        productionEnvFileMutated: false,
        businessDataMutated: false,
        schemaMigrationApplyExecuted: false,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
      },
      targetSetupStatus,
      valuesFileAuditStatus,
      dryRunProofStatus,
      serverConfigGuidance,
      nextAction,
      safeguards: {
        nonMutating: true,
        applyRequiresServerFlag: true,
        requestBodyIgnored: true,
        valuesFilePathAcceptedFromFrontend: false,
        valuesFilePathAcceptedFromRequest: false,
        valuesFilePathValueIncluded: false,
        valuesFileReadFromServerConfigOnly: true,
        sourceVariableNamesOnly: true,
        targetEnvFileComesFromProductionSetup: true,
        valuesFilePathExposed: false,
        targetEnvFilePathExposed: false,
        targetSetupReady,
        targetSetupReportAvailable: targetAuditSummary.targetSetupReportAvailable,
        targetEnvFileConfigured: targetAuditSummary.targetEnvFileConfigured,
        targetEnvFileMayBeMutated: ready,
        valuesFileAuditReady,
        valuesFileAuditStatus: targetAuditSummary.valuesFileAuditStatus,
        valuesFileAuditPathExposed: false,
        valuesFileAuditValuesIncluded: false,
        ...proofSafeguards,
        minimumBlockingReady: minimumFillStatus.minimumBlockingReady,
        minimumBlockingTargetCount: minimumFillStatus.minimumBlockingTargetCount,
        minimumBlockingMissingCount: minimumFillStatus.minimumBlockingMissingCount,
        applyExecuted: false,
        productionEnvFileMutated: false,
        businessDataMutated: false,
        schemaMigrationApplyExecuted: false,
        physicalPrinterCalled: false,
        driverDeliveryStatusChanged: false,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
        envValuesIncluded: false,
        secretValuesIncluded: false,
        connectionStringIncluded: false,
        objectStorageEndpointIncluded: false,
        objectStorageBucketIncluded: false,
        commandValuesIncluded: false,
        localPathExposed: false,
        declaresFullV1Complete: false,
      },
    };
  }

  function buildResponseBody({
    operatorId,
    checkedAt,
    status,
    ready,
    applyEnabled = false,
    report = {},
    valuesFileConfig = {},
    configuredValuesFileCount = 0,
    targetSetupStatus = null,
    valuesFileAuditStatus = null,
    dryRunProofStatus = null,
    blockingItems = [],
    nextAction = "",
    error = null,
  } = {}) {
    const applyReport = sanitizeV1ProductionEnvValuesApplyReport(report);
    const rawTargetSetupStatus =
      isPlainObject(targetSetupStatus) && targetSetupStatus.available === true
        ? targetSetupStatus
        : buildTargetSetupStatus();
    const resolvedTargetSetupStatus = sanitizeTargetSetupStatusProjection(
      rawTargetSetupStatus,
      sanitizeBlockingItem,
    );
    const targetSetupReady = resolvedTargetSetupStatus?.ready === true;
    const rawValuesFileAuditStatus =
      isPlainObject(valuesFileAuditStatus) && valuesFileAuditStatus.available === true
        ? valuesFileAuditStatus
        : buildValuesFileAuditStatus({ valuesFileConfig, configuredValuesFileCount });
    const resolvedValuesFileAuditStatus = sanitizeValuesFileAuditStatusProjection(
      rawValuesFileAuditStatus,
      sanitizeBlockingItem,
    );
    const valuesFileAuditReady = resolvedValuesFileAuditStatus?.ready === true;
    const normalizedConfiguredValuesFileCount = nonNegativeInteger(configuredValuesFileCount);
    const rawDryRunProofStatus =
      isPlainObject(dryRunProofStatus) && dryRunProofStatus.status
        ? dryRunProofStatus
        : buildDryRunProofStatus(
            readStatusArtifacts()?.productionFirstStageExecution?.value,
            null,
            {
              valuesFileConfig,
              configuredValuesFileCount: normalizedConfiguredValuesFileCount,
              checkFileBinding: normalizedConfiguredValuesFileCount === 1,
            },
          );
    const resolvedDryRunProofStatus = sanitizeDryRunProofStatusProjection(rawDryRunProofStatus);
    const dryRunProofReady = resolvedDryRunProofStatus?.ready === true;
    const sourceSummary = buildSourceSummary(
      valuesFileConfig,
      { sourceStatuses: sanitizeSourceStatuses(valuesFileConfig) },
      normalizedConfiguredValuesFileCount,
    );
    const targetAuditSummary = buildTargetAuditSummary(
      resolvedTargetSetupStatus,
      resolvedValuesFileAuditStatus,
    );
    const proofSummary = buildDryRunProofSummary(resolvedDryRunProofStatus);
    const proofSafeguards = buildDryRunProofSafeguards(resolvedDryRunProofStatus);
    const sanitizedBlockingItems = Array.isArray(blockingItems)
      ? blockingItems.map(sanitizeBlockingItem).filter(Boolean)
      : [];
    const resultStatus =
      safeStatus(status) || applyReport.status || (ready === true ? "ready" : "blocked");
    const applied = applyReport.targetEnvFile.applied === true;
    const targetEnvFileMayBeMutated =
      applyEnabled === true &&
      normalizedConfiguredValuesFileCount === 1 &&
      targetSetupReady &&
      valuesFileAuditReady &&
      dryRunProofReady;
    const blockingCount = sanitizedBlockingItems.length + applyReport.blockingFindings.length;
    const label = getApplyResponseLabel({ ready, resultStatus, applied });
    const resolvedNextAction =
      safeText(nextAction) ||
      applyReport.nextActions[0] ||
      (ready === true
        ? "用已合并的安全 env 文件重启生产 API，并继续第一阶段持久化留证。"
        : "先完成 dry-run、启用服务端正式合并开关并补齐安全真实值片段后重试。");
    const body = {
      version: "p0-v1-production-first-stage-values-apply-live-run-v1",
      scope: "v1_production_first_stage_values_apply_live_run",
      status: resultStatus,
      ready: ready === true,
      checkedAt: safeText(applyReport.checkedAt || checkedAt) || now().toISOString(),
      operatorId: cleanText(operatorId),
      summary: {
        label,
        applyEnabled: applyEnabled === true,
        applyEnableEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED",
        ...sourceSummary,
        requestBodyIgnored: true,
        valuesFilePathAccepted: false,
        valuesFilePathExposed: false,
        targetEnvFromProductionSetup: true,
        targetEnvFilePathExposed: false,
        ...targetAuditSummary,
        ...proofSummary,
        targetEnvFileMayBeMutated,
        productionEnvFileMutated: applied,
        targetEnvChanged: applyReport.targetEnvFile.changed === true,
        targetFileMode0600: applyReport.safeguards.targetFileMode0600 === true,
        appliedVariableCount: applyReport.summary.appliedVariableCount,
        applicableValueCount: applyReport.summary.applicableValueCount,
        blankSourceValueCount: applyReport.summary.blankSourceValueCount,
        unknownSourceVariableCount: applyReport.summary.unknownSourceVariableCount,
        setupReady: applyReport.summary.setupReady,
        envPreflightReady: applyReport.summary.envPreflightReady,
        envPreflightLabel: `${applyReport.summary.envPreflightPassedCount}/${applyReport.summary.envPreflightTotalCount}`,
        intakeVerificationReady: applyReport.summary.intakeVerificationReady,
        intakeVerificationBlockingCount: applyReport.summary.intakeVerificationBlockingCount,
        intakeVerificationWarningCount: applyReport.summary.intakeVerificationWarningCount,
        businessDataMutated: false,
        schemaMigrationApplyExecuted: false,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
        blockingCount,
        blockerLabel: `${blockingCount} 项`,
        warningCount: applyReport.summary.warningCount,
      },
      applyReport,
      targetSetupStatus: resolvedTargetSetupStatus,
      valuesFileAuditStatus: resolvedValuesFileAuditStatus,
      dryRunProofStatus: resolvedDryRunProofStatus,
      blockingItems: sanitizedBlockingItems,
      blockingFindings: applyReport.blockingFindings,
      warningFindings: applyReport.warningFindings,
      serverConfigGuidance: buildServerConfigGuidance({
        valuesFileConfig,
        configuredValuesFileCount: normalizedConfiguredValuesFileCount,
        ready: ready === true,
        status: resultStatus,
        applyEnabled,
        targetSetupStatus: resolvedTargetSetupStatus,
        valuesFileAuditStatus: resolvedValuesFileAuditStatus,
        productionEnvValuesDryRunProofStatus: resolvedDryRunProofStatus,
      }),
      nextActions: [resolvedNextAction, ...applyReport.nextActions].filter(Boolean).slice(0, 8),
      nextAction: resolvedNextAction,
      safeguards: {
        nonMutating: applied !== true,
        requestBodyIgnored: true,
        valuesFilePathAcceptedFromRequest: false,
        valuesFileReadFromServerConfigOnly: true,
        valuesFilePathExposed: false,
        targetEnvFilePathExposed: false,
        targetEnvComesFromProductionSetup: true,
        targetSetupReady,
        targetSetupReportAvailable: targetAuditSummary.targetSetupReportAvailable,
        targetEnvFileConfigured: targetAuditSummary.targetEnvFileConfigured,
        targetEnvFileMayBeMutated,
        valuesFileAuditReady,
        valuesFileAuditStatus: targetAuditSummary.valuesFileAuditStatus,
        valuesFileAuditPathExposed: false,
        valuesFileAuditValuesIncluded: false,
        ...proofSafeguards,
        productionEnvFileMutated: applied,
        targetFileMode0600: applyReport.safeguards.targetFileMode0600 === true,
        rawCommandIncluded: false,
        rawCommandStdoutIncluded: false,
        rawCommandStderrIncluded: false,
        rawApplyReportIncluded: false,
        rawProductionEnvValuesFileIncluded: false,
        rawEnvFileIncluded: false,
        rawEnvLineIncluded: false,
        envValuesIncluded: false,
        secretValuesIncluded: false,
        connectionStringIncluded: false,
        objectStorageEndpointIncluded: false,
        objectStorageBucketIncluded: false,
        commandValuesIncluded: false,
        spoolPathIncluded: false,
        tokenIncluded: false,
        localPathExposed: false,
        businessDataMutated: false,
        schemaMigrationApplyExecuted: false,
        physicalPrinterCalled: false,
        driverDeliveryStatusChanged: false,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
        declaresFullV1Complete: false,
      },
    };
    const sanitizedError = sanitizeResponseError(error);
    return sanitizedError ? { ...body, error: sanitizedError } : body;
  }

  function buildServerConfigGuidance({
    valuesFileConfig = {},
    configuredValuesFileCount = 0,
    ready = false,
    status = "disabled",
    applyEnabled = false,
    targetSetupStatus = null,
    valuesFileAuditStatus = null,
    productionEnvMinimumFillStatus = null,
    productionEnvValuesDryRunProofStatus = null,
  } = {}) {
    const normalizedConfiguredValuesFileCount = nonNegativeInteger(configuredValuesFileCount);
    const rawTargetSetupStatus =
      isPlainObject(targetSetupStatus) && targetSetupStatus.available === true
        ? targetSetupStatus
        : buildTargetSetupStatus();
    const resolvedTargetSetupStatus = sanitizeTargetSetupStatusProjection(
      rawTargetSetupStatus,
      sanitizeBlockingItem,
    );
    const targetSetupReady = resolvedTargetSetupStatus?.ready === true;
    const rawValuesFileAuditStatus =
      isPlainObject(valuesFileAuditStatus) && valuesFileAuditStatus.available === true
        ? valuesFileAuditStatus
        : buildValuesFileAuditStatus({
            valuesFileConfig,
            configuredValuesFileCount: normalizedConfiguredValuesFileCount,
          });
    const resolvedValuesFileAuditStatus = sanitizeValuesFileAuditStatusProjection(
      rawValuesFileAuditStatus,
      sanitizeBlockingItem,
    );
    const valuesFileAuditReady = resolvedValuesFileAuditStatus?.ready === true;
    const minimumFillStatus = buildV1ProductionEnvValuesMinimumFillStatus(
      productionEnvMinimumFillStatus,
    );
    const dryRunProofStatus = sanitizeDryRunProofStatusProjection(
      buildDryRunProofStatus(productionEnvValuesDryRunProofStatus, minimumFillStatus, {
          valuesFileConfig,
          configuredValuesFileCount: normalizedConfiguredValuesFileCount,
          checkFileBinding: normalizedConfiguredValuesFileCount === 1,
        }),
    );
    const dryRunProofReady = dryRunProofStatus?.ready === true;
    const sourceSummary = buildSourceSummary(
      valuesFileConfig,
      { sourceStatuses: sanitizeSourceStatuses(valuesFileConfig) },
      normalizedConfiguredValuesFileCount,
    );
    const targetAuditSummary = buildTargetAuditSummary(
      resolvedTargetSetupStatus,
      resolvedValuesFileAuditStatus,
    );

    return {
      label: applyEnabled ? "正式合并开关已启用" : "正式合并开关未启用",
      status: applyEnabled ? "enabled" : "disabled",
      ready: ready === true,
      applyEnableEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED",
      applyEnabled: applyEnabled === true,
      primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
      fallbackEnvVariables: [
        "ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE",
        "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE",
      ],
      ...sourceSummary,
      targetSetupStatus: resolvedTargetSetupStatus,
      targetSetupReady,
      targetSetupReportAvailable: targetAuditSummary.targetSetupReportAvailable,
      targetSetupEnvFileCount: targetAuditSummary.targetSetupEnvFileCount,
      targetEnvFileConfigured: targetAuditSummary.targetEnvFileConfigured,
      valuesFileAuditStatus: targetAuditSummary.valuesFileAuditStatus,
      valuesFileAuditReady,
      valuesFileAuditExecuted: targetAuditSummary.valuesFileAuditExecuted,
      valuesFileAuditBlockingCount: targetAuditSummary.valuesFileAuditBlockingCount,
      valuesFileAuditWarningCount: targetAuditSummary.valuesFileAuditWarningCount,
      valuesFileAuditPathExposed: false,
      valuesFileAuditValuesIncluded: false,
      ...buildDryRunProofSummary(dryRunProofStatus),
      intakeVerificationStatus: minimumFillStatus.intakeVerificationStatus,
      intakeVerificationReady: minimumFillStatus.intakeVerificationReady,
      intakeVerificationAvailable: minimumFillStatus.available,
      minimumBlockingReady: minimumFillStatus.minimumBlockingReady,
      minimumBlockingLabel: minimumFillStatus.minimumBlockingLabel,
      minimumBlockingTargetCount: minimumFillStatus.minimumBlockingTargetCount,
      minimumBlockingSatisfiedCount: minimumFillStatus.minimumBlockingSatisfiedCount,
      minimumBlockingMissingCount: minimumFillStatus.minimumBlockingMissingCount,
      minimumBlockingVariableRowCount: minimumFillStatus.minimumBlockingVariableRowCount,
      minimumBlockingAlternativeGroupCount: minimumFillStatus.minimumBlockingAlternativeGroupCount,
      minimumWarningLabel: minimumFillStatus.minimumWarningLabel,
      minimumWarningMissingCount: minimumFillStatus.minimumWarningMissingCount,
      fullIntakeConfiguredLabel: minimumFillStatus.fullIntakeConfiguredLabel,
      acceptsFrontendPath: false,
      pathValueExposed: false,
      targetEnvFilePathExposed: false,
      restartRequired: true,
      currentApplyStatus: safeStatus(status) || "unknown",
      steps: [
        "先在上线状态页或命令行完成真实值 dry-run，并确认最近第一阶段 latest 已纳入该 dry-run 证明。",
        "由技术/管理在 API 进程环境中配置 ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED=true；默认关闭时不会写目标 env。",
        "确保 ERP_V1_PRODUCTION_ENV_VALUES_FILE 只指向一个安全未跟踪的真实值片段；不要从浏览器传路径或 env 值。",
        "确认 production env setup latest 已 ready，且目标安全 env 文件已 git ignore、未跟踪、权限为 600。",
        "确认最近真实值 dry-run 证明仍在有效期内；默认超过 24 小时必须重新 dry-run。",
        "重启 API 后执行正式合并；合并只写 production env setup 的目标安全 env 草稿，不执行迁移、不刷新候选、不写业务数据。",
      ],
      verificationActions: [
        "node scripts/run-v1-production-env-intake-apply.mjs --values-env-file <secure-values-env-fragment> --json",
        "POST /api/system/v1-production-first-stage-values-apply/live-run",
      ],
      safeguards: {
        applyRequiresServerFlag: true,
        valuesFilePathAcceptedFromFrontend: false,
        valuesFilePathValueIncluded: false,
        targetEnvFileComesFromProductionSetup: true,
        targetSetupReady,
        targetSetupReportAvailable: targetAuditSummary.targetSetupReportAvailable,
        targetEnvFileConfigured: targetAuditSummary.targetEnvFileConfigured,
        targetEnvFilePathExposed: false,
        valuesFileAuditReady,
        valuesFileAuditStatus: targetAuditSummary.valuesFileAuditStatus,
        valuesFileAuditPathExposed: false,
        valuesFileAuditValuesIncluded: false,
        ...buildDryRunProofSafeguards(dryRunProofStatus),
        minimumBlockingReady: minimumFillStatus.minimumBlockingReady,
        minimumBlockingTargetCount: minimumFillStatus.minimumBlockingTargetCount,
        minimumBlockingMissingCount: minimumFillStatus.minimumBlockingMissingCount,
        sourceVariableNamesOnly: true,
        envValuesIncluded: false,
        commandValuesIncluded: false,
        secretValuesIncluded: false,
        productionEnvFileMayBeMutated:
          applyEnabled === true &&
          normalizedConfiguredValuesFileCount === 1 &&
          targetSetupReady &&
          valuesFileAuditReady &&
          dryRunProofReady,
        businessDataMutated: false,
        schemaMigrationApplyExecuted: false,
      },
    };
  }


}

function resolveApplyGateStatus({
  ready,
  applyEnabled,
  configuredValuesFileCount,
  targetSetupReady,
  valuesFileAuditReady,
  dryRunProofStatus,
}) {
  if (ready) return "enabled";
  if (!applyEnabled) return "disabled";
  if (configuredValuesFileCount > 1) return "multiple_configured";
  if (configuredValuesFileCount === 0) return "not_configured";
  if (!valuesFileAuditReady) return "audit_blocked";
  if (!targetSetupReady) return "target_not_ready";
  if (dryRunProofStatus?.status === "stale_or_expired") return "dry_run_expired";
  if (dryRunProofStatus?.status === "stale_or_mismatched") return "dry_run_stale_or_mismatched";
  if (isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus(dryRunProofStatus?.status)) {
    return "dry_run_file_binding_blocked";
  }
  return dryRunProofStatus?.ready === true ? "target_not_ready" : "dry_run_not_ready";
}

function buildApplyGateLabel({
  ready,
  applyEnabled,
  configuredValuesFileCount,
  targetSetupReady,
  valuesFileAuditReady,
  dryRunProofStatus,
}) {
  if (ready) return "正式合并开关已启用，真实值 dry-run 证明、片段审计和目标 env 均已就绪";
  if (!applyEnabled) return "正式合并开关未启用";
  if (configuredValuesFileCount > 1) return "正式合并前真实值片段来源不唯一";
  if (configuredValuesFileCount === 0) return "正式合并开关已启用，但真实值片段未配置";
  if (!valuesFileAuditReady) return "正式合并开关已启用，但真实值片段安全审计未通过";
  if (!targetSetupReady) return "正式合并开关已启用，但目标生产 env 安全草稿未就绪";
  if (dryRunProofStatus?.status === "stale_or_expired") {
    return "正式合并开关已启用，但最近真实值 dry-run 证明已过期";
  }
  if (dryRunProofStatus?.status === "stale_or_mismatched") {
    return "正式合并开关已启用，但最近真实值 dry-run 未匹配当前最小补值路径";
  }
  if (isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus(dryRunProofStatus?.status)) {
    return "正式合并开关已启用，但最近真实值 dry-run 片段指纹绑定未通过";
  }
  return "正式合并开关已启用，但最近真实值 dry-run 证明未通过";
}

function buildApplyGateNextAction({
  ready,
  applyEnabled,
  configuredValuesFileCount,
  targetSetupReady,
  valuesFileAuditReady,
  targetSetupStatus,
  valuesFileAuditStatus,
  dryRunProofStatus,
}) {
  if (ready) return "真实值 dry-run 通过并由负责人确认后，可执行正式合并真实值。";
  if (!applyEnabled) {
    return "先完成真实值 dry-run；负责人确认后在 API 进程配置 ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED=true，重启 API 后再正式合并。";
  }
  if (configuredValuesFileCount > 1) {
    return "只保留一个安全未跟踪真实值片段来源，重启 API 后再执行正式合并。";
  }
  if (configuredValuesFileCount === 0) {
    return "在 API 进程配置 ERP_V1_PRODUCTION_ENV_VALUES_FILE，指向安全未跟踪真实值片段并重启 API。";
  }
  if (!valuesFileAuditReady) {
    return safeText(valuesFileAuditStatus?.nextAction) ||
      "先修正真实值片段文件安全审计阻塞项，再重启 API 后执行正式合并。";
  }
  if (!targetSetupReady) {
    return safeText(targetSetupStatus?.nextAction) ||
      "先重新运行 production env setup，确认目标安全 env 文件 ready 后再执行正式合并。";
  }
  return safeText(dryRunProofStatus?.nextAction) ||
    "先完成真实值 dry-run 并刷新上线状态，再执行正式合并。";
}

function buildSourceSummary(valuesFileConfig = {}, guidance = {}, configuredValuesFileCount = null) {
  const count = configuredValuesFileCount === null
    ? nonNegativeInteger(valuesFileConfig?.configuredEnvFileCount)
    : nonNegativeInteger(configuredValuesFileCount);
  return {
    configuredValuesFileCount: count,
    valuesFilePathConfigured: count > 0,
    selectedEnvVariable: safeVariableName(valuesFileConfig?.selectedEnvVariable),
    selectedEnvVariableLabel: safeText(valuesFileConfig?.selectedEnvVariableLabel) || "未配置",
    selectedSourceKind: safeStatus(valuesFileConfig?.selectedSourceKind) || "none",
    fallbackSourceUsed: valuesFileConfig?.fallbackSourceUsed === true,
    configuredSourceVariableCount: nonNegativeInteger(valuesFileConfig?.configuredSourceVariableCount),
    sourceStatuses: Array.isArray(guidance?.sourceStatuses)
      ? guidance.sourceStatuses
      : sanitizeSourceStatuses(valuesFileConfig),
  };
}

function sanitizeSourceStatuses(valuesFileConfig = {}) {
  return sanitizeV1ProductionEnvFileConfigSourceStatuses(valuesFileConfig)
    .map((item) => ({
      envVariable: safeVariableName(item.envVariable),
      kind: safeStatus(item.kind) || "fallback",
      label: safeText(item.label) || "变量",
      order: nonNegativeInteger(item.order),
      selectable: item.selectable !== false,
      configured: item.configured === true,
      selected: item.selected === true,
      ignored: item.ignored === true,
      envFileCount: nonNegativeInteger(item.envFileCount),
    }))
    .filter((item) => item.envVariable);
}

function sanitizeTargetSetupStatusProjection(value = {}, sanitizeBlockingItem) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  return {
    available: source.available === true,
    status: safeStatus(source.status) || "blocked",
    ready: source.ready === true,
    summary: {
      label: safeText(summary.label),
      setupReportAvailable: summary.setupReportAvailable === true,
      setupReady: summary.setupReady === true,
      envFileCount: nonNegativeInteger(summary.envFileCount),
      targetEnvFileConfigured: summary.targetEnvFileConfigured === true,
      targetEnvFromProductionSetup: summary.targetEnvFromProductionSetup !== false,
      targetEnvFilePathExposed: false,
    },
    blockingItems: Array.isArray(source.blockingItems)
      ? source.blockingItems.map(sanitizeBlockingItem).filter(Boolean).slice(0, 6)
      : [],
    nextAction: safeText(source.nextAction),
    safeguards: sanitizeStatusSafeguards(source.safeguards),
  };
}

function sanitizeValuesFileAuditStatusProjection(value = {}, sanitizeBlockingItem) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  return {
    available: source.available === true,
    status: safeStatus(source.status) || "not_run",
    ready: source.ready === true,
    summary: {
      label: safeText(summary.label),
      auditStatus: safeStatus(summary.auditStatus),
      auditReady: summary.auditReady === true,
      auditExecuted: summary.auditExecuted === true,
      auditReportAvailable: summary.auditReportAvailable === true,
      fileCount: nonNegativeInteger(summary.fileCount),
      blockingCount: nonNegativeInteger(summary.blockingCount),
      warningCount: nonNegativeInteger(summary.warningCount),
      passedCount: nonNegativeInteger(summary.passedCount),
      placeholderAssignmentCount: nonNegativeInteger(summary.placeholderAssignmentCount),
      uncommentedAssignmentCount: nonNegativeInteger(summary.uncommentedAssignmentCount),
      sensitiveVariableNameCount: nonNegativeInteger(summary.sensitiveVariableNameCount),
      crossFileDuplicateVariableCount: nonNegativeInteger(summary.crossFileDuplicateVariableCount),
      pathValueExposed: false,
      valuesFilePathExposed: false,
      envValuesIncluded: false,
      secretValuesIncluded: false,
    },
    blockingItems: Array.isArray(source.blockingItems)
      ? source.blockingItems.map(sanitizeBlockingItem).filter(Boolean).slice(0, 6)
      : [],
    nextAction: safeText(source.nextAction),
    safeguards: sanitizeStatusSafeguards(source.safeguards),
  };
}

function sanitizeDryRunProofStatusProjection(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    available: source.available === true,
    status: safeStatus(source.status) || "missing",
    ready: source.ready === true,
    included: source.included === true,
    statusLabel: safeText(source.statusLabel),
    label: safeText(source.label),
    checkedAt: safeText(source.checkedAt),
    dryRunCheckedAt: safeText(source.dryRunCheckedAt),
    freshnessStatus: safeStatus(source.freshnessStatus),
    fresh: source.fresh === true,
    freshnessLabel: safeText(source.freshnessLabel),
    maxAgeHours: optionalNumber(source.maxAgeHours),
    ageHours: optionalNumber(source.ageHours),
    expiresAt: safeText(source.expiresAt),
    remainingHours: optionalNumber(source.remainingHours),
    checkedAtIncluded: source.checkedAtIncluded === true,
    firstStageStatus: safeStatus(source.firstStageStatus),
    firstStageLabel: safeText(source.firstStageLabel),
    minimumBlockingReady: source.minimumBlockingReady === true,
    minimumBlockingLabel: safeText(source.minimumBlockingLabel),
    minimumBlockingTargetCount: nonNegativeInteger(source.minimumBlockingTargetCount),
    minimumBlockingSatisfiedCount: nonNegativeInteger(source.minimumBlockingSatisfiedCount),
    minimumBlockingMissingCount: nonNegativeInteger(source.minimumBlockingMissingCount),
    envPreflightReady: source.envPreflightReady === true,
    envPreflightLabel: safeText(source.envPreflightLabel),
    intakeLabel: safeText(source.intakeLabel),
    dryRunMatchesCurrentMinimumPath: source.dryRunMatchesCurrentMinimumPath === true,
    valuesFingerprintStatus: safeStatus(source.valuesFingerprintStatus),
    valuesFingerprintStatusLabel: safeText(source.valuesFingerprintStatusLabel),
    valuesFingerprintCompared: source.valuesFingerprintCompared === true,
    valuesFingerprintIncluded: source.valuesFingerprintIncluded === true,
    valuesFingerprintMatched: source.valuesFingerprintMatched === true,
    valuesFingerprintDigestExposed: false,
    valuesFingerprintValuesExposed: false,
    valuesFileUnchangedAfterProof: source.valuesFileUnchangedAfterProof === true,
    targetEnvFileUnchangedAfterProof: source.targetEnvFileUnchangedAfterProof === true,
    fileBindingStatus: sanitizeDryRunFileBindingStatus(source.fileBindingStatus),
    currentMinimumBlockingTargetSignatureIncluded:
      source.currentMinimumBlockingTargetSignatureIncluded === true,
    dryRunMinimumBlockingTargetSignatureIncluded:
      source.dryRunMinimumBlockingTargetSignatureIncluded === true,
    targetWouldBeWritten: source.targetWouldBeWritten === true,
    nextAction: safeText(source.nextAction),
    safeguards: sanitizeStatusSafeguards(source.safeguards),
  };
}

function sanitizeDryRunFileBindingStatus(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    available: source.available === true,
    status: safeStatus(source.status),
    ready: source.ready === true,
    checked: source.checked === true,
    statusLabel: safeText(source.statusLabel),
    valuesFingerprintStatus: safeStatus(source.valuesFingerprintStatus),
    valuesFingerprintStatusLabel: safeText(source.valuesFingerprintStatusLabel),
    valuesFingerprintCompared: source.valuesFingerprintCompared === true,
    valuesFingerprintIncluded: source.valuesFingerprintIncluded === true,
    valuesFingerprintMatched: source.valuesFingerprintMatched === true,
    valuesFingerprintDigestExposed: false,
    valuesFingerprintValuesExposed: false,
    valuesFileUnchangedAfterProof: source.valuesFileUnchangedAfterProof === true,
    targetEnvFileUnchangedAfterProof: source.targetEnvFileUnchangedAfterProof === true,
    nextAction: safeText(source.nextAction),
    safeguards: sanitizeStatusSafeguards(source.safeguards),
  };
}

function sanitizeStatusSafeguards(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const sanitized = {};
  for (const [key, item] of Object.entries(source)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,100}$/.test(key)) continue;
    if (typeof item === "boolean") {
      sanitized[key] = item;
      continue;
    }
    if (typeof item === "number" && Number.isFinite(item)) {
      sanitized[key] = item;
      continue;
    }
    if (
      typeof item === "string" &&
      !/(digest|path|value|secret|token|url|connection|endpoint|bucket|command|spool)/i.test(key)
    ) {
      const normalized = safeStatus(item);
      if (normalized) sanitized[key] = normalized;
    }
  }
  return sanitized;
}

function buildTargetAuditSummary(targetSetupStatus = {}, valuesFileAuditStatus = {}) {
  const targetSummary = isPlainObject(targetSetupStatus?.summary) ? targetSetupStatus.summary : {};
  const auditSummary = isPlainObject(valuesFileAuditStatus?.summary) ? valuesFileAuditStatus.summary : {};
  return {
    targetSetupStatus: safeStatus(targetSetupStatus?.status),
    targetSetupReady: targetSetupStatus?.ready === true,
    targetSetupReportAvailable: targetSummary.setupReportAvailable === true,
    targetSetupEnvFileCount: nonNegativeInteger(targetSummary.envFileCount),
    targetEnvFileConfigured: targetSummary.targetEnvFileConfigured === true,
    valuesFileAuditStatus: safeStatus(valuesFileAuditStatus?.status),
    valuesFileAuditReady: valuesFileAuditStatus?.ready === true,
    valuesFileAuditExecuted: auditSummary.auditExecuted === true,
    valuesFileAuditBlockingCount: nonNegativeInteger(auditSummary.blockingCount),
    valuesFileAuditWarningCount: nonNegativeInteger(auditSummary.warningCount),
    valuesFileAuditPathExposed: false,
    valuesFileAuditValuesIncluded: false,
  };
}

function buildDryRunProofSummary(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    dryRunProofStatus: safeStatus(source.status),
    dryRunProofReady: source.ready === true,
    dryRunProofIncluded: source.included === true,
    dryRunProofStatusLabel: safeText(source.statusLabel),
    dryRunProofFresh: source.fresh === true,
    dryRunProofFreshnessStatus: safeStatus(source.freshnessStatus),
    dryRunProofFreshnessLabel: safeText(source.freshnessLabel),
    dryRunProofMaxAgeHours: optionalNumber(source.maxAgeHours),
    dryRunProofAgeHours: optionalNumber(source.ageHours),
    dryRunProofExpiresAt: safeText(source.expiresAt),
    dryRunProofRemainingHours: optionalNumber(source.remainingHours),
    dryRunProofCheckedAtIncluded: source.checkedAtIncluded === true,
    dryRunProofCheckedAt: safeText(source.checkedAt),
    dryRunProofMatchesCurrentMinimumPath: source.dryRunMatchesCurrentMinimumPath === true,
    dryRunProofMinimumBlockingTargetSignatureIncluded:
      source.dryRunMinimumBlockingTargetSignatureIncluded === true,
    currentMinimumBlockingTargetSignatureIncluded:
      source.currentMinimumBlockingTargetSignatureIncluded === true,
    dryRunProofMinimumBlockingLabel: safeText(source.minimumBlockingLabel),
    dryRunProofMinimumBlockingTargetCount: nonNegativeInteger(source.minimumBlockingTargetCount),
    dryRunProofMinimumBlockingSatisfiedCount: nonNegativeInteger(source.minimumBlockingSatisfiedCount),
    dryRunProofMinimumBlockingMissingCount: nonNegativeInteger(source.minimumBlockingMissingCount),
    dryRunProofValuesFingerprintStatus: safeStatus(source.valuesFingerprintStatus),
    dryRunProofValuesFingerprintStatusLabel: safeText(source.valuesFingerprintStatusLabel),
    dryRunProofValuesFingerprintCompared: source.valuesFingerprintCompared === true,
    dryRunProofValuesFingerprintIncluded: source.valuesFingerprintIncluded === true,
    dryRunProofValuesFingerprintMatched: source.valuesFingerprintMatched === true,
    dryRunProofValuesFingerprintDigestExposed: false,
    dryRunProofValuesFingerprintValuesExposed: false,
    dryRunProofValuesFileUnchangedAfterProof: source.valuesFileUnchangedAfterProof === true,
    dryRunProofTargetEnvFileUnchangedAfterProof: source.targetEnvFileUnchangedAfterProof === true,
    dryRunProofNextAction: safeText(source.nextAction),
  };
}

function buildDryRunProofSafeguards(value = {}, { includeMinimumCounts = false } = {}) {
  const source = isPlainObject(value) ? value : {};
  const safeguards = {
    dryRunProofReady: source.ready === true,
    dryRunProofIncluded: source.included === true,
    dryRunProofStatus: safeStatus(source.status),
    dryRunProofValuesIncluded: false,
    dryRunProofFresh: source.fresh === true,
    dryRunProofMaxAgeHours: optionalNumber(source.maxAgeHours),
    dryRunProofExpiresAt: safeText(source.expiresAt),
    dryRunProofRemainingHours: optionalNumber(source.remainingHours),
    dryRunProofCheckedAtIncluded: source.checkedAtIncluded === true,
    dryRunProofMatchesCurrentMinimumPath: source.dryRunMatchesCurrentMinimumPath === true,
    dryRunProofMinimumBlockingTargetSignatureIncluded:
      source.dryRunMinimumBlockingTargetSignatureIncluded === true,
    currentMinimumBlockingTargetSignatureIncluded:
      source.currentMinimumBlockingTargetSignatureIncluded === true,
    dryRunProofValuesFingerprintCompared: source.valuesFingerprintCompared === true,
    dryRunProofValuesFingerprintIncluded: source.valuesFingerprintIncluded === true,
    dryRunProofValuesFingerprintMatched: source.valuesFingerprintMatched === true,
    dryRunProofValuesFingerprintDigestExposed: false,
    dryRunProofValuesFingerprintValuesExposed: false,
    dryRunProofValuesFileUnchangedAfterProof: source.valuesFileUnchangedAfterProof === true,
    dryRunProofTargetEnvFileUnchangedAfterProof: source.targetEnvFileUnchangedAfterProof === true,
  };
  return includeMinimumCounts
    ? {
        ...safeguards,
        dryRunProofMinimumBlockingTargetCount: nonNegativeInteger(source.minimumBlockingTargetCount),
        dryRunProofMinimumBlockingMissingCount: nonNegativeInteger(source.minimumBlockingMissingCount),
      }
    : safeguards;
}

function getApplyResponseLabel({ ready, resultStatus, applied }) {
  if (ready === true) return "第一阶段真实值已正式合并";
  if (resultStatus === "disabled") return "真实值正式合并未启用";
  if (resultStatus === "not_configured") return "服务端真实值片段未配置";
  if (resultStatus === "audit_blocked") return "真实值片段安全审计未通过";
  if (resultStatus === "target_not_ready") return "目标生产 env 安全草稿未就绪";
  if (resultStatus === "dry_run_expired") return "最近真实值 dry-run 证明已过期";
  if (resultStatus === "dry_run_not_ready") return "最近真实值 dry-run 证明未通过";
  if (resultStatus === "dry_run_file_binding_blocked") {
    return "最近真实值 dry-run 片段指纹绑定未通过";
  }
  if (resultStatus === "error") return "真实值正式合并失败";
  return applied ? "真实值已合并，后续门禁仍需处理" : "真实值正式合并未完成";
}

function sanitizeResponseError(value) {
  if (!isPlainObject(value)) return null;
  const code = /^[A-Z0-9_]{1,120}$/.test(cleanText(value.code)) ? cleanText(value.code) : "";
  const message = safeText(value.message);
  return code || message ? { code, message } : null;
}

function isApplyEnabled(env = {}) {
  const value = typeof env.ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED === "string"
    ? env.ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED.trim().toLowerCase()
    : "";
  return ["1", "true", "yes", "on"].includes(value);
}

function safeVariableName(value) {
  const normalized = cleanText(value);
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized) ? normalized : "";
}

function safeStatus(value) {
  const normalized = cleanText(value);
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(normalized) ? normalized : "";
}

function safeText(value) {
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

function optionalNumber(value) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
