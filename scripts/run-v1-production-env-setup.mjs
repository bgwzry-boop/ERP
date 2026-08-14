#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildProductionEnvFileAuditReport } from "./run-v1-production-env-file-audit.mjs";
import { buildProductionEnvPreflight, loadEnvironment } from "./run-v1-production-env-preflight.mjs";

const defaultTemplatePath = "docs/development/v1-production.env.example";
const defaultTargetPath = ".erp-local-storage/v1-production-env/secure-prod.env";
const defaultOutputDir = ".erp-local-storage/v1-production-env-setup";
const workspaceRoot = process.cwd();

const literalDefaultKeys = new Set([
  "ERP_RUNTIME_MODE",
  "ERP_V1_PERSISTENCE_PROFILE",
  "ERP_V1_FILE_STORAGE_PROFILE",
  "ERP_AUTH_MODE",
  "ERP_API_MAX_JSON_BODY_BYTES",
  "VITE_ERP_RUNTIME_MODE",
  "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED",
  "ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER",
  "ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX",
  "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTED",
  "ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTANCE_REF",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX",
  "ERP_SYSTEM_PRINTER_ENABLED",
  "ERP_SYSTEM_PRINTER_ADAPTER",
  "ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON",
  "ERP_PRINT_COMMAND_BRIDGE_MODE",
  "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON",
  "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS",
  "ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR",
  "ERP_V1_RELEASE_CANDIDATE_OUTPUT_DIR",
  "ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTED",
  "ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTANCE_REF",
]);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}

