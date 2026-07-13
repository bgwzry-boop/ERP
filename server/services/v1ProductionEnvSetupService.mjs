import {
  sanitizeV1ProductionEnvSetupFinding,
  sanitizeV1ProductionEnvSetupReport,
} from "./v1ProductionStatusProjectionService.mjs";

export async function runV1ProductionEnvSetup({
  operatorId,
  runCommand,
  now = () => new Date(),
} = {}) {
  const checkedAt = now().toISOString();
  try {
    if (typeof runCommand !== "function") throw new Error("Production env setup command is required.");
    const report = await runCommand();
    const setup = sanitizeV1ProductionEnvSetupReport(report);
    const ready = setup.ready === true;
    return {
      httpStatus: 200,
      body: buildLiveRunBody({
        operatorId,
        checkedAt,
        status: setup.status || (ready ? "ready" : setup.setupReady ? "prepared" : "blocked"),
        ready,
        report,
        nextAction:
          setup.nextActions[0] ||
          (ready
            ? "生产 env 安全草稿已通过变量预检；下一步用该 env 启动生产 API 并执行第一阶段。"
            : setup.setupReady
              ? "安全 env 草稿已准备；继续按最小真实值片段补齐 PostgreSQL、对象存储、打印和现场证据变量。"
              : "按 setup 阻塞项修正目标安全 env 文件路径、git ignore 或权限后重试。"),
      }),
    };
  } catch {
    return {
      httpStatus: 200,
      body: buildLiveRunBody({
        operatorId,
        checkedAt,
        status: "error",
        ready: false,
        report: {},
        setupFindings: [
          {
            key: "production-env-setup-command-failed",
            label: "生产 env setup 执行失败",
            status: "error",
            detail: "服务端执行 production env setup 失败，可能是模板、目标目录、文件权限或脚本环境异常。",
            nextAction: "由技术/管理检查服务器日志和 setup 目标目录；不要把真实 env 路径或值传给前端。",
          },
        ],
        nextAction: "检查 production env setup 命令环境后重试。",
        error: {
          code: "V1_PRODUCTION_ENV_SETUP_LIVE_RUN_FAILED",
          message: "生产 env 安全草稿 setup 失败，命令输出已脱敏且未返回前端。",
        },
      }),
    };
  }
}

