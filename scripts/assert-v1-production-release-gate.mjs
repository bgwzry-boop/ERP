#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateV1FieldEvidenceManifest } from "./v1FieldEvidenceManifest.mjs";

const requiredReleaseGateKeys = [
  "production_env_preflight",
  "field_evidence_manifest",
  "runtime_readiness",
  "field_acceptance_package",
];

export function assertV1ProductionReleaseGate({
  releaseCandidate,
  goLiveSuite,
  fieldEvidenceManifest,
  expectedCommit,
  now = new Date(),
  sourceDigests = {},
} = {}) {
  requireCondition(/^[0-9a-f]{40}$/.test(String(expectedCommit || "")), "release commit must be a full lowercase 40-character SHA");
  assertFreshReadyReport(releaseCandidate, {
    scope: "v1_release_candidate_check",
    status: "ready",
    label: "release candidate",
    now,
  });
  assertFreshReadyReport(goLiveSuite, {
    scope: "v1_go_live_suite",
    status: "ready_go_live_suite_written",
    label: "go-live suite",
    now,
  });

  const gateMap = new Map((releaseCandidate.gates || []).map((gate) => [gate?.key, gate]));
  requireCondition(gateMap.size === requiredReleaseGateKeys.length, "release candidate must contain exactly four release gates");
  for (const key of requiredReleaseGateKeys) {
    const gate = gateMap.get(key);
    requireCondition(gate?.ready === true && gate?.status === "passed", `release gate ${key} is not passed`);
  }
  requireCondition(releaseCandidate.summary?.passedGateCount === 4, "release candidate passed-gate count must be 4");
  requireCondition(releaseCandidate.summary?.totalGateCount === 4, "release candidate total-gate count must be 4");
  requireCondition((releaseCandidate.blockingItems || []).length === 0, "release candidate still contains blocking items");
  requireCondition(releaseCandidate.envFileAudit?.included === true, "production env file audit must be included");
  requireCondition(releaseCandidate.envFileAudit?.ready === true, "production env file audit is not ready");
  requireCondition(releaseCandidate.envPreflight?.ready === true, "production env preflight is not ready");

  const evidence = validateV1FieldEvidenceManifest(fieldEvidenceManifest);
  requireCondition(evidence.schemaValid === true, "field evidence manifest schema is invalid");
  requireCondition(evidence.ready === true, "field evidence manifest is not ready");
  requireCondition(evidence.summary.requiredEvidenceItemsTotal >= 40, "field evidence manifest has fewer than 40 required items");
  requireCondition(
    evidence.summary.requiredEvidenceItemsCompleted === evidence.summary.requiredEvidenceItemsTotal,
    "field evidence manifest has incomplete required items",
  );
  requireCondition(evidence.summary.requiredSignoffsTotal >= 6, "field evidence manifest has fewer than six required signoffs");
  requireCondition(
    evidence.summary.requiredSignoffsCompleted === evidence.summary.requiredSignoffsTotal,
    "field evidence manifest has incomplete required signoffs",
  );
  requireCondition(evidence.boundary?.blocking === false, "V1/V2 boundary is not confirmed");
  requireCondition(
    evidence.safeguards?.possibleSensitiveEvidenceRefCount === 0,
    "field evidence manifest contains a potentially sensitive evidence reference",
  );

  requireCondition(releaseCandidate.fieldEvidenceManifest?.ready === true, "release candidate did not accept field evidence");
  assertReleaseSafeguards(releaseCandidate.safeguards || {});

  requireCondition(goLiveSuite.canDeclareV1Complete === true, "go-live suite cannot declare V1 complete");
  requireCondition(
    String(goLiveSuite.summary?.releaseCandidate || "").includes("4/4"),
    "go-live suite is not based on a 4/4 release candidate",
  );
  requireCondition(
    Array.isArray(goLiveSuite.steps) && goLiveSuite.steps.length > 0 && goLiveSuite.steps.every((step) => step?.ready === true),
    "go-live suite contains a blocked generation step",
  );

  return {
    schema: "erp-v1-production-release-attestation-v1",
    scope: "v1_production_release_gate",
    status: "ready",
    ready: true,
    generatedAt: now.toISOString(),
    releaseCommit: expectedCommit,
    sourceDigests: {
      releaseCandidateSha256: String(sourceDigests.releaseCandidateSha256 || ""),
      goLiveSuiteSha256: String(sourceDigests.goLiveSuiteSha256 || ""),
      fieldEvidenceManifestSha256: String(sourceDigests.fieldEvidenceManifestSha256 || ""),
    },
    summary: {
      releaseGates: "4/4",
      requiredEvidence: `${evidence.summary.requiredEvidenceItemsCompleted}/${evidence.summary.requiredEvidenceItemsTotal}`,
      requiredSignoffs: `${evidence.summary.requiredSignoffsCompleted}/${evidence.summary.requiredSignoffsTotal}`,
      v1V2BoundaryConfirmed: true,
      canDeclareV1Complete: true,
    },
    safeguards: {
      immutableCommitVerified: true,
      productionEnvFileAudited: true,
      evidenceRefsCopied: false,
      signerNamesCopied: false,
      environmentValuesCopied: false,
      sourceDigestsRecorded: true,
    },
  };
}

