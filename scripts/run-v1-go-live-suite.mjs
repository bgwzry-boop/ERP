#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveProductionEnvSetupEnvFiles } from "./productionEnvSetupEnvFileResolver.mjs";

const defaultOutputRoot = join(".erp-local-storage", "v1-go-live-suite");
const defaultCanonicalLatestRoot = ".erp-local-storage";
const defaultFieldEvidenceManifestPath = join("docs", "development", "v1-field-evidence-manifest.template.json");
const defaultReleaseCandidateJsonPath = join(".erp-local-storage", "v1-release-candidate", "latest.json");
const defaultReleaseCandidateMarkdownPath = join(".erp-local-storage", "v1-release-candidate", "latest.md");
const defaultV1V2ScopePath = join("docs", "development", "v1-v2-scope.zh-CN.md");
const defaultProductionEnvSetupJsonPath = join(".erp-local-storage", "v1-production-env-setup", "latest.json");
const defaultProductionEnvSetupMarkdownPath = join(".erp-local-storage", "v1-production-env-setup", "latest.md");
const defaultProductionEnvIntakeVerifyJsonPath = join(
  ".erp-local-storage",
  "v1-production-env-intake-verify",
  "latest.json",
);
const defaultProductionEnvIntakeVerifyMarkdownPath = join(
  ".erp-local-storage",
  "v1-production-env-intake-verify",
  "latest.md",
);
const defaultProductionFirstStageExecutionJsonPath = join(
  ".erp-local-storage",
  "v1-production-first-stage-execution",
  "latest.json",
);
const defaultProductionFirstStageExecutionMarkdownPath = join(
  ".erp-local-storage",
  "v1-production-first-stage-execution",
  "latest.md",
);
const defaultProductionFirstStageEvidenceSuggestionsJsonPath = join(
  ".erp-local-storage",
  "v1-production-first-stage-evidence-suggestions",
  "latest.json",
);
const defaultProductionFirstStageEvidenceSuggestionsMarkdownPath = join(
  ".erp-local-storage",
  "v1-production-first-stage-evidence-suggestions",
  "latest.md",
);
const defaultProductionFirstStageEvidenceSuggestionsCsvPath = join(
  ".erp-local-storage",
  "v1-production-first-stage-evidence-suggestions",
  "suggested-evidence-items.csv",
);
const defaultProductionPersistenceEvidenceJsonPath = join(
  ".erp-local-storage",
  "v1-production-persistence-evidence",
  "latest.json",
);
const defaultProductionPersistenceEvidenceMarkdownPath = join(
  ".erp-local-storage",
  "v1-production-persistence-evidence",
  "latest.md",
);
const defaultProductionRuntimeSmokeJsonPath = join(".erp-local-storage", "v1-production-runtime-smoke", "latest.json");
const defaultProductionRuntimeSmokeMarkdownPath = join(".erp-local-storage", "v1-production-runtime-smoke", "latest.md");
const defaultPrintChainExecutionJsonPath = join(".erp-local-storage", "v1-print-chain-execution", "latest.json");
const defaultPrintChainExecutionMarkdownPath = join(".erp-local-storage", "v1-print-chain-execution", "latest.md");
const defaultPrintChainCloseoutJsonPath = join(".erp-local-storage", "v1-print-chain-closeout", "latest.json");
const defaultPrintChainCloseoutMarkdownPath = join(".erp-local-storage", "v1-print-chain-closeout", "latest.md");
const defaultDriverRealDeviceExecutionJsonPath = join(
  ".erp-local-storage",
  "v1-driver-real-device-execution",
  "latest.json",
);
const defaultDriverRealDeviceExecutionMarkdownPath = join(
  ".erp-local-storage",
  "v1-driver-real-device-execution",
  "latest.md",
);
const defaultDriverRealDeviceCloseoutJsonPath = join(
  ".erp-local-storage",
  "v1-driver-real-device-closeout",
  "latest.json",
);
const defaultDriverRealDeviceCloseoutMarkdownPath = join(
  ".erp-local-storage",
  "v1-driver-real-device-closeout",
  "latest.md",
);

const scripts = {
  releaseCandidate: fileURLToPath(new URL("./run-v1-release-candidate-check.mjs", import.meta.url)),
  fieldEvidenceApply: fileURLToPath(new URL("./apply-v1-field-evidence-intake.mjs", import.meta.url)),
  onsiteTaskBoard: fileURLToPath(new URL("./run-v1-onsite-task-board.mjs", import.meta.url)),
  completionSnapshot: fileURLToPath(new URL("./run-v1-completion-snapshot.mjs", import.meta.url)),
  v1V2ScopeBrief: fileURLToPath(new URL("./run-v1-v2-scope-brief.mjs", import.meta.url)),
  ownerDecisionBrief: fileURLToPath(new URL("./run-v1-owner-decision-brief.mjs", import.meta.url)),
  fieldEvidenceIntake: fileURLToPath(new URL("./run-v1-field-evidence-intake-pack.mjs", import.meta.url)),
  handoffPack: fileURLToPath(new URL("./run-v1-go-live-handoff-pack.mjs", import.meta.url)),
};

const sensitivePatterns = [
  /postgres:\/\/[^\s|)]+/gi,
  /mysql:\/\/[^\s|)]+/gi,
  /mongodb:\/\/[^\s|)]+/gi,
  /AKIA[0-9A-Z_]{8,}/g,
  /SUPER_SECRET_VALUE/gi,
  /pass@[^:\s|)]+/gi,
  /prod-db\.[^\s|)]+/gi,
  /\/var\/spool\/[^\s|)]*/gi,
  /\/usr\/bin\/[^\s|)]*/gi,
  /\/usr\/local\/bin\/[^\s|)]*/gi,
];