function buildLiveRunBody({
  operatorId,
  checkedAt,
  status,
  ready,
  report = {},
  setupFindings = [],
  nextAction = "",
  error = null,
} = {}) {
  const setup = sanitizeV1ProductionEnvSetupReport(report);
  const sanitizedSetupFindings = Array.isArray(setupFindings) && setupFindings.length
    ? setupFindings.map(sanitizeV1ProductionEnvSetupFinding).filter(Boolean)
    : setup.setupFindings;
  const resultStatus =
    cleanText(status) ||
    (ready === true
      ? "ready"
      : setup.available
        ? setup.status || (setup.setupReady ? "prepared" : "blocked")
        : "error");
  const setupReady = setup.setupReady === true;
  const envPreflightReady = setup.envPreflight.ready === true;
  const remainingFixItems = Array.isArray(setup.envPreflight.remainingFixItems)
    ? setup.envPreflight.remainingFixItems
    : [];
  const blockingCount = sanitizedSetupFindings.length + nonNegativeInteger(setup.summary.setupBlockingCount);
  const label =
    ready === true
      ? "生产 env 安全草稿已通过"
      : resultStatus === "error"
        ? "生产 env 安全草稿 setup 失败"
        : setupReady
          ? "生产 env 安全草稿已准备"
          : "生产 env 安全草稿仍有阻塞";
  const resolvedNextAction =
    cleanText(nextAction) ||
    setup.nextActions[0] ||
    (ready === true
      ? "用该安全 env 文件启动生产 API，并继续执行生产环境 / 持久化第一阶段。"
      : setupReady
        ? "按最小真实值片段补齐 PostgreSQL、对象存储、打印桥、CUPS 和验收账号真实值后重跑校验。"
        : "修正 production env setup 目标安全 env 文件、git ignore、权限或模板后重试。");
  const body = {
    version: "p0-v1-production-env-setup-live-run-v1",
    scope: "v1_production_env_setup_live_run",
    status: resultStatus,
    ready: ready === true,
    checkedAt: setup.checkedAt || checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label,
      setupLabel: setup.summary.label,
      setupStatus: setup.status,
      setupReady,
      productionReady: ready === true,
      generated: setup.summary.generated === true,
      imported: setup.summary.imported === true,
      overwritten: setup.summary.overwritten === true,
      targetExistedBefore: setup.summary.targetExistedBefore === true,
      auditReady: setup.audit.ready === true,
      auditStatus: setup.audit.status,
      envPreflightReady,
      envPreflightStatus: setup.envPreflight.status,
      envPreflightLabel: setup.envPreflight.readinessLabel,
      envPreflightPassedCount: setup.envPreflight.passedCount,
      envPreflightTotalCount: setup.envPreflight.totalCount,
      envPreflightBlockingCount: setup.envPreflight.blockingCount,
      envPreflightWarningCount: setup.envPreflight.warningCount,
      remainingFixItemCount: remainingFixItems.length || setup.summary.remainingFixItemCount,
      blockingCount,
      blockerLabel: `${blockingCount} 项`,
      requestBodyIgnored: true,
      frontendTargetPathAccepted: false,
      frontendImportPathAccepted: false,
      frontendEnvValuesAccepted: false,
      targetEnvFilePathExposed: false,
      targetEnvFileConfigured: setup.envFile.assignmentCount > 0 || setup.envFile.existedBefore === true,
      targetEnvFileWritten: setup.summary.generated === true || setup.summary.imported === true || setup.summary.overwritten === true,
      targetEnvFileOverwritten: setup.summary.overwritten === true,
      targetEnvDraftMayBeCreated: true,
      productionEnvRealValuesWritten: false,
      setupReportRefreshed: setup.available === true,
      productionEnvValuesApplyExecuted: false,
      businessDataMutated: false,
      schemaMigrationApplyExecuted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
    },
    setup,
    setupFindings: sanitizedSetupFindings,
    remainingFixItems,
    serverConfigGuidance: buildServerConfigGuidance({
      setup,
      status: resultStatus,
      ready: ready === true,
    }),
    nextActions: [resolvedNextAction, ...setup.nextActions].filter(Boolean).slice(0, 8),
    nextAction: resolvedNextAction,
    safeguards: {
      requestBodyIgnored: true,
      frontendTargetPathAccepted: false,
      frontendImportPathAccepted: false,
      frontendEnvValuesAccepted: false,
      forceOverwriteEnabled: false,
      importFromEnabled: false,
      targetEnvFilePathExposed: false,
      envValuesIncluded: false,
      environmentValuesIncluded: false,
      connectionStringExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      spoolPathExposed: false,
      rawTemplateValuesCopied: false,
      importedEnvValuesExposed: false,
      productionEnvRealValuesWritten: false,
      targetEnvDraftMayBeCreated: true,
      targetEnvFileOverwritten: setup.summary.overwritten === true,
      setupReportRefreshed: setup.available === true,
      productionEnvFilePathIncluded: false,
      productionEnvValuesApplyExecuted: false,
      schemaMigrationApplyExecuted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
      businessDataMutated: false,
      declaresFullV1Complete: false,
    },
  };
  return error ? { ...body, error } : body;
}

function buildServerConfigGuidance({ setup = {}, status = "blocked", ready = false } = {}) {
  return {
    label: "生产 env setup 受控入口",
    status: cleanText(status) || "blocked",
    ready: ready === true,
    setupReady: setup.setupReady === true,
    targetSource: "server-default",
    templateSource: "checked-in v1-production.env.example",
    primaryInput: "server-default production env setup",
    acceptsFrontendTargetPath: false,
    acceptsFrontendImportPath: false,
    acceptsFrontendEnvValues: false,
    targetEnvFilePathExposed: false,
    forceOverwriteEnabled: false,
    importFromEnabled: false,
    setupReportRefreshed: setup.available === true,
    steps: [
      "点击后由服务端按默认模板生成或复核安全生产 env 草稿。",
      "入口不接受浏览器传入目标路径、导入路径或真实 env 值。",
      "入口不使用 --force，不覆盖已有安全 env 文件；已有文件只复核安全状态和变量预检。",
      "补齐真实值仍要在服务器安全 env 文件或安全片段中完成，再跑真实值 dry-run 和正式合并。",
    ],
    verificationActions: [
      "node scripts/run-v1-production-env-setup.mjs --json",
      "POST /api/system/v1-production-env-setup/live-run",
    ],
    safeguards: {
      frontendTargetPathAccepted: false,
      frontendImportPathAccepted: false,
      frontendEnvValuesAccepted: false,
      targetEnvFilePathExposed: false,
      forceOverwriteEnabled: false,
      importFromEnabled: false,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      productionEnvValuesApplyExecuted: false,
      schemaMigrationApplyExecuted: false,
      businessDataMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}
