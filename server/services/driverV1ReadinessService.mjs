import { normalizeDriverDeviceFieldTestRecord } from "../driverDeviceFieldTestRepository.mjs";
import {
  DRIVER_DEVICE_FIELD_TEST_ITEMS,
  getDriverDeviceFieldTestSummary,
  normalizeDriverDeviceFieldTestChecks,
  normalizeDriverPackageLabelScanSample,
} from "../../src/services/driverDeviceFieldTestClient.js";
import { normalizeDriverNativeCapabilityDiagnostics } from "../../src/services/driverNativeCapabilityClient.js";

const requiredFieldTestChecks = DRIVER_DEVICE_FIELD_TEST_ITEMS.map((item) => item.key);

export async function buildDriverV1Readiness({
  workspace = {},
  operatorId = "",
  now = () => new Date(),
} = {}) {
  const checkedAt = now().toISOString();
  const deliveryTaskList = await workspace.driverDeliveryTaskReadRepository.listDriverDeliveryTasks({
    workspace,
    query: { page: 1, pageSize: 200 },
    operatorId,
  });
  const deliveryTasks = Array.isArray(deliveryTaskList.items) ? deliveryTaskList.items : [];
  const latestFieldTestRecord = getLatestFieldTestRecord({ workspace, deliveryTasks });
  const fieldTestEvaluation = evaluateDeviceFieldTest(latestFieldTestRecord);
  const nativeDiagnostics = normalizeDriverNativeCapabilityDiagnostics(latestFieldTestRecord?.nativeBridgeDiagnostics);
  const nativePackageScanEvaluation = evaluateNativeCapability({
    diagnostics: nativeDiagnostics,
    key: "native_package_scan",
    label: "原生扫码桥接",
  });
  const nativeNavigationEvaluation = evaluateNativeCapability({
    diagnostics: nativeDiagnostics,
    key: "native_navigation",
    label: "原生导航桥接",
  });
  const packageLabelScanEvaluation = evaluatePackageLabelScanSample(latestFieldTestRecord?.packageLabelScanSample);
  const criteria = [
    criterion({
      key: "driver-delivery-task-read-model",
      label: "司机送货任务读取",
      passed: deliveryTasks.length > 0,
      detail: deliveryTasks.length
        ? `可读取 ${deliveryTasks.length} 条司机送货任务`
        : "未读取到司机送货任务，无法验证装车、导航和送达流程",
      evidence: {
        total: deliveryTaskList.total ?? deliveryTasks.length,
        metrics: deliveryTaskList.metrics ?? {},
        sampleFulfillmentIds: deliveryTasks.slice(0, 5).map((item) => item.fulfillmentId).filter(Boolean),
      },
    }),
    criterion({
      key: "driver-device-field-test-record",
      label: "司机真机现场验收记录",
      passed: Boolean(latestFieldTestRecord),
      detail: latestFieldTestRecord
        ? `最新记录 ${latestFieldTestRecord.recordId} / ${latestFieldTestRecord.checkedAt}`
        : "尚未保存司机手机现场验收记录",
      evidence: {
        latestRecordId: latestFieldTestRecord?.recordId ?? "",
        latestFulfillmentId: latestFieldTestRecord?.fulfillmentId ?? "",
        latestCheckedAt: latestFieldTestRecord?.checkedAt ?? "",
      },
    }),
    criterion({
      key: "driver-device-field-test-checks",
      label: "司机手机 6 项现场检查",
      passed: fieldTestEvaluation.ready,
      detail: fieldTestEvaluation.ready ? "相机、水印拍照、扫码、定位、上传兜底和导航均已通过" : fieldTestEvaluation.detail,
      evidence: {
        summary: fieldTestEvaluation.summary,
        missingChecks: fieldTestEvaluation.missingChecks,
        failedChecks: fieldTestEvaluation.failedChecks,
        blockedChecks: fieldTestEvaluation.blockedChecks,
        untestedChecks: fieldTestEvaluation.untestedChecks,
      },
    }),
    criterion({
      key: "driver-native-package-scan",
      label: "原生扫码能力",
      passed: nativePackageScanEvaluation.ready,
      detail: nativePackageScanEvaluation.detail,
      evidence: nativePackageScanEvaluation.evidence,
    }),
    criterion({
      key: "driver-native-navigation",
      label: "原生导航能力",
      passed: nativeNavigationEvaluation.ready,
      detail: nativeNavigationEvaluation.detail,
      evidence: nativeNavigationEvaluation.evidence,
    }),
    criterion({
      key: "driver-native-package-label-scan-sample",
      label: "纸质包裹标签原生扫码样本",
      passed: packageLabelScanEvaluation.ready,
      detail: packageLabelScanEvaluation.detail,
      evidence: packageLabelScanEvaluation.evidence,
    }),
  ];
  const summary = buildSummary(criteria);
  return {
    status: summary.blockingCount === 0 ? "ready" : "blocked",
    ready: summary.blockingCount === 0,
    checkedAt,
    operatorId,
    scope: "v1_driver_mobile_readiness",
    summary,
    criteria,
    deliveryTaskReadiness: {
      total: deliveryTaskList.total ?? deliveryTasks.length,
      metrics: deliveryTaskList.metrics ?? {},
      sampleFulfillmentIds: deliveryTasks.slice(0, 5).map((item) => item.fulfillmentId).filter(Boolean),
    },
    latestFieldTestRecord: latestFieldTestRecord ?? null,
    latestFieldTestSummary: latestFieldTestRecord?.summary ?? null,
    nativeBridgeDiagnostics: nativeDiagnostics,
    packageLabelScanSample: normalizeDriverPackageLabelScanSample(latestFieldTestRecord?.packageLabelScanSample),
    remainingV1Risks: buildRemainingRisks({ criteria, latestFieldTestRecord }),
    safeguards: {
      nonMutating: true,
      deliveryStatusChanged: false,
      requiresNativeShell: true,
      browserOnlyNotReady: nativePackageScanEvaluation.ready !== true || nativeNavigationEvaluation.ready !== true,
      physicalLabelScanRequired: true,
      navigationAppRequired: true,
      payloadExposed: false,
    },
  };
}

