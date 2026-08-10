#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildProductionEnvFileAuditReport } from "./run-v1-production-env-file-audit.mjs";

const defaultOutputDir = ".erp-local-storage/v1-production-remote-recovery";

if (isCliEntrypoint()) runCli();

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const envAudit = buildProductionEnvFileAuditReport({ envFiles: [options.envFile] });
    const report = buildProductionRemoteRecoveryReport({
      repositoryUrl: options.repositoryUrl,
      expectedCommit: options.expectedCommit,
      targetDir: options.targetDir,
      envFile: options.envFile,
      envAudit,
      timeoutMs: options.timeoutMs,
    });
    const output = options.write
      ? { ...report, artifacts: writeArtifacts(report, options.outputDir) }
      : report;
    process.stdout.write(options.json ? `${JSON.stringify(output, null, 2)}\n` : formatReport(output));
    process.exitCode = report.ready ? 0 : 2;
  } catch {
    process.stderr.write("V1 remote recovery check failed without exposing repository URL, env file, or target path.\n");
    process.exitCode = 1;
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = {
    repositoryUrl: "",
    expectedCommit: "",
    targetDir: "",
    envFile: "",
    outputDir: defaultOutputDir,
    timeoutMs: 15 * 60 * 1_000,
    write: true,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--repository-url") {
      options.repositoryUrl = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--expected-commit") {
      options.expectedCommit = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--target-dir") {
      options.targetDir = resolve(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--env-file") {
      options.envFile = resolve(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = resolve(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = positiveInteger(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--no-write") {
      options.write = false;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.repositoryUrl) throw new Error("--repository-url is required.");
  if (!/^[a-f0-9]{40}$/i.test(options.expectedCommit)) throw new Error("--expected-commit must be a full 40-character commit id.");
  if (!options.targetDir) throw new Error("--target-dir is required.");
  if (!options.envFile) throw new Error("--env-file is required.");
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-production-remote-recovery.mjs [options]",
    "",
    "Required:",
    "  --repository-url <url>       Controlled Git remote. Never written to reports.",
    "  --expected-commit <sha>      Full immutable 40-character release commit.",
    "  --target-dir <new-path>      Must not exist; this runner never deletes it.",
    "  --env-file <secure-path>     Audited production env file for runtime smoke.",
    "",
    "Optional:",
    "  --timeout-ms <n>             Per-command timeout. Defaults to 15 minutes.",
    "  --output-dir <path>          Redacted evidence directory.",
    "  --no-write                   Do not write evidence files.",
    "  --json                       Print JSON.",
    "",
    "Stages: env audit, clone, detached checkout, commit verification, npm ci, build, migration plan, deployment manifest, production runtime smoke.",
  ].join("\n");
}

export function buildProductionRemoteRecoveryReport(options = {}) {
  const expectedCommit = String(options.expectedCommit ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expectedCommit)) throw new Error("A full expected commit id is required.");
  const repositoryUrl = String(options.repositoryUrl ?? "").trim();
  if (!repositoryUrl) throw new Error("A controlled repository URL is required.");
  const targetDir = resolve(options.targetDir ?? "");
  const envFile = resolve(options.envFile ?? "");
  if (existsSync(targetDir)) throw new Error("Target recovery directory already exists; choose a new empty path.");
  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  const timeoutMs = positiveInteger(options.timeoutMs ?? 15 * 60 * 1_000, "timeoutMs");
  const envAudit = options.envAudit ?? { ready: false, summary: {} };
  const stages = [];
  let stopped = false;

  stages.push(stage("env-audit", "安全生产 env 文件审计", envAudit.ready === true));
  stopped = envAudit.ready !== true;

  const run = (key, label, command, args, commandOptions = {}) => {
    if (stopped) {
      stages.push(skippedStage(key, label));
      return null;
    }
    const result = commandRunner(command, args, {
      cwd: commandOptions.cwd,
      env: commandOptions.env,
      timeoutMs,
    });
    const passed = !result?.error && result?.status === 0;
    stages.push(stage(key, label, passed));
    if (!passed) stopped = true;
    return result;
  };

  if (!stopped) mkdirSync(dirname(targetDir), { recursive: true });
  run("clone", "全新目录 clone", "git", ["clone", "--no-checkout", repositoryUrl, targetDir]);
  run("checkout", "固定提交 detached checkout", "git", ["-C", targetDir, "checkout", "--detach", expectedCommit]);
  const commitResult = run("commit", "候选提交一致性", "git", ["-C", targetDir, "rev-parse", "HEAD"]);
  if (!stopped && String(commitResult?.stdout ?? "").trim().toLowerCase() !== expectedCommit) {
    stages[stages.length - 1] = stage("commit", "候选提交一致性", false);
    stopped = true;
  }
  run("install", "锁文件依赖安装", "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: targetDir });
  run("build", "生产前端构建", "npm", ["run", "build"], {
    cwd: targetDir,
    env: {
      ...process.env,
      VITE_ERP_RUNTIME_MODE: "production",
      VITE_ERP_API_BASE_URL: "/api",
      VITE_RAW_MATERIAL_FIRST_RELEASE: "true",
    },
  });
  run("migration-plan", "数据库迁移计划", process.execPath, ["scripts/run-db-migrations.mjs", "--dry-run"], {
    cwd: targetDir,
  });
  run(
    "deployment-manifest",
    "生产部署清单",
    process.execPath,
    ["scripts/run-v1-production-deployment-manifest.mjs", "--no-write", "--json"],
    { cwd: targetDir },
  );
  run(
    "runtime-smoke",
    "生产 API 启动与持久化 smoke",
    process.execPath,
    ["scripts/run-v1-production-runtime-smoke.mjs", "--env-file", envFile, "--no-write", "--json"],
    { cwd: targetDir },
  );

  const passedCount = stages.filter((item) => item.status === "passed").length;
  const blockingCount = stages.filter((item) => item.status === "blocked").length;
  const ready = stages.length === 9 && passedCount === stages.length;
  return {
    scope: "v1_production_remote_recovery",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: new Date().toISOString(),
    release: {
      expectedCommit: expectedCommit.slice(0, 12),
      repositoryUrlConfigured: true,
      targetWasNew: true,
      secureEnvAuditReady: envAudit.ready === true,
    },
    summary: {
      passedCount,
      totalCount: stages.length,
      blockingCount,
      skippedCount: stages.filter((item) => item.status === "not_run").length,
    },
    stages,
    nextAction: ready
      ? "由技术运维复核新目录报告和 systemd/nginx 配置，再按发布窗口切换 current 软链接。"
      : "从首个 blocked 阶段修复；保留失败目录供审计，不要自动删除或覆盖。",
    safeguards: {
      targetDirectoryReset: false,
      targetDirectoryDeleted: false,
      productionMigrationApplied: false,
      runtimeSmokeBusinessWrite: false,
      repositoryUrlExposed: false,
      targetPathExposed: false,
      envPathExposed: false,
      envValuesIncluded: false,
      commandOutputIncluded: false,
      secretValuesIncluded: false,
    },
  };
}

function defaultCommandRunner(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    timeout: options.timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
}

function stage(key, label, ready) {
  return { key, label, ready: ready === true, status: ready === true ? "passed" : "blocked" };
}

function skippedStage(key, label) {
  return { key, label, ready: false, status: "not_run" };
}

function writeArtifacts(report, outputDir) {
  const target = resolve(outputDir);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(join(target, "latest.md"), formatReport(report), "utf8");
  return { jsonWritten: true, markdownWritten: true, outputPathExposed: false };
}

export function formatReport(report) {
  return [
    "# V1 生产远端恢复检查",
    "",
    `- 状态：${report.status}`,
    `- 候选提交：${report.release.expectedCommit}`,
    `- 阶段通过：${report.summary.passedCount}/${report.summary.totalCount}`,
    `- 阻塞：${report.summary.blockingCount}`,
    `- 未执行：${report.summary.skippedCount}`,
    "",
    "## 阶段",
    "",
    ...report.stages.map((item) => `- ${item.label}：${item.status}`),
    "",
    `下一步：${report.nextAction}`,
    "",
  ].join("\n");
}
