import { createHash } from "node:crypto";
import { getPendingDraftFieldReviews } from "../shared/orderDraftFieldReview.mjs";

export function buildOrderDraftSplitPlan({ draftId, revision, lines = [] } = {}) {
  const activeLines = lines.filter((line) => !isCancelledLine(line));
  const cancelledLines = lines.filter(isCancelledLine);
  const groupsByKey = new Map();

  for (const line of activeLines) {
    const customerId = clean(line.customerId);
    const sourceGroupId = clean(line.originalOrderGroupId) || "manual-group";
    const fulfillmentMethod = clean(line.fulfillment) || "待确认";
    const latestNeededAt = clean(line.latest) || "待确认";
    const key = [customerId || "待确认客户", sourceGroupId, fulfillmentMethod, latestNeededAt].join("|");
    const current = groupsByKey.get(key) ?? {
      key,
      customerId,
      customerName: clean(line.customer),
      sourceGroupId,
      fulfillmentMethod,
      latestNeededAt,
      lines: [],
    };
    current.lines.push(line);
    groupsByKey.set(key, current);
  }

  const groups = [...groupsByKey.values()].sort((left, right) => left.key.localeCompare(right.key, "zh-CN")).map((group, index) => {
    const draftLineIds = group.lines.map((line) => clean(line.id)).filter(Boolean).sort();
    const requiresReview = !group.customerId
      || ["", "待确认"].includes(group.fulfillmentMethod)
      || ["", "待确认"].includes(group.latestNeededAt)
      || group.lines.some((line) => getPendingDraftFieldReviews(line).length);
    return {
      groupId: `SPLIT-${shortHash(`${draftId}|${group.key}|${draftLineIds.join(",")}`)}`,
      sequence: index + 1,
      customerId: group.customerId,
      customerName: group.customerName,
      sourceGroupId: group.sourceGroupId,
      fulfillmentMethod: group.fulfillmentMethod,
      latestNeededAt: group.latestNeededAt,
      draftLineIds,
      _lineSnapshots: group.lines
        .map((line) => ({
          id: clean(line.id),
          product: clean(line.product),
          size: clean(line.size),
          color: clean(line.color),
          handle: clean(line.handle),
          handleColor: clean(line.handleColor),
          style: clean(line.style),
          print: clean(line.print),
          printColor: clean(line.printColor),
          printSide: clean(line.printSide),
          qty: finiteNumber(line.qty),
          fulfillment: clean(line.fulfillment),
          latest: clean(line.latest),
          note: clean(line.note),
        }))
        .sort((left, right) => left.id.localeCompare(right.id, "zh-CN")),
      lineCount: group.lines.length,
      quantityTotal: group.lines.reduce((sum, line) => sum + finiteNumber(line.qty), 0),
      amountTotal: roundMoney(group.lines.reduce((sum, line) => sum + finiteNumber(line.amount), 0)),
      requiresReview,
      reviewReasons: [
        !group.customerId ? "客户待确认" : "",
        ["", "待确认"].includes(group.fulfillmentMethod) ? "交付方式待确认" : "",
        ["", "待确认"].includes(group.latestNeededAt) ? "最晚时间待确认" : "",
        group.lines.some((line) => getPendingDraftFieldReviews(line).length) ? "识别字段待人工确认" : "",
      ].filter(Boolean),
    };
  });

  const normalized = {
    draftId: clean(draftId),
    revision: Math.max(0, Math.trunc(finiteNumber(revision))),
    groups: groups.map((group) => ({
      groupId: group.groupId,
      customerId: group.customerId,
      sourceGroupId: group.sourceGroupId,
      fulfillmentMethod: group.fulfillmentMethod,
      latestNeededAt: group.latestNeededAt,
      draftLineIds: group.draftLineIds,
      lineSnapshots: group._lineSnapshots,
    })),
    cancelledDraftLineIds: cancelledLines.map((line) => clean(line.id)).filter(Boolean).sort(),
  };

  return {
    version: "order-draft-split-plan-v1",
    ...normalized,
    planHash: createHash("sha256").update(JSON.stringify(normalized)).digest("hex"),
    groups: groups.map(({ _lineSnapshots, ...group }) => group),
    activeDraftLineCount: activeLines.length,
    cancelledDraftLineIds: normalized.cancelledDraftLineIds,
    canConfirm: groups.length > 1 && groups.every((group) => !group.requiresReview),
    noSplitNeeded: groups.length <= 1,
  };
}

export function assertOrderDraftSplitPlan(plan, expectedHash) {
  if (!plan?.groups?.length) return splitPlanError("ORDER_DRAFT_SPLIT_EMPTY", "没有可生成正式订单的明细。");
  if (plan.noSplitNeeded) return splitPlanError("ORDER_DRAFT_SPLIT_NOT_NEEDED", "当前明细只形成一个交付组，无需拆单。");
  if (plan.groups.some((group) => group.requiresReview)) {
    return splitPlanError("ORDER_DRAFT_SPLIT_REVIEW_REQUIRED", "拆单组仍有客户、交付方式或最晚时间待确认。");
  }
  if (!expectedHash || expectedHash !== plan.planHash) {
    return splitPlanError("ORDER_DRAFT_SPLIT_PLAN_CHANGED", "拆单预览已变化，请重新预览后再确认。", 409);
  }
  return null;
}

function isCancelledLine(line) {
  return line?.excludedFromConfirmation === true || line?.cancellationStatus === "库存不足取消";
}

function splitPlanError(code, message, statusCode = 422) {
  return { error: true, statusCode, code, message };
}

function shortHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12).toUpperCase();
}

function clean(value) {
  return String(value ?? "").trim();
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
  return Number(finiteNumber(value).toFixed(2));
}
