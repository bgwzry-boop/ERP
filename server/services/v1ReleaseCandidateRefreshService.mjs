import { sanitizeV1ProductionEnvFileConfigSourceStatuses } from "./v1ProductionEnvFileAuditService.mjs";
import {
  sanitizeV1RoleTaskActionText,
  sanitizeV1SensitiveStatusText,
} from "./v1StatusTextSanitizer.mjs";

export function createV1ReleaseCandidateRefreshService({
  precheckRefresh,
  getArtifactRoot,
  resolveApiBaseUrl,
  runRefreshCommand,
  getConfiguredEnvFiles,
  env = process.env,
  now = () => new Date(),
} = {}) {
  requireFunction(precheckRefresh, "precheckRefresh");
  requireFunction(getArtifactRoot, "getArtifactRoot");
  requireFunction(resolveApiBaseUrl, "resolveApiBaseUrl");
  requireFunction(runRefreshCommand, "runRefreshCommand");
  requireFunction(getConfiguredEnvFiles, "getConfiguredEnvFiles");

  return {
    async refresh({ request, operatorId } = {}) {
      const checkedAt = now().toISOString();
      const precheckResult = await precheckRefresh({ request, operatorId });
      const precheck = isPlainObject(precheckResult?.body) ? precheckResult.body : {};
      const envFiles = normalizeEnvFiles(getConfiguredEnvFiles());
      if (precheck.ready !== true) {
        return {
          httpStatus: 409,
          body: buildBlockedBody({ checkedAt, operatorId, precheck, envFileCount: envFiles.length }),
        };
      }

      try {
        const result = await runRefreshCommand({
          artifactRoot: getArtifactRoot(),
          apiBaseUrl: resolveApiBaseUrl({
            request,
            configuredApiBaseUrl: env.ERP_V1_RELEASE_API_BASE_URL,
          }),
          operatorId,
          driverOperatorId: resolveDriverOperatorId(env),
          envFiles,
        });
        return {
          httpStatus: 200,
          body: buildSuccessBody({ checkedAt, operatorId, commandResult: result, envFileCount: envFiles.length }),
        };
      } catch {
        return {
          httpStatus: 500,
          body: buildErrorBody({ checkedAt, operatorId, envFileCount: envFiles.length }),
        };
      }
    },
  };
}

