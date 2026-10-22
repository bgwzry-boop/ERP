#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectRemoteRepository, evaluateRepository, fetchReleaseIdentity, checkLiveIdentity, reportFromChecks, check, inspectMainWorkspace, releasePolicy } from "./release-line-lib.mjs";
import { readControlledReleaseLock, verifyControlledReleaseLock } from "./controlled-release-lock-lib.mjs";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const base = new URL(options.baseUrl);
    if (base.protocol !== "https:" || base.username || base.password ||
      (options.expectedTarget === "staging" && (base.origin !== new URL(releasePolicy.stagingUrl).origin || base.pathname !== "/"))) throw new Error("Unexpected deployment origin.");
    const lock = readControlledReleaseLock(options.lock);
    const lockVerification = verifyControlledReleaseLock({
      lock,
      expectedCommit: options.expectedCommit,
      expectedTarget: options.expectedTarget,
    });
    let report = await buildControlledReleasePostdeployReport({
      baseUrl: options.baseUrl,
      lockVerification,
      fetchImpl: globalThis.fetch,
    });
    report = appendStagingCurrentRefCheck(report, {
      target: lockVerification.release?.target,
      expectedCommit: lockVerification.release?.commit,
      currentRefCommit: inspectRemoteRepository(options.rootDir).canonicalCommit,
    });
    const repository = evaluateRepository({ remote: inspectRemoteRepository(options.rootDir) });
    report = reportFromChecks(report.scope, [...report.checks, ...repository.checks,
      ...(options.mainDir ? inspectMainWorkspace(options.rootDir, options.mainDir, repository.canonicalCommit).report.checks : []),
    ], report);
    process.stdout.write(options.json ? `${JSON.stringify(report)}\n` : formatReport(report));
    process.exitCode = report.ready ? 0 : 2;
  } catch {
    process.stderr.write("Controlled post-deploy verification failed without exposing the deployment URL or response body.\n");
    process.exitCode = 1;
  }
}

export function appendStagingCurrentRefCheck(report, options = {}) {
  if (options.target !== "staging") return report;
  const expectedCommit = String(options.expectedCommit || "").trim().toLowerCase();
  const currentRefCommit = String(options.currentRefCommit || "").trim().toLowerCase();
  const currentRefCheck = check(
    "staging-current-ref",
    "staging-current 唯一基线与部署提交一致",
    /^[a-f0-9]{40}$/.test(expectedCommit) && currentRefCommit === expectedCommit,
  );
  const checks = [...report.checks, currentRefCheck];
  const ready = checks.every((item) => item.ready);
  return {
    ...report,
    status: ready ? "ready" : "blocked",
    ready,
    summary: {
      passedCount: checks.filter((item) => item.ready).length,
      totalCount: checks.length,
      blockingCount: checks.filter((item) => !item.ready).length,
    },
    checks,
  };
}

export async function buildControlledReleasePostdeployReport(options = {}) {
  const release = options.lockVerification?.release ?? {};
  const lockReady = options.lockVerification?.ready === true;
  const requireApi = release.target !== "review-site";
  const observed = await fetchReleaseIdentity(options.baseUrl, { requireApi, fetchImpl: options.fetchImpl });
  const checks = [check("release-lock", "发布锁有效", lockReady), ...checkLiveIdentity(observed, release, { requireApi })];
  const ready = checks.every((item) => item.ready);
  return {
    scope: "controlled_release_postdeploy",
    status: ready ? "ready" : "blocked",
    ready,
    summary: {
      passedCount: checks.filter((item) => item.ready).length,
      totalCount: checks.length,
      blockingCount: checks.filter((item) => !item.ready).length,
    },
    checks,
    release: { target: release.target, version: release.version, shortCommit: String(release.commit ?? "").slice(0, 12) },
    safeguards: { urlExposed: false, responseBodyIncluded: false, businessDataIncluded: false, apiRequired: requireApi },
  };
}

function parseArgs(args) {
  const options = { baseUrl: "", lock: "", expectedCommit: "", expectedTarget: "", json: false, rootDir: process.cwd(), mainDir: "" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--base-url", "--lock", "--expected-commit", "--expected-target", "--root-dir", "--main-dir"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      const key = { "--base-url": "baseUrl", "--lock": "lock", "--expected-commit": "expectedCommit", "--expected-target": "expectedTarget", "--root-dir": "rootDir", "--main-dir": "mainDir" }[arg];
      options[key] = key === "lock" ? resolve(value) : value;
      index += 1;
      continue;
    }
    if (arg === "--json") options.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.baseUrl || !options.lock || !options.expectedCommit || !options.expectedTarget) throw new Error("URL, lock, target and commit are required.");
  return options;
}

function formatReport(report) {
  return [
    `Controlled post-deploy check: ${report.status}`,
    `Release: ${report.release.target} / ${report.release.version} / ${report.release.shortCommit}`,
    `Passed: ${report.summary.passedCount}/${report.summary.totalCount}`,
    ...report.checks.map((item) => `- ${item.label}: ${item.status}`),
    "",
  ].join("\n");
}
