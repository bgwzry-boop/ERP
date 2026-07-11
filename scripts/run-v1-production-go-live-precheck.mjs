#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvironment } from "./run-v1-production-env-preflight.mjs";
import {
  defaultProductionEnvSetupJsonPath,
  productionEnvFileSourceLabel,
  resolveProductionEnvSetupEnvFiles,
} from "./productionEnvSetupEnvFileResolver.mjs";

const defaultApiBaseUrl = "http://127.0.0.1:8787/api";
const defaultProductionEnvIntakeCsvPath = resolve(
  ".erp-local-storage/v1-production-env-setup/production-env-real-value-intake.csv",
);
const productionEnvFileAuditScript = resolve("scripts/run-v1-production-env-file-audit.mjs");
const productionEnvIntakeVerifyScript = resolve("scripts/run-v1-production-env-intake-verify.mjs");
const productionEnvPreflightScript = resolve("scripts/run-v1-production-env-preflight.mjs");
const v1ReadinessScript = resolve("scripts/run-v1-readiness-check.mjs");

export function buildProductionGoLivePrecheckReport({
  checkedAt = new Date().toISOString(),
  envFileAudit,
  envIntakeVerification,
  envPreflight,
  runtimeReadiness,
  envFileCount = 0,
  envFileSource = envFileCount > 0 ? "cli" : "none",
  envFileSourceSummary = envFileCount > 0 ? `${envFileCount} 个命令行 env 文件` : "未传入 env 文件",
  envFileFromProductionSetup = false,
} = {}) {
  const envFileAuditStage = buildStage({
    key: "production-env-file-audit",
    label: "生产 env 文件安全审计",
    report: envFileAudit,
    readyStatuses: ["passed"],
  });
  const envIntakeVerificationStage = buildStage({
    key: "production-env-intake-verify",
    label: "生产 env 真实值 intake 校验",
    report: envIntakeVerification,
    readyStatuses: ["ready", "ready_with_warnings"],
  });
  const envPreflightStage = buildStage({
    key: "production-env-preflight",
    label: "生产 env 变量预检",
    report: envPreflight,
    readyStatuses: ["ready"],
  });
  const runtimeReadinessStage = buildStage({
    key: "runtime-v1-readiness",
    label: "当前 API V1 总门禁",
    report: runtimeReadiness,
    readyStatuses: ["ready"],
  });
  const runtimeProductionProfileStage = buildRuntimeProductionProfileStage(runtimeReadiness);
  const stages = [
    envFileAuditStage,
    envIntakeVerificationStage,
    envPreflightStage,
    runtimeReadinessStage,
    runtimeProductionProfileStage,
  ];
  const passedCount = stages.filter((stage) => stage.status === "passed").length;
  const blockingCount = stages.length - passedCount;
  const ready = blockingCount === 0;
  const fixChecklist = sanitizeFixChecklist(envPreflight?.fixChecklist).slice(0, 12);
  const unblockChecklist = buildUnblockChecklist({ stages, fixChecklist });
  const fieldEvidenceCoverage = buildFieldEvidenceCoverage({ stages, envIntakeVerification, envPreflight, runtimeReadiness });
  const fromProductionSetup = Boolean(envFileFromProductionSetup || envFileSource === "production_env_setup");
  return {
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt,
    scope: "v1_production_go_live_precheck",
    envFileCount,
    envFileSource,
    envFileSourceLabel: productionEnvFileSourceLabel(envFileSource),
    envFileSourceSummary,
    envFileFromProductionSetup: fromProductionSetup,
    summary: {
      label: `${passedCount}/${stages.length} 通过`,
      passedCount,
      totalCount: stages.length,
      blockingCount,
      warningCount: stages.reduce((total, stage) => total + numberOrZero(stage.summary.warningCount), 0),
      envFileSource,
      envFileSourceLabel: productionEnvFileSourceLabel(envFileSource),
      envFileFromProductionSetup: fromProductionSetup,
    },
    stages,
    blockingStages: stages.filter((stage) => stage.status !== "passed"),
    runtimeReadiness: sanitizeRuntimeReadiness(runtimeReadiness),
    fixChecklist,
    unblockChecklist,
    fieldEvidenceCoverage,
    safeguards: buildSafeguards(runtimeReadiness, { envFileFromProductionSetup: fromProductionSetup }),
    nextActions: buildNextActions({ stages, fixChecklist }),
  };
}

