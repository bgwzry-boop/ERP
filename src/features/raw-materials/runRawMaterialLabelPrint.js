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

// Resolves true after the print preview closes, false if the browser never
// opened it. The frame is created during the click (before any await) so the
// later print still belongs to that gesture; the confirm dialog waits until
// afterprint so it cannot cover or cancel the preview.
export function printRawMaterialLabelFrame(frame, sheetHtml) {
  const iframe = frame || createRawMaterialLabelPrintFrame();
  if (!iframe?.contentDocument || !iframe.contentWindow) {
    iframe?.remove?.();
    return Promise.resolve(false);
  }
  const win = iframe.contentWindow;
  return new Promise((resolve) => {
    let opened = false;
    let settled = false;
    let fallback;
    const beforePrint = () => { opened = true; };
    const afterPrint = () => finish(opened);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      win.removeEventListener("beforeprint", beforePrint);
      win.removeEventListener("afterprint", afterPrint);
      if (fallback !== undefined) clearTimeout(fallback);
      iframe.remove();
      resolve(result);
    };
    // Blocking print implementations dispatch afterprint before print() returns.
    // Install both listeners first so closing the dialog cannot be missed.
    win.addEventListener("beforeprint", beforePrint);
    win.addEventListener("afterprint", afterPrint);
    try {
      iframe.contentDocument.open();
      iframe.contentDocument.write(buildRawMaterialLabelPrintDocument(sheetHtml));
      iframe.contentDocument.close();
      win.focus();
      win.print();
      if (settled) return;
      if (!opened) finish(false);
      else fallback = setTimeout(() => finish(true), 120000);
    } catch {
      finish(false);
    }
  });
}
