import { useCallback } from "react";
import { getOfficeV1GoLiveStatus } from "../services/officeV1GoLiveStatusApiClient.js";

const defaultApi = { getOfficeV1GoLiveStatus };

export function createOfficeV1StatusReadActions({
  api = defaultApi,
  authState,
  currentUserId,
  now = () => new Date().toISOString(),
  setV1GoLiveStatusState,
}) {
  async function refreshV1GoLiveStatus({ showToast = false } = {}) {
    setV1GoLiveStatusState((current) => ({ ...current, loading: true, error: "" }));
    const result = await api.getOfficeV1GoLiveStatus({ authState, operatorId: currentUserId });
    if (result.statusData) {
      const refreshedAt = now();
      setV1GoLiveStatusState({
        source: result.source,
        statusData: result.statusData,
        loading: false,
        error: "",
        lastSyncedAt: refreshedAt,
        lastSuccessfulAt: refreshedAt,
        lastAttemptedAt: refreshedAt,
      });
      return showToast
        ? {
            ...result,
            feedback: "V1 上线状态已从后端 go-live 产物刷新；当前仍以发布门禁、现场证据和签字作为完成标准。",
          }
        : result;
    }
    const attemptedAt = now();
    setV1GoLiveStatusState((current) => ({
      ...current,
      source: result.source,
      loading: false,
      error: result.error?.message || "V1 上线状态 API 不可用，当前不展示固定门禁数据。",
      lastAttemptedAt: attemptedAt,
    }));
    return showToast
      ? {
          ...result,
          feedback: "V1 上线状态 API 不可用，当前不展示固定门禁数据；当前仍以发布门禁、现场证据和签字作为完成标准。",
        }
      : result;
  }
  return { refreshV1GoLiveStatus };
}

export function useOfficeV1StatusReads(options) {
  const actions = createOfficeV1StatusReadActions(options);
  const { authState, currentUserId } = options;
  return {
    refreshV1GoLiveStatus: useCallback(actions.refreshV1GoLiveStatus, [authState, currentUserId]),
  };
}
