import { isOfficeApiServerRequired } from "./officeAuthService.js";
import {
  buildOfficeServerRequiredWriteError as buildServerRequiredWriteError,
  readOfficeApiJson as readJson,
  requestOfficeApi as requestProductionPackingApi,
  toOfficeApiError as toApiError,
} from "./officeApiClientCore.js";

export async function listOfficeProductionTasks(input = {}, options = {}) {
  const { authState, query = {}, operatorId } = input;

  try {
    const response = await requestProductionPackingApi(`/production-tasks${buildQueryString(query)}`, {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        items: [],
        page: 1,
        pageSize: 50,
        total: 0,
        error: toApiError(json, response.status, "生产任务列表 API 返回错误。"),
      };
    }

    return {
      source: "api",
      ...mapProductionTaskListResponse(json),
    };
  } catch (error) {
    return {
      source: "local_fallback",
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
      error: {
        code: "PRODUCTION_TASK_LIST_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function listOfficePackingTasks(input = {}, options = {}) {
  const { authState, query = {}, operatorId } = input;

  try {
    const response = await requestProductionPackingApi(`/packing-tasks${buildQueryString(query)}`, {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        items: [],
        page: 1,
        pageSize: 50,
        total: 0,
        error: toApiError(json, response.status, "打包任务列表 API 返回错误。"),
      };
    }

    return {
      source: "api",
      ...mapPackingTaskListResponse(json),
    };
  } catch (error) {
    return {
      source: "local_fallback",
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
      error: {
        code: "PACKING_TASK_LIST_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function listOfficeProductionMachineQueue(input = {}, options = {}) {
  const { authState, query = {}, operatorId } = input;

  try {
    const response = await requestProductionPackingApi(`/production-schedules/machine-queue${buildQueryString(query)}`, {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        items: [],
        machines: [],
        total: 0,
        error: toApiError(json, response.status, "机台排产队列 API 返回错误。"),
      };
    }

    return {
      source: "api",
      ...mapProductionMachineQueueResponse(json),
    };
  } catch (error) {
    return {
      source: "local_fallback",
      items: [],
      machines: [],
      total: 0,
      error: {
        code: "PRODUCTION_MACHINE_QUEUE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function resequenceOfficeProductionMachineQueue(input = {}, options = {}) {
  const {
    authState,
    machineId,
    orderedProductionTaskIds = [],
    operatorId,
    remark,
  } = input;
  const safeMachineId = cleanText(machineId);
  const safeOrderedProductionTaskIds = Array.isArray(orderedProductionTaskIds)
    ? orderedProductionTaskIds.map(cleanText).filter(Boolean)
    : [];

  if (!safeMachineId || safeOrderedProductionTaskIds.length < 1) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "PRODUCTION_MACHINE_QUEUE_RESEQUENCE_INPUT_INVALID",
        message: "机台和新队列顺序不能为空。",
      },
    };
  }

  try {
    const response = await requestProductionPackingApi("/production-schedules/machine-queue/resequence", {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        machineId: safeMachineId,
        orderedProductionTaskIds: safeOrderedProductionTaskIds,
        operatorId,
        remark: remark || "办公室端调整机台排产队列顺序",
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "机台排产调序 API 返回错误。"),
      };
    }

    return {
      source: "api",
      machineId: cleanText(json?.machineId ?? safeMachineId),
      updatedCount: Math.max(0, Math.trunc(Number(json?.updatedCount ?? 0))),
      updatedAt: cleanText(json?.updatedAt),
      updatedBy: cleanText(json?.updatedBy),
      operationLogId: cleanText(json?.operationLogId),
      inventoryCreated: json?.inventoryCreated === true ? true : false,
      reservationCreated: json?.reservationCreated === true ? true : false,
      packingTaskCreated: json?.packingTaskCreated === true ? true : false,
      ...mapProductionMachineQueueResponse(json),
    };
  } catch (error) {
    return {
      source: "local_fallback",
      blocked: true,
      error: {
        code: "PRODUCTION_MACHINE_QUEUE_RESEQUENCE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function moveOfficeProductionMachineQueueItem(input = {}, options = {}) {
  const {
    authState,
    productionTaskId,
    targetMachineId,
    targetQueueSeq,
    insertBeforeProductionTaskId,
    insertAfterProductionTaskId,
    operatorId,
    remark,
  } = input;
  const safeProductionTaskId = cleanText(productionTaskId);
  const safeTargetMachineId = cleanText(targetMachineId);

  if (!safeProductionTaskId || !safeTargetMachineId) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "PRODUCTION_MACHINE_QUEUE_MOVE_INPUT_INVALID",
        message: "生产任务和目标机台不能为空。",
      },
    };
  }

  try {
    const response = await requestProductionPackingApi("/production-schedules/machine-queue/move", {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        productionTaskId: safeProductionTaskId,
        targetMachineId: safeTargetMachineId,
        targetQueueSeq,
        insertBeforeProductionTaskId: cleanText(insertBeforeProductionTaskId),
        insertAfterProductionTaskId: cleanText(insertAfterProductionTaskId),
        operatorId,
        remark: remark || "办公室端移动机台排产任务",
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "机台排产移动 API 返回错误。"),
      };
    }

    return {
      source: "api",
      productionTaskId: cleanText(json?.productionTaskId ?? safeProductionTaskId),
      sourceMachineId: cleanText(json?.sourceMachineId),
      targetMachineId: cleanText(json?.targetMachineId ?? safeTargetMachineId),
      targetQueueSeq: Math.max(0, Math.trunc(Number(json?.targetQueueSeq ?? 0))),
      updatedCount: Math.max(0, Math.trunc(Number(json?.updatedCount ?? 0))),
      updatedAt: cleanText(json?.updatedAt),
      updatedBy: cleanText(json?.updatedBy),
      operationLogId: cleanText(json?.operationLogId),
      productionTask: normalizeProductionTaskDetail(json?.productionTask),
      inventoryCreated: json?.inventoryCreated === true ? true : false,
      reservationCreated: json?.reservationCreated === true ? true : false,
      packingTaskCreated: json?.packingTaskCreated === true ? true : false,
      ...mapProductionMachineQueueResponse(json),
    };
  } catch (error) {
    return {
      source: "local_fallback",
      blocked: true,
      error: {
        code: "PRODUCTION_MACHINE_QUEUE_MOVE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function getOfficeProductionTaskDetail(input = {}, options = {}) {
  const {
    authState,
    productionTaskId,
    orderLine,
    reportResult,
    inventoryItem,
    operatorId,
  } = input;
  const safeProductionTaskId = cleanText(productionTaskId ?? reportResult?.productionTaskId);

  if (!safeProductionTaskId) {
    return {
      source: "api_error",
      blocked: true,
      detail: null,
      error: {
        code: "PRODUCTION_TASK_DETAIL_INPUT_INVALID",
        message: "生产任务 ID 不能为空。",
      },
    };
  }

  try {
    const response = await requestProductionPackingApi(`/production-tasks/${encodeURIComponent(safeProductionTaskId)}`, {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        detail: null,
        error: toApiError(json, response.status, "生产任务详情 API 返回错误。"),
      };
    }

    return {
      source: "api",
      detail: mapProductionTaskDetailResponse(json, {
        productionTaskId: safeProductionTaskId,
        orderLine,
        reportResult,
        inventoryItem,
      }),
    };
  } catch (error) {
    return {
      source: "local_fallback",
      detail: mapProductionTaskDetailResponse(null, {
        productionTaskId: safeProductionTaskId,
        orderLine,
        reportResult,
        inventoryItem,
      }),
      error: {
        code: "PRODUCTION_TASK_DETAIL_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function getOfficePackingTaskDetail(input = {}, options = {}) {
  const {
    authState,
    packingTask,
    packingTaskId = packingTask?.packingTaskId ?? packingTask?.id,
    orderLine,
    inventoryItem,
    operatorId,
  } = input;
  const safePackingTaskId = cleanText(packingTaskId);

  if (!safePackingTaskId) {
    return {
      source: "api_error",
      blocked: true,
      detail: null,
      error: {
        code: "PACKING_TASK_DETAIL_INPUT_INVALID",
        message: "打包任务 ID 不能为空。",
      },
    };
  }

  try {
    const response = await requestProductionPackingApi(`/packing-tasks/${encodeURIComponent(safePackingTaskId)}`, {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        detail: null,
        error: toApiError(json, response.status, "打包任务详情 API 返回错误。"),
      };
    }

    return {
      source: "api",
      detail: mapPackingTaskDetailResponse(json, {
        packingTask,
        packingTaskId: safePackingTaskId,
        orderLine,
        inventoryItem,
      }),
    };
  } catch (error) {
    return {
      source: "local_fallback",
      detail: mapPackingTaskDetailResponse(null, {
        packingTask,
        packingTaskId: safePackingTaskId,
        orderLine,
        inventoryItem,
      }),
      error: {
        code: "PACKING_TASK_DETAIL_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function publishOfficeProductionSchedule(input = {}, options = {}) {
  const {
    authState,
    orderLine,
    productionTaskId = buildProductionTaskId(orderLine),
    machineId = getProductionMachineId(orderLine),
    processType = getProductionProcessType(orderLine),
    plannedQty = orderLine?.qty ?? orderLine?.originalQty ?? 0,
    operatorId,
    publishedAt,
    remark = "",
  } = input;
  const safeProductionTaskId = cleanText(productionTaskId);
  const safeOrderLineId = cleanText(orderLine?.id ?? orderLine?.orderLineId ?? input.orderLineId);
  const safePlannedQty = Math.trunc(Number(plannedQty ?? 0));

  if (!safeProductionTaskId || !safeOrderLineId || !Number.isFinite(safePlannedQty) || safePlannedQty <= 0) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "PRODUCTION_SCHEDULE_PUBLISH_INPUT_INVALID",
        message: "生产任务、订单明细和计划数量不能为空。",
      },
    };
  }

  try {
    const response = await requestProductionPackingApi(`/production-tasks/${encodeURIComponent(safeProductionTaskId)}/publish-schedule`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        processType,
        machineId,
        plannedQty: safePlannedQty,
        operatorId,
        publishedAt: publishedAt ?? new Date().toISOString(),
        remark: remark || "办公室端发布排产到车间任务池",
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "发布排产 API 返回错误。"),
      };
    }

    return {
      source: "api",
      ...mapProductionSchedulePublishResponse(json, {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        machineId,
        processType,
        plannedQty: safePlannedQty,
      }),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("PRODUCTION_SCHEDULE_PUBLISH_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "PRODUCTION_SCHEDULE_PUBLISH_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      ...mapProductionSchedulePublishResponse(null, {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        machineId,
        processType,
        plannedQty: safePlannedQty,
      }),
    };
  }
}

export async function reportOfficeProductionComplete(input = {}, options = {}) {
  const {
    authState,
    orderLine,
    productionTaskId = buildProductionTaskId(orderLine),
    inventoryItem,
    inventoryItemId = inventoryItem?.id,
    qualifiedQty = orderLine?.qty ?? 0,
    exceptionQty = 0,
    machineCount,
    operatorId,
    createPackingTask = true,
    remark = "",
  } = input;
  const safeProductionTaskId = cleanText(productionTaskId);
  const safeOrderLineId = cleanText(orderLine?.id ?? orderLine?.orderLineId);
  const safeQualifiedQty = Math.trunc(Number(qualifiedQty ?? 0));

  if (!safeProductionTaskId || !safeOrderLineId || !Number.isFinite(safeQualifiedQty) || safeQualifiedQty <= 0) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "PRODUCTION_REPORT_INPUT_INVALID",
        message: "生产任务、订单明细和合格数量不能为空。",
      },
    };
  }

  try {
    const response = await requestProductionPackingApi(`/production-tasks/${encodeURIComponent(safeProductionTaskId)}/report-complete`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        processType: getProductionProcessType(orderLine),
        machineId: getProductionMachineId(orderLine),
        plannedQty: Number(orderLine?.qty ?? orderLine?.originalQty ?? safeQualifiedQty),
        qualifiedQty: safeQualifiedQty,
        exceptionQty: Math.max(0, Math.trunc(Number(exceptionQty ?? 0))),
        machineCount: machineCount === "" || machineCount == null ? undefined : Math.trunc(Number(machineCount)),
        inventoryItemId: cleanText(inventoryItemId),
        createPackingTask,
        operatorId,
        completedAt: new Date().toISOString(),
        remark: remark || "办公室端提交生产报工完成",
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "生产报工 API 返回错误。"),
      };
    }

    return {
      source: "api",
      ...mapProductionReportResponse(json, {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        qualifiedQty: safeQualifiedQty,
        machineCount,
        inventoryItemId,
      }),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("PRODUCTION_REPORT_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "PRODUCTION_REPORT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      ...mapProductionReportResponse(null, {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        qualifiedQty: safeQualifiedQty,
        machineCount,
        inventoryItemId,
      }),
    };
  }
}

export async function reportOfficeProductionDailyProgress(input = {}, options = {}) {
  const {
    authState,
    orderLine,
    productionTaskId = buildProductionTaskId(orderLine),
    dailyQualifiedQty = input.qualifiedQty ?? 0,
    exceptionQty = 0,
    machineCount,
    operatorId,
    reportedAt,
    progressDate,
    remark = "",
  } = input;
  const safeProductionTaskId = cleanText(productionTaskId);
  const safeOrderLineId = cleanText(orderLine?.id ?? orderLine?.orderLineId ?? input.orderLineId);
  const safeDailyQualifiedQty = Math.trunc(Number(dailyQualifiedQty ?? 0));

  if (!safeProductionTaskId || !safeOrderLineId || !Number.isFinite(safeDailyQualifiedQty) || safeDailyQualifiedQty <= 0) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "PRODUCTION_DAILY_PROGRESS_INPUT_INVALID",
        message: "生产任务、订单明细和当日合格数量不能为空。",
      },
    };
  }

  try {
    const response = await requestProductionPackingApi(`/production-tasks/${encodeURIComponent(safeProductionTaskId)}/daily-progress`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        processType: getProductionProcessType(orderLine),
        machineId: getProductionMachineId(orderLine),
        plannedQty: Number(orderLine?.qty ?? orderLine?.originalQty ?? safeDailyQualifiedQty),
        dailyQualifiedQty: safeDailyQualifiedQty,
        exceptionQty: Math.max(0, Math.trunc(Number(exceptionQty ?? 0))),
        machineCount: machineCount === "" || machineCount == null ? undefined : Math.trunc(Number(machineCount)),
        operatorId,
        reportedAt: reportedAt ?? new Date().toISOString(),
        progressDate,
        remark: remark || "办公室端提交生产跨日当日报数",
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "生产跨日报数 API 返回错误。"),
      };
    }

    return {
      source: "api",
      ...mapProductionDailyProgressResponse(json, {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        dailyQualifiedQty: safeDailyQualifiedQty,
        machineCount,
      }),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("PRODUCTION_DAILY_PROGRESS_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "PRODUCTION_DAILY_PROGRESS_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      ...mapProductionDailyProgressResponse(null, {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        dailyQualifiedQty: safeDailyQualifiedQty,
        machineCount,
      }),
    };
  }
}

export async function uploadOfficeProductionFinishedGoodsPhoto(input = {}, options = {}) {
  const {
    authState,
    orderLine,
    productionTaskId = buildProductionTaskId(orderLine),
    attachmentId,
    fileName = "",
    operatorId,
    uploadedAt,
    remark = "",
  } = input;
  const safeProductionTaskId = cleanText(productionTaskId);
  const safeOrderLineId = cleanText(orderLine?.id ?? orderLine?.orderLineId ?? input.orderLineId);
  const safeAttachmentId = cleanText(attachmentId);

  if (!safeProductionTaskId || !safeOrderLineId || !safeAttachmentId) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "PRODUCTION_FINISHED_GOODS_PHOTO_INPUT_INVALID",
        message: "生产任务、订单明细和成品图附件不能为空。",
      },
    };
  }

  try {
    const response = await requestProductionPackingApi(`/production-tasks/${encodeURIComponent(safeProductionTaskId)}/finished-goods-photo`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        attachmentId: safeAttachmentId,
        fileName: cleanText(fileName),
        operatorId,
        uploadedAt: uploadedAt ?? new Date().toISOString(),
        remark: remark || "上传定制印刷成品图",
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "成品图上传 API 返回错误。"),
      };
    }

    return {
      source: "api",
      ...mapProductionFinishedGoodsPhotoResponse(json, {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        attachmentId: safeAttachmentId,
        fileName,
      }),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("PRODUCTION_FINISHED_GOODS_PHOTO_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "PRODUCTION_FINISHED_GOODS_PHOTO_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      ...mapProductionFinishedGoodsPhotoResponse(null, {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        attachmentId: safeAttachmentId,
        fileName,
        status: "待确认",
      }),
    };
  }
}

