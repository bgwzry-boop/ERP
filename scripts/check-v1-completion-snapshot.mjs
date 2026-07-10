import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const snapshotScript = join(process.cwd(), "scripts", "run-v1-completion-snapshot.mjs");
const tempRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-completion-snapshot");
const sourceRoot = join(tempRoot, "sources");
const outputRoot = join(tempRoot, "snapshot");
const releaseJsonPath = join(sourceRoot, "release-candidate.json");
const taskBoardJsonPath = join(sourceRoot, "onsite-task-board.json");
const moduleCompletionPath = join(sourceRoot, "module-completion-status.zh-CN.md");
const v1V2ScopePath = join(sourceRoot, "v1-v2-scope.zh-CN.md");
const missingReleaseJsonPath = join(sourceRoot, "missing-release-candidate.json");
const forbiddenPatterns = [
  /postgres:\/\/[^<\s]+:[^<\s]+@/i,
  /AKIA[0-9A-Z_]{8,}/,
  /SUPER_SECRET_VALUE/i,
  /pass@prod-db/i,
  /prod-db\.local/i,
  /\/var\/spool\/erp-secret/i,
  /\/usr\/bin\/lpstat-secret/i,
];

rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(sourceRoot, { recursive: true });

writeFileSync(releaseJsonPath, `${JSON.stringify(buildBlockedReleaseCandidate(), null, 2)}\n`);
writeFileSync(taskBoardJsonPath, `${JSON.stringify(buildBlockedTaskBoard(), null, 2)}\n`);
writeFileSync(moduleCompletionPath, moduleCompletionFixture());
writeFileSync(v1V2ScopePath, v1V2ScopeFixture());

const run = await runNode([
  snapshotScript,
  "--release-candidate-json",
  releaseJsonPath,
  "--onsite-task-board-json",
  taskBoardJsonPath,
  "--module-completion",
  moduleCompletionPath,
  "--v1-v2-scope",
  v1V2ScopePath,
  "--output-dir",
  outputRoot,
  "--json",
]);
assert.equal(run.status, 0, runFailureMessage("completion snapshot should be generated for blocked V1", run));
const result = JSON.parse(run.stdout);
assert.equal(result.status, "blocked");
assert.equal(result.ready, false);
assert.equal(result.summary.p0Prototype, "97-98%");
assert.equal(result.summary.v1Readiness, "76-79%");
assert.equal(result.summary.releaseGate, "0/4 发布门禁通过");
assert.equal(result.summary.onsiteTaskCount, 52);
assert.ok(result.completionProof.some((item) => item.item === "V1 完成声明" && item.status === "blocked"));
assert.ok(result.blockerGroups.some((group) => group.gate === "生产环境变量预检" && group.count === 1));
assert.ok(result.onsiteTaskBoard.roleBuckets.some((bucket) => bucket.role === "司机" && bucket.taskCount === 8));
assert.equal(result.moduleCompletion.length, 3);
assert.ok(
  result.moduleCompletion.some(
    (module) => module.module === "打印设备 / 打印作业" && module.v1Readiness === "53%",
  ),
);
assert.ok(result.v2Differences.some((item) => item.includes("企业微信")));
assert.equal(result.safeguards.rawEvidenceRefsIncluded, false);
assert.equal(result.safeguards.rawSecretsIncluded, false);

const markdown = readGeneratedFile(result.files.markdown);
const json = readGeneratedFile(result.files.json);
const latestMarkdown = readGeneratedFile(result.files.latestMarkdown);
assert.match(markdown, /ERP V1 完成度快照/);
assert.match(markdown, /P0 原型 \/ 代码完成度：97-98%/);
assert.match(markdown, /V1 真实上线就绪度：76-79%/);
assert.match(markdown, /打印设备 \/ 打印作业/);
assert.match(markdown, /真实标签机 \/ 针式机硬件出纸/);
assert.match(markdown, /V2 计划差异/);
assert.match(markdown, /企业微信/);
assert.match(markdown, /现场任务：52 个/);
assert.match(json, /v1_completion_snapshot/);
assert.equal(markdown, latestMarkdown, "latest markdown should match generated markdown");
assertNoSensitiveOutput(run.stdout + run.stderr + markdown + json);

const missingRun = await runNode([
  snapshotScript,
  "--release-candidate-json",
  missingReleaseJsonPath,
  "--module-completion",
  moduleCompletionPath,
  "--v1-v2-scope",
  v1V2ScopePath,
  "--output-dir",
  join(tempRoot, "missing-snapshot"),
  "--json",
]);
assert.equal(missingRun.status, 1, "missing release candidate should fail");
const missingResult = JSON.parse(missingRun.stdout);
assert.equal(missingResult.status, "error");
assert.match(missingResult.error.message, /release candidate JSON is missing/);
assertNoSensitiveOutput(missingRun.stdout + missingRun.stderr);

