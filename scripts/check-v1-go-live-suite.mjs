import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { buildV1FieldEvidenceManifestTemplate, serializeManifestJson } from "./v1FieldEvidenceManifest.mjs";
import {
  closeTestServer as closeServer,
  getTestServerBaseUrl,
  listenTestServer as listen,
} from "./helpers/apiIntegrationTestHarness.mjs";

const suiteScript = join(process.cwd(), "scripts", "run-v1-go-live-suite.mjs");
const tempRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-go-live-suite");
const sourceRoot = join(tempRoot, "sources");
const outputRoot = join(tempRoot, "suite");
const csvOutputRoot = join(tempRoot, "suite-with-csv");
const csvRefreshOutputRoot = join(tempRoot, "suite-with-csv-refresh");
const canonicalRoot = join(tempRoot, "canonical");
const releaseJsonPath = join(sourceRoot, "release-candidate.json");
const releaseMarkdownPath = join(sourceRoot, "release-candidate.md");
const productionEnvSetupJsonPath = join(sourceRoot, "production-env-setup.json");
const staleProductionEnvSetupJsonPath = join(sourceRoot, "production-env-setup-stale.json");
const productionEnvSetupMarkdownPath = join(sourceRoot, "production-env-setup.md");
const productionEnvSetupEnvFilePath = join(sourceRoot, "secure-prod.env");
const productionEnvIntakeVerifyJsonPath = join(sourceRoot, "production-env-intake-verify.json");
const productionEnvIntakeVerifyMarkdownPath = join(sourceRoot, "production-env-intake-verify.md");
const productionFirstStageExecutionJsonPath = join(sourceRoot, "production-first-stage-execution.json");
const productionFirstStageExecutionMarkdownPath = join(sourceRoot, "production-first-stage-execution.md");
const productionFirstStageEvidenceSuggestionsJsonPath = join(sourceRoot, "production-first-stage-evidence-suggestions.json");
const productionFirstStageEvidenceSuggestionsMarkdownPath = join(sourceRoot, "production-first-stage-evidence-suggestions.md");
const productionFirstStageEvidenceSuggestionsCsvPath = join(sourceRoot, "production-first-stage-evidence-suggestions.csv");
const productionPersistenceEvidenceJsonPath = join(sourceRoot, "production-persistence-evidence.json");
const productionPersistenceEvidenceMarkdownPath = join(sourceRoot, "production-persistence-evidence.md");
const productionRuntimeSmokeJsonPath = join(sourceRoot, "production-runtime-smoke.json");
const productionRuntimeSmokeMarkdownPath = join(sourceRoot, "production-runtime-smoke.md");
const printChainExecutionJsonPath = join(sourceRoot, "print-chain-execution.json");
const printChainExecutionMarkdownPath = join(sourceRoot, "print-chain-execution.md");
const printChainCloseoutJsonPath = join(sourceRoot, "print-chain-closeout.json");
const printChainCloseoutMarkdownPath = join(sourceRoot, "print-chain-closeout.md");
const driverRealDeviceExecutionJsonPath = join(sourceRoot, "driver-real-device-execution.json");
const driverRealDeviceExecutionMarkdownPath = join(sourceRoot, "driver-real-device-execution.md");
const driverRealDeviceCloseoutJsonPath = join(sourceRoot, "driver-real-device-closeout.json");
const driverRealDeviceCloseoutMarkdownPath = join(sourceRoot, "driver-real-device-closeout.md");
const fieldManifestPath = join(sourceRoot, "field-evidence.json");
const partialCsvPath = join(sourceRoot, "partial-evidence.csv");
const signoffBoundaryCsvPath = join(sourceRoot, "signoff-boundary.csv");
const draftManifestPath = join(csvOutputRoot, "applied-field-evidence", "filled-manifest.draft.json");
const refreshDraftManifestPath = join(csvRefreshOutputRoot, "applied-field-evidence", "filled-manifest.draft.json");
const missingReleaseJsonPath = join(sourceRoot, "missing-release-candidate.json");
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
  /DO_NOT_LEAK_ENV_SETUP_SECRET/i,
];

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
      postgresBackupRestoreResetExplicitlyAllowed: false,
      objectStorageGovernanceWritesObjects: false,
      envValuesExposed: false,
      databaseUrlExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      objectKeyExposed: false,
      signedUrlExposed: false,
      payloadExposed: false,
      envFilePathExposed: false,
    },
    nextActions: [
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

rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(sourceRoot, { recursive: true });
writeFileSync(releaseJsonPath, `${JSON.stringify(buildBlockedReleaseCandidate(), null, 2)}\n`);
writeFileSync(releaseMarkdownPath, "# ERP V1 发布候选检查\n\n- 结论：BLOCKED（0/4 发布门禁通过）\n");
writeFileSync(productionEnvSetupEnvFilePath, buildProductionEnvSetupEnvFile());
chmodSync(productionEnvSetupEnvFilePath, 0o600);
writeFileSync(productionEnvSetupJsonPath, `${JSON.stringify(buildProductionEnvSetup(productionEnvSetupEnvFilePath), null, 2)}\n`);
writeFileSync(
  productionEnvSetupMarkdownPath,
  `# V1 生产 env 准备报告\n\n- 结论：PREPARED / 仍需填真实值\n- 路径：${productionEnvSetupEnvFilePath}\n- 安全 env 文件已准备\n`,
);
writeFileSync(productionEnvIntakeVerifyJsonPath, `${JSON.stringify(buildProductionEnvIntakeVerification(), null, 2)}\n`);
writeFileSync(
  productionEnvIntakeVerifyMarkdownPath,
  "# V1 生产 env 真实值 intake 校验\n\n- 结论：BLOCKED\n- 阻塞：PostgreSQL / 对象存储 / CUPS\n",
);
writeFileSync(productionFirstStageExecutionJsonPath, `${JSON.stringify(buildBlockedProductionFirstStageExecution(), null, 2)}\n`);
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
  "# V1 Production Persistence Evidence\n\n- Status: blocked\n- Summary: 3/8 阶段通过\n",
);
writeFileSync(productionRuntimeSmokeJsonPath, `${JSON.stringify(buildProductionRuntimeSmoke(), null, 2)}\n`);
writeFileSync(productionRuntimeSmokeMarkdownPath, "# V1 Production Runtime Smoke\n\n- Status: blocked\n- Summary: 2/4 通过\n");
writeFileSync(printChainCloseoutJsonPath, `${JSON.stringify(buildPrintChainCloseout(), null, 2)}\n`);
writeFileSync(printChainCloseoutMarkdownPath, "# V1 Print Chain Closeout\n\n- Status: ready\n- Summary: 8/8 通过\n");
writeFileSync(printChainExecutionJsonPath, `${JSON.stringify(buildPrintChainExecution(), null, 2)}\n`);
writeFileSync(
  printChainExecutionMarkdownPath,
  "# V1 Print-Chain Execution\n\n- Status: blocked\n- Summary: 2/3 步骤通过，仍有阻塞\n",
);
writeFileSync(driverRealDeviceExecutionJsonPath, `${JSON.stringify(buildDriverRealDeviceExecution(), null, 2)}\n`);
writeFileSync(
  driverRealDeviceExecutionMarkdownPath,
  "# V1 Driver Real-Device Execution\n\n- Status: blocked\n- Summary: 1/2 步骤通过，仍有阻塞\n",
);
writeFileSync(driverRealDeviceCloseoutJsonPath, `${JSON.stringify(buildDriverRealDeviceCloseout(), null, 2)}\n`);
writeFileSync(
  driverRealDeviceCloseoutMarkdownPath,
  "# V1 Driver Real-Device Closeout\n\n- Status: blocked\n- Summary: 6/8 通过\n",
);
writeFileSync(fieldManifestPath, serializeManifestJson(buildBlockedFieldEvidenceManifest()));
writeFileSync(partialCsvPath, buildCsv([
  {
    groupKey: "production_persistence",
    groupLabel: "生产持久化",
    ownerRole: "技术 / 管理",
    itemKey: "postgres_migration_applied",
    itemLabel: "PostgreSQL 迁移已在生产库执行",
    required: "yes",
    status: "pending",
    evidenceRefFilled: "no",
    onsiteStatus: "passed",
    onsiteEvidenceRef: "EVT-PG-001",
    onsiteNotes: "迁移截图和 checksum 已归档",
  },
]));
writeFileSync(signoffBoundaryCsvPath, buildSignoffBoundaryCsv([
  {
    recordType: "signoff",
    role: "办公室",
    label: "办公室",
    required: "yes",
    status: "pending",
    filledName: "no",
    filledTime: "no",
    onsiteStatus: "signed",
    onsiteSigner: "办公室负责人",
    onsiteSignedAt: "2026-07-04T11:00:00+08:00",
    onsiteConfirmedBy: "",
    onsiteConfirmedAt: "",
    onsiteNotes: "现场签字单 EVT-SIGN-001 已归档",
  },
  {
    recordType: "boundary",
    role: "v1_v2_boundary",
    label: "V1/V2 边界确认",
    required: "yes",
    status: "pending",
    filledName: "no",
    filledTime: "no",
    onsiteStatus: "confirmed",
    onsiteSigner: "",
    onsiteSignedAt: "",
    onsiteConfirmedBy: "总负责人",
    onsiteConfirmedAt: "2026-07-04T11:05:00+08:00",
    onsiteNotes: "V2 延后范围已复核",
  },
]));
mkdirSync(join(canonicalRoot, "v1-field-evidence-intake"), { recursive: true });
writeFileSync(join(canonicalRoot, "v1-field-evidence-intake", "evidence-items.csv"), "operator-filled-evidence-csv\n");
writeFileSync(join(canonicalRoot, "v1-field-evidence-intake", "signoff-boundary.csv"), "operator-filled-signoff-csv\n");
writeFileSync(join(canonicalRoot, "v1-field-evidence-intake", "filled-manifest.draft.json"), "{\"operatorDraft\":true}\n");

