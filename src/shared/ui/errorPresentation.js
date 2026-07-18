const NETWORK_ERROR_PATTERN = /failed to fetch|fetch failed|networkerror|network request failed|load failed/i;

export function formatOperationalError(error, fallback = "数据暂时无法同步，请稍后重试。") {
  const message = typeof error === "string" ? error : error?.message;
  const normalized = String(message ?? "").trim();
  if (!normalized) return fallback;
  if (NETWORK_ERROR_PATTERN.test(normalized)) return "数据读取失败，请刷新重试。";
  if (/abort|cancel/i.test(normalized)) return "本次读取已取消，请重新刷新。";
  return normalized;
}
