import { buildProductionEnvPreflight } from "../../scripts/run-v1-production-env-preflight.mjs";
import { buildProductionEnvFileAuditReport } from "../../scripts/run-v1-production-env-file-audit.mjs";
import { buildProductionEnvIntakeVerifyReport } from "../../scripts/run-v1-production-env-intake-verify.mjs";
import { buildProductionGoLivePrecheckReport } from "../../scripts/run-v1-production-go-live-precheck.mjs";
import {
  getConfiguredV1ProductionEnvApplicationFileConfig,
  sanitizeV1ProductionEnvFileConfigSourceStatuses,
} from "./v1ProductionEnvFileAuditService.mjs";
import { buildV1ProductionEnvPreviewEnvironment } from "./v1ProductionEnvFilePreviewService.mjs";
import { sanitizeV1ProductionEnvFixItem } from "./v1ProductionStatusProjectionService.mjs";
import { sanitizeV1SensitiveStatusText } from "./v1StatusTextSanitizer.mjs";

export function createV1ProductionGoLivePrecheckService({
  buildRuntimeReadinessReport,
  getEnvFileConfig = getConfiguredV1ProductionEnvApplicationFileConfig,
  buildEnvFileAuditReport = buildProductionEnvFileAuditReport,
  buildEnvPreviewEnvironment = buildV1ProductionEnvPreviewEnvironment,
  buildEnvPreflight = buildProductionEnvPreflight,
  buildEnvIntakeVerification = buildProductionEnvIntakeVerifyReport,
  buildGoLiveReport = buildProductionGoLivePrecheckReport,
  env = process.env,
  now = () => new Date(),
} = {}) {
  requireFunction(buildRuntimeReadinessReport, "buildRuntimeReadinessReport");
  requireFunction(getEnvFileConfig, "getEnvFileConfig");
  requireFunction(buildEnvFileAuditReport, "buildEnvFileAuditReport");
  requireFunction(buildEnvPreviewEnvironment, "buildEnvPreviewEnvironment");
  requireFunction(buildEnvPreflight, "buildEnvPreflight");
  requireFunction(buildEnvIntakeVerification, "buildEnvIntakeVerification");
  requireFunction(buildGoLiveReport, "buildGoLiveReport");

  return {
    async precheck({ request, operatorId } = {}) {
      const checkedAt = now().toISOString();
      const envFileConfig = getEnvFileConfig({ allowAuditOnlyFallback: false });
      const configuredEnvFiles = normalizeEnvFiles(envFileConfig?.envFiles);
      try {
        const envFileAudit = configuredEnvFiles.length > 0
          ? buildEnvFileAuditReport({ envFiles: configuredEnvFiles })
          : buildMissingEnvFileAudit({ checkedAt });
        const envPreflight = configuredEnvFiles.length > 0 && envFileAudit.ready === true
          ? buildEnvPreflight({
              env: buildEnvPreviewEnvironment(configuredEnvFiles),
              envFiles: configuredEnvFiles,
            })
          : buildEnvPreflight({ env, envFiles: [] });
        const envIntakeVerification = configuredEnvFiles.length > 0
          ? buildEnvIntakeVerification({ envFiles: configuredEnvFiles })
          : buildMissingEnvIntakeVerification({ checkedAt });
        const runtimeReadiness = await buildRuntimeReadinessReport({ request, operatorId });
        const report = buildGoLiveReport({
          checkedAt,
          envFileAudit,
          envIntakeVerification,
          envPreflight,
          runtimeReadiness,
          envFileCount: configuredEnvFiles.length,
        });
        return {
          httpStatus: 200,
          body: buildPrecheckBody({
            report,
            operatorId,
            checkedAt,
            configuredEnvFileCount: configuredEnvFiles.length,
            envFileConfig,
          }),
        };
      } catch {
        return {
          httpStatus: 500,
          body: buildErrorBody({
            operatorId,
            checkedAt,
            configuredEnvFileCount: configuredEnvFiles.length,
            envFileConfig,
          }),
        };
      }
    },
  };
}

