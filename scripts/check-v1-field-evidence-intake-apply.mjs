import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildV1FieldEvidenceManifestTemplate, serializeManifestJson } from "./v1FieldEvidenceManifest.mjs";

const applyScript = join(process.cwd(), "scripts", "apply-v1-field-evidence-intake.mjs");
const tempRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-field-evidence-intake-apply");
const sourceRoot = join(tempRoot, "sources");
const manifestPath = join(sourceRoot, "field-evidence.json");
const partialCsvPath = join(sourceRoot, "partial-evidence.csv");
const signoffBoundaryCsvPath = join(sourceRoot, "signoff-boundary.csv");
const sensitiveCsvPath = join(sourceRoot, "sensitive-evidence.csv");
const sensitiveSignoffBoundaryCsvPath = join(sourceRoot, "sensitive-signoff-boundary.csv");
const outputManifestPath = join(tempRoot, "filled-manifest.draft.json");
const sensitiveOutputManifestPath = join(tempRoot, "sensitive-filled-manifest.draft.json");
const sensitiveSignoffOutputManifestPath = join(tempRoot, "sensitive-signoff-filled-manifest.draft.json");
const forbiddenPatterns = [
  /postgres:\/\/[^<\s]+:[^<\s]+@/i,
  /AKIA[0-9A-Z_]{8,}/,
  /SUPER_SECRET_VALUE/i,
  /prod-db\.local/i,
  /\/var\/spool\/erp-secret/i,
  /\/usr\/bin\/lpstat-secret/i,
];

rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(sourceRoot, { recursive: true });

const sourceManifest = buildV1FieldEvidenceManifestTemplate();
writeFileSync(manifestPath, serializeManifestJson(sourceManifest));
writeFileSync(partialCsvPath, buildCsv([
  {
    groupKey: "production_persistence",
    groupLabel: "生产持久化",
    ownerRole: "技术 / 管理",
    itemKey: "postgres_migration_applied",
    itemLabel: "PostgreSQL 迁移已在生产库执行",
    required: "yes",
    status: "pending",
    evidenceRefFilled: "no",
    onsiteStatus: "passed",
    onsiteEvidenceRef: "EVT-PG-001",
    onsiteNotes: "迁移截图和 checksum 已归档",
  },
  {
    groupKey: "object_storage",
    groupLabel: "对象存储 / 附件留档",
    ownerRole: "技术 / 财务",
    itemKey: "attachment_upload_readback_checked",
    itemLabel: "附件上传、读回和内容摘要一致性已通过",
    required: "yes",
    status: "pending",
    evidenceRefFilled: "no",
    onsiteStatus: "accepted",
    onsiteEvidenceRef: "EVT-OBJ-002",
    onsiteNotes: "上传、读回、摘要一致性已复核，含逗号",
  },
]));
writeFileSync(signoffBoundaryCsvPath, buildSignoffBoundaryCsv([
  {
    recordType: "signoff",
    role: "办公室",
    label: "办公室",
    required: "yes",
    status: "pending",
    filledName: "no",
    filledTime: "no",
    onsiteStatus: "signed",
    onsiteSigner: "办公室负责人",
    onsiteSignedAt: "2026-07-04T11:00:00+08:00",
    onsiteConfirmedBy: "",
    onsiteConfirmedAt: "",
    onsiteNotes: "现场签字单 EVT-SIGN-001 已归档",
  },
  {
    recordType: "boundary",
    role: "v1_v2_boundary",
    label: "V1/V2 边界确认",
    required: "yes",
    status: "pending",
    filledName: "no",
    filledTime: "no",
    onsiteStatus: "confirmed",
    onsiteSigner: "",
    onsiteSignedAt: "",
    onsiteConfirmedBy: "总负责人",
    onsiteConfirmedAt: "2026-07-04T11:05:00+08:00",
    onsiteNotes: "V2 延后范围已复核",
  },
]));
writeFileSync(sensitiveCsvPath, buildCsv([
  {
    groupKey: "production_persistence",
    groupLabel: "生产持久化",
    ownerRole: "技术 / 管理",
    itemKey: "postgres_backup_configured",
    itemLabel: "生产库备份策略和负责人已确认",
    required: "yes",
    status: "pending",
    evidenceRefFilled: "no",
    onsiteStatus: "passed",
    onsiteEvidenceRef: "postgres://admin:pass@prod-db.local:5432/erp",
    onsiteNotes: "SUPER_SECRET_VALUE /usr/bin/lpstat-secret",
  },
]));
writeFileSync(sensitiveSignoffBoundaryCsvPath, buildSignoffBoundaryCsv([
  {
    recordType: "signoff",
    role: "财务",
    label: "财务",
    required: "yes",
    status: "pending",
    filledName: "no",
    filledTime: "no",
    onsiteStatus: "signed",
    onsiteSigner: "SUPER_SECRET_VALUE",
    onsiteSignedAt: "2026-07-04T11:10:00+08:00",
    onsiteConfirmedBy: "",
    onsiteConfirmedAt: "",
    onsiteNotes: "postgres://admin:pass@prod-db.local:5432/erp",
  },
]));

