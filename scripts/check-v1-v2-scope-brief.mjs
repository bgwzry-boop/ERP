import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const briefScript = join(process.cwd(), "scripts", "run-v1-v2-scope-brief.mjs");
const tempRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-v2-scope-brief");
const sourceRoot = join(tempRoot, "sources");
const outputRoot = join(tempRoot, "brief");
const readyOutputRoot = join(tempRoot, "brief-ready");
const scopePath = join(sourceRoot, "v1-v2-scope.zh-CN.md");
const blockedSnapshotPath = join(sourceRoot, "blocked-snapshot.json");
const readySnapshotPath = join(sourceRoot, "ready-snapshot.json");
const missingScopePath = join(sourceRoot, "missing-scope.md");
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
writeFileSync(scopePath, buildScopeMarkdown());
writeFileSync(blockedSnapshotPath, `${JSON.stringify(buildSnapshot({ ready: false }), null, 2)}\n`);
writeFileSync(readySnapshotPath, `${JSON.stringify(buildSnapshot({ ready: true }), null, 2)}\n`);

const blockedRun = await runNode([
  briefScript,
  "--v1-v2-scope",
  scopePath,
  "--completion-snapshot-json",
  blockedSnapshotPath,
  "--output-dir",
  outputRoot,
  "--json",
]);
assert.equal(blockedRun.status, 0, runFailureMessage("blocked V1/V2 brief should succeed", blockedRun));
const blockedResult = JSON.parse(blockedRun.stdout);
assert.equal(blockedResult.scope, "v1_v2_scope_brief");
assert.equal(blockedResult.status, "blocked_scope_brief_written");
assert.equal(blockedResult.ready, false);
assert.equal(blockedResult.canDeclareV1Complete, false);
assert.equal(blockedResult.summary.moduleDifferenceCount, 6);
assert.ok(blockedResult.summary.v2DifferenceCount >= 6);
assert.ok(blockedResult.summary.v1MustContinueCount >= 3);
assert.ok(blockedResult.v2Categories.includes("企微 / 客户自动化"));
assert.ok(blockedResult.v2Categories.includes("AI / OCR / 图片识别"));
assert.ok(blockedResult.v2Categories.includes("路线 / 排产优化"));
assert.ok(blockedResult.v2Categories.includes("原材料 / 成本毛利"));
assert.ok(blockedResult.v2Categories.includes("售后 / 责任 / 工资"));
assert.ok(blockedResult.files.latestMarkdown);
assert.ok(blockedResult.files.latestJson);
const blockedMarkdown = readGeneratedFile(blockedResult.files.latestMarkdown);
const blockedJson = JSON.parse(readGeneratedFile(blockedResult.files.latestJson));
assert.match(blockedMarkdown, /ERP V1 \/ V2 差异摘要/);
assert.match(blockedMarkdown, /当前结论：BLOCKED/);
assert.match(blockedMarkdown, /V1 必须继续补/);
assert.match(blockedMarkdown, /V2 计划差异/);
assert.match(blockedMarkdown, /不得把生产配置、真实设备、现场证据或签字后移到 V2/);
assert.equal(blockedJson.status, "blocked_scope_brief_written");
assertNoSensitiveOutput(blockedRun.stdout + blockedRun.stderr + blockedMarkdown + JSON.stringify(blockedJson));

const readyRun = await runNode([
  briefScript,
  "--v1-v2-scope",
  scopePath,
  "--completion-snapshot-json",
  readySnapshotPath,
  "--output-dir",
  readyOutputRoot,
  "--json",
]);
assert.equal(readyRun.status, 0, runFailureMessage("ready V1/V2 brief should succeed", readyRun));
const readyResult = JSON.parse(readyRun.stdout);
assert.equal(readyResult.status, "ready_scope_brief_written");
assert.equal(readyResult.ready, true);
assert.equal(readyResult.canDeclareV1Complete, true);
assert.equal(readyResult.summary.releaseGate, "4/4 发布门禁通过");
const readyMarkdown = readGeneratedFile(readyResult.files.latestMarkdown);
assert.match(readyMarkdown, /当前结论：READY/);
assert.match(readyMarkdown, /负责人最终复核/);
assertNoSensitiveOutput(readyRun.stdout + readyRun.stderr + readyMarkdown);

