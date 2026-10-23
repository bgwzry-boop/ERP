// Read-only workbench groupings, shared with server filtering before pagination.
export const ORDER_STATUS_GROUPS = Object.freeze({ "待处理": "待|缺货|差异", "生产中": "制袋中|丝印中|生产中", "待出库": "待出库|已备货" });
export function matchesOrderStatusGroup(status, group) {
  return !ORDER_STATUS_GROUPS[group] || new RegExp(ORDER_STATUS_GROUPS[group]).test(String(status || ""));
}
export const TODO_VIEWS = Object.freeze(["未处理", "今天要发", "异常/提醒", "待打印", "稍后提醒", "已处理", "全部"]);
export const TODO_AREAS = Object.freeze(["全部业务", "订单", "库存", "出库", "财务", "生产", "设备", "其他"]);
export function todoArea(todo) {
  if (["order_draft", "order_line"].includes(todo.refType)) return "订单";
  if (todo.refType === "fulfillment") return "出库";
  if (todo.refType === "statement") return "财务";
  if (["inventory_item", "inventory_correction"].includes(todo.refType)) return "库存";
  if (todo.refType === "production_task") return "生产";
  if (todo.refType === "maintenance_task") return "设备";
  return "其他";
}
export function todoMatchesView(todo, view) {
  if (view === "未处理") return !todo.handled;
  if (view === "已处理") return Boolean(todo.handled);
  if (view === "今天要发") return !todo.handled && todo.dueToday === true;
  if (view === "异常/提醒") return !todo.handled && (todo.urgency === "异常" || todo.priority === "exception");
  if (view === "待打印") return !todo.handled && String(todo.type).includes("打印");
  if (view === "稍后提醒") return !todo.handled && todo.activeSnooze === true;
  return true;
}
export const SUPPLIER_SETTLEMENT_STAGES = Object.freeze(["待对账确认", "待生成应付", "待付款登记", "付款待确认", "已付款"]);
export function supplierSettlementState(record = {}) {
  const statementConfirmed = Boolean(record.statementConfirmationId) || record.reviewStatus === "statement_confirmed";
  const payableReady = Boolean(record.supplierPayableId || record.supplierPayableDraft);
  const paymentRegistered = Boolean(record.supplierPaymentRecord);
  const paymentConfirmed = Boolean(record.supplierPaymentConfirmationId) || record.paymentStatus === "已确认付款";
  const completedCount = paymentConfirmed ? 4 : paymentRegistered ? 3 : payableReady ? 2 : statementConfirmed ? 1 : 0;
  return { completedCount, label: SUPPLIER_SETTLEMENT_STAGES[completedCount] };
}
export function classifyFinishedInventory(stock) {
  if (stock.category && stock.goodsType) return stock;
  const laminated = /覆膜/.test(`${stock.style || ""} ${stock.zone || ""}`);
  const printed = !/空白袋|纯色/.test(stock.style || "");
  return { ...stock, category: laminated ? "覆膜无纺布袋" : "无纺布袋", goodsType: printed ? "印刷通货" : "纯色通货", pattern: printed ? stock.style || "图案待确认" : "—", productName: printed ? "印刷通货袋" : "纯色通货袋" };
}