const blockedRun = await runNode([
  suiteScript,
  "--release-candidate-json",
  releaseJsonPath,
  "--release-candidate-markdown",
  releaseMarkdownPath,
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
  "--field-evidence-manifest",
  fieldManifestPath,
  "--output-root",
  outputRoot,
  "--sync-canonical-latest",
  "--canonical-root",
  canonicalRoot,
  "--json",
]);
assert.equal(blockedRun.status, 0, runFailureMessage("go-live suite should be written for blocked release candidate", blockedRun));
const blockedResult = JSON.parse(blockedRun.stdout);
assert.equal(blockedResult.scope, "v1_go_live_suite");
assert.equal(blockedResult.status, "blocked_go_live_suite_written");
assert.equal(blockedResult.ready, false);
assert.equal(blockedResult.canDeclareV1Complete, false);
assert.equal(blockedResult.summary.releaseCandidate, "0/4 发布门禁通过");
assert.equal(blockedResult.summary.ownerDecision, "不能宣布 V1 已完成");
assert.equal(blockedResult.summary.p0Prototype, "97-98%");
assert.equal(blockedResult.summary.v1Readiness, "80-83%");
assert.equal(blockedResult.summary.productionEnvSetup, "安全 env 文件已准备，仍需填真实生产值 / prepared");
assert.equal(blockedResult.summary.productionEnvIntakeVerification, "11 项真实值 intake / env 校验阻塞 / blocked");
assert.equal(
  blockedResult.summary.productionFirstStageEvidenceSuggestions,
  "7 项可建议自动接受，2 项只有部分自动化支撑，1 项仍需人工证据 / review_required",
);
assert.ok(blockedResult.summary.moduleCount >= 10, "suite should carry module completion count");
assert.ok(
  blockedResult.summary.lowestV1ReadinessModules.some((item) => item.includes("自动化 / 企微 / 客户群 5%")),
  "suite should carry lowest V1-readiness module highlights",
);
assert.equal(blockedResult.moduleCompletion.moduleCount, blockedResult.summary.moduleCount);
assert.ok(
  blockedResult.moduleCompletion.modules.some((item) => item.module === "司机端送货" && item.v1Readiness === "42%"),
  "suite should carry module completion rows",
);
assert.ok(blockedResult.summary.onsiteTasks > 0, "blocked fixture should produce onsite tasks");
assert.equal(blockedResult.summary.unblockPlan, "V1 解除阻塞仍有 48 项待处理");
assert.ok(blockedResult.summary.unblockPhaseCount >= 4, "suite should summarize unblock phases");
assert.ok(
  blockedResult.summary.unblockFirstActions.some((item) => item.includes("生产环境变量预检 / 统一 V1 持久化 profile")),
  "suite should expose first unblock actions",
);
assert.equal(blockedResult.unblockPlan.summary.taskCount, 48);
assert.equal(blockedResult.unblockPlan.summary.releaseTaskCount, 1);
assert.equal(blockedResult.unblockPlan.summary.evidenceTaskCount, 40);
assert.equal(blockedResult.unblockPlan.summary.signoffTaskCount, 6);
assert.equal(blockedResult.unblockPlan.summary.boundaryTaskCount, 1);
assert.ok(
  blockedResult.unblockPlan.phases.some((phase) => phase.key === "production_environment" && phase.taskCount > 0),
  "suite should group production-environment unblock tasks",
);
assert.ok(
  blockedResult.unblockPlan.phases.some((phase) => phase.key === "print_hardware" && phase.taskCount > 0),
  "suite should group print unblock tasks",
);
assert.ok(
  blockedResult.unblockPlan.firstActions.some((task) => task.title === "统一 V1 持久化 profile"),
  "suite should return first concrete unblock tasks",
);
assert.equal(blockedResult.productionGoLiveStageChecklist.summary.label, "0/5 通过");
assert.equal(blockedResult.productionGoLiveStageChecklist.stages.length, 5);
assert.ok(
  blockedResult.productionGoLiveStageChecklist.stages.some(
    (stage) => stage.key === "production-env-intake-verify" && stage.sourceStatus === "blocked",
  ),
  "suite should include production env intake verification as its own go-live stage",
);
const productionEnvIntakeStage = blockedResult.productionGoLiveStageChecklist.stages.find(
  (stage) => stage.key === "production-env-intake-verify",
);
assert.equal(productionEnvIntakeStage.minimumBlockingItems.length, 11);
assert.ok(
  productionEnvIntakeStage.minimumBlockingItems.some(
    (item) => item.variableLabel === "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND",
  ),
  "production env intake stage should carry the concrete CUPS status-command minimum fill item",
);
assert.ok(
  blockedResult.productionGoLiveStageChecklist.stages.some(
    (stage) => stage.key === "runtime-production-profile" && stage.sourceStatus === "live_precheck_required",
  ),
  "suite should keep production profile as live-precheck-required when only release-candidate snapshot is available",
);
assert.ok(blockedResult.summary.v2DifferenceCount > 0, "suite should carry V2 differences");
assert.ok(blockedResult.summary.v2Categories.includes("企微 / 客户自动化"), "suite should carry V2 categories");
assert.equal(blockedResult.steps.length, 7);
assert.deepEqual(
  blockedResult.steps.map((step) => step.key),
  ["releaseCandidate", "onsiteTaskBoard", "completionSnapshot", "v1V2ScopeBrief", "ownerDecisionBrief", "fieldEvidenceIntake", "handoffPack"],
);
assert.ok(blockedResult.steps.every((step) => step.ready === false), "blocked fixture should keep every downstream step blocked");
assert.equal(blockedResult.safeguards.nonMutating, true);
assert.equal(blockedResult.safeguards.rawEvidenceRefsIncluded, false);
assert.equal(blockedResult.safeguards.productionEnvSetupIncluded, true);
assert.equal(blockedResult.safeguards.productionEnvIntakeVerificationIncluded, true);
assert.equal(blockedResult.safeguards.productionEnvIntakeVerificationReportExpectedRedacted, true);
assert.equal(blockedResult.safeguards.productionFirstStageEvidenceSuggestionsIncluded, true);
assert.equal(blockedResult.safeguards.productionFirstStageEvidenceSuggestionsRequireHumanReview, true);
assert.equal(blockedResult.safeguards.canonicalLatestSynced, true);
assert.equal(blockedResult.canonicalLatest.synced, true);
assert.equal(blockedResult.canonicalLatest.root, ".erp-local-storage/checks/v1-go-live-suite/canonical");
assert.ok(blockedResult.canonicalLatest.artifacts.ownerDecisionBrief, "canonical owner brief sync was not reported");
assert.ok(blockedResult.canonicalLatest.artifacts.handoffPack, "canonical handoff sync was not reported");
assert.deepEqual(blockedResult.canonicalLatest.artifacts.fieldEvidenceIntake.preservedFiles, [
  "evidence-items.csv",
  "signoff-boundary.csv",
  "filled-manifest.draft.json",
]);
assert.ok(blockedResult.files.summaryMarkdown, "suite summary path was not returned");
assert.ok(blockedResult.files.suiteManifest, "suite manifest path was not returned");
assert.ok(blockedResult.files.latestMarkdown, "suite latest markdown path was not returned");
assert.ok(blockedResult.files.latestJson, "suite latest json path was not returned");
assert.ok(
  blockedResult.files.productionGoLiveStageChecklistMarkdown,
  "suite production go-live stage checklist markdown path was not returned",
);
assert.ok(
  blockedResult.files.productionGoLiveStageChecklistJson,
  "suite production go-live stage checklist json path was not returned",
);
assert.ok(blockedResult.files.unblockPlanMarkdown, "suite unblock plan markdown path was not returned");
assert.ok(blockedResult.files.unblockPlanJson, "suite unblock plan json path was not returned");

