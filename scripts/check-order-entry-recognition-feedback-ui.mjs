import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { createApiServer } from "../server/apiServer.mjs";
import { customers as syntheticCustomers } from "../src/data/fixtures.js";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { buildPublishedOrderPriceFixture } from "./helpers/publishedOrderPriceFixture.mjs";
import { closeTestServer, getTestServerBaseUrl, listenTestServer, requestJson } from "./helpers/apiIntegrationTestHarness.mjs";

const storageRoot = await mkdtemp(join(tmpdir(), "erp-recognition-feedback-"));
const newCustomer = { id: "TEST-CUSTOMER-HUANG", name: "黄松", shortName: "黄松", enabled: true };
let currentCustomers = structuredClone(syntheticCustomers);
let directoryChanged = false;
let directoryFailure = false;
let backend, frontend, browser;
try {
  backend = createApiServer(withLocalRepositoryFixture({
    runtimeMode: "test",
    runtimeStorageRoot: storageRoot,
    seedSource: "synthetic",
    applyProductionEnvFile: false,
    authMode: "prototype",
    authSecret: randomBytes(32).toString("hex"),
    fixedPreviewUserId: "U-MANAGER-A",
    allowLegacyIdentityHeaders: false,
    allowActionPermissionOverride: false,
    allowDefaultSeedUser: false,
    coreWorkspaceReadRepository: {
      kind: "local_memory",
      loadState() {
        if (directoryFailure) throw new Error("Synthetic customer directory unavailable");
        return {
          ...buildPublishedOrderPriceFixture(),
          customers: structuredClone(currentCustomers),
          // A customer refresh must not overwrite the current inventory/orders
          // with unrelated collections returned by the same repository read.
          ...(directoryChanged ? { inventories: [], orderLines: [] } : {}),
        };
      },
    },
  }));
  await backend.ready;
  await listenTestServer(backend);
  const base = getTestServerBaseUrl(backend);
  const login = await requestJson(base, "/api/auth/prototype-login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "U-MANAGER-A" }),
  });
  assert.equal(login.status, 200);
  const authState = login.body;
  const token = authState.session.accessToken;
  const api = async (path, body) => {
    const response = await requestJson(base, path, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal(response.status, 200, `${path}: ${JSON.stringify(response.body)}`);
    return response.body;
  };
  const stockBefore = await api("/api/inventory/items?pageSize=200");
  const ordersBefore = await api("/api/order-lines?pageSize=200");
  assert.equal((await api("/api/master-data/customers?q=" + encodeURIComponent(newCustomer.name))).items.length, 0);

  directoryChanged = true;
  currentCustomers = [...currentCustomers, newCustomer];
  assert.equal((await api("/api/master-data/customers?q=" + encodeURIComponent(newCustomer.name))).items[0].customerId, newCustomer.id);
  const recognized = await api("/api/order-drafts/recognize", {
    sourceText: "30*37 红 500 个 黄松", idempotencyKey: "fresh-customer-recognition",
  });
  assert.equal(recognized.lines[0].customerId, newCustomer.id);
  assert.equal(recognized.draft.customerId, newCustomer.id);
  assert.equal(recognized.draft.customerName, newCustomer.name);
  assert.equal(recognized.recognition.customerHint.customerId, newCustomer.id);
  const queued = await api("/api/order-draft-queues/recognize", {
    sourceText: "30*37 红 500 个 黄松", idempotencyKey: "fresh-customer-queue",
  });
  assert.equal(queued.drafts[0].lines[0].customerId, newCustomer.id);
  assert.equal(queued.drafts[0].draft.customerId, newCustomer.id);
  assert.equal(queued.drafts[0].draft.customerName, newCustomer.name);
  assert.deepEqual(await api("/api/inventory/items?pageSize=200"), stockBefore);
  assert.deepEqual(await api("/api/order-lines?pageSize=200"), ordersBefore);

  // A retry retains the already saved customer evidence after a directory edit.
  currentCustomers = currentCustomers.filter(customer => customer.id !== newCustomer.id);
  const replay = await api("/api/order-drafts/recognize", {
    sourceText: "30*37 红 500 个 黄松", idempotencyKey: "fresh-customer-recognition",
  });
  assert.equal(replay.draft.customerId, newCustomer.id);
  assert.equal(replay.recognition.customerHint.customerId, newCustomer.id);
  const afterRemoval = await api("/api/order-drafts/recognize", {
    sourceText: "30*37 红 500 个 黄松", idempotencyKey: "removed-customer-recognition",
  });
  assert.equal(afterRemoval.lines[0].customerId, "", "a new recognition cannot reuse a removed cached customer");
  const queueAfterRemoval = await api("/api/order-draft-queues/recognize", {
    sourceText: "30*37 红 500 个 黄松", idempotencyKey: "removed-customer-queue",
  });
  assert.equal(queueAfterRemoval.drafts[0].lines[0].customerId, "");
  currentCustomers.push(newCustomer);
  const draftsBeforeFailure = await api("/api/order-drafts?pageSize=200");
  directoryFailure = true;
  for (const path of ["/api/order-drafts/recognize", "/api/order-draft-queues/recognize"]) {
    const unavailable = await requestJson(base, path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ sourceText: "30*37 红 500 个 黄松", idempotencyKey: path.includes("queues") ? "unavailable-queue" : "unavailable-single" }),
    });
    assert.equal(unavailable.status, 500, "directory failures must block rather than recognize from a stale directory");
    assert.equal(unavailable.body.message, "Synthetic customer directory unavailable");
  }
  directoryFailure = false;
  assert.deepEqual(await api("/api/order-drafts?pageSize=200"), draftsBeforeFailure);

  const initial = { authState, permissionContext: authState.permissions, entryDraftId: "", entryCreationId: 1, data: { orderDrafts: [], orderLines: [] } };
  await build({
    stdin: {
      contents: `import React from "react";import {createRoot} from "react-dom/client";
import Workspace from "./docs/prototypes/raw-material-roll-inventory-review/src/OrderPricingEntryWorkspace.jsx";
import {recognizeOfficeDraft} from "./src/services/officeOrderApiClient.js";
import "./docs/prototypes/raw-material-roll-inventory-review/src/styles.css";
window.formal=${JSON.stringify(initial)};
window.formal.actions={recognizeOrderText:(sourceText,request)=>recognizeOfficeDraft({authState:window.formal.authState,sourceText,idempotencyKey:request.idempotencyKey},{serverRequired:true})};
const root=createRoot(document.getElementById("root"));
window.render=()=>root.render(<Workspace formal={window.formal} onNavigate={()=>{}}/>);
window.render();`,
      resolveDir: process.cwd(), loader: "jsx",
    },
    outfile: join(storageRoot, "harness.js"), bundle: true, format: "esm", jsx: "automatic", logLevel: "silent",
    alias: { react: join(process.cwd(), "node_modules/react"), "react-dom": join(process.cwd(), "node_modules/react-dom") },
    define: { "import.meta.env": JSON.stringify({ VITE_ERP_API_BASE_URL: "/api", VITE_ERP_RUNTIME_MODE: "strict" }) },
  });
  const browserRequests = [];
  frontend = createServer(async (request, response) => {
    if (request.url.startsWith("/api/")) {
      let body = "";
      for await (const part of request) body += part;
      browserRequests.push({ path: request.url, method: request.method, signed: request.headers.authorization === `Bearer ${token}` });
      const result = await fetch(base + request.url, {
        method: request.method,
        headers: { "content-type": "application/json", authorization: request.headers.authorization || "", "idempotency-key": request.headers["idempotency-key"] || "" },
        ...(body ? { body } : {}),
      });
      response.writeHead(result.status, { "content-type": "application/json" });
      response.end(await result.text());
    } else if (request.url === "/harness.js" || request.url === "/harness.css") {
      response.setHeader("content-type", request.url.endsWith(".js") ? "application/javascript" : "text/css");
      response.end(await readFile(join(storageRoot, request.url.slice(1))));
    } else {
      response.setHeader("content-type", "text/html");
      response.end('<!doctype html><meta charset="UTF-8"><div id="root" style="height:100vh;padding:20px"></div><link rel="stylesheet" href="/harness.css"><script type="module" src="/harness.js"></script>');
    }
  });
  await new Promise(resolve => frontend.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${frontend.address().port}`);
  const source = page.getByLabel("客户订单原文", { exact: true });
  const customer = page.locator("#pricing-customer-input");
  const recognize = async (text) => {
    await source.fill(text);
    const receipt = page.waitForResponse(response => new URL(response.url()).pathname === "/api/order-drafts/recognize" && response.request().method() === "POST");
    await page.getByRole("button", { name: "识别客户消息", exact: true }).click();
    assert.equal((await receipt).status(), 200);
    await page.waitForFunction(() => !document.querySelector("#pricing-source").disabled);
  };
  const emptyNotice = page.getByText("未识别出订单明细，请检查原文后重新识别。", { exact: true });
  await recognize("你好");
  await emptyNotice.waitFor();
  assert.equal(await page.getByLabel("第1行数量", { exact: true }).count(), 0);
  assert.equal(await page.getByText("已识别，请核对类型、规格、颜色和交期。", { exact: true }).count(), 0);

  await recognize("黄松 在吗");
  await page.waitForFunction(() => document.querySelector("#pricing-customer-input").value === "黄松");
  assert.equal(await customer.inputValue(), newCustomer.name);
  assert.equal(await emptyNotice.count(), 1);
  assert.equal(await page.getByText(/系统里没有。是否新建/).count(), 0);
  assert.equal(await page.getByRole("button", { name: "新建客户「黄松」", exact: true }).count(), 0);

  await recognize("王五包装 在吗");
  assert.equal(await customer.inputValue(), "王五包装", "a later recognized customer replaces the earlier automatic customer");
  await recognize("你好");
  assert.equal(await customer.inputValue(), "", "a customer from a previous recognition must not leak into a message without customer evidence");
  await recognize("黄松 在吗");
  await customer.click();
  await customer.fill("王五包装");
  await page.locator("#pricing-customer-options [role='option'] b").filter({ hasText: "王五包装" }).click();
  await recognize("黄松 在吗");
  await page.waitForFunction(() => !document.querySelector("#pricing-source").disabled);
  assert.equal(await customer.inputValue(), "王五包装", "recognition must preserve an explicitly chosen customer");

  for (const text of ["3037 红 500 个", "3037 红 500 个 黄松"]) {
    await page.evaluate(() => { window.formal.entryCreationId++; window.render(); });
    await recognize(text);
    const quantity = page.getByLabel("第1行数量", { exact: true });
    await quantity.waitFor();
    assert.equal(await quantity.inputValue(), "500");
    assert.equal(await page.getByLabel("第1行规格", { exact: true }).inputValue(), "30*37*10");
    assert.equal(await customer.inputValue(), text.endsWith("黄松") ? newCustomer.name : "");
    assert.equal(await emptyNotice.count(), 0);
    assert.equal(await page.getByRole("button", { name: "新建客户「黄松」", exact: true }).count(), 0);
  }
  assert(browserRequests.every(request => request.signed));
  assert.equal(browserRequests.filter(request => request.method === "POST" && request.path.startsWith("/api/master-data/")).length, 0);
  assert.deepEqual(errors, []);
  console.log("PASS signed isolated recognition UI: fresh customer directory in single/queue drafts, immutable replay, untouched inventory/order collections, empty result feedback, matched customer and manual selection, compact-size order rows. Synthetic fixture only.");
} finally {
  if (browser) await browser.close();
  if (frontend) await new Promise(resolve => frontend.close(resolve));
  if (backend) await closeTestServer(backend);
  await rm(storageRoot, { recursive: true, force: true });
}
