import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("4174 收货录入按业务字段扫描并显示把条宽幅", async ({ page }) => {
  await page.goto("/?erpReviewCheck=playwright-receipt&erpViewport=desktop#material-receiving");

  await expect(page).toHaveTitle(/本地未部署 · 袋袋赢 ERP 完整评审稿/);
  await expect(page.locator('meta[name="erp-app-id"]')).toHaveAttribute("content", "bagwin-complete-review-4174");
  await expect(page.locator(".receipt-row.head > *")).toHaveText([
    "送货单位 / 票据",
    "送货时间",
    "卷/件数",
    "总重量",
    "复核入库",
    "查重结果",
  ]);

  await page.getByRole("tab", { name: /异常/ }).click();
  const handleStripReceipt = page.locator("button.receipt-row", { hasText: "RMI-0704-003" });
  await expect(handleStripReceipt).toBeVisible();
  await handleStripReceipt.click();

  const facts = page.locator(".receipt-facts > div");
  await expect(facts.nth(0).locator("dt")).toHaveText("类型");
  await expect(facts.nth(0).locator("dd")).toHaveText("把条");
  await expect(facts.nth(1).locator("dt")).toHaveText("宽幅");
  await expect(facts.nth(1).locator("dd")).toHaveText("5cm");
  await expect(page.locator(".receipt-detail")).toContainText("缺少真实重量，尚未入库");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("4174 卷料库存按宽幅和克重显示把条默认规格", async ({ page }) => {
  await page.route("**/api/attachments/ATT-E2E-*/content", async (route) => {
    await route.fulfill({ contentType: "image/jpeg", body: await readFile(new URL("../src/assets/raw-material-delivery-note-sample.jpg", import.meta.url)) });
  });
  // Supply a weighed, reviewed roll through the read boundary. The real seed's
  // zero-weight handle receipt must stay excluded from warehouse inventory.
  await page.route("**/api/raw-material-inbounds?*", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const receipt = data.items.find((item) => item.id === "RMI-0704-003");
    expect(receipt).toBeTruthy();
    data.items.push({
      ...receipt,
      id: "RMI-E2E-WEIGHED-HANDLE",
      status: "已贴标/可用库存",
      rollCount: 1,
      totalWeightKg: 12.5,
      sourceAttachmentIds: ["ATT-E2E-P1", "ATT-E2E-P2"],
      ocrPages: [{}, {}],
      ocrLines: [{ lineId: "OCR-E2E-L2", sourcePageIndex: 1, sourceRowIndex: 6, sourceText: "测试票面原文" }],
      rolls: [{
        ...receipt.rolls[0],
        id: "RM-E2E-HANDLE-01",
        weightKg: 12.5,
        inventoryStatus: "可用",
        labelStatus: "已贴标/可用库存",
        location: "原材料仓库",
        ocrLineId: "OCR-E2E-L2",
        sourceLineRollIndex: 2,
      }],
    });
    await route.fulfill({ response, json: data });
  });
  await page.goto("/?erpReviewCheck=playwright-roll-spec&erpViewport=desktop#roll-inventory");

  await expect(page.getByRole("columnheader", { name: "规格（宽幅/克重）" })).toBeVisible();
  const handleStripRow = page.getByRole("row", { name: /RM-E2E-HANDLE-01/ });
  await expect(handleStripRow).toBeVisible();
  await expect(page.getByRole("row", { name: /RM-240704-003-01/ })).toHaveCount(0);
  await expect(handleStripRow.locator(".roll-spec-cell > strong")).toHaveText("5cm 把条");
  await expect(handleStripRow.locator(".roll-spec-cell > small")).toHaveText("65克");
  await expect(handleStripRow.locator(".roll-spec-cell")).not.toContainText("78克");
  const sourceTrigger = page.getByRole("button", { name: "查看来源票据" });
  await sourceTrigger.click();
  const sourceDialog = page.getByRole("dialog", { name: "RMI-E2E-WEIGHED-HANDLE" });
  await expect(sourceDialog).toBeVisible();
  await expect(sourceDialog).toContainText("BC-240704-029");
  await expect(sourceDialog).toContainText("第 2 页 · OCR 表格第 7 行 · 行内第 3 卷");
  await expect(sourceDialog.getByRole("img", { name: "原始票据第 2 页" })).toBeVisible();
  await sourceDialog.getByRole("button", { name: "第 1 页", exact: true }).click();
  await expect(sourceDialog.getByRole("img", { name: "原始票据第 1 页" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sourceDialog).toHaveCount(0);
  await expect(sourceTrigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("4174 收货弹窗隔离键盘焦点并在退出后恢复", async ({ page }) => {
  await page.goto("/?erpReviewCheck=keyboard-dialog&erpViewport=desktop#material-receiving");
  const trigger = page.getByRole("button", { name: "录入送货/退货单" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "选择送货单来源" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "关闭", exact: true })).toBeFocused();
  for (const key of ["Shift+Tab", "Tab", "Tab", "Tab", "Tab", "Tab"]) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("4174 多页拍单先按顺序预览，可删除，四页上限且不会提前识别", async ({ page }) => {
  const prematureWrites = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && !new URL(request.url()).pathname.startsWith("/api/auth/")) {
      prematureWrites.push(request.url());
      await route.abort();
    } else await route.continue();
  });
  await page.goto("/?erpReviewCheck=capture-pages&erpViewport=desktop#material-receiving");
  await page.getByRole("button", { name: "录入送货/退货单" }).click();
  const dialog = page.getByRole("dialog", { name: "选择送货单来源" });
  const buffer = await readFile(new URL("../src/assets/raw-material-delivery-note-sample.jpg", import.meta.url));
  const file = (number) => ({ name: `page-${number}.jpg`, mimeType: "image/jpeg", buffer });
  await dialog.getByLabel("选择送货单页面", { exact: true }).setInputFiles([file(1), file(2)]);
  await expect(dialog.getByRole("img", { name: /缩略图/ })).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: "全部 2 页已添加，开始识别" })).toBeEnabled();
  await dialog.getByRole("button", { name: "查看第 2 页", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "送货单第 2 页预览", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "删除第 1 页", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "查看第 1 页", exact: true })).toHaveAttribute("title", "page-2.jpg");
  await expect(dialog.getByRole("button", { name: "没有第二页，开始识别" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: /还有第二页，继续拍/ })).toBeEnabled();
  await dialog.getByLabel("选择送货单页面", { exact: true }).setInputFiles([file(3), file(4), file(5)]);
  await expect(dialog.getByRole("img", { name: /缩略图/ })).toHaveCount(4);
  await expect(dialog.getByRole("button", { name: /相册 \/ PDF/ })).toBeDisabled();
  await dialog.getByLabel("选择送货单页面", { exact: true }).setInputFiles([file(6)]);
  await expect(dialog.getByRole("alert")).toContainText("最多添加 4 页");
  await expect(dialog.getByRole("img", { name: /缩略图/ })).toHaveCount(4);
  expect(prematureWrites).toEqual([]);
});

