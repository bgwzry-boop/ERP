import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildProductionEnvIntakeVerifyReport } from "../../scripts/run-v1-production-env-intake-verify.mjs";
import { sanitizeV1RoleTaskActionText } from "./v1StatusTextSanitizer.mjs";
import { sanitizeV1ProductionEnvIntakeVerification } from "./v1ProductionStatusProjectionService.mjs";

export const V1_PRODUCTION_ENV_SETUP_JSON_PATH = ".erp-local-storage/v1-production-env-setup/latest.json";
export const V1_PRODUCTION_ENV_INTAKE_CSV_PATH =
  ".erp-local-storage/v1-production-env-setup/production-env-real-value-intake.csv";

export function precheckV1ProductionEnvIntake({
  operatorId,
  now = () => new Date(),
  resolveSetup = resolveV1ProductionEnvSetupSafeEnvFileForIntakeLivePrecheck,
  buildVerification = buildProductionEnvIntakeVerifyReport,
  intakeCsv = V1_PRODUCTION_ENV_INTAKE_CSV_PATH,
} = {}) {
  const checkedAt = now().toISOString();
  const setupEnvResolution = resolveSetup();
  if (setupEnvResolution.ready !== true) {
    return {
      httpStatus: 200,
      body: buildPrecheckBody({
        operatorId,
        checkedAt,
        status: setupEnvResolution.status,
        ready: false,
        report: {},
        setupEnvResolution,
        blockingItems: setupEnvResolution.blockingItems,
        nextAction: setupEnvResolution.nextAction,
      }),
    };
  }

  try {
    const report = buildVerification({
      envFiles: setupEnvResolution.envFiles,
      intakeCsv,
    });
    const verification = sanitizeV1ProductionEnvIntakeVerification(report);
    const ready = verification.ready === true;
    return {
      httpStatus: 200,
      body: buildPrecheckBody({
        operatorId,
        checkedAt,
        status: ready ? "ready" : verification.status || "blocked",
        ready,
        report,
        setupEnvResolution,
        nextAction:
          verification.nextActions[0] ||
          (ready
            ? "生产 env 真实值 intake 校验已通过；继续执行生产 env 变量预检和第一阶段。"
            : "按真实值 intake 阻塞项补齐安全 env 文件或清单验收列，再重新校验真实值。"),
      }),
    };
  } catch {
    return {
      httpStatus: 200,
      body: buildPrecheckBody({
        operatorId,
        checkedAt,
        status: "error",
        ready: false,
        report: {},
        setupEnvResolution,
        blockingItems: [
          {
            key: "production-env-intake-live-precheck-failed",
            label: "生产 env 真实值校验执行失败",
            status: "error",
            detail: "服务端执行生产 env 真实值 intake 校验失败，可能是 setup 安全 env 文件或 intake CSV 未就绪。",
            nextAction: "由技术/管理检查 production env setup、真实值 intake CSV 和安全 env 文件后重试；不要把真实路径或 env 值传给前端。",
          },
        ],
        nextAction: "检查 production env setup 安全文件和真实值 intake CSV 后重试。",
        error: {
          code: "V1_PRODUCTION_ENV_INTAKE_LIVE_PRECHECK_FAILED",
          message: "生产 env 真实值 intake 校验失败。",
        },
      }),
    };
  }
}

