import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import {
  closeTestServer,
  getTestServerBaseUrl,
  listenTestServer,
  requestJson,
} from "./helpers/apiIntegrationTestHarness.mjs";
import {
  createOfficeAttachment,
  createV1FieldEvidenceAttachmentInput,
  createV1FieldEvidenceAttachmentListInput,
  createV1SignoffBoundaryAttachmentInput,
  createV1SignoffBoundaryAttachmentListInput,
  listOfficeAttachments,
} from "../src/services/officeAttachmentApiClient.js";
import { stageOfficeV1FieldEvidenceIntakeRow } from "../src/services/officeV1GoLiveStatusApiClient.js";

const originalArtifactRoot = process.env.ERP_V1_GO_LIVE_ARTIFACT_ROOT;
const artifactRoot = mkdtempSync(join(tmpdir(), "erp-v1-field-stage-"));
const intakeRoot = join(artifactRoot, "v1-field-evidence-intake");
mkdirSync(intakeRoot, { recursive: true });

writeFileSync(
  join(intakeRoot, "evidence-items.csv"),
  [
    '"groupKey","groupLabel","ownerRole","itemKey","itemLabel","required","status","evidenceRefFilled","onsiteStatus","onsiteEvidenceRef","onsiteNotes"',
    '"production_persistence","生产持久化","技术 / 管理","postgres_migration_applied","PostgreSQL 迁移已在生产库执行","yes","pending","no","","",""',
    "",
  ].join("\n"),
);

writeFileSync(
  join(intakeRoot, "signoff-boundary.csv"),
  [
    '"recordType","role","label","required","status","filledName","filledTime","onsiteStatus","onsiteSigner","onsiteSignedAt","onsiteConfirmedBy","onsiteConfirmedAt","onsiteNotes"',
    '"signoff","办公室","办公室","yes","pending","no","no","","","","","",""',
    '"boundary","v1_v2_boundary","V1/V2 边界确认","yes","pending","no","no","","","","","",""',
    "",
  ].join("\n"),
);

process.env.ERP_V1_GO_LIVE_ARTIFACT_ROOT = artifactRoot;
const server = createApiServer({
  attachmentRepositoryOptions: { storageRoot: join(artifactRoot, "attachment-metadata") },
  attachmentAccessAuditRepositoryOptions: { storageRoot: join(artifactRoot, "attachment-metadata") },
  attachmentObjectStorageOptions: { storageRoot: join(artifactRoot, "attachment-objects") },
});

