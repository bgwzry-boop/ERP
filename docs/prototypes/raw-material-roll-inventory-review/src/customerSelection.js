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

// 识别结果里的客户：有档案就直接绑定；没有档案就把名字回填到输入框，等人确认。
export function resolveRecognizedCustomer(recognitionHint, picked) {
  const name = String(recognitionHint?.name ?? "").trim();
  if (picked?.customerId && picked.selectionSource !== "recognition") return { customer: picked, pendingName: "" };
  if (recognitionHint?.customerId) {
    return { customer: { customerId: recognitionHint.customerId, name: recognitionHint.name, selectionSource: "recognition" }, pendingName: "" };
  }
  return { customer: null, pendingName: name };
}

// 识别出的名字在系统里找不到完全一致时，先看是不是识别错了：
// 只要对方名字包含识别结果（或反之），就当作"可能是这个客户"，不要直接让人新建。
export function findSimilarCustomers(name, items = []) {
  const target = String(name ?? "").trim();
  if (!target) return [];
  return items.filter((item) => {
    const candidate = String(item?.name ?? "").trim();
    if (!candidate) return false;
    if (candidate === target) return true;
    return candidate.includes(target) || target.includes(candidate);
  });
}