const suiteSummary = readGeneratedFile(blockedResult.files.summaryMarkdown);
const suiteManifest = readGeneratedFile(blockedResult.files.suiteManifest);
const latestMarkdown = readGeneratedFile(blockedResult.files.latestMarkdown);
const latestJson = JSON.parse(readGeneratedFile(blockedResult.files.latestJson));
const productionGoLiveStageChecklistMarkdown = readGeneratedFile(
  blockedResult.files.productionGoLiveStageChecklistMarkdown,
);
const productionGoLiveStageChecklistJson = JSON.parse(readGeneratedFile(blockedResult.files.productionGoLiveStageChecklistJson));
const unblockPlanMarkdown = readGeneratedFile(blockedResult.files.unblockPlanMarkdown);
const unblockPlanJson = JSON.parse(readGeneratedFile(blockedResult.files.unblockPlanJson));
assert.match(suiteSummary, /ERP V1 Go-Live Suite/);
assert.match(suiteSummary, /当前结论：BLOCKED/);
assert.match(suiteSummary, /是否可以宣布 V1 完成：不可以/);
assert.match(suiteSummary, /发布候选：0\/4 发布门禁通过/);
assert.match(suiteSummary, /负责人判断：不能宣布 V1 已完成/);
assert.match(suiteSummary, /模块数：/);
assert.match(suiteSummary, /V1 上线就绪最低模块：/);
assert.match(suiteSummary, /生产 env 准备：安全 env 文件已准备，仍需填真实生产值 \/ prepared/);
assert.match(suiteSummary, /生产 env 真实值校验：11 项真实值 intake \/ env 校验阻塞 \/ blocked/);
assert.match(suiteSummary, /第一阶段证据建议：7 项可建议自动接受，2 项只有部分自动化支撑，1 项仍需人工证据 \/ review_required/);
assert.match(suiteSummary, /第一阶段证据建议只生成 suggested CSV 给负责人复核/);
assert.match(suiteSummary, /模块完成度/);
assert.match(suiteSummary, /最小解除阻塞路径/);
assert.match(suiteSummary, /最先处理的 10 项/);
assert.match(suiteSummary, /统一 V1 持久化 profile/);
assert.match(suiteSummary, /司机端送货/);
assert.match(suiteSummary, /V2 差异：/);
assert.match(suiteSummary, /V2 主题：/);
assert.match(suiteSummary, /顶层 latest 同步/);
assert.match(suiteSummary, /V1\/V2 差异摘要/);
assert.match(suiteSummary, /上线交接包/);
assert.match(suiteSummary, /D49 正式员工机台导入模板/);
assert.match(suiteSummary, /d49-formal-employee-machine-import-template\.xlsx/);
assert.match(suiteSummary, /D49 正式员工导入说明/);
assert.match(suiteSummary, /d49-formal-employee-intake-guide\.zh-CN\.md/);
assert.match(suiteSummary, /生产 env 准备报告（交接包）/);
assert.match(suiteSummary, /第一阶段证据建议（交接包）/);
assert.match(suiteSummary, /第一阶段 suggested CSV（交接包）/);
assert.match(suiteSummary, /生产上线组合预检阶段清单/);
assert.match(suiteSummary, /release-candidate 快照，仍需现场执行 live 组合预检/);
assert.equal(latestMarkdown, suiteSummary);
assert.equal(latestJson.scope, "v1_go_live_suite");
assert.equal(latestJson.ready, false);
assert.equal(latestJson.moduleCompletion.moduleCount, blockedResult.summary.moduleCount);
assert.equal(latestJson.productionGoLiveStageChecklist.summary.label, blockedResult.productionGoLiveStageChecklist.summary.label);
assert.equal(productionGoLiveStageChecklistJson.summary.label, blockedResult.productionGoLiveStageChecklist.summary.label);
assert.match(productionGoLiveStageChecklistMarkdown, /ERP V1 生产上线组合预检阶段清单/);
assert.match(productionGoLiveStageChecklistMarkdown, /生产 env 真实值 intake 校验/);
assert.match(productionGoLiveStageChecklistMarkdown, /最小补值清单/);
assert.match(productionGoLiveStageChecklistMarkdown, /ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND/);
assert.match(productionGoLiveStageChecklistMarkdown, /当前 API 生产 profile 确认/);
assert.match(productionGoLiveStageChecklistMarkdown, /run-v1-production-go-live-precheck/);
assert.match(productionGoLiveStageChecklistMarkdown, /生产上线组合预检 JSON \/ Markdown 结果/);
assert.equal(latestJson.unblockPlan.summary.taskCount, blockedResult.unblockPlan.summary.taskCount);
assert.equal(unblockPlanJson.summary.taskCount, blockedResult.unblockPlan.summary.taskCount);
assert.match(unblockPlanMarkdown, /ERP V1 最小解除阻塞清单/);
assert.match(unblockPlanMarkdown, /阶段顺序/);
assert.match(unblockPlanMarkdown, /先补生产环境和持久化/);
assert.match(unblockPlanMarkdown, /角色压力/);
assert.match(suiteManifest, /v1_go_live_suite/);
assertNoSensitiveOutput(
  blockedRun.stdout +
    blockedRun.stderr +
    suiteSummary +
    suiteManifest +
    latestMarkdown +
    productionGoLiveStageChecklistMarkdown +
    unblockPlanMarkdown,
);

