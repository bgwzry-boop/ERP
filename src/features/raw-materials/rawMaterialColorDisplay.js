import { getFactoryStandardColorSwatch } from "../../../shared/factoryStandardColors.js";

// 只查询显示色值；票面色兜底不能写回厂内色或改变厂家映射状态。
export function getRawMaterialDisplayColorSwatch(factoryColor, supplierColor = "", fallback = "#9aa6b2") {
  const color = String(factoryColor || "").trim() || String(supplierColor || "").trim();
  return getFactoryStandardColorSwatch(color, fallback);
}

// 负责人 2026-11-05：括号外是我厂颜色，括号里是送货单上的颜色。
// 两个都有：米黄（米色）；只有我厂颜色：米黄；只有送货颜色（还没对应到我厂颜色）：（米色）。
export function formatRawMaterialColorDisplay(factoryColor, supplierColor) {
  const factory = String(factoryColor || "").trim();
  const supplier = String(supplierColor || "").trim();
  if (supplier) return `${factory}（${supplier}）`;
  return factory || "颜色待补";
}
