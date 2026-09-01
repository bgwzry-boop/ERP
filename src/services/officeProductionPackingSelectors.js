function cleanText(value) {
  return String(value ?? "").trim();
}

export function buildProductionTaskId(orderLine) {
  const orderLineId = cleanText(orderLine?.id ?? orderLine?.orderLineId);
  return orderLineId ? `PT-${orderLineId}` : "";
}

export function buildPackingTaskId(orderLine) {
  const orderLineId = cleanText(orderLine?.id ?? orderLine?.orderLineId);
  return orderLineId ? `PKT-${orderLineId}` : "";
}

export function getProductionProcessType(orderLine) {
  const status = cleanText(orderLine?.status ?? orderLine?.lineStatus);
  if (status.includes("丝印") || status.includes("补印")) return "丝印";
  return "制袋";
}

export function getProductionMachineId(orderLine) {
  const assignedMachineId = cleanText(orderLine?.machineId ?? orderLine?.productionTask?.machineId);
  if (assignedMachineId) return assignedMachineId;
  return getProductionProcessType(orderLine) === "丝印" ? "PRINT-01" : "BAG-01";
}

export function findProductionInventoryItem(orderLine, inventoryRecords = []) {
  const matches = inventoryRecords.filter((item) =>
    cleanText(item.size) === cleanText(orderLine?.size) &&
    cleanText(item.color) === cleanText(orderLine?.color) &&
    cleanText(item.handle) === cleanText(orderLine?.handle) &&
    cleanText(item.style) === cleanText(orderLine?.style),
  );
  if (!matches.length) return null;
  if (cleanText(orderLine?.fulfillment) === "快递快运") {
    return matches.find((item) => cleanText(item.zone).includes("快运")) ?? matches[0];
  }
  return matches.find((item) => cleanText(item.zone).includes("打包")) ?? matches[0];
}