export function buildProductionEnvSetup(options = {}) {
  return buildSetupReport(normalizeOptions(options));
}

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = buildSetupReport(options);
    if (options.writeReport !== false) writeReportFiles(report, options.outputDir);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatReport(report));
    }
    process.exitCode = report.setupReady ? 0 : 2;
  } catch (error) {
    const message = error?.message || String(error);
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, setupReady: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production env setup failed: ${message}\n`);
    }
    process.exitCode = 1;
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
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--no-write-report") {
      options.writeReport = false;
      continue;
    }
    if (arg === "--template") {
      options.template = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--import-from") {
      options.importFrom = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--target") {
      options.target = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function normalizeOptions(options) {
  return {
    template: options.template || defaultTemplatePath,
    target: options.target || defaultTargetPath,
    importFrom: options.importFrom || "",
    outputDir: options.outputDir || defaultOutputDir,
    force: Boolean(options.force),
    json: Boolean(options.json),
    writeReport: options.writeReport !== false,
  };
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-production-env-setup.mjs [options]",
    "",
    "Options:",
    "  --target <path>       Secure env draft path, default .erp-local-storage/v1-production-env/secure-prod.env",
    "  --template <path>     Checked-in template path, default docs/development/v1-production.env.example",
    "  --import-from <path>  Import an already filled env file after auditing it; requires --force when target exists.",
    "  --output-dir <path>   Redacted setup report output directory.",
    "  --force               Overwrite an existing target env draft.",
    "  --no-write-report     Do not write latest.json / latest.md setup report files.",
    "  --json                Print machine-readable JSON.",
    "",
    "Outputs:",
    "  latest.json / latest.md",
    "  production-env-fix-checklist.zh-CN.md / .csv",
    "  production-env-real-value-intake.zh-CN.md / .csv",
    "  production-env-minimum-real-value-intake.zh-CN.md / .csv",
    "  production-env-minimum-values-fragment.template.env.example",
    "  production-env-values-fragment.template.env.example",
    "  production-env-fill-template.env.example",
    "",
    "Exit codes:",
    "  0  Secure env file is prepared and audit-safe enough for the next preflight step",
    "  1  Runner error",
    "  2  Target path is unsafe or setup could not create / audit the env file",
    "",
    "This setup never prints env values. Generated drafts keep real-value fields blank and preserve only safe defaults.",
  ].join("\n");
}

function buildSetupReport(options) {
  const templatePath = resolve(options.template);
  const targetPath = resolve(options.target);
  const importSourcePath = options.importFrom ? resolve(options.importFrom) : "";
  const targetInfo = inspectTarget(targetPath);
  const setupStartedAt = new Date().toISOString();
  const blockingSetupFindings = [];
  let generated = false;
  let imported = false;
  let importAudit = null;
  let overwritten = false;
  let targetExistedBefore = existsSync(targetPath);

  if (!existsSync(templatePath)) {
    blockingSetupFindings.push(setupFinding("template-missing", "模板文件不存在", "blocked", "确认 docs/development/v1-production.env.example 已生成。"));
  }
  if (targetInfo.insideWorkspace && !targetInfo.gitIgnored) {
    blockingSetupFindings.push(
      setupFinding("target-not-ignored", "目标 env 文件不在 git 忽略路径", "blocked", "把真实 env 文件放到 .erp-local-storage/、*.local.env 或工作区外。"),
    );
  }
  if (targetInfo.insideWorkspace && targetInfo.gitTracked) {
    blockingSetupFindings.push(
      setupFinding("target-git-tracked", "目标 env 文件已被 git 跟踪", "blocked", "不要把真实 env 文件写入已跟踪文件；换一个安全未跟踪路径。"),
    );
  }
  if (importSourcePath) {
    if (importSourcePath === targetPath) {
      blockingSetupFindings.push(
        setupFinding("import-source-same-as-target", "导入来源和目标 env 文件相同", "blocked", "导入来源必须是另一份已填写 env 文件。"),
      );
    } else if (!existsSync(importSourcePath)) {
      blockingSetupFindings.push(
        setupFinding("import-source-missing", "导入来源 env 文件不存在", "blocked", "确认 --import-from 指向已填写的安全 env 文件。"),
      );
    } else {
      try {
        importAudit = buildProductionEnvFileAuditReport({ envFiles: [importSourcePath] });
        if (!importAudit.ready) {
          blockingSetupFindings.push(
            setupFinding("import-source-audit-blocked", "导入来源 env 文件安全审计未通过", "blocked", "先修复来源 env 文件安全审计阻塞项，再重新导入。"),
          );
        }
      } catch (error) {
        blockingSetupFindings.push(
          setupFinding("import-source-audit-error", "导入来源 env 文件安全审计失败", "blocked", error?.message || String(error)),
        );
      }
    }
    if (targetExistedBefore && !options.force) {
      blockingSetupFindings.push(
        setupFinding("target-exists-import-needs-force", "导入目标已存在且未显式允许覆盖", "blocked", "确认目标是安全 env 草稿后，使用 --force 才会覆盖。"),
      );
    }
  }

  if (blockingSetupFindings.length === 0 && importSourcePath) {
    const importedText = readFileSync(importSourcePath, "utf8");
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, normalizeImportedEnvText(importedText), { mode: 0o600 });
    chmodSync(targetPath, 0o600);
    imported = true;
    overwritten = targetExistedBefore;
  } else if (blockingSetupFindings.length === 0 && (!targetExistedBefore || options.force)) {
    const templateText = readFileSync(templatePath, "utf8");
    const draft = buildSecureDraftFromTemplate(templateText);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, draft.content, { mode: 0o600 });
    chmodSync(targetPath, 0o600);
    generated = true;
    overwritten = targetExistedBefore && options.force;
    targetExistedBefore = existsSync(targetPath) && !generated ? true : targetExistedBefore;
  } else if (blockingSetupFindings.length === 0 && targetExistedBefore) {
    chmodSync(targetPath, 0o600);
  }

  const audit = buildSafeAudit(targetPath, blockingSetupFindings);
  const preflight = buildSafePreflight(targetPath, blockingSetupFindings, audit?.ready === true);
  const fileStats = existsSync(targetPath) ? statSync(targetPath) : null;
  const setupReady = blockingSetupFindings.length === 0 && Boolean(audit?.ready);
  const productionReady = setupReady && Boolean(preflight?.ready);
  const status = productionReady ? "ready" : setupReady ? "prepared" : "blocked";
  const remainingFixItems = preflight?.fixChecklist?.filter((item) => item.status !== "passed") ?? [];
  const productionEnvFixChecklist = buildProductionEnvFixChecklist(preflight);
  const productionEnvValueIntakeChecklist = buildProductionEnvValueIntakeChecklist(
    productionEnvFixChecklist,
    setupStartedAt,
  );
  const productionEnvMinimumValueIntakeChecklist = buildProductionEnvMinimumValueIntakeChecklist(
    productionEnvValueIntakeChecklist,
  );
  const productionEnvValuesFragmentTemplate = buildProductionEnvValuesFragmentTemplate(
    productionEnvValueIntakeChecklist,
  );
  const productionEnvMinimumValuesFragmentTemplate = buildProductionEnvMinimumValuesFragmentTemplate(
    productionEnvValueIntakeChecklist,
  );

  return {
    scope: "v1_production_env_setup",
    status,
    ready: productionReady,
    setupReady,
    checkedAt: setupStartedAt,
    summary: {
      label: productionReady
        ? "生产 env 文件已通过安全审计和变量预检"
        : setupReady
          ? `安全 env 文件已准备，仍有 ${remainingFixItems.length} 项生产变量修正项`
          : "生产 env 文件准备被安全门禁阻塞",
      generated,
      imported,
      overwritten,
      targetExistedBefore,
      setupBlockingCount: blockingSetupFindings.length,
      auditReady: Boolean(audit?.ready),
      envPreflightReady: Boolean(preflight?.ready),
      envPreflightPassedCount: preflight?.summary?.passedCount ?? 0,
      envPreflightTotalCount: preflight?.summary?.totalCount ?? 0,
      envPreflightBlockingCount: preflight?.summary?.blockingCount ?? 0,
      envPreflightWarningCount: preflight?.summary?.warningCount ?? 0,
      remainingFixItemCount: remainingFixItems.length,
    },
    envFile: {
      path: displayPath(targetPath),
      insideWorkspace: targetInfo.insideWorkspace,
      gitIgnored: targetInfo.gitIgnored,
      gitTracked: targetInfo.gitTracked,
      existedBefore: targetExistedBefore,
      generated,
      imported,
      overwritten,
      fileMode: fileStats ? (fileStats.mode & 0o777).toString(8).padStart(3, "0") : "",
      assignmentCount: audit?.files?.[0]?.uncommentedAssignmentCount ?? 0,
      placeholderAssignmentCount: audit?.files?.[0]?.placeholderAssignmentCount ?? 0,
    },
    audit: audit
      ? {
          status: audit.status,
          ready: audit.ready,
          blockingCount: audit.summary?.blockingCount ?? 0,
          warningCount: audit.summary?.warningCount ?? 0,
          crossFileDuplicateVariableCount: audit.summary?.crossFileDuplicateVariableCount ?? 0,
        }
      : null,
    envPreflight: preflight
      ? {
          status: preflight.status,
          ready: preflight.ready,
          passedCount: preflight.summary?.passedCount ?? 0,
          totalCount: preflight.summary?.totalCount ?? 0,
          blockingCount: preflight.summary?.blockingCount ?? 0,
          warningCount: preflight.summary?.warningCount ?? 0,
          remainingFixItems: remainingFixItems.map((item) => ({
            key: item.key,
            label: item.label,
            ownerRole: item.ownerRole,
            status: item.status,
            missingVariables: item.missingVariables ?? [],
            placeholderVariables: item.placeholderVariables ?? [],
            nextAction: item.nextAction,
          })),
        }
      : null,
    importSource: importSourcePath
      ? {
          path: displayPath(importSourcePath),
          auditReady: Boolean(importAudit?.ready),
          auditStatus: importAudit?.status || "not_run",
          auditBlockingCount: importAudit?.summary?.blockingCount ?? 0,
          auditWarningCount: importAudit?.summary?.warningCount ?? 0,
          assignmentCount: importAudit?.files?.[0]?.uncommentedAssignmentCount ?? 0,
          placeholderAssignmentCount: importAudit?.files?.[0]?.placeholderAssignmentCount ?? 0,
        }
      : null,
    productionEnvFixChecklist,
    productionEnvValueIntakeChecklist,
    productionEnvMinimumValueIntakeChecklist,
    productionEnvMinimumValuesFragmentTemplate,
    productionEnvValuesFragmentTemplate,
    setupFindings: blockingSetupFindings,
    commands: buildCommands(),
    nextActions: buildNextActions({ setupReady, productionReady, remainingFixItems, blockingSetupFindings }),
    safeguards: {
      envValuesExposed: false,
      connectionStringExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      spoolPathExposed: false,
      rawTemplateValuesCopied: false,
      importedEnvValuesExposed: false,
      envValueIntakeRealValuesExposed: false,
      productionEnvValueIntakeChecklistIncluded: productionEnvValueIntakeChecklist.included,
      productionEnvMinimumValueIntakeChecklistIncluded: productionEnvMinimumValueIntakeChecklist.included,
      productionEnvMinimumValueIntakeRealValuesExposed: false,
      productionEnvMinimumValuesFragmentTemplateIncluded: productionEnvMinimumValuesFragmentTemplate.included,
      productionEnvMinimumValuesFragmentTemplateRealValuesExposed: false,
      productionEnvValuesFragmentTemplateIncluded: productionEnvValuesFragmentTemplate.included,
      productionEnvValuesFragmentTemplateRealValuesExposed: false,
      generatedFileMode0600: fileStats ? (fileStats.mode & 0o777) === 0o600 : false,
      targetMustBeIgnoredOrOutsideWorkspace: true,
    },
  };
}

function inspectTarget(targetPath) {
  const relativePath = relative(workspaceRoot, targetPath);
  const insideWorkspace = Boolean(relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath));
  if (!insideWorkspace) {
    return { insideWorkspace: false, gitIgnored: false, gitTracked: false };
  }
  return {
    insideWorkspace: true,
    gitIgnored: runGit(["check-ignore", "--quiet", "--", relativePath]).status === 0,
    gitTracked: runGit(["ls-files", "--error-unmatch", "--", relativePath]).status === 0,
  };
}

function runGit(args) {
  return spawnSync("git", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
}

function buildSecureDraftFromTemplate(templateText) {
  const assignments = [];
  let currentSection = "";
  for (const rawLine of String(templateText ?? "").split(/\r?\n/)) {
    const sectionMatch = rawLine.match(/^#\s+([^=<>#][^=]*?)\s*$/);
    if (sectionMatch && !/^(ERP|Copy|Keep|After|The|Last generated)/.test(sectionMatch[1])) {
      currentSection = sectionMatch[1].trim();
      continue;
    }
    const assignmentMatch = rawLine.match(/^#\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!assignmentMatch) continue;
    const key = assignmentMatch[1];
    const templateValue = assignmentMatch[2] ?? "";
    assignments.push({
      key,
      section: currentSection,
      value: valueForDraft(key, templateValue),
    });
  }
  const lines = [
    "# ERP V1 secure production env draft",
    "# Generated by scripts/run-v1-production-env-setup.mjs.",
    "# Fill real values here only. Do not commit this file or copy values into docs / reports.",
    "# Apply at API startup with: ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file>",
    "# Use ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS=<secure-env-file> only for read-only audit / preview diagnostics.",
    "",
  ];
  let lastSection = "";
  for (const assignment of assignments) {
    if (assignment.section && assignment.section !== lastSection) {
      if (lastSection) lines.push("");
      lines.push(`# ${assignment.section}`);
      lastSection = assignment.section;
    }
    lines.push(`${assignment.key}=${assignment.value}`);
  }
  return {
    content: `${lines.join("\n").replace(/\n+$/, "")}\n`,
    assignmentCount: assignments.length,
  };
}

