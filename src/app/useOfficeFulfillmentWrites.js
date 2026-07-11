import { useCallback } from "react";
import {
  completeOfficeFulfillment,
  confirmOfficeFulfillmentPickup,
  createOfficeFulfillmentException,
  markOfficeFulfillmentPrepared,
  reviewOfficeDeliveryEvidence,
  updateOfficeFulfillmentDispatch,
} from "../services/officeFulfillmentApiClient.js";
import { isOfficeApiServerRequired } from "../services/officeAuthService.js";
import { createOfficeTodo } from "../services/officeMockService.js";
import { confirmFulfillmentException, updateFulfillmentsForAction } from "../state/officeFulfillmentActions.js";

const defaultApi = {
  completeOfficeFulfillment,
  confirmOfficeFulfillmentPickup,
  createOfficeFulfillmentException,
  markOfficeFulfillmentPrepared,
  reviewOfficeDeliveryEvidence,
  updateOfficeFulfillmentDispatch,
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
      code: safeResult.error?.code ?? "FULFILLMENT_WRITE_SERVER_REQUIRED",
      message: safeResult.error?.message ?? `生产模式要求通过后端完成${label}。`,
    },
  };
}

function hasProjectionRefreshFailure(results) {
  return results.some((result) => !result || result.blocked || result.source !== "api");
}

