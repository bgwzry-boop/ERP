import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createV1ReleaseCandidateRefreshPrecheckService } from "../server/services/v1ReleaseCandidateRefreshPrecheckService.mjs";

const checkedAt = "2026-07-13T21:00:00.000Z";
const operatorId = "U-MANAGER-TEST";
const request = { marker: "request" };
const sensitiveText = "postgres://owner:secret@db.internal/prod https://erp.internal/api /Users/private/manifest";

assert.throws(() => createV1ReleaseCandidateRefreshPrecheckService(), /readStatusArtifacts/);

const ready = createHarness();
const readyResult = await ready.service.precheck({ request, operatorId });
assert.equal(readyResult.httpStatus, 200);
assert.equal(readyResult.body.status, "ready_to_refresh");
assert.equal(readyResult.body.ready, true);
assert.equal(readyResult.body.summary.evidenceProgress, "34/34");
assert.equal(readyResult.body.summary.signoffProgress, "6/6");
assert.equal(readyResult.body.summary.releaseCandidateRefreshAllowed, true);
assert.equal(readyResult.body.summary.releaseCandidateRefreshed, false);
assert.equal(readyResult.body.blockers.length, 0);
assert.equal(readyResult.body.safeguards.nonMutating, true);
assert.deepEqual(ready.calls.productionGoLiveInput, { request, operatorId });

for (const scenario of [
  { options: { draftStatus: "missing" }, key: "field-evidence-draft-missing" },
  { options: { draftFresh: false }, key: "field-evidence-draft-stale" },
  { options: { draftSchemaValid: false }, key: "field-evidence-draft-invalid" },
  { options: { draftReady: false, evidenceProgress: "20/34" }, key: "field-evidence-draft-blocked" },
  { options: { productionEnvReady: false }, key: "production-env-preflight-blocked" },
  { options: { productionGoLiveReady: false }, key: "production-go-live-combo-blocked" },
  { options: { signoffProgress: "5/6" }, key: "signoff-incomplete" },
  { options: { boundaryReady: false }, key: "v1-v2-boundary-pending" },
]) {
  const harness = createHarness(scenario.options);
  const result = await harness.service.precheck({ request, operatorId });
  assert.equal(result.body.ready, false, scenario.key);
  assert.equal(result.body.status, "blocked", scenario.key);
  assert.equal(result.body.blockers.some((item) => item.key === scenario.key), true, scenario.key);
  assert.equal(result.body.summary.releaseCandidateRefreshAllowed, false, scenario.key);
}

const sensitive = createHarness({
  draftFreshnessLabel: `草稿 ${sensitiveText}`,
  boundaryLabel: `边界 ${sensitiveText}`,
  productionGoLiveReady: false,
  productionGoLiveLabel: `组合 ${sensitiveText}`,
  productionGoLiveFirstBlockedStageLabel: `阶段 ${sensitiveText}`,
});
const sensitiveResult = await sensitive.service.precheck({ request, operatorId });
const sensitiveSerialized = JSON.stringify(sensitiveResult);
for (const fragment of ["postgres://", "erp.internal", "/Users/private", "owner:secret"]) {
  assert.equal(sensitiveSerialized.includes(fragment), false, `precheck response must redact ${fragment}`);
}

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const apiFunction = apiSource.match(
  /async function precheckSystemV1ReleaseCandidateRefresh\(\{ request, operatorId \}\) \{([\s\S]*?)\n\}/,
)?.[1];
assert.ok(apiFunction, "API refresh precheck composition function should exist");
assert.match(
  apiFunction,
  /return v1ReleaseCandidateRefreshPrecheckService\.precheck\(\{ request, operatorId \}\);/,
);
assert.doesNotMatch(
  apiFunction,
  /readV1GoLiveStatusArtifacts|buildV1FieldEvidenceDraftFreshness|sanitizeV1ProductionEnvGate|blockers|process\.env/,
);
for (const oldHelper of [
  "buildV1ReleaseCandidateRefreshDraftValidation",
  "buildV1ReleaseCandidateRefreshPrecheckBlockers",
  "buildV1ReleaseCandidateRefreshPrecheckBlocker",
  "buildV1ReleaseCandidateRefreshPrecheckSafeguards",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`function ${oldHelper}\\(`));
}

console.log(
  "V1 release-candidate refresh precheck service checks passed: draft, freshness, evidence, env, production combo, signoff, boundary, redaction, and thin API composition are covered.",
);

function createHarness({
  draftStatus = "available",
  draftFresh = true,
  draftFreshnessLabel = draftFresh ? "当前版本" : "需重生成",
  draftReady = true,
  draftSchemaValid = true,
  evidenceProgress = "34/34",
  signoffProgress = "6/6",
  boundaryReady = true,
  boundaryLabel = boundaryReady ? "已确认" : "待确认",
  productionEnvReady = true,
  productionGoLiveReady = true,
  productionGoLiveLabel = productionGoLiveReady ? "组合通过" : "组合阻塞",
  productionGoLiveFirstBlockedStageLabel = productionGoLiveReady ? "" : "环境审计",
} = {}) {
  const calls = { productionGoLiveInput: null };
  const artifacts = {
    completionSnapshot: { value: {} },
    goLiveSuite: { value: {} },
    releaseCandidate: { value: {} },
    fieldEvidenceItemsCsv: { value: "csv" },
    fieldEvidenceSignoffBoundaryCsv: { value: "signoff" },
    fieldEvidenceDraftManifest: { status: draftStatus === "available" ? "loaded" : "missing", value: {} },
    fieldEvidenceIntakeRules: { status: "loaded", value: "rules" },
  };
  const service = createV1ReleaseCandidateRefreshPrecheckService({
    now: () => new Date(checkedAt),
    readStatusArtifacts: () => artifacts,
    async precheckProductionGoLive(input) {
      calls.productionGoLiveInput = input;
      return { httpStatus: 200, body: { ready: productionGoLiveReady } };
    },
    sanitizeProductionGoLiveGate() {
      return {
        status: productionGoLiveReady ? "ready" : "blocked",
        ready: productionGoLiveReady,
        summary: {
          label: productionGoLiveLabel,
          readinessLabel: productionGoLiveReady ? "5/5" : "1/5",
          blockingCount: productionGoLiveReady ? 0 : 4,
          blockerLabel: productionGoLiveReady ? "0 项" : "4 项",
          firstBlockedStageKey: productionGoLiveReady ? "" : "env-file-audit",
          firstBlockedStageLabel: productionGoLiveFirstBlockedStageLabel,
          sourceStatuses: [],
        },
      };
    },
    buildProductionEnvGate() {
      return {
        ready: productionEnvReady,
        summary: {
          readinessLabel: productionEnvReady ? "10/10" : "1/10",
          blockingCount: productionEnvReady ? 0 : 9,
          warningCount: 0,
        },
      };
    },
    buildDraftFreshness() {
      return {
        status: draftFresh ? "ready" : "stale",
        label: draftFreshnessLabel,
        ready: draftFresh,
      };
    },
    buildFieldEvidenceQuality() {
      return {
        summary: { evidenceProgress, signoffProgress, boundaryReady, boundaryLabel },
      };
    },
    normalizeDraftManifestStatus: () => draftStatus,
    buildDraftValidation() {
      return {
        status: draftReady ? "ready" : "blocked",
        ready: draftReady,
        schemaValid: draftSchemaValid,
        summary: { evidenceProgress, signoffProgress, evidenceGroupsReadyLabel: "6/6" },
        boundary: { ready: boundaryReady, label: boundaryLabel },
      };
    },
  });
  return { service, calls };
}
