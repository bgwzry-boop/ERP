import {
  confirmFulfillmentException,
  confirmFulfillmentPrint,
} from "./officeFulfillmentActions.js";
import {
  confirmStatementPayment,
  confirmStatementVariance,
} from "./officeStatementActions.js";

export const officeModalTitles = {
  mismatch: "数量不符",
  unable: "无法出库",
  payment: "登记实收金额",
  variance: "差额处理结果",
  print: "单据 / 标签预览",
  printVoid: "作废旧单据/标签",
  dispatch: "编辑司机派单",
  batchPrintResult: "确认打印结果",
  statementPreview: "对账单预览",
  customerConfirmation: "登记客户确认",
};

export const officeModalReasonOptions = [
  "库存不足",
  "找不到货",
  "颜色/尺寸不符",
  "包装/标签问题",
  "客户少付，差额待确认",
  "多笔付款待齐",
  "其他",
];

export const printVoidReasonOptions = [
  "信息变更需重打",
  "包裹数量变化",
  "纸张损坏",
  "客户信息变化",
  "交付方式变化",
  "其他",
];

export const batchPrintResultOptions = [
  "全部打出",
  "部分打出",
  "没打出",
  "不确定",
];

export function getOfficeModalInitialNumberValue(modal, { fulfillment, statement, getStatementBlockingAmount }) {
  if (modal.type === "batchPrintResult") return String(modal.totalLabels ?? 0);
  if (modal.type === "payment") return String(statement?.received || statement?.receivable || 0);
  if (modal.type === "variance") return String(getStatementBlockingAmount(statement));
  if (modal.type === "unable") return "0";
  return String(fulfillment?.qty || 0);
}

export function getOfficeModalInitialReason(modal) {
  if (modal.type === "batchPrintResult") return "全部打出";
  if (modal.type === "printVoid") return "信息变更需重打";
  if (modal.type === "variance") return "未收差额转欠款";
  if (modal.type === "payment") return "客户少付，差额待确认";
  if (modal.type === "unable") return "找不到货";
  return "库存不足";
}

export function confirmOfficeModal({ modal, payload, fulfillments, statements, todos, getStatementBlockingAmount }) {
  if (!modal) return {};

  if (modal.type === "mismatch" || modal.type === "unable") {
    const selected = fulfillments.find((item) => item.id === modal.fulfillmentId);
    if (!selected) return { toast: "未找到对应出库 / 交付记录，无法确认。" };
    return confirmFulfillmentException(fulfillments, selected, modal.type, payload);
  }

  if (modal.type === "print") {
    if (modal.action === "打印预览") {
      return {
        fulfillments,
        toast: "已生成单据预览；预览不等于正式打印，不能作为出库标签使用。",
      };
    }
    return {
      fulfillments: confirmFulfillmentPrint(fulfillments, modal.fulfillmentId),
      toast: "已模拟打印成功；快递/快运进入待确认拉走，自提/送货保留当前交付状态。若包裹数变更，旧标签需作废重打。",
    };
  }

  if (modal.type === "payment") {
    const selected = statements.find((item) => item.id === modal.statementId);
    if (!selected) return { toast: "未找到对应对账单，无法登记实收。" };
    return confirmStatementPayment(statements, selected, payload);
  }

  if (modal.type === "variance") {
    const selected = statements.find((item) => item.id === modal.statementId);
    if (!selected) return { toast: "未找到对应对账单，无法处理差额。" };
    const blockingAmount = getStatementBlockingAmount(selected);
    const hasOpenVarianceTodo = todos.some((item) => !item.handled && item.type === "收款差额待确认" && item.ref === selected.id);
    return confirmStatementVariance(statements, selected, blockingAmount, payload, hasOpenVarianceTodo);
  }

  if (modal.type === "statementPreview") {
    return { toast: "对账单预览已确认；可生成客户发送版或内部留档 Excel 文件。" };
  }

  return { toast: "弹窗动作已模拟确认。" };
}
