import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildProductionEnvFileAuditReport } from "../scripts/run-v1-production-env-file-audit.mjs";
import { parseEnvFile } from "../scripts/run-v1-production-env-preflight.mjs";

const applicationEnvFileSources = [
  {
    envVariable: "ERP_V1_PRODUCTION_ENV_FILE",
    kind: "primary",
    label: "生产 env 应用变量",
  },
  {
    envVariable: "ERP_V1_ENV_FILE",
    kind: "fallback",
    label: "生产 env fallback 变量",
  },
];

const auditOnlyEnvFileSources = [
  {
    envVariable: "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS",
    kind: "audit_only",
    label: "只读审计变量",
  },
];

export function loadV1ProductionEnvFilesIntoProcess(options = {}) {
  const env = options.env ?? process.env;
  const targetEnv = options.targetEnv ?? process.env;
  const config = getV1ProductionEnvFileApplicationConfig(env);
  if (config.envFiles.length === 0) {
    return buildApplicationReport({
      status: "not_configured",
      ready: false,
      applied: false,
      config,
      assignmentCount: 0,
      auditReady: false,
      auditStatus: "not_configured",
      auditBlockingCount: 0,
      auditWarningCount: 0,
    });
  }

  let audit;
  try {
    audit = buildProductionEnvFileAuditReport({ envFiles: config.envFiles });
  } catch (error) {
    const report = buildApplicationReport({
      status: "audit_error",
      ready: false,
      applied: false,
      config,
      assignmentCount: 0,
      auditReady: false,
      auditStatus: "error",
      auditBlockingCount: 1,
      auditWarningCount: 0,
    });
    if (options.throwOnBlocked !== false) {
      throw new Error(
        `V1 production env startup load failed audit: ${cleanLoaderText(error?.message) || "env file is not readable or safe"}`,
      );
    }
    return report;
  }

  if (audit.ready !== true) {
    const report = buildApplicationReport({
      status: "audit_blocked",
      ready: false,
      applied: false,
      config,
      assignmentCount: 0,
      auditReady: false,
      auditStatus: audit.status || "blocked",
      auditBlockingCount: audit.summary?.blockingCount,
      auditWarningCount: audit.summary?.warningCount,
    });
    if (options.throwOnBlocked !== false) {
      throw new Error(
        `V1 production env startup load blocked by env file audit (${report.auditBlockingCount} blocking).`,
      );
    }
    return report;
  }

  let assignmentCount = 0;
  for (const envFile of config.envFiles) {
    const fullPath = resolve(envFile);
    if (!existsSync(fullPath)) {
      const report = buildApplicationReport({
        status: "apply_error",
        ready: false,
        applied: false,
        config,
        assignmentCount,
        auditReady: true,
        auditStatus: audit.status || "passed",
        auditBlockingCount: audit.summary?.blockingCount,
        auditWarningCount: audit.summary?.warningCount,
      });
      if (options.throwOnBlocked !== false) {
        throw new Error("V1 production env startup load failed: configured env file disappeared after audit.");
      }
      return report;
    }
    const parsed = parseEnvFile(readFileSync(fullPath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      targetEnv[key] = value;
      assignmentCount += 1;
    }
  }

  return buildApplicationReport({
    status: "applied",
    ready: true,
    applied: true,
    config,
    assignmentCount,
    auditReady: true,
    auditStatus: audit.status || "passed",
    auditBlockingCount: audit.summary?.blockingCount,
    auditWarningCount: audit.summary?.warningCount,
  });
}

export function getV1ProductionEnvFileApplicationConfig(env = process.env) {
  const applicationSources = applicationEnvFileSources.map((source, index) => {
    const envFiles = parseV1ProductionEnvFileList(env[source.envVariable]);
    return {
      envVariable: source.envVariable,
      kind: source.kind,
      label: source.label,
      order: index + 1,
      configured: envFiles.length > 0,
      envFileCount: envFiles.length,
    };
  });
  const auditOnlySources = auditOnlyEnvFileSources.map((source, index) => {
    const envFiles = parseV1ProductionEnvFileList(env[source.envVariable]);
    return {
      envVariable: source.envVariable,
      kind: source.kind,
      label: source.label,
      order: applicationSources.length + index + 1,
      configured: envFiles.length > 0,
      envFileCount: envFiles.length,
      selected: false,
      ignoredForApplication: envFiles.length > 0,
    };
  });
  const selected = applicationSources.find((item) => item.configured) || null;
  const selectedSource = selected
    ? applicationEnvFileSources.find((item) => item.envVariable === selected.envVariable)
    : null;
  const envFiles = selected ? parseV1ProductionEnvFileList(env[selected.envVariable]) : [];
  const sourceStatuses = [
    ...applicationSources.map((item) => ({
      ...item,
      selected: selected?.envVariable === item.envVariable,
      ignored: item.configured && selected?.envVariable !== item.envVariable,
      ignoredForApplication: item.configured && selected?.envVariable !== item.envVariable,
    })),
    ...auditOnlySources,
  ];
  return {
    envFiles,
    sources: sourceStatuses,
    primaryEnvVariable: applicationEnvFileSources[0].envVariable,
    fallbackEnvVariables: applicationEnvFileSources.slice(1).map((item) => item.envVariable),
    auditOnlyEnvVariables: auditOnlyEnvFileSources.map((item) => item.envVariable),
    selectedEnvVariable: selected?.envVariable || "",
    selectedEnvVariableLabel: selectedSource?.label || "未配置",
    selectedSourceKind: selectedSource?.kind || "none",
    configuredSourceVariableCount: sourceStatuses.filter((item) => item.configured).length,
    configuredApplicationSourceVariableCount: applicationSources.filter((item) => item.configured).length,
    configuredAuditOnlySourceVariableCount: auditOnlySources.filter((item) => item.configured).length,
    configuredEnvFileCount: envFiles.length,
    fallbackSourceUsed: selectedSource?.kind === "fallback",
    auditOnlySourceConfigured: auditOnlySources.some((item) => item.configured),
    ignoredConfiguredFallbackVariableCount: applicationSources.filter(
      (item) => item.configured && item.kind === "fallback" && selected?.envVariable !== item.envVariable,
    ).length,
  };
}

function parseV1ProductionEnvFileList(raw) {
  return String(raw || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildApplicationReport({
  status,
  ready,
  applied,
  config,
  assignmentCount,
  auditReady,
  auditStatus,
  auditBlockingCount,
  auditWarningCount,
}) {
  return {
    scope: "v1_production_env_file_startup_application",
    status,
    ready: ready === true,
    applied: applied === true,
    checkedAt: new Date().toISOString(),
    selectedEnvVariable: config.selectedEnvVariable,
    selectedSourceKind: config.selectedSourceKind,
    selectedEnvVariableLabel: config.selectedEnvVariableLabel,
    configuredEnvFileCount: config.configuredEnvFileCount,
    configuredSourceVariableCount: config.configuredSourceVariableCount,
    configuredApplicationSourceVariableCount: config.configuredApplicationSourceVariableCount,
    configuredAuditOnlySourceVariableCount: config.configuredAuditOnlySourceVariableCount,
    fallbackSourceUsed: config.fallbackSourceUsed,
    auditOnlySourceConfigured: config.auditOnlySourceConfigured,
    auditOnlyEnvVariables: config.auditOnlyEnvVariables,
    ignoredConfiguredFallbackVariableCount: config.ignoredConfiguredFallbackVariableCount,
    sourceStatuses: config.sources.map((source) => ({
      envVariable: source.envVariable,
      kind: source.kind,
      label: source.label,
      order: source.order,
      configured: source.configured === true,
      selected: source.selected === true,
      ignored: source.ignored === true,
      ignoredForApplication: source.ignoredForApplication === true,
      envFileCount: Number.isFinite(source.envFileCount) ? source.envFileCount : 0,
    })),
    assignmentCount: Number.isFinite(assignmentCount) ? Math.max(0, assignmentCount) : 0,
    auditReady: auditReady === true,
    auditStatus: cleanLoaderText(auditStatus) || "unknown",
    auditBlockingCount: Number.isFinite(auditBlockingCount) ? Math.max(0, auditBlockingCount) : 0,
    auditWarningCount: Number.isFinite(auditWarningCount) ? Math.max(0, auditWarningCount) : 0,
    nextAction: buildNextAction({ status, applied, auditReady, auditOnlySourceConfigured: config.auditOnlySourceConfigured }),
    safeguards: {
      startupOnly: true,
      processEnvMutated: applied === true,
      auditRequiredBeforeApply: true,
      auditOnlyPathApplied: false,
      frontendPathAccepted: false,
      envFilePathExposed: false,
      rawEnvFileIncluded: false,
      rawEnvFileAuditIncluded: false,
      rawLineContentIncluded: false,
      envValuesIncluded: false,
      secretValuesIncluded: false,
      commandValuesIncluded: false,
      connectionStringExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      localPathExposed: false,
    },
  };
}

function buildNextAction({ status, applied, auditReady, auditOnlySourceConfigured }) {
  if (applied) {
    return "生产 env 文件已在 API 启动时通过审计并应用；继续运行生产 env 预检、runtime readiness 和发布候选检查。";
  }
  if (status === "not_configured") {
    return auditOnlySourceConfigured
      ? "当前只配置了审计路径；如要让 API 进程真正使用该 env，请配置 ERP_V1_PRODUCTION_ENV_FILE 后重启 API。"
      : "如需由 API 启动时加载安全 env 文件，请配置 ERP_V1_PRODUCTION_ENV_FILE 后重启 API。";
  }
  if (!auditReady) {
    return "先修正安全 env 文件审计阻塞项，再重启 API；未通过审计的 env 文件不会应用到进程。";
  }
  return "检查 API 进程生产 env 文件配置后重启。";
}

function cleanLoaderText(value) {
  return String(value || "")
    .replace(/\/[^\s"',}]+/g, "[redacted-path]")
    .replace(/[A-Za-z0-9_./:-]*SECRET[A-Za-z0-9_./:-]*/gi, "[redacted-secret]")
    .slice(0, 220);
}
