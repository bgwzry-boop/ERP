export function createFulfillmentPrintCommandService({
  buildFulfillmentActionRecord,
  buildFulfillmentPrintTemplate,
  buildOperationLog,
  buildPrintDeviceSnapshot,
  getDocumentType,
  getTemplateId,
  now = () => new Date(),
} = {}) {
  for (const [name, dependency] of Object.entries({
    buildFulfillmentActionRecord,
    buildFulfillmentPrintTemplate,
    buildOperationLog,
    buildPrintDeviceSnapshot,
    getDocumentType,
    getTemplateId,
  })) {
    assertFunction(dependency, name);
  }

  async function printFulfillment({ workspace, fulfillmentId, body = {}, operatorId }) {
    const before = findFulfillment(workspace, fulfillmentId);
    if (!before) return notFound();

    const printValidation = validateFulfillmentPrintRequest(workspace, fulfillmentId, body);
    if (printValidation.error) return printValidation;

    const documentType = getDocumentType(before.method);
    const normalizedPrintBody = {
      ...body,
      documentType,
      templateId: body.templateId ?? getTemplateId(documentType),
    };
    const printDeviceResolution = await resolvePrintDeviceForDocument(workspace, {
      printDeviceId: normalizedPrintBody.printDeviceId ?? normalizedPrintBody.printerDeviceId,
      documentType,
    });
    if (printDeviceResolution.error) return printDeviceResolution;

    const printRecord = buildFulfillmentPrintRecord({
      workspace,
      fulfillmentId,
      body: normalizedPrintBody,
      operatorId,
      printDevice: printDeviceResolution.printDevice,
      buildPrintDeviceSnapshot,
      now,
    });
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action: "print_fulfillment",
      operatorId,
      before,
      after: before,
    });
    const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      fulfillment: buildFulfillmentActionRecord(workspace, before, {
        operatorId,
        actualQty: before.actualQty ?? before.qty,
      }),
      printRecord,
      operationLog,
    });
    const savedPrintRecord = transaction.printRecord ?? printRecord;
    const orderLine = findOrderLine(workspace, before.lineId ?? before.orderLineId);
    const customer = (workspace.customers ?? []).find((item) => item.id === before.customerId) ?? {};
    const printTemplate = buildFulfillmentPrintTemplate({
      fulfillment: before,
      orderLine,
      customer,
      printRecord: savedPrintRecord,
      action: normalizedPrintBody.printAction,
      paperNo: normalizedPrintBody.paperNo,
    });
    const printJob = buildPrintJobRecord({
      workspace,
      printRecord: savedPrintRecord,
      printTemplate,
      body: normalizedPrintBody,
      operatorId,
      now,
    });
    const printJobOperationLog = buildOperationLog(workspace, {
      targetType: "print_job",
      targetId: printJob.printJobId,
      action: "create_print_job",
      operatorId,
      before: null,
      after: printJob,
    });
    const printJobTransaction = await workspace.printJobRepository.createPrintJob({
      workspace,
      printJob,
      operationLog: printJobOperationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
    });
    const savedPrintJob = printJobTransaction.printJob ?? printJob;
    return {
      fulfillmentId,
      printRecord: savedPrintRecord,
      printTemplate,
      printJob: savedPrintJob,
      printJobId: savedPrintJob.printJobId,
      nextStatus: before.status,
      operationLogId: transaction.operationLogId,
      printJobOperationLogId: printJobTransaction.operationLogId,
      physicalPrintConfirmed: savedPrintJob.jobStatus === "printed",
    };
  }

  async function voidPrintRecord({ workspace, printRecordId, body = {}, operatorId }) {
    const before = findPrintRecord(workspace, printRecordId);
    if (!before) return notFound();
    if (before.status === "voided") {
      return businessError(409, "PRINT_RECORD_ALREADY_VOIDED", "This print record has already been voided.");
    }
    if (!["printed", "reprinted"].includes(before.status)) {
      return businessError(409, "PRINT_RECORD_NOT_VOIDABLE", "Only printed or reprinted records can be voided.");
    }

    const voidedAt = body.voidedAt ?? nowIso(now);
    const after = {
      ...before,
      status: "voided",
      voidReason: body.voidReason ?? "other",
      relatedPrintRecordId: body.relatedPrintRecordId ?? before.relatedPrintRecordId ?? "",
      voidedBy: operatorId,
      voidedAt,
    };
    const fulfillment = before.targetType === "fulfillment" ? findFulfillment(workspace, before.targetId) : null;
    const operationLog = buildOperationLog(workspace, {
      targetType: "print_record",
      targetId: printRecordId,
      action: "void_print_record",
      operatorId,
      before,
      after,
      reason: after.voidReason,
    });

    if (fulfillment) {
      const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
        workspace,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { ...body, operatorId },
        fulfillment: buildFulfillmentActionRecord(workspace, fulfillment, {
          operatorId,
          actualQty: fulfillment.actualQty ?? fulfillment.qty,
        }),
        printRecord: after,
        operationLog,
      });
      return {
        printRecord: transaction.printRecord ?? after,
        nextStatus: fulfillment.status,
        operationLogId: transaction.operationLogId,
      };
    }

    if (isProductionWorkspace(workspace)) {
      return businessError(
        409,
        "PRINT_RECORD_PERSISTENCE_REQUIRED",
        "Production cannot void a print record without a persistent business transaction target.",
      );
    }
    workspace.printRecords = upsertByKey(workspace.printRecords ?? [], after, "printRecordId");
    workspace.operationLogs = [...(workspace.operationLogs ?? []), operationLog];
    return { printRecord: after, operationLogId: operationLog.id };
  }

  return { printFulfillment, voidPrintRecord };
}

