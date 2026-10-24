import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createApiServer } from "../server/apiServer.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { buildPublishedOrderPriceFixture } from "./helpers/publishedOrderPriceFixture.mjs";
import { listenTestServer, closeTestServer, getTestServerBaseUrl, requestJson } from "./helpers/apiIntegrationTestHarness.mjs";

const directory = await mkdtemp(join(tmpdir(), "erp-group-correction-live-ui-"));
let backend, proxy, browser;
try {
  backend = createApiServer(withLocalRepositoryFixture({ runtimeMode: "test", runtimeStorageRoot: directory, seedSource: "synthetic", applyProductionEnvFile: false,
    authMode: "prototype", authSecret: randomBytes(32).toString("hex"), fixedPreviewUserId: "U-MANAGER-A", allowLegacyIdentityHeaders: false,
    allowActionPermissionOverride: false, allowDefaultSeedUser: false,
    coreWorkspaceReadRepository: { kind: "local_memory", loadState: () => buildPublishedOrderPriceFixture({ bagPrice: 0.9 }) },
  }));
  await backend.ready; await listenTestServer(backend);
  const base = getTestServerBaseUrl(backend);
  let token;
  const api = (path, body, method = "POST") => requestJson(base, `/api${path}`, { method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const login = await api("/auth/prototype-login", { userId: "U-MANAGER-A" });
  assert.equal(login.status, 200);
  token = login.body.session.accessToken;
  const draft = await api("/order-drafts/recognize", { customerId: "C003", sourceText: "王五包装 30*38红5000个 明天自提", idempotencyKey: "group-live-ui-create" });
  assert.equal(draft.status, 200, JSON.stringify(draft.body));
  const first = draft.body.lines[0];
  const lines = [{ ...first, orderType: "custom_print", product: "合成正式界面测试袋", productName: "合成正式界面测试袋", artworkStatus: "已上传",
    print: "是", printFlag: true, printSide: "单面", printColor: "黑色", printContent: "合成正式界面同稿件", qty: 5000 }];
  lines.push({ ...lines[0], id: `${first.id ?? first.draftLineId}-02`, draftLineId: `${first.draftLineId}-02`, color: "白色", bagColor: "白色" });
  const draftId = draft.body.draft.draftId;
  const quote = await api(`/order-drafts/${draftId}/price-quote`, { lines, expectedRevision: draft.body.draft.clientRevision, idempotencyKey: "group-live-ui-price" });
  assert.equal(quote.status, 200, JSON.stringify(quote.body));
  const confirmation = await api(`/order-drafts/${draftId}/confirm`, { lines, expectedRevision: quote.body.quote.clientRevision, pricingQuoteId: quote.body.quote.quoteId, idempotencyKey: "group-live-ui-confirm" });
  assert.equal(confirmation.status, 200, JSON.stringify(confirmation.body));
  const initialGroup = await api(`/order-lines/${confirmation.body.orderLines[0].id}/print-group`, undefined, "GET");
  assert.equal(initialGroup.status, 200, JSON.stringify(initialGroup.body));
  assert.equal(initialGroup.body.members.length, 2);
  const ids = initialGroup.body.members.map(row => row.orderLineId), anchor = ids[0];
  const originals = initialGroup.body.members.map(row => ({ id: row.orderLineId, priceSnapshotId: row.priceSnapshotId, bagPrice: row.bagPrice, printPrice: row.printPrice }));
  const authState = { ...login.body, source: "runtime" };
  await build({ stdin: { resolveDir: process.cwd(), loader: "jsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';import{OrderPrintGroupCorrectionDialog}from'./docs/prototypes/raw-material-roll-inventory-review/src/OrderPrintGroupCorrectionDialog.jsx';import'./docs/prototypes/raw-material-roll-inventory-review/src/styles.css';
const root=createRoot(document.getElementById('root'));let revision=0;window.receipts=[];window.renderGroup=()=>root.render(<OrderPrintGroupCorrectionDialog key={++revision} orderLineId=${JSON.stringify(anchor)} authState={${JSON.stringify(authState)}} onClose={()=>{}} onSaved={result=>window.receipts.push(result)}/>);window.renderGroup();` },
    outfile: join(directory, "harness.js"), bundle: true, format: "esm", jsx: "automatic", logLevel: "silent",
    alias: { react: join(process.cwd(), "node_modules/react"), "react-dom": join(process.cwd(), "node_modules/react-dom") },
    define: { "import.meta.env": JSON.stringify({ VITE_ERP_API_BASE_URL: "/api", VITE_ERP_RUNTIME_MODE: "strict" }) },
  });
  const writes = [];
  proxy = createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/api/")) {
        let body = ""; for await (const part of req) body += part;
        if (req.url.endsWith("/print-group-corrections")) writes.push({ body: JSON.parse(body), authorization: req.headers.authorization, idempotencyKey: req.headers["idempotency-key"] });
        const response = await fetch(`${base}${req.url}`, { method: req.method,
          headers: Object.fromEntries(["content-type", "authorization", "idempotency-key"].filter(key => req.headers[key]).map(key => [key, req.headers[key]])),
          ...(body ? { body } : {}),
        });
        res.statusCode = response.status; res.setHeader("content-type", response.headers.get("content-type") ?? "application/json"); res.end(await response.text()); return;
      }
      if (["/harness.js", "/harness.css"].includes(req.url)) { res.setHeader("content-type", req.url.endsWith("css") ? "text/css" : "text/javascript"); res.end(await readFile(join(directory, req.url.slice(1)))); return; }
      res.setHeader("content-type", "text/html"); res.end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/harness.css"></head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>');
    } catch { res.statusCode = 500; res.end("Synthetic test proxy failed"); }
  });
  await listenTestServer(proxy);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(8000);
  const pageErrors = []; page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(getTestServerBaseUrl(proxy));
  await page.getByLabel(`${anchor} 新数量`).fill("2000");
  await page.getByLabel("整组更正原因").fill("合成客户确认减量，保留原先约定单价");
  await page.getByRole("button", { name: "核对整组更正", exact: true }).click();
  await page.getByRole("region", { name: "整组更正最终核对" }).waitFor();
  for (const id of ids) await page.getByLabel(`确认 ${id} 的数量和金额`).check();
  await page.getByRole("button", { name: "确认整组更正", exact: true }).evaluate(button => { button.click(); button.click(); });
  await page.getByRole("heading", { name: "整组更正已保存", exact: true }).waitFor();
  assert.equal(writes.length, 1);
  const reduced = await page.evaluate(() => window.receipts[0]);
  assert.equal(reduced.totals.finalAmount, 6720); assert.equal(reduced.totals.newQty, 7000);
  assert.equal(writes[0].authorization, `Bearer ${token}`); assert.equal(writes[0].body.idempotencyKey, writes[0].idempotencyKey);
  const currentGroup = await api(`/order-lines/${anchor}/print-group`, undefined, "GET");
  assert.equal(currentGroup.status, 200);
  assert.deepEqual(currentGroup.body.members.map(row => row.qty), [2000, 5000]);
  for (const original of originals) {
    const detail = await api(`/order-lines/${original.id}`, undefined, "GET");
    assert.equal(detail.status, 200);
    assert.equal(detail.body.priceSnapshot.snapshotType, "print_group_correction");
    assert.notEqual(detail.body.priceSnapshot.priceSnapshotId, original.priceSnapshotId);
    assert.equal(detail.body.priceSnapshot.bagPrice, original.bagPrice);
    assert.equal(detail.body.priceSnapshot.printPrice, original.printPrice);
    assert.equal(detail.body.orderLine.revision, 2);
  }
  const { source: _reducedSource, ...reducedReceipt } = reduced;
  assert.deepEqual((await api(`/order-lines/${anchor}/print-group-corrections`, writes[0].body)).body, reducedReceipt);

  await page.evaluate(() => window.renderGroup());
  await page.getByLabel("更正范围").selectOption("void_all");
  await page.getByLabel("整组更正原因").fill("合成客户明确取消本组全部未生产明细");
  await page.getByRole("button", { name: "核对整组更正", exact: true }).click();
  for (const id of ids) await page.getByLabel(`确认 ${id} 的数量和金额`).check();
  await page.getByRole("button", { name: "确认整组更正", exact: true }).click();
  await page.getByRole("heading", { name: "整组更正已保存", exact: true }).waitFor();
  const voided = await page.evaluate(() => window.receipts[1]);
  assert.equal(voided.totals.newQty, 0); assert.equal(voided.totals.finalAmount, 0);
  for (const [index, id] of ids.entries()) {
    const detail = await api(`/order-lines/${id}`, undefined, "GET");
    assert.equal(detail.status, 200);
    assert.equal(detail.body.orderLine.qty, index ? 5000 : 2000, "Void retains physical historical quantity");
    assert.equal(detail.body.orderLine.lineStatus, "已关闭"); assert.equal(detail.body.orderLine.revision, 3);
    assert.equal(detail.body.priceSnapshot.chargeableQty, 0); assert.equal(detail.body.priceSnapshot.finalAmount, 0);
    assert.equal(detail.body.priceSnapshot.snapshotType, "print_group_correction");
    assert.ok(voided.priceSnapshotIds.includes(detail.body.priceSnapshot.priceSnapshotId));
  }
  assert.equal((await api(`/order-lines/${anchor}/print-group`, undefined, "GET")).status, 404);
  const { source: _voidedSource, ...voidedReceipt } = voided;
  assert.deepEqual((await api(`/order-lines/${anchor}/print-group-corrections`, writes[1].body)).body, voidedReceipt);
  const logs = await api(`/operation-logs?targetType=printing_price_group&targetId=${encodeURIComponent(initialGroup.body.groupId)}`, undefined, "GET");
  assert.equal(logs.status, 200); assert.equal(logs.body.items.length, 2);
  for (const log of logs.body.items) { assert.equal(log.operatorId, "U-MANAGER-A"); assert.equal(log.action, "correct_print_group"); assert.equal(log.after.pricingBasis, "frozen_original_unit_price"); }
  assert.deepEqual(pageErrors, []);
  console.log("PASS real print-group dialog + signed isolated ERP HTTP: recognized/quoted/confirmed group, 2000+5000 reduction at frozen rates=6720, whole-group void, latest snapshot/line/audit verification, duplicate click and exact replay. Local synthetic repositories; no deployment or live ERP data.");
} finally {
  if (browser) await browser.close();
  await closeTestServer(proxy, { forceAfterMs: 1000 });
  await closeTestServer(backend, { forceAfterMs: 1000 });
  await rm(directory, { recursive: true, force: true });
}