const downstreamFiles = [
  join(outputRoot, "onsite-task-board", "latest.json"),
  join(outputRoot, "onsite-task-board", "latest.md"),
  join(outputRoot, "onsite-task-board", "roles", "technical-management.latest.md"),
  join(outputRoot, "completion-snapshot", "latest.json"),
  join(outputRoot, "completion-snapshot", "latest.md"),
  join(outputRoot, "v1-v2-scope-brief", "latest.json"),
  join(outputRoot, "v1-v2-scope-brief", "latest.zh-CN.md"),
  join(outputRoot, "owner-decision-brief", "latest.json"),
  join(outputRoot, "owner-decision-brief", "latest.zh-CN.md"),
  join(outputRoot, "field-evidence-intake", "intake-manifest.json"),
  join(outputRoot, "field-evidence-intake", "intake-summary.zh-CN.md"),
  join(outputRoot, "field-evidence-intake", "evidence-items.csv"),
  join(outputRoot, "field-evidence-intake", "intake-rules.zh-CN.md"),
  join(outputRoot, "field-evidence-intake", "signoff-boundary.csv"),
  join(outputRoot, "go-live-handoff", "handoff-manifest.json"),
  join(outputRoot, "go-live-handoff", "handoff-summary.zh-CN.md"),
  join(outputRoot, "go-live-handoff", "production-env-setup.latest.md"),
  join(outputRoot, "go-live-handoff", "production-env-setup.latest.json"),
  join(outputRoot, "go-live-handoff", "production-go-live-stage-checklist.latest.zh-CN.md"),
  join(outputRoot, "go-live-handoff", "production-go-live-stage-checklist.latest.json"),
  join(outputRoot, "go-live-handoff", "production-first-stage-execution.latest.md"),
  join(outputRoot, "go-live-handoff", "production-first-stage-execution.latest.json"),
  join(outputRoot, "go-live-handoff", "production-first-stage-evidence-suggestions.latest.md"),
  join(outputRoot, "go-live-handoff", "production-first-stage-evidence-suggestions.latest.json"),
  join(outputRoot, "go-live-handoff", "production-first-stage-evidence-suggestions.csv"),
  join(outputRoot, "go-live-handoff", "production-persistence-evidence.latest.md"),
  join(outputRoot, "go-live-handoff", "production-persistence-evidence.latest.json"),
  join(outputRoot, "go-live-handoff", "production-runtime-smoke.latest.md"),
  join(outputRoot, "go-live-handoff", "production-runtime-smoke.latest.json"),
  join(outputRoot, "go-live-handoff", "print-chain-execution.latest.md"),
  join(outputRoot, "go-live-handoff", "print-chain-execution.latest.json"),
  join(outputRoot, "go-live-handoff", "print-chain-closeout.latest.md"),
  join(outputRoot, "go-live-handoff", "print-chain-closeout.latest.json"),
  join(outputRoot, "go-live-handoff", "driver-real-device-execution.latest.md"),
  join(outputRoot, "go-live-handoff", "driver-real-device-execution.latest.json"),
  join(outputRoot, "go-live-handoff", "driver-real-device-closeout.latest.md"),
  join(outputRoot, "go-live-handoff", "driver-real-device-closeout.latest.json"),
  join(outputRoot, "go-live-handoff", "production-env-minimum-values-fragment.template.env.example"),
  join(outputRoot, "go-live-handoff", "production-env-values-fragment.template.env.example"),
  join(outputRoot, "go-live-handoff", "production-env-fill-template.env.example"),
  join(outputRoot, "go-live-handoff", "v1-owner-decision-brief.latest.zh-CN.md"),
  join(outputRoot, "go-live-handoff", "v1-v2-scope-brief.latest.zh-CN.md"),
  join(outputRoot, "go-live-handoff", "v1-v2-scope-brief.latest.json"),
  join(outputRoot, "go-live-handoff", "v1-unblock-plan.latest.zh-CN.md"),
  join(outputRoot, "go-live-handoff", "v1-unblock-plan.latest.json"),
  join(outputRoot, "go-live-handoff", "field-evidence-intake", "intake-rules.zh-CN.md"),
  join(outputRoot, "go-live-handoff", "field-evidence-intake", "signoff-boundary.csv"),
  join(outputRoot, "v1-unblock-plan.zh-CN.md"),
  join(outputRoot, "v1-unblock-plan.json"),
  join(outputRoot, "production-go-live-stage-checklist.zh-CN.md"),
  join(outputRoot, "production-go-live-stage-checklist.json"),
  join(canonicalRoot, "v1-onsite-task-board", "latest.json"),
  join(canonicalRoot, "v1-completion-snapshot", "latest.json"),
  join(canonicalRoot, "v1-v2-scope-brief", "latest.json"),
  join(canonicalRoot, "v1-owner-decision-brief", "latest.json"),
  join(canonicalRoot, "v1-field-evidence-intake", "intake-rules.zh-CN.md"),
  join(canonicalRoot, "v1-field-evidence-intake", "signoff-boundary.csv"),
  join(canonicalRoot, "v1-go-live-handoff", "handoff-summary.zh-CN.md"),
  join(canonicalRoot, "v1-go-live-handoff", "production-env-setup.latest.md"),
  join(canonicalRoot, "v1-go-live-handoff", "production-go-live-stage-checklist.latest.zh-CN.md"),
  join(canonicalRoot, "v1-go-live-handoff", "production-first-stage-execution.latest.md"),
  join(canonicalRoot, "v1-go-live-handoff", "production-first-stage-evidence-suggestions.latest.md"),
  join(canonicalRoot, "v1-go-live-handoff", "production-first-stage-evidence-suggestions.csv"),
  join(canonicalRoot, "v1-go-live-handoff", "production-persistence-evidence.latest.md"),
  join(canonicalRoot, "v1-go-live-handoff", "production-runtime-smoke.latest.md"),
  join(canonicalRoot, "v1-go-live-handoff", "print-chain-execution.latest.md"),
  join(canonicalRoot, "v1-go-live-handoff", "print-chain-closeout.latest.md"),
  join(canonicalRoot, "v1-go-live-handoff", "driver-real-device-execution.latest.md"),
  join(canonicalRoot, "v1-go-live-handoff", "driver-real-device-closeout.latest.md"),
  join(canonicalRoot, "v1-go-live-handoff", "production-env-minimum-values-fragment.template.env.example"),
  join(canonicalRoot, "v1-go-live-handoff", "production-env-values-fragment.template.env.example"),
  join(canonicalRoot, "v1-go-live-handoff", "production-env-fill-template.env.example"),
  join(canonicalRoot, "v1-go-live-handoff", "v1-unblock-plan.latest.zh-CN.md"),
];
for (const path of downstreamFiles) {
  assert.ok(existsSync(path), `downstream suite file is missing: ${path}`);
}
assert.equal(
  readFileSync(join(canonicalRoot, "v1-onsite-task-board", "latest.json"), "utf8"),
  readFileSync(join(outputRoot, "onsite-task-board", "latest.json"), "utf8"),
  "canonical onsite task board latest JSON should match the generated suite copy",
);
assert.equal(
  readFileSync(join(canonicalRoot, "v1-completion-snapshot", "latest.json"), "utf8"),
  readFileSync(join(outputRoot, "completion-snapshot", "latest.json"), "utf8"),
  "canonical completion snapshot latest JSON should match the generated suite copy",
);
assert.equal(
  readFileSync(join(canonicalRoot, "v1-v2-scope-brief", "latest.zh-CN.md"), "utf8"),
  readFileSync(join(outputRoot, "v1-v2-scope-brief", "latest.zh-CN.md"), "utf8"),
  "canonical V1/V2 scope brief latest Markdown should match the generated suite copy",
);
assert.equal(
  readFileSync(join(canonicalRoot, "v1-owner-decision-brief", "latest.zh-CN.md"), "utf8"),
  readFileSync(join(outputRoot, "owner-decision-brief", "latest.zh-CN.md"), "utf8"),
  "canonical owner decision brief latest Markdown should match the generated suite copy",
);
assert.equal(
  readFileSync(join(canonicalRoot, "v1-go-live-handoff", "handoff-summary.zh-CN.md"), "utf8"),
  readFileSync(join(outputRoot, "go-live-handoff", "handoff-summary.zh-CN.md"), "utf8"),
  "canonical handoff summary should match the generated suite copy",
);
assert.ok(
  existsSync(join(outputRoot, "go-live-handoff", "d49-formal-employee-machine-import-template.xlsx")),
  "suite should include the D49 formal employee workbook",
);
assert.ok(
  existsSync(join(outputRoot, "go-live-handoff", "d49-formal-employee-intake-guide.zh-CN.md")),
  "suite should include the D49 employee intake guide",
);
assert.deepEqual(
  readFileSync(join(canonicalRoot, "v1-go-live-handoff", "d49-formal-employee-machine-import-template.xlsx")),
  readFileSync(join(outputRoot, "go-live-handoff", "d49-formal-employee-machine-import-template.xlsx")),
  "canonical D49 employee workbook should match the generated suite copy",
);
assert.equal(
  readFileSync(join(canonicalRoot, "v1-go-live-handoff", "v1-unblock-plan.latest.zh-CN.md"), "utf8"),
  readFileSync(join(outputRoot, "go-live-handoff", "v1-unblock-plan.latest.zh-CN.md"), "utf8"),
  "canonical handoff unblock plan should match the generated suite copy",
);
assert.equal(
  readFileSync(join(canonicalRoot, "v1-field-evidence-intake", "evidence-items.csv"), "utf8"),
  "operator-filled-evidence-csv\n",
  "canonical sync should preserve filled evidence CSV",
);
assert.equal(
  readFileSync(join(canonicalRoot, "v1-field-evidence-intake", "signoff-boundary.csv"), "utf8"),
  "operator-filled-signoff-csv\n",
  "canonical sync should preserve filled signoff/boundary CSV",
);
assert.equal(
  readFileSync(join(canonicalRoot, "v1-field-evidence-intake", "filled-manifest.draft.json"), "utf8"),
  "{\"operatorDraft\":true}\n",
  "canonical sync should preserve filled draft manifest",
);

