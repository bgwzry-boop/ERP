import { useEffect, useRef } from "react";

export function BusinessWriteConflictDialog({ open, error, onRefresh, onBack }) {
  const backRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    backRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onBack?.();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onBack]);
  if (!open) return null;
  return (
    <div className="business-conflict-backdrop" role="presentation">
      <section className="business-conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="business-conflict-title">
        <div className="business-conflict-dialog__mark" aria-hidden="true">!</div>
        <div>
          <h2 id="business-conflict-title">已被另一位办公室人员更新</h2>
          <p>{error?.message || "该单据版本已变化。当前填写内容已保留，系统没有自动重试或覆盖。"}</p>
          {error?.currentRevision ? <p className="business-conflict-dialog__meta">服务器当前版本：{error.currentRevision}</p> : null}
        </div>
        <div className="business-conflict-dialog__actions">
          <button ref={backRef} type="button" onClick={onBack}>返回检查</button>
          <button className="primary" type="button" onClick={onRefresh}>刷新最新版本</button>
        </div>
      </section>
    </div>
  );
}
