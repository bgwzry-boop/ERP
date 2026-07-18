import assert from "node:assert/strict";
import { buildPassedPrinterDeviceFieldTest } from "./helpers/printReadinessTestFixture.mjs";

const standardFixture = buildPassedPrinterDeviceFieldTest({
  recordId: "PDQA-FIXTURE-LABEL-A",
  printDeviceId: "PRN-LABEL-A",
  printJobId: "PJ-FIXTURE-LABEL-A",
  documentType: "express_ltl_label",
  deviceLabel: "标签机A",
  driverLabel: "Generic 203dpi Label",
  paperLabel: "80x60 热敏标签",
});

assert.equal(standardFixture.operatorId, "U-OFFICE-A");
assert.equal(standardFixture.operatorName, "办公室A");
assert.equal(standardFixture.checks.length, 6);
assert.deepEqual(
  standardFixture.checks.map((item) => [item.key, item.status]),
  [
    ["sample_print", "passed"],
    ["paper_alignment", "passed"],
    ["barcode_scan", "passed"],
    ["driver_callback", "passed"],
    ["legibility", "passed"],
    ["void_reprint", "passed"],
  ],
);
assert.equal(standardFixture.evidence.barcodeScanText, "PRN-LABEL-A-SAMPLE-CODE 可扫码");

const customEvidence = { samplePrintReference: "automated sample", operatorAcceptance: "automated acceptance" };
const customizedFixture = buildPassedPrinterDeviceFieldTest({
  ...standardFixture,
  checkedAt: "2026-07-16T10:00:00.000Z",
  note: "custom fixture note",
  evidence: customEvidence,
});
assert.equal(customizedFixture.checkedAt, "2026-07-16T10:00:00.000Z");
assert.equal(customizedFixture.note, "custom fixture note");
assert.deepEqual(customizedFixture.evidence, customEvidence);

console.log("Print readiness test fixture checks passed: standard passed evidence and explicit scenario overrides are stable.");
