import assert from "node:assert/strict";
import { createApiServer } from "../server/apiServer.mjs";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  v1PersistenceRepositoryObjectKeys,
  v1PersistenceStorageObjectKeys,
} from "../server/v1PersistenceProfile.mjs";
import {
  applyOfficeV1ProductionFirstStageValues,
  generateOfficeV1FieldEvidenceDraftManifest,
  normalizeV1GoLiveStatusForClient,
  precheckOfficeV1AttachmentRetention,
  precheckOfficeV1DriverReadiness,
  precheckOfficeV1Persistence,
  precheckOfficeV1ProductionGoLive,
  precheckOfficeV1ProductionEnv,
  precheckOfficeV1ProductionEnvIntake,
  precheckOfficeV1ProductionEnvFileAudit,
  precheckOfficeV1ProductionEnvFilePreview,
  precheckOfficeV1ProductionFirstStageValuesDryRun,
  precheckOfficeV1ReleaseCandidateRefresh,
  precheckOfficeV1RuntimeReadiness,
  precheckOfficeV1V2Boundary,
  refreshOfficeV1V2ScopeBrief,
  refreshOfficeV1ReleaseCandidate,
  runOfficeV1ProductionEnvSetup,
  runOfficeV1ProductionFirstStageExecution,
  runOfficeV1ProductionPersistenceEvidence,
  validateOfficeV1FieldEvidenceDraftManifest,
} from "../src/services/officeV1GoLiveStatusApiClient.js";

const originalProductionEnvFileAuditPaths = process.env.ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS;
const originalProductionEnvFile = process.env.ERP_V1_PRODUCTION_ENV_FILE;
const originalV1EnvFile = process.env.ERP_V1_ENV_FILE;
const originalProductionEnvValuesFile = process.env.ERP_V1_PRODUCTION_ENV_VALUES_FILE;
const originalProductionEnvMinimumValuesFile = process.env.ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE;
const originalProductionEnvValuesFragmentFile = process.env.ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE;
const originalProductionEnvValuesApplyEnabled = process.env.ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED;
const expectedPersistenceRepositoryCount =
  v1PersistenceRepositoryObjectKeys.length + v1PersistenceStorageObjectKeys.length;
const server = createApiServer();

