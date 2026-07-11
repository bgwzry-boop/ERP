import { createHash } from "node:crypto";
import {
  getPrinterDeviceFieldTestEvidenceSummary,
  getPrinterDeviceFieldTestSummary,
  normalizePrinterDeviceFieldTestChecks,
  normalizePrinterDeviceFieldTestEvidence,
} from "../../src/services/printerDeviceFieldTestClient.js";

export function createPrintDeviceCommandService({ buildOperationLog, now = () => new Date() } = {}) {
  assertFunction(buildOperationLog, "buildOperationLog");

  async function upsertPrintDevice({ workspace, body = {}, operatorId }) {
    const timestamp = nowIso(now);
    const printDeviceId = body.printDeviceId ?? body.id ?? buildPrintDeviceId(body.name);
    const existing = await findPrintDevice(workspace, printDeviceId);
    const printDevice = {
      ...(existing ?? {}),
      ...body,
      printDeviceId,
      updatedBy: operatorId,
      createdBy: existing?.createdBy ?? operatorId,
      updatedAt: body.updatedAt ?? timestamp,
      createdAt: body.createdAt ?? existing?.createdAt ?? timestamp,
    };
    const operationLog = buildOperationLog(workspace, {
      targetType: "print_device",
      targetId: printDeviceId,
      action: "upsert_print_device",
      operatorId: printDevice.updatedBy,
      after: printDevice,
      reason: body.reason ?? "打印设备参数维护",
    });
    const transaction = await workspace.printDeviceRepository.upsertPrintDevice({
      workspace,
      printDevice,
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
    });
    return { printDevice: transaction.printDevice, operationLogId: transaction.operationLogId };
  }

  async function updatePrintDeviceDriverMode({ workspace, printDeviceId, body = {}, operatorId }) {
    const existing = await findPrintDevice(workspace, printDeviceId);
    if (!existing) return notFound("PRINT_DEVICE_NOT_FOUND");
    const driverMode = normalizeOfficePrintDeviceDriverMode(body.driverMode ?? body.mode ?? body.settings?.driverMode);
    if (!driverMode) {
      return businessError(
        422,
        "INVALID_PRINT_DEVICE_DRIVER_MODE",
        "driverMode must be preview_only or system_printer",
      );
    }
    const previousDriverMode =
      normalizeOfficePrintDeviceDriverMode(existing.settings?.driverMode ?? existing.driverMode) || "preview_only";
    const printDevice = {
      ...existing,
      settings: { ...(existing.settings ?? {}), driverMode },
      updatedBy: operatorId,
      updatedAt: nowIso(now),
    };
    const operationLog = buildOperationLog(workspace, {
      targetType: "print_device",
      targetId: existing.printDeviceId,
      action: "update_print_device_driver_mode",
      operatorId,
      before: { printDeviceId: existing.printDeviceId, driverMode: previousDriverMode },
      after: { printDeviceId: existing.printDeviceId, driverMode },
      reason: body.reason ?? "打印设备驱动模式维护",
    });
    const transaction = await workspace.printDeviceRepository.upsertPrintDevice({
      workspace,
      printDevice,
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
    });
    return {
      printDevice: transaction.printDevice,
      printDeviceId: transaction.printDevice?.printDeviceId ?? existing.printDeviceId,
      previousDriverMode,
      driverMode,
      operationLogId: transaction.operationLogId,
    };
  }

  async function recordPrinterDeviceFieldTest({ workspace, printDeviceId, body = {}, operatorId }) {
    const printDevice = await findPrintDevice(workspace, printDeviceId);
    if (!printDevice) return notFound("PRINT_DEVICE_NOT_FOUND");
    if (body.printDeviceId && body.printDeviceId !== printDeviceId) {
      return businessError(422, "VALIDATION_ERROR", "printDeviceId in path and body must match");
    }
    const printJobId = normalizeText(body.printJobId);
    const printJob = printJobId ? await findPrintJob(workspace, printJobId) : null;
    if (printJobId && !printJob) return notFound("PRINT_JOB_NOT_FOUND");
    if (printJob?.printDeviceId && printJob.printDeviceId !== printDeviceId) {
      return businessError(422, "VALIDATION_ERROR", "printJobId must belong to the requested printDeviceId");
    }

    const record = normalizePrinterDeviceFieldTestApiRecord(
      {
        ...body,
        printDeviceId,
        printJobId,
        documentType: body.documentType ?? printJob?.documentType,
        operatorId,
        deviceLabel: body.deviceLabel ?? printDevice.name,
        driverLabel: body.driverLabel ?? printDevice.driverName ?? printDevice.connectionType,
        paperLabel: body.paperLabel ?? getPrintDevicePaperLabel(printDevice),
      },
      now,
    );
    if (!record.recordId || !record.printDeviceId) {
      return businessError(
        422,
        "PRINTER_DEVICE_FIELD_TEST_RECORD_REQUIRED",
        "Printer device field-test record is required.",
      );
    }
    const operationLog = buildOperationLog(workspace, {
      targetType: "print_device",
      targetId: printDeviceId,
      action: "record_printer_device_field_test",
      operatorId,
      before: printDevice.latestFieldTestRecord ?? null,
      after: record,
      reason: record.summary?.label ?? "printer_device_field_test",
    });
    const transaction = await workspace.printerDeviceFieldTestRepository.recordPrinterDeviceFieldTest({
      workspace,
      record,
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
    });
    const savedRecord = transaction.record ?? record;
    const savedPrintDevice = (await findPrintDevice(workspace, printDeviceId)) ?? printDevice;
    return {
      printDeviceId,
      printDevice: savedPrintDevice,
      printJob,
      record: savedRecord,
      summary: savedRecord.summary,
      operationLogId: transaction.operationLogId || operationLog.id,
    };
  }

  return { upsertPrintDevice, updatePrintDeviceDriverMode, recordPrinterDeviceFieldTest };
}