test("4174 两页逐卷复核阻止跳过证据，保留改值和版本并允许失败后重试", async ({ page }) => {
  const values = { productName: "无纺布", materialType: "无纺布", factoryColor: "白色", supplierColor: "本白", spec: "78*70*2000", rollCount: 1, totalWeightKg: 10, unit: "kg", unitPrice: 2, amount: 20, rollWeightsKg: [10] };
  const fixture = { id: "RMI-E2E-REVIEW", revision: 7, supplierName: "测试复核厂家", deliveryNoteNo: "TEST-2P", status: "已识别待复核", ocrProvider: "tencent_cloud_table_v3", documentDirection: "supplier_delivery", ...values, rollCount: 2, totalWeightKg: 20, amount: 40, sourceAttachmentIds: ["ATT-E2E-P1", "ATT-E2E-P2"], ocrPages: [{}, {}], ocrReviewFields: [], ocrLines: [0, 1].map((index) => ({ lineId: `L${index}`, sourcePageIndex: index, sourceRowIndex: 3, values, recognizedValues: values, sourceText: `原图第${index + 1}页明细` })), rolls: [] };
  await page.route("**/api/attachments/ATT-E2E-*/content", async (route) => route.fulfill({ contentType: "image/jpeg", body: await readFile(new URL("../src/assets/raw-material-delivery-note-sample.jpg", import.meta.url)) }));
  await page.route("**/api/raw-material-inbounds?*", async (route) => {
    const response = await route.fetch(); const data = await response.json(); data.items = [fixture]; await route.fulfill({ response, json: data });
  });
  const submitted = [];
  await page.route("**/api/raw-material-inbounds/RMI-E2E-REVIEW/*", async (route) => {
    submitted.push(route.request().postDataJSON());
    if (submitted.length === 1) await route.fulfill({ status: 503, json: { message: "测试保存暂不可用，草稿应保留" } });
    else await route.fulfill({ json: { inbound: { ...fixture, status: "已复核待打印标签", revision: 8 } } });
  });
  await page.goto("/?erpReviewCheck=ocr-review&erpViewport=desktop#material-receiving");
  await page.getByRole("button", { name: "对照原图逐卷复核", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "对照原图逐卷复核" });
  const save = dialog.getByRole("button", { name: "确认复核并保存" });
  await expect(save).toBeDisabled();
  await expect(dialog.getByRole("img", { name: "原始票据第 1 页" })).toBeVisible();
  await dialog.getByRole("textbox", { name: /^供应商卷号/ }).fill("ROLL-EDIT-01");
  await dialog.getByRole("checkbox", { name: /已对照来源页核对/ }).check();
  await dialog.getByRole("button", { name: "第 2 行 · 第 2 页" }).click();
  await expect(dialog.getByRole("img", { name: "原始票据第 2 页" })).toBeVisible();
  await dialog.getByRole("checkbox", { name: /已对照来源页核对/ }).check();
  await dialog.getByRole("textbox", { name: "复核依据 / 修改说明" }).fill("两页原单逐卷核对，修正第一页厂家卷号");
  await expect(save).toBeEnabled();
  await page.screenshot({ path: ".erp-local-storage/project-audit-20260905/21-desktop-ocr-review.png" });
  await dialog.getByRole("textbox", { name: /^金额/ }).fill("21");
  await expect(save).toBeDisabled();
  await dialog.getByRole("textbox", { name: /^金额/ }).fill("20");
  await expect(dialog.getByRole("checkbox", { name: /已对照来源页核对/ })).not.toBeChecked();
  await dialog.getByRole("checkbox", { name: /已对照来源页核对/ }).check();
  await save.click();
  await expect(dialog.getByRole("alert")).toContainText("测试保存暂不可用");
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(submitted).toHaveLength(2);
  expect(submitted[0].expectedRevision).toBe(7);
  expect(submitted[1].expectedRevision).toBe(7);
  expect(submitted[1].lineReviews[0].values.supplierRollNo).toBe("ROLL-EDIT-01");
  expect(submitted[1].lineReviews[0].values).not.toHaveProperty("sourcePageIndex");
});

