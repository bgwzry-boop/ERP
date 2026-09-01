import { isInlineImageAttachment } from "./attachmentViewUtils.js";
import { downloadOfficeAttachmentContent as downloadOfficeAttachmentContentDefault } from "../services/officeAttachmentApiClient.js";
import { buildStatementExcelWorkbook } from "../services/officeStatementApiClient.js";
import {
  downloadOfficeStatementExport as downloadOfficeStatementExportDefault,
  handleOfficeStatementVariance as handleOfficeStatementVarianceDefault,
  listOfficeStatementExports as listOfficeStatementExportsDefault,
  markOfficeStatementSentViaApi as markOfficeStatementSentViaApiDefault,
  previewOfficeStatement as previewOfficeStatementDefault,
  recordOfficeStatementSendReceipt as recordOfficeStatementSendReceiptDefault,
  writeOffOfficeStatement as writeOffOfficeStatementDefault,
} from "../services/officeStatementLazyApi.js";
import {
  confirmOfficeStatementWriteOff,
  markOfficeStatementSent,
} from "../services/officeMockService.js";
import {
  getStatementWriteOffBlocker,
  recordStatementSendReceipt,
  recordStatementExport,
  syncStatementExportRecords,
  updateStatementCustomerConfirmationAttachmentPreview,
  updateStatementPaymentAttachmentPreview,
} from "../state/officeStatementActions.js";

const defaultApi = {
  downloadOfficeAttachmentContent: downloadOfficeAttachmentContentDefault,
  downloadOfficeStatementExport: downloadOfficeStatementExportDefault,
  handleOfficeStatementVariance: handleOfficeStatementVarianceDefault,
  listOfficeStatementExports: listOfficeStatementExportsDefault,
  markOfficeStatementSentViaApi: markOfficeStatementSentViaApiDefault,
  previewOfficeStatement: previewOfficeStatementDefault,
  recordOfficeStatementSendReceipt: recordOfficeStatementSendReceiptDefault,
  writeOffOfficeStatement: writeOffOfficeStatementDefault,
};