const handoffSummary = readFileSync(join(outputRoot, "go-live-handoff", "handoff-summary.zh-CN.md"), "utf8");
const handoffManifest = readFileSync(join(outputRoot, "go-live-handoff", "handoff-manifest.json"), "utf8");
const handoffMinimumValuesFragmentTemplate = readFileSync(
  join(outputRoot, "go-live-handoff", "production-env-minimum-values-fragment.template.env.example"),
  "utf8",
);
const handoffValuesFragmentTemplate = readFileSync(
  join(outputRoot, "go-live-handoff", "production-env-values-fragment.template.env.example"),
  "utf8",
);
const handoffEnvTemplate = readFileSync(join(outputRoot, "go-live-handoff", "production-env-fill-template.env.example"), "utf8");
const handoffProductionEnvSetupCopy = readFileSync(
  join(outputRoot, "go-live-handoff", "production-env-setup.latest.json"),
  "utf8",
);
const handoffProductionEnvSetupMarkdownCopy = readFileSync(
  join(outputRoot, "go-live-handoff", "production-env-setup.latest.md"),
  "utf8",
);
assert.match(handoffProductionEnvSetupCopy, /"path": "env 文件 1"/);
assert.match(handoffProductionEnvSetupCopy, /"pathRedacted": true/);
assert.match(handoffProductionEnvSetupCopy, /"envFilePathExposed": false/);
assert.match(handoffProductionEnvSetupMarkdownCopy, /路径：env 文件 1（路径已脱敏）/);
const handoffProductionEnvIntakeVerificationCopy = readFileSync(
  join(outputRoot, "go-live-handoff", "production-env-intake-verify.latest.json"),
  "utf8",
);
const handoffProductionEnvIntakeVerificationMarkdownCopy = readFileSync(
  join(outputRoot, "go-live-handoff", "production-env-intake-verify.latest.md"),
  "utf8",
);
const handoffFirstStageExecutionCopy = readFileSync(
  join(outputRoot, "go-live-handoff", "production-first-stage-execution.latest.json"),
  "utf8",
);
const handoffFirstStageEvidenceSuggestionsCopy = readFileSync(
  join(outputRoot, "go-live-handoff", "production-first-stage-evidence-suggestions.latest.json"),
  "utf8",
);
const handoffFirstStageEvidenceSuggestionsMarkdownCopy = readFileSync(
  join(outputRoot, "go-live-handoff", "production-first-stage-evidence-suggestions.latest.md"),
  "utf8",
);
const handoffFirstStageEvidenceSuggestionsCsvCopy = readFileSync(
  join(outputRoot, "go-live-handoff", "production-first-stage-evidence-suggestions.csv"),
  "utf8",
);
const handoffProductionPersistenceEvidenceCopy = readFileSync(
  join(outputRoot, "go-live-handoff", "production-persistence-evidence.latest.json"),
  "utf8",
);
const handoffProductionRuntimeSmokeCopy = readFileSync(
  join(outputRoot, "go-live-handoff", "production-runtime-smoke.latest.json"),
  "utf8",
);
const handoffPrintChainCloseoutCopy = readFileSync(
  join(outputRoot, "go-live-handoff", "print-chain-closeout.latest.json"),
  "utf8",
);
const handoffPrintChainExecutionCopy = readFileSync(
  join(outputRoot, "go-live-handoff", "print-chain-execution.latest.json"),
  "utf8",
);
const handoffDriverRealDeviceExecutionCopy = readFileSync(
  join(outputRoot, "go-live-handoff", "driver-real-device-execution.latest.json"),
  "utf8",
);
const handoffDriverRealDeviceCloseoutCopy = readFileSync(
  join(outputRoot, "go-live-handoff", "driver-real-device-closeout.latest.json"),
  "utf8",
);
const ownerBriefCopy = readFileSync(join(outputRoot, "go-live-handoff", "v1-owner-decision-brief.latest.zh-CN.md"), "utf8");
const v1V2BriefCopy = readFileSync(join(outputRoot, "go-live-handoff", "v1-v2-scope-brief.latest.zh-CN.md"), "utf8");
const handoffUnblockPlanCopy = readFileSync(join(outputRoot, "go-live-handoff", "v1-unblock-plan.latest.zh-CN.md"), "utf8");
assert.match(handoffSummary, /ERP V1 上线交接包/);
assert.match(handoffSummary, /生产 env 准备报告/);
assert.match(handoffSummary, /生产 env 真实值校验/);
assert.match(handoffSummary, /11 项真实值 intake \/ env 校验阻塞/);
assert.match(handoffSummary, /最小补值清单/);
assert.match(handoffSummary, /ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL/);
assert.match(handoffSummary, /ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND/);
assert.match(handoffSummary, /安全 env 文件已准备，仍需填真实生产值/);
assert.match(handoffSummary, /PREPARED \/ 仍需填真实值/);
assert.match(handoffSummary, /负责人决策摘要/);
assert.match(handoffSummary, /V1\/V2 差异摘要/);
assert.match(handoffSummary, /生产环境 \/ 持久化第一阶段执行/);
assert.match(handoffSummary, /2\/7 步骤通过，仍有阻塞/);
assert.match(handoffSummary, /真实值 dry-run 预计 env 预检：ready \(10\/10\)，阻塞 0/);
assert.match(handoffSummary, /真实值 dry-run 预计 intake：15\/22 行已配置，必填缺失 0，任选组阻塞 0/);
assert.match(handoffSummary, /真实值 dry-run 最小阻塞补值：ready \(11\/11\)，缺 0/);
assert.match(handoffSummary, /真实值 dry-run 建议 \/ 可选补值：blocked \(0\/8\)，缺 8/);
assert.match(handoffSummary, /第一阶段现场证据建议/);
assert.match(handoffSummary, /7 项可建议自动接受，2 项只有部分自动化支撑，1 项仍需人工证据/);
assert.match(handoffSummary, /suggested CSV/);
assert.match(handoffSummary, /生产持久化留证/);
assert.match(handoffSummary, /3\/8 阶段通过/);
assert.match(handoffSummary, /生产 API runtime smoke/);
assert.match(handoffSummary, /2\/4 通过/);
assert.match(handoffSummary, /阶段 Closeout 报告/);
assert.match(handoffSummary, /真实打印链路阶段执行/);
assert.match(handoffSummary, /2\/3 步骤通过，仍有阻塞/);
assert.match(handoffSummary, /打印阶段负责人 closeout/);
assert.match(handoffSummary, /真实打印链路/);
assert.match(handoffSummary, /司机真机阶段执行/);
assert.match(handoffSummary, /1\/2 步骤通过，仍有阻塞/);
assert.match(handoffSummary, /司机真机/);
assert.match(handoffSummary, /最小解除阻塞清单/);
assert.match(handoffSummary, /V1 解除阻塞仍有 48 项待处理/);
assert.match(handoffManifest, /productionFirstStageExecution/);
assert.match(handoffManifest, /productionFirstStageEvidenceSuggestions/);
assert.match(handoffManifest, /productionPersistenceEvidence/);
assert.match(handoffManifest, /productionRuntimeSmoke/);
assert.match(handoffManifest, /productionEnvSetup/);
assert.match(handoffManifest, /productionEnvIntakeVerification/);
assert.match(handoffManifest, /printChainExecution/);
assert.match(handoffManifest, /printChainCloseout/);
assert.match(handoffManifest, /driverRealDeviceExecution/);
assert.match(handoffManifest, /driverRealDeviceCloseout/);
assert.match(handoffFirstStageExecutionCopy, /v1_production_first_stage_execution/);
assert.match(handoffFirstStageEvidenceSuggestionsCopy, /v1_production_first_stage_evidence_suggestions/);
assert.match(handoffFirstStageEvidenceSuggestionsMarkdownCopy, /V1 Production First-Stage Evidence Suggestions/);
assert.match(handoffFirstStageEvidenceSuggestionsCsvCopy, /AUTO:production-postgres-preflight:20260708T100000Z/);
assert.match(handoffProductionPersistenceEvidenceCopy, /v1_production_persistence_evidence/);
assert.match(handoffProductionPersistenceEvidenceCopy, /production-postgres-backup-restore-check/);
assert.match(handoffProductionRuntimeSmokeCopy, /v1_production_runtime_smoke/);
assert.match(handoffProductionRuntimeSmokeCopy, /runtime-production-profile/);
assert.match(handoffPrintChainExecutionCopy, /v1_print_chain_execution/);
assert.match(handoffPrintChainCloseoutCopy, /v1_print_chain_closeout/);
assert.match(handoffDriverRealDeviceExecutionCopy, /v1_driver_real_device_execution/);
assert.match(handoffDriverRealDeviceCloseoutCopy, /v1_driver_real_device_closeout/);
assert.match(handoffMinimumValuesFragmentTemplate, /ERP V1 production env minimum real values fragment template/);
assert.match(handoffMinimumValuesFragmentTemplate, /--values-env-file <secure-minimum-values-env-fragment>/);
assert.match(handoffMinimumValuesFragmentTemplate, /# ERP_V1_DATABASE_URL=<REPLACE_WITH_ERP_V1_DATABASE_URL>/);
assert.match(
  handoffMinimumValuesFragmentTemplate,
  /# ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL=<REPLACE_WITH_ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL>/,
);
assert.doesNotMatch(handoffMinimumValuesFragmentTemplate, /ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT/);
assert.match(handoffValuesFragmentTemplate, /ERP V1 production env real values fragment template/);
assert.match(handoffValuesFragmentTemplate, /--production-env-values-file <secure-values-env-fragment>/);
assert.match(handoffEnvTemplate, /ERP V1 production env fill template/);
assert.match(handoffEnvTemplate, /run-v1-production-env-file-audit\.mjs/);
assert.match(handoffEnvTemplate, /ERP_V1_PERSISTENCE_PROFILE=postgres/);
assert.match(handoffProductionEnvSetupCopy, /v1_production_env_setup/);
assert.match(handoffProductionEnvSetupMarkdownCopy, /V1 生产 env 准备报告/);
assert.match(handoffProductionEnvIntakeVerificationCopy, /v1_production_env_real_value_intake_verification/);
assert.match(handoffProductionEnvIntakeVerificationMarkdownCopy, /V1 生产 env 真实值 intake 校验/);
assert.match(handoffUnblockPlanCopy, /ERP V1 最小解除阻塞清单/);
assert.match(handoffUnblockPlanCopy, /先补生产环境和持久化/);
assert.match(ownerBriefCopy, /是否可以宣布 V1 完成：不可以/);
assert.match(v1V2BriefCopy, /ERP V1 \/ V2 差异摘要/);
assertNoSensitiveOutput(
  handoffSummary +
    handoffManifest +
    handoffMinimumValuesFragmentTemplate +
    handoffValuesFragmentTemplate +
    handoffEnvTemplate +
    handoffProductionEnvSetupCopy +
    handoffProductionEnvSetupMarkdownCopy +
    handoffProductionEnvIntakeVerificationCopy +
    handoffProductionEnvIntakeVerificationMarkdownCopy +
    handoffFirstStageExecutionCopy +
    handoffFirstStageEvidenceSuggestionsCopy +
    handoffFirstStageEvidenceSuggestionsMarkdownCopy +
    handoffFirstStageEvidenceSuggestionsCsvCopy +
    handoffProductionPersistenceEvidenceCopy +
    handoffProductionRuntimeSmokeCopy +
    handoffPrintChainCloseoutCopy +
    handoffPrintChainExecutionCopy +
    handoffDriverRealDeviceExecutionCopy +
    handoffDriverRealDeviceCloseoutCopy +
    ownerBriefCopy +
    v1V2BriefCopy +
    handoffUnblockPlanCopy,
);

const csvRun = await runNode([
  suiteScript,
  "--release-candidate-json",
  releaseJsonPath,
  "--release-candidate-markdown",
  releaseMarkdownPath,
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
  "--field-evidence-manifest",
  fieldManifestPath,
  "--field-evidence-intake-csv",
  partialCsvPath,
  "--field-evidence-signoff-boundary-csv",
  signoffBoundaryCsvPath,
  "--field-evidence-draft-output",
  draftManifestPath,
  "--output-root",
  csvOutputRoot,
  "--json",
]);
assert.equal(csvRun.status, 0, runFailureMessage("go-live suite should apply filled intake CSV into a draft manifest", csvRun));
const csvResult = JSON.parse(csvRun.stdout);
assert.equal(csvResult.status, "blocked_go_live_suite_written");
assert.equal(csvResult.ready, false);
assert.equal(csvResult.canDeclareV1Complete, false);
assert.equal(csvResult.steps.length, 8);
assert.equal(csvResult.steps[0].key, "fieldEvidenceApply");
assert.equal(csvResult.steps[0].status, "blocked_draft_written");
assert.equal(csvResult.steps[0].summary.appliedRowCount, 3);
assert.equal(csvResult.steps[0].summary.appliedEvidenceRowCount, 1);
assert.equal(csvResult.steps[0].summary.appliedSignoffRowCount, 1);
assert.equal(csvResult.steps[0].summary.appliedBoundaryRowCount, 1);
assert.equal(csvResult.steps[0].summary.requiredEvidenceItems, "1/40");
assert.equal(csvResult.steps[0].summary.signoffs, "1/6");
assert.equal(csvResult.steps[0].summary.boundary, "confirmed");
assert.equal(csvResult.summary.fieldEvidence, "V1 现场证据清单仍阻塞：证据 1/40，签字 1/6");
assert.equal(csvResult.summary.releaseCandidate, "0/4 发布门禁通过");
assert.equal(csvResult.safeguards.sourceManifestMutated, false);
assert.equal(csvResult.safeguards.releaseCandidateRefreshRecommendedAfterDraftApply, true);
assert.ok(existsSync(draftManifestPath), "draft manifest was not written by suite CSV apply");
const sourceManifestAfterCsvSuite = JSON.parse(readFileSync(fieldManifestPath, "utf8"));
const draftManifest = JSON.parse(readFileSync(draftManifestPath, "utf8"));
assert.equal(sourceManifestAfterCsvSuite.evidenceGroups[0].items[0].status, "pending", "source manifest should not be mutated by suite");
assert.equal(draftManifest.evidenceGroups[0].items[0].status, "passed");
assert.equal(draftManifest.evidenceGroups[0].items[0].evidenceRef, "EVT-PG-001");
assert.equal(draftManifest.signoffs.find((signoff) => signoff.role === "办公室").status, "signed");
assert.equal(draftManifest.v1V2BoundaryConfirmed.status, "confirmed");
const csvSuiteSummary = readGeneratedFile(csvResult.files.summaryMarkdown);
assert.match(csvSuiteSummary, /现场 CSV 回填/);
assert.match(csvSuiteSummary, /签字 \/ 边界 CSV：已应用/);
assert.match(csvSuiteSummary, /release-candidate 使用的是现有 JSON/);
assert.match(readFileSync(join(csvOutputRoot, "field-evidence-intake", "intake-summary.zh-CN.md"), "utf8"), /必填证据完成：1\/40/);
assert.match(readFileSync(join(csvOutputRoot, "field-evidence-intake", "intake-summary.zh-CN.md"), "utf8"), /负责人签字完成：1\/6/);
assert.doesNotMatch(csvRun.stdout + csvRun.stderr + csvSuiteSummary, /办公室负责人|总负责人/);
assertNoSensitiveOutput(csvRun.stdout + csvRun.stderr + csvSuiteSummary);

const server = createApiServer({ allowLocalFixture: true });
try {
  await listen(server);
  const baseUrl = `${getTestServerBaseUrl(server)}/api`;
  writeFileSync(
    staleProductionEnvSetupJsonPath,
    `${JSON.stringify({ ...buildProductionEnvSetup(productionEnvSetupEnvFilePath), checkedAt: "2000-01-01T00:00:00.000Z" }, null, 2)}\n`,
  );
  const staleSetupRefreshRun = await runNode([
    suiteScript,
    "--refresh-release-candidate",
    "--use-production-env-setup-env-file",
    "--api-base-url",
    baseUrl,
    "--production-env-setup-json",
    staleProductionEnvSetupJsonPath,
    "--output-root",
    join(tempRoot, "suite-with-stale-setup"),
    "--json",
  ]);
  assert.equal(
    staleSetupRefreshRun.status,
    1,
    runFailureMessage("stale production env setup report should block suite refresh", staleSetupRefreshRun),
  );
  const staleSetupRefreshError = JSON.parse(staleSetupRefreshRun.stdout);
  assert.match(staleSetupRefreshError.error.message, /setup report is stale/);
  assertNoSensitiveOutput(staleSetupRefreshRun.stdout + staleSetupRefreshRun.stderr);

  const csvRefreshRun = await runNode([
    suiteScript,
    "--refresh-release-candidate",
    "--use-production-env-setup-env-file",
    "--api-base-url",
    baseUrl,
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
    "--field-evidence-manifest",
    fieldManifestPath,
    "--field-evidence-intake-csv",
    partialCsvPath,
    "--field-evidence-signoff-boundary-csv",
    signoffBoundaryCsvPath,
    "--field-evidence-draft-output",
    refreshDraftManifestPath,
    "--output-root",
    csvRefreshOutputRoot,
    "--json",
  ]);
  assert.equal(
    csvRefreshRun.status,
    0,
    runFailureMessage("go-live suite should refresh release candidate after applying CSV draft", csvRefreshRun),
  );
  const csvRefreshResult = JSON.parse(csvRefreshRun.stdout);
  assert.equal(csvRefreshResult.status, "blocked_go_live_suite_written");
  assert.equal(csvRefreshResult.ready, false);
  assert.equal(csvRefreshResult.canDeclareV1Complete, false);
  assert.equal(csvRefreshResult.steps.length, 8);
  assert.equal(csvRefreshResult.steps[0].key, "fieldEvidenceApply");
  assert.equal(csvRefreshResult.steps[1].key, "releaseCandidate");
  assert.equal(csvRefreshResult.steps[0].summary.requiredEvidenceItems, "1/40");
  assert.equal(csvRefreshResult.steps[0].summary.signoffs, "1/6");
  assert.equal(csvRefreshResult.steps[0].summary.boundary, "confirmed");
  assert.equal(csvRefreshResult.steps[1].summary.fieldEvidence, "V1 现场证据清单仍阻塞：证据 1/40，签字 1/6");
  assert.equal(csvRefreshResult.summary.fieldEvidence, "V1 现场证据清单仍阻塞：证据 1/40，签字 1/6");
  assert.equal(csvRefreshResult.safeguards.sourceManifestMutated, false);
  assert.equal(csvRefreshResult.safeguards.releaseCandidateRefreshRecommendedAfterDraftApply, false);
  const csvRefreshSuite = JSON.parse(readGeneratedFile(csvRefreshResult.files.latestJson));
  assert.equal(csvRefreshSuite.sources.fieldEvidenceDraftApplied, true);
  assert.equal(csvRefreshSuite.sources.fieldEvidenceSignoffBoundaryCsvApplied, true);
  assert.equal(csvRefreshSuite.sources.releaseCandidateRefreshedAfterFieldEvidenceApply, true);
  assert.equal(csvRefreshSuite.sources.releaseCandidateEnvFileSource, "production_env_setup");
  assert.equal(csvRefreshSuite.sources.releaseCandidateEnvFileFromProductionSetup, true);
  assert.equal(csvRefreshSuite.sources.releaseCandidateEnvFileCount, 1);
  assert.match(csvRefreshSuite.sources.releaseCandidateEnvFileSummary, /生产 env setup/);
  assert.equal(csvRefreshSuite.safeguards.releaseCandidateRefreshRecommendedAfterDraftApply, false);
  assert.equal(csvRefreshSuite.safeguards.releaseCandidateEnvFileValuesIncluded, false);
  assert.equal(csvRefreshSuite.safeguards.releaseCandidateEnvFileFromProductionSetup, true);
  const refreshedReleaseCandidate = JSON.parse(readFileSync(join(csvRefreshOutputRoot, "release-candidate", "latest.json"), "utf8"));
  assert.equal(refreshedReleaseCandidate.summary.fieldEvidence, "V1 现场证据清单仍阻塞：证据 1/40，签字 1/6");
  assert.equal(refreshedReleaseCandidate.envFileAudit?.included, true);
  assert.equal(refreshedReleaseCandidate.envFileAudit?.ready, true);
  const csvRefreshSummary = readGeneratedFile(csvRefreshResult.files.summaryMarkdown);
  assert.match(csvRefreshSummary, /现场 CSV 回填/);
  assert.match(csvRefreshSummary, /签字 \/ 边界 CSV：已应用/);
  assert.match(csvRefreshSummary, /Release candidate env 来源：已复用生产 env setup 报告中的安全 env 文件；文件数 1/);
  assert.doesNotMatch(csvRefreshSummary, /release-candidate 使用的是现有 JSON/);
  assert.doesNotMatch(csvRefreshRun.stdout + csvRefreshRun.stderr + csvRefreshSummary, /办公室负责人|总负责人/);
  assertNoSensitiveOutput(csvRefreshRun.stdout + csvRefreshRun.stderr + csvRefreshSummary);
} finally {
  await closeServer(server, { forceAfterMs: 1_000 });
}

const missingRun = await runNode([
  suiteScript,
  "--release-candidate-json",
  missingReleaseJsonPath,
  "--field-evidence-manifest",
  fieldManifestPath,
  "--output-root",
  join(tempRoot, "missing-suite"),
  "--json",
]);
assert.equal(missingRun.status, 1, "missing release candidate should fail");
const missingResult = JSON.parse(missingRun.stdout);
assert.equal(missingResult.scope, "v1_go_live_suite");
assert.equal(missingResult.status, "error");
assert.match(missingResult.error.message, /release candidate JSON is missing/);
assertNoSensitiveOutput(missingRun.stdout + missingRun.stderr);

console.log(
  "V1 go-live suite check passed: release candidate orchestration, CSV draft refresh, downstream packs, stage execution / closeout handoff copies, canonical latest sync, missing release handling, and redaction are covered.",
);

function buildBlockedReleaseCandidate() {
  return {
    scope: "v1_release_candidate_check",
    status: "blocked",
    ready: false,
    generatedAt: "2026-07-04T12:00:00.000+08:00",
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
      checkedAt: "2026-07-04T12:00:00.000+08:00",
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
            "ERP_V1_DATABASE_URL or DATABASE_URL",
            "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
          ],
          configuredVariableCount: 0,
          totalVariableCount: 3,
          missingVariables: [
            "ERP_V1_PERSISTENCE_PROFILE=postgres",
            "ERP_V1_DATABASE_URL or DATABASE_URL",
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
            "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL",
            "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
          ],
          placeholderVariableCount: 0,
          placeholderVariables: [],
          nextAction: "补齐专用恢复验证库连接，并显式配置恢复重置授权开关。",
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
        status: "pending",
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
  };
}

