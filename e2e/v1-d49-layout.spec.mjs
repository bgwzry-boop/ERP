import { expect, test } from "@playwright/test";

test("D49完整展示八岗位和环境阻塞且桌面手机无横向溢出", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("403 (Forbidden)")) browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await switchAccount(page, "U-MANAGER-A");
  const mainNavigation = page.getByRole("navigation", { name: "主导航" });
  await mainNavigation.getByRole("button", { name: /上线状态/ }).click();
  await page.getByRole("tab", { name: "生产配置", exact: true }).click();
  await page.getByRole("tab", { name: "真实值校验", exact: true }).click();

  const roleMatrix = page.getByLabel("D49八岗位就绪矩阵");
  const d49Panel = roleMatrix.locator("..");
  await expect(roleMatrix).toBeVisible();
  await expect(roleMatrix.locator(".v1-d49-role-row")).toHaveCount(8);
  for (const roleLabel of ["办公室", "库房 / 出库", "财务 / 对账", "车间报工", "打包", "司机", "管理", "技术运维"]) {
    await expect(roleMatrix.getByText(roleLabel, { exact: true })).toBeVisible();
  }
  const environmentBlockers = page.getByLabel("D49环境阻塞");
  await expect(environmentBlockers).toBeVisible();
  await expect(environmentBlockers.locator("p")).not.toHaveCount(0);
  await expectNoInternalClipping(environmentBlockers);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: ".erp-local-storage/e2e/v1-d49-desktop.png", fullPage: true });
  await d49Panel.screenshot({ path: ".erp-local-storage/e2e/v1-d49-panel-desktop.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(roleMatrix).toBeVisible();
  await expect(roleMatrix.locator(".v1-d49-role-row")).toHaveCount(8);
  await expectNoInternalClipping(environmentBlockers);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: ".erp-local-storage/e2e/v1-d49-mobile.png", fullPage: true });
  await d49Panel.screenshot({ path: ".erp-local-storage/e2e/v1-d49-panel-mobile.png" });

  expect(browserErrors, `浏览器控制台不应出现错误：\n${browserErrors.join("\n")}`).toEqual([]);
});

async function switchAccount(page, userId) {
  const accountSwitcher = page.getByRole("combobox", { name: "切换当前账号" });
  if (!await accountSwitcher.count()) return;
  await accountSwitcher.selectOption(userId);
  await expect(accountSwitcher).toHaveValue(userId);
}

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectNoInternalClipping(locator) {
  const dimensions = await locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight + 1);
}
