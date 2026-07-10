import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { applyV1FieldEvidenceIntakeFromFiles } from "./apply-v1-field-evidence-intake.mjs";
import {
  buildProductionFirstStageEvidenceSuggestions,
  formatProductionFirstStageEvidenceSuggestions,
} from "./run-v1-production-first-stage-evidence-suggestions.mjs";
import { buildV1FieldEvidenceManifestTemplate, serializeManifestJson } from "./v1FieldEvidenceManifest.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-first-stage-evidence-suggestions");
const sourceRoot = join(storageRoot, "sources");
const evidenceCsvPath = join(sourceRoot, "evidence-items.csv");
const persistenceEvidencePath = join(sourceRoot, "persistence-evidence.json");
const runtimeSmokePath = join(sourceRoot, "runtime-smoke.json");
const manifestPath = join(sourceRoot, "field-evidence.json");
const outputDir = join(storageRoot, "suggestions");
const outputManifestPath = join(storageRoot, "filled-manifest.draft.json");
const runnerScript = join(process.cwd(), "scripts", "run-v1-production-first-stage-evidence-suggestions.mjs");
const sensitiveDatabaseUrl = "postgres://erp_user:SUPER_SECRET_SUGGESTIONS@prod-db.internal:5432/erp";
const sensitiveEndpoint = "https://oss-suggestions-secret.example.com";
const sensitiveBucket = "erp-v1-suggestions-private-bucket";
const sensitiveAccessKey = "AKIA_SUGGESTIONS_SECRET";
const sensitiveSecretKey = "SUPER_SECRET_SUGGESTIONS_OBJECT_STORAGE";

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(sourceRoot, { recursive: true });

try {
  checkReadySuggestionCsvAndApply();
  checkMissingReportsDoNotSuggestAcceptance();
  checkExistingOnsiteValuesArePreserved();
  await checkCliAndRedaction();
  console.log(
    "V1 production first-stage evidence suggestions check passed: ready suggestions, draft apply, missing reports, existing onsite preservation, CLI, artifacts, and redaction are covered.",
  );
} finally {
  rmSync(storageRoot, { recursive: true, force: true });
}

