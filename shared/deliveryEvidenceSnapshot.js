// Binds a review to the evidence and fulfillment revision actually read by its caller.
export function deliveryEvidenceSnapshot(record = {}) {
  return {
    revision: Number(record.revision ?? 1),
    watermarkedPhotoAttachmentId: record.watermarkedPhotoAttachmentId || "",
    signaturePhotoAttachmentId: record.signaturePhotoAttachmentId || "",
  };
}
export function matchesDeliveryEvidenceSnapshot(expected, record) {
  if (!expected || typeof expected !== "object") return false;
  const current = deliveryEvidenceSnapshot(record);
  return Number.isSafeInteger(expected.revision) && expected.revision > 0
    && Object.keys(current).every(key => expected[key] === current[key]);
}
