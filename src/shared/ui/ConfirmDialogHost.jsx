import { useEffect, useRef, useState } from "react";
import { registerConfirmDialogHost, resolveCurrentConfirmDialog } from "./confirmDialog.js";

// 应用内确认框的显示层，挂在 App 根部一次即可。
// 键盘：打开时焦点在“取消”上（误按回车不会执行高风险操作），Esc 取消，Tab 在两个按钮间循环。
export function ConfirmDialogHost() {
  const [request, setRequest] = useState(null);
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(
    () =>
      registerConfirmDialogHost({
        show(nextRequest) {
          if (!restoreFocusRef.current) restoreFocusRef.current = globalThis.document?.activeElement ?? null;
          setRequest(nextRequest);
        },
        hide() {
          setRequest(null);
          const previous = restoreFocusRef.current;
          restoreFocusRef.current = null;
          if (previous && typeof previous.focus === "function") previous.focus();
        },
      }),
    [],
  );

  useEffect(() => {
    if (request) cancelRef.current?.focus();
  }, [request]);

  if (!request) return null;

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      resolveCurrentConfirmDialog(false);
      return;
    }
    if (event.key === "Tab") {
      const focusables = [cancelRef.current, confirmRef.current].filter(Boolean);
      const index = focusables.indexOf(globalThis.document?.activeElement);
      event.preventDefault();
      const nextIndex = event.shiftKey ? (index <= 0 ? focusables.length - 1 : index - 1) : (index + 1) % focusables.length;
      focusables[nextIndex]?.focus();
    }
  }

  return (
    <div className="modal-backdrop confirm-dialog-backdrop" role="presentation" onKeyDown={handleKeyDown}>
      <section
        className={`modal confirm-dialog ${request.tone === "danger" ? "confirm-dialog-danger" : ""}`.trim()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <div className="modal-title">
          <div>
            <h2 id="confirm-dialog-title">{request.title}</h2>
          </div>
        </div>
        <p id="confirm-dialog-message" className="confirm-dialog-message">
          {request.message}
        </p>
        <div className="modal-actions">
          <button ref={cancelRef} type="button" onClick={() => resolveCurrentConfirmDialog(false)}>
            {request.cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={request.tone === "danger" ? "primary-action confirm-dialog-danger-action" : "primary-action"}
            onClick={() => resolveCurrentConfirmDialog(true)}
          >
            {request.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
