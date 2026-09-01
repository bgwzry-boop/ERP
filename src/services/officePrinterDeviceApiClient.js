import {
  buildPrinterDeviceFieldTestRecord,
  getPrinterDeviceFieldTestEvidenceSummary,
  getPrinterDeviceFieldTestSummary,
  normalizePrinterDeviceFieldTestEvidence,
  normalizePrinterDeviceFieldTestChecks,
} from "./printerDeviceFieldTestClient.js";
import { isOfficeApiServerRequired } from "./officeAuthService.js";
import {
  buildOfficeServerRequiredWriteError as buildServerRequiredWriteError,
  readOfficeApiJson as readJson,
  requestOfficeApi as requestPrinterDeviceApi,
  toOfficeApiError as toApiError,
} from "./officeApiClientCore.js";

export async function listOfficePrintDevices(input = {}, options = {}) {
  const { authState, query = {}, operatorId, localPrintDevices = [] } = input;

  try {
    const response = await requestPrinterDeviceApi(`/print-devices${buildQueryString(query)}`, {
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
        error: toApiError(json, response.status, "打印设备列表 API 返回错误。"),
      };
    }

    return {
      source: "api",
      ...mapPrintDeviceListResponse(json),
    };
  } catch (error) {
    const items = normalizePrintDevices(localPrintDevices);
    return {
      source: "local_fallback",
      items,
      page: 1,
      pageSize: items.length || 50,
      total: items.length,
      error: {
        code: "PRINT_DEVICE_LIST_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function saveOfficePrintDevice(input = {}, options = {}) {
  const { authState, printDevice = {}, operatorId, reason } = input;
  const safePrintDevice = normalizePrintDevice({
    ...printDevice,
    updatedBy: operatorId || printDevice.updatedBy,
    operatorId: operatorId || printDevice.operatorId,
    reason,
  });
  if (!safePrintDevice?.printDeviceId) {
    return invalidPrinterDeviceInput("PRINT_DEVICE_REQUIRED", "打印设备不能为空。");
  }

  const body = {
    ...safePrintDevice,
    operatorId: cleanText(operatorId),
    updatedBy: cleanText(operatorId) || safePrintDevice.updatedBy,
    reason: cleanText(reason) || "办公室维护打印设备参数",
  };

  try {
    const response = await requestPrinterDeviceApi("/print-devices", {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body,
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "打印设备保存 API 返回错误。"),
      };
    }

    return {
      source: "api",
      printDevice: normalizePrintDevice(json?.printDevice ?? safePrintDevice),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "PRINT_DEVICE_SAVE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function updateOfficePrintDeviceDriverMode(input = {}, options = {}) {
  const { authState, printDeviceId, driverMode, operatorId, reason } = input;
  const safePrintDeviceId = cleanText(printDeviceId);
  if (!safePrintDeviceId) return invalidPrinterDeviceInput("PRINT_DEVICE_REQUIRED", "打印设备不能为空。");
  const safeDriverMode = normalizeOfficePrintDeviceDriverMode(driverMode);
  if (!safeDriverMode) {
    return invalidPrinterDeviceInput("INVALID_PRINT_DEVICE_DRIVER_MODE", "打印设备模式只能是 preview_only 或 system_printer。");
  }

  try {
    const response = await requestPrinterDeviceApi(
      `/print-devices/${encodeURIComponent(safePrintDeviceId)}/driver-mode`,
      {
        ...options,
        authState,
        method: "POST",
        operatorId,
        body: {
          driverMode: safeDriverMode,
          operatorId: cleanText(operatorId),
          reason: cleanText(reason) || "办公室维护打印设备驱动模式",
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "打印设备模式保存 API 返回错误。"),
      };
    }

    return {
      source: "api",
      printDeviceId: cleanText(json?.printDeviceId ?? safePrintDeviceId),
      printDevice: normalizePrintDevice(json?.printDevice),
      previousDriverMode: normalizeOfficePrintDeviceDriverMode(json?.previousDriverMode),
      driverMode: normalizeOfficePrintDeviceDriverMode(json?.driverMode) || safeDriverMode,
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "PRINT_DEVICE_DRIVER_MODE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function listOfficePrinterDeviceFieldTests(input = {}, options = {}) {
  const { authState, printDeviceId, query = {}, operatorId, localFieldTests = [] } = input;
  const safePrintDeviceId = cleanText(printDeviceId);
  if (!safePrintDeviceId) return invalidPrinterDeviceInput("PRINT_DEVICE_REQUIRED", "打印设备不能为空。");

  try {
    const response = await requestPrinterDeviceApi(
      `/print-devices/${encodeURIComponent(safePrintDeviceId)}/field-tests${buildQueryString(query)}`,
      {
        ...options,
        authState,
        method: "GET",
        operatorId,
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        items: [],
        page: 1,
        pageSize: 50,
        total: 0,
        latestRecord: null,
        error: toApiError(json, response.status, "打印设备现场验收记录 API 返回错误。"),
      };
    }

    return {
      source: "api",
      ...mapPrinterDeviceFieldTestListResponse(json),
    };
  } catch (error) {
    const items = normalizePrinterDeviceFieldTestRecords(localFieldTests).filter((item) => item.printDeviceId === safePrintDeviceId);
    return {
      source: "local_fallback",
      items,
      page: 1,
      pageSize: items.length || 50,
      total: items.length,
      printDevice: null,
      latestRecord: items[0] ?? null,
      error: {
        code: "PRINTER_DEVICE_FIELD_TEST_LIST_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function recordOfficePrinterDeviceFieldTest(input = {}, options = {}) {
  const {
    authState,
    printDevice = {},
    printJob = {},
    printDeviceId = printDevice.printDeviceId,
    printJobId = printJob.printJobId,
    operatorId,
    operatorName,
    record,
    checks,
    evidence,
    note,
    now,
  } = input;
  const safePrintDeviceId = cleanText(printDeviceId);
  if (!safePrintDeviceId) return invalidPrinterDeviceInput("PRINT_DEVICE_REQUIRED", "打印设备不能为空。");

  const sourceRecord = hasRecordInput(record)
    ? record
    : buildPrinterDeviceFieldTestRecord({
      printDevice: {
        ...printDevice,
        printDeviceId: safePrintDeviceId,
      },
      printJob: {
        ...printJob,
        printJobId,
      },
      currentUser: {
        userId: operatorId,
        displayName: operatorName,
      },
      checks,
      evidence,
      note,
      now,
    });
  const normalizedRecord = normalizePrinterDeviceFieldTestRecordForClient(
    sourceRecord,
    {
      printDeviceId: safePrintDeviceId,
      printJobId,
      documentType: printJob.documentType,
      operatorId,
      operatorName,
      deviceLabel: printDevice.name,
      driverLabel: printDevice.driverName ?? printDevice.connectionType,
      paperLabel: getPrintDevicePaperLabel(printDevice),
      checks,
      evidence,
      note,
    },
  );
  if (!normalizedRecord.recordId) {
    return invalidPrinterDeviceInput("PRINTER_DEVICE_FIELD_TEST_RECORD_REQUIRED", "打印设备现场验收记录不能为空。");
  }

  try {
    const response = await requestPrinterDeviceApi(`/print-devices/${encodeURIComponent(safePrintDeviceId)}/field-tests`, {
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
        error: toApiError(json, response.status, "打印设备现场验收记录 API 返回错误。"),
      };
    }
    const savedRecord = normalizePrinterDeviceFieldTestRecordForClient(json?.record ?? normalizedRecord);
    return {
      source: "api",
      printDeviceId: cleanText(json?.printDeviceId ?? safePrintDeviceId),
      printDevice: normalizePrintDevice(json?.printDevice),
      printJob: normalizePrintJob(json?.printJob),
      record: savedRecord,
      summary: json?.summary ?? savedRecord.summary,
      acceptance: isPlainObject(json?.acceptance) ? json.acceptance : savedRecord.summary?.acceptance ?? null,
      resultStatus: isPlainObject(json?.resultStatus) ? json.resultStatus : null,
      safeguards: isPlainObject(json?.safeguards) ? json.safeguards : null,
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("PRINTER_DEVICE_FIELD_TEST_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      printDeviceId: safePrintDeviceId,
      printDevice: normalizePrintDevice({
        ...printDevice,
        printDeviceId: safePrintDeviceId,
        latestFieldTestRecord: normalizedRecord,
        latestFieldTestSummary: normalizedRecord.summary,
        latestFieldTestCheckedAt: normalizedRecord.checkedAt,
      }),
      printJob: normalizePrintJob({
        ...printJob,
        printJobId,
      }),
      record: normalizedRecord,
      summary: normalizedRecord.summary,
      acceptance: normalizedRecord.summary?.acceptance ?? null,
      resultStatus: {
        recordSaved: true,
        onsiteAcceptancePassed: normalizedRecord.summary?.acceptance?.ready === true,
        physicalPrinterCalledByRequest: false,
        printJobStatusChangedByRequest: false,
      },
      safeguards: { nonPrinting: true, physicalPrinterCalled: false },
      error: {
        code: "PRINTER_DEVICE_FIELD_TEST_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export function normalizePrinterDeviceFieldTestRecordForClient(value = {}, fallback = {}) {
  if (!value || typeof value !== "object") return null;
  const printDeviceId = cleanText(value.printDeviceId ?? value.printerDeviceId ?? fallback.printDeviceId);
  const recordId = cleanText(value.recordId ?? value.id);
  if (!printDeviceId && !recordId) return null;
  const checks = normalizePrinterDeviceFieldTestChecks(value.checks ?? fallback.checks ?? []);
  const evidence = normalizePrinterDeviceFieldTestEvidence(value.evidence ?? value.summary?.evidence ?? fallback.evidence);
  const evidenceSummary = getPrinterDeviceFieldTestEvidenceSummary(evidence);
  const summary = isPlainObject(value.summary)
    ? {
      ...value.summary,
      evidenceSummary: value.summary.evidenceSummary ?? evidenceSummary,
    }
    : {
      ...getPrinterDeviceFieldTestSummary(checks),
      evidenceSummary,
    };
  const checkedAt = cleanText(value.checkedAt ?? fallback.checkedAt) || new Date().toISOString();
  return {
    recordId,
    printDeviceId,
    printJobId: cleanText(value.printJobId ?? fallback.printJobId),
    documentType: cleanText(value.documentType ?? fallback.documentType),
    operatorId: cleanText(value.operatorId ?? fallback.operatorId),
    operatorName: cleanText(value.operatorName ?? fallback.operatorName),
    checkedAt,
    deviceLabel: cleanText(value.deviceLabel ?? fallback.deviceLabel),
    driverLabel: cleanText(value.driverLabel ?? fallback.driverLabel),
    paperLabel: cleanText(value.paperLabel ?? fallback.paperLabel),
    summary,
    checks,
    evidence,
    note: cleanText(value.note ?? fallback.note),
    operationLogId: cleanText(value.operationLogId),
  };
}

function mapPrintDeviceListResponse(json = {}) {
  const items = normalizePrintDevices(json?.items);
  return {
    items,
    page: Math.max(1, Math.trunc(Number(json?.page ?? 1))),
    pageSize: Math.max(1, Math.trunc(Number(json?.pageSize ?? 50))),
    total: Math.trunc(Number(json?.total ?? items.length)),
  };
}

function mapPrinterDeviceFieldTestListResponse(json = {}) {
  const items = normalizePrinterDeviceFieldTestRecords(json?.items);
  return {
    items,
    page: Math.max(1, Math.trunc(Number(json?.page ?? 1))),
    pageSize: Math.max(1, Math.trunc(Number(json?.pageSize ?? 50))),
    total: Math.trunc(Number(json?.total ?? items.length)),
    printDevice: normalizePrintDevice(json?.printDevice),
    latestRecord: normalizePrinterDeviceFieldTestRecordForClient(json?.latestRecord) ?? items[0] ?? null,
  };
}

function normalizePrintDevices(value = []) {
  return Array.isArray(value) ? value.map((item) => normalizePrintDevice(item)).filter(Boolean) : [];
}

function normalizePrintDevice(value = {}) {
  if (!value || typeof value !== "object") return null;
  const printDeviceId = cleanText(value.printDeviceId ?? value.id);
  if (!printDeviceId) return null;
  return {
    printDeviceId,
    name: cleanText(value.name) || printDeviceId,
    deviceType: cleanText(value.deviceType),
    status: cleanText(value.status),
    connectionType: cleanText(value.connectionType),
    connectionUri: cleanText(value.connectionUri),
    driverName: cleanText(value.driverName),
    supportedDocumentTypes: toArray(value.supportedDocumentTypes).map(cleanText).filter(Boolean),
    defaultDocumentTypes: toArray(value.defaultDocumentTypes).map(cleanText).filter(Boolean),
    paperWidthMm: Number(value.paperWidthMm ?? 0),
    paperHeightMm: Number(value.paperHeightMm ?? 0),
    paperName: cleanText(value.paperName),
    isContinuous: value.isContinuous === true,
    dpi: Number(value.dpi ?? 0),
    defaultCopies: Number(value.defaultCopies ?? 0),
    darkness: Number(value.darkness ?? 0),
    speed: Number(value.speed ?? 0),
    cutterEnabled: value.cutterEnabled === true,
    settings: isPlainObject(value.settings) ? value.settings : {},
    createdBy: cleanText(value.createdBy),
    updatedBy: cleanText(value.updatedBy),
    createdAt: cleanText(value.createdAt),
    updatedAt: cleanText(value.updatedAt),
    latestFieldTestRecord: normalizePrinterDeviceFieldTestRecordForClient(value.latestFieldTestRecord),
    latestFieldTestSummary: isPlainObject(value.latestFieldTestSummary) ? value.latestFieldTestSummary : {},
    latestFieldTestCheckedAt: cleanText(value.latestFieldTestCheckedAt),
  };
}

function normalizePrinterDeviceFieldTestRecords(value = []) {
  return Array.isArray(value) ? value.map((item) => normalizePrinterDeviceFieldTestRecordForClient(item)).filter(Boolean) : [];
}

function normalizePrintJob(value = {}) {
  if (!value || typeof value !== "object") return null;
  const printJobId = cleanText(value.printJobId ?? value.id);
  if (!printJobId) return null;
  return {
    printJobId,
    printRecordId: cleanText(value.printRecordId),
    targetType: cleanText(value.targetType),
    targetId: cleanText(value.targetId),
    documentType: cleanText(value.documentType),
    printDeviceId: cleanText(value.printDeviceId),
    jobStatus: cleanText(value.jobStatus),
    attemptNo: Number(value.attemptNo ?? 0),
    operationLogId: cleanText(value.operationLogId),
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

function getPrintDevicePaperLabel(printDevice = {}) {
  const paperName = cleanText(printDevice.paperName);
  if (paperName) return paperName;
  const width = Number(printDevice.paperWidthMm ?? 0);
  const height = Number(printDevice.paperHeightMm ?? 0);
  if (width > 0 && height > 0) return `${width}x${height}mm`;
  return "";
}

function normalizeOfficePrintDeviceDriverMode(value) {
  const mode = cleanText(value);
  return mode === "preview_only" || mode === "system_printer" ? mode : "";
}

function invalidPrinterDeviceInput(code, message) {
  return {
    source: "api_error",
    blocked: true,
    error: { code, message },
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function hasRecordInput(value) {
  return isPlainObject(value) && Object.keys(value).length > 0;
}
