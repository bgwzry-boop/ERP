import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSeedPermissionContext } from "../src/auth/seedPermissions.js";
import { buildRawMaterialInboundDraftFromOcr } from "../server/services/rawMaterialOcrParserService.mjs";
import { closeTestServer, getTestServerBaseUrl, listenTestServer } from "./helpers/apiIntegrationTestHarness.mjs";

const directory = await mkdtemp(join(tmpdir(), "erp-preview-renewal-ui-"));
const permissions = getSeedPermissionContext("U-MANAGER-A");
const session = { sessionType: "seed", userId: "U-MANAGER-A", accessToken: "isolated-ui-session-0", expiresAt: new Date(Date.now() + 3600_000).toISOString() };
const receipt = buildRawMaterialInboundDraftFromOcr({ inboundId: "UAT-RENEWAL-RECEIPT", supplierNameHint: "隔离原料厂", documentDirectionHint: "supplier_delivery", recognizedAt: "2026-11-15T01:00:00Z", ocr: { pageCount: 1, tables: [{ sourcePageIndex: 0, cells: [['隔离原料厂送货单'], ['品名','颜色','规格','数量','重量','单价','金额'], ['无纺布','红色','78*090*1500','1','68','11.8','802.4']].flatMap((row, y) => row.map((text, x) => ({ text, rowTl: y, rowBr: y, colTl: x, colBr: x, confidence: 98 }))) }] } });
let server, browser, releaseLogin;
const logins = [], writes = [];
try {
  await build({
    stdin: { resolveDir: process.cwd(), loader: "jsx", contents: `
      import React,{useState,useEffect} from 'react'; import{createRoot}from'react-dom/client';
      import{BusinessWorkspace}from'./docs/prototypes/raw-material-roll-inventory-review/src/BusinessWorkspaces.jsx';
      import{useSignedPreviewSessionRenewal}from'./src/app/useSignedPreviewSessionRenewal.js';
      import{SignedPreviewSessionNotice}from'./src/app/SignedPreviewSessionNotice.jsx';
      import{writeStoredSeedSession}from'./src/services/officeAuthService.js';
      import{requestOfficeApi,toOfficeApiError}from'./src/services/officeApiClientCore.js';
      import{notifyRuntimeAuthInvalidationForResponse}from'./src/services/runtimeAuthInvalidation.js';
      import{useReceivingData}from'./docs/prototypes/raw-material-roll-inventory-review/src/useReceivingData.js';
      import{FormalReceivingWorkspace}from'./docs/prototypes/raw-material-roll-inventory-review/src/FormalReceivingWorkspace.jsx';
      const permissions=${JSON.stringify(permissions)};
      const initial={authenticated:true,source:'api_seed',session:${JSON.stringify(session)},permissions};
      const options={defaultUserId:'U-MANAGER-A',stagingAuthBypass:true,serverRequired:false};
      writeStoredSeedSession(initial.session);
      function ReceivingProbe({authState}){
        const reader=useReceivingData({authState,active:false,operatorId:'U-MANAGER-A'});
        useEffect(()=>{reader.acceptInbound(${JSON.stringify(receipt)});void reader.actions.selectReceipt('UAT-RENEWAL-RECEIPT');},[]);
        const formal={receiving:reader.receiving,authState,permissionContext:permissions,operatorId:'U-MANAGER-A',data:{productionTasks:[],supplierStatementReviews:[]},actions:{...reader.actions,updateRawMaterialInbound:()=>{throw Error('unexpected receipt write')},refreshAll:async()=>{}}};
        return <section id="receiving"><FormalReceivingWorkspace formal={formal} selectedId={reader.receiving.selectedId} setSelectedId={reader.actions.selectReceipt}/></section>;
      }
      function Harness(){
        const[authState,setAuthState]=useState(initial);
        const[pending,setPending]=useState(false);
        const status=useSignedPreviewSessionRenewal({authState,authOptions:options,setAuthState});
        window.expire=()=>notifyRuntimeAuthInvalidationForResponse(new Response(JSON.stringify({code:'AUTH_TOKEN_EXPIRED'}),{status:401}),{authState});
        window.switchIdentity=()=>{const next={...initial,session:{...initial.session,userId:'U-OFFICE-A',accessToken:'different-identity'}};writeStoredSeedSession(next.session);setAuthState(next);};
        window.authToken=()=>authState.session.accessToken;
        const formal={authState,permissionContext:permissions,operatorId:'U-MANAGER-A',entryDraftId:'',entryCreationId:1,orderEntryWritePending:pending,
          data:{orderDrafts:[],orderLines:[],customers:[],inventoryItems:[],fulfillments:[],productionTasks:[],packingTasks:[]},
          actions:{refreshAll:async()=>{},registerOrderEntryEditor:()=>()=>{},setOrderEntryWritePending:value=>setPending(value),
            recognizeOrderText:async(sourceText,extra)=>{const response=await requestOfficeApi('/order-drafts/recognize',{authState,method:'POST',body:{sourceText,...extra},idempotencyKey:extra.idempotencyKey});return{source:'api_error',blocked:true,error:toOfficeApiError(await response.json(),response.status,'识别结果待核对')};}}};
        return <><SignedPreviewSessionNotice status={status}/><div id="business" inert={status.blocked||undefined}><BusinessWorkspace formal={formal} navId="order-entry" onNavigate={()=>{}}/><ReceivingProbe authState={authState}/></div></>;
      }
      createRoot(document.getElementById('root')).render(<Harness/>);
    ` }, outfile: join(directory, "harness.js"), bundle: true, format: "esm", jsx: "automatic", logLevel: "silent",
    alias: { react: join(process.cwd(), "node_modules/react"), "react-dom": join(process.cwd(), "node_modules/react-dom") },
    define: { "import.meta.env": JSON.stringify({ VITE_ERP_API_BASE_URL: "/api", VITE_ERP_RUNTIME_MODE: "test" }) },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl", ".jpg": "dataurl" },
  });
  server = createServer(async (request, response) => {
    if (request.url === "/harness.js") { response.setHeader("content-type", "text/javascript"); response.end(await readFile(join(directory, "harness.js"))); return; }
    if (request.url.startsWith("/api/")) {
      let body = ""; for await (const part of request) body += part;
      response.setHeader("content-type", "application/json");
      if (request.url === "/api/raw-material-inbounds/UAT-RENEWAL-RECEIPT") { response.end(JSON.stringify({ inbound: receipt })); return; }
      if (request.url === "/api/auth/prototype-login") {
        logins.push(JSON.parse(body));
        await new Promise(resolve => { releaseLogin = resolve; });
        response.end(JSON.stringify({ session: { ...session, accessToken: `isolated-ui-session-${logins.length}` }, permissions })); return;
      }
      if (request.url === "/api/order-drafts/recognize") {
        writes.push({ key: request.headers["idempotency-key"], body: JSON.parse(body) });
        response.statusCode = 502; response.end(JSON.stringify({ code: "REQUEST_UNAVAILABLE", message: "隔离测试回执暂不可用" })); return;
      }
      response.end(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 })); return;
    }
    response.setHeader("content-type", "text/html"); response.end('<!doctype html><div id="root"></div><script type="module" src="/harness.js"></script>');
  });
  await listenTestServer(server);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(getTestServerBaseUrl(server));
  const input = page.getByPlaceholder(/粘贴客户消息/);
  await input.fill("3037 红 500 个 黄松");
  const receiving = page.locator("#receiving");
  await receiving.locator(".office-roll-row").first().getByRole("button", { name: "改这一卷", exact: true }).click();
  await receiving.getByLabel("本卷公斤", { exact: true }).fill("69");
  await receiving.getByRole("button", { name: "保存这一卷", exact: true }).click();
  await receiving.locator(".office-roll-row").first().getByRole("button", { name: "改这一卷", exact: true }).click();
  await receiving.getByLabel("本卷公斤", { exact: true }).fill("77");
  async function renew(index) {
    await page.evaluate(() => window.expire());
    await page.getByRole("alert").waitFor();
    assert.equal(await page.locator("#business").getAttribute("inert"), "");
    await page.waitForFunction(expected => window.authToken() === expected, `isolated-ui-session-${index - 1}`);
    await page.waitForTimeout(30);
    assert.equal(logins.length, index);
    assert.equal(logins.at(-1).userId, "U-MANAGER-A");
    assert.equal(logins.at(-1).previousAccessToken, `isolated-ui-session-${index - 1}`);
    releaseLogin();
    await page.waitForFunction(expected => window.authToken() === expected, `isolated-ui-session-${index}`);
    await page.getByRole("alert").waitFor({ state: "hidden" });
  }
  await renew(1);
  assert.equal(await input.inputValue(), "3037 红 500 个 黄松", "credential renewal must retain unsaved original message through real BusinessWorkspace keys");
  assert.equal(writes.length, 0);
  assert.match(await receiving.locator(".office-roll-table").innerText(), /69kg/);
  assert.equal(await receiving.getByLabel("本卷公斤", { exact: true }).inputValue(), "77", "renewal preserves both receipt local row edits and its open unsaved editor");
  await page.getByRole("button", { name: /识别客户消息/ }).click();
  await page.getByRole("button", { name: /按原内容重试识别/ }).waitFor();
  assert.equal(writes.length, 1);
  await renew(2);
  assert.equal(await input.inputValue(), "3037 红 500 个 黄松");
  assert.equal(writes.length, 1, "renewal must not replay an unknown business write");
  assert.equal(await input.isDisabled(), true, "unknown receipt retains its editing lock");
  await page.getByRole("button", { name: /按原内容重试识别/ }).click();
  await page.waitForTimeout(50);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1], writes[0], "explicit retry keeps original payload and idempotency key across renewal");
  await page.evaluate(() => window.switchIdentity());
  await page.waitForTimeout(50);
  assert.equal(await input.inputValue(), "", "a real account switch retains editor isolation");
  assert.deepEqual(errors, []);
  console.log("PASS preview renewal browser: signed identity exchange, interaction blocked in flight, original short message and receipt row/open edits retained, unknown write stays locked, no automatic replay, explicit retry keeps exact request, account switch clears editor.");
} finally {
  releaseLogin?.(); await browser?.close(); await closeTestServer(server, { forceAfterMs: 1000 }); await rm(directory, { recursive: true, force: true });
}
