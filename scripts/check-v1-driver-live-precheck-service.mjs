import assert from "node:assert/strict";
import {
  precheckV1DriverReadiness,
  sanitizeV1DriverLivePrecheckCriterion,
} from "../server/services/v1DriverLivePrecheckService.mjs";

const fixedDate = new Date("2026-07-12T14:00:00.000Z");
const now = () => fixedDate;
const operatorId = "U-V1-MANAGEMENT";

let receivedDriverOperatorId = "";
const blocked = await precheckV1DriverReadiness({
  workspace: {},
  operatorId,
  env: { ERP_V1_READINESS_DRIVER_OPERATOR_ID: "U-V1-DRIVER" },
  now,
  async buildReadiness({ operatorId: targetOperatorId }) {
    receivedDriverOperatorId = targetOperatorId;
    return buildReadiness({ ready: false });
  },
});
assert.equal(receivedDriverOperatorId, "U-V1-DRIVER");
assert.equal(blocked.httpStatus, 200);
assert.equal(blocked.body.status, "blocked");
assert.equal(blocked.body.summary.readinessLabel, "5/6");
assert.equal(blocked.body.summary.deliveryTaskCount, 2);
assert.equal(blocked.body.deliveryTaskReadiness.sampleFulfillmentCount, 2);
assert.equal(blocked.body.latestFieldTest.recordId, "DQA-001");
assert.equal(blocked.body.nativeBridge.items.length, 2);
assert.equal(blocked.body.packageLabelScanSample.scanTextPresent, true);
assert.equal(blocked.body.safeguards.deliveryTaskStatusChanged, false);
assert.equal(blocked.body.safeguards.rawScanTextIncluded, false);
assert.doesNotMatch(JSON.stringify(blocked), /PKG-SECRET-TEXT|PHOTO-SECRET|LOCATION-SECRET/);

const ready = await precheckV1DriverReadiness({
  workspace: {},
  operatorId,
  driverOperatorId: "U-EXPLICIT-DRIVER",
  env: { ERP_V1_READINESS_DRIVER_OPERATOR_ID: "U-IGNORED-DRIVER" },
  now,
  buildReadiness: async () => buildReadiness({ ready: true }),
});
assert.equal(ready.body.status, "ready");
assert.equal(ready.body.driverOperatorId, "U-EXPLICIT-DRIVER");
assert.equal(ready.body.summary.readinessLabel, "6/6");
assert.equal(ready.body.summary.packageLabelScanMatched, true);
assert.equal(ready.body.summary.packageLabelScanNative, true);
assert.equal(ready.body.summary.onsiteAcceptancePassed, true);
assert.equal(ready.body.latestFieldTest.acceptanceStatusLabel, "现场验收已通过");

const error = await precheckV1DriverReadiness({
  workspace: {},
  operatorId,
  env: {},
  now,
  async buildReadiness() {
    throw new Error("SECRET-DRIVER-TOKEN LOCATION-SECRET");
  },
});
assert.equal(error.httpStatus, 500);
assert.equal(error.body.driverOperatorId, "U-DRIVER-A");
assert.equal(error.body.error.code, "V1_DRIVER_READINESS_LIVE_PRECHECK_FAILED");
assert.doesNotMatch(JSON.stringify(error), /SECRET-DRIVER-TOKEN|LOCATION-SECRET/);

assert.deepEqual(sanitizeV1DriverLivePrecheckCriterion({ status: "passed" }), {
  key: "driver-readiness-criterion",
  label: "司机真机门禁项",
  status: "passed",
  statusLabel: "通过",
  ready: true,
  blocking: true,
  detail: "",
});

console.log("V1 driver live-precheck service checks passed");

function buildReadiness({ ready }) {
  const criteria = Array.from({ length: 6 }, (_, index) => ({
    key: `driver-${index + 1}`,
    label: `门禁 ${index + 1}`,
    status: ready || index < 5 ? "passed" : "pending",
    blocking: true,
    detail: ready || index < 5 ? "通过" : "缺少真机证据",
  }));
  return {
    ready,
    checkedAt: fixedDate.toISOString(),
    summary: { passedCount: ready ? 6 : 5, totalCount: 6, blockingCount: ready ? 0 : 1 },
    criteria,
    deliveryTaskReadiness: {
      total: 2,
      metrics: { pendingCount: 1, deliveringCount: 1, completedCount: 0, exceptionCount: 0 },
      sampleFulfillmentIds: ["F-001", "F-002"],
      rawTasks: [{ customerPhone: "PHONE-SECRET" }],
    },
    latestFieldTestRecord: {
      recordId: "DQA-001",
      fulfillmentId: "F-001",
      checkedAt: fixedDate.toISOString(),
      deviceLabel: "Android QA",
      photo: "PHOTO-SECRET",
      location: "LOCATION-SECRET",
    },
    latestFieldTestSummary: { label: "6/6 通过", checks: ["SECRET-CHECK"] },
    latestFieldTestAcceptance: {
      ready,
      statusLabel: ready ? "现场验收已通过" : "现场验收未通过",
      packageIdsMatch: ready,
      packageBelongsToTask: ready,
    },
    nativeBridgeDiagnostics: {
      label: "2/2 可用",
      supportedCount: 2,
      total: 2,
      items: [
        { key: "native_package_scan", label: "原生扫码", supported: true, statusLabel: "可用", bridgeTypeLabel: "原生", version: "1" },
        { key: "native_navigation", label: "原生导航", supported: true, statusLabel: "可用", bridgeTypeLabel: "原生", version: "1" },
        { key: "extra", label: "不应输出", supported: true },
      ],
      rawPayload: "SECRET-NATIVE-PAYLOAD",
    },
    packageLabelScanSample: {
      sampleId: "SCAN-001",
      fulfillmentId: "F-001",
      method: "native_sdk",
      methodLabel: "原生扫码",
      result: "matched",
      resultLabel: "匹配",
      checkedAt: fixedDate.toISOString(),
      expectedPackageId: "PKG-001",
      matchedPackageId: "PKG-001",
      scannedText: "PKG-SECRET-TEXT",
    },
    remainingV1Risks: ready ? [] : ["纸质标签现场证据待复核"],
    safeguards: {
      deliveryStatusChanged: false,
      requiresNativeShell: true,
      browserOnlyNotReady: !ready,
      physicalLabelScanRequired: true,
      navigationAppRequired: true,
      payloadExposed: false,
    },
  };
}
