import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createOfficeInteractionActions,
  getOfficeActionFailureFeedback,
} from "../src/app/useOfficeInteractionController.js";

function createHarness(overrides = {}) {
  let modal = overrides.modal ?? null;
  let orderActionModal = overrides.orderActionModal ?? null;
  let toast = "";
  let fulfillments = overrides.fulfillments ?? [{ id: "F-1", method: "快递快运", status: "待打印标签" }];
  let statements = overrides.statements ?? [{ id: "S-1", customerId: "C-1", receivable: 100, sent: true, sendRecordId: "SEND-1" }];
  const todos = overrides.todos ?? [];
  const addedTodos = [];
  const calls = [];

  const actions = createOfficeInteractionActions({
    addTodo: (todo) => addedTodos.push(todo),
    api: {
      createOfficeAttachment: async () => ({ source: "api", attachment: { attachmentId: "ATT-1" } }),
      handleOfficeStatementVariance: async () => ({ source: "api", todoId: "TODO-VARIANCE" }),
      recordOfficeStatementCustomerConfirmation: async () => ({
        source: "api",
        confirmationRecordId: "CONFIRM-1",
        confirmationRecord: { content: "确认无误", confirmedAt: "2026-07-11T00:00:00.000Z" },
      }),
      recordOfficeStatementPayment: async () => ({ source: "api", todoId: "TODO-PAYMENT" }),
      ...overrides.api,
    },
    authState: { session: { accessToken: "test" } },
    closeModal: () => { modal = null; },
    closeOrderActionModal: () => { orderActionModal = null; },
    confirmBatchPrintResult: async () => ({ feedback: "批量结果已保存。" }),
    currentUser: { displayName: "办公室A" },
    currentUserId: "U-OFFICE-A",
    domain: {
      confirmOfficeModal: () => ({ toast: "本地投影已更新。" }),
      recordStatementCustomerConfirmation: (items, statementId, record) => items.map((item) => (
        item.id === statementId ? { ...item, customerConfirmationRecord: record } : item
      )),
      ...overrides.domain,
    },
    executeOrderLineAction: async (input) => {
      calls.push(["order", input]);
      return { closeModal: true, feedback: "订单动作已完成。" };
    },
    findCustomer: () => ({ id: "C-1", name: "测试客户", contact: "客户联系人" }),
    fulfillments,
    getModal: () => modal,
    getOrderActionModal: () => orderActionModal,
    getStatementBlockingAmount: () => 10,
    orderLines: [{ id: "O-1", quantity: 100 }],
    permissionContext: overrides.permissionContext ?? {
      user: { displayName: "管理A" },
      actionPermissions: ["order.void"],
      buttonPermissions: ["order.create"],
    },
    printFulfillmentDocument: async (input) => {
      calls.push(["print", input]);
      return { feedback: "打印作业已提交，等待可信状态回读。" };
    },
    readFileAsDataUrl: async () => "data:image/png;base64,AA==",
    saveFulfillmentDispatch: async (input) => {
      calls.push(["dispatch", input]);
      return { feedback: "派单已保存。" };
    },
    setFulfillments: (value) => { fulfillments = typeof value === "function" ? value(fulfillments) : value; },
    setStatements: (value) => { statements = typeof value === "function" ? value(statements) : value; },
    setToast: (value) => { toast = value; },
    statements,
    submitFulfillmentException: async (input) => {
      calls.push(["exception", input]);
      return { feedback: "异常已登记。" };
    },
    todos,
    voidFulfillmentPrintRecord: async (input) => {
      calls.push(["void", input]);
      return { feedback: "打印记录已作废。" };
    },
  });

  return {
    actions,
    addedTodos,
    calls,
    get fulfillments() { return fulfillments; },
    get modal() { return modal; },
    get orderActionModal() { return orderActionModal; },
    get statements() { return statements; },
    get toast() { return toast; },
  };
}

