export function getFulfillmentExceptionTodoInput(selected, todoType) {
  return {
    type: todoType,
    customerId: selected.customerId,
    ref: selected.lineId,
    summary: `${selected.goods} 当前状态：${selected.status}，需办公室继续处理`,
    latest: selected.latest,
    urgency: "异常",
    impact: "影响出库交付",
  };
}

export function updateFulfillmentsForAction(fulfillments, selectedId, action) {
  return fulfillments.map((item) => {
    if (item.id !== selectedId) return item;
    if (action === "标记已备货") return { ...item, status: "已备货" };
    if (action === "完成出库/交付" || action === "完成自提" || action === "完成送货") {
      return { ...item, status: "已交付", printed: true, deliveredAt: "今天 10:30" };
    }
    if (action === "确认已拉走") {
      return { ...item, status: "已交付", pickedAt: "可回填昨晚", printed: true, deliveredAt: "今天 10:30" };
    }
    return item;
  });
}

export function confirmFulfillmentException(fulfillments, selected, modalType, payload) {
  const nextStatus = modalType === "mismatch" ? "数量差异待处理" : "无法出库";
  const actualQty = modalType === "unable" ? 0 : payload.actualQty;
  return {
    fulfillments: fulfillments.map((item) => (item.id === selected.id ? { ...item, status: nextStatus, exceptionReason: payload.reason, actualQty } : item)),
    todoInput: {
      type: modalType === "mismatch" ? "数量差异待处理" : "无法出库待处理",
      customerId: selected.customerId,
      ref: selected.lineId,
      summary: `${selected.goods} 应出 ${selected.qty}，实际 ${actualQty || 0}；${payload.reason}`,
      latest: selected.latest,
      urgency: "异常",
      impact: "需办公室决定客户沟通、改单或重打单据",
    },
    toast: `${nextStatus} 已提交，生成办公室公共待办并保留原因。`,
  };
}

export function confirmFulfillmentPrint(fulfillments, fulfillmentId) {
  return fulfillments.map((item) => {
    if (item.id !== fulfillmentId) return item;
    const nextStatus = item.method === "快递快运" && item.status !== "已交付" ? "待确认拉走" : item.status;
    return { ...item, printed: true, status: nextStatus, printBatch: "PB-P0-001", printedAt: "今天 10:30" };
  });
}
