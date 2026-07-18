#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProductionEnvSetupEnvFiles } from "./productionEnvSetupEnvFileResolver.mjs";
import { redactMigrationText } from "./run-db-migrations.mjs";
import { redactCloseoutText } from "./run-v1-production-first-stage-closeout.mjs";
import { redactPersistenceEvidenceText } from "./run-v1-production-persistence-evidence.mjs";
import { redactRuntimeSmokeText } from "./run-v1-production-runtime-smoke.mjs";

const defaultOutputDir = ".erp-local-storage/v1-production-first-stage-execution";
const defaultFieldEvidenceManifestPath = "docs/development/v1-field-evidence-manifest.template.json";
const defaultFieldEvidenceCsvPath = ".erp-local-storage/v1-field-evidence-intake/evidence-items.csv";
const defaultProductionEnvIntakeCsvPath = ".erp-local-storage/v1-production-env-setup/production-env-real-value-intake.csv";
const defaultProductionEnvValuesApplyOutputDir = ".erp-local-storage/v1-production-env-intake-apply";
const defaultProductionEnvSetupOutputDir = ".erp-local-storage/v1-production-env-setup";
const defaultProductionEnvIntakeVerifyOutputDir = ".erp-local-storage/v1-production-env-intake-verify";
const defaultPersistenceEvidenceJsonPath = ".erp-local-storage/v1-production-persistence-evidence/latest.json";
const defaultRuntimeSmokeJsonPath = ".erp-local-storage/v1-production-runtime-smoke/latest.json";
const defaultTodoLoadPrecheckJsonPath = ".erp-local-storage/v1-todo-load-precheck/latest.json";
const defaultEvidenceSuggestionsOutputDir = ".erp-local-storage/v1-production-first-stage-evidence-suggestions";
const defaultProductionEnvSetupJsonPath = ".erp-local-storage/v1-production-env-setup/latest.json";
const fieldEvidenceManifestEnvName = "ERP_V1_FIELD_EVIDENCE_MANIFEST";
const defaultProductionEnvValuesDryRunProofMaxAgeHours = 24;

if (isCliEntrypoint()) runCli();

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = buildProductionFirstStageExecution({
      envFiles: options.envFiles,
      envFileFromProductionSetup: options.envFileFromProductionSetup,
      envFileSource: options.envFileSource,
      envFileSourceSummary: options.envFileSourceSummary,
      apiBaseUrl: options.apiBaseUrl,
      applyMigrations: options.applyMigrations,
      allowRestoreReset: options.allowRestoreReset,
      fieldEvidenceManifestPath: options.fieldEvidenceManifestPath,
      fieldEvidenceManifestSource: options.fieldEvidenceManifestSource,
      maxAgeHours: options.maxAgeHours,
      outputDir: options.outputDir,
      planOnly: options.planOnly,
      pgDumpCommand: options.pgDumpCommand,
      productionEnvIntakeCsvPath: options.productionEnvIntakeCsvPath,
      productionEnvSetupJsonPath: options.productionEnvSetupJsonPath,
      productionEnvValuesFile: options.productionEnvValuesFile,
      productionEnvValuesDryRun: options.productionEnvValuesDryRun,
      productionEnvValuesApplyOutputDir: options.productionEnvValuesApplyOutputDir,
      productionEnvSetupOutputDir: options.productionEnvSetupOutputDir,
      productionEnvIntakeVerifyOutputDir: options.productionEnvIntakeVerifyOutputDir,
      psqlCommand: options.psqlCommand,
      signedUrlTtlSeconds: options.signedUrlTtlSeconds,
      todoLoadPrecheckPath: options.todoLoadPrecheckPath,
    });
    const outputReport =
      options.write && !options.planOnly
        ? {
            ...report,
            artifacts: writeProductionFirstStageExecutionArtifacts(report, { outputDir: options.outputDir }),
          }
        : report;
    if (options.json) {
      process.stdout.write(`${JSON.stringify(outputReport, null, 2)}\n`);
    } else {
      process.stdout.write(formatProductionFirstStageExecution(outputReport));
    }
    process.exit(report.ready ? 0 : report.status === "error" ? 1 : 2);
  } catch (error) {
    const message = redactExecutionText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production first-stage execution failed: ${message}\n`);
    }
    process.exit(1);
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = {
    applyMigrations: false,
    allowRestoreReset: false,
    apiBaseUrl: "",
    envFiles: [],
    fieldEvidenceManifestPath: "",
    fieldEvidenceManifestSource: "",
    json: false,
    maxAgeHours: 72,
    outputDir: defaultOutputDir,
    planOnly: false,
    productionEnvSetupJsonPath: defaultProductionEnvSetupJsonPath,
    productionEnvIntakeCsvPath: defaultProductionEnvIntakeCsvPath,
    productionEnvValuesFile: "",
    productionEnvValuesApplyOutputDir: defaultProductionEnvValuesApplyOutputDir,
    productionEnvSetupOutputDir: defaultProductionEnvSetupOutputDir,
    productionEnvIntakeVerifyOutputDir: defaultProductionEnvIntakeVerifyOutputDir,
    pgDumpCommand: "pg_dump",
    productionEnvValuesDryRun: false,
    psqlCommand: "psql",
    signedUrlTtlSeconds: 120,
    todoLoadPrecheckPath: defaultTodoLoadPrecheckJsonPath,
    useProductionEnvSetupEnvFile: false,
    write: true,
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
    if (arg === "--plan-only") {
      options.planOnly = true;
      continue;
    }
    if (arg === "--apply-migrations") {
      options.applyMigrations = true;
      continue;
    }
    if (arg === "--allow-restore-reset") {
      options.allowRestoreReset = true;
      continue;
    }
    if (arg === "--use-production-env-setup-env-file") {
      options.useProductionEnvSetupEnvFile = true;
      continue;
    }
    if (arg === "--api-base-url") {
      options.apiBaseUrl = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--env-file") {
      options.envFiles.push(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--field-evidence-manifest") {
      options.fieldEvidenceManifestPath = readValue(args, index, arg);
      options.fieldEvidenceManifestSource = "cli";
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-env-setup-json") {
      options.productionEnvSetupJsonPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-env-intake-csv") {
      options.productionEnvIntakeCsvPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-env-values-file") {
      options.productionEnvValuesFile = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-env-values-dry-run") {
      options.productionEnvValuesDryRun = true;
      continue;
    }
    if (arg === "--production-env-values-apply-output-dir") {
      options.productionEnvValuesApplyOutputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-env-setup-output-dir") {
      options.productionEnvSetupOutputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-env-intake-verify-output-dir") {
      options.productionEnvIntakeVerifyOutputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--psql-command") {
      options.psqlCommand = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--pg-dump-command") {
      options.pgDumpCommand = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--signed-url-ttl-seconds") {
      options.signedUrlTtlSeconds = parsePositiveInteger(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--max-age-hours") {
      options.maxAgeHours = parseNonNegativeNumber(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--todo-load-precheck-json") {
      options.todoLoadPrecheckPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  const envFileResolution = resolveProductionFirstStageEnvFiles({
    envFiles: options.envFiles,
    productionEnvSetupJsonPath: options.productionEnvSetupJsonPath,
    useProductionEnvSetupEnvFile: options.useProductionEnvSetupEnvFile,
  });
  options.envFiles = envFileResolution.envFiles;
  options.envFileSource = envFileResolution.source;
  options.envFileSourceSummary = envFileResolution.summary;
  options.envFileFromProductionSetup = envFileResolution.usedProductionEnvSetup;
  if (!options.fieldEvidenceManifestPath) {
    const resolution = resolveFieldEvidenceManifest({
      envFiles: options.envFiles,
      env: process.env,
    });
    options.fieldEvidenceManifestPath = resolution.path;
    options.fieldEvidenceManifestSource = resolution.source;
  }
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function parsePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

function parseNonNegativeNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be zero or a positive number.`);
  return number;
}

