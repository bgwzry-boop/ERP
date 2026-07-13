import { buildProductionEnvPreflight } from "../../scripts/run-v1-production-env-preflight.mjs";
import { sanitizeV1ProductionEnvGate } from "./v1ProductionStatusProjectionService.mjs";

export function precheckV1ProductionEnv({
  operatorId,
  env = process.env,
  now = () => new Date(),
  buildPreflight = buildProductionEnvPreflight,
  sanitizeGate = sanitizeV1ProductionEnvGate,
} = {}) {
  const checkedAt = now().toISOString();
  try {
    const envPreflight = buildPreflight({ env, envFiles: [] });
    const productionEnvGate = sanitizeGate(envPreflight, {}, envPreflight.fixChecklist);
    const blockingChecks = productionEnvGate.checks.filter((item) => item.severity === "blocking" && !item.ready);
    const warningChecks = productionEnvGate.checks.filter((item) => item.severity === "warning" && !item.ready);
    const ready = productionEnvGate.ready === true && blockingChecks.length === 0;
    return {
      httpStatus: 200,
      body: {
        version: "p0-v1-production-env-live-precheck-v1",
        scope: "v1_production_env_live_precheck",
        status: ready ? "ready" : "blocked",
        ready,
        checkedAt: productionEnvGate.checkedAt || envPreflight.checkedAt || checkedAt,
        operatorId,
        summary: {
          label: ready ? "当前运行环境已通过生产 env 预检" : "当前运行环境仍未通过生产 env 预检",
          readinessLabel: productionEnvGate.summary.readinessLabel || "0/10",
          passedCount: productionEnvGate.summary.passedCount,
          totalCount: productionEnvGate.summary.totalCount,
          blockingCount: productionEnvGate.summary.blockingCount,
          warningCount: productionEnvGate.summary.warningCount,
          placeholderValueCount: productionEnvGate.summary.placeholderValueCount,
          envFileCount: 0,
          currentRuntime: true,
          envFilePathAccepted: false,
          releaseCandidateRefreshed: false,
          goLiveSuiteRefreshed: false,
          blockerCount: blockingChecks.length,
          warningCheckCount: warningChecks.length,
        },
        checks: productionEnvGate.checks,
        blockingChecks,
        warningChecks,
        nextActions: productionEnvGate.nextActions,
        nextAction: ready
          ? "当前 API 进程 env 已满足 V1 生产预检；仍需结合 env 文件审计、现场证据、签字和 release candidate 复核。"
          : productionEnvGate.nextAction,
        safeguards: buildSafeguards(productionEnvGate.safeguards),
      },
    };
  } catch {
    return {
      httpStatus: 500,
      body: buildErrorBody({ checkedAt, operatorId }),
    };
  }
}

function buildSafeguards(safeguards = {}) {
  return {
    ...safeguards,
    nonMutating: true,
    liveProcessEnvChecked: true,
    requestBodyIgnored: true,
    envFilePathAccepted: false,
    envFileReadByRequest: false,
    rawProductionEnvPreflightIncluded: false,
    rawEnvFileAuditIncluded: false,
    rawEnvFileIncluded: false,
    environmentValuesIncluded: false,
    envValuesIncluded: false,
    commandValuesIncluded: false,
    secretValuesIncluded: false,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
  };
}

function buildErrorBody({ checkedAt, operatorId }) {
  return {
    version: "p0-v1-production-env-live-precheck-v1",
    scope: "v1_production_env_live_precheck",
    status: "error",
    ready: false,
    checkedAt,
    operatorId,
    error: {
      code: "V1_PRODUCTION_ENV_LIVE_PRECHECK_FAILED",
      message: "当前运行环境生产 env 预检失败。",
    },
    summary: {
      label: "当前运行环境生产 env 预检失败",
      readinessLabel: "0/10",
      passedCount: 0,
      totalCount: 0,
      blockingCount: 0,
      warningCount: 0,
      envFileCount: 0,
      currentRuntime: true,
      envFilePathAccepted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    checks: [],
    blockingChecks: [],
    warningChecks: [],
    nextActions: [],
    nextAction: "检查 API 进程环境变量和预检脚本是否可用后重试。",
    safeguards: buildSafeguards(),
  };
}