try {
  const options = parseArgs(process.argv.slice(2));
  const outputRoot = resolve(options.outputRoot || process.env.ERP_V1_GO_LIVE_SUITE_OUTPUT_ROOT || defaultOutputRoot);
  const sourceFieldEvidenceManifestPath = resolve(
    options.fieldEvidenceManifest ||
      process.env.ERP_V1_FIELD_EVIDENCE_MANIFEST ||
      defaultFieldEvidenceManifestPath,
  );
  if (!existsSync(sourceFieldEvidenceManifestPath)) {
    throw new Error(`V1 field evidence manifest is missing: ${displayInputPath(sourceFieldEvidenceManifestPath)}`);
  }
  const v1V2ScopePath = resolve(options.v1V2Scope || process.env.ERP_V1_V2_SCOPE_BRIEF_SOURCE || defaultV1V2ScopePath);
  if (!existsSync(v1V2ScopePath)) {
    throw new Error(`V1/V2 scope Markdown is missing: ${displayInputPath(v1V2ScopePath)}`);
  }
  const productionEnvSetupJsonPath = resolveOptionalInputPath({
    explicitPath: options.productionEnvSetupJson,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRODUCTION_ENV_SETUP_JSON,
    defaultPath: defaultProductionEnvSetupJsonPath,
    label: "V1 production env setup JSON",
  });
  const productionEnvSetupMarkdownPath = resolveOptionalInputPath({
    explicitPath: options.productionEnvSetupMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRODUCTION_ENV_SETUP_MARKDOWN,
    defaultPath: defaultProductionEnvSetupMarkdownPath,
    label: "V1 production env setup Markdown",
  });
  const productionEnvIntakeVerifyJsonPath = resolveOptionalInputPath({
    explicitPath: options.productionEnvIntakeVerifyJson,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRODUCTION_ENV_INTAKE_VERIFY_JSON,
    defaultPath: defaultProductionEnvIntakeVerifyJsonPath,
    label: "V1 production env intake verification JSON",
  });
  const productionEnvIntakeVerifyMarkdownPath = resolveOptionalInputPath({
    explicitPath: options.productionEnvIntakeVerifyMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRODUCTION_ENV_INTAKE_VERIFY_MARKDOWN,
    defaultPath: defaultProductionEnvIntakeVerifyMarkdownPath,
    label: "V1 production env intake verification Markdown",
  });
  const productionFirstStageExecutionJsonPath = resolveOptionalInputPath({
    explicitPath: options.productionFirstStageExecutionJson,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRODUCTION_FIRST_STAGE_EXECUTION_JSON,
    defaultPath: defaultProductionFirstStageExecutionJsonPath,
    label: "V1 production first-stage execution JSON",
  });
  const productionFirstStageExecutionMarkdownPath = resolveOptionalInputPath({
    explicitPath: options.productionFirstStageExecutionMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRODUCTION_FIRST_STAGE_EXECUTION_MARKDOWN,
    defaultPath: defaultProductionFirstStageExecutionMarkdownPath,
    label: "V1 production first-stage execution Markdown",
  });
  const productionFirstStageEvidenceSuggestionsJsonPath = resolveOptionalInputPath({
    explicitPath: options.productionFirstStageEvidenceSuggestionsJson,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRODUCTION_FIRST_STAGE_EVIDENCE_SUGGESTIONS_JSON,
    defaultPath: defaultProductionFirstStageEvidenceSuggestionsJsonPath,
    label: "V1 production first-stage evidence suggestions JSON",
  });
  const productionFirstStageEvidenceSuggestionsMarkdownPath = resolveOptionalInputPath({
    explicitPath: options.productionFirstStageEvidenceSuggestionsMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRODUCTION_FIRST_STAGE_EVIDENCE_SUGGESTIONS_MARKDOWN,
    defaultPath: defaultProductionFirstStageEvidenceSuggestionsMarkdownPath,
    label: "V1 production first-stage evidence suggestions Markdown",
  });
  const productionFirstStageEvidenceSuggestionsCsvPath = resolveOptionalInputPath({
    explicitPath: options.productionFirstStageEvidenceSuggestionsCsv,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRODUCTION_FIRST_STAGE_EVIDENCE_SUGGESTIONS_CSV,
    defaultPath: defaultProductionFirstStageEvidenceSuggestionsCsvPath,
    label: "V1 production first-stage evidence suggestions CSV",
  });
  const productionPersistenceEvidenceJsonPath = resolveOptionalInputPath({
    explicitPath: options.productionPersistenceEvidenceJson,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRODUCTION_PERSISTENCE_EVIDENCE_JSON,
    defaultPath: defaultProductionPersistenceEvidenceJsonPath,
    label: "V1 production persistence evidence JSON",
  });
  const productionPersistenceEvidenceMarkdownPath = resolveOptionalInputPath({
    explicitPath: options.productionPersistenceEvidenceMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRODUCTION_PERSISTENCE_EVIDENCE_MARKDOWN,
    defaultPath: defaultProductionPersistenceEvidenceMarkdownPath,
    label: "V1 production persistence evidence Markdown",
  });
  const productionRuntimeSmokeJsonPath = resolveOptionalInputPath({
    explicitPath: options.productionRuntimeSmokeJson,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRODUCTION_RUNTIME_SMOKE_JSON,
    defaultPath: defaultProductionRuntimeSmokeJsonPath,
    label: "V1 production runtime-smoke JSON",
  });
  const productionRuntimeSmokeMarkdownPath = resolveOptionalInputPath({
    explicitPath: options.productionRuntimeSmokeMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRODUCTION_RUNTIME_SMOKE_MARKDOWN,
    defaultPath: defaultProductionRuntimeSmokeMarkdownPath,
    label: "V1 production runtime-smoke Markdown",
  });
  const printChainCloseoutJsonPath = resolveOptionalInputPath({
    explicitPath: options.printChainCloseoutJson,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRINT_CHAIN_CLOSEOUT_JSON,
    defaultPath: defaultPrintChainCloseoutJsonPath,
    label: "V1 print-chain closeout JSON",
  });
  const printChainCloseoutMarkdownPath = resolveOptionalInputPath({
    explicitPath: options.printChainCloseoutMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRINT_CHAIN_CLOSEOUT_MARKDOWN,
    defaultPath: defaultPrintChainCloseoutMarkdownPath,
    label: "V1 print-chain closeout Markdown",
  });
  const printChainExecutionJsonPath = resolveOptionalInputPath({
    explicitPath: options.printChainExecutionJson,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRINT_CHAIN_EXECUTION_JSON,
    defaultPath: defaultPrintChainExecutionJsonPath,
    label: "V1 print-chain execution JSON",
  });
  const printChainExecutionMarkdownPath = resolveOptionalInputPath({
    explicitPath: options.printChainExecutionMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_PRINT_CHAIN_EXECUTION_MARKDOWN,
    defaultPath: defaultPrintChainExecutionMarkdownPath,
    label: "V1 print-chain execution Markdown",
  });
  const driverRealDeviceExecutionJsonPath = resolveOptionalInputPath({
    explicitPath: options.driverRealDeviceExecutionJson,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_DRIVER_REAL_DEVICE_EXECUTION_JSON,
    defaultPath: defaultDriverRealDeviceExecutionJsonPath,
    label: "V1 driver real-device execution JSON",
  });
  const driverRealDeviceExecutionMarkdownPath = resolveOptionalInputPath({
    explicitPath: options.driverRealDeviceExecutionMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_DRIVER_REAL_DEVICE_EXECUTION_MARKDOWN,
    defaultPath: defaultDriverRealDeviceExecutionMarkdownPath,
    label: "V1 driver real-device execution Markdown",
  });
  const driverRealDeviceCloseoutJsonPath = resolveOptionalInputPath({
    explicitPath: options.driverRealDeviceCloseoutJson,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_DRIVER_REAL_DEVICE_CLOSEOUT_JSON,
    defaultPath: defaultDriverRealDeviceCloseoutJsonPath,
    label: "V1 driver real-device closeout JSON",
  });
  const driverRealDeviceCloseoutMarkdownPath = resolveOptionalInputPath({
    explicitPath: options.driverRealDeviceCloseoutMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_SUITE_DRIVER_REAL_DEVICE_CLOSEOUT_MARKDOWN,
    defaultPath: defaultDriverRealDeviceCloseoutMarkdownPath,
    label: "V1 driver real-device closeout Markdown",
  });
  const releaseCandidateEnvFiles = resolveReleaseCandidateEnvFiles({
    options,
    productionEnvSetupJsonPath,
  });
  const fieldEvidenceApply = await resolveFieldEvidenceManifest({
    options,
    outputRoot,
    sourceFieldEvidenceManifestPath,
  });
  const fieldEvidenceManifestPath = fieldEvidenceApply.activeManifestPath;

  const releaseCandidate = await resolveReleaseCandidate({
    options,
    outputRoot,
    fieldEvidenceManifestPath,
    releaseCandidateEnvFiles,
  });
  const onsiteTaskBoard = await runJsonStep({
    key: "onsiteTaskBoard",
    label: "V1 onsite task board",
    args: [
      scripts.onsiteTaskBoard,
      "--field-evidence-manifest",
      fieldEvidenceManifestPath,
      "--release-candidate-json",
      releaseCandidate.files.latestJson,
      "--output-dir",
      join(outputRoot, "onsite-task-board"),
      "--json",
    ],
  });
  const completionSnapshot = await runJsonStep({
    key: "completionSnapshot",
    label: "V1 completion snapshot",
    args: [
      scripts.completionSnapshot,
      "--release-candidate-json",
      releaseCandidate.files.latestJson,
      "--onsite-task-board-json",
      onsiteTaskBoard.files.latestJson,
      "--v1-v2-scope",
      v1V2ScopePath,
      "--output-dir",
      join(outputRoot, "completion-snapshot"),
      "--json",
    ],
  });
  const v1V2ScopeBrief = await runJsonStep({
    key: "v1V2ScopeBrief",
    label: "V1/V2 scope brief",
    args: [
      scripts.v1V2ScopeBrief,
      "--v1-v2-scope",
      v1V2ScopePath,
      "--completion-snapshot-json",
      completionSnapshot.files.latestJson,
      "--output-dir",
      join(outputRoot, "v1-v2-scope-brief"),
      "--json",
    ],
  });
  const ownerDecisionBrief = await runJsonStep({
    key: "ownerDecisionBrief",
    label: "V1 owner decision brief",
    args: [
      scripts.ownerDecisionBrief,
      "--completion-snapshot-json",
      completionSnapshot.files.latestJson,
      "--output-dir",
      join(outputRoot, "owner-decision-brief"),
      "--json",
    ],
  });
  const fieldEvidenceIntake = await runJsonStep({
    key: "fieldEvidenceIntake",
    label: "V1 field evidence intake pack",
    args: [
      scripts.fieldEvidenceIntake,
      "--manifest",
      fieldEvidenceManifestPath,
      "--release-candidate-json",
      releaseCandidate.files.latestJson,
      "--onsite-task-board-json",
      onsiteTaskBoard.files.latestJson,
      "--completion-snapshot-json",
      completionSnapshot.files.latestJson,
      "--output-dir",
      join(outputRoot, "field-evidence-intake"),
      "--json",
    ],
  });
  const generatedAt = new Date().toISOString();
  const productionEnvIntakeVerificationForChecklist = readOptionalProductionEnvIntakeVerification(
    productionEnvIntakeVerifyJsonPath,
  );
  const productionGoLiveStageChecklist = buildProductionGoLiveStageChecklist({
    releaseCandidate,
    generatedAt,
    productionEnvIntakeVerification: productionEnvIntakeVerificationForChecklist,
  });
  const productionGoLiveStageChecklistFiles = writeProductionGoLiveStageChecklistFiles({
    outputRoot,
    suite: {
      generatedAt,
      canDeclareV1Complete: Boolean(ownerDecisionBrief.raw?.canDeclareV1Complete),
      productionGoLiveStageChecklist,
    },
  });
  const unblockPlanPreview = buildUnblockPlan({ onsiteTaskBoard });
  const unblockPlanPreviewFiles = writeUnblockPlanFiles({
    outputRoot,
    suite: {
      generatedAt,
      canDeclareV1Complete: Boolean(ownerDecisionBrief.raw?.canDeclareV1Complete),
      unblockPlan: unblockPlanPreview,
    },
  });
  const handoffArgs = [
    scripts.handoffPack,
    "--field-evidence-manifest",
    fieldEvidenceManifestPath,
    "--release-candidate-json",
    releaseCandidate.files.latestJson,
    "--release-candidate-markdown",
    releaseCandidate.files.latestMarkdown,
    "--onsite-task-board-json",
    onsiteTaskBoard.files.latestJson,
    "--onsite-task-board-markdown",
    onsiteTaskBoard.files.latestMarkdown,
    "--onsite-task-board-roles-dir",
    join(outputRoot, "onsite-task-board", "roles"),
    "--completion-snapshot-json",
    completionSnapshot.files.latestJson,
    "--completion-snapshot-markdown",
    completionSnapshot.files.latestMarkdown,
    "--field-evidence-intake-dir",
    join(outputRoot, "field-evidence-intake"),
    "--owner-decision-brief-json",
    ownerDecisionBrief.files.latestJson,
    "--owner-decision-brief-markdown",
    ownerDecisionBrief.files.latestMarkdown,
    "--v1-v2-scope-brief-json",
    v1V2ScopeBrief.files.latestJson,
    "--v1-v2-scope-brief-markdown",
    v1V2ScopeBrief.files.latestMarkdown,
    "--production-go-live-stage-checklist-json",
    productionGoLiveStageChecklistFiles.productionGoLiveStageChecklistJsonPath,
    "--production-go-live-stage-checklist-markdown",
    productionGoLiveStageChecklistFiles.productionGoLiveStageChecklistMarkdownPath,
    "--unblock-plan-json",
    unblockPlanPreviewFiles.unblockPlanJsonPath,
    "--unblock-plan-markdown",
    unblockPlanPreviewFiles.unblockPlanMarkdownPath,
    "--output-dir",
    join(outputRoot, "go-live-handoff"),
    "--json",
  ];
  pushOption(handoffArgs, "--production-env-setup-json", productionEnvSetupJsonPath);
  pushOption(handoffArgs, "--production-env-setup-markdown", productionEnvSetupMarkdownPath);
  pushOption(handoffArgs, "--production-env-intake-verify-json", productionEnvIntakeVerifyJsonPath);
  pushOption(handoffArgs, "--production-env-intake-verify-markdown", productionEnvIntakeVerifyMarkdownPath);
  pushOption(handoffArgs, "--production-first-stage-execution-json", productionFirstStageExecutionJsonPath);
  pushOption(handoffArgs, "--production-first-stage-execution-markdown", productionFirstStageExecutionMarkdownPath);
  pushOption(
    handoffArgs,
    "--production-first-stage-evidence-suggestions-json",
    productionFirstStageEvidenceSuggestionsJsonPath,
  );
  pushOption(
    handoffArgs,
    "--production-first-stage-evidence-suggestions-markdown",
    productionFirstStageEvidenceSuggestionsMarkdownPath,
  );
  pushOption(
    handoffArgs,
    "--production-first-stage-evidence-suggestions-csv",
    productionFirstStageEvidenceSuggestionsCsvPath,
  );
  pushOption(handoffArgs, "--production-persistence-evidence-json", productionPersistenceEvidenceJsonPath);
  pushOption(handoffArgs, "--production-persistence-evidence-markdown", productionPersistenceEvidenceMarkdownPath);
  pushOption(handoffArgs, "--production-runtime-smoke-json", productionRuntimeSmokeJsonPath);
  pushOption(handoffArgs, "--production-runtime-smoke-markdown", productionRuntimeSmokeMarkdownPath);
  pushOption(handoffArgs, "--print-chain-closeout-json", printChainCloseoutJsonPath);
  pushOption(handoffArgs, "--print-chain-closeout-markdown", printChainCloseoutMarkdownPath);
  pushOption(handoffArgs, "--print-chain-execution-json", printChainExecutionJsonPath);
  pushOption(handoffArgs, "--print-chain-execution-markdown", printChainExecutionMarkdownPath);
  pushOption(handoffArgs, "--driver-real-device-execution-json", driverRealDeviceExecutionJsonPath);
  pushOption(handoffArgs, "--driver-real-device-execution-markdown", driverRealDeviceExecutionMarkdownPath);
  pushOption(handoffArgs, "--driver-real-device-closeout-json", driverRealDeviceCloseoutJsonPath);
  pushOption(handoffArgs, "--driver-real-device-closeout-markdown", driverRealDeviceCloseoutMarkdownPath);
  const handoffPack = await runJsonStep({
    key: "handoffPack",
    label: "V1 go-live handoff pack",
    args: handoffArgs,
  });

  const suite = buildSuiteReport({
    generatedAt,
    outputRoot,
    fieldEvidenceManifestPath,
    sourceFieldEvidenceManifestPath,
    fieldEvidenceApply: fieldEvidenceApply.step,
    releaseCandidate,
    onsiteTaskBoard,
    completionSnapshot,
    v1V2ScopeBrief,
    ownerDecisionBrief,
    fieldEvidenceIntake,
    handoffPack,
    productionGoLiveStageChecklist,
    refreshedReleaseCandidate: Boolean(options.refreshReleaseCandidate),
    releaseCandidateEnvFiles,
  });
  if (options.syncCanonicalLatest) {
    suite.canonicalLatest = syncCanonicalLatestArtifacts({
      outputRoot,
      canonicalRoot: resolve(options.canonicalRoot || process.env.ERP_V1_CANONICAL_LATEST_ROOT || defaultCanonicalLatestRoot),
      releaseCandidate,
    });
    suite.safeguards.canonicalLatestSynced = true;
  }
  const files = writeSuiteFiles({ outputRoot, suite });
  const result = buildCommandResult({ suite, files });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatCommandResult(result));
  }
} catch (error) {
  const message = error?.message || String(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(
      `${JSON.stringify({ scope: "v1_go_live_suite", status: "error", ready: false, error: { message: redactText(message) } }, null, 2)}\n`,
    );
  } else {
    process.stderr.write(`V1 go-live suite failed: ${redactText(message)}\n`);
  }
  process.exit(1);
}

