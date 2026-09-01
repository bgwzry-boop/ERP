import { useState } from "react";
import {
  canUseUiAction,
  getPermissionDeniedText,
} from "../auth/seedPermissions.js";
import {
  createPaymentScreenshotAttachmentInput,
  createStatementCustomerConfirmationAttachmentInput,
  createOfficeAttachment,
} from "../services/officeAttachmentApiClient.js";
import {
  handleOfficeStatementVariance,
  recordOfficeStatementCustomerConfirmation,
  recordOfficeStatementPayment,
} from "../services/officeStatementLazyApi.js";
import { confirmOfficeModal } from "../state/officeModalActions.js";
import { recordStatementCustomerConfirmation } from "../state/officeStatementActions.js";

const conflictCodePattern = /(CONFLICT|STALE|VERSION|LOCKED)/i;
const defaultApi = {
  createOfficeAttachment,
  handleOfficeStatementVariance,
  recordOfficeStatementCustomerConfirmation,
  recordOfficeStatementPayment,
};
const defaultDomain = {
  confirmOfficeModal,
  recordStatementCustomerConfirmation,
};

function cleanFeedback(value) {
  return String(value ?? "").trim();
}

export function getOfficeActionFailureFeedback(actionLabel, result, fallbackMessage = "业务校验未通过") {
  const action = cleanFeedback(actionLabel) || "执行操作";
  const error = result?.error ?? {};
  if (error.requiredPermission) {
    return `后端拒绝${action}：缺少权限 ${error.requiredPermission}。`;
  }
  const message = cleanFeedback(error.message) || fallbackMessage;
  if (conflictCodePattern.test(cleanFeedback(error.code))) {
    return `${action}发生数据冲突：${message}。请刷新后重试。`;
  }
  return `后端拒绝${action}：${message}`;
}

