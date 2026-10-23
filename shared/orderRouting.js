const ORDER_TYPE_ALIASES = new Map([
  ["stock", "stock"],
  ["stock_plain", "stock"],
  ["laminated_plain", "stock"],
  ["现货", "stock"],
  ["现货有货", "stock"],
  ["现货缺货", "stock"],
  ["标准通货", "stock"],
  ["现货通货", "stock"],
  ["stock_printed", "stock_printed"],
  ["laminated_printed", "stock_printed"],
  ["replenishment", "stock_printed"],
  ["印刷通货", "stock_printed"],
  ["custom_print", "custom_print"],
  ["laminated_custom", "custom_print"],
  ["定制印刷", "custom_print"],
  ["custom_special", "custom_special"],
  ["特殊尺寸", "custom_special"],
  ["特殊尺寸空白", "custom_special"],
  ["特殊尺寸空白袋", "custom_special"],
  ["特殊尺寸印刷袋", "custom_special"],
  ["custom_blank", "custom_special"],
  ["特殊尺寸印刷", "custom_special"],
  ["external_print", "external_print"],
  ["外加工印刷", "external_print"],
]);

export function normalizeOrderType(value) {
  return ORDER_TYPE_ALIASES.get(String(value ?? "").trim()) ?? "";
}

export function orderTypeLabel(value) {
  const type = normalizeOrderType(value);
  if (type === "stock") return "现货通货";
  if (type === "stock_printed") return "印刷通货";
  if (type === "custom_print") return "定制印刷";
  if (type === "custom_special") return "特殊尺寸";
  if (type === "external_print") return "外加工印刷";
  return "";
}

export function isStockOrderType(value) {
  const type = normalizeOrderType(value);
  return type === "stock" || type === "stock_printed";
}

export function requiresProductionOrderType(value, inventory = "") {
  const type = normalizeOrderType(value);
  if (type === "custom_print" || type === "custom_special") return true;
  return isStockOrderType(type) && String(inventory).startsWith("缺货");
}

export function orderTypeFromMiniappProductType(productType) {
  return normalizeOrderType(productType);
}

export function inferOrderType(row = {}, { standardSize = false } = {}) {
  const explicit = normalizeOrderType(row.orderType ?? row.productType);
  if (explicit) return explicit;
  const product = String(row.product ?? row.productName ?? "");
  if (/同行|外加工/.test(product)) return "external_print";
  if (row.isCustomSize === true || /特殊尺寸|非标|定制尺寸/.test(product)) return "custom_special";
  if (String(row.size ?? "").match(/\d+\s*[*×x]/) && !standardSize) return "custom_special";
  if (/印刷通货|喜|福|小熊|小狗/.test(product)) return "stock_printed";
  if (row.print === "是" || row.printFlag === true) return "custom_print";
  return standardSize ? "stock" : "";
}
