// 负责人 2026-11-08：送货单/自提单用办公室电脑上的针式打印机打（驱动已在办公室装好）。
// 网页取服务器生成的 PDF，放进隐藏框里调浏览器打印；几样货合成一张。
// 打完由办公室在屏幕中间确认「三联单打出来了吗？」，确认了才记已打印，库房才能出货。
import { confirmInApp } from "../../shared/ui/confirmDialog.js";
import { createOfficeIdempotencyKey } from "../../services/officeApiClientCore.js";
import { confirmOfficeBrowserPrint, fetchOfficeNotePdf } from "../../services/officePrintJobApiClient.js";

export const NOTE_PRINT_GRACE_MS = 1500;
export const NOTE_PRINT_CLOSE_FALLBACK_MS = 120000;

/** Prints a PDF blob through a hidden frame. Resolves true once the browser handled the print. */
export function printPdfBlob(blob, { documentRef = typeof document === "undefined" ? null : document } = {}) {
  if (!documentRef?.body || !blob) return Promise.resolve(false);
  const url = URL.createObjectURL(blob);
  const iframe = documentRef.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "送货单/自提单打印";
  iframe.style.cssText = "position:fixed;left:0;top:0;width:241mm;height:140mm;border:0;opacity:0;pointer-events:none;";
  return new Promise((resolve) => {
    let settled = false;
    let opened = false;
    let fallback;
    const parentWin = documentRef.defaultView;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(fallback);
      for (const target of [iframe.contentWindow, parentWin].filter(Boolean)) {
        target.removeEventListener?.("beforeprint", beforePrint);
        target.removeEventListener?.("afterprint", afterPrint);
      }
      // 留一会儿再拆，避免打印对话框还在读文件。
      setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 1000);
      resolve(result);
    };
    const beforePrint = () => {
      opened = true;
      clearTimeout(fallback);
      fallback = setTimeout(() => finish(true), NOTE_PRINT_CLOSE_FALLBACK_MS);
    };
    const afterPrint = () => finish(true);
    iframe.onload = () => {
      const win = iframe.contentWindow;
      try {
        for (const target of [win, parentWin].filter(Boolean)) {
          target.addEventListener?.("beforeprint", beforePrint);
          target.addEventListener?.("afterprint", afterPrint);
        }
        win.focus();
        win.print();
        if (!settled) fallback = setTimeout(() => finish(true), opened ? NOTE_PRINT_CLOSE_FALLBACK_MS : NOTE_PRINT_GRACE_MS);
      } catch {
        finish(false);
      }
    };
    iframe.src = url;
    documentRef.body.appendChild(iframe);
  });
}

/**
 * Prints the given note print jobs as one sheet and asks the office whether it came out.
 * Returns { printed: boolean, message: string }.
 */
export async function printNotesInBrowser({ printJobIds, authState, operatorId, sheetCount = 1 }) {
  const ids = [...new Set((printJobIds ?? []).filter(Boolean))];
  const pdf = await fetchOfficeNotePdf({ printJobIds: ids, authState, operatorId }, { serverRequired: true });
  if (pdf.blocked) return { printed: false, message: pdf.error?.message || "单据生成失败，请重试。" };
  const opened = await printPdfBlob(pdf.blob);
  if (!opened) return { printed: false, message: "打印窗口没有打开，请再点一次打印。" };
  const ok = await confirmInApp({
    title: "确认打印结果",
    message: `请看针式打印机：${sheetCount > 1 ? `这 ${sheetCount} 样货合在一张` : "这张"}三联单打出来了吗？\n没出来就点「取消」，系统不会记成已打印，可以再打一次。`,
    confirmLabel: "已打印",
    cancelLabel: "取消",
  });
  if (!ok) return { printed: false, message: "没有确认打印，单子还是待打印。打出来以后再点打印确认。" };
  for (const printJobId of ids) {
    const result = await confirmOfficeBrowserPrint({ printJobId, authState, operatorId, idempotencyKey: createOfficeIdempotencyKey() }, { serverRequired: true });
    if (result.blocked) return { printed: false, message: result.error?.message || "确认已打印没有保存，请重试。" };
  }
  return { printed: true, message: "已打印，可以交库房出货。" };
}
