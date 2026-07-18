import {
  sanitizeV1ProductionEnvIntakeVerification,
  sanitizeV1ProductionFirstStageExecution,
} from "./v1ProductionStatusProjectionService.mjs";
import { sanitizeV1ProductionEnvFileConfigSourceStatuses } from "./v1ProductionEnvFileAuditService.mjs";
import {
  buildV1ProductionEnvValuesMinimumFillStatus,
  isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus,
} from "../v1ProductionEnvDryRunProofCore.mjs";

export function createV1ProductionFirstStageValuesDryRunLivePrecheckService({
  getValuesFileConfig,
  buildTargetSetupStatus,
  buildValuesFileAuditStatus,
  readStatusArtifacts,
  runCommand,
  buildDryRunProofStatus,
  sanitizeBlockingItem,
  now = () => new Date(),
} = {}) {
  requireFunction(getValuesFileConfig, "getValuesFileConfig");
  requireFunction(buildTargetSetupStatus, "buildTargetSetupStatus");
  requireFunction(buildValuesFileAuditStatus, "buildValuesFileAuditStatus");
  requireFunction(readStatusArtifacts, "readStatusArtifacts");
  requireFunction(runCommand, "runCommand");
  requireFunction(buildDryRunProofStatus, "buildDryRunProofStatus");
  requireFunction(sanitizeBlockingItem, "sanitizeBlockingItem");
  requireFunction(now, "now");

  return { buildResponseBody, buildServerConfigGuidance, precheck };

  async function precheck({ operatorId = "" } = {}) {
    const checkedAt = currentTimestamp();
    const valuesFileConfig = getValuesFileConfig();
    const configuredValuesFiles = Array.isArray(valuesFileConfig?.envFiles) ? valuesFileConfig.envFiles : [];
    const targetSetupStatus = buildTargetSetupStatus();
    if (configuredValuesFiles.length === 0) {
      return response({
        operatorId,
        checkedAt,
        status: "not_configured",
        valuesFileConfig,
        targetSetupStatus,
        blockingItems: [
          {
            key: "production-env-values-file-not-configured",
            label: "服务端真实值片段路径未配置",
            status: "blocked",
            detail: "API 进程未配置 ERP_V1_PRODUCTION_ENV_VALUES_FILE，不能执行第一阶段真实值 dry-run。",
            nextAction: "在 API 进程配置 ERP_V1_PRODUCTION_ENV_VALUES_FILE，指向安全未跟踪的真实值片段后重启 API，再执行真实值 dry-run。",
          },
        ],
        nextAction: "在 API 进程配置 ERP_V1_PRODUCTION_ENV_VALUES_FILE，指向安全未跟踪的真实值片段后重启 API，再执行真实值 dry-run。",
      });
    }
    if (configuredValuesFiles.length !== 1) {
      return response({
        operatorId,
        checkedAt,
        status: "blocked",
        valuesFileConfig,
        configuredValuesFileCount: configuredValuesFiles.length,
        targetSetupStatus,
        blockingItems: [
          {
            key: "production-env-values-file-count",
            label: "真实值片段文件数量不唯一",
            status: "blocked",
            detail: "服务端 values file 配置解析到多个文件，无法判断要 dry-run 哪一个片段。",
            nextAction: "只保留一个安全未跟踪真实值片段路径，重启 API 后重试；不要从前端传路径。",
          },
        ],
        nextAction: "把服务端真实值片段配置收敛为单个文件后重试。",
      });
    }

    const configuredValuesFileCount = configuredValuesFiles.length;
    const valuesFileAuditStatus = buildValuesFileAuditStatus({
      valuesFileConfig,
      configuredValuesFileCount,
    });
    if (valuesFileAuditStatus.ready !== true) {
      return response({
        operatorId,
        checkedAt,
        status: "audit_blocked",
        valuesFileConfig,
        configuredValuesFileCount,
        targetSetupStatus,
        valuesFileAuditStatus,
        blockingItems: valuesFileAuditStatus.blockingItems?.length
          ? valuesFileAuditStatus.blockingItems
          : [
              {
                key: "production-env-values-file-audit-blocked",
                label: "真实值片段安全审计未通过",
                status: "blocked",
                detail: "服务端配置的真实值片段文件未通过安全审计，不能执行第一阶段真实值 dry-run。",
                nextAction: "先修正真实值片段文件的安全审计阻塞项，再重启 API 并重新执行 dry-run。",
              },
            ],
        nextAction:
          valuesFileAuditStatus.nextAction ||
          "先修正真实值片段文件的安全审计阻塞项，再重启 API 并重新执行 dry-run。",
      });
    }
    if (targetSetupStatus.ready !== true) {
      return response({
        operatorId,
        checkedAt,
        status: "target_not_ready",
        valuesFileConfig,
        configuredValuesFileCount,
        targetSetupStatus,
        valuesFileAuditStatus,
        blockingItems: [
          {
            key: "production-env-setup-target-not-ready",
            label: "production env setup 目标 env 未就绪",
            status: "blocked",
            detail: "真实值 dry-run 需要复用 production env setup latest 中已审计的目标安全 env 文件；当前目标 setup 未 ready，不能调用第一阶段 dry-run 执行器。",
            nextAction:
              targetSetupStatus.nextAction ||
              "先重新运行 production env setup，确认目标安全 env 文件存在、已 git ignore、未跟踪且权限为 600，再执行真实值 dry-run。",
          },
        ],
        nextAction:
          targetSetupStatus.nextAction ||
          "先重新运行 production env setup，确认目标安全 env 文件 ready 后再执行真实值 dry-run。",
      });
    }

    try {
      const artifacts = readStatusArtifacts();
      const currentIntakeVerification = sanitizeV1ProductionEnvIntakeVerification(
        artifacts.productionEnvIntakeVerification.value,
      );
      const report = await runCommand({ valuesFile: configuredValuesFiles[0] });
      const dryRunProofStatus = buildDryRunProofStatus(report, currentIntakeVerification, {
        valuesFileConfig,
        configuredValuesFileCount,
        checkFileBinding: true,
      });
      const ready = dryRunProofStatus.ready === true;
      return response({
        operatorId,
        checkedAt,
        status: ready
          ? "ready"
          : isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus(dryRunProofStatus.status)
            ? "dry_run_file_binding_blocked"
            : dryRunProofStatus.status === "stale_or_mismatched"
              ? "dry_run_stale_or_mismatched"
              : text(report.status) || "blocked",
        ready,
        report,
        valuesFileConfig,
        configuredValuesFileCount,
        targetSetupStatus,
        valuesFileAuditStatus,
        dryRunProofStatus,
        nextAction: ready
          ? "真实值片段 dry-run 已覆盖当前最小阻塞补值；负责人确认后可正式合并并继续第一阶段。"
          : dryRunProofStatus.status === "stale_or_mismatched"
            ? dryRunProofStatus.nextAction
            : "按 dry-run 阻塞项修正真实值片段，再重新执行该预检。",
      });
    } catch {
      return response({
        operatorId,
        checkedAt,
        status: "error",
        valuesFileConfig,
        configuredValuesFileCount,
        targetSetupStatus,
        valuesFileAuditStatus,
        blockingItems: [
          {
            key: "production-first-stage-values-dry-run-command-failed",
            label: "真实值 dry-run 执行失败",
            status: "error",
            detail: "服务端执行第一阶段 values dry-run 失败，可能是生产 env setup 安全 env 文件、真实值片段或 intake CSV 未就绪。",
            nextAction: "由技术/管理检查服务端安全文件配置、权限和第一阶段执行器日志后重试；不要把真实路径或 env 值传给前端。",
          },
        ],
        nextAction: "检查服务端安全 env 文件、真实值片段和 production env setup 报告后重试。",
        error: {
          code: "V1_PRODUCTION_FIRST_STAGE_VALUES_DRY_RUN_LIVE_PRECHECK_FAILED",
          message: "第一阶段真实值 dry-run 预检失败，命令输出已脱敏且未返回前端。",
        },
      });
    }
  }

  function response(options) {
    return { httpStatus: 200, body: buildResponseBody(options) };
  }

  function buildResponseBody({
    operatorId = "",
    checkedAt = "",
    status = "",
    ready = false,
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
    const firstStageExecution = sanitizeV1ProductionFirstStageExecution(report);
    const dryRunCoverage = firstStageExecution.dryRunCoverage;
    const resolvedTargetSetupStatus =
      isPlainObject(targetSetupStatus) && targetSetupStatus.available === true
        ? targetSetupStatus
        : buildTargetSetupStatus();
    const targetSetupSummary = isPlainObject(resolvedTargetSetupStatus.summary)
      ? resolvedTargetSetupStatus.summary
      : {};
    const targetSetupReady = resolvedTargetSetupStatus.ready === true;
    const resolvedValuesFileAuditStatus =
      isPlainObject(valuesFileAuditStatus) && valuesFileAuditStatus.available === true
        ? valuesFileAuditStatus
        : buildValuesFileAuditStatus({ valuesFileConfig, configuredValuesFileCount });
    const valuesFileAuditSummary = isPlainObject(resolvedValuesFileAuditStatus.summary)
      ? resolvedValuesFileAuditStatus.summary
      : {};
    const valuesFileAuditReady = resolvedValuesFileAuditStatus.ready === true;
    const normalizedConfiguredValuesFileCount = toNonNegativeInteger(configuredValuesFileCount);
    const resolvedDryRunProofStatus =
      isPlainObject(dryRunProofStatus) && dryRunProofStatus.status
        ? dryRunProofStatus
        : buildStoredDryRunProofStatus({ valuesFileConfig, configuredValuesFileCount });
    const dryRunProofReady = resolvedDryRunProofStatus.ready === true;
    const sourceStatuses = sanitizeV1ProductionEnvFileConfigSourceStatuses(valuesFileConfig);
    const selectedEnvVariable = text(valuesFileConfig.selectedEnvVariable);
    const selectedEnvVariableLabel = text(valuesFileConfig.selectedEnvVariableLabel) || "未配置";
    const selectedSourceKind = text(valuesFileConfig.selectedSourceKind) || "none";
    const configuredSourceVariableCount = toNonNegativeInteger(valuesFileConfig.configuredSourceVariableCount);
    const sanitizedBlockingItems = Array.isArray(blockingItems)
      ? blockingItems.map(sanitizeBlockingItem).filter(Boolean)
      : [];
    const resultStatus = text(status) || (ready === true ? "ready" : "blocked");
    const firstStageBlockingStages = firstStageExecution.blockingStages || [];
    const label =
      ready === true
        ? "第一阶段真实值 dry-run 最小补值已覆盖"
        : resultStatus === "not_configured"
          ? "服务端真实值片段未配置"
          : resultStatus === "error"
            ? "第一阶段真实值 dry-run 预检失败"
            : resultStatus === "dry_run_file_binding_blocked"
              ? "第一阶段真实值 dry-run 片段指纹绑定未通过"
              : resultStatus === "audit_blocked"
                ? "真实值片段安全审计未通过"
                : resultStatus === "target_not_ready"
                  ? "目标生产 env 安全草稿未就绪"
                  : "第一阶段真实值 dry-run 仍未通过";
    const resolvedNextAction =
      text(nextAction) ||
      resolvedTargetSetupStatus.nextAction ||
      dryRunCoverage.nextAction ||
      (ready === true
        ? "负责人确认后可正式合并真实值并继续第一阶段。"
        : "先配置或修正安全真实值片段后重新执行 dry-run。");
    const body = {
      version: "p0-v1-production-first-stage-values-dry-run-live-precheck-v1",
      scope: "v1_production_first_stage_values_dry_run_live_precheck",
      status: resultStatus,
      ready: ready === true,
      checkedAt: firstStageExecution.checkedAt || checkedAt || currentTimestamp(),
      operatorId,
      summary: {
        label,
        configuredValuesFileCount: normalizedConfiguredValuesFileCount,
        valuesFilePathConfigured: normalizedConfiguredValuesFileCount > 0,
        selectedEnvVariable,
        selectedEnvVariableLabel,
        selectedSourceKind,
        fallbackSourceUsed: valuesFileConfig.fallbackSourceUsed === true,
        configuredSourceVariableCount,
        sourceStatuses,
        requestBodyIgnored: true,
        valuesFilePathAccepted: false,
        valuesFilePathExposed: false,
        targetEnvFromProductionSetup: true,
        targetEnvFilePathExposed: false,
        targetSetupStatus: resolvedTargetSetupStatus.status,
        targetSetupReady,
        targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
        targetSetupEnvFileCount: toNonNegativeInteger(targetSetupSummary.envFileCount),
        targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
        valuesFileAuditStatus: resolvedValuesFileAuditStatus.status,
        valuesFileAuditReady,
        valuesFileAuditExecuted: valuesFileAuditSummary.auditExecuted === true,
        valuesFileAuditBlockingCount: toNonNegativeInteger(valuesFileAuditSummary.blockingCount),
        valuesFileAuditWarningCount: toNonNegativeInteger(valuesFileAuditSummary.warningCount),
        valuesFileAuditPathExposed: false,
        valuesFileAuditValuesIncluded: false,
        dryRunProofStatus: resolvedDryRunProofStatus.status,
        dryRunProofReady,
        dryRunProofIncluded: resolvedDryRunProofStatus.included === true,
        dryRunProofStatusLabel: resolvedDryRunProofStatus.statusLabel,
        dryRunProofFresh: resolvedDryRunProofStatus.fresh === true,
        dryRunProofFreshnessStatus: text(resolvedDryRunProofStatus.freshnessStatus),
        dryRunProofFreshnessLabel: text(resolvedDryRunProofStatus.freshnessLabel),
        dryRunProofMaxAgeHours: resolvedDryRunProofStatus.maxAgeHours,
        dryRunProofAgeHours: resolvedDryRunProofStatus.ageHours,
        dryRunProofExpiresAt: text(resolvedDryRunProofStatus.expiresAt),
        dryRunProofRemainingHours: resolvedDryRunProofStatus.remainingHours,
        dryRunProofCheckedAtIncluded: resolvedDryRunProofStatus.checkedAtIncluded === true,
        dryRunProofCheckedAt: text(resolvedDryRunProofStatus.checkedAt),
        dryRunProofMatchesCurrentMinimumPath:
          resolvedDryRunProofStatus.dryRunMatchesCurrentMinimumPath === true,
        dryRunProofMinimumBlockingTargetSignatureIncluded:
          resolvedDryRunProofStatus.dryRunMinimumBlockingTargetSignatureIncluded === true,
        currentMinimumBlockingTargetSignatureIncluded:
          resolvedDryRunProofStatus.currentMinimumBlockingTargetSignatureIncluded === true,
        dryRunProofMinimumBlockingLabel: resolvedDryRunProofStatus.minimumBlockingLabel,
        dryRunProofMinimumBlockingTargetCount: resolvedDryRunProofStatus.minimumBlockingTargetCount,
        dryRunProofMinimumBlockingSatisfiedCount: resolvedDryRunProofStatus.minimumBlockingSatisfiedCount,
        dryRunProofMinimumBlockingMissingCount: resolvedDryRunProofStatus.minimumBlockingMissingCount,
        dryRunProofValuesFingerprintStatus: text(resolvedDryRunProofStatus.valuesFingerprintStatus),
        dryRunProofValuesFingerprintStatusLabel: text(resolvedDryRunProofStatus.valuesFingerprintStatusLabel),
        dryRunProofValuesFingerprintCompared: resolvedDryRunProofStatus.valuesFingerprintCompared === true,
        dryRunProofValuesFingerprintIncluded: resolvedDryRunProofStatus.valuesFingerprintIncluded === true,
        dryRunProofValuesFingerprintMatched: resolvedDryRunProofStatus.valuesFingerprintMatched === true,
        dryRunProofValuesFingerprintDigestExposed: false,
        dryRunProofValuesFingerprintValuesExposed: false,
        dryRunProofValuesFileUnchangedAfterProof:
          resolvedDryRunProofStatus.valuesFileUnchangedAfterProof === true,
        dryRunProofTargetEnvFileUnchangedAfterProof:
          resolvedDryRunProofStatus.targetEnvFileUnchangedAfterProof === true,
        dryRunProofNextAction: resolvedDryRunProofStatus.nextAction,
        productionEnvFileMutated: false,
        businessDataMutated: false,
        schemaMigrationApplyExecuted: false,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
        dryRunStatusLabel: dryRunCoverage.statusLabel,
        minimumBlockingLabel: dryRunCoverage.minimumBlockingLabel,
        minimumWarningLabel: dryRunCoverage.minimumWarningLabel,
        envPreflightLabel: dryRunCoverage.envPreflightLabel,
        intakeLabel: dryRunCoverage.intakeLabel,
        firstStageStatus: firstStageExecution.status,
        firstStageLabel: firstStageExecution.summary.label,
        blockingCount: sanitizedBlockingItems.length + firstStageBlockingStages.length,
        blockerLabel: `${sanitizedBlockingItems.length + firstStageBlockingStages.length} 项`,
      },
      dryRunCoverage,
      firstStageExecution,
      targetSetupStatus: resolvedTargetSetupStatus,
      valuesFileAuditStatus: resolvedValuesFileAuditStatus,
      dryRunProofStatus: resolvedDryRunProofStatus,
      blockingItems: sanitizedBlockingItems,
      blockingStages: firstStageBlockingStages,
      serverConfigGuidance: buildServerConfigGuidance({
        valuesFileConfig,
        configuredValuesFileCount: normalizedConfiguredValuesFileCount,
        ready: ready === true,
        status: resultStatus,
        targetSetupStatus: resolvedTargetSetupStatus,
        valuesFileAuditStatus: resolvedValuesFileAuditStatus,
        productionEnvValuesDryRunProofStatus: resolvedDryRunProofStatus,
      }),
      nextActions: [resolvedNextAction, ...firstStageExecution.nextActions].filter(Boolean).slice(0, 8),
      nextAction: resolvedNextAction,
      safeguards: {
        nonMutating: true,
        requestBodyIgnored: true,
        valuesFilePathAcceptedFromRequest: false,
        valuesFileReadFromServerConfigOnly: true,
        valuesFilePathExposed: false,
        targetEnvFilePathExposed: false,
        targetEnvComesFromProductionSetup: true,
        targetSetupReady,
        targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
        targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
        valuesFileAuditReady,
        valuesFileAuditStatus: resolvedValuesFileAuditStatus.status,
        valuesFileAuditPathExposed: false,
        valuesFileAuditValuesIncluded: false,
        dryRunProofReady,
        dryRunProofIncluded: resolvedDryRunProofStatus.included === true,
        dryRunProofStatus: resolvedDryRunProofStatus.status,
        dryRunProofValuesIncluded: false,
        dryRunProofFresh: resolvedDryRunProofStatus.fresh === true,
        dryRunProofMaxAgeHours: resolvedDryRunProofStatus.maxAgeHours,
        dryRunProofExpiresAt: text(resolvedDryRunProofStatus.expiresAt),
        dryRunProofRemainingHours: resolvedDryRunProofStatus.remainingHours,
        dryRunProofCheckedAtIncluded: resolvedDryRunProofStatus.checkedAtIncluded === true,
        dryRunProofMatchesCurrentMinimumPath:
          resolvedDryRunProofStatus.dryRunMatchesCurrentMinimumPath === true,
        dryRunProofMinimumBlockingTargetSignatureIncluded:
          resolvedDryRunProofStatus.dryRunMinimumBlockingTargetSignatureIncluded === true,
        currentMinimumBlockingTargetSignatureIncluded:
          resolvedDryRunProofStatus.currentMinimumBlockingTargetSignatureIncluded === true,
        dryRunProofMinimumBlockingTargetCount: resolvedDryRunProofStatus.minimumBlockingTargetCount,
        dryRunProofMinimumBlockingMissingCount: resolvedDryRunProofStatus.minimumBlockingMissingCount,
        dryRunProofValuesFingerprintCompared: resolvedDryRunProofStatus.valuesFingerprintCompared === true,
        dryRunProofValuesFingerprintIncluded: resolvedDryRunProofStatus.valuesFingerprintIncluded === true,
        dryRunProofValuesFingerprintMatched: resolvedDryRunProofStatus.valuesFingerprintMatched === true,
        dryRunProofValuesFingerprintDigestExposed: false,
        dryRunProofValuesFingerprintValuesExposed: false,
        dryRunProofValuesFileUnchangedAfterProof:
          resolvedDryRunProofStatus.valuesFileUnchangedAfterProof === true,
        dryRunProofTargetEnvFileUnchangedAfterProof:
          resolvedDryRunProofStatus.targetEnvFileUnchangedAfterProof === true,
        rawCommandIncluded: false,
        rawCommandStdoutIncluded: false,
        rawCommandStderrIncluded: false,
        rawFirstStageExecutionIncluded: false,
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
        productionEnvFileMutated: false,
        businessDataMutated: false,
        schemaMigrationApplyExecuted: false,
        physicalPrinterCalled: false,
        driverDeliveryStatusChanged: false,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
        declaresFullV1Complete: false,
      },
    };
    return error ? { ...body, error } : body;
  }

  function buildServerConfigGuidance({
    valuesFileConfig = {},
    configuredValuesFileCount = 0,
    ready = false,
    status = "not_configured",
    targetSetupStatus = null,
    valuesFileAuditStatus = null,
    productionEnvMinimumFillStatus = null,
    productionEnvValuesDryRunProofStatus = null,
  } = {}) {
    const sourceStatuses = sanitizeV1ProductionEnvFileConfigSourceStatuses(valuesFileConfig);
    const selectedEnvVariable = text(valuesFileConfig.selectedEnvVariable);
    const selectedSourceKind = text(valuesFileConfig.selectedSourceKind) || "none";
    const selectedEnvVariableLabel = text(valuesFileConfig.selectedEnvVariableLabel) || "未配置";
    const resolvedTargetSetupStatus =
      isPlainObject(targetSetupStatus) && targetSetupStatus.available === true
        ? targetSetupStatus
        : buildTargetSetupStatus();
    const targetSetupSummary = isPlainObject(resolvedTargetSetupStatus.summary)
      ? resolvedTargetSetupStatus.summary
      : {};
    const targetSetupReady = resolvedTargetSetupStatus.ready === true;
    const resolvedValuesFileAuditStatus =
      isPlainObject(valuesFileAuditStatus) && valuesFileAuditStatus.available === true
        ? valuesFileAuditStatus
        : buildValuesFileAuditStatus({ valuesFileConfig, configuredValuesFileCount });
    const valuesFileAuditSummary = isPlainObject(resolvedValuesFileAuditStatus.summary)
      ? resolvedValuesFileAuditStatus.summary
      : {};
    const minimumFillStatus = buildV1ProductionEnvValuesMinimumFillStatus(productionEnvMinimumFillStatus);
    const dryRunProofStatus = buildDryRunProofStatus(
      productionEnvValuesDryRunProofStatus,
      minimumFillStatus,
      {
        valuesFileConfig,
        configuredValuesFileCount,
        checkFileBinding: toNonNegativeInteger(configuredValuesFileCount) === 1,
      },
    );
    const dryRunProofReady = dryRunProofStatus.ready === true;
    return {
      label: configuredValuesFileCount > 0 ? "服务端真实值片段路径已配置" : "服务端真实值片段路径待配置",
      status: configuredValuesFileCount > 0 ? "configured" : "not_configured",
      ready: ready === true,
      primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
      fallbackEnvVariables: ["ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE", "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE"],
      selectedEnvVariable,
      selectedEnvVariableLabel,
      selectedSourceKind,
      fallbackSourceUsed: valuesFileConfig.fallbackSourceUsed === true,
      configuredSourceVariableCount: toNonNegativeInteger(valuesFileConfig.configuredSourceVariableCount),
      sourceStatuses,
      configuredValuesFileCount: toNonNegativeInteger(configuredValuesFileCount),
      targetSetupStatus: resolvedTargetSetupStatus,
      targetSetupReady,
      targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
      targetSetupEnvFileCount: toNonNegativeInteger(targetSetupSummary.envFileCount),
      targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
      valuesFileAuditStatus: resolvedValuesFileAuditStatus.status,
      valuesFileAuditReady: resolvedValuesFileAuditStatus.ready === true,
      valuesFileAuditExecuted: valuesFileAuditSummary.auditExecuted === true,
      valuesFileAuditBlockingCount: toNonNegativeInteger(valuesFileAuditSummary.blockingCount),
      valuesFileAuditWarningCount: toNonNegativeInteger(valuesFileAuditSummary.warningCount),
      valuesFileAuditPathExposed: false,
      valuesFileAuditValuesIncluded: false,
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
      dryRunProofStatus: dryRunProofStatus.status,
      dryRunProofReady,
      dryRunProofIncluded: dryRunProofStatus.included === true,
      dryRunProofStatusLabel: dryRunProofStatus.statusLabel,
      dryRunProofFresh: dryRunProofStatus.fresh === true,
      dryRunProofFreshnessStatus: text(dryRunProofStatus.freshnessStatus),
      dryRunProofFreshnessLabel: text(dryRunProofStatus.freshnessLabel),
      dryRunProofMaxAgeHours: dryRunProofStatus.maxAgeHours,
      dryRunProofAgeHours: dryRunProofStatus.ageHours,
      dryRunProofExpiresAt: text(dryRunProofStatus.expiresAt),
      dryRunProofRemainingHours: dryRunProofStatus.remainingHours,
      dryRunProofCheckedAtIncluded: dryRunProofStatus.checkedAtIncluded === true,
      dryRunProofCheckedAt: text(dryRunProofStatus.checkedAt),
      dryRunProofMinimumBlockingLabel: dryRunProofStatus.minimumBlockingLabel,
      dryRunProofMinimumBlockingTargetCount: dryRunProofStatus.minimumBlockingTargetCount,
      dryRunProofMinimumBlockingSatisfiedCount: dryRunProofStatus.minimumBlockingSatisfiedCount,
      dryRunProofMinimumBlockingMissingCount: dryRunProofStatus.minimumBlockingMissingCount,
      dryRunProofValuesFingerprintStatus: text(dryRunProofStatus.valuesFingerprintStatus),
      dryRunProofValuesFingerprintStatusLabel: text(dryRunProofStatus.valuesFingerprintStatusLabel),
      dryRunProofValuesFingerprintCompared: dryRunProofStatus.valuesFingerprintCompared === true,
      dryRunProofValuesFingerprintIncluded: dryRunProofStatus.valuesFingerprintIncluded === true,
      dryRunProofValuesFingerprintMatched: dryRunProofStatus.valuesFingerprintMatched === true,
      dryRunProofValuesFingerprintDigestExposed: false,
      dryRunProofValuesFingerprintValuesExposed: false,
      dryRunProofValuesFileUnchangedAfterProof: dryRunProofStatus.valuesFileUnchangedAfterProof === true,
      dryRunProofTargetEnvFileUnchangedAfterProof: dryRunProofStatus.targetEnvFileUnchangedAfterProof === true,
      dryRunProofNextAction: dryRunProofStatus.nextAction,
      acceptsFrontendPath: false,
      pathValueExposed: false,
      targetEnvFilePathExposed: false,
      restartRequired: true,
      currentDryRunStatus: text(status) || "unknown",
      steps: [
        "从交接包复制 production-env-minimum-values-fragment.template.env.example 或 production-env-values-fragment.template.env.example 到安全、未跟踪的真实值片段文件。",
        "只取消注释并填写本轮要补的白名单变量，避免同时填写同一任选组的多个不同值。",
        "在 API 进程环境中配置 ERP_V1_PRODUCTION_ENV_VALUES_FILE，指向该安全真实值片段；不要从浏览器传路径。",
        "确认 production env setup latest 已 ready，且目标安全 env 文件已 git ignore、未跟踪、权限为 600。",
        "重启 API 后，在上线状态页点击真实值 dry-run，确认最小阻塞补值覆盖后再正式合并。",
        "真实值 dry-run 证明默认需在 24 小时内；如超过有效期，重新执行 dry-run 后再正式合并。",
      ],
      verificationActions: [
        "node scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --production-env-values-dry-run --json",
        "POST /api/system/v1-production-first-stage-values-dry-run/live-precheck",
      ],
      safeguards: {
        valuesFilePathAcceptedFromFrontend: false,
        valuesFilePathValueIncluded: false,
        targetEnvFileComesFromProductionSetup: true,
        targetSetupReady,
        targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
        targetSetupEnvFileCount: toNonNegativeInteger(targetSetupSummary.envFileCount),
        targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
        targetEnvFilePathExposed: false,
        valuesFileAuditReady: resolvedValuesFileAuditStatus.ready === true,
        valuesFileAuditStatus: resolvedValuesFileAuditStatus.status,
        valuesFileAuditPathExposed: false,
        valuesFileAuditValuesIncluded: false,
        minimumBlockingReady: minimumFillStatus.minimumBlockingReady,
        minimumBlockingTargetCount: minimumFillStatus.minimumBlockingTargetCount,
        minimumBlockingMissingCount: minimumFillStatus.minimumBlockingMissingCount,
        dryRunProofReady,
        dryRunProofIncluded: dryRunProofStatus.included === true,
        dryRunProofStatus: dryRunProofStatus.status,
        dryRunProofValuesIncluded: false,
        dryRunProofFresh: dryRunProofStatus.fresh === true,
        dryRunProofMaxAgeHours: dryRunProofStatus.maxAgeHours,
        dryRunProofExpiresAt: text(dryRunProofStatus.expiresAt),
        dryRunProofRemainingHours: dryRunProofStatus.remainingHours,
        dryRunProofCheckedAtIncluded: dryRunProofStatus.checkedAtIncluded === true,
        dryRunProofMinimumBlockingTargetCount: dryRunProofStatus.minimumBlockingTargetCount,
        dryRunProofMinimumBlockingMissingCount: dryRunProofStatus.minimumBlockingMissingCount,
        sourceVariableNamesOnly: true,
        envValuesIncluded: false,
        commandValuesIncluded: false,
        secretValuesIncluded: false,
        productionEnvFileMutated: false,
      },
    };
  }

  function buildStoredDryRunProofStatus({ valuesFileConfig, configuredValuesFileCount }) {
    const artifacts = readStatusArtifacts();
    return buildDryRunProofStatus(
      artifacts.productionFirstStageExecution.value,
      sanitizeV1ProductionEnvIntakeVerification(artifacts.productionEnvIntakeVerification.value),
      {
        valuesFileConfig,
        configuredValuesFileCount,
        checkFileBinding: toNonNegativeInteger(configuredValuesFileCount) === 1,
      },
    );
  }

  function currentTimestamp() {
    const value = now();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new TypeError("production first-stage values dry-run now() must return a valid Date");
    }
    return value.toISOString();
  }
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function text(value) {
  return String(value ?? "").trim();
}
