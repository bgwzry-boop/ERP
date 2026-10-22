#!/usr/bin/env node
import { mkdirSync, rmdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectControlledGitState, readControlledReleaseLock, verifyControlledReleaseLock } from "./controlled-release-lock-lib.mjs";
import { buildControlledReleasePostdeployReport } from "./run-controlled-release-postdeploy-check.mjs";
import { buildReleaseLineReport, formatReleaseLineReport } from "./check-release-line.mjs";
import { releasePolicy, git, fullCommit, check, reportFromChecks, inspectRepositoryLine, inspectRemoteRepository, inspectMainWorkspace } from "./release-line-lib.mjs";

// The only mutating phase: verify the served target first, then fast-forward Git, then verify again.
// A failed closeout never deletes work, resets a checkout, or force-pushes a baseline.
export async function finalizeStagingRelease(options, adapters) {
  const checks = [];
  const step = async (key, label, action) => {
    try { const result = await action(); checks.push(check(key, label, result?.ready === true)); return result?.ready === true; }
    catch { checks.push(check(key, label, false)); return false; }
  };
  const finish = () => reportFromChecks("staging_release_finalization", checks, { expectedCommit: options.expectedCommit });
  const remote = await adapters.readRemote();
  if (!await step("candidate", "候选工作树、远端与发布锁一致", () => adapters.checkCandidate(remote))) return finish();
  if (!await step("main-preflight", "主目录可安全快进且无未提交修改", () => adapters.checkMain(remote))) return finish();
  if (!await step("target-before", "线上前端/API 与本次发布锁一致", adapters.verifyTarget)) return finish();
  const fresh = await adapters.readRemote();
  checks.push(check("baseline-unchanged", "核对期间基线未被其他发布移动", fullCommit(remote.canonicalCommit) && fresh.canonicalCommit === remote.canonicalCommit));
  if (!checks.at(-1).ready) return finish();
  if (remote.canonicalCommit !== options.expectedCommit && !await step("promote", "非强制更新唯一基线", () => adapters.promote(remote))) return finish();
  if (!await step("main-sync", "主目录仅快进到已验明版本", adapters.syncMain)) return finish();
  if (!await step("target-after", "收尾后前端/API 仍为同一发布锁", adapters.verifyTarget)) return finish();
  await step("final", "仓库默认入口、基线、主目录与线上完全一致", adapters.verifyFinal);
  return finish();
}

async function runCli() {
  let mutex;
  try {
    const options = { rootDir: process.cwd(), baseUrl: releasePolicy.stagingUrl, output: ".erp-local-storage/releases/finalization.json" };
    const keys = { "--root-dir": "rootDir", "--main-dir": "mainDir", "--base-url": "baseUrl", "--lock": "lock", "--expected-commit": "expectedCommit", "--output": "output" };
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--json") { options.json = true; continue; }
      if (!keys[args[i]] || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Invalid finalization arguments.");
      options[keys[args[i]]] = args[++i];
    }
    if (!options.lock || !fullCommit(options.expectedCommit) || new URL(options.baseUrl).origin !== new URL(releasePolicy.stagingUrl).origin) throw new Error("Staging identity required.");
    const lock = readControlledReleaseLock(options.lock);
    const verification = verifyControlledReleaseLock({ lock, expectedCommit: options.expectedCommit, expectedTarget: "staging", gitState: inspectControlledGitState(options.rootDir) });
    if (!verification.ready) { process.stdout.write(`${JSON.stringify(verification)}\n`); process.exitCode = 2; return; }
    const commonDir = resolve(options.rootDir, git(options.rootDir, ["rev-parse", "--git-common-dir"]));
    const mutexPath = join(commonDir, "erp-release-finalize.lock");
    mkdirSync(mutexPath); mutex = mutexPath;
    const main = inspectMainWorkspace(options.rootDir, options.mainDir, options.expectedCommit).mainDir;
    const verifyTarget = () => buildControlledReleasePostdeployReport({ baseUrl: options.baseUrl, lockVerification: verification });
    const report = await finalizeStagingRelease(options, {
      readRemote: () => inspectRemoteRepository(options.rootDir),
      checkCandidate: () => {
        const line = inspectRepositoryLine({ rootDir: options.rootDir, candidateCommit: options.expectedCommit, candidateBranch: lock.branch, target: "staging" }).report;
        const currentLock = verifyControlledReleaseLock({ lock, expectedCommit: options.expectedCommit, expectedTarget: "staging", gitState: inspectControlledGitState(options.rootDir) });
        return { ready: line.ready && currentLock.ready };
      },
      checkMain: () => {
        const state = inspectControlledGitState(main);
        const mainCheck = inspectMainWorkspace(options.rootDir, main, state.commit).report;
        if (!mainCheck.ready) return mainCheck;
        git(main, ["merge-base", "--is-ancestor", state.commit, options.expectedCommit]);
        return { ready: true };
      },
      verifyTarget,
      promote: () => {
        git(options.rootDir, ["push", releasePolicy.remote, `${options.expectedCommit}:refs/heads/${releasePolicy.canonicalBranch}`]);
        return { ready: true };
      },
      syncMain: () => {
        const state = inspectControlledGitState(main);
        if (!state.clean || state.branch !== releasePolicy.canonicalBranch) return { ready: false };
        git(main, ["merge", "--ff-only", options.expectedCommit]);
        git(main, ["fetch", "--no-tags", releasePolicy.remote, `refs/heads/${releasePolicy.canonicalBranch}:refs/remotes/origin/${releasePolicy.canonicalBranch}`]);
        git(main, ["symbolic-ref", "refs/remotes/origin/HEAD", `refs/remotes/origin/${releasePolicy.canonicalBranch}`]);
        return inspectMainWorkspace(options.rootDir, main, options.expectedCommit).report;
      },
      verifyFinal: async () => {
        const report = await buildReleaseLineReport({ rootDir: options.rootDir, mainDir: main, scope: "local", expectedCommit: options.expectedCommit });
        return { ready: report.ready && report.release?.digest === verification.release.digest && report.release?.version === verification.release.version };
      },
    });
    const output = resolve(options.output);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify({ ...report, checkedAt: new Date().toISOString(), release: verification.release }, null, 2)}\n`);
    process.stdout.write(options.json ? `${JSON.stringify(report)}\n` : formatReleaseLineReport(report));
    if (report.ready) process.stdout.write(`已核验发布地址：${releasePolicy.stagingUrl}?erpRelease=${options.expectedCommit}&erpViewport=desktop#material-receiving\n`);
    process.exitCode = report.ready ? 0 : 2;
  } catch { process.stderr.write("发布收尾失败：检查发布锁、远端权限、主目录状态或并行发布锁；未强推或覆盖未提交修改。\n"); process.exitCode = 1; }
  finally { if (mutex) rmdirSync(mutex); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();
