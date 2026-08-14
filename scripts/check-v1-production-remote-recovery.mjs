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
  assert.equal(ready.summary.passedCount, 10);
  assert.equal(calls.length, 8);
  assert.deepEqual(ready.stages.map((item) => item.key), [
    "release-lock",
    "env-audit",
    "clone",
    "checkout",
    "commit",
    "install",
    "build",
    "migration-plan",
    "deployment-manifest",
    "runtime-smoke",
  ]);
  const serialized = JSON.stringify(ready);
  assert.doesNotMatch(serialized, /example\.invalid|fresh-clone|secure-production\.env/);
  assert.match(formatReport(ready), /10\/10/);
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
  assert.equal(failed.summary.skippedCount, 7);
  assert.doesNotMatch(JSON.stringify(failed), /secret-url|example\.invalid/);

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
