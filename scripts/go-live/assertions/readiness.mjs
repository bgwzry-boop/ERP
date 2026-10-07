import assert from "node:assert/strict";

export const readinessAssertions = Object.freeze({
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
});
