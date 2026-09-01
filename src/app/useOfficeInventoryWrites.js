import { useCallback } from "react";
import {
  confirmOfficeInventoryCorrectionDraft,
  createOfficeTemporaryInventoryHold,
  createOfficeInventoryCorrectionDraft,
  linkOfficeInventoryCorrectionAttachments,
  releaseOfficeTemporaryInventoryHold,
  extendOfficeTemporaryInventoryHold,
} from "../services/officeInventoryLazyApi.js";
import {
  createInventoryCorrectionEvidenceAttachmentInput,
  createOfficeAttachment,
} from "../services/officeAttachmentApiClient.js";
import { isOfficeApiServerRequired } from "../services/officeAuthService.js";
import { readAttachmentFileAsDataUrl } from "../features/attachments/readAttachmentFile.js";

const defaultApi = {
  confirmOfficeInventoryCorrectionDraft,
  createOfficeTemporaryInventoryHold,
  createOfficeInventoryCorrectionDraft,
  createInventoryCorrectionEvidenceAttachmentInput,
  createOfficeAttachment,
  linkOfficeInventoryCorrectionAttachments,
  releaseOfficeTemporaryInventoryHold,
  extendOfficeTemporaryInventoryHold,
  readAttachmentFileAsDataUrl,
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
      code: safeResult.error?.code ?? "INVENTORY_WRITE_SERVER_REQUIRED",
      message: safeResult.error?.message ?? `生产模式要求通过后端完成${label}。`,
    },
  };
}

function hasProjectionRefreshFailure(results) {
  return results.some((result) => !result || result.blocked || result.source !== "api");
}

