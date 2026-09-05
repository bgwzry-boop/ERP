import {
  listOfficeAttachmentAccessLogs as listOfficeAttachmentAccessLogsDefault,
  listOfficeAttachments as listOfficeAttachmentsDefault,
} from "../services/officeAttachmentLazyApi.js";
import {
  syncStatementCustomerConfirmationAttachments,
  syncStatementPaymentAttachments,
} from "../state/officeStatementActions.js";
import { downloadAttachmentPreview as downloadAttachmentPreviewDefault } from "./attachmentViewUtils.js";

const defaultApi = {
  listOfficeAttachmentAccessLogs: listOfficeAttachmentAccessLogsDefault,
  listOfficeAttachments: listOfficeAttachmentsDefault,
};

export function createOfficeAttachmentActions({
  allowLocalFallback,
  api = defaultApi,
  authState,
  currentUserId,
  customerConfirmationAttachmentSyncKeysRef,
  downloadAttachmentPreview = downloadAttachmentPreviewDefault,
  paymentAttachmentSyncKeysRef,
  setStatements,
  setToast,
  statements,
}) {
  const attachmentApi = { ...defaultApi, ...api };
  const apiOptions = { serverRequired: !allowLocalFallback };

  async function loadAttachmentAccessAudit(attachmentId) {
    const result = await attachmentApi.listOfficeAttachmentAccessLogs({
      authState,
      attachmentId,
      operatorId: currentUserId,
      limit: 6,
    }, apiOptions);

    if (result.blocked) {
      return {
        source: "api_error",
        status: result.error?.requiredPermission
          ? `后端拒绝访问记录：缺少权限 ${result.error.requiredPermission}`
          : `后端拒绝访问记录：${result.error?.message ?? "未知错误"}`,
        items: [],
        total: 0,
      };
    }

    if (result.source !== "api") {
      return {
        source: result.source,
        status: "访问记录暂不可用",
        items: [],
        total: 0,
      };
    }

    return {
      source: "api",
      status: result.items.length ? `最近 ${result.items.length} 条 / 共 ${result.total} 条` : "暂无访问记录",
      items: result.items,
      total: result.total,
    };
  }

  function downloadViewedAttachment(attachment) {
    if (!allowLocalFallback && attachment?.contentSource !== "api") {
      setToast("附件内容未经后端 API 读取，production 不下载本地预览内容。");
      return false;
    }
    const downloaded = downloadAttachmentPreview(attachment);
    const label = attachment?.viewerTitle?.replace("预览", "") || (attachment?.statementId ? "对账附件" : "附件");
    setToast(
      downloaded
        ? `已下载${label}：${attachment.fileName || attachment.attachmentId || label}。`
        : `当前${label}没有可下载的预览内容。`,
    );
    return downloaded;
  }

  async function syncStatementAttachments({
    statementId,
    purpose,
    syncKeysRef,
    selectLocalAttachments,
    syncProjection,
    isCancelled = () => false,
    force = false,
    cacheKey = "",
  }) {
    const safeStatementId = String(statementId ?? "").trim();
    if (!safeStatementId) return null;
    const syncKey = `${currentUserId}:${safeStatementId}:${purpose}:${String(cacheKey ?? "")}`;
    if (force) syncKeysRef.current.delete(syncKey);
    if (syncKeysRef.current.has(syncKey)) return { skipped: true, reason: "already_synced" };
    syncKeysRef.current.add(syncKey);
    const currentStatement = statements.find((item) => item.id === safeStatementId);
    const result = await attachmentApi.listOfficeAttachments({
      authState,
      ownerType: "statement",
      ownerId: safeStatementId,
      purpose,
      operatorId: currentUserId,
      localAttachments: selectLocalAttachments(currentStatement),
    }, apiOptions);
    if (isCancelled()) {
      syncKeysRef.current.delete(syncKey);
      return { ...result, cancelled: true };
    }
    if (result.blocked || (!allowLocalFallback && result.source !== "api")) {
      syncKeysRef.current.delete(syncKey);
      return { ...result, blocked: true };
    }
    if (result.items?.length) {
      setStatements((current) => syncProjection(
        current,
        safeStatementId,
        result.items.map((item) => ({ ...item, source: result.source })),
      ));
    }
    return result;
  }

  function syncStatementPaymentAttachmentsFromSource(statementId, options = {}) {
    return syncStatementAttachments({
      statementId,
      purpose: "payment_screenshot",
      syncKeysRef: paymentAttachmentSyncKeysRef,
      selectLocalAttachments: (statement) => statement?.paymentAttachmentFiles ?? [],
      syncProjection: syncStatementPaymentAttachments,
      ...options,
    });
  }

  function syncStatementCustomerAttachmentsFromSource(statementId, options = {}) {
    return syncStatementAttachments({
      statementId,
      purpose: "statement_customer_confirmation",
      syncKeysRef: customerConfirmationAttachmentSyncKeysRef,
      selectLocalAttachments: (statement) => statement?.customerConfirmationAttachmentFiles ?? [],
      syncProjection: syncStatementCustomerConfirmationAttachments,
      ...options,
    });
  }

  return {
    downloadViewedAttachment,
    loadAttachmentAccessAudit,
    syncStatementCustomerAttachmentsFromSource,
    syncStatementPaymentAttachmentsFromSource,
  };
}