function assertFreshReadyReport(report, { scope, status, label, now }) {
  requireCondition(report?.scope === scope, `${label} has an unexpected scope`);
  requireCondition(report?.ready === true, `${label} is not ready`);
  requireCondition(report?.status === status, `${label} has an unexpected status`);
  const generatedAtMs = Date.parse(report.generatedAt);
  requireCondition(Number.isFinite(generatedAtMs), `${label} generatedAt is invalid`);
  const ageMs = now.getTime() - generatedAtMs;
  requireCondition(ageMs >= -5 * 60_000, `${label} generatedAt is too far in the future`);
  requireCondition(ageMs <= 30 * 60_000, `${label} is older than 30 minutes`);
}

function assertReleaseSafeguards(safeguards) {
  const requiredTrue = [
    "productionEnvFileAuditNonMutating",
    "productionEnvPreflightNonMutating",
    "runtimeReadOnly",
    "fieldEvidenceRefsRedacted",
  ];
  const requiredFalse = [
    "productionEnvFileValuesExposed",
    "productionEnvFileRawLinesExposed",
    "productionEnvFileCommentsCopied",
    "productionEnvFilePathExposed",
    "connectionStringExposed",
    "objectStorageSecretsExposed",
    "commandValueExposed",
    "commandArgsExposed",
    "spoolPathExposed",
    "payloadExposed",
    "physicalPrinterCalledByCheck",
    "driverDeliveryStatusChangedByCheck",
    "fieldEvidenceRawRefsExposed",
  ];
  for (const key of requiredTrue) requireCondition(safeguards[key] === true, `release safeguard ${key} must be true`);
  for (const key of requiredFalse) requireCondition(safeguards[key] === false, `release safeguard ${key} must be false`);
  requireCondition(
    Number(safeguards.fieldEvidencePossibleSensitiveRefCount || 0) === 0,
    "release safeguard reports potentially sensitive evidence references",
  );
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(`V1 production release gate blocked: ${message}.`);
}

function readJsonFile(path, label) {
  const fullPath = resolve(path);
  if (!existsSync(fullPath)) throw new Error(`${label} is missing.`);
  try {
    const text = readFileSync(fullPath, "utf8");
    return { value: JSON.parse(text), digest: createHash("sha256").update(text).digest("hex") };
  } catch {
    throw new Error(`${label} is not readable JSON.`);
  }
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const keyByArg = {
      "--release-candidate": "releaseCandidate",
      "--go-live-suite": "goLiveSuite",
      "--field-evidence-manifest": "fieldEvidenceManifest",
      "--expected-commit": "expectedCommit",
      "--output": "output",
    };
    const key = keyByArg[arg];
    if (!key) throw new Error(`Unknown argument: ${arg}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
    options[key] = value;
    index += 1;
  }
  for (const key of ["releaseCandidate", "goLiveSuite", "fieldEvidenceManifest", "expectedCommit"]) {
    if (!options[key]) throw new Error(`Missing required release-gate argument: ${key}.`);
  }
  return options;
}

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const releaseCandidate = readJsonFile(options.releaseCandidate, "release candidate");
    const goLiveSuite = readJsonFile(options.goLiveSuite, "go-live suite");
    const fieldEvidenceManifest = readJsonFile(options.fieldEvidenceManifest, "field evidence manifest");
    const attestation = assertV1ProductionReleaseGate({
      releaseCandidate: releaseCandidate.value,
      goLiveSuite: goLiveSuite.value,
      fieldEvidenceManifest: fieldEvidenceManifest.value,
      expectedCommit: options.expectedCommit,
      sourceDigests: {
        releaseCandidateSha256: releaseCandidate.digest,
        goLiveSuiteSha256: goLiveSuite.digest,
        fieldEvidenceManifestSha256: fieldEvidenceManifest.digest,
      },
    });
    if (options.output) {
      const outputPath = resolve(options.output);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify(attestation, null, 2)}\n`, { mode: 0o600 });
    }
    process.stdout.write(`${JSON.stringify(attestation, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli();
