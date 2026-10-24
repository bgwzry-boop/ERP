import {hasExecutedDelivery} from "./orderMutationDeliveryGuard.mjs";
import {assertOrderDocumentsVoided} from "./orderMutationDocumentGuard.mjs";
import { createHash } from "node:crypto";
import { normalizeMiniappSize } from "./miniapp/miniappErpProjectionAdapter.mjs";
import { normalizeOrderType } from "../shared/orderRouting.js";
import { PRINT_PRICE_TABLE_VERSION } from "../src/domain/priceTable.js";
import { normalizeFactoryStandardColor } from "../shared/factoryStandardColors.js";

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
const PRINTING_INK_PLACEHOLDERS = new Set(["待确认", "非印刷", "无印刷", "无", "不印刷", "未印刷"]);

export function printingContent(row) {
  // Merchandise names do not establish an artwork identity.
  // Missing content stays per-line; it must never become an inferred group.
  return text(row.printContent).replace(/\s+/gu, " ");
}
export function normalizePrintingInkColor(value) {
  const compact = String(value ?? "").normalize("NFKC").trim().replace(/[\s·•]+/gu, "");
  if (!compact || PRINTING_INK_PLACEHOLDERS.has(compact)) return "";
  return normalizeFactoryStandardColor(compact) || compact;
}
export function printingGroupIdentity(row) {
  const content = printingContent(row);
  const inkColor = normalizePrintingInkColor(row.printColor);
  // Bag-body colour is not part of a printing batch. Missing ink stays per-line.
  if (!content || !inkColor) return null;
  const side = /双|double/u.test(text(row.printSide)) ? "双面" : "单面";
  return {
    customerId: text(row.customerId),
    size: normalizeMiniappSize(row.size),
    content,
    inkColor,
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

// Same size, exact content and standardized ink share one ladder. Bag colour does not.
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
        "关联补单必须与本次新单的客户、印刷内容、尺寸、印刷油墨色和印刷面一致。",
      );
    group.unitPrice = sharedPrintingUnitPrice(group.quantity, group.side);
    group.memberCount =
      group.draftLineIds.length + group.relatedOrderLineIds.length;
  }
  return [...groups.values()];
}

