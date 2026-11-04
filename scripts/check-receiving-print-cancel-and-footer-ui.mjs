import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { buildRawMaterialInboundDraftFromOcr } from "../server/services/rawMaterialOcrParserService.mjs";
import { fulfillReceiptRead, selectReceiptRow } from "./receipt-ui-read-fixtures.mjs";

const origin = process.env.ERP_RECEIVING_CLEANUP_UI_BASE_URL || "http://127.0.0.1:4174/";
const output = process.env.ERP_RECEIVING_FOOTER_UI_OUTPUT || "/opt/cursor/artifacts/receiving-print-footer";
await mkdir(output, { recursive: true });

const cells = (rows) => rows.flatMap((row, y) => row.map((text, x) => ({ text, rowTl: y, rowBr: y, colTl: x, colBr: x, confidence: 98 })));
const table = (name, color, weight) => ({ sourcePageIndex: 0, cells: cells([
  [name], ["品名", "颜色", "规格", "数量", "重量", "单价", "金额"],
  ["无纺布", color, "78*70*1500", "1", String(weight), "11.8", String(weight * 11.8)],
]) });
const base = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-FOOTER-BASE",
  supplierNameHint: "河北宏尚无纺布有限公司",
  knownSupplierNames: ["河北宏尚无纺布有限公司"],
  documentDirectionHint: "supplier_delivery",
  recognizedAt: "2026-11-01T02:00:00.000Z",
  ocr: { tables: [table("河北宏尚无纺布有限公司送货单", "豆沙绿", 82)], pageCount: 1 },
});
Object.assign(base, { receivedAt: "2026-11-01T02:00:00.000Z", deliveryNoteNo: "202611015788", supplierName: "河北宏尚无纺布有限公司" });

function withRolls(id, status, rollState) {
  const record = structuredClone(base);
  record.id = id;
  record.status = status;
  record.ocrLines = [];
  record.rolls = Array.from({ length: 12 }, (_, index) => ({
    id: `${id}-${String(index + 1).padStart(2, "0")}`,
    factoryColor: "海蓝",
    supplierColor: "海兰",
    spec: "78*70*1500",
    weightKg: 70 + index,
    inventoryStatus: rollState.inventoryStatus,
    labelStatus: rollState.labelStatus,
  }));
  record.rollCount = record.rolls.length;
  record.totalWeightKg = record.rolls.reduce((sum, roll) => sum + roll.weightKg, 0);
  return record;
}

const duplicate = structuredClone(base);
duplicate.id = "RMI-FOOTER-DUP";
duplicate.rolls = (duplicate.rolls || []).map((roll) => ({ ...roll, id: `${duplicate.id}-1`, inventoryStatus: "待人工复核" }));
const review = withRolls("RMI-FOOTER-REVIEW", "已识别待复核", { inventoryStatus: "待人工复核", labelStatus: "待打印" });
review.deliveryNoteNo = "REVIEW-12";
const printable = withRolls("RMI-FOOTER-PRINT", "已复核待打印标签", { inventoryStatus: "待入库", labelStatus: "待打印" });
printable.deliveryNoteNo = "PRINT-12";
const attaching = withRolls("RMI-FOOTER-STICK", "已打印待贴标", { inventoryStatus: "待入库", labelStatus: "已打印待贴标" });
attaching.deliveryNoteNo = "STICK-12";
const records = [base, duplicate, review, printable, attaching];

const browser = await chromium.launch();
const dialogs = [];

