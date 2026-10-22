import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  evaluateRepository,
  checkMainWorkspace,
  inspectMainWorkspace,
  mainWorktree,
  repositoryMatches,
  readMeta,
  checkStagingBaseline,
  releasePolicy,
} from "./release-line-lib.mjs";
import { finalizeStagingRelease } from "./run-controlled-release-finalize.mjs";
import { runControlledDeployment } from "./run-controlled-deploy.mjs";
import { parseReleaseLineArgs } from "./check-release-line.mjs";
import { CHECK_GROUPS } from "./check-group-manifest.mjs";

const baseline = "1".repeat(40);
const candidate = "2".repeat(40);
const branch = "codex/release-candidate";
const remote = {
  valid: true,
  defaultBranch: releasePolicy.canonicalBranch,
  canonicalCommit: baseline,
  headCommit: baseline,
  branches: { [branch]: candidate, [releasePolicy.canonicalBranch]: baseline },
};
const repositoryInput = { remote, candidateCommit: candidate, candidateBranch: branch, candidateRelated: true };

test("repository gate accepts a pushed candidate on the canonical line", () => {
  const report = evaluateRepository(repositoryInput);
  assert.equal(report.ready, true);
  assert.equal(report.canonicalCommit, baseline);
});

test("repository gate rejects missing remote, stale default, malformed commit and unpublished candidates", () => {
  for (const input of [
    { ...repositoryInput, remote: {} },
    { ...repositoryInput, remote: { ...remote, valid: false } },
    { ...repositoryInput, remote: { ...remote, defaultBranch: "codex/old-preview" } },
    { ...repositoryInput, remote: { ...remote, headCommit: candidate } },
    { ...repositoryInput, remote: { ...remote, canonicalCommit: "1234" } },
    { ...repositoryInput, remote: { ...remote, branches: {} } },
    { ...repositoryInput, remote: { ...remote, branches: { [branch]: baseline } } },
    { ...repositoryInput, candidateCommit: "2".repeat(12) },
    { ...repositoryInput, candidateBranch: "" },
    { ...repositoryInput, candidateRelated: false },
    { ...repositoryInput, candidateRelated: undefined },
  ]) assert.equal(evaluateRepository(input).ready, false, "unknown or inconsistent evidence cannot pass");
});

test("repository origin matching is limited to the configured repository", () => {
  assert.equal(repositoryMatches("https://github.com/bgwzry-boop/ERP.git"), true);
  assert.equal(repositoryMatches("git@github.com:bgwzry-boop/ERP.git"), true);
  for (const url of [
    "https://github.com/other/ERP.git",
    "https://github.com.example.com/bgwzry-boop/ERP.git",
    "https://github.com/bgwzry-boop/ERP.git/extra",
    "file:///tmp/ERP",
  ]) assert.equal(repositoryMatches(url), false);
});

test("main workspace cannot claim agreement when dirty, detached, from another repository or stale", () => {
  const gitState = { repository: true, clean: true, branch: releasePolicy.canonicalBranch, commit: baseline };
  assert.equal(checkMainWorkspace({ gitState, expectedCommit: baseline }).ready, true);
  for (const changes of [
    { repository: false }, { clean: false }, { branch: "" },
    { branch: "codex/task" }, { commit: candidate },
  ]) assert.equal(checkMainWorkspace({ gitState: { ...gitState, ...changes }, expectedCommit: baseline }).ready, false);
  assert.equal(checkMainWorkspace({ gitState, expectedCommit: baseline, sameRepository: false }).ready, false);
  assert.equal(checkMainWorkspace({ gitState, expectedCommit: "" }).ready, false);
});

