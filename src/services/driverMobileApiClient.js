import {
  getLineColorSpecLabel,
  getLinePrintSide,
  getLineRemark,
  getOrderLineShortNo,
  shortColorName,
} from "../domain/officeRules.js";
import {
  getDriverDeviceFieldTestSummary,
  normalizeDriverPackageLabelScanSample,
  normalizeDriverDeviceFieldTestChecks,
} from "./driverDeviceFieldTestClient.js";
import { normalizeDriverNativeCapabilityDiagnostics } from "./driverNativeCapabilityClient.js";
import { isOfficeApiServerRequired } from "./officeAuthService.js";
import { requestOfficeApi as requestDriverApi } from "./officeApiClientCore.js";

const driverExceptionReasonCodeByLabel = {
  装车少货: "load_shortage",
  地址不清: "address_unclear",
  客户不在: "customer_unavailable",
  拒收: "customer_rejected",
  其他: "other",
};

export async function listDriverDeliveryTasks(input = {}, options = {}) {
  const { authState, driverId, localFulfillments = [], orderLines = [], customers = [], status = "全部", operatorId } = input;
  const safeDriverId = cleanText(driverId ?? operatorId);

  try {
    const response = await requestDriverApi(`/driver/delivery-tasks${buildDriverTaskQuery({ driverId: safeDriverId, status })}`, {
      ...options,
      authState,
      method: "GET",
      operatorId: operatorId ?? safeDriverId,
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "司机送货任务 API 返回错误。"),
      };
    }

    const items = toArray(json?.items).map(mapApiDriverDeliveryTask).filter(Boolean);
    return {
      source: "api",
      items,
      total: Number(json?.total ?? items.length),
      metrics: mapDriverTaskMetrics(json?.metrics, items),
    };
  } catch (error) {
    const items = buildLocalDriverDeliveryTasks({
      fulfillments: localFulfillments,
      orderLines,
      customers,
      driverId: safeDriverId,
      status,
    });
    return {
      source: "local_fallback",
      items,
      total: items.length,
      metrics: getDriverTaskMetrics(items),
      error: {
        code: "DRIVER_DELIVERY_TASK_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function confirmDriverDeliveryLoaded(input = {}, options = {}) {
  const { authState, task, fulfillmentId = task?.fulfillmentId, operatorId, remark = "", checkedPackageIds = [] } = input;
  const safeFulfillmentId = cleanText(fulfillmentId);
  if (!safeFulfillmentId) return invalidDriverInput("DRIVER_DELIVERY_TASK_REQUIRED", "送货任务不能为空。");
  const routeRemark = buildDriverLoadRouteRemark(task);
  const packageRemark = buildDriverLoadPackageCheckRemark(task, checkedPackageIds);
  const baseRemark = cleanText(remark) || routeRemark;
  const finalRemark = [baseRemark, packageRemark].filter(Boolean).join("；");

  try {
    const response = await requestDriverApi(`/driver/delivery-tasks/${encodeURIComponent(safeFulfillmentId)}/load-confirm`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        fulfillmentId: safeFulfillmentId,
        operatorId,
        loadedAt: new Date().toISOString(),
        remark: finalRemark,
        checkedPackageIds: normalizeCheckedPackageIds(checkedPackageIds),
        packageCheckSummary: packageRemark,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "司机确认装车 API 返回错误。"),
      };
    }
    return {
      source: "api",
      fulfillmentId: cleanText(json?.fulfillmentId ?? safeFulfillmentId),
      status: cleanText(json?.status) || "配送中",
      task: mapApiDriverDeliveryTask(json?.task),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("DRIVER_LOAD_CONFIRM_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      fulfillmentId: safeFulfillmentId,
      status: "配送中",
      task: task ? { ...task, status: "配送中" } : null,
      error: {
        code: "DRIVER_LOAD_CONFIRM_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function recordDriverDeviceFieldTest(input = {}, options = {}) {
  const { authState, task, record = {}, fulfillmentId = task?.fulfillmentId ?? record.fulfillmentId, operatorId = record.operatorId } = input;
  const safeFulfillmentId = cleanText(fulfillmentId);
  if (!safeFulfillmentId) return invalidDriverInput("DRIVER_DELIVERY_TASK_REQUIRED", "送货任务不能为空。");
  const normalizedRecord = normalizeDriverDeviceFieldTestRecordForClient({
    ...record,
    fulfillmentId: safeFulfillmentId,
    operatorId: cleanText(operatorId) || record.operatorId,
  });
  if (!normalizedRecord.recordId) {
    return invalidDriverInput("DRIVER_DEVICE_FIELD_TEST_RECORD_REQUIRED", "现场验收记录不能为空。");
  }

  try {
    const response = await requestDriverApi(`/driver/delivery-tasks/${encodeURIComponent(safeFulfillmentId)}/device-field-tests`, {
      ...options,
      authState,
      method: "POST",
      operatorId: cleanText(operatorId) || normalizedRecord.operatorId,
      body: normalizedRecord,
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "司机现场验收记录 API 返回错误。"),
      };
    }
    const savedRecord = normalizeDriverDeviceFieldTestRecordForClient(json?.record ?? normalizedRecord);
    return {
      source: "api",
      fulfillmentId: cleanText(json?.fulfillmentId ?? safeFulfillmentId),
      record: savedRecord,
      summary: json?.summary ?? savedRecord.summary,
      task: mapApiDriverDeliveryTask(json?.task),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("DRIVER_DEVICE_FIELD_TEST_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      fulfillmentId: safeFulfillmentId,
      record: normalizedRecord,
      summary: normalizedRecord.summary,
      task: task ? { ...task, deviceFieldTestRecord: normalizedRecord, deviceFieldTestSummary: normalizedRecord.summary } : null,
      error: {
        code: "DRIVER_DEVICE_FIELD_TEST_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function completeDriverDeliveryTask(input = {}, options = {}) {
  const {
    authState,
    task,
    fulfillmentId = task?.fulfillmentId,
    actualQty = task?.qty ?? task?.expectedQty ?? 0,
    operatorId,
    watermarkedPhotoAttached = false,
    watermarkedPhotoAttachmentId = "",
    watermarkedPhotoUrl = "",
    watermarkId = "",
    watermarkText = "",
    watermarkCapturedAt = "",
    watermarkLocationLabel = "",
    watermarkGeoPoint = "",
    watermarkAddress = "",
    watermarkOperatorId = "",
    watermarkOperatorName = "",
    signaturePhotoAttached = false,
    signaturePhotoAttachmentId = "",
    receiverName = "",
    paperNoteStatus = "已交回",
    remark = "",
  } = input;
  const safeFulfillmentId = cleanText(fulfillmentId);
  if (!safeFulfillmentId) return invalidDriverInput("DRIVER_DELIVERY_TASK_REQUIRED", "送货任务不能为空。");
  const safeWatermarkedPhotoAttachmentId = cleanText(watermarkedPhotoAttachmentId);
  const safeWatermarkedPhotoUrl = cleanText(watermarkedPhotoUrl);
  const safeWatermarkId = cleanText(watermarkId);
  const safeWatermarkText = cleanText(watermarkText);
  const safeWatermarkCapturedAt = cleanText(watermarkCapturedAt);
  const safeWatermarkLocationLabel = cleanText(watermarkLocationLabel);
  const safeWatermarkGeoPoint = cleanText(watermarkGeoPoint);
  const safeWatermarkAddress = cleanText(watermarkAddress);
  const safeWatermarkOperatorId = cleanText(watermarkOperatorId);
  const safeWatermarkOperatorName = cleanText(watermarkOperatorName);
  const hasWatermarkedEvidence = Boolean(watermarkedPhotoAttached || safeWatermarkedPhotoAttachmentId || safeWatermarkedPhotoUrl);
  if (!hasWatermarkedEvidence) {
    return invalidDriverInput("DRIVER_WATERMARK_PHOTO_REQUIRED", "完成送货必须上传或勾选水印照片凭证。");
  }

  try {
    const response = await requestDriverApi(`/driver/delivery-tasks/${encodeURIComponent(safeFulfillmentId)}/complete`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        fulfillmentId: safeFulfillmentId,
        actualQty: Number(actualQty ?? 0),
        operatorId,
        completedAt: new Date().toISOString(),
        watermarkedPhotoAttached: hasWatermarkedEvidence,
        watermarkedPhotoAttachmentId: safeWatermarkedPhotoAttachmentId,
        watermarkedPhotoUrl: safeWatermarkedPhotoUrl,
        watermarkId: safeWatermarkId,
        watermarkText: safeWatermarkText,
        watermarkCapturedAt: safeWatermarkCapturedAt,
        watermarkLocationLabel: safeWatermarkLocationLabel,
        watermarkGeoPoint: safeWatermarkGeoPoint,
        watermarkAddress: safeWatermarkAddress,
        watermarkOperatorId: safeWatermarkOperatorId,
        watermarkOperatorName: safeWatermarkOperatorName,
        signaturePhotoAttached: Boolean(signaturePhotoAttached),
        signaturePhotoAttachmentId: cleanText(signaturePhotoAttachmentId),
        receiverName: cleanText(receiverName),
        paperNoteStatus: cleanText(paperNoteStatus) || "已交回",
        remark,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "司机完成送货 API 返回错误。"),
      };
    }
    return {
      source: "api",
      fulfillmentId: cleanText(json?.fulfillmentId ?? safeFulfillmentId),
      status: cleanText(json?.status) || "已完成",
      task: mapApiDriverDeliveryTask(json?.task),
      statementCandidate: json?.statementCandidate === true,
      evidenceResubmission: json?.evidenceResubmission === true,
      retakeTodoId: cleanText(json?.retakeTodoId),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("DRIVER_DELIVERY_COMPLETE_API_UNAVAILABLE", error);
    }
    const evidenceResubmission = task?.deliveryEvidenceReviewStatus === "需重拍";
    return {
      source: "local_fallback",
      fulfillmentId: safeFulfillmentId,
      status: "已完成",
      task: task
        ? {
            ...task,
            status: "已完成",
            watermarkedPhotoAttached: true,
            watermarkedPhotoAttachmentId: safeWatermarkedPhotoAttachmentId,
            watermarkedPhotoUrl: safeWatermarkedPhotoUrl,
            watermarkId: safeWatermarkId,
            watermarkText: safeWatermarkText,
            watermarkCapturedAt: safeWatermarkCapturedAt,
            watermarkLocationLabel: safeWatermarkLocationLabel,
            watermarkGeoPoint: safeWatermarkGeoPoint,
            watermarkAddress: safeWatermarkAddress,
            watermarkOperatorId: safeWatermarkOperatorId,
            watermarkOperatorName: safeWatermarkOperatorName,
            deliveryEvidenceReviewStatus: "待复核",
            deliveryEvidenceIssueReason: "",
          }
        : null,
      statementCandidate: true,
      evidenceResubmission,
      error: {
        code: "DRIVER_DELIVERY_COMPLETE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function reportDriverDeliveryException(input = {}, options = {}) {
  const {
    authState,
    task,
    fulfillmentId = task?.fulfillmentId,
    operatorId,
    reason = "其他",
    actualQty = task?.qty ?? task?.expectedQty ?? 0,
    remark = "",
  } = input;
  const safeFulfillmentId = cleanText(fulfillmentId);
  if (!safeFulfillmentId) return invalidDriverInput("DRIVER_DELIVERY_TASK_REQUIRED", "送货任务不能为空。");
  const reasonCode = mapDriverDeliveryExceptionReason(reason);
  const occurredAt = new Date().toISOString();

  try {
    const response = await requestDriverApi(`/driver/delivery-tasks/${encodeURIComponent(safeFulfillmentId)}/exception`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        fulfillmentId: safeFulfillmentId,
        reasonCode,
        reasonText: reason,
        actualQty: Number(actualQty ?? 0),
        operatorId,
        occurredAt,
        remark: remark || reason,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "司机送货异常 API 返回错误。"),
      };
    }
    return {
      source: "api",
      fulfillmentId: cleanText(json?.fulfillmentId ?? safeFulfillmentId),
      status: cleanText(json?.status) || "送货异常",
      task: mapApiDriverDeliveryTask(json?.task),
      todoId: cleanText(json?.todoId),
      todoType: cleanText(json?.todoType),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("DRIVER_DELIVERY_EXCEPTION_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      fulfillmentId: safeFulfillmentId,
      status: "送货异常",
      task: task
        ? {
            ...task,
            status: "送货异常",
            exceptionReasonCode: reasonCode,
            exceptionReason: reason,
            exceptionOccurredAt: occurredAt,
          }
        : null,
      error: {
        code: "DRIVER_DELIVERY_EXCEPTION_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export function buildLocalDriverDeliveryTasks({ fulfillments = [], orderLines = [], customers = [], driverId = "", status = "全部" } = {}) {
  const tasks = fulfillments
    .filter((fulfillment) => cleanText(fulfillment.method) === "送货")
    .map((fulfillment, index) => {
      const line = findOrderLine(orderLines, fulfillment.lineId ?? fulfillment.orderLineId);
      const customer = findCustomer(customers, fulfillment.customerId ?? line?.customerId);
      return mapFulfillmentToDriverDeliveryTask({ fulfillment, line, customer, driverId, sequence: index + 1 });
    })
    .filter(Boolean)
    .filter((task) => status === "全部" || task.status === status);
  return sortDriverDeliveryTasks(tasks);
}

export function mapApiDriverDeliveryTask(value = {}) {
  const fulfillmentId = cleanText(value.fulfillmentId ?? value.id);
  if (!fulfillmentId) return null;
  const qty = Number(value.qty ?? value.expectedQty ?? 0);
  const packageCount = Number(value.packageCount ?? 0);
  return {
    fulfillmentId,
    driverTaskId: cleanText(value.driverTaskId ?? value.taskId ?? fulfillmentId) || fulfillmentId,
    driverId: cleanText(value.driverId),
    orderLineId: cleanText(value.orderLineId),
    orderTail: cleanText(value.orderTail),
    customerId: cleanText(value.customerId),
    customerName: cleanText(value.customerName),
    contactName: cleanText(value.contactName ?? value.contact),
    contactPhone: cleanText(value.contactPhone ?? value.phone),
    address: cleanText(value.address),
    addressArea: cleanText(value.addressArea),
    deliveryNoteNo: cleanText(value.deliveryNoteNo),
    goodsSummary: cleanText(value.goodsSummary),
    packageSummary: cleanText(value.packageSummary),
    packageCount,
    packageChecklist: normalizeDriverPackageChecklist(value.packageChecklist ?? value.packageItems ?? value.packages, {
      fulfillmentId,
      packageSummary: value.packageSummary,
      packageCount,
      qty,
    }),
    qty,
    expectedQty: Number(value.expectedQty ?? value.qty ?? 0),
    latest: cleanText(value.latest ?? value.latestNeededAt),
    latestNeededAt: cleanText(value.latestNeededAt ?? value.latest),
    status: cleanText(value.status) || "待送货",
    inventorySource: cleanText(value.inventorySource),
    nextStep: cleanText(value.nextStep),
    customerNote: cleanText(value.customerNote),
    officeNote: cleanText(value.officeNote),
    exceptionReasonCode: cleanText(value.exceptionReasonCode),
    exceptionReason: cleanText(value.exceptionReason),
    exceptionOccurredAt: cleanText(value.exceptionOccurredAt),
    routeDate: cleanText(value.routeDate),
    routeNo: cleanText(value.routeNo),
    routeSequence: Number(value.routeSequence ?? 0),
    dispatchStatus: cleanText(value.dispatchStatus),
    plannedDepartureAt: cleanText(value.plannedDepartureAt),
    dispatchAssignedAt: cleanText(value.dispatchAssignedAt),
    receiverName: cleanText(value.receiverName),
    paperNoteStatus: cleanText(value.paperNoteStatus),
    loadedBy: cleanText(value.loadedBy),
    driverRemark: cleanText(value.driverRemark),
    watermarkedPhotoAttached: value.watermarkedPhotoAttached === true,
    watermarkedPhotoAttachmentId: cleanText(value.watermarkedPhotoAttachmentId),
    watermarkedPhotoUrl: cleanText(value.watermarkedPhotoUrl),
    watermarkId: cleanText(value.watermarkId),
    watermarkText: cleanText(value.watermarkText),
    watermarkCapturedAt: cleanText(value.watermarkCapturedAt),
    watermarkLocationLabel: cleanText(value.watermarkLocationLabel),
    watermarkGeoPoint: cleanText(value.watermarkGeoPoint),
    watermarkAddress: cleanText(value.watermarkAddress),
    watermarkOperatorId: cleanText(value.watermarkOperatorId),
    watermarkOperatorName: cleanText(value.watermarkOperatorName),
    signaturePhotoAttached: value.signaturePhotoAttached === true,
    signaturePhotoAttachmentId: cleanText(value.signaturePhotoAttachmentId),
    deliveryEvidenceReviewStatus: cleanText(value.deliveryEvidenceReviewStatus),
    deliveryEvidenceReviewedAt: cleanText(value.deliveryEvidenceReviewedAt),
    deliveryEvidenceReviewedBy: cleanText(value.deliveryEvidenceReviewedBy),
    deliveryEvidenceReviewedByUserId: cleanText(value.deliveryEvidenceReviewedByUserId),
    deliveryEvidenceIssueReason: cleanText(value.deliveryEvidenceIssueReason),
    deviceFieldTestRecord: normalizeDriverDeviceFieldTestRecordForClient(value.deviceFieldTestRecord ?? value.latestDeviceFieldTestRecord),
    deviceFieldTestSummary: normalizeDriverDeviceFieldTestSummary(value.deviceFieldTestSummary),
    completedAt: cleanText(value.completedAt),
    loadedAt: cleanText(value.loadedAt),
    sortSequence: Number(value.sortSequence ?? value.sequence ?? 0),
  };
}

export function mapFulfillmentToDriverDeliveryTask({ fulfillment, line = {}, customer = {}, driverId = "", sequence = 0 } = {}) {
  if (!fulfillment) return null;
  const orderLineId = cleanText(fulfillment.lineId ?? fulfillment.orderLineId ?? line.id);
  const packageCount = parsePackageCount(fulfillment.packages ?? fulfillment.packageSummary);
  const qty = Number(fulfillment.actualQty ?? fulfillment.qty ?? line.qty ?? 0);
  const status = mapDriverDeliveryStatus(fulfillment.status);
  const address = cleanText(customer.address) || "地址待补";
  return {
    fulfillmentId: cleanText(fulfillment.id ?? fulfillment.fulfillmentId),
    driverTaskId: cleanText(fulfillment.id ?? fulfillment.fulfillmentId),
    driverId: cleanText(fulfillment.driverId ?? driverId),
    orderLineId,
    orderTail: getDriverOrderTail(line, orderLineId),
    customerId: cleanText(fulfillment.customerId ?? customer.id ?? line.customerId),
    customerName: cleanText(customer.name) || "客户待确认",
    contactName: cleanText(customer.contact) || "联系人待确认",
    contactPhone: cleanText(customer.phone) || "电话待确认",
    address,
    addressArea: inferAddressArea(address),
    deliveryNoteNo: cleanText(fulfillment.printBatch ?? fulfillment.deliveryNoteNo ?? fulfillment.activePrintRecordId) || "待打印/回填",
    goodsSummary: buildDriverGoodsSummary({ fulfillment, line, qty }),
    packageSummary: cleanText(fulfillment.packages) || `${packageCount || 1}包`,
    packageCount,
    packageChecklist: normalizeDriverPackageChecklist(fulfillment.packageChecklist ?? fulfillment.packageItems, {
      fulfillmentId: cleanText(fulfillment.id ?? fulfillment.fulfillmentId),
      packageSummary: fulfillment.packages,
      packageCount,
      qty,
    }),
    qty,
    expectedQty: Number(fulfillment.qty ?? line.qty ?? qty),
    latest: cleanText(fulfillment.latest ?? line.latest),
    latestNeededAt: cleanText(fulfillment.latestNeededAt ?? fulfillment.latest ?? line.latest),
    status,
    inventorySource: [fulfillment.zone, fulfillment.source].filter(Boolean).join(" / "),
    nextStep: getDriverDeliveryNextStep(status),
    customerNote: cleanText(line.note) || cleanText(fulfillment.customerNote) || "无",
    officeNote: cleanText(fulfillment.exceptionReason) || cleanText(line.exceptions?.join("、")) || "无",
    exceptionReasonCode: cleanText(fulfillment.exceptionReasonCode ?? fulfillment.reasonCode),
    exceptionReason: cleanText(fulfillment.exceptionReason),
    exceptionOccurredAt: cleanText(fulfillment.exceptionOccurredAt ?? fulfillment.occurredAt),
    routeDate: cleanText(fulfillment.routeDate),
    routeNo: cleanText(fulfillment.routeNo ?? fulfillment.routeBatchNo),
    routeSequence: Number(fulfillment.routeSequence ?? fulfillment.stopSequence ?? 0),
    dispatchStatus: cleanText(fulfillment.dispatchStatus),
    plannedDepartureAt: cleanText(fulfillment.plannedDepartureAt),
    dispatchAssignedAt: cleanText(fulfillment.dispatchAssignedAt ?? fulfillment.assignedAt),
    receiverName: cleanText(fulfillment.receiverName),
    paperNoteStatus: cleanText(fulfillment.paperNoteStatus),
    loadedBy: cleanText(fulfillment.loadedBy),
    driverRemark: cleanText(fulfillment.driverRemark),
    watermarkedPhotoAttached: fulfillment.watermarkedPhotoAttached === true,
    watermarkedPhotoAttachmentId: cleanText(fulfillment.watermarkedPhotoAttachmentId),
    watermarkedPhotoUrl: cleanText(fulfillment.watermarkedPhotoUrl),
    watermarkId: cleanText(fulfillment.watermarkId),
    watermarkText: cleanText(fulfillment.watermarkText),
    watermarkCapturedAt: cleanText(fulfillment.watermarkCapturedAt),
    watermarkLocationLabel: cleanText(fulfillment.watermarkLocationLabel),
    watermarkGeoPoint: cleanText(fulfillment.watermarkGeoPoint),
    watermarkAddress: cleanText(fulfillment.watermarkAddress),
    watermarkOperatorId: cleanText(fulfillment.watermarkOperatorId),
    watermarkOperatorName: cleanText(fulfillment.watermarkOperatorName),
    signaturePhotoAttached: fulfillment.signaturePhotoAttached === true,
    signaturePhotoAttachmentId: cleanText(fulfillment.signaturePhotoAttachmentId),
    deliveryEvidenceReviewStatus: cleanText(fulfillment.deliveryEvidenceReviewStatus),
    deliveryEvidenceReviewedAt: cleanText(fulfillment.deliveryEvidenceReviewedAt),
    deliveryEvidenceReviewedBy: cleanText(fulfillment.deliveryEvidenceReviewedBy),
    deliveryEvidenceReviewedByUserId: cleanText(fulfillment.deliveryEvidenceReviewedByUserId),
    deliveryEvidenceIssueReason: cleanText(fulfillment.deliveryEvidenceIssueReason),
    deviceFieldTestRecord: normalizeDriverDeviceFieldTestRecordForClient(fulfillment.deviceFieldTestRecord ?? fulfillment.latestDeviceFieldTestRecord),
    deviceFieldTestSummary: normalizeDriverDeviceFieldTestSummary(fulfillment.deviceFieldTestSummary),
    completedAt: cleanText(fulfillment.completedAt ?? fulfillment.deliveredAt),
    loadedAt: cleanText(fulfillment.loadedAt),
    sortSequence: sequence,
  };
}

export function mapDriverDeliveryStatus(value) {
  const status = cleanText(value);
  if (status === "配送中") return "配送中";
  if (status === "已交付" || status === "已完成") return "已完成";
  if (status.includes("异常") || status.includes("无法") || status.includes("数量")) return "送货异常";
  return "待送货";
}

export function mapDriverDeliveryExceptionReason(reason) {
  return driverExceptionReasonCodeByLabel[reason] ?? "other";
}

export function getDriverTaskMetrics(items = []) {
  return {
    pendingCount: items.filter((item) => item.status === "待送货").length,
    deliveringCount: items.filter((item) => item.status === "配送中").length,
    completedCount: items.filter((item) => item.status === "已完成").length,
    exceptionCount: items.filter((item) => item.status === "送货异常").length,
  };
}

export function sortDriverDeliveryTasks(items = []) {
  const statusRank = { 配送中: 0, 待送货: 1, 送货异常: 2, 已完成: 3 };
  return [...items].sort((a, b) => {
    const terminalDiff = getDriverTaskTerminalRank(a) - getDriverTaskTerminalRank(b);
    if (terminalDiff) return terminalDiff;
    const routeDateDiff = compareDriverRouteDate(a, b);
    if (routeDateDiff) return routeDateDiff;
    const routeNoDiff = compareDriverRouteNo(a, b);
    if (routeNoDiff) return routeNoDiff;
    const routeSequenceDiff = compareDriverRouteSequence(a, b);
    if (routeSequenceDiff) return routeSequenceDiff;
    const statusDiff = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
    if (statusDiff) return statusDiff;
    const sequenceDiff = Number(a.sortSequence ?? 0) - Number(b.sortSequence ?? 0);
    if (sequenceDiff) return sequenceDiff;
    return cleanText(a.latest).localeCompare(cleanText(b.latest), "zh-Hans-CN");
  });
}

export function getDriverRouteLabel(task = {}) {
  const routeDate = cleanText(task.routeDate);
  const routeNo = cleanText(task.routeNo);
  if (!routeDate && !routeNo) return "未排路线";
  return [routeDate || "未排日期", routeNo || "未分趟"].join(" · ");
}

export function getDriverRouteStopLabel(task = {}) {
  const sequence = Number(task.routeSequence ?? 0);
  return sequence > 0 ? `第 ${sequence} 站` : "未排站序";
}

export function getDriverNavigationUrl(task = {}) {
  const address = cleanText(task.address);
  if (!address || address === "地址待补") return "";
  const keyword = [address, cleanText(task.customerName)].filter(Boolean).join(" ");
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(keyword)}`;
}

export function getDriverRouteExecutionContext(tasks = [], selectedTask = {}) {
  const fulfillmentId = cleanText(selectedTask.fulfillmentId);
  const routeDate = cleanText(selectedTask.routeDate);
  const routeNo = cleanText(selectedTask.routeNo);
  const hasRoute = Boolean(routeDate || routeNo);
  const routeTasks = hasRoute
    ? sortDriverDeliveryTasks(tasks).filter((task) => cleanText(task.routeDate) === routeDate && cleanText(task.routeNo) === routeNo)
    : [];
  const currentIndex = routeTasks.findIndex((task) => cleanText(task.fulfillmentId) === fulfillmentId);
  const previousTask = currentIndex > 0 ? routeTasks[currentIndex - 1] : null;
  const nextTask = currentIndex >= 0 && currentIndex < routeTasks.length - 1 ? routeTasks[currentIndex + 1] : null;
  const pendingBeforeCount = routeTasks
    .slice(0, Math.max(currentIndex, 0))
    .filter((task) => !["配送中", "已完成"].includes(cleanText(task.status))).length;
  return {
    routeLabel: getDriverRouteLabel(selectedTask),
    stopLabel: getDriverRouteStopLabel(selectedTask),
    routeTaskCount: routeTasks.length,
    routeProgressLabel: currentIndex >= 0 ? `${currentIndex + 1}/${routeTasks.length || 1}` : "未排",
    previousTask,
    nextTask,
    pendingBeforeCount,
    hasRoute,
  };
}

export function buildDriverLoadRouteRemark(task = {}) {
  const routeLabel = getDriverRouteLabel(task);
  const stopLabel = getDriverRouteStopLabel(task);
  if (routeLabel === "未排路线" && stopLabel === "未排站序") return "";
  return `司机确认装车：${routeLabel} ${stopLabel}`;
}

export function normalizeDriverPackageChecklist(value, fallback = {}) {
  const source = Array.isArray(value) ? value : [];
  const packageSummary = cleanText(fallback.packageSummary);
  const fallbackCount = Math.max(1, Number(fallback.packageCount || parsePackageCount(packageSummary) || source.length || 1));
  const quantities = distributeDriverPackageQty(Number(fallback.qty ?? 0), Math.max(fallbackCount, source.length || 0));
  const normalized = source
    .map((item, index) => normalizeDriverPackageChecklistItem(item, {
      index,
      packageCount: Math.max(fallbackCount, source.length),
      fulfillmentId: fallback.fulfillmentId,
      fallbackQty: quantities[index],
    }))
    .filter(Boolean);
  if (normalized.length) return normalized;
  const count = fallbackCount;
  const generatedQuantities = distributeDriverPackageQty(Number(fallback.qty ?? 0), count);
  return Array.from({ length: count }, (_, index) =>
    normalizeDriverPackageChecklistItem({}, {
      index,
      packageCount: count,
      fulfillmentId: fallback.fulfillmentId,
      fallbackQty: generatedQuantities[index],
      packageSummary,
    }),
  );
}

export function getDriverLoadPackageCheckState(task = {}, checkedPackageIds = []) {
  const checklist = normalizeDriverPackageChecklist(task.packageChecklist, {
    fulfillmentId: task.fulfillmentId,
    packageSummary: task.packageSummary,
    packageCount: task.packageCount,
    qty: task.qty,
  });
  const checked = new Set([
    ...checklist.filter((item) => item.checked === true).map((item) => item.packageId),
    ...normalizeCheckedPackageIds(checkedPackageIds),
  ]);
  const checkedCount = checklist.filter((item) => checked.has(item.packageId)).length;
  const totalCount = checklist.length;
  const missingCount = Math.max(0, totalCount - checkedCount);
  return {
    checklist,
    checkedCount,
    totalCount,
    missingCount,
    allChecked: totalCount === 0 || checkedCount === totalCount,
    summary: totalCount ? `${checkedCount}/${totalCount}包` : "无包裹",
  };
}

export function buildDriverLoadPackageCheckRemark(task = {}, checkedPackageIds = []) {
  const state = getDriverLoadPackageCheckState(task, checkedPackageIds);
  if (!state.totalCount) return "";
  return `装车核对：${state.summary}`;
}

export function applyDriverPackageScan(task = {}, checkedPackageIds = [], scannedText = "") {
  const scanText = cleanText(scannedText);
  const currentIds = normalizeCheckedPackageIds(checkedPackageIds);
  const state = getDriverLoadPackageCheckState(task, currentIds);
  if (!scanText) {
    return {
      status: "empty",
      checkedPackageIds: currentIds,
      matchedPackageId: "",
      message: "请扫描或输入包裹号。",
    };
  }

  const matchedItems = state.checklist.filter((item) => packageScanMatches(scanText, item.packageId));
  if (!matchedItems.length) {
    return {
      status: "not_found",
      checkedPackageIds: currentIds,
      matchedPackageId: "",
      message: `未找到包裹：${scanText}`,
    };
  }
  if (matchedItems.length > 1) {
    return {
      status: "ambiguous",
      checkedPackageIds: currentIds,
      matchedPackageId: "",
      message: `包裹号不唯一：${scanText}`,
    };
  }

  const matchedPackageId = matchedItems[0].packageId;
  if (currentIds.includes(matchedPackageId)) {
    return {
      status: "duplicate",
      checkedPackageIds: currentIds,
      matchedPackageId,
      message: `${matchedItems[0].labelText} 已核对。`,
    };
  }

  const nextIds = [...currentIds, matchedPackageId];
  const nextState = getDriverLoadPackageCheckState(task, nextIds);
  return {
    status: "matched",
    checkedPackageIds: nextIds,
    matchedPackageId,
    message: `${matchedItems[0].labelText} 已核对，当前 ${nextState.summary}。`,
  };
}

function buildDriverGoodsSummary({ fulfillment, line = {}, qty }) {
  const colorSpec = getDriverColorSpecLabel(line);
  const printSide = getLinePrintSide(line);
  const remark = getLineRemark(line);
  const parts = [
    cleanText(line.product) || cleanText(fulfillment.goods),
    cleanText(line.size),
    colorSpec && colorSpec !== "待确认" ? colorSpec : "",
    printSide && printSide !== "无需印刷" ? printSide : "",
    `${Number(qty || 0)}个`,
    remark,
  ];
  return parts.filter(Boolean).join(" ");
}

function getDriverColorSpecLabel(line = {}) {
  const labels = [];
  if (cleanText(line.print) === "是" && cleanText(line.printColor) && cleanText(line.printColor) !== "待确认") {
    labels.push(`${shortColorName(line.color)}印${shortColorName(line.printColor)}`);
  }
  if (cleanText(line.handleColor) && cleanText(line.handleColor) !== "待确认") {
    labels.push(`${shortColorName(line.color)}袋${shortColorName(line.handleColor)}提`);
  }
  return labels.length ? labels.join(" / ") : getLineColorSpecLabel(line);
}

function getDriverDeliveryNextStep(status) {
  if (status === "配送中") return "到达客户处后提交水印照片，确认完成送货。";
  if (status === "已完成") return "送货已完成，回单进入办公室复核和对账候选。";
  if (status === "送货异常") return "异常已回到办公室处理，司机等待下一步通知。";
  return "先确认已装车，出发后状态进入配送中。";
}

function getDriverTaskTerminalRank(task) {
  const status = cleanText(task.status);
  if (status === "已完成") return 2;
  if (status === "送货异常") return 1;
  return 0;
}

function compareDriverRouteDate(a, b) {
  const aDate = cleanText(a.routeDate);
  const bDate = cleanText(b.routeDate);
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;
  return aDate.localeCompare(bDate, "zh-Hans-CN");
}

function compareDriverRouteNo(a, b) {
  const aNo = cleanText(a.routeNo);
  const bNo = cleanText(b.routeNo);
  if (aNo && !bNo) return -1;
  if (!aNo && bNo) return 1;
  return aNo.localeCompare(bNo, "zh-Hans-CN");
}

function compareDriverRouteSequence(a, b) {
  const aSequence = Number(a.routeSequence ?? 0);
  const bSequence = Number(b.routeSequence ?? 0);
  if (aSequence > 0 && bSequence <= 0) return -1;
  if (aSequence <= 0 && bSequence > 0) return 1;
  if (aSequence > 0 && bSequence > 0 && aSequence !== bSequence) return aSequence - bSequence;
  return 0;
}

function mapDriverTaskMetrics(value, items) {
  return {
    pendingCount: Number(value?.pendingCount ?? getDriverTaskMetrics(items).pendingCount),
    deliveringCount: Number(value?.deliveringCount ?? getDriverTaskMetrics(items).deliveringCount),
    completedCount: Number(value?.completedCount ?? getDriverTaskMetrics(items).completedCount),
    exceptionCount: Number(value?.exceptionCount ?? getDriverTaskMetrics(items).exceptionCount),
  };
}

function normalizeDriverDeviceFieldTestRecordForClient(value = {}) {
  const recordId = cleanText(value.recordId ?? value.id);
  if (!recordId) return null;
  const checks = normalizeDriverDeviceFieldTestChecks(value.checks ?? []);
  const summary = normalizeDriverDeviceFieldTestSummary(value.summary) ?? getDriverDeviceFieldTestSummary(checks);
  const packageLabelScanSample = normalizeDriverPackageLabelScanSample(
    value.packageLabelScanSample ?? value.package_label_scan_sample ?? value.summary?.packageLabelScanSample,
  );
  const nativeBridgeDiagnostics = normalizeDriverNativeCapabilityDiagnostics(
    value.nativeBridgeDiagnostics ?? value.native_bridge_diagnostics ?? value.summary?.nativeBridgeDiagnostics,
  );
  return {
    recordId,
    fulfillmentId: cleanText(value.fulfillmentId),
    orderLineId: cleanText(value.orderLineId),
    driverId: cleanText(value.driverId),
    operatorId: cleanText(value.operatorId),
    operatorName: cleanText(value.operatorName),
    checkedAt: cleanText(value.checkedAt),
    deviceLabel: cleanText(value.deviceLabel),
    browserLabel: cleanText(value.browserLabel),
    userAgent: cleanText(value.userAgent),
    language: cleanText(value.language),
    summary,
    checks,
    packageLabelScanSample,
    nativeBridgeDiagnostics,
    note: cleanText(value.note),
  };
}

function normalizeDriverDeviceFieldTestSummary(value) {
  if (!value || typeof value !== "object") return null;
  return {
    total: Number(value.total ?? 0),
    passedCount: Number(value.passedCount ?? 0),
    failedCount: Number(value.failedCount ?? 0),
    blockedCount: Number(value.blockedCount ?? 0),
    untestedCount: Number(value.untestedCount ?? 0),
    issueCount: Number(value.issueCount ?? 0),
    tone: cleanText(value.tone),
    label: cleanText(value.label),
  };
}

function buildDriverTaskQuery({ driverId, status }) {
  const params = new URLSearchParams();
  if (cleanText(driverId)) params.set("driverId", cleanText(driverId));
  if (status && status !== "全部") params.set("status", status);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function invalidDriverInput(code, message) {
  return {
    source: "api_error",
    blocked: true,
    error: { code, message },
  };
}

function findOrderLine(orderLines, ref) {
  const id = cleanText(ref);
  return orderLines.find((item) => item.id === id || item.orderLineId === id) ?? {};
}

function findCustomer(customers, customerId) {
  const id = cleanText(customerId);
  return customers.find((item) => item.id === id || item.customerId === id) ?? {};
}

function parsePackageCount(value) {
  const firstNumber = String(value ?? "").match(/\d+/)?.[0];
  return firstNumber ? Number(firstNumber) : 1;
}

function normalizeDriverPackageChecklistItem(item = {}, options = {}) {
  const packageSeq = Math.max(1, Number(item.packageSeq ?? item.sequence ?? options.index + 1));
  const packageCount = Math.max(1, Number(item.packageCount ?? options.packageCount ?? 1));
  const packageId =
    cleanText(item.packageId ?? item.id) ||
    [cleanText(options.fulfillmentId) || "DRIVER-PKG", packageSeq].join("-PKG-");
  const packedQty = Math.max(0, Number(item.packedQty ?? item.qty ?? item.expectedQty ?? options.fallbackQty ?? 0));
  const labelText =
    cleanText(item.labelText) ||
    (cleanText(options.packageSummary) && packageCount === 1 ? options.packageSummary : `第 ${packageSeq}/${packageCount} 包`);
  return {
    packageId,
    labelText,
    packageSeq,
    packageCount,
    packedQty,
    quantityText: packedQty ? `${packedQty}个` : "数量待核",
    status: cleanText(item.status) || "待装车核对",
    labelPrintRecordId: cleanText(item.labelPrintRecordId),
    checked: item.checked === true,
  };
}

function distributeDriverPackageQty(totalQty, packageCount) {
  const count = Math.max(1, Math.trunc(Number(packageCount || 1)));
  const total = Math.max(0, Math.trunc(Number(totalQty || 0)));
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function normalizeCheckedPackageIds(value) {
  return toArray(value).map((item) => cleanText(item)).filter(Boolean);
}

function normalizePackageScanKey(value) {
  return cleanText(value).toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function packageScanMatches(scanText, packageId) {
  const scanKey = normalizePackageScanKey(scanText);
  const packageKey = normalizePackageScanKey(packageId);
  if (!scanKey || !packageKey) return false;
  if (scanKey === packageKey) return true;
  const rawScanText = cleanText(scanText).toUpperCase();
  const rawPackageId = cleanText(packageId).toUpperCase();
  if (!rawScanText || !rawPackageId) return false;
  const escapedPackageId = rawPackageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^0-9A-Z])${escapedPackageId}([^0-9A-Z]|$)`).test(rawScanText);
}

function inferAddressArea(address) {
  const text = cleanText(address);
  if (!text) return "地址待补";
  const firstToken = text.split(/\s+/)[0];
  return firstToken.length > 8 ? firstToken.slice(0, 8) : firstToken;
}

function getDriverOrderTail(line = {}, orderLineId = "") {
  if (line.orderNo && line.lineNo) return getOrderLineShortNo(line);
  const id = cleanText(line.id ?? orderLineId);
  const match = id.match(/ORD-\d{4}-(\d+)-(\d+)/);
  if (match) return `#${match[1]}-${match[2]}`;
  return id.slice(-5);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toApiError(json, status, fallbackMessage) {
  return {
    code: json?.code ?? `HTTP_${status}`,
    message: json?.message ?? fallbackMessage,
    requiredPermission: json?.requiredPermission,
  };
}

function buildServerRequiredWriteError(code, error) {
  return {
    source: "api_error",
    blocked: true,
    error: {
      code,
      message: `生产模式要求后端事务，未执行本地降级：${error?.message ?? String(error)}`,
    },
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}
