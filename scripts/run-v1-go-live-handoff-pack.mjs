#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { validateV1FieldEvidenceManifest } from "./v1FieldEvidenceManifest.mjs";

const defaultOutputDir = join(".erp-local-storage", "v1-go-live-handoff");
const defaultReleaseCandidateJsonPath = join(".erp-local-storage", "v1-release-candidate", "latest.json");
const defaultFieldEvidenceManifestPath = join("docs", "development", "v1-field-evidence-manifest.template.json");
const defaultOnsiteTaskBoardJsonPath = join(".erp-local-storage", "v1-onsite-task-board", "latest.json");
const defaultOnsiteTaskBoardMarkdownPath = join(".erp-local-storage", "v1-onsite-task-board", "latest.md");
const defaultOnsiteTaskBoardRolesDir = join(".erp-local-storage", "v1-onsite-task-board", "roles");
const defaultCompletionSnapshotJsonPath = join(".erp-local-storage", "v1-completion-snapshot", "latest.json");
const defaultCompletionSnapshotMarkdownPath = join(".erp-local-storage", "v1-completion-snapshot", "latest.md");
const defaultFieldEvidenceIntakeDir = join(".erp-local-storage", "v1-field-evidence-intake");
const defaultOwnerDecisionBriefJsonPath = join(".erp-local-storage", "v1-owner-decision-brief", "latest.json");
const defaultOwnerDecisionBriefMarkdownPath = join(".erp-local-storage", "v1-owner-decision-brief", "latest.zh-CN.md");
const defaultV1V2ScopeBriefJsonPath = join(".erp-local-storage", "v1-v2-scope-brief", "latest.json");
const defaultV1V2ScopeBriefMarkdownPath = join(".erp-local-storage", "v1-v2-scope-brief", "latest.zh-CN.md");
const defaultProductionGoLiveStageChecklistJsonPath = join(
  ".erp-local-storage",
  "v1-go-live-suite",
  "production-go-live-stage-checklist.json",
);
const defaultProductionGoLiveStageChecklistMarkdownPath = join(
  ".erp-local-storage",
  "v1-go-live-suite",
  "production-go-live-stage-checklist.zh-CN.md",
);
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
const defaultUnblockPlanJsonPath = join(".erp-local-storage", "v1-go-live-suite", "v1-unblock-plan.json");
const defaultUnblockPlanMarkdownPath = join(".erp-local-storage", "v1-go-live-suite", "v1-unblock-plan.zh-CN.md");
const defaultProductionEnvValuesDryRunProofMaxAgeHours = 24;
const productionEnvValuesDryRunProofMaxAgeHoursEnvName =
  "ERP_V1_PRODUCTION_ENV_VALUES_DRY_RUN_MAX_AGE_HOURS";
const redactedProductionEnvSetupEnvFileLabel = "env 文件 1";

const requiredDocs = [
  {
    key: "productionEnvTemplate",
    source: join("docs", "development", "v1-production.env.example"),
    target: "v1-production.env.example",
    label: "V1 生产环境变量模板",
  },
  {
    key: "goLiveRunbook",
    source: join("docs", "development", "v1-go-live-runbook.zh-CN.md"),
    target: "v1-go-live-runbook.zh-CN.md",
    label: "V1 发布前执行清单",
  },
  {
    key: "fieldEvidenceChecklist",
    source: join("docs", "development", "v1-field-evidence-checklist.zh-CN.md"),
    target: "v1-field-evidence-checklist.zh-CN.md",
    label: "V1 现场证据填写说明",
  },
  {
    key: "v1V2Scope",
    source: join("docs", "development", "v1-v2-scope.zh-CN.md"),
    target: "v1-v2-scope.zh-CN.md",
    label: "V1 / V2 范围差异",
  },
];

try {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = resolve(options.outputDir || process.env.ERP_V1_GO_LIVE_HANDOFF_OUTPUT_DIR || defaultOutputDir);
  const releaseCandidateJsonPath = resolve(
    options.releaseCandidateJson ||
      process.env.ERP_V1_GO_LIVE_HANDOFF_RELEASE_CANDIDATE_JSON ||
      defaultReleaseCandidateJsonPath,
  );
  const fieldEvidenceManifestPath = resolve(
    options.fieldEvidenceManifest ||
      process.env.ERP_V1_FIELD_EVIDENCE_MANIFEST ||
      defaultFieldEvidenceManifestPath,
  );
  const onsiteTaskBoardJsonPath = resolveOptionalPath({
    explicitPath: options.onsiteTaskBoardJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_ONSITE_TASK_BOARD_JSON,
    defaultPath: defaultOnsiteTaskBoardJsonPath,
    label: "V1 onsite task-board JSON",
  });
  const onsiteTaskBoardMarkdownPath = resolveOptionalPath({
    explicitPath: options.onsiteTaskBoardMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_ONSITE_TASK_BOARD_MARKDOWN,
    defaultPath: defaultOnsiteTaskBoardMarkdownPath,
    label: "V1 onsite task-board Markdown",
  });
  const onsiteTaskBoardRolesDir = resolveOptionalPath({
    explicitPath: options.onsiteTaskBoardRolesDir,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_ONSITE_TASK_BOARD_ROLES_DIR,
    defaultPath: defaultOnsiteTaskBoardRolesDir,
    label: "V1 onsite task-board roles directory",
  });
  const completionSnapshotJsonPath = resolveOptionalPath({
    explicitPath: options.completionSnapshotJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_COMPLETION_SNAPSHOT_JSON,
    defaultPath: defaultCompletionSnapshotJsonPath,
    label: "V1 completion snapshot JSON",
  });
  const completionSnapshotMarkdownPath = resolveOptionalPath({
    explicitPath: options.completionSnapshotMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_COMPLETION_SNAPSHOT_MARKDOWN,
    defaultPath: defaultCompletionSnapshotMarkdownPath,
    label: "V1 completion snapshot Markdown",
  });
  const fieldEvidenceIntakeDir = resolveOptionalPath({
    explicitPath: options.fieldEvidenceIntakeDir,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_FIELD_EVIDENCE_INTAKE_DIR,
    defaultPath: defaultFieldEvidenceIntakeDir,
    label: "V1 field-evidence intake directory",
  });
  const ownerDecisionBriefJsonPath = resolveOptionalPath({
    explicitPath: options.ownerDecisionBriefJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_OWNER_DECISION_BRIEF_JSON,
    defaultPath: defaultOwnerDecisionBriefJsonPath,
    label: "V1 owner decision brief JSON",
  });
  const ownerDecisionBriefMarkdownPath = resolveOptionalPath({
    explicitPath: options.ownerDecisionBriefMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_OWNER_DECISION_BRIEF_MARKDOWN,
    defaultPath: defaultOwnerDecisionBriefMarkdownPath,
    label: "V1 owner decision brief Markdown",
  });
  const v1V2ScopeBriefJsonPath = resolveOptionalPath({
    explicitPath: options.v1V2ScopeBriefJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_V1_V2_SCOPE_BRIEF_JSON,
    defaultPath: defaultV1V2ScopeBriefJsonPath,
    label: "V1/V2 scope brief JSON",
  });
  const v1V2ScopeBriefMarkdownPath = resolveOptionalPath({
    explicitPath: options.v1V2ScopeBriefMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_V1_V2_SCOPE_BRIEF_MARKDOWN,
    defaultPath: defaultV1V2ScopeBriefMarkdownPath,
    label: "V1/V2 scope brief Markdown",
  });
  const productionGoLiveStageChecklistJsonPath = resolveOptionalPath({
    explicitPath: options.productionGoLiveStageChecklistJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_GO_LIVE_STAGE_CHECKLIST_JSON,
    defaultPath: defaultProductionGoLiveStageChecklistJsonPath,
    label: "V1 production go-live stage checklist JSON",
  });
  const productionGoLiveStageChecklistMarkdownPath = resolveOptionalPath({
    explicitPath: options.productionGoLiveStageChecklistMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_GO_LIVE_STAGE_CHECKLIST_MARKDOWN,
    defaultPath: defaultProductionGoLiveStageChecklistMarkdownPath,
    label: "V1 production go-live stage checklist Markdown",
  });
  const productionEnvSetupJsonPath = resolveOptionalPath({
    explicitPath: options.productionEnvSetupJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_ENV_SETUP_JSON,
    defaultPath: defaultProductionEnvSetupJsonPath,
    label: "V1 production env setup JSON",
  });
  const productionEnvSetupMarkdownPath = resolveOptionalPath({
    explicitPath: options.productionEnvSetupMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_ENV_SETUP_MARKDOWN,
    defaultPath: defaultProductionEnvSetupMarkdownPath,
    label: "V1 production env setup Markdown",
  });
  const productionEnvIntakeVerifyJsonPath = resolveOptionalPath({
    explicitPath: options.productionEnvIntakeVerifyJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_ENV_INTAKE_VERIFY_JSON,
    defaultPath: defaultProductionEnvIntakeVerifyJsonPath,
    label: "V1 production env intake verification JSON",
  });
  const productionEnvIntakeVerifyMarkdownPath = resolveOptionalPath({
    explicitPath: options.productionEnvIntakeVerifyMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_ENV_INTAKE_VERIFY_MARKDOWN,
    defaultPath: defaultProductionEnvIntakeVerifyMarkdownPath,
    label: "V1 production env intake verification Markdown",
  });
  const productionFirstStageExecutionJsonPath = resolveOptionalPath({
    explicitPath: options.productionFirstStageExecutionJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_FIRST_STAGE_EXECUTION_JSON,
    defaultPath: defaultProductionFirstStageExecutionJsonPath,
    label: "V1 production first-stage execution JSON",
  });
  const productionFirstStageExecutionMarkdownPath = resolveOptionalPath({
    explicitPath: options.productionFirstStageExecutionMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_FIRST_STAGE_EXECUTION_MARKDOWN,
    defaultPath: defaultProductionFirstStageExecutionMarkdownPath,
    label: "V1 production first-stage execution Markdown",
  });
  const productionFirstStageEvidenceSuggestionsJsonPath = resolveOptionalPath({
    explicitPath: options.productionFirstStageEvidenceSuggestionsJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_FIRST_STAGE_EVIDENCE_SUGGESTIONS_JSON,
    defaultPath: defaultProductionFirstStageEvidenceSuggestionsJsonPath,
    label: "V1 production first-stage evidence suggestions JSON",
  });
  const productionFirstStageEvidenceSuggestionsMarkdownPath = resolveOptionalPath({
    explicitPath: options.productionFirstStageEvidenceSuggestionsMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_FIRST_STAGE_EVIDENCE_SUGGESTIONS_MARKDOWN,
    defaultPath: defaultProductionFirstStageEvidenceSuggestionsMarkdownPath,
    label: "V1 production first-stage evidence suggestions Markdown",
  });
  const productionFirstStageEvidenceSuggestionsCsvPath = resolveOptionalPath({
    explicitPath: options.productionFirstStageEvidenceSuggestionsCsv,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_FIRST_STAGE_EVIDENCE_SUGGESTIONS_CSV,
    defaultPath: defaultProductionFirstStageEvidenceSuggestionsCsvPath,
    label: "V1 production first-stage evidence suggestions CSV",
  });
  const productionPersistenceEvidenceJsonPath = resolveOptionalPath({
    explicitPath: options.productionPersistenceEvidenceJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_PERSISTENCE_EVIDENCE_JSON,
    defaultPath: defaultProductionPersistenceEvidenceJsonPath,
    label: "V1 production persistence evidence JSON",
  });
  const productionPersistenceEvidenceMarkdownPath = resolveOptionalPath({
    explicitPath: options.productionPersistenceEvidenceMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_PERSISTENCE_EVIDENCE_MARKDOWN,
    defaultPath: defaultProductionPersistenceEvidenceMarkdownPath,
    label: "V1 production persistence evidence Markdown",
  });
  const productionRuntimeSmokeJsonPath = resolveOptionalPath({
    explicitPath: options.productionRuntimeSmokeJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_RUNTIME_SMOKE_JSON,
    defaultPath: defaultProductionRuntimeSmokeJsonPath,
    label: "V1 production runtime-smoke JSON",
  });
  const productionRuntimeSmokeMarkdownPath = resolveOptionalPath({
    explicitPath: options.productionRuntimeSmokeMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRODUCTION_RUNTIME_SMOKE_MARKDOWN,
    defaultPath: defaultProductionRuntimeSmokeMarkdownPath,
    label: "V1 production runtime-smoke Markdown",
  });
  const printChainCloseoutJsonPath = resolveOptionalPath({
    explicitPath: options.printChainCloseoutJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRINT_CHAIN_CLOSEOUT_JSON,
    defaultPath: defaultPrintChainCloseoutJsonPath,
    label: "V1 print-chain closeout JSON",
  });
  const printChainCloseoutMarkdownPath = resolveOptionalPath({
    explicitPath: options.printChainCloseoutMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRINT_CHAIN_CLOSEOUT_MARKDOWN,
    defaultPath: defaultPrintChainCloseoutMarkdownPath,
    label: "V1 print-chain closeout Markdown",
  });
  const printChainExecutionJsonPath = resolveOptionalPath({
    explicitPath: options.printChainExecutionJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRINT_CHAIN_EXECUTION_JSON,
    defaultPath: defaultPrintChainExecutionJsonPath,
    label: "V1 print-chain execution JSON",
  });
  const printChainExecutionMarkdownPath = resolveOptionalPath({
    explicitPath: options.printChainExecutionMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_PRINT_CHAIN_EXECUTION_MARKDOWN,
    defaultPath: defaultPrintChainExecutionMarkdownPath,
    label: "V1 print-chain execution Markdown",
  });
  const driverRealDeviceExecutionJsonPath = resolveOptionalPath({
    explicitPath: options.driverRealDeviceExecutionJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_DRIVER_REAL_DEVICE_EXECUTION_JSON,
    defaultPath: defaultDriverRealDeviceExecutionJsonPath,
    label: "V1 driver real-device execution JSON",
  });
  const driverRealDeviceExecutionMarkdownPath = resolveOptionalPath({
    explicitPath: options.driverRealDeviceExecutionMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_DRIVER_REAL_DEVICE_EXECUTION_MARKDOWN,
    defaultPath: defaultDriverRealDeviceExecutionMarkdownPath,
    label: "V1 driver real-device execution Markdown",
  });
  const driverRealDeviceCloseoutJsonPath = resolveOptionalPath({
    explicitPath: options.driverRealDeviceCloseoutJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_DRIVER_REAL_DEVICE_CLOSEOUT_JSON,
    defaultPath: defaultDriverRealDeviceCloseoutJsonPath,
    label: "V1 driver real-device closeout JSON",
  });
  const driverRealDeviceCloseoutMarkdownPath = resolveOptionalPath({
    explicitPath: options.driverRealDeviceCloseoutMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_DRIVER_REAL_DEVICE_CLOSEOUT_MARKDOWN,
    defaultPath: defaultDriverRealDeviceCloseoutMarkdownPath,
    label: "V1 driver real-device closeout Markdown",
  });
  const unblockPlanJsonPath = resolveOptionalPath({
    explicitPath: options.unblockPlanJson,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_UNBLOCK_PLAN_JSON,
    defaultPath: defaultUnblockPlanJsonPath,
    label: "V1 unblock plan JSON",
  });
  const unblockPlanMarkdownPath = resolveOptionalPath({
    explicitPath: options.unblockPlanMarkdown,
    envPath: process.env.ERP_V1_GO_LIVE_HANDOFF_UNBLOCK_PLAN_MARKDOWN,
    defaultPath: defaultUnblockPlanMarkdownPath,
    label: "V1 unblock plan Markdown",
  });

  const releaseCandidate = readReleaseCandidate({ path: releaseCandidateJsonPath });
  const releaseCandidateMarkdownPath = resolveReleaseCandidateMarkdownPath({
    explicitPath: options.releaseCandidateMarkdown,
    releaseCandidate,
    jsonPath: releaseCandidateJsonPath,
  });
  const fieldEvidence = readFieldEvidenceManifest({ path: fieldEvidenceManifestPath });
  const onsiteTaskBoard = readOnsiteTaskBoard({
    jsonPath: onsiteTaskBoardJsonPath,
    markdownPath: onsiteTaskBoardMarkdownPath,
    rolesDir: onsiteTaskBoardRolesDir,
  });
  const completionSnapshot = readCompletionSnapshot({
    jsonPath: completionSnapshotJsonPath,
    markdownPath: completionSnapshotMarkdownPath,
  });
  const fieldEvidenceIntake = readFieldEvidenceIntakePack({ dir: fieldEvidenceIntakeDir });
  const ownerDecisionBrief = readOwnerDecisionBrief({
    jsonPath: ownerDecisionBriefJsonPath,
    markdownPath: ownerDecisionBriefMarkdownPath,
  });
  const v1V2ScopeBrief = readV1V2ScopeBrief({
    jsonPath: v1V2ScopeBriefJsonPath,
    markdownPath: v1V2ScopeBriefMarkdownPath,
  });
  const productionGoLiveStageChecklist = readProductionGoLiveStageChecklist({
    jsonPath: productionGoLiveStageChecklistJsonPath,
    markdownPath: productionGoLiveStageChecklistMarkdownPath,
  });
  const productionEnvSetup = readProductionEnvSetup({
    jsonPath: productionEnvSetupJsonPath,
    markdownPath: productionEnvSetupMarkdownPath,
  });
  const productionEnvIntakeVerification = readProductionEnvIntakeVerification({
    jsonPath: productionEnvIntakeVerifyJsonPath,
    markdownPath: productionEnvIntakeVerifyMarkdownPath,
  });
  const productionFirstStageExecution = readProductionFirstStageExecution({
    jsonPath: productionFirstStageExecutionJsonPath,
    markdownPath: productionFirstStageExecutionMarkdownPath,
  });
  const productionFirstStageEvidenceSuggestions = readProductionFirstStageEvidenceSuggestions({
    jsonPath: productionFirstStageEvidenceSuggestionsJsonPath,
    markdownPath: productionFirstStageEvidenceSuggestionsMarkdownPath,
    csvPath: productionFirstStageEvidenceSuggestionsCsvPath,
  });
  const productionPersistenceEvidence = readProductionPersistenceEvidence({
    jsonPath: productionPersistenceEvidenceJsonPath,
    markdownPath: productionPersistenceEvidenceMarkdownPath,
  });
  const productionRuntimeSmoke = readProductionRuntimeSmoke({
    jsonPath: productionRuntimeSmokeJsonPath,
    markdownPath: productionRuntimeSmokeMarkdownPath,
  });
  const printChainCloseout = readStageCloseout({
    jsonPath: printChainCloseoutJsonPath,
    markdownPath: printChainCloseoutMarkdownPath,
    expectedScope: "v1_print_chain_closeout",
    label: "V1 print-chain closeout",
  });
  const printChainExecution = readPrintChainExecution({
    jsonPath: printChainExecutionJsonPath,
    markdownPath: printChainExecutionMarkdownPath,
  });
  const driverRealDeviceExecution = readDriverRealDeviceExecution({
    jsonPath: driverRealDeviceExecutionJsonPath,
    markdownPath: driverRealDeviceExecutionMarkdownPath,
  });
  const driverRealDeviceCloseout = readStageCloseout({
    jsonPath: driverRealDeviceCloseoutJsonPath,
    markdownPath: driverRealDeviceCloseoutMarkdownPath,
    expectedScope: "v1_driver_real_device_closeout",
    label: "V1 driver real-device closeout",
  });
  const unblockPlan = readUnblockPlan({
    jsonPath: unblockPlanJsonPath,
    markdownPath: unblockPlanMarkdownPath,
  });
  const docs = readRequiredDocs();
  const report = buildHandoffReport({
    releaseCandidate,
    releaseCandidateJsonPath,
    releaseCandidateMarkdownPath,
    fieldEvidence,
    onsiteTaskBoard,
    completionSnapshot,
    fieldEvidenceIntake,
    ownerDecisionBrief,
    v1V2ScopeBrief,
    productionGoLiveStageChecklist,
    productionEnvSetup,
    productionEnvIntakeVerification,
    productionFirstStageExecution,
    productionFirstStageEvidenceSuggestions,
    productionPersistenceEvidence,
    productionRuntimeSmoke,
    printChainCloseout,
    printChainExecution,
    driverRealDeviceExecution,
    driverRealDeviceCloseout,
    unblockPlan,
    docs,
    includeRawFieldEvidence: Boolean(options.includeRawFieldEvidence),
  });
  const files = writeHandoffPack({
    outputDir,
    report,
    releaseCandidate,
    releaseCandidateJsonPath,
    releaseCandidateMarkdownPath,
    fieldEvidence,
    onsiteTaskBoard,
    completionSnapshot,
    fieldEvidenceIntake,
    ownerDecisionBrief,
    v1V2ScopeBrief,
    productionGoLiveStageChecklist,
    productionEnvSetup,
    productionEnvIntakeVerification,
    productionFirstStageExecution,
    productionFirstStageEvidenceSuggestions,
    productionPersistenceEvidence,
    productionRuntimeSmoke,
    printChainCloseout,
    printChainExecution,
    driverRealDeviceExecution,
    driverRealDeviceCloseout,
    unblockPlan,
    docs,
    includeRawFieldEvidence: Boolean(options.includeRawFieldEvidence),
  });
  const result = buildCommandResult({ report: { ...report, files } });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatCommandResult(result));
  }
} catch (error) {
  const message = error?.message || String(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
  } else {
    process.stderr.write(`V1 go-live handoff pack failed: ${message}\n`);
  }
  process.exit(1);
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readValue(args, index, arg);
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
    if (arg === "--field-evidence-manifest") {
      options.fieldEvidenceManifest = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--onsite-task-board-json") {
      options.onsiteTaskBoardJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--onsite-task-board-markdown") {
      options.onsiteTaskBoardMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--onsite-task-board-roles-dir") {
      options.onsiteTaskBoardRolesDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--completion-snapshot-json") {
      options.completionSnapshotJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--completion-snapshot-markdown") {
      options.completionSnapshotMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--field-evidence-intake-dir") {
      options.fieldEvidenceIntakeDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--owner-decision-brief-json") {
      options.ownerDecisionBriefJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--owner-decision-brief-markdown") {
      options.ownerDecisionBriefMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--v1-v2-scope-brief-json") {
      options.v1V2ScopeBriefJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--v1-v2-scope-brief-markdown") {
      options.v1V2ScopeBriefMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-go-live-stage-checklist-json") {
      options.productionGoLiveStageChecklistJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--production-go-live-stage-checklist-markdown") {
      options.productionGoLiveStageChecklistMarkdown = readValue(args, index, arg);
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
    if (arg === "--unblock-plan-json") {
      options.unblockPlanJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--unblock-plan-markdown") {
      options.unblockPlanMarkdown = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--include-raw-field-evidence") {
      options.includeRawFieldEvidence = true;
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
    "Usage: node scripts/run-v1-go-live-handoff-pack.mjs [options]",
    "",
    "Options:",
    "  --output-dir <dir>                    Output directory, default .erp-local-storage/v1-go-live-handoff",
    "  --release-candidate-json <path>       Release candidate JSON, default .erp-local-storage/v1-release-candidate/latest.json",
    "  --release-candidate-markdown <path>   Optional release candidate Markdown report",
    "  --field-evidence-manifest <path>      Field-evidence manifest, default checked-in template or ERP_V1_FIELD_EVIDENCE_MANIFEST",
    "  --onsite-task-board-json <path>       Optional onsite role task-board JSON, default .erp-local-storage/v1-onsite-task-board/latest.json when present",
    "  --onsite-task-board-markdown <path>   Optional onsite role task-board Markdown, default .erp-local-storage/v1-onsite-task-board/latest.md when present",
    "  --onsite-task-board-roles-dir <dir>    Optional per-role task-board Markdown directory, default .erp-local-storage/v1-onsite-task-board/roles when present",
    "  --completion-snapshot-json <path>      Optional V1 completion snapshot JSON, default .erp-local-storage/v1-completion-snapshot/latest.json when present",
    "  --completion-snapshot-markdown <path>  Optional V1 completion snapshot Markdown, default .erp-local-storage/v1-completion-snapshot/latest.md when present",
    "  --field-evidence-intake-dir <dir>       Optional field-evidence intake pack directory, default .erp-local-storage/v1-field-evidence-intake when present",
    "  --owner-decision-brief-json <path>      Optional owner decision brief JSON, default .erp-local-storage/v1-owner-decision-brief/latest.json when present",
    "  --owner-decision-brief-markdown <path>  Optional owner decision brief Markdown, default .erp-local-storage/v1-owner-decision-brief/latest.zh-CN.md when present",
    "  --v1-v2-scope-brief-json <path>         Optional V1/V2 scope brief JSON, default .erp-local-storage/v1-v2-scope-brief/latest.json when present",
    "  --v1-v2-scope-brief-markdown <path>     Optional V1/V2 scope brief Markdown, default .erp-local-storage/v1-v2-scope-brief/latest.zh-CN.md when present",
    "  --production-go-live-stage-checklist-json <path>",
    "                                      Optional production go-live stage checklist JSON, default .erp-local-storage/v1-go-live-suite/production-go-live-stage-checklist.json when present",
    "  --production-go-live-stage-checklist-markdown <path>",
    "                                      Optional production go-live stage checklist Markdown, default .erp-local-storage/v1-go-live-suite/production-go-live-stage-checklist.zh-CN.md when present",
    "  --production-env-setup-json <path>",
    "                                      Optional production env setup JSON, default .erp-local-storage/v1-production-env-setup/latest.json when present",
    "  --production-env-setup-markdown <path>",
    "                                      Optional production env setup Markdown, default .erp-local-storage/v1-production-env-setup/latest.md when present",
    "  --production-env-intake-verify-json <path>",
    "                                      Optional production env intake verification JSON, default .erp-local-storage/v1-production-env-intake-verify/latest.json when present",
    "  --production-env-intake-verify-markdown <path>",
    "                                      Optional production env intake verification Markdown, default .erp-local-storage/v1-production-env-intake-verify/latest.md when present",
    "  --production-first-stage-execution-json <path>",
    "                                      Optional production env / persistence first-stage execution JSON, default .erp-local-storage/v1-production-first-stage-execution/latest.json when present",
    "  --production-first-stage-execution-markdown <path>",
    "                                      Optional production env / persistence first-stage execution Markdown, default .erp-local-storage/v1-production-first-stage-execution/latest.md when present",
    "  --production-first-stage-evidence-suggestions-json <path>",
    "                                      Optional first-stage evidence suggestions JSON, default .erp-local-storage/v1-production-first-stage-evidence-suggestions/latest.json when present",
    "  --production-first-stage-evidence-suggestions-markdown <path>",
    "                                      Optional first-stage evidence suggestions Markdown, default .erp-local-storage/v1-production-first-stage-evidence-suggestions/latest.md when present",
    "  --production-first-stage-evidence-suggestions-csv <path>",
    "                                      Optional first-stage suggested evidence CSV, default .erp-local-storage/v1-production-first-stage-evidence-suggestions/suggested-evidence-items.csv when present",
    "  --production-persistence-evidence-json <path>",
    "                                      Optional production persistence evidence JSON, default .erp-local-storage/v1-production-persistence-evidence/latest.json when present",
    "  --production-persistence-evidence-markdown <path>",
    "                                      Optional production persistence evidence Markdown, default .erp-local-storage/v1-production-persistence-evidence/latest.md when present",
    "  --production-runtime-smoke-json <path>",
    "                                      Optional production runtime-smoke JSON, default .erp-local-storage/v1-production-runtime-smoke/latest.json when present",
    "  --production-runtime-smoke-markdown <path>",
    "                                      Optional production runtime-smoke Markdown, default .erp-local-storage/v1-production-runtime-smoke/latest.md when present",
    "  --print-chain-closeout-json <path>",
    "                                      Optional print-chain stage closeout JSON, default .erp-local-storage/v1-print-chain-closeout/latest.json when present",
    "  --print-chain-closeout-markdown <path>",
    "                                      Optional print-chain stage closeout Markdown, default .erp-local-storage/v1-print-chain-closeout/latest.md when present",
    "  --print-chain-execution-json <path>",
    "                                      Optional print-chain stage execution JSON, default .erp-local-storage/v1-print-chain-execution/latest.json when present",
    "  --print-chain-execution-markdown <path>",
    "                                      Optional print-chain stage execution Markdown, default .erp-local-storage/v1-print-chain-execution/latest.md when present",
    "  --driver-real-device-execution-json <path>",
    "                                      Optional driver real-device stage execution JSON, default .erp-local-storage/v1-driver-real-device-execution/latest.json when present",
    "  --driver-real-device-execution-markdown <path>",
    "                                      Optional driver real-device stage execution Markdown, default .erp-local-storage/v1-driver-real-device-execution/latest.md when present",
    "  --driver-real-device-closeout-json <path>",
    "                                      Optional driver real-device stage closeout JSON, default .erp-local-storage/v1-driver-real-device-closeout/latest.json when present",
    "  --driver-real-device-closeout-markdown <path>",
    "                                      Optional driver real-device stage closeout Markdown, default .erp-local-storage/v1-driver-real-device-closeout/latest.md when present",
    "  --unblock-plan-json <path>              Optional V1 unblock plan JSON, default .erp-local-storage/v1-go-live-suite/v1-unblock-plan.json when present",
    "  --unblock-plan-markdown <path>          Optional V1 unblock plan Markdown, default .erp-local-storage/v1-go-live-suite/v1-unblock-plan.zh-CN.md when present",
    "  --include-raw-field-evidence          Also copy the raw field-evidence manifest. Default writes only a redacted manifest copy.",
    "  --json                                Print a machine-readable summary",
  ].join("\n");
}

function readReleaseCandidate({ path }) {
  const releaseCandidate = readJson(path, "V1 release candidate JSON");
  if (releaseCandidate?.scope !== "v1_release_candidate_check") {
    throw new Error(`V1 release candidate JSON has an unexpected shape: ${displayInputPath(path)}`);
  }
  return releaseCandidate;
}

function resolveReleaseCandidateMarkdownPath({ explicitPath, releaseCandidate, jsonPath }) {
  if (explicitPath) return resolve(explicitPath);
  const candidates = [
    releaseCandidate?.files?.latestMarkdown,
    releaseCandidate?.files?.markdown,
    jsonPath.replace(/\.json$/i, ".md"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (existsSync(resolved)) return resolved;
  }
  return null;
}

function readFieldEvidenceManifest({ path }) {
  const manifest = readJson(path, "V1 field evidence manifest");
  const validation = validateV1FieldEvidenceManifest(manifest);
  return {
    path,
    manifest,
    validation,
  };
}

function readRequiredDocs() {
  return requiredDocs.map((doc) => {
    const sourcePath = resolve(doc.source);
    if (!existsSync(sourcePath)) throw new Error(`Required handoff document is missing: ${doc.source}`);
    return { ...doc, sourcePath };
  });
}

function resolveOptionalPath({ explicitPath, envPath, defaultPath, label }) {
  const selected = explicitPath || envPath || defaultPath;
  const resolved = resolve(selected);
  if (existsSync(resolved)) return resolved;
  if (explicitPath || envPath) throw new Error(`${label} is missing: ${displayInputPath(resolved)}`);
  return null;
}

function readOnsiteTaskBoard({ jsonPath, markdownPath, rolesDir }) {
  if (!jsonPath && !markdownPath && !rolesDir) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      rolesDir: "",
      status: "",
      ready: false,
      summary: {},
      roleBuckets: [],
      roleMarkdownFiles: [],
    };
  }
  let taskBoard = null;
  if (jsonPath) {
    taskBoard = readJson(jsonPath, "V1 onsite task-board JSON");
    if (taskBoard?.scope !== "v1_onsite_task_board") {
      throw new Error(`V1 onsite task-board JSON has an unexpected shape: ${displayInputPath(jsonPath)}`);
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    rolesDir: rolesDir || "",
    status: stringValue(taskBoard?.status),
    ready: Boolean(taskBoard?.ready),
    summary: taskBoard?.summary || {},
    roleBuckets: Array.isArray(taskBoard?.roleBuckets)
      ? taskBoard.roleBuckets.map((bucket) => ({
          role: stringValue(bucket.role),
          taskCount: Number(bucket.taskCount || 0),
          p0TaskCount: Number(bucket.p0TaskCount || 0),
        }))
      : [],
    roleMarkdownFiles: readOnsiteTaskBoardRoleFiles(rolesDir),
  };
}

function readOnsiteTaskBoardRoleFiles(rolesDir) {
  if (!rolesDir || !existsSync(rolesDir)) return [];
  return readdirSync(rolesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".latest.md"))
    .map((entry) => ({
      filename: entry.name,
      sourcePath: join(rolesDir, entry.name),
    }))
    .sort((left, right) => left.filename.localeCompare(right.filename));
}

