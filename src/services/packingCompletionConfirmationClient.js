function cleanText(value) {
  return String(value ?? "").trim();
}

function toNonNegativeInteger(value, fallback = 0) {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue >= 0) return Math.trunc(numericValue);
  return fallback;
}

function getPackingGoodsSummary(orderLine = {}, payload = {}) {
  const suppliedSummary = cleanText(payload.goodsSummary);
  if (suppliedSummary) return suppliedSummary;
  return [
    orderLine.product ?? orderLine.productName,
    orderLine.size,
    orderLine.colorSpecLabel ?? orderLine.color ?? orderLine.bagColor,
    orderLine.printSide,
    orderLine.remark ?? orderLine.notes,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" · ") || "货品待确认";
}

function isExpressOrLtl(orderLine = {}) {
  const fulfillment = cleanText(orderLine.fulfillment ?? orderLine.fulfillmentMethod);
  return fulfillment.includes("快递") || fulfillment.includes("快运");
}

export function buildPackingCompletionSummary({ packingTask = {}, orderLine = {}, customerName = "", payload = {} } = {}) {
  const plannedQty = toNonNegativeInteger(packingTask.plannedQty ?? orderLine.qty ?? orderLine.originalQty);
  const actualPackedQty = toNonNegativeInteger(payload.actualPackedQty, plannedQty);
  const packageCount = Math.max(1, toNonNegativeInteger(payload.packageCount, packingTask.packageCount ?? 1));
  const expressOrLtl = isExpressOrLtl(orderLine);
  const actualQuantityText = actualPackedQty === plannedQty
    ? `${actualPackedQty} 个`
    : `${actualPackedQty} 个（计划 ${plannedQty} 个）`;

  return {
    title: "确认提交打包完成",
    fields: [
      { label: "打包任务", value: cleanText(packingTask.packingTaskId) || "待确认" },
      { label: "客户", value: cleanText(customerName) || cleanText(orderLine.customerName) || "客户待确认" },
      { label: "货品", value: getPackingGoodsSummary(orderLine, payload) },
      { label: "实际/计划", value: actualQuantityText },
      { label: "包裹", value: `${packageCount} 包` },
      { label: "后续状态", value: expressOrLtl ? "待打印标签" : "待出库" },
    ],
    effects: [
      `将生成 ${packageCount} 个包裹记录，并将打包任务标记为已完成。`,
      expressOrLtl
        ? "将创建待打印标签待办；只有服务端确认当前打印作业已完成，才会进入快递快运下一步。"
        : "订单与交付将进入待出库下一步。",
      "不扣库存；库存仍保持占用，并写入零数量库存追溯和操作日志。",
    ],
  };
}
