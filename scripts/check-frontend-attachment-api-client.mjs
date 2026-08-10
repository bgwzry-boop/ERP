import { createLocalSeedAuthState } from "../src/services/officeAuthService.js";
import {
  createOfficeAttachment,
  createOfficeAttachmentAccessUrl,
  createInventoryCorrectionEvidenceAttachmentInput,
  createMaintenanceEvidenceAttachmentInput,
  createPaymentScreenshotAttachmentInput,
  createPrintArtworkAttachmentInput,
  downloadOfficeAttachmentContent,
  listOfficeAttachmentAccessLogs,
  listOfficeAttachments,
  uploadOfficeAttachmentFile,
  validateAttachmentUploadInput,
} from "../src/services/officeAttachmentApiClient.js";
import {
  confirmStatementPayment,
  syncStatementPaymentAttachments,
  updateStatementPaymentAttachmentPreview,
} from "../src/state/officeStatementActions.js";

const authState = createLocalSeedAuthState("U-FINANCE-A");
const statement = { id: "ST-0629-002", customerId: "C002", receivable: 108000, received: 0 };
const selectedFile = {
  name: "lisi-payment-wechat.png",
  type: "image/png",
  size: 24680,
  lastModified: 1782871200000,
  contentDataUrl: "data:image/png;base64,cGF5bWVudC1wcm9vZg==",
};
const paymentInput = createPaymentScreenshotAttachmentInput({
  statement,
  operatorId: "U-FINANCE-A",
  remark: "付款截图 API client check",
  file: selectedFile,
});

assert(paymentInput.ownerType === "statement", "payment screenshot attachment should link to the statement before payment creation");
assert(paymentInput.ownerId === "ST-0629-002", "payment screenshot ownerId is incorrect");
assert(paymentInput.purpose === "payment_screenshot", "payment screenshot purpose is incorrect");
assert(paymentInput.fileType === "image", "payment screenshot file type is incorrect");
assert(paymentInput.fileName === selectedFile.name, "payment screenshot selected filename was not used");
assert(paymentInput.mimeType === selectedFile.type, "payment screenshot mime type was not stored");
assert(paymentInput.fileSize === selectedFile.size, "payment screenshot file size was not stored");
assert(paymentInput.contentDataUrl === selectedFile.contentDataUrl, "payment screenshot content data URL was not stored");
assert(paymentInput.contentRef.includes(encodeURIComponent(selectedFile.name)), "payment screenshot contentRef should include the selected filename");
assert(validateAttachmentUploadInput(paymentInput) === null, "valid payment screenshot should pass frontend attachment validation");
assert(
  validateAttachmentUploadInput({ ...paymentInput, contentDataUrl: "", fileSize: undefined })?.code === "ATTACHMENT_CONTENT_REQUIRED",
  "payment screenshot without a real file should fail frontend validation",
);

const correctionEvidenceInput = createInventoryCorrectionEvidenceAttachmentInput({
  correctionDraftId: "ADJ-ATTACHMENT-1",
  operatorId: "U-WAREHOUSE-A",
  remark: "盘点照片",
  file: { ...selectedFile, name: "inventory-count.png" },
});
assert(correctionEvidenceInput.ownerType === "inventory_correction", "correction evidence owner type is incorrect");
assert(correctionEvidenceInput.ownerId === "ADJ-ATTACHMENT-1", "correction evidence owner ID is incorrect");
assert(correctionEvidenceInput.purpose === "inventory_correction_evidence", "correction evidence purpose is incorrect");
assert(validateAttachmentUploadInput(correctionEvidenceInput) === null, "correction image evidence should pass validation");
assert(
  validateAttachmentUploadInput({
    ...correctionEvidenceInput,
    fileName: "inventory-count.pdf",
    mimeType: "application/pdf",
    fileType: "pdf",
    contentDataUrl: "data:application/pdf;base64,JVBERi0xLjQ=",
  }) === null,
  "correction PDF evidence should pass validation",
);
assert(
  validateAttachmentUploadInput({
    ...correctionEvidenceInput,
    fileName: "inventory-count.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileType: "spreadsheet",
  })?.code === "ATTACHMENT_FILE_TYPE_NOT_ALLOWED",
  "correction spreadsheet evidence should be rejected",
);