try {
  await listen(server);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const response = await fetch(`${baseUrl}/api/system/v1-go-live-status`, {
    headers: {
      "x-erp-user-id": "U-MANAGER-A",
    },
  });
  assert.equal(response.status, 200, "/api/system/v1-go-live-status should return 200");
  const json = await response.json();

  assert.equal(json.version, "p0-v1-go-live-status-v1");
  assert.equal(json.scope, "v1_go_live_status");
  assert.equal(json.status, "blocked");
  assert.equal(json.ready, false);
  assert.equal(json.canDeclareV1Complete, false);
  assert.equal(json.summary.requirements, "85-90%");
  assert.equal(json.summary.p0Prototype, "97-98%");
  assert.equal(json.summary.v1Readiness, "80-83%");
  assert.match(json.summary.releaseGate, /0\/4/);
  assert.equal(json.summary.onsiteTaskCount, 53);
  assert.equal(json.summary.v2DifferenceCount, 17);
  assert.equal(json.releaseCandidate.status, "blocked");
  assert.equal(json.releaseCandidate.ready, false);
  assert.equal(json.releaseCandidate.summary.totalGateCount, 4);
  assert.ok(json.releaseCandidate.gates.some((gate) => gate.label === "运行时 V1 readiness"));
  assert.equal(json.ownerDecisionBrief.status, "blocked_owner_brief_written");
  assert.equal(json.ownerDecisionBrief.ready, false);
  assert.equal(json.ownerDecisionBrief.available, true);
  assert.equal(json.ownerDecisionBrief.canDeclareV1Complete, false);
  assert.equal(json.ownerDecisionBrief.decision.label, "不能宣布 V1 已完成");
  assert.match(json.ownerDecisionBrief.decision.recommendation, /先补齐生产环境/);
  assert.match(json.ownerDecisionBrief.decision.ownerQuestion, /是否继续按阻塞清单补齐后再评审/);
  assert.equal(json.ownerDecisionBrief.completion.releaseGate, "0/4 发布门禁通过");
  assert.equal(json.ownerDecisionBrief.completion.runtimeReadiness, "5/11 通过");
  assert.equal(json.ownerDecisionBrief.completion.onsiteTaskCount, 53);
  assert.match(json.ownerDecisionBrief.completion.fieldEvidence, /证据 0\/34，签字 0\/6/);
  assert.equal(json.ownerDecisionBrief.summary.unfinishedItemCount, 12);
  assert.equal(json.ownerDecisionBrief.summary.shownUnfinishedItemCount, 8);
  assert.equal(json.ownerDecisionBrief.summary.releaseGateCount, 4);
  assert.equal(json.ownerDecisionBrief.summary.doneHighlightCount, 4);
  assert.equal(json.ownerDecisionBrief.summary.nextActionCount, 8);
  assert.equal(json.ownerDecisionBrief.summary.shownNextActionCount, 8);
  assert.equal(json.ownerDecisionBrief.summary.topBlockerCount, 10);
  assert.equal(json.ownerDecisionBrief.summary.shownTopBlockerCount, 5);
  assert.ok(json.ownerDecisionBrief.doneHighlights.some((item) => item.includes("P0 原型 / 代码")));
  assert.ok(json.ownerDecisionBrief.unfinishedItems.some((item) => item.label === "现场证据和签字"));
  assert.ok(json.ownerDecisionBrief.releaseGates.some((gate) => gate.label === "生产环境变量预检" && gate.status === "blocked"));
  assert.ok(json.ownerDecisionBrief.nextActions.some((item) => item.includes("生产环境变量预检")));
  assert.ok(json.ownerDecisionBrief.nextActions.some((item) => item.includes("现场证据 manifest")));
  assert.ok(
    json.ownerDecisionBrief.topBlockers.some((item) =>
      item.gate === "生产环境变量预检" &&
      item.label === "统一 V1 持久化 profile" &&
      item.status === "pending"
    ),
  );
  assert.ok(json.ownerDecisionBrief.topBlockers.some((item) => item.label === "PostgreSQL 恢复验证库环境变量"));
  assert.equal(json.ownerDecisionBrief.safeguards.nonMutating, true);
  assert.equal(json.ownerDecisionBrief.safeguards.rawOwnerDecisionBriefIncluded, false);
  assert.equal(json.ownerDecisionBrief.safeguards.sourceArtifactIncluded, false);
  assert.equal(json.ownerDecisionBrief.safeguards.artifactPathExposed, false);
  assert.equal(json.ownerDecisionBrief.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(json.ownerDecisionBrief.safeguards.rawSignersIncluded, false);
  assert.equal(json.ownerDecisionBrief.safeguards.environmentValuesIncluded, false);
  assert.equal(json.ownerDecisionBrief.safeguards.commandValuesIncluded, false);
  assert.equal(json.ownerDecisionBrief.safeguards.rawTopBlockersIncluded, false);
  assert.equal(json.completionAudit.status, "blocked");
  assert.equal(json.completionAudit.ready, false);
  assert.equal(json.completionAudit.canDeclareV1Complete, false);
  assert.equal(json.completionAudit.summary.criteriaCount, 7);
  assert.equal(json.completionAudit.summary.passedCriteriaCount, 0);
  assert.equal(json.completionAudit.summary.blockingCriteriaCount, 7);
  assert.equal(json.completionAudit.summary.blockingCriteriaLabel, "7/7");
  assert.equal(json.completionAudit.summary.onsiteTaskCount, 53);
  assert.equal(json.completionAudit.summary.v2DifferenceCount, 17);
  assert.equal(json.completionAudit.criteria.length, 7);
  assert.ok(json.completionAudit.criteria.some((item) => item.key === "release_candidate" && item.evidenceLabel === "0/4 发布门禁通过"));
  assert.ok(json.completionAudit.criteria.some((item) => item.key === "field_evidence" && item.evidenceLabel === "0/34"));
  assert.ok(json.completionAudit.criteria.some((item) => item.key === "owner_signoff" && item.evidenceLabel === "0/6"));
  assert.ok(json.completionAudit.criteria.some((item) => item.key === "v1_v2_boundary" && item.ready === false));
  assert.ok(
    json.completionAudit.criteria.every((item) => Array.isArray(item.proofRequirements) && item.proofRequirements.length > 0),
    "each completion audit criterion should expose proof requirements",
  );
  assert.ok(
    json.completionAudit.criteria
      .find((item) => item.key === "production_env")
      ?.proofRequirements.some((item) => item.includes("生产 env 文件安全审计")),
    "production env completion criterion should name the env-file audit proof",
  );
  assert.ok(
    json.completionAudit.criteria.every((item) => Array.isArray(item.proofGaps) && item.proofGaps.length > 0),
    "each blocked completion audit criterion should expose current proof gaps",
  );
  const productionEnvCriterion = json.completionAudit.criteria.find((item) => item.key === "production_env");
  const fieldEvidenceCriterion = json.completionAudit.criteria.find((item) => item.key === "field_evidence");
  const ownerSignoffCriterion = json.completionAudit.criteria.find((item) => item.key === "owner_signoff");
  assert.equal(productionEnvCriterion?.proofGaps.length, 4);
  assert.ok(productionEnvCriterion?.proofGapTotalCount >= 5);
  assert.equal(productionEnvCriterion?.proofGapShownCount, 4);
  assert.equal(productionEnvCriterion?.proofGapCountLabel, `4/${productionEnvCriterion?.proofGapTotalCount}`);
  assert.equal(fieldEvidenceCriterion?.proofGaps.length, 4);
  assert.equal(fieldEvidenceCriterion?.proofGapTotalCount, 6);
  assert.equal(fieldEvidenceCriterion?.proofGapShownCount, 4);
  assert.equal(fieldEvidenceCriterion?.proofGapCountLabel, "4/6");
  assert.equal(ownerSignoffCriterion?.proofGaps.length, 4);
  assert.equal(ownerSignoffCriterion?.proofGapTotalCount, 6);
  assert.equal(ownerSignoffCriterion?.proofGapShownCount, 4);
  assert.equal(ownerSignoffCriterion?.proofGapCountLabel, "4/6");
  assert.ok(
    productionEnvCriterion?.proofGaps.some((gap) => gap.includes("统一 V1 持久化 profile")),
    "production env completion criterion should show the current persistence profile gap",
  );
  assert.ok(
    fieldEvidenceCriterion?.proofGaps.some((gap) => gap.includes("生产持久化")),
    "field evidence completion criterion should show the current missing evidence group",
  );
  assert.equal(json.completionAudit.blockingCriteria.length, 7);
  assert.equal(json.completionAudit.v2Boundary.v2DifferenceCount, 17);
  assert.match(json.completionAudit.v2Boundary.nextAction, /V2 差异不能替代 V1 完成条件/);
  assert.equal(json.completionAudit.safeguards.rawReleaseCandidateIncluded, false);
  assert.equal(json.completionAudit.safeguards.rawOwnerDecisionBriefIncluded, false);
  assert.equal(json.completionAudit.safeguards.rawV1V2ScopeIncluded, false);
  assert.equal(json.completionAudit.safeguards.rawCsvIncluded, false);
  assert.equal(json.runtimeReadinessBlockers.status, "blocked");
  assert.equal(json.runtimeReadinessBlockers.ready, false);
  assert.equal(json.runtimeReadinessBlockers.available, true);
  assert.equal(json.runtimeReadinessBlockers.summary.passedCount, 5);
  assert.equal(json.runtimeReadinessBlockers.summary.totalCount, 11);
  assert.equal(json.runtimeReadinessBlockers.summary.blockingCount, 6);
  assert.equal(json.runtimeReadinessBlockers.summary.shownBlockingCount, 6);
  assert.equal(json.runtimeReadinessBlockers.blockers.length, 6);
  assert.ok(json.runtimeReadinessBlockers.blockers.some((item) => item.key === "system-v1-persistence" && item.label === "系统 V1 持久化门禁"));
  assert.ok(json.runtimeReadinessBlockers.blockers.some((item) => item.key === "attachment-v1-readiness" && item.label === "附件 V1 留档门禁"));
  assert.ok(json.runtimeReadinessBlockers.blockers.some((item) => item.key === "print-spool-diagnostics" && item.label === "打印 spool 状态回读"));
  assert.ok(json.runtimeReadinessBlockers.blockers.some((item) => item.key === "print-cups-diagnostics" && item.label === "CUPS 队列预检"));
  assert.ok(json.runtimeReadinessBlockers.blockers.some((item) => item.key === "print-v1-readiness" && item.label === "打印 V1 上线门禁"));
  assert.ok(json.runtimeReadinessBlockers.blockers.some((item) => item.key === "driver-v1-readiness" && item.label === "司机端 V1 真机门禁"));
  assert.equal(json.runtimeReadinessBlockers.safeguards.nonMutating, true);
  assert.equal(json.runtimeReadinessBlockers.safeguards.rawRuntimeReadinessReportIncluded, false);
  assert.equal(json.runtimeReadinessBlockers.safeguards.artifactPathExposed, false);
  assert.equal(json.runtimeReadinessBlockers.safeguards.environmentValuesIncluded, false);
  assert.equal(json.runtimeReadinessBlockers.safeguards.commandValuesIncluded, false);
  assert.equal(json.fieldAcceptanceReport.status, "blocked");
  assert.equal(json.fieldAcceptanceReport.ready, false);
  assert.equal(json.fieldAcceptanceReport.available, true);
  assert.equal(json.fieldAcceptanceReport.summary.passedCount, 5);
  assert.equal(json.fieldAcceptanceReport.summary.totalCount, 11);
  assert.equal(json.fieldAcceptanceReport.summary.blockingCount, 6);
  assert.equal(json.fieldAcceptanceReport.summary.shownBlockingCount, 6);
  assert.ok(json.fieldAcceptanceReport.modules.some((item) => item.label === "生产持久化" && item.ready === false));
  assert.ok(json.fieldAcceptanceReport.modules.some((item) => item.label === "API / OpenAPI 合同" && item.ready === true));
  assert.ok(json.fieldAcceptanceReport.blockingCriteria.some((item) => item.label === "打印 V1 上线门禁" && item.blocking === true));
  assert.ok(json.fieldAcceptanceReport.blockingCriteria.some((item) => item.label === "司机端 V1 真机门禁" && item.nextAction.includes("真实 Android")));
  assert.ok(json.fieldAcceptanceReport.requiredFieldEvidence.some((item) => item.label === "打印现场验收" && item.requiredCount === 2));
  assert.ok(json.fieldAcceptanceReport.remainingV1Risks.some((item) => item.includes("本地 / 内存模式")));
  assert.ok(json.fieldAcceptanceReport.nextActions.some((item) => item.includes("CUPS 队列预检")));
  assert.equal(json.fieldAcceptanceReport.safeguards.rawFieldAcceptanceReportIncluded, false);
  assert.equal(json.fieldAcceptanceReport.safeguards.artifactPathExposed, false);
  assert.equal(json.fieldAcceptanceReport.safeguards.localPathExposed, false);
  assert.equal(json.fieldAcceptanceReport.safeguards.printCommandExposed, false);
  assert.equal(json.fieldAcceptanceReport.safeguards.spoolPathExposed, false);
  assert.equal(json.fieldAcceptanceReport.safeguards.driverPayloadExposed, false);
  assert.equal(json.fieldAcceptanceReport.safeguards.physicalPrinterCalledByCheck, false);
  assert.equal(json.productionEnvGate.status, "blocked");
  assert.equal(json.productionEnvGate.ready, false);
  assert.equal(json.productionEnvGate.available, true);
  assert.equal(json.productionEnvGate.summary.passedCount, 2);
  assert.equal(json.productionEnvGate.summary.totalCount, 10);
  assert.equal(json.productionEnvGate.summary.blockingCount, 6);
  assert.equal(json.productionEnvGate.summary.warningCount, 2);
  assert.equal(json.productionEnvGate.summary.auditStatus, "passed");
  assert.equal(json.productionEnvGate.summary.auditLabel, "已通过");
  assert.equal(json.productionEnvGate.audit.included, true);
  assert.equal(json.productionEnvGate.audit.envFileCount, 1);
  assert.match(json.productionEnvGate.audit.summary.label, /1 个 env 文件安全审计通过/);
  assert.equal(json.productionEnvGate.checks.length, 10);
  assert.ok(
    json.productionEnvGate.checks.some((item) =>
      item.key === "v1-persistence-profile" &&
      item.label === "统一 V1 持久化 profile" &&
      item.severity === "blocking"
    ),
  );
  assert.ok(
    json.productionEnvGate.checks.some((item) =>
      item.key === "attachment-object-storage-env" &&
      item.missingVariables.includes("ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY")
    ),
  );
  assert.ok(
    json.productionEnvGate.checks.some((item) =>
      item.key === "cups-preflight-env" &&
      item.label === "CUPS 队列预检环境变量"
    ),
  );
  assert.equal(json.productionEnvGate.safeguards.nonMutating, true);
  assert.equal(json.productionEnvGate.safeguards.envValuesIncluded, false);
  assert.equal(json.productionEnvGate.safeguards.secretValuesIncluded, false);
  assert.equal(json.productionEnvGate.safeguards.rawEnvFileIncluded, false);
  assert.equal(json.productionEnvGate.safeguards.envFilePathExposed, false);
  assert.equal(json.productionEnvGate.safeguards.artifactPathExposed, false);
  assert.equal(json.productionEnvIntakeVerification.available, true);
  assert.equal(json.productionEnvIntakeVerification.status, "blocked");
  assert.equal(json.productionEnvIntakeVerification.ready, false);
  assert.equal(json.productionEnvIntakeVerification.summary.intakeRowCount, 23);
  assert.equal(json.productionEnvIntakeVerification.summary.configuredRowCount, 0);
  assert.equal(json.productionEnvIntakeVerification.summary.missingRowCount, 23);
  assert.equal(json.productionEnvIntakeVerification.summary.configuredLabel, "0/23");
  assert.equal(json.productionEnvIntakeVerification.summary.fullIntakeConfiguredLabel, "0/23");
  assert.equal(json.productionEnvIntakeVerification.summary.minimumBlockingLabel, "0/12");
  assert.equal(json.productionEnvIntakeVerification.summary.minimumBlockingTargetCount, 12);
  assert.equal(json.productionEnvIntakeVerification.summary.minimumBlockingMissingCount, 12);
  assert.equal(json.productionEnvIntakeVerification.summary.minimumBlockingVariableRowCount, 11);
  assert.equal(json.productionEnvIntakeVerification.summary.minimumBlockingAlternativeGroupCount, 1);
  assert.equal(json.productionEnvIntakeVerification.summary.minimumWarningLabel, "0/8");
  assert.equal(json.productionEnvIntakeVerification.summary.minimumWarningTargetCount, 8);
  assert.equal(json.productionEnvIntakeVerification.summary.minimumWarningVariableRowCount, 7);
  assert.equal(json.productionEnvIntakeVerification.summary.minimumWarningAlternativeGroupCount, 1);
  assert.equal(json.productionEnvIntakeVerification.summary.blockingCount, 12);
  assert.equal(json.productionEnvIntakeVerification.summary.warningCount, 8);
  assert.equal(json.productionEnvIntakeVerification.summary.alternativeGroupCount, 2);
  assert.equal(json.productionEnvIntakeVerification.summary.alternativeGroupBlockingCount, 1);
  assert.equal(json.productionEnvIntakeVerification.summary.auditReady, true);
  assert.equal(json.productionEnvIntakeVerification.summary.intakeCsvReady, true);
  assert.equal(json.productionEnvIntakeVerification.summary.minimumBlockingItemCount, 12);
  assert.equal(json.productionEnvIntakeVerification.minimumBlockingItems.length, 12);
  assert.ok(
    json.productionEnvIntakeVerification.minimumBlockingItems.some((item) =>
      item.label === "任选其一变量组" &&
      item.alternativeGroup === "ERP_V1_DATABASE_URL / DATABASE_URL / PGURL" &&
      item.variables.includes("ERP_V1_DATABASE_URL")
    ),
  );
  assert.ok(
    json.productionEnvIntakeVerification.minimumBlockingItems.some((item) =>
      item.label === "PostgreSQL 恢复验证库环境变量" &&
      item.variableKey === "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL" &&
      item.expectedValueType === "PostgreSQL 连接串"
    ),
  );
  assert.ok(
    json.productionEnvIntakeVerification.minimumBlockingItems.some((item) =>
      item.label === "附件对象存储环境变量" &&
      item.variableKey === "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY" &&
      item.expectedValueType === "密钥 / token"
    ),
  );
  assert.ok(
    json.productionEnvIntakeVerification.minimumBlockingItems.some((item) =>
      item.label === "CUPS 队列预检环境变量" &&
      item.variableKey === "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND"
    ),
  );
  assert.ok(
    json.productionEnvIntakeVerification.blockingFindings.some((item) =>
      item.label === "任选其一变量组" &&
      item.alternativeGroup === "ERP_V1_DATABASE_URL / DATABASE_URL / PGURL"
    ),
  );
  assert.ok(
    json.productionEnvIntakeVerification.blockingFindings.some((item) =>
      item.label === "附件对象存储环境变量" &&
      item.variableKey === "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT"
    ),
  );
  assert.ok(
    !json.productionEnvIntakeVerification.blockingFindings.some((item) =>
      item.variableKey === "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT"
    ),
  );
  assert.equal(json.productionEnvIntakeVerification.safeguards.envValuesIncluded, false);
  assert.equal(json.productionEnvIntakeVerification.safeguards.secretFieldsIncluded, false);
  assert.equal(json.productionEnvIntakeVerification.safeguards.envFilePathIncluded, false);
  assert.equal(json.productionEnvIntakeVerification.safeguards.rawProofRefIncluded, false);
  assert.equal(json.productionPersistenceEvidence.available, true);
  assert.equal(json.productionPersistenceEvidence.status, "blocked");
  assert.equal(json.productionPersistenceEvidence.ready, false);
  assert.equal(typeof json.productionPersistenceEvidence.summary.postgresReady, "boolean");
  assert.equal(typeof json.productionPersistenceEvidence.summary.objectStorageReady, "boolean");
  assert.equal(typeof json.productionPersistenceEvidence.summary.envFileFromProductionSetup, "boolean");
  assert.equal(Array.isArray(json.productionPersistenceEvidence.blockingStages), true);
  assert.equal(json.productionPersistenceEvidence.safeguards.migrationApplyExecuted, false);
  assert.equal(json.productionPersistenceEvidence.safeguards.postgresBackupRestoreResetExplicitlyAllowed, false);
  assert.equal(json.productionPersistenceEvidence.safeguards.envFilePathExposed, false);
  assert.equal(json.productionPersistenceEvidence.safeguards.databaseUrlExposed, false);
  assert.equal(json.productionPersistenceEvidence.safeguards.objectStorageEndpointExposed, false);
  assert.equal(json.productionPersistenceEvidence.safeguards.objectStorageBucketExposed, false);
  assert.equal(json.productionPersistenceEvidence.safeguards.secretFieldsExposed, false);
  assert.equal(json.productionPersistenceEvidence.safeguards.payloadExposed, false);
  assert.equal(json.productionFirstStageExecution.available, true);
  assert.equal(json.productionFirstStageExecution.status, "blocked");
  assert.equal(json.productionFirstStageExecution.ready, false);
  assert.equal(json.productionFirstStageExecution.summary.passedLabel, "1/8");
  assert.equal(json.productionFirstStageExecution.summary.blockingLabel, "1 项");
  assert.equal(json.productionFirstStageExecution.execution.envFileFromProductionSetup, true);
  assert.equal(json.productionFirstStageExecution.execution.applyMigrations, false);
  assert.equal(json.productionFirstStageExecution.execution.restoreResetExplicitlyAllowed, false);
  assert.equal(json.productionFirstStageExecution.execution.productionEnvValuesDryRun, false);
  assert.equal(json.productionFirstStageExecution.intakeCoverage.included, true);
  assert.equal(json.productionFirstStageExecution.intakeCoverage.status, "blocked");
  assert.equal(json.productionFirstStageExecution.intakeCoverage.statusLabel, "阻塞");
  assert.equal(json.productionFirstStageExecution.intakeCoverage.fullIntakeConfiguredLabel, "0/23");
  assert.equal(json.productionFirstStageExecution.intakeCoverage.minimumBlockingLabel, "0/12");
  assert.equal(json.productionFirstStageExecution.intakeCoverage.minimumBlockingMissingCount, 12);
  assert.equal(json.productionFirstStageExecution.intakeCoverage.minimumWarningLabel, "0/8");
  assert.equal(json.productionFirstStageExecution.intakeCoverage.minimumWarningMissingCount, 8);
  assert.equal(json.productionFirstStageExecution.intakeCoverage.auditReady, true);
  assert.equal(json.productionFirstStageExecution.intakeCoverage.intakeCsvReady, true);
  assert.equal(json.productionFirstStageExecution.dryRunCoverage.available, true);
  assert.equal(json.productionFirstStageExecution.dryRunCoverage.included, false);
  assert.equal(json.productionFirstStageExecution.dryRunCoverage.status, "not_included");
  assert.equal(json.productionFirstStageExecution.dryRunCoverage.statusLabel, "未纳入");
  assert.match(json.productionFirstStageExecution.dryRunCoverage.nextAction, /--production-env-values-dry-run/);
  assert.ok(
    json.productionFirstStageExecution.blockingStages.some((stage) =>
      stage.key === "production-env-intake-verify" &&
      stage.evidence.blockingCount === 12 &&
      stage.commandIncluded === false
    ),
  );
  assert.equal(json.productionFirstStageExecution.safeguards.envValuesIncluded, false);
  assert.equal(json.productionFirstStageExecution.safeguards.secretFieldsIncluded, false);
  assert.equal(json.productionFirstStageExecution.safeguards.envFilePathIncluded, false);
  assert.equal(json.productionFirstStageExecution.safeguards.rawStageCommandsIncluded, false);
  assert.equal(json.productionFirstStageExecution.safeguards.schemaMigrationApplyExecuted, false);
  assert.equal(json.productionFirstStageExecution.safeguards.declaresFullV1Complete, false);
  assert.ok(json.moduleCompletion.length >= 16);
  assert.ok(json.moduleCompletion.some((row) => row.module === "原材料 / 成本 / 毛利"));
  assert.equal(json.unblockPlan.summary.taskCount, 53);
  assert.ok(json.unblockPlan.phases.some((phase) => phase.key === "production_environment"));
  assert.ok(
    json.unblockPlan.phases.some((phase) =>
      phase.firstTasks.some((task) => task.title === "附件对象存储环境变量"),
    ),
  );
  assert.ok(json.unblockPlan.roleBuckets.some((bucket) => bucket.role === "技术/管理" && bucket.taskCount === 35));
  assert.equal(json.roleTaskBoard.status, "blocked");
  assert.equal(json.roleTaskBoard.ready, false);
  assert.equal(json.roleTaskBoard.available, true);
  assert.equal(json.roleTaskBoard.summary.taskCount, 53);
  assert.equal(json.roleTaskBoard.summary.releaseTaskCount, 12);
  assert.equal(json.roleTaskBoard.summary.evidenceTaskCount, 34);
  assert.equal(json.roleTaskBoard.summary.signoffTaskCount, 6);
  assert.equal(json.roleTaskBoard.summary.boundaryTaskCount, 1);
  assert.equal(json.roleTaskBoard.summary.roleCount, 6);
  assert.equal(json.roleTaskBoard.summary.categoryCount, 4);
  assert.equal(json.roleTaskBoard.categorySummaries.length, 4);
  assert.ok(
    json.roleTaskBoard.categorySummaries.some((category) =>
      category.key === "release" &&
      category.count === 12 &&
      category.statusLabel === "待处理" &&
      category.firstTasks.some((task) => task.title === "统一 V1 持久化 profile")
    ),
  );
  assert.ok(
    json.roleTaskBoard.categorySummaries.some((category) =>
      category.key === "evidence" &&
      category.count === 34 &&
      category.firstTasks.length > 0 &&
      category.nextAction.includes("真实 PostgreSQL")
    ),
  );
  assert.equal(json.roleTaskBoard.roles.length, 6);
  assert.ok(
    json.roleTaskBoard.roles.some((role) =>
      role.role === "技术/管理" &&
      role.taskCount === 35 &&
      role.releaseTaskCount === 12 &&
      role.evidenceTaskCount >= 21 &&
      role.signoffTaskCount === 1 &&
      role.boundaryTaskCount === 1 &&
      role.tasks.some((task) => task.title === "统一 V1 持久化 profile")
    ),
  );
  assert.ok(
    json.roleTaskBoard.roles.some((role) =>
      role.role === "办公室" &&
      role.taskCount === 19 &&
      role.tasks.some((task) => task.title === "系统打印 command_bridge 环境变量")
    ),
  );
  assert.equal(json.roleTaskBoard.safeguards.rawOnsiteTaskBoardIncluded, false);
  assert.equal(json.roleTaskBoard.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(json.roleTaskBoard.safeguards.rawSignersIncluded, false);
  assert.equal(json.roleTaskBoard.safeguards.artifactPathExposed, false);
  assert.equal(json.v1V2BoundaryBrief.status, "pending_confirmation");
  assert.equal(json.v1V2BoundaryBrief.ready, false);
  assert.equal(json.v1V2BoundaryBrief.available, true);
  assert.equal(json.v1V2BoundaryBrief.canDeclareV1Complete, false);
  assert.equal(json.v1V2BoundaryBrief.summary.v1MustContinueCount, 6);
  assert.equal(json.v1V2BoundaryBrief.summary.v2CategoryCount, 7);
  assert.equal(json.v1V2BoundaryBrief.summary.v2DifferenceCount, 17);
  assert.equal(json.v1V2BoundaryBrief.summary.moduleDifferenceCount, 11);
  assert.equal(json.v1V2BoundaryBrief.summary.ownerReviewRuleCount, 3);
  assert.equal(json.v1V2BoundaryBrief.v2Differences.length, 17);
  assert.equal(json.v1V2BoundaryBrief.moduleDifferences.length, 11);
  assert.ok(json.v1V2BoundaryBrief.v1MustContinue.some((item) => item.includes("生产级持久化")));
  assert.ok(json.v1V2BoundaryBrief.v2Categories.includes("企微 / 客户自动化"));
  assert.ok(json.v1V2BoundaryBrief.v2Differences.some((item) => item.includes("企业微信")));
  assert.ok(json.v1V2BoundaryBrief.moduleDifferences.some((item) => item.module === "订单录入"));
  assert.match(json.v1V2BoundaryBrief.ownerReview.approvalRule, /缺一项都不能宣布 V1 完成/);
  assert.equal(json.v1V2BoundaryBrief.safeguards.nonMutating, true);
  assert.equal(json.v1V2BoundaryBrief.safeguards.boundaryConfirmationMutated, false);
  assert.equal(json.v1V2BoundaryBrief.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(json.v1V2BoundaryBrief.safeguards.rawSignersIncluded, false);
  assert.equal(json.v1V2BoundaryBrief.safeguards.artifactPathExposed, false);
  assert.equal(json.fieldEvidenceProgress.status, "blocked");
  assert.equal(json.fieldEvidenceProgress.ready, false);
  assert.equal(json.fieldEvidenceProgress.available, true);
  assert.equal(json.fieldEvidenceProgress.summary.evidenceGroupsTotal, 6);
  assert.equal(json.fieldEvidenceProgress.summary.evidenceGroupsReady, 0);
  assert.equal(json.fieldEvidenceProgress.summary.requiredEvidenceItemsTotal, 34);
  assert.equal(json.fieldEvidenceProgress.summary.requiredEvidenceItemsCompleted, 0);
  assert.equal(json.fieldEvidenceProgress.summary.requiredSignoffsTotal, 6);
  assert.equal(json.fieldEvidenceProgress.summary.requiredSignoffsCompleted, 0);
  assert.equal(json.fieldEvidenceProgress.summary.missingEvidenceItemCount, 34);
  assert.equal(json.fieldEvidenceProgress.summary.missingEvidenceItemsShown, 34);
  assert.equal(json.fieldEvidenceProgress.summary.groupSummaryCount, 6);
  assert.equal(json.fieldEvidenceProgress.summary.signoffBoundaryActionCount, 7);
  assert.equal(json.fieldEvidenceProgress.summary.signoffBoundaryActionsShown, 7);
  assert.equal(json.fieldEvidenceProgress.summary.boundaryStatus, "pending");
  assert.ok(json.fieldEvidenceProgress.summary.blockingCount >= 41);
  assert.equal(json.fieldEvidenceProgress.groups.length, 6);
  assert.equal(json.fieldEvidenceProgress.groupSummaries.length, 6);
  assert.ok(
    json.fieldEvidenceProgress.groups.some((group) =>
      group.key === "production_persistence" &&
      group.ownerRole === "技术 / 管理" &&
      group.progressLabel === "0/5" &&
      group.blockedRequired === 5
    ),
  );
  assert.ok(
    json.fieldEvidenceProgress.groupSummaries.some((group) =>
      group.key === "production_persistence" &&
      group.missingCount === 5 &&
      group.missingLabel === "5/5" &&
      group.firstMissingItems.some((item) => item.label === "PostgreSQL 迁移已在生产库执行")
    ),
  );
  assert.ok(
    json.fieldEvidenceProgress.groupSummaries.some((group) =>
      group.key === "print_hardware" &&
      group.missingLabel === "7/7" &&
      group.firstMissingItems.some((item) => item.label === "标签机真实样张已出纸并留档")
    ),
  );
  assert.equal(json.fieldEvidenceProgress.missingItems.length, 34);
  assert.equal(json.fieldEvidenceProgress.signoffBoundarySummary.status, "blocked");
  assert.equal(json.fieldEvidenceProgress.signoffBoundarySummary.ready, false);
  assert.equal(json.fieldEvidenceProgress.signoffBoundarySummary.signoffProgressLabel, "0/6");
  assert.equal(json.fieldEvidenceProgress.signoffBoundarySummary.missingSignoffCount, 6);
  assert.equal(json.fieldEvidenceProgress.signoffBoundarySummary.boundaryLabel, "待确认");
  assert.equal(json.fieldEvidenceProgress.signoffBoundarySummary.actionLabel, "7/7");
  assert.equal(json.fieldEvidenceProgress.signoffBoundarySummary.previewActions.length, 3);
  assert.ok(
    json.fieldEvidenceProgress.signoffBoundarySummary.previewActions.some((item) =>
      item.type === "signoff" &&
      item.key === "办公室" &&
      item.label === "办公室"
    ),
  );
  assert.ok(
    json.fieldEvidenceProgress.missingItems.some((item) =>
      item.key === "postgres_migration_applied" &&
      item.groupLabel === "生产持久化" &&
      item.ownerRole === "技术 / 管理" &&
      item.label === "PostgreSQL 迁移已在生产库执行" &&
      item.evidenceFilled === false &&
      item.progressLabel === "缺证据"
    ),
  );
  assert.ok(
    json.fieldEvidenceProgress.missingItems.some((item) =>
      item.key === "label_sample_printed" &&
      item.groupLabel === "打印硬件 / CUPS / 标签" &&
      item.nextAction.includes("回填 evidence-items.csv")
    ),
  );
  assert.equal(json.fieldEvidenceProgress.signoffBoundaryActions.length, 7);
  assert.ok(
    json.fieldEvidenceProgress.signoffBoundaryActions.some((item) =>
      item.type === "signoff" &&
      item.key === "办公室" &&
      item.label === "办公室" &&
      item.personFilled === false &&
      item.timeFilled === false &&
      item.progressLabel === "缺签字人 / 缺时间"
    ),
  );
  assert.ok(
    json.fieldEvidenceProgress.signoffBoundaryActions.some((item) =>
      item.type === "boundary" &&
      item.key === "v1_v2_boundary" &&
      item.label === "V1/V2 边界确认" &&
      item.personFilled === false &&
      item.timeFilled === false &&
      item.progressLabel === "缺确认人 / 缺时间"
    ),
  );
  assert.equal(json.fieldEvidenceProgress.signoffs.length, 6);
  assert.ok(
    json.fieldEvidenceProgress.signoffs.some((signoff) =>
      signoff.role === "办公室" &&
      signoff.status === "pending" &&
      signoff.signerFilled === false &&
      signoff.signedAtFilled === false
    ),
  );
  assert.equal(json.fieldEvidenceProgress.boundary.status, "pending");
  assert.equal(json.fieldEvidenceProgress.boundary.v1ItemCount, 2);
  assert.equal(json.fieldEvidenceProgress.boundary.v2ItemCount, 1);
  assert.equal(json.fieldEvidenceProgress.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(json.fieldEvidenceProgress.safeguards.rawSignersIncluded, false);
  assert.equal(json.fieldEvidenceProgress.safeguards.rawNotesIncluded, false);
  assert.equal(json.fieldEvidenceProgress.safeguards.rawEvidenceItemsCsvIncluded, false);
  assert.equal(json.fieldEvidenceProgress.safeguards.rawSignoffBoundaryCsvIncluded, false);
  assert.equal(json.fieldEvidenceProgress.safeguards.artifactPathExposed, false);
  assert.equal(json.fieldEvidenceIntakeGuidance.status, "blocked");
  assert.equal(json.fieldEvidenceIntakeGuidance.ready, false);
  assert.equal(json.fieldEvidenceIntakeGuidance.available, true);
  assert.equal(json.fieldEvidenceIntakeGuidance.summary.evidenceCsvStatus, "present");
  assert.equal(json.fieldEvidenceIntakeGuidance.summary.signoffCsvStatus, "present");
  assert.equal(json.fieldEvidenceIntakeGuidance.summary.evidenceRows, 34);
  assert.equal(json.fieldEvidenceIntakeGuidance.summary.filledEvidenceRows, 0);
  assert.equal(json.fieldEvidenceIntakeGuidance.summary.completedEvidenceRows, 0);
  assert.equal(json.fieldEvidenceIntakeGuidance.summary.signoffRows, 6);
  assert.equal(json.fieldEvidenceIntakeGuidance.summary.filledSignoffRows, 0);
  assert.equal(json.fieldEvidenceIntakeGuidance.summary.completedSignoffRows, 0);
  assert.equal(json.fieldEvidenceIntakeGuidance.summary.boundaryStatus, "pending");
  assert.equal(json.fieldEvidenceIntakeGuidance.summary.boundaryLabel, "待确认");
  const initialDraftManifestStatus = json.fieldEvidenceIntakeGuidance.summary.draftManifestStatus;
  const initialDraftManifestAvailable = initialDraftManifestStatus === "available";
  const initialDraftFreshnessStatus = json.fieldEvidenceIntakeGuidance.summary.draftFreshnessStatus;
  const initialDraftFreshnessReady = json.fieldEvidenceIntakeGuidance.summary.draftFreshnessReady === true;
  const initialDraftFreshnessLabel = json.fieldEvidenceIntakeGuidance.summary.draftFreshnessLabel;
  assert.ok(["missing", "available"].includes(initialDraftManifestStatus));
  assert.ok(["missing", "fresh", "stale", "metadata_missing", "invalid"].includes(initialDraftFreshnessStatus));
  assert.equal(json.fieldEvidenceDraftFreshness.status, initialDraftFreshnessStatus);
  assert.equal(json.fieldEvidenceDraftFreshness.safeguards.digestValuesIncluded, false);
  assert.equal(json.fieldEvidenceDraftFreshness.safeguards.rawCsvIncluded, false);
  assert.equal(json.fieldEvidenceIntakeGuidance.summary.rulesAvailable, true);
  assert.equal(json.fieldEvidenceIntakeGuidance.summary.commandCount, 3);
  assert.ok(json.fieldEvidenceIntakeGuidance.blockedReason.includes("现场证据 0/34"));
  assert.ok(json.fieldEvidenceIntakeGuidance.commands.some((item) => item.key === "apply-draft" && item.command.includes("apply-v1-field-evidence-intake.mjs")));
  assert.ok(json.fieldEvidenceIntakeGuidance.commands.some((item) => item.key === "validate-draft" && item.command.includes("validate-v1-field-evidence-manifest.mjs")));
  assert.ok(json.fieldEvidenceIntakeGuidance.commands.some((item) => item.key === "refresh-suite" && item.command.includes("run-v1-go-live-suite.mjs")));
  assert.ok(json.fieldEvidenceIntakeGuidance.commands.every((item) => item.command.includes("<")));
  assert.equal(json.fieldEvidenceIntakeGuidance.safeguards.nonMutating, true);
  assert.equal(json.fieldEvidenceIntakeGuidance.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(json.fieldEvidenceIntakeGuidance.safeguards.rawSignersIncluded, false);
  assert.equal(json.fieldEvidenceIntakeGuidance.safeguards.rawCsvIncluded, false);
  assert.equal(json.fieldEvidenceIntakeGuidance.safeguards.rawFieldEvidenceDraftManifestIncluded, false);
  assert.equal(json.fieldEvidenceIntakeGuidance.safeguards.fieldEvidenceDraftFreshnessChecked, true);
  assert.equal(json.fieldEvidenceIntakeGuidance.safeguards.digestValuesIncluded, false);
  assert.equal(json.fieldEvidenceIntakeGuidance.safeguards.artifactPathExposed, false);
  assert.equal(json.fieldEvidenceIntakeGuidance.safeguards.localPathExposed, false);
  assert.equal(json.fieldEvidenceIntakeGuidance.safeguards.commandSecretsIncluded, false);
  assert.equal(json.fieldEvidenceIntakeQuality.status, "blocked");
  assert.equal(json.fieldEvidenceIntakeQuality.ready, false);
  assert.equal(json.fieldEvidenceIntakeQuality.available, true);
  assert.equal(json.fieldEvidenceIntakeQuality.summary.evidenceProgress, "0/34");
  assert.equal(json.fieldEvidenceIntakeQuality.summary.signoffProgress, "0/6");
  assert.equal(json.fieldEvidenceIntakeQuality.summary.missingEvidenceRows, 34);
  assert.equal(json.fieldEvidenceIntakeQuality.summary.missingSignoffRows, 6);
  assert.equal(json.fieldEvidenceIntakeQuality.summary.boundaryLabel, "待确认");
  assert.equal(json.fieldEvidenceIntakeQuality.summary.draftManifestStatus, initialDraftManifestStatus);
  assert.equal(json.fieldEvidenceIntakeQuality.summary.draftFreshnessStatus, initialDraftFreshnessStatus);
  assert.equal(json.fieldEvidenceIntakeQuality.summary.draftFreshnessReady, initialDraftFreshnessReady);
  assert.equal(json.fieldEvidenceIntakeQuality.summary.canGenerateDraft, true);
  assert.equal(json.fieldEvidenceIntakeQuality.summary.canRefreshReleaseCandidate, false);
  assert.equal(json.fieldEvidenceIntakeQuality.summary.checkCount, 9);
  assert.equal(
    json.fieldEvidenceIntakeQuality.summary.blockingIssueCount,
    initialDraftManifestAvailable && initialDraftFreshnessReady ? 3 : 4,
  );
  assert.ok(json.fieldEvidenceIntakeQuality.checks.some((item) => item.key === "evidence-csv" && item.ready === true));
  assert.ok(json.fieldEvidenceIntakeQuality.checks.some((item) => item.key === "draft-manifest" && item.ready === initialDraftManifestAvailable));
  assert.ok(json.fieldEvidenceIntakeQuality.checks.some((item) => item.key === "draft-freshness"));
  assert.ok(json.fieldEvidenceIntakeQuality.checks.some((item) => item.key === "evidence-completion" && item.detail.includes("0/34")));
  assert.ok(json.fieldEvidenceIntakeQuality.checks.some((item) => item.key === "v1-v2-boundary" && item.nextAction.includes("确认人")));
  assert.equal(json.fieldEvidenceIntakeQuality.safeguards.nonMutating, true);
  assert.equal(json.fieldEvidenceIntakeQuality.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(json.fieldEvidenceIntakeQuality.safeguards.rawSignersIncluded, false);
  assert.equal(json.fieldEvidenceIntakeQuality.safeguards.rawCsvIncluded, false);
  assert.equal(json.fieldEvidenceIntakeQuality.safeguards.rawFieldEvidenceDraftManifestIncluded, false);
  assert.equal(json.fieldEvidenceIntakeQuality.safeguards.fieldEvidenceDraftFreshnessChecked, true);
  assert.equal(json.fieldEvidenceIntakeQuality.safeguards.digestValuesIncluded, false);
  assert.equal(json.fieldEvidenceIntakeQuality.safeguards.artifactPathExposed, false);
  assert.equal(json.fieldEvidenceIntakeQuality.safeguards.localPathExposed, false);
  assert.equal(json.productionEnvFixChecklist.status, "blocked");
  assert.equal(json.productionEnvFixChecklist.ready, false);
  assert.equal(json.productionEnvFixChecklist.summary.itemCount, 10);
  assert.equal(json.productionEnvFixChecklist.items.length, json.productionEnvFixChecklist.summary.itemCount);
  assert.equal(json.productionEnvFixChecklist.summary.blockingCount, 6);
  assert.ok(json.productionEnvFixChecklist.summary.totalVariableCount >= 30);
  assert.ok(
    json.productionEnvFixChecklist.items.some((item) =>
      item.label === "统一 V1 持久化 profile" &&
      item.missingVariables.includes("ERP_V1_DATABASE_URL or DATABASE_URL or PGURL")
    ),
  );
  assert.ok(
    json.productionEnvFixChecklist.items.some((item) =>
      item.label === "PostgreSQL 恢复验证库环境变量" &&
      item.missingVariables.includes("ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL")
    ),
  );
  assert.ok(
    json.productionEnvFixChecklist.items.some((item) =>
      item.label === "附件对象存储环境变量" &&
      item.ownerRole === "技术/管理" &&
      item.missingVariables.includes("ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY")
    ),
  );
  assert.ok(
    json.productionEnvFixChecklist.items.some((item) =>
      item.label === "PostgreSQL 恢复验证库环境变量" &&
      item.missingVariables.includes("ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL")
    ),
  );
  assert.equal(json.productionEnvFixChecklist.safeguards.environmentValuesIncluded, false);
  assert.equal(json.productionEnvFixChecklist.safeguards.secretValuesIncluded, false);
  assert.equal(json.productionEnvFillTemplate.status, "available");
  assert.equal(json.productionEnvFillTemplate.ready, false);
  assert.equal(json.productionEnvFillTemplate.summary.variableCount, 22);
  assert.equal(json.productionEnvFillTemplate.previewLines.length, json.productionEnvFillTemplate.summary.lineCount);
  assert.ok(json.productionEnvFillTemplate.summary.placeholderCount >= 23);
  assert.ok(json.productionEnvFillTemplate.previewLines.includes("# ERP_V1_DATABASE_URL=<待填写>"));
  assert.ok(json.productionEnvFillTemplate.previewLines.includes("# ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL=<待填写>"));
  assert.ok(json.productionEnvFillTemplate.previewLines.includes("# ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=<待填写>"));
  assert.ok(json.productionEnvFillTemplate.previewLines.includes("# ERP_SYSTEM_PRINTER_COMMAND=<待填写>"));
  assert.ok(json.productionEnvFillTemplate.previewLines.includes("# BLOCKING | 技术/管理 | 统一 V1 持久化 profile"));
  assert.ok(json.productionEnvFillTemplate.previewLines.includes("# WARNING | 技术/办公室 | V1 readiness 验收账号环境变量"));
  assert.equal(json.productionEnvFillTemplate.safeguards.realEnvValuesIncluded, false);
  assert.equal(json.productionEnvFillTemplate.safeguards.secretValuesIncluded, false);
  assert.equal(json.productionEnvFillTemplate.safeguards.artifactPathExposed, false);
  assert.equal(json.productionEnvMinimumValuesFragmentTemplate.status, "available");
  assert.equal(json.productionEnvMinimumValuesFragmentTemplate.ready, false);
  assert.equal(json.productionEnvMinimumValuesFragmentTemplate.summary.variableCount, 11);
  assert.equal(json.productionEnvMinimumValuesFragmentTemplate.summary.targetLabel, "0/12");
  assert.equal(json.productionEnvMinimumValuesFragmentTemplate.summary.templateKind, "minimum_values_fragment");
  assert.equal(
    json.productionEnvMinimumValuesFragmentTemplate.summary.fileName,
    "production-env-minimum-values-fragment.template.env.example",
  );
  assert.equal(
    json.productionEnvMinimumValuesFragmentTemplate.previewLines.length,
    json.productionEnvMinimumValuesFragmentTemplate.summary.lineCount,
  );
  assert.ok(json.productionEnvMinimumValuesFragmentTemplate.previewLines.includes("# ERP_V1_DATABASE_URL=<待填写>"));
  assert.ok(json.productionEnvMinimumValuesFragmentTemplate.previewLines.includes("# ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=<待填写>"));
  assert.ok(json.productionEnvMinimumValuesFragmentTemplate.previewLines.includes("# ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=<待填写>"));
  assert.ok(json.productionEnvMinimumValuesFragmentTemplate.previewLines.includes("# ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND=<待填写>"));
  assert.ok(json.productionEnvMinimumValuesFragmentTemplate.previewLines.includes("# BLOCKING | 技术/管理 | 统一 V1 持久化 profile"));
  assert.ok(!json.productionEnvMinimumValuesFragmentTemplate.previewLines.some((line) => /^# DATABASE_URL=/.test(line)));
  assert.ok(!json.productionEnvMinimumValuesFragmentTemplate.previewLines.some((line) => /^# PGURL=/.test(line)));
  assert.ok(!json.productionEnvMinimumValuesFragmentTemplate.previewLines.some((line) => line.includes("ERP_STATEMENT_EXPORT_OBJECT_STORAGE")));
  assert.equal(json.productionEnvMinimumValuesFragmentTemplate.safeguards.realEnvValuesIncluded, false);
  assert.equal(json.productionEnvMinimumValuesFragmentTemplate.safeguards.secretValuesIncluded, false);
  assert.equal(json.productionEnvMinimumValuesFragmentTemplate.safeguards.artifactPathExposed, false);
  assert.equal(json.productionEnvMinimumValuesFragmentTemplate.safeguards.localPathExposed, false);
  assert.equal(json.productionEnvMinimumValuesFragmentTemplate.safeguards.browserEnvValuesAccepted, false);
  assert.equal(json.productionEnvMinimumValuesFragmentTemplate.safeguards.productionEnvFileMutated, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.available, true);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.status, "not_configured");
  assert.equal(json.productionEnvValuesFragmentSourceStatus.ready, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.configuredValuesFileCount, 0);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.valuesFilePathConfigured, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.selectedEnvVariable, "");
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.selectedSourceKind, "none");
  assert.deepEqual(
    json.productionEnvValuesFragmentSourceStatus.summary.sourceStatuses.map((item) => item.envVariable),
    [
      "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
      "ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE",
      "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE",
    ],
  );
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.acceptsFrontendPath, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.pathValueExposed, false);
  assert.equal(typeof json.productionEnvValuesFragmentSourceStatus.summary.targetSetupStatus, "string");
  assert.equal(typeof json.productionEnvValuesFragmentSourceStatus.summary.targetSetupReady, "boolean");
  assert.equal(typeof json.productionEnvValuesFragmentSourceStatus.summary.targetSetupReportAvailable, "boolean");
  assert.equal(typeof json.productionEnvValuesFragmentSourceStatus.summary.targetSetupEnvFileCount, "number");
  assert.equal(typeof json.productionEnvValuesFragmentSourceStatus.summary.targetEnvFileConfigured, "boolean");
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditStatus, "not_run");
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditReady, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditExecuted, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditBlockingCount, 0);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditWarningCount, 0);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditPathExposed, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditValuesIncluded, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.intakeVerificationStatus, "blocked");
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.intakeVerificationReady, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.intakeVerificationAvailable, true);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingReady, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingLabel, "0/12");
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingTargetCount, 12);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingSatisfiedCount, 0);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingMissingCount, 12);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingVariableRowCount, 11);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingAlternativeGroupCount, 1);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumWarningLabel, "0/8");
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumWarningMissingCount, 8);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.fullIntakeConfiguredLabel, "0/23");
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.dryRunExecuted, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.productionEnvFileMutated, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.primaryEnvVariable, "ERP_V1_PRODUCTION_ENV_VALUES_FILE");
  assert.equal(json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.configuredValuesFileCount, 0);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.pathValueExposed, false);
  assert.equal(typeof json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.targetSetupReady, "boolean");
  assert.equal(typeof json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.targetSetupReportAvailable, "boolean");
  assert.equal(typeof json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.targetSetupEnvFileCount, "number");
  assert.equal(json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.valuesFileAuditStatus, "not_run");
  assert.equal(json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.valuesFileAuditReady, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.valuesFileAuditPathExposed, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.valuesFileAuditValuesIncluded, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.minimumBlockingLabel, "0/12");
  assert.equal(json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.minimumBlockingMissingCount, 12);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.targetEnvFilePathExposed, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.targetSetupStatus.available, true);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.targetSetupStatus.summary.targetEnvFilePathExposed, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.safeguards.valuesFilePathValueIncluded, false);
  assert.equal(typeof json.productionEnvValuesFragmentSourceStatus.safeguards.targetSetupReady, "boolean");
  assert.equal(typeof json.productionEnvValuesFragmentSourceStatus.safeguards.targetSetupReportAvailable, "boolean");
  assert.equal(typeof json.productionEnvValuesFragmentSourceStatus.safeguards.targetSetupEnvFileCount, "number");
  assert.equal(typeof json.productionEnvValuesFragmentSourceStatus.safeguards.targetEnvFileConfigured, "boolean");
  assert.equal(json.productionEnvValuesFragmentSourceStatus.safeguards.targetEnvFilePathExposed, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.safeguards.envValuesIncluded, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.safeguards.secretValuesIncluded, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.safeguards.localPathExposed, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.safeguards.valuesFileAuditReady, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.safeguards.valuesFileAuditPathExposed, false);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.safeguards.valuesFileAuditValuesIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.available, true);
  assert.equal(json.productionEnvValuesApplyGateStatus.status, "disabled");
  assert.equal(json.productionEnvValuesApplyGateStatus.ready, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.applyEnabled, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.applyEnableEnvVariable, "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.configuredValuesFileCount, 0);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.valuesFilePathConfigured, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.selectedEnvVariable, "");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.selectedSourceKind, "none");
  assert.deepEqual(
    json.productionEnvValuesApplyGateStatus.summary.sourceStatuses.map((item) => item.envVariable),
    [
      "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
      "ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE",
      "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE",
    ],
  );
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.requestBodyIgnored, true);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.acceptsFrontendPath, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.valuesFilePathAccepted, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.valuesFilePathExposed, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.targetEnvFilePathExposed, false);
  assert.equal(typeof json.productionEnvValuesApplyGateStatus.summary.targetSetupStatus, "string");
  assert.equal(typeof json.productionEnvValuesApplyGateStatus.summary.targetSetupReady, "boolean");
  assert.equal(typeof json.productionEnvValuesApplyGateStatus.summary.targetSetupReportAvailable, "boolean");
  assert.ok(Number.isInteger(json.productionEnvValuesApplyGateStatus.summary.targetSetupEnvFileCount));
  assert.equal(typeof json.productionEnvValuesApplyGateStatus.summary.targetEnvFileConfigured, "boolean");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.valuesFileAuditStatus, "not_run");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.valuesFileAuditReady, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.valuesFileAuditExecuted, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.valuesFileAuditBlockingCount, 0);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.valuesFileAuditWarningCount, 0);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.valuesFileAuditPathExposed, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.valuesFileAuditValuesIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofStatus, "not_included");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofReady, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofStatusLabel, "未纳入");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofFresh, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofFreshnessStatus, "missing");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofFreshnessLabel, "dry-run 证明缺少检查时间");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofMaxAgeHours, 24);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofExpiresAt, "");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofRemainingHours, null);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofCheckedAtIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintStatus, "not_checked");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintStatusLabel, "未检查");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintCompared, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintMatched, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintDigestExposed, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintValuesExposed, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFileUnchangedAfterProof, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofTargetEnvFileUnchangedAfterProof, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofMinimumBlockingLabel, "0/0");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.dryRunProofMinimumBlockingMissingCount, 0);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.intakeVerificationStatus, "blocked");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.intakeVerificationReady, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.intakeVerificationAvailable, true);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumBlockingReady, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumBlockingLabel, "0/12");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumBlockingTargetCount, 12);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumBlockingSatisfiedCount, 0);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumBlockingMissingCount, 12);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumBlockingVariableRowCount, 11);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumBlockingAlternativeGroupCount, 1);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumWarningLabel, "0/8");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumWarningMissingCount, 8);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.fullIntakeConfiguredLabel, "0/23");
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.targetEnvFileMayBeMutated, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.applyExecuted, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.productionEnvFileMutated, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.businessDataMutated, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.schemaMigrationApplyExecuted, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.applyEnableEnvVariable, "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED");
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.applyEnabled, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.primaryEnvVariable, "ERP_V1_PRODUCTION_ENV_VALUES_FILE");
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.configuredValuesFileCount, 0);
  assert.equal(typeof json.productionEnvValuesApplyGateStatus.serverConfigGuidance.targetSetupReady, "boolean");
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.valuesFileAuditStatus, "not_run");
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.valuesFileAuditReady, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.valuesFileAuditPathExposed, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.valuesFileAuditValuesIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofStatus, "not_included");
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofReady, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofFresh, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofMaxAgeHours, 24);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofExpiresAt, "");
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofRemainingHours, null);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofCheckedAtIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofValuesFingerprintStatus, "not_checked");
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofValuesFingerprintCompared, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofValuesFingerprintIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofValuesFingerprintMatched, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofValuesFingerprintDigestExposed, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofValuesFingerprintValuesExposed, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofMinimumBlockingLabel, "0/0");
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.minimumBlockingLabel, "0/12");
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.minimumBlockingMissingCount, 12);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.targetEnvFilePathExposed, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.acceptsFrontendPath, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.pathValueExposed, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.targetSetupStatus.available, true);
  assert.equal(json.productionEnvValuesApplyGateStatus.targetSetupStatus.summary.targetEnvFilePathExposed, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.applyRequiresServerFlag, true);
  assert.equal(typeof json.productionEnvValuesApplyGateStatus.safeguards.targetSetupReady, "boolean");
  assert.equal(typeof json.productionEnvValuesApplyGateStatus.safeguards.targetSetupReportAvailable, "boolean");
  assert.equal(typeof json.productionEnvValuesApplyGateStatus.safeguards.targetEnvFileConfigured, "boolean");
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.valuesFilePathValueIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.envValuesIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.secretValuesIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.localPathExposed, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.valuesFileAuditReady, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.valuesFileAuditPathExposed, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.valuesFileAuditValuesIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.dryRunProofReady, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.dryRunProofIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.dryRunProofFresh, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.dryRunProofMaxAgeHours, 24);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.dryRunProofCheckedAtIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.dryRunProofValuesIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.dryRunProofValuesFingerprintCompared, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.dryRunProofValuesFingerprintIncluded, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.dryRunProofValuesFingerprintMatched, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.dryRunProofValuesFingerprintDigestExposed, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.dryRunProofValuesFingerprintValuesExposed, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.dryRunProofValuesFileUnchangedAfterProof, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.dryRunProofTargetEnvFileUnchangedAfterProof, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.productionEnvFileMutated, false);
  assert.equal(json.productionEnvValuesApplyGateStatus.safeguards.businessDataMutated, false);

  const unsafeValuesDir = join(".erp-local-storage", "tmp-values-fragment-audit-check");
  const unsafeValuesFile = join(unsafeValuesDir, "unsafe-values.env.example");
  mkdirSync(unsafeValuesDir, { recursive: true });
  writeFileSync(
    unsafeValuesFile,
    [
      "ERP_V1_DATABASE_URL=postgres://fake-secret-should-not-leak",
      "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=fake-secret-should-not-leak",
      "",
    ].join("\n"),
  );
  chmodSync(unsafeValuesFile, 0o600);
  process.env.ERP_V1_PRODUCTION_ENV_VALUES_FILE = unsafeValuesFile;
  delete process.env.ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE;
  delete process.env.ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE;

  const unsafeValuesStatusResponse = await fetch(`${baseUrl}/api/system/v1-go-live-status`, {
    headers: {
      "x-erp-user-id": "U-MANAGER-A",
    },
  });
  assert.equal(unsafeValuesStatusResponse.status, 200);
  const unsafeValuesStatusJson = await unsafeValuesStatusResponse.json();
  assert.equal(unsafeValuesStatusJson.productionEnvValuesFragmentSourceStatus.status, "audit_blocked");
  assert.equal(unsafeValuesStatusJson.productionEnvValuesFragmentSourceStatus.ready, false);
  assert.equal(unsafeValuesStatusJson.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditStatus, "blocked");
  assert.equal(unsafeValuesStatusJson.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditReady, false);
  assert.equal(unsafeValuesStatusJson.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditExecuted, true);
  assert.ok(unsafeValuesStatusJson.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditBlockingCount > 0);
  assert.equal(unsafeValuesStatusJson.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditPathExposed, false);
  assert.equal(unsafeValuesStatusJson.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditValuesIncluded, false);
  assert.equal(unsafeValuesStatusJson.productionEnvValuesApplyGateStatus.summary.valuesFileAuditStatus, "blocked");
  assert.equal(unsafeValuesStatusJson.productionEnvValuesApplyGateStatus.summary.valuesFileAuditReady, false);
  assert.equal(unsafeValuesStatusJson.productionEnvValuesApplyGateStatus.summary.targetEnvFileMayBeMutated, false);
  const unsafeValuesStatusSerialized = JSON.stringify(unsafeValuesStatusJson);
  assert.ok(!unsafeValuesStatusSerialized.includes(unsafeValuesFile));
  assert.ok(!unsafeValuesStatusSerialized.includes("fake-secret-should-not-leak"));

  const unsafeValuesDryRunResponse = await fetch(`${baseUrl}/api/system/v1-production-first-stage-values-dry-run/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      valuesFilePath: "/Users/should-not-be-read/values.env",
      fakeSecret: "fake-secret-should-not-leak",
    }),
  });
  assert.equal(unsafeValuesDryRunResponse.status, 200);
  const unsafeValuesDryRunJson = await unsafeValuesDryRunResponse.json();
  assert.equal(unsafeValuesDryRunJson.status, "audit_blocked");
  assert.equal(unsafeValuesDryRunJson.ready, false);
  assert.equal(unsafeValuesDryRunJson.summary.valuesFileAuditStatus, "blocked");
  assert.equal(unsafeValuesDryRunJson.summary.valuesFileAuditReady, false);
  assert.ok(unsafeValuesDryRunJson.summary.valuesFileAuditBlockingCount > 0);
  assert.equal(unsafeValuesDryRunJson.summary.valuesFileAuditPathExposed, false);
  assert.equal(unsafeValuesDryRunJson.summary.valuesFileAuditValuesIncluded, false);
  assert.equal(unsafeValuesDryRunJson.safeguards.valuesFileAuditPathExposed, false);
  assert.equal(unsafeValuesDryRunJson.safeguards.valuesFileAuditValuesIncluded, false);
  const unsafeValuesDryRunSerialized = JSON.stringify(unsafeValuesDryRunJson);
  assert.ok(!unsafeValuesDryRunSerialized.includes(unsafeValuesFile));
  assert.ok(!unsafeValuesDryRunSerialized.includes("/Users/should-not-be-read"));
  assert.ok(!unsafeValuesDryRunSerialized.includes("fake-secret-should-not-leak"));
  restoreProductionEnvValuesFileEnv();
  assert.ok(json.v2Differences.some((item) => item.includes("企业微信")));
  assert.ok(json.moduleV1V2Differences.some((item) => item.module === "订单录入"));
  assert.equal(json.safeguards.nonMutating, true);
  assert.equal(json.safeguards.artifactPathExposed, false);
  assert.equal(json.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(json.safeguards.rawSignersIncluded, false);
  assert.equal(json.safeguards.rawNotesIncluded, false);
  assert.equal(json.safeguards.rawEvidenceItemsCsvIncluded, false);
  assert.equal(json.safeguards.rawSignoffBoundaryCsvIncluded, false);
  assert.equal(json.safeguards.rawFieldEvidenceIntakeRulesIncluded, false);
  assert.equal(json.safeguards.rawFieldEvidenceDraftManifestIncluded, false);
  assert.equal(json.safeguards.rawOnsiteTaskBoardIncluded, false);
  assert.equal(json.safeguards.rawOwnerDecisionBriefIncluded, false);
  assert.equal(json.safeguards.rawRuntimeReadinessReportIncluded, false);
  assert.equal(json.safeguards.rawFieldAcceptanceReportIncluded, false);
  assert.equal(json.safeguards.rawProductionEnvPreflightIncluded, false);
  assert.equal(json.safeguards.rawProductionPersistenceEvidenceIncluded, false);
  assert.equal(json.safeguards.rawEnvFileAuditIncluded, false);
  assert.equal(json.safeguards.rawEnvFileIncluded, false);
  assert.equal(json.safeguards.rawSecretsIncluded, false);
  assert.equal(json.safeguards.environmentValuesIncluded, false);
  assert.equal(json.safeguards.productionEnvValuesIncluded, false);
  assert.equal(json.safeguards.productionEnvMinimumValuesFragmentTemplateValuesIncluded, false);
  assert.equal(json.safeguards.productionEnvValuesFragmentSourceStatusValuesIncluded, false);
  assert.equal(json.safeguards.productionEnvValuesApplyGateStatusValuesIncluded, false);
  assert.equal(json.safeguards.commandValuesIncluded, false);

  const serialized = JSON.stringify(json);
  assert.doesNotMatch(serialized, /\.erp-local-storage/);
  assert.doesNotMatch(serialized, /\/Users\/|\/private\//);
  assert.doesNotMatch(serialized, /"evidenceRef"|evidenceRef|onsiteEvidenceRef|signer \/ signedAt/);
  assert.doesNotMatch(serialized, /onsiteSigner|onsiteSignedAt|onsiteConfirmedBy|onsiteConfirmedAt|onsiteNotes/);
  assert.doesNotMatch(serialized, /"outputFile"/);
  assert.doesNotMatch(serialized, /groups\//);
  assert.doesNotMatch(serialized, /SUPER_SECRET|SECRET_VALUE|pass@prod-db/i);
  assert.doesNotMatch(serialized, /REPLACE_WITH_/);

  const deniedDraftResponse = await fetch(`${baseUrl}/api/system/v1-field-evidence-intake/draft-manifest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(deniedDraftResponse.status, 403, "warehouse should not be allowed to generate V1 field evidence draft manifest");
  const deniedDraftJson = await deniedDraftResponse.json();
  assert.equal(deniedDraftJson.requiredPermission, "system.v1_field_evidence_intake.apply");

  const deniedValidationResponse = await fetch(`${baseUrl}/api/system/v1-field-evidence-intake/validate-draft-manifest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(deniedValidationResponse.status, 403, "warehouse should not be allowed to validate V1 field evidence draft manifest");
  const deniedValidationJson = await deniedValidationResponse.json();
  assert.equal(deniedValidationJson.requiredPermission, "system.v1_field_evidence.validate");

  const deniedProductionEnvPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(deniedProductionEnvPrecheckResponse.status, 403, "warehouse should not be allowed to precheck current V1 production env");
  const deniedProductionEnvPrecheckJson = await deniedProductionEnvPrecheckResponse.json();
  assert.equal(deniedProductionEnvPrecheckJson.requiredPermission, "system.v1_production_env.precheck");

  const deniedProductionEnvSetupResponse = await fetch(`${baseUrl}/api/system/v1-production-env-setup/live-run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedProductionEnvSetupResponse.status,
    403,
    "warehouse should not be allowed to run V1 production env setup",
  );
  const deniedProductionEnvSetupJson = await deniedProductionEnvSetupResponse.json();
  assert.equal(deniedProductionEnvSetupJson.requiredPermission, "system.v1_production_env_setup.run");

  const deniedProductionEnvIntakePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-intake/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedProductionEnvIntakePrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck V1 production env intake",
  );
  const deniedProductionEnvIntakePrecheckJson = await deniedProductionEnvIntakePrecheckResponse.json();
  assert.equal(deniedProductionEnvIntakePrecheckJson.requiredPermission, "system.v1_production_env_intake.precheck");

  const deniedProductionEnvFileAuditPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-audit/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedProductionEnvFileAuditPrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck current V1 production env file audit",
  );
  const deniedProductionEnvFileAuditPrecheckJson = await deniedProductionEnvFileAuditPrecheckResponse.json();
  assert.equal(deniedProductionEnvFileAuditPrecheckJson.requiredPermission, "system.v1_production_env_file_audit.precheck");

  const deniedProductionEnvFilePreviewPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-preview/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedProductionEnvFilePreviewPrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck current V1 production env file preview",
  );
  const deniedProductionEnvFilePreviewPrecheckJson = await deniedProductionEnvFilePreviewPrecheckResponse.json();
  assert.equal(deniedProductionEnvFilePreviewPrecheckJson.requiredPermission, "system.v1_production_env_file_preview.precheck");

  const deniedProductionGoLivePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-go-live/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedProductionGoLivePrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck current V1 production go-live",
  );
  const deniedProductionGoLivePrecheckJson = await deniedProductionGoLivePrecheckResponse.json();
  assert.equal(deniedProductionGoLivePrecheckJson.requiredPermission, "system.v1_production_go_live.precheck");

  const deniedProductionPersistenceEvidenceResponse = await fetch(
    `${baseUrl}/api/system/v1-production-persistence-evidence/live-run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-WAREHOUSE-A",
      },
      body: "{}",
    },
  );
  assert.equal(
    deniedProductionPersistenceEvidenceResponse.status,
    403,
    "warehouse should not be allowed to run production persistence evidence",
  );
  const deniedProductionPersistenceEvidenceJson = await deniedProductionPersistenceEvidenceResponse.json();
  assert.equal(
    deniedProductionPersistenceEvidenceJson.requiredPermission,
    "system.v1_production_persistence_evidence.run",
  );

  const deniedProductionFirstStageExecutionResponse = await fetch(
    `${baseUrl}/api/system/v1-production-first-stage-execution/live-run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-WAREHOUSE-A",
      },
      body: "{}",
    },
  );
  assert.equal(
    deniedProductionFirstStageExecutionResponse.status,
    403,
    "warehouse should not be allowed to run production first-stage execution",
  );
  const deniedProductionFirstStageExecutionJson = await deniedProductionFirstStageExecutionResponse.json();
  assert.equal(
    deniedProductionFirstStageExecutionJson.requiredPermission,
    "system.v1_production_first_stage_execution.run",
  );

  const deniedProductionFirstStageValuesDryRunPrecheckResponse = await fetch(
    `${baseUrl}/api/system/v1-production-first-stage-values-dry-run/live-precheck`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-WAREHOUSE-A",
      },
      body: "{}",
    },
  );
  assert.equal(
    deniedProductionFirstStageValuesDryRunPrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck production first-stage values dry-run",
  );
  const deniedProductionFirstStageValuesDryRunPrecheckJson = await deniedProductionFirstStageValuesDryRunPrecheckResponse.json();
  assert.equal(
    deniedProductionFirstStageValuesDryRunPrecheckJson.requiredPermission,
    "system.v1_production_first_stage_values_dry_run.precheck",
  );

  const deniedProductionFirstStageValuesApplyResponse = await fetch(
    `${baseUrl}/api/system/v1-production-first-stage-values-apply/live-run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-WAREHOUSE-A",
      },
      body: "{}",
    },
  );
  assert.equal(
    deniedProductionFirstStageValuesApplyResponse.status,
    403,
    "warehouse should not be allowed to apply production first-stage values",
  );
  const deniedProductionFirstStageValuesApplyJson = await deniedProductionFirstStageValuesApplyResponse.json();
  assert.equal(
    deniedProductionFirstStageValuesApplyJson.requiredPermission,
    "system.v1_production_first_stage_values_apply.run",
  );

  const deniedPersistencePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-persistence/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(deniedPersistencePrecheckResponse.status, 403, "warehouse should not be allowed to precheck current V1 persistence");
  const deniedPersistencePrecheckJson = await deniedPersistencePrecheckResponse.json();
  assert.equal(deniedPersistencePrecheckJson.requiredPermission, "system.v1_persistence.precheck");

  const deniedAttachmentRetentionPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-attachment-retention/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedAttachmentRetentionPrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck current V1 attachment retention",
  );
  const deniedAttachmentRetentionPrecheckJson = await deniedAttachmentRetentionPrecheckResponse.json();
  assert.equal(deniedAttachmentRetentionPrecheckJson.requiredPermission, "system.v1_attachment_retention.precheck");

  const deniedRuntimeReadinessPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-runtime-readiness/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedRuntimeReadinessPrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck current V1 runtime readiness",
  );
  const deniedRuntimeReadinessPrecheckJson = await deniedRuntimeReadinessPrecheckResponse.json();
  assert.equal(deniedRuntimeReadinessPrecheckJson.requiredPermission, "system.v1_runtime_readiness.precheck");

  const deniedV1V2BoundaryPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-v2-boundary/precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedV1V2BoundaryPrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck V1/V2 boundary",
  );
  const deniedV1V2BoundaryPrecheckJson = await deniedV1V2BoundaryPrecheckResponse.json();
  assert.equal(deniedV1V2BoundaryPrecheckJson.requiredPermission, "system.v1_v2_boundary.precheck");

  const deniedV1V2ScopeBriefRefreshResponse = await fetch(`${baseUrl}/api/system/v1-v2-scope-brief/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedV1V2ScopeBriefRefreshResponse.status,
    403,
    "warehouse should not be allowed to refresh V1/V2 scope brief",
  );
  const deniedV1V2ScopeBriefRefreshJson = await deniedV1V2ScopeBriefRefreshResponse.json();
  assert.equal(deniedV1V2ScopeBriefRefreshJson.requiredPermission, "system.v1_v2_scope_brief.refresh");

  const deniedRefreshPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-release-candidate/refresh-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(deniedRefreshPrecheckResponse.status, 403, "warehouse should not be allowed to precheck V1 release candidate refresh");
  const deniedRefreshPrecheckJson = await deniedRefreshPrecheckResponse.json();
  assert.equal(deniedRefreshPrecheckJson.requiredPermission, "system.v1_release_candidate.refresh_precheck");

  const draftResponse = await fetch(`${baseUrl}/api/system/v1-field-evidence-intake/draft-manifest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: "{}",
  });
  assert.equal(draftResponse.status, 200, "/api/system/v1-field-evidence-intake/draft-manifest should return 200 for management");
  const draftJson = await draftResponse.json();
  assert.equal(draftJson.version, "p0-v1-field-evidence-intake-draft-v1");
  assert.equal(draftJson.scope, "v1_field_evidence_intake_draft_manifest");
  assert.equal(draftJson.status, "blocked_draft_written");
  assert.equal(draftJson.ready, false);
  assert.equal(draftJson.summary.appliedRowCount, 0);
  assert.equal(draftJson.summary.invalidRowCount, 0);
  assert.equal(draftJson.summary.evidenceProgress, "0/34");
  assert.equal(draftJson.summary.signoffProgress, "0/6");
  assert.equal(draftJson.summary.draftManifestStatus, "available");
  assert.equal(draftJson.summary.inputSnapshot.schema, "erp-v1-field-evidence-intake-snapshot-v1");
  assert.equal(draftJson.summary.inputSnapshot.evidenceCsvIncluded, true);
  assert.equal(draftJson.summary.inputSnapshot.evidenceRowCount, 34);
  assert.equal(draftJson.summary.inputSnapshot.signoffBoundaryCsvIncluded, true);
  assert.equal(draftJson.summary.inputSnapshot.signoffBoundaryRowCount, 7);
  assert.equal(draftJson.summary.inputSnapshot.rawCsvIncluded, false);
  assert.equal(draftJson.summary.inputSnapshot.digestValuesIncluded, false);
  assert.equal(draftJson.summary.releaseCandidateRefreshed, false);
  assert.equal(draftJson.output.draftWritten, true);
  assert.equal(draftJson.output.sourceManifestMutated, false);
  assert.equal(draftJson.output.releaseCandidateRefreshed, false);
  assert.equal(draftJson.safeguards.outputWritesDraftOnly, true);
  assert.equal(draftJson.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(draftJson.safeguards.rawSignersIncluded, false);
  assert.equal(draftJson.safeguards.rawCsvIncluded, false);
  assert.equal(draftJson.safeguards.rawFieldEvidenceDraftManifestIncluded, false);
  assert.equal(draftJson.safeguards.inputSnapshotWritten, true);
  assert.equal(draftJson.safeguards.digestValuesIncluded, false);
  assert.equal(draftJson.safeguards.artifactPathExposed, false);
  assert.equal(draftJson.safeguards.localPathExposed, false);
  assert.equal(draftJson.safeguards.releaseCandidateRefreshed, false);
  assert.match(draftJson.nextAction, /不能刷新为 READY/);
  const serializedDraft = JSON.stringify(draftJson);
  assert.doesNotMatch(serializedDraft, /\.erp-local-storage|filled-manifest|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedDraft, /onsiteEvidenceRef|onsiteSigner|onsiteConfirmedBy|evidenceRef/);
  assert.doesNotMatch(serializedDraft, /SUPER_SECRET|SECRET_VALUE|pass@prod-db/i);

  const clientDraftResult = await generateOfficeV1FieldEvidenceDraftManifest(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientDraftResult.source, "api");
  assert.equal(clientDraftResult.blocked, false);
  assert.equal(clientDraftResult.draftResult.statusLabel, "草稿已生成");
  assert.equal(clientDraftResult.draftResult.summary.evidenceProgress, "0/34");
  assert.equal(clientDraftResult.draftResult.summary.signoffProgress, "0/6");
  assert.equal(clientDraftResult.draftResult.summary.draftManifestLabel, "已生成");
  assert.equal(clientDraftResult.draftResult.summary.inputSnapshot.evidenceRowCount, 34);
  assert.equal(clientDraftResult.draftResult.summary.inputSnapshot.signoffBoundaryRowCount, 7);
  assert.equal(clientDraftResult.draftResult.output.draftWritten, true);
  assert.equal(clientDraftResult.draftResult.output.releaseCandidateRefreshed, false);

  const validationResponse = await fetch(`${baseUrl}/api/system/v1-field-evidence-intake/validate-draft-manifest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: "{}",
  });
  assert.equal(validationResponse.status, 200, "/api/system/v1-field-evidence-intake/validate-draft-manifest should return 200 for management");
  const validationJson = await validationResponse.json();
  assert.equal(validationJson.version, "p0-v1-field-evidence-draft-validation-v1");
  assert.equal(validationJson.scope, "v1_field_evidence_draft_manifest_validation");
  assert.equal(validationJson.status, "blocked");
  assert.equal(validationJson.ready, false);
  assert.equal(validationJson.schemaValid, true);
  assert.equal(validationJson.summary.evidenceProgress, "0/34");
  assert.equal(validationJson.summary.signoffProgress, "0/6");
  assert.equal(validationJson.summary.evidenceGroupsReadyLabel, "0/6");
  assert.equal(validationJson.summary.draftManifestStatus, "available");
  assert.equal(validationJson.summary.draftFreshnessStatus, "fresh");
  assert.equal(validationJson.summary.draftFreshnessLabel, "已匹配");
  assert.equal(validationJson.summary.draftFreshnessReady, true);
  assert.equal(validationJson.summary.releaseCandidateRefreshed, false);
  assert.ok(validationJson.summary.blockingIssueCount >= 40);
  assert.ok(validationJson.blockers.length > 0);
  assert.ok(validationJson.groups.length > 0);
  assert.equal(validationJson.boundary.ready, false);
  assert.equal(validationJson.safeguards.draftManifestAvailable, true);
  assert.equal(validationJson.safeguards.sourceManifestMutated, false);
  assert.equal(validationJson.safeguards.draftManifestMutated, false);
  assert.equal(validationJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(validationJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(validationJson.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(validationJson.safeguards.rawSignersIncluded, false);
  assert.equal(validationJson.safeguards.rawFieldEvidenceDraftManifestIncluded, false);
  assert.equal(validationJson.safeguards.fieldEvidenceDraftFreshnessChecked, true);
  assert.equal(validationJson.safeguards.digestValuesIncluded, false);
  assert.equal(validationJson.safeguards.artifactPathExposed, false);
  assert.equal(validationJson.safeguards.localPathExposed, false);
  assert.match(validationJson.nextAction, /不能刷新为 READY/);
  const serializedValidation = JSON.stringify(validationJson);
  assert.doesNotMatch(serializedValidation, /\.erp-local-storage|filled-manifest|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedValidation, /onsiteEvidenceRef|onsiteSigner|onsiteConfirmedBy|evidenceRef/);
  assert.doesNotMatch(serializedValidation, /SUPER_SECRET|SECRET_VALUE|pass@prod-db/i);

  const clientValidationResult = await validateOfficeV1FieldEvidenceDraftManifest(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientValidationResult.source, "api");
  assert.equal(clientValidationResult.blocked, false);
  assert.equal(clientValidationResult.validationResult.statusLabel, "校验未通过");
  assert.equal(clientValidationResult.validationResult.summary.evidenceProgress, "0/34");
  assert.equal(clientValidationResult.validationResult.summary.signoffProgress, "0/6");
  assert.equal(clientValidationResult.validationResult.summary.evidenceGroupsReadyLabel, "0/6");
  assert.equal(clientValidationResult.validationResult.summary.draftManifestLabel, "已生成");
  assert.equal(clientValidationResult.validationResult.summary.draftFreshnessLabel, "已匹配");
  assert.equal(clientValidationResult.validationResult.summary.releaseCandidateRefreshed, false);
  assert.ok(clientValidationResult.validationResult.blockers.length > 0);

  const fieldEvidenceCsvPath = join(process.cwd(), ".erp-local-storage", "v1-field-evidence-intake", "evidence-items.csv");
  const originalFieldEvidenceCsv = readFileSync(fieldEvidenceCsvPath, "utf8");
  writeFileSync(fieldEvidenceCsvPath, `${originalFieldEvidenceCsv}\n`);
  try {
    const staleStatusResponse = await fetch(`${baseUrl}/api/system/v1-go-live-status`, {
      headers: {
        "x-erp-user-id": "U-MANAGER-A",
      },
    });
    assert.equal(staleStatusResponse.status, 200, "V1 go-live status should return stale draft freshness after CSV changes");
    const staleStatusJson = await staleStatusResponse.json();
    assert.equal(staleStatusJson.fieldEvidenceDraftFreshness.status, "stale");
    assert.equal(staleStatusJson.fieldEvidenceDraftFreshness.ready, false);
    assert.equal(staleStatusJson.fieldEvidenceIntakeGuidance.summary.draftFreshnessStatus, "stale");
    assert.equal(staleStatusJson.fieldEvidenceIntakeQuality.summary.draftFreshnessStatus, "stale");
    assert.equal(staleStatusJson.fieldEvidenceIntakeQuality.summary.draftFreshnessLabel, "已过期");
    assert.equal(staleStatusJson.fieldEvidenceIntakeQuality.summary.canRefreshReleaseCandidate, false);
    assert.ok(staleStatusJson.fieldEvidenceIntakeQuality.checks.some((item) => item.key === "draft-freshness" && item.ready === false));

    const staleValidationResponse = await fetch(`${baseUrl}/api/system/v1-field-evidence-intake/validate-draft-manifest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-MANAGER-A",
      },
      body: "{}",
    });
    assert.equal(staleValidationResponse.status, 200, "stale draft validation should still return sanitized validation body");
    const staleValidationJson = await staleValidationResponse.json();
    assert.equal(staleValidationJson.status, "stale");
    assert.equal(staleValidationJson.ready, false);
    assert.equal(staleValidationJson.summary.draftFreshnessStatus, "stale");
    assert.equal(staleValidationJson.summary.draftFreshnessLabel, "已过期");
    assert.ok(staleValidationJson.blockers.some((item) => item.type === "draft_freshness"));

    const staleRefreshPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-release-candidate/refresh-precheck`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-MANAGER-A",
      },
      body: "{}",
    });
    assert.equal(staleRefreshPrecheckResponse.status, 200, "stale refresh precheck should return a blocked precheck");
    const staleRefreshPrecheckJson = await staleRefreshPrecheckResponse.json();
    assert.equal(staleRefreshPrecheckJson.summary.draftFreshnessStatus, "stale");
    assert.equal(staleRefreshPrecheckJson.summary.draftFreshnessReady, false);
    assert.ok(staleRefreshPrecheckJson.blockers.some((item) => item.key === "field-evidence-draft-stale"));
    assert.equal(staleRefreshPrecheckJson.safeguards.draftFreshnessChecked, true);
    assert.equal(staleRefreshPrecheckJson.safeguards.digestValuesIncluded, false);
  } finally {
    writeFileSync(fieldEvidenceCsvPath, originalFieldEvidenceCsv);
  }

  const productionEnvPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", ERP_V1_DATABASE_URL: "SUPER_SECRET" }),
  });
  assert.equal(productionEnvPrecheckResponse.status, 200, "/api/system/v1-production-env/live-precheck should return 200 for management");
  const productionEnvPrecheckJson = await productionEnvPrecheckResponse.json();
  assert.equal(productionEnvPrecheckJson.version, "p0-v1-production-env-live-precheck-v1");
  assert.equal(productionEnvPrecheckJson.scope, "v1_production_env_live_precheck");
  assert.equal(productionEnvPrecheckJson.status, "blocked");
  assert.equal(productionEnvPrecheckJson.ready, false);
  assert.equal(productionEnvPrecheckJson.summary.readinessLabel, "2/11");
  assert.equal(productionEnvPrecheckJson.summary.passedCount, 2);
  assert.equal(productionEnvPrecheckJson.summary.totalCount, 11);
  assert.equal(productionEnvPrecheckJson.summary.blockingCount, 7);
  assert.equal(productionEnvPrecheckJson.summary.warningCount, 2);
  assert.equal(productionEnvPrecheckJson.summary.currentRuntime, true);
  assert.equal(productionEnvPrecheckJson.summary.envFilePathAccepted, false);
  assert.equal(productionEnvPrecheckJson.summary.releaseCandidateRefreshed, false);
  assert.equal(productionEnvPrecheckJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(productionEnvPrecheckJson.checks.length, 11);
  assert.equal(productionEnvPrecheckJson.blockingChecks.length, 7);
  assert.equal(productionEnvPrecheckJson.warningChecks.length, 2);
  assert.ok(
    productionEnvPrecheckJson.blockingChecks.some((item) =>
      item.key === "v1-persistence-profile" &&
      item.missingVariables.includes("ERP_V1_PERSISTENCE_PROFILE=postgres")
    ),
  );
  assert.ok(
    productionEnvPrecheckJson.blockingChecks.some((item) =>
      item.key === "attachment-object-storage-env" &&
      item.missingVariables.includes("ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY")
    ),
  );
  assert.ok(
    productionEnvPrecheckJson.blockingChecks.some((item) =>
      item.key === "postgres-restore-validation-env" &&
      item.missingVariables.includes("ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL")
    ),
  );
  assert.equal(productionEnvPrecheckJson.safeguards.nonMutating, true);
  assert.equal(productionEnvPrecheckJson.safeguards.liveProcessEnvChecked, true);
  assert.equal(productionEnvPrecheckJson.safeguards.requestBodyIgnored, true);
  assert.equal(productionEnvPrecheckJson.safeguards.envFilePathAccepted, false);
  assert.equal(productionEnvPrecheckJson.safeguards.envFileReadByRequest, false);
  assert.equal(productionEnvPrecheckJson.safeguards.rawProductionEnvPreflightIncluded, false);
  assert.equal(productionEnvPrecheckJson.safeguards.rawEnvFileAuditIncluded, false);
  assert.equal(productionEnvPrecheckJson.safeguards.rawEnvFileIncluded, false);
  assert.equal(productionEnvPrecheckJson.safeguards.environmentValuesIncluded, false);
  assert.equal(productionEnvPrecheckJson.safeguards.envValuesIncluded, false);
  assert.equal(productionEnvPrecheckJson.safeguards.commandValuesIncluded, false);
  assert.equal(productionEnvPrecheckJson.safeguards.secretValuesIncluded, false);
  assert.equal(productionEnvPrecheckJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(productionEnvPrecheckJson.safeguards.goLiveSuiteRefreshed, false);
  const serializedProductionEnvPrecheck = JSON.stringify(productionEnvPrecheckJson);
  assert.doesNotMatch(serializedProductionEnvPrecheck, /\.erp-local-storage|filled-manifest|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedProductionEnvPrecheck, /SUPER_SECRET|SECRET_VALUE|pass@prod-db/i);

  const clientProductionEnvPrecheckResult = await precheckOfficeV1ProductionEnv(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientProductionEnvPrecheckResult.source, "api");
  assert.equal(clientProductionEnvPrecheckResult.blocked, false);
  assert.equal(clientProductionEnvPrecheckResult.precheckResult.statusLabel, "仍未通过");
  assert.equal(clientProductionEnvPrecheckResult.precheckResult.summary.readinessLabel, "2/11");
  assert.equal(clientProductionEnvPrecheckResult.precheckResult.summary.currentRuntime, true);
  assert.equal(clientProductionEnvPrecheckResult.precheckResult.summary.envFilePathAccepted, false);
  assert.equal(clientProductionEnvPrecheckResult.precheckResult.summary.releaseCandidateRefreshed, false);
  assert.equal(clientProductionEnvPrecheckResult.precheckResult.blockingChecks.length, 7);

  const productionEnvSetupResponse = await fetch(`${baseUrl}/api/system/v1-production-env-setup/live-run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      targetEnvFilePath: "/Users/should-not-be-read/secure-prod.env",
      importFrom: "/private/should-not-be-read/import.env",
      ERP_V1_DATABASE_URL: "postgres://user:SUPER_SECRET_SETUP@prod-db.internal/erp",
      token: "SUPER_SECRET_SETUP",
    }),
  });
  assert.equal(
    productionEnvSetupResponse.status,
    200,
    "/api/system/v1-production-env-setup/live-run should return 200 for management",
  );
  const productionEnvSetupJson = await productionEnvSetupResponse.json();
  assert.equal(productionEnvSetupJson.version, "p0-v1-production-env-setup-live-run-v1");
  assert.equal(productionEnvSetupJson.scope, "v1_production_env_setup_live_run");
  assert.ok(["ready", "prepared", "blocked", "error"].includes(productionEnvSetupJson.status));
  assert.equal(typeof productionEnvSetupJson.ready, "boolean");
  assert.equal(productionEnvSetupJson.summary.requestBodyIgnored, true);
  assert.equal(productionEnvSetupJson.summary.frontendTargetPathAccepted, false);
  assert.equal(productionEnvSetupJson.summary.frontendImportPathAccepted, false);
  assert.equal(productionEnvSetupJson.summary.frontendEnvValuesAccepted, false);
  assert.equal(productionEnvSetupJson.summary.targetEnvFilePathExposed, false);
  assert.equal(productionEnvSetupJson.summary.productionEnvRealValuesWritten, false);
  assert.equal(productionEnvSetupJson.summary.productionEnvValuesApplyExecuted, false);
  assert.equal(productionEnvSetupJson.summary.businessDataMutated, false);
  assert.equal(productionEnvSetupJson.summary.schemaMigrationApplyExecuted, false);
  assert.equal(productionEnvSetupJson.summary.releaseCandidateRefreshed, false);
  assert.equal(productionEnvSetupJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(productionEnvSetupJson.summary.physicalPrinterCalled, false);
  assert.equal(productionEnvSetupJson.summary.driverDeliveryStatusChanged, false);
  assert.equal(productionEnvSetupJson.setup.envFile.pathExposed, false);
  assert.equal(productionEnvSetupJson.serverConfigGuidance.acceptsFrontendTargetPath, false);
  assert.equal(productionEnvSetupJson.serverConfigGuidance.acceptsFrontendImportPath, false);
  assert.equal(productionEnvSetupJson.serverConfigGuidance.acceptsFrontendEnvValues, false);
  assert.equal(productionEnvSetupJson.serverConfigGuidance.targetEnvFilePathExposed, false);
  assert.equal(productionEnvSetupJson.serverConfigGuidance.forceOverwriteEnabled, false);
  assert.equal(productionEnvSetupJson.serverConfigGuidance.importFromEnabled, false);
  assert.equal(productionEnvSetupJson.safeguards.requestBodyIgnored, true);
  assert.equal(productionEnvSetupJson.safeguards.frontendTargetPathAccepted, false);
  assert.equal(productionEnvSetupJson.safeguards.frontendImportPathAccepted, false);
  assert.equal(productionEnvSetupJson.safeguards.frontendEnvValuesAccepted, false);
  assert.equal(productionEnvSetupJson.safeguards.targetEnvFilePathExposed, false);
  assert.equal(productionEnvSetupJson.safeguards.envValuesIncluded, false);
  assert.equal(productionEnvSetupJson.safeguards.connectionStringExposed, false);
  assert.equal(productionEnvSetupJson.safeguards.objectStorageEndpointExposed, false);
  assert.equal(productionEnvSetupJson.safeguards.objectStorageBucketExposed, false);
  assert.equal(productionEnvSetupJson.safeguards.secretFieldsExposed, false);
  assert.equal(productionEnvSetupJson.safeguards.commandValueExposed, false);
  assert.equal(productionEnvSetupJson.safeguards.spoolPathExposed, false);
  assert.equal(productionEnvSetupJson.safeguards.importedEnvValuesExposed, false);
  assert.equal(productionEnvSetupJson.safeguards.productionEnvRealValuesWritten, false);
  assert.equal(productionEnvSetupJson.safeguards.productionEnvValuesApplyExecuted, false);
  assert.equal(productionEnvSetupJson.safeguards.schemaMigrationApplyExecuted, false);
  assert.equal(productionEnvSetupJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(productionEnvSetupJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(productionEnvSetupJson.safeguards.physicalPrinterCalled, false);
  assert.equal(productionEnvSetupJson.safeguards.driverDeliveryStatusChanged, false);
  assert.equal(productionEnvSetupJson.safeguards.businessDataMutated, false);
  assert.equal(productionEnvSetupJson.safeguards.declaresFullV1Complete, false);
  const serializedProductionEnvSetup = JSON.stringify(productionEnvSetupJson);
  assert.doesNotMatch(serializedProductionEnvSetup, /SUPER_SECRET_SETUP|prod-db\.internal|should-not-be-read|\/Users\/|\/private|\.erp-local-storage|secure-prod\.env/);

  const clientProductionEnvSetupResult = await runOfficeV1ProductionEnvSetup(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientProductionEnvSetupResult.source, "api");
  assert.equal(typeof clientProductionEnvSetupResult.setupResult.ready, "boolean");
  assert.equal(clientProductionEnvSetupResult.setupResult.summary.requestBodyIgnored, true);
  assert.equal(clientProductionEnvSetupResult.setupResult.summary.frontendTargetPathAccepted, false);
  assert.equal(clientProductionEnvSetupResult.setupResult.summary.frontendImportPathAccepted, false);
  assert.equal(clientProductionEnvSetupResult.setupResult.summary.frontendEnvValuesAccepted, false);
  assert.equal(clientProductionEnvSetupResult.setupResult.summary.targetEnvFilePathExposed, false);
  assert.equal(clientProductionEnvSetupResult.setupResult.summary.productionEnvRealValuesWritten, false);
  assert.equal(clientProductionEnvSetupResult.setupResult.serverConfigGuidance.acceptsFrontendTargetPath, false);
  assert.equal(clientProductionEnvSetupResult.setupResult.serverConfigGuidance.targetEnvFilePathExposed, false);
  assert.equal(clientProductionEnvSetupResult.setupResult.safeguards.envValuesIncluded, false);
  assert.equal(clientProductionEnvSetupResult.setupResult.safeguards.releaseCandidateRefreshed, false);

  const productionEnvIntakePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-intake/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      envFilePath: "/Users/should-not-be-read/production.env",
      ERP_V1_DATABASE_URL: "postgres://user:pass@prod-db.internal/erp",
      token: "SUPER_SECRET_ENV_INTAKE",
    }),
  });
  assert.equal(
    productionEnvIntakePrecheckResponse.status,
    200,
    "/api/system/v1-production-env-intake/live-precheck should return 200 for management",
  );
  const productionEnvIntakePrecheckJson = await productionEnvIntakePrecheckResponse.json();
  assert.equal(productionEnvIntakePrecheckJson.version, "p0-v1-production-env-intake-live-precheck-v1");
  assert.equal(productionEnvIntakePrecheckJson.scope, "v1_production_env_intake_live_precheck");
  assert.equal(productionEnvIntakePrecheckJson.status, "blocked");
  assert.equal(productionEnvIntakePrecheckJson.ready, false);
  assert.equal(productionEnvIntakePrecheckJson.summary.configuredLabel, "0/23");
  assert.equal(productionEnvIntakePrecheckJson.summary.fullIntakeConfiguredLabel, "0/23");
  assert.equal(productionEnvIntakePrecheckJson.summary.minimumBlockingLabel, "0/12");
  assert.equal(productionEnvIntakePrecheckJson.summary.minimumWarningLabel, "0/8");
  assert.equal(productionEnvIntakePrecheckJson.summary.blockingCount, 12);
  assert.equal(productionEnvIntakePrecheckJson.summary.warningCount, 8);
  assert.equal(productionEnvIntakePrecheckJson.summary.auditReady, true);
  assert.equal(productionEnvIntakePrecheckJson.summary.intakeCsvReady, true);
  assert.equal(productionEnvIntakePrecheckJson.summary.setupReportAvailable, true);
  assert.equal(productionEnvIntakePrecheckJson.summary.setupReady, true);
  assert.equal(productionEnvIntakePrecheckJson.summary.envFileFromProductionSetup, true);
  assert.equal(productionEnvIntakePrecheckJson.summary.requestBodyIgnored, true);
  assert.equal(productionEnvIntakePrecheckJson.summary.envFilePathAccepted, false);
  assert.equal(productionEnvIntakePrecheckJson.summary.envFilePathExposed, false);
  assert.equal(productionEnvIntakePrecheckJson.summary.intakeCsvPathExposed, false);
  assert.equal(productionEnvIntakePrecheckJson.summary.productionEnvFileMutated, false);
  assert.equal(productionEnvIntakePrecheckJson.summary.productionEnvValuesApplyExecuted, false);
  assert.equal(productionEnvIntakePrecheckJson.summary.businessDataMutated, false);
  assert.equal(productionEnvIntakePrecheckJson.summary.schemaMigrationApplyExecuted, false);
  assert.equal(productionEnvIntakePrecheckJson.summary.releaseCandidateRefreshed, false);
  assert.equal(productionEnvIntakePrecheckJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(productionEnvIntakePrecheckJson.verification.available, true);
  assert.equal(productionEnvIntakePrecheckJson.verification.summary.minimumBlockingLabel, "0/12");
  assert.ok(
    productionEnvIntakePrecheckJson.blockingFindings.some((item) =>
      item.alternativeGroup === "ERP_V1_DATABASE_URL / DATABASE_URL / PGURL"
    ),
    "production env intake live precheck should expose sanitized database alias blocker",
  );
  assert.equal(productionEnvIntakePrecheckJson.serverConfigGuidance.setupReportAvailable, true);
  assert.equal(productionEnvIntakePrecheckJson.serverConfigGuidance.setupReady, true);
  assert.equal(productionEnvIntakePrecheckJson.serverConfigGuidance.acceptsFrontendPath, false);
  assert.equal(productionEnvIntakePrecheckJson.serverConfigGuidance.pathValueExposed, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.nonMutating, true);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.requestBodyIgnored, true);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.envFileReadFromServerProductionSetupOnly, true);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.envFilePathAcceptedFromRequest, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.envFilePathExposed, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.intakeCsvPathExposed, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.rawProductionEnvIntakeVerificationIncluded, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.rawEnvFileIncluded, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.rawEnvLineIncluded, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.envValuesIncluded, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.secretValuesIncluded, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.connectionStringIncluded, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.objectStorageEndpointIncluded, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.objectStorageBucketIncluded, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.commandValuesIncluded, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.localPathExposed, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.productionEnvFileMutated, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.productionEnvValuesApplyExecuted, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.businessDataMutated, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.schemaMigrationApplyExecuted, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(productionEnvIntakePrecheckJson.safeguards.declaresFullV1Complete, false);
  const serializedProductionEnvIntakePrecheck = JSON.stringify(productionEnvIntakePrecheckJson);
  assert.doesNotMatch(serializedProductionEnvIntakePrecheck, /SUPER_SECRET_ENV_INTAKE|postgres:\/\/user:pass|should-not-be-read|\/Users\/|\/private\//);

  const clientProductionEnvIntakePrecheckResult = await precheckOfficeV1ProductionEnvIntake(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientProductionEnvIntakePrecheckResult.source, "api");
  assert.equal(clientProductionEnvIntakePrecheckResult.blocked, true);
  assert.equal(clientProductionEnvIntakePrecheckResult.precheckResult.statusLabel, "仍未通过");
  assert.equal(clientProductionEnvIntakePrecheckResult.precheckResult.summary.configuredLabel, "0/23");
  assert.equal(clientProductionEnvIntakePrecheckResult.precheckResult.summary.minimumBlockingLabel, "0/12");
  assert.equal(clientProductionEnvIntakePrecheckResult.precheckResult.summary.requestBodyIgnored, true);
  assert.equal(clientProductionEnvIntakePrecheckResult.precheckResult.summary.envFilePathAccepted, false);
  assert.equal(clientProductionEnvIntakePrecheckResult.precheckResult.summary.productionEnvFileMutated, false);
  assert.equal(clientProductionEnvIntakePrecheckResult.precheckResult.serverConfigGuidance.acceptsFrontendPath, false);
  assert.equal(clientProductionEnvIntakePrecheckResult.precheckResult.safeguards.envFilePathExposed, false);

  clearProductionEnvFileAuditEnv();
  const productionEnvFileAuditPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-audit/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_ENV_FILE_PATH" }),
  });
  assert.equal(
    productionEnvFileAuditPrecheckResponse.status,
    200,
    "/api/system/v1-production-env-file-audit/live-precheck should return 200 for management when audit path is not configured",
  );
  const productionEnvFileAuditPrecheckJson = await productionEnvFileAuditPrecheckResponse.json();
  assert.equal(productionEnvFileAuditPrecheckJson.version, "p0-v1-production-env-file-audit-live-precheck-v1");
  assert.equal(productionEnvFileAuditPrecheckJson.scope, "v1_production_env_file_audit_live_precheck");
  assert.equal(productionEnvFileAuditPrecheckJson.status, "not_configured");
  assert.equal(productionEnvFileAuditPrecheckJson.ready, false);
  assert.equal(productionEnvFileAuditPrecheckJson.summary.auditStatus, "not_configured");
  assert.equal(productionEnvFileAuditPrecheckJson.summary.auditStatusLabel, "未配置");
  assert.equal(productionEnvFileAuditPrecheckJson.summary.envFileCount, 0);
  assert.equal(productionEnvFileAuditPrecheckJson.summary.configuredEnvFileCount, 0);
  assert.equal(productionEnvFileAuditPrecheckJson.summary.fileCount, 0);
  assert.equal(productionEnvFileAuditPrecheckJson.summary.blockingCount, 1);
  assert.equal(productionEnvFileAuditPrecheckJson.summary.warningCount, 0);
  assert.equal(productionEnvFileAuditPrecheckJson.summary.crossFileDuplicateVariableCount, 0);
  assert.equal(productionEnvFileAuditPrecheckJson.summary.requestBodyIgnored, true);
  assert.equal(productionEnvFileAuditPrecheckJson.summary.envFilePathAccepted, false);
  assert.equal(productionEnvFileAuditPrecheckJson.summary.envFilePathConfigured, false);
  assert.equal(productionEnvFileAuditPrecheckJson.summary.releaseCandidateRefreshed, false);
  assert.equal(productionEnvFileAuditPrecheckJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(productionEnvFileAuditPrecheckJson.serverConfigGuidance.status, "not_configured");
  assert.equal(productionEnvFileAuditPrecheckJson.serverConfigGuidance.primaryEnvVariable, "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS");
  assert.deepEqual(productionEnvFileAuditPrecheckJson.serverConfigGuidance.fallbackEnvVariables, [
    "ERP_V1_PRODUCTION_ENV_FILE",
    "ERP_V1_ENV_FILE",
  ]);
  assert.equal(productionEnvFileAuditPrecheckJson.serverConfigGuidance.configuredEnvFileCount, 0);
  assert.equal(productionEnvFileAuditPrecheckJson.summary.selectedSourceKind, "none");
  assert.equal(productionEnvFileAuditPrecheckJson.summary.fallbackSourceUsed, false);
  assert.equal(productionEnvFileAuditPrecheckJson.summary.configuredSourceVariableCount, 0);
  assert.equal(productionEnvFileAuditPrecheckJson.summary.ignoredConfiguredFallbackVariableCount, 0);
  assert.equal(productionEnvFileAuditPrecheckJson.serverConfigGuidance.selectedEnvVariable, "");
  assert.equal(productionEnvFileAuditPrecheckJson.serverConfigGuidance.selectedSourceKind, "none");
  assert.equal(productionEnvFileAuditPrecheckJson.serverConfigGuidance.fallbackSourceUsed, false);
  assert.equal(productionEnvFileAuditPrecheckJson.serverConfigGuidance.configuredSourceVariableCount, 0);
  assert.equal(productionEnvFileAuditPrecheckJson.serverConfigGuidance.ignoredConfiguredFallbackVariableCount, 0);
  assert.equal(productionEnvFileAuditPrecheckJson.serverConfigGuidance.sourceStatuses.length, 3);
  assert.deepEqual(
    productionEnvFileAuditPrecheckJson.serverConfigGuidance.sourceStatuses.map((item) => item.envVariable),
    ["ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS", "ERP_V1_PRODUCTION_ENV_FILE", "ERP_V1_ENV_FILE"],
  );
  assert.equal(productionEnvFileAuditPrecheckJson.serverConfigGuidance.acceptsFrontendPath, false);
  assert.equal(productionEnvFileAuditPrecheckJson.serverConfigGuidance.pathValueExposed, false);
  assert.equal(productionEnvFileAuditPrecheckJson.serverConfigGuidance.restartRequired, true);
  assert.ok(
    productionEnvFileAuditPrecheckJson.serverConfigGuidance.steps.some((item) =>
      item.includes("ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS"),
    ),
    "not-configured audit guidance should name the server env variable",
  );
  assert.deepEqual(productionEnvFileAuditPrecheckJson.files, []);
  assert.equal(productionEnvFileAuditPrecheckJson.blockingFindings.length, 1);
  assert.equal(productionEnvFileAuditPrecheckJson.blockingFindings[0].key, "server-env-file-audit-path-not-configured");
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.nonMutating, true);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.currentRuntime, true);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.requestBodyIgnored, true);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.envFilePathAccepted, false);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.envFileReadByRequest, false);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.envFilePathExposed, false);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.envFilePathSetupGuidanceIncluded, true);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.rawEnvFileIncluded, false);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.rawEnvFileAuditIncluded, false);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.rawLineContentIncluded, false);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.commentsCopied, false);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.envValuesIncluded, false);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.secretValuesIncluded, false);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.commandValuesIncluded, false);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.connectionStringExposed, false);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(productionEnvFileAuditPrecheckJson.safeguards.goLiveSuiteRefreshed, false);
  const serializedProductionEnvFileAuditPrecheck = JSON.stringify(productionEnvFileAuditPrecheckJson);
  assert.doesNotMatch(serializedProductionEnvFileAuditPrecheck, /SUPER_SECRET_ENV_FILE_PATH|\/Users\/|\/private\//);

  const clientProductionEnvFileAuditPrecheckResult = await precheckOfficeV1ProductionEnvFileAudit(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientProductionEnvFileAuditPrecheckResult.source, "api");
  assert.equal(clientProductionEnvFileAuditPrecheckResult.blocked, false);
  assert.equal(clientProductionEnvFileAuditPrecheckResult.precheckResult.statusLabel, "未配置");
  assert.equal(clientProductionEnvFileAuditPrecheckResult.precheckResult.summary.envFilePathConfigured, false);
  assert.equal(clientProductionEnvFileAuditPrecheckResult.precheckResult.summary.envFilePathAccepted, false);
  assert.equal(clientProductionEnvFileAuditPrecheckResult.precheckResult.summary.selectedSourceKind, "none");
  assert.equal(clientProductionEnvFileAuditPrecheckResult.precheckResult.summary.blockingLabel, "1 项");
  assert.equal(clientProductionEnvFileAuditPrecheckResult.precheckResult.serverConfigGuidance.primaryEnvVariable, "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS");
  assert.equal(clientProductionEnvFileAuditPrecheckResult.precheckResult.serverConfigGuidance.selectedSourceKind, "none");
  assert.equal(clientProductionEnvFileAuditPrecheckResult.precheckResult.serverConfigGuidance.sourceStatuses.length, 3);
  assert.equal(clientProductionEnvFileAuditPrecheckResult.precheckResult.serverConfigGuidance.acceptsFrontendPath, false);
  assert.equal(clientProductionEnvFileAuditPrecheckResult.precheckResult.serverConfigGuidance.pathValueExposed, false);
  assert.equal(clientProductionEnvFileAuditPrecheckResult.precheckResult.safeguards.envFilePathExposed, false);

  const productionEnvFilePreviewPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-preview/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", ERP_V1_DATABASE_URL: "SUPER_SECRET_FILE_PREVIEW" }),
  });
  assert.equal(
    productionEnvFilePreviewPrecheckResponse.status,
    200,
    "/api/system/v1-production-env-file-preview/live-precheck should return 200 for management when env file path is not configured",
  );
  const productionEnvFilePreviewPrecheckJson = await productionEnvFilePreviewPrecheckResponse.json();
  assert.equal(productionEnvFilePreviewPrecheckJson.version, "p0-v1-production-env-file-preview-live-precheck-v1");
  assert.equal(productionEnvFilePreviewPrecheckJson.scope, "v1_production_env_file_preview_live_precheck");
  assert.equal(productionEnvFilePreviewPrecheckJson.status, "not_configured");
  assert.equal(productionEnvFilePreviewPrecheckJson.ready, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.summary.envFilePathConfigured, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.summary.appliedInMemory, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.summary.processEnvMutated, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.summary.envPreflightReady, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.summary.envFileAuditReady, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.summary.envFileAuditBlockingCount, 1);
  assert.equal(productionEnvFilePreviewPrecheckJson.summary.currentStage, "server_env_file_path");
  assert.equal(productionEnvFilePreviewPrecheckJson.summary.stageStatus, "not_configured");
  assert.equal(productionEnvFilePreviewPrecheckJson.summary.selectedSourceKind, "none");
  assert.equal(productionEnvFilePreviewPrecheckJson.summary.fallbackSourceUsed, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.summary.configuredSourceVariableCount, 0);
  assert.equal(productionEnvFilePreviewPrecheckJson.summary.sourceStatuses.length, 3);
  assert.deepEqual(
    productionEnvFilePreviewPrecheckJson.summary.sourceStatuses.map((item) => item.envVariable),
    ["ERP_V1_PRODUCTION_ENV_FILE", "ERP_V1_ENV_FILE", "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS"],
  );
  assert.equal(productionEnvFilePreviewPrecheckJson.summary.envFilePathAccepted, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.stageDiagnosis.currentStage, "server_env_file_path");
  assert.equal(productionEnvFilePreviewPrecheckJson.stageDiagnosis.currentStageLabel, "服务端路径配置");
  assert.equal(productionEnvFilePreviewPrecheckJson.stageDiagnosis.stageStatus, "not_configured");
  assert.equal(productionEnvFilePreviewPrecheckJson.stageDiagnosis.nextStage, "env_file_audit");
  assert.equal(productionEnvFilePreviewPrecheckJson.stageDiagnosis.auditReady, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.stageDiagnosis.envPreflightReady, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.stageDiagnosis.appliedInMemory, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.stageDiagnosis.processEnvMutated, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.stageDiagnosis.selectedSourceKind, "none");
  assert.equal(productionEnvFilePreviewPrecheckJson.stageDiagnosis.fallbackSourceUsed, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.stageDiagnosis.sourceStatuses.length, 3);
  assert.equal(productionEnvFilePreviewPrecheckJson.stageDiagnosis.pathValueExposed, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.blockingChecks.length, 1);
  assert.equal(productionEnvFilePreviewPrecheckJson.blockingChecks[0].key, "server-env-file-preview-path-not-configured");
  assert.equal(productionEnvFilePreviewPrecheckJson.safeguards.nonMutating, true);
  assert.equal(productionEnvFilePreviewPrecheckJson.safeguards.requestBodyIgnored, true);
  assert.equal(productionEnvFilePreviewPrecheckJson.safeguards.envFilePathAccepted, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.safeguards.envFileReadByRequest, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.safeguards.envFilePathExposed, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.safeguards.envFileValuesAppliedInMemoryOnly, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.safeguards.processEnvMutated, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.safeguards.envValuesIncluded, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.safeguards.secretValuesIncluded, false);
  assert.equal(productionEnvFilePreviewPrecheckJson.safeguards.commandValuesIncluded, false);
  const serializedProductionEnvFilePreviewPrecheck = JSON.stringify(productionEnvFilePreviewPrecheckJson);
  assert.doesNotMatch(serializedProductionEnvFilePreviewPrecheck, /SUPER_SECRET_FILE_PREVIEW|\/Users\/|\/private\//);

  const clientProductionEnvFilePreviewPrecheckResult = await precheckOfficeV1ProductionEnvFilePreview(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientProductionEnvFilePreviewPrecheckResult.source, "api");
  assert.equal(clientProductionEnvFilePreviewPrecheckResult.blocked, false);
  assert.equal(clientProductionEnvFilePreviewPrecheckResult.precheckResult.statusLabel, "未配置");
  assert.equal(clientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.envFilePathConfigured, false);
  assert.equal(clientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.appliedInMemory, false);
  assert.equal(clientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.processEnvMutated, false);
  assert.equal(clientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.currentStage, "server_env_file_path");
  assert.equal(clientProductionEnvFilePreviewPrecheckResult.precheckResult.stageDiagnosis.stageStatus, "not_configured");
  assert.equal(clientProductionEnvFilePreviewPrecheckResult.precheckResult.stageDiagnosis.selectedSourceKind, "none");

  const productionGoLivePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-go-live/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_GO_LIVE" }),
  });
  assert.equal(
    productionGoLivePrecheckResponse.status,
    200,
    "/api/system/v1-production-go-live/live-precheck should return 200 for management when env file path is not configured",
  );
  const productionGoLivePrecheckJson = await productionGoLivePrecheckResponse.json();
  assert.equal(productionGoLivePrecheckJson.version, "p0-v1-production-go-live-live-precheck-v1");
  assert.equal(productionGoLivePrecheckJson.scope, "v1_production_go_live_live_precheck");
  assert.equal(productionGoLivePrecheckJson.status, "blocked");
  assert.equal(productionGoLivePrecheckJson.ready, false);
  assert.equal(productionGoLivePrecheckJson.summary.totalCount, 5);
  assert.equal(productionGoLivePrecheckJson.summary.configuredEnvFileCount, 0);
  assert.equal(productionGoLivePrecheckJson.summary.sourceStatuses.length, 3);
  assert.deepEqual(
    productionGoLivePrecheckJson.summary.sourceStatuses.map((item) => item.envVariable),
    ["ERP_V1_PRODUCTION_ENV_FILE", "ERP_V1_ENV_FILE", "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS"],
  );
  assert.equal(productionGoLivePrecheckJson.summary.currentRuntime, true);
  assert.equal(productionGoLivePrecheckJson.summary.requestBodyIgnored, true);
  assert.equal(productionGoLivePrecheckJson.summary.envFilePathAccepted, false);
  assert.equal(productionGoLivePrecheckJson.summary.productionEnvAppliedToProcess, false);
  assert.equal(productionGoLivePrecheckJson.summary.releaseCandidateRefreshed, false);
  assert.equal(productionGoLivePrecheckJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(productionGoLivePrecheckJson.summary.physicalPrinterCalled, false);
  assert.equal(productionGoLivePrecheckJson.stages.length, 5);
  assert.equal(productionGoLivePrecheckJson.unblockChecklist.length, 5);
  assert.ok(
    productionGoLivePrecheckJson.stages.some((item) => item.key === "production-env-intake-verify"),
    "production go-live live precheck should include production env intake verification stage",
  );
  assert.equal(productionGoLivePrecheckJson.fieldEvidenceCoverage.summary.totalCount, 10);
  assert.equal(productionGoLivePrecheckJson.fieldEvidenceCoverage.summary.reportSupportedLabel, "0/10");
  assert.ok(
    productionGoLivePrecheckJson.fieldEvidenceCoverage.items.some(
      (item) => item.itemKey === "production_env_preflight_10_of_10" && item.status === "waiting_for_stage",
    ),
    "unconfigured production go-live precheck should show production env evidence waiting for the env stage",
  );
  assert.ok(productionGoLivePrecheckJson.unblockChecklist.some((item) => item.key === "production-env-file-audit"));
  assert.ok(
    productionGoLivePrecheckJson.unblockChecklist.some((item) =>
      item.verificationSteps?.some((step) => step.includes("run-v1-production-go-live-precheck")),
    ),
    "production go-live response should include stage verification steps",
  );
  assert.ok(productionGoLivePrecheckJson.blockingStages.some((item) => item.key === "production-env-file-audit"));
  assert.ok(productionGoLivePrecheckJson.blockingStages.some((item) => item.key === "runtime-production-profile"));
  assert.equal(productionGoLivePrecheckJson.safeguards.nonMutating, true);
  assert.equal(productionGoLivePrecheckJson.safeguards.currentRuntime, true);
  assert.equal(productionGoLivePrecheckJson.safeguards.requestBodyIgnored, true);
  assert.equal(productionGoLivePrecheckJson.safeguards.envFilePathAccepted, false);
  assert.equal(productionGoLivePrecheckJson.safeguards.envFileReadByRequest, false);
  assert.equal(productionGoLivePrecheckJson.safeguards.envFilePathExposed, false);
  assert.equal(productionGoLivePrecheckJson.safeguards.rawProductionGoLivePrecheckIncluded, false);
  assert.equal(productionGoLivePrecheckJson.safeguards.rawProductionEnvPreflightIncluded, false);
  assert.equal(productionGoLivePrecheckJson.safeguards.rawRuntimeReadinessReportIncluded, false);
  assert.equal(productionGoLivePrecheckJson.safeguards.rawEnvFileAuditIncluded, false);
  assert.equal(productionGoLivePrecheckJson.safeguards.rawEnvFileIncluded, false);
  assert.equal(productionGoLivePrecheckJson.safeguards.envValuesIncluded, false);
  assert.equal(productionGoLivePrecheckJson.safeguards.secretValuesIncluded, false);
  assert.equal(productionGoLivePrecheckJson.safeguards.commandValuesIncluded, false);
  assert.equal(productionGoLivePrecheckJson.safeguards.localPathExposed, false);
  assert.equal(productionGoLivePrecheckJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(productionGoLivePrecheckJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(productionGoLivePrecheckJson.safeguards.physicalPrinterCalled, false);
  const serializedProductionGoLivePrecheck = JSON.stringify(productionGoLivePrecheckJson);
  assert.doesNotMatch(serializedProductionGoLivePrecheck, /SUPER_SECRET_GO_LIVE|\/Users\/|\/private\//);

  const clientProductionGoLivePrecheckResult = await precheckOfficeV1ProductionGoLive(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientProductionGoLivePrecheckResult.source, "api");
  assert.equal(clientProductionGoLivePrecheckResult.blocked, true);
  assert.equal(clientProductionGoLivePrecheckResult.precheckResult.statusLabel, "仍未通过");
  assert.equal(clientProductionGoLivePrecheckResult.precheckResult.summary.configuredEnvFileCount, 0);
  assert.equal(clientProductionGoLivePrecheckResult.precheckResult.summary.sourceStatuses.length, 3);
  assert.equal(clientProductionGoLivePrecheckResult.precheckResult.summary.currentRuntime, true);
  assert.equal(clientProductionGoLivePrecheckResult.precheckResult.summary.envFilePathAccepted, false);
  assert.equal(clientProductionGoLivePrecheckResult.precheckResult.summary.productionEnvAppliedToProcess, false);
  assert.equal(clientProductionGoLivePrecheckResult.precheckResult.summary.releaseCandidateRefreshed, false);
  assert.equal(clientProductionGoLivePrecheckResult.precheckResult.stages.length, 5);
  assert.equal(clientProductionGoLivePrecheckResult.precheckResult.unblockChecklist.length, 5);
  assert.ok(
    clientProductionGoLivePrecheckResult.precheckResult.stages.some((item) => item.key === "production-env-intake-verify"),
    "client should preserve production env intake verification stage",
  );
  assert.equal(clientProductionGoLivePrecheckResult.precheckResult.fieldEvidenceCoverage.summary.reportSupportedLabel, "0/10");
  assert.ok(
    clientProductionGoLivePrecheckResult.precheckResult.fieldEvidenceCoverage.items.some(
      (item) => item.itemKey === "production_env_preflight_10_of_10",
    ),
    "client should preserve production go-live field evidence coverage items",
  );
  assert.ok(
    clientProductionGoLivePrecheckResult.precheckResult.blockingStages.some((item) => item.key === "production-env-file-audit"),
  );

  const productionPersistenceEvidenceResponse = await fetch(
    `${baseUrl}/api/system/v1-production-persistence-evidence/live-run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-MANAGER-A",
      },
      body: JSON.stringify({
        envFilePath: "/Users/should-not-be-read/.env",
        valuesFilePath: "/Users/should-not-be-read/values.env",
        apiBaseUrl: "http://SUPER_SECRET_PERSISTENCE_EVIDENCE_API.invalid/api",
        token: "SUPER_SECRET_PERSISTENCE_EVIDENCE",
      }),
    },
  );
  assert.equal(
    productionPersistenceEvidenceResponse.status,
    200,
    "/api/system/v1-production-persistence-evidence/live-run should return 200 for management with current blocked env",
  );
  const productionPersistenceEvidenceJson = await productionPersistenceEvidenceResponse.json();
  assert.equal(productionPersistenceEvidenceJson.version, "p0-v1-production-persistence-evidence-live-run-v1");
  assert.equal(productionPersistenceEvidenceJson.scope, "v1_production_persistence_evidence_live_run");
  assert.equal(productionPersistenceEvidenceJson.ready, false);
  assert.equal(productionPersistenceEvidenceJson.summary.requestBodyIgnored, true);
  assert.equal(productionPersistenceEvidenceJson.summary.envFileFromProductionSetup, true);
  assert.equal(productionPersistenceEvidenceJson.summary.envFilePathAccepted, false);
  assert.equal(productionPersistenceEvidenceJson.summary.envFilePathExposed, false);
  assert.equal(productionPersistenceEvidenceJson.summary.schemaMigrationApplyExecuted, false);
  assert.equal(productionPersistenceEvidenceJson.summary.restoreResetExplicitlyAllowed, false);
  assert.equal(productionPersistenceEvidenceJson.summary.businessDataMutated, false);
  assert.equal(productionPersistenceEvidenceJson.summary.releaseCandidateRefreshed, false);
  assert.equal(productionPersistenceEvidenceJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(productionPersistenceEvidenceJson.summary.physicalPrinterCalled, false);
  assert.equal(productionPersistenceEvidenceJson.summary.driverDeliveryStatusChanged, false);
  assert.equal(productionPersistenceEvidenceJson.persistenceEvidence.available, true);
  assert.equal(productionPersistenceEvidenceJson.persistenceEvidence.envFileFromProductionSetup, true);
  assert.equal(typeof productionPersistenceEvidenceJson.summary.postgresReady, "boolean");
  assert.equal(typeof productionPersistenceEvidenceJson.summary.objectStorageReady, "boolean");
  assert.equal(productionPersistenceEvidenceJson.serverConfigGuidance.acceptsFrontendPath, false);
  assert.equal(productionPersistenceEvidenceJson.serverConfigGuidance.pathValueExposed, false);
  assert.equal(productionPersistenceEvidenceJson.serverConfigGuidance.applyMigrationsByDefault, false);
  assert.equal(productionPersistenceEvidenceJson.serverConfigGuidance.restoreResetAllowedByDefault, false);
  assert.equal(productionPersistenceEvidenceJson.serverConfigGuidance.writesBusinessData, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.requestBodyIgnored, true);
  assert.equal(productionPersistenceEvidenceJson.safeguards.envFilePathAcceptedFromRequest, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.envFilePathExposed, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.envValuesIncluded, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.secretValuesIncluded, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.connectionStringIncluded, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.objectStorageEndpointIncluded, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.objectStorageBucketIncluded, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.commandValuesIncluded, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.localPathExposed, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.schemaMigrationApplyExecuted, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.restoreResetExplicitlyAllowed, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.businessDataMutated, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.physicalPrinterCalled, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(productionPersistenceEvidenceJson.safeguards.declaresFullV1Complete, false);
  const serializedProductionPersistenceEvidence = JSON.stringify(productionPersistenceEvidenceJson);
  assert.doesNotMatch(serializedProductionPersistenceEvidence, /SUPER_SECRET_PERSISTENCE_EVIDENCE|SUPER_SECRET_PERSISTENCE_EVIDENCE_API|\/Users\/|\/private|values\.env|\.erp-local-storage/);

  const clientProductionPersistenceEvidenceResult = await runOfficeV1ProductionPersistenceEvidence(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientProductionPersistenceEvidenceResult.source, "api");
  assert.equal(clientProductionPersistenceEvidenceResult.blocked, true);
  assert.equal(clientProductionPersistenceEvidenceResult.evidenceResult.statusLabel, "仍未通过");
  assert.equal(clientProductionPersistenceEvidenceResult.evidenceResult.summary.envFileFromProductionSetup, true);
  assert.equal(clientProductionPersistenceEvidenceResult.evidenceResult.summary.envFilePathAccepted, false);
  assert.equal(clientProductionPersistenceEvidenceResult.evidenceResult.summary.envFilePathExposed, false);
  assert.equal(clientProductionPersistenceEvidenceResult.evidenceResult.summary.schemaMigrationApplyExecuted, false);
  assert.equal(clientProductionPersistenceEvidenceResult.evidenceResult.summary.restoreResetExplicitlyAllowed, false);
  assert.equal(clientProductionPersistenceEvidenceResult.evidenceResult.serverConfigGuidance.acceptsFrontendPath, false);
  assert.equal(clientProductionPersistenceEvidenceResult.evidenceResult.serverConfigGuidance.writesBusinessData, false);
  assert.equal(clientProductionPersistenceEvidenceResult.evidenceResult.safeguards.releaseCandidateRefreshed, false);

  const productionFirstStageExecutionResponse = await fetch(
    `${baseUrl}/api/system/v1-production-first-stage-execution/live-run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-MANAGER-A",
      },
      body: JSON.stringify({
        envFilePath: "/Users/should-not-be-read/.env",
        valuesFilePath: "/Users/should-not-be-read/values.env",
        apiBaseUrl: "http://SUPER_SECRET_FIRST_STAGE_API.invalid/api",
        token: "SUPER_SECRET_FIRST_STAGE",
      }),
    },
  );
  assert.equal(
    productionFirstStageExecutionResponse.status,
    200,
    "/api/system/v1-production-first-stage-execution/live-run should return 200 for management with current blocked env",
  );
  const productionFirstStageExecutionJson = await productionFirstStageExecutionResponse.json();
  assert.equal(productionFirstStageExecutionJson.version, "p0-v1-production-first-stage-execution-live-run-v1");
  assert.equal(productionFirstStageExecutionJson.scope, "v1_production_first_stage_execution_live_run");
  assert.equal(productionFirstStageExecutionJson.ready, false);
  assert.equal(productionFirstStageExecutionJson.summary.requestBodyIgnored, true);
  assert.equal(productionFirstStageExecutionJson.summary.envFilePathAccepted, false);
  assert.equal(productionFirstStageExecutionJson.summary.envFilePathExposed, false);
  assert.equal(productionFirstStageExecutionJson.summary.productionEnvValuesFileAccepted, false);
  assert.equal(productionFirstStageExecutionJson.summary.productionEnvValuesApplyExecuted, false);
  assert.equal(productionFirstStageExecutionJson.summary.productionEnvFileMutated, false);
  assert.equal(productionFirstStageExecutionJson.summary.applyMigrations, false);
  assert.equal(productionFirstStageExecutionJson.summary.schemaMigrationApplyExecuted, false);
  assert.equal(productionFirstStageExecutionJson.summary.runtimeSmokeUsesCurrentApi, true);
  assert.equal(productionFirstStageExecutionJson.summary.runtimeSmokeApiBaseUrlAccepted, false);
  assert.equal(productionFirstStageExecutionJson.summary.runtimeSmokeApiBaseUrlExposed, false);
  assert.equal(productionFirstStageExecutionJson.summary.restoreResetExplicitlyAllowed, false);
  assert.equal(productionFirstStageExecutionJson.summary.businessDataMutated, false);
  assert.equal(productionFirstStageExecutionJson.summary.releaseCandidateRefreshed, false);
  assert.equal(productionFirstStageExecutionJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(productionFirstStageExecutionJson.summary.physicalPrinterCalled, false);
  assert.equal(productionFirstStageExecutionJson.summary.driverDeliveryStatusChanged, false);
  assert.equal(productionFirstStageExecutionJson.firstStageExecution.available, true);
  assert.equal(productionFirstStageExecutionJson.firstStageExecution.execution.envFileFromProductionSetup, true);
  assert.equal(productionFirstStageExecutionJson.firstStageExecution.execution.applyMigrations, false);
  assert.equal(productionFirstStageExecutionJson.firstStageExecution.execution.restoreResetExplicitlyAllowed, false);
  assert.equal(productionFirstStageExecutionJson.firstStageExecution.intakeCoverage.included, true);
  assert.equal(productionFirstStageExecutionJson.firstStageExecution.intakeCoverage.fullIntakeConfiguredLabel, "0/23");
  assert.equal(productionFirstStageExecutionJson.firstStageExecution.intakeCoverage.minimumBlockingLabel, "0/12");
  assert.equal(productionFirstStageExecutionJson.firstStageExecution.intakeCoverage.minimumBlockingMissingCount, 12);
  assert.equal(productionFirstStageExecutionJson.serverConfigGuidance.acceptsFrontendPath, false);
  assert.equal(productionFirstStageExecutionJson.serverConfigGuidance.applyMigrationsByDefault, false);
  assert.equal(productionFirstStageExecutionJson.serverConfigGuidance.restoreResetAllowedByDefault, false);
  assert.equal(productionFirstStageExecutionJson.serverConfigGuidance.productionEnvValuesFileAccepted, false);
  assert.equal(productionFirstStageExecutionJson.serverConfigGuidance.runtimeSmokeApiBaseUrlSource, "current-request");
  assert.equal(productionFirstStageExecutionJson.serverConfigGuidance.runtimeSmokeApiBaseUrlAcceptedFromFrontend, false);
  assert.equal(productionFirstStageExecutionJson.serverConfigGuidance.runtimeSmokeApiBaseUrlExposed, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.requestBodyIgnored, true);
  assert.equal(productionFirstStageExecutionJson.safeguards.envFilePathAcceptedFromRequest, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.envFilePathExposed, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.apiBaseUrlAcceptedFromRequest, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.apiBaseUrlReadFromCurrentRequest, true);
  assert.equal(productionFirstStageExecutionJson.safeguards.apiBaseUrlExposed, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.productionEnvValuesApplyExecuted, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.productionEnvFileMutated, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.envValuesIncluded, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.environmentValuesIncluded, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.secretValuesIncluded, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.connectionStringIncluded, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.objectStorageEndpointIncluded, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.objectStorageBucketIncluded, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.commandValuesIncluded, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.localPathExposed, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.currentApiBaseUrlExposed, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.schemaMigrationApplyExecuted, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.restoreResetExplicitlyAllowed, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(productionFirstStageExecutionJson.safeguards.declaresFullV1Complete, false);
  const serializedProductionFirstStageExecution = JSON.stringify(productionFirstStageExecutionJson);
  assert.doesNotMatch(serializedProductionFirstStageExecution, /SUPER_SECRET_FIRST_STAGE|SUPER_SECRET_FIRST_STAGE_API|\/Users\/|\/private|values\.env/);

  const clientProductionFirstStageExecutionResult = await runOfficeV1ProductionFirstStageExecution(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientProductionFirstStageExecutionResult.source, "api");
  assert.equal(clientProductionFirstStageExecutionResult.blocked, true);
  assert.equal(clientProductionFirstStageExecutionResult.executionResult.statusLabel, "仍未通过");
  assert.equal(clientProductionFirstStageExecutionResult.executionResult.summary.envFilePathAccepted, false);
  assert.equal(clientProductionFirstStageExecutionResult.executionResult.summary.runtimeSmokeApiBaseUrlAccepted, false);
  assert.equal(clientProductionFirstStageExecutionResult.executionResult.summary.runtimeSmokeApiBaseUrlExposed, false);
  assert.equal(clientProductionFirstStageExecutionResult.executionResult.serverConfigGuidance.runtimeSmokeApiBaseUrlAcceptedFromFrontend, false);
  assert.equal(clientProductionFirstStageExecutionResult.executionResult.summary.schemaMigrationApplyExecuted, false);
  assert.equal(clientProductionFirstStageExecutionResult.executionResult.summary.restoreResetExplicitlyAllowed, false);
  assert.equal(clientProductionFirstStageExecutionResult.executionResult.serverConfigGuidance.acceptsFrontendPath, false);
  assert.equal(clientProductionFirstStageExecutionResult.executionResult.safeguards.releaseCandidateRefreshed, false);

  clearProductionEnvValuesFileEnv();
  const productionFirstStageValuesDryRunPrecheckResponse = await fetch(
    `${baseUrl}/api/system/v1-production-first-stage-values-dry-run/live-precheck`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-MANAGER-A",
      },
      body: JSON.stringify({
        valuesFilePath: "/Users/should-not-be-read/.env",
        token: "SUPER_SECRET_VALUES",
      }),
    },
  );
  assert.equal(
    productionFirstStageValuesDryRunPrecheckResponse.status,
    200,
    "/api/system/v1-production-first-stage-values-dry-run/live-precheck should return 200 for management when values file is not configured",
  );
  const productionFirstStageValuesDryRunPrecheckJson = await productionFirstStageValuesDryRunPrecheckResponse.json();
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.version, "p0-v1-production-first-stage-values-dry-run-live-precheck-v1");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.scope, "v1_production_first_stage_values_dry_run_live_precheck");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.status, "not_configured");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.ready, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.configuredValuesFileCount, 0);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.valuesFilePathConfigured, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.requestBodyIgnored, true);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.valuesFilePathAccepted, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.valuesFilePathExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.targetEnvFromProductionSetup, true);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.targetEnvFilePathExposed, false);
  assert.equal(typeof productionFirstStageValuesDryRunPrecheckJson.summary.targetSetupStatus, "string");
  assert.equal(typeof productionFirstStageValuesDryRunPrecheckJson.summary.targetSetupReady, "boolean");
  assert.equal(typeof productionFirstStageValuesDryRunPrecheckJson.summary.targetSetupReportAvailable, "boolean");
  assert.equal(typeof productionFirstStageValuesDryRunPrecheckJson.summary.targetSetupEnvFileCount, "number");
  assert.equal(typeof productionFirstStageValuesDryRunPrecheckJson.summary.targetEnvFileConfigured, "boolean");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.valuesFileAuditStatus, "not_run");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.valuesFileAuditReady, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.valuesFileAuditExecuted, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.valuesFileAuditBlockingCount, 0);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.valuesFileAuditPathExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.valuesFileAuditValuesIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.dryRunProofStatus, "not_included");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.dryRunProofReady, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.dryRunProofIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.dryRunProofMinimumBlockingLabel, "0/0");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.dryRunProofMinimumBlockingMissingCount, 0);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.dryRunProofValuesFingerprintStatus, "not_checked");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.dryRunProofValuesFingerprintStatusLabel, "未检查");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.dryRunProofValuesFingerprintCompared, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.dryRunProofValuesFingerprintIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.dryRunProofValuesFingerprintMatched, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.dryRunProofValuesFingerprintDigestExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.dryRunProofValuesFingerprintValuesExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.productionEnvFileMutated, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.businessDataMutated, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.schemaMigrationApplyExecuted, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.releaseCandidateRefreshed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.summary.blockingCount, 1);
  assert.deepEqual(
    productionFirstStageValuesDryRunPrecheckJson.summary.sourceStatuses.map((item) => item.envVariable),
    [
      "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
      "ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE",
      "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE",
    ],
  );
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.blockingItems.length, 1);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.blockingItems[0].key, "production-env-values-file-not-configured");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.primaryEnvVariable, "ERP_V1_PRODUCTION_ENV_VALUES_FILE");
  assert.deepEqual(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.fallbackEnvVariables, [
    "ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE",
    "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE",
  ]);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.configuredValuesFileCount, 0);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.selectedSourceKind, "none");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.acceptsFrontendPath, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.pathValueExposed, false);
  assert.equal(typeof productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.targetSetupReady, "boolean");
  assert.equal(typeof productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.targetSetupReportAvailable, "boolean");
  assert.equal(typeof productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.targetSetupEnvFileCount, "number");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.valuesFileAuditStatus, "not_run");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.valuesFileAuditReady, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.valuesFileAuditPathExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.valuesFileAuditValuesIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.dryRunProofStatus, "not_included");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.dryRunProofReady, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.dryRunProofIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.dryRunProofValuesFingerprintStatus, "not_checked");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.dryRunProofValuesFingerprintCompared, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.dryRunProofValuesFingerprintIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.dryRunProofValuesFingerprintMatched, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.dryRunProofValuesFingerprintDigestExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.dryRunProofValuesFingerprintValuesExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.targetEnvFilePathExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.dryRunProofStatus.ready, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.dryRunProofStatus.included, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.dryRunProofStatus.valuesFingerprintStatus, "not_checked");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.dryRunProofStatus.valuesFingerprintDigestExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.dryRunProofStatus.valuesFingerprintValuesExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.targetSetupStatus.available, true);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.targetSetupStatus.summary.targetEnvFilePathExposed, false);
  assert.ok(
    productionFirstStageValuesDryRunPrecheckJson.serverConfigGuidance.steps.some((step) =>
      step.includes("ERP_V1_PRODUCTION_ENV_VALUES_FILE"),
    ),
    "not-configured first-stage values dry-run guidance should name the server env variable",
  );
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.nonMutating, true);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.requestBodyIgnored, true);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.valuesFilePathAcceptedFromRequest, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.valuesFileReadFromServerConfigOnly, true);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.valuesFilePathExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.targetEnvFilePathExposed, false);
  assert.equal(typeof productionFirstStageValuesDryRunPrecheckJson.safeguards.targetSetupReady, "boolean");
  assert.equal(typeof productionFirstStageValuesDryRunPrecheckJson.safeguards.targetSetupReportAvailable, "boolean");
  assert.equal(typeof productionFirstStageValuesDryRunPrecheckJson.safeguards.targetEnvFileConfigured, "boolean");
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.valuesFileAuditReady, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.valuesFileAuditPathExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.valuesFileAuditValuesIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.dryRunProofReady, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.dryRunProofIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.dryRunProofValuesIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.dryRunProofValuesFingerprintCompared, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.dryRunProofValuesFingerprintIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.dryRunProofValuesFingerprintMatched, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.dryRunProofValuesFingerprintDigestExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.dryRunProofValuesFingerprintValuesExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.envValuesIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.secretValuesIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.connectionStringIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.objectStorageEndpointIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.objectStorageBucketIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.commandValuesIncluded, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.localPathExposed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.productionEnvFileMutated, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.businessDataMutated, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.schemaMigrationApplyExecuted, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.physicalPrinterCalled, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(productionFirstStageValuesDryRunPrecheckJson.safeguards.declaresFullV1Complete, false);
  const serializedProductionFirstStageValuesDryRunPrecheck = JSON.stringify(productionFirstStageValuesDryRunPrecheckJson);
  assert.doesNotMatch(serializedProductionFirstStageValuesDryRunPrecheck, /SUPER_SECRET_VALUES|\/Users\/|\/private|\.erp-local-storage/);

  const clientProductionFirstStageValuesDryRunPrecheckResult = await precheckOfficeV1ProductionFirstStageValuesDryRun(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.source, "api");
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.blocked, true);
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.statusLabel, "未配置");
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.summary.valuesFilePathConfigured, false);
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.summary.valuesFilePathAccepted, false);
  assert.equal(typeof clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.summary.targetSetupReady, "boolean");
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.summary.valuesFileAuditStatus, "not_run");
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.summary.valuesFileAuditReady, false);
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.summary.valuesFileAuditBlockingCount, 0);
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.summary.dryRunProofStatus, "not_included");
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.summary.dryRunProofReady, false);
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.summary.dryRunProofMinimumBlockingLabel, "0/0");
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.targetSetupStatus.summary.targetEnvFilePathExposed, false);
  assert.equal(
    clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.serverConfigGuidance.primaryEnvVariable,
    "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
  );
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.serverConfigGuidance.acceptsFrontendPath, false);
  assert.equal(typeof clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.serverConfigGuidance.targetSetupReady, "boolean");
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.serverConfigGuidance.valuesFileAuditReady, false);
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.serverConfigGuidance.dryRunProofReady, false);
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.dryRunProofStatus.ready, false);
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.safeguards.valuesFilePathExposed, false);
  assert.equal(clientProductionFirstStageValuesDryRunPrecheckResult.precheckResult.safeguards.valuesFileAuditPathExposed, false);

  clearProductionEnvValuesFileEnv();
  const productionFirstStageValuesApplyDisabledResponse = await fetch(
    `${baseUrl}/api/system/v1-production-first-stage-values-apply/live-run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-MANAGER-A",
      },
      body: JSON.stringify({
        valuesFilePath: "/Users/should-not-be-read/.env",
        token: "SUPER_SECRET_VALUES_APPLY",
      }),
    },
  );
  assert.equal(
    productionFirstStageValuesApplyDisabledResponse.status,
    200,
    "/api/system/v1-production-first-stage-values-apply/live-run should return disabled by default",
  );
  const productionFirstStageValuesApplyDisabledJson = await productionFirstStageValuesApplyDisabledResponse.json();
  assert.equal(productionFirstStageValuesApplyDisabledJson.version, "p0-v1-production-first-stage-values-apply-live-run-v1");
  assert.equal(productionFirstStageValuesApplyDisabledJson.scope, "v1_production_first_stage_values_apply_live_run");
  assert.equal(productionFirstStageValuesApplyDisabledJson.status, "disabled");
  assert.equal(productionFirstStageValuesApplyDisabledJson.ready, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.applyEnabled, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.applyEnableEnvVariable, "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED");
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.requestBodyIgnored, true);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.valuesFilePathAccepted, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.valuesFilePathExposed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.targetEnvFilePathExposed, false);
  assert.equal(typeof productionFirstStageValuesApplyDisabledJson.summary.targetSetupStatus, "string");
  assert.equal(typeof productionFirstStageValuesApplyDisabledJson.summary.targetSetupReady, "boolean");
  assert.equal(typeof productionFirstStageValuesApplyDisabledJson.summary.targetSetupReportAvailable, "boolean");
  assert.ok(Number.isInteger(productionFirstStageValuesApplyDisabledJson.summary.targetSetupEnvFileCount));
  assert.equal(typeof productionFirstStageValuesApplyDisabledJson.summary.targetEnvFileConfigured, "boolean");
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.valuesFileAuditStatus, "not_run");
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.valuesFileAuditReady, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.valuesFileAuditExecuted, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.valuesFileAuditBlockingCount, 0);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.valuesFileAuditPathExposed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.valuesFileAuditValuesIncluded, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.dryRunProofStatus, "not_included");
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.dryRunProofReady, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.dryRunProofIncluded, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.dryRunProofMinimumBlockingLabel, "0/0");
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.dryRunProofValuesFingerprintStatus, "not_checked");
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.dryRunProofValuesFingerprintStatusLabel, "未检查");
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.dryRunProofValuesFingerprintCompared, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.dryRunProofValuesFingerprintIncluded, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.dryRunProofValuesFingerprintMatched, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.dryRunProofValuesFingerprintDigestExposed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.dryRunProofValuesFingerprintValuesExposed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.targetEnvFileMayBeMutated, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.productionEnvFileMutated, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.businessDataMutated, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.schemaMigrationApplyExecuted, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.releaseCandidateRefreshed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.blockingItems.length, 1);
  assert.equal(productionFirstStageValuesApplyDisabledJson.blockingItems[0].key, "production-env-values-apply-disabled");
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.applyEnableEnvVariable, "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED");
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.applyEnabled, false);
  assert.equal(typeof productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.targetSetupReady, "boolean");
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.valuesFileAuditStatus, "not_run");
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.valuesFileAuditReady, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.valuesFileAuditPathExposed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.valuesFileAuditValuesIncluded, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.dryRunProofStatus, "not_included");
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.dryRunProofReady, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.dryRunProofIncluded, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.dryRunProofValuesFingerprintStatus, "not_checked");
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.dryRunProofValuesFingerprintCompared, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.dryRunProofValuesFingerprintDigestExposed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.targetEnvFilePathExposed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.acceptsFrontendPath, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.pathValueExposed, false);
  assert.ok(
    productionFirstStageValuesApplyDisabledJson.serverConfigGuidance.steps.some((step) =>
      step.includes("ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED"),
    ),
    "disabled first-stage values apply guidance should name the server enable flag",
  );
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.requestBodyIgnored, true);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.valuesFilePathAcceptedFromRequest, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.valuesFileReadFromServerConfigOnly, true);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.valuesFilePathExposed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.valuesFileAuditReady, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.valuesFileAuditPathExposed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.valuesFileAuditValuesIncluded, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.dryRunProofReady, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.dryRunProofIncluded, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.dryRunProofValuesIncluded, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.dryRunProofValuesFingerprintCompared, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.dryRunProofValuesFingerprintIncluded, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.dryRunProofValuesFingerprintMatched, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.dryRunProofValuesFingerprintDigestExposed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.dryRunProofValuesFingerprintValuesExposed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.targetEnvFilePathExposed, false);
  assert.equal(typeof productionFirstStageValuesApplyDisabledJson.safeguards.targetSetupReady, "boolean");
  assert.equal(typeof productionFirstStageValuesApplyDisabledJson.safeguards.targetSetupReportAvailable, "boolean");
  assert.equal(typeof productionFirstStageValuesApplyDisabledJson.safeguards.targetEnvFileConfigured, "boolean");
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.productionEnvFileMutated, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.businessDataMutated, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.schemaMigrationApplyExecuted, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.physicalPrinterCalled, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(productionFirstStageValuesApplyDisabledJson.safeguards.declaresFullV1Complete, false);
  const serializedProductionFirstStageValuesApplyDisabled = JSON.stringify(productionFirstStageValuesApplyDisabledJson);
  assert.doesNotMatch(serializedProductionFirstStageValuesApplyDisabled, /SUPER_SECRET_VALUES_APPLY|\/Users\/|\/private|\.erp-local-storage/);

  const clientProductionFirstStageValuesApplyDisabledResult = await applyOfficeV1ProductionFirstStageValues(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientProductionFirstStageValuesApplyDisabledResult.source, "api");
  assert.equal(clientProductionFirstStageValuesApplyDisabledResult.blocked, true);
  assert.equal(clientProductionFirstStageValuesApplyDisabledResult.applyResult.statusLabel, "未启用");
  assert.equal(clientProductionFirstStageValuesApplyDisabledResult.applyResult.summary.applyEnabled, false);
  assert.equal(clientProductionFirstStageValuesApplyDisabledResult.applyResult.summary.valuesFileAuditStatus, "not_run");
  assert.equal(clientProductionFirstStageValuesApplyDisabledResult.applyResult.summary.valuesFileAuditReady, false);
  assert.equal(clientProductionFirstStageValuesApplyDisabledResult.applyResult.summary.valuesFileAuditBlockingCount, 0);
  assert.equal(clientProductionFirstStageValuesApplyDisabledResult.applyResult.summary.productionEnvFileMutated, false);
  assert.equal(
    clientProductionFirstStageValuesApplyDisabledResult.applyResult.serverConfigGuidance.applyEnableEnvVariable,
    "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED",
  );
  assert.equal(clientProductionFirstStageValuesApplyDisabledResult.applyResult.serverConfigGuidance.valuesFileAuditReady, false);

  clearProductionEnvValuesFileEnv();
  process.env.ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED = "true";
  const productionFirstStageValuesApplyNotConfiguredResponse = await fetch(
    `${baseUrl}/api/system/v1-production-first-stage-values-apply/live-run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-MANAGER-A",
      },
      body: JSON.stringify({
        valuesFilePath: "/Users/should-not-be-read/.env",
        token: "SUPER_SECRET_VALUES_APPLY_ENABLED",
      }),
    },
  );
  assert.equal(productionFirstStageValuesApplyNotConfiguredResponse.status, 200);
  const productionFirstStageValuesApplyNotConfiguredJson = await productionFirstStageValuesApplyNotConfiguredResponse.json();
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.status, "not_configured");
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.ready, false);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.summary.applyEnabled, true);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.summary.configuredValuesFileCount, 0);
  assert.equal(typeof productionFirstStageValuesApplyNotConfiguredJson.summary.targetSetupReady, "boolean");
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.summary.targetEnvFilePathExposed, false);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.summary.dryRunProofReady, false);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.summary.dryRunProofIncluded, false);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.summary.dryRunProofMinimumBlockingLabel, "0/0");
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.summary.dryRunProofValuesFingerprintStatus, "not_checked");
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.summary.dryRunProofValuesFingerprintMatched, false);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.summary.dryRunProofValuesFingerprintDigestExposed, false);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.summary.targetEnvFileMayBeMutated, false);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.summary.productionEnvFileMutated, false);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.blockingItems[0].key, "production-env-values-file-not-configured");
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.safeguards.productionEnvFileMutated, false);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.safeguards.dryRunProofReady, false);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.safeguards.dryRunProofValuesIncluded, false);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.safeguards.dryRunProofValuesFingerprintCompared, false);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.safeguards.dryRunProofValuesFingerprintDigestExposed, false);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.safeguards.businessDataMutated, false);
  assert.equal(productionFirstStageValuesApplyNotConfiguredJson.safeguards.schemaMigrationApplyExecuted, false);
  const serializedProductionFirstStageValuesApplyNotConfigured = JSON.stringify(productionFirstStageValuesApplyNotConfiguredJson);
  assert.doesNotMatch(serializedProductionFirstStageValuesApplyNotConfigured, /SUPER_SECRET_VALUES_APPLY_ENABLED|\/Users\/|\/private|\.erp-local-storage/);
  clearProductionEnvValuesFileEnv();

  process.env.ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS = join(process.cwd(), "docs", "development", "v1-production.env.example");
  delete process.env.ERP_V1_PRODUCTION_ENV_FILE;
  delete process.env.ERP_V1_ENV_FILE;
  const auditBlockedProductionEnvFilePreviewPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-preview/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_AUDIT_BLOCKED_PREVIEW" }),
  });
  assert.equal(
    auditBlockedProductionEnvFilePreviewPrecheckResponse.status,
    200,
    "/api/system/v1-production-env-file-preview/live-precheck should separate configured audit blockers from missing paths",
  );
  const auditBlockedProductionEnvFilePreviewPrecheckJson = await auditBlockedProductionEnvFilePreviewPrecheckResponse.json();
  assert.equal(auditBlockedProductionEnvFilePreviewPrecheckJson.status, "audit_blocked");
  assert.equal(auditBlockedProductionEnvFilePreviewPrecheckJson.ready, false);
  assert.equal(auditBlockedProductionEnvFilePreviewPrecheckJson.summary.envFilePathConfigured, true);
  assert.equal(auditBlockedProductionEnvFilePreviewPrecheckJson.summary.envFileAuditReady, false);
  assert.equal(auditBlockedProductionEnvFilePreviewPrecheckJson.summary.envPreflightReady, false);
  assert.equal(auditBlockedProductionEnvFilePreviewPrecheckJson.summary.appliedInMemory, false);
  assert.equal(auditBlockedProductionEnvFilePreviewPrecheckJson.summary.currentStage, "env_file_audit");
  assert.equal(auditBlockedProductionEnvFilePreviewPrecheckJson.summary.stageStatus, "audit_blocked");
  assert.equal(auditBlockedProductionEnvFilePreviewPrecheckJson.stageDiagnosis.currentStage, "env_file_audit");
  assert.equal(auditBlockedProductionEnvFilePreviewPrecheckJson.stageDiagnosis.stageStatus, "audit_blocked");
  assert.equal(auditBlockedProductionEnvFilePreviewPrecheckJson.stageDiagnosis.nextStage, "env_preflight");
  assert.equal(auditBlockedProductionEnvFilePreviewPrecheckJson.stageDiagnosis.auditReady, false);
  assert.equal(auditBlockedProductionEnvFilePreviewPrecheckJson.stageDiagnosis.appliedInMemory, false);
  assert.equal(auditBlockedProductionEnvFilePreviewPrecheckJson.safeguards.envFileValuesAppliedInMemoryOnly, false);
  const serializedAuditBlockedProductionEnvFilePreviewPrecheck = JSON.stringify(auditBlockedProductionEnvFilePreviewPrecheckJson);
  assert.doesNotMatch(serializedAuditBlockedProductionEnvFilePreviewPrecheck, /SUPER_SECRET_AUDIT_BLOCKED_PREVIEW|\/Users\/|\/private\//);

  const auditStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-env-file-audit-live");
  const partialAuditEnvPath = join(auditStorageRoot, "partial-live.env");
  const safeAuditEnvPath = join(auditStorageRoot, "secure-live.env");
  mkdirSync(auditStorageRoot, { recursive: true });
  writeFileSync(
    partialAuditEnvPath,
    [
      "ERP_V1_PERSISTENCE_PROFILE=postgres",
      "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  chmodSync(partialAuditEnvPath, 0o600);
  process.env.ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS = partialAuditEnvPath;

  const envBlockedProductionEnvFilePreviewPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-preview/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_ENV_BLOCKED_PREVIEW" }),
  });
  assert.equal(
    envBlockedProductionEnvFilePreviewPrecheckResponse.status,
    200,
    "/api/system/v1-production-env-file-preview/live-precheck should separate audit-ready files from env preflight blockers",
  );
  const envBlockedProductionEnvFilePreviewPrecheckJson = await envBlockedProductionEnvFilePreviewPrecheckResponse.json();
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.status, "blocked");
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.ready, false);
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.summary.envFilePathConfigured, true);
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.summary.envFileAuditReady, true);
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.summary.envPreflightReady, false);
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.summary.appliedInMemory, true);
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.summary.processEnvMutated, false);
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.summary.currentStage, "env_preflight");
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.summary.stageStatus, "env_preflight_blocked");
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.summary.selectedEnvVariable, "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS");
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.summary.selectedSourceKind, "audit_only");
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.stageDiagnosis.currentStage, "env_preflight");
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.stageDiagnosis.stageStatus, "env_preflight_blocked");
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.stageDiagnosis.nextStage, "fix_production_env_values");
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.stageDiagnosis.auditReady, true);
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.stageDiagnosis.envPreflightReady, false);
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.stageDiagnosis.appliedInMemory, true);
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.stageDiagnosis.processEnvMutated, false);
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.stageDiagnosis.selectedEnvVariable, "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS");
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.stageDiagnosis.selectedSourceKind, "audit_only");
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.safeguards.liveProcessEnvOverlayChecked, true);
  assert.equal(envBlockedProductionEnvFilePreviewPrecheckJson.safeguards.envFileValuesAppliedInMemoryOnly, true);
  const serializedEnvBlockedProductionEnvFilePreviewPrecheck = JSON.stringify(envBlockedProductionEnvFilePreviewPrecheckJson);
  assert.doesNotMatch(serializedEnvBlockedProductionEnvFilePreviewPrecheck, /SUPER_SECRET_ENV_BLOCKED_PREVIEW|partial-live\.env|\/Users\/|\/private\//);

  const envBlockedClientProductionEnvFilePreviewPrecheckResult = await precheckOfficeV1ProductionEnvFilePreview(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(envBlockedClientProductionEnvFilePreviewPrecheckResult.source, "api");
  assert.equal(envBlockedClientProductionEnvFilePreviewPrecheckResult.blocked, false);
  assert.equal(envBlockedClientProductionEnvFilePreviewPrecheckResult.precheckResult.statusLabel, "仍未通过");
  assert.equal(envBlockedClientProductionEnvFilePreviewPrecheckResult.precheckResult.stageDiagnosis.stageStatus, "env_preflight_blocked");
  assert.equal(envBlockedClientProductionEnvFilePreviewPrecheckResult.precheckResult.stageDiagnosis.auditReady, true);

  const auditOnlyProductionGoLivePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-go-live/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_AUDIT_ONLY_GO_LIVE" }),
  });
  assert.equal(
    auditOnlyProductionGoLivePrecheckResponse.status,
    200,
    "/api/system/v1-production-go-live/live-precheck should not treat audit-only env file paths as API startup env application",
  );
  const auditOnlyProductionGoLivePrecheckJson = await auditOnlyProductionGoLivePrecheckResponse.json();
  assert.equal(auditOnlyProductionGoLivePrecheckJson.status, "blocked");
  assert.equal(auditOnlyProductionGoLivePrecheckJson.ready, false);
  assert.equal(auditOnlyProductionGoLivePrecheckJson.summary.configuredEnvFileCount, 0);
  assert.deepEqual(
    auditOnlyProductionGoLivePrecheckJson.summary.sourceStatuses.map((item) => item.envVariable),
    ["ERP_V1_PRODUCTION_ENV_FILE", "ERP_V1_ENV_FILE", "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS"],
  );
  assert.ok(
    auditOnlyProductionGoLivePrecheckJson.summary.sourceStatuses.some(
      (item) =>
        item.envVariable === "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS" &&
        item.kind === "audit_only" &&
        item.configured === true &&
        item.selected === false &&
        item.ignored === true,
    ),
    "go-live precheck should show audit-only env source as configured but ignored for API startup application",
  );
  assert.ok(auditOnlyProductionGoLivePrecheckJson.blockingStages.some((item) => item.key === "production-env-file-audit"));
  assert.equal(auditOnlyProductionGoLivePrecheckJson.fieldEvidenceCoverage.summary.reportSupportedLabel, "0/10");
  const serializedAuditOnlyProductionGoLivePrecheck = JSON.stringify(auditOnlyProductionGoLivePrecheckJson);
  assert.doesNotMatch(serializedAuditOnlyProductionGoLivePrecheck, /SUPER_SECRET_AUDIT_ONLY_GO_LIVE|partial-live\.env|\/Users\/|\/private\//);

  writeFileSync(
    safeAuditEnvPath,
    [
      "ERP_RUNTIME_MODE=production",
      "ERP_V1_PERSISTENCE_PROFILE=postgres",
      "ERP_V1_DATABASE_URL=postgres://v1_user:SUPER_SECRET_LIVE@prod-db.internal:5432/erp",
      "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL=postgres://v1_restore:SUPER_SECRET_LIVE@restore-db.internal:5432/erp_restore",
      "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
      "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
      "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=https://oss-live-secret.example.com",
      "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=erp-v1-live-private-bucket",
      "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=AKIA_LIVE_SECRET",
      "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=SUPER_SECRET_LIVE_ACCESS_KEY",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT=https://oss-live-secret.example.com",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET=erp-v1-live-statement-private-bucket",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID=AKIA_LIVE_STATEMENT_SECRET",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY=SUPER_SECRET_LIVE_STATEMENT_ACCESS_KEY",
      "ERP_SYSTEM_PRINTER_ENABLED=true",
      "ERP_SYSTEM_PRINTER_ADAPTER=command_bridge",
      "ERP_SYSTEM_PRINTER_COMMAND=/usr/local/bin/lp-live-secret",
      "ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON=[\"scripts/print-command-bridge.mjs\",\"--print-job-id\",\"{printJobId}\"]",
      "ERP_SYSTEM_PRINTER_ALLOWLIST=/usr/local/bin/lp-live-secret",
      "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR=.erp-local-storage/print-spool-live-secret",
      "ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST=Label-Live,DotMatrix-Live",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER=Label-Live",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND=/usr/bin/lpstat-live-secret",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON=[\"-p\",\"{printer}\"]",
      "ERP_V1_READINESS_API_BASE_URL=http://127.0.0.1:8787/api",
      "ERP_V1_READINESS_OPERATOR_ID=U-MANAGER-A",
      "ERP_V1_READINESS_DRIVER_OPERATOR_ID=U-DRIVER-A",
      "ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR=.erp-local-storage/v1-field-acceptance-live-secret",
      "ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL=http://127.0.0.1:8787/api",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  chmodSync(safeAuditEnvPath, 0o600);
  delete process.env.ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS;
  process.env.ERP_V1_PRODUCTION_ENV_FILE = safeAuditEnvPath;
  process.env.ERP_V1_ENV_FILE = safeAuditEnvPath;

  const configuredProductionEnvFileAuditPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-audit/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_CONFIGURED_ENV_FILE_PATH" }),
  });
  assert.equal(
    configuredProductionEnvFileAuditPrecheckResponse.status,
    200,
    "/api/system/v1-production-env-file-audit/live-precheck should return 200 for configured safe env file",
  );
  const configuredProductionEnvFileAuditPrecheckJson = await configuredProductionEnvFileAuditPrecheckResponse.json();
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.version, "p0-v1-production-env-file-audit-live-precheck-v1");
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.scope, "v1_production_env_file_audit_live_precheck");
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.status, "passed");
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.ready, true);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.auditStatus, "passed");
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.auditStatusLabel, "已通过");
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.envFileCount, 1);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.configuredEnvFileCount, 1);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.fileCount, 1);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.blockingCount, 0);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.warningCount, 0);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.crossFileDuplicateVariableCount, 0);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.envFilePathAccepted, false);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.envFilePathConfigured, true);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.selectedEnvVariable, "ERP_V1_PRODUCTION_ENV_FILE");
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.selectedSourceKind, "fallback");
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.fallbackSourceUsed, true);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.configuredSourceVariableCount, 2);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.summary.ignoredConfiguredFallbackVariableCount, 1);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.serverConfigGuidance.status, "configured");
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.serverConfigGuidance.configuredEnvFileCount, 1);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.serverConfigGuidance.selectedEnvVariable, "ERP_V1_PRODUCTION_ENV_FILE");
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.serverConfigGuidance.selectedSourceKind, "fallback");
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.serverConfigGuidance.fallbackSourceUsed, true);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.serverConfigGuidance.configuredSourceVariableCount, 2);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.serverConfigGuidance.ignoredConfiguredFallbackVariableCount, 1);
  assert.equal(
    configuredProductionEnvFileAuditPrecheckJson.serverConfigGuidance.sourceStatuses.filter((item) => item.configured).length,
    2,
  );
  assert.ok(
    configuredProductionEnvFileAuditPrecheckJson.serverConfigGuidance.sourceStatuses.some(
      (item) => item.envVariable === "ERP_V1_ENV_FILE" && item.ignored === true,
    ),
    "configured fallback source diagnostics should mark lower-priority fallback variables as ignored without exposing paths",
  );
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.serverConfigGuidance.acceptsFrontendPath, false);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.serverConfigGuidance.pathValueExposed, false);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.serverConfigGuidance.safeguards.envFilePathValueIncluded, false);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.files.length, 1);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.files[0].label, "env 文件 1");
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.files[0].gitTracked, false);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.files[0].gitIgnored, true);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.files[0].fileMode, "600");
  assert.ok(configuredProductionEnvFileAuditPrecheckJson.files[0].variableCount >= 10);
  assert.deepEqual(configuredProductionEnvFileAuditPrecheckJson.blockingFindings, []);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.safeguards.envFilePathExposed, false);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.safeguards.envFilePathSetupGuidanceIncluded, true);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.safeguards.rawEnvFileIncluded, false);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.safeguards.rawEnvFileAuditIncluded, false);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.safeguards.envValuesIncluded, false);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.safeguards.secretValuesIncluded, false);
  assert.equal(configuredProductionEnvFileAuditPrecheckJson.safeguards.commandValuesIncluded, false);
  const serializedConfiguredProductionEnvFileAuditPrecheck = JSON.stringify(configuredProductionEnvFileAuditPrecheckJson);
  assert.doesNotMatch(serializedConfiguredProductionEnvFileAuditPrecheck, /\.erp-local-storage|secure-live\.env|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedConfiguredProductionEnvFileAuditPrecheck, /SUPER_SECRET|oss-live-secret|lp-live-secret|print-spool-live-secret/i);

  const configuredClientProductionEnvFileAuditPrecheckResult = await precheckOfficeV1ProductionEnvFileAudit(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(configuredClientProductionEnvFileAuditPrecheckResult.source, "api");
  assert.equal(configuredClientProductionEnvFileAuditPrecheckResult.blocked, false);
  assert.equal(configuredClientProductionEnvFileAuditPrecheckResult.precheckResult.statusLabel, "已通过");
  assert.equal(configuredClientProductionEnvFileAuditPrecheckResult.precheckResult.summary.envFilePathConfigured, true);
  assert.equal(configuredClientProductionEnvFileAuditPrecheckResult.precheckResult.summary.fileCount, 1);
  assert.equal(configuredClientProductionEnvFileAuditPrecheckResult.precheckResult.summary.selectedSourceKind, "fallback");
  assert.equal(configuredClientProductionEnvFileAuditPrecheckResult.precheckResult.serverConfigGuidance.status, "configured");
  assert.equal(configuredClientProductionEnvFileAuditPrecheckResult.precheckResult.serverConfigGuidance.configuredEnvFileCount, 1);
  assert.equal(configuredClientProductionEnvFileAuditPrecheckResult.precheckResult.serverConfigGuidance.fallbackSourceUsed, true);
  assert.equal(configuredClientProductionEnvFileAuditPrecheckResult.precheckResult.serverConfigGuidance.ignoredConfiguredFallbackVariableCount, 1);
  assert.equal(configuredClientProductionEnvFileAuditPrecheckResult.precheckResult.serverConfigGuidance.pathValueExposed, false);
  assert.equal(configuredClientProductionEnvFileAuditPrecheckResult.precheckResult.summary.blockingLabel, "0 项");
  assert.equal(configuredClientProductionEnvFileAuditPrecheckResult.precheckResult.files[0].label, "env 文件 1");
  assert.equal(configuredClientProductionEnvFileAuditPrecheckResult.precheckResult.safeguards.envFilePathExposed, false);

  const configuredProductionEnvFilePreviewPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-preview/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_CONFIGURED_ENV_FILE_PREVIEW" }),
  });
  assert.equal(
    configuredProductionEnvFilePreviewPrecheckResponse.status,
    200,
    "/api/system/v1-production-env-file-preview/live-precheck should return 200 for configured safe env file",
  );
  const configuredProductionEnvFilePreviewPrecheckJson = await configuredProductionEnvFilePreviewPrecheckResponse.json();
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.version, "p0-v1-production-env-file-preview-live-precheck-v1");
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.scope, "v1_production_env_file_preview_live_precheck");
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.status, "ready");
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.ready, true);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.readinessLabel, "11/11");
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.passedCount, 11);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.totalCount, 11);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.blockingCount, 0);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.warningCount, 0);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.configuredEnvFileCount, 1);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.envFilePathConfigured, true);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.selectedEnvVariable, "ERP_V1_PRODUCTION_ENV_FILE");
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.selectedSourceKind, "primary");
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.fallbackSourceUsed, false);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.configuredSourceVariableCount, 2);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.ignoredConfiguredFallbackVariableCount, 1);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.sourceStatuses.filter((item) => item.configured).length, 2);
  assert.ok(
    configuredProductionEnvFilePreviewPrecheckJson.summary.sourceStatuses.some(
      (item) => item.envVariable === "ERP_V1_PRODUCTION_ENV_FILE" && item.selected === true,
    ),
  );
  assert.ok(
    configuredProductionEnvFilePreviewPrecheckJson.summary.sourceStatuses.some(
      (item) => item.envVariable === "ERP_V1_ENV_FILE" && item.ignored === true,
    ),
  );
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.appliedInMemory, true);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.processEnvMutated, false);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.envPreflightReady, true);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.envFileAuditReady, true);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.envFileAuditStatusLabel, "已通过");
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.currentStage, "env_preflight");
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.stageStatus, "ready");
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.stageDiagnosis.currentStage, "env_preflight");
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.stageDiagnosis.stageStatus, "ready");
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.stageDiagnosis.nextStage, "runtime_readiness");
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.stageDiagnosis.auditReady, true);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.stageDiagnosis.envPreflightReady, true);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.stageDiagnosis.appliedInMemory, true);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.stageDiagnosis.processEnvMutated, false);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.stageDiagnosis.selectedEnvVariable, "ERP_V1_PRODUCTION_ENV_FILE");
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.stageDiagnosis.selectedSourceKind, "primary");
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.stageDiagnosis.fallbackSourceUsed, false);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.stageDiagnosis.configuredSourceVariableCount, 2);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.stageDiagnosis.ignoredConfiguredFallbackVariableCount, 1);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.stageDiagnosis.sourceStatuses.length, 3);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.stageDiagnosis.pathValueExposed, false);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.checks.length, 11);
  assert.deepEqual(configuredProductionEnvFilePreviewPrecheckJson.blockingChecks, []);
  assert.deepEqual(configuredProductionEnvFilePreviewPrecheckJson.warningChecks, []);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.safeguards.nonMutating, true);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.safeguards.requestBodyIgnored, true);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.safeguards.envFilePathAccepted, false);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.safeguards.envFileReadByRequest, false);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.safeguards.envFilePathExposed, false);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.safeguards.liveProcessEnvOverlayChecked, true);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.safeguards.envFileValuesAppliedInMemoryOnly, true);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.safeguards.processEnvMutated, false);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.safeguards.rawProductionEnvPreflightIncluded, false);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.safeguards.rawEnvFileAuditIncluded, false);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.safeguards.rawEnvFileIncluded, false);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.safeguards.envValuesIncluded, false);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.safeguards.secretValuesIncluded, false);
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.safeguards.commandValuesIncluded, false);
  const serializedConfiguredProductionEnvFilePreviewPrecheck = JSON.stringify(configuredProductionEnvFilePreviewPrecheckJson);
  assert.doesNotMatch(serializedConfiguredProductionEnvFilePreviewPrecheck, /\.erp-local-storage|secure-live\.env|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedConfiguredProductionEnvFilePreviewPrecheck, /SUPER_SECRET|oss-live-secret|lp-live-secret|print-spool-live-secret|field-acceptance-live-secret/i);

  const configuredClientProductionEnvFilePreviewPrecheckResult = await precheckOfficeV1ProductionEnvFilePreview(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.source, "api");
  assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.blocked, false);
  assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.statusLabel, "已通过");
  assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.readinessLabel, "11/11");
  assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.envFilePathConfigured, true);
  assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.selectedSourceKind, "primary");
  assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.appliedInMemory, true);
  assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.processEnvMutated, false);
  assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.envPreflightReady, true);
  assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.sourceStatuses.length, 3);
  assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.stageDiagnosis.stageStatus, "ready");
  assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.stageDiagnosis.fallbackSourceUsed, false);
  assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.stageDiagnosis.sourceStatuses.length, 3);

  const configuredProductionGoLivePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-go-live/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_CONFIGURED_GO_LIVE" }),
  });
  assert.equal(
    configuredProductionGoLivePrecheckResponse.status,
    200,
    "/api/system/v1-production-go-live/live-precheck should return 200 for configured safe env file",
  );
  const configuredProductionGoLivePrecheckJson = await configuredProductionGoLivePrecheckResponse.json();
  assert.equal(configuredProductionGoLivePrecheckJson.version, "p0-v1-production-go-live-live-precheck-v1");
  assert.equal(configuredProductionGoLivePrecheckJson.scope, "v1_production_go_live_live_precheck");
  assert.equal(configuredProductionGoLivePrecheckJson.status, "blocked");
  assert.equal(configuredProductionGoLivePrecheckJson.ready, false);
  assert.equal(configuredProductionGoLivePrecheckJson.summary.totalCount, 5);
  assert.equal(configuredProductionGoLivePrecheckJson.summary.configuredEnvFileCount, 1);
  assert.equal(configuredProductionGoLivePrecheckJson.summary.sourceStatuses.filter((item) => item.configured).length, 2);
  assert.ok(
    configuredProductionGoLivePrecheckJson.summary.sourceStatuses.some(
      (item) => item.envVariable === "ERP_V1_PRODUCTION_ENV_FILE" && item.selected === true,
    ),
  );
  assert.ok(
    configuredProductionGoLivePrecheckJson.summary.sourceStatuses.some(
      (item) => item.envVariable === "ERP_V1_ENV_FILE" && item.ignored === true,
    ),
  );
  assert.equal(configuredProductionGoLivePrecheckJson.summary.envFilePathAccepted, false);
  assert.equal(configuredProductionGoLivePrecheckJson.summary.productionEnvAppliedToProcess, false);
  assert.equal(configuredProductionGoLivePrecheckJson.summary.releaseCandidateRefreshed, false);
  assert.equal(configuredProductionGoLivePrecheckJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(configuredProductionGoLivePrecheckJson.summary.physicalPrinterCalled, false);
  assert.equal(configuredProductionGoLivePrecheckJson.stages.length, 5);
  assert.equal(configuredProductionGoLivePrecheckJson.unblockChecklist.length, 5);
  assert.ok(
    configuredProductionGoLivePrecheckJson.stages.some(
      (item) => item.key === "production-env-intake-verify" && item.ready === true,
    ),
    "configured production go-live precheck should pass production env intake verification stage",
  );
  assert.equal(configuredProductionGoLivePrecheckJson.fieldEvidenceCoverage.summary.totalCount, 10);
  assert.equal(configuredProductionGoLivePrecheckJson.fieldEvidenceCoverage.summary.reportSupportedLabel, "1/10");
  assert.ok(
    configuredProductionGoLivePrecheckJson.fieldEvidenceCoverage.items.some(
      (item) => item.itemKey === "production_env_preflight_10_of_10" && item.status === "report_supported",
    ),
    "configured production go-live precheck should identify env preflight evidence as report-supported",
  );
  assert.ok(configuredProductionGoLivePrecheckJson.stages.some((item) => item.key === "production-env-file-audit" && item.ready === true));
  assert.ok(configuredProductionGoLivePrecheckJson.stages.some((item) => item.key === "production-env-preflight" && item.ready === true));
  assert.ok(configuredProductionGoLivePrecheckJson.blockingStages.some((item) => item.key === "runtime-production-profile"));
  assert.ok(
    configuredProductionGoLivePrecheckJson.unblockChecklist.some((item) => item.key === "runtime-production-profile" && item.ready === false),
    "configured production go-live precheck should still expose the profile unblock item",
  );
  assert.equal(configuredProductionGoLivePrecheckJson.safeguards.envFilePathExposed, false);
  assert.equal(configuredProductionGoLivePrecheckJson.safeguards.productionEnvAppliedToProcess, false);
  assert.equal(configuredProductionGoLivePrecheckJson.safeguards.rawProductionGoLivePrecheckIncluded, false);
  assert.equal(configuredProductionGoLivePrecheckJson.safeguards.rawProductionEnvPreflightIncluded, false);
  assert.equal(configuredProductionGoLivePrecheckJson.safeguards.rawRuntimeReadinessReportIncluded, false);
  assert.equal(configuredProductionGoLivePrecheckJson.safeguards.rawEnvFileAuditIncluded, false);
  assert.equal(configuredProductionGoLivePrecheckJson.safeguards.rawEnvFileIncluded, false);
  assert.equal(configuredProductionGoLivePrecheckJson.safeguards.envValuesIncluded, false);
  assert.equal(configuredProductionGoLivePrecheckJson.safeguards.secretValuesIncluded, false);
  assert.equal(configuredProductionGoLivePrecheckJson.safeguards.commandValuesIncluded, false);
  assert.equal(configuredProductionGoLivePrecheckJson.safeguards.localPathExposed, false);
  assert.equal(configuredProductionGoLivePrecheckJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(configuredProductionGoLivePrecheckJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(configuredProductionGoLivePrecheckJson.safeguards.physicalPrinterCalled, false);
  const serializedConfiguredProductionGoLivePrecheck = JSON.stringify(configuredProductionGoLivePrecheckJson);
  assert.doesNotMatch(serializedConfiguredProductionGoLivePrecheck, /\.erp-local-storage|secure-live\.env|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedConfiguredProductionGoLivePrecheck, /SUPER_SECRET|oss-live-secret|lp-live-secret|print-spool-live-secret/i);

  const configuredClientProductionGoLivePrecheckResult = await precheckOfficeV1ProductionGoLive(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(configuredClientProductionGoLivePrecheckResult.source, "api");
  assert.equal(configuredClientProductionGoLivePrecheckResult.blocked, true);
  assert.equal(configuredClientProductionGoLivePrecheckResult.precheckResult.statusLabel, "仍未通过");
  assert.equal(configuredClientProductionGoLivePrecheckResult.precheckResult.summary.configuredEnvFileCount, 1);
  assert.equal(configuredClientProductionGoLivePrecheckResult.precheckResult.summary.sourceStatuses.length, 3);
  assert.equal(configuredClientProductionGoLivePrecheckResult.precheckResult.summary.productionEnvAppliedToProcess, false);
  assert.equal(configuredClientProductionGoLivePrecheckResult.precheckResult.unblockChecklist.length, 5);
  assert.equal(
    configuredClientProductionGoLivePrecheckResult.precheckResult.fieldEvidenceCoverage.summary.reportSupportedLabel,
    "1/10",
  );
  assert.ok(
    configuredClientProductionGoLivePrecheckResult.precheckResult.fieldEvidenceCoverage.items.some(
      (item) => item.status === "report_supported",
    ),
    "configured client production go-live result should preserve report-supported evidence items",
  );
  assert.ok(
    configuredClientProductionGoLivePrecheckResult.precheckResult.unblockChecklist.some(
      (item) => item.key === "runtime-production-profile" && item.verificationSteps.length > 0,
    ),
  );
  assert.ok(
    configuredClientProductionGoLivePrecheckResult.precheckResult.blockingStages.some((item) => item.key === "runtime-production-profile"),
  );
  restoreProductionEnvFileAuditEnv();

  const persistencePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-persistence/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ connectionString: "postgres://SUPER_SECRET@127.0.0.1/db", localPath: "/Users/should-not-leak" }),
  });
  assert.equal(persistencePrecheckResponse.status, 200, "/api/system/v1-persistence/live-precheck should return 200 for management");
  const persistencePrecheckJson = await persistencePrecheckResponse.json();
  assert.equal(persistencePrecheckJson.version, "p0-v1-persistence-live-precheck-v1");
  assert.equal(persistencePrecheckJson.scope, "v1_persistence_live_precheck");
  assert.equal(persistencePrecheckJson.status, "blocked");
  assert.equal(persistencePrecheckJson.ready, false);
  assert.equal(persistencePrecheckJson.summary.readinessLabel, "1/7");
  assert.equal(persistencePrecheckJson.summary.passedCount, 1);
  assert.equal(persistencePrecheckJson.summary.totalCount, 7);
  assert.equal(persistencePrecheckJson.summary.blockingCount, 6);
  assert.equal(persistencePrecheckJson.summary.repositoryGroupCount, 5);
  assert.equal(persistencePrecheckJson.summary.repositoryCount, expectedPersistenceRepositoryCount);
  assert.equal(persistencePrecheckJson.summary.productionReadyRepositoryCount, 0);
  assert.equal(persistencePrecheckJson.summary.localRepositoryCount, expectedPersistenceRepositoryCount);
  assert.equal(persistencePrecheckJson.summary.localMemoryCount, 20);
  assert.equal(persistencePrecheckJson.summary.localJsonCount, 10);
  assert.equal(persistencePrecheckJson.summary.localFsCount, 2);
  assert.equal(persistencePrecheckJson.summary.currentRuntime, true);
  assert.equal(persistencePrecheckJson.summary.requestBodyIgnored, true);
  assert.equal(persistencePrecheckJson.summary.localPersistenceAcceptedForV1, false);
  assert.equal(persistencePrecheckJson.summary.releaseCandidateRefreshed, false);
  assert.equal(persistencePrecheckJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(persistencePrecheckJson.criteria.length, 7);
  assert.equal(persistencePrecheckJson.blockingCriteria.length, 6);
  assert.equal(persistencePrecheckJson.repositoryGroups.length, 5);
  assert.ok(
    persistencePrecheckJson.repositoryGroups.some((group) =>
      group.key === "file-retention-stores" &&
      group.localFsCount === 2 &&
      group.repositories.some((repository) => repository.kindLabel === "本地文件")
    ),
  );
  assert.equal(persistencePrecheckJson.safeguards.nonMutating, true);
  assert.equal(persistencePrecheckJson.safeguards.currentRuntime, true);
  assert.equal(persistencePrecheckJson.safeguards.requestBodyIgnored, true);
  assert.equal(persistencePrecheckJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(persistencePrecheckJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(persistencePrecheckJson.safeguards.rawSystemV1ReadinessIncluded, false);
  assert.equal(persistencePrecheckJson.safeguards.repositoryPayloadExposed, false);
  assert.equal(persistencePrecheckJson.safeguards.connectionStringExposed, false);
  assert.equal(persistencePrecheckJson.safeguards.localPathExposed, false);
  assert.equal(persistencePrecheckJson.safeguards.persistenceProfileConnectionStringExposed, false);
  assert.equal(persistencePrecheckJson.safeguards.persistenceProfileLocalPathExposed, false);
  assert.equal(persistencePrecheckJson.safeguards.persistenceProfileSecretFieldsExposed, false);
  assert.equal(persistencePrecheckJson.safeguards.localPersistenceAcceptanceReferenceIncluded, false);
  assert.equal(persistencePrecheckJson.safeguards.environmentValuesIncluded, false);
  assert.equal(persistencePrecheckJson.safeguards.commandValuesIncluded, false);
  assert.equal(persistencePrecheckJson.safeguards.secretValuesIncluded, false);
  const serializedPersistencePrecheck = JSON.stringify(persistencePrecheckJson);
  assert.doesNotMatch(serializedPersistencePrecheck, /\.erp-local-storage|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedPersistencePrecheck, /SUPER_SECRET|postgres:\/\/|pass@prod-db/i);

  const clientPersistencePrecheckResult = await precheckOfficeV1Persistence(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientPersistencePrecheckResult.source, "api");
  assert.equal(clientPersistencePrecheckResult.blocked, false);
  assert.equal(clientPersistencePrecheckResult.precheckResult.statusLabel, "仍未通过");
  assert.equal(clientPersistencePrecheckResult.precheckResult.summary.readinessLabel, "1/7");
  assert.equal(clientPersistencePrecheckResult.precheckResult.summary.repositoryGroupLabel, "5 组");
  assert.equal(
    clientPersistencePrecheckResult.precheckResult.summary.repositoryLabel,
    `0/${expectedPersistenceRepositoryCount}`,
  );
  assert.equal(
    clientPersistencePrecheckResult.precheckResult.summary.localRepositoryLabel,
    `${expectedPersistenceRepositoryCount} 个`,
  );
  assert.equal(clientPersistencePrecheckResult.precheckResult.repositoryGroups.length, 5);

  const attachmentRetentionPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-attachment-retention/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      storageKey: "attachments/storage-diagnostics/SUPER_SECRET_OBJECT",
      localPath: "/Users/should-not-leak/.erp-local-storage",
      token: "SECRET_ATTACHMENT_VALUE",
    }),
  });
  assert.equal(
    attachmentRetentionPrecheckResponse.status,
    200,
    "/api/system/v1-attachment-retention/live-precheck should return 200 for management",
  );
  const attachmentRetentionPrecheckJson = await attachmentRetentionPrecheckResponse.json();
  assert.equal(attachmentRetentionPrecheckJson.version, "p0-v1-attachment-retention-live-precheck-v1");
  assert.equal(attachmentRetentionPrecheckJson.scope, "v1_attachment_retention_live_precheck");
  assert.equal(attachmentRetentionPrecheckJson.status, "blocked");
  assert.equal(attachmentRetentionPrecheckJson.ready, false);
  assert.equal(attachmentRetentionPrecheckJson.summary.readinessLabel, "4/5");
  assert.equal(attachmentRetentionPrecheckJson.summary.passedCount, 4);
  assert.equal(attachmentRetentionPrecheckJson.summary.totalCount, 5);
  assert.equal(attachmentRetentionPrecheckJson.summary.blockingCount, 1);
  assert.equal(attachmentRetentionPrecheckJson.summary.currentRuntime, true);
  assert.equal(attachmentRetentionPrecheckJson.summary.requestBodyIgnored, true);
  assert.equal(attachmentRetentionPrecheckJson.summary.diagnosticReady, true);
  assert.equal(attachmentRetentionPrecheckJson.summary.diagnosticObjectCleanedUp, true);
  assert.equal(attachmentRetentionPrecheckJson.summary.configured, true);
  assert.equal(attachmentRetentionPrecheckJson.summary.missingConfigFieldCount, 0);
  assert.equal(attachmentRetentionPrecheckJson.summary.storageKind, "local_fs");
  assert.equal(attachmentRetentionPrecheckJson.summary.storageProvider, "local_fs");
  assert.equal(attachmentRetentionPrecheckJson.summary.storageKindLabel, "本地文件");
  assert.equal(attachmentRetentionPrecheckJson.summary.objectStorageLive, false);
  assert.equal(attachmentRetentionPrecheckJson.summary.localFsAcceptedForV1, false);
  assert.equal(attachmentRetentionPrecheckJson.summary.releaseCandidateRefreshed, false);
  assert.equal(attachmentRetentionPrecheckJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(attachmentRetentionPrecheckJson.criteria.length, 5);
  assert.equal(attachmentRetentionPrecheckJson.blockingCriteria.length, 1);
  assert.equal(attachmentRetentionPrecheckJson.blockingCriteria[0].key, "attachment-production-retention-mode");
  assert.equal(attachmentRetentionPrecheckJson.diagnostics.ready, true);
  assert.equal(attachmentRetentionPrecheckJson.diagnostics.configured, true);
  assert.equal(attachmentRetentionPrecheckJson.diagnostics.writeOk, true);
  assert.equal(attachmentRetentionPrecheckJson.diagnostics.readOk, true);
  assert.equal(attachmentRetentionPrecheckJson.diagnostics.digestOk, true);
  assert.equal(attachmentRetentionPrecheckJson.diagnostics.cleanupOk, true);
  assert.equal(attachmentRetentionPrecheckJson.diagnostics.secretFieldsExposed, false);
  assert.equal(attachmentRetentionPrecheckJson.storageMode.objectStorageLive, false);
  assert.equal(attachmentRetentionPrecheckJson.storageMode.localFsAcceptedForV1, false);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.nonMutating, true);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.currentRuntime, true);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.requestBodyIgnored, true);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.diagnosticObjectCreated, true);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.diagnosticObjectCleanedUp, true);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.rawAttachmentV1ReadinessIncluded, false);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.rawStorageDiagnosticsIncluded, false);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.diagnosticObjectIdIncluded, false);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.diagnosticStorageKeyIncluded, false);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.digestValuesIncluded, false);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.localFsAcceptanceReferenceIncluded, false);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.payloadExposed, false);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.secretFieldsExposed, false);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.environmentValuesIncluded, false);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.commandValuesIncluded, false);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.secretValuesIncluded, false);
  assert.equal(attachmentRetentionPrecheckJson.safeguards.localPathExposed, false);
  const serializedAttachmentRetentionPrecheck = JSON.stringify(attachmentRetentionPrecheckJson);
  assert.doesNotMatch(serializedAttachmentRetentionPrecheck, /\.erp-local-storage|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedAttachmentRetentionPrecheck, /SUPER_SECRET_OBJECT|SECRET_ATTACHMENT_VALUE/);
  assert.doesNotMatch(
    serializedAttachmentRetentionPrecheck,
    /"diagnosticAttachmentId"\s*:|"diagnosticStorageKey"\s*:|"contentDigest"\s*:|"expectedDigest"\s*:|"readDigest"\s*:/,
  );

  const clientAttachmentRetentionPrecheckResult = await precheckOfficeV1AttachmentRetention(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientAttachmentRetentionPrecheckResult.source, "api");
  assert.equal(clientAttachmentRetentionPrecheckResult.blocked, false);
  assert.equal(clientAttachmentRetentionPrecheckResult.precheckResult.statusLabel, "仍未通过");
  assert.equal(clientAttachmentRetentionPrecheckResult.precheckResult.summary.readinessLabel, "4/5");
  assert.equal(clientAttachmentRetentionPrecheckResult.precheckResult.summary.storageKindLabel, "本地文件");
  assert.equal(clientAttachmentRetentionPrecheckResult.precheckResult.summary.objectStorageLive, false);
  assert.equal(clientAttachmentRetentionPrecheckResult.precheckResult.summary.diagnosticObjectCleanedUp, true);
  assert.equal(clientAttachmentRetentionPrecheckResult.precheckResult.summary.localFsAcceptedForV1, false);
  assert.equal(clientAttachmentRetentionPrecheckResult.precheckResult.blockingCriteria.length, 1);
  assert.equal(clientAttachmentRetentionPrecheckResult.precheckResult.diagnostics.missingConfigFields.length, 0);

  const driverReadinessPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-driver-readiness/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      driverOperatorId: "SHOULD_BE_IGNORED",
      rawNativePayload: "SECRET_NATIVE_PAYLOAD",
      scannedText: "SECRET_PACKAGE_SCAN_TEXT",
      photoDataUrl: "data:image/png;base64,SECRET_PHOTO",
      gps: "SECRET_GPS",
      localPath: "/Users/should-not-leak/.erp-local-storage",
    }),
  });
  assert.equal(
    driverReadinessPrecheckResponse.status,
    200,
    "/api/system/v1-driver-readiness/live-precheck should return 200 for management",
  );
  const driverReadinessPrecheckJson = await driverReadinessPrecheckResponse.json();
  assert.equal(driverReadinessPrecheckJson.version, "p0-v1-driver-readiness-live-precheck-v1");
  assert.equal(driverReadinessPrecheckJson.scope, "v1_driver_readiness_live_precheck");
  assert.equal(driverReadinessPrecheckJson.status, "blocked");
  assert.equal(driverReadinessPrecheckJson.ready, false);
  assert.equal(driverReadinessPrecheckJson.summary.readinessLabel, "1/6");
  assert.equal(driverReadinessPrecheckJson.summary.passedCount, 1);
  assert.equal(driverReadinessPrecheckJson.summary.totalCount, 6);
  assert.equal(driverReadinessPrecheckJson.summary.blockingCount, 5);
  assert.equal(driverReadinessPrecheckJson.summary.currentRuntime, true);
  assert.equal(driverReadinessPrecheckJson.summary.requestBodyIgnored, true);
  assert.equal(driverReadinessPrecheckJson.summary.deliveryTaskStatusChanged, false);
  assert.equal(driverReadinessPrecheckJson.summary.deliveryTaskCount, 3);
  assert.equal(driverReadinessPrecheckJson.summary.fieldTestRecordAvailable, false);
  assert.equal(driverReadinessPrecheckJson.summary.nativeSupportedLabel, "0/2");
  assert.equal(driverReadinessPrecheckJson.summary.packageLabelScanMatched, false);
  assert.equal(driverReadinessPrecheckJson.summary.packageLabelScanNative, false);
  assert.equal(driverReadinessPrecheckJson.summary.requiresNativeShell, true);
  assert.equal(driverReadinessPrecheckJson.summary.browserOnlyNotReady, true);
  assert.equal(driverReadinessPrecheckJson.criteria.length, 6);
  assert.equal(driverReadinessPrecheckJson.blockingCriteria.length, 5);
  assert.ok(driverReadinessPrecheckJson.criteria.some((item) => item.key === "driver-delivery-task-read-model" && item.status === "passed"));
  assert.ok(driverReadinessPrecheckJson.blockingCriteria.some((item) => item.key === "driver-native-package-scan"));
  assert.ok(driverReadinessPrecheckJson.blockingCriteria.some((item) => item.key === "driver-native-navigation"));
  assert.equal(driverReadinessPrecheckJson.deliveryTaskReadiness.total, 3);
  assert.equal(driverReadinessPrecheckJson.latestFieldTest, null);
  assert.equal(driverReadinessPrecheckJson.nativeBridge, null);
  assert.equal(driverReadinessPrecheckJson.packageLabelScanSample, null);
  assert.equal(driverReadinessPrecheckJson.safeguards.nonMutating, true);
  assert.equal(driverReadinessPrecheckJson.safeguards.currentRuntime, true);
  assert.equal(driverReadinessPrecheckJson.safeguards.requestBodyIgnored, true);
  assert.equal(driverReadinessPrecheckJson.safeguards.deliveryTaskStatusChanged, false);
  assert.equal(driverReadinessPrecheckJson.safeguards.cameraPermissionRequested, false);
  assert.equal(driverReadinessPrecheckJson.safeguards.navigationAppOpened, false);
  assert.equal(driverReadinessPrecheckJson.safeguards.nativeBridgeInvoked, false);
  assert.equal(driverReadinessPrecheckJson.safeguards.rawDriverReadinessIncluded, false);
  assert.equal(driverReadinessPrecheckJson.safeguards.rawDeliveryTasksIncluded, false);
  assert.equal(driverReadinessPrecheckJson.safeguards.rawFieldTestRecordIncluded, false);
  assert.equal(driverReadinessPrecheckJson.safeguards.rawNativePayloadIncluded, false);
  assert.equal(driverReadinessPrecheckJson.safeguards.rawScanTextIncluded, false);
  assert.equal(driverReadinessPrecheckJson.safeguards.rawPhotoIncluded, false);
  assert.equal(driverReadinessPrecheckJson.safeguards.rawLocationIncluded, false);
  assert.equal(driverReadinessPrecheckJson.safeguards.payloadExposed, false);
  assert.equal(driverReadinessPrecheckJson.safeguards.localPathExposed, false);
  const serializedDriverReadinessPrecheck = JSON.stringify(driverReadinessPrecheckJson);
  assert.doesNotMatch(serializedDriverReadinessPrecheck, /\.erp-local-storage|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedDriverReadinessPrecheck, /SECRET_NATIVE_PAYLOAD|SECRET_PACKAGE_SCAN_TEXT|SECRET_PHOTO|SECRET_GPS|SHOULD_BE_IGNORED/);
  assert.doesNotMatch(serializedDriverReadinessPrecheck, /"scannedText"\s*:|"photoDataUrl"\s*:|"rawNativePayload"\s*:|"gps"\s*:/);

  const deniedDriverReadinessPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-driver-readiness/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: JSON.stringify({}),
  });
  assert.equal(deniedDriverReadinessPrecheckResponse.status, 403);
  const deniedDriverReadinessPrecheckJson = await deniedDriverReadinessPrecheckResponse.json();
  assert.equal(deniedDriverReadinessPrecheckJson.requiredPermission, "system.v1_driver_readiness.precheck");

  const clientDriverReadinessPrecheckResult = await precheckOfficeV1DriverReadiness(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientDriverReadinessPrecheckResult.source, "api");
  assert.equal(clientDriverReadinessPrecheckResult.blocked, false);
  assert.equal(clientDriverReadinessPrecheckResult.precheckResult.statusLabel, "仍未通过");
  assert.equal(clientDriverReadinessPrecheckResult.precheckResult.summary.readinessLabel, "1/6");
  assert.equal(clientDriverReadinessPrecheckResult.precheckResult.summary.deliveryTaskCount, 3);
  assert.equal(clientDriverReadinessPrecheckResult.precheckResult.summary.nativeSupportedLabel, "0/2");
  assert.equal(clientDriverReadinessPrecheckResult.precheckResult.summary.deliveryTaskStatusChanged, false);
  assert.equal(clientDriverReadinessPrecheckResult.precheckResult.blockingCriteria.length, 5);
  assert.equal(clientDriverReadinessPrecheckResult.precheckResult.safeguards.nativeBridgeInvoked, false);

  const runtimeReadinessPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-runtime-readiness/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ apiBaseUrl: "http://SUPER_SECRET.invalid/api", bearerToken: "SECRET_VALUE" }),
  });
  assert.equal(
    runtimeReadinessPrecheckResponse.status,
    200,
    "/api/system/v1-runtime-readiness/live-precheck should return 200 for management",
  );
  const runtimeReadinessPrecheckJson = await runtimeReadinessPrecheckResponse.json();
  assert.equal(runtimeReadinessPrecheckJson.version, "p0-v1-runtime-readiness-live-precheck-v1");
  assert.equal(runtimeReadinessPrecheckJson.scope, "v1_runtime_readiness_live_precheck");
  assert.equal(runtimeReadinessPrecheckJson.status, "blocked");
  assert.equal(runtimeReadinessPrecheckJson.ready, false);
  assert.equal(runtimeReadinessPrecheckJson.summary.readinessLabel, "5/11");
  assert.equal(runtimeReadinessPrecheckJson.summary.passedCount, 5);
  assert.equal(runtimeReadinessPrecheckJson.summary.totalCount, 11);
  assert.equal(runtimeReadinessPrecheckJson.summary.blockingCount, 6);
  assert.equal(runtimeReadinessPrecheckJson.summary.currentRuntime, true);
  assert.equal(runtimeReadinessPrecheckJson.summary.requestBodyIgnored, true);
  assert.equal(runtimeReadinessPrecheckJson.summary.apiBaseUrlAccepted, false);
  assert.equal(runtimeReadinessPrecheckJson.summary.releaseCandidateRefreshed, false);
  assert.equal(runtimeReadinessPrecheckJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(runtimeReadinessPrecheckJson.summary.physicalPrinterCalled, false);
  assert.equal(runtimeReadinessPrecheckJson.summary.nonPrinting, true);
  assert.equal(runtimeReadinessPrecheckJson.criteria.length, 11);
  assert.equal(runtimeReadinessPrecheckJson.blockingCriteria.length, 6);
  assert.ok(runtimeReadinessPrecheckJson.blockingCriteria.some((item) => item.key === "system-v1-persistence"));
  assert.ok(runtimeReadinessPrecheckJson.blockingCriteria.some((item) => item.key === "attachment-v1-readiness"));
  assert.ok(runtimeReadinessPrecheckJson.blockingCriteria.some((item) => item.key === "print-spool-diagnostics"));
  assert.ok(runtimeReadinessPrecheckJson.blockingCriteria.some((item) => item.key === "print-cups-diagnostics"));
  assert.ok(runtimeReadinessPrecheckJson.blockingCriteria.some((item) => item.key === "print-v1-readiness"));
  assert.ok(runtimeReadinessPrecheckJson.blockingCriteria.some((item) => item.key === "driver-v1-readiness"));
  assert.equal(runtimeReadinessPrecheckJson.safeguards.nonMutating, true);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.liveApiReadback, true);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.requestBodyIgnored, true);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.apiBaseUrlAccepted, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.bearerTokenAccepted, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.rawRuntimeReadinessReportIncluded, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.rawReadinessSourcesIncluded, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.rawPermissionsIncluded, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.apiBaseUrlExposed, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.environmentValuesIncluded, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.commandValuesIncluded, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.secretValuesIncluded, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.payloadIncluded, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.spoolPathExposed, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.localPathExposed, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.physicalPrinterCalled, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.printFileCreated, false);
  assert.equal(runtimeReadinessPrecheckJson.safeguards.driverDeliveryStatusChanged, false);
  const serializedRuntimeReadinessPrecheck = JSON.stringify(runtimeReadinessPrecheckJson);
  assert.doesNotMatch(serializedRuntimeReadinessPrecheck, /\.erp-local-storage|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedRuntimeReadinessPrecheck, /SUPER_SECRET|SECRET_VALUE|pass@prod-db/i);
  assert.doesNotMatch(serializedRuntimeReadinessPrecheck, /127\.0\.0\.1:\d+\/api/);

  const clientRuntimeReadinessPrecheckResult = await precheckOfficeV1RuntimeReadiness(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientRuntimeReadinessPrecheckResult.source, "api");
  assert.equal(clientRuntimeReadinessPrecheckResult.blocked, false);
  assert.equal(clientRuntimeReadinessPrecheckResult.precheckResult.statusLabel, "仍未通过");
  assert.equal(clientRuntimeReadinessPrecheckResult.precheckResult.summary.readinessLabel, "5/11");
  assert.equal(clientRuntimeReadinessPrecheckResult.precheckResult.summary.currentRuntime, true);
  assert.equal(clientRuntimeReadinessPrecheckResult.precheckResult.summary.apiBaseUrlAccepted, false);
  assert.equal(clientRuntimeReadinessPrecheckResult.precheckResult.summary.releaseCandidateRefreshed, false);
  assert.equal(clientRuntimeReadinessPrecheckResult.precheckResult.blockingCriteria.length, 6);

  const v1V2BoundaryPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-v2-boundary/precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      confirmedBy: "SHOULD_BE_IGNORED",
      token: "SUPER_SECRET_BOUNDARY_TOKEN",
    }),
  });
  assert.equal(v1V2BoundaryPrecheckResponse.status, 200, "/api/system/v1-v2-boundary/precheck should return 200 for management");
  const v1V2BoundaryPrecheckJson = await v1V2BoundaryPrecheckResponse.json();
  assert.equal(v1V2BoundaryPrecheckJson.version, "p0-v1-v2-boundary-precheck-v1");
  assert.equal(v1V2BoundaryPrecheckJson.scope, "v1_v2_boundary_precheck");
  assert.equal(v1V2BoundaryPrecheckJson.status, "pending_confirmation");
  assert.equal(v1V2BoundaryPrecheckJson.ready, false);
  assert.equal(v1V2BoundaryPrecheckJson.summary.boundaryLabel, "待确认");
  assert.equal(v1V2BoundaryPrecheckJson.summary.boundaryReady, false);
  assert.equal(v1V2BoundaryPrecheckJson.summary.canDeclareV1Complete, false);
  assert.equal(v1V2BoundaryPrecheckJson.summary.scopeBriefAvailable, true);
  assert.equal(v1V2BoundaryPrecheckJson.summary.v1MustContinueCount, 6);
  assert.equal(v1V2BoundaryPrecheckJson.summary.v2CategoryCount, 7);
  assert.equal(v1V2BoundaryPrecheckJson.summary.v2DifferenceCount, 17);
  assert.equal(v1V2BoundaryPrecheckJson.summary.moduleDifferenceCount, 11);
  assert.equal(v1V2BoundaryPrecheckJson.summary.releaseCandidateRefreshed, false);
  assert.equal(v1V2BoundaryPrecheckJson.summary.goLiveSuiteRefreshed, false);
  assert.ok(v1V2BoundaryPrecheckJson.blockers.some((item) => item.key === "v1-must-continue-open"));
  assert.ok(v1V2BoundaryPrecheckJson.blockers.some((item) => item.key === "v1-v2-boundary-confirmation-missing"));
  assert.ok(v1V2BoundaryPrecheckJson.v1MustContinue.some((item) => item.includes("生产级持久化")));
  assert.ok(v1V2BoundaryPrecheckJson.v2Categories.includes("企微 / 客户自动化"));
  assert.ok(v1V2BoundaryPrecheckJson.v2Differences.some((item) => item.includes("企业微信")));
  assert.ok(v1V2BoundaryPrecheckJson.moduleDifferences.some((item) => item.module === "订单录入"));
  assert.match(v1V2BoundaryPrecheckJson.ownerReview.approvalRule, /缺一项都不能宣布 V1 完成/);
  assert.equal(v1V2BoundaryPrecheckJson.safeguards.nonMutating, true);
  assert.equal(v1V2BoundaryPrecheckJson.safeguards.requestBodyIgnored, true);
  assert.equal(v1V2BoundaryPrecheckJson.safeguards.boundaryConfirmationMutated, false);
  assert.equal(v1V2BoundaryPrecheckJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(v1V2BoundaryPrecheckJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(v1V2BoundaryPrecheckJson.safeguards.rawV1V2ScopeIncluded, false);
  assert.equal(v1V2BoundaryPrecheckJson.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(v1V2BoundaryPrecheckJson.safeguards.rawSignersIncluded, false);
  assert.equal(v1V2BoundaryPrecheckJson.safeguards.artifactPathExposed, false);
  assert.equal(v1V2BoundaryPrecheckJson.safeguards.environmentValuesIncluded, false);
  assert.equal(v1V2BoundaryPrecheckJson.safeguards.commandValuesIncluded, false);
  const serializedV1V2BoundaryPrecheck = JSON.stringify(v1V2BoundaryPrecheckJson);
  assert.doesNotMatch(serializedV1V2BoundaryPrecheck, /\.erp-local-storage|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedV1V2BoundaryPrecheck, /SHOULD_BE_IGNORED|SUPER_SECRET_BOUNDARY_TOKEN/);
  assert.doesNotMatch(serializedV1V2BoundaryPrecheck, /onsiteEvidenceRef|onsiteSigner|onsiteConfirmedBy|confirmedBy/);

  const clientV1V2BoundaryPrecheckResult = await precheckOfficeV1V2Boundary(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientV1V2BoundaryPrecheckResult.source, "api");
  assert.equal(clientV1V2BoundaryPrecheckResult.blocked, false);
  assert.equal(clientV1V2BoundaryPrecheckResult.precheckResult.statusLabel, "待确认");
  assert.equal(clientV1V2BoundaryPrecheckResult.precheckResult.summary.boundaryLabel, "待确认");
  assert.equal(clientV1V2BoundaryPrecheckResult.precheckResult.summary.v1MustContinueLabel, "6 项");
  assert.equal(clientV1V2BoundaryPrecheckResult.precheckResult.summary.v2DifferenceLabel, "17 项");
  assert.equal(clientV1V2BoundaryPrecheckResult.precheckResult.summary.releaseCandidateRefreshed, false);
  assert.ok(clientV1V2BoundaryPrecheckResult.precheckResult.blockers.some((item) => item.key === "v1-must-continue-open"));

  const v1V2ScopeBriefRefreshResponse = await fetch(`${baseUrl}/api/system/v1-v2-scope-brief/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      v2Differences: ["SHOULD_BE_IGNORED"],
      token: "SUPER_SECRET_SCOPE_TOKEN",
      outputDir: "/Users/fake/v1-v2",
    }),
  });
  assert.equal(v1V2ScopeBriefRefreshResponse.status, 200, "/api/system/v1-v2-scope-brief/refresh should return 200 for management");
  const v1V2ScopeBriefRefreshJson = await v1V2ScopeBriefRefreshResponse.json();
  assert.equal(v1V2ScopeBriefRefreshJson.version, "p0-v1-v2-scope-brief-refresh-v1");
  assert.equal(v1V2ScopeBriefRefreshJson.scope, "v1_v2_scope_brief_refresh");
  assert.equal(v1V2ScopeBriefRefreshJson.status, "blocked_scope_brief_refreshed");
  assert.equal(v1V2ScopeBriefRefreshJson.ready, false);
  assert.equal(v1V2ScopeBriefRefreshJson.summary.scopeBriefRefreshed, true);
  assert.equal(v1V2ScopeBriefRefreshJson.summary.v1MustContinueCount, 6);
  assert.equal(v1V2ScopeBriefRefreshJson.summary.v2CategoryCount, 7);
  assert.equal(v1V2ScopeBriefRefreshJson.summary.v2DifferenceCount, 17);
  assert.equal(v1V2ScopeBriefRefreshJson.summary.moduleDifferenceCount, 11);
  assert.equal(v1V2ScopeBriefRefreshJson.summary.boundaryConfirmationMutated, false);
  assert.equal(v1V2ScopeBriefRefreshJson.summary.releaseCandidateRefreshed, false);
  assert.equal(v1V2ScopeBriefRefreshJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(v1V2ScopeBriefRefreshJson.summary.requestBodyIgnored, true);
  assert.ok(v1V2ScopeBriefRefreshJson.v1MustContinue.some((item) => item.includes("生产级持久化")));
  assert.ok(v1V2ScopeBriefRefreshJson.v2Categories.includes("企微 / 客户自动化"));
  assert.ok(v1V2ScopeBriefRefreshJson.v2Differences.some((item) => item.includes("企业微信")));
  assert.ok(v1V2ScopeBriefRefreshJson.moduleDifferences.some((item) => item.module === "订单录入"));
  assert.match(v1V2ScopeBriefRefreshJson.ownerReview.approvalRule, /缺一项都不能宣布 V1 完成/);
  assert.equal(v1V2ScopeBriefRefreshJson.safeguards.requestBodyIgnored, true);
  assert.equal(v1V2ScopeBriefRefreshJson.safeguards.scopeBriefRefreshed, true);
  assert.equal(v1V2ScopeBriefRefreshJson.safeguards.sourceScopeMarkdownMutated, false);
  assert.equal(v1V2ScopeBriefRefreshJson.safeguards.completionSnapshotMutated, false);
  assert.equal(v1V2ScopeBriefRefreshJson.safeguards.fieldEvidenceMutated, false);
  assert.equal(v1V2ScopeBriefRefreshJson.safeguards.boundaryConfirmationMutated, false);
  assert.equal(v1V2ScopeBriefRefreshJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(v1V2ScopeBriefRefreshJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(v1V2ScopeBriefRefreshJson.safeguards.rawV1V2ScopeIncluded, false);
  assert.equal(v1V2ScopeBriefRefreshJson.safeguards.rawCommandStdoutIncluded, false);
  assert.equal(v1V2ScopeBriefRefreshJson.safeguards.rawCommandStderrIncluded, false);
  assert.equal(v1V2ScopeBriefRefreshJson.safeguards.artifactPathExposed, false);
  assert.equal(v1V2ScopeBriefRefreshJson.safeguards.environmentValuesIncluded, false);
  assert.equal(v1V2ScopeBriefRefreshJson.safeguards.commandValuesIncluded, false);
  const serializedV1V2ScopeBriefRefresh = JSON.stringify(v1V2ScopeBriefRefreshJson);
  assert.doesNotMatch(serializedV1V2ScopeBriefRefresh, /\.erp-local-storage|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedV1V2ScopeBriefRefresh, /SHOULD_BE_IGNORED|SUPER_SECRET_SCOPE_TOKEN/);

  const clientV1V2ScopeBriefRefreshResult = await refreshOfficeV1V2ScopeBrief(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientV1V2ScopeBriefRefreshResult.source, "api");
  assert.equal(clientV1V2ScopeBriefRefreshResult.blocked, false);
  assert.equal(clientV1V2ScopeBriefRefreshResult.refreshResult.statusLabel, "已刷新仍阻塞");
  assert.equal(clientV1V2ScopeBriefRefreshResult.refreshResult.summary.scopeBriefRefreshed, true);
  assert.equal(clientV1V2ScopeBriefRefreshResult.refreshResult.summary.v1MustContinueLabel, "6 项");
  assert.equal(clientV1V2ScopeBriefRefreshResult.refreshResult.summary.v2DifferenceLabel, "17 项");
  assert.equal(clientV1V2ScopeBriefRefreshResult.refreshResult.summary.releaseCandidateRefreshed, false);
  assert.ok(clientV1V2ScopeBriefRefreshResult.refreshResult.v2Categories.includes("AI / OCR / 图片识别"));

  const refreshPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-release-candidate/refresh-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: "{}",
  });
  assert.equal(refreshPrecheckResponse.status, 200, "/api/system/v1-release-candidate/refresh-precheck should return 200 for management");
  const refreshPrecheckJson = await refreshPrecheckResponse.json();
  assert.equal(refreshPrecheckJson.version, "p0-v1-release-candidate-refresh-precheck-v1");
  assert.equal(refreshPrecheckJson.scope, "v1_release_candidate_refresh_precheck");
  assert.equal(refreshPrecheckJson.status, "blocked");
  assert.equal(refreshPrecheckJson.ready, false);
  assert.equal(refreshPrecheckJson.summary.draftManifestStatus, "available");
  assert.equal(refreshPrecheckJson.summary.draftFreshnessStatus, "fresh");
  assert.equal(refreshPrecheckJson.summary.draftFreshnessLabel, "已匹配");
  assert.equal(refreshPrecheckJson.summary.draftFreshnessReady, true);
  assert.equal(refreshPrecheckJson.summary.draftValidationStatus, "blocked");
  assert.equal(refreshPrecheckJson.summary.evidenceProgress, "0/34");
  assert.equal(refreshPrecheckJson.summary.signoffProgress, "0/6");
  assert.equal(refreshPrecheckJson.summary.evidenceGroupsReadyLabel, "0/6");
  assert.equal(refreshPrecheckJson.summary.productionEnvPreflightLabel, "2/10");
  assert.equal(refreshPrecheckJson.summary.productionEnvBlockingCount, 6);
  assert.equal(refreshPrecheckJson.summary.productionGoLiveReadinessLabel, "0/5");
  assert.equal(refreshPrecheckJson.summary.productionGoLiveBlockingCount, 5);
  assert.equal(refreshPrecheckJson.summary.productionGoLiveFirstBlockedStageKey, "production-env-file-audit");
  assert.equal(refreshPrecheckJson.summary.productionGoLiveFirstBlockedStageLabel, "生产 env 文件安全审计");
  assert.deepEqual(
    refreshPrecheckJson.summary.productionGoLiveSourceStatuses.map((item) => item.envVariable),
    ["ERP_V1_PRODUCTION_ENV_FILE", "ERP_V1_ENV_FILE", "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS"],
  );
  assert.ok(refreshPrecheckJson.summary.productionGoLiveSourceStatuses.every((item) => item.configured === false));
  assert.equal(refreshPrecheckJson.summary.productionGoLiveReady, false);
  assert.equal(refreshPrecheckJson.summary.boundaryLabel, "待确认");
  assert.equal(refreshPrecheckJson.summary.releaseCandidateRefreshAllowed, false);
  assert.equal(refreshPrecheckJson.summary.releaseCandidateRefreshed, false);
  assert.equal(refreshPrecheckJson.summary.goLiveSuiteRefreshed, false);
  assert.ok(refreshPrecheckJson.summary.blockerCount >= 3);
  assert.ok(refreshPrecheckJson.blockers.some((item) => item.key === "field-evidence-draft-blocked"));
  assert.ok(refreshPrecheckJson.blockers.some((item) => item.key === "production-env-preflight-blocked"));
  assert.ok(refreshPrecheckJson.blockers.some((item) => item.key === "production-go-live-combo-blocked"));
  assert.ok(
    refreshPrecheckJson.blockers.some((item) =>
      item.key === "production-go-live-combo-blocked" && item.detail.includes("首个阶段：生产 env 文件安全审计"),
    ),
  );
  assert.ok(refreshPrecheckJson.blockers.some((item) => item.key === "signoff-incomplete"));
  assert.ok(refreshPrecheckJson.blockers.some((item) => item.key === "v1-v2-boundary-pending"));
  assert.equal(refreshPrecheckJson.safeguards.nonMutating, true);
  assert.equal(refreshPrecheckJson.safeguards.refreshPrecheckOnly, true);
  assert.equal(refreshPrecheckJson.safeguards.draftManifestAvailable, true);
  assert.equal(refreshPrecheckJson.safeguards.draftFreshnessChecked, true);
  assert.equal(refreshPrecheckJson.safeguards.productionGoLivePrecheckIncluded, true);
  assert.equal(refreshPrecheckJson.safeguards.sourceManifestMutated, false);
  assert.equal(refreshPrecheckJson.safeguards.draftManifestMutated, false);
  assert.equal(refreshPrecheckJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(refreshPrecheckJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(refreshPrecheckJson.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(refreshPrecheckJson.safeguards.rawSignersIncluded, false);
  assert.equal(refreshPrecheckJson.safeguards.rawFieldEvidenceDraftManifestIncluded, false);
  assert.equal(refreshPrecheckJson.safeguards.digestValuesIncluded, false);
  assert.equal(refreshPrecheckJson.safeguards.rawProductionGoLivePrecheckIncluded, false);
  assert.equal(refreshPrecheckJson.safeguards.rawProductionEnvPreflightIncluded, false);
  assert.equal(refreshPrecheckJson.safeguards.rawEnvFileAuditIncluded, false);
  assert.equal(refreshPrecheckJson.safeguards.artifactPathExposed, false);
  assert.equal(refreshPrecheckJson.safeguards.localPathExposed, false);
  assert.equal(refreshPrecheckJson.safeguards.currentRuntimeChecked, true);
  assert.equal(refreshPrecheckJson.safeguards.productionEnvAppliedToProcess, false);
  assert.equal(refreshPrecheckJson.safeguards.physicalPrinterCalled, false);
  assert.equal(refreshPrecheckJson.safeguards.environmentValuesIncluded, false);
  assert.equal(refreshPrecheckJson.safeguards.commandValuesIncluded, false);
  const serializedRefreshPrecheck = JSON.stringify(refreshPrecheckJson);
  assert.doesNotMatch(serializedRefreshPrecheck, /\.erp-local-storage|filled-manifest|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedRefreshPrecheck, /onsiteEvidenceRef|onsiteSigner|onsiteConfirmedBy|evidenceRef/);
  assert.doesNotMatch(serializedRefreshPrecheck, /SUPER_SECRET|SECRET_VALUE|pass@prod-db/i);

  const clientRefreshPrecheckResult = await precheckOfficeV1ReleaseCandidateRefresh(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientRefreshPrecheckResult.source, "api");
  assert.equal(clientRefreshPrecheckResult.blocked, false);
  assert.equal(clientRefreshPrecheckResult.precheckResult.statusLabel, "暂不能刷新");
  assert.equal(clientRefreshPrecheckResult.precheckResult.summary.evidenceProgress, "0/34");
  assert.equal(clientRefreshPrecheckResult.precheckResult.summary.signoffProgress, "0/6");
  assert.equal(clientRefreshPrecheckResult.precheckResult.summary.productionEnvPreflightLabel, "2/10");
  assert.equal(clientRefreshPrecheckResult.precheckResult.summary.productionGoLiveReadinessLabel, "0/5");
  assert.equal(clientRefreshPrecheckResult.precheckResult.summary.productionGoLiveFirstBlockedStageKey, "production-env-file-audit");
  assert.equal(clientRefreshPrecheckResult.precheckResult.summary.productionGoLiveFirstBlockedStageLabel, "生产 env 文件安全审计");
  assert.equal(clientRefreshPrecheckResult.precheckResult.summary.productionGoLiveSourceStatuses.length, 3);
  assert.equal(clientRefreshPrecheckResult.precheckResult.summary.productionGoLiveReady, false);
  assert.equal(clientRefreshPrecheckResult.precheckResult.summary.draftFreshnessLabel, "已匹配");
  assert.equal(clientRefreshPrecheckResult.precheckResult.summary.releaseCandidateRefreshed, false);
  assert.ok(clientRefreshPrecheckResult.precheckResult.blockers.some((item) => item.key === "production-go-live-combo-blocked"));

  const refreshCandidateDeniedResponse = await fetch(`${baseUrl}/api/system/v1-release-candidate/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: JSON.stringify({ token: "SUPER_SECRET_WAREHOUSE_REFRESH_TOKEN" }),
  });
  assert.equal(refreshCandidateDeniedResponse.status, 403, "warehouse should not be allowed to refresh release candidate");

  const refreshCandidateResponse = await fetch(`${baseUrl}/api/system/v1-release-candidate/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      envFilePath: "/Users/should-not-be-read/.env",
      bearerToken: "SUPER_SECRET_RELEASE_REFRESH_TOKEN",
      commandArgs: ["--env-file", "/private/secret.env"],
    }),
  });
  assert.equal(refreshCandidateResponse.status, 409, "release candidate refresh should be blocked before precheck is ready");
  const refreshCandidateJson = await refreshCandidateResponse.json();
  assert.equal(refreshCandidateJson.version, "p0-v1-release-candidate-refresh-v1");
  assert.equal(refreshCandidateJson.scope, "v1_release_candidate_refresh");
  assert.equal(refreshCandidateJson.status, "blocked_by_precheck");
  assert.equal(refreshCandidateJson.ready, false);
  assert.equal(refreshCandidateJson.summary.releaseCandidateRefreshAllowed, false);
  assert.equal(refreshCandidateJson.summary.releaseCandidateRefreshed, false);
  assert.equal(refreshCandidateJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(refreshCandidateJson.summary.evidenceProgress, "0/34");
  assert.equal(refreshCandidateJson.summary.signoffProgress, "0/6");
  assert.equal(refreshCandidateJson.summary.productionEnvPreflightLabel, "2/10");
  assert.equal(refreshCandidateJson.summary.productionGoLiveReadinessLabel, "0/5");
  assert.equal(refreshCandidateJson.summary.productionGoLiveBlockingCount, 5);
  assert.equal(refreshCandidateJson.summary.productionGoLiveFirstBlockedStageKey, "production-env-file-audit");
  assert.equal(refreshCandidateJson.summary.productionGoLiveFirstBlockedStageLabel, "生产 env 文件安全审计");
  assert.deepEqual(
    refreshCandidateJson.summary.productionGoLiveSourceStatuses.map((item) => item.envVariable),
    ["ERP_V1_PRODUCTION_ENV_FILE", "ERP_V1_ENV_FILE", "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS"],
  );
  assert.equal(refreshCandidateJson.summary.productionGoLiveReady, false);
  assert.ok(refreshCandidateJson.summary.blockerCount >= 3);
  assert.ok(refreshCandidateJson.blockers.some((item) => item.key === "field-evidence-draft-blocked"));
  assert.ok(refreshCandidateJson.blockers.some((item) => item.key === "production-env-preflight-blocked"));
  assert.ok(refreshCandidateJson.blockers.some((item) => item.key === "production-go-live-combo-blocked"));
  assert.equal(refreshCandidateJson.safeguards.requestBodyIgnored, true);
  assert.equal(refreshCandidateJson.safeguards.precheckRequired, true);
  assert.equal(refreshCandidateJson.safeguards.precheckReady, false);
  assert.equal(refreshCandidateJson.safeguards.frontendEnvFilePathAccepted, false);
  assert.equal(refreshCandidateJson.safeguards.frontendTokenAccepted, false);
  assert.equal(refreshCandidateJson.safeguards.commandArgsAcceptedFromRequest, false);
  assert.equal(refreshCandidateJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(refreshCandidateJson.safeguards.goLiveSuiteRefreshed, false);
  assert.equal(refreshCandidateJson.safeguards.rawCommandStdoutIncluded, false);
  assert.equal(refreshCandidateJson.safeguards.rawCommandStderrIncluded, false);
  assert.equal(refreshCandidateJson.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(refreshCandidateJson.safeguards.rawSignersIncluded, false);
  assert.equal(refreshCandidateJson.safeguards.rawFieldEvidenceDraftManifestIncluded, false);
  assert.equal(refreshCandidateJson.safeguards.rawProductionGoLivePrecheckIncluded, false);
  assert.equal(refreshCandidateJson.safeguards.rawProductionEnvPreflightIncluded, false);
  assert.equal(refreshCandidateJson.safeguards.rawEnvFileAuditIncluded, false);
  assert.equal(refreshCandidateJson.safeguards.artifactPathExposed, false);
  assert.equal(refreshCandidateJson.safeguards.localPathExposed, false);
  assert.equal(refreshCandidateJson.safeguards.environmentValuesIncluded, false);
  assert.equal(refreshCandidateJson.safeguards.commandValuesIncluded, false);
  const serializedRefreshCandidate = JSON.stringify(refreshCandidateJson);
  assert.doesNotMatch(serializedRefreshCandidate, /\.erp-local-storage|filled-manifest|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedRefreshCandidate, /SUPER_SECRET|SECRET_VALUE|pass@prod-db/i);

  const clientRefreshCandidateResult = await refreshOfficeV1ReleaseCandidate(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  assert.equal(clientRefreshCandidateResult.source, "api_error");
  assert.equal(clientRefreshCandidateResult.blocked, true);
  assert.equal(clientRefreshCandidateResult.refreshResult.statusLabel, "暂不能刷新");
  assert.equal(clientRefreshCandidateResult.refreshResult.summary.releaseCandidateRefreshed, false);
  assert.equal(clientRefreshCandidateResult.refreshResult.summary.goLiveSuiteRefreshed, false);
  assert.equal(clientRefreshCandidateResult.refreshResult.summary.productionGoLiveSourceStatuses.length, 3);
  assert.ok(clientRefreshCandidateResult.refreshResult.blockers.length >= 3);

  const refreshedResponse = await fetch(`${baseUrl}/api/system/v1-go-live-status`, {
    headers: {
      "x-erp-user-id": "U-MANAGER-A",
    },
  });
  assert.equal(refreshedResponse.status, 200, "V1 go-live status should refresh after draft generation");
  const refreshedJson = await refreshedResponse.json();
  assert.equal(refreshedJson.fieldEvidenceIntakeGuidance.summary.draftManifestStatus, "available");
  assert.equal(refreshedJson.fieldEvidenceIntakeGuidance.summary.draftFreshnessStatus, "fresh");
  assert.equal(refreshedJson.fieldEvidenceIntakeQuality.summary.draftManifestStatus, "available");
  assert.equal(refreshedJson.fieldEvidenceIntakeQuality.summary.draftFreshnessStatus, "fresh");
  assert.equal(refreshedJson.fieldEvidenceIntakeQuality.summary.blockingIssueCount, 3);
  assert.equal(refreshedJson.fieldEvidenceIntakeQuality.summary.canRefreshReleaseCandidate, false);

  const clientStatus = normalizeV1GoLiveStatusForClient(json);
  assert.equal(clientStatus.statusLabel, "V1 仍未完成");
  assert.ok(clientStatus.metrics.some(([label, value]) => label === "发布门禁" && value === "0/4"));
  assert.ok(clientStatus.metrics.some(([label, value]) => label === "现场证据" && value === "0/34"));
  assert.ok(clientStatus.metrics.some(([label, value]) => label === "负责人签字" && value === "0/6"));
  assert.ok(clientStatus.moduleCompletionRows.some((row) => row.module === "原材料 / 成本 / 毛利"));
  assert.equal(clientStatus.unblockPlan.summary.taskCount, "53 项");
  assert.ok(clientStatus.unblockPlan.phases.some((phase) => phase.label.includes("先补生产环境和持久化")));
  const productionPhase = clientStatus.unblockPlan.phases.find((phase) => phase.key === "production_environment");
  assert.ok(productionPhase, "client should expose production environment unblock phase");
  assert.equal(productionPhase.groupLabel, "5 类");
  assert.equal(productionPhase.firstTaskLabel, "4/17");
  assert.ok(productionPhase.groups.some((group) => group.group === "生产环境变量预检" && group.count === 6));
  assert.ok(
    productionPhase.firstTasks.some((task) =>
      task.title === "统一 V1 持久化 profile" &&
      task.statusLabel === "待处理" &&
      task.roleLabel === "技术/管理"
    ),
  );
  assert.equal(clientStatus.ownerDecisionBrief.available, true);
  assert.equal(clientStatus.ownerDecisionBrief.canDeclareV1Complete, false);
  assert.equal(clientStatus.ownerDecisionBrief.decision.label, "不能宣布 V1 已完成");
  assert.equal(clientStatus.ownerDecisionBrief.completion.onsiteTaskLabel, "53 项");
  assert.equal(clientStatus.ownerDecisionBrief.summary.unfinishedItemLabel, "8/12");
  assert.equal(clientStatus.ownerDecisionBrief.summary.releaseGateLabel, "4 项");
  assert.equal(clientStatus.ownerDecisionBrief.summary.nextActionLabel, "8/8");
  assert.equal(clientStatus.ownerDecisionBrief.summary.topBlockerLabel, "5/10");
  assert.ok(clientStatus.ownerDecisionBrief.unfinishedItems.some((item) => item.label === "现场证据和签字"));
  assert.ok(clientStatus.ownerDecisionBrief.releaseGates.some((gate) => gate.label === "运行时 V1 readiness"));
  assert.ok(clientStatus.ownerDecisionBrief.nextActions.some((item) => item.includes("现场任务清单")));
  assert.ok(clientStatus.ownerDecisionBrief.topBlockers.some((item) => item.label === "附件对象存储环境变量"));
  assert.equal(clientStatus.runtimeReadinessBlockers.available, true);
  assert.equal(clientStatus.runtimeReadinessBlockers.summary.passedLabel, "5/11");
  assert.equal(clientStatus.runtimeReadinessBlockers.summary.blockingLabel, "6 项");
  assert.equal(clientStatus.runtimeReadinessBlockers.summary.shownBlockingLabel, "6/6");
  assert.ok(clientStatus.runtimeReadinessBlockers.blockers.some((item) => item.label === "CUPS 队列预检" && item.group === "真实打印链路"));
  assert.ok(clientStatus.runtimeReadinessBlockers.blockers.some((item) => item.label === "司机端 V1 真机门禁" && item.statusLabel === "阻塞"));
  assert.equal(clientStatus.fieldAcceptanceReport.available, true);
  assert.equal(clientStatus.fieldAcceptanceReport.summary.passedLabel, "5/11");
  assert.equal(clientStatus.fieldAcceptanceReport.summary.blockingLabel, "6 项");
  assert.equal(clientStatus.fieldAcceptanceReport.summary.shownBlockingLabel, "6/6");
  assert.ok(clientStatus.fieldAcceptanceReport.modules.some((item) => item.label === "附件留档" && item.statusLabel === "未通过"));
  assert.ok(clientStatus.fieldAcceptanceReport.blockingCriteria.some((item) => item.label === "CUPS 队列预检" && item.statusLabel === "阻塞"));
  assert.ok(clientStatus.fieldAcceptanceReport.requiredFieldEvidence.some((item) => item.label === "司机真机验收" && item.requiredLabel === "2 项"));
  assert.equal(clientStatus.productionEnvGate.available, true);
  assert.equal(clientStatus.productionEnvGate.summary.passedLabel, "2/10");
  assert.equal(clientStatus.productionEnvGate.summary.blockingLabel, "6 项");
  assert.equal(clientStatus.productionEnvGate.summary.warningLabel, "2 项");
  assert.equal(clientStatus.productionEnvGate.summary.auditStatusLabel, "已通过");
  assert.equal(clientStatus.productionEnvGate.audit.statusLabel, "已通过");
  assert.ok(clientStatus.productionEnvGate.blockingChecks.some((item) => item.label === "统一 V1 持久化 profile"));
  assert.ok(clientStatus.productionEnvGate.blockingChecks.some((item) => item.label === "CUPS 队列预检环境变量"));
  assert.equal(clientStatus.productionEnvIntakeVerification.available, true);
  assert.equal(clientStatus.productionEnvIntakeVerification.statusLabel, "阻塞");
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.configuredLabel, "0/23");
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.fullIntakeConfiguredLabel, "0/23");
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.minimumBlockingLabel, "0/12");
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.minimumBlockingTargetCount, 12);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.minimumBlockingMissingCount, 12);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.minimumWarningLabel, "0/8");
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.minimumWarningTargetCount, 8);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.blockingLabel, "12 项");
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.warningLabel, "8 项");
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.auditReady, true);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.intakeCsvReady, true);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.minimumBlockingItemCount, 12);
  assert.equal(clientStatus.productionEnvIntakeVerification.minimumBlockingItems.length, 12);
  assert.ok(
    clientStatus.productionEnvIntakeVerification.minimumBlockingItems.some((item) =>
      item.label === "任选其一变量组" &&
      item.variableLabel === "DATABASE_URL / ERP_V1_DATABASE_URL / PGURL"
    ),
  );
  assert.ok(
    clientStatus.productionEnvIntakeVerification.minimumBlockingItems.some((item) =>
      item.variableLabel === "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY" &&
      item.expectedValueType === "密钥 / token"
    ),
  );
  assert.ok(
    clientStatus.productionEnvIntakeVerification.minimumBlockingItems.some((item) =>
      item.variableLabel === "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND"
    ),
  );
  assert.ok(
    clientStatus.productionEnvIntakeVerification.blockingFindings.some((item) =>
      item.label === "附件对象存储环境变量" &&
      item.variableLabel === "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT"
    ),
  );
  assert.equal(clientStatus.productionEnvIntakeVerification.safeguards.envValuesIncluded, false);
  assert.equal(clientStatus.productionEnvIntakeVerification.safeguards.secretFieldsIncluded, false);
  assert.equal(clientStatus.productionPersistenceEvidence.available, true);
  assert.equal(clientStatus.productionPersistenceEvidence.statusLabel, "仍未通过");
  assert.equal(typeof clientStatus.productionPersistenceEvidence.summary.postgresReady, "boolean");
  assert.equal(typeof clientStatus.productionPersistenceEvidence.summary.objectStorageReady, "boolean");
  assert.equal(typeof clientStatus.productionPersistenceEvidence.summary.envFileFromProductionSetup, "boolean");
  assert.equal(clientStatus.productionPersistenceEvidence.safeguards.envFilePathExposed, false);
  assert.equal(clientStatus.productionPersistenceEvidence.safeguards.databaseUrlExposed, false);
  assert.equal(clientStatus.productionPersistenceEvidence.safeguards.objectStorageEndpointExposed, false);
  assert.equal(clientStatus.productionPersistenceEvidence.safeguards.objectStorageBucketExposed, false);
  assert.equal(clientStatus.productionPersistenceEvidence.safeguards.secretFieldsExposed, false);
  assert.equal(clientStatus.productionFirstStageExecution.available, true);
  assert.equal(clientStatus.productionFirstStageExecution.statusLabel, "阻塞");
  assert.equal(clientStatus.productionFirstStageExecution.summary.passedLabel, "1/8");
  assert.equal(clientStatus.productionFirstStageExecution.summary.blockingLabel, "1 项");
  assert.equal(clientStatus.productionFirstStageExecution.intakeCoverage.fullIntakeConfiguredLabel, "0/23");
  assert.equal(clientStatus.productionFirstStageExecution.intakeCoverage.minimumBlockingLabel, "0/12");
  assert.equal(clientStatus.productionFirstStageExecution.intakeCoverage.minimumBlockingMissingCount, 12);
  assert.equal(clientStatus.productionFirstStageExecution.intakeCoverage.minimumWarningLabel, "0/8");
  assert.equal(clientStatus.productionFirstStageExecution.intakeCoverage.intakeCsvReady, true);
  assert.equal(clientStatus.productionFirstStageExecution.dryRunCoverage.statusLabel, "未纳入");
  assert.equal(clientStatus.productionFirstStageExecution.dryRunCoverage.minimumBlockingLabel, "0/0");
  assert.ok(
    clientStatus.productionFirstStageExecution.blockingStages.some((stage) =>
      stage.label === "生产 env 真实值 intake 校验" &&
      stage.evidence.blockingCount === 12
    ),
  );
  assert.equal(clientStatus.productionFirstStageExecution.safeguards.rawStageCommandsIncluded, false);
  assert.equal(clientStatus.roleTaskBoard.available, true);
  assert.equal(clientStatus.roleTaskBoard.summary.taskCountLabel, "53 项");
  assert.equal(clientStatus.roleTaskBoard.summary.roleCountLabel, "6 个角色");
  assert.equal(clientStatus.roleTaskBoard.summary.categoryCount, 4);
  assert.match(clientStatus.roleTaskBoard.summary.shownTaskLabel, /^\d+\/53$/);
  assert.equal(clientStatus.roleTaskBoard.categorySummaries.length, 4);
  assert.ok(clientStatus.roleTaskBoard.categorySummaries.some((category) => category.key === "release" && category.countLabel === "12 项"));
  assert.ok(clientStatus.roleTaskBoard.categorySummaries.some((category) => category.key === "boundary" && category.statusLabel === "待处理"));
  assert.ok(clientStatus.roleTaskBoard.roles.some((role) => role.role === "技术/管理" && role.taskCount === 35));
  assert.ok(clientStatus.roleTaskBoard.roles.some((role) => role.role === "司机" && role.taskCount === 8));
  assert.equal(clientStatus.completionAudit.available, true);
  assert.equal(clientStatus.completionAudit.summary.criteriaCount, 7);
  assert.equal(clientStatus.completionAudit.summary.blockingCriteriaLabel, "7/7");
  assert.equal(clientStatus.completionAudit.summary.v2DifferenceLabel, "17 项");
  assert.equal(clientStatus.completionAudit.criteria.length, 7);
  assert.ok(clientStatus.completionAudit.criteria.some((item) => item.key === "production_env" && item.statusLabel === "阻塞"));
  assert.ok(clientStatus.completionAudit.criteria.some((item) => item.key === "field_evidence" && item.evidenceLabel === "0/34"));
  assert.ok(
    clientStatus.completionAudit.criteria.every((item) => item.proofRequirements.length > 0),
    "client completion audit criteria should preserve proof requirements",
  );
  assert.ok(
    clientStatus.completionAudit.criteria.every((item) => item.proofGaps.length > 0),
    "client completion audit criteria should preserve current proof gaps",
  );
  assert.equal(
    clientStatus.completionAudit.criteria.find((item) => item.key === "field_evidence")?.proofGapCountLabel,
    "4/6",
  );
  assert.equal(
    clientStatus.completionAudit.criteria.find((item) => item.key === "owner_signoff")?.proofGapTotalCount,
    6,
  );
  assert.equal(clientStatus.completionAudit.v2Boundary.v2DifferenceCount, 17);
  assert.equal(clientStatus.v1V2BoundaryBrief.available, true);
  assert.equal(clientStatus.v1V2BoundaryBrief.summary.v1MustContinueLabel, "6 项");
  assert.equal(clientStatus.v1V2BoundaryBrief.summary.v2CategoryLabel, "7 类");
  assert.equal(clientStatus.v1V2BoundaryBrief.summary.v2DifferenceLabel, "17 项");
  assert.equal(clientStatus.v1V2BoundaryBrief.summary.moduleDifferenceLabel, "11 个模块");
  assert.ok(clientStatus.v1V2BoundaryBrief.v1MustContinue.some((item) => item.includes("真实打印")));
  assert.ok(clientStatus.v1V2BoundaryBrief.v2Categories.includes("AI / OCR / 图片识别"));
  assert.ok(clientStatus.v1V2BoundaryBrief.moduleDifferences.some((item) => item.module === "司机端"));
  assert.equal(clientStatus.fieldEvidenceProgress.available, true);
  assert.equal(clientStatus.fieldEvidenceProgress.summary.evidenceGroupsLabel, "0/6");
  assert.equal(clientStatus.fieldEvidenceProgress.summary.evidenceItemsLabel, "0/34");
  assert.equal(clientStatus.fieldEvidenceProgress.summary.signoffLabel, "0/6");
  assert.equal(clientStatus.fieldEvidenceProgress.summary.missingEvidenceItemsLabel, "34/34");
  assert.equal(clientStatus.fieldEvidenceProgress.summary.signoffBoundaryActionsLabel, "7/7");
  assert.equal(clientStatus.fieldEvidenceProgress.summary.groupSummaryCount, 6);
  assert.equal(clientStatus.fieldEvidenceProgress.signoffBoundarySummary.signoffProgressLabel, "0/6");
  assert.equal(clientStatus.fieldEvidenceProgress.signoffBoundarySummary.actionLabel, "7/7");
  assert.equal(clientStatus.fieldEvidenceProgress.signoffBoundarySummary.previewActions.length, 3);
  assert.equal(clientStatus.fieldEvidenceProgress.boundary.label, "待确认");
  assert.ok(clientStatus.fieldEvidenceProgress.groups.some((group) => group.label === "生产持久化"));
  assert.equal(clientStatus.fieldEvidenceProgress.groupSummaries.length, 6);
  assert.ok(
    clientStatus.fieldEvidenceProgress.groupSummaries.some((group) =>
      group.key === "production_persistence" &&
      group.missingLabel === "5/5" &&
      group.firstMissingItem?.label === "PostgreSQL 迁移已在生产库执行"
    ),
  );
  assert.ok(
    clientStatus.fieldEvidenceProgress.groupSummaries.some((group) =>
      group.key === "print_hardware" &&
      group.firstMissingItems.length > 0 &&
      group.hiddenPreviewCount === 4
    ),
  );
  assert.ok(clientStatus.fieldEvidenceProgress.missingItems.some((item) => item.label === "PostgreSQL 迁移已在生产库执行"));
  assert.ok(clientStatus.fieldEvidenceProgress.signoffBoundaryActions.some((item) => item.label === "V1/V2 边界确认"));
  assert.equal(clientStatus.fieldEvidenceIntakeGuidance.available, true);
  assert.equal(clientStatus.fieldEvidenceIntakeGuidance.summary.evidenceProgressLabel, "0/34");
  assert.equal(clientStatus.fieldEvidenceIntakeGuidance.summary.signoffProgressLabel, "0/6");
  assert.equal(clientStatus.fieldEvidenceIntakeGuidance.summary.boundaryLabel, "待确认");
  assert.equal(clientStatus.fieldEvidenceIntakeGuidance.summary.draftManifestLabel, initialDraftManifestAvailable ? "已生成" : "未生成");
  assert.equal(clientStatus.fieldEvidenceIntakeGuidance.summary.draftFreshnessLabel, initialDraftFreshnessLabel);
  assert.equal(clientStatus.fieldEvidenceIntakeGuidance.summary.commandCountLabel, "3 步");
  assert.ok(clientStatus.fieldEvidenceIntakeGuidance.commands.some((item) => item.label === "生成现场证据 manifest 草稿"));
  assert.ok(clientStatus.fieldEvidenceIntakeGuidance.commands.some((item) => item.command.includes("<filled-field-evidence-manifest-draft>")));
  assert.equal(clientStatus.fieldEvidenceIntakeQuality.available, true);
  assert.equal(clientStatus.fieldEvidenceIntakeQuality.summary.evidenceProgress, "0/34");
  assert.equal(clientStatus.fieldEvidenceIntakeQuality.summary.signoffProgress, "0/6");
  assert.equal(
    clientStatus.fieldEvidenceIntakeQuality.summary.blockingIssueLabel,
    `${initialDraftManifestAvailable && initialDraftFreshnessReady ? 3 : 4} 项`,
  );
  assert.equal(clientStatus.fieldEvidenceIntakeQuality.summary.draftManifestLabel, initialDraftManifestAvailable ? "已生成" : "未生成");
  assert.equal(clientStatus.fieldEvidenceIntakeQuality.summary.draftFreshnessLabel, initialDraftFreshnessLabel);
  assert.equal(clientStatus.fieldEvidenceIntakeQuality.summary.canGenerateDraft, true);
  assert.equal(clientStatus.fieldEvidenceIntakeQuality.summary.canRefreshReleaseCandidate, false);
  assert.ok(clientStatus.fieldEvidenceIntakeQuality.checks.some((item) => item.label === "manifest 草稿" && item.statusLabel === (initialDraftManifestAvailable ? "通过" : "阻塞")));
  assert.ok(clientStatus.fieldEvidenceIntakeQuality.checks.some((item) => item.label === "草稿新鲜度"));
  assert.ok(clientStatus.fieldEvidenceIntakeQuality.checks.some((item) => item.label === "无效回填行" && item.statusLabel === "通过"));
  assert.equal(clientStatus.productionEnvFixChecklist.summary.itemCount, 10);
  assert.equal(clientStatus.productionEnvFixChecklist.items.length, 10);
  assert.equal(clientStatus.productionEnvFixChecklist.summary.configuredLabel, "9/30");
  assert.ok(clientStatus.productionEnvFixChecklist.items.some((item) => item.label === "附件对象存储环境变量"));
  assert.ok(clientStatus.productionEnvFixChecklist.items.some((item) => item.label === "PostgreSQL 恢复验证库环境变量"));
  assert.equal(clientStatus.productionEnvFillTemplate.available, true);
  assert.equal(clientStatus.productionEnvFillTemplate.summary.variableCount, 22);
  assert.equal(clientStatus.productionEnvFillTemplate.previewLines.length, clientStatus.productionEnvFillTemplate.summary.lineCount);
  assert.ok(clientStatus.productionEnvFillTemplate.previewLines.some((line) => line.includes("ERP_V1_DATABASE_URL=<待填写>")));
  assert.ok(clientStatus.productionEnvFillTemplate.previewLines.some((line) => line.includes("统一 V1 持久化 profile")));
  assert.equal(clientStatus.productionEnvMinimumValuesFragmentTemplate.available, true);
  assert.equal(clientStatus.productionEnvMinimumValuesFragmentTemplate.summary.variableCount, 11);
  assert.equal(clientStatus.productionEnvMinimumValuesFragmentTemplate.summary.targetLabel, "0/12");
  assert.equal(
    clientStatus.productionEnvMinimumValuesFragmentTemplate.summary.fileName,
    "production-env-minimum-values-fragment.template.env.example",
  );
  assert.ok(
    clientStatus.productionEnvMinimumValuesFragmentTemplate.previewLines.some((line) =>
      line.includes("ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=<待填写>")
    ),
  );
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.available, true);
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.status, "not_configured");
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.ready, false);
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.statusLabel, "未配置");
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.summary.configuredValuesFileCount, 0);
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.summary.primaryEnvVariable, "ERP_V1_PRODUCTION_ENV_VALUES_FILE");
  assert.equal(typeof clientStatus.productionEnvValuesFragmentSourceStatus.summary.targetSetupReady, "boolean");
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditStatus, "not_run");
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditReady, false);
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.summary.valuesFileAuditBlockingCount, 0);
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingLabel, "0/12");
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingMissingCount, 12);
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.summary.fullIntakeConfiguredLabel, "0/23");
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.targetSetupStatus.summary.targetEnvFilePathExposed, false);
  assert.deepEqual(
    clientStatus.productionEnvValuesFragmentSourceStatus.summary.sourceStatuses.map((item) => item.envVariable),
    [
      "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
      "ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE",
      "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE",
    ],
  );
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.summary.pathValueExposed, false);
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.acceptsFrontendPath, false);
  assert.equal(typeof clientStatus.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.targetSetupReady, "boolean");
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.valuesFileAuditReady, false);
  assert.equal(typeof clientStatus.productionEnvValuesFragmentSourceStatus.safeguards.targetSetupEnvFileCount, "number");
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.safeguards.valuesFileAuditPathExposed, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.available, true);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.status, "disabled");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.ready, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.statusLabel, "未启用");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.applyEnabled, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.applyEnableEnvVariable, "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.configuredValuesFileCount, 0);
  assert.equal(typeof clientStatus.productionEnvValuesApplyGateStatus.summary.targetSetupReady, "boolean");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.valuesFileAuditStatus, "not_run");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.valuesFileAuditReady, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.valuesFileAuditBlockingCount, 0);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.minimumBlockingLabel, "0/12");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.minimumBlockingMissingCount, 12);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.fullIntakeConfiguredLabel, "0/23");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofStatus, "not_included");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofReady, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofIncluded, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofStatusLabel, "未纳入");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofFresh, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofFreshnessStatus, "missing");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofFreshnessLabel, "dry-run 证明缺少检查时间");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofMaxAgeHours, 24);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofExpiresAt, "");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofRemainingHours, null);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofCheckedAtIncluded, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintStatus, "not_checked");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintStatusLabel, "未检查");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintCompared, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintIncluded, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintMatched, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintDigestExposed, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofValuesFingerprintValuesExposed, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofMinimumBlockingLabel, "0/0");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.dryRunProofMinimumBlockingMissingCount, 0);
  assert.ok(Number.isInteger(clientStatus.productionEnvValuesApplyGateStatus.summary.targetSetupEnvFileCount));
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.targetSetupStatus.summary.targetEnvFilePathExposed, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.targetEnvFileMayBeMutated, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.productionEnvFileMutated, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.serverConfigGuidance.applyEnabled, false);
  assert.equal(typeof clientStatus.productionEnvValuesApplyGateStatus.serverConfigGuidance.targetSetupReady, "boolean");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofStatus, "not_included");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofReady, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofFresh, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofMaxAgeHours, 24);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofExpiresAt, "");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofRemainingHours, null);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofCheckedAtIncluded, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofValuesFingerprintStatus, "not_checked");
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofValuesFingerprintMatched, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.serverConfigGuidance.dryRunProofValuesFingerprintDigestExposed, false);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.serverConfigGuidance.acceptsFrontendPath, false);
  assert.ok(clientStatus.v2DifferenceItems.some(([label]) => label.includes("订单录入")));

  console.log("V1 go-live status API check passed: backend artifacts, redaction, and frontend normalization are covered.");
} finally {
  restoreProductionEnvFileAuditEnv();
  restoreProductionEnvValuesFileEnv();
  await closeServer(server);
}

