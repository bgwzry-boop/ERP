#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildProductionRemoteRecoveryReport, formatReport } from "./run-v1-production-remote-recovery.mjs";

const root = mkdtempSync(join(tmpdir(), "erp-remote-recovery-check-"));
const expectedCommit = "1234567890abcdef1234567890abcdef12345678";
try {
  const targetDir = join(root, "fresh-clone");
  const calls = [];
  const ready = buildProductionRemoteRecoveryReport({
    repositoryUrl: "ssh://git@example.invalid/factory/erp.git",
    expectedCommit,
    targetDir,
    envFile: join(root, "secure-production.env"),
    envAudit: { ready: true, summary: { blockingCount: 0 } },
    candidateBranch: "codex/production-candidate",
    releaseLockVerification: {
      ready: true,
      release: {
        target: "tencent-production",
        commit: expectedCommit,
        version: "prod-2026.08.09-r1",
        digest: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
    },
    commandRunner(command, args, options) {
      calls.push({
        command,
        args,
        cwd: options.cwd,
        buildEnv: options.env ? {
          runtimeMode: options.env.VITE_ERP_RUNTIME_MODE,
          apiBaseUrl: options.env.VITE_ERP_API_BASE_URL,
          firstRelease: options.env.VITE_RAW_MATERIAL_FIRST_RELEASE,
          releaseTarget: options.env.VITE_ERP_RELEASE_TARGET,
          releaseCommit: options.env.VITE_ERP_RELEASE_COMMIT,
        } : null,
      });
      if (command === "git" && args[0] === "clone") mkdirSync(targetDir);
      if (command === "git" && args.at(-1) === "HEAD") return { status: 0, stdout: `${expectedCommit}\n` };
      return { status: 0, stdout: "{}\n" };
    },
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.summary.passedCount, 11);
  assert.equal(calls.length, 9);
  assert.deepEqual(ready.stages.map((item) => item.key), [
    "release-lock",
    "env-audit",
    "clone",
    "checkout",
    "commit",
    "release-line",
    "install",
    "build",
    "migration-plan",
    "deployment-manifest",
    "runtime-smoke",
  ]);
  const serialized = JSON.stringify(ready);
  assert.doesNotMatch(serialized, /example\.invalid|fresh-clone|secure-production\.env/);
  assert.match(formatReport(ready), /11\/11/);
  assert.deepEqual(calls.find((item) => item.args[0] === "scripts/check-release-line.mjs")?.args, [
    "scripts/check-release-line.mjs", "--scope", "repository", "--candidate", expectedCommit,
    "--candidate-branch", "codex/production-candidate", "--target", "tencent-production",
  ]);
  assert.ok(calls.some((item) => item.command === "npm" && item.args.includes("--ignore-scripts")));
  assert.deepEqual(
    calls.find((item) => item.command === "npm" && item.args.join(" ") === "run build")?.buildEnv,
    {
      runtimeMode: "production",
      apiBaseUrl: "/api",
      firstRelease: "true",
      releaseTarget: "tencent-production",
      releaseCommit: expectedCommit,
    },
  );
  assert.ok(calls.some((item) => item.args.includes("--dry-run")));
  assert.ok(
    calls.some((item) => item.args.some((arg) => arg.endsWith("run-v1-production-runtime-smoke.mjs"))),
  );

  const failedTarget = join(root, "failed-clone");
  const failed = buildProductionRemoteRecoveryReport({
    repositoryUrl: "ssh://git@example.invalid/factory/erp.git",
    expectedCommit,
    targetDir: failedTarget,
    envFile: join(root, "secure-production.env"),
    envAudit: { ready: true },
    candidateBranch: "codex/production-candidate",
    releaseLockVerification: {
      ready: true,
      release: { target: "tencent-production", commit: expectedCommit },
    },
    commandRunner(command, args) {
      if (command === "git" && args[0] === "clone") return { status: 128, stdout: "", stderr: "secret-url" };
      throw new Error("No command may run after clone failure.");
    },
  });
  assert.equal(failed.ready, false);
  assert.equal(failed.stages.find((item) => item.key === "clone")?.status, "blocked");
  assert.equal(failed.summary.skippedCount, 8);
  assert.doesNotMatch(JSON.stringify(failed), /secret-url|example\.invalid/);

  const gateCalls = [];
  const blockedLine = buildProductionRemoteRecoveryReport({
    repositoryUrl: "ssh://git@example.invalid/factory/erp.git",
    expectedCommit,
    targetDir: join(root, "blocked-line"),
    envFile: join(root, "secure-production.env"),
    envAudit: { ready: true },
    candidateBranch: "codex/production-candidate",
    releaseLockVerification: {
      ready: true,
      release: { target: "tencent-production", commit: expectedCommit },
    },
    commandRunner(command, args) {
      gateCalls.push({ command, args });
      if (args[0] === "scripts/check-release-line.mjs") return { status: 2, stderr: "private-response" };
      return { status: 0, stdout: args.at(-1) === "HEAD" ? `${expectedCommit}\n` : "" };
    },
  });
  assert.equal(blockedLine.ready, false);
  assert.equal(blockedLine.stages.find((item) => item.key === "release-line")?.status, "blocked");
  assert.equal(blockedLine.summary.skippedCount, 5);
  assert.equal(gateCalls.some((item) => item.command === "npm"), false, "a mismatched release line must block dependency installation and build");
  assert.doesNotMatch(JSON.stringify(blockedLine), /private-response|example\.invalid/);

  const missingBranch = buildProductionRemoteRecoveryReport({
    repositoryUrl: "ssh://git@example.invalid/factory/erp.git",
    expectedCommit,
    targetDir: join(root, "missing-branch"),
    envFile: join(root, "secure-production.env"),
    envAudit: { ready: true },
    releaseLockVerification: {
      ready: true,
      release: { target: "tencent-production", commit: expectedCommit },
    },
    commandRunner() { throw new Error("A missing locked candidate branch must stop before clone."); },
  });
  assert.equal(missingBranch.ready, false);
  assert.equal(missingBranch.stages[0].status, "blocked");

  assert.throws(
    () => buildProductionRemoteRecoveryReport({
      repositoryUrl: "ssh://git@example.invalid/factory/erp.git",
      expectedCommit,
      targetDir,
      envFile: join(root, "secure-production.env"),
      envAudit: { ready: true },
      releaseLockVerification: {
        ready: true,
        release: { target: "tencent-production", commit: expectedCommit },
      },
    }),
    /already exists/,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("V1 production remote recovery check passed.");
