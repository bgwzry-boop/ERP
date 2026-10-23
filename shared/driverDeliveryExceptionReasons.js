export const driverDeliveryExceptionReasons = Object.freeze([
  Object.freeze({ code: "load_shortage", label: "装车少货" }),
  Object.freeze({ code: "customer_unavailable", label: "客户不在" }),
  Object.freeze({ code: "phone_unreachable", label: "电话联系不上" }),
  Object.freeze({ code: "address_unclear", label: "地址不清" }),
  Object.freeze({ code: "customer_rejected", label: "客户拒收" }),
  Object.freeze({ code: "package_quantity_mismatch", label: "包裹/数量不符" }),
  Object.freeze({ code: "delivery_changed", label: "临时改送" }),
  Object.freeze({ code: "other", label: "其他" }),
]);

export function findDriverDeliveryExceptionReason(value) {
  const text = String(value ?? "").trim();
  const normalized = text === "拒收" ? "客户拒收" : text;
  return driverDeliveryExceptionReasons.find(({ code, label }) => code === normalized || label === normalized) ?? null;
}
