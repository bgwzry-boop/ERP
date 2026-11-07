import { fulfillReceiptRead, selectReceiptRow, selectReceiptTab } from "./receipt-ui-read-fixtures.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { buildRawMaterialInboundDraftFromOcr } from "../server/services/rawMaterialOcrParserService.mjs";
import { hasStrongRawMaterialSupplierReturnEvidence } from "../shared/rawMaterialSupplierReturn.js";

// Browser-only anonymous fixtures. Block every business write, including OCR,
// original-photo upload, review, printing, colour mapping and inventory actions.
const origin = process.env.ERP_RECEIVING_CLEANUP_UI_BASE_URL || "http://127.0.0.1:4174/";
const output = process.env.ERP_RECEIVING_CLEANUP_UI_OUTPUT || "screenshots/receiving-workspace-cleanup";
await mkdir(output, { recursive: true });
const report = { passed: false, anonymousMockBusinessData: true, noCloudOcrOrBusinessWrites: true, checks: [], attachmentReads: [], blockedWrites: [], pageErrors: [] };

const cells = rows => rows.flatMap((row, y) => row.map((text, x) => ({ text, rowTl: y, rowBr: y, colTl: x, colBr: x, confidence: 98 })));
const table = (name, color, weight, page) => ({ sourcePageIndex: page, cells: cells([
  [name], ["品名", "颜色", "规格", "数量", "重量", "单价", "金额"],
  ["无纺布", color, "78*090*1500", "1", String(weight), "11.8", String(weight * 11.8)],
]) });
const draft = (id, tables, direction = "supplier_delivery") => buildRawMaterialInboundDraftFromOcr({
  inboundId: id, supplierNameHint: "测试原料厂", knownSupplierNames: ["测试原料厂"], documentDirectionHint: direction,
  recognizedAt: "2026-11-02T01:00:00.000Z", ocr: { tables, pageCount: tables.length },
});
const delivery = draft("RMI-AUDIT-MULTIPAGE", [table("测试原料厂送货单", "海兰", 68, 0), table("测试原料厂送货单", "米色", 72, 1)]);
assert.equal(delivery.ocrLines.length, 2);
assert.deepEqual(delivery.ocrLines.map(line => line.sourcePageIndex), [0, 1]);
Object.assign(delivery, {
  receivedAt: "2026-11-02T01:01:00.000Z",
  deliveryNoteNo: "ANON-NOTE-001", sourceAttachmentId: "AUDIT-SOURCE-P1", sourceAttachmentIds: ["AUDIT-SOURCE-P1", "AUDIT-SOURCE-P2"],
  ocrSourceDigest: "audit-anonymous-multipage", factoryColor: "", supplierColor: "",
});
delivery.ocrLines.forEach((line, index) => {
  const factoryColor = index === 0 ? "海蓝" : "";
  line.values.factoryColor = factoryColor;
  line.recognizedValues = { ...line.values };
  line.factoryColorResolution = { factoryColor, supplierColor: line.values.supplierColor, status: index === 0 ? "supplier_rule" : "unmapped", sourceType: index === 0 ? "supplier_rule" : "unmapped", supplierSourceId: "测试原料厂", candidateFactoryColors: [] };
});
delivery.rolls.forEach((roll, index) => Object.assign(roll, { factoryColor: index === 0 ? "海蓝" : "", supplierColor: index === 0 ? "海兰" : "米色", factoryColorMappingStatus: index === 0 ? "supplier_rule" : "unmapped" }));
const other = draft("RMI-AUDIT-OTHER", [table("测试原料厂送货单", "红色", 50, 0)]);
Object.assign(other, { deliveryNoteNo: "ANON-NOTE-002", sourceAttachmentId: "AUDIT-SOURCE-P1", sourceAttachmentIds: ["AUDIT-SOURCE-P1"], ocrSourceDigest: "audit-anonymous-other" });
const returned = draft("RMI-AUDIT-RETURN", [table("测试原料厂退货单", "彩色", -25, 0)], "supplier_return");
Object.assign(returned, { deliveryNoteNo: "ANON-RETURN-001", sourceAttachmentId: "AUDIT-SOURCE-P2", sourceAttachmentIds: ["AUDIT-SOURCE-P2"], ocrSourceDigest: "audit-anonymous-return" });
assert.equal(returned.rolls.length, 0);
assert.equal(returned.documentDirection, "supplier_return");
const conflict = { ...structuredClone(returned), id: "RMI-AUDIT-DIRECTION-CONFLICT", deliveryNoteNo: "ANON-CONFLICT-001", documentDirection: "supplier_delivery", documentCaptureDirection: "supplier_delivery", documentDirectionSource: "operator_capture_selection", documentTypeLabel: "送货单", totalWeightKg: 25, amount: 295, ocrSourceDigest: "audit-anonymous-conflict" };
assert.equal(hasStrongRawMaterialSupplierReturnEvidence(conflict), true);
const records = [delivery, other, conflict, returned];
const original = JSON.stringify(records);

