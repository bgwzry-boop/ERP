export function createPrintJobBusinessProjectionService({
  buildFulfillmentActionRecord,
  buildOperationLog,
} = {}) {
  assertFunction(buildFulfillmentActionRecord, "buildFulfillmentActionRecord");
  assertFunction(buildOperationLog, "buildOperationLog");

  return {
    async syncPrintJobBusinessProjection({
      workspace,
      printJob,
      operatorId,
      reason = "",
      idempotencyKey = "",
    }) {
      const printRecordId = normalizeText(printJob?.printRecordId);
      if (!printRecordId || printJob?.jobStatus === "preview_only") return {};

      const beforePrintRecord = findPrintRecord(workspace, printRecordId);
      if (!beforePrintRecord) return {};

      const jobStatus = normalizeText(printJob.jobStatus);
      const submittedStatus = beforePrintRecord.printAction === "reprint" ? "reprint_submitted" : "submitted";
      const nextPrintRecordStatus = getNextPrintRecordStatus({
        beforePrintRecord,
        jobStatus,
        submittedStatus,
      });
      if (nextPrintRecordStatus === beforePrintRecord.status && jobStatus !== "printed") return {};

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
      if (!fulfillment) {
        workspace.printRecords = upsertByKey(workspace.printRecords ?? [], printRecord, "printRecordId");
        return { printRecord, physicalPrintConfirmed: jobStatus === "printed" };
      }

      const physicalPrintConfirmed = jobStatus === "printed";
      const nextFulfillment = physicalPrintConfirmed
        ? {
            ...fulfillment,
            printed: true,
            status:
              normalizeFulfillmentMethod(fulfillment.method) === "express_ltl" && fulfillment.status !== "已交付"
                ? "待确认拉走"
                : fulfillment.status,
            printBatch: printRecord.batchNo ?? fulfillment.printBatch ?? "",
            printedAt: printRecord.printedAt,
          }
        : fulfillment;
      const operationLog = buildOperationLog(workspace, {
        id: buildProjectionOperationLogId(printJob.printJobId, jobStatus),
        targetType: physicalPrintConfirmed ? "fulfillment" : "print_record",
        targetId: physicalPrintConfirmed ? fulfillment.id : printRecordId,
        action: physicalPrintConfirmed ? "confirm_fulfillment_print_from_driver" : "sync_print_record_from_job",
        operatorId,
        before: physicalPrintConfirmed ? fulfillment : beforePrintRecord,
        after: physicalPrintConfirmed ? nextFulfillment : printRecord,
        reason: reason || `print_job_${jobStatus}`,
      });
      const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
        workspace,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}:business-projection` : "",
        idempotencyPayload: {
          printJobId: printJob.printJobId,
          printRecordId,
          jobStatus,
          reason,
        },
        fulfillment: buildFulfillmentActionRecord(workspace, nextFulfillment, {
          operatorId,
          actualQty: nextFulfillment.actualQty ?? nextFulfillment.qty,
        }),
        printRecord,
        operationLog,
      });

      return {
        fulfillment: {
          ...(transaction.fulfillment ?? nextFulfillment),
          printed: physicalPrintConfirmed ? true : Boolean(nextFulfillment.printed),
          printRecordStatus: printRecord.status,
          activePrintRecordId: printRecord.printRecordId,
        },
        printRecord: transaction.printRecord ?? printRecord,
        fulfillmentOperationLogId: transaction.operationLogId,
        physicalPrintConfirmed,
      };
    },
  };
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

function upsertByKey(rows, record, key) {
  const index = rows.findIndex((item) => item[key] === record[key] || item.id === record[key]);
  if (index === -1) return [record, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? record : item));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function assertFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
