export const DEFAULT_OFFICE_REQUEST_TIMEOUT_MS = 15_000;

export function createOfficeRequestAbort({ signal: externalSignal, timeoutMs } = {}) {
  const controller = new AbortController();
  const abort = (reason) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };
  const onExternalAbort = () => abort({ code: "REQUEST_ABORTED" });
  if (externalSignal) {
    if (externalSignal.aborted) onExternalAbort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  const resolvedTimeoutMs = normalizeOfficeRequestTimeout(timeoutMs);
  const timeoutId = resolvedTimeoutMs
    ? setTimeout(() => abort({ code: "REQUEST_TIMEOUT", timeoutMs: resolvedTimeoutMs }), resolvedTimeoutMs)
    : null;
  return {
    signal: controller.signal,
    get reason() {
      return controller.signal.reason;
    },
    dispose() {
      if (timeoutId) clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

export function createOfficeRequestAbortError(reason, cause) {
  const isTimeout = reason?.code === "REQUEST_TIMEOUT";
  const error = new Error(
    isTimeout
      ? `请求超过 ${Number(reason?.timeoutMs) || DEFAULT_OFFICE_REQUEST_TIMEOUT_MS}ms，已停止等待。`
      : "请求已取消。",
  );
  error.name = isTimeout ? "OfficeApiTimeoutError" : "OfficeApiAbortError";
  error.code = isTimeout ? "REQUEST_TIMEOUT" : "REQUEST_ABORTED";
  error.cause = cause;
  return error;
}

export function isOfficeRequestAbort(error) {
  return error?.code === "REQUEST_ABORTED" || error?.code === "REQUEST_TIMEOUT";
}

function normalizeOfficeRequestTimeout(value) {
  if (value === 0 || value === false) return 0;
  const timeout = Number(value ?? DEFAULT_OFFICE_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(timeout) || timeout <= 0) return DEFAULT_OFFICE_REQUEST_TIMEOUT_MS;
  return Math.floor(timeout);
}
