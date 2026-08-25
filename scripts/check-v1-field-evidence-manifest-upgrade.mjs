import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildV1FieldEvidenceManifestTemplate,
  requiredSignoffRoles,
  serializeManifestJson,
  validateV1FieldEvidenceManifest,
} from "./v1FieldEvidenceManifest.mjs";
import {
  legacyManifestSchema,
  upgradeV1FieldEvidenceManifest,
} from "./upgrade-v1-field-evidence-manifest.mjs";

const tempRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-field-evidence-manifest-upgrade");
const inputPath = join(tempRoot, "legacy-v1.json");
const outputPath = join(tempRoot, "upgraded-v2.json");
const upgradeScript = join(process.cwd(), "scripts", "upgrade-v1-field-evidence-manifest.mjs");

rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

const legacyManifest = buildLegacyManifest();
const sensitiveEvidenceRef = "postgres://migration-user:SECRET_VALUE@prod-db.local/erp";
legacyManifest.evidenceGroups[0].items[0].status = "passed";
legacyManifest.evidenceGroups[0].items[0].evidenceRef = sensitiveEvidenceRef;
legacyManifest.signoffs[0].status = "signed";
legacyManifest.signoffs[0].signer = "现场负责人甲";
legacyManifest.signoffs[0].signedAt = "2026-07-11T10:00:00+08:00";
legacyManifest.v1V2BoundaryConfirmed.status = "confirmed";
legacyManifest.v1V2BoundaryConfirmed.confirmedBy = "旧范围确认人";
legacyManifest.v1V2BoundaryConfirmed.confirmedAt = "2026-07-11T10:00:00+08:00";

const upgraded = upgradeV1FieldEvidenceManifest(legacyManifest, { upgradedAt: "2026-08-25T04:20:00Z" });
assert.equal(upgraded.manifest.schema, "erp-v1-field-evidence-manifest-v2");
assert.equal(upgraded.result.summary.preservedEvidenceItemCount, 34);
assert.equal(upgraded.result.summary.preservedCompletedEvidenceItemCount, 1);
assert.equal(upgraded.result.summary.addedEvidenceGroupCount, 1);
assert.equal(upgraded.result.summary.addedEvidenceItemCount, 6);
assert.equal(upgraded.result.summary.sourceSignoffCount, 6);
assert.equal(upgraded.result.summary.sourceCompletedSignoffCount, 1);
assert.equal(upgraded.result.summary.activeSignoffCount, 0);
assert.equal(upgraded.result.summary.signoffConfirmationReset, true);
assert.equal(upgraded.result.summary.boundaryConfirmationReset, true);
assert.equal(upgraded.manifest.v1V2BoundaryConfirmed.status, "pending");
assert.equal(upgraded.manifest.v1V2BoundaryConfirmed.confirmedBy, "");
assert.equal(upgraded.manifest.v1V2BoundaryConfirmed.confirmedAt, "");
assert.ok(upgraded.manifest.signoffs.every((signoff) => signoff.status === "pending" && !signoff.signer));

const payrollGroup = upgraded.manifest.evidenceGroups.find((group) => group.key === "payroll_attendance_pilot");
assert.ok(payrollGroup);
assert.equal(payrollGroup.items.length, 6);
assert.ok(payrollGroup.items.every((item) => item.status === "pending" && item.evidenceRef === ""));
assert.equal(upgraded.manifest.evidenceGroups[0].items[0].evidenceRef, sensitiveEvidenceRef);

const validation = validateV1FieldEvidenceManifest(upgraded.manifest);
assert.equal(validation.schemaValid, true);
assert.equal(validation.ready, false);
assert.equal(validation.summary.requiredEvidenceItemsTotal, 40);
assert.equal(validation.summary.requiredEvidenceItemsCompleted, 1);

writeFileSync(inputPath, serializeManifestJson(legacyManifest), { mode: 0o600 });
const run = spawnSync(process.execPath, [upgradeScript, "--input", inputPath, "--output", outputPath, "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
assert.equal(run.status, 0, run.stderr || run.stdout);
assert.doesNotMatch(run.stdout, /SECRET_VALUE|prod-db\.local|现场负责人甲|旧范围确认人/);
const publicResult = JSON.parse(run.stdout);
assert.equal(publicResult.status, "upgraded");
assert.equal(publicResult.outputWritten, true);
assert.equal(publicResult.safeguards.sourceManifestModified, false);
assert.equal(publicResult.safeguards.existingOutputOverwritten, false);

const sourceAfterRun = JSON.parse(readFileSync(inputPath, "utf8"));
assert.equal(sourceAfterRun.schema, legacyManifestSchema);
const outputAfterRun = JSON.parse(readFileSync(outputPath, "utf8"));
assert.equal(outputAfterRun.schema, "erp-v1-field-evidence-manifest-v2");

const overwriteRun = spawnSync(process.execPath, [upgradeScript, "--input", inputPath, "--output", outputPath, "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
assert.equal(overwriteRun.status, 1);
assert.equal(JSON.parse(overwriteRun.stdout).error.code, "output_already_exists");

const inPlaceRun = spawnSync(process.execPath, [upgradeScript, "--input", inputPath, "--output", inputPath, "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
assert.equal(inPlaceRun.status, 1);
assert.equal(JSON.parse(inPlaceRun.stdout).error.code, "input_and_output_must_differ");

console.log("V1 field evidence manifest upgrade check passed: legacy evidence is preserved, payroll evidence remains pending, expanded scope requires reconfirmation, and source/output safeguards are enforced.");

function buildLegacyManifest() {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  manifest.schema = legacyManifestSchema;
  manifest.updatedAt = "2026-07-11T00:00:00+08:00";
  manifest.evidenceGroups = manifest.evidenceGroups.filter((group) => group.key !== "payroll_attendance_pilot");
  manifest.v1V2BoundaryConfirmed.v1 = manifest.v1V2BoundaryConfirmed.v1.filter((line) => !line.includes("工资"));
  manifest.v1V2BoundaryConfirmed.v2 = [
    "企业微信自动发送、自动回执抓取、AI/OCR、路线优化、自动排产、原材料成本毛利、售后工资和 BI 深化。",
  ];
  assert.deepEqual(manifest.signoffs.map((signoff) => signoff.role), requiredSignoffRoles);
  return manifest;
}
