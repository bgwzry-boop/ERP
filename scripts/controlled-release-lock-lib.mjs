import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { ERP_RELEASE_TARGETS } from "../shared/releaseIdentity.js";

export const controlledReleaseLockSchema = "erp-controlled-release-lock-v1";

export function inspectControlledGitState(rootDir = process.cwd()) {
  const cwd = resolve(rootDir);
  const run = (...args) => spawnSync("git", args, { cwd, encoding: "utf8" });
  const repository = run("rev-parse", "--is-inside-work-tree");
  if (repository.status !== 0 || repository.stdout.trim() !== "true") {
    return { repository: false, clean: false, commit: "", branch: "", upstream: "", upstreamCommit: "", remoteCount: 0 };
  }
  const value = (...args) => {
    const result = run(...args);
    return result.status === 0 ? result.stdout.trim() : "";
  };
  const remotes = value("remote").split(/\r?\n/).filter(Boolean);
  return {
    repository: true,
    clean: value("status", "--porcelain=v1") === "",
    commit: value("rev-parse", "HEAD").toLowerCase(),
    branch: value("symbolic-ref", "--quiet", "--short", "HEAD"),
    upstream: value("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"),
    upstreamCommit: value("rev-parse", "@{upstream}").toLowerCase(),
    remoteCount: remotes.length,
  };
}

export function buildControlledReleaseLockReport(options = {}) {
  const expectedCommit = normalizeCommit(options.expectedCommit);
  const target = normalizeTarget(options.target);
  const gitState = options.gitState ?? {};
  const checks = [
    check("git-repository", "受控 Git 仓库", gitState.repository === true),
    check("clean-worktree", "工作区无未提交修改", gitState.clean === true),
    check("full-commit", "完整 40 位提交号", /^[a-f0-9]{40}$/.test(gitState.commit ?? "")),
    check("expected-commit", "当前提交与发布提交一致", gitState.commit === expectedCommit),
    check("branch", "发布来自命名分支", Boolean(gitState.branch)),
    check("remote", "受控远端已配置", Number(gitState.remoteCount ?? 0) > 0),
    check("upstream", "当前分支已绑定远端", Boolean(gitState.upstream)),
    check("pushed", "当前提交已完整推送", gitState.commit === gitState.upstreamCommit),
  ];
  const ready = checks.every((item) => item.ready);
  const createdAt = safeTimestamp(options.createdAt ?? new Date());
  const version = normalizeVersion(options.version || `${target}-${expectedCommit.slice(0, 12)}`);
  const payload = ready
    ? {
        schemaVersion: controlledReleaseLockSchema,
        target,
        version,
        commit: expectedCommit,
        branch: normalizeBranch(gitState.branch),
        upstream: normalizeBranch(gitState.upstream),
        createdAt,
      }
    : null;
  const lock = payload ? { ...payload, digest: digestReleasePayload(payload) } : null;

  return {
    scope: "controlled_release_lock",
    status: ready ? "ready" : "blocked",
    ready,
    checks,
    summary: {
      passedCount: checks.filter((item) => item.ready).length,
      totalCount: checks.length,
      blockingCount: checks.filter((item) => !item.ready).length,
    },
    lock,
    nextAction: ready
      ? "仅允许该锁对应的完整提交进入目标环境；部署后继续核对页面与 API 版本身份。"
      : "先提交并推送全部目标修改，再从干净工作区为同一完整提交生成发布锁。",
  };
}

export function verifyControlledReleaseLock(options = {}) {
  const lock = options.lock ?? {};
  const expectedCommit = normalizeCommit(options.expectedCommit ?? lock.commit);
  const expectedTarget = normalizeTarget(options.expectedTarget ?? lock.target);
  const gitState = options.gitState;
  const payload = {
    schemaVersion: lock.schemaVersion,
    target: lock.target,
    version: lock.version,
    commit: lock.commit,
    branch: lock.branch,
    upstream: lock.upstream,
    createdAt: lock.createdAt,
  };
  const checks = [
    check("schema", "发布锁格式", lock.schemaVersion === controlledReleaseLockSchema),
    check("digest", "发布锁未被改写", lock.digest === digestReleasePayload(payload)),
    check("target", "发布目标一致", lock.target === expectedTarget),
    check("commit", "发布提交一致", lock.commit === expectedCommit),
    check("version", "发布版本有效", isValidVersion(lock.version)),
  ];
  if (gitState) {
    checks.push(
      check("checkout", "检出提交与发布锁一致", gitState.commit === expectedCommit),
      check("clean-worktree", "检出目录无额外修改", gitState.clean === true),
    );
  }
  const ready = checks.every((item) => item.ready);
  return {
    scope: "controlled_release_lock_verification",
    status: ready ? "ready" : "blocked",
    ready,
    release: {
      target: expectedTarget,
      version: isValidVersion(lock.version) ? lock.version : "",
      commit: expectedCommit,
      digest: /^[a-f0-9]{64}$/.test(lock.digest ?? "") ? lock.digest : "",
    },
    checks,
    summary: {
      passedCount: checks.filter((item) => item.ready).length,
      totalCount: checks.length,
      blockingCount: checks.filter((item) => !item.ready).length,
    },
  };
}

export function readControlledReleaseLock(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

export function digestReleasePayload(payload) {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeCommit(value) {
  const commit = String(value ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("A full 40-character commit id is required.");
  return commit;
}

function normalizeTarget(value) {
  const target = String(value ?? "").trim().toLowerCase();
  if (!ERP_RELEASE_TARGETS.includes(target)) {
    throw new Error(`Release target must be one of: ${ERP_RELEASE_TARGETS.join(", ")}.`);
  }
  return target;
}

function normalizeVersion(value) {
  const version = String(value ?? "").trim();
  if (!isValidVersion(version)) throw new Error("Release version is invalid.");
  return version;
}

function isValidVersion(value) {
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(String(value ?? "").trim());
}

function normalizeBranch(value) {
  const branch = String(value ?? "").trim();
  if (!branch || branch.length > 256 || /[\r\n\0]/.test(branch)) throw new Error("Release branch is invalid.");
  return branch;
}

function safeTimestamp(value) {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Release timestamp is invalid.");
  return timestamp.toISOString();
}

function check(key, label, ready) {
  return { key, label, ready: ready === true, status: ready === true ? "passed" : "blocked" };
}
