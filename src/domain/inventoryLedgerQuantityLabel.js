const reservationChanges = new Set([
  "释放占用", "订单占用", "订单改量释放占用", "订单改量补占用", "生产完成占用",
  "临时留货占用", "临时留货到期释放", "临时留货主动释放", "临时留货转订单占用",
]);
export function inventoryLedgerQuantityLabel(entry = {}) {
  if (reservationChanges.has(entry.changeType)) return "占用数量";
  if (entry.changeType === "生产入库" || entry.changeType === "correction") return "在库数量";
  return "变动前后数量";
}
