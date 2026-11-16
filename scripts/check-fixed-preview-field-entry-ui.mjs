import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createApiServer } from "../server/apiServer.mjs";
import { loadSeedWorkspace } from "../server/seedData.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { listenTestServer, closeTestServer, getTestServerBaseUrl } from "./helpers/apiIntegrationTestHarness.mjs";

// Complete real App, signed fixture API and authoritative published task reads.
// Every business write is rejected by the browser; no running preview or live API is used.
const storage = await mkdtemp(join(tmpdir(), "erp-field-preview-"));
const state = loadSeedWorkspace({ runtimeMode: "test", source: "synthetic" });
const line = { id: "OL-FIELD-PREVIEW", orderLineId: "OL-FIELD-PREVIEW", customerId: "C-FIELD-NOT-CACHED", customerName: "隔离报工客户", product: "空白袋", productName: "空白袋",
  orderType: "stock", size: "30*37*10", color: "红色", bagColor: "红色", handle: "普通提", style: "空白袋", print: "否",
  qty: 500, originalQty: 500, status: "制袋已排产", lineStatus: "制袋已排产", fulfillment: "送货", revision: 1 };
state.orderLines = [line];
state.inventories = [];
state.productionTasks = [{ productionTaskId: "PT-FIELD-PREVIEW", id: "PT-FIELD-PREVIEW", orderLineId: line.id,
  taskType: "制袋", machineId: "BAG-01", plannedQty: 500, taskStatus: "制袋已排产", status: "制袋已排产",
  publishedScheduleId: "SCH-FIELD-PREVIEW", revision: 1 }];
