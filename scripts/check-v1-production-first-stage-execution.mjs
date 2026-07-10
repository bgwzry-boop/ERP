import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildProductionFirstStageExecution,
  formatProductionFirstStageExecution,
  redactExecutionText,
  resolveFieldEvidenceManifest,
  resolveFieldEvidenceManifestPath,
  resolveProductionFirstStageEnvFiles,
  writeProductionFirstStageExecutionArtifacts,
} from "./run-v1-production-first-stage-execution.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-first-stage-execution");
const outputDir = join(storageRoot, "artifacts");
const runnerScript = join(process.cwd(), "scripts", "run-v1-production-first-stage-execution.mjs");
const sensitiveEnvFile = "/private/tmp/erp-prod/production.env";
const sensitiveFieldEvidenceManifest = "/private/tmp/erp-prod/field-evidence-manifest.json";
const sensitiveDatabaseUrl = "postgres://erp_user:SUPER_SECRET_EXEC_PASSWORD@prod-db.internal:5432/erp";
const sensitiveEndpoint = "https://oss-execution-secret.example.com";
const sensitiveBucket = "erp-v1-execution-private-bucket";
const sensitiveAccessKey = "AKIA_EXECUTION_SECRET";
const sensitiveSecretKey = "SUPER_SECRET_EXEC_OBJECT_STORAGE_VALUE";
const sensitiveProductionApiBaseUrl = "https://erp-prod-secret.example.com/api";
const sensitiveProductionEnvIntakeCsv = "/private/tmp/erp-prod/production-env-real-value-intake.csv";
const sensitiveProductionEnvValuesFile = "/private/tmp/erp-prod/production-env-real-values.env";
const productionEnvSetupJsonPath = join(storageRoot, "production-env-setup.json");
const productionEnvSetupEnvFilePath = join(storageRoot, "secure-prod.env");
const productionEnvSetupSecret = "DO_NOT_LEAK_FIRST_STAGE_SETUP_SECRET";
const minimumBlockingTargetSignature = [
  "alternative-group:ERP_V1_DATABASE_URL / DATABASE_URL / PGURL",
  "variable:ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID",
  "variable:ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET",
  "variable:ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT",
  "variable:ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "variable:ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST",
  "variable:ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND",
  "variable:ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR",
  "variable:ERP_SYSTEM_PRINTER_ALLOWLIST",
  "variable:ERP_SYSTEM_PRINTER_COMMAND",
  "variable:ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL",
].sort().join("|");

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

try {
  checkFieldEvidenceManifestPathResolution();
  checkProductionEnvSetupEnvFileResolution();
  checkPlanOnly();
  checkPlanOnlyWithProductionEnvValuesApply();
  checkProductionEnvValuesDryRun();
  checkReadyExecutionWithoutMigrationApply();
  checkReadyExecutionWithProductionEnvValuesApply();
  checkBlockedExecutionStopsAtFirstBlocker();
  checkMigrationApplyRequiresExplicitFlag();
  await checkCliPlanOnlyAndRedaction();
  console.log(
    "V1 production first-stage execution check passed: plan-only, production values dry-run minimum coverage, ready execution, evidence suggestions, existing API runtime-smoke forwarding, field-evidence manifest source tracking, first-blocker stop, explicit migration apply, artifacts, CLI, and redaction are covered.",
  );
} finally {
  rmSync(storageRoot, { recursive: true, force: true });
}

function checkFieldEvidenceManifestPathResolution() {
  const manifestEnvFile = join(storageRoot, "manifest-path.env");
  const fallbackEnvFile = join(storageRoot, "manifest-path-fallback.env");
  writeFileSync(
    manifestEnvFile,
    [
      "# Values in this file must not appear in output.",
      `ERP_V1_FIELD_EVIDENCE_MANIFEST="${sensitiveFieldEvidenceManifest}"`,
      "",
    ].join("\n"),
  );
  writeFileSync(fallbackEnvFile, "ERP_V1_FIELD_EVIDENCE_MANIFEST=<REPLACE_WITH_FILLED_FIELD_EVIDENCE_MANIFEST_PATH>\n");

  assert.equal(
    resolveFieldEvidenceManifestPath({ envFiles: [manifestEnvFile], env: {} }),
    sensitiveFieldEvidenceManifest,
  );
  assert.deepEqual(resolveFieldEvidenceManifest({ envFiles: [manifestEnvFile], env: {} }), {
    path: sensitiveFieldEvidenceManifest,
    source: "secure_env_file",
  });
  assert.deepEqual(
    resolveFieldEvidenceManifest({
      explicitPath: sensitiveFieldEvidenceManifest,
      envFiles: [manifestEnvFile],
      env: {},
    }),
    {
      path: sensitiveFieldEvidenceManifest,
      source: "cli",
    },
  );
  assert.equal(
    resolveFieldEvidenceManifestPath({
      envFiles: [fallbackEnvFile],
      env: { ERP_V1_FIELD_EVIDENCE_MANIFEST: sensitiveFieldEvidenceManifest },
    }),
    sensitiveFieldEvidenceManifest,
  );
  assert.deepEqual(
    resolveFieldEvidenceManifest({
      envFiles: [fallbackEnvFile],
      env: { ERP_V1_FIELD_EVIDENCE_MANIFEST: sensitiveFieldEvidenceManifest },
    }),
    {
      path: sensitiveFieldEvidenceManifest,
      source: "process_env",
    },
  );
  assert.equal(
    resolveFieldEvidenceManifestPath({ envFiles: [fallbackEnvFile], env: {} }),
    "docs/development/v1-field-evidence-manifest.template.json",
  );
  assert.deepEqual(resolveFieldEvidenceManifest({ envFiles: [fallbackEnvFile], env: {} }), {
    path: "docs/development/v1-field-evidence-manifest.template.json",
    source: "default_template",
  });

  const envFileResolution = resolveFieldEvidenceManifest({ envFiles: [manifestEnvFile], env: {} });
  const envFileReport = buildProductionFirstStageExecution({
    envFiles: [manifestEnvFile],
    fieldEvidenceManifestPath: envFileResolution.path,
    fieldEvidenceManifestSource: envFileResolution.source,
    checkedAt: "2026-07-08T09:00:00.000Z",
    planOnly: true,
  });
  assert.equal(envFileReport.execution.fieldEvidenceManifestSource, "secure_env_file");
  assert.equal(envFileReport.execution.fieldEvidenceManifestConfigured, true);
  assert.equal(envFileReport.execution.fieldEvidenceManifestDefaultTemplateUsed, false);
  assertNoSensitiveOutput(JSON.stringify(envFileReport) + formatProductionFirstStageExecution(envFileReport));

  const defaultResolution = resolveFieldEvidenceManifest({ envFiles: [fallbackEnvFile], env: {} });
  const defaultReport = buildProductionFirstStageExecution({
    fieldEvidenceManifestPath: defaultResolution.path,
    fieldEvidenceManifestSource: defaultResolution.source,
    checkedAt: "2026-07-08T09:00:00.000Z",
    planOnly: true,
  });
  assert.equal(defaultReport.execution.fieldEvidenceManifestSource, "default_template");
  assert.equal(defaultReport.execution.fieldEvidenceManifestConfigured, false);
  assert.equal(defaultReport.execution.fieldEvidenceManifestDefaultTemplateUsed, true);
  assert.ok(defaultReport.nextActions[0].includes("默认 pending 模板"));
  assertNoSensitiveOutput(JSON.stringify(defaultReport) + formatProductionFirstStageExecution(defaultReport));
}

