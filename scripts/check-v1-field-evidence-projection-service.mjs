import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildV1FieldEvidenceDraftFreshness,
  sanitizeV1FieldEvidenceIntakeGuidance,
  sanitizeV1FieldEvidenceIntakeQuality,
  sanitizeV1FieldEvidenceProgress,
} from "../server/services/v1FieldEvidenceProjectionService.mjs";
import { sanitizeV1RoleTaskActionText } from "../server/services/v1StatusTextSanitizer.mjs";

const evidenceCsv = [
  "key,group,label,required,onsiteStatus,evidenceRefFilled,onsiteEvidenceRef,ownerRole,detail,nextAction",
  "EVIDENCE-001,production_persistence,生产持久化,true,passed,true,SECRET-EVIDENCE-REF,技术运维,已完成,继续复核",
].join("\n");
const signoffBoundaryCsv = [
  "recordType,key,role,required,onsiteStatus,filledName,filledTime,onsiteSigner,onsiteSignedAt,onsiteConfirmedBy,onsiteConfirmedAt",
  "signoff,SIGNOFF-001,management,true,signed,true,true,SECRET-SIGNER,2026-07-12T03:00:00.000Z,,",
  "boundary,BOUNDARY-001,boundary,true,confirmed,true,true,,,SECRET-CONFIRMER,2026-07-12T03:05:00.000Z",
].join("\n");
const draftManifestArtifact = {
  status: "loaded",
  value: {
    fieldEvidenceIntakeSnapshot: {
      schema: "erp-v1-field-evidence-intake-snapshot-v1",
      generatedAt: "2026-07-12T03:10:00.000Z",
      evidenceCsv: buildSnapshot(evidenceCsv, 1),
      signoffBoundaryCsv: buildSnapshot(signoffBoundaryCsv, 2),
    },
  },
};

const freshness = buildV1FieldEvidenceDraftFreshness(
  evidenceCsv,
  signoffBoundaryCsv,
  draftManifestArtifact,
);
assert.equal(freshness.status, "fresh");
assert.equal(freshness.ready, true);
assert.equal(freshness.summary.evidenceCsvMatched, true);
assert.equal(freshness.summary.signoffBoundaryCsvMatched, true);
assert.equal(JSON.stringify(freshness).includes(buildDigest(evidenceCsv)), false);

const staleFreshness = buildV1FieldEvidenceDraftFreshness(
  `${evidenceCsv}\n`,
  signoffBoundaryCsv,
  draftManifestArtifact,
);
assert.equal(staleFreshness.status, "stale");
assert.equal(staleFreshness.ready, false);
assert.equal(staleFreshness.staleReasons.length, 1);

const missingFreshness = buildV1FieldEvidenceDraftFreshness(
  evidenceCsv,
  signoffBoundaryCsv,
  { status: "missing" },
);
assert.equal(missingFreshness.status, "missing");
assert.equal(missingFreshness.ready, false);

const guidance = sanitizeV1FieldEvidenceIntakeGuidance(
  evidenceCsv,
  signoffBoundaryCsv,
  {
    rulesArtifact: { status: "loaded" },
    draftManifestArtifact,
    draftFreshness: freshness,
  },
);
assert.equal(guidance.status, "ready");
assert.equal(guidance.ready, true);
assert.equal(guidance.summary.evidenceRows, 1);
assert.equal(guidance.summary.signoffRows, 1);
assert.equal(guidance.summary.boundaryReady, true);

const quality = sanitizeV1FieldEvidenceIntakeQuality(
  evidenceCsv,
  signoffBoundaryCsv,
  {
    rulesArtifact: { status: "loaded" },
    draftManifestArtifact,
    draftFreshness: freshness,
  },
);
assert.equal(quality.status, "ready");
assert.equal(quality.ready, true);
assert.equal(quality.summary.blockingIssueCount, 0);
assert.equal(quality.summary.canRefreshReleaseCandidate, true);
assert.equal(quality.checks.every((item) => item.ready), true);

const progress = sanitizeV1FieldEvidenceProgress(
  {
    ready: false,
    summary: { label: "现场进度" },
    groups: [
      {
        key: "production_persistence",
        label: "生产持久化",
        requiredTotal: 1,
        completedRequired: 1,
        blockedRequired: 0,
        ready: true,
      },
    ],
    signoffs: [
      {
        role: "management",
        label: "管理签字",
        required: true,
        status: "signed",
        ready: true,
      },
    ],
    boundary: { status: "confirmed", ready: true },
  },
  {},
  evidenceCsv,
  signoffBoundaryCsv,
);
assert.equal(progress.ready, true);
assert.equal(progress.summary.requiredEvidenceItemsCompleted, 1);
assert.equal(progress.summary.requiredSignoffsCompleted, 1);
assert.equal(progress.boundary.ready, true);

const serialized = JSON.stringify({ freshness, guidance, quality, progress });
for (const secret of ["SECRET-EVIDENCE-REF", "SECRET-SIGNER", "SECRET-CONFIRMER"]) {
  assert.equal(serialized.includes(secret), false, `${secret} must not enter API projections`);
}
const redactedText = sanitizeV1RoleTaskActionText(
  "evidenceRef signer/signedAt /Users/xu/private/file REPLACE_WITH_SECRET",
);
assert.equal(redactedText.includes("/Users/xu"), false);
assert.equal(redactedText.includes("REPLACE_WITH_SECRET"), false);
assert.match(redactedText, /现场证据编号/);
assert.match(redactedText, /<本地路径已隐藏>/);

function buildSnapshot(value, rowCount) {
  return {
    included: true,
    digest: buildDigest(value),
    rowCount,
  };
}

function buildDigest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

console.log(
  "V1 field-evidence projection service checks passed: freshness, quality, progress, and redaction are isolated.",
);