function normalizeImportedEnvText(text) {
  return `${String(text ?? "").replace(/\r\n/g, "\n").replace(/\n*$/, "")}\n`;
}

function valueForDraft(key, templateValue) {
  if (!literalDefaultKeys.has(key)) return "";
  if (containsPlaceholder(templateValue)) return "";
  if (isSampleDeviceValue(key, templateValue)) return "";
  return templateValue;
}

function containsPlaceholder(value) {
  return /<\s*(REPLACE_WITH|OPTIONAL)_/i.test(value) || /REPLACE_WITH_/i.test(value);
}

function isSampleDeviceValue(key, value) {
  if (/ALLOWLIST|CUPS_PRINTER|READINESS_OPERATOR|DRIVER_OPERATOR/.test(key)) return true;
  return /PRN-LABEL|PRN-DOT|标签机|针式打印机/.test(value);
}

function buildSafeAudit(targetPath, setupFindings) {
  if (setupFindings.length > 0 || !existsSync(targetPath)) return null;
  try {
    return buildProductionEnvFileAuditReport({ envFiles: [targetPath] });
  } catch (error) {
    setupFindings.push(setupFinding("env-file-audit-error", "env 文件安全审计失败", "blocked", error?.message || String(error)));
    return null;
  }
}

function buildSafePreflight(targetPath, setupFindings, auditReady) {
  if (!auditReady || !existsSync(targetPath)) return null;
  try {
    const env = loadEnvironment({ envFiles: [targetPath], baseEnv: {} });
    return buildProductionEnvPreflight({ env, envFiles: [targetPath] });
  } catch (error) {
    setupFindings.push(setupFinding("env-preflight-error", "生产 env 变量预检失败", "blocked", error?.message || String(error)));
    return null;
  }
}

function setupFinding(key, label, status, detail) {
  return { key, label, status, detail };
}

function buildCommands() {
  return [
    {
      key: "import",
      label: "导入已填写 env",
      command:
        "node -- scripts/run-v1-production-env-setup.mjs --import-from <filled-secure-env-file> --target <secure-env-file> --force",
    },
    {
      key: "audit",
      label: "安全审计",
      command: "node -- scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
    },
    {
      key: "preflight",
      label: "变量预检",
      command: "node -- scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
    },
    {
      key: "values-fragment-dry-run",
      label: "真实值片段预检（不写入）",
      command:
        "node -- scripts/run-v1-production-env-intake-apply.mjs --values-env-file <secure-values-env-fragment> --use-production-env-setup-env-file --intake-csv <production-env-real-value-intake-csv> --dry-run",
    },
    {
      key: "first-stage-values-fragment-dry-run",
      label: "第一阶段真实值片段 dry-run（不写入）",
      command:
        "node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --production-env-values-dry-run --field-evidence-manifest <filled-field-evidence-manifest>",
    },
    {
      key: "first-stage-with-values-fragment",
      label: "第一阶段执行（先合并真实值片段）",
      command:
        "node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --field-evidence-manifest <filled-field-evidence-manifest>",
    },
    {
      key: "first-stage",
      label: "第一阶段执行",
      command:
        "node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --field-evidence-manifest <filled-field-evidence-manifest>",
    },
    {
      key: "server-apply",
      label: "API 启动应用",
      command: "ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file> npm run api:dev",
    },
    {
      key: "server-audit-preview",
      label: "API 只读审计 / 预览",
      command: "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS=<secure-env-file> npm run api:dev",
    },
  ];
}

function buildNextActions({ setupReady, productionReady, remainingFixItems, blockingSetupFindings }) {
  if (!setupReady) {
    return blockingSetupFindings.map((finding) => `${finding.label}：${finding.detail}`);
  }
  if (!productionReady) {
    const actions = [
      "在安全 env 文件内填写真实 PostgreSQL、对象存储、打印桥、CUPS、验收账号和现场证据 manifest 路径。",
      "如果真实值先填在独立安全 env 片段中，先跑真实值片段 dry-run 或第一阶段真实值片段 dry-run，确认白名单、任选别名、安全固定值和预计预检没有阻塞。",
      "重跑 env 文件安全审计和生产 env 变量预检，直到变量预检达到 ready。",
    ];
    for (const item of remainingFixItems.slice(0, 6)) {
      actions.push(`${item.label}：补齐 ${(item.missingVariables ?? []).slice(0, 6).join(", ") || item.nextAction || "按预检提示修正"}`);
    }
    return actions;
  }
  return [
    "用 ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file> 启动或重启生产 API；不要只配置只读审计变量。",
    "运行生产第一阶段执行器，完成 PostgreSQL / 对象存储 live 留证、runtime smoke 和第一阶段 closeout。",
  ];
}