export async function reviewOfficeProductionFinishedGoodsPhoto(input = {}, options = {}) {
  const {
    authState,
    orderLine,
    productionTaskId = buildProductionTaskId(orderLine),
    reviewStatus,
    reason = "",
    operatorId,
    reviewedAt,
  } = input;
  const safeProductionTaskId = cleanText(productionTaskId);
  const safeOrderLineId = cleanText(orderLine?.id ?? orderLine?.orderLineId ?? input.orderLineId);
  const safeReviewStatus = cleanText(reviewStatus);

  if (!safeProductionTaskId || !safeOrderLineId || !safeReviewStatus) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "PRODUCTION_FINISHED_GOODS_PHOTO_REVIEW_INPUT_INVALID",
        message: "生产任务、订单明细和复核结果不能为空。",
      },
    };
  }

  try {
    const response = await requestProductionPackingApi(`/production-tasks/${encodeURIComponent(safeProductionTaskId)}/finished-goods-photo-review`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        reviewStatus: safeReviewStatus,
        reason: cleanText(reason),
        operatorId,
        reviewedAt: reviewedAt ?? new Date().toISOString(),
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "成品图复核 API 返回错误。"),
      };
    }

    return {
      source: "api",
      ...mapProductionFinishedGoodsPhotoResponse(json, {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        status: safeReviewStatus,
      }),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("PRODUCTION_FINISHED_GOODS_PHOTO_REVIEW_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "PRODUCTION_FINISHED_GOODS_PHOTO_REVIEW_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      ...mapProductionFinishedGoodsPhotoResponse(null, {
        productionTaskId: safeProductionTaskId,
        orderLineId: safeOrderLineId,
        status: safeReviewStatus,
      }),
    };
  }
}

