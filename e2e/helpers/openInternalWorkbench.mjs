import { expect } from "@playwright/test";

/**
 * Opens the root ERP workbench through its deliberately explicit local-only
 * preview entry. Bare `/` is reserved for redirecting owners to the complete
 * review application on port 4174 and must not be used by browser regression
 * tests.
 */
export async function openInternalWorkbench(page) {
  const response = await page.goto("/?internalWorkbench=1");
  expect(response?.ok(), "内部工作台入口应直接返回页面，而不是跳转到 4174 评审入口").toBe(true);
  await expect(page).toHaveURL(/\/\?internalWorkbench=1(?:$|&)/);
}
