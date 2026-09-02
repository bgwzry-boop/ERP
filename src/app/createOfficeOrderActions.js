import { findStockForDraft } from "../domain/officeRules.js";
import { getOfficeDraft as getOfficeDraftDefault } from "../services/officeOrderLazyApi.js";
import {
  createPrintArtworkAttachmentInput,
} from "../services/officeAttachmentInputs.js";
import { uploadOfficeAttachmentFile } from "../services/officeAttachmentLazyApi.js";

const persistentEntryActions = new Set(["保存草稿", "保存并确认", "确认拆单", "作废草稿"]);
const orderLineActions = new Map([
  ["quantity", "调整正式单数量"],
  ["void", "作废正式单"],
]);

export function createOfficeOrderActions({
  api = {},
  allowLocalFallback,
  authState,
  confirmDiscardDraft,
  currentUserId,
  defaultOrderFilters,
  draftApiMeta,
  draftRows,
  draftStatus,
  entryText,
  executeOrderEntryAction,
  fulfillmentSource,
  fulfillments,
  guardUiAction,
  inventoryRecords,
  openOrderActionModal,
  openQueuedOrderDraft,
  orderLines,
  orderPoolSource,
  linkCrossDraftShortageCancellation,
  recognizeOrderDraft,
  recognizeOrderDraftQueue,
  refreshFulfillments,
  refreshOrderPool,
  refreshOrderDraftQueue,
  refreshStatements,
  resolveLineFromRef,
  restoreShortageCancelledLine,
  runOrderDraftCommand,
  setActivePage,
  setDraftApiMeta,
  setDraftRows,
  setDraftStatus,
  setEntryText,
  setFulfillmentTab,
  setOrderFilters,
  setSelectedFulfillmentId,
  setSelectedStockId,
  setSelectedOrderId,
  setSelectedDraftId,
  setSelectedStatementId,
  setToast,
  statementSource,
  statements,
  updateOrderDraftField,
}) {
  const orderApi = { getOfficeDraft: getOfficeDraftDefault, ...api };
  function normalizeFormalWriteResult(result, label) {
    if (!result || result.blocked || allowLocalFallback || result.source === "api") return result;
    return {
      ...result,
      blocked: true,
      upstreamSource: result.source,
      source: "api_error",
      error: {
        code: result.error?.code ?? "ORDER_ACTION_SERVER_REQUIRED",
        message: result.error?.message ?? `生产模式要求通过后端完成${label}。`,
      },
      feedback: `后端未确认${label}，production 不接受本地替代结果。`,
    };
  }

  async function loadFormalOrderLines() {
    if (allowLocalFallback || orderPoolSource === "api") return orderLines;
    const result = await refreshOrderPool({ showToast: false });
    if (result?.blocked || result?.source !== "api") {
      setToast("订单池尚未通过后端 API 刷新，production 不使用本地订单定位。");
      return null;
    }
    return result.items ?? [];
  }

  async function loadFormalFulfillments() {
    if (allowLocalFallback || fulfillmentSource === "api") return fulfillments;
    const result = await refreshFulfillments({ showToast: false });
    if (result?.blocked || result?.source !== "api") {
      setToast("出库交付尚未通过后端 API 刷新，production 不使用本地交付记录定位。");
      return null;
    }
    return result.items ?? [];
  }

  async function loadFormalStatements() {
    if (allowLocalFallback || statementSource === "api") return statements;
    const result = await refreshStatements({ showToast: false });
    if (result?.blocked || result?.source !== "api") {
      setToast("对账列表尚未通过后端 API 刷新，production 不使用本地对账记录定位。");
      return null;
    }
    return result.statements ?? [];
  }

  function focusOrderLineFromItems(ref, reason, candidateOrderLines) {
    const line = resolveLineFromRef(candidateOrderLines, statements, ref);
    setActivePage("orders");
    if (!line) {
      setOrderFilters(defaultOrderFilters);
      setToast(`已打开订单池，但未找到 ${ref} 对应的订单明细。`);
      return null;
    }
    setSelectedOrderId(line.id);
    setOrderFilters({ ...defaultOrderFilters, customerId: line.customerId });
    setToast(`已从${reason}定位到订单明细 ${line.id}。`);
    return line;
  }

  function createOrderFromTopbar() {
    if (!guardUiAction("topbar", "新建订单")) return;
    if (hasUnsavedOrderDraft({ draftRows, draftStatus, entryText })) {
      const shouldDiscard = confirmDiscardDraft?.("当前订单草稿尚未保存。新建订单会清空现有录入内容，是否继续？") ?? false;
      if (!shouldDiscard) return null;
    }
    setEntryText("");
    setDraftRows([]);
    setDraftStatus("待录入");
    setDraftApiMeta({ draftId: "", clientRevision: 0, source: "local" });
    setSelectedDraftId("");
    setActivePage("entry");
    setToast("已新建空白订单，请粘贴或输入客户原文。");
    return { blocked: false };
  }

  async function focusOrderLine(ref, reason = "订单池") {
    const candidateOrderLines = await loadFormalOrderLines();
    if (!candidateOrderLines) return null;
    return focusOrderLineFromItems(ref, reason, candidateOrderLines);
  }

  async function focusOrderDraft(ref) {
    const draftId = String(ref ?? "").trim();
    if (!draftId) {
      setToast("待办缺少草稿编号，无法打开订单草稿。");
      return null;
    }
    if (draftApiMeta?.draftId === draftId) {
      setSelectedDraftId(draftRows[0]?.id ?? "");
      setActivePage("entry");
      setToast(`已定位到当前订单草稿 ${draftId}。`);
      return { draftId, rows: draftRows };
    }
    const result = await orderApi.getOfficeDraft({
      authState,
      draftId,
      inventories: inventoryRecords,
      operatorId: currentUserId,
    }, { serverRequired: !allowLocalFallback });
    if (result?.blocked) {
      setToast(`无法读取订单草稿 ${draftId}：${result.error?.message ?? "未知错误"}`);
      return null;
    }
    if (!result?.item) {
      setToast(`未找到订单草稿 ${draftId}，待办来源可能已关闭或失效。`);
      return null;
    }
    const opened = openQueuedOrderDraft({ ...result.item, kind: "order_draft" });
    if (opened?.blocked) {
      setToast(opened.feedback ?? `订单草稿 ${draftId} 无法打开。`);
      return null;
    }
    setActivePage("entry");
    setToast(`已从待办打开订单草稿 ${draftId}。`);
    return opened;
  }

  async function focusInventoryByRef(ref, todo = {}) {
    const directInventoryId = String(todo.inventoryItemId ?? todo.inventoryKey ?? ref ?? "").trim();
    let stock = inventoryRecords.find((item) => item.id === directInventoryId || item.inventoryKey === directInventoryId);
    let line = null;
    if (!stock) {
      const candidateOrderLines = await loadFormalOrderLines();
      if (!candidateOrderLines) return null;
      line = resolveLineFromRef(candidateOrderLines, statements, ref);
      if (line) stock = findStockForDraft(line, inventoryRecords);
    }
    if (!stock) stock = findInventoryFromTodoSummary(todo, inventoryRecords);
    setActivePage("inventory");
    if (!stock) {
      setToast(`已打开库存查询，但未找到 ${String(ref ?? "").trim() || "该待办"} 对应的库存规格。`);
      return null;
    }
    setSelectedStockId(stock.id);
    setToast(`已从待办定位到库存 ${stock.id}。`);
    return stock;
  }

  async function focusFulfillmentByRef(ref) {
    const candidateFulfillments = await loadFormalFulfillments();
    if (!candidateFulfillments) return null;
    let line = null;
    let candidateOrderLines = null;
    let fulfillment = candidateFulfillments.find((item) => item.lineId === ref);
    if (!fulfillment) {
      candidateOrderLines = await loadFormalOrderLines();
      if (candidateOrderLines) {
        line = resolveLineFromRef(candidateOrderLines, statements, ref);
        fulfillment = candidateFulfillments.find((item) => item.lineId === line?.id)
          ?? candidateFulfillments.find((item) => String(item.lineId ?? "").startsWith(line?.orderNo ?? ref));
      }
    }
    if (fulfillment) {
      setSelectedFulfillmentId(fulfillment.id);
      setFulfillmentTab(fulfillment.method);
      setActivePage("fulfillment");
      setToast(`已定位到出库 / 交付记录 ${fulfillment.lineId}。`);
      return fulfillment;
    }
    if (!candidateOrderLines) candidateOrderLines = await loadFormalOrderLines();
    const locatedLine = line ?? (candidateOrderLines ? resolveLineFromRef(candidateOrderLines, statements, ref) : null);
    if (locatedLine) {
      focusOrderLineFromItems(ref, "待办", candidateOrderLines);
      setToast(`未找到 ${ref} 的出库记录，已定位到订单池明细。`);
      return null;
    }
    setActivePage("orders");
    setOrderFilters(defaultOrderFilters);
    setToast(`未找到 ${ref} 的出库记录或订单明细。`);
    return null;
  }

  async function focusStatementByRef(ref) {
    const candidateStatements = await loadFormalStatements();
    if (!candidateStatements) return null;
    let statement = candidateStatements.find((item) => item.id === ref);
    let line = null;
    let candidateOrderLines = null;
    if (!statement) {
      candidateOrderLines = await loadFormalOrderLines();
      if (candidateOrderLines) {
        line = resolveLineFromRef(candidateOrderLines, candidateStatements, ref);
        statement = candidateStatements.find((item) => (item.lineIds ?? []).includes(line?.id));
      }
    }
    if (statement) {
      setSelectedStatementId(statement.id);
      setActivePage("statements");
      setToast(`已定位到对账 / 收款记录 ${statement.id}。`);
      return statement;
    }
    if (line) {
      focusOrderLineFromItems(ref, "待办", candidateOrderLines);
      setToast(`未找到 ${ref} 的对账记录，已定位到订单池明细。`);
      return null;
    }
    setActivePage("orders");
    setOrderFilters(defaultOrderFilters);
    setToast(`未找到 ${ref} 的对账记录或订单明细。`);
    return null;
  }

  function openOrderLineAction(action, orderLine) {
    if (!orderLine) {
      setToast("请先选择一条订单明细。");
      return;
    }
    const label = orderLineActions.get(action);
    if (!label) {
      setToast(`不支持的订单动作：${String(action ?? "").trim() || "未指定"}。`);
      return;
    }
    if (!guardUiAction("orders", label)) return;
    openOrderActionModal({ type: action, orderLineId: orderLine.id, orderLine });
  }

  async function recognize() {
    if (!guardUiAction("entry", "识别")) return null;
    const result = await recognizeOrderDraft();
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  async function recognizeQueue() {
    if (!guardUiAction("entry", "识别")) return null;
    const result = await recognizeOrderDraftQueue();
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  async function refreshDraftQueue(batchId) {
    const result = await refreshOrderDraftQueue(batchId);
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  function openQueueDraft(item) {
    const result = openQueuedOrderDraft(item);
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  function updateDraftField(id, field, value) {
    updateOrderDraftField(id, field, value);
  }

  async function uploadDraftArtwork(draftLine, file) {
    if (!draftLine?.id || !file) return null;
    setToast(`正在上传印刷稿件：${file.name || "未命名文件"}…`);
    const result = await uploadOfficeAttachmentFile(
      createPrintArtworkAttachmentInput({
        draftId: draftApiMeta.draftId,
        draftLine,
        operatorId: currentUserId,
        file,
        remark: "办公室订单草稿上传印刷定稿；稿件版本随草稿行绑定。",
      }),
      { authState },
    );
    if (result?.blocked || !result?.attachment?.attachmentId) {
      setToast(`印刷稿件上传失败：${result?.error?.message || "请稍后重试"}`);
      return result;
    }
    const artworkAttachment = {
      attachmentId: result.attachment.attachmentId,
      fileName: result.attachment.fileName || file.name,
      mimeType: result.attachment.mimeType || file.type || "application/octet-stream",
      fileSize: Number(result.attachment.fileSize ?? file.size ?? 0),
      status: result.attachment.status || "uploaded",
      version: 1,
    };
    updateOrderDraftField(draftLine.id, "artworkAttachment", artworkAttachment);
    updateOrderDraftField(draftLine.id, "artworkStatus", "已上传");
    setToast(`印刷稿件已上传：${artworkAttachment.fileName}。保存草稿后将绑定到当前明细。`);
    return result;
  }

  function handleDraftCommand(action) {
    const result = runOrderDraftCommand(action);
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  async function restoreCancelledDraftLine(draftLineId) {
    if (!guardUiAction("entry", "保存草稿")) return null;
    const result = await restoreShortageCancelledLine({
      draftLineId,
      reason: "客户确认恢复订购",
    });
    const normalized = normalizeFormalWriteResult(result, "恢复缺货取消明细");
    if (normalized?.feedback) setToast(normalized.feedback);
    return normalized;
  }

  async function linkCancellationIntentToSelectedLine(intentId) {
    if (!guardUiAction("entry", "保存草稿")) return null;
    const result = await linkCrossDraftShortageCancellation({
      intentId,
      reason: "办公室核对来源消息后关联到当前草稿明细",
    });
    const normalized = normalizeFormalWriteResult(result, "关联跨草稿取消");
    if (normalized?.feedback) setToast(normalized.feedback);
    return normalized;
  }

  async function entryAction(label, payload) {
    if (!guardUiAction("entry", label)) return null;
    const rawResult = await executeOrderEntryAction(label, payload);
    const result = persistentEntryActions.has(label)
      ? normalizeFormalWriteResult(rawResult, `订单${label}`)
      : rawResult;
    if (result?.navigateTo && !result.blocked) setActivePage(result.navigateTo);
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  return {
    createOrderFromTopbar,
    entryAction,
    focusFulfillmentByRef,
    focusInventoryByRef,
    focusOrderDraft,
    focusOrderLine,
    focusStatementByRef,
    handleDraftCommand,
    linkCancellationIntentToSelectedLine,
    openOrderLineAction,
    openQueueDraft,
    recognize,
    recognizeQueue,
    refreshDraftQueue,
    restoreCancelledDraftLine,
    uploadDraftArtwork,
    updateDraftField,
  };
}

export function hasUnsavedOrderDraft({ draftRows = [], draftStatus = "", entryText = "" } = {}) {
  const hasContent = draftRows.length > 0 || String(entryText).trim().length > 0;
  if (!hasContent) return false;
  return !["已保存草稿", "已确认", "已生成正式订单", "已生成多个正式订单", "已作废", "空草稿"].includes(String(draftStatus).trim());
}

function findInventoryFromTodoSummary(todo, inventoryRecords) {
  const text = `${todo?.summary ?? ""} ${todo?.ref ?? todo?.refId ?? ""}`.toLowerCase();
  if (!text.trim()) return null;
  return inventoryRecords.find((item) => {
    const size = String(item.size ?? "").toLowerCase();
    const color = String(item.color ?? "").replace(/色$/u, "").toLowerCase();
    return size && text.includes(size) && (!color || text.includes(color));
  }) ?? null;
}