function readCompletionSnapshot({ jsonPath, markdownPath }) {
  if (!jsonPath && !markdownPath) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      status: "",
      ready: false,
      summary: {},
      blockerGroups: [],
    };
  }
  let snapshot = null;
  if (jsonPath) {
    snapshot = readJson(jsonPath, "V1 completion snapshot JSON");
    if (snapshot?.scope !== "v1_completion_snapshot") {
      throw new Error(`V1 completion snapshot JSON has an unexpected shape: ${displayInputPath(jsonPath)}`);
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    status: stringValue(snapshot?.status),
    ready: Boolean(snapshot?.ready),
    summary: snapshot?.summary || {},
    blockerGroups: Array.isArray(snapshot?.blockerGroups)
      ? snapshot.blockerGroups.map((group) => ({
          gate: stringValue(group.gate),
          count: Number(group.count || 0),
        }))
      : [],
  };
}

function readFieldEvidenceIntakePack({ dir }) {
  if (!dir) {
    return {
      included: false,
      dir: "",
      status: "",
      ready: false,
      summary: {},
      groupMarkdownFiles: [],
      files: {},
    };
  }
  const manifestPath = join(dir, "intake-manifest.json");
  const intake = readJson(manifestPath, "V1 field-evidence intake manifest");
  if (intake?.scope !== "v1_field_evidence_intake_pack") {
    throw new Error(`V1 field-evidence intake manifest has an unexpected shape: ${displayInputPath(manifestPath)}`);
  }
  const groupsDir = join(dir, "groups");
  const groupMarkdownFiles = existsSync(groupsDir)
    ? readdirSync(groupsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".zh-CN.md"))
        .map((entry) => ({
          filename: entry.name,
          sourcePath: join(groupsDir, entry.name),
        }))
        .sort((left, right) => left.filename.localeCompare(right.filename))
    : [];
  return {
    included: true,
    dir,
    status: stringValue(intake.status),
    ready: Boolean(intake.ready),
    summary: intake.summary || {},
    groupMarkdownFiles,
    files: {
      summaryMarkdown: existsSync(join(dir, "intake-summary.zh-CN.md")) ? join(dir, "intake-summary.zh-CN.md") : "",
      intakeManifest: manifestPath,
      evidenceItemsCsv: existsSync(join(dir, "evidence-items.csv")) ? join(dir, "evidence-items.csv") : "",
      intakeRulesMarkdown: existsSync(join(dir, "intake-rules.zh-CN.md")) ? join(dir, "intake-rules.zh-CN.md") : "",
      signoffBoundaryMarkdown: existsSync(join(dir, "signoff-boundary.zh-CN.md")) ? join(dir, "signoff-boundary.zh-CN.md") : "",
      signoffBoundaryCsv: existsSync(join(dir, "signoff-boundary.csv")) ? join(dir, "signoff-boundary.csv") : "",
    },
  };
}

function readOwnerDecisionBrief({ jsonPath, markdownPath }) {
  if (!jsonPath && !markdownPath) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      status: "",
      ready: false,
      canDeclareV1Complete: false,
      decision: {},
      completion: {},
      unfinishedItems: [],
    };
  }
  let brief = null;
  if (jsonPath) {
    brief = readJson(jsonPath, "V1 owner decision brief JSON");
    if (brief?.scope !== "v1_owner_decision_brief") {
      throw new Error(`V1 owner decision brief JSON has an unexpected shape: ${displayInputPath(jsonPath)}`);
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    status: stringValue(brief?.status),
    ready: Boolean(brief?.ready),
    canDeclareV1Complete: Boolean(brief?.canDeclareV1Complete),
    decision: brief?.decision || {},
    completion: brief?.completion || {},
    unfinishedItems: Array.isArray(brief?.unfinishedItems)
      ? brief.unfinishedItems.slice(0, 12).map((item) => ({
          type: stringValue(item.type),
          label: stringValue(item.label),
          detail: stringValue(item.detail),
        }))
      : [],
  };
}

function readV1V2ScopeBrief({ jsonPath, markdownPath }) {
  if (!jsonPath && !markdownPath) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      status: "",
      ready: false,
      summary: {},
      v2Categories: [],
      v1MustContinue: [],
      v2Differences: [],
      ownerReview: {},
    };
  }
  let brief = null;
  if (jsonPath) {
    brief = readJson(jsonPath, "V1/V2 scope brief JSON");
    if (brief?.scope !== "v1_v2_scope_brief") {
      throw new Error(`V1/V2 scope brief JSON has an unexpected shape: ${displayInputPath(jsonPath)}`);
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    status: stringValue(brief?.status),
    ready: Boolean(brief?.ready),
    summary: brief?.summary || {},
    v2Categories: stringList(brief?.v2Categories),
    v1MustContinue: stringList(brief?.v1MustContinue).slice(0, 12),
    v2Differences: stringList(brief?.v2Differences).slice(0, 20),
    ownerReview: brief?.ownerReview || {},
  };
}

function readProductionGoLiveStageChecklist({ jsonPath, markdownPath }) {
  if (!jsonPath && !markdownPath) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      status: "",
      ready: false,
      source: "",
      summary: {},
      stages: [],
    };
  }
  let checklist = null;
  if (jsonPath) {
    checklist = readJson(jsonPath, "V1 production go-live stage checklist JSON");
    if (!checklist?.summary || !Array.isArray(checklist?.stages)) {
      throw new Error(`V1 production go-live stage checklist JSON has an unexpected shape: ${displayInputPath(jsonPath)}`);
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    status: stringValue(checklist?.status),
    ready: Boolean(checklist?.ready),
    source: stringValue(checklist?.source),
    summary: checklist?.summary || {},
    stages: Array.isArray(checklist?.stages)
      ? checklist.stages.slice(0, 8).map((stage) => ({
          key: stringValue(stage.key),
          label: stringValue(stage.label),
          stageOrder: Number(stage.stageOrder || 0),
          status: stringValue(stage.status),
          ready: Boolean(stage.ready),
          sourceStatus: stringValue(stage.sourceStatus),
          sourceSummary: stringValue(stage.sourceSummary),
          ownerRole: stringValue(stage.ownerRole),
          blockingCount: Number(stage.blockingCount || 0),
          nextAction: stringValue(stage.nextAction),
          verificationSteps: stringList(stage.verificationSteps).slice(0, 5),
          evidenceToKeep: stringList(stage.evidenceToKeep).slice(0, 5),
        }))
      : [],
  };
}

function readProductionEnvSetup({ jsonPath, markdownPath }) {
  if (!jsonPath && !markdownPath) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      status: "",
      ready: false,
      setupReady: false,
      checkedAt: "",
      envFileSource: "",
      envFileSourceLabel: "",
      envFileFromProductionSetup: false,
      summary: {},
      envFile: {},
      audit: {},
      envPreflight: {},
      setupFindings: [],
      commands: [],
      nextActions: [],
      safeguards: {},
    };
  }
  let setup = null;
  if (jsonPath) {
    setup = readJson(jsonPath, "V1 production env setup JSON");
    if (setup?.scope !== "v1_production_env_setup" || !setup?.summary || !setup?.envFile) {
      throw new Error(`V1 production env setup JSON has an unexpected shape: ${displayInputPath(jsonPath)}`);
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    status: stringValue(setup?.status),
    ready: Boolean(setup?.ready),
    setupReady: Boolean(setup?.setupReady),
    checkedAt: stringValue(setup?.checkedAt),
    summary: setup?.summary || {},
    envFile: {
      path: setup?.envFile?.path ? redactedProductionEnvSetupEnvFileLabel : "",
      pathRedacted: Boolean(setup?.envFile?.path),
      pathExposed: false,
      insideWorkspace: Boolean(setup?.envFile?.insideWorkspace),
      gitIgnored: Boolean(setup?.envFile?.gitIgnored),
      gitTracked: Boolean(setup?.envFile?.gitTracked),
      existedBefore: Boolean(setup?.envFile?.existedBefore),
      generated: Boolean(setup?.envFile?.generated),
      overwritten: Boolean(setup?.envFile?.overwritten),
      fileMode: stringValue(setup?.envFile?.fileMode),
      assignmentCount: Number(setup?.envFile?.assignmentCount || 0),
      placeholderAssignmentCount: Number(setup?.envFile?.placeholderAssignmentCount || 0),
    },
    audit: setup?.audit && typeof setup.audit === "object" ? sanitizeObject(setup.audit) : {},
    envPreflight:
      setup?.envPreflight && typeof setup.envPreflight === "object"
        ? {
            status: stringValue(setup.envPreflight.status),
            ready: Boolean(setup.envPreflight.ready),
            passedCount: Number(setup.envPreflight.passedCount || 0),
            totalCount: Number(setup.envPreflight.totalCount || 0),
            blockingCount: Number(setup.envPreflight.blockingCount || 0),
            warningCount: Number(setup.envPreflight.warningCount || 0),
            remainingFixItems: Array.isArray(setup.envPreflight.remainingFixItems)
              ? setup.envPreflight.remainingFixItems.slice(0, 12).map((item) => ({
                  key: stringValue(item.key),
                  label: stringValue(item.label),
                  ownerRole: stringValue(item.ownerRole),
                  status: stringValue(item.status),
                  missingVariables: stringList(item.missingVariables),
                  placeholderVariables: stringList(item.placeholderVariables),
                  nextAction: stringValue(item.nextAction),
                }))
              : [],
          }
        : {},
    setupFindings: Array.isArray(setup?.setupFindings)
      ? setup.setupFindings.slice(0, 8).map((finding) => ({
          key: stringValue(finding.key),
          label: stringValue(finding.label),
          status: stringValue(finding.status),
          detail: stringValue(finding.detail),
        }))
      : [],
    commands: Array.isArray(setup?.commands)
      ? setup.commands.slice(0, 8).map((command) => ({
          key: stringValue(command.key),
          label: stringValue(command.label),
          command: stringValue(command.command),
        }))
      : [],
    nextActions: stringList(setup?.nextActions).slice(0, 10),
    safeguards: {
      ...(setup?.safeguards && typeof setup.safeguards === "object" ? sanitizeBooleanObject(setup.safeguards) : {}),
      envFilePathExposed: false,
    },
  };
}

function redactProductionEnvSetupReport(setup) {
  const originalPath = stringValue(setup?.envFile?.path).trim();
  const copy = sanitizeObject(setup || {});
  if (copy.envFile && typeof copy.envFile === "object") {
    if (originalPath) copy.envFile.path = redactedProductionEnvSetupEnvFileLabel;
    copy.envFile.pathRedacted = Boolean(originalPath);
    copy.envFile.pathExposed = false;
  }
  if (!copy.safeguards || typeof copy.safeguards !== "object" || Array.isArray(copy.safeguards)) copy.safeguards = {};
  copy.safeguards.envFilePathExposed = false;
  return redactProductionEnvSetupSensitiveStrings(copy, originalPath);
}

function redactProductionEnvSetupSensitiveStrings(value, originalPath) {
  if (!originalPath) return value;
  if (Array.isArray(value)) return value.map((item) => redactProductionEnvSetupSensitiveStrings(item, originalPath));
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = redactProductionEnvSetupSensitiveStrings(item, originalPath);
    }
    return result;
  }
  if (typeof value === "string") return value.split(originalPath).join(redactedProductionEnvSetupEnvFileLabel);
  return value;
}

function redactProductionEnvSetupMarkdown(markdown, setup) {
  const originalPath = stringValue(setup?.envFile?.path).trim();
  let output = stringValue(markdown);
  if (originalPath) output = output.split(originalPath).join(redactedProductionEnvSetupEnvFileLabel);
  output = output.replace(
    /(-\s*路径：)([^\n（]+)(?:（路径已脱敏）)?/g,
    `$1${redactedProductionEnvSetupEnvFileLabel}（路径已脱敏）`,
  );
  return output;
}

function readProductionEnvIntakeVerification({ jsonPath, markdownPath }) {
  if (!jsonPath && !markdownPath) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      status: "",
      ready: false,
      checkedAt: "",
      summary: {},
      alternativeGroups: [],
      minimumBlockingItems: [],
      blockingFindings: [],
      warningFindings: [],
      nextActions: [],
      safeguards: {},
    };
  }
  let verification = null;
  if (jsonPath) {
    verification = readJson(jsonPath, "V1 production env intake verification JSON");
    const allowedScopes = new Set([
      "v1_production_env_real_value_intake_verification",
      "v1_production_env_intake_verify",
    ]);
    if (!allowedScopes.has(verification?.scope) || !verification?.summary) {
      throw new Error(
        `V1 production env intake verification JSON has an unexpected shape: ${displayInputPath(jsonPath)}`,
      );
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    status: stringValue(verification?.status),
    ready: Boolean(verification?.ready),
    checkedAt: stringValue(verification?.checkedAt),
    summary: verification?.summary && typeof verification.summary === "object" ? sanitizeObject(verification.summary) : {},
    alternativeGroups: Array.isArray(verification?.alternativeGroups)
      ? verification.alternativeGroups.slice(0, 6).map(sanitizeProductionEnvIntakeFinding)
      : [],
    minimumBlockingItems: buildProductionEnvMinimumBlockingItems(verification),
    blockingFindings: Array.isArray(verification?.blockingFindings)
      ? verification.blockingFindings.slice(0, 12).map(sanitizeProductionEnvIntakeFinding)
      : [],
    warningFindings: Array.isArray(verification?.warningFindings)
      ? verification.warningFindings.slice(0, 8).map(sanitizeProductionEnvIntakeFinding)
      : [],
    nextActions: stringList(verification?.nextActions).slice(0, 8),
    safeguards:
      verification?.safeguards && typeof verification.safeguards === "object"
        ? sanitizeBooleanObject(verification.safeguards)
        : {},
  };
}

function buildProductionEnvMinimumBlockingItems(verification) {
  if (!verification || typeof verification !== "object") return [];
  const targetCount = numberOrZero(verification.summary?.minimumBlockingTargetCount);
  const sourceItems = Array.isArray(verification.minimumBlockingItems)
    ? verification.minimumBlockingItems
    : Array.isArray(verification.blockingFindings)
      ? verification.blockingFindings.filter((finding) =>
          finding?.severity === "blocking" &&
          (finding?.type === "alternative_group" || finding?.type === "variable_row")
        )
      : [];
  return sourceItems
    .slice(0, targetCount || 12)
    .map(sanitizeProductionEnvIntakeFinding)
    .filter((finding) => finding.label || finding.variableKey || finding.alternativeGroup || finding.variables.length);
}

function sanitizeProductionEnvIntakeFinding(finding) {
  return {
    type: stringValue(finding?.type),
    key: stringValue(finding?.key),
    itemKey: stringValue(finding?.itemKey),
    label: stringValue(finding?.label),
    ownerRole: stringValue(finding?.ownerRole),
    severity: stringValue(finding?.severity),
    status: stringValue(finding?.status),
    variableKey: stringValue(finding?.variableKey),
    alternativeGroup: stringValue(finding?.alternativeGroup),
    variables: stringList(finding?.variables),
    configured: Boolean(finding?.configured),
    configuredKeyCount: Number(finding?.configuredKeyCount || 0),
    sourceSystem: stringValue(finding?.sourceSystem),
    expectedValueType: stringValue(finding?.expectedValueType),
    filledMarked: Boolean(finding?.filledMarked),
    verifiedMarked: Boolean(finding?.verifiedMarked),
    evidenceRefProvided: Boolean(finding?.evidenceRefProvided),
    rawEvidenceRefIncluded: Boolean(finding?.rawEvidenceRefIncluded),
    detail: stringValue(finding?.detail),
    nextAction: stringValue(finding?.nextAction),
  };
}

function formatProductionEnvIntakeFindingVariable(finding) {
  return finding.variableKey || finding.alternativeGroup || finding.variables.join(", ") || "无";
}

function sanitizeProductionEnvValuesDryRunCoverage(coverage) {
  return {
    included: coverage?.included === true,
    stageStatus: stringValue(coverage?.stageStatus),
    checkedAt: stringValue(coverage?.checkedAt),
    targetWouldBeWritten: coverage?.targetWouldBeWritten === true,
    envPreflightReady: coverage?.envPreflightReady === true,
    envPreflightPassedCount: numberOrZero(coverage?.envPreflightPassedCount),
    envPreflightTotalCount: numberOrZero(coverage?.envPreflightTotalCount),
    envPreflightBlockingCount: numberOrZero(coverage?.envPreflightBlockingCount),
    intakeConfiguredRowCount: numberOrZero(coverage?.intakeConfiguredRowCount),
    intakeRowCount: numberOrZero(coverage?.intakeRowCount),
    intakeMissingRequiredVariableCount: numberOrZero(coverage?.intakeMissingRequiredVariableCount),
    intakeAlternativeGroupBlockingCount: numberOrZero(coverage?.intakeAlternativeGroupBlockingCount),
    minimumBlockingReady: coverage?.minimumBlockingReady === true,
    minimumBlockingSatisfiedCount: numberOrZero(coverage?.minimumBlockingSatisfiedCount),
    minimumBlockingTargetCount: numberOrZero(coverage?.minimumBlockingTargetCount),
    minimumBlockingMissingCount: numberOrZero(coverage?.minimumBlockingMissingCount),
    minimumBlockingVariableRowCount: numberOrZero(coverage?.minimumBlockingVariableRowCount),
    minimumBlockingAlternativeGroupCount: numberOrZero(coverage?.minimumBlockingAlternativeGroupCount),
    minimumBlockingTargetSignature: stringValue(coverage?.minimumBlockingTargetSignature),
    minimumWarningReady: coverage?.minimumWarningReady === true,
    minimumWarningSatisfiedCount: numberOrZero(coverage?.minimumWarningSatisfiedCount),
    minimumWarningTargetCount: numberOrZero(coverage?.minimumWarningTargetCount),
    minimumWarningMissingCount: numberOrZero(coverage?.minimumWarningMissingCount),
    minimumWarningTargetSignature: stringValue(coverage?.minimumWarningTargetSignature),
  };
}

function getProductionEnvValuesDryRunProofMaxAgeHours(env = process.env) {
  const rawValue = stringValue(env?.[productionEnvValuesDryRunProofMaxAgeHoursEnvName]);
  if (!rawValue) return defaultProductionEnvValuesDryRunProofMaxAgeHours;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultProductionEnvValuesDryRunProofMaxAgeHours;
  return parsed;
}

function buildProductionEnvValuesDryRunFreshness({ checkedAt = "", now = "", maxAgeHours = null } = {}) {
  const normalizedMaxAgeHours =
    maxAgeHours === null || maxAgeHours === undefined
      ? getProductionEnvValuesDryRunProofMaxAgeHours()
      : Number(maxAgeHours);
  const effectiveMaxAgeHours =
    Number.isFinite(normalizedMaxAgeHours) && normalizedMaxAgeHours >= 0
      ? normalizedMaxAgeHours
      : defaultProductionEnvValuesDryRunProofMaxAgeHours;
  const checkedAtText = stringValue(checkedAt);
  if (effectiveMaxAgeHours <= 0) {
    return {
      status: "disabled",
      ready: true,
      checkedAt: checkedAtText,
      checkedAtIncluded: Boolean(checkedAtText),
      maxAgeHours: 0,
      ageHours: null,
      expiresAt: "",
      remainingHours: null,
      label: "dry-run 新鲜度门禁已关闭",
      nextAction: "负责人已关闭 dry-run 新鲜度门禁；仍需确认 dry-run 匹配当前最小补值路径。",
    };
  }
  const checkedAtMs = checkedAtText ? Date.parse(checkedAtText) : NaN;
  const nowMs = Date.parse(stringValue(now)) || Date.now();
  const validCheckedAt = Number.isFinite(checkedAtMs);
  const ageHours = validCheckedAt ? Math.max(0, (nowMs - checkedAtMs) / 3600000) : null;
  const expiresAtMs = validCheckedAt ? checkedAtMs + effectiveMaxAgeHours * 3600000 : NaN;
  const remainingHours = validCheckedAt ? Math.max(0, (expiresAtMs - nowMs) / 3600000) : null;
  const ready = validCheckedAt && ageHours <= effectiveMaxAgeHours;
  const status = ready ? "fresh" : validCheckedAt ? "stale" : "missing";
  return {
    status,
    ready,
    checkedAt: checkedAtText,
    checkedAtIncluded: Boolean(checkedAtText),
    maxAgeHours: effectiveMaxAgeHours,
    ageHours: ageHours === null ? null : Number(ageHours.toFixed(2)),
    expiresAt: Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : "",
    remainingHours: remainingHours === null ? null : Number(remainingHours.toFixed(2)),
    label: ready
      ? `dry-run 证明在 ${effectiveMaxAgeHours} 小时内`
      : validCheckedAt
        ? `dry-run 证明超过 ${effectiveMaxAgeHours} 小时`
        : "dry-run 证明缺少检查时间",
    nextAction: ready
      ? "dry-run 证明仍在有效时间窗口内。"
      : "重新执行真实值 dry-run，刷新上线交接包后再正式合并。",
  };
}