function checkProductionEnvSetupEnvFileResolution() {
  writeFileSync(
    productionEnvSetupEnvFilePath,
    [
      "# Fake secure env fixture for first-stage setup reuse.",
      `ERP_V1_FIELD_EVIDENCE_MANIFEST="${sensitiveFieldEvidenceManifest}"`,
      `ERP_V1_DATABASE_URL=postgres://erp_user:${productionEnvSetupSecret}@prod-db.local:5432/erp`,
      `ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=${productionEnvSetupSecret}`,
      "",
    ].join("\n"),
  );
  chmodSync(productionEnvSetupEnvFilePath, 0o600);
  writeFileSync(
    productionEnvSetupJsonPath,
    `${JSON.stringify(
      {
        scope: "v1_production_env_setup",
        status: "prepared",
        setupReady: true,
        checkedAt: new Date(Date.now() + 60_000).toISOString(),
        envFile: {
          path: productionEnvSetupEnvFilePath,
          gitIgnored: true,
          gitTracked: false,
          fileMode: "600",
        },
      },
      null,
      2,
    )}\n`,
  );

  const setupResolution = resolveProductionFirstStageEnvFiles({
    useProductionEnvSetupEnvFile: true,
    productionEnvSetupJsonPath,
  });
  assert.equal(setupResolution.source, "production_env_setup");
  assert.equal(setupResolution.usedProductionEnvSetup, true);
  assert.equal(setupResolution.envFiles.length, 1);
  assert.equal(setupResolution.envFiles[0], productionEnvSetupEnvFilePath);

  writeFileSync(
    productionEnvSetupJsonPath,
    `${JSON.stringify(
      {
        scope: "v1_production_env_setup",
        status: "prepared",
        setupReady: true,
        checkedAt: "2000-01-01T00:00:00.000Z",
        envFile: {
          path: productionEnvSetupEnvFilePath,
          gitIgnored: true,
          gitTracked: false,
          fileMode: "600",
        },
      },
      null,
      2,
    )}\n`,
  );
  assert.throws(
    () =>
      resolveProductionFirstStageEnvFiles({
        useProductionEnvSetupEnvFile: true,
        productionEnvSetupJsonPath,
      }),
    /setup report is stale/,
  );
  writeFileSync(
    productionEnvSetupJsonPath,
    `${JSON.stringify(
      {
        scope: "v1_production_env_setup",
        status: "prepared",
        setupReady: true,
        checkedAt: new Date(Date.now() + 60_000).toISOString(),
        envFile: {
          path: productionEnvSetupEnvFilePath,
          gitIgnored: true,
          gitTracked: false,
          fileMode: "600",
        },
      },
      null,
      2,
    )}\n`,
  );

  const explicitResolution = resolveProductionFirstStageEnvFiles({
    envFiles: [sensitiveEnvFile],
    useProductionEnvSetupEnvFile: true,
    productionEnvSetupJsonPath,
  });
  assert.equal(explicitResolution.source, "cli");
  assert.equal(explicitResolution.usedProductionEnvSetup, false);
  assert.deepEqual(explicitResolution.envFiles, [sensitiveEnvFile]);

  const manifestResolution = resolveFieldEvidenceManifest({ envFiles: setupResolution.envFiles, env: {} });
  assert.deepEqual(manifestResolution, {
    path: sensitiveFieldEvidenceManifest,
    source: "secure_env_file",
  });

  const report = buildProductionFirstStageExecution({
    envFiles: setupResolution.envFiles,
    envFileFromProductionSetup: setupResolution.usedProductionEnvSetup,
    envFileSource: setupResolution.source,
    envFileSourceSummary: setupResolution.summary,
    fieldEvidenceManifestPath: manifestResolution.path,
    fieldEvidenceManifestSource: manifestResolution.source,
    checkedAt: "2026-07-08T09:00:00.000Z",
    planOnly: true,
  });
  assert.equal(report.execution.envFileSource, "production_env_setup");
  assert.equal(report.execution.envFileFromProductionSetup, true);
  assert.equal(report.execution.envFileCount, 1);
  assert.equal(report.execution.fieldEvidenceManifestSource, "secure_env_file");
  assert.equal(report.execution.fieldEvidenceManifestConfigured, true);
  assert.ok(report.nextActions.some((action) => action.includes("已复用生产 env setup")));
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionFirstStageExecution(report));

  const valuesReport = buildProductionFirstStageExecution({
    envFiles: setupResolution.envFiles,
    envFileFromProductionSetup: setupResolution.usedProductionEnvSetup,
    envFileSource: setupResolution.source,
    envFileSourceSummary: setupResolution.summary,
    productionEnvSetupJsonPath,
    productionEnvValuesFile: sensitiveProductionEnvValuesFile,
    productionEnvIntakeCsvPath: sensitiveProductionEnvIntakeCsv,
    fieldEvidenceManifestPath: manifestResolution.path,
    fieldEvidenceManifestSource: manifestResolution.source,
    checkedAt: "2026-07-08T09:00:00.000Z",
    planOnly: true,
  });
  assert.equal(valuesReport.stages[0].key, "production-env-values-dry-run-proof");
  assert.match(valuesReport.stages[0].command, /--use-production-env-setup-env-file/);
  assert.match(valuesReport.stages[0].command, /--production-env-setup-json <production-env-setup-json>/);
  assert.doesNotMatch(valuesReport.stages[0].command, /--target-env-file <secure-env-file>/);
  assert.equal(valuesReport.stages[1].key, "production-env-intake-apply");
  assert.match(valuesReport.stages[1].command, /--use-production-env-setup-env-file/);
  assertNoSensitiveOutput(JSON.stringify(valuesReport) + formatProductionFirstStageExecution(valuesReport));
}

