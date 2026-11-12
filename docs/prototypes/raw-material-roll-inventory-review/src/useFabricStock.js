// 负责人 2026-11-08：开单时提醒这单要用多少布。卷料库存只读一次，按"谁在看"（登录身份）区分。
// 请求归属和"正在读"是两回事：loading 由"结果是不是当前身份、当前这次读的"推出来，
// 不放进 effect 依赖里，否则把状态设成读取中会取消自己那次请求，一直卡在"正在看卷料库存…"。
import { useCallback, useEffect, useState } from "react";
import { listOfficeRawMaterialStockInbounds } from "../../../../src/services/officeRawMaterialStockApiClient.js";

/**
 * @returns {{ status: "idle"|"loading"|"ready"|"failed", items: Array|null, retry: () => void }}
 */
export function useFabricStock(wanted, { authState, operatorId } = {}, { read = listOfficeRawMaterialStockInbounds } = {}) {
  const owner = `${authState?.session?.accessToken ?? ""}|${authState?.session?.userId ?? ""}|${operatorId ?? ""}`;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null); // { owner, attempt, items | null }
  useEffect(() => {
    if (!wanted) return undefined;
    let active = true;
    Promise.resolve()
      .then(() => read({ authState, operatorId }, { serverRequired: true }))
      .then((response) => {
        if (active) setResult({ owner, attempt, items: response?.source === "api" && Array.isArray(response.items) ? response.items : null });
      })
      .catch(() => { if (active) setResult({ owner, attempt, items: null }); });
    return () => { active = false; };
    // authState / operatorId 的变化都体现在 owner 里。
  }, [wanted, owner, attempt, read]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  if (!wanted) return { status: "idle", items: null, retry };
  const current = result && result.owner === owner && result.attempt === attempt ? result : null;
  if (!current) return { status: "loading", items: null, retry };
  return { status: current.items ? "ready" : "failed", items: current.items, retry };
}