const invalidPaymentAttachmentInput = {
  ...paymentInput,
  fileName: "payment-proof.pdf",
  mimeType: "application/pdf",
  fileType: "pdf",
  contentDataUrl: "data:application/pdf;base64,JVBERi0xLjQ=",
};
const invalidPaymentValidation = validateAttachmentUploadInput(invalidPaymentAttachmentInput);
assert(invalidPaymentValidation?.code === "ATTACHMENT_FILE_TYPE_NOT_ALLOWED", "payment screenshot PDF should fail local validation");

let invalidPaymentRequestSent = false;
const invalidPaymentResult = await createOfficeAttachment(
  {
    authState,
    ...invalidPaymentAttachmentInput,
  },
  {
    fetchImpl: async () => {
      invalidPaymentRequestSent = true;
      return createJsonResponse(200, {});
    },
  },
);
assert(invalidPaymentResult.source === "client_validation", "invalid payment screenshot should be blocked before API request");
assert(invalidPaymentResult.blocked === true, "invalid payment screenshot should be blocked");
assert(invalidPaymentRequestSent === false, "invalid payment screenshot should not call attachment API");

const tooLargePhotoValidation = validateAttachmentUploadInput({
  ownerType: "production_task",
  ownerId: "PT-001",
  fileType: "image",
  purpose: "finished_goods_photo",
  fileName: "finished-photo.jpg",
  mimeType: "image/jpeg",
  fileSize: 31 * 1024 * 1024,
  contentRef: "p0://production-finished-goods/PT-001/too-large",
  uploadedBy: "U-WORKSHOP-A",
});
assert(tooLargePhotoValidation?.code === "ATTACHMENT_FILE_TOO_LARGE", "oversized finished-goods photo should fail local validation");

const artworkInput = createPrintArtworkAttachmentInput({
  draftId: "DRAFT-ARTWORK-001",
  draftLine: { id: "LINE-01" },
  operatorId: "U-OFFICE-A",
  file: { name: "客户定稿.psd", type: "application/octet-stream", size: 200 * 1024 * 1024 },
});
assert(artworkInput.ownerType === "order_draft_line", "print artwork should bind the draft line");
assert(artworkInput.ownerId === "DRAFT-ARTWORK-001:LINE-01", "print artwork owner ID should include draft and line IDs");
assert(validateAttachmentUploadInput({ ...artworkInput, binaryContent: true }) === null, "200MB PSD should pass validation");
assert(
  validateAttachmentUploadInput({ ...artworkInput, fileSize: 200 * 1024 * 1024 + 1, binaryContent: true })?.code === "ATTACHMENT_FILE_TOO_LARGE",
  "PSD larger than 200MB should fail validation",
);
assert(
  validateAttachmentUploadInput({ ...artworkInput, fileName: "客户定稿.zip", binaryContent: true })?.code === "ATTACHMENT_FILE_EXTENSION_NOT_ALLOWED",
  "unsupported print artwork extension should fail validation",
);
let artworkBinaryCall = null;
const artworkUploadResult = await uploadOfficeAttachmentFile(
  { ...artworkInput, authState: { ...authState, session: { accessToken: "seed-session.artwork-check" } } },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      artworkBinaryCall = { url, init };
      return createJsonResponse(200, {
        attachmentId: "ATT-ARTWORK-001",
        ownerType: artworkInput.ownerType,
        ownerId: artworkInput.ownerId,
        fileType: artworkInput.fileType,
        purpose: artworkInput.purpose,
        fileName: artworkInput.fileName,
        mimeType: artworkInput.mimeType,
        fileSize: artworkInput.fileSize,
        hasContent: true,
        url: "/api/attachments/ATT-ARTWORK-001/content",
        status: "uploaded",
      });
    },
  },
);
assert(artworkUploadResult.attachment.attachmentId === "ATT-ARTWORK-001", "binary artwork response should be mapped");
assert(artworkBinaryCall.url.startsWith("http://127.0.0.1:8787/api/attachments/binary?"), "artwork should use the binary endpoint");
assert(artworkBinaryCall.init.body === artworkInput.file, "artwork binary body should be the selected file");
assert(artworkBinaryCall.init.headers["content-type"] === "application/octet-stream", "artwork MIME should be sent as the binary content type");
assert(artworkBinaryCall.init.headers.authorization === "Bearer seed-session.artwork-check", "artwork binary upload should use bearer auth");