const textRun = await runNode([
  briefScript,
  "--v1-v2-scope",
  scopePath,
  "--completion-snapshot-json",
  blockedSnapshotPath,
  "--output-dir",
  join(tempRoot, "brief-text"),
]);
assert.equal(textRun.status, 0, runFailureMessage("text V1/V2 brief should succeed", textRun));
assert.match(textRun.stdout, /V1\/V2 scope brief: BLOCKED/);
assert.match(textRun.stdout, /Markdown:/);
assertNoSensitiveOutput(textRun.stdout + textRun.stderr);

const missingRun = await runNode([
  briefScript,
  "--v1-v2-scope",
  missingScopePath,
  "--output-dir",
  join(tempRoot, "missing"),
  "--json",
]);
assert.equal(missingRun.status, 1, "missing scope markdown should fail");
const missingResult = JSON.parse(missingRun.stdout);
assert.equal(missingResult.scope, "v1_v2_scope_brief");
assert.equal(missingResult.status, "error");
assert.match(missingResult.error.message, /V1\/V2 scope Markdown is missing/);
assertNoSensitiveOutput(missingRun.stdout + missingRun.stderr);

console.log("V1/V2 scope brief check passed: blocked, ready, text output, missing source, categories, files, and redaction are covered.");

function buildScopeMarkdown() {
  return [
    "# V1 / V2 范围差异",
    "",
    "## 版本口径",
    "",
    "| 版本 | 目标 | 不做什么 |",
    "| --- | --- | --- |",
    "| V1 | 核心 ERP 闭环、人工确认、真实设备和现场验收。 | 不做企业微信自动化、AI/OCR、完整成本工资。 |",
    "| V2 | 稳定后做自动化、优化算法和经营分析。 | 不替代 V1 的人工确认和审计。 |",
    "",
    "## 模块差异",
    "",
    "| 模块 | V1 范围 | V2 范围 |",
    "| --- | --- | --- |",
    "| 订单录入 | 人工粘贴识别和规则解析。 | AI / OCR 自动识别客户原文和图片订单。 |",
    "| 企微 / 客户群 | 人工复制、人工发送、人工确认。 | 企业微信自动发送、会话存档、自动回复辅助。 |",
    "| 生产 / 排产 | 人工排产、手工调序、移动原因和影响预览。 | 路线 / 排产优化、自动插单、产能预测。 |",
    "| 原材料 / 成本 | 只做必要字段和接口预留。 | 原材料批次、领料扫码、成本分摊、订单毛利。 |",
    "| 售后 / 工资 | 记录关键异常线索，不自动扣款。 | 售后责任、绩效扣款、考勤导入和工资草稿。 |",
    "| BI 报表 | 基础经营数据留档。 | BI 分析、客户画像和预测。 |",
    "",
    "## V1 当前必须继续补的能力",
    "",
    "1. 生产级持久化：必须完成真实 PostgreSQL 和对象存储，不得后移到 V2。",
    "2. 真实打印：必须完成标签机、针式机、CUPS、纸张对位和扫码验收。",
    "3. 司机真机：必须完成 Android / iOS 原生壳、扫码、导航、权限和现场 QA。",
    "",
  ].join("\n");
}

function buildSnapshot({ ready }) {
  return {
    scope: "v1_completion_snapshot",
    status: ready ? "ready" : "blocked",
    ready,
    summary: {
      p0Prototype: "97-98%",
      v1Readiness: ready ? "100%" : "76-79%",
      releaseGate: ready ? "4/4 发布门禁通过" : "0/4 发布门禁通过",
      fieldEvidence: ready ? "V1 现场证据清单已通过" : "V1 现场证据清单仍阻塞：证据 0/34，签字 0/6",
    },
    completion: {
      p0Prototype: "97-98%",
      v1Readiness: ready ? "100%" : "76-79%",
      releaseGate: ready ? "4/4 发布门禁通过" : "0/4 发布门禁通过",
      fieldEvidence: ready ? "V1 现场证据清单已通过" : "V1 现场证据清单仍阻塞：证据 0/34，签字 0/6",
    },
    v2Differences: ["企业微信自动发送。", "AI / OCR 识别图片订单。"],
    v1MustContinue: ["真实生产配置和现场证据必须在 V1 完成。"],
  };
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
      reject(new Error("V1/V2 scope brief check timed out after 10000ms"));
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
