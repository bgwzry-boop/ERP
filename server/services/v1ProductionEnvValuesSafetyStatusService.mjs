import { buildProductionEnvFileAuditReport } from "../../scripts/run-v1-production-env-file-audit.mjs";
import { buildProductionEnvValuesDryRunProofReport } from "../../scripts/run-v1-production-env-values-dry-run-proof-check.mjs";
import {
  buildV1ProductionEnvValuesDryRunProofFileBindingStatus as buildDryRunProofFileBindingStatusCore,
  buildV1ProductionEnvValuesDryRunProofStatus as buildDryRunProofStatusCore,
  buildV1ProductionEnvValuesMinimumFillStatus,
} from "../v1ProductionEnvDryRunProofCore.mjs";
import { getConfiguredV1ProductionEnvValuesFileConfig } from "./v1ProductionEnvFileAuditService.mjs";
import {
  resolveV1ProductionEnvSetupSafeEnvFileForIntakeLivePrecheck,
  V1_PRODUCTION_ENV_SETUP_JSON_PATH,
} from "./v1ProductionEnvIntakePrecheckService.mjs";
import { sanitizeV1ProductionFirstStageExecution } from "./v1ProductionStatusProjectionService.mjs";
import { sanitizeV1SensitiveStatusText } from "./v1StatusTextSanitizer.mjs";

