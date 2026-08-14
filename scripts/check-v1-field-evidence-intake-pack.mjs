import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildV1FieldEvidenceManifestTemplate, serializeManifestJson } from "./v1FieldEvidenceManifest.mjs";

const intakeScript = join(process.cwd(), "scripts", "run-v1-field-evidence-intake-pack.mjs");
const tempRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-field-evidence-intake");
const sourceRoot = join(tempRoot, "sources");
const blockedOutputRoot = join(tempRoot, "blocked-pack");
const readyOutputRoot = join(tempRoot, "ready-pack");
const blockedManifestPath = join(sourceRoot, "field-evidence-blocked.json");
const readyManifestPath = join(sourceRoot, "field-evidence-ready.json");
const releaseCandidatePath = join(sourceRoot, "release-candidate.json");
const onsiteTaskBoardPath = join(sourceRoot, "onsite-task-board.json");
const completionSnapshotPath = join(sourceRoot, "completion-snapshot.json");
const missingReleaseCandidatePath = join(sourceRoot, "missing-release-candidate.json");
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

writeFileSync(blockedManifestPath, serializeManifestJson(buildSensitiveBlockedManifest()));
writeFileSync(readyManifestPath, serializeManifestJson(buildReadyManifest()));
writeFileSync(releaseCandidatePath, `${JSON.stringify(buildBlockedReleaseCandidate(), null, 2)}\n`);
writeFileSync(onsiteTaskBoardPath, `${JSON.stringify(buildBlockedTaskBoard(), null, 2)}\n`);
writeFileSync(completionSnapshotPath, `${JSON.stringify(buildBlockedCompletionSnapshot(), null, 2)}\n`);

const blockedRun = await runNode([
  intakeScript,
  "--manifest",
  blockedManifestPath,
  "--release-candidate-json",
  releaseCandidatePath,
  "--onsite-task-board-json",
  onsiteTaskBoardPath,
  "--completion-snapshot-json",
  completionSnapshotPath,
  "--output-dir",
  blockedOutputRoot,
  "--json",
]);
assert.equal(blockedRun.status, 0, runFailureMessage("blocked intake pack should be written", blockedRun));
const blockedResult = JSON.parse(blockedRun.stdout);
assert.equal(blockedResult.scope, "v1_field_evidence_intake_pack");
assert.equal(blockedResult.status, "blocked_pack_written");
assert.equal(blockedResult.ready, false);
assert.equal(blockedResult.summary.requiredEvidenceItems, "0/40");
assert.equal(blockedResult.summary.signoffs, "0/6");
assert.equal(blockedResult.summary.releaseCandidate, "0/4 发布门禁通过");
assert.equal(blockedResult.summary.v1Readiness, "76-79%");
assert.equal(blockedResult.summary.onsiteTasks, 52);
assert.equal(blockedResult.groups.length, 7);
assert.equal(blockedResult.files.groupMarkdownFiles.length, 7);
assert.equal(blockedResult.safeguards.rawEvidenceRefsIncluded, false);
assert.equal(blockedResult.safeguards.possibleSensitiveEvidenceRefCount, 5);
assert.ok(existsSync(join(blockedOutputRoot, "groups", "print_hardware.zh-CN.md")));

const blockedSummary = readGeneratedFile(blockedResult.files.summaryMarkdown);
const blockedManifest = readGeneratedFile(blockedResult.files.intakeManifest);
const blockedCsv = readGeneratedFile(blockedResult.files.evidenceItemsCsv);
const intakeRules = readGeneratedFile(blockedResult.files.intakeRulesMarkdown);
const signoffBoundary = readGeneratedFile(blockedResult.files.signoffBoundaryMarkdown);
const signoffBoundaryCsv = readGeneratedFile(blockedResult.files.signoffBoundaryCsv);
const printGroup = readGeneratedFile(join(blockedOutputRoot, "groups", "print_hardware.zh-CN.md"));
assert.match(blockedSummary, /ERP V1 现场证据采集包/);
assert.match(blockedSummary, /当前结论：BLOCKED/);
assert.match(blockedSummary, /V1 真实上线就绪度：76-79%/);
assert.match(blockedSummary, /groups\/print_hardware\.zh-CN\.md/);
assert.match(blockedManifest, /v1_field_evidence_intake_pack/);
assert.match(blockedCsv, /postgres_migration_applied/);
assert.match(blockedCsv, /"onsiteStatus"/);
assert.match(blockedCsv, /"no"/);
assert.match(intakeRules, /ERP V1 现场证据填写规则/);
assert.match(intakeRules, /pending.*passed.*accepted.*blocked.*not_applicable/);
assert.match(intakeRules, /signed.*accepted/);
assert.match(intakeRules, /confirmed/);
assert.match(intakeRules, /--sync-canonical-latest/);
assert.match(intakeRules, /filled-manifest\.draft\.json/);
assert.match(signoffBoundary, /ERP V1 签字与 V1\/V2 边界确认单/);
assert.match(signoffBoundaryCsv, /"recordType","role","label"/);
assert.match(signoffBoundaryCsv, /"signoff","办公室","办公室"/);
assert.match(signoffBoundaryCsv, /"boundary","v1_v2_boundary","V1\/V2 边界确认"/);
assert.match(signoffBoundaryCsv, /"onsiteConfirmedBy"/);
assert.match(printGroup, /真实 CUPS 队列 non-printing 预检已通过/);
assert.match(printGroup, /对应现场任务/);
assert.match(printGroup, /标签机真实样张已出纸并留档/);
assertNoSensitiveOutput(blockedRun.stdout + blockedRun.stderr + blockedSummary + blockedManifest + blockedCsv + intakeRules + signoffBoundary + signoffBoundaryCsv + printGroup);

