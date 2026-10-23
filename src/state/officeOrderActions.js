import { isStockOrderType } from "../../shared/orderRouting.js";
import { makeFulfillment, makeOrderLine } from "./officeRecordFactories.js";
import { enrichDraftRow } from "../lib/orderParser.js";
import {
  findCustomerByName,
  findStockForDraft,
  getDraftBlockingRows,
  getDraftNote,
  getDraftOrderType,
  getDraftStatus,
  getFulfillmentGoodsDisplay,
  getOptionalColor,
  nextId,
} from "../domain/officeRules.js";

export function getDraftSaveTodoInput(draftRows) {
  const first = draftRows[0];
  return {
    type: "订单草稿待确认",
    customerId: first?.customerId || "C001",
    ref: "DRAFT-P0",
    refType: "order_draft",
    refId: "DRAFT-P0",
    summary: `${draftRows.length} 行识别结果待人工确认`,
    latest: first?.latest ?? "待确认",
    urgency: "普通",
    impact: "草稿未生成正式订单",
  };
}

export function confirmDraftOrder({ draftRows, inventoryRecords, orderLines, fulfillments, customers = [], resolveAmount }) {
  const checkedRows = draftRows.map((row) => {
    const checked = enrichDraftRow(row, inventoryRecords);
    if (resolveAmount) {
      const amount = resolveAmount(row);
      if (!Number.isFinite(amount) || amount < 0) throw new TypeError("Confirmed amount is invalid");
      checked.amount = amount;
    }
    return checked;
  });
  const demandByStock = new Map();
  for (const row of checkedRows.filter(item => isStockOrderType(item.orderType) && item.inventory === "可用")) {
    const stock = findStockForDraft(row, inventoryRecords);
    if (!stock) continue;
    const group = demandByStock.get(stock) ?? { rows: [], qty: 0 };
    group.rows.push(row); group.qty += row.qty; demandByStock.set(stock, group);
  }
  for (const [stock, { rows, qty }] of demandByStock) {
    const available = stock.inStock - stock.reserved - stock.locked - stock.pending;
    if (qty > available) for (const row of rows) row.inventory = `缺货：同规格合计 ${qty} 个，可用 ${Math.max(0, available)} 个，转生产排产`;
  }
  const blockingRows = getDraftBlockingRows(checkedRows);
  if (blockingRows.length) {
    return {
      blocked: true,
      checkedRows,
      selectedDraftId: blockingRows[0].row.id,
      draftStatus: "缺字段拦截",
      toast: `${blockingRows[0].row.id} 缺 ${blockingRows[0].missing.join("、")}；已重新校验库存/价格，补齐后才能生成正式订单。`,
    };
  }

  const orderNo = nextId("ORD-P0-", orderLines);
  const newLines = checkedRows.map((row, index) =>
    makeOrderLine({
      orderNo,
      lineNo: String(index + 1).padStart(2, "0"),
      customerId: row.customerId || findCustomerByName(customers, row.customer)?.id || "C001",
      product: row.product,
      size: row.size,
      color: row.color,
      handle: row.handle,
      style: row.style,
      print: row.print,
      qty: row.qty,
      orderType: getDraftOrderType(row),
      status: getDraftStatus(row),
      fulfillment: row.fulfillment,
      latest: row.latest,
      amount: row.amount,
      exceptions: row.inventory.startsWith("缺货") ? ["库存不足"] : row.inventory === "需复核" ? ["库存需复核"] : [],
      inventory: row.inventory,
      printSide: row.printSide === "非印刷" ? "" : row.printSide,
      printColor: row.printColor === "非印刷" ? "" : row.printColor,
      artworkStatus: row.artworkStatus,
      artworkAttachment: row.artworkAttachment,
      note: getDraftNote(row),
      handleColor: getOptionalColor(row.handleColor),
    }),
  );

  const newFulfillments = newLines
    .filter((line) => line.fulfillment !== "待确认")
    .map((line, index) =>
      makeFulfillment({
        id: nextId("F", fulfillments, index),
        method: line.fulfillment,
        customerId: line.customerId,
        lineId: line.id,
        goods: getFulfillmentGoodsDisplay({ goods: `${line.size} ${line.color} ${line.product}`, qty: line.qty }, line),
        qty: line.qty,
        packages: "",
        status: line.status === "待排产" ? "待生产" : line.fulfillment === "快递快运" ? "待打印标签" : "待出库",
        latest: line.latest,
        zone: "按库存推荐",
        source: "正式订单占用",
      }),
    );

  return {
    blocked: false,
    checkedRows,
    newLines,
    newFulfillments,
    shortageTodoInputs: [],
    selectedOrderId: newLines[0]?.id,
    draftStatus: "已生成正式订单",
    orderNo,
    toast: `已重新校验库存/价格并生成正式订单 ${orderNo}，新增 ${newLines.length} 行；可用库存行已模拟占用，缺货通货进入生产待排任务。`,
  };
}

export function applyDraftInventoryReservations(inventoryRecords, checkedRows) {
  return inventoryRecords.map((stock) => {
    const reservedQty = checkedRows
      .filter((row) => row.inventory === "可用")
      .filter((row) => findStockForDraft(row, inventoryRecords)?.id === stock.id)
      .reduce((sum, row) => sum + row.qty, 0);
    return reservedQty ? { ...stock, reserved: stock.reserved + reservedQty } : stock;
  });
}
