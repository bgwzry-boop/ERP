import { isShippedFulfillment } from "./deliveryBatches.js";
import { isReplenishmentRow, isStockOrderType, normalizeOrderType, stockSupplyRoute } from "./orderRouting.js";
import { fulfillmentIdOf, isActivePackage, packageAnchorId, packageContents } from "./packageContents.js";

export const noteDocumentTypes = ["delivery_note", "pickup_note", "outbound_note"];
export const voidNoteStatuses = ["已取消", "已作废", "voided", "canceled"];
export const shippedNoteStatuses = ["已交付", "已拉走", "已完成"];
export const productionLineStages = ["待排产", "待生产", "丝印中", "制袋中", "待完工确认", "待打包"];
export const stockPreparationAction = "record_stock_preparation";

const lineIdOf = row => row?.orderLineId ?? row?.lineId;
const blocked = reason => ({ ready: false, reason });
const ready = () => ({ ready: true, reason: "" });

export function isDirectStockShipment(workspace, fulfillment, orderLine) {
  const lineId = lineIdOf(fulfillment);
  return Boolean(lineId && (orderLine?.orderLineId ?? orderLine?.id) === lineId
    && !isReplenishmentRow(orderLine) && isStockOrderType(orderLine.orderType)
    && stockSupplyRoute(orderLine) !== "production"
    && !String(orderLine.lineStatus ?? orderLine.status ?? "").includes("缺货")
    && !productionLineStages.includes(orderLine.lineStatus ?? orderLine.status)
    && !(workspace.productionTasks ?? []).some(task => lineIdOf(task) === lineId && !voidNoteStatuses.includes(task.taskStatus ?? task.status)));
}

export function indexStockPreparationLogs(logs = []) {
  const index = new Map();
  for (const log of logs) {
    const revision = log.after?.stockPreparation?.fulfillmentRevision;
    if (log.action !== stockPreparationAction || log.targetType !== "fulfillment" || !Number.isSafeInteger(revision)) continue;
    const previous = index.get(log.targetId);
    if (!previous || revision > previous.after.stockPreparation.fulfillmentRevision) index.set(log.targetId, log);
  }
  return index;
}

export function latestStockPreparation(workspace, fulfillment, requiredQty, index = indexStockPreparationLogs(workspace.operationLogs)) {
  const latest = index.get(fulfillmentIdOf(fulfillment));
  const current = latest?.after.stockPreparation;
  if (!current) return null;
  const confirmed = current.method === fulfillment.method && current.orderLineId === lineIdOf(fulfillment)
    && Number(current.requiredQty) === Number(requiredQty) && Number(current.quantity) === Number(requiredQty) && Number(requiredQty) > 0;
  return { ...current, operationLogId: latest.id, confirmed };
}

// A completed packing receipt is attributable to one delivery even before its paper note exists.
function hasPackingReceipt(workspace, fulfillment, completedPacking) {
  const id = fulfillmentIdOf(fulfillment);
  const actual = Number(fulfillment.actualQty);
  if (!(actual > 0)) return false;
  const anchor = packageAnchorId(fulfillment);
  return (workspace.operationLogs ?? []).some(log => {
    const after = log.after;
    if (log.action === "replace_package_group") {
      return Boolean(anchor && log.targetType === "fulfillment" && log.targetId === anchor
        && Number(fulfillment.packingGroupRevision) > 0 && Number(after?.packingRevision) === Number(fulfillment.packingGroupRevision)
        && after.fulfillmentIds?.includes(id));
    }
    return log.action === "complete_packing_task" && log.targetType === "packing_task"
      && completedPacking.some(task => (task.packingTaskId ?? task.id) === log.targetId && Number(task.actualPackedQty) === actual)
      && fulfillmentIdOf(after?.fulfillment) === id && Number(after.fulfillment.actualQty) === actual
      && Number(after.packingTask?.actualPackedQty) === actual;
  });
}

function quantityAlreadyAllocated(workspace, fulfillment, completedPacking) {
  const issued = new Set((workspace.paperOutboundDocuments ?? []).filter(note => !voidNoteStatuses.includes(note.status)).map(note => note.fulfillmentId));
  let total = 0;
  for (const sibling of workspace.fulfillments ?? []) {
    if (lineIdOf(sibling) !== lineIdOf(fulfillment) || fulfillmentIdOf(sibling) === fulfillmentIdOf(fulfillment) || voidNoteStatuses.includes(sibling.status)) continue;
    if (!issued.has(fulfillmentIdOf(sibling)) && sibling.status !== "已完成" && !isShippedFulfillment(sibling)
      && !hasPackingReceipt(workspace, sibling, completedPacking)) continue;
    const qty = Number(sibling.actualQty);
    if (!Number.isSafeInteger(qty) || qty <= 0) return null;
    total += qty;
  }
  return total;
}

