import assert from "node:assert/strict";

export function assertClientGoLiveStatus({
  clientStatus,
  json,
  expectedBlockingTargetCount,
  expectedIntakeRowCount,
  expectedWarningTargetCount,
  initialDraftManifestAvailable,
  initialDraftFreshnessReady,
  initialDraftFreshnessLabel,
}) {
  assert.equal(clientStatus.statusLabel, "V1 仍未完成");
  assert.equal(clientStatus.todoLoadPrecheck.ready, true);
  assert.equal(clientStatus.todoLoadPrecheck.statusLabel, "已通过");
  assert.equal(clientStatus.todoLoadPrecheck.summary.successLabel, "100/100");
  assert.equal(clientStatus.todoLoadPrecheck.summary.p95Label, "240 ms");
  assert.equal(clientStatus.todoLoadPrecheck.freshness.statusLabel, "时效有效");
  assert.ok(clientStatus.metrics.some(([label, value]) => label === "发布门禁" && value === "0/4"));
  assert.ok(clientStatus.metrics.some(([label, value]) => label === "现场证据" && value === "0/40"));
  assert.ok(clientStatus.metrics.some(([label, value]) => label === "负责人签字" && value === "0/6"));
  assert.ok(clientStatus.moduleCompletionRows.some((row) => row.module === "原材料 / 成本 / 毛利"));
  assert.equal(clientStatus.unblockPlan.summary.taskCount, "59 项");
  assert.ok(clientStatus.unblockPlan.phases.some((phase) => phase.label.includes("先补生产环境和持久化")));
  const productionPhase = clientStatus.unblockPlan.phases.find((phase) => phase.key === "production_environment");
  assert.ok(productionPhase, "client should expose production environment unblock phase");
  assert.equal(productionPhase.groupLabel, "5 类");
  assert.match(productionPhase.firstTaskLabel, /^4\/\d+$/);
  assert.ok(
    productionPhase.groups.some(
      (group) =>
        group.group === "生产环境变量预检" &&
        group.count === json.productionEnvGate.summary.blockingCount,
    ),
  );
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
  assert.equal(clientStatus.ownerDecisionBrief.completion.onsiteTaskLabel, "59 项");
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
  assert.equal(clientStatus.productionEnvGate.summary.passedLabel, `2/${json.productionEnvGate.summary.totalCount}`);
  assert.equal(clientStatus.productionEnvGate.summary.blockingLabel, `${json.productionEnvGate.summary.blockingCount} 项`);
  assert.equal(clientStatus.productionEnvGate.summary.warningLabel, "2 项");
  assert.equal(clientStatus.productionEnvGate.summary.auditStatusLabel, "已通过");
  assert.equal(clientStatus.productionEnvGate.audit.statusLabel, "已通过");
  assert.ok(clientStatus.productionEnvGate.blockingChecks.some((item) => item.label === "统一 V1 持久化 profile"));
  assert.ok(clientStatus.productionEnvGate.blockingChecks.some((item) => item.label === "CUPS 队列预检环境变量"));
  assert.equal(clientStatus.productionEnvIntakeVerification.available, true);
  assert.equal(clientStatus.productionEnvIntakeVerification.statusLabel, "阻塞");
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.configuredLabel, `0/${expectedIntakeRowCount}`);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.fullIntakeConfiguredLabel, `0/${expectedIntakeRowCount}`);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.minimumBlockingLabel, `0/${expectedBlockingTargetCount}`);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.minimumBlockingTargetCount, expectedBlockingTargetCount);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.minimumBlockingMissingCount, expectedBlockingTargetCount);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.minimumWarningLabel, `0/${expectedWarningTargetCount}`);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.minimumWarningTargetCount, expectedWarningTargetCount);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.blockingLabel, `${expectedBlockingTargetCount} 项`);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.warningLabel, `${expectedWarningTargetCount} 项`);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.auditReady, true);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.intakeCsvReady, true);
  assert.equal(clientStatus.productionEnvIntakeVerification.summary.minimumBlockingItemCount, expectedBlockingTargetCount);
  assert.equal(clientStatus.productionEnvIntakeVerification.minimumBlockingItems.length, expectedBlockingTargetCount);
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
  assert.equal(clientStatus.productionFirstStageExecution.intakeCoverage.fullIntakeConfiguredLabel, `0/${expectedIntakeRowCount}`);
  assert.equal(clientStatus.productionFirstStageExecution.intakeCoverage.minimumBlockingLabel, `0/${expectedBlockingTargetCount}`);
  assert.equal(clientStatus.productionFirstStageExecution.intakeCoverage.minimumBlockingMissingCount, expectedBlockingTargetCount);
  assert.equal(clientStatus.productionFirstStageExecution.intakeCoverage.minimumWarningLabel, `0/${expectedWarningTargetCount}`);
  assert.equal(clientStatus.productionFirstStageExecution.intakeCoverage.intakeCsvReady, true);
  assert.equal(clientStatus.productionFirstStageExecution.dryRunCoverage.statusLabel, "未纳入");
  assert.equal(clientStatus.productionFirstStageExecution.dryRunCoverage.minimumBlockingLabel, "0/0");
  assert.ok(
    clientStatus.productionFirstStageExecution.blockingStages.some((stage) =>
      stage.label === "生产 env 真实值 intake 校验" &&
      stage.evidence.blockingCount === expectedBlockingTargetCount
    ),
  );
  assert.equal(clientStatus.productionFirstStageExecution.safeguards.rawStageCommandsIncluded, false);
  assert.equal(clientStatus.roleTaskBoard.available, true);
  assert.equal(clientStatus.roleTaskBoard.summary.taskCountLabel, "59 项");
  assert.equal(clientStatus.roleTaskBoard.summary.roleCountLabel, "6 个角色");
  assert.equal(clientStatus.roleTaskBoard.summary.categoryCount, 4);
  assert.match(clientStatus.roleTaskBoard.summary.shownTaskLabel, /^\d+\/59$/);
  assert.equal(clientStatus.roleTaskBoard.categorySummaries.length, 4);
  assert.ok(clientStatus.roleTaskBoard.categorySummaries.some((category) => category.key === "release" && category.countLabel === "12 项"));
  assert.ok(clientStatus.roleTaskBoard.categorySummaries.some((category) => category.key === "boundary" && category.statusLabel === "待处理"));
  assert.ok(clientStatus.roleTaskBoard.roles.some((role) => role.role === "技术/管理" && role.taskCount === 41));
  assert.ok(clientStatus.roleTaskBoard.roles.some((role) => role.role === "司机" && role.taskCount > 0));
  assert.equal(clientStatus.completionAudit.available, true);
  assert.equal(clientStatus.completionAudit.summary.criteriaCount, 7);
  assert.equal(clientStatus.completionAudit.summary.blockingCriteriaLabel, "7/7");
  assert.equal(clientStatus.completionAudit.summary.v2DifferenceLabel, "17 项");
  assert.equal(clientStatus.completionAudit.criteria.length, 7);
  assert.ok(clientStatus.completionAudit.criteria.some((item) => item.key === "production_env" && item.statusLabel === "阻塞"));
  assert.ok(clientStatus.completionAudit.criteria.some((item) => item.key === "field_evidence" && item.evidenceLabel === "0/40"));
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
    "4/7",
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
  assert.equal(clientStatus.fieldEvidenceProgress.summary.evidenceGroupsLabel, "0/7");
  assert.equal(clientStatus.fieldEvidenceProgress.summary.evidenceItemsLabel, "0/40");
  assert.equal(clientStatus.fieldEvidenceProgress.summary.signoffLabel, "0/6");
  assert.equal(clientStatus.fieldEvidenceProgress.summary.missingEvidenceItemsLabel, "40/40");
  assert.equal(clientStatus.fieldEvidenceProgress.summary.signoffBoundaryActionsLabel, "7/7");
  assert.equal(clientStatus.fieldEvidenceProgress.summary.groupSummaryCount, 7);
  assert.equal(clientStatus.fieldEvidenceProgress.signoffBoundarySummary.signoffProgressLabel, "0/6");
  assert.equal(clientStatus.fieldEvidenceProgress.signoffBoundarySummary.actionLabel, "7/7");
  assert.equal(clientStatus.fieldEvidenceProgress.signoffBoundarySummary.previewActions.length, 3);
  assert.equal(clientStatus.fieldEvidenceProgress.boundary.label, "待确认");
  assert.ok(clientStatus.fieldEvidenceProgress.groups.some((group) => group.label === "生产持久化"));
  assert.equal(clientStatus.fieldEvidenceProgress.groupSummaries.length, 7);
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
  assert.equal(clientStatus.fieldEvidenceIntakeGuidance.summary.evidenceProgressLabel, "0/40");
  assert.equal(clientStatus.fieldEvidenceIntakeGuidance.summary.signoffProgressLabel, "0/6");
  assert.equal(clientStatus.fieldEvidenceIntakeGuidance.summary.boundaryLabel, "待确认");
  assert.equal(clientStatus.fieldEvidenceIntakeGuidance.summary.draftManifestLabel, initialDraftManifestAvailable ? "已生成" : "未生成");
  assert.equal(clientStatus.fieldEvidenceIntakeGuidance.summary.draftFreshnessLabel, initialDraftFreshnessLabel);
  assert.equal(clientStatus.fieldEvidenceIntakeGuidance.summary.commandCountLabel, "3 步");
  assert.ok(clientStatus.fieldEvidenceIntakeGuidance.commands.some((item) => item.label === "生成现场证据 manifest 草稿"));
  assert.ok(clientStatus.fieldEvidenceIntakeGuidance.commands.some((item) => item.command.includes("<filled-field-evidence-manifest-draft>")));
  assert.equal(clientStatus.fieldEvidenceIntakeQuality.available, true);
  assert.equal(clientStatus.fieldEvidenceIntakeQuality.summary.evidenceProgress, "0/40");
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
  assert.equal(clientStatus.productionEnvFixChecklist.summary.itemCount, json.productionEnvFixChecklist.summary.itemCount);
  assert.equal(clientStatus.productionEnvFixChecklist.items.length, json.productionEnvFixChecklist.summary.itemCount);
  assert.match(clientStatus.productionEnvFixChecklist.summary.configuredLabel, /^0\/\d+$/);
  assert.ok(clientStatus.productionEnvFixChecklist.items.some((item) => item.label === "附件对象存储环境变量"));
  assert.ok(clientStatus.productionEnvFixChecklist.items.some((item) => item.label === "PostgreSQL 恢复验证库环境变量"));
  assert.equal(clientStatus.productionEnvFillTemplate.available, true);
  assert.equal(clientStatus.productionEnvFillTemplate.summary.variableCount, json.productionEnvFillTemplate.summary.variableCount);
  assert.equal(clientStatus.productionEnvFillTemplate.previewLines.length, clientStatus.productionEnvFillTemplate.summary.lineCount);
  assert.ok(clientStatus.productionEnvFillTemplate.previewLines.some((line) => line.includes("ERP_V1_DATABASE_URL=<待填写>")));
  assert.ok(clientStatus.productionEnvFillTemplate.previewLines.some((line) => line.includes("统一 V1 持久化 profile")));
  assert.equal(clientStatus.productionEnvMinimumValuesFragmentTemplate.available, true);
  assert.equal(
    clientStatus.productionEnvMinimumValuesFragmentTemplate.summary.variableCount,
    json.productionEnvMinimumValuesFragmentTemplate.summary.variableCount,
  );
  assert.equal(clientStatus.productionEnvMinimumValuesFragmentTemplate.summary.targetLabel, `0/${expectedBlockingTargetCount}`);
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
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingLabel, `0/${expectedBlockingTargetCount}`);
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingMissingCount, expectedBlockingTargetCount);
  assert.equal(clientStatus.productionEnvValuesFragmentSourceStatus.summary.fullIntakeConfiguredLabel, `0/${expectedIntakeRowCount}`);
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
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.minimumBlockingLabel, `0/${expectedBlockingTargetCount}`);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.minimumBlockingMissingCount, expectedBlockingTargetCount);
  assert.equal(clientStatus.productionEnvValuesApplyGateStatus.summary.fullIntakeConfiguredLabel, `0/${expectedIntakeRowCount}`);
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
}
