export function createPrintJobLifecycleService({
  buildOperationLog,
  printJobBusinessProjectionService,
  now = () => new Date(),
} = {}) {
  assertFunction(buildOperationLog, "buildOperationLog");
  assertFunction(
    printJobBusinessProjectionService?.syncPrintJobBusinessProjection,
    "printJobBusinessProjectionService.syncPrintJobBusinessProjection",
  );
  assertFunction(
    printJobBusinessProjectionService?.persistFulfillmentPrintJobProjection,
    "printJobBusinessProjectionService.persistFulfillmentPrintJobProjection",
  );

  async function updatePrintJobStatus({ workspace, printJobId, body = {}, operatorId }) {
    const before = await findPrintJob(workspace, printJobId);
    if (!before) return notFound();

    const status = normalizeText(body.status ?? body.jobStatus);
    if (!isAllowedPrintJobStatusUpdate(status)) {
      return businessError(
        422,
        "INVALID_PRINT_JOB_STATUS",
        "Print job status must be queued, sent, printed, failed, or canceled.",
      );
    }
    const updatedAt = nowIso(now);
    const terminal = ["printed", "failed", "canceled"].includes(status);
    const after = {
      ...before,
      jobStatus: status,
      sentAt: body.sentAt ?? (status === "sent" ? updatedAt : before.sentAt),
      finishedAt: body.finishedAt ?? (terminal ? updatedAt : before.finishedAt),
      errorCode: status === "failed" ? normalizeText(body.errorCode ?? before.errorCode) : "",
      errorMessage: status === "failed" ? normalizeText(body.errorMessage ?? before.errorMessage) : "",
      metadata: {
        ...before.metadata,
        ...(isPlainObject(body.metadata) ? body.metadata : {}),
        statusUpdatedBy: operatorId,
        statusUpdateReason: normalizeText(body.reason),
      },
      updatedAt,
    };
    const operationLog = buildOperationLog(workspace, {
      targetType: "print_job",
      targetId: printJobId,
      action: "update_print_job_status",
      operatorId,
      before,
      after,
      reason: body.reason ?? body.errorMessage ?? "",
    });
    const persisted = await persistPrintJobWithBusinessProjection({
      workspace,
      printJob: after,
      printJobOperationLog: operationLog,
      printJobWriteMode: "update",
      operatorId,
      reason: body.reason ?? body.errorMessage ?? "",
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
    });
    if (persisted.error) return persisted;
    return {
      printJob: persisted.printJob,
      operationLogId: persisted.operationLogId,
      ...persisted.printProjection,
    };
  }

  async function dispatchPrintJob({ workspace, printJobId, body = {}, operatorId }) {
    const before = await findPrintJob(workspace, printJobId);
    if (!before) return notFound();
    if (["sent", "printed"].includes(before.jobStatus)) {
      return businessError(
        409,
        "PRINT_JOB_ALREADY_DISPATCHED",
        "This print job has already been dispatched or printed.",
      );
    }
    if (["failed", "canceled"].includes(before.jobStatus)) {
      return businessError(
        409,
        "PRINT_JOB_DISPATCH_REQUIRES_RETRY",
        "Failed or canceled print jobs must be retried before dispatch.",
      );
    }

    const dispatchResult = await workspace.printDriverAdapter.dispatchPrintJob({
      printJob: before,
      operatorId,
      reason: body.reason ?? "",
    });
    const after = buildDispatchedPrintJobRecord(before, dispatchResult, now);
    const operationLog = buildOperationLog(workspace, {
      targetType: "print_job",
      targetId: printJobId,
      action: "dispatch_print_job",
      operatorId,
      before,
      after,
      reason: body.reason ?? dispatchResult.message ?? "",
    });
    const persisted = await persistPrintJobWithBusinessProjection({
      workspace,
      printJob: after,
      printJobOperationLog: operationLog,
      printJobWriteMode: "update",
      operatorId,
      reason: body.reason ?? dispatchResult.message ?? "",
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
    });
    if (persisted.error) return persisted;
    return {
      printJob: persisted.printJob,
      dispatchResult,
      operationLogId: persisted.operationLogId,
      ...persisted.printProjection,
    };
  }

  async function pollPrintJobs({ workspace, body = {}, operatorId }) {
    const statuses = normalizePrintJobPollStatuses(body.statuses ?? body.status);
    const limit = normalizePositiveInteger(body.limit, 50, 200);
    const candidates = (await workspace.printJobRepository.listPrintJobs({ workspace, filters: {} }))
      .filter((printJob) => statuses.includes(printJob.jobStatus))
      .slice(0, limit);
    const items = [];
    for (const printJob of candidates) {
      items.push(await pollPrintJobDriverStatus({ workspace, printJob, body, operatorId }));
    }
    return {
      polledAt: nowIso(now),
      requestedStatuses: statuses,
      totalCandidates: candidates.length,
      updatedCount: items.filter((item) => item.updated).length,
      unchangedCount: items.filter((item) => !item.updated && !item.error).length,
      errorCount: items.filter((item) => item.error).length,
      items,
    };
  }

  async function pollPrintJobById({ workspace, printJobId, body = {}, operatorId }) {
    const printJob = await findPrintJob(workspace, printJobId);
    if (!printJob) return notFound();
    return pollPrintJobDriverStatus({ workspace, printJob, body, operatorId });
  }

  async function pollPrintJobDriverStatus({ workspace, printJob, body, operatorId }) {
    const pollResult = await workspace.printDriverAdapter.pollPrintJobStatus({
      printJob,
      operatorId,
      reason: body.reason ?? "",
    });
    if (!pollResult.status) {
      return {
        printJobId: printJob.printJobId,
        beforeStatus: printJob.jobStatus,
        afterStatus: printJob.jobStatus,
        updated: false,
        printJob,
        pollResult,
        operationLogId: "",
      };
    }
    const driverStatusResult = await recordPrintJobDriverStatus({
      workspace,
      printJobId: printJob.printJobId,
      body: { ...pollResult, idempotencyKey: body.idempotencyKey },
      operatorId,
    });
    if (driverStatusResult.error) {
      return {
        printJobId: printJob.printJobId,
        beforeStatus: printJob.jobStatus,
        afterStatus: printJob.jobStatus,
        updated: false,
        error: true,
        statusCode: driverStatusResult.statusCode,
        code: driverStatusResult.code,
        message: driverStatusResult.message,
        pollResult,
      };
    }
    return {
      printJobId: printJob.printJobId,
      beforeStatus: printJob.jobStatus,
      afterStatus: driverStatusResult.printJob.jobStatus,
      updated: driverStatusResult.printJob.jobStatus !== printJob.jobStatus,
      printJob: driverStatusResult.printJob,
      pollResult,
      driverStatusEvent: driverStatusResult.driverStatusEvent,
      operationLogId: driverStatusResult.operationLogId,
    };
  }

  async function recordPrintJobDriverStatus({ workspace, printJobId, body = {}, operatorId }) {
    const before = await findPrintJob(workspace, printJobId);
    if (!before) return notFound();

    const driverStatusEvent = buildPrintJobDriverStatusEvent(body, operatorId, now);
    if (!isAllowedPrintJobStatusUpdate(driverStatusEvent.status)) {
      return businessError(
        422,
        "INVALID_PRINT_JOB_DRIVER_STATUS",
        "Driver status must be queued, sent, printed, failed, or canceled.",
      );
    }
    const transitionError = getPrintJobDriverStatusTransitionError(before, driverStatusEvent);
    if (transitionError) return { error: true, ...transitionError };

    const after = buildDriverStatusPrintJobRecord(before, driverStatusEvent, now);
    const reason = body.reason ?? driverStatusEvent.message ?? driverStatusEvent.errorMessage ?? driverStatusEvent.driverStatus;
    const operationLog = buildOperationLog(workspace, {
      targetType: "print_job",
      targetId: printJobId,
      action: "record_print_job_driver_status",
      operatorId: driverStatusEvent.operatorId,
      before,
      after,
      reason,
    });
    const persisted = await persistPrintJobWithBusinessProjection({
      workspace,
      printJob: after,
      printJobOperationLog: operationLog,
      printJobWriteMode: "update",
      operatorId: driverStatusEvent.operatorId,
      reason,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
    });
    if (persisted.error) return persisted;
    return {
      printJob: persisted.printJob,
      driverStatusEvent,
      operationLogId: persisted.operationLogId,
      ...persisted.printProjection,
    };
  }

  async function retryPrintJob({ workspace, printJobId, body = {}, operatorId }) {
    const before = await findPrintJob(workspace, printJobId);
    if (!before) return notFound();
    if (!["failed", "canceled"].includes(before.jobStatus)) {
      return businessError(
        409,
        "PRINT_JOB_RETRY_REQUIRES_FAILED_JOB",
        "Only failed or canceled print jobs can be retried.",
      );
    }
    const retryJob = buildRetryPrintJobRecord(workspace, before, body, operatorId, now);
    const operationLog = buildOperationLog(workspace, {
      targetType: "print_job",
      targetId: retryJob.printJobId,
      action: "retry_print_job",
      operatorId,
      before,
      after: retryJob,
      reason: body.retryReason ?? body.reason ?? "",
    });
    const persisted = await persistPrintJobWithBusinessProjection({
      workspace,
      printJob: retryJob,
      printJobOperationLog: operationLog,
      printJobWriteMode: "create",
      operatorId,
      reason: body.retryReason ?? body.reason ?? "",
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
    });
    if (persisted.error) return persisted;
    return {
      sourcePrintJob: before,
      printJob: persisted.printJob,
      operationLogId: persisted.operationLogId,
      ...persisted.printProjection,
    };
  }

  function syncBusinessProjection(input) {
    return printJobBusinessProjectionService.syncPrintJobBusinessProjection(input);
  }

  async function persistPrintJobWithBusinessProjection({
    workspace,
    printJob,
    printJobOperationLog,
    printJobWriteMode,
    operatorId,
    reason,
    idempotencyKey,
    idempotencyPayload,
  }) {
    const atomicProjection = await printJobBusinessProjectionService.persistFulfillmentPrintJobProjection({
      workspace,
      printJob,
      printJobOperationLog,
      printJobWriteMode,
      operatorId,
      reason,
      idempotencyKey,
    });
    if (atomicProjection?.error) return atomicProjection;
    if (atomicProjection?.handled) {
      const { handled: _handled, printJob: savedPrintJob, operationLogId, ...printProjection } = atomicProjection;
      return {
        printJob: savedPrintJob,
        operationLogId,
        printProjection,
      };
    }

    const transaction = await workspace.printJobRepository[
      printJobWriteMode === "create" ? "createPrintJob" : "updatePrintJob"
    ]({
      workspace,
      printJob,
      operationLog: printJobOperationLog,
      idempotencyKey,
      idempotencyPayload,
    });
    const printProjection = await syncBusinessProjection({
      workspace,
      printJob: transaction.printJob,
      operatorId,
      reason,
      idempotencyKey,
    });
    return {
      printJob: transaction.printJob,
      operationLogId: transaction.operationLogId,
      printProjection,
    };
  }

  return {
    updatePrintJobStatus,
    dispatchPrintJob,
    pollPrintJobs,
    pollPrintJobById,
    recordPrintJobDriverStatus,
    retryPrintJob,
  };
}