export async function completeOfficePackingTask(input = {}, options = {}) {
  const {
    authState,
    packingTask,
    packingTaskId = packingTask?.packingTaskId ?? packingTask?.id,
    orderLine,
    orderLineId = packingTask?.orderLineId ?? orderLine?.id,
    inventoryItem,
    inventoryItemId = inventoryItem?.id,
    actualPackedQty = packingTask?.plannedQty ?? orderLine?.qty ?? 0,
    packageCount = packingTask?.packageCount ?? 1,
    labelsPrinted = false,
    operatorId,
    remark = "",
  } = input;
  const safePackingTaskId = cleanText(packingTaskId);
  const safeOrderLineId = cleanText(orderLineId);
  const safeActualPackedQty = Math.trunc(Number(actualPackedQty ?? 0));
  const safePackageCount = Math.max(1, Math.trunc(Number(packageCount || 1)));

  if (!safePackingTaskId || !safeOrderLineId || !Number.isFinite(safeActualPackedQty) || safeActualPackedQty <= 0) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "PACKING_COMPLETE_INPUT_INVALID",
        message: "打包任务、订单明细和实际打包数量不能为空。",
      },
    };
  }

  try {
    const response = await requestProductionPackingApi(`/packing-tasks/${encodeURIComponent(safePackingTaskId)}/complete`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        packingTaskId: safePackingTaskId,
        orderLineId: safeOrderLineId,
        actualPackedQty: safeActualPackedQty,
        packageCount: safePackageCount,
        labelsPrinted,
        inventoryItemId: cleanText(inventoryItemId),
        operatorId,
        completedAt: new Date().toISOString(),
        remark: remark || "办公室端提交打包完成",
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "打包完成 API 返回错误。"),
      };
    }

    return {
      source: "api",
      ...mapPackingCompleteResponse(json, {
        packingTaskId: safePackingTaskId,
        orderLineId: safeOrderLineId,
        actualPackedQty: safeActualPackedQty,
        packageCount: safePackageCount,
        labelsPrinted,
      }),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("PACKING_COMPLETE_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      error: {
        code: "PACKING_COMPLETE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      ...mapPackingCompleteResponse(null, {
        packingTaskId: safePackingTaskId,
        orderLineId: safeOrderLineId,
        actualPackedQty: safeActualPackedQty,
        packageCount: safePackageCount,
        labelsPrinted,
      }),
    };
  }
}

