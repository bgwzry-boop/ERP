import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createV1FieldEvidenceDraftService,
  sanitizeV1FieldEvidenceDraftManifestValidationResult,
  sanitizeV1FieldEvidenceIntakeDraftManifestResult,
} from "../server/services/v1FieldEvidenceDraftService.mjs";

const root = mkdtempSync(join(tmpdir(), "erp-v1-field-draft-"));
const intakeDir = join(root, "v1-field-evidence-intake");
mkdirSync(intakeDir, { recursive: true });
writeFileSync(join(intakeDir, "evidence-items.csv"), '"groupKey","itemKey"\n"g1","i1"\n');
writeFileSync(join(intakeDir, "signoff-boundary.csv"), '"recordType","role"\n"signoff","office"\n');
writeFileSync(join(intakeDir, "filled-manifest.draft.json"), JSON.stringify({ version: "fixture" }));

const fixedNow = new Date("2026-07-13T11:00:00.000Z");
const applyCalls = [];
const service = createV1FieldEvidenceDraftService({
  getArtifactRoot: () => root,
  getTemplatePath: () => join(root, "template.json"),
  now: () => fixedNow,
  applyIntakeFromFiles(input) {
    applyCalls.push(input);
    return {
      status: "blocked_draft_written",
      ready: false,
      generatedAt: fixedNow.toISOString(),
      files: { outputWritten: true, secretPath: "/private/evidence.json" },
      summary: {
        appliedRowCount: 2,
        invalidRowCount: 0,
        requiredEvidenceItems: "1/40",
        signoffs: "0/6",
        boundary: "pending",
      },
      validation: { status: "blocked", ready: false, summary: { label: "仍有阻塞" } },
      rawEvidenceRef: "ATT-SECRET-RAW",
    };
  },
  validateManifest() {
    return validationFixture();
  },
});

