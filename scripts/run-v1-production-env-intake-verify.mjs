#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProductionEnvSetupEnvFiles } from "./productionEnvSetupEnvFileResolver.mjs";
import { buildProductionEnvFileAuditReport } from "./run-v1-production-env-file-audit.mjs";
import { loadEnvironment } from "./run-v1-production-env-preflight.mjs";

const defaultEnvFile = ".erp-local-storage/v1-production-env/secure-prod.env";
const defaultIntakeCsv = ".erp-local-storage/v1-production-env-setup/production-env-real-value-intake.csv";
const defaultOutputDir = ".erp-local-storage/v1-production-env-intake-verify";
const defaultProductionEnvSetupJsonPath = ".erp-local-storage/v1-production-env-setup/latest.json";
const attachmentObjectStorageRequiredNames = [
  "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT",
  "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET",
  "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID",
  "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
];
const statementExportObjectStorageRequiredNames = [
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
];
const requiredCsvHeaders = [
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

if (isCliEntrypoint()) {
  runCli();
}

export function buildProductionEnvIntakeVerifyReport(options = {}) {
  return buildReport(options);
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = buildReport(options);
    if (options.write !== false) writeReportFiles(report, options.outputDir);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatProductionEnvIntakeVerifyMarkdown(report));
    }
    process.exitCode = report.ready ? 0 : 2;
  } catch (error) {
    const message = safeErrorMessage(error);
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production env intake verification failed: ${message}\n`);
    }
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  const options = {
    envFiles: [],
    intakeCsv: defaultIntakeCsv,
    outputDir: defaultOutputDir,
    write: true,
    productionEnvSetupJson: defaultProductionEnvSetupJsonPath,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-write") {
      options.write = false;
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
      options.productionEnvSetupJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--intake-csv") {
      options.intakeCsv = readValue(args, index, arg);
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

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-production-env-intake-verify.mjs [options]",
    "",
    "Options:",
    "  --env-file <path>                    Secure production env file to verify. Can be repeated.",
    "  --use-production-env-setup-env-file  Reuse the secure env file recorded by production env setup.",
    "  --production-env-setup-json <path>   Production env setup JSON. Defaults to .erp-local-storage/v1-production-env-setup/latest.json.",
    "  --intake-csv <path>                  Production env real-value intake CSV.",
    "  --output-dir <path>                  Directory for latest.json / latest.md.",
    "  --no-write                           Do not write latest artifacts.",
    "  --json                               Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  No blocking intake/env mismatch was found",
    "  1  Runner error",
    "  2  Blocking intake/env mismatch remains",
    "",
    "This runner never prints env values, connection strings, object-storage values, command values, tokens, or env file paths.",
  ].join("\n");
}

function buildReport(options) {
  const envResolution = resolveProductionEnvIntakeEnvFiles(options);
  const envFiles = normalizeList(envResolution.envFiles);
  const intakeCsv = options.intakeCsv || defaultIntakeCsv;
  const checkedAt = new Date().toISOString();
  const setupFindings = [];
  let auditSummary = null;
  let env = {};
  const existingEnvFiles = [];
  for (const envFile of envFiles) {
    if (existsSync(resolve(envFile))) existingEnvFiles.push(envFile);
  }
  if (envFiles.length === 0) {
    setupFindings.push(blockingFinding("env-file-missing", "安全 env 文件", "未提供安全 env 文件。", "传入 --env-file <secure-env-file> 后重跑。"));
  } else if (existingEnvFiles.length !== envFiles.length) {
    setupFindings.push(
      blockingFinding(
        "env-file-not-found",
        "安全 env 文件存在性",
        "至少一个安全 env 文件不存在或不可读取；报告不会输出真实路径。",
        "确认安全 env 文件存在且权限可读后重跑。",
      ),
    );
  } else {
    const audit = buildProductionEnvFileAuditReport({ envFiles });
    auditSummary = summarizeAudit(audit);
    if (!audit.ready) {
      setupFindings.push(
        blockingFinding(
          "env-file-audit-blocked",
          "安全 env 文件审计",
          `${audit.summary?.blockingCount ?? 0} 项 env 文件安全审计阻塞。`,
          "先修正 env 文件安全审计阻塞，再重跑真实值 intake 校验。",
        ),
      );
    }
    env = loadEnvironment({ envFiles, baseEnv: {} });
  }

  let rows = [];
  let intakeParse = {
    status: "not_loaded",
    ready: false,
    rowCount: 0,
    missingHeaderCount: requiredCsvHeaders.length,
    missingHeaders: requiredCsvHeaders,
  };
  if (!existsSync(resolve(intakeCsv))) {
    setupFindings.push(
      blockingFinding(
        "intake-csv-not-found",
        "真实值 intake CSV",
        "生产 env 真实值填写 / 验收清单 CSV 不存在；报告不会输出真实路径。",
        "先运行生产 env setup 生成 production-env-real-value-intake.csv，或传入 --intake-csv。",
      ),
    );
  } else {
    const parsed = parseCsvTable(readFileSync(resolve(intakeCsv), "utf8"));
    const missingHeaders = requiredCsvHeaders.filter((header) => !parsed.headers.includes(header));
    intakeParse = {
      status: missingHeaders.length ? "invalid_headers" : "loaded",
      ready: missingHeaders.length === 0,
      rowCount: parsed.rows.length,
      headerCount: parsed.headers.length,
      missingHeaderCount: missingHeaders.length,
      missingHeaders,
    };
    if (missingHeaders.length > 0) {
      setupFindings.push(
        blockingFinding(
          "intake-csv-invalid-headers",
          "真实值 intake CSV 表头",
          `CSV 缺少 ${missingHeaders.length} 个必需列。`,
          "重新生成 production-env-real-value-intake.csv 后重跑。",
          missingHeaders,
        ),
      );
    } else {
      rows = parsed.rows.map(normalizeIntakeRow).filter((row) => row.variableKey);
    }
  }

  const alternativeGroups = buildAlternativeGroupResults(rows, env);
  const conditionalRules = {
    statementExportObjectStorage: buildStatementExportObjectStorageConditionalRule(rows, env),
  };
  const rowResults = rows.map((row) => buildRowResult(row, env, alternativeGroups, conditionalRules));
  const findings = [...setupFindings, ...alternativeGroups.filter((group) => group.severity !== "ok"), ...rowResults.filter((row) => row.severity !== "ok")];
  const blockingFindings = findings.filter((finding) => finding.severity === "blocking");
  const warningFindings = findings.filter((finding) => finding.severity === "warning");
  const passedRows = rowResults.filter((row) => row.status === "passed" || row.status === "not_required");
  const minimumTargets = buildMinimumTargetSummary({ rowResults, alternativeGroups });
  const status =
    blockingFindings.length > 0 ? "blocked" : warningFindings.length > 0 ? "ready_with_warnings" : "ready";
  return {
    scope: "v1_production_env_real_value_intake_verification",
    status,
    ready: blockingFindings.length === 0,
    checkedAt,
    summary: {
      label:
        blockingFindings.length > 0
          ? `${blockingFindings.length} 项真实值 intake / env 校验阻塞`
          : warningFindings.length > 0
            ? `无阻塞，仍有 ${warningFindings.length} 项需现场复核`
            : "真实值 intake / env 校验通过",
      envFileCount: envFiles.length,
      envFileSource: envResolution.source,
      envFileSourceLabel: envFileSourceLabel(envResolution.source),
      envFileSourceSummary: envResolution.summary,
      envFileFromProductionSetup: envResolution.usedProductionEnvSetup,
      envFilePathIncluded: false,
      intakeCsvPathIncluded: false,
      intakeRowCount: rowResults.length,
      configuredRowCount: rowResults.filter((row) => row.configured).length,
      missingRowCount: rowResults.filter((row) => !row.configured && row.status !== "not_required").length,
      configuredLabel: `${rowResults.filter((row) => row.configured).length}/${rowResults.length}`,
      fullIntakeConfiguredLabel: `${rowResults.filter((row) => row.configured).length}/${rowResults.length}`,
      alternativeGroupCount: alternativeGroups.length,
      alternativeGroupBlockingCount: alternativeGroups.filter((group) => group.severity === "blocking").length,
      alternativeGroupWarningCount: alternativeGroups.filter((group) => group.severity === "warning").length,
      minimumBlockingTargetCount: minimumTargets.blocking.targetCount,
      minimumBlockingSatisfiedCount: minimumTargets.blocking.satisfiedCount,
      minimumBlockingMissingCount: minimumTargets.blocking.missingCount,
      minimumBlockingVariableRowCount: minimumTargets.blocking.variableRowCount,
      minimumBlockingAlternativeGroupCount: minimumTargets.blocking.alternativeGroupCount,
      minimumBlockingTargetSignature: minimumTargets.blocking.targetSignature,
      minimumBlockingLabel: `${minimumTargets.blocking.satisfiedCount}/${minimumTargets.blocking.targetCount}`,
      minimumWarningTargetCount: minimumTargets.warning.targetCount,
      minimumWarningSatisfiedCount: minimumTargets.warning.satisfiedCount,
      minimumWarningMissingCount: minimumTargets.warning.missingCount,
      minimumWarningVariableRowCount: minimumTargets.warning.variableRowCount,
      minimumWarningAlternativeGroupCount: minimumTargets.warning.alternativeGroupCount,
      minimumWarningTargetSignature: minimumTargets.warning.targetSignature,
      minimumWarningLabel: `${minimumTargets.warning.satisfiedCount}/${minimumTargets.warning.targetCount}`,
      passedRowCount: passedRows.length,
      blockingCount: blockingFindings.length,
      warningCount: warningFindings.length,
      auditReady: auditSummary?.ready === true,
      intakeCsvReady: intakeParse.ready,
    },
    envFileAudit: auditSummary,
    intakeCsv: intakeParse,
    conditionalRules,
    alternativeGroups,
    rows: rowResults,
    blockingFindings,
    warningFindings,
    safeguards: {
      nonMutating: true,
      envFilePathIncluded: false,
      intakeCsvPathIncluded: false,
      envValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      secretFieldsIncluded: false,
      commandValueIncluded: false,
      spoolPathIncluded: false,
      tokenIncluded: false,
      rawEnvLineIncluded: false,
      rawEvidenceRefIncluded: false,
      envFileReadFromProductionSetup: envResolution.usedProductionEnvSetup,
    },
    nextActions: buildNextActions({ blockingFindings, warningFindings }),
  };
}

function resolveProductionEnvIntakeEnvFiles({
  envFiles = [],
  productionEnvSetupJson = defaultProductionEnvSetupJsonPath,
  useProductionEnvSetupEnvFile = false,
} = {}) {
  if (envFiles.length) {
    return {
      envFiles,
      source: "cli",
      summary: `${envFiles.length} 个命令行 env 文件`,
      usedProductionEnvSetup: false,
    };
  }
  if (!useProductionEnvSetupEnvFile) {
    return {
      envFiles: [defaultEnvFile],
      source: "default",
      summary: "默认安全 env 文件",
      usedProductionEnvSetup: false,
    };
  }
  return resolveProductionEnvSetupEnvFiles({
    productionEnvSetupJsonPath: productionEnvSetupJson,
    useProductionEnvSetupEnvFile: true,
  });
}

function envFileSourceLabel(source) {
  if (source === "production_env_setup") return "生产 env setup 安全文件";
  if (source === "cli") return "命令行安全 env 文件";
  if (source === "default") return "默认安全 env 文件";
  return "未提供 env 文件";
}

function buildMinimumTargetSummary({ rowResults, alternativeGroups }) {
  const groupsByRequiredSeverity = {
    blocking: alternativeGroups.filter((group) => group.requiredSeverity === "blocking"),
    warning: alternativeGroups.filter((group) => group.requiredSeverity === "warning"),
  };
  const rowsByRequiredSeverity = {
    blocking: rowResults.filter(
      (row) =>
        row.type === "variable_row" &&
        row.requiredSeverity === "blocking" &&
        !row.alternativeGroup &&
        row.status !== "not_required",
    ),
    warning: rowResults.filter(
      (row) =>
        row.type === "variable_row" &&
        row.requiredSeverity === "warning" &&
        !row.alternativeGroup &&
        row.status !== "not_required",
    ),
  };
  return {
    blocking: summarizeMinimumTarget(rowsByRequiredSeverity.blocking, groupsByRequiredSeverity.blocking),
    warning: summarizeMinimumTarget(rowsByRequiredSeverity.warning, groupsByRequiredSeverity.warning),
  };
}

function summarizeMinimumTarget(variableRows, alternativeGroups) {
  const variableRowSatisfiedCount = variableRows.filter((row) => row.configured && row.safeLiteralMatches !== false && row.status !== "blocked").length;
  const alternativeGroupSatisfiedCount = alternativeGroups.filter((group) => group.configuredKeyCount > 0 && group.status !== "blocked").length;
  const targetCount = variableRows.length + alternativeGroups.length;
  const satisfiedCount = variableRowSatisfiedCount + alternativeGroupSatisfiedCount;
  const targetKeys = buildMinimumTargetKeys(variableRows, alternativeGroups);
  return {
    targetCount,
    satisfiedCount,
    missingCount: Math.max(0, targetCount - satisfiedCount),
    variableRowCount: variableRows.length,
    alternativeGroupCount: alternativeGroups.length,
    targetKeys,
    targetSignature: targetKeys.join("|"),
  };
}

function buildMinimumTargetKeys(variableRows, alternativeGroups) {
  return [
    ...variableRows.map((row) => `variable:${row.variableKey}`).filter((key) => key !== "variable:"),
    ...alternativeGroups
      .map((group) => `alternative-group:${group.alternativeGroup || group.groupKey || ""}`)
      .filter((key) => key !== "alternative-group:"),
  ].sort();
}

function normalizeList(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function summarizeAudit(audit) {
  return {
    status: audit.status,
    ready: audit.ready,
    envFileCount: audit.envFileCount,
    summary: {
      fileCount: audit.summary?.fileCount ?? 0,
      blockingCount: audit.summary?.blockingCount ?? 0,
      warningCount: audit.summary?.warningCount ?? 0,
      passedCount: audit.summary?.passedCount ?? 0,
      placeholderAssignmentCount: audit.summary?.placeholderAssignmentCount ?? 0,
      uncommentedAssignmentCount: audit.summary?.uncommentedAssignmentCount ?? 0,
      crossFileDuplicateVariableCount: audit.summary?.crossFileDuplicateVariableCount ?? 0,
    },
    safeguards: {
      envFilePathIncluded: false,
      envValuesIncluded: false,
      rawLineContentIncluded: false,
    },
  };
}

function parseCsvTable(text) {
  const matrix = parseCsv(text);
  const headers = (matrix.shift() || []).map((header) => String(header || "").trim());
  const rows = matrix
    .filter((cells) => cells.some((cell) => String(cell || "").trim()))
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
      if (char === '"') {
        if (value[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
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

function normalizeIntakeRow(row) {
  return {
    itemKey: cleanCell(row.itemKey),
    label: cleanCell(row.label),
    ownerRole: cleanCell(row.ownerRole),
    severity: normalizeSeverity(row.severity),
    sourceStatus: cleanCell(row.status),
    variableKey: cleanCell(row.variableKey),
    alternativeGroup: cleanCell(row.alternativeGroup),
    alternativeRule: cleanCell(row.alternativeRule),
    sourceSystem: cleanCell(row.sourceSystem),
    expectedValueType: cleanCell(row.expectedValueType),
    safeLiteralValue: cleanCell(row.safeLiteralValue),
    filled: cleanCell(row.filled),
    verified: cleanCell(row.verified),
    evidenceRef: cleanCell(row.evidenceRef),
    fillStatus: cleanCell(row.fillStatus),
    verifiedStatus: cleanCell(row.verifiedStatus),
    verificationSteps: cleanCell(row.verificationSteps),
    nextAction: cleanCell(row.nextAction),
  };
}

function cleanCell(value) {
  return String(value ?? "").trim();
}

function normalizeSeverity(value) {
  return String(value || "").trim().toLowerCase() === "warning" ? "warning" : "blocking";
}

function buildAlternativeGroupResults(rows, env) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.alternativeGroup) continue;
    if (!groups.has(row.alternativeGroup)) groups.set(row.alternativeGroup, []);
    groups.get(row.alternativeGroup).push(row);
  }
  return [...groups.entries()].map(([groupKey, groupRows]) => {
    const keys = unique(groupRows.map((row) => row.variableKey).filter(Boolean));
    const configuredKeys = keys.filter((key) => hasConfiguredValue(env, key));
    const uniqueValueCount = new Set(configuredKeys.map((key) => String(env[key]))).size;
    const groupSeverity = groupRows.some((row) => row.severity === "blocking") ? "blocking" : "warning";
    if (configuredKeys.length === 0) {
      return groupFinding({
        groupKey,
        keys,
        configuredKeyCount: 0,
        requiredSeverity: groupSeverity,
        severity: groupSeverity,
        status: groupSeverity === "blocking" ? "blocked" : "warning",
        detail: "任选其一变量组没有任何已配置变量。",
        nextAction: groupRows[0]?.alternativeRule || "按任选其一规则填写其中一个变量后重跑。",
      });
    }
    if (configuredKeys.length > 1 && uniqueValueCount > 1) {
      return groupFinding({
        groupKey,
        keys,
        configuredKeyCount: configuredKeys.length,
        requiredSeverity: groupSeverity,
        severity: "blocking",
        status: "blocked",
        detail: "任选其一变量组中多个别名同时配置，且最终值不一致；报告不会输出实际值。",
        nextAction: "只保留一个最终生效变量，或把多个别名统一为同一个值后重跑。",
      });
    }
    if (configuredKeys.length > 1) {
      return groupFinding({
        groupKey,
        keys,
        configuredKeyCount: configuredKeys.length,
        requiredSeverity: groupSeverity,
        severity: "warning",
        status: "warning",
        detail: "任选其一变量组中多个别名同时配置为同一值；建议清理为一个 canonical 变量。",
        nextAction: "优先保留清单中的第一个变量名，清理其它别名后重跑。",
      });
    }
    return groupFinding({
      groupKey,
      keys,
      configuredKeyCount: 1,
      requiredSeverity: groupSeverity,
      severity: "ok",
      status: "passed",
      detail: "任选其一变量组已有一个变量配置。",
      nextAction: "",
    });
  });
}

function groupFinding({ groupKey, keys, configuredKeyCount, requiredSeverity, severity, status, detail, nextAction }) {
  return {
    type: "alternative_group",
    key: `alternative-group:${groupKey}`,
    label: "任选其一变量组",
    alternativeGroup: groupKey,
    variables: keys.slice().sort(),
    configuredKeyCount,
    severity,
    requiredSeverity: requiredSeverity || severity,
    status,
    detail,
    nextAction,
  };
}

function buildStatementExportObjectStorageConditionalRule(rows, env) {
  const statementRows = rows.filter((row) => row.itemKey === "statement-export-object-storage-env");
  const independentKeys = statementExportObjectStorageRequiredNames.filter((key) =>
    statementRows.some((row) => row.variableKey === key),
  );
  const independentConfiguredKeys = independentKeys.filter((key) => hasConfiguredValue(env, key));
  const attachmentConfiguredKeys = attachmentObjectStorageRequiredNames.filter((key) => hasConfiguredValue(env, key));
  const attachmentFallbackReady = attachmentConfiguredKeys.length === attachmentObjectStorageRequiredNames.length;
  const independentConfiguredCount = independentConfiguredKeys.length;
  const independentTotalCount = independentKeys.length;
  const independentPartiallyConfigured =
    independentTotalCount > 0 && independentConfiguredCount > 0 && independentConfiguredCount < independentTotalCount;
  const usesAttachmentFallback = independentTotalCount > 0 && independentConfiguredCount === 0 && attachmentFallbackReady;
  return {
    key: "statement-export-object-storage-fallback",
    label: "对账导出对象存储 fallback 规则",
    status: usesAttachmentFallback
      ? "covered_by_attachment_fallback"
      : independentPartiallyConfigured
        ? "independent_config_incomplete"
        : independentConfiguredCount === independentTotalCount && independentTotalCount > 0
          ? "independent_config_complete"
          : "waiting_for_attachment_fallback_or_independent_config",
    ready: usesAttachmentFallback || (independentConfiguredCount === independentTotalCount && independentTotalCount > 0),
    attachmentFallbackReady,
    attachmentConfiguredCount: attachmentConfiguredKeys.length,
    attachmentTotalCount: attachmentObjectStorageRequiredNames.length,
    independentConfiguredCount,
    independentTotalCount,
    independentPartiallyConfigured,
    usesAttachmentFallback,
    envValuesIncluded: false,
    nextAction: usesAttachmentFallback
      ? "对账导出可复用附件对象存储 fallback；如财务要求独立 bucket，再另行补齐独立配置。"
      : independentPartiallyConfigured
        ? "对账导出独立 bucket 已部分配置，需补齐剩余独立变量或清空独立变量改走附件 fallback。"
        : "优先补齐附件对象存储 fallback；如财务要求独立 bucket，再补齐对账导出 4 个独立变量。",
  };
}

function buildRowResult(row, env, alternativeGroups, conditionalRules = {}) {
  const configured = hasConfiguredValue(env, row.variableKey);
  const group = row.alternativeGroup
    ? alternativeGroups.find((candidate) => candidate.alternativeGroup === row.alternativeGroup)
    : null;
  const groupSatisfied = Boolean(group && group.configuredKeyCount > 0);
  const safeLiteralRequired = Boolean(row.safeLiteralValue);
  const safeLiteralMatches =
    !safeLiteralRequired || (configured && String(env[row.variableKey]) === row.safeLiteralValue);
  const filledMarked = isMarked(row.filled);
  const verifiedMarked = isMarked(row.verified);
  const evidenceRefProvided = Boolean(row.evidenceRef);
  const base = {
    type: "variable_row",
    key: `variable:${row.itemKey}:${row.variableKey}`,
    itemKey: row.itemKey,
    label: row.label,
    ownerRole: row.ownerRole,
    requiredSeverity: row.severity,
    severity: "ok",
    status: "passed",
    variableKey: row.variableKey,
    alternativeGroup: row.alternativeGroup,
    sourceSystem: row.sourceSystem,
    expectedValueType: row.expectedValueType,
    configured,
    safeLiteralRequired,
    safeLiteralMatches,
    filledMarked,
    verifiedMarked,
    evidenceRefProvided,
    rawEvidenceRefIncluded: false,
    detail: "变量已配置，清单验收列已填写。",
    nextAction: "",
  };
  if (row.itemKey === "statement-export-object-storage-env") {
    const rule = conditionalRules.statementExportObjectStorage;
    if (rule?.usesAttachmentFallback && !configured) {
      return {
        ...base,
        status: "not_required",
        detail: "附件对象存储 fallback 已完整；对账导出独立对象存储变量本轮不强制填写。",
        nextAction: "保持对账导出独立变量为空，继续执行对象存储 live 预检和真实对账导出下载验证。",
      };
    }
    if (!configured && rule?.independentConfiguredCount === 0) {
      return {
        ...base,
        severity: "warning",
        status: "warning",
        configured: false,
        detail: "对账导出独立对象存储未配置；生产规则允许先补齐附件对象存储 fallback 后通过。",
        nextAction: rule.nextAction,
      };
    }
  }
  if (row.alternativeGroup && groupSatisfied && !configured) {
    return {
      ...base,
      status: "not_required",
      detail: "同一任选其一变量组已有其它变量配置，本变量不强制填写。",
    };
  }
  if (row.alternativeGroup && !groupSatisfied) {
    return {
      ...base,
      status: "covered_by_group_blocker",
      detail: "同一任选其一变量组尚未配置；阻塞已在组级结果中统计。",
    };
  }
  if (!configured) {
    const severity = row.severity;
    return {
      ...base,
      severity,
      status: severity === "blocking" ? "blocked" : "warning",
      configured: false,
      detail: severity === "blocking" ? "必填变量尚未在安全 env 文件中配置。" : "建议变量尚未在安全 env 文件中配置。",
      nextAction: row.nextAction || "把真实值填入安全 env 文件后重跑。",
    };
  }
  if (safeLiteralRequired && !safeLiteralMatches) {
    const severity = row.severity;
    return {
      ...base,
      severity,
      status: severity === "blocking" ? "blocked" : "warning",
      detail: `安全字面值不匹配；该变量应配置为 ${row.safeLiteralValue}。`,
      nextAction: `把 ${row.variableKey} 改为 ${row.safeLiteralValue} 后重跑。`,
    };
  }
  if (!filledMarked || !verifiedMarked || !evidenceRefProvided) {
    return {
      ...base,
      severity: "warning",
      status: "warning",
      detail: "安全 env 已配置，但 intake 清单的 filled / verified / evidenceRef 未完整回填。",
      nextAction: "现场复核后回填 filled、verified 和证据编号，再重跑校验。",
    };
  }
  return base;
}

function hasConfiguredValue(env, key) {
  if (!key || !Object.prototype.hasOwnProperty.call(env, key)) return false;
  const value = String(env[key] ?? "").trim();
  return Boolean(value) && !hasPlaceholderValue(value);
}

function hasPlaceholderValue(value) {
  return /^<(REPLACE_WITH|OPTIONAL)[^>]*>$/i.test(String(value ?? "").trim());
}

function isMarked(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "done", "filled", "verified", "ok", "x", "√", "✓", "已填", "已填写", "已验收", "已验证"].includes(
    normalized,
  );
}

function blockingFinding(key, label, detail, nextAction, variables = []) {
  return {
    type: "setup",
    key,
    label,
    severity: "blocking",
    status: "blocked",
    detail,
    variables,
    nextAction,
  };
}

function buildNextActions({ blockingFindings, warningFindings }) {
  if (blockingFindings.length > 0) {
    return unique(blockingFindings.map((finding) => finding.nextAction).filter(Boolean)).slice(0, 8);
  }
  if (warningFindings.length > 0) {
    return unique(warningFindings.map((finding) => finding.nextAction).filter(Boolean)).slice(0, 8);
  }
  return [
    "继续运行生产 env 变量预检、PostgreSQL 预检、对象存储 live 预检和生产第一阶段执行器。",
  ];
}

function writeReportFiles(report, outputDir = defaultOutputDir) {
  const fullOutputDir = resolve(outputDir || defaultOutputDir);
  mkdirSync(fullOutputDir, { recursive: true });
  writeFileSync(resolve(fullOutputDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(fullOutputDir, "latest.md"), formatProductionEnvIntakeVerifyMarkdown(report));
}

export function formatProductionEnvIntakeVerifyMarkdown(report) {
  const lines = [
    "# ERP V1 生产 env 真实值 intake 校验",
    "",
    `- 检查时间：${report.checkedAt}`,
    `- 结论：${report.ready ? "READY" : "BLOCKED"} / ${report.status}`,
    `- 摘要：${report.summary.label}`,
    `- 安全 env 文件数量：${report.summary.envFileCount}`,
    `- env 来源：${report.summary.envFileSourceLabel || "未记录"}`,
    `- intake 行数：${report.summary.intakeRowCount}`,
    `- 全量清单配置：${report.summary.fullIntakeConfiguredLabel || `${report.summary.configuredRowCount}/${report.summary.intakeRowCount}`}`,
    `- 最小阻塞补值：${report.summary.minimumBlockingLabel || "0/0"}（变量行 ${report.summary.minimumBlockingVariableRowCount ?? 0} + 任选组 ${report.summary.minimumBlockingAlternativeGroupCount ?? 0}）`,
    `- 建议 / 可选补值：${report.summary.minimumWarningLabel || "0/0"}（变量行 ${report.summary.minimumWarningVariableRowCount ?? 0} + 任选组 ${report.summary.minimumWarningAlternativeGroupCount ?? 0}）`,
    `- 任选其一变量组：${report.summary.alternativeGroupCount}`,
    `- 阻塞：${report.summary.blockingCount}`,
    `- 警告：${report.summary.warningCount}`,
    "",
    "## 安全边界",
    "",
    "- 报告不输出 env 文件路径、真实 env 值、连接串、endpoint、bucket、secret、命令值、spool 路径、token 或原始 env 行。",
    "- `evidenceRef` 只判断是否已填写，不在报告中复制证据编号原文。",
    "",
  ];
  if (report.blockingFindings.length) {
    lines.push("## 阻塞项", "", "| 类型 | 项目 | 状态 | 说明 | 下一步 |", "| --- | --- | --- | --- | --- |");
    for (const finding of report.blockingFindings) {
      lines.push(
        `| ${escapeMarkdownTable(finding.type)} | ${escapeMarkdownTable(finding.label || finding.key)} | ${escapeMarkdownTable(finding.status)} | ${escapeMarkdownTable(finding.detail)} | ${escapeMarkdownTable(finding.nextAction)} |`,
      );
    }
    lines.push("");
  }
  if (report.warningFindings.length) {
    lines.push("## 需复核项", "", "| 类型 | 项目 | 状态 | 说明 | 下一步 |", "| --- | --- | --- | --- | --- |");
    for (const finding of report.warningFindings.slice(0, 20)) {
      lines.push(
        `| ${escapeMarkdownTable(finding.type)} | ${escapeMarkdownTable(finding.label || finding.variableKey || finding.key)} | ${escapeMarkdownTable(finding.status)} | ${escapeMarkdownTable(finding.detail)} | ${escapeMarkdownTable(finding.nextAction)} |`,
      );
    }
    lines.push("");
  }
  if (report.alternativeGroups.length) {
    lines.push(
      "## 任选其一变量组",
      "",
      "| 替代组 | 变量数 | 已配置数 | 状态 | 说明 |",
      "| --- | ---: | ---: | --- | --- |",
      ...report.alternativeGroups.map(
        (group) =>
          `| ${escapeMarkdownTable(group.alternativeGroup)} | ${group.variables.length} | ${group.configuredKeyCount} | ${escapeMarkdownTable(group.status)} | ${escapeMarkdownTable(group.detail)} |`,
      ),
      "",
    );
  }
  if (report.conditionalRules?.statementExportObjectStorage) {
    const rule = report.conditionalRules.statementExportObjectStorage;
    lines.push(
      "## 条件覆盖规则",
      "",
      "| 规则 | 状态 | 附件 fallback | 独立配置 | 下一步 |",
      "| --- | --- | --- | --- | --- |",
      `| ${escapeMarkdownTable(rule.label)} | ${escapeMarkdownTable(rule.status)} | ${rule.attachmentConfiguredCount}/${rule.attachmentTotalCount} | ${rule.independentConfiguredCount}/${rule.independentTotalCount} | ${escapeMarkdownTable(rule.nextAction)} |`,
      "",
    );
  }
  lines.push(
    "## 变量行摘要",
    "",
    "| 负责人 | 项目 | 变量 | 已配置 | safeLiteral | 填写 | 验收 | 证据 | 状态 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...report.rows.map(
      (row) =>
        `| ${escapeMarkdownTable(row.ownerRole)} | ${escapeMarkdownTable(row.label)} | ${escapeMarkdownTable(row.variableKey)} | ${yesNo(row.configured)} | ${row.safeLiteralRequired ? yesNo(row.safeLiteralMatches) : "无"} | ${yesNo(row.filledMarked)} | ${yesNo(row.verifiedMarked)} | ${yesNo(row.evidenceRefProvided)} | ${escapeMarkdownTable(row.status)} |`,
    ),
    "",
  );
  if (report.nextActions.length) {
    lines.push("## 下一步", "", ...report.nextActions.map((action) => `- ${action}`), "");
  }
  return lines.join("\n");
}

function yesNo(value) {
  return value ? "是" : "否";
}

function escapeMarkdownTable(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values)];
}

function safeErrorMessage(error) {
  const message = String(error?.message || error || "unknown error");
  return message.replace(new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "<workspace>");
}