export function buildProductionTaskId(orderLine) {
  const orderLineId = cleanText(orderLine?.id ?? orderLine?.orderLineId);
  return orderLineId ? `PT-${orderLineId}` : "";
}

export function buildPackingTaskId(orderLine) {
  const orderLineId = cleanText(orderLine?.id ?? orderLine?.orderLineId);
  return orderLineId ? `PKT-${orderLineId}` : "";
}

export function getProductionProcessType(orderLine) {
  const status = cleanText(orderLine?.status ?? orderLine?.lineStatus);
  if (status.includes("丝印") || status.includes("补印")) return "丝印";
  return "制袋";
}

export function getProductionMachineId(orderLine) {
  return getProductionProcessType(orderLine) === "丝印" ? "PRINT-01" : "BAG-01";
}

export function findProductionInventoryItem(orderLine, inventoryRecords = []) {
  const matches = inventoryRecords.filter((item) =>
    cleanText(item.size) === cleanText(orderLine?.size) &&
    cleanText(item.color) === cleanText(orderLine?.color) &&
    cleanText(item.handle) === cleanText(orderLine?.handle) &&
    cleanText(item.style) === cleanText(orderLine?.style),
  );
  if (!matches.length) return null;
  if (cleanText(orderLine?.fulfillment) === "快递快运") {
    return matches.find((item) => cleanText(item.zone).includes("快运")) ?? matches[0];
  }
  return matches.find((item) => cleanText(item.zone).includes("打包")) ?? matches[0];
}

function mapProductionReportResponse(json, fallback = {}) {
  const machineCount = json?.machineCount ?? fallback.machineCount;
  return {
    productionTaskId: cleanText(json?.productionTaskId ?? fallback.productionTaskId),
    reportId: cleanText(json?.reportId) || `WR-${fallback.productionTaskId}-LOCAL`,
    orderLineId: cleanText(json?.orderLineId ?? fallback.orderLineId),
    status: cleanText(json?.status) || "已完成",
    orderLineStatus: cleanText(json?.orderLineStatus) || "待打包",
    qualifiedQty: Math.trunc(Number(json?.qualifiedQty ?? fallback.qualifiedQty ?? 0)),
    machineCount: machineCount === "" || machineCount == null ? null : Math.trunc(Number(machineCount)),
    machineCountAffectsInventory: json?.machineCountAffectsInventory === true ? true : false,
    capacityCalibrationCreated: json?.capacityCalibrationCreated === true,
    capacityBaselineId: cleanText(json?.capacityBaselineId ?? json?.capacityCalibration?.capacityBaselineId),
    capacityCalibration: normalizeCapacityCalibration(json?.capacityCalibration),
    inventoryItemId: cleanText(json?.inventoryItemId ?? fallback.inventoryItemId),
    reservationId: cleanText(json?.reservationId) || `RSV-${fallback.productionTaskId}-LOCAL`,
    packingTaskId: cleanText(json?.packingTaskId) || buildPackingTaskId({ id: fallback.orderLineId }),
    inventoryLedgerIds: Array.isArray(json?.inventoryLedgerIds) ? json.inventoryLedgerIds : [],
    operationLogId: cleanText(json?.operationLogId),
  };
}

