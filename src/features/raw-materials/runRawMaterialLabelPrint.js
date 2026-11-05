import { buildRawMaterialLabelPrintDocument } from "../../domain/rawMaterialLabelPrintDocument.js";

const FRAME_STYLE = "position:fixed;left:0;top:0;width:76mm;height:130mm;border:0;opacity:0;pointer-events:none;";

export function createRawMaterialLabelPrintFrame() {
  if (typeof document === "undefined" || !document.body) return null;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "卷料标签打印";
  iframe.style.cssText = FRAME_STYLE;
  document.body.appendChild(iframe);
  return iframe;
}

export function isRawMaterialLabelPrintFrame(value) {
  return Boolean(value && typeof value.contentWindow?.print === "function" && typeof value.remove === "function");
}

const PRINT_OPEN_GRACE_MS = 400;
const PRINT_CLOSE_FALLBACK_MS = 120000;

// Resolves true after the print preview closes, false if the browser never
// opened it. The frame is created during the click (before any await) so the
// later print still belongs to that gesture; the confirm dialog waits until
// the preview closes so it cannot cover or cancel that preview.
// Cancelling the dialog is not a failure to open: Chrome often delivers only
// afterprint, and sometimes delivers it on the parent window instead of the
// hidden label frame.
export function printRawMaterialLabelFrame(frame, sheetHtml) {
  const iframe = frame || createRawMaterialLabelPrintFrame();
  if (!iframe?.contentDocument || !iframe.contentWindow) {
    iframe?.remove?.();
    return Promise.resolve(false);
  }
  const win = iframe.contentWindow;
  const parentWin = iframe.ownerDocument?.defaultView;
  const targets = parentWin && parentWin !== win ? [win, parentWin] : [win];
  return new Promise((resolve) => {
    let opened = false;
    let settled = false;
    let fallback;
    const rememberOpen = () => {
      opened = true;
      if (settled || fallback === undefined) return;
      clearTimeout(fallback);
      fallback = setTimeout(() => finish(true), PRINT_CLOSE_FALLBACK_MS);
    };
    const beforePrint = () => rememberOpen();
    const afterPrint = () => finish(true);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      for (const target of targets) {
        target.removeEventListener("beforeprint", beforePrint);
        target.removeEventListener("afterprint", afterPrint);
      }
      if (fallback !== undefined) clearTimeout(fallback);
      iframe.remove();
      resolve(result);
    };
    // Blocking print implementations dispatch afterprint before print() returns.
    // Install both listeners first so closing the dialog cannot be missed.
    for (const target of targets) {
      target.addEventListener("beforeprint", beforePrint);
      target.addEventListener("afterprint", afterPrint);
    }
    try {
      iframe.contentDocument.open();
      iframe.contentDocument.write(buildRawMaterialLabelPrintDocument(sheetHtml));
      iframe.contentDocument.close();
      win.focus();
      win.print();
      if (settled) return;
      fallback = setTimeout(() => finish(opened), opened ? PRINT_CLOSE_FALLBACK_MS : PRINT_OPEN_GRACE_MS);
    } catch {
      finish(false);
    }
  });
}
