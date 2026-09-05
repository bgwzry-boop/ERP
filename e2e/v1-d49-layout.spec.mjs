import { expect, test } from "@playwright/test";
import { openInternalWorkbench } from "./helpers/openInternalWorkbench.mjs";

test("D49桌面完整展示八岗位和环境阻塞，管理岗手机受控提示无横向溢出", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("403 (Forbidden)")) browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.setViewportSize({ width: 1280, height: 720 });
  await openInternalWorkbench(page);
  await switchAccount(page, "U-MANAGER-A");
  const mainNavigation = page.getByRole("navigation", { name: "主导航" });
  await expect(mainNavigation).toBeVisible();
  const moreWorkbenches = mainNavigation.getByRole("button", { name: "更多工作台", exact: true });
  await moreWorkbenches.click();
  await expect(moreWorkbenches).toHaveAttribute("aria-expanded", "true");
  const goLiveStatusButton = mainNavigation.getByRole("button", { name: /上线状态/ });
  await goLiveStatusButton.click();
  await expect(goLiveStatusButton).toHaveAttribute("aria-current", "page");
  await expect(mainNavigation.getByRole("button", { name: "排产", exact: true })).toBeDisabled();
  await page.getByRole("tab", { name: "生产配置", exact: true }).click();
  await page.getByRole("tab", { name: "真实值校验", exact: true }).click();

  const d49Workbench = page.getByLabel("D49员工与环境联合预检");
  const d49Tabs = page.getByRole("tablist", { name: "D49预检视图" });
  await d49Tabs.getByRole("tab", { name: /八岗位/ }).click();
  const roleMatrix = page.getByLabel("D49八岗位就绪矩阵");
  await expect(roleMatrix).toBeVisible();
  await expect(roleMatrix.locator(".v1-d49-role-row")).toHaveCount(8);
  for (const roleLabel of ["办公室", "库房 / 出库", "财务 / 对账", "车间报工", "打包", "司机", "管理", "技术运维"]) {
    await expect(roleMatrix.getByText(roleLabel, { exact: true })).toBeVisible();
  }
  await expectNoInternalClipping(roleMatrix);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: ".erp-local-storage/e2e/v1-d49-roles-desktop.png", fullPage: true });
  await d49Workbench.screenshot({ path: ".erp-local-storage/e2e/v1-d49-panel-roles-desktop.png" });

  await d49Tabs.getByRole("tab", { name: /环境门禁/ }).click();
  const environmentBlockers = page.getByLabel("D49环境阻塞");
  await expect(environmentBlockers).toBeVisible();
  await expect(environmentBlockers.locator("p")).not.toHaveCount(0);
  await expectNoInternalClipping(environmentBlockers);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: ".erp-local-storage/e2e/v1-d49-environment-desktop.png", fullPage: true });
  await d49Workbench.screenshot({ path: ".erp-local-storage/e2e/v1-d49-panel-environment-desktop.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  const desktopRequired = page.getByRole("region", { name: "电脑端使用说明" });
  await expect(desktopRequired).toBeVisible();
  await expect(desktopRequired.getByRole("heading", { name: "请使用老板电脑", exact: true })).toBeVisible();
  await expectNoInternalClipping(desktopRequired);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: ".erp-local-storage/e2e/v1-d49-management-mobile-boundary.png", fullPage: true });

  expect(browserErrors, `浏览器控制台不应出现错误：\n${browserErrors.join("\n")}`).toEqual([]);
});

async function switchAccount(page, userId) {
  const accountSwitcher = page.getByRole("combobox", { name: "切换当前账号" });
  await expect(accountSwitcher, "业务工作台应完成异步加载后再切换测试账号").toBeVisible();
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