export function createV1ProductionEnvValuesSafetyStatusService({
  getValuesFileConfig = getConfiguredV1ProductionEnvValuesFileConfig,
  resolveSetupTarget = resolveV1ProductionEnvSetupSafeEnvFileForIntakeLivePrecheck,
  buildFileAuditReport = buildProductionEnvFileAuditReport,
  buildDryRunProofReport = buildProductionEnvValuesDryRunProofReport,
  productionEnvSetupJson = V1_PRODUCTION_ENV_SETUP_JSON_PATH,
} = {}) {
  requireFunction(getValuesFileConfig, "getValuesFileConfig");
  requireFunction(resolveSetupTarget, "resolveSetupTarget");
  requireFunction(buildFileAuditReport, "buildFileAuditReport");
  requireFunction(buildDryRunProofReport, "buildDryRunProofReport");

  return {
    buildDryRunProofFileBindingStatus,
    buildDryRunProofStatus,
    buildFragmentSourceStatus,
    buildTargetSetupStatus,
    buildValuesFileAuditStatus,
    sanitizeBlockingItem,
  };

  function buildFragmentSourceStatus({
    productionEnvIntakeVerification = null,
    buildServerConfigGuidance,
  } = {}) {
    requireFunction(buildServerConfigGuidance, "buildServerConfigGuidance");
    const valuesFileConfig = getValuesFileConfig();
    const configuredValuesFileCount = toNonNegativeInteger(valuesFileConfig.configuredEnvFileCount);
    const configuredSourceVariableCount = toNonNegativeInteger(valuesFileConfig.configuredSourceVariableCount);
    const targetSetupStatus = buildTargetSetupStatus();
    const targetSetupSummary = isPlainObject(targetSetupStatus.summary) ? targetSetupStatus.summary : {};
    const targetSetupReady = targetSetupStatus.ready === true;
    const valuesFileAuditStatus = buildValuesFileAuditStatus({
      valuesFileConfig,
      configuredValuesFileCount,
    });
    const valuesFileAuditReady = valuesFileAuditStatus.ready === true;
    const minimumFillStatus = buildV1ProductionEnvValuesMinimumFillStatus(productionEnvIntakeVerification);
    const ready = configuredValuesFileCount === 1 && targetSetupReady && valuesFileAuditReady;
    const status = ready
      ? "configured"
      : configuredValuesFileCount > 1
        ? "multiple_configured"
        : configuredValuesFileCount === 0
          ? "not_configured"
          : !valuesFileAuditReady
            ? "audit_blocked"
            : "target_not_ready";
    const serverConfigGuidance = buildServerConfigGuidance({
      valuesFileConfig,
      configuredValuesFileCount,
      ready,
      status,
      targetSetupStatus,
      valuesFileAuditStatus,
      productionEnvMinimumFillStatus: minimumFillStatus,
    });
    const label = ready
      ? "服务端真实值片段来源、安全审计和目标 env 均已就绪"
      : configuredValuesFileCount > 1
        ? "服务端真实值片段来源不唯一"
        : configuredValuesFileCount === 0
          ? "服务端真实值片段来源未配置"
          : !valuesFileAuditReady
            ? "服务端真实值片段来源已配置，但片段安全审计未通过"
            : "服务端真实值片段来源已配置，但目标生产 env 安全草稿未就绪";
    const nextAction = ready
      ? "可先执行真实值 dry-run；通过后再由负责人确认正式合并真实值。"
      : configuredValuesFileCount > 1
        ? "只保留一个安全未跟踪真实值片段来源，重启 API 后再执行 dry-run。"
        : configuredValuesFileCount === 0
          ? "在 API 进程配置 ERP_V1_PRODUCTION_ENV_VALUES_FILE，指向安全未跟踪真实值片段并重启 API。"
          : !valuesFileAuditReady
            ? valuesFileAuditStatus.nextAction || "先修正真实值片段文件安全审计阻塞项，再重启 API 后执行 dry-run。"
            : targetSetupStatus.nextAction || "先重新运行 production env setup，确认目标安全 env 文件 ready 后再执行 dry-run。";

    return {
      available: true,
      status,
      ready,
      summary: {
        label,
        configuredValuesFileCount,
        valuesFilePathConfigured: configuredValuesFileCount > 0,
        selectedEnvVariable: text(valuesFileConfig.selectedEnvVariable),
        selectedEnvVariableLabel: text(valuesFileConfig.selectedEnvVariableLabel) || "未配置",
        selectedSourceKind: text(valuesFileConfig.selectedSourceKind) || "none",
        fallbackSourceUsed: valuesFileConfig.fallbackSourceUsed === true,
        configuredSourceVariableCount,
        sourceStatuses: serverConfigGuidance.sourceStatuses,
        primaryEnvVariable: serverConfigGuidance.primaryEnvVariable,
        fallbackEnvVariables: serverConfigGuidance.fallbackEnvVariables,
        acceptsFrontendPath: false,
        pathValueExposed: false,
        restartRequired: true,
        dryRunExecuted: false,
        targetEnvFromProductionSetup: true,
        targetEnvFilePathExposed: false,
        targetSetupStatus: targetSetupStatus.status,
        targetSetupReady,
        targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
        targetSetupEnvFileCount: toNonNegativeInteger(targetSetupSummary.envFileCount),
        targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
        valuesFileAuditStatus: valuesFileAuditStatus.status,
        valuesFileAuditReady,
        valuesFileAuditExecuted: valuesFileAuditStatus.summary.auditExecuted === true,
        valuesFileAuditBlockingCount: toNonNegativeInteger(valuesFileAuditStatus.summary.blockingCount),
        valuesFileAuditWarningCount: toNonNegativeInteger(valuesFileAuditStatus.summary.warningCount),
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
        productionEnvFileMutated: false,
        businessDataMutated: false,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
      },
      targetSetupStatus,
      valuesFileAuditStatus,
      serverConfigGuidance,
      nextAction,
      safeguards: {
        nonMutating: true,
        valuesFilePathAcceptedFromFrontend: false,
        valuesFilePathValueIncluded: false,
        valuesFileReadFromServerConfigOnly: true,
        sourceVariableNamesOnly: true,
        targetEnvFileComesFromProductionSetup: true,
        targetSetupReady,
        targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
        targetSetupEnvFileCount: toNonNegativeInteger(targetSetupSummary.envFileCount),
        targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
        targetEnvFilePathExposed: false,
        valuesFileAuditReady,
        valuesFileAuditStatus: valuesFileAuditStatus.status,
        valuesFileAuditPathExposed: false,
        valuesFileAuditValuesIncluded: false,
        minimumBlockingReady: minimumFillStatus.minimumBlockingReady,
        minimumBlockingTargetCount: minimumFillStatus.minimumBlockingTargetCount,
        minimumBlockingMissingCount: minimumFillStatus.minimumBlockingMissingCount,
        dryRunExecuted: false,
        productionEnvFileMutated: false,
        businessDataMutated: false,
        envValuesIncluded: false,
        secretValuesIncluded: false,
        connectionStringIncluded: false,
        objectStorageEndpointIncluded: false,
        objectStorageBucketIncluded: false,
        commandValuesIncluded: false,
        localPathExposed: false,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
        declaresFullV1Complete: false,
      },
    };
  }

  function buildDryRunProofStatus(productionFirstStageExecution = null, currentMinimumFillSource = null, options = {}) {
    return buildDryRunProofStatusCore(productionFirstStageExecution, currentMinimumFillSource, {
      ...options,
      buildFileBindingStatus: (args) => buildDryRunProofFileBindingStatus(args),
      sanitizeExecution: (value) => sanitizeV1ProductionFirstStageExecution(value),
    });
  }

  function buildDryRunProofFileBindingStatus(args = {}) {
    return buildDryRunProofFileBindingStatusCore(args, {
      readProofReport: ({ valuesEnvFile, maxAgeHours }) =>
        buildDryRunProofReport({
          valuesEnvFile,
          useProductionEnvSetupEnvFile: true,
          productionEnvSetupJson,
          maxAgeHours,
        }),
    });
  }

  function buildValuesFileAuditStatus({ valuesFileConfig = {}, configuredValuesFileCount = null } = {}) {
    const envFiles = Array.isArray(valuesFileConfig.envFiles) ? valuesFileConfig.envFiles : [];
    const normalizedCount = toNonNegativeInteger(
      configuredValuesFileCount ?? valuesFileConfig.configuredEnvFileCount ?? envFiles.length,
    );
    const baseSummary = {
      auditExecuted: false,
      auditReportAvailable: false,
      fileCount: normalizedCount,
      blockingCount: 0,
      warningCount: 0,
      passedCount: 0,
      placeholderAssignmentCount: 0,
      uncommentedAssignmentCount: 0,
      sensitiveVariableNameCount: 0,
      crossFileDuplicateVariableCount: 0,
      pathValueExposed: false,
      valuesFilePathExposed: false,
      envValuesIncluded: false,
      secretValuesIncluded: false,
    };
    const skipped = ({ status, label, nextAction }) => ({
      available: true,
      status,
      ready: false,
      summary: { ...baseSummary, label, auditStatus: status, auditReady: false },
      blockingItems: [],
      nextAction,
      safeguards: buildValuesFileAuditSafeguards({ ready: false, status }),
    });

    if (normalizedCount === 0) {
      return skipped({
        status: "not_run",
        label: "真实值片段文件未配置，安全审计未执行",
        nextAction: "先配置单个安全未跟踪真实值片段文件，重启 API 后再执行审计和 dry-run。",
      });
    }
    if (normalizedCount !== 1) {
      return skipped({
        status: "not_run",
        label: "真实值片段文件数量不唯一，安全审计未执行",
        nextAction: "只保留一个安全未跟踪真实值片段文件，重启 API 后再执行审计。",
      });
    }

    try {
      const audit = buildFileAuditReport({ envFiles });
      const auditSummary = isPlainObject(audit.summary) ? audit.summary : {};
      const ready = audit.ready === true;
      const status = ready ? "passed" : "blocked";
      return {
        available: true,
        status,
        ready,
        summary: {
          ...baseSummary,
          label: sanitizeV1SensitiveStatusText(auditSummary.label) ||
            (ready ? "真实值片段文件安全审计通过" : "真实值片段文件安全审计未通过"),
          auditStatus: status,
          auditReady: ready,
          auditExecuted: true,
          auditReportAvailable: true,
          fileCount: toNonNegativeInteger(auditSummary.fileCount, normalizedCount),
          blockingCount: toNonNegativeInteger(auditSummary.blockingCount),
          warningCount: toNonNegativeInteger(auditSummary.warningCount),
          passedCount: toNonNegativeInteger(auditSummary.passedCount),
          placeholderAssignmentCount: toNonNegativeInteger(auditSummary.placeholderAssignmentCount),
          uncommentedAssignmentCount: toNonNegativeInteger(auditSummary.uncommentedAssignmentCount),
          sensitiveVariableNameCount: toNonNegativeInteger(auditSummary.sensitiveVariableNameCount),
          crossFileDuplicateVariableCount: toNonNegativeInteger(auditSummary.crossFileDuplicateVariableCount),
        },
        blockingItems: sanitizeValuesFileAuditBlockingItems(audit),
        nextAction: ready
          ? "真实值片段文件安全审计已通过，可继续执行 dry-run。"
          : audit.nextActions?.map(sanitizeV1SensitiveStatusText).filter(Boolean)[0] ||
            "先修正真实值片段文件安全审计阻塞项，再重启 API 后重试。",
        safeguards: buildValuesFileAuditSafeguards({ ready, status }),
      };
    } catch {
      return {
        available: true,
        status: "error",
        ready: false,
        summary: {
          ...baseSummary,
          label: "真实值片段文件安全审计失败",
          auditStatus: "error",
          auditReady: false,
          auditExecuted: true,
          auditReportAvailable: false,
          blockingCount: 1,
        },
        blockingItems: [
          {
            key: "production-env-values-file-audit-error",
            label: "真实值片段文件不可审计",
            status: "blocked",
            detail: "服务端配置的真实值片段文件缺失、不可读或格式不符合安全审计要求。",
            nextAction: "检查真实值片段文件是否存在、权限是否正确、是否位于安全未跟踪路径；不要把真实路径或 env 值传给前端。",
          },
        ],
        nextAction: "检查真实值片段文件是否存在、权限是否正确、是否位于安全未跟踪路径后重试。",
        safeguards: buildValuesFileAuditSafeguards({ ready: false, status: "error" }),
      };
    }
  }

  function buildTargetSetupStatus() {
    const resolution = resolveSetupTarget();
    const blockingItems = Array.isArray(resolution.blockingItems)
      ? resolution.blockingItems.map(sanitizeBlockingItem).filter(Boolean).slice(0, 6)
      : [];
    const ready = resolution.ready === true;
    const envFileCount = toNonNegativeInteger(resolution.envFileCount);
    const status = ready ? "configured" : text(resolution.status) || "blocked";
    const nextAction = sanitizeV1SensitiveStatusText(resolution.nextAction) || (ready
      ? "已确认 production env setup 目标安全 env 文件，可在正式合并开关和真实值片段均就绪后写入。"
      : "先重新运行 production env setup，确认目标安全 env 文件存在、已 git ignore、未跟踪且权限为 600。");
    return {
      available: true,
      status,
      ready,
      summary: {
        label: ready ? "production env setup 目标 env 已就绪" : "production env setup 目标 env 未就绪",
        setupReportAvailable: resolution.setupReportAvailable === true,
        setupReady: resolution.setupReady === true,
        envFileCount,
        targetEnvFileConfigured: ready || envFileCount > 0,
        targetEnvFromProductionSetup: true,
        targetEnvFilePathExposed: false,
      },
      blockingItems,
      nextAction,
      safeguards: {
        targetEnvFilePathExposed: false,
        localPathExposed: false,
        envValuesIncluded: false,
        secretValuesIncluded: false,
        targetEnvComesFromProductionSetup: true,
        targetSetupReportIncluded: resolution.setupReportAvailable === true,
      },
    };
  }

  function sanitizeBlockingItem(value = {}) {
    const source = isPlainObject(value) ? value : {};
    const label = sanitizeV1SensitiveStatusText(source.label);
    const key = safeKey(source.key);
    if (!label && !key) return null;
    return {
      key,
      label: label || key,
      status: text(source.status) || "blocked",
      detail: sanitizeV1SensitiveStatusText(source.detail),
      nextAction: sanitizeV1SensitiveStatusText(source.nextAction),
    };
  }
}