async function openPage(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(15000);
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.pageErrors = pageErrors;
  await page.addInitScript(() => {
    const originalAdd = Window.prototype.addEventListener;
    Window.prototype.addEventListener = function addEventListener(type, callback, options) {
      if (type === "beforeprint" || type === "afterprint") {
        const lists = this.__printListeners || (this.__printListeners = {});
        (lists[type] || (lists[type] = new Set())).add(callback);
      }
      return originalAdd.call(this, type, callback, options);
    };
    const assignPrint = (win) => {
      if (!win) return;
      win.print = function print() {
        window.top.__labelPrintCalled = (window.top.__labelPrintCalled || 0) + 1;
        for (const callback of this.__printListeners?.afterprint || []) callback();
      };
      if (!win.__labelPrintStubbed) {
        win.__labelPrintStubbed = true;
        window.top.__labelPrintStubbed = (window.top.__labelPrintStubbed || 0) + 1;
      }
    };
    const stubWindow = (win) => {
      const frame = win?.frameElement;
      if (!win || frame?.title !== "卷料标签打印") return;
      if (!frame.__labelWindow) frame.__labelWindow = win;
      assignPrint(win);
      assignPrint(frame.__labelWindow);
    };
    const restubFrames = () => {
      for (const frame of document.querySelectorAll('iframe[title="卷料标签打印"]')) {
        assignPrint(frame.__labelWindow);
        assignPrint(frame.contentWindow);
      }
    };
    const originalAppend = Node.prototype.appendChild;
    Node.prototype.appendChild = function appendChild(node) {
      const inserted = originalAppend.call(this, node);
      if (node?.tagName === "IFRAME") stubWindow(node.contentWindow);
      return inserted;
    };
    const originalClose = Document.prototype.close;
    Document.prototype.close = function close() {
      const result = originalClose.call(this);
      window.top.__labelPrintClosed = (window.top.__labelPrintClosed || 0) + 1;
      restubFrames();
      stubWindow(this.defaultView);
      return result;
    };
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && new URL(request.url()).pathname !== "/api/auth/prototype-login") {
      return route.abort();
    }
    if (await fulfillReceiptRead(route, records)) return;
    return route.continue();
  });
  const url = new URL(origin);
  url.searchParams.set("receivingFooterReview", `${width}x${height}-${Date.now()}`);
  url.searchParams.set("erpViewport", "desktop");
  url.hash = "material-receiving";
  await page.goto(url.href);
  assert.equal(await page.locator('meta[name="erp-app-id"]').getAttribute("content"), "bagwin-complete-review-4174");
  return page;
}

async function rollFooterGeometry(page) {
  return page.locator(".raw-material-detail-pane").evaluate((pane) => {
    const scroll = pane.querySelector(".raw-material-detail-scroll");
    const dock = pane.querySelector(".formal-receiving-action-dock");
    const rows = [...pane.querySelectorAll(".office-roll-row")];
    const actions = dock?.querySelector(".office-inbound-actions");
    scroll.scrollTop = scroll.scrollHeight;
    const last = rows.at(-1).getBoundingClientRect();
    const dockBox = dock.getBoundingClientRect();
    const scrollBox = scroll.getBoundingClientRect();
    const hidden = [];
    for (const row of rows) {
      row.scrollIntoView({ block: "nearest", inline: "nearest" });
      const box = row.getBoundingClientRect();
      const port = scroll.getBoundingClientRect();
      const footer = dock.getBoundingClientRect();
      if (box.bottom > footer.top + 1 || box.bottom > port.bottom + 1 || box.top < port.top - 1) {
        hidden.push({ text: row.querySelector("strong")?.textContent || "", top: Math.round(box.top), bottom: Math.round(box.bottom), portTop: Math.round(port.top), portBottom: Math.round(port.bottom), footerTop: Math.round(footer.top) });
      }
    }
    return {
      rowCount: rows.length,
      overflowY: getComputedStyle(scroll).overflowY,
      paneOverflow: getComputedStyle(pane).overflowY,
      actionsPosition: actions ? getComputedStyle(actions).position : "",
      clientHeight: scroll.clientHeight,
      scrollHeight: scroll.scrollHeight,
      lastBottom: Math.round(last.bottom),
      dockTop: Math.round(dockBox.top),
      scrollBottom: Math.round(scrollBox.bottom),
      dockOverlapsScroll: dockBox.top < scrollBox.bottom - 1,
      hidden,
    };
  });
}

