const NETWORK_ERROR_PATTERN = /failed to fetch|fetch failed|networkerror|network request failed|load failed/i;

export function formatOperationalError(error, fallback = "数据暂时无法同步，请稍后重试。") {
  const message = typeof error === "string" ? error : error?.message;
  const normalized = String(message ?? "").trim();
  if (!normalized) return fallback;
  if (NETWORK_ERROR_PATTERN.test(normalized)) return "数据读取失败，请刷新重试。";
  if (/abort|cancel/i.test(normalized)) return "本次读取已取消，请重新刷新。";
  return normalized;
}

// 数据库/驱动原文绝不显示给用户；只保留可读的业务提示。
const TECHNICAL_ERROR_PATTERN = /duplicate key|violates|constraint|relation|column|syntax error|SQLSTATE|\b[0-9]{5}\b|order_draft_lines_pkey|ECONNREFUSED|ETIMEDOUT|stack/i;
const CJK_PATTERN = /[\u4e00-\u9fa5]/u;

// 写操作失败时的用户提示：中文业务错误原样保留，技术原文统一替换。
export function formatWriteFailureMessage(error, fallback = "本次请求没有完成，请按原内容重试；若持续失败，请联系管理员。") {
  const message = typeof error === "string" ? error : error?.message;
  const normalized = String(message ?? "").trim();
  if (!normalized) return fallback;
  if (TECHNICAL_ERROR_PATTERN.test(normalized) || !CJK_PATTERN.test(normalized)) return fallback;
  return normalized;
}