export function createOfficeInteractionActions({
  addTodo,
  api = defaultApi,
  authState,
  closeModal,
  closeOrderActionModal,
  confirmBatchPrintResult,
  currentUser,
  currentUserId,
  domain = defaultDomain,
  executeOrderLineAction,
  findCustomer,
  fulfillments,
  getModal,
  getOrderActionModal,
  getStatementBlockingAmount,
  handoffPaperOutbound,
  orderLines,
  permissionContext,
  printFulfillmentDocument,
  readFileAsDataUrl,
  recordWarehouseExecution,
  saveFulfillmentDispatch,
  setFulfillments,
  setStatements,
  setToast,
  statements,
  submitFulfillmentException,
  todos,
  voidFulfillmentPrintRecord,
}) {
  function notify(message) {
    const feedback = cleanFeedback(message);
    if (feedback) setToast(feedback);
    return feedback;
  }

  function notifyResult(result, fallbackMessage = "") {
    const feedback = result?.feedback
      ?? result?.toast
      ?? (result?.blocked ? getOfficeActionFailureFeedback("执行操作", result) : fallbackMessage);
    notify(feedback);
    return result;
  }

  function guardUiAction(surface, action) {
    if (canUseUiAction(permissionContext, surface, action)) return true;
    notify(getPermissionDeniedText(permissionContext, surface, action));
    return false;
  }

  async function confirmOrderLineAction(payload) {
    const activeModal = getOrderActionModal();
    if (!activeModal) return null;
    const orderLine = orderLines.find((item) => item.id === activeModal.orderLineId) ?? activeModal.orderLine;
    const result = await executeOrderLineAction({
      action: activeModal.type,
      orderLine,
      payload,
    });
    if (result?.closeModal) closeOrderActionModal();
    return notifyResult(result);
  }

  async function confirmModal(payload) {
    const activeModal = getModal();
    closeModal();
    if (!activeModal) return null;

    if (activeModal.type === "batchPrintResult") {
      return notifyResult(await confirmBatchPrintResult({ modal: activeModal, payload }));
    }

    if (activeModal.type === "dispatch") {
      const selected = fulfillments.find((item) => item.id === activeModal.fulfillmentId);
      if (!selected) {
        notify("未找到对应送货记录，无法编辑派单。");
        return null;
      }
      return notifyResult(await saveFulfillmentDispatch({ fulfillment: selected, payload }));
    }

    if (activeModal.type === "paperHandoff") {
      const selected = fulfillments.find((item) => item.id === activeModal.fulfillmentId);
      if (!selected?.paperOutboundDocument) {
        notify("未找到当前纸单版本，无法交库房。");
        return null;
      }
      return notifyResult(await handoffPaperOutbound({
        fulfillment: selected,
        paperOutboundDocument: selected.paperOutboundDocument,
        note: payload.note,
      }));
    }

    if (activeModal.type === "warehouseExecution") {
      const selected = fulfillments.find((item) => item.id === activeModal.fulfillmentId);
      if (!selected?.paperOutboundDocument) {
        notify("未找到当前纸单版本，无法回录库房结果。");
        return null;
      }
      return notifyResult(await recordWarehouseExecution({
        fulfillment: selected,
        paperOutboundDocument: selected.paperOutboundDocument,
        payload,
      }));
    }

    if (activeModal.type === "print") {
      return notifyResult(await printFulfillmentDocument({ modal: activeModal, payload }));
    }

    if (activeModal.type === "printVoid") {
      return notifyResult(await voidFulfillmentPrintRecord({ modal: activeModal, payload }));
    }

    if (activeModal.type === "mismatch" || activeModal.type === "unable") {
      const selected = fulfillments.find((item) => item.id === activeModal.fulfillmentId);
      if (!selected) {
        notify("未找到对应出库 / 交付记录，无法确认异常。");
        return null;
      }
      return notifyResult(await submitFulfillmentException({
        fulfillment: selected,
        modalType: activeModal.type,
        payload,
      }));
    }

    if (activeModal.type === "customerConfirmation") {
      const selected = statements.find((item) => item.id === activeModal.statementId);
      if (!selected) {
        notify("未找到对应对账单，无法登记客户确认。");
        return null;
      }
      if (!selected.sent || !selected.sendRecordId) {
        notify("当前对账单还没有发送记录，不能登记客户确认。");
        return null;
      }
      const customer = findCustomer(selected.customerId) ?? {};
      let attachmentIds = [...(selected.customerConfirmationAttachmentIds ?? [])];
      let attachmentFiles = [];
      let attachmentSource = "";
      if (payload.attachCustomerConfirmationProof) {
        if (!payload.customerConfirmationProofFile) {
          notify("已勾选确认附件，请选择实际文件；如仅登记客户回复，请取消勾选后再提交。");
          return null;
        }
        const proofContentDataUrl = await readFileAsDataUrl(payload.customerConfirmationProofFile);
        const proofFileForAttachment = payload.customerConfirmationProofFile
          ? {
              name: payload.customerConfirmationProofFile.name,
              size: payload.customerConfirmationProofFile.size,
              type: payload.customerConfirmationProofFile.type,
              contentDataUrl: proofContentDataUrl,
            }
          : null;
        const attachmentInput = createStatementCustomerConfirmationAttachmentInput({
          statement: selected,
          operatorId: currentUserId,
          remark: payload.customerConfirmationRemark || `客户确认附件：${proofFileForAttachment.name}`,
          file: proofFileForAttachment,
        });
        const attachmentResult = await api.createOfficeAttachment({ authState, ...attachmentInput });
        if (attachmentResult.blocked) {
          notify(getOfficeActionFailureFeedback("登记客户确认附件", attachmentResult));
          return attachmentResult;
        }
        if (attachmentResult.attachment?.attachmentId) {
          attachmentIds = [...new Set([...attachmentIds, attachmentResult.attachment.attachmentId])];
          attachmentFiles = [{ ...attachmentResult.attachment, source: attachmentResult.source }];
        }
        attachmentSource = attachmentResult.source;
      }
      const confirmationContent = cleanFeedback(payload.customerConfirmationContent) || "客户回复确认无误";
      const apiResult = await api.recordOfficeStatementCustomerConfirmation({
        authState,
        statement: selected,
        operatorId: currentUserId,
        channel: "wechat",
        confirmedByCustomer: customer.contact || customer.name,
        content: confirmationContent,
        attachmentIds,
        remark: `${currentUser.displayName} 在对账 / 收款页登记客户确认。`,
      });
      if (apiResult.blocked) {
        notify(getOfficeActionFailureFeedback("登记客户确认", apiResult));
        return apiResult;
      }
      const confirmationRecord = apiResult.confirmationRecord ?? {};
      setStatements((current) =>
        domain.recordStatementCustomerConfirmation(current, selected.id, {
          confirmationRecordId: apiResult.confirmationRecordId,
          channel: "微信",
          confirmedByCustomer: confirmationRecord.confirmedByCustomer || customer.contact || customer.name,
          confirmedAt: confirmationRecord.confirmedAt,
          content: confirmationRecord.content || confirmationContent,
          attachmentIds: confirmationRecord.attachmentIds ?? attachmentIds,
          attachmentFiles,
          operatorName: currentUser.displayName,
        }),
      );
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      const attachmentLabel = attachmentIds.length
        ? `，确认附件已通过${attachmentSource === "api" ? "后端 API" : "本地规则降级"}登记 ${attachmentIds.length} 个。`
        : "。";
      notify(`已通过${sourceLabel}登记客户确认，对账单保留客户回复证据${attachmentLabel}`);
      return apiResult;
    }

    if (activeModal.type === "payment") {
      const selected = statements.find((item) => item.id === activeModal.statementId);
      if (!selected) {
        notify("未找到对应对账单，无法登记实收。");
        return null;
      }
      let attachmentIds = [];
      let attachmentSource = "";
      if (payload.attachPaymentProof) {
        if (!payload.paymentProofFile) {
          notify("已勾选付款凭证，请选择实际文件；如暂不留存凭证，请取消勾选后再登记实收。");
          return null;
        }
        const proofContentDataUrl = await readFileAsDataUrl(payload.paymentProofFile);
        const proofFileForAttachment = payload.paymentProofFile
          ? {
              name: payload.paymentProofFile.name,
              size: payload.paymentProofFile.size,
              type: payload.paymentProofFile.type,
              contentDataUrl: proofContentDataUrl,
            }
          : null;
        const attachmentInput = createPaymentScreenshotAttachmentInput({
          statement: selected,
          operatorId: currentUserId,
          remark: payload.paymentProofRemark || `付款凭证附件：${proofFileForAttachment.name}`,
          file: proofFileForAttachment,
        });
        const attachmentResult = await api.createOfficeAttachment({ authState, ...attachmentInput });
        if (attachmentResult.blocked) {
          notify(getOfficeActionFailureFeedback("登记付款截图", attachmentResult));
          return attachmentResult;
        }
        attachmentIds = attachmentResult.attachment?.attachmentId ? [attachmentResult.attachment.attachmentId] : [];
        attachmentSource = attachmentResult.source;
        payload.paymentAttachmentFiles = attachmentResult.attachment
          ? [{ ...attachmentResult.attachment, source: attachmentResult.source }]
          : [];
      }
      const apiResult = await api.recordOfficeStatementPayment({
        authState,
        statement: selected,
        amount: payload.amount,
        reason: payload.reason,
        operatorId: currentUserId,
        attachmentIds,
      });
      if (apiResult.blocked) {
        notify(getOfficeActionFailureFeedback("登记实收", apiResult));
        return apiResult;
      }
      const result = domain.confirmOfficeModal({
        modal: activeModal,
        payload: {
          ...payload,
          attachmentIds,
          statementRevision: apiResult.statementRevision,
        },
        fulfillments,
        statements,
        todos,
        getStatementBlockingAmount,
      });
      if (result.statements) setStatements(result.statements);
      if (result.todoInput) addTodo({ ...result.todoInput, id: apiResult.todoId ?? result.todoInput.id });
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      const attachmentLabel = attachmentIds.length
        ? `，付款截图已通过${attachmentSource === "api" ? "后端 API" : "本地规则降级"}登记。`
        : "。";
      notify(
        payload.amount < selected.receivable
          ? `已通过${sourceLabel}登记实收金额，少付进入差额待确认${attachmentLabel}`
          : `已通过${sourceLabel}登记实收金额，等待有收款确认权限账号核销${attachmentLabel}`,
      );
      return apiResult;
    }

    if (activeModal.type === "variance") {
      const selected = statements.find((item) => item.id === activeModal.statementId);
      if (!selected) {
        notify("未找到对应对账单，无法处理差额。");
        return null;
      }
      const blockingAmount = getStatementBlockingAmount(selected);
      const apiResult = await api.handleOfficeStatementVariance({
        authState,
        statement: selected,
        varianceAmount: blockingAmount,
        reason: payload.reason,
        operatorId: currentUserId,
      });
      if (apiResult.blocked) {
        notify(getOfficeActionFailureFeedback("差额处理", apiResult));
        return apiResult;
      }
      const result = domain.confirmOfficeModal({
        modal: activeModal,
        payload,
        fulfillments,
        statements,
        todos,
        getStatementBlockingAmount,
      });
      if (result.statements) setStatements(result.statements);
      if (result.todoInput) addTodo({ ...result.todoInput, id: apiResult.todoId ?? result.todoInput.id });
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      notify(`已通过${sourceLabel}记录差额处理结果：${payload.reason}。`);
      return apiResult;
    }

    const result = domain.confirmOfficeModal({
      modal: activeModal,
      payload,
      fulfillments,
      statements,
      todos,
      getStatementBlockingAmount,
    });
    if (result.fulfillments) setFulfillments(result.fulfillments);
    if (result.statements) setStatements(result.statements);
    if (result.todoInput) addTodo(result.todoInput);
    return notifyResult(result);
  }

  return {
    confirmModal,
    confirmOrderLineAction,
    guardUiAction,
    notify,
    notifyResult,
  };
}

