#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectControlledGitState,
  readControlledReleaseLock,
  verifyControlledReleaseLock,
} from "./controlled-release-lock-lib.mjs";

import { checkCandidateRelease } from "./release-line-lib.mjs";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const lock = readControlledReleaseLock(options.lock);
    let report = verifyControlledReleaseLock({
      lock,
      expectedCommit: options.expectedCommit,
      expectedTarget: options.expectedTarget,
      gitState: inspectControlledGitState(options.rootDir),
    });
    if (report.ready) {
      const line = await checkCandidateRelease({ rootDir: options.rootDir, candidateCommit: options.expectedCommit, candidateBranch: lock.branch, target: options.expectedTarget });
      report = { ...report, ready: line.ready, status: line.status, checks: [...report.checks, ...line.checks], summary: { passedCount: report.summary.passedCount + line.summary.passedCount, totalCount: report.summary.totalCount + line.summary.totalCount, blockingCount: line.summary.blockingCount } };
    }
    process.stdout.write(options.json ? `${JSON.stringify(report)}\n` : formatReport(report));
    process.exitCode = report.ready ? 0 : 2;
  } catch {
    process.stderr.write("Controlled release verification failed without exposing lock or repository paths.\n");
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  const options = { lock: "", expectedCommit: "", expectedTarget: "", rootDir: process.cwd(), json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--lock", "--expected-commit", "--expected-target", "--root-dir"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      const key = { "--lock": "lock", "--expected-commit": "expectedCommit", "--expected-target": "expectedTarget", "--root-dir": "rootDir" }[arg];
      options[key] = key === "lock" || key === "rootDir" ? resolve(value) : value;
      index += 1;
      continue;
    }
    if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write("Usage: node scripts/verify-controlled-release-lock.mjs --lock <path> --expected-target <target> --expected-commit <full-sha> [--root-dir <checkout>] [--json]\n");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.lock || !options.expectedCommit || !options.expectedTarget) throw new Error("Lock, target and commit are required.");
  return options;
}

function formatReport(report) {
  return [
    `Controlled release verification: ${report.status}`,
    `Passed: ${report.summary.passedCount}/${report.summary.totalCount}`,
    ...report.checks.map((item) => `- ${item.label}: ${item.status}`),
    "",
  ].join("\n");
}
