import { fulfillmentNoteReadiness, noteDocumentTypes } from "../../shared/fulfillmentNoteReadiness.js";

export function hasVoidedNoteSource(workspace, record, job) {
  if (record.printAction !== "reprint") return false;
  const payload = job?.payload ?? job?.payloadSnapshot;
  const request = payload?.request;
  // A new queued reprint carries the exact voided ID. An older queued reprint only
  // stored its validated action, so require an earlier voided note for the same batch.
  const exact = !job || Object.hasOwn(request ?? {}, "previousPrintRecordId");
  const previousId = job ? request?.previousPrintRecordId : record.previousPrintRecordId;
  const currentId = record.printRecordId ?? record.id;
  return (workspace.printRecords ?? []).some(prior => {
    const id = prior.printRecordId ?? prior.id;
    if (!id || id === currentId || prior.status !== "voided" || prior.targetType !== "fulfillment" || prior.targetId !== record.targetId) return false;
    const type = prior.documentType || (workspace.printJobs ?? []).find(row => row.printRecordId === id)?.documentType;
    return type === record.documentType && (!exact || id === previousId)
      && (!job || Date.parse(prior.createdAt) <= Date.parse(record.createdAt));
  });
}

// Jobs created before the readiness check still exist in the print queue.
// Recheck their frozen quantity before returning a printable PDF or sending it to a device.
export function queuedNoteError(workspace, job) {
  const template = (job.payload ?? job.payloadSnapshot)?.printTemplate;
  const docType = template?.documentType ?? job.documentType;
  if (!noteDocumentTypes.includes(docType)) return null;
  const targetId = job.targetId || template?.fields?.fulfillmentId;
  const fulfillment = (workspace.fulfillments ?? []).find(row => (row.fulfillmentId ?? row.id) === targetId);
  const lineId = fulfillment?.orderLineId ?? fulfillment?.lineId;
  const line = (workspace.orderLines ?? []).find(row => (row.orderLineId ?? row.id) === lineId);
  const record = (workspace.printRecords ?? []).find(row => (row.printRecordId ?? row.id) === job.printRecordId);
  if (!fulfillment || !record || record.targetType !== "fulfillment" || record.targetId !== targetId || record.status === "voided") {
    return { error: true, statusCode: 409, code: "FULFILLMENT_NOTE_NOT_CURRENT", message: "这张纸单缺少有效打印记录，请回发货安排核对。" };
  }
  const result = fulfillmentNoteReadiness(workspace, fulfillment, line, {
    historicalReprint: (job.jobStatus === "printed" && ["printed", "reprinted"].includes(record.status))
      || hasVoidedNoteSource(workspace, record, job),
    printedQty: template?.fields?.totalQuantity ?? null,
  });
  return result.ready ? null : { error: true, statusCode: 409, code: "FULFILLMENT_NOTE_NOT_READY", message: result.reason };
}