const maintenanceEvidenceInput = createMaintenanceEvidenceAttachmentInput({
  taskId: "MT-PRINT-01",
  operatorId: "U-MAINTENANCE-A",
  remark: "维修完成照片",
  file: { ...selectedFile, name: "maintenance-result.jpg", type: "image/jpeg" },
});
assert(maintenanceEvidenceInput.ownerType === "maintenance_task", "maintenance photo should bind the maintenance task");
assert(maintenanceEvidenceInput.purpose === "maintenance_evidence", "maintenance photo purpose is incorrect");
assert(validateAttachmentUploadInput(maintenanceEvidenceInput) === null, "maintenance image should pass frontend validation");
assert(
  validateAttachmentUploadInput({ ...maintenanceEvidenceInput, contentDataUrl: "", fileSize: undefined })?.code === "ATTACHMENT_CONTENT_REQUIRED",
  "maintenance completion evidence must contain an actual image",
);

const calls = [];
const result = await createOfficeAttachment(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.attachment-check" },
    },
    ...paymentInput,
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        attachmentId: "ATT-001",
        ownerType: "statement",
        ownerId: "ST-0629-002",
        fileType: "image",
        purpose: "payment_screenshot",
        fileName: selectedFile.name,
        mimeType: selectedFile.type,
        fileSize: selectedFile.size,
        hasContent: true,
        storageProvider: "local_fs",
        storageKeyStored: true,
        contentDigest: "sha256-check",
        url: "/api/attachments/ATT-001/content",
        status: "uploaded",
        uploadedBy: "U-FINANCE-A",
        uploadedAt: "2026-07-01T00:00:00.000Z",
      });
    },
  },
);

assert(result.source === "api", "attachment creation did not use the API response");
assert(calls[0]?.url === "http://127.0.0.1:8787/api/attachments", "attachment API URL is incorrect");
assert(calls[0]?.init.method === "POST", "attachment API method is incorrect");
assert(calls[0]?.init.headers.authorization === "Bearer seed-session.attachment-check", "attachment API did not use bearer auth");
assert(calls[0]?.body.ownerType === "statement", "attachment request ownerType is incorrect");
assert(calls[0]?.body.purpose === "payment_screenshot", "attachment request purpose is incorrect");
assert(calls[0]?.body.uploadedBy === "U-FINANCE-A", "attachment request uploadedBy is incorrect");
assert(calls[0]?.body.fileName === selectedFile.name, "attachment request selected filename is incorrect");
assert(calls[0]?.body.mimeType === selectedFile.type, "attachment request mime type is incorrect");
assert(calls[0]?.body.fileSize === selectedFile.size, "attachment request file size is incorrect");
assert(calls[0]?.body.contentDataUrl === selectedFile.contentDataUrl, "attachment request content data URL is incorrect");
assert(result.attachment.attachmentId === "ATT-001", "attachment response was not mapped");
assert(result.attachment.fileName === selectedFile.name, "attachment response filename was not mapped");
assert(result.attachment.mimeType === selectedFile.type, "attachment response mime type was not mapped");
assert(result.attachment.fileSize === selectedFile.size, "attachment response file size was not mapped");
assert(result.attachment.url === "/api/attachments/ATT-001/content", "attachment content URL was not mapped");
assert(result.attachment.storageProvider === "local_fs", "attachment storage provider was not mapped");
assert(result.attachment.storageKey === "", "attachment client model exposed a raw storage key");
assert(result.attachment.storageKeyStored === true, "attachment storage status was not mapped");
assert(result.attachment.contentDigest === "sha256-check", "attachment content digest was not mapped");