const readyRun = await runNode([
  intakeScript,
  "--manifest",
  readyManifestPath,
  "--output-dir",
  readyOutputRoot,
  "--json",
]);
assert.equal(readyRun.status, 0, runFailureMessage("ready intake pack should be written", readyRun));
const readyResult = JSON.parse(readyRun.stdout);
assert.equal(readyResult.status, "ready_pack_written");
assert.equal(readyResult.ready, true);
assert.equal(readyResult.summary.requiredEvidenceItems, "40/40");
assert.equal(readyResult.summary.signoffs, "6/6");
assert.equal(readyResult.summary.boundary, "confirmed");
assert.equal(readyResult.groups.every((group) => group.ready), true);
assertNoSensitiveOutput(readyRun.stdout + readyRun.stderr + readGeneratedFile(readyResult.files.summaryMarkdown));

const missingRun = await runNode([
  intakeScript,
  "--manifest",
  blockedManifestPath,
  "--release-candidate-json",
  missingReleaseCandidatePath,
  "--output-dir",
  join(tempRoot, "missing-pack"),
  "--json",
]);
assert.equal(missingRun.status, 1, "explicit missing release candidate should fail");
const missingResult = JSON.parse(missingRun.stdout);
assert.equal(missingResult.status, "error");
assert.match(missingResult.error.message, /release candidate JSON is missing/);
assertNoSensitiveOutput(missingRun.stdout + missingRun.stderr);

console.log("V1 field evidence intake pack check passed: blocked and ready packs, per-group files, CSV, optional reports, missing inputs, and redaction are covered.");

function buildSensitiveBlockedManifest() {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  const refs = [
    "postgres://admin:pass@prod-db.local:5432/erp",
    "AKIA_PROD_SECRET",
    "SUPER_SECRET_VALUE",
    "/var/spool/erp-secret",
    "/usr/bin/lpstat-secret",
  ];
  for (const [index, ref] of refs.entries()) {
    manifest.evidenceGroups[0].items[index].evidenceRef = ref;
    manifest.evidenceGroups[0].items[index].notes = `sensitive note ${index}`;
  }
  return manifest;
}

function buildReadyManifest() {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  manifest.environment.apiBaseUrl = "https://erp.example.test/api";
  manifest.environment.productionEnvPreflightReport = "EVT-PREFLIGHT-001";
  manifest.environment.runtimeReadinessReport = "EVT-RUNTIME-001";
  manifest.environment.fieldAcceptanceReport = "EVT-FIELD-001";
  for (const group of manifest.evidenceGroups) {
    for (const item of group.items) {
      item.status = "passed";
      item.evidenceRef = `EVT-${group.key}-${item.key}`;
      item.notes = "已留档";
    }
  }
  for (const signoff of manifest.signoffs) {
    signoff.status = "signed";
    signoff.signer = `${signoff.role}负责人`;
    signoff.signedAt = "2026-07-04T10:00:00+08:00";
    signoff.notes = "现场签字单已归档";
  }
  manifest.v1V2BoundaryConfirmed.status = "confirmed";
  manifest.v1V2BoundaryConfirmed.confirmedBy = "总负责人";
  manifest.v1V2BoundaryConfirmed.confirmedAt = "2026-07-04T10:00:00+08:00";
  return manifest;
}

function buildBlockedReleaseCandidate() {
  return {
    scope: "v1_release_candidate_check",
    status: "blocked",
    ready: false,
    summary: {
      label: "0/4 发布门禁通过",
      passedGateCount: 0,
      totalGateCount: 4,
      blockingCount: 52,
      envPreflight: "2/10 通过",
      fieldEvidence: "V1 现场证据清单仍阻塞：证据 0/40，签字 0/6",
      runtimeReadiness: "5/11 通过",
      fieldAcceptance: "5/11 通过",
    },
  };
}

function buildBlockedTaskBoard() {
  return {
    scope: "v1_onsite_task_board",
    status: "blocked",
    ready: false,
    summary: {
      label: "V1 现场仍有 52 个待处理任务",
      taskCount: 52,
      evidenceTaskCount: 40,
      signoffTaskCount: 6,
      boundaryTaskCount: 1,
    },
    roleBuckets: [{ role: "办公室", taskCount: 19, p0TaskCount: 19 }],
    tasks: [
      {
        id: "evidence.print_hardware.cups_lpstat_checked",
        type: "现场证据",
        roles: ["技术/管理", "办公室", "仓库/出库"],
        group: "打印硬件 / CUPS / 标签",
        title: "真实 CUPS 队列 non-printing 预检已通过",
        status: "pending",
        action: "完成真实现场验证，把状态改为 passed 或 accepted，并填写 evidenceRef。",
      },
    ],
  };
}

function buildBlockedCompletionSnapshot() {
  return {
    scope: "v1_completion_snapshot",
    status: "blocked",
    ready: false,
    summary: {
      label: "V1 完成度快照：BLOCKED",
      requirements: "85-90%",
      p0Prototype: "97-98%",
      v1Readiness: "76-79%",
      releaseGate: "0/4 发布门禁通过",
      runtimeReadiness: "5/11 通过",
      fieldEvidence: "V1 现场证据清单仍阻塞：证据 0/40，签字 0/6",
      fieldAcceptance: "5/11 通过",
      onsiteTaskCount: 52,
      v2DifferenceCount: 17,
    },
    blockerGroups: [
      { gate: "生产环境变量预检", count: 5 },
      { gate: "现场证据 manifest", count: 41 },
      { gate: "运行时 V1 readiness", count: 6 },
    ],
  };
}

function readGeneratedFile(path) {
  assert.ok(path, "generated file path is missing");
  return readFileSync(path, "utf8");
}

function assertNoSensitiveOutput(output) {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(output, pattern);
  }
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