function readProductionFirstStageExecution({ jsonPath, markdownPath }) {
  if (!jsonPath && !markdownPath) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      status: "",
      ready: false,
      checkedAt: "",
      summary: {},
      execution: {},
      stages: [],
      blockingStages: [],
      safeguards: {},
      nextActions: [],
    };
  }
  let execution = null;
  if (jsonPath) {
    execution = readJson(jsonPath, "V1 production first-stage execution JSON");
    if (execution?.scope !== "v1_production_first_stage_execution" || !execution?.summary || !Array.isArray(execution?.stages)) {
      throw new Error(`V1 production first-stage execution JSON has an unexpected shape: ${displayInputPath(jsonPath)}`);
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    status: stringValue(execution?.status),
    ready: Boolean(execution?.ready),
    checkedAt: stringValue(execution?.checkedAt),
    summary: execution?.summary || {},
    productionEnvValuesDryRunCoverage: sanitizeProductionEnvValuesDryRunCoverage(
      execution?.summary?.productionEnvValuesDryRunCoverage,
    ),
    execution: {
      envFileCount: Number(execution?.execution?.envFileCount || 0),
      planOnly: Boolean(execution?.execution?.planOnly),
      applyMigrations: Boolean(execution?.execution?.applyMigrations),
      migrationApplyRequiresExplicitFlag: execution?.execution?.migrationApplyRequiresExplicitFlag !== false,
    },
    stages: Array.isArray(execution?.stages)
      ? execution.stages.slice(0, 8).map((stage) => ({
          key: stringValue(stage.key),
          label: stringValue(stage.label),
          status: stringValue(stage.status),
          detail: stringValue(stage.detail),
          command: stringValue(stage.command),
          nextActions: stringList(stage.nextActions).slice(0, 5),
          evidence: {
            reportParsed: Boolean(stage.evidence?.reportParsed),
            reportStatus: stringValue(stage.evidence?.reportStatus),
            reportReady: stage.evidence?.reportReady === undefined ? null : Boolean(stage.evidence.reportReady),
            summaryLabel: stringValue(stage.evidence?.summaryLabel),
            passedCount: Number(stage.evidence?.passedCount || 0),
            totalCount: Number(stage.evidence?.totalCount || 0),
            blockingCount: Number(stage.evidence?.blockingCount || 0),
            scope: stringValue(stage.evidence?.scope),
          },
        }))
      : [],
    blockingStages: Array.isArray(execution?.blockingStages)
      ? execution.blockingStages.slice(0, 5).map((stage) => ({
          key: stringValue(stage.key),
          label: stringValue(stage.label),
          status: stringValue(stage.status),
          detail: stringValue(stage.detail),
        }))
      : [],
    safeguards:
      execution?.safeguards && typeof execution.safeguards === "object"
        ? {
            envValuesExposed: execution.safeguards.envValuesExposed === true,
            databaseUrlExposed: execution.safeguards.databaseUrlExposed === true,
            objectStorageEndpointExposed: execution.safeguards.objectStorageEndpointExposed === true,
            objectStorageBucketExposed: execution.safeguards.objectStorageBucketExposed === true,
            secretFieldsExposed: execution.safeguards.secretFieldsExposed === true,
            objectKeyExposed: execution.safeguards.objectKeyExposed === true,
            signedUrlExposed: execution.safeguards.signedUrlExposed === true,
            physicalPrinterCalled: execution.safeguards.physicalPrinterCalled === true,
            businessDataMutated: execution.safeguards.businessDataMutated === true,
            schemaMigrationApplyExecuted: execution.safeguards.schemaMigrationApplyExecuted === true,
            declaresFullV1Complete: execution.safeguards.declaresFullV1Complete === true,
          }
        : {},
    nextActions: stringList(execution?.nextActions).slice(0, 8),
  };
}

function readProductionPersistenceEvidence({ jsonPath, markdownPath }) {
  if (!jsonPath && !markdownPath) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      status: "",
      ready: false,
      checkedAt: "",
      summary: {},
      stages: [],
      blockingStages: [],
      safeguards: {},
      nextActions: [],
    };
  }
  let evidence = null;
  if (jsonPath) {
    evidence = readJson(jsonPath, "V1 production persistence evidence JSON");
    if (evidence?.scope !== "v1_production_persistence_evidence" || !evidence?.summary || !Array.isArray(evidence?.stages)) {
      throw new Error(`V1 production persistence evidence JSON has an unexpected shape: ${displayInputPath(jsonPath)}`);
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    status: stringValue(evidence?.status),
    ready: Boolean(evidence?.ready),
    checkedAt: stringValue(evidence?.checkedAt),
    summary: evidence?.summary && typeof evidence.summary === "object" ? sanitizeObject(evidence.summary) : {},
    stages: Array.isArray(evidence?.stages) ? evidence.stages.slice(0, 8).map(sanitizeProductionEvidenceStage) : [],
    blockingStages: Array.isArray(evidence?.blockingStages)
      ? evidence.blockingStages.slice(0, 8).map(sanitizeProductionEvidenceStage)
      : [],
    safeguards:
      evidence?.safeguards && typeof evidence.safeguards === "object"
        ? sanitizeBooleanObject(evidence.safeguards)
        : {},
    nextActions: stringList(evidence?.nextActions).slice(0, 10),
  };
}

function readProductionRuntimeSmoke({ jsonPath, markdownPath }) {
  if (!jsonPath && !markdownPath) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      status: "",
      ready: false,
      checkedAt: "",
      summary: {},
      runtime: {},
      stages: [],
      blockingStages: [],
      safeguards: {},
      nextActions: [],
    };
  }
  let smoke = null;
  if (jsonPath) {
    smoke = readJson(jsonPath, "V1 production runtime-smoke JSON");
    if (smoke?.scope !== "v1_production_runtime_smoke" || !smoke?.summary || !Array.isArray(smoke?.stages)) {
      throw new Error(`V1 production runtime-smoke JSON has an unexpected shape: ${displayInputPath(jsonPath)}`);
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    status: stringValue(smoke?.status),
    ready: Boolean(smoke?.ready),
    checkedAt: stringValue(smoke?.checkedAt),
    envFileSource: stringValue(smoke?.envFileSource),
    envFileSourceLabel: stringValue(smoke?.envFileSourceLabel),
    envFileFromProductionSetup: smoke?.envFileFromProductionSetup === true,
    summary: smoke?.summary && typeof smoke.summary === "object" ? sanitizeObject(smoke.summary) : {},
    runtime: {
      runtimeMode: stringValue(smoke?.runtime?.runtimeMode),
      externalApiProbed: smoke?.runtime?.externalApiProbed === true,
      productionEnvFileApplied: smoke?.runtime?.productionEnvFileApplication?.applied === true,
      repositoryProfile: stringValue(smoke?.runtime?.repositoryProfile?.repositoryProfile),
      attachmentObjectStorageKind: stringValue(smoke?.runtime?.storageProfile?.attachmentObjectStorageKind),
      statementExportObjectStorageKind: stringValue(smoke?.runtime?.storageProfile?.statementExportObjectStorageKind),
      systemReadinessStatus: stringValue(smoke?.runtime?.systemReadiness?.status),
      systemReadinessSummaryLabel: stringValue(smoke?.runtime?.systemReadiness?.summaryLabel),
    },
    stages: Array.isArray(smoke?.stages) ? smoke.stages.slice(0, 6).map(sanitizeProductionEvidenceStage) : [],
    blockingStages: Array.isArray(smoke?.blockingStages)
      ? smoke.blockingStages.slice(0, 6).map(sanitizeProductionEvidenceStage)
      : [],
    safeguards:
      smoke?.safeguards && typeof smoke.safeguards === "object" ? sanitizeBooleanObject(smoke.safeguards) : {},
    nextActions: stringList(smoke?.nextActions).slice(0, 8),
  };
}

function sanitizeProductionEvidenceStage(stage) {
  return {
    key: stringValue(stage?.key),
    label: stringValue(stage?.label),
    status: stringValue(stage?.status),
    ready: stage?.ready === undefined ? stage?.status === "passed" : Boolean(stage.ready),
    detail: stringValue(stage?.detail),
    nextActions: stringList(stage?.nextActions).slice(0, 5),
    summary: stage?.summary && typeof stage.summary === "object" ? sanitizeObject(stage.summary) : {},
  };
}

function readProductionFirstStageEvidenceSuggestions({ jsonPath, markdownPath, csvPath }) {
  if (!jsonPath && !markdownPath && !csvPath) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      csvPath: "",
      status: "",
      ready: false,
      generatedAt: "",
      summary: {},
      sourceReports: {},
      suggestions: [],
      nextActions: [],
      safeguards: {},
    };
  }
  let suggestions = null;
  if (jsonPath) {
    suggestions = readJson(jsonPath, "V1 production first-stage evidence suggestions JSON");
    if (suggestions?.scope !== "v1_production_first_stage_evidence_suggestions" || !suggestions?.summary) {
      throw new Error(
        `V1 production first-stage evidence suggestions JSON has an unexpected shape: ${displayInputPath(jsonPath)}`,
      );
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    csvPath: csvPath || "",
    status: stringValue(suggestions?.status),
    ready: Boolean(suggestions?.ready),
    generatedAt: stringValue(suggestions?.generatedAt),
    summary: suggestions?.summary && typeof suggestions.summary === "object" ? sanitizeObject(suggestions.summary) : {},
    sourceReports:
      suggestions?.sourceReports && typeof suggestions.sourceReports === "object"
        ? sanitizeObject(suggestions.sourceReports)
        : {},
    suggestions: Array.isArray(suggestions?.suggestions)
      ? suggestions.suggestions.slice(0, 12).map((item) => ({
          groupKey: stringValue(item.groupKey),
          itemKey: stringValue(item.itemKey),
          itemLabel: stringValue(item.itemLabel),
          coverage: stringValue(item.coverage),
          status: stringValue(item.status),
          evidenceRefSuggested: Boolean(item.evidenceRefSuggested),
          noteSuggested: Boolean(item.noteSuggested),
        }))
      : [],
    nextActions: stringList(suggestions?.nextActions).slice(0, 8),
    safeguards:
      suggestions?.safeguards && typeof suggestions.safeguards === "object"
        ? sanitizeBooleanObject(suggestions.safeguards)
        : {},
  };
}

function readDriverRealDeviceExecution({ jsonPath, markdownPath }) {
  if (!jsonPath && !markdownPath) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      status: "",
      ready: false,
      checkedAt: "",
      summary: {},
      execution: {},
      stages: [],
      blockingStages: [],
      safeguards: {},
      nextActions: [],
    };
  }
  let execution = null;
  if (jsonPath) {
    execution = readJson(jsonPath, "V1 driver real-device execution JSON");
    if (execution?.scope !== "v1_driver_real_device_execution" || !execution?.summary || !Array.isArray(execution?.stages)) {
      throw new Error(`V1 driver real-device execution JSON has an unexpected shape: ${displayInputPath(jsonPath)}`);
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    status: stringValue(execution?.status),
    ready: Boolean(execution?.ready),
    checkedAt: stringValue(execution?.checkedAt),
    summary: execution?.summary || {},
    execution: {
      planOnly: Boolean(execution?.execution?.planOnly),
      driverOperatorId: stringValue(execution?.execution?.driverOperatorId),
      fieldEvidenceManifestIncluded: Boolean(execution?.execution?.fieldEvidenceManifestIncluded),
      actualArtifactPathsIncluded: Boolean(execution?.execution?.actualArtifactPathsIncluded),
      closeoutCoversOnlyDriverStage: execution?.execution?.closeoutCoversOnlyDriverStage !== false,
      outputDirIncluded: Boolean(execution?.execution?.outputDirIncluded),
    },
    stages: Array.isArray(execution?.stages)
      ? execution.stages.slice(0, 8).map(sanitizeDriverExecutionStage)
      : [],
    blockingStages: Array.isArray(execution?.blockingStages)
      ? execution.blockingStages.slice(0, 5).map(sanitizeDriverExecutionStage)
      : [],
    safeguards: execution?.safeguards && typeof execution.safeguards === "object" ? sanitizeBooleanObject(execution.safeguards) : {},
    nextActions: stringList(execution?.nextActions).slice(0, 8),
  };
}

function sanitizeDriverExecutionStage(stage) {
  return {
    key: stringValue(stage?.key),
    label: stringValue(stage?.label),
    status: stringValue(stage?.status),
    detail: stringValue(stage?.detail),
    command: stringValue(stage?.command),
    exitCode: Number(stage?.exitCode ?? 0),
    nextActions: stringList(stage?.nextActions).slice(0, 5),
    evidence: {
      reportParsed: Boolean(stage?.evidence?.reportParsed),
      reportStatus: stringValue(stage?.evidence?.reportStatus),
      reportReady: stage?.evidence?.reportReady === undefined ? null : Boolean(stage.evidence.reportReady),
      summaryLabel: stringValue(stage?.evidence?.summaryLabel),
      passedCount: Number(stage?.evidence?.passedCount || 0),
      totalCount: Number(stage?.evidence?.totalCount || 0),
      blockingCount: Number(stage?.evidence?.blockingCount || 0),
      scope: stringValue(stage?.evidence?.scope),
      nativeSupportedLabel: stringValue(stage?.evidence?.nativeSupportedLabel),
      packageLabelScanMethod: stringValue(stage?.evidence?.packageLabelScanMethod),
      packageLabelScanResult: stringValue(stage?.evidence?.packageLabelScanResult),
      driverNativeEvidenceStatus: stringValue(stage?.evidence?.driverNativeEvidenceStatus),
      driverNativeEvidenceCompleted: Number(stage?.evidence?.driverNativeEvidenceCompleted || 0),
      driverNativeEvidenceRequired: Number(stage?.evidence?.driverNativeEvidenceRequired || 0),
      rawReadinessReportIncluded: stage?.evidence?.rawReadinessReportIncluded === true,
      scanTextIncluded: stage?.evidence?.scanTextIncluded === true,
      photoPayloadIncluded: stage?.evidence?.photoPayloadIncluded === true,
      geoPointIncluded: stage?.evidence?.geoPointIncluded === true,
      rawEvidenceRefsIncluded: stage?.evidence?.rawEvidenceRefsIncluded === true,
    },
  };
}

function readPrintChainExecution({ jsonPath, markdownPath }) {
  if (!jsonPath && !markdownPath) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      status: "",
      ready: false,
      checkedAt: "",
      summary: {},
      execution: {},
      stages: [],
      blockingStages: [],
      safeguards: {},
      nextActions: [],
    };
  }
  let execution = null;
  if (jsonPath) {
    execution = readJson(jsonPath, "V1 print-chain execution JSON");
    if (execution?.scope !== "v1_print_chain_execution" || !execution?.summary || !Array.isArray(execution?.stages)) {
      throw new Error(`V1 print-chain execution JSON has an unexpected shape: ${displayInputPath(jsonPath)}`);
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    status: stringValue(execution?.status),
    ready: Boolean(execution?.ready),
    checkedAt: stringValue(execution?.checkedAt),
    summary: execution?.summary || {},
    execution: {
      planOnly: Boolean(execution?.execution?.planOnly),
      operatorId: stringValue(execution?.execution?.operatorId),
      fieldEvidenceManifestIncluded: Boolean(execution?.execution?.fieldEvidenceManifestIncluded),
      actualArtifactPathsIncluded: Boolean(execution?.execution?.actualArtifactPathsIncluded),
      standaloneCupsPreflightRequired: execution?.execution?.standaloneCupsPreflightRequired !== false,
      closeoutCoversOnlyPrintStage: execution?.execution?.closeoutCoversOnlyPrintStage !== false,
      outputDirIncluded: Boolean(execution?.execution?.outputDirIncluded),
    },
    stages: Array.isArray(execution?.stages)
      ? execution.stages.slice(0, 8).map(sanitizePrintExecutionStage)
      : [],
    blockingStages: Array.isArray(execution?.blockingStages)
      ? execution.blockingStages.slice(0, 5).map(sanitizePrintExecutionStage)
      : [],
    safeguards: execution?.safeguards && typeof execution.safeguards === "object" ? sanitizeBooleanObject(execution.safeguards) : {},
    nextActions: stringList(execution?.nextActions).slice(0, 8),
  };
}

function sanitizePrintExecutionStage(stage) {
  return {
    key: stringValue(stage?.key),
    label: stringValue(stage?.label),
    status: stringValue(stage?.status),
    detail: stringValue(stage?.detail),
    command: stringValue(stage?.command),
    exitCode: Number(stage?.exitCode ?? 0),
    nextActions: stringList(stage?.nextActions).slice(0, 5),
    evidence: {
      reportParsed: Boolean(stage?.evidence?.reportParsed),
      reportStatus: stringValue(stage?.evidence?.reportStatus),
      reportReady: stage?.evidence?.reportReady === undefined ? null : Boolean(stage.evidence.reportReady),
      summaryLabel: stringValue(stage?.evidence?.summaryLabel),
      passedCount: Number(stage?.evidence?.passedCount || 0),
      totalCount: Number(stage?.evidence?.totalCount || 0),
      blockingCount: Number(stage?.evidence?.blockingCount || 0),
      scope: stringValue(stage?.evidence?.scope),
      cupsPrinterConfigured: stage?.evidence?.cupsPrinterConfigured === true,
      cupsPrinterAllowed: stage?.evidence?.cupsPrinterAllowed === true,
      cupsStatusCommandRunnable: stage?.evidence?.cupsStatusCommandRunnable === true,
      cupsReady: stage?.evidence?.cupsReady === true,
      blockingCriteriaCount: Number(stage?.evidence?.blockingCriteriaCount || 0),
      printHardwareEvidenceStatus: stringValue(stage?.evidence?.printHardwareEvidenceStatus),
      printHardwareEvidenceCompleted: Number(stage?.evidence?.printHardwareEvidenceCompleted || 0),
      printHardwareEvidenceRequired: Number(stage?.evidence?.printHardwareEvidenceRequired || 0),
      nonPrinting: stage?.evidence?.nonPrinting !== false,
      physicalPrinterCalled: stage?.evidence?.physicalPrinterCalled === true,
      printFileCreated: stage?.evidence?.printFileCreated === true,
      rawReadinessReportIncluded: stage?.evidence?.rawReadinessReportIncluded === true,
      rawEvidenceRefsIncluded: stage?.evidence?.rawEvidenceRefsIncluded === true,
      rawStdoutIncluded: stage?.evidence?.rawStdoutIncluded === true,
      rawStderrIncluded: stage?.evidence?.rawStderrIncluded === true,
    },
  };
}

function readStageCloseout({ jsonPath, markdownPath, expectedScope, label }) {
  if (!jsonPath && !markdownPath) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      status: "",
      ready: false,
      checkedAt: "",
      summary: {},
      stages: [],
      blockingStages: [],
      safeguards: {},
      nextActions: [],
    };
  }
  let closeout = null;
  if (jsonPath) {
    closeout = readJson(jsonPath, `${label} JSON`);
    if (closeout?.scope !== expectedScope || !closeout?.summary || !Array.isArray(closeout?.stages)) {
      throw new Error(`${label} JSON has an unexpected shape: ${displayInputPath(jsonPath)}`);
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    status: stringValue(closeout?.status),
    ready: Boolean(closeout?.ready),
    checkedAt: stringValue(closeout?.checkedAt),
    summary: closeout?.summary || {},
    stages: Array.isArray(closeout?.stages) ? closeout.stages.slice(0, 8).map(sanitizeCloseoutStage) : [],
    blockingStages: Array.isArray(closeout?.blockingStages)
      ? closeout.blockingStages.slice(0, 5).map(sanitizeCloseoutStage)
      : [],
    safeguards: closeout?.safeguards && typeof closeout.safeguards === "object" ? sanitizeBooleanObject(closeout.safeguards) : {},
    nextActions: stringList(closeout?.nextActions).slice(0, 8),
  };
}

function sanitizeCloseoutStage(stage) {
  return {
    key: stringValue(stage?.key),
    label: stringValue(stage?.label),
    status: stringValue(stage?.status),
    ready: Boolean(stage?.ready),
    detail: stringValue(stage?.detail),
    summary: stage?.summary || {},
    nextAction: stringValue(stage?.nextAction || stage?.nextActions?.[0]),
  };
}

function sanitizeBooleanObject(value) {
  const result = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (typeof item === "boolean") result[key] = item;
  }
  return result;
}

function sanitizeObject(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeObject(item));
  if (typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = sanitizeObject(item);
    return result;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  return stringValue(value);
}

function readUnblockPlan({ jsonPath, markdownPath }) {
  if (!jsonPath && !markdownPath) {
    return {
      included: false,
      jsonPath: "",
      markdownPath: "",
      status: "",
      ready: false,
      summary: {},
      phases: [],
      firstActions: [],
      roleBuckets: [],
    };
  }
  let plan = null;
  if (jsonPath) {
    plan = readJson(jsonPath, "V1 unblock plan JSON");
    if (!plan?.summary || !Array.isArray(plan?.phases)) {
      throw new Error(`V1 unblock plan JSON has an unexpected shape: ${displayInputPath(jsonPath)}`);
    }
  }
  return {
    included: true,
    jsonPath: jsonPath || "",
    markdownPath: markdownPath || "",
    status: stringValue(plan?.status),
    ready: Boolean(plan?.ready),
    summary: plan?.summary || {},
    phases: Array.isArray(plan?.phases)
      ? plan.phases.slice(0, 12).map((phase) => ({
          key: stringValue(phase.key),
          label: stringValue(phase.label),
          taskCount: Number(phase.taskCount || 0),
          releaseTaskCount: Number(phase.releaseTaskCount || 0),
          evidenceTaskCount: Number(phase.evidenceTaskCount || 0),
          signoffTaskCount: Number(phase.signoffTaskCount || 0),
          boundaryTaskCount: Number(phase.boundaryTaskCount || 0),
          roles: stringList(phase.roles),
          nextStep: stringValue(phase.nextStep),
        }))
      : [],
    firstActions: Array.isArray(plan?.firstActions)
      ? plan.firstActions.slice(0, 10).map((task) => ({
          type: stringValue(task.type),
          primaryRole: stringValue(task.primaryRole),
          group: stringValue(task.group),
          title: stringValue(task.title),
          status: stringValue(task.status),
          action: stringValue(task.action),
        }))
      : [],
    roleBuckets: Array.isArray(plan?.roleBuckets)
      ? plan.roleBuckets.map((bucket) => ({
          role: stringValue(bucket.role),
          taskCount: Number(bucket.taskCount || 0),
          p0TaskCount: Number(bucket.p0TaskCount || 0),
        }))
      : [],
  };
}

function readJson(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} is missing: ${displayInputPath(path)}`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} is not readable JSON: ${displayInputPath(path)}`);
  }
}

