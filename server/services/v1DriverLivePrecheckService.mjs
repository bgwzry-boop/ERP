import { buildDriverV1Readiness } from "./driverV1ReadinessService.mjs";

export async function precheckV1DriverReadiness({
  workspace,
  operatorId,
  driverOperatorId = "",
  env = process.env,
  now = () => new Date(),
  buildReadiness = buildDriverV1Readiness,
} = {}) {
  const checkedAt = now().toISOString();
  const resolvedDriverOperatorId =
    text(driverOperatorId) || text(env?.ERP_V1_READINESS_DRIVER_OPERATOR_ID) || "U-DRIVER-A";
  try {
    const readiness = await buildReadiness({ workspace, operatorId: resolvedDriverOperatorId });
    return {
      httpStatus: 200,
      body: projectV1DriverReadinessLivePrecheck(readiness, {
        checkedAt,
        operatorId,
        driverOperatorId: resolvedDriverOperatorId,
      }),
    };
  } catch {
    return {
      httpStatus: 500,
      body: buildDriverReadinessError({
        checkedAt,
        operatorId,
        driverOperatorId: resolvedDriverOperatorId,
      }),
    };
  }
}

export function sanitizeV1DriverLivePrecheckCriterion(item = {}) {
  const status = text(item.status) || "pending";
  const ready = status === "passed";
  return {
    key: text(item.key) || "driver-readiness-criterion",
    label: text(item.label) || "司机真机门禁项",
    status,
    statusLabel: ready ? "通过" : "阻塞",
    ready,
    blocking: item.blocking !== false,
    detail: text(item.detail),
  };
}

function projectV1DriverReadinessLivePrecheck(
  readiness = {},
  { checkedAt, operatorId, driverOperatorId } = {},
) {
  const criteria = Array.isArray(readiness.criteria)
    ? readiness.criteria.map(sanitizeV1DriverLivePrecheckCriterion)
    : [];
  const blockingCriteria = criteria.filter((item) => item.blocking && !item.ready);
  const passedCount = nonNegativeInteger(readiness.summary?.passedCount || criteria.filter((item) => item.ready).length);
  const totalCount = nonNegativeInteger(readiness.summary?.totalCount || criteria.length);
  const blockingCount = nonNegativeInteger(readiness.summary?.blockingCount || blockingCriteria.length);
  const ready = readiness.ready === true && blockingCount === 0;
  const latestFieldTestRecord = objectOrNull(readiness.latestFieldTestRecord);
  const latestFieldTestSummary = objectOrNull(readiness.latestFieldTestSummary);
  const nativeDiagnostics = objectOrNull(readiness.nativeBridgeDiagnostics);
  const packageLabelScanSample = objectOrNull(readiness.packageLabelScanSample);
  const deliveryTaskReadiness = objectOrEmpty(readiness.deliveryTaskReadiness);
  const remainingV1Risks = stringList(readiness.remainingV1Risks).slice(0, 7);
  const readinessLabel = totalCount ? `${passedCount}/${totalCount}` : text(readiness.summary?.label || "0/6");
  return {
    version: "p0-v1-driver-readiness-live-precheck-v1",
    scope: "v1_driver_readiness_live_precheck",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: text(readiness.checkedAt) || checkedAt || new Date().toISOString(),
    operatorId,
    driverOperatorId,
    summary: {
      label: ready ? "司机端 V1 真机门禁已通过" : "司机端 V1 真机门禁仍未通过",
      readinessLabel,
      passedCount,
      totalCount,
      blockingCount,
      blockerCount: blockingCriteria.length,
      passedLabel: readinessLabel,
      blockerLabel: `${blockingCriteria.length} 项`,
      currentRuntime: true,
      requestBodyIgnored: true,
      deliveryTaskStatusChanged: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      deliveryTaskCount: nonNegativeInteger(deliveryTaskReadiness.total),
      fieldTestRecordAvailable: Boolean(latestFieldTestRecord),
      fieldTestLabel: text(latestFieldTestSummary?.label) || "未验收",
      nativeSupportedLabel: nativeDiagnostics
        ? `${nonNegativeInteger(nativeDiagnostics.supportedCount)}/${nonNegativeInteger(nativeDiagnostics.total)}`
        : "0/2",
      packageLabelScanMatched:
        packageLabelScanSample?.result === "matched" || packageLabelScanSample?.result === "duplicate",
      packageLabelScanNative: packageLabelScanSample?.method === "native_sdk",
      requiresNativeShell: readiness.safeguards?.requiresNativeShell !== false,
      browserOnlyNotReady: Boolean(readiness.safeguards?.browserOnlyNotReady),
      payloadExposed: Boolean(readiness.safeguards?.payloadExposed),
    },
    criteria,
    blockingCriteria,
    deliveryTaskReadiness: {
      total: nonNegativeInteger(deliveryTaskReadiness.total),
      metrics: {
        pendingCount: nonNegativeInteger(deliveryTaskReadiness.metrics?.pendingCount),
        deliveringCount: nonNegativeInteger(deliveryTaskReadiness.metrics?.deliveringCount),
        completedCount: nonNegativeInteger(deliveryTaskReadiness.metrics?.completedCount),
        exceptionCount: nonNegativeInteger(deliveryTaskReadiness.metrics?.exceptionCount),
      },
      sampleFulfillmentCount: Array.isArray(deliveryTaskReadiness.sampleFulfillmentIds)
        ? deliveryTaskReadiness.sampleFulfillmentIds.length
        : 0,
    },
    latestFieldTest: latestFieldTestRecord
      ? {
          recordId: text(latestFieldTestRecord.recordId),
          fulfillmentId: text(latestFieldTestRecord.fulfillmentId),
          checkedAt: text(latestFieldTestRecord.checkedAt),
          deviceLabel: text(latestFieldTestRecord.deviceLabel),
          summaryLabel: text(latestFieldTestSummary?.label) || "已记录",
        }
      : null,
    nativeBridge: projectNativeBridge(nativeDiagnostics),
    packageLabelScanSample: projectPackageLabelScanSample(packageLabelScanSample),
    remainingV1Risks,
    nextActions: remainingV1Risks.slice(0, 5),
    nextAction: ready
      ? "司机端 V1 真机门禁已通过；仍需结合现场证据、签字、V1/V2 边界和 release candidate 复核。"
      : remainingV1Risks[0] || "用真实司机手机补齐原生扫码、原生导航、现场验收和纸质包裹标签扫码样本后重跑门禁。",
    safeguards: buildDriverReadinessSafeguards(readiness),
  };
}

