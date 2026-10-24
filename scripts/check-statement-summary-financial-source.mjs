import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { getStatementCustomers } from "../server/seedData.mjs";
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
  for (const invalid of [null, "", " ", "not-money", Infinity, true]) assert.equal(normalizeStatementCustomerSummary({ ...summary, currentReceived: invalid }).currentReceived, null);
  assert.deepEqual(workspace, snapshot, "read and presentation must never mutate source ledger facts");
} finally { await page.close(); await browser.close(); }
console.log("PASS real server summary → API selector → root mapping → actual desktop rendered cells: actual receipts, variance and historical debt stay separate; missing is unverified and explicit zero stays zero.");