export function resolveV1ProductionEnvSetupSafeEnvFileForIntakeLivePrecheck({
  setupJsonPath = V1_PRODUCTION_ENV_SETUP_JSON_PATH,
  exists = existsSync,
  readFile = readFileSync,
  resolvePath = resolve,
} = {}) {
  const resolvedSetupJsonPath = resolvePath(setupJsonPath);
  if (!exists(resolvedSetupJsonPath)) {
    return blockedResolution({
      status: "not_configured",
      setupReportAvailable: false,
      key: "production-env-setup-latest-missing",
      label: "production env setup 报告未生成",
      detail: "未找到 production env setup latest 报告，无法安全定位生产 env 文件。",
      nextAction: "先运行 production env setup，生成安全未跟踪 env 文件和 latest 报告后，再重新校验真实值。",
    });
  }

  let setup;
  try {
    setup = JSON.parse(readFile(resolvedSetupJsonPath, "utf8"));
  } catch {
    return blockedResolution({
      status: "blocked",
      setupReportAvailable: true,
      key: "production-env-setup-latest-unreadable",
      label: "production env setup 报告不可读",
      detail: "production env setup latest 不是有效 JSON，无法安全定位生产 env 文件。",
      nextAction: "重新运行 production env setup，生成脱敏 latest 报告后再重试。",
    });
  }

  const blockingItems = [];
  if (setup?.scope !== "v1_production_env_setup") {
    blockingItems.push(blocker({
      key: "production-env-setup-latest-shape",
      label: "production env setup 报告形状不正确",
      detail: "latest 报告 scope 不是 v1_production_env_setup，不能复用其中的 env 文件。",
      nextAction: "重新运行 production env setup，确认报告来源正确。",
    }));
  }
  const envFilePath = cleanText(setup?.envFile?.path);
  if (!envFilePath) {
    blockingItems.push(blocker({
      key: "production-env-setup-env-file-missing",
      label: "setup 报告没有安全 env 文件",
      detail: "production env setup latest 未记录 envFile.path，不能执行真实值 intake 校验。",
      nextAction: "重新运行 production env setup，生成安全未跟踪 env 文件。",
    }));
  }
  if (setup?.setupReady !== true) {
    blockingItems.push(blocker({
      key: "production-env-setup-not-ready",
      label: "production env setup 未 ready",
      detail: "setupReady 不是 true，不能复用该 env 文件做真实值校验。",
      nextAction: "按 setup 报告阻塞项修正后重新运行 setup，再重试真实值校验。",
    }));
  }
  if (setup?.envFile?.gitIgnored !== true || setup?.envFile?.gitTracked === true) {
    blockingItems.push(blocker({
      key: "production-env-setup-env-file-git-safety",
      label: "setup env 文件未确认 git 安全",
      detail: "setup 报告未确认 env 文件已 git ignore 且未被 git 跟踪。",
      nextAction: "把真实 env 文件放在安全未跟踪位置，确认 git ignore 后重新运行 setup。",
    }));
  }
  if (setup?.envFile?.fileMode && setup.envFile.fileMode !== "600") {
    blockingItems.push(blocker({
      key: "production-env-setup-env-file-mode",
      label: "setup env 文件权限不符合要求",
      detail: "setup 报告显示 env 文件权限不是 600，不能在页面入口复用。",
      nextAction: "把安全 env 文件权限收窄到 600，重新运行 setup 后重试。",
    }));
  }
  const resolvedEnvFilePath = envFilePath ? resolvePath(envFilePath) : "";
  if (envFilePath && !exists(resolvedEnvFilePath)) {
    blockingItems.push(blocker({
      key: "production-env-setup-env-file-not-found",
      label: "setup env 文件不存在",
      detail: "setup 报告引用的安全 env 文件当前不存在。",
      nextAction: "恢复或重新生成安全 env 文件，再运行 setup 和真实值校验。",
    }));
  }

  if (blockingItems.length) {
    return {
      status: "blocked",
      ready: false,
      setupReportAvailable: true,
      setupReady: setup?.setupReady === true,
      envFileCount: 0,
      envFiles: [],
      blockingItems,
      nextAction: blockingItems[0]?.nextAction || "修正 production env setup 后重试。",
    };
  }
  return {
    status: "configured",
    ready: true,
    setupReportAvailable: true,
    setupReady: true,
    envFileCount: 1,
    envFiles: [resolvedEnvFilePath],
    blockingItems: [],
    nextAction: "已复用 production env setup 安全 env 文件，可执行真实值 intake 校验。",
  };
}

