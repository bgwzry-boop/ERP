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
    commandRunner(command, args, options) {
      calls.push({ command, args, cwd: options.cwd });
      if (command === "git" && args[0] === "clone") mkdirSync(targetDir);
      if (command === "git" && args.at(-1) === "HEAD") return { status: 0, stdout: `${expectedCommit}\n` };
      return { status: 0, stdout: "{}\n" };
    },
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.summary.passedCount, 9);
  assert.equal(calls.length, 8);
  assert.deepEqual(ready.stages.map((item) => item.key), [
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
  assert.match(formatReport(ready), /9\/9/);
  assert.ok(calls.some((item) => item.command === "npm" && item.args.includes("--ignore-scripts")));
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
    }),
    /already exists/,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("V1 production remote recovery check passed.");
