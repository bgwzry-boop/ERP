import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { createApiServer } from "../server/apiServer.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { buildPublishedOrderPriceFixture } from "./helpers/publishedOrderPriceFixture.mjs";
import {
  closeTestServer,
  getTestServerBaseUrl,
  listenTestServer,
  requestJson,
} from "./helpers/apiIntegrationTestHarness.mjs";
import { mapApiOrderLineToLocal } from "../src/services/officeOrderPoolApiClient.js";
import { mapRecognizedDraftRows } from "../src/services/officeOrderApiClient.js";
const confirmAttempts = [];
let confirmReceiptFaults = 2;
let quoteReceiptFaults = 2;
const quoteAttempts = [];
const directReads = [];
let failFirstDirectRead = true;
const dir = await mkdtemp(join(tmpdir(), "erp-office-pricing-ui-"));
let backend, server, browser;
try {
  backend = createApiServer(
    withLocalRepositoryFixture({
      runtimeMode: "test",
      runtimeStorageRoot: dir,
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
        loadState: () => buildPublishedOrderPriceFixture({ bagPrice: 0.9 }),
      },
    }),
  );
  await backend.ready;
  await listenTestServer(backend);
  const base = getTestServerBaseUrl(backend);
  const login = await requestJson(base, "/api/auth/prototype-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "U-MANAGER-A" }),
  });
  const auth = login.body;
  const token = auth.session.accessToken;
  const recognized = await requestJson(base, "/api/order-drafts/recognize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      customerId: "C003",
      sourceText: "王五包装 30*38红5000个 明天自提",
      idempotencyKey: "ui-office-pricing-create",
    }),
  });
  assert.equal(recognized.status, 200);
  const selected = {
    ...recognized.body.draft,
    id: recognized.body.draft.draftId,
    sourceChannel: "manual",
    sourceText: recognized.body.draft.sourceText,
    lines: mapRecognizedDraftRows(recognized.body),
  };
  const initial = {
    authState: { ...auth, source: "runtime" },
    permissionContext: auth.permissions,
    entryDraftId: selected.id,
    data: {
      orderDrafts: [
        {
          draft: { id: "DO-NOT-SELECT", sourceText: "错误的第一条草稿" },
          rows: [],
        },
      ],
      orderLines: [],
    },
  };
  await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Workspace from './docs/prototypes/raw-material-roll-inventory-review/src/OrderPricingEntryWorkspace.jsx';import {saveOfficeDraft,confirmOfficeDraftViaApi,recognizeOfficeDraft} from './src/services/officeOrderApiClient.js';import './docs/prototypes/raw-material-roll-inventory-review/src/styles.css';
 const formal=${JSON.stringify(initial)};formal.actions={refreshAll:async()=>{},recognizeOrderText:sourceText=>recognizeOfficeDraft({authState:formal.authState,sourceText},{serverRequired:true}),saveOrderDraft:input=>saveOfficeDraft({...input,draftRows:input.rows,authState:formal.authState},{serverRequired:true}),confirmOrderDraft:input=>confirmOfficeDraftViaApi({...input,draftRows:input.rows,authState:formal.authState},{serverRequired:true})};window.formal=formal;const root=createRoot(document.getElementById('root'));window.render=()=>root.render(<Workspace formal={formal} onNavigate={()=>{}} quoteDraft={window.quoteOverride} loadDraft={window.loadOverride}/>);window.render();`,
      resolveDir: process.cwd(),
      loader: "jsx",
    },
    outfile: join(dir, "harness.js"),
    bundle: true,
    format: "esm",
    jsx: "automatic",
    logLevel: "silent",
    alias: {
      react: join(process.cwd(), "node_modules/react"),
      "react-dom": join(process.cwd(), "node_modules/react-dom"),
    },
    define: {
      "import.meta.env": JSON.stringify({
        VITE_ERP_API_BASE_URL: "/api",
        VITE_ERP_RUNTIME_MODE: "strict",
      }),
    },
  });
  server = createServer(async (req, res) => {
    if (req.url.startsWith("/api/")) {
      let body = "";
      for await (const part of req) body += part;
      const r = await fetch(`${base}${req.url}`, {
        method: req.method,
        headers: {
          "content-type": "application/json",
          authorization: req.headers.authorization || "",
          "idempotency-key": req.headers["idempotency-key"] || "",
        },
        ...(body ? { body } : {}),
      });
      if (req.method === "GET" && req.url.startsWith("/api/order-drafts?")) {
        const query = new URL(req.url, "http://isolated").searchParams;
        if (query.has("draftId")) {
          directReads.push({
            id: query.get("draftId"),
            queueOnly: query.get("queueOnly"),
            auth: req.headers.authorization,
          });
          if (failFirstDirectRead) {
            failFirstDirectRead = false;
            await r.text();
            res.writeHead(503, { "content-type": "application/json" });
            res.end(JSON.stringify({ message: "模拟定点读取暂时失败" }));
            return;
          }
        }
      }
      if (req.url.endsWith("/confirm")) {
        confirmAttempts.push({
          key: req.headers["idempotency-key"],
          body: JSON.parse(body),
        });
        if (confirmReceiptFaults > 0 && r.status === 200) {
          await r.text();
          const first = confirmReceiptFaults-- === 2;
          res.writeHead(first ? 503 : 409, {
            "content-type": "application/json",
          });
          res.end(
            JSON.stringify({
              message: first
                ? "模拟确认回执丢失，请重试"
                : "模拟后续冲突，原结果仍待核对",
            }),
          );
          return;
        }
      }
      if (
        req.url.endsWith("/price-quote") &&
        quoteReceiptFaults > 0 &&
        r.status === 200
      ) {
        quoteAttempts.push({
          key: req.headers["idempotency-key"],
          body: JSON.parse(body),
        });
        await r.text();
        const first = quoteReceiptFaults-- === 2;
        res.writeHead(first ? 200 : 409, {
          "content-type": "application/json",
        });
        res.end(
          JSON.stringify(
            first
              ? {
                  quote: {
                    quoteId: "WRONG-RECEIPT",
                    draftId: selected.id,
                    clientRevision: 1,
                    lines: [{ draftLineId: "OTHER-LINE", amount: 0 }],
                  },
                }
              : { message: "模拟报价后续冲突，原结果仍待核对" },
          ),
        );
        return;
      }

      res.writeHead(r.status, { "content-type": "application/json" });
      res.end(await r.text());
    } else if (req.url === "/harness.js" || req.url === "/harness.css") {
      res.setHeader(
        "content-type",
        req.url.endsWith(".js") ? "application/javascript" : "text/css",
      );
      res.end(await readFile(join(dir, req.url.slice(1))));
    } else {
      res.setHeader("content-type", "text/html");
      res.end(
        '<!doctype html><meta charset="UTF-8"><div id="root" style="height:100vh;padding:20px"></div><link rel="stylesheet" href="/harness.css"><script type="module" src="/harness.js"></script>',
      );
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page
    .getByRole("alert")
    .filter({ hasText: "模拟定点读取暂时失败" })
    .waitFor();
  await page
    .getByRole("button", { name: "重新读取所选草稿", exact: true })
    .click();
  await page.getByRole("heading", { name: "订单录入", exact: true }).waitFor();
  assert.equal(
    await page.locator("#pricing-source").inputValue(),
    selected.sourceText,
  );
  assert.equal(directReads.filter((read) => read.id === selected.id).length, 2);
  assert.ok(
    directReads.every(
      (read) => read.queueOnly === null && read.auth === `Bearer ${token}`,
    ),
  );
  await page.getByLabel("第1行数量", { exact: true }).fill("5001");
  await page.evaluate(() => {
    window.formal.data.orderDrafts = [];
    window.render();
  });
  assert.equal(
    await page.getByLabel("第1行数量", { exact: true }).inputValue(),
    "5001",
  );
  assert.equal(directReads.filter((read) => read.id === selected.id).length, 2);
  await page.getByLabel("第1行数量", { exact: true }).fill("5000");
  await page.getByRole("button", { name: "生成正式报价", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "没有取得完整报价回执" })
    .waitFor();
  assert.equal(
    await page.getByLabel("第1行规格", { exact: true }).isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "按原内容重试报价", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "模拟报价后续冲突" })
    .waitFor();
  assert.equal(
    await page.getByLabel("第1行规格", { exact: true }).isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "按原内容重试报价", exact: true })
    .click();
  assert.equal(quoteAttempts[0].key, quoteAttempts[1].key);
  assert.deepEqual(quoteAttempts[0].body, quoteAttempts[1].body);
  await page.getByText("¥4500.00", { exact: true }).first().waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "确认下单", exact: true })
      .isEnabled(),
    true,
  );
  await page
    .getByLabel("第1行订单分类", { exact: true })
    .selectOption("custom_special");
  await page.getByLabel("第1行规格", { exact: true }).fill("43*31*12");
  assert.equal(
    await page
      .getByRole("button", { name: "确认下单", exact: true })
      .isEnabled(),
    false,
  );
  await page.getByRole("button", { name: "生成正式报价", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "缺少已确认材料批次价" })
    .waitFor();
  await page.getByLabel("本行使用授权本单价").check();
  await page.getByLabel("第1行袋子单价（元/个）", { exact: true }).fill("0.8");
  await page
    .getByLabel("改价原因", { exact: true })
    .fill("客户议价，按确认的本单成交价");
  await page.getByRole("button", { name: "生成正式报价", exact: true }).click();
  await page.getByText("¥4000.00", { exact: true }).first().waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector(".order-pricing-entry").scrollWidth >
        document.querySelector(".order-pricing-entry").clientWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "/tmp/erp-office-pricing-desktop-20261024.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "确认下单", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "模拟确认回执丢失，请重试" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "按原内容重试确认", exact: true })
      .isEnabled(),
    true,
  );
  assert.equal(
    await page.getByLabel("第1行规格", { exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "查看订单池", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "生成正式报价", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "保存草稿", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "按原内容重试确认", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "模拟后续冲突，原结果仍待核对" })
    .waitFor();
  assert.equal(
    await page.getByLabel("第1行规格", { exact: true }).isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "按原内容重试确认", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "正式订单已生成" })
    .waitFor();
  assert.equal(confirmAttempts.length, 3);
  assert.equal(confirmAttempts[1].key, confirmAttempts[2].key);
  assert.deepEqual(confirmAttempts[1].body, confirmAttempts[2].body);
  assert.equal(confirmAttempts[0].key, confirmAttempts[1].key);
  assert.deepEqual(confirmAttempts[0].body, confirmAttempts[1].body);
  assert.equal(
    await page
      .getByRole("button", { name: "确认下单", exact: true })
      .isEnabled(),
    false,
  );
  const detail = await requestJson(
    base,
    `/api/order-drafts?draftId=${encodeURIComponent(selected.id)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.ok(/已生成|已确认/u.test(detail.body.items[0].status));
  // Cross-order supplementation is exercised through the actual controls and
  // the same authenticated service, including explicit prior-line review.
  const api = (path, body) =>
    requestJson(base, `/api${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  async function printedDraft(key) {
    const created = await api("/order-drafts/recognize", {
      customerId: "C003",
      sourceText: "王五包装 30*38红5000个 明天自提",
      idempotencyKey: `ui-print-${key}`,
    });
    assert.equal(created.status, 200);
    created.body.lines = created.body.lines.map((line) => ({
      ...line,
      orderType: "custom_print",
      printFlag: true,
      printSide: "single",
      printColor: "黑色",
      printContent: "合成补单商标A",
      productName: "合成补单商标A",
      artworkStatus: "uploaded",
    }));
    return created.body;
  }
  const originalPrint = await printedDraft("original");
  const oq = await api(
    `/order-drafts/${originalPrint.draft.draftId}/price-quote`,
    {
      expectedRevision: originalPrint.draft.clientRevision,
      lines: originalPrint.lines,
      idempotencyKey: "ui-print-original-price",
    },
  );
  assert.equal(oq.status, 200, JSON.stringify(oq.body));
  const oc = await api(`/order-drafts/${originalPrint.draft.draftId}/confirm`, {
    expectedRevision: oq.body.quote.clientRevision,
    lines: originalPrint.lines,
    pricingQuoteId: oq.body.quote.quoteId,
    idempotencyKey: "ui-print-original-confirm",
  });
  assert.equal(oc.status, 200, JSON.stringify(oc.body));
  const oldId = oc.body.orderLines[0].id;
  const oldDetail = await requestJson(base, `/api/order-lines/${oldId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(oldDetail.status, 200);
  const old = mapApiOrderLineToLocal(oldDetail.body.orderLine);
  const appended = await printedDraft("supplement");
  const appendDraft = {
    ...appended.draft,
    id: appended.draft.draftId,
    sourceChannel: "manual",
    lines: mapRecognizedDraftRows(appended),
  };
  await page.evaluate(
    ({ draft, oldLine }) => {
      window.formal.entryDraftId = draft.id;
      window.formal.data.orderDrafts = [draft];
      window.formal.data.orderLines = [
        {
          ...oldLine,
          print: "是",
          orderType: "custom_print",
          customerId: "C003",
          product: "合成补单商标A",
        },
      ];
      window.render();
    },
    { draft: appendDraft, oldLine: old },
  );
  await page
    .getByText("同批补单合组（关联尚未开印的原单）", { exact: true })
    .click();
  await page
    .locator(".pricing-supplement .pricing-check input")
    .first()
    .check();
  await page
    .getByLabel("同批印刷标识", { exact: true })
    .fill("UI-BATCH-20261024");
  await page
    .getByLabel("补单依据", { exact: true })
    .fill("原单未开印，与本次相同图案同批印刷");
  await page.getByLabel("已核实所选原单尚未开印，并与新单同批印刷").check();
  await page.getByRole("button", { name: "生成正式报价", exact: true }).click();
  await page.getByRole("heading", { name: "逐项确认原单价格修订" }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "确认下单", exact: true })
      .isEnabled(),
    false,
  );
  await page.locator(".pricing-review .pricing-check input").check();
  assert.equal(
    await page
      .getByRole("button", { name: "确认下单", exact: true })
      .isEnabled(),
    true,
  );
  assert.match(
    await page.locator(".pricing-review .pricing-check").innerText(),
    /¥4900[.]00 → ¥4800[.]00/u,
  );
  await page.screenshot({
    path: "/tmp/erp-office-pricing-supplement-20261024.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "确认下单", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "正式订单已生成" })
    .waitFor();
  // A real manual draft created from a real temporary hold is intentionally
  // absent from the queue read model. The selected-id fetch must recover its
  // authoritative customer, quantity and hold/intent linkage.
  const inventoryId = "30*38*10-红色-普通提-空白袋-A区-30*38";
  const holdSource = await api("/order-drafts/recognize", {
    customerId: "C002",
    sourceMessages: [
      {
        id: "UI-ENTRY-HOLD-MSG",
        conversationId: "UI-ENTRY-HOLD-GROUP",
        customerId: "C002",
        sender: "合成客户",
        senderRole: "customer",
        sentAt: "2099-07-12 10:00",
        text: "30*38红色有的话给我留5个",
      },
    ],
    idempotencyKey: "ui-direct-hold-source",
  });
  assert.equal(holdSource.status, 200, JSON.stringify(holdSource.body));
  const holdIntent = holdSource.body.inventoryIntents[0];
  assert.ok(holdIntent);
  const held = await api(`/inventory/intents/${holdIntent.intentId}/hold`, {
    expectedRevision: holdIntent.revision,
    inventoryItemId: inventoryId,
    candidateIndex: 0,
    qty: 5,
    expiresAt: "2099-07-13T19:30:00+08:00",
    reason: "隔离UI定点读取验证",
    idempotencyKey: "ui-direct-hold-create",
  });
  assert.equal(held.status, 200, JSON.stringify(held.body));
  const holdText = "我要空白袋30*38*10红色普通提5个明天自提";
  const holdDraft = await api("/order-drafts/recognize", {
    customerId: "C002",
    sourceChannel: "manual",
    sourceText: holdText,
    sourceHoldId: held.body.hold.reservationId,
    sourceIntentId: holdIntent.intentId,
    idempotencyKey: "ui-direct-hold-convert",
  });
  assert.equal(holdDraft.status, 200, JSON.stringify(holdDraft.body));
  assert.equal(holdDraft.body.draft.recognitionContext?.queueItemId, undefined);
  await page.evaluate((id) => {
    window.formal.entryDraftId = id;
    window.formal.data.orderDrafts = [];
    window.render();
  }, holdDraft.body.draft.draftId);
  await page.getByRole("heading", { name: "订单录入", exact: true }).waitFor();
  assert.equal(await page.locator("#pricing-source").inputValue(), holdText);
  assert.equal(
    await page.getByLabel("第1行数量", { exact: true }).inputValue(),
    "5",
  );
  await page.getByRole("button", { name: "生成正式报价", exact: true }).click();
  await page.getByText("¥4.50", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "确认下单", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "正式订单已生成" })
    .waitFor();
  const holdConfirm = confirmAttempts.at(-1).body;
  assert.equal(holdConfirm.lines[0].customerId, "C002");
  assert.equal(
    holdConfirm.lines[0].recognitionEvidence.sourceHoldId,
    held.body.hold.reservationId,
  );
  assert.equal(
    holdConfirm.lines[0].recognitionEvidence.sourceIntentId,
    holdIntent.intentId,
  );
  assert.ok(
    directReads.some(
      (read) =>
        read.id === holdDraft.body.draft.draftId && read.queueOnly === null,
    ),
  );
  // A session/id change aborts the previous point read; a late response must
  // not replace the new identity's draft, and bad matching receipts can retry.
  await page.evaluate((lines) => {
    window.deferredReads = [];
    window.loadOverride = (input, options) =>
      new Promise((resolve) =>
        window.deferredReads.push({ input, signal: options.signal, resolve }),
      );
    window.formal.data.orderDrafts = [];
    window.formal.entryDraftId = "DIRECT-READ-A";
    window.formal.authState = {
      ...window.formal.authState,
      session: { accessToken: "read-session-A" },
    };
    window.readLines = lines;
    window.render();
  }, selected.lines);
  await page.waitForFunction(() => window.deferredReads.length === 1);
  await page.evaluate(() => {
    window.formal.entryDraftId = "DIRECT-READ-B";
    window.formal.authState = {
      ...window.formal.authState,
      session: { accessToken: "read-session-B" },
    };
    window.render();
  });
  await page.waitForFunction(() => window.deferredReads.length === 2);
  assert.equal(
    await page.evaluate(() => window.deferredReads[0].signal.aborted),
    true,
  );
  await page.evaluate(() =>
    window.deferredReads[1].resolve({
      source: "api",
      item: {
        draft: { id: "WRONG-DRAFT", sourceText: "不可接受的错单" },
        rows: window.readLines,
      },
    }),
  );
  await page
    .getByRole("button", { name: "重新读取所选草稿", exact: true })
    .click();
  await page.waitForFunction(() => window.deferredReads.length === 3);
  await page.evaluate(() =>
    window.deferredReads[2].resolve({
      source: "api",
      item: {
        draft: {
          id: "DIRECT-READ-B",
          revision: 1,
          sourceChannel: "manual",
          sourceText: "B身份选中的权威草稿",
        },
        rows: window.readLines,
      },
    }),
  );
  await page.getByRole("heading", { name: "订单录入", exact: true }).waitFor();
  await page.evaluate(() =>
    window.deferredReads[0].resolve({
      source: "api",
      item: {
        draft: {
          id: "DIRECT-READ-A",
          revision: 1,
          sourceChannel: "manual",
          sourceText: "A身份迟到的旧草稿",
        },
        rows: window.readLines,
      },
    }),
  );
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(
    await page.locator("#pricing-source").inputValue(),
    "B身份选中的权威草稿",
  );
  await page.getByLabel("第1行数量", { exact: true }).fill("5002");
  await page.evaluate(() => {
    window.formal.data.orderDrafts = [
      { draft: { id: "UNRELATED-QUEUE" }, rows: [] },
    ];
    window.render();
  });
  assert.equal(
    await page.getByLabel("第1行数量", { exact: true }).inputValue(),
    "5002",
  );
  assert.equal(await page.evaluate(() => window.deferredReads.length), 3);
  await page.evaluate(() => {
    window.formal.entryDraftId = "QUEUE-MAPPED";
    window.formal.data.orderDrafts = [
      {
        draft: {
          id: "QUEUE-MAPPED",
          revision: 1,
          sourceText: "队列嵌套形态草稿",
        },
        rows: window.readLines,
      },
    ];
    window.render();
  });
  assert.equal(
    await page.locator("#pricing-source").inputValue(),
    "队列嵌套形态草稿",
  );
  assert.equal(await page.evaluate(() => window.deferredReads.length), 3);
  // Delayed old-session responses must never clear the current session's
  // unrelated pending write. This exercises the mounted ownership guard in the
  // actual component without making any request as the synthetic identities.
  await page.evaluate(
    ({ selectedDraft, auth }) => {
      window.deferredQuotes = [];
      window.pendingOwner = "";
      window.formal.actions.setOrderEntryWritePending = (pending, owner) => {
        if (pending) window.pendingOwner = owner;
        else if (owner === window.pendingOwner) window.pendingOwner = "";
      };
      window.quoteOverride = (input) =>
        new Promise((resolve) =>
          window.deferredQuotes.push({ input, resolve }),
        );
      window.identityDraft = {
        ...selectedDraft,
        sourceChannel: "manual",
        lines: selectedDraft.lines.map((line) => ({
          ...line,
          print: "否",
          orderType: "stock",
          qty: 5000,
        })),
      };
      window.formal.data.orderDrafts = [window.identityDraft];
      window.formal.entryDraftId = window.identityDraft.id;
      window.formal.authState = {
        ...auth,
        session: { ...auth.session, accessToken: "synthetic-session-A" },
      };
      window.render();
    },
    { selectedDraft: selected, auth },
  );
  await page.getByRole("button", { name: "生成正式报价", exact: true }).click();
  await page.waitForFunction(() => window.deferredQuotes.length === 1);
  const ownerA = await page.evaluate(() => window.pendingOwner);
  await page.evaluate(() => {
    window.formal.authState = {
      ...window.formal.authState,
      session: {
        ...window.formal.authState.session,
        accessToken: "synthetic-session-B",
      },
    };
    window.render();
  });
  await page.getByRole("button", { name: "生成正式报价", exact: true }).click();
  await page.waitForFunction(() => window.deferredQuotes.length === 2);
  const ownerB = await page.evaluate(() => window.pendingOwner);
  assert.notEqual(ownerA, ownerB);
  const resolveQuote = async (index) =>
    page.evaluate((i) => {
      const pending = window.deferredQuotes[i],
        input = pending.input;
      pending.resolve({
        source: "api",
        quote: {
          quoteId: `OQ-SESSION-${i}`,
          draftId: input.draftId,
          clientRevision: input.clientRevision + 1,
          excludedDraftLineIds: [],
          groups: [],
          affectedOrders: [],
          lines: input.rows.map((row) => ({
            draftLineId: row.id,
            bagPrice: 0.9,
            printPrice: 0,
            otherFee: 0,
            adjustmentAmount: 0,
            chargeableQty: row.qty,
            amount: row.qty * 0.9,
          })),
        },
      });
    }, index);
  await resolveQuote(0);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.evaluate(() => window.pendingOwner), ownerB);
  assert.equal(
    await page.getByLabel("第1行规格", { exact: true }).isDisabled(),
    true,
  );
  await resolveQuote(1);
  await page.getByText("¥4500.00", { exact: true }).first().waitFor();
  assert.equal(await page.evaluate(() => window.pendingOwner), "");
  await page.evaluate(() => {
    window.formal.authState = {
      ...window.formal.authState,
      session: {
        ...window.formal.authState.session,
        accessToken: "synthetic-session-A",
      },
    };
    window.render();
  });
  await page
    .getByRole("button", { name: "按原内容重试报价", exact: true })
    .click();
  await page.waitForFunction(() => window.deferredQuotes.length === 3);
  assert.equal(
    await page.evaluate(() => window.deferredQuotes[0].input.idempotencyKey),
    await page.evaluate(() => window.deferredQuotes[2].input.idempotencyKey),
  );
  await resolveQuote(2);
  await page.getByText("¥4500.00", { exact: true }).first().waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Office pricing actual component + signed real isolated HTTP: authoritative non-queue manual/hold draft read with retry, queue shape parity, stable cached edits, stale session/id response cancellation, published quote, edited inputs invalidate quote, special missing material, authorized manual price/reason, real confirm receipt, same-key lost-receipt retry, persisted formal order and explicit cross-order affected-line acknowledgement passed. Screenshot /tmp/erp-office-pricing-desktop-20261024.png",
  );
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
  if (backend) await closeTestServer(backend);
  await rm(dir, { recursive: true, force: true });
}
