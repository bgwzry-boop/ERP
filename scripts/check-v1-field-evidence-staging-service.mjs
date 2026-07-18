import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createV1FieldEvidenceStagingService } from "../server/services/v1FieldEvidenceStagingService.mjs";

const root = mkdtempSync(join(tmpdir(), "erp-v1-field-staging-"));
const intakeDir = join(root, "v1-field-evidence-intake");
mkdirSync(intakeDir, { recursive: true });
const evidenceCsvPath = join(intakeDir, "evidence-items.csv");
const signoffCsvPath = join(intakeDir, "signoff-boundary.csv");
writeFileSync(
  evidenceCsvPath,
  [
    '"groupKey","itemKey","groupLabel","itemLabel","ownerRole","required","onsiteStatus","onsiteEvidenceRef","onsiteNotes"',
    '"print_hardware","label_sample","真实打印","标签样张","仓库/出库","是","pending","",""',
    "",
  ].join("\n"),
);
writeFileSync(
  signoffCsvPath,
  [
    '"recordType","role","label","required","onsiteStatus","onsiteSigner","onsiteSignedAt","onsiteConfirmedBy","onsiteConfirmedAt","onsiteNotes"',
    '"signoff","office","办公室签字","是","pending","","","","",""',
    '"boundary","v1_v2_boundary","V1/V2边界","是","pending","","","","",""',
    "",
  ].join("\n"),
);

const fixedNow = new Date("2026-07-13T10:30:00.000Z");
const applyCalls = [];
const service = createV1FieldEvidenceStagingService({
  getArtifactRoot: () => root,
  getTemplatePath: () => join(root, "template.json"),
  now: () => fixedNow,
  applyIntakeFromFiles(input) {
    applyCalls.push(input);
    const manifest = { version: "fixture", evidenceGroups: [], signoffs: [], boundary: {} };
    writeFileSync(input.outputPath, JSON.stringify(manifest));
    return {
      status: "blocked_draft_written",
      ready: false,
      files: { outputWritten: true },
      summary: { invalidRowCount: 0 },
      validation: validationFixture(),
    };
  },
  validateManifest() {
    return validationFixture();
  },
  sanitizeDraftManifestResult(_result, { operatorId, checkedAt }) {
    return {
      status: "blocked_draft_written",
      ready: false,
      checkedAt,
      operatorId,
      summary: {
        invalidRowCount: 0,
        evidenceProgress: "1/34",
        signoffProgress: "0/6",
        boundaryLabel: "待确认",
      },
      output: { draftWritten: true },
      safeguards: { rawEvidenceRefsIncluded: false, rawSignersIncluded: false },
    };
  },
});

