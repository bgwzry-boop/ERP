import {
  buildV1ReadinessReport,
  readV1ReadinessSources,
} from "../../scripts/run-v1-readiness-check.mjs";
import {
  authenticateV1ReadinessRole,
  buildV1ReadinessAuthInput,
} from "../../scripts/v1ReadinessRuntimeAuth.mjs";
import { resolveLoopbackV1ApiBaseUrl } from "./v1ApiTargetPolicy.mjs";
import { sanitizeV1LivePrecheckCriterion } from "./v1StorageLivePrecheckService.mjs";

export async function precheckV1RuntimeReadiness({
  request,
  operatorId,
  env = process.env,
  now = () => new Date(),
  fetchImpl = globalThis.fetch,
  authenticateRole = authenticateV1ReadinessRole,
  buildAuthInput = buildV1ReadinessAuthInput,
  readSources = readV1ReadinessSources,
  buildReport = buildV1ReadinessReport,
} = {}) {
  const checkedAt = now().toISOString();
  try {
    const report = await buildCurrentV1RuntimeReadinessReport({
      request,
      operatorId,
      env,
      fetchImpl,
      authenticateRole,
      buildAuthInput,
      readSources,
      buildReport,
    });
    return {
      httpStatus: 200,
      body: projectV1RuntimeReadinessLivePrecheck(report, {
        checkedAt,
        operatorId,
        driverOperatorId: report.driverOperatorId,
      }),
    };
  } catch {
    return {
      httpStatus: 500,
      body: buildRuntimeReadinessError({ checkedAt, operatorId }),
    };
  }
}