// A roll/machine or an order alone cannot prove which production process ran.
// Follow only the immutable consumption -> exact issue -> printing-task identity.
export function hasPrintingMaterialConsumption(workspace, taskIds) {
  const ids = new Set(taskIds);
  return (workspace.rawMaterialInbounds ?? []).some(inbound => (inbound.rawMaterialConsumptionRecords ?? []).some(record => {
    if (!(Number(record.consumedWeightKg) > 0 || Number(record.consumedQuantity) > 0)) return false;
    const issue = (inbound.rawMaterialIssueRecords ?? []).find(row => row.issueRecordId === record.issueRecordId && row.rollId === record.rollId);
    return ids.has(record.productionTaskId || issue?.productionTaskId);
  }));
}
export function assertPrintingMaterialsUnconsumed(workspace, taskIds) {
  if (hasPrintingMaterialConsumption(workspace, taskIds)) throw orderPricingError("ORDER_PRINT_SUPPLEMENT_NOT_ELIGIBLE", "原印刷任务已有实际原料消耗，不能再按未开印同批补单修改原价；仅领料不等于已开印。");
}
export async function refreshPrintingConsumptionFacts(workspace, {required = true} = {}) {
  if (required && workspace.coreWorkspaceReadRepository?.kind === "postgres") {
    const state = await workspace.coreWorkspaceReadRepository.loadState();
    const keys = ["orderLines","priceSnapshots","productionTasks","workshopReports","fulfillments","statementLines","printRecords","paperOutboundDocuments"];
    if (keys.some(key => !Array.isArray(state?.[key]))) throw orderPricingError("ORDER_PRINT_CONSUMPTION_SOURCE_UNAVAILABLE", "印刷原单和单据读取不完整，尚未修改订单。", 503);
    for (const [key,value] of Object.entries(state)) if (Array.isArray(value)) workspace[key] = value;
  }
  if (required) {
    if (workspace.printJobRepository?.loadState) {
      const jobs = await workspace.printJobRepository.loadState();
      if (!Array.isArray(jobs?.printJobs)) throw orderPricingError("ORDER_PRINT_CONSUMPTION_SOURCE_UNAVAILABLE", "当前打印任务读取不完整，尚未修改订单。", 503);
      workspace.printJobs = jobs.printJobs;
    } else if (workspace.coreWorkspaceReadRepository?.kind === "postgres") throw orderPricingError("ORDER_PRINT_CONSUMPTION_SOURCE_UNAVAILABLE", "当前打印任务读取不完整，尚未修改订单。", 503);
  }
  if (workspace.rawMaterialInboundRepository?.loadState) {
    const state = await workspace.rawMaterialInboundRepository.loadState();
    if (Array.isArray(state?.rawMaterialInbounds)) { workspace.rawMaterialInbounds = state.rawMaterialInbounds; return; }
  } else if (workspace.coreWorkspaceReadRepository?.kind !== "postgres") return;
  if (required) throw orderPricingError("ORDER_PRINT_CONSUMPTION_SOURCE_UNAVAILABLE", "印刷实际耗料读取不完整，请重新读取后核对；尚未修改订单。", 503);
}
export function printingMaterialConsumptionAbsentSql(taskIdQuery) {
  return `NOT EXISTS(SELECT 1 FROM raw_material_inbounds inbound
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(inbound.payload_json->'rawMaterialConsumptionRecords','[]'::jsonb)) consumed
    LEFT JOIN LATERAL (SELECT issue FROM jsonb_array_elements(COALESCE(inbound.payload_json->'rawMaterialIssueRecords','[]'::jsonb)) issue
      WHERE issue->>'issueRecordId'=consumed->>'issueRecordId' AND issue->>'rollId'=consumed->>'rollId' LIMIT 1) matched ON true
    WHERE (CASE WHEN consumed->>'consumedWeightKg' ~ '^[0-9]+([.][0-9]+)?$' THEN (consumed->>'consumedWeightKg')::numeric ELSE 0 END > 0
      OR CASE WHEN consumed->>'consumedQuantity' ~ '^[0-9]+([.][0-9]+)?$' THEN (consumed->>'consumedQuantity')::numeric ELSE 0 END > 0)
    AND COALESCE(NULLIF(consumed->>'productionTaskId',''),matched.issue->>'productionTaskId') IN (${taskIdQuery}))`;
}
export function assertUnstartedPrintingSupplement(workspace, rows, customerId) {
  for (const row of rows) {
    const id = row.id ?? row.orderLineId;
    const tasks = (workspace.productionTasks ?? []).filter(
      (task) =>
        (task.orderLineId ?? task.lineId) === id &&
        /丝印|印刷/u.test(task.taskType),
    );
    assertPrintingMaterialsUnconsumed(workspace, tasks.map(task => task.id ?? task.productionTaskId));
    assertOrderDocumentsVoided(workspace, id);
    // Historical local paper facts can link directly to a line. Formal PG
    // papers use the fulfillment FK, but adopting the shared guard must not
    // discard this existing local evidence contract.
    if ((workspace.paperOutboundDocuments ?? []).some(document => document.orderLineId === id
      && !["已作废","已取消","voided","invalidated"].includes(document.status))) {
      throw orderPricingError("ERP_ORDER_DOCUMENTS_ACTIVE_CONFLICT", "请先作废旧单据再改单；改单后重印。");
    }
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
      (workspace.fulfillments ?? []).some(
        (fulfillment) =>
          (fulfillment.orderLineId ?? fulfillment.lineId) === id &&
          (hasExecutedDelivery(fulfillment) || /配送中|已交付|已拉走|已自提/u.test(text(fulfillment.status))),
      )
    ) {
      throw orderPricingError(
        "ORDER_PRINT_SUPPLEMENT_NOT_ELIGIBLE",
        "补单合组只允许同客户、同内容、同尺寸、同印刷油墨色且尚未开印、未交付和未进入对账的明细；请刷新原单后核对。",
      );
    }
  }
}