export function createOfficeFulfillmentWriteActions({
  api = {},
  authState,
  currentUserDisplayName,
  currentUserId,
  fulfillmentsRef,
  refreshFulfillments,
  refreshInventoryRecords,
  refreshStatements,
  refreshTodos,
  serverRequired = isOfficeApiServerRequired,
  setFulfillments,
  setSelectedTodoId,
  setTodos,
  todosRef,
}) {
  const fulfillmentApi = { ...defaultApi, ...api };

  async function refreshCommittedProjections(tasks) {
    const results = await Promise.all(tasks);
    return { results, failed: hasProjectionRefreshFailure(results) };
  }

  async function markFulfillmentPrepared({ fulfillment }) {
    const result = normalizeWriteResultForRuntime(
      await fulfillmentApi.markOfficeFulfillmentPrepared({
        authState,
        fulfillment,
        operatorId: currentUserId,
        remark: `${currentUserDisplayName} 在出库 / 交付页标记已备货`,
      }),
      { label: "交付备货状态更新", serverRequired },
    );
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝标记已备货", result));

    const status = result.status || "已备货";
    setFulfillments((current) => current.map((item) =>
      item.id === fulfillment.id ? { ...item, status } : item,
    ));
    const projection = await refreshCommittedProjections([refreshFulfillments({ showToast: false })]);
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(
      result,
      projection.failed && result.source === "api"
        ? `交付记录 ${fulfillment.id} 已通过后端 API标记为已备货，但交付列表刷新失败，请手动刷新。`
        : `已通过${sourceLabel}标记 ${fulfillment.id} 已备货；未扣减库存，也未进入对账。`,
      { projectionRefreshFailed: projection.failed },
    );
  }

  async function completeFulfillmentAction({ action, fulfillment }) {
    const isPickup = action === "确认已拉走";
    const result = normalizeWriteResultForRuntime(
      isPickup
        ? await fulfillmentApi.confirmOfficeFulfillmentPickup({
            authState,
            fulfillment,
            operatorId: currentUserId,
            remark: `${currentUserDisplayName} 在出库 / 交付页确认快递快运拉走`,
          })
        : await fulfillmentApi.completeOfficeFulfillment({
            authState,
            fulfillment,
            operatorId: currentUserId,
            actualQty: fulfillment.qty,
            remark: `${currentUserDisplayName} 在出库 / 交付页执行：${action}`,
          }),
      { label: action, serverRequired },
    );
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝出库 / 交付动作", result));

    setFulfillments((current) => result.source === "api"
      ? current.map((item) => item.id === fulfillment.id ? { ...item, status: result.status || "已交付" } : item)
      : updateFulfillmentsForAction(current, fulfillment.id, action));
    const projection = await refreshCommittedProjections([
      refreshFulfillments({ showToast: false }),
      refreshInventoryRecords({ showToast: false }),
      refreshStatements({ showToast: false }),
      refreshTodos({ showToast: false }),
    ]);
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    const successText = isPickup ? "快递/快运现在才进入交付和对账。" : "交付完成后可进入对账候选。";
    return withFeedback(
      result,
      projection.failed && result.source === "api"
        ? `${action}已由后端提交，但交付、库存、对账或待办刷新失败，请手动刷新。`
        : `已通过${sourceLabel}记录${action}，操作人：${currentUserDisplayName}；${successText}`,
      { projectionRefreshFailed: projection.failed },
    );
  }

  async function reviewFulfillmentDeliveryEvidence({ action, fulfillment, reason = "", customerName = "" }) {
    if (!fulfillment.watermarkedPhotoAttachmentId && !fulfillment.watermarkedPhotoAttached && !fulfillment.watermarkedPhotoUrl) {
      return withFeedback(
        { source: "ui_error", blocked: true, error: { code: "DELIVERY_WATERMARK_REQUIRED" } },
        action === "退回重拍" ? "缺少水印照片附件，不能退回重拍。" : "缺少水印照片附件，不能复核通过。",
      );
    }
    const retake = action === "退回重拍";
    const resolvedReason = reason || "水印/定位/照片清晰度需补充";
    const result = normalizeWriteResultForRuntime(
      await fulfillmentApi.reviewOfficeDeliveryEvidence({
        authState,
        fulfillment,
        operatorId: currentUserId,
        reviewerName: currentUserDisplayName,
        reviewStatus: retake ? "retake_required" : "approved",
        ...(retake ? { reason: resolvedReason } : {}),
        remark: retake
          ? `${currentUserDisplayName} 在出库 / 交付页退回送达证据：${resolvedReason}`
          : `${currentUserDisplayName} 在出库 / 交付页复核送达证据通过`,
      }),
      { label: action, serverRequired },
    );
    if (result.blocked) {
      return withFeedback(result, formatBlockedFeedback(retake ? "后端拒绝退回送达证据" : "后端拒绝送达证据复核", result));
    }

    const reviewedAt = result.reviewedAt || new Date().toISOString();
    setFulfillments((current) => current.map((item) =>
      item.id === fulfillment.id
        ? {
            ...item,
            deliveryEvidenceReviewStatus: result.reviewStatus || (retake ? "需重拍" : "已复核"),
            deliveryEvidenceIssueReason: retake ? result.issueReason || resolvedReason : "",
            deliveryEvidenceReviewedAt: reviewedAt,
            deliveryEvidenceReviewedBy: result.reviewedBy || currentUserDisplayName,
            deliveryEvidenceReviewedByUserId: result.reviewedByUserId || currentUserId,
          }
        : item,
    ));
    if (retake && result.source !== "api") {
      const existingTodo = todosRef.current.find(
        (item) => item.ref === fulfillment.lineId && item.type === "照片待重拍" && !item.handled,
      );
      if (!existingTodo) {
        const todo = createOfficeTodo({
          type: "照片待重拍",
          customerId: fulfillment.customerId,
          ref: fulfillment.lineId,
          summary: `${customerName || fulfillment.customerId} ${fulfillment.goods || fulfillment.lineId}：${resolvedReason}`,
          latest: fulfillment.latest,
          urgency: "异常",
          impact: "需司机补拍水印照片或办公室补充说明",
        });
        setTodos((current) => [todo, ...current]);
        setSelectedTodoId(todo.id);
      }
    }
    const projection = await refreshCommittedProjections([
      refreshFulfillments({ showToast: false }),
      refreshTodos({ showToast: false }),
    ]);
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(
      result,
      projection.failed && result.source === "api"
        ? `${action}已由后端提交，但交付或待办刷新失败，请手动刷新。`
        : retake
          ? `已通过${sourceLabel}退回送达证据并同步照片待重拍待办。`
          : `已通过${sourceLabel}复核送达证据：水印照片、定位和回单状态通过；复核人 ${currentUserDisplayName}。`,
      { projectionRefreshFailed: projection.failed },
    );
  }

  async function saveFulfillmentDispatch({ fulfillment, payload }) {
    const result = normalizeWriteResultForRuntime(
      await fulfillmentApi.updateOfficeFulfillmentDispatch({
        authState,
        fulfillment,
        operatorId: currentUserId,
        driverId: payload.driverId,
        routeDate: payload.routeDate,
        routeNo: payload.routeNo,
        routeSequence: payload.routeSequence,
        plannedDepartureAt: payload.plannedDepartureAt,
        remark: payload.remark || `${currentUserDisplayName} 在出库 / 交付页编辑司机派单`,
      }),
      { label: "司机派单", serverRequired },
    );
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝编辑司机派单", result));

    const dispatch = result.dispatch ?? {
      driverId: payload.driverId,
      routeDate: payload.routeDate,
      routeNo: payload.routeNo,
      routeSequence: Number(payload.routeSequence ?? 0),
      stopSequence: Number(payload.routeSequence ?? 0),
      dispatchStatus: "已派单",
      plannedDepartureAt: payload.plannedDepartureAt,
      assignedAt: new Date().toISOString(),
      remark: payload.remark ?? "",
    };
    setFulfillments((current) => current.map((item) =>
      item.id === fulfillment.id
        ? {
            ...item,
            driverId: dispatch.driverId,
            routeDate: dispatch.routeDate,
            routeNo: dispatch.routeNo ?? dispatch.routeBatchNo,
            routeBatchNo: dispatch.routeBatchNo ?? dispatch.routeNo,
            routeSequence: Number(dispatch.routeSequence ?? dispatch.stopSequence ?? 0),
            stopSequence: Number(dispatch.stopSequence ?? dispatch.routeSequence ?? 0),
            dispatchStatus: dispatch.dispatchStatus || "已派单",
            plannedDepartureAt: dispatch.plannedDepartureAt,
            dispatchAssignedAt: dispatch.assignedAt ?? dispatch.dispatchAssignedAt,
            dispatchRemark: dispatch.remark ?? "",
          }
        : item,
    ));
    const projection = await refreshCommittedProjections([refreshFulfillments({ showToast: false })]);
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(
      result,
      projection.failed && result.source === "api"
        ? `司机派单已由后端保存，但交付列表刷新失败，请手动刷新。`
        : `已通过${sourceLabel}保存司机派单：${dispatch.routeDate} ${dispatch.routeNo ?? dispatch.routeBatchNo} 第 ${dispatch.routeSequence ?? dispatch.stopSequence} 站。`,
      { dispatch, projectionRefreshFailed: projection.failed },
    );
  }

  async function submitFulfillmentException({ fulfillment, modalType, payload }) {
    const result = normalizeWriteResultForRuntime(
      await fulfillmentApi.createOfficeFulfillmentException({
        authState,
        fulfillment,
        modalType,
        actualQty: payload.actualQty,
        reason: payload.reason,
        operatorId: currentUserId,
      }),
      { label: modalType === "unable" ? "无法出库" : "数量不符", serverRequired },
    );
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝提交出库异常", result));

    if (result.source === "api") {
      setFulfillments((current) => current.map((item) =>
        item.id === fulfillment.id
          ? {
              ...item,
              status: result.status || (modalType === "unable" ? "无法出库" : "数量差异待处理"),
              exceptionReason: payload.reason,
              actualQty: modalType === "unable" ? 0 : Number(payload.actualQty ?? 0),
            }
          : item,
      ));
    } else {
      const projection = confirmFulfillmentException(
        fulfillmentsRef.current,
        fulfillment,
        modalType,
        payload,
      );
      setFulfillments(projection.fulfillments);
      if (projection.todoInput) {
        const todo = createOfficeTodo(projection.todoInput);
        setTodos((current) => [todo, ...current]);
        setSelectedTodoId(todo.id);
      }
    }
    const projection = await refreshCommittedProjections([
      refreshFulfillments({ showToast: false }),
      refreshInventoryRecords({ showToast: false }),
      refreshTodos({ showToast: false }),
    ]);
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    const actionLabel = modalType === "unable" ? "无法出库" : "数量不符";
    return withFeedback(
      result,
      projection.failed && result.source === "api"
        ? `${actionLabel}已由后端提交，但交付、库存或待办刷新失败，请手动刷新。`
        : `已通过${sourceLabel}提交${actionLabel}，生成办公室公共待办并保留原因。`,
      { projectionRefreshFailed: projection.failed },
    );
  }

  return {
    completeFulfillmentAction,
    markFulfillmentPrepared,
    reviewFulfillmentDeliveryEvidence,
    saveFulfillmentDispatch,
    submitFulfillmentException,
  };
}

export function useOfficeFulfillmentWrites(options) {
  const actions = createOfficeFulfillmentWriteActions(options);
  const dependencies = [
    options.authState,
    options.currentUserDisplayName,
    options.currentUserId,
    options.fulfillmentsRef,
    options.serverRequired,
    options.todosRef,
  ];
  return {
    completeFulfillmentAction: useCallback(actions.completeFulfillmentAction, dependencies),
    markFulfillmentPrepared: useCallback(actions.markFulfillmentPrepared, dependencies),
    reviewFulfillmentDeliveryEvidence: useCallback(actions.reviewFulfillmentDeliveryEvidence, dependencies),
    saveFulfillmentDispatch: useCallback(actions.saveFulfillmentDispatch, dependencies),
    submitFulfillmentException: useCallback(actions.submitFulfillmentException, dependencies),
  };
}
