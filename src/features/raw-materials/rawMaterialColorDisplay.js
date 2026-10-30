export function formatRawMaterialColorDisplay(factoryColor, supplierColor) {
  const factory = String(factoryColor || "").trim();
  const supplier = String(supplierColor || "").trim();
  if (factory && supplier) return `${factory}（${supplier}）`;
  return factory || supplier || "颜色待补";
}