function parseArgs(args) {
  const options = { envFiles: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--refresh-release-candidate") {
      options.refreshReleaseCandidate = true;
      continue;
    }
    if (arg === "--use-production-env-setup-env-file") {
      options.useProductionEnvSetupEnvFile = true;
      continue;
    }
    if (arg === "--output-root") {
      options.outputRoot = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--sync-canonical-latest") {
      options.syncCanonicalLatest = true;
      continue;
    }
    if (arg === "--canonical-root") {
      options.canonicalRoot = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--field-evidence-manifest") {
      options.fieldEvidenceManifest = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--field-evidence-intake-csv") {
      options.fieldEvidenceIntakeCsv = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--field-evidence-signoff-boundary-csv") {
      options.fieldEvidenceSignoffBoundaryCsv = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--field-evidence-draft-output") {
      options.fieldEvidenceDraftOutput = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--v1-v2-scope") {
      options.v1V2Scope = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--release-candidate-json") {
      options.releaseCandidateJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--release-candidate-markdown") {
      options.releaseCandidateMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-env-setup-json") {
      options.productionEnvSetupJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-env-setup-markdown") {
      options.productionEnvSetupMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-env-intake-verify-json") {
      options.productionEnvIntakeVerifyJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-env-intake-verify-markdown") {
      options.productionEnvIntakeVerifyMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-first-stage-execution-json") {
      options.productionFirstStageExecutionJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-first-stage-execution-markdown") {
      options.productionFirstStageExecutionMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-first-stage-evidence-suggestions-json") {
      options.productionFirstStageEvidenceSuggestionsJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-first-stage-evidence-suggestions-markdown") {
      options.productionFirstStageEvidenceSuggestionsMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-first-stage-evidence-suggestions-csv") {
      options.productionFirstStageEvidenceSuggestionsCsv = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-persistence-evidence-json") {
      options.productionPersistenceEvidenceJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-persistence-evidence-markdown") {
      options.productionPersistenceEvidenceMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-runtime-smoke-json") {
      options.productionRuntimeSmokeJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-runtime-smoke-markdown") {
      options.productionRuntimeSmokeMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--print-chain-closeout-json") {
      options.printChainCloseoutJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--print-chain-closeout-markdown") {
      options.printChainCloseoutMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--print-chain-execution-json") {
      options.printChainExecutionJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--print-chain-execution-markdown") {
      options.printChainExecutionMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--driver-real-device-execution-json") {
      options.driverRealDeviceExecutionJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--driver-real-device-execution-markdown") {
      options.driverRealDeviceExecutionMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--driver-real-device-closeout-json") {
      options.driverRealDeviceCloseoutJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--driver-real-device-closeout-markdown") {
      options.driverRealDeviceCloseoutMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--env-file") {
      options.envFiles.push(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--api-base-url") {
      options.apiBaseUrl = readValue(args, index, arg);
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
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-go-live-suite.mjs [options]",
    "",
    "Options:",
    "  --output-root <dir>                  Output root, default .erp-local-storage/v1-go-live-suite",
    "  --sync-canonical-latest              Also copy generated downstream latest artifacts to top-level .erp-local-storage/* directories",
    "  --canonical-root <dir>               Root for canonical latest sync, default .erp-local-storage",
    "  --field-evidence-manifest <path>     Filled field-evidence manifest; defaults to checked-in pending template",
    "  --field-evidence-intake-csv <path>   Apply filled intake CSV into a draft manifest before suite generation",
    "  --field-evidence-signoff-boundary-csv <path>",
    "                                      Apply filled signoff/boundary CSV into the same draft manifest",
    "  --field-evidence-draft-output <path> Draft manifest path when applying CSV; defaults under output root",
    "  --v1-v2-scope <path>                 V1/V2 scope Markdown; defaults to docs/development/v1-v2-scope.zh-CN.md",
    "  --release-candidate-json <path>      Existing release-candidate JSON; defaults to .erp-local-storage/v1-release-candidate/latest.json",
    "  --release-candidate-markdown <path>  Existing release-candidate Markdown; defaults to .erp-local-storage/v1-release-candidate/latest.md",
    "  --production-env-setup-json <path>",
    "                                      Existing production env setup JSON; defaults to .erp-local-storage/v1-production-env-setup/latest.json when present",
    "  --production-env-setup-markdown <path>",
    "                                      Existing production env setup Markdown; defaults to .erp-local-storage/v1-production-env-setup/latest.md when present",
    "  --production-env-intake-verify-json <path>",
    "                                      Existing production env intake verification JSON; defaults to .erp-local-storage/v1-production-env-intake-verify/latest.json when present",
    "  --production-env-intake-verify-markdown <path>",
    "                                      Existing production env intake verification Markdown; defaults to .erp-local-storage/v1-production-env-intake-verify/latest.md when present",
    "  --production-first-stage-execution-json <path>",
    "                                      Existing production env / persistence first-stage execution JSON; defaults to .erp-local-storage/v1-production-first-stage-execution/latest.json when present",
    "  --production-first-stage-execution-markdown <path>",
    "                                      Existing production env / persistence first-stage execution Markdown; defaults to .erp-local-storage/v1-production-first-stage-execution/latest.md when present",
    "  --production-first-stage-evidence-suggestions-json <path>",
    "                                      Existing first-stage evidence suggestions JSON; defaults to .erp-local-storage/v1-production-first-stage-evidence-suggestions/latest.json when present",
    "  --production-first-stage-evidence-suggestions-markdown <path>",
    "                                      Existing first-stage evidence suggestions Markdown; defaults to .erp-local-storage/v1-production-first-stage-evidence-suggestions/latest.md when present",
    "  --production-first-stage-evidence-suggestions-csv <path>",
    "                                      Existing first-stage suggested evidence CSV; defaults to .erp-local-storage/v1-production-first-stage-evidence-suggestions/suggested-evidence-items.csv when present",
    "  --production-persistence-evidence-json <path>",
    "                                      Existing production persistence evidence JSON; defaults to .erp-local-storage/v1-production-persistence-evidence/latest.json when present",
    "  --production-persistence-evidence-markdown <path>",
    "                                      Existing production persistence evidence Markdown; defaults to .erp-local-storage/v1-production-persistence-evidence/latest.md when present",
    "  --production-runtime-smoke-json <path>",
    "                                      Existing production runtime-smoke JSON; defaults to .erp-local-storage/v1-production-runtime-smoke/latest.json when present",
    "  --production-runtime-smoke-markdown <path>",
    "                                      Existing production runtime-smoke Markdown; defaults to .erp-local-storage/v1-production-runtime-smoke/latest.md when present",
    "  --print-chain-closeout-json <path>",
    "                                      Existing print-chain closeout JSON; defaults to .erp-local-storage/v1-print-chain-closeout/latest.json when present",
    "  --print-chain-closeout-markdown <path>",
    "                                      Existing print-chain closeout Markdown; defaults to .erp-local-storage/v1-print-chain-closeout/latest.md when present",
    "  --print-chain-execution-json <path>",
    "                                      Existing print-chain execution JSON; defaults to .erp-local-storage/v1-print-chain-execution/latest.json when present",
    "  --print-chain-execution-markdown <path>",
    "                                      Existing print-chain execution Markdown; defaults to .erp-local-storage/v1-print-chain-execution/latest.md when present",
    "  --driver-real-device-execution-json <path>",
    "                                      Existing driver real-device execution JSON; defaults to .erp-local-storage/v1-driver-real-device-execution/latest.json when present",
    "  --driver-real-device-execution-markdown <path>",
    "                                      Existing driver real-device execution Markdown; defaults to .erp-local-storage/v1-driver-real-device-execution/latest.md when present",
    "  --driver-real-device-closeout-json <path>",
    "                                      Existing driver real-device closeout JSON; defaults to .erp-local-storage/v1-driver-real-device-closeout/latest.json when present",
    "  --driver-real-device-closeout-markdown <path>",
    "                                      Existing driver real-device closeout Markdown; defaults to .erp-local-storage/v1-driver-real-device-closeout/latest.md when present",
    "  --refresh-release-candidate          Run release-candidate check before generating downstream packs",
    "  --use-production-env-setup-env-file  When refreshing release-candidate and no --env-file is passed, reuse the safe env file recorded by production env setup",
    "  --env-file <path>                    Env file passed to release-candidate refresh. Can be repeated.",
    "  --api-base-url <url>                 API URL passed to release-candidate refresh",
    "  --operator-id <id>                   Office operator passed to release-candidate refresh",
    "  --driver-operator-id <id>            Driver operator passed to release-candidate refresh",
    "  --bearer-token <token>               Deprecated compatibility input; prefer secure env for release refresh",
    "  --driver-bearer-token <token>        Deprecated compatibility input; prefer secure env for release refresh",
    "  --json                               Print a machine-readable suite summary",
    "",
    "The suite is non-mutating for evidence: it writes reports and handoff packs, but it does not change pending evidence to passed.",
    "When CSV apply options are used, the source manifest is preserved and a draft manifest is used for downstream reports.",
    "For final go/no-go after CSV apply, pass --refresh-release-candidate so release gates are recalculated from the draft manifest.",
  ].join("\n");
}

async function resolveFieldEvidenceManifest({ options, outputRoot, sourceFieldEvidenceManifestPath }) {
  if (!options.fieldEvidenceIntakeCsv && !options.fieldEvidenceSignoffBoundaryCsv) {
    return {
      activeManifestPath: sourceFieldEvidenceManifestPath,
      step: null,
    };
  }
  const csvPath = options.fieldEvidenceIntakeCsv ? resolve(options.fieldEvidenceIntakeCsv) : "";
  const signoffBoundaryCsvPath = options.fieldEvidenceSignoffBoundaryCsv ? resolve(options.fieldEvidenceSignoffBoundaryCsv) : "";
  if (csvPath && !existsSync(csvPath)) {
    throw new Error(`V1 field evidence intake CSV is missing: ${displayInputPath(csvPath)}`);
  }
  if (signoffBoundaryCsvPath && !existsSync(signoffBoundaryCsvPath)) {
    throw new Error(`V1 field evidence signoff/boundary CSV is missing: ${displayInputPath(signoffBoundaryCsvPath)}`);
  }
  const draftOutputPath = resolve(
    options.fieldEvidenceDraftOutput || join(outputRoot, "field-evidence-intake", "filled-manifest.draft.json"),
  );
  const args = [
    scripts.fieldEvidenceApply,
    "--manifest",
    sourceFieldEvidenceManifestPath,
    "--output",
    draftOutputPath,
    "--json",
  ];
  if (csvPath) args.push("--csv", csvPath);
  if (signoffBoundaryCsvPath) args.push("--signoff-boundary-csv", signoffBoundaryCsvPath);
  const step = await runJsonStep({
    key: "fieldEvidenceApply",
    label: "V1 field evidence intake apply",
    args,
  });
  const outputManifestPath = resolvePathFromResult(step.files?.outputManifest) || draftOutputPath;
  if (!existsSync(outputManifestPath)) {
    throw new Error(`V1 field evidence draft manifest was not written: ${displayInputPath(outputManifestPath)}`);
  }
  return {
    activeManifestPath: outputManifestPath,
    step: {
      ...step,
      sourceManifestPath: sourceFieldEvidenceManifestPath,
      csvPath,
      signoffBoundaryCsvPath,
      draftManifestPath: outputManifestPath,
    },
  };
}

function resolveReleaseCandidateEnvFiles({ options, productionEnvSetupJsonPath }) {
  if (options.envFiles.length) {
    return {
      envFiles: options.envFiles.map((item) => resolve(item)),
      source: "cli",
      usedProductionEnvSetup: false,
      productionEnvSetupJson: productionEnvSetupJsonPath ? displayInputPath(productionEnvSetupJsonPath) : "",
      summary: `${options.envFiles.length} 个命令行 env 文件`,
    };
  }
  if (!options.useProductionEnvSetupEnvFile) {
    return {
      envFiles: [],
      source: "none",
      usedProductionEnvSetup: false,
      productionEnvSetupJson: productionEnvSetupJsonPath ? displayInputPath(productionEnvSetupJsonPath) : "",
      summary: "未传入 env 文件",
    };
  }
  if (!productionEnvSetupJsonPath) {
    throw new Error(
      "--use-production-env-setup-env-file requires a production env setup report. Run scripts/run-v1-production-env-setup.mjs first or pass --production-env-setup-json.",
    );
  }
  const setupResolution = resolveProductionEnvSetupEnvFiles({
    productionEnvSetupJsonPath,
    useProductionEnvSetupEnvFile: true,
  });
  return {
    envFiles: setupResolution.envFiles,
    source: "production_env_setup",
    usedProductionEnvSetup: true,
    productionEnvSetupJson: displayInputPath(productionEnvSetupJsonPath),
    summary: setupResolution.summary,
    productionEnvSetupReportFresh: setupResolution.productionEnvSetupReportFresh,
    productionEnvSetupCheckedAt: setupResolution.productionEnvSetupCheckedAt,
  };
}

async function resolveReleaseCandidate({ options, outputRoot, fieldEvidenceManifestPath, releaseCandidateEnvFiles }) {
  if (options.refreshReleaseCandidate) {
    const args = [
      scripts.releaseCandidate,
      "--field-evidence-manifest",
      fieldEvidenceManifestPath,
      "--output-dir",
      join(outputRoot, "release-candidate"),
      "--allow-blocked-exit-zero",
      "--json",
    ];
    if (releaseCandidateEnvFiles?.usedProductionEnvSetup) {
      args.push("--use-production-env-setup-env-file");
      if (releaseCandidateEnvFiles.productionEnvSetupJson) {
        args.push("--production-env-setup-json", releaseCandidateEnvFiles.productionEnvSetupJson);
      }
    } else {
      for (const envFile of releaseCandidateEnvFiles?.envFiles || []) args.push("--env-file", envFile);
    }
    pushOption(args, "--api-base-url", options.apiBaseUrl);
    pushOption(args, "--operator-id", options.operatorId);
    pushOption(args, "--driver-operator-id", options.driverOperatorId);
    const env = { ...process.env };
    if (options.bearerToken) env.ERP_V1_RELEASE_TOKEN = options.bearerToken;
    if (options.driverBearerToken) env.ERP_V1_RELEASE_DRIVER_TOKEN = options.driverBearerToken;
    const result = await runJsonStep({ key: "releaseCandidate", label: "V1 release candidate", args, env });
    return normalizeReleaseCandidateStep(result);
  }

  const jsonPath = resolve(options.releaseCandidateJson || defaultReleaseCandidateJsonPath);
  const markdownPath = resolveOptionalPath(options.releaseCandidateMarkdown || defaultReleaseCandidateMarkdownPath);
  if (!existsSync(jsonPath)) {
    throw new Error(
      `V1 release candidate JSON is missing: ${displayInputPath(jsonPath)}. Run scripts/run-v1-release-candidate-check.mjs first or pass --refresh-release-candidate.`,
    );
  }
  const releaseCandidate = readJson(jsonPath, "V1 release candidate JSON");
  if (releaseCandidate?.scope !== "v1_release_candidate_check") {
    throw new Error(`V1 release candidate JSON has an unexpected shape: ${displayInputPath(jsonPath)}`);
  }
  return {
    key: "releaseCandidate",
    status: sanitizeValue(releaseCandidate.status),
    ready: Boolean(releaseCandidate.ready),
    summary: sanitizeObject(releaseCandidate.summary || {}),
    files: {
      latestJson: jsonPath,
      latestMarkdown: markdownPath,
    },
    raw: releaseCandidate,
  };
}

function normalizeReleaseCandidateStep(result) {
  const jsonPath = resolvePathFromResult(result.files?.latestJson || result.files?.json);
  const markdownPath = resolvePathFromResult(result.files?.latestMarkdown || result.files?.markdown);
  return {
    ...result,
    files: {
      ...result.files,
      latestJson: jsonPath,
      latestMarkdown: markdownPath,
    },
  };
}

function pushOption(args, name, value) {
  if (value == null || value === "") return;
  args.push(name, String(value));
}

async function runJsonStep({ key, label, args, env }) {
  const run = await runNode({ args, env, timeoutMs: 30000, label });
  const output = `${run.stdout || ""}${run.stderr || ""}`;
  assertNoSensitiveOutput(output, label);
  if (run.status !== 0) {
    const parsed = tryParseJson(run.stdout);
    const invalidRows = parsed?.summary?.invalidRowCount;
    throw new Error(parsed?.error?.message || (invalidRows ? `${label} found ${invalidRows} invalid row(s)` : `${label} exited ${run.status}`));
  }
  const parsed = tryParseJson(run.stdout);
  if (!parsed || typeof parsed !== "object") throw new Error(`${label} did not return JSON output.`);
  return {
    key,
    status: sanitizeValue(parsed.status),
    ready: Boolean(parsed.ready),
    summary: sanitizeObject(parsed.summary || {}),
    files: normalizeFiles(parsed.files || {}),
    raw: sanitizeObject(parsed),
  };
}

function runNode({ args, timeoutMs, label, env = process.env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timeout.unref?.();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
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
    child.on("close", (status, signal) => {
      clearTimeout(timeout);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function buildSuiteReport({
  generatedAt,
  outputRoot,
  fieldEvidenceManifestPath,
  sourceFieldEvidenceManifestPath,
  fieldEvidenceApply,
  releaseCandidate,
  onsiteTaskBoard,
  completionSnapshot,
  v1V2ScopeBrief,
  ownerDecisionBrief,
  fieldEvidenceIntake,
  handoffPack,
  productionGoLiveStageChecklist,
  refreshedReleaseCandidate,
  releaseCandidateEnvFiles,
}) {
  const canDeclareV1Complete = Boolean(ownerDecisionBrief.raw?.canDeclareV1Complete);
  const ready = Boolean(canDeclareV1Complete && handoffPack.ready);
  const moduleCompletion = buildModuleCompletionSummary(completionSnapshot.raw?.moduleCompletion);
  const unblockPlan = buildUnblockPlan({ onsiteTaskBoard });
  const steps = [
    fieldEvidenceApply,
    releaseCandidate,
    onsiteTaskBoard,
    completionSnapshot,
    v1V2ScopeBrief,
    ownerDecisionBrief,
    fieldEvidenceIntake,
    handoffPack,
  ].filter(Boolean).map((step) => ({
    key: step.key,
    status: sanitizeValue(step.status),
    ready: Boolean(step.ready),
    summary: sanitizeObject(step.summary || {}),
    files: normalizeFiles(step.files || {}),
  }));

  return {
    scope: "v1_go_live_suite",
    status: ready ? "ready_go_live_suite_written" : "blocked_go_live_suite_written",
    ready,
    canDeclareV1Complete,
    generatedAt: generatedAt || new Date().toISOString(),
    conclusion: ready
      ? "V1 发布候选、现场任务、负责人摘要和交接包均为 READY；可进入负责人最终复核。"
      : "V1 仍不能宣布完成；该套件已生成当前发布候选、现场任务、完成度、V1/V2 差异摘要、负责人摘要、证据采集包和交接包。",
    sources: {
      sourceFieldEvidenceManifest: displayInputPath(sourceFieldEvidenceManifestPath || fieldEvidenceManifestPath),
      activeFieldEvidenceManifest: displayInputPath(fieldEvidenceManifestPath),
      fieldEvidenceDraftApplied: Boolean(fieldEvidenceApply),
      fieldEvidenceItemsCsvApplied: Boolean(fieldEvidenceApply?.csvPath),
      fieldEvidenceSignoffBoundaryCsvApplied: Boolean(fieldEvidenceApply?.signoffBoundaryCsvPath),
      releaseCandidateRefreshedAfterFieldEvidenceApply: fieldEvidenceApply ? refreshedReleaseCandidate : null,
      releaseCandidateEnvFileSource: releaseCandidateEnvFiles?.source || "none",
      releaseCandidateEnvFileSummary: releaseCandidateEnvFiles?.summary || "",
      releaseCandidateEnvFileCount: releaseCandidateEnvFiles?.envFiles?.length || 0,
      releaseCandidateEnvFileFromProductionSetup: Boolean(releaseCandidateEnvFiles?.usedProductionEnvSetup),
      productionEnvSetupJsonForEnvFile: releaseCandidateEnvFiles?.productionEnvSetupJson || "",
      outputRoot: displayInputPath(outputRoot),
      refreshedReleaseCandidate,
    },
    summary: {
      releaseCandidate: sanitizeValue(releaseCandidate.summary?.label || releaseCandidate.raw?.summary?.label || ""),
      ownerDecision: sanitizeValue(ownerDecisionBrief.raw?.decision?.label || ""),
      canDeclareV1Complete,
      p0Prototype: sanitizeValue(completionSnapshot.summary?.p0Prototype || ownerDecisionBrief.raw?.completion?.p0Prototype || ""),
      v1Readiness: sanitizeValue(completionSnapshot.summary?.v1Readiness || ownerDecisionBrief.raw?.completion?.v1Readiness || ""),
      fieldEvidence: sanitizeValue(fieldEvidenceIntake.summary?.evidence || handoffPack.raw?.fieldEvidence?.summary?.label || ""),
      onsiteTasks: Number(completionSnapshot.summary?.onsiteTaskCount ?? handoffPack.raw?.onsiteTaskBoard?.summary?.taskCount ?? 0),
      v2DifferenceCount: Number(v1V2ScopeBrief.summary?.v2DifferenceCount ?? completionSnapshot.summary?.v2DifferenceCount ?? ownerDecisionBrief.raw?.v2DifferenceCount ?? 0),
      v2Categories: Array.isArray(v1V2ScopeBrief.raw?.v2Categories) ? v1V2ScopeBrief.raw.v2Categories : [],
      moduleCount: moduleCompletion.moduleCount,
      lowestV1ReadinessModules: moduleCompletion.lowestV1ReadinessModules.map((item) => `${item.module} ${item.v1Readiness}`),
      unblockPlan: unblockPlan.summary.label,
      unblockPhaseCount: unblockPlan.summary.phaseCount,
      unblockFirstActions: unblockPlan.firstActions.slice(0, 3).map((item) => `${item.group} / ${item.title}`),
      productionEnvSetup: handoffPack.raw?.productionEnvSetup?.included
        ? `${handoffPack.raw.productionEnvSetup.summary?.label || "已纳入"} / ${handoffPack.raw.productionEnvSetup.status || "unknown"}`
        : "未纳入",
      productionEnvIntakeVerification: handoffPack.raw?.productionEnvIntakeVerification?.included
        ? `${handoffPack.raw.productionEnvIntakeVerification.summary?.label || "已纳入"} / ${handoffPack.raw.productionEnvIntakeVerification.status || "unknown"}`
        : "未纳入",
      productionFirstStageEvidenceSuggestions: handoffPack.raw?.productionFirstStageEvidenceSuggestions?.included
        ? `${handoffPack.raw.productionFirstStageEvidenceSuggestions.summary?.label || "已纳入"} / ${handoffPack.raw.productionFirstStageEvidenceSuggestions.status || "unknown"}`
        : "未纳入",
      productionGoLiveStages: productionGoLiveStageChecklist.summary.label,
      productionGoLiveStageBlockingCount: productionGoLiveStageChecklist.summary.blockingCount,
    },
    moduleCompletion,
    productionGoLiveStageChecklist,
    unblockPlan,
    steps,
    filesFromSteps: {
      releaseCandidate: normalizeFiles(releaseCandidate.files),
      onsiteTaskBoard: normalizeFiles(onsiteTaskBoard.files),
      completionSnapshot: normalizeFiles(completionSnapshot.files),
      v1V2ScopeBrief: normalizeFiles(v1V2ScopeBrief.files),
      ownerDecisionBrief: normalizeFiles(ownerDecisionBrief.files),
      fieldEvidenceIntake: normalizeFiles(fieldEvidenceIntake.files),
      handoffPack: normalizeFiles(handoffPack.files),
      fieldEvidenceApply: fieldEvidenceApply ? normalizeFiles(fieldEvidenceApply.files) : {},
    },
    canonicalLatest: {
      synced: false,
      root: "",
      artifacts: {},
    },
    safeguards: {
      nonMutating: true,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawSecretsIncluded: false,
      sourceManifestMutated: false,
      releaseCandidateReadyRequired: true,
      ownerDecisionReadyRequired: true,
      handoffReadyRequired: true,
      releaseCandidateRefreshRecommendedAfterDraftApply: Boolean(fieldEvidenceApply && !refreshedReleaseCandidate),
      releaseCandidateEnvFileValuesIncluded: false,
      releaseCandidateEnvFileFromProductionSetup: Boolean(releaseCandidateEnvFiles?.usedProductionEnvSetup),
      productionEnvSetupIncluded: Boolean(handoffPack.raw?.productionEnvSetup?.included),
      productionEnvIntakeVerificationIncluded: Boolean(handoffPack.raw?.productionEnvIntakeVerification?.included),
      productionEnvIntakeVerificationReportExpectedRedacted: Boolean(
        handoffPack.raw?.productionEnvIntakeVerification?.included,
      ),
      productionFirstStageEvidenceSuggestionsIncluded: Boolean(
        handoffPack.raw?.productionFirstStageEvidenceSuggestions?.included,
      ),
      productionFirstStageEvidenceSuggestionsRequireHumanReview: Boolean(
        handoffPack.raw?.productionFirstStageEvidenceSuggestions?.included,
      ),
      productionGoLiveStageChecklistIncluded: true,
      canonicalLatestSynced: false,
    },
  };
}

function buildModuleCompletionSummary(modules) {
  const normalized = Array.isArray(modules)
    ? modules
        .map((item) => ({
          module: sanitizeValue(item.module),
          requirementCompletion: sanitizeValue(item.requirementCompletion),
          p0CodeCompletion: sanitizeValue(item.p0CodeCompletion),
          v1Readiness: sanitizeValue(item.v1Readiness),
          currentStatus: sanitizeValue(item.currentStatus),
          remaining: sanitizeValue(item.remaining),
        }))
        .filter((item) => item.module)
    : [];
  const scored = normalized
    .map((item) => ({
      ...item,
      v1ReadinessScore: completionScore(item.v1Readiness),
    }))
    .sort((left, right) => left.v1ReadinessScore - right.v1ReadinessScore || left.module.localeCompare(right.module, "zh-Hans-CN"));
  return {
    moduleCount: normalized.length,
    modules: normalized,
    lowestV1ReadinessModules: scored.slice(0, 5).map(({ v1ReadinessScore, ...item }) => item),
  };
}

function readOptionalProductionEnvIntakeVerification(inputPath) {
  if (!inputPath || !existsSync(inputPath)) return null;
  const report = readJson(inputPath, "V1 production env intake verification JSON");
  return {
    included: true,
    ...report,
  };
}

function buildProductionGoLiveStageChecklist({ releaseCandidate, generatedAt, productionEnvIntakeVerification = null }) {
  const candidate = releaseCandidate.raw || {};
  const livePrecheck = candidate.productionGoLivePrecheck || candidate.productionGoLiveLivePrecheck || {};
  if (Array.isArray(livePrecheck.unblockChecklist) && livePrecheck.unblockChecklist.length) {
    return normalizeProductionGoLiveStageChecklistFromLive({ livePrecheck, generatedAt });
  }
  const envFixItems = normalizeProductionEnvFixItems(candidate.envPreflight?.fixChecklist);
  const intakeVerification = normalizeProductionEnvIntakeVerification(productionEnvIntakeVerification);
  const stages = [
    buildProductionGoLiveStage({
      key: "production-env-file-audit",
      label: "生产 env 文件安全审计",
      stageOrder: 1,
      ready: candidate.envFileAudit?.status === "passed",
      sourceStatus: candidate.envFileAudit?.status || "not_run",
      sourceSummary: candidate.envFileAudit?.summary?.label || candidate.summary?.envFileAudit || "未执行 env 文件安全审计",
      ownerRole: "技术/管理",
      nextActionWhenBlocked: "先准备安全、未跟踪、非模板的生产 env 文件，并运行 env 文件安全审计。",
      nextActionWhenReady: "保留 env 文件安全审计结果，继续执行生产 env 变量预检。",
      verificationSteps: [
        "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file> --json",
        "确认真实 env 文件未被 git 跟踪、不是 *.env.example、没有 <REPLACE_WITH_...> 占位值。",
      ],
      evidenceToKeep: [
        "env 文件安全审计 JSON / Markdown 结果",
        "安全 env 文件位置由负责人线下留存，交接包不记录真实路径或内容",
      ],
      blockers: normalizeProductionGoLiveBlockers(candidate.envFileAudit?.blockingFindings || []),
    }),
    buildProductionGoLiveStage({
      key: "production-env-intake-verify",
      label: "生产 env 真实值 intake 校验",
      stageOrder: 2,
      ready: intakeVerification.ready,
      sourceStatus: intakeVerification.sourceStatus,
      sourceSummary: intakeVerification.sourceSummary,
      ownerRole: "技术/管理",
      nextActionWhenBlocked: intakeVerification.nextActionWhenBlocked,
      nextActionWhenReady: "保留生产 env 真实值 intake 校验报告，继续执行生产 env 变量预检。",
      verificationSteps: [
        "node scripts/run-v1-production-env-intake-verify.mjs --use-production-env-setup-env-file --intake-csv <production-env-intake-csv> --json",
        "备用：只有绕开 production env setup 报告时，才显式传入 --env-file <secure-env-file>。",
        "确认 blockingFindings 为 0；ready_with_warnings 需要负责人复核清单回填列。",
      ],
      evidenceToKeep: [
        "生产 env 真实值 intake 校验 JSON / Markdown 结果",
        "真实 env 值、连接串、bucket、secret、命令值和 spool 路径只留在安全 env 文件",
      ],
      blockers: intakeVerification.blockers,
      minimumBlockingItems: intakeVerification.minimumBlockingItems,
    }),
    buildProductionGoLiveStage({
      key: "production-env-preflight",
      label: "生产 env 变量预检",
      stageOrder: 3,
      ready: candidate.envPreflight?.ready === true || candidate.envPreflight?.status === "ready",
      sourceStatus: candidate.envPreflight?.status || "unknown",
      sourceSummary: candidate.envPreflight?.summary?.label || candidate.summary?.envPreflight || "未返回生产 env 预检摘要",
      ownerRole: "技术/管理",
      nextActionWhenBlocked: envFixItems.find((item) => item.severity !== "ok")
        ? `先处理 ${envFixItems.find((item) => item.severity !== "ok").label}：${envFixItems.find((item) => item.severity !== "ok").nextAction}`
        : "按生产 env 修正清单补齐 PostgreSQL、对象存储、打印、CUPS 和验收账号变量。",
      nextActionWhenReady: "保留生产 env 变量预检结果，用该 env 启动或重启当前 API。",
      verificationSteps: [
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file --json",
        "备用：只有绕开 production env setup 报告时，才显式传入 --env-file <secure-env-file>。",
        "确认 fixChecklist 中 blocking 项为 0，真实值没有进入报告或交接包。",
        ...envFixItems.flatMap((item) => item.verificationSteps).slice(0, 2),
      ],
      evidenceToKeep: [
        "生产 env 变量预检 JSON / Markdown 结果",
        "生产 env 修正清单由技术/管理签收，真实值只留在安全 env 文件",
      ],
      blockers: normalizeProductionGoLiveBlockers(candidate.envPreflight?.blockingCriteria || []),
      fixItems: envFixItems.filter((item) => item.severity !== "ok").slice(0, 3),
    }),
    buildProductionGoLiveStage({
      key: "runtime-v1-readiness",
      label: "当前 API V1 总门禁",
      stageOrder: 4,
      ready: findReleaseGate(candidate, "runtime_readiness")?.ready === true,
      sourceStatus: findReleaseGate(candidate, "runtime_readiness")?.status || "unknown",
      sourceSummary: findReleaseGate(candidate, "runtime_readiness")?.summary || candidate.summary?.runtimeReadiness || "未返回 runtime readiness 摘要",
      ownerRole: "技术/管理 + 现场负责人",
      nextActionWhenBlocked: findReleaseGate(candidate, "runtime_readiness")?.detail || "用生产 env 启动当前 API 后，补齐持久化、附件、打印、CUPS、司机真机和现场验收门禁。",
      nextActionWhenReady: "保留当前 API V1 readiness 结果，继续确认当前 API 是否真正运行在生产 profile。",
      verificationSteps: [
        "node scripts/run-v1-readiness-check.mjs --api-base-url <erp-api> --operator-id <office-user> --driver-operator-id <driver-user> --json",
        "确认 11 项 readiness 通过，并保留打印、司机真机、现场验收等真实证据。",
      ],
      evidenceToKeep: [
        "V1 readiness JSON / Markdown 结果",
        "打印设备 QA、CUPS 队列预检、司机真机、现场验收记录",
      ],
      blockers: normalizeProductionGoLiveBlockers(
        (candidate.blockingItems || []).filter((item) => item.gate === "运行时 V1 readiness"),
      ),
    }),
    buildProductionGoLiveStage({
      key: "runtime-production-profile",
      label: "当前 API 生产 profile 确认",
      stageOrder: 5,
      ready: false,
      sourceStatus: "live_precheck_required",
      sourceSummary: "release-candidate 不足以证明当前 API 运行在生产 profile，必须现场执行组合预检。",
      ownerRole: "技术/管理",
      nextActionWhenBlocked: "用真实生产 env 启动当前 API 后，运行生产上线组合预检，确认没有本地接受旁路、本地仓储或非 live 对象存储。",
      nextActionWhenReady: "当前 API 已满足生产 profile 约束，可继续 release candidate 和现场证据收尾。",
      verificationSteps: [
        "node scripts/run-v1-production-go-live-precheck.mjs --use-production-env-setup-env-file --api-base-url <erp-api> --json",
        "备用：只有绕开 production env setup 报告时，才显式传入 --env-file <secure-env-file>。",
        "确认本地持久化接受、本地附件接受、本地仓储和非 live 对象存储均为 0 或 false。",
      ],
      evidenceToKeep: [
        "生产上线组合预检 JSON / Markdown 结果",
        "PostgreSQL 迁移 / 对象存储 live 诊断 / 当前 API 生产 profile 运行记录",
      ],
      blockers: [
        {
          key: "live-production-profile-precheck-required",
          label: "必须执行生产上线组合预检",
          status: "pending",
          detail: "离线 release-candidate 快照不能证明当前 API 已禁用本地接受旁路并运行在 PostgreSQL / object_storage live profile。",
        },
      ],
    }),
  ];
  return finalizeProductionGoLiveStageChecklist({ generatedAt, stages, source: "release_candidate_snapshot" });
}

function normalizeProductionGoLiveStageChecklistFromLive({ livePrecheck, generatedAt }) {
  const stages = livePrecheck.unblockChecklist.map((item, index) =>
    buildProductionGoLiveStage({
      key: item.key || `stage-${index + 1}`,
      label: item.label || `阶段 ${index + 1}`,
      stageOrder: numberOrZero(item.stageOrder) || index + 1,
      ready: item.ready === true,
      sourceStatus: item.status || "unknown",
      sourceSummary: item.ready === true ? "live precheck passed" : "live precheck blocked",
      ownerRole: item.ownerRole || "技术/管理",
      nextActionWhenBlocked: item.nextAction,
      nextActionWhenReady: item.nextAction,
      verificationSteps: stringList(item.verificationSteps),
      evidenceToKeep: stringList(item.evidenceToKeep),
      blockers: normalizeProductionGoLiveBlockers(item.blockers || []),
      minimumBlockingItems: normalizeProductionEnvMinimumBlockingItems(item),
      fixItems: normalizeProductionEnvFixItems(item.fixItems || []),
    }),
  );
  return finalizeProductionGoLiveStageChecklist({ generatedAt, stages, source: "live_precheck" });
}

function buildProductionGoLiveStage({
  key,
  label,
  stageOrder,
  ready,
  sourceStatus,
  sourceSummary,
  ownerRole,
  nextActionWhenBlocked,
  nextActionWhenReady,
  verificationSteps,
  evidenceToKeep,
  blockers = [],
  minimumBlockingItems = [],
  fixItems = [],
}) {
  const normalizedReady = ready === true;
  const normalizedMinimumBlockingItems = minimumBlockingItems.slice(0, 12);
  return {
    key: sanitizeValue(key),
    label: sanitizeValue(label),
    stageOrder,
    status: normalizedReady ? "passed" : "pending",
    ready: normalizedReady,
    sourceStatus: sanitizeValue(sourceStatus),
    sourceSummary: sanitizeValue(sourceSummary),
    ownerRole: sanitizeValue(ownerRole),
    blockingCount: normalizedReady ? 0 : Math.max(blockers.length, normalizedMinimumBlockingItems.length, fixItems.length, 1),
    nextAction: sanitizeValue(normalizedReady ? nextActionWhenReady : nextActionWhenBlocked),
    verificationSteps: stringList(verificationSteps).map(sanitizeValue).slice(0, 5),
    evidenceToKeep: stringList(evidenceToKeep).map(sanitizeValue).slice(0, 5),
    blockers: blockers.slice(0, 3),
    minimumBlockingItems: normalizedMinimumBlockingItems,
    fixItems: fixItems.slice(0, 3),
  };
}

function finalizeProductionGoLiveStageChecklist({ generatedAt, stages, source }) {
  const passedCount = stages.filter((stage) => stage.ready).length;
  const totalCount = stages.length;
  const blockingCount = totalCount - passedCount;
  const ready = blockingCount === 0;
  return {
    status: ready ? "ready" : "blocked",
    ready,
    generatedAt,
    source,
    summary: {
      label: `${passedCount}/${totalCount} 通过`,
      passedCount,
      totalCount,
      blockingCount,
      firstBlockedStage: stages.find((stage) => !stage.ready)?.label || "",
    },
    stages,
    safeguards: {
      nonMutating: true,
      releaseCandidateSnapshotOnly: source === "release_candidate_snapshot",
      livePrecheckRequired: source !== "live_precheck",
      envValuesExposed: false,
      rawEnvFileContentExposed: false,
      localPathExposed: false,
      physicalPrinterCalled: false,
    },
  };
}

function normalizeProductionEnvIntakeVerification(report) {
  const included = Boolean(report?.included || report?.scope);
  const status = sanitizeValue(report?.status || (included ? "unknown" : "not_run"));
  const ready = report?.ready === true || status === "ready" || status === "ready_with_warnings";
  const minimumBlockingItems = normalizeProductionEnvMinimumBlockingItems(report);
  const normalizedBlockers = normalizeProductionGoLiveBlockers(report?.blockingFindings || []);
  const blockers = minimumBlockingItems.length ? minimumBlockingItems : normalizedBlockers;
  const firstBlocker = minimumBlockingItems[0] || blockers[0];
  return {
    ready,
    sourceStatus: status,
    sourceSummary: report?.summary?.label || (included ? "未返回生产 env 真实值 intake 校验摘要" : "未纳入生产 env 真实值 intake 校验"),
    nextActionWhenBlocked: included
      ? firstBlocker?.nextAction || firstBlocker?.detail || firstBlocker?.label || report?.nextActions?.[0] || "先补齐真实值 intake 清单中的阻塞项，再重跑 intake 校验。"
      : "先运行生产 env 真实值 intake 校验，把 PostgreSQL、对象存储、打印 command_bridge 和 CUPS 真实值清单纳入上线门禁。",
    minimumBlockingItems,
    blockers:
      blockers.length > 0
        ? blockers
        : ready
          ? []
          : [
              {
                key: "production-env-intake-verify-not-ready",
                label: "生产 env 真实值 intake 校验未通过",
                status: status || "pending",
                detail: "未看到 ready / ready_with_warnings 的生产 env 真实值 intake 校验报告。",
              },
            ],
  };
}

function normalizeProductionEnvMinimumBlockingItems(report) {
  if (!report || typeof report !== "object") return [];
  const targetCount = Number(report?.summary?.minimumBlockingTargetCount) || 0;
  const sourceItems = Array.isArray(report.minimumBlockingItems)
    ? report.minimumBlockingItems
    : Array.isArray(report.blockingFindings)
      ? report.blockingFindings.filter((item) =>
          item?.severity === "blocking" &&
          (item?.type === "alternative_group" || item?.type === "variable_row")
        )
      : [];
  return sourceItems
    .slice(0, targetCount || 12)
    .map((item) => {
      const variables = Array.isArray(item.variables)
        ? item.variables.map((variable) => sanitizeValue(variable)).filter(Boolean)
        : [];
      const variableLabel = sanitizeValue(item.variableKey || item.alternativeGroup || variables.join(" / ") || item.label);
      return {
        key: sanitizeValue(item.key || item.itemKey || item.variableKey || item.alternativeGroup || item.label || "minimum-blocking-item"),
        label: sanitizeValue(item.label || item.variableKey || item.alternativeGroup || "最小阻塞补值"),
        status: sanitizeValue(item.status || item.severity || "blocked"),
        detail: sanitizeValue(item.detail || item.message || item.nextAction),
        nextAction: sanitizeValue(item.nextAction || item.detail || "补齐该真实值后重跑生产 env intake 校验。"),
        ownerRole: sanitizeValue(item.ownerRole || "技术/管理"),
        variableLabel,
        sourceSystem: sanitizeValue(item.sourceSystem || "生产配置"),
        expectedValueType: sanitizeValue(item.expectedValueType || "真实生产值"),
      };
    })
    .filter((item) => item.label || item.variableLabel);
}

function normalizeProductionEnvFixItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    key: sanitizeValue(item.key || "unknown"),
    label: sanitizeValue(item.label || item.key || "生产环境预检项"),
    severity: sanitizeValue(item.severity || (item.ready ? "ok" : item.blocking === false ? "warning" : "blocking")),
    nextAction: sanitizeValue(item.nextAction),
    valueGuidance: stringList(item.valueGuidance).map(sanitizeValue).slice(0, 3),
    verificationSteps: stringList(item.verificationSteps).map(sanitizeValue).slice(0, 3),
  }));
}

function normalizeProductionGoLiveBlockers(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    key: sanitizeValue(item.key || item.label || item.gate || "blocking-item"),
    label: sanitizeValue(item.label || item.gate || "阻塞项"),
    status: sanitizeValue(item.status || item.severity || "pending"),
    detail: sanitizeValue(item.detail || item.message || item.nextAction),
  }));
}

