#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectControlledGitState } from "./controlled-release-lock-lib.mjs";
import { releasePolicy, inspectRepositoryLine, checkStagingBaseline, inspectMainWorkspace, fetchReleaseIdentity, readMeta, check, reportFromChecks } from "./release-line-lib.mjs";

export async function buildReleaseLineReport(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const { remote, report } = inspectRepositoryLine({ rootDir, candidateCommit: options.candidate, candidateBranch: options.candidateBranch, target: options.target });
  const baseline = await checkStagingBaseline(remote);
  const checks = [...report.checks, ...baseline.checks];
  if (options.expectedCommit) checks.push(check("expected-baseline", "发布事件提交与当前基线一致", remote.canonicalCommit === options.expectedCommit));
  let main;
  if (options.scope !== "repository") {
    main = inspectMainWorkspace(rootDir, options.mainDir, remote.canonicalCommit);
    checks.push(...main.report.checks);
  }
  if (options.previewUrl) {
    const preview = await fetchReleaseIdentity(options.previewUrl, { healthBaseUrl: options.previewApiUrl || "http://127.0.0.1:8787/" });
    const state = inspectControlledGitState(options.previewRoot || rootDir);
    checks.push(
      check("preview-app", "本地预览为完整 ERP 评审应用", readMeta(preview.html, "erp-app-id") === releasePolicy.previewAppId),
      check("preview-kind", "本地预览明确标记未部署", readMeta(preview.html, "erp-preview-kind") === "local-unreleased"),
      check("preview-commit", "本地预览来源与指定工作区一致", readMeta(preview.html, "erp-preview-base-commit") === state.commit),
      check("preview-dirty", "本地预览如实标记修改状态", readMeta(preview.html, "erp-preview-dirty") === String(!state.clean)),
      check("preview-api", "本地预览 API 正常", preview.health?.status === "ok"),
    );
  }
  return reportFromChecks("release_line", checks, { checkedAt: new Date().toISOString(), canonicalCommit: remote.canonicalCommit ?? "", release: baseline.release, localWorkspaceChecked: Boolean(main), previewChecked: Boolean(options.previewUrl) });
}
export function parseReleaseLineArgs(args) {
  const options = { scope: "local", rootDir: process.cwd(), target: "staging" };
  const fields = { "--scope": "scope", "--root-dir": "rootDir", "--main-dir": "mainDir", "--preview-url": "previewUrl", "--preview-api-url": "previewApiUrl", "--preview-root": "previewRoot", "--expected-commit": "expectedCommit", "--candidate": "candidate", "--candidate-branch": "candidateBranch", "--target": "target" };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--json") { options.json = true; continue; }
    if (!fields[arg] || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Invalid release check arguments.");
    options[fields[arg]] = args[++index];
  }
  if (!["local", "repository"].includes(options.scope) || !["staging", "review-site", "tencent-production"].includes(options.target)) throw new Error("Invalid release check scope or target.");
  if (Boolean(options.candidate) !== Boolean(options.candidateBranch)) throw new Error("Candidate commit and branch are required together.");
  return options;
}
export function formatReleaseLineReport(report) {
  return [`版本统一检查：${report.ready ? "通过" : "阻断"}`, ...report.checks.map((item) => `- ${item.label}：${item.ready ? "通过" : "未通过"}`), `通过 ${report.summary.passedCount}/${report.summary.totalCount}`, ""].join("\n");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseReleaseLineArgs(process.argv.slice(2));
    const report = await buildReleaseLineReport(options);
    process.stdout.write(options.json ? `${JSON.stringify(report)}\n` : formatReleaseLineReport(report));
    process.exitCode = report.ready ? 0 : 2;
  } catch { process.stderr.write("版本核对失败；请检查参数、仓库及网络。未修改分支或部署。\n"); process.exitCode = 1; }
}