function getLatestFieldTestRecord({ workspace, deliveryTasks }) {
  const candidates = [
    ...(workspace.driverDeviceFieldTests ?? []),
    ...(workspace.fulfillments ?? []).map((item) => item?.deviceFieldTestRecord),
    ...(deliveryTasks ?? []).flatMap((item) => [item?.deviceFieldTestRecord, item?.latestDeviceFieldTestRecord]),
  ];
  const byId = new Map();
  for (const candidate of candidates) {
    const record = normalizeDriverDeviceFieldTestRecord(candidate);
    if (record) byId.set(record.recordId, record);
  }
  return [...byId.values()].sort(compareCheckedAtDesc)[0] ?? null;
}

function compareCheckedAtDesc(left, right) {
  return (Date.parse(right?.checkedAt ?? "") || 0) - (Date.parse(left?.checkedAt ?? "") || 0);
}

function evaluateDeviceFieldTest(record) {
  if (!record) {
    return {
      ready: false,
      detail: "尚未记录现场验收，无法证明司机真机相机、水印拍照、扫码、定位、上传兜底和导航可用",
      summary: null,
      missingChecks: requiredFieldTestChecks,
      failedChecks: [],
      blockedChecks: [],
      untestedChecks: [],
    };
  }
  const normalizedChecks = normalizeDriverDeviceFieldTestChecks(record.checks ?? []);
  const originalKeys = new Set((record.checks ?? []).map((item) => text(item?.key)).filter(Boolean));
  const byKey = new Map(normalizedChecks.map((item) => [item.key, item]));
  const missingChecks = requiredFieldTestChecks.filter((key) => !originalKeys.has(key));
  const failedChecks = [];
  const blockedChecks = [];
  const untestedChecks = [];
  for (const key of requiredFieldTestChecks) {
    const status = text(byKey.get(key)?.status);
    if (status === "failed") failedChecks.push(key);
    if (status === "blocked") blockedChecks.push(key);
    if (!status || status === "untested") untestedChecks.push(key);
  }
  const ready = !missingChecks.length && !failedChecks.length && !blockedChecks.length && !untestedChecks.length;
  return {
    ready,
    detail: ready
      ? "司机手机现场检查全部通过"
      : `现场检查未通过：缺 ${missingChecks.length} 项，失败 ${failedChecks.length} 项，受限 ${blockedChecks.length} 项，未测 ${untestedChecks.length} 项`,
    summary: getDriverDeviceFieldTestSummary(normalizedChecks),
    missingChecks,
    failedChecks,
    blockedChecks,
    untestedChecks,
  };
}