export function createOfficeStatementActions({
  allowLocalFallback,
  api = defaultApi,
  authState,
  confirmAction = () => false,
  currentUser,
  currentUserId,
  downloadStatementExcelWorkbook,
  findCustomer,
  getStatementBlockingAmount,
  guardUiAction,
  loadAttachmentAccessAudit,
  openAttachmentViewer,
  openModal,
  orderLines,
  readBlobAsDataUrl,
  refreshStatementDetail,
  selectedStatementId,
  setStatements,
  setToast,
  statements,
}) {
  const statementApi = { ...defaultApi, ...api };
  const apiOptions = { serverRequired: !allowLocalFallback };

  async function callStatementApi(operation, input, operationLabel) {
    const result = await operation(input, apiOptions);
    if (!allowLocalFallback && result?.source !== "api") {
      return {
        ...result,
        source: result?.source ?? "api_error",
        blocked: true,
        error: result?.error ?? {
          code: "STATEMENT_LOCAL_FALLBACK_FORBIDDEN",
          message: `正式后端模式禁止${operationLabel}使用本地降级结果。`,
        },
      };
    }
    return result;
  }

  const downloadOfficeAttachmentContent = (input) =>
    statementApi.downloadOfficeAttachmentContent(input, apiOptions);
  const downloadOfficeStatementExport = (input) =>
    callStatementApi(
      statementApi.downloadOfficeStatementExport,
      { ...input, allowLocalFallback },
      "对账导出",
    );
  const listOfficeStatementExports = (input) =>
    callStatementApi(statementApi.listOfficeStatementExports, input, "查询对账导出记录");
  const markOfficeStatementSentViaApi = (input) =>
    callStatementApi(statementApi.markOfficeStatementSentViaApi, input, "标记对账单已发送");
  const previewOfficeStatement = (input) =>
    callStatementApi(statementApi.previewOfficeStatement, input, "生成对账单预览");
  const recordOfficeStatementSendReceipt = (input) =>
    callStatementApi(statementApi.recordOfficeStatementSendReceipt, input, "登记对账单回执");
  const writeOffOfficeStatement = (input) =>
    callStatementApi(statementApi.writeOffOfficeStatement, input, "确认对账核销");
  const handleOfficeStatementVariance = (input) =>
    callStatementApi(statementApi.handleOfficeStatementVariance, input, "处理对账差额");

  async function refreshStatementExportRecords(statement) {
    const listResult = await listOfficeStatementExports({
      authState,
      statement,
      operatorId: currentUserId,
    });
    if (!listResult.blocked) {
      setStatements((current) => syncStatementExportRecords(current, statement, listResult.items, {
        source: listResult.source === "api" ? "后端 API 文件" : "本地记录",
      }));
    }
    return listResult;
  }

  async function statementAction(action, statementId = selectedStatementId, actionPayload = {}) {
    if (!guardUiAction("statements", action)) return;
    const selected = statements.find((item) => item.id === statementId) ?? statements[0];
    if (!selected) {
      setToast("未找到对账单，无法执行当前操作。");
      return;
    }
    const customer = findCustomer(selected.customerId);
    const blockingAmount = getStatementBlockingAmount(selected);

    if (action === "差额待确认" && actionPayload.confirmedDecision === true) {
      const apiResult = await handleOfficeStatementVariance({
        authState,
        statement: selected,
        varianceAmount: blockingAmount,
        reason: actionPayload.reason,
        handlingResult: actionPayload.handlingResult,
        operatorId: currentUserId,
        expectedRevision: actionPayload.expectedRevision,
        idempotencyKey: actionPayload.idempotencyKey,
        delegatedDecision: actionPayload.delegatedDecision,
        directDecisionContent: actionPayload.directDecisionContent,
      });
      if (apiResult.blocked) {
        setToast(`后端拒绝差额处理：${apiResult.error?.message ?? "业务校验未通过"}`);
        return apiResult;
      }
      await refreshStatementDetail?.({ statementId: selected.id, showToast: false });
      setToast(`已通过${apiResult.source === "api" ? "后端 API" : "本地规则降级"}记录差额处理结果：${actionPayload.reason}。`);
      return apiResult;
    }

    if (action === "确认核销" && actionPayload.confirmedDecision === true) {
      const blocker = getStatementWriteOffBlocker(selected, blockingAmount);
      if (blocker) {
        setToast(blocker);
        return { blocked: true, error: { code: "STATEMENT_WRITE_OFF_BLOCKED", message: blocker } };
      }
      const apiResult = await writeOffOfficeStatement({
        authState,
        statement: selected,
        operatorId: currentUserId,
        expectedRevision: actionPayload.expectedRevision,
        idempotencyKey: actionPayload.idempotencyKey,
        confirmReason: actionPayload.reason,
        delegatedDecision: actionPayload.delegatedDecision,
        directDecisionContent: actionPayload.directDecisionContent,
      });
      if (apiResult.blocked) {
        setToast(`后端拒绝确认核销：${apiResult.error?.message ?? "业务校验未通过"}`);
        return apiResult;
      }
      await refreshStatementDetail?.({ statementId: selected.id, showToast: false });
      setToast(`已通过${apiResult.source === "api" ? "后端 API" : "本地规则降级"}确认核销并写入决定与操作日志。`);
      return apiResult;
    }

    if (action === "查看付款凭证") {
      const attachmentId = typeof actionPayload === "string" ? actionPayload : actionPayload?.attachmentId;
      const attachmentFile = (selected.paymentAttachmentFiles ?? []).find((file) => file.attachmentId === attachmentId);
      if (!attachmentId) {
        setToast("未找到付款凭证附件 ID，无法预览。");
        return;
      }
      if (attachmentFile?.previewDataUrl && (allowLocalFallback || attachmentFile.contentSource === "api")) {
        const accessAudit = await loadAttachmentAccessAudit(attachmentId);
        openAttachmentViewer({
          ...attachmentFile,
          accessAudit,
          statementId: selected.id,
        });
        setStatements((current) =>
          updateStatementPaymentAttachmentPreview(current, selected.id, attachmentId, {
            accessAudit,
          }),
        );
        setToast(`已打开付款凭证预览：${attachmentFile.fileName || attachmentId}。`);
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
            ? "后端拒绝读取付款凭证：缺少权限 " + contentResult.error.requiredPermission + "。"
            : "后端拒绝读取付款凭证：" + (contentResult.error?.message ?? "未知错误"),
        );
        return;
      }
      if (contentResult.source !== "api") {
        setStatements((current) =>
          updateStatementPaymentAttachmentPreview(current, selected.id, attachmentId, {
            previewStatus: "读取失败，API 不可用",
          }),
        );
        setToast("付款凭证内容读取 API 暂不可用，已保留附件记录。");
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
        statementId: selected.id,
      };
      setStatements((current) =>
        updateStatementPaymentAttachmentPreview(current, selected.id, attachmentId, {
          previewDataUrl: nextPreview.previewDataUrl,
          previewStatus: nextPreview.previewStatus,
          contentType: nextPreview.contentType,
          contentDisposition: nextPreview.contentDisposition,
          contentSource: nextPreview.contentSource,
          accessAudit: nextPreview.accessAudit,
        }),
      );
      if (previewDataUrl) {
        openAttachmentViewer(nextPreview);
      }
      setToast(
        previewDataUrl
          ? isImagePreview
            ? "已通过后端 API 读取付款凭证并显示预览。"
            : "已通过后端 API 读取付款凭证，可下载原文件查看。"
          : "已通过后端 API 读取付款凭证，当前没有可下载内容。",
      );
      return;
    }

    if (action === "查看客户确认附件") {
      const attachmentId = typeof actionPayload === "string" ? actionPayload : actionPayload?.attachmentId;
      const attachmentFile = (selected.customerConfirmationAttachmentFiles ?? []).find((file) => file.attachmentId === attachmentId);
      if (!attachmentId) {
        setToast("未找到客户确认附件 ID，无法预览。");
        return;
      }
      if (attachmentFile?.previewDataUrl && (allowLocalFallback || attachmentFile.contentSource === "api")) {
        const accessAudit = await loadAttachmentAccessAudit(attachmentId);
        openAttachmentViewer({
          ...attachmentFile,
          accessAudit,
          statementId: selected.id,
          viewerTitle: "客户确认附件预览",
        });
        setStatements((current) =>
          updateStatementCustomerConfirmationAttachmentPreview(current, selected.id, attachmentId, {
            accessAudit,
          }),
        );
        setToast(`已打开客户确认附件预览：${attachmentFile.fileName || attachmentId}。`);
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
            ? "后端拒绝读取客户确认附件：缺少权限 " + contentResult.error.requiredPermission + "。"
            : "后端拒绝读取客户确认附件：" + (contentResult.error?.message ?? "未知错误"),
        );
        return;
      }
      if (contentResult.source !== "api") {
        setStatements((current) =>
          updateStatementCustomerConfirmationAttachmentPreview(current, selected.id, attachmentId, {
            previewStatus: "读取失败，API 不可用",
          }),
        );
        setToast("客户确认附件内容读取 API 暂不可用，已保留附件记录。");
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
        statementId: selected.id,
        viewerTitle: "客户确认附件预览",
      };
      setStatements((current) =>
        updateStatementCustomerConfirmationAttachmentPreview(current, selected.id, attachmentId, {
          previewDataUrl: nextPreview.previewDataUrl,
          previewStatus: nextPreview.previewStatus,
          contentType: nextPreview.contentType,
          contentDisposition: nextPreview.contentDisposition,
          contentSource: nextPreview.contentSource,
          accessAudit: nextPreview.accessAudit,
        }),
      );
      if (previewDataUrl) {
        openAttachmentViewer(nextPreview);
      }
      setToast(
        previewDataUrl
          ? isImagePreview
            ? "已通过后端 API 读取客户确认附件并显示预览。"
            : "已通过后端 API 读取客户确认附件，可下载原文件查看。"
          : "已通过后端 API 读取客户确认附件，当前没有可下载内容。",
      );
      return;
    }

    if (action === "生成对账单预览") {
      const apiResult = await previewOfficeStatement({
        authState,
        statement: selected,
        orderLines,
        customer,
        operatorId: currentUserId,
        previewType: "customer_send",
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? "后端拒绝生成对账预览：缺少权限 " + apiResult.error.requiredPermission + "。"
            : "后端拒绝生成对账预览：" + (apiResult.error?.message ?? "未知错误"),
        );
        return;
      }
      openModal({ type: "statementPreview", statementId: selected.id, preview: apiResult.preview, previewSource: apiResult.source });
      if (apiResult.source === "api" && apiResult.preview?.downloadToken) {
        await refreshStatementExportRecords(selected);
      }
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast("已通过" + sourceLabel + "生成客户发送版对账单预览；预览不等于已发送。");
      return;
    }

    if (action === "导出Excel") {
      const apiResult = await previewOfficeStatement({
        authState,
        statement: selected,
        orderLines,
        customer,
        operatorId: currentUserId,
        previewType: "internal_archive",
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? "后端拒绝生成导出文件：缺少权限 " + apiResult.error.requiredPermission + "。"
            : "后端拒绝生成导出文件：" + (apiResult.error?.message ?? "未知错误"),
        );
        return;
      }
      const exportResult = await downloadOfficeStatementExport({
        authState,
        statement: selected,
        preview: apiResult.preview,
        operatorId: currentUserId,
      });
      if (exportResult.blocked) {
        setToast(
          exportResult.error?.requiredPermission
            ? "后端拒绝下载导出文件：缺少权限 " + exportResult.error.requiredPermission + "。"
            : "后端拒绝下载导出文件：" + (exportResult.error?.message ?? "未知错误"),
        );
        return;
      }
      const workbookContent =
        exportResult.source === "api"
          ? exportResult.workbookData
          : buildStatementExcelWorkbook(apiResult.preview, { statement: selected, customer });
      const downloaded = downloadStatementExcelWorkbook(workbookContent, selected, customer, {
        fileName: exportResult.fileName,
        contentType: exportResult.contentType,
      });
      const exportSourceLabel = exportResult.source === "api" ? "后端 API 文件" : "本地规则降级";
      const exportRecordPayload = {
        fileName: exportResult.fileName || "statement-" + selected.id + "-" + (customer?.name ?? "customer") + ".xlsx",
        source: exportSourceLabel,
        downloadToken: apiResult.preview?.downloadToken,
        previewType: apiResult.preview?.previewType,
        contentType: exportResult.contentType,
      };
      const listResult = exportResult.source === "api" ? await refreshStatementExportRecords(selected) : null;
      if (listResult?.source !== "api") {
        setStatements((current) => recordStatementExport(current, selected, exportRecordPayload));
      }
      setToast("已通过" + exportSourceLabel + "生成内部留档 Excel 文件" + (downloaded ? "，包含对账汇总和交付明细。" : "，当前环境未触发下载。"));
      return;
    }

    if (action === "刷新导出记录") {
      const listResult = await refreshStatementExportRecords(selected);
      if (listResult?.blocked) {
        setToast(
          listResult.error?.requiredPermission
            ? "后端拒绝查询导出记录：缺少权限 " + listResult.error.requiredPermission + "。"
            : "后端拒绝查询导出记录：" + (listResult.error?.message ?? "未知错误"),
        );
        return;
      }
      const sourceLabel = listResult?.source === "api" ? "后端 API" : "本地记录";
      setToast("已通过" + sourceLabel + "刷新导出记录，共 " + (listResult?.total ?? 0) + " 条。");
      return;
    }

    if (action === "下载导出文件") {
      const exportRecord = actionPayload.exportRecord;
      if (!exportRecord?.downloadToken) {
        setToast("该导出记录缺少下载令牌，无法重下历史文件。");
        return;
      }
      const exportResult = await downloadOfficeStatementExport({
        authState,
        statement: selected,
        exportRecord,
        operatorId: currentUserId,
        allowLocalFallback: false,
      });
      if (exportResult.blocked) {
        setToast(
          exportResult.error?.requiredPermission
            ? "后端拒绝下载历史导出文件：缺少权限 " + exportResult.error.requiredPermission + "。"
            : "后端拒绝下载历史导出文件：" + (exportResult.error?.message ?? "未知错误"),
        );
        return;
      }
      if (exportResult.source !== "api") {
        setToast("历史导出文件下载接口暂不可用，未重新生成本地文件。");
        return;
      }
      const downloaded = downloadStatementExcelWorkbook(exportResult.workbookData, selected, customer, {
        fileName: exportResult.fileName || exportRecord.fileName,
        contentType: exportResult.contentType || exportRecord.contentType,
      });
      setToast(
        downloaded
          ? "已重新下载历史导出文件：" + (exportResult.fileName || exportRecord.fileName || "对账 Excel") + "。"
          : "历史导出文件已读取，但当前环境未触发下载。",
      );
      return;
    }

    if (action === "登记实收") {
      openModal({ type: "payment", statementId: selected.id });
      return;
    }

    if (action === "标记已发送") {
      const sentTo = customer?.contact ?? "";
      const sendChannel = "微信";
      const apiResult = await markOfficeStatementSentViaApi({
        authState,
        statement: selected,
        operatorId: currentUserId,
        sentTo,
        channel: "wechat",
        remark: currentUser.displayName + " 在对账 / 收款页标记发送。",
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? "后端拒绝标记发送：缺少权限 " + apiResult.error.requiredPermission + "。"
            : "后端拒绝标记发送：" + (apiResult.error?.message ?? "未知错误"),
        );
        return;
      }
      setStatements((current) =>
        markOfficeStatementSent({
          statements: current,
          statementId: selected.id,
          payload: {
            sendRecordId: apiResult.sendRecordId,
            channel: sendChannel,
            sentTo,
            operatorName: currentUser.displayName,
            remark: currentUser.displayName + " 在对账 / 收款页标记发送。",
          },
        }),
      );
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast("已通过" + sourceLabel + "记录对账发送渠道、发送人和发送时间。");
      return;
    }

    if (action === "标记已读回执") {
      if (!selected.sent || !selected.sendRecordId) {
        setToast("当前对账单还没有发送记录，不能登记客户已读回执。");
        return;
      }
      const apiResult = await recordOfficeStatementSendReceipt({
        authState,
        statement: selected,
        operatorId: currentUserId,
        receiptStatus: "read",
        remark: currentUser.displayName + " 在对账 / 收款页登记客户已读回执。",
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? "后端拒绝登记回执：缺少权限 " + apiResult.error.requiredPermission + "。"
            : "后端拒绝登记回执：" + (apiResult.error?.message ?? "未知错误"),
        );
        return;
      }
      setStatements((current) =>
        recordStatementSendReceipt(current, selected.id, {
          receiptStatus: apiResult.receiptStatus || "read",
          receiptAt: apiResult.receiptAt,
          operatorName: currentUser.displayName,
          remark: currentUser.displayName + " 在对账 / 收款页登记客户已读回执。",
        }),
      );
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast("已通过" + sourceLabel + "登记客户已读回执。");
      return;
    }

    if (action === "登记客户确认") {
      if (!selected.sent || !selected.sendRecordId) {
        setToast("当前对账单还没有发送记录，不能登记客户确认。");
        return;
      }
      openModal({ type: "customerConfirmation", statementId: selected.id });
      return;
    }

    if (action === "差额待确认") {
      if (blockingAmount <= 0 && selected.received >= selected.receivable) {
        setToast("当前没有差额，无需进入差额处理。");
        return;
      }
      openModal({ type: "variance", statementId: selected.id });
      return;
    }

    if (action === "确认核销") {
      const blocker = getStatementWriteOffBlocker(selected, blockingAmount);
      if (blocker) {
        setToast(blocker);
        return;
      }
      const confirmed = confirmAction(buildStatementWriteOffConfirmation({
        statement: selected,
        customer,
        blockingAmount,
      }));
      if (!confirmed) {
        setToast("已取消核销，对账单未改动。");
        return;
      }
      const apiResult = await writeOffOfficeStatement({
        authState,
        statement: selected,
        operatorId: currentUserId,
        confirmReason: currentUser.displayName + " 确认核销 / 欠款状态。",
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? "后端拒绝确认核销：缺少权限 " + apiResult.error.requiredPermission + "。"
            : "后端拒绝确认核销：" + (apiResult.error?.message ?? "未知错误"),
        );
        return;
      }
      const result = confirmOfficeStatementWriteOff({ statements, statement: selected, blockingAmount });
      setStatements(result.statements);
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast("已通过" + sourceLabel + "记录：" + result.toast.replace("办公室A", currentUser.displayName));
      return;
    }

    setToast("未识别对账操作，未执行。");
  }

  return {
    refreshStatementExportRecords,
    statementAction,
  };
}

function buildStatementWriteOffConfirmation({ statement, customer, blockingAmount }) {
  const receivable = formatStatementConfirmationAmount(statement?.receivable);
  const received = formatStatementConfirmationAmount(statement?.received);
  const variance = formatStatementConfirmationAmount(statement?.variance ?? blockingAmount);
  return `确认对账核销？\n对账单：${statement?.id || "对账单待确认"}\n客户：${customer?.name || statement?.customerId || "客户待确认"}\n本期应收：${receivable}\n本期实收：${received}\n本期未收/差额：${variance}\n处理结果：${statement?.varianceHandling || "无差额/按到账结清"}\n\n确认后将更新对账单状态，并写入核销交易和操作日志。`;
}

function formatStatementConfirmationAmount(value) {
  const amount = Number(value ?? 0);
  return `¥${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
}
