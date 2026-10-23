import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

// Exercises the complete 4174 entry and its real signed preview session. Only
// synthetic delivery reads/writes are supplied; no business POST reaches origin.
for (const width of [1440, 800]) {
  test(`4174 ${width}px 送货异常原请求重试与原任务状态回读`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const pageErrors = [], blockedWrites = [], writes = [], detailReads = [], businessReads = [];
    let authenticated = false;
    let delivered = false;
    const firstId = "F-REVIEW-EXCEPTION-A", selectedId = "F-REVIEW-EXCEPTION-B";
    const reason = "已与司机和客户核实，客户现在可收货；实物、包裹与原出库单数量一致。";
    const record = id => ({
      id, fulfillmentId: id, orderLineId: `OL-${id}`, customerId: `C-${id}`,
      customerName: id === selectedId ? "异常核对客户乙" : "异常核对客户甲",
      method: "delivery", goodsSpec: "35×27×10 白色无纺布袋 100个", expectedQty: 100, actualQty: 100,
      packageCount: 2, actualPackageCount: 2, status: id === selectedId && delivered ? "配送中" : "送货异常",
      revision: id === selectedId && delivered ? 8 : 7, loadedAt: "2026-10-23T01:00:00.000Z",
      physicalOutboundAt: "2026-10-23T00:30:00.000Z", finalDeliveryAt: "", deliveredAt: "",
      shipmentProgress: { orderedQty: 100, totalIssuedQty: 100, currentQty: 100, remainingQty: 0, currentQtyLabel: "本次实出" },
      deliveryExceptions: [{ exceptionId: `EX-${id}`, exceptionType: "delivery_exception",
        status: id === selectedId && delivered ? "已解决" : "待办公室处理", reason: "客户暂时不在，等待办公室核实",
        expectedQty: 100, actualQty: 100, occurredAt: "2026-10-23T01:30:00.000Z" }],
      watermarkedPhotoAttached: false, watermarkedPhotoAttachmentId: "", signaturePhotoAttached: false,
    });
    page.on("pageerror", failure => pageErrors.push(failure.message));
    page.on("response", async response => {
      if (new URL(response.url()).pathname !== "/api/auth/prototype-login" || !response.ok()) return;
      const value = await response.json();
      authenticated = Boolean(value.session?.accessToken && value.permissions?.user?.userId === "U-MANAGER-A"
        && value.permissions?.actionPermissions?.includes("delivery.exception.resolve"));
    });
    await page.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      if (path.startsWith("/api/auth/")) return route.continue();
      if (request.method() !== "GET") {
        if (request.method() === "POST" && path === `/api/fulfillments/${selectedId}/delivery-exception-resolution`) {
          expect(request.headers().authorization).toMatch(/^Bearer \S+$/);
          writes.push({ path, body: request.postDataJSON(), key: request.headers()["idempotency-key"] });
          if (writes.length === 1) return route.fulfill({ status: 500, json: { code: "SYNTHETIC_RETRY_REQUIRED", message: "模拟连接失败，请重试原请求" } });
          delivered = true;
          return route.fulfill({ json: { fulfillmentId: selectedId, status: "配送中", operationLogId: "LOG-SYNTHETIC-DRIVER-RESOLUTION", exceptionId: `EX-${selectedId}` } });
        }
        blockedWrites.push(`${request.method()} ${path}`);
        return route.fulfill({ status: 403, json: { code: "BROWSER_AUDIT_BUSINESS_WRITE_BLOCKED", message: "只读验收阻止了意外业务写入" } });
      }
      businessReads.push(path);
      if (!path.startsWith("/api/fulfillments")) return route.continue();
      expect(request.headers().authorization).toMatch(/^Bearer \S+$/);
      if (path === "/api/fulfillments") return route.fulfill({ json: { items: [record(firstId), record(selectedId)], total: 2, page: 1, pageSize: 50 } });
      if (path === "/api/fulfillments/operator-candidates") return route.fulfill({ json: { warehouseExecutors: [], drivers: [] } });
      const id = decodeURIComponent(path.split("/").at(-1));
      expect([firstId, selectedId], "送货详情不能读取合成范围以外的任务").toContain(id);
      detailReads.push(id);
      return route.fulfill({ json: record(id) });
    });
    await page.goto(`/?erpReviewCheck=driver-exception-${width}-${Date.now()}&erpViewport=desktop#outbound-delivery`);
    await expect(page).toHaveTitle(/本地未部署.*完整评审稿/);
    await expect(page.locator('meta[name="erp-app-id"]')).toHaveAttribute("content", "bagwin-complete-review-4174");
    await expect.poll(() => authenticated, { message: "必须使用真实后端签发、具有处理权限的预览会话" }).toBe(true);
    const table = page.getByRole("table", { name: "出库交付列表" });
    const firstRow = table.getByRole("row").filter({ hasText: `OL-${firstId}` });
    const selectedRow = table.getByRole("row").filter({ hasText: `OL-${selectedId}` });
    await firstRow.click();
    const panel = page.getByRole("region", { name: "送货异常处理", exact: true });
    await expect(panel.getByRole("combobox", { name: "原异常", exact: true })).toHaveValue(`EX-${firstId}`);
    await selectedRow.click();
    await expect(panel.getByRole("combobox", { name: "原异常", exact: true })).toHaveValue(`EX-${selectedId}`);
    const trigger = panel.getByRole("button", { name: "核对并确认处理", exact: true });
    await expect(trigger).toBeDisabled();
    await panel.getByRole("textbox", { name: "处理说明", exact: true }).fill(reason);
    await expect(trigger).toBeDisabled();
    await panel.getByRole("checkbox", { name: "已核对原出库数量、包裹与单据，可以按原数量继续执行", exact: true }).check();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "确认送货异常处理", exact: true });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(node => node.open && node.matches(":modal"))).toBe(true);
    await expect(dialog).toContainText(selectedId);
    await expect(dialog).toContainText("异常核对客户乙");
    await expect(dialog).not.toContainText(firstId);
    await expect(dialog).toContainText(reason);
    await expect(dialog).toContainText("不改变出库数量、库存或账款");
    expect(writes).toHaveLength(0);
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate(node => node.contains(document.activeElement) || [document.body, document.documentElement].includes(document.activeElement)), "原生Tab可以进入浏览器工具栏，但不能聚焦背景业务控件").toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeEnabled();
    await expect(trigger).toBeFocused();
    const escapeRestoredTrigger = true;
    expect(writes).toHaveLength(0);
    await expect(panel.getByRole("textbox", { name: "处理说明", exact: true })).toHaveValue(reason);
    await trigger.click();
    await dialog.getByRole("button", { name: "确认处理", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("alert")).toHaveText("模拟连接失败，请重试原请求");
    expect(writes).toHaveLength(1);
    await expect(dialog).toBeVisible();
    await expect(panel.locator("textarea")).toBeDisabled();
    expect(writes[0].body).toMatchObject({ fulfillmentId: selectedId, exceptionId: `EX-${selectedId}`,
      expectedRevision: 7, reason, confirmed: true, quantityVerified: true });
    expect(writes[0].key).toBe(writes[0].body.idempotencyKey);
    const retryDimensions = await inspectOverflow(page, width, dialog);
    await dialog.screenshot({ path: testInfo.outputPath(`driver-exception-retry-${width}.png`) });
    const otherDetailReads = detailReads.filter(id => id === firstId).length;
    const readsBeforeSuccess = businessReads.length;
    await dialog.getByRole("button", { name: "确认处理", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1]).toEqual(writes[0]);
    await expect(dialog).not.toBeVisible();
    await expect(selectedRow).toHaveAttribute("aria-pressed", "true");
    await expect(selectedRow).toContainText("配送中");
    await expect(firstRow).toContainText("送货异常");
    await expect(page.locator(".fulfillment-detail > header")).toContainText(`OL-${selectedId}`);
    await expect(page.locator(".fulfillment-detail > header")).toContainText("配送中");
    expect(detailReads.filter(id => id === firstId)).toHaveLength(otherDetailReads);
    expect(blockedWrites, "除合成异常处理之外不得发出业务写入").toEqual([]);
    expect(pageErrors).toEqual([]);
    const successDimensions = await inspectOverflow(page, width);
    await page.screenshot({ path: testInfo.outputPath(`driver-exception-success-${width}.png`), fullPage: true });
    const observationPath = testInfo.outputPath(`driver-exception-observation-${width}.json`);
    await writeFile(observationPath, JSON.stringify({
      viewport: width, authenticated: true, escapeRestoredTrigger, retryDimensions, successDimensions, syntheticBusinessWrites: writes.length, originalRequestRetained: true,
      selectedFulfillment: selectedId, untouchedFulfillment: firstId,
      postSuccessReads: businessReads.slice(readsBeforeSuccess),
      observation: "成功后刷新关联工作台是当前设计；全量读取仅记录为P2性能观察，未要求只读一个任务。",
    }, null, 2) + "\n");
    await testInfo.attach("delivery-resolution-read-observation", { contentType: "application/json", path: observationPath });
  });
}

async function inspectOverflow(page, width, dialog) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth,
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  // The complete desktop shell deliberately still has a legacy 1180px minimum.
  // Record that separate P2 limitation at 800px; do not claim page responsiveness
  // or replace the real shell to make this new-panel test pass.
  if (width >= 1180) expect(dimensions.pageOverflow).toBeLessThanOrEqual(1);
  if (dialog) {
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    dimensions.dialogOverflow = await dialog.evaluate(node => node.scrollWidth - node.clientWidth);
    expect(dimensions.dialogOverflow).toBeLessThanOrEqual(1);
  }
  return dimensions;
}