export function formatProductionGoLivePrecheckReport(report) {
  const lines = [
    `V1 production go-live precheck: ${report.ready ? "READY" : "BLOCKED"} (${report.summary.label})`,
    `Env files checked: ${numberOrZero(report.envFileCount)}`,
    `Env file source: ${report.envFileSourceLabel || productionEnvFileSourceLabel(report.envFileSource)}`,
    "",
    "Stages:",
  ];
  for (const stage of report.stages) {
    lines.push(`- ${stage.status === "passed" ? "PASSED" : "BLOCKED"} ${stage.label}: ${stage.summary.label}`);
    for (const item of stage.blockingItems.slice(0, 3)) {
      lines.push(`  - ${item.label}: ${item.detail || item.status}`);
    }
  }
  if (report.fixChecklist.length > 0) {
    lines.push("", "Production env fix checklist:");
    for (const item of report.fixChecklist.slice(0, 6)) {
      const missing = item.missingVariables.length > 0 ? `；需补：${item.missingVariables.join(", ")}` : "";
      const placeholders =
        item.placeholderVariableCount > 0 ? `；占位未替换：${item.placeholderVariables.join(", ")}` : "";
      lines.push(`- ${item.severity.toUpperCase()} ${item.ownerRole} · ${item.label}：${item.nextAction}${missing}${placeholders}`);
      if (item.valueGuidance.length > 0) lines.push(`  - 填写提示：${item.valueGuidance[0]}`);
      if (item.verificationSteps.length > 0) lines.push(`  - 复核步骤：${item.verificationSteps[0]}`);
    }
  }
  if (report.unblockChecklist.length > 0) {
    lines.push("", "Stage unblock checklist:");
    for (const item of report.unblockChecklist) {
      lines.push(`- ${item.ready ? "READY" : "BLOCKED"} ${item.stageOrder}. ${item.label} · ${item.ownerRole}：${item.nextAction}`);
      if (item.verificationSteps.length > 0) lines.push(`  - Verify: ${item.verificationSteps[0]}`);
      if (item.evidenceToKeep.length > 0) lines.push(`  - Evidence: ${item.evidenceToKeep[0]}`);
    }
  }
  if (report.fieldEvidenceCoverage?.items?.length > 0) {
    lines.push("", `Field evidence coverage: ${report.fieldEvidenceCoverage.summary.reportSupportedLabel}`);
    for (const item of report.fieldEvidenceCoverage.items.slice(0, 6)) {
      lines.push(`- ${item.statusLabel} ${item.groupLabel} / ${item.itemLabel}: ${item.nextAction}`);
    }
  }
  lines.push(
    "",
    "Safeguards:",
    `- Non-mutating: ${yesNo(report.safeguards.nonMutating)}`,
    `- Env values exposed: ${yesNo(report.safeguards.envValuesExposed)}`,
    `- Env file read from production setup: ${yesNo(report.safeguards.envFileReadFromProductionSetup)}`,
    `- Production env applied to current process: ${yesNo(report.safeguards.productionEnvAppliedToProcess)}`,
    `- Release candidate refreshed: ${yesNo(report.safeguards.releaseCandidateRefreshed)}`,
    `- Go-live suite refreshed: ${yesNo(report.safeguards.goLiveSuiteRefreshed)}`,
    `- Physical printer called: ${yesNo(report.safeguards.physicalPrinterCalled)}`,
  );
  if (report.nextActions.length > 0) {
    lines.push("", "Next actions:");
    for (const action of report.nextActions.slice(0, 8)) lines.push(`- ${action}`);
  }
  lines.push("");
  return lines.join("\n");
}

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const env = loadEnvironment({ envFiles: options.envFiles, baseEnv: process.env });
    const apiBaseUrl = normalizeApiBaseUrl(
      options.apiBaseUrl || env.ERP_V1_READINESS_API_BASE_URL || env.VITE_ERP_API_BASE_URL || defaultApiBaseUrl,
    );
    const operatorId = cleanString(options.operatorId || env.ERP_V1_READINESS_OPERATOR_ID || "U-OFFICE-A");
    const driverOperatorId = cleanString(
      options.driverOperatorId || env.ERP_V1_READINESS_DRIVER_OPERATOR_ID || "U-DRIVER-A",
    );
    const childEnv = {
      ...env,
      ERP_V1_READINESS_API_BASE_URL: apiBaseUrl,
      ERP_V1_READINESS_OPERATOR_ID: operatorId,
      ERP_V1_READINESS_DRIVER_OPERATOR_ID: driverOperatorId,
    };
    if (options.bearerToken) childEnv.ERP_V1_READINESS_TOKEN = options.bearerToken;
    if (options.driverBearerToken) childEnv.ERP_V1_READINESS_DRIVER_TOKEN = options.driverBearerToken;
    const envFileArgs = options.envFiles.flatMap((envFile) => ["--env-file", envFile]);
    const setupCapableEnvFileArgs = options.envFileFromProductionSetup
      ? ["--use-production-env-setup-env-file", "--production-env-setup-json", options.productionEnvSetupJsonPath]
      : envFileArgs;

    const envFileAudit = await runJsonScript({
      script: productionEnvFileAuditScript,
      args: envFileArgs,
      env: childEnv,
    });
    const envIntakeVerification = await runJsonScript({
      script: productionEnvIntakeVerifyScript,
      args: [
        ...setupCapableEnvFileArgs,
        "--intake-csv",
        options.productionEnvIntakeCsvPath,
        "--no-write",
      ],
      env: childEnv,
    });
    const envPreflight = await runJsonScript({
      script: productionEnvPreflightScript,
      args: setupCapableEnvFileArgs,
      env: childEnv,
    });
    const runtimeReadiness = await runJsonScript({
      script: v1ReadinessScript,
      args: [
        "--api-base-url",
        apiBaseUrl,
        "--operator-id",
        operatorId,
        "--driver-operator-id",
        driverOperatorId,
      ],
      env: childEnv,
    });
    const report = buildProductionGoLivePrecheckReport({
      checkedAt: new Date().toISOString(),
      envFileAudit,
      envIntakeVerification,
      envPreflight,
      runtimeReadiness,
      envFileCount: options.envFiles.length,
      envFileSource: options.envFileSource,
      envFileSourceSummary: options.envFileSourceSummary,
      envFileFromProductionSetup: options.envFileFromProductionSetup,
    });
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatProductionGoLivePrecheckReport(report));
    }
    process.exitCode = report.ready ? 0 : 2;
  } catch (error) {
    const message = error?.message || String(error);
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production go-live precheck failed: ${message}\n`);
    }
    process.exitCode = 1;
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = {
    envFiles: [],
    productionEnvIntakeCsvPath: defaultProductionEnvIntakeCsvPath,
    productionEnvSetupJsonPath: defaultProductionEnvSetupJsonPath,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--env-file") {
      options.envFiles.push(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--use-production-env-setup-env-file") {
      options.useProductionEnvSetupEnvFile = true;
      continue;
    }
    if (arg === "--production-env-setup-json") {
      options.productionEnvSetupJsonPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--api-base-url") {
      options.apiBaseUrl = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-env-intake-csv") {
      options.productionEnvIntakeCsvPath = resolve(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--operator-id") {
      options.operatorId = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--driver-operator-id") {
      options.driverOperatorId = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--bearer-token") {
      options.bearerToken = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--driver-bearer-token") {
      options.driverBearerToken = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  const envFileResolution = resolveProductionEnvSetupEnvFiles({
    envFiles: options.envFiles,
    productionEnvSetupJsonPath: options.productionEnvSetupJsonPath,
    useProductionEnvSetupEnvFile: options.useProductionEnvSetupEnvFile,
  });
  options.envFiles = envFileResolution.envFiles;
  options.envFileSource = envFileResolution.source;
  options.envFileSourceSummary = envFileResolution.summary;
  options.envFileFromProductionSetup = envFileResolution.usedProductionEnvSetup;
  if (options.envFiles.length === 0) throw new Error("--env-file or --use-production-env-setup-env-file is required.");
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-production-go-live-precheck.mjs --env-file <secure-env-file> [options]",
    "   or: node scripts/run-v1-production-go-live-precheck.mjs --use-production-env-setup-env-file [options]",
    "",
    "Options:",
    "  --env-file <path>            Secure, untracked production env file. Can be repeated.",
    "  --use-production-env-setup-env-file",
    "                               Reuse the secure env file recorded by production env setup.",
    "  --production-env-setup-json <path>",
    "                               Production env setup JSON. Defaults to .erp-local-storage/v1-production-env-setup/latest.json.",
    "  --production-env-intake-csv <path>",
    "                               Production env real-value intake checklist CSV; defaults to setup output.",
    "  --api-base-url <url>         Running ERP API base URL; defaults to env file or localhost.",
    "  --operator-id <id>           Office / management validation user; defaults to env file or U-OFFICE-A.",
    "  --driver-operator-id <id>    Driver validation user; defaults to env file or U-DRIVER-A.",
    "  --bearer-token <token>       Deprecated compatibility input; prefer ERP_V1_READINESS_TOKEN in secure env.",
    "  --driver-bearer-token <token> Optional driver bearer token; passed through env, not printed.",
    "  --json                       Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  Production env file, real-value intake, env variables, runtime readiness, and production runtime profile are ready",
    "  1  Runner/API/read error",
    "  2  Checks are readable but still blocked for V1 production go-live",
    "",
    "This precheck is read-only. It does not apply env files, refresh release candidates, run the go-live suite, or print.",
  ].join("\n");
}

function normalizeApiBaseUrl(value) {
  const normalized = cleanString(value).replace(/\/+$/, "");
  if (!normalized) throw new Error("API base URL is required.");
  return normalized;
}

function runJsonScript({ script, args = [], env }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...args, "--json"], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${script} timed out after 30000ms`));
    }, 30000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      let parsed;
      try {
        parsed = JSON.parse(stdout || "{}");
      } catch {
        reject(new Error(`${script} returned non-JSON output with exit ${status}`));
        return;
      }
      if (status === 1 || parsed.status === "error") {
        const message = parsed.error?.message || stderr.trim() || `${script} failed with exit ${status}`;
        reject(new Error(message));
        return;
      }
      if (status !== 0 && status !== 2) {
        reject(new Error(`${script} exited with unsupported status ${status}`));
        return;
      }
      resolvePromise(parsed);
    });
  });
}

