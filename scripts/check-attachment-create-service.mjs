import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parseDataUrl } from "../server/attachmentObjectStorage.mjs";
import {
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
    { purpose: "payment_screenshot", fileName: "proof.png", fileType: "image", fileSize: 9 * 1024 * 1024 },
    null,
  )?.code,
  "ATTACHMENT_FILE_TOO_LARGE",
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

console.log("Attachment create service check passed: validation, digesting, object storage, deduplication, and idempotent IDs are covered.");

function createWorkspace({ storageCalls = [], existingAttachment = null } = {}) {
  return {
    attachments: [],
    operationLogs: [],
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
      async findAttachmentByDigest() {
        return existingAttachment;
      },
      async createAttachment(input) {
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