function mapProductionSchedulePublishResponse(json, fallback = {}) {
  const productionTask = normalizeProductionTaskDetail(json?.productionTask, {
    productionTaskId: json?.productionTaskId ?? fallback.productionTaskId,
    orderLineId: json?.orderLineId ?? fallback.orderLineId,
  });
  return {
    productionTaskId: cleanText(json?.productionTaskId ?? productionTask.productionTaskId ?? fallback.productionTaskId),
    orderLineId: cleanText(json?.orderLineId ?? productionTask.orderLineId ?? fallback.orderLineId),
    publishedScheduleId:
      cleanText(json?.publishedScheduleId ?? productionTask.publishedScheduleId) ||
      (json ? "" : `SCH-${fallback.machineId || "BAG-01"}-${fallback.productionTaskId || "LOCAL"}`),
    status: cleanText(json?.status ?? json?.taskStatus ?? productionTask.taskStatus) || `${fallback.processType || "制袋"}已排产`,
    taskStatus: cleanText(json?.taskStatus ?? json?.status ?? productionTask.taskStatus) || `${fallback.processType || "制袋"}已排产`,
    orderLineStatus: cleanText(json?.orderLineStatus ?? json?.orderLine?.lineStatus) || `${fallback.processType || "制袋"}已排产`,
    taskType: cleanText(json?.taskType ?? productionTask.taskType) || fallback.processType || "制袋",
    machineId: cleanText(json?.machineId ?? productionTask.machineId) || fallback.machineId || "",
    plannedQty: Math.trunc(Number(json?.plannedQty ?? productionTask.plannedQty ?? fallback.plannedQty ?? 0)),
    publishedAt: cleanText(json?.publishedAt),
    productionTask,
    inventoryCreated: json?.inventoryCreated === true ? true : false,
    reservationCreated: json?.reservationCreated === true ? true : false,
    packingTaskCreated: json?.packingTaskCreated === true ? true : false,
    operationLogId: cleanText(json?.operationLogId),
  };
}

function normalizeCapacityCalibration(value) {
  if (!value || typeof value !== "object") return null;
  const capacityBaselineId = cleanText(value.capacityBaselineId ?? value.id);
  return {
    capacityBaselineId,
    machineId: cleanText(value.machineId),
    sizeKey: cleanText(value.sizeKey),
    dailyCapacityQty: Math.trunc(Number(value.dailyCapacityQty ?? 0)),
    sourceKind: cleanText(value.sourceKind),
    confidence: cleanText(value.confidence),
    effectiveFrom: cleanText(value.effectiveFrom),
  };
}

function mapProductionDailyProgressResponse(json, fallback = {}) {
  const dailyQualifiedQty = Math.trunc(Number(json?.dailyQualifiedQty ?? fallback.dailyQualifiedQty ?? 0));
  const machineCount = json?.machineCount ?? fallback.machineCount;
  return {
    productionTaskId: cleanText(json?.productionTaskId ?? fallback.productionTaskId),
    reportId: cleanText(json?.reportId),
    orderLineId: cleanText(json?.orderLineId ?? fallback.orderLineId),
    status: cleanText(json?.status ?? json?.taskStatus) || (json ? "" : "跨日继续"),
    taskStatus: cleanText(json?.taskStatus ?? json?.status) || (json ? "" : "跨日继续"),
    plannedQty: Math.trunc(Number(json?.plannedQty ?? 0)),
    progressDate: cleanText(json?.progressDate ?? json?.progress_date),
    dailyQualifiedQty,
    previousQualifiedQty: Math.max(0, Math.trunc(Number(json?.previousQualifiedQty ?? 0))),
    cumulativeQualifiedQty: Math.max(dailyQualifiedQty, Math.trunc(Number(json?.cumulativeQualifiedQty ?? dailyQualifiedQty))),
    remainingQty: Math.max(0, Math.trunc(Number(json?.remainingQty ?? 0))),
    carryOver: json?.carryOver === true || json?.carry_over === true,
    nextWorkDate: cleanText(json?.nextWorkDate ?? json?.next_work_date),
    machineCount: machineCount === undefined || machineCount === null || machineCount === "" ? null : Math.trunc(Number(machineCount)),
    machineCountAffectsInventory: false,
    inventoryCreated: false,
    reservationCreated: false,
    packingTaskCreated: false,
    operationLogId: cleanText(json?.operationLogId),
  };
}

function mapProductionFinishedGoodsPhotoResponse(json, fallback = {}) {
  const status = cleanText(json?.finishedGoodsPhoto?.status ?? json?.status ?? fallback.status) || "待确认";
  return {
    productionTaskId: cleanText(json?.productionTaskId ?? fallback.productionTaskId),
    orderLineId: cleanText(json?.orderLineId ?? fallback.orderLineId),
    status,
    finishedGoodsPhoto: normalizeFinishedGoodsPhotoSummary(json?.finishedGoodsPhoto, {
      status,
      attachmentId: fallback.attachmentId,
      fileName: fallback.fileName,
    }),
    productionTask: normalizeProductionTaskDetail(json?.productionTask, {
      productionTaskId: json?.productionTaskId ?? fallback.productionTaskId,
      orderLineId: json?.orderLineId ?? fallback.orderLineId,
    }),
    orderLine: json?.orderLine ?? null,
    todo: normalizeTodoSummary(json?.todo),
    customerNotificationTodoCreated: json?.customerNotificationTodoCreated === true,
    retakeTodoCreated: json?.retakeTodoCreated === true,
    inventoryCreated: json?.inventoryCreated === true ? true : false,
    reservationCreated: json?.reservationCreated === true ? true : false,
    packingTaskCreated: json?.packingTaskCreated === true ? true : false,
    operationLogId: cleanText(json?.operationLogId),
  };
}