function buildHandoffReport({
  releaseCandidate,
  releaseCandidateJsonPath,
  releaseCandidateMarkdownPath,
  fieldEvidence,
  onsiteTaskBoard,
  completionSnapshot,
  fieldEvidenceIntake,
  ownerDecisionBrief,
  v1V2ScopeBrief,
  productionGoLiveStageChecklist,
  productionEnvSetup,
  productionEnvIntakeVerification,
  productionFirstStageExecution,
  productionFirstStageEvidenceSuggestions,
  productionPersistenceEvidence,
  productionRuntimeSmoke,
  printChainCloseout,
  printChainExecution,
  driverRealDeviceExecution,
  driverRealDeviceCloseout,
  unblockPlan,
  docs,
  includeRawFieldEvidence,
}) {
  const gates = Array.isArray(releaseCandidate.gates) ? releaseCandidate.gates : [];
  const blockingItems = Array.isArray(releaseCandidate.blockingItems) ? releaseCandidate.blockingItems : [];
  const productionEnvFixChecklist = buildProductionEnvFixChecklist(releaseCandidate.envPreflight);
  const generatedAt = new Date().toISOString();
  const productionEnvValueIntakeChecklist = buildProductionEnvValueIntakeChecklist(productionEnvFixChecklist, generatedAt);
  const productionEnvMinimumValueIntakeChecklist = buildProductionEnvMinimumValueIntakeChecklist(
    productionEnvValueIntakeChecklist,
  );
  const productionEnvMinimumValuesFragmentTemplate = buildProductionEnvMinimumValuesFragmentTemplate(
    productionEnvValueIntakeChecklist,
  );
  const productionEnvValuesFragmentTemplate = buildProductionEnvValuesFragmentTemplate(
    productionEnvValueIntakeChecklist,
  );
  const productionEnvValueExecutionPlan = buildProductionEnvValueExecutionPlan({
    productionEnvMinimumValuesFragmentTemplate,
    productionEnvValuesFragmentTemplate,
    productionEnvIntakeVerification,
    productionFirstStageExecution,
    generatedAt,
  });
  const productionEnvSetupReady = !productionEnvSetup.included || productionEnvSetup.setupReady;
  const firstStageExecutionReady = !productionFirstStageExecution.included || productionFirstStageExecution.ready;
  const productionPersistenceEvidenceReady =
    !productionPersistenceEvidence.included || productionPersistenceEvidence.ready;
  const productionRuntimeSmokeReady = !productionRuntimeSmoke.included || productionRuntimeSmoke.ready;
  const stageCloseoutsReady =
    (!printChainExecution.included || printChainExecution.ready) &&
    (!printChainCloseout.included || printChainCloseout.ready) &&
    (!driverRealDeviceExecution.included || driverRealDeviceExecution.ready) &&
    (!driverRealDeviceCloseout.included || driverRealDeviceCloseout.ready);
  const ready = Boolean(
    releaseCandidate.ready &&
      fieldEvidence.validation.ready &&
      productionEnvSetupReady &&
      firstStageExecutionReady &&
      productionPersistenceEvidenceReady &&
      productionRuntimeSmokeReady &&
      stageCloseoutsReady,
  );
  return {
    scope: "v1_go_live_handoff_pack",
    status: ready ? "ready_handoff_written" : "blocked_handoff_written",
    ready,
    generatedAt,
    conclusion: ready
      ? "V1 发布候选和现场证据 manifest 均为 READY；该交接包可进入负责人复核和小范围真实订单试运行。"
      : "V1 仍不能声明完成；该交接包用于现场部署、证据补齐、负责人复核和继续解除阻塞。",
    releaseCandidate: {
      path: displayInputPath(releaseCandidateJsonPath),
      markdownPath: releaseCandidateMarkdownPath ? displayInputPath(releaseCandidateMarkdownPath) : "",
      status: stringValue(releaseCandidate.status),
      ready: Boolean(releaseCandidate.ready),
      generatedAt: stringValue(releaseCandidate.generatedAt),
      conclusion: stringValue(releaseCandidate.conclusion),
      summary: releaseCandidate.summary || {},
      gates: gates.map((gate) => ({
        key: stringValue(gate.key),
        label: stringValue(gate.label),
        status: stringValue(gate.status),
        ready: Boolean(gate.ready),
        summary: stringValue(gate.summary),
        detail: stringValue(gate.detail),
      })),
      blockingItems: blockingItems.slice(0, 20).map((item) => ({
        gate: stringValue(item.gate),
        label: stringValue(item.label),
        status: stringValue(item.status),
        detail: stringValue(item.detail),
      })),
    },
    productionEnvFixChecklist,
    productionEnvValueIntakeChecklist,
    productionEnvMinimumValueIntakeChecklist,
    productionEnvMinimumValuesFragmentTemplate,
    productionEnvValuesFragmentTemplate,
    productionEnvValueExecutionPlan,
    productionEnvSetup: {
      included: Boolean(productionEnvSetup.included),
      jsonPath: productionEnvSetup.jsonPath ? displayInputPath(productionEnvSetup.jsonPath) : "",
      markdownPath: productionEnvSetup.markdownPath ? displayInputPath(productionEnvSetup.markdownPath) : "",
      status: stringValue(productionEnvSetup.status),
      ready: Boolean(productionEnvSetup.ready),
      setupReady: Boolean(productionEnvSetup.setupReady),
      checkedAt: stringValue(productionEnvSetup.checkedAt),
      summary: productionEnvSetup.summary || {},
      envFile: productionEnvSetup.envFile || {},
      audit: productionEnvSetup.audit || {},
      envPreflight: productionEnvSetup.envPreflight || {},
      setupFindings: productionEnvSetup.setupFindings || [],
      commands: productionEnvSetup.commands || [],
      nextActions: productionEnvSetup.nextActions || [],
      safeguards: productionEnvSetup.safeguards || {},
    },
    productionEnvIntakeVerification: {
      included: Boolean(productionEnvIntakeVerification.included),
      jsonPath: productionEnvIntakeVerification.jsonPath
        ? displayInputPath(productionEnvIntakeVerification.jsonPath)
        : "",
      markdownPath: productionEnvIntakeVerification.markdownPath
        ? displayInputPath(productionEnvIntakeVerification.markdownPath)
        : "",
      status: stringValue(productionEnvIntakeVerification.status),
      ready: Boolean(productionEnvIntakeVerification.ready),
      checkedAt: stringValue(productionEnvIntakeVerification.checkedAt),
      summary: productionEnvIntakeVerification.summary || {},
      alternativeGroups: productionEnvIntakeVerification.alternativeGroups || [],
      minimumBlockingItems: productionEnvIntakeVerification.minimumBlockingItems || [],
      blockingFindings: productionEnvIntakeVerification.blockingFindings || [],
      warningFindings: productionEnvIntakeVerification.warningFindings || [],
      safeguards: productionEnvIntakeVerification.safeguards || {},
      nextActions: productionEnvIntakeVerification.nextActions || [],
    },
    fieldEvidence: {
      path: displayInputPath(fieldEvidence.path),
      status: fieldEvidence.validation.status,
      ready: fieldEvidence.validation.ready,
      summary: fieldEvidence.validation.summary,
      schemaValid: fieldEvidence.validation.schemaValid !== false,
    },
    onsiteTaskBoard: {
      included: Boolean(onsiteTaskBoard.included),
      jsonPath: onsiteTaskBoard.jsonPath ? displayInputPath(onsiteTaskBoard.jsonPath) : "",
      markdownPath: onsiteTaskBoard.markdownPath ? displayInputPath(onsiteTaskBoard.markdownPath) : "",
      rolesDir: onsiteTaskBoard.rolesDir ? displayInputPath(onsiteTaskBoard.rolesDir) : "",
      status: stringValue(onsiteTaskBoard.status),
      ready: Boolean(onsiteTaskBoard.ready),
      summary: onsiteTaskBoard.summary || {},
      roleBuckets: onsiteTaskBoard.roleBuckets || [],
      roleMarkdownFiles: (onsiteTaskBoard.roleMarkdownFiles || []).map((file) => ({
        filename: file.filename,
        path: displayInputPath(file.sourcePath),
      })),
    },
    completionSnapshot: {
      included: Boolean(completionSnapshot.included),
      jsonPath: completionSnapshot.jsonPath ? displayInputPath(completionSnapshot.jsonPath) : "",
      markdownPath: completionSnapshot.markdownPath ? displayInputPath(completionSnapshot.markdownPath) : "",
      status: stringValue(completionSnapshot.status),
      ready: Boolean(completionSnapshot.ready),
      summary: completionSnapshot.summary || {},
      blockerGroups: completionSnapshot.blockerGroups || [],
    },
    fieldEvidenceIntake: {
      included: Boolean(fieldEvidenceIntake.included),
      dir: fieldEvidenceIntake.dir ? displayInputPath(fieldEvidenceIntake.dir) : "",
      status: stringValue(fieldEvidenceIntake.status),
      ready: Boolean(fieldEvidenceIntake.ready),
      summary: fieldEvidenceIntake.summary || {},
      groupMarkdownFiles: (fieldEvidenceIntake.groupMarkdownFiles || []).map((file) => ({
        filename: file.filename,
        path: displayInputPath(file.sourcePath),
      })),
    },
    ownerDecisionBrief: {
      included: Boolean(ownerDecisionBrief.included),
      jsonPath: ownerDecisionBrief.jsonPath ? displayInputPath(ownerDecisionBrief.jsonPath) : "",
      markdownPath: ownerDecisionBrief.markdownPath ? displayInputPath(ownerDecisionBrief.markdownPath) : "",
      status: stringValue(ownerDecisionBrief.status),
      ready: Boolean(ownerDecisionBrief.ready),
      canDeclareV1Complete: Boolean(ownerDecisionBrief.canDeclareV1Complete),
      decision: ownerDecisionBrief.decision || {},
      completion: ownerDecisionBrief.completion || {},
      unfinishedItems: ownerDecisionBrief.unfinishedItems || [],
    },
    v1V2ScopeBrief: {
      included: Boolean(v1V2ScopeBrief.included),
      jsonPath: v1V2ScopeBrief.jsonPath ? displayInputPath(v1V2ScopeBrief.jsonPath) : "",
      markdownPath: v1V2ScopeBrief.markdownPath ? displayInputPath(v1V2ScopeBrief.markdownPath) : "",
      status: stringValue(v1V2ScopeBrief.status),
      ready: Boolean(v1V2ScopeBrief.ready),
      summary: v1V2ScopeBrief.summary || {},
      v2Categories: v1V2ScopeBrief.v2Categories || [],
      v1MustContinue: v1V2ScopeBrief.v1MustContinue || [],
      v2Differences: v1V2ScopeBrief.v2Differences || [],
      ownerReview: v1V2ScopeBrief.ownerReview || {},
    },
    productionGoLiveStageChecklist: {
      included: Boolean(productionGoLiveStageChecklist.included),
      jsonPath: productionGoLiveStageChecklist.jsonPath ? displayInputPath(productionGoLiveStageChecklist.jsonPath) : "",
      markdownPath: productionGoLiveStageChecklist.markdownPath
        ? displayInputPath(productionGoLiveStageChecklist.markdownPath)
        : "",
      status: stringValue(productionGoLiveStageChecklist.status),
      ready: Boolean(productionGoLiveStageChecklist.ready),
      source: stringValue(productionGoLiveStageChecklist.source),
      summary: productionGoLiveStageChecklist.summary || {},
      stages: productionGoLiveStageChecklist.stages || [],
    },
    productionFirstStageExecution: {
      included: Boolean(productionFirstStageExecution.included),
      jsonPath: productionFirstStageExecution.jsonPath ? displayInputPath(productionFirstStageExecution.jsonPath) : "",
      markdownPath: productionFirstStageExecution.markdownPath
        ? displayInputPath(productionFirstStageExecution.markdownPath)
        : "",
      status: stringValue(productionFirstStageExecution.status),
      ready: Boolean(productionFirstStageExecution.ready),
      checkedAt: stringValue(productionFirstStageExecution.checkedAt),
      summary: productionFirstStageExecution.summary || {},
      productionEnvValuesDryRunCoverage: productionFirstStageExecution.productionEnvValuesDryRunCoverage || {},
      execution: productionFirstStageExecution.execution || {},
      stages: productionFirstStageExecution.stages || [],
      blockingStages: productionFirstStageExecution.blockingStages || [],
      safeguards: productionFirstStageExecution.safeguards || {},
      nextActions: productionFirstStageExecution.nextActions || [],
    },
    productionFirstStageEvidenceSuggestions: {
      included: Boolean(productionFirstStageEvidenceSuggestions.included),
      jsonPath: productionFirstStageEvidenceSuggestions.jsonPath
        ? displayInputPath(productionFirstStageEvidenceSuggestions.jsonPath)
        : "",
      markdownPath: productionFirstStageEvidenceSuggestions.markdownPath
        ? displayInputPath(productionFirstStageEvidenceSuggestions.markdownPath)
        : "",
      csvPath: productionFirstStageEvidenceSuggestions.csvPath
        ? displayInputPath(productionFirstStageEvidenceSuggestions.csvPath)
        : "",
      status: stringValue(productionFirstStageEvidenceSuggestions.status),
      ready: Boolean(productionFirstStageEvidenceSuggestions.ready),
      generatedAt: stringValue(productionFirstStageEvidenceSuggestions.generatedAt),
      summary: productionFirstStageEvidenceSuggestions.summary || {},
      sourceReports: productionFirstStageEvidenceSuggestions.sourceReports || {},
      suggestions: productionFirstStageEvidenceSuggestions.suggestions || [],
      safeguards: productionFirstStageEvidenceSuggestions.safeguards || {},
      nextActions: productionFirstStageEvidenceSuggestions.nextActions || [],
    },
    productionPersistenceEvidence: {
      included: Boolean(productionPersistenceEvidence.included),
      jsonPath: productionPersistenceEvidence.jsonPath ? displayInputPath(productionPersistenceEvidence.jsonPath) : "",
      markdownPath: productionPersistenceEvidence.markdownPath
        ? displayInputPath(productionPersistenceEvidence.markdownPath)
        : "",
      status: stringValue(productionPersistenceEvidence.status),
      ready: Boolean(productionPersistenceEvidence.ready),
      checkedAt: stringValue(productionPersistenceEvidence.checkedAt),
      summary: productionPersistenceEvidence.summary || {},
      stages: productionPersistenceEvidence.stages || [],
      blockingStages: productionPersistenceEvidence.blockingStages || [],
      safeguards: productionPersistenceEvidence.safeguards || {},
      nextActions: productionPersistenceEvidence.nextActions || [],
    },
    productionRuntimeSmoke: {
      included: Boolean(productionRuntimeSmoke.included),
      jsonPath: productionRuntimeSmoke.jsonPath ? displayInputPath(productionRuntimeSmoke.jsonPath) : "",
      markdownPath: productionRuntimeSmoke.markdownPath ? displayInputPath(productionRuntimeSmoke.markdownPath) : "",
      status: stringValue(productionRuntimeSmoke.status),
      ready: Boolean(productionRuntimeSmoke.ready),
      checkedAt: stringValue(productionRuntimeSmoke.checkedAt),
      envFileSource: stringValue(productionRuntimeSmoke.envFileSource),
      envFileSourceLabel: stringValue(productionRuntimeSmoke.envFileSourceLabel),
      envFileFromProductionSetup: Boolean(productionRuntimeSmoke.envFileFromProductionSetup),
      summary: productionRuntimeSmoke.summary || {},
      runtime: productionRuntimeSmoke.runtime || {},
      stages: productionRuntimeSmoke.stages || [],
      blockingStages: productionRuntimeSmoke.blockingStages || [],
      safeguards: productionRuntimeSmoke.safeguards || {},
      nextActions: productionRuntimeSmoke.nextActions || [],
    },
    printChainCloseout: {
      included: Boolean(printChainCloseout.included),
      jsonPath: printChainCloseout.jsonPath ? displayInputPath(printChainCloseout.jsonPath) : "",
      markdownPath: printChainCloseout.markdownPath ? displayInputPath(printChainCloseout.markdownPath) : "",
      status: stringValue(printChainCloseout.status),
      ready: Boolean(printChainCloseout.ready),
      checkedAt: stringValue(printChainCloseout.checkedAt),
      summary: printChainCloseout.summary || {},
      stages: printChainCloseout.stages || [],
      blockingStages: printChainCloseout.blockingStages || [],
      safeguards: printChainCloseout.safeguards || {},
      nextActions: printChainCloseout.nextActions || [],
    },
    printChainExecution: {
      included: Boolean(printChainExecution.included),
      jsonPath: printChainExecution.jsonPath ? displayInputPath(printChainExecution.jsonPath) : "",
      markdownPath: printChainExecution.markdownPath ? displayInputPath(printChainExecution.markdownPath) : "",
      status: stringValue(printChainExecution.status),
      ready: Boolean(printChainExecution.ready),
      checkedAt: stringValue(printChainExecution.checkedAt),
      summary: printChainExecution.summary || {},
      execution: printChainExecution.execution || {},
      stages: printChainExecution.stages || [],
      blockingStages: printChainExecution.blockingStages || [],
      safeguards: printChainExecution.safeguards || {},
      nextActions: printChainExecution.nextActions || [],
    },
    driverRealDeviceExecution: {
      included: Boolean(driverRealDeviceExecution.included),
      jsonPath: driverRealDeviceExecution.jsonPath ? displayInputPath(driverRealDeviceExecution.jsonPath) : "",
      markdownPath: driverRealDeviceExecution.markdownPath
        ? displayInputPath(driverRealDeviceExecution.markdownPath)
        : "",
      status: stringValue(driverRealDeviceExecution.status),
      ready: Boolean(driverRealDeviceExecution.ready),
      checkedAt: stringValue(driverRealDeviceExecution.checkedAt),
      summary: driverRealDeviceExecution.summary || {},
      execution: driverRealDeviceExecution.execution || {},
      stages: driverRealDeviceExecution.stages || [],
      blockingStages: driverRealDeviceExecution.blockingStages || [],
      safeguards: driverRealDeviceExecution.safeguards || {},
      nextActions: driverRealDeviceExecution.nextActions || [],
    },
    driverRealDeviceCloseout: {
      included: Boolean(driverRealDeviceCloseout.included),
      jsonPath: driverRealDeviceCloseout.jsonPath ? displayInputPath(driverRealDeviceCloseout.jsonPath) : "",
      markdownPath: driverRealDeviceCloseout.markdownPath ? displayInputPath(driverRealDeviceCloseout.markdownPath) : "",
      status: stringValue(driverRealDeviceCloseout.status),
      ready: Boolean(driverRealDeviceCloseout.ready),
      checkedAt: stringValue(driverRealDeviceCloseout.checkedAt),
      summary: driverRealDeviceCloseout.summary || {},
      stages: driverRealDeviceCloseout.stages || [],
      blockingStages: driverRealDeviceCloseout.blockingStages || [],
      safeguards: driverRealDeviceCloseout.safeguards || {},
      nextActions: driverRealDeviceCloseout.nextActions || [],
    },
    unblockPlan: {
      included: Boolean(unblockPlan.included),
      jsonPath: unblockPlan.jsonPath ? displayInputPath(unblockPlan.jsonPath) : "",
      markdownPath: unblockPlan.markdownPath ? displayInputPath(unblockPlan.markdownPath) : "",
      status: stringValue(unblockPlan.status),
      ready: Boolean(unblockPlan.ready),
      summary: unblockPlan.summary || {},
      phases: unblockPlan.phases || [],
      firstActions: unblockPlan.firstActions || [],
      roleBuckets: unblockPlan.roleBuckets || [],
    },
    v1Scope: stringList(releaseCandidate.v1Scope),
    v2Differences: v1V2ScopeBrief.v2Differences?.length ? v1V2ScopeBrief.v2Differences : stringList(releaseCandidate.v2Differences),
    sourceDocuments: docs.map((doc) => ({
      key: doc.key,
      label: doc.label,
      source: displayInputPath(doc.sourcePath),
      target: doc.target,
    })),
    safeguards: {
      productionEnvTemplateOnly: true,
      rawFieldEvidenceIncluded: includeRawFieldEvidence,
      productionEnvFixChecklistIncluded: productionEnvFixChecklist.included,
      onsiteTaskBoardIncluded: Boolean(onsiteTaskBoard.included),
      onsiteTaskBoardRoleFilesIncluded: Boolean(onsiteTaskBoard.roleMarkdownFiles?.length),
      completionSnapshotIncluded: Boolean(completionSnapshot.included),
      fieldEvidenceIntakeIncluded: Boolean(fieldEvidenceIntake.included),
      ownerDecisionBriefIncluded: Boolean(ownerDecisionBrief.included),
      v1V2ScopeBriefIncluded: Boolean(v1V2ScopeBrief.included),
      productionGoLiveStageChecklistIncluded: Boolean(productionGoLiveStageChecklist.included),
      productionEnvSetupIncluded: Boolean(productionEnvSetup.included),
      productionEnvSetupReportExpectedRedacted: Boolean(productionEnvSetup.included),
      productionEnvSetupEnvFilePathExposed: false,
      productionEnvIntakeVerificationIncluded: Boolean(productionEnvIntakeVerification.included),
      productionEnvIntakeVerificationReportExpectedRedacted: Boolean(productionEnvIntakeVerification.included),
      productionFirstStageExecutionIncluded: Boolean(productionFirstStageExecution.included),
      productionFirstStageExecutionReportExpectedRedacted: Boolean(productionFirstStageExecution.included),
      productionFirstStageEvidenceSuggestionsIncluded: Boolean(productionFirstStageEvidenceSuggestions.included),
      productionFirstStageEvidenceSuggestionsRequireHumanReview: Boolean(
        productionFirstStageEvidenceSuggestions.included,
      ),
      productionPersistenceEvidenceIncluded: Boolean(productionPersistenceEvidence.included),
      productionPersistenceEvidenceReportExpectedRedacted: Boolean(productionPersistenceEvidence.included),
      productionRuntimeSmokeIncluded: Boolean(productionRuntimeSmoke.included),
      productionRuntimeSmokeReportExpectedRedacted: Boolean(productionRuntimeSmoke.included),
      productionEnvValueIntakeChecklistIncluded: Boolean(productionEnvValueIntakeChecklist.included),
      productionEnvValueIntakeRealValuesExposed: false,
      productionEnvMinimumValueIntakeChecklistIncluded: Boolean(productionEnvMinimumValueIntakeChecklist.included),
      productionEnvMinimumValueIntakeRealValuesExposed: false,
      productionEnvMinimumValuesFragmentTemplateIncluded: Boolean(productionEnvMinimumValuesFragmentTemplate.included),
      productionEnvMinimumValuesFragmentTemplateRealValuesExposed: false,
      productionEnvValuesFragmentTemplateIncluded: Boolean(productionEnvValuesFragmentTemplate.included),
      productionEnvValuesFragmentTemplateRealValuesExposed: false,
      productionEnvValueExecutionPlanIncluded: Boolean(productionEnvValueExecutionPlan.included),
      productionEnvValueExecutionPlanRealValuesExposed: false,
      printChainExecutionIncluded: Boolean(printChainExecution.included),
      printChainExecutionReportExpectedRedacted: Boolean(printChainExecution.included),
      printChainCloseoutIncluded: Boolean(printChainCloseout.included),
      printChainCloseoutReportExpectedRedacted: Boolean(printChainCloseout.included),
      driverRealDeviceExecutionIncluded: Boolean(driverRealDeviceExecution.included),
      driverRealDeviceExecutionReportExpectedRedacted: Boolean(driverRealDeviceExecution.included),
      driverRealDeviceCloseoutIncluded: Boolean(driverRealDeviceCloseout.included),
      driverRealDeviceCloseoutReportExpectedRedacted: Boolean(driverRealDeviceCloseout.included),
      unblockPlanIncluded: Boolean(unblockPlan.included),
      fieldEvidenceRedactedCopyWritten: true,
      rawEvidenceRefsPrintedInSummary: false,
      rawOnsiteTaskEvidenceRefsExpected: false,
      releaseCandidateReportExpectedRedacted: true,
    },
  };
}

