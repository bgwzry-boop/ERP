import { getBusinessDecisionChannelLabel } from "../../shared/businessDecisionCatalog.js";

export function formatBusinessDecisionChannelAndTime(delegatedDecision) {
  if (!delegatedDecision) return "本人系统操作 · 提交时";
  const channel = getBusinessDecisionChannelLabel(delegatedDecision.decisionChannel);
  const decidedAt = formatBusinessDecisionDateTime(delegatedDecision.decidedAt);
  return `${channel} · ${decidedAt}`;
}

export function getBusinessDecisionContentSummary({ delegatedDecision, directSummary = "", fallback = "" } = {}) {
  return String(delegatedDecision?.decisionContent?.summary ?? directSummary ?? fallback).trim() || "决定内容待补";
}

function formatBusinessDecisionDateTime(value) {
  if (!value) return "决定时间待补";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "决定时间待复核";
  return date.toLocaleString("zh-CN", { hour12: false });
}