for (const width of [768, 900, 1440]) {
  test(`4174 ${width}px 完整桌面详情可访问`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/?erpReviewCheck=width-${width}&erpViewport=desktop#material-receiving`);
    await expect(page.locator(".app-shell")).toBeVisible();
    const detail = page.locator(".receipt-detail");
    await detail.scrollIntoViewIfNeeded();
    const bounds = await detail.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await page.goto(`/?erpReviewCheck=width-stock-${width}&erpViewport=desktop#inventory-query`);
    await expect(page.locator(".business-detail-panel")).toBeVisible();
    const stock = await page.locator(".business-detail-panel").boundingBox();
    expect(stock.x + stock.width).toBeLessThanOrEqual(width);
  });
}

test("4174 上线证据缺失与请求失败均不显示成功", async ({ page }) => {
  await page.goto("/?erpReviewCheck=launch-status&erpViewport=desktop#launch-status");
  await expect(page.getByRole("heading", { name: "尚未满足上线条件" })).toBeVisible();
  await expect(page.locator(".launch-status-workspace")).not.toContainText("来源已对齐");
  await page.route("**/api/system/v1-go-live-status*", (route) => route.fulfill({ status: 503, json: { message: "测试证据服务不可用" } }));
  await page.getByRole("button", { name: "刷新证据" }).click();
  await expect(page.getByRole("alert")).toContainText("测试证据服务不可用");
  await expect(page.getByRole("heading", { name: "后端证据已通过" })).toHaveCount(0);
});

