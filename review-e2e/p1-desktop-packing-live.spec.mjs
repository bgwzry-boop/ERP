import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

test("电脑登记真实包裹：人工核对后保存独立包裹，刷新不可重复登记", async () => {
  test.setTimeout(120_000);
  // The complete-review webServer supplies the UI only. The helper redirects
  // all API traffic into its own disposable fixture, including actual writes.
  const result = await promisify(execFile)(process.execPath, ["scripts/check-p1-desktop-packing-live.mjs"], {
    cwd: process.cwd(), timeout: 100_000, maxBuffer: 2 * 1024 * 1024,
  });
  expect(result.stdout).toContain("1 real UI submission; 2 independent packages of 5; server task, audit and refresh guard verified");
});
