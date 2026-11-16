import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

// Actual mounted workbenches and HTTP clients with synthetic browser responses.
// No production state, physical packages or printer operations are created.
const origin = "http://production-packing-renewal.invalid";
const permissions = ["packing.read", "packing.complete", "production.read", "production.schedule.publish", "production.schedule.direct"];
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: "jsx", contents: `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{MixedPackageWorkbench}from'./src/features/packing/MixedPackageWorkbench.jsx';
    import{SinglePackingWorkbench}from'./src/features/packing/SinglePackingWorkbench.jsx';
    import{ProductionScheduleControls}from'./docs/prototypes/raw-material-roll-inventory-review/src/ProductionScheduleControls.jsx';
    import{useSignedPreviewSessionRenewal}from'./src/app/useSignedPreviewSessionRenewal.js';
    import{SignedPreviewSessionNotice}from'./src/app/SignedPreviewSessionNotice.jsx';
    import{writeStoredSeedSession}from'./src/services/officeAuthService.js';
    import{notifyRuntimeAuthInvalidationForResponse}from'./src/services/runtimeAuthInvalidation.js';
    const allPermissions=${JSON.stringify(permissions)};
    const authOptions={defaultUserId:'U-MANAGER-A',stagingAuthBypass:true,serverRequired:false};
    const initial={authenticated:true,source:'api_seed',session:{sessionType:'seed',userId:'U-MANAGER-A',accessToken:'signed-renewal-0',expiresAt:new Date(Date.now()+3600000).toISOString()},permissions:{user:{userId:'U-MANAGER-A',displayName:'隔离测试管理'},actionPermissions:allPermissions,roles:['management']}};
    writeStoredSeedSession(initial.session);
    const selected={id:'PT-RENEWAL',sourceTask:{productionTask:{productionTaskId:'PT-RENEWAL',taskType:'制袋',taskStatus:'待排产',plannedQty:12,machineId:'M-RENEWAL',revision:1}},sourceOrderLine:{id:'OL-RENEWAL',orderType:'stock',qty:12}};
    function Harness(){
      const[authState,setAuthState]=useState(initial);
      const status=useSignedPreviewSessionRenewal({authState,authOptions,setAuthState});
      window.expire=()=>notifyRuntimeAuthInvalidationForResponse(new Response(JSON.stringify({code:'AUTH_TOKEN_EXPIRED'}),{status:401}),{authState});
      window.token=()=>authState.session.accessToken;
      window.change=(next={})=>setAuthState(current=>{const userId=next.userId||current.session.userId;const identityChanged=userId!==current.session.userId;const updated={...current,signedPreviewContinuityId:identityChanged?undefined:current.signedPreviewContinuityId,session:{...current.session,userId,accessToken:next.token||current.session.accessToken},permissions:{...current.permissions,user:{...current.permissions.user,userId},actionPermissions:next.permissions||allPermissions}};writeStoredSeedSession(updated.session);return updated;});
      const formal={authState,permissionContext:authState.permissions,data:{machines:[{id:'M-RENEWAL',machineId:'M-RENEWAL',machineType:'bag_making',name:'隔离制袋机',enabled:true,status:'active'}]}};
      return <><SignedPreviewSessionNotice status={status}/><main inert={status.blocked||undefined}>
        <MixedPackageWorkbench authState={authState} fulfillmentId="F-RENEWAL"/>
        <SinglePackingWorkbench authState={authState} packingTaskId="PKT-RENEWAL" orderLineId="OL-CUSTOM"/>
        <ProductionScheduleControls selected={selected} formal={formal} onSaved={async()=>{}}/>
      </main></>;
    }
    createRoot(document.getElementById('app')).render(<Harness/>);
  ` }, bundle: true, write: false, outfile: "renewal-panel.js", jsx: "automatic", logLevel: "silent",
  alias: { react: `${process.cwd()}/node_modules/react`, "react-dom": `${process.cwd()}/node_modules/react-dom` },
  define: { "import.meta.env": '{"VITE_ERP_API_BASE_URL":"/api","VITE_ERP_RUNTIME_MODE":"test"}', "process.env.NODE_ENV": '"test"' },
});

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
  const errors = [], logins = [], unexpected = [], held = new Map();
  const writes = { mixed: [], single: [], schedule: [] };
  const mixedContext = {
    anchorFulfillmentId: "F-RENEWAL", snapshotToken: "isolated-packing-snapshot", orderId: "O-RENEWAL", customerName: "隔离测试客户", method: "送货", packages: [], existing: false,
    lines: [{ fulfillmentId: "F-RENEWAL", orderLineId: "OL-STOCK", size: "30*37*10", bagColor: "红色", expectedQty: 12 }],
  };
  const singleDetail = { packingTaskId: "PKT-RENEWAL", orderLineId: "OL-CUSTOM", packingTask: { status: "待打包", plannedQty: 12 }, orderLine: { orderType: "custom", size: "30*37*10", color: "红色" }, fulfillment: { fulfillmentId: "F-CUSTOM" }, packages: [] };
  page.on("pageerror", error => errors.push(error.message));
  await page.route(`${origin}/`, route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><div id="app"></div></html>' }));
  await page.route(`${origin}/api/**`, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/api/auth/prototype-login") {
      const body = request.postDataJSON(); logins.push(body);
      assert.equal(body.userId, "U-MANAGER-A");
      assert.equal(body.previousAccessToken, `signed-renewal-${logins.length - 1}`);
      await route.fulfill({ json: { session: { sessionType: "seed", userId: "U-MANAGER-A", accessToken: `signed-renewal-${logins.length}`, expiresAt: new Date(Date.now() + 3600_000).toISOString() }, permissions: { user: { userId: "U-MANAGER-A", displayName: "隔离测试管理" }, actionPermissions: permissions, roles: ["management"] } } }); return;
    }
    assert.match(request.headers().authorization, /^Bearer signed-/);
    if (request.method() === "GET") {
      if (path === "/api/packing-groups") { await route.fulfill({ json: mixedContext }); return; }
      if (path === "/api/packing-tasks/PKT-RENEWAL") { await route.fulfill({ json: singleDetail }); return; }
      if (path === "/api/production-schedules/machine-queue") { await route.fulfill({ json: { items: [], machines: [{ machineId: "M-RENEWAL", items: [] }], total: 0 } }); return; }
      // Permission revocation may render the normal delegated-decision reader.
      await route.fulfill({ json: { items: [], total: 0 } }); return;
    }
    const name = path === "/api/packing-groups/F-RENEWAL/replace" ? "mixed"
      : path === "/api/packing-tasks/PKT-RENEWAL/complete" ? "single"
        : path === "/api/production-tasks/PT-RENEWAL/publish-schedule" ? "schedule" : "";
    if (!name) { unexpected.push(path); await route.fulfill({ status: 500, json: { code: "UNEXPECTED_WRITE" } }); return; }
    writes[name].push({ body: request.postDataJSON(), key: request.headers()["idempotency-key"], authorization: request.headers().authorization });
    if (writes[name].length === 4) { held.set(name, route); return; }
    if (writes[name].length === 2) { await route.fulfill({ status: 409, json: { code: "SYNTHETIC_CONFLICT_AFTER_UNKNOWN", message: "隔离测试：重试冲突，原结果仍待核对" } }); return; }
    if (name === "schedule") { await route.fulfill({ status: 503, json: { code: "REQUEST_UNAVAILABLE", message: "隔离测试：排产回执未确认" } }); return; }
    await route.fulfill({ json: {} }); // Incomplete 200 must remain uncertain.
  });
  await page.goto(origin);
  const css = bundle.outputFiles.find(file => file.path.endsWith(".css"));
  if (css) await page.addStyleTag({ content: css.text });
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
  const mixed = page.getByRole("region", { name: "实物混装包登记", exact: true });
  const single = page.getByRole("region", { name: "定制单独打包登记", exact: true });
  const schedule = page.getByRole("region", { name: "办公室排产", exact: true });
  const packRetry = panel => panel.getByRole("button", { name: "确认保存 / 原请求重试", exact: true });
  const scheduleRetry = schedule.getByRole("button", { name: "按原内容重试排产", exact: true });
  const reason = "隔离模拟验收：逐包5和7个，未做现场确认";
  async function fillPackages(panel, isMixed) {
    await panel.getByLabel("实际包数", { exact: true }).fill("2");
    await panel.getByRole("button", { name: "生成逐包核对表", exact: true }).click();
    await panel.getByLabel(isMixed ? "第1包 OL-STOCK 数量" : "第1包数量", { exact: true }).fill("5");
    await panel.getByLabel(isMixed ? "第2包 OL-STOCK 数量" : "第2包数量", { exact: true }).fill("7");
    for (const checkbox of await panel.getByLabel(isMixed ? "我已对照本包实物核实每项数量" : "我已对照本包实物核实本明细数量", { exact: true }).all()) await checkbox.check();
    await panel.getByLabel(isMixed ? "登记或更正依据" : "登记依据", { exact: true }).fill(reason);
  }
  async function assertPackageDraft(panel, isMixed) {
    await expect(panel.getByLabel(isMixed ? "第1包 OL-STOCK 数量" : "第1包数量", { exact: true })).toHaveValue("5");
    await expect(panel.getByLabel(isMixed ? "第2包 OL-STOCK 数量" : "第2包数量", { exact: true })).toHaveValue("7");
    await expect(panel.getByLabel(isMixed ? "登记或更正依据" : "登记依据", { exact: true })).toHaveValue(reason);
  }
  async function renew(index) {
    const counts = Object.fromEntries(Object.entries(writes).map(([key, value]) => [key, value.length]));
    await page.evaluate(() => window.expire());
    await page.waitForFunction(expected => window.token() === expected, `signed-renewal-${index}`);
    await expect(page.getByRole("alert").filter({ hasText: "正在重新验证测试身份" })).toHaveCount(0);
    assert.deepEqual(Object.fromEntries(Object.entries(writes).map(([key, value]) => [key, value.length])), counts, "renewal cannot replay packing or scheduling writes");
  }
  await fillPackages(mixed, true); await fillPackages(single, false);
  await schedule.getByLabel("排产数量（个）", { exact: true }).fill("12");
  await schedule.getByRole("textbox", { name: "安排或调整依据", exact: true }).fill("隔离模拟排产，保留原请求等待核对");
  await renew(1);
  await assertPackageDraft(mixed, true); await assertPackageDraft(single, false);
  await expect(schedule.getByRole("textbox", { name: "安排或调整依据", exact: true })).toHaveValue("隔离模拟排产，保留原请求等待核对");
  await mixed.getByRole("button", { name: "核对并生成独立包码", exact: true }).click();
  await single.getByRole("button", { name: "核对并登记本明细包裹", exact: true }).click();
  await packRetry(mixed).click(); await packRetry(single).click();
  await schedule.getByRole("button", { name: "确认并发布排产", exact: true }).click();
  for (const name of Object.keys(writes)) await expect.poll(() => writes[name].length).toBe(1);
  await expect(mixed.getByRole("status")).toContainText("未收到完整包组回执");
  await expect(single.getByRole("status")).toContainText("回执不完整");
  await expect(scheduleRetry).toBeEnabled();
  await renew(2);
  await assertPackageDraft(mixed, true); await assertPackageDraft(single, false);
  await expect(mixed.getByRole("button", { name: "返回修改摘要", exact: true })).toBeDisabled();
  await expect(single.getByRole("button", { name: "返回修改", exact: true })).toBeDisabled();
  await packRetry(mixed).click(); await packRetry(single).click(); await scheduleRetry.click();
  for (const name of Object.keys(writes)) {
    await expect.poll(() => writes[name].length).toBe(2);
    assert.equal(writes[name][0].authorization, "Bearer signed-renewal-1");
    assert.equal(writes[name][1].authorization, "Bearer signed-renewal-2");
    assert.equal(writes[name][1].key, writes[name][0].key);
    assert.deepEqual(writes[name][1].body, writes[name][0].body);
  }
  await expect(mixed.getByRole("status")).toContainText("原结果仍待核对");
  await expect(single.getByRole("status")).toContainText("原结果仍待核对");
  await expect(scheduleRetry).toBeEnabled();
  await packRetry(mixed).click(); await packRetry(single).click(); await scheduleRetry.click();
  for (const name of Object.keys(writes)) {
    await expect.poll(() => writes[name].length).toBe(3);
    assert.equal(writes[name][2].key, writes[name][0].key, "a conflict after an unknown receipt must not create a new request");
    assert.deepEqual(writes[name][2].body, writes[name][0].body);
    assert.equal(writes[name][2].authorization, "Bearer signed-renewal-2");
  }

  // The same identity loses authority: old unknown requests must be cleared or blocked.
  await page.evaluate(() => window.change({ permissions: ["packing.read", "production.read"] }));
  await expect(packRetry(mixed)).toHaveCount(0); await expect(packRetry(single)).toHaveCount(0);
  await expect(mixed.getByLabel("登记或更正依据", { exact: true })).toHaveValue("");
  await expect(single.getByLabel("登记依据", { exact: true })).toHaveValue("");
  await expect(mixed.getByLabel("实际包数", { exact: true })).toBeDisabled();
  await expect(single.getByLabel("实际包数", { exact: true })).toBeDisabled();
  await expect(schedule.getByRole("button", { name: "确认并发布排产", exact: true })).toBeDisabled();
  await expect.poll(async () => (await scheduleRetry.count()) === 0 || await scheduleRetry.isDisabled()).toBe(true);
  assert.deepEqual(Object.values(writes).map(value => value.length), [3, 3, 3]);

  // Restore permission, start writes, then switch before their responses arrive.
  await page.evaluate(() => window.change());
  await fillPackages(mixed, true); await fillPackages(single, false);
  await schedule.getByRole("textbox", { name: "安排或调整依据", exact: true }).fill("换人前未保存的安排");
  await mixed.getByRole("button", { name: "核对并生成独立包码", exact: true }).click();
  await single.getByRole("button", { name: "核对并登记本明细包裹", exact: true }).click();
  await packRetry(mixed).click(); await packRetry(single).click();
  await schedule.getByRole("button", { name: "确认并发布排产", exact: true }).click();
  await expect.poll(() => held.size).toBe(3);
  await page.evaluate(() => window.change({ userId: "U-OFFICE-A", token: "signed-other-identity" }));
  await expect(mixed.getByLabel("登记或更正依据", { exact: true })).toHaveValue("");
  await expect(single.getByLabel("登记依据", { exact: true })).toHaveValue("");
  await expect(schedule.getByRole("textbox", { name: "安排或调整依据", exact: true })).toHaveValue("");
  await expect(packRetry(mixed)).toHaveCount(0); await expect(packRetry(single)).toHaveCount(0);
  await expect.poll(async () => (await scheduleRetry.count()) === 0 || await scheduleRetry.isDisabled()).toBe(true);
  const nextReason = "新身份正在核对，旧回执不得清空";
  await mixed.getByLabel("登记或更正依据", { exact: true }).fill(nextReason);
  await single.getByLabel("登记依据", { exact: true }).fill(nextReason);
  await schedule.getByRole("textbox", { name: "安排或调整依据", exact: true }).fill(nextReason);
  await Promise.all([...held.values()].map(route => route.fulfill({ json: { operationLogId: "SYNTHETIC-OLD-COMPLETION" } })));
  // Let response handlers run before checking that stale completions were ignored.
  await page.waitForTimeout(50);
  await expect(mixed.getByLabel("登记或更正依据", { exact: true })).toHaveValue(nextReason);
  await expect(single.getByLabel("登记依据", { exact: true })).toHaveValue(nextReason);
  await expect(schedule.getByRole("textbox", { name: "安排或调整依据", exact: true })).toHaveValue(nextReason);
  await expect(packRetry(mixed)).toHaveCount(0); await expect(packRetry(single)).toHaveCount(0);
  await expect.poll(async () => (await scheduleRetry.count()) === 0 || await scheduleRetry.isDisabled()).toBe(true);
  assert.deepEqual(Object.values(writes).map(value => value.length), [4, 4, 4]);
  assert.equal(logins.length, 2);
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  console.log("PASS mounted production/packing renewal: mixed and custom per-package edits retained, schedule edits retained, unknown receipts never replayed automatically, manual retries keep body/key and use renewed Bearer, conflict preserves uncertainty, revoked permission/account switch clear old actions and stale responses cannot overwrite the new editor. Synthetic HTTP only; no physical/online writes or printing.");
} finally { await browser.close(); }
