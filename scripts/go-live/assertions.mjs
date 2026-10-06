import assert from "node:assert/strict";

export function assertInitialGoLiveStatus(json) {
  assert.equal(json.version, "p0-v1-go-live-status-v1");
  assert.equal(json.scope, "v1_go_live_status");
  assert.equal(json.status, "blocked");
  assert.equal(json.ready, false);
  assert.equal(json.canDeclareV1Complete, false);
  assert.equal(json.summary.requirements, "85-90%");
  assert.equal(json.summary.p0Prototype, "97-98%");
  assert.equal(json.summary.v1Readiness, "80-83%");
  assert.match(json.summary.releaseGate, /0\/4/);
  assert.equal(json.summary.onsiteTaskCount, 59);
  assert.equal(json.summary.v2DifferenceCount, 17);
  assert.equal(json.d49Readiness.version, "p0-v1-d49-readiness-v4");
  assert.equal(json.d49Readiness.scope, "v1_d49_readiness");
  assert.equal(json.d49Readiness.status, "blocked");
  assert.equal(json.d49Readiness.ready, false);
  assert.equal(json.d49Readiness.summary.requiredRoleCount, 8);
  assert.equal(json.d49Readiness.summary.blocksRegardlessOfDemoMode, true);
  assert.equal(json.d49Readiness.employees.roles.length, 8);
  assert.equal(json.d49Readiness.employeeIntake.scope, "v1_d49_employee_intake_status");
  assert.equal(json.d49Readiness.employeeIntake.fresh, true);
  assert.equal(json.d49Readiness.employeeIntake.freshness.sourceMatched, true);
  assert.equal(json.d49Readiness.employeeIntake.summary.employeeRowCount, 19);
  assert.equal(json.d49Readiness.employeeIntake.summary.coverageLabel, "6/8");
  assert.equal(json.d49Readiness.employeeIntake.summary.payrollAttendanceCoverageLabel, "0/19");
  assert.equal(json.d49Readiness.employeeIntake.payrollAttendanceCoverage.available, true);
  assert.equal(json.d49Readiness.employeeIntake.payrollAttendanceCoverage.completeCount, 0);
  assert.equal(json.d49Readiness.employeeIntake.payrollAttendanceCoverage.employeeCount, 19);
  assert.equal(json.d49Readiness.employeeIntake.payrollAttendanceCoverage.ready, false);
  assert.equal(json.d49Readiness.employeeIntake.summary.missingEmployeeNumberCount, 19);
  assert.equal(json.d49Readiness.employeeIntake.safeguards.employeeNamesIncluded, false);
  assert.equal(json.d49Readiness.employeeIntake.safeguards.employeeNumbersIncluded, false);
  assert.equal(json.d49Readiness.employeeIntake.safeguards.workbookPathIncluded, false);
  assert.equal(json.d49Readiness.employeeIntake.safeguards.issueRowsIncluded, false);
  assert.equal(json.d49Readiness.employeeIntake.safeguards.rawIssuesIncluded, false);
  assert.equal(json.d49Readiness.employeeIntake.safeguards.workbookDigestIncluded, false);
  assert.equal("workbookDigest" in json.d49Readiness.employeeIntake, false);
  assert.equal(json.d49Readiness.safeguards.rawEmployeeIdentifiersIncluded, false);
  assert.equal(json.d49Readiness.safeguards.employeeIntakeNamesIncluded, false);
  assert.equal(json.d49Readiness.safeguards.employeeIntakeNumbersIncluded, false);
  assert.equal(json.d49Readiness.safeguards.employeeIntakeWorkbookPathIncluded, false);
  assert.equal(json.d49Readiness.safeguards.employeeIntakeIssueRowsIncluded, false);
  assert.equal(json.d49Readiness.safeguards.loginNamesIncluded, false);
  assert.equal(json.d49Readiness.safeguards.passwordDataIncluded, false);
  assert.equal(json.d49Readiness.safeguards.envFilePathIncluded, false);
  assert.equal(json.d49Readiness.safeguards.envValuesIncluded, false);
  assert.equal(json.d49Readiness.safeguards.connectionStringIncluded, false);
  assert.doesNotMatch(
    JSON.stringify(json.d49Readiness),
    /\/Users\/|postgres(?:ql)?:\/\/|https?:\/\/[^\s\"]+|"loginName"\s*:|"passwordHash"\s*:/i,
  );
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
  assert.equal(json.ownerDecisionBrief.completion.onsiteTaskCount, 59);
  assert.match(json.ownerDecisionBrief.completion.fieldEvidence, /证据 0\/40，签字 0\/6/);
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
  assert.equal(json.completionAudit.summary.onsiteTaskCount, 59);
  assert.equal(json.completionAudit.summary.v2DifferenceCount, 17);
  assert.equal(json.completionAudit.criteria.length, 7);
  assert.ok(json.completionAudit.criteria.some((item) => item.key === "release_candidate" && item.evidenceLabel === "0/4 发布门禁通过"));
  assert.ok(json.completionAudit.criteria.some((item) => item.key === "field_evidence" && item.evidenceLabel === "0/40"));
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
  assert.equal(fieldEvidenceCriterion?.proofGapTotalCount, 7);
  assert.equal(fieldEvidenceCriterion?.proofGapShownCount, 4);
  assert.equal(fieldEvidenceCriterion?.proofGapCountLabel, "4/7");
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
  assert.equal(json.productionEnvGate.summary.totalCount, json.productionEnvGate.checks.length);
  assert.ok(json.productionEnvGate.summary.blockingCount >= 6);
  assert.equal(json.productionEnvGate.summary.warningCount, 2);
  assert.equal(json.productionEnvGate.summary.auditStatus, "passed");
  assert.equal(json.productionEnvGate.summary.auditLabel, "已通过");
  assert.equal(json.productionEnvGate.audit.included, true);
  assert.equal(json.productionEnvGate.audit.envFileCount, 1);
  assert.match(json.productionEnvGate.audit.summary.label, /1 个 env 文件安全审计通过/);
  assert.ok(json.productionEnvGate.checks.length >= 10);
  assert.ok(
    json.productionEnvGate.checks.some((item) =>
      item.key === "attendance-payroll-integration-env" &&
      item.status === "pending" &&
      item.blocking === false &&
      item.severity === "warning"
    ),
  );
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
  const intakeSummary = json.productionEnvIntakeVerification.summary;
  const expectedIntakeRowCount = intakeSummary.intakeRowCount;
  const expectedBlockingTargetCount = intakeSummary.minimumBlockingTargetCount;
  const expectedWarningTargetCount = intakeSummary.minimumWarningTargetCount;
  assert.ok(expectedIntakeRowCount >= 20);
  assert.equal(json.productionEnvIntakeVerification.summary.configuredRowCount, 0);
  assert.equal(json.productionEnvIntakeVerification.summary.missingRowCount, expectedIntakeRowCount);
  assert.equal(json.productionEnvIntakeVerification.summary.configuredLabel, `0/${expectedIntakeRowCount}`);
  assert.equal(json.productionEnvIntakeVerification.summary.fullIntakeConfiguredLabel, `0/${expectedIntakeRowCount}`);
  assert.equal(json.productionEnvIntakeVerification.summary.minimumBlockingLabel, `0/${expectedBlockingTargetCount}`);
  assert.ok(expectedBlockingTargetCount >= 10);
  assert.equal(json.productionEnvIntakeVerification.summary.minimumBlockingMissingCount, expectedBlockingTargetCount);
  assert.equal(
    json.productionEnvIntakeVerification.summary.minimumBlockingVariableRowCount +
      json.productionEnvIntakeVerification.summary.minimumBlockingAlternativeGroupCount,
    expectedBlockingTargetCount,
  );
  assert.equal(json.productionEnvIntakeVerification.summary.minimumBlockingAlternativeGroupCount, 4);
  assert.equal(json.productionEnvIntakeVerification.summary.minimumWarningLabel, `0/${expectedWarningTargetCount}`);
  assert.ok(expectedWarningTargetCount >= 5);
  assert.equal(
    json.productionEnvIntakeVerification.summary.minimumWarningVariableRowCount +
      json.productionEnvIntakeVerification.summary.minimumWarningAlternativeGroupCount,
    expectedWarningTargetCount,
  );
  assert.equal(json.productionEnvIntakeVerification.summary.minimumWarningAlternativeGroupCount, 0);
  assert.equal(json.productionEnvIntakeVerification.summary.blockingCount, expectedBlockingTargetCount);
  assert.equal(json.productionEnvIntakeVerification.summary.warningCount, expectedWarningTargetCount);
  assert.equal(json.productionEnvIntakeVerification.summary.alternativeGroupCount, 4);
  assert.equal(json.productionEnvIntakeVerification.summary.alternativeGroupBlockingCount, 4);
  assert.equal(json.productionEnvIntakeVerification.summary.auditReady, true);
  assert.equal(json.productionEnvIntakeVerification.summary.intakeCsvReady, true);
  assert.equal(json.productionEnvIntakeVerification.summary.minimumBlockingItemCount, expectedBlockingTargetCount);
  assert.equal(json.productionEnvIntakeVerification.minimumBlockingItems.length, expectedBlockingTargetCount);
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
  assert.equal(json.todoLoadPrecheck.available, true);
  assert.equal(json.todoLoadPrecheck.status, "ready");
  assert.equal(json.todoLoadPrecheck.ready, true);
  assert.equal(json.todoLoadPrecheck.summary.successLabel, "100/100");
  assert.equal(json.todoLoadPrecheck.summary.latencyMs.p95, 240);
  assert.equal(json.todoLoadPrecheck.summary.throughputPerSecond, 125);
  assert.equal(json.todoLoadPrecheck.freshness.fresh, true);
  assert.equal(json.todoLoadPrecheck.target.ready, true);
  assert.equal(json.todoLoadPrecheck.authentication.ready, true);
  assert.equal(json.todoLoadPrecheck.safeguards.ready, true);
  assert.equal(json.todoLoadPrecheck.safeguards.responsePayloadStored, false);
  assert.equal(json.todoLoadPrecheck.safeguards.todoIdentityStored, false);
  assert.equal(json.todoLoadPrecheck.safeguards.apiAddressExposed, false);
  assert.equal(json.todoLoadPrecheck.safeguards.rawReportIncluded, false);
  assert.doesNotMatch(JSON.stringify(json.todoLoadPrecheck), /SECRET-TODO|erp\.internal|https?:\/\//i);
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
  assert.equal(json.productionFirstStageExecution.intakeCoverage.fullIntakeConfiguredLabel, `0/${expectedIntakeRowCount}`);
  assert.equal(json.productionFirstStageExecution.intakeCoverage.minimumBlockingLabel, `0/${expectedBlockingTargetCount}`);
  assert.equal(json.productionFirstStageExecution.intakeCoverage.minimumBlockingMissingCount, expectedBlockingTargetCount);
  assert.equal(json.productionFirstStageExecution.intakeCoverage.minimumWarningLabel, `0/${expectedWarningTargetCount}`);
  assert.equal(json.productionFirstStageExecution.intakeCoverage.minimumWarningMissingCount, expectedWarningTargetCount);
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
      stage.evidence.blockingCount === expectedBlockingTargetCount &&
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
  assert.equal(json.unblockPlan.summary.taskCount, 59);
  assert.ok(json.unblockPlan.phases.some((phase) => phase.key === "production_environment"));
  assert.ok(
    json.unblockPlan.phases.some((phase) =>
      phase.firstTasks.some((task) => task.title === "附件对象存储环境变量"),
    ),
  );
  assert.ok(json.unblockPlan.roleBuckets.some((bucket) => bucket.role === "技术/管理" && bucket.taskCount === 41));
  assert.equal(json.roleTaskBoard.status, "blocked");
  assert.equal(json.roleTaskBoard.ready, false);
  assert.equal(json.roleTaskBoard.available, true);
  assert.equal(json.roleTaskBoard.summary.taskCount, 59);
  assert.equal(json.roleTaskBoard.summary.releaseTaskCount, 12);
  assert.equal(json.roleTaskBoard.summary.evidenceTaskCount, 40);
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
      category.count === 40 &&
      category.firstTasks.length > 0 &&
      category.nextAction.includes("真实 PostgreSQL")
    ),
  );
  assert.equal(json.roleTaskBoard.roles.length, 6);
  assert.ok(
    json.roleTaskBoard.roles.some((role) =>
      role.role === "技术/管理" &&
      role.taskCount === 41 &&
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
      role.taskCount === 18 &&
      role.tasks.length === 5 &&
      role.tasks.every((task) => task.title && task.action)
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
  assert.equal(json.fieldEvidenceProgress.summary.evidenceGroupsTotal, 7);
  assert.equal(json.fieldEvidenceProgress.summary.evidenceGroupsReady, 0);
  assert.equal(json.fieldEvidenceProgress.summary.requiredEvidenceItemsTotal, 40);
  assert.equal(json.fieldEvidenceProgress.summary.requiredEvidenceItemsCompleted, 0);
  assert.equal(json.fieldEvidenceProgress.summary.requiredSignoffsTotal, 6);
  assert.equal(json.fieldEvidenceProgress.summary.requiredSignoffsCompleted, 0);
  assert.equal(json.fieldEvidenceProgress.summary.missingEvidenceItemCount, 40);
  assert.equal(json.fieldEvidenceProgress.summary.missingEvidenceItemsShown, 40);
  assert.equal(json.fieldEvidenceProgress.summary.groupSummaryCount, 7);
  assert.equal(json.fieldEvidenceProgress.summary.signoffBoundaryActionCount, 7);
  assert.equal(json.fieldEvidenceProgress.summary.signoffBoundaryActionsShown, 7);
  assert.equal(json.fieldEvidenceProgress.summary.boundaryStatus, "pending");
  assert.ok(json.fieldEvidenceProgress.summary.blockingCount >= 41);
  assert.equal(json.fieldEvidenceProgress.groups.length, 7);
  assert.equal(json.fieldEvidenceProgress.groupSummaries.length, 7);
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
  assert.equal(json.fieldEvidenceProgress.missingItems.length, 40);
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
  assert.equal(json.fieldEvidenceProgress.boundary.v1ItemCount, 3);
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
  assert.equal(json.fieldEvidenceIntakeGuidance.summary.evidenceRows, 40);
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
  assert.ok(json.fieldEvidenceIntakeGuidance.blockedReason.includes("现场证据 0/40"));
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
  assert.equal(json.fieldEvidenceIntakeQuality.summary.evidenceProgress, "0/40");
  assert.equal(json.fieldEvidenceIntakeQuality.summary.signoffProgress, "0/6");
  assert.equal(json.fieldEvidenceIntakeQuality.summary.missingEvidenceRows, 40);
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
  assert.ok(json.fieldEvidenceIntakeQuality.checks.some((item) => item.key === "evidence-completion" && item.detail.includes("0/40")));
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
  assert.ok(json.productionEnvFixChecklist.summary.itemCount >= 10);
  assert.equal(json.productionEnvFixChecklist.items.length, json.productionEnvFixChecklist.summary.itemCount);
  assert.ok(json.productionEnvFixChecklist.summary.blockingCount >= 6);
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
  assert.ok(json.productionEnvFillTemplate.summary.variableCount >= 20);
  assert.equal(json.productionEnvFillTemplate.previewLines.length, json.productionEnvFillTemplate.summary.lineCount);
  assert.ok(json.productionEnvFillTemplate.summary.placeholderCount >= 23);
  assert.ok(json.productionEnvFillTemplate.previewLines.includes("# ERP_V1_DATABASE_URL=<待填写>"));
  assert.ok(json.productionEnvFillTemplate.previewLines.includes("# ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL=<待填写>"));
  assert.ok(json.productionEnvFillTemplate.previewLines.includes("# ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=<待填写>"));
  assert.ok(json.productionEnvFillTemplate.previewLines.includes("# ERP_SYSTEM_PRINTER_COMMAND=<待填写>"));
  assert.ok(json.productionEnvFillTemplate.previewLines.includes("# BLOCKING | 技术/管理 | 统一 V1 持久化 profile"));
  assert.ok(json.productionEnvFillTemplate.previewLines.includes("# BLOCKING | 技术/办公室 | V1 readiness 验收账号环境变量"));
  assert.equal(json.productionEnvFillTemplate.safeguards.realEnvValuesIncluded, false);
  assert.equal(json.productionEnvFillTemplate.safeguards.secretValuesIncluded, false);
  assert.equal(json.productionEnvFillTemplate.safeguards.artifactPathExposed, false);
  assert.equal(json.productionEnvMinimumValuesFragmentTemplate.status, "available");
  assert.equal(json.productionEnvMinimumValuesFragmentTemplate.ready, false);
  assert.ok(json.productionEnvMinimumValuesFragmentTemplate.summary.variableCount >= 10);
  assert.equal(
    json.productionEnvMinimumValuesFragmentTemplate.summary.targetLabel,
    `0/${expectedBlockingTargetCount}`,
  );
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
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingLabel, `0/${expectedBlockingTargetCount}`);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingTargetCount, expectedBlockingTargetCount);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingSatisfiedCount, 0);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingMissingCount, expectedBlockingTargetCount);
  assert.equal(
    json.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingVariableRowCount +
      json.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingAlternativeGroupCount,
    expectedBlockingTargetCount,
  );
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumBlockingAlternativeGroupCount, 4);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumWarningLabel, `0/${expectedWarningTargetCount}`);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.minimumWarningMissingCount, expectedWarningTargetCount);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.summary.fullIntakeConfiguredLabel, `0/${expectedIntakeRowCount}`);
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
  assert.equal(json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.minimumBlockingLabel, `0/${expectedBlockingTargetCount}`);
  assert.equal(json.productionEnvValuesFragmentSourceStatus.serverConfigGuidance.minimumBlockingMissingCount, expectedBlockingTargetCount);
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
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumBlockingLabel, `0/${expectedBlockingTargetCount}`);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumBlockingTargetCount, expectedBlockingTargetCount);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumBlockingSatisfiedCount, 0);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumBlockingMissingCount, expectedBlockingTargetCount);
  assert.equal(
    json.productionEnvValuesApplyGateStatus.summary.minimumBlockingVariableRowCount +
      json.productionEnvValuesApplyGateStatus.summary.minimumBlockingAlternativeGroupCount,
    expectedBlockingTargetCount,
  );
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumBlockingAlternativeGroupCount, 4);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumWarningLabel, `0/${expectedWarningTargetCount}`);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.minimumWarningMissingCount, expectedWarningTargetCount);
  assert.equal(json.productionEnvValuesApplyGateStatus.summary.fullIntakeConfiguredLabel, `0/${expectedIntakeRowCount}`);
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
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.minimumBlockingLabel, `0/${expectedBlockingTargetCount}`);
  assert.equal(json.productionEnvValuesApplyGateStatus.serverConfigGuidance.minimumBlockingMissingCount, expectedBlockingTargetCount);
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
  return {
    expectedIntakeRowCount,
    expectedBlockingTargetCount,
    expectedWarningTargetCount,
    initialDraftManifestAvailable,
    initialDraftFreshnessReady,
    initialDraftFreshnessLabel,
  };
}

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