function writeHandoffPack({
  outputDir,
  report,
  releaseCandidate,
  releaseCandidateJsonPath: _releaseCandidateJsonPath,
  releaseCandidateMarkdownPath,
  fieldEvidence,
  onsiteTaskBoard,
  completionSnapshot,
  fieldEvidenceIntake,
  ownerDecisionBrief,
  v1V2ScopeBrief,
  productionGoLiveStageChecklist,
  productionEnvSetup,
  productionEnvIntakeVerification,
  productionFirstStageExecution,
  productionFirstStageEvidenceSuggestions,
  productionPersistenceEvidence,
  productionRuntimeSmoke,
  printChainCloseout,
  printChainExecution,
  driverRealDeviceExecution,
  driverRealDeviceCloseout,
  unblockPlan,
  docs,
  includeRawFieldEvidence,
}) {
  mkdirSync(outputDir, { recursive: true });
  const files = {};

  const summaryPath = join(outputDir, "handoff-summary.zh-CN.md");
  const manifestPath = join(outputDir, "handoff-manifest.json");
  writeFileSync(summaryPath, formatHandoffMarkdown(report));
  writeFileSync(manifestPath, `${JSON.stringify(report, null, 2)}\n`);
  files.summaryMarkdown = displayPath(summaryPath);
  files.handoffManifest = displayPath(manifestPath);

  const releaseJsonTarget = join(outputDir, "release-candidate.latest.json");
  writeFileSync(releaseJsonTarget, `${JSON.stringify(releaseCandidate, null, 2)}\n`);
  files.releaseCandidateJson = displayPath(releaseJsonTarget);
  if (releaseCandidateMarkdownPath && existsSync(releaseCandidateMarkdownPath)) {
    const releaseMarkdownTarget = join(outputDir, "release-candidate.latest.md");
    copyFileSync(releaseCandidateMarkdownPath, releaseMarkdownTarget);
    files.releaseCandidateMarkdown = displayPath(releaseMarkdownTarget);
  }

  if (report.productionEnvFixChecklist.included) {
    const envFixMarkdownTarget = join(outputDir, "production-env-fix-checklist.zh-CN.md");
    const envFixCsvTarget = join(outputDir, "production-env-fix-checklist.csv");
    const envValueIntakeMarkdownTarget = join(outputDir, "production-env-real-value-intake.zh-CN.md");
    const envValueIntakeCsvTarget = join(outputDir, "production-env-real-value-intake.csv");
    const envMinimumValueIntakeMarkdownTarget = join(outputDir, "production-env-minimum-real-value-intake.zh-CN.md");
    const envMinimumValueIntakeCsvTarget = join(outputDir, "production-env-minimum-real-value-intake.csv");
    const envMinimumValuesFragmentTemplateTarget = join(
      outputDir,
      "production-env-minimum-values-fragment.template.env.example",
    );
    const envValuesFragmentTemplateTarget = join(outputDir, "production-env-values-fragment.template.env.example");
    const envFillTemplateTarget = join(outputDir, "production-env-fill-template.env.example");
    writeFileSync(envFixMarkdownTarget, formatProductionEnvFixChecklistMarkdown(report));
    writeFileSync(envFixCsvTarget, formatProductionEnvFixChecklistCsv(report.productionEnvFixChecklist.items));
    writeFileSync(envValueIntakeMarkdownTarget, formatProductionEnvValueIntakeMarkdown(report));
    writeFileSync(
      envValueIntakeCsvTarget,
      formatProductionEnvValueIntakeCsv(report.productionEnvValueIntakeChecklist.rows),
    );
    writeFileSync(envMinimumValueIntakeMarkdownTarget, formatProductionEnvMinimumValueIntakeMarkdown(report));
    writeFileSync(
      envMinimumValueIntakeCsvTarget,
      formatProductionEnvValueIntakeCsv(report.productionEnvMinimumValueIntakeChecklist.rows),
    );
    writeFileSync(envMinimumValuesFragmentTemplateTarget, formatProductionEnvMinimumValuesFragmentTemplate(report));
    writeFileSync(envValuesFragmentTemplateTarget, formatProductionEnvValuesFragmentTemplate(report));
    writeFileSync(envFillTemplateTarget, formatProductionEnvFillTemplate(report));
    files.productionEnvFixChecklistMarkdown = displayPath(envFixMarkdownTarget);
    files.productionEnvFixChecklistCsv = displayPath(envFixCsvTarget);
    files.productionEnvValueIntakeMarkdown = displayPath(envValueIntakeMarkdownTarget);
    files.productionEnvValueIntakeCsv = displayPath(envValueIntakeCsvTarget);
    files.productionEnvMinimumValueIntakeMarkdown = displayPath(envMinimumValueIntakeMarkdownTarget);
    files.productionEnvMinimumValueIntakeCsv = displayPath(envMinimumValueIntakeCsvTarget);
    files.productionEnvMinimumValuesFragmentTemplate = displayPath(envMinimumValuesFragmentTemplateTarget);
    files.productionEnvValuesFragmentTemplate = displayPath(envValuesFragmentTemplateTarget);
    files.productionEnvFillTemplate = displayPath(envFillTemplateTarget);
  }

  if (productionEnvSetup.included) {
    if (productionEnvSetup.jsonPath && existsSync(productionEnvSetup.jsonPath)) {
      const setupJsonTarget = join(outputDir, "production-env-setup.latest.json");
      const setupJson = readJson(productionEnvSetup.jsonPath, "V1 production env setup JSON");
      writeFileSync(setupJsonTarget, `${JSON.stringify(redactProductionEnvSetupReport(setupJson), null, 2)}\n`);
      files.productionEnvSetupJson = displayPath(setupJsonTarget);
    }
    if (productionEnvSetup.markdownPath && existsSync(productionEnvSetup.markdownPath)) {
      const setupMarkdownTarget = join(outputDir, "production-env-setup.latest.md");
      const setupJson =
        productionEnvSetup.jsonPath && existsSync(productionEnvSetup.jsonPath)
          ? readJson(productionEnvSetup.jsonPath, "V1 production env setup JSON")
          : null;
      writeFileSync(
        setupMarkdownTarget,
        redactProductionEnvSetupMarkdown(readFileSync(productionEnvSetup.markdownPath, "utf8"), setupJson),
      );
      files.productionEnvSetupMarkdown = displayPath(setupMarkdownTarget);
    }
  }

  if (productionEnvIntakeVerification.included) {
    if (productionEnvIntakeVerification.jsonPath && existsSync(productionEnvIntakeVerification.jsonPath)) {
      const verificationJsonTarget = join(outputDir, "production-env-intake-verify.latest.json");
      copyFileSync(productionEnvIntakeVerification.jsonPath, verificationJsonTarget);
      files.productionEnvIntakeVerificationJson = displayPath(verificationJsonTarget);
    }
    if (productionEnvIntakeVerification.markdownPath && existsSync(productionEnvIntakeVerification.markdownPath)) {
      const verificationMarkdownTarget = join(outputDir, "production-env-intake-verify.latest.md");
      copyFileSync(productionEnvIntakeVerification.markdownPath, verificationMarkdownTarget);
      files.productionEnvIntakeVerificationMarkdown = displayPath(verificationMarkdownTarget);
    }
  }

  const redactedManifestTarget = join(outputDir, "v1-field-evidence-manifest.redacted.json");
  writeFileSync(redactedManifestTarget, `${JSON.stringify(redactFieldEvidenceManifest(fieldEvidence.manifest), null, 2)}\n`);
  files.fieldEvidenceManifestRedacted = displayPath(redactedManifestTarget);
  if (includeRawFieldEvidence) {
    const rawManifestTarget = join(outputDir, "v1-field-evidence-manifest.raw.json");
    copyFileSync(fieldEvidence.path, rawManifestTarget);
    files.fieldEvidenceManifestRaw = displayPath(rawManifestTarget);
  }

  if (onsiteTaskBoard.included) {
    if (onsiteTaskBoard.jsonPath && existsSync(onsiteTaskBoard.jsonPath)) {
      const taskBoardJsonTarget = join(outputDir, "v1-onsite-task-board.latest.json");
      copyFileSync(onsiteTaskBoard.jsonPath, taskBoardJsonTarget);
      files.onsiteTaskBoardJson = displayPath(taskBoardJsonTarget);
    }
    if (onsiteTaskBoard.markdownPath && existsSync(onsiteTaskBoard.markdownPath)) {
      const taskBoardMarkdownTarget = join(outputDir, "v1-onsite-task-board.latest.md");
      copyFileSync(onsiteTaskBoard.markdownPath, taskBoardMarkdownTarget);
      files.onsiteTaskBoardMarkdown = displayPath(taskBoardMarkdownTarget);
    }
    if (onsiteTaskBoard.roleMarkdownFiles?.length) {
      const roleTargetDir = join(outputDir, "onsite-task-board-roles");
      mkdirSync(roleTargetDir, { recursive: true });
      files.onsiteTaskBoardRoleMarkdownFiles = [];
      for (const roleFile of onsiteTaskBoard.roleMarkdownFiles) {
        const targetPath = join(roleTargetDir, roleFile.filename);
        copyFileSync(roleFile.sourcePath, targetPath);
        files.onsiteTaskBoardRoleMarkdownFiles.push(displayPath(targetPath));
      }
    }
  }

  if (completionSnapshot.included) {
    if (completionSnapshot.jsonPath && existsSync(completionSnapshot.jsonPath)) {
      const completionSnapshotJsonTarget = join(outputDir, "v1-completion-snapshot.latest.json");
      copyFileSync(completionSnapshot.jsonPath, completionSnapshotJsonTarget);
      files.completionSnapshotJson = displayPath(completionSnapshotJsonTarget);
    }
    if (completionSnapshot.markdownPath && existsSync(completionSnapshot.markdownPath)) {
      const completionSnapshotMarkdownTarget = join(outputDir, "v1-completion-snapshot.latest.md");
      copyFileSync(completionSnapshot.markdownPath, completionSnapshotMarkdownTarget);
      files.completionSnapshotMarkdown = displayPath(completionSnapshotMarkdownTarget);
    }
  }

  if (fieldEvidenceIntake.included) {
    const intakeTargetDir = join(outputDir, "field-evidence-intake");
    mkdirSync(intakeTargetDir, { recursive: true });
    files.fieldEvidenceIntake = {};
    if (fieldEvidenceIntake.files.summaryMarkdown) {
      const targetPath = join(intakeTargetDir, "intake-summary.zh-CN.md");
      copyFileSync(fieldEvidenceIntake.files.summaryMarkdown, targetPath);
      files.fieldEvidenceIntake.summaryMarkdown = displayPath(targetPath);
    }
    if (fieldEvidenceIntake.files.intakeManifest) {
      const targetPath = join(intakeTargetDir, "intake-manifest.json");
      copyFileSync(fieldEvidenceIntake.files.intakeManifest, targetPath);
      files.fieldEvidenceIntake.intakeManifest = displayPath(targetPath);
    }
    if (fieldEvidenceIntake.files.evidenceItemsCsv) {
      const targetPath = join(intakeTargetDir, "evidence-items.csv");
      copyFileSync(fieldEvidenceIntake.files.evidenceItemsCsv, targetPath);
      files.fieldEvidenceIntake.evidenceItemsCsv = displayPath(targetPath);
    }
    if (fieldEvidenceIntake.files.intakeRulesMarkdown) {
      const targetPath = join(intakeTargetDir, "intake-rules.zh-CN.md");
      copyFileSync(fieldEvidenceIntake.files.intakeRulesMarkdown, targetPath);
      files.fieldEvidenceIntake.intakeRulesMarkdown = displayPath(targetPath);
    }
    if (fieldEvidenceIntake.files.signoffBoundaryMarkdown) {
      const targetPath = join(intakeTargetDir, "signoff-boundary.zh-CN.md");
      copyFileSync(fieldEvidenceIntake.files.signoffBoundaryMarkdown, targetPath);
      files.fieldEvidenceIntake.signoffBoundaryMarkdown = displayPath(targetPath);
    }
    if (fieldEvidenceIntake.files.signoffBoundaryCsv) {
      const targetPath = join(intakeTargetDir, "signoff-boundary.csv");
      copyFileSync(fieldEvidenceIntake.files.signoffBoundaryCsv, targetPath);
      files.fieldEvidenceIntake.signoffBoundaryCsv = displayPath(targetPath);
    }
    if (fieldEvidenceIntake.groupMarkdownFiles?.length) {
      const groupsTargetDir = join(intakeTargetDir, "groups");
      mkdirSync(groupsTargetDir, { recursive: true });
      files.fieldEvidenceIntake.groupMarkdownFiles = [];
      for (const groupFile of fieldEvidenceIntake.groupMarkdownFiles) {
        const targetPath = join(groupsTargetDir, groupFile.filename);
        copyFileSync(groupFile.sourcePath, targetPath);
        files.fieldEvidenceIntake.groupMarkdownFiles.push(displayPath(targetPath));
      }
    }
  }

  if (ownerDecisionBrief.included) {
    if (ownerDecisionBrief.jsonPath && existsSync(ownerDecisionBrief.jsonPath)) {
      const ownerBriefJsonTarget = join(outputDir, "v1-owner-decision-brief.latest.json");
      copyFileSync(ownerDecisionBrief.jsonPath, ownerBriefJsonTarget);
      files.ownerDecisionBriefJson = displayPath(ownerBriefJsonTarget);
    }
    if (ownerDecisionBrief.markdownPath && existsSync(ownerDecisionBrief.markdownPath)) {
      const ownerBriefMarkdownTarget = join(outputDir, "v1-owner-decision-brief.latest.zh-CN.md");
      copyFileSync(ownerDecisionBrief.markdownPath, ownerBriefMarkdownTarget);
      files.ownerDecisionBriefMarkdown = displayPath(ownerBriefMarkdownTarget);
    }
  }

  if (v1V2ScopeBrief.included) {
    if (v1V2ScopeBrief.jsonPath && existsSync(v1V2ScopeBrief.jsonPath)) {
      const v1V2ScopeBriefJsonTarget = join(outputDir, "v1-v2-scope-brief.latest.json");
      copyFileSync(v1V2ScopeBrief.jsonPath, v1V2ScopeBriefJsonTarget);
      files.v1V2ScopeBriefJson = displayPath(v1V2ScopeBriefJsonTarget);
    }
    if (v1V2ScopeBrief.markdownPath && existsSync(v1V2ScopeBrief.markdownPath)) {
      const v1V2ScopeBriefMarkdownTarget = join(outputDir, "v1-v2-scope-brief.latest.zh-CN.md");
      copyFileSync(v1V2ScopeBrief.markdownPath, v1V2ScopeBriefMarkdownTarget);
      files.v1V2ScopeBriefMarkdown = displayPath(v1V2ScopeBriefMarkdownTarget);
    }
  }

  if (productionGoLiveStageChecklist.included) {
    if (productionGoLiveStageChecklist.jsonPath && existsSync(productionGoLiveStageChecklist.jsonPath)) {
      const checklistJsonTarget = join(outputDir, "production-go-live-stage-checklist.latest.json");
      copyFileSync(productionGoLiveStageChecklist.jsonPath, checklistJsonTarget);
      files.productionGoLiveStageChecklistJson = displayPath(checklistJsonTarget);
    }
    if (productionGoLiveStageChecklist.markdownPath && existsSync(productionGoLiveStageChecklist.markdownPath)) {
      const checklistMarkdownTarget = join(outputDir, "production-go-live-stage-checklist.latest.zh-CN.md");
      copyFileSync(productionGoLiveStageChecklist.markdownPath, checklistMarkdownTarget);
      files.productionGoLiveStageChecklistMarkdown = displayPath(checklistMarkdownTarget);
    }
  }

  if (productionFirstStageExecution.included) {
    if (productionFirstStageExecution.jsonPath && existsSync(productionFirstStageExecution.jsonPath)) {
      const executionJsonTarget = join(outputDir, "production-first-stage-execution.latest.json");
      copyFileSync(productionFirstStageExecution.jsonPath, executionJsonTarget);
      files.productionFirstStageExecutionJson = displayPath(executionJsonTarget);
    }
    if (productionFirstStageExecution.markdownPath && existsSync(productionFirstStageExecution.markdownPath)) {
      const executionMarkdownTarget = join(outputDir, "production-first-stage-execution.latest.md");
      copyFileSync(productionFirstStageExecution.markdownPath, executionMarkdownTarget);
      files.productionFirstStageExecutionMarkdown = displayPath(executionMarkdownTarget);
    }
  }

  if (productionFirstStageEvidenceSuggestions.included) {
    if (productionFirstStageEvidenceSuggestions.jsonPath && existsSync(productionFirstStageEvidenceSuggestions.jsonPath)) {
      const suggestionsJsonTarget = join(outputDir, "production-first-stage-evidence-suggestions.latest.json");
      copyFileSync(productionFirstStageEvidenceSuggestions.jsonPath, suggestionsJsonTarget);
      files.productionFirstStageEvidenceSuggestionsJson = displayPath(suggestionsJsonTarget);
    }
    if (
      productionFirstStageEvidenceSuggestions.markdownPath &&
      existsSync(productionFirstStageEvidenceSuggestions.markdownPath)
    ) {
      const suggestionsMarkdownTarget = join(outputDir, "production-first-stage-evidence-suggestions.latest.md");
      copyFileSync(productionFirstStageEvidenceSuggestions.markdownPath, suggestionsMarkdownTarget);
      files.productionFirstStageEvidenceSuggestionsMarkdown = displayPath(suggestionsMarkdownTarget);
    }
    if (productionFirstStageEvidenceSuggestions.csvPath && existsSync(productionFirstStageEvidenceSuggestions.csvPath)) {
      const suggestionsCsvTarget = join(outputDir, "production-first-stage-evidence-suggestions.csv");
      copyFileSync(productionFirstStageEvidenceSuggestions.csvPath, suggestionsCsvTarget);
      files.productionFirstStageEvidenceSuggestionsCsv = displayPath(suggestionsCsvTarget);
    }
  }

  if (productionPersistenceEvidence.included) {
    if (productionPersistenceEvidence.jsonPath && existsSync(productionPersistenceEvidence.jsonPath)) {
      const persistenceJsonTarget = join(outputDir, "production-persistence-evidence.latest.json");
      copyFileSync(productionPersistenceEvidence.jsonPath, persistenceJsonTarget);
      files.productionPersistenceEvidenceJson = displayPath(persistenceJsonTarget);
    }
    if (productionPersistenceEvidence.markdownPath && existsSync(productionPersistenceEvidence.markdownPath)) {
      const persistenceMarkdownTarget = join(outputDir, "production-persistence-evidence.latest.md");
      copyFileSync(productionPersistenceEvidence.markdownPath, persistenceMarkdownTarget);
      files.productionPersistenceEvidenceMarkdown = displayPath(persistenceMarkdownTarget);
    }
  }

  if (productionRuntimeSmoke.included) {
    if (productionRuntimeSmoke.jsonPath && existsSync(productionRuntimeSmoke.jsonPath)) {
      const runtimeSmokeJsonTarget = join(outputDir, "production-runtime-smoke.latest.json");
      copyFileSync(productionRuntimeSmoke.jsonPath, runtimeSmokeJsonTarget);
      files.productionRuntimeSmokeJson = displayPath(runtimeSmokeJsonTarget);
    }
    if (productionRuntimeSmoke.markdownPath && existsSync(productionRuntimeSmoke.markdownPath)) {
      const runtimeSmokeMarkdownTarget = join(outputDir, "production-runtime-smoke.latest.md");
      copyFileSync(productionRuntimeSmoke.markdownPath, runtimeSmokeMarkdownTarget);
      files.productionRuntimeSmokeMarkdown = displayPath(runtimeSmokeMarkdownTarget);
    }
  }

  if (printChainCloseout.included) {
    if (printChainCloseout.jsonPath && existsSync(printChainCloseout.jsonPath)) {
      const closeoutJsonTarget = join(outputDir, "print-chain-closeout.latest.json");
      copyFileSync(printChainCloseout.jsonPath, closeoutJsonTarget);
      files.printChainCloseoutJson = displayPath(closeoutJsonTarget);
    }
    if (printChainCloseout.markdownPath && existsSync(printChainCloseout.markdownPath)) {
      const closeoutMarkdownTarget = join(outputDir, "print-chain-closeout.latest.md");
      copyFileSync(printChainCloseout.markdownPath, closeoutMarkdownTarget);
      files.printChainCloseoutMarkdown = displayPath(closeoutMarkdownTarget);
    }
  }

  if (printChainExecution.included) {
    if (printChainExecution.jsonPath && existsSync(printChainExecution.jsonPath)) {
      const executionJsonTarget = join(outputDir, "print-chain-execution.latest.json");
      copyFileSync(printChainExecution.jsonPath, executionJsonTarget);
      files.printChainExecutionJson = displayPath(executionJsonTarget);
    }
    if (printChainExecution.markdownPath && existsSync(printChainExecution.markdownPath)) {
      const executionMarkdownTarget = join(outputDir, "print-chain-execution.latest.md");
      copyFileSync(printChainExecution.markdownPath, executionMarkdownTarget);
      files.printChainExecutionMarkdown = displayPath(executionMarkdownTarget);
    }
  }

  if (driverRealDeviceExecution.included) {
    if (driverRealDeviceExecution.jsonPath && existsSync(driverRealDeviceExecution.jsonPath)) {
      const executionJsonTarget = join(outputDir, "driver-real-device-execution.latest.json");
      copyFileSync(driverRealDeviceExecution.jsonPath, executionJsonTarget);
      files.driverRealDeviceExecutionJson = displayPath(executionJsonTarget);
    }
    if (driverRealDeviceExecution.markdownPath && existsSync(driverRealDeviceExecution.markdownPath)) {
      const executionMarkdownTarget = join(outputDir, "driver-real-device-execution.latest.md");
      copyFileSync(driverRealDeviceExecution.markdownPath, executionMarkdownTarget);
      files.driverRealDeviceExecutionMarkdown = displayPath(executionMarkdownTarget);
    }
  }

  if (driverRealDeviceCloseout.included) {
    if (driverRealDeviceCloseout.jsonPath && existsSync(driverRealDeviceCloseout.jsonPath)) {
      const closeoutJsonTarget = join(outputDir, "driver-real-device-closeout.latest.json");
      copyFileSync(driverRealDeviceCloseout.jsonPath, closeoutJsonTarget);
      files.driverRealDeviceCloseoutJson = displayPath(closeoutJsonTarget);
    }
    if (driverRealDeviceCloseout.markdownPath && existsSync(driverRealDeviceCloseout.markdownPath)) {
      const closeoutMarkdownTarget = join(outputDir, "driver-real-device-closeout.latest.md");
      copyFileSync(driverRealDeviceCloseout.markdownPath, closeoutMarkdownTarget);
      files.driverRealDeviceCloseoutMarkdown = displayPath(closeoutMarkdownTarget);
    }
  }

  if (unblockPlan.included) {
    if (unblockPlan.jsonPath && existsSync(unblockPlan.jsonPath)) {
      const unblockPlanJsonTarget = join(outputDir, "v1-unblock-plan.latest.json");
      copyFileSync(unblockPlan.jsonPath, unblockPlanJsonTarget);
      files.unblockPlanJson = displayPath(unblockPlanJsonTarget);
    }
    if (unblockPlan.markdownPath && existsSync(unblockPlan.markdownPath)) {
      const unblockPlanMarkdownTarget = join(outputDir, "v1-unblock-plan.latest.zh-CN.md");
      copyFileSync(unblockPlan.markdownPath, unblockPlanMarkdownTarget);
      files.unblockPlanMarkdown = displayPath(unblockPlanMarkdownTarget);
    }
  }

  for (const doc of docs) {
    const targetPath = join(outputDir, doc.target || basename(doc.sourcePath));
    copyFileSync(doc.sourcePath, targetPath);
    files[doc.key] = displayPath(targetPath);
  }

  return files;
}

function redactFieldEvidenceManifest(manifest) {
  const copy = JSON.parse(JSON.stringify(manifest));
  if (copy.environment && typeof copy.environment === "object") {
    for (const key of Object.keys(copy.environment)) {
      if (String(copy.environment[key] || "").trim()) copy.environment[key] = "[redacted]";
    }
  }
  if (Array.isArray(copy.evidenceGroups)) {
    for (const group of copy.evidenceGroups) {
      for (const item of Array.isArray(group.items) ? group.items : []) {
        if (String(item.evidenceRef || "").trim()) item.evidenceRef = "[redacted-evidence-ref]";
        if (String(item.notes || "").trim()) item.notes = "[redacted-notes]";
      }
    }
  }
  if (Array.isArray(copy.signoffs)) {
    for (const signoff of copy.signoffs) {
      if (String(signoff.signer || "").trim()) signoff.signer = "[redacted-signer]";
      if (String(signoff.notes || "").trim()) signoff.notes = "[redacted-notes]";
    }
  }
  if (copy.v1V2BoundaryConfirmed && typeof copy.v1V2BoundaryConfirmed === "object") {
    if (String(copy.v1V2BoundaryConfirmed.confirmedBy || "").trim()) {
      copy.v1V2BoundaryConfirmed.confirmedBy = "[redacted-confirmer]";
    }
  }
  return copy;
}

function buildCommandResult({ report }) {
  return {
    status: report.status,
    ready: report.ready,
    generatedAt: report.generatedAt,
    conclusion: report.conclusion,
    releaseCandidate: {
      status: report.releaseCandidate.status,
      ready: report.releaseCandidate.ready,
      summary: report.releaseCandidate.summary,
    },
    fieldEvidence: {
      status: report.fieldEvidence.status,
      ready: report.fieldEvidence.ready,
      summary: report.fieldEvidence.summary,
    },
    productionEnvFixChecklist: {
      included: report.productionEnvFixChecklist.included,
      status: report.productionEnvFixChecklist.status,
      ready: report.productionEnvFixChecklist.ready,
      summary: report.productionEnvFixChecklist.summary,
      fixItemCount: report.productionEnvFixChecklist.fixItemCount,
      blockingItemCount: report.productionEnvFixChecklist.blockingItemCount,
      warningItemCount: report.productionEnvFixChecklist.warningItemCount,
    },
    productionEnvValueIntakeChecklist: {
      included: report.productionEnvValueIntakeChecklist.included,
      status: report.productionEnvValueIntakeChecklist.status,
      ready: report.productionEnvValueIntakeChecklist.ready,
      rowCount: report.productionEnvValueIntakeChecklist.rowCount,
      chooseOneGroupCount: report.productionEnvValueIntakeChecklist.chooseOneGroupCount,
      rows: report.productionEnvValueIntakeChecklist.rows,
      safeguards: report.productionEnvValueIntakeChecklist.safeguards,
    },
    productionEnvMinimumValueIntakeChecklist: {
      included: report.productionEnvMinimumValueIntakeChecklist.included,
      status: report.productionEnvMinimumValueIntakeChecklist.status,
      ready: report.productionEnvMinimumValueIntakeChecklist.ready,
      rowCount: report.productionEnvMinimumValueIntakeChecklist.rowCount,
      sourceRowCount: report.productionEnvMinimumValueIntakeChecklist.sourceRowCount,
      variableCount: report.productionEnvMinimumValueIntakeChecklist.variableCount,
      chooseOneGroupCount: report.productionEnvMinimumValueIntakeChecklist.chooseOneGroupCount,
      rows: report.productionEnvMinimumValueIntakeChecklist.rows,
      safeguards: report.productionEnvMinimumValueIntakeChecklist.safeguards,
    },
    productionEnvMinimumValuesFragmentTemplate: {
      included: report.productionEnvMinimumValuesFragmentTemplate.included,
      status: report.productionEnvMinimumValuesFragmentTemplate.status,
      ready: report.productionEnvMinimumValuesFragmentTemplate.ready,
      fileName: report.productionEnvMinimumValuesFragmentTemplate.fileName,
      rowCount: report.productionEnvMinimumValuesFragmentTemplate.rowCount,
      sourceRowCount: report.productionEnvMinimumValuesFragmentTemplate.sourceRowCount,
      variableCount: report.productionEnvMinimumValuesFragmentTemplate.variableCount,
      chooseOneGroupCount: report.productionEnvMinimumValuesFragmentTemplate.chooseOneGroupCount,
      safeguards: report.productionEnvMinimumValuesFragmentTemplate.safeguards,
    },
    productionEnvValuesFragmentTemplate: {
      included: report.productionEnvValuesFragmentTemplate.included,
      status: report.productionEnvValuesFragmentTemplate.status,
      ready: report.productionEnvValuesFragmentTemplate.ready,
      fileName: report.productionEnvValuesFragmentTemplate.fileName,
      rowCount: report.productionEnvValuesFragmentTemplate.rowCount,
      variableCount: report.productionEnvValuesFragmentTemplate.variableCount,
      chooseOneGroupCount: report.productionEnvValuesFragmentTemplate.chooseOneGroupCount,
      safeguards: report.productionEnvValuesFragmentTemplate.safeguards,
    },
    productionEnvValueExecutionPlan: report.productionEnvValueExecutionPlan,
    productionEnvSetup: {
      included: report.productionEnvSetup.included,
      status: report.productionEnvSetup.status,
      ready: report.productionEnvSetup.ready,
      setupReady: report.productionEnvSetup.setupReady,
      checkedAt: report.productionEnvSetup.checkedAt,
      summary: report.productionEnvSetup.summary,
      envFile: report.productionEnvSetup.envFile,
      audit: report.productionEnvSetup.audit,
      envPreflight: report.productionEnvSetup.envPreflight,
      setupFindings: report.productionEnvSetup.setupFindings,
      nextActions: report.productionEnvSetup.nextActions,
    },
    productionEnvIntakeVerification: {
      included: report.productionEnvIntakeVerification.included,
      status: report.productionEnvIntakeVerification.status,
      ready: report.productionEnvIntakeVerification.ready,
      checkedAt: report.productionEnvIntakeVerification.checkedAt,
      summary: report.productionEnvIntakeVerification.summary,
      alternativeGroups: report.productionEnvIntakeVerification.alternativeGroups,
      minimumBlockingItems: report.productionEnvIntakeVerification.minimumBlockingItems,
      blockingFindings: report.productionEnvIntakeVerification.blockingFindings,
      warningFindings: report.productionEnvIntakeVerification.warningFindings,
      nextActions: report.productionEnvIntakeVerification.nextActions,
      safeguards: report.productionEnvIntakeVerification.safeguards,
    },
    onsiteTaskBoard: {
      included: report.onsiteTaskBoard.included,
      status: report.onsiteTaskBoard.status,
      ready: report.onsiteTaskBoard.ready,
      summary: report.onsiteTaskBoard.summary,
      roleBuckets: report.onsiteTaskBoard.roleBuckets,
      roleMarkdownFiles: report.onsiteTaskBoard.roleMarkdownFiles,
    },
    completionSnapshot: {
      included: report.completionSnapshot.included,
      status: report.completionSnapshot.status,
      ready: report.completionSnapshot.ready,
      summary: report.completionSnapshot.summary,
      blockerGroups: report.completionSnapshot.blockerGroups,
    },
    fieldEvidenceIntake: {
      included: report.fieldEvidenceIntake.included,
      status: report.fieldEvidenceIntake.status,
      ready: report.fieldEvidenceIntake.ready,
      summary: report.fieldEvidenceIntake.summary,
      groupMarkdownFiles: report.fieldEvidenceIntake.groupMarkdownFiles,
    },
    ownerDecisionBrief: {
      included: report.ownerDecisionBrief.included,
      status: report.ownerDecisionBrief.status,
      ready: report.ownerDecisionBrief.ready,
      canDeclareV1Complete: report.ownerDecisionBrief.canDeclareV1Complete,
      decision: report.ownerDecisionBrief.decision,
      unfinishedItems: report.ownerDecisionBrief.unfinishedItems,
    },
    v1V2ScopeBrief: {
      included: report.v1V2ScopeBrief.included,
      status: report.v1V2ScopeBrief.status,
      ready: report.v1V2ScopeBrief.ready,
      summary: report.v1V2ScopeBrief.summary,
      v2Categories: report.v1V2ScopeBrief.v2Categories,
      ownerReview: report.v1V2ScopeBrief.ownerReview,
    },
    productionGoLiveStageChecklist: {
      included: report.productionGoLiveStageChecklist.included,
      status: report.productionGoLiveStageChecklist.status,
      ready: report.productionGoLiveStageChecklist.ready,
      source: report.productionGoLiveStageChecklist.source,
      summary: report.productionGoLiveStageChecklist.summary,
      stages: report.productionGoLiveStageChecklist.stages,
    },
    productionFirstStageExecution: {
      included: report.productionFirstStageExecution.included,
      status: report.productionFirstStageExecution.status,
      ready: report.productionFirstStageExecution.ready,
      checkedAt: report.productionFirstStageExecution.checkedAt,
      summary: report.productionFirstStageExecution.summary,
      productionEnvValuesDryRunCoverage: report.productionFirstStageExecution.productionEnvValuesDryRunCoverage,
      execution: report.productionFirstStageExecution.execution,
      stages: report.productionFirstStageExecution.stages,
      blockingStages: report.productionFirstStageExecution.blockingStages,
      nextActions: report.productionFirstStageExecution.nextActions,
    },
    productionFirstStageEvidenceSuggestions: {
      included: report.productionFirstStageEvidenceSuggestions.included,
      status: report.productionFirstStageEvidenceSuggestions.status,
      ready: report.productionFirstStageEvidenceSuggestions.ready,
      generatedAt: report.productionFirstStageEvidenceSuggestions.generatedAt,
      summary: report.productionFirstStageEvidenceSuggestions.summary,
      suggestions: report.productionFirstStageEvidenceSuggestions.suggestions,
      nextActions: report.productionFirstStageEvidenceSuggestions.nextActions,
    },
    productionPersistenceEvidence: {
      included: report.productionPersistenceEvidence.included,
      status: report.productionPersistenceEvidence.status,
      ready: report.productionPersistenceEvidence.ready,
      checkedAt: report.productionPersistenceEvidence.checkedAt,
      summary: report.productionPersistenceEvidence.summary,
      stages: report.productionPersistenceEvidence.stages,
      blockingStages: report.productionPersistenceEvidence.blockingStages,
      safeguards: report.productionPersistenceEvidence.safeguards,
      nextActions: report.productionPersistenceEvidence.nextActions,
    },
    productionRuntimeSmoke: {
      included: report.productionRuntimeSmoke.included,
      status: report.productionRuntimeSmoke.status,
      ready: report.productionRuntimeSmoke.ready,
      checkedAt: report.productionRuntimeSmoke.checkedAt,
      envFileSource: report.productionRuntimeSmoke.envFileSource,
      envFileSourceLabel: report.productionRuntimeSmoke.envFileSourceLabel,
      envFileFromProductionSetup: report.productionRuntimeSmoke.envFileFromProductionSetup,
      summary: report.productionRuntimeSmoke.summary,
      runtime: report.productionRuntimeSmoke.runtime,
      stages: report.productionRuntimeSmoke.stages,
      blockingStages: report.productionRuntimeSmoke.blockingStages,
      safeguards: report.productionRuntimeSmoke.safeguards,
      nextActions: report.productionRuntimeSmoke.nextActions,
    },
    printChainCloseout: {
      included: report.printChainCloseout.included,
      status: report.printChainCloseout.status,
      ready: report.printChainCloseout.ready,
      checkedAt: report.printChainCloseout.checkedAt,
      summary: report.printChainCloseout.summary,
      stages: report.printChainCloseout.stages,
      blockingStages: report.printChainCloseout.blockingStages,
      nextActions: report.printChainCloseout.nextActions,
    },
    printChainExecution: {
      included: report.printChainExecution.included,
      status: report.printChainExecution.status,
      ready: report.printChainExecution.ready,
      checkedAt: report.printChainExecution.checkedAt,
      summary: report.printChainExecution.summary,
      execution: report.printChainExecution.execution,
      stages: report.printChainExecution.stages,
      blockingStages: report.printChainExecution.blockingStages,
      safeguards: report.printChainExecution.safeguards,
      nextActions: report.printChainExecution.nextActions,
    },
    driverRealDeviceExecution: {
      included: report.driverRealDeviceExecution.included,
      status: report.driverRealDeviceExecution.status,
      ready: report.driverRealDeviceExecution.ready,
      checkedAt: report.driverRealDeviceExecution.checkedAt,
      summary: report.driverRealDeviceExecution.summary,
      execution: report.driverRealDeviceExecution.execution,
      stages: report.driverRealDeviceExecution.stages,
      blockingStages: report.driverRealDeviceExecution.blockingStages,
      nextActions: report.driverRealDeviceExecution.nextActions,
    },
    driverRealDeviceCloseout: {
      included: report.driverRealDeviceCloseout.included,
      status: report.driverRealDeviceCloseout.status,
      ready: report.driverRealDeviceCloseout.ready,
      checkedAt: report.driverRealDeviceCloseout.checkedAt,
      summary: report.driverRealDeviceCloseout.summary,
      stages: report.driverRealDeviceCloseout.stages,
      blockingStages: report.driverRealDeviceCloseout.blockingStages,
      nextActions: report.driverRealDeviceCloseout.nextActions,
    },
    unblockPlan: {
      included: report.unblockPlan.included,
      status: report.unblockPlan.status,
      ready: report.unblockPlan.ready,
      summary: report.unblockPlan.summary,
      phases: report.unblockPlan.phases,
      firstActions: report.unblockPlan.firstActions,
      roleBuckets: report.unblockPlan.roleBuckets,
    },
    safeguards: report.safeguards,
    files: report.files,
  };
}