function mapPackingCompleteResponse(json, fallback = {}) {
  const packageIds = Array.isArray(json?.packageIds)
    ? json.packageIds
    : Array.from({ length: Math.max(1, Math.trunc(Number(fallback.packageCount || 1))) }, (_, index) => `PKG-${fallback.packingTaskId}-${index + 1}`);
  return {
    packingTaskId: cleanText(json?.packingTaskId ?? fallback.packingTaskId),
    orderLineId: cleanText(json?.orderLineId ?? fallback.orderLineId),
    status: cleanText(json?.status) || "已完成",
    actualPackedQty: Math.trunc(Number(json?.actualPackedQty ?? fallback.actualPackedQty ?? 0)),
    packageIds,
    packageCount: packageIds.length,
    fulfillmentId: cleanText(json?.fulfillmentId),
    fulfillmentStatus: cleanText(json?.fulfillmentStatus) || (fallback.labelsPrinted ? "待确认拉走" : "待打印标签"),
    orderLineStatus: cleanText(json?.orderLineStatus) || (fallback.labelsPrinted ? "待快运拉走" : "待打印标签"),
    inventoryDeducted: json?.inventoryDeducted === true,
    inventoryLedgerIds: Array.isArray(json?.inventoryLedgerIds) ? json.inventoryLedgerIds : [],
    operationLogId: cleanText(json?.operationLogId),
  };
}

function mapProductionTaskListResponse(json) {
  const items = Array.isArray(json?.items)
    ? json.items.map((item) => mapProductionTaskDetailResponse({
        ...item,
        reports: Array.isArray(item?.reports)
          ? item.reports
          : item?.latestReport
            ? [item.latestReport]
            : [],
      })).filter((item) => item.productionTaskId)
    : [];
  return {
    items,
    page: Math.max(1, Math.trunc(Number(json?.page ?? 1))),
    pageSize: Math.max(1, Math.trunc(Number(json?.pageSize ?? 50))),
    total: Math.trunc(Number(json?.total ?? items.length)),
  };
}

function mapPackingTaskListResponse(json) {
  const items = Array.isArray(json?.items)
    ? json.items.map((item) => {
        const detail = mapPackingTaskDetailResponse(item);
        const packageCount = Math.max(
          detail.packages.length,
          Math.trunc(Number(item?.packageCount ?? detail.packingTask?.packageCount ?? 0)),
        );
        return {
          ...detail,
          packageCount,
          packingTask: detail.packingTask
            ? {
                ...detail.packingTask,
                packageCount,
              }
            : null,
        };
      }).filter((item) => item.packingTaskId)
    : [];
  return {
    items,
    page: Math.max(1, Math.trunc(Number(json?.page ?? 1))),
    pageSize: Math.max(1, Math.trunc(Number(json?.pageSize ?? 50))),
    total: Math.trunc(Number(json?.total ?? items.length)),
  };
}

function mapProductionMachineQueueResponse(json) {
  const items = Array.isArray(json?.items)
    ? json.items.map(normalizeProductionMachineQueueItem).filter((item) => item.productionTaskId)
    : [];
  const productionScheduleRecords = Array.isArray(json?.productionScheduleRecords)
    ? json.productionScheduleRecords.map(normalizeProductionScheduleRecord).filter((item) => item.productionTaskId)
    : [];
  const machines = Array.isArray(json?.machines)
    ? json.machines.map((machine) => ({
        machineId: cleanText(machine?.machineId),
        machineLabel: cleanText(machine?.machineLabel ?? machine?.machineId),
        total: Math.max(0, Math.trunc(Number(machine?.total ?? 0))),
        plannedQty: Math.max(0, Math.trunc(Number(machine?.plannedQty ?? 0))),
        remainingQty: Math.max(0, Math.trunc(Number(machine?.remainingQty ?? 0))),
        items: Array.isArray(machine?.items)
          ? machine.items.map(normalizeProductionMachineQueueItem).filter((item) => item.productionTaskId)
          : [],
      })).filter((machine) => machine.machineId)
    : [];
  return {
    items,
    machines,
    productionScheduleRecords,
    total: Math.trunc(Number(json?.total ?? items.length)),
    generatedAt: cleanText(json?.generatedAt),
    note: cleanText(json?.note),
  };
}

function normalizeProductionMachineQueueItem(item) {
  const dailyProgress = normalizeProductionDailyProgressDetail(item?.dailyProgress ?? item?.daily_progress);
  return {
    scheduleRecordId: cleanText(item?.scheduleRecordId),
    queueSeq: Math.max(0, Math.trunc(Number(item?.queueSeq ?? 0))),
    machineId: cleanText(item?.machineId),
    machineLabel: cleanText(item?.machineLabel ?? item?.machineId),
    publishedScheduleId: cleanText(item?.publishedScheduleId),
    productionTaskId: cleanText(item?.productionTaskId),
    orderLineId: cleanText(item?.orderLineId),
    taskType: cleanText(item?.taskType),
    status: cleanText(item?.status ?? item?.taskStatus),
    taskStatus: cleanText(item?.taskStatus ?? item?.status),
    queueReason: cleanText(item?.queueReason),
    customerId: cleanText(item?.customerId),
    customerName: cleanText(item?.customerName),
    productName: cleanText(item?.productName),
    size: cleanText(item?.size),
    bagColor: cleanText(item?.bagColor),
    handleType: cleanText(item?.handleType),
    style: cleanText(item?.style),
    plannedQty: Math.max(0, Math.trunc(Number(item?.plannedQty ?? 0))),
    remainingQty: Math.max(0, Math.trunc(Number(item?.remainingQty ?? dailyProgress?.remainingQty ?? 0))),
    dailyProgress,
    manualQueueSeq: Math.max(0, Math.trunc(Number(item?.manualQueueSeq ?? item?.manual_queue_seq ?? 0))),
    sequenceUpdatedAt: cleanText(item?.sequenceUpdatedAt ?? item?.sequence_updated_at),
    sequenceUpdatedBy: cleanText(item?.sequenceUpdatedBy ?? item?.sequence_updated_by),
    sequenceRemark: cleanText(item?.sequenceRemark ?? item?.sequence_remark),
    scheduleRecordSource: cleanText(item?.scheduleRecordSource ?? item?.schedule_record_source),
    createdAt: cleanText(item?.createdAt),
  };
}

