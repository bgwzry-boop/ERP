import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createApiServer } from "../server/apiServer.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { buildPublishedOrderPriceFixture } from "./helpers/publishedOrderPriceFixture.mjs";
import { listenTestServer, getTestServerBaseUrl, closeTestServer, requestJson } from "./helpers/apiIntegrationTestHarness.mjs";

// Only the complete review HTML/assets come from 4174. Every browser API request
// is intercepted and sent to a random-port signed server using disposable fixtures.
const storage = await mkdtemp(join(tmpdir(), "erp-r5-group-desktop-"));
const output = resolve(".erp-local-storage/p1-r5-20261024");
const previewUrl = new URL(process.env.ERP_REVIEW_URL || "http://127.0.0.1:4174/");
assert.equal(previewUrl.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(previewUrl.hostname));
assert.equal(previewUrl.port, "4174", "This check reviews only the complete local desktop app");
previewUrl.searchParams.set("r5PrintGroup", `isolated-${Date.now()}`);
previewUrl.searchParams.set("erpViewport", "desktop");
previewUrl.hash = "order-pool";
let server, browser, page;
let token = "";
const attempts = [], browserApis = [], pageErrors = [];
try {
  const document = await fetch(previewUrl, { cache: "no-store" });
  assert.equal(document.status, 200);
  assert.match(await document.text(), /(?:data-erp-app-id="bagwin-complete-review-4174"|name="erp-app-id" content="bagwin-complete-review-4174")/, "Require the complete review app, not a bare 200 or legacy root shell");
  server = createApiServer(withLocalRepositoryFixture({
    runtimeMode: "test", runtimeStorageRoot: storage, seedSource: "synthetic", allowLocalFixture: true, applyProductionEnvFile: false,
    authMode: "prototype", authSecret: randomBytes(32).toString("hex"), fixedPreviewUserId: "U-MANAGER-A",
    allowLegacyIdentityHeaders: false, allowActionPermissionOverride: false, allowDefaultSeedUser: false,
    coreWorkspaceReadRepository: { kind: "local_memory", loadState: () => buildPublishedOrderPriceFixture({ bagPrice: 0.9 }) },
  }));
  await server.ready; await listenTestServer(server);
  const isolatedOrigin = getTestServerBaseUrl(server);
  assert.notEqual(new URL(isolatedOrigin).port, "4174");
  async function api(path, body, status = 200) {
    return (await requestJson(isolatedOrigin, `/api${path}`, { method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), expectedStatus: status,
    })).body;
  }
  const login = await api("/auth/prototype-login", { userId: "U-MANAGER-A" });
  token = login.session.accessToken;
  assert.ok(login.permissions.actionPermissions.includes("order.quantity.adjust"));
  const recognized = await api("/order-drafts/recognize", { customerId: "C003", sourceText: "王五包装 30*38红5000个 明天自提", idempotencyKey: "r5-group-shell-recognize" });
  const first = recognized.lines[0];
  const lines = [{ ...first, orderType: "custom_print", product: "合成完整电脑测试袋", productName: "合成完整电脑测试袋", artworkStatus: "已上传",
    print: "是", printFlag: true, printSide: "单面", printColor: "黑色", printContent: "合成完整电脑同稿件", qty: 5000 }];
  lines.push({ ...lines[0], id: `${first.id ?? first.draftLineId}-02`, draftLineId: `${first.draftLineId}-02`, color: "白色", bagColor: "白色" });
  const draftId = recognized.draft.draftId;
  const quote = await api(`/order-drafts/${draftId}/price-quote`, { lines, expectedRevision: recognized.draft.clientRevision, idempotencyKey: "r5-group-shell-quote" });
  const confirmed = await api(`/order-drafts/${draftId}/confirm`, { lines, expectedRevision: quote.quote.clientRevision, pricingQuoteId: quote.quote.quoteId, idempotencyKey: "r5-group-shell-confirm" });
  assert.equal(confirmed.orderLines.length, 2);
  const initial = await api(`/order-lines/${confirmed.orderLines[0].id}/print-group`);
  assert.equal(initial.members.length, 2);
  const ids = initial.members.map(row => row.orderLineId), anchor = ids[0];
  assert.ok(initial.members.every(row => row.qty === 5000 && row.printPrice === 0.06));
  const prior = new Map(await Promise.all(ids.map(async id => [id, await api(`/order-lines/${id}`)])));
  const auditPath = `/operation-logs?targetType=printing_price_group&targetId=${encodeURIComponent(initial.groupId)}&limit=100`;
  assert.equal((await api(auditPath)).items.length, 0);

  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), headers = { ...request.headers() };
    delete headers.host; delete headers.origin;
    const isCorrection = request.method() === "POST" && url.pathname.endsWith("/print-group-corrections");
    const response = await fetch(isolatedOrigin + url.pathname + url.search, { method: request.method(), headers,
      body: ["GET", "HEAD"].includes(request.method()) ? undefined : request.postDataBuffer() });
    const bytes = Buffer.from(await response.arrayBuffer());
    browserApis.push({ method: request.method(), path: url.pathname, status: response.status });
    if (isCorrection) {
      const receipt = JSON.parse(bytes.toString("utf8"));
      attempts.push({ path: url.pathname, key: headers["idempotency-key"], body: request.postData(), receipt, status: response.status, signed: Boolean(headers.authorization?.startsWith("Bearer ")) });
      assert.equal(response.status, 200, "The real API must commit/replay before simulating the missing browser receipt");
      assert.ok(receipt.correctionId && receipt.operationLogId && receipt.members.length === 2);
      if (attempts.length <= 2) {
        await route.fulfill({ status: attempts.length === 1 ? 500 : 409, contentType: "application/json",
          body: JSON.stringify({ code: attempts.length === 1 ? "ISOLATED_LOST_SUCCESS_RECEIPT" : "BUSINESS_WRITE_CONFLICT", message: "Synthetic browser receipt fault after real isolated commit" }) });
        return;
      }
    }
    await route.fulfill({ status: response.status, contentType: response.headers.get("content-type") || "application/json", body: bytes });
  });
  await page.goto(previewUrl.toString());
  await page.getByLabel("订单池搜索").fill(anchor);
  const entry = page.getByRole("button", { name: "整组印刷更正", exact: true });
  await expect(entry).toBeEnabled();
  await expect(page.getByRole("button", { name: "修改数量 / 作废", exact: true })).toHaveCount(0);
  await entry.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "整组印刷订单更正", exact: true })).toBeVisible();
  await dialog.getByLabel(`${anchor} 新数量`).fill("2000");
  await dialog.getByLabel("整组更正原因").fill("合成客户确认第一行减量，原印刷单价保持不变");
  await dialog.getByRole("button", { name: "核对整组更正", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "整组更正最终核对" })).toContainText("6,720.00");
  assert.equal(attempts.length, 0, "Preview is read-only");
  await expect(dialog.getByRole("button", { name: "确认整组更正", exact: true })).toBeDisabled();
  for (const id of ids) await dialog.getByLabel(`确认 ${id} 的数量和金额`).check();
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: join(output, "print-group-review-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 800, height: 1100 });
  await expect(dialog.getByRole("heading", { name: "整组印刷订单更正", exact: true })).toBeVisible();
  await page.screenshot({ path: join(output, "print-group-review-800.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 980 });
  await dialog.getByRole("button", { name: "确认整组更正", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "按原请求重试", exact: true })).toBeEnabled();
  assert.equal(attempts.length, 1);
  const committed = await api(`/order-lines/${anchor}/print-group`);
  assert.deepEqual(committed.members.map(row => row.qty), [2000, 5000], "The missing first browser response follows a real committed correction");
  async function assertLocked() {
    await expect(dialog.getByLabel(`${anchor} 新数量`)).toBeDisabled();
    await expect(dialog.getByLabel("整组更正原因")).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "返回修改", exact: true }).first()).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "关闭整组更正", exact: true })).toBeDisabled();
    // Dispatch the real sidebar handler, even while the modal overlay prevents pointer navigation.
    await page.getByRole("button", { name: "客户档案", exact: true }).evaluate(button => button.click());
    assert.equal(new URL(page.url()).hash, "#order-pool");
    await expect(dialog.getByRole("heading", { name: "整组印刷订单更正", exact: true })).toBeVisible();
    for (const target of ["#inventory-query", "#order-entry"]) {
      await page.evaluate(hash => { window.location.hash = hash; }, target);
      await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("#order-pool");
    }
  }
  await assertLocked();
  await dialog.getByRole("button", { name: "按原请求重试", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "按原请求重试", exact: true })).toBeEnabled();
  assert.equal(attempts.length, 2);
  await assertLocked();
  await dialog.getByRole("button", { name: "按原请求重试", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "整组更正已保存", exact: true })).toBeVisible();
  assert.equal(attempts.length, 3);
  assert.equal(new Set(attempts.map(row => row.key)).size, 1);
  assert.equal(new Set(attempts.map(row => row.body)).size, 1);
  assert.ok(attempts.every(row => row.signed));
  assert.equal(new Set(attempts.map(row => row.receipt.correctionId)).size, 1);
  const frozenBody = JSON.parse(attempts[0].body);
  assert.equal(frozenBody.idempotencyKey, attempts[0].key);
  assert.deepEqual(frozenBody.members.map(row => row.orderLineId).sort(), [...ids].sort());
  assert.equal(frozenBody.operatorId, undefined);
  const final = await api(`/order-lines/${anchor}/print-group`);
  assert.deepEqual(final.members.map(row => row.qty), [2000, 5000]);
  for (const id of ids) {
    const detail = await api(`/order-lines/${id}`);
    assert.equal(detail.orderLine.revision, 2, "Exactly one correction revision per member");
    assert.equal(detail.priceSnapshot.snapshotType, "print_group_correction");
    assert.equal(detail.priceSnapshot.versionNo, prior.get(id).priceSnapshot.versionNo + 1);
    assert.equal(detail.priceSnapshot.bagPrice, prior.get(id).priceSnapshot.bagPrice);
    assert.equal(detail.priceSnapshot.printPrice, prior.get(id).priceSnapshot.printPrice);
    assert.notEqual(detail.priceSnapshot.priceSnapshotId, prior.get(id).priceSnapshot.priceSnapshotId);
  }
  const audit = await api(auditPath);
  assert.equal(audit.items.length, 1);
  assert.equal(audit.items[0].action, "correct_print_group");
  assert.equal(audit.items[0].id, attempts[0].receipt.operationLogId);
  assert.equal(audit.items[0].operatorId, "U-MANAGER-A");
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "客户档案", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("#customer-records");
  assert.deepEqual(pageErrors, []);
  await writeFile(join(output, "print-group-desktop.json"), JSON.stringify({ status: "passed", completeReviewApp: true,
    signedIsolatedApiOnly: true, actualRecognitionQuoteConfirmation: true, groupMemberCount: ids.length,
    realOrderPoolEntry: true, attempts: attempts.length, oneRequestBodyAndKey: true, lostSuccessThen409RemainsLocked: true,
    sidebarAndHashKeepOrderPool: true, postReceiptNavigationReleased: true, oneAuditAndRevision: true,
    screenshots: ["print-group-review-1440.png", "print-group-review-800.png"], browserApiCount: browserApis.length }, null, 2));
  console.log("PASS complete 4174 order-pool group button → real signed isolated recognition/quote/confirmation → full-member reduction review → committed success hidden as 500 → forged 409 stays frozen on order-pool → original body/key succeeds once; one audit/revision and navigation release. No shared ERP API business writes.");
} catch (error) {
  if (page) {
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: join(output, "print-group-desktop-failure.png"), fullPage: true }).catch(() => {});
    await writeFile(join(output, "print-group-desktop-failure.json"), JSON.stringify({ browserApis, pageErrors, correctionAttempts:attempts.length }, null, 2));
  }
  throw error;
} finally {
  await browser?.close();
  await closeTestServer(server, { forceAfterMs: 100 });
  await rm(storage, { recursive: true, force: true });
}
