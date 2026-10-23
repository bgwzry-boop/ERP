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

// Hold both writes open so the second request cannot depend on the first append.
const {createWorkspaceRecordService}=await import('../server/services/workspaceRecordService.mjs');
const records=createWorkspaceRecordService();
const concurrentService=createAttachmentFileAccessService({...records});
const pending=[];
const concurrentWorkspace={...workspace,attachmentObjectStorage:{readObject:async()=>({buffer:Buffer.from("test")})},operationLogs:[],attachmentAccessLogs:[],attachmentAccessAuditRepository:{
  recordAccessLog({accessLog}) { return new Promise(resolve=>pending.push({accessLog,resolve})); }
}};
const reads=[0,1].map(()=>concurrentService.getContent({workspace:concurrentWorkspace,attachmentId:'ATT-1',operatorId:'U-FINANCE',accessMode:'permission'}));
for(let attempt=0;attempt<100 && pending.length<2;attempt++) await new Promise(resolve=>setImmediate(resolve));
assert.equal(pending.length,2);
assert.equal(concurrentWorkspace.operationLogs.length,0,"Pending writes must not publish successful operation evidence");
assert.notEqual(pending[0].accessLog.logId,pending[1].accessLog.logId,'Concurrent reads must have independent access audit identities');
assert.notEqual(pending[0].accessLog.operationLogId,pending[1].accessLog.operationLogId);
for(const entry of pending) entry.resolve(entry.accessLog);
await Promise.all(reads);
console.log('PASS concurrent attachment reads retain independent audit identities before either audit write completes.');

const retainedLog={id:'LOG-existing',action:'existing'};
const failureWorkspace={...concurrentWorkspace,operationLogs:[retainedLog],attachmentAccessAuditRepository:{
 async recordAccessLog(){
   failureWorkspace.operationLogs.push({id:'LOG-unrelated',action:'another concurrent operation'});
   throw new Error('audit storage unavailable');
 }
}};
await assert.rejects(concurrentService.getContent({workspace:failureWorkspace,attachmentId:'ATT-1',operatorId:'U-FINANCE',accessMode:'permission'}),/audit storage unavailable/);
assert.deepEqual(failureWorkspace.operationLogs.map(row=>row.id),['LOG-existing','LOG-unrelated']);
console.log('PASS failed access audit exposes no successful operation log and preserves unrelated concurrent operations.');
