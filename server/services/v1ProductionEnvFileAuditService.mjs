import { buildProductionEnvFileAuditReport } from "../../scripts/run-v1-production-env-file-audit.mjs";
import { sanitizeV1ProductionEnvFileAudit } from "./v1ProductionStatusProjectionService.mjs";

const AUDIT_CONFIG_SOURCES = [
  { envVariable: "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS", kind: "primary", label: "只读审计变量" },
  { envVariable: "ERP_V1_PRODUCTION_ENV_FILE", kind: "fallback", label: "API 启动应用变量" },
  { envVariable: "ERP_V1_ENV_FILE", kind: "fallback", label: "fallback 应用变量" },
];

const APPLICATION_CONFIG_SOURCES = [
  { envVariable: "ERP_V1_PRODUCTION_ENV_FILE", kind: "primary", label: "API 启动应用变量" },
  { envVariable: "ERP_V1_ENV_FILE", kind: "fallback", label: "fallback 应用变量" },
  {
    envVariable: "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS",
    kind: "audit_only",
    label: "只读审计 / 预览变量",
  },
];

const VALUES_CONFIG_SOURCES = [
  { envVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE", kind: "primary", label: "真实值片段变量" },
  {
    envVariable: "ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE",
    kind: "fallback",
    label: "最小阻塞补值片段变量",
  },
  {
    envVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE",
    kind: "fallback",
    label: "兼容真实值片段变量",
  },
];

export function precheckV1ProductionEnvFileAudit({
  operatorId,
  env = process.env,
  now = () => new Date(),
  buildAudit = buildProductionEnvFileAuditReport,
} = {}) {
  const checkedAt = now().toISOString();
  const envFileConfig = getConfiguredV1ProductionEnvAuditFileConfig(env);
  const configuredEnvFiles = envFileConfig.envFiles;
  if (configuredEnvFiles.length === 0) {
    return {
      httpStatus: 200,
      body: buildPrecheckBody({
        operatorId,
        checkedAt,
        status: "not_configured",
        ready: false,
        audit: buildMissingAudit(checkedAt),
        configuredEnvFileCount: 0,
        envFileConfig,
      }),
    };
  }

  try {
    const audit = buildAudit({ envFiles: configuredEnvFiles });
    return {
      httpStatus: 200,
      body: buildPrecheckBody({
        operatorId,
        checkedAt,
        status: audit.ready ? "passed" : "blocked",
        ready: audit.ready === true,
        audit,
        configuredEnvFileCount: configuredEnvFiles.length,
        envFileConfig,
      }),
    };
  } catch {
    const audit = buildFailedAudit(checkedAt, configuredEnvFiles.length);
    return {
      httpStatus: 200,
      body: {
        ...buildPrecheckBody({
          operatorId,
          checkedAt,
          status: "blocked",
          ready: false,
          audit,
          configuredEnvFileCount: configuredEnvFiles.length,
          envFileConfig,
        }),
        error: {
          code: "V1_PRODUCTION_ENV_FILE_AUDIT_LIVE_PRECHECK_FAILED",
          message: "服务端 env 文件安全审计失败。",
        },
      },
    };
  }
}

export function getConfiguredV1ProductionEnvAuditFileConfig(env = process.env) {
  return buildConfiguredV1ProductionEnvFileConfig(AUDIT_CONFIG_SOURCES, { env });
}

export function getConfiguredV1ProductionEnvApplicationFileConfig(
  { allowAuditOnlyFallback = false, env = process.env } = {},
) {
  const sources = APPLICATION_CONFIG_SOURCES.map((source) =>
    source.kind === "audit_only"
      ? {
          ...source,
          selectable: allowAuditOnlyFallback,
          label: allowAuditOnlyFallback ? "只读审计 / 预览变量" : "只读审计变量（go-live 不使用）",
        }
      : source,
  );
  return buildConfiguredV1ProductionEnvFileConfig(sources, { env });
}

export function getConfiguredV1ProductionEnvValuesFileConfig(env = process.env) {
  return buildConfiguredV1ProductionEnvFileConfig(VALUES_CONFIG_SOURCES, { env });
}

export function buildConfiguredV1ProductionEnvFileConfig(configSources, { env = process.env } = {}) {
  const sourceStatuses = configSources.map((source, index) => {
    const envFiles = parseFileList(env?.[source.envVariable]);
    return {
      ...source,
      order: index + 1,
      selectable: source.selectable !== false,
      configured: envFiles.length > 0,
      selected: false,
      ignored: false,
      envFileCount: envFiles.length,
    };
  });
  const selected = sourceStatuses.find((item) => item.selectable && item.configured) || null;
  for (const source of sourceStatuses) {
    source.selected = source.envVariable === selected?.envVariable;
    source.ignored = source.configured && !source.selected;
  }
  const envFiles = selected ? parseFileList(env?.[selected.envVariable]) : [];
  return {
    envFiles,
    sources: sourceStatuses,
    primaryEnvVariable: configSources[0]?.envVariable || "",
    fallbackEnvVariables: configSources
      .slice(1)
      .filter((item) => item.kind !== "audit_only")
      .map((item) => item.envVariable),
    auditOnlyEnvVariables: configSources
      .filter((item) => item.kind === "audit_only")
      .map((item) => item.envVariable),
    selectedEnvVariable: selected?.envVariable || "",
    selectedEnvVariableLabel: selected?.label || "未配置",
    selectedSourceKind: selected?.kind || "none",
    configuredSourceVariableCount: sourceStatuses.filter((item) => item.configured).length,
    configuredEnvFileCount: envFiles.length,
    fallbackSourceUsed: selected?.kind === "fallback",
    auditOnlySourceUsed: selected?.kind === "audit_only",
    ignoredConfiguredFallbackVariableCount: sourceStatuses.filter(
      (item) => item.configured && item.kind === "fallback" && selected?.envVariable !== item.envVariable,
    ).length,
    ignoredConfiguredAuditOnlyVariableCount: sourceStatuses.filter(
      (item) => item.configured && item.kind === "audit_only" && selected?.envVariable !== item.envVariable,
    ).length,
  };
}

export function sanitizeV1ProductionEnvFileConfigSourceStatuses(configSource = {}) {
  return Array.isArray(configSource.sources)
    ? configSource.sources
        .map((item) => ({
          envVariable: cleanText(item.envVariable),
          kind: cleanText(item.kind) || "fallback",
          label: cleanText(item.label) || "变量",
          order: nonNegativeInteger(item.order),
          selectable: item.selectable !== false,
          configured: item.configured === true,
          selected: item.selected === true,
          ignored: item.ignored === true,
          envFileCount: nonNegativeInteger(item.envFileCount),
        }))
        .filter((item) => item.envVariable)
    : [];
}

export function sanitizeV1ProductionEnvFileAuditLivePrecheck(value = {}) {
  const source = objectOrEmpty(value);
  const base = sanitizeV1ProductionEnvFileAudit({ ...source, included: source.included !== false });
  const files = Array.isArray(source.files)
    ? source.files.map((item, index) => sanitizeAuditFile(item, index)).filter(Boolean)
    : [];
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(sanitizeAuditFinding).filter(Boolean)
    : [];
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(sanitizeAuditFinding).filter(Boolean)
    : [];
  const status = cleanText(source.status) || base.status;
  return {
    ...base,
    status,
    statusLabel:
      status === "not_configured"
        ? "未配置"
        : base.ready && blockingFindings.length === 0
          ? "已通过"
          : blockingFindings.length > 0
            ? "阻塞"
            : warningFindings.length > 0
              ? "警告"
              : base.statusLabel,
    checkedAt: cleanText(source.checkedAt),
    files,
    blockingFindings,
    warningFindings,
    nextActions: stringList(source.nextActions).slice(0, 8),
    safeguards: {
      ...base.safeguards,
      nonMutating: true,
      envValuesIncluded: false,
      envFilePathExposed: false,
      rawEnvFileIncluded: false,
      rawLineContentIncluded: false,
      commentsCopied: false,
    },
  };
}

function buildPrecheckBody({
  operatorId,
  checkedAt,
  status,
  ready,
  audit,
  configuredEnvFileCount,
  envFileConfig,
}) {
  const sanitizedAudit = sanitizeV1ProductionEnvFileAuditLivePrecheck(audit);
  const blockingFindings = sanitizedAudit.blockingFindings;
  const warningFindings = sanitizedAudit.warningFindings;
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
  return {
    version: "p0-v1-production-env-file-audit-live-precheck-v1",
    scope: "v1_production_env_file_audit_live_precheck",
    status,
    ready: ready === true && blockingFindings.length === 0,
    checkedAt: sanitizedAudit.checkedAt || checkedAt,
    operatorId,
    summary: {
      label: ready
        ? "服务端 env 文件安全审计通过"
        : status === "not_configured"
          ? "服务端 env 文件审计未配置"
          : "服务端 env 文件安全审计仍未通过",
      auditLabel: sanitizedAudit.summary.label,
      auditStatus: sanitizedAudit.status,
      auditStatusLabel: sanitizedAudit.statusLabel,
      envFileCount: sanitizedAudit.envFileCount,
      configuredEnvFileCount: nonNegativeInteger(configuredEnvFileCount),
      fileCount: sanitizedAudit.summary.fileCount,
      blockingCount: sanitizedAudit.summary.blockingCount,
      blockingLabel: `${sanitizedAudit.summary.blockingCount} 项`,
      warningCount: sanitizedAudit.summary.warningCount,
      warningLabel: `${sanitizedAudit.summary.warningCount} 项`,
      passedCount: sanitizedAudit.summary.passedCount,
      placeholderAssignmentCount: sanitizedAudit.summary.placeholderAssignmentCount,
      uncommentedAssignmentCount: sanitizedAudit.summary.uncommentedAssignmentCount,
      sensitiveVariableNameCount: sanitizedAudit.summary.sensitiveVariableNameCount,
      crossFileDuplicateVariableCount: sanitizedAudit.summary.crossFileDuplicateVariableCount,
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      envFilePathConfigured: nonNegativeInteger(configuredEnvFileCount) > 0,
      selectedEnvVariable,
      selectedEnvVariableLabel,
      selectedSourceKind,
      fallbackSourceUsed: configSource.fallbackSourceUsed === true,
      auditOnlySourceUsed: configSource.auditOnlySourceUsed === true,
      configuredSourceVariableCount,
      ignoredConfiguredFallbackVariableCount,
      ignoredConfiguredAuditOnlyVariableCount,
      currentRuntime: true,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    files: sanitizedAudit.files,
    blockingFindings,
    warningFindings,
    serverConfigGuidance: buildServerConfigGuidance({
      configuredEnvFileCount,
      ready: ready === true && blockingFindings.length === 0,
      status,
      envFileConfig,
    }),
    nextActions: sanitizedAudit.nextActions,
    nextAction:
      sanitizedAudit.nextActions[0] ||
      (ready ? "继续运行生产 env 变量预检和 release candidate 检查。" : "修正 env 文件安全审计阻塞后重试。"),
    safeguards: {
      ...sanitizedAudit.safeguards,
      nonMutating: true,
      currentRuntime: true,
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      envFileReadByRequest: false,
      envFilePathExposed: false,
      envFilePathSetupGuidanceIncluded: true,
      rawEnvFileIncluded: false,
      rawEnvFileAuditIncluded: false,
      rawLineContentIncluded: false,
      commentsCopied: false,
      envValuesIncluded: false,
      secretValuesIncluded: false,
      commandValuesIncluded: false,
      connectionStringExposed: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function buildServerConfigGuidance({ configuredEnvFileCount, ready, status, envFileConfig } = {}) {
  const configuredCount = nonNegativeInteger(configuredEnvFileCount);
  const configSource = objectOrEmpty(envFileConfig);
  const sourceStatuses = sanitizeV1ProductionEnvFileConfigSourceStatuses(configSource);
  const selectedEnvVariable = cleanText(configSource.selectedEnvVariable);
  const selectedSourceKind = cleanText(configSource.selectedSourceKind) || "none";
  const selectedEnvVariableLabel = cleanText(configSource.selectedEnvVariableLabel) || "未配置";
  const configuredSourceVariableCount = nonNegativeInteger(configSource.configuredSourceVariableCount);
  const ignoredConfiguredFallbackVariableCount = nonNegativeInteger(
    configSource.ignoredConfiguredFallbackVariableCount,
  );
  const ignoredConfiguredAuditOnlyVariableCount = nonNegativeInteger(
    configSource.ignoredConfiguredAuditOnlyVariableCount,
  );
  return {
    label: configuredCount > 0 ? "服务端 env 文件路径已配置" : "服务端 env 文件路径待配置",
    status: configuredCount > 0 ? "configured" : "not_configured",
    ready: ready === true,
    primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS",
    fallbackEnvVariables: ["ERP_V1_PRODUCTION_ENV_FILE", "ERP_V1_ENV_FILE"],
    selectedEnvVariable,
    selectedEnvVariableLabel,
    selectedSourceKind,
    fallbackSourceUsed: configSource.fallbackSourceUsed === true,
    auditOnlySourceUsed: configSource.auditOnlySourceUsed === true,
    configuredSourceVariableCount,
    ignoredConfiguredFallbackVariableCount,
    ignoredConfiguredAuditOnlyVariableCount,
    sourceStatuses,
    configuredEnvFileCount: configuredCount,
    acceptsFrontendPath: false,
    pathValueExposed: false,
    restartRequired: true,
    currentAuditStatus: cleanText(status) || "unknown",
    steps: [
      "从交接包的 production-env-fill-template.env.example 复制到安全、未跟踪的生产 env 文件。",
      "把真实 PostgreSQL、对象存储、打印和验收变量只填入该安全 env 文件。",
      "在 API 进程环境中配置 ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS，指向该安全 env 文件；多个文件用逗号、分号或换行分隔。",
      "重启 API 进程后，在上线状态页重新点击 env 文件审计、文件应用预检和组合预检。",
    ],
    verificationActions: [
      "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file> --json",
      "node scripts/run-v1-production-env-preflight.mjs --env-file <secure-env-file> --json",
      "POST /api/system/v1-production-env-file-audit/live-precheck",
      "POST /api/system/v1-production-env-file-preview/live-precheck",
      "POST /api/system/v1-production-go-live/live-precheck",
    ],
    safeguards: {
      envFilePathAcceptedFromFrontend: false,
      envFilePathValueIncluded: false,
      sourceVariableNamesOnly: true,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function buildMissingAudit(checkedAt) {
  return {
    status: "not_configured",
    ready: false,
    checkedAt,
    envFileCount: 0,
    summary: emptySummary("服务端未配置安全 env 文件审计路径", 1),
    files: [],
    blockingFindings: [
      {
        key: "server-env-file-audit-path-not-configured",
        label: "服务端 env 文件审计路径未配置",
        status: "blocked",
        severity: "blocking",
        detail: "API 进程未配置 ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS。",
        nextAction: "在服务端配置安全未跟踪 env 文件路径后，重启 API 并重新审计。",
        variables: [],
      },
    ],
    warningFindings: [],
    nextActions: ["在 API 进程配置 ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS，指向安全未跟踪 env 文件。"],
    safeguards: auditSafeguards(),
  };
}

function buildFailedAudit(checkedAt, envFileCount) {
  return {
    status: "blocked",
    ready: false,
    checkedAt,
    envFileCount,
    summary: { ...emptySummary("服务端 env 文件审计失败", 1), fileCount: envFileCount },
    files: [],
    blockingFindings: [
      {
        key: "server-env-file-audit-failed",
        label: "服务端 env 文件不可审计",
        status: "blocked",
        severity: "blocking",
        detail: "服务端配置的 env 文件缺失、不可读或格式不符合审计要求。",
        nextAction: "检查服务端 env 文件路径、权限和格式后重试；不要把真实路径或 env 值传给前端。",
        variables: [],
      },
    ],
    warningFindings: [],
    nextActions: ["检查 API 进程配置的 env 文件是否存在、可读、未被 git 跟踪且位于忽略路径。"],
    safeguards: auditSafeguards(),
  };
}

function emptySummary(label, blockingCount) {
  return {
    label,
    fileCount: 0,
    blockingCount,
    warningCount: 0,
    passedCount: 0,
    placeholderAssignmentCount: 0,
    uncommentedAssignmentCount: 0,
    sensitiveVariableNameCount: 0,
    crossFileDuplicateVariableCount: 0,
  };
}

function auditSafeguards() {
  return {
    nonMutating: true,
    envValuesExposed: false,
    connectionStringExposed: false,
    secretFieldsExposed: false,
    commandValueExposed: false,
    commentsCopied: false,
    rawLineContentCopied: false,
  };
}

function sanitizeAuditFile(value, index) {
  if (!isPlainObject(value)) return null;
  return {
    key: `env-file-${index + 1}`,
    label: `env 文件 ${index + 1}`,
    insideWorkspace: value.insideWorkspace === true,
    outsideWorkspace: value.git?.outsideWorkspace === true,
    gitTracked: value.git?.tracked === true,
    gitIgnored: value.git?.ignored === true,
    fileMode: cleanText(value.fileMode),
    uncommentedAssignmentCount: nonNegativeInteger(value.uncommentedAssignmentCount),
    placeholderAssignmentCount: nonNegativeInteger(value.placeholderAssignmentCount),
    duplicateVariableCount: nonNegativeInteger(value.duplicateVariableCount),
    sensitiveVariableNameCount: nonNegativeInteger(value.sensitiveVariableNameCount),
    variableCount: Array.isArray(value.variableNames) ? value.variableNames.length : 0,
  };
}

function sanitizeAuditFinding(value) {
  if (!isPlainObject(value)) return null;
  const key = cleanText(value.key) || "env-file-audit-finding";
  const severity = cleanText(value.severity) || (value.status === "passed" ? "ok" : "blocking");
  const variables = stringList(value.variables);
  return {
    key,
    label: cleanText(value.label) || key,
    status: cleanText(value.status) || (severity === "warning" ? "warning" : severity === "ok" ? "passed" : "blocked"),
    severity,
    detail: cleanText(value.detail),
    variables: variables.slice(0, 12),
    variableLabel: variables.length ? `${variables.length} 个变量` : "",
    nextAction: cleanText(value.nextAction),
  };
}

function parseFileList(raw) {
  return String(raw || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function objectOrEmpty(value) {
  return isPlainObject(value) ? value : {};
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}
