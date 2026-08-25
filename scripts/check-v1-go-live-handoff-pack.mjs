import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { buildV1FieldEvidenceManifestTemplate, serializeManifestJson } from "./v1FieldEvidenceManifest.mjs";
import { readZipEntries, readZipTextEntry } from "./xlsxTestUtils.mjs";

const handoffScript = join(process.cwd(), "scripts", "run-v1-go-live-handoff-pack.mjs");
const tempRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-go-live-handoff");
const sourceRoot = join(tempRoot, "sources");
const outputRoot = join(tempRoot, "pack");
const noDryRunOutputRoot = join(tempRoot, "pack-no-dry-run");
const noFirstStageOutputRoot = join(tempRoot, "pack-no-first-stage");
const noFirstStageCwd = join(tempRoot, "cwd-no-first-stage");
const rawOutputRoot = join(tempRoot, "pack-raw");
const releaseJsonPath = join(sourceRoot, "release-candidate.json");
const releaseMarkdownPath = join(sourceRoot, "release-candidate.md");
const taskBoardJsonPath = join(sourceRoot, "onsite-task-board.json");
const taskBoardMarkdownPath = join(sourceRoot, "onsite-task-board.md");
const taskBoardRolesDir = join(sourceRoot, "onsite-task-board-roles");
const completionSnapshotJsonPath = join(sourceRoot, "completion-snapshot.json");
const completionSnapshotMarkdownPath = join(sourceRoot, "completion-snapshot.md");
const fieldEvidenceIntakeDir = join(sourceRoot, "field-evidence-intake");
const ownerDecisionBriefJsonPath = join(sourceRoot, "owner-decision-brief.json");
const ownerDecisionBriefMarkdownPath = join(sourceRoot, "owner-decision-brief.zh-CN.md");
const v1V2ScopeBriefJsonPath = join(sourceRoot, "v1-v2-scope-brief.json");
const v1V2ScopeBriefMarkdownPath = join(sourceRoot, "v1-v2-scope-brief.zh-CN.md");
const productionGoLiveStageChecklistJsonPath = join(sourceRoot, "production-go-live-stage-checklist.json");
const productionGoLiveStageChecklistMarkdownPath = join(sourceRoot, "production-go-live-stage-checklist.zh-CN.md");
const productionEnvSetupJsonPath = join(sourceRoot, "production-env-setup.json");
const productionEnvSetupMarkdownPath = join(sourceRoot, "production-env-setup.md");
const productionEnvIntakeVerifyJsonPath = join(sourceRoot, "production-env-intake-verify.json");
const productionEnvIntakeVerifyMarkdownPath = join(sourceRoot, "production-env-intake-verify.md");
const productionFirstStageExecutionJsonPath = join(sourceRoot, "production-first-stage-execution.json");
const productionFirstStageExecutionNoDryRunJsonPath = join(sourceRoot, "production-first-stage-execution-no-dry-run.json");
const productionFirstStageExecutionMarkdownPath = join(sourceRoot, "production-first-stage-execution.md");
const productionFirstStageEvidenceSuggestionsJsonPath = join(sourceRoot, "production-first-stage-evidence-suggestions.json");
const productionFirstStageEvidenceSuggestionsMarkdownPath = join(sourceRoot, "production-first-stage-evidence-suggestions.md");
const productionFirstStageEvidenceSuggestionsCsvPath = join(sourceRoot, "production-first-stage-evidence-suggestions.csv");
const productionPersistenceEvidenceJsonPath = join(sourceRoot, "production-persistence-evidence.json");
const productionPersistenceEvidenceMarkdownPath = join(sourceRoot, "production-persistence-evidence.md");
const productionRuntimeSmokeJsonPath = join(sourceRoot, "production-runtime-smoke.json");
const productionRuntimeSmokeMarkdownPath = join(sourceRoot, "production-runtime-smoke.md");
const todoLoadPrecheckJsonPath = join(sourceRoot, "todo-load-precheck.json");
const todoLoadPrecheckMarkdownPath = join(sourceRoot, "todo-load-precheck.md");
const printChainExecutionJsonPath = join(sourceRoot, "print-chain-execution.json");
const printChainExecutionMarkdownPath = join(sourceRoot, "print-chain-execution.md");
const printChainCloseoutJsonPath = join(sourceRoot, "print-chain-closeout.json");
const printChainCloseoutMarkdownPath = join(sourceRoot, "print-chain-closeout.md");
const driverRealDeviceExecutionJsonPath = join(sourceRoot, "driver-real-device-execution.json");
const driverRealDeviceExecutionMarkdownPath = join(sourceRoot, "driver-real-device-execution.md");
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
const recentProductionValuesDryRunCheckedAt = new Date().toISOString();
const driverRealDeviceCloseoutJsonPath = join(sourceRoot, "driver-real-device-closeout.json");
const driverRealDeviceCloseoutMarkdownPath = join(sourceRoot, "driver-real-device-closeout.md");
const unblockPlanJsonPath = join(sourceRoot, "v1-unblock-plan.json");
const unblockPlanMarkdownPath = join(sourceRoot, "v1-unblock-plan.zh-CN.md");
const fieldManifestPath = join(sourceRoot, "field-evidence.json");
const missingReleaseJsonPath = join(sourceRoot, "missing-release-candidate.json");
const sensitiveValues = [
  "postgres://admin:pass@prod-db.local:5432/erp",
  "AKIA_PROD_SECRET",
  "SUPER_SECRET_VALUE",
  "/var/spool/erp-secret",
  "/usr/bin/lpstat-secret",
  "SENSITIVE_TODO_LOAD_PAYLOAD",
  "SENSITIVE_TODO_LOAD_SOURCE_MARKDOWN",
];
const forbiddenPatterns = [
  /postgres:\/\/[^<\s]+:[^<\s]+@/i,
  /AKIA[0-9A-Z_]{8,}/,
  /SUPER_SECRET_VALUE/i,
  /pass@prod-db/i,
  /prod-db\.local/i,
  /\.erp-local-storage\/v1-production-env\/secure-prod\.env/i,
  /secure-prod\.env/i,
  /\/var\/spool\/erp-secret/i,
  /\/usr\/bin\/lpstat-secret/i,
  /SENSITIVE_TODO_LOAD_PAYLOAD/i,
  /SENSITIVE_TODO_LOAD_SOURCE_MARKDOWN/i,
];

rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(sourceRoot, { recursive: true });
mkdirSync(taskBoardRolesDir, { recursive: true });
mkdirSync(join(fieldEvidenceIntakeDir, "groups"), { recursive: true });
mkdirSync(join(noFirstStageCwd, "docs", "development"), { recursive: true });
writeFileSync(
  join(noFirstStageCwd, "docs", "development", "v1-production.env.example"),
  "# V1 production env template fixture\n",
);
writeFileSync(
  join(noFirstStageCwd, "docs", "development", "v1-go-live-runbook.zh-CN.md"),
  "# V1 发布前执行清单 fixture\n",
);
writeFileSync(
  join(noFirstStageCwd, "docs", "development", "v1-field-evidence-checklist.zh-CN.md"),
  "# V1 现场证据填写说明 fixture\n",
);
writeFileSync(
  join(noFirstStageCwd, "docs", "development", "v1-v2-scope.zh-CN.md"),
  "# V1 / V2 范围差异 fixture\n",
);

writeFileSync(releaseJsonPath, `${JSON.stringify(buildBlockedReleaseCandidate(), null, 2)}\n`);
writeFileSync(releaseMarkdownPath, "# ERP V1 发布候选检查\n\nBLOCKED\n");
writeFileSync(taskBoardJsonPath, `${JSON.stringify(buildBlockedTaskBoard(), null, 2)}\n`);
writeFileSync(taskBoardMarkdownPath, "# ERP V1 现场任务清单\n\n- V1 现场仍有 52 个待处理任务\n");
writeFileSync(completionSnapshotJsonPath, `${JSON.stringify(buildBlockedCompletionSnapshot(), null, 2)}\n`);
writeFileSync(completionSnapshotMarkdownPath, "# ERP V1 完成度快照\n\n- V1 真实上线就绪度：76-79%\n");
writeFileSync(ownerDecisionBriefJsonPath, `${JSON.stringify(buildBlockedOwnerDecisionBrief(), null, 2)}\n`);
writeFileSync(
  ownerDecisionBriefMarkdownPath,
  "# ERP V1 负责人决策摘要\n\n- 是否可以宣布 V1 完成：不可以\n- V2 计划差异：企业微信自动发送。\n",
);
writeFileSync(v1V2ScopeBriefJsonPath, `${JSON.stringify(buildBlockedV1V2ScopeBrief(), null, 2)}\n`);
writeFileSync(
  v1V2ScopeBriefMarkdownPath,
  "# ERP V1 / V2 差异摘要\n\n- V1 必须继续补：6 项\n- V2 差异：17 项\n- V2 主题：企微 / 客户自动化、AI / OCR / 图片识别\n",
);
writeFileSync(productionGoLiveStageChecklistJsonPath, `${JSON.stringify(buildBlockedProductionGoLiveStageChecklist(), null, 2)}\n`);
writeFileSync(
  productionGoLiveStageChecklistMarkdownPath,
  "# ERP V1 生产上线组合预检阶段清单\n\n- 汇总：1/4 通过\n- 当前 API 生产 profile 确认：必须执行组合预检\n",
);
writeFileSync(productionEnvSetupJsonPath, `${JSON.stringify(buildProductionEnvSetup(), null, 2)}\n`);
writeFileSync(
  productionEnvSetupMarkdownPath,
  "# V1 生产 env 准备报告\n\n- 结论：PREPARED / 仍需填真实值\n- 路径：.erp-local-storage/v1-production-env/secure-prod.env\n- 安全 env 文件已准备\n",
);
writeFileSync(productionEnvIntakeVerifyJsonPath, `${JSON.stringify(buildProductionEnvIntakeVerification(), null, 2)}\n`);
writeFileSync(
  productionEnvIntakeVerifyMarkdownPath,
  "# V1 生产 env 真实值 intake 校验\n\n- 结论：BLOCKED\n- 阻塞：PostgreSQL / 对象存储 / CUPS\n",
);
writeFileSync(productionFirstStageExecutionJsonPath, `${JSON.stringify(buildBlockedProductionFirstStageExecution(), null, 2)}\n`);
writeFileSync(
  productionFirstStageExecutionNoDryRunJsonPath,
  `${JSON.stringify(buildBlockedProductionFirstStageExecutionWithoutDryRunCoverage(), null, 2)}\n`,
);
writeFileSync(
  productionFirstStageExecutionMarkdownPath,
  "# V1 Production First-Stage Execution\n\n- Status: blocked\n- Summary: 2/7 步骤通过，仍有阻塞\n",
);
writeFileSync(productionFirstStageEvidenceSuggestionsJsonPath, `${JSON.stringify(buildFirstStageEvidenceSuggestions(), null, 2)}\n`);
writeFileSync(
  productionFirstStageEvidenceSuggestionsMarkdownPath,
  "# V1 Production First-Stage Evidence Suggestions\n\n- Auto accepted suggestions: 7\n- Manual-only first-stage items: 1\n",
);
writeFileSync(
  productionFirstStageEvidenceSuggestionsCsvPath,
  '"groupKey","itemKey","onsiteStatus","onsiteEvidenceRef","onsiteNotes"\n"production_persistence","postgres_migration_applied","accepted","AUTO:production-postgres-preflight:20260708T100000Z","自动化报告已确认，仍需负责人复核"\n',
);
writeFileSync(productionPersistenceEvidenceJsonPath, `${JSON.stringify(buildProductionPersistenceEvidence(), null, 2)}\n`);
writeFileSync(
  productionPersistenceEvidenceMarkdownPath,
  "# V1 Production Persistence Evidence\n\nStatus: BLOCKED (3/8 阶段通过)\n",
);
writeFileSync(productionRuntimeSmokeJsonPath, `${JSON.stringify(buildProductionRuntimeSmoke(), null, 2)}\n`);
writeFileSync(productionRuntimeSmokeMarkdownPath, "# V1 Production Runtime Smoke\n\nStatus: BLOCKED (2/4 通过)\n");
writeFileSync(todoLoadPrecheckJsonPath, `${JSON.stringify(buildTodoLoadPrecheck(), null, 2)}\n`);
writeFileSync(
  todoLoadPrecheckMarkdownPath,
  "# V1 Todo Load Precheck\n\nSENSITIVE_TODO_LOAD_SOURCE_MARKDOWN\n",
);
writeFileSync(printChainCloseoutJsonPath, `${JSON.stringify(buildPrintChainCloseout(), null, 2)}\n`);
writeFileSync(printChainCloseoutMarkdownPath, "# V1 Print Chain Closeout\n\nStatus: READY (8/8 通过)\n");
writeFileSync(printChainExecutionJsonPath, `${JSON.stringify(buildPrintChainExecution(), null, 2)}\n`);
writeFileSync(
  printChainExecutionMarkdownPath,
  "# V1 Print-Chain Execution\n\nStatus: BLOCKED (2/3 步骤通过，仍有阻塞)\n",
);
writeFileSync(driverRealDeviceExecutionJsonPath, `${JSON.stringify(buildDriverRealDeviceExecution(), null, 2)}\n`);
writeFileSync(
  driverRealDeviceExecutionMarkdownPath,
  "# V1 Driver Real-Device Execution\n\nStatus: BLOCKED (1/2 步骤通过，仍有阻塞)\n",
);
writeFileSync(driverRealDeviceCloseoutJsonPath, `${JSON.stringify(buildDriverRealDeviceCloseout(), null, 2)}\n`);
writeFileSync(driverRealDeviceCloseoutMarkdownPath, "# V1 Driver Real-Device Closeout\n\nStatus: BLOCKED (6/8 通过)\n");
writeFileSync(unblockPlanJsonPath, `${JSON.stringify(buildBlockedUnblockPlan(), null, 2)}\n`);
writeFileSync(
  unblockPlanMarkdownPath,
  "# ERP V1 最小解除阻塞清单\n\n- 待处理总数：52 项\n- 第一阶段：先补生产环境和持久化\n",
);
writeFileSync(join(fieldEvidenceIntakeDir, "intake-manifest.json"), `${JSON.stringify(buildBlockedFieldEvidenceIntake(), null, 2)}\n`);
writeFileSync(join(fieldEvidenceIntakeDir, "intake-summary.zh-CN.md"), "# ERP V1 现场证据采集包\n\n- 必填证据完成：0/40\n");
writeFileSync(join(fieldEvidenceIntakeDir, "evidence-items.csv"), '"groupKey","itemKey","evidenceRefFilled"\n"print_hardware","cups_lpstat_checked","no"\n');
writeFileSync(
  join(fieldEvidenceIntakeDir, "intake-rules.zh-CN.md"),
  "# ERP V1 现场证据填写规则\n\n- onsiteStatus 允许 pending / passed / accepted / blocked / not_applicable。\n- 使用 --sync-canonical-latest 刷新顶层 latest。\n",
);
writeFileSync(join(fieldEvidenceIntakeDir, "signoff-boundary.zh-CN.md"), "# ERP V1 签字与 V1/V2 边界确认单\n\n- 当前状态：pending\n");
writeFileSync(
  join(fieldEvidenceIntakeDir, "signoff-boundary.csv"),
  '"recordType","role","label","onsiteStatus","onsiteSigner","onsiteSignedAt","onsiteConfirmedBy","onsiteConfirmedAt"\n"signoff","办公室","办公室","","","","",""\n"boundary","v1_v2_boundary","V1/V2 边界确认","","","","",""\n',
);
writeFileSync(
  join(fieldEvidenceIntakeDir, "groups", "print_hardware.zh-CN.md"),
  "# ERP V1 现场证据采集单 - 打印硬件 / CUPS / 标签\n\n- 真实 CUPS 队列 non-printing 预检已通过\n",
);
writeFileSync(
  join(taskBoardRolesDir, "technical-management.latest.md"),
  "# ERP V1 现场任务清单 - 技术/管理\n\n- 本角色待处理：34 个，其中 P0 34 个\n",
);
writeFileSync(
  join(taskBoardRolesDir, "driver.latest.md"),
  "# ERP V1 现场任务清单 - 司机\n\n- 完成任务后仍要回填现场证据 manifest，并重新跑 release candidate。\n",
);
writeFileSync(fieldManifestPath, serializeManifestJson(buildSensitiveFieldEvidenceManifest()));