console.log("V1 completion snapshot check passed: completion percentages, release gates, onsite roles, V2 differences, files, redaction, and missing release-candidate handling are covered.");

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
      blockingCount: 3,
      envPreflight: "2/10 通过",
      fieldEvidence: "V1 现场证据清单仍阻塞：证据 0/34，签字 0/6",
      runtimeReadiness: "5/11 通过",
      fieldAcceptance: "5/11 通过",
    },
    gates: [
      {
        key: "production_env_preflight",
        label: "生产环境变量预检",
        status: "blocked",
        ready: false,
        summary: "2/10 通过",
        detail: "缺少 PostgreSQL / 对象存储 / 打印命令桥。",
      },
      {
        key: "field_evidence_manifest",
        label: "现场证据 manifest",
        status: "blocked",
        ready: false,
        summary: "V1 现场证据清单仍阻塞：证据 0/34，签字 0/6",
        detail: "现场证据 manifest 仍未填满。",
      },
    ],
    blockingItems: [
      {
        gate: "生产环境变量预检",
        key: "v1-persistence-profile",
        label: "统一 V1 持久化 profile",
        status: "pending",
        detail:
          "缺少 postgres://admin:pass@prod-db.local:5432/erp AKIA_PROD_SECRET SUPER_SECRET_VALUE /var/spool/erp-secret /usr/bin/lpstat-secret",
      },
      {
        gate: "现场证据 manifest",
        key: "postgres_migration_applied",
        label: "生产持久化 / PostgreSQL 迁移已在生产库执行",
        status: "pending",
        detail: "required evidence item is not passed or accepted",
      },
    ],
    fieldEvidenceManifest: {
      ready: false,
    },
    v1Scope: ["办公室六个核心页可用。"],
    v2Differences: ["企业微信自动发送、AI/OCR、路线优化和自动排产。"],
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
    },
    roleBuckets: [
      { role: "技术/管理", taskCount: 34, p0TaskCount: 34 },
      { role: "办公室", taskCount: 19, p0TaskCount: 19 },
      { role: "司机", taskCount: 8, p0TaskCount: 8 },
    ],
  };
}

function moduleCompletionFixture() {
  return [
    "# ERP 模块完成度统计",
    "",
    "## 总体完成度",
    "",
    "| 口径 | 完成度 | 说明 |",
    "| --- | ---: | --- |",
    "| 需求确认度 | 85-90% | 主流程已定。 |",
    "| P0 可演示原型 | 97-98% | 原型可演示。 |",
    "| V1 真实上线就绪 | 76-79% | 真实现场仍 blocked。 |",
    "",
    "## 分模块完成度",
    "",
    "| 模块 | 需求确认度 | P0 原型 / 代码完成度 | V1 上线就绪度 | 当前状态 | 主要未完成项 |",
    "| --- | ---: | ---: | ---: | --- | --- |",
    "| 公共待办 | 98% | 91% | 62% | 已可用。 | 真实多账号并发。 |",
    "| 打印设备 / 打印作业 | 95% | 89% | 53% | 门禁已有。 | 真实标签机 / 针式机硬件出纸。 |",
    "| 司机端送货 | 97% | 79% | 42% | 真机门禁已有。 | 真实 Android / iOS 原生壳。 |",
    "",
  ].join("\n");
}

function v1V2ScopeFixture() {
  return [
    "# V1 / V2 范围差异",
    "",
    "## 版本口径",
    "",
    "| 版本 | 目标 | 不做什么 |",
    "| --- | --- | --- |",
    "| V1 | 单工厂核心 ERP 闭环可用。 | 不做自动客户群。 |",
    "| V2 | 自动化识别和优化。 | 不替代人工确认。 |",
    "",
    "## 模块差异",
    "",
    "| 模块 | V1 范围 | V2 范围 |",
    "| --- | --- | --- |",
    "| 订单录入 | 人工粘贴识别。 | 客户群 / 图片 / OCR / AI 自动识别。 |",
    "| 企微 / 自动化 | V1 人工复制、人工发送、人工确认。 | 企业微信会话存档、自动回复辅助和风控。 |",
    "",
    "## V1 当前必须继续补的能力",
    "",
    "1. 生产级持久化：真实 PostgreSQL / 对象存储。",
    "2. 真实打印：标签机、针式机、CUPS。",
    "",
  ].join("\n");
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
      reject(new Error("V1 completion snapshot check timed out after 10000ms"));
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
