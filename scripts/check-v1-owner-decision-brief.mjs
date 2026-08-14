import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const briefScript = join(process.cwd(), "scripts", "run-v1-owner-decision-brief.mjs");
const tempRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-owner-decision-brief");
const sourceRoot = join(tempRoot, "sources");
const outputRoot = join(tempRoot, "brief-blocked");
const readyOutputRoot = join(tempRoot, "brief-ready");
const blockedSnapshotPath = join(sourceRoot, "completion-snapshot-blocked.json");
const readySnapshotPath = join(sourceRoot, "completion-snapshot-ready.json");
const missingSnapshotPath = join(sourceRoot, "missing-completion-snapshot.json");
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
writeFileSync(blockedSnapshotPath, `${JSON.stringify(buildBlockedCompletionSnapshot(), null, 2)}\n`);
writeFileSync(readySnapshotPath, `${JSON.stringify(buildReadyCompletionSnapshot(), null, 2)}\n`);

const blockedRun = await runNode([
  briefScript,
  "--completion-snapshot-json",
  blockedSnapshotPath,
  "--output-dir",
  outputRoot,
  "--json",
]);
assert.equal(blockedRun.status, 0, runFailureMessage("blocked owner decision brief should be generated", blockedRun));
const blockedResult = JSON.parse(blockedRun.stdout);
assert.equal(blockedResult.status, "blocked_owner_brief_written");
assert.equal(blockedResult.ready, false);
assert.equal(blockedResult.canDeclareV1Complete, false);
assert.equal(blockedResult.completion.p0Prototype, "97-98%");
assert.equal(blockedResult.completion.v1Readiness, "76-79%");
assert.equal(blockedResult.blockerGroups.length, 3);
assert.ok(blockedResult.unfinishedItems.some((item) => item.label === "V1 完成声明"));
assert.ok(blockedResult.doneHighlights.some((item) => item.includes("V1/V2 差异已整理")));
assert.equal(blockedResult.v2DifferenceCount, 2);
assert.ok(blockedResult.files.markdown);
assert.ok(blockedResult.files.latestMarkdown);

const blockedMarkdown = readGeneratedFile(blockedResult.files.markdown);
const blockedJson = readGeneratedFile(blockedResult.files.json);
assert.match(blockedMarkdown, /ERP V1 负责人决策摘要/);
assert.match(blockedMarkdown, /是否可以宣布 V1 完成：不可以/);
assert.match(blockedMarkdown, /P0 原型 \/ 代码/);
assert.match(blockedMarkdown, /V2 计划差异/);
assert.match(blockedMarkdown, /生产环境变量预检/);
assert.match(blockedJson, /v1_owner_decision_brief/);
assertNoSensitiveOutput(blockedRun.stdout + blockedRun.stderr + blockedMarkdown + blockedJson);

const readyRun = await runNode([
  briefScript,
  "--completion-snapshot-json",
  readySnapshotPath,
  "--output-dir",
  readyOutputRoot,
  "--json",
]);
assert.equal(readyRun.status, 0, runFailureMessage("ready owner decision brief should be generated", readyRun));
const readyResult = JSON.parse(readyRun.stdout);
assert.equal(readyResult.status, "ready_for_owner_review");
assert.equal(readyResult.ready, true);
assert.equal(readyResult.canDeclareV1Complete, true);
assert.equal(readyResult.unfinishedItems.length, 0);
const readyMarkdown = readGeneratedFile(readyResult.files.markdown);
assert.match(readyMarkdown, /是否可以宣布 V1 完成：可以/);
assert.match(readyMarkdown, /负责人最终确认/);
assertNoSensitiveOutput(readyRun.stdout + readyRun.stderr + readyMarkdown);

const missingRun = await runNode([
  briefScript,
  "--completion-snapshot-json",
  missingSnapshotPath,
  "--output-dir",
  join(tempRoot, "missing-brief"),
  "--json",
]);
assert.equal(missingRun.status, 1, "missing completion snapshot should fail");
const missingResult = JSON.parse(missingRun.stdout);
assert.equal(missingResult.status, "error");
assert.match(missingResult.error.message, /completion snapshot JSON is missing/);
assertNoSensitiveOutput(missingRun.stdout + missingRun.stderr);

console.log(
  "V1 owner decision brief check passed: blocked and ready summaries, files, missing snapshot handling, V2 differences, and redaction are covered.",
);