const partialRun = await runNode([
  applyScript,
  "--manifest",
  manifestPath,
  "--csv",
  partialCsvPath,
  "--signoff-boundary-csv",
  signoffBoundaryCsvPath,
  "--output",
  outputManifestPath,
  "--json",
]);
assert.equal(partialRun.status, 0, runFailureMessage("partial intake CSV should write a draft manifest", partialRun));
const partialResult = JSON.parse(partialRun.stdout);
assert.equal(partialResult.scope, "v1_field_evidence_intake_apply");
assert.equal(partialResult.status, "blocked_draft_written");
assert.equal(partialResult.ready, false);
assert.equal(partialResult.summary.appliedRowCount, 4);
assert.equal(partialResult.summary.appliedEvidenceRowCount, 2);
assert.equal(partialResult.summary.appliedSignoffRowCount, 1);
assert.equal(partialResult.summary.appliedBoundaryRowCount, 1);
assert.equal(partialResult.summary.invalidRowCount, 0);
assert.equal(partialResult.summary.requiredEvidenceItems, "2/40");
assert.equal(partialResult.summary.signoffs, "1/6");
assert.equal(partialResult.summary.boundary, "confirmed");
assert.equal(partialResult.summary.inputSnapshot.schema, "erp-v1-field-evidence-intake-snapshot-v1");
assert.equal(partialResult.summary.inputSnapshot.evidenceCsvIncluded, true);
assert.equal(partialResult.summary.inputSnapshot.evidenceRowCount, 2);
assert.equal(partialResult.summary.inputSnapshot.signoffBoundaryCsvIncluded, true);
assert.equal(partialResult.summary.inputSnapshot.signoffBoundaryRowCount, 2);
assert.equal(partialResult.summary.inputSnapshot.rawCsvIncluded, false);
assert.equal(partialResult.summary.inputSnapshot.digestValuesPrinted, false);
assert.equal(partialResult.files.outputWritten, true);
assert.equal(partialResult.safeguards.inputSnapshotWritten, true);
assert.equal(partialResult.safeguards.rawCsvPrinted, false);
assert.equal(partialResult.safeguards.digestValuesPrinted, false);
assert.equal(partialResult.safeguards.rawSignersPrinted, false);
assert.ok(existsSync(outputManifestPath), "draft output manifest was not written");
assert.doesNotMatch(partialRun.stdout + partialRun.stderr, /办公室负责人|总负责人/);
assertNoSensitiveOutput(partialRun.stdout + partialRun.stderr);

