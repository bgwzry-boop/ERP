import { getFactoryStandardColorSwatch } from "../../../shared/factoryStandardColors.js";

// 只查询显示色值；票面色兜底不能写回厂内色或改变厂家映射状态。
export function getRawMaterialDisplayColorSwatch(factoryColor, supplierColor = "", fallback = "#9aa6b2") {
  const color = String(factoryColor || "").trim() || String(supplierColor || "").trim();
  return getFactoryStandardColorSwatch(color, fallback);
}

export function formatRawMaterialColorDisplay(factoryColor, supplierColor) {
  const factory = String(factoryColor || "").trim();
  const supplier = String(supplierColor || "").trim();
  if (factory && supplier) return `${factory}（${supplier}）`;
  return factory || supplier || "颜色待补";
}