function buildStage({ key, label, report, readyStatuses }) {
  const ready = report?.ready === true || readyStatuses.includes(cleanString(report?.status));
  const summary = {
    label: cleanString(report?.summary?.label) || (ready ? "ready" : "blocked"),
    passedCount: numberOrZero(report?.summary?.passedCount),
    totalCount: numberOrZero(report?.summary?.totalCount),
    blockingCount: numberOrZero(report?.summary?.blockingCount),
    warningCount: numberOrZero(report?.summary?.warningCount),
  };
  const blockingItems = sanitizeBlockingItems(
    report?.blockingCriteria || report?.blockingFindings || report?.blockingItems || [],
  );
  return {
    key,
    label,
    status: ready ? "passed" : "pending",
    sourceStatus: cleanString(report?.status || "unknown"),
    ready,
    summary,
    blockingItems,
    nextActions: stringList(report?.nextActions).slice(0, 8),
  };
}

function buildRuntimeProductionProfileStage(runtimeReadiness = {}) {
  const checks = buildRuntimeProductionProfileChecks(runtimeReadiness);
  const passedCount = checks.filter((item) => item.status === "passed").length;
  const blockingItems = checks.filter((item) => item.blocking && item.status !== "passed");
  return {
    key: "runtime-production-profile",
    label: "当前 API 生产 profile 确认",
    status: blockingItems.length === 0 ? "passed" : "pending",
    sourceStatus: runtimeReadiness?.status || "unknown",
    ready: blockingItems.length === 0,
    summary: {
      label: `${passedCount}/${checks.length} 通过`,
      passedCount,
      totalCount: checks.length,
      blockingCount: blockingItems.length,
      warningCount: 0,
    },
    blockingItems: blockingItems.map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      detail: item.detail,
    })),
    checks,
    nextActions:
      blockingItems.length === 0
        ? ["当前 API 已满足生产 profile 约束，可继续生成 release candidate 并留档。"]
        : blockingItems.map((item) => `${item.label}：${item.detail}`).slice(0, 8),
  };
}

