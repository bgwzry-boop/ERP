import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildProductionEnvPreflight, parseEnvFile } from "../../scripts/run-v1-production-env-preflight.mjs";
import { buildProductionEnvFileAuditReport } from "../../scripts/run-v1-production-env-file-audit.mjs";
import {
  getConfiguredV1ProductionEnvApplicationFileConfig,
  sanitizeV1ProductionEnvFileAuditLivePrecheck,
  sanitizeV1ProductionEnvFileConfigSourceStatuses,
} from "./v1ProductionEnvFileAuditService.mjs";
import { sanitizeV1ProductionEnvGate } from "./v1ProductionStatusProjectionService.mjs";

export function precheckV1ProductionEnvFilePreview({
  operatorId,
  env = process.env,
  now = () => new Date(),
  buildAudit = buildProductionEnvFileAuditReport,
  buildPreflight = buildProductionEnvPreflight,
  parseFile = parseEnvFile,
  readFile = readFileSync,
  resolvePath = resolve,
  sanitizeGate = sanitizeV1ProductionEnvGate,
} = {}) {
  const checkedAt = now().toISOString();
  const envFileConfig = getConfiguredV1ProductionEnvApplicationFileConfig({
    allowAuditOnlyFallback: true,
    env,
  });
  const configuredEnvFiles = envFileConfig.envFiles;
  if (configuredEnvFiles.length === 0) {
    const nextAction =
      "在 API 进程配置 ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file> 并重启 API；ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS 只用于只读审计 / 预览。";
    return {
      httpStatus: 200,
      body: buildPrecheckBody({
        operatorId,
        checkedAt,
        status: "not_configured",
        ready: false,
        configuredEnvFileCount: 0,
        fallbackChecks: [
          buildFallbackCheck({
            key: "server-env-file-preview-path-not-configured",
            label: "服务端 env 文件路径未配置",
            detail: "API 进程未配置 ERP_V1_PRODUCTION_ENV_FILE 或 ERP_V1_ENV_FILE。",
            nextAction: "先在服务端配置 API 启动应用生产 env 的安全未跟踪文件，再执行文件应用预检。",
            requiredVariables: ["ERP_V1_PRODUCTION_ENV_FILE or ERP_V1_ENV_FILE"],
            missingVariables: ["ERP_V1_PRODUCTION_ENV_FILE"],
          }),
        ],
        nextAction,
        envFileConfig,
      }),
    };
  }

  try {
    const audit = buildAudit({ envFiles: configuredEnvFiles });
    if (audit.ready !== true) {
      const nextAction = "先修正 env 文件审计阻塞，再重新执行文件应用预检。";
      return {
        httpStatus: 200,
        body: buildPrecheckBody({
          operatorId,
          checkedAt,
          status: "audit_blocked",
          ready: false,
          audit,
          configuredEnvFileCount: configuredEnvFiles.length,
          fallbackChecks: [
            buildFallbackCheck({
              key: "server-env-file-preview-audit-blocked",
              label: "env 文件安全审计未通过",
              detail: "服务端配置的 env 文件仍有安全审计阻塞项，未继续读取变量做应用预检。",
              nextAction,
              requiredVariables: ["通过 env 文件安全审计"],
              missingVariables: ["env 文件安全审计通过"],
            }),
          ],
          nextAction,
          envFileConfig,
        }),
      };
    }

    const previewEnv = buildV1ProductionEnvPreviewEnvironment(configuredEnvFiles, {
      baseEnv: env,
      parseFile,
      readFile,
      resolvePath,
    });
    const envPreflight = buildPreflight({ env: previewEnv, envFiles: configuredEnvFiles });
    const productionEnvGate = sanitizeGate(envPreflight, audit, envPreflight.fixChecklist);
    const blockingChecks = productionEnvGate.checks.filter((item) => item.severity === "blocking" && !item.ready);
    const ready = productionEnvGate.ready === true && blockingChecks.length === 0;
    return {
      httpStatus: 200,
      body: buildPrecheckBody({
        operatorId,
        checkedAt,
        status: ready ? "ready" : "blocked",
        ready,
        audit,
        productionEnvGate,
        configuredEnvFileCount: configuredEnvFiles.length,
        nextAction: ready
          ? "该服务端 env 文件内容可使生产 env 预检通过；下一步用同一安全文件启动 API，再跑运行时 readiness 和 release candidate。"
          : productionEnvGate.nextAction,
        envFileConfig,
      }),
    };
  } catch {
    const nextAction = "检查服务端 env 文件路径、权限和 KEY=VALUE 格式后重试；不要把路径或 env 值传给前端。";
    return {
      httpStatus: 200,
      body: {
        ...buildPrecheckBody({
          operatorId,
          checkedAt,
          status: "error",
          ready: false,
          configuredEnvFileCount: configuredEnvFiles.length,
          fallbackChecks: [
            buildFallbackCheck({
              key: "server-env-file-preview-failed",
              label: "服务端 env 文件应用预检失败",
              detail: "服务端配置的 env 文件缺失、不可读或无法解析为预检环境。",
              nextAction: "检查服务端 env 文件路径、权限和 KEY=VALUE 格式后重试。",
              requiredVariables: ["可读取的安全 env 文件"],
              missingVariables: ["可读取的安全 env 文件"],
            }),
          ],
          nextAction,
          envFileConfig,
        }),
        error: {
          code: "V1_PRODUCTION_ENV_FILE_PREVIEW_LIVE_PRECHECK_FAILED",
          message: "服务端 env 文件应用预检失败。",
        },
      },
    };
  }
}

