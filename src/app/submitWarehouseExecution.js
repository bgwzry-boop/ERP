// Loaded only for a warehouse write, keeping routine office startup unchanged.
export async function submitWarehouseExecution({ request, onConfirm, mounted, pending, setSubmitting, setError, setUncertain, reset }) {
  try {
    const result = await onConfirm(request);
    if (!mounted.current) return;
    if (result?.source !== "api" || result.blocked) {
      setError(result?.error?.message || "结果尚未确认，请重试本次登记；原内容已保留。");
      if (result?.error?.status && result.error.status < 500) { reset(); setUncertain(false); }
      else setUncertain(true);
    }
  } catch {
    if (mounted.current) { setUncertain(true); setError("结果尚未确认，请重试本次登记；原内容已保留。"); }
  } finally { pending.current = false; if (mounted.current) setSubmitting(false); }
}
