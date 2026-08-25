import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildV1FieldEvidenceManifestTemplate,
  requiredEvidenceGroupKeys,
  requiredSignoffRoles,
  serializeManifestJson,
} from "./v1FieldEvidenceManifest.mjs";

const generatorScript = join(process.cwd(), "scripts", "generate-v1-field-evidence-manifest.mjs");
const validatorScript = join(process.cwd(), "scripts", "validate-v1-field-evidence-manifest.mjs");
const manifestPath = join(process.cwd(), "docs", "development", "v1-field-evidence-manifest.template.json");
const checklistPath = join(process.cwd(), "docs", "development", "v1-field-evidence-checklist.zh-CN.md");
const tempRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-field-evidence-manifest");
const tempManifestPath = join(tempRoot, "v1-field-evidence-manifest.template.json");
const tempChecklistPath = join(tempRoot, "v1-field-evidence-checklist.zh-CN.md");
const readyManifestPath = join(tempRoot, "ready-manifest.json");
const invalidManifestPath = join(tempRoot, "invalid-manifest.json");
const redactionManifestPath = join(tempRoot, "redaction-manifest.json");
const forbiddenPatterns = [
  /postgres:\/\/[^<\s]+:[^<\s]+@/i,
  /AKIA[0-9A-Z]{8,}/,
  /SECRET_VALUE/i,
  /pass@prod-db/i,
  /oss-secret/i,
  /erp-v1-private-bucket/i,
  /\/var\/spool\/erp-secret/i,
  /\/usr\/bin\/lpstat-secret/i,
];

rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

const summaryRun = await runNode([generatorScript, "--json"]);
assert.equal(summaryRun.status, 0, runFailureMessage("generator summary should succeed", summaryRun));
const summary = JSON.parse(summaryRun.stdout);
assert.equal(summary.status, "ready");
assert.equal(summary.schema, "erp-v1-field-evidence-manifest-v2");
assert.equal(summary.summary.evidenceGroupCount, 7);
assert.equal(summary.summary.requiredEvidenceItemCount, 40);
assert.equal(summary.safeguards.templateContainsRealSecrets, false);
assert.equal(summary.safeguards.allRequiredEvidenceDefaultsPending, true);

const writeRun = await runNode([
  generatorScript,
  "--write",
  "--json",
  "--output-json",
  tempManifestPath,
  "--output-markdown",
  tempChecklistPath,
]);
assert.equal(writeRun.status, 0, runFailureMessage("generator write should succeed", writeRun));
assert.ok(existsSync(tempManifestPath), "temporary manifest template was not written");
assert.ok(existsSync(tempChecklistPath), "temporary checklist was not written");

const checkedManifest = readFileSync(manifestPath, "utf8");
const checkedChecklist = readFileSync(checklistPath, "utf8");
const tempManifest = readFileSync(tempManifestPath, "utf8");
const tempChecklist = readFileSync(tempChecklistPath, "utf8");
assert.equal(tempManifest, checkedManifest, "checked-in field evidence manifest is not in sync with generator");
assert.equal(tempChecklist, checkedChecklist, "checked-in field evidence checklist is not in sync with generator");

const manifest = JSON.parse(checkedManifest);
assert.equal(manifest.schema, "erp-v1-field-evidence-manifest-v2");
assert.deepEqual(
  manifest.evidenceGroups.map((group) => group.key),
  requiredEvidenceGroupKeys,
  "manifest evidence group order changed unexpectedly",
);
assert.deepEqual(
  manifest.signoffs.map((signoff) => signoff.role),
  requiredSignoffRoles,
  "manifest signoff roles changed unexpectedly",
);
assert.ok(
  manifest.evidenceGroups.every((group) =>
    group.items.every((item) => item.required === true && item.status === "pending" && item.evidenceRef === ""),
  ),
  "checked-in manifest should default every required evidence item to pending with no evidenceRef",
);
assert.match(checkedChecklist, /node scripts\/validate-v1-field-evidence-manifest\.mjs/);
assert.match(checkedChecklist, /upgrade-v1-field-evidence-manifest\.mjs/);
assert.match(checkedChecklist, /升级不会覆盖旧文件/);
assert.match(checkedChecklist, /V1 \/ V2 边界确认/);
assert.match(checkedChecklist, /工资 \/ 考勤真实闭环/);
assert.match(checkedChecklist, /首期工资草稿、会计复核、管理锁定、不可变导出和发薪确认已闭环/);
assert.match(checkedChecklist, /清单生成不等于验收通过/);

