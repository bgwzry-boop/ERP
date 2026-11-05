// 备货小票：在一个隐藏的 iframe 里打开小票，调浏览器打印（选标签打印机，80×100mm）。
// 返回 true 表示浏览器处理过这次打印（打开过预览，或直接打印了）；false 只在 print() 出错时。
// 用户取消也算处理过，由用户自己看打印机。
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
    const before = () => {
      if (!opened && fallback !== undefined) { clearTimeout(fallback); fallback = setTimeout(() => finish(true), timeoutMs); }
      opened = true;
    };
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
      // 有的电脑（现场 Windows 上的浏览器）直接打印，不发打印事件；print() 没出错就当已经打了。
      if (!opened) fallback = setTimeout(() => finish(true), 1500);
      else fallback = setTimeout(() => finish(true), timeoutMs);
    } catch {
      finish(false);
    }
  });
}
