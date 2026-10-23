import { useEffect, useRef } from "react";

export function ReviewDialog({ children, className = "", labelledBy, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return <dialog
    aria-labelledby={labelledBy}
    className={`review-modal ${className}`}
    onCancel={(event) => { event.preventDefault(); onClose?.(); }}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current.querySelectorAll(
        'summary, a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);
      const index = controls.indexOf(document.activeElement);
      if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === controls.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
      }
    }}
    onMouseDown={(event) => {
      if (event.target !== dialogRef.current) return;
      const bounds = dialogRef.current.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
        event.preventDefault();
        onClose?.();
      }
    }}
    ref={dialogRef}
  >{children}</dialog>;
}
