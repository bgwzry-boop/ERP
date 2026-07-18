export function createDeliveryEvidencePolicyService() {
  return Object.freeze({
    hasDriverWatermarkEvidence,
    normalizeDeliveryEvidenceReviewStatus,
    normalizeTimestamp,
  });
}

function hasDriverWatermarkEvidence(body = {}) {
  return (
    body.watermarkedPhotoAttached === true ||
    Boolean(String(body.watermarkedPhotoAttachmentId ?? "").trim()) ||
    Boolean(String(body.watermarkedPhotoId ?? "").trim()) ||
    Boolean(String(body.watermarkedPhotoUrl ?? "").trim())
  );
}

function normalizeDeliveryEvidenceReviewStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["已复核", "approved", "reviewed", "pass", "passed", "ok"].includes(normalized)) return "已复核";
  if (["需重拍", "rejected", "reject", "retake_required", "needs_retake", "failed"].includes(normalized)) {
    return "需重拍";
  }
  return "";
}

function normalizeTimestamp(value, fallback) {
  const timestamp = String(value ?? "").trim();
  if (timestamp && Number.isFinite(Date.parse(timestamp))) return new Date(timestamp).toISOString();
  return fallback;
}
