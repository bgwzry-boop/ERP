import { useEffect, useRef, useState } from "react";

// One in-flight operation per mounted identity; late results from a closed or
// replaced dialog never refresh the next customer's screen.
export function useFinanceDialogAction(onBusyChange) {
  const active = useRef(null);
  const live = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; active.current?.abort(); };
  }, []);
  async function run(operation) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError(""); setConflict(false); onBusyChange?.(true);
    try {
      await operation(controller.signal, () => live.current && !controller.signal.aborted);
    } catch (cause) {
      if (live.current && !controller.signal.aborted) {
        setError(cause?.message || "操作未完成，请核对后重试。");
        setConflict(cause?.status === 409);
      }
    } finally {
      if (active.current === controller) active.current = null;
      if (live.current) { setBusy(false); onBusyChange?.(false); }
    }
  }
  return { busy, error, conflict, run, setError, resetError() { setError(""); setConflict(false); } };
}

export function requireApiResult(result, valid) {
  if (result?.source !== "api" || result.blocked || !valid(result)) {
    const error = new Error(result?.error?.message || "未收到服务器确认。请先刷新核对记录；重试会沿用本次请求，避免重复登记。");
    error.status = result?.error?.status;
    throw error;
  }
  return result;
}