try {
  const generated = service.generateDraft({ operatorId: "U-MANAGER" });
  assert.equal(generated.httpStatus, 200);
  assert.equal(generated.body.status, "blocked_draft_written");
  assert.equal(generated.body.summary.appliedRowCount, 2);
  assert.equal(generated.body.output.draftWritten, true);
  assert.equal(generated.body.safeguards.outputWritesDraftOnly, true);
  assert.equal(generated.body.safeguards.releaseCandidateRefreshed, false);
  assert.doesNotMatch(JSON.stringify(generated.body), /ATT-SECRET-RAW|private\/evidence/);
  assert.equal(applyCalls.length, 1);
  assert.equal(applyCalls[0].writeOutput, true);

  const validated = service.validateDraft({ operatorId: "U-MANAGER" });
  assert.equal(validated.httpStatus, 200);
  assert.equal(validated.body.status, "stale");
  assert.equal(validated.body.ready, false);
  assert.equal(validated.body.summary.draftFreshnessReady, false);
  assert.equal(validated.body.safeguards.fieldEvidenceDraftFreshnessChecked, true);
  assert.equal(validated.body.safeguards.rawFieldEvidenceDraftManifestIncluded, false);

  const readyProjection = sanitizeV1FieldEvidenceDraftManifestValidationResult(validationFixture(), {
    operatorId: "U-MANAGER",
    checkedAt: fixedNow.toISOString(),
    draftManifestAvailable: true,
    draftFreshness: { ready: true, status: "fresh", label: "当前草稿" },
  });
  assert.equal(readyProjection.status, "ready");
  assert.equal(readyProjection.ready, true);
  assert.equal(readyProjection.summary.evidenceProgress, "40/40");
  assert.equal(readyProjection.summary.signoffProgress, "6/6");
  assert.doesNotMatch(JSON.stringify(readyProjection), /办公室负责人A|原始证据/);

  const invalidProjection = sanitizeV1FieldEvidenceIntakeDraftManifestResult(
    {
      status: "invalid",
      files: { outputWritten: true },
      summary: { invalidRowCount: 1 },
      invalidRows: [
        {
          type: "evidence",
          row: 2,
          groupKey: "print_hardware",
          itemKey: "sample",
          reason: "证据编号缺失",
          fixHint: "补内部编号",
          rawValue: "RAW-SECRET",
        },
      ],
    },
    { operatorId: "U-MANAGER", checkedAt: fixedNow.toISOString() },
  );
  assert.equal(invalidProjection.summary.invalidRowCount, 1);
  assert.equal(invalidProjection.invalidRows[0].reason, "证据编号缺失");
  assert.doesNotMatch(JSON.stringify(invalidProjection), /RAW-SECRET/);

  const failing = createV1FieldEvidenceDraftService({
    getArtifactRoot: () => join(root, "missing"),
    applyIntakeFromFiles() {
      throw new Error("/private/path postgres://user:password@db.internal/erp");
    },
  });
  const generateError = failing.generateDraft({ operatorId: "U-MANAGER" });
  const validateError = failing.validateDraft({ operatorId: "U-MANAGER" });
  assert.equal(generateError.httpStatus, 400);
  assert.equal(validateError.httpStatus, 400);
  assert.doesNotMatch(JSON.stringify({ generateError, validateError }), /private\/path|db\.internal|user:password/);

  const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
  const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
  const routeSource = readFileSync(new URL("../server/routes/systemWriteRoutes.mjs", import.meta.url), "utf8");
  const stagingSource = readFileSync(
    new URL("../server/services/v1FieldEvidenceStagingService.mjs", import.meta.url),
    "utf8",
  );
  const refreshPrecheckSource = readFileSync(
    new URL("../server/services/v1ReleaseCandidateRefreshPrecheckService.mjs", import.meta.url),
    "utf8",
  );
  assert.match(registrySource, /createV1FieldEvidenceDraftService/);
  assert.match(routeSource, /v1FieldEvidenceDraftService\.generateDraft/);
  assert.match(routeSource, /v1FieldEvidenceDraftService\.validateDraft/);
  assert.doesNotMatch(apiSource, /sanitizeV1FieldEvidenceDraftManifestValidationResult/);
  assert.match(refreshPrecheckSource, /sanitizeV1FieldEvidenceDraftManifestValidationResult/);
  assert.doesNotMatch(apiSource, /function sanitizeV1FieldEvidenceIntakeDraftManifestResult/);
  assert.doesNotMatch(apiSource, /function sanitizeV1FieldEvidenceDraftManifestValidationResult/);
  assert.doesNotMatch(apiSource, /function buildV1FieldEvidenceDraftValidationSafeguards/);
  assert.match(stagingSource, /from "\.\/v1FieldEvidenceDraftService\.mjs"/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  "V1 field-evidence draft service checks passed: generation, validation, freshness, redaction, error handling, staging reuse, and thin API composition are covered.",
);

function validationFixture() {
  return {
    status: "ready",
    ready: true,
    schemaValid: true,
    summary: {
      label: "全部满足",
      requiredEvidenceItemsCompleted: 40,
      requiredEvidenceItemsTotal: 40,
      requiredSignoffsCompleted: 6,
      requiredSignoffsTotal: 6,
      evidenceGroupsReady: 7,
      evidenceGroupsTotal: 7,
      blockingCount: 0,
    },
    groups: [{ label: "真实打印", ownerRole: "仓库", ready: true, completedRequired: 6, requiredTotal: 6 }],
    signoffs: [
      {
        role: "office",
        status: "signed",
        blocking: false,
        signerFilled: true,
        signedAtFilled: true,
        signer: "办公室负责人A",
      },
    ],
    boundary: {
      status: "confirmed",
      blocking: false,
      confirmedByFilled: true,
      confirmedAtFilled: true,
      notes: "原始证据不应输出",
    },
    blockers: [],
  };
}