function formatCommandResult(result) {
  return [
    `V1 go-live handoff pack: ${result.ready ? "READY" : "BLOCKED"} (${result.releaseCandidate.summary?.label || "未返回发布候选汇总"})`,
    result.conclusion,
    `Summary: ${result.files.summaryMarkdown}`,
    `Manifest: ${result.files.handoffManifest}`,
    "",
  ].join("\n");
}

function formatProductionEnvValuesDryRunCoverageLines(coverage, firstStageExecutionIncluded = false) {
  if (!firstStageExecutionIncluded) return [];
  if (!coverage?.included) {
    return [
      "- 真实值 dry-run 覆盖：未纳入；当前第一阶段 latest 不是 `--production-env-values-dry-run` 产物，需先运行真实值片段 dry-run 后再刷新交接包。",
    ];
  }
  return [
    `- 真实值 dry-run 预计 env 预检：${coverage.envPreflightReady ? "ready" : "blocked"} (${coverage.envPreflightPassedCount}/${coverage.envPreflightTotalCount})，阻塞 ${coverage.envPreflightBlockingCount}`,
    `- 真实值 dry-run 预计 intake：${coverage.intakeConfiguredRowCount}/${coverage.intakeRowCount} 行已配置，必填缺失 ${coverage.intakeMissingRequiredVariableCount}，任选组阻塞 ${coverage.intakeAlternativeGroupBlockingCount}`,
    `- 真实值 dry-run 最小阻塞补值：${coverage.minimumBlockingReady ? "ready" : "blocked"} (${coverage.minimumBlockingSatisfiedCount}/${coverage.minimumBlockingTargetCount})，缺 ${coverage.minimumBlockingMissingCount}`,
    `- 真实值 dry-run 建议 / 可选补值：${coverage.minimumWarningReady ? "ready" : "blocked"} (${coverage.minimumWarningSatisfiedCount}/${coverage.minimumWarningTargetCount})，缺 ${coverage.minimumWarningMissingCount}`,
    `- 真实值 dry-run 目标签名：${coverage.minimumBlockingTargetSignature ? "已纳入（仅变量名 / 任选组名）" : "未纳入，需重跑新版 dry-run"}`,
  ];
}

