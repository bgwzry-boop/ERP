import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { getStatementCustomers, loadSeedWorkspace } from "../server/seedData.mjs";
import { buildStatementDetail } from "../server/services/statementDetailProjectionService.mjs";
import { listOfficeStatementCustomers } from "../src/services/officeStatementApiClient.js";
import { mapStatementCustomerSummaryToLocal, normalizeStatementCustomerSummary, normalizeStatementDetail } from "../src/services/officeStatementSelectors.js";
import { money as financeMoney, paymentReview } from "../docs/prototypes/raw-material-roll-inventory-review/src/finance-dialog-model.js";

const workspace = { customers: [{ id: "C-FINANCE-SOURCE", name: "合成金额客户", cycle: "月结", debtAmountSnapshot: 50 }],
  statements: [{ id: "ST-FINANCE-SOURCE", customerId: "C-FINANCE-SOURCE", receivable: 1000, received: 300, variance: 700, status: "差额待确认", revision: 3 }] };
const snapshot = structuredClone(workspace), summary = getStatementCustomers(workspace)[0];
assert.equal(summary.currentReceived, 300); assert.equal(summary.currentUnpaid, 700); assert.equal(summary.historicalDebt, 50); assert.equal(summary.cumulativeDebt, 750);
const read = await listOfficeStatementCustomers({}, { serverRequired: true, fetchImpl: async () => new Response(JSON.stringify({ items: [summary], total: 1 }), { status: 200 }) });
assert.equal(read.source, "api"); assert.equal(read.items[0].currentReceived, 300, "server's actual receipts must survive the API selector");
const stale = { id: summary.statementId, received: 999, receivable: 999, variance: 999 };
const local = mapStatementCustomerSummaryToLocal(read.items[0], stale);
assert.equal(local.received, 300); assert.equal(local.receivable, 1000); assert.equal(local.variance, 700);
const missing = normalizeStatementCustomerSummary({ statementId: "ST-MISSING", customerId: "C-FINANCE-SOURCE", customerName: "合成缺失客户" });
for (const field of ["currentReceivable", "currentReceived", "currentUnpaid", "varianceAmount", "historicalDebt", "cumulativeDebt", "debtAmount", "overdueAmount"]) assert.equal(missing[field], null, field);
assert.equal(mapStatementCustomerSummaryToLocal(missing, stale).received, null, "missing server money must not borrow stale local money");
const missingDetail = normalizeStatementDetail({ id: "ST-MISSING" }, stale);
for (const field of ["receivable", "received", "variance", "currentUnpaid", "historicalDebt", "cumulativeDebt"]) assert.equal(missingDetail[field], null, field);
for (const invalid of [undefined, null, "", " ", "not-money", Infinity, true]) {
  assert.equal(financeMoney(invalid), "待核实");
  assert.throws(() => paymentReview({ receivable: 100, received: invalid }, "50"), /待核实/u);
  assert.throws(() => paymentReview({ receivable: invalid, received: 0 }, "50"), /待核实/u);
}
assert.equal(financeMoney(0), "¥0.00");
assert.deepEqual(paymentReview({ receivable: 100, received: 0 }, "50"), { amount: 50, previous: 0, difference: 50, unpaid: 50, overpaid: 0 });
assert.equal(normalizeStatementDetail({ id: "ST-LEGACY", receivable_amount: "100.25", received_amount: "0", variance_amount: "100.25" }).received, 0);
const absentWorkspace = { customers: [{ id: "C-FINANCE-SOURCE", name: "合成缺值客户" }], statements: [{ id: "ST-ABSENT", customerId: "C-FINANCE-SOURCE", status: "差额待确认" }] };
const absentSummary = getStatementCustomers(absentWorkspace)[0];
for (const field of ["currentReceived", "currentUnpaid", "historicalDebt", "cumulativeDebt"]) assert.equal(absentSummary[field], null, `server ${field}`);
const absentDetail = normalizeStatementDetail(buildStatementDetail(absentWorkspace, absentWorkspace.statements[0]));
for (const field of ["receivable", "received", "currentUnpaid", "historicalDebt", "cumulativeDebt"]) assert.equal(absentDetail[field], null, `detail ${field}`);