try {
  const invalidType = service.stageRow({ body: { rowType: "unknown" }, operatorId: "U-MANAGER" });
  assert.equal(invalidType.httpStatus, 422);
  assert.equal(invalidType.body.error.code, "V1_FIELD_EVIDENCE_STAGE_ROW_TYPE_INVALID");

  const missingRef = service.stageRow({
    body: {
      rowType: "evidence",
      groupKey: "print_hardware",
      itemKey: "label_sample",
      onsiteStatus: "passed",
    },
    operatorId: "U-MANAGER",
  });
  assert.equal(missingRef.httpStatus, 422);
  assert.equal(missingRef.body.error.code, "V1_FIELD_EVIDENCE_STAGE_EVIDENCE_REF_REQUIRED");

  const blockedSensitive = service.stageRow({
    body: {
      rowType: "evidence",
      groupKey: "print_hardware",
      itemKey: "label_sample",
      onsiteStatus: "passed",
      onsiteEvidenceRef: "postgres://user:password@db.internal/erp",
    },
    operatorId: "U-MANAGER",
  });
  assert.equal(blockedSensitive.httpStatus, 422);
  assert.equal(blockedSensitive.body.error.code, "V1_FIELD_EVIDENCE_STAGE_SENSITIVE_VALUE");
  assert.doesNotMatch(JSON.stringify(blockedSensitive), /db\.internal|user:password/);

  const evidence = service.stageRow({
    body: {
      rowType: "evidence",
      groupKey: "print_hardware",
      itemKey: "label_sample",
      onsiteStatus: "passed",
      onsiteEvidenceRef: "ATT-PRINT-001",
      onsiteNotes: "仓库已复核",
    },
    operatorId: "U-MANAGER",
  });
  assert.equal(evidence.httpStatus, 200);
  assert.equal(evidence.body.status, "blocked_draft_written");
  assert.equal(evidence.body.row.evidenceRefFilled, true);
  assert.equal(evidence.body.summary.csvUpdated, true);
  assert.equal(evidence.body.summary.draftWritten, true);
  assert.equal(evidence.body.safeguards.releaseCandidateRefreshed, false);
  assert.equal(evidence.body.safeguards.goLiveSuiteRefreshed, false);
  assert.doesNotMatch(JSON.stringify(evidence.body), /ATT-PRINT-001|仓库已复核/);
  assert.match(readFileSync(evidenceCsvPath, "utf8"), /ATT-PRINT-001/);

  const signoff = service.stageRow({
    body: {
      rowType: "signoff",
      role: "office",
      onsiteStatus: "signed",
      onsiteSigner: "办公室负责人A",
      onsiteSignedAt: "2026-07-13T10:20:00+08:00",
    },
    operatorId: "U-MANAGER",
  });
  assert.equal(signoff.httpStatus, 200);
  assert.equal(signoff.body.row.personFilled, true);
  assert.equal(signoff.body.row.timeFilled, true);
  assert.doesNotMatch(JSON.stringify(signoff.body), /办公室负责人A/);

  const boundary = service.stageRow({
    body: {
      rowType: "boundary",
      role: "v1_v2_boundary",
      onsiteStatus: "confirmed",
      onsiteConfirmedBy: "管理负责人A",
      onsiteConfirmedAt: "2026-07-13T10:25:00+08:00",
    },
    operatorId: "U-MANAGER",
  });
  assert.equal(boundary.httpStatus, 200);
  assert.equal(boundary.body.row.type, "boundary");
  assert.equal(boundary.body.row.personFilled, true);
  assert.doesNotMatch(JSON.stringify(boundary.body), /管理负责人A/);
  assert.equal(applyCalls.length, 3);

  const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
  const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
  const routeSource = readFileSync(new URL("../server/routes/systemWriteRoutes.mjs", import.meta.url), "utf8");
  const serviceSource = readFileSync(
    new URL("../server/services/v1FieldEvidenceStagingService.mjs", import.meta.url),
    "utf8",
  );
  assert.match(registrySource, /createV1FieldEvidenceStagingService/);
  assert.match(routeSource, /v1FieldEvidenceStagingService\.stageRow/);
  for (const legacyName of [
    "stageV1FieldEvidenceCsvRow",
    "stageV1SignoffBoundaryCsvRow",
    "readV1MutableCsv",
    "writeV1MutableCsv",
    "buildV1FieldEvidenceStageRowEvidenceCloseout",
  ]) {
    assert.doesNotMatch(apiSource, new RegExp(legacyName), `${legacyName} should not remain in apiServer`);
  }
  assert.match(serviceSource, /function stageEvidenceCsvRow/);
  assert.match(serviceSource, /function stageSignoffBoundaryCsvRow/);
  assert.match(serviceSource, /function buildEvidenceCloseout/);
  assert.match(serviceSource, /function buildSignoffBoundaryCloseout/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  "V1 field-evidence staging service checks passed: evidence/signoff/boundary validation, CSV mutation, draft rebuild, redaction, and thin API composition are covered.",
);

function validationFixture() {
  return {
    summary: {
      requiredEvidenceItemsTotal: 34,
      requiredEvidenceItemsCompleted: 1,
      requiredSignoffsTotal: 6,
      requiredSignoffsCompleted: 0,
    },
    boundary: { status: "pending", blocking: true },
    blockers: [],
    groups: [],
    signoffs: [],
  };
}
