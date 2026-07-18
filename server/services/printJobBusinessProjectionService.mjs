export function createPrintJobBusinessProjectionService({
  buildFulfillmentActionRecord,
  buildOperationLog,
} = {}) {
  assertFunction(buildFulfillmentActionRecord, "buildFulfillmentActionRecord");
  assertFunction(buildOperationLog, "buildOperationLog");

  return {
    async persistFulfillmentPrintJobProjection({
      workspace,
      printJob,
      printJobOperationLog,
      printJobWriteMode = "update",
      operatorId,
      reason = "",
      idempotencyKey = "",
    }) {
      const plan = buildPrintJobBusinessProjectionPlan({
        workspace,
        printJob,
        operatorId,
        reason,
        buildOperationLog,
      });
      if (!plan) return { handled: false };
      if (!plan.fulfillment) {
        if (plan.targetType === "fulfillment" && isProductionWorkspace(workspace)) {
          return businessError(
            "PRINT_FULFILLMENT_PROJECTION_REQUIRED",
            "Production print status cannot update without its fulfillment projection.",
          );
        }
        return { handled: false };
      }

      const transactionRepository = workspace.fulfillmentActionTransactionRepository;
      const canPersistAtomically =
        transactionRepository?.kind === "postgres" &&
        typeof transactionRepository.recordFulfillmentPrint === "function";
      if (!canPersistAtomically) {
        if (isProductionWorkspace(workspace)) {
          return businessError(
            "PRINT_STATUS_TRANSACTION_PERSISTENCE_REQUIRED",
            "Production print status requires one atomic print-job and fulfillment transaction.",
          );
        }
        return { handled: false };
      }

      const transaction = await transactionRepository.recordFulfillmentPrint({
        workspace,
        idempotencyKey,
        idempotencyPayload: {
          printJobId: printJob.printJobId,
          printRecordId: plan.printRecordId,
          jobStatus: plan.jobStatus,
          reason,
          printJobWriteMode,
        },
        fulfillment: buildFulfillmentActionRecord(workspace, plan.nextFulfillment, {
          operatorId,
          actualQty: plan.nextFulfillment.actualQty ?? plan.nextFulfillment.qty,
        }),
        printRecord: plan.printRecord,
        packages: plan.nextPackages,
        operationLog: plan.operationLog,
        printJob,
        printJobWriteMode,
        printJobOperationLog,
      });

      return {
        handled: true,
        printJob: transaction.printJob ?? printJob,
        operationLogId: transaction.printJobOperationLogId,
        fulfillment: formatProjectionFulfillment(transaction.fulfillment ?? plan.nextFulfillment, plan),
        printRecord: transaction.printRecord ?? plan.printRecord,
        packages: transaction.packages ?? plan.nextPackages,
        fulfillmentOperationLogId: transaction.operationLogId,
        physicalPrintConfirmed: plan.physicalPrintConfirmed,
        printTrustStatus: plan.printTrustStatus,
      };
    },

    async syncPrintJobBusinessProjection({
      workspace,
      printJob,
      operatorId,
      reason = "",
      idempotencyKey = "",
    }) {
      const plan = buildPrintJobBusinessProjectionPlan({
        workspace,
        printJob,
        operatorId,
        reason,
        buildOperationLog,
      });
      if (!plan) return {};
      if (!plan.fulfillment) {
        workspace.printRecords = upsertByKey(workspace.printRecords ?? [], plan.printRecord, "printRecordId");
        return { printRecord: plan.printRecord, physicalPrintConfirmed: plan.physicalPrintConfirmed };
      }
      const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
        workspace,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}:business-projection` : "",
        idempotencyPayload: {
          printJobId: printJob.printJobId,
          printRecordId: plan.printRecordId,
          jobStatus: plan.jobStatus,
          reason,
        },
        fulfillment: buildFulfillmentActionRecord(workspace, plan.nextFulfillment, {
          operatorId,
          actualQty: plan.nextFulfillment.actualQty ?? plan.nextFulfillment.qty,
        }),
        printRecord: plan.printRecord,
        packages: plan.nextPackages,
        operationLog: plan.operationLog,
      });

      return {
        fulfillment: formatProjectionFulfillment(transaction.fulfillment ?? plan.nextFulfillment, plan),
        printRecord: transaction.printRecord ?? plan.printRecord,
        packages: transaction.packages ?? plan.nextPackages,
        fulfillmentOperationLogId: transaction.operationLogId,
        physicalPrintConfirmed: plan.physicalPrintConfirmed,
        printTrustStatus: plan.printTrustStatus,
      };
    },
  };
}

function buildPrintJobBusinessProjectionPlan({ workspace, printJob, operatorId, reason, buildOperationLog }) {
  const printRecordId = normalizeText(printJob?.printRecordId);
  if (!printRecordId || printJob?.jobStatus === "preview_only") return null;

  const beforePrintRecord = findPrintRecord(workspace, printRecordId);
  if (!beforePrintRecord) return null;
  if (beforePrintRecord.status === "voided") return null;

  const jobStatus = normalizeText(printJob.jobStatus);
  const submittedStatus = beforePrintRecord.printAction === "reprint" ? "reprint_submitted" : "submitted";
  const nextPrintRecordStatus = getNextPrintRecordStatus({ beforePrintRecord, jobStatus, submittedStatus });
  if (nextPrintRecordStatus === beforePrintRecord.status && jobStatus !== "printed") return null;

  const now = printJob.finishedAt || printJob.updatedAt || new Date().toISOString();
  const printRecord = {
    ...beforePrintRecord,
    status: nextPrintRecordStatus,
    printedAt: jobStatus === "printed" ? now : beforePrintRecord.printedAt ?? "",
    jobStatus,
    printJobId: printJob.printJobId,
    updatedAt: now,
  };
  const fulfillment =
    beforePrintRecord.targetType === "fulfillment"
      ? findFulfillment(workspace, beforePrintRecord.targetId)
      : null;
  const isPackageLabel = normalizeText(beforePrintRecord.documentType ?? printJob.documentType) === "express_ltl_label";
  const labelTrust = fulfillment ? evaluateFulfillmentLabelTrust(workspace, { fulfillment, printRecord, isPackageLabel }) : null;
  const physicalPrintConfirmed =
    jobStatus === "printed" && (!labelTrust?.required || labelTrust.trusted === true);
  const nextPackages = physicalPrintConfirmed && labelTrust?.required
    ? labelTrust.packages.map((item) => ({
        ...item,
        status: "已打印标签",
        labelPrintRecordId: printRecordId,
        revision: normalizeRevision(item.revision) + 1,
      }))
    : [];
  const nextFulfillment = physicalPrintConfirmed && fulfillment
    ? {
        ...fulfillment,
        ...(isPackageLabel ? { labelsPrinted: true } : { printed: true }),
        status:
          isPackageLabel && normalizeFulfillmentMethod(fulfillment.method) === "express_ltl" && fulfillment.status !== "已交付"
            ? "待打印出库单"
            : fulfillment.status,
        printBatch: printRecord.batchNo ?? fulfillment.printBatch ?? "",
        printedAt: printRecord.printedAt,
      }
    : fulfillment;
  const operationLog = fulfillment
    ? buildOperationLog(workspace, {
        id: buildProjectionOperationLogId(printJob.printJobId, jobStatus),
        targetType: physicalPrintConfirmed ? "fulfillment" : "print_record",
        targetId: physicalPrintConfirmed ? fulfillment.id : printRecordId,
        action: physicalPrintConfirmed
          ? "confirm_fulfillment_print_from_driver"
          : labelTrust?.required && jobStatus === "printed"
            ? "record_stale_fulfillment_label_print"
            : "sync_print_record_from_job",
        operatorId,
        before: physicalPrintConfirmed ? { fulfillment, packages: labelTrust?.packages ?? [] } : beforePrintRecord,
        after: physicalPrintConfirmed ? { fulfillment: nextFulfillment, packages: nextPackages } : printRecord,
        reason:
          reason ||
          (labelTrust?.required && jobStatus === "printed" && !labelTrust.trusted
            ? `print_job_printed_without_current_label_snapshot:${labelTrust.reason}`
            : `print_job_${jobStatus}`),
      })
    : null;
  return {
    printRecordId,
    targetType: beforePrintRecord.targetType,
    jobStatus,
    printRecord,
    fulfillment,
    nextFulfillment,
    nextPackages,
    operationLog,
    physicalPrintConfirmed,
    isPackageLabel,
    printTrustStatus: labelTrust?.required ? (labelTrust.trusted ? "current" : labelTrust.reason) : "not_required",
  };
}

function formatProjectionFulfillment(fulfillment, plan) {
  return {
    ...fulfillment,
    printed:
      plan.physicalPrintConfirmed && !plan.isPackageLabel
        ? true
        : Boolean(plan.nextFulfillment.printed),
    printRecordStatus: plan.printRecord.status,
    activePrintRecordId: plan.printRecord.printRecordId,
    printTrustStatus: plan.printTrustStatus,
  };
}

function evaluateFulfillmentLabelTrust(workspace, { fulfillment, printRecord, isPackageLabel = false }) {
  const required = normalizeFulfillmentMethod(fulfillment.method) === "express_ltl" && isPackageLabel;
  if (!required) return { required: false, trusted: true, reason: "not_required", packages: [] };

  const packages = listFulfillmentPackages(workspace, fulfillment);
  const snapshot = normalizePackageSnapshot(printRecord.packageSnapshot ?? printRecord.package_snapshot_json);
  if (!Number.isInteger(Number(printRecord.fulfillmentRevision)) || snapshot.length === 0) {
    return { required, trusted: false, reason: "legacy_or_missing_snapshot", packages };
  }
  if (normalizeRevision(fulfillment.revision) !== normalizeRevision(printRecord.fulfillmentRevision)) {
    return { required, trusted: false, reason: "fulfillment_revision_changed", packages };
  }
  if (packages.length !== snapshot.length) {
    return { required, trusted: false, reason: "package_set_changed", packages };
  }
  const currentById = new Map(packages.map((item) => [item.packageId, item]));
  const allMatched = snapshot.every((item) => {
    const current = currentById.get(item.packageId);
    return current && normalizeRevision(current.revision) === normalizeRevision(item.revision);
  });
  return {
    required,
    trusted: allMatched,
    reason: allMatched ? "current" : "package_revision_changed",
    packages,
  };
}

export function hasTrustedCurrentFulfillmentLabel(workspace, fulfillment) {
  if (normalizeFulfillmentMethod(fulfillment?.method) !== "express_ltl") return true;
  const fulfillmentId = normalizeText(fulfillment?.fulfillmentId ?? fulfillment?.id);
  const currentPrintRecord = [...(workspace?.printRecords ?? [])]
    .filter(
      (item) =>
        normalizeText(item?.targetType) === "fulfillment" &&
        normalizeText(item?.targetId) === fulfillmentId &&
        isExpressLabelPrintRecord(item) &&
        ["printed", "reprinted"].includes(normalizeText(item?.status)),
    )
    .sort((left, right) => {
      const timestamp = normalizeText(right.printedAt ?? right.createdAt).localeCompare(
        normalizeText(left.printedAt ?? left.createdAt),
      );
      return timestamp || normalizeText(right.printRecordId ?? right.id).localeCompare(normalizeText(left.printRecordId ?? left.id));
    })[0];
  return Boolean(currentPrintRecord && isPersistedFulfillmentLabelTrust(workspace, { fulfillment, printRecord: currentPrintRecord }));
}

function isExpressLabelPrintRecord(record = {}) {
  const documentType = normalizeText(record.documentType ?? record.document_type);
  if (documentType) return documentType === "express_ltl_label";
  const templateId = normalizeText(record.templateId ?? record.template_id);
  if (templateId) return templateId === "tpl-p0-express-ltl-label";
  return normalizePackageSnapshot(record.packageSnapshot ?? record.package_snapshot_json).length > 0;
}

function isPersistedFulfillmentLabelTrust(workspace, { fulfillment, printRecord }) {
  const snapshot = normalizePackageSnapshot(printRecord.packageSnapshot ?? printRecord.package_snapshot_json);
  const packages = listFulfillmentPackages(workspace, fulfillment);
  const printRecordId = normalizeText(printRecord.printRecordId ?? printRecord.id);
  if (
    !Number.isInteger(Number(printRecord.fulfillmentRevision)) ||
    snapshot.length === 0 ||
    packages.length !== snapshot.length ||
    normalizeRevision(fulfillment.revision) !== normalizeRevision(printRecord.fulfillmentRevision) + 1
  ) {
    return false;
  }
  const currentById = new Map(packages.map((item) => [item.packageId, item]));
  return snapshot.every((item) => {
    const current = currentById.get(item.packageId);
    return (
      current &&
      normalizeText(current.labelPrintRecordId ?? current.label_print_record_id) === printRecordId &&
      normalizeRevision(current.revision) === normalizeRevision(item.revision) + 1 &&
      normalizeText(current.status) === "已打印标签"
    );
  });
}

function listFulfillmentPackages(workspace, fulfillment) {
  const fulfillmentId = normalizeText(fulfillment?.fulfillmentId ?? fulfillment?.id);
  return (workspace.packages ?? [])
    .filter((item) => normalizeText(item.fulfillmentId ?? item.fulfillment_id) === fulfillmentId)
    .map((item) => ({ ...item, packageId: normalizeText(item.packageId ?? item.id), revision: normalizeRevision(item.revision) }))
    .filter((item) => item.packageId)
    .sort((left, right) => left.packageId.localeCompare(right.packageId));
}

function normalizePackageSnapshot(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({ packageId: normalizeText(item?.packageId ?? item?.id), revision: normalizeRevision(item?.revision) }))
    .filter((item) => item.packageId)
    .sort((left, right) => left.packageId.localeCompare(right.packageId));
}

function getNextPrintRecordStatus({ beforePrintRecord, jobStatus, submittedStatus }) {
  if (jobStatus === "printed") return beforePrintRecord.printAction === "reprint" ? "reprinted" : "printed";
  if (jobStatus === "failed" || jobStatus === "canceled") return jobStatus;
  if (jobStatus === "queued" || jobStatus === "sent") return submittedStatus;
  return beforePrintRecord.status;
}

function findPrintRecord(workspace, printRecordId) {
  return (workspace.printRecords ?? []).find(
    (item) => item.printRecordId === printRecordId || item.id === printRecordId,
  );
}

function findFulfillment(workspace, fulfillmentId) {
  return (workspace.fulfillments ?? []).find(
    (item) => item.id === fulfillmentId || item.fulfillmentId === fulfillmentId,
  );
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

function buildProjectionOperationLogId(printJobId, jobStatus) {
  return `LOG-PRINT-PROJECTION-${String(`${printJobId}-${jobStatus}`).replace(/[^a-z0-9]+/gi, "-")}`;
}

function isProductionWorkspace(workspace) {
  return workspace.runtimeConfig?.production === true || workspace.runtimeConfig?.mode === "production";
}

function businessError(code, message) {
  return { error: true, statusCode: 409, code, message };
}

function upsertByKey(rows, record, key) {
  const index = rows.findIndex((item) => item[key] === record[key] || item.id === record[key]);
  if (index === -1) return [record, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? record : item));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeRevision(value) {
  return Math.max(1, Math.trunc(Number(value) || 1));
}

function assertFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
