export function formatCountLabel(value, unit) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return `${Math.trunc(parsed)} ${unit}`;
}

export function formatShownCountLabel(shown, total) {
  const parsedShown = Number(shown);
  const parsedTotal = Number(total);
  if (!Number.isFinite(parsedShown) || !Number.isFinite(parsedTotal) || parsedTotal <= 0) return "";
  return `${Math.trunc(parsedShown)}/${Math.trunc(parsedTotal)}`;
}

export function extractFirstCount(value) {
  return cleanText(value).match(/\d+\s*\/\s*\d+/)?.[0]?.replace(/\s+/g, "") || "";
}

export function extractFieldEvidenceCount(value) {
  return cleanText(value).match(/证据\s*(\d+\s*\/\s*\d+)/)?.[1]?.replace(/\s+/g, "") || "";
}

export function extractSignoffCount(value) {
  return cleanText(value).match(/签字\s*(\d+\s*\/\s*\d+)/)?.[1]?.replace(/\s+/g, "") || "";
}

export function formatDateTimeLabel(value) {
  const raw = cleanText(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function normalizeStringList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return raw.map((item) => cleanText(item)).filter(Boolean);
}

export function cleanText(value) {
  return String(value ?? "").trim();
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function formatUnblockTaskStatusLabel(value) {
  const status = cleanText(value) || "pending";
  const labels = {
    pending: "待处理",
    blocked: "阻塞",
    ready: "已满足",
    done: "已完成",
    completed: "已完成",
    accepted: "已确认",
  };
  return labels[status] || status;
}