function buildRetryPrintJobRecord(workspace, sourcePrintJob, body, operatorId, now) {
  const createdAt = nowIso(now);
  const attemptNo = Number(sourcePrintJob.attemptNo ?? 1) + 1;
  const jobStatus = sourcePrintJob.driverMode === "preview_only" ? "preview_only" : "queued";
  const printJobId =
    body.printJobId ??
    nextPlainId("PJ", `${sourcePrintJob.printJobId}-retry-${attemptNo}-${(workspace.printJobs ?? []).length + 1}`);
  return {
    ...sourcePrintJob,
    printJobId,
    bizNo: printJobId,
    jobStatus,
    attemptNo,
    sourcePrintJobId: sourcePrintJob.printJobId,
    requestedBy: operatorId,
    queuedAt: jobStatus === "queued" ? createdAt : "",
    sentAt: "",
    finishedAt: "",
    errorCode: "",
    errorMessage: "",
    metadata: {
      ...sourcePrintJob.metadata,
      retryOfPrintJobId: sourcePrintJob.printJobId,
      retryReason: normalizeText(body.retryReason ?? body.reason),
      retryRequestedBy: operatorId,
    },
    operationLogId: "",
    createdAt,
    updatedAt: createdAt,
  };
}

function buildDispatchedPrintJobRecord(printJob, dispatchResult, now) {
  const dispatchedAt = dispatchResult.dispatchedAt ?? nowIso(now);
  const jobStatus = dispatchResult.jobStatus ?? printJob.jobStatus;
  return {
    ...printJob,
    jobStatus,
    queuedAt: jobStatus === "queued" && !printJob.queuedAt ? dispatchedAt : printJob.queuedAt,
    sentAt: jobStatus === "sent" ? dispatchedAt : printJob.sentAt,
    finishedAt: ["failed", "canceled", "printed"].includes(jobStatus) ? dispatchedAt : printJob.finishedAt,
    errorCode: jobStatus === "failed" ? dispatchResult.errorCode ?? "" : "",
    errorMessage: jobStatus === "failed" ? dispatchResult.errorMessage ?? dispatchResult.message ?? "" : "",
    metadata: {
      ...printJob.metadata,
      lastDispatch: dispatchResult,
      lastDispatchedAt: dispatchedAt,
      lastDispatchAdapterStatus: dispatchResult.adapterStatus,
    },
    updatedAt: dispatchedAt,
  };
}