export function useOfficeInteractionController(options) {
  const [toast, setToastState] = useState(options.initialToast ?? "");
  const [modal, setModal] = useState(null);
  const [orderActionModal, setOrderActionModal] = useState(null);
  const [attachmentViewer, setAttachmentViewer] = useState(null);
  const [masterDataTemplatePanel, setMasterDataTemplatePanel] = useState(null);

  const setToast = (message) => {
    const feedback = cleanFeedback(message);
    if (feedback) setToastState(feedback);
  };
  const openModal = (nextModal) => setModal(nextModal ?? null);
  const closeModal = () => setModal(null);
  const openOrderActionModal = (nextModal) => setOrderActionModal(nextModal ?? null);
  const closeOrderActionModal = () => setOrderActionModal(null);
  const openAttachmentViewer = (attachment) => setAttachmentViewer(attachment ?? null);
  const closeAttachmentViewer = () => setAttachmentViewer(null);
  const openMasterDataTemplatePanel = (panel) => setMasterDataTemplatePanel(panel ?? null);
  const closeMasterDataTemplatePanel = () => setMasterDataTemplatePanel(null);

  const actions = createOfficeInteractionActions({
    ...options,
    closeModal,
    closeOrderActionModal,
    getModal: () => modal,
    getOrderActionModal: () => orderActionModal,
    setToast,
  });

  return {
    attachmentViewer,
    closeAttachmentViewer,
    closeMasterDataTemplatePanel,
    closeModal,
    closeOrderActionModal,
    masterDataTemplatePanel,
    modal,
    openAttachmentViewer,
    openMasterDataTemplatePanel,
    openModal,
    openOrderActionModal,
    orderActionModal,
    setToast,
    toast,
    ...actions,
  };
}