export function sanitizeV1ProductionGoLiveGateForReleasePrecheck(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const blockingStages = sanitizeStages(source.blockingStages);
  const stages = sanitizeStages(source.stages);
  const status = cleanKey(source.status) || "error";
  const blockingCount = nonNegativeInteger(
    summary.blockingCount || blockingStages.length || (source.ready === true ? 0 : 1),
  );
  const readinessLabel = sanitizeText(summary.readinessLabel) ||
    `${stages.filter((item) => item.ready).length}/${stages.length || 4}`;
  const firstBlockedStage = blockingStages[0] || stages.find((item) => item.ready !== true) || null;
  return {
    status,
    ready: source.ready === true && status === "ready",
    summary: {
      label: sanitizeText(summary.label) ||
        (source.ready === true ? "生产上线组合预检通过" : "生产上线组合预检仍未通过"),
      readinessLabel,
      blockingCount,
      blockerLabel: sanitizeText(summary.blockerLabel) || `${blockingCount} 项`,
      currentRuntime: summary.currentRuntime === true,
      productionEnvAppliedToProcess: summary.productionEnvAppliedToProcess === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      physicalPrinterCalled: summary.physicalPrinterCalled === true,
      firstBlockedStageKey: cleanKey(firstBlockedStage?.key),
      firstBlockedStageLabel: sanitizeText(firstBlockedStage?.label),
      sourceStatuses: sanitizeV1ProductionEnvFileConfigSourceStatuses({ sources: summary.sourceStatuses }),
    },
    blockingStages,
  };
}

function buildMissingEnvFileAudit({ checkedAt }) {
  return {
    scope: "v1_production_env_file_audit",
    status: "not_configured",
    ready: false,
    checkedAt,
    envFileCount: 0,
    summary: {
      label: "服务端未配置 API 启动应用生产 env 文件",
      fileCount: 0,
      blockingCount: 1,
      warningCount: 0,
      passedCount: 0,
      placeholderAssignmentCount: 0,
      uncommentedAssignmentCount: 0,
      sensitiveVariableNameCount: 0,
      crossFileDuplicateVariableCount: 0,
    },
    files: [],
    blockingFindings: [{
      key: "server-env-file-audit-path-not-configured",
      label: "服务端 env 文件审计路径未配置",
      status: "blocked",
      severity: "blocking",
      detail: "API 进程未配置 ERP_V1_PRODUCTION_ENV_FILE 或 ERP_V1_ENV_FILE。",
      nextAction: "在服务端配置 ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file> 后重启 API，并重新执行生产上线组合预检。",
      variables: [],
    }],
    warningFindings: [],
    nextActions: ["在 API 进程配置 ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file>，指向安全未跟踪 env 文件并重启 API；不要只配置 audit-only 变量。"],
    safeguards: {
      nonMutating: true,
      envValuesExposed: false,
      connectionStringExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      commentsCopied: false,
      rawLineContentCopied: false,
    },
  };
}

function buildMissingEnvIntakeVerification({ checkedAt }) {
  return {
    scope: "v1_production_env_real_value_intake_verification",
    status: "blocked",
    ready: false,
    checkedAt,
    summary: {
      label: "未配置安全 env 文件，真实值 intake 校验未执行",
      envFileCount: 0,
      envFilePathIncluded: false,
      intakeCsvPathIncluded: false,
      intakeRowCount: 0,
      configuredRowCount: 0,
      missingRowCount: 0,
      alternativeGroupCount: 0,
      alternativeGroupBlockingCount: 0,
      alternativeGroupWarningCount: 0,
      passedRowCount: 0,
      blockingCount: 1,
      warningCount: 0,
      auditReady: false,
      intakeCsvReady: false,
    },
    blockingFindings: [{
      key: "production-env-intake-env-file-missing",
      label: "生产 env 真实值 intake 校验",
      status: "blocked",
      severity: "blocking",
      detail: "API 进程未配置 ERP_V1_PRODUCTION_ENV_FILE 或 ERP_V1_ENV_FILE，不能校验真实值 intake 清单。",
      nextAction: "先在服务端配置安全生产 env 文件，再重跑生产上线组合预检。",
    }],
    warningFindings: [],
    nextActions: ["先在服务端配置安全生产 env 文件，再重跑生产 env 真实值 intake 校验。"],
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
      rawEvidenceRefIncluded: false,
    },
  };
}

