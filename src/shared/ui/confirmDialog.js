// 应用内确认框，用来替代浏览器自带的 window.confirm。
//
// 用法：if (!(await confirmInApp("确认删除当前明细行？"))) return;
//      或 confirmInApp({ title, message, confirmLabel, tone: "danger" })
//
// 页面根部挂一个 <ConfirmDialogHost />（见 App.jsx）负责显示；这里只管排队和结果。
// 一次只显示一个确认框，后来的请求排队等前一个关闭。
// 没有挂载 Host 的环境（例如检查脚本、页面加载早期）回退到 window.confirm，保证不会卡住。

let host = null;
const queue = [];

function normalizeRequest(input) {
  const request = typeof input === "string" ? { message: input } : { ...(input ?? {}) };
  return {
    title: request.title ?? "请确认",
    message: String(request.message ?? ""),
    confirmLabel: request.confirmLabel ?? "确认",
    cancelLabel: request.cancelLabel ?? "取消",
    tone: request.tone === "danger" ? "danger" : "default",
  };
}

function showNext() {
  if (!host || !queue.length) return;
  host.show(queue[0].request);
}

export function confirmInApp(input) {
  const request = normalizeRequest(input);
  if (!host) {
    const nativeConfirm = globalThis.window?.confirm;
    return Promise.resolve(typeof nativeConfirm === "function" ? Boolean(nativeConfirm.call(globalThis.window, request.message)) : false);
  }
  return new Promise((resolve) => {
    queue.push({ request, resolve });
    if (queue.length === 1) showNext();
  });
}

// 由 ConfirmDialogHost 调用。
export function registerConfirmDialogHost(nextHost) {
  host = nextHost;
  showNext();
  return () => {
    if (host !== nextHost) return;
    host = null;
    // Host 被卸载时，未答复的请求一律按“取消”处理，避免调用方永远等待。
    while (queue.length) queue.shift().resolve(false);
  };
}

export function resolveCurrentConfirmDialog(confirmed) {
  const current = queue.shift();
  if (!current) return;
  current.resolve(Boolean(confirmed));
  if (queue.length) showNext();
  else host?.hide();
}
