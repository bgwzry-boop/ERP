// 换单确认框的键盘契约：打开聚焦安全项「继续核对」，提交中 Esc 不得关闭，
// 全部按钮禁用时 Tab 仍留在弹窗内（焦点到容器，不落回背景）。
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const entry = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DraftExitDecision } from "./src/features/raw-materials/RawMaterialMobileOcrReview.jsx";
function Harness() {
  const [mode, setMode] = useState(window.__mode || "idle");
  const [log, setLog] = useState([]);
  window.__setMode = setMode;
  window.__log = log;
  const record = (name) => setLog((items) => [...items, name]);
  return <DraftExitDecision
    discarding={mode === "discarding"}
    discardDisabled={mode === "busy"}
    onContinue={() => record("continue")}
    onDiscard={() => record("discard")}
    onKeep={() => record("keep")}
  />;
}
createRoot(document.getElementById("root")).render(<Harness />);
`;
const bundle = await build({
  absWorkingDir: root,
  stdin: { contents: entry, resolveDir: root, loader: "jsx", sourcefile: "draft-exit-fixture.jsx" },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  define: { "import.meta.env": "{}" }, loader: { ".css": "empty", ".jpg": "dataurl", ".png": "dataurl", ".svg": "dataurl" },
});

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent('<div id="root"></div><button id="background">背景按钮</button>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole("dialog").waitFor({ timeout: 15000 });

  // 1) 打开后焦点在安全项「继续核对」，不是「放弃」
  const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
  assert.equal(focusedText, "继续核对", `初始焦点必须是继续核对，实际是「${focusedText}」`);

  // 2) 提交中 Esc 不得关闭，也不得触发 onContinue
  await page.evaluate(() => window.__setMode("discarding"));
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  assert.equal(await page.getByRole("dialog").count(), 1, "提交中 Esc 不得关闭弹窗");
  assert.deepEqual(await page.evaluate(() => window.__log), [], "提交中 Esc 不得触发任何离开动作");

  // 3) 提交中 Tab 必须留在弹窗内（全部按钮禁用 -> 焦点到容器）
  await page.locator("#background").focus();
  await page.keyboard.press("Tab");
  await page.waitForTimeout(100);
  const insideDialog = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  assert.equal(insideDialog, true, "Tab 不得把焦点放回背景页面");

  // 4) 正常态 Esc = 继续核对（保留三种选择，不触发放弃/作废）
  await page.evaluate(() => window.__setMode("idle"));
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(() => window.__log), ["continue"], "正常态 Esc 只应触发继续核对");
  assert.deepEqual(errors, [], `不得有页面错误: ${JSON.stringify(errors)}`);
  console.log("Mobile draft-exit dialog keyboard checks passed: safe focus, busy Esc blocked, Tab contained, idle Esc continues.");
} finally {
  await browser.close();
}
