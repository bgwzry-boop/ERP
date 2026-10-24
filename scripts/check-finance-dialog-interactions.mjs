import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Isolated component harness only: synthetic HTTP responses, never a deployed
// business API. The integrated complete-review shell is verified separately.
const directory = await mkdtemp(join(tmpdir(), "erp-finance-dialogs-"));
let server;
let browser;
try {
  await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {StatementDetailDialog} from './docs/prototypes/raw-material-roll-inventory-review/src/StatementDetailDialog.jsx';
    import {PrintJobDetailDialog} from './docs/prototypes/raw-material-roll-inventory-review/src/PrintJobDetailDialog.jsx';
    import './docs/prototypes/raw-material-roll-inventory-review/src/styles.css';
    const root=createRoot(document.getElementById('root'));
    window.show=(mode='statement',permissions=['statement.preview','statement.payment.record','statement.send','attachment.view','attachment.create','fulfillment.print'])=>{
      const props={authState:{source:'runtime',session:{accessToken:'synthetic-ui-token'},permissions:{user:{userId:'UI-CHECK'},actionPermissions:permissions}},onClose:()=>root.render(null),onUpdated:()=>{window.saved=(window.saved||0)+1;}};
      root.render(mode==='statement'?<StatementDetailDialog statementId="ST-UI" {...props}/>:<PrintJobDetailDialog printJobId="PJ-UI" {...props}/>);
    }; window.show();`, resolveDir: process.cwd(), loader: "jsx" }, outfile: join(directory, "harness.js"), bundle: true, format: "esm", jsx: "automatic", logLevel: "silent",
    // The review app has its own installed dependencies. Components and the
    // harness renderer must share one React instance, as Vite's dedupe does.
    alias: { react: join(process.cwd(), "node_modules/react"), "react-dom": join(process.cwd(), "node_modules/react-dom") },
    define: { "import.meta.env": JSON.stringify({ VITE_ERP_API_BASE_URL: "/api", VITE_ERP_RUNTIME_MODE: "strict" }) },
  });
  server = createServer(async (request, response) => {
    if (request.url === "/harness.js" || request.url === "/harness.css") {
      response.setHeader("content-type", request.url.endsWith(".js") ? "application/javascript" : "text/css");
      response.end(await readFile(join(directory, request.url.slice(1))));
    } else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><div id="root"></div><link rel="stylesheet" href="/harness.css"><script type="module" src="/harness.js"></script>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const failedRequests = []; page.on("requestfailed", request => failedRequests.push({ path: new URL(request.url()).pathname, failure: request.failure()?.errorText }));
  let received = 200;
  let missingFinancialAmounts = false;
  let revision = 3;
  let payments = [];
  let paymentAttempts = [];
  let jobStatus = "queued";
  let dispatchAttempts = [];
  const communication = [];
  await page.route("**/api/**", async route => {
    const request = route.request(); const url = new URL(request.url());
    const json = body => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/statements/ST-UI" && request.method() === "GET") return json({ id: "ST-UI", customerName: "组件验收客户", customerId: "C-UI", period: "2026-09", receivable: missingFinancialAmounts ? undefined : 1000, received: missingFinancialAmounts ? undefined : received, currentUnpaid: missingFinancialAmounts ? undefined : 1000 - received, historicalDebt: 0, revision, status: "差额待确认", payments,
      sendRecordId: "SEND-UI", sendRecords: [{ sendRecordId: "SEND-UI", statementId: "ST-UI", sentTo: "实际客户", channel: "wechat", sentAt: "2026-10-01T00:00:00Z" }],
      attachments: [{ attachmentId: "ATT-UI", ownerType: "statement", ownerId: "ST-UI", purpose: "payment_screenshot", hasContent: true, status: "uploaded", fileName: "合成到账凭证.png" }],
      lines: [{ statementLineId: "SL-UI", orderNo: "O-UI", productName: "验收袋", goodsSpec: "35×27 白色", deliveredQty: 1000, chargeableQty: 1000, finalAmount: 1000 }] });
    if (url.pathname.endsWith("/payments")) {
      const body = request.postDataJSON(); paymentAttempts.push({ body, key: request.headers()["idempotency-key"] });
      if (paymentAttempts.length === 1) return route.abort("failed");
      received = body.amount; revision += 1; payments = [{ paymentRecordId: "PAY-UI", statementId: "ST-UI", amount: received, paidAt: body.paidAt, remark: body.remark }];
      return json({ payment: payments[0], statementRevision: revision, operationLogId: "LOG-PAY-UI" });
    }
    if (url.pathname === "/api/print-jobs/PJ-UI") return json({ printJob: { printJobId: "PJ-UI", targetId: "F-UI", printDeviceName: "合成测试打印机", driverMode: "system_printer", jobStatus, payload: { printTemplate: { title: "送货单", paper: { name: "241mm 连续纸" }, fields: { customerName: "打印验收客户", goodsSummary: "35×27 白色", quantity: 1000 } } } } });
    if (url.pathname.endsWith("/dispatch")) { dispatchAttempts.push(request.postDataJSON()); jobStatus = "sent"; return json({ printJob: { printJobId: "PJ-UI", jobStatus, driverMode: "system_printer" }, dispatchResult: { jobStatus }, operationLogId: "LOG-PJ-UI" }); }
    if (url.pathname.endsWith("/preview")) return json({ statementId: "ST-UI", downloadToken: "DL-UI", lines: [], summary: {}, operationLogId: "LOG-EXPORT-UI" });
    if (url.pathname.endsWith("/exports/DL-UI")) return route.fulfill({ contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers: { "content-disposition": "attachment; filename=statement-ui.xlsx", "access-control-expose-headers": "content-disposition" }, body: Buffer.from("synthetic-download-contract") });
    if (url.pathname === "/api/attachments/ATT-UI/content") return route.fulfill({ contentType: "image/png", body: Buffer.from("synthetic-attachment-contract") });
    if (url.pathname === "/api/attachments/binary") {
      assert.equal(url.searchParams.get("ownerType"), "statement");
      assert.equal(url.searchParams.get("ownerId"), "ST-UI");
      assert.equal(url.searchParams.get("purpose"), "payment_screenshot");
      return json({ attachmentId: "ATT-UPLOADED", ownerType: "statement", ownerId: "ST-UI", purpose: "payment_screenshot", fileName: "新到账截图.png", hasContent: true, status: "uploaded", fileType: "image" });
    }
    if (url.pathname.endsWith("/mark-sent")) { communication.push({ action: "sent", body: request.postDataJSON() }); revision++; return json({ statementId: "ST-UI", sendRecordId: "SEND-UI", operationLogId: "LOG-SENT-UI" }); }
    if (url.pathname.endsWith("/customer-confirmation")) { communication.push({ action: "confirmation", body: request.postDataJSON() }); revision++; return json({ statementId: "ST-UI", sendRecordId: "SEND-UI", confirmationRecordId: "CONF-UI", operationLogId: "LOG-CONF-UI" }); }
    return route.fulfill({ status: 404, body: JSON.stringify({ message: `Unexpected ${url.pathname}` }) });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  try {
    await page.getByText("组件验收客户 · 2026-09").waitFor();
  } catch (cause) {
    throw new Error(`Statement dialog did not load: ${JSON.stringify({ errors, failedRequests, body: await page.locator("body").innerText() })}`, { cause });
  }
  await page.getByLabel("本期累计实收（元）").fill("500.25");
  await page.getByLabel("到账及调整依据").fill("核对两次到账合计，测试记录");
  assert.equal(await page.locator('input[type="file"]').getAttribute("accept"), "image/*");
  await page.locator('input[type="file"]').setInputFiles({ name: "新到账截图.png", mimeType: "image/png", buffer: Buffer.from("synthetic-upload-contract") });
  await page.getByRole("button", { name: "上传凭证", exact: true }).click();
  await page.getByLabel("新到账截图.png", { exact: true }).waitFor();
  await page.getByLabel("已核对累计到账，确认没有遗漏以前的收款。").check();
  await page.getByRole("button", { name: "核对本次登记" }).click();
  assert.match(await page.locator(".finance-confirm").innerText(), /300\.25/);
  await page.getByRole("button", { name: "确认保存", exact: true }).click();
  await page.locator(".finance-action-panel [role=alert]").waitFor();
  await page.getByRole("button", { name: "确认保存", exact: true }).click();
  await page.getByText("登记累计实收已保存。", { exact: true }).waitFor();
  assert.equal(paymentAttempts.length, 2);
  assert.deepEqual(paymentAttempts[0], paymentAttempts[1], "transport retry retains exact amount, time, revision and idempotency key");
  assert.equal(paymentAttempts[1].body.amount, 500.25, "current contract is cumulative, not additive");
  assert.deepEqual(paymentAttempts[1].body.attachmentIds, ["ATT-UPLOADED"]);
  const fileDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载对账文件", exact: true }).click();
  assert.equal((await fileDownload).suggestedFilename(), "statement-ui.xlsx");
  await page.getByText("已下载服务器留存的对账文件，请核对后通过实际渠道发送。", { exact: true }).waitFor();
  await page.getByText("发送、客户确认与凭证", { exact: true }).click();
  const evidenceDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载凭证", exact: true }).click();
  assert.equal((await evidenceDownload).suggestedFilename(), "合成到账凭证.png");
  await page.getByRole("button", { name: "登记已发送", exact: true }).click();
  await page.getByLabel("实际接收人", { exact: true }).fill("客户经理");
  await page.getByLabel("发送说明", { exact: true }).fill("已由办公室微信发出本期对账文件");
  await page.getByLabel("已实际发送给上述接收人。", { exact: true }).check();
  await page.getByRole("button", { name: "核对本次登记", exact: true }).click();
  await page.getByRole("button", { name: "确认保存", exact: true }).click();
  await page.getByText("登记已发送已保存。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "登记客户确认", exact: true }).click();
  await page.getByLabel("客户回复人", { exact: true }).fill("客户财务");
  await page.getByLabel("客户回复原文或准确摘要", { exact: true }).fill("9月账单已核对无误");
  await page.getByLabel("以上为客户实际回复，我已核对。", { exact: true }).check();
  await page.getByRole("button", { name: "核对本次登记", exact: true }).click();
  await page.getByRole("button", { name: "确认保存", exact: true }).click();
  await page.getByText("登记客户确认已保存。", { exact: true }).waitFor();
  assert.equal(communication[0].body.sentTo, "客户经理");
  assert.equal(communication[1].body.content, "9月账单已核对无误");
  assert.equal(communication[1].body.sendRecordId, "SEND-UI");
  await page.getByRole("button", { name: "返回列表", exact: true }).click();
  await page.evaluate(() => window.show("statement", ["statement.preview"]));
  await page.getByText("当前账号没有登记累计实收权限。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "确认保存", exact: true }).count(), 0);
  await page.evaluate(() => window.show("print"));
  await page.getByText("241mm 连续纸", { exact: true }).waitFor();
  await page.getByLabel("操作说明").fill("已核对设备及单据，合成派发测试");
  await page.getByLabel("已核对关联业务、打印内容与目标设备。").check();
  await page.getByRole("button", { name: "确认派发", exact: true }).click();
  await page.getByText("已提交派发，完成状态以设备回执为准。", { exact: true }).waitFor();
  assert.equal(dispatchAttempts.length, 1);
  assert.equal(await page.getByRole("button", { name: "确认派发", exact: true }).count(), 0);
  assert.match(await page.locator("dialog").innerText(), /不能手动标成已打印/);
  await page.evaluate(() => window.show("print", []));
  await page.getByText("当前账号没有查看打印作业的权限。", { exact: true }).waitFor();
  missingFinancialAmounts = true;
  await page.evaluate(() => window.show("statement"));
  await page.getByText("组件验收客户 · 2026-09").waitFor();
  assert.equal(await page.locator(".finance-summary dd").first().innerText(), "待核实");
  assert.equal(await page.getByLabel("本期累计实收（元）").getAttribute("placeholder"), "原累计 待核实");
  const previousAttempts = paymentAttempts.length;
  await page.getByLabel("本期累计实收（元）").fill("600");
  await page.getByLabel("到账及调整依据").fill("合成缺值阻断验收，不能猜测原累计为零");
  await page.getByLabel("已核对累计到账，确认没有遗漏以前的收款。").check();
  await page.getByRole("button", { name: "核对本次登记", exact: true }).click();
  await page.getByText("账单应收或累计实收金额待核实，请重新读取完整账单后再登记。", { exact: true }).waitFor();
  assert.equal(await page.locator(".finance-confirm").count(), 0);
  assert.equal(paymentAttempts.length, previousAttempts, "missing source money must block before a payment POST or confirmation snapshot");
  assert.deepEqual(errors, []);
  console.log("Finance dialog browser interactions passed: cumulative save, same-request network retry, post-save refresh/close, permission denial, real dispatch and no fake completion.");
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
