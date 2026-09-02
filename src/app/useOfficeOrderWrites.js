import { useCallback } from "react";
import {
  confirmOfficeDraftViaApi,
  confirmOfficeDraftSplit,
  listOfficeDraftQueue,
  linkOfficeDraftShortageCancellation,
  previewOfficeDraftSplit,
  recognizeOfficeDraft,
  recognizeOfficeDraftQueue,
  restoreOfficeDraftShortageCancellation,
  saveOfficeDraft,
} from "../services/officeOrderLazyApi.js";
import { resolveOfficeOrderConfirmationStrategy } from "../services/officeOrderSelectors.js";
import {
  adjustOfficeOrderLineQuantity,
  voidOfficeOrderLine,
} from "../services/officeOrderPoolLazyApi.js";
import {
  confirmOfficeDraftOrder,
  createDraftSaveTodo,
  createOfficeTodo,
} from "../services/officeMockService.js";
import { isOfficeApiServerRequired } from "../services/officeAuthService.js";
import {
  deleteDraftRow,
  mergeDraftRowWithNext,
  splitDraftRow,
  updateDraftRowsField,
} from "../state/officeDraftActions.js";
import { applyDraftInventoryReservations } from "../state/officeOrderActions.js";

const defaultApi = {
  adjustOfficeOrderLineQuantity,
  confirmOfficeDraftViaApi,
  confirmOfficeDraftSplit,
  listOfficeDraftQueue,
  linkOfficeDraftShortageCancellation,
  previewOfficeDraftSplit,
  recognizeOfficeDraft,
  recognizeOfficeDraftQueue,
  resolveOfficeOrderConfirmationStrategy,
  restoreOfficeDraftShortageCancellation,
  saveOfficeDraft,
  voidOfficeOrderLine,
};

function withFeedback(result, feedback, extra = {}) {
  return { ...(result ?? {}), ...extra, feedback };
}

function formatBlockedFeedback(prefix, result) {
  return result?.error?.requiredPermission
    ? `${prefix}：缺少权限 ${result.error.requiredPermission}。`
    : `${prefix}：${result?.error?.message ?? "未知错误"}`;
}

function normalizeWriteResultForRuntime(result, { label, serverRequired }) {
  const safeResult = result ?? {};
  if (!serverRequired() || safeResult.source === "api") return safeResult;
  return {
    ...safeResult,
    blocked: true,
    upstreamSource: safeResult.source,
    source: "api_error",
    error: {
      code: safeResult.error?.code ?? "ORDER_WRITE_SERVER_REQUIRED",
      message: safeResult.error?.message ?? `生产模式要求通过后端完成${label}。`,
    },
  };
}

function updateOrderLineQuantityProjection(orderLines, orderLineId, newQty, finalAmount) {
  return orderLines.map((line) => {
    if (line.id !== orderLineId) return line;
    const previousQty = Number(line.qty || line.originalQty || 0);
    const nextQty = Number(newQty || 0);
    const apiAmount = Number(finalAmount);
    const nextAmount = Number.isFinite(apiAmount)
      ? apiAmount
      : previousQty > 0
        ? Number(((Number(line.amount || 0) / previousQty) * nextQty).toFixed(2))
        : line.amount;
    return { ...line, qty: nextQty, originalQty: nextQty, amount: nextAmount };
  });
}