function normalizePrinterDeviceFieldTestApiRecord(value, now) {
  const printDeviceId = normalizeText(value.printDeviceId ?? value.printerDeviceId);
  const checkedAt = normalizeTimestamp(value.checkedAt, nowIso(now));
  const checks = normalizePrinterDeviceFieldTestChecks(value.checks ?? []);
  const evidence = normalizePrinterDeviceFieldTestEvidence(value.evidence ?? value.summary?.evidence);
  const summary = {
    ...getPrinterDeviceFieldTestSummary(checks),
    evidenceSummary: getPrinterDeviceFieldTestEvidenceSummary(evidence),
  };
  const recordId =
    normalizeText(value.recordId) ||
    `PDQA-${compactTimestamp(checkedAt)}-${safeRecordPart(printDeviceId || "PRINT")}`;
  return {
    recordId,
    printDeviceId,
    printJobId: normalizeText(value.printJobId),
    documentType: normalizeText(value.documentType),
    operatorId: normalizeText(value.operatorId),
    operatorName: normalizeText(value.operatorName),
    checkedAt,
    deviceLabel: normalizeText(value.deviceLabel),
    driverLabel: normalizeText(value.driverLabel),
    paperLabel: normalizeText(value.paperLabel),
    summary,
    checks,
    evidence,
    note: normalizeText(value.note),
  };
}

async function findPrintDevice(workspace, printDeviceId) {
  const normalizedId = normalizeText(printDeviceId);
  if (!normalizedId) return null;
  const workspaceDevice = (workspace.printDevices ?? []).find(
    (item) => item.printDeviceId === normalizedId || item.id === normalizedId,
  );
  if (workspaceDevice) return workspaceDevice;
  const items = await workspace.printDeviceRepository.listPrintDevices({ workspace, filters: {} });
  return items.find((item) => item.printDeviceId === normalizedId || item.id === normalizedId) ?? null;
}

async function findPrintJob(workspace, printJobId) {
  const normalizedId = normalizeText(printJobId);
  if (!normalizedId) return null;
  const workspaceJob = (workspace.printJobs ?? []).find(
    (item) => item.printJobId === normalizedId || item.id === normalizedId,
  );
  if (workspaceJob) return workspaceJob;
  const items = await workspace.printJobRepository.listPrintJobs({ workspace, filters: {} });
  return items.find((item) => item.printJobId === normalizedId || item.id === normalizedId) ?? null;
}

function getPrintDevicePaperLabel(printDevice) {
  const paperName = normalizeText(printDevice.paperName);
  if (paperName) return paperName;
  const width = Number(printDevice.paperWidthMm ?? 0);
  const height = Number(printDevice.paperHeightMm ?? 0);
  return width > 0 && height > 0 ? `${width}x${height}mm` : "";
}

function normalizeOfficePrintDeviceDriverMode(value) {
  const mode = normalizeText(value);
  return mode === "preview_only" || mode === "system_printer" ? mode : "";
}

function normalizeTimestamp(value, fallback) {
  const timestamp = normalizeText(value);
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : fallback;
}

function compactTimestamp(value) {
  return normalizeText(value).replace(/[-:T.Z]/g, "").slice(0, 14) || "NOW";
}

function safeRecordPart(value) {
  return normalizeText(value).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "TASK";
}

function buildPrintDeviceId(name) {
  const source = normalizeText(name) || "PRINT-DEVICE";
  const slug = source.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  if (slug) return `PRN-${slug}`;
  const digest = createHash("sha256").update(source).digest("hex").slice(0, 12).toUpperCase();
  return `PRN-${digest}`;
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}

function notFound(code) {
  return { notFound: true, code };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function nowIso(now) {
  return new Date(now()).toISOString();
}

function assertFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
