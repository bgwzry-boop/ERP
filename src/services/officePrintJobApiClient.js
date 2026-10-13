import {
  readOfficeApiJson as readJson,
  requestOfficeApi as requestPrintJobApi,
  toOfficeApiError as toApiError,
} from "./officeApiClientCore.js";

export async function listOfficePrintJobs(input = {}, options = {}) {
  const { authState, query = {}, operatorId, localPrintJobs = [] } = input;

  try {
    const response = await requestPrintJobApi(`/print-jobs${buildQueryString(query)}`, {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response, {});
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        items: [],
        page: 1,
        pageSize: 50,
        total: 0,
        error: toApiError(json, response.status, "打印作业列表 API 返回错误。"),
      };
    }

    return {
      source: "api",
      ...mapPrintJobListResponse(json),
    };
  } catch (error) {
    const items = filterLocalPrintJobs(normalizePrintJobs(localPrintJobs), query);
    return {
      source: "local_fallback",
      items,
      page: 1,
      pageSize: items.length || Number(query.pageSize ?? 50),
      total: items.length,
      error: {
        code: "PRINT_JOB_LIST_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function dispatchOfficePrintJob(input = {}, options = {}) {
  const { authState, printJobId, operatorId, reason = "办公室手动派发打印作业" } = input;
  const safePrintJobId = cleanText(printJobId);
  if (!safePrintJobId) return invalidPrintJobInput("PRINT_JOB_REQUIRED", "打印作业不能为空。");

  try {
    const response = await requestPrintJobApi(`/print-jobs/${encodeURIComponent(safePrintJobId)}/dispatch`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        operatorId,
        reason,
      },
    });
    const json = await readJson(response, {});
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "打印作业派发 API 返回错误。"),
      };
    }

    return {
      source: "api",
      printJob: normalizePrintJob(json.printJob),
      dispatchResult: normalizeDispatchResult(json.dispatchResult),
      operationLogId: cleanText(json.operationLogId),
    };
  } catch (error) {
    return {
      source: "local_fallback",
      blocked: true,
      error: {
        code: "PRINT_JOB_DISPATCH_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function retryOfficePrintJob(input = {}, options = {}) {
  const { authState, printJobId, operatorId, retryReason = "办公室重试失败打印作业" } = input;
  const safePrintJobId = cleanText(printJobId);
  if (!safePrintJobId) return invalidPrintJobInput("PRINT_JOB_REQUIRED", "打印作业不能为空。");

  try {
    const response = await requestPrintJobApi(`/print-jobs/${encodeURIComponent(safePrintJobId)}/retry`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        operatorId,
        retryReason,
      },
    });
    const json = await readJson(response, {});
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "打印作业重试 API 返回错误。"),
      };
    }

    return {
      source: "api",
      sourcePrintJob: normalizePrintJob(json.sourcePrintJob),
      printJob: normalizePrintJob(json.printJob),
      operationLogId: cleanText(json.operationLogId),
    };
  } catch (error) {
    return {
      source: "local_fallback",
      blocked: true,
      error: {
        code: "PRINT_JOB_RETRY_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export function normalizePrintJobForClient(value = {}) {
  return normalizePrintJob(value);
}

function mapPrintJobListResponse(json = {}) {
  const items = normalizePrintJobs(json?.items);
  return {
    items,
    page: Math.max(1, Math.trunc(Number(json?.page ?? 1))),
    pageSize: Math.max(1, Math.trunc(Number(json?.pageSize ?? 50))),
    total: Math.trunc(Number(json?.total ?? items.length)),
  };
}

function normalizePrintJobs(value = []) {
  return Array.isArray(value) ? value.map((item) => normalizePrintJob(item)).filter(Boolean) : [];
}

function normalizePrintJob(value = {}) {
  if (!value || typeof value !== "object") return null;
  const printJobId = cleanText(value.printJobId ?? value.id);
  if (!printJobId) return null;
  const printDeviceSnapshot = isPlainObject(value.printDeviceSnapshot) ? value.printDeviceSnapshot : {};
  const metadata = isPlainObject(value.metadata) ? value.metadata : {};
  return {
    printJobId,
    bizNo: cleanText(value.bizNo) || printJobId,
    printRecordId: cleanText(value.printRecordId),
    targetType: cleanText(value.targetType),
    targetId: cleanText(value.targetId),
    documentType: cleanText(value.documentType),
    templateId: cleanText(value.templateId),
    printDeviceId: cleanText(value.printDeviceId),
    printDeviceSnapshot,
    printDeviceName: cleanText(value.printDeviceName ?? printDeviceSnapshot.name),
    driverMode: cleanText(value.driverMode ?? printDeviceSnapshot?.settings?.driverMode),
    jobStatus: cleanText(value.jobStatus ?? value.status),
    attemptNo: Math.max(0, Math.trunc(Number(value.attemptNo ?? 0))),
    sourcePrintJobId: cleanText(value.sourcePrintJobId),
    requestedBy: cleanText(value.requestedBy),
    queuedAt: cleanText(value.queuedAt),
    sentAt: cleanText(value.sentAt),
    finishedAt: cleanText(value.finishedAt),
    errorCode: cleanText(value.errorCode),
    errorMessage: cleanText(value.errorMessage),
    metadata,
    operationLogId: cleanText(value.operationLogId),
    createdAt: cleanText(value.createdAt),
    updatedAt: cleanText(value.updatedAt),
  };
}

function normalizeDispatchResult(value = {}) {
  if (!value || typeof value !== "object") return null;
  return {
    adapterStatus: cleanText(value.adapterStatus),
    jobStatus: cleanText(value.jobStatus),
    externalJobId: cleanText(value.externalJobId),
    dispatchedAt: cleanText(value.dispatchedAt),
    message: cleanText(value.message),
    errorCode: cleanText(value.errorCode),
    errorMessage: cleanText(value.errorMessage),
  };
}

function filterLocalPrintJobs(items, query = {}) {
  let nextItems = [...items];
  if (query.status) nextItems = nextItems.filter((item) => item.jobStatus === query.status);
  if (query.targetType) nextItems = nextItems.filter((item) => item.targetType === query.targetType);
  if (query.targetId) nextItems = nextItems.filter((item) => item.targetId === query.targetId);
  if (query.printRecordId) nextItems = nextItems.filter((item) => item.printRecordId === query.printRecordId);
  if (query.printDeviceId) nextItems = nextItems.filter((item) => item.printDeviceId === query.printDeviceId);
  const pageSize = Math.max(1, Math.trunc(Number(query.pageSize ?? (nextItems.length || 50))));
  return nextItems.slice(0, pageSize);
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

function invalidPrintJobInput(code, message) {
  return {
    source: "api_error",
    blocked: true,
    error: { code, message },
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
