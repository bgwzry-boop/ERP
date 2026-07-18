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

    const normalizedPrintBody = {
      ...body,
      printAction: normalizeText(body.printAction) || "first_print",
    };
    const documentType = resolveRequestedDocumentType(before.method, normalizedPrintBody.documentType, getDocumentType);
    if (!documentType) {
      return businessError(422, "FULFILLMENT_DOCUMENT_TYPE_INVALID", "The requested print document type is not valid for this fulfillment method.");
    }
    const printableBody = {
      ...normalizedPrintBody,
      documentType,
      templateId: normalizedPrintBody.templateId ?? getTemplateId(documentType),
    };
    const printValidation = validateFulfillmentPrintRequest(workspace, fulfillmentId, printableBody);
    if (printValidation.error) return printValidation;
    const printDeviceResolution = await resolvePrintDeviceForDocument(workspace, {
      printDeviceId: printableBody.printDeviceId ?? printableBody.printerDeviceId,
      documentType,
    });
    if (printDeviceResolution.error) return printDeviceResolution;
    const packageSnapshot = buildFulfillmentPackageSnapshot(workspace, before);
    if (requiresPackageLabelSnapshot(documentType, printableBody.printAction) && packageSnapshot.length === 0) {
      return businessError(
        409,
        "FULFILLMENT_PACKAGES_REQUIRED_FOR_LABEL_PRINT",
        "Current fulfillment packages are required before an express/LTL label can be printed.",
      );
    }

    const printRecord = buildFulfillmentPrintRecord({
      workspace,
      fulfillmentId,
      fulfillment: before,
      body: printableBody,
      packageSnapshot,
      operatorId,
      printDevice: printDeviceResolution.printDevice,
      buildPrintDeviceSnapshot,
      now,
    });
    const paperOutboundDocument = printableBody.printAction === "preview" || documentType === "express_ltl_label"
      ? null
      : buildPaperOutboundDocument({
          workspace,
          fulfillment: before,
          printRecord,
          documentType,
          operatorId,
          now,
        });
    const orderLine = findOrderLine(workspace, before.lineId ?? before.orderLineId);
    const customer = (workspace.customers ?? []).find((item) => item.id === before.customerId) ?? {};
    const printTemplate = buildFulfillmentPrintTemplate({
      fulfillment: before,
      orderLine,
      customer,
      printRecord,
      documentType,
      action: printableBody.printAction,
      paperNo: printableBody.paperNo,
    });
    const printJob = buildPrintJobRecord({
      workspace,
      printRecord,
      printTemplate,
      body: {
        ...printableBody,
        packageIds: packageSnapshot.map((item) => item.packageId),
      },
      operatorId,
      now,
    });
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action: "print_fulfillment",
      operatorId,
      before,
      after: paperOutboundDocument ? { fulfillment: before, paperOutboundDocument } : before,
    });
    const printJobOperationLog = buildOperationLog(workspace, {
      id: `${operationLog.id}-PRINT-JOB`,
      targetType: "print_job",
      targetId: printJob.printJobId,
      action: "create_print_job",
      operatorId,
      before: null,
      after: printJob,
    });
    const fulfillment = buildFulfillmentActionRecord(workspace, {
      ...before,
      ...(paperOutboundDocument
        ? {
            paperOutboundStatus: "待打印确认",
            paperOutboundDocumentId: paperOutboundDocument.paperOutboundDocumentId,
            legacyStateReviewRequired: false,
          }
        : {}),
    }, {
      operatorId,
      actualQty: before.actualQty ?? before.qty,
    });
    const transactionInput = {
      workspace,
      idempotencyKey: printableBody.idempotencyKey,
      idempotencyPayload: {
        ...printableBody,
        packageIds: packageSnapshot.map((item) => item.packageId),
        operatorId,
      },
      fulfillment,
      printRecord,
      paperOutboundDocument,
      operationLog,
    };
    const canPersistPrintAtomically =
      workspace.fulfillmentActionTransactionRepository?.kind === "postgres" &&
      typeof workspace.fulfillmentActionTransactionRepository.recordFulfillmentPrint === "function";
    if (isProductionWorkspace(workspace) && !canPersistPrintAtomically) {
      return businessError(
        409,
        "PRINT_TRANSACTION_PERSISTENCE_REQUIRED",
        "Production printing requires one atomic fulfillment and print-job transaction.",
      );
    }
    if (canPersistPrintAtomically) {
      const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentPrint({
        ...transactionInput,
        printJob,
        printJobOperationLog,
      });
      const savedPrintRecord = transaction.printRecord ?? printRecord;
      const savedPrintJob = transaction.printJob ?? printJob;
      return {
        fulfillmentId,
        printRecord: savedPrintRecord,
        paperOutboundDocument: transaction.paperOutboundDocument ?? paperOutboundDocument,
        printTemplate,
        printJob: savedPrintJob,
        printJobId: savedPrintJob.printJobId,
        nextStatus: before.status,
        operationLogId: transaction.operationLogId,
        printJobOperationLogId: transaction.printJobOperationLogId,
        physicalPrintConfirmed: savedPrintJob.jobStatus === "printed",
        ignoredClientPackageIds: Array.isArray(body.packageIds) && body.packageIds.length > 0,
      };
    }

    const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction(transactionInput);
    const savedPrintRecord = transaction.printRecord ?? printRecord;
    const printJobTransaction = await workspace.printJobRepository.createPrintJob({
      workspace,
      printJob,
      operationLog: printJobOperationLog,
      idempotencyKey: printableBody.idempotencyKey,
      idempotencyPayload: {
        ...printableBody,
        packageIds: packageSnapshot.map((item) => item.packageId),
        operatorId,
      },
    });
    const savedPrintJob = printJobTransaction.printJob ?? printJob;
    return {
      fulfillmentId,
      printRecord: savedPrintRecord,
      paperOutboundDocument: transaction.paperOutboundDocument ?? paperOutboundDocument,
      printTemplate,
      printJob: savedPrintJob,
      printJobId: savedPrintJob.printJobId,
      nextStatus: before.status,
      operationLogId: transaction.operationLogId,
      printJobOperationLogId: printJobTransaction.operationLogId,
      physicalPrintConfirmed: savedPrintJob.jobStatus === "printed",
      ignoredClientPackageIds: Array.isArray(body.packageIds) && body.packageIds.length > 0,
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
    const paperOutboundDocument = fulfillment
      ? findPaperOutboundDocumentByPrintRecord(workspace, before.printRecordId ?? before.id)
      : null;
    if (paperOutboundDocument?.status === "已交库房") {
      const executions = listWarehouseExecutionsForPaperDocument(workspace, paperOutboundDocument);
      const physicalExecutionRecorded = executions.some((item) => normalizeText(item.result) === "实物已出库") ||
        normalizeText(fulfillment?.physicalOutboundDocumentId ?? fulfillment?.physical_outbound_document_id) ===
          normalizeText(paperOutboundDocument.paperOutboundDocumentId ?? paperOutboundDocument.id);
      if (physicalExecutionRecorded) {
        return businessError(
          409,
          "PAPER_OUTBOUND_DOCUMENT_PHYSICAL_EXECUTION_RECORDED",
          "A paper outbound document with a recorded physical outbound result cannot be voided.",
        );
      }
      if (executions.length === 0) {
        return businessError(
          409,
          "PAPER_OUTBOUND_DOCUMENT_ALREADY_HANDED_TO_WAREHOUSE",
          "A handed-over paper document requires a warehouse result before it can be voided.",
        );
      }
      const hasReprintEligibleException = executions.some((item) =>
        ["数量不符", "无法出库"].includes(normalizeText(item.result)),
      );
      if (!hasReprintEligibleException) {
        return businessError(
          409,
          "PAPER_OUTBOUND_DOCUMENT_REPRINT_NOT_READY",
          "Only a confirmed quantity mismatch or unable-to-outbound result can void a handed-over paper document before physical outbound.",
        );
      }
    }
    const releasedPackages = fulfillment
      ? listPackagesLinkedToPrintRecord(workspace, fulfillment, printRecordId).map((item) => ({
          ...item,
          labelPrintRecordId: "",
          status: "待打印标签",
          revision: normalizeRevision(item.revision) + 1,
        }))
      : [];
    const nextFulfillment = fulfillment
      ? buildFulfillmentAfterPrintVoid(workspace, { fulfillment, printRecordId, releasedPackages })
      : null;
    const nextPaperOutboundDocument = paperOutboundDocument
      ? {
          ...paperOutboundDocument,
          status: "已作废",
          voidedBy: operatorId,
          voidedAt,
          voidReason: after.voidReason,
          revision: normalizeRevision(paperOutboundDocument.revision) + 1,
          updatedAt: voidedAt,
        }
      : null;
    const fulfillmentAfterPaperVoid = nextFulfillment
      ? {
          ...nextFulfillment,
          paperOutboundStatus: nextPaperOutboundDocument ? "待重打纸单" : nextFulfillment.paperOutboundStatus,
        }
      : null;
    const operationLog = buildOperationLog(workspace, {
      targetType: "print_record",
      targetId: printRecordId,
      action: "void_print_record",
      operatorId,
      before: fulfillment ? { printRecord: before, fulfillment, packages: releasedPackages.map(stripPackageAfter) } : before,
      after: fulfillmentAfterPaperVoid
        ? { printRecord: after, paperOutboundDocument: nextPaperOutboundDocument, fulfillment: fulfillmentAfterPaperVoid, packages: releasedPackages }
        : after,
      reason: after.voidReason,
    });

    if (fulfillment) {
      const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
        workspace,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { ...body, operatorId },
        fulfillment: buildFulfillmentActionRecord(workspace, fulfillmentAfterPaperVoid, {
          operatorId,
          actualQty: fulfillment.actualQty ?? fulfillment.qty,
        }),
        printRecord: after,
        paperOutboundDocument: nextPaperOutboundDocument,
        packages: releasedPackages,
        operationLog,
      });
      return {
        printRecord: transaction.printRecord ?? after,
        paperOutboundDocument: transaction.paperOutboundDocument ?? nextPaperOutboundDocument,
        packages: transaction.packages ?? releasedPackages,
        nextStatus: (transaction.fulfillment ?? nextFulfillment).status,
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
  fulfillment,
  body,
  packageSnapshot,
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
    documentType: body.documentType ?? "outbound_note",
    printDeviceId: printDeviceSnapshot?.printDeviceId ?? "",
    printDeviceName: printDeviceSnapshot?.name ?? "",
    printDeviceSnapshot: printDeviceSnapshot ?? {},
    batchNo: nextPlainId("PB", `${fulfillmentId}-${sequence}`),
    status,
    printAction,
    fulfillmentRevision: resolveFulfillmentPrintSnapshotRevision(workspace, fulfillment),
    packageSnapshot,
    previousPrintRecordId: body.previousPrintRecordId ?? "",
    reprintReason: body.reprintReason ?? "",
    operatorId,
    printedAt: "",
    submittedAt: ["submitted", "reprint_submitted"].includes(status) ? createdAt : "",
    createdAt,
  };
}