try {
  await listenTestServer(server);
  const serverBaseUrl = getTestServerBaseUrl(server);
  const apiBaseUrl = `${serverBaseUrl}/api`;

  const deniedResponse = await requestJson(serverBaseUrl, "/api/system/v1-field-evidence-intake/stage-row", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: JSON.stringify({
      rowType: "evidence",
      groupKey: "production_persistence",
      itemKey: "postgres_migration_applied",
      onsiteStatus: "passed",
      onsiteEvidenceRef: "EVID-PG-001",
    }),
    expectedStatus: 403,
  });
  assert.equal(deniedResponse.status, 403, "warehouse cannot stage V1 field evidence rows");
  const deniedJson = deniedResponse.body;
  assert.equal(deniedJson.requiredPermission, "system.v1_field_evidence_intake.apply");

  const invalidResponse = await requestJson(serverBaseUrl, "/api/system/v1-field-evidence-intake/stage-row", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      rowType: "evidence",
      groupKey: "production_persistence",
      itemKey: "postgres_migration_applied",
      onsiteStatus: "passed",
    }),
    expectedStatus: 422,
  });
  assert.equal(invalidResponse.status, 422, "passed evidence requires a reference");
  const invalidJson = invalidResponse.body;
  assert.equal(invalidJson.version, "p0-v1-field-evidence-intake-stage-row-v1");
  assert.equal(invalidJson.status, "invalid");
  assert.equal(invalidJson.summary.csvUpdated, false);
  assert.equal(invalidJson.safeguards.rawEvidenceRefsIncluded, false);

  const evidenceResponse = await requestJson(serverBaseUrl, "/api/system/v1-field-evidence-intake/stage-row", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      rowType: "evidence",
      groupKey: "production_persistence",
      itemKey: "postgres_migration_applied",
      onsiteStatus: "passed",
      onsiteEvidenceRef: "EVID-PG-001",
      onsiteNotes: "migration screenshot archived",
    }),
    expectedStatus: 200,
  });
  assert.equal(evidenceResponse.status, 200, "management can stage one V1 field evidence row");
  const evidenceJson = evidenceResponse.body;
  assert.equal(evidenceJson.version, "p0-v1-field-evidence-intake-stage-row-v1");
  assert.equal(evidenceJson.scope, "v1_field_evidence_intake_stage_row");
  assert.equal(evidenceJson.status, "blocked_draft_written");
  assert.equal(evidenceJson.ready, false);
  assert.equal(evidenceJson.row.type, "evidence");
  assert.equal(evidenceJson.row.groupKey, "production_persistence");
  assert.equal(evidenceJson.row.itemKey, "postgres_migration_applied");
  assert.equal(evidenceJson.row.evidenceRefFilled, true);
  assert.equal(evidenceJson.summary.csvUpdated, true);
  assert.equal(evidenceJson.summary.draftWritten, true);
  assert.equal(evidenceJson.summary.evidenceProgress, "1/40");
  assert.equal(evidenceJson.summary.signoffProgress, "0/6");
  assert.equal(evidenceJson.summary.releaseCandidateRefreshed, false);
  assert.equal(evidenceJson.evidenceCloseout.evidenceProgress, "1/40");
  assert.equal(evidenceJson.evidenceCloseout.ready, false);
  assert.equal(evidenceJson.evidenceCloseout.missingEvidenceRows, 39);
  assert.equal(evidenceJson.evidenceCloseout.invalidEvidenceRows, 0);
  assert.ok(evidenceJson.evidenceCloseout.actionCount > 0, "remaining evidence closeout should expose draft-manifest actions");
  assert.ok(evidenceJson.evidenceCloseout.actions.length > 0, "remaining evidence closeout should include visible action rows");
  assert.equal(evidenceJson.evidenceCloseout.actionShownCount, evidenceJson.evidenceCloseout.actions.length);
  assert.ok(
    evidenceJson.evidenceCloseout.actionCount > evidenceJson.evidenceCloseout.actionShownCount,
    "remaining evidence closeout should keep total count separate from visible rows",
  );
  assert.ok(evidenceJson.evidenceCloseout.actions[0].groupKey, "remaining evidence actions should keep group key for fill-to-draft");
  assert.ok(evidenceJson.evidenceCloseout.actions[0].key, "remaining evidence actions should keep item key for fill-to-draft");
  assert.equal(evidenceJson.evidenceCloseout.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(evidenceJson.closeout.signoffProgress, "0/6");
  assert.equal(evidenceJson.closeout.missingSignoffRows, 6);
  assert.equal(evidenceJson.closeout.signoffBoundarySummary.signoffProgressLabel, "0/6");
  assert.equal(evidenceJson.closeout.signoffBoundarySummary.missingSignoffCount, 6);
  assert.equal(evidenceJson.closeout.signoffBoundarySummary.boundaryLabel, "待确认");
  assert.equal(evidenceJson.closeout.signoffBoundarySummary.actionLabel, "5/7");
  assert.equal(evidenceJson.closeout.signoffBoundarySummary.previewActions.length, 3);
  assert.ok(evidenceJson.closeout.actionCount > 0, "signoff/boundary closeout should expose draft-manifest actions");
  assert.ok(evidenceJson.closeout.actions.length > 0, "signoff/boundary closeout should include visible action rows");
  assert.equal(evidenceJson.closeout.actionShownCount, evidenceJson.closeout.actions.length);
  assert.ok(
    evidenceJson.closeout.actionCount > evidenceJson.closeout.actionShownCount,
    "signoff/boundary closeout should keep total count separate from visible rows",
  );
  assert.ok(evidenceJson.closeout.actions[0].type, "signoff/boundary actions should keep type for fill-to-draft");
  assert.ok(evidenceJson.closeout.actions[0].key, "signoff/boundary actions should keep key for fill-to-draft");
  assert.equal(evidenceJson.draftManifest.summary.evidenceProgress, "1/40");
  assert.equal(evidenceJson.safeguards.sourceManifestMutated, false);
  assert.equal(evidenceJson.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(evidenceJson.safeguards.rawSignersIncluded, false);
  assert.equal(evidenceJson.safeguards.rawNotesIncluded, false);
  assert.equal(evidenceJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(evidenceJson.safeguards.goLiveSuiteRefreshed, false);
  assert.doesNotMatch(JSON.stringify(evidenceJson), /EVID-PG-001|migration screenshot|\.erp-local-storage|\/private|\/Users/);
  assert.match(readFileSync(join(intakeRoot, "evidence-items.csv"), "utf8"), /EVID-PG-001/);
  assert.match(readFileSync(join(intakeRoot, "filled-manifest.draft.json"), "utf8"), /EVID-PG-001/);

  const attachmentInput = createV1FieldEvidenceAttachmentInput({
    evidenceItem: {
      groupKey: "production_persistence",
      key: "postgres_migration_applied",
      groupLabel: "生产持久化",
      label: "PostgreSQL 迁移已在生产库执行",
      ownerRole: "技术 / 管理",
    },
    operatorId: "U-MANAGER-A",
    remark: "migration PDF proof",
    file: {
      name: "postgres-migration-proof.pdf",
      type: "application/pdf",
      size: 28,
      contentDataUrl: "data:application/pdf;base64,JVBERi0xLjQKJUVSUC1WMQ==",
    },
  });
  assert.equal(attachmentInput.ownerType, "v1_field_evidence");
  assert.equal(attachmentInput.ownerId, "production_persistence:postgres_migration_applied");
  assert.equal(attachmentInput.purpose, "v1_field_evidence");
  const attachmentListInput = createV1FieldEvidenceAttachmentListInput({
    evidenceItem: {
      groupKey: "production_persistence",
      key: "postgres_migration_applied",
    },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(attachmentListInput.ownerType, "v1_field_evidence");
  assert.equal(attachmentListInput.ownerId, attachmentInput.ownerId);
  assert.equal(attachmentListInput.purpose, "v1_field_evidence");
  const attachmentResult = await createOfficeAttachment(
    {
      ...attachmentInput,
      authState: null,
    },
    { apiBaseUrl },
  );
  assert.equal(attachmentResult.source, "api", "V1 field evidence attachment should use the backend API");
  assert.match(attachmentResult.attachment.attachmentId, /^ATT-/, "V1 evidence attachments must get backend ATT-* ids");
  assert.equal(attachmentResult.attachment.ownerType, "v1_field_evidence");
  assert.equal(attachmentResult.attachment.purpose, "v1_field_evidence");
  assert.equal(attachmentResult.attachment.hasContent, true);
  const attachmentListResult = await listOfficeAttachments(
    {
      ...attachmentListInput,
      authState: null,
    },
    { apiBaseUrl },
  );
  assert.equal(attachmentListResult.source, "api", "V1 field evidence attachments must be listed from the backend API");
  assert.equal(attachmentListResult.items.length, 1, "V1 field evidence list should return the uploaded attachment");
  assert.equal(attachmentListResult.items[0].attachmentId, attachmentResult.attachment.attachmentId);
  assert.match(attachmentListResult.items[0].attachmentId, /^ATT-/);
  assert.equal(attachmentListResult.items[0].ownerType, "v1_field_evidence");
  assert.equal(attachmentListResult.items[0].purpose, "v1_field_evidence");
  assert.doesNotMatch(
    JSON.stringify(attachmentListResult),
    /JVBER|attachment-objects|\.erp-local-storage|\/private|\/Users/,
  );

  const attachmentStageResult = await stageOfficeV1FieldEvidenceIntakeRow(
    {
      operatorId: "U-MANAGER-A",
      row: {
        rowType: "evidence",
        groupKey: "production_persistence",
        itemKey: "postgres_migration_applied",
        onsiteStatus: "passed",
        onsiteEvidenceRef: attachmentResult.attachment.attachmentId,
        onsiteNotes: "backend attachment registered",
      },
    },
    { apiBaseUrl },
  );
  assert.equal(attachmentStageResult.source, "api");
  assert.equal(attachmentStageResult.stageResult.summary.evidenceProgress, "1/40");
  assert.equal(attachmentStageResult.stageResult.evidenceCloseout.evidenceProgress, "1/40");
  assert.equal(attachmentStageResult.stageResult.evidenceCloseout.missingEvidenceRows, 39);
  assert.ok(attachmentStageResult.stageResult.evidenceCloseout.actions.length > 0);
  assert.equal(attachmentStageResult.stageResult.evidenceCloseout.safeguards.rawEvidenceRefsIncluded, false);
  assert.equal(attachmentStageResult.stageResult.safeguards.rawEvidenceRefsIncluded, false);
  assert.doesNotMatch(
    JSON.stringify(attachmentStageResult.stageResult),
    /postgres-migration-proof|backend attachment registered|JVBER|attachment-objects|\.erp-local-storage|\/private|\/Users/,
  );
  assert.match(readFileSync(join(intakeRoot, "evidence-items.csv"), "utf8"), new RegExp(attachmentResult.attachment.attachmentId));

  const signoffAttachmentInput = createV1SignoffBoundaryAttachmentInput({
    signoffItem: {
      type: "signoff",
      key: "办公室",
      label: "办公室",
      status: "pending",
    },
    operatorId: "U-MANAGER-A",
    remark: "office signed scan",
    file: {
      name: "office-signoff.pdf",
      type: "application/pdf",
      size: 24,
      contentDataUrl: "data:application/pdf;base64,JVBERi1TSUdOT0ZGCg==",
    },
  });
  assert.equal(signoffAttachmentInput.ownerType, "v1_signoff_boundary");
  assert.equal(signoffAttachmentInput.ownerId, "signoff:办公室");
  assert.equal(signoffAttachmentInput.purpose, "v1_signoff_boundary");
  const signoffAttachmentListInput = createV1SignoffBoundaryAttachmentListInput({
    signoffItem: {
      type: "signoff",
      key: "办公室",
    },
    operatorId: "U-MANAGER-A",
  });
  assert.equal(signoffAttachmentListInput.ownerType, "v1_signoff_boundary");
  assert.equal(signoffAttachmentListInput.ownerId, signoffAttachmentInput.ownerId);
  assert.equal(signoffAttachmentListInput.purpose, "v1_signoff_boundary");
  const signoffAttachmentResult = await createOfficeAttachment(
    {
      ...signoffAttachmentInput,
      authState: null,
    },
    { apiBaseUrl },
  );
  assert.equal(signoffAttachmentResult.source, "api", "V1 signoff/boundary attachment should use the backend API");
  assert.match(signoffAttachmentResult.attachment.attachmentId, /^ATT-/, "V1 signoff attachments must get backend ATT-* ids");
  assert.equal(signoffAttachmentResult.attachment.ownerType, "v1_signoff_boundary");
  assert.equal(signoffAttachmentResult.attachment.purpose, "v1_signoff_boundary");
  const signoffAttachmentListResult = await listOfficeAttachments(
    {
      ...signoffAttachmentListInput,
      authState: null,
    },
    { apiBaseUrl },
  );
  assert.equal(signoffAttachmentListResult.source, "api", "V1 signoff/boundary attachments must be listed from the backend API");
  assert.equal(signoffAttachmentListResult.items.length, 1, "V1 signoff/boundary list should return the uploaded attachment");
  assert.equal(signoffAttachmentListResult.items[0].attachmentId, signoffAttachmentResult.attachment.attachmentId);
  assert.equal(signoffAttachmentListResult.items[0].ownerType, "v1_signoff_boundary");
  assert.equal(signoffAttachmentListResult.items[0].purpose, "v1_signoff_boundary");
  assert.doesNotMatch(
    JSON.stringify(signoffAttachmentListResult),
    /JVBER|attachment-objects|\.erp-local-storage|\/private|\/Users/,
  );

  const clientSignoffResult = await stageOfficeV1FieldEvidenceIntakeRow(
    {
      operatorId: "U-MANAGER-A",
      row: {
        rowType: "signoff",
        role: "办公室",
        onsiteStatus: "signed",
        onsiteSigner: "办公室负责人",
        onsiteSignedAt: "2026-07-06T10:00",
        onsiteNotes: `signoff attachment ${signoffAttachmentResult.attachment.attachmentId}`,
      },
    },
    { apiBaseUrl },
  );
  assert.equal(clientSignoffResult.source, "api");
  assert.equal(clientSignoffResult.blocked, false);
  assert.equal(clientSignoffResult.stageResult.statusLabel, "草稿已保存");
  assert.equal(clientSignoffResult.stageResult.row.type, "signoff");
  assert.equal(clientSignoffResult.stageResult.row.personFilled, true);
  assert.equal(clientSignoffResult.stageResult.row.timeFilled, true);
  assert.equal(clientSignoffResult.stageResult.summary.evidenceProgress, "1/40");
  assert.equal(clientSignoffResult.stageResult.summary.signoffProgress, "1/6");
  assert.equal(clientSignoffResult.stageResult.summary.releaseCandidateRefreshed, false);
  assert.equal(clientSignoffResult.stageResult.evidenceCloseout.evidenceProgress, "1/40");
  assert.equal(clientSignoffResult.stageResult.evidenceCloseout.ready, false);
  assert.equal(clientSignoffResult.stageResult.evidenceCloseout.missingEvidenceRows, 39);
  assert.ok(clientSignoffResult.stageResult.evidenceCloseout.actionCount > 0);
  assert.ok(clientSignoffResult.stageResult.evidenceCloseout.actions.length > 0);
  assert.equal(
    clientSignoffResult.stageResult.evidenceCloseout.actionShownCount,
    clientSignoffResult.stageResult.evidenceCloseout.actions.length,
  );
  assert.equal(clientSignoffResult.stageResult.evidenceCloseout.actionLabel, "5/39");
  assert.equal(clientSignoffResult.stageResult.closeout.signoffProgress, "1/6");
  assert.equal(clientSignoffResult.stageResult.closeout.missingSignoffRows, 5);
  assert.equal(clientSignoffResult.stageResult.closeout.boundaryReady, false);
  assert.equal(clientSignoffResult.stageResult.closeout.signoffBoundarySummary.signoffProgressLabel, "1/6");
  assert.equal(clientSignoffResult.stageResult.closeout.signoffBoundarySummary.missingSignoffCount, 5);
  assert.equal(clientSignoffResult.stageResult.closeout.signoffBoundarySummary.actionLabel, "5/6");
  assert.equal(clientSignoffResult.stageResult.closeout.signoffBoundarySummary.previewActions.length, 3);
  assert.ok(clientSignoffResult.stageResult.closeout.actionCount > 0);
  assert.ok(clientSignoffResult.stageResult.closeout.actions.length > 0);
  assert.equal(
    clientSignoffResult.stageResult.closeout.actionShownCount,
    clientSignoffResult.stageResult.closeout.actions.length,
  );
  assert.equal(clientSignoffResult.stageResult.closeout.actionLabel, "5/6");
  assert.ok(clientSignoffResult.stageResult.closeout.actions.every((item) => ["signoff", "boundary"].includes(item.type)));
  assert.equal(clientSignoffResult.stageResult.closeout.safeguards.rawSignersIncluded, false);
  assert.equal(clientSignoffResult.stageResult.safeguards.rawSignersIncluded, false);
  assert.doesNotMatch(JSON.stringify(clientSignoffResult.stageResult), /办公室负责人|signoff attachment|\.erp-local-storage|\/private|\/Users/);
  assert.match(readFileSync(join(intakeRoot, "signoff-boundary.csv"), "utf8"), /办公室负责人/);
  assert.match(readFileSync(join(intakeRoot, "signoff-boundary.csv"), "utf8"), new RegExp(signoffAttachmentResult.attachment.attachmentId));
} finally {
  await closeTestServer(server, { forceAfterMs: 1_000 });
  restoreEnvValue("ERP_V1_GO_LIVE_ARTIFACT_ROOT", originalArtifactRoot);
  rmSync(artifactRoot, { recursive: true, force: true });
}

function restoreEnvValue(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