export function createOfficeInventoryWriteActions({
  api = {},
  authState,
  currentUserDisplayName,
  currentUserId,
  inventoryCorrectionDraftsRef,
  loadInventoryCorrectionDetail,
  refreshInventoryCorrectionQueue,
  refreshInventoryLedgerEntries,
  refreshInventoryIntents,
  refreshInventoryRecords,
  refreshTodos,
  selectedStockIdRef,
  serverRequired = isOfficeApiServerRequired,
  setInventoryCorrectionDrafts,
  setInventoryCorrectionQueueState,
  setInventoryIntentState,
  setSelectedStockId,
}) {
  const inventoryApi = { ...defaultApi, ...api };

  async function createInventoryCorrectionDraft({ stock, actualQty, reason }) {
    const apiResult = normalizeWriteResultForRuntime(
      await inventoryApi.createOfficeInventoryCorrectionDraft({
        authState,
        stock,
        expectedQty: stock?.inStock,
        actualQty,
        reason,
        operatorId: currentUserId,
        remark: `${currentUserDisplayName} 在库存查询页发起：${reason}`,
      }),
      { label: "库存修正草稿创建", serverRequired },
    );
    if (apiResult.blocked || !apiResult.draft?.id) {
      return withFeedback(
        { ...apiResult, blocked: true },
        formatBlockedFeedback("后端拒绝生成库存修正草稿", apiResult),
      );
    }

    const nextDrafts = [
      apiResult.draft,
      ...inventoryCorrectionDraftsRef.current.filter(
        (item) => item.id !== apiResult.draft.id && item.correctionDraftId !== apiResult.draft.id,
      ),
    ];
    inventoryCorrectionDraftsRef.current = nextDrafts;
    setInventoryCorrectionDrafts(nextDrafts);
    setInventoryCorrectionQueueState((current) => ({
      ...current,
      items: nextDrafts.filter((item) => item.status === "待确认生效"),
      total: nextDrafts.filter((item) => item.status === "待确认生效").length,
      source: apiResult.source === "api" ? current.source : "local_fallback",
    }));

    const projectionResults = await Promise.all([
      refreshInventoryCorrectionQueue({ showToast: false }),
      refreshTodos({ showToast: false }),
    ]);
    const projectionRefreshFailed = apiResult.source === "api" && hasProjectionRefreshFailure(projectionResults);
    const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(
      apiResult,
      projectionRefreshFailed
        ? `库存修正草稿 ${apiResult.draft.id} 已通过后端 API生成，但确认队列或公共待办刷新失败，请手动刷新。`
        : `已通过${sourceLabel}生成库存修正草稿 ${apiResult.draft.id}，未修改库存总数，需有库存调整确认权限账号确认后生效。`,
      { draft: apiResult.draft, projectionRefreshFailed },
    );
  }

  async function confirmInventoryCorrectionDraft(draft) {
    const correctionDraftId = String(draft?.correctionDraftId ?? draft?.id ?? "").trim();
    if (!correctionDraftId) {
      return withFeedback(
        {
          source: "ui_error",
          blocked: true,
          confirmation: null,
          error: { code: "INVENTORY_CORRECTION_DRAFT_ID_REQUIRED", message: "缺少库存修正草稿 ID。" },
        },
        "缺少库存修正草稿 ID，无法确认。",
      );
    }

    setInventoryCorrectionQueueState((current) => ({ ...current, confirmingId: correctionDraftId, error: "" }));
    const result = normalizeWriteResultForRuntime(
      await inventoryApi.confirmOfficeInventoryCorrectionDraft({
        authState,
        operatorId: currentUserId,
        correctionDraftId,
        approvalReason: `${currentUserDisplayName} 在库存查询页确认库存修正生效`,
      }),
      { label: "库存修正确认", serverRequired },
    );
    if (result.blocked || !result.confirmation) {
      const feedback = formatBlockedFeedback("后端拒绝确认库存修正", result);
      setInventoryCorrectionQueueState((current) => ({
        ...current,
        confirmingId: "",
        error: feedback,
      }));
      return withFeedback({ ...result, blocked: true }, feedback);
    }

    const confirmation = result.confirmation;
    const targetStockId = confirmation.inventoryItemId || draft?.inventoryItemId || selectedStockIdRef.current;
    const nextDrafts = inventoryCorrectionDraftsRef.current.map((item) =>
      item.id === correctionDraftId || item.correctionDraftId === correctionDraftId
        ? { ...item, status: "已确认生效", confirmedBy: currentUserId, confirmedByName: currentUserDisplayName }
        : item,
    );
    inventoryCorrectionDraftsRef.current = nextDrafts;
    setInventoryCorrectionDrafts(nextDrafts);
    setInventoryCorrectionQueueState((current) => ({
      ...current,
      items: current.items.filter(
        (item) => item.id !== correctionDraftId && item.correctionDraftId !== correctionDraftId,
      ),
      total: Math.max(0, current.total - 1),
      confirmingId: "",
      error: "",
    }));
    if (targetStockId) {
      selectedStockIdRef.current = targetStockId;
      setSelectedStockId(targetStockId);
    }

    const projectionReads = [
      refreshInventoryRecords({ showToast: false }),
      refreshInventoryCorrectionQueue({ showToast: false }),
      refreshTodos({ showToast: false }),
      loadInventoryCorrectionDetail(correctionDraftId, confirmation.ledger),
    ];
    if (targetStockId) {
      projectionReads.push(refreshInventoryLedgerEntries({ stockId: targetStockId, showToast: false }));
    }
    const projectionResults = await Promise.all(projectionReads);
    const projectionRefreshFailed = hasProjectionRefreshFailure(projectionResults);
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(
      result,
      projectionRefreshFailed
        ? `库存修正 ${correctionDraftId} 已通过后端 API确认，但库存、流水、队列、详情或公共待办刷新失败，请手动刷新。`
        : `已通过${sourceLabel}确认库存修正 ${correctionDraftId}，库存数量、流水、修正确认队列和公共待办已同步。`,
      { confirmation, projectionRefreshFailed },
    );
  }

  async function linkInventoryCorrectionAttachment({ draft, file }) {
    const correctionDraftId = String(draft?.correctionDraftId ?? draft?.id ?? "").trim();
    if (!correctionDraftId || !file) {
      const feedback = !correctionDraftId ? "请先生成库存修正草稿。" : "请先选择库存修正凭证图片或 PDF。";
      return withFeedback(
        {
          source: "client_validation",
          blocked: true,
          error: {
            code: !correctionDraftId
              ? "INVENTORY_CORRECTION_DRAFT_ID_REQUIRED"
              : "INVENTORY_CORRECTION_ATTACHMENT_REQUIRED",
            message: feedback,
          },
        },
        feedback,
      );
    }

    let contentDataUrl;
    try {
      contentDataUrl = await inventoryApi.readAttachmentFileAsDataUrl(file);
    } catch (error) {
      return withFeedback(
        {
          source: "client_validation",
          blocked: true,
          error: { code: "INVENTORY_CORRECTION_ATTACHMENT_READ_FAILED", message: error?.message ?? String(error) },
        },
        `库存修正凭证读取失败：${error?.message ?? String(error)}`,
      );
    }

    const attachmentInput = inventoryApi.createInventoryCorrectionEvidenceAttachmentInput({
      correctionDraftId,
      operatorId: currentUserId,
      remark: `${currentUserDisplayName} 上传库存修正凭证`,
      file: {
        name: file.name,
        type: file.type,
        size: file.size,
        contentDataUrl,
      },
    });
    const uploadResult = normalizeWriteResultForRuntime(
      await inventoryApi.createOfficeAttachment({ authState, ...attachmentInput }),
      { label: "库存修正凭证上传", serverRequired },
    );
    const attachmentId = String(uploadResult.attachment?.attachmentId ?? "").trim();
    if (uploadResult.blocked || !attachmentId) {
      return withFeedback(
        { ...uploadResult, blocked: true },
        formatBlockedFeedback("库存修正草稿已保留，但凭证上传失败", uploadResult),
      );
    }

    const linkResult = normalizeWriteResultForRuntime(
      await inventoryApi.linkOfficeInventoryCorrectionAttachments({
        authState,
        operatorId: currentUserId,
        correctionDraftId,
        attachmentIds: [attachmentId],
        remark: `${currentUserDisplayName} 关联库存修正凭证`,
      }),
      { label: "库存修正凭证关联", serverRequired },
    );
    if (linkResult.blocked || !linkResult.linkage) {
      return withFeedback(
        { ...linkResult, blocked: true, attachment: uploadResult.attachment },
        formatBlockedFeedback("凭证已上传，但关联库存修正草稿失败，可对同一草稿重试", linkResult),
      );
    }

    const attachmentIds = linkResult.linkage.attachmentIds;
    const nextDrafts = inventoryCorrectionDraftsRef.current.map((item) =>
      item.id === correctionDraftId || item.correctionDraftId === correctionDraftId
        ? { ...item, attachmentIds, revision: linkResult.linkage.revision }
        : item,
    );
    inventoryCorrectionDraftsRef.current = nextDrafts;
    setInventoryCorrectionDrafts(nextDrafts);
    setInventoryCorrectionQueueState((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === correctionDraftId || item.correctionDraftId === correctionDraftId
          ? { ...item, attachmentIds, revision: linkResult.linkage.revision }
          : item,
      ),
    }));
    const refreshResults = await Promise.all([
      refreshInventoryCorrectionQueue({ showToast: false }),
      loadInventoryCorrectionDetail(correctionDraftId),
    ]);
    const projectionRefreshFailed = hasProjectionRefreshFailure(refreshResults);
    return withFeedback(
      linkResult,
      projectionRefreshFailed
        ? `凭证 ${attachmentId} 已关联库存修正 ${correctionDraftId}，但详情或队列刷新失败，请手动刷新。`
        : `凭证 ${attachmentId} 已上传并关联库存修正 ${correctionDraftId}，确认生效前仍不会修改库存。`,
      { attachment: uploadResult.attachment, attachmentIds, projectionRefreshFailed },
    );
  }

  async function createTemporaryInventoryHold({ intent, candidateIndex, inventoryItemId, qty, expiresAt, reason }) {
    const intentId = String(intent?.intentId ?? intent?.id ?? "").trim();
    setInventoryIntentState((current) => ({ ...current, mutatingId: intentId, error: "" }));
    const result = normalizeWriteResultForRuntime(
      await inventoryApi.createOfficeTemporaryInventoryHold({
        authState,
        operatorId: currentUserId,
        intentId,
        expectedRevision: intent?.revision,
        candidateIndex,
        inventoryItemId,
        qty,
        expiresAt,
        reason,
      }),
      { label: "临时留货创建", serverRequired },
    );
    return finalizeTemporaryHoldMutation(result, "临时留货已创建");
  }

  async function releaseTemporaryInventoryHold({ hold, reason }) {
    const holdId = String(hold?.reservationId ?? hold?.id ?? "").trim();
    const intent = hold?.intent;
    setInventoryIntentState((current) => ({ ...current, mutatingId: holdId, error: "" }));
    const result = normalizeWriteResultForRuntime(
      await inventoryApi.releaseOfficeTemporaryInventoryHold({
        authState,
        operatorId: currentUserId,
        holdId,
        expectedRevision: intent?.revision,
        reason,
      }),
      { label: "临时留货释放", serverRequired },
    );
    return finalizeTemporaryHoldMutation(result, "临时留货已释放");
  }

  async function extendTemporaryInventoryHold({ hold, expiresAt, reason }) {
    const holdId = String(hold?.reservationId ?? hold?.id ?? "").trim();
    const intent = hold?.intent;
    setInventoryIntentState((current) => ({ ...current, mutatingId: holdId, error: "" }));
    const result = normalizeWriteResultForRuntime(
      await inventoryApi.extendOfficeTemporaryInventoryHold({
        authState,
        operatorId: currentUserId,
        holdId,
        expectedRevision: intent?.revision,
        expiresAt,
        reason,
      }),
      { label: "临时留货延长", serverRequired },
    );
    return finalizeTemporaryHoldMutation(result, "临时留货到期时间已延长");
  }

  async function finalizeTemporaryHoldMutation(result, successMessage) {
    if (result.blocked || result.source !== "api") {
      const feedback = formatBlockedFeedback("后端拒绝库存留货操作", result);
      setInventoryIntentState((current) => ({ ...current, mutatingId: "", error: feedback }));
      return withFeedback({ ...result, blocked: true }, feedback);
    }
    const inventoryItemId = result.inventoryItem?.inventoryItemId ?? result.hold?.inventoryItemId;
    const refreshes = [refreshInventoryIntents({ showToast: false }), refreshInventoryRecords({ showToast: false })];
    if (inventoryItemId) refreshes.push(refreshInventoryLedgerEntries({ stockId: inventoryItemId, showToast: false }));
    const refreshResults = await Promise.all(refreshes);
    const projectionRefreshFailed = hasProjectionRefreshFailure(refreshResults);
    setInventoryIntentState((current) => ({ ...current, mutatingId: "" }));
    return withFeedback(
      result,
      projectionRefreshFailed ? `${successMessage}，但库存或意图队列刷新失败，请手动刷新。` : `${successMessage}，库存、流水和意图队列已同步。`,
      { projectionRefreshFailed },
    );
  }

  return {
    confirmInventoryCorrectionDraft,
    createInventoryCorrectionDraft,
    linkInventoryCorrectionAttachment,
    createTemporaryInventoryHold,
    releaseTemporaryInventoryHold,
    extendTemporaryInventoryHold,
  };
}

export function useOfficeInventoryWrites(options) {
  const actions = createOfficeInventoryWriteActions(options);
  const dependencies = [
    options.authState,
    options.currentUserDisplayName,
    options.currentUserId,
    options.inventoryCorrectionDraftsRef,
    options.selectedStockIdRef,
    options.serverRequired,
  ];
  return {
    confirmInventoryCorrectionDraft: useCallback(actions.confirmInventoryCorrectionDraft, dependencies),
    createInventoryCorrectionDraft: useCallback(actions.createInventoryCorrectionDraft, dependencies),
    linkInventoryCorrectionAttachment: useCallback(actions.linkInventoryCorrectionAttachment, dependencies),
    createTemporaryInventoryHold: useCallback(actions.createTemporaryInventoryHold, dependencies),
    releaseTemporaryInventoryHold: useCallback(actions.releaseTemporaryInventoryHold, dependencies),
    extendTemporaryInventoryHold: useCallback(actions.extendTemporaryInventoryHold, dependencies),
  };
}