const blockedRun = await runNode([
  handoffScript,
  "--release-candidate-json",
  releaseJsonPath,
  "--release-candidate-markdown",
  releaseMarkdownPath,
  "--onsite-task-board-json",
  taskBoardJsonPath,
  "--onsite-task-board-markdown",
  taskBoardMarkdownPath,
  "--onsite-task-board-roles-dir",
  taskBoardRolesDir,
  "--completion-snapshot-json",
  completionSnapshotJsonPath,
  "--completion-snapshot-markdown",
  completionSnapshotMarkdownPath,
  "--field-evidence-intake-dir",
  fieldEvidenceIntakeDir,
  "--owner-decision-brief-json",
  ownerDecisionBriefJsonPath,
  "--owner-decision-brief-markdown",
  ownerDecisionBriefMarkdownPath,
  "--v1-v2-scope-brief-json",
  v1V2ScopeBriefJsonPath,
  "--v1-v2-scope-brief-markdown",
  v1V2ScopeBriefMarkdownPath,
  "--production-go-live-stage-checklist-json",
  productionGoLiveStageChecklistJsonPath,
  "--production-go-live-stage-checklist-markdown",
  productionGoLiveStageChecklistMarkdownPath,
  "--production-env-setup-json",
  productionEnvSetupJsonPath,
  "--production-env-setup-markdown",
  productionEnvSetupMarkdownPath,
  "--production-env-intake-verify-json",
  productionEnvIntakeVerifyJsonPath,
  "--production-env-intake-verify-markdown",
  productionEnvIntakeVerifyMarkdownPath,
  "--production-first-stage-execution-json",
  productionFirstStageExecutionJsonPath,
  "--production-first-stage-execution-markdown",
  productionFirstStageExecutionMarkdownPath,
  "--production-first-stage-evidence-suggestions-json",
  productionFirstStageEvidenceSuggestionsJsonPath,
  "--production-first-stage-evidence-suggestions-markdown",
  productionFirstStageEvidenceSuggestionsMarkdownPath,
  "--production-first-stage-evidence-suggestions-csv",
  productionFirstStageEvidenceSuggestionsCsvPath,
  "--production-persistence-evidence-json",
  productionPersistenceEvidenceJsonPath,
  "--production-persistence-evidence-markdown",
  productionPersistenceEvidenceMarkdownPath,
  "--production-runtime-smoke-json",
  productionRuntimeSmokeJsonPath,
  "--production-runtime-smoke-markdown",
  productionRuntimeSmokeMarkdownPath,
  "--todo-load-precheck-json",
  todoLoadPrecheckJsonPath,
  "--todo-load-precheck-markdown",
  todoLoadPrecheckMarkdownPath,
  "--print-chain-closeout-json",
  printChainCloseoutJsonPath,
  "--print-chain-closeout-markdown",
  printChainCloseoutMarkdownPath,
  "--print-chain-execution-json",
  printChainExecutionJsonPath,
  "--print-chain-execution-markdown",
  printChainExecutionMarkdownPath,
  "--driver-real-device-execution-json",
  driverRealDeviceExecutionJsonPath,
  "--driver-real-device-execution-markdown",
  driverRealDeviceExecutionMarkdownPath,
  "--driver-real-device-closeout-json",
  driverRealDeviceCloseoutJsonPath,
  "--driver-real-device-closeout-markdown",
  driverRealDeviceCloseoutMarkdownPath,
  "--unblock-plan-json",
  unblockPlanJsonPath,
  "--unblock-plan-markdown",
  unblockPlanMarkdownPath,
  "--field-evidence-manifest",
  fieldManifestPath,
  "--output-dir",
  outputRoot,
  "--json",
]);
assert.equal(blockedRun.status, 0, runFailureMessage("handoff pack should be written for blocked release candidate", blockedRun));
const blockedResult = JSON.parse(blockedRun.stdout);
assert.equal(blockedResult.status, "blocked_handoff_written");
assert.equal(blockedResult.ready, false);
assert.equal(blockedResult.releaseCandidate.summary.label, "0/4 发布门禁通过");
assert.equal(blockedResult.fieldEvidence.ready, false);
assert.equal(blockedResult.productionEnvFixChecklist.included, true);
assert.equal(blockedResult.productionEnvFixChecklist.fixItemCount, 6);
assert.equal(blockedResult.productionEnvFixChecklist.blockingItemCount, 5);
assert.equal(blockedResult.productionEnvValueIntakeChecklist.included, true);
assert.ok(blockedResult.productionEnvValueIntakeChecklist.rowCount > 0);
assert.equal(blockedResult.productionEnvMinimumValueIntakeChecklist.included, true);
assert.equal(blockedResult.productionEnvMinimumValueIntakeChecklist.rowCount, 11);
assert.equal(blockedResult.productionEnvMinimumValueIntakeChecklist.sourceRowCount, blockedResult.productionEnvValueIntakeChecklist.rowCount);
assert.equal(blockedResult.productionEnvMinimumValueIntakeChecklist.chooseOneGroupCount, 1);
assert.equal(blockedResult.productionEnvMinimumValueIntakeChecklist.safeguards.onlyBlockingRowsIncluded, true);
assert.equal(blockedResult.productionEnvMinimumValueIntakeChecklist.safeguards.safeLiteralRowsExcluded, true);
assert.ok(
  blockedResult.productionEnvMinimumValueIntakeChecklist.rows.every((row) => !row.safeLiteralValue),
  "minimum handoff intake checklist should exclude safe literal rows",
);
assert.ok(
  blockedResult.productionEnvValueIntakeChecklist.rows.some(
    (row) => row.variableKey === "ERP_V1_DATABASE_URL" && /任选其一/.test(row.alternativeRule),
  ),
);
assert.equal(blockedResult.productionEnvSetup.included, true);
assert.equal(blockedResult.d49EmployeeIntake.requiredRoleCount, 8);
assert.equal(blockedResult.d49EmployeeIntake.businessSheetStartsEmpty, true);
assert.equal(blockedResult.d49EmployeeIntake.examplesExcludedFromImport, true);
assert.equal(blockedResult.d49EmployeeIntake.safeguards.realEmployeeDataIncluded, false);
assert.equal(blockedResult.d49EmployeeIntake.safeguards.temporaryPasswordsIncluded, false);
assert.equal(blockedResult.productionEnvSetup.status, "prepared");
assert.equal(blockedResult.productionEnvSetup.ready, false);
assert.equal(blockedResult.productionEnvSetup.setupReady, true);
assert.equal(blockedResult.productionEnvSetup.summary.label, "安全 env 文件已准备，仍需填真实生产值");
assert.equal(blockedResult.productionEnvSetup.envFile.path, "env 文件 1");
assert.equal(blockedResult.productionEnvSetup.envFile.pathRedacted, true);
assert.equal(blockedResult.productionEnvSetup.envFile.pathExposed, false);
assert.equal(blockedResult.productionEnvSetup.envFile.fileMode, "600");
assert.equal(blockedResult.productionEnvSetup.envPreflight.blockingCount, 6);
assert.equal(blockedResult.productionEnvSetup.envPreflight.remainingFixItems.length, 3);
assert.equal(blockedResult.productionEnvIntakeVerification.included, true);
assert.equal(blockedResult.productionEnvIntakeVerification.status, "blocked");
assert.equal(blockedResult.productionEnvIntakeVerification.ready, false);
assert.equal(blockedResult.productionEnvIntakeVerification.summary.intakeRowCount, 22);
assert.equal(blockedResult.productionEnvIntakeVerification.summary.blockingCount, 11);
assert.equal(blockedResult.productionEnvIntakeVerification.summary.minimumBlockingLabel, "0/11");
assert.equal(blockedResult.productionEnvIntakeVerification.summary.minimumBlockingItemCount, 11);
assert.equal(blockedResult.productionEnvIntakeVerification.minimumBlockingItems.length, 11);
assert.equal(blockedResult.productionEnvIntakeVerification.blockingFindings.length, 2);
assert.equal(blockedResult.productionEnvIntakeVerification.warningFindings.length, 1);
assert.equal(blockedResult.productionEnvValueExecutionPlan.included, true);
assert.equal(blockedResult.productionEnvValueExecutionPlan.minimumBlockingLabel, "0/11");
assert.equal(blockedResult.productionEnvValueExecutionPlan.minimumBlockingItemCount, 11);
assert.equal(blockedResult.productionEnvValueExecutionPlan.readyForFormalMerge, true);
assert.equal(blockedResult.productionEnvValueExecutionPlan.dryRunReady, true);
assert.equal(blockedResult.productionEnvValueExecutionPlan.dryRunFresh, true);
assert.equal(blockedResult.productionEnvValueExecutionPlan.dryRunFreshnessStatus, "fresh");
assert.equal(blockedResult.productionEnvValueExecutionPlan.dryRunProofMaxAgeHours, 24);
assert.ok(blockedResult.productionEnvValueExecutionPlan.dryRunProofExpiresAt, "dry-run proof expiry time should be included");
assert.equal(typeof blockedResult.productionEnvValueExecutionPlan.dryRunProofRemainingHours, "number");
assert.equal(blockedResult.productionEnvValueExecutionPlan.dryRunProofCheckedAtIncluded, true);
assert.equal(blockedResult.productionEnvValueExecutionPlan.dryRunMatchesCurrentMinimumPath, true);
assert.equal(blockedResult.productionEnvValueExecutionPlan.minimumBlockingTargetSignatureIncluded, true);
assert.equal(blockedResult.productionEnvValueExecutionPlan.dryRunMinimumBlockingTargetSignatureIncluded, true);
assert.equal(blockedResult.productionEnvValueExecutionPlan.safeguards.dryRunProofFresh, true);
assert.equal(blockedResult.productionEnvValueExecutionPlan.safeguards.dryRunProofMaxAgeHours, 24);
assert.ok(blockedResult.productionEnvValueExecutionPlan.safeguards.dryRunProofExpiresAt, "dry-run proof expiry safeguard should be included");
assert.equal(typeof blockedResult.productionEnvValueExecutionPlan.safeguards.dryRunProofRemainingHours, "number");
assert.equal(blockedResult.productionEnvValueExecutionPlan.safeguards.dryRunProofCheckedAtIncluded, true);
assert.match(
  blockedResult.productionEnvValueExecutionPlan.dryRunCommand,
  /--production-env-values-dry-run/,
);
assert.match(
  blockedResult.productionEnvValueExecutionPlan.formalMergeCommand,
  /--production-env-values-file <secure-minimum-values-env-fragment>/,
);
assert.equal(blockedResult.onsiteTaskBoard.included, true);
assert.equal(blockedResult.onsiteTaskBoard.summary.label, "V1 现场仍有 52 个待处理任务");
assert.equal(blockedResult.onsiteTaskBoard.roleMarkdownFiles.length, 2);
assert.equal(blockedResult.completionSnapshot.included, true);
assert.equal(blockedResult.completionSnapshot.summary.v1Readiness, "76-79%");
assert.equal(blockedResult.fieldEvidenceIntake.included, true);
assert.equal(blockedResult.fieldEvidenceIntake.summary.requiredEvidenceItems, "0/40");
assert.equal(blockedResult.fieldEvidenceIntake.groupMarkdownFiles.length, 1);
assert.equal(blockedResult.ownerDecisionBrief.included, true);
assert.equal(blockedResult.ownerDecisionBrief.canDeclareV1Complete, false);
assert.equal(blockedResult.ownerDecisionBrief.unfinishedItems.length, 1);
assert.equal(blockedResult.v1V2ScopeBrief.included, true);
assert.equal(blockedResult.v1V2ScopeBrief.summary.v2DifferenceCount, 17);
assert.ok(blockedResult.v1V2ScopeBrief.v2Categories.includes("企微 / 客户自动化"));
assert.equal(blockedResult.productionGoLiveStageChecklist.included, true);
assert.equal(blockedResult.productionGoLiveStageChecklist.summary.label, "1/4 通过");
assert.equal(blockedResult.productionGoLiveStageChecklist.stages.length, 4);
assert.ok(
  blockedResult.productionGoLiveStageChecklist.stages.some(
    (stage) => stage.key === "runtime-production-profile" && stage.ready === false,
  ),
);
assert.equal(blockedResult.productionFirstStageExecution.included, true);
assert.equal(blockedResult.productionFirstStageExecution.summary.label, "2/7 步骤通过，仍有阻塞");
assert.equal(blockedResult.productionFirstStageExecution.productionEnvValuesDryRunCoverage.included, true);
assert.equal(blockedResult.productionFirstStageExecution.productionEnvValuesDryRunCoverage.minimumBlockingReady, true);
assert.equal(blockedResult.productionFirstStageExecution.productionEnvValuesDryRunCoverage.minimumBlockingSatisfiedCount, 11);
assert.equal(blockedResult.productionFirstStageExecution.productionEnvValuesDryRunCoverage.minimumWarningReady, false);
assert.equal(blockedResult.productionFirstStageExecution.stages.length, 3);
assert.equal(blockedResult.productionFirstStageExecution.blockingStages.length, 1);
assert.equal(blockedResult.productionFirstStageExecution.execution.applyMigrations, false);
assert.equal(blockedResult.productionFirstStageEvidenceSuggestions.included, true);
assert.equal(blockedResult.productionFirstStageEvidenceSuggestions.status, "review_required");
assert.equal(blockedResult.productionFirstStageEvidenceSuggestions.ready, false);
assert.equal(blockedResult.productionFirstStageEvidenceSuggestions.summary.autoAcceptedSuggestionCount, 7);
assert.equal(blockedResult.productionFirstStageEvidenceSuggestions.summary.manualOnlyCount, 1);
assert.equal(blockedResult.productionFirstStageEvidenceSuggestions.suggestions.length, 2);
assert.equal(blockedResult.productionPersistenceEvidence.included, true);
assert.equal(blockedResult.productionPersistenceEvidence.ready, false);
assert.equal(blockedResult.productionPersistenceEvidence.summary.label, "3/8 阶段通过");
assert.equal(blockedResult.productionPersistenceEvidence.stages.length, 8);
assert.equal(blockedResult.productionPersistenceEvidence.blockingStages.length, 5);
assert.equal(blockedResult.productionPersistenceEvidence.safeguards.databaseUrlExposed, false);
assert.equal(blockedResult.productionRuntimeSmoke.included, true);
assert.equal(blockedResult.productionRuntimeSmoke.ready, false);
assert.equal(blockedResult.productionRuntimeSmoke.summary.label, "2/4 通过");
assert.equal(blockedResult.productionRuntimeSmoke.runtime.runtimeMode, "external_service");
assert.equal(blockedResult.productionRuntimeSmoke.stages.length, 4);
assert.equal(blockedResult.productionRuntimeSmoke.blockingStages.length, 2);
assert.equal(blockedResult.productionRuntimeSmoke.safeguards.apiProcessSpawned, false);
assert.equal(blockedResult.todoLoadPrecheck.included, true);
assert.equal(blockedResult.todoLoadPrecheck.ready, true);
assert.equal(blockedResult.todoLoadPrecheck.productionReady, true);
assert.equal(blockedResult.todoLoadPrecheck.summary.requestCount, 100);
assert.equal(blockedResult.todoLoadPrecheck.summary.latencyMs.p95, 240);
assert.equal(blockedResult.todoLoadPrecheck.authentication.serverVerified, true);
assert.equal(blockedResult.printChainCloseout.included, true);
assert.equal(blockedResult.printChainCloseout.ready, true);
assert.equal(blockedResult.printChainCloseout.summary.label, "8/8 通过");
assert.equal(blockedResult.printChainCloseout.stages.length, 2);
assert.equal(blockedResult.printChainExecution.included, true);
assert.equal(blockedResult.printChainExecution.ready, false);
assert.equal(blockedResult.printChainExecution.summary.label, "2/3 步骤通过，仍有阻塞");
assert.equal(blockedResult.printChainExecution.stages.length, 3);
assert.equal(blockedResult.printChainExecution.blockingStages.length, 1);
assert.equal(blockedResult.printChainExecution.execution.closeoutCoversOnlyPrintStage, true);
assert.equal(blockedResult.printChainExecution.safeguards.physicalPrinterCalledByExecution, false);
assert.equal(blockedResult.driverRealDeviceExecution.included, true);
assert.equal(blockedResult.driverRealDeviceExecution.ready, false);
assert.equal(blockedResult.driverRealDeviceExecution.summary.label, "1/2 步骤通过，仍有阻塞");
assert.equal(blockedResult.driverRealDeviceExecution.stages.length, 2);
assert.equal(blockedResult.driverRealDeviceExecution.blockingStages.length, 1);
assert.equal(blockedResult.driverRealDeviceExecution.execution.closeoutCoversOnlyDriverStage, true);
assert.equal(blockedResult.driverRealDeviceCloseout.included, true);
assert.equal(blockedResult.driverRealDeviceCloseout.ready, false);
assert.equal(blockedResult.driverRealDeviceCloseout.summary.label, "6/8 通过");
assert.equal(blockedResult.driverRealDeviceCloseout.blockingStages.length, 1);
assert.equal(blockedResult.unblockPlan.included, true);
assert.equal(blockedResult.unblockPlan.summary.label, "V1 解除阻塞仍有 52 项待处理");
assert.equal(blockedResult.unblockPlan.phases.length, 2);
assert.equal(blockedResult.unblockPlan.firstActions.length, 2);
assert.equal(blockedResult.safeguards.rawFieldEvidenceIncluded, false);
assert.equal(blockedResult.safeguards.productionEnvFixChecklistIncluded, true);
assert.equal(blockedResult.safeguards.onsiteTaskBoardIncluded, true);
assert.equal(blockedResult.safeguards.onsiteTaskBoardRoleFilesIncluded, true);
assert.equal(blockedResult.safeguards.completionSnapshotIncluded, true);
assert.equal(blockedResult.safeguards.fieldEvidenceIntakeIncluded, true);
assert.equal(blockedResult.safeguards.ownerDecisionBriefIncluded, true);
assert.equal(blockedResult.safeguards.v1V2ScopeBriefIncluded, true);
assert.equal(blockedResult.safeguards.productionGoLiveStageChecklistIncluded, true);
assert.equal(blockedResult.safeguards.productionEnvSetupIncluded, true);
assert.equal(blockedResult.safeguards.productionEnvSetupReportExpectedRedacted, true);
assert.equal(blockedResult.safeguards.productionEnvSetupEnvFilePathExposed, false);
assert.equal(blockedResult.safeguards.productionEnvIntakeVerificationIncluded, true);
assert.equal(blockedResult.safeguards.productionEnvIntakeVerificationReportExpectedRedacted, true);
assert.equal(blockedResult.safeguards.productionEnvValueIntakeChecklistIncluded, true);
assert.equal(blockedResult.safeguards.productionEnvValueIntakeRealValuesExposed, false);
assert.equal(blockedResult.safeguards.productionEnvMinimumValueIntakeChecklistIncluded, true);
assert.equal(blockedResult.safeguards.productionEnvMinimumValueIntakeRealValuesExposed, false);
assert.equal(blockedResult.safeguards.productionEnvMinimumValuesFragmentTemplateIncluded, true);
assert.equal(blockedResult.safeguards.productionEnvMinimumValuesFragmentTemplateRealValuesExposed, false);
assert.equal(blockedResult.safeguards.productionEnvValuesFragmentTemplateIncluded, true);
assert.equal(blockedResult.safeguards.productionEnvValuesFragmentTemplateRealValuesExposed, false);
assert.ok(blockedResult.productionEnvMinimumValuesFragmentTemplate.rowCount > 0);
assert.ok(
  blockedResult.productionEnvMinimumValuesFragmentTemplate.rowCount <
    blockedResult.productionEnvValuesFragmentTemplate.rowCount,
);
assert.equal(blockedResult.safeguards.productionFirstStageExecutionIncluded, true);
assert.equal(blockedResult.safeguards.productionFirstStageExecutionReportExpectedRedacted, true);
assert.equal(blockedResult.safeguards.productionPersistenceEvidenceIncluded, true);
assert.equal(blockedResult.safeguards.productionPersistenceEvidenceReportExpectedRedacted, true);
assert.equal(blockedResult.safeguards.productionRuntimeSmokeIncluded, true);
assert.equal(blockedResult.safeguards.productionRuntimeSmokeReportExpectedRedacted, true);
assert.equal(blockedResult.safeguards.todoLoadPrecheckIncluded, true);
assert.equal(blockedResult.safeguards.todoLoadPrecheckSanitizedCopyWritten, true);
assert.equal(blockedResult.safeguards.todoLoadPrecheckSourcePayloadCopied, false);
assert.equal(blockedResult.safeguards.printChainExecutionIncluded, true);
assert.equal(blockedResult.safeguards.printChainExecutionReportExpectedRedacted, true);
assert.equal(blockedResult.safeguards.printChainCloseoutIncluded, true);
assert.equal(blockedResult.safeguards.printChainCloseoutReportExpectedRedacted, true);
assert.equal(blockedResult.safeguards.driverRealDeviceExecutionIncluded, true);
assert.equal(blockedResult.safeguards.driverRealDeviceExecutionReportExpectedRedacted, true);
assert.equal(blockedResult.safeguards.driverRealDeviceCloseoutIncluded, true);
assert.equal(blockedResult.safeguards.driverRealDeviceCloseoutReportExpectedRedacted, true);
assert.equal(blockedResult.safeguards.unblockPlanIncluded, true);
assert.ok(blockedResult.files.summaryMarkdown, "handoff summary path was not returned");
assert.ok(blockedResult.files.handoffManifest, "handoff manifest path was not returned");
assert.ok(blockedResult.files.productionEnvFixChecklistMarkdown, "production env fix checklist markdown path was not returned");
assert.ok(blockedResult.files.productionEnvFixChecklistCsv, "production env fix checklist CSV path was not returned");
assert.ok(blockedResult.files.productionEnvValueIntakeMarkdown, "production env real-value intake markdown path was not returned");
assert.ok(blockedResult.files.productionEnvValueIntakeCsv, "production env real-value intake CSV path was not returned");
assert.ok(
  blockedResult.files.productionEnvMinimumValueIntakeMarkdown,
  "production env minimum real-value intake markdown path was not returned",
);
assert.ok(
  blockedResult.files.productionEnvMinimumValueIntakeCsv,
  "production env minimum real-value intake CSV path was not returned",
);
assert.ok(
  blockedResult.files.productionEnvMinimumValuesFragmentTemplate,
  "production env minimum values fragment template path was not returned",
);
assert.ok(
  blockedResult.files.productionEnvValuesFragmentTemplate,
  "production env values fragment template path was not returned",
);
assert.ok(blockedResult.files.productionEnvFillTemplate, "production env fill template path was not returned");
assert.ok(blockedResult.files.d49EmployeeImportTemplate, "D49 employee import template path was not returned");
assert.ok(blockedResult.files.d49EmployeeIntakeGuide, "D49 employee intake guide path was not returned");
assert.ok(blockedResult.files.productionEnvSetupJson, "production env setup JSON path was not returned");
assert.ok(blockedResult.files.productionEnvSetupMarkdown, "production env setup Markdown path was not returned");
assert.ok(blockedResult.files.productionEnvIntakeVerificationJson, "production env intake verification JSON path was not returned");
assert.ok(
  blockedResult.files.productionEnvIntakeVerificationMarkdown,
  "production env intake verification Markdown path was not returned",
);
assert.ok(blockedResult.files.fieldEvidenceManifestRedacted, "redacted field evidence path was not returned");
assert.ok(blockedResult.files.onsiteTaskBoardJson, "onsite task-board JSON path was not returned");
assert.ok(blockedResult.files.onsiteTaskBoardMarkdown, "onsite task-board Markdown path was not returned");
assert.ok(blockedResult.files.completionSnapshotJson, "completion snapshot JSON path was not returned");
assert.ok(blockedResult.files.completionSnapshotMarkdown, "completion snapshot Markdown path was not returned");
assert.ok(blockedResult.files.ownerDecisionBriefJson, "owner decision brief JSON path was not returned");
assert.ok(blockedResult.files.ownerDecisionBriefMarkdown, "owner decision brief Markdown path was not returned");
assert.ok(blockedResult.files.v1V2ScopeBriefJson, "V1/V2 scope brief JSON path was not returned");
assert.ok(blockedResult.files.v1V2ScopeBriefMarkdown, "V1/V2 scope brief Markdown path was not returned");
assert.ok(blockedResult.files.productionGoLiveStageChecklistJson, "production go-live stage checklist JSON path was not returned");
assert.ok(
  blockedResult.files.productionGoLiveStageChecklistMarkdown,
  "production go-live stage checklist Markdown path was not returned",
);
assert.ok(blockedResult.files.productionFirstStageExecutionJson, "production first-stage execution JSON path was not returned");
assert.ok(
  blockedResult.files.productionFirstStageExecutionMarkdown,
  "production first-stage execution Markdown path was not returned",
);
assert.ok(blockedResult.files.productionPersistenceEvidenceJson, "production persistence evidence JSON path was not returned");
assert.ok(
  blockedResult.files.productionPersistenceEvidenceMarkdown,
  "production persistence evidence Markdown path was not returned",
);
assert.ok(blockedResult.files.productionRuntimeSmokeJson, "production runtime smoke JSON path was not returned");
assert.ok(blockedResult.files.productionRuntimeSmokeMarkdown, "production runtime smoke Markdown path was not returned");
assert.ok(blockedResult.files.todoLoadPrecheckJson, "todo-load precheck JSON path was not returned");
assert.ok(blockedResult.files.todoLoadPrecheckMarkdown, "todo-load precheck Markdown path was not returned");
assert.ok(blockedResult.files.printChainCloseoutJson, "print-chain closeout JSON path was not returned");
assert.ok(blockedResult.files.printChainCloseoutMarkdown, "print-chain closeout Markdown path was not returned");
assert.ok(blockedResult.files.printChainExecutionJson, "print-chain execution JSON path was not returned");
assert.ok(blockedResult.files.printChainExecutionMarkdown, "print-chain execution Markdown path was not returned");
assert.ok(blockedResult.files.driverRealDeviceExecutionJson, "driver real-device execution JSON path was not returned");
assert.ok(blockedResult.files.driverRealDeviceExecutionMarkdown, "driver real-device execution Markdown path was not returned");
assert.ok(blockedResult.files.driverRealDeviceCloseoutJson, "driver real-device closeout JSON path was not returned");
assert.ok(blockedResult.files.driverRealDeviceCloseoutMarkdown, "driver real-device closeout Markdown path was not returned");
assert.ok(blockedResult.files.unblockPlanJson, "unblock plan JSON path was not returned");
assert.ok(blockedResult.files.unblockPlanMarkdown, "unblock plan Markdown path was not returned");
assert.ok(blockedResult.files.fieldEvidenceIntake?.summaryMarkdown, "field evidence intake summary path was not returned");
assert.ok(blockedResult.files.fieldEvidenceIntake?.intakeManifest, "field evidence intake manifest path was not returned");
assert.ok(blockedResult.files.fieldEvidenceIntake?.evidenceItemsCsv, "field evidence intake CSV path was not returned");
assert.ok(blockedResult.files.fieldEvidenceIntake?.intakeRulesMarkdown, "field evidence intake rules path was not returned");
assert.ok(blockedResult.files.fieldEvidenceIntake?.signoffBoundaryMarkdown, "field evidence intake signoff path was not returned");
assert.ok(blockedResult.files.fieldEvidenceIntake?.signoffBoundaryCsv, "field evidence intake signoff CSV path was not returned");
assert.ok(
  Array.isArray(blockedResult.files.fieldEvidenceIntake?.groupMarkdownFiles) &&
    blockedResult.files.fieldEvidenceIntake.groupMarkdownFiles.length === 1,
  "field evidence intake group Markdown files were not copied",
);
assert.ok(
  Array.isArray(blockedResult.files.onsiteTaskBoardRoleMarkdownFiles) &&
    blockedResult.files.onsiteTaskBoardRoleMarkdownFiles.length === 2,
  "onsite role task-board Markdown files were not copied",
);
assert.ok(!blockedResult.files.fieldEvidenceManifestRaw, "raw field evidence should not be copied by default");
assert.ok(
  blockedResult.files.productionFirstStageEvidenceSuggestionsCsv,
  "first-stage evidence suggestions CSV was not copied",
);

