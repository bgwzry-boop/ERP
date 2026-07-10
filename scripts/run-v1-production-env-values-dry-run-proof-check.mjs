#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveProductionEnvSetupEnvFiles } from "./productionEnvSetupEnvFileResolver.mjs";
import { buildProductionEnvValuesFileFingerprint } from "./run-v1-production-env-intake-apply.mjs";
import { buildProductionEnvFileAuditReport } from "./run-v1-production-env-file-audit.mjs";

const defaultTargetEnvFile = ".erp-local-storage/v1-production-env/secure-prod.env";
const defaultApplyReportJson = ".erp-local-storage/v1-production-env-intake-apply/latest.json";
const defaultProductionEnvSetupJsonPath = ".erp-local-storage/v1-production-env-setup/latest.json";
const defaultMaxAgeHours = 24;
const timestampToleranceMs = 2000;

if (isCliEntrypoint()) runCli();

export function buildProductionEnvValuesDryRunProofReport(options = {}) {
  return buildReport(normalizeOptions(options));
}

export function formatProductionEnvValuesDryRunProofReport(report = {}) {
  const lines = [
    "# V1 production env values dry-run proof check",
    "",
    `- Status: ${report.status || "unknown"}`,
    `- Ready: ${report.ready ? "yes" : "no"}`,
    `- Checked at: ${report.checkedAt || ""}`,
    `- Summary: ${report.summary?.label || ""}`,
    `- Proof age: ${report.summary?.proofAgeHours ?? "n/a"} / ${report.summary?.maxAgeHours ?? defaultMaxAgeHours} hours`,
    `- Proof expires at: ${report.summary?.proofExpiresAt || "n/a"}`,
    `- Remaining hours: ${report.summary?.proofRemainingHours ?? "n/a"}`,
    `- Values file unchanged after proof: ${report.summary?.valuesFileUnchangedAfterProof ? "yes" : "no"}`,
    `- Values file fingerprint matched: ${report.summary?.valuesFingerprintMatched ? "yes" : "no"}`,
    `- Target env unchanged after proof: ${report.summary?.targetEnvFileUnchangedAfterProof ? "yes" : "no"}`,
    `- Projected env preflight: ${report.proof?.envPreflightReady ? "ready" : "blocked"} (${report.proof?.envPreflightPassedCount ?? 0}/${report.proof?.envPreflightTotalCount ?? 0})`,
    `- Projected minimum blocking values: ${report.proof?.minimumBlockingReady ? "ready" : "blocked"} (${report.proof?.minimumBlockingSatisfiedCount ?? 0}/${report.proof?.minimumBlockingTargetCount ?? 0})`,
    `- Projected intake required blockers: ${report.proof?.intakeMissingRequiredVariableCount ?? 0}`,
    `- Projected alternative-group blockers: ${report.proof?.intakeAlternativeGroupBlockingCount ?? 0}`,
    "",
    "## Blocking findings",
    ...(report.blockingFindings?.length
      ? report.blockingFindings.map((item) => `- ${item.label}: ${item.detail} Next: ${item.nextAction}`)
      : ["- None"]),
    "",
    "## Next actions",
    ...(report.nextActions?.length ? report.nextActions.map((item) => `- ${item}`) : ["- None"]),
    "",
    "## Safeguards",
    `- Env values exposed: ${report.safeguards?.envValuesExposed ? "yes" : "no"}`,
    `- Env file path included: ${report.safeguards?.envFilePathIncluded ? "yes" : "no"}`,
    `- Connection string exposed: ${report.safeguards?.connectionStringExposed ? "yes" : "no"}`,
    `- Secret fields exposed: ${report.safeguards?.secretFieldsExposed ? "yes" : "no"}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export function resolveProductionEnvValuesProofTargetEnvFile({
  targetEnvFile = defaultTargetEnvFile,
  targetEnvFileExplicit = false,
  useProductionEnvSetupEnvFile = false,
  productionEnvSetupJson = defaultProductionEnvSetupJsonPath,
} = {}) {
  if (targetEnvFileExplicit || !useProductionEnvSetupEnvFile) {
    return {
      targetEnvFile,
      source: targetEnvFileExplicit ? "cli" : "default",
      summary: targetEnvFileExplicit ? "命令行目标安全 env 文件" : "默认目标安全 env 文件",
      usedProductionEnvSetup: false,
    };
  }
  const setupResolution = resolveProductionEnvSetupEnvFiles({
    productionEnvSetupJsonPath: productionEnvSetupJson,
    useProductionEnvSetupEnvFile: true,
  });
  return {
    targetEnvFile: setupResolution.envFiles[0],
    source: "production_env_setup",
    summary: "已复用生产 env setup 报告中的目标安全 env 文件",
    usedProductionEnvSetup: true,
    productionEnvSetupReportFresh: setupResolution.productionEnvSetupReportFresh,
    productionEnvSetupCheckedAt: setupResolution.productionEnvSetupCheckedAt,
  };
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = buildReport(options);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatProductionEnvValuesDryRunProofReport(report));
    }
    process.exit(report.ready ? 0 : 2);
  } catch (error) {
    const message = safeText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production env values dry-run proof check failed: ${message}\n`);
    }
    process.exit(1);
  }
}