function findReleaseGate(candidate, key) {
  return Array.isArray(candidate.gates) ? candidate.gates.find((gate) => gate.key === key) || null : null;
}

function buildUnblockPlan({ onsiteTaskBoard }) {
  const taskBoardPath = resolvePathFromResult(onsiteTaskBoard.files?.latestJson);
  const taskBoard = taskBoardPath ? readJson(taskBoardPath, "V1 onsite task board JSON") : {};
  const tasks = Array.isArray(taskBoard.tasks)
    ? taskBoard.tasks
        .map((task) => normalizeUnblockTask(task))
        .filter((task) => task.id && task.title)
    : [];
  const roleBuckets = Array.isArray(taskBoard.roleBuckets)
    ? taskBoard.roleBuckets
        .map((bucket) => ({
          role: sanitizeValue(bucket.role),
          taskCount: Number(bucket.taskCount || 0),
          p0TaskCount: Number(bucket.p0TaskCount || 0),
        }))
        .filter((bucket) => bucket.role && bucket.taskCount > 0)
        .sort((left, right) => right.p0TaskCount - left.p0TaskCount || right.taskCount - left.taskCount || left.role.localeCompare(right.role, "zh-Hans-CN"))
    : [];
  const phases = buildUnblockPhases(tasks);
  const firstActions = selectFirstUnblockActions(tasks);
  const ready = tasks.length === 0;
  return {
    status: ready ? "ready" : "blocked",
    ready,
    summary: {
      label: ready ? "V1 解除阻塞清单已清空" : `V1 解除阻塞仍有 ${tasks.length} 项待处理`,
      taskCount: tasks.length,
      releaseTaskCount: tasks.filter((task) => task.type === "发布门禁").length,
      evidenceTaskCount: tasks.filter((task) => task.type === "现场证据").length,
      signoffTaskCount: tasks.filter((task) => task.type === "负责人签字").length,
      boundaryTaskCount: tasks.filter((task) => task.type === "V1/V2 边界").length,
      phaseCount: phases.filter((phase) => phase.taskCount > 0).length,
      roleCount: roleBuckets.length,
    },
    roleBuckets,
    phases,
    firstActions,
    safeguards: {
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawSecretsIncluded: false,
      nonMutating: true,
    },
  };
}

