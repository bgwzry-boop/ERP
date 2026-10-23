import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

test("电脑排产实际提交：缺货通货与特殊尺寸进入真实任务队列", async () => {
  test.setTimeout(120_000);
  // The complete-review webServer is already available. The helper redirects
  // every API request into its own disposable fixture, including all writes.
  const result = await promisify(execFile)(process.execPath, ["scripts/check-p1-desktop-scheduling-live.mjs"], {
    cwd: process.cwd(), timeout: 100_000, maxBuffer: 2 * 1024 * 1024,
  });
  expect(result.stdout).toContain("2 real UI submissions; server tasks, queues and audit verified");
});