function parseArgs(args) {
  const options = normalizeOptions({});
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--values-env-file") {
      options.valuesEnvFile = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--target-env-file") {
      options.targetEnvFile = readValue(args, index, arg);
      options.targetEnvFileExplicit = true;
      index += 1;
      continue;
    }
    if (arg === "--use-production-env-setup-env-file") {
      options.useProductionEnvSetupEnvFile = true;
      continue;
    }
    if (arg === "--production-env-setup-json") {
      options.productionEnvSetupJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--apply-report-json") {
      options.applyReportJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--max-age-hours") {
      options.maxAgeHours = parseNonNegativeNumber(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.valuesEnvFile) throw new Error("--values-env-file is required.");
  return options;
}

function normalizeOptions(options) {
  return {
    valuesEnvFile: options.valuesEnvFile || "",
    targetEnvFile: options.targetEnvFile || defaultTargetEnvFile,
    targetEnvFileExplicit: Boolean(options.targetEnvFileExplicit || options.targetEnvFile),
    useProductionEnvSetupEnvFile: Boolean(options.useProductionEnvSetupEnvFile),
    productionEnvSetupJson: options.productionEnvSetupJson || defaultProductionEnvSetupJsonPath,
    applyReportJson: options.applyReportJson || defaultApplyReportJson,
    maxAgeHours:
      options.maxAgeHours === 0 || Number(options.maxAgeHours) > 0 ? Number(options.maxAgeHours) : defaultMaxAgeHours,
    json: Boolean(options.json),
  };
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function parseNonNegativeNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be zero or a positive number.`);
  return number;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-production-env-values-dry-run-proof-check.mjs --values-env-file <secure-values-env-fragment> [options]",
    "",
    "Options:",
    "  --values-env-file <path>   Secure env fragment that will be formally merged. Required.",
    "  --target-env-file <path>   Target secure production env draft.",
    "  --use-production-env-setup-env-file",
    "                             Reuse the target secure env file recorded by production env setup when no --target-env-file is passed.",
    "  --production-env-setup-json <path>",
    "                             Production env setup JSON. Defaults to .erp-local-storage/v1-production-env-setup/latest.json.",
    "  --apply-report-json <path> Dry-run apply report. Defaults to .erp-local-storage/v1-production-env-intake-apply/latest.json.",
    "  --max-age-hours <n>        Maximum dry-run proof age. Defaults to 24; 0 disables age blocking.",
    "  --json                     Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  Dry-run proof is fresh and still matches unchanged values / target files.",
    "  1  Runner error.",
    "  2  Dry-run proof is missing, stale, incomplete, or files changed after proof.",
    "",
    "This runner never prints env values, env file paths, connection strings, object-storage values, command values, spool paths, tokens, or raw env lines.",
  ].join("\n");
}

function buildReport(options) {
  const checkedAt = new Date().toISOString();
  const valuesEnvFile = resolve(options.valuesEnvFile);
  const targetResolution = resolveProductionEnvValuesProofTargetEnvFile(options);
  const targetEnvFile = resolve(targetResolution.targetEnvFile);
  const applyReportJson = resolve(options.applyReportJson);
  const blockingFindings = [];
  const warningFindings = [];

  const valuesExists = existsSync(valuesEnvFile);
  const targetExists = existsSync(targetEnvFile);
  const reportExists = existsSync(applyReportJson);
  if (!valuesExists) {
    blockingFindings.push(finding("values-env-file-missing", "真实值 env 片段", "真实值 env 片段不存在；报告不会输出真实路径。", "先创建安全未跟踪真实值片段并完成 dry-run。"));
  }
  if (!targetExists) {
    blockingFindings.push(finding("target-env-file-missing", "目标安全 env 文件", "目标安全 env 文件不存在；报告不会输出真实路径。", "先运行 production env setup 生成安全 env 草稿。"));
  }
  if (!reportExists) {
    blockingFindings.push(finding("dry-run-report-missing", "真实值 dry-run 报告", "未找到真实值 dry-run 报告。", "先执行真实值合并 dry-run，并确认输出 latest.json。"));
  }

  const valuesAudit = valuesExists ? safeAudit(valuesEnvFile, "values-env-file-audit", blockingFindings) : null;
  const currentValuesFingerprint = valuesExists ? safeValuesFingerprint(valuesEnvFile, blockingFindings) : null;
  const targetAudit = targetExists ? safeAudit(targetEnvFile, "target-env-file-audit", blockingFindings) : null;
  const proof = reportExists ? readDryRunProof(applyReportJson, blockingFindings) : null;
  const proofCheckedAtMs = proof?.checkedAtMs ?? null;
  const freshness = buildFreshness({ checkedAtMs: proofCheckedAtMs, nowMs: Date.now(), maxAgeHours: options.maxAgeHours });
  if (proof && freshness.ready !== true) {
    blockingFindings.push(finding("dry-run-proof-stale", "真实值 dry-run 时效", freshness.label, "重新执行真实值合并 dry-run 后再正式合并。"));
  }

  const valuesFingerprintCompared = Boolean(currentValuesFingerprint?.digest && proof?.valuesEnvFileFingerprintDigest && proof?.valuesEnvFileFingerprintValid);
  const valuesFingerprintMatched = valuesFingerprintCompared && proof.valuesEnvFileFingerprintDigest === currentValuesFingerprint.digest;
  if (proof && currentValuesFingerprint?.digest && proof.valuesEnvFileFingerprintValid) {
    if (proof.valuesEnvFileFingerprintAlgorithm !== currentValuesFingerprint.algorithm) {
      blockingFindings.push(
        finding("values-env-file-fingerprint-algorithm-mismatch", "真实值 env 片段指纹", "当前真实值 env 片段与 dry-run 报告记录的指纹算法不一致。", "使用当前脚本重新执行真实值合并 dry-run。"),
      );
    } else if (!valuesFingerprintMatched) {
      blockingFindings.push(
        finding("values-env-file-fingerprint-mismatch", "真实值 env 片段指纹", "当前真实值 env 片段与 dry-run 报告记录的片段指纹不一致。", "重新执行当前真实值片段的 dry-run，确认通过后再正式合并。"),
      );
    }
  }

  const valuesChangedAfterProof = valuesExists && proofCheckedAtMs !== null && fileChangedAfter(valuesEnvFile, proofCheckedAtMs);
  const targetChangedAfterProof = targetExists && proofCheckedAtMs !== null && fileChangedAfter(targetEnvFile, proofCheckedAtMs);
  if (valuesChangedAfterProof) {
    blockingFindings.push(
      finding("values-env-file-newer-than-dry-run", "真实值 env 片段新鲜度", "真实值 env 片段在 dry-run 后发生过修改。", "重新执行 dry-run，确认修改后的片段仍能通过后再正式合并。"),
    );
  }
  if (targetChangedAfterProof) {
    blockingFindings.push(
      finding("target-env-file-newer-than-dry-run", "目标安全 env 文件新鲜度", "目标安全 env 文件在 dry-run 后发生过修改。", "重新执行 dry-run，确认当前目标 env 仍能通过后再正式合并。"),
    );
  }
  if (proof && targetResolution.usedProductionEnvSetup && proof.targetFromProductionSetup !== true) {
    blockingFindings.push(
      finding("dry-run-target-source-mismatch", "dry-run 目标来源", "当前正式合并复用 production env setup，但 dry-run 证明不是同一路径生成。", "用 --use-production-env-setup-env-file 重新执行 dry-run。"),
    );
  }
  if (proof && !targetResolution.usedProductionEnvSetup && proof.targetFromProductionSetup === true) {
    warningFindings.push(
      warning("dry-run-target-source-different-mode", "dry-run 目标来源", "dry-run 使用 production env setup，当前正式合并使用显式 / 默认目标 env。", "建议正式合并也复用 production env setup，或重新按显式目标路径 dry-run。"),
    );
  }

  const ready = blockingFindings.length === 0;
  return {
    scope: "v1_production_env_values_dry_run_proof_check",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt,
    summary: {
      label: ready
        ? "真实值 dry-run 证明有效，正式合并可继续"
        : `${blockingFindings.length} 项阻塞，正式合并前必须重新 dry-run 或修正文件。`,
      maxAgeHours: options.maxAgeHours,
      proofCheckedAt: proof?.checkedAt || "",
      proofAgeHours: freshness.ageHours,
      proofExpiresAt: freshness.expiresAt,
      proofRemainingHours: freshness.remainingHours,
      proofFresh: freshness.ready === true,
      valuesFileUnchangedAfterProof: !valuesChangedAfterProof,
      valuesFingerprintIncluded: Boolean(proof?.valuesEnvFileFingerprintDigest),
      valuesFingerprintMatched,
      targetEnvFileUnchangedAfterProof: !targetChangedAfterProof,
      valuesAuditReady: valuesAudit?.ready === true,
      targetAuditReady: targetAudit?.ready === true,
      targetEnvFileFromProductionSetup: targetResolution.usedProductionEnvSetup,
      blockingCount: blockingFindings.length,
      warningCount: warningFindings.length,
    },
    proof: {
      included: Boolean(proof),
      status: proof?.status || "missing",
      checkedAt: proof?.checkedAt || "",
      dryRun: proof?.dryRun === true,
      targetWouldBeWritten: proof?.targetWouldBeWritten === true,
      targetFromProductionSetup: proof?.targetFromProductionSetup === true,
      envPreflightReady: proof?.envPreflightReady === true,
      envPreflightPassedCount: proof?.envPreflightPassedCount ?? 0,
      envPreflightTotalCount: proof?.envPreflightTotalCount ?? 0,
      envPreflightBlockingCount: proof?.envPreflightBlockingCount ?? 0,
      intakeMissingRequiredVariableCount: proof?.intakeMissingRequiredVariableCount ?? 0,
      intakeAlternativeGroupBlockingCount: proof?.intakeAlternativeGroupBlockingCount ?? 0,
      minimumBlockingReady: proof?.minimumBlockingReady === true,
      minimumBlockingSatisfiedCount: proof?.minimumBlockingSatisfiedCount ?? 0,
      minimumBlockingTargetCount: proof?.minimumBlockingTargetCount ?? 0,
      minimumBlockingMissingCount: proof?.minimumBlockingMissingCount ?? 0,
      minimumBlockingTargetSignatureIncluded: Boolean(proof?.minimumBlockingTargetSignature),
      valuesEnvFileFingerprintIncluded: Boolean(proof?.valuesEnvFileFingerprintDigest),
      valuesEnvFileFingerprintValid: proof?.valuesEnvFileFingerprintValid === true,
      valuesEnvFileFingerprintAlgorithm: proof?.valuesEnvFileFingerprintAlgorithm || "",
      valuesEnvFileFingerprintDigestIncluded: false,
    },
    valuesEnvFile: {
      pathIncluded: false,
      exists: valuesExists,
      auditReady: valuesAudit?.ready === true,
      auditStatus: valuesAudit?.status || "not_run",
      changedAfterDryRunProof: valuesChangedAfterProof,
      fingerprintCalculated: Boolean(currentValuesFingerprint?.digest),
      fingerprintDigestIncluded: false,
      fingerprintPathIncluded: false,
      fingerprintValuesIncluded: false,
    },
    targetEnvFile: {
      pathIncluded: false,
      exists: targetExists,
      source: targetResolution.source,
      sourceLabel: targetResolution.summary,
      fromProductionSetup: targetResolution.usedProductionEnvSetup,
      auditReady: targetAudit?.ready === true,
      auditStatus: targetAudit?.status || "not_run",
      changedAfterDryRunProof: targetChangedAfterProof,
    },
    applyReport: {
      pathIncluded: false,
      exists: reportExists,
      parsed: Boolean(proof),
    },
    blockingFindings,
    warningFindings,
    nextActions: buildNextActions({ ready, blockingFindings, warningFindings }),
    safeguards: {
      envValuesExposed: false,
      envFilePathIncluded: false,
      valuesEnvFilePathIncluded: false,
      targetEnvFilePathIncluded: false,
      applyReportPathIncluded: false,
      connectionStringExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      spoolPathExposed: false,
      tokenIncluded: false,
      rawEnvLineIncluded: false,
      targetFileReadFromProductionSetup: targetResolution.usedProductionEnvSetup,
      fileMtimeComparedToDryRunProof: true,
      valuesEnvFileFingerprintCompared: valuesFingerprintCompared,
      valuesEnvFileFingerprintDigestExposed: false,
      valuesEnvFileFingerprintValuesExposed: false,
    },
  };
}

function safeAudit(envFile, key, blockingFindings) {
  try {
    const audit = buildProductionEnvFileAuditReport({ envFiles: [envFile] });
    if (!audit.ready) {
      blockingFindings.push(
        finding(
          key,
          "env 文件安全审计",
          `${audit.summary?.blockingCount ?? 0} 项 env 文件安全审计阻塞。`,
          "先修正 env 文件安全审计阻塞，再重新执行 dry-run。",
        ),
      );
    }
    return {
      status: audit.status,
      ready: audit.ready === true,
      blockingCount: audit.summary?.blockingCount ?? 0,
      warningCount: audit.summary?.warningCount ?? 0,
    };
  } catch {
    blockingFindings.push(finding(key, "env 文件安全审计", "env 文件安全审计失败；报告不会输出真实路径。", "确认文件存在、可读且位于安全未跟踪位置。"));
    return { status: "error", ready: false, blockingCount: 1, warningCount: 0 };
  }
}

function safeValuesFingerprint(envFile, blockingFindings) {
  try {
    return buildProductionEnvValuesFileFingerprint(envFile);
  } catch {
    blockingFindings.push(
      finding(
        "values-env-file-fingerprint-unreadable",
        "真实值 env 片段指纹",
        "无法计算真实值 env 片段指纹；报告不会输出真实路径。",
        "确认真实值片段存在、可读且位于安全未跟踪位置，然后重新 dry-run。",
      ),
    );
    return null;
  }
}

function readDryRunProof(path, blockingFindings) {
  let report = null;
  try {
    report = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    blockingFindings.push(finding("dry-run-report-invalid-json", "真实值 dry-run 报告", "真实值 dry-run 报告不是可读 JSON。", "重新执行 dry-run 生成 latest.json。"));
    return null;
  }
  const projection = report?.dryRunProjection || {};
  const preflight = projection.productionEnvPreflight || {};
  const intake = projection.intakeCoverage || {};
  const minimum = projection.minimumBlockingCoverage || {};
  const sourceFingerprint = report?.sourceEnvFile?.fingerprint || projection.valuesEnvFileFingerprint || {};
  const fingerprintAlgorithm = String(sourceFingerprint.algorithm || "");
  const fingerprintDigest = String(sourceFingerprint.digest || "").trim();
  const fingerprintValid =
    sourceFingerprint.digestIncluded === true &&
    fingerprintAlgorithm === "sha256" &&
    isSha256HexDigest(fingerprintDigest) &&
    sourceFingerprint.pathIncluded === false &&
    sourceFingerprint.envValuesIncluded === false &&
    sourceFingerprint.rawEnvLineIncluded === false;
  const checkedAtMs = parseCheckedAt(report.checkedAt);
  if (report.scope !== "v1_production_env_real_value_intake_apply") {
    blockingFindings.push(finding("dry-run-report-scope-invalid", "真实值 dry-run 报告 scope", "dry-run 报告 scope 不匹配。", "重新执行真实值合并 dry-run。"));
  }
  if (report.dryRun !== true || report.status !== "dry_run") {
    blockingFindings.push(finding("dry-run-report-not-dry-run", "真实值 dry-run 报告状态", "latest 报告不是 dry-run 结果。", "正式合并前必须先生成 dry-run 报告。"));
  }
  if (projection.targetWouldBeWritten === true) {
    blockingFindings.push(finding("dry-run-report-target-write", "真实值 dry-run 写入护栏", "dry-run 报告显示目标 env 可能被写入。", "重新执行带 --dry-run 的真实值合并命令。"));
  }
  if (preflight.ready !== true) {
    blockingFindings.push(finding("dry-run-projected-env-preflight-blocked", "预计生产 env 预检", "dry-run 预计生产 env 预检仍未 ready。", "补齐真实值片段后重新 dry-run。"));
  }
  if (Number(intake.missingRequiredVariableCount ?? 0) > 0 || Number(intake.alternativeGroupBlockingCount ?? 0) > 0) {
    blockingFindings.push(finding("dry-run-projected-intake-blocked", "预计真实值 intake", "dry-run 预计 intake 仍有必填缺失或任选组冲突。", "修正真实值片段后重新 dry-run。"));
  }
  if (minimum.ready !== true || Number(minimum.missingCount ?? 0) > 0 || Number(minimum.targetCount ?? 0) <= 0) {
    blockingFindings.push(finding("dry-run-projected-minimum-blocking-missing", "预计最小阻塞补值", "dry-run 未证明当前最小阻塞补值路径已补齐。", "按最小片段补齐后重新 dry-run。"));
  }
  if (!minimum.targetSignature) {
    blockingFindings.push(finding("dry-run-target-signature-missing", "dry-run 目标签名", "dry-run 报告缺少当前最小补值路径签名。", "使用当前脚本重新执行 dry-run。"));
  }
  if (!fingerprintDigest) {
    blockingFindings.push(finding("dry-run-values-fingerprint-missing", "dry-run 真实值片段指纹", "dry-run 报告缺少真实值片段指纹。", "使用当前脚本重新执行真实值合并 dry-run。"));
  } else if (!fingerprintValid) {
    blockingFindings.push(
      finding(
        "dry-run-values-fingerprint-invalid",
        "dry-run 真实值片段指纹",
        "dry-run 报告中的真实值片段指纹无效或缺少脱敏护栏。",
        "使用当前脚本重新执行真实值合并 dry-run。",
      ),
    );
  }
  if (checkedAtMs === null) {
    blockingFindings.push(finding("dry-run-checked-at-missing", "dry-run 检查时间", "dry-run 报告缺少有效 checkedAt。", "重新执行 dry-run。"));
  }
  return {
    status: report.status || "unknown",
    checkedAt: report.checkedAt || "",
    checkedAtMs,
    dryRun: report.dryRun === true,
    targetWouldBeWritten: projection.targetWouldBeWritten === true,
    targetFromProductionSetup: report.targetEnvFile?.fromProductionSetup === true,
    envPreflightReady: preflight.ready === true,
    envPreflightPassedCount: preflight.passedCount ?? 0,
    envPreflightTotalCount: preflight.totalCount ?? 0,
    envPreflightBlockingCount: preflight.blockingCount ?? 0,
    intakeMissingRequiredVariableCount: intake.missingRequiredVariableCount ?? 0,
    intakeAlternativeGroupBlockingCount: intake.alternativeGroupBlockingCount ?? 0,
    minimumBlockingReady: minimum.ready === true,
    minimumBlockingSatisfiedCount: minimum.satisfiedCount ?? 0,
    minimumBlockingTargetCount: minimum.targetCount ?? 0,
    minimumBlockingMissingCount: minimum.missingCount ?? 0,
    minimumBlockingTargetSignature: minimum.targetSignature || "",
    valuesEnvFileFingerprintAlgorithm: fingerprintAlgorithm,
    valuesEnvFileFingerprintDigest: fingerprintValid ? fingerprintDigest : "",
    valuesEnvFileFingerprintValid: fingerprintValid,
  };
}

function isSha256HexDigest(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ""));
}

function parseCheckedAt(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : null;
}

function buildFreshness({ checkedAtMs, nowMs, maxAgeHours }) {
  if (checkedAtMs === null) {
    return {
      ready: false,
      label: "dry-run 证明缺少有效检查时间。",
      ageHours: null,
      expiresAt: "",
      remainingHours: null,
    };
  }
  if (maxAgeHours === 0) {
    return {
      ready: true,
      label: "dry-run 证明时效检查已关闭。",
      ageHours: roundHours((nowMs - checkedAtMs) / 3_600_000),
      expiresAt: "",
      remainingHours: null,
    };
  }
  const maxAgeMs = maxAgeHours * 3_600_000;
  const ageMs = nowMs - checkedAtMs;
  const expiresAtMs = checkedAtMs + maxAgeMs;
  const ready = ageMs >= 0 && ageMs <= maxAgeMs;
  return {
    ready,
    label: ready ? "dry-run 证明仍在有效期内。" : "dry-run 证明已过期或检查时间晚于当前时间。",
    ageHours: roundHours(ageMs / 3_600_000),
    expiresAt: new Date(expiresAtMs).toISOString(),
    remainingHours: roundHours((expiresAtMs - nowMs) / 3_600_000),
  };
}

function fileChangedAfter(path, checkedAtMs) {
  try {
    return statSync(path).mtimeMs - checkedAtMs > timestampToleranceMs;
  } catch {
    return true;
  }
}

function finding(key, label, detail, nextAction) {
  return {
    key,
    label,
    severity: "blocking",
    detail,
    nextAction,
  };
}

function warning(key, label, detail, nextAction) {
  return {
    key,
    label,
    severity: "warning",
    detail,
    nextAction,
  };
}

function buildNextActions({ ready, blockingFindings, warningFindings }) {
  if (ready) {
    return warningFindings.length
      ? ["dry-run 证明可用于正式合并；建议同时复核 warning 后继续第一阶段。"]
      : ["dry-run 证明有效，可继续执行正式合并并进入生产环境 / 持久化第一阶段。"];
  }
  return [
    ...(blockingFindings || []).slice(0, 4).map((item) => item.nextAction),
    "重新执行真实值合并 dry-run 后，再运行正式合并命令。",
  ].filter(Boolean);
}

function roundHours(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function safeText(value) {
  return String(value || "")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "<redacted-database-url>")
    .replace(/(AKIA|ASIA)[A-Z0-9_/-]+/g, "<redacted-access-key>")
    .replace(/[A-Za-z0-9+/=]{24,}/g, "<redacted-sensitive-token>")
    .replace(/\/(?:private|Users|tmp|var)\/[^\s"']+/g, "<redacted-path>")
    .replace(/\.erp-local-storage\/[^\s"']+/g, "<redacted-local-path>");
}