function normalizeUnblockTask(task) {
  const roles = Array.isArray(task.roles)
    ? task.roles.map((role) => sanitizeValue(role)).filter(Boolean)
    : [];
  return {
    id: sanitizeValue(task.id),
    type: sanitizeValue(task.type),
    source: sanitizeValue(task.source),
    roles,
    primaryRole: sanitizeValue(task.primaryRole || roles[0] || "技术/管理"),
    group: sanitizeValue(task.group),
    title: sanitizeValue(task.title),
    status: sanitizeValue(task.status),
    priority: sanitizeValue(task.priority || "P0"),
    action: sanitizeValue(task.action),
  };
}

function buildUnblockPhases(tasks) {
  const phaseDefs = [
    {
      key: "production_environment",
      label: "1. 先补生产环境和持久化",
      match: /生产环境变量|统一 V1 持久化|PostgreSQL|数据库|迁移|备份|对象存储|附件 V1 留档|系统 V1 持久化/i,
      nextStep: "先由技术 / 管理补真实 PostgreSQL、对象存储和生产 env，再重新跑生产环境预检与系统持久化门禁。",
    },
    {
      key: "print_hardware",
      label: "2. 再补真实打印链路",
      match: /打印|CUPS|spool|command_bridge|标签|针式|纸张|条码|作废重打|printer/i,
      nextStep: "在真实打印机器上完成 CUPS 队列预检、样张出纸、纸张对位、条码扫码和作废重打证据。",
    },
    {
      key: "driver_device",
      label: "3. 再补司机真机验收",
      match: /司机|真机|扫码|导航|定位|相机|水印|离线上传|driver|native|camera/i,
      nextStep: "用司机真实手机完成原生扫码、定位、导航、水印照片和上传兜底验收，并回填证据编号。",
    },
    {
      key: "business_pilot",
      label: "4. 再补真实业务试跑",
      match: /业务流程|真实订单|库存|出库|交付|生产|打包|对账|收款|异常待办|试跑/i,
      nextStep: "用真实订单跑完订单录入、库存占用、出库交付、生产打包、对账收款和异常待办闭环。",
    },
    {
      key: "security_and_signoff",
      label: "5. 最后补安全运维、签字和 V1/V2 边界",
      match: /安全|账号|权限|审计|回滚|签字|V1\/V2|边界|负责人/i,
      nextStep: "确认生产账号、审计留存、备份监控、回滚负责人后，完成 6 个负责人签字和 V1/V2 边界确认。",
    },
  ];
  const assigned = new Set();
  const phases = phaseDefs.map((phase) => {
    const phaseTasks = tasks.filter((task) => {
      if (assigned.has(task.id)) return false;
      const text = `${task.type} ${task.group} ${task.title} ${task.action}`;
      return phase.match.test(text);
    });
    for (const task of phaseTasks) assigned.add(task.id);
    return buildUnblockPhase(phase, phaseTasks);
  });
  const otherTasks = tasks.filter((task) => !assigned.has(task.id));
  if (otherTasks.length) {
    phases.push(
      buildUnblockPhase(
        {
          key: "other",
          label: "6. 其它剩余阻塞项",
          nextStep: "按角色任务清单继续补齐剩余 P0 任务，完成后重新生成 V1 go-live suite。",
        },
        otherTasks,
      ),
    );
  }
  return phases;
}