function checkPlanOnly() {
  const report = buildProductionFirstStageExecution({
    envFiles: [sensitiveEnvFile],
    fieldEvidenceManifestPath: sensitiveFieldEvidenceManifest,
    checkedAt: "2026-07-08T09:00:00.000Z",
    planOnly: true,
  });
  assert.equal(report.status, "planned");
  assert.equal(report.ready, false);
  assert.equal(report.summary.plannedCount, 8);
  assert.equal(report.execution.applyMigrations, false);
  assert.equal(report.execution.restoreResetExplicitlyAllowed, false);
  assert.equal(report.execution.envFileSource, "provided");
  assert.equal(report.execution.envFileFromProductionSetup, false);
  assert.equal(report.execution.actualEnvFilePathsIncluded, false);
  assert.equal(report.execution.fieldEvidenceManifestSource, "provided");
  assert.equal(report.execution.fieldEvidenceManifestConfigured, true);
  assert.equal(report.execution.fieldEvidenceManifestDefaultTemplateUsed, false);
  assert.equal(report.execution.fieldEvidenceManifestPathIncluded, false);
  assert.equal(report.execution.fieldEvidenceManifestValueIncluded, false);
  assert.equal(report.stages.every((stage) => stage.status === "planned"), true);
  assert.match(report.stages[0].command, /--env-file <secure-env-file>/);
  assert.match(
    report.stages.find((stage) => stage.key === "production-env-intake-verify")?.command || "",
    /--intake-csv <production-env-intake-csv>/,
  );
  assert.doesNotMatch(
    report.stages.find((stage) => stage.key === "persistence-evidence")?.command || "",
    /--allow-restore-reset/,
  );
  assert.match(report.stages.find((stage) => stage.key === "first-stage-closeout")?.command || "", /--field-evidence-manifest <field-evidence-manifest>/);
  assert.ok(report.nextActions.some((action) => action.includes("ERP_V1_FIELD_EVIDENCE_MANIFEST")));
  assert.ok(report.nextActions.some((action) => action.includes("--allow-restore-reset")));
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionFirstStageExecution(report));

  const restoreResetReport = buildProductionFirstStageExecution({
    envFiles: [sensitiveEnvFile],
    allowRestoreReset: true,
    fieldEvidenceManifestPath: sensitiveFieldEvidenceManifest,
    checkedAt: "2026-07-08T09:00:00.000Z",
    planOnly: true,
  });
  assert.equal(restoreResetReport.execution.restoreResetExplicitlyAllowed, true);
  assert.match(
    restoreResetReport.stages.find((stage) => stage.key === "persistence-evidence")?.command || "",
    /--allow-restore-reset/,
  );
  assert.ok(
    restoreResetReport.nextActions.some((action) => action.includes("专用恢复验证库")),
    "restore reset plan should explain the dedicated restore validation scope",
  );
  assertNoSensitiveOutput(JSON.stringify(restoreResetReport) + formatProductionFirstStageExecution(restoreResetReport));

  const existingApiReport = buildProductionFirstStageExecution({
    envFiles: [sensitiveEnvFile],
    apiBaseUrl: sensitiveProductionApiBaseUrl,
    fieldEvidenceManifestPath: sensitiveFieldEvidenceManifest,
    checkedAt: "2026-07-08T09:00:00.000Z",
    planOnly: true,
  });
  const runtimeCommand = existingApiReport.stages.find((stage) => stage.key === "runtime-smoke")?.command || "";
  assert.equal(existingApiReport.execution.runtimeSmokeUsesExistingApi, true);
  assert.equal(existingApiReport.execution.apiBaseUrlIncluded, false);
  assert.match(runtimeCommand, /--api-base-url <production-api-base-url>/);
  assert.doesNotMatch(runtimeCommand, new RegExp(escapeRegExp(sensitiveProductionApiBaseUrl)));
  assertNoSensitiveOutput(JSON.stringify(existingApiReport) + formatProductionFirstStageExecution(existingApiReport));
}

function checkPlanOnlyWithProductionEnvValuesApply() {
  const report = buildProductionFirstStageExecution({
    envFiles: [sensitiveEnvFile],
    productionEnvValuesFile: sensitiveProductionEnvValuesFile,
    productionEnvIntakeCsvPath: sensitiveProductionEnvIntakeCsv,
    fieldEvidenceManifestPath: sensitiveFieldEvidenceManifest,
    checkedAt: "2026-07-08T09:00:00.000Z",
    planOnly: true,
  });
  assert.equal(report.status, "planned");
  assert.equal(report.ready, false);
  assert.equal(report.summary.plannedCount, 10);
  assert.equal(report.summary.totalCount, 10);
  assert.equal(report.execution.productionEnvValuesFileProvided, true);
  assert.equal(report.execution.productionEnvValuesFilePathIncluded, false);
  assert.equal(report.execution.productionEnvValuesApplyOutputDirIncluded, false);
  assert.equal(report.stages[0].key, "production-env-values-dry-run-proof");
  assert.match(report.stages[0].command, /--values-env-file <production-env-values-file>/);
  assert.match(report.stages[0].command, /--target-env-file <secure-env-file>/);
  assert.match(report.stages[0].command, /--apply-report-json <production-env-values-apply-output-json>/);
  assert.equal(report.stages[1].key, "production-env-intake-apply");
  assert.match(report.stages[1].command, /--values-env-file <production-env-values-file>/);
  assert.match(report.stages[1].command, /--target-env-file <secure-env-file>/);
  assert.match(report.stages[1].command, /--setup-output-dir <production-env-setup-output-dir>/);
  assert.match(report.stages[1].command, /--verify-output-dir <production-env-intake-verify-output-dir>/);
  assert.match(report.stages[1].command, /--output-dir <production-env-values-apply-output-dir>/);
  assert.match(
    report.stages.find((stage) => stage.key === "production-env-intake-verify")?.command || "",
    /--intake-csv <production-env-intake-csv>/,
  );
  assert.ok(report.nextActions.some((action) => action.includes("--production-env-values-file")));
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionFirstStageExecution(report));

  assert.throws(
    () =>
      buildProductionFirstStageExecution({
        envFiles: [sensitiveEnvFile, "/private/tmp/erp-prod/extra.env"],
        productionEnvValuesFile: sensitiveProductionEnvValuesFile,
        planOnly: true,
      }),
    /requires exactly one resolved target --env-file/,
  );
}

