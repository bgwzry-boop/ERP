import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createApiServer } from "../server/apiServer.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { closeTestServer, getTestServerBaseUrl, listenTestServer } from "./helpers/apiIntegrationTestHarness.mjs";
import { exactPaymentFixture } from "./helpers/statementExactPaymentFixture.mjs";
import { createLocalAttachmentRepository } from "../server/attachmentRepository.mjs";
import { createLocalBusinessDecisionAuthorizationRepository } from "../server/businessDecisionAuthorizationRepository.mjs";

const fixture = exactPaymentFixture(), storage = await mkdtemp(join(tmpdir(), "erp-settlement-browser-"));
const varianceCases = ["carry_to_debt", "approved_allowance", "bill_needs_recalc", "waiting_more_payments", "other"];
fixture.statements.push(...varianceCases.map(handling => ({ ...fixture.statements[0], id: `ST-UI-${handling}`, received: 90, variance: 10, status: "差额待确认" })));
const employee = { id: "EMP-UI-DECIDER", bizNo: "UI-DECIDER", name: "合成授权决定人", profileStatus: "active", source: "master_data_import_review" };
const authorizations = ["statement_variance", "statement_write_off"].map(decisionScope => ({ authorizationId: `AUTH-UI-${decisionScope}`, employeeId: employee.id,
  decisionScope, maxAmount: 1000, activeFrom: "2020-01-01T00:00:00Z", status: "active", authorizationNote: "合成浏览器验收授权", revision: 1 }));
