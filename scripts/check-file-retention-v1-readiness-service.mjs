import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildAttachmentV1Readiness,
  buildStatementExportV1Readiness,
  runAttachmentStorageDiagnostics,
  runStatementExportStorageDiagnostics,
} from "../server/services/fileRetentionV1ReadinessService.mjs";

const fixedDate = new Date("2026-07-12T12:00:00.000Z");
const now = () => fixedDate;
const random = () => 0.123456;
const operatorId = "U-V1-TECHNICAL";

for (const subject of buildSubjects("object_storage")) {
  const readiness = await subject.build({
    workspace: subject.workspace("production"),
    operatorId,
    env: {},
    now,
    random,
  });
  assert.equal(readiness.ready, true, `${subject.label} object storage should be ready`);
  assert.equal(readiness.summary.label, "5/5 通过");
  assert.equal(readiness.storageMode.objectStorageLive, true);
  assert.equal(readiness.storageMode.localFsAcceptedForV1, false);
  assert.equal(readiness.safeguards.requiresObjectStorageLive, true);
  assert.equal(readiness.safeguards.diagnosticObjectCleanedUp, true);
  assert.equal(readiness.diagnostics.cleanupOk, true);
  assertNoDiagnosticPayload(readiness);
}

for (const subject of buildSubjects("local_fs")) {
  const demoReadiness = await subject.build({
    workspace: subject.workspace("demo", { localFsAccepted: true, acceptanceReference: "DEMO-ONLY" }),
    operatorId,
    env: {},
    now,
    random,
  });
  assert.equal(demoReadiness.ready, true, `${subject.label} demo acceptance should remain available`);
  assert.equal(demoReadiness.storageMode.localFsAcceptedForV1, true);
  assert.equal(demoReadiness.storageMode.localFsAcceptanceIgnoredInProduction, false);

  const productionReadiness = await subject.build({
    workspace: subject.workspace("production", { localFsAccepted: true, acceptanceReference: "MUST-BE-IGNORED" }),
    operatorId,
    env: subject.acceptanceEnv,
    now,
    random,
  });
  assert.equal(productionReadiness.ready, false, `${subject.label} production local storage must be blocked`);
  assert.equal(productionReadiness.summary.label, "4/5 通过");
  assert.equal(productionReadiness.storageMode.localFsAcceptedForV1, false);
  assert.equal(productionReadiness.storageMode.localFsAcceptanceDeclared, true);
  assert.equal(productionReadiness.storageMode.localFsAcceptanceIgnoredInProduction, true);
  assert.equal(productionReadiness.safeguards.localStorageAcceptanceIgnoredInProduction, true);
  assert.ok(
    productionReadiness.blockingCriteria.some(
      (item) => item.key.endsWith("production-retention-mode") && item.detail.includes("production 禁止"),
    ),
  );
  assertNoDiagnosticPayload(productionReadiness);
}

const unconfiguredAttachment = await buildAttachmentV1Readiness({
  workspace: {
    runtimeConfig: { mode: "production" },
    attachmentObjectStorage: { kind: "object_storage", configured: false, missingFields: ["bucket"] },
  },
  operatorId,
  env: {},
  now,
  random,
});
assert.equal(unconfiguredAttachment.ready, false);
assert.equal(unconfiguredAttachment.diagnostics.configured, false);
assert.deepEqual(unconfiguredAttachment.diagnostics.missingConfigFields, ["bucket"]);

const cleanupFailure = await buildStatementExportV1Readiness({
  workspace: {
    runtimeConfig: { mode: "production" },
    statementExportObjectStorage: createStatementExportStorage("object_storage", { failCleanup: true }),
  },
  operatorId,
  env: {},
  now,
  random,
});
assert.equal(cleanupFailure.ready, false);
assert.equal(cleanupFailure.diagnostics.ready, true);
assert.equal(cleanupFailure.diagnostics.cleanupOk, false);
assert.ok(cleanupFailure.blockingCriteria.some((item) => item.key === "statement-export-storage-cleanup"));

const attachmentError = await runAttachmentStorageDiagnostics(createFailingAttachmentStorage(), { now, random });
assert.equal(attachmentError.ready, false);
assert.equal(attachmentError.error.code, "ATTACHMENT_STORAGE_DIAGNOSTIC_FAILED");
assert.doesNotMatch(attachmentError.error.message, /SECRET-ATTACHMENT/);

const statementError = await runStatementExportStorageDiagnostics(createFailingStatementStorage(), { now, random });
assert.equal(statementError.ready, false);
assert.equal(statementError.error.code, "STATEMENT_EXPORT_STORAGE_DIAGNOSTIC_FAILED");
assert.doesNotMatch(statementError.error.message, /SECRET-STATEMENT/);

console.log("file-retention V1 readiness service checks passed");

function buildSubjects(kind) {
  return [
    {
      label: "attachment",
      build: buildAttachmentV1Readiness,
      acceptanceEnv: { ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTED: "true" },
      workspace: (mode, options = {}) => ({
        runtimeConfig: { mode },
        attachmentObjectStorage: createAttachmentStorage(kind),
        attachmentV1ReadinessOptions: options,
      }),
    },
    {
      label: "statement export",
      build: buildStatementExportV1Readiness,
      acceptanceEnv: { ERP_STATEMENT_EXPORT_LOCAL_FS_V1_ACCEPTED: "true" },
      workspace: (mode, options = {}) => ({
        runtimeConfig: { mode },
        statementExportObjectStorage: createStatementExportStorage(kind),
        statementExportV1ReadinessOptions: options,
      }),
    },
  ];
}

function createAttachmentStorage(kind) {
  let buffer = null;
  return {
    kind,
    provider: kind,
    configured: true,
    async putObject({ contentPayload }) {
      buffer = contentPayload.buffer;
      return { storageProvider: kind, storageKey: "diagnostic/attachment", contentDigest: digest(buffer) };
    },
    async readObject() {
      return { buffer };
    },
    async deleteObject() {},
  };
}

function createStatementExportStorage(kind, { failCleanup = false } = {}) {
  let buffer = null;
  return {
    kind,
    provider: kind,
    configured: true,
    async putExportFile({ exportFile }) {
      buffer = Buffer.from(exportFile.content, "base64");
      return { storageProvider: kind, storageKey: "diagnostic/statement", contentDigest: `sha256:${digest(buffer)}` };
    },
    async readExportFile() {
      return { buffer };
    },
    async deleteExportFile() {
      if (failCleanup) throw new Error("delete denied");
    },
  };
}

function createFailingAttachmentStorage() {
  return {
    kind: "object_storage",
    configured: true,
    async putObject() {
      throw new Error("secretAccessKey=SECRET-ATTACHMENT, upload failed");
    },
    async readObject() {
      return null;
    },
  };
}

function createFailingStatementStorage() {
  return {
    kind: "object_storage",
    configured: true,
    async putExportFile() {
      throw new Error("authorization Bearer SECRET-STATEMENT; upload failed");
    },
    async readExportFile() {
      return null;
    },
  };
}

function assertNoDiagnosticPayload(readiness) {
  const serialized = JSON.stringify(readiness);
  assert.doesNotMatch(serialized, /diagnosticStorageKey|diagnosticAttachmentId|diagnosticExportFileId/);
  assert.doesNotMatch(serialized, /expectedDigest|readDigest|contentDigest/);
}

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