function checkProductionEnvValuesDryRun() {
  const calls = [];
  const report = buildProductionFirstStageExecution({
    envFiles: [sensitiveEnvFile],
    productionEnvValuesFile: sensitiveProductionEnvValuesFile,
    productionEnvValuesDryRun: true,
    productionEnvIntakeCsvPath: sensitiveProductionEnvIntakeCsv,
    fieldEvidenceManifestPath: sensitiveFieldEvidenceManifest,
    checkedAt: "2026-07-08T09:00:00.000Z",
    stepExecutor: (step) => {
      calls.push(step.key);
      assert.equal(step.key, "production-env-intake-apply-dry-run");
      assert.ok(step.args.includes("--dry-run"));
      return dryRunReadyJson();
    },
  });
  assert.deepEqual(calls, ["production-env-intake-apply-dry-run"]);
  assert.equal(report.status, "values_dry_run_ready");
  assert.equal(report.ready, false);
  assert.equal(report.summary.passedCount, 1);
  assert.equal(report.summary.totalCount, 1);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.included, true);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.stageStatus, "passed");
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.targetWouldBeWritten, false);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.envPreflightReady, true);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.envPreflightPassedCount, 10);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.envPreflightTotalCount, 10);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.envPreflightBlockingCount, 0);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.intakeConfiguredRowCount, 15);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.intakeRowCount, 22);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.intakeMissingRequiredVariableCount, 0);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.intakeAlternativeGroupBlockingCount, 0);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.minimumBlockingReady, true);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.minimumBlockingSatisfiedCount, 11);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.minimumBlockingTargetCount, 11);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.minimumBlockingMissingCount, 0);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.minimumBlockingVariableRowCount, 10);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.minimumBlockingAlternativeGroupCount, 1);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.minimumBlockingTargetSignature, minimumBlockingTargetSignature);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.minimumWarningReady, false);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.minimumWarningSatisfiedCount, 0);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.minimumWarningTargetCount, 8);
  assert.equal(report.summary.productionEnvValuesDryRunCoverage.minimumWarningMissingCount, 8);
  assert.equal(report.execution.productionEnvValuesFileProvided, true);
  assert.equal(report.execution.productionEnvValuesDryRun, true);
  assert.equal(report.execution.productionEnvValuesDryRunStopsBeforeFirstStage, true);
  assert.equal(report.safeguards.productionEnvFileMutated, false);
  assert.equal(report.stages[0].key, "production-env-intake-apply-dry-run");
  assert.equal(report.stages[0].status, "passed");
  assert.match(report.stages[0].command, /--dry-run/);
  assert.match(report.stages[0].command, /--values-env-file <production-env-values-file>/);
  assert.equal(report.stages[0].evidence.dryRunProjectionIncluded, true);
  assert.equal(report.stages[0].evidence.dryRunTargetWouldBeWritten, false);
  assert.equal(report.stages[0].evidence.projectedEnvPreflightReady, true);
  assert.equal(report.stages[0].evidence.projectedIntakeConfiguredRowCount, 15);
  assert.equal(report.stages[0].evidence.projectedMinimumBlockingReady, true);
  assert.equal(report.stages[0].evidence.projectedMinimumBlockingSatisfiedCount, 11);
  assert.equal(report.stages[0].evidence.projectedMinimumBlockingTargetSignature, minimumBlockingTargetSignature);
  assert.equal(report.stages[0].evidence.projectedMinimumBlockingTargetCount, 11);
  assert.equal(report.stages[0].evidence.projectedMinimumBlockingMissingCount, 0);
  assert.equal(report.stages[0].evidence.projectedMinimumBlockingVariableRowCount, 10);
  assert.equal(report.stages[0].evidence.projectedMinimumBlockingAlternativeGroupCount, 1);
  assert.equal(report.stages[0].evidence.projectedMinimumWarningReady, false);
  assert.equal(report.stages[0].evidence.projectedMinimumWarningSatisfiedCount, 0);
  assert.equal(report.stages[0].evidence.projectedMinimumWarningTargetCount, 8);
  assert.equal(report.stages[0].evidence.projectedMinimumWarningMissingCount, 8);
  assert.ok(report.nextActions.some((action) => action.includes("去掉 --production-env-values-dry-run")));
  const markdown = formatProductionFirstStageExecution(report);
  assert.match(markdown, /Production env values dry-run: yes/);
  assert.match(markdown, /Production env values dry-run projected env preflight: ready \(10\/10\), blockers 0/);
  assert.match(markdown, /Production env values dry-run projected intake: configured 15\/22, missing required 0, alternative blockers 0/);
  assert.match(markdown, /Production env values dry-run minimum blocking: ready \(11\/11\), missing 0/);
  assert.match(markdown, /Production env values dry-run warning\/optional: blocked \(0\/8\), missing 8/);
  assert.match(markdown, /dry-run projected env preflight: ready \(10\/10\)/);
  assert.match(markdown, /dry-run projected minimum blocking values: ready \(11\/11\), missing 0/);
  assert.match(markdown, /dry-run projected warning\/optional values: blocked \(0\/8\), missing 8/);
  assertNoSensitiveOutput(JSON.stringify(report) + markdown);

  const blockedReport = buildProductionFirstStageExecution({
    envFiles: [sensitiveEnvFile],
    productionEnvValuesFile: sensitiveProductionEnvValuesFile,
    productionEnvValuesDryRun: true,
    checkedAt: "2026-07-08T09:00:00.000Z",
    stepExecutor: () =>
      blockedJson("v1_production_env_real_value_intake_apply", "真实值合并 dry-run 仍有阻塞", [
        "修正安全真实值片段。",
      ]),
  });
  assert.equal(blockedReport.status, "blocked");
  assert.equal(blockedReport.ready, false);
  assert.equal(blockedReport.summary.productionEnvValuesDryRunCoverage.included, false);
  assert.equal(blockedReport.summary.productionEnvValuesDryRunCoverage.stageStatus, "blocked");
  assert.equal(blockedReport.safeguards.productionEnvFileMutated, false);
  assert.ok(blockedReport.nextActions[0].includes("dry-run 阻塞"));
  assertNoSensitiveOutput(JSON.stringify(blockedReport) + formatProductionFirstStageExecution(blockedReport));

  assert.throws(
    () =>
      buildProductionFirstStageExecution({
        envFiles: [sensitiveEnvFile],
        productionEnvValuesDryRun: true,
        planOnly: true,
      }),
    /requires --production-env-values-file/,
  );
}

