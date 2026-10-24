import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

// The actual component and API clients run in an isolated intercepted browser.
// No ERP server, database, shared review port or real business record is used.
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const sourceRoot = resolve(option("--source-root") ?? process.cwd());
const compareRef = option("--compare-ref");
if (compareRef && !/^[a-f0-9]{7,40}$/u.test(compareRef)) throw new Error("Use an explicit Git commit for the optional historical comparison");
const componentPath = "docs/prototypes/raw-material-roll-inventory-review/src/InventoryHoldsWorkbench.jsx";
const fixture = {
  item: { id: "INV-OWNERSHIP-A", size: "30*38*10", color: "白色", handle: "普通提", style: "空白袋" },
  hold: { reservationId: "H-OWNERSHIP-A", customerId: "C-OWNERSHIP-A", reservedQty: 20, status: "生效", expiresAt: "2099-01-01T00:00:00Z",
    intent: { id: "I-OWNERSHIP-A", customerId: "C-OWNERSHIP-A", revision: 1,
      candidate: { parsedCandidates: [{ product: "空白袋", size: "30*38*10", color: "白色", handle: "普通提", style: "空白袋", qty: 20 }] } } },
};

async function componentBundle(ref) {
  const plugins = ref ? [{ name: "historical-component-only", setup(builder) {
    builder.onLoad({ filter: /InventoryHoldsWorkbench\.jsx$/ }, ({ path }) => ({
      contents: execFileSync("git", ["show", `${ref}:${componentPath}`], { cwd: sourceRoot, encoding: "utf8" }),
      loader: "jsx", resolveDir: dirname(path),
    }));
  } }] : [];
  const bundle = await build({ stdin: { resolveDir: sourceRoot, loader: "jsx", contents: `
    import React from 'react';import{createRoot}from'react-dom/client';
    import{InventoryHoldsWorkbench}from'./${componentPath}';
    const root=createRoot(document.getElementById('app'));const initial=${JSON.stringify(fixture.item)};
    window.events=[];window.mount=(session,itemId)=>root.render(<InventoryHoldsWorkbench
      item={{...initial,id:itemId}} formal={{authState:{session:{accessToken:session},permissions:{user:{userId:session},
      actionPermissions:['inventory.reservation.create','inventory.reservation.release','order.draft.recognize']}},actions:{
        refreshAll:()=>{window.events.push(['refresh',session,itemId]);if(session==='A'&&window.testStage==='workspace')
          return new Promise(resolve=>{window.releaseWorkspace=resolve;window.workspaceWaiting=true;});return Promise.resolve();},
        focusOrderDraft:id=>window.events.push(['focus',session,itemId,id])}}}
      onNavigate={nav=>window.events.push(['navigate',session,itemId,nav])}/>);
    const originalFetch=window.fetch.bind(window);window.pendingFetches=0;
    window.fetch=async(...input)=>{window.pendingFetches++;try{return await originalFetch(...input);}finally{window.pendingFetches--;}};
    window.mount('A',initial.id);`, }, bundle: true, write: false, outfile: "ownership.js", jsx: "automatic", plugins,
    alias: { react: resolve(sourceRoot, "node_modules/react"), "react-dom": resolve(sourceRoot, "node_modules/react-dom") },
    define: { "import.meta.env": '{"VITE_ERP_API_BASE_URL":"/api"}', "process.env.NODE_ENV": '"test"' } });
  return bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
}

const browser = await chromium.launch();
try {
  const versions = compareRef ? [{ ref: compareRef, historical: true }, { historical: false }] : [{ historical: false }];
  for (const version of versions) {
    const bundle = await componentBundle(version.ref);
    for (const stage of ["list", "workspace"]) for (const change of ["session", "item", "none"]) {
      const page = await browser.newPage(); page.setDefaultTimeout(5000);
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      let aListReads = 0, releaseList, listWaiting = false;
      try {
        await page.route("**/*", async route => {
          const request = route.request(), url = new URL(request.url());
          const json = data => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
          if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="zh-CN"><body><div id="app"></div></body></html>' });
          if (url.pathname === "/api/inventory/holds") {
            const oldOwner = request.headers().authorization === "Bearer A" && url.searchParams.get("inventoryItemId") === fixture.item.id;
            if (oldOwner && ++aListReads === 2 && stage === "list") { listWaiting = true; await new Promise(done => { releaseList = done; }); }
            return json({ items: [fixture.hold] });
          }
          if (url.pathname === "/api/inventory/intents") return json({ items: [] });
          if (url.pathname === "/api/order-drafts/recognize") return json({ draft: { draftId: "D-OWNERSHIP-A", clientRevision: 1 },
            lines: [{ draftLineId: "DL-OWNERSHIP-A", customerId: fixture.hold.customerId, qty: 20, size: fixture.item.size, bagColor: fixture.item.color,
              recognitionEvidence: { sourceHoldId: fixture.hold.reservationId, sourceIntentId: fixture.hold.intent.id } }], operationLogId: "LOG-OWNERSHIP-A" });
          throw new Error(`Unexpected isolated request: ${url.pathname}`);
        });
        await page.goto("https://erp-ownership.invalid/");
        await page.evaluate(value => { window.testStage = value; }, stage);
        await page.addScriptTag({ content: bundle });
        await page.getByRole("button", { name: "转订单草稿", exact: true }).click();
        await page.getByRole("button", { name: "核对转入订单草稿", exact: true }).click();
        await page.getByRole("button", { name: "确认操作", exact: true }).click();
        if (stage === "list") {
          for (let index = 0; index < 100 && !listWaiting; index++) await page.waitForTimeout(10);
          assert.equal(listWaiting, true, "Pause the first successful conversion follow-up at the list refresh");
        } else await page.waitForFunction(() => window.workspaceWaiting === true);
        if (change !== "none") {
          await page.evaluate(({ kind, itemId }) => window.mount(kind === "session" ? "B" : "A", kind === "item" ? "INV-OWNERSHIP-B" : itemId), { kind: change, itemId: fixture.item.id });
          await page.getByRole("button", { name: "转订单草稿", exact: true }).waitFor();
        }
        if (stage === "list") releaseList();
        else await page.evaluate(() => window.releaseWorkspace());
        await page.waitForFunction(() => window.pendingFetches === 0);
        await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
        const events = await page.evaluate(() => window.events);
        const handoff = events.filter(event => ["focus", "navigate"].includes(event[0]));
        if (change === "none" || version.historical) {
          assert.deepEqual(handoff, [["focus", "A", fixture.item.id, "D-OWNERSHIP-A"], ["navigate", "A", fixture.item.id, "order-entry"]], `${stage}/${change}: the historical component reproduces the late handoff, and the same-owner control still works`);
        } else {
          assert.deepEqual(handoff, [], `${stage}/${change}: a superseded component must not focus its old draft or navigate the next owner`);
          if (stage === "list") assert.deepEqual(events, [], "An old list response must not even start a global workspace refresh after ownership changes");
          assert.equal(await page.getByRole("button", { name: "转订单草稿", exact: true }).isEnabled(), true, "The new owner remains usable");
        }
        assert.deepEqual(errors, []);
        console.log(`PASS ${version.historical ? `historical ${version.ref} reproduction` : "current ownership guard"}: ${stage} refresh / ${change}`);
      } finally { releaseList?.(); await page.close(); }
    }
  }
  console.log("PASS actual hold component: late first/second refresh cannot navigate a different session or inventory item; uninterrupted conversion still focuses its linked pricing draft. Isolated synthetic transport only.");
} finally { await browser.close(); }