function buildFulfillmentPrintRecord({
  workspace,
  fulfillmentId,
  body,
  operatorId,
  printDevice,
  buildPrintDeviceSnapshot,
  now,
}) {
  const createdAt = nowIso(now);
  const printAction = body.printAction ?? "first_print";
  const printDeviceSnapshot = buildPrintDeviceSnapshot(printDevice);
  const driverMode = getPrintDriverMode(printDeviceSnapshot);
  const status =
    printAction === "preview" || driverMode === "preview_only"
      ? "previewed"
      : printAction === "reprint"
        ? "reprint_submitted"
        : "submitted";
  const sequence = (workspace.printRecords ?? []).length + 1;
  return {
    printRecordId: nextPlainId("PR", `${fulfillmentId}-${sequence}`),
    targetType: "fulfillment",
    targetId: fulfillmentId,
    templateId: body.templateId ?? "tpl-p0-fulfillment",
    printDeviceId: printDeviceSnapshot?.printDeviceId ?? "",
    printDeviceName: printDeviceSnapshot?.name ?? "",
    printDeviceSnapshot: printDeviceSnapshot ?? {},
    batchNo: nextPlainId("PB", `${fulfillmentId}-${sequence}`),
    status,
    printAction,
    previousPrintRecordId: body.previousPrintRecordId ?? "",
    reprintReason: body.reprintReason ?? "",
    operatorId,
    printedAt: "",
    submittedAt: ["submitted", "reprint_submitted"].includes(status) ? createdAt : "",
    createdAt,
  };
}

function buildPrintJobRecord({ workspace, printRecord, printTemplate, body, operatorId, now }) {
  const createdAt = nowIso(now);
  const driverMode = getPrintDriverMode(printRecord.printDeviceSnapshot);
  const jobStatus = printRecord.status === "previewed" || driverMode === "preview_only" ? "preview_only" : "queued";
  const printJobId = nextPlainId("PJ", `${printRecord.printRecordId}-${(workspace.printJobs ?? []).length + 1}`);
  return {
    printJobId,
    bizNo: printJobId,
    printRecordId: printRecord.printRecordId,
    targetType: printRecord.targetType,
    targetId: printRecord.targetId,
    documentType: body.documentType ?? printTemplate.documentType ?? "express_ltl_label",
    templateId: printRecord.templateId,
    printDeviceId: printRecord.printDeviceId,
    printDeviceSnapshot: printRecord.printDeviceSnapshot ?? {},
    driverMode,
    jobStatus,
    attemptNo: 1,
    sourcePrintJobId: "",
    requestedBy: operatorId,
    queuedAt: jobStatus === "queued" ? createdAt : "",
    sentAt: "",
    finishedAt: "",
    errorCode: "",
    errorMessage: "",
    payload: {
      printTemplate,
      request: {
        printAction: printRecord.printAction,
        packageIds: Array.isArray(body.packageIds) ? body.packageIds : [],
        paperNo: body.paperNo ?? "",
      },
    },
    metadata: {
      route: "fulfillment_print",
      printRecordStatus: printRecord.status,
      driverBoundary: driverMode === "preview_only" ? "preview_only_no_os_print" : "queued_for_driver_adapter",
    },
    operationLogId: "",
    createdAt,
    updatedAt: createdAt,
  };
}