function buildUnblockPhase(phase, tasks) {
  const roles = [...new Set(tasks.flatMap((task) => task.roles || []).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "zh-Hans-CN"),
  );
  const groups = summarizeTaskGroups(tasks).slice(0, 5);
  return {
    key: phase.key,
    label: phase.label,
    taskCount: tasks.length,
    releaseTaskCount: tasks.filter((task) => task.type === "发布门禁").length,
    evidenceTaskCount: tasks.filter((task) => task.type === "现场证据").length,
    signoffTaskCount: tasks.filter((task) => task.type === "负责人签字").length,
    boundaryTaskCount: tasks.filter((task) => task.type === "V1/V2 边界").length,
    roles,
    nextStep: sanitizeValue(phase.nextStep),
    groups,
    firstTasks: selectFirstUnblockActions(tasks, 4),
  };
}

function summarizeTaskGroups(tasks) {
  const counts = new Map();
  for (const task of tasks) {
    const key = task.group || task.type || "未分组";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((left, right) => right.count - left.count || left.group.localeCompare(right.group, "zh-Hans-CN"));
}

function selectFirstUnblockActions(tasks, limit = 10) {
  const typeOrder = new Map([
    ["发布门禁", 0],
    ["现场证据", 1],
    ["负责人签字", 2],
    ["V1/V2 边界", 3],
  ]);
  const groupOrder = [
    /生产环境变量|生产持久化|PostgreSQL|对象存储|系统 V1 持久化|附件 V1 留档/i,
    /打印|CUPS|spool|标签|针式|纸张|条码/i,
    /司机|真机|扫码|导航|定位|相机/i,
    /业务流程|真实订单|库存|出库|生产|对账|异常待办/i,
    /安全|账号|权限|审计|回滚|签字|边界/i,
  ];
  return [...tasks]
    .sort((left, right) => {
      const leftType = typeOrder.get(left.type) ?? 9;
      const rightType = typeOrder.get(right.type) ?? 9;
      if (leftType !== rightType) return leftType - rightType;
      const leftGroup = groupPriority(`${left.group} ${left.title}`, groupOrder);
      const rightGroup = groupPriority(`${right.group} ${right.title}`, groupOrder);
      if (leftGroup !== rightGroup) return leftGroup - rightGroup;
      return left.id.localeCompare(right.id, "zh-Hans-CN");
    })
    .slice(0, limit)
    .map((task) => ({
      id: task.id,
      type: task.type,
      primaryRole: task.primaryRole,
      roles: task.roles,
      group: task.group,
      title: task.title,
      status: task.status,
      action: task.action,
    }));
}

function groupPriority(text, groupOrder) {
  const value = stringValue(text);
  const index = groupOrder.findIndex((pattern) => pattern.test(value));
  return index === -1 ? 99 : index;
}

function completionScore(value) {
  const match = stringValue(value).match(/\d+(?:\.\d+)?/);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[0]);
}

function syncCanonicalLatestArtifacts({ outputRoot, canonicalRoot, releaseCandidate }) {
  const artifacts = {};
  const releaseCandidateDir = directoryFromLatestJson(releaseCandidate.files?.latestJson);
  if (releaseCandidateDir) {
    const copied = copyCanonicalArtifact({
      sourceDir: releaseCandidateDir,
      destDir: join(canonicalRoot, "v1-release-candidate"),
    });
    if (copied) artifacts.releaseCandidate = copied;
  }
  for (const [key, sourceName, destName] of [
    ["onsiteTaskBoard", "onsite-task-board", "v1-onsite-task-board"],
    ["completionSnapshot", "completion-snapshot", "v1-completion-snapshot"],
    ["v1V2ScopeBrief", "v1-v2-scope-brief", "v1-v2-scope-brief"],
    ["ownerDecisionBrief", "owner-decision-brief", "v1-owner-decision-brief"],
    ["handoffPack", "go-live-handoff", "v1-go-live-handoff"],
  ]) {
    const copied = copyCanonicalArtifact({
      sourceDir: join(outputRoot, sourceName),
      destDir: join(canonicalRoot, destName),
    });
    if (copied) artifacts[key] = copied;
  }
  const fieldEvidenceIntake = copyCanonicalArtifact({
    sourceDir: join(outputRoot, "field-evidence-intake"),
    destDir: join(canonicalRoot, "v1-field-evidence-intake"),
    preserveExistingFiles: ["evidence-items.csv", "signoff-boundary.csv", "filled-manifest.draft.json"],
  });
  if (fieldEvidenceIntake) artifacts.fieldEvidenceIntake = fieldEvidenceIntake;
  return {
    synced: true,
    root: displayPath(canonicalRoot),
    artifacts,
  };
}

function directoryFromLatestJson(path) {
  const resolvedPath = resolvePathFromResult(path);
  if (!resolvedPath || basename(resolvedPath) !== "latest.json") return "";
  return dirname(resolvedPath);
}

function copyCanonicalArtifact({ sourceDir, destDir, preserveExistingFiles = [] }) {
  const resolvedSource = resolve(sourceDir);
  const resolvedDest = resolve(destDir);
  if (!existsSync(resolvedSource)) return null;
  if (resolvedSource === resolvedDest) {
    return {
      path: displayPath(resolvedDest),
      alreadyCanonical: true,
    };
  }
  const preservedFiles = preserveExistingFiles
    .map((file) => {
      const path = join(resolvedDest, file);
      return existsSync(path)
        ? {
            file,
            content: readFileSync(path),
          }
        : null;
    })
    .filter(Boolean);
  rmSync(resolvedDest, { recursive: true, force: true });
  mkdirSync(dirname(resolvedDest), { recursive: true });
  cpSync(resolvedSource, resolvedDest, { recursive: true, force: true });
  for (const preserved of preservedFiles) {
    writeFileSync(join(resolvedDest, preserved.file), preserved.content);
  }
  return {
    path: displayPath(resolvedDest),
    alreadyCanonical: false,
    preservedFiles: preservedFiles.map((item) => item.file),
  };
}

function writeSuiteFiles({ outputRoot, suite }) {
  mkdirSync(outputRoot, { recursive: true });
  const summaryPath = join(outputRoot, "suite-summary.zh-CN.md");
  const manifestPath = join(outputRoot, "suite-manifest.json");
  const latestMarkdownPath = join(outputRoot, "latest.zh-CN.md");
  const latestJsonPath = join(outputRoot, "latest.json");
  const productionGoLiveStageChecklistPaths = productionGoLiveStageChecklistFilePaths(outputRoot);
  const unblockPlanPaths = unblockPlanFilePaths(outputRoot);
  suite.files = {
    productionGoLiveStageChecklistMarkdown: displayPath(productionGoLiveStageChecklistPaths.markdownPath),
    productionGoLiveStageChecklistJson: displayPath(productionGoLiveStageChecklistPaths.jsonPath),
    unblockPlanMarkdown: displayPath(unblockPlanPaths.markdownPath),
    unblockPlanJson: displayPath(unblockPlanPaths.jsonPath),
  };
  writeFileSync(summaryPath, formatSuiteMarkdown(suite));
  writeFileSync(manifestPath, `${JSON.stringify(suite, null, 2)}\n`);
  writeFileSync(latestMarkdownPath, formatSuiteMarkdown(suite));
  writeFileSync(latestJsonPath, `${JSON.stringify(suite, null, 2)}\n`);
  const productionGoLiveStageChecklistFiles = writeProductionGoLiveStageChecklistFiles({ outputRoot, suite });
  const unblockPlanFiles = writeUnblockPlanFiles({ outputRoot, suite });
  return {
    summaryMarkdown: displayPath(summaryPath),
    suiteManifest: displayPath(manifestPath),
    latestMarkdown: displayPath(latestMarkdownPath),
    latestJson: displayPath(latestJsonPath),
    productionGoLiveStageChecklistMarkdown: productionGoLiveStageChecklistFiles.productionGoLiveStageChecklistMarkdown,
    productionGoLiveStageChecklistJson: productionGoLiveStageChecklistFiles.productionGoLiveStageChecklistJson,
    unblockPlanMarkdown: unblockPlanFiles.unblockPlanMarkdown,
    unblockPlanJson: unblockPlanFiles.unblockPlanJson,
  };
}