const listCalls = [];
const listResult = await listOfficeAttachments(
  {
    authState,
    ownerType: "statement",
    ownerId: statement.id,
    purpose: "payment_screenshot",
    fileType: "image",
    operatorId: "U-FINANCE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      listCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [result.attachment],
        total: 1,
        page: 1,
        pageSize: 50,
      });
    },
  },
);
assert(listResult.source === "api", "attachment list did not use the API response");
assert(
  listCalls[0]?.url ===
    "http://127.0.0.1:8787/api/attachments?ownerType=statement&ownerId=ST-0629-002&purpose=payment_screenshot&fileType=image",
  "attachment list API URL is incorrect",
);
assert(listCalls[0]?.init.method === "GET", "attachment list API method is incorrect");
assert(listResult.items.length === 1, "attachment list did not map the returned item");
assert(listResult.items[0].attachmentId === result.attachment.attachmentId, "attachment list item id was not mapped");
assert(listResult.items[0].storageKey === "", "attachment list exposed a raw storage key");
assert(listResult.items[0].storageKeyStored === true, "attachment list storage status was not mapped");

const syncedProjection = syncStatementPaymentAttachments([statement], statement.id, listResult.items);
assert(syncedProjection[0].paymentAttachmentFiles.length === 1, "attachment list was not synced into statement payment files");
assert(syncedProjection[0].paymentEvidenceStatus.includes(selectedFile.name), "synced payment evidence status did not include the attachment filename");

const contentCalls = [];
const contentResult = await downloadOfficeAttachmentContent(
  {
    authState,
    attachmentId: result.attachment.attachmentId,
    operatorId: "U-FINANCE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      contentCalls.push({ url, init });
      return createTextResponse(200, "payment-proof", {
        "content-type": "image/png",
        "content-disposition": "inline; filename*=UTF-8''lisi-payment-wechat.png",
      });
    },
  },
);
assert(contentResult.source === "api", "attachment content did not use the API response");
assert(contentCalls[0]?.url === "http://127.0.0.1:8787/api/attachments/ATT-001/content", "attachment content API URL is incorrect");
assert(contentCalls[0]?.init.method === "GET", "attachment content API method is incorrect");
assert(contentResult.content === "payment-proof", "attachment content body was not mapped");
assert(contentResult.contentType === "image/png", "attachment content type was not mapped");

const accessUrlCalls = [];
const accessUrlResult = await createOfficeAttachmentAccessUrl(
  {
    authState,
    attachmentId: result.attachment.attachmentId,
    operatorId: "U-FINANCE-A",
    ttlSeconds: 120,
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      accessUrlCalls.push({ url, init });
      return createJsonResponse(200, {
        attachmentId: result.attachment.attachmentId,
        accessUrl:
          "/api/attachments/ATT-001/content?accessToken=signed-access-token&expiresAt=2026-07-01T00%3A15%3A00.000Z",
        expiresAt: "2026-07-01T00:15:00.000Z",
        ttlSeconds: 120,
        deliveryMode: "api_proxy",
        storageProvider: "local_fs",
        storageKeyStored: true,
        fileName: selectedFile.name,
        contentType: selectedFile.type,
        operationLogId: "OP-ACCESS-001",
      });
    },
  },
);
assert(accessUrlResult.source === "api", "attachment access-url did not use the API response");
assert(
  accessUrlCalls[0]?.url === "http://127.0.0.1:8787/api/attachments/ATT-001/access-url?ttlSeconds=120",
  "attachment access-url API URL is incorrect",
);
assert(accessUrlCalls[0]?.init.method === "GET", "attachment access-url API method is incorrect");
assert(accessUrlResult.access.deliveryMode === "api_proxy", "attachment access-url delivery mode was not mapped");
assert(accessUrlResult.access.ttlSeconds === 120, "attachment access-url ttl was not mapped");
assert(accessUrlResult.access.storageKeyStored === true, "attachment access-url storage status was not mapped");
assert(accessUrlResult.access.operationLogId === "OP-ACCESS-001", "attachment access-url operation log id was not mapped");
assert(
  accessUrlResult.access.absoluteAccessUrl.startsWith("http://127.0.0.1:8787/api/attachments/ATT-001/content"),
  "attachment access-url absolute URL was not mapped",
);