async function resolvePrintDeviceForDocument(workspace, { printDeviceId, documentType }) {
  const requestedId = normalizeText(printDeviceId);
  if (requestedId) {
    const devices = await workspace.printDeviceRepository.listPrintDevices({
      workspace,
      filters: { status: "active" },
    });
    const printDevice = devices.find((item) => item.printDeviceId === requestedId);
    if (!printDevice) {
      return businessError(422, "PRINT_DEVICE_NOT_FOUND", "The requested print device is not active or does not exist.");
    }
    if (!supportsPrintDocumentType(printDevice, documentType)) {
      return businessError(422, "PRINT_DEVICE_UNSUPPORTED_DOCUMENT", "The requested print device does not support this document type.");
    }
    return { printDevice };
  }
  const printDevice =
    (await workspace.printDeviceRepository.getDefaultPrintDevice({ workspace, documentType })) ??
    (await workspace.printDeviceRepository.listPrintDevices({
      workspace,
      filters: { documentType, status: "active" },
    }))[0];
  return printDevice
    ? { printDevice }
    : businessError(409, "PRINT_DEVICE_NOT_CONFIGURED", "No active print device is configured for this document type.");
}

function validateFulfillmentPrintRequest(workspace, fulfillmentId, body) {
  const printAction = body.printAction ?? "first_print";
  if (printAction === "preview") return {};
  const activeRecord = findActivePrintRecordForFulfillment(workspace, fulfillmentId);
  if (printAction === "reprint") {
    const previousPrintRecordId = normalizeText(body.previousPrintRecordId);
    if (!previousPrintRecordId) {
      return businessError(422, "REPRINT_REQUIRES_PREVIOUS_PRINT_RECORD", "Reprint requires previousPrintRecordId.");
    }
    const previous = findPrintRecord(workspace, previousPrintRecordId);
    if (!previous || previous.targetType !== "fulfillment" || previous.targetId !== fulfillmentId) {
      return businessError(422, "PREVIOUS_PRINT_RECORD_NOT_FOUND", "The previous print record does not belong to this fulfillment.");
    }
    if (previous.status !== "voided") {
      return businessError(409, "REPRINT_REQUIRES_VOIDED_RECORD", "The previous print record must be voided before reprinting.");
    }
    return {};
  }
  return activeRecord
    ? businessError(409, "ACTIVE_PRINT_RECORD_EXISTS", "An active print record already exists; void the old document or label before reprinting.")
    : {};
}

function findActivePrintRecordForFulfillment(workspace, fulfillmentId) {
  return [...(workspace.printRecords ?? [])]
    .reverse()
    .find(
      (item) =>
        item.targetType === "fulfillment" &&
        item.targetId === fulfillmentId &&
        ["submitted", "reprint_submitted", "printed", "reprinted"].includes(item.status),
    );
}

function findFulfillment(workspace, fulfillmentId) {
  return (workspace.fulfillments ?? []).find(
    (item) => item.id === fulfillmentId || item.fulfillmentId === fulfillmentId,
  );
}

function findPrintRecord(workspace, printRecordId) {
  return (workspace.printRecords ?? []).find(
    (item) => item.printRecordId === printRecordId || item.id === printRecordId,
  );
}

function findOrderLine(workspace, orderLineId) {
  return (workspace.orderLines ?? []).find(
    (item) => item.id === orderLineId || item.orderLineId === orderLineId,
  );
}

function supportsPrintDocumentType(device, documentType) {
  return (
    Array.isArray(device.supportedDocumentTypes) &&
    (device.supportedDocumentTypes.includes(documentType) || device.defaultDocumentTypes?.includes(documentType))
  );
}

function getPrintDriverMode(printDeviceSnapshot = {}) {
  const mode = normalizeText(printDeviceSnapshot?.settings?.driverMode);
  return ["preview_only", "system_printer", "browser_download", "manual", "adapter_pending"].includes(mode)
    ? mode
    : "preview_only";
}

function upsertByKey(rows, record, key) {
  const index = rows.findIndex((item) => item[key] === record[key] || item.id === record[key]);
  if (index === -1) return [record, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? record : item));
}

function isProductionWorkspace(workspace) {
  return workspace.runtimeConfig?.production === true || workspace.runtimeConfig?.mode === "production";
}

function nextPlainId(prefix, value) {
  return `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, "-")}`;
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}

function notFound() {
  return { notFound: true };
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