function checkReadyExecutionWithoutMigrationApply() {
  const report = buildProductionFirstStageExecution({
    envFiles: [sensitiveEnvFile],
    fieldEvidenceManifestPath: sensitiveFieldEvidenceManifest,
    checkedAt: "2026-07-08T09:00:00.000Z",
    stepExecutor: fakeExecutor({
      "env-file-audit": readyJson("v1_production_env_file_audit", "1 个 env 文件安全审计通过"),
      "production-env-intake-verify": readyJson(
        "v1_production_env_real_value_intake_verification",
        "真实值 intake / env 校验通过",
      ),
      "production-env-preflight": readyJson("v1_production_env_preflight", "10/10 通过"),
      "db-migrations-dry-run": { status: 0, stdout: `dry-run ok ${sensitiveDatabaseUrl}`, stderr: "" },
      "persistence-evidence": readyJson("v1_production_persistence_evidence", "7/7 阶段通过"),
      "runtime-smoke": readyJson("v1_production_runtime_smoke", "4/4 通过"),
      "first-stage-evidence-suggestions": reviewRequiredJson(
        "v1_production_first_stage_evidence_suggestions",
        "已生成第一阶段现场证据回填建议",
      ),
      "first-stage-closeout": readyJson("v1_production_first_stage_closeout", "6/6 通过"),
    }),
  });
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.summary.passedCount, 8);
  assert.equal(report.execution.applyMigrations, false);
  assert.equal(report.execution.restoreResetExplicitlyAllowed, false);
  assert.equal(report.safeguards.schemaMigrationApplyExecuted, false);
  assert.equal(report.safeguards.declaresFullV1Complete, false);
  assert.equal(report.stages.find((stage) => stage.key === "db-migrations-dry-run")?.status, "passed");
  assert.equal(report.stages.find((stage) => stage.key === "production-env-intake-verify")?.status, "passed");
  assert.equal(report.summary.productionEnvIntakeCoverage.included, true);
  assert.equal(report.summary.productionEnvIntakeCoverage.reportReady, true);
  assert.equal(report.summary.productionEnvIntakeCoverage.fullIntakeConfiguredLabel, "22/22");
  assert.equal(report.summary.productionEnvIntakeCoverage.minimumBlockingLabel, "11/11");
  assert.equal(report.summary.productionEnvIntakeCoverage.minimumWarningLabel, "8/8");
  assert.equal(report.stages.find((stage) => stage.key === "production-env-intake-verify")?.evidence.intakeCoverageIncluded, true);
  assert.equal(report.stages.find((stage) => stage.key === "first-stage-evidence-suggestions")?.status, "passed");
  assert.equal(
    report.stages.find((stage) => stage.key === "first-stage-evidence-suggestions")?.evidence.reportReady,
    false,
  );
  assert.match(report.stages.find((stage) => stage.key === "first-stage-closeout")?.command || "", /--field-evidence-manifest <field-evidence-manifest>/);
  const markdown = formatProductionFirstStageExecution(report);
  assert.match(markdown, /Production env intake: ready \(full 22\/22, missing rows 0, blockers 0, warnings 0\)/);
  assert.match(markdown, /Production env intake minimum blocking: 11\/11, missing 0/);
  assert.match(markdown, /Production env intake warning\/optional: 8\/8, missing 0/);
  assert.match(markdown, /intake full coverage: 22\/22, missing rows 0/);
  assertNoSensitiveOutput(JSON.stringify(report) + markdown);

  const artifacts = writeProductionFirstStageExecutionArtifacts(report, { outputDir });
  assert.equal(existsSync(artifacts.latestJsonPath), true);
  assert.equal(existsSync(artifacts.latestMarkdownPath), true);
  assertNoSensitiveOutput(readFileSync(artifacts.latestJsonPath, "utf8"));
  assertNoSensitiveOutput(readFileSync(artifacts.latestMarkdownPath, "utf8"));
}

function checkReadyExecutionWithProductionEnvValuesApply() {
  const report = buildProductionFirstStageExecution({
    envFiles: [sensitiveEnvFile],
    productionEnvValuesFile: sensitiveProductionEnvValuesFile,
    fieldEvidenceManifestPath: sensitiveFieldEvidenceManifest,
    checkedAt: "2026-07-08T09:00:00.000Z",
    stepExecutor: fakeExecutor({
      "production-env-values-dry-run-proof": readyJson(
        "v1_production_env_values_dry_run_proof_check",
        "真实值 dry-run 证明有效，正式合并可继续",
      ),
      "production-env-intake-apply": readyJson(
        "v1_production_env_real_value_intake_apply",
        "真实值已按 intake 清单合并，生产 env setup / 预检 / intake 校验均 ready",
      ),
      "env-file-audit": readyJson("v1_production_env_file_audit", "1 个 env 文件安全审计通过"),
      "production-env-intake-verify": readyJson(
        "v1_production_env_real_value_intake_verification",
        "真实值 intake / env 校验通过",
      ),
      "production-env-preflight": readyJson("v1_production_env_preflight", "10/10 通过"),
      "db-migrations-dry-run": { status: 0, stdout: `dry-run ok ${sensitiveDatabaseUrl}`, stderr: "" },
      "persistence-evidence": readyJson("v1_production_persistence_evidence", "7/7 阶段通过"),
      "runtime-smoke": readyJson("v1_production_runtime_smoke", "4/4 通过"),
      "first-stage-evidence-suggestions": reviewRequiredJson(
        "v1_production_first_stage_evidence_suggestions",
        "已生成第一阶段现场证据回填建议",
      ),
      "first-stage-closeout": readyJson("v1_production_first_stage_closeout", "6/6 通过"),
    }),
  });
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.summary.passedCount, 10);
  assert.equal(report.summary.totalCount, 10);
  assert.equal(report.execution.productionEnvValuesFileProvided, true);
  assert.equal(report.stages[0].key, "production-env-values-dry-run-proof");
  assert.equal(report.stages[0].status, "passed");
  assert.equal(report.stages[1].key, "production-env-intake-apply");
  assert.equal(report.stages[1].status, "passed");
  assert.equal(report.stages.find((stage) => stage.key === "env-file-audit")?.status, "passed");
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionFirstStageExecution(report));
}