const attachmentRepository = createLocalAttachmentRepository({ storageRoot: storage });
const authorizationRepository = createLocalBusinessDecisionAuthorizationRepository({ storageRoot: storage });
const output = resolve(".erp-local-storage/finance-r4"); await mkdir(output, { recursive: true });
const server = createApiServer(withLocalRepositoryFixture({ runtimeMode: "test", runtimeStorageRoot: storage, applyProductionEnvFile: false,
  seedSource: "synthetic", authMode: "prototype", fixedPreviewUserId: "", authSecret: randomBytes(32).toString("hex"), allowLegacyIdentityHeaders: false,
  allowDefaultSeedUser: false, allowActionPermissionOverride: false,
  coreWorkspaceReadRepository: { kind: "test_memory", loadState: async () => ({ statements: fixture.statements, employees: [employee], statementSendRecords: fixture.statementSendRecords, statementConfirmationRecords: fixture.statementConfirmationRecords }) },
  paymentRecordRepository: { kind: "test_memory", loadState: async () => ({ paymentRecords: fixture.paymentRecords }) },
  attachmentRepository: { ...attachmentRepository, loadState: async () => ({ ...attachmentRepository.loadState(), attachments: fixture.attachments }) },
  businessDecisionAuthorizationRepository: { ...authorizationRepository, loadState: async () => ({ businessDecisionAuthorizations: authorizations }) },
}));
let browser;
try {
  await server.ready; await listenTestServer(server); const base = getTestServerBaseUrl(server);
  const login = await fetch(base + "/api/auth/prototype-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "U-OFFICE-A" }) }).then(response => response.json());
  const authState = { source: "api", session: login.session, permissions: login.permissions };
  const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';
    import {StatementDetailDialog} from './docs/prototypes/raw-material-roll-inventory-review/src/StatementDetailDialog.jsx';
    import './src/styles/tokens.css';import './docs/prototypes/raw-material-roll-inventory-review/src/styles.css';
    window.closeCount=0;const root=createRoot(document.getElementById('app'));window.mountStatement=id=>root.render(<StatementDetailDialog key={id} statementId={id} authState={${JSON.stringify(authState)}} onClose={()=>window.closeCount++} />);window.mountStatement(${JSON.stringify(fixture.statements[0].id)});`,
    resolveDir: process.cwd(), loader: "jsx" }, bundle: true, write: false, outfile: "view.js", jsx: "automatic", logLevel: "silent",
    alias: { react: resolve("node_modules/react"), "react-dom": resolve("node_modules/react-dom") },
    loader: { ".svg": "dataurl", ".png": "dataurl" }, define: { "import.meta.env": '{"VITE_ERP_API_BASE_URL":"/api"}', "process.env.NODE_ENV": '"test"' } });
  browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(10000);
  const errors = [], requests = [], writeOffRequests = []; page.on("pageerror", error => { errors.push(error.message); console.log("Browser error:", error.message); });
  await page.route("**/*", route => route.request().url().startsWith(base + "/") ? route.continue() : route.abort());
  await page.route(base + "/", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="zh-CN"><title>本地合成财务验收 · 未部署</title><div id="app"></div></html>' }));
  let lost = false;
  await page.route("**/api/statements/*/exact-payment-settle", async route => {
    requests.push({ body: route.request().postDataJSON(), key: route.request().headers()["idempotency-key"] });
    const response = await route.fetch();
    if (!lost && response.ok()) { lost = true; await route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"合成测试：已保存但回执丢失"}' }); }
    else if (requests.length === 2) await route.fulfill({ status: 409, contentType: "application/json", body: '{"message":"合成测试：重试中途冲突，原请求仍待确认"}' });
    else await route.fulfill({ response });
  });
  await page.route("**/api/statements/*/write-off", async route => {
    writeOffRequests.push({ body: route.request().postDataJSON(), key: route.request().headers()["idempotency-key"] });
    const response = await route.fetch();
    if (writeOffRequests.length === 1 && response.ok()) await route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"合成测试：授权核销已保存但回执丢失"}' });
    else await route.fulfill({ response });
  });
  await page.goto(base + "/");
  for (const file of bundle.outputFiles.filter(row => row.path.endsWith(".css"))) await page.addStyleTag({ content: file.text });
  await page.addScriptTag({ content: bundle.outputFiles.find(row => row.path.endsWith(".js")).text });
  await page.getByRole("button", { name: "足额款结清", exact: true }).click();
  await page.getByLabel("匹配收款记录").selectOption("PAY-EXACT-SYNTHETIC");
  await page.getByLabel("到账留存凭证").selectOption("ATT-EXACT-PAY");
  await page.getByLabel("本账单客户回复").selectOption("CONF-EXACT-SYNTHETIC");
  await page.getByLabel("客户消息或截图凭证").selectOption("ATT-EXACT-CUSTOMER");
  await page.getByLabel("到账与客户回复的匹配依据").fill("合成核对：本客户本账期100元到账及回复逐项一致");
  await page.getByLabel("已核对当前账单、金额及对应凭据。").check();
  await page.getByLabel("匹配收款记录").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "exact-evidence-1440.png"), fullPage: true });
  await page.getByRole("button", { name: "核对结算影响" }).click();
  const panel = page.getByRole("region", { name: "足额款结清" });
  await page.getByRole("button", { name: "确认办理" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "exact-review-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 800, height: 900 });
  assert.equal(await page.locator("dialog").evaluate(node => node.scrollWidth <= node.clientWidth), true);
  await page.screenshot({ path: join(output, "exact-review-800.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "确认办理" }).click();
  await page.getByRole("button", { name: "用原内容重试" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "返回修改" }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "关闭对账明细" }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "差额处理", exact: true }).isDisabled(), true);
  await page.screenshot({ path: join(output, "exact-uncertain-1440.png"), fullPage: true });
  await page.getByRole("button", { name: "用原内容重试" }).click();
  await page.getByRole("alert").filter({ hasText: "重试中途冲突" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "用原内容重试" }).isDisabled(), false);
  assert.equal(await page.getByRole("button", { name: "刷新账单后重新核对" }).count(), 0, "A later conflict cannot discard an earlier uncertain write");
  assert.equal(await page.getByRole("button", { name: "关闭对账明细" }).isDisabled(), true);
  await page.getByRole("button", { name: "用原内容重试" }).click();
  await page.getByText(/后续更正请走独立处理/u).waitFor();
  assert.equal(requests.length, 3); assert.deepEqual(requests[0], requests[1]); assert.deepEqual(requests[0], requests[2]);
  assert.equal(await page.evaluate(() => window.closeCount), 0);
  await page.setViewportSize({ width: 800, height: 900 });
  await page.screenshot({ path: join(output, "exact-closed-800.png"), fullPage: true });
  assert.equal(await page.locator("dialog").evaluate(node => node.scrollWidth <= node.clientWidth), true);
  assert.deepEqual(errors, []);
  assert.equal(await panel.count(), 0, "A closed accounting period offers no ordinary exact-settlement form");
  await page.setViewportSize({ width: 1440, height: 1000 });
  async function enterDecision(needsFile) {
    await page.getByLabel("本次决定与办理依据").fill("合成验收：逐项核对本期十元差额及有权决定");
    await page.getByLabel(/^业务决定人/u).selectOption(employee.id);
    await page.getByLabel(/^决定渠道/u).selectOption("wechat");
    await page.getByLabel("决定时间", { exact: true }).fill(new Date().toISOString().slice(0, 16));
    await page.getByLabel("授权依据", { exact: true }).fill("合成客户与有权人员消息已核对");
    await page.getByLabel("决定内容", { exact: true }).fill("合成验收：按已选择的处理结果办理本期十元差额");
    if (needsFile) {
      await page.locator('input[type="file"]').first().setInputFiles({ name: "synthetic-decision.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ1cAAAAASUVORK5CYII=", "base64") });
      await page.getByText("synthetic-decision.png", { exact: true }).waitFor();
      await page.getByText("正在处理凭据…", { exact: true }).waitFor({ state: "detached" });
    }
    await page.getByLabel("已核对当前账单、金额及对应凭据。").check();
    await page.getByRole("button", { name: "核对结算影响" }).click();
    await page.getByRole("button", { name: "确认办理" }).waitFor();
  }
  for (const handling of varianceCases) {
    const id = `ST-UI-${handling}`;
    await page.evaluate(value => window.mountStatement(value), id);
    await page.getByRole("button", { name: "差额处理", exact: true }).click();
    await page.getByLabel(/^差额处理结果/u).selectOption(handling);
    await enterDecision(false);
    await page.getByRole("button", { name: "确认办理" }).click();
    await page.getByText("差额处理已保存。", { exact: true }).waitFor();
    if (["carry_to_debt", "approved_allowance"].includes(handling)) {
      await page.getByRole("button", { name: "授权结算与核销", exact: true }).click();
      await enterDecision(true);
      if (handling === "carry_to_debt") {
        await page.getByRole("button", { name: "确认办理" }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(output, "authorized-review-1440.png"), fullPage: true });
      }
      await page.getByRole("button", { name: "确认办理" }).click();
      if (handling === "carry_to_debt") {
        await page.getByRole("button", { name: "用原内容重试" }).waitFor();
        await page.getByRole("button", { name: "用原内容重试" }).click();
        assert.deepEqual(writeOffRequests[0], writeOffRequests[1], "Authorized write-off retry preserves the original body/key and has no invented timestamp");
      }
      await page.getByText("授权结算与核销已保存。", { exact: true }).waitFor();
      await page.getByText(/后续更正请走独立处理/u).waitFor();
    }
    const current = await fetch(base + `/api/statements/${id}`, { headers: { authorization: `Bearer ${login.session.accessToken}` } }).then(response => response.json());
    assert.equal(current.receivable, 100); assert.equal(current.received, 90);
    assert.equal(current.varianceRecords.length, 1); assert.equal(current.varianceRecords[0].handlingResult, handling);
    const decisions = await fetch(base + `/api/business-decisions?businessType=statement&businessId=${id}`, { headers: { authorization: `Bearer ${login.session.accessToken}` } }).then(response => response.json());
    assert.equal(decisions.items.length, ["carry_to_debt", "approved_allowance"].includes(handling) ? 2 : 1);
    assert.equal(decisions.items.every(row => row.enteredByUserId === "U-OFFICE-A" && row.decisionMakerEmployeeId === employee.id), true);
    if (["carry_to_debt", "approved_allowance"].includes(handling)) {
      assert.equal(current.writeOffRecords.length, 1);
      assert.equal(current.writeOffRecords[0].writeOffAmount, handling === "approved_allowance" ? 10 : 0);
      assert.equal(current.status, handling === "approved_allowance" ? "已核销" : "已确认欠款");
      if (handling === "approved_allowance") assert.match(await page.locator("dialog > header").innerText(), /已结清/u, "The UI maps the existing internal write-off status without changing accounting state");
      assert.equal(decisions.items.find(row => row.decisionScope === "statement_write_off").evidenceAttachmentIds.length, 1);
    } else assert.equal(current.writeOffRecords.length, 0, "Nonfinal variance outcomes do not silently close the period");
  }
  assert.deepEqual(errors, []);
  console.log(`PASS actual StatementDetailDialog + signed isolated HTTP: exact dual proof/review and uncertain-then-conflict retry; all five delegated variance outcomes; independent uploaded decision proof for allowance/carry settlement; original authorized write-off retry; closed readback at 800px. Screenshots: ${output}`);
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) console.log("Browser fixture:", await page.locator("body").innerText());
  throw error;
} finally { await browser?.close(); await closeTestServer(server); await rm(storage, { recursive: true, force: true }); }
