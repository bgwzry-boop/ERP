import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildProductionFirstStageCloseout,
  formatProductionFirstStageCloseout,
  redactCloseoutText,
  writeProductionFirstStageCloseoutArtifacts,
} from "./run-v1-production-first-stage-closeout.mjs";
import { buildV1FieldEvidenceManifestTemplate } from "./v1FieldEvidenceManifest.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-first-stage-closeout");
const persistencePath = join(storageRoot, "persistence-evidence.json");
const runtimePath = join(storageRoot, "runtime-smoke.json");
const manifestPath = join(storageRoot, "field-evidence-manifest.json");
const outputDir = join(storageRoot, "closeout");
const runnerScript = join(process.cwd(), "scripts", "run-v1-production-first-stage-closeout.mjs");
const sensitiveDatabaseUrl = "postgres://erp_user:SUPER_SECRET_CLOSEOUT_PASSWORD@prod-db.internal:5432/erp";
const sensitiveEndpoint = "https://oss-closeout-secret.example.com";
const sensitiveBucket = "erp-v1-closeout-private-bucket";
const sensitiveAccessKey = "AKIA_CLOSEOUT_SECRET";
const sensitiveSecretKey = "SUPER_SECRET_CLOSEOUT_OBJECT_STORAGE_VALUE";

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

try {
  checkBlockedMissingArtifacts();
  checkReadyCloseout();
  checkReadyCloseoutWithExternalRuntimeSmoke();
  checkFieldEvidenceBlocked();
  checkStaleEvidenceBlocked();
  checkSafeguardBlocked();
  await checkCliAndRedaction();
  console.log(
    "V1 production first-stage closeout check passed: missing artifacts, ready closeout with field evidence, external runtime-smoke safeguards, field-evidence blockers, stale evidence, safeguard failures, artifacts, CLI, and redaction are covered.",
  );
} finally {
  rmSync(storageRoot, { recursive: true, force: true });
}

function checkBlockedMissingArtifacts() {
  const report = buildProductionFirstStageCloseout({
    persistenceEvidencePath: join(storageRoot, "missing-persistence.json"),
    runtimeSmokePath: join(storageRoot, "missing-runtime.json"),
    fieldEvidenceManifestPath: join(storageRoot, "missing-manifest.json"),
    checkedAt: "2026-07-08T08:00:00.000Z",
    now: new Date("2026-07-08T08:00:00.000Z"),
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  assert.equal(report.stages.find((item) => item.key === "production-persistence-evidence-artifact")?.status, "blocked");
  assert.equal(report.stages.find((item) => item.key === "production-runtime-smoke-artifact")?.status, "blocked");
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionFirstStageCloseout(report));
}

function checkReadyCloseout() {
  writeJson(persistencePath, buildPersistenceEvidenceReport({ checkedAt: "2026-07-08T07:00:00.000Z" }));
  writeJson(runtimePath, buildRuntimeSmokeReport({ checkedAt: "2026-07-08T07:05:00.000Z" }));
  writeJson(manifestPath, buildFirstStageManifest());

  const report = buildProductionFirstStageCloseout({
    persistenceEvidencePath: persistencePath,
    runtimeSmokePath: runtimePath,
    fieldEvidenceManifestPath: manifestPath,
    checkedAt: "2026-07-08T08:00:00.000Z",
    now: new Date("2026-07-08T08:00:00.000Z"),
    maxAgeHours: 72,
  });
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.summary.passedCount, report.summary.totalCount);
  assert.equal(report.evidenceSummary.fieldEvidenceManifest.schemaValid, true);
  assert.equal(report.evidenceSummary.productionPersistenceEvidence.completedRequired, 5);
  assert.equal(report.evidenceSummary.objectStorageEvidence.completedRequired, 5);
  assert.equal(report.evidenceSummary.sourceArtifactPathsIncluded, false);
  assert.equal(report.evidenceSummary.rawReportsIncluded, false);
  assert.equal(report.evidenceSummary.rawEvidenceRefsIncluded, false);
  assert.equal(report.safeguards.declaresFullV1Complete, false);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionFirstStageCloseout(report));

  const artifacts = writeProductionFirstStageCloseoutArtifacts(report, { outputDir });
  assert.equal(existsSync(artifacts.latestJsonPath), true);
  assert.equal(existsSync(artifacts.latestMarkdownPath), true);
  assertNoSensitiveOutput(readFileSync(artifacts.latestJsonPath, "utf8"));
  assertNoSensitiveOutput(readFileSync(artifacts.latestMarkdownPath, "utf8"));
}

