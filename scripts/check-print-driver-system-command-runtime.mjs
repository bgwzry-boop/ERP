import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  inspectCommandAvailability,
  inspectSpoolDirectory,
  runSystemPrinterCommand,
} from "../server/printDriverSystemCommandRuntime.mjs";

assert.deepEqual(inspectCommandAvailability(""), {
  configured: false,
  executable: false,
  detail: "未配置命令，未检查可执行文件",
});
assert.equal(inspectCommandAvailability(process.execPath).executable, true);
assert.equal(inspectCommandAvailability("definitely-missing-erp-print-command").executable, false);

const checkDir = join(process.cwd(), ".erp-local-storage", "checks", "print-driver-system-command-runtime");
const missingDir = join(checkDir, "missing");
const filePath = join(checkDir, "not-a-directory.txt");
rmSync(checkDir, { recursive: true, force: true });
mkdirSync(checkDir, { recursive: true });
writeFileSync(filePath, "not a spool directory", "utf8");
assert.equal(inspectSpoolDirectory("").exists, false);
assert.equal(inspectSpoolDirectory(missingDir).writable, false);
assert.equal(inspectSpoolDirectory(filePath).writable, false);
assert.equal(inspectSpoolDirectory(checkDir).writable, true);

const result = runSystemPrinterCommand({
  command: process.execPath,
  args: ["--version"],
  stdin: "",
  timeoutMs: 5000,
});
assert.equal(result.status, 0);
assert.match(String(result.stdout ?? ""), /^v\d+/);

const source = readFileSync(new URL("../server/printDriverSystemCommandRuntime.mjs", import.meta.url), "utf8");
assert.match(source, /shell: false/);
rmSync(checkDir, { recursive: true, force: true });

console.log("Print driver system-command runtime checks passed.");
