import assert from "node:assert/strict";
import { createOfficeAttachmentActions } from "../src/app/createOfficeAttachmentActions.js";
import {
  downloadAttachmentPreview,
  formatAttachmentAccessTime,
  formatFileSize,
  getAttachmentAccessActionLabel,
  getAttachmentAccessModeLabel,
  isInlineImageAttachment,
} from "../src/app/attachmentViewUtils.js";
import { updateStatementPaymentAttachmentPreview } from "../src/state/officeStatementActions.js";

assert.equal(formatFileSize(0), "0 B");
assert.equal(formatFileSize(512), "512 B");
assert.equal(formatFileSize(1536), "1.5 KB");
assert.equal(formatFileSize(2 * 1024 * 1024), "2.0 MB");
for (const invalidSize of [-1, Number.NaN, Number.POSITIVE_INFINITY, "invalid"]) {
  assert.equal(formatFileSize(invalidSize), "0 B", "invalid attachment sizes must not leak NaN or Infinity into the UI");
}
assert.equal(formatAttachmentAccessTime(""), "时间未记录");
assert.equal(formatAttachmentAccessTime("not-a-date"), "not-a-date");
assert.equal(getAttachmentAccessActionLabel("attachment_access_url_created"), "生成访问地址");
assert.equal(getAttachmentAccessActionLabel("attachment_content_read"), "读取内容");
assert.equal(getAttachmentAccessActionLabel("custom_action"), "custom_action");
assert.equal(getAttachmentAccessModeLabel({ accessMode: "signed_url" }), "签名链接");
assert.equal(getAttachmentAccessModeLabel({ accessMode: "permission" }), "权限读取");
assert.equal(getAttachmentAccessModeLabel({ deliveryMode: "object_storage_signed_url" }), "对象存储直连");
assert.equal(getAttachmentAccessModeLabel({}), "访问方式未记录");
assert.equal(isInlineImageAttachment({ mimeType: "IMAGE/PNG" }), true);
assert.equal(isInlineImageAttachment({ previewDataUrl: "DATA:IMAGE/JPEG;base64,AA==" }), true);
assert.equal(isInlineImageAttachment({ mimeType: "application/pdf", previewDataUrl: "data:application/pdf;base64,AA==" }), false);

assert.equal(downloadAttachmentPreview(), false);
const originalDocument = globalThis.document;
let appendedLink = null;
let clicked = false;
let removed = false;
globalThis.document = {
  body: {
    appendChild(link) {
      appendedLink = link;
    },
  },
  createElement(tagName) {
    assert.equal(tagName, "a");
    return {
      click() { clicked = true; },
      remove() { removed = true; },
    };
  },
};
try {
  assert.equal(downloadAttachmentPreview({
    attachmentId: "ATT-1",
    contentDisposition: "attachment; filename*=UTF-8''%E5%AF%B9%E8%B4%A6%2F%E5%87%AD%E8%AF%81.png",
    previewDataUrl: "data:image/png;base64,AA==",
  }), true);
  assert.equal(appendedLink.href, "data:image/png;base64,AA==");
  assert.equal(appendedLink.download, "对账-凭证.png");
  assert.equal(clicked, true);
  assert.equal(removed, true);
} finally {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
}

function createHarness({ allowLocalFallback = false, api = {}, downloadResult = true } = {}) {
  let statements = [{
    id: "ST-1",
    paymentAttachmentFiles: [{ attachmentId: "ATT-PAY-LOCAL", fileName: "pay.png" }],
    customerConfirmationAttachmentFiles: [{ attachmentId: "ATT-CUSTOMER-LOCAL", fileName: "reply.png" }],
  }];
  const paymentRef = { current: new Set() };
  const customerRef = { current: new Set() };
  const calls = { access: [], download: [], list: [] };
  const toasts = [];
  const controller = createOfficeAttachmentActions({
    allowLocalFallback,
    api: {
      listOfficeAttachmentAccessLogs: async (input, options) => {
        calls.access.push([input, options]);
        return { source: "api", items: [], total: 0 };
      },
      listOfficeAttachments: async (input, options) => {
        calls.list.push([input, options]);
        return { source: "api", items: [] };
      },
      ...api,
    },
    authState: { token: "test" },
    currentUserId: "U-OFFICE-A",
    customerConfirmationAttachmentSyncKeysRef: customerRef,
    downloadAttachmentPreview: (attachment) => {
      calls.download.push(attachment);
      return downloadResult;
    },
    paymentAttachmentSyncKeysRef: paymentRef,
    setStatements: (updater) => {
      statements = typeof updater === "function" ? updater(statements) : updater;
    },
    setToast: (message) => toasts.push(message),
    statements,
  });
  return { calls, controller, customerRef, getStatements: () => statements, paymentRef, toasts };
}

