import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeAttachmentActions } from "../src/app/createOfficeAttachmentActions.js";
import { updateStatementPaymentAttachmentPreview } from "../src/state/officeStatementActions.js";

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

const appSource = [
  readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/OfficeWorkbench.jsx", import.meta.url), "utf8"),
].join("\n");
const statementActionsSource = readFileSync(new URL("../src/app/createOfficeStatementActions.js", import.meta.url), "utf8");
const fulfillmentActionsSource = readFileSync(new URL("../src/app/createOfficeFulfillmentActions.js", import.meta.url), "utf8");
assert.match(appSource, /createOfficeAttachmentActions\(\{/);
assert.doesNotMatch(appSource, /listOfficeAttachmentAccessLogs/);
assert.doesNotMatch(appSource, /listOfficeAttachments/);
assert.match(statementActionsSource, /allowLocalFallback \|\| attachmentFile\.contentSource === "api"/);
assert.match(statementActionsSource, /contentSource: nextPreview\.contentSource/);
assert.match(fulfillmentActionsSource, /allowLocalFallback \|\| attachmentFile\.contentSource === "api"/);

console.log("Office attachment actions check passed: access audit, formal download/sync gates, retry keys, source persistence, and App ownership are isolated.");