test("main-worktree discovery and inspection preserve dirty data and reject another clone", () => {
  const directory = mkdtempSync(join(tmpdir(), "erp-release-main-test-"));
  const primary = join(directory, "primary");
  const feature = join(directory, "feature");
  const unrelated = join(directory, "unrelated");
  const run = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    run(directory, ["init", "--initial-branch", releasePolicy.canonicalBranch, primary]);
    run(primary, ["config", "user.email", "fixture@example.test"]);
    run(primary, ["config", "user.name", "Release fixture"]);
    writeFileSync(join(primary, "tracked.txt"), "original\n");
    run(primary, ["add", "tracked.txt"]);
    run(primary, ["commit", "-m", "fixture"]);
    const commit = run(primary, ["rev-parse", "HEAD"]);
    run(primary, ["worktree", "add", "-b", "codex/test-task", feature]);
    assert.equal(realpathSync(mainWorktree(feature)), realpathSync(primary));
    assert.equal(inspectMainWorkspace(feature, undefined, commit).report.ready, true);
    writeFileSync(join(primary, "tracked.txt"), "unsaved owner work\n");
    const result = inspectMainWorkspace(feature, primary, commit);
    assert.equal(result.report.ready, false);
    assert.equal(readFileSync(join(primary, "tracked.txt"), "utf8"), "unsaved owner work\n");
    assert.equal(run(primary, ["symbolic-ref", "--short", "HEAD"]), releasePolicy.canonicalBranch);
    run(directory, ["clone", primary, unrelated]);
    assert.equal(inspectMainWorkspace(feature, unrelated, commit).report.ready, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("HTML identity accepts attribute order but rejects duplicate declarations", () => {
  assert.equal(readMeta(`<meta content="${baseline}" name="erp-release-commit">`, "erp-release-commit"), baseline);
  assert.equal(readMeta(`<meta name="erp-release-commit" content="${baseline}"><meta name="erp-release-commit" content="${candidate}">`, "erp-release-commit"), "");
  assert.equal(readMeta("<html></html>", "erp-release-commit"), "");
});

function liveFixture(url, overrides = {}) {
  const release = { target: "staging", version: "staging-fixture-r1", commit: baseline, digest: "a".repeat(64) };
  if (new URL(url).pathname.endsWith("/api/health")) return {
    ok: true,
    json: async () => ({ status: "ok", release: { ready: true, ...release, lockDigest: release.digest, ...overrides } }),
  };
  return { ok: true, text: async () => Object.entries({ target: release.target, version: release.version, commit: release.commit, lock: release.digest }).map(([key, value]) => `<meta name="erp-release-${key}" content="${value}">`).join("") };
}

test("live staging baseline requires frontend, API and canonical to agree", async () => {
  assert.equal((await checkStagingBaseline(remote, { fetchImpl: async (url) => liveFixture(url) })).ready, true);
  assert.equal((await checkStagingBaseline({ ...remote, canonicalCommit: candidate }, { fetchImpl: async (url) => liveFixture(url) })).ready, false);
  assert.equal((await checkStagingBaseline(remote, { fetchImpl: async (url) => liveFixture(url, { lockDigest: "b".repeat(64) }) })).ready, false);
  assert.equal((await checkStagingBaseline(remote, { fetchImpl: async () => { throw new Error("unreachable"); } })).ready, false);
});

function finalizationFixture({ current = baseline, fail, race = false, targetAfterReady = true, throws = false } = {}) {
  const calls = [];
  let reads = 0;
  let targetChecks = 0;
  const action = (name) => async () => {
    calls.push(name);
    if (throws && fail === name) throw new Error("private operational detail");
    return { ready: fail !== name };
  };
  return {
    calls,
    adapters: {
      readRemote: async () => {
        calls.push("readRemote");
        reads += 1;
        return { canonicalCommit: race && reads > 1 ? "3".repeat(40) : current };
      },
      checkCandidate: action("checkCandidate"),
      checkMain: action("checkMain"),
      verifyTarget: async () => {
        calls.push("verifyTarget");
        targetChecks += 1;
        return { ready: fail !== "verifyTarget" && (targetChecks === 1 || targetAfterReady) };
      },
      promote: action("promote"),
      syncMain: action("syncMain"),
      verifyFinal: action("verifyFinal"),
    },
  };
}

test("finalization verifies target before ref mutation and verifies again after synchronization", async () => {
  const fixture = finalizationFixture();
  const report = await finalizeStagingRelease({ expectedCommit: candidate }, fixture.adapters);
  assert.equal(report.ready, true);
  assert.deepEqual(fixture.calls, ["readRemote", "checkCandidate", "checkMain", "verifyTarget", "readRemote", "promote", "syncMain", "verifyTarget", "verifyFinal"]);
});

test("failed candidate, dirty main or wrong target cannot advance the baseline", async () => {
  for (const fail of ["checkCandidate", "checkMain", "verifyTarget"]) {
    const fixture = finalizationFixture({ fail });
    const report = await finalizeStagingRelease({ expectedCommit: candidate }, fixture.adapters);
    assert.equal(report.ready, false, fail);
    assert.equal(fixture.calls.includes("promote"), false, fail);
    assert.equal(fixture.calls.includes("syncMain"), false, fail);
    assert.equal(fixture.calls.includes("verifyFinal"), false, fail);
  }
});

test("concurrent canonical advance blocks finalization before any write", async () => {
  const fixture = finalizationFixture({ race: true });
  const report = await finalizeStagingRelease({ expectedCommit: candidate }, fixture.adapters);
  assert.equal(report.ready, false);
  assert.equal(fixture.calls.includes("promote"), false);
  assert.equal(fixture.calls.includes("syncMain"), false);
});

test("failed promotion or sync cannot manufacture final success or continue into later writes", async () => {
  for (const fail of ["promote", "syncMain"]) {
    for (const throws of [false, true]) {
      const fixture = finalizationFixture({ fail, throws });
      const report = await finalizeStagingRelease({ expectedCommit: candidate }, fixture.adapters);
      assert.equal(report.ready, false);
      assert.equal(fixture.calls.includes("verifyFinal"), false);
      if (fail === "promote") assert.equal(fixture.calls.includes("syncMain"), false);
      assert.doesNotMatch(JSON.stringify(report), /private operational detail/);
    }
  }
});

test("a mismatch after promotion remains incomplete without automatic rollback", async () => {
  const fixture = finalizationFixture({ targetAfterReady: false });
  const report = await finalizeStagingRelease({ expectedCommit: candidate }, fixture.adapters);
  assert.equal(report.ready, false);
  assert.equal(fixture.calls.filter((name) => name === "promote").length, 1);
  assert.equal(fixture.calls.includes("verifyFinal"), false);
  const failedFinal = finalizationFixture({ fail: "verifyFinal" });
  assert.equal((await finalizeStagingRelease({ expectedCommit: candidate }, failedFinal.adapters)).ready, false);
});

test("retry after canonical was already advanced syncs the main checkout without another push", async () => {
  const fixture = finalizationFixture({ current: candidate });
  const report = await finalizeStagingRelease({ expectedCommit: candidate }, fixture.adapters);
  assert.equal(report.ready, true);
  assert.equal(fixture.calls.includes("promote"), false);
  assert.deepEqual(fixture.calls, ["readRemote", "checkCandidate", "checkMain", "verifyTarget", "readRemote", "syncMain", "verifyTarget", "verifyFinal"]);
});

test("deployment transport is bracketed by mandatory preflight and closeout", async () => {
  const calls = [];
  const adapters = Object.fromEntries(["preflight", "transport", "closeout"].map((name) => [name, async () => {
    calls.push(name);
    return { ready: true };
  }]));
  assert.deepEqual(await runControlledDeployment({ expectedCommit: candidate }, adapters), { ready: true, stage: "complete", commit: candidate });
  assert.deepEqual(calls, ["preflight", "transport", "closeout"]);
});

test("deployment refuses unknown stage outcomes and never runs a subsequent stage", async () => {
  const stages = ["preflight", "transport", "closeout"];
  for (const failedStage of stages) {
    for (const result of [{ ready: false }, { ready: "false" }, { ready: 1 }, {}, null, undefined]) {
      const calls = [];
      const adapters = Object.fromEntries(stages.map((name) => [name, async () => {
        calls.push(name);
        return name === failedStage ? result : { ready: true };
      }]));
      const report = await runControlledDeployment({ expectedCommit: candidate }, adapters);
      assert.equal(report.ready, false, `${failedStage} / ${JSON.stringify(result)}`);
      assert.equal(report.stage, failedStage);
      assert.deepEqual(calls, stages.slice(0, stages.indexOf(failedStage) + 1));
    }
  }
});

test("unexpected deployment exceptions cannot continue or return a successful release", async () => {
  const stages = ["preflight", "transport", "closeout"];
  for (const failedStage of stages) {
    const calls = [];
    const adapters = Object.fromEntries(stages.map((name) => [name, async () => {
      calls.push(name);
      if (name === failedStage) throw new Error("fixture stage failure");
      return { ready: true };
    }]));
    const report = await runControlledDeployment({ expectedCommit: candidate }, adapters);
    assert.deepEqual(report, { ready: false, stage: failedStage });
    assert.doesNotMatch(JSON.stringify(report), /fixture stage failure/);
    assert.deepEqual(calls, stages.slice(0, stages.indexOf(failedStage) + 1));
  }
});

test("release check defaults to local context and requires paired candidate evidence", () => {
  const defaults = parseReleaseLineArgs([]);
  assert.equal(defaults.scope, "local");
  assert.equal(defaults.target, "staging");
  assert.equal(defaults.rootDir, process.cwd());
  const candidateOptions = parseReleaseLineArgs(["--scope", "repository", "--candidate", candidate, "--candidate-branch", branch, "--target", "tencent-production", "--json"]);
  assert.equal(candidateOptions.scope, "repository");
  assert.equal(candidateOptions.candidate, candidate);
  assert.equal(candidateOptions.candidateBranch, branch);
  assert.equal(candidateOptions.json, true);
  assert.equal(parseReleaseLineArgs(["--expected-commit", baseline]).expectedCommit, baseline);
  for (const args of [
    ["--candidate", candidate], ["--candidate-branch", branch],
    ["--scope", "skip-all"], ["--target", "unknown"],
    ["--scope"], ["--scope", "--json"], ["--unknown", "anything"],
  ]) assert.throws(() => parseReleaseLineArgs(args));
});

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("release entry points retain mandatory candidate and postdeploy gates", () => {
  for (const path of ["scripts/run-controlled-release-lock.mjs", "scripts/verify-controlled-release-lock.mjs", "scripts/run-controlled-release-build.mjs"]) {
    const text = source(path);
    assert.match(text, /await checkCandidateRelease\(/, `${path} must invoke the shared candidate gate`);
    assert.match(text, /candidateBranch: (?:report\.)?lock\.branch/, `${path} must verify the lock's actual remote branch`);
    assert.match(text, /process\.exitCode = (?:report\.ready \? 0 : 2|2)/, `${path} must return a blocking exit status`);
  }
  const build = source("scripts/run-controlled-release-build.mjs");
  assert.ok(build.indexOf("await checkCandidateRelease(") < build.indexOf('spawnSync("npm"'), "build cannot start before checking the release line");
  const prepare = source("scripts/run-controlled-release-lock.mjs");
  assert.ok(prepare.indexOf("await checkCandidateRelease(") < prepare.indexOf("writeFileSync(options.output"), "a lock cannot be written before checking the release line");
  const postdeploy = source("scripts/run-controlled-release-postdeploy-check.mjs");
  assert.match(postdeploy, /evaluateRepository\(\{ remote: inspectRemoteRepository/);
  assert.match(postdeploy, /appendStagingCurrentRefCheck\(report/);
  const deploy = source("scripts/run-controlled-deploy.mjs");
  assert.match(deploy, /scripts\/run-controlled-release-finalize\.mjs/);
  assert.match(deploy, /scripts\/run-controlled-release-postdeploy-check\.mjs/);
});

test("version checks are wired into standard CI and every canonical push", () => {
  const scripts = JSON.parse(source("package.json")).scripts;
  assert.equal(scripts["release:line:check"], "node --test scripts/check-release-line.test.mjs");
  assert.equal(scripts["controlled-release:deploy"], "node scripts/run-controlled-deploy.mjs");
  assert.equal(scripts["controlled-release:finalize"], "node scripts/run-controlled-release-finalize.mjs");
  assert.ok(CHECK_GROUPS.core.includes("release:line:check"));
  const workflow = source(".github/workflows/release-identity.yml");
  assert.match(workflow, /push:\s+branches: \[codex\/staging-current\]/);
  assert.match(workflow, /scripts\/check-release-line\.mjs --scope repository --expected-commit "\$RELEASE_COMMIT"/);
  assert.match(workflow, /RELEASE_COMMIT: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /actions\/upload-artifact@/);
  assert.doesNotMatch(workflow, /continue-on-error: true/);
});

test("production recovery and live release gate cannot bypass version identity checks", () => {
  const recovery = source("scripts/run-v1-production-remote-recovery.mjs");
  assert.match(recovery, /run\("release-line"/);
  assert.match(recovery, /"scripts\/check-release-line\.mjs"/);
  assert.match(recovery, /"--candidate-branch", candidateBranch/);
  assert.ok(recovery.indexOf('run("release-line"') < recovery.indexOf('run("build"'), "recovery must stop before building an unverified candidate");
  const workflow = source(".github/workflows/v1-production-release-gate.yml");
  assert.match(workflow, /ERP_CONTROLLED_RELEASE_LOCK_B64/);
  assert.match(workflow, /npm run controlled-release:verify/);
  assert.match(workflow, /scripts\/run-controlled-release-postdeploy-check\.mjs/);
  assert.match(workflow, /--expected-target tencent-production/);
  assert.match(workflow, /--expected-commit "\$RELEASE_COMMIT"/);
});