function normalizeProductionScheduleRecord(item) {
  return {
    scheduleRecordId: cleanText(item?.scheduleRecordId ?? item?.id),
    productionTaskId: cleanText(item?.productionTaskId),
    orderLineId: cleanText(item?.orderLineId),
    publishedScheduleId: cleanText(item?.publishedScheduleId),
    machineId: cleanText(item?.machineId),
    queueSeq: Math.max(0, Math.trunc(Number(item?.queueSeq ?? 0))),
    status: cleanText(item?.status ?? item?.scheduleStatus),
    source: cleanText(item?.source ?? item?.sourceKind),
    sourceKind: cleanText(item?.sourceKind ?? item?.source),
    sequenceUpdatedAt: cleanText(item?.sequenceUpdatedAt ?? item?.updatedAt),
    sequenceUpdatedBy: cleanText(item?.sequenceUpdatedBy ?? item?.updatedBy),
    remark: cleanText(item?.remark),
    createdBy: cleanText(item?.createdBy),
    createdAt: cleanText(item?.createdAt),
    updatedBy: cleanText(item?.updatedBy ?? item?.sequenceUpdatedBy),
    updatedAt: cleanText(item?.updatedAt ?? item?.sequenceUpdatedAt),
  };
}

function mapProductionTaskDetailResponse(json, fallback = {}) {
  const orderLineId = cleanText(json?.orderLineId ?? fallback.orderLine?.id ?? fallback.orderLine?.orderLineId ?? fallback.reportResult?.orderLineId);
  const report = normalizeProductionReportDetail(json?.latestReport ?? json?.reports?.[0] ?? fallback.reportResult);
  const productionTaskId = cleanText(json?.productionTaskId ?? fallback.productionTaskId ?? report.productionTaskId);
  return {
    productionTaskId,
    orderLineId,
    productionTask: normalizeProductionTaskDetail(json?.productionTask, {
      productionTaskId,
      orderLineId,
      orderLine: fallback.orderLine,
    }),
    orderLine: json?.orderLine ?? normalizeOrderLineDetail(fallback.orderLine),
    finishedGoodsPhoto: normalizeFinishedGoodsPhotoSummary(json?.finishedGoodsPhoto ?? json?.productionTask?.finishedGoodsPhoto),
    reports: Array.isArray(json?.reports)
      ? json.reports.map(normalizeProductionReportDetail)
      : report.reportId
        ? [report]
        : [],
    latestReport: report.reportId ? report : null,
    dailyProgress: normalizeProductionDailyProgressDetail(json?.dailyProgress ?? json?.daily_progress),
    packingTask: normalizePackingTaskDetail(json?.packingTask, {
      packingTaskId: fallback.reportResult?.packingTaskId,
      orderLineId,
      plannedQty: fallback.reportResult?.qualifiedQty,
    }),
    inventoryItem: json?.inventoryItem ?? normalizeInventoryItemDetail(fallback.inventoryItem),
    reservations: Array.isArray(json?.reservations) ? json.reservations : [],
    inventoryLedgerEntries: Array.isArray(json?.inventoryLedgerEntries) ? json.inventoryLedgerEntries : [],
    operationLogs: Array.isArray(json?.operationLogs) ? json.operationLogs : [],
  };
}

function mapPackingTaskDetailResponse(json, fallback = {}) {
  const packingTask = normalizePackingTaskDetail(json?.packingTask ?? fallback.packingTask, {
    packingTaskId: fallback.packingTaskId,
    orderLineId: fallback.orderLine?.id ?? fallback.orderLine?.orderLineId,
    plannedQty: fallback.orderLine?.qty,
  });
  return {
    packingTaskId: cleanText(json?.packingTaskId ?? packingTask.packingTaskId ?? fallback.packingTaskId),
    orderLineId: cleanText(json?.orderLineId ?? packingTask.orderLineId ?? fallback.orderLine?.id ?? fallback.orderLine?.orderLineId),
    packingTask,
    orderLine: json?.orderLine ?? normalizeOrderLineDetail(fallback.orderLine),
    packages: Array.isArray(json?.packages) ? json.packages : [],
    fulfillment: json?.fulfillment ?? null,
    inventoryItem: json?.inventoryItem ?? normalizeInventoryItemDetail(fallback.inventoryItem),
    inventoryLedgerEntries: Array.isArray(json?.inventoryLedgerEntries) ? json.inventoryLedgerEntries : [],
    operationLogs: Array.isArray(json?.operationLogs) ? json.operationLogs : [],
    inventoryDeducted: json?.inventoryDeducted === true ? true : false,
  };
}

function normalizeProductionTaskDetail(task, fallback = {}) {
  const productionTaskId = cleanText(task?.productionTaskId ?? task?.id ?? fallback.productionTaskId);
  return {
    productionTaskId,
    bizNo: cleanText(task?.bizNo) || productionTaskId,
    orderLineId: cleanText(task?.orderLineId ?? task?.lineId ?? fallback.orderLineId),
    taskType: cleanText(task?.taskType ?? task?.processType) || getProductionProcessType(fallback.orderLine),
    machineId: cleanText(task?.machineId),
    publishedScheduleId: cleanText(task?.publishedScheduleId),
    plannedQty: Math.trunc(Number(task?.plannedQty ?? task?.qty ?? fallback.orderLine?.qty ?? 0)),
    taskStatus: cleanText(task?.taskStatus ?? task?.status),
    status: cleanText(task?.status ?? task?.taskStatus),
    finishedGoodsPhoto: normalizeFinishedGoodsPhotoSummary(task?.finishedGoodsPhoto),
    createdBy: cleanText(task?.createdBy),
    createdAt: cleanText(task?.createdAt),
  };
}

function normalizeFinishedGoodsPhotoSummary(value, fallback = {}) {
  if (!value && !fallback.attachmentId && !fallback.status) return null;
  const source = value && typeof value === "object" ? value : {};
  return {
    status: cleanText(source.status ?? fallback.status) || "未上传",
    required: source.required === true || fallback.required === true,
    attachmentId: cleanText(source.attachmentId ?? fallback.attachmentId),
    fileName: cleanText(source.fileName ?? fallback.fileName),
    uploadedAt: cleanText(source.uploadedAt),
    uploadedBy: cleanText(source.uploadedBy),
    reviewedAt: cleanText(source.reviewedAt),
    reviewedBy: cleanText(source.reviewedBy),
    rejectedReason: cleanText(source.rejectedReason),
    history: Array.isArray(source.history) ? source.history : [],
  };
}

