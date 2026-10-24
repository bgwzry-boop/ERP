import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createPortProbe } from "node:net";
import { build } from "esbuild";
import { chromium } from "playwright";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
const storage = await mkdtemp(join(tmpdir(), "erp-warehouse-carrier-browser-"));
process.env.ERP_LOCAL_STORAGE_DIR = storage;
const { createApiServer } = await import("../server/apiServer.mjs");
const { loadSeedWorkspace } = await import("../server/seedData.mjs");
const { createRuntimeSession } = await import("../server/authSeed.mjs");
const secret = "isolated-warehouse-carrier-browser-session";
const userId = "TEST-R3-OPERATOR";
const token = createRuntimeSession(userId, { authSecret: secret, sessionVersion: 1 }).accessToken;
const users = [{ userId, loginName: "r3-test", displayName: "合成操作员", roles: ["management", "office", "warehouse"], defaultRole: "office", enabled: true, loginEnabled: true, passwordStatus: "active", passwordHash: "fixture", sessionVersion: 1 }];
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "jsx", contents: `
import React,{useState,useEffect} from 'react';import{createRoot}from'react-dom/client';
import{WarehouseMobilePage}from'./src/features/warehouse/WarehouseMobilePage.jsx';
import{ActionModal}from'./src/app/ActionModals.jsx';
import{DesktopFulfillmentOperations}from'./docs/prototypes/raw-material-roll-inventory-review/src/DesktopFulfillmentOperations.jsx';
import{recordOfficeWarehouseOutboundExecution,mapApiFulfillmentToLocal}from'./src/services/officeFulfillmentApiClient.js';
import'./src/styles/tokens.css';import'./src/styles/base.css';import'./src/styles/shared.css';import'./src/styles/features/warehouse.css';import'./src/styles/features/mobile-roles.css';import'./src/styles/features/role-tools.css';
const auth={session:{accessToken:window.testToken}}, permissions=['fulfillment.read','fulfillment.warehouse.execute','fulfillment.pickup.confirm'];
function App(){const [items,setItems]=useState([]),[modal,setModal]=useState(null),[selected,setSelected]=useState('F003');
 async function refresh(){const r=await fetch('/api/fulfillments/F003',{headers:{authorization:'Bearer '+window.testToken}});const j=await r.json();if(!r.ok)throw Error(JSON.stringify(j));setItems([mapApiFulfillmentToLocal(j)]);}
 useEffect(()=>{refresh()},[]);
 if(!items.length)return <p>读取中</p>;
 if(window.testMode==='carrier')return <DesktopFulfillmentOperations fulfillment={items[0]} formal={{authState:auth,operatorId:'${userId}',permissionContext:{actionPermissions:permissions},data:{},actions:{refreshAll:refresh}}}/>;
 return <><WarehouseMobilePage fulfillments={items} orderLines={[]} selectedId={selected} setSelectedId={setSelected} onAction={(action,id)=>setModal({type:'warehouseExecution',fulfillmentId:id,prepareOnly:true,initialWarehouseResult:'已备货'})} helpers={{findCustomer:()=>({name:'合成客户'}),getFulfillmentGoodsDisplay:()=> '合成袋'}}/>
 {modal&&<ActionModal key={modal.fulfillmentId} modal={modal} fulfillments={items} statements={[]} orderLines={[]} findCustomer={()=>({name:'合成客户'})} getStatementBlockingAmount={()=>0} onClose={()=>setModal(null)} onConfirm={async payload=>{const r=await recordOfficeWarehouseOutboundExecution({authState:auth,operatorId:'${userId}',fulfillment:payload.fulfillmentSnapshot,paperOutboundDocument:payload.paperDocumentSnapshot,...payload},{serverRequired:true});if(r.source==='api'&&!r.blocked){setModal(null);await refresh()}return r}}/>}</>;
}createRoot(document.getElementById('app')).render(<App/>);` }, bundle: true, write: false, outfile: "browser.js", jsx: "automatic", alias: { react: join(process.cwd(), "node_modules/react"), "react-dom": join(process.cwd(), "node_modules/react-dom") }, define: { "import.meta.env": '{"VITE_ERP_API_BASE_URL":"/api"}', "process.env.NODE_ENV": '"test"' } });
const browser = await chromium.launch();
try {
  for (const mode of ["prepare", "carrier"]) {
    const seed = loadSeedWorkspace({ runtimeMode: "test", source: "synthetic" });
    const record = seed.fulfillments.find(row => row.id === "F003");
    Object.assign(record, { revision: 1, actualQty: 1500, status: mode === "carrier" ? "待承运方拉走" : "待出库", legacyStateReviewRequired: false,
      ...(mode === "carrier" ? { physicalOutboundAt: "2026-07-31T12:00:00Z", physicalOutboundDocumentId: "POD-R3-BROWSER" } : {}) });
    seed.printRecords = [{ printRecordId: "PR-R3-BROWSER", status: "printed", targetType: "fulfillment", targetId: "F003" }];
    seed.paperOutboundDocuments = [{ paperOutboundDocumentId: "POD-R3-BROWSER", fulfillmentId: "F003", printRecordId: "PR-R3-BROWSER", documentVersion: 1, revision: 1, status: mode === "carrier" ? "已交库房" : "待打印确认" }];
    seed.employees = [{ id: "EMP-R3-BROWSER", employeeId: "EMP-R3-BROWSER", name: "合成库房员工", profileStatus: "active", employmentStatus: "在职", roleName: "库房" }];
    seed.statements = []; seed.statementLines = [];
    const probe = createPortProbe(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    const base = `http://127.0.0.1:${port}`;
    const server = createApiServer(withLocalRepositoryFixture({ runtimeMode: "test", applyProductionEnvFile: false, strictAuth: true, authSecret: secret,
      corsAllowedOrigins: [base],
      runtimeIdentityRepository: { kind: "test_memory", loadState: async () => ({ users, revokedSeedSessions: [] }), saveState: async () => ({}) },
      coreWorkspaceReadRepository: { kind: "test_memory", loadState: async () => seed } }));
    await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));
    const page = await browser.newPage({ timezoneId: "America/Los_Angeles", viewport: mode === "prepare" ? { width: 390, height: 844 } : { width: 800, height: 900 } });
    page.setDefaultTimeout(15000);
    if (mode === "prepare") await page.addInitScript(() => {
      const NativeDate = Date, fixed = NativeDate.parse("2026-10-23T17:05:12.000Z");
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };
    });
    const errors = [], requests = [], receipts = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.route(base + "/", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="zh-CN"><div id="app"></div></html>' }));
      let lost = false;
      await page.route(`**/api/fulfillments/F003/${mode === "prepare" ? "warehouse-execution" : "pickup-confirm"}`, async route => {
        requests.push(route.request().postDataJSON());
        const response = await route.fetch();
        if (response.ok()) receipts.push(await response.json());
        if (!lost && response.ok()) { lost = true; await route.fulfill({ status: 500, contentType: "application/json", body: '{"code":"SYNTHETIC_LOST_RESPONSE","message":"合成测试：服务器已提交但回执丢失"}' }); }
        else if (requests.length === 2) await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        else if (requests.length === 3) { const receipt = await response.json(); if (mode === "prepare") receipt.warehouseOutboundExecution.paperOutboundDocumentId = "POD-FOREIGN"; else receipt.finalDeliveryAt = "2026-08-01T01:00:00.000Z"; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(receipt) }); }
        else await route.fulfill({ response });
      });
      await page.goto(base + "/"); await page.evaluate(({ token, mode }) => { window.testToken = token; window.testMode = mode; }, { token, mode });
      for (const file of bundle.outputFiles.filter(file => file.path.endsWith(".css"))) await page.addStyleTag({ content: file.text });
      await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
      if (mode === "prepare") {
        await page.getByRole("button", { name: /登记已备货/u }).click();
        assert.equal(await page.getByLabel("实际执行时间", { exact: true }).inputValue(), "2026-10-24T01:05:12");
        await page.getByLabel("实物执行人员工编号").fill("EMP-R3-BROWSER");
        await page.getByRole("button", { name: "下一步确认", exact: true }).click();
        assert.equal(await page.getByLabel("实际执行时间", { exact: true }).inputValue(), "2026-10-24 01:05:12");
        await page.getByRole("button", { name: "确认回录", exact: true }).click();
        for (let retry = 0; retry < 3; retry++) {
          await page.getByRole("button", { name: "用原内容重试", exact: true }).waitFor();
          assert.equal(await page.getByRole("button", { name: "返回修改", exact: true }).isDisabled(), true);
          assert.equal(await page.getByRole("button", { name: "关闭业务操作", exact: true }).isDisabled(), true);
          await page.getByRole("button", { name: "用原内容重试", exact: true }).click();
        }
        await page.getByRole("button", { name: /已登记备货，等待当前纸质出库单/u }).waitFor();
      } else {
        await page.getByLabel("实际拉走时间（北京时间）").fill("2026-07-31T21:00");
        await page.getByRole("button", { name: "核对快递揽收", exact: true }).click();
        await page.getByRole("button", { name: "确认提交", exact: true }).click();
        for (let retry = 0; retry < 3; retry++) {
          await page.getByRole("button", { name: "重试本次操作", exact: true }).waitFor();
          assert.equal(await page.getByRole("button", { name: "返回修改", exact: true }).isDisabled(), true);
          await page.getByRole("button", { name: "重试本次操作", exact: true }).click();
        }
        await page.getByText("本次交付已结束，保留现有出库与签收记录供核对。", { exact: true }).waitFor();
      }
      assert.equal(requests.length, 4); for (const request of requests.slice(1)) assert.deepEqual(request, requests[0], "unknown result must retry the exact original content and key");
      assert.equal(new Set(receipts.map(receipt => receipt.operationLogId)).size, 1);
      if (mode === "prepare") assert.equal(new Set(receipts.map(receipt => receipt.warehouseOutboundExecution.warehouseOutboundExecutionId)).size, 1);
      if (mode === "carrier") assert.equal(requests[0].actualHandoffAt, "2026-07-31T13:00:00.000Z");
      else assert.equal(requests[0].executedAt, "2026-10-23T17:05:12.000Z", "factory-local next-day default must preserve the actual instant in a non-China browser");
      const response = await fetch(base + "/api/fulfillments/F003", { headers: { authorization: `Bearer ${token}` } });
      const detail = await response.json(); assert.equal(response.status, 200, JSON.stringify(detail));
      if (mode === "prepare") { assert.equal(detail.status, "已备货"); assert.equal(detail.physicalOutboundAt, ""); assert.equal(detail.paperOutboundStatus, "已打印待交库房"); }
      else { assert.equal(detail.finalDeliveryAt, "2026-07-31T13:00:00.000Z"); assert.notEqual(detail.confirmedAt, detail.finalDeliveryAt); }
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `/tmp/erp-p1-r3-${mode}.png`, fullPage: true });
      console.log(`PASS actual ${mode} React entry + signed isolated HTTP, saved-but-lost response repeats exact key/content, authoritative readback.`);
    } catch (error) { console.log('Browser fixture state:', errors, await page.locator('body').innerText()); throw error; }
    finally { await page.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
} finally { await browser.close(); await rm(storage, { recursive: true, force: true }); }