function formatHandoffMarkdown(report) {
  const lines = [
    "# ERP V1 上线交接包",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 当前结论：${report.ready ? "READY" : "BLOCKED"}`,
    `- 发布候选：${report.releaseCandidate.summary?.label || "未返回"} / ${report.releaseCandidate.status}`,
    `- 生产环境修正清单：${report.productionEnvFixChecklist.included ? `${report.productionEnvFixChecklist.fixItemCount} 项 / ${report.productionEnvFixChecklist.status || "unknown"}` : "未纳入，release-candidate 未返回 envPreflight.fixChecklist"}`,
    `- 生产 env 准备报告：${report.productionEnvSetup.included ? `${report.productionEnvSetup.summary?.label || "已纳入"} / ${report.productionEnvSetup.status || "unknown"}` : "未纳入，可先运行生产 env 安全草稿准备器"}`,
    `- 生产 env 真实值校验：${report.productionEnvIntakeVerification.included ? `${report.productionEnvIntakeVerification.summary?.label || "已纳入"} / ${report.productionEnvIntakeVerification.status || "unknown"}` : "未纳入，可先运行真实值 intake 校验器"}`,
    `- 生产环境 / 持久化第一阶段执行：${report.productionFirstStageExecution.included ? `${report.productionFirstStageExecution.summary?.label || "已纳入"} / ${report.productionFirstStageExecution.status || "unknown"}` : "未纳入，可先运行第一阶段执行器"}`,
    `- 第一阶段现场证据建议：${report.productionFirstStageEvidenceSuggestions.included ? `${report.productionFirstStageEvidenceSuggestions.summary?.label || "已纳入"} / ${report.productionFirstStageEvidenceSuggestions.status || "unknown"}` : "未纳入，可先运行第一阶段现场证据建议工具"}`,
    `- 生产持久化留证：${report.productionPersistenceEvidence.included ? `${report.productionPersistenceEvidence.summary?.label || "已纳入"} / ${report.productionPersistenceEvidence.status || "unknown"}` : "未纳入，可先运行生产持久化留证"}`,
    `- 生产 API runtime smoke：${report.productionRuntimeSmoke.included ? `${report.productionRuntimeSmoke.summary?.label || "已纳入"} / ${report.productionRuntimeSmoke.status || "unknown"}` : "未纳入，可先运行生产 API runtime smoke"}`,
    `- 打印链路阶段执行：${report.printChainExecution.included ? `${report.printChainExecution.summary?.label || "已纳入"} / ${report.printChainExecution.status || "unknown"}` : "未纳入，可先运行打印链路阶段执行器"}`,
    `- 打印链路阶段 closeout：${report.printChainCloseout.included ? `${report.printChainCloseout.summary?.label || "已纳入"} / ${report.printChainCloseout.status || "unknown"}` : "未纳入，可先运行打印链路 closeout"}`,
    `- 司机真机阶段执行：${report.driverRealDeviceExecution.included ? `${report.driverRealDeviceExecution.summary?.label || "已纳入"} / ${report.driverRealDeviceExecution.status || "unknown"}` : "未纳入，可先运行司机真机阶段执行器"}`,
    `- 司机真机阶段 closeout：${report.driverRealDeviceCloseout.included ? `${report.driverRealDeviceCloseout.summary?.label || "已纳入"} / ${report.driverRealDeviceCloseout.status || "unknown"}` : "未纳入，可先运行司机真机 closeout"}`,
    `- 现场证据：${report.fieldEvidence.summary?.label || "未返回"} / ${report.fieldEvidence.status}`,
    `- 现场任务：${report.onsiteTaskBoard.included ? `${report.onsiteTaskBoard.summary?.label || "已纳入"} / ${report.onsiteTaskBoard.status || "unknown"}` : "未纳入，请先运行现场角色任务清单生成命令"}`,
    `- 完成度快照：${report.completionSnapshot.included ? `${report.completionSnapshot.summary?.releaseGate || report.completionSnapshot.summary?.label || "已纳入"} / ${report.completionSnapshot.status || "unknown"}` : "未纳入，可先运行 V1 完成度快照生成命令"}`,
    `- 现场证据采集包：${report.fieldEvidenceIntake.included ? `${report.fieldEvidenceIntake.summary?.evidence || report.fieldEvidenceIntake.summary?.label || "已纳入"} / ${report.fieldEvidenceIntake.status || "unknown"}` : "未纳入，可先运行 V1 现场证据采集包生成命令"}`,
    `- 负责人决策摘要：${report.ownerDecisionBrief.included ? `${report.ownerDecisionBrief.canDeclareV1Complete ? "可宣布完成" : "不能宣布完成"} / ${report.ownerDecisionBrief.status || "unknown"}` : "未纳入，可先运行 V1 负责人决策摘要生成命令"}`,
    `- V1/V2 差异摘要：${report.v1V2ScopeBrief.included ? `${report.v1V2ScopeBrief.summary?.v2DifferenceCount ?? "未返回"} 项 V2 差异 / ${report.v1V2ScopeBrief.status || "unknown"}` : "未纳入，可先运行 V1/V2 差异摘要生成命令"}`,
    `- 生产上线组合预检阶段：${report.productionGoLiveStageChecklist.included ? `${report.productionGoLiveStageChecklist.summary?.label || "已纳入"} / ${report.productionGoLiveStageChecklist.status || "unknown"}` : "未纳入，可先运行 V1 go-live suite 生成命令"}`,
    `- 最小解除阻塞：${report.unblockPlan.included ? `${report.unblockPlan.summary?.label || "已纳入"} / ${report.unblockPlan.status || "unknown"}` : "未纳入，可先运行 V1 go-live suite 生成命令"}`,
    `- 说明：${report.conclusion}`,
    "",
    "## 发布门禁",
    "",
    "| 门禁 | 状态 | 汇总 | 说明 |",
    "| --- | --- | --- | --- |",
    ...(report.releaseCandidate.gates.length
      ? report.releaseCandidate.gates.map((gate) =>
          `| ${escapeMarkdownTable(gate.label)} | ${gate.ready ? "通过" : "阻塞"} | ${escapeMarkdownTable(gate.summary)} | ${escapeMarkdownTable(gate.detail)} |`,
        )
      : ["| 未返回 | unknown | 未返回 | 未返回发布门禁 |"]),
    "",
    "## 当前阻塞",
    "",
    "| 来源 | 门禁 | 状态 | 说明 |",
    "| --- | --- | --- | --- |",
    ...(report.releaseCandidate.blockingItems.length
      ? report.releaseCandidate.blockingItems
          .slice(0, 12)
          .map((item) =>
            `| ${escapeMarkdownTable(item.gate)} | ${escapeMarkdownTable(item.label)} | ${escapeMarkdownTable(item.status)} | ${escapeMarkdownTable(item.detail)} |`,
          )
      : ["| 无 | 无 | passed | 当前交接包未返回阻塞项 |"]),
    "",
    "## 阶段 Closeout 报告",
    "",
    "| 阶段 | 是否纳入 | 状态 | 汇总 | 当前阻塞 | 下一步 |",
    "| --- | --- | --- | --- | --- | --- |",
    `| 生产环境 / 持久化 | ${report.productionFirstStageExecution.included ? "已纳入" : "未纳入"} | ${escapeMarkdownTable(report.productionFirstStageExecution.status || "missing")} | ${escapeMarkdownTable(report.productionFirstStageExecution.summary?.label || "未返回")} | ${report.productionFirstStageExecution.blockingStages?.length || 0} | ${escapeMarkdownTable(report.productionFirstStageExecution.nextActions?.[0] || "先运行第一阶段执行器")} |`,
    `| 生产持久化留证 | ${report.productionPersistenceEvidence.included ? "已纳入" : "未纳入"} | ${escapeMarkdownTable(report.productionPersistenceEvidence.status || "missing")} | ${escapeMarkdownTable(report.productionPersistenceEvidence.summary?.label || "未返回")} | ${report.productionPersistenceEvidence.blockingStages?.length || 0} | ${escapeMarkdownTable(report.productionPersistenceEvidence.nextActions?.[0] || "先运行生产持久化留证")} |`,
    `| 生产 API runtime smoke | ${report.productionRuntimeSmoke.included ? "已纳入" : "未纳入"} | ${escapeMarkdownTable(report.productionRuntimeSmoke.status || "missing")} | ${escapeMarkdownTable(report.productionRuntimeSmoke.summary?.label || "未返回")} | ${report.productionRuntimeSmoke.blockingStages?.length || 0} | ${escapeMarkdownTable(report.productionRuntimeSmoke.nextActions?.[0] || "先运行生产 API runtime smoke")} |`,
    `| 真实打印执行 | ${report.printChainExecution.included ? "已纳入" : "未纳入"} | ${escapeMarkdownTable(report.printChainExecution.status || "missing")} | ${escapeMarkdownTable(report.printChainExecution.summary?.label || "未返回")} | ${report.printChainExecution.blockingStages?.length || 0} | ${escapeMarkdownTable(report.printChainExecution.nextActions?.[0] || "先运行打印链路阶段执行器")} |`,
    `| 真实打印链路 | ${report.printChainCloseout.included ? "已纳入" : "未纳入"} | ${escapeMarkdownTable(report.printChainCloseout.status || "missing")} | ${escapeMarkdownTable(report.printChainCloseout.summary?.label || "未返回")} | ${report.printChainCloseout.blockingStages?.length || 0} | ${escapeMarkdownTable(report.printChainCloseout.nextActions?.[0] || "先运行打印链路 closeout")} |`,
    `| 司机真机执行 | ${report.driverRealDeviceExecution.included ? "已纳入" : "未纳入"} | ${escapeMarkdownTable(report.driverRealDeviceExecution.status || "missing")} | ${escapeMarkdownTable(report.driverRealDeviceExecution.summary?.label || "未返回")} | ${report.driverRealDeviceExecution.blockingStages?.length || 0} | ${escapeMarkdownTable(report.driverRealDeviceExecution.nextActions?.[0] || "先运行司机真机阶段执行器")} |`,
    `| 司机真机 closeout | ${report.driverRealDeviceCloseout.included ? "已纳入" : "未纳入"} | ${escapeMarkdownTable(report.driverRealDeviceCloseout.status || "missing")} | ${escapeMarkdownTable(report.driverRealDeviceCloseout.summary?.label || "未返回")} | ${report.driverRealDeviceCloseout.blockingStages?.length || 0} | ${escapeMarkdownTable(report.driverRealDeviceCloseout.nextActions?.[0] || "先运行司机真机 closeout")} |`,
    "",
    "## 生产环境修正清单",
    "",
    ...(report.productionEnvFixChecklist.included
      ? [
          `- 状态：${report.productionEnvFixChecklist.ready ? "READY" : "BLOCKED"}`,
          `- 汇总：${report.productionEnvFixChecklist.summary?.label || "未返回"}`,
          `- 修正项：${report.productionEnvFixChecklist.fixItemCount} 项；阻塞 ${report.productionEnvFixChecklist.blockingItemCount} 项；提醒 ${report.productionEnvFixChecklist.warningItemCount} 项`,
          "",
          "| 负责人 | 项目 | 级别 | 配置数 | 需补变量 | 下一步 |",
          "| --- | --- | --- | --- | --- | --- |",
          ...report.productionEnvFixChecklist.items.slice(0, 12).map((item) =>
            `| ${escapeMarkdownTable(item.ownerRole)} | ${escapeMarkdownTable(item.label)} | ${escapeMarkdownTable(item.severity)} | ${escapeMarkdownTable(`${item.configuredVariableCount}/${item.totalVariableCount}`)} | ${escapeMarkdownTable(item.missingVariables.join(", ") || "无")} | ${escapeMarkdownTable(item.nextAction)} |`,
          ),
        ]
      : [
          "- 未找到生产环境修正清单。建议重新运行 `node scripts/run-v1-release-candidate-check.mjs --use-production-env-setup-env-file --field-evidence-manifest <filled-field-evidence-manifest> --api-base-url <api>`，并确认 release-candidate JSON 中包含 `envPreflight.fixChecklist`；只有绕开 production env setup 报告时才显式传 `--env-file <secure-env-file>`。",
        ]),
    "",
    "## 生产 env 准备报告",
    "",
    ...(report.productionEnvSetup.included
      ? [
          `- 状态：${report.productionEnvSetup.ready ? "READY" : report.productionEnvSetup.setupReady ? "PREPARED / 仍需填真实值" : "BLOCKED"}`,
          `- 汇总：${report.productionEnvSetup.summary?.label || "未返回"}`,
          `- 检查时间：${report.productionEnvSetup.checkedAt || "未返回"}`,
          `- Env 文件：${report.productionEnvSetup.envFile?.path || "未返回"}${report.productionEnvSetup.envFile?.pathRedacted ? "（路径已脱敏）" : ""}；权限 ${report.productionEnvSetup.envFile?.fileMode || "未返回"}；git 忽略 ${report.productionEnvSetup.envFile?.gitIgnored ? "是" : "否"}；已被 git 跟踪 ${report.productionEnvSetup.envFile?.gitTracked ? "是" : "否"}；KEY=VALUE ${report.productionEnvSetup.envFile?.assignmentCount ?? 0} 项，占位 ${report.productionEnvSetup.envFile?.placeholderAssignmentCount ?? 0} 项`,
          `- 生产 env 变量预检：${report.productionEnvSetup.envPreflight?.passedCount ?? 0}/${report.productionEnvSetup.envPreflight?.totalCount ?? 0} 通过；阻塞 ${report.productionEnvSetup.envPreflight?.blockingCount ?? 0} 项；提醒 ${report.productionEnvSetup.envPreflight?.warningCount ?? 0} 项`,
          "",
          "| 项目 | 负责人 | 状态 | 需补变量 | 下一步 |",
          "| --- | --- | --- | --- | --- |",
          ...(report.productionEnvSetup.envPreflight?.remainingFixItems?.length
            ? report.productionEnvSetup.envPreflight.remainingFixItems.map((item) =>
                `| ${escapeMarkdownTable(item.label)} | ${escapeMarkdownTable(item.ownerRole)} | ${escapeMarkdownTable(item.status)} | ${escapeMarkdownTable([...item.missingVariables, ...item.placeholderVariables].join(", ") || "无")} | ${escapeMarkdownTable(item.nextAction)} |`,
              )
            : ["| 无 | 无 | ready | 无 | 继续执行生产环境 / 持久化第一阶段执行器 |"]),
          ...(report.productionEnvSetup.setupFindings.length
            ? [
                "",
                "### 准备器发现",
                "",
                "| 项目 | 状态 | 说明 |",
                "| --- | --- | --- |",
                ...report.productionEnvSetup.setupFindings.map((finding) =>
                  `| ${escapeMarkdownTable(finding.label)} | ${escapeMarkdownTable(finding.status)} | ${escapeMarkdownTable(finding.detail)} |`,
                ),
              ]
            : []),
          ...(report.productionEnvSetup.nextActions.length
            ? [
                "",
                "### 下一步",
                "",
                ...report.productionEnvSetup.nextActions.map((action) => `- ${action}`),
              ]
            : []),
        ]
      : [
        "- 未找到生产 env 准备报告。建议先运行 `node -- scripts/run-v1-production-env-setup.mjs --target <secure-env-file> --json`，生成或复核安全、未跟踪、权限 0600 的生产 env 草稿，再填写真实 PostgreSQL / 对象存储 / 打印 / CUPS / token / manifest 值。",
      ]),
    "",
    "## 生产 env 真实值校验",
    "",
    ...(report.productionEnvIntakeVerification.included
      ? [
          `- 状态：${report.productionEnvIntakeVerification.ready ? "READY" : "BLOCKED"}`,
          `- 汇总：${report.productionEnvIntakeVerification.summary?.label || "未返回"}`,
          `- 检查时间：${report.productionEnvIntakeVerification.checkedAt || "未返回"}`,
          `- 真实值清单：${report.productionEnvIntakeVerification.summary?.configuredRowCount ?? 0}/${report.productionEnvIntakeVerification.summary?.intakeRowCount ?? 0} 行已配置；阻塞 ${report.productionEnvIntakeVerification.summary?.blockingCount ?? 0} 项；提醒 ${report.productionEnvIntakeVerification.summary?.warningCount ?? 0} 项`,
          `- 最小阻塞补值：${report.productionEnvIntakeVerification.summary?.minimumBlockingLabel || "未返回"}；明细 ${report.productionEnvIntakeVerification.summary?.minimumBlockingItemCount ?? report.productionEnvIntakeVerification.minimumBlockingItems.length} 项；先补这些项再跑真实值 dry-run。`,
          `- 任选其一变量组：${report.productionEnvIntakeVerification.summary?.alternativeGroupCount ?? 0} 组；阻塞 ${report.productionEnvIntakeVerification.summary?.alternativeGroupBlockingCount ?? 0} 组；提醒 ${report.productionEnvIntakeVerification.summary?.alternativeGroupWarningCount ?? 0} 组`,
          ...(report.productionEnvIntakeVerification.minimumBlockingItems.length
            ? [
                "",
                "### 最小补值清单",
                "",
                "| # | 负责人 | 项目 | 变量 / 变量组 | 来源系统 | 值类型 | 配置 / 验收 | 下一步 |",
                "| ---: | --- | --- | --- | --- | --- | --- | --- |",
                ...report.productionEnvIntakeVerification.minimumBlockingItems.map((finding, index) =>
                  `| ${index + 1} | ${escapeMarkdownTable(finding.ownerRole || "技术/管理")} | ${escapeMarkdownTable(finding.label)} | ${escapeMarkdownTable(formatProductionEnvIntakeFindingVariable(finding))} | ${escapeMarkdownTable(finding.sourceSystem || "生产配置")} | ${escapeMarkdownTable(finding.expectedValueType || "真实生产值")} | ${finding.configured ? "已配置" : "未配置"} / ${finding.verifiedMarked ? "已验收" : "未验收"} | ${escapeMarkdownTable(finding.nextAction || finding.detail)} |`,
                ),
              ]
            : []),
          "",
          "### 全量阻塞 / 提醒",
          "",
          "| 类型 | 项目 | 变量 / 变量组 | 状态 | 说明 | 下一步 |",
          "| --- | --- | --- | --- | --- | --- |",
          ...(report.productionEnvIntakeVerification.blockingFindings.length
            ? report.productionEnvIntakeVerification.blockingFindings.slice(0, 10).map((finding) =>
                `| ${escapeMarkdownTable(finding.type || "variable")} | ${escapeMarkdownTable(finding.label)} | ${escapeMarkdownTable(formatProductionEnvIntakeFindingVariable(finding))} | ${escapeMarkdownTable(finding.status)} | ${escapeMarkdownTable(finding.detail)} | ${escapeMarkdownTable(finding.nextAction)} |`,
              )
            : ["| 无 | 无 | 无 | ready | 当前没有真实值 intake 阻塞 | 继续执行生产 env 变量预检和第一阶段执行 |"]),
          ...(report.productionEnvIntakeVerification.warningFindings.length
            ? [
                "",
                "### 提醒项",
                "",
                "| 项目 | 变量 / 变量组 | 说明 | 下一步 |",
                "| --- | --- | --- | --- |",
                ...report.productionEnvIntakeVerification.warningFindings.slice(0, 8).map((finding) =>
                  `| ${escapeMarkdownTable(finding.label)} | ${escapeMarkdownTable(formatProductionEnvIntakeFindingVariable(finding))} | ${escapeMarkdownTable(finding.detail)} | ${escapeMarkdownTable(finding.nextAction)} |`,
                ),
              ]
            : []),
        ]
      : [
          "- 未找到生产 env 真实值校验报告。建议现场填完安全 env 文件和 `production-env-real-value-intake.csv` 后运行 `node -- scripts/run-v1-production-env-intake-verify.mjs --use-production-env-setup-env-file --json`，再把 latest 报告纳入交接包；只有绕开 setup 报告时才显式传入 `--env-file <secure-env-file>`。",
        ]),
    "",
    "## 生产 env 真实值片段执行计划",
    "",
    ...(report.productionEnvValueExecutionPlan?.included
      ? [
          `- 状态：${report.productionEnvValueExecutionPlan.readyForFormalMerge ? "DRY-RUN READY / 可进入负责人复核" : report.productionEnvValueExecutionPlan.status || "pending"}`,
          `- 推荐片段模板：${report.productionEnvValueExecutionPlan.recommendedFragment || "production-env-minimum-values-fragment.template.env.example"}`,
          `- 最小补值：${report.productionEnvValueExecutionPlan.minimumBlockingLabel || "未返回"}；明细 ${report.productionEnvValueExecutionPlan.minimumBlockingItemCount ?? 0} 项`,
          `- dry-run 匹配当前最小路径：${report.productionEnvValueExecutionPlan.dryRunMatchesCurrentMinimumPath ? "是" : report.productionEnvValueExecutionPlan.dryRunReady ? "否，需用当前最小片段重跑 dry-run" : "未生成 ready dry-run"}`,
          `- dry-run 新鲜度：${report.productionEnvValueExecutionPlan.dryRunFresh ? "有效" : report.productionEnvValueExecutionPlan.dryRunFreshnessLabel || "未生成"}；有效期 ${report.productionEnvValueExecutionPlan.dryRunProofMaxAgeHours ?? 24} 小时；检查时间 ${report.productionEnvValueExecutionPlan.dryRunProofCheckedAtIncluded ? "已记录" : "未记录"}`,
          `- dry-run 失效时间：${report.productionEnvValueExecutionPlan.dryRunProofExpiresAt || "未生成"}；剩余 ${report.productionEnvValueExecutionPlan.dryRunProofRemainingHours ?? "未生成"} 小时`,
          "- dry-run 不写目标 env；正式合并必须使用安全未跟踪真实值片段。",
          "",
          "### 先跑 dry-run",
          "",
          "```bash",
          report.productionEnvValueExecutionPlan.dryRunCommand,
          "```",
          "",
          "### dry-run 无阻塞后正式合并并继续第一阶段",
          "",
          "```bash",
          report.productionEnvValueExecutionPlan.formalMergeCommand,
          "```",
          "",
          "### 复核 / 刷新",
          "",
          "```bash",
          report.productionEnvValueExecutionPlan.intakeVerifyCommand,
          report.productionEnvValueExecutionPlan.suiteRefreshCommand,
          "```",
          "",
          "### 执行注意",
          "",
          ...report.productionEnvValueExecutionPlan.nextActions.map((action) => `- ${action}`),
        ]
      : [
          "- 未生成真实值片段执行计划。建议先重新运行生产 env setup 和 go-live suite，确认交接包里包含 `production-env-minimum-values-fragment.template.env.example`。",
        ]),
    "",
    "## 生产环境 / 持久化第一阶段执行",
    "",
    ...(report.productionFirstStageExecution.included
      ? [
          `- 状态：${report.productionFirstStageExecution.ready ? "READY" : "BLOCKED"}`,
          `- 汇总：${report.productionFirstStageExecution.summary?.label || "未返回"}`,
          `- 检查时间：${report.productionFirstStageExecution.checkedAt || "未返回"}`,
          `- Env 文件数量：${report.productionFirstStageExecution.execution?.envFileCount ?? 0}；仅计划：${report.productionFirstStageExecution.execution?.planOnly ? "是" : "否"}；迁移执行请求：${report.productionFirstStageExecution.execution?.applyMigrations ? "是" : "否"}；迁移 apply 需显式参数：${report.productionFirstStageExecution.execution?.migrationApplyRequiresExplicitFlag === false ? "否" : "是"}`,
          ...formatProductionEnvValuesDryRunCoverageLines(
            report.productionFirstStageExecution.productionEnvValuesDryRunCoverage,
            report.productionFirstStageExecution.included,
          ),
          "",
          "| 顺序 | 步骤 | 状态 | 说明 | 下一步 |",
          "| ---: | --- | --- | --- | --- |",
          ...(report.productionFirstStageExecution.stages.length
            ? report.productionFirstStageExecution.stages.map((stage, index) =>
                `| ${index + 1} | ${escapeMarkdownTable(stage.label)} | ${stage.status === "passed" ? "通过" : stage.status === "planned" ? "计划" : stage.status === "error" ? "错误" : "待处理"} | ${escapeMarkdownTable(stage.detail || stage.evidence?.summaryLabel || "未返回")} | ${escapeMarkdownTable(stage.nextActions?.[0] || "按第一阶段执行器结果处理")} |`,
              )
            : ["| 1 | 未返回 | 待处理 | 未返回第一阶段步骤 | 重新运行第一阶段执行器 |"]),
          ...(report.productionFirstStageExecution.blockingStages.length
            ? [
                "",
                "### 当前阻塞步骤",
                "",
                "| 步骤 | 状态 | 说明 |",
                "| --- | --- | --- |",
                ...report.productionFirstStageExecution.blockingStages.map((stage) =>
                  `| ${escapeMarkdownTable(stage.label)} | ${escapeMarkdownTable(stage.status)} | ${escapeMarkdownTable(stage.detail)} |`,
                ),
              ]
            : []),
          ...(report.productionFirstStageExecution.nextActions.length
            ? [
                "",
                "### 下一步",
                "",
                ...report.productionFirstStageExecution.nextActions.map((action) => `- ${action}`),
              ]
            : []),
        ]
      : [
          "- 未找到生产环境 / 持久化第一阶段执行报告。建议先运行 `node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --json`，确认生产 env 审计、变量预检、数据库迁移计划、持久化留证、生产 API smoke 和第一阶段 closeout；如需绕开 setup 报告，再改用 `--env-file <secure-env-file>`。",
        ]),
    "",
    "## 生产持久化留证",
    "",
    ...(report.productionPersistenceEvidence.included
      ? [
          `- 状态：${report.productionPersistenceEvidence.ready ? "READY" : "BLOCKED"}`,
          `- 汇总：${report.productionPersistenceEvidence.summary?.label || "未返回"}`,
          `- 检查时间：${report.productionPersistenceEvidence.checkedAt || "未返回"}`,
          `- Env 来源：${report.productionPersistenceEvidence.summary?.envFileSourceLabel || "未记录"}；持久化 env ${report.productionPersistenceEvidence.summary?.persistenceEnvReady ? "通过" : "未通过"}；PostgreSQL ${report.productionPersistenceEvidence.summary?.postgresReady ? "通过" : "未通过"}；备份恢复 ${report.productionPersistenceEvidence.summary?.postgresBackupRestoreReady ? "通过" : "未通过"}；对象存储 ${report.productionPersistenceEvidence.summary?.objectStorageReady ? "通过" : "未通过"}；bucket 治理 ${report.productionPersistenceEvidence.summary?.objectStorageGovernanceReady ? "通过" : "未通过"}`,
          "",
          "| 顺序 | 阶段 | 状态 | 汇总 | 下一步 |",
          "| ---: | --- | --- | --- | --- |",
          ...(report.productionPersistenceEvidence.stages.length
            ? report.productionPersistenceEvidence.stages.map((stage, index) =>
                `| ${index + 1} | ${escapeMarkdownTable(stage.label)} | ${stage.status === "passed" ? "通过" : stage.status === "warning" ? "提醒" : "待处理"} | ${escapeMarkdownTable(stage.summary?.label || stage.detail || "未返回")} | ${escapeMarkdownTable(stage.nextActions?.[0] || "按持久化留证结果处理")} |`,
              )
            : ["| 1 | 未返回 | 待处理 | 未返回持久化留证阶段 | 重新运行生产持久化留证 |"]),
          ...(report.productionPersistenceEvidence.blockingStages.length
            ? [
                "",
                "### 当前阻塞阶段",
                "",
                "| 阶段 | 状态 | 说明 |",
                "| --- | --- | --- |",
                ...report.productionPersistenceEvidence.blockingStages.map((stage) =>
                  `| ${escapeMarkdownTable(stage.label)} | ${escapeMarkdownTable(stage.status)} | ${escapeMarkdownTable(stage.summary?.label || stage.detail)} |`,
                ),
              ]
            : []),
          ...(report.productionPersistenceEvidence.nextActions.length
            ? [
                "",
                "### 下一步",
                "",
                ...report.productionPersistenceEvidence.nextActions.map((action) => `- ${action}`),
              ]
            : []),
        ]
      : [
          "- 未找到生产持久化留证报告。建议先运行 `node -- scripts/run-v1-production-persistence-evidence.mjs --use-production-env-setup-env-file --json`，确认 PostgreSQL、备份恢复、对象存储 live 预检和 bucket 治理。",
        ]),
    "",
    "## 生产 API runtime smoke",
    "",
    ...(report.productionRuntimeSmoke.included
      ? [
          `- 状态：${report.productionRuntimeSmoke.ready ? "READY" : "BLOCKED"}`,
          `- 汇总：${report.productionRuntimeSmoke.summary?.label || "未返回"}`,
          `- 检查时间：${report.productionRuntimeSmoke.checkedAt || "未返回"}`,
          `- env 来源：${report.productionRuntimeSmoke.envFileSourceLabel || "未返回"}；复用 production env setup ${report.productionRuntimeSmoke.envFileFromProductionSetup ? "是" : "否"}`,
          `- 运行模式：${report.productionRuntimeSmoke.runtime?.runtimeMode || "未返回"}；长驻 API 探测 ${report.productionRuntimeSmoke.runtime?.externalApiProbed ? "是" : "否"}；生产 env 已应用 ${report.productionRuntimeSmoke.runtime?.productionEnvFileApplied ? "是" : "否"}；仓储 ${report.productionRuntimeSmoke.runtime?.repositoryProfile || "未返回"}；附件存储 ${report.productionRuntimeSmoke.runtime?.attachmentObjectStorageKind || "未返回"}；对账导出存储 ${report.productionRuntimeSmoke.runtime?.statementExportObjectStorageKind || "未返回"}`,
          "",
          "| 顺序 | 阶段 | 状态 | 汇总 | 下一步 |",
          "| ---: | --- | --- | --- | --- |",
          ...(report.productionRuntimeSmoke.stages.length
            ? report.productionRuntimeSmoke.stages.map((stage, index) =>
                `| ${index + 1} | ${escapeMarkdownTable(stage.label)} | ${stage.status === "passed" ? "通过" : stage.status === "warning" ? "提醒" : "待处理"} | ${escapeMarkdownTable(stage.summary?.label || stage.detail || "未返回")} | ${escapeMarkdownTable(stage.nextActions?.[0] || "按 runtime smoke 结果处理")} |`,
              )
            : ["| 1 | 未返回 | 待处理 | 未返回 runtime smoke 阶段 | 重新运行生产 API runtime smoke |"]),
          ...(report.productionRuntimeSmoke.blockingStages.length
            ? [
                "",
                "### 当前阻塞阶段",
                "",
                "| 阶段 | 状态 | 说明 |",
                "| --- | --- | --- |",
                ...report.productionRuntimeSmoke.blockingStages.map((stage) =>
                  `| ${escapeMarkdownTable(stage.label)} | ${escapeMarkdownTable(stage.status)} | ${escapeMarkdownTable(stage.summary?.label || stage.detail)} |`,
                ),
              ]
            : []),
          ...(report.productionRuntimeSmoke.nextActions.length
            ? [
                "",
                "### 下一步",
                "",
                ...report.productionRuntimeSmoke.nextActions.map((action) => `- ${action}`),
              ]
            : []),
        ]
      : [
          "- 未找到生产 API runtime smoke 报告。建议在真实生产 env 填完并启动 API 后运行 `node -- scripts/run-v1-production-runtime-smoke.mjs --use-production-env-setup-env-file --api-base-url <production-api-base-url> --json`，确认长驻 API 已应用生产 env 且进入 PostgreSQL / 对象存储 profile；如需绕开 setup 报告，可改用 `--env-file <secure-env-file>`。",
        ]),
    "",
    "## 第一阶段现场证据建议",
    "",
    ...(report.productionFirstStageEvidenceSuggestions.included
      ? [
          `- 状态：REVIEW REQUIRED / ${report.productionFirstStageEvidenceSuggestions.status || "unknown"}`,
          `- 汇总：${report.productionFirstStageEvidenceSuggestions.summary?.label || "未返回"}`,
          `- 生成时间：${report.productionFirstStageEvidenceSuggestions.generatedAt || "未返回"}`,
          `- 建议自动接受：${report.productionFirstStageEvidenceSuggestions.summary?.autoAcceptedSuggestionCount ?? 0} 项；部分自动化支撑：${report.productionFirstStageEvidenceSuggestions.summary?.partialSuggestionCount ?? 0} 项；仍需人工证据：${report.productionFirstStageEvidenceSuggestions.summary?.manualOnlyCount ?? 0} 项；保留已有现场填写：${report.productionFirstStageEvidenceSuggestions.summary?.preservedExistingCount ?? 0} 项`,
          "- 说明：该建议只用于负责人复核 suggested CSV，不能替代现场证据、签字、release candidate 刷新或 V1 完成声明。",
          "",
          "| 分组 | 证据项 | 覆盖 | 建议状态 | 建议证据编号 | 建议备注 |",
          "| --- | --- | --- | --- | --- | --- |",
          ...(report.productionFirstStageEvidenceSuggestions.suggestions.length
            ? report.productionFirstStageEvidenceSuggestions.suggestions.map((item) =>
                `| ${escapeMarkdownTable(item.groupKey)} | ${escapeMarkdownTable(item.itemLabel || item.itemKey)} | ${escapeMarkdownTable(item.coverage)} | ${escapeMarkdownTable(item.status)} | ${item.evidenceRefSuggested ? "是" : "否"} | ${item.noteSuggested ? "是" : "否"} |`,
              )
            : ["| 未返回 | 未返回 | 未返回 | 未返回 | 否 | 否 |"]),
          ...(report.productionFirstStageEvidenceSuggestions.nextActions.length
            ? [
                "",
                "### 下一步",
                "",
                ...report.productionFirstStageEvidenceSuggestions.nextActions.map((action) => `- ${action}`),
              ]
            : []),
        ]
      : [
          "- 未找到第一阶段现场证据建议。建议在生产持久化留证和 runtime smoke 生成后运行 `node scripts/run-v1-production-first-stage-evidence-suggestions.mjs --persistence-evidence-json .erp-local-storage/v1-production-persistence-evidence/latest.json --runtime-smoke-json .erp-local-storage/v1-production-runtime-smoke/latest.json --evidence-csv .erp-local-storage/v1-field-evidence-intake/evidence-items.csv --output-dir .erp-local-storage/v1-production-first-stage-evidence-suggestions`，再由现场负责人复核 suggested CSV。",
        ]),
    "",
    "## 真实打印链路阶段执行",
    "",
    ...(report.printChainExecution.included
      ? [
          `- 状态：${report.printChainExecution.ready ? "READY" : "BLOCKED"}`,
          `- 汇总：${report.printChainExecution.summary?.label || "未返回"}`,
          `- 检查时间：${report.printChainExecution.checkedAt || "未返回"}`,
          `- 仅计划：${report.printChainExecution.execution?.planOnly ? "是" : "否"}；操作人：${report.printChainExecution.execution?.operatorId || "未返回"}；需独立 CUPS 预检：${report.printChainExecution.execution?.standaloneCupsPreflightRequired === false ? "否" : "是"}；只覆盖打印阶段 closeout：${report.printChainExecution.execution?.closeoutCoversOnlyPrintStage === false ? "否" : "是"}`,
          "",
          "| 顺序 | 步骤 | 状态 | 说明 | 下一步 |",
          "| ---: | --- | --- | --- | --- |",
          ...(report.printChainExecution.stages.length
            ? report.printChainExecution.stages.map((stage, index) =>
                `| ${index + 1} | ${escapeMarkdownTable(stage.label)} | ${stage.status === "passed" ? "通过" : stage.status === "planned" ? "计划" : stage.status === "error" ? "错误" : "待处理"} | ${escapeMarkdownTable(stage.detail || stage.evidence?.summaryLabel || "未返回")} | ${escapeMarkdownTable(stage.nextActions?.[0] || "按打印链路执行器结果处理")} |`,
              )
            : ["| 1 | 未返回 | 待处理 | 未返回打印链路执行步骤 | 重新运行打印链路阶段执行器 |"]),
          ...(report.printChainExecution.blockingStages.length
            ? [
                "",
                "### 当前阻塞步骤",
                "",
                "| 步骤 | 状态 | 说明 |",
                "| --- | --- | --- |",
                ...report.printChainExecution.blockingStages.map((stage) =>
                  `| ${escapeMarkdownTable(stage.label)} | ${escapeMarkdownTable(stage.status)} | ${escapeMarkdownTable(stage.detail)} |`,
                ),
              ]
            : []),
          ...(report.printChainExecution.nextActions.length
            ? [
                "",
                "### 下一步",
                "",
                ...report.printChainExecution.nextActions.map((action) => `- ${action}`),
              ]
            : []),
        ]
      : [
          "- 未找到打印链路阶段执行报告。建议先运行 `node -- scripts/run-v1-print-chain-execution.mjs --field-evidence-manifest <filled-field-evidence-manifest> --json`，确认真实 CUPS 队列 non-printing 预检、运行中 API 打印 readiness 和 print_hardware 现场证据 closeout。",
        ]),
    "",
    "## 司机真机阶段执行",
    "",
    ...(report.driverRealDeviceExecution.included
      ? [
          `- 状态：${report.driverRealDeviceExecution.ready ? "READY" : "BLOCKED"}`,
          `- 汇总：${report.driverRealDeviceExecution.summary?.label || "未返回"}`,
          `- 检查时间：${report.driverRealDeviceExecution.checkedAt || "未返回"}`,
          `- 仅计划：${report.driverRealDeviceExecution.execution?.planOnly ? "是" : "否"}；司机操作人：${report.driverRealDeviceExecution.execution?.driverOperatorId || "未返回"}；只覆盖司机阶段 closeout：${report.driverRealDeviceExecution.execution?.closeoutCoversOnlyDriverStage === false ? "否" : "是"}`,
          "",
          "| 顺序 | 步骤 | 状态 | 说明 | 下一步 |",
          "| ---: | --- | --- | --- | --- |",
          ...(report.driverRealDeviceExecution.stages.length
            ? report.driverRealDeviceExecution.stages.map((stage, index) =>
                `| ${index + 1} | ${escapeMarkdownTable(stage.label)} | ${stage.status === "passed" ? "通过" : stage.status === "planned" ? "计划" : stage.status === "error" ? "错误" : "待处理"} | ${escapeMarkdownTable(stage.detail || stage.evidence?.summaryLabel || "未返回")} | ${escapeMarkdownTable(stage.nextActions?.[0] || "按司机真机执行器结果处理")} |`,
              )
            : ["| 1 | 未返回 | 待处理 | 未返回司机真机执行步骤 | 重新运行司机真机阶段执行器 |"]),
          ...(report.driverRealDeviceExecution.blockingStages.length
            ? [
                "",
                "### 当前阻塞步骤",
                "",
                "| 步骤 | 状态 | 说明 |",
                "| --- | --- | --- |",
                ...report.driverRealDeviceExecution.blockingStages.map((stage) =>
                  `| ${escapeMarkdownTable(stage.label)} | ${escapeMarkdownTable(stage.status)} | ${escapeMarkdownTable(stage.detail)} |`,
                ),
              ]
            : []),
          ...(report.driverRealDeviceExecution.nextActions.length
            ? [
                "",
                "### 下一步",
                "",
                ...report.driverRealDeviceExecution.nextActions.map((action) => `- ${action}`),
              ]
            : []),
        ]
      : [
          "- 未找到司机真机阶段执行报告。建议先运行 `node -- scripts/run-v1-driver-real-device-execution.mjs --field-evidence-manifest <filled-field-evidence-manifest> --json`，确认运行中 API 司机 readiness 已保存，并汇总 driver_native_device 现场证据 closeout。",
        ]),
    "",
    "## 生产上线组合预检阶段清单",
    "",
    ...(report.productionGoLiveStageChecklist.included
      ? [
          `- 状态：${report.productionGoLiveStageChecklist.ready ? "READY" : "BLOCKED"}`,
          `- 汇总：${report.productionGoLiveStageChecklist.summary?.label || "未返回"}`,
          `- 来源：${report.productionGoLiveStageChecklist.source === "live_precheck" ? "live 组合预检" : "release-candidate 快照，仍需现场执行 live 组合预检"}`,
          "",
          "| 顺序 | 阶段 | 状态 | 来源摘要 | 负责人 | 下一步 | 复核 | 留证 |",
          "| ---: | --- | --- | --- | --- | --- | --- | --- |",
          ...(report.productionGoLiveStageChecklist.stages.length
            ? report.productionGoLiveStageChecklist.stages.map((stage) =>
                `| ${stage.stageOrder} | ${escapeMarkdownTable(stage.label)} | ${stage.ready ? "通过" : "待处理"} | ${escapeMarkdownTable(stage.sourceSummary)} | ${escapeMarkdownTable(stage.ownerRole)} | ${escapeMarkdownTable(stage.nextAction)} | ${escapeMarkdownTable(stage.verificationSteps[0] || "按阶段命令复核")} | ${escapeMarkdownTable(stage.evidenceToKeep[0] || "保留阶段报告")} |`,
              )
            : ["| 1 | 未返回 | 待处理 | 未返回 | 技术/管理 | 先重新生成 V1 go-live suite | 按阶段命令复核 | 保留阶段报告 |"]),
        ]
      : [
          "- 未找到生产上线组合预检阶段清单。建议先运行 `node scripts/run-v1-go-live-suite.mjs --sync-canonical-latest --json`，或在生成交接包时传入 `--production-go-live-stage-checklist-json` 和 `--production-go-live-stage-checklist-markdown`。",
        ]),
    "",
    "## 最小解除阻塞清单",
    "",
    ...(report.unblockPlan.included
      ? [
          `- 状态：${report.unblockPlan.ready ? "READY" : "BLOCKED"}`,
          `- 汇总：${report.unblockPlan.summary?.label || "未返回"}`,
          `- 待处理总数：${report.unblockPlan.summary?.taskCount ?? "未返回"} 项；发布门禁 ${report.unblockPlan.summary?.releaseTaskCount ?? "未返回"} 项；现场证据 ${report.unblockPlan.summary?.evidenceTaskCount ?? "未返回"} 项；签字 / 边界 ${(report.unblockPlan.summary?.signoffTaskCount || 0) + (report.unblockPlan.summary?.boundaryTaskCount || 0)} 项`,
          "",
          "| 顺序 | 阶段 | 待处理 | 负责人角色 | 先做什么 |",
          "| ---: | --- | ---: | --- | --- |",
          ...(report.unblockPlan.phases.length
            ? report.unblockPlan.phases
                .filter((phase) => phase.taskCount > 0)
                .map((phase, index) =>
                  `| ${index + 1} | ${escapeMarkdownTable(phase.label)} | ${phase.taskCount} | ${escapeMarkdownTable(phase.roles.join("、") || "未分配")} | ${escapeMarkdownTable(phase.nextStep)} |`,
                )
            : ["| 1 | 未返回 | 0 | 未返回 | 先重新生成 V1 go-live suite |"]),
          "",
          "### 最先处理的 10 项",
          "",
          "| 类型 | 分组 | 任务 | 主负责人 | 下一步 |",
          "| --- | --- | --- | --- | --- |",
          ...(report.unblockPlan.firstActions.length
            ? report.unblockPlan.firstActions.map((task) =>
                `| ${escapeMarkdownTable(task.type)} | ${escapeMarkdownTable(task.group)} | ${escapeMarkdownTable(task.title)} | ${escapeMarkdownTable(task.primaryRole)} | ${escapeMarkdownTable(task.action)} |`,
              )
            : ["| 无 | 无 | 当前无阻塞项 | 无 | 进入负责人最终复核 |"]),
        ]
      : [
          "- 未找到最小解除阻塞清单。建议先运行 `node scripts/run-v1-go-live-suite.mjs --sync-canonical-latest --json`，或在生成交接包时传入 `--unblock-plan-json` 和 `--unblock-plan-markdown`。",
        ]),
    "",
    "## 现场角色任务清单",
    "",
    ...(report.onsiteTaskBoard.included
      ? [
          `- 状态：${report.onsiteTaskBoard.ready ? "READY" : "BLOCKED"}`,
          `- 汇总：${report.onsiteTaskBoard.summary?.label || "未返回任务汇总"}`,
          `- 岗位任务文件：${report.onsiteTaskBoard.roleMarkdownFiles?.length || 0} 个`,
          "",
          "| 角色 | 待处理任务 | P0 |",
          "| --- | ---: | ---: |",
          ...(report.onsiteTaskBoard.roleBuckets.length
            ? report.onsiteTaskBoard.roleBuckets
                .filter((bucket) => bucket.taskCount > 0)
                .map((bucket) => `| ${escapeMarkdownTable(bucket.role)} | ${bucket.taskCount} | ${bucket.p0TaskCount} |`)
            : ["| 未返回 | 0 | 0 |"]),
        ]
      : [
          "- 未找到现场角色任务清单快照。建议先运行 `node scripts/run-v1-onsite-task-board.mjs --field-evidence-manifest <filled-field-evidence-manifest> --release-candidate-json .erp-local-storage/v1-release-candidate/latest.json --output-dir .erp-local-storage/v1-onsite-task-board`。",
        ]),
    "",
    "## 现场证据采集包",
    "",
    ...(report.fieldEvidenceIntake.included
      ? [
          `- 状态：${report.fieldEvidenceIntake.ready ? "READY" : "BLOCKED"}`,
          `- 现场证据：${report.fieldEvidenceIntake.summary?.evidence || "未返回"}`,
          `- 证据组完成：${report.fieldEvidenceIntake.summary?.evidenceGroups || "未返回"}`,
          `- 必填证据完成：${report.fieldEvidenceIntake.summary?.requiredEvidenceItems || "未返回"}`,
          `- 负责人签字完成：${report.fieldEvidenceIntake.summary?.signoffs || "未返回"}`,
          `- V1 / V2 边界：${report.fieldEvidenceIntake.summary?.boundary || "未返回"}`,
          `- 分组采集单：${report.fieldEvidenceIntake.groupMarkdownFiles?.length || 0} 个`,
        ]
      : [
          "- 未找到 V1 现场证据采集包。建议先运行 `node scripts/run-v1-field-evidence-intake-pack.mjs --manifest <filled-field-evidence-manifest> --release-candidate-json .erp-local-storage/v1-release-candidate/latest.json --onsite-task-board-json .erp-local-storage/v1-onsite-task-board/latest.json --completion-snapshot-json .erp-local-storage/v1-completion-snapshot/latest.json --output-dir .erp-local-storage/v1-field-evidence-intake`。",
        ]),
    "",
    "## V1 完成度快照",
    "",
    ...(report.completionSnapshot.included
      ? [
          `- 状态：${report.completionSnapshot.ready ? "READY" : "BLOCKED"}`,
          `- 需求确认度：${report.completionSnapshot.summary?.requirements || "未返回"}`,
          `- P0 原型 / 代码完成度：${report.completionSnapshot.summary?.p0Prototype || "未返回"}`,
          `- V1 真实上线就绪度：${report.completionSnapshot.summary?.v1Readiness || "未返回"}`,
          `- 发布候选：${report.completionSnapshot.summary?.releaseGate || "未返回"}`,
          `- 现场任务：${report.completionSnapshot.summary?.onsiteTaskCount ?? "未返回"} 个`,
          "",
          "| 阻塞来源 | 数量 |",
          "| --- | ---: |",
          ...(report.completionSnapshot.blockerGroups.length
            ? report.completionSnapshot.blockerGroups.map((group) => `| ${escapeMarkdownTable(group.gate)} | ${group.count} |`)
            : ["| 无 | 0 |"]),
        ]
      : [
          "- 未找到 V1 完成度快照。建议先运行 `node scripts/run-v1-completion-snapshot.mjs --release-candidate-json .erp-local-storage/v1-release-candidate/latest.json --onsite-task-board-json .erp-local-storage/v1-onsite-task-board/latest.json --output-dir .erp-local-storage/v1-completion-snapshot`。",
        ]),
    "",
    "## 负责人决策摘要",
    "",
    ...(report.ownerDecisionBrief.included
      ? [
          `- 状态：${report.ownerDecisionBrief.ready ? "READY" : "BLOCKED"}`,
          `- 是否可以宣布 V1 完成：${report.ownerDecisionBrief.canDeclareV1Complete ? "可以" : "不可以"}`,
          `- 决策建议：${report.ownerDecisionBrief.decision?.recommendation || "未返回"}`,
          `- 负责人需要判断：${report.ownerDecisionBrief.decision?.ownerQuestion || "未返回"}`,
          "",
          "| 类型 | 项目 | 说明 |",
          "| --- | --- | --- |",
          ...(report.ownerDecisionBrief.unfinishedItems?.length
            ? report.ownerDecisionBrief.unfinishedItems.map((item) =>
                `| ${escapeMarkdownTable(item.type)} | ${escapeMarkdownTable(item.label)} | ${escapeMarkdownTable(item.detail)} |`,
              )
            : ["| 无 | 无 | 当前摘要未返回未完成项 |"]),
        ]
      : [
          "- 未找到 V1 负责人决策摘要。建议先运行 `node scripts/run-v1-owner-decision-brief.mjs --completion-snapshot-json .erp-local-storage/v1-completion-snapshot/latest.json --output-dir .erp-local-storage/v1-owner-decision-brief`。",
        ]),
    "",
    "## V1/V2 差异摘要",
    "",
    ...(report.v1V2ScopeBrief.included
      ? [
          `- 状态：${report.v1V2ScopeBrief.ready ? "READY" : "BLOCKED"}`,
          `- V1 必须继续补：${report.v1V2ScopeBrief.summary?.v1MustContinueCount ?? "未返回"} 项`,
          `- V2 计划差异：${report.v1V2ScopeBrief.summary?.v2DifferenceCount ?? "未返回"} 项`,
          `- V2 主题：${report.v1V2ScopeBrief.v2Categories?.length ? report.v1V2ScopeBrief.v2Categories.join("、") : "未分类"}`,
          `- 负责人复核：${report.v1V2ScopeBrief.ownerReview?.question || "未返回"}`,
          `- 复核规则：${report.v1V2ScopeBrief.ownerReview?.approvalRule || "未返回"}`,
        ]
      : [
          "- 未找到 V1/V2 差异摘要。建议先运行 `node scripts/run-v1-v2-scope-brief.mjs --completion-snapshot-json .erp-local-storage/v1-completion-snapshot/latest.json --output-dir .erp-local-storage/v1-v2-scope-brief`。",
        ]),
    "",
    "## V1 范围",
    "",
    ...(report.v1Scope.length ? report.v1Scope.map((item) => `- ${item}`) : ["- 未返回 V1 范围"]),
    "",
    "## V2 计划差异",
    "",
    ...(report.v2Differences.length ? report.v2Differences.map((item) => `- ${item}`) : ["- 未返回 V2 差异"]),
    "",
    "## 交接文件",
    "",
    "| 文件 | 用途 |",
    "| --- | --- |",
    "| `handoff-summary.zh-CN.md` | 给负责人阅读的当前结论、阻塞项、V1/V2 差异和文件索引 |",
    "| `handoff-manifest.json` | 机器可读交接包索引，不含原始 evidenceRef |",
    "| `release-candidate.latest.md/json` | 当前发布候选报告快照 |",
    "| `production-env-fix-checklist.zh-CN.md` | 按负责角色拆分的生产环境变量修正清单，存在时自动生成 |",
    "| `production-env-fix-checklist.csv` | 可用于现场逐项跟进的生产环境变量修正表，存在时自动生成 |",
    "| `production-env-real-value-intake.zh-CN.md` | 生产 env 真实值填写 / 验收清单，标明任选其一变量组、来源系统和证据编号列 |",
    "| `production-env-real-value-intake.csv` | 同一真实值填写 / 验收清单的表格版本，便于现场逐行勾选 |",
    "| `production-env-minimum-real-value-intake.zh-CN.md` | 当前最小 blocking 补值路径的填写 / 验收清单，优先用于第一轮 11 项真实值分派 |",
    "| `production-env-minimum-real-value-intake.csv` | 同一最小补值清单的表格版本，便于现场先逐项勾选 |",
    "| `production-env-minimum-values-fragment.template.env.example` | 只含当前最小 blocking 补值路径，优先复制成安全未跟踪片段并先 dry-run |",
    "| `production-env-values-fragment.template.env.example` | 可复制成安全未跟踪真实值片段，并传给第一阶段执行器的 `--production-env-values-file` |",
    "| `production-env-fill-template.env.example` | 从当前缺失 / 占位变量生成的安全 env 填写草稿，存在时自动生成 |",
    "| `production-env-setup.latest.md/json` | 生产 env 安全草稿准备器的脱敏报告，存在时自动纳入；不包含真实 env 文件内容 |",
    "| `production-env-intake-verify.latest.md/json` | 生产 env 真实值填写后的脱敏校验结果，存在时自动纳入；不包含真实 env 值或路径 |",
    "| `production-go-live-stage-checklist.latest.zh-CN.md/json` | 生产上线组合预检五阶段复核和留证清单，存在时自动纳入 |",
    "| `production-first-stage-execution.latest.md/json` | 生产环境 / 持久化第一阶段执行和 closeout 汇总，存在时自动纳入 |",
    "| `production-first-stage-evidence-suggestions.latest.md/json` | 第一阶段现场证据回填建议，存在时自动纳入；只供负责人复核 |",
    "| `production-first-stage-evidence-suggestions.csv` | 第一阶段 suggested evidence CSV，存在时自动纳入；不能直接当作签字证据 |",
    "| `production-persistence-evidence.latest.md/json` | 生产持久化底层留证报告，存在时自动纳入；覆盖 PostgreSQL、备份恢复、对象存储 live 预检和 bucket 治理 |",
    "| `production-runtime-smoke.latest.md/json` | 生产 API runtime smoke 报告，存在时自动纳入；覆盖长驻 API / 临时 API 运行态持久化 profile |",
    "| `print-chain-execution.latest.md/json` | 真实打印链路阶段 CUPS 预检、打印 readiness 和 closeout 执行链路，存在时自动纳入 |",
    "| `print-chain-closeout.latest.md/json` | 真实打印链路阶段 closeout 结论，存在时自动纳入 |",
    "| `driver-real-device-execution.latest.md/json` | 司机真机阶段 readiness 保存和 closeout 执行链路，存在时自动纳入 |",
    "| `driver-real-device-closeout.latest.md/json` | 司机真机阶段 closeout 结论，存在时自动纳入 |",
    "| `v1-completion-snapshot.latest.md/json` | 当前 V1 完成度、阻塞来源和 V2 差异快照，存在时自动纳入 |",
    "| `v1-owner-decision-brief.latest.zh-CN.md/json` | 给负责人看的 V1 是否可宣布完成、已完成 / 未完成和 V2 差异摘要，存在时自动纳入 |",
    "| `v1-v2-scope-brief.latest.zh-CN.md/json` | 给负责人看的 V1 必须继续补齐项、V2 延后主题和复核规则，存在时自动纳入 |",
    "| `v1-unblock-plan.latest.zh-CN.md/json` | 按阶段排序的最小解除阻塞清单和最先处理项，存在时自动纳入 |",
    "| `v1-onsite-task-board.latest.md/json` | 按角色分组的现场任务清单快照，存在时自动纳入 |",
    "| `onsite-task-board-roles/*.latest.md` | 可分发给各岗位的单独现场任务清单，存在时自动纳入 |",
    "| `field-evidence-intake/` | 可分发给现场负责人的证据组采集单、CSV 和签字 / V1-V2 边界确认单，存在时自动纳入 |",
    "| `v1-field-evidence-manifest.redacted.json` | 默认脱敏的现场证据 manifest 快照 |",
    "| `v1-production.env.example` | 只含注释占位的生产环境变量模板 |",
    "| `v1-go-live-runbook.zh-CN.md` | 现场发布前命令顺序和必须留档项 |",
    "| `v1-field-evidence-checklist.zh-CN.md` | 现场证据填写说明 |",
    "| `v1-v2-scope.zh-CN.md` | V1 当前范围和计划 V2 差异 |",
    "",
    "## 安全说明",
    "",
    "- 交接包默认只复制生产 env 模板，不复制真实 env 文件。",
    "- 交接包默认只写脱敏现场证据 manifest；如需内部留存原始 evidenceRef，必须显式使用 `--include-raw-field-evidence`。",
    "- 生产 env 准备报告只应来自 `run-v1-production-env-setup.mjs` 输出的脱敏 JSON / Markdown，不应额外附带真实 env 文件、连接串、bucket、secret、token 或命令值。",
    "- 生产 env 真实值校验报告只应来自 `run-v1-production-env-intake-verify.mjs` 输出的脱敏 JSON / Markdown，不应额外附带真实 env 文件路径、连接串、bucket、secret、token、spool 路径或证据原文。",
    "- 第一阶段执行报告只应来自 `run-v1-production-first-stage-execution.mjs` 输出的脱敏 JSON / Markdown，不应额外附带真实 env 文件或密钥截图。",
    "- 第一阶段现场证据建议只应来自 `run-v1-production-first-stage-evidence-suggestions.mjs` 输出的脱敏报告和 suggested CSV；它必须人工复核后再生成 draft manifest，不能替代负责人签字。",
    "- 生产持久化留证报告只应来自 `run-v1-production-persistence-evidence.mjs` 输出的脱敏 JSON / Markdown，不应额外附带真实 env 文件、数据库 URL、endpoint、bucket、secret、对象 key、签名 URL、bucket policy 原文、dump 路径或 payload。",
    "- 生产 API runtime smoke 报告只应来自 `run-v1-production-runtime-smoke.mjs` 输出的脱敏 JSON / Markdown，不应额外附带 API 启动命令原文、真实 env 文件路径、数据库 URL、对象存储密钥、token 或响应 payload。",
    "- 打印链路执行报告只应来自 `run-v1-print-chain-execution.mjs` 输出的脱敏 JSON / Markdown，不应额外附带 CUPS 命令原文、spool 路径、stdout/stderr、标签 payload、扫码原文或本地路径。",
    "- 司机真机执行报告只应来自 `run-v1-driver-real-device-execution.mjs` 输出的脱敏 JSON / Markdown，不应额外附带扫码原文、定位点、照片 payload、token 或本地路径。",
    "- 发布候选报告和现场证据校验报告只应包含状态、计数、阻塞标签和脱敏摘要，不应包含连接串、密钥、命令路径、spool 路径或客户隐私原文。",
    "",
  ];
  return `${lines.join("\n")}`;
}