export function fulfillmentNoteReadiness(workspace, fulfillment, orderLine, options = {}) {
  const lineId = lineIdOf(fulfillment);
  if (!lineId || (orderLine?.orderLineId ?? orderLine?.id) !== lineId) return blocked("请先核对这批货关联的订单明细。");
  if (isReplenishmentRow(orderLine)) return blocked("补库单完工后入成品库。");
  if (voidNoteStatuses.includes(fulfillment.status) || voidNoteStatuses.includes(orderLine.lineStatus ?? orderLine.status)) {
    return blocked("这批货或订单明细已作废。");
  }
  if (options.historicalReprint && (fulfillment.physicalOutboundAt || fulfillment.finalDeliveryAt || fulfillment.deliveredAt
    || shippedNoteStatuses.includes(fulfillment.status))) return ready();
  if (options.operationalNetDeduction && options.operationalNetDeduction !== Number(options.requiredStockQty)) {
    return blocked("实际扣库数量与这批货应出数量不一致，请先按更正流程退补库存，再重打正式单。");
  }

  const orderType = normalizeOrderType(orderLine.orderType);
  if (!orderType) return blocked("请先核对订单类型和发货方式。");
  const tasks = (workspace.productionTasks ?? []).filter(task => lineIdOf(task) === lineId && !["已作废", "已取消"].includes(task.taskStatus ?? task.status));
  if (isDirectStockShipment(workspace, fulfillment, orderLine)) {
    if (["待补货", "数量差异待处理", "无法出库", "送货异常"].includes(fulfillment.status)) {
      return blocked("请先处理这批货的数量或出库差异。");
    }
    const requiredQty = options.requiredStockQty ?? fulfillment.expectedQty ?? fulfillment.qty;
    if ("printedQty" in options && Number(options.printedQty) !== Number(requiredQty)) {
      return blocked("旧纸单数量与本批应出数量不同，请作废旧单后重新打单。");
    }
    const anchor = packageAnchorId(fulfillment);
    const id = fulfillmentIdOf(fulfillment);
    const correctedQuantity = (workspace.operationLogs ?? []).some((log) => log.targetType === "fulfillment" && log.targetId === id
      && log.action === "correct_fulfillment_note" && log.after?.preDepartureQuantityCorrection === true);
    if (anchor && correctedQuantity) {
      const items = (workspace.packages ?? []).filter((row) => row.fulfillmentId === anchor && isActivePackage(row))
        .flatMap(packageContents).filter((item) => item.fulfillmentId === id);
      if (items.some((item) => item.orderLineId !== lineId || !(Number(item.packedQty) > 0))
        || items.reduce((qty, item) => qty + Number(item.packedQty), 0) !== Number(requiredQty)) {
        return blocked("本批已改数量，请先按实际数量重新核对包裹，再重打正式单。");
      }
    }
    const prep = options.stockPreparation === undefined ? latestStockPreparation(workspace, fulfillment, requiredQty) : options.stockPreparation;
    if ((options.onSitePickup && !correctedQuantity && ["pickup", "自提"].includes(fulfillment.method)) || prep?.confirmed) return ready();
    return blocked("先核对库房备货数量和经手人，再打印正式单。");
  }

  const finalProcess = orderType === "external_print" ? "丝印" : "制袋";
  const completedTasks = new Set(tasks.filter(task => task.taskType === finalProcess && (task.taskStatus ?? task.status) === "已完成")
    .map(task => task.productionTaskId ?? task.id));
  const finalReports = (workspace.workshopReports ?? []).filter(report => lineIdOf(report) === lineId
    && completedTasks.has(report.productionTaskId) && report.processType === finalProcess
    && report.completedAt && Number(report.qualifiedQty) > 0 && report.evidence?.reportKind !== "daily_progress");
  if (!finalReports.length) return blocked(`请先完成本批${finalProcess}报工。`);

  const actualQty = Number(fulfillment.actualQty);
  const completedPacking = (workspace.packingTasks ?? []).filter(task => lineIdOf(task) === lineId
    && task.status === "已完成" && Number(task.actualPackedQty) > 0);
  if (!completedPacking.length || !Number.isSafeInteger(actualQty) || actualQty <= 0) return blocked("请先完成本批打包，确认实际数量。");
  const fulfillmentId = fulfillmentIdOf(fulfillment);
  const anchor = packageAnchorId(fulfillment) || fulfillmentId;
  const items = (workspace.packages ?? []).filter(row => isActivePackage(row) && row.fulfillmentId === anchor)
    .flatMap(packageContents).filter(item => item.fulfillmentId === fulfillmentId);
  if ("printedQty" in options && Number(options.printedQty) !== actualQty) {
    return blocked("旧纸单数量与本批实数不同，请作废旧单后重新打单。");
  }
  if (items.some(item => item.orderLineId !== lineId || !Number.isSafeInteger(Number(item.packedQty)) || Number(item.packedQty) <= 0)
    || items.reduce((sum, item) => sum + Number(item.packedQty), 0) !== actualQty) {
    return blocked("请核对本批实物包裹，包内合计须与实际数量一致。");
  }
  const allocated = quantityAlreadyAllocated(workspace, fulfillment, completedPacking);
  if (allocated === null) return blocked("请先核对同一明细已打单批次的实际数量。");
  const needed = allocated + actualQty;
  const packedQty = completedPacking.reduce((sum, task) => sum + Number(task.actualPackedQty), 0);
  if (packedQty < needed) return blocked("本明细的已打包数量不足，请核对本批与其他批次的实数。");
  const producedQty = finalReports.reduce((sum, report) => sum + Number(report.qualifiedQty), 0);
  if (producedQty < needed && !hasPackingReceipt(workspace, fulfillment, completedPacking)) {
    return blocked("完工报数不足，请核对本批实物并登记打包实数。");
  }
  return ready();
}