// Deliberately distinct, valid PNGs prove page-to-attachment routing without
// placing any real supplier image or private document in source control.
function png(width, height, rgb) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (name, data) => {
    const type = Buffer.from(name), size = Buffer.alloc(4), checksum = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    let crc = 0xffffffff;
    for (const byte of Buffer.concat([type, data])) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, type, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) Buffer.from([...rgb, 255]).copy(pixels, y * (width * 4 + 1) + 1 + x * 4);
  return Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
const photos = {
  "AUDIT-SOURCE-P1": { bytes: png(2, 2, [220, 30, 45]), width: 2, rgb: [220, 30, 45] },
  "AUDIT-SOURCE-P2": { bytes: png(3, 2, [35, 90, 190]), width: 3, rgb: [35, 90, 190] },
};
const browser = await chromium.launch();

async function openPage(width) {
  const mobile = width === 390;
  const page = await browser.newPage({ viewport: { width, height: mobile ? 844 : 1000 }, ...(mobile ? { isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" } : {}) });
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => report.pageErrors.push({ width, message: error.message }));
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && path !== "/api/auth/prototype-login") {
      report.blockedWrites.push({ width, method: request.method(), path });
      return route.abort();
    }
    if (await fulfillReceiptRead(route, records)) return;
    const attachment = /^\/api\/attachments\/([^/]+)\/content$/u.exec(path);
    if (attachment) {
      const id = decodeURIComponent(attachment[1]);
      report.attachmentReads.push({ width, attachmentId: id });
      assert.ok(photos[id], `unexpected document attachment: ${id}`);
      return route.fulfill({ status: 200, contentType: "image/png", body: photos[id].bytes });
    }
    return route.continue();
  });
  const url = new URL(origin);
  url.searchParams.set("receivingCleanupReview", `${width}-${Date.now()}`);
  url.searchParams.set("erpViewport", mobile ? "mobile" : "desktop");
  url.hash = "material-receiving";
  await page.goto(url.href);
  if (!mobile) await selectReceiptRow(page, delivery.id);
  assert.equal(await page.locator('meta[name="erp-app-id"]').getAttribute("content"), "bagwin-complete-review-4174");
  return page;
}

async function assertImage(page, pageNumber, attachmentId) {
  const image = page.getByRole("img", { name: `原单照片，第 ${pageNumber} 页`, exact: true });
  await image.waitFor();
  await page.waitForFunction(({ alt, width }) => { const image = [...document.images].find(item => item.alt === alt); return image?.complete && image.naturalWidth === width; }, { alt: `原单照片，第 ${pageNumber} 页`, width: photos[attachmentId].width });
  const result = await image.evaluate(element => {
    const canvas = document.createElement("canvas"); canvas.width = element.naturalWidth; canvas.height = element.naturalHeight;
    const context = canvas.getContext("2d"); context.drawImage(element, 0, 0);
    return { width: element.naturalWidth, rgb: [...context.getImageData(0, 0, 1, 1).data].slice(0, 3) };
  });
  assert.deepEqual(result, { width: photos[attachmentId].width, rgb: photos[attachmentId].rgb }, "displayed pixels must come from this page's original attachment");
}