function writeProductionGoLiveStageChecklistFiles({ outputRoot, suite }) {
  mkdirSync(outputRoot, { recursive: true });
  const { markdownPath, jsonPath } = productionGoLiveStageChecklistFilePaths(outputRoot);
  writeFileSync(markdownPath, formatProductionGoLiveStageChecklistMarkdown(suite));
  writeFileSync(jsonPath, `${JSON.stringify(suite.productionGoLiveStageChecklist, null, 2)}\n`);
  return {
    productionGoLiveStageChecklistMarkdown: displayPath(markdownPath),
    productionGoLiveStageChecklistJson: displayPath(jsonPath),
    productionGoLiveStageChecklistMarkdownPath: markdownPath,
    productionGoLiveStageChecklistJsonPath: jsonPath,
  };
}

function productionGoLiveStageChecklistFilePaths(outputRoot) {
  return {
    markdownPath: join(outputRoot, "production-go-live-stage-checklist.zh-CN.md"),
    jsonPath: join(outputRoot, "production-go-live-stage-checklist.json"),
  };
}

function writeUnblockPlanFiles({ outputRoot, suite }) {
  mkdirSync(outputRoot, { recursive: true });
  const { markdownPath, jsonPath } = unblockPlanFilePaths(outputRoot);
  writeFileSync(markdownPath, formatUnblockPlanMarkdown(suite));
  writeFileSync(jsonPath, `${JSON.stringify(suite.unblockPlan, null, 2)}\n`);
  return {
    unblockPlanMarkdown: displayPath(markdownPath),
    unblockPlanJson: displayPath(jsonPath),
    unblockPlanMarkdownPath: markdownPath,
    unblockPlanJsonPath: jsonPath,
  };
}

function unblockPlanFilePaths(outputRoot) {
  return {
    markdownPath: join(outputRoot, "v1-unblock-plan.zh-CN.md"),
    jsonPath: join(outputRoot, "v1-unblock-plan.json"),
  };
}

function buildCommandResult({ suite, files }) {
  return {
    scope: suite.scope,
    status: suite.status,
    ready: suite.ready,
    canDeclareV1Complete: suite.canDeclareV1Complete,
    generatedAt: suite.generatedAt,
    conclusion: suite.conclusion,
    summary: suite.summary,
    moduleCompletion: suite.moduleCompletion,
    productionGoLiveStageChecklist: suite.productionGoLiveStageChecklist,
    unblockPlan: suite.unblockPlan,
    steps: suite.steps,
    canonicalLatest: suite.canonicalLatest || { synced: false, root: "", artifacts: {} },
    safeguards: suite.safeguards,
    files,
  };
}

function formatCommandResult(result) {
  return [
    `V1 go-live suite: ${result.ready ? "READY" : "BLOCKED"} (${result.summary.releaseCandidate || "no release summary"})`,
    result.conclusion,
    `Can declare V1 complete: ${result.canDeclareV1Complete ? "yes" : "no"}`,
    `Summary: ${result.files.summaryMarkdown}`,
    `Manifest: ${result.files.suiteManifest}`,
    "",
  ].join("\n");
}

function formatSuiteMarkdown(suite) {
  const lines = [
    "# ERP V1 Go-Live Suite",
    "",
    `- 生成时间：${suite.generatedAt}`,
    `- 当前结论：${suite.ready ? "READY" : "BLOCKED"}`,
    `- 是否可以宣布 V1 完成：${suite.canDeclareV1Complete ? "可以" : "不可以"}`,
    `- 发布候选：${suite.summary.releaseCandidate || "未读取"}`,
    `- 负责人判断：${suite.summary.ownerDecision || "未读取"}`,
    `- P0 原型 / 代码：${suite.summary.p0Prototype || "未读取"}`,
    `- V1 上线就绪：${suite.summary.v1Readiness || "未读取"}`,
    `- 现场证据：${suite.summary.fieldEvidence || "未读取"}`,
    `- 现场任务：${suite.summary.onsiteTasks} 个`,
    `- 模块数：${suite.summary.moduleCount || 0} 个`,
    `- V2 差异：${suite.summary.v2DifferenceCount} 项`,
    `- V2 主题：${Array.isArray(suite.summary.v2Categories) && suite.summary.v2Categories.length ? suite.summary.v2Categories.join("、") : "未读取"}`,
    `- V1 上线就绪最低模块：${Array.isArray(suite.summary.lowestV1ReadinessModules) && suite.summary.lowestV1ReadinessModules.length ? suite.summary.lowestV1ReadinessModules.join("、") : "未读取"}`,
    `- 生产 env 准备：${suite.summary.productionEnvSetup || "未纳入"}`,
    `- 生产 env 真实值校验：${suite.summary.productionEnvIntakeVerification || "未纳入"}`,
    `- 第一阶段证据建议：${suite.summary.productionFirstStageEvidenceSuggestions || "未纳入"}`,
    `- 生产上线组合预检阶段：${suite.summary.productionGoLiveStages || "未读取"}`,
    `- Release candidate env 来源：${suite.sources.releaseCandidateEnvFileSummary || "未传入 env 文件"}；文件数 ${suite.sources.releaseCandidateEnvFileCount || 0}`,
    `- 最小解除阻塞：${suite.summary.unblockPlan || "未读取"}`,
    `- 说明：${suite.conclusion}`,
    suite.sources.fieldEvidenceDraftApplied
      ? `- 现场 CSV 回填：已生成 draft manifest（${suite.sources.activeFieldEvidenceManifest}），证据项 CSV：${suite.sources.fieldEvidenceItemsCsvApplied ? "已应用" : "未应用"}，签字 / 边界 CSV：${suite.sources.fieldEvidenceSignoffBoundaryCsvApplied ? "已应用" : "未应用"}，源 manifest 未覆盖。`
      : "",
    suite.safeguards.releaseCandidateRefreshRecommendedAfterDraftApply
      ? "- 注意：本次已应用现场 CSV 生成 draft manifest，但 release-candidate 使用的是现有 JSON；最终门禁请带 `--refresh-release-candidate` 重新生成。"
      : "",
    "",
    "## 套件步骤",
    "",
    "| 步骤 | 状态 | READY | 关键摘要 |",
    "| --- | --- | --- | --- |",
    ...suite.steps.map((step) =>
      `| ${escapeMarkdownTable(step.key)} | ${escapeMarkdownTable(step.status)} | ${step.ready ? "是" : "否"} | ${escapeMarkdownTable(step.summary?.label || step.summary?.releaseGate || step.summary?.evidence || "")} |`,
    ),
    "",
    "## 生产上线组合预检阶段清单",
    "",
    `- 状态：${suite.productionGoLiveStageChecklist.ready ? "READY" : "BLOCKED"}`,
    `- 汇总：${suite.productionGoLiveStageChecklist.summary.label}`,
    `- 来源：${suite.productionGoLiveStageChecklist.source === "live_precheck" ? "live 组合预检" : "release-candidate 快照，仍需现场执行 live 组合预检"}`,
    "",
    "| 顺序 | 阶段 | 状态 | 来源摘要 | 负责人 | 下一步 | 复核 | 留证 |",
    "| ---: | --- | --- | --- | --- | --- | --- | --- |",
    ...suite.productionGoLiveStageChecklist.stages.map((stage) =>
      `| ${stage.stageOrder} | ${escapeMarkdownTable(stage.label)} | ${stage.ready ? "通过" : "待处理"} | ${escapeMarkdownTable(stage.sourceSummary)} | ${escapeMarkdownTable(stage.ownerRole)} | ${escapeMarkdownTable(stage.nextAction)} | ${escapeMarkdownTable(stage.verificationSteps[0] || "按阶段命令复核")} | ${escapeMarkdownTable(stage.evidenceToKeep[0] || "保留阶段报告")} |`,
    ),
    "",
    "## 最小解除阻塞路径",
    "",
    `- 待处理总数：${suite.unblockPlan.summary.taskCount} 项`,
    `- 发布门禁：${suite.unblockPlan.summary.releaseTaskCount} 项`,
    `- 现场证据：${suite.unblockPlan.summary.evidenceTaskCount} 项`,
    `- 签字 / 边界：${suite.unblockPlan.summary.signoffTaskCount + suite.unblockPlan.summary.boundaryTaskCount} 项`,
    `- 负责人角色：${suite.unblockPlan.summary.roleCount} 个`,
    "",
    "| 顺序 | 阶段 | 待处理 | 负责人角色 | 先做什么 |",
    "| ---: | --- | ---: | --- | --- |",
    ...suite.unblockPlan.phases
      .filter((phase) => phase.taskCount > 0)
      .map((phase, index) =>
        `| ${index + 1} | ${escapeMarkdownTable(phase.label)} | ${phase.taskCount} | ${escapeMarkdownTable(phase.roles.join("、") || "未分配")} | ${escapeMarkdownTable(phase.nextStep)} |`,
      ),
    "",
    "### 最先处理的 10 项",
    "",
    "| 类型 | 分组 | 任务 | 主负责人 | 下一步 |",
    "| --- | --- | --- | --- | --- |",
    ...(suite.unblockPlan.firstActions.length
      ? suite.unblockPlan.firstActions.map((task) =>
          `| ${escapeMarkdownTable(task.type)} | ${escapeMarkdownTable(task.group)} | ${escapeMarkdownTable(task.title)} | ${escapeMarkdownTable(task.primaryRole)} | ${escapeMarkdownTable(task.action)} |`,
        )
      : ["| 无 | 无 | 当前无阻塞项 | 无 | 进入负责人最终复核 |"]),
    "",
    "## 模块完成度",
    "",
    "| 模块 | 需求 | P0 / 代码 | V1 上线 | 主要未完成项 |",
    "| --- | ---: | ---: | ---: | --- |",
    ...(suite.moduleCompletion?.modules?.length
      ? suite.moduleCompletion.modules.map((item) =>
          `| ${escapeMarkdownTable(item.module)} | ${escapeMarkdownTable(item.requirementCompletion)} | ${escapeMarkdownTable(item.p0CodeCompletion)} | ${escapeMarkdownTable(item.v1Readiness)} | ${escapeMarkdownTable(item.remaining)} |`,
        )
      : ["| 未读取 | - | - | - | 未读取模块完成度文档 |"]),
    "",
    "## 输出文件",
    "",
    "| 产物 | 路径 |",
    "| --- | --- |",
    `| 发布候选 JSON | \`${escapeMarkdownTable(displayPathValue(suite.filesFromSteps.releaseCandidate?.latestJson))}\` |`,
    `| 现场任务 JSON | \`${escapeMarkdownTable(displayPathValue(suite.filesFromSteps.onsiteTaskBoard?.latestJson))}\` |`,
    `| 完成度快照 | \`${escapeMarkdownTable(displayPathValue(suite.filesFromSteps.completionSnapshot?.latestMarkdown))}\` |`,
    `| V1/V2 差异摘要 | \`${escapeMarkdownTable(displayPathValue(suite.filesFromSteps.v1V2ScopeBrief?.latestMarkdown))}\` |`,
    `| 负责人决策摘要 | \`${escapeMarkdownTable(displayPathValue(suite.filesFromSteps.ownerDecisionBrief?.latestMarkdown))}\` |`,
    `| 现场证据采集包 | \`${escapeMarkdownTable(displayPathValue(suite.filesFromSteps.fieldEvidenceIntake?.summaryMarkdown))}\` |`,
    `| 上线交接包 | \`${escapeMarkdownTable(displayPathValue(suite.filesFromSteps.handoffPack?.summaryMarkdown))}\` |`,
    `| D49 正式员工机台导入模板 | \`${escapeMarkdownTable(displayPathValue(suite.filesFromSteps.handoffPack?.d49EmployeeImportTemplate))}\` |`,
    `| D49 正式员工导入说明 | \`${escapeMarkdownTable(displayPathValue(suite.filesFromSteps.handoffPack?.d49EmployeeIntakeGuide))}\` |`,
    `| 生产 env 准备报告（交接包） | \`${escapeMarkdownTable(displayPathValue(suite.filesFromSteps.handoffPack?.productionEnvSetupMarkdown))}\` |`,
    `| 生产 env 真实值校验（交接包） | \`${escapeMarkdownTable(displayPathValue(suite.filesFromSteps.handoffPack?.productionEnvIntakeVerificationMarkdown))}\` |`,
    `| 第一阶段证据建议（交接包） | \`${escapeMarkdownTable(displayPathValue(suite.filesFromSteps.handoffPack?.productionFirstStageEvidenceSuggestionsMarkdown))}\` |`,
    `| 第一阶段 suggested CSV（交接包） | \`${escapeMarkdownTable(displayPathValue(suite.filesFromSteps.handoffPack?.productionFirstStageEvidenceSuggestionsCsv))}\` |`,
    `| 生产上线组合预检阶段清单 | \`${escapeMarkdownTable(displayPathValue(suite.files?.productionGoLiveStageChecklistMarkdown))}\` |`,
    `| 最小解除阻塞清单 | \`${escapeMarkdownTable(displayPathValue(suite.files?.unblockPlanMarkdown))}\` |`,
    ...(suite.canonicalLatest?.synced ? formatCanonicalLatestRows(suite.canonicalLatest) : []),
    "",
    "## 安全说明",
    "",
    "- 本套件只编排现有 V1 门禁和交接产物，不修改现场证据状态，不把 pending 自动改成 passed。",
    "- 如使用 `--use-production-env-setup-env-file`，套件只把生产 env setup 报告中的安全 env 文件路径传给 release-candidate；报告仍不输出 env 文件内容或真实变量值。",
    "- 生产 env 真实值校验只复制 intake 校验器的脱敏 latest 报告；不输出真实 env 文件路径、连接串、bucket、secret、spool 路径、token 或证据原文。",
    "- 第一阶段证据建议只生成 suggested CSV 给负责人复核；不会刷新 release candidate，也不会把建议自动写成正式现场证据。",
    "- 输出默认只包含脱敏状态、计数、阻塞标签和文件索引，不打印原始 evidenceRef、签字人、真实 env 值、命令路径、spool 路径或密钥。",
    "- 只有发布候选 READY、现场证据 manifest READY、现场任务清零、负责人签字和 V1/V2 边界确认完成后，才可以宣布 V1 完成。",
    "",
  ];
  return `${lines.join("\n")}`;
}

