import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createV1GoLiveStatusResponseService } from "../server/services/v1GoLiveStatusResponseService.mjs";

const fixedNow = "2026-07-14T04:30:00.000Z";
const unsafeText = [
  "postgresql://erp:secret@db.internal:5432/erp",
  "Bearer top-secret-token",
  "ERP_AUTH_SECRET=top-secret-auth",
  "/Users/xu/private/release.json",
  ".erp-local-storage/private/release.json",
].join(" ");

assert.throws(() => createV1GoLiveStatusResponseService(), /readStatusArtifacts must be a function/);
assert.throws(
  () => createV1GoLiveStatusResponseService({
    readStatusArtifacts: () => ({}),
    buildProductionEnvValuesFragmentSourceStatus: () => ({}),
  }),
  /buildProductionEnvValuesApplyGateStatus must be a function/,
);

const artifacts = buildArtifacts();
const calls = {
  d49: [],
  fragmentSource: [],
  applyGate: [],
};
const workspace = { id: "workspace-test" };
const service = createV1GoLiveStatusResponseService({
  readStatusArtifacts: () => artifacts,
  buildD49Readiness: (input) => {
    calls.d49.push(input);
    return { status: "blocked", ready: false, summary: { formalEmployeeCount: 33 } };
  },
  buildProductionEnvValuesFragmentSourceStatus: (input) => {
    calls.fragmentSource.push(input);
    return { status: "disabled", ready: false, valuesIncluded: false };
  },
  buildProductionEnvValuesApplyGateStatus: (input) => {
    calls.applyGate.push(input);
    return { status: "disabled", ready: false, valuesIncluded: false };
  },
  now: () => new Date(fixedNow),
});

const response = service.build({ workspace, operatorId: "manager-001" });
assert.equal(response.version, "p0-v1-go-live-status-v1");
assert.equal(response.scope, "v1_go_live_status");
assert.equal(response.status, "blocked");
assert.equal(response.ready, false);
assert.equal(response.canDeclareV1Complete, false);
assert.equal(response.checkedAt, fixedNow);
assert.equal(response.operatorId, "manager-001");
assert.equal(response.d49Readiness.summary.formalEmployeeCount, 33);
assert.deepEqual(response.missingArtifacts, ["ownerDecisionBrief"]);
assert.equal(response.safeguards.nonMutating, true);
assert.equal(response.safeguards.rawSecretsIncluded, false);
assert.equal(response.safeguards.productionEnvValuesIncluded, false);
assert.equal(response.productionEnvValuesFragmentSourceStatus.status, "disabled");
assert.equal(response.productionEnvValuesApplyGateStatus.status, "disabled");
assert.deepEqual(calls.d49, [{ workspace, operatorId: "manager-001" }]);
assert.equal(calls.fragmentSource.length, 1);
assert.equal(calls.applyGate.length, 1);
assert.equal(
  calls.fragmentSource[0].productionEnvIntakeVerification,
  response.productionEnvIntakeVerification,
);
assert.equal(
  calls.applyGate[0].productionFirstStageExecution,
  response.productionFirstStageExecution,
);

const serialized = JSON.stringify(response);
for (const secret of [
  "postgresql://erp:secret@db.internal:5432/erp",
  "top-secret-token",
  "top-secret-auth",
  "/Users/xu/private/release.json",
  ".erp-local-storage/private/release.json",
]) {
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(secret)));
}

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const serviceSource = readFileSync(
  new URL("../server/services/v1GoLiveStatusResponseService.mjs", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(new URL("../server/routes/systemReadRoutes.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
assert.match(registrySource, /createV1GoLiveStatusResponseService/);
assert.doesNotMatch(apiSource, /function getSystemV1GoLiveStatusResponse/);
assert.match(routeSource, /v1GoLiveStatusResponseService\.build\(\{\s*workspace,/);
assert.doesNotMatch(apiSource, /sanitizeV1GoLiveSummary/);
assert.doesNotMatch(apiSource, /buildV1FieldEvidenceDraftFreshness/);
assert.match(serviceSource, /from "\.\/v1ReleaseStatusProjectionService\.mjs"/);
assert.match(serviceSource, /from "\.\/v1ProductionStatusProjectionService\.mjs"/);
assert.match(serviceSource, /from "\.\/v1D49ReadinessService\.mjs"/);
assert.doesNotMatch(serviceSource, /node:fs|node:path|process\.env/);
assert.doesNotMatch(serviceSource, /writeFile|appendFile|renameSync|unlinkSync/);

console.log("V1 go-live status response service checks passed.");

function buildArtifacts() {
  const values = {
    completionSnapshot: {
      status: "blocked",
      ready: false,
      conclusion: unsafeText,
      summary: {
        label: unsafeText,
        p0Prototype: "97-98%",
        v1Readiness: "80-83%",
        releaseGate: "0/4",
        fieldEvidence: "0/34",
        onsiteTaskCount: 53,
      },
      releaseCandidate: { status: "blocked", ready: false, summary: {} },
      topBlockers: [{ key: "formal-env", label: unsafeText, detail: unsafeText }],
    },
    goLiveSuite: {
      status: "blocked",
      canDeclareV1Complete: false,
      generatedAt: "2026-07-14T04:00:00.000Z",
      summary: {},
    },
    releaseCandidate: { status: "blocked", ready: false, summary: {} },
    fieldAcceptanceReport: {},
    unblockPlan: {},
    fieldEvidenceIntake: {},
    fieldEvidenceItemsCsv: "",
    fieldEvidenceSignoffBoundaryCsv: "",
    fieldEvidenceIntakeRules: {},
    fieldEvidenceDraftManifest: {},
    onsiteTaskBoard: {},
    v1V2Scope: {},
    ownerDecisionBrief: {},
    productionEnvFillTemplate: [],
    productionEnvMinimumValuesFragmentTemplate: [],
    productionEnvIntakeVerification: {},
    productionPersistenceEvidence: {},
    productionFirstStageExecution: {},
    todoLoadPrecheck: {},
  };
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      {
        key,
        label: unsafeText,
        status: key === "ownerDecisionBrief" ? "missing" : "loaded",
        reason: key === "ownerDecisionBrief" ? unsafeText : "",
        value,
      },
    ]),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
