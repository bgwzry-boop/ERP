// 客户输入框的收尾规则：输入≠选中。
// - 只有一个同名精确匹配：直接认定这个真实客户（不新建、不猜）
// - 多个同名或没有匹配：保留输入内容并提示"尚未选中"，由人继续选或新建
export function resolveCustomerSelection(query, items = []) {
  const name = String(query ?? "").trim();
  if (!name) return { customer: null, pendingName: "" };
  const exact = items.filter((item) => String(item?.name ?? "").trim() === name);
  if (exact.length === 1) return { customer: exact[0], pendingName: "" };
  return { customer: null, pendingName: name };
}
