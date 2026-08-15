import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parseDataUrl } from "../server/attachmentObjectStorage.mjs";
import {
  createAttachmentCommandService,
  createAttachmentRecord,
  inferAttachmentFileType,
  validateAttachmentUploadBody,
} from "../server/services/attachmentCreateService.mjs";

const imageDataUrl = "data:image/png;base64,cGF5bWVudC1wcm9vZg==";
const expectedDigest = createHash("sha256").update("payment-proof").digest("hex");
const baseBody = {
  ownerType: "statement",
  ownerId: "STMT-001",
  fileType: "image",
  purpose: "payment_screenshot",
  fileName: "proof.png",
  contentRef: "payment-proof",
  uploadedBy: "U-OFFICE-A",
  contentDataUrl: imageDataUrl,
  idempotencyKey: "attachment-check-001",
  metadata: { source: "check" },
  remark: "付款截图",
};

assert.equal(inferAttachmentFileType({ fileName: "statement.xlsx" }), "spreadsheet");
assert.equal(inferAttachmentFileType({ mimeType: "application/pdf" }), "pdf");
assert.equal(
  validateAttachmentUploadBody(
    { purpose: "payment_screenshot", fileName: "proof.pdf", fileType: "pdf", mimeType: "application/pdf" },
    null,
  )?.code,
  "ATTACHMENT_FILE_TYPE_NOT_ALLOWED",
);
assert.equal(
  validateAttachmentUploadBody(
    { purpose: "raw_material_delivery_note", fileName: "note.pdf", fileType: "pdf", mimeType: "application/pdf", fileSize: 1024 },
    { buffer: Buffer.from("pdf"), contentType: "application/pdf" },
  ),
  null,
);
assert.equal(
  validateAttachmentUploadBody(
    { purpose: "raw_material_delivery_note", fileName: "note.xlsx", fileType: "spreadsheet", mimeType: "application/vnd.ms-excel" },
    null,
  )?.code,
  "ATTACHMENT_FILE_EXTENSION_NOT_ALLOWED",
);
assert.equal(
  validateAttachmentUploadBody(
    { purpose: "payment_screenshot", fileName: "proof.png", fileType: "image", fileSize: 31 * 1024 * 1024 },
    null,
  )?.code,
  "ATTACHMENT_FILE_TOO_LARGE",
);
assert.equal(
  validateAttachmentUploadBody(
    { purpose: "print_artwork", fileName: "approved.psd", fileType: "other", mimeType: "application/octet-stream", fileSize: 200 * 1024 * 1024 },
    { buffer: Buffer.alloc(1), contentType: "application/octet-stream" },
  ),
  null,
);
assert.equal(
  validateAttachmentUploadBody(
    { purpose: "print_artwork", fileName: "approved.zip", fileType: "other", mimeType: "application/octet-stream", fileSize: 1024 },
    { buffer: Buffer.alloc(1), contentType: "application/octet-stream" },
  )?.code,
  "ATTACHMENT_FILE_EXTENSION_NOT_ALLOWED",
);

const missing = await createAttachmentRecord({
  workspace: createWorkspace(),
  body: {},
  parseDataUrl,
  buildOperationLog,
  nextId,
});
assert.equal(missing.ok, false);
assert.equal(missing.errorCode, "VALIDATION_ERROR");

const invalidDataUrl = await createAttachmentRecord({
  workspace: createWorkspace(),
  body: { ...baseBody, contentDataUrl: "not-a-data-url" },
  parseDataUrl,
  buildOperationLog,
  nextId,
});
assert.equal(invalidDataUrl.ok, false);
assert.equal(invalidDataUrl.message, "contentDataUrl must be a valid data URL");

const noContentPayment = await createAttachmentRecord({
  workspace: createWorkspace(),
  body: { ...baseBody, contentDataUrl: "", idempotencyKey: "attachment-check-no-content" },
  parseDataUrl,
  buildOperationLog,
  nextId,
});
assert.equal(noContentPayment.ok, false);
assert.equal(noContentPayment.errorCode, "ATTACHMENT_CONTENT_REQUIRED");

const storageCalls = [];
const workspace = createWorkspace({ storageCalls });
const created = await createAttachmentRecord({
  workspace,
  body: baseBody,
  parseDataUrl,
  buildOperationLog,
  nextId,
  now: new Date("2026-07-11T08:00:00.000Z"),
});
const expectedAttachmentId = `ATT-${createHash("sha256").update(baseBody.idempotencyKey).digest("hex").slice(0, 24).toUpperCase()}`;
assert.equal(created.ok, true);
assert.equal(created.attachment.attachmentId, expectedAttachmentId);
assert.equal(created.attachment.fileType, "image");
assert.equal(created.attachment.fileSize, Buffer.byteLength("payment-proof"));
assert.equal(created.attachment.contentDigest, expectedDigest);
assert.equal(created.attachment.storageProvider, "check_storage");
assert.equal(created.attachment.contentDataUrl, "");
assert.equal(created.attachment.uploadedAt, "2026-07-11T08:00:00.000Z");
assert.equal(created.operationLogId, `LOG-${expectedAttachmentId}`);
assert.equal(storageCalls.length, 1);
assert.equal(storageCalls[0].contentDigest, expectedDigest);