const bundled = await build({ entryPoints: ["docs/prototypes/raw-material-roll-inventory-review/src/BusinessWorkspaces.jsx"], bundle: true, write: false,
  platform: "node", format: "cjs", jsx: "automatic", define: { "import.meta.env": "{}" }, external: ["react", "react/jsx-runtime", "react-dom"], loader: { ".css": "empty" } });
const module = { exports: {} }; new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const formal = items => ({ data: { statements: items, orderLines: [], machines: [], productionTasks: [], packingTasks: [], printJobs: [], printDevices: [], fulfillments: [],
  employeeAccountReviews: [], todos: [], orderDrafts: [], inventoryItems: [] }, actions: { refreshAll: async () => {} }, meta: {}, permissionContext: {} });
const browser = await chromium.launch(); const page = await browser.newPage();
try {
  const render = async items => page.setContent(renderToStaticMarkup(createElement(module.exports.BusinessWorkspace, { formal: formal(items), navId: "customer-statements", onNavigate() {} })));
  await render(read.items);
  const cells = await page.locator(".business-table-body [role=cell]").allTextContents();
  assert.deepEqual(cells.slice(1, 4), ["¥1,000", "¥300", "¥700"], "current receivable, actual received and current variance have separate authoritative sources");
  const facts = await page.locator(".business-facts").innerText();
  for (const text of ["本期累计实收", "¥300", "本期未收", "¥700", "历史欠款", "¥50", "累计欠款", "¥750"]) assert.ok(facts.includes(text), text);
  await render([missing]);
  assert.deepEqual((await page.locator(".business-table-body [role=cell]").allTextContents()).slice(1, 4), ["待核实", "待核实", "待核实"]);
  assert.doesNotMatch(await page.locator(".business-facts").innerText(), /¥0/u);
  const zero = normalizeStatementCustomerSummary({ ...summary, currentReceivable: 0, currentReceived: 0, varianceAmount: 0, currentUnpaid: 0, historicalDebt: 0, cumulativeDebt: 0 });
  await render([zero]); assert.deepEqual((await page.locator(".business-table-body [role=cell]").allTextContents()).slice(1, 4), ["¥0", "¥0", "¥0"]);
  const staleVariance = getStatementCustomers({
    customers: [{ id: "C010", name: "月结客户", cycle: "月结", debt: 0 }],
    statements: [{ id: "ST-0629-005", customerId: "C010", receivable: 1510, received: 0, variance: 5300, status: "有欠款", periodEnd: "2026-06-29" }],
  })[0];
  assert.equal(staleVariance.currentUnpaid, 1510);
  assert.equal(staleVariance.varianceAmount, 1510, "a stored variance that is not 应收减实收 must not be shown as 本期差额");
  assert.equal(staleVariance.historicalDebt, 0);
  assert.equal(staleVariance.cumulativeDebt, 1510);
  await render([staleVariance]);
  assert.deepEqual((await page.locator(".business-table-body [role=cell]").allTextContents()).slice(1, 4), ["¥1,510", "¥0", "¥1,510"]);
  // 明细里只保留权威「本期未收」，不再出现 legacy 差额
  assert.match(await page.locator(".business-facts").innerText(), /本期未收[\s\S]*¥1,510/);
  assert.doesNotMatch(await page.locator(".business-facts").innerText(), /本期差额/);
  assert.doesNotMatch(await page.locator(".business-facts").innerText(), /5,300/);
  const separateDebt = getStatementCustomers({
    customers: [{ id: "C010", name: "月结客户", cycle: "月结", debt: 5300 }],
    statements: [{ id: "ST-0629-005", customerId: "C010", receivable: 1510, received: 0, variance: 1510, status: "有欠款" }],
  })[0];
  assert.equal(separateDebt.varianceAmount, 1510);
  assert.equal(separateDebt.historicalDebt, 5300, "customer debt stays historical and is not copied into 本期差额");
  assert.equal(separateDebt.cumulativeDebt, 6810);
  // 2026-11-07：期望值必须能区分"取权威 currentUnpaid"与"取 legacy variance"。
  const sourceSplit = normalizeStatementCustomerSummary({
    ...getStatementCustomers({
      customers: [{ id: "C-SPLIT", name: "来源区分客户", cycle: "月结", debt: 0 }],
      statements: [{ id: "ST-SPLIT", customerId: "C-SPLIT", receivable: 700, received: 0, variance: 17, status: "有欠款" }],
    })[0],
    currentUnpaid: 700,
    varianceAmount: 17,
  });
  assert.equal(sourceSplit.currentUnpaid, 700);
  assert.equal(sourceSplit.varianceAmount, 17, "构造出 legacy 17 与权威 700 不同，才能测出来源");
  await render([sourceSplit]);
  assert.equal((await page.locator(".business-table-body [role=cell]").allTextContents())[3], "¥700", "本期未收必须取权威 currentUnpaid，不能显示 legacy 差额 17");
  assert.doesNotMatch(await page.locator(".business-facts").innerText(), /17/);
  // 0 与缺失：0 正常显示，缺失显示待核实，不回退 legacy 差额
  const zeroUnpaid = normalizeStatementCustomerSummary({ ...summary, currentUnpaid: 0 });
  await render([zeroUnpaid]);
  assert.equal((await page.locator(".business-table-body [role=cell]").allTextContents())[3], "¥0");
  const missingUnpaid = normalizeStatementCustomerSummary({ ...summary, currentUnpaid: undefined });
  await render([missingUnpaid]);
  assert.equal((await page.locator(".business-table-body [role=cell]").allTextContents())[3], "待核实");

  const settledRounding = getStatementCustomers({
    customers: [{ id: "C001", name: "张三服饰", cycle: "7天一结", debt: 0 }],
    statements: [{ id: "ST-SETTLED", customerId: "C001", receivable: 273, received: 200, variance: 0, status: "已核销" }],
  })[0];
  assert.equal(settledRounding.currentUnpaid, 0);
  assert.equal(settledRounding.varianceAmount, 0, "抹零结清后差额保持 0，不把应收减实收再显示成未结差额");
  const seeded = loadSeedWorkspace();
  const monthly = seeded.statements.find((row) => row.id === "ST-0629-005");
  assert.equal(monthly.variance, 1510);
  assert.deepEqual(monthly.lineIds, ["ORD-0629-028-01"]);
  const monthlyDetail = buildStatementDetail({ ...seeded, paymentRecords: [], varianceRecords: [], statementLines: [], operationLogs: [] }, monthly);
  assert.equal(monthlyDetail.variance, 1510);
  assert.equal(monthlyDetail.currentUnpaid, 1510);
  assert.equal(monthlyDetail.lines.length, 1);
  assert.equal(monthlyDetail.lines[0].orderLineId, "ORD-0629-028-01");
  assert.equal(monthlyDetail.lines[0].productName, "黑马三批");
  assert.equal(monthlyDetail.lines[0].finalAmount, 1510);
  assert.equal(monthlyDetail.lineSource, "linked_order");
  for (const invalid of [null, "", " ", "not-money", Infinity, true]) assert.equal(normalizeStatementCustomerSummary({ ...summary, currentReceived: invalid }).currentReceived, null);
  assert.deepEqual(workspace, snapshot, "read and presentation must never mutate source ledger facts");
} finally { await page.close(); await browser.close(); }
console.log("PASS real server summary → API selector → root mapping → actual desktop rendered cells: actual receipts, variance and historical debt stay separate; missing is unverified and explicit zero stays zero.");