function buildProductionEnvSetup(envFilePath = ".erp-local-storage/v1-production-env/secure-prod.env") {
  return {
    scope: "v1_production_env_setup",
    status: "prepared",
    ready: false,
    setupReady: true,
    checkedAt: new Date(Date.now() + 60_000).toISOString(),
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
      path: envFilePath,
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
        label: "附件对象存储环境变量",
        ownerRole: "技术/管理",
        severity: "blocking",
        status: "blocked",
        variableKey: "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT",
        sourceSystem: "附件对象存储 bucket",
        expectedValueType: "http/https URL",
        configured: false,
        detail: "必填变量尚未在安全 env 文件中配置。",
        nextAction: "补齐附件对象存储 endpoint、bucket、access key 和 secret key。",
      },
    ],
    warningFindings: [
      {
        type: "variable_row",
        label: "V1 readiness 验收账号环境变量",
        ownerRole: "技术/办公室",
        severity: "warning",
        status: "warning",
        variableKey: "ERP_V1_READINESS_OPERATOR_ID",
        sourceSystem: "生产 API / 办公室与司机验收账号",
        expectedValueType: "生产账号 ID",
        configured: false,
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
    ["postgres-restore-validation-env", "PostgreSQL 恢复验证库环境变量", "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL", "PostgreSQL 恢复验证库", "PostgreSQL 连接串", "补齐专用恢复验证库连接串，确认不是生产源库。"],
    ["attachment-object-storage-endpoint", "附件对象存储 endpoint", "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT", "附件对象存储 bucket", "http/https URL", "补齐附件对象存储 endpoint。"],
    ["attachment-object-storage-bucket", "附件对象存储 bucket", "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET", "附件对象存储 bucket", "bucket 名称", "补齐附件对象存储 bucket。"],
    ["attachment-object-storage-access-key", "附件对象存储 access key", "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID", "附件对象存储 bucket", "访问密钥 ID", "补齐附件对象存储 access key。"],
    ["attachment-object-storage-secret", "附件对象存储 secret", "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY", "附件对象存储 bucket", "密钥 / token", "补齐附件对象存储 secret。"],
    ["print-command-bridge-command", "打印 command bridge 命令", "ERP_SYSTEM_PRINTER_COMMAND", "打印主机", "命令路径", "补齐打印 command bridge 命令。"],
    ["print-command-bridge-allowlist", "打印 command bridge allowlist", "ERP_SYSTEM_PRINTER_ALLOWLIST", "打印主机", "打印机 ID 列表", "补齐允许提交的系统打印机 ID。"],
    ["print-command-bridge-spool-dir", "打印 command bridge spool 目录", "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR", "打印主机", "spool 目录", "补齐打印 spool 目录。"],
    ["cups-allowlist", "CUPS 队列 allowlist", "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST", "CUPS / 打印主机", "CUPS 队列列表", "补齐 CUPS 队列 allowlist。"],
    ["cups-status-command", "CUPS 状态命令", "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND", "CUPS / 打印主机", "状态命令路径", "补齐 CUPS 状态命令。"],
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
    ...variableRows.map(([itemKey, label, variableKey, sourceSystem, expectedValueType, nextAction]) => ({
      type: "variable_row",
      itemKey,
      label,
      ownerRole: "技术/管理",
      severity: "blocking",
      status: "blocked",
      variableKey,
      sourceSystem,
      expectedValueType,
      configured: false,
      detail: "必填变量尚未在安全 env 文件中配置。",
      nextAction,
    })),
  ];
}

