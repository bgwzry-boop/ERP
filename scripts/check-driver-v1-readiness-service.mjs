import assert from "node:assert/strict";
import { buildDriverV1Readiness } from "../server/services/driverV1ReadinessService.mjs";

const checkedAt = "2026-07-12T13:00:00.000Z";
const now = () => new Date(checkedAt);
const operatorId = "U-DRIVER-FORMAL";

const blockedCalls = [];
const blocked = await buildDriverV1Readiness({
  workspace: buildWorkspace({ calls: blockedCalls }),
  operatorId,
  now,
});
assert.equal(blocked.ready, false);
assert.equal(blocked.status, "blocked");
assert.equal(blocked.summary.label, "0/6 通过");
assert.equal(blocked.checkedAt, checkedAt);
assert.equal(blocked.operatorId, operatorId);
assert.equal(blocked.safeguards.nonMutating, true);
assert.equal(blocked.safeguards.browserOnlyNotReady, true);
assert.deepEqual(blockedCalls, [{ operatorId, query: { page: 1, pageSize: 200 } }]);
assert.ok(blocked.remainingV1Risks.includes("缺少真实司机手机现场验收记录"));

const readyRecord = buildReadyRecord({
  recordId: "DQA-READY-LATEST",
  checkedAt: "2026-07-12T12:50:00.000Z",
});
const olderFailedRecord = {
  ...buildReadyRecord({ recordId: "DQA-FAILED-OLDER", checkedAt: "2026-07-12T12:00:00.000Z" }),
  checks: [{ key: "camera_permission", status: "failed" }],
};
const readyTask = {
  fulfillmentId: "FUL-DRIVER-001",
  status: "待装车",
  latestDeviceFieldTestRecord: readyRecord,
};
const readyWorkspace = buildWorkspace({
  tasks: [readyTask],
  records: [olderFailedRecord],
  metrics: { total: 1, pending: 1 },
});
const snapshot = JSON.stringify({
  tasks: readyWorkspace.tasks,
  records: readyWorkspace.driverDeviceFieldTests,
});
const ready = await buildDriverV1Readiness({ workspace: readyWorkspace, operatorId, now });
assert.equal(ready.ready, true);
assert.equal(ready.summary.label, "6/6 通过");
assert.equal(ready.latestFieldTestRecord.recordId, readyRecord.recordId);
assert.equal(
  ready.criteria.find((item) => item.key === "driver-device-field-test-checks")?.evidence.summary.label,
  "6/6 项通过",
);
assert.equal(ready.nativeBridgeDiagnostics.supportedCount, 2);
assert.equal(ready.packageLabelScanSample.method, "native_sdk");
assert.equal(ready.packageLabelScanSample.result, "matched");
assert.equal(ready.deliveryTaskReadiness.total, 1);
assert.deepEqual(ready.deliveryTaskReadiness.sampleFulfillmentIds, ["FUL-DRIVER-001"]);
assert.equal(ready.safeguards.browserOnlyNotReady, false);
assert.equal(JSON.stringify({ tasks: readyWorkspace.tasks, records: readyWorkspace.driverDeviceFieldTests }), snapshot);

const incompleteRecord = {
  ...readyRecord,
  recordId: "DQA-INCOMPLETE",
  checkedAt: "2026-07-12T12:55:00.000Z",
  checks: readyRecord.checks.filter((item) => item.key !== "navigation"),
  nativeBridgeDiagnostics: {
    ...readyRecord.nativeBridgeDiagnostics,
    supportedCount: 1,
    issueCount: 1,
    items: readyRecord.nativeBridgeDiagnostics.items.map((item) =>
      item.key === "native_navigation" ? { ...item, supported: false, statusLabel: "未接入" } : item,
    ),
  },
  packageLabelScanSample: {
    ...readyRecord.packageLabelScanSample,
    method: "camera",
  },
};
const incomplete = await buildDriverV1Readiness({
  workspace: buildWorkspace({
    tasks: [{ fulfillmentId: "FUL-DRIVER-001", latestDeviceFieldTestRecord: incompleteRecord }],
  }),
  operatorId,
  now,
});
assert.equal(incomplete.ready, false);
assert.equal(incomplete.summary.label, "3/6 通过");
assert.equal(
  incomplete.criteria.find((item) => item.key === "driver-device-field-test-checks")?.evidence.missingChecks.includes("navigation"),
  true,
);
assert.equal(incomplete.criteria.find((item) => item.key === "driver-native-navigation")?.status, "pending");
assert.equal(incomplete.criteria.find((item) => item.key === "driver-native-package-label-scan-sample")?.status, "pending");
assert.equal(incomplete.safeguards.browserOnlyNotReady, true);
assert.ok(incomplete.remainingV1Risks.some((item) => item.includes("原生扫码 / 原生导航桥接未达到 2/2")));

console.log("driver V1 readiness service checks passed");

function buildWorkspace({ tasks = [], records = [], metrics = {}, calls = [] } = {}) {
  const workspace = {
    tasks,
    driverDeviceFieldTests: records,
    fulfillments: [],
    driverDeliveryTaskReadRepository: {
      async listDriverDeliveryTasks({ query, operatorId: requestedOperatorId }) {
        calls.push({ operatorId: requestedOperatorId, query });
        return { items: tasks, total: tasks.length, metrics };
      },
    },
  };
  return workspace;
}

function buildReadyRecord({ recordId, checkedAt: recordCheckedAt }) {
  return {
    recordId,
    fulfillmentId: "FUL-DRIVER-001",
    orderLineId: "OL-DRIVER-001",
    driverId: operatorId,
    operatorId,
    operatorName: "司机甲",
    checkedAt: recordCheckedAt,
    deviceLabel: "Android field shell",
    browserLabel: "ERP Driver Native Shell",
    checks: [
      "camera_permission",
      "watermark_photo",
      "package_label_scan",
      "geolocation",
      "file_upload",
      "navigation",
    ].map((key) => ({ key, status: "passed" })),
    packageLabelScanSample: {
      sampleId: "DPLS-DRIVER-001",
      fulfillmentId: "FUL-DRIVER-001",
      expectedPackageId: "PKG-DRIVER-001",
      scannedText: "PKG-DRIVER-001",
      matchedPackageId: "PKG-DRIVER-001",
      method: "native_sdk",
      result: "matched",
      checkedAt: recordCheckedAt,
    },
    nativeBridgeDiagnostics: {
      items: [
        {
          key: "native_package_scan",
          label: "原生扫码",
          supported: true,
          statusLabel: "可用",
          bridgeType: "android_interface",
          version: "p0-driver-native-bridge-v1",
        },
        {
          key: "native_navigation",
          label: "原生导航",
          supported: true,
          statusLabel: "可用",
          bridgeType: "android_interface",
          version: "p0-driver-native-navigation-bridge-v1",
        },
      ],
      total: 2,
      supportedCount: 2,
      issueCount: 0,
      label: "原生能力可用",
    },
  };
}