function buildRuntimeProductionProfileChecks(runtimeReadiness = {}) {
  const productionEnvFileApplication = runtimeReadiness?.productionEnvFileApplication || {};
  const systemPersistence = runtimeReadiness?.systemPersistence || {};
  const runtimeEmployeeAccounts = systemPersistence.runtimeEmployeeAccountReadiness || {};
  const attachmentReadiness = runtimeReadiness?.attachmentReadiness || {};
  const attachmentStorage = runtimeReadiness?.attachmentStorage || {};
  const repositories = Array.isArray(systemPersistence.repositories) ? systemPersistence.repositories : [];
  const localRepositories = repositories.filter((repository) => repository.localKind || /^local_/.test(cleanString(repository.kind)));
  const nonProductionRepositories = repositories.filter((repository) => repository.productionReady !== true);
  const storageMode = attachmentReadiness.storageMode || {};
  const localPersistenceAccepted =
    systemPersistence.localPersistenceAcceptance?.accepted === true ||
    systemPersistence.safeguards?.localPersistenceAcceptedForV1 === true;
  const localAttachmentAccepted =
    storageMode.localFsAcceptedForV1 === true || attachmentReadiness.safeguards?.localStorageAcceptedForV1 === true;
  const objectStorageLive = storageMode.objectStorageLive === true;
  const storageKind = cleanString(storageMode.storageKind || attachmentStorage.storageKind || attachmentStorage.storageProvider);
  return [
    criterion({
      key: "runtime-production-env-file-applied",
      label: "当前 API 已应用安全生产 env 文件",
      passed:
        productionEnvFileApplication.applied === true &&
        productionEnvFileApplication.ready === true &&
        productionEnvFileApplication.auditReady === true,
      detail:
        productionEnvFileApplication.applied === true &&
        productionEnvFileApplication.ready === true &&
        productionEnvFileApplication.auditReady === true
          ? "当前 API 启动时已先通过 env 文件安全审计，再把生产 env 文件应用到进程。"
          : cleanString(productionEnvFileApplication.nextAction) ||
            "当前 API 未证明启动时应用了已审计的安全生产 env 文件；请配置 ERP_V1_PRODUCTION_ENV_FILE 后重启 API，并重跑组合预检。",
      evidence: {
        status: cleanString(productionEnvFileApplication.status || "unknown"),
        selectedSourceKind: cleanString(productionEnvFileApplication.selectedSourceKind || "none"),
        configuredEnvFileCount: numberOrZero(productionEnvFileApplication.configuredEnvFileCount),
        auditStatus: cleanString(productionEnvFileApplication.auditStatus || "unknown"),
        auditBlockingCount: numberOrZero(productionEnvFileApplication.auditBlockingCount),
        auditWarningCount: numberOrZero(productionEnvFileApplication.auditWarningCount),
        assignmentCount: numberOrZero(productionEnvFileApplication.assignmentCount),
        fallbackSourceUsed: productionEnvFileApplication.fallbackSourceUsed === true,
        auditOnlySourceConfigured: productionEnvFileApplication.auditOnlySourceConfigured === true,
      },
    }),
    criterion({
      key: "no-local-persistence-acceptance",
      label: "未启用本地持久化 V1 接受旁路",
      passed: !localPersistenceAccepted,
      detail: localPersistenceAccepted
        ? "当前 API 仍通过本地持久化接受开关放行；生产预检必须改为 PostgreSQL profile 后重跑。"
        : "No local persistence acceptance bypass is active.",
    }),
    criterion({
      key: "all-system-repositories-production-ready",
      label: "系统仓储全部为生产级持久化",
      passed: systemPersistence.ready === true && localRepositories.length === 0 && nonProductionRepositories.length === 0,
      detail:
        systemPersistence.ready === true && localRepositories.length === 0 && nonProductionRepositories.length === 0
          ? "All runtime repositories are production-ready."
          : `仍有 ${localRepositories.length} 个本地仓储 / ${nonProductionRepositories.length} 个非生产仓储；请用 PostgreSQL profile 启动当前 API。`,
      evidence: {
        repositoryCount: repositories.length,
        localRepositoryCount: localRepositories.length,
        nonProductionRepositoryCount: nonProductionRepositories.length,
      },
    }),
    criterion({
      key: "runtime-formal-role-account-coverage",
      label: "V1 正式岗位账号覆盖",
      passed:
        runtimeEmployeeAccounts.ready === true &&
        numberOrZero(runtimeEmployeeAccounts.requiredRoleCount) > 0 &&
        numberOrZero(runtimeEmployeeAccounts.coveredRoleCount) ===
          numberOrZero(runtimeEmployeeAccounts.requiredRoleCount),
      detail:
        runtimeEmployeeAccounts.ready === true
          ? `${numberOrZero(runtimeEmployeeAccounts.coveredRoleCount)}/${numberOrZero(runtimeEmployeeAccounts.requiredRoleCount)} 个岗位已有可用正式账号。`
          : `${numberOrZero(runtimeEmployeeAccounts.missingRoleCount)} 个岗位仍缺少可用正式账号；请完成账号启用、首次改密、解锁、密码续期和车间机器绑定。`,
      evidence: {
        formalAccountCount: numberOrZero(runtimeEmployeeAccounts.formalAccountCount),
        readyFormalAccountCount: numberOrZero(runtimeEmployeeAccounts.readyFormalAccountCount),
        requiredRoleCount: numberOrZero(runtimeEmployeeAccounts.requiredRoleCount),
        coveredRoleCount: numberOrZero(runtimeEmployeeAccounts.coveredRoleCount),
        missingRoleCount: numberOrZero(runtimeEmployeeAccounts.missingRoleCount),
      },
    }),
    criterion({
      key: "attachment-object-storage-live",
      label: "附件留档为真实对象存储 live",
      passed: attachmentReadiness.ready === true && objectStorageLive && storageKind === "object_storage",
      detail:
        attachmentReadiness.ready === true && objectStorageLive && storageKind === "object_storage"
          ? "Attachment V1 readiness is backed by live object storage."
          : "当前附件留档未证明为 object_storage live；请用真实 OSS/S3/COS 配置启动并重跑诊断。",
      evidence: {
        attachmentReady: attachmentReadiness.ready === true,
        objectStorageLive,
        storageKind,
      },
    }),
    criterion({
      key: "no-local-attachment-acceptance",
      label: "未启用本地附件留档 V1 接受旁路",
      passed: !localAttachmentAccepted,
      detail: localAttachmentAccepted
        ? "当前 API 仍通过本地文件留档接受开关放行；生产预检必须改为对象存储 live 后重跑。"
        : "No local attachment retention acceptance bypass is active.",
    }),
  ];
}

function criterion({ key, label, passed, detail, evidence = {}, blocking = true }) {
  return {
    key,
    label,
    status: passed ? "passed" : "pending",
    blocking,
    detail,
    evidence,
  };
}

