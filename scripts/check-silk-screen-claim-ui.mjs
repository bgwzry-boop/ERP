import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

// P2-02 丝印领任务 phone view: grouped white → single → black → multi, 领取 / 释放 / “已被XX领取”,
// a lost race is explained and the list re-read. Mocked API.
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "jsx",
    contents: `import React from 'react';import{createRoot}from'react-dom/client';
import{SilkScreenClaimPool,useSilkScreenClaimPool}from'./src/features/workshop/SilkScreenClaimPool.jsx';
window.changed=0;
function Harness(){const pool=useSilkScreenClaimPool({authState:{session:{accessToken:'t'}},enabled:true});
if(pool.status==='off')return <p>没有入口</p>;
return <SilkScreenClaimPool authState={{session:{accessToken:'t'}}} pool={pool} onChanged={()=>{window.changed++;}}/>;}
createRoot(document.getElementById('app')).render(<Harness/>);`,
  },
  bundle: true,
  write: false,
  jsx: "automatic",
  define: { "import.meta.env": '{"VITE_ERP_API_BASE_URL":"/api"}', "process.env.NODE_ENV": '"test"' },
  logLevel: "silent",
});

const item = (id, printColor, inkGroup, label, claim = {}) => ({
  productionTaskId: id, orderLineId: `OL-${id}`, inkGroup, inkGroupLabel: label, claimedByMe: Boolean(claim.me),
  orderLine: { orderId: `O-${id}`, productName: "无纺布袋", size: "40*32", bagColor: "米白", printColor, printSide: "单面", latestNeededAt: "2026-11-06T00:00:00.000Z" },
  productionTask: { taskType: "丝印", plannedQty: 1000, revision: claim.userId ? 2 : 1, taskStatus: claim.userId ? "丝印已排产" : "待排产", claimedByUserId: claim.userId || "", claimedByName: claim.name || "" },
});
const groups = [
  { key: "white", label: "白色（先印）" }, { key: "single", label: "其他单色" }, { key: "black", label: "黑色（收尾）" },
  { key: "multi", label: "多色（收尾）" }, { key: "unknown", label: "印色待确认" },
];
let pool = [
  item("PT-W", "白", "white", "白色（先印）"),
  item("PT-R", "红", "single", "其他单色", { userId: "U-P2", name: "丝印乙" }),
  item("PT-B", "黑", "black", "黑色（收尾）"),
  item("PT-M", "红、黑", "multi", "多色（收尾）", { userId: "U-P1", name: "丝印甲", me: true }),
];
const writes = [];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("http://localhost/", (route) => route.fulfill({ contentType: "text/html", body: '<div id="app"></div>' }));
  await page.route("http://localhost/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/production-schedules/silk-screen-pool") {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: pool, groups, total: pool.length, truncated: false }) });
    }
    const match = url.pathname.match(/^\/api\/production-tasks\/([^/]+)\/(claim|release)$/);
    const body = JSON.parse(route.request().postData() || "{}");
    writes.push({ id: match[1], kind: match[2], body, key: route.request().headers()["idempotency-key"] });
    if (match[1] === "PT-B") {
      // Someone else was faster: the server says who; the list shows it after re-reading.
      pool = pool.map((row) => row.productionTaskId === "PT-B" ? item("PT-B", "黑", "black", "黑色（收尾）", { userId: "U-P2", name: "丝印乙" }) : row);
      return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "SILK_SCREEN_TASK_ALREADY_CLAIMED", message: "这个任务刚被丝印乙领走了。" }) });
    }
    pool = pool.map((row) => row.productionTaskId !== match[1] ? row
      : match[2] === "claim" ? item(row.productionTaskId, row.orderLine.printColor, row.inkGroup, row.inkGroupLabel, { userId: "U-P1", name: "丝印甲", me: true })
        : item(row.productionTaskId, row.orderLine.printColor, row.inkGroup, row.inkGroupLabel));
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ productionTaskId: match[1], outcome: match[2] === "claim" ? "claimed" : "released", operationLogId: "LOG-1" }) });
  });
  await page.goto("http://localhost/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });

  await page.getByRole("heading", { name: "领丝印任务" }).waitFor();
  const headings = await page.locator(".silk-claim-group h3").allTextContents();
  assert.deepEqual(headings.map((text) => text.replace(/\d+ 个$/, "")), ["白色（先印）", "其他单色", "黑色（收尾）", "多色（收尾）"]);
  await page.getByText("已被丝印乙领取").waitFor();
  await page.getByText("我已领取").waitFor();
  assert.equal(await page.getByRole("button", { name: "领取" }).count(), 2, "only unclaimed tasks offer 领取");

  // Claim the white task.
  await page.locator(".silk-claim-group.ink-white").getByRole("button", { name: "领取" }).click();
  await page.getByText("已领取 O-PT-W，已放进你的生产任务。").waitFor();
  assert.deepEqual(writes[0].body.expectedRevision, 1);
  assert.ok(writes[0].key, "writes carry an idempotency key");
  await page.waitForFunction(() => window.changed === 1);

  // Lost race on the black task: told who has it, and the row now shows the lock.
  await page.locator(".silk-claim-group.ink-black").getByRole("button", { name: "领取" }).click();
  await page.getByText("这个任务刚被丝印乙领走了。").waitFor();
  await page.locator(".silk-claim-group.ink-black").getByText("已被丝印乙领取").waitFor();
  assert.equal(await page.evaluate(() => window.changed), 1, "a refused claim does not refresh the task lists");

  // Release needs a second tap.
  const multi = page.locator(".silk-claim-group.ink-multi");
  await multi.getByRole("button", { name: "释放" }).click();
  assert.equal(writes.length, 2);
  await multi.getByRole("button", { name: "确认释放" }).click();
  await page.getByText("已释放 O-PT-M，别的师傅可以领了。").waitFor();
  assert.equal(writes[2].kind, "release");
  assert.equal(writes[2].body.expectedRevision, 2);
  await multi.getByRole("button", { name: "领取" }).waitFor();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `no horizontal scroll at phone width (overflow ${overflow}px)`);
  console.log("PASS silk-screen claim UI: ink-order groups, claim, lost race shows the claimer, two-tap release, phone width. Mocked API.");
} finally {
  await browser.close();
}
