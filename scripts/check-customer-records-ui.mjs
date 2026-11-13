import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.ERP_RECEIVING_CLEANUP_UI_BASE_URL || "http://127.0.0.1:4174/";
const records = [
  { customerId: "C-A", name: "美的空调网店", shortName: "美的", settlementCycle: "月结", enabled: true },
  { customerId: "C-B", name: "黄松", shortName: "黄老板", settlementCycle: "未设置", enabled: true },
  { customerId: "C-D", name: "多期客户", shortName: "多期", settlementCycle: "月结", enabled: true },
  { customerId: "C-C", name: "旧客户", shortName: "旧客", settlementCycle: "每单结清", enabled: false },
];
const statements = [
  { statementId: "S-A", customerId: "C-A", customerName: "旧名称", settlementCycle: "现结", currentReceivable: 0 },
  { statementId: "S-D1", customerId: "C-D", currentReceivable: 100 },
  { statementId: "S-D2", customerId: "C-D", currentReceivable: 200 },
  { statementId: "S-C", customerId: "C-C", customerName: "旧客户", currentReceivable: null },
];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let failArchive = false;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/master-data/customer-records" || path === "/api/statements/customers") {
      const items = path.endsWith("customer-records") ? records : statements;
      if (failArchive && items === records) return route.fulfill({ status: 503, json: { message: "测试断网" } });
      return route.fulfill({ json: { items, total: items.length, page: 1, pageSize: Number(url.searchParams.get("pageSize")) } });
    }
    if (path.endsWith("/profile")) {
      const customer = records.find(row => row.customerId === path.split("/").at(-2));
      assert.ok(customer);
      if (request.method() === "PATCH") {
        const body = request.postDataJSON();
        assert.equal(customer.settlementCycle, body.expected.settlementCycle);
        customer.settlementCycle = body.settlementCycle;
      }
      return route.fulfill({ json: { profile: customer, changed: request.method() === "PATCH", settlementCycleOptions: ["月结", "每单结清"] } });
    }
    if (path.endsWith("/delivery-addresses")) return route.fulfill({ json: { addresses: [] } });
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && path !== "/api/auth/prototype-login") {
      errors.push(`意外的写请求 ${path}`);
      return route.abort();
    }
    return route.continue();
  });

  await page.goto(`${origin}?erpViewport=desktop#customer-records`);
  const table = page.getByRole("table", { name: "客户档案列表" });
  const row = (name) => table.getByRole("row").filter({ hasText: name });
  await row("黄松").waitFor();
  assert.match(await row("黄松").innerText(), /未设置[\s\S]*暂无对账记录/);
  assert.match(await row("美的空调网店").innerText(), /月结[\s\S]*¥0/);
  assert.match(await row("旧客户").innerText(), /待核实[\s\S]*停用/);
  assert.doesNotMatch(await table.innerText(), /旧名称|现结/);

  await row("多期客户").click();
  assert.match(await row("多期客户").innerText(), /2 张对账单/);
  const details = await page.locator(".business-detail-panel .business-facts").innerText();
  assert.match(details, /S-D1 应收[\s\S]*¥100/);
  assert.match(details, /S-D2 应收[\s\S]*¥200/);
  await row("黄松").click();
  const profile = page.getByRole("region", { name: "客户资料" });
  await profile.getByRole("button", { name: "编辑" }).click();
  await profile.getByLabel("结算周期", { exact: true }).selectOption("每单结清");
  await profile.getByRole("button", { name: "保存客户资料" }).click();
  await row("黄松").getByText("每单结清").waitFor();
  failArchive = true;
  await page.getByLabel("刷新当前工作台").click();
  await page.getByRole("alert").filter({ hasText: "已保留上次读取的内容" }).waitFor();
  assert.match(await row("黄松").innerText(), /每单结清/);
  failArchive = false;
  await page.getByRole("button", { name: "重新读取" }).click();
  await page.locator(".workspace-read-notice.error").waitFor({ state: "hidden" });

  const search = page.getByRole("combobox", { name: "全局搜索" });
  await search.fill("黄老板");
  await page.getByRole("option", { name: /黄松/ }).click();
  await row("黄松").waitFor();
  assert.equal(await table.getByRole("row").count(), 2);
  assert.equal(await row("黄松").getAttribute("aria-pressed"), "true");

  await page.locator('[data-nav-id="general-prices"]').click();
  await page.getByText("成品规格目录尚未接入").waitFor();
  assert.doesNotMatch(await page.getByRole("main").innerText(), /接口上线后|通货单价|查看价格版本/);
  await page.getByRole("button", { name: "查看销售价格" }).click();
  await page.locator('[data-nav-id="sales-prices"][aria-current="page"]').waitFor();
  assert.equal(await page.locator('[data-nav-id="launch-status"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log("客户档案页面通过：无订单客户、权威月结、零应收与缺值、改档与失败重读、全局搜索定位；成品资料链接到销售价格。");
} finally {
  await browser.close();
}
