export function formatRawMaterialWeight(item = {}) {
  const weight = Number(item.totalWeightKg || 0);
  if (!weight) return item.unit === "件" ? `${item.rollCount || item.rolls?.length || 0}件` : "未填重量";
  return `${weight}kg`;
}

export function formatRawMaterialAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return "金额待确认";
  return `${amount < 0 ? "-" : ""}¥${Math.abs(amount).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
