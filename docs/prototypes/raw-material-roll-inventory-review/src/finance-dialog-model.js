import { optionalFinancialAmount } from "../../../../src/services/officeStatementSelectors.js";

export function financeSessionKey(id, authState) {
  return JSON.stringify([id, authState?.session?.accessToken, authState?.permissions?.user?.userId,
    [...(authState?.permissions?.actionPermissions ?? [])].sort()]);
}
export function hasFinancePermission(authState, permission) {
  return authState?.permissions?.actionPermissions?.includes(permission) === true;
}

export function money(value) {
  const amount = optionalFinancialAmount(value);
  return amount !== null ? `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "待核实";
}

export function evidenceTime(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short", hour12: false }).format(date)
    : "未提供";
}

export function amountInCents(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("请填写大于零、最多两位小数的累计实收金额。");
  const [whole, decimal = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 99999999999999) throw new Error("累计实收金额超出可登记范围。");
  return cents;
}

export function paymentReview(detail, value) {
  const previous = optionalFinancialAmount(detail.received), receivable = optionalFinancialAmount(detail.receivable);
  if (previous === null || receivable === null) throw new Error("账单应收或累计实收金额待核实，请重新读取完整账单后再登记。");
  const cents = amountInCents(value);
  return {
    amount: cents / 100,
    previous,
    difference: (cents - Math.round(previous * 100)) / 100,
    unpaid: Math.max(0, Math.round(receivable * 100) - cents) / 100,
    overpaid: Math.max(0, cents - Math.round(receivable * 100)) / 100,
  };
}

export const printStatusLabels = Object.freeze({ queued: "待派发", sent: "已派发，等待设备回执", printed: "设备回执已完成", failed: "打印失败", canceled: "已取消", preview_only: "仅预览，未出纸" });
export function printAction(job) {
  if (["failed", "canceled"].includes(job?.jobStatus)) return "retry";
  if (["queued", "preview_only"].includes(job?.jobStatus)) return "dispatch";
  return "";
}
