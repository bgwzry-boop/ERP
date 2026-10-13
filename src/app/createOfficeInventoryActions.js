import {
  buildPackingTaskId,
  buildProductionTaskId,
} from "../services/officeProductionPackingSelectors.js";
import { getProductionPackingFocusFromLedgerEntry } from "../domain/productionPackingSourceFocus.js";

const fulfillmentSourceTypes = new Set([
  "fulfillment_complete",
  "fulfillment_complete_legacy",
  "fulfillment_pickup",
  "fulfillment_pickup_legacy",
  "fulfillment_cancel",
]);

const orderLineSourceTypes = new Set([
  "order_confirm",
  "order_line",
  "order_line_quantity_adjustment",
  "order_line_void",
  "inventory_reservation",
  "inventory_reservation_release",
]);

const productionSourceTypes = new Set([
  "production_report",
  "production_report_reservation",
  "packing_complete",
]);

export function createOfficeInventoryActions({
  allowLocalFallback,
  createInventoryCorrectionDraft,
  defaultOrderFilters,
  fulfillments,
  guardUiAction,
  inventoryLedgerSource,
  linkInventoryCorrectionAttachment,
  loadInventoryCorrectionDetail,
  loadProductionPackingSourceDetail,
  orderLines,
  productionPacking,
  refreshInventoryCorrectionQueue,
  refreshInventoryLedgerEntries,
  resolveLineFromRef,
  confirmInventoryCorrectionDraft,
  setActivePage,
  setFulfillmentTab,
  setOrderFilters,
  setProductionPackingDetailState,
  setProductionPackingFocus,
  setSelectedFulfillmentId,
  setSelectedOrderId,
  setToast,
  statements,
}) {
  function normalizeFormalResult(result, label) {
    if (!result || result.blocked || allowLocalFallback || result.source === "api") return result;
    return {
      ...result,
      blocked: true,
      upstreamSource: result.source,
      source: "api_error",
      error: {
        code: result.error?.code ?? "INVENTORY_ACTION_SERVER_REQUIRED",
        message: result.error?.message ?? `生产模式要求通过后端完成${label}。`,
      },
      feedback: `后端未确认${label}，production 不接受本地替代结果。`,
    };
  }

  async function openInventoryCorrectionDetail(correctionDraftId, sourceEntry = null) {
    setActivePage("inventory");
    const result = normalizeFormalResult(
      await loadInventoryCorrectionDetail(correctionDraftId, sourceEntry, { showToast: true }),
      "库存修正详情读取",
    );
    if (result?.feedback) setToast(result.feedback);
    return result?.blocked ? null : result?.detail ?? null;
  }

  async function handleInventoryCorrectionDraft({ stock, actualQty, reason }) {
    if (!guardUiAction("inventory", "生成修正草稿")) return null;
    const result = normalizeFormalResult(
      await createInventoryCorrectionDraft({ stock, actualQty, reason }),
      "库存修正草稿创建",
    );
    if (result?.feedback) setToast(result.feedback);
    return result?.blocked ? null : result?.draft ?? null;
  }

  async function handleInventoryCorrectionAttachment(payload) {
    if (!guardUiAction("inventory", "生成修正草稿")) return null;
    const result = normalizeFormalResult(
      await linkInventoryCorrectionAttachment(payload),
      "库存修正凭证关联",
    );
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  async function handleInventoryCorrectionConfirm(draft) {
    if (!guardUiAction("inventory", "确认修正生效")) return null;
    const result = normalizeFormalResult(
      await confirmInventoryCorrectionDraft(draft),
      "库存修正确认",
    );
    if (result?.feedback) setToast(result.feedback);
    return result?.blocked ? null : result?.confirmation ?? null;
  }

  async function refreshInventoryCorrectionQueueAction(options) {
    const result = normalizeFormalResult(
      await refreshInventoryCorrectionQueue(options),
      "库存修正确认队列刷新",
    );
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  async function refreshInventoryLedgerAction(options) {
    const result = normalizeFormalResult(
      await refreshInventoryLedgerEntries(options),
      "库存流水刷新",
    );
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  function focusInventoryLedgerSource(entry) {
    const sourceType = String(entry?.sourceType ?? "").trim();
    const sourceId = String(entry?.sourceId ?? "").trim();
    if (!sourceId) {
      setToast(`库存流水 ${entry?.ledgerId ?? ""} 暂无来源单据 ID。`);
      return;
    }
    if (!allowLocalFallback && inventoryLedgerSource !== "api") {
      setToast("库存流水尚未通过后端 API 刷新，production 不使用本地流水定位业务单据。");
      return;
    }

    const fulfillment =
      fulfillments.find((item) => item.id === sourceId) ??
      fulfillments.find((item) => item.fulfillmentId === sourceId) ??
      fulfillments.find((item) => item.lineId === sourceId);
    const orderLine = resolveLineFromRef(orderLines, statements, sourceId);

    if (productionSourceTypes.has(sourceType)) {
      const focusTarget = getProductionPackingFocusFromLedgerEntry(entry, {
        orderLines: [...(productionPacking.productionTasks ?? []), ...orderLines],
        productionPacking,
        buildProductionTaskId,
        buildPackingTaskId,
      });
      setActivePage("packing");
      if (focusTarget) {
        const nextFocusTarget = {
          ...focusTarget,
          focusKey: `${entry?.ledgerId ?? sourceId}-${Date.now()}`,
        };
        setProductionPackingFocus(nextFocusTarget);
        void loadProductionPackingSourceDetail(nextFocusTarget);
        const targetLabel = focusTarget.mode === "packing" ? "打包任务" : "生产报工任务";
        setToast(`已从库存流水定位到${targetLabel} ${focusTarget.taskId}。`);
      } else {
        setProductionPackingDetailState({
          source: "local",
          detail: null,
          requestedType: "",
          requestedId: "",
          loading: false,
          error: `未找到来源 ${sourceId} 对应的生产或打包任务。`,
          lastSyncedAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        });
        setToast(`已打开打包 / 标签页；未找到来源 ${sourceId} 对应的生产或打包任务。`);
      }
      return;
    }

    if (fulfillmentSourceTypes.has(sourceType) && fulfillment) {
      setSelectedFulfillmentId(fulfillment.id);
      setFulfillmentTab(fulfillment.method);
      setActivePage("fulfillment");
      setToast(`已从库存流水定位到出库 / 交付记录 ${fulfillment.id}。`);
      return;
    }

    if (orderLineSourceTypes.has(sourceType) && orderLine) {
      setSelectedOrderId(orderLine.id);
      setOrderFilters({ ...defaultOrderFilters, customerId: orderLine.customerId });
      setActivePage("orders");
      setToast(`已从库存流水定位到订单明细 ${orderLine.id}。`);
      return;
    }

    if (fulfillment) {
      setSelectedFulfillmentId(fulfillment.id);
      setFulfillmentTab(fulfillment.method);
      setActivePage("fulfillment");
      setToast(`已从库存流水定位到出库 / 交付记录 ${fulfillment.id}。`);
      return;
    }

    if (orderLine) {
      setSelectedOrderId(orderLine.id);
      setOrderFilters({ ...defaultOrderFilters, customerId: orderLine.customerId });
      setActivePage("orders");
      setToast(`已从库存流水定位到订单明细 ${orderLine.id}。`);
      return;
    }

    if (sourceType === "inventory_correction") {
      void openInventoryCorrectionDetail(sourceId, entry);
      return;
    }

    setToast(`暂不能定位库存流水来源 ${sourceType || "未知类型"} / ${sourceId}。`);
  }

  return {
    focusInventoryLedgerSource,
    handleInventoryCorrectionAttachment,
    handleInventoryCorrectionConfirm,
    handleInventoryCorrectionDraft,
    openInventoryCorrectionDetail,
    refreshInventoryCorrectionQueueAction,
    refreshInventoryLedgerAction,
  };
}