function normalizeTodoSummary(value) {
  if (!value || typeof value !== "object") return null;
  return {
    todoId: cleanText(value.todoId ?? value.id),
    type: cleanText(value.type),
    customerId: cleanText(value.customerId),
    refType: cleanText(value.refType),
    refId: cleanText(value.refId ?? value.ref),
    handled: value.handled === true,
    summary: cleanText(value.summary),
    latest: cleanText(value.latestNeededAt ?? value.latest),
    urgency: cleanText(value.urgency),
    impact: cleanText(value.impact),
    notificationCopyText: cleanText(value.notificationCopyText),
    notificationChannel: cleanText(value.notificationChannel),
    notificationStatus: cleanText(value.notificationStatus),
    photoPrompt: cleanText(value.photoPrompt),
  };
}

function normalizeProductionReportDetail(report) {
  const machineCount = report?.machineCount;
  return {
    reportId: cleanText(report?.reportId),
    productionTaskId: cleanText(report?.productionTaskId),
    orderLineId: cleanText(report?.orderLineId),
    processType: cleanText(report?.processType),
    machineId: cleanText(report?.machineId),
    operatorId: cleanText(report?.operatorId),
    qualifiedQty: Math.trunc(Number(report?.qualifiedQty ?? 0)),
    exceptionQty: Math.max(0, Math.trunc(Number(report?.exceptionQty ?? 0))),
    machineCount: machineCount === undefined || machineCount === null || machineCount === "" ? null : Math.trunc(Number(machineCount)),
    machineCountAffectsInventory: false,
    completedAt: cleanText(report?.completedAt ?? report?.createdAt),
    createdAt: cleanText(report?.createdAt ?? report?.completedAt),
    remark: cleanText(report?.remark),
    evidence: report?.evidence ?? {},
  };
}

function normalizeProductionDailyProgressDetail(progress) {
  if (!progress || typeof progress !== "object") return null;
  const latestReportId = cleanText(progress.latestReportId ?? progress.latest_report_id);
  const cumulativeQualifiedQty = Math.max(0, Math.trunc(Number(progress.cumulativeQualifiedQty ?? progress.cumulative_qualified_qty ?? 0)));
  const remainingQty = Math.max(0, Math.trunc(Number(progress.remainingQty ?? progress.remaining_qty ?? 0)));
  if (!latestReportId && cumulativeQualifiedQty <= 0 && remainingQty <= 0) return null;
  const machineCount = progress.machineCount ?? progress.machine_count;
  return {
    latestReportId,
    progressDate: cleanText(progress.progressDate ?? progress.progress_date),
    latestDailyQualifiedQty: Math.max(0, Math.trunc(Number(progress.latestDailyQualifiedQty ?? progress.latest_daily_qualified_qty ?? 0))),
    previousQualifiedQty: Math.max(0, Math.trunc(Number(progress.previousQualifiedQty ?? progress.previous_qualified_qty ?? 0))),
    cumulativeQualifiedQty,
    remainingQty,
    plannedQty: Math.max(0, Math.trunc(Number(progress.plannedQty ?? progress.planned_qty ?? 0))),
    carryOver: progress.carryOver === true || progress.carry_over === true || remainingQty > 0,
    nextWorkDate: cleanText(progress.nextWorkDate ?? progress.next_work_date),
    machineCount: machineCount === undefined || machineCount === null || machineCount === "" ? null : Math.trunc(Number(machineCount)),
    machineCountAffectsInventory: false,
    inventoryCreated: false,
    reservationCreated: false,
    packingTaskCreated: false,
  };
}

function normalizePackingTaskDetail(task, fallback = {}) {
  const packingTaskId = cleanText(task?.packingTaskId ?? task?.id ?? fallback.packingTaskId);
  if (!packingTaskId && !fallback.orderLineId) return null;
  return {
    packingTaskId,
    bizNo: cleanText(task?.bizNo) || packingTaskId,
    orderLineId: cleanText(task?.orderLineId ?? task?.lineId ?? fallback.orderLineId),
    plannedQty: Math.trunc(Number(task?.plannedQty ?? task?.qty ?? fallback.plannedQty ?? 0)),
    actualPackedQty: Math.trunc(Number(task?.actualPackedQty ?? 0)),
    packageCount: Math.trunc(Number(task?.packageCount ?? 0)),
    status: cleanText(task?.status ?? task?.taskStatus),
    createdBy: cleanText(task?.createdBy),
    createdAt: cleanText(task?.createdAt),
  };
}

function normalizeOrderLineDetail(orderLine) {
  if (!orderLine) return null;
  return {
    orderLineId: cleanText(orderLine.orderLineId ?? orderLine.id),
    customerId: cleanText(orderLine.customerId),
    productName: cleanText(orderLine.productName ?? orderLine.product),
    size: cleanText(orderLine.size),
    bagColor: cleanText(orderLine.bagColor ?? orderLine.color),
    handleType: cleanText(orderLine.handleType ?? orderLine.handle),
    style: cleanText(orderLine.style),
    originalQty: Math.trunc(Number(orderLine.originalQty ?? orderLine.qty ?? 0)),
    lineStatus: cleanText(orderLine.lineStatus ?? orderLine.status),
    fulfillmentMethod: cleanText(orderLine.fulfillmentMethod ?? orderLine.fulfillment),
    exceptionTags: Array.isArray(orderLine.exceptionTags) ? orderLine.exceptionTags : orderLine.exceptions ?? [],
  };
}

function normalizeInventoryItemDetail(inventoryItem) {
  if (!inventoryItem) return null;
  return {
    id: cleanText(inventoryItem.id),
    inventoryKey: cleanText(inventoryItem.inventoryKey ?? inventoryItem.id),
    size: cleanText(inventoryItem.size),
    color: cleanText(inventoryItem.color),
    handle: cleanText(inventoryItem.handle),
    handleType: cleanText(inventoryItem.handleType ?? inventoryItem.handle),
    style: cleanText(inventoryItem.style),
    zone: cleanText(inventoryItem.zone),
    state: cleanText(inventoryItem.state),
  };
}

function buildQueryString(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function cleanText(value) {
  return String(value ?? "").trim();
}
