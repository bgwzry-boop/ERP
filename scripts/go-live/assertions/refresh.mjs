import assert from "node:assert/strict";

export const refreshAssertions = Object.freeze({
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
