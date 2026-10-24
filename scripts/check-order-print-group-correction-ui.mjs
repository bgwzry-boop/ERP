import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { chromium } from "playwright";
import {
  isCompleteOfficeOrderPrintGroup, isCompleteOfficePrintGroupCorrectionPreview,
  isCompleteOfficePrintGroupCorrectionReceipt, getOfficeOrderPrintGroup,
  previewOfficeOrderPrintGroupCorrection, correctOfficeOrderPrintGroup,
} from "../src/services/officeOrderPrintGroupApiClient.js";

const group = {
  groupId: "SYNTHETIC-PRINT-GROUP", groupRevision: "synthetic-group-v1", pricingBasis: "frozen_original_unit_price", canCorrect: true, blockers: [],
  members: [
    { orderLineId: "SYN-A", revision: 2, qty: 5000, amount: 900.5, bagPrice: 0.1234, printPrice: 0.0567, otherFee: 0, adjustmentAmount: 0, chargeableQty: 5000, customerName: "合成测试客户", product: "合成测试图案", size: "30×37×10", color: "白色", status: "待排产", priceSnapshotId: "ORIGINAL-A" },
    { orderLineId: "SYN-B", revision: 4, qty: 5000, amount: 2000, bagPrice: 0.34, printPrice: 0.06, otherFee: 0, adjustmentAmount: 0, chargeableQty: 5000, customerName: "合成测试客户", product: "合成测试图案", size: "30×37×10", color: "红色", status: "待排产", priceSnapshotId: "ORIGINAL-B" },
  ],
};
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
function makePreview(body) {
  const members = body.members.map(edit => {
    const prior = group.members.find(row => row.orderLineId === edit.orderLineId);
    return { orderLineId: prior.orderLineId, previousQty: prior.qty, newQty: edit.void ? 0 : edit.newQty,
      action: edit.void ? "void" : edit.newQty === prior.qty ? "keep" : "reduce", previousAmount: prior.amount,
      finalAmount: edit.void ? 0 : round((prior.bagPrice + prior.printPrice) * edit.newQty + prior.otherFee + prior.adjustmentAmount),
      bagPrice: prior.bagPrice, printPrice: prior.printPrice };
  });
  const totals = { previousQty: 10000, newQty: members.reduce((sum, row) => sum + row.newQty, 0),
    previousAmount: 2900.5, finalAmount: round(members.reduce((sum, row) => sum + row.finalAmount, 0)) };
  totals.difference = round(totals.finalAmount - totals.previousAmount);
  return { groupId: group.groupId, groupRevision: group.groupRevision, previewHash: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
    mode: body.mode, pricingBasis: group.pricingBasis, reason: body.reason, members, totals };
}
function makeReceipt(preview) {
  return { groupId: group.groupId, correctionId: "SYNTHETIC-CORRECTION", operationLogId: "SYNTHETIC-LOG", totals: preview.totals,
    members: preview.members.map(row => ({ orderLineId: row.orderLineId, newQty: row.newQty, finalAmount: row.finalAmount,
      status: row.action === "void" ? "已关闭" : "待排产", revision: group.members.find(prior => prior.orderLineId === row.orderLineId).revision + 1,
      priceSnapshotId: `NEW-${row.orderLineId}` })), priceSnapshotIds: preview.members.map(row => `NEW-${row.orderLineId}`) };
}
const request = { group, orderLineId: "SYN-A", expectedGroupRevision: group.groupRevision, mode: "amend", reason: "合成测试减量",
  members: group.members.map((row, index) => ({ orderLineId: row.orderLineId, expectedRevision: row.revision, newQty: index ? row.qty : 4000, void: false })) };