assert.equal(
  getOfficeActionFailureFeedback("保存订单", { error: { code: "ORDER_VERSION_CONFLICT", message: "版本已变化" } }),
  "保存订单发生数据冲突：版本已变化。请刷新后重试。",
);
assert.equal(
  getOfficeActionFailureFeedback("确认出库", { error: { requiredPermission: "fulfillment.complete" } }),
  "后端拒绝确认出库：缺少权限 fulfillment.complete。",
);

{
  const harness = createHarness({
    permissionContext: { user: { displayName: "办公室A" }, actionPermissions: [], buttonPermissions: [] },
  });
  assert.equal(harness.actions.guardUiAction("orders", "作废正式单"), false);
  assert.match(harness.toast, /缺少权限 order\.void/);
}

{
  const harness = createHarness({
    orderActionModal: { type: "void", orderLineId: "O-1" },
  });
  const result = await harness.actions.confirmOrderLineAction({ reason: "客户取消订单" });
  assert.equal(result.closeModal, true);
  assert.equal(harness.orderActionModal, null);
  assert.equal(harness.calls[0][0], "order");
  assert.equal(harness.toast, "订单动作已完成。");
}

{
  const harness = createHarness({ modal: { type: "print", fulfillmentId: "F-1", action: "打印标签" } });
  await harness.actions.confirmModal({});
  assert.equal(harness.modal, null);
  assert.equal(harness.calls[0][0], "print");
  assert.match(harness.toast, /等待可信状态回读/);
}

{
  const harness = createHarness({
    modal: { type: "print", fulfillmentId: "F-1", action: "打印标签" },
  });
  harness.actions.notifyResult({ blocked: true, error: { code: "PRINT_VERSION_CONFLICT", message: "打印记录已变化" } });
  assert.match(harness.toast, /执行操作发生数据冲突/);
}

{
  let customerConfirmationCalls = 0;
  const harness = createHarness({
    modal: { type: "customerConfirmation", statementId: "S-1" },
    statements: [{ id: "S-1", customerId: "C-1", receivable: 100, sent: false, sendRecordId: "" }],
    api: {
      recordOfficeStatementCustomerConfirmation: async () => {
        customerConfirmationCalls += 1;
        return { source: "api" };
      },
    },
  });
  await harness.actions.confirmModal({ customerConfirmationContent: "确认" });
  assert.equal(customerConfirmationCalls, 0);
  assert.match(harness.toast, /还没有发送记录/);
}