function evaluateNativeCapability({ diagnostics, key, label }) {
  const item = (diagnostics?.items ?? []).find((candidate) => candidate.key === key);
  const ready = item?.supported === true;
  return {
    ready,
    detail: ready
      ? `${label}可用，桥接类型 ${item.bridgeTypeLabel || item.bridgeType || "已接入"}`
      : `${label}未接入原生壳，普通浏览器不能作为 V1 真机验收通过证据`,
    evidence: {
      key,
      supported: Boolean(item?.supported),
      statusLabel: item?.statusLabel ?? "",
      bridgeType: item?.bridgeType ?? "",
      bridgeTypeLabel: item?.bridgeTypeLabel ?? "",
      version: item?.version ?? "",
      diagnosticsLabel: diagnostics?.label ?? "",
      supportedCount: diagnostics?.supportedCount ?? 0,
      total: diagnostics?.total ?? 0,
    },
  };
}

function evaluatePackageLabelScanSample(value) {
  const sample = normalizeDriverPackageLabelScanSample(value);
  if (!sample) {
    return {
      ready: false,
      detail: "未记录纸质包裹标签扫码样本",
      evidence: { sampleId: "", method: "", result: "", expectedPackageId: "", matchedPackageId: "" },
    };
  }
  const matched = sample.result === "matched" || sample.result === "duplicate";
  const nativeMethod = sample.method === "native_sdk";
  const packageMatched = Boolean(sample.expectedPackageId && sample.matchedPackageId);
  const scanTextPresent = Boolean(sample.scannedText);
  const ready = matched && nativeMethod && packageMatched && scanTextPresent;
  return {
    ready,
    detail: ready
      ? `原生扫码样本 ${sample.sampleId} 已匹配 ${sample.matchedPackageId}`
      : "扫码样本未达到 V1 要求：必须是原生扫码 SDK、纸质标签文本已读回且匹配包裹",
    evidence: {
      sampleId: sample.sampleId,
      fulfillmentId: sample.fulfillmentId,
      expectedPackageId: sample.expectedPackageId,
      matchedPackageId: sample.matchedPackageId,
      method: sample.method,
      methodLabel: sample.methodLabel,
      result: sample.result,
      resultLabel: sample.resultLabel,
      checkedAt: sample.checkedAt,
      scanTextPresent,
      nativeMethod,
      packageMatched,
    },
  };
}

function buildRemainingRisks({ criteria, latestFieldTestRecord }) {
  const risks = criteria
    .filter((item) => item.blocking && item.status !== "passed")
    .map((item) => `${item.label}：${item.detail}`);
  if (!latestFieldTestRecord) risks.push("缺少真实司机手机现场验收记录");
  if (latestFieldTestRecord && latestFieldTestRecord.nativeBridgeDiagnostics?.supportedCount < 2) {
    risks.push("原生扫码 / 原生导航桥接未达到 2/2 可用");
  }
  if (!latestFieldTestRecord?.packageLabelScanSample) risks.push("缺少真实纸质包裹标签扫码样本");
  if (!risks.length) risks.push("仍需保留司机真机权限、纸质标签扫码、地图打开和送达水印照片现场抽检记录");
  return [...new Set(risks)];
}

function criterion({ key, label, passed, detail, evidence = {} }) {
  return { key, label, status: passed ? "passed" : "pending", tone: passed ? "success" : "warning", blocking: true, detail, evidence };
}

function buildSummary(criteria) {
  const passedCount = criteria.filter((item) => item.status === "passed").length;
  const blockingCount = criteria.filter((item) => item.blocking && item.status !== "passed").length;
  return {
    label: `${passedCount}/${criteria.length} 通过`,
    passedCount,
    totalCount: criteria.length,
    blockingCount,
    tone: blockingCount ? "danger" : "success",
  };
}

function text(value) {
  return String(value ?? "").trim();
}