const preview = makePreview(request);
const input = { ...request, preview, previewHash: preview.previewHash, idempotencyKey: "SYNTHETIC-IDEMPOTENCY" };
const receipt = makeReceipt(preview);
assert.equal(isCompleteOfficeOrderPrintGroup(group, "SYN-A"), true);
assert.equal(isCompleteOfficePrintGroupCorrectionPreview(preview, input), true);
assert.equal(isCompleteOfficePrintGroupCorrectionReceipt(receipt, input), true);
{
  const giftGroup = structuredClone(group); Object.assign(giftGroup.members[1], { chargeableQty: 4000, amount: 1600 });
  const giftPreview = structuredClone(preview);
  Object.assign(giftPreview.members[1], { previousAmount: 1600, finalAmount: 1600 });
  Object.assign(giftPreview.totals, { previousAmount: 2500.5, finalAmount: 2320.4, difference: -180.1 });
  assert.equal(isCompleteOfficePrintGroupCorrectionPreview(giftPreview, { ...input, group: giftGroup }), true, "Unchanged member retains its existing gift/billing allocation exactly");
}
for (const bad of [undefined, null, "", false, "0", NaN]) {
  const damaged = structuredClone(group); damaged.members[0].amount = bad;
  assert.equal(isCompleteOfficeOrderPrintGroup(damaged, "SYN-A"), false, `Amount ${String(bad)} is not zero`);
}
for (const mutate of [
  value => value.members.pop(), value => value.members.push(value.members[0]),
  value => { value.members[0].bagPrice = 0.12; }, value => { value.members[0].previousAmount = 0; },
  value => { value.members[0].newQty = 3999; }, value => { value.groupRevision = "other"; },
  value => { value.totals.difference = 0; }, value => { value.reason = "other"; },
]) { const damaged = structuredClone(preview); mutate(damaged); assert.equal(isCompleteOfficePrintGroupCorrectionPreview(damaged, input), false); }
for (const mutate of [
  value => value.members.pop(), value => { value.members[0].revision = 2; },
  value => { value.members[0].priceSnapshotId = "ORIGINAL-A"; }, value => { value.members[0].finalAmount = 0; },
  value => { value.operationLogId = ""; }, value => { value.priceSnapshotIds = ["NEW-SYN-A", "NEW-SYN-A"]; },
  value => { value.totals.finalAmount = 0; },
]) { const damaged = structuredClone(receipt); mutate(damaged); assert.equal(isCompleteOfficePrintGroupCorrectionReceipt(damaged, input), false); }
let captured;
const result = await correctOfficeOrderPrintGroup({ ...input, authState: { session: { accessToken: "synthetic-A" } }, bagPrice: 999, operatorId: "forged" }, {
  fetchImpl: async (_url, options) => { captured = options; return new Response(JSON.stringify(receipt), { status: 200 }); },
});
assert.equal(result.source, "api");
assert.equal(captured.headers.authorization, "Bearer synthetic-A");
assert.equal(captured.headers["x-erp-user-id"], undefined);
assert.equal(JSON.parse(captured.body).bagPrice, undefined);
assert.equal(JSON.parse(captured.body).operatorId, undefined);
assert.equal(JSON.parse(captured.body).group, undefined);
assert.equal(captured.headers["idempotency-key"], input.idempotencyKey);
for (const [status, code, definitive] of [[409, "PRINT_GROUP_PREVIEW_CHANGED", true], [409, "BUSINESS_WRITE_CONFLICT", true], [503, "PRINT_GROUP_REVISION_CONFLICT", false], [409, "UNKNOWN_PROXY_ERROR", false]]) {
  const rejected = await correctOfficeOrderPrintGroup(input, { fetchImpl: async () => new Response(JSON.stringify({ error: { code } }), { status }) });
  assert.equal(rejected.error.definitive, definitive);
}
assert.equal((await correctOfficeOrderPrintGroup(input, { fetchImpl: async () => new Response("{}", { status: 200 }) })).error.definitive, false);
assert.equal((await getOfficeOrderPrintGroup({ orderLineId: "SYN-A" }, { fetchImpl: async () => new Response(JSON.stringify({ ...group, members: [] })) })).source, "api_error");
assert.equal((await previewOfficeOrderPrintGroupCorrection({ ...request, members: request.members.slice(1) })).error.definitive, true);