function checkReadySuggestionCsvAndApply() {
  writeFileSync(manifestPath, serializeManifestJson(buildV1FieldEvidenceManifestTemplate()));
  writeFileSync(evidenceCsvPath, buildEvidenceCsv({ includeExisting: false }));
  writeJson(persistenceEvidencePath, buildPersistenceEvidenceReport());
  writeJson(runtimeSmokePath, buildRuntimeSmokeReport());

  const report = buildProductionFirstStageEvidenceSuggestions({
    evidenceCsvPath,
    persistenceEvidencePath,
    runtimeSmokePath,
    outputDir,
    checkedAt: "2026-07-08T10:00:00.000Z",
  });

  assert.equal(report.scope, "v1_production_first_stage_evidence_suggestions");
  assert.equal(report.status, "review_required");
  assert.equal(report.ready, false);
  assert.equal(report.summary.autoAcceptedSuggestionCount, 7);
  assert.equal(report.summary.partialSuggestionCount, 2);
  assert.equal(report.summary.manualOnlyCount, 1);
  assert.equal(report.summary.firstStageManualReviewStillRequired, true);
  assert.equal(report.sourceReports.persistenceEvidence.ready, true);
  assert.equal(report.sourceReports.runtimeSmoke.ready, true);
  assert.equal(report.safeguards.declaresFullV1Complete, false);
  assert.equal(report.safeguards.releaseCandidateRefreshed, false);
  assert.equal(existsSync(join(outputDir, "suggested-evidence-items.csv")), true);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionFirstStageEvidenceSuggestions(report));

  const suggestedCsv = readFileSync(join(outputDir, "suggested-evidence-items.csv"), "utf8");
  assert.match(suggestedCsv, /"accepted","AUTO:production-postgres-preflight:20260708T100000Z"/);
  assert.match(suggestedCsv, /"pending","","自动化恢复抽样已通过/);
  assert.match(suggestedCsv, /附件访问审计已写入并可查询","yes","pending","no","","",""/);
  assertNoSensitiveOutput(suggestedCsv);

  const applyResult = applyV1FieldEvidenceIntakeFromFiles({
    manifestPath,
    csv: join(outputDir, "suggested-evidence-items.csv"),
    outputPath: outputManifestPath,
    writeOutput: true,
  });
  assert.equal(applyResult.status, "blocked_draft_written");
  assert.equal(applyResult.ready, false);
  assert.equal(applyResult.summary.appliedEvidenceRowCount, 9);
  assert.equal(applyResult.summary.requiredEvidenceItems, "7/34");
  assert.equal(existsSync(outputManifestPath), true);

  const draft = JSON.parse(readFileSync(outputManifestPath, "utf8"));
  assert.equal(findItem(draft, "production_persistence", "postgres_migration_applied").status, "accepted");
  assert.equal(findItem(draft, "production_persistence", "postgres_backup_configured").status, "pending");
  assert.equal(findItem(draft, "object_storage", "attachment_access_audit_checked").status, "pending");
}

function checkMissingReportsDoNotSuggestAcceptance() {
  writeFileSync(evidenceCsvPath, buildEvidenceCsv({ includeExisting: false }));
  const report = buildProductionFirstStageEvidenceSuggestions({
    evidenceCsvPath,
    persistenceEvidencePath: join(sourceRoot, "missing-persistence.json"),
    runtimeSmokePath: join(sourceRoot, "missing-runtime.json"),
    outputDir: join(storageRoot, "missing-suggestions"),
    checkedAt: "2026-07-08T10:10:00.000Z",
  });
  assert.equal(report.summary.autoAcceptedSuggestionCount, 0);
  assert.equal(report.summary.partialSuggestionCount, 0);
  assert.equal(report.summary.manualOnlyCount, 10);
  assert.equal(report.sourceReports.persistenceEvidence.included, false);
  assert.equal(report.sourceReports.runtimeSmoke.included, false);
  assert.match(
    report.nextActions.join("\n"),
    /run-v1-production-persistence-evidence\.mjs --use-production-env-setup-env-file/,
  );
  assert.match(report.nextActions.join("\n"), /run-v1-production-runtime-smoke\.mjs --use-production-env-setup-env-file/);
  assert.doesNotMatch(
    report.nextActions.join("\n"),
    /run-v1-production-persistence-evidence\.mjs --env-file <secure-env-file>/,
  );
  const csv = readFileSync(join(storageRoot, "missing-suggestions", "suggested-evidence-items.csv"), "utf8");
  assert.doesNotMatch(csv, /"accepted"/);
  assertNoSensitiveOutput(JSON.stringify(report) + csv);
}

function checkExistingOnsiteValuesArePreserved() {
  writeFileSync(evidenceCsvPath, buildEvidenceCsv({ includeExisting: true }));
  writeJson(persistenceEvidencePath, buildPersistenceEvidenceReport());
  writeJson(runtimeSmokePath, buildRuntimeSmokeReport());
  const report = buildProductionFirstStageEvidenceSuggestions({
    evidenceCsvPath,
    persistenceEvidencePath,
    runtimeSmokePath,
    outputDir: join(storageRoot, "preserved-suggestions"),
    checkedAt: "2026-07-08T10:20:00.000Z",
  });
  assert.equal(report.summary.preservedExistingCount, 1);
  assert.equal(report.summary.autoAcceptedSuggestionCount, 6);
  const csv = readFileSync(join(storageRoot, "preserved-suggestions", "suggested-evidence-items.csv"), "utf8");
  assert.match(csv, /"passed","FIELD-PG-001","现场已经上传的证据"/);
  assertNoSensitiveOutput(JSON.stringify(report) + formatProductionFirstStageEvidenceSuggestions(report));
}

async function checkCliAndRedaction() {
  writeFileSync(evidenceCsvPath, buildEvidenceCsv({ includeExisting: false }));
  writeJson(persistenceEvidencePath, buildPersistenceEvidenceReport({ includeSensitiveNoise: true }));
  writeJson(runtimeSmokePath, buildRuntimeSmokeReport({ includeSensitiveNoise: true }));
  const cliOutputDir = join(storageRoot, "cli-suggestions");
  const run = await runNode([
    runnerScript,
    "--evidence-csv",
    evidenceCsvPath,
    "--persistence-evidence-json",
    persistenceEvidencePath,
    "--runtime-smoke-json",
    runtimeSmokePath,
    "--output-dir",
    cliOutputDir,
    "--checked-at",
    "2026-07-08T10:30:00.000Z",
    "--json",
  ]);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.summary.autoAcceptedSuggestionCount, 7);
  assert.equal(report.files.outputWritten, true);
  assert.equal(existsSync(join(cliOutputDir, "latest.json")), true);
  assert.equal(existsSync(join(cliOutputDir, "latest.md")), true);
  assertNoSensitiveOutput(run.stdout + run.stderr + readFileSync(join(cliOutputDir, "latest.md"), "utf8"));
}

