import { normalizeOrderType } from "../../shared/orderRouting.js";
function cleanText(value) {
  return String(value ?? "").trim();
}

function toNonNegativeInteger(value, fallback = 0) {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue >= 0) return Math.trunc(numericValue);
  return fallback;
}

function getProductionTaskLabel(productionTask = {}, orderLine = {}, payload = {}) {
  return cleanText(payload.productionTaskId) ||
    cleanText(productionTask.productionTaskId ?? productionTask.id) ||
    cleanText(orderLine.productionTaskId) ||
    "生产任务待确认";
}

function getProductionGoodsSummary(orderLine = {}, payload = {}) {
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

export function buildProductionReportSummary({ kind = "complete", productionTask = {}, orderLine = {}, customerName = "", payload = {} } = {}) {
  const isDailyProgress = kind === "daily";
  const isSpecial = normalizeOrderType(orderLine.orderType) === "custom_special";
  const isSilkScreen = (productionTask.taskType ?? orderLine.productionTask?.taskType) === "丝印";
  const plannedQty = toNonNegativeInteger(productionTask.plannedQty ?? productionTask.qty ?? orderLine.qty ?? orderLine.originalQty);
  const qualifiedQty = toNonNegativeInteger(payload.dailyQualifiedQty ?? payload.qualifiedQty, plannedQty);
  const exceptionQty = toNonNegativeInteger(payload.exceptionQty);
  const machineCount = payload.machineCount === undefined || payload.machineCount === null || payload.machineCount === ""
    ? null
    : toNonNegativeInteger(payload.machineCount);
  const qualifiedQuantityText = qualifiedQty === plannedQty
    ? `${qualifiedQty} 个`
    : `${qualifiedQty} 个（计划 ${plannedQty} 个）`;

  return {
    isSilkScreenCompletion: isSilkScreen && !isDailyProgress,
    title: isDailyProgress ? "确认提交当日报数" : isSilkScreen ? "这批印完了吗？" : "确认完成生产报工",
    confirmLabel: isDailyProgress ? "确认提交当日报数" : isSilkScreen ? "确认印完，交给制袋" : "确认完成生产报工",
    fields: [
      { label: "生产任务", value: getProductionTaskLabel(productionTask, orderLine, payload) },
      { label: "客户", value: cleanText(customerName) || cleanText(orderLine.customerName) || "客户待确认" },
      { label: "货品", value: getProductionGoodsSummary(orderLine, payload) },
      { label: isDailyProgress ? "当日合格/计划" : isSilkScreen ? "交给制袋/订单计划" : "合格/计划", value: qualifiedQuantityText },
      { label: "异常/废品", value: `${exceptionQty} 个` },
      { label: "机器计数", value: machineCount === null ? "未填（仅作凭证）" : `${machineCount} 次（仅作凭证）` },
    ],
    effects: isDailyProgress
      ? [
          "将写入当日生产报工，并更新跨日累计和剩余数量。",
          "不入库、不占用、不生成打包任务、不进入对账。",
          "机器计数只作为生产凭证；将记录操作日志。",
        ]
      : isSilkScreen ? [
          `确认后结束丝印任务，将 ${qualifiedQty} 个交给制袋并等待排产。`,
          "与订单计划的数量差异交办公室跟进；异常/废品数量单独记录。",
          "不生成成品库存、占用或打包任务；保留报工和操作日志。",
        ] : [
          "将完成生产任务，并写入合格数量和异常数量报工记录。",
          isSpecial ? `将把 ${qualifiedQty} 个合格品按订单转入打包，不建立通货库存。` : `将把 ${qualifiedQty} 个合格品入库并占用给当前订单，同时写入库存流水。`,
          "将创建待打包任务并记录操作日志；机器计数只作为生产凭证。",
        ],
  };
}
