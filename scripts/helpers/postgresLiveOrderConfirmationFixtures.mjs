export function buildConfirmedOrder({ orderId, sourceDraftId, customerId, createdBy }) {
  return {
    orderId,
    bizNo: orderId,
    sourceDraftId,
    customerId,
    customerSnapshot: { name: "Postgres 仓储测试客户" },
    sourceText: "Postgres live order confirmation",
    summaryStatus: "处理中",
    createdBy,
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}

export function buildConfirmedOrderDraft({ draftId, customerId, createdBy }) {
  return {
    id: draftId,
    draftId,
    bizNo: draftId,
    sourceText: "Postgres live order confirmation",
    sourceChannel: "manual",
    sourceMessageId: "",
    customerId,
    customerName: "Postgres 仓储测试客户",
    status: "待审核",
    revision: 1,
    clientRevision: 1,
    createdBy,
    createdAt: "2026-07-02T10:20:00.000Z",
    updatedAt: "2026-07-02T10:20:00.000Z",
    lines: [
      {
        id: `${draftId}-01`,
        customerId,
        customer: "Postgres 仓储测试客户",
        product: "Postgres 确认订单",
        size: "30*38*10",
        color: "白色",
        handle: "普通提",
        style: "空白袋",
        print: "否",
        qty: 273,
        fulfillment: "自提",
        latest: "待确认",
        inventory: "可用",
        confidence: "high",
        missingFields: [],
      },
    ],
  };
}

export function buildConfirmedOrderLines({ orderId, customerId, orderLineId, createdBy }) {
  return [
    {
      id: orderLineId,
      orderNo: orderId,
      customerId,
      product: "Postgres 确认订单",
      orderType: "现货有货",
      size: "30*38*10",
      color: "白色",
      handle: "普通提",
      style: "空白袋",
      print: "否",
      qty: 273,
      fulfillment: "自提",
      status: "待出库",
      amount: 273,
      inventory: "可用",
      exceptions: [],
      createdBy,
    },
  ];
}

export function buildConfirmedPriceSnapshots({ orderLineId, createdBy }) {
  return [
    {
      orderLineId,
      bagPrice: 1,
      printPrice: 0,
      otherFee: 0,
      amount: 273,
      priceVersion: "P0-SYNTHETIC",
      chargeableQty: 273,
      createdBy,
    },
  ];
}

export function buildConfirmedFulfillments({ fulfillmentId, orderLineId, customerId, createdBy }) {
  return [
    {
      id: fulfillmentId,
      lineId: orderLineId,
      customerId,
      method: "自提",
      qty: 273,
      status: "待出库",
      latest: "待确认",
      goods: "30*38 白色空白袋",
      packages: "1件散装",
      zone: "按库存推荐",
      source: "正式订单占用",
      createdBy,
    },
  ];
}

export function buildConfirmedInventoryReservations({
  reservationId,
  orderLineId,
  inventoryItemId,
  reservedQty,
  createdBy,
}) {
  return [
    {
      reservationId,
      orderLineId,
      inventoryItemId,
      reservedQty,
      reservationType: "待提货锁定",
      status: "生效",
      createdBy,
    },
  ];
}

export function buildConfirmedInventoryLedgerEntries({
  ledgerId,
  inventoryItemId,
  sourceId,
  qtyBefore,
  qtyChange,
  qtyAfter,
  operatorId,
}) {
  return [
    {
      ledgerId,
      inventoryItemId,
      changeType: "订单占用",
      qtyBefore,
      qtyChange,
      qtyAfter,
      sourceType: "order_confirm",
      sourceId,
      operatorId,
      confirmedBy: operatorId,
      reason: "订单确认占用库存",
      remark: "待提货锁定",
    },
  ];
}

export function buildConfirmedTodos({ todoId, refId, customerId, createdBy }) {
  return [
    {
      id: todoId,
      type: "缺货待处理",
      customerId,
      ref: refId,
      summary: "Postgres live order confirmation shortage todo",
      wait: "刚刚",
      latest: "今天",
      urgency: "异常",
      impact: "影响出库承诺",
      createdBy,
    },
  ];
}
