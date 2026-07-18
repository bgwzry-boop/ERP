export function createOrderWorkflowProjectionService(dependencies = {}) {
  const { calculateLinePricing } = dependencies;
  if (typeof calculateLinePricing !== "function") {
    throw new TypeError("createOrderWorkflowProjectionService requires calculateLinePricing to be a function");
  }

  return Object.freeze({
    findMatchingInventory,
    mapFulfillmentMethod,
    mapInventoryCheckStatus,
    mapInventoryReservationApiStatus,
    mapPrintSide,
    toFulfillmentTaskSummary,
    toInventoryCheckResult,
    toInventoryReservationTransactionSummary,
    toOrderLineSummary,
    toPriceSnapshot,
  });

  function toOrderLineSummary(line) {
    return {
      id: line.id,
      lineStatus: line.status,
      exceptionTags: line.flags ?? [],
    };
  }

  function toPriceSnapshot(line) {
    const pricing = calculateLinePricing({
      ...line,
      print: line.print ?? (line.printFlag ? "是" : "否"),
      qty: line.qty ?? line.originalQty,
    });
    return {
      orderLineId: line.id,
      bagPrice: pricing.bagPrice,
      printPrice: pricing.printPrice,
      otherFee: 0,
      amount: Number(line.amount ?? pricing.amount ?? 0),
      priceVersion: pricing.priceVersion,
    };
  }

  function toInventoryCheckResult(workspace, draftLine, orderLine) {
    const inventoryItem = findMatchingInventory(workspace, draftLine);
    const currentAvailableQty = Number(inventoryItem?.available ?? 0);
    return {
      orderLineId: orderLine?.id ?? draftLine.id,
      inventoryItemId: inventoryItem?.id ?? "",
      status: mapInventoryCheckStatus(draftLine.inventory),
      requestedQty: Number(draftLine.qty ?? 0),
      recognizedAvailableQty: currentAvailableQty,
      currentAvailableQty,
      shortageQty: Math.max(0, Number(draftLine.qty ?? 0) - currentAvailableQty),
    };
  }

  function toInventoryReservationTransactionSummary(reservation) {
    return {
      reservationId: reservation.reservationId,
      orderLineId: reservation.orderLineId,
      inventoryItemId: reservation.inventoryItemId,
      qty: Number(reservation.reservedQty ?? reservation.qty ?? 0),
      status: mapInventoryReservationApiStatus(reservation.status),
    };
  }

  function toFulfillmentTaskSummary(fulfillment) {
    return {
      fulfillmentId: fulfillment.id,
      orderLineId: fulfillment.lineId,
      method: mapFulfillmentMethod(fulfillment.method),
      status: fulfillment.status,
      expectedQty: Number(fulfillment.qty ?? 0),
    };
  }

  function findMatchingInventory(workspace, line) {
    return workspace.inventories.find(
      (item) =>
        item.size === line.size &&
        item.color === line.color &&
        item.handle === line.handle &&
        item.style === line.style,
    );
  }

  function mapFulfillmentMethod(value) {
    const map = {
      自提: "pickup",
      送货: "delivery",
      快递快运: "express_ltl",
      待确认: "pending",
    };
    return map[value] ?? value ?? "pending";
  }

  function mapInventoryCheckStatus(value) {
    if (value === "可用" || value === "有货") return "available";
    if (value === "缺货") return "insufficient";
    if (value === "需复核") return "pending_review";
    return "changed_since_recognition";
  }

  function mapInventoryReservationApiStatus(status) {
    const normalized = String(status ?? "").trim();
    if (normalized === "生效") return "active";
    if (normalized === "已释放") return "released";
    if (normalized === "部分释放") return "partially_released";
    if (normalized === "已出库") return "converted_to_outbound";
    return normalized || "active";
  }

  function mapPrintSide(value) {
    if (value === "single") return "单面";
    if (value === "double") return "双面";
    if (value === "单面" || value === "双面") return value;
    return value || "非印刷";
  }
}
