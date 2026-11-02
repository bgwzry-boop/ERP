import { fulfillReceiptRead } from "./receipt-ui-read-fixtures.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { buildRawMaterialInboundDraftFromOcr } from "../server/services/rawMaterialOcrParserService.mjs";

const output = "screenshots/raw-material-receive-dialog";
await mkdir(output, { recursive: true });
const report = { passed: false, mockedOcrAndStorage: true, checks: [], unexpectedWrites: [], pageErrors: [] };
function draft(id, returns = false) {
  const rows = [["测试原料厂"], ["品名", "颜色", "规格", "数量", "重量", "单价", "金额"], ["无纺布", "本白", "78*090*1500", "1", returns ? "-68" : "68", "11.8", returns ? "-802.4" : "802.4"]];
  return buildRawMaterialInboundDraftFromOcr({ inboundId: id, supplierNameHint: "测试原料厂", knownSupplierNames: ["测试原料厂"], documentDirectionHint: "supplier_delivery", ocr: { tables: [{ cells: rows.flatMap((row, y) => row.map((text, x) => ({ text, rowTl: y, rowBr: y, colTl: x, colBr: x, confidence: 96 }))) }] } });
}
// A real two-page PDF, generated without private documents or attachments.
function twoPagePdf() {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 260] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>", "", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 260] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  for (const [index, text] of [[3, "Anonymous page one"], [5, "Anonymous page two"]]) {
    const content = `BT /F1 12 Tf 20 200 Td (${text}) Tj ET`;
    objects[index] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  }
  let body = "%PDF-1.4\n", offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body)); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
