import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildV1FieldEvidenceManifestTemplate, serializeManifestJson } from "./v1FieldEvidenceManifest.mjs";

const taskBoardScript = join(process.cwd(), "scripts", "run-v1-onsite-task-board.mjs");
const tempRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-onsite-task-board");
const sourceRoot = join(tempRoot, "sources");
const outputRoot = join(tempRoot, "board");
const releaseJsonPath = join(sourceRoot, "release-candidate.json");
const fieldManifestPath = join(sourceRoot, "field-evidence.json");
const missingReleaseJsonPath = join(sourceRoot, "missing-release-candidate.json");
const sensitiveValues = [
  "postgres://admin:pass@prod-db.local:5432/erp",
  "AKIA_PROD_SECRET",
  "SUPER_SECRET_VALUE",
  "/var/spool/erp-secret",
  "/usr/bin/lpstat-secret",
  "张三真实签字",
];
const forbiddenPatterns = [
  /postgres:\/\/[^<\s]+:[^<\s]+@/i,
  /AKIA[0-9A-Z_]{8,}/,
  /SUPER_SECRET_VALUE/i,
  /pass@prod-db/i,
  /prod-db\.local/i,
  /\/var\/spool\/erp-secret/i,
  /\/usr\/bin\/lpstat-secret/i,
  /张三真实签字/,
];

rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(sourceRoot, { recursive: true });

writeFileSync(releaseJsonPath, `${JSON.stringify(buildBlockedReleaseCandidate(), null, 2)}\n`);
writeFileSync(fieldManifestPath, serializeManifestJson(buildSensitiveFieldEvidenceManifest()));

const run = await runNode([
  taskBoardScript,
  "--release-candidate-json",
  releaseJsonPath,
  "--field-evidence-manifest",
  fieldManifestPath,
  "--output-dir",
  outputRoot,
  "--json",
]);
assert.equal(run.status, 0, runFailureMessage("onsite task board should be generated for blocked V1", run));
const result = JSON.parse(run.stdout);
assert.equal(result.status, "blocked");
assert.equal(result.ready, false);
assert.equal(result.releaseCandidate.summary.label, "0/4 发布门禁通过");
assert.ok(result.summary.taskCount > 0, "task board should contain blocking tasks");
assert.ok(result.summary.releaseTaskCount > 0, "task board should include release-candidate blockers");
assert.ok(result.summary.evidenceTaskCount > 0, "task board should include evidence tasks");
assert.ok(result.summary.signoffTaskCount > 0, "task board should include signoff tasks");
assert.ok(result.summary.boundaryTaskCount > 0, "task board should include V1/V2 boundary tasks");
assert.ok(result.roleBuckets.some((bucket) => bucket.role === "技术/管理" && bucket.taskCount > 0));
assert.ok(result.roleBuckets.some((bucket) => bucket.role === "司机" && bucket.taskCount > 0));
assert.ok(result.roleBuckets.some((bucket) => bucket.role === "财务" && bucket.taskCount > 0));
assert.equal(result.safeguards.rawEvidenceRefsIncluded, false);
assert.equal(result.safeguards.rawSignersIncluded, false);
assert.ok(Array.isArray(result.files.roleMarkdownFiles), "role markdown files should be returned");
assert.ok(result.files.roleMarkdownFiles.length >= 3, "role markdown files should be generated for blocked roles");