{
  const harness = createHarness({
    modal: { type: "payment", statementId: "S-1" },
    domain: {
      confirmOfficeModal: () => ({
        statements: [{ id: "S-1", paymentRecorded: true }],
        todoInput: { id: "LOCAL-TODO", type: "待核销" },
      }),
    },
  });
  await harness.actions.confirmModal({ amount: 80, reason: "银行转账", attachPaymentProof: false });
  assert.equal(harness.statements[0].paymentRecorded, true);
  assert.equal(harness.addedTodos[0].id, "TODO-PAYMENT");
  assert.match(harness.toast, /少付进入差额待确认/);
}

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const appViewsSource = fs.readFileSync(new URL("../src/app/AppViews.jsx", import.meta.url), "utf8");
const appShellViewsSource = fs.readFileSync(new URL("../src/app/AppShellViews.jsx", import.meta.url), "utf8");
const attachmentViewerSource = fs.readFileSync(new URL("../src/app/AttachmentViewerModal.jsx", import.meta.url), "utf8");
const masterDataTemplateModalSource = fs.readFileSync(new URL("../src/app/MasterDataImportTemplateModal.jsx", import.meta.url), "utf8");
const actionModalsSource = fs.readFileSync(new URL("../src/app/ActionModals.jsx", import.meta.url), "utf8");
const attachmentViewUtilsSource = fs.readFileSync(new URL("../src/app/attachmentViewUtils.js", import.meta.url), "utf8");
const mainSource = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const sharedStylesSource = fs.readFileSync(new URL("../src/styles/shared.css", import.meta.url), "utf8");
const printDocumentStylesSource = fs.readFileSync(new URL("../src/styles/features/print-documents.css", import.meta.url), "utf8");
const attachmentStylesSource = fs.readFileSync(new URL("../src/styles/features/attachments.css", import.meta.url), "utf8");
assert.match(appSource, /useOfficeInteractionController\(\{/);
assert.match(appSource, /from "\.\/app\/AppViews\.jsx"/);
assert.doesNotMatch(appSource, /const \[toast, setToast\] = useState/);
assert.doesNotMatch(appSource, /const \[modal, setModal\] = useState/);
assert.doesNotMatch(appSource, /function confirmModal\(/);
assert.doesNotMatch(appSource, /function guardUiAction\(/);
assert.doesNotMatch(appSource, /recordOfficeStatementPayment|handleOfficeStatementVariance|confirmOfficeModal/);
assert.doesNotMatch(appSource, /function ActionModal\(/);
assert.doesNotMatch(appSource, /function MasterDataImportTemplateModal\(/);
assert.match(appViewsSource, /from "\.\/ActionModals\.jsx"/);
assert.match(appViewsSource, /from "\.\/AttachmentViewerModal\.jsx"/);
assert.match(appViewsSource, /from "\.\/MasterDataImportTemplateModal\.jsx"/);
assert.match(appViewsSource, /from "\.\/AppShellViews\.jsx"/);
assert.match(actionModalsSource, /export function ActionModal\(/);
assert.match(actionModalsSource, /export function OrderLineActionModal\(/);
assert.match(attachmentViewerSource, /export function AttachmentViewerModal\(/);
assert.match(masterDataTemplateModalSource, /export function MasterDataImportTemplateModal\(/);
assert.match(masterDataTemplateModalSource, /员工机台: "workshop"/);
assert.match(masterDataTemplateModalSource, /orderedTemplateSets\.map/);
assert.match(masterDataTemplateModalSource, /item\.key === preferredTemplateKey \? <small>当前入口<\/small>/);
assert.match(masterDataTemplateModalSource, /item\.key === preferredTemplateKey \? "is-preferred"/);
assert.match(masterDataTemplateModalSource, /本次员工岗位/);
assert.match(masterDataTemplateModalSource, /employeeRoleCoverage\.missingRoleLabels/);
assert.match(appShellViewsSource, /export function RuntimeLoginScreen\(/);
assert.match(appShellViewsSource, /export function Topbar\(/);
assert.match(attachmentViewUtilsSource, /export function isInlineImageAttachment\(/);
assert.match(sharedStylesSource, /\.form-grid label \{[\s\S]*?min-width: 0;/);
assert.match(sharedStylesSource, /@media \(max-width: 720px\) \{[\s\S]*?\.form-grid \{\s*grid-template-columns: minmax\(0, 1fr\);/);
assert.match(mainSource, /import "\.\/styles\/features\/print-documents\.css";/);
assert.equal(
  mainSource.indexOf('import "./styles/features/production-print.css";') < mainSource.indexOf('import "./styles/features/print-documents.css";'),
  true,
  "print-document styles should load after the production/print workbench layer",
);
for (const selector of [".print-batch-record", ".print-sheet", ".print-package-checklist", ".print-template-sheet", ".label-header", ".print-line-table", ".label-barcode"]) {
  assert.equal(printDocumentStylesSource.includes(selector), true, `print-document styles should own ${selector}`);
  assert.equal(sharedStylesSource.includes(selector), false, `shared styles should not retain ${selector}`);
}
assert.match(mainSource, /import "\.\/styles\/features\/attachments\.css";/);
assert.equal(
  mainSource.indexOf('import "./styles/features/print-documents.css";') < mainSource.indexOf('import "./styles/features/attachments.css";'),
  true,
  "attachment styles should load after print-document styles",
);
for (const selector of [".payment-proof-row", ".attachment-preview", ".attachment-viewer-modal", ".attachment-viewer-body", ".attachment-viewer-meta", ".attachment-viewer-audit-row"]) {
  assert.equal(attachmentStylesSource.includes(selector), true, `attachment styles should own ${selector}`);
  assert.equal(sharedStylesSource.includes(selector), false, `shared styles should not retain ${selector}`);
}

console.log("Office interaction controller checks passed: overlay state, permission guards, modal routing, and conflict feedback are centralized.");