function buildEvidenceCsv({ includeExisting }) {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  const rows = manifest.evidenceGroups
    .filter((group) => group.key === "production_persistence" || group.key === "object_storage")
    .flatMap((group) =>
      group.items.map((item) => ({
        groupKey: group.key,
        groupLabel: group.label,
        ownerRole: group.ownerRole,
        itemKey: item.key,
        itemLabel: item.label,
        required: "yes",
        status: "pending",
        evidenceRefFilled: "no",
        onsiteStatus: includeExisting && item.key === "postgres_migration_applied" ? "passed" : "",
        onsiteEvidenceRef: includeExisting && item.key === "postgres_migration_applied" ? "FIELD-PG-001" : "",
        onsiteNotes: includeExisting && item.key === "postgres_migration_applied" ? "现场已经上传的证据" : "",
      })),
    );
  return serializeCsv(rows);
}

function buildPersistenceEvidenceReport({ includeSensitiveNoise = false } = {}) {
  return {
    scope: "v1_production_persistence_evidence",
    status: "ready",
    ready: true,
    checkedAt: "2026-07-08T09:55:00.000Z",
    summary: { label: "8/8 阶段通过", passedCount: 8, totalCount: 8, blockingCount: 0, warningCount: 0 },
    stages: [
      {
        key: "production-persistence-env-subset",
        status: "passed",
        ready: true,
        evidence: { fullEnvPassedCount: 10, fullEnvTotalCount: 10, fullEnvBlockingCount: 0 },
      },
      { key: "production-postgres-preflight", status: "passed", ready: true },
      { key: "production-postgres-backup-restore-check", status: "passed", ready: true },
      { key: "production-object-storage-preflight", status: "passed", ready: true },
      { key: "production-object-storage-governance-check", status: "passed", ready: true },
    ],
    safeguards: {
      migrationApplyExecuted: false,
      nonMutatingBusinessData: true,
      objectStorageDiagnosticObjectsDeleted: true,
      envValuesExposed: false,
      databaseUrlExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      objectKeyExposed: false,
      signedUrlExposed: false,
      payloadExposed: false,
    },
    diagnosticNoise: includeSensitiveNoise
      ? `${sensitiveDatabaseUrl} ${sensitiveEndpoint}/${sensitiveBucket} ${sensitiveAccessKey} ${sensitiveSecretKey}`
      : "",
  };
}

function buildRuntimeSmokeReport({ includeSensitiveNoise = false } = {}) {
  return {
    scope: "v1_production_runtime_smoke",
    status: "ready",
    ready: true,
    checkedAt: "2026-07-08T09:58:00.000Z",
    summary: { label: "4/4 通过", passedCount: 4, totalCount: 4, blockingCount: 0, warningCount: 0 },
    stages: [
      { key: "production-env-file-audit", status: "passed", ready: true },
      { key: "production-persistence-env-subset", status: "passed", ready: true },
      { key: "api-runtime-startup", status: "passed", ready: true },
      { key: "runtime-production-profile", status: "passed", ready: true },
    ],
    runtime: {
      repositoryProfile: { repositoryProfile: "postgres", unsupportedRepositoryCount: 0 },
      storageProfile: { attachmentObjectStorageKind: "object_storage", statementExportObjectStorageKind: "object_storage" },
      systemReadiness: { ready: true, status: "ready" },
    },
    safeguards: {
      nonMutating: true,
      readOnlyHttpProbesOnly: true,
      apiProcessSpawned: false,
      externalApiProbed: true,
      businessDataMutated: false,
      physicalPrinterCalled: false,
      envValuesExposed: false,
      databaseUrlExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      payloadExposed: false,
    },
    diagnosticNoise: includeSensitiveNoise
      ? `${sensitiveDatabaseUrl} ${sensitiveEndpoint}/${sensitiveBucket} ${sensitiveAccessKey} ${sensitiveSecretKey}`
      : "",
  };
}

function findItem(manifest, groupKey, itemKey) {
  return manifest.evidenceGroups
    .find((group) => group.key === groupKey)
    .items.find((item) => item.key === itemKey);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function serializeCsv(rows) {
  const headers = [
    "groupKey",
    "groupLabel",
    "ownerRole",
    "itemKey",
    "itemLabel",
    "required",
    "status",
    "evidenceRefFilled",
    "onsiteStatus",
    "onsiteEvidenceRef",
    "onsiteNotes",
  ];
  return `${[headers.map(csvCell).join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header] || "")).join(","))].join("\n")}\n`;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function runNode(args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, PATH: process.env.PATH || "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (status) => resolveRun({ status, stdout, stderr }));
  });
}

function assertNoSensitiveOutput(text) {
  const output = String(text || "");
  for (const forbidden of [
    /postgres:\/\/[^<\s]+:[^<\s]+@/i,
    /SUPER_SECRET/i,
    /AKIA_[A-Z_]+/,
    /oss-suggestions-secret/i,
    /erp-v1-suggestions-private-bucket/i,
    /prod-db\.internal/i,
    /\/Users\/|\/private\//,
  ]) {
    assert.doesNotMatch(output, forbidden);
  }
}
