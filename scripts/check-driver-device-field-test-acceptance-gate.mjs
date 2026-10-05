import assert from "node:assert/strict";
import { createApiServer } from "../server/apiServer.mjs";
import {
  closeTestServer,
  getJson as getSharedJson,
  getTestServerBaseUrl,
  listenTestServer,
  postJson as postSharedJson,
} from "./helpers/apiIntegrationTestHarness.mjs";

const server = createApiServer({ allowLocalFixture: true });
const headers = {
  "content-type": "application/json",
  "x-erp-user-id": "U-DRIVER-A",
};
await server.ready;
await listenTestServer(server);

try {
  const baseUrl = getTestServerBaseUrl(server);
  const tasks = await getJson(baseUrl, "/driver/delivery-tasks", headers);
  const task = tasks.items?.[0];
  assert.ok(task?.fulfillmentId, "isolated driver QA gate check requires a seeded delivery task");
  assert.equal(task.driverId, "U-DRIVER-A");
  assert.ok(task.packageChecklist?.[0]?.packageId, "isolated driver QA gate check requires a real task package");
  const packageId = task.packageChecklist[0].packageId;
  const originalStatus = task.status;
  const checks = [
    "camera_permission",
    "watermark_photo",
    "package_label_scan",
    "geolocation",
    "file_upload",
    "navigation",
  ].map((key) => ({ key, status: "passed" }));
  const baseRecord = {
    fulfillmentId: task.fulfillmentId,
    orderLineId: task.orderLineId,
    driverId: task.driverId,
    operatorId: task.driverId,
    operatorName: "司机A",
    checkedAt: "2026-07-14T08:30:00.000Z",
    deviceLabel: "Android field shell",
    browserLabel: "ERP Driver Native Shell",
    checks,
  };

  const missingNativeEvidence = await postJson(
    baseUrl,
    `/driver/delivery-tasks/${encodeURIComponent(task.fulfillmentId)}/device-field-tests`,
    { ...baseRecord, recordId: `DQA-V8168-NO-NATIVE-${task.fulfillmentId}` },
    422,
  );
  assert.equal(missingNativeEvidence.code, "DRIVER_DEVICE_FIELD_TEST_ACCEPTANCE_EVIDENCE_REQUIRED");

  const mismatchedPackage = await postJson(
    baseUrl,
    `/driver/delivery-tasks/${encodeURIComponent(task.fulfillmentId)}/device-field-tests`,
    buildAcceptedRecord({
      ...baseRecord,
      recordId: `DQA-V8168-MISMATCH-${task.fulfillmentId}`,
      task,
      packageId,
      matchedPackageId: `${packageId}-WRONG`,
    }),
    422,
  );
  assert.equal(mismatchedPackage.code, "DRIVER_DEVICE_FIELD_TEST_ACCEPTANCE_EVIDENCE_REQUIRED");

  const issueRecord = await postJson(
    baseUrl,
    `/driver/delivery-tasks/${encodeURIComponent(task.fulfillmentId)}/device-field-tests`,
    {
      ...baseRecord,
      recordId: `DQA-V8168-ISSUE-${task.fulfillmentId}`,
      checks: checks.map((item) => item.key === "navigation" ? { ...item, status: "failed" } : item),
    },
  );
  assert.equal(issueRecord.resultStatus.recordSaved, true);
  assert.equal(issueRecord.resultStatus.onsiteAcceptancePassed, false);
  assert.equal(issueRecord.acceptance.ready, false);

  const accepted = await postJson(
    baseUrl,
    `/driver/delivery-tasks/${encodeURIComponent(task.fulfillmentId)}/device-field-tests`,
    buildAcceptedRecord({
      ...baseRecord,
      recordId: `DQA-V8168-ACCEPTED-${task.fulfillmentId}`,
      task,
      packageId,
      matchedPackageId: packageId,
    }),
  );
  assert.equal(accepted.acceptance.ready, true);
  assert.equal(accepted.acceptance.packageIdsMatch, true);
  assert.equal(accepted.acceptance.packageBelongsToTask, true);
  assert.equal(accepted.acceptance.navigationSampleReady, true);
  assert.equal(accepted.resultStatus.recordSaved, true);
  assert.equal(accepted.resultStatus.onsiteAcceptancePassed, true);
  assert.equal(accepted.resultStatus.deliveryStatusChangedByRequest, false);
  assert.equal(accepted.resultStatus.nativeBridgeInvokedByRequest, false);
  assert.equal(accepted.safeguards.nonDeliveryAction, true);
  assert.equal(accepted.safeguards.deliveryStatusChanged, false);
  assert.equal(accepted.safeguards.nativeBridgeInvoked, false);

  const afterTask = await getJson(
    baseUrl,
    `/driver/delivery-tasks/${encodeURIComponent(task.fulfillmentId)}`,
    headers,
  );
  assert.equal(afterTask.task.status, originalStatus);
  assert.equal(afterTask.task.deviceFieldTestRecord.recordId, accepted.record.recordId);

  const readiness = await getJson(baseUrl, "/driver/v1-readiness", headers);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.latestFieldTestAcceptance.ready, true);
  assert.equal(readiness.criteria.every((item) => item.status === "passed"), true);
  assert.equal(readiness.safeguards.deliveryStatusChanged, false);

  console.log(
    "Driver device field-test acceptance HTTP check passed: 6/6 without native evidence and mismatched packages are rejected, issue records remain savable, and accepted QA does not change delivery state.",
  );
} finally {
  await closeTestServer(server, { forceAfterMs: 1_000 });
}

function buildAcceptedRecord(input) {
  const { task, packageId, matchedPackageId, ...record } = input;
  return {
    ...record,
    packageLabelScanSample: {
      sampleId: `DPLS-V8168-${task.fulfillmentId}`,
      fulfillmentId: task.fulfillmentId,
      expectedPackageId: packageId,
      scannedText: matchedPackageId,
      matchedPackageId,
      method: "native_sdk",
      result: "matched",
      requestId: `DNPS-20260714083000-${task.fulfillmentId}`,
      source: "native_sdk",
      checkedAt: "2026-07-14T08:29:58.000Z",
    },
    nativeNavigationSample: {
      requestId: `DNN-20260714083000-${task.fulfillmentId}`,
      fulfillmentId: task.fulfillmentId,
      status: "opened",
      source: "native_navigation_sdk",
      mapApp: "高德地图",
      checkedAt: "2026-07-14T08:29:59.000Z",
    },
    nativeBridgeDiagnostics: {
      items: [
        {
          key: "native_package_scan",
          label: "原生扫码",
          supported: true,
          bridgeType: "android_interface",
          version: "p0-driver-native-bridge-v1",
        },
        {
          key: "native_navigation",
          label: "原生导航",
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

async function getJson(baseUrl, route, requestHeaders = {}) {
  return getSharedJson(baseUrl, `/api${route}`, { headers: requestHeaders });
}

async function postJson(baseUrl, route, body, expectedStatus = 200) {
  return postSharedJson(baseUrl, `/api${route}`, body, {
    headers,
    expectedStatus,
  });
}
