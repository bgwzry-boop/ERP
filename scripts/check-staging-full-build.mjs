import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const stagingDefault = packageJson.scripts?.["build:staging"] ?? "";
const stagingFull = packageJson.scripts?.["build:staging:full"] ?? "";
const stagingFirstRelease = packageJson.scripts?.["build:staging:first-release"] ?? "";

assert.equal(stagingDefault, "npm run build:staging:full", "the default staging build must always select the full ERP profile");
assert.match(stagingFull, /VITE_ERP_RUNTIME_MODE=test/);
assert.match(stagingFull, /VITE_ERP_API_BASE_URL=\/api/);
assert.match(stagingFull, /VITE_ERP_STAGING_AUTH_BYPASS=true/);
assert.match(stagingFull, /VITE_ERP_STAGING_PREVIEW_USER_ID=U-MANAGER-A/);
assert.match(stagingFull, /VITE_RAW_MATERIAL_FIRST_RELEASE=false/);
assert.doesNotMatch(stagingFull, /VITE_RAW_MATERIAL_FIRST_RELEASE=true/);
assert.match(stagingFirstRelease, /VITE_RAW_MATERIAL_FIRST_RELEASE=true/, "the explicit production-scope preview must remain separate from the full staging build");

const assetsDirectory = new URL("../dist/assets/", import.meta.url);
const javascriptFiles = readdirSync(assetsDirectory).filter((fileName) => fileName.endsWith(".js"));
assert(javascriptFiles.length > 0, "the staging build did not produce JavaScript assets");
const bundledSource = javascriptFiles
  .map((fileName) => readFileSync(new URL(fileName, assetsDirectory), "utf8"))
  .join("\n");

for (const requiredWorkbench of ["公共待办", "订单录入", "订单池", "生产/打包", "原材料", "基础资料"]) {
  assert(
    bundledSource.includes(requiredWorkbench),
    `the full staging bundle is missing the ${requiredWorkbench} workbench`,
  );
}

console.log("Staging full-build check passed: the default staging command is full ERP, auth bypass is test-only, and all primary workbenches are bundled.");
