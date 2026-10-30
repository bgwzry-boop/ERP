#!/usr/bin/env node
import { mkdirSync, rmdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readControlledReleaseLock, verifyControlledReleaseLock, inspectControlledGitState } from "./controlled-release-lock-lib.mjs";
import { checkCandidateRelease, releasePolicy, inspectRemoteRepository, inspectMainWorkspace, git } from "./release-line-lib.mjs";

// Transport is infrastructure-specific. Every transport runs between these mandatory gates.
export async function runControlledDeployment(options, adapters) {
  for (const stage of ["preflight", "transport", "closeout"]) {
    try { if ((await adapters[stage]())?.ready !== true) return { ready: false, stage }; }
    catch { return { ready: false, stage }; }
  }
  return { ready: true, stage: "complete", commit: options.expectedCommit };
}
async function runCli() {
  let mutex;
  try {
    const options = { rootDir: process.cwd() };
    const fields = { "--root-dir": "rootDir", "--lock": "lock", "--expected-commit": "expectedCommit", "--expected-target": "expectedTarget", "--transport-script": "transportScript", "--base-url": "baseUrl", "--main-dir": "mainDir" };
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (!fields[args[i]] || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Invalid deployment arguments.");
      options[fields[args[i]]] = args[++i];
    }
    if (!["staging", "review-site", "tencent-production"].includes(options.expectedTarget) || !options.transportScript || !options.lock || !options.expectedCommit || !options.baseUrl) throw new Error("Deployment arguments required.");
    if (options.expectedTarget === "staging" && new URL(options.baseUrl).origin !== new URL(releasePolicy.stagingUrl).origin) throw new Error("Wrong staging origin.");
    const lock = readControlledReleaseLock(options.lock);
    const mutexPath = resolve(options.rootDir, git(options.rootDir, ["rev-parse", "--git-common-dir"]), "erp-controlled-deploy.lock");
    mkdirSync(mutexPath); mutex = mutexPath;
    const run = (command, args, env = process.env) => ({ ready: spawnSync(command, args, { cwd: options.rootDir, env, stdio: "inherit" }).status === 0 });
    const report = await runControlledDeployment(options, {
      preflight: async () => {
        const verified = verifyControlledReleaseLock({ lock, expectedCommit: options.expectedCommit, expectedTarget: options.expectedTarget, gitState: inspectControlledGitState(options.rootDir) });
        if (!verified.ready) { process.stdout.write(`${JSON.stringify(verified)}\n`); return verified; }
        const line = await checkCandidateRelease({ rootDir: options.rootDir, candidateCommit: options.expectedCommit, candidateBranch: lock.branch, target: options.expectedTarget, stagingRecovery: lock.stagingRecovery });
        if (!line.ready) process.stdout.write(`${JSON.stringify(line)}\n`);
        if (line.ready && options.expectedTarget === "staging") {
          const freshRemote = inspectRemoteRepository(options.rootDir);
          // The explicit grant pins the original clean checkout; it does not
          // authorize fast-forwarding that directory before the target is served.
          const expectedMain = line.recoveryApplied ? (freshRemote.canonicalCommit === lock.stagingRecovery?.canonicalCommit ? lock.stagingRecovery.mainCommit : "") : freshRemote.canonicalCommit;
          const main = inspectMainWorkspace(options.rootDir, options.mainDir, expectedMain).report;
          if (!main.ready) process.stdout.write(`${JSON.stringify(main)}\n`);
          return main;
        }
        return line;
      },
      transport: () => run("bash", [resolve(options.transportScript)], { ...process.env, ERP_CONTROLLED_RELEASE_LOCK: resolve(options.lock), ERP_CONTROLLED_RELEASE_COMMIT: options.expectedCommit, ERP_CONTROLLED_RELEASE_TARGET: options.expectedTarget }),
      closeout: () => options.expectedTarget === "staging"
        ? run(process.execPath, ["scripts/run-controlled-release-finalize.mjs", "--lock", resolve(options.lock), "--expected-commit", options.expectedCommit, "--base-url", options.baseUrl, ...(options.mainDir ? ["--main-dir", options.mainDir] : [])])
        : run(process.execPath, ["scripts/run-controlled-release-postdeploy-check.mjs", "--lock", resolve(options.lock), "--expected-commit", options.expectedCommit, "--expected-target", options.expectedTarget, "--base-url", options.baseUrl]),
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exitCode = report.ready ? 0 : 2;
  } catch { process.stderr.write("受控部署失败；未完成最终核对的版本不得交付为发布成功。\n"); process.exitCode = 1; }
  finally { if (mutex) rmdirSync(mutex); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();