function buildProductionEnvSetupEnvFile() {
  const values = {
    ERP_V1_PERSISTENCE_PROFILE: "postgres",
    ERP_V1_DATABASE_URL: "postgres://erp_user:DO_NOT_LEAK_ENV_SETUP_SECRET@prod-db.local:5432/erp",
    ERP_V1_FILE_STORAGE_PROFILE: "object_storage",
    ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER: "s3_compatible",
    ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT: "https://oss-prod.example.invalid",
    ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET: "erp-prod-attachments",
    ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID: "DO_NOT_LEAK_ENV_SETUP_SECRET_KEY",
    ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY: "DO_NOT_LEAK_ENV_SETUP_SECRET_VALUE",
    ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX: "prod-attachments",
    ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT: "https://oss-prod.example.invalid",
    ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET: "erp-prod-statements",
    ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID: "DO_NOT_LEAK_ENV_SETUP_SECRET_EXPORT_KEY",
    ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY: "DO_NOT_LEAK_ENV_SETUP_SECRET_EXPORT_VALUE",
    ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX: "prod-statements",
    ERP_SYSTEM_PRINTER_ENABLED: "true",
    ERP_SYSTEM_PRINTER_ADAPTER: "command_bridge",
    ERP_SYSTEM_PRINTER_COMMAND: "/usr/local/bin/erp-print-bridge",
    ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON: JSON.stringify(["--print-job-id", "{printJobId}"]),
    ERP_SYSTEM_PRINTER_ALLOWLIST: "PRN-LABEL-A,PRN-DOT-A",
    ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR: "/var/spool/erp-secret",
    ERP_PRINT_COMMAND_BRIDGE_MODE: "cups_lp",
    ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST: "标签机A,针式打印机A",
    ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER: "标签机A",
    ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND: "/usr/bin/lpstat-secret",
    ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON: JSON.stringify(["-p", "{cupsPrinterName}"]),
    ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS: "5000",
    ERP_V1_READINESS_API_BASE_URL: "http://127.0.0.1:8787/api",
    ERP_V1_READINESS_OPERATOR_ID: "U-OFFICE-A",
    ERP_V1_READINESS_DRIVER_OPERATOR_ID: "U-DRIVER-A",
    ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR: ".erp-local-storage/checks/v1-go-live-suite/field-acceptance",
    ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL: "http://127.0.0.1:8787/api",
  };
  return [
    "# V1 go-live suite production env setup fixture",
    ...Object.entries(values).map(([key, value]) => `${key}='${String(value).replace(/'/g, "'\\''")}'`),
    "",
  ].join("\n");
}

