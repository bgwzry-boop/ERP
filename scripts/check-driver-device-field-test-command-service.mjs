import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createDriverDeviceFieldTestCommandService,
  normalizeDriverDeviceFieldTestCommandRecord,
} from "../server/services/driverDeviceFieldTestCommandService.mjs";

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../server/routes/driverWriteRoutes.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
assert.match(registrySource, /createDriverDeviceFieldTestCommandService\(\{/);
assert.match(routeSource, /driverDeviceFieldTestCommandService\.recordDriverDeviceFieldTest\(\{/);
assert.doesNotMatch(apiSource, /function normalizeDriverDeviceFieldTestApiRecord\(/);
assert.doesNotMatch(apiSource, /getDriverDeviceFieldTestAcceptance/);
assert.doesNotMatch(routeSource, /getDriverDeviceFieldTestAcceptance|normalizeDriverDeviceFieldTestChecks/);

const fixedNow = new Date("2026-07-14T12:00:00.000Z");
const calls = [];
let taskReadResults = [];
const fulfillment = {
  id: "FUL-DRIVER-QA-001",
  orderLineId: "OL-DRIVER-QA-001",
  driverId: "U-DRIVER-A",
  status: "待送货",
  deviceFieldTestRecord: { recordId: "DQA-BEFORE" },
};
const authoritativeTask = {
  fulfillmentId: fulfillment.id,
  orderLineId: fulfillment.orderLineId,
  driverId: "U-DRIVER-A",
  status: fulfillment.status,
  packageChecklist: [{ packageId: "PKG-DRIVER-QA-001" }],
};
const workspace = {
  fulfillments: [fulfillment],
  driverDeliveryTaskReadRepository: {
    async getDriverDeliveryTask(input) {
      calls.push({ kind: "taskRead", ...input });
      return taskReadResults.shift() ?? null;
    },
  },
  driverDeviceFieldTestRepository: {
    async recordDriverDeviceFieldTest(input) {
      calls.push({ kind: "persist", ...input });
      return {
        record: input.record,
        operationLogId: input.operationLog.id,
      };
    },
  },
};
const service = createDriverDeviceFieldTestCommandService({
  buildDriverDeliveryTask(_workspace, selected, input) {
    calls.push({ kind: "fallbackTask", selected, input });
    return {
      fulfillmentId: selected.id,
      driverId: input.driverId,
      sortSequence: input.sortSequence,
      status: selected.status,
    };
  },
  buildOperationLog(_workspace, input) {
    calls.push({ kind: "operationLog", input });
    return {
      id: "LOG-DRIVER-QA-001",
      occurredAt: fixedNow.toISOString(),
      ...input,
    };
  },
  findFulfillment(targetWorkspace, fulfillmentId) {
    return targetWorkspace.fulfillments.find((item) => item.id === fulfillmentId) ?? null;
  },
  getFulfillmentSortSequence(_workspace, fulfillmentId) {
    calls.push({ kind: "sortSequence", fulfillmentId });
    return 9;
  },
  validateDriverTaskAccess(_workspace, fulfillmentId, operatorId) {
    calls.push({ kind: "access", fulfillmentId, operatorId });
    if (fulfillmentId !== fulfillment.id || operatorId !== "U-DRIVER-A") {
      return { errorResult: { notFound: true, code: "DRIVER_DELIVERY_TASK_NOT_FOUND" } };
    }
    return { fulfillment };
  },
  now: () => fixedNow,
});

calls.length = 0;
assert.deepEqual(
  await service.recordDriverDeviceFieldTest({
    workspace,
    fulfillmentId: fulfillment.id,
    body: {},
    operatorId: "U-SPOOFED",
  }),
  { notFound: true, code: "DRIVER_DELIVERY_TASK_NOT_FOUND" },
);
assert.equal(calls.filter((item) => item.kind === "taskRead").length, 0);
assert.equal(calls.filter((item) => item.kind === "persist").length, 0);

calls.length = 0;
assert.deepEqual(
  await service.recordDriverDeviceFieldTest({
    workspace,
    fulfillmentId: fulfillment.id,
    body: { fulfillmentId: "FUL-OTHER" },
    operatorId: "U-DRIVER-A",
  }),
  {
    error: true,
    statusCode: 422,
    code: "VALIDATION_ERROR",
    message: "fulfillmentId in path and body must match",
  },
);
assert.equal(calls.filter((item) => item.kind === "taskRead").length, 0);

calls.length = 0;
taskReadResults = [null];
assert.deepEqual(
  await service.recordDriverDeviceFieldTest({
    workspace,
    fulfillmentId: fulfillment.id,
    body: {},
    operatorId: "U-DRIVER-A",
  }),
  { notFound: true, code: "DRIVER_DELIVERY_TASK_NOT_FOUND" },
);
assert.equal(calls.filter((item) => item.kind === "persist").length, 0);

calls.length = 0;
taskReadResults = [authoritativeTask];
const missingNativeEvidence = await service.recordDriverDeviceFieldTest({
  workspace,
  fulfillmentId: fulfillment.id,
  body: {
    recordId: "DQA-MISSING-NATIVE",
    checks: allPassedChecks(),
  },
  operatorId: "U-DRIVER-A",
});
assert.equal(missingNativeEvidence.error, true);
assert.equal(missingNativeEvidence.statusCode, 422);
assert.equal(missingNativeEvidence.code, "DRIVER_DEVICE_FIELD_TEST_ACCEPTANCE_EVIDENCE_REQUIRED");
assert.equal(calls.filter((item) => item.kind === "persist").length, 0);

calls.length = 0;
taskReadResults = [authoritativeTask, null];
const accepted = await service.recordDriverDeviceFieldTest({
  workspace,
  fulfillmentId: fulfillment.id,
  body: buildAcceptedRecord({
    fulfillmentId: fulfillment.id,
    recordId: "DQA-ACCEPTED",
    driverId: "U-SPOOFED",
    operatorId: "U-SPOOFED",
    operatorName: "司机A",
    checkedAt: "not-a-timestamp",
    deviceLabel: "Android field shell",
    browserLabel: "ERP Driver Native Shell",
    userAgent: "ERP-Driver-Native/1.0 Android",
    language: "zh-CN",
    checks: allPassedChecks(),
  }),
  operatorId: "U-DRIVER-A",
});
assert.ok(accepted.response, JSON.stringify(accepted));
assert.equal(accepted.response.acceptance.ready, true);
assert.equal(accepted.response.resultStatus.recordSaved, true);
assert.equal(accepted.response.resultStatus.onsiteAcceptancePassed, true);
assert.equal(accepted.response.resultStatus.deliveryStatusChangedByRequest, false);
assert.equal(accepted.response.resultStatus.nativeBridgeInvokedByRequest, false);
assert.equal(accepted.response.safeguards.nonDeliveryAction, true);
assert.equal(accepted.response.safeguards.deliveryStatusChanged, false);
assert.equal(accepted.response.safeguards.nativeBridgeInvoked, false);
assert.equal(accepted.response.record.driverId, "U-DRIVER-A");
assert.equal(accepted.response.record.operatorId, "U-DRIVER-A");
assert.equal(accepted.response.record.checkedAt, fixedNow.toISOString());
assert.equal(accepted.response.task.sortSequence, 9);
assert.equal(accepted.response.operationLogId, "LOG-DRIVER-QA-001");
assert.equal(fulfillment.status, "待送货");

const persisted = calls.find((item) => item.kind === "persist");
assert.ok(persisted);
assert.equal(persisted.record.summary.acceptance.ready, true);
assert.equal(persisted.operationLog.action, "driver_record_device_field_test");
assert.equal(persisted.operationLog.operatorId, "U-DRIVER-A");
assert.deepEqual(persisted.operationLog.before, { recordId: "DQA-BEFORE" });
assert.equal(calls.filter((item) => item.kind === "taskRead").length, 2);
assert.equal(calls.filter((item) => item.kind === "fallbackTask").length, 1);

const normalized = normalizeDriverDeviceFieldTestCommandRecord(
  {
    fulfillmentId: " FUL-QA-GENERATED ",
    checkedAt: "invalid",
    driverId: " U-DRIVER-A ",
    note: " 现场测试 ",
  },
  { now: () => fixedNow },
);
assert.equal(normalized.recordId, "DQA-20260714120000-FUL-QA-GENERATED");
assert.equal(normalized.fulfillmentId, "FUL-QA-GENERATED");
assert.equal(normalized.checkedAt, fixedNow.toISOString());
assert.equal(normalized.driverId, "U-DRIVER-A");
assert.equal(normalized.note, "现场测试");

assert.throws(
  () => createDriverDeviceFieldTestCommandService(),
  /buildDriverDeliveryTask must be a function/,
);
assert.equal(Object.isFrozen(service), true);

console.log(
  "Driver device field-test command service checks passed: access, authoritative tasks, native evidence, persistence, audit identity, fallback projection, and non-delivery safeguards are isolated.",
);

function allPassedChecks() {
  return [
    "camera_permission",
    "watermark_photo",
    "package_label_scan",
    "geolocation",
    "file_upload",
    "navigation",
  ].map((key) => ({ key, status: "passed" }));
}

function buildAcceptedRecord(record) {
  return {
    ...record,
    packageLabelScanSample: {
      sampleId: "DPLS-COMMAND-001",
      fulfillmentId: record.fulfillmentId,
      expectedPackageId: "PKG-DRIVER-QA-001",
      scannedText: "PKG-DRIVER-QA-001",
      matchedPackageId: "PKG-DRIVER-QA-001",
      method: "native_sdk",
      result: "matched",
      requestId: "DNPS-20260714120000-COMMAND",
      source: "native_sdk",
      checkedAt: "2026-07-14T11:59:58.000Z",
    },
    nativeNavigationSample: {
      requestId: "DNN-20260714120000-COMMAND",
      fulfillmentId: record.fulfillmentId,
      status: "opened",
      source: "native_navigation_sdk",
      mapApp: "高德地图",
      checkedAt: "2026-07-14T11:59:59.000Z",
    },
    nativeBridgeDiagnostics: {
      items: [
        {
          key: "native_package_scan",
          supported: true,
          bridgeType: "android_interface",
          version: "p0-driver-native-bridge-v1",
        },
        {
          key: "native_navigation",
          supported: true,
          bridgeType: "android_interface",
          version: "p0-driver-native-navigation-bridge-v1",
        },
      ],
      total: 2,
      supportedCount: 2,
      issueCount: 0,
      tone: "success",
      label: "原生能力可用",
    },
  };
}