function buildBlockedBody({ checkedAt, operatorId, precheck = {}, envFileCount = 0 }) {
  const summary = isPlainObject(precheck.summary) ? precheck.summary : {};
  const blockers = Array.isArray(precheck.blockers)
    ? precheck.blockers.slice(0, 8).map(sanitizeBlocker).filter(Boolean)
    : [];
  return {
    version: "p0-v1-release-candidate-refresh-v1",
    scope: "v1_release_candidate_refresh",
    status: "blocked_by_precheck",
    ready: false,
    checkedAt,
    operatorId,
    summary: {
      label: "未满足刷新 release candidate 条件",
      precheckStatus: cleanStatus(precheck.status) || "blocked",
      evidenceProgress: cleanProgress(summary.evidenceProgress, "0/40"),
      signoffProgress: cleanProgress(summary.signoffProgress, "0/6"),
      productionEnvPreflightLabel: cleanProgress(summary.productionEnvPreflightLabel, "0/10"),
      productionGoLiveReadinessLabel: cleanProgress(summary.productionGoLiveReadinessLabel, "0/5"),
      productionGoLiveBlockingCount: nonNegativeInteger(summary.productionGoLiveBlockingCount),
      productionGoLiveFirstBlockedStageKey: cleanKey(summary.productionGoLiveFirstBlockedStageKey),
      productionGoLiveFirstBlockedStageLabel: sanitizeText(summary.productionGoLiveFirstBlockedStageLabel),
      productionGoLiveSourceStatuses: sanitizeV1ProductionEnvFileConfigSourceStatuses({
        sources: summary.productionGoLiveSourceStatuses,
      }),
      productionGoLiveReady: summary.productionGoLiveReady === true,
      boundaryLabel: sanitizeText(summary.boundaryLabel) || "待确认",
      blockerCount: nonNegativeInteger(summary.blockerCount, blockers.length),
      blockerShownCount: blockers.length,
      releaseCandidateRefreshAllowed: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    blockers,
    nextAction: "先按预检阻塞项补齐生产 env、现场证据、负责人签字和 V1/V2 边界，再刷新 release candidate / go-live suite。",
    safeguards: buildSafeguards({ precheckReady: false, envFileCount }),
  };
}

function buildSuccessBody({ checkedAt, operatorId, commandResult = {}, envFileCount = 0 }) {
  const summary = isPlainObject(commandResult.summary) ? commandResult.summary : {};
  const ready = commandResult.ready === true;
  return {
    version: "p0-v1-release-candidate-refresh-v1",
    scope: "v1_release_candidate_refresh",
    status: ready ? "ready_after_refresh" : "blocked_after_refresh",
    ready,
    checkedAt: cleanTimestamp(commandResult.generatedAt || commandResult.checkedAt) || checkedAt,
    operatorId,
    summary: {
      label: ready
        ? "release candidate / go-live suite 已刷新且门禁通过"
        : "release candidate / go-live suite 已刷新但仍阻塞",
      precheckStatus: "ready_to_refresh",
      releaseGateLabel: sanitizeText(summary.releaseCandidate),
      ownerDecision: sanitizeText(summary.ownerDecision),
      p0Prototype: sanitizeText(summary.p0Prototype),
      v1Readiness: sanitizeText(summary.v1Readiness),
      fieldEvidenceLabel: sanitizeText(summary.fieldEvidence),
      onsiteTaskCount: nonNegativeInteger(summary.onsiteTasks),
      v2DifferenceCount: nonNegativeInteger(summary.v2DifferenceCount),
      releaseCandidateRefreshAllowed: true,
      releaseCandidateRefreshed: true,
      goLiveSuiteRefreshed: true,
    },
    blockers: [],
    nextAction: ready
      ? "刷新完成；负责人仍需复核 release candidate、现场证据和签字记录后再宣布 V1 完成。"
      : "刷新完成但仍有上线阻塞；按最新 go-live suite 的阻塞清单继续处理。",
    safeguards: buildSafeguards({
      precheckReady: true,
      releaseCandidateRefreshed: true,
      goLiveSuiteRefreshed: true,
      envFileCount,
    }),
  };
}

function buildErrorBody({ checkedAt, operatorId, envFileCount = 0 }) {
  return {
    version: "p0-v1-release-candidate-refresh-v1",
    scope: "v1_release_candidate_refresh",
    status: "refresh_failed",
    ready: false,
    checkedAt,
    operatorId,
    error: {
      code: "V1_RELEASE_CANDIDATE_REFRESH_FAILED",
      message: "刷新 release candidate / go-live suite 失败，命令输出已脱敏且未返回前端。",
    },
    summary: {
      label: "刷新 release candidate 失败",
      precheckStatus: "ready_to_refresh",
      releaseCandidateRefreshAllowed: true,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    blockers: [],
    nextAction: "由技术/管理在服务器日志中复核刷新命令失败原因，确认安全 env 文件、API 地址和现场证据草稿后再重试。",
    safeguards: buildSafeguards({ precheckReady: true, envFileCount }),
  };
}

function buildSafeguards({
  precheckReady = false,
  releaseCandidateRefreshed = false,
  goLiveSuiteRefreshed = false,
  envFileCount = 0,
} = {}) {
  return {
    requestBodyIgnored: true,
    precheckRequired: true,
    precheckReady: Boolean(precheckReady),
    serverConfiguredEnvFileCount: nonNegativeInteger(envFileCount),
    frontendEnvFilePathAccepted: false,
    frontendTokenAccepted: false,
    commandArgsAcceptedFromRequest: false,
    sourceManifestMutated: false,
    draftManifestMutated: false,
    releaseCandidateRefreshed: Boolean(releaseCandidateRefreshed),
    goLiveSuiteRefreshed: Boolean(goLiveSuiteRefreshed),
    rawCommandStdoutIncluded: false,
    rawCommandStderrIncluded: false,
    rawEvidenceRefsIncluded: false,
    rawSignersIncluded: false,
    rawNotesIncluded: false,
    rawFieldEvidenceDraftManifestIncluded: false,
    rawProductionGoLivePrecheckIncluded: false,
    rawProductionEnvPreflightIncluded: false,
    rawEnvFileAuditIncluded: false,
    artifactPathExposed: false,
    localPathExposed: false,
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
    rawSecretsIncluded: false,
  };
}

function sanitizeBlocker(value = {}) {
  if (!isPlainObject(value)) return null;
  const key = cleanKey(value.key);
  const label = sanitizeText(value.label);
  if (!key && !label) return null;
  return {
    key,
    label: label || key,
    status: cleanStatus(value.status) || "blocked",
    blocking: value.blocking !== false,
    detail: sanitizeText(value.detail),
    nextAction: sanitizeText(value.nextAction),
  };
}

function resolveDriverOperatorId(env = {}) {
  return [
    env.ERP_V1_RELEASE_DRIVER_OPERATOR_ID,
    env.ERP_V1_FIELD_ACCEPTANCE_DRIVER_OPERATOR_ID,
    env.ERP_V1_READINESS_DRIVER_OPERATOR_ID,
    "U-DRIVER-A",
  ].map(cleanText).find(Boolean);
}

function normalizeEnvFiles(values) {
  return Array.isArray(values) ? values.filter((value) => typeof value === "string" && value.trim()) : [];
}

function sanitizeText(value) {
  return sanitizeV1SensitiveStatusText(sanitizeV1RoleTaskActionText(value));
}

function cleanProgress(value, fallback) {
  const text = cleanText(value);
  return /^\d+\s*\/\s*\d+$/.test(text) ? text.replace(/\s/g, "") : fallback;
}

function cleanTimestamp(value) {
  const text = cleanText(value);
  return Number.isFinite(Date.parse(text)) ? text : "";
}

function cleanKey(value) {
  const text = cleanText(value);
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(text) ? text : "";
}

function cleanStatus(value) {
  const text = cleanText(value);
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(text) ? text : "";
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