function buildBlockedProductionFirstStageExecution() {
  return {
    scope: "v1_production_first_stage_execution",
    status: "blocked",
    ready: false,
    checkedAt: "2026-07-04T12:30:00.000+08:00",
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

function buildPrintChainCloseout() {
  return {
    scope: "v1_print_chain_closeout",
    status: "ready",
    ready: true,
    checkedAt: "2026-07-04T13:00:00.000+08:00",
    summary: {
      label: "8/8 通过",
      passedCount: 8,
      totalCount: 8,
      blockingCount: 0,
    },
    stages: [
      {
        key: "print-readiness",
        label: "打印 readiness",
        status: "passed",
        ready: true,
        detail: "打印门禁已通过。",
        nextAction: "",
      },
      {
        key: "print-hardware-evidence",
        label: "真实打印现场证据",
        status: "passed",
        ready: true,
        detail: "标签样张、针式样张、纸张对位、条码扫码和作废重打证据完整。",
        nextAction: "",
      },
    ],
    blockingStages: [],
    safeguards: {
      physicalPrinterCalled: false,
      rawCommandValueExposed: false,
      localPathExposed: false,
      declaresFullV1Complete: false,
    },
    nextActions: ["打印链路 closeout 已通过，继续司机真机和真实订单试跑。"],
  };
}

function buildPrintChainExecution() {
  return {
    scope: "v1_print_chain_execution",
    status: "blocked",
    ready: false,
    checkedAt: "2026-07-04T13:03:00.000+08:00",
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
        command: "node -- scripts/run-cups-queue-preflight.mjs --status-command <cups-status-command> --json",
        exitCode: 0,
        evidence: {
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
    checkedAt: "2026-07-04T13:05:00.000+08:00",
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
        nextActions: ["纸质包裹标签原生扫码仍未通过，先补司机真机扫码留证。"],
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
        nextActions: ["纸质包裹标签原生扫码仍未通过，先补司机真机扫码留证。"],
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
    checkedAt: "2026-07-04T13:10:00.000+08:00",
    summary: {
      label: "6/8 通过",
      passedCount: 6,
      totalCount: 8,
      blockingCount: 1,
    },
    stages: [
      {
        key: "driver-readiness",
        label: "司机真机 readiness",
        status: "passed",
        ready: true,
        detail: "真实手机登录、定位和导航证据已通过。",
        nextAction: "",
      },
      {
        key: "paper-label-native-scan",
        label: "纸质标签原生扫码",
        status: "blocked",
        ready: false,
        detail: "纸质包裹标签原生扫码仍未通过。",
        nextAction: "用司机真机扫描真实纸质包裹标签并回填证据。",
      },
    ],
    blockingStages: [
      {
        key: "paper-label-native-scan",
        label: "纸质标签原生扫码",
        status: "blocked",
        ready: false,
        detail: "纸质包裹标签原生扫码仍未通过。",
        nextAction: "用司机真机扫描真实纸质包裹标签并回填证据。",
      },
    ],
    safeguards: {
      cameraPermissionRequested: false,
      navigationOpened: false,
      driverDeliveryStateMutated: false,
      localPathExposed: false,
      declaresFullV1Complete: false,
    },
    nextActions: ["补司机真机纸质标签原生扫码证据后重新运行司机真机 closeout。"],
  };
}

function buildBlockedFieldEvidenceManifest() {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  manifest.environment.releaseCandidateReport = releaseMarkdownPath;
  return manifest;
}

function buildCsv(rows) {
  const headers = [
    "groupKey",
    "groupLabel",
    "ownerRole",
    "itemKey",
    "itemLabel",
    "required",
    "status",
    "evidenceRefFilled",
    "onsiteStatus",
    "onsiteEvidenceRef",
    "onsiteNotes",
  ];
  return `${[headers, ...rows.map((row) => headers.map((header) => row[header] || ""))]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n")}\n`;
}

function buildSignoffBoundaryCsv(rows) {
  const headers = [
    "recordType",
    "role",
    "label",
    "required",
    "status",
    "filledName",
    "filledTime",
    "onsiteStatus",
    "onsiteSigner",
    "onsiteSignedAt",
    "onsiteConfirmedBy",
    "onsiteConfirmedAt",
    "onsiteNotes",
  ];
  return `${[headers, ...rows.map((row) => headers.map((header) => row[header] || ""))]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n")}\n`;
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("V1 go-live suite check timed out after 60000ms"));
    }, 60000);
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

function readGeneratedFile(path) {
  const fullPath = join(process.cwd(), path);
  assert.ok(existsSync(fullPath), `generated file is missing: ${path}`);
  return readFileSync(fullPath, "utf8");
}

function runFailureMessage(message, result) {
  return `${message}; actual=${result.status}; stdout=${result.stdout || "<empty>"}; stderr=${result.stderr || "<empty>"}`;
}

function assertNoSensitiveOutput(output) {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(output, pattern, `output matched forbidden sensitive pattern ${pattern}`);
  }
}