const outputManifest = JSON.parse(readFileSync(outputManifestPath, "utf8"));
const sourceManifestAfter = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.equal(sourceManifestAfter.evidenceGroups[0].items[0].status, "pending", "source manifest should not be mutated");
assert.equal(outputManifest.evidenceGroups[0].items[0].status, "passed");
assert.equal(outputManifest.evidenceGroups[0].items[0].evidenceRef, "EVT-PG-001");
assert.equal(outputManifest.evidenceGroups[1].items[1].status, "accepted");
assert.equal(outputManifest.evidenceGroups[1].items[1].evidenceRef, "EVT-OBJ-002");
assert.match(outputManifest.evidenceGroups[1].items[1].notes, /含逗号/);
const officeSignoff = outputManifest.signoffs.find((signoff) => signoff.role === "办公室");
assert.equal(officeSignoff.status, "signed");
assert.equal(officeSignoff.signer, "办公室负责人");
assert.equal(officeSignoff.signedAt, "2026-07-04T11:00:00+08:00");
assert.equal(outputManifest.v1V2BoundaryConfirmed.status, "confirmed");
assert.equal(outputManifest.v1V2BoundaryConfirmed.confirmedBy, "总负责人");
assert.equal(outputManifest.v1V2BoundaryConfirmed.confirmedAt, "2026-07-04T11:05:00+08:00");
assert.equal(outputManifest.fieldEvidenceIntakeSnapshot.schema, "erp-v1-field-evidence-intake-snapshot-v1");
assert.equal(outputManifest.fieldEvidenceIntakeSnapshot.evidenceCsv.included, true);
assert.equal(outputManifest.fieldEvidenceIntakeSnapshot.evidenceCsv.rowCount, 2);
assert.equal(outputManifest.fieldEvidenceIntakeSnapshot.evidenceCsv.digestAlgorithm, "sha256");
assert.match(outputManifest.fieldEvidenceIntakeSnapshot.evidenceCsv.digest, /^[a-f0-9]{64}$/);
assert.equal(outputManifest.fieldEvidenceIntakeSnapshot.signoffBoundaryCsv.included, true);
assert.equal(outputManifest.fieldEvidenceIntakeSnapshot.signoffBoundaryCsv.rowCount, 2);
assert.equal(outputManifest.fieldEvidenceIntakeSnapshot.signoffBoundaryCsv.digestAlgorithm, "sha256");
assert.match(outputManifest.fieldEvidenceIntakeSnapshot.signoffBoundaryCsv.digest, /^[a-f0-9]{64}$/);
assert.equal(outputManifest.fieldEvidenceIntakeSnapshot.safeguards.rawCsvIncluded, false);
assert.equal(outputManifest.fieldEvidenceIntakeSnapshot.safeguards.localPathIncluded, false);
assert.doesNotMatch(partialRun.stdout, new RegExp(outputManifest.fieldEvidenceIntakeSnapshot.evidenceCsv.digest));
assert.doesNotMatch(partialRun.stdout, new RegExp(outputManifest.fieldEvidenceIntakeSnapshot.signoffBoundaryCsv.digest));

const sensitiveRun = await runNode([
  applyScript,
  "--manifest",
  manifestPath,
  "--csv",
  sensitiveCsvPath,
  "--output",
  sensitiveOutputManifestPath,
  "--json",
]);
assert.equal(sensitiveRun.status, 1, "sensitive evidenceRef should fail");
const sensitiveResult = JSON.parse(sensitiveRun.stdout);
assert.equal(sensitiveResult.status, "invalid");
assert.equal(sensitiveResult.summary.invalidRowCount, 1);
assert.equal(sensitiveResult.files.outputWritten, false);
assert.equal(sensitiveResult.safeguards.sensitiveRowsRejected, true);
assert.match(sensitiveResult.invalidRows[0].fixHint, /删除连接串/);
assert.ok(!existsSync(sensitiveOutputManifestPath), "invalid run should not write output manifest");
assertNoSensitiveOutput(sensitiveRun.stdout + sensitiveRun.stderr);

const sensitiveSignoffRun = await runNode([
  applyScript,
  "--manifest",
  manifestPath,
  "--signoff-boundary-csv",
  sensitiveSignoffBoundaryCsvPath,
  "--output",
  sensitiveSignoffOutputManifestPath,
  "--json",
]);
assert.equal(sensitiveSignoffRun.status, 1, "sensitive signoff/boundary row should fail");
const sensitiveSignoffResult = JSON.parse(sensitiveSignoffRun.stdout);
assert.equal(sensitiveSignoffResult.status, "invalid");
assert.equal(sensitiveSignoffResult.summary.invalidRowCount, 1);
assert.equal(sensitiveSignoffResult.summary.appliedRowCount, 0);
assert.equal(sensitiveSignoffResult.files.outputWritten, false);
assert.equal(sensitiveSignoffResult.safeguards.sensitiveRowsRejected, true);
assert.ok(!existsSync(sensitiveSignoffOutputManifestPath), "invalid signoff run should not write output manifest");
assertNoSensitiveOutput(sensitiveSignoffRun.stdout + sensitiveSignoffRun.stderr);