const directory = await mkdtemp(join(tmpdir(), "erp-print-group-ui-"));
const attempts = [], previews = [], applied = new Map();
let outcomes = [], releaseHeld, closeCalls = 0;
const auth = session => ({ session: { accessToken: session }, permissions: { user: { userId: `SYN-${session}` }, actionPermissions: ["order.quantity.adjust", "order.void"] } });
let server, browser;
try {
  await build({ stdin: { resolveDir: process.cwd(), loader: "jsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';import{OrderPrintGroupCorrectionDialog}from'./docs/prototypes/raw-material-roll-inventory-review/src/OrderPrintGroupCorrectionDialog.jsx';import'./docs/prototypes/raw-material-roll-inventory-review/src/styles.css';
const root=createRoot(document.getElementById('root'));window.events=[];window.saved=[];window.groupCloseCount=0;window.mount=(auth)=>root.render(<OrderPrintGroupCorrectionDialog orderLineId="SYN-A" authState={auth} onClose={()=>window.groupCloseCount++} onSaved={result=>{window.saved.push({session:auth.session.accessToken,result});}} onPendingChange={(pending,ownerKey)=>window.events.push({pending,ownerKey,session:auth.session.accessToken})}/>);window.unmount=()=>root.render(null);window.mount(${JSON.stringify(auth("A"))});` },
    outfile: join(directory, "harness.js"), bundle: true, format: "esm", jsx: "automatic", logLevel: "silent",
    alias: { react: join(process.cwd(), "node_modules/react"), "react-dom": join(process.cwd(), "node_modules/react-dom") },
    define: { "import.meta.env": JSON.stringify({ VITE_ERP_API_BASE_URL: "/api", VITE_ERP_RUNTIME_MODE: "strict" }) },
  });
  server = createServer(async (req, res) => {
    if (req.url.startsWith("/api/")) {
      let text = ""; for await (const part of req) text += part;
      const body = text ? JSON.parse(text) : null;
      res.setHeader("content-type", "application/json");
      if (req.url.endsWith("/print-group")) { res.end(JSON.stringify(group)); return; }
      if (req.url.endsWith("/print-group-correction-preview")) { const value = makePreview(body); previews.push({ body, value }); res.end(JSON.stringify(value)); return; }
      if (req.url.endsWith("/print-group-corrections")) {
        attempts.push({ body, auth: req.headers.authorization, key: req.headers["idempotency-key"] });
        const outcome = outcomes.shift() ?? "ok";
        if (outcome === "reject") { res.statusCode = 409; res.end(JSON.stringify({ error: { code: "PRINT_GROUP_REVISION_CONFLICT", message: "合成版本已变化" } })); return; }
        const key = `${req.headers.authorization}:${body.idempotencyKey}`;
        const value = applied.get(key) ?? makeReceipt(previews.find(row => row.value.previewHash === body.previewHash).value);
        applied.set(key, value);
        if (outcome === "hold") await new Promise(resolve => { releaseHeld = resolve; });
        if (outcome === "503") { res.statusCode = 503; res.end(JSON.stringify({ error: { code: "TEMPORARY_UNAVAILABLE" } })); return; }
        if (outcome === "bad") { res.end(JSON.stringify({ groupId: group.groupId })); return; }
        if (outcome === "409") { res.statusCode = 409; res.end(JSON.stringify({ error: { code: "PRINT_GROUP_REVISION_CONFLICT", message: "合成版本已变化" } })); return; }
        res.end(JSON.stringify(value)); return;
      }
      res.statusCode = 404; res.end("{}"); return;
    }
    if (req.url === "/harness.js" || req.url === "/harness.css") {
      res.setHeader("content-type", req.url.endsWith("css") ? "text/css" : "text/javascript");
      res.end(await readFile(join(directory, req.url.slice(1)))); return;
    }
    res.setHeader("content-type", "text/html");res.end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/harness.css"></head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(5000);
  const pageErrors = []; page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  try { await page.getByLabel("SYN-A 新数量").waitFor(); }
  catch (error) { console.error({ pageErrors, body: await page.locator("body").innerText() }); throw error; }
  await page.getByLabel("SYN-A 新数量").fill("5001");
  await page.getByLabel("整组更正原因").fill("合成客户减量");
  await page.getByRole("button", { name: "核对整组更正", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "不超过原数量" }).waitFor();
  assert.equal(previews.length, 0);
  await page.getByLabel("SYN-A 新数量").fill("4000");
  await page.getByRole("button", { name: "核对整组更正", exact: true }).click();
  await page.getByRole("region", { name: "整组更正最终核对" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "确认整组更正", exact: true }).isDisabled(), true);
  await page.getByLabel("确认 SYN-A 的数量和金额").check();
  assert.equal(await page.getByRole("button", { name: "确认整组更正", exact: true }).isDisabled(), true);
  await page.getByLabel("确认 SYN-B 的数量和金额").check();
  if (process.env.ERP_PRINT_GROUP_SCREENSHOT_DIR) {
    await mkdir(process.env.ERP_PRINT_GROUP_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.ERP_PRINT_GROUP_SCREENSHOT_DIR, "print-group-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(process.env.ERP_PRINT_GROUP_SCREENSHOT_DIR, "print-group-phone.png"), fullPage: true });
    assert.ok(await page.getByRole("dialog").evaluate(element => element.getBoundingClientRect().width <= innerWidth));
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  const reviewSize = await page.getByRole("dialog").evaluate(element => ({ width: element.getBoundingClientRect().width, scroll: element.scrollWidth }));
  assert.ok(reviewSize.scroll <= reviewSize.width + 1, "The dialog itself must not overflow the viewport");
  outcomes = ["503", "bad", "409", "ok"];
  await page.getByRole("button", { name: "确认整组更正", exact: true }).evaluate(button => { button.click(); button.click(); });
  await page.getByRole("button", { name: "按原请求重试", exact: true }).waitFor();
  assert.equal(attempts.length, 1);
  assert.equal(await page.getByLabel("SYN-A 新数量").isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "关闭整组更正", exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }), true);
  await page.keyboard.press("Escape");
  closeCalls = await page.evaluate(() => window.groupCloseCount); assert.equal(closeCalls, 0);
  for (let index = 0; index < 2; index++) {
    await page.getByRole("button", { name: "按原请求重试", exact: true }).click();
    await page.getByRole("button", { name: "按原请求重试", exact: true }).waitFor();
    assert.equal(await page.getByLabel("SYN-A 新数量").isDisabled(), true);
  }
  await page.evaluate(() => window.unmount());
  await page.waitForFunction(() => !document.querySelector("dialog"));
  await page.evaluate(value => window.mount(value), auth("A"));
  await page.getByRole("button", { name: "按原请求重试", exact: true }).waitFor();
  assert.equal(await page.getByLabel("SYN-A 新数量").inputValue(), "4000");
  await page.getByRole("button", { name: "按原请求重试", exact: true }).click();
  await page.getByRole("heading", { name: "整组更正已保存", exact: true }).waitFor();
  assert.equal(applied.size, 1); assert.equal(attempts.length, 4);
  for (const attempt of attempts) assert.deepEqual(attempt, attempts[0], "Unknown results retain every original body field and key");
  assert.equal((await page.evaluate(() => window.saved)).length, 1);
  assert.equal(group.members[0].priceSnapshotId, "ORIGINAL-A");

  // First definite rejection unlocks editing; a later retry uses a new key.
  await page.evaluate(value => window.mount(value), auth("C"));
  await page.getByLabel("SYN-A 新数量").waitFor();
  await page.getByLabel("SYN-A 新数量").fill("3000");
  await page.getByLabel("整组更正原因").fill("合成版本冲突");
  await page.getByRole("button", { name: "核对整组更正", exact: true }).click();
  for (const id of ["SYN-A", "SYN-B"]) await page.getByLabel(`确认 ${id} 的数量和金额`).check();
  outcomes = ["reject", "hold"];
  await page.getByRole("button", { name: "确认整组更正", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "合成版本已变化" }).waitFor();
  assert.equal(await page.getByLabel("SYN-A 新数量").isDisabled(), false);
  assert.equal(await page.getByLabel("SYN-A 新数量").inputValue(), "3000");
  await page.getByRole("button", { name: "核对整组更正", exact: true }).click();
  for (const id of ["SYN-A", "SYN-B"]) await page.getByLabel(`确认 ${id} 的数量和金额`).check();
  await page.getByRole("button", { name: "确认整组更正", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('button.primary')?.textContent.includes("正在保存"));
  await page.evaluate(value => window.mount(value), auth("D"));
  await page.getByLabel("SYN-A 新数量").waitFor();
  while (!releaseHeld) await new Promise(resolve => setTimeout(resolve, 10));
  releaseHeld(); releaseHeld = null;
  await page.waitForTimeout(70);
  assert.equal(await page.getByLabel("SYN-A 新数量").inputValue(), "5000");
  assert.equal((await page.evaluate(() => window.saved)).some(row => row.session === "C"), false, "Late session C result never invokes session D refresh");
  assert.notEqual(attempts.at(-1).key, attempts.at(-2).key);
  await page.evaluate(value => window.mount(value), auth("C"));
  await page.getByRole("button", { name: "按原请求重试", exact: true }).waitFor();
  await page.getByRole("button", { name: "按原请求重试", exact: true }).click();
  await page.getByRole("heading", { name: "整组更正已保存", exact: true }).waitFor();
  assert.deepEqual(attempts.at(-1), attempts.at(-2));

  // Full-group void stays explicit and carries every original member.
  await page.evaluate(value => window.mount(value), auth("E"));
  await page.getByLabel("更正范围").selectOption("void_all");
  await page.getByLabel("整组更正原因").fill("合成客户明确整组取消");
  await page.getByRole("button", { name: "核对整组更正", exact: true }).click();
  await page.getByRole("heading", { name: "确认作废全组明细", exact: true }).waitFor();
  for (const id of ["SYN-A", "SYN-B"]) await page.getByLabel(`确认 ${id} 的数量和金额`).check();
  await page.getByRole("button", { name: "确认整组更正", exact: true }).click();
  await page.getByRole("heading", { name: "整组更正已保存", exact: true }).waitFor();
  assert.equal(attempts.at(-1).body.members.every(row => row.void && row.newQty === 5000), true);

  const quantityOnly = auth("F"); quantityOnly.permissions.actionPermissions = ["order.quantity.adjust"];
  await page.evaluate(value => window.mount(value), quantityOnly);
  await page.getByLabel("更正范围").selectOption("void_all");
  await page.getByLabel("整组更正原因").fill("无作废权限的合成反例");
  assert.equal(await page.getByRole("button", { name: "核对整组更正", exact: true }).isDisabled(), true);
  const voidOnly = auth("G"); voidOnly.permissions.actionPermissions = ["order.void"];
  await page.evaluate(value => window.mount(value), voidOnly);
  await page.getByLabel("SYN-A 新数量").waitFor();
  await page.getByLabel("SYN-A 新数量").fill("4000");
  assert.equal(await page.getByRole("button", { name: "核对整组更正", exact: true }).isDisabled(), true);
  await page.getByLabel("SYN-A 更正动作").selectOption("void");
  await page.getByLabel("整组更正原因").fill("客户仅取消合成第一行，保留第二行");
  await page.getByRole("button", { name: "核对整组更正", exact: true }).click();
  for (const id of ["SYN-A", "SYN-B"]) await page.getByLabel(`确认 ${id} 的数量和金额`).check();
  await page.getByRole("button", { name: "确认整组更正", exact: true }).click();
  await page.getByRole("heading", { name: "整组更正已保存", exact: true }).waitFor();
  assert.equal(attempts.at(-1).body.members[0].void, true);
  assert.equal(attempts.at(-1).body.members[1].void, false);
  assert.equal(previews.at(-1).value.totals.newQty, 5000);
  assert.equal(previews.at(-1).value.totals.finalAmount, 2000);
  assert.deepEqual(pageErrors, []);
  console.log("PASS print-group client and real dialog with synthetic HTTP: complete/versioned frozen-rate receipts, missing amounts, explicit full-member review, no increases, single-line/whole-group void, combined permissions, duplicate click, durable exact retry after 503/bad-200/409, remount, beforeunload, first rejection and cross-session late response. No real ERP data used.");
} finally {
  releaseHeld?.();
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
