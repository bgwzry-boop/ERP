import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "playwright";

const script = await build({
  stdin: { resolveDir: process.cwd(), loader: "jsx", contents: `
    import { createRoot } from "react-dom/client";
    import { RawMaterialSupplierReturnEntry } from "./src/features/raw-materials/RawMaterialSupplierReturnEntry.jsx";
    import { WarehouseMobilePage } from "./src/features/warehouse/WarehouseMobilePage.jsx";
    const root = createRoot(document.querySelector("#app"));
    const roll = { id: "RM-REAL-01", inboundId: "IN-REAL", revision: 1, labelStatus: "已贴标", status: "可用", supplierName: "甲厂家", weightKg: 100 };
    const evidence = { id: "RETURN-REC-1", sourceId: "RET-REVIEWED", documentNo: "厂家退货单1" };
    const note = { id: "RET-REVIEWED", documentNo: "厂家退货单1", date: "2026-11-18", weightKg: 100 };
    const receipts = new Map();
    window.calls = [];
    globalThis.fetch = async (url, init) => {
      const path = new URL(url, "http://erp.test");
      if (init.method === "GET") {
        const items = roll.status === "供应商退货暂存" ? [roll] : [];
        const matchedRoll = path.searchParams.get("rollCode") === roll.id ? roll : null;
        return Response.json({ items, total: items.length, page: 1, pageSize: 20, matchedRoll, returnNotes: matchedRoll?.status === "可用" ? [note] : [] });
      }
      const body = JSON.parse(init.body);
      const key = init.headers["idempotency-key"];
      window.calls.push({ path: path.pathname, body, key });
      if (receipts.has(key)) return Response.json(receipts.get(key));
      const stage = path.pathname.endsWith("/stage-supplier-return");
      if (body.rollId !== roll.id || body.expectedRevision !== roll.revision || (stage ? body.sourceReturnInboundId !== note.id : !body.physicalReturnConfirmed)) {
        return Response.json({ code: "BAD_REQUEST", message: "实物或版本不一致" }, { status: 422 });
      }
      roll.status = stage ? "供应商退货暂存" : "已退厂";
      roll.returnRecord = evidence;
      roll.revision += 1;
      const receipt = { operationLogId: "LOG-" + roll.revision, inbound: { id: roll.inboundId, rollCount: 1, revision: roll.revision, rolls: [{ id: roll.id, inventoryStatus: roll.status, weightKg: roll.weightKg }] } };
      receipts.set(key, receipt);
      if (stage) throw new Error("模拟保存完成后断网");
      return Response.json(receipt);
    };
    window.openWorkbench = (kind, actionPermissions) => {
      const authState = { session: { accessToken: "fixture" }, permissions: { user: { userId: "U-FIXTURE" }, actionPermissions } };
      root.render(kind === "mobile" ? <WarehouseMobilePage authState={authState} /> : <RawMaterialSupplierReturnEntry authState={authState} />);
    };
  ` },
  bundle: true, write: false, jsx: "automatic", loader: { ".css": "empty" }, logLevel: "error",
});
const css = readFileSync(new URL("../src/features/raw-materials/raw-material-supplier-return.css", import.meta.url), "utf8");
const rights = ["raw_material.stock.read", "raw_material.leftover.return", "raw_material.leftover.review"];
const browser = await chromium.launch();
try {
  for (const [width, kind] of [[1366, "desktop"], [390, "mobile"]]) {
    const page = await browser.newPage({ viewport: { width, height: 840 } });
    await page.setContent('<div id="app"></div>');
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: script.outputFiles[0].text });
    await page.evaluate(({ kind, rights }) => window.openWorkbench(kind, rights), { kind, rights });
    if (kind === "mobile") await page.getByRole("button", { name: "全部功能" }).click();
    await page.getByRole("button", { name: "原料退厂", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "原料退厂" });
    const scan = dialog.getByLabel("实物卷码");
    assert.equal(await dialog.evaluate((root) => root.scrollWidth <= root.clientWidth), true);
    await scan.fill("NOT-A-ROLL");
    await dialog.getByRole("button", { name: "核对卷码" }).click();
    await dialog.getByRole("alert").getByText(/没有找到该卷码/).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "确认暂存" }).count(), 0);
    await scan.fill("RAW-MATERIAL:rm-real-01");
    await scan.press("Enter");
    await dialog.getByLabel("已复核的供应商退货单").selectOption("RET-REVIEWED");
    const stage = dialog.getByRole("button", { name: "确认暂存" });
    assert.equal(await stage.isDisabled(), true);
    await dialog.getByRole("checkbox", { name: "实物已核对并移到供应商退货暂存区" }).check();
    await stage.click();
    await dialog.getByRole("button", { name: "按原操作重试" }).click();
    await dialog.getByText(/已移入退货暂存区/).waitFor();
    const stagedCalls = await page.evaluate(() => window.calls);
    assert.equal(stagedCalls.length, 2);
    assert.deepEqual(stagedCalls[1], stagedCalls[0], "lost receipt retries the identical request and key");
    await dialog.getByRole("region", { name: "待确认退厂卷" }).getByText("RM-REAL-01").waitFor();
    assert.equal(await dialog.getByRole("button", { name: "确认退厂" }).count(), 0, "queue visibility is not a scan");
    await scan.fill("RM-REAL-01");
    await scan.press("Enter");
    await dialog.getByRole("checkbox", { name: "已将该卷实物交还供应商" }).check();
    await dialog.getByRole("button", { name: "确认退厂" }).click();
    await dialog.getByText(/已确认退厂/).waitFor();
    const shipped = await page.evaluate(() => window.calls.at(-1));
    assert.equal(shipped.body.expectedRevision, 2);
    assert.equal(shipped.body.physicalReturnConfirmed, true);
    await scan.fill("RM-REAL-01");
    await scan.press("Enter");
    await dialog.getByText("这卷已经退厂。").waitFor();
    assert.equal(await dialog.getByRole("button", { name: "确认退厂" }).count(), 0);
    await dialog.getByRole("button", { name: "关闭" }).click();
    await page.evaluate((kind) => window.openWorkbench(kind, ["raw_material.stock.read"]), kind);
    await page.getByRole("button", { name: "原料退厂", exact: true }).waitFor({ state: "detached" });
    await page.close();
  }
  console.log("PASS supplier return UI (1366px and 390px): exact barcode, supplier document selection, explicit physical confirmations, recoverable lost reply, and permission-hidden entry.");
} finally {
  await browser.close();
}
