import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertV1ProductionReleaseGate } from "./assert-v1-production-release-gate.mjs";
import { buildV1FieldEvidenceManifestTemplate } from "./v1FieldEvidenceManifest.mjs";

const root = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-release-gate");
const now = new Date("2026-07-12T12:00:00.000Z");
const commit = "a".repeat(40);

rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

try {
  const manifest = buildReadyManifest();
  const releaseCandidate = buildReadyReleaseCandidate();
  const goLiveSuite = buildReadyGoLiveSuite();
  const attestation = assertV1ProductionReleaseGate({
    releaseCandidate,
    goLiveSuite,
    fieldEvidenceManifest: manifest,
    expectedCommit: commit,
    now,
  });
  assert.equal(attestation.ready, true);
  assert.equal(attestation.summary.releaseGates, "4/4");
  assert.equal(attestation.summary.requiredEvidence, "34/34");
  assert.equal(attestation.summary.requiredSignoffs, "6/6");
  assert.equal(JSON.stringify(attestation).includes("签字人"), false);
  assert.equal(JSON.stringify(attestation).includes("EVIDENCE-"), false);

  expectBlocked(
    () => assertV1ProductionReleaseGate({ releaseCandidate: { ...releaseCandidate, ready: false }, goLiveSuite, fieldEvidenceManifest: manifest, expectedCommit: commit, now }),
    /release candidate is not ready/,
  );
  const missingSignoff = structuredClone(manifest);
  missingSignoff.signoffs[0].status = "pending";
  missingSignoff.signoffs[0].signer = "";
  expectBlocked(
    () => assertV1ProductionReleaseGate({ releaseCandidate, goLiveSuite, fieldEvidenceManifest: missingSignoff, expectedCommit: commit, now }),
    /field evidence manifest is not ready/,
  );
  const staleReleaseCandidate = { ...releaseCandidate, generatedAt: "2026-07-12T10:00:00.000Z" };
  expectBlocked(
    () => assertV1ProductionReleaseGate({ releaseCandidate: staleReleaseCandidate, goLiveSuite, fieldEvidenceManifest: manifest, expectedCommit: commit, now }),
    /older than 30 minutes/,
  );
  const unsafeReleaseCandidate = {
    ...releaseCandidate,
    safeguards: { ...releaseCandidate.safeguards, connectionStringExposed: true },
  };
  expectBlocked(
    () => assertV1ProductionReleaseGate({ releaseCandidate: unsafeReleaseCandidate, goLiveSuite, fieldEvidenceManifest: manifest, expectedCommit: commit, now }),
    /connectionStringExposed must be false/,
  );
  expectBlocked(
    () => assertV1ProductionReleaseGate({ releaseCandidate, goLiveSuite, fieldEvidenceManifest: manifest, expectedCommit: "main", now }),
    /full lowercase 40-character SHA/,
  );

  checkCli({ manifest, releaseCandidate, goLiveSuite });
  checkGoLiveSuiteIntegration({ manifest, releaseCandidate });
  checkWorkflow();
  console.log("V1 production release gate checks passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}

function buildReadyManifest() {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  let evidenceIndex = 0;
  for (const group of manifest.evidenceGroups) {
    for (const item of group.items) {
      evidenceIndex += 1;
      item.status = "passed";
      item.evidenceRef = `EVIDENCE-${String(evidenceIndex).padStart(3, "0")}`;
    }
  }
  manifest.signoffs.forEach((signoff, index) => {
    signoff.status = "signed";
    signoff.signer = `签字人-${index + 1}`;
    signoff.signedAt = now.toISOString();
  });
  manifest.v1V2BoundaryConfirmed.status = "confirmed";
  manifest.v1V2BoundaryConfirmed.confirmedBy = "负责人";
  manifest.v1V2BoundaryConfirmed.confirmedAt = now.toISOString();
  return manifest;
}

function buildReadyReleaseCandidate() {
  return {
    scope: "v1_release_candidate_check",
    status: "ready",
    ready: true,
    generatedAt: now.toISOString(),
    summary: { label: "4/4 发布门禁通过", passedGateCount: 4, totalGateCount: 4 },
    gates: [
      "production_env_preflight",
      "field_evidence_manifest",
      "runtime_readiness",
      "field_acceptance_package",
    ].map((key) => ({ key, status: "passed", ready: true })),
    blockingItems: [],
    envFileAudit: { included: true, ready: true },
    envPreflight: { ready: true },
    fieldEvidenceManifest: { ready: true },
    safeguards: {
      productionEnvFileAuditNonMutating: true,
      productionEnvFileValuesExposed: false,
      productionEnvFileRawLinesExposed: false,
      productionEnvFileCommentsCopied: false,
      productionEnvFilePathExposed: false,
      productionEnvPreflightNonMutating: true,
      connectionStringExposed: false,
      objectStorageSecretsExposed: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      spoolPathExposed: false,
      payloadExposed: false,
      runtimeReadOnly: true,
      physicalPrinterCalledByCheck: false,
      driverDeliveryStatusChangedByCheck: false,
      fieldEvidenceRefsRedacted: true,
      fieldEvidenceRawRefsExposed: false,
      fieldEvidencePossibleSensitiveRefCount: 0,
    },
  };
}

function buildReadyGoLiveSuite() {
  return {
    scope: "v1_go_live_suite",
    status: "ready_go_live_suite_written",
    ready: true,
    canDeclareV1Complete: true,
    generatedAt: now.toISOString(),
    summary: { releaseCandidate: "4/4 发布门禁通过" },
    steps: ["releaseCandidate", "onsiteTaskBoard", "completionSnapshot", "ownerDecisionBrief", "handoffPack"].map((key) => ({ key, ready: true })),
  };
}

function checkCli({ manifest, releaseCandidate, goLiveSuite }) {
  const manifestPath = join(root, "manifest.json");
  const releasePath = join(root, "release.json");
  const suitePath = join(root, "suite.json");
  const outputPath = join(root, "attestation.json");
  writeJson(manifestPath, manifest);
  const cliGeneratedAt = new Date().toISOString();
  writeJson(releasePath, { ...releaseCandidate, generatedAt: cliGeneratedAt });
  writeJson(suitePath, { ...goLiveSuite, generatedAt: cliGeneratedAt });
  const run = spawnSync(
    process.execPath,
    [
      "scripts/assert-v1-production-release-gate.mjs",
      "--release-candidate",
      releasePath,
      "--go-live-suite",
      suitePath,
      "--field-evidence-manifest",
      manifestPath,
      "--expected-commit",
      commit,
      "--output",
      outputPath,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const output = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(output.ready, true);
  assert.match(output.sourceDigests.releaseCandidateSha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(output).includes("EVIDENCE-"), false);
  assert.equal(JSON.stringify(output).includes("签字人"), false);
}

function checkWorkflow() {
  const workflowPath = join(process.cwd(), ".github", "workflows", "v1-production-release-gate.yml");
  const workflow = readFileSync(workflowPath, "utf8");
  const requiredFragments = [
    "workflow_dispatch:",
    "environment: v1-production-release",
    "runs-on: [self-hosted, linux, erp-production-gate]",
    "persist-credentials: false",
    "clean: true",
    "$RUNNER_TEMP/erp-v1-production-release-input/",
    "ERP_V1_PRODUCTION_ENV_FILE_B64",
    "ERP_V1_FIELD_EVIDENCE_MANIFEST_B64",
    "npm audit --audit-level=high",
    "npm run db:postgres-live:check",
    "npm run object-storage:minio-live:check",
    "npm run e2e:core",
    "run-v1-release-candidate-check.mjs",
    "run-v1-go-live-suite.mjs",
    "assert-v1-production-release-gate.mjs",
    "actions/upload-artifact@v4",
    "if: always()",
  ];
  for (const fragment of requiredFragments) assert.ok(workflow.includes(fragment), `workflow is missing ${fragment}`);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /push:/);
  assert.doesNotMatch(workflow, /continue-on-error:/);
  assert.doesNotMatch(workflow, /--allow-blocked-exit-zero/);
  const yaml = spawnSync("ruby", ["-e", "require 'yaml'; YAML.safe_load(File.read(ARGV[0]), aliases: true)", workflowPath], {
    encoding: "utf8",
  });
  assert.equal(yaml.status, 0, yaml.stderr || "release workflow is not valid YAML");
}

function checkGoLiveSuiteIntegration({ manifest, releaseCandidate }) {
  const integrationRoot = join(root, "go-live-suite-integration");
  const sandboxRoot = join(integrationRoot, "sandbox");
  const releasePath = join(sandboxRoot, "release-candidate.json");
  const releaseMarkdownPath = join(sandboxRoot, "release-candidate.md");
  const manifestPath = join(sandboxRoot, "field-evidence.json");
  const outputRoot = join(sandboxRoot, "suite");
  const todoLoadDir = join(sandboxRoot, ".erp-local-storage", "v1-todo-load-precheck");
  const todoLoadPath = join(todoLoadDir, "latest.json");
  mkdirSync(sandboxRoot, { recursive: true });
  mkdirSync(todoLoadDir, { recursive: true });
  symlinkSync(join(process.cwd(), "docs"), join(sandboxRoot, "docs"), "dir");
  const generatedAt = new Date().toISOString();
  const integrationRelease = {
    ...releaseCandidate,
    generatedAt,
    conclusion: "V1 release gates are ready for final owner review.",
    v1Scope: ["V1 核心闭环"],
    v2Differences: ["V2 自动化能力继续冻结"],
  };
  writeJson(releasePath, integrationRelease);
  writeFileSync(releaseMarkdownPath, "# ERP V1 发布候选检查\n\n- 结论：READY（4/4 发布门禁通过）\n");
  writeJson(manifestPath, manifest);
  writeJson(todoLoadPath, buildReadyTodoLoadPrecheck(generatedAt));
  const run = spawnSync(
    process.execPath,
    [
      join(process.cwd(), "scripts", "run-v1-go-live-suite.mjs"),
      "--release-candidate-json",
      releasePath,
      "--release-candidate-markdown",
      releaseMarkdownPath,
      "--field-evidence-manifest",
      manifestPath,
      "--output-root",
      outputRoot,
      "--json",
    ],
    {
      cwd: sandboxRoot,
      encoding: "utf8",
      env: { ...process.env, ERP_V1_GO_LIVE_SUITE_IGNORE_DEFAULT_ARTIFACTS: "true" },
    },
  );
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const result = JSON.parse(run.stdout);
  assert.equal(result.ready, true, run.stdout);
  const generatedSuite = JSON.parse(readFileSync(join(outputRoot, "latest.json"), "utf8"));
  const attestation = assertV1ProductionReleaseGate({
    releaseCandidate: integrationRelease,
    goLiveSuite: generatedSuite,
    fieldEvidenceManifest: manifest,
    expectedCommit: commit,
    now: new Date(generatedSuite.generatedAt),
  });
  assert.equal(attestation.ready, true);
}

function buildReadyTodoLoadPrecheck(checkedAt) {
  return {
    scope: "v1_todo_load_precheck",
    status: "ready",
    ready: true,
    checkedAt,
    target: {
      protocol: "https",
      loopback: false,
      apiPathValidated: true,
      embeddedCredentials: false,
      addressExposed: false,
    },
    config: { requestCount: 100, concurrency: 10, maxP95Ms: 1000, maxErrorRate: 0 },
    authentication: {
      formalRuntimeSession: true,
      serverVerified: true,
      sessionType: "runtime",
      identityExposed: false,
    },
    summary: {
      label: "5/5 通过",
      requestCount: 100,
      successCount: 100,
      errorCount: 0,
      errorRate: 0,
      throughputPerSecond: 100,
      latencyMs: { p50: 100, p95: 200, max: 300 },
      snapshotChanged: false,
    },
    stages: [],
    blockingStages: [],
    warnings: [],
    safeguards: {
      explicitReadLoadConfirmation: true,
      businessReadOnly: true,
      businessDataMutated: false,
      requestCountBounded: true,
      concurrencyBounded: true,
      responsePayloadStored: false,
      todoIdentityStored: false,
      credentialsExposed: false,
      apiAddressExposed: false,
      physicalPrinterCalled: false,
    },
  };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  chmodSync(path, 0o600);
}

function expectBlocked(callback, pattern) {
  assert.throws(callback, pattern);
}
