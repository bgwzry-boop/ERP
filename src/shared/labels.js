export const fulfillmentMethodLabel = Object.freeze({
  pickup: "自提",
  delivery: "送货",
  express_ltl: "快递快运",
});

export const fulfillmentMethodValue = Object.freeze(
  Object.fromEntries(Object.entries(fulfillmentMethodLabel).map(([value, label]) => [label, value])),
);

export function labelOf(dictionary, value, fallback = "待确认") {
  return dictionary[String(value ?? "").trim()] ?? fallback;
}

export function getFulfillmentMethodLabel(value, fallback = "待确认") {
  const normalized = String(value ?? "").trim();
  if (fulfillmentMethodValue[normalized]) return normalized;
  return labelOf(fulfillmentMethodLabel, normalized, fallback);
}

export function getFulfillmentMethodValue(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  if (fulfillmentMethodLabel[normalized]) return normalized;
  return fulfillmentMethodValue[normalized] ?? fallback;
}