function sanitizeRuntimeReadiness(report = {}) {
  return {
    status: cleanString(report.status || "unknown"),
    ready: report.ready === true,
    summary: sanitizeSummary(report.summary),
    criteria: sanitizeBlockingItems(report.criteria || []),
    blockingCriteria: sanitizeBlockingItems(report.blockingCriteria || []),
    systemPersistence: {
      status: cleanString(report.systemPersistence?.status || "unknown"),
      ready: report.systemPersistence?.ready === true,
      summary: sanitizeSummary(report.systemPersistence?.summary),
      localRepositoryCount: numberOrZero(report.systemPersistence?.localRepositoryCount),
      localMemoryCount: numberOrZero(report.systemPersistence?.localMemoryCount),
      localPersistenceAcceptedForV1: report.systemPersistence?.localPersistenceAcceptance?.accepted === true,
      runtimeEmployeeAccountReadiness: sanitizeRuntimeEmployeeAccountReadiness(
        report.systemPersistence?.runtimeEmployeeAccountReadiness,
      ),
    },
    attachmentReadiness: {
      status: cleanString(report.attachmentReadiness?.status || "unknown"),
      ready: report.attachmentReadiness?.ready === true,
      summary: sanitizeSummary(report.attachmentReadiness?.summary),
      storageMode: {
        storageKind: cleanString(report.attachmentReadiness?.storageMode?.storageKind),
        storageProvider: cleanString(report.attachmentReadiness?.storageMode?.storageProvider),
        objectStorageLive: report.attachmentReadiness?.storageMode?.objectStorageLive === true,
        localFsAcceptedForV1: report.attachmentReadiness?.storageMode?.localFsAcceptedForV1 === true,
      },
    },
    productionEnvFileApplication: sanitizeProductionEnvFileApplication(report.productionEnvFileApplication),
    safeguards: {
      nonMutating: report.safeguards?.nonMutating !== false,
      systemReadOnly: report.safeguards?.systemReadOnly !== false,
      attachmentReadOnly: report.safeguards?.attachmentReadOnly !== false,
      nonPrinting: report.safeguards?.nonPrinting !== false,
      physicalPrinterCalled: report.safeguards?.physicalPrinterCalled === true,
      driverReadOnly: report.safeguards?.driverReadOnly !== false,
      secretFieldsExposed: report.safeguards?.secretFieldsExposed === true,
    },
    remainingV1Risks: stringList(report.remainingV1Risks).slice(0, 12),
  };
}

function sanitizeRuntimeEmployeeAccountReadiness(value = {}) {
  return {
    ready: value.ready === true,
    requiredRoleCount: numberOrZero(value.requiredRoleCount),
    coveredRoleCount: numberOrZero(value.coveredRoleCount),
    missingRoleCount: numberOrZero(value.missingRoleCount),
    formalAccountCount: numberOrZero(value.formalAccountCount),
    readyFormalAccountCount: numberOrZero(value.readyFormalAccountCount),
  };
}

function sanitizeProductionEnvFileApplication(value = {}) {
  return {
    status: cleanString(value.status || "unknown"),
    ready: value.ready === true,
    applied: value.applied === true,
    selectedSourceKind: cleanString(value.selectedSourceKind || "none"),
    configuredEnvFileCount: numberOrZero(value.configuredEnvFileCount),
    configuredApplicationSourceVariableCount: numberOrZero(value.configuredApplicationSourceVariableCount),
    configuredAuditOnlySourceVariableCount: numberOrZero(value.configuredAuditOnlySourceVariableCount),
    fallbackSourceUsed: value.fallbackSourceUsed === true,
    auditOnlySourceConfigured: value.auditOnlySourceConfigured === true,
    ignoredConfiguredFallbackVariableCount: numberOrZero(value.ignoredConfiguredFallbackVariableCount),
    assignmentCount: numberOrZero(value.assignmentCount),
    auditReady: value.auditReady === true,
    auditStatus: cleanString(value.auditStatus || "unknown"),
    auditBlockingCount: numberOrZero(value.auditBlockingCount),
    auditWarningCount: numberOrZero(value.auditWarningCount),
    nextAction: cleanString(value.nextAction),
    safeguards: {
      auditRequiredBeforeApply: value.safeguards?.auditRequiredBeforeApply !== false,
      auditOnlyPathApplied: value.safeguards?.auditOnlyPathApplied === true,
      frontendPathAccepted: value.safeguards?.frontendPathAccepted === true,
      envFilePathExposed: value.safeguards?.envFilePathExposed === true,
      rawEnvFileIncluded: value.safeguards?.rawEnvFileIncluded === true,
      envValuesIncluded: value.safeguards?.envValuesIncluded === true,
      secretValuesIncluded: value.safeguards?.secretValuesIncluded === true,
      commandValuesIncluded: value.safeguards?.commandValuesIncluded === true,
      connectionStringExposed: value.safeguards?.connectionStringExposed === true,
      objectStorageEndpointExposed: value.safeguards?.objectStorageEndpointExposed === true,
      objectStorageBucketExposed: value.safeguards?.objectStorageBucketExposed === true,
      localPathExposed: value.safeguards?.localPathExposed === true,
    },
  };
}

function sanitizeFixChecklist(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    key: cleanString(item.key),
    label: cleanString(item.label),
    ownerRole: cleanString(item.ownerRole),
    severity: cleanString(item.severity || "unknown"),
    configuredVariableCount: numberOrZero(item.configuredVariableCount),
    totalVariableCount: numberOrZero(item.totalVariableCount),
    missingVariables: stringList(item.missingVariables),
    placeholderVariables: stringList(item.placeholderVariables),
    placeholderVariableCount: numberOrZero(item.placeholderVariableCount),
    valueGuidance: stringList(item.valueGuidance),
    verificationSteps: stringList(item.verificationSteps),
    nextAction: cleanString(item.nextAction),
  }));
}

function sanitizeBlockingItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    key: cleanString(item.key),
    label: cleanString(item.label),
    status: cleanString(item.status || item.severity || "unknown"),
    blocking: item.blocking !== false,
    detail: cleanString(item.detail || item.nextAction || item.message),
  }));
}

function sanitizeSummary(value = {}) {
  return {
    label: cleanString(value.label),
    passedCount: numberOrZero(value.passedCount),
    totalCount: numberOrZero(value.totalCount),
    blockingCount: numberOrZero(value.blockingCount),
    warningCount: numberOrZero(value.warningCount),
  };
}

function buildSafeguards(runtimeReadiness = {}, { envFileFromProductionSetup = false } = {}) {
  return {
    nonMutating: true,
    envValuesExposed: false,
    rawEnvFileContentExposed: false,
    connectionStringExposed: false,
    objectStorageEndpointExposed: false,
    objectStorageBucketExposed: false,
    secretFieldsExposed: false,
    commandValueExposed: false,
    commandArgsExposed: false,
    spoolPathExposed: false,
    localPathExposed: false,
    envFileReadFromProductionSetup: Boolean(envFileFromProductionSetup),
    productionEnvAppliedToProcess: runtimeReadiness?.productionEnvFileApplication?.applied === true,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    physicalPrinterCalled: runtimeReadiness?.safeguards?.physicalPrinterCalled === true,
    driverReadOnly: runtimeReadiness?.safeguards?.driverReadOnly !== false,
    readinessRunnerReadOnly: runtimeReadiness?.safeguards?.nonMutating !== false,
  };
}

