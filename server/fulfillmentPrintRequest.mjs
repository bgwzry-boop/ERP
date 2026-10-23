import { buildIdempotencyRequestHash, buildIdempotencyConflictError } from "./idempotency.mjs";

export function buildFulfillmentPrintRequest({ fulfillmentId, body, operatorId }) {
  return {
    ...body,
    printAction: String(body.printAction ?? "").trim() || "first_print",
    fulfillmentId,
    operatorId,
    requestContract: "fulfillment-print-v2",
  };
}

export function assertFulfillmentPrintReplay(existing, saved, request) {
  const { fulfillmentId, body, operatorId } = request;
  const record = saved.printRecord;
  const job = saved.printJob;
  if (!record || !job || saved.fulfillment?.fulfillmentId !== fulfillmentId
    || record.targetType !== "fulfillment" || record.targetId !== fulfillmentId
    || job.targetType !== "fulfillment" || job.targetId !== fulfillmentId
    || job.printRecordId !== record.printRecordId || job.requestedBy !== operatorId
    || !saved.operationLogId || !saved.printJobOperationLogId || !job.payload?.printTemplate) {
    throw buildIdempotencyConflictError();
  }
  // Earlier requests hashed resolved template/document/package facts. Recover
  // those defaults only from the original receipt, never today's workspace.
  const legacy = {
    ...body,
    printAction: String(body.printAction ?? "").trim() || "first_print",
    documentType: String(body.documentType ?? "").trim() || job.documentType,
    templateId: body.templateId ?? job.templateId,
    packageIds: job.payload.request?.packageIds ?? [],
    operatorId,
  };
  if (![buildFulfillmentPrintRequest(request), { ...body, fulfillmentId, operatorId }, legacy].some(payload =>
    buildIdempotencyRequestHash(payload) === existing.requestHash)) {
    throw buildIdempotencyConflictError();
  }
}