export function buildV1ProductionEnvPreviewEnvironment(
  envFiles,
  {
    baseEnv = process.env,
    parseFile = parseEnvFile,
    readFile = readFileSync,
    resolvePath = resolve,
  } = {},
) {
  const previewEnv = { ...baseEnv };
  for (const envFile of envFiles) {
    const content = readFile(resolvePath(envFile), "utf8");
    Object.assign(previewEnv, parseFile(content));
  }
  return previewEnv;
}

function buildFallbackCheck({ key, label, detail, nextAction, requiredVariables = [], missingVariables = [] }) {
  return {
    key,
    label,
    ownerRole: "技术/管理",
    severity: "blocking",
    status: "blocked",
    ready: false,
    blocking: true,
    configuredVariableCount: 0,
    totalVariableCount: Math.max(requiredVariables.length, 1),
    requiredVariables,
    recommendedVariables: [],
    missingVariables,
    placeholderVariables: [],
    detail,
    nextAction,
  };
}

function buildPrecheckBody({
  operatorId,
  checkedAt,
  status,
  ready,
  audit = null,
  productionEnvGate = null,
  configuredEnvFileCount = 0,
  fallbackChecks = [],
  nextAction = "",
  envFileConfig = null,
}) {
  const sanitizedAudit = audit ? sanitizeV1ProductionEnvFileAuditLivePrecheck(audit) : null;
  const checks = productionEnvGate?.checks || fallbackChecks;
  const blockingChecks = productionEnvGate
    ? checks.filter((item) => item.severity === "blocking" && !item.ready)
    : fallbackChecks.filter((item) => item.severity === "blocking" && !item.ready);
  const warningChecks = productionEnvGate
    ? checks.filter((item) => item.severity === "warning" && !item.ready)
    : [];
  const passedCount = productionEnvGate?.summary?.passedCount ?? checks.filter((item) => item.ready).length;
  const totalCount = productionEnvGate?.summary?.totalCount ?? (productionEnvGate ? checks.length : 9);
  const blockingCount = productionEnvGate?.summary?.blockingCount ?? blockingChecks.length;
  const warningCount = productionEnvGate?.summary?.warningCount ?? warningChecks.length;
  const readinessLabel = productionEnvGate?.summary?.readinessLabel || `${passedCount}/${totalCount}`;
  const normalizedConfiguredEnvFileCount = nonNegativeInteger(configuredEnvFileCount);
  const configSource = objectOrEmpty(envFileConfig);
  const selectedEnvVariable = cleanText(configSource.selectedEnvVariable);
  const selectedEnvVariableLabel = cleanText(configSource.selectedEnvVariableLabel) || "未配置";
  const selectedSourceKind = cleanText(configSource.selectedSourceKind) || "none";
  const configuredSourceVariableCount = nonNegativeInteger(configSource.configuredSourceVariableCount);
  const ignoredConfiguredFallbackVariableCount = nonNegativeInteger(
    configSource.ignoredConfiguredFallbackVariableCount,
  );
  const ignoredConfiguredAuditOnlyVariableCount = nonNegativeInteger(
    configSource.ignoredConfiguredAuditOnlyVariableCount,
  );
  const sourceStatuses = sanitizeV1ProductionEnvFileConfigSourceStatuses(configSource);
  const envFileAuditReady = sanitizedAudit?.ready === true;
  const appliedInMemory = productionEnvGate !== null;
  const envFilePathConfigured = normalizedConfiguredEnvFileCount > 0;
  const responseReady = ready === true && blockingChecks.length === 0;
  const resolvedNextAction =
    nextAction || productionEnvGate?.nextAction || "先确认服务端 env 文件安全审计通过，再执行文件应用预检。";
  const stageDiagnosis = buildStageDiagnosis({
    status,
    ready: responseReady,
    sanitizedAudit,
    productionEnvGate,
    envFilePathConfigured,
    appliedInMemory,
    nextAction: resolvedNextAction,
    envFileConfig,
  });
  return {
    version: "p0-v1-production-env-file-preview-live-precheck-v1",
    scope: "v1_production_env_file_preview_live_precheck",
    status,
    ready: responseReady,
    checkedAt: productionEnvGate?.checkedAt || sanitizedAudit?.checkedAt || checkedAt,
    operatorId,
    summary: {
      label:
        ready === true
          ? "服务端 env 文件应用预检通过"
          : status === "not_configured"
            ? "服务端 env 文件应用预检未配置"
            : status === "audit_blocked"
              ? "服务端 env 文件安全审计阻塞应用预检"
              : status === "error"
                ? "服务端 env 文件应用预检失败"
                : "服务端 env 文件应用预检仍未通过",
      readinessLabel,
      passedCount,
      totalCount,
      blockingCount,
      warningCount,
      placeholderValueCount: productionEnvGate?.summary?.placeholderValueCount ?? 0,
      envFileCount: normalizedConfiguredEnvFileCount,
      configuredEnvFileCount: normalizedConfiguredEnvFileCount,
      currentRuntime: true,
      envFilePathAccepted: false,
      envFilePathConfigured,
      selectedEnvVariable,
      selectedEnvVariableLabel,
      selectedSourceKind,
      fallbackSourceUsed: configSource.fallbackSourceUsed === true,
      auditOnlySourceUsed: configSource.auditOnlySourceUsed === true,
      configuredSourceVariableCount,
      ignoredConfiguredFallbackVariableCount,
      ignoredConfiguredAuditOnlyVariableCount,
      sourceStatuses,
      appliedInMemory,
      processEnvMutated: false,
      envPreflightReady: productionEnvGate?.ready === true,
      envFileAuditReady,
      envFileAuditStatus: sanitizedAudit?.status || (envFilePathConfigured ? "not_run" : "not_configured"),
      envFileAuditStatusLabel: sanitizedAudit?.statusLabel || (envFilePathConfigured ? "未执行" : "未配置"),
      envFileAuditBlockingCount: sanitizedAudit?.summary?.blockingCount ?? (status === "not_configured" ? 1 : 0),
      currentStage: stageDiagnosis.currentStage,
      currentStageLabel: stageDiagnosis.currentStageLabel,
      stageStatus: stageDiagnosis.stageStatus,
      stageStatusLabel: stageDiagnosis.stageStatusLabel,
      nextStage: stageDiagnosis.nextStage,
      nextStageLabel: stageDiagnosis.nextStageLabel,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      blockerCount: blockingChecks.length,
      warningCheckCount: warningChecks.length,
    },
    checks,
    blockingChecks,
    warningChecks,
    stageDiagnosis,
    nextActions: productionEnvGate?.nextActions || (nextAction ? [nextAction] : []),
    nextAction: resolvedNextAction,
    safeguards: {
      ...(productionEnvGate?.safeguards || {}),
      nonMutating: true,
      currentRuntime: true,
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      envFileReadByRequest: false,
      envFilePathExposed: false,
      liveProcessEnvChecked: false,
      liveProcessEnvOverlayChecked: appliedInMemory,
      envFileValuesAppliedInMemoryOnly: appliedInMemory,
      processEnvMutated: false,
      rawProductionEnvPreflightIncluded: false,
      rawEnvFileAuditIncluded: false,
      rawEnvFileIncluded: false,
      rawLineContentIncluded: false,
      environmentValuesIncluded: false,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      connectionStringExposed: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function buildStageDiagnosis({
  status,
  ready,
  sanitizedAudit,
  productionEnvGate,
  envFilePathConfigured,
  appliedInMemory,
  nextAction,
  envFileConfig,
}) {
  const configSource = objectOrEmpty(envFileConfig);
  const sourceDiagnosis = {
    selectedEnvVariable: cleanText(configSource.selectedEnvVariable),
    selectedEnvVariableLabel: cleanText(configSource.selectedEnvVariableLabel) || "未配置",
    selectedSourceKind: cleanText(configSource.selectedSourceKind) || "none",
    fallbackSourceUsed: configSource.fallbackSourceUsed === true,
    auditOnlySourceUsed: configSource.auditOnlySourceUsed === true,
    configuredSourceVariableCount: nonNegativeInteger(configSource.configuredSourceVariableCount),
    ignoredConfiguredFallbackVariableCount: nonNegativeInteger(configSource.ignoredConfiguredFallbackVariableCount),
    ignoredConfiguredAuditOnlyVariableCount: nonNegativeInteger(
      configSource.ignoredConfiguredAuditOnlyVariableCount,
    ),
    sourceStatuses: sanitizeV1ProductionEnvFileConfigSourceStatuses(configSource),
    pathValueExposed: false,
  };
  if (status === "not_configured") {
    return stage({
      currentStage: "server_env_file_path",
      currentStageLabel: "服务端路径配置",
      stageStatus: "not_configured",
      stageStatusLabel: "未配置",
      nextStage: "env_file_audit",
      nextStageLabel: "env 文件安全审计",
      auditReady: false,
      envPreflightReady: false,
      envFilePathConfigured: false,
      appliedInMemory: false,
      sourceDiagnosis,
      detail: "API 进程未配置服务端安全 env 文件路径，系统没有读取任何 env 文件。",
      nextAction: nextAction || "先在服务端配置安全未跟踪 env 文件路径，再执行文件应用预检。",
    });
  }
  if (status === "audit_blocked") {
    return stage({
      currentStage: "env_file_audit",
      currentStageLabel: "env 文件安全审计",
      stageStatus: "audit_blocked",
      stageStatusLabel: "审计阻塞",
      nextStage: "env_preflight",
      nextStageLabel: "生产 env 变量预检",
      auditReady: false,
      envPreflightReady: false,
      envFilePathConfigured,
      appliedInMemory: false,
      sourceDiagnosis,
      detail: "服务端 env 文件路径已配置，但安全审计未通过，系统没有继续读取变量做应用预检。",
      nextAction: nextAction || "先修正 env 文件审计阻塞，再重新执行文件应用预检。",
    });
  }
  if (status === "error") {
    return stage({
      currentStage: "env_file_preview",
      currentStageLabel: "env 文件应用预检",
      stageStatus: "error",
      stageStatusLabel: "预检失败",
      nextStage: "retry_env_file_preview",
      nextStageLabel: "修正后重试",
      auditReady: sanitizedAudit?.ready === true,
      envPreflightReady: false,
      envFilePathConfigured,
      appliedInMemory,
      sourceDiagnosis,
      detail: "服务端 env 文件缺失、不可读或无法解析为预检环境。",
      nextAction: nextAction || "检查服务端 env 文件路径、权限和 KEY=VALUE 格式后重试。",
    });
  }
  if (ready === true && productionEnvGate?.ready === true) {
    return stage({
      currentStage: "env_preflight",
      currentStageLabel: "生产 env 变量预检",
      stageStatus: "ready",
      stageStatusLabel: "已通过",
      nextStage: "runtime_readiness",
      nextStageLabel: "运行时 readiness / release candidate",
      auditReady: sanitizedAudit?.ready === true,
      envPreflightReady: true,
      envFilePathConfigured,
      appliedInMemory,
      sourceDiagnosis,
      detail: "env 文件安全审计已通过，文件变量以内存叠加方式通过生产 env 预检。",
      nextAction: nextAction || "用同一安全 env 文件启动 API，再跑运行时 readiness、生产 profile 和 release candidate。",
    });
  }
  return stage({
    currentStage: "env_preflight",
    currentStageLabel: "生产 env 变量预检",
    stageStatus: "env_preflight_blocked",
    stageStatusLabel: "变量预检阻塞",
    nextStage: "fix_production_env_values",
    nextStageLabel: "补齐生产 env 变量",
    auditReady: sanitizedAudit?.ready === true,
    envPreflightReady: false,
    envFilePathConfigured,
    appliedInMemory,
    sourceDiagnosis,
    detail: "env 文件安全审计已通过，系统已用内存叠加方式读取变量，但生产 env 变量预检仍有阻塞。",
    nextAction: nextAction || productionEnvGate?.nextAction || "补齐生产 env 变量后重新执行文件应用预检。",
  });
}

function stage({ sourceDiagnosis, ...value }) {
  return { ...value, processEnvMutated: false, ...sourceDiagnosis };
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}