const stageUnblockGuidanceByKey = {
  "production-env-file-audit": {
    ownerRole: "技术/管理",
    nextActionWhenBlocked: "先配置安全、未跟踪、非模板的生产 env 文件审计路径，确认文件权限和占位符后重跑审计。",
    nextActionWhenReady: "保存 env 文件安全审计结果，继续执行生产 env 真实值 intake 校验。",
    verificationSteps: [
      "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file> --json",
      "确认真实 env 文件未被 git 跟踪、不是 *.env.example、没有 <REPLACE_WITH_...> 占位值。",
    ],
    evidenceToKeep: [
      "env 文件安全审计 JSON / Markdown 结果",
      "安全 env 文件存放位置由负责人线下留存，交接包不记录真实路径或内容",
    ],
  },
  "production-env-intake-verify": {
    ownerRole: "技术/管理",
    nextActionWhenBlocked: "先按生产 env 真实值 intake 清单补齐 PostgreSQL、对象存储、打印 command_bridge、CUPS 和验收账号真实值，再重跑 intake 校验。",
    nextActionWhenReady: "保存生产 env 真实值 intake 校验结果，继续执行生产 env 变量预检。",
    verificationSteps: [
      "node scripts/run-v1-production-env-intake-verify.mjs --use-production-env-setup-env-file --intake-csv <production-env-intake-csv> --json",
      "备用：只有绕开 production env setup 报告时，才显式传入 --env-file <secure-env-file>。",
      "确认 blockingFindings 为 0；若只有 ready_with_warnings，先由负责人确认 filled / verified / evidenceRef 是否可稍后补齐。",
    ],
    evidenceToKeep: [
      "生产 env 真实值 intake 校验 JSON / Markdown 结果",
      "真实连接串、bucket、secret、命令值和 spool 路径只留在安全 env 文件，不进入交接包",
    ],
  },
  "production-env-preflight": {
    ownerRole: "技术/管理",
    nextActionWhenBlocked: "按生产 env 修正清单逐项填写真实 PostgreSQL、对象存储、打印、CUPS 和验收账号变量，然后重跑生产 env 变量预检。",
    nextActionWhenReady: "保存生产 env 变量预检结果，用该 env 启动或重启当前 API。",
    verificationSteps: [
      "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file --json",
      "备用：只有绕开 production env setup 报告时，才显式传入 --env-file <secure-env-file>。",
      "确认 fixChecklist 中 blocking 项为 0，真实值没有进入报告或交接包。",
    ],
    evidenceToKeep: [
      "生产 env 变量预检 JSON / Markdown 结果",
      "生产 env 修正清单由技术/管理签收，真实值只留在安全 env 文件",
    ],
  },
  "runtime-v1-readiness": {
    ownerRole: "技术/管理 + 现场负责人",
    nextActionWhenBlocked: "用生产 env 启动当前 API 后，补齐持久化、附件、打印、CUPS、司机真机和现场验收门禁，再重跑 V1 readiness。",
    nextActionWhenReady: "保存当前 API V1 readiness 结果，继续确认当前 API 是否真正运行在生产 profile。",
    verificationSteps: [
      "node scripts/run-v1-readiness-check.mjs --api-base-url <erp-api> --operator-id <office-user> --driver-operator-id <driver-user> --json",
      "确认 11 项 readiness 通过，并保留打印、司机真机、现场验收等真实证据。",
    ],
    evidenceToKeep: [
      "V1 readiness JSON / Markdown 结果",
      "打印设备 QA、CUPS 队列预检、司机真机、现场验收记录",
    ],
  },
  "runtime-production-profile": {
    ownerRole: "技术/管理",
    nextActionWhenBlocked: "确认当前 API 由 ERP_V1_PRODUCTION_ENV_FILE 启动加载已审计安全 env，禁用本地接受旁路，并使用 PostgreSQL 仓储和 object_storage live 附件留档后重跑组合预检。",
    nextActionWhenReady: "当前 API 已满足生产 profile 约束，可继续 release candidate 和现场证据收尾。",
    verificationSteps: [
      "node scripts/run-v1-production-go-live-precheck.mjs --use-production-env-setup-env-file --api-base-url <erp-api> --json",
      "备用：只有绕开 production env setup 报告时，才显式传入 --env-file <secure-env-file>。",
      "确认 API health 中 productionEnvFileApplication.applied=true，且本地持久化接受、本地附件接受、本地仓储和非 live 对象存储均为 0 或 false。",
    ],
    evidenceToKeep: [
      "生产上线组合预检 JSON / Markdown 结果",
      "PostgreSQL 迁移 / 对象存储 live 诊断 / 当前 API 生产 profile 运行记录",
    ],
  },
};

function buildUnblockChecklist({ stages, fixChecklist }) {
  return stages.map((stage, index) => {
    const guidance = stageUnblockGuidanceByKey[stage.key] || {};
    const stageFixItems =
      stage.key === "production-env-preflight"
        ? fixChecklist.filter((item) => item.severity !== "ok").slice(0, 3)
        : [];
    const firstFix = stageFixItems[0];
    const firstBlocking = stage.blockingItems[0];
    const nextAction = stage.ready
      ? cleanString(guidance.nextActionWhenReady) || stage.nextActions[0] || "本阶段已通过，继续下一阶段。"
      : firstFix
        ? `先处理 ${firstFix.label}：${firstFix.nextAction}`
        : cleanString(guidance.nextActionWhenBlocked) || stage.nextActions[0] || firstBlocking?.detail || "处理本阶段阻塞后重跑预检。";
    const verificationSteps = [
      ...stringList(guidance.verificationSteps),
      ...stageFixItems.flatMap((item) => item.verificationSteps).slice(0, 2),
    ].slice(0, 5);
    return {
      key: stage.key,
      label: stage.label,
      stageOrder: index + 1,
      status: stage.status,
      ready: stage.ready === true,
      ownerRole: cleanString(guidance.ownerRole) || inferStageOwnerRole(stage),
      blockingCount: numberOrZero(stage.summary.blockingCount || stage.blockingItems.length),
      nextAction,
      verificationSteps,
      evidenceToKeep: stringList(guidance.evidenceToKeep).slice(0, 5),
      blockers: stage.blockingItems.slice(0, 3),
      fixItems: stageFixItems.map((item) => ({
        key: item.key,
        label: item.label,
        severity: item.severity,
        nextAction: item.nextAction,
        valueGuidance: item.valueGuidance.slice(0, 3),
        verificationSteps: item.verificationSteps.slice(0, 3),
      })),
    };
  });
}