function writeReportFiles(report, outputDir) {
  const fullOutputDir = resolve(outputDir);
  mkdirSync(fullOutputDir, { recursive: true });
  writeFileSync(resolve(fullOutputDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(fullOutputDir, "latest.md"), formatReport(report));
  if (report.productionEnvFixChecklist?.included) {
    writeFileSync(resolve(fullOutputDir, "production-env-fix-checklist.zh-CN.md"), formatProductionEnvFixChecklistMarkdown(report));
    writeFileSync(resolve(fullOutputDir, "production-env-fix-checklist.csv"), formatProductionEnvFixChecklistCsv(report.productionEnvFixChecklist.items));
    writeFileSync(
      resolve(fullOutputDir, "production-env-real-value-intake.zh-CN.md"),
      formatProductionEnvValueIntakeMarkdown(report),
    );
    writeFileSync(
      resolve(fullOutputDir, "production-env-real-value-intake.csv"),
      formatProductionEnvValueIntakeCsv(report.productionEnvValueIntakeChecklist.rows),
    );
    writeFileSync(
      resolve(fullOutputDir, "production-env-minimum-real-value-intake.zh-CN.md"),
      formatProductionEnvMinimumValueIntakeMarkdown(report),
    );
    writeFileSync(
      resolve(fullOutputDir, "production-env-minimum-real-value-intake.csv"),
      formatProductionEnvValueIntakeCsv(report.productionEnvMinimumValueIntakeChecklist.rows),
    );
    writeFileSync(
      resolve(fullOutputDir, "production-env-minimum-values-fragment.template.env.example"),
      formatProductionEnvMinimumValuesFragmentTemplate(report),
    );
    writeFileSync(
      resolve(fullOutputDir, "production-env-values-fragment.template.env.example"),
      formatProductionEnvValuesFragmentTemplate(report),
    );
    writeFileSync(resolve(fullOutputDir, "production-env-fill-template.env.example"), formatProductionEnvFillTemplate(report));
  }
}

function formatReport(report) {
  const lines = [
    `# V1 生产 env 准备报告`,
    "",
    `结论：${report.status === "ready" ? "READY" : report.status === "prepared" ? "PREPARED / 仍需填真实值" : "BLOCKED"}`,
    `摘要：${report.summary.label}`,
    "",
    "## Env 文件",
    "",
    `- 路径：${report.envFile.path}`,
    `- 新生成：${report.envFile.generated ? "是" : "否"}`,
    `- 已导入：${report.envFile.imported ? "是" : "否"}`,
    `- 已存在：${report.envFile.existedBefore ? "是" : "否"}`,
    `- git 忽略：${report.envFile.insideWorkspace ? (report.envFile.gitIgnored ? "是" : "否") : "工作区外"}`,
    `- 文件权限：${report.envFile.fileMode || "未生成"}`,
    `- KEY=VALUE 行：${report.envFile.assignmentCount}`,
    "",
  ];
  if (report.importSource) {
    lines.push(
      "## 导入来源",
      "",
      `- 来源：${report.importSource.path}`,
      `- 来源安全审计：${report.importSource.auditReady ? "通过" : "未通过 / 未执行"}`,
      `- 来源 KEY=VALUE 行：${report.importSource.assignmentCount}`,
      "",
    );
  }
  lines.push(
    "## 门禁",
    "",
    `- env 文件安全审计：${report.audit?.ready ? "通过" : "未通过 / 未执行"}`,
    `- 生产 env 变量预检：${report.envPreflight?.ready ? "通过" : "未通过 / 未执行"} (${report.envPreflight?.passedCount ?? 0}/${report.envPreflight?.totalCount ?? 0})`,
  );
  if (report.envPreflight?.remainingFixItems?.length > 0) {
    lines.push("", "## 仍需补齐");
    for (const item of report.envPreflight.remainingFixItems.slice(0, 10)) {
      const missing = item.missingVariables?.length ? `：${item.missingVariables.join(", ")}` : "";
      lines.push(`- ${item.label}${missing}`);
    }
  }
  if (report.setupFindings.length > 0) {
    lines.push("", "## 阻塞");
    for (const finding of report.setupFindings) lines.push(`- ${finding.label}：${finding.detail}`);
  }
  lines.push("", "## 下一步");
  for (const action of report.nextActions) lines.push(`- ${action}`);
  lines.push("", "## 命令");
  for (const command of report.commands) lines.push(`- ${command.label}：\`${command.command}\``);
  if (report.productionEnvFixChecklist?.included) {
    lines.push(
      "",
      "## 填写产物",
      "",
      "- `production-env-fix-checklist.zh-CN.md`：按负责人和变量拆分的生产 env 修正清单。",
      "- `production-env-fix-checklist.csv`：同一清单的表格版本，便于现场逐项跟进。",
      "- `production-env-real-value-intake.zh-CN.md`：给现场负责人填写 / 复核真实值来源、替代变量组和证据编号的脱敏清单。",
      "- `production-env-real-value-intake.csv`：同一真实值填写 / 验收清单的表格版本，可直接按行跟进。",
      "- `production-env-minimum-real-value-intake.zh-CN.md`：只列当前最小 blocking 补值路径的填写 / 验收清单。",
      "- `production-env-minimum-real-value-intake.csv`：同一最小补值清单的表格版本，便于先分派当前最小阻塞路径的真实值。",
      "- `production-env-minimum-values-fragment.template.env.example`：只含当前最小 blocking 补值路径，可先复制成安全片段 dry-run。",
      "- `production-env-values-fragment.template.env.example`：可复制成安全未跟踪真实值片段，并传给第一阶段执行器的 `--production-env-values-file`。",
      "- `production-env-fill-template.env.example`：只含注释占位符的填写骨架，真实值仍必须写入安全 env 文件。",
    );
  }
  lines.push("", "安全边界：报告不输出 env 值、连接串、对象存储 endpoint / bucket、secret、命令值、spool 路径或 token。");
  return `${lines.join("\n")}\n`;
}

function buildProductionEnvFixChecklist(preflight) {
  const items = Array.isArray(preflight?.fixChecklist)
    ? preflight.fixChecklist.map((item) => ({
        key: stringValue(item.key || "unknown"),
        label: stringValue(item.label || item.key || "生产环境预检项"),
        status: stringValue(item.status || "pending"),
        ready: item.ready === true,
        blocking: item.blocking !== false,
        severity: stringValue(item.severity || (item.ready ? "ok" : item.blocking === false ? "warning" : "blocking")),
        ownerRole: stringValue(item.ownerRole || "技术/管理"),
        requiredVariables: stringList(item.requiredVariables),
        recommendedVariables: stringList(item.recommendedVariables),
        configuredVariableCount: numberOrZero(item.configuredVariableCount),
        totalVariableCount: numberOrZero(item.totalVariableCount),
        missingVariables: stringList(item.missingVariables),
        placeholderVariableCount: numberOrZero(item.placeholderVariableCount),
        placeholderVariables: stringList(item.placeholderVariables),
        valueGuidance: stringList(item.valueGuidance),
        verificationSteps: stringList(item.verificationSteps),
        nextAction: stringValue(item.nextAction),
      }))
    : [];
  return {
    included: items.length > 0,
    status: stringValue(preflight?.status || ""),
    ready: preflight?.ready === true,
    checkedAt: stringValue(preflight?.checkedAt || ""),
    summary: preflight?.summary || {},
    fixItemCount: items.length,
    blockingItemCount: items.filter((item) => item.severity === "blocking").length,
    warningItemCount: items.filter((item) => item.severity === "warning").length,
    placeholderVariableCount: items.reduce((total, item) => total + item.placeholderVariableCount, 0),
    items,
  };
}

function formatProductionEnvFixChecklistMarkdown(report) {
  const checklist = report.productionEnvFixChecklist;
  const lines = [
    "# ERP V1 生产环境修正清单",
    "",
    `- 生成时间：${report.checkedAt}`,
    "- 来源：生产 env setup 当前预检",
    `- 状态：${checklist.ready ? "READY" : "BLOCKED"}`,
    `- 汇总：${checklist.summary?.label || "未返回"}`,
    `- 修正项：${checklist.fixItemCount} 项；阻塞 ${checklist.blockingItemCount} 项；提醒 ${checklist.warningItemCount} 项`,
    `- 未替换占位变量：${checklist.placeholderVariableCount} 个`,
    "",
    "## 修正项",
    "",
    "| 负责人 | 项目 | 级别 | 状态 | 配置数 | 必填变量 | 需补变量 | 占位变量 | 填写提示 | 复核步骤 | 下一步 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...checklist.items.map((item) =>
      `| ${escapeMarkdownTable(item.ownerRole)} | ${escapeMarkdownTable(item.label)} | ${escapeMarkdownTable(item.severity)} | ${escapeMarkdownTable(item.status)} | ${escapeMarkdownTable(`${item.configuredVariableCount}/${item.totalVariableCount}`)} | ${escapeMarkdownTable(item.requiredVariables.join(", ") || "无")} | ${escapeMarkdownTable(item.missingVariables.join(", ") || "无")} | ${escapeMarkdownTable(item.placeholderVariables.join(", ") || "无")} | ${escapeMarkdownTable(item.valueGuidance.join("; ") || "无")} | ${escapeMarkdownTable(item.verificationSteps.join("; ") || "无")} | ${escapeMarkdownTable(item.nextAction)} |`,
    ),
    "",
    "## 使用规则",
    "",
    "- 只把真实连接串、对象存储密钥、命令路径、spool 路径和 token 写入安全的未跟踪 env 文件。",
    "- 修正后重新运行生产环境变量预检、第一阶段执行器、release-candidate 和 go-live suite。",
    "- 该清单只帮助分派生产环境配置工作；它不能替代真实服务联通、现场证据、负责人签字或 V1/V2 边界确认。",
    "",
  ];
  return lines.join("\n");
}