function buildBlockedCompletionSnapshot() {
  return {
    scope: "v1_completion_snapshot",
    status: "blocked",
    ready: false,
    generatedAt: "2026-07-04T11:00:00.000+08:00",
    conclusion:
      "当前不能声明 V1 已完成；代码侧能力已接近收口，但真实生产配置、现场证据、设备 / 真机验收和签字仍未完成。",
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
    },
    completion: {
      requirements: "85-90%",
      p0Prototype: "97-98%",
      v1Readiness: "76-79%",
      releaseGate: "0/4 发布门禁通过",
      runtimeReadiness: "5/11 通过",
      fieldEvidence: "V1 现场证据清单仍阻塞：证据 0/40，签字 0/6",
      fieldAcceptance: "5/11 通过",
      onsiteTaskCount: 52,
    },
    completionProof: [
      { item: "发布候选 4/4 门禁", status: "blocked", evidence: "0/4 发布门禁通过" },
      { item: "现场任务清零", status: "blocked", evidence: "V1 现场仍有 52 个待处理任务" },
      { item: "现场证据和签字", status: "blocked", evidence: "证据 0/40，签字 0/6" },
      { item: "V1 完成声明", status: "blocked", evidence: "至少一个发布或现场验收门禁仍未通过。" },
    ],
    releaseCandidate: {
      gates: [
        {
          label: "生产环境变量预检",
          ready: false,
          summary: "2/10 通过",
          detail:
            "缺少 postgres://admin:pass@prod-db.local:5432/erp AKIA_PROD_SECRET SUPER_SECRET_VALUE /var/spool/erp-secret /usr/bin/lpstat-secret",
        },
        {
          label: "现场证据 manifest",
          ready: false,
          summary: "0/40 证据 / 0/6 签字",
          detail: "现场证据 manifest 仍未填满。",
        },
      ],
    },
    blockerGroups: [
      { gate: "生产环境变量预检", count: 5 },
      { gate: "现场证据 manifest", count: 41 },
      { gate: "运行时 V1 readiness", count: 6 },
    ],
    topBlockers: [
      {
        gate: "生产环境变量预检",
        label: "统一 V1 持久化 profile",
        status: "pending",
        detail:
          "缺少 postgres://admin:pass@prod-db.local:5432/erp AKIA_PROD_SECRET SUPER_SECRET_VALUE /var/spool/erp-secret /usr/bin/lpstat-secret",
      },
    ],
    nextActions: [
      "生产环境变量预检：生产环境变量仍有 5 项阻塞。",
      "现场证据 manifest：现场证据 manifest 仍未填满。",
    ],
    v2Differences: ["客户群 / 企业微信自动发送。", "AI / OCR 识别客户原文、图片订单。"],
  };
}

function buildReadyCompletionSnapshot() {
  return {
    scope: "v1_completion_snapshot",
    status: "ready",
    ready: true,
    generatedAt: "2026-07-04T11:10:00.000+08:00",
    conclusion: "当前 V1 发布候选和现场任务均为 READY；可进入负责人最终复核。",
    summary: {
      label: "V1 完成度快照：READY",
      requirements: "90%",
      p0Prototype: "100%",
      v1Readiness: "100%",
      releaseGate: "4/4 发布门禁通过",
      runtimeReadiness: "11/11 通过",
      fieldEvidence: "证据 40/40，签字 6/6",
      fieldAcceptance: "11/11 通过",
      onsiteTaskCount: 0,
    },
    completion: {
      requirements: "90%",
      p0Prototype: "100%",
      v1Readiness: "100%",
      releaseGate: "4/4 发布门禁通过",
      runtimeReadiness: "11/11 通过",
      fieldEvidence: "证据 40/40，签字 6/6",
      fieldAcceptance: "11/11 通过",
      onsiteTaskCount: 0,
    },
    completionProof: [
      { item: "发布候选 4/4 门禁", status: "passed", evidence: "4/4 发布门禁通过" },
      { item: "现场任务清零", status: "passed", evidence: "V1 现场仍有 0 个待处理任务" },
      { item: "现场证据和签字", status: "passed", evidence: "证据 40/40，签字 6/6" },
      { item: "V1 完成声明", status: "passed", evidence: "发布候选与现场任务均为 ready。" },
    ],
    releaseCandidate: {
      gates: [
        { label: "生产环境变量预检", ready: true, summary: "10/10 通过", detail: "已通过。" },
        { label: "现场证据 manifest", ready: true, summary: "40/40 证据 / 6/6 签字", detail: "已通过。" },
      ],
    },
    blockerGroups: [],
    topBlockers: [],
    nextActions: [],
    v2Differences: ["自动排产和路线优化进入 V2。"],
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
      reject(new Error("V1 owner decision brief check timed out after 10000ms"));
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