const missingStatusCsvPath = join(sourceRoot, "missing-status.csv");
writeFileSync(missingStatusCsvPath, buildCsv([
  {
    groupKey: "print_hardware",
    groupLabel: "打印硬件 / CUPS / 标签",
    ownerRole: "办公室 / 仓库",
    itemKey: "cups_lpstat_checked",
    itemLabel: "真实 CUPS 队列 non-printing 预检已通过",
    required: "yes",
    status: "pending",
    evidenceRefFilled: "no",
    onsiteStatus: "",
    onsiteEvidenceRef: "EVT-PRINT-001",
    onsiteNotes: "缺状态时不能自动通过",
  },
]));
const missingStatusRun = await runNode([
  applyScript,
  "--manifest",
  manifestPath,
  "--csv",
  missingStatusCsvPath,
  "--output",
  join(tempRoot, "missing-status-output.json"),
  "--json",
]);
assert.equal(missingStatusRun.status, 1, "onsite evidence without onsiteStatus should fail");
const missingStatusResult = JSON.parse(missingStatusRun.stdout);
assert.equal(missingStatusResult.summary.invalidRowCount, 1);
assert.match(missingStatusResult.invalidRows[0].reason, /onsiteStatus is required/);
assert.match(missingStatusResult.invalidRows[0].fixHint, /填写 onsiteStatus/);
assertNoSensitiveOutput(missingStatusRun.stdout + missingStatusRun.stderr);

const missingSignoffSignerCsvPath = join(sourceRoot, "missing-signoff-signer.csv");
writeFileSync(missingSignoffSignerCsvPath, buildSignoffBoundaryCsv([
  {
    recordType: "signoff",
    role: "仓库/出库",
    label: "仓库/出库",
    required: "yes",
    status: "pending",
    filledName: "no",
    filledTime: "no",
    onsiteStatus: "signed",
    onsiteSigner: "",
    onsiteSignedAt: "2026-07-04T11:20:00+08:00",
    onsiteConfirmedBy: "",
    onsiteConfirmedAt: "",
    onsiteNotes: "缺签字人不能通过",
  },
]));
const missingSignoffRun = await runNode([
  applyScript,
  "--manifest",
  manifestPath,
  "--signoff-boundary-csv",
  missingSignoffSignerCsvPath,
  "--output",
  join(tempRoot, "missing-signoff-output.json"),
  "--json",
]);
assert.equal(missingSignoffRun.status, 1, "signed signoff without signer should fail");
const missingSignoffResult = JSON.parse(missingSignoffRun.stdout);
assert.equal(missingSignoffResult.summary.invalidRowCount, 1);
assert.match(missingSignoffResult.invalidRows[0].reason, /requires onsiteSigner and onsiteSignedAt/);
assert.match(missingSignoffResult.invalidRows[0].fixHint, /onsiteSigner 和 onsiteSignedAt/);
assertNoSensitiveOutput(missingSignoffRun.stdout + missingSignoffRun.stderr);

console.log("V1 field evidence intake apply check passed: evidence/signoff/boundary draft writes, input snapshot metadata, source preservation, sensitive-row rejection, fix hints, required onsiteStatus, required signer/time, and redacted output are covered.");

function buildCsv(rows) {
  const headers = [
    "groupKey",
    "groupLabel",
    "ownerRole",
    "itemKey",
    "itemLabel",
    "required",
    "status",
    "evidenceRefFilled",
    "onsiteStatus",
    "onsiteEvidenceRef",
    "onsiteNotes",
  ];
  return `${[headers, ...rows.map((row) => headers.map((header) => row[header] || ""))]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n")}\n`;
}

function buildSignoffBoundaryCsv(rows) {
  const headers = [
    "recordType",
    "role",
    "label",
    "required",
    "status",
    "filledName",
    "filledTime",
    "onsiteStatus",
    "onsiteSigner",
    "onsiteSignedAt",
    "onsiteConfirmedBy",
    "onsiteConfirmedAt",
    "onsiteNotes",
  ];
  return `${[headers, ...rows.map((row) => headers.map((header) => row[header] || ""))]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n")}\n`;
}

function runNode(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function runFailureMessage(message, run) {
  return `${message}\nstatus=${run.status}\nstdout=${run.stdout}\nstderr=${run.stderr}`;
}

function assertNoSensitiveOutput(output) {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(output, pattern);
  }
}
