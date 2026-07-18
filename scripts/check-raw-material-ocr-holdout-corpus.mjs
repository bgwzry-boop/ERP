import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { precheckRawMaterialOcrHoldoutCorpus } from "../server/services/rawMaterialOcrHoldoutCorpusService.mjs";

const root = mkdtempSync(join(tmpdir(), "erp-raw-material-ocr-holdout-"));
const privateDirectory = join(root, ".erp-local-storage", "raw-material-ocr-holdout");
const templateFile = join(privateDirectory, "template.json");
const corpusFile = join(privateDirectory, "four-supplier-holdout.json");
const templateScript = fileURLToPath(new URL("./run-raw-material-ocr-holdout-template.mjs", import.meta.url));
const precheckScript = fileURLToPath(new URL("./run-raw-material-ocr-holdout-precheck.mjs", import.meta.url));

try {
  const template = spawnSync(process.execPath, [templateScript, "--confirm-template-create", "--output-file", templateFile, "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(template.status, 0, template.stderr);
  assert.equal(JSON.parse(template.stdout).ready, false);
  const emptyTemplate = precheckRawMaterialOcrHoldoutCorpus({ file: templateFile, projectRoot: root });
  assert.equal(emptyTemplate.ready, false);
  assert.equal(emptyTemplate.error.code, "RAW_MATERIAL_OCR_HOLDOUT_CASE_COUNT_INVALID");

  const corpus = buildCorpus();
  writePrivateJson(corpusFile, corpus);
  const ready = precheckRawMaterialOcrHoldoutCorpus({ file: corpusFile, projectRoot: root });
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.summary.formatKeys, [
    "count_total_per_roll_weights",
    "one_weighed_roll_per_row",
    "variable_per_roll_weights",
    "supplier_number_optional",
  ]);
  assert.equal(ready.summary.caseCount, 4);
  assert.equal(ready.summary.expectedRollCount, 8);
  assert.equal(ready.summary.unavailableRollCount, 8);
  assert.equal(JSON.stringify(ready).includes("供应商1"), false);
  assert.equal(JSON.stringify(ready).includes("1440"), false);

  const cliReady = spawnSync(process.execPath, [precheckScript, "--file", corpusFile, "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(cliReady.status, 0, cliReady.stderr);
  assert.equal(JSON.parse(cliReady.stdout).ready, true);
  assert.equal(cliReady.stdout.includes("供应商1"), false);

  const missingFormat = buildCorpus();
  missingFormat.cases[2].formatKey = "one_weighed_roll_per_row";
  writePrivateJson(corpusFile, missingFormat);
  assert.equal(precheckRawMaterialOcrHoldoutCorpus({ file: corpusFile, projectRoot: root }).error.code, "RAW_MATERIAL_OCR_HOLDOUT_FORMAT_COVERAGE_INCOMPLETE");

  const mismatch = buildCorpus();
  mismatch.cases[0].ocrTableRows[1][1][6] = "1";
  writePrivateJson(corpusFile, mismatch);
  assert.equal(precheckRawMaterialOcrHoldoutCorpus({ file: corpusFile, projectRoot: root }).error.code, "RAW_MATERIAL_OCR_HOLDOUT_EXPECTATION_MISMATCH");

  writePrivateJson(corpusFile, buildCorpus());
  chmodSync(corpusFile, 0o644);
  assert.equal(precheckRawMaterialOcrHoldoutCorpus({ file: corpusFile, projectRoot: root }).error.code, "RAW_MATERIAL_OCR_HOLDOUT_FILE_NOT_PRIVATE");
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("Raw-material OCR holdout checks passed: private four-format corpus, parser expectations, unavailable-inventory guard, redacted reporting, and blocked templates are covered.");

function buildCorpus() {
  return {
    schemaVersion: "raw-material-ocr-holdout-corpus-v1",
    sourceKind: "confirmed_private_supplier_holdout",
    cases: [
      buildCase({ formatKey: "count_total_per_roll_weights", index: 1 }),
      buildCase({ formatKey: "one_weighed_roll_per_row", index: 2 }),
      buildCase({ formatKey: "variable_per_roll_weights", index: 3 }),
      buildCase({ formatKey: "supplier_number_optional", index: 4, omitDeliveryNoteNo: true }),
    ],
  };
}

function buildCase({ formatKey, index, omitDeliveryNoteNo = false }) {
  const supplierName = `供应商${index}`;
  const deliveryNoteNo = omitDeliveryNoteNo ? "" : `S${index}-20260704-01`;
  const color = index % 2 ? "红色" : "蓝色";
  const amount = 1440 + index;
  const sourceTable = [["供应商", supplierName], ["送货日期", "2026-07-04"]];
  if (!omitDeliveryNoteNo) sourceTable.splice(1, 0, ["送货单号", deliveryNoteNo]);
  return {
    caseId: `supplier-${index}-holdout`,
    formatKey,
    sourceEvidence: { captureKind: "tencent_table_ocr_saved_output", confirmedAt: "2026-07-16" },
    ocrTableRows: [
      sourceTable,
      [
        ["序号", "货物名称", "规格型号", "件数", "数量", "单价", "金额", "重量/KG"],
        ["1", color, "78*70*1500", "2", "160", "9", String(amount), "80", "80"],
      ],
    ],
    expected: {
      supplierName,
      deliveryNoteNo,
      receivedAt: "2026-07-04",
      rollCount: 2,
      totalWeightKg: 160,
      amount,
      lines: [{
        productName: "无纺布卷料",
        materialType: "无纺布",
        supplierColor: color,
        spec: "78*70*1500",
        rollCount: 2,
        totalWeightKg: 160,
        unit: "kg",
        unitPrice: 9,
        amount,
        rollWeightsKg: [80, 80],
      }],
    },
  };
}

function writePrivateJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}
