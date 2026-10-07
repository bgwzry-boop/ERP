import assert from "node:assert/strict";

export const productionEnvAssertions = Object.freeze({
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
});