function helpText() {
  return [
    "Usage: node -- scripts/run-v1-production-first-stage-execution.mjs --env-file <secure-env-file> [options]",
    "   or: node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file [options]",
    "",
    "Options:",
    "  --env-file <path>              Load secure production env file. Can be repeated.",
    "  --use-production-env-setup-env-file",
    "                                  When no --env-file is passed, reuse the safe env file recorded by production env setup.",
    "  --production-env-setup-json <path>",
    "                                  Production env setup JSON. Defaults to .erp-local-storage/v1-production-env-setup/latest.json.",
    "  --production-env-intake-csv <path>",
    "                                  Production env real-value intake CSV. Defaults to setup output production-env-real-value-intake.csv.",
    "  --production-env-values-file <path>",
    "                                  Optional secure env fragment with real values; when present, apply it through the intake whitelist before auditing.",
    "  --production-env-values-dry-run",
    "                                  With --production-env-values-file, only dry-run the whitelist merge and stop before later first-stage steps.",
    "  --production-env-values-apply-output-dir <path>",
    "                                  Output dir for the optional real-value apply report.",
    "  --production-env-setup-output-dir <path>",
    "                                  Output dir refreshed by the optional real-value apply step.",
    "  --production-env-intake-verify-output-dir <path>",
    "                                  Output dir refreshed by the optional real-value apply step.",
    "  --field-evidence-manifest <path> Filled V1 field evidence manifest for first-stage closeout.",
    "                                  Defaults to ERP_V1_FIELD_EVIDENCE_MANIFEST in secure env files, then process env, then the pending template.",
    "  --api-base-url <url>          Probe an already-running production API during runtime smoke instead of spawning a temporary API.",
    "  --plan-only                    Print the ordered first-stage command plan without running it.",
    "  --apply-migrations             Actually run db migrations with --apply before live persistence evidence.",
    "  --allow-restore-reset          Allow the persistence evidence step to reset only the dedicated restore-validation database.",
    "  --psql-command <path>          PostgreSQL client command. Defaults to psql.",
    "  --pg-dump-command <path>       PostgreSQL dump command for backup / restore evidence. Defaults to pg_dump.",
    "  --signed-url-ttl-seconds <n>   Object-storage signed URL probe TTL. Defaults to 120.",
    "  --max-age-hours <n>            Closeout source evidence freshness. Defaults to 72; 0 disables freshness blocking.",
    "  --todo-load-precheck-json <path> Redacted todo-load report consumed by closeout. Defaults to .erp-local-storage/v1-todo-load-precheck/latest.json.",
    "  --output-dir <path>            Write redacted execution files. Defaults to .erp-local-storage/v1-production-first-stage-execution.",
    "  --no-write                     Do not write JSON / Markdown execution files.",
    "  --json                         Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  First-stage production env / persistence execution reached closeout ready",
    "  1  Runner error",
    "  2  Plan-only or a readable first-stage blocker remains",
    "",
    "Default execution is non-business-mutating. Schema migration apply requires explicit --apply-migrations.",
    "After persistence evidence and runtime smoke pass, this runner consumes a separately generated todo-load report and writes first-stage evidence suggestions for human review; it never starts todo load by itself.",
  ].join("\n");
}

function resolveFieldEvidenceManifest({ explicitPath = "", envFiles = [], env = process.env } = {}) {
  if (isUsableManifestPath(explicitPath)) {
    return { path: explicitPath, source: "cli" };
  }
  for (let index = envFiles.length - 1; index >= 0; index -= 1) {
    const fromFile = readFieldEvidenceManifestFromEnvFile(envFiles[index]);
    if (isUsableManifestPath(fromFile)) return { path: fromFile, source: "secure_env_file" };
  }
  if (isUsableManifestPath(env?.[fieldEvidenceManifestEnvName])) {
    return { path: env[fieldEvidenceManifestEnvName], source: "process_env" };
  }
  return { path: defaultFieldEvidenceManifestPath, source: "default_template" };
}

function resolveProductionFirstStageEnvFiles({
  envFiles = [],
  productionEnvSetupJsonPath = defaultProductionEnvSetupJsonPath,
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
      envFiles: [],
      source: "none",
      summary: "未传入 env 文件",
      usedProductionEnvSetup: false,
    };
  }
  return resolveProductionEnvSetupEnvFiles({
    productionEnvSetupJsonPath,
    useProductionEnvSetupEnvFile: true,
  });
}

function resolveFieldEvidenceManifestPath(options = {}) {
  return resolveFieldEvidenceManifest(options).path;
}

function readFieldEvidenceManifestFromEnvFile(envFile) {
  try {
    const fullPath = resolve(envFile);
    if (!existsSync(fullPath)) return "";
    const parsed = parseEnvAssignments(readFileSync(fullPath, "utf8"));
    return parsed[fieldEvidenceManifestEnvName] || "";
  } catch {
    return "";
  }
}