function clearProductionEnvFileAuditEnv() {
  delete process.env.ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS;
  delete process.env.ERP_V1_PRODUCTION_ENV_FILE;
  delete process.env.ERP_V1_ENV_FILE;
}

function clearProductionEnvValuesFileEnv() {
  delete process.env.ERP_V1_PRODUCTION_ENV_VALUES_FILE;
  delete process.env.ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE;
  delete process.env.ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE;
  delete process.env.ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED;
}

function restoreProductionEnvFileAuditEnv() {
  restoreEnvValue("ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS", originalProductionEnvFileAuditPaths);
  restoreEnvValue("ERP_V1_PRODUCTION_ENV_FILE", originalProductionEnvFile);
  restoreEnvValue("ERP_V1_ENV_FILE", originalV1EnvFile);
}

function restoreProductionEnvValuesFileEnv() {
  restoreEnvValue("ERP_V1_PRODUCTION_ENV_VALUES_FILE", originalProductionEnvValuesFile);
  restoreEnvValue("ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE", originalProductionEnvMinimumValuesFile);
  restoreEnvValue("ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE", originalProductionEnvValuesFragmentFile);
  restoreEnvValue("ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED", originalProductionEnvValuesApplyEnabled);
}

function restoreEnvValue(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

function listen(target) {
  return new Promise((resolve, reject) => {
    target.once("error", reject);
    target.listen(0, "127.0.0.1", () => {
      target.off("error", reject);
      resolve();
    });
  });
}

function closeServer(target) {
  return new Promise((resolve, reject) => {
    target.close((error) => (error ? reject(error) : resolve()));
  });
}
