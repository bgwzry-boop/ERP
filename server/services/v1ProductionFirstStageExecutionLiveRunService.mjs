import { sanitizeV1ProductionFirstStageExecution } from "./v1ProductionStatusProjectionService.mjs";

export function createV1ProductionFirstStageExecutionLiveRunService({
  runCommand,
  resolveApiBaseUrl,
  sanitizeExecution = sanitizeV1ProductionFirstStageExecution,
  sanitizeBlockingItem,
  now = () => new Date(),
} = {}) {
  requireFunction(runCommand, "runCommand");
  requireFunction(resolveApiBaseUrl, "resolveApiBaseUrl");
  requireFunction(sanitizeExecution, "sanitizeExecution");
  requireFunction(sanitizeBlockingItem, "sanitizeBlockingItem");
  requireFunction(now, "now");

  return { buildResponseBody, run };

  async function run({ request, operatorId = "" } = {}) {
    const checkedAt = currentTimestamp();
    try {
      const apiBaseUrl = resolveApiBaseUrl({ request });
      const report = await runCommand({ apiBaseUrl });
      const firstStageExecution = sanitizeExecution(report);
      const ready = firstStageExecution.ready === true;
      return {
        httpStatus: 200,
        body: buildResponseBody({
          operatorId,
          checkedAt,
          status: firstStageExecution.status || (ready ? "ready" : "blocked"),
          ready,
          report,
          nextAction:
            firstStageExecution.nextActions[0] ||
            (ready
              ? "第一阶段执行已通过；继续按 go-live suite 补现场证据、打印、司机真机和真实订单试跑。"
              : "按第一阶段阻塞项补齐真实 PostgreSQL、对象存储、生产 env 或现场证据后重试。"),
        }),
      };
    } catch {
      return {
        httpStatus: 200,
        body: buildResponseBody({
          operatorId,
          checkedAt,
          status: "error",
          ready: false,
          report: {},
          blockingItems: [
            {
              key: "production-first-stage-execution-command-failed",
              label: "第一阶段执行失败",
              status: "error",
              detail: "服务端执行第一阶段执行器失败，可能是 production env setup latest、安全 env 文件、脚本权限或本地 API 状态异常。",
              nextAction: "由技术/管理检查服务端 production env setup、安全 env 文件和第一阶段执行器日志后重试；不要把真实路径或 env 值传给前端。",
            },
          ],
          nextAction: "检查服务端 production env setup、安全 env 文件和第一阶段执行器日志后重试。",
          error: {
            code: "V1_PRODUCTION_FIRST_STAGE_EXECUTION_LIVE_RUN_FAILED",
            message: "第一阶段执行失败，命令输出已脱敏且未返回前端。",
          },
        }),
      };
    }
  }

  function buildResponseBody({
    operatorId = "",
    checkedAt = "",
    status = "",
    ready = false,
    report = {},
    blockingItems = [],
    nextAction = "",
    error = null,
  } = {}) {
    const firstStageExecution = sanitizeExecution(report);
    const sanitizedBlockingItems = Array.isArray(blockingItems)
      ? blockingItems.map(sanitizeBlockingItem).filter(Boolean)
      : [];
    const resultStatus = text(status) || (ready === true ? "ready" : firstStageExecution.status || "blocked");
    const blockingCount = sanitizedBlockingItems.length + firstStageExecution.summary.blockingCount;
    const label =
      ready === true
        ? "生产环境 / 持久化第一阶段执行通过"
        : resultStatus === "error"
          ? "生产环境 / 持久化第一阶段执行失败"
          : "生产环境 / 持久化第一阶段仍有阻塞";
    const resolvedNextAction =
      text(nextAction) ||
      firstStageExecution.nextActions[0] ||
      (ready === true
        ? "第一阶段执行已通过；继续补真实打印链路、司机真机、真实订单试跑和现场签字。"
        : "按第一阶段阻塞项补齐真实 PostgreSQL、对象存储、生产 env 或现场证据后重试。");
    const body = {
      version: "p0-v1-production-first-stage-execution-live-run-v1",
      scope: "v1_production_first_stage_execution_live_run",
      status: resultStatus,
      ready: ready === true,
      checkedAt: firstStageExecution.checkedAt || checkedAt || currentTimestamp(),
      operatorId,
      summary: {
        label,
        firstStageLabel: firstStageExecution.summary.label,
        firstStageStatus: firstStageExecution.status,
        passedCount: firstStageExecution.summary.passedCount,
        totalCount: firstStageExecution.summary.totalCount,
        passedLabel: firstStageExecution.summary.passedLabel,
        blockingCount,
        blockerLabel: `${blockingCount} 项`,
        errorCount: firstStageExecution.summary.errorCount,
        errorLabel: firstStageExecution.summary.errorLabel,
        envFileFromProductionSetup: firstStageExecution.execution.envFileFromProductionSetup === true,
        envFileSourceLabel: firstStageExecution.execution.envFileSourceLabel,
        requestBodyIgnored: true,
        envFilePathAccepted: false,
        envFilePathExposed: false,
        productionEnvValuesFileAccepted: false,
        productionEnvValuesApplyExecuted: false,
        productionEnvFileMutated: false,
        applyMigrations: firstStageExecution.execution.applyMigrations === true,
        schemaMigrationApplyExecuted: firstStageExecution.safeguards.schemaMigrationApplyExecuted === true,
        runtimeSmokeUsesCurrentApi: firstStageExecution.execution.runtimeSmokeUsesExistingApi === true,
        runtimeSmokeApiBaseUrlAccepted: false,
        runtimeSmokeApiBaseUrlExposed: false,
        restoreResetExplicitlyAllowed: firstStageExecution.execution.restoreResetExplicitlyAllowed === true,
        businessDataMutated: false,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
        physicalPrinterCalled: false,
        driverDeliveryStatusChanged: false,
      },
      firstStageExecution,
      blockingItems: sanitizedBlockingItems,
      blockingStages: firstStageExecution.blockingStages,
      serverConfigGuidance: buildServerConfigGuidance({ ready: ready === true, status: resultStatus }),
      nextActions: [resolvedNextAction, ...firstStageExecution.nextActions].filter(Boolean).slice(0, 8),
      nextAction: resolvedNextAction,
      safeguards: {
        nonMutating: true,
        requestBodyIgnored: true,
        envFilePathAcceptedFromRequest: false,
        envFileReadFromServerProductionSetupOnly: true,
        envFilePathExposed: false,
        apiBaseUrlAcceptedFromRequest: false,
        apiBaseUrlReadFromCurrentRequest: true,
        apiBaseUrlExposed: false,
        runtimeSmokeUsesCurrentApi: firstStageExecution.execution.runtimeSmokeUsesExistingApi === true,
        productionEnvValuesFileAcceptedFromRequest: false,
        productionEnvValuesFilePathExposed: false,
        productionEnvValuesApplyExecuted: false,
        targetEnvFilePathExposed: false,
        rawCommandIncluded: false,
        rawCommandStdoutIncluded: false,
        rawCommandStderrIncluded: false,
        rawFirstStageExecutionIncluded: false,
        rawEnvFileIncluded: false,
        rawEnvLineIncluded: false,
        envValuesIncluded: false,
        environmentValuesIncluded: false,
        secretValuesIncluded: false,
        connectionStringIncluded: false,
        objectStorageEndpointIncluded: false,
        objectStorageBucketIncluded: false,
        commandValuesIncluded: false,
        spoolPathIncluded: false,
        tokenIncluded: false,
        localPathExposed: false,
        currentApiBaseUrlExposed: false,
        productionEnvFileMutated: false,
        businessDataMutated: false,
        applyMigrations: firstStageExecution.execution.applyMigrations === true,
        schemaMigrationApplyExecuted: firstStageExecution.safeguards.schemaMigrationApplyExecuted === true,
        restoreResetExplicitlyAllowed: firstStageExecution.execution.restoreResetExplicitlyAllowed === true,
        physicalPrinterCalled: false,
        driverDeliveryStatusChanged: false,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
        declaresFullV1Complete: false,
      },
    };
    return error ? { ...body, error } : body;
  }

  function currentTimestamp() {
    const value = now();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new TypeError("production first-stage execution now() must return a valid Date");
    }
    return value.toISOString();
  }
}