function formatProductionGoLiveStageChecklistMarkdown(suite) {
  const checklist = suite.productionGoLiveStageChecklist;
  const lines = [
    "# ERP V1 生产上线组合预检阶段清单",
    "",
    `- 生成时间：${suite.generatedAt || checklist.generatedAt}`,
    `- 当前结论：${checklist.ready ? "READY" : "BLOCKED"}`,
    `- 是否可以宣布 V1 完成：${suite.canDeclareV1Complete ? "可以" : "不可以"}`,
    `- 汇总：${checklist.summary.label}`,
    `- 来源：${checklist.source === "live_precheck" ? "live 组合预检" : "release-candidate 快照，仍需现场执行 live 组合预检"}`,
    `- 首个待处理阶段：${checklist.summary.firstBlockedStage || "无"}`,
    "",
    "## 阶段清单",
    "",
    "| 顺序 | 阶段 | 状态 | 来源摘要 | 负责人 | 阻塞数 | 下一步 |",
    "| ---: | --- | --- | --- | --- | ---: | --- |",
    ...checklist.stages.map((stage) =>
      `| ${stage.stageOrder} | ${escapeMarkdownTable(stage.label)} | ${stage.ready ? "通过" : "待处理"} | ${escapeMarkdownTable(stage.sourceSummary)} | ${escapeMarkdownTable(stage.ownerRole)} | ${stage.blockingCount} | ${escapeMarkdownTable(stage.nextAction)} |`,
    ),
    "",
    "## 复核与留证",
    "",
  ];
  for (const stage of checklist.stages) {
    lines.push(`### ${stage.stageOrder}. ${stage.label}`);
    lines.push("");
    lines.push(`- 负责人：${stage.ownerRole}`);
    lines.push(`- 当前状态：${stage.ready ? "通过" : "待处理"}（${stage.sourceSummary || stage.sourceStatus}）`);
    lines.push(`- 下一步：${stage.nextAction}`);
    lines.push("- 复核步骤：");
    for (const step of stage.verificationSteps.length ? stage.verificationSteps : ["按阶段命令复核后保留报告。"]) {
      lines.push(`  - ${step}`);
    }
    lines.push("- 留证要求：");
    for (const evidence of stage.evidenceToKeep.length ? stage.evidenceToKeep : ["保留阶段预检报告。"]) {
      lines.push(`  - ${evidence}`);
    }
    if (stage.fixItems.length) {
      lines.push("- 关联修正项：");
      for (const item of stage.fixItems) {
        lines.push(`  - ${item.label}：${item.nextAction}`);
      }
    }
    if (stage.minimumBlockingItems.length) {
      lines.push("- 最小补值清单：");
      for (const item of stage.minimumBlockingItems) {
        const variableLabel = item.variableLabel ? ` / ${item.variableLabel}` : "";
        const valueHint = item.expectedValueType ? ` / ${item.expectedValueType}` : "";
        lines.push(`  - ${item.ownerRole}：${item.label}${variableLabel}${valueHint}；${item.nextAction || item.detail}`);
      }
    }
    if (stage.blockers.length) {
      lines.push("- 当前阻塞：");
      for (const blocker of stage.blockers) {
        lines.push(`  - ${blocker.label}：${blocker.detail || blocker.status}`);
      }
    }
    lines.push("");
  }
  lines.push("## 安全说明");
  lines.push("");
  lines.push("- 本清单只根据 release-candidate 或 live 组合预检结果整理阶段动作，不应用 env、不刷新候选、不打印、不修改现场证据。");
  lines.push("- 如果来源是 release-candidate 快照，当前 API 生产 profile 仍必须通过 live 组合预检单独证明。");
  lines.push("- 输出不包含真实 env 值、命令路径、spool 路径、对象存储密钥、本地安全 env 文件路径或原始现场证据编号。");
  lines.push("");
  return `${lines.join("\n")}`;
}

function formatUnblockPlanMarkdown(suite) {
  const plan = suite.unblockPlan;
  const lines = [
    "# ERP V1 最小解除阻塞清单",
    "",
    `- 生成时间：${suite.generatedAt}`,
    `- 当前结论：${plan.ready ? "READY" : "BLOCKED"}`,
    `- 是否可以宣布 V1 完成：${suite.canDeclareV1Complete ? "可以" : "不可以"}`,
    `- 待处理总数：${plan.summary.taskCount} 项`,
    `- 发布门禁：${plan.summary.releaseTaskCount} 项`,
    `- 现场证据：${plan.summary.evidenceTaskCount} 项`,
    `- 负责人签字：${plan.summary.signoffTaskCount} 项`,
    `- V1/V2 边界：${plan.summary.boundaryTaskCount} 项`,
    `- 说明：${plan.summary.label}`,
    "",
    "## 阶段顺序",
    "",
    "| 顺序 | 阶段 | 待处理 | 发布门禁 | 现场证据 | 签字 / 边界 | 负责人角色 | 先做什么 |",
    "| ---: | --- | ---: | ---: | ---: | ---: | --- | --- |",
    ...plan.phases
      .filter((phase) => phase.taskCount > 0)
      .map((phase, index) =>
        `| ${index + 1} | ${escapeMarkdownTable(phase.label)} | ${phase.taskCount} | ${phase.releaseTaskCount} | ${phase.evidenceTaskCount} | ${phase.signoffTaskCount + phase.boundaryTaskCount} | ${escapeMarkdownTable(phase.roles.join("、") || "未分配")} | ${escapeMarkdownTable(phase.nextStep)} |`,
      ),
    "",
    "## 每阶段优先任务",
    "",
  ];
  for (const phase of plan.phases.filter((item) => item.taskCount > 0)) {
    lines.push(`### ${phase.label}`);
    lines.push("");
    lines.push(`- 待处理：${phase.taskCount} 项`);
    lines.push(`- 主要分组：${phase.groups.length ? phase.groups.map((item) => `${item.group} ${item.count}`).join("、") : "无"}`);
    lines.push("");
    lines.push("| 类型 | 分组 | 任务 | 主负责人 | 下一步 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const task of phase.firstTasks) {
      lines.push(
        `| ${escapeMarkdownTable(task.type)} | ${escapeMarkdownTable(task.group)} | ${escapeMarkdownTable(task.title)} | ${escapeMarkdownTable(task.primaryRole)} | ${escapeMarkdownTable(task.action)} |`,
      );
    }
    lines.push("");
  }
  lines.push("## 最先处理的 10 项");
  lines.push("");
  lines.push("| 类型 | 分组 | 任务 | 主负责人 | 下一步 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const task of plan.firstActions) {
    lines.push(
      `| ${escapeMarkdownTable(task.type)} | ${escapeMarkdownTable(task.group)} | ${escapeMarkdownTable(task.title)} | ${escapeMarkdownTable(task.primaryRole)} | ${escapeMarkdownTable(task.action)} |`,
    );
  }
  if (!plan.firstActions.length) {
    lines.push("| 无 | 无 | 当前无阻塞项 | 无 | 进入负责人最终复核 |");
  }
  lines.push("");
  lines.push("## 角色压力");
  lines.push("");
  lines.push("| 角色 | 待处理任务 | P0 |");
  lines.push("| --- | ---: | ---: |");
  for (const bucket of plan.roleBuckets) {
    lines.push(`| ${escapeMarkdownTable(bucket.role)} | ${bucket.taskCount} | ${bucket.p0TaskCount} |`);
  }
  if (!plan.roleBuckets.length) lines.push("| 无 | 0 | 0 |");
  lines.push("");
  lines.push("## 安全说明");
  lines.push("");
  lines.push("- 本清单只汇总阻塞项，不修改现场证据状态，不把 pending 自动改成 passed。");
  lines.push("- 输出不包含原始 evidenceRef、签字人、真实 env 值、命令路径、spool 路径或密钥。");
  lines.push("- 完成任务后仍需回填现场证据 manifest，重新跑 release candidate 和 go-live suite。");
  lines.push("");
  return `${lines.join("\n")}`;
}

function formatCanonicalLatestRows(canonicalLatest) {
  const rows = Object.entries(canonicalLatest.artifacts || {});
  if (!rows.length) return [];
  return [
    "",
    "## 顶层 latest 同步",
    "",
    `- 同步根目录：\`${escapeMarkdownTable(canonicalLatest.root || "")}\``,
    "",
    "| 产物 | 顶层路径 |",
    "| --- | --- |",
    ...rows.map(([key, artifact]) => `| ${escapeMarkdownTable(key)} | \`${escapeMarkdownTable(artifact?.path || "")}\` |`),
  ];
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} is not readable JSON: ${displayInputPath(path)}`);
  }
}

function resolveOptionalPath(path) {
  const resolved = resolve(path);
  return existsSync(resolved) ? resolved : "";
}

function resolveOptionalInputPath({ explicitPath, envPath, defaultPath, label }) {
  if (
    !explicitPath &&
    !envPath &&
    process.env.ERP_V1_GO_LIVE_SUITE_IGNORE_DEFAULT_ARTIFACTS === "true"
  ) {
    return "";
  }
  const selected = explicitPath || envPath || defaultPath;
  const resolved = resolve(selected);
  if (existsSync(resolved)) return resolved;
  if (explicitPath || envPath) throw new Error(`${label} is missing: ${displayInputPath(resolved)}`);
  return "";
}

function resolvePathFromResult(path) {
  if (!path) return "";
  return resolve(path);
}

function normalizeFiles(files) {
  const normalized = {};
  for (const [key, value] of Object.entries(files || {})) {
    if (typeof value === "string") {
      normalized[key] = displayPathValue(value);
    } else if (Array.isArray(value)) {
      normalized[key] = value.map((item) => (typeof item === "string" ? displayPathValue(item) : item));
    } else if (value && typeof value === "object") {
      normalized[key] = normalizeFiles(value);
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return null;
  }
}

function assertNoSensitiveOutput(output, label) {
  for (const pattern of sensitivePatterns) {
    if (pattern.test(output)) {
      throw new Error(`${label} output matched sensitive pattern ${pattern}`);
    }
    pattern.lastIndex = 0;
  }
}

function sanitizeObject(value) {
  return JSON.parse(JSON.stringify(value, (_, current) => (typeof current === "string" ? redactText(current) : current)));
}

function sanitizeValue(value) {
  return redactText(stringValue(value).replace(/\s+/g, " ").trim());
}

function redactText(value) {
  let output = stringValue(value);
  for (const pattern of sensitivePatterns) {
    output = output.replace(pattern, "[redacted]");
    pattern.lastIndex = 0;
  }
  return output;
}

function displayPathValue(path) {
  if (!path) return "";
  if (typeof path !== "string") return "";
  return displayPath(path);
}

function displayPath(path) {
  const relativePath = relative(process.cwd(), resolve(path));
  if (!relativePath.startsWith("..") && !relativePath.startsWith("/") && relativePath !== "") return relativePath;
  return "[external-output]";
}

function displayInputPath(path) {
  const relativePath = relative(process.cwd(), resolve(path));
  if (!relativePath.startsWith("..") && !relativePath.startsWith("/") && relativePath !== "") return relativePath;
  return `[external:${String(path).split(/[\\/]/).pop() || "file"}]`;
}

function escapeMarkdownTable(value) {
  return stringValue(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function stringList(value) {
  return Array.isArray(value) ? value.map((item) => sanitizeValue(item)).filter(Boolean) : [];
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

function stringValue(value) {
  return value == null ? "" : String(value);
}