export async function buildCurrentV1RuntimeReadinessReport({
  request,
  operatorId,
  env = process.env,
  fetchImpl = globalThis.fetch,
  authenticateRole = authenticateV1ReadinessRole,
  buildAuthInput = buildV1ReadinessAuthInput,
  readSources = readV1ReadinessSources,
  buildReport = buildV1ReadinessReport,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required for runtime readiness.");
  const apiBaseUrl = resolveCurrentV1RuntimeApiBaseUrl(request);
  const healthResponse = await fetchImpl(`${apiBaseUrl}/health`, {
    headers: { connection: "close" },
  });
  if (!healthResponse?.ok) {
    throw new Error(`Current API health returned HTTP ${healthResponse?.status ?? 0}.`);
  }
  const health = await healthResponse.json();
  const driverOperatorId = text(env?.ERP_V1_READINESS_DRIVER_OPERATOR_ID) || "U-DRIVER-A";
  const operatorAuth = await authenticateRole({
    apiBaseUrl,
    health,
    fetchImpl,
    authInput: buildAuthInput({
      role: "operator",
      env,
      overrides: {
        operatorId,
        bearerToken: readBearerToken(request) || env?.ERP_V1_READINESS_TOKEN,
      },
    }),
  });
  const driverAuth = await authenticateRole({
    apiBaseUrl,
    health,
    fetchImpl,
    authInput: buildAuthInput({ role: "driver", env }),
  });
  const responses = await readSources({
    apiBaseUrl,
    health,
    headers: operatorAuth.headers,
    driverHeaders: driverAuth.headers,
  });
  responses.authentication = buildAuthenticationSummary({ operatorAuth, driverAuth });
  const report = buildReport({
    apiBaseUrl,
    operatorId,
    driverOperatorId,
    responses,
  });
  return { ...report, driverOperatorId };
}

export function resolveCurrentV1RuntimeApiBaseUrl(request, { fallbackPort = 8787 } = {}) {
  return resolveLoopbackV1ApiBaseUrl(request, { fallbackPort });
}

function buildAuthenticationSummary({ operatorAuth, driverAuth }) {
  return {
    operator: sanitizeAuthentication(operatorAuth),
    driver: sanitizeAuthentication(driverAuth),
  };
}

function sanitizeAuthentication(value = {}) {
  return {
    source: text(value.source),
    operatorId: text(value.operatorId),
    formalRuntimeSession: value.formalRuntimeSession === true,
    legacyIdentityHeaderUsed: value.legacyIdentityHeaderUsed === true,
    production: value.production === true,
  };
}

function projectV1RuntimeReadinessLivePrecheck(
  report = {},
  { checkedAt, operatorId, driverOperatorId } = {},
) {
  const criteria = Array.isArray(report.criteria) ? report.criteria.map(sanitizeV1LivePrecheckCriterion) : [];
  const blockingCriteria = criteria.filter((item) => item.blocking && !item.ready);
  const passedCount = nonNegativeInteger(report.summary?.passedCount || criteria.filter((item) => item.ready).length);
  const totalCount = nonNegativeInteger(report.summary?.totalCount || criteria.length);
  const blockingCount = nonNegativeInteger(report.summary?.blockingCount || blockingCriteria.length);
  const ready = report.ready === true && blockingCount === 0;
  const readinessLabel = totalCount ? `${passedCount}/${totalCount}` : text(report.summary?.label || "0/11");
  const nextActions = stringList(report.nextActions).slice(0, 5);
  return {
    version: "p0-v1-runtime-readiness-live-precheck-v1",
    scope: "v1_runtime_readiness_live_precheck",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: text(report.checkedAt) || checkedAt || new Date().toISOString(),
    operatorId,
    driverOperatorId: text(driverOperatorId),
    summary: {
      label: ready ? "当前运行时 V1 总门禁已通过" : "当前运行时 V1 总门禁仍未通过",
      readinessLabel,
      passedCount,
      totalCount,
      blockingCount,
      blockerCount: blockingCriteria.length,
      passedLabel: readinessLabel,
      blockerLabel: `${blockingCriteria.length} 项`,
      currentRuntime: true,
      requestBodyIgnored: true,
      apiBaseUrlAccepted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: Boolean(report.safeguards?.physicalPrinterCalled),
      nonPrinting: report.safeguards?.nonPrinting !== false,
      driverStatusChanged: Boolean(report.safeguards?.driverDeliveryStatusChanged),
    },
    criteria,
    blockingCriteria,
    nextActions,
    nextAction: ready
      ? "当前 API 运行时总门禁已通过；仍需结合现场证据、签字、V1/V2 边界和 release candidate 复核。"
      : nextActions[0] || "先处理当前运行时总门禁阻塞，再重新跑 release candidate。",
    safeguards: buildRuntimeReadinessSafeguards(report),
  };
}

function buildRuntimeReadinessSafeguards(report) {
  const safeguards = objectOrEmpty(report?.safeguards);
  return {
    nonMutating: true,
    liveApiReadback: true,
    requestBodyIgnored: true,
    apiBaseUrlAccepted: false,
    requestHostAccepted: false,
    forwardedProtocolAccepted: false,
    loopbackTargetOnly: true,
    bearerTokenAccepted: false,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawRuntimeReadinessReportIncluded: false,
    rawReadinessSourcesIncluded: false,
    rawPermissionsIncluded: false,
    apiBaseUrlExposed: false,
    environmentValuesIncluded: false,
    envValuesIncluded: false,
    commandValuesIncluded: Boolean(safeguards.commandValueExposed),
    commandArgsIncluded: Boolean(safeguards.commandArgsExposed),
    secretValuesIncluded: Boolean(safeguards.secretFieldsExposed),
    payloadIncluded: Boolean(
      safeguards.payloadExposed || safeguards.attachmentPayloadExposed || safeguards.driverPayloadExposed,
    ),
    spoolPathExposed: Boolean(safeguards.spoolPathExposed),
    localPathExposed: Boolean(safeguards.systemLocalPathExposed),
    physicalPrinterCalled: Boolean(safeguards.physicalPrinterCalled),
    printFileCreated: Boolean(safeguards.printFileCreated),
    driverDeliveryStatusChanged: Boolean(safeguards.driverDeliveryStatusChanged),
    nonPrinting: safeguards.nonPrinting !== false,
    attachmentReadOnly: safeguards.attachmentReadOnly !== false,
    driverReadOnly: safeguards.driverReadOnly !== false,
    systemReadOnly: safeguards.systemReadOnly !== false,
  };
}

function buildRuntimeReadinessError({ checkedAt, operatorId }) {
  return {
    version: "p0-v1-runtime-readiness-live-precheck-v1",
    scope: "v1_runtime_readiness_live_precheck",
    status: "error",
    ready: false,
    checkedAt,
    operatorId,
    summary: {
      label: "当前运行时 V1 总门禁预检失败",
      readinessLabel: "0/11",
      passedCount: 0,
      totalCount: 0,
      blockingCount: 0,
      blockerCount: 0,
      currentRuntime: true,
      requestBodyIgnored: true,
      apiBaseUrlAccepted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    criteria: [],
    blockingCriteria: [],
    nextActions: [],
    nextAction: "检查当前 API 是否可访问、权限账号是否存在，以及 readiness 端点是否能正常返回。",
    error: {
      code: "V1_RUNTIME_READINESS_LIVE_PRECHECK_FAILED",
      message: "当前运行时 V1 总门禁预检失败。",
    },
    safeguards: buildRuntimeReadinessSafeguards(null),
  };
}

function readBearerToken(request) {
  const authorization = text(request?.headers?.authorization);
  if (!authorization.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice(7).trim();
}

function objectOrEmpty(value) {
  return value && typeof value === "object" ? value : {};
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

function stringList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return raw.map(text).filter(Boolean);
}

function text(value) {
  return String(value ?? "").trim();
}