function parseEnvAssignments(content) {
  const result = {};
  for (const rawLine of String(content || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = normalized.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    result[key] = unquoteEnvValue(normalized.slice(equalsIndex + 1).trim());
  }
  return result;
}

function unquoteEnvValue(value) {
  const text = String(value || "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function isUsableManifestPath(value) {
  const text = String(value || "").trim();
  return Boolean(text && !/^<[^>]+>$/.test(text));
}

function buildProductionFirstStageExecution({
  envFiles = [],
  envFileFromProductionSetup = false,
  envFileSource = envFiles.length ? "provided" : "none",
  envFileSourceSummary = "",
  applyMigrations = false,
  allowRestoreReset = false,
  apiBaseUrl = "",
  checkedAt = new Date().toISOString(),
  fieldEvidenceManifestPath = defaultFieldEvidenceManifestPath,
  fieldEvidenceManifestSource = fieldEvidenceManifestPath === defaultFieldEvidenceManifestPath ? "default_template" : "provided",
  maxAgeHours = 72,
  outputDir = defaultOutputDir,
  planOnly = false,
  pgDumpCommand = "pg_dump",
  productionEnvIntakeCsvPath = defaultProductionEnvIntakeCsvPath,
  productionEnvSetupJsonPath = defaultProductionEnvSetupJsonPath,
  productionEnvValuesFile = "",
  productionEnvValuesDryRun = false,
  productionEnvValuesApplyOutputDir = defaultProductionEnvValuesApplyOutputDir,
  productionEnvSetupOutputDir = defaultProductionEnvSetupOutputDir,
  productionEnvIntakeVerifyOutputDir = defaultProductionEnvIntakeVerifyOutputDir,
  psqlCommand = "psql",
  signedUrlTtlSeconds = 120,
  todoLoadPrecheckPath = defaultTodoLoadPrecheckJsonPath,
  stepExecutor = executeStepCommand,
} = {}) {
  const steps = buildExecutionSteps({
    applyMigrations,
    allowRestoreReset,
    apiBaseUrl,
    envFiles,
    envFileFromProductionSetup,
    fieldEvidenceManifestPath,
    maxAgeHours,
    outputDir,
    pgDumpCommand,
    productionEnvIntakeCsvPath,
    productionEnvSetupJsonPath,
    productionEnvValuesFile,
    productionEnvValuesDryRun,
    productionEnvValuesApplyOutputDir,
    productionEnvSetupOutputDir,
      productionEnvIntakeVerifyOutputDir,
      psqlCommand,
    signedUrlTtlSeconds,
    todoLoadPrecheckPath,
  });
  const stages = [];

  if (planOnly) {
    stages.push(...steps.map((step) => buildPlannedStage(step)));
  } else {
    for (const step of steps) {
      const result = stepExecutor(step);
      const stage = buildStageFromResult(step, result);
      stages.push(stage);
      if (stage.status !== "passed") break;
    }
  }

  const passedCount = stages.filter((stage) => stage.status === "passed").length;
  const plannedCount = stages.filter((stage) => stage.status === "planned").length;
  const errorCount = stages.filter((stage) => stage.status === "error").length;
  const blockingStages = stages.filter((stage) => stage.status === "blocked" || stage.status === "error");
  const valuesDryRun = Boolean(productionEnvValuesDryRun);
  const valuesDryRunPassed = valuesDryRun && !planOnly && stages.length === steps.length && blockingStages.length === 0;
  const ready = !valuesDryRun && !planOnly && stages.length === steps.length && blockingStages.length === 0;
  const status = planOnly
    ? "planned"
    : valuesDryRun
      ? errorCount > 0
        ? "error"
        : blockingStages.length > 0
          ? "blocked"
          : "values_dry_run_ready"
      : ready
        ? "ready"
        : errorCount > 0
          ? "error"
          : "blocked";
  const manifestSource = normalizeFieldEvidenceManifestSource(fieldEvidenceManifestSource);
  const manifestDefaultTemplateUsed = manifestSource === "default_template";
  const normalizedEnvFileSource = normalizeEnvFileSource(envFileSource, envFiles);

  return redactExecutionReport({
    status,
    ready,
    checkedAt,
    scope: "v1_production_first_stage_execution",
    summary: {
      label: planOnly
        ? valuesDryRun
          ? `${steps.length} 个第一阶段真实值片段 dry-run 步骤待执行`
          : `${steps.length} 个第一阶段步骤待执行`
        : ready
          ? `${passedCount}/${steps.length} 步骤通过`
          : valuesDryRunPassed
            ? "真实值片段 dry-run 通过，未写入目标 env，尚未执行第一阶段"
          : `${passedCount}/${steps.length} 步骤通过，仍有阻塞`,
      passedCount,
      plannedCount,
      totalCount: steps.length,
      blockingCount: blockingStages.length,
      errorCount,
      productionEnvIntakeCoverage: summarizeProductionEnvIntakeCoverage(stages, valuesDryRun),
      productionEnvValuesDryRunCoverage: summarizeProductionEnvValuesDryRunCoverage(stages, valuesDryRun),
    },
    execution: {
      envFileCount: envFiles.length,
      envFileSource: normalizedEnvFileSource,
      envFileSourceLabel: envFileSourceLabel(normalizedEnvFileSource),
      envFileSourceSummary:
        cleanString(envFileSourceSummary) || (normalizedEnvFileSource === "none" ? "未传入 env 文件" : `${envFiles.length} 个 env 文件`),
      envFileFromProductionSetup: Boolean(envFileFromProductionSetup || normalizedEnvFileSource === "production_env_setup"),
      actualEnvFilePathsIncluded: false,
      planOnly,
      applyMigrations,
      restoreResetExplicitlyAllowed: Boolean(allowRestoreReset),
      migrationApplyRequiresExplicitFlag: true,
      outputDirIncluded: false,
      apiBaseUrlIncluded: false,
      runtimeSmokeUsesExistingApi: Boolean(cleanString(apiBaseUrl)),
      fieldEvidenceManifestSource: manifestSource,
      fieldEvidenceManifestSourceLabel: fieldEvidenceManifestSourceLabel(manifestSource),
      fieldEvidenceManifestConfigured: !manifestDefaultTemplateUsed,
      fieldEvidenceManifestDefaultTemplateUsed: manifestDefaultTemplateUsed,
      fieldEvidenceManifestPathIncluded: false,
      fieldEvidenceManifestValueIncluded: false,
      productionEnvIntakeCsvPathIncluded: false,
      productionEnvValuesFileProvided: Boolean(cleanString(productionEnvValuesFile)),
      productionEnvValuesDryRun: valuesDryRun,
      productionEnvValuesDryRunStopsBeforeFirstStage: valuesDryRun,
      productionEnvValuesFilePathIncluded: false,
      productionEnvValuesApplyOutputDirIncluded: false,
      todoLoadPrecheckPathIncluded: false,
      todoLoadAutomaticallyExecuted: false,
    },
    stages,
    blockingStages,
    safeguards: {
      envValuesExposed: false,
      databaseUrlExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      objectKeyExposed: false,
      signedUrlExposed: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      payloadExposed: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
      businessDataMutated: false,
      productionEnvFileMutated: Boolean(
        !valuesDryRun &&
          cleanString(productionEnvValuesFile) &&
          stages.some((stage) => stage.key === "production-env-intake-apply" && stage.status === "passed"),
      ),
      schemaMigrationApplyExecuted: Boolean(applyMigrations && ready),
      declaresFullV1Complete: false,
    },
    nextActions: buildNextActions({
      ready,
      status,
      planOnly,
      blockingStages,
      applyMigrations,
      allowRestoreReset,
      envFileSource: normalizedEnvFileSource,
      fieldEvidenceManifestSource: manifestSource,
      productionEnvValuesDryRun: valuesDryRun,
    }),
  });
}

function summarizeProductionEnvIntakeCoverage(stages = [], valuesDryRun = false) {
  if (valuesDryRun) return { included: false };
  const stage = stages.find((item) => item.key === "production-env-intake-verify");
  const evidence = stage?.evidence || {};
  const included =
    evidence.reportParsed === true && evidence.scope === "v1_production_env_real_value_intake_verification";
  return {
    included,
    stageStatus: stringOrEmpty(stage?.status),
    reportReady: included ? evidence.reportReady === true : false,
    auditReady: included ? evidence.intakeAuditReady === true : false,
    intakeCsvReady: included ? evidence.intakeCsvReady === true : false,
    configuredLabel: stringOrEmpty(evidence.intakeConfiguredLabel),
    fullIntakeConfiguredLabel: stringOrEmpty(evidence.fullIntakeConfiguredLabel),
    configuredRowCount: numberOrNull(evidence.intakeConfiguredRowCount),
    intakeRowCount: numberOrNull(evidence.intakeRowCount),
    missingRowCount: numberOrNull(evidence.intakeMissingRowCount),
    blockingCount: numberOrNull(evidence.blockingCount),
    warningCount: numberOrNull(evidence.warningCount),
    alternativeGroupBlockingCount: numberOrNull(evidence.intakeAlternativeGroupBlockingCount),
    alternativeGroupWarningCount: numberOrNull(evidence.intakeAlternativeGroupWarningCount),
    minimumBlockingLabel: stringOrEmpty(evidence.minimumBlockingLabel),
    minimumBlockingSatisfiedCount: numberOrNull(evidence.minimumBlockingSatisfiedCount),
    minimumBlockingTargetCount: numberOrNull(evidence.minimumBlockingTargetCount),
    minimumBlockingMissingCount: numberOrNull(evidence.minimumBlockingMissingCount),
    minimumBlockingVariableRowCount: numberOrNull(evidence.minimumBlockingVariableRowCount),
    minimumBlockingAlternativeGroupCount: numberOrNull(evidence.minimumBlockingAlternativeGroupCount),
    minimumWarningLabel: stringOrEmpty(evidence.minimumWarningLabel),
    minimumWarningSatisfiedCount: numberOrNull(evidence.minimumWarningSatisfiedCount),
    minimumWarningTargetCount: numberOrNull(evidence.minimumWarningTargetCount),
    minimumWarningMissingCount: numberOrNull(evidence.minimumWarningMissingCount),
    minimumWarningVariableRowCount: numberOrNull(evidence.minimumWarningVariableRowCount),
    minimumWarningAlternativeGroupCount: numberOrNull(evidence.minimumWarningAlternativeGroupCount),
  };
}

function summarizeProductionEnvValuesDryRunCoverage(stages = [], enabled = false) {
  if (!enabled) return { included: false };
  const stage = stages.find((item) => item.key === "production-env-intake-apply-dry-run");
  const evidence = stage?.evidence || {};
  const included = evidence.dryRunProjectionIncluded === true;
  return {
    included,
    stageStatus: stringOrEmpty(stage?.status),
    targetWouldBeWritten: evidence.dryRunTargetWouldBeWritten === true,
    envPreflightReady: included ? evidence.projectedEnvPreflightReady === true : false,
    envPreflightPassedCount: numberOrNull(evidence.projectedEnvPreflightPassedCount),
    envPreflightTotalCount: numberOrNull(evidence.projectedEnvPreflightTotalCount),
    envPreflightBlockingCount: numberOrNull(evidence.projectedEnvPreflightBlockingCount),
    intakeConfiguredRowCount: numberOrNull(evidence.projectedIntakeConfiguredRowCount),
    intakeRowCount: numberOrNull(evidence.projectedIntakeRowCount),
    intakeMissingRequiredVariableCount: numberOrNull(evidence.projectedIntakeMissingRequiredVariableCount),
    intakeAlternativeGroupBlockingCount: numberOrNull(evidence.projectedIntakeAlternativeGroupBlockingCount),
    minimumBlockingReady: included ? evidence.projectedMinimumBlockingReady === true : false,
    minimumBlockingSatisfiedCount: numberOrNull(evidence.projectedMinimumBlockingSatisfiedCount),
    minimumBlockingTargetCount: numberOrNull(evidence.projectedMinimumBlockingTargetCount),
    minimumBlockingMissingCount: numberOrNull(evidence.projectedMinimumBlockingMissingCount),
    minimumBlockingVariableRowCount: numberOrNull(evidence.projectedMinimumBlockingVariableRowCount),
    minimumBlockingAlternativeGroupCount: numberOrNull(evidence.projectedMinimumBlockingAlternativeGroupCount),
    minimumBlockingTargetSignature: stringOrEmpty(evidence.projectedMinimumBlockingTargetSignature),
    minimumWarningReady: included ? evidence.projectedMinimumWarningReady === true : false,
    minimumWarningSatisfiedCount: numberOrNull(evidence.projectedMinimumWarningSatisfiedCount),
    minimumWarningTargetCount: numberOrNull(evidence.projectedMinimumWarningTargetCount),
    minimumWarningMissingCount: numberOrNull(evidence.projectedMinimumWarningMissingCount),
    minimumWarningTargetSignature: stringOrEmpty(evidence.projectedMinimumWarningTargetSignature),
  };
}

function normalizeEnvFileSource(source, envFiles = []) {
  if (source === "cli" || source === "production_env_setup" || source === "none" || source === "provided") return source;
  return envFiles.length ? "provided" : "none";
}

function envFileSourceLabel(source) {
  if (source === "cli") return "命令行 env 文件";
  if (source === "production_env_setup") return "生产 env setup 安全文件";
  if (source === "provided") return "外部调用提供";
  return "未传入 env 文件";
}

function normalizeFieldEvidenceManifestSource(source) {
  if (source === "cli" || source === "secure_env_file" || source === "process_env" || source === "default_template") {
    return source;
  }
  return "provided";
}

function fieldEvidenceManifestSourceLabel(source) {
  if (source === "cli") return "命令行参数";
  if (source === "secure_env_file") return "安全 env 文件";
  if (source === "process_env") return "当前进程 env";
  if (source === "default_template") return "默认 pending 模板";
  return "外部调用提供";
}

function buildExecutionSteps({
  applyMigrations,
  allowRestoreReset = false,
  apiBaseUrl,
  envFiles,
  envFileFromProductionSetup = false,
  fieldEvidenceManifestPath,
  maxAgeHours,
  outputDir: _outputDir,
  pgDumpCommand = "pg_dump",
  productionEnvIntakeCsvPath = defaultProductionEnvIntakeCsvPath,
  productionEnvSetupJsonPath = defaultProductionEnvSetupJsonPath,
  productionEnvValuesFile = "",
  productionEnvValuesDryRun = false,
  productionEnvValuesApplyOutputDir = defaultProductionEnvValuesApplyOutputDir,
  productionEnvSetupOutputDir = defaultProductionEnvSetupOutputDir,
  productionEnvIntakeVerifyOutputDir = defaultProductionEnvIntakeVerifyOutputDir,
  psqlCommand,
  signedUrlTtlSeconds,
  todoLoadPrecheckPath = defaultTodoLoadPrecheckJsonPath,
}) {
  const envArgs = envFiles.flatMap((envFile) => ["--env-file", envFile]);
  const safeEnvArgs = envFiles.flatMap(() => ["--env-file", "<secure-env-file>"]);
  const restoreResetArgs = allowRestoreReset ? ["--allow-restore-reset"] : [];
  const productionEnvValuesFileText = cleanString(productionEnvValuesFile);
  const valuesDryRun = Boolean(productionEnvValuesDryRun);
  if (valuesDryRun && !productionEnvValuesFileText) {
    throw new Error("--production-env-values-dry-run requires --production-env-values-file.");
  }
  if (productionEnvValuesFileText && envFiles.length !== 1) {
    throw new Error("--production-env-values-file requires exactly one resolved target --env-file.");
  }
  const productionEnvTargetArgs = envFileFromProductionSetup
    ? ["--use-production-env-setup-env-file", "--production-env-setup-json", productionEnvSetupJsonPath]
    : ["--target-env-file", envFiles[0]];
  const safeProductionEnvTargetArgs = envFileFromProductionSetup
    ? ["--use-production-env-setup-env-file", "--production-env-setup-json", "<production-env-setup-json>"]
    : ["--target-env-file", "<secure-env-file>"];
  const applyStep = productionEnvValuesFileText
    ? [
        ...(!valuesDryRun
          ? [
              {
                key: "production-env-values-dry-run-proof",
                label: "生产 env 真实值 dry-run 证明检查",
                script: "scripts/run-v1-production-env-values-dry-run-proof-check.mjs",
                args: [
                  "--values-env-file",
                  productionEnvValuesFileText,
                  ...productionEnvTargetArgs,
                  "--apply-report-json",
                  `${productionEnvValuesApplyOutputDir}/latest.json`,
                  "--max-age-hours",
                  String(defaultProductionEnvValuesDryRunProofMaxAgeHours),
                  "--json",
                ],
                safeArgs: [
                  "--values-env-file",
                  "<production-env-values-file>",
                  ...safeProductionEnvTargetArgs,
                  "--apply-report-json",
                  "<production-env-values-apply-output-json>",
                  "--max-age-hours",
                  String(defaultProductionEnvValuesDryRunProofMaxAgeHours),
                  "--json",
                ],
                expectsJson: true,
                successDetail:
                  "真实值 dry-run 证明仍有效，且真实值片段和目标安全 env 文件未在 dry-run 后修改。",
              },
            ]
          : []),
        {
          key: valuesDryRun ? "production-env-intake-apply-dry-run" : "production-env-intake-apply",
          label: valuesDryRun ? "生产 env 真实值白名单合并 dry-run" : "生产 env 真实值白名单合并",
          script: "scripts/run-v1-production-env-intake-apply.mjs",
          args: [
            "--values-env-file",
            productionEnvValuesFileText,
            ...productionEnvTargetArgs,
            "--intake-csv",
            productionEnvIntakeCsvPath,
            "--setup-output-dir",
            productionEnvSetupOutputDir,
            "--verify-output-dir",
            productionEnvIntakeVerifyOutputDir,
            "--output-dir",
            productionEnvValuesApplyOutputDir,
            ...(valuesDryRun ? ["--dry-run"] : []),
            "--json",
          ],
          safeArgs: [
            "--values-env-file",
            "<production-env-values-file>",
            ...safeProductionEnvTargetArgs,
            "--intake-csv",
            "<production-env-intake-csv>",
            "--setup-output-dir",
            "<production-env-setup-output-dir>",
            "--verify-output-dir",
            "<production-env-intake-verify-output-dir>",
            "--output-dir",
            "<production-env-values-apply-output-dir>",
            ...(valuesDryRun ? ["--dry-run"] : []),
            "--json",
          ],
          expectsJson: true,
          acceptedStatuses: valuesDryRun ? ["dry_run"] : [],
          successDetail: valuesDryRun
            ? "真实值 env 片段已完成 dry-run 预检；目标安全 env 草稿未写入，后续第一阶段未执行。"
            : "真实值 env 片段已按 intake 清单白名单合并到目标安全 env 草稿，并刷新 setup / intake 校验 latest。",
        },
      ]
    : [];
  if (valuesDryRun) return applyStep;
  return [
    ...applyStep,
    {
      key: "env-file-audit",
      label: "生产 env 文件安全审计",
      script: "scripts/run-v1-production-env-file-audit.mjs",
      args: [...envArgs, "--json"],
      safeArgs: [...safeEnvArgs, "--json"],
      expectsJson: true,
      successDetail: "真实生产 env 文件未被 git 跟踪、不是模板文件且没有未替换占位符。",
    },
    {
      key: "production-env-intake-verify",
      label: "生产 env 真实值 intake 校验",
      script: "scripts/run-v1-production-env-intake-verify.mjs",
      args: [...envArgs, "--intake-csv", productionEnvIntakeCsvPath, "--json"],
      safeArgs: [...safeEnvArgs, "--intake-csv", "<production-env-intake-csv>", "--json"],
      expectsJson: true,
      successDetail:
        "生产 env 真实值清单已和安全 env 文件核对；必填变量、任选别名组、安全固定值和现场回填状态没有阻塞。",
    },
    {
      key: "production-env-preflight",
      label: "生产 env 变量预检",
      script: "scripts/run-v1-production-env-preflight.mjs",
      args: [...envArgs, "--json"],
      safeArgs: [...safeEnvArgs, "--json"],
      expectsJson: true,
      successDetail: "生产 PostgreSQL、对象存储、打印和 readiness 所需变量已通过预检。",
    },
    {
      key: applyMigrations ? "db-migrations-apply" : "db-migrations-dry-run",
      label: applyMigrations ? "生产 PostgreSQL 迁移执行" : "数据库迁移计划 dry-run",
      script: "scripts/run-db-migrations.mjs",
      args: [...envArgs, applyMigrations ? "--apply" : "--dry-run", "--psql-command", psqlCommand],
      safeArgs: [
        ...safeEnvArgs,
        applyMigrations ? "--apply" : "--dry-run",
        "--psql-command",
        "<psql-command>",
      ],
      expectsJson: false,
      successDetail: applyMigrations
        ? "已按安全 env 对生产 PostgreSQL 执行迁移；后续仍以 PostgreSQL live 预检证明 schema_migrations 和核心表。"
        : "迁移计划已校验。若生产库尚未执行迁移，需要在备份窗口显式加 --apply-migrations 重新运行。",
    },
    {
      key: "persistence-evidence",
      label: "生产持久化首阶段留证",
      script: "scripts/run-v1-production-persistence-evidence.mjs",
      args: [
        ...envArgs,
        "--psql-command",
        psqlCommand,
        "--pg-dump-command",
        pgDumpCommand,
        ...restoreResetArgs,
        "--signed-url-ttl-seconds",
        String(signedUrlTtlSeconds),
        "--json",
      ],
      safeArgs: [
        ...safeEnvArgs,
        "--psql-command",
        "<psql-command>",
        "--pg-dump-command",
        "<pg-dump-command>",
        ...restoreResetArgs,
        "--signed-url-ttl-seconds",
        String(signedUrlTtlSeconds),
        "--json",
      ],
      expectsJson: true,
      successDetail: "PostgreSQL 结构 / 权限预检、备份 / 恢复抽样验证和对象存储 live 探针已汇总成脱敏留证。",
    },
    {
      key: "runtime-smoke",
      label: "生产 API 运行态 smoke",
      script: "scripts/run-v1-production-runtime-smoke.mjs",
      args: [...envArgs, ...runtimeSmokeApiArgs(apiBaseUrl), "--json"],
      safeArgs: [...safeEnvArgs, ...safeRuntimeSmokeApiArgs(apiBaseUrl), "--json"],
      expectsJson: true,
      successDetail: apiBaseUrl
        ? "已读取长驻生产 API 并确认 PostgreSQL / 对象存储运行态 profile。"
        : "API 已用同一份安全 env 启动并读回 PostgreSQL / 对象存储运行态 profile。",
    },
    {
      key: "first-stage-evidence-suggestions",
      label: "第一阶段现场证据建议",
      script: "scripts/run-v1-production-first-stage-evidence-suggestions.mjs",
      args: [
        "--persistence-evidence-json",
        defaultPersistenceEvidenceJsonPath,
        "--runtime-smoke-json",
        defaultRuntimeSmokeJsonPath,
        "--evidence-csv",
        defaultFieldEvidenceCsvPath,
        "--output-dir",
        defaultEvidenceSuggestionsOutputDir,
        "--json",
      ],
      safeArgs: [
        "--persistence-evidence-json",
        defaultPersistenceEvidenceJsonPath,
        "--runtime-smoke-json",
        defaultRuntimeSmokeJsonPath,
        "--evidence-csv",
        defaultFieldEvidenceCsvPath,
        "--output-dir",
        defaultEvidenceSuggestionsOutputDir,
        "--json",
      ],
      expectsJson: true,
      acceptedStatuses: ["review_required"],
      successDetail:
        "已生成 production_persistence / object_storage 现场证据回填建议；必须负责人复核后再应用，不能替代真实现场证据或签字。",
    },
    {
      key: "first-stage-closeout",
      label: "第一阶段负责人 closeout",
      script: "scripts/run-v1-production-first-stage-closeout.mjs",
      args: [
        "--field-evidence-manifest",
        fieldEvidenceManifestPath,
        "--max-age-hours",
        String(maxAgeHours),
        "--todo-load-precheck-json",
        todoLoadPrecheckPath,
        "--json",
      ],
      safeArgs: [
        "--field-evidence-manifest",
        "<field-evidence-manifest>",
        "--max-age-hours",
        String(maxAgeHours),
        "--todo-load-precheck-json",
        "<todo-load-precheck-json>",
        "--json",
      ],
      expectsJson: true,
      successDetail: "第一阶段自动化证据和生产持久化 / 对象存储现场证据可交负责人签收，并可进入真实打印链路。",
    },
  ];
}

function runtimeSmokeApiArgs(apiBaseUrl) {
  const value = cleanString(apiBaseUrl);
  return value ? ["--api-base-url", value] : [];
}

function safeRuntimeSmokeApiArgs(apiBaseUrl) {
  return cleanString(apiBaseUrl) ? ["--api-base-url", "<production-api-base-url>"] : [];
}

function executeStepCommand(step) {
  const result = spawnSync(process.execPath, ["--", step.script, ...step.args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: typeof result.status === "number" ? result.status : 1,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error,
  };
}

function buildPlannedStage(step) {
  return {
    key: step.key,
    label: step.label,
    status: "planned",
    detail: "计划执行，尚未连接真实生产环境。",
    command: safeCommand(step),
    evidence: {
      actualCommandArgsIncluded: false,
      envFilePathIncluded: false,
    },
  };
}

function buildStageFromResult(step, result = {}) {
  const exitCode = typeof result.status === "number" ? result.status : 1;
  const parsed = step.expectsJson ? parseJsonOrNull(result.stdout) : null;
  const acceptedStatus = parsed && Array.isArray(step.acceptedStatuses) && step.acceptedStatuses.includes(parsed.status);
  const ready = parsed
    ? acceptedStatus || (parsed.ready !== false && parsed.status !== "blocked" && parsed.status !== "error")
    : exitCode === 0;
  const status = exitCode === 0 && ready ? "passed" : exitCode === 2 || parsed?.status === "blocked" ? "blocked" : "error";
  return {
    key: step.key,
    label: step.label,
    status,
    detail: status === "passed" ? step.successDetail : blockedDetail(step, parsed, result),
    command: safeCommand(step),
    exitCode,
    evidence: extractStageEvidence(step, parsed, result),
    nextActions: status === "passed" ? [] : extractNextActions(parsed),
  };
}

function blockedDetail(step, parsed, result) {
  if (parsed?.summary?.label) return parsed.summary.label;
  if (parsed?.error?.message) return parsed.error.message;
  if (result?.error?.message) return result.error.message;
  if (result?.stderr || result?.stdout) return capText(redactExecutionText(result.stderr || result.stdout));
  return `${step.label} 未通过。`;
}

function extractStageEvidence(step, parsed, result) {
  const base = {
    actualCommandArgsIncluded: false,
    envFilePathIncluded: false,
  };
  if (!parsed) {
    return {
      ...base,
      reportParsed: false,
      exitCode: typeof result.status === "number" ? result.status : 1,
    };
  }
  const dryRunProjection = parsed?.dryRunProjection;
  const minimumBlockingCoverage = dryRunProjection?.minimumBlockingCoverage;
  const minimumWarningCoverage = dryRunProjection?.minimumWarningCoverage;
  const summary = parsed?.summary || {};
  const isIntakeVerify = parsed?.scope === "v1_production_env_real_value_intake_verification";
  return {
    ...base,
    reportParsed: true,
    reportStatus: parsed.status,
    reportReady: parsed.ready,
    dryRun: parsed.dryRun === true,
    dryRunProjectionIncluded: Boolean(dryRunProjection),
    dryRunTargetWouldBeWritten: dryRunProjection?.targetWouldBeWritten,
    projectedEnvPreflightReady: dryRunProjection?.productionEnvPreflight?.ready,
    projectedEnvPreflightPassedCount: dryRunProjection?.productionEnvPreflight?.passedCount,
    projectedEnvPreflightTotalCount: dryRunProjection?.productionEnvPreflight?.totalCount,
    projectedEnvPreflightBlockingCount: dryRunProjection?.productionEnvPreflight?.blockingCount,
    projectedIntakeConfiguredRowCount: dryRunProjection?.intakeCoverage?.configuredRowCount,
    projectedIntakeRowCount: dryRunProjection?.intakeCoverage?.rowCount,
    projectedIntakeMissingRequiredVariableCount: dryRunProjection?.intakeCoverage?.missingRequiredVariableCount,
    projectedIntakeAlternativeGroupBlockingCount: dryRunProjection?.intakeCoverage?.alternativeGroupBlockingCount,
    projectedMinimumBlockingReady: minimumBlockingCoverage?.ready,
    projectedMinimumBlockingSatisfiedCount: minimumBlockingCoverage?.satisfiedCount,
    projectedMinimumBlockingTargetCount: minimumBlockingCoverage?.targetCount,
    projectedMinimumBlockingMissingCount: minimumBlockingCoverage?.missingCount,
    projectedMinimumBlockingVariableRowCount: minimumBlockingCoverage?.variableRowCount,
    projectedMinimumBlockingAlternativeGroupCount: minimumBlockingCoverage?.alternativeGroupCount,
    projectedMinimumBlockingTargetSignature: minimumBlockingCoverage?.targetSignature,
    projectedMinimumWarningReady: minimumWarningCoverage?.ready,
    projectedMinimumWarningSatisfiedCount: minimumWarningCoverage?.satisfiedCount,
    projectedMinimumWarningTargetCount: minimumWarningCoverage?.targetCount,
    projectedMinimumWarningMissingCount: minimumWarningCoverage?.missingCount,
    projectedMinimumWarningTargetSignature: minimumWarningCoverage?.targetSignature,
    summaryLabel: parsed.summary?.label,
    intakeCoverageIncluded: isIntakeVerify,
    intakeAuditReady: isIntakeVerify ? summary.auditReady === true : undefined,
    intakeCsvReady: isIntakeVerify ? summary.intakeCsvReady === true : undefined,
    intakeConfiguredRowCount: isIntakeVerify ? summary.configuredRowCount : undefined,
    intakeRowCount: isIntakeVerify ? summary.intakeRowCount : undefined,
    intakeMissingRowCount: isIntakeVerify ? summary.missingRowCount : undefined,
    intakeConfiguredLabel: isIntakeVerify ? summary.configuredLabel : undefined,
    fullIntakeConfiguredLabel: isIntakeVerify ? summary.fullIntakeConfiguredLabel : undefined,
    intakeAlternativeGroupBlockingCount: isIntakeVerify ? summary.alternativeGroupBlockingCount : undefined,
    intakeAlternativeGroupWarningCount: isIntakeVerify ? summary.alternativeGroupWarningCount : undefined,
    minimumBlockingLabel: isIntakeVerify ? summary.minimumBlockingLabel : undefined,
    minimumBlockingSatisfiedCount: isIntakeVerify ? summary.minimumBlockingSatisfiedCount : undefined,
    minimumBlockingTargetCount: isIntakeVerify ? summary.minimumBlockingTargetCount : undefined,
    minimumBlockingMissingCount: isIntakeVerify ? summary.minimumBlockingMissingCount : undefined,
    minimumBlockingVariableRowCount: isIntakeVerify ? summary.minimumBlockingVariableRowCount : undefined,
    minimumBlockingAlternativeGroupCount: isIntakeVerify ? summary.minimumBlockingAlternativeGroupCount : undefined,
    minimumWarningLabel: isIntakeVerify ? summary.minimumWarningLabel : undefined,
    minimumWarningSatisfiedCount: isIntakeVerify ? summary.minimumWarningSatisfiedCount : undefined,
    minimumWarningTargetCount: isIntakeVerify ? summary.minimumWarningTargetCount : undefined,
    minimumWarningMissingCount: isIntakeVerify ? summary.minimumWarningMissingCount : undefined,
    minimumWarningVariableRowCount: isIntakeVerify ? summary.minimumWarningVariableRowCount : undefined,
    minimumWarningAlternativeGroupCount: isIntakeVerify ? summary.minimumWarningAlternativeGroupCount : undefined,
    passedCount: parsed.summary?.passedCount,
    totalCount: parsed.summary?.totalCount,
    blockingCount: parsed.summary?.blockingCount,
    warningCount: parsed.summary?.warningCount,
    scope: parsed.scope,
  };
}

function extractNextActions(parsed) {
  if (!parsed || !Array.isArray(parsed.nextActions)) return [];
  return parsed.nextActions.map((item) => String(item)).filter(Boolean).slice(0, 5);
}

function parseJsonOrNull(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeCommand(step) {
  return ["node", "--", step.script, ...step.safeArgs].join(" ");
}

function buildNextActions({
  ready,
  status,
  planOnly,
  blockingStages,
  applyMigrations,
  allowRestoreReset,
  envFileSource,
  fieldEvidenceManifestSource,
  productionEnvValuesDryRun,
}) {
  const usingDefaultManifest = fieldEvidenceManifestSource === "default_template";
  if (productionEnvValuesDryRun) {
    if (blockingStages.length === 0 && status === "values_dry_run_ready") {
      return [
        "真实值片段 dry-run 已通过且未写入目标 env；负责人确认预计结果后，去掉 --production-env-values-dry-run 正式合并并继续第一阶段。",
        "正式合并前确认真实值片段仍在安全未跟踪路径，且不要把连接串、bucket、secret 或 token 复制到聊天或文档。",
      ];
    }
    const firstBlocked = blockingStages[0]?.label || "生产 env 真实值片段 dry-run";
    return [
      `先处理 ${firstBlocked} 的 dry-run 阻塞；目标 env 尚未写入。`,
      "修正安全真实值片段后继续使用 --production-env-values-dry-run 复核，确认预计生产 env 预检和 intake 覆盖无阻塞后再正式合并。",
    ];
  }
  if (planOnly) {
    const actions = [
      "把真实 PostgreSQL / OSS-S3-COS / 生产 API / 对象存储值填入安全未跟踪 env 文件。",
      "如现场把真实值先放在独立安全 env 片段，可传 --production-env-values-file <secure-values-env-fragment>，让第一阶段先按 intake 白名单合并再继续执行。",
      "可用 --use-production-env-setup-env-file 复用生产 env setup 报告中的安全 env 文件，避免人工转抄 --env-file 路径。",
      "先用生产 env 真实值 intake 校验确认 22 行变量清单、安全固定值、任选别名和现场回填状态，再进入变量预检。",
      "把已填写的现场证据 manifest 路径写入安全 env 文件 ERP_V1_FIELD_EVIDENCE_MANIFEST，或运行时显式传 --field-evidence-manifest。",
      "先不加 --apply-migrations 跑一遍执行器，确认 env 文件审计和变量预检没有基础阻塞。",
      "确认备份窗口和负责人后，如生产库尚未迁移，再显式加 --apply-migrations 执行迁移。",
      "确认专用恢复验证库和负责人后，如需执行恢复抽样验证库重置，再显式加 --allow-restore-reset；不要把该授权长期写成 env true。",
    ];
    if (allowRestoreReset) actions.unshift("当前已显式允许第一阶段持久化留证重置专用恢复验证库。");
    if (envFileSource === "production_env_setup") actions.unshift("当前已复用生产 env setup 报告中的安全 env 文件。");
    if (envFileSource === "none") actions.unshift("当前未传入 env 文件；第一阶段会停在生产 env 文件审计或变量预检。");
    if (usingDefaultManifest) actions.unshift("当前仍会使用默认 pending 模板；第一阶段 closeout 必然保持 blocked。");
    return actions;
  }
  if (ready) {
    return [
      "保存第一阶段执行、证据建议和 closeout 留证，进入真实打印链路：标签机 / 针式机、CUPS、出纸、扫码和纸张对位。",
    ];
  }
  const firstBlocked = blockingStages[0]?.label || "第一阶段";
  const actions = [`先处理 ${firstBlocked} 的阻塞，处理后重新运行第一阶段执行器。`];
  if (usingDefaultManifest) {
    actions.push("当前执行器使用默认 pending 模板；请配置 ERP_V1_FIELD_EVIDENCE_MANIFEST 或传 --field-evidence-manifest 后重跑。");
  }
  if (!applyMigrations) {
    actions.push("如果 PostgreSQL 预检显示迁移缺失，先确认备份窗口，再用 --apply-migrations 重新运行。");
  }
  if (!allowRestoreReset) {
    actions.push("如果恢复抽样验证需要重置专用恢复验证库，确认负责人和库隔离后再用 --allow-restore-reset 重新运行。");
  }
  if (status === "error") actions.push("错误输出已脱敏；不要把真实 env 值、连接串或密钥复制到问题日志。");
  return actions;
}

function writeProductionFirstStageExecutionArtifacts(report, { outputDir = defaultOutputDir } = {}) {
  mkdirSync(outputDir, { recursive: true });
  const stamp = new Date(report.checkedAt || Date.now()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const baseName = `v1-production-first-stage-execution-${stamp}`;
  const jsonPath = join(outputDir, `${baseName}.json`);
  const markdownPath = join(outputDir, `${baseName}.md`);
  const latestJsonPath = join(outputDir, "latest.json");
  const latestMarkdownPath = join(outputDir, "latest.md");
  const output = redactExecutionReport(report);
  writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`);
  writeFileSync(markdownPath, formatProductionFirstStageExecution(output));
  writeFileSync(latestJsonPath, `${JSON.stringify(output, null, 2)}\n`);
  writeFileSync(latestMarkdownPath, formatProductionFirstStageExecution(output));
  return { jsonPath, markdownPath, latestJsonPath, latestMarkdownPath };
}

function formatProductionFirstStageExecution(report) {
  const intakeCoverage = report.summary?.productionEnvIntakeCoverage;
  const valuesDryRunCoverage = report.summary?.productionEnvValuesDryRunCoverage;
  const lines = [
    "# V1 Production First-Stage Execution",
    "",
    `- Status: ${report.status}`,
    `- Ready: ${yesNo(report.ready)}`,
    `- Checked at: ${report.checkedAt}`,
    `- Summary: ${report.summary.label}`,
    `- Env files: ${report.execution.envFileCount}`,
    `- Env file source: ${report.execution.envFileSourceLabel}`,
    `- Migration apply requested: ${yesNo(report.execution.applyMigrations)}`,
    `- Restore reset explicitly allowed: ${yesNo(report.execution.restoreResetExplicitlyAllowed)}`,
    `- Field evidence manifest source: ${report.execution.fieldEvidenceManifestSourceLabel}`,
    `- Field evidence manifest configured: ${yesNo(report.execution.fieldEvidenceManifestConfigured)}`,
    ...(intakeCoverage?.included
      ? [
          `- Production env intake: ${intakeCoverage.reportReady ? "ready" : "blocked"} (full ${displayCoverageLabel(
            intakeCoverage.fullIntakeConfiguredLabel,
            intakeCoverage.configuredRowCount,
            intakeCoverage.intakeRowCount,
          )}, missing rows ${intakeCoverage.missingRowCount}, blockers ${intakeCoverage.blockingCount}, warnings ${intakeCoverage.warningCount})`,
          `- Production env intake minimum blocking: ${displayCoverageLabel(
            intakeCoverage.minimumBlockingLabel,
            intakeCoverage.minimumBlockingSatisfiedCount,
            intakeCoverage.minimumBlockingTargetCount,
          )}, missing ${intakeCoverage.minimumBlockingMissingCount} (variables ${intakeCoverage.minimumBlockingVariableRowCount}, alternative groups ${intakeCoverage.minimumBlockingAlternativeGroupCount})`,
          `- Production env intake warning/optional: ${displayCoverageLabel(
            intakeCoverage.minimumWarningLabel,
            intakeCoverage.minimumWarningSatisfiedCount,
            intakeCoverage.minimumWarningTargetCount,
          )}, missing ${intakeCoverage.minimumWarningMissingCount} (variables ${intakeCoverage.minimumWarningVariableRowCount}, alternative groups ${intakeCoverage.minimumWarningAlternativeGroupCount})`,
          `- Production env intake audit/csv: audit ${intakeCoverage.auditReady ? "ready" : "blocked"}, intake CSV ${intakeCoverage.intakeCsvReady ? "ready" : "blocked"}`,
        ]
      : []),
    `- Production env values dry-run: ${yesNo(report.execution.productionEnvValuesDryRun)}`,
    ...(valuesDryRunCoverage?.included
      ? [
          `- Production env values dry-run projected env preflight: ${valuesDryRunCoverage.envPreflightReady ? "ready" : "blocked"} (${valuesDryRunCoverage.envPreflightPassedCount}/${valuesDryRunCoverage.envPreflightTotalCount}), blockers ${valuesDryRunCoverage.envPreflightBlockingCount}`,
          `- Production env values dry-run projected intake: configured ${valuesDryRunCoverage.intakeConfiguredRowCount}/${valuesDryRunCoverage.intakeRowCount}, missing required ${valuesDryRunCoverage.intakeMissingRequiredVariableCount}, alternative blockers ${valuesDryRunCoverage.intakeAlternativeGroupBlockingCount}`,
          `- Production env values dry-run minimum blocking: ${valuesDryRunCoverage.minimumBlockingReady ? "ready" : "blocked"} (${valuesDryRunCoverage.minimumBlockingSatisfiedCount}/${valuesDryRunCoverage.minimumBlockingTargetCount}), missing ${valuesDryRunCoverage.minimumBlockingMissingCount}`,
          `- Production env values dry-run warning/optional: ${valuesDryRunCoverage.minimumWarningReady ? "ready" : "blocked"} (${valuesDryRunCoverage.minimumWarningSatisfiedCount}/${valuesDryRunCoverage.minimumWarningTargetCount}), missing ${valuesDryRunCoverage.minimumWarningMissingCount}`,
        ]
      : []),
    "",
    "## Stages",
    "",
  ];
  for (const stage of report.stages || []) {
    lines.push(`- [${stage.status}] ${stage.label}: ${stage.detail}`);
    lines.push(`  command: ${stage.command}`);
    if (stage.evidence?.intakeCoverageIncluded) {
      lines.push(
        `  intake full coverage: ${displayCoverageLabel(
          stage.evidence.fullIntakeConfiguredLabel,
          stage.evidence.intakeConfiguredRowCount,
          stage.evidence.intakeRowCount,
        )}, missing rows ${stage.evidence.intakeMissingRowCount}`,
      );
      lines.push(
        `  intake minimum blocking: ${displayCoverageLabel(
          stage.evidence.minimumBlockingLabel,
          stage.evidence.minimumBlockingSatisfiedCount,
          stage.evidence.minimumBlockingTargetCount,
        )}, missing ${stage.evidence.minimumBlockingMissingCount}`,
      );
      lines.push(
        `  intake warning/optional: ${displayCoverageLabel(
          stage.evidence.minimumWarningLabel,
          stage.evidence.minimumWarningSatisfiedCount,
          stage.evidence.minimumWarningTargetCount,
        )}, missing ${stage.evidence.minimumWarningMissingCount}`,
      );
    }
    if (stage.evidence?.dryRunProjectionIncluded) {
      lines.push(
        `  dry-run projected env preflight: ${stage.evidence.projectedEnvPreflightReady ? "ready" : "blocked"} (${stage.evidence.projectedEnvPreflightPassedCount}/${stage.evidence.projectedEnvPreflightTotalCount})`,
      );
      if (stage.evidence.projectedMinimumBlockingTargetCount !== undefined) {
        lines.push(
          `  dry-run projected minimum blocking values: ${stage.evidence.projectedMinimumBlockingReady ? "ready" : "blocked"} (${stage.evidence.projectedMinimumBlockingSatisfiedCount}/${stage.evidence.projectedMinimumBlockingTargetCount}), missing ${stage.evidence.projectedMinimumBlockingMissingCount}`,
        );
      }
      if (stage.evidence.projectedMinimumWarningTargetCount !== undefined) {
        lines.push(
          `  dry-run projected warning/optional values: ${stage.evidence.projectedMinimumWarningReady ? "ready" : "blocked"} (${stage.evidence.projectedMinimumWarningSatisfiedCount}/${stage.evidence.projectedMinimumWarningTargetCount}), missing ${stage.evidence.projectedMinimumWarningMissingCount}`,
        );
      }
      lines.push(
        `  dry-run projected intake: configured ${stage.evidence.projectedIntakeConfiguredRowCount}/${stage.evidence.projectedIntakeRowCount}, missing required ${stage.evidence.projectedIntakeMissingRequiredVariableCount}, alternative blockers ${stage.evidence.projectedIntakeAlternativeGroupBlockingCount}`,
      );
    }
  }
  if (report.nextActions?.length) {
    lines.push("", "## Next Actions", "");
    for (const action of report.nextActions) lines.push(`- ${action}`);
  }
  if (report.artifacts) {
    lines.push("", "## Artifacts", "- JSON: [redacted-path]", "- Markdown: [redacted-path]");
  }
  lines.push("");
  return redactExecutionText(lines.join("\n"));
}

function displayCoverageLabel(label, done, total) {
  const cleanLabel = cleanString(label);
  if (cleanLabel) return cleanLabel;
  if (done !== null && done !== undefined && total !== null && total !== undefined) return `${done}/${total}`;
  return "0/0";
}

function redactExecutionReport(report) {
  return JSON.parse(redactExecutionText(JSON.stringify(report)));
}

function redactExecutionText(value) {
  return redactCloseoutText(redactRuntimeSmokeText(redactPersistenceEvidenceText(redactMigrationText(String(value ?? "")))))
    .replace(/--env-file\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--env-file <secure-env-file>")
    .replace(/--intake-csv\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--intake-csv <production-env-intake-csv>")
    .replace(/--values-env-file\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--values-env-file <production-env-values-file>")
    .replace(/--target-env-file\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--target-env-file <secure-env-file>")
    .replace(/--setup-output-dir\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--setup-output-dir <production-env-setup-output-dir>")
    .replace(/--verify-output-dir\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--verify-output-dir <production-env-intake-verify-output-dir>")
    .replace(/--output-dir\s+(?!<[^>\s]+>)("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--output-dir <redacted-output-dir>")
    .replace(/--field-evidence-manifest\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--field-evidence-manifest <field-evidence-manifest>")
    .replace(/--psql-command\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--psql-command <psql-command>")
    .replace(/--pg-dump-command\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--pg-dump-command <pg-dump-command>")
    .replace(/\b\/(?:Users|private|var|tmp)\/[^\s"']+/g, "[redacted-path]")
    .replace(/\b[A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|ACCESS_KEY)[A-Z0-9_]*=([^\s"']+)/gi, "[redacted-secret-assignment]");
}

function capText(value) {
  return String(value ?? "").slice(0, 500);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrEmpty(value) {
  return String(value || "").trim();
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function yesNo(value) {
  return value ? "yes" : "no";
}

export {
  buildExecutionSteps,
  buildProductionFirstStageExecution,
  formatProductionFirstStageExecution,
  parseArgs,
  redactExecutionText,
  resolveFieldEvidenceManifest,
  resolveFieldEvidenceManifestPath,
  resolveProductionFirstStageEnvFiles,
  writeProductionFirstStageExecutionArtifacts,
};
