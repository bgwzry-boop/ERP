const productionSourceTypes = new Set(["production_report", "production_report_reservation"]);

export function getProductionPackingFocusFromLedgerEntry(entry, context = {}) {
  const sourceType = cleanText(entry?.sourceType);
  const sourceId = cleanText(entry?.sourceId);
  if (!sourceId) return null;

  if (sourceType === "packing_complete") {
    return getPackingFocus(sourceId, entry, context);
  }

  if (productionSourceTypes.has(sourceType)) {
    return getProductionFocus(sourceId, entry, context);
  }

  return null;
}

function getPackingFocus(sourceId, entry, context) {
  const task = findPackingTask(sourceId, context);
  const orderLineId = cleanText(task?.orderLineId) || getOrderLineIdFromPrefixedId(sourceId, "PKT-");
  return {
    mode: "packing",
    taskId: cleanText(task?.packingTaskId) || sourceId,
    orderLineId,
    sourceType: cleanText(entry?.sourceType),
    sourceId,
    ledgerId: cleanText(entry?.ledgerId),
    sourceLabel: "打包完成",
  };
}

function getProductionFocus(sourceId, entry, context) {
  const reportResult = findProductionReportResult(sourceId, entry, context);
  if (reportResult === null) return null;
  const orderLine = reportResult
    ? findOrderLineById(cleanText(reportResult.orderLineId), context)
    : findOrderLineFromProductionSource(sourceId, context);
  const productionTaskId =
    cleanText(reportResult?.productionTaskId) ||
    findProductionTaskIdFromSource(sourceId, context) ||
    buildProductionTaskIdForLine(orderLine, context);
  const orderLineId = cleanText(reportResult?.orderLineId) || cleanText(orderLine?.id ?? orderLine?.orderLineId);

  if (!productionTaskId && !orderLineId) return null;

  return {
    mode: "production",
    taskId: productionTaskId || sourceId,
    orderLineId,
    packingTaskId: cleanText(reportResult?.packingTaskId) || buildPackingTaskIdForLine(orderLine, context),
    reportId: cleanText(reportResult?.reportId) || sourceId,
    sourceType: cleanText(entry?.sourceType),
    sourceId,
    ledgerId: cleanText(entry?.ledgerId),
    sourceLabel: entry?.sourceType === "production_report_reservation" ? "生产占用" : "生产报工",
  };
}

function findProductionReportResult(sourceId, entry, context) {
  const results = Object.values(context.productionPacking?.reportResultsByLineId ?? {});
  const ledgerId = cleanText(entry?.ledgerId);
  const exact = results.filter((result) => {
    const ledgerIds = Array.isArray(result?.inventoryLedgerIds) ? result.inventoryLedgerIds.map(cleanText) : [];
    return cleanText(result?.reportId) === sourceId
      || cleanText(result?.reservationId) === sourceId
      || cleanText(result?.packingTaskId) === sourceId
      || (ledgerId && ledgerIds.includes(ledgerId));
  });
  // A precise report/ledger association wins over a task-wide match.
  // Conflicting associations must not depend on cache insertion order.
  const matches = exact.length ? exact : results.filter(result => cleanText(result?.productionTaskId) === sourceId);
  return matches.length > 1 ? null : matches[0];

}

function findPackingTask(sourceId, context) {
  const tasks = context.productionPacking?.packingTasks ?? [];
  return tasks.find((task) => cleanText(task?.packingTaskId ?? task?.id) === sourceId) ?? null;
}

function findOrderLineFromProductionSource(sourceId, context) {
  const taskId = findProductionTaskIdFromSource(sourceId, context);
  const byTaskId = taskId
    ? (context.orderLines ?? []).find((line) => buildProductionTaskIdForLine(line, context) === taskId)
    : null;
  if (byTaskId) return byTaskId;

  return (context.orderLines ?? []).find((line) => {
    const lineId = cleanText(line?.id ?? line?.orderLineId);
    return lineId && sourceId === lineId;
  }) ?? null;
}

function findProductionTaskIdFromSource(sourceId) {
  if (sourceId.startsWith("PT-")) return sourceId;
  // Only decode the server-generated report identity; arbitrary substring
  // matching can confuse OL-1 with OL-10 and navigate to another order.
  const report = /^(?:WR|WDP)-(PT-.+)-(?:[1-9]\d*|COMPLETE)$/.exec(sourceId);
  return report?.[1] || "";
}

function findOrderLineById(orderLineId, context) {
  if (!orderLineId) return null;
  return (context.orderLines ?? []).find((line) => cleanText(line?.id ?? line?.orderLineId) === orderLineId) ?? null;
}

function buildProductionTaskIdForLine(line, context) {
  if (!line) return "";
  if (typeof context.buildProductionTaskId === "function") return cleanText(context.buildProductionTaskId(line));
  const orderLineId = cleanText(line?.id ?? line?.orderLineId);
  return orderLineId ? `PT-${orderLineId}` : "";
}

function buildPackingTaskIdForLine(line, context) {
  if (!line) return "";
  if (typeof context.buildPackingTaskId === "function") return cleanText(context.buildPackingTaskId(line));
  const orderLineId = cleanText(line?.id ?? line?.orderLineId);
  return orderLineId ? `PKT-${orderLineId}` : "";
}

function getOrderLineIdFromPrefixedId(value, prefix) {
  const text = cleanText(value);
  return text.startsWith(prefix) ? text.slice(prefix.length) : "";
}

function cleanText(value) {
  return String(value ?? "").trim();
}