function formatProductionEnvFixChecklistCsv(items) {
  const header = [
    "key",
    "label",
    "ownerRole",
    "severity",
    "status",
    "configuredVariableCount",
    "totalVariableCount",
    "requiredVariables",
    "missingVariables",
    "placeholderVariables",
    "valueGuidance",
    "verificationSteps",
    "nextAction",
  ];
  const rows = items.map((item) => [
    item.key,
    item.label,
    item.ownerRole,
    item.severity,
    item.status,
    item.configuredVariableCount,
    item.totalVariableCount,
    item.requiredVariables.join("; "),
    item.missingVariables.join("; "),
    item.placeholderVariables.join("; "),
    item.valueGuidance.join("; "),
    item.verificationSteps.join("; "),
    item.nextAction,
  ]);
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function buildProductionEnvValueIntakeChecklist(fixChecklist, generatedAt) {
  const rows = [];
  for (const item of fixChecklist.items ?? []) {
    if (!item.missingVariables.length && !item.placeholderVariables.length) continue;
    const fallbackOptionalStatementExport =
      item.key === "statement-export-object-storage-env" && item.configuredVariableCount === 0;
    for (const group of envTemplateAssignmentGroupsForItem(item)) {
      if (!group.assignments.length) continue;
      const alternativeRule =
        group.assignments.length > 1
          ? `任选其一，优先使用 ${group.assignments[0].key}；现场已有标准变量名时才选其它别名`
          : fallbackOptionalStatementExport
            ? "可选独立 bucket；附件对象存储 fallback 完整时本变量组可不填"
            : fillRuleForAssignment(group.assignments[0]);
      const alternativeGroup = group.assignments.length > 1 ? group.assignments.map((assignment) => assignment.key).join(" / ") : "";
      for (const assignment of group.assignments) {
        rows.push({
          itemKey: item.key,
          label: item.label,
          ownerRole: item.ownerRole,
          severity: fallbackOptionalStatementExport ? "warning" : item.severity,
          status: fallbackOptionalStatementExport ? "optional_fallback" : item.status,
          variableKey: assignment.key,
          alternativeGroup,
          alternativeRule,
          sourceSystem: sourceSystemForEnvFixItem(item.key),
          expectedValueType: expectedValueTypeForVariable(assignment.key, group.sourceText),
          safeLiteralValue: assignment.isSafeLiteral ? assignment.value : "",
          fillStatus: fallbackOptionalStatementExport
            ? "可选：独立 bucket 才填写"
            : assignment.isSafeLiteral
              ? "复制安全字面值后复核"
              : "待填写真实值",
          verifiedStatus: fallbackOptionalStatementExport ? "附件 fallback 完整后复核" : "待预检",
          evidenceRef: "",
          sourceText: group.sourceText,
          verificationSteps: item.verificationSteps.join("; "),
          nextAction: fallbackOptionalStatementExport
            ? "优先补齐附件对象存储 fallback；如财务要求独立 bucket，再补齐对账导出独立变量。"
            : item.nextAction,
        });
      }
    }
  }
  return {
    included: fixChecklist.included,
    status: fixChecklist.ready ? "ready" : rows.length ? "pending_real_values" : "no_missing_env_values",
    ready: fixChecklist.ready === true && rows.length === 0,
    generatedAt: stringValue(generatedAt),
    rowCount: rows.length,
    chooseOneGroupCount: new Set(rows.map((row) => row.alternativeGroup).filter(Boolean)).size,
    rows,
    safeguards: {
      envValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageSecretIncluded: false,
      commandValueIncluded: false,
      tokenIncluded: false,
    },
  };
}

function formatProductionEnvValueIntakeMarkdown(report) {
  const checklist = report.productionEnvValueIntakeChecklist;
  const lines = [
    "# ERP V1 生产 env 真实值填写 / 验收清单",
    "",
    `- 生成时间：${report.checkedAt}`,
    "- 来源：生产 env setup 当前预检",
    `- 状态：${checklist.ready ? "READY" : checklist.rowCount ? "PENDING / 待填写真实值" : "无缺失真实值行"}`,
    `- 待填写 / 复核行：${checklist.rowCount}`,
    `- 任选其一变量组：${checklist.chooseOneGroupCount}`,
    "",
    "## 使用规则",
    "",
    "- `任选其一` 的变量组只需要填写其中一个，优先使用清单里的第一个变量名。",
    "- `safeLiteralValue` 只会出现 `postgres`、`object_storage`、`false`、`true` 等安全字面值；真实连接串、bucket、secret、命令路径、spool 路径和 token 不写入本清单。",
    "- 现场填完真实值后，在 `filled`、`verified`、`evidenceRef` 三列打勾或回填证据编号，再重跑 env 文件安全审计和生产 env 变量预检。",
    "",
  ];
  if (!checklist.rows.length) {
    lines.push("当前 production env setup 预检没有需要填写的真实值行。", "");
    return lines.join("\n");
  }
  lines.push(
    "## 清单",
    "",
    "| 负责人 | 项目 | 变量 | 替代组 | 填写规则 | 来源系统 | 值类型 | 安全字面值 | 填写状态 | 验收状态 | 证据编号 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...checklist.rows.map((row) =>
      `| ${escapeMarkdownTable(row.ownerRole)} | ${escapeMarkdownTable(row.label)} | ${escapeMarkdownTable(row.variableKey)} | ${escapeMarkdownTable(row.alternativeGroup || "无")} | ${escapeMarkdownTable(row.alternativeRule)} | ${escapeMarkdownTable(row.sourceSystem)} | ${escapeMarkdownTable(row.expectedValueType)} | ${escapeMarkdownTable(row.safeLiteralValue || "不在清单填写")} | ${escapeMarkdownTable(row.fillStatus)} | ${escapeMarkdownTable(row.verifiedStatus)} |  |`,
    ),
    "",
  );
  return lines.join("\n");
}

