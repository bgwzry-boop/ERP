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

// Resolves true once the browser has handled the print (preview closed, or printed straight
// away), false if print() itself failed. Whether labels really came out is always asked
// afterwards (「都出来了吗？」), so a printer that prints silently must not be reported as
// "window not opened". The frame is created during the click (before any await) so the
// later print still belongs to that gesture; the confirm dialog waits until afterprint so
// it cannot cover or cancel the preview.
//
// 负责人 2026-11-05：现场 Windows 电脑上标签实际打出来了，但浏览器没发 beforeprint/afterprint 事件，
// 页面却提示「打印窗口没有打开」。现在 print() 没出错就再等一小会儿：等到事件就照常等预览关闭；
// 等不到就当已经打了，交给后面的确认框由人确认。
export const SILENT_PRINT_GRACE_MS = 1500;
export const PRINT_PREVIEW_TIMEOUT_MS = 120000;

export function printRawMaterialLabelFrame(frame, sheetHtml) {
  const iframe = frame || createRawMaterialLabelPrintFrame();
  if (!iframe?.contentDocument || !iframe.contentWindow) {
    iframe?.remove?.();
    return Promise.resolve(false);
  }
  const win = iframe.contentWindow;
  return new Promise((resolve) => {
    let settled = false;
    let printing = false;
    let fallback;
    let grace;
    const waitForPreview = () => {
      if (grace !== undefined) { clearTimeout(grace); grace = undefined; }
      if (fallback === undefined) fallback = setTimeout(() => finish(true), PRINT_PREVIEW_TIMEOUT_MS);
    };
    const beforePrint = () => { if (printing) waitForPreview(); };
    const afterPrint = () => finish(true);
    let opened = false;
    const markOpened = () => { opened = true; beforePrint(); };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      win.removeEventListener("beforeprint", markOpened);
      win.removeEventListener("afterprint", afterPrint);
      if (fallback !== undefined) clearTimeout(fallback);
      if (grace !== undefined) clearTimeout(grace);
      iframe.remove();
      resolve(result);
    };
    // Blocking print implementations dispatch afterprint before print() returns.
    // Install both listeners first so closing the dialog cannot be missed.
    win.addEventListener("beforeprint", markOpened);
    win.addEventListener("afterprint", afterPrint);
    try {
      iframe.contentDocument.open();
      iframe.contentDocument.write(buildRawMaterialLabelPrintDocument(sheetHtml));
      iframe.contentDocument.close();
      win.focus();
      win.print();
      if (settled) return;
      printing = true;
      if (opened) waitForPreview();
      else grace = setTimeout(() => finish(true), SILENT_PRINT_GRACE_MS);
    } catch {
      finish(false);
    }
  });
}