const markdown = readGeneratedFile(result.files.markdown);
const json = readGeneratedFile(result.files.json);
const latestMarkdown = readGeneratedFile(result.files.latestMarkdown);
const roleFilesByRole = new Map(result.files.roleMarkdownFiles.map((file) => [file.role, file]));
const technicalRoleMarkdown = readGeneratedFile(roleFilesByRole.get("技术/管理")?.latestMarkdown);
const driverRoleMarkdown = readGeneratedFile(roleFilesByRole.get("司机")?.latestMarkdown);
const financeRoleMarkdown = readGeneratedFile(roleFilesByRole.get("财务")?.latestMarkdown);
assert.match(markdown, /ERP V1 现场任务清单/);
assert.match(markdown, /## 技术\/管理/);
assert.match(markdown, /## 司机/);
assert.match(markdown, /V2 计划差异/);
assert.match(markdown, /本清单不打印原始 evidenceRef/);
assert.match(technicalRoleMarkdown, /ERP V1 现场任务清单 - 技术\/管理/);
assert.match(technicalRoleMarkdown, /本角色待处理/);
assert.match(driverRoleMarkdown, /ERP V1 现场任务清单 - 司机/);
assert.match(driverRoleMarkdown, /完成任务后仍要回填现场证据 manifest/);
assert.match(financeRoleMarkdown, /ERP V1 现场任务清单 - 财务/);
assert.match(financeRoleMarkdown, /本清单是执行分工，不是上线批准/);
assert.match(json, /v1_onsite_task_board/);
assert.equal(markdown, latestMarkdown, "latest markdown should match generated markdown");
assertNoSensitiveOutput(run.stdout + run.stderr + markdown + json + technicalRoleMarkdown + driverRoleMarkdown + financeRoleMarkdown);

const missingRun = await runNode([
  taskBoardScript,
  "--release-candidate-json",
  missingReleaseJsonPath,
  "--field-evidence-manifest",
  fieldManifestPath,
  "--output-dir",
  join(tempRoot, "missing-board"),
  "--json",
]);
assert.equal(missingRun.status, 1, "missing release candidate should fail");
const missingResult = JSON.parse(missingRun.stdout);
assert.equal(missingResult.status, "error");
assert.match(missingResult.error.message, /release candidate JSON is missing/);
assertNoSensitiveOutput(missingRun.stdout + missingRun.stderr);

console.log("V1 onsite task board check passed: role grouping, release blockers, field evidence tasks, signoffs, boundary tasks, redaction, files, and missing release candidate handling are covered.");

function buildBlockedReleaseCandidate() {
  return {
    scope: "v1_release_candidate_check",
    status: "blocked",
    ready: false,
    generatedAt: "2026-07-04T10:00:00.000+08:00",
    conclusion: "当前仍不能声明 V1 已完成或可真实上线；必须先处理阻塞项。",
    summary: {
      label: "0/4 发布门禁通过",
      passedGateCount: 0,
      totalGateCount: 4,
      blockingCount: 4,
      envPreflight: "2/10 通过",
      fieldEvidence: "V1 现场证据清单仍阻塞：证据 0/34，签字 0/6",
      runtimeReadiness: "5/11 通过",
      fieldAcceptance: "5/11 通过",
    },
    blockingItems: [
      {
        gate: "生产环境变量预检",
        label: "统一 V1 持久化 profile",
        status: "pending",
        detail: "缺少或未启用 PostgreSQL / 对象存储配置。",
      },
      {
        gate: "运行时 V1 readiness",
        label: "司机真机门禁",
        status: "blocked",
        detail: "真实司机手机、原生扫码和导航证据未通过。",
      },
      {
        gate: "运行时 V1 readiness",
        label: "打印 V1 门禁",
        status: "blocked",
        detail: "真实 CUPS、标签机和针式机现场 QA 未通过。",
      },
      {
        gate: "现场证据 manifest",
        label: "生产持久化 / PostgreSQL 迁移已在生产库执行",
        status: "pending",
        detail: "required evidence item is not passed or accepted",
      },
    ],
    v1Scope: [
      "办公室六个核心页可用。",
      "V1 必须完成真实打印设备、真实 CUPS 队列、司机真机和现场 QA 证据。",
    ],
    v2Differences: ["企业微信自动发送、AI/OCR、路线优化和自动排产。"],
  };
}

function buildSensitiveFieldEvidenceManifest() {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  manifest.environment.apiBaseUrl = "https://erp.example.test/api";
  manifest.environment.productionEnvPreflightReport = sensitiveValues[0];
  manifest.evidenceGroups[0].items[0].status = "passed";
  manifest.evidenceGroups[0].items[0].evidenceRef = sensitiveValues[0];
  manifest.evidenceGroups[0].items[0].notes = `keep out of task board ${sensitiveValues[1]} ${sensitiveValues[2]}`;
  manifest.evidenceGroups[2].items[0].status = "blocked";
  manifest.evidenceGroups[2].items[0].evidenceRef = sensitiveValues[3];
  manifest.evidenceGroups[2].items[0].notes = sensitiveValues[4];
  manifest.signoffs[0].status = "signed";
  manifest.signoffs[0].signer = sensitiveValues[5];
  manifest.signoffs[0].signedAt = "";
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
      reject(new Error("V1 onsite task board check timed out after 10000ms"));
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

function readGeneratedFile(path) {
  const fullPath = join(process.cwd(), path);
  assert.ok(existsSync(fullPath), `generated file is missing: ${path}`);
  return readFileSync(fullPath, "utf8");
}

function runFailureMessage(message, result) {
  return `${message}; actual=${result.status}; stdout=${result.stdout || "<empty>"}; stderr=${result.stderr || "<empty>"}`;
}

function assertNoSensitiveOutput(output) {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(output, pattern, `output matched forbidden sensitive pattern ${pattern}`);
  }
}
