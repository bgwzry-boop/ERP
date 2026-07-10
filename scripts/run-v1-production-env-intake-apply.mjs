#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveProductionEnvSetupEnvFiles } from "./productionEnvSetupEnvFileResolver.mjs";
import { buildProductionEnvFileAuditReport } from "./run-v1-production-env-file-audit.mjs";
import { buildProductionEnvPreflight, parseEnvFile } from "./run-v1-production-env-preflight.mjs";

const defaultTargetEnvFile = ".erp-local-storage/v1-production-env/secure-prod.env";
const defaultIntakeCsv = ".erp-local-storage/v1-production-env-setup/production-env-real-value-intake.csv";
const defaultProductionEnvSetupJsonPath = ".erp-local-storage/v1-production-env-setup/latest.json";
const defaultSetupOutputDir = ".erp-local-storage/v1-production-env-setup";
const defaultVerifyOutputDir = ".erp-local-storage/v1-production-env-intake-verify";
const defaultOutputDir = ".erp-local-storage/v1-production-env-intake-apply";
const requiredCsvHeaders = [
  "itemKey",
  "label",
  "ownerRole",
  "severity",
  "status",
  "variableKey",
  "alternativeGroup",
  "safeLiteralValue",
];

if (isCliEntrypoint()) {
  runCli();
}

export function buildProductionEnvIntakeApplyReport(options = {}) {
  return buildReport(normalizeOptions(options));
}