function buildFieldEvidenceCoverage({ stages = [], envPreflight = {}, runtimeReadiness = {} } = {}) {
  const stageByKey = new Map(stages.map((stage) => [stage.key, stage]));
  const productionEnvIntakeReady = stageByKey.get("production-env-intake-verify")?.ready === true;
  const productionEnvPreflightReady = stageByKey.get("production-env-preflight")?.ready === true;
  const productionEnvPreflightTargetLabel = targetPassLabel(envPreflight?.summary);
  const runtimeProductionProfileReady = stageByKey.get("runtime-production-profile")?.ready === true;
  const attachmentStorageMode = runtimeReadiness?.attachmentReadiness?.storageMode || {};
  const attachmentStorageKind = cleanString(
    attachmentStorageMode.storageKind ||
      runtimeReadiness?.attachmentStorage?.storageKind ||
      runtimeReadiness?.attachmentStorage?.storageProvider,
  );
  const attachmentObjectStorageLive =
    runtimeReadiness?.attachmentReadiness?.ready === true &&
    attachmentStorageMode.objectStorageLive === true &&
    attachmentStorageKind === "object_storage" &&
    runtimeProductionProfileReady;
  const statementExportConfigured = hasPassedEnvCriterion(envPreflight, "statement-export-object-storage-env");

  const items = [
    coverageItem({
      groupKey: "production_persistence",
      groupLabel: "生产持久化",
      itemKey: "postgres_migration_applied",
      itemLabel: "PostgreSQL 迁移已在生产库执行",
      status: "onsite_required",
      supportingStageKey: "runtime-production-profile",
      supportingStageLabel: "当前 API 生产 profile 确认",
      nextAction: "执行 node scripts/run-v1-production-postgres-preflight.mjs --use-production-env-setup-env-file，并保留生产库迁移执行报告或 DBA 复核记录；组合预检不能单独证明迁移已执行。",
    }),
    coverageItem({
      groupKey: "production_persistence",
      groupLabel: "生产持久化",
      itemKey: "postgres_backup_configured",
      itemLabel: "生产库备份策略和负责人已确认",
      status: "onsite_required",
      supportingStageKey: "runtime-production-profile",
      supportingStageLabel: "当前 API 生产 profile 确认",
      nextAction: "需要现场备份策略、负责人和巡检留档；组合预检只证明当前 API 仓储 profile。",
    }),
    coverageItem({
      groupKey: "production_persistence",
      groupLabel: "生产持久化",
      itemKey: "postgres_restore_sample_checked",
      itemLabel: "恢复演练或恢复样本已留档",
      status: "onsite_required",
      supportingStageKey: "runtime-production-profile",
      supportingStageLabel: "当前 API 生产 profile 确认",
      nextAction: "需要恢复演练样本或恢复记录编号；组合预检不能替代恢复演练。",
    }),
    coverageItem({
      groupKey: "production_persistence",
      groupLabel: "生产持久化",
      itemKey: "postgres_roles_checked",
      itemLabel: "生产库账号、最小权限和连接池配置已确认",
      status: runtimeProductionProfileReady ? "needs_onsite_ref" : "waiting_for_stage",
      supportingStageKey: "runtime-production-profile",
      supportingStageLabel: "当前 API 生产 profile 确认",
      nextAction: runtimeProductionProfileReady
        ? "组合预检可作为生产 profile 运行材料；再执行生产 PostgreSQL 预检并补数据库账号 / 最小权限 / 连接池现场复核编号。"
        : "先用真实 PostgreSQL profile 启动当前 API，并执行生产 PostgreSQL 预检，随后让当前 API 生产 profile 确认通过。",
    }),
    coverageItem({
      groupKey: "production_persistence",
      groupLabel: "生产持久化",
      itemKey: "production_env_preflight_10_of_10",
      itemLabel: `V1 生产环境变量预检已达到 ${productionEnvPreflightTargetLabel}`,
      status: productionEnvPreflightReady ? "report_supported" : "waiting_for_stage",
      supportingStageKey: productionEnvIntakeReady ? "production-env-preflight" : "production-env-intake-verify",
      supportingStageLabel: productionEnvIntakeReady ? "生产 env 变量预检" : "生产 env 真实值 intake 校验",
      nextAction: productionEnvPreflightReady
        ? "可用本组合预检 / 生产 env 变量预检报告编号回填该证据项。"
        : productionEnvIntakeReady
          ? `先让生产 env 变量预检达到 ${productionEnvPreflightTargetLabel}。`
          : "先补齐真实值 intake 清单中的 PostgreSQL、恢复验证库、对象存储、打印 command_bridge 和 CUPS 变量，再进入生产 env 变量预检。",
    }),
    coverageItem({
      groupKey: "object_storage",
      groupLabel: "对象存储 / 附件留档",
      itemKey: "attachment_bucket_policy_checked",
      itemLabel: "附件 bucket 权限、生命周期和备份策略已确认",
      status: "onsite_required",
      supportingStageKey: "runtime-production-profile",
      supportingStageLabel: "当前 API 生产 profile 确认",
      nextAction: "先执行生产对象存储 live 预检，再补对象存储控制台或供应商配置复核记录；组合预检不输出 bucket 策略细节。",
    }),
    coverageItem({
      groupKey: "object_storage",
      groupLabel: "对象存储 / 附件留档",
      itemKey: "attachment_upload_readback_checked",
      itemLabel: "附件上传、读回和内容摘要一致性已通过",
      status: attachmentObjectStorageLive ? "report_supported" : "waiting_for_stage",
      supportingStageKey: "runtime-production-profile",
      supportingStageLabel: "当前 API 生产 profile 确认",
      nextAction: attachmentObjectStorageLive
        ? "当前 API 已证明附件留档为 object_storage live；同时保留 run-v1-production-object-storage-preflight 报告编号和真实上传 / 读回样本编号。"
        : "先执行生产对象存储 live 预检，再用真实对象存储启动当前 API，并让附件 V1 留档门禁和生产 profile 确认通过。",
    }),
    coverageItem({
      groupKey: "object_storage",
      groupLabel: "对象存储 / 附件留档",
      itemKey: "attachment_signed_url_checked",
      itemLabel: "附件短期访问地址可读取且过期策略已验证",
      status: attachmentObjectStorageLive ? "needs_onsite_ref" : "waiting_for_stage",
      supportingStageKey: "runtime-production-profile",
      supportingStageLabel: "当前 API 生产 profile 确认",
      nextAction: attachmentObjectStorageLive
        ? "组合预检和对象存储 live 预检可证明签名 URL 基础链路；短期访问地址和过期策略仍需现场样本编号。"
        : "先执行生产对象存储 live 预检，并让附件对象存储 live 和当前 API 生产 profile 通过，再现场验证短期访问地址。",
    }),
    coverageItem({
      groupKey: "object_storage",
      groupLabel: "对象存储 / 附件留档",
      itemKey: "attachment_access_audit_checked",
      itemLabel: "附件访问审计已写入并可查询",
      status: attachmentObjectStorageLive ? "needs_onsite_ref" : "waiting_for_stage",
      supportingStageKey: "runtime-production-profile",
      supportingStageLabel: "当前 API 生产 profile 确认",
      nextAction: attachmentObjectStorageLive
        ? "组合预检可证明对象存储 live；访问审计查询仍需现场记录编号。"
        : "先执行生产对象存储 live 预检，并让附件对象存储 live 和当前 API 生产 profile 通过，再现场查询访问审计。",
    }),
    coverageItem({
      groupKey: "object_storage",
      groupLabel: "对象存储 / 附件留档",
      itemKey: "statement_export_storage_checked",
      itemLabel: "对账导出文件已写入对象存储并可重新下载",
      status: statementExportConfigured ? "needs_onsite_ref" : "waiting_for_stage",
      supportingStageKey: "production-env-preflight",
      supportingStageLabel: "生产 env 变量预检",
      nextAction: statementExportConfigured
        ? "生产 env 已具备对账导出对象存储配置；继续执行 run-v1-production-object-storage-preflight，并用真实客户对账单导出 / 重下载样本编号回填。"
        : "先补齐对账导出对象存储配置或完整附件对象存储 fallback，再执行 run-v1-production-object-storage-preflight 和真实导出样本。",
    }),
  ];

  const reportSupportedCount = items.filter((item) => item.status === "report_supported").length;
  const needsOnsiteRefCount = items.filter((item) => item.status === "needs_onsite_ref").length;
  const waitingForStageCount = items.filter((item) => item.status === "waiting_for_stage").length;
  const onsiteRequiredCount = items.filter((item) => item.status === "onsite_required").length;
  const totalCount = items.length;
  return {
    summary: {
      label: `${reportSupportedCount}/${totalCount} 可由本报告直接支持`,
      reportSupportedCount,
      needsOnsiteRefCount,
      waitingForStageCount,
      onsiteRequiredCount,
      totalCount,
      reportSupportedLabel: `${reportSupportedCount}/${totalCount}`,
      stillNeedsFieldEvidenceCount: totalCount - reportSupportedCount,
      nextAction:
        reportSupportedCount === totalCount
          ? "把组合预检报告编号写入现场证据采集包，并继续负责人签字。"
          : "先补等待阶段项；对只需现场引用或现场单独证明的项，回填证据编号后再刷新 go-live suite。",
    },
    items,
  };
}