function formatProductionEnvValueIntakeCsv(rows) {
  const header = [
    "itemKey",
    "label",
    "ownerRole",
    "severity",
    "status",
    "variableKey",
    "alternativeGroup",
    "alternativeRule",
    "sourceSystem",
    "expectedValueType",
    "safeLiteralValue",
    "filled",
    "verified",
    "evidenceRef",
    "fillStatus",
    "verifiedStatus",
    "verificationSteps",
    "nextAction",
  ];
  const csvRows = rows.map((row) => [
    row.itemKey,
    row.label,
    row.ownerRole,
    row.severity,
    row.status,
    row.variableKey,
    row.alternativeGroup,
    row.alternativeRule,
    row.sourceSystem,
    row.expectedValueType,
    row.safeLiteralValue,
    "",
    "",
    "",
    row.fillStatus,
    row.verifiedStatus,
    row.verificationSteps,
    row.nextAction,
  ]);
  return `${[header, ...csvRows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function buildProductionEnvMinimumValueIntakeChecklist(checklist) {
  const rows = minimumProductionEnvValueRows(Array.isArray(checklist?.rows) ? checklist.rows : []);
  return {
    included: Boolean(checklist?.included),
    status: rows.length ? "pending_minimum_real_values" : "no_blocking_env_values",
    ready: rows.length === 0 && checklist?.ready === true,
    generatedAt: stringValue(checklist?.generatedAt),
    rowCount: rows.length,
    sourceRowCount: checklist?.rowCount ?? 0,
    variableCount: new Set(rows.map((row) => row.variableKey).filter(Boolean)).size,
    chooseOneGroupCount: new Set(rows.map((row) => row.alternativeGroup).filter(Boolean)).size,
    rows,
    safeguards: {
      envValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageSecretIncluded: false,
      commandValueIncluded: false,
      tokenIncluded: false,
      onlyBlockingRowsIncluded: true,
      onlyWhitelistedIntakeVariables: true,
      optionalFallbackRowsExcluded: true,
      safeLiteralRowsExcluded: true,
      nonPreferredAliasesExcluded: true,
    },
  };
}

function formatProductionEnvMinimumValueIntakeMarkdown(report) {
  const checklist = report.productionEnvMinimumValueIntakeChecklist;
  const lines = [
    "# ERP V1 生产 env 最小真实值填写 / 验收清单",
    "",
    `- 生成时间：${report.checkedAt}`,
    "- 来源：生产 env setup 当前预检的最小 blocking 路径",
    `- 状态：${checklist.ready ? "READY" : checklist.rowCount ? "PENDING / 先补这些真实值" : "无 blocking 真实值行"}`,
    `- 最小补值行：${checklist.rowCount}`,
    `- 来源全量行：${checklist.sourceRowCount}`,
    `- 任选其一变量组：${checklist.chooseOneGroupCount}`,
    "",
    "## 使用规则",
    "",
    "- 本清单只保留当前解除生产 env 阻塞所需的最小真实值路径。",
    "- 已排除 warning / optional fallback 行、安全字面值行和任选其一变量组里的非首选别名。",
    "- 现场先按本清单填写安全未跟踪真实值片段，dry-run 通过后再正式合并并继续第一阶段。",
    "- 真实连接串、bucket、secret、命令路径、spool 路径和 token 只能写入安全 env 文件或安全片段，不写入本清单。",
    "",
  ];
  if (!checklist.rows.length) {
    lines.push("当前 production env setup 预检没有 blocking 真实值行。", "");
    return lines.join("\n");
  }
  lines.push(
    "## 最小补值清单",
    "",
    "| 负责人 | 项目 | 变量 | 替代组 | 填写规则 | 来源系统 | 值类型 | 填写状态 | 验收状态 | 证据编号 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...checklist.rows.map((row) =>
      `| ${escapeMarkdownTable(row.ownerRole)} | ${escapeMarkdownTable(row.label)} | ${escapeMarkdownTable(row.variableKey)} | ${escapeMarkdownTable(row.alternativeGroup || "无")} | ${escapeMarkdownTable(row.alternativeRule)} | ${escapeMarkdownTable(row.sourceSystem)} | ${escapeMarkdownTable(row.expectedValueType)} | ${escapeMarkdownTable(row.fillStatus)} | ${escapeMarkdownTable(row.verifiedStatus)} |  |`,
    ),
    "",
  );
  return lines.join("\n");
}

function buildProductionEnvValuesFragmentTemplate(checklist) {
  const rows = Array.isArray(checklist?.rows) ? checklist.rows : [];
  return {
    included: Boolean(checklist?.included),
    status: rows.length ? "pending_real_values_fragment" : "no_missing_env_values",
    ready: rows.length === 0 && checklist?.ready === true,
    fileName: "production-env-values-fragment.template.env.example",
    rowCount: rows.length,
    variableCount: new Set(rows.map((row) => row.variableKey).filter(Boolean)).size,
    chooseOneGroupCount: checklist?.chooseOneGroupCount ?? 0,
    safeguards: {
      envValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageSecretIncluded: false,
      commandValueIncluded: false,
      tokenIncluded: false,
      onlyWhitelistedIntakeVariables: true,
    },
  };
}

function buildProductionEnvMinimumValuesFragmentTemplate(checklist) {
  const rows = minimumProductionEnvValueRows(Array.isArray(checklist?.rows) ? checklist.rows : []);
  return {
    included: Boolean(checklist?.included),
    status: rows.length ? "pending_minimum_real_values_fragment" : "no_blocking_env_values",
    ready: rows.length === 0 && checklist?.ready === true,
    fileName: "production-env-minimum-values-fragment.template.env.example",
    rowCount: rows.length,
    sourceRowCount: checklist?.rowCount ?? 0,
    variableCount: new Set(rows.map((row) => row.variableKey).filter(Boolean)).size,
    chooseOneGroupCount: new Set(rows.map((row) => row.alternativeGroup).filter(Boolean)).size,
    safeguards: {
      envValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageSecretIncluded: false,
      commandValueIncluded: false,
      tokenIncluded: false,
      onlyBlockingRowsIncluded: true,
      onlyWhitelistedIntakeVariables: true,
      optionalFallbackRowsExcluded: true,
      nonPreferredAliasesExcluded: true,
    },
  };
}

function minimumProductionEnvValueRows(rows) {
  const minimumRows = [];
  const seenAlternativeGroups = new Set();
  for (const row of rows) {
    if (row.severity !== "blocking") continue;
    if (row.status === "optional_fallback") continue;
    if (row.safeLiteralValue) continue;
    if (row.alternativeGroup) {
      const groupKey = `${row.itemKey}:${row.alternativeGroup}`;
      if (seenAlternativeGroups.has(groupKey)) continue;
      seenAlternativeGroups.add(groupKey);
      const preferredVariable = row.alternativeGroup
        .split(/\s*\/\s*/)
        .map((item) => item.trim())
        .filter(Boolean)[0];
      const preferredRow =
        rows.find(
          (candidate) =>
            candidate.itemKey === row.itemKey &&
            candidate.alternativeGroup === row.alternativeGroup &&
            candidate.variableKey === preferredVariable,
        ) || row;
      minimumRows.push(preferredRow);
      continue;
    }
    minimumRows.push(row);
  }
  return minimumRows;
}

function formatProductionEnvMinimumValuesFragmentTemplate(report) {
  const checklist = report.productionEnvValueIntakeChecklist;
  const rows = minimumProductionEnvValueRows(Array.isArray(checklist.rows) ? checklist.rows : []);
  const lines = [
    "# ERP V1 production env minimum real values fragment template",
    `# Generated: ${report.checkedAt}`,
    "# Source: production env setup minimum blocking path",
    "#",
    "# This file contains only the current minimum blocking path.",
    "# It excludes warning / optional fallback rows and non-preferred aliases from Choose one groups.",
    "# If the site already standardizes DATABASE_URL or PGURL instead of ERP_V1_DATABASE_URL, use the full production-env-values-fragment.template.env.example.",
    "# Copy this file to a secure, untracked env fragment before editing.",
    "# Uncomment every KEY=VALUE line below, then replace every <REPLACE_WITH_...> placeholder.",
    "# Do not commit real connection strings, object-storage secrets, command paths, command args, spool paths, or tokens.",
    "# Optional dry-run before first-stage; this validates the fragment without writing the target env:",
    "#   node -- scripts/run-v1-production-env-intake-apply.mjs --values-env-file <secure-minimum-values-env-fragment> --use-production-env-setup-env-file --intake-csv <production-env-real-value-intake-csv> --dry-run",
    "# Or let the first-stage runner dry-run the same merge and stop before later first-stage checks:",
    "#   node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-minimum-values-env-fragment> --production-env-values-dry-run --field-evidence-manifest <filled-field-evidence-manifest>",
    "# If bypassing the production env setup report, pass --target-env-file <secure-env-file> to the intake apply dry-run, or --env-file <secure-env-file> to the first-stage runner.",
    "",
  ];
  if (!rows.length) {
    lines.push("# 当前 production env setup 预检没有 blocking 真实值片段。");
    lines.push("# 仍需继续跑 warning 复核、runtime readiness、现场证据、真实设备 / 真机和负责人签字。");
    lines.push("");
    return lines.join("\n");
  }

  let lastItemKey = "";
  const printedAlternativeGroups = new Set();
  for (const row of rows) {
    if (row.itemKey !== lastItemKey) {
      if (lastItemKey) lines.push("");
      lines.push(`# ${String(row.severity || "blocking").toUpperCase()} | ${row.ownerRole} | ${row.label}`);
      if (row.sourceSystem) lines.push(`# Source: ${sanitizeEnvComment(row.sourceSystem)}`);
      if (row.nextAction) lines.push(`# Next: ${sanitizeEnvComment(row.nextAction)}`);
      lastItemKey = row.itemKey;
    }

    const alternativeKey = row.alternativeGroup ? `${row.itemKey}:${row.alternativeGroup}` : "";
    if (alternativeKey && !printedAlternativeGroups.has(alternativeKey)) {
      const alternatives = row.alternativeGroup
        .split(/\s*\/\s*/)
        .map((item) => item.trim())
        .filter(Boolean);
      lines.push(`# Minimum path uses: ${row.variableKey}; alternatives in full template: ${alternatives.join(" or ")}`);
      printedAlternativeGroups.add(alternativeKey);
    }
    if (row.expectedValueType) lines.push(`# Type: ${sanitizeEnvComment(row.expectedValueType)}`);
    const value = row.safeLiteralValue || `<REPLACE_WITH_${row.variableKey}>`;
    lines.push(`# ${row.variableKey}=${value}`);
  }
  lines.push("");
  return lines.join("\n");
}

