import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  confirmInApp,
  registerConfirmDialogHost,
  resolveCurrentConfirmDialog,
} from "../src/shared/ui/confirmDialog.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// 1. 没有挂载 Host 时回退到 window.confirm，且传入的是纯文本消息
{
  const asked = [];
  globalThis.window = { confirm: (message) => { asked.push(message); return true; } };
  assert.equal(await confirmInApp({ message: "回退测试", tone: "danger" }), true);
  assert.deepEqual(asked, ["回退测试"]);
  globalThis.window = {};
  assert.equal(await confirmInApp("没有任何确认能力时按取消处理"), false);
  delete globalThis.window;
}

// 2. 挂载 Host 后：按顺序一次显示一个，结果按各自的答复返回
{
  const shown = [];
  let hidden = 0;
  const unregister = registerConfirmDialogHost({ show: (request) => shown.push(request), hide: () => { hidden += 1; } });
  const first = confirmInApp("第一个");
  const second = confirmInApp({ title: "危险操作", message: "第二个", confirmLabel: "删除", tone: "danger" });
  assert.equal(shown.length, 1, "同一时间只显示一个确认框");
  assert.deepEqual(shown[0], { title: "请确认", message: "第一个", confirmLabel: "确认", cancelLabel: "取消", tone: "default" });
  resolveCurrentConfirmDialog(true);
  assert.equal(await first, true);
  assert.equal(shown.length, 2, "前一个答复后显示下一个");
  assert.equal(shown[1].tone, "danger");
  assert.equal(shown[1].confirmLabel, "删除");
  resolveCurrentConfirmDialog(false);
  assert.equal(await second, false);
  assert.equal(hidden, 1, "队列清空后关闭");

  // 3. Host 卸载时，未答复的请求按取消处理，调用方不会永远等待
  const pending = confirmInApp("卸载前未答复");
  unregister();
  assert.equal(await pending, false);
}

// 4. 业务代码中不得再直接使用浏览器原生 confirm
function listSource(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSource(full);
    return /\.(jsx?|mjs)$/.test(entry.name) ? [full] : [];
  });
}
const nativeConfirmUses = listSource(join(repoRoot, "src"))
  .filter((file) => !file.endsWith(join("shared", "ui", "confirmDialog.js")))
  .filter((file) => /window\.confirm\s*\(/.test(readFileSync(file, "utf8")))
  .map((file) => relative(repoRoot, file));
assert.deepEqual(nativeConfirmUses, [], "请改用 confirmInApp（src/shared/ui/confirmDialog.js）");

console.log("Confirm dialog check passed: native fallback, one-at-a-time queue, unmount cancellation, and no direct window.confirm in src.");