function checkBlockedExecutionStopsAtFirstBlocker() {
  const calls = [];
  const report = buildProductionFirstStageExecution({
    envFiles: [sensitiveEnvFile],
    checkedAt: "2026-07-08T09:00:00.000Z",
    stepExecutor: (step) => {
      calls.push(step.key);
      if (step.key === "production-env-intake-verify") {
        return intakeVerifyBlockedJson();
      }
      return readyJson("v1_production_env_file_audit", "1 个 env 文件安全审计通过");
    },
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.deepEqual(calls, ["env-file-audit", "production-env-intake-verify"]);
  assert.equal(report.blockingStages[0]?.key, "production-env-intake-verify");
  assert.equal(report.summary.productionEnvIntakeCoverage.included, true);
  assert.equal(report.summary.productionEnvIntakeCoverage.reportReady, false);
  assert.equal(report.summary.productionEnvIntakeCoverage.fullIntakeConfiguredLabel, "0/22");
  assert.equal(report.summary.productionEnvIntakeCoverage.minimumBlockingLabel, "0/11");
  assert.equal(report.summary.productionEnvIntakeCoverage.minimumBlockingMissingCount, 11);
  assert.equal(report.summary.productionEnvIntakeCoverage.minimumWarningLabel, "0/8");
  assert.equal(report.summary.productionEnvIntakeCoverage.minimumWarningMissingCount, 8);
  assert.equal(report.summary.productionEnvIntakeCoverage.auditReady, true);
  assert.equal(report.summary.productionEnvIntakeCoverage.intakeCsvReady, true);
  assert.ok(report.nextActions[0].includes("生产 env 真实值 intake 校验"));
  const markdown = formatProductionFirstStageExecution(report);
  assert.match(markdown, /Production env intake: blocked \(full 0\/22, missing rows 22, blockers 11, warnings 8\)/);
  assert.match(markdown, /Production env intake minimum blocking: 0\/11, missing 11/);
  assert.match(markdown, /Production env intake warning\/optional: 0\/8, missing 8/);
  assert.match(markdown, /intake full coverage: 0\/22, missing rows 22/);
  assertNoSensitiveOutput(JSON.stringify(report) + markdown);
}

function checkMigrationApplyRequiresExplicitFlag() {
  const report = buildProductionFirstStageExecution({
    applyMigrations: true,
    envFiles: [sensitiveEnvFile],
    fieldEvidenceManifestPath: sensitiveFieldEvidenceManifest,
    checkedAt: "2026-07-08T09:00:00.000Z",
    stepExecutor: fakeExecutor({
      "env-file-audit": readyJson("v1_production_env_file_audit", "1 个 env 文件安全审计通过"),
      "production-env-intake-verify": readyJson(
        "v1_production_env_real_value_intake_verification",
        "真实值 intake / env 校验通过",
      ),
      "production-env-preflight": readyJson("v1_production_env_preflight", "10/10 通过"),
      "db-migrations-apply": { status: 0, stdout: `Applied migrations ${sensitiveDatabaseUrl}`, stderr: "" },
      "persistence-evidence": readyJson("v1_production_persistence_evidence", "7/7 阶段通过"),
      "runtime-smoke": readyJson("v1_production_runtime_smoke", "4/4 通过"),
      "first-stage-evidence-suggestions": reviewRequiredJson(
        "v1_production_first_stage_evidence_suggestions",
        "已生成第一阶段现场证据回填建议",
      ),
      "first-stage-closeout": readyJson("v1_production_first_stage_closeout", "6/6 通过"),
    }),
  });
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.execution.applyMigrations, true);
  assert.equal(report.execution.restoreResetExplicitlyAllowed, false);
  assert.equal(report.safeguards.schemaMigrationApplyExecuted, true);
  assert.equal(report.stages.find((stage) => stage.key === "db-migrations-apply")?.status, "passed");
  assert.match(report.stages.find((stage) => stage.key === "db-migrations-apply")?.command || "", /--apply/);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionFirstStageExecution(report));
}