const accessLogCalls = [];
const accessLogResult = await listOfficeAttachmentAccessLogs(
  {
    authState,
    attachmentId: result.attachment.attachmentId,
    operatorId: "U-FINANCE-A",
    limit: 20,
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      accessLogCalls.push({ url, init });
      return createJsonResponse(200, {
        attachmentId: result.attachment.attachmentId,
        total: 2,
        items: [
          {
            logId: "ALOG-ACCESS-001",
            attachmentId: result.attachment.attachmentId,
            operationLogId: "OP-ACCESS-001",
            action: "attachment_access_url_created",
            operatorId: "U-FINANCE-A",
            accessMode: "permission",
            deliveryMode: "api_proxy",
            storageProvider: "local_fs",
            storageKeyStored: true,
            ownerType: "statement",
            ownerId: statement.id,
            purpose: "payment_screenshot",
            fileName: selectedFile.name,
            expiresAt: "2026-07-01T00:15:00.000Z",
            occurredAt: "2026-07-01T00:00:01.000Z",
          },
          {
            logId: "ALOG-ACCESS-002",
            attachmentId: result.attachment.attachmentId,
            operationLogId: "OP-ACCESS-002",
            action: "attachment_content_read",
            operatorId: "SIGNED_URL",
            accessMode: "signed_url",
            deliveryMode: "api_proxy_signed_url",
            storageProvider: "local_fs",
            storageKeyStored: true,
            ownerType: "statement",
            ownerId: statement.id,
            purpose: "payment_screenshot",
            fileName: selectedFile.name,
            expiresAt: "",
            occurredAt: "2026-07-01T00:00:02.000Z",
          },
        ],
      });
    },
  },
);
assert(accessLogResult.source === "api", "attachment access-log list did not use the API response");
assert(
  accessLogCalls[0]?.url === "http://127.0.0.1:8787/api/attachments/ATT-001/access-logs?limit=20",
  "attachment access-log API URL is incorrect",
);
assert(accessLogCalls[0]?.init.method === "GET", "attachment access-log API method is incorrect");
assert(accessLogResult.attachmentId === result.attachment.attachmentId, "attachment access-log attachment id was not mapped");
assert(accessLogResult.total === 2, "attachment access-log total was not mapped");
assert(accessLogResult.items[0].logId === "ALOG-ACCESS-001", "attachment access-log id was not mapped");
assert(accessLogResult.items[0].operationLogId === "OP-ACCESS-001", "attachment access-log operation log id was not mapped");
assert(accessLogResult.items[0].deliveryMode === "api_proxy", "attachment access-log delivery mode was not mapped");
assert(accessLogResult.items[0].storageKeyStored === true, "attachment access-log storage status was not mapped");
assert(accessLogResult.items[1].operatorId === "SIGNED_URL", "attachment signed-url access-log operator was not mapped");

const paymentProjection = confirmStatementPayment([statement], statement, {
  amount: 80000,
  reason: "客户少付，差额待确认",
  attachmentIds: [result.attachment.attachmentId],
  paymentAttachmentFiles: [result.attachment],
});
assert(paymentProjection.statements[0].paymentEvidenceStatus.includes(selectedFile.name), "payment evidence status did not include selected filename");
assert(paymentProjection.statements[0].paymentAttachmentFiles[0].hasContent === true, "payment attachment content flag was not stored");
assert(paymentProjection.statements[0].paymentAttachmentFiles[0].url === "/api/attachments/ATT-001/content", "payment attachment content URL was not stored");

const previewProjection = updateStatementPaymentAttachmentPreview(
  paymentProjection.statements,
  statement.id,
  result.attachment.attachmentId,
  {
    previewDataUrl: selectedFile.contentDataUrl,
    previewStatus: "已加载预览",
    contentType: selectedFile.type,
  },
);
assert(previewProjection[0].paymentAttachmentFiles[0].previewDataUrl === selectedFile.contentDataUrl, "payment attachment preview data URL was not stored");
assert(previewProjection[0].paymentAttachmentFiles[0].previewStatus === "已加载预览", "payment attachment preview status was not stored");