function checkReadyCloseoutWithExternalRuntimeSmoke() {
  writeJson(persistencePath, buildPersistenceEvidenceReport({ checkedAt: "2026-07-08T07:00:00.000Z" }));
  writeJson(
    runtimePath,
    buildRuntimeSmokeReport({
      checkedAt: "2026-07-08T07:05:00.000Z",
      safeguards: { apiProcessSpawned: false, apiProcessTerminated: false, externalApiProbed: true },
    }),
  );
  writeJson(manifestPath, buildFirstStageManifest());

  const report = buildProductionFirstStageCloseout({
    persistenceEvidencePath: persistencePath,
    runtimeSmokePath: runtimePath,
    fieldEvidenceManifestPath: manifestPath,
    checkedAt: "2026-07-08T08:00:00.000Z",
    now: new Date("2026-07-08T08:00:00.000Z"),
    maxAgeHours: 72,
  });
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.stages.find((item) => item.key === "first-stage-safeguards")?.status, "passed");
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionFirstStageCloseout(report));
}

function checkFieldEvidenceBlocked() {
  writeJson(persistencePath, buildPersistenceEvidenceReport({ checkedAt: "2026-07-08T07:00:00.000Z" }));
  writeJson(runtimePath, buildRuntimeSmokeReport({ checkedAt: "2026-07-08T07:05:00.000Z" }));
  writeJson(manifestPath, buildFirstStageManifest({ objectStorageReady: false }));

  const report = buildProductionFirstStageCloseout({
    persistenceEvidencePath: persistencePath,
    runtimeSmokePath: runtimePath,
    fieldEvidenceManifestPath: manifestPath,
    checkedAt: "2026-07-08T08:00:00.000Z",
    now: new Date("2026-07-08T08:00:00.000Z"),
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  const objectStorage = report.stages.find((item) => item.key === "first-stage-object-storage-evidence");
  assert.equal(objectStorage?.status, "blocked");
  assert.equal(objectStorage.summary.blockingCount, 5);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionFirstStageCloseout(report));
}

function checkStaleEvidenceBlocked() {
  writeJson(persistencePath, buildPersistenceEvidenceReport({ checkedAt: "2026-07-01T07:00:00.000Z" }));
  writeJson(runtimePath, buildRuntimeSmokeReport({ checkedAt: "2026-07-08T07:05:00.000Z" }));
  writeJson(manifestPath, buildFirstStageManifest());

  const report = buildProductionFirstStageCloseout({
    persistenceEvidencePath: persistencePath,
    runtimeSmokePath: runtimePath,
    fieldEvidenceManifestPath: manifestPath,
    checkedAt: "2026-07-08T08:00:00.000Z",
    now: new Date("2026-07-08T08:00:00.000Z"),
    maxAgeHours: 72,
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  const freshness = report.stages.find((item) => item.key === "evidence-freshness");
  assert.equal(freshness?.status, "blocked");
  assert.ok(freshness.blockingItems.some((item) => item.key === "production-persistence-evidence"));
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionFirstStageCloseout(report));
}

function checkSafeguardBlocked() {
  writeJson(
    persistencePath,
    buildPersistenceEvidenceReport({
      checkedAt: "2026-07-08T07:00:00.000Z",
      safeguards: { objectStorageDiagnosticObjectsDeleted: false },
    }),
  );
  writeJson(
    runtimePath,
    buildRuntimeSmokeReport({
      checkedAt: "2026-07-08T07:05:00.000Z",
      safeguards: { apiProcessTerminated: false },
    }),
  );
  writeJson(manifestPath, buildFirstStageManifest({ sensitiveEvidenceRef: true }));

  const report = buildProductionFirstStageCloseout({
    persistenceEvidencePath: persistencePath,
    runtimeSmokePath: runtimePath,
    fieldEvidenceManifestPath: manifestPath,
    checkedAt: "2026-07-08T08:00:00.000Z",
    now: new Date("2026-07-08T08:00:00.000Z"),
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.ready, false);
  const safeguards = report.stages.find((item) => item.key === "first-stage-safeguards");
  assert.equal(safeguards?.status, "blocked");
  assert.ok(safeguards.blockingItems.some((item) => item.key === "persistence-probes-clean"));
  assert.ok(safeguards.blockingItems.some((item) => item.key === "runtime-process-stopped"));
  assert.ok(safeguards.blockingItems.some((item) => item.key === "manifest-evidence-ref-redacted"));
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionFirstStageCloseout(report));
}

async function checkCliAndRedaction() {
  writeJson(persistencePath, buildPersistenceEvidenceReport({ checkedAt: "2026-07-08T07:00:00.000Z" }));
  writeJson(runtimePath, buildRuntimeSmokeReport({ checkedAt: "2026-07-08T07:05:00.000Z" }));
  writeJson(manifestPath, buildFirstStageManifest());
  const run = await runNodeCli([
    runnerScript,
    "--persistence-evidence-json",
    persistencePath,
    "--runtime-smoke-json",
    runtimePath,
    "--field-evidence-manifest",
    manifestPath,
    "--max-age-hours",
    "72",
    "--output-dir",
    outputDir,
    "--json",
  ]);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(/\[redacted-(?:local-)?path\]/.test(report.artifacts.latestJsonPath), true);
  assertNoSensitiveOutput(run.stdout + run.stderr);

  const redacted = redactCloseoutText(
    `${sensitiveDatabaseUrl} ${sensitiveEndpoint}/${sensitiveBucket} ${sensitiveAccessKey} ${sensitiveSecretKey} ${persistencePath} ${runtimePath} ${manifestPath}`,
  );
  assertNoSensitiveOutput(redacted);
}

function buildPersistenceEvidenceReport({ checkedAt, safeguards = {} } = {}) {
  return {
    scope: "v1_production_persistence_evidence",
    status: "ready",
    ready: true,
    checkedAt,
    summary: { label: "5/5 通过", passedCount: 5, totalCount: 5, blockingCount: 0, warningCount: 0 },
    stages: [],
    blockingStages: [],
    safeguards: {
      migrationApplyExecuted: false,
      nonMutatingBusinessData: true,
      postgresTempTableWriteProbeRolledBack: true,
      objectStorageDiagnosticObjectsDeleted: true,
      envValuesExposed: false,
      databaseUrlExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      objectKeyExposed: false,
      signedUrlExposed: false,
      payloadExposed: false,
      ...safeguards,
    },
    nextActions: ["继续运行生产 API runtime smoke。"],
    diagnosticNoise: `${sensitiveDatabaseUrl} ${sensitiveEndpoint} ${sensitiveBucket} ${sensitiveAccessKey} ${sensitiveSecretKey}`,
  };
}

function buildRuntimeSmokeReport({ checkedAt, safeguards = {} } = {}) {
  return {
    scope: "v1_production_runtime_smoke",
    status: "ready",
    ready: true,
    checkedAt,
    summary: { label: "4/4 通过", passedCount: 4, totalCount: 4, blockingCount: 0, warningCount: 0 },
    stages: [],
    blockingStages: [],
    runtime: {
      repositoryProfile: { repositoryProfile: "postgres", unsupportedRepositoryCount: 0 },
      storageProfile: { attachmentObjectStorageKind: "object_storage", statementExportObjectStorageKind: "object_storage" },
    },
    safeguards: {
      apiProcessSpawned: true,
      apiProcessTerminated: true,
      businessDataMutated: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
      envValuesExposed: false,
      databaseUrlExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      payloadExposed: false,
      ...safeguards,
    },
    nextActions: ["保存 runtime smoke 留证。"],
    diagnosticNoise: `${sensitiveDatabaseUrl} ${sensitiveEndpoint} ${sensitiveBucket} ${sensitiveAccessKey} ${sensitiveSecretKey}`,
  };
}

function buildFirstStageManifest({
  productionPersistenceReady = true,
  objectStorageReady = true,
  sensitiveEvidenceRef = false,
} = {}) {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  markGroup(manifest, "production_persistence", productionPersistenceReady, sensitiveEvidenceRef);
  markGroup(manifest, "object_storage", objectStorageReady, false);
  return manifest;
}

function markGroup(manifest, groupKey, ready, sensitiveEvidenceRef) {
  const group = manifest.evidenceGroups.find((item) => item.key === groupKey);
  assert.ok(group, `missing group ${groupKey}`);
  for (const [index, item] of group.items.entries()) {
    item.status = ready ? "passed" : "pending";
    item.evidenceRef = ready
      ? sensitiveEvidenceRef && index === 0
        ? sensitiveDatabaseUrl
        : `EVID-${groupKey}-${index + 1}`
      : "";
  }
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runNodeCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH || "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function assertNoSensitiveOutput(value) {
  const text = String(value || "");
  for (const sensitive of [
    sensitiveDatabaseUrl,
    "SUPER_SECRET_CLOSEOUT_PASSWORD",
    sensitiveEndpoint,
    sensitiveBucket,
    sensitiveAccessKey,
    sensitiveSecretKey,
    persistencePath,
    runtimePath,
    manifestPath,
    outputDir,
  ]) {
    assert.doesNotMatch(text, new RegExp(escapeRegExp(sensitive)), `sensitive output leaked: ${sensitive}`);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