function buildPrecheckBody({ report, operatorId, checkedAt, configuredEnvFileCount, envFileConfig = {} }) {
  const source = isPlainObject(report) ? report : {};
  const stages = sanitizeStages(source.stages);
  const blockingStages = stages.filter((item) => item.status !== "passed");
  const fixChecklist = Array.isArray(source.fixChecklist)
    ? source.fixChecklist.map(sanitizeV1ProductionEnvFixItem).filter(Boolean)
    : [];
  const unblockChecklist = Array.isArray(source.unblockChecklist)
    ? source.unblockChecklist.map(sanitizeUnblockItem).filter(Boolean)
    : [];
  const fieldEvidenceCoverage = sanitizeFieldEvidenceCoverage(source.fieldEvidenceCoverage);
  const passedCount = nonNegativeInteger(source.summary?.passedCount || stages.filter((item) => item.ready).length);
  const totalCount = nonNegativeInteger(source.summary?.totalCount || stages.length);
  const blockingCount = nonNegativeInteger(source.summary?.blockingCount || blockingStages.length);
  const warningCount = nonNegativeInteger(source.summary?.warningCount);
  const ready = source.ready === true && blockingStages.length === 0;
  const nextActions = sanitizeTextList(source.nextActions).slice(0, 10);
  return {
    version: "p0-v1-production-go-live-live-precheck-v1",
    scope: "v1_production_go_live_live_precheck",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: cleanTimestamp(source.checkedAt) || checkedAt,
    operatorId,
    summary: {
      label: ready ? "生产上线组合预检通过" : "生产上线组合预检仍未通过",
      readinessLabel: `${passedCount}/${totalCount}`,
      passedCount,
      totalCount,
      blockingCount,
      warningCount,
      blockerCount: blockingStages.length,
      blockerLabel: `${blockingStages.length} 项`,
      stageLabel: `${passedCount}/${totalCount}`,
      envFileCount: nonNegativeInteger(source.envFileCount),
      configuredEnvFileCount: nonNegativeInteger(configuredEnvFileCount),
      sourceStatuses: sanitizeV1ProductionEnvFileConfigSourceStatuses(envFileConfig),
      currentRuntime: true,
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      productionEnvAppliedToProcess: source.safeguards?.productionEnvAppliedToProcess === true,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: source.safeguards?.physicalPrinterCalled === true,
    },
    stages,
    blockingStages,
    fixChecklist,
    unblockChecklist,
    fieldEvidenceCoverage,
    runtimeReadiness: sanitizeRuntimeReadiness(source.runtimeReadiness),
    nextActions,
    nextAction: nextActions[0] || (ready
      ? "保存本预检结果，继续生成 release candidate 并完成现场证据 / 签字 / V1-V2 边界确认。"
      : "先处理生产上线组合预检阻塞，再继续 release candidate。"),
    safeguards: buildResponseSafeguards(source.safeguards),
  };
}

function buildErrorBody({ operatorId, checkedAt, configuredEnvFileCount, envFileConfig = {} }) {
  return {
    version: "p0-v1-production-go-live-live-precheck-v1",
    scope: "v1_production_go_live_live_precheck",
    status: "error",
    ready: false,
    checkedAt,
    operatorId,
    summary: {
      label: "生产上线组合预检失败",
      readinessLabel: "0/5",
      passedCount: 0,
      totalCount: 5,
      blockingCount: 1,
      warningCount: 0,
      blockerCount: 1,
      blockerLabel: "1 项",
      stageLabel: "0/5",
      envFileCount: nonNegativeInteger(configuredEnvFileCount),
      configuredEnvFileCount: nonNegativeInteger(configuredEnvFileCount),
      sourceStatuses: sanitizeV1ProductionEnvFileConfigSourceStatuses(envFileConfig),
      currentRuntime: true,
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      productionEnvAppliedToProcess: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: false,
    },
    stages: [],
    blockingStages: [],
    fixChecklist: [],
    unblockChecklist: [],
    fieldEvidenceCoverage: sanitizeFieldEvidenceCoverage(),
    runtimeReadiness: null,
    nextActions: ["检查服务端 env 文件配置、当前 API readiness 端点和生产组合预检脚本后重试。"],
    nextAction: "检查服务端 env 文件配置、当前 API readiness 端点和生产组合预检脚本后重试。",
    error: {
      code: "V1_PRODUCTION_GO_LIVE_LIVE_PRECHECK_FAILED",
      message: "生产上线组合预检失败。",
    },
    safeguards: buildResponseSafeguards(),
  };
}

function sanitizeStages(value) {
  return Array.isArray(value) ? value.map(sanitizeStage).filter(Boolean) : [];
}