function buildProductionEnvFixChecklist(envPreflight) {
  const items = Array.isArray(envPreflight?.fixChecklist)
    ? envPreflight.fixChecklist.map((item) => ({
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
        valueGuidance: stringList(item.valueGuidance).length
          ? stringList(item.valueGuidance)
          : defaultProductionEnvFixGuidance(item.key).valueGuidance,
        verificationSteps: stringList(item.verificationSteps).length
          ? stringList(item.verificationSteps)
          : defaultProductionEnvFixGuidance(item.key).verificationSteps,
        nextAction: stringValue(item.nextAction),
      }))
    : [];
  return {
    included: items.length > 0,
    status: stringValue(envPreflight?.status || ""),
    ready: envPreflight?.ready === true,
    checkedAt: stringValue(envPreflight?.checkedAt || ""),
    envFileCount: numberOrZero(envPreflight?.envFileCount),
    summary: envPreflight?.summary || {},
    fixItemCount: items.length,
    blockingItemCount: items.filter((item) => item.severity === "blocking").length,
    warningItemCount: items.filter((item) => item.severity === "warning").length,
    placeholderVariableCount: items.reduce((total, item) => total + item.placeholderVariableCount, 0),
    items,
  };
}

function defaultProductionEnvFixGuidance(key) {
  const guidance = {
    "v1-persistence-profile": {
      valueGuidance: [
        "生产必须显式使用 postgres 仓储 profile；真实连接串只放安全 env 文件。",
        "文件留档 profile 必须切到 object_storage，并与附件对象存储配置同时复核。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "npm run v1-production-profile-live:check",
      ],
    },
    "postgres-restore-validation-env": {
      valueGuidance: [
        "生产恢复演练必须使用专用可重置验证库，不能和生产源库指向同一 host/port/database。",
        "`ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED` 在生产 env 中必须保持 false；实际恢复演练时由负责人显式传 `--allow-restore-reset`。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "node -- scripts/run-v1-production-postgres-backup-restore-check.mjs --use-production-env-setup-env-file --allow-restore-reset",
      ],
    },
    "attachment-object-storage-env": {
      valueGuidance: [
        "endpoint、bucket、access key、secret key 必须来自真实 OSS/S3/COS 或兼容对象存储。",
        "bucket 需要支持附件上传、读回、下载和签名 URL 留档；不要使用本地目录替代。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "node -- scripts/run-v1-production-object-storage-preflight.mjs --use-production-env-setup-env-file",
        "在上线状态页执行附件留档预检，并保留上传 / 读回现场证据。",
      ],
    },
    "statement-export-object-storage-env": {
      valueGuidance: [
        "对账导出可以使用独立 bucket，也可以在附件对象存储完整时复用附件 fallback。",
        "如使用独立 bucket，4 个 ERP_STATEMENT_EXPORT_OBJECT_STORAGE_* 变量必须成套配置。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "node -- scripts/run-v1-production-object-storage-preflight.mjs --use-production-env-setup-env-file",
        "在真实 API 上导出一份客户对账单并确认导出记录可重新下载。",
      ],
    },
    "system-printer-command-bridge-env": {
      valueGuidance: [
        "打印桥必须启用 command_bridge，并指向生产打印桥命令或 Node 命令。",
        "命令参数必须是 JSON array，allowlist 只能列真实允许打印的设备名。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "在上线状态页依次执行 spool 预检和打印门禁预检。",
      ],
    },
    "cups-preflight-env": {
      valueGuidance: [
        "CUPS 模式必须使用 cups_lp，allowlist 只列现场真实 CUPS 队列。",
        "状态命令必须是非出纸命令，例如 lpstat；参数必须是 JSON array。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "在上线状态页执行 CUPS 预检，并保留现场 lpstat / 队列截图证据。",
      ],
    },
    "v1-readiness-identity-env": {
      valueGuidance: [
        "API base URL 必须指向生产 API，不要使用本机 localhost 作为生产验收目标。",
        "办公室和司机验收账号必须是真实生产账号，权限应与现场岗位一致。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "npm run v1-readiness:check",
        "用指定账号在上线状态页执行运行时门禁、司机真机和打印门禁预检。",
      ],
    },
    "v1-field-acceptance-report-env": {
      valueGuidance: [
        "输出目录必须是上线交接包可归档的位置，不能依赖临时目录。",
        "现场验收 API 地址应与 readiness 目标一致，避免报告和实际运行实例不一致。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "生成 V1 现场验收 JSON / Markdown 报告。",
        "把报告编号回填到现场证据采集包后再刷新 go-live suite。",
      ],
    },
    "local-v1-acceptance-bypass-env": {
      valueGuidance: [
        "生产默认不接受本地持久化或本地文件留档。",
        "如业务负责人临时接受，必须填写书面签字编号，且 release candidate 仍需显示 warning。",
      ],
      verificationSteps: [
        "node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
        "确认负责人签字 / V1-V2 边界表已记录该风险是否被接受。",
      ],
    },
    "preflight-redaction-safeguard": {
      valueGuidance: [
        "报告只能输出变量名、计数、状态和脱敏下一步。",
        "不要把真实连接串、secret、命令路径、spool 路径或 token 粘贴进交接文档。",
      ],
      verificationSteps: ["npm run v1-production-env-preflight:check", "git diff --check"],
    },
  }[stringValue(key)];
  return {
    valueGuidance: stringList(guidance?.valueGuidance),
    verificationSteps: stringList(guidance?.verificationSteps),
  };
}

function formatProductionEnvFixChecklistMarkdown(report) {
  const checklist = report.productionEnvFixChecklist;
  const lines = [
    "# ERP V1 生产环境修正清单",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 来源 release-candidate：${report.releaseCandidate.generatedAt || "未返回"}`,
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
    "- 修正后重新运行生产环境变量预检、release-candidate 和 go-live suite。",
    "- 该清单只帮助分派生产环境配置工作；它不能替代真实服务联通、现场证据、负责人签字或 V1/V2 边界确认。",
    "",
  ];
  return `${lines.join("\n")}`;
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
    `- 生成时间：${report.generatedAt}`,
    `- 来源 release-candidate：${report.releaseCandidate.generatedAt || "未返回"}`,
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
    lines.push("当前 production env fix checklist 没有需要填写的真实值行。", "");
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
    `- 生成时间：${report.generatedAt}`,
    `- 来源 release-candidate：${report.releaseCandidate.generatedAt || "未返回"}`,
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
  const minimumBlockingTargetSignature = buildProductionEnvMinimumRowsTargetSignature(rows);
  return {
    included: Boolean(checklist?.included),
    status: rows.length ? "pending_minimum_real_values_fragment" : "no_blocking_env_values",
    ready: rows.length === 0 && checklist?.ready === true,
    fileName: "production-env-minimum-values-fragment.template.env.example",
    rowCount: rows.length,
    sourceRowCount: checklist?.rowCount ?? 0,
    variableCount: new Set(rows.map((row) => row.variableKey).filter(Boolean)).size,
    chooseOneGroupCount: new Set(rows.map((row) => row.alternativeGroup).filter(Boolean)).size,
    minimumBlockingTargetSignature,
    minimumBlockingTargetSignatureIncluded: Boolean(minimumBlockingTargetSignature),
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

function buildProductionEnvValueExecutionPlan({
  productionEnvMinimumValuesFragmentTemplate,
  productionEnvValuesFragmentTemplate,
  productionEnvIntakeVerification,
  productionFirstStageExecution,
  generatedAt = "",
}) {
  const minimumLabel = stringValue(productionEnvIntakeVerification?.summary?.minimumBlockingLabel) || "未返回";
  const minimumItemCount =
    numberOrZero(productionEnvIntakeVerification?.summary?.minimumBlockingItemCount) ||
    numberOrZero(productionEnvMinimumValuesFragmentTemplate?.rowCount);
  const dryRunCoverage = productionFirstStageExecution?.productionEnvValuesDryRunCoverage || {};
  const dryRunIncluded = dryRunCoverage.included === true;
  const dryRunReady = dryRunIncluded && dryRunCoverage.minimumBlockingReady === true && dryRunCoverage.envPreflightReady === true;
  const dryRunCheckedAt = dryRunIncluded
    ? stringValue(dryRunCoverage.checkedAt || productionFirstStageExecution?.checkedAt)
    : "";
  const dryRunFreshness = buildProductionEnvValuesDryRunFreshness({
    checkedAt: dryRunCheckedAt,
    now: generatedAt,
  });
  const currentMinimumBlockingTargetSignature = stringValue(
    productionEnvMinimumValuesFragmentTemplate?.minimumBlockingTargetSignature,
  );
  const dryRunMinimumBlockingTargetSignature = stringValue(dryRunCoverage.minimumBlockingTargetSignature);
  const dryRunMatchesCurrentMinimumPath = Boolean(
    dryRunReady &&
      currentMinimumBlockingTargetSignature &&
      dryRunMinimumBlockingTargetSignature &&
      currentMinimumBlockingTargetSignature === dryRunMinimumBlockingTargetSignature,
  );
  const minimumFragment = productionEnvMinimumValuesFragmentTemplate?.fileName ||
    "production-env-minimum-values-fragment.template.env.example";
  const fullFragment = productionEnvValuesFragmentTemplate?.fileName || "production-env-values-fragment.template.env.example";
  const included = Boolean(productionEnvMinimumValuesFragmentTemplate?.included || productionEnvValuesFragmentTemplate?.included);
  const dryRunFresh = dryRunFreshness.ready === true;
  const readyForFormalMerge = dryRunReady && dryRunMatchesCurrentMinimumPath && dryRunFresh;
  return {
    included,
    status: readyForFormalMerge
      ? "dry_run_ready"
      : dryRunReady && dryRunMatchesCurrentMinimumPath && !dryRunFresh
        ? "dry_run_expired"
        : dryRunReady
        ? "dry_run_stale_or_mismatched"
        : dryRunIncluded
          ? "dry_run_blocked_or_partial"
          : "dry_run_not_included",
    readyForFormalMerge,
    dryRunReady,
    dryRunFresh,
    dryRunFreshnessStatus: dryRunFreshness.status,
    dryRunFreshnessLabel: dryRunFreshness.label,
    dryRunProofMaxAgeHours: dryRunFreshness.maxAgeHours,
    dryRunProofAgeHours: dryRunFreshness.ageHours,
    dryRunProofExpiresAt: dryRunFreshness.expiresAt,
    dryRunProofRemainingHours: dryRunFreshness.remainingHours,
    dryRunProofCheckedAtIncluded: dryRunFreshness.checkedAtIncluded,
    dryRunCheckedAt: dryRunFreshness.checkedAt,
    dryRunMatchesCurrentMinimumPath,
    minimumBlockingTargetSignatureIncluded: Boolean(currentMinimumBlockingTargetSignature),
    dryRunMinimumBlockingTargetSignatureIncluded: Boolean(dryRunMinimumBlockingTargetSignature),
    minimumBlockingLabel: minimumLabel,
    minimumBlockingItemCount: minimumItemCount,
    minimumFragmentTemplate: minimumFragment,
    fullFragmentTemplate: fullFragment,
    recommendedFragment: minimumItemCount > 0 ? minimumFragment : fullFragment,
    dryRunCommand:
      "node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-minimum-values-env-fragment> --production-env-values-dry-run --field-evidence-manifest <filled-field-evidence-manifest>",
    formalMergeCommand:
      "node -- scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-minimum-values-env-fragment> --field-evidence-manifest <filled-field-evidence-manifest>",
    intakeVerifyCommand:
      "node -- scripts/run-v1-production-env-intake-verify.mjs --use-production-env-setup-env-file --intake-csv <production-env-real-value-intake-csv> --json",
    suiteRefreshCommand:
      "node -- scripts/run-v1-go-live-suite.mjs --sync-canonical-latest --json",
    nextActions: readyForFormalMerge
      ? [
          "真实值片段 dry-run 已显示最小补值和 env 预检可继续；负责人复核后去掉 --production-env-values-dry-run 正式合并并继续第一阶段。",
          "正式合并后重跑 go-live suite，同步刷新交接包和 production-go-live-stage-checklist。",
        ]
      : dryRunReady
        ? dryRunMatchesCurrentMinimumPath && !dryRunFresh
          ? [
              "最近真实值 dry-run 已匹配当前最小补值路径，但证明超过有效期；请重新执行 dry-run 后再正式合并。",
              "重跑 dry-run 后刷新 go-live suite，再由负责人复核是否正式合并。",
            ]
          : [
            "最近真实值 dry-run 的覆盖计数通过，但未证明匹配当前最小补值路径；请用当前交接包最小片段重新执行 dry-run。",
            "重跑 dry-run 后刷新 go-live suite，再由负责人复核是否正式合并。",
          ]
      : [
          `先从 ${minimumFragment} 复制到安全未跟踪真实值片段，填写当前 ${minimumLabel} 最小补值。`,
          "先运行真实值片段 dry-run；dry-run 不写目标 env，也不产生含真实值副本。",
          "dry-run 无阻塞后，再运行正式合并命令并继续第一阶段执行器。",
        ],
    safeguards: {
      realValuesIncluded: false,
      secureFragmentPathIncluded: false,
      targetEnvPathIncluded: false,
      browserValuesAccepted: false,
      dryRunWritesTargetEnv: false,
      dryRunProofFresh: dryRunFresh,
      dryRunProofMaxAgeHours: dryRunFreshness.maxAgeHours,
      dryRunProofExpiresAt: dryRunFreshness.expiresAt,
      dryRunProofRemainingHours: dryRunFreshness.remainingHours,
      dryRunProofCheckedAtIncluded: dryRunFreshness.checkedAtIncluded,
      formalMergeRequiresSecureFragment: true,
      firstStageRunnerAppliesWhitelist: true,
      targetSignatureIncludesOnlyVariableNames: true,
    },
  };
}

function buildProductionEnvMinimumRowsTargetSignature(rows) {
  return [
    ...new Set(
      rows
        .map((row) =>
          row.alternativeGroup
            ? `alternative-group:${row.alternativeGroup}`
            : row.variableKey
              ? `variable:${row.variableKey}`
              : "",
        )
        .filter(Boolean),
    ),
  ]
    .sort()
    .join("|");
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
    `# Generated: ${report.generatedAt}`,
    `# Source release candidate: ${report.releaseCandidate.generatedAt || "unknown"}`,
    "#",
    "# This file contains only the current minimum blocking path.",
    "# It excludes warning / optional fallback rows, safe-literal rows, and non-preferred aliases from Choose one groups.",
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
    return `${lines.join("\n")}`;
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
  return `${lines.join("\n")}`;
}

function formatProductionEnvValuesFragmentTemplate(report) {
  const checklist = report.productionEnvValueIntakeChecklist;
  const rows = Array.isArray(checklist.rows) ? checklist.rows : [];
  const lines = [
    "# ERP V1 production env real values fragment template",
    `# Generated: ${report.generatedAt}`,
    `# Source release candidate: ${report.releaseCandidate.generatedAt || "unknown"}`,
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
    lines.push("# 当前 production env fix checklist 没有需要填写的真实值片段。");
    lines.push("# 仍需继续跑 runtime readiness、现场证据、真实设备 / 真机和负责人签字。");
    lines.push("");
    return `${lines.join("\n")}`;
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
  return `${lines.join("\n")}`;
}

function formatProductionEnvFillTemplate(report) {
  const checklist = report.productionEnvFixChecklist;
  const items = checklist.items.filter((item) => item.missingVariables.length || item.placeholderVariables.length);
  const lines = [
    "# ERP V1 production env fill template",
    `# Generated: ${report.generatedAt}`,
    `# Source release candidate: ${report.releaseCandidate.generatedAt || "unknown"}`,
    "#",
    "# Copy this file to a secure, untracked env file before editing.",
    "# Replace every <REPLACE_WITH_...> placeholder before running preflight.",
    "# Do not commit real connection strings, object-storage secrets, command paths, command args, spool paths, or tokens.",
    "# Run after filling:",
    "#   node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file>",
    "#   node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file",
    "# Use --env-file <secure-env-file> only when intentionally bypassing the production env setup report.",
    "",
  ];
  if (!items.length) {
    lines.push("# 当前 production env fix checklist 没有缺失或占位变量。");
    lines.push("# 仍需继续跑 runtime readiness、现场证据、真实设备 / 真机和负责人签字。");
    lines.push("");
    return `${lines.join("\n")}`;
  }
  for (const item of items) {
    const assignmentGroups = envTemplateAssignmentGroupsForItem(item);
    const assignments = assignmentGroups.flatMap((group) => group.assignments);
    lines.push(`# ${item.severity.toUpperCase()} | ${item.ownerRole} | ${item.label}`);
    if (item.nextAction) lines.push(`# Next: ${sanitizeEnvComment(item.nextAction)}`);
    for (const guidance of item.valueGuidance) {
      lines.push(`# Fill: ${sanitizeEnvComment(guidance)}`);
    }
    for (const verification of item.verificationSteps) {
      lines.push(`# Verify: ${sanitizeEnvComment(verification)}`);
    }
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
      for (const assignment of group.assignments) {
        lines.push(`# ${assignment.key}=${assignment.value}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}`;
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
  if (/^(postgres|object_storage|false|true|command_bridge|cups_lp|s3_compatible)$/i.test(configuredValue)) {
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

function sanitizeEnvComment(value) {
  return stringValue(value).replace(/\r?\n/g, " ").replace(/#/g, "＃");
}

function csvCell(value) {
  return `"${stringValue(value).replace(/"/g, '""')}"`;
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
  const relativePath = relative(process.cwd(), resolve(path));
  if (!relativePath.startsWith("..") && !relativePath.startsWith("/") && relativePath !== "") return relativePath;
  return basename(path);
}

function displayInputPath(path) {
  const relativePath = relative(process.cwd(), resolve(path));
  if (!relativePath.startsWith("..") && !relativePath.startsWith("/") && relativePath !== "") return relativePath;
  return `[external:${basename(path)}]`;
}

function escapeMarkdownTable(value) {
  return stringValue(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}