function buildPrintJobDriverStatusEvent(body, operatorId, now) {
  const currentTime = nowIso(now);
  const eventAt = normalizeDriverEventTimestamp(body.eventAt ?? body.polledAt ?? body.callbackAt, currentTime);
  const status = normalizeText(body.status ?? body.jobStatus);
  const reportedBy = normalizeText(body.operatorId ?? body.reportedBy);
  const normalizedOperatorId = normalizeText(operatorId ?? "U-PRINT-DRIVER-A") || "U-PRINT-DRIVER-A";
  const metadata = isPlainObject(body.metadata) ? body.metadata : {};
  return {
    adapterName: normalizeText(body.adapterName ?? body.adapter ?? "print-driver") || "print-driver",
    eventSource: normalizePrintJobDriverEventSource(body.eventSource ?? body.source),
    status,
    externalJobId: normalizeText(body.externalJobId ?? body.external_job_id),
    driverStatus: normalizeText(body.driverStatus ?? body.rawStatus ?? status) || status,
    eventAt,
    operatorId: normalizedOperatorId,
    errorCode: normalizeText(body.errorCode ?? body.error_code),
    errorMessage: normalizeText(body.errorMessage ?? body.error_message),
    message: normalizeText(body.message ?? body.reason),
    metadata: reportedBy && reportedBy !== normalizedOperatorId ? { ...metadata, reportedBy } : metadata,
  };
}