function sanitizeStage(value = {}) {
  if (!isPlainObject(value)) return null;
  const summary = isPlainObject(value.summary) ? value.summary : {};
  const blockingItems = sanitizeBlockingItems(value.blockingItems);
  const checks = sanitizeBlockingItems(value.checks);
  const passedCount = nonNegativeInteger(summary.passedCount);
  const totalCount = nonNegativeInteger(summary.totalCount);
  return {
    key: cleanKey(value.key),
    label: sanitizeText(value.label),
    status: cleanKey(value.status) || "pending",
    sourceStatus: cleanKey(value.sourceStatus),
    ready: value.ready === true,
    summary: {
      label: sanitizeText(summary.label) || (totalCount ? `${passedCount}/${totalCount} 通过` : ""),
      passedCount,
      totalCount,
      blockingCount: nonNegativeInteger(summary.blockingCount || blockingItems.length),
      warningCount: nonNegativeInteger(summary.warningCount),
    },
    blockingItems,
    checks,
    nextActions: sanitizeTextList(value.nextActions).slice(0, 8),
  };
}

function sanitizeBlockingItems(value) {
  return Array.isArray(value) ? value.map(sanitizeBlockingItem).filter(Boolean) : [];
}

function sanitizeBlockingItem(value = {}) {
  if (!isPlainObject(value)) return null;
  return {
    key: cleanKey(value.key),
    label: sanitizeText(value.label),
    status: cleanKey(value.status) || "unknown",
    blocking: value.blocking !== false,
    detail: sanitizeText(value.detail || value.nextAction || value.message),
  };
}

function sanitizeUnblockItem(value = {}) {
  if (!isPlainObject(value)) return null;
  const label = sanitizeText(value.label);
  if (!label) return null;
  const blockers = sanitizeBlockingItems(value.blockers);
  const fixItems = Array.isArray(value.fixItems)
    ? value.fixItems.map(sanitizeV1ProductionEnvFixItem).filter(Boolean)
    : [];
  return {
    key: cleanKey(value.key),
    label,
    stageOrder: nonNegativeInteger(value.stageOrder),
    status: cleanKey(value.status) || "pending",
    ready: value.ready === true,
    ownerRole: sanitizeText(value.ownerRole) || "技术/管理",
    blockingCount: nonNegativeInteger(value.blockingCount, blockers.length),
    nextAction: sanitizeText(value.nextAction),
    verificationSteps: sanitizeTextList(value.verificationSteps).slice(0, 5),
    evidenceToKeep: sanitizeTextList(value.evidenceToKeep).slice(0, 5),
    blockers,
    fixItems,
  };
}

function sanitizeFieldEvidenceCoverage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const items = Array.isArray(source.items) ? source.items.map(sanitizeFieldEvidenceItem).filter(Boolean) : [];
  const reportSupportedCount = nonNegativeInteger(
    source.summary?.reportSupportedCount,
    items.filter((item) => item.status === "report_supported").length,
  );
  const totalCount = nonNegativeInteger(source.summary?.totalCount, items.length);
  const needsOnsiteRefCount = nonNegativeInteger(
    source.summary?.needsOnsiteRefCount,
    items.filter((item) => item.status === "needs_onsite_ref").length,
  );
  const waitingForStageCount = nonNegativeInteger(
    source.summary?.waitingForStageCount,
    items.filter((item) => item.status === "waiting_for_stage").length,
  );
  const onsiteRequiredCount = nonNegativeInteger(
    source.summary?.onsiteRequiredCount,
    items.filter((item) => item.status === "onsite_required").length,
  );
  return {
    summary: {
      label: sanitizeText(source.summary?.label) || `${reportSupportedCount}/${totalCount} 可由本报告直接支持`,
      reportSupportedCount,
      needsOnsiteRefCount,
      waitingForStageCount,
      onsiteRequiredCount,
      totalCount,
      reportSupportedLabel: sanitizeText(source.summary?.reportSupportedLabel) || `${reportSupportedCount}/${totalCount}`,
      stillNeedsFieldEvidenceCount: nonNegativeInteger(
        source.summary?.stillNeedsFieldEvidenceCount,
        Math.max(0, totalCount - reportSupportedCount),
      ),
      nextAction: sanitizeText(source.summary?.nextAction) ||
        "先补等待阶段项；对只需现场引用或现场单独证明的项，回填证据编号后再刷新 go-live suite。",
    },
    items,
  };
}