async function checkCliPlanOnlyAndRedaction() {
  const run = await runNodeCli([
    runnerScript,
    "--plan-only",
    "--env-file",
    sensitiveEnvFile,
    "--psql-command",
    "/private/tmp/psql-secret-wrapper",
    "--pg-dump-command",
    "/private/tmp/pg-dump-secret-wrapper",
    "--production-env-intake-csv",
    sensitiveProductionEnvIntakeCsv,
    "--production-env-values-file",
    sensitiveProductionEnvValuesFile,
    "--allow-restore-reset",
    "--field-evidence-manifest",
    sensitiveFieldEvidenceManifest,
    "--json",
  ]);
  assert.equal(run.status, 2, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.status, "planned");
  assert.equal(report.ready, false);
  assert.equal(report.execution.fieldEvidenceManifestSource, "cli");
  assert.equal(report.execution.fieldEvidenceManifestConfigured, true);
  assert.equal(report.execution.fieldEvidenceManifestDefaultTemplateUsed, false);
  assert.equal(report.execution.productionEnvValuesFileProvided, true);
  assert.equal(report.execution.restoreResetExplicitlyAllowed, true);
  assert.equal(report.stages[0].key, "production-env-values-dry-run-proof");
  assert.match(report.stages[0].command, /--values-env-file <production-env-values-file>/);
  assert.match(report.stages[0].command, /--apply-report-json <production-env-values-apply-output-json>/);
  assert.equal(report.stages[1].key, "production-env-intake-apply");
  assert.match(report.stages[2].command, /--env-file <secure-env-file>/);
  assert.match(
    report.stages.find((stage) => stage.key === "production-env-intake-verify")?.command || "",
    /--intake-csv <production-env-intake-csv>/,
  );
  assert.match(report.stages.find((stage) => stage.key === "persistence-evidence")?.command || "", /--pg-dump-command <pg-dump-command>/);
  assert.match(report.stages.find((stage) => stage.key === "persistence-evidence")?.command || "", /--allow-restore-reset/);
  assert.match(report.stages.find((stage) => stage.key === "first-stage-closeout")?.command || "", /--field-evidence-manifest <field-evidence-manifest>/);
  assertNoSensitiveOutput(run.stdout + run.stderr);

  const dryRunPlan = await runNodeCli([
    runnerScript,
    "--plan-only",
    "--env-file",
    sensitiveEnvFile,
    "--production-env-intake-csv",
    sensitiveProductionEnvIntakeCsv,
    "--production-env-values-file",
    sensitiveProductionEnvValuesFile,
    "--production-env-values-dry-run",
    "--json",
  ]);
  assert.equal(dryRunPlan.status, 2, dryRunPlan.stderr || dryRunPlan.stdout);
  const dryRunPlanReport = JSON.parse(dryRunPlan.stdout);
  assert.equal(dryRunPlanReport.status, "planned");
  assert.equal(dryRunPlanReport.ready, false);
  assert.equal(dryRunPlanReport.execution.productionEnvValuesDryRun, true);
  assert.equal(dryRunPlanReport.stages.length, 1);
  assert.equal(dryRunPlanReport.stages[0].key, "production-env-intake-apply-dry-run");
  assert.match(dryRunPlanReport.stages[0].command, /--dry-run/);
  assert.match(dryRunPlanReport.stages[0].command, /--target-env-file <secure-env-file>/);
  assertNoSensitiveOutput(dryRunPlan.stdout + dryRunPlan.stderr);

  const manifestEnvFile = join(storageRoot, "cli-manifest-path.env");
  writeFileSync(
    manifestEnvFile,
    [
      "# Filled field evidence manifest path lives in a secure untracked env file.",
      `ERP_V1_FIELD_EVIDENCE_MANIFEST="${sensitiveFieldEvidenceManifest}"`,
      "",
    ].join("\n"),
  );
  const envFileRun = await runNodeCli([
    runnerScript,
    "--plan-only",
    "--env-file",
    manifestEnvFile,
    "--psql-command",
    "/private/tmp/psql-secret-wrapper",
    "--pg-dump-command",
    "/private/tmp/pg-dump-secret-wrapper",
    "--json",
  ]);
  assert.equal(envFileRun.status, 2, envFileRun.stderr || envFileRun.stdout);
  const envFileReport = JSON.parse(envFileRun.stdout);
  assert.equal(envFileReport.status, "planned");
  assert.equal(envFileReport.execution.fieldEvidenceManifestSource, "secure_env_file");
  assert.equal(envFileReport.execution.fieldEvidenceManifestConfigured, true);
  assert.equal(envFileReport.execution.fieldEvidenceManifestDefaultTemplateUsed, false);
  assert.match(
    envFileReport.stages.find((stage) => stage.key === "first-stage-closeout")?.command || "",
    /--field-evidence-manifest <field-evidence-manifest>/,
  );
  assertNoSensitiveOutput(envFileRun.stdout + envFileRun.stderr);

  const setupRun = await runNodeCli([
    runnerScript,
    "--plan-only",
    "--use-production-env-setup-env-file",
    "--production-env-setup-json",
    productionEnvSetupJsonPath,
    "--json",
  ]);
  assert.equal(setupRun.status, 2, setupRun.stderr || setupRun.stdout);
  const setupReport = JSON.parse(setupRun.stdout);
  assert.equal(setupReport.status, "planned");
  assert.equal(setupReport.execution.envFileSource, "production_env_setup");
  assert.equal(setupReport.execution.envFileFromProductionSetup, true);
  assert.equal(setupReport.execution.fieldEvidenceManifestSource, "secure_env_file");
  assert.equal(setupReport.execution.fieldEvidenceManifestConfigured, true);
  assert.match(setupReport.stages[0].command, /--env-file <secure-env-file>/);
  assertNoSensitiveOutput(setupRun.stdout + setupRun.stderr);

  const redacted = redactExecutionText(
    `${sensitiveEnvFile} ${sensitiveFieldEvidenceManifest} ${sensitiveDatabaseUrl} ${sensitiveEndpoint}/${sensitiveBucket} ${sensitiveAccessKey} ${sensitiveSecretKey}`,
  );
  assertNoSensitiveOutput(redacted);
}

function fakeExecutor(results) {
  return (step) => {
    const result = results[step.key];
    assert.ok(result, `Missing fake result for ${step.key}`);
    return result;
  };
}

function readyJson(scope, label) {
  const intakeSummary =
    scope === "v1_production_env_real_value_intake_verification"
      ? {
          label,
          envFileCount: 1,
          intakeRowCount: 22,
          configuredRowCount: 22,
          missingRowCount: 0,
          configuredLabel: "22/22",
          fullIntakeConfiguredLabel: "22/22",
          alternativeGroupCount: 2,
          alternativeGroupBlockingCount: 0,
          alternativeGroupWarningCount: 0,
          minimumBlockingTargetCount: 11,
          minimumBlockingSatisfiedCount: 11,
          minimumBlockingMissingCount: 0,
          minimumBlockingVariableRowCount: 10,
          minimumBlockingAlternativeGroupCount: 1,
          minimumBlockingLabel: "11/11",
          minimumWarningTargetCount: 8,
          minimumWarningSatisfiedCount: 8,
          minimumWarningMissingCount: 0,
          minimumWarningVariableRowCount: 7,
          minimumWarningAlternativeGroupCount: 1,
          minimumWarningLabel: "8/8",
          passedRowCount: 22,
          blockingCount: 0,
          warningCount: 0,
          auditReady: true,
          intakeCsvReady: true,
        }
      : { label, passedCount: 1, totalCount: 1, blockingCount: 0, warningCount: 0 };
  return {
    status: 0,
    stdout: `${JSON.stringify({
      scope,
      status: "ready",
      ready: true,
      summary: intakeSummary,
      safeguards: {
        envValuesExposed: false,
        databaseUrlExposed: false,
        objectStorageEndpointExposed: false,
        objectStorageBucketExposed: false,
        secretFieldsExposed: false,
        payloadExposed: false,
      },
      nextActions: ["继续下一步。"],
      diagnosticNoise: `${sensitiveDatabaseUrl} ${sensitiveEndpoint} ${sensitiveBucket} ${sensitiveAccessKey} ${sensitiveSecretKey}`,
    })}\n`,
    stderr: "",
  };
}