test("4174 缩放跨越手机边界后回到完整桌面", async ({ page }) => {
  await page.goto("/?erpReviewCheck=viewport-family#material-receiving");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "录原材料", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-erp-runtime-family", "mobile");
  await expect(page.getByRole("navigation", { name: "主导航", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 900, height: 800 });
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-erp-runtime-family", "desktop");
  await expect(page.getByRole("heading", { name: "录原材料", exact: true })).toHaveCount(0);
});

test("4174 两页只创建一个识别任务并按页保存未替代原图", async ({ page }) => {
  const original = await readFile(new URL("../src/assets/raw-material-delivery-note-sample.jpg", import.meta.url));
  const uploads = []; const jobs = []; const unexpected = [];
  await page.route("**/api/**", async (route) => {
    if (route.request().method() === "POST" && !route.request().url().includes("/auth/")) { unexpected.push(route.request().url()); await route.abort(); }
    else await route.continue();
  });
  await page.route("**/api/attachments/binary?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const metadata = JSON.parse(params.get("metadata"));
    if (metadata.captureKind === "source_original") expect(route.request().postDataBuffer().equals(original)).toBe(true);
    const attachmentId = `ATT-CAPTURE-${uploads.length + 1}`;
    uploads.push({ attachmentId, metadata, fileName: params.get("fileName") });
    await route.fulfill({ json: { attachmentId } });
  });
  await page.route("**/api/raw-material-inbounds/ocr-jobs", async (route) => {
    jobs.push(route.request().postDataJSON());
    await route.fulfill({ json: { job: { jobId: "E2E-ONE-JOB" } } });
  });
  await page.route("**/api/raw-material-inbounds/ocr-jobs/E2E-ONE-JOB/status", async (route) => route.fulfill({ json: { job: { status: "completed", pageCount: 2, result: { inbound: { id: "RMI-E2E-TWO-PAGES", supplierName: "两页测试厂家", status: "已识别待复核", ocrPageCount: 2, rolls: [], ocrLines: [], sourceAttachmentIds: uploads.filter((item) => item.metadata.captureKind === "source_original").map((item) => item.attachmentId) } } } } }));
  await page.goto("/?erpReviewCheck=two-page-submit&erpViewport=desktop#material-receiving");
  await page.getByRole("button", { name: /录入送货\/退货单/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"][multiple]').setInputFiles([1, 2].map((index) => ({ name: `original-${index}.jpg`, mimeType: "image/jpeg", buffer: original })));
  await expect(dialog.getByRole("button", { name: "全部 2 页已添加，开始识别" })).toBeEnabled();
  await dialog.getByRole("button", { name: "全部 2 页已添加，开始识别" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".receipt-detail")).toContainText("RMI-E2E-TWO-PAGES");
  expect(jobs).toHaveLength(1); expect(jobs[0].pages).toHaveLength(2);
  expect(jobs[0].pages.every((item) => item.sourceAttachmentId && item.ocrAttachmentId && !item.contentDataUrl)).toBe(true);
  expect(uploads.filter((item) => item.metadata.captureKind === "source_original").map((item) => item.metadata.sourcePageIndex)).toEqual([0, 1]);
  expect(new Set(uploads.map((item) => item.metadata.captureId)).size).toBe(1);
  expect(unexpected).toEqual([]);
});