function sanitizeFieldEvidenceItem(value = {}) {
  if (!isPlainObject(value)) return null;
  const itemLabel = sanitizeText(value.itemLabel);
  if (!itemLabel) return null;
  return {
    groupKey: cleanKey(value.groupKey),
    groupLabel: sanitizeText(value.groupLabel),
    itemKey: cleanKey(value.itemKey),
    itemLabel,
    status: cleanKey(value.status) || "waiting_for_stage",
    statusLabel: sanitizeText(value.statusLabel) || "待处理",
    ready: value.ready === true,
    supportingStageKey: cleanKey(value.supportingStageKey),
    supportingStageLabel: sanitizeText(value.supportingStageLabel),
    nextAction: sanitizeText(value.nextAction),
  };
}

function sanitizeRuntimeReadiness(value = {}) {
  const source = isPlainObject(value) ? value : {};
  if (!source.status && source.ready !== true) return null;
  return {
    status: cleanKey(source.status) || "unknown",
    ready: source.ready === true,
    summary: {
      label: sanitizeText(source.summary?.label),
      passedCount: nonNegativeInteger(source.summary?.passedCount),
      totalCount: nonNegativeInteger(source.summary?.totalCount),
      blockingCount: nonNegativeInteger(source.summary?.blockingCount),
    },
    systemPersistence: {
      status: cleanKey(source.systemPersistence?.status) || "unknown",
      ready: source.systemPersistence?.ready === true,
      localRepositoryCount: nonNegativeInteger(source.systemPersistence?.localRepositoryCount),
      localMemoryCount: nonNegativeInteger(source.systemPersistence?.localMemoryCount),
      localPersistenceAcceptedForV1: source.systemPersistence?.localPersistenceAcceptedForV1 === true,
    },
    attachmentReadiness: {
      status: cleanKey(source.attachmentReadiness?.status) || "unknown",
      ready: source.attachmentReadiness?.ready === true,
      storageKind: cleanKey(source.attachmentReadiness?.storageMode?.storageKind),
      storageProvider: cleanKey(source.attachmentReadiness?.storageMode?.storageProvider),
      objectStorageLive: source.attachmentReadiness?.storageMode?.objectStorageLive === true,
      localFsAcceptedForV1: source.attachmentReadiness?.storageMode?.localFsAcceptedForV1 === true,
    },
    productionEnvFileApplication: sanitizeEnvFileApplication(source.productionEnvFileApplication),
    remainingV1Risks: sanitizeTextList(source.remainingV1Risks).slice(0, 8),
  };
}

function sanitizeEnvFileApplication(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    status: cleanKey(source.status) || "unknown",
    ready: source.ready === true,
    applied: source.applied === true,
    selectedSourceKind: cleanKey(source.selectedSourceKind) || "none",
    configuredEnvFileCount: nonNegativeInteger(source.configuredEnvFileCount),
    auditReady: source.auditReady === true,
    auditStatus: cleanKey(source.auditStatus) || "unknown",
    auditBlockingCount: nonNegativeInteger(source.auditBlockingCount),
    auditWarningCount: nonNegativeInteger(source.auditWarningCount),
    assignmentCount: nonNegativeInteger(source.assignmentCount),
  };
}

function buildResponseSafeguards(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    nonMutating: true,
    currentRuntime: true,
    requestBodyIgnored: true,
    envFilePathAccepted: false,
    envFileReadByRequest: false,
    envFilePathExposed: false,
    rawProductionGoLivePrecheckIncluded: false,
    rawProductionEnvPreflightIncluded: false,
    rawRuntimeReadinessReportIncluded: false,
    rawEnvFileAuditIncluded: false,
    rawEnvFileIncluded: false,
    environmentValuesIncluded: false,
    envValuesIncluded: false,
    commandValuesIncluded: false,
    secretValuesIncluded: false,
    localPathExposed: false,
    productionEnvAppliedToProcess: source.productionEnvAppliedToProcess === true,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    physicalPrinterCalled: source.physicalPrinterCalled === true,
    driverReadOnly: source.driverReadOnly !== false,
    readinessRunnerReadOnly: source.readinessRunnerReadOnly !== false,
  };
}

function sanitizeTextList(value) {
  return Array.isArray(value) ? value.map(sanitizeText).filter(Boolean) : [];
}

function sanitizeText(value) {
  return sanitizeV1SensitiveStatusText(value);
}

function cleanKey(value) {
  return String(value ?? "").trim().replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 120);
}

function cleanTimestamp(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return nonNegativeIntegerFallback(fallback);
  return Math.trunc(parsed);
}

function nonNegativeIntegerFallback(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

function normalizeEnvFiles(value) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireFunction(value, label) {
  if (typeof value !== "function") throw new TypeError(`${label} must be a function.`);
}