function buildServerConfigGuidance({ ready = false, status = "blocked" } = {}) {
  return {
    label: "第一阶段执行使用服务端 production env setup 安全 env 文件",
    status: text(status) || "blocked",
    ready: ready === true,
    envFileSource: "production-env-setup-latest",
    primaryInput: "production env setup latest 安全 env 文件",
    acceptsFrontendPath: false,
    pathValueExposed: false,
    restartRequired: false,
    applyMigrationsByDefault: false,
    restoreResetAllowedByDefault: false,
    productionEnvValuesFileAccepted: false,
    runtimeSmokeApiBaseUrlSource: "current-request",
    runtimeSmokeApiBaseUrlAcceptedFromFrontend: false,
    runtimeSmokeApiBaseUrlExposed: false,
    steps: [
      "先完成真实值 dry-run；负责人确认后再正式合并真实值。",
      "确认 production env setup latest 指向同一份安全、未跟踪、0600 权限的生产 env 文件。",
      "点击执行第一阶段，系统只复用服务端 setup 安全 env 文件，不接受浏览器传路径或 env 值。",
      "runtime smoke 使用当前 API 地址做内部探针，但不会接受或返回浏览器传入的 API 地址。",
      "本入口默认不执行迁移 apply、不允许恢复验证库重置、不刷新 release candidate / go-live suite。",
    ],
    verificationActions: [
      "node scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --json",
      "POST /api/system/v1-production-first-stage-execution/live-run",
    ],
    safeguards: {
      frontendPathAccepted: false,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      productionEnvValuesApplyExecuted: false,
      schemaMigrationApplyExecuted: false,
      restoreResetAllowed: false,
      apiBaseUrlAcceptedFromFrontend: false,
      apiBaseUrlExposed: false,
      businessDataMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}

function text(value) {
  return String(value ?? "").trim();
}