const resyncedProjection = syncStatementPaymentAttachments(previewProjection, statement.id, [result.attachment]);
assert(resyncedProjection[0].paymentAttachmentFiles[0].previewDataUrl === selectedFile.contentDataUrl, "resyncing attachment summaries should preserve loaded preview data URL");
assert(resyncedProjection[0].paymentAttachmentFiles[0].previewStatus === "已加载预览", "resyncing attachment summaries should preserve loaded preview status");

const denied = await createOfficeAttachment(
  {
    authState,
    ...paymentInput,
    uploadedBy: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: attachment.create",
        requiredPermission: "attachment.create",
      }),
  },
);

assert(denied.blocked === true, "attachment permission denial should block local fallback");
assert(denied.error.requiredPermission === "attachment.create", "attachment permission denial was not surfaced");

const deniedList = await listOfficeAttachments(
  {
    authState,
    ownerType: "statement",
    ownerId: statement.id,
    purpose: "payment_screenshot",
    operatorId: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: attachment.view",
        requiredPermission: "attachment.view",
      }),
  },
);
assert(deniedList.blocked === true, "attachment list permission denial should block local fallback");
assert(deniedList.error.requiredPermission === "attachment.view", "attachment list permission denial was not surfaced");

const deniedAccessLogs = await listOfficeAttachmentAccessLogs(
  {
    authState,
    attachmentId: result.attachment.attachmentId,
    operatorId: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: attachment.view",
        requiredPermission: "attachment.view",
      }),
  },
);
assert(deniedAccessLogs.blocked === true, "attachment access-log permission denial should block local fallback");
assert(deniedAccessLogs.error.requiredPermission === "attachment.view", "attachment access-log permission denial was not surfaced");

const fallback = await createOfficeAttachment(
  {
    authState,
    ...paymentInput,
  },
  {
    fetchImpl: async () => {
      throw new Error("attachment api offline");
    },
  },
);

assert(fallback.source === "local_fallback", "attachment network failure should fall back locally");
assert(fallback.attachment.attachmentId.startsWith("LOCAL-ATT-"), "local attachment fallback id is incorrect");
assert(fallback.attachment.previewDataUrl === selectedFile.contentDataUrl, "local attachment fallback should keep preview data URL");

const strictFallback = await createOfficeAttachment(
  {
    authState,
    ...paymentInput,
  },
  {
    serverRequired: true,
    fetchImpl: async () => {
      throw new Error("attachment api offline");
    },
  },
);

assert(strictFallback.blocked === true, "strict attachment upload must not use the local projection");
assert(strictFallback.source === "api_error", "strict attachment upload should report an API error");
assert(strictFallback.error?.code === "ATTACHMENT_API_UNAVAILABLE", "strict attachment upload reported the wrong API error");

const listFallback = await listOfficeAttachments(
  {
    authState,
    ownerType: "statement",
    ownerId: statement.id,
    purpose: "payment_screenshot",
    operatorId: "U-FINANCE-A",
    localAttachments: [fallback.attachment, { ...fallback.attachment, attachmentId: "LOCAL-OTHER", ownerId: "OTHER" }],
  },
  {
    fetchImpl: async () => {
      throw new Error("attachment list api offline");
    },
  },
);

assert(listFallback.source === "local_fallback", "attachment list network failure should fall back locally");
assert(listFallback.items.length === 1, "attachment list local fallback should filter by owner and purpose");
assert(listFallback.items[0].attachmentId === fallback.attachment.attachmentId, "attachment list local fallback returned the wrong item");

const accessLogFallback = await listOfficeAttachmentAccessLogs(
  {
    authState,
    attachmentId: result.attachment.attachmentId,
    operatorId: "U-FINANCE-A",
  },
  {
    fetchImpl: async () => {
      throw new Error("attachment access-log api offline");
    },
  },
);
assert(accessLogFallback.source === "local_fallback", "attachment access-log network failure should fall back locally");
assert(accessLogFallback.items.length === 0, "attachment access-log local fallback should return an empty list");

console.log("Frontend attachment API client check passed: selected payment screenshot metadata/content, frontend upload validation, API mapping, owner-scoped list, content fetch, access-url mapping, access-log mapping, denial blocking, state projection, and local fallback are covered.");

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function createTextResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] ?? "";
      },
    },
    async text() {
      return body;
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
