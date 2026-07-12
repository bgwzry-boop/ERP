import { isInlineImageAttachment } from "./attachmentViewUtils.js";
import { downloadOfficeAttachmentContent as downloadOfficeAttachmentContentDefault } from "../services/officeAttachmentApiClient.js";
import { createOfficeTodo as createOfficeTodoDefault } from "../services/officeMockService.js";

const defaultApi = {
  downloadOfficeAttachmentContent: downloadOfficeAttachmentContentDefault,
};

function findAttachmentSummaryById(files = [], attachmentId = "") {
  return (Array.isArray(files) ? files : []).find((file) => file.attachmentId === attachmentId) ?? null;
}

export function createOfficeFulfillmentActions({
  allowLocalFallback,
  api = defaultApi,
  authState,
  completeFulfillmentAction,
  createOfficeTodo = createOfficeTodoDefault,
  currentUserId,
  findCustomer,
  focusOrderLine,
  fulfillments,
  getFulfillmentDocumentLabel,
  guardUiAction,
  loadAttachmentAccessAudit,
  markFulfillmentPrepared,
  mergeAttachmentSummaries,
  openAttachmentViewer,
  openModal,
  readBlobAsDataUrl,
  refreshTodos,
  reviewFulfillmentDeliveryEvidence,
  selectedFulfillmentId,
  setActivePage,
  setFulfillments,
  setSelectedTodoId,
  setTodos,
  setToast,
  todos,
}) {
  const fulfillmentApi = { ...defaultApi, ...api };
  const apiOptions = { serverRequired: !allowLocalFallback };
  const downloadOfficeAttachmentContent = (input) =>
    fulfillmentApi.downloadOfficeAttachmentContent(input, apiOptions);

  async function updateFulfillment(action, fulfillmentId = selectedFulfillmentId, actionPayload = {}) {
    if (!guardUiAction("fulfillment", action)) return;
    const selected = fulfillments.find((item) => item.id === fulfillmentId) ?? fulfillments[0];
    if (!selected) {
      setToast("当前没有可操作的出库 / 交付记录。");
      return;
    }
    const targetFulfillmentId = selected.id;
    if (action === "查看水印照片" || action === "查看签收照片") {
      const isSignature = action === "查看签收照片";
      const attachmentId = actionPayload.attachmentId || (isSignature ? selected.signaturePhotoAttachmentId : selected.watermarkedPhotoAttachmentId);
      const attachmentFile = findAttachmentSummaryById(selected.deliveryEvidenceAttachmentFiles, attachmentId);
      const viewerTitle = isSignature ? "签收照片预览" : "送达水印照片预览";
      if (!attachmentId) {
        setToast(isSignature ? "当前送货记录没有签收照片附件。" : "当前送货记录没有水印照片附件。");
        return;
      }
      if (attachmentFile?.previewDataUrl && (allowLocalFallback || attachmentFile.contentSource === "api")) {
        const accessAudit = await loadAttachmentAccessAudit(attachmentId);
        openAttachmentViewer({
          ...attachmentFile,
          attachmentId,
          viewerTitle,
          accessAudit,
          fulfillmentId: selected.id,
        });
        setFulfillments((current) =>
          current.map((item) =>
            item.id === selected.id
              ? {
                  ...item,
                  deliveryEvidenceAttachmentFiles: mergeAttachmentSummaries(item.deliveryEvidenceAttachmentFiles, [{ ...attachmentFile, accessAudit }]),
                }
              : item,
          ),
        );
        setToast(`已打开${isSignature ? "签收照片" : "送达水印照片"}预览：${attachmentFile.fileName || attachmentId}。`);
        return;
      }
      const contentResult = await downloadOfficeAttachmentContent({
        authState,
        attachmentId,
        operatorId: currentUserId,
      });
      if (contentResult.blocked) {
        setToast(
          contentResult.error?.requiredPermission
            ? `后端拒绝读取送达证据：缺少权限 ${contentResult.error.requiredPermission}。`
            : `后端拒绝读取送达证据：${contentResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      if (contentResult.source !== "api") {
        setToast("送达证据内容读取 API 暂不可用，已保留附件记录。");
        return;
      }
      const previewDataUrl = contentResult.contentBlob ? await readBlobAsDataUrl(contentResult.contentBlob) : "";
      const isImagePreview = isInlineImageAttachment({
        previewDataUrl,
        contentType: contentResult.contentType,
        mimeType: contentResult.contentType || attachmentFile?.mimeType,
      });
      const accessAudit = await loadAttachmentAccessAudit(attachmentId);
      const nextPreview = {
        ...attachmentFile,
        attachmentId,
        fileName: attachmentFile?.fileName || attachmentId,
        mimeType: contentResult.contentType || attachmentFile?.mimeType,
        contentType: contentResult.contentType,
        contentDisposition: contentResult.contentDisposition,
        contentSource: contentResult.source,
        previewDataUrl,
        previewStatus: previewDataUrl ? (isImagePreview ? "已加载预览" : "已读取内容，可下载原文件") : "未读取到内容",
        accessAudit,
        fulfillmentId: selected.id,
        viewerTitle,
      };
      setFulfillments((current) =>
        current.map((item) =>
          item.id === selected.id
            ? {
                ...item,
                deliveryEvidenceAttachmentFiles: mergeAttachmentSummaries(item.deliveryEvidenceAttachmentFiles, [nextPreview]),
              }
            : item,
        ),
      );
      if (previewDataUrl) openAttachmentViewer(nextPreview);
      setToast(
        previewDataUrl
          ? isImagePreview
            ? `已通过后端 API 读取${isSignature ? "签收照片" : "送达水印照片"}并显示预览。`
            : `已通过后端 API 读取${isSignature ? "签收照片" : "送达水印照片"}，可下载原文件查看。`
          : "已读取送达证据，当前没有可下载内容。",
      );
      return;
    }
    if (action === "证据复核通过") {
      const result = await reviewFulfillmentDeliveryEvidence({ action, fulfillment: selected });
      if (result?.feedback) setToast(result.feedback);
      return;
    }
    if (action === "退回重拍") {
      const reason = actionPayload.reason || "水印/定位/照片清晰度需补充";
      const result = await reviewFulfillmentDeliveryEvidence({
        action,
        fulfillment: selected,
        reason,
        customerName: findCustomer(selected.customerId)?.name ?? selected.customerId,
      });
      if (result?.feedback) setToast(result.feedback);
      return;
    }
    if (action === "打开订单") {
      focusOrderLine(selected.lineId, "出库 / 交付");
      return;
    }
    if (action === "打开待办") {
      const todoType = selected.status.includes("数量") ? "数量差异待处理" : "无法出库待处理";
      const findMatchingTodo = (items) =>
        items.find((item) => item.ref === selected.lineId && item.type === todoType && !item.handled)
        ?? items.find((item) => item.ref === selected.lineId && item.type === todoType);
      let existingTodo = allowLocalFallback ? findMatchingTodo(todos) : null;
      if (!allowLocalFallback || !existingTodo) {
        const todoResult = await refreshTodos({ showToast: false });
        const refreshedTodos = allowLocalFallback || todoResult?.source === "api" ? todoResult?.items ?? [] : [];
        existingTodo = findMatchingTodo(refreshedTodos);
      }
      if (existingTodo) {
        setSelectedTodoId(existingTodo.id);
      } else if (allowLocalFallback) {
        const todo = createOfficeTodo({
          type: todoType,
          customerId: selected.customerId,
          ref: selected.lineId,
          summary: `${selected.goods} 当前状态：${selected.status}，需办公室继续处理`,
          latest: selected.latest,
          urgency: "异常",
          impact: "影响出库交付",
        });
        setTodos((current) => [todo, ...current]);
        setSelectedTodoId(todo.id);
      } else {
        setToast("后端未返回该出库异常对应的公共待办，production 不创建本地替代记录。");
        return;
      }
      setActivePage("todos");
      setToast(existingTodo ? "已打开该出库异常对应的公共待办。" : "未找到已有待办，已补建一条公共待办。");
      return;
    }
    if (action === "编辑派单") {
      if (selected.method !== "送货") {
        setToast("编辑派单只用于送货交付记录。");
        return;
      }
      openModal({ type: "dispatch", fulfillmentId: targetFulfillmentId });
      return;
    }
    if (action === "数量不符") {
      openModal({ type: "mismatch", fulfillmentId: targetFulfillmentId });
      return;
    }
    if (action === "无法出库") {
      openModal({ type: "unable", fulfillmentId: targetFulfillmentId });
      return;
    }
    if (action === "作废旧标签" || action === "作废旧单据") {
      const printRecordId = selected.activePrintRecordId ?? selected.printRecordId;
      if (!printRecordId) {
        setToast("当前只有本地已打印状态，缺少可作废的打印记录 ID；请先重新打开最新 API 数据后再作废。");
        return;
      }
      openModal({ type: "printVoid", fulfillmentId: targetFulfillmentId, printRecordId, action });
      return;
    }
    if (action === "打印预览" || action.includes("打印") || action.includes("重打")) {
      openModal({ type: "print", fulfillmentId: targetFulfillmentId, action });
      return;
    }
    if (action === "标记已备货") {
      const result = await markFulfillmentPrepared({ fulfillment: selected });
      if (result?.feedback) setToast(result.feedback);
      return;
    }
    if (action === "确认已拉走" && selected.method !== "快递快运") {
      setToast("确认已拉走只用于快递/快运；自提和送货用完成出库/交付。");
      return;
    }
    if (action === "确认已拉走" && selected.method === "快递快运" && !selected.printed && selected.status !== "待确认拉走") {
      setToast("快递/快运需要先打印标签并进入待确认拉走，再确认已拉走。");
      return;
    }
    if (action === "确认已拉走" && selected.printRecordStatus === "voided") {
      setToast("旧标签已作废，必须先重打标签，生成新有效标签后才能确认拉走。");
      return;
    }
    if ((action === "完成自提" || action === "完成送货") && selected.printRecordStatus === "voided") {
      const documentLabel = getFulfillmentDocumentLabel(selected);
      setToast(`旧${documentLabel}已作废，必须先重打${documentLabel}，生成新有效${documentLabel}后才能完成交付。`);
      return;
    }
    if ((action === "完成自提" || action === "完成送货") && selected.status.includes("待打印")) {
      setToast("当前单据/标签还未打印，先打印预览后再完成交付。");
      return;
    }

    if (action === "确认已拉走" || action === "完成自提" || action === "完成送货" || action === "完成出库/交付") {
      const result = await completeFulfillmentAction({ action, fulfillment: selected });
      if (result?.feedback) setToast(result.feedback);
      return;
    }

    setToast(`不支持的出库 / 交付动作：${action || "未指定"}；未修改任何业务状态。`);
  }

  return { updateFulfillment };
}