function coverageItem({
  groupKey,
  groupLabel,
  itemKey,
  itemLabel,
  status,
  supportingStageKey,
  supportingStageLabel,
  nextAction,
}) {
  const statusLabelByStatus = {
    report_supported: "报告可支持",
    needs_onsite_ref: "需现场编号",
    waiting_for_stage: "等待门禁",
    onsite_required: "需现场证明",
  };
  return {
    groupKey,
    groupLabel,
    itemKey,
    itemLabel,
    status,
    statusLabel: statusLabelByStatus[status] || "待处理",
    ready: status === "report_supported",
    supportingStageKey,
    supportingStageLabel,
    nextAction,
  };
}

function hasPassedEnvCriterion(envPreflight, criterionKey) {
  const criteria = Array.isArray(envPreflight?.criteria) ? envPreflight.criteria : [];
  return criteria.some((item) => item?.key === criterionKey && item?.status === "passed");
}

function inferStageOwnerRole(stage) {
  if (stage.key?.includes("env") || stage.key?.includes("profile")) return "技术/管理";
  return "技术/管理 + 现场负责人";
}

function buildNextActions({ stages, fixChecklist }) {
  const blocked = stages.filter((stage) => stage.status !== "passed");
  if (blocked.length === 0) {
    return [
      "保存本报告 JSON，继续运行 scripts/run-v1-release-candidate-check.mjs。",
      "用真实现场证据 manifest、负责人签字和 V1/V2 边界确认完成最终发布候选。",
    ];
  }
  const actions = [];
  for (const stage of blocked) {
    if (stage.key === "production-env-preflight" && fixChecklist.length > 0) {
      actions.push(...fixChecklist.filter((item) => item.severity !== "ok").slice(0, 4).map((item) => `${item.label}：${item.nextAction}`));
      continue;
    }
    actions.push(...stage.nextActions.slice(0, 4));
    if (stage.blockingItems.length > 0 && stage.nextActions.length === 0) {
      actions.push(...stage.blockingItems.slice(0, 4).map((item) => `${item.label}：${item.detail}`));
    }
  }
  return actions.slice(0, 10);
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function targetPassLabel(summary = {}) {
  const total = numberOrZero(summary.totalCount);
  return total > 0 ? `${total}/${total} 通过` : "全项通过";
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item)).filter(Boolean);
}

function numberOrZero(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.trunc(number);
}

function yesNo(value) {
  return value ? "yes" : "no";
}

if (isCliEntrypoint()) {
  await runCli();
}