export function buildProductionEnvValuesFileFingerprint(path) {
  const content = readFileSync(resolve(path));
  const text = content.toString("utf8");
  return {
    algorithm: "sha256",
    digest: createHash("sha256").update(content).digest("hex"),
    digestIncluded: true,
    byteLength: content.byteLength,
    assignmentCount: Object.keys(parseEnvFile(text)).length,
    pathIncluded: false,
    envValuesIncluded: false,
    rawEnvLineIncluded: false,
  };
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = buildReport(options);
    if (options.writeReport !== false) writeReportFiles(report, options.outputDir);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatReport(report));
    }
    process.exit(report.ready ? 0 : 2);
  } catch (error) {
    const message = safeErrorMessage(error);
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production env intake apply failed: ${message}\n`);
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
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--no-write-report") {
      options.writeReport = false;
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
    if (arg === "--intake-csv") {
      options.intakeCsv = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--setup-output-dir") {
      options.setupOutputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--verify-output-dir") {
      options.verifyOutputDir = readValue(args, index, arg);
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
    intakeCsv: options.intakeCsv || defaultIntakeCsv,
    setupOutputDir: options.setupOutputDir || defaultSetupOutputDir,
    verifyOutputDir: options.verifyOutputDir || defaultVerifyOutputDir,
    outputDir: options.outputDir || defaultOutputDir,
    dryRun: Boolean(options.dryRun),
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
    "Usage: node scripts/run-v1-production-env-intake-apply.mjs --values-env-file <secure-values-env-fragment> [options]",
    "",
    "Options:",
    "  --values-env-file <path>   Secure env fragment with real values to merge. Required.",
    "  --target-env-file <path>   Target secure production env draft.",
    "  --use-production-env-setup-env-file",
    "                             Reuse the target secure env file recorded by production env setup when no --target-env-file is passed.",
    "  --production-env-setup-json <path>",
    "                             Production env setup JSON. Defaults to .erp-local-storage/v1-production-env-setup/latest.json.",
    "  --intake-csv <path>        Real-value intake CSV that defines the allowed variable whitelist.",
    "  --setup-output-dir <path>  Output dir refreshed by production env setup.",
    "  --verify-output-dir <path> Output dir refreshed by intake verification.",
    "  --output-dir <path>        Output dir for this apply report.",
    "  --dry-run                  Validate and report without changing the target env file.",
    "  --no-write-report          Do not write latest.json / latest.md.",
    "  --json                     Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  Values were applied and refreshed production env gates are ready.",
    "  1  Runner error.",
    "  2  Values were not applied, or remaining production env blockers exist.",
    "",
    "This runner never prints env values, env file paths, connection strings, object-storage values, command values, spool paths, tokens, or raw env lines.",
  ].join("\n");
}

function buildReport(options) {
  const checkedAt = new Date().toISOString();
  const valuesEnvFile = resolve(options.valuesEnvFile);
  const targetEnvFileResolution = resolveProductionEnvIntakeApplyTargetEnvFile(options);
  const targetEnvFile = resolve(targetEnvFileResolution.targetEnvFile);
  const intakeCsv = resolve(options.intakeCsv);
  const findings = [];

  if (!existsSync(valuesEnvFile)) {
    findings.push(finding("values-env-file-missing", "真实值 env 片段", "blocking", "未找到真实值 env 片段；报告不会输出真实路径。", "把真实值写入安全未跟踪 env 片段后重跑。"));
  }
  if (!existsSync(targetEnvFile)) {
    findings.push(finding("target-env-file-missing", "目标安全 env 文件", "blocking", "目标安全 env 文件不存在；报告不会输出真实路径。", "先运行生产 env setup 生成安全 env 草稿。"));
  }
  if (!existsSync(intakeCsv)) {
    findings.push(finding("intake-csv-missing", "真实值 intake CSV", "blocking", "真实值 intake CSV 不存在；报告不会输出真实路径。", "先运行生产 env setup 生成真实值清单。"));
  }

  const valuesAudit = existsSync(valuesEnvFile) ? safeAudit(valuesEnvFile, "values-env-file-audit", findings) : null;
  const targetAuditBefore = existsSync(targetEnvFile) ? safeAudit(targetEnvFile, "target-env-file-audit", findings) : null;
  const intake = existsSync(intakeCsv) ? readIntakeCsv(intakeCsv, findings) : emptyIntake();

  const valuesEnv = existsSync(valuesEnvFile) ? parseEnvFile(readFileSync(valuesEnvFile, "utf8")) : {};
  const sourceFingerprint = existsSync(valuesEnvFile) ? buildProductionEnvValuesFileFingerprint(valuesEnvFile) : null;
  const targetTextBefore = existsSync(targetEnvFile) ? readFileSync(targetEnvFile, "utf8") : "";
  const targetEnvBefore = existsSync(targetEnvFile) ? parseEnvFile(targetTextBefore) : {};
  const sourceKeys = Object.keys(valuesEnv).sort();
  const allowedKeys = new Set(intake.rows.map((row) => row.variableKey).filter(Boolean));
  const unknownSourceKeys = sourceKeys.filter((key) => !allowedKeys.has(key));
  const blankSourceKeys = sourceKeys.filter((key) => !hasConfiguredValue(valuesEnv[key]));
  const safeLiteralMismatches = intake.rows
    .filter((row) => row.safeLiteralValue && Object.prototype.hasOwnProperty.call(valuesEnv, row.variableKey))
    .filter((row) => String(valuesEnv[row.variableKey]) !== row.safeLiteralValue)
    .map((row) => row.variableKey)
    .sort();

  if (unknownSourceKeys.length > 0) {
    findings.push(
      finding(
        "values-contain-non-intake-keys",
        "真实值 env 片段变量白名单",
        "blocking",
        `真实值 env 片段包含 ${unknownSourceKeys.length} 个不在 intake 清单中的变量。`,
        "只保留真实值 intake CSV 里的变量，或先重新生成清单后再重跑。",
        unknownSourceKeys,
      ),
    );
  }
  if (safeLiteralMismatches.length > 0) {
    findings.push(
      finding(
        "safe-literal-mismatch",
        "安全固定值",
        "blocking",
        `${safeLiteralMismatches.length} 个安全固定值与 intake 清单要求不一致。`,
        "按 intake CSV 的 safeLiteralValue 修正后重跑。",
        safeLiteralMismatches,
      ),
    );
  }

  const updates = {};
  for (const key of sourceKeys) {
    if (!allowedKeys.has(key) || !hasConfiguredValue(valuesEnv[key])) continue;
    updates[key] = valuesEnv[key];
  }
  const mergedEnvPreview = { ...targetEnvBefore, ...updates };
  const alternativeGroupChecks = buildAlternativeGroupChecks(intake.rows, mergedEnvPreview);
  const dryRunProjection = options.dryRun
    ? buildDryRunProjection({ intakeRows: intake.rows, projectedEnv: mergedEnvPreview })
    : null;
  const alternativeGroupBlocking = alternativeGroupChecks.filter((item) => item.status === "blocked");
  const alternativeGroupWarnings = alternativeGroupChecks.filter((item) => item.status === "warning");
  if (alternativeGroupBlocking.length > 0) {
    findings.push(
      finding(
        "alternative-group-conflict",
        "任选其一变量组",
        "blocking",
        `${alternativeGroupBlocking.length} 个任选其一变量组存在多个不同最终值。`,
        "只保留一个 canonical 变量，或把同组别名统一为同一个值后重跑。",
        alternativeGroupBlocking.flatMap((group) => group.configuredKeys).sort(),
      ),
    );
  }
  if (Object.keys(updates).length === 0 && findings.every((item) => item.severity !== "blocking")) {
    findings.push(
      finding(
        "no-applicable-values",
        "可合并真实值",
        "blocking",
        "真实值 env 片段没有可写入的非空 intake 变量。",
        "在真实值 env 片段中填写 intake CSV 允许的变量后重跑。",
      ),
    );
  }

  const blockedBeforeWrite = findings.some((item) => item.severity === "blocking") || valuesAudit?.ready === false || targetAuditBefore?.ready === false || !intake.ready;
  let applied = false;
  let targetChanged = false;
  let targetMode = "";
  let setupRefresh = null;
  let intakeVerification = null;

  if (!blockedBeforeWrite && !options.dryRun) {
    const mergedText = mergeEnvText(targetTextBefore, updates);
    targetChanged = mergedText !== targetTextBefore;
    mkdirSync(dirname(targetEnvFile), { recursive: true });
    writeFileSync(targetEnvFile, mergedText, { mode: 0o600 });
    chmodSync(targetEnvFile, 0o600);
    applied = true;
    targetMode = fileMode(targetEnvFile);
    setupRefresh = runSetupRefresh({ targetEnvFile, outputDir: options.setupOutputDir });
    const refreshedIntakeCsv = resolve(options.setupOutputDir, "production-env-real-value-intake.csv");
    intakeVerification = runIntakeVerify({
      targetEnvFile,
      intakeCsv: refreshedIntakeCsv,
      outputDir: options.verifyOutputDir,
      useProductionEnvSetupEnvFile: targetEnvFileResolution.usedProductionEnvSetup && setupRefresh?.setupReady === true,
      productionEnvSetupJson: resolve(options.setupOutputDir, "latest.json"),
    });
  }

  const blockingFindings = findings.filter((item) => item.severity === "blocking");
  const warningFindings = [
    ...findings.filter((item) => item.severity === "warning"),
    ...alternativeGroupWarnings.map((group) =>
      finding(
        `alternative-group-warning:${group.groupKey}`,
        "任选其一变量组",
        "warning",
        "任选其一变量组中多个别名配置为同一个值；建议后续清理为一个 canonical 变量。",
        "优先保留清单中的第一个变量名，清理其它别名。",
        group.configuredKeys,
      ),
    ),
  ];
  const setupReady = setupRefresh?.setupReady === true;
  const preflightReady = setupRefresh?.envPreflight?.ready === true;
  const verificationReady = intakeVerification?.ready === true;
  const ready = applied && setupReady && preflightReady && verificationReady && blockingFindings.length === 0;
  const status = options.dryRun
    ? "dry_run"
    : blockingFindings.length > 0
      ? "blocked"
      : !applied
        ? "not_applied"
        : ready
          ? "ready"
          : "applied_with_remaining_blockers";

  return {
    scope: "v1_production_env_real_value_intake_apply",
    status,
    ready,
    checkedAt,
    dryRun: options.dryRun,
    summary: {
      label: ready
        ? "真实值已按 intake 清单合并，生产 env setup / 预检 / intake 校验均 ready"
        : options.dryRun
          ? "真实值合并 dry-run 已完成，未写入目标 env 文件"
          : blockingFindings.length > 0
            ? `${blockingFindings.length} 项阻塞，未写入目标 env 文件`
            : "真实值已写入，但生产 env 后续门禁仍未全部 ready",
      sourceAssignmentCount: sourceKeys.length,
      allowedVariableCount: allowedKeys.size,
      applicableValueCount: Object.keys(updates).length,
      blankSourceValueCount: blankSourceKeys.length,
      unknownSourceVariableCount: unknownSourceKeys.length,
      appliedVariableCount: applied ? Object.keys(updates).length : 0,
      targetChanged,
      targetMode,
      targetEnvFileFromProductionSetup: targetEnvFileResolution.usedProductionEnvSetup,
      setupReady,
      envPreflightReady: preflightReady,
      envPreflightPassedCount: setupRefresh?.envPreflight?.passedCount ?? 0,
      envPreflightTotalCount: setupRefresh?.envPreflight?.totalCount ?? 0,
      intakeVerificationReady: verificationReady,
      intakeVerificationBlockingCount: intakeVerification?.summary?.blockingCount ?? 0,
      intakeVerificationWarningCount: intakeVerification?.summary?.warningCount ?? 0,
      blockingCount: blockingFindings.length,
      warningCount: warningFindings.length,
      sourceEnvFileFingerprintIncluded: Boolean(sourceFingerprint?.digest),
    },
    sourceEnvFile: {
      pathIncluded: false,
      exists: existsSync(valuesEnvFile),
      auditReady: valuesAudit?.ready === true,
      auditStatus: valuesAudit?.status || "not_run",
      assignmentCount: sourceKeys.length,
      unknownVariableCount: unknownSourceKeys.length,
      blankValueCount: blankSourceKeys.length,
      fingerprint: sourceFingerprint,
    },
    targetEnvFile: {
      pathIncluded: false,
      exists: existsSync(targetEnvFile),
      auditReadyBefore: targetAuditBefore?.ready === true,
      auditStatusBefore: targetAuditBefore?.status || "not_run",
      applied,
      changed: targetChanged,
      fileMode: targetMode,
      source: targetEnvFileResolution.source,
      sourceLabel: targetEnvFileResolution.summary,
      fromProductionSetup: targetEnvFileResolution.usedProductionEnvSetup,
    },
    intakeCsv: {
      pathIncluded: false,
      ready: intake.ready,
      rowCount: intake.rows.length,
      allowedVariableCount: allowedKeys.size,
      missingHeaderCount: intake.missingHeaders.length,
      missingHeaders: intake.missingHeaders,
    },
    appliedVariables: Object.keys(updates).sort(),
    skippedVariables: {
      blankSourceVariables: blankSourceKeys,
      unknownSourceVariables: unknownSourceKeys,
      safeLiteralMismatches,
    },
    alternativeGroups: alternativeGroupChecks,
    dryRunProjection,
    setupRefresh,
    intakeVerification,
    blockingFindings,
    warningFindings,
    nextActions: buildNextActions({ ready, applied, blockingFindings, setupRefresh, intakeVerification, dryRun: options.dryRun, dryRunProjection }),
    safeguards: {
      envValuesExposed: false,
      envFilePathIncluded: false,
      sourceEnvFilePathIncluded: false,
      targetEnvFilePathIncluded: false,
      targetEnvFileReadFromProductionSetup: targetEnvFileResolution.usedProductionEnvSetup,
      intakeCsvPathIncluded: false,
      connectionStringExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      spoolPathExposed: false,
      tokenIncluded: false,
      rawEnvLineIncluded: false,
      sourceEnvFileFingerprintIncluded: Boolean(sourceFingerprint?.digest),
      sourceEnvFileFingerprintValuesExposed: false,
      onlyIntakeVariablesApplied: unknownSourceKeys.length === 0,
      targetFileMode0600: !applied || targetMode === "600",
    },
  };
}

function safeAudit(envFile, key, findings) {
  try {
    const audit = buildProductionEnvFileAuditReport({ envFiles: [envFile] });
    if (!audit.ready) {
      findings.push(
        finding(
          key,
          "env 文件安全审计",
          "blocking",
          `${audit.summary?.blockingCount ?? 0} 项 env 文件安全审计阻塞。`,
          "先修正 env 文件安全审计阻塞，再重跑真实值合并。",
        ),
      );
    }
    return {
      status: audit.status,
      ready: audit.ready,
      summary: {
        blockingCount: audit.summary?.blockingCount ?? 0,
        warningCount: audit.summary?.warningCount ?? 0,
        assignmentCount: audit.summary?.uncommentedAssignmentCount ?? 0,
      },
    };
  } catch {
    findings.push(finding(key, "env 文件安全审计", "blocking", "env 文件安全审计失败；报告不会输出真实路径。", "确认文件存在、可读且位于安全未跟踪位置。"));
    return { status: "error", ready: false, summary: { blockingCount: 1, warningCount: 0, assignmentCount: 0 } };
  }
}

function readIntakeCsv(path, findings) {
  const parsed = parseCsvTable(readFileSync(path, "utf8"));
  const missingHeaders = requiredCsvHeaders.filter((header) => !parsed.headers.includes(header));
  if (missingHeaders.length > 0) {
    findings.push(
      finding(
        "intake-csv-invalid-headers",
        "真实值 intake CSV 表头",
        "blocking",
        `CSV 缺少 ${missingHeaders.length} 个必需列。`,
        "重新生成 production-env-real-value-intake.csv 后重跑。",
        missingHeaders,
      ),
    );
  }
  return {
    ready: missingHeaders.length === 0,
    missingHeaders,
    rows: missingHeaders.length
      ? []
      : parsed.rows
          .map((row) => ({
            itemKey: cleanCell(row.itemKey),
            label: cleanCell(row.label),
            ownerRole: cleanCell(row.ownerRole),
            severity: cleanCell(row.severity) === "warning" ? "warning" : "blocking",
            status: cleanCell(row.status),
            variableKey: cleanCell(row.variableKey),
            alternativeGroup: cleanCell(row.alternativeGroup),
            safeLiteralValue: cleanCell(row.safeLiteralValue),
            nextAction: cleanCell(row.nextAction),
          }))
          .filter((row) => row.variableKey),
  };
}

function emptyIntake() {
  return { ready: false, missingHeaders: requiredCsvHeaders, rows: [] };
}

function resolveProductionEnvIntakeApplyTargetEnvFile({
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

function parseCsvTable(text) {
  const matrix = parseCsv(text);
  const headers = (matrix.shift() || []).map((header) => cleanCell(header));
  const rows = matrix
    .filter((cells) => cells.some((cell) => cleanCell(cell)))
    .map((cells) => {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] ?? "";
      });
      return row;
    });
  return { headers, rows };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const value = String(text ?? "");
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (inQuotes) {
      if (char === "\"") {
        if (value[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === "\"") {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char === "\r") continue;
    cell += char;
  }
  row.push(cell);
  if (row.length > 1 || row.some((part) => part !== "")) rows.push(row);
  return rows;
}

function buildAlternativeGroupChecks(rows, env) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.alternativeGroup) continue;
    if (!groups.has(row.alternativeGroup)) groups.set(row.alternativeGroup, []);
    groups.get(row.alternativeGroup).push(row.variableKey);
  }
  return [...groups.entries()].map(([groupKey, keys]) => {
    const uniqueKeys = [...new Set(keys)].sort();
    const configuredKeys = uniqueKeys.filter((key) => hasConfiguredValue(env[key]));
    const uniqueValues = [...new Set(configuredKeys.map((key) => String(env[key])))];
    const status = configuredKeys.length > 1 && uniqueValues.length > 1 ? "blocked" : configuredKeys.length > 1 ? "warning" : "passed";
    return {
      groupKey,
      variableCount: uniqueKeys.length,
      configuredKeyCount: configuredKeys.length,
      configuredKeys,
      status,
      rawValuesIncluded: false,
    };
  });
}

function buildDryRunProjection({ intakeRows, projectedEnv }) {
  const preflight = buildProductionEnvPreflight({ env: projectedEnv, envFiles: [] });
  return {
    envValuesIncluded: false,
    envFilePathIncluded: false,
    targetWouldBeWritten: false,
    productionEnvPreflight: {
      status: preflight.status,
      ready: preflight.ready === true,
      passedCount: preflight.summary?.passedCount ?? 0,
      totalCount: preflight.summary?.totalCount ?? 0,
      blockingCount: preflight.summary?.blockingCount ?? 0,
      warningCount: preflight.summary?.warningCount ?? 0,
      placeholderValueCount: preflight.summary?.placeholderValueCount ?? 0,
      firstRemainingFixItems: (preflight.fixChecklist?.items ?? [])
        .filter((item) => item.status !== "passed")
        .slice(0, 8)
        .map((item) => ({
          key: item.key,
          label: item.label,
          status: item.status,
          severity: item.severity,
          missingVariables: item.missingVariables ?? [],
          nextAction: item.nextAction,
        })),
    },
    intakeCoverage: buildProjectedIntakeCoverage(intakeRows, projectedEnv),
    minimumBlockingCoverage: buildMinimumBlockingCoverage(intakeRows, projectedEnv),
    minimumWarningCoverage: buildMinimumWarningCoverage(intakeRows, projectedEnv),
  };
}

function buildProjectedIntakeCoverage(rows, env) {
  const alternativeGroups = buildAlternativeGroupProjection(rows, env);
  const blockingAlternativeGroups = alternativeGroups.filter((group) => group.severity === "blocking");
  const warningAlternativeGroups = alternativeGroups.filter((group) => group.severity === "warning");
  const attachmentFallbackReady = [
    "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT",
    "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET",
    "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID",
    "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  ].every((key) => hasConfiguredValue(env[key]));
  const groupByKey = new Map(alternativeGroups.map((group) => [group.groupKey, group]));
  const rowResults = rows.map((row) => {
    const configured = hasConfiguredValue(env[row.variableKey]);
    const group = row.alternativeGroup ? groupByKey.get(row.alternativeGroup) : null;
    const coveredByGroup = Boolean(group && group.configuredKeyCount > 0);
    const optionalFallbackSatisfied = row.itemKey === "statement-export-object-storage-env" && attachmentFallbackReady && !configured;
    const required = row.severity !== "warning" && !optionalFallbackSatisfied && !coveredByGroup;
    const status = configured
      ? "configured"
      : optionalFallbackSatisfied
        ? "not_required_attachment_fallback"
        : coveredByGroup
          ? "covered_by_alternative_group"
          : required
            ? "missing_required"
            : "missing_warning";
    return {
      itemKey: row.itemKey,
      label: row.label,
      variableKey: row.variableKey,
      severity: row.severity,
      configured,
      status,
      nextAction: row.nextAction,
    };
  });
  const missingRequired = rowResults.filter((row) => row.status === "missing_required");
  const missingWarning = rowResults.filter((row) => row.status === "missing_warning");
  const notRequired = rowResults.filter((row) => row.status === "not_required_attachment_fallback" || row.status === "covered_by_alternative_group");
  return {
    rowCount: rowResults.length,
    configuredRowCount: rowResults.filter((row) => row.configured).length,
    notRequiredRowCount: notRequired.length,
    missingRequiredVariableCount: missingRequired.length,
    missingWarningVariableCount: missingWarning.length,
    alternativeGroupCount: alternativeGroups.length,
    alternativeGroupBlockingCount: blockingAlternativeGroups.length,
    alternativeGroupWarningCount: warningAlternativeGroups.length,
    firstMissingVariables: [...missingRequired, ...missingWarning].slice(0, 8).map((row) => ({
      itemKey: row.itemKey,
      label: row.label,
      variableKey: row.variableKey,
      severity: row.severity,
      status: row.status,
      nextAction: row.nextAction,
    })),
    alternativeGroups,
  };
}

function buildMinimumBlockingCoverage(rows, env) {
  return buildMinimumCoverage(rows, env, "blocking");
}

function buildMinimumWarningCoverage(rows, env) {
  return buildMinimumCoverage(rows, env, "warning");
}

function buildMinimumCoverage(rows, env, targetSeverity) {
  const severityRows = rows.filter((row) => (targetSeverity === "warning" ? row.severity === "warning" : row.severity !== "warning"));
  const effectiveRows = severityRows.filter((row) => !isOptionalStatementExportCoveredByAttachmentFallback(row, env));
  const alternativeGroups = buildAlternativeGroupProjection(effectiveRows, env).filter((group) =>
    effectiveRows.some((row) => row.alternativeGroup === group.groupKey),
  );
  const alternativeGroupKeys = new Set(alternativeGroups.map((group) => group.groupKey));
  const variableRows = effectiveRows.filter((row) => !row.alternativeGroup || !alternativeGroupKeys.has(row.alternativeGroup));
  const missingVariables = variableRows.filter((row) => !minimumVariableSatisfied(row, env));
  const missingAlternativeGroups = alternativeGroups.filter((group) => group.configuredKeyCount === 0);
  const conflictedAlternativeGroups = alternativeGroups.filter((group) => group.status === "blocked_conflict");
  const satisfiedAlternativeGroups = alternativeGroups.filter((group) => group.configuredKeyCount > 0 && group.status !== "blocked_conflict");
  const missingCount = missingVariables.length + missingAlternativeGroups.length + conflictedAlternativeGroups.length;
  const targetCount = variableRows.length + alternativeGroups.length;
  const satisfiedCount = variableRows.length - missingVariables.length + satisfiedAlternativeGroups.length;
  const targetKeys = buildMinimumCoverageTargetKeys(variableRows, alternativeGroups);
  return {
    ready: missingCount === 0,
    targetCount,
    satisfiedCount,
    missingCount,
    targetKeys,
    targetSignature: targetKeys.join("|"),
    variableRowCount: variableRows.length,
    configuredVariableRowCount: variableRows.length - missingVariables.length,
    missingVariableRowCount: missingVariables.length,
    alternativeGroupCount: alternativeGroups.length,
    satisfiedAlternativeGroupCount: satisfiedAlternativeGroups.length,
    missingAlternativeGroupCount: missingAlternativeGroups.length,
    conflictedAlternativeGroupCount: conflictedAlternativeGroups.length,
    firstMissingTargets: [
      ...missingVariables.map((row) => ({
        type: "variable",
        itemKey: row.itemKey,
        label: row.label,
        variableKey: row.variableKey,
        status: hasConfiguredValue(env[row.variableKey]) ? "safe_literal_mismatch" : targetSeverity === "warning" ? "missing_warning" : "missing_required",
        nextAction: hasConfiguredValue(env[row.variableKey])
          ? `按 intake CSV 的 safeLiteralValue 修正 ${row.variableKey} 后重跑 dry-run。`
          : row.nextAction,
      })),
      ...missingAlternativeGroups.map((group) => ({
        type: "alternative_group",
        itemKey: "",
        label: "任选其一变量组",
        variableKey: group.groupKey,
        status: targetSeverity === "warning" ? "missing_warning_group" : "missing_required_group",
        nextAction:
          targetSeverity === "warning"
            ? "如决定补齐建议 / 可选路径，按任选其一规则填写其中一个变量后重跑 dry-run。"
            : "按最小片段优先填写该组的 canonical 变量后重跑 dry-run。",
      })),
      ...conflictedAlternativeGroups.map((group) => ({
        type: "alternative_group",
        itemKey: "",
        label: "任选其一变量组",
        variableKey: group.groupKey,
        status: "conflicted_group",
        nextAction: "只保留一个 canonical 变量，或把同组别名统一为同一个值后重跑。",
      })),
    ].slice(0, 8),
    alternativeGroups,
  };
}

function buildMinimumCoverageTargetKeys(variableRows, alternativeGroups) {
  return [
    ...variableRows.map((row) => `variable:${row.variableKey}`).filter((key) => key !== "variable:"),
    ...alternativeGroups.map((group) => `alternative-group:${group.groupKey}`).filter((key) => key !== "alternative-group:"),
  ].sort();
}

function minimumVariableSatisfied(row, env) {
  if (!hasConfiguredValue(env[row.variableKey])) return false;
  if (!row.safeLiteralValue) return true;
  return String(env[row.variableKey]) === row.safeLiteralValue;
}

function isOptionalStatementExportCoveredByAttachmentFallback(row, env) {
  if (row.itemKey !== "statement-export-object-storage-env") return false;
  if (hasConfiguredValue(env[row.variableKey])) return false;
  return [
    "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT",
    "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET",
    "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID",
    "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  ].every((key) => hasConfiguredValue(env[key]));
}

function buildAlternativeGroupProjection(rows, env) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.alternativeGroup) continue;
    if (!groups.has(row.alternativeGroup)) groups.set(row.alternativeGroup, []);
    groups.get(row.alternativeGroup).push(row);
  }
  return [...groups.entries()].map(([groupKey, groupRows]) => {
    const uniqueKeys = [...new Set(groupRows.map((row) => row.variableKey))].sort();
    const configuredKeys = uniqueKeys.filter((key) => hasConfiguredValue(env[key]));
    const uniqueValues = [...new Set(configuredKeys.map((key) => String(env[key])))];
    const required = groupRows.some((row) => row.severity !== "warning");
    const status =
      configuredKeys.length > 1 && uniqueValues.length > 1
        ? "blocked_conflict"
        : configuredKeys.length === 0
          ? required
            ? "blocked_missing"
            : "warning_missing"
          : configuredKeys.length > 1
            ? "warning_duplicate_alias"
            : "passed";
    const severity = status.startsWith("blocked") ? "blocking" : status.startsWith("warning") ? "warning" : "ok";
    return {
      groupKey,
      variableCount: uniqueKeys.length,
      configuredKeyCount: configuredKeys.length,
      configuredKeys,
      status,
      severity,
      rawValuesIncluded: false,
    };
  });
}

function mergeEnvText(existingText, updates) {
  const updateKeys = new Set(Object.keys(updates));
  const applied = new Set();
  const output = [];
  for (const rawLine of String(existingText ?? "").replace(/\r\n/g, "\n").split("\n")) {
    const parsed = parseEnvLineKey(rawLine);
    if (!parsed || !updateKeys.has(parsed.key)) {
      output.push(rawLine);
      continue;
    }
    if (applied.has(parsed.key)) continue;
    output.push(`${parsed.key}=${formatEnvValue(updates[parsed.key])}`);
    applied.add(parsed.key);
  }
  const missingKeys = Object.keys(updates).filter((key) => !applied.has(key)).sort();
  if (missingKeys.length > 0) {
    if (output.length && output[output.length - 1] !== "") output.push("");
    output.push("# Applied from ERP V1 production env real-value intake source.");
    for (const key of missingKeys) output.push(`${key}=${formatEnvValue(updates[key])}`);
  }
  return `${output.join("\n").replace(/\n+$/, "")}\n`;
}

function parseEnvLineKey(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
  const equalsIndex = normalized.indexOf("=");
  if (equalsIndex <= 0) return null;
  const key = normalized.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  return { key };
}

function formatEnvValue(value) {
  const text = String(value ?? "");
  if (/[\r\n]/.test(text)) throw new Error("Env values must be single-line.");
  if (text === "" || /^[^\s#"'\\`$]+$/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\$/g, "\\$").replace(/`/g, "\\`")}"`;
}

function runSetupRefresh({ targetEnvFile, outputDir }) {
  const result = spawnSync(process.execPath, [
    resolve("scripts/run-v1-production-env-setup.mjs"),
    "--target",
    targetEnvFile,
    "--output-dir",
    outputDir,
    "--json",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    return {
      status: "blocked",
      ready: false,
      setupReady: false,
      envPreflight: { ready: false, passedCount: 0, totalCount: 0, blockingCount: 1, warningCount: 0 },
      summary: { label: "生产 env setup 刷新失败；报告不会输出真实路径。" },
      error: safeErrorMessage(result.stderr || result.stdout || "setup refresh failed"),
    };
  }
  const report = JSON.parse(result.stdout);
  return {
    status: report.status,
    ready: report.ready === true,
    setupReady: report.setupReady === true,
    checkedAt: report.checkedAt,
    summary: {
      label: report.summary?.label || "",
      remainingFixItemCount: report.summary?.remainingFixItemCount ?? 0,
    },
    envPreflight: {
      ready: report.envPreflight?.ready === true,
      status: report.envPreflight?.status || "not_run",
      passedCount: report.envPreflight?.passedCount ?? 0,
      totalCount: report.envPreflight?.totalCount ?? 0,
      blockingCount: report.envPreflight?.blockingCount ?? 0,
      warningCount: report.envPreflight?.warningCount ?? 0,
      firstRemainingFixItems: (report.envPreflight?.remainingFixItems ?? []).slice(0, 6).map((item) => ({
        key: item.key,
        label: item.label,
        status: item.status,
        missingVariables: item.missingVariables ?? [],
      })),
    },
    safeguards: {
      envFilePathIncluded: false,
      envValuesExposed: false,
      connectionStringExposed: false,
      secretFieldsExposed: false,
    },
  };
}

function runIntakeVerify({ targetEnvFile, intakeCsv, outputDir, useProductionEnvSetupEnvFile = false, productionEnvSetupJson = "" }) {
  const envFileArgs = useProductionEnvSetupEnvFile
    ? ["--use-production-env-setup-env-file", "--production-env-setup-json", productionEnvSetupJson]
    : ["--env-file", targetEnvFile];
  const result = spawnSync(process.execPath, [
    resolve("scripts/run-v1-production-env-intake-verify.mjs"),
    ...envFileArgs,
    "--intake-csv",
    intakeCsv,
    "--output-dir",
    outputDir,
    "--json",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 && result.status !== 2) {
    return {
      status: "error",
      ready: false,
      summary: { intakeRowCount: 0, blockingCount: 1, warningCount: 0 },
      error: safeErrorMessage(result.stderr || result.stdout || "intake verification failed"),
    };
  }
  const report = JSON.parse(result.stdout);
  return {
    status: report.status,
    ready: report.ready === true,
    checkedAt: report.checkedAt,
    summary: {
      intakeRowCount: report.summary?.intakeRowCount ?? 0,
      configuredRowCount: report.summary?.configuredRowCount ?? 0,
      missingRowCount: report.summary?.missingRowCount ?? 0,
      blockingCount: report.summary?.blockingCount ?? 0,
      warningCount: report.summary?.warningCount ?? 0,
      alternativeGroupBlockingCount: report.summary?.alternativeGroupBlockingCount ?? 0,
    },
    firstBlockingFindings: (report.blockingFindings ?? []).slice(0, 6).map((item) => ({
      type: item.type,
      label: item.label || item.variableKey || item.key,
      variableKey: item.variableKey,
      status: item.status,
      detail: item.detail,
      nextAction: item.nextAction,
    })),
    safeguards: {
      envFilePathIncluded: false,
      envValuesIncluded: false,
      rawEvidenceRefIncluded: false,
      envFileReadFromProductionSetup: Boolean(useProductionEnvSetupEnvFile),
    },
  };
}

function buildNextActions({ ready, applied, blockingFindings, setupRefresh, intakeVerification, dryRun, dryRunProjection }) {
  if (dryRun) {
    if (blockingFindings.length > 0) {
      return [...new Set(blockingFindings.map((item) => item.nextAction).filter(Boolean))].slice(0, 8);
    }
    const projectionActions = [];
    for (const item of dryRunProjection?.minimumBlockingCoverage?.firstMissingTargets ?? []) {
      projectionActions.push(`${item.label} / ${item.variableKey}：${item.nextAction || "补齐最小阻塞补值后重跑 dry-run"}`);
    }
    for (const item of dryRunProjection?.productionEnvPreflight?.firstRemainingFixItems ?? []) {
      projectionActions.push(`${item.label}：补齐 ${(item.missingVariables ?? []).slice(0, 5).join(", ") || item.nextAction || "按预检提示修正"}`);
    }
    for (const item of dryRunProjection?.minimumBlockingCoverage?.firstMissingTargets ?? []) {
      projectionActions.push(`${item.label} / ${item.variableKey}：${item.nextAction || "补齐最小 blocking 补值后重跑 dry-run"}`);
    }
    for (const item of dryRunProjection?.minimumWarningCoverage?.firstMissingTargets ?? []) {
      projectionActions.push(`${item.label} / ${item.variableKey}：${item.nextAction || "按需要补齐建议 / 可选变量后重跑 dry-run"}`);
    }
    for (const item of dryRunProjection?.intakeCoverage?.firstMissingVariables ?? []) {
      projectionActions.push(`${item.label} / ${item.variableKey}：${item.nextAction || "补齐真实值后重跑 dry-run"}`);
    }
    if (projectionActions.length > 0) return projectionActions.slice(0, 8);
    return ["dry-run 预计无生产 env 预检阻塞；确认后去掉 --dry-run 执行真实合并。"];
  }
  if (blockingFindings.length > 0) {
    return [...new Set(blockingFindings.map((item) => item.nextAction).filter(Boolean))].slice(0, 8);
  }
  if (!applied) {
    return ["修正真实值 env 片段后重跑合并。"];
  }
  if (ready) {
    return [
      "用 ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file> 重启生产 API。",
      "继续运行生产第一阶段执行器，完成 PostgreSQL / 对象存储 live 留证和 runtime smoke。",
    ];
  }
  const actions = [];
  for (const item of setupRefresh?.envPreflight?.firstRemainingFixItems ?? []) {
    actions.push(`${item.label}：补齐 ${(item.missingVariables ?? []).slice(0, 5).join(", ") || "按预检提示修正"}`);
  }
  for (const item of intakeVerification?.firstBlockingFindings ?? []) {
    actions.push(`${item.label}：${item.nextAction || item.detail}`);
  }
  return actions.length ? actions.slice(0, 8) : ["继续按 setup / intake 校验结果补齐剩余生产 env 项。"];
}

function finding(key, label, severity, detail, nextAction, variables = []) {
  return {
    key,
    label,
    severity,
    status: severity === "blocking" ? "blocked" : "warning",
    detail,
    nextAction,
    variables: [...new Set(variables)].sort(),
  };
}

function writeReportFiles(report, outputDir) {
  const fullOutputDir = resolve(outputDir || defaultOutputDir);
  mkdirSync(fullOutputDir, { recursive: true });
  writeFileSync(resolve(fullOutputDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(fullOutputDir, "latest.md"), formatReport(report));
}

export function formatReport(report) {
  const lines = [
    "# ERP V1 生产 env 真实值合并报告",
    "",
    `- 检查时间：${report.checkedAt}`,
    `- 结论：${report.ready ? "READY" : report.status.toUpperCase()}`,
    `- 摘要：${report.summary.label}`,
    `- 来源 KEY=VALUE 行：${report.summary.sourceAssignmentCount}`,
    `- intake 允许变量：${report.summary.allowedVariableCount}`,
    `- 可合并变量：${report.summary.applicableValueCount}`,
    `- 已写入变量：${report.summary.appliedVariableCount}`,
    `- 来源片段指纹：${report.summary.sourceEnvFileFingerprintIncluded ? "已记录" : "未记录"}`,
    "",
    "## 门禁",
    "",
    `- 来源 env 审计：${report.sourceEnvFile.auditReady ? "通过" : "未通过 / 未执行"}`,
    `- 目标 env 写入：${report.targetEnvFile.applied ? "已写入" : "未写入"}`,
    `- 目标 env 来源：${report.targetEnvFile.sourceLabel || "未记录"}`,
    `- 目标权限：${report.targetEnvFile.fileMode || "未写入"}`,
    `- setup 刷新：${report.setupRefresh?.setupReady ? "通过" : "未通过 / 未执行"}`,
    `- 生产 env 变量预检：${report.summary.envPreflightReady ? "通过" : "未通过 / 未执行"} (${report.summary.envPreflightPassedCount}/${report.summary.envPreflightTotalCount})`,
    `- intake 校验：${report.summary.intakeVerificationReady ? "通过" : "未通过 / 未执行"}，阻塞 ${report.summary.intakeVerificationBlockingCount} 项，警告 ${report.summary.intakeVerificationWarningCount} 项`,
    "",
  ];
  if (report.appliedVariables.length > 0) {
    lines.push("## 已处理变量", "", ...report.appliedVariables.map((key) => `- ${key}`), "");
  }
  if (report.dryRunProjection) {
    const projection = report.dryRunProjection;
    lines.push(
      "## Dry-run 写入后预计结果",
      "",
      `- 预计生产 env 变量预检：${projection.productionEnvPreflight.ready ? "通过" : "仍有阻塞"} (${projection.productionEnvPreflight.passedCount}/${projection.productionEnvPreflight.totalCount})`,
      `- 预计最小阻塞补值：${projection.minimumBlockingCoverage.ready ? "已补齐" : "仍缺项"} (${projection.minimumBlockingCoverage.satisfiedCount}/${projection.minimumBlockingCoverage.targetCount})，缺失 ${projection.minimumBlockingCoverage.missingCount} 项`,
      `- 预计建议 / 可选补值：${projection.minimumWarningCoverage.ready ? "已补齐或无需补齐" : "仍缺项"} (${projection.minimumWarningCoverage.satisfiedCount}/${projection.minimumWarningCoverage.targetCount})，缺失 ${projection.minimumWarningCoverage.missingCount} 项`,
      `- 预计 intake 覆盖：已配置 ${projection.intakeCoverage.configuredRowCount}/${projection.intakeCoverage.rowCount} 行，不需单独填写 ${projection.intakeCoverage.notRequiredRowCount} 行，必填缺失 ${projection.intakeCoverage.missingRequiredVariableCount} 行，警告缺失 ${projection.intakeCoverage.missingWarningVariableCount} 行`,
      `- 任选其一变量组：阻塞 ${projection.intakeCoverage.alternativeGroupBlockingCount} 组，警告 ${projection.intakeCoverage.alternativeGroupWarningCount} 组`,
      "",
    );
    if (projection.minimumBlockingCoverage.firstMissingTargets.length > 0) {
      lines.push(
        "### 预计仍缺的最小阻塞补值",
        "",
        ...projection.minimumBlockingCoverage.firstMissingTargets.map((item) => `- ${item.label} / ${item.variableKey}：${item.status}`),
        "",
      );
    }
    if (projection.minimumWarningCoverage.firstMissingTargets.length > 0) {
      lines.push(
        "### 预计仍缺的建议 / 可选补值",
        "",
        ...projection.minimumWarningCoverage.firstMissingTargets.map((item) => `- ${item.label} / ${item.variableKey}：${item.status}`),
        "",
      );
    }
    if (projection.productionEnvPreflight.firstRemainingFixItems.length > 0) {
      lines.push(
        "### 预计仍未通过的生产 env 预检项",
        "",
        ...projection.productionEnvPreflight.firstRemainingFixItems.map((item) => `- ${item.label}：${(item.missingVariables ?? []).join(", ") || item.status}`),
        "",
      );
    }
    if (projection.intakeCoverage.firstMissingVariables.length > 0) {
      lines.push(
        "### 预计仍缺的 intake 变量",
        "",
        ...projection.intakeCoverage.firstMissingVariables.map((item) => `- ${item.label} / ${item.variableKey}：${item.status}`),
        "",
      );
    }
  }
  if (report.blockingFindings.length > 0) {
    lines.push("## 阻塞", "", ...report.blockingFindings.map((item) => `- ${item.label}：${item.detail}`), "");
  }
  if (report.warningFindings.length > 0) {
    lines.push("## 需复核", "", ...report.warningFindings.slice(0, 10).map((item) => `- ${item.label}：${item.detail}`), "");
  }
  if (report.setupRefresh?.envPreflight?.firstRemainingFixItems?.length > 0) {
    lines.push("## 剩余预检项", "");
    for (const item of report.setupRefresh.envPreflight.firstRemainingFixItems) {
      lines.push(`- ${item.label}：${(item.missingVariables ?? []).join(", ") || item.status}`);
    }
    lines.push("");
  }
  if (report.nextActions.length > 0) {
    lines.push("## 下一步", "", ...report.nextActions.map((action) => `- ${action}`), "");
  }
  lines.push("安全边界：报告不输出 env 文件路径、真实 env 值、连接串、endpoint、bucket、secret、命令值、spool 路径、token 或原始 env 行。", "");
  return lines.join("\n");
}

function hasConfiguredValue(value) {
  return String(value ?? "").trim() !== "" && !/^<(REPLACE_WITH|OPTIONAL)[^>]*>$/i.test(String(value ?? "").trim());
}

function fileMode(path) {
  return existsSync(path) ? (statSync(path).mode & 0o777).toString(8).padStart(3, "0") : "";
}

function cleanCell(value) {
  return String(value ?? "").trim();
}

function safeErrorMessage(error) {
  const message = String(error?.message || error || "unknown error");
  return message.replace(new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "<workspace>");
}
