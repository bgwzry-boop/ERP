#!/usr/bin/env node

import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
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
    const verification = verifyControlledReleaseLock({
      lock,
      expectedCommit: options.expectedCommit,
      expectedTarget: options.expectedTarget,
      gitState: inspectControlledGitState(options.rootDir),
    });
    if (!verification.ready) {
      process.stdout.write(`${JSON.stringify(verification)}\n`);
      process.exitCode = 2;
      return;
    }
    const line = await checkCandidateRelease({ rootDir: options.rootDir, candidateCommit: options.expectedCommit, candidateBranch: lock.branch, target: options.expectedTarget });
    if (!line.ready) { process.stdout.write(`${JSON.stringify(line)}\n`); process.exitCode = 2; return; }
    const buildScript = options.expectedTarget === "tencent-production" ? "build" : "build:staging:full";
    const env = {
        ...process.env,
        VITE_ERP_RELEASE_TARGET: verification.release.target,
        VITE_ERP_RELEASE_COMMIT: verification.release.commit,
        VITE_ERP_RELEASE_VERSION: verification.release.version,
        VITE_ERP_RELEASE_LOCK_DIGEST: verification.release.digest,
        VITE_ERP_RELEASE_BUILT_AT: new Date().toISOString(),
        ...(options.expectedTarget === "tencent-production"
          ? {
              VITE_ERP_RUNTIME_MODE: "production",
              VITE_ERP_API_BASE_URL: "/api",
              VITE_RAW_MATERIAL_FIRST_RELEASE: "true",
            }
          : {}),
    };
    const result = spawnSync("npm", ["run", buildScript], { cwd: options.rootDir, stdio: "inherit", env });
    if (result.status !== 0) { process.exitCode = 2; return; }
    // The deployed staging entry is the complete review shell; build it with the SAME lock.
    const review = options.expectedTarget !== "tencent-production"
      ? spawnSync("npm", ["run", "build"], { cwd: join(options.rootDir, "docs/prototypes/raw-material-roll-inventory-review"), stdio: "inherit", env: { ...env, VITE_ERP_RUNTIME_MODE: "test", VITE_ERP_API_BASE_URL: "/api", VITE_ERP_STAGING_AUTH_BYPASS: "true", VITE_ERP_STAGING_PREVIEW_USER_ID: "U-MANAGER-A", VITE_RAW_MATERIAL_FIRST_RELEASE: "false" } })
      : { status: 0 };
    process.exitCode = review.status === 0 ? 0 : 2;
  } catch {
    process.stderr.write("Controlled release build failed without exposing repository or lock paths.\n");
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  const options = { rootDir: process.cwd(), lock: "", expectedCommit: "", expectedTarget: "" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--root-dir", "--lock", "--expected-commit", "--expected-target"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      const key = { "--root-dir": "rootDir", "--lock": "lock", "--expected-commit": "expectedCommit", "--expected-target": "expectedTarget" }[arg];
      options[key] = key === "rootDir" || key === "lock" ? resolve(value) : value;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write("Usage: node scripts/run-controlled-release-build.mjs --lock <path> --expected-target <target> --expected-commit <full-sha> [--root-dir <checkout>]\n");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.lock || !options.expectedCommit || !options.expectedTarget) throw new Error("Lock, target and commit are required.");
  return options;
}