function buildValuesFileAuditSafeguards({ ready = false, status = "not_run" } = {}) {
  return {
    nonMutating: true,
    status: text(status) || "not_run",
    ready: ready === true,
    valuesFilePathExposed: false,
    pathValueExposed: false,
    envValuesIncluded: false,
    secretValuesIncluded: false,
    connectionStringIncluded: false,
    objectStorageEndpointIncluded: false,
    objectStorageBucketIncluded: false,
    commandValuesIncluded: false,
    spoolPathIncluded: false,
    tokenIncluded: false,
    localPathExposed: false,
    commentsCopied: false,
    rawLineContentCopied: false,
    productionEnvFileMutated: false,
    businessDataMutated: false,
  };
}

function sanitizeValuesFileAuditBlockingItems(audit = {}) {
  return (Array.isArray(audit.blockingFindings) ? audit.blockingFindings : [])
    .map((finding, index) => ({
      key: safeKey(finding.key) || `production-env-values-file-audit-${index + 1}`,
      label: sanitizeV1SensitiveStatusText(finding.label) || "真实值片段安全审计阻塞",
      status: text(finding.status) || "blocked",
      detail: sanitizeV1SensitiveStatusText(finding.detail),
      nextAction: sanitizeV1SensitiveStatusText(finding.nextAction) ||
        audit.nextActions?.map(sanitizeV1SensitiveStatusText).filter(Boolean)[0] ||
        "修正真实值片段文件安全审计阻塞项后重试。",
    }))
    .filter((item) => item.label)
    .slice(0, 6);
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeKey(value) {
  const normalized = text(value);
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(normalized) ? normalized : "";
}