async function openOcr(pane) {
  const disclosure = pane.locator("details.office-receive-more");
  if (!(await disclosure.evaluate(element => element.open))) await disclosure.locator(":scope > summary").click();
  const editable = disclosure.locator("details.office-receive-edit-fields");
  if (await editable.count() && !(await editable.evaluate(element => element.open))) await editable.locator(":scope > summary").click();
  return disclosure;
}

async function checkDesktop(width) {
  const page = await openPage(width);
  try {
    const pane = page.locator(".raw-material-detail-pane");
    await pane.locator(".office-roll-row").first().waitFor();
    const initialLayout = await pane.evaluate(element => {
      const box = element.getBoundingClientRect();
      return { viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth, paneLeft: Math.round(box.left), paneRight: Math.round(box.right), entirePaneInViewport: box.left >= 0 && box.right <= innerWidth };
    });
    assert.ok((await pane.locator(".raw-material-detail-facts").innerText()).includes(delivery.id));
    assert.equal(await pane.locator(".raw-material-detail-tabs, .raw-material-ocr-upload-bar, .raw-material-file-button").count(), 0);
    assert.equal(await pane.getByRole("group", { name: "原材料详情视图" }).count(), 0);
    for (const name of ["入库标签", "领料成本", "供应商账", "记录", "摄像头 / 高拍仪", "上传照片", "录入送货/退货单", "上传月结 Excel", "生成成本草稿", "确认成本草稿", "校准损耗", "生成毛利快照", "复核毛利快照"]) {
      assert.equal(await pane.getByRole("button", { name, exact: true }).count(), 0, `receiving detail must not retain unrelated ${name}`);
    }
    assert.equal(await page.getByRole("button", { name: "录入送货/退货单", exact: true }).count(), 1, "one primary capture entry remains above the receipt list");
    await pane.getByRole("heading", { name: "收货核对", exact: true }).waitFor();
    assert.deepEqual(await pane.locator(".office-roll-color-text").allTextContents(), ["海蓝（海兰）", "（米色）"]);
    assert.equal(await pane.getByRole("button", { name: "这批都对，去打印", exact: true }).count(), 1);
    const history = pane.locator("details.raw-material-receipt-history");
    assert.equal(await history.evaluate(element => element.open), false, "history must initially remain collapsed");
    await page.screenshot({ path: `${output}/receiving-${width}.png`, fullPage: true });
    await pane.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/receiving-detail-visible-${width}.png`, fullPage: true });

    const trigger = pane.getByRole("button", { name: "查看原单（2页）", exact: true });
    const beforeReads = report.attachmentReads.filter(item => item.width === width).length;
    await trigger.click();
    const sourceDialog = page.getByRole("dialog", { name: "原单照片", exact: true });
    await sourceDialog.waitFor();
    await assertImage(page, 1, "AUDIT-SOURCE-P1");
    assert.equal(await sourceDialog.getByRole("button", { name: "第 1 页", exact: true }).getAttribute("aria-current"), "page");
    await page.screenshot({ path: `${output}/source-page-1-${width}.png`, fullPage: true });
    await sourceDialog.getByRole("button", { name: "第 2 页", exact: true }).click();
    await assertImage(page, 2, "AUDIT-SOURCE-P2");
    assert.equal(await sourceDialog.getByRole("button", { name: "第 2 页", exact: true }).getAttribute("aria-current"), "page");
    assert.deepEqual(report.attachmentReads.filter(item => item.width === width).slice(beforeReads).map(item => item.attachmentId), ["AUDIT-SOURCE-P1", "AUDIT-SOURCE-P2"]);
    await page.screenshot({ path: `${output}/source-page-2-${width}.png`, fullPage: true });
    await page.keyboard.press("Escape");
    await sourceDialog.waitFor({ state: "hidden" });
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true, "Escape must restore focus to the original-photo trigger");

    const ocr = await openOcr(pane);
    assert.equal(await ocr.locator(".raw-material-ocr-line-review").count(), 2);
    for (const line of delivery.ocrLines) {
      assert.equal(await ocr.getByLabel(`OCR 明细 ${line.lineId} 供应商颜色`, { exact: true }).inputValue(), line.values.supplierColor);
      assert.equal(await ocr.getByLabel(`OCR 明细 ${line.lineId} 厂内标准色（可后续统一）`, { exact: true }).inputValue(), line.values.factoryColor);
      assert.equal(await ocr.getByLabel(`OCR 明细 ${line.lineId} 行总重 kg`, { exact: true }).inputValue(), String(line.values.totalWeightKg));
    }
    await history.locator("summary").click();
    await history.locator(".timeline").waitFor();
    assert.ok((await history.innerText()).includes("原材料送货单拍照"));
    assert.ok((await history.innerText()).includes(delivery.ocrStatus));
    await page.screenshot({ path: `${output}/details-and-history-${width}.png`, fullPage: true });
    await selectReceiptRow(page, other.id);
    await pane.locator(".raw-material-detail-facts").getByText(other.id, { exact: true }).waitFor();
    assert.equal(await pane.locator("details.raw-material-receipt-history").evaluate(element => element.open), false, "switching receipts must collapse history");
    await selectReceiptRow(page, delivery.id);
    await pane.locator(".raw-material-detail-facts").getByText(delivery.id, { exact: true }).waitFor();
    assert.equal(await pane.locator("details.raw-material-receipt-history").evaluate(element => element.open), false);
    assert.deepEqual(await pane.locator(".office-roll-color-text").allTextContents(), ["海蓝（海兰）", "（米色）"], "viewing source/history must preserve both colour identities");

    // Both notes intentionally reuse their first OCR line id. An unsubmitted
    // edit must never become a different receipt's displayed or submitted facts.
    await pane.locator(".office-roll-row").first().getByRole("button", { name: "改这一卷", exact: true }).click();
    await pane.getByLabel("本卷公斤", { exact: true }).fill("69");
    await pane.getByRole("button", { name: "保存这一卷", exact: true }).click();
    assert.match(await pane.locator(".office-roll-table").innerText(), /69kg/u);
    await selectReceiptTab(page, "退货单 1");
    await selectReceiptRow(page, returned.id);
    await pane.getByRole("heading", { name: "退货核对", exact: true }).waitFor();
    await pane.getByRole("button", { name: "确认退货，不入库", exact: true }).waitFor();
    assert.equal(await pane.locator(".office-roll-row").count(), 1);
    assert.match(await pane.locator(".office-roll-table").innerText(), /-25kg/u);
    assert.equal(returned.rolls.length, 0);
    await page.screenshot({ path: `${output}/return-${width}.png`, fullPage: true });

    await selectReceiptTab(page, "待核对 3");
    await selectReceiptRow(page, conflict.id);
    await pane.getByRole("button", { name: "改为退货单核对", exact: true }).waitFor();
    assert.equal(await pane.getByRole("button", { name: "请先核对退货方向", exact: true }).isDisabled(), true);
    assert.equal(await pane.locator(".office-roll-table").count(), 0);
    const conflictOcr = await openOcr(pane);
    assert.equal(await conflictOcr.getByRole("button", { name: "确认人工复核", exact: true }).count(), 0, "expanded OCR must not expose a duplicate review bypass");
    assert.equal(await conflictOcr.getByRole("button", { name: "复核送货单", exact: true }).count(), 0, "the removed legacy action must not bypass the primary direction gate");
    await page.screenshot({ path: `${output}/return-direction-guard-${width}.png`, fullPage: true });
    report.checks.push({ width, scope: "desktop-receiving", passed: true, initialLayout, noDuplicateCaptureOrTabs: true, noFinanceActions: true, exactTwoOriginalAttachments: true, distinctDecodedImages: true, escapeFocusRestored: true, originalColoursAndOcrUnchanged: true, collapsedHistoryAfterSwitch: true, signedReturnReview: true, expandedOcrDirectionGate: true });
  } catch (error) {
    await page.screenshot({ path: `${output}/failed-${width}.png`, fullPage: true });
    throw error;
  } finally { await page.close(); }
}

async function checkPhone() {
  // 2026-11-07：三条真实路径的哈希路由回归。
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && path !== "/api/auth/prototype-login") return route.abort();
      if (await fulfillReceiptRead(route, records)) return;
      return route.continue();
    });
    const currentHash = () => page.evaluate(() => window.location.hash.replace(/^#/u, ""));
    const currentNav = () => page.locator('[data-nav-id][aria-current="page"]').first().getAttribute("data-nav-id");

    // 路径 1：一开始就是未知 hash —— 必须改写成有效默认页，地址/导航/内容一致，查询参数保留。
    const url = new URL(origin);
    url.searchParams.set("receivingCleanupReview", `hash-${Date.now()}`);
    url.searchParams.set("keepMe", "1");
    url.hash = "definitely-unknown-route";
    await page.goto(url.href);
    await page.locator('[data-nav-id][aria-current="page"]').first().waitFor();
    const defaultNav = await currentNav();
    assert.ok(defaultNav, "未知 hash 必须回落到一个有效页面");
    assert.equal(await currentHash(), defaultNav, "地址栏必须改写为实际页面");
    assert.equal(new URL(page.url()).searchParams.get("keepMe"), "1", "回写地址不得丢掉查询参数");

    // 路径 2：打开有效页后把 hash 改成未知 —— 不刷新、不点菜单也要回到原页。
    await page.evaluate(() => { window.location.hash = "still-unknown-route"; });
    await page.waitForFunction(() => window.location.hash.replace(/^#/u, "") === document.querySelector('[data-nav-id][aria-current="page"]').dataset.navId);
    assert.equal(await currentHash(), defaultNav, "未知 hash 必须回退到当前真实页面");
    assert.equal(await currentNav(), defaultNav);

    // 路径 3：点导航切换后，再写回另一个合法 hash，两者都要正确跟随。
    await page.locator('[data-nav-id="roll-inventory"]').click();
    await page.waitForFunction(() => window.location.hash === "#roll-inventory");
    assert.equal(await currentNav(), "roll-inventory", "点导航后菜单必须选中");
    await page.evaluate(() => { window.location.hash = "material-receiving"; });
    await page.waitForFunction(() => window.location.hash === "#material-receiving");
    assert.equal(await currentNav(), "material-receiving", "写回合法 hash 后菜单必须跟随");
    assert.equal(await currentHash(), "material-receiving");

    assert.deepEqual(errors, [], "路由路径不得产生页面错误");
    report.pageErrors.push(...errors.map(message => ({ width: "hash-routing", message })));
    await page.close();
  }

  const page = await openPage(390);
  try {
    await page.getByRole("button", { name: "核对全部卷材", exact: true }).click();
    const rows = page.locator(".raw-material-mobile-review-list > article");
    await rows.first().waitFor();
    assert.equal(await rows.count(), 2);
    assert.deepEqual(await rows.locator(".line-color").allTextContents(), ["海蓝（海兰）", "（米色）"]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${output}/phone-review-390.png`, fullPage: true });
    report.checks.push({ width: 390, scope: "existing-phone-review", passed: true, sameReceiptAndTwoRows: true, originalColourNames: true, noHorizontalOverflow: true });
  } catch (error) {
    await page.screenshot({ path: `${output}/failed-390.png`, fullPage: true });
    throw error;
  } finally { await page.close(); }
}

try {
  for (const width of [1440, 800]) await checkDesktop(width);
  await checkPhone();
  assert.deepEqual(report.blockedWrites, [], "no business command may be attempted during this read-only review");
  assert.deepEqual(report.pageErrors, [], "no browser runtime error");
  assert.equal(JSON.stringify(records), original, "anonymous OCR, original attachment IDs and colour/mapping facts must remain unchanged");
  report.passed = true;
  console.log("PASS receiving cleanup at 1440/800: one capture entry, source/OCR facts, exact two-page original photos, Escape focus, collapsed per-receipt history, signed returns and OCR direction guard; existing 390px review retained. Anonymous mock reads; no cloud OCR or business writes.");
} catch (error) {
  report.failure = error?.message || String(error);
  throw error;
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
}
