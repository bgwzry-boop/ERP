export function fulfillmentDocumentTypeFor(fulfillment = {}, action = "") {
  const method = fulfillment?.method;
  const label = String(action ?? "").trim();
  const express = ["快递快运", "express_ltl"].includes(method);
  if (express && ["打印出库单", "重打出库单"].includes(label)) return "outbound_note";
  const anchorId = String(fulfillment?.packingGroupAnchorId ?? fulfillment?.packing_group_anchor_id ?? "").trim();
  if (anchorId && (express || /标签|挂牌/u.test(label))) return "package_label";
  if (express) return "express_ltl_label";
  if (["送货", "delivery"].includes(method)) return "delivery_note";
  if (["自提", "pickup"].includes(method)) return "pickup_note";
  return "outbound_note";
}
