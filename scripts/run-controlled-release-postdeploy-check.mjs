#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { readControlledReleaseLock, verifyControlledReleaseLock } from "./controlled-release-lock-lib.mjs";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
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
      currentRefCommit: readRemoteStagingCurrentCommit(),
    });
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

function readRemoteStagingCurrentCommit() {
  try {
    const output = execFileSync(
      "git",
      ["ls-remote", "--heads", "origin", "refs/heads/codex/staging-current"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return String(output.split(/\s+/)[0] || "").toLowerCase();
  } catch {
    return "";
  }
}

export async function buildControlledReleasePostdeployReport(options = {}) {
  const release = options.lockVerification?.release ?? {};
  const lockReady = options.lockVerification?.ready === true;
  const requireApi = options.requireApi ?? release.target !== "review-site";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const baseUrl = new URL(options.baseUrl);
  const pageUrl = new URL(baseUrl);
  pageUrl.pathname = pageUrl.pathname.replace(/\/+$/, "") || "/";
  pageUrl.search = "";
  pageUrl.hash = "";
  const healthUrl = new URL(baseUrl);
  healthUrl.pathname = `${healthUrl.pathname.replace(/\/+$/, "")}/api/health`.replace(/\/api\/api\/health$/, "/api/health");
  healthUrl.search = "";
  healthUrl.hash = "";
  let html = "";
  let health = null;
  let pageOk = false;
  let healthOk = false;
  try {
    const [pageResponse, healthResponse] = await Promise.all([
      fetchImpl(pageUrl, { headers: { accept: "text/html" } }),
      fetchImpl(healthUrl, { headers: { accept: "application/json" } }),
    ]);
    pageOk = pageResponse.ok;
    healthOk = healthResponse.ok;
    html = pageOk ? await pageResponse.text() : "";
    health = healthOk ? await healthResponse.json() : null;
  } catch {
    html = "";
    health = null;
  }
  const meta = (name) => readMeta(html, name);
  const checks = [
    check("release-lock", "发布锁有效", lockReady),
    check("page", "页面可访问", pageOk),
    check("page-target", "页面目标一致", meta("erp-release-target") === release.target),
    check("page-version", "页面版本一致", meta("erp-release-version") === release.version),
    check("page-commit", "页面提交一致", meta("erp-release-commit") === release.commit),
    check("page-lock", "页面发布锁一致", meta("erp-release-lock") === release.digest),
    ...(requireApi ? [
      check("api", "API health 可访问", healthOk && health?.status === "ok"),
      check("api-release", "API 发布身份完整", health?.release?.ready === true),
      check("api-target", "API 目标一致", health?.release?.target === release.target),
      check("api-version", "API 版本一致", health?.release?.version === release.version),
      check("api-commit", "API 提交一致", health?.release?.commit === release.commit),
      check("api-lock", "API 发布锁一致", health?.release?.lockDigest === release.digest),
    ] : []),
  ];
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

function readMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(html).match(new RegExp(`<meta\\s+name=["']${escaped}["']\\s+content=["']([^"']*)["']`, "i"));
  return match?.[1] ?? "";
}

function check(key, label, ready) {
  return { key, label, ready: ready === true, status: ready === true ? "passed" : "blocked" };
}

function parseArgs(args) {
  const options = { baseUrl: "", lock: "", expectedCommit: "", expectedTarget: "", json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--base-url", "--lock", "--expected-commit", "--expected-target"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      const key = { "--base-url": "baseUrl", "--lock": "lock", "--expected-commit": "expectedCommit", "--expected-target": "expectedTarget" }[arg];
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
