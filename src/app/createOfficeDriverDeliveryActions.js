import {
  createDeliveryEvidenceAttachmentInput as createDeliveryEvidenceAttachmentInputDefault,
  createOfficeAttachment as createOfficeAttachmentDefault,
} from "../services/officeAttachmentApiClient.js";
import {
  completeDriverDeliveryTask as completeDriverDeliveryTaskDefault,
  confirmDriverDeliveryLoaded as confirmDriverDeliveryLoadedDefault,
  getDriverLoadPackageCheckState as getDriverLoadPackageCheckStateDefault,
  recordDriverDeviceFieldTest as recordDriverDeviceFieldTestDefault,
  reportDriverDeliveryException as reportDriverDeliveryExceptionDefault,
} from "../services/driverMobileApiClient.js";
import {
  createWatermarkedDeliveryImageDataUrl as createWatermarkedDeliveryImageDataUrlDefault,
  estimateDataUrlByteSize as estimateDataUrlByteSizeDefault,
  getWatermarkedDeliveryFileName as getWatermarkedDeliveryFileNameDefault,
} from "../services/driverWatermarkImageClient.js";

const defaultApi = {
  completeDriverDeliveryTask: completeDriverDeliveryTaskDefault,
  confirmDriverDeliveryLoaded: confirmDriverDeliveryLoadedDefault,
  createDeliveryEvidenceAttachmentInput: createDeliveryEvidenceAttachmentInputDefault,
  createOfficeAttachment: createOfficeAttachmentDefault,
  createWatermarkedDeliveryImageDataUrl: createWatermarkedDeliveryImageDataUrlDefault,
  estimateDataUrlByteSize: estimateDataUrlByteSizeDefault,
  getDriverLoadPackageCheckState: getDriverLoadPackageCheckStateDefault,
  getWatermarkedDeliveryFileName: getWatermarkedDeliveryFileNameDefault,
  recordDriverDeviceFieldTest: recordDriverDeviceFieldTestDefault,
  reportDriverDeliveryException: reportDriverDeliveryExceptionDefault,
};

export function buildDriverDeliveryWatermarkMetadata({ task, operatorId, operatorName, locationLabel = "", geoPoint = "", capturedAt = new Date() }) {
  const capturedAtIso = capturedAt instanceof Date ? capturedAt.toISOString() : new Date(capturedAt).toISOString();
  const stamp = capturedAtIso.replace(/[-:T.Z]/g, "").slice(0, 14);
  const taskToken = String(task?.fulfillmentId || task?.orderLineId || "TASK").replace(/[^A-Za-z0-9]/g, "").slice(-8) || "TASK";
  const watermarkId = `WM-${stamp}-${taskToken}`;
  const orderRef = task?.orderTail || task?.orderLineId || task?.fulfillmentId || "";
  const safeLocationLabel = String(locationLabel || task?.addressArea || "定位待补").trim();
  const safeGeoPoint = String(geoPoint || "").trim();
  const address = String(task?.address || "").trim();
  const driverName = String(operatorName || operatorId || "").trim();
  const watermarkText = [
    task?.customerName ? `${task.customerName} ${orderRef}` : orderRef,
    task?.deliveryNoteNo ? `单据 ${task.deliveryNoteNo}` : "",
    address ? `地址 ${address}` : "",
    driverName ? `司机 ${driverName}` : "",
    `时间 ${capturedAtIso}`,
    `定位 ${[safeLocationLabel, safeGeoPoint].filter(Boolean).join(" / ")}`,
    `水印 ${watermarkId}`,
  ]
    .filter(Boolean)
    .join(" / ");

  return {
    watermarkId,
    watermarkText,
    watermarkCapturedAt: capturedAtIso,
    watermarkLocationLabel: safeLocationLabel,
    watermarkGeoPoint: safeGeoPoint,
    watermarkAddress: address,
    watermarkOperatorId: operatorId,
    watermarkOperatorName: driverName,
    watermarkOrderRef: orderRef,
    deliveryNoteNo: task?.deliveryNoteNo || "",
    fulfillmentId: task?.fulfillmentId || "",
  };
}