state.productionScheduleRecords = [{ id: "SCH-FIELD-PREVIEW", productionTaskId: "PT-FIELD-PREVIEW", machineId: "BAG-01", status: "已发布" }];
state.packingTasks = []; state.fulfillments = []; state.workshopReports = [];
const server = createApiServer(withLocalRepositoryFixture({ runtimeMode: "test", runtimeStorageRoot: storage, seedSource: "synthetic",
  applyProductionEnvFile: false, authMode: "prototype", authSecret: randomBytes(32).toString("hex"),
  fixedPreviewUserId: "U-MANAGER-A", allowLegacyIdentityHeaders: false, allowActionPermissionOverride: false,
  allowDefaultSeedUser: false, phoneRegistrationEnabled: false,
  coreWorkspaceReadRepository: { kind: "local_memory", loadState: async () => structuredClone(state) },
}));
let browser;
try {
  await server.ready; await listenTestServer(server);
  const apiOrigin = getTestServerBaseUrl(server), origin = "http://field-preview.invalid";
  browser = await chromium.launch();
  for (const scenario of ["staging", "denied", "production"]) {
    const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "jsx", contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {App} from './src/App.jsx';
      import './src/styles/tokens.css'; import './src/styles/semantic-tags.css';
      import './src/styles/base.css'; import './src/styles/shared.css'; import './src/styles/shell.css';
      import './src/styles/components.css'; import './src/styles/features/mobile-roles.css';
      import './src/styles/features/raw-material.css'; import './src/styles/features/role-tools.css';
      import './src/styles/features/production-print.css'; import './src/styles/interface-polish.css';
      createRoot(document.getElementById('root')).render(<App signedPreviewUserId="U-MANAGER-A"/>);` },
      bundle: true, write: false, outfile: "app.js", jsx: "automatic", loader: { ".svg": "dataurl", ".png": "dataurl", ".jpg": "dataurl" },
      define: { "process.env.NODE_ENV": '"test"', "import.meta.env": JSON.stringify({ PROD: true,
        VITE_ERP_API_BASE_URL: "/api", VITE_ERP_RUNTIME_MODE: "test", VITE_ERP_STAGING_AUTH_BYPASS: "true",
        VITE_RAW_MATERIAL_FIRST_RELEASE: "false", VITE_ERP_RELEASE_TARGET: scenario === "production" ? "tencent-production" : "staging" }) },
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const reads = [], errors = [], writes = [];
    await context.route(`${origin}/**`, async route => {
      const request = route.request(), url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) {
        if (url.pathname === "/app.js") return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: bundle.outputFiles.find(f => f.path.endsWith(".js")).text });
        if (url.pathname === "/app.css") return route.fulfill({ contentType: "text/css; charset=utf-8", body: bundle.outputFiles.find(f => f.path.endsWith(".css"))?.text || "" });
        return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>' });
      }
      const path = url.pathname;
      if (request.method() !== "GET" && path !== "/api/auth/prototype-login") { writes.push(path); return route.abort(); }
      const headers = { ...request.headers() }; delete headers.host; delete headers["content-length"];
      const response = await fetch(`${apiOrigin}${path}${url.search}`, { method: request.method(), headers,
        ...(request.postDataBuffer() ? { body: request.postDataBuffer() } : {}) });
      let body = await response.text();
      if (path === "/api/auth/prototype-login" && scenario === "denied") {
        const data = JSON.parse(body);
        data.permissions.actionPermissions = data.permissions.actionPermissions.filter(key => !key.startsWith("production.") && !key.startsWith("packing."));
        body = JSON.stringify(data);
      }
      if (path === "/api/production-tasks") reads.push({ status: response.status, signed: /^Bearer /.test(headers.authorization || ""), query: url.search, body: JSON.parse(body) });
      return route.fulfill({ status: response.status, contentType: "application/json", body });
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" && message.text().includes("PageErrorBoundary")) errors.push(message.text()); });
    await page.goto(`${origin}/?fieldPreview=1&signedPreviewMode=true#workshopMobile`);
    try { await expect(page.getByText("内测固定身份", { exact: true })).toBeVisible({ timeout: 15000 }); }
    catch (error) { console.error({ scenario, errors, text: (await page.locator("body").innerText()).slice(0, 1500) }); throw error; }
    const entry = page.getByRole("button", { name: "现场流程测试", exact: true });
    if (scenario === "staging") {
      await expect(entry).toBeVisible(); await entry.click();
      await expect(page.getByRole("heading", { name: "制袋报工", exact: true })).toBeVisible();
      await expect(page.getByText("PT-FIELD-PREVIEW", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "报工完成", exact: true })).toBeEnabled();
      await expect(page.getByText("缺库存键", { exact: true })).toHaveCount(0);
      await expect(page.locator(".workshop-mobile-workbench")).not.toContainText("张三服饰");
      assert.ok(reads.some(read => read.status === 200 && read.signed && read.query.includes("visibility=workshop_mobile")
        && read.body.items.some(item => item.productionTaskId === "PT-FIELD-PREVIEW")), "real signed list must return the published task");
      await mkdir(".erp-local-storage/e2e/fixed-preview-field-entry", { recursive: true });
      await page.screenshot({ path: ".erp-local-storage/e2e/fixed-preview-field-entry/production-phone.png", fullPage: true });
      await expect(page.getByRole("button", { name: "报工完成", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "全部功能", exact: true }).click();
      await expect(page.getByRole("button", { name: /打包任务/ })).toBeVisible();
      await page.getByRole("button", { name: /打包任务/ }).click();
      await expect(page.getByRole("heading", { name: "打包任务", exact: true }).first()).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.screenshot({ path: ".erp-local-storage/e2e/fixed-preview-field-entry/phone.png", fullPage: true });
      await page.getByRole("button", { name: "返回收货", exact: true }).click();
      await expect(page.locator(".raw-material-mobile-camera")).toBeVisible();
    } else {
      await expect(page.locator(".raw-material-mobile-camera")).toBeVisible();
      await expect(entry).toHaveCount(0);
      assert.equal(reads.length, 0, `${scenario}: query/hash must not open production reads`);
    }
    assert.deepEqual(writes, []); assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("PASS real App phone entry: signed isolated API reads published task; real report/packing pages; no permission and production/query reject; no identity edits or business writes.");
} finally {
  await browser?.close(); await closeTestServer(server); await rm(storage, { recursive: true, force: true });
}