const summaryMarkdown = readGeneratedFile(blockedResult.files.summaryMarkdown);
const handoffManifest = readGeneratedFile(blockedResult.files.handoffManifest);
const d49EmployeeIntakeGuide = readGeneratedFile(blockedResult.files.d49EmployeeIntakeGuide);
const d49EmployeeWorkbook = readGeneratedBuffer(blockedResult.files.d49EmployeeImportTemplate);
const d49WorkbookEntries = readZipEntries(d49EmployeeWorkbook);
const d49WorkbookXml = readZipTextEntry(d49WorkbookEntries, "xl/workbook.xml");
const d49ImportSheetXml = readZipTextEntry(d49WorkbookEntries, "xl/worksheets/sheet2.xml");
const d49ExampleSheetXml = readZipTextEntry(d49WorkbookEntries, "xl/worksheets/sheet3.xml");
const productionEnvFixMarkdown = readGeneratedFile(blockedResult.files.productionEnvFixChecklistMarkdown);
const productionEnvFixCsv = readGeneratedFile(blockedResult.files.productionEnvFixChecklistCsv);
const productionEnvValueIntakeMarkdown = readGeneratedFile(blockedResult.files.productionEnvValueIntakeMarkdown);
const productionEnvValueIntakeCsv = readGeneratedFile(blockedResult.files.productionEnvValueIntakeCsv);
const productionEnvMinimumValueIntakeMarkdown = readGeneratedFile(
  blockedResult.files.productionEnvMinimumValueIntakeMarkdown,
);
const productionEnvMinimumValueIntakeCsv = readGeneratedFile(blockedResult.files.productionEnvMinimumValueIntakeCsv);
const productionEnvMinimumValuesFragmentTemplate = readGeneratedFile(
  blockedResult.files.productionEnvMinimumValuesFragmentTemplate,
);
const productionEnvValuesFragmentTemplate = readGeneratedFile(blockedResult.files.productionEnvValuesFragmentTemplate);
const productionEnvFillTemplate = readGeneratedFile(blockedResult.files.productionEnvFillTemplate);
const productionEnvSetupCopy = readGeneratedFile(blockedResult.files.productionEnvSetupJson);
const productionEnvSetupMarkdownCopy = readGeneratedFile(blockedResult.files.productionEnvSetupMarkdown);
const productionEnvIntakeVerificationCopy = readGeneratedFile(blockedResult.files.productionEnvIntakeVerificationJson);
const productionEnvIntakeVerificationMarkdownCopy = readGeneratedFile(
  blockedResult.files.productionEnvIntakeVerificationMarkdown,
);
const redactedManifest = readGeneratedFile(blockedResult.files.fieldEvidenceManifestRedacted);
const releaseCopy = readGeneratedFile(blockedResult.files.releaseCandidateJson);
const taskBoardCopy = readGeneratedFile(blockedResult.files.onsiteTaskBoardJson);
const completionSnapshotCopy = readGeneratedFile(blockedResult.files.completionSnapshotJson);
const ownerDecisionBriefCopy = readGeneratedFile(blockedResult.files.ownerDecisionBriefJson);
const ownerDecisionBriefMarkdownCopy = readGeneratedFile(blockedResult.files.ownerDecisionBriefMarkdown);
const v1V2ScopeBriefCopy = readGeneratedFile(blockedResult.files.v1V2ScopeBriefJson);
const v1V2ScopeBriefMarkdownCopy = readGeneratedFile(blockedResult.files.v1V2ScopeBriefMarkdown);
const productionGoLiveStageChecklistCopy = readGeneratedFile(blockedResult.files.productionGoLiveStageChecklistJson);
const productionGoLiveStageChecklistMarkdownCopy = readGeneratedFile(
  blockedResult.files.productionGoLiveStageChecklistMarkdown,
);
const productionFirstStageExecutionCopy = readGeneratedFile(blockedResult.files.productionFirstStageExecutionJson);
const productionFirstStageExecutionMarkdownCopy = readGeneratedFile(
  blockedResult.files.productionFirstStageExecutionMarkdown,
);
const productionFirstStageEvidenceSuggestionsCopy = readGeneratedFile(
  blockedResult.files.productionFirstStageEvidenceSuggestionsJson,
);
const productionFirstStageEvidenceSuggestionsMarkdownCopy = readGeneratedFile(
  blockedResult.files.productionFirstStageEvidenceSuggestionsMarkdown,
);
const productionFirstStageEvidenceSuggestionsCsvCopy = readGeneratedFile(
  blockedResult.files.productionFirstStageEvidenceSuggestionsCsv,
);
const productionPersistenceEvidenceCopy = readGeneratedFile(blockedResult.files.productionPersistenceEvidenceJson);
const productionPersistenceEvidenceMarkdownCopy = readGeneratedFile(
  blockedResult.files.productionPersistenceEvidenceMarkdown,
);
const productionRuntimeSmokeCopy = readGeneratedFile(blockedResult.files.productionRuntimeSmokeJson);
const productionRuntimeSmokeMarkdownCopy = readGeneratedFile(blockedResult.files.productionRuntimeSmokeMarkdown);
const todoLoadPrecheckCopy = readGeneratedFile(blockedResult.files.todoLoadPrecheckJson);
const todoLoadPrecheckMarkdownCopy = readGeneratedFile(blockedResult.files.todoLoadPrecheckMarkdown);
const printChainCloseoutCopy = readGeneratedFile(blockedResult.files.printChainCloseoutJson);
const printChainCloseoutMarkdownCopy = readGeneratedFile(blockedResult.files.printChainCloseoutMarkdown);
const printChainExecutionCopy = readGeneratedFile(blockedResult.files.printChainExecutionJson);
const printChainExecutionMarkdownCopy = readGeneratedFile(blockedResult.files.printChainExecutionMarkdown);
const driverRealDeviceExecutionCopy = readGeneratedFile(blockedResult.files.driverRealDeviceExecutionJson);
const driverRealDeviceExecutionMarkdownCopy = readGeneratedFile(blockedResult.files.driverRealDeviceExecutionMarkdown);
const driverRealDeviceCloseoutCopy = readGeneratedFile(blockedResult.files.driverRealDeviceCloseoutJson);
const driverRealDeviceCloseoutMarkdownCopy = readGeneratedFile(blockedResult.files.driverRealDeviceCloseoutMarkdown);
const unblockPlanCopy = readGeneratedFile(blockedResult.files.unblockPlanJson);
const unblockPlanMarkdownCopy = readGeneratedFile(blockedResult.files.unblockPlanMarkdown);
const fieldEvidenceIntakeCopy = readGeneratedFile(blockedResult.files.fieldEvidenceIntake.intakeManifest);
const fieldEvidenceIntakeRulesCopy = readGeneratedFile(blockedResult.files.fieldEvidenceIntake.intakeRulesMarkdown);
const fieldEvidenceIntakeSignoffCsvCopy = readGeneratedFile(blockedResult.files.fieldEvidenceIntake.signoffBoundaryCsv);
const fieldEvidenceIntakeGroupCopy = readGeneratedFile(blockedResult.files.fieldEvidenceIntake.groupMarkdownFiles[0]);
const technicalRoleCopy = readGeneratedFile(
  blockedResult.files.onsiteTaskBoardRoleMarkdownFiles.find((path) => path.includes("technical-management")),
);
const driverRoleCopy = readGeneratedFile(
  blockedResult.files.onsiteTaskBoardRoleMarkdownFiles.find((path) => path.includes("driver")),
);
assert.match(summaryMarkdown, /ERP V1 上线交接包/);
assert.match(summaryMarkdown, /当前结论：BLOCKED/);
assert.match(summaryMarkdown, /D49 正式员工导入/);
assert.match(summaryMarkdown, /d49-formal-employee-machine-import-template\.xlsx/);
assert.match(summaryMarkdown, /正式数据页不含演示员工/);
assert.match(summaryMarkdown, /生产环境修正清单/);
assert.match(summaryMarkdown, /生产 env 准备报告/);
assert.match(summaryMarkdown, /生产 env 真实值校验/);
assert.match(summaryMarkdown, /11 项真实值 intake \/ env 校验阻塞/);
assert.match(summaryMarkdown, /最小补值清单/);
assert.match(summaryMarkdown, /ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL/);
assert.match(summaryMarkdown, /ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND/);
assert.match(summaryMarkdown, /PREPARED \/ 仍需填真实值/);
assert.match(summaryMarkdown, /安全 env 文件已准备，仍需填真实生产值/);
assert.match(summaryMarkdown, /Env 文件：env 文件 1（路径已脱敏）/);
assert.match(summaryMarkdown, /production-env-setup\.latest\.md\/json/);
assert.match(summaryMarkdown, /production-env-intake-verify\.latest\.md\/json/);
assert.match(summaryMarkdown, /production-env-real-value-intake\.zh-CN\.md/);
assert.match(summaryMarkdown, /production-env-real-value-intake\.csv/);
assert.match(summaryMarkdown, /production-env-minimum-real-value-intake\.zh-CN\.md/);
assert.match(summaryMarkdown, /production-env-minimum-real-value-intake\.csv/);
assert.match(summaryMarkdown, /production-env-minimum-values-fragment\.template\.env\.example/);
assert.match(summaryMarkdown, /production-env-values-fragment\.template\.env\.example/);
assert.match(summaryMarkdown, /production-env-fill-template\.env\.example/);
assert.match(summaryMarkdown, /统一 V1 持久化 profile/);
assert.match(summaryMarkdown, /ERP_V1_DATABASE_URL or DATABASE_URL or PGURL valid PostgreSQL connection string/);
assert.match(summaryMarkdown, /现场角色任务清单/);
assert.match(summaryMarkdown, /V1 完成度快照/);
assert.match(summaryMarkdown, /负责人决策摘要/);
assert.match(summaryMarkdown, /V1\/V2 差异摘要/);
assert.match(summaryMarkdown, /生产环境 \/ 持久化第一阶段执行/);
assert.match(summaryMarkdown, /2\/7 步骤通过，仍有阻塞/);
assert.match(summaryMarkdown, /真实值 dry-run 预计 env 预检：ready \(10\/10\)，阻塞 0/);
assert.match(summaryMarkdown, /真实值 dry-run 预计 intake：15\/22 行已配置，必填缺失 0，任选组阻塞 0/);
assert.match(summaryMarkdown, /真实值 dry-run 最小阻塞补值：ready \(11\/11\)，缺 0/);
assert.match(summaryMarkdown, /真实值 dry-run 建议 \/ 可选补值：blocked \(0\/8\)，缺 8/);
assert.match(summaryMarkdown, /生产 env 真实值片段执行计划/);
assert.match(summaryMarkdown, /推荐片段模板：production-env-minimum-values-fragment\.template\.env\.example/);
assert.match(summaryMarkdown, /dry-run 新鲜度：有效；有效期 24 小时；检查时间 已记录/);
assert.match(summaryMarkdown, /先跑 dry-run/);
assert.match(summaryMarkdown, /--production-env-values-file <secure-minimum-values-env-fragment> --production-env-values-dry-run/);
assert.match(summaryMarkdown, /dry-run 无阻塞后正式合并并继续第一阶段/);
assert.match(summaryMarkdown, /node -- scripts\/run-v1-go-live-suite\.mjs --sync-canonical-latest --json/);
assert.match(summaryMarkdown, /第一阶段现场证据建议/);
assert.match(summaryMarkdown, /7 项可建议自动接受，2 项只有部分自动化支撑，1 项仍需人工证据/);
assert.match(summaryMarkdown, /不能替代现场证据、签字、release candidate 刷新或 V1 完成声明/);
assert.match(summaryMarkdown, /production-first-stage-evidence-suggestions\.latest\.md\/json/);
assert.match(summaryMarkdown, /production-first-stage-evidence-suggestions\.csv/);
assert.match(summaryMarkdown, /生产持久化留证/);
assert.match(summaryMarkdown, /3\/8 阶段通过/);
assert.match(summaryMarkdown, /生产 PostgreSQL 备份 \/ 恢复抽样验证/);
assert.match(summaryMarkdown, /production-persistence-evidence\.latest\.md\/json/);
assert.match(summaryMarkdown, /生产 API runtime smoke/);
assert.match(summaryMarkdown, /2\/4 通过/);
assert.match(summaryMarkdown, /production-runtime-smoke\.latest\.md\/json/);
assert.match(summaryMarkdown, /运行模式：external_service/);
assert.match(summaryMarkdown, /生产待办只读容量预检查/);
assert.match(summaryMarkdown, /100\/100 成功/);
assert.match(summaryMarkdown, /P95 240ms \/ 阈值 1000ms/);
assert.match(summaryMarkdown, /非本机 HTTPS 生产 API/);
assert.match(summaryMarkdown, /todo-load-precheck\.latest\.md\/json/);
assert.match(summaryMarkdown, /生产 env 变量预检/);
assert.match(summaryMarkdown, /迁移执行请求：否/);
assert.match(summaryMarkdown, /阶段 Closeout 报告/);
assert.match(summaryMarkdown, /打印链路阶段 closeout/);
assert.match(summaryMarkdown, /司机真机阶段执行/);
assert.match(summaryMarkdown, /司机真机阶段 closeout/);
assert.match(summaryMarkdown, /真实打印链路/);
assert.match(summaryMarkdown, /1\/2 步骤通过，仍有阻塞/);
assert.match(summaryMarkdown, /运行中 API 司机真机门禁/);
assert.match(summaryMarkdown, /纸质标签原生扫码仍未通过/);
assert.match(summaryMarkdown, /生产上线组合预检阶段清单/);
assert.match(summaryMarkdown, /当前 API 生产 profile 确认/);
assert.match(summaryMarkdown, /run-v1-production-go-live-precheck/);
assert.match(summaryMarkdown, /生产上线组合预检 JSON \/ Markdown 结果/);
assert.match(summaryMarkdown, /最小解除阻塞清单/);
assert.match(summaryMarkdown, /现场证据采集包/);
assert.match(summaryMarkdown, /V1 现场仍有 52 个待处理任务/);
assert.match(summaryMarkdown, /V1 解除阻塞仍有 52 项待处理/);
assert.match(summaryMarkdown, /先补生产环境和持久化/);
assert.match(summaryMarkdown, /V1 真实上线就绪度：76-79%/);
assert.match(summaryMarkdown, /是否可以宣布 V1 完成：不可以/);
assert.match(summaryMarkdown, /V2 主题：企微 \/ 客户自动化、AI \/ OCR \/ 图片识别/);
assert.match(summaryMarkdown, /必填证据完成：0\/40/);
assert.match(summaryMarkdown, /岗位任务文件：2 个/);
assert.match(summaryMarkdown, /技术\/管理/);
assert.match(summaryMarkdown, /V2 计划差异/);
assert.match(summaryMarkdown, /--include-raw-field-evidence/);

