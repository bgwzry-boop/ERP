// 备货小票：在一个隐藏的 iframe 里打开小票，调浏览器打印（选标签打印机，80×100mm）。
// 返回 true 表示打印窗口打开过；用户取消也算打开过，由用户自己看打印机。
export function printStockPickingSlip(html, { documentRef = globalThis.document, timeoutMs = 120000 } = {}) {
  if (!html || !documentRef?.body) return Promise.resolve(false);
  const frame = documentRef.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = "备货小票";
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", visibility: "hidden" });
  documentRef.body.appendChild(frame);
  const win = frame.contentWindow;
  if (!win || !frame.contentDocument) { frame.remove(); return Promise.resolve(false); }
  return new Promise((resolve) => {
    let opened = false;
    let settled = false;
    let fallback;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      win.removeEventListener("beforeprint", before);
      win.removeEventListener("afterprint", after);
      if (fallback !== undefined) clearTimeout(fallback);
      frame.remove();
      resolve(result);
    };
    const before = () => { opened = true; };
    const after = () => finish(true);
    win.addEventListener("beforeprint", before);
    win.addEventListener("afterprint", after);
    try {
      frame.contentDocument.open();
      frame.contentDocument.write(html);
      frame.contentDocument.close();
      win.focus();
      win.print();
      if (settled) return;
      if (!opened) finish(false);
      else fallback = setTimeout(() => finish(true), timeoutMs);
    } catch {
      finish(false);
    }
  });
}
