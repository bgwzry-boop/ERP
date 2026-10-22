import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { inspectControlledGitState } from "./controlled-release-lock-lib.mjs";

export const releasePolicy = Object.freeze(JSON.parse(readFileSync(new URL("../deploy/release-policy.json", import.meta.url), "utf8")));
export const fullCommit = (value) => /^[a-f0-9]{40}$/.test(value ?? "");
export const check = (key, label, ready) => ({ key, label, ready: ready === true, status: ready === true ? "passed" : "blocked" });
export function reportFromChecks(scope, checks, extra = {}) {
  const ready = checks.every((item) => item.ready);
  return { ...extra, scope, ready, status: ready ? "ready" : "blocked", checks,
    summary: { totalCount: checks.length, passedCount: checks.filter((item) => item.ready).length, blockingCount: checks.filter((item) => !item.ready).length } };
}
export function git(rootDir, args) {
  return execFileSync("git", args, { cwd: rootDir, encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).trim();
}
export function repositoryMatches(url) {
  return String(url).replace(/^git@github\.com:/, "https://github.com/").replace(/\.git\/?$/, "").replace(/\/$/, "").toLowerCase() === `https://github.com/${releasePolicy.repository}`.toLowerCase();
}
export function inspectRemoteRepository(rootDir) {
  try {
    const origin = git(rootDir, ["remote", "get-url", releasePolicy.remote]);
    if (!repositoryMatches(origin)) return { valid: false, branches: {} };
    const output = git(rootDir, ["ls-remote", "--symref", releasePolicy.remote, "HEAD", "refs/heads/*"]);
    const branches = {};
    for (const line of output.split("\n")) {
      const match = line.match(/^([a-f0-9]{40})\s+refs\/heads\/(.+)$/);
      if (match) branches[match[2]] = match[1];
    }
    return { valid: true, defaultBranch: output.match(/^ref: refs\/heads\/(.+)\s+HEAD$/m)?.[1],
      headCommit: output.match(/^([a-f0-9]{40})\s+HEAD$/m)?.[1], canonicalCommit: branches[releasePolicy.canonicalBranch], branches };
  } catch { return { valid: false, branches: {} }; }
}
export function evaluateRepository({ remote = {}, candidateCommit, candidateBranch, candidateRelated } = {}) {
  const checks = [
    check("controlled-origin", "origin 指向规定 ERP 仓库且可读取", remote.valid),
    check("default-branch", "仓库默认分支为唯一 staging 基线", remote.defaultBranch === releasePolicy.canonicalBranch),
    check("canonical-commit", "远端基线具有完整提交号", fullCommit(remote.canonicalCommit)),
    check("default-head", "仓库默认入口与基线提交一致", fullCommit(remote.canonicalCommit) && remote.headCommit === remote.canonicalCommit),
  ];
  if (candidateCommit !== undefined) checks.push(
    check("candidate-full-commit", "候选使用完整 40 位提交", fullCommit(candidateCommit)),
    check("candidate-pushed", "候选命名分支已实际推送远端", fullCommit(candidateCommit) && Boolean(candidateBranch) && remote.branches?.[candidateBranch] === candidateCommit),
    check("candidate-lineage", "候选属于唯一发布线", candidateRelated),
  );
  return reportFromChecks("release_repository", checks, { canonicalCommit: remote.canonicalCommit ?? "" });
}
export function inspectRepositoryLine({ rootDir = process.cwd(), candidateCommit, candidateBranch, target = "staging" } = {}) {
  const remote = inspectRemoteRepository(rootDir);
  let candidateRelated = false;
  if (fullCommit(remote.canonicalCommit) && fullCommit(candidateCommit)) {
    try {
      // Fetch objects, never move the checked-out canonical branch or trust stale tracking refs.
      git(rootDir, ["fetch", "--no-tags", releasePolicy.remote, remote.canonicalCommit, candidateCommit]);
      const ancestor = target !== "tencent-production" ? remote.canonicalCommit : candidateCommit;
      const descendant = target !== "tencent-production" ? candidateCommit : remote.canonicalCommit;
      git(rootDir, ["merge-base", "--is-ancestor", ancestor, descendant]);
      candidateRelated = true;
    } catch { candidateRelated = false; }
  }
  return { remote, report: evaluateRepository({ remote, candidateCommit, candidateBranch, candidateRelated }) };
}
export function mainWorktree(rootDir = process.cwd()) {
  return git(rootDir, ["worktree", "list", "--porcelain", "-z"]).split("\0")[0].replace(/^worktree /, "");
}
export function checkMainWorkspace({ gitState = {}, expectedCommit, sameRepository = true } = {}) {
  return reportFromChecks("main_workspace", [
    check("main-repository", "主目录属于同一受控仓库", gitState.repository && sameRepository),
    check("main-branch", "主目录使用唯一 staging 基线", gitState.branch === releasePolicy.canonicalBranch),
    check("main-clean", "主目录没有未提交修改", gitState.clean),
    check("main-commit", "主目录与已部署提交一致", fullCommit(expectedCommit) && gitState.commit === expectedCommit),
  ]);
}
export function inspectMainWorkspace(rootDir, directory, expectedCommit) {
  const mainDir = directory || mainWorktree(rootDir);
  let sameRepository = false;
  try {
    const common = (dir) => realpathSync(resolve(dir, git(dir, ["rev-parse", "--git-common-dir"])));
    sameRepository = common(mainDir) === common(rootDir);
  } catch { /* Fail closed. */ }
  return { mainDir, report: checkMainWorkspace({ gitState: inspectControlledGitState(mainDir), expectedCommit, sameRepository }) };
}
export async function fetchReleaseIdentity(baseUrl, { requireApi = true, fetchImpl = globalThis.fetch, healthBaseUrl } = {}) {
  const base = new URL(baseUrl);
  if (base.username || base.password || !["https:", "http:"].includes(base.protocol)) throw new Error("Invalid release origin.");
  const read = async (pathname, accept, source = base) => {
    try {
      const url = new URL(source);
      url.pathname = pathname;
      url.search = ""; url.hash = "";
      url.searchParams.set("erpReleaseCheck", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const response = await fetchImpl(url, { headers: { accept, "cache-control": "no-cache, no-store" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
      if (!response.ok) return null;
      return accept === "text/html" ? await response.text() : await response.json();
    } catch { return null; }
  };
  const prefix = base.pathname.replace(/\/+$/, "");
  const [html, health] = await Promise.all([read(prefix || "/", "text/html"), requireApi ? read(`${prefix}/api/health`, "application/json", healthBaseUrl || base) : Promise.resolve(null)]);
  return { pageOk: typeof html === "string", healthOk: health !== null, html: html ?? "", health,
    release: { target: readMeta(html, "erp-release-target"), version: readMeta(html, "erp-release-version"), commit: readMeta(html, "erp-release-commit"), digest: readMeta(html, "erp-release-lock") } };
}
export function readMeta(html, name) {
  const values = [...String(html ?? "").matchAll(/<meta\s+[^>]*>/gi)].flatMap(([tag]) => {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [m[1].toLowerCase(), m[2]]));
    return attrs.name === name ? [attrs.content ?? ""] : [];
  });
  return values.length === 1 ? values[0] : "";
}
export function checkLiveIdentity(observed, expected, { requireApi = true } = {}) {
  const checks = [check("page", "页面可访问", observed.pageOk)];
  if (expected.target === "staging") checks.push(check("page-app-id", "Staging 入口为完整 ERP 评审应用", readMeta(observed.html, "erp-app-id") === releasePolicy.previewAppId));
  for (const [key, label] of [["target", "目标"], ["version", "版本"], ["commit", "提交"], ["digest", "发布锁"]]) {
    checks.push(check(`page-${key === "digest" ? "lock" : key}`, `页面${label}一致`, Boolean(expected[key]) && observed.release[key] === expected[key]));
  }
  if (requireApi) {
    checks.push(check("api", "API health 可访问", observed.healthOk && observed.health?.status === "ok"), check("api-release", "API 发布身份完整", observed.health?.release?.ready));
    for (const [key, apiKey, label] of [["target", "target", "目标"], ["version", "version", "版本"], ["commit", "commit", "提交"], ["digest", "lockDigest", "发布锁"]]) {
      checks.push(check(`api-${key === "digest" ? "lock" : key}`, `API ${label}一致`, Boolean(expected[key]) && observed.health?.release?.[apiKey] === expected[key]));
    }
  }
  return checks;
}
export async function checkStagingBaseline(remote, options = {}) {
  const observed = await fetchReleaseIdentity(releasePolicy.stagingUrl, options);
  const expected = { ...observed.release, target: "staging", commit: remote.canonicalCommit };
  return reportFromChecks("staging_baseline", [
    check("staging-lock-format", "线上有完整发布版本与锁身份", /^[a-f0-9]{64}$/.test(expected.digest) && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(expected.version)),
    ...checkLiveIdentity(observed, expected),
  ], { release: expected });
}
export async function checkCandidateRelease(options) {
  const { remote, report } = inspectRepositoryLine(options);
  const baseline = await checkStagingBaseline(remote);
  return reportFromChecks("release_candidate_line", [...report.checks, ...baseline.checks]);
}
