import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCompleteReviewApiEnv, buildCompleteReviewFrontendEnv } from "./completeReviewOcrEnv.mjs";

const rootDir = mkdtempSync(join(tmpdir(), "erp-complete-review-ocr-env-"));
const secureDir = join(rootDir, ".erp-local-storage", "tencent-ocr");
const secureEnvPath = join(secureDir, "secure.env");

try {
  assert.deepEqual(buildCompleteReviewApiEnv({ rootDir, baseEnv: { SAFE_BASE: "kept" } }), { SAFE_BASE: "kept" });

  mkdirSync(secureDir, { recursive: true, mode: 0o700 });
  writeFileSync(secureEnvPath, [
    'ERP_TENCENT_OCR_SECRET_ID="AKID-LOCAL-CHECK"',
    'ERP_TENCENT_OCR_SECRET_KEY="SECRET-LOCAL-CHECK"',
    "ERP_TENCENT_OCR_REGION=ap-guangzhou",
    "UNRELATED_VALUE=must-not-load",
    "",
  ].join("\n"), { mode: 0o600 });

  const loaded = buildCompleteReviewApiEnv({ rootDir, baseEnv: { SAFE_BASE: "kept" } });
  assert.equal(loaded.SAFE_BASE, "kept");
  assert.equal(loaded.ERP_TENCENT_OCR_SECRET_ID, "AKID-LOCAL-CHECK");
  assert.equal(loaded.ERP_TENCENT_OCR_SECRET_KEY, "SECRET-LOCAL-CHECK");
  assert.equal(loaded.ERP_TENCENT_OCR_REGION, "ap-guangzhou");
  assert.equal(loaded.UNRELATED_VALUE, undefined, "review startup must load only the OCR allowlist");

  const explicit = buildCompleteReviewApiEnv({
    rootDir,
    baseEnv: {
      ERP_TENCENT_OCR_SECRET_ID: "AKID-EXPLICIT-CHECK",
      ERP_TENCENT_OCR_SECRET_KEY: "SECRET-EXPLICIT-CHECK",
      ERP_TENCENT_OCR_REGION: "ap-shanghai",
    },
  });
  assert.equal(explicit.ERP_TENCENT_OCR_SECRET_ID, "AKID-EXPLICIT-CHECK");
  assert.equal(explicit.ERP_TENCENT_OCR_SECRET_KEY, "SECRET-EXPLICIT-CHECK");
  assert.equal(explicit.ERP_TENCENT_OCR_REGION, "ap-shanghai");

  assert.deepEqual(buildCompleteReviewFrontendEnv({
    baseEnv: {
      SAFE_BASE: "kept",
      ERP_TENCENT_OCR_SECRET_ID: "must-not-reach-vite",
      ERP_TENCENT_OCR_SECRET_KEY: "must-not-reach-vite",
      TENCENTCLOUD_SECRET_ID: "must-not-reach-vite",
      TENCENTCLOUD_SECRET_KEY: "must-not-reach-vite",
    },
  }), { SAFE_BASE: "kept" });

  chmodSync(secureEnvPath, 0o644);
  assert.throws(
    () => buildCompleteReviewApiEnv({ rootDir, baseEnv: {} }),
    /权限过宽.*0600/,
  );
} finally {
  rmSync(rootDir, { recursive: true, force: true });
}

console.log("Complete-review OCR env checks passed: secure local credentials load only into the API allowlist with strict permissions and explicit-env precedence.");
