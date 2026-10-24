import { normalizeInventoryHoldTimestamp } from "./inventoryHoldTime.js";

// The UI is factory-local (+08:00); an API business timestamp is explicit.
export function normalizeCarrierHandoffTimestamp(value) {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value.trim())) return "";
  return normalizeInventoryHoldTimestamp(value);
}

export function toFactoryDatetimeLocal(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 19) : "";
}

export function carrierFinalDeliveryPayload({ fulfillmentId, action, body = {}, operatorId }) {
  const payload = { fulfillmentId, expectedRevision: Number(body.expectedRevision), action,
    confirmedFinalDelivery: body.confirmedFinalDelivery === true, remark: String(body.remark ?? "").trim(), operatorId };
  // Preserve the exact old payload for replaying an already persisted old receipt.
  if (Object.hasOwn(body, "actualHandoffAt")) payload.actualHandoffAt = normalizeCarrierHandoffTimestamp(body.actualHandoffAt) || String(body.actualHandoffAt ?? "");
  return payload;
}
