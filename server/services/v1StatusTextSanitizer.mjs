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

export function sanitizeV1SensitiveStatusText(value) {
  return sanitizeV1RoleTaskActionText(value)
    .replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'",;]+/gi, "<连接串已隐藏>")
    .replace(/\bhttps?:\/\/[^\s'",;]+/gi, "<服务地址已隐藏>")
    .replace(/\bBearer\s+[^\s'",;]+/gi, "Bearer <令牌已隐藏>")
    .replace(/(?:\/var|\/tmp)\/[^\s'",;]+/g, "<本地路径已隐藏>")
    .replace(
      /(--(?:token|secret|password|database-url|endpoint|bucket|access-key(?:-id)?|secret-access-key))(?:=|\s+)(?:"[^"]*"|'[^']*'|[^\s]+)/gi,
      "$1 <值已隐藏>",
    )
    .replace(
      /\b((?:database[-_ ]?url|connection[-_ ]?string|endpoint|bucket|access[-_ ]?key(?:[-_ ]?id)?|secret[-_ ]?access[-_ ]?key|token|password|secret))(?:=|:\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1=<值已隐藏>",
    )
    .replace(
      /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|DATABASE_URL|ACCESS_KEY|ENDPOINT|BUCKET)[A-Z0-9_]*)=([^\s,;]+)/g,
      "$1=<值已隐藏>",
    );
}

function cleanText(value) {
  return String(value ?? "").trim();
}
