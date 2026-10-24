import {
  requestOfficeApi,
  readOfficeApiJson,
  toOfficeApiError,
  toOfficeApiTransportError,
} from "./officeApiClientCore.js";
import { mapDraftRowsToApiLines } from "./officeOrderApiClient.js";
import { normalizeOrderType } from "../../shared/orderRouting.js";

export async function quoteOfficeOrderDraft(input, options = {}) {
  try {
    const response = await requestOfficeApi(
      `/order-drafts/${encodeURIComponent(input.draftId)}/price-quote`,
      {
        ...options,
        serverRequired: true,
        authState: input.authState,
        method: "POST",
        idempotencyKey: input.idempotencyKey,
        body: {
          expectedRevision: input.clientRevision,
          sourceText: input.sourceText,
          lines: mapDraftRowsToApiLines(input.rows, input.sourceText),
          overrides: input.overrides,
          supplementation: input.supplementation,
        },
      },
    );
    const json = await readOfficeApiJson(response);
    if (!response.ok)
      return {
        source: "api_error",
        blocked: true,
        error: toOfficeApiError(
          json,
          response.status,
          "报价未完成，请重试，草稿仍保留。",
        ),
      };
    if (!isCompleteOfficePriceQuoteReceipt(json, input)) {
      return {
        source: "api_error",
        blocked: true,
        error: {
          code: "ORDER_PRICE_QUOTE_RECEIPT_INVALID",
          message: "没有取得完整报价回执，请重试核对，暂不能确认订单。",
        },
      };
    }
    return { source: "api", quote: json.quote, draft: json.draft };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: toOfficeApiTransportError(error, "报价暂未完成，请重试。"),
    };
  }
}

const nonnegative = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const sameSet = (left, right) =>
  left.length === right.length &&
  new Set(left).size === left.length &&
  [...left].sort().every((id, index) => id === [...right].sort()[index]);
export function isCompleteOfficePriceQuoteReceipt(json, input) {
  const quote = json?.quote;
  if (
    !quote ||
    typeof quote.quoteId !== "string" ||
    !quote.quoteId ||
    quote.draftId !== input.draftId ||
    quote.clientRevision !== Number(input.clientRevision) + 1 ||
    !Array.isArray(quote.lines) ||
    !quote.lines.length ||
    !Array.isArray(quote.groups) ||
    !Array.isArray(quote.affectedOrders) ||
    !Array.isArray(quote.excludedDraftLineIds)
  )
    return false;
  const rows = input.rows ?? [],
    requestIds = rows.map((row) => row.id),
    excluded = quote.excludedDraftLineIds;
  if (
    new Set(requestIds).size !== requestIds.length ||
    new Set(excluded).size !== excluded.length ||
    excluded.some((id) => !requestIds.includes(id))
  )
    return false;
  const active = requestIds.filter((id) => !excluded.includes(id));
  if (
    !sameSet(
      quote.lines.map((line) => line.draftLineId),
      active,
    )
  )
    return false;
  for (const line of quote.lines) {
    const row = rows.find((row) => row.id === line.draftLineId);
    if (
      ![line.bagPrice, line.printPrice, line.otherFee, line.amount].every(
        nonnegative,
      ) ||
      typeof line.adjustmentAmount !== "number" ||
      !Number.isFinite(line.adjustmentAmount) ||
      !Number.isSafeInteger(line.chargeableQty) ||
      line.chargeableQty < 0 ||
      line.chargeableQty > row.qty ||
      Math.round(
        ((line.bagPrice + line.printPrice) * line.chargeableQty +
          line.otherFee +
          line.adjustmentAmount +
          Number.EPSILON) *
          100,
      ) /
        100 !==
        line.amount
    )
      return false;
  }
  const expectedRelated = input.supplementation?.orderLineIds ?? [];
  if (
    !sameSet(
      quote.affectedOrders.map((line) => line.orderLineId),
      expectedRelated,
    )
  )
    return false;
  for (const line of quote.affectedOrders)
    if (
      !Number.isSafeInteger(line.expectedRevision) ||
      line.expectedRevision < 1 ||
      ![
        line.previousAmount,
        line.revisedAmount,
        line.previousPrintPrice,
        line.revisedPrintPrice,
      ].every(nonnegative)
    )
      return false;
  const groupedDraftIds = [],
    groupedRelatedIds = [];
  for (const group of quote.groups) {
    if (
      typeof group.groupId !== "string" ||
      !group.groupId ||
      !Array.isArray(group.draftLineIds) ||
      !Array.isArray(group.relatedOrderLineIds) ||
      !Number.isSafeInteger(group.memberCount) ||
      group.memberCount < 1 ||
      group.memberCount !==
        group.draftLineIds.length + group.relatedOrderLineIds.length ||
      !Number.isSafeInteger(group.quantity) ||
      group.quantity < 1 ||
      !nonnegative(group.unitPrice) ||
      group.draftLineIds.some((id) => !active.includes(id)) ||
      group.relatedOrderLineIds.some((id) => !expectedRelated.includes(id))
    )
      return false;
    groupedDraftIds.push(...group.draftLineIds);
    groupedRelatedIds.push(...group.relatedOrderLineIds);
    for (const id of group.draftLineIds) {
      const line = quote.lines.find((line) => line.draftLineId === id);
      if (!line.override && line.printPrice !== group.unitPrice) return false;
    }
  }
  const expectedPrivatePrintIds = rows
    .filter(
      (row) =>
        active.includes(row.id) &&
        normalizeOrderType(row.orderType) !== "stock_printed" &&
        (row.print === "是" ||
          ["custom_print", "external_print"].includes(
            normalizeOrderType(row.orderType),
          )),
    )
    .map((row) => row.id);
  return (
    sameSet(groupedDraftIds, expectedPrivatePrintIds) &&
    sameSet(groupedRelatedIds, expectedRelated)
  );
}
