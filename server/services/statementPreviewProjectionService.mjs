import {
  getLineColorSpecLabel,
  getLinePrintSide,
  getLineRemark,
} from "../../src/domain/officeRules.js";

export function createStatementPreviewProjectionService() {
  return {
    buildGoodsSpec,
    buildPreviewLines,
    toPreviewLine,
  };
}

function buildPreviewLines(workspace = {}, statement = {}) {
  const statementId = text(statement.id ?? statement.statementId ?? statement.statement_id);
  const statementLines = Array.isArray(workspace.statementLines) ? workspace.statementLines : [];
  const orderLines = Array.isArray(workspace.orderLines) ? workspace.orderLines : [];
  const persistedLines = statementLines.filter(
    (item) => text(item.statementId ?? item.statement_id) === statementId,
  );

  if (persistedLines.length > 0) {
    return persistedLines.map((statementLine, index) => {
      const lineId = text(statementLine.orderLineId ?? statementLine.order_line_id);
      const line = orderLines.find((item) => text(item.id ?? item.orderLineId) === lineId);
      return toPreviewLine(workspace, statement, lineId, line, index, statementLine);
    });
  }

  const lineIds = array(statement.lineIds ?? statement.line_ids);
  return lineIds.map((rawLineId, index) => {
    const lineId = text(rawLineId);
    const line = orderLines.find((item) => text(item.id ?? item.orderLineId) === lineId);
    return toPreviewLine(workspace, statement, lineId, line, index);
  });
}

function toPreviewLine(workspace = {}, statement = {}, lineId, line, index, persistedLine = null) {
  const statementId = text(statement.id ?? statement.statementId ?? statement.statement_id);
  const safeLineId = text(line?.id ?? line?.orderLineId ?? lineId);
  const deliveredQty = finiteNumber(
    persistedLine?.deliveredQty ?? persistedLine?.delivered_qty,
    finiteNumber(line?.qty ?? line?.quantity ?? line?.originalQty, 0),
  );
  const chargeableQty = finiteNumber(
    persistedLine?.chargeableQty ?? persistedLine?.chargeable_qty ?? persistedLine?.billQty,
    deliveredQty,
  );
  const freeQty = finiteNumber(
    persistedLine?.freeQty ?? persistedLine?.free_qty,
    Math.max(0, deliveredQty - chargeableQty),
  );
  const amount = finiteNumber(
    persistedLine?.amount,
    finiteNumber(line?.amount ?? line?.priceSnapshot?.finalAmount ?? line?.price_snapshot?.final_amount, 0),
  );
  const adjustmentAmount = finiteNumber(
    persistedLine?.adjustmentAmount ?? persistedLine?.adjustment_amount,
    0,
  );
  const finalAmount = finiteNumber(
    persistedLine?.finalAmount ?? persistedLine?.final_amount,
    amount + adjustmentAmount,
  );
  const fulfillment = findFulfillment(workspace, safeLineId || text(lineId));
  const safeIndex = Number.isInteger(index) && index >= 0 ? index : 0;

  return {
    statementLineId:
      text(persistedLine?.statementLineId ?? persistedLine?.statement_line_id ?? persistedLine?.id) ||
      `${statementId}-${String(safeIndex + 1).padStart(3, "0")}`,
    statementId,
    orderLineId: safeLineId || text(lineId),
    fulfillmentId:
      text(persistedLine?.fulfillmentId ?? persistedLine?.fulfillment_id) ||
      text(fulfillment?.id ?? fulfillment?.fulfillmentId),
    orderNo: text(line?.orderNo ?? line?.orderId ?? line?.order_id) || text(lineId),
    productName: text(line?.productName ?? line?.product) || "未找到明细",
    goodsSpec: buildGoodsSpec(workspace, line),
    remark: getLineRemark(line),
    deliveredQty,
    chargeableQty,
    freeQty,
    billQty: chargeableQty,
    unitPrice: chargeableQty > 0 ? roundMoney(amount / chargeableQty) : 0,
    amount,
    adjustmentAmount,
    finalAmount,
  };
}

function buildGoodsSpec(workspace = {}, line) {
  if (!line) return "";
  const lineId = text(line.id ?? line.orderLineId);
  const fulfillment = findFulfillment(workspace, lineId);
  const colorSpec = getLineColorSpecLabel(line);
  const printSide = isPrinted(line) ? mapPrintSide(getLinePrintSide(line)) : "";
  const remark = getLineRemark(line);
  const qty = finiteNumber(line.qty ?? line.quantity ?? line.originalQty, 0);

  return [
    line.productName ?? line.product,
    line.size,
    colorSpec,
    printSide,
    `${qty}个`,
    fulfillment?.packages ?? fulfillment?.packageLabel ?? "",
    remark,
  ]
    .map(text)
    .filter(Boolean)
    .join(" / ");
}

function findFulfillment(workspace, lineId) {
  const fulfillments = Array.isArray(workspace.fulfillments) ? workspace.fulfillments : [];
  return fulfillments.find(
    (item) => text(item.lineId ?? item.orderLineId ?? item.order_line_id) === lineId,
  );
}

function isPrinted(line) {
  const print = line?.print ?? line?.printFlag ?? line?.print_flag;
  return print === true || print === "是" || text(print).toLowerCase() === "true";
}

function mapPrintSide(value) {
  if (value === "single") return "单面";
  if (value === "double") return "双面";
  if (value === "单面" || value === "双面") return value;
  return value || "非印刷";
}

function finiteNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return finiteFallback(fallback);
  const number = Number(value);
  return Number.isFinite(number) ? number : finiteFallback(fallback);
}

function finiteFallback(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
  return Math.round(finiteNumber(value) * 100) / 100;
}

function text(value) {
  return String(value ?? "").trim();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}