function intakeVerifyBlockedJson() {
  return {
    status: 2,
    stdout: `${JSON.stringify({
      scope: "v1_production_env_real_value_intake_verification",
      status: "blocked",
      ready: false,
      summary: {
        label: "11 项真实值 intake / env 校验阻塞",
        envFileCount: 1,
        intakeRowCount: 22,
        configuredRowCount: 0,
        missingRowCount: 22,
        configuredLabel: "0/22",
        fullIntakeConfiguredLabel: "0/22",
        alternativeGroupCount: 2,
        alternativeGroupBlockingCount: 1,
        alternativeGroupWarningCount: 1,
        minimumBlockingTargetCount: 11,
        minimumBlockingSatisfiedCount: 0,
        minimumBlockingMissingCount: 11,
        minimumBlockingVariableRowCount: 10,
        minimumBlockingAlternativeGroupCount: 1,
        minimumBlockingLabel: "0/11",
        minimumWarningTargetCount: 8,
        minimumWarningSatisfiedCount: 0,
        minimumWarningMissingCount: 8,
        minimumWarningVariableRowCount: 7,
        minimumWarningAlternativeGroupCount: 1,
        minimumWarningLabel: "0/8",
        passedRowCount: 0,
        blockingCount: 11,
        warningCount: 8,
        auditReady: true,
        intakeCsvReady: true,
      },
      nextActions: ["先补 PostgreSQL 生产库真实值。", `不要泄漏 ${sensitiveDatabaseUrl}`],
      diagnosticNoise: `${sensitiveDatabaseUrl} ${sensitiveEndpoint} ${sensitiveBucket} ${sensitiveAccessKey} ${sensitiveSecretKey}`,
    })}\n`,
    stderr: "",
  };
}

function reviewRequiredJson(scope, label) {
  return {
    status: 0,
    stdout: `${JSON.stringify({
      scope,
      status: "review_required",
      ready: false,
      summary: {
        label,
        autoAcceptedSuggestionCount: 7,
        partialSuggestionCount: 2,
        manualOnlyCount: 1,
        firstStageManualReviewStillRequired: true,
      },
      safeguards: {
        sourceCsvMutated: false,
        sourceReportsMutated: false,
        sourceManifestMutated: false,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
        productionEnvMutated: false,
        suggestionsRequireHumanReview: true,
        declaresFullV1Complete: false,
        rawSecretsIncluded: false,
      },
      nextActions: ["负责人复核 suggested-evidence-items.csv 后再应用。"],
      diagnosticNoise: `${sensitiveDatabaseUrl} ${sensitiveEndpoint} ${sensitiveBucket} ${sensitiveAccessKey} ${sensitiveSecretKey}`,
    })}\n`,
    stderr: "",
  };
}

function dryRunReadyJson() {
  return {
    status: 0,
    stdout: `${JSON.stringify({
      scope: "v1_production_env_real_value_intake_apply",
      status: "dry_run",
      ready: false,
      dryRun: true,
      summary: {
        label: "真实值合并 dry-run 已完成，未写入目标 env 文件",
        applicableValueCount: 15,
        appliedVariableCount: 0,
        blockingCount: 0,
        warningCount: 0,
      },
      dryRunProjection: {
        envValuesIncluded: false,
        envFilePathIncluded: false,
        targetWouldBeWritten: false,
        productionEnvPreflight: {
          status: "ready",
          ready: true,
          passedCount: 10,
          totalCount: 10,
          blockingCount: 0,
          warningCount: 0,
          firstRemainingFixItems: [],
        },
        intakeCoverage: {
          rowCount: 22,
          configuredRowCount: 15,
          notRequiredRowCount: 7,
          missingRequiredVariableCount: 0,
          missingWarningVariableCount: 0,
          alternativeGroupBlockingCount: 0,
          alternativeGroupWarningCount: 0,
          firstMissingVariables: [],
        },
        minimumBlockingCoverage: {
          ready: true,
          targetCount: 11,
          satisfiedCount: 11,
          missingCount: 0,
          targetSignature: minimumBlockingTargetSignature,
          variableRowCount: 10,
          configuredVariableRowCount: 10,
          missingVariableRowCount: 0,
          alternativeGroupCount: 1,
          satisfiedAlternativeGroupCount: 1,
          missingAlternativeGroupCount: 0,
          conflictedAlternativeGroupCount: 0,
          firstMissingTargets: [],
        },
        minimumWarningCoverage: {
          ready: false,
          targetCount: 8,
          satisfiedCount: 0,
          missingCount: 8,
          variableRowCount: 7,
          configuredVariableRowCount: 0,
          missingVariableRowCount: 7,
          alternativeGroupCount: 1,
          satisfiedAlternativeGroupCount: 0,
          missingAlternativeGroupCount: 1,
          conflictedAlternativeGroupCount: 0,
          firstMissingTargets: [
            {
              type: "variable",
              itemKey: "readiness-api-env",
              label: "V1 readiness API",
              variableKey: "ERP_V1_READINESS_API_BASE_URL",
              status: "missing_warning",
            },
          ],
        },
      },
      safeguards: {
        envValuesExposed: false,
        targetEnvFilePathIncluded: false,
        secretFieldsExposed: false,
      },
      nextActions: ["去掉 --dry-run 正式合并。"],
      diagnosticNoise: `${sensitiveDatabaseUrl} ${sensitiveEndpoint} ${sensitiveBucket} ${sensitiveAccessKey} ${sensitiveSecretKey}`,
    })}\n`,
    stderr: "",
  };
}

function blockedJson(scope, label, nextActions = []) {
  return {
    status: 2,
    stdout: `${JSON.stringify({
      scope,
      status: "blocked",
      ready: false,
      summary: { label, passedCount: 0, totalCount: 1, blockingCount: 1, warningCount: 0 },
      nextActions,
      diagnosticNoise: `${sensitiveDatabaseUrl} ${sensitiveEndpoint} ${sensitiveBucket} ${sensitiveAccessKey} ${sensitiveSecretKey}`,
    })}\n`,
    stderr: "",
  };
}

function runNodeCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--", ...args], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH || "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function assertNoSensitiveOutput(value) {
  const text = String(value || "");
  for (const sensitive of [
    sensitiveEnvFile,
    sensitiveFieldEvidenceManifest,
    "/private/tmp/psql-secret-wrapper",
    "/private/tmp/pg-dump-secret-wrapper",
    sensitiveDatabaseUrl,
    "SUPER_SECRET_EXEC_PASSWORD",
    sensitiveEndpoint,
    sensitiveBucket,
    sensitiveAccessKey,
    sensitiveSecretKey,
    sensitiveProductionApiBaseUrl,
    sensitiveProductionEnvIntakeCsv,
    sensitiveProductionEnvValuesFile,
    productionEnvSetupSecret,
  ]) {
    assert.doesNotMatch(text, new RegExp(escapeRegExp(sensitive)), `sensitive output leaked: ${sensitive}`);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