try {
  for (const [width, height] of [[1440, 900], [1366, 768]]) {
    dialogs.length = 0;
    const page = await openPage(width, height);
    try {
      await selectReceiptRow(page, base.id);
      const duplicateHint = page.locator(".formal-receiving-duplicate");
      await duplicateHint.waitFor();
      assert.equal(await duplicateHint.innerText(), "单号相同，另有 1 张");
      assert.equal(await page.locator(".receipt-queue-item.selected .receipt-queue-warning").innerText(), "单号相同，另有 1 张");
      if (width === 1366) await page.screenshot({ path: `${output}/duplicate-hint-${width}x${height}.png` });

      await selectReceiptRow(page, review.id);
      await page.getByRole("button", { name: "这批都对，去打印", exact: true }).waitFor();
      const reviewLayout = await rollFooterGeometry(page);
      assert.equal(reviewLayout.rowCount, 12, JSON.stringify(reviewLayout));
      assert.deepEqual(reviewLayout.hidden, [], JSON.stringify(reviewLayout));
      assert.equal(reviewLayout.dockOverlapsScroll, false, JSON.stringify(reviewLayout));
      assert.equal(reviewLayout.actionsPosition, "static");
      await page.screenshot({ path: `${output}/review-footer-${width}x${height}.png` });

      await selectReceiptRow(page, attaching.id);
      await page.getByText("不用填已贴张数", { exact: false }).waitFor();
      await page.getByRole("button", { name: "本单已贴齐/一键入库", exact: true }).waitFor();
      const stickLayout = await rollFooterGeometry(page);
      assert.equal(stickLayout.rowCount, 12, JSON.stringify(stickLayout));
      assert.deepEqual(stickLayout.hidden, [], JSON.stringify(stickLayout));
      assert.equal(stickLayout.dockOverlapsScroll, false, JSON.stringify(stickLayout));
      await page.screenshot({ path: `${output}/stick-footer-${width}x${height}.png` });

      await selectReceiptRow(page, printable.id);
      const printButton = page.getByRole("button", { name: "打印 12 张 · 76×130", exact: true });
      await printButton.waitFor();
      const beforeDialogs = dialogs.length;
      await printButton.click();
      const deadline = Date.now() + 3000;
      while (dialogs.length === beforeDialogs && Date.now() < deadline) {
        if (await page.getByText("打印窗口没有打开。请再点一次打印。").count()) break;
        await page.waitForTimeout(50);
      }
      const printDebug = await page.evaluate(() => ({
        stubbed: window.__labelPrintStubbed || 0,
        closed: window.__labelPrintClosed || 0,
        called: window.__labelPrintCalled || 0,
        frames: [...document.querySelectorAll("iframe")].map((frame) => frame.title),
        banner: document.body.innerText.includes("打印窗口没有打开"),
      }));
      assert.ok(dialogs.length > beforeDialogs, `cancelling print preview must reach the printed-or-not confirmation, not fail closed ${JSON.stringify(printDebug)} dialogs=${JSON.stringify(dialogs)}`);
      assert.match(dialogs.at(-1), /请看打印机/);
      assert.equal(await page.getByText("打印窗口没有打开。请再点一次打印。").count(), 0);
      assert.deepEqual(page.pageErrors, []);
      const printLayout = await rollFooterGeometry(page);
      assert.deepEqual(printLayout.hidden, [], JSON.stringify(printLayout));
      await page.screenshot({ path: `${output}/print-cancel-${width}x${height}.png` });
    } finally {
      await page.close();
    }
  }
  console.log("PASS receiving print cancel and footer: cancel does not show the closed-window banner; 12 roll rows stay above the review and stick footers at 1440x900 and 1366x768. Duplicate ticket hint is on the detail. No business writes.");
} finally {
  await browser.close();
}
