import { createHash } from "node:crypto";
import { normalizeMiniappSize } from "./miniapp/miniappErpProjectionAdapter.mjs";
import { normalizeOrderType } from "../shared/orderRouting.js";
import { PRINT_PRICE_TABLE_VERSION } from "../src/domain/priceTable.js";

const text = (value) => String(value ?? "").trim();
export const roundOrderMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export function orderPricingError(code, message, statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode });
}
export function isPrivatePrinting(row) {
  const type = normalizeOrderType(row.orderType);
  return (
    type !== "stock_printed" &&
    (row.print === "是" ||
      row.printFlag === true ||
      ["custom_print", "external_print"].includes(type))
  );
}
export function printingContent(row) {
  return text(row.printContent || row.product || row.productName).replace(
    /\s+/gu,
    " ",
  );
}
export function printingGroupIdentity(row) {
  const content = printingContent(row);
  if (
    !content ||
    /^(空白袋|定制印刷|客户定制图案|客户定制印刷|定制图案|通货袋|特殊尺寸(?:空白)?袋?)$/u.test(
      content,
    )
  )
    return null;
  const side = /双|double/u.test(text(row.printSide)) ? "双面" : "单面";
  return {
    customerId: text(row.customerId),
    size: normalizeMiniappSize(row.size),
    content,
    side,
    ...(row.printingScope ? { scope: text(row.printingScope) } : {}),
  };
}
export function sharedPrintingUnitPrice(quantity, side) {
  if (quantity >= 10_000) return 0.06;
  if (quantity >= 5_000) return 0.08;
  if (quantity >= 3_000) return 0.09;
  return side === "双面" ? 0.13 : 0.09;
}

// Colour is deliberately absent from the identity: the accepted rule combines
// ink colours and bag colours for the same content/size in one printing batch.
export function buildOrderPrintingPriceGroups(draftRows, relatedRows = []) {
  const groups = new Map();
  for (const [kind, rows] of [
    ["draft", draftRows],
    ["related", relatedRows],
  ]) {
    for (const row of rows) {
      if (!isPrivatePrinting(row)) continue;
      const identity = printingGroupIdentity(row);
      const rowId = text(row.id ?? row.orderLineId);
      const key = identity
        ? JSON.stringify(identity)
        : JSON.stringify({ ungroupedLine: rowId });
      const group = groups.get(key) ?? {
        groupId: `PG-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`,
        ...(identity ?? {
          customerId: row.customerId,
          size: normalizeMiniappSize(row.size),
          content: "内容待核对，按本行计价",
          side: /双/u.test(text(row.printSide)) ? "双面" : "单面",
        }),
        draftLineIds: [],
        relatedOrderLineIds: [],
        quantity: 0,
        printRuleVersion: PRINT_PRICE_TABLE_VERSION,
      };
      const quantity = Number(row.qty ?? row.originalQty);
      if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        !Number.isSafeInteger(group.quantity + quantity)
      )
        throw orderPricingError(
          "ORDER_PRINT_GROUP_QUANTITY_INVALID",
          "印刷计价数量必须是有效正整数。",
          422,
        );
      group.quantity += quantity;
      (kind === "draft" ? group.draftLineIds : group.relatedOrderLineIds).push(
        rowId,
      );
      groups.set(key, group);
    }
  }
  for (const group of groups.values()) {
    if (group.relatedOrderLineIds.length && !group.draftLineIds.length)
      throw orderPricingError(
        "ORDER_PRINT_GROUP_NOT_MATCHED",
        "关联补单必须与本次新单的客户、印刷内容、尺寸和印刷面一致。",
      );
    group.unitPrice = sharedPrintingUnitPrice(group.quantity, group.side);
    group.memberCount =
      group.draftLineIds.length + group.relatedOrderLineIds.length;
  }
  return [...groups.values()];
}

export function assertUnstartedPrintingSupplement(workspace, rows, customerId) {
  for (const row of rows) {
    const id = row.id ?? row.orderLineId;
    const tasks = (workspace.productionTasks ?? []).filter(
      (task) =>
        (task.orderLineId ?? task.lineId) === id &&
        /丝印|印刷/u.test(task.taskType),
    );
    if (
      row.customerId !== customerId ||
      !isPrivatePrinting(row) ||
      !printingGroupIdentity(row) ||
      /已交付|已完成|已关闭|已作废|取消/u.test(
        text(row.status ?? row.lineStatus),
      ) ||
      !tasks.length ||
      tasks.some(
        (task) =>
          !["待排产", "丝印已排产", "待开始", "未开始"].includes(
            task.taskStatus ?? task.status,
          ),
      ) ||
      (workspace.workshopReports ?? []).some(
        (report) =>
          tasks.some(
            (task) =>
              (task.id ?? task.productionTaskId) === report.productionTaskId,
          ) ||
          ((report.orderLineId ?? report.lineId) === id &&
            /丝印|印刷/u.test(text(report.processType ?? report.process))),
      ) ||
      (workspace.statementLines ?? []).some(
        (line) => line.orderLineId === id,
      ) ||
      (workspace.paperOutboundDocuments ?? []).some(
        (document) =>
          document.status !== "已作废" &&
          (document.orderLineId === id ||
            (workspace.fulfillments ?? []).some(
              (fulfillment) =>
                (fulfillment.orderLineId ?? fulfillment.lineId) === id &&
                (fulfillment.id ?? fulfillment.fulfillmentId) ===
                  document.fulfillmentId,
            )),
      ) ||
      (workspace.fulfillments ?? []).some(
        (fulfillment) =>
          (fulfillment.orderLineId ?? fulfillment.lineId) === id &&
          /配送中|已交付|已拉走|已自提/u.test(text(fulfillment.status)),
      )
    ) {
      throw orderPricingError(
        "ORDER_PRINT_SUPPLEMENT_NOT_ELIGIBLE",
        "补单合组只允许同客户、同内容同尺寸且尚未开印、未交付和未进入对账的明细；请刷新原单后核对。",
      );
    }
  }
}