function formatProductionEnvValuesFragmentTemplate(report) {
  const checklist = report.productionEnvValueIntakeChecklist;
  const rows = Array.isArray(checklist.rows) ? checklist.rows : [];
  const lines = [
    "# ERP V1 production env real values fragment template",
    `# Generated: ${report.checkedAt}`,
    "# Source: production env setup real-value intake checklist",
    "#",
    "# Copy this file to a secure, untracked env fragment before editing.",
    "# Uncomment only the KEY=VALUE lines you are filling, then replace every <REPLACE_WITH_...> placeholder.",
    "# For Choose one groups, uncomment only one alias and leave the unused aliases commented or delete them.",
    "# Do not commit real connection strings, object-storage secrets, command paths, command args, spool paths, or tokens.",
    "# The first-stage runner will merge only variables listed in production-env-real-value-intake.csv.",
    "# Optional dry-run before first-stage; this validates the fragment without writing the target env:",
    "#   node -- scripts/run-v1-production-env-intake-apply.mjs --values-env-file <secure-values-env-fragment> --use-production-env-setup-env-file --intake-csv <production-env-real-value-intake-csv> --dry-run",
    "# Or let the first-stage runner dry-run the same merge and stop before later first-stage checks:",
    "#   node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --production-env-values-dry-run --field-evidence-manifest <filled-field-evidence-manifest>",
    "# Run after filling:",
    "#   node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --field-evidence-manifest <filled-field-evidence-manifest>",
    "# If bypassing the production env setup report, pass --target-env-file <secure-env-file> to the intake apply dry-run, or --env-file <secure-env-file> to the first-stage runner.",
    "",
  ];
  if (!rows.length) {
    lines.push("# 当前 production env setup 预检没有需要填写的真实值片段。");
    lines.push("# 仍需继续跑 runtime readiness、现场证据、真实设备 / 真机和负责人签字。");
    lines.push("");
    return lines.join("\n");
  }

  let lastItemKey = "";
  const printedAlternativeGroups = new Set();
  for (const row of rows) {
    if (row.itemKey !== lastItemKey) {
      if (lastItemKey) lines.push("");
      lines.push(`# ${String(row.severity || "pending").toUpperCase()} | ${row.ownerRole} | ${row.label}`);
      if (row.sourceSystem) lines.push(`# Source: ${sanitizeEnvComment(row.sourceSystem)}`);
      if (row.nextAction) lines.push(`# Next: ${sanitizeEnvComment(row.nextAction)}`);
      lastItemKey = row.itemKey;
    }

    const alternativeKey = row.alternativeGroup ? `${row.itemKey}:${row.alternativeGroup}` : "";
    if (alternativeKey && !printedAlternativeGroups.has(alternativeKey)) {
      const alternatives = row.alternativeGroup
        .split(/\s*\/\s*/)
        .map((item) => item.trim())
        .filter(Boolean);
      lines.push(
        `# Choose one: ${alternatives.join(" or ")}; prefer ${alternatives[0] || row.variableKey} unless the site already standardizes another alias.`,
      );
      printedAlternativeGroups.add(alternativeKey);
    }
    if (row.expectedValueType) lines.push(`# Type: ${sanitizeEnvComment(row.expectedValueType)}`);
    const value = row.safeLiteralValue || `<REPLACE_WITH_${row.variableKey}>`;
    lines.push(`# ${row.variableKey}=${value}`);
  }
  lines.push("");
  return lines.join("\n");
}

