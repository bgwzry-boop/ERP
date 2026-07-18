import {
  getDriverDeviceFieldTestAcceptance,
  getDriverDeviceFieldTestSummary,
  normalizeDriverDeviceFieldTestChecks,
  normalizeDriverNativeNavigationSample,
  normalizeDriverPackageLabelScanSample,
} from "../../src/services/driverDeviceFieldTestClient.js";
import { normalizeDriverNativeCapabilityDiagnostics } from "../../src/services/driverNativeCapabilityClient.js";

export function createDriverDeviceFieldTestCommandService(dependencies = {}) {
  const {
    buildDriverDeliveryTask,
    buildOperationLog,
    findFulfillment,
    getFulfillmentSortSequence,
    validateDriverTaskAccess,
    now = () => new Date(),
  } = dependencies;
  for (const [name, value] of Object.entries({
    buildDriverDeliveryTask,
    buildOperationLog,
    findFulfillment,
    getFulfillmentSortSequence,
    validateDriverTaskAccess,
    now,
  })) {
    if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  }

  return Object.freeze({ recordDriverDeviceFieldTest });

  async function recordDriverDeviceFieldTest({ workspace, fulfillmentId, body = {}, operatorId }) {
    const access = validateDriverTaskAccess(workspace, fulfillmentId, operatorId);
    if (access.errorResult) return access.errorResult;
    const before = access.fulfillment;
    if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
      return businessError(422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
    }

    const authoritativeTask = await workspace.driverDeliveryTaskReadRepository.getDriverDeliveryTask({
      workspace,
      fulfillmentId,
      operatorId,
    });
    if (!authoritativeTask) return notFound("DRIVER_DELIVERY_TASK_NOT_FOUND");

    const normalizedRecord = normalizeDriverDeviceFieldTestCommandRecord(
      {
        ...body,
        fulfillmentId,
        orderLineId: body.orderLineId ?? before.orderLineId ?? before.lineId,
        driverId: operatorId,
        operatorId,
      },
      { now },
    );
    const acceptance = getDriverDeviceFieldTestAcceptance({
      record: normalizedRecord,
      task: authoritativeTask,
    });
    if (acceptance.allChecksPassed && !acceptance.ready) {
      return businessError(
        422,
        "DRIVER_DEVICE_FIELD_TEST_ACCEPTANCE_EVIDENCE_REQUIRED",
        acceptance.blockers[0]?.detail ?? "司机真机完整验收缺少权威任务或原生设备证据。",
      );
    }

    const record = {
      ...normalizedRecord,
      summary: {
        ...normalizedRecord.summary,
        acceptance,
      },
    };
    const after = {
      ...before,
      deviceFieldTestRecord: record,
      deviceFieldTestSummary: record.summary,
      deviceFieldTestCheckedAt: record.checkedAt,
    };
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action: "driver_record_device_field_test",
      operatorId,
      before: before.deviceFieldTestRecord ?? null,
      after: record,
      reason: record.summary?.label ?? "driver_device_field_test",
    });
    const transaction = await workspace.driverDeviceFieldTestRepository.recordDriverDeviceFieldTest({
      workspace,
      record,
      operationLog,
    });
    const savedRecord = transaction.record ?? record;
    const task =
      (await workspace.driverDeliveryTaskReadRepository.getDriverDeliveryTask({
        workspace,
        fulfillmentId,
        operatorId,
      })) ??
      buildDriverDeliveryTask(workspace, findFulfillment(workspace, fulfillmentId) ?? after, {
        driverId: operatorId,
        sortSequence: getFulfillmentSortSequence(workspace, fulfillmentId),
      });

    return success({
      fulfillmentId,
      record: savedRecord,
      summary: savedRecord.summary ?? record.summary,
      task,
      operationLogId: transaction.operationLogId || operationLog.id,
      acceptance,
      resultStatus: {
        recordSaved: true,
        onsiteAcceptancePassed: acceptance.ready,
        deliveryStatusChangedByRequest: false,
        nativeBridgeInvokedByRequest: false,
      },
      safeguards: {
        nonDeliveryAction: true,
        deliveryStatusChanged: false,
        nativeBridgeInvoked: false,
        cameraPermissionRequested: false,
        navigationAppOpened: false,
      },
    });
  }
}

export function normalizeDriverDeviceFieldTestCommandRecord(value = {}, options = {}) {
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const fulfillmentId = cleanText(value.fulfillmentId);
  const checkedAt = normalizeTimestamp(value.checkedAt, new Date(now()).toISOString());
  const checks = normalizeDriverDeviceFieldTestChecks(value.checks ?? [], value.readiness ?? {});
  const summary = getDriverDeviceFieldTestSummary(checks);
  const packageLabelScanSample = normalizeDriverPackageLabelScanSample(value.packageLabelScanSample);
  const nativeNavigationSample = normalizeDriverNativeNavigationSample(value.nativeNavigationSample);
  const nativeBridgeDiagnostics = normalizeDriverNativeCapabilityDiagnostics(
    value.nativeBridgeDiagnostics ?? value.native_bridge_diagnostics,
  );
  const recordId =
    cleanText(value.recordId) ||
    `DQA-${compactTimestamp(checkedAt)}-${safeRecordPart(fulfillmentId || "TASK")}`;
  return {
    recordId,
    fulfillmentId,
    orderLineId: cleanText(value.orderLineId),
    driverId: cleanText(value.driverId),
    operatorId: cleanText(value.operatorId),
    operatorName: cleanText(value.operatorName),
    checkedAt,
    deviceLabel: cleanText(value.deviceLabel),
    browserLabel: cleanText(value.browserLabel),
    userAgent: cleanText(value.userAgent),
    language: cleanText(value.language),
    summary,
    checks,
    packageLabelScanSample,
    nativeNavigationSample,
    nativeBridgeDiagnostics,
    note: cleanText(value.note),
  };
}

function normalizeTimestamp(value, fallback) {
  const timestamp = cleanText(value);
  if (timestamp && Number.isFinite(Date.parse(timestamp))) return new Date(timestamp).toISOString();
  return fallback;
}

function compactTimestamp(value) {
  return cleanText(value).replace(/[-:T.Z]/g, "").slice(0, 14) || "NOW";
}

function safeRecordPart(value) {
  return cleanText(value).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "TASK";
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function success(response) {
  return { response };
}

function notFound(code) {
  return { notFound: true, code };
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}
