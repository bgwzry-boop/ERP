import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createV1GoLiveStatusArtifactReaderService } from "../server/services/v1GoLiveStatusArtifactReaderService.mjs";

const artifactRoot = "/private/v1-artifacts";

assert.throws(
  () => createV1GoLiveStatusArtifactReaderService({ getConfiguredArtifactRoot: null }),
  /getConfiguredArtifactRoot must be a function/,
);
assert.throws(
  () => createV1GoLiveStatusArtifactReaderService({ fileExists: null }),
  /fileExists must be a function/,
);
assert.throws(
  () => createV1GoLiveStatusArtifactReaderService({ readTextFile: null }),
  /readTextFile must be a function/,
);

const files = new Map([
  [
    join(artifactRoot, "v1-completion-snapshot", "latest.json"),
    JSON.stringify({ status: "blocked", summary: { releaseGate: "0/4" } }),
  ],
  [join(artifactRoot, "v1-field-evidence-intake", "evidence-items.csv"), "key,status\nEVIDENCE-001,pending"],
  [join(artifactRoot, "v1-release-candidate", "field-acceptance", "latest.json"), "{invalid-json"],
  [join(artifactRoot, "v1-field-evidence-intake", "intake-rules.zh-CN.md"), new Error("private path")],
]);
const service = createReader({ files });
const artifacts = service.readStatusArtifacts();

assert.equal(service.getArtifactRoot(), artifactRoot);
assert.deepEqual(Object.keys(artifacts), [
  "completionSnapshot",
  "goLiveSuite",
  "releaseCandidate",
  "fieldAcceptanceReport",
  "unblockPlan",
  "fieldEvidenceIntake",
  "fieldEvidenceItemsCsv",
  "fieldEvidenceSignoffBoundaryCsv",
  "fieldEvidenceIntakeRules",
  "fieldEvidenceDraftManifest",
  "onsiteTaskBoard",
  "v1V2Scope",
  "ownerDecisionBrief",
  "productionEnvFillTemplate",
  "productionEnvMinimumValuesFragmentTemplate",
  "productionEnvIntakeVerification",
  "productionPersistenceEvidence",
  "productionFirstStageExecution",
  "todoLoadPrecheck",
]);
assert.equal(artifacts.completionSnapshot.status, "loaded");
assert.equal(artifacts.completionSnapshot.value.summary.releaseGate, "0/4");
assert.equal(artifacts.fieldEvidenceItemsCsv.status, "loaded");
assert.match(artifacts.fieldEvidenceItemsCsv.value, /EVIDENCE-001/);
assert.equal(artifacts.goLiveSuite.status, "missing");
assert.equal(artifacts.goLiveSuite.reason, "artifact_missing");
assert.equal(artifacts.fieldAcceptanceReport.status, "invalid");
assert.equal(artifacts.fieldAcceptanceReport.reason, "artifact_json_invalid");
assert.equal(artifacts.fieldEvidenceIntakeRules.status, "invalid");
assert.equal(artifacts.fieldEvidenceIntakeRules.reason, "artifact_read_failed");
assert.doesNotMatch(JSON.stringify(artifacts), /\/private\/v1-artifacts/);

const fallbackFiles = new Map([
  [join(artifactRoot, "v1-release-candidate", "field-acceptance", "latest.json"), "{invalid-json"],
  [
    join(artifactRoot, "v1-field-acceptance", "latest.json"),
    JSON.stringify({ status: "blocked", source: "fallback" }),
  ],
]);
const fallbackArtifacts = createReader({ files: fallbackFiles }).readStatusArtifacts();
assert.equal(fallbackArtifacts.fieldAcceptanceReport.status, "loaded");
assert.equal(fallbackArtifacts.fieldAcceptanceReport.value.source, "fallback");

const defaultRootService = createV1GoLiveStatusArtifactReaderService({
  getConfiguredArtifactRoot: () => "  ",
  getDefaultArtifactRoot: () => "/private/default-artifacts",
  fileExists: () => false,
  readTextFile: () => "",
});
assert.equal(defaultRootService.getArtifactRoot(), resolve("/private/default-artifacts"));

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
const readerSource = readFileSync(
  new URL("../server/services/v1GoLiveStatusArtifactReaderService.mjs", import.meta.url),
  "utf8",
);
const responseSource = readFileSync(
  new URL("../server/services/v1GoLiveStatusResponseService.mjs", import.meta.url),
  "utf8",
);
assert.match(registrySource, /createV1GoLiveStatusArtifactReaderService/);
assert.match(registrySource, /v1GoLiveStatusArtifactReaderService\.readStatusArtifacts/);
assert.match(registrySource, /v1GoLiveStatusArtifactReaderService\.getArtifactRoot/);
assert.doesNotMatch(apiSource, /function readV1GoLiveStatusArtifacts/);
assert.doesNotMatch(apiSource, /function getV1GoLiveArtifactRoot/);
assert.doesNotMatch(apiSource, /existsSync|readFileSync/);
assert.match(readerSource, /function readStatusArtifacts\(\)/);
assert.match(readerSource, /firstInvalidArtifact/);
assert.doesNotMatch(readerSource, /writeFile|appendFile|renameSync|unlinkSync/);
assert.doesNotMatch(responseSource, /node:fs|node:path|process\.env/);

console.log(
  "V1 go-live status artifact reader checks passed: 19 sources, fallback precedence, invalid/read failures, path exclusion, and thin API wiring are covered.",
);

function createReader({ files }) {
  return createV1GoLiveStatusArtifactReaderService({
    getConfiguredArtifactRoot: () => artifactRoot,
    getDefaultArtifactRoot: () => "/unused",
    fileExists: (filePath) => files.has(filePath),
    readTextFile: (filePath) => {
      const value = files.get(filePath);
      if (value instanceof Error) throw value;
      return value;
    },
  });
}