function buildPaperOutboundDocument({ workspace, fulfillment, printRecord, documentType, operatorId, now }) {
  const fulfillmentId = normalizeText(fulfillment?.fulfillmentId ?? fulfillment?.id);
  const existingVersions = (workspace.paperOutboundDocuments ?? [])
    .filter((item) => normalizeText(item.fulfillmentId ?? item.fulfillment_id) === fulfillmentId)
    .map((item) => Number(item.documentVersion ?? item.document_version ?? 0))
    .filter(Number.isFinite);
  const documentVersion = Math.max(0, ...existingVersions) + 1;
  const createdAt = nowIso(now);
  return {
    paperOutboundDocumentId: nextPlainId("POD", `${fulfillmentId}-${documentVersion}`),
    fulfillmentId,
    printRecordId: printRecord.printRecordId,
    documentType,
    documentVersion,
    status: "待打印确认",
    printedBy: operatorId,
    printedAt: "",
    handedToWarehouseBy: "",
    handedToWarehouseAt: "",
    handoverNote: "",
    voidedBy: "",
    voidedAt: "",
    voidReason: "",
    revision: 1,
    createdAt,
    updatedAt: createdAt,
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
        packageIds: printRecord.packageSnapshot.map((item) => item.packageId),
        paperNo: body.paperNo ?? "",
      },
    },
    metadata: {
      route: "fulfillment_print",
      printRecordStatus: printRecord.status,
      fulfillmentRevision: printRecord.fulfillmentRevision,
      packageSnapshot: printRecord.packageSnapshot,
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
  const printAction = normalizeText(body.printAction) || "first_print";
  if (!supportedPrintActions.has(printAction)) {
    return businessError(422, "PRINT_ACTION_UNSUPPORTED", "Print action must be preview, first_print, or reprint.");
  }
  if (printAction === "preview") return {};
  const documentType = normalizeText(body.documentType);
  const activeRecord = findActivePrintRecordForFulfillment(workspace, fulfillmentId, documentType);
  if (printAction === "reprint") {
    const previousPrintRecordId = normalizeText(body.previousPrintRecordId);
    if (!previousPrintRecordId) {
      return businessError(422, "REPRINT_REQUIRES_PREVIOUS_PRINT_RECORD", "Reprint requires previousPrintRecordId.");
    }
    const previous = findPrintRecord(workspace, previousPrintRecordId);
    if (!previous || previous.targetType !== "fulfillment" || previous.targetId !== fulfillmentId) {
      return businessError(422, "PREVIOUS_PRINT_RECORD_NOT_FOUND", "The previous print record does not belong to this fulfillment.");
    }
    if (resolvePrintRecordDocumentType(previous) !== documentType) {
      return businessError(422, "PREVIOUS_PRINT_RECORD_DOCUMENT_TYPE_MISMATCH", "The previous print record is not the same document type as this reprint.");
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

const supportedPrintActions = new Set(["preview", "first_print", "reprint"]);

function buildFulfillmentPackageSnapshot(workspace, fulfillment) {
  const fulfillmentId = normalizeText(fulfillment?.fulfillmentId ?? fulfillment?.id);
  return (workspace.packages ?? [])
    .filter((item) => normalizeText(item.fulfillmentId ?? item.fulfillment_id) === fulfillmentId)
    .map((item) => ({
      packageId: normalizeText(item.packageId ?? item.id),
      revision: normalizeRevision(item.revision),
    }))
    .filter((item) => item.packageId)
    .sort((left, right) => left.packageId.localeCompare(right.packageId));
}

function resolveFulfillmentPrintSnapshotRevision(workspace, fulfillment) {
  const revision = normalizeRevision(fulfillment?.revision);
  // Submitting any print record is itself a fulfillment transaction. Both the
  // local and PostgreSQL repositories advance the fulfillment revision before
  // a later driver callback evaluates whether the label snapshot is current.
  return revision + 1;
}

function requiresPackageLabelSnapshot(documentType, printAction) {
  return printAction !== "preview" && documentType === "express_ltl_label";
}

function resolveRequestedDocumentType(method, requestedDocumentType, getDefaultDocumentType) {
  const defaultDocumentType = normalizeText(getDefaultDocumentType(method));
  const requested = normalizeText(requestedDocumentType) || defaultDocumentType;
  if (defaultDocumentType === "express_ltl_label") {
    return ["express_ltl_label", "outbound_note"].includes(requested) ? requested : "";
  }
  return requested === defaultDocumentType ? requested : "";
}

function listPackagesLinkedToPrintRecord(workspace, fulfillment, printRecordId) {
  const fulfillmentId = normalizeText(fulfillment?.fulfillmentId ?? fulfillment?.id);
  return (workspace.packages ?? []).filter(
    (item) =>
      normalizeText(item.fulfillmentId ?? item.fulfillment_id) === fulfillmentId &&
      normalizeText(item.labelPrintRecordId ?? item.label_print_record_id) === printRecordId,
  );
}

function buildFulfillmentAfterPrintVoid(workspace, { fulfillment, printRecordId, releasedPackages }) {
  const method = normalizeFulfillmentMethod(fulfillment.method);
  if (method !== "express_ltl" || releasedPackages.length === 0) {
    return fulfillment;
  }
  const releasedIds = new Set(releasedPackages.map((item) => normalizeText(item.packageId ?? item.id)));
  const allPackages = (workspace.packages ?? [])
    .filter((item) => normalizeText(item.fulfillmentId ?? item.fulfillment_id) === normalizeText(fulfillment.id ?? fulfillment.fulfillmentId))
    .map((item) =>
      releasedIds.has(normalizeText(item.packageId ?? item.id)) ? { ...item, labelPrintRecordId: "" } : item,
    );
  const labelsPrinted = allPackages.length > 0 && allPackages.every((item) => hasLivePackagePrintRecord(workspace, item, printRecordId));
  return {
    ...fulfillment,
    labelsPrinted,
    status: labelsPrinted ? "待打印出库单" : "待打印标签",
  };
}

function hasLivePackagePrintRecord(workspace, packageRecord, voidedPrintRecordId) {
  const printRecordId = normalizeText(packageRecord.labelPrintRecordId ?? packageRecord.label_print_record_id);
  if (!printRecordId || printRecordId === voidedPrintRecordId) return false;
  const record = findPrintRecord(workspace, printRecordId);
  return Boolean(record && ["printed", "reprinted"].includes(record.status));
}

function normalizeFulfillmentMethod(value) {
  const methodMap = {
    自提: "pickup",
    送货: "delivery",
    快递快运: "express_ltl",
    待确认: "pending",
  };
  return methodMap[value] ?? value ?? "pending";
}

function stripPackageAfter(item) {
  return {
    ...item,
    labelPrintRecordId: normalizeText(item.labelPrintRecordId ?? item.label_print_record_id),
    status: String(item.status ?? "待打印标签"),
    revision: normalizeRevision(item.revision),
  };
}

function findActivePrintRecordForFulfillment(workspace, fulfillmentId, documentType) {
  return [...(workspace.printRecords ?? [])]
    .reverse()
    .find(
      (item) =>
        item.targetType === "fulfillment" &&
        item.targetId === fulfillmentId &&
        resolvePrintRecordDocumentType(item) === documentType &&
        ["submitted", "reprint_submitted", "printed", "reprinted"].includes(item.status),
    );
}

function resolvePrintRecordDocumentType(record = {}) {
  const explicit = normalizeText(record.documentType ?? record.document_type);
  if (explicit) return explicit;
  if (
    normalizeText(record.templateId ?? record.template_id) === "tpl-p0-express-ltl-label" ||
    Array.isArray(record.packageSnapshot ?? record.package_snapshot_json)
  ) {
    return "express_ltl_label";
  }
  return "outbound_note";
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

function findPaperOutboundDocumentByPrintRecord(workspace, printRecordId) {
  const safePrintRecordId = normalizeText(printRecordId);
  if (!safePrintRecordId) return null;
  return (workspace.paperOutboundDocuments ?? []).find(
    (item) => normalizeText(item.printRecordId ?? item.print_record_id) === safePrintRecordId,
  ) ?? null;
}

function listWarehouseExecutionsForPaperDocument(workspace, paperOutboundDocument) {
  const paperOutboundDocumentId = normalizeText(paperOutboundDocument?.paperOutboundDocumentId ?? paperOutboundDocument?.id);
  return (workspace.warehouseOutboundExecutions ?? []).filter(
    (item) => normalizeText(item.paperOutboundDocumentId ?? item.paper_outbound_document_id) === paperOutboundDocumentId,
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

function normalizeRevision(value) {
  return Math.max(1, Math.trunc(Number(value) || 1));
}

function nowIso(now) {
  return new Date(now()).toISOString();
}

function assertFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
