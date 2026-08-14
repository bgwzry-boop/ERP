#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildControlledReleaseLockReport,
  inspectControlledGitState,
} from "./controlled-release-lock-lib.mjs";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = buildControlledReleaseLockReport({
      expectedCommit: options.expectedCommit,
      target: options.target,
      version: options.version,
      gitState: inspectControlledGitState(options.rootDir),
    });
    if (report.ready && options.write) {
      mkdirSync(dirname(options.output), { recursive: true });
      writeFileSync(options.output, `${JSON.stringify(report.lock, null, 2)}\n`, "utf8");
    }
    process.stdout.write(options.json ? `${JSON.stringify(redactReport(report))}\n` : formatReport(report, options.write));
    process.exitCode = report.ready ? 0 : 2;
  } catch {
    process.stderr.write("Controlled release lock failed without exposing repository paths.\n");
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  const options = {
    rootDir: process.cwd(),
    target: "",
    expectedCommit: "",
    version: "",
    output: resolve(".erp-local-storage/releases/latest.lock.json"),
    write: true,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--root-dir", "--target", "--expected-commit", "--version", "--output"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      const key = { "--root-dir": "rootDir", "--target": "target", "--expected-commit": "expectedCommit", "--version": "version", "--output": "output" }[arg];
      options[key] = key === "rootDir" || key === "output" ? resolve(value) : value;
      index += 1;
      continue;
    }
    if (arg === "--no-write") options.write = false;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.target || !options.expectedCommit) throw new Error("--target and --expected-commit are required.");
  return options;
}

function helpText() {
  return [
    "Usage: node scripts/run-controlled-release-lock.mjs --target <target> --expected-commit <full-sha> [options]",
    "",
    "Targets: review-site, staging, tencent-production",
    "The command blocks dirty, unpushed, detached, mismatched, or untracked releases.",
  ].join("\n");
}

function redactReport(report) {
  return { ...report, lock: report.lock ? { ...report.lock, branch: "configured", upstream: "configured" } : null };
}

export function formatReport(report, wroteLock = false) {
  return [
    `Controlled release lock: ${report.status}`,
    `Passed: ${report.summary.passedCount}/${report.summary.totalCount}`,
    ...report.checks.map((item) => `- ${item.label}: ${item.status}`),
    report.ready ? `Release: ${report.lock.target} / ${report.lock.version} / ${report.lock.commit.slice(0, 12)}` : "Release: not created",
    `Lock written: ${report.ready && wroteLock ? "yes" : "no"}`,
    `Next: ${report.nextAction}`,
    "",
  ].join("\n");
}
