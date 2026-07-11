import { useCallback } from "react";
import {
  listOfficeMasterDataEmployeeAccountReviews,
  listOfficeMasterDataImportReviewDrafts,
} from "../services/officeMasterDataImportApiClient.js";
import { isOfficeApiServerRequired } from "../services/officeAuthService.js";
import { getUiActionState } from "../auth/seedPermissions.js";

function withFeedback(result, silent, feedback) {
  return silent ? result : { ...result, feedback };
}

function normalizeReadResultForRuntime(result, { label, serverRequired }) {
  const safeResult = result ?? {};
  if (!serverRequired() || safeResult.source === "api") return safeResult;
  return {
    ...safeResult,
    blocked: true,
    upstreamSource: safeResult.source,
    source: "api_error",
    error: {
      code: safeResult.error?.code ?? "MASTER_DATA_READ_SERVER_REQUIRED",
      message: safeResult.error?.message ?? `生产模式要求从后端读取${label}。`,
      ...(safeResult.error?.requiredPermission
        ? { requiredPermission: safeResult.error.requiredPermission }
        : {}),
    },
  };
}

const defaultApi = {
  listOfficeMasterDataEmployeeAccountReviews,
  listOfficeMasterDataImportReviewDrafts,
};

export function createOfficeMasterDataReadActions({
  api = defaultApi,
  authState,
  currentUserId,
  getActionState = getUiActionState,
  masterDataEmployeeAccountReviewsRef,
  masterDataImportReviewDraftsRef,
  permissionContext,
  serverRequired = isOfficeApiServerRequired,
  setMasterDataEmployeeAccountReviews,
  setMasterDataImportReviewDrafts,
}) {
  async function refreshMasterDataImportReviewDrafts({ silent = false } = {}) {
    const result = normalizeReadResultForRuntime(
      await api.listOfficeMasterDataImportReviewDrafts({
        authState,
        operatorId: currentUserId,
        localDrafts: masterDataImportReviewDraftsRef.current,
      }),
      { label: "基础资料导入确认草稿", serverRequired },
    );
    if (result.blocked) {
      return withFeedback(
        result,
        silent,
        `刷新导入确认草稿失败：${result.error?.message || "权限或接口错误"}`,
      );
    }
    const items = result.items ?? [];
    setMasterDataImportReviewDrafts(items);
    const sourceLabel = result.source === "api" ? "后端" : "本地";
    return withFeedback(
      result,
      silent,
      `已从${sourceLabel}刷新导入确认草稿，共 ${result.total ?? items.length} 条。`,
    );
  }

  async function refreshMasterDataEmployeeAccountReviews({ silent = false } = {}) {
    const actionState = getActionState(permissionContext, "masterData", "刷新员工复核");
    if (actionState.disabled) {
      return withFeedback(
        {
          source: "permission",
          blocked: true,
          items: masterDataEmployeeAccountReviewsRef.current,
          error: { code: "MASTER_DATA_EMPLOYEE_REVIEW_PERMISSION_DENIED", message: actionState.title },
        },
        silent,
        actionState.title,
      );
    }
    const result = normalizeReadResultForRuntime(
      await api.listOfficeMasterDataEmployeeAccountReviews({
        authState,
        operatorId: currentUserId,
        localReviews: masterDataEmployeeAccountReviewsRef.current,
      }),
      { label: "员工账号复核列表", serverRequired },
    );
    if (result.blocked) {
      return withFeedback(
        result,
        silent,
        `刷新员工账号复核失败：${result.error?.message || "权限或接口错误"}`,
      );
    }
    const items = result.items ?? [];
    setMasterDataEmployeeAccountReviews(items);
    const sourceLabel = result.source === "api" ? "API" : "本地";
    return withFeedback(
      result,
      silent,
      `已刷新员工账号复核：${result.total ?? items.length} 条（${sourceLabel}）。`,
    );
  }

  return { refreshMasterDataEmployeeAccountReviews, refreshMasterDataImportReviewDrafts };
}

export function useOfficeMasterDataReads(options) {
  const actions = createOfficeMasterDataReadActions(options);
  const {
    authState,
    currentUserId,
    masterDataEmployeeAccountReviewsRef,
    masterDataImportReviewDraftsRef,
    permissionContext,
    serverRequired,
  } = options;
  return {
    refreshMasterDataImportReviewDrafts: useCallback(actions.refreshMasterDataImportReviewDrafts, [
      authState,
      currentUserId,
      masterDataImportReviewDraftsRef,
      serverRequired,
    ]),
    refreshMasterDataEmployeeAccountReviews: useCallback(actions.refreshMasterDataEmployeeAccountReviews, [
      authState,
      currentUserId,
      masterDataEmployeeAccountReviewsRef,
      permissionContext,
      serverRequired,
    ]),
  };
}