const templateValidationRun = await runNode([
  validatorScript,
  "--manifest",
  manifestPath,
  "--json",
  "--allow-blocked-exit-zero",
]);
assert.equal(templateValidationRun.status, 0, runFailureMessage("template validation should be archivable", templateValidationRun));
const templateValidation = JSON.parse(templateValidationRun.stdout);
assert.equal(templateValidation.status, "blocked");
assert.equal(templateValidation.ready, false);
assert.equal(templateValidation.schemaValid, true);
assert.ok(templateValidation.summary.blockingCount > 0, "template should remain blocked until real evidence is filled");
assertNoSensitiveOutput(templateValidationRun.stdout);

const readyManifest = buildReadyManifest();
writeFileSync(readyManifestPath, serializeManifestJson(readyManifest));
const readyRun = await runNode([validatorScript, "--manifest", readyManifestPath, "--json"]);
assert.equal(readyRun.status, 0, runFailureMessage("ready manifest should pass validation", readyRun));
const readyValidation = JSON.parse(readyRun.stdout);
assert.equal(readyValidation.status, "ready");
assert.equal(readyValidation.ready, true);
assert.equal(readyValidation.summary.blockingCount, 0);

const invalidManifest = buildV1FieldEvidenceManifestTemplate();
invalidManifest.evidenceGroups = invalidManifest.evidenceGroups.filter((group) => group.key !== "print_hardware");
writeFileSync(invalidManifestPath, serializeManifestJson(invalidManifest));
const invalidRun = await runNode([validatorScript, "--manifest", invalidManifestPath, "--json", "--allow-blocked-exit-zero"]);
assert.equal(invalidRun.status, 1, "invalid manifest should exit with schema error");
const invalidValidation = JSON.parse(invalidRun.stdout);
assert.equal(invalidValidation.status, "invalid");
assert.equal(invalidValidation.schemaValid, false);
assert.match(invalidRun.stdout, /missing evidence group: print_hardware/);

const redactionManifest = buildV1FieldEvidenceManifestTemplate();
redactionManifest.evidenceGroups[0].items[0].evidenceRef = "postgres://admin:pass@prod-db.local/erp";
redactionManifest.evidenceGroups[0].items[0].status = "passed";
writeFileSync(redactionManifestPath, serializeManifestJson(redactionManifest));
const redactionRun = await runNode([
  validatorScript,
  "--manifest",
  redactionManifestPath,
  "--json",
  "--allow-blocked-exit-zero",
]);
assert.equal(redactionRun.status, 0, runFailureMessage("redaction manifest should be readable", redactionRun));
const redactionValidation = JSON.parse(redactionRun.stdout);
assert.equal(redactionValidation.safeguards.evidenceRefsRedacted, true);
assert.ok(redactionValidation.safeguards.possibleSensitiveEvidenceRefCount >= 1);
assert.doesNotMatch(redactionRun.stdout, /prod-db\.local/);
assert.doesNotMatch(redactionRun.stdout, /pass@prod-db/);
assertNoSensitiveOutput(summaryRun.stdout + writeRun.stdout + checkedManifest + checkedChecklist + readyRun.stdout + redactionRun.stdout);

console.log("V1 field evidence manifest check passed: generator, template, checklist, validator, ready case, invalid case, and redaction are covered.");

function buildReadyManifest() {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  manifest.environment.apiBaseUrl = "https://erp.example.test/api";
  manifest.environment.productionEnvPreflightReport = "EVIDENCE-ENV-PREFLIGHT";
  manifest.environment.runtimeReadinessReport = "EVIDENCE-RUNTIME-READINESS";
  manifest.environment.fieldAcceptanceReport = "EVIDENCE-FIELD-ACCEPTANCE";
  for (const group of manifest.evidenceGroups) {
    for (const item of group.items) {
      item.status = "passed";
      item.evidenceRef = `EVIDENCE-${group.key}-${item.key}`;
      item.notes = "validated in check fixture";
    }
  }
  for (const signoff of manifest.signoffs) {
    signoff.status = "signed";
    signoff.signer = `${signoff.role}负责人`;
    signoff.signedAt = "2026-07-04T10:00:00+08:00";
    signoff.notes = "validated in check fixture";
  }
  manifest.v1V2BoundaryConfirmed.status = "confirmed";
  manifest.v1V2BoundaryConfirmed.confirmedBy = "技术/管理负责人";
  manifest.v1V2BoundaryConfirmed.confirmedAt = "2026-07-04T10:00:00+08:00";
  return manifest;
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("field evidence manifest check timed out after 10000ms"));
    }, 10000);
    timeout.unref?.();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status, signal) => {
      clearTimeout(timeout);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function runFailureMessage(message, result) {
  return `${message}; actual=${result.status}; stdout=${result.stdout || "<empty>"}; stderr=${result.stderr || "<empty>"}`;
}

function assertNoSensitiveOutput(output) {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(output, pattern, `output matched forbidden sensitive pattern ${pattern}`);
  }
}