{
  const harness = createHarness({
    api: {
      listOfficeAttachmentAccessLogs: async (input, options) => {
        harness.calls.access.push([input, options]);
        return { source: "local_fallback", items: [{ id: "LOCAL" }], total: 1 };
      },
    },
  });
  const result = await harness.controller.loadAttachmentAccessAudit("ATT-1");
  assert.equal(harness.calls.access[0][1].serverRequired, true);
  assert.equal(result.status, "访问记录暂不可用");
  assert.deepEqual(result.items, []);
}

{
  const harness = createHarness({
    api: {
      listOfficeAttachmentAccessLogs: async () => ({ source: "api", items: [{ id: "LOG-1" }], total: 3 }),
    },
  });
  const result = await harness.controller.loadAttachmentAccessAudit("ATT-1");
  assert.equal(result.status, "最近 1 条 / 共 3 条");
}

{
  const harness = createHarness();
  assert.equal(harness.controller.downloadViewedAttachment({ previewDataUrl: "data:x", contentSource: "local_fallback" }), false);
  assert.equal(harness.calls.download.length, 0);
  assert.match(harness.toasts.at(-1), /未经后端 API 读取/);
  assert.equal(harness.controller.downloadViewedAttachment({ previewDataUrl: "data:x", contentSource: "api", fileName: "proof.png" }), true);
  assert.equal(harness.calls.download.length, 1);
}

{
  const harness = createHarness({
    api: {
      listOfficeAttachments: async () => ({
        source: "local_fallback",
        items: [{ attachmentId: "ATT-PAY-LOCAL" }],
      }),
    },
  });
  const result = await harness.controller.syncStatementPaymentAttachmentsFromSource("ST-1");
  assert.equal(result.blocked, true);
  assert.equal(harness.paymentRef.current.size, 0, "formal fallback must remain retryable");
  assert.equal(harness.getStatements()[0].paymentAttachmentFiles[0].source, undefined);
}

{
  const harness = createHarness({
    api: {
      listOfficeAttachments: async (input, options) => {
        harness.calls.list.push([input, options]);
        return { source: "api", items: [{ attachmentId: "ATT-PAY-API", fileName: "api-pay.png" }] };
      },
    },
  });
  const result = await harness.controller.syncStatementPaymentAttachmentsFromSource("ST-1");
  assert.equal(result.source, "api");
  assert.equal(harness.calls.list[0][1].serverRequired, true);
  assert.equal(harness.calls.list[0][0].localAttachments[0].attachmentId, "ATT-PAY-LOCAL");
  assert.equal(harness.getStatements()[0].paymentAttachmentFiles[0].attachmentId, "ATT-PAY-API");
  assert.equal(harness.getStatements()[0].paymentAttachmentFiles[0].source, "api");
  assert.equal(harness.paymentRef.current.size, 1);
  const skipped = await harness.controller.syncStatementPaymentAttachmentsFromSource("ST-1");
  assert.equal(skipped.reason, "already_synced");
  await harness.controller.syncStatementPaymentAttachmentsFromSource("ST-1", { force: true });
  assert.equal(harness.calls.list.length, 2, "forced attachment sync must bypass a previously cached empty or stale result");
}

{
  const harness = createHarness({
    api: {
      listOfficeAttachments: async () => ({
        source: "api",
        items: [{ attachmentId: "ATT-CUSTOMER-API", fileName: "reply-api.png" }],
      }),
    },
  });
  const result = await harness.controller.syncStatementCustomerAttachmentsFromSource("ST-1", { isCancelled: () => true });
  assert.equal(result.cancelled, true);
  assert.equal(harness.customerRef.current.size, 0);
  assert.equal(harness.getStatements()[0].customerConfirmationAttachmentFiles[0].attachmentId, "ATT-CUSTOMER-LOCAL");
}

{
  const updated = updateStatementPaymentAttachmentPreview(
    [{ id: "ST-1", paymentAttachmentFiles: [{ attachmentId: "ATT-1" }] }],
    "ST-1",
    "ATT-1",
    { previewDataUrl: "data:image/png;base64,AA==", contentSource: "api" },
  );
  assert.equal(updated[0].paymentAttachmentFiles[0].contentSource, "api");
}

console.log("Office attachment actions check passed: access audit, formal download/sync gates, retry keys, and source persistence are covered.");