function projectNativeBridge(nativeDiagnostics) {
  if (!nativeDiagnostics) return null;
  return {
    label: text(nativeDiagnostics.label),
    supportedCount: nonNegativeInteger(nativeDiagnostics.supportedCount),
    total: nonNegativeInteger(nativeDiagnostics.total),
    items: Array.isArray(nativeDiagnostics.items)
      ? nativeDiagnostics.items.slice(0, 2).map((item) => ({
          key: text(item.key),
          label: text(item.label),
          supported: item.supported === true,
          statusLabel: text(item.statusLabel),
          bridgeTypeLabel: text(item.bridgeTypeLabel),
          version: text(item.version),
        }))
      : [],
  };
}

function projectPackageLabelScanSample(sample) {
  if (!sample) return null;
  return {
    sampleId: text(sample.sampleId),
    fulfillmentId: text(sample.fulfillmentId),
    method: text(sample.method),
    methodLabel: text(sample.methodLabel),
    result: text(sample.result),
    resultLabel: text(sample.resultLabel),
    checkedAt: text(sample.checkedAt),
    expectedPackageIdPresent: Boolean(sample.expectedPackageId),
    matchedPackageIdPresent: Boolean(sample.matchedPackageId),
    scanTextPresent: Boolean(sample.scannedText),
  };
}

function buildDriverReadinessSafeguards(readiness) {
  const safeguards = objectOrEmpty(readiness?.safeguards);
  return {
    nonMutating: true,
    currentRuntime: true,
    requestBodyIgnored: true,
    deliveryTaskStatusChanged: Boolean(safeguards.deliveryStatusChanged),
    deliveryRecordCreated: false,
    deliveryRecordUpdated: false,
    cameraPermissionRequested: false,
    navigationAppOpened: false,
    nativeBridgeInvoked: false,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawDriverReadinessIncluded: false,
    rawDeliveryTasksIncluded: false,
    rawFieldTestRecordIncluded: false,
    rawNativePayloadIncluded: false,
    rawScanTextIncluded: false,
    rawPhotoIncluded: false,
    rawLocationIncluded: false,
    requiresNativeShell: safeguards.requiresNativeShell !== false,
    browserOnlyNotReady: Boolean(safeguards.browserOnlyNotReady),
    physicalLabelScanRequired: safeguards.physicalLabelScanRequired !== false,
    navigationAppRequired: safeguards.navigationAppRequired !== false,
    payloadExposed: Boolean(safeguards.payloadExposed),
    secretValuesIncluded: false,
    localPathExposed: false,
  };
}

function buildDriverReadinessError({ checkedAt, operatorId, driverOperatorId }) {
  return {
    version: "p0-v1-driver-readiness-live-precheck-v1",
    scope: "v1_driver_readiness_live_precheck",
    status: "error",
    ready: false,
    checkedAt,
    operatorId,
    driverOperatorId,
    summary: {
      label: "司机端 V1 真机门禁预检失败",
      readinessLabel: "0/6",
      passedCount: 0,
      totalCount: 0,
      blockingCount: 0,
      blockerCount: 0,
      currentRuntime: true,
      requestBodyIgnored: true,
      deliveryTaskStatusChanged: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      requiresNativeShell: true,
      browserOnlyNotReady: true,
      payloadExposed: false,
    },
    criteria: [],
    blockingCriteria: [],
    nextActions: [],
    nextAction: "检查司机验收账号、送货任务读模型和 driver V1 readiness 门禁是否可读。",
    error: {
      code: "V1_DRIVER_READINESS_LIVE_PRECHECK_FAILED",
      message: "司机端 V1 真机门禁预检失败。",
    },
    safeguards: buildDriverReadinessSafeguards(null),
  };
}

function objectOrNull(value) {
  return value && typeof value === "object" ? value : null;
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
