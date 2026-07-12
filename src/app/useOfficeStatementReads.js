import { useCallback } from "react";
import {
  getOfficeStatementDetail,
  listOfficeStatementCustomers,
  mapStatementCustomerSummaryToLocal,
} from "../services/officeStatementApiClient.js";
import { isOfficeApiServerRequired } from "../services/officeAuthService.js";

function formatSyncTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function withFeedback(result, showToast, feedback) {
  return showToast ? { ...result, feedback } : result;
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
      code: safeResult.error?.code ?? "STATEMENT_READ_SERVER_REQUIRED",
      message: safeResult.error?.message ?? `生产模式要求从后端读取${label}。`,
    },
  };
}

const defaultApi = { getOfficeStatementDetail, listOfficeStatementCustomers };

export function createOfficeStatementReadActions({
  api = defaultApi,
  authState,
  currentUserId,
  selectedStatementIdRef,
  serverRequired = isOfficeApiServerRequired,
  statementsRef,
  setSelectedStatementId,
  setStatementReadMeta,
  setStatements,
}) {
  async function refreshStatements({ showToast = false } = {}) {
    setStatementReadMeta((current) => ({ ...current, loading: true, error: "" }));
    const result = normalizeReadResultForRuntime(
      await api.listOfficeStatementCustomers({
        authState,
        operatorId: currentUserId,
        pageSize: 200,
        localStatements: statementsRef.current,
      }),
      { label: "客户对账列表", serverRequired },
    );
    if (result.blocked) {
      const errorMessage = result.error?.message ?? "客户对账列表 API 返回错误。";
      setStatementReadMeta((current) => ({
        ...current,
        source: result.source,
        loading: false,
        error: errorMessage,
      }));
      return withFeedback(result, showToast, `刷新客户对账列表失败：${errorMessage}`);
    }

    const mayMergeLocal = !serverRequired();
    const items = (result.items ?? []).map((item) => {
      const localStatement = mayMergeLocal
        ? statementsRef.current.find((statement) => statement.id === item.statementId) ?? null
        : null;
      return mapStatementCustomerSummaryToLocal(item, localStatement);
    }).filter(Boolean);
    const currentSelectedId = selectedStatementIdRef.current;
    const selectedStatementId = items.some((item) => item.id === currentSelectedId)
      ? currentSelectedId
      : items[0]?.id ?? "";
    setStatements(items);
    setSelectedStatementId(selectedStatementId);
    setStatementReadMeta((current) => ({
      ...current,
      source: result.source,
      total: result.total ?? items.length,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
    }));
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(
      { ...result, statements: items, selectedStatementId },
      showToast,
      `客户对账列表已通过${sourceLabel}刷新，共 ${result.total ?? items.length} 条。`,
    );
  }

  async function refreshStatementDetail({ statementId = selectedStatementIdRef.current, showToast = false } = {}) {
    const safeStatementId = String(statementId ?? "").trim();
    if (!safeStatementId) return null;
    setStatementReadMeta((current) => ({ ...current, detailLoading: true, detailError: "" }));
    const localStatement = statementsRef.current.find((item) => item.id === safeStatementId) ?? null;
    const result = normalizeReadResultForRuntime(
      await api.getOfficeStatementDetail({
        authState,
        operatorId: currentUserId,
        statementId: safeStatementId,
        localStatement,
      }),
      { label: "对账单详情", serverRequired },
    );
    if (result.blocked || !result.detail) {
      const errorMessage = result.error?.message ?? "对账单详情 API 返回错误。";
      setStatementReadMeta((current) => ({
        ...current,
        detailSource: result.source,
        detailLoading: false,
        detailError: errorMessage,
      }));
      return withFeedback(result, showToast, `刷新对账单详情失败：${errorMessage}`);
    }

    setStatements((current) => {
      const exists = current.some((item) => item.id === result.detail.id);
      return exists
        ? current.map((item) => (item.id === result.detail.id ? { ...item, ...result.detail } : item))
        : [result.detail, ...current];
    });
    setStatementReadMeta((current) => ({
      ...current,
      detailSource: result.source,
      detailLoading: false,
      detailError: result.error?.message ?? "",
      detailLastSyncedAt: formatSyncTime(),
    }));
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(result, showToast, `对账单详情已通过${sourceLabel}刷新：${result.detail.id}。`);
  }

  return { refreshStatementDetail, refreshStatements };
}

export function useOfficeStatementReads(options) {
  const actions = createOfficeStatementReadActions(options);
  const { authState, currentUserId, selectedStatementIdRef, serverRequired, statementsRef } = options;
  return {
    refreshStatements: useCallback(actions.refreshStatements, [
      authState,
      currentUserId,
      selectedStatementIdRef,
      serverRequired,
      statementsRef,
    ]),
    refreshStatementDetail: useCallback(actions.refreshStatementDetail, [
      authState,
      currentUserId,
      selectedStatementIdRef,
      serverRequired,
      statementsRef,
    ]),
  };
}
