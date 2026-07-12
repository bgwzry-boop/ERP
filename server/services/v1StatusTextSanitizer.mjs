export function sanitizeV1RoleTaskActionText(value) {
  return cleanText(value)
    .replace(/\bevidenceRef\b/g, "现场证据编号")
    .replace(/\bsigner\s*\/\s*signedAt\b/g, "签字人 / 签字时间")
    .replace(/\bsigner\b/g, "签字人")
    .replace(/\bsignedAt\b/g, "签字时间")
    .replace(/\bonsiteSigner\b/g, "现场签字人")
    .replace(/\bonsiteSignedAt\b/g, "现场签字时间")
    .replace(/\bonsiteConfirmedBy\b/g, "现场确认人")
    .replace(/\bonsiteConfirmedAt\b/g, "现场确认时间")
    .replace(/\/Users\/\S+/g, "<本地路径已隐藏>")
    .replace(/\/private\/\S+/g, "<本地路径已隐藏>")
    .replace(/\.erp-local-storage\/\S+/g, "<本地产物路径已隐藏>")
    .replace(/REPLACE_WITH_[A-Z0-9_]+/g, "<待填写>");
}

function cleanText(value) {
  return String(value ?? "").trim();
}