function getPrintJobDriverStatusTransitionError(printJob, driverStatusEvent) {
  if (printJob.jobStatus === "preview_only") {
    return businessErrorFields(409, "PRINT_JOB_DRIVER_CALLBACK_NOT_EXPECTED", "Preview-only print jobs cannot receive driver callbacks.");
  }
  const expectedExternalJobId = getExpectedPrintJobExternalJobId(printJob);
  if (expectedExternalJobId && driverStatusEvent.externalJobId && expectedExternalJobId !== driverStatusEvent.externalJobId) {
    return businessErrorFields(409, "PRINT_JOB_EXTERNAL_ID_MISMATCH", "Driver callback externalJobId does not match the dispatched print job.");
  }
  if (["printed", "failed", "canceled"].includes(printJob.jobStatus) && driverStatusEvent.status !== printJob.jobStatus) {
    return businessErrorFields(409, "PRINT_JOB_TERMINAL_STATUS_LOCKED", "Terminal print jobs cannot be changed by a later driver callback.");
  }
  const allowedNextStatuses = {
    queued: ["queued", "sent", "printed", "failed", "canceled"],
    sent: ["sent", "printed", "failed", "canceled"],
    printed: ["printed"],
    failed: ["failed"],
    canceled: ["canceled"],
  };
  if (!(allowedNextStatuses[printJob.jobStatus] ?? []).includes(driverStatusEvent.status)) {
    return businessErrorFields(409, "PRINT_JOB_STATUS_REGRESSION", `Cannot move print job from ${printJob.jobStatus} to ${driverStatusEvent.status}.`);
  }
  return null;
}