function uniqueText(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

export function createOfficeOrderWriteActions({
  api = {},
  authState,
  currentUserId,
  customers,
  draftApiMeta,
  draftRows,
  entryText,
  fulfillments,
  inventoryRecords,
  orderLines,
  selectedDraftId,
  createSplitId = () => `DRAFT-SPLIT-${Date.now().toString(36)}`,
  refreshFulfillments,
  refreshInventoryRecords,
  refreshOrderPool,
  refreshTodos,
  serverRequired = isOfficeApiServerRequired,
  setDraftApiMeta,
  setDraftRows,
  setDraftStatus,
  setEntryText,
  setFulfillments,
  setInventoryRecords,
  setOrderLines,
  setSelectedDraftId,
  setSelectedOrderId,
  setSelectedTodoId,
  setStatements,
  setTodos,
}) {
  const orderApi = { ...defaultApi, ...api };

  function addTodo(input) {
    const todo = createOfficeTodo(input);
    setTodos((current) => [todo, ...current]);
    setSelectedTodoId(todo.id);
    return todo;
  }

  function addTodos(inputs) {
    const nextTodos = inputs.map((input) => createOfficeTodo(input));
    if (!nextTodos.length) return [];
    setTodos((current) => [...nextTodos, ...current]);
    setSelectedTodoId(nextTodos[0].id);
    return nextTodos;
  }

  function rememberDraftApiMeta(result) {
    setDraftApiMeta((current) => ({
      draftId: result.draft?.draftId ?? result.draftId ?? current.draftId,
      clientRevision: Number(result.draft?.clientRevision ?? current.clientRevision ?? 0),
      source: result.source ?? current.source,
    }));
  }

  async function recognizeOrderDraft() {
    setDraftStatus("识别中");
    const result = await orderApi.recognizeOfficeDraft({
      authState,
      customers,
      inventories: inventoryRecords,
      operatorId: currentUserId,
      sourceText: entryText,
    });
    if (result.blocked) {
      setDraftStatus("识别失败");
      return withFeedback(result, formatBlockedFeedback("后端拒绝识别", result));
    }

    const rows = result.rows ?? [];
    setDraftRows(rows);
    setDraftStatus(rows.length ? "已识别待确认" : "空草稿");
    setSelectedDraftId(rows[0]?.id ?? "");
    setDraftApiMeta({
      draftId: result.draft?.draftId ?? "",
      clientRevision: Number(result.draft?.clientRevision ?? 0),
      source: result.source,
    });
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    const recognitionSummary = result.recognition?.summary;
    const nonOrderSummary = recognitionSummary
      ? `；另识别库存询问 ${recognitionSummary.inventoryInquiryCount} 条、临时留货 ${recognitionSummary.temporaryHoldCount} 条、疑似重复 ${recognitionSummary.duplicateCandidateCount} 条`
      : "";
    return withFeedback(
      result,
      `已通过${sourceLabel} 识别 ${rows.length} 行明细${nonOrderSummary}；非订单意图不会占用库存，保存正式订单前会重新校验。`,
    );
  }

  async function recognizeOrderDraftQueue() {
    const result = await orderApi.recognizeOfficeDraftQueue({
      authState,
      customerId: draftRows.find((row) => row.customerId)?.customerId ?? "",
      inventories: inventoryRecords,
      operatorId: currentUserId,
      sourceText: entryText,
    });
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝批量识别入队", result));
    return withFeedback(
      result,
      `已生成 ${result.queueBatch?.summary?.queueItemCount ?? result.drafts?.length ?? 0} 个独立队列项：订单草稿 ${result.queueBatch?.summary?.orderDraftCount ?? 0} 张，库存/复核上下文 ${result.queueBatch?.summary?.intentDraftCount ?? 0} 项。`,
    );
  }

  async function refreshOrderDraftQueue(queueBatchId = "") {
    const result = await orderApi.listOfficeDraftQueue({
      authState,
      inventories: inventoryRecords,
      operatorId: currentUserId,
      queueBatchId,
    });
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝读取草稿队列", result));
    return withFeedback(result, `草稿队列已刷新，共 ${result.total ?? result.items?.length ?? 0} 项。`);
  }

  function openQueuedOrderDraft(item) {
    if (!item?.draft || item.kind !== "order_draft") {
      return withFeedback({ blocked: true }, "库存询问、留货和重复候选保留在队列中处理，不能作为订单明细打开。");
    }
    const rows = item.rows ?? [];
    setEntryText(item.draft.sourceText ?? "");
    setDraftRows(rows);
    setSelectedDraftId(rows[0]?.id ?? "");
    setDraftStatus(item.draft.status ?? "待审核");
    setDraftApiMeta({
      draftId: item.draft.draftId ?? item.draft.id ?? "",
      clientRevision: Number(item.draft.clientRevision ?? item.draft.revision ?? 0),
      source: "api",
    });
    return withFeedback({ source: "api", draft: item.draft, rows }, `已打开独立订单草稿 ${item.draft.draftId ?? item.draft.id}。`);
  }

  async function prepareOrderDraftFromTemporaryHold({ intent, hold, candidate }) {
    const holdId = String(hold?.reservationId ?? hold?.id ?? "").trim();
    const intentId = String(intent?.intentId ?? intent?.id ?? hold?.sourceIntentId ?? "").trim();
    if (!holdId || !intentId || !candidate) {
      return withFeedback({ blocked: true }, "临时留货缺少来源意图或规格，无法转入订单录入。");
    }
    const sourceText = [
      "我要",
      candidate.product || candidate.productName || "空白袋",
      candidate.size,
      candidate.color || candidate.bagColor,
      candidate.handle || candidate.handleType,
      `${hold.reservedQty ?? candidate.qty ?? 0}个`,
    ].filter(Boolean).join(" ");
    setDraftStatus("识别中");
    const result = await orderApi.recognizeOfficeDraft({
      authState,
      customers,
      inventories: inventoryRecords,
      operatorId: currentUserId,
      sourceText,
    });
    if (result.blocked || !result.rows?.length) {
      setDraftStatus("识别失败");
      return withFeedback(result, formatBlockedFeedback("后端拒绝创建留货订单草稿", result));
    }
    const rows = result.rows.map((row, index) => index === 0 ? {
      ...row,
      customerId: intent.customerId || row.customerId,
      qty: Number(hold.reservedQty ?? candidate.qty ?? row.qty ?? 0),
      sourceHoldId: holdId,
      sourceIntentId: intentId,
      note: uniqueText([row.note, `由临时留货 ${holdId} 转入`, intent.sourceText]).join("；"),
    } : row);
    setEntryText(sourceText);
    setDraftRows(rows);
    setSelectedDraftId(rows[0].id);
    setDraftStatus("已识别待确认");
    setDraftApiMeta({
      draftId: result.draft?.draftId ?? "",
      clientRevision: Number(result.draft?.clientRevision ?? 0),
      source: result.source,
    });
    return withFeedback(result, `临时留货 ${holdId} 已转入订单草稿；确认订单后将原位转换占用，不会重复扣库存。`);
  }

  function updateOrderDraftField(id, field, value) {
    setDraftStatus("已调整待确认");
    setDraftRows((current) => updateDraftRowsField(current, {
      id,
      field,
      value,
      customers,
      inventoryRecords,
    }));
  }

  function updateOrderEntryText(nextValue) {
    const nextText = String(nextValue ?? "");
    if (nextText === entryText) return { changed: false };
    setEntryText(nextText);
    setDraftStatus("原文已修改待重新识别");
    return { changed: true };
  }

  async function restoreShortageCancelledLine({ draftLineId, reason }) {
    if (!draftApiMeta.draftId || Number(draftApiMeta.clientRevision ?? 0) < 1) {
      return withFeedback({ blocked: true }, "当前取消明细尚未保存到后端，请先保存草稿后再恢复订购。");
    }
    setDraftStatus("恢复订购中");
    const result = normalizeWriteResultForRuntime(
      await orderApi.restoreOfficeDraftShortageCancellation({
        authState,
        draftId: draftApiMeta.draftId,
        draftLineId,
        clientRevision: draftApiMeta.clientRevision,
        operatorId: currentUserId,
        reason,
      }),
      { label: "恢复缺货取消明细", serverRequired },
    );
    if (result.blocked || !result.line) {
      setDraftStatus("恢复订购失败");
      return withFeedback(result, formatBlockedFeedback("后端拒绝恢复订购", result));
    }
    setDraftRows((current) => current.map((row) => row.id === draftLineId ? { ...row, ...result.line } : row));
    rememberDraftApiMeta(result);
    setDraftStatus("已恢复待确认");
    return withFeedback(result, "该明细已恢复为待确认订购；取消来源和恢复操作已留痕，正式确认前仍会重新校验库存与价格。");
  }

  async function linkCrossDraftShortageCancellation({ intentId, reason }) {
    const targetLine = draftRows.find((row) => row.id === selectedDraftId);
    if (!targetLine) return withFeedback({ blocked: true }, "请先打开目标订单草稿并选择要取消的具体明细。");
    if (targetLine.excludedFromConfirmation === true || targetLine.cancellationStatus === "库存不足取消") {
      return withFeedback({ blocked: true }, "当前明细已经取消，不能重复关联跨草稿取消消息。");
    }
    if (!draftApiMeta.draftId || Number(draftApiMeta.clientRevision ?? 0) < 1) {
      return withFeedback({ blocked: true }, "目标草稿尚未保存到后端，请先保存草稿后再关联取消消息。");
    }
    setDraftStatus("关联取消中");
    const result = normalizeWriteResultForRuntime(
      await orderApi.linkOfficeDraftShortageCancellation({
        authState,
        draftId: draftApiMeta.draftId,
        draftLineId: targetLine.id,
        intentId,
        clientRevision: draftApiMeta.clientRevision,
        operatorId: currentUserId,
        reason,
      }),
      { label: "关联跨草稿取消", serverRequired },
    );
    if (result.blocked || !result.line) {
      setDraftStatus("关联取消失败");
      return withFeedback(result, formatBlockedFeedback("后端拒绝关联跨草稿取消", result));
    }
    setDraftRows((current) => current.map((row) => row.id === targetLine.id ? { ...row, ...result.line } : row));
    rememberDraftApiMeta(result);
    setDraftStatus("已关联取消待确认");
    return withFeedback(result, "取消消息已关联到当前草稿明细；来源上下文和操作记录已保留，该行不会生成正式订单。");
  }

  function runOrderDraftCommand(action) {
    const selectedIndex = draftRows.findIndex((row) => row.id === selectedDraftId);
    if (selectedIndex < 0) return withFeedback(null, "请先选择一行识别明细。");

    let result = null;
    if (action === "删除当前行") {
      result = deleteDraftRow(draftRows, selectedDraftId);
    } else if (action === "拆分当前行") {
      result = splitDraftRow(draftRows, selectedDraftId, inventoryRecords, createSplitId());
    } else if (action === "合并下一行") {
      result = mergeDraftRowWithNext(draftRows, selectedDraftId, inventoryRecords);
    }
    if (!result) return null;
    if (result.blocked) return withFeedback(result, result.toast);

    setDraftRows(result.rows);
    setSelectedDraftId(result.selectedId);
    setDraftStatus(result.status);
    return withFeedback(result, result.toast);
  }

  async function executeOrderEntryAction(label, payload = {}) {
    if (label === "拆分订单") {
      setDraftStatus("拆单预览中");
      let splitDraftId = draftApiMeta.draftId;
      let splitDraftRevision = Number(draftApiMeta.clientRevision ?? 0);
      if (!splitDraftId || splitDraftRevision < 1) {
        const recognition = await orderApi.recognizeOfficeDraft({
          authState,
          customers,
          inventories: inventoryRecords,
          operatorId: currentUserId,
          sourceText: entryText,
        });
        if (recognition.blocked || !recognition.draft?.draftId) {
          setDraftStatus("拆单预览失败");
          return withFeedback(recognition, formatBlockedFeedback("后端拒绝建立拆单草稿", recognition));
        }
        splitDraftId = recognition.draft.draftId;
        splitDraftRevision = Number(recognition.draft.clientRevision ?? 0);
        const saved = await orderApi.saveOfficeDraft({
          authState,
          draftRows,
          draftId: splitDraftId,
          clientRevision: splitDraftRevision,
          operatorId: currentUserId,
          sourceText: entryText,
          draftStatus: "待审核",
          saveReason: "office_entry_split_preview_prepare",
        });
        if (saved.blocked) {
          setDraftStatus("拆单预览失败");
          return withFeedback(saved, formatBlockedFeedback("后端拒绝保存拆单草稿", saved));
        }
        splitDraftRevision = Number(saved.draft?.clientRevision ?? splitDraftRevision);
        setDraftApiMeta({ draftId: splitDraftId, clientRevision: splitDraftRevision, source: "api" });
      }
      const result = await orderApi.previewOfficeDraftSplit({
        authState,
        draftRows,
        draftId: splitDraftId,
        clientRevision: splitDraftRevision,
        operatorId: currentUserId,
        sourceText: entryText,
      });
      if (result.blocked) {
        setDraftStatus("拆单预览失败");
        return withFeedback(result, formatBlockedFeedback("后端拒绝生成拆单预览", result));
      }
      setDraftStatus("拆单预览待确认");
      return withFeedback(result, `已生成 ${result.splitPlan?.groups?.length ?? 0} 个客户/交付组，请核对后确认拆单。`);
    }
    if (label === "确认拆单") {
      setDraftStatus("拆单确认中");
      const apiResult = await orderApi.confirmOfficeDraftSplit({
        authState,
        draftRows,
        draftId: draftApiMeta.draftId,
        clientRevision: draftApiMeta.clientRevision,
        operatorId: currentUserId,
        sourceText: entryText,
        splitPlanHash: payload.splitPlanHash,
      });
      const confirmationStrategy = orderApi.resolveOfficeOrderConfirmationStrategy(apiResult, {
        serverRequired: true,
      });
      if (confirmationStrategy.kind === "blocked") {
        setDraftStatus("拆单确认失败");
        return withFeedback(apiResult, formatBlockedFeedback("后端拒绝确认拆单", {
          ...apiResult,
          error: confirmationStrategy.error,
        }));
      }
      rememberDraftApiMeta(apiResult);
      setDraftStatus("已生成多个正式订单");
      const projectionResults = await Promise.all([
        refreshOrderPool({ showToast: false }),
        refreshInventoryRecords({ showToast: false }),
        refreshFulfillments({ showToast: false }),
        refreshTodos({ showToast: false }),
      ]);
      const refreshFailed = projectionResults.some((result) => result?.blocked || result?.source !== "api");
      return withFeedback(
        apiResult,
        refreshFailed
          ? `已生成 ${confirmationStrategy.confirmation.orderIds?.length ?? 0} 个正式订单；部分投影刷新失败，请刷新页面。`
          : `已按预览生成 ${confirmationStrategy.confirmation.orderIds?.length ?? 0} 个正式订单，库存、交付和待办已刷新。`,
        { navigateTo: "orders" },
      );
    }
    if (label === "作废草稿") {
      setDraftStatus("作废中");
      const apiResult = normalizeWriteResultForRuntime(
        await orderApi.saveOfficeDraft({
          authState,
          draftRows,
          draftId: draftApiMeta.draftId,
          clientRevision: draftApiMeta.clientRevision,
          operatorId: currentUserId,
          sourceText: entryText,
          draftStatus: "已作废",
          saveReason: "office_entry_void_draft",
        }),
        { label: "订单草稿作废", serverRequired },
      );
      if (apiResult.blocked) {
        setDraftStatus("作废失败");
        return withFeedback(apiResult, formatBlockedFeedback("后端拒绝作废草稿", apiResult));
      }
      rememberDraftApiMeta(apiResult);
      setDraftStatus("已作废");
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      return withFeedback(apiResult, `草稿已通过${sourceLabel}作废；未生成正式订单，也未占用库存。`);
    }

    if (label === "保存草稿") {
      if (!draftRows.length) {
        setDraftStatus("空草稿");
        return withFeedback(null, "草稿为空，无法保存。");
      }
      setDraftStatus("保存中");
      const apiResult = normalizeWriteResultForRuntime(
        await orderApi.saveOfficeDraft({
          authState,
          draftRows,
          draftId: draftApiMeta.draftId,
          clientRevision: draftApiMeta.clientRevision,
          operatorId: currentUserId,
          sourceText: entryText,
        }),
        { label: "订单草稿保存", serverRequired },
      );
      if (apiResult.blocked) {
        setDraftStatus("保存失败");
        return withFeedback(apiResult, formatBlockedFeedback("后端拒绝保存草稿", apiResult));
      }
      rememberDraftApiMeta(apiResult);
      if (apiResult.source === "api" && apiResult.todos?.length) {
        addTodos(apiResult.todos);
      } else {
        const todo = createDraftSaveTodo(draftRows);
        setTodos((current) => [todo, ...current]);
        setSelectedTodoId(todo.id);
      }
      setDraftStatus("已保存草稿");
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      return withFeedback(apiResult, `草稿已通过${sourceLabel}保存并进入公共待办池，未占用库存。`);
    }

    if (label !== "保存并确认") {
      return withFeedback(
        {
          source: "ui_error",
          blocked: true,
          error: { code: "ORDER_ENTRY_ACTION_UNSUPPORTED" },
        },
        "未识别订单草稿操作，未执行。",
      );
    }
    if (!draftRows.length) {
      setDraftStatus("空草稿");
      return withFeedback(null, "没有可保存的识别明细，请先输入订单并点击识别。");
    }

    setDraftStatus("确认中");
    const apiResult = await orderApi.confirmOfficeDraftViaApi({
      authState,
      draftRows,
      draftId: draftApiMeta.draftId,
      clientRevision: draftApiMeta.clientRevision,
      operatorId: currentUserId,
      sourceText: entryText,
    });
    const confirmationStrategy = orderApi.resolveOfficeOrderConfirmationStrategy(apiResult, {
      serverRequired: serverRequired(),
    });
    if (confirmationStrategy.kind === "blocked") {
      setDraftStatus("确认失败");
      return withFeedback(apiResult, formatBlockedFeedback("后端拒绝确认订单", {
        ...apiResult,
        error: confirmationStrategy.error,
      }));
    }

    if (confirmationStrategy.kind === "server") {
      rememberDraftApiMeta(apiResult);
      if (confirmationStrategy.confirmation?.closedWithoutOrder === true) {
        setDraftStatus("库存不足取消");
        const projectionResults = await Promise.all([
          refreshInventoryRecords({ showToast: false }),
          refreshTodos({ showToast: false }),
        ]);
        const refreshFailed = projectionResults.some((result) => result?.blocked || result?.source !== "api");
        return withFeedback(
          apiResult,
          refreshFailed
            ? "草稿全部明细已按库存不足取消，未生成正式订单；库存意图或待办刷新失败，请刷新页面后重试。"
            : "草稿全部明细已按库存不足取消，已保留原文证据，未生成正式订单、库存占用或交付任务。",
        );
      }
      const confirmedOrderLineId = confirmationStrategy.confirmation?.orderLines?.[0]?.id ?? "";
      if (confirmedOrderLineId) setSelectedOrderId(confirmedOrderLineId);
      setDraftStatus("已确认");
      const projectionResults = await Promise.all([
        refreshOrderPool({ showToast: false }),
        refreshInventoryRecords({ showToast: false }),
        refreshFulfillments({ showToast: false }),
        refreshTodos({ showToast: false }),
      ]);
      const refreshFailed = projectionResults.some((result) => result?.blocked || result?.source !== "api");
      return withFeedback(
        apiResult,
        refreshFailed
          ? "订单已由后端确认；订单、库存、交付或待办投影刷新失败，请刷新页面后重试。"
          : "订单已由后端确认，订单、库存、交付和待办投影已刷新。",
        { navigateTo: "orders" },
      );
    }

    const result = confirmOfficeDraftOrder({ draftRows, inventoryRecords, orderLines, fulfillments, customers });
    setDraftRows(result.checkedRows);
    if (result.blocked) {
      setDraftStatus(result.draftStatus);
      setSelectedDraftId(result.selectedDraftId);
      return withFeedback(result, result.toast);
    }
    setOrderLines((current) => [...result.newLines, ...current]);
    setFulfillments((current) => [...result.newFulfillments, ...current]);
    setInventoryRecords((current) => applyDraftInventoryReservations(current, result.checkedRows));
    result.shortageTodoInputs.forEach(addTodo);
    setSelectedOrderId(result.selectedOrderId);
    setDraftStatus(result.draftStatus);
    return withFeedback(result, `已通过本地规则降级确认；${result.toast}`, { navigateTo: "orders" });
  }

  function applyOrderLineQuantityResult(apiResult) {
    setOrderLines((current) => updateOrderLineQuantityProjection(
      current,
      apiResult.orderLineId,
      apiResult.newQty,
      apiResult.finalAmount,
    ));
    setFulfillments((current) => current.map((item) =>
      item.lineId === apiResult.orderLineId || item.orderLineId === apiResult.orderLineId
        ? { ...item, qty: Number(apiResult.newQty) }
        : item,
    ));
    if (Array.isArray(apiResult.adjustedStatements) && apiResult.adjustedStatements.length) {
      setStatements((current) => current.map((statement) => {
        const updated = apiResult.adjustedStatements.find(
          (item) => item.statementId === statement.id || item.id === statement.id,
        );
        return updated
          ? {
              ...statement,
              status: updated.status || statement.status,
              receivable: Number(updated.receivable ?? statement.receivable),
              received: Number(updated.received ?? statement.received),
              variance: Number(updated.variance ?? statement.variance),
            }
          : statement;
      }));
    }
  }

  function applyOrderLineVoidResult(apiResult) {
    setOrderLines((current) => current.map((item) =>
      item.id === apiResult.orderLineId
        ? {
            ...item,
            status: "已关闭",
            lineStatus: "已关闭",
            exceptions: uniqueText([...(item.exceptions ?? []), "订单已作废"]),
            exceptionTags: uniqueText([...(item.exceptionTags ?? item.exceptions ?? []), "订单已作废"]),
            inventory: item.inventory || "已释放",
          }
        : item,
    ));
    setFulfillments((current) => current.map((item) =>
      item.lineId === apiResult.orderLineId
        || item.orderLineId === apiResult.orderLineId
        || (apiResult.canceledFulfillmentIds ?? []).includes(item.id)
        ? { ...item, status: "已取消" }
        : item,
    ));
  }

  async function executeOrderLineAction({ action, orderLine, payload }) {
    if (!orderLine) return withFeedback(null, "未找到对应订单明细，无法提交动作。");
    if (action !== "quantity" && action !== "void") {
      return withFeedback(
        { blocked: true, source: "ui_error", error: { code: "ORDER_LINE_ACTION_UNSUPPORTED" } },
        `不支持的正式订单动作：${String(action ?? "").trim() || "未指定"}。`,
      );
    }
    const actionPayload = payload ?? {};
    if (action === "quantity") {
      const apiResult = normalizeWriteResultForRuntime(
        await orderApi.adjustOfficeOrderLineQuantity({
          authState,
          orderLine,
          newQty: actionPayload.newQty,
          reason: actionPayload.reason,
          operatorId: currentUserId,
        }),
        { label: "订单改量", serverRequired },
      );
      if (apiResult.blocked) {
        return withFeedback(apiResult, formatBlockedFeedback("后端拒绝订单改量", apiResult));
      }
      applyOrderLineQuantityResult(apiResult);
      if (apiResult.source === "api") void refreshOrderPool({ showToast: false });
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      return withFeedback(
        apiResult,
        `已通过${sourceLabel}把 ${apiResult.orderLineId} 数量从 ${apiResult.previousQty} 调整为 ${apiResult.newQty}，金额和相关出库数量同步刷新。`,
        { closeModal: true },
      );
    }

    const apiResult = normalizeWriteResultForRuntime(
      await orderApi.voidOfficeOrderLine({
        authState,
        orderLine,
        reason: actionPayload.reason,
        operatorId: currentUserId,
      }),
      { label: "订单作废", serverRequired },
    );
    if (apiResult.blocked) {
      return withFeedback(apiResult, formatBlockedFeedback("后端拒绝作废订单", apiResult));
    }
    applyOrderLineVoidResult(apiResult);
    if (apiResult.source === "api") void refreshOrderPool({ showToast: false });
    const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(
      apiResult,
      `已通过${sourceLabel}作废 ${apiResult.orderLineId}，未交付出库任务已取消，库存占用按后端结果释放。`,
      { closeModal: true },
    );
  }

  return {
    executeOrderEntryAction,
    executeOrderLineAction,
    openQueuedOrderDraft,
    recognizeOrderDraftQueue,
    recognizeOrderDraft,
    refreshOrderDraftQueue,
    prepareOrderDraftFromTemporaryHold,
    linkCrossDraftShortageCancellation,
    restoreShortageCancelledLine,
    runOrderDraftCommand,
    updateOrderEntryText,
    updateOrderDraftField,
  };
}

export function useOfficeOrderWrites(options) {
  const actions = createOfficeOrderWriteActions(options);
  const dependencies = [
    options.authState,
    options.currentUserId,
    options.customers,
    options.draftApiMeta,
    options.draftRows,
    options.entryText,
    options.fulfillments,
    options.inventoryRecords,
    options.orderLines,
    options.selectedDraftId,
    options.serverRequired,
  ];
  return {
    executeOrderEntryAction: useCallback(actions.executeOrderEntryAction, dependencies),
    executeOrderLineAction: useCallback(actions.executeOrderLineAction, dependencies),
    openQueuedOrderDraft: useCallback(actions.openQueuedOrderDraft, dependencies),
    recognizeOrderDraftQueue: useCallback(actions.recognizeOrderDraftQueue, dependencies),
    recognizeOrderDraft: useCallback(actions.recognizeOrderDraft, dependencies),
    refreshOrderDraftQueue: useCallback(actions.refreshOrderDraftQueue, dependencies),
    prepareOrderDraftFromTemporaryHold: useCallback(actions.prepareOrderDraftFromTemporaryHold, dependencies),
    linkCrossDraftShortageCancellation: useCallback(actions.linkCrossDraftShortageCancellation, dependencies),
    restoreShortageCancelledLine: useCallback(actions.restoreShortageCancelledLine, dependencies),
    runOrderDraftCommand: useCallback(actions.runOrderDraftCommand, dependencies),
    updateOrderEntryText: useCallback(actions.updateOrderEntryText, dependencies),
    updateOrderDraftField: useCallback(actions.updateOrderDraftField, dependencies),
  };
}
