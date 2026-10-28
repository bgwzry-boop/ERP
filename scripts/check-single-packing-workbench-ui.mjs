import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

// Browser-only synthetic HTTP responses. The core-business test separately
// exercises the real signed /packing-tasks/:id/complete command and printing.
const origin = "http://single-packing.invalid";
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: "jsx", contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {SinglePackingWorkbench} from './src/features/packing/SinglePackingWorkbench.jsx';
    const root=createRoot(document.getElementById('app'));
    window.draw=({task='PKT-CUSTOM',line='OL-CUSTOM',token='signed-A',permissions=['packing.complete']}={})=>
      root.render(<SinglePackingWorkbench authState={{session:{accessToken:token},permissions:{user:{userId:token},actionPermissions:permissions}}}
        packingTaskId={task} orderLineId={line} onSaved={()=>window.saved++}/>);
    window.remount=async()=>{root.render(null);await new Promise(r=>setTimeout(r,20));window.draw();};
    window.saved=0;window.draw();` },
  bundle: true, write: false, outfile: "panel.js", jsx: "automatic",
  define: { "import.meta.env": '{"VITE_ERP_API_BASE_URL":"/api"}', "process.env.NODE_ENV": '"test"' },
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [], writes = [];
  page.on("pageerror", error => errors.push(error.message));
  const detail = { packingTaskId: "PKT-CUSTOM", orderLineId: "OL-CUSTOM", packingTask: { status: "待打包", plannedQty: 12 },
    orderLine: { orderType: "custom", size: "30*38*10", color: "白色" }, fulfillment: { fulfillmentId: "F-CUSTOM" }, packages: [] };
  let mode = "uncertain", readMode = "normal";
  await page.route(`${origin}/`, route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial,sans-serif}*{box-sizing:border-box}</style><div id="app"></div></html>' }));
  await page.route(`${origin}/api/**`, async route => {
    const request = route.request();
    assert.match(request.headers().authorization, /^Bearer signed-/);
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") {
      const data = readMode === "stock" ? { ...detail, orderLine: { ...detail.orderLine, orderType: "stock" } }
        : readMode === "mismatch" ? { ...detail, orderLineId: "OTHER" } : detail;
      await route.fulfill({ json: data }); return;
    }
    assert.equal(path, "/api/packing-tasks/PKT-CUSTOM/complete", "custom must never use /packing-groups");
    const body = request.postDataJSON();
    writes.push({ body, key: request.headers()["idempotency-key"] });
    if (mode === "reject") { await route.fulfill({ status: 403, json: { message: "合成权限拒绝" } }); return; }
    if (writes.length === 1) { await route.fulfill({ json: {} }); return; }
    if (writes.length === 2) { await route.fulfill({ status: 409, json: { message: "合成网关冲突" } }); return; }
    await route.fulfill({ json: { operationLogId: "LOG-CUSTOM", packingTaskId: body.packingTaskId, orderLineId: body.orderLineId,
      fulfillmentId: body.fulfillmentId, actualPackedQty: body.actualPackedQty, packageIds: ["PKG-CUSTOM-1", "PKG-CUSTOM-2"], status: "已完成", inventoryDeducted: false } });
  });
  await page.goto(origin);
  await page.addStyleTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".css")).text });
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
  const panel = page.getByRole("region", { name: "定制单独打包登记" });
  const prepare = panel.getByRole("button", { name: "核对并登记本明细包裹", exact: true });
  const confirm = panel.getByRole("button", { name: "确认保存 / 原请求重试", exact: true });
  async function fill() {
    await panel.getByLabel("实际包数", { exact: true }).fill("2");
    await panel.getByRole("button", { name: "生成逐包核对表", exact: true }).click();
    await panel.getByLabel("每包数量", { exact: true }).fill("6");
    await panel.getByRole("button", { name: "每包填入此数量", exact: true }).click();
    await expect(prepare).toBeDisabled();
    for (const box of await panel.getByRole("checkbox").all()) await box.check();
    await expect(prepare).toBeDisabled();
    await panel.getByLabel("登记依据", { exact: true }).fill("隔离测试：实物两包每包6个");
    await expect(prepare).toBeEnabled();
  }
  await fill(); await prepare.click();
  assert.equal(writes.length, 0, "preparing a summary is not a write");
  await expect(panel.getByRole("region", { name: "确认本明细单独打包" })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(prepare).toBeFocused();
  await prepare.click(); await confirm.click();
  await expect(panel.getByRole("status")).toContainText("回执不完整");
  await expect(panel.getByRole("button", { name: "返回修改", exact: true })).toBeDisabled();
  await page.evaluate(() => window.remount());
  await expect(panel.getByRole("status")).toContainText("已恢复未确认结果的原请求");
  await confirm.click(); await expect(panel.getByRole("status")).toContainText("合成网关冲突");
  await expect(panel.getByRole("button", { name: "返回修改", exact: true })).toBeDisabled();
  await confirm.click(); await expect(panel.getByRole("status")).toContainText("2 个包裹已保存");
  assert.equal(writes.length, 3); assert.equal(new Set(writes.map(item => item.key)).size, 1);
  assert.deepEqual(writes[0].body, writes[1].body); assert.deepEqual(writes[1].body, writes[2].body);
  assert.deepEqual(writes[0].body.packages, [{ packedQty: 6, orderLineId: "OL-CUSTOM" }, { packedQty: 6, orderLineId: "OL-CUSTOM" }]);
  assert.equal(await page.evaluate(() => window.saved), 1);
  mode = "reject";
  await panel.getByRole("button", { name: "刷新本明细", exact: true }).click(); await fill(); await prepare.click(); await confirm.click();
  await expect(panel.getByRole("status")).toContainText("合成权限拒绝");
  await expect(panel.getByLabel("登记依据", { exact: true })).toHaveValue("隔离测试：实物两包每包6个");
  await expect(prepare).toBeEnabled();
  await page.evaluate(() => window.draw({ token: "signed-B", permissions: [] }));
  await expect(prepare).toBeDisabled();
  readMode = "stock"; await page.evaluate(() => window.draw({ token: "signed-C" }));
  await expect(panel.getByRole("status")).toContainText("通货请使用混装入口");
  await expect(prepare).toHaveCount(0);
  readMode = "mismatch"; await page.evaluate(() => window.draw({ token: "signed-D" }));
  await expect(panel.getByRole("status")).toContainText("任务与本明细不符");
  await expect(prepare).toHaveCount(0);
  readMode = "normal"; await page.evaluate(() => window.draw({ token: "signed-E" })); await fill();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mkdir(".erp-local-storage/e2e/single-packing", { recursive: true });
  await page.screenshot({ path: ".erp-local-storage/e2e/single-packing/phone.png", fullPage: true });
  await page.setViewportSize({ width: 1100, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log("PASS custom single packing: exact summary, no premature write, physical per-package checks, signed HTTP, lost-receipt/remount/conflict same-key retry, definitive rejection preserves input, role/task isolation, no mixed endpoint, mobile/desktop no overflow.");
} finally { await browser.close(); }