try {
  for (const width of [1440, 800]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, permissions: ["camera"] });
    let current = [draft("RMI-CAPTURE-EXISTING")], failed = true, requests = [], uploads = [], releaseStart;
    let holdStart = new Promise(resolve => { releaseStart = resolve; });
    let nextReturn = width === 1440;
    page.on("pageerror", error => report.pageErrors.push(error.message));
    await page.addInitScript(() => {
      const media = navigator.mediaDevices;
      const originalOpen = media.getUserMedia.bind(media), originalList = media.enumerateDevices.bind(media);
      window.__captureStreams = [];
      window.__captureConstraints = [];
      media.getUserMedia = async constraints => {
        window.__captureConstraints.push(constraints);
        const stream = await originalOpen(constraints);
        window.__captureStreams.push(stream);
        return stream;
      };
      media.enumerateDevices = async () => [...await originalList(), { kind: "videoinput", deviceId: "anonymous-second-camera", label: "测试高拍仪", groupId: "anonymous" }];
    });
    await page.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      if (await fulfillReceiptRead(route, current)) return;
      if (request.method() === "POST" && path === "/api/attachments/binary") {
        uploads.push({ bytes: request.postDataBuffer(), metadata: JSON.parse(url.searchParams.get("metadata")), name: url.searchParams.get("fileName") });
        return route.fulfill({ json: { attachmentId: `ATT-ANONYMOUS-${uploads.length}`, hasContent: true, status: "uploaded" } });
      }
      if (request.method() === "POST" && path === "/api/raw-material-inbounds/ocr-jobs") {
        requests.push(request.postDataJSON());
        await holdStart;
        if (failed) return route.fulfill({ status: 503, json: { code: "ANONYMOUS_RETRY", message: "测试：识别失败，页面保留" } });
        return route.fulfill({ json: { job: { jobId: "JOB-ANONYMOUS" } } });
      }
      if (request.method() === "POST" && path === "/api/raw-material-inbounds/ocr-jobs/JOB-ANONYMOUS/status") {
        const inbound = draft(`RMI-CAPTURE-${nextReturn ? "RETURN" : "DELIVERY"}-${width}`, nextReturn);
        current = [inbound, ...current];
        return route.fulfill({ json: { job: { status: "completed", pageCount: requests.at(-1).pages.length, result: { inbound, operationLogId: "AUDIT-ANONYMOUS" } } } });
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && path !== "/api/auth/prototype-login") {
        report.unexpectedWrites.push({ path, method: request.method() });
        return route.abort();
      }
      return route.continue();
    });
    try {
      await page.goto(`http://127.0.0.1:4174/?receiveCapture=${width}&erpViewport=desktop#material-receiving`);
      await page.getByRole("button", { name: "录入送货/退货单", exact: true }).click();
      const dialog = page.locator(".raw-material-receive-dialog");
      await dialog.waitFor();
      const png = Buffer.from(await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 200; canvas.height = 260; const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 200, 260); ctx.fillStyle = "black"; ctx.fillText("Anonymous delivery receipt", 10, 60); return canvas.toDataURL("image/png").split(",")[1]; }), "base64");
      const file = index => ({ name: `anonymous-page-${index}.png`, mimeType: "image/png", buffer: png });
      const input = dialog.getByLabel("添加单据照片或PDF", { exact: true });
      await input.setInputFiles([file(1), file(2)]);
      await dialog.getByRole("list", { name: "单据逐页预览" }).locator("li").nth(1).waitFor();
      assert.equal(uploads.length, 0, "adding pages must not upload before explicit recognition");
      assert.equal(requests.length, 0);
      await dialog.getByRole("button", { name: "查看第 2 页大图", exact: true }).click();
      await page.getByRole("dialog", { name: "单据第 2 页大图", exact: true }).waitFor();
      await page.getByRole("button", { name: "关闭大图", exact: true }).click();
      await dialog.getByRole("button", { name: "删除第 1 页", exact: true }).click();
      assert.equal(await dialog.locator(".raw-material-receive-pages li").count(), 1);
      await input.setInputFiles([file(3), file(4)]);
      await dialog.locator(".raw-material-receive-pages li").nth(2).waitFor();
      await dialog.getByRole("button", { name: "摄像头 / 高拍仪", exact: true }).click();
      const camera = page.getByRole("dialog", { name: "摄像头 / 高拍仪拍送货单", exact: true });
      await camera.getByRole("button", { name: "拍照", exact: true }).waitFor();
      await camera.getByLabel("选择摄像头", { exact: true }).selectOption("anonymous-second-camera");
      await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 0 && ![...document.querySelectorAll(".delivery-note-camera button")].find(button => button.textContent === "拍照")?.disabled);
      await camera.getByRole("button", { name: "拍照", exact: true }).evaluate(button => { button.click(); button.click(); });
      await camera.getByRole("button", { name: "已拍 1 页", exact: true }).waitFor();
      assert.equal(await camera.getByRole("button", { name: "已拍 1 页", exact: true }).isDisabled(), true, "one remaining page caps the camera, including double clicks");
      assert.equal(await camera.locator(".delivery-note-camera-pages img").count(), 1);
      assert.equal(requests.length, 0);
      await page.screenshot({ path: `${output}/camera-${width}.png`, fullPage: true });
      await camera.getByRole("button", { name: "拍好了，核对页面", exact: true }).click();
      await dialog.locator(".raw-material-receive-pages li").nth(3).waitFor();
      assert.equal(await page.evaluate(() => window.__captureStreams.every(stream => stream.getTracks().every(track => track.readyState === "ended"))), true, "closing camera stops every stream");
      assert.equal(await page.evaluate(() => window.__captureConstraints.some(value => value.video?.deviceId?.exact === "anonymous-second-camera")), true, "selected scanner is used in getUserMedia constraints");
      assert.equal(await dialog.getByRole("button", { name: "上传照片 / PDF", exact: true }).isDisabled(), true);
      assert.equal(uploads.length, 0);
      await page.screenshot({ path: `${output}/four-pages-${width}.png`, fullPage: true });
      await dialog.getByRole("button", { name: "删除第 4 页", exact: true }).click();
      await dialog.getByRole("button", { name: "删除第 3 页", exact: true }).click();
      await dialog.getByRole("button", { name: "开始识别", exact: true }).evaluate(button => { button.click(); button.click(); });
      await page.waitForFunction(() => document.querySelector(".raw-material-receive-dialog")?.getAttribute("aria-busy") === "true");
      for (let attempt = 0; !requests.length && attempt < 500; attempt++) await page.waitForTimeout(20);
      assert.equal(requests.length, 1, "double start must produce one recognition job");
      assert.equal(requests[0].pages.length, 2);
      assert.deepEqual(uploads.map(upload => upload.name), ["anonymous-page-2.png", "anonymous-page-3.png"], "deleted page is not uploaded; original order remains");
      for (const [index, upload] of uploads.entries()) {
        assert.equal(upload.bytes.equals(png), true, "the exact original image bytes are uploaded");
        assert.equal(upload.metadata.captureKind, "source_original");
        assert.equal(upload.metadata.sourcePageIndex, index);
      }
      assert.equal(await dialog.getByRole("button", { name: "关闭录单", exact: true }).isDisabled(), true);
      await page.keyboard.press("Escape");
      assert.equal(await dialog.count(), 1, "busy recognition cannot be dismissed");
      releaseStart();
      await dialog.getByRole("alert").filter({ hasText: "测试：识别失败" }).waitFor();
      assert.equal(await dialog.locator(".raw-material-receive-pages li").count(), 2, "failed recognition keeps pages for retry");
      failed = false;
      await dialog.getByRole("button", { name: "开始识别", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.locator("button.receipt-queue-item.selected").filter({ hasText: `RMI-CAPTURE-${nextReturn ? "RETURN" : "DELIVERY"}-${width}` }).waitFor({ state: "attached" });
      await page.locator(".formal-receiving-workspace .raw-material-detail-facts").getByText(`RMI-CAPTURE-${nextReturn ? "RETURN" : "DELIVERY"}-${width}`, { exact: true }).waitFor();
      assert.equal(requests.at(-1).documentDirectionHint, "supplier_delivery");
      if (nextReturn) {
        assert.equal(await page.getByRole("tab", { name: "退货单 1", exact: true }).getAttribute("aria-selected"), "true", "server-detected material return is selected without a client override");
        assert.equal(current[0].rolls.length, 0);
      }
      assert.equal(current[0].status, "已识别待复核", "recognition never confirms stock");
      report.checks.push({ width, scope: "camera-and-multipage", passed: true, originalImageBytesPreserved: true, doubleClickGuard: true, busyGuard: true, failedRetry: true, automaticReturn: nextReturn });

      await page.getByRole("button", { name: "录入送货/退货单", exact: true }).click();
      await dialog.getByRole("button", { name: "原料退货单", exact: true }).click();
      assert.equal(await dialog.getByRole("button", { name: "上传照片 / PDF", exact: true }).isDisabled(), true);
      await dialog.getByLabel("退货供应商", { exact: true }).selectOption("测试原料厂");
      await input.setInputFiles({ name: "anonymous-two-pages.pdf", mimeType: "application/pdf", buffer: twoPagePdf() });
      await dialog.locator(".raw-material-receive-pages li").nth(1).waitFor();
      assert.equal(await dialog.locator(".raw-material-receive-pages li").count(), 2, "PDF is expanded into ordered pages");
      assert.equal(await dialog.getByLabel("退货供应商", { exact: true }).isDisabled(), true);
      nextReturn = true;
      await page.screenshot({ path: `${output}/pdf-return-${width}.png`, fullPage: true });
      await dialog.getByRole("button", { name: "开始识别", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(requests.at(-1).supplierNameHint, "测试原料厂");
      assert.equal(requests.at(-1).documentDirectionHint, "supplier_return");
      assert.deepEqual(requests.at(-1).pages.map(item => item.pdfPageNumber), [1, 2]);
      report.checks.push({ width, scope: "pdf-and-explicit-material-return", passed: true, pages: 2, supplierRequired: true });
    } catch (error) {
      await page.screenshot({ path: `${output}/failed-${width}.png`, fullPage: true });
      throw error;
    } finally { await page.close(); }
  }
  assert.deepEqual(report.unexpectedWrites, []);
  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
  console.log("PASS 1440/800: genuine getUserMedia integration with synthetic camera, scanner selection, page thumbnails/preview/delete/order/4-page cap, exact original image upload, double-submit/busy guards, failed retry, PDF pages, explicit and automatically detected material returns; anonymous OCR/storage endpoints mocked, no actual business writes.");
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
}
