import assert from "node:assert/strict";
import { createAttachmentFileAccessService } from "../server/services/attachmentFileAccessService.mjs";

const fixedNow = "2026-07-14T10:00:00.000Z";
const calls = { find: [], list: [], createUrl: [], read: [], record: [], accessList: [] };
const attachment = {
  attachmentId: "ATT-1",
  ownerType: "statement",
  ownerId: "ST-1",
  fileType: "image",
  purpose: "payment_screenshot",
  fileName: "payment.png",
  mimeType: "image/png",
  fileSize: 12,
  url: "/api/attachments/ATT-1/content",
  hasContent: true,
  storageProvider: "object_storage",
  storageKey: "private/attachments/ATT-1/payment.png",
  contentDigest: "sha256:test",
  thumbnailStorageKey: "private/thumbnails/ATT-1.webp",
  thumbnailUrl: "/api/attachments/ATT-1/thumbnail",
  signedUrlExpiresAt: "",
  metadata: { source: "office" },
  status: "uploaded",
  uploadedBy: "U-FINANCE",
  uploadedAt: fixedNow,
};
const workspace = {
  attachments: [attachment],
  attachmentAccessLogs: [],
  operationLogs: [],
  attachmentRepository: {
    async findAttachmentById(input) {
      calls.find.push(input);
      return input.attachmentId === attachment.attachmentId ? attachment : null;
    },
    async listAttachments(input) {
      calls.list.push(input);
      return [attachment, { ...attachment, attachmentId: "ATT-2", storageKey: "", thumbnailStorageKey: "", metadata: [] }];
    },
  },
  attachmentObjectStorage: {
    async createAccessUrl(input) {
      calls.createUrl.push(input);
      return {
        accessUrl: "/api/attachments/ATT-1/content?accessToken=safe",
        expiresAt: "2026-07-14T10:01:00.000Z",
        deliveryMode: "api_proxy",
      };
    },
    async readObject(input) {
      calls.read.push(input);
      return { buffer: Buffer.from("image-data"), contentType: "application/octet-stream" };
    },
  },
  attachmentAccessAuditRepository: {
    async recordAccessLog(input) {
      calls.record.push(input);
      workspace.attachmentAccessLogs.unshift(input.accessLog);
      return input.accessLog;
    },
    async listAccessLogs(input) {
      calls.accessList.push(input);
      return { items: workspace.attachmentAccessLogs, total: workspace.attachmentAccessLogs.length };
    },
  },
};

assert.throws(() => createAttachmentFileAccessService(), /addOperationLog must be a function/);
const service = createAttachmentFileAccessService({
  addOperationLog(currentWorkspace, input) {
    const log = { id: `LOG-${currentWorkspace.operationLogs.length + 1}`, ...input, occurredAt: fixedNow };
    currentWorkspace.operationLogs.unshift(log);
    return log.id;
  },
  nextId(prefix, rows) {
    return `${prefix}-${rows.length + 1}`;
  },
  now: () => fixedNow,
});

const listResult = await service.listAttachments({
  workspace,
  filters: { ownerType: "statement", ownerId: "ST-1" },
});
assert.equal(calls.list.length, 1);
assert.deepEqual(calls.list[0].filters, { ownerType: "statement", ownerId: "ST-1" });
assert.equal(listResult.items.length, 2);
assert.equal(listResult.items[0].storageKeyStored, true);
assert.equal(listResult.items[0].thumbnailStored, true);
assert.equal(listResult.items[1].storageKeyStored, false);
assert.deepEqual(listResult.items[1].metadata, {});
assert.equal(Object.hasOwn(listResult.items[0], "storageKey"), false);
assert.equal(Object.hasOwn(listResult.items[0], "thumbnailStorageKey"), false);

const accessResult = await service.createAccessUrl({
  workspace,
  attachmentId: "ATT-1",
  ttlSeconds: 10,
  operatorId: "U-FINANCE",
});
assert.equal(accessResult.response.ttlSeconds, 60);
assert.equal(accessResult.response.storageKeyStored, true);
assert.equal(Object.hasOwn(accessResult.response, "storageKey"), false);
assert.equal(calls.createUrl[0].storageKey, attachment.storageKey);
assert.equal(calls.createUrl[0].ttlSeconds, 60);
assert.equal(calls.record.length, 1);
assert.equal(calls.record[0].accessLog.storageKey, attachment.storageKey);
assert.equal(workspace.operationLogs[0].after.storageKeyStored, true);
assert.equal(Object.hasOwn(workspace.operationLogs[0].after, "storageKey"), false);

const contentResult = await service.getContent({
  workspace,
  attachmentId: "ATT-1",
  operatorId: "U-OFFICE",
  accessMode: "signed_url",
});
assert.equal(contentResult.file.body.toString("utf8"), "image-data");
assert.equal(contentResult.file.options.contentType, "image/png");
assert.equal(contentResult.file.options.fileName, "payment.png");
assert.equal(calls.record[1].accessLog.operatorId, "SIGNED_URL");
assert.equal(calls.record[1].accessLog.deliveryMode, "api_proxy_signed_url");

const logsResult = await service.listAccessLogs({ workspace, attachmentId: "ATT-1", limit: 500 });
assert.equal(calls.accessList[0].limit, 100);
assert.equal(logsResult.response.total, 2);
assert.equal(logsResult.response.items[0].storageKeyStored, true);
assert.equal(Object.hasOwn(logsResult.response.items[0], "storageKey"), false);

assert.equal((await service.createAccessUrl({ workspace, attachmentId: "ATT-MISSING" })).code, "ATTACHMENT_NOT_FOUND");
assert.equal((await service.listAccessLogs({ workspace, attachmentId: "ATT-MISSING" })).code, "ATTACHMENT_NOT_FOUND");
assert.equal((await service.getContent({ workspace, attachmentId: "ATT-MISSING" })).code, "ATTACHMENT_NOT_FOUND");

const emptyAttachment = { ...attachment, attachmentId: "ATT-EMPTY", hasContent: false, storageKey: "" };
workspace.attachmentRepository.findAttachmentById = async ({ attachmentId }) =>
  attachmentId === emptyAttachment.attachmentId ? emptyAttachment : attachmentId === attachment.attachmentId ? attachment : null;
assert.equal(
  (await service.createAccessUrl({ workspace, attachmentId: "ATT-EMPTY", operatorId: "U-OFFICE" })).code,
  "ATTACHMENT_CONTENT_NOT_FOUND",
);
workspace.attachmentObjectStorage.readObject = async () => null;
assert.equal(
  (await service.getContent({ workspace, attachmentId: "ATT-EMPTY", operatorId: "U-OFFICE", accessMode: "permission" })).code,
  "ATTACHMENT_CONTENT_NOT_FOUND",
);

console.log(
  "Attachment file-access service checks passed: list redaction, access URLs, content reads, audit persistence, bounds, and missing records are isolated.",
);