const noDryRunRun = await runNode([
  handoffScript,
  "--release-candidate-json",
  releaseJsonPath,
  "--release-candidate-markdown",
  releaseMarkdownPath,
  "--production-first-stage-execution-json",
  productionFirstStageExecutionNoDryRunJsonPath,
  "--production-first-stage-execution-markdown",
  productionFirstStageExecutionMarkdownPath,
  "--field-evidence-manifest",
  fieldManifestPath,
  "--output-dir",
  noDryRunOutputRoot,
  "--json",
]);
assert.equal(noDryRunRun.status, 0, runFailureMessage("handoff pack should explain missing dry-run coverage", noDryRunRun));
const noDryRunResult = JSON.parse(noDryRunRun.stdout);
const noDryRunSummaryMarkdown = readGeneratedFile(noDryRunResult.files.summaryMarkdown);
assert.match(noDryRunSummaryMarkdown, /真实值 dry-run 覆盖：未纳入/);
assert.match(noDryRunSummaryMarkdown, /dry-run 新鲜度：dry-run 证明缺少检查时间；有效期 24 小时；检查时间 未记录/);
assert.match(noDryRunSummaryMarkdown, /当前第一阶段 latest 不是 `--production-env-values-dry-run` 产物/);
assert.doesNotMatch(noDryRunSummaryMarkdown, /真实值 dry-run 预计 env 预检：ready/);

const noFirstStageRun = await runNode([
  handoffScript,
  "--release-candidate-json",
  releaseJsonPath,
  "--release-candidate-markdown",
  releaseMarkdownPath,
  "--field-evidence-manifest",
  fieldManifestPath,
  "--output-dir",
  noFirstStageOutputRoot,
  "--json",
], { cwd: noFirstStageCwd });
assert.equal(
  noFirstStageRun.status,
  0,
  runFailureMessage("handoff pack should recommend setup-env command when first-stage report is missing", noFirstStageRun),
);
const noFirstStageResult = JSON.parse(noFirstStageRun.stdout);
const noFirstStageSummaryMarkdown = readGeneratedFile(noFirstStageResult.files.summaryMarkdown, noFirstStageOutputRoot);
assert.match(noFirstStageSummaryMarkdown, /未找到生产环境 \/ 持久化第一阶段执行报告/);
assert.match(
  noFirstStageSummaryMarkdown,
  /run-v1-production-first-stage-execution\.mjs --use-production-env-setup-env-file --json/,
);
assert.match(noFirstStageSummaryMarkdown, /绕开 setup 报告/);
assert.doesNotMatch(
  noFirstStageSummaryMarkdown,
  /run-v1-production-first-stage-execution\.mjs --env-file <secure-env-file> --json/,
);

