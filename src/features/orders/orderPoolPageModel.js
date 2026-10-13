export const ORDER_DETAIL_TABS = ["订单", "交付", "财务"];

export const ORDER_STATUS_FILTERS = ["全部", "待处理", "生产中", "待出库", "缺货", "已交付", "待对账"];

export function orderMatchesQuery(line, query, findCustomer, getLineColorSpecLabel, getLineRemark) {
  const normalizedQuery = String(query ?? "").trim().toLowerCase();
  if (!normalizedQuery) return true;
  const customer = findCustomer(line.customerId);
  const searchable = [
    line.id,
    line.orderNo,
    line.lineNo,
    customer?.name,
    line.product,
    line.size,
    line.color,
    getLineColorSpecLabel(line),
    getLineRemark(line),
    line.status,
  ].filter(Boolean).join(" ").toLowerCase();
  return searchable.includes(normalizedQuery);
}

export function getActiveFilterCount(filters, defaults, query) {
  const filterCount = Object.keys(defaults).filter((key) => filters[key] !== defaults[key]).length;
  return filterCount + (String(query ?? "").trim() ? 1 : 0);
}

export function getOrderActionState(getUiActionState, action, blocker) {
  const permissionState = getUiActionState?.("orders", action) ?? { disabled: false, title: "" };
  if (permissionState.disabled) return permissionState;
  if (blocker) return { disabled: true, title: blocker };
  return permissionState;
}

export function getOrderLineMutationBlocker(line) {
  const status = String(line?.status ?? line?.lineStatus ?? "").trim();
  if (!line) return "没有选中的订单明细。";
  if (!status) return "订单状态不完整，不能直接修改。";
  if (status.includes("已关闭") || status.includes("已取消") || status.includes("已交付")) return "已交付、已关闭或已取消的订单不能直接改量或作废。";
  if (status.includes("丝印") || status.includes("制袋") || status.includes("打包")) return "已进入生产或打包的订单不能在订单池直接改量或作废。";
  return "";
}

export function getOrderPoolSourceLabel(meta = {}) {
  if (meta.loading) return "正在读取后端订单池";
  if (meta.source === "api") {
    const syncText = meta.lastSyncedAt ? `，${meta.lastSyncedAt} 同步` : "";
    return `后端订单池 ${meta.total ?? 0} 行${syncText}`;
  }
  if (meta.source === "api_error") return "后端订单池返回错误，保留当前列表";
  if (meta.source === "local_fallback") return "后端未连接，使用本地演示数据";
  return "本地演示数据";
}

export function getOrderDetailInventoryLabel(detail, fallback) {
  const traces = Array.isArray(detail?.inventory) ? detail.inventory : [];
  if (!traces.length) return fallback || "未记录";
  const states = [...new Set(traces.map((item) => item.state).filter(Boolean))];
  const reservedQty = traces.reduce((sum, item) => sum + Number(item.reservedQty || 0), 0);
  const stateText = states.length ? states.join("、") : fallback || "库存占用";
  return reservedQty > 0 ? `${stateText}；占用 ${reservedQty}` : stateText;
}