function buildDriverStatusPrintJobRecord(printJob, driverStatusEvent, now) {
  const eventAt = driverStatusEvent.eventAt ?? nowIso(now);
  const jobStatus = driverStatusEvent.status;
  const terminal = ["printed", "failed", "canceled"].includes(jobStatus);
  const errorCode = jobStatus === "failed" ? driverStatusEvent.errorCode || "DRIVER_REPORTED_FAILED" : "";
  const errorMessage =
    jobStatus === "failed"
      ? driverStatusEvent.errorMessage || driverStatusEvent.message || "Print driver reported failure."
      : "";
  const metadata = isPlainObject(printJob.metadata) ? printJob.metadata : {};
  const driverStatusEvents = Array.isArray(metadata.driverStatusEvents) ? metadata.driverStatusEvents : [];
  const externalJobId = driverStatusEvent.externalJobId || metadata.externalJobId || metadata.lastDispatch?.externalJobId || "";
  return {
    ...printJob,
    jobStatus,
    queuedAt: jobStatus === "queued" && !printJob.queuedAt ? eventAt : printJob.queuedAt,
    sentAt: ["sent", "printed"].includes(jobStatus) && !printJob.sentAt ? eventAt : printJob.sentAt,
    finishedAt: terminal ? eventAt : printJob.finishedAt,
    errorCode,
    errorMessage,
    metadata: {
      ...metadata,
      externalJobId,
      lastDriverStatusEvent: driverStatusEvent,
      lastDriverStatusAt: eventAt,
      driverStatusEvents: [...driverStatusEvents, driverStatusEvent].slice(-10),
    },
    updatedAt: eventAt,
  };
}

function normalizePrintJobPollStatuses(value) {
  const raw = Array.isArray(value) ? value : normalizeText(value).split(",");
  const statuses = raw.map(normalizeText).filter((status) => ["queued", "sent"].includes(status));
  return statuses.length > 0 ? [...new Set(statuses)] : ["queued", "sent"];
}

function normalizePositiveInteger(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function getExpectedPrintJobExternalJobId(printJob) {
  const metadata = isPlainObject(printJob.metadata) ? printJob.metadata : {};
  return normalizeText(
    metadata.externalJobId ?? metadata.lastDriverStatusEvent?.externalJobId ?? metadata.lastDispatch?.externalJobId,
  );
}

function normalizePrintJobDriverEventSource(value) {
  const source = normalizeText(value);
  return ["driver_callback", "driver_poll", "operator_confirmation", "dry_run_check"].includes(source)
    ? source
    : "driver_callback";
}

function normalizeDriverEventTimestamp(value, fallback) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
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

function isAllowedPrintJobStatusUpdate(status) {
  return ["queued", "sent", "printed", "failed", "canceled"].includes(status);
}

function nextPlainId(prefix, value) {
  return `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, "-")}`;
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}

function businessErrorFields(statusCode, code, message) {
  return { statusCode, code, message };
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
