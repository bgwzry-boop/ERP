export function formatDriverRouteNeighbor(task, getRouteStopLabel) {
  if (!task) return "无";
  return `${getRouteStopLabel(task)} ${task.customerName || "客户待确认"} ${task.addressArea || ""}`.trim();
}

export function formatDriverDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