const existingAttachment = { ...created.attachment, attachmentId: "ATT-EXISTING-001" };
const deduplicatedWorkspace = createWorkspace({
  storageCalls,
  existingAttachment,
});
const deduplicated = await createAttachmentRecord({
  workspace: deduplicatedWorkspace,
  body: { ...baseBody, idempotencyKey: "attachment-check-duplicate" },
  parseDataUrl,
  buildOperationLog,
  nextId,
  now: new Date("2026-07-11T08:05:00.000Z"),
});
assert.equal(deduplicated.ok, true);
assert.equal(deduplicated.deduplicated, true);
assert.equal(deduplicated.duplicateOfAttachmentId, existingAttachment.attachmentId);
assert.equal(storageCalls.length, 1, "known content should not be written to object storage twice");

const commandWorkspace = createWorkspace();
const attachmentCommandService = createAttachmentCommandService({ parseDataUrl, buildOperationLog, nextId });
const commandResult = await attachmentCommandService.createAttachment({
  workspace: commandWorkspace,
  body: { ...baseBody, uploadedBy: "U-CLIENT-SPOOF", idempotencyKey: "attachment-command-check" },
  operatorId: "U-AUTHENTICATED",
});
assert.equal(commandResult.ok, true);
assert.equal(commandResult.attachment.uploadedBy, "U-AUTHENTICATED");

const unknownPostgresUploader = await createAttachmentRecord({
  workspace: createWorkspace({ repositoryKind: "postgres", users: [] }),
  body: { ...baseBody, uploadedBy: "U-OFFICE-B", idempotencyKey: "attachment-unknown-uploader" },
  parseDataUrl,
  buildOperationLog,
  nextId,
});
assert.equal(unknownPostgresUploader.ok, false);
assert.equal(unknownPostgresUploader.statusCode, 409);
assert.equal(unknownPostgresUploader.errorCode, "ATTACHMENT_UPLOADER_NOT_REGISTERED");
assert.doesNotMatch(unknownPostgresUploader.message, /foreign key|attachments_uploaded_by_fkey/i);

const foreignKeyFailure = await createAttachmentRecord({
  workspace: createWorkspace({
    repositoryKind: "postgres",
    users: [{ userId: "U-OFFICE-B" }],
    createAttachmentError: Object.assign(
      new Error('insert or update on table "attachments" violates foreign key constraint "attachments_uploaded_by_fkey"'),
      { code: "23503", constraint: "attachments_uploaded_by_fkey" },
    ),
  }),
  body: { ...baseBody, uploadedBy: "U-OFFICE-B", idempotencyKey: "attachment-fk-uploader" },
  parseDataUrl,
  buildOperationLog,
  nextId,
});
assert.equal(foreignKeyFailure.ok, false);
assert.equal(foreignKeyFailure.errorCode, "ATTACHMENT_UPLOADER_NOT_REGISTERED");
assert.doesNotMatch(foreignKeyFailure.message, /foreign key|attachments_uploaded_by_fkey/i);
assert.throws(() => createAttachmentCommandService(), /parseDataUrl must be a function/);

console.log("Attachment create service check passed: validation, authenticated ownership, digesting, object storage, deduplication, and idempotent IDs are covered.");

function createWorkspace({
  storageCalls = [],
  existingAttachment = null,
  repositoryKind = "local_memory",
  users = [],
  createAttachmentError = null,
} = {}) {
  return {
    attachments: [],
    operationLogs: [],
    users,
    attachmentObjectStorage: {
      async putObject(input) {
        storageCalls.push(input);
        return {
          storageProvider: "check_storage",
          storageKey: `attachments/${input.contentDigest}`,
          contentDigest: input.contentDigest,
        };
      },
    },
    attachmentRepository: {
      kind: repositoryKind,
      async findAttachmentByDigest() {
        return existingAttachment;
      },
      async createAttachment(input) {
        if (createAttachmentError) throw createAttachmentError;
        return {
          attachment: existingAttachment ?? input.attachment,
          deduplicated: Boolean(existingAttachment),
          operationLogId: input.operationLog.id,
        };
      },
    },
  };
}

function buildOperationLog(_workspace, input) {
  return {
    ...input,
    occurredAt: "2026-07-11T08:00:00.000Z",
    createdAt: "2026-07-11T08:00:00.000Z",
  };
}

function nextId(prefix, rows) {
  return `${prefix}-${String(rows.length + 1).padStart(3, "0")}`;
}