function buildPrecheckBody({
  operatorId,
  checkedAt,
  status,
  ready,
  report = {},
  setupEnvResolution = {},
  blockingItems = [],
  nextAction = "",
  error = null,
} = {}) {
  const verification = sanitizeV1ProductionEnvIntakeVerification(report);
  const sanitizedBlockingItems = Array.isArray(blockingItems)
    ? blockingItems.map(sanitizeBlockingItem).filter(Boolean)
    : [];
  const resultStatus =
    cleanText(status) ||
    (ready === true
      ? "ready"
      : verification.available
        ? verification.status || "blocked"
        : setupEnvResolution.status || "not_configured");
  const verificationBlockingCount = nonNegativeInteger(verification.summary?.blockingCount);
  const verificationWarningCount = nonNegativeInteger(verification.summary?.warningCount);
  const blockingCount = sanitizedBlockingItems.length + verificationBlockingCount;
  const label =
    ready === true
      ? "生产 env 真实值校验通过"
      : resultStatus === "not_configured"
        ? "生产 env setup 安全文件未配置"
        : resultStatus === "error"
          ? "生产 env 真实值校验失败"
          : "生产 env 真实值校验仍有阻塞";
  const resolvedNextAction =
    cleanText(nextAction) ||
    verification.nextActions[0] ||
    (ready === true
      ? "继续执行生产 env 变量预检和生产环境 / 持久化第一阶段。"
      : "按真实值 intake 校验阻塞项补齐安全 env 文件或清单验收列后重试。");
  const body = {
    version: "p0-v1-production-env-intake-live-precheck-v1",
    scope: "v1_production_env_intake_live_precheck",
    status: resultStatus,
    ready: ready === true,
    checkedAt: verification.checkedAt || checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label,
      verificationLabel: verification.summary.label,
      verificationStatus: verification.status,
      configuredLabel: verification.summary.configuredLabel,
      fullIntakeConfiguredLabel: verification.summary.fullIntakeConfiguredLabel,
      intakeRowCount: verification.summary.intakeRowCount,
      configuredRowCount: verification.summary.configuredRowCount,
      missingRowCount: verification.summary.missingRowCount,
      minimumBlockingLabel: verification.summary.minimumBlockingLabel,
      minimumWarningLabel: verification.summary.minimumWarningLabel,
      minimumBlockingMissingCount: verification.summary.minimumBlockingMissingCount,
      minimumWarningMissingCount: verification.summary.minimumWarningMissingCount,
      blockingCount,
      warningCount: verificationWarningCount,
      blockerLabel: `${blockingCount} 项`,
      warningLabel: `${verificationWarningCount} 项`,
      auditReady: verification.summary.auditReady === true,
      intakeCsvReady: verification.summary.intakeCsvReady === true,
      setupReportAvailable: setupEnvResolution.setupReportAvailable === true,
      setupReady: setupEnvResolution.setupReady === true,
      envFileFromProductionSetup: setupEnvResolution.ready === true,
      envFileCount: nonNegativeInteger(setupEnvResolution.envFileCount),
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      envFilePathExposed: false,
      intakeCsvPathExposed: false,
      productionEnvFileMutated: false,
      productionEnvValuesApplyExecuted: false,
      businessDataMutated: false,
      schemaMigrationApplyExecuted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
    },
    verification,
    blockingItems: sanitizedBlockingItems,
    minimumBlockingItems: verification.minimumBlockingItems,
    blockingFindings: verification.blockingFindings,
    warningFindings: verification.warningFindings,
    serverConfigGuidance: buildServerConfigGuidance({ setupEnvResolution, ready: ready === true, status: resultStatus }),
    nextActions: [resolvedNextAction, ...verification.nextActions].filter(Boolean).slice(0, 8),
    nextAction: resolvedNextAction,
    safeguards: {
      nonMutating: true,
      requestBodyIgnored: true,
      envFileReadFromServerProductionSetupOnly: true,
      envFilePathAcceptedFromRequest: false,
      envFilePathExposed: false,
      intakeCsvPathExposed: false,
      rawProductionEnvIntakeVerificationIncluded: false,
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
      productionEnvValuesApplyExecuted: false,
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

function buildServerConfigGuidance({ setupEnvResolution = {}, ready = false, status = "blocked" } = {}) {
  return {
    label: setupEnvResolution.ready === true ? "复用 production env setup 安全 env 文件" : "production env setup 安全 env 文件待就绪",
    status: cleanText(status) || "blocked",
    ready: ready === true,
    envFileSource: "production-env-setup-latest",
    intakeCsvSource: "production-env-setup-real-value-intake-csv",
    primaryInput: "production env setup latest 安全 env 文件",
    acceptsFrontendPath: false,
    pathValueExposed: false,
    restartRequired: false,
    setupReportAvailable: setupEnvResolution.setupReportAvailable === true,
    setupReady: setupEnvResolution.setupReady === true,
    envFileCount: nonNegativeInteger(setupEnvResolution.envFileCount),
    steps: [
      "先用 production env setup 生成安全未跟踪、0600 权限的生产 env 文件和真实值 intake CSV。",
      "把真实 PostgreSQL、对象存储、打印、readiness 变量填入安全 env 文件，或先用真实值片段 dry-run / 正式合并。",
      "点击重新校验真实值，系统只复用服务端 setup 安全 env 文件和固定 intake CSV，不接收浏览器路径或 env 值。",
      "本入口只读校验，不写 env 文件、不运行迁移、不刷新 release candidate / go-live suite。",
    ],
    verificationActions: [
      "node scripts/run-v1-production-env-intake-verify.mjs --env-file <secure-env-file> --intake-csv <production-env-intake-csv> --json",
      "POST /api/system/v1-production-env-intake/live-precheck",
    ],
    safeguards: {
      frontendPathAccepted: false,
      envFilePathValueIncluded: false,
      intakeCsvPathValueIncluded: false,
      sourceNamesOnly: true,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      productionEnvFileMutated: false,
      schemaMigrationApplyExecuted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function blockedResolution({ status, setupReportAvailable, key, label, detail, nextAction }) {
  return {
    status,
    ready: false,
    setupReportAvailable,
    setupReady: false,
    envFileCount: 0,
    envFiles: [],
    blockingItems: [blocker({ key, label, detail, nextAction })],
    nextAction,
  };
}

function blocker({ key, label, detail, nextAction }) {
  return { key, label, status: "blocked", detail, nextAction };
}

function sanitizeBlockingItem(value = {}) {
  const label = sanitizeV1RoleTaskActionText(value.label);
  const key = cleanText(value.key);
  if (!label && !key) return null;
  return {
    key,
    label: label || key,
    status: cleanText(value.status) || "blocked",
    detail: sanitizeV1RoleTaskActionText(value.detail),
    nextAction: sanitizeV1RoleTaskActionText(value.nextAction),
  };
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}
