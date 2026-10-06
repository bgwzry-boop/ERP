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