function formatProductionEnvFillTemplate(report) {
  const checklist = report.productionEnvFixChecklist;
  const items = checklist.items.filter((item) => item.missingVariables.length || item.placeholderVariables.length);
  const lines = [
    "# ERP V1 production env fill template",
    `# Generated: ${report.checkedAt}`,
    "# Source: production env setup preflight",
    "#",
    "# Copy the needed commented KEY=VALUE lines into the secure, untracked env file before editing.",
    "# Replace every <REPLACE_WITH_...> placeholder before running preflight.",
    "# Do not commit real connection strings, object-storage secrets, command paths, command args, spool paths, or tokens.",
    "# Run after filling:",
    "#   node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
    "#   node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
    "# Use --env-file <secure-env-file> only when intentionally bypassing the production env setup report.",
    "",
  ];
  if (!items.length) {
    lines.push("# 当前 production env setup 预检没有缺失或占位变量。");
    lines.push("# 仍需继续跑 runtime readiness、现场证据、真实设备 / 真机和负责人签字。");
    lines.push("");
    return lines.join("\n");
  }
  for (const item of items) {
    const assignmentGroups = envTemplateAssignmentGroupsForItem(item);
    const assignments = assignmentGroups.flatMap((group) => group.assignments);
    lines.push(`# ${item.severity.toUpperCase()} | ${item.ownerRole} | ${item.label}`);
    if (item.nextAction) lines.push(`# Next: ${sanitizeEnvComment(item.nextAction)}`);
    for (const guidance of item.valueGuidance) lines.push(`# Fill: ${sanitizeEnvComment(guidance)}`);
    for (const verification of item.verificationSteps) lines.push(`# Verify: ${sanitizeEnvComment(verification)}`);
    if (!assignments.length) {
      lines.push("# 当前项没有可生成的 KEY=VALUE 占位行，请按修正清单手工补齐。");
      lines.push("");
      continue;
    }
    for (const group of assignmentGroups) {
      if (group.assignments.length > 1) {
        lines.push(
          `# Choose one: ${group.assignments.map((assignment) => assignment.key).join(" or ")}; prefer ${group.assignments[0].key} unless the site already standardizes another alias.`,
        );
      }
      for (const assignment of group.assignments) lines.push(`# ${assignment.key}=${assignment.value}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function envTemplateAssignmentGroupsForItem(item) {
  const variables = [...item.missingVariables, ...item.placeholderVariables];
  return variables.map(parseEnvVariableGroup).filter((group) => group.assignments.length);
}

function parseEnvVariableGroup(value) {
  const seen = new Set();
  const assignments = [];
  for (const option of stringValue(value).split(/\s+or\s+/i)) {
    for (const assignment of parseEnvVariableOption(option.trim())) {
      if (seen.has(assignment.key)) continue;
      seen.add(assignment.key);
      assignments.push(assignment);
    }
  }
  return { sourceText: stringValue(value), assignments };
}

function parseEnvVariableOption(value) {
  const exactAssignment = parseExactEnvVariableAssignment(value);
  if (exactAssignment) return [exactAssignment];
  return extractEnvVariableAssignments(value);
}

function parseExactEnvVariableAssignment(value) {
  const match = stringValue(value)
    .trim()
    .match(/^([A-Z][A-Z0-9_]*)(?:=([^\s#]+))?$/);
  if (!match) return null;
  const [, key, configuredValue = ""] = match;
  return buildEnvTemplateAssignment(key, configuredValue);
}

function extractEnvVariableAssignments(value) {
  const text = stringValue(value);
  const assignments = [];
  const variablePattern = /\b(?:ERP_[A-Z0-9_]*[A-Z0-9]|VITE_[A-Z0-9_]*[A-Z0-9]|DATABASE_URL|PGURL)\b/g;
  for (const match of text.matchAll(variablePattern)) {
    const key = match[0];
    const rest = text.slice(match.index + key.length);
    const valueMatch = rest.match(/^=([^\s#;]+)/);
    assignments.push(buildEnvTemplateAssignment(key, valueMatch?.[1] || ""));
  }
  return assignments;
}

function buildEnvTemplateAssignment(key, configuredValue = "") {
  const safeLiteral = safeEnvLiteralValue(key, configuredValue);
  return {
    key,
    value: safeLiteral || `<REPLACE_WITH_${key}>`,
    isSafeLiteral: Boolean(safeLiteral),
  };
}

function safeEnvLiteralValue(key, value) {
  const configuredValue = stringValue(value).trim();
  if (!configuredValue) return "";
  if (/^(postgres|object_storage|false|true|command_bridge|cups_lp|s3_compatible|http_json|deli)$/i.test(configuredValue)) {
    return configuredValue;
  }
  if (/^\d+$/.test(configuredValue) && /_TIMEOUT_MS$/.test(key)) return configuredValue;
  if (/^\[[\s\S]*\]$/.test(configuredValue) && /_ARGS_JSON$/.test(key) && !/secret|token|pass|key|url/i.test(configuredValue)) {
    return configuredValue;
  }
  return "";
}

function fillRuleForAssignment(assignment) {
  if (assignment.isSafeLiteral) return "复制安全字面值并复核";
  return "填写真实生产值";
}

function sourceSystemForEnvFixItem(key) {
  return (
    {
      "v1-persistence-profile": "PostgreSQL 生产库 / 持久化 profile",
      "attendance-payroll-integration-env": "工资 PostgreSQL / 得力考勤 HTTPS 网关",
      "postgres-restore-validation-env": "PostgreSQL 专用恢复验证库",
      "attachment-object-storage-env": "附件对象存储 bucket",
      "statement-export-object-storage-env": "对账导出对象存储 bucket",
      "system-printer-command-bridge-env": "办公室打印桥 / 命令桥",
      "cups-preflight-env": "CUPS 真实打印队列",
      "v1-readiness-identity-env": "生产 API / 办公室与司机验收账号",
      "v1-field-acceptance-report-env": "现场验收报告 / 归档目录",
      "local-v1-acceptance-bypass-env": "本地持久化例外签字",
    }[stringValue(key)] || "生产环境配置"
  );
}

function expectedValueTypeForVariable(key, sourceText) {
  const text = `${key} ${sourceText}`;
  if (/ERP_ATTENDANCE_PAYROLL_STORE|ERP_ATTENDANCE_PROVIDER_KEY/i.test(key)) return "固定字面值";
  if (/DATABASE_URL|POSTGRES/i.test(text)) return "PostgreSQL 连接串";
  if (/ENDPOINT|BASE_URL/i.test(key)) return "http/https URL";
  if (/BUCKET/i.test(key)) return "bucket 名称";
  if (/SECRET_ACCESS_KEY|TOKEN/i.test(key)) return "密钥 / token";
  if (/ACCESS_KEY_ID/i.test(key)) return "access key id";
  if (/ARGS_JSON/i.test(key)) return "JSON array";
  if (/TIMEOUT_MS/i.test(key)) return "正整数毫秒";
  if (/COMMAND$/i.test(key)) return "命令路径或命令名";
  if (/ALLOWLIST|PRINTER/i.test(key)) return "真实设备 / 队列名";
  if (/SPOOL_DIR|OUTPUT_DIR|MANIFEST/i.test(key)) return "安全本地路径 / 归档路径";
  if (/OPERATOR_ID/i.test(key)) return "生产账号 ID";
  if (/PROFILE|ADAPTER|MODE|ENABLED|ACCEPTED|RESET_ALLOWED/i.test(key)) return "固定字面值";
  return "按预检提示填写";
}

function csvCell(value) {
  return `"${stringValue(value).replace(/"/g, '""')}"`;
}

function escapeMarkdownTable(value) {
  return stringValue(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function sanitizeEnvComment(value) {
  return stringValue(value).replace(/\r?\n/g, " ").replace(/#/g, "＃");
}

function stringList(value) {
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter(Boolean) : [];
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stringValue(value) {
  return value == null ? "" : String(value);
}

function displayPath(path) {
  const fullPath = resolve(path);
  const relativePath = relative(workspaceRoot, fullPath);
  if (relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath)) return relativePath;
  return "<outside-workspace-env-file>";
}