export const goLiveAssertions = Object.freeze({
  assertUnsafeValuesStatus({ unsafeValuesStatusJson }) {
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
  },
  assertUnsafeValuesDryRun({ unsafeValuesDryRunJson }) {
  assert.equal(unsafeValuesDryRunJson.status, "audit_blocked");
    assert.equal(unsafeValuesDryRunJson.ready, false);
    assert.equal(unsafeValuesDryRunJson.summary.valuesFileAuditStatus, "blocked");
    assert.equal(unsafeValuesDryRunJson.summary.valuesFileAuditReady, false);
    assert.ok(unsafeValuesDryRunJson.summary.valuesFileAuditBlockingCount > 0);
    assert.equal(unsafeValuesDryRunJson.summary.valuesFileAuditPathExposed, false);
    assert.equal(unsafeValuesDryRunJson.summary.valuesFileAuditValuesIncluded, false);
    assert.equal(unsafeValuesDryRunJson.safeguards.valuesFileAuditPathExposed, false);
    assert.equal(unsafeValuesDryRunJson.safeguards.valuesFileAuditValuesIncluded, false);
  },
  assertUnsafeValuesDryRunSerialized({ unsafeValuesDryRunSerialized, unsafeValuesFile }) {
  assert.ok(!unsafeValuesDryRunSerialized.includes(unsafeValuesFile));
    assert.ok(!unsafeValuesDryRunSerialized.includes("/Users/should-not-be-read"));
    assert.ok(!unsafeValuesDryRunSerialized.includes("fake-secret-should-not-leak"));
  },
  assertGoLive({ json }) {
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
  },
  assertSerialized({ serialized }) {
  assert.doesNotMatch(serialized, /\.erp-local-storage/);
    assert.doesNotMatch(serialized, /\/Users\/|\/private\//);
    assert.doesNotMatch(serialized, /"evidenceRef"|evidenceRef|onsiteEvidenceRef|signer \/ signedAt/);
    assert.doesNotMatch(serialized, /onsiteSigner|onsiteSignedAt|onsiteConfirmedBy|onsiteConfirmedAt|onsiteNotes/);
    assert.doesNotMatch(serialized, /"outputFile"/);
    assert.doesNotMatch(serialized, /groups\//);
    assert.doesNotMatch(serialized, /SUPER_SECRET|SECRET_VALUE|pass@prod-db/i);
    assert.doesNotMatch(serialized, /REPLACE_WITH_/);
  },
  assertDraft({ draftJson }) {
  assert.equal(draftJson.version, "p0-v1-field-evidence-intake-draft-v1");
    assert.equal(draftJson.scope, "v1_field_evidence_intake_draft_manifest");
    assert.equal(draftJson.status, "blocked_draft_written");
    assert.equal(draftJson.ready, false);
    assert.equal(draftJson.summary.appliedRowCount, 0);
    assert.equal(draftJson.summary.invalidRowCount, 0);
    assert.equal(draftJson.summary.evidenceProgress, "0/40");
    assert.equal(draftJson.summary.signoffProgress, "0/6");
    assert.equal(draftJson.summary.draftManifestStatus, "available");
    assert.equal(draftJson.summary.inputSnapshot.schema, "erp-v1-field-evidence-intake-snapshot-v1");
    assert.equal(draftJson.summary.inputSnapshot.evidenceCsvIncluded, true);
    assert.equal(draftJson.summary.inputSnapshot.evidenceRowCount, 40);
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
  },
  assertSerializedDraft({ serializedDraft }) {
  assert.doesNotMatch(serializedDraft, /\.erp-local-storage|filled-manifest|\/Users\/|\/private\//);
    assert.doesNotMatch(serializedDraft, /onsiteEvidenceRef|onsiteSigner|onsiteConfirmedBy|evidenceRef/);
    assert.doesNotMatch(serializedDraft, /SUPER_SECRET|SECRET_VALUE|pass@prod-db/i);
  },
  assertClientDraft({ clientDraftResult }) {
  assert.equal(clientDraftResult.source, "api");
    assert.equal(clientDraftResult.blocked, false);
    assert.equal(clientDraftResult.draftResult.statusLabel, "草稿已生成");
    assert.equal(clientDraftResult.draftResult.summary.evidenceProgress, "0/40");
    assert.equal(clientDraftResult.draftResult.summary.signoffProgress, "0/6");
    assert.equal(clientDraftResult.draftResult.summary.draftManifestLabel, "已生成");
    assert.equal(clientDraftResult.draftResult.summary.inputSnapshot.evidenceRowCount, 40);
    assert.equal(clientDraftResult.draftResult.summary.inputSnapshot.signoffBoundaryRowCount, 7);
    assert.equal(clientDraftResult.draftResult.output.draftWritten, true);
    assert.equal(clientDraftResult.draftResult.output.releaseCandidateRefreshed, false);
  },
  assertValidation({ validationJson }) {
  assert.equal(validationJson.version, "p0-v1-field-evidence-draft-validation-v1");
    assert.equal(validationJson.scope, "v1_field_evidence_draft_manifest_validation");
    assert.equal(validationJson.status, "blocked");
    assert.equal(validationJson.ready, false);
    assert.equal(validationJson.schemaValid, true);
    assert.equal(validationJson.summary.evidenceProgress, "0/40");
    assert.equal(validationJson.summary.signoffProgress, "0/6");
    assert.equal(validationJson.summary.evidenceGroupsReadyLabel, "0/7");
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
  },
  assertSerializedValidation({ serializedValidation }) {
  assert.doesNotMatch(serializedValidation, /\.erp-local-storage|filled-manifest|\/Users\/|\/private\//);
    assert.doesNotMatch(serializedValidation, /onsiteEvidenceRef|onsiteSigner|onsiteConfirmedBy|evidenceRef/);
    assert.doesNotMatch(serializedValidation, /SUPER_SECRET|SECRET_VALUE|pass@prod-db/i);
  },
  assertClientValidation({ clientValidationResult }) {
  assert.equal(clientValidationResult.source, "api");
    assert.equal(clientValidationResult.blocked, false);
    assert.equal(clientValidationResult.validationResult.statusLabel, "校验未通过");
    assert.equal(clientValidationResult.validationResult.summary.evidenceProgress, "0/40");
    assert.equal(clientValidationResult.validationResult.summary.signoffProgress, "0/6");
    assert.equal(clientValidationResult.validationResult.summary.evidenceGroupsReadyLabel, "0/7");
    assert.equal(clientValidationResult.validationResult.summary.draftManifestLabel, "已生成");
    assert.equal(clientValidationResult.validationResult.summary.draftFreshnessLabel, "已匹配");
    assert.equal(clientValidationResult.validationResult.summary.releaseCandidateRefreshed, false);
    assert.ok(clientValidationResult.validationResult.blockers.length > 0);
  },
  assertClientProductionEnvPrecheck({ clientProductionEnvPrecheckResult }) {
  assert.equal(clientProductionEnvPrecheckResult.source, "api");
    assert.equal(clientProductionEnvPrecheckResult.blocked, false);
    assert.equal(clientProductionEnvPrecheckResult.precheckResult.statusLabel, "仍未通过");
    assert.equal(clientProductionEnvPrecheckResult.precheckResult.summary.readinessLabel, "2/12");
    assert.equal(clientProductionEnvPrecheckResult.precheckResult.summary.currentRuntime, true);
    assert.equal(clientProductionEnvPrecheckResult.precheckResult.summary.envFilePathAccepted, false);
    assert.equal(clientProductionEnvPrecheckResult.precheckResult.summary.releaseCandidateRefreshed, false);
    assert.equal(clientProductionEnvPrecheckResult.precheckResult.blockingChecks.length, 8);
  },
  assertProductionEnvSetup({ productionEnvSetupJson }) {
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
  },
  assertClientProductionEnvSetup({ clientProductionEnvSetupResult }) {
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
  },
  assertProductionEnvIntakePrecheck({ productionEnvIntakePrecheckJson }) {
  assert.equal(productionEnvIntakePrecheckJson.version, "p0-v1-production-env-intake-live-precheck-v1");
    assert.equal(productionEnvIntakePrecheckJson.scope, "v1_production_env_intake_live_precheck");
    assert.equal(productionEnvIntakePrecheckJson.status, "blocked");
    assert.equal(productionEnvIntakePrecheckJson.ready, false);
  },
  assertProductionEnvIntakePrecheck2({ liveIntakeRowCount, productionEnvIntakePrecheckJson, liveBlockingTargetCount, liveWarningTargetCount }) {
  assert.ok(liveIntakeRowCount >= 20);
    assert.equal(productionEnvIntakePrecheckJson.summary.configuredLabel, `0/${liveIntakeRowCount}`);
    assert.equal(productionEnvIntakePrecheckJson.summary.fullIntakeConfiguredLabel, `0/${liveIntakeRowCount}`);
    assert.equal(productionEnvIntakePrecheckJson.summary.minimumBlockingLabel, `0/${liveBlockingTargetCount}`);
    assert.equal(productionEnvIntakePrecheckJson.summary.minimumWarningLabel, `0/${liveWarningTargetCount}`);
    assert.equal(productionEnvIntakePrecheckJson.summary.blockingCount, liveBlockingTargetCount);
    assert.equal(productionEnvIntakePrecheckJson.summary.warningCount, liveWarningTargetCount);
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
    assert.equal(
      productionEnvIntakePrecheckJson.verification.summary.minimumBlockingLabel,
      `0/${liveBlockingTargetCount}`,
    );
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
  },
  assertClientProductionEnvIntakePrecheck({ clientProductionEnvIntakePrecheckResult, liveIntakeRowCount, liveBlockingTargetCount }) {
  assert.equal(clientProductionEnvIntakePrecheckResult.source, "api");
    assert.equal(clientProductionEnvIntakePrecheckResult.blocked, true);
    assert.equal(clientProductionEnvIntakePrecheckResult.precheckResult.statusLabel, "仍未通过");
    assert.equal(
      clientProductionEnvIntakePrecheckResult.precheckResult.summary.configuredLabel,
      `0/${liveIntakeRowCount}`,
    );
    assert.equal(
      clientProductionEnvIntakePrecheckResult.precheckResult.summary.minimumBlockingLabel,
      `0/${liveBlockingTargetCount}`,
    );
    assert.equal(clientProductionEnvIntakePrecheckResult.precheckResult.summary.requestBodyIgnored, true);
    assert.equal(clientProductionEnvIntakePrecheckResult.precheckResult.summary.envFilePathAccepted, false);
    assert.equal(clientProductionEnvIntakePrecheckResult.precheckResult.summary.productionEnvFileMutated, false);
    assert.equal(clientProductionEnvIntakePrecheckResult.precheckResult.serverConfigGuidance.acceptsFrontendPath, false);
    assert.equal(clientProductionEnvIntakePrecheckResult.precheckResult.safeguards.envFilePathExposed, false);
  },
  assertProductionEnvFileAuditPrecheck({ productionEnvFileAuditPrecheckJson }) {
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
  },
  assertClientProductionEnvFileAuditPrecheck({ clientProductionEnvFileAuditPrecheckResult }) {
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
  },
  assertProductionEnvFilePreviewPrecheck({ productionEnvFilePreviewPrecheckJson }) {
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
  },
  assertClientProductionEnvFilePreviewPrecheck({ clientProductionEnvFilePreviewPrecheckResult }) {
  assert.equal(clientProductionEnvFilePreviewPrecheckResult.source, "api");
    assert.equal(clientProductionEnvFilePreviewPrecheckResult.blocked, false);
    assert.equal(clientProductionEnvFilePreviewPrecheckResult.precheckResult.statusLabel, "未配置");
    assert.equal(clientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.envFilePathConfigured, false);
    assert.equal(clientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.appliedInMemory, false);
    assert.equal(clientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.processEnvMutated, false);
    assert.equal(clientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.currentStage, "server_env_file_path");
    assert.equal(clientProductionEnvFilePreviewPrecheckResult.precheckResult.stageDiagnosis.stageStatus, "not_configured");
    assert.equal(clientProductionEnvFilePreviewPrecheckResult.precheckResult.stageDiagnosis.selectedSourceKind, "none");
  },
  assertProductionGoLivePrecheck({ productionGoLivePrecheckJson }) {
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
  },
  assertClientProductionGoLivePrecheck({ clientProductionGoLivePrecheckResult }) {
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
  },
  assertProductionPersistenceEvidence({ productionPersistenceEvidenceJson }) {
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
  },
  assertClientProductionPersistenceEvidence({ clientProductionPersistenceEvidenceResult }) {
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
  },
  assertProductionFirstStageExecution({ productionFirstStageExecutionJson, liveIntakeRowCount, liveBlockingTargetCount }) {
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
    assert.equal(
      productionFirstStageExecutionJson.firstStageExecution.intakeCoverage.fullIntakeConfiguredLabel,
      `0/${liveIntakeRowCount}`,
    );
    assert.equal(
      productionFirstStageExecutionJson.firstStageExecution.intakeCoverage.minimumBlockingLabel,
      `0/${liveBlockingTargetCount}`,
    );
    assert.equal(
      productionFirstStageExecutionJson.firstStageExecution.intakeCoverage.minimumBlockingMissingCount,
      liveBlockingTargetCount,
    );
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
  },
  assertClientProductionFirstStageExecution({ clientProductionFirstStageExecutionResult }) {
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
  },
  assertProductionFirstStageValuesDryRunPrecheck({ productionFirstStageValuesDryRunPrecheckJson }) {
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
  },
  assertClientProductionFirstStageValuesDryRunPrecheck({ clientProductionFirstStageValuesDryRunPrecheckResult }) {
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
  },
  assertProductionFirstStageValuesApplyDisabled({ productionFirstStageValuesApplyDisabledJson }) {
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
  },
  assertClientProductionFirstStageValuesApplyDisabled({ clientProductionFirstStageValuesApplyDisabledResult }) {
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
  },
  assertProductionFirstStageValuesApplyNotConfigured({ productionFirstStageValuesApplyNotConfiguredJson }) {
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
  },
  assertAuditBlockedProductionEnvFilePreviewPrecheck({ auditBlockedProductionEnvFilePreviewPrecheckJson }) {
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
  },
  assertEnvBlockedProductionEnvFilePreviewPrecheck({ envBlockedProductionEnvFilePreviewPrecheckJson }) {
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
  },
  assertEnvBlockedClientProductionEnvFilePreviewPrecheck({ envBlockedClientProductionEnvFilePreviewPrecheckResult }) {
  assert.equal(envBlockedClientProductionEnvFilePreviewPrecheckResult.source, "api");
    assert.equal(envBlockedClientProductionEnvFilePreviewPrecheckResult.blocked, false);
    assert.equal(envBlockedClientProductionEnvFilePreviewPrecheckResult.precheckResult.statusLabel, "仍未通过");
    assert.equal(envBlockedClientProductionEnvFilePreviewPrecheckResult.precheckResult.stageDiagnosis.stageStatus, "env_preflight_blocked");
    assert.equal(envBlockedClientProductionEnvFilePreviewPrecheckResult.precheckResult.stageDiagnosis.auditReady, true);
  },
  assertAuditOnlyProductionGoLivePrecheck({ auditOnlyProductionGoLivePrecheckJson }) {
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
  },
  assertConfiguredProductionEnvFileAuditPrecheck({ configuredProductionEnvFileAuditPrecheckJson }) {
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
  },
  assertConfiguredClientProductionEnvFileAuditPrecheck({ configuredClientProductionEnvFileAuditPrecheckResult }) {
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
  },
  assertConfiguredProductionEnvFilePreviewPrecheck({ configuredProductionEnvFilePreviewPrecheckJson }) {
  assert.equal(configuredProductionEnvFilePreviewPrecheckJson.version, "p0-v1-production-env-file-preview-live-precheck-v1");
    assert.equal(configuredProductionEnvFilePreviewPrecheckJson.scope, "v1_production_env_file_preview_live_precheck");
    assert.equal(configuredProductionEnvFilePreviewPrecheckJson.status, "ready");
    assert.equal(configuredProductionEnvFilePreviewPrecheckJson.ready, true);
    assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.readinessLabel, "11/12");
    assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.passedCount, 11);
    assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.totalCount, 12);
    assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.blockingCount, 0);
    assert.equal(configuredProductionEnvFilePreviewPrecheckJson.summary.warningCount, 1);
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
    assert.equal(configuredProductionEnvFilePreviewPrecheckJson.checks.length, 12);
    assert.deepEqual(configuredProductionEnvFilePreviewPrecheckJson.blockingChecks, []);
    assert.equal(configuredProductionEnvFilePreviewPrecheckJson.warningChecks.length, 1);
    assert.equal(configuredProductionEnvFilePreviewPrecheckJson.warningChecks[0].key, "attendance-payroll-integration-env");
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
  },
  assertSerializedConfiguredProductionEnvFilePreviewPrecheck({ serializedConfiguredProductionEnvFilePreviewPrecheck, escapeRegExp, officeDemoReadinessToken, driverDemoReadinessToken }) {
  assert.doesNotMatch(serializedConfiguredProductionEnvFilePreviewPrecheck, /\.erp-local-storage|secure-live\.env|\/Users\/|\/private\//);
    assert.doesNotMatch(serializedConfiguredProductionEnvFilePreviewPrecheck, /SUPER_SECRET|oss-live-secret|lp-live-secret|print-spool-live-secret|field-acceptance-live-secret/i);
    assert.doesNotMatch(serializedConfiguredProductionEnvFilePreviewPrecheck, new RegExp(escapeRegExp(officeDemoReadinessToken)));
    assert.doesNotMatch(serializedConfiguredProductionEnvFilePreviewPrecheck, new RegExp(escapeRegExp(driverDemoReadinessToken)));
  },
  assertConfiguredClientProductionEnvFilePreviewPrecheck({ configuredClientProductionEnvFilePreviewPrecheckResult }) {
  assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.source, "api");
    assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.blocked, false);
    assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.statusLabel, "已通过");
    assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.readinessLabel, "11/12");
    assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.envFilePathConfigured, true);
    assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.selectedSourceKind, "primary");
    assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.appliedInMemory, true);
    assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.processEnvMutated, false);
    assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.envPreflightReady, true);
    assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.summary.sourceStatuses.length, 3);
    assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.stageDiagnosis.stageStatus, "ready");
    assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.stageDiagnosis.fallbackSourceUsed, false);
    assert.equal(configuredClientProductionEnvFilePreviewPrecheckResult.precheckResult.stageDiagnosis.sourceStatuses.length, 3);
  },
  assertConfiguredProductionGoLivePrecheck({ configuredProductionGoLivePrecheckJson }) {
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
  },
  assertConfiguredClientProductionGoLivePrecheck({ configuredClientProductionGoLivePrecheckResult }) {
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
  },
  assertPersistencePrecheck({ persistencePrecheckJson, expectedPersistenceRepositoryCount }) {
  assert.equal(persistencePrecheckJson.version, "p0-v1-persistence-live-precheck-v1");
    assert.equal(persistencePrecheckJson.scope, "v1_persistence_live_precheck");
    assert.equal(persistencePrecheckJson.status, "blocked");
    assert.equal(persistencePrecheckJson.ready, false);
    assert.equal(persistencePrecheckJson.summary.readinessLabel, "2/8");
    assert.equal(persistencePrecheckJson.summary.passedCount, 2);
    assert.equal(persistencePrecheckJson.summary.totalCount, 8);
    assert.equal(persistencePrecheckJson.summary.blockingCount, 6);
    assert.equal(persistencePrecheckJson.summary.repositoryGroupCount, 5);
    assert.equal(persistencePrecheckJson.summary.repositoryCount, expectedPersistenceRepositoryCount);
    assert.equal(persistencePrecheckJson.summary.productionReadyRepositoryCount, 0);
    assert.equal(persistencePrecheckJson.summary.localRepositoryCount, expectedPersistenceRepositoryCount);
    assert.equal(
      persistencePrecheckJson.summary.localMemoryCount,
      persistencePrecheckJson.repositoryGroups.flatMap((group) => group.repositories).filter((item) => item.kind === "local_memory").length,
    );
    assert.equal(persistencePrecheckJson.summary.localJsonCount, 13);
    assert.equal(persistencePrecheckJson.summary.localFsCount, 2);
    assert.equal(persistencePrecheckJson.summary.currentRuntime, true);
    assert.equal(persistencePrecheckJson.summary.requestBodyIgnored, true);
    assert.equal(persistencePrecheckJson.summary.localPersistenceAcceptedForV1, false);
    assert.equal(persistencePrecheckJson.summary.releaseCandidateRefreshed, false);
    assert.equal(persistencePrecheckJson.summary.goLiveSuiteRefreshed, false);
    assert.equal(persistencePrecheckJson.criteria.length, 8);
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
  },
  assertClientPersistencePrecheck({ clientPersistencePrecheckResult, expectedPersistenceRepositoryCount }) {
  assert.equal(clientPersistencePrecheckResult.source, "api");
    assert.equal(clientPersistencePrecheckResult.blocked, false);
    assert.equal(clientPersistencePrecheckResult.precheckResult.statusLabel, "仍未通过");
    assert.equal(clientPersistencePrecheckResult.precheckResult.summary.readinessLabel, "2/8");
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
  },
  assertAttachmentRetentionPrecheck({ attachmentRetentionPrecheckJson }) {
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
  },
  assertSerializedAttachmentRetentionPrecheck({ serializedAttachmentRetentionPrecheck }) {
  assert.doesNotMatch(serializedAttachmentRetentionPrecheck, /\.erp-local-storage|\/Users\/|\/private\//);
    assert.doesNotMatch(serializedAttachmentRetentionPrecheck, /SUPER_SECRET_OBJECT|SECRET_ATTACHMENT_VALUE/);
    assert.doesNotMatch(
      serializedAttachmentRetentionPrecheck,
      /"diagnosticAttachmentId"\s*:|"diagnosticStorageKey"\s*:|"contentDigest"\s*:|"expectedDigest"\s*:|"readDigest"\s*:/,
    );
  },
  assertClientAttachmentRetentionPrecheck({ clientAttachmentRetentionPrecheckResult }) {
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
  },
  assertDriverReadinessPrecheck({ driverReadinessPrecheckJson }) {
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
  },
  assertSerializedDriverReadinessPrecheck({ serializedDriverReadinessPrecheck }) {
  assert.doesNotMatch(serializedDriverReadinessPrecheck, /\.erp-local-storage|\/Users\/|\/private\//);
    assert.doesNotMatch(serializedDriverReadinessPrecheck, /SECRET_NATIVE_PAYLOAD|SECRET_PACKAGE_SCAN_TEXT|SECRET_PHOTO|SECRET_GPS|SHOULD_BE_IGNORED/);
    assert.doesNotMatch(serializedDriverReadinessPrecheck, /"scannedText"\s*:|"photoDataUrl"\s*:|"rawNativePayload"\s*:|"gps"\s*:/);
  },
  assertClientDriverReadinessPrecheck({ clientDriverReadinessPrecheckResult }) {
  assert.equal(clientDriverReadinessPrecheckResult.source, "api");
    assert.equal(clientDriverReadinessPrecheckResult.blocked, false);
    assert.equal(clientDriverReadinessPrecheckResult.precheckResult.statusLabel, "仍未通过");
    assert.equal(clientDriverReadinessPrecheckResult.precheckResult.summary.readinessLabel, "1/6");
    assert.equal(clientDriverReadinessPrecheckResult.precheckResult.summary.deliveryTaskCount, 3);
    assert.equal(clientDriverReadinessPrecheckResult.precheckResult.summary.nativeSupportedLabel, "0/2");
    assert.equal(clientDriverReadinessPrecheckResult.precheckResult.summary.deliveryTaskStatusChanged, false);
    assert.equal(clientDriverReadinessPrecheckResult.precheckResult.blockingCriteria.length, 5);
    assert.equal(clientDriverReadinessPrecheckResult.precheckResult.safeguards.nativeBridgeInvoked, false);
  },
  assertRuntimeReadinessPrecheck({ runtimeReadinessPrecheckJson }) {
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
    assert.equal(runtimeReadinessPrecheckJson.safeguards.requestHostAccepted, false);
    assert.equal(runtimeReadinessPrecheckJson.safeguards.forwardedProtocolAccepted, false);
    assert.equal(runtimeReadinessPrecheckJson.safeguards.loopbackTargetOnly, true);
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
  },
  assertSerializedRuntimeReadinessPrecheck({ serializedRuntimeReadinessPrecheck }) {
  assert.doesNotMatch(serializedRuntimeReadinessPrecheck, /\.erp-local-storage|\/Users\/|\/private\//);
    assert.doesNotMatch(serializedRuntimeReadinessPrecheck, /SUPER_SECRET|SECRET_VALUE|pass@prod-db/i);
    assert.doesNotMatch(serializedRuntimeReadinessPrecheck, /127\.0\.0\.1:\d+\/api/);
  },
  assertClientRuntimeReadinessPrecheck({ clientRuntimeReadinessPrecheckResult }) {
  assert.equal(clientRuntimeReadinessPrecheckResult.source, "api");
    assert.equal(clientRuntimeReadinessPrecheckResult.blocked, false);
    assert.equal(clientRuntimeReadinessPrecheckResult.precheckResult.statusLabel, "仍未通过");
    assert.equal(clientRuntimeReadinessPrecheckResult.precheckResult.summary.readinessLabel, "5/11");
    assert.equal(clientRuntimeReadinessPrecheckResult.precheckResult.summary.currentRuntime, true);
    assert.equal(clientRuntimeReadinessPrecheckResult.precheckResult.summary.apiBaseUrlAccepted, false);
    assert.equal(clientRuntimeReadinessPrecheckResult.precheckResult.summary.releaseCandidateRefreshed, false);
    assert.equal(clientRuntimeReadinessPrecheckResult.precheckResult.blockingCriteria.length, 6);
  },
  assertV1V2BoundaryPrecheck({ v1V2BoundaryPrecheckJson }) {
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
  },
  assertSerializedV1V2BoundaryPrecheck({ serializedV1V2BoundaryPrecheck }) {
  assert.doesNotMatch(serializedV1V2BoundaryPrecheck, /\.erp-local-storage|\/Users\/|\/private\//);
    assert.doesNotMatch(serializedV1V2BoundaryPrecheck, /SHOULD_BE_IGNORED|SUPER_SECRET_BOUNDARY_TOKEN/);
    assert.doesNotMatch(serializedV1V2BoundaryPrecheck, /onsiteEvidenceRef|onsiteSigner|onsiteConfirmedBy|confirmedBy/);
  },
  assertClientV1V2BoundaryPrecheck({ clientV1V2BoundaryPrecheckResult }) {
  assert.equal(clientV1V2BoundaryPrecheckResult.source, "api");
    assert.equal(clientV1V2BoundaryPrecheckResult.blocked, false);
    assert.equal(clientV1V2BoundaryPrecheckResult.precheckResult.statusLabel, "待确认");
    assert.equal(clientV1V2BoundaryPrecheckResult.precheckResult.summary.boundaryLabel, "待确认");
    assert.equal(clientV1V2BoundaryPrecheckResult.precheckResult.summary.v1MustContinueLabel, "6 项");
    assert.equal(clientV1V2BoundaryPrecheckResult.precheckResult.summary.v2DifferenceLabel, "17 项");
    assert.equal(clientV1V2BoundaryPrecheckResult.precheckResult.summary.releaseCandidateRefreshed, false);
    assert.ok(clientV1V2BoundaryPrecheckResult.precheckResult.blockers.some((item) => item.key === "v1-must-continue-open"));
  },
  assertV1V2ScopeBriefRefresh({ v1V2ScopeBriefRefreshJson }) {
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
  },
  assertClientV1V2ScopeBriefRefresh({ clientV1V2ScopeBriefRefreshResult }) {
  assert.equal(clientV1V2ScopeBriefRefreshResult.source, "api");
    assert.equal(clientV1V2ScopeBriefRefreshResult.blocked, false);
    assert.equal(clientV1V2ScopeBriefRefreshResult.refreshResult.statusLabel, "已刷新仍阻塞");
    assert.equal(clientV1V2ScopeBriefRefreshResult.refreshResult.summary.scopeBriefRefreshed, true);
    assert.equal(clientV1V2ScopeBriefRefreshResult.refreshResult.summary.v1MustContinueLabel, "6 项");
    assert.equal(clientV1V2ScopeBriefRefreshResult.refreshResult.summary.v2DifferenceLabel, "17 项");
    assert.equal(clientV1V2ScopeBriefRefreshResult.refreshResult.summary.releaseCandidateRefreshed, false);
    assert.ok(clientV1V2ScopeBriefRefreshResult.refreshResult.v2Categories.includes("AI / OCR / 图片识别"));
  },
  assertRefreshPrecheck({ refreshPrecheckJson, json }) {
  assert.equal(refreshPrecheckJson.version, "p0-v1-release-candidate-refresh-precheck-v1");
    assert.equal(refreshPrecheckJson.scope, "v1_release_candidate_refresh_precheck");
    assert.equal(refreshPrecheckJson.status, "blocked");
    assert.equal(refreshPrecheckJson.ready, false);
    assert.equal(refreshPrecheckJson.summary.draftManifestStatus, "available");
    assert.equal(refreshPrecheckJson.summary.draftFreshnessStatus, "fresh");
    assert.equal(refreshPrecheckJson.summary.draftFreshnessLabel, "已匹配");
    assert.equal(refreshPrecheckJson.summary.draftFreshnessReady, true);
    assert.equal(refreshPrecheckJson.summary.draftValidationStatus, "blocked");
    assert.equal(refreshPrecheckJson.summary.evidenceProgress, "0/40");
    assert.equal(refreshPrecheckJson.summary.signoffProgress, "0/6");
    assert.equal(refreshPrecheckJson.summary.evidenceGroupsReadyLabel, "0/7");
    assert.equal(refreshPrecheckJson.summary.productionEnvPreflightLabel, `2/${json.productionEnvGate.summary.totalCount}`);
    assert.equal(
      refreshPrecheckJson.summary.productionEnvBlockingCount,
      json.productionEnvGate.summary.blockingCount,
    );
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
  },
  assertSerializedRefreshPrecheck({ serializedRefreshPrecheck }) {
  assert.doesNotMatch(serializedRefreshPrecheck, /\.erp-local-storage|filled-manifest|\/Users\/|\/private\//);
    assert.doesNotMatch(serializedRefreshPrecheck, /onsiteEvidenceRef|onsiteSigner|onsiteConfirmedBy|evidenceRef/);
    assert.doesNotMatch(serializedRefreshPrecheck, /SUPER_SECRET|SECRET_VALUE|pass@prod-db/i);
  },
  assertClientRefreshPrecheck({ clientRefreshPrecheckResult, json }) {
  assert.equal(clientRefreshPrecheckResult.source, "api");
    assert.equal(clientRefreshPrecheckResult.blocked, false);
    assert.equal(clientRefreshPrecheckResult.precheckResult.statusLabel, "暂不能刷新");
    assert.equal(clientRefreshPrecheckResult.precheckResult.summary.evidenceProgress, "0/40");
    assert.equal(clientRefreshPrecheckResult.precheckResult.summary.signoffProgress, "0/6");
    assert.equal(
      clientRefreshPrecheckResult.precheckResult.summary.productionEnvPreflightLabel,
      `2/${json.productionEnvGate.summary.totalCount}`,
    );
    assert.equal(clientRefreshPrecheckResult.precheckResult.summary.productionGoLiveReadinessLabel, "0/5");
    assert.equal(clientRefreshPrecheckResult.precheckResult.summary.productionGoLiveFirstBlockedStageKey, "production-env-file-audit");
    assert.equal(clientRefreshPrecheckResult.precheckResult.summary.productionGoLiveFirstBlockedStageLabel, "生产 env 文件安全审计");
    assert.equal(clientRefreshPrecheckResult.precheckResult.summary.productionGoLiveSourceStatuses.length, 3);
    assert.equal(clientRefreshPrecheckResult.precheckResult.summary.productionGoLiveReady, false);
    assert.equal(clientRefreshPrecheckResult.precheckResult.summary.draftFreshnessLabel, "已匹配");
    assert.equal(clientRefreshPrecheckResult.precheckResult.summary.releaseCandidateRefreshed, false);
    assert.ok(clientRefreshPrecheckResult.precheckResult.blockers.some((item) => item.key === "production-go-live-combo-blocked"));
  },
  assertRefreshCandidate({ refreshCandidateJson, json }) {
  assert.equal(refreshCandidateJson.version, "p0-v1-release-candidate-refresh-v1");
    assert.equal(refreshCandidateJson.scope, "v1_release_candidate_refresh");
    assert.equal(refreshCandidateJson.status, "blocked_by_precheck");
    assert.equal(refreshCandidateJson.ready, false);
    assert.equal(refreshCandidateJson.summary.releaseCandidateRefreshAllowed, false);
    assert.equal(refreshCandidateJson.summary.releaseCandidateRefreshed, false);
    assert.equal(refreshCandidateJson.summary.goLiveSuiteRefreshed, false);
    assert.equal(refreshCandidateJson.summary.evidenceProgress, "0/40");
    assert.equal(refreshCandidateJson.summary.signoffProgress, "0/6");
    assert.equal(refreshCandidateJson.summary.productionEnvPreflightLabel, `2/${json.productionEnvGate.summary.totalCount}`);
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
  },
  assertClientRefreshCandidate({ clientRefreshCandidateResult }) {
  assert.equal(clientRefreshCandidateResult.source, "api_error");
    assert.equal(clientRefreshCandidateResult.blocked, true);
    assert.equal(clientRefreshCandidateResult.refreshResult.statusLabel, "暂不能刷新");
    assert.equal(clientRefreshCandidateResult.refreshResult.summary.releaseCandidateRefreshed, false);
    assert.equal(clientRefreshCandidateResult.refreshResult.summary.goLiveSuiteRefreshed, false);
    assert.equal(clientRefreshCandidateResult.refreshResult.summary.productionGoLiveSourceStatuses.length, 3);
    assert.ok(clientRefreshCandidateResult.refreshResult.blockers.length >= 3);
  },
  assertRefreshed({ refreshedJson }) {
  assert.equal(refreshedJson.fieldEvidenceIntakeGuidance.summary.draftManifestStatus, "available");
    assert.equal(refreshedJson.fieldEvidenceIntakeGuidance.summary.draftFreshnessStatus, "fresh");
    assert.equal(refreshedJson.fieldEvidenceIntakeQuality.summary.draftManifestStatus, "available");
    assert.equal(refreshedJson.fieldEvidenceIntakeQuality.summary.draftFreshnessStatus, "fresh");
    assert.equal(refreshedJson.fieldEvidenceIntakeQuality.summary.blockingIssueCount, 3);
    assert.equal(refreshedJson.fieldEvidenceIntakeQuality.summary.canRefreshReleaseCandidate, false);
  },
});