export function createOfficeDriverDeliveryActions({
  addTodo,
  allowLocalFallback,
  api = defaultApi,
  authState,
  currentUser,
  currentUserId,
  driverDeliveryTasks,
  fulfillments,
  guardUiAction,
  mergeAttachmentSummaries,
  now = () => new Date().toISOString(),
  readFileAsDataUrl,
  refreshDriverDeliveryTasks,
  setDriverDeliveryTasks,
  setFulfillments,
  setToast,
  todos,
}) {
  const driverApi = { ...defaultApi, ...api };
  const apiOptions = { serverRequired: !allowLocalFallback };

  async function callDriverWrite(operation, input) {
    const result = await operation(input, apiOptions);
    if (!allowLocalFallback && result?.source !== "api") {
      return {
        ...result,
        blocked: true,
        error: result?.error ?? {
          code: "DRIVER_WRITE_LOCAL_FALLBACK_FORBIDDEN",
          message: "正式后端模式禁止司机写操作使用本地降级结果。",
        },
      };
    }
    return result;
  }

  const completeDriverDeliveryTask = (input) => callDriverWrite(driverApi.completeDriverDeliveryTask, input);
  const confirmDriverDeliveryLoaded = (input) => callDriverWrite(driverApi.confirmDriverDeliveryLoaded, input);
  const createOfficeAttachment = (input) => callDriverWrite(driverApi.createOfficeAttachment, input);
  const recordDriverDeviceFieldTest = (input) => callDriverWrite(driverApi.recordDriverDeviceFieldTest, input);
  const reportDriverDeliveryException = (input) => callDriverWrite(driverApi.reportDriverDeliveryException, input);
  const createDeliveryEvidenceAttachmentInput = driverApi.createDeliveryEvidenceAttachmentInput;
  const createWatermarkedDeliveryImageDataUrl = driverApi.createWatermarkedDeliveryImageDataUrl;
  const estimateDataUrlByteSize = driverApi.estimateDataUrlByteSize;
  const getDriverLoadPackageCheckState = driverApi.getDriverLoadPackageCheckState;
  const getWatermarkedDeliveryFileName = driverApi.getWatermarkedDeliveryFileName;

  async function handleDriverDeliveryAction(action, payload = {}) {
    if (!guardUiAction("driverMobile", action)) return;
    const task = driverDeliveryTasks.find((item) => item.fulfillmentId === payload.fulfillmentId) ?? payload.task ?? driverDeliveryTasks[0];
    const fulfillment = fulfillments.find((item) => item.id === (task?.fulfillmentId ?? payload.fulfillmentId));
    if (!task || !fulfillment) {
      setToast("未找到司机送货任务，无法继续。");
      return;
    }

    if (action === "保存验收") {
      const apiResult = await recordDriverDeviceFieldTest({
        authState,
        task,
        fulfillmentId: task.fulfillmentId,
        operatorId: currentUserId,
        record: payload.record,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝保存现场验收：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝保存现场验收：${apiResult.error?.message ?? "未知错误"}`,
        );
        return apiResult;
      }
      const savedRecord = apiResult.record ?? payload.record;
      setFulfillments((current) =>
        current.map((item) =>
          item.id === task.fulfillmentId
            ? {
                ...item,
                deviceFieldTestRecord: savedRecord,
                deviceFieldTestSummary: savedRecord?.summary ?? null,
              }
            : item,
        ),
      );
      setDriverDeliveryTasks((current) =>
        current.map((item) =>
          item.fulfillmentId === task.fulfillmentId
            ? {
                ...item,
                deviceFieldTestRecord: savedRecord,
                deviceFieldTestSummary: savedRecord?.summary ?? null,
              }
            : item,
        ),
      );
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      const acceptanceLabel = apiResult.acceptance?.ready
        ? "现场验收已通过"
        : `记录已保存，现场验收未通过${apiResult.acceptance?.blockerCount ? `（${apiResult.acceptance.blockerCount}项待处理）` : ""}`;
      setToast(`${sourceLabel}：${acceptanceLabel}；${savedRecord?.summary?.label ?? "已记录"}。`);
      if (apiResult.source === "api") void refreshDriverDeliveryTasks({ showToast: false });
      return apiResult;
    }

    if (action === "确认已装车") {
      const routeRemark = [payload.routeLabel, payload.routeStopLabel]
        .filter((item) => item && item !== "未排路线" && item !== "未排站序")
        .join(" ");
      const packageCheckState = getDriverLoadPackageCheckState(task, payload.checkedPackageIds ?? []);
      if (!packageCheckState.allChecked) {
        setToast(`请先核对全部包裹：当前 ${packageCheckState.summary}，还有 ${packageCheckState.missingCount} 包未确认。`);
        return;
      }
      const apiResult = await confirmDriverDeliveryLoaded({
        authState,
        task,
        fulfillmentId: task.fulfillmentId,
        operatorId: currentUserId,
        remark: payload.remark || `${currentUser.displayName} 在司机端确认已装车${routeRemark ? `：${routeRemark}` : ""}`,
        checkedPackageIds: payload.checkedPackageIds ?? [],
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝确认装车：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝确认装车：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setFulfillments((current) =>
        current.map((item) =>
          item.id === task.fulfillmentId
            ? {
                ...item,
                status: "配送中",
                driverStatus: "配送中",
                driverId: currentUserId,
                loadedAt: now(),
              }
            : item,
        ),
      );
      setDriverDeliveryTasks((current) =>
        current.map((item) => (item.fulfillmentId === task.fulfillmentId ? { ...item, status: "配送中", loadedAt: now() } : item)),
      );
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`已通过${sourceLabel}记录司机已装车${routeRemark ? `：${routeRemark}` : ""}，${packageCheckState.summary} 已核对，任务进入配送中。`);
      if (apiResult.source === "api") void refreshDriverDeliveryTasks({ showToast: false });
      return;
    }

    if (action === "提交送达") {
      if (payload.deliveryCompletionConfirmed !== true) {
        setToast("请先核对送货任务、实际数量和凭证影响，再确认提交送达；当前未上传凭证或写入送货完成记录。");
        return {
          source: "ui_error",
          blocked: true,
          error: {
            code: "DRIVER_DELIVERY_COMPLETION_CONFIRMATION_REQUIRED",
            message: "完成送货必须经过司机端最终确认。",
          },
        };
      }
      let watermarkedPhotoAttachmentId = payload.watermarkedPhotoAttachmentId || "";
      let signaturePhotoAttachmentId = payload.signaturePhotoAttachmentId || "";
      let watermarkedPhotoAttachment = null;
      let signaturePhotoAttachment = null;
      let deliveryEvidenceSource = "";
      let watermarkMetadata = buildDriverDeliveryWatermarkMetadata({
        task,
        operatorId: currentUserId,
        operatorName: currentUser.displayName || currentUser.loginName || currentUserId,
        locationLabel: payload.watermarkLocationLabel,
        geoPoint: payload.watermarkGeoPoint,
        capturedAt: now(),
      });

      if (payload.watermarkedPhotoFile && !watermarkedPhotoAttachmentId) {
        const contentDataUrl = await readFileAsDataUrl(payload.watermarkedPhotoFile);
        const watermarkedContentDataUrl = await createWatermarkedDeliveryImageDataUrl(contentDataUrl, watermarkMetadata);
        const watermarkedFileName = getWatermarkedDeliveryFileName(payload.watermarkedPhotoFile.name, watermarkMetadata.watermarkId);
        const watermarkImageStatus = watermarkedContentDataUrl !== contentDataUrl ? "pixel_watermark_rendered" : "metadata_only";
        watermarkMetadata = {
          ...watermarkMetadata,
          watermarkImageStatus,
          originalFileName: payload.watermarkedPhotoFile.name,
          uploadedFileName: watermarkedFileName,
        };
        const attachmentInput = createDeliveryEvidenceAttachmentInput({
          task,
          fulfillmentId: task.fulfillmentId,
          operatorId: currentUserId,
          evidenceType: "watermark",
          remark: payload.remark || `${currentUser.displayName} 上传送货水印照片；${watermarkMetadata.watermarkId}`,
          metadata: watermarkMetadata,
          file: {
            name: watermarkedFileName,
            size: estimateDataUrlByteSize(watermarkedContentDataUrl) ?? payload.watermarkedPhotoFile.size,
            type: "image/jpeg",
            contentDataUrl: watermarkedContentDataUrl,
          },
        });
        const attachmentResult = await createOfficeAttachment({
          authState,
          ...attachmentInput,
        });
        if (attachmentResult.blocked) {
          setToast(
            attachmentResult.error?.requiredPermission
              ? `后端拒绝上传送货水印照片：缺少权限 ${attachmentResult.error.requiredPermission}。`
              : `后端拒绝上传送货水印照片：${attachmentResult.error?.message ?? "未知错误"}`,
          );
          return;
        }
        watermarkedPhotoAttachment = attachmentResult.attachment ?? null;
        watermarkedPhotoAttachmentId = watermarkedPhotoAttachment?.attachmentId || "";
        deliveryEvidenceSource = attachmentResult.source;
      }

      if (payload.signaturePhotoFile && !signaturePhotoAttachmentId) {
        const contentDataUrl = await readFileAsDataUrl(payload.signaturePhotoFile);
        const attachmentInput = createDeliveryEvidenceAttachmentInput({
          task,
          fulfillmentId: task.fulfillmentId,
          operatorId: currentUserId,
          evidenceType: "signature",
          remark: payload.remark || `${currentUser.displayName} 上传送货签收照片`,
          metadata: {
            relatedWatermarkId: watermarkMetadata.watermarkId,
            capturedAt: watermarkMetadata.watermarkCapturedAt,
            fulfillmentId: task.fulfillmentId,
            deliveryNoteNo: task.deliveryNoteNo || "",
          },
          file: {
            name: payload.signaturePhotoFile.name,
            size: payload.signaturePhotoFile.size,
            type: payload.signaturePhotoFile.type,
            contentDataUrl,
          },
        });
        const attachmentResult = await createOfficeAttachment({
          authState,
          ...attachmentInput,
        });
        if (attachmentResult.blocked) {
          setToast(
            attachmentResult.error?.requiredPermission
              ? `后端拒绝上传签收照片：缺少权限 ${attachmentResult.error.requiredPermission}。`
              : `后端拒绝上传签收照片：${attachmentResult.error?.message ?? "未知错误"}`,
          );
          return;
        }
        signaturePhotoAttachment = attachmentResult.attachment ?? null;
        signaturePhotoAttachmentId = signaturePhotoAttachment?.attachmentId || "";
        deliveryEvidenceSource = deliveryEvidenceSource || attachmentResult.source;
      }

      const apiResult = await completeDriverDeliveryTask({
        authState,
        task,
        fulfillmentId: task.fulfillmentId,
        actualQty: payload.actualQty ?? task.qty,
        operatorId: currentUserId,
        watermarkedPhotoAttached: payload.watermarkedPhotoAttached,
        watermarkedPhotoAttachmentId,
        ...watermarkMetadata,
        signaturePhotoAttached: payload.signaturePhotoAttached,
        signaturePhotoAttachmentId,
        receiverName: payload.receiverName,
        paperNoteStatus: payload.paperNoteStatus,
        remark: payload.remark || `${currentUser.displayName} 在司机端提交送达凭证`,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝完成送货：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝完成送货：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      const completedAt = now();
      const deliveryEvidenceAttachments = [watermarkedPhotoAttachment, signaturePhotoAttachment].filter(Boolean);
      setFulfillments((current) =>
        current.map((item) =>
          item.id === task.fulfillmentId
            ? {
                ...item,
                status: "已交付",
                driverStatus: "已完成",
                actualQty: Number(payload.actualQty ?? task.qty ?? item.qty ?? 0),
                printed: true,
                deliveredAt: completedAt,
                completedAt,
                confirmedBy: currentUserId,
                receiverName: payload.receiverName || item.receiverName || "",
                paperNoteStatus: payload.paperNoteStatus || item.paperNoteStatus || "已交回",
                watermarkedPhotoAttached: true,
                watermarkedPhotoAttachmentId: watermarkedPhotoAttachmentId || item.watermarkedPhotoAttachmentId || "",
                ...watermarkMetadata,
                signaturePhotoAttached: Boolean(payload.signaturePhotoAttached || signaturePhotoAttachmentId),
                signaturePhotoAttachmentId: signaturePhotoAttachmentId || item.signaturePhotoAttachmentId || "",
                deliveryEvidenceReviewStatus: "待复核",
                deliveryEvidenceReviewedAt: "",
                deliveryEvidenceReviewedBy: "",
                deliveryEvidenceIssueReason: "",
                deliveryEvidenceAttachmentFiles: mergeAttachmentSummaries(item.deliveryEvidenceAttachmentFiles, deliveryEvidenceAttachments),
              }
            : item,
        ),
      );
      setDriverDeliveryTasks((current) =>
        current.map((item) =>
          item.fulfillmentId === task.fulfillmentId
            ? {
                ...item,
                status: "已完成",
                completedAt,
                receiverName: payload.receiverName || item.receiverName,
                paperNoteStatus: payload.paperNoteStatus || item.paperNoteStatus || "已交回",
                watermarkedPhotoAttached: true,
                watermarkedPhotoAttachmentId: watermarkedPhotoAttachmentId || item.watermarkedPhotoAttachmentId || "",
                ...watermarkMetadata,
                signaturePhotoAttached: Boolean(payload.signaturePhotoAttached || signaturePhotoAttachmentId),
                signaturePhotoAttachmentId: signaturePhotoAttachmentId || item.signaturePhotoAttachmentId || "",
                deliveryEvidenceReviewStatus: "待复核",
              }
            : item,
        ),
      );
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      const evidenceLabel = watermarkedPhotoAttachmentId
        ? `，水印照片附件 ${watermarkedPhotoAttachmentId} 已保存`
        : deliveryEvidenceSource
          ? "，水印照片已上传"
          : "，水印照片已记录";
      setToast(`已通过${sourceLabel}提交送达凭证${evidenceLabel}；送达证据等待办公室复核。`);
      if (apiResult.source === "api") void refreshDriverDeliveryTasks({ showToast: false });
      return;
    }

    if (action === "装车异常" || action === "送货异常") {
      const reason = payload.reason || (action === "装车异常" ? "装车少货" : "其他");
      const apiResult = await reportDriverDeliveryException({
        authState,
        task,
        fulfillmentId: task.fulfillmentId,
        operatorId: currentUserId,
        reason,
        actualQty: payload.actualQty ?? task.qty,
        remark: payload.remark || reason,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝记录送货异常：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝记录送货异常：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setFulfillments((current) =>
        current.map((item) =>
          item.id === task.fulfillmentId
            ? {
                ...item,
                status: "送货异常",
                driverStatus: "送货异常",
                exceptionReason: reason,
                actualQty: Number(payload.actualQty ?? task.qty ?? item.qty ?? 0),
              }
            : item,
        ),
      );
      setDriverDeliveryTasks((current) =>
        current.map((item) =>
          item.fulfillmentId === task.fulfillmentId
            ? { ...item, status: "送货异常", exceptionReason: reason, officeNote: reason }
            : item,
        ),
      );
      const existingTodo = todos.find((item) => item.ref === task.orderLineId && item.type === "送货异常待处理" && !item.handled);
      if (!existingTodo) {
        addTodo({
          id: apiResult.todoId || undefined,
          type: "送货异常待处理",
          customerId: task.customerId,
          ref: task.orderLineId,
          summary: `${task.customerName} ${task.goodsSummary}：${reason}`,
          latest: task.latest,
          urgency: "异常",
          impact: "需办公室联系客户、仓库或司机确认下一步",
        });
      }
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`已通过${sourceLabel}记录${action}，异常回到办公室公共待办。`);
      if (apiResult.source === "api") void refreshDriverDeliveryTasks({ showToast: false });
    }
  }


  return { handleDriverDeliveryAction };
}