assert.match(handoffManifest, /v1_go_live_handoff_pack/);
assert.match(handoffManifest, /d49EmployeeIntake/);
assert.match(handoffManifest, /"realEmployeeDataIncluded": false/);
assert.match(d49EmployeeIntakeGuide, /D49 正式员工账号导入与验收/);
assert.match(d49EmployeeIntakeGuide, /一名真实员工填写一行/);
assert.match(d49EmployeeIntakeGuide, /临时密码不得写回本工作簿/);
assert.match(d49EmployeeIntakeGuide, /岗位矩阵达到8\/8/);
assert.match(
  d49EmployeeIntakeGuide,
  /run-d49-employee-workbook-precheck\.mjs --file <filled-workbook\.xlsx> --require-payroll-attendance-fields --json/,
);
assert.match(d49EmployeeIntakeGuide, /全员出生\/入职日期、工资岗位键及考勤来源\/人员编号/);
assert.match(d49EmployeeIntakeGuide, /只有`uploadAllowed=true`才进入网页上传/);
assert.match(d49WorkbookXml, /name="员工机台"/);
assert.match(d49WorkbookXml, /name="示例-员工机台"/);
assert.match(d49ImportSheetXml, /员工编号/);
assert.doesNotMatch(d49ImportSheetXml, /王师傅/);
assert.match(d49ExampleSheetXml, /王师傅/);
assert.match(d49ExampleSheetXml, /示例-请替换/);
assert.match(handoffManifest, /productionEnvFixChecklist/);
assert.match(handoffManifest, /productionEnvSetup/);
assert.match(handoffManifest, /printChainExecution/);
assert.match(handoffManifest, /printChainCloseout/);
assert.match(handoffManifest, /productionEnvMinimumValueIntakeChecklist/);
assert.match(handoffManifest, /productionEnvValueExecutionPlan/);
assert.match(handoffManifest, /onsiteTaskBoard/);
assert.match(handoffManifest, /completionSnapshot/);
assert.match(handoffManifest, /ownerDecisionBrief/);
assert.match(handoffManifest, /v1V2ScopeBrief/);
assert.match(handoffManifest, /productionGoLiveStageChecklist/);
assert.match(handoffManifest, /productionFirstStageExecution/);
assert.match(handoffManifest, /productionFirstStageEvidenceSuggestions/);
assert.match(handoffManifest, /productionPersistenceEvidence/);
assert.match(handoffManifest, /productionRuntimeSmoke/);
assert.match(handoffManifest, /todoLoadPrecheck/);
assert.match(handoffManifest, /printChainCloseout/);
assert.match(handoffManifest, /driverRealDeviceExecution/);
assert.match(handoffManifest, /driverRealDeviceCloseout/);
assert.match(handoffManifest, /unblockPlan/);
assert.match(handoffManifest, /roleMarkdownFiles/);
assert.match(redactedManifest, /\[redacted-evidence-ref\]/);
assert.match(redactedManifest, /\[redacted-notes\]/);
assert.match(releaseCopy, /v1_release_candidate_check/);
assert.match(productionEnvFixMarkdown, /ERP V1 生产环境修正清单/);
assert.match(productionEnvFixMarkdown, /补齐 PostgreSQL 连接和 object_storage 文件 profile/);
assert.match(productionEnvFixMarkdown, /填写提示/);
assert.match(productionEnvFixMarkdown, /生产必须显式使用 postgres/);
assert.match(productionEnvFixMarkdown, /复核步骤/);
assert.match(productionEnvFixMarkdown, /npm run v1-production-profile-live:check/);
assert.match(productionEnvFixCsv, /"key","label","ownerRole"/);
assert.match(productionEnvFixCsv, /"v1-persistence-profile","统一 V1 持久化 profile","技术\/管理"/);
assert.match(productionEnvFixCsv, /"valueGuidance","verificationSteps"/);
assert.match(productionEnvFixCsv, /生产必须显式使用 postgres/);
assert.match(productionEnvValueIntakeMarkdown, /ERP V1 生产 env 真实值填写 \/ 验收清单/);
assert.match(productionEnvValueIntakeMarkdown, /任选其一，优先使用 ERP_V1_DATABASE_URL/);
assert.match(productionEnvValueIntakeMarkdown, /PostgreSQL 生产库 \/ 持久化 profile/);
assert.match(productionEnvValueIntakeCsv, /"filled","verified","evidenceRef"/);
assert.match(productionEnvValueIntakeCsv, /ERP_V1_DATABASE_URL \/ DATABASE_URL/);
assert.doesNotMatch(productionEnvValueIntakeCsv, /VALID_POSTGRESQL_CONNECTION_STRING|HTTP_HTTPS_URL|VALID_BUCKET_NAME/);
assert.match(productionEnvMinimumValueIntakeMarkdown, /ERP V1 生产 env 最小真实值填写 \/ 验收清单/);
assert.match(productionEnvMinimumValueIntakeMarkdown, /最小补值行：11/);
assert.match(productionEnvMinimumValueIntakeCsv, /ERP_V1_DATABASE_URL \/ DATABASE_URL/);
assert.match(productionEnvMinimumValueIntakeCsv, /ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND/);
assert.doesNotMatch(productionEnvMinimumValueIntakeCsv, /ERP_V1_PERSISTENCE_PROFILE/);
assert.doesNotMatch(productionEnvMinimumValueIntakeCsv, /ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT/);
assert.match(productionEnvMinimumValuesFragmentTemplate, /ERP V1 production env minimum real values fragment template/);
assert.match(productionEnvMinimumValuesFragmentTemplate, /minimum blocking path/);
assert.match(
  productionEnvMinimumValuesFragmentTemplate,
  /--values-env-file <secure-minimum-values-env-fragment>/,
);
assert.match(productionEnvMinimumValuesFragmentTemplate, /--production-env-values-dry-run/);
assert.match(
  productionEnvMinimumValuesFragmentTemplate,
  /run-v1-production-first-stage-execution\.mjs --use-production-env-setup-env-file --production-env-values-file <secure-minimum-values-env-fragment> --production-env-values-dry-run/,
);
assert.match(
  productionEnvMinimumValuesFragmentTemplate,
  /If bypassing the production env setup report, pass --target-env-file <secure-env-file> to the intake apply dry-run, or --env-file <secure-env-file> to the first-stage runner/,
);
assert.match(
  productionEnvMinimumValuesFragmentTemplate,
  /Minimum path uses: ERP_V1_DATABASE_URL; alternatives in full template: ERP_V1_DATABASE_URL or DATABASE_URL/,
);
assert.match(
  productionEnvMinimumValuesFragmentTemplate,
  /# ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=<REPLACE_WITH_ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY>/,
);
assert.doesNotMatch(productionEnvMinimumValuesFragmentTemplate, /ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT/);
assert.doesNotMatch(productionEnvMinimumValuesFragmentTemplate, /# DATABASE_URL=<REPLACE_WITH_DATABASE_URL>/);
assert.doesNotMatch(productionEnvMinimumValuesFragmentTemplate, /# PGURL=<REPLACE_WITH_PGURL>/);
assert.match(productionEnvValuesFragmentTemplate, /ERP V1 production env real values fragment template/);
assert.match(productionEnvValuesFragmentTemplate, /--production-env-values-file <secure-values-env-fragment>/);
assert.match(
  productionEnvValuesFragmentTemplate,
  /run-v1-production-first-stage-execution\.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --production-env-values-dry-run/,
);
assert.match(
  productionEnvValuesFragmentTemplate,
  /run-v1-production-first-stage-execution\.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --field-evidence-manifest/,
);
assert.match(
  productionEnvValuesFragmentTemplate,
  /If bypassing the production env setup report, pass --target-env-file <secure-env-file> to the intake apply dry-run, or --env-file <secure-env-file> to the first-stage runner/,
);
assert.match(
  productionEnvValuesFragmentTemplate,
  /merge only variables listed in production-env-real-value-intake\.csv/,
);
assert.match(productionEnvValuesFragmentTemplate, /Choose one: ERP_V1_DATABASE_URL or DATABASE_URL/);
assert.match(productionEnvValuesFragmentTemplate, /# ERP_V1_DATABASE_URL=<REPLACE_WITH_ERP_V1_DATABASE_URL>/);
assert.match(productionEnvValuesFragmentTemplate, /# ERP_V1_PERSISTENCE_PROFILE=postgres/);
assert.match(
  productionEnvValuesFragmentTemplate,
  /# ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=<REPLACE_WITH_ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY>/,
);
assert.match(productionEnvFillTemplate, /ERP V1 production env fill template/);
assert.match(productionEnvFillTemplate, /ERP_V1_PERSISTENCE_PROFILE=postgres/);
assert.match(productionEnvFillTemplate, /Choose one: ERP_V1_DATABASE_URL or DATABASE_URL/);
assert.match(productionEnvFillTemplate, /ERP_V1_DATABASE_URL=<REPLACE_WITH_ERP_V1_DATABASE_URL>/);
assert.match(productionEnvFillTemplate, /DATABASE_URL=<REPLACE_WITH_DATABASE_URL>/);
assert.match(
  productionEnvFillTemplate,
  /ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL=<REPLACE_WITH_ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL>/,
);
assert.match(productionEnvFillTemplate, /ERP_V1_FILE_STORAGE_PROFILE=object_storage/);
assert.match(productionEnvFillTemplate, /ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=<REPLACE_WITH_ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT>/);
assert.match(productionEnvFillTemplate, /ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=<REPLACE_WITH_ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET>/);
assert.match(productionEnvFillTemplate, /ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=<REPLACE_WITH_ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY>/);
assert.match(productionEnvFillTemplate, /# Fill: 生产必须显式使用 postgres/);
assert.match(productionEnvFillTemplate, /# Verify: npm run v1-production-profile-live:check/);
assert.match(productionEnvFillTemplate, /node scripts\/run-v1-production-env-file-audit\.mjs --env-file <secure-env-file>/);
assert.match(productionEnvFillTemplate, /node scripts\/run-v1-production-env-preflight\.mjs --use-production-env-setup-env-file/);
assert.match(productionEnvFillTemplate, /Use --env-file <secure-env-file> only when intentionally bypassing the production env setup report/);
assert.doesNotMatch(productionEnvFillTemplate, /run-v1-production-env-preflight\.mjs --env-file <secure-env-file>/);
assert.doesNotMatch(productionEnvFillTemplate, /VALID_POSTGRESQL_CONNECTION_STRING|DIFFERENT_HOST_PORT_DATABASE/);
assert.doesNotMatch(productionEnvFillTemplate, /HTTP_HTTPS_URL|VALID_BUCKET_NAME/);
assert.match(productionEnvSetupCopy, /v1_production_env_setup/);
assert.match(productionEnvSetupCopy, /安全 env 文件已准备，仍需填真实生产值/);
assert.match(productionEnvSetupCopy, /"path": "env 文件 1"/);
assert.match(productionEnvSetupCopy, /"pathRedacted": true/);
assert.match(productionEnvSetupCopy, /"envFilePathExposed": false/);
assert.match(productionEnvSetupMarkdownCopy, /V1 生产 env 准备报告/);
assert.match(productionEnvSetupMarkdownCopy, /PREPARED/);
assert.match(productionEnvSetupMarkdownCopy, /路径：env 文件 1（路径已脱敏）/);
assert.match(productionEnvIntakeVerificationCopy, /v1_production_env_real_value_intake_verification/);
assert.match(productionEnvIntakeVerificationCopy, /11 项真实值 intake/);
assert.match(productionEnvIntakeVerificationCopy, /minimumBlockingItems/);
assert.match(productionEnvIntakeVerificationMarkdownCopy, /V1 生产 env 真实值 intake 校验/);
assert.match(productionEnvIntakeVerificationMarkdownCopy, /PostgreSQL \/ 对象存储 \/ CUPS/);
assert.match(taskBoardCopy, /v1_onsite_task_board/);
assert.match(completionSnapshotCopy, /v1_completion_snapshot/);
assert.match(ownerDecisionBriefCopy, /v1_owner_decision_brief/);
assert.match(ownerDecisionBriefMarkdownCopy, /ERP V1 负责人决策摘要/);
assert.match(v1V2ScopeBriefCopy, /v1_v2_scope_brief/);
assert.match(v1V2ScopeBriefMarkdownCopy, /ERP V1 \/ V2 差异摘要/);
assert.match(productionGoLiveStageChecklistCopy, /runtime-production-profile/);
assert.match(productionGoLiveStageChecklistMarkdownCopy, /ERP V1 生产上线组合预检阶段清单/);
assert.match(productionFirstStageExecutionCopy, /v1_production_first_stage_execution/);
assert.match(productionFirstStageExecutionCopy, /production-env-preflight/);
assert.match(productionFirstStageExecutionMarkdownCopy, /V1 Production First-Stage Execution/);
assert.match(productionFirstStageEvidenceSuggestionsCopy, /v1_production_first_stage_evidence_suggestions/);
assert.match(productionFirstStageEvidenceSuggestionsMarkdownCopy, /V1 Production First-Stage Evidence Suggestions/);
assert.match(productionFirstStageEvidenceSuggestionsCsvCopy, /AUTO:production-postgres-preflight:20260708T100000Z/);
assert.match(productionPersistenceEvidenceCopy, /v1_production_persistence_evidence/);
assert.match(productionPersistenceEvidenceCopy, /production-postgres-backup-restore-check/);
assert.match(productionPersistenceEvidenceMarkdownCopy, /V1 Production Persistence Evidence/);
assert.match(productionRuntimeSmokeCopy, /v1_production_runtime_smoke/);
assert.match(productionRuntimeSmokeCopy, /runtime-production-profile/);
assert.match(productionRuntimeSmokeMarkdownCopy, /V1 Production Runtime Smoke/);
assert.match(todoLoadPrecheckCopy, /v1_todo_load_precheck/);
assert.match(todoLoadPrecheckCopy, /"sourcePayloadCopied"/);
assert.match(todoLoadPrecheckCopy, /"sourcePathsIncluded": false/);
assert.match(todoLoadPrecheckMarkdownCopy, /V1 Todo Load Precheck Handoff Snapshot/);
assert.match(todoLoadPrecheckMarkdownCopy, /100\/100 successful/);
assert.doesNotMatch(todoLoadPrecheckCopy + todoLoadPrecheckMarkdownCopy, /SENSITIVE_TODO_LOAD/);
assert.match(printChainCloseoutCopy, /v1_print_chain_closeout/);
assert.match(printChainCloseoutMarkdownCopy, /V1 Print Chain Closeout/);
assert.match(printChainExecutionCopy, /v1_print_chain_execution/);
assert.match(printChainExecutionMarkdownCopy, /V1 Print-Chain Execution/);
assert.match(driverRealDeviceExecutionCopy, /v1_driver_real_device_execution/);
assert.match(driverRealDeviceExecutionMarkdownCopy, /V1 Driver Real-Device Execution/);
assert.match(driverRealDeviceCloseoutCopy, /v1_driver_real_device_closeout/);
assert.match(driverRealDeviceCloseoutMarkdownCopy, /V1 Driver Real-Device Closeout/);
assert.match(unblockPlanCopy, /V1 解除阻塞仍有 52 项待处理/);
assert.match(unblockPlanMarkdownCopy, /ERP V1 最小解除阻塞清单/);
assert.match(fieldEvidenceIntakeCopy, /v1_field_evidence_intake_pack/);
assert.match(fieldEvidenceIntakeRulesCopy, /ERP V1 现场证据填写规则/);
assert.match(fieldEvidenceIntakeRulesCopy, /--sync-canonical-latest/);
assert.match(fieldEvidenceIntakeSignoffCsvCopy, /"recordType","role","label"/);
assert.match(fieldEvidenceIntakeSignoffCsvCopy, /"boundary","v1_v2_boundary","V1\/V2 边界确认"/);
assert.match(fieldEvidenceIntakeGroupCopy, /ERP V1 现场证据采集单/);
assert.match(technicalRoleCopy, /ERP V1 现场任务清单 - 技术\/管理/);
assert.match(driverRoleCopy, /ERP V1 现场任务清单 - 司机/);
assertNoSensitiveOutput(
  blockedRun.stdout +
    blockedRun.stderr +
    summaryMarkdown +
    handoffManifest +
    productionEnvFixMarkdown +
    productionEnvFixCsv +
    productionEnvValueIntakeMarkdown +
    productionEnvValueIntakeCsv +
    productionEnvMinimumValueIntakeMarkdown +
    productionEnvMinimumValueIntakeCsv +
    productionEnvMinimumValuesFragmentTemplate +
    productionEnvValuesFragmentTemplate +
    productionEnvFillTemplate +
    productionEnvSetupCopy +
    productionEnvSetupMarkdownCopy +
    productionEnvIntakeVerificationCopy +
    productionEnvIntakeVerificationMarkdownCopy +
    redactedManifest +
    releaseCopy +
    taskBoardCopy +
    completionSnapshotCopy +
    ownerDecisionBriefCopy +
    ownerDecisionBriefMarkdownCopy +
    v1V2ScopeBriefCopy +
    v1V2ScopeBriefMarkdownCopy +
    productionGoLiveStageChecklistCopy +
    productionGoLiveStageChecklistMarkdownCopy +
    productionFirstStageExecutionCopy +
    productionFirstStageExecutionMarkdownCopy +
    productionFirstStageEvidenceSuggestionsCopy +
    productionFirstStageEvidenceSuggestionsMarkdownCopy +
    productionFirstStageEvidenceSuggestionsCsvCopy +
    productionPersistenceEvidenceCopy +
    productionPersistenceEvidenceMarkdownCopy +
    productionRuntimeSmokeCopy +
    productionRuntimeSmokeMarkdownCopy +
    todoLoadPrecheckCopy +
    todoLoadPrecheckMarkdownCopy +
    printChainCloseoutCopy +
    printChainCloseoutMarkdownCopy +
    printChainExecutionCopy +
    printChainExecutionMarkdownCopy +
    driverRealDeviceExecutionCopy +
    driverRealDeviceExecutionMarkdownCopy +
    driverRealDeviceCloseoutCopy +
    driverRealDeviceCloseoutMarkdownCopy +
    unblockPlanCopy +
    unblockPlanMarkdownCopy +
    fieldEvidenceIntakeCopy +
    fieldEvidenceIntakeRulesCopy +
    fieldEvidenceIntakeSignoffCsvCopy +
    fieldEvidenceIntakeGroupCopy +
    technicalRoleCopy +
    driverRoleCopy,
);

const rawRun = await runNode([
  handoffScript,
  "--release-candidate-json",
  releaseJsonPath,
  "--release-candidate-markdown",
  releaseMarkdownPath,
  "--onsite-task-board-json",
  taskBoardJsonPath,
  "--onsite-task-board-markdown",
  taskBoardMarkdownPath,
  "--onsite-task-board-roles-dir",
  taskBoardRolesDir,
  "--completion-snapshot-json",
  completionSnapshotJsonPath,
  "--completion-snapshot-markdown",
  completionSnapshotMarkdownPath,
  "--field-evidence-intake-dir",
  fieldEvidenceIntakeDir,
  "--owner-decision-brief-json",
  ownerDecisionBriefJsonPath,
  "--owner-decision-brief-markdown",
  ownerDecisionBriefMarkdownPath,
  "--v1-v2-scope-brief-json",
  v1V2ScopeBriefJsonPath,
  "--v1-v2-scope-brief-markdown",
  v1V2ScopeBriefMarkdownPath,
  "--production-go-live-stage-checklist-json",
  productionGoLiveStageChecklistJsonPath,
  "--production-go-live-stage-checklist-markdown",
  productionGoLiveStageChecklistMarkdownPath,
  "--production-env-setup-json",
  productionEnvSetupJsonPath,
  "--production-env-setup-markdown",
  productionEnvSetupMarkdownPath,
  "--production-env-intake-verify-json",
  productionEnvIntakeVerifyJsonPath,
  "--production-env-intake-verify-markdown",
  productionEnvIntakeVerifyMarkdownPath,
  "--production-first-stage-execution-json",
  productionFirstStageExecutionJsonPath,
  "--production-first-stage-execution-markdown",
  productionFirstStageExecutionMarkdownPath,
  "--unblock-plan-json",
  unblockPlanJsonPath,
  "--unblock-plan-markdown",
  unblockPlanMarkdownPath,
  "--field-evidence-manifest",
  fieldManifestPath,
  "--output-dir",
  rawOutputRoot,
  "--include-raw-field-evidence",
  "--json",
]);
assert.equal(rawRun.status, 0, runFailureMessage("raw evidence option should still write the pack", rawRun));
const rawResult = JSON.parse(rawRun.stdout);
assert.equal(rawResult.safeguards.rawFieldEvidenceIncluded, true);
assert.ok(rawResult.files.fieldEvidenceManifestRaw, "raw field evidence path was not returned");
assert.match(readGeneratedFile(rawResult.files.fieldEvidenceManifestRaw), /prod-db\.local/);
assertNoSensitiveOutput(rawRun.stdout + rawRun.stderr + readGeneratedFile(rawResult.files.summaryMarkdown));

const missingRun = await runNode([
  handoffScript,
  "--release-candidate-json",
  missingReleaseJsonPath,
  "--field-evidence-manifest",
  fieldManifestPath,
  "--output-dir",
  join(tempRoot, "missing-pack"),
  "--json",
]);
assert.equal(missingRun.status, 1, "missing release candidate should fail");
const missingResult = JSON.parse(missingRun.stdout);
assert.equal(missingResult.status, "error");
assert.match(missingResult.error.message, /release candidate JSON is missing/);
assertNoSensitiveOutput(missingRun.stdout + missingRun.stderr);

console.log(
  "V1 go-live handoff pack check passed: blocked pack, stage execution / closeout copies, V1/V2 scope brief copy, field-evidence intake copy, redaction, optional raw evidence, required docs, and missing release candidate handling are covered.",
);

function buildBlockedReleaseCandidate() {
  return {
    scope: "v1_release_candidate_check",
    status: "blocked",
    ready: false,
    generatedAt: "2026-07-04T10:00:00.000+08:00",
    conclusion: "当前仍不能声明 V1 已完成或可真实上线；必须先处理阻塞项。",
    summary: {
      label: "0/4 发布门禁通过",
      passedGateCount: 0,
      totalGateCount: 4,
      blockingCount: 3,
      envPreflight: "2/10 通过",
      fieldEvidence: "V1 现场证据清单仍阻塞：证据 0/40，签字 0/6",
      runtimeReadiness: "5/11 通过",
      fieldAcceptance: "5/11 通过",
    },
    envPreflight: {
      status: "blocked",
      ready: false,
      checkedAt: "2026-07-04T10:00:00.000+08:00",
      summary: {
        label: "2/10 通过",
        passedCount: 2,
        totalCount: 10,
        blockingCount: 6,
        warningCount: 2,
        placeholderValueCount: 0,
      },
      fixChecklist: [
        {
          key: "v1-persistence-profile",
          label: "统一 V1 持久化 profile",
          status: "pending",
          ready: false,
          blocking: true,
          severity: "blocking",
          ownerRole: "技术/管理",
          requiredVariables: [
            "ERP_V1_PERSISTENCE_PROFILE=postgres",
            "ERP_V1_DATABASE_URL or DATABASE_URL or PGURL",
            "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
          ],
          configuredVariableCount: 0,
          totalVariableCount: 3,
          missingVariables: [
            "ERP_V1_PERSISTENCE_PROFILE=postgres",
            "ERP_V1_DATABASE_URL or DATABASE_URL or PGURL valid PostgreSQL connection string",
            "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
          ],
          placeholderVariableCount: 0,
          placeholderVariables: [],
          nextAction: "补齐 PostgreSQL 连接和 object_storage 文件 profile；不要把模板占位符原样取消注释。",
        },
        {
          key: "postgres-restore-validation-env",
          label: "PostgreSQL 恢复验证库环境变量",
          status: "pending",
          ready: false,
          blocking: true,
          severity: "blocking",
          ownerRole: "技术/管理",
          requiredVariables: [
            "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL",
            "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
          ],
          configuredVariableCount: 0,
          totalVariableCount: 2,
          missingVariables: [
            "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL different host/port/database from production source",
            "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
          ],
          placeholderVariableCount: 0,
          placeholderVariables: [],
          nextAction: "补齐专用恢复验证库连接，并显式配置恢复重置授权开关。",
        },
        {
          key: "attachment-object-storage-env",
          label: "附件对象存储环境变量",
          status: "pending",
          ready: false,
          blocking: true,
          severity: "blocking",
          ownerRole: "技术/管理",
          requiredVariables: [
            "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT",
            "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET",
            "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID",
            "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
          ],
          configuredVariableCount: 0,
          totalVariableCount: 4,
          missingVariables: [
            "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT http/https URL",
            "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET valid bucket name",
            "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID",
            "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
          ],
          placeholderVariableCount: 0,
          placeholderVariables: [],
          nextAction: "补齐附件对象存储 endpoint、bucket、access key 和 secret key；真实值只放安全 env 文件。",
        },
        {
          key: "system-printer-command-bridge-env",
          label: "系统打印 command_bridge 环境变量",
          status: "pending",
          ready: false,
          blocking: true,
          severity: "blocking",
          ownerRole: "技术/管理",
          requiredVariables: [
            "ERP_SYSTEM_PRINTER_COMMAND",
            "ERP_SYSTEM_PRINTER_ALLOWLIST",
            "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR",
          ],
          configuredVariableCount: 0,
          totalVariableCount: 3,
          missingVariables: [
            "ERP_SYSTEM_PRINTER_COMMAND",
            "ERP_SYSTEM_PRINTER_ALLOWLIST",
            "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR",
          ],
          placeholderVariableCount: 0,
          placeholderVariables: [],
          nextAction: "补齐打印命令桥命令、设备 allowlist 和 spool 目录；真实路径只放安全 env 文件。",
        },
        {
          key: "cups-preflight-env",
          label: "CUPS 队列预检环境变量",
          status: "pending",
          ready: false,
          blocking: true,
          severity: "blocking",
          ownerRole: "技术/管理",
          requiredVariables: [
            "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST",
            "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND",
          ],
          configuredVariableCount: 0,
          totalVariableCount: 2,
          missingVariables: [
            "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST",
            "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND",
          ],
          placeholderVariableCount: 0,
          placeholderVariables: [],
          nextAction: "补齐 CUPS 队列 allowlist 和状态命令；命令路径只放安全 env 文件。",
        },
        {
          key: "v1-readiness-identity-env",
          label: "V1 readiness 验收账号环境变量",
          status: "warning",
          ready: false,
          blocking: false,
          severity: "warning",
          ownerRole: "技术/办公室",
          requiredVariables: [
            "ERP_V1_READINESS_API_BASE_URL or VITE_ERP_API_BASE_URL",
            "ERP_V1_READINESS_OPERATOR_ID",
            "ERP_V1_READINESS_DRIVER_OPERATOR_ID",
          ],
          configuredVariableCount: 0,
          totalVariableCount: 3,
          missingVariables: [
            "ERP_V1_READINESS_API_BASE_URL or VITE_ERP_API_BASE_URL",
            "ERP_V1_READINESS_OPERATOR_ID",
            "ERP_V1_READINESS_DRIVER_OPERATOR_ID",
          ],
          placeholderVariableCount: 0,
          placeholderVariables: [],
          nextAction: "补齐生产 API 地址和办公室 / 司机验收账号，避免使用脚本默认 seed 账号。",
        },
      ],
    },
    gates: [
      {
        key: "production_env_preflight",
        label: "生产环境变量预检",
        status: "blocked",
        ready: false,
        summary: "2/10 通过",
        detail: "生产环境变量仍有 6 项阻塞。",
      },
      {
        key: "field_evidence_manifest",
        label: "现场证据 manifest",
        status: "blocked",
        ready: false,
        summary: "V1 现场证据清单仍阻塞：证据 0/40，签字 0/6",
        detail: "现场证据 manifest 仍未填满，不能作为 V1 现场签字依据。",
      },
      {
        key: "runtime_readiness",
        label: "运行时 V1 readiness",
        status: "blocked",
        ready: false,
        summary: "5/11 通过",
        detail: "运行中 ERP API 仍有 6 项门禁阻塞。",
      },
      {
        key: "field_acceptance_package",
        label: "现场验收报告包",
        status: "blocked",
        ready: false,
        summary: "5/11 通过",
        detail: "现场验收 Markdown / JSON 报告已生成，但结论仍是 blocked。",
      },
    ],
    blockingItems: [
      {
        gate: "生产环境变量预检",
        label: "统一 V1 持久化 profile",
        status: "blocked",
        detail: "缺少 PostgreSQL 和对象存储配置。",
      },
      {
        gate: "现场证据 manifest",
        label: "生产持久化 / PostgreSQL 迁移已在生产库执行",
        status: "pending",
        detail: "required evidence item is not passed or accepted",
      },
    ],
    v1Scope: [
      "办公室六个核心页可用。",
      "V1 必须完成真实打印设备、真实 CUPS 队列、司机真机和现场 QA 证据。",
    ],
    v2Differences: ["企业微信自动发送、AI/OCR、路线优化和自动排产。"],
    files: {
      latestMarkdown: releaseMarkdownPath,
      latestJson: releaseJsonPath,
    },
  };
}

function buildBlockedTaskBoard() {
  return {
    scope: "v1_onsite_task_board",
    status: "blocked",
    ready: false,
    generatedAt: "2026-07-04T10:10:00.000+08:00",
    conclusion: "当前仍不能声明 V1 完成；请按角色任务清单补齐真实环境、真实设备、现场证据和负责人签字。",
    summary: {
      label: "V1 现场仍有 52 个待处理任务",
      taskCount: 52,
      releaseTaskCount: 11,
      evidenceTaskCount: 40,
      signoffTaskCount: 6,
      boundaryTaskCount: 1,
      roleCount: 6,
    },
    roleBuckets: [
      { role: "技术/管理", taskCount: 34, p0TaskCount: 34 },
      { role: "办公室", taskCount: 19, p0TaskCount: 19 },
      { role: "仓库/出库", taskCount: 19, p0TaskCount: 19 },
      { role: "车间", taskCount: 6, p0TaskCount: 6 },
      { role: "司机", taskCount: 8, p0TaskCount: 8 },
      { role: "财务", taskCount: 15, p0TaskCount: 15 },
    ],
    safeguards: {
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawReleaseSecretsExpected: false,
      nonMutating: true,
    },
  };
}

function buildBlockedCompletionSnapshot() {
  return {
    scope: "v1_completion_snapshot",
    status: "blocked",
    ready: false,
    generatedAt: "2026-07-04T10:20:00.000+08:00",
    conclusion: "当前不能声明 V1 已完成。",
    summary: {
      label: "V1 完成度快照：BLOCKED",
      requirements: "85-90%",
      p0Prototype: "97-98%",
      v1Readiness: "76-79%",
      releaseGate: "0/4 发布门禁通过",
      onsiteTaskCount: 52,
    },
    blockerGroups: [
      { gate: "生产环境变量预检", count: 5 },
      { gate: "现场证据 manifest", count: 41 },
      { gate: "运行时 V1 readiness", count: 6 },
    ],
    safeguards: {
      redactedOutput: true,
      rawSecretsIncluded: false,
    },
  };
}

function buildBlockedOwnerDecisionBrief() {
  return {
    scope: "v1_owner_decision_brief",
    status: "blocked_owner_brief_written",
    ready: false,
    canDeclareV1Complete: false,
    generatedAt: "2026-07-04T10:25:00.000+08:00",
    conclusion: "当前不能宣布 V1 完成；代码侧接近收口，但现场证据仍未闭环。",
    decision: {
      label: "不能宣布 V1 已完成",
      recommendation: "先补齐生产环境、现场证据、真实设备 / 真机验收和负责人签字。",
      ownerQuestion: "是否继续按阻塞清单补齐后再评审？",
    },
    completion: {
      requirements: "85-90%",
      p0Prototype: "97-98%",
      v1Readiness: "76-79%",
      releaseGate: "0/4 发布门禁通过",
      runtimeReadiness: "5/11 通过",
      fieldEvidence: "V1 现场证据清单仍阻塞：证据 0/40，签字 0/6",
      fieldAcceptance: "5/11 通过",
      onsiteTaskCount: 52,
    },
    unfinishedItems: [
      {
        type: "completion-proof",
        label: "V1 完成声明",
        detail: "至少一个发布或现场验收门禁仍未通过。",
      },
    ],
    v2Differences: ["企业微信自动发送和 AI/OCR 进入 V2。"],
    safeguards: {
      redactedOutput: true,
      rawSecretsIncluded: false,
    },
  };
}

function buildBlockedV1V2ScopeBrief() {
  return {
    scope: "v1_v2_scope_brief",
    status: "blocked_scope_brief_written",
    ready: false,
    canDeclareV1Complete: false,
    generatedAt: "2026-07-04T10:27:00.000+08:00",
    conclusion: "V1/V2 边界已整理，但 V1 仍未完成；不得把生产配置、真实设备、现场证据或签字后移到 V2。",
    summary: {
      moduleDifferenceCount: 11,
      v2DifferenceCount: 17,
      v2CategoryCount: 2,
      v1MustContinueCount: 6,
      p0Prototype: "97-98%",
      v1Readiness: "76-79%",
      releaseGate: "0/4 发布门禁通过",
      fieldEvidence: "V1 现场证据清单仍阻塞：证据 0/40，签字 0/6",
    },
    v2Categories: ["企微 / 客户自动化", "AI / OCR / 图片识别"],
    v1MustContinue: ["真实生产配置和现场证据必须在 V1 完成。"],
    v2Differences: ["企业微信自动发送。", "AI / OCR 识别图片订单。"],
    ownerReview: {
      question: "是否确认这些 V2 项不阻塞 V1，但 V1 必须继续补齐真实生产和现场验收？",
      recommendation: "先按 V1 必须继续补的清单处理阻塞，再复核 V2 延后项。",
      approvalRule:
        "V2 差异只说明延后增强项；release candidate、现场证据、负责人签字和 V1/V2 边界确认缺一项都不能宣布 V1 完成。",
    },
    safeguards: {
      redactedOutput: true,
      rawSecretsIncluded: false,
    },
  };
}

function buildBlockedProductionGoLiveStageChecklist() {
  return {
    status: "blocked",
    ready: false,
    generatedAt: "2026-07-04T10:28:00.000+08:00",
    source: "release_candidate_snapshot",
    summary: {
      label: "1/4 通过",
      passedCount: 1,
      totalCount: 4,
      blockingCount: 3,
      firstBlockedStage: "生产 env 变量预检",
    },
    stages: [
      {
        key: "production-env-file-audit",
        label: "生产 env 文件安全审计",
        stageOrder: 1,
        status: "passed",
        ready: true,
        sourceStatus: "passed",
        sourceSummary: "1 个 env 文件安全审计通过",
        ownerRole: "技术/管理",
        blockingCount: 0,
        nextAction: "保留 env 文件安全审计结果，继续执行生产 env 变量预检。",
        verificationSteps: ["node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file> --json"],
        evidenceToKeep: ["env 文件安全审计 JSON / Markdown 结果"],
      },
      {
        key: "production-env-preflight",
        label: "生产 env 变量预检",
        stageOrder: 2,
        status: "pending",
        ready: false,
        sourceStatus: "blocked",
        sourceSummary: "2/10 通过",
        ownerRole: "技术/管理",
        blockingCount: 2,
        nextAction: "先处理统一 V1 持久化 profile：补齐 PostgreSQL 和 object_storage。",
        verificationSteps: ["node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file --json"],
        evidenceToKeep: ["生产 env 变量预检 JSON / Markdown 结果"],
      },
      {
        key: "runtime-v1-readiness",
        label: "当前 API V1 总门禁",
        stageOrder: 3,
        status: "pending",
        ready: false,
        sourceStatus: "blocked",
        sourceSummary: "5/11 通过",
        ownerRole: "技术/管理 + 现场负责人",
        blockingCount: 1,
        nextAction: "补齐持久化、附件、打印、CUPS、司机真机和现场验收门禁。",
        verificationSteps: [
          "node scripts/run-v1-readiness-check.mjs --api-base-url <erp-api> --operator-id <office-user> --driver-operator-id <driver-user> --json",
        ],
        evidenceToKeep: ["V1 readiness JSON / Markdown 结果"],
      },
      {
        key: "runtime-production-profile",
        label: "当前 API 生产 profile 确认",
        stageOrder: 4,
        status: "pending",
        ready: false,
        sourceStatus: "live_precheck_required",
        sourceSummary: "release-candidate 不足以证明当前 API 运行在生产 profile，必须现场执行组合预检。",
        ownerRole: "技术/管理",
        blockingCount: 1,
        nextAction: "用真实生产 env 启动当前 API 后，运行生产上线组合预检。",
        verificationSteps: [
          "node scripts/run-v1-production-go-live-precheck.mjs --use-production-env-setup-env-file --api-base-url <erp-api> --json",
        ],
        evidenceToKeep: ["生产上线组合预检 JSON / Markdown 结果"],
      },
    ],
    safeguards: {
      nonMutating: true,
      releaseCandidateSnapshotOnly: true,
      livePrecheckRequired: true,
      envValuesExposed: false,
    },
  };
}

function buildProductionEnvSetup() {
  return {
    scope: "v1_production_env_setup",
    status: "prepared",
    ready: false,
    setupReady: true,
    checkedAt: "2026-07-04T10:29:00.000+08:00",
    summary: {
      label: "安全 env 文件已准备，仍需填真实生产值",
      generated: true,
      overwritten: false,
      auditReady: true,
      envPreflightPassedCount: 2,
      envPreflightTotalCount: 10,
      remainingFixItemCount: 6,
    },
    envFile: {
      path: ".erp-local-storage/v1-production-env/secure-prod.env",
      insideWorkspace: true,
      gitIgnored: true,
      gitTracked: false,
      existedBefore: false,
      generated: true,
      overwritten: false,
      fileMode: "600",
      assignmentCount: 30,
      placeholderAssignmentCount: 0,
    },
    audit: {
      status: "passed",
      ready: true,
      summary: {
        label: "1 个 env 文件安全审计通过",
      },
    },
    envPreflight: {
      status: "blocked",
      ready: false,
      passedCount: 2,
      totalCount: 10,
      blockingCount: 6,
      warningCount: 2,
      remainingFixItems: [
        {
          key: "v1-persistence-profile",
          label: "统一 V1 持久化 profile",
          ownerRole: "技术/管理",
          status: "blocking",
          missingVariables: ["ERP_V1_DATABASE_URL"],
          placeholderVariables: [],
          nextAction: "填入真实 PostgreSQL 连接并重跑 env 预检。",
        },
        {
          key: "postgres-restore-validation-env",
          label: "PostgreSQL 恢复验证库环境变量",
          ownerRole: "技术/管理",
          status: "blocking",
          missingVariables: ["ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL", "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false"],
          placeholderVariables: [],
          nextAction: "填入专用恢复验证库连接，并确认恢复重置授权开关已显式配置。",
        },
        {
          key: "attachment-object-storage-env",
          label: "附件对象存储环境变量",
          ownerRole: "技术/管理",
          status: "blocking",
          missingVariables: ["ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT", "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET"],
          placeholderVariables: [],
          nextAction: "填入真实对象存储 endpoint / bucket / key 后重跑对象存储 live 预检。",
        },
      ],
    },
    setupFindings: [
      {
        key: "secure-target",
        label: "安全 env 文件路径",
        status: "passed",
        detail: "目标文件位于 git 忽略路径，权限已收窄为 0600。",
      },
    ],
    commands: [
      {
        key: "next-preflight",
        label: "重跑生产 env 变量预检",
        command: "node -- scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file --json",
      },
    ],
    nextActions: [
      "把真实 PostgreSQL、对象存储、打印、CUPS、token 和现场 manifest 路径填入安全 env 文件。",
      "重跑 env 文件安全审计、生产 env 变量预检和生产环境 / 持久化第一阶段执行器。",
    ],
    safeguards: {
      envValuesExposed: false,
      databaseUrlExposed: false,
      objectStorageSecretExposed: false,
      commandValueExposed: false,
      realEnvFileCopied: false,
    },
  };
}

function buildProductionEnvIntakeVerification() {
  const minimumBlockingItems = buildProductionEnvMinimumBlockingItemsFixture();
  return {
    scope: "v1_production_env_real_value_intake_verification",
    status: "blocked",
    ready: false,
    checkedAt: "2026-07-04T10:35:00.000+08:00",
    summary: {
      label: "11 项真实值 intake / env 校验阻塞",
      envFileCount: 1,
      envFilePathIncluded: false,
      intakeCsvPathIncluded: false,
      intakeRowCount: 22,
      configuredRowCount: 0,
      missingRowCount: 22,
      minimumBlockingTargetCount: 11,
      minimumBlockingSatisfiedCount: 0,
      minimumBlockingMissingCount: 11,
      minimumBlockingVariableRowCount: 10,
      minimumBlockingAlternativeGroupCount: 1,
      minimumBlockingTargetSignature,
      minimumBlockingLabel: "0/11",
      minimumBlockingItemCount: minimumBlockingItems.length,
      minimumWarningTargetCount: 8,
      minimumWarningSatisfiedCount: 0,
      minimumWarningMissingCount: 8,
      minimumWarningVariableRowCount: 7,
      minimumWarningAlternativeGroupCount: 1,
      minimumWarningLabel: "0/8",
      alternativeGroupCount: 2,
      alternativeGroupBlockingCount: 1,
      alternativeGroupWarningCount: 1,
      passedRowCount: 0,
      blockingCount: 11,
      warningCount: 8,
      auditReady: true,
      intakeCsvReady: true,
    },
    alternativeGroups: [
      {
        type: "alternative_group",
        key: "alternative-group:ERP_V1_DATABASE_URL / DATABASE_URL / PGURL",
        label: "任选其一变量组",
        alternativeGroup: "ERP_V1_DATABASE_URL / DATABASE_URL / PGURL",
        variables: ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"],
        configuredKeyCount: 0,
        severity: "blocking",
        status: "blocked",
        detail: "任选其一变量组没有任何已配置变量。",
        nextAction: "任选其一，优先使用 ERP_V1_DATABASE_URL。",
      },
    ],
    minimumBlockingItems,
    blockingFindings: [
      {
        type: "alternative_group",
        label: "任选其一变量组",
        alternativeGroup: "ERP_V1_DATABASE_URL / DATABASE_URL / PGURL",
        variables: ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"],
        configuredKeyCount: 0,
        severity: "blocking",
        status: "blocked",
        detail: "任选其一变量组没有任何已配置变量。",
        nextAction: "任选其一，优先使用 ERP_V1_DATABASE_URL。",
      },
      {
        type: "variable_row",
        itemKey: "attachment-object-storage-env",
        label: "附件对象存储环境变量",
        ownerRole: "技术/管理",
        severity: "blocking",
        status: "blocked",
        variableKey: "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT",
        sourceSystem: "附件对象存储 bucket",
        expectedValueType: "http/https URL",
        configured: false,
        filledMarked: false,
        verifiedMarked: false,
        evidenceRefProvided: false,
        rawEvidenceRefIncluded: false,
        detail: "必填变量尚未在安全 env 文件中配置。",
        nextAction: "补齐附件对象存储 endpoint、bucket、access key 和 secret key。",
      },
    ],
    warningFindings: [
      {
        type: "variable_row",
        itemKey: "v1-readiness-identity-env",
        label: "V1 readiness 验收账号环境变量",
        ownerRole: "技术/办公室",
        severity: "warning",
        status: "warning",
        variableKey: "ERP_V1_READINESS_OPERATOR_ID",
        sourceSystem: "生产 API / 办公室与司机验收账号",
        expectedValueType: "生产账号 ID",
        configured: false,
        filledMarked: false,
        verifiedMarked: false,
        evidenceRefProvided: false,
        rawEvidenceRefIncluded: false,
        detail: "建议变量尚未在安全 env 文件中配置。",
        nextAction: "补齐生产 API 地址和办公室 / 司机验收账号。",
      },
    ],
    nextActions: ["先补齐真实 PostgreSQL、对象存储、打印 command_bridge 和 CUPS 变量。"],
    safeguards: {
      envFilePathIncluded: false,
      intakeCsvPathIncluded: false,
      envValuesIncluded: false,
      secretValuesIncluded: false,
      connectionStringValuesIncluded: false,
      rawEvidenceRefsIncluded: false,
    },
  };
}

function buildProductionEnvMinimumBlockingItemsFixture() {
  const variableRows = [
    {
      itemKey: "postgres-restore-validation-env",
      label: "PostgreSQL 恢复验证库环境变量",
      variableKey: "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL",
      sourceSystem: "PostgreSQL 恢复验证库",
      expectedValueType: "PostgreSQL 连接串",
      nextAction: "补齐专用恢复验证库连接串，确认不是生产源库。",
    },
    {
      itemKey: "attachment-object-storage-endpoint",
      label: "附件对象存储 endpoint",
      variableKey: "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT",
      sourceSystem: "附件对象存储 bucket",
      expectedValueType: "http/https URL",
      nextAction: "补齐附件对象存储 endpoint。",
    },
    {
      itemKey: "attachment-object-storage-bucket",
      label: "附件对象存储 bucket",
      variableKey: "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET",
      sourceSystem: "附件对象存储 bucket",
      expectedValueType: "bucket 名称",
      nextAction: "补齐附件对象存储 bucket。",
    },
    {
      itemKey: "attachment-object-storage-access-key",
      label: "附件对象存储 access key",
      variableKey: "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID",
      sourceSystem: "附件对象存储 bucket",
      expectedValueType: "访问密钥 ID",
      nextAction: "补齐附件对象存储 access key。",
    },
    {
      itemKey: "attachment-object-storage-secret",
      label: "附件对象存储 secret",
      variableKey: "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
      sourceSystem: "附件对象存储 bucket",
      expectedValueType: "密钥 / token",
      nextAction: "补齐附件对象存储 secret。",
    },
    {
      itemKey: "print-command-bridge-command",
      label: "打印 command bridge 命令",
      variableKey: "ERP_SYSTEM_PRINTER_COMMAND",
      sourceSystem: "打印主机",
      expectedValueType: "命令路径",
      nextAction: "补齐打印 command bridge 命令。",
    },
    {
      itemKey: "print-command-bridge-allowlist",
      label: "打印 command bridge allowlist",
      variableKey: "ERP_SYSTEM_PRINTER_ALLOWLIST",
      sourceSystem: "打印主机",
      expectedValueType: "打印机 ID 列表",
      nextAction: "补齐允许提交的系统打印机 ID。",
    },
    {
      itemKey: "print-command-bridge-spool-dir",
      label: "打印 command bridge spool 目录",
      variableKey: "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR",
      sourceSystem: "打印主机",
      expectedValueType: "spool 目录",
      nextAction: "补齐打印 spool 目录。",
    },
    {
      itemKey: "cups-allowlist",
      label: "CUPS 队列 allowlist",
      variableKey: "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST",
      sourceSystem: "CUPS / 打印主机",
      expectedValueType: "CUPS 队列列表",
      nextAction: "补齐 CUPS 队列 allowlist。",
    },
    {
      itemKey: "cups-status-command",
      label: "CUPS 状态命令",
      variableKey: "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND",
      sourceSystem: "CUPS / 打印主机",
      expectedValueType: "状态命令路径",
      nextAction: "补齐 CUPS 状态命令。",
    },
  ];
  return [
    {
      type: "alternative_group",
      key: "alternative-group:ERP_V1_DATABASE_URL / DATABASE_URL / PGURL",
      label: "PostgreSQL 生产库任选组",
      ownerRole: "技术/管理",
      severity: "blocking",
      status: "blocked",
      alternativeGroup: "ERP_V1_DATABASE_URL / DATABASE_URL / PGURL",
      variables: ["ERP_V1_DATABASE_URL", "DATABASE_URL", "PGURL"],
      configuredKeyCount: 0,
      sourceSystem: "PostgreSQL 生产库",
      expectedValueType: "PostgreSQL 连接串",
      detail: "任选其一变量组没有任何已配置变量。",
      nextAction: "任选其一，优先使用 ERP_V1_DATABASE_URL。",
    },
    ...variableRows.map((row) => ({
      type: "variable_row",
      ownerRole: "技术/管理",
      severity: "blocking",
      status: "blocked",
      configured: false,
      filledMarked: false,
      verifiedMarked: false,
      evidenceRefProvided: false,
      rawEvidenceRefIncluded: false,
      detail: "必填变量尚未在安全 env 文件中配置。",
      ...row,
    })),
  ];
}

function buildBlockedProductionFirstStageExecution() {
  return {
    scope: "v1_production_first_stage_execution",
    status: "blocked",
    ready: false,
    checkedAt: recentProductionValuesDryRunCheckedAt,
    summary: {
      label: "2/7 步骤通过，仍有阻塞",
      passedCount: 2,
      plannedCount: 0,
      totalCount: 7,
      blockingCount: 1,
      errorCount: 0,
      productionEnvValuesDryRunCoverage: {
        included: true,
        stageStatus: "passed",
        targetWouldBeWritten: false,
        envPreflightReady: true,
        envPreflightPassedCount: 10,
        envPreflightTotalCount: 10,
        envPreflightBlockingCount: 0,
        intakeConfiguredRowCount: 15,
        intakeRowCount: 22,
        intakeMissingRequiredVariableCount: 0,
        intakeAlternativeGroupBlockingCount: 0,
        minimumBlockingReady: true,
        minimumBlockingSatisfiedCount: 11,
        minimumBlockingTargetCount: 11,
        minimumBlockingMissingCount: 0,
        minimumBlockingTargetSignature,
        minimumBlockingVariableRowCount: 10,
        minimumBlockingAlternativeGroupCount: 1,
        minimumWarningReady: false,
        minimumWarningSatisfiedCount: 0,
        minimumWarningTargetCount: 8,
        minimumWarningMissingCount: 8,
      },
    },
    execution: {
      envFileCount: 1,
      actualEnvFilePathsIncluded: false,
      planOnly: false,
      applyMigrations: false,
      migrationApplyRequiresExplicitFlag: true,
      outputDirIncluded: false,
    },
    stages: [
      {
        key: "env-file-audit",
        label: "生产 env 文件安全审计",
        status: "passed",
        detail: "真实生产 env 文件未被 git 跟踪、不是模板文件且没有未替换占位符。",
        command: "node -- scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file> --json",
        evidence: {
          actualCommandArgsIncluded: false,
          envFilePathIncluded: false,
          reportParsed: true,
          reportStatus: "passed",
          reportReady: true,
          summaryLabel: "1 个 env 文件安全审计通过",
          passedCount: 1,
          totalCount: 1,
          blockingCount: 0,
          scope: "v1_production_env_file_audit",
        },
        nextActions: [],
      },
      {
        key: "production-env-preflight",
        label: "生产 env 变量预检",
        status: "passed",
        detail: "生产 PostgreSQL、对象存储、打印和 readiness 所需变量已通过预检。",
        command: "node -- scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file --json",
        evidence: {
          actualCommandArgsIncluded: false,
          envFilePathIncluded: false,
          reportParsed: true,
          reportStatus: "ready",
          reportReady: true,
          summaryLabel: "10/10 通过",
          passedCount: 10,
          totalCount: 10,
          blockingCount: 0,
          scope: "v1_production_env_preflight",
        },
        nextActions: [],
      },
      {
        key: "db-migrations-dry-run",
        label: "数据库迁移计划 dry-run",
        status: "blocked",
        detail: "生产 PostgreSQL 迁移 dry-run 未通过：schema_migrations 表缺失。",
        command: "node -- scripts/run-db-migrations.mjs --env-file <secure-env-file> --dry-run --psql-command <psql-command>",
        evidence: {
          actualCommandArgsIncluded: false,
          envFilePathIncluded: false,
          reportParsed: false,
          exitCode: 2,
        },
        nextActions: ["确认备份窗口后，用 --apply-migrations 重新运行第一阶段执行器。"],
      },
    ],
    blockingStages: [
      {
        key: "db-migrations-dry-run",
        label: "数据库迁移计划 dry-run",
        status: "blocked",
        detail: "生产 PostgreSQL 迁移 dry-run 未通过：schema_migrations 表缺失。",
      },
    ],
    safeguards: {
      envValuesExposed: false,
      databaseUrlExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      objectKeyExposed: false,
      signedUrlExposed: false,
      physicalPrinterCalled: false,
      businessDataMutated: false,
      schemaMigrationApplyExecuted: false,
      declaresFullV1Complete: false,
    },
    nextActions: [
      "先处理 数据库迁移计划 dry-run 的阻塞，处理后重新运行第一阶段执行器。",
      "如果 PostgreSQL 预检显示迁移缺失，先确认备份窗口，再用 --apply-migrations 重新运行。",
    ],
  };
}

function buildBlockedProductionFirstStageExecutionWithoutDryRunCoverage() {
  const report = buildBlockedProductionFirstStageExecution();
  delete report.summary.productionEnvValuesDryRunCoverage;
  return report;
}

function buildFirstStageEvidenceSuggestions() {
  return {
    scope: "v1_production_first_stage_evidence_suggestions",
    status: "review_required",
    ready: false,
    generatedAt: "2026-07-08T10:00:00.000Z",
    conclusion: "已生成第一阶段现场证据回填建议；该结果必须经现场负责人复核后再应用，不能替代真实现场证据、签字或 V1/V2 边界确认。",
    summary: {
      label: "7 项可建议自动接受，2 项只有部分自动化支撑，1 项仍需人工证据",
      sourceEvidenceRows: 40,
      firstStageEvidenceRows: 10,
      autoAcceptedSuggestionCount: 7,
      partialSuggestionCount: 2,
      manualOnlyCount: 1,
      preservedExistingCount: 0,
      firstStageManualReviewStillRequired: true,
      persistenceEvidenceReady: true,
      runtimeSmokeReady: true,
      firstStageCloseoutAutoReportsReady: true,
      suggestedCsvAppliesOnlyDraft: true,
    },
    sourceReports: {
      persistenceEvidence: {
        included: true,
        expectedScope: "v1_production_persistence_evidence",
        scope: "v1_production_persistence_evidence",
        status: "ready",
        ready: true,
        label: "8/8 阶段通过",
        rawReportIncluded: false,
      },
      runtimeSmoke: {
        included: true,
        expectedScope: "v1_production_runtime_smoke",
        scope: "v1_production_runtime_smoke",
        status: "ready",
        ready: true,
        label: "4/4 通过",
        rawReportIncluded: false,
      },
    },
    suggestions: [
      {
        groupKey: "production_persistence",
        itemKey: "postgres_migration_applied",
        itemLabel: "PostgreSQL 迁移已在生产库执行",
        coverage: "auto_covered",
        status: "accepted",
        evidenceRefSuggested: true,
        noteSuggested: true,
      },
      {
        groupKey: "object_storage",
        itemKey: "attachment_access_audit_checked",
        itemLabel: "附件访问审计已写入并可查询",
        coverage: "manual_only",
        status: "unchanged",
        evidenceRefSuggested: false,
        noteSuggested: true,
      },
    ],
    nextActions: [
      "现场负责人复核 suggested-evidence-items.csv，确认无误后用 apply-v1-field-evidence-intake 生成 draft manifest。",
      "继续人工补齐备份策略负责人、bucket 备份策略 / 控制台证据和附件访问审计证据。",
      "回填后重新运行 first-stage closeout；不要把本建议报告当作负责人签字或 V1 完成证明。",
    ],
    safeguards: {
      sourceCsvMutated: false,
      sourceReportsMutated: false,
      sourceManifestMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      productionEnvMutated: false,
      suggestionsRequireHumanReview: true,
      declaresFullV1Complete: false,
      rawSourceReportsIncluded: false,
      rawEvidenceRefsFromSourceIncluded: false,
      rawSecretsIncluded: false,
    },
  };
}

function buildProductionPersistenceEvidence() {
  const stages = [
    { key: "production-env-file-audit", label: "生产 env 文件安全审计", status: "passed", ready: true, summary: { label: "安全 env 文件通过" } },
    { key: "production-persistence-env-subset", label: "生产持久化 env 子集", status: "blocked", ready: false, summary: { label: "2/5 通过" }, nextActions: ["补齐 ERP_V1_DATABASE_URL。"] },
    { key: "db-migration-plan", label: "数据库迁移计划可读", status: "passed", ready: true, summary: { label: "迁移计划可读" } },
    { key: "production-postgres-preflight", label: "生产 PostgreSQL 结构 / 权限 live 预检", status: "blocked", ready: false, summary: { label: "缺 PostgreSQL 真实值" }, nextActions: ["把真实 PostgreSQL 连接串写入安全 env。"] },
    { key: "production-postgres-backup-restore-check", label: "生产 PostgreSQL 备份 / 恢复抽样验证", status: "blocked", ready: false, summary: { label: "缺恢复验证库" }, nextActions: ["配置专用恢复验证库并显式授权恢复重置。"] },
    { key: "production-object-storage-preflight", label: "生产对象存储 live 预检", status: "blocked", ready: false, summary: { label: "缺附件对象存储真实值" }, nextActions: ["补齐附件对象存储 endpoint / bucket / key。"] },
    { key: "production-object-storage-governance-check", label: "生产对象存储 bucket 治理检查", status: "blocked", ready: false, summary: { label: "缺 bucket 治理读回" }, nextActions: ["补齐对象存储后读取版本控制、生命周期和加密。"] },
    { key: "persistence-evidence-redaction-safeguard", label: "生产持久化留证脱敏护栏", status: "passed", ready: true, summary: { label: "脱敏护栏通过" } },
  ];
  return {
    scope: "v1_production_persistence_evidence",
    status: "blocked",
    ready: false,
    checkedAt: "2026-07-08T10:10:00.000Z",
    summary: {
      label: "3/8 阶段通过",
      passedCount: 3,
      totalCount: 8,
      blockingCount: 5,
      warningCount: 2,
      postgresReady: false,
      postgresBackupRestoreReady: false,
      objectStorageReady: false,
      objectStorageGovernanceReady: false,
      persistenceEnvReady: false,
      envFileSource: "production_env_setup",
      envFileSourceLabel: "已复用生产 env setup 报告中的安全 env 文件",
      envFileFromProductionSetup: true,
    },
    stages,
    blockingStages: stages.filter((stage) => stage.status !== "passed"),
    safeguards: {
      nonMutatingBusinessData: true,
      migrationApplyExecuted: false,
      postgresTempTableWriteProbeRolledBack: true,
      postgresBackupRestoreSourceDatabaseMutated: false,
      postgresBackupRestoreRestoreDatabaseMutated: false,
      postgresBackupRestoreResetExplicitlyAllowed: false,
      postgresBackupRestoreDumpFilesRemoved: true,
      objectStorageDiagnosticObjectsDeleted: true,
      objectStorageGovernanceWritesObjects: false,
      objectStorageGovernanceReadsBucketMetadata: true,
      envValuesExposed: false,
      databaseUrlExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      objectStorageKeyPrefixExposed: false,
      secretFieldsExposed: false,
      objectKeyExposed: false,
      signedUrlExposed: false,
      rawBucketPolicyExposed: false,
      payloadExposed: false,
      envFilePathAcceptedFromRequest: false,
      envFilePathExposed: false,
      envFileReadFromProductionSetup: true,
    },
    nextActions: [
      "生产持久化 env 子集：缺少 ERP_V1_DATABASE_URL or DATABASE_URL。",
      "生产 PostgreSQL 结构 / 权限 live 预检：把真实 PostgreSQL 连接串写入安全 env 后重跑。",
      "生产对象存储 live 预检：补齐附件对象存储配置后重跑。",
    ],
  };
}

function buildProductionRuntimeSmoke() {
  const stages = [
    { key: "production-env-file-audit", label: "生产 env 文件安全审计", status: "passed", ready: true, summary: { label: "安全 env 文件通过" } },
    { key: "production-persistence-env-subset", label: "生产持久化 env 子集", status: "blocked", ready: false, summary: { label: "2/4 通过" }, nextActions: ["补齐 PostgreSQL / 对象存储运行态 env。"] },
    { key: "api-runtime-startup", label: "生产 API 运行态启动 / 探测", status: "passed", ready: true, summary: { label: "长驻 API 可读" } },
    { key: "runtime-production-profile", label: "运行态生产 profile 确认", status: "blocked", ready: false, summary: { label: "4/6 通过" }, nextActions: ["确认长驻 API 已应用生产 env 并进入 PostgreSQL / 对象存储 profile。"] },
  ];
  return {
    scope: "v1_production_runtime_smoke",
    status: "blocked",
    ready: false,
    checkedAt: "2026-07-08T10:20:00.000Z",
    summary: {
      label: "2/4 通过",
      passedCount: 2,
      totalCount: 4,
      blockingCount: 2,
      warningCount: 0,
    },
    runtime: {
      runtimeMode: "external_service",
      externalApiProbed: true,
      productionEnvFileApplication: { applied: false },
      repositoryProfile: { repositoryProfile: "local" },
      storageProfile: {
        attachmentObjectStorageKind: "local_file",
        statementExportObjectStorageKind: "local_file",
      },
      systemReadiness: {
        status: "blocked",
        summaryLabel: "9/11 通过",
      },
    },
    stages,
    blockingStages: stages.filter((stage) => stage.status !== "passed"),
    safeguards: {
      readOnlyHttpProbesOnly: true,
      apiProcessSpawned: false,
      apiProcessTerminated: false,
      externalApiProbed: true,
      migrationApplyExecuted: false,
      businessDataMutated: false,
      physicalPrinterCalled: false,
      envValuesExposed: false,
      productionEnvAppliedToProcess: false,
      databaseUrlExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
    },
    nextActions: ["补齐真实生产 env 并重启长驻 API 后，重新运行 runtime smoke。"],
  };
}

function buildTodoLoadPrecheck() {
  return {
    scope: "v1_todo_load_precheck",
    status: "ready",
    ready: true,
    checkedAt: "2026-07-08T10:25:00.000Z",
    target: {
      protocol: "https",
      loopback: false,
      apiPathValidated: true,
      embeddedCredentials: false,
      addressExposed: false,
    },
    config: {
      requestCount: 100,
      concurrency: 10,
      maxP95Ms: 1000,
      maxErrorRate: 0,
    },
    authentication: {
      formalRuntimeSession: true,
      serverVerified: true,
      sessionType: "runtime",
      identityExposed: false,
    },
    summary: {
      label: "5/5 通过",
      requestCount: 100,
      successCount: 100,
      errorCount: 0,
      errorRate: 0,
      throughputPerSecond: 125,
      latencyMs: { p50: 120, p95: 240, max: 320 },
      snapshotChanged: false,
    },
    stages: [],
    blockingStages: [],
    warnings: [],
    safeguards: {
      explicitReadLoadConfirmation: true,
      businessReadOnly: true,
      businessDataMutated: false,
      requestCountBounded: true,
      concurrencyBounded: true,
      responsePayloadStored: false,
      todoIdentityStored: false,
      credentialsExposed: false,
      apiAddressExposed: false,
      physicalPrinterCalled: false,
    },
    responsePayload: "SENSITIVE_TODO_LOAD_PAYLOAD",
    diagnosticNoise: "SENSITIVE_TODO_LOAD_PAYLOAD",
  };
}

function buildPrintChainCloseout() {
  return {
    scope: "v1_print_chain_closeout",
    status: "ready",
    ready: true,
    checkedAt: "2026-07-04T10:40:00.000+08:00",
    summary: {
      label: "8/8 通过",
      passedCount: 8,
      totalCount: 8,
      blockingCount: 0,
    },
    stages: [
      {
        key: "label-printer-output",
        label: "标签机真实出纸",
        status: "passed",
        ready: true,
        detail: "标签机、CUPS 队列、预览和扫码留证均已归档。",
        summary: { label: "4/4 通过" },
        nextAction: "保留打印链路 closeout，进入司机真机验证。",
      },
      {
        key: "dot-matrix-alignment",
        label: "针式机纸张对位",
        status: "passed",
        ready: true,
        detail: "针式机出纸、联单对位、模板预览和废纸留证均已归档。",
        summary: { label: "4/4 通过" },
        nextAction: "保留纸张对位照片和模板编号。",
      },
    ],
    blockingStages: [],
    safeguards: {
      envValuesExposed: false,
      queueNamesExposed: false,
      spoolPathExposed: false,
      rawPrinterCommandIncluded: false,
      declaresFullV1Complete: false,
    },
    nextActions: ["打印链路 closeout 已可交负责人复核，但仍不能单独宣布 V1 完成。"],
  };
}

function buildPrintChainExecution() {
  return {
    scope: "v1_print_chain_execution",
    status: "blocked",
    ready: false,
    checkedAt: "2026-07-04T10:42:00.000+08:00",
    summary: {
      label: "2/3 步骤通过，仍有阻塞",
      passedCount: 2,
      plannedCount: 0,
      totalCount: 3,
      blockingCount: 1,
      errorCount: 0,
    },
    execution: {
      apiBaseUrl: "http://127.0.0.1:8787/api",
      operatorId: "U-OFFICE-A",
      planOnly: false,
      fieldEvidenceManifestIncluded: false,
      actualArtifactPathsIncluded: false,
      standaloneCupsPreflightRequired: true,
      closeoutCoversOnlyPrintStage: true,
      outputDirIncluded: false,
    },
    stages: [
      {
        key: "standalone-cups-queue-preflight",
        label: "真实 CUPS 队列 non-printing 预检",
        status: "passed",
        detail: "真实打印机器可读取 CUPS 队列状态，且未提交打印作业。",
        command:
          "node -- scripts/run-cups-queue-preflight.mjs --cups-printer epson_lq_615kii_notes --status-command <cups-status-command> --json",
        exitCode: 0,
        evidence: {
          actualCommandArgsIncluded: false,
          rawArtifactPathIncluded: false,
          reportParsed: true,
          reportStatus: "ready",
          reportReady: true,
          summaryLabel: "CUPS 队列 ready",
          passedCount: 4,
          totalCount: 4,
          blockingCount: 0,
          scope: "v1_cups_queue_preflight",
          cupsPrinterConfigured: true,
          cupsPrinterAllowed: true,
          cupsStatusCommandRunnable: true,
          nonPrinting: true,
          physicalPrinterCalled: false,
          printFileCreated: false,
          rawStdoutIncluded: false,
          rawStderrIncluded: false,
        },
        nextActions: [],
      },
      {
        key: "print-v1-readiness",
        label: "运行中 API 打印门禁",
        status: "passed",
        detail: "运行中 API 的打印 V1 readiness 已 ready。",
        command: "node -- scripts/run-print-v1-readiness-check.mjs --api-base-url http://127.0.0.1:8787/api --operator-id U-OFFICE-A --json",
        exitCode: 0,
        evidence: {
          actualCommandArgsIncluded: false,
          rawArtifactPathIncluded: false,
          reportParsed: true,
          reportStatus: "ready",
          reportReady: true,
          summaryLabel: "9/9 通过",
          passedCount: 9,
          totalCount: 9,
          blockingCount: 0,
          scope: "print_v1_readiness",
          cupsReady: true,
          cupsPrinterConfigured: true,
          cupsStatusCommandRunnable: true,
          blockingCriteriaCount: 0,
          rawReadinessReportIncluded: false,
        },
        nextActions: [],
      },
      {
        key: "print-chain-closeout",
        label: "打印阶段负责人 closeout",
        status: "blocked",
        detail: "6/8 通过，仍缺纸张对位和扫码证据",
        command:
          "node -- scripts/run-v1-print-chain-closeout.mjs --print-readiness-json <print-readiness-latest-json> --field-evidence-manifest <filled-field-evidence-manifest> --json",
        exitCode: 2,
        evidence: {
          actualCommandArgsIncluded: false,
          rawArtifactPathIncluded: false,
          reportParsed: true,
          reportStatus: "blocked",
          reportReady: false,
          summaryLabel: "6/8 通过，仍缺纸张对位和扫码证据",
          passedCount: 6,
          totalCount: 8,
          blockingCount: 1,
          scope: "v1_print_chain_closeout",
          printHardwareEvidenceStatus: "blocked",
          printHardwareEvidenceCompleted: 5,
          printHardwareEvidenceRequired: 7,
          rawEvidenceRefsIncluded: false,
        },
        nextActions: ["补真实出纸、纸张对位和条码扫码证据。"],
      },
    ],
    blockingStages: [
      {
        key: "print-chain-closeout",
        label: "打印阶段负责人 closeout",
        status: "blocked",
        detail: "6/8 通过，仍缺纸张对位和扫码证据",
        command:
          "node -- scripts/run-v1-print-chain-closeout.mjs --print-readiness-json <print-readiness-latest-json> --field-evidence-manifest <filled-field-evidence-manifest> --json",
        exitCode: 2,
        evidence: {
          reportParsed: true,
          reportStatus: "blocked",
          reportReady: false,
          summaryLabel: "6/8 通过，仍缺纸张对位和扫码证据",
          passedCount: 6,
          totalCount: 8,
          blockingCount: 1,
          scope: "v1_print_chain_closeout",
          printHardwareEvidenceStatus: "blocked",
          printHardwareEvidenceCompleted: 5,
          printHardwareEvidenceRequired: 7,
          rawEvidenceRefsIncluded: false,
        },
        nextActions: ["补真实出纸、纸张对位和条码扫码证据。"],
      },
    ],
    safeguards: {
      nonMutating: true,
      businessDataMutated: false,
      physicalPrinterCalledByExecution: false,
      cupsSubmitCalledByExecution: false,
      apiCalledOnlyForReadiness: true,
      fieldEvidenceManifestMutated: false,
      commandValueExposed: false,
      stdoutExposed: false,
      stderrExposed: false,
      spoolPathExposed: false,
      payloadExposed: false,
      secretFieldsExposed: false,
      declaresFullV1Complete: false,
    },
    nextActions: ["先补打印阶段负责人 closeout 的阻塞，处理后重新运行打印链路执行器。"],
  };
}

function buildDriverRealDeviceExecution() {
  return {
    scope: "v1_driver_real_device_execution",
    status: "blocked",
    ready: false,
    checkedAt: "2026-07-04T10:43:00.000+08:00",
    summary: {
      label: "1/2 步骤通过，仍有阻塞",
      passedCount: 1,
      plannedCount: 0,
      totalCount: 2,
      blockingCount: 1,
      errorCount: 0,
    },
    execution: {
      apiBaseUrl: "http://127.0.0.1:8787/api",
      driverOperatorId: "U-DRIVER-A",
      planOnly: false,
      fieldEvidenceManifestIncluded: false,
      actualArtifactPathsIncluded: false,
      closeoutCoversOnlyDriverStage: true,
      outputDirIncluded: false,
    },
    stages: [
      {
        key: "driver-v1-readiness",
        label: "运行中 API 司机真机门禁",
        status: "passed",
        detail: "运行中 API 的司机端 V1 readiness 已 ready，并已保存为 closeout 源证据。",
        command: "GET http://127.0.0.1:8787/api/driver/v1-readiness as U-DRIVER-A",
        exitCode: 0,
        evidence: {
          actualCommandArgsIncluded: false,
          rawArtifactPathIncluded: false,
          reportParsed: true,
          reportStatus: "ready",
          reportReady: true,
          summaryLabel: "8/8 通过",
          passedCount: 8,
          totalCount: 8,
          blockingCount: 0,
          scope: "driver_v1_readiness",
          nativeSupportedLabel: "2/2",
          packageLabelScanMethod: "native_bridge",
          packageLabelScanResult: "matched",
          rawReadinessReportIncluded: false,
          scanTextIncluded: false,
          photoPayloadIncluded: false,
          geoPointIncluded: false,
        },
        nextActions: [],
      },
      {
        key: "driver-real-device-closeout",
        label: "司机真机阶段负责人 closeout",
        status: "blocked",
        detail: "6/8 通过",
        command:
          "node -- scripts/run-v1-driver-real-device-closeout.mjs --driver-readiness-json <driver-readiness-latest-json> --field-evidence-manifest <filled-field-evidence-manifest> --json",
        exitCode: 2,
        evidence: {
          actualCommandArgsIncluded: false,
          rawArtifactPathIncluded: false,
          reportParsed: true,
          reportStatus: "blocked",
          reportReady: false,
          summaryLabel: "6/8 通过",
          passedCount: 6,
          totalCount: 8,
          blockingCount: 1,
          scope: "v1_driver_real_device_closeout",
          driverNativeEvidenceStatus: "blocked",
          driverNativeEvidenceCompleted: 6,
          driverNativeEvidenceRequired: 8,
          rawEvidenceRefsIncluded: false,
          rawReadinessReportIncluded: false,
        },
        nextActions: ["纸质标签原生扫码仍未通过，先补司机真机扫码留证。"],
      },
    ],
    blockingStages: [
      {
        key: "driver-real-device-closeout",
        label: "司机真机阶段负责人 closeout",
        status: "blocked",
        detail: "6/8 通过",
        command:
          "node -- scripts/run-v1-driver-real-device-closeout.mjs --driver-readiness-json <driver-readiness-latest-json> --field-evidence-manifest <filled-field-evidence-manifest> --json",
        exitCode: 2,
        evidence: {
          reportParsed: true,
          reportStatus: "blocked",
          reportReady: false,
          summaryLabel: "6/8 通过",
          passedCount: 6,
          totalCount: 8,
          blockingCount: 1,
          scope: "v1_driver_real_device_closeout",
        },
        nextActions: ["纸质标签原生扫码仍未通过，先补司机真机扫码留证。"],
      },
    ],
    safeguards: {
      nonMutating: true,
      businessDataMutated: false,
      apiCalledOnlyForDriverReadiness: true,
      cameraPermissionRequestedByExecution: false,
      locationPermissionRequestedByExecution: false,
      navigationAppOpenedByExecution: false,
      nativeBridgeInvokedByExecution: false,
      deliveryStatusChangedByExecution: false,
      photoUploadedByExecution: false,
      fieldEvidenceManifestMutated: false,
      rawReadinessReportIncluded: false,
      scannedTextExposed: false,
      photoPayloadExposed: false,
      geoPointExposed: false,
      payloadExposed: false,
      bearerTokenExposed: false,
      secretFieldsExposed: false,
      declaresFullV1Complete: false,
    },
    nextActions: ["先处理 司机真机阶段负责人 closeout 的阻塞，处理后重新运行司机真机执行器。"],
  };
}

function buildDriverRealDeviceCloseout() {
  return {
    scope: "v1_driver_real_device_closeout",
    status: "blocked",
    ready: false,
    checkedAt: "2026-07-04T10:45:00.000+08:00",
    summary: {
      label: "6/8 通过",
      passedCount: 6,
      totalCount: 8,
      blockingCount: 1,
    },
    stages: [
      {
        key: "driver-scan-upload",
        label: "司机真机扫码上传",
        status: "passed",
        ready: true,
        detail: "司机真机扫码、签收照片上传和水印预览已留证。",
        summary: { label: "4/4 通过" },
        nextAction: "保留真机型号、系统版本和上传记录。",
      },
      {
        key: "paper-label-native-scan",
        label: "纸质标签原生扫码",
        status: "blocked",
        ready: false,
        detail: "纸质标签原生扫码仍未通过，必须用司机真实手机复核。",
        summary: { label: "2/4 通过" },
        nextAction: "用司机真实手机复核纸质标签原生扫码、弱网重试和异常提示。",
      },
    ],
    blockingStages: [
      {
        key: "paper-label-native-scan",
        label: "纸质标签原生扫码",
        status: "blocked",
        ready: false,
        detail: "纸质标签原生扫码仍未通过，必须用司机真实手机复核。",
        summary: { label: "2/4 通过" },
        nextAction: "用司机真实手机复核纸质标签原生扫码、弱网重试和异常提示。",
      },
    ],
    safeguards: {
      locationCoordinatesExposed: false,
      customerAddressExposed: false,
      driverPhoneExposed: false,
      rawPhotoIncluded: false,
      deliveryStatusChanged: false,
      declaresFullV1Complete: false,
    },
    nextActions: ["纸质标签原生扫码仍未通过，先补司机真机扫码留证，再重新运行司机真机 closeout。"],
  };
}

function buildBlockedUnblockPlan() {
  return {
    status: "blocked",
    ready: false,
    summary: {
      label: "V1 解除阻塞仍有 52 项待处理",
      taskCount: 52,
      releaseTaskCount: 11,
      evidenceTaskCount: 40,
      signoffTaskCount: 6,
      boundaryTaskCount: 1,
      phaseCount: 5,
      roleCount: 6,
    },
    roleBuckets: [
      { role: "技术/管理", taskCount: 34, p0TaskCount: 34 },
      { role: "办公室", taskCount: 19, p0TaskCount: 19 },
    ],
    phases: [
      {
        key: "production_environment",
        label: "1. 先补生产环境和持久化",
        taskCount: 4,
        releaseTaskCount: 2,
        evidenceTaskCount: 2,
        signoffTaskCount: 0,
        boundaryTaskCount: 0,
        roles: ["技术/管理"],
        nextStep: "先由技术 / 管理补真实 PostgreSQL、对象存储和生产 env，再重新跑生产环境预检与系统持久化门禁。",
      },
      {
        key: "print_hardware",
        label: "2. 再补真实打印链路",
        taskCount: 7,
        releaseTaskCount: 1,
        evidenceTaskCount: 6,
        signoffTaskCount: 0,
        boundaryTaskCount: 0,
        roles: ["办公室", "仓库/出库"],
        nextStep: "在真实打印机器上完成 CUPS 队列预检、样张出纸、纸张对位、条码扫码和作废重打证据。",
      },
    ],
    firstActions: [
      {
        id: "release:production-env-preflight:v1-persistence-profile",
        type: "发布门禁",
        primaryRole: "技术/管理",
        roles: ["技术/管理"],
        group: "生产环境变量预检",
        title: "统一 V1 持久化 profile",
        status: "blocked",
        action: "补齐 PostgreSQL 连接和 object_storage 文件 profile；不要把模板占位符原样取消注释。",
      },
      {
        id: "evidence:print-hardware:cups-lpstat-checked",
        type: "现场证据",
        primaryRole: "办公室",
        roles: ["办公室", "仓库/出库"],
        group: "打印硬件 / CUPS / 标签",
        title: "真实 CUPS 队列 non-printing 预检已通过",
        status: "pending",
        action: "在真实打印机上执行预检并回填证据编号。",
      },
    ],
    safeguards: {
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawSecretsIncluded: false,
      nonMutating: true,
    },
  };
}

function buildBlockedFieldEvidenceIntake() {
  return {
    scope: "v1_field_evidence_intake_pack",
    status: "blocked_pack_written",
    ready: false,
    generatedAt: "2026-07-04T10:30:00.000+08:00",
    conclusion: "现场证据仍未完成；该采集包用于按证据组补齐材料、签字和 V1/V2 边界确认。",
    summary: {
      label: "V1 现场证据采集包：BLOCKED",
      evidence: "V1 现场证据清单仍阻塞：证据 0/40，签字 0/6",
      evidenceGroups: "0/7",
      requiredEvidenceItems: "0/40",
      signoffs: "0/6",
      boundary: "pending",
      releaseCandidate: "0/4 发布门禁通过",
      v1Readiness: "76-79%",
      onsiteTasks: 52,
    },
    groups: [
      {
        key: "print_hardware",
        label: "打印硬件 / CUPS / 标签",
        ownerRole: "办公室 / 仓库",
        status: "blocked",
        ready: false,
        requiredTotal: 7,
        completedRequired: 0,
        blockedRequired: 7,
        outputFile: "groups/print_hardware.zh-CN.md",
      },
    ],
    safeguards: {
      nonMutating: true,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawNotesIncluded: false,
    },
  };
}

function buildSensitiveFieldEvidenceManifest() {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  manifest.environment.apiBaseUrl = "https://erp.example.test/api";
  manifest.environment.productionEnvPreflightReport = sensitiveValues[0];
  manifest.evidenceGroups[0].items[0].status = "passed";
  manifest.evidenceGroups[0].items[0].evidenceRef = sensitiveValues[0];
  manifest.evidenceGroups[0].items[0].notes = `keep out of summary ${sensitiveValues[1]} ${sensitiveValues[2]}`;
  manifest.evidenceGroups[2].items[0].status = "blocked";
  manifest.evidenceGroups[2].items[0].evidenceRef = sensitiveValues[3];
  manifest.evidenceGroups[2].items[0].notes = sensitiveValues[4];
  return manifest;
}

function runNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("V1 go-live handoff pack check timed out after 10000ms"));
    }, 10000);
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

function readGeneratedFile(path, baseDir = process.cwd()) {
  const candidates = [
    path,
    isAbsolute(path) ? path : join(baseDir, path),
    isAbsolute(path) ? path : join(process.cwd(), path),
  ];
  const fullPath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(fullPath, `generated file is missing: ${path}`);
  return readFileSync(fullPath, "utf8");
}

function readGeneratedBuffer(path, baseDir = process.cwd()) {
  const candidates = [
    path,
    isAbsolute(path) ? path : join(baseDir, path),
    isAbsolute(path) ? path : join(process.cwd(), path),
  ];
  const fullPath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(fullPath, `generated file is missing: ${path}`);
  return readFileSync(fullPath);
}

function runFailureMessage(message, result) {
  return `${message}; actual=${result.status}; stdout=${result.stdout || "<empty>"}; stderr=${result.stderr || "<empty>"}`;
}

function assertNoSensitiveOutput(output) {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(output, pattern, `output matched forbidden sensitive pattern ${pattern}`);
  }
}
