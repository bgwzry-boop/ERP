import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeStatementActions } from "../src/app/createOfficeStatementActions.js";

const baseStatement = {
  id: "ST-CONTROLLER-001",
  customerId: "C001",
  period: "2026-07",
  receivable: 100,
  received: 100,
  variance: 0,
  status: "待发送",
  lineIds: [],
};

function createHarness({ allowLocalFallback = false, api = {}, statement = baseStatement } = {}) {
  let statements = [{ ...statement }];
  const toasts = [];
  const modals = [];
  const downloads = [];
  const controller = createOfficeStatementActions({
    allowLocalFallback,
    api,
    authState: { authenticated: true },
    currentUser: { displayName: "财务A" },
    currentUserId: "U-FINANCE-A",
    downloadStatementExcelWorkbook: (...args) => {
      downloads.push(args);
      return true;
    },
    findCustomer: () => ({ id: "C001", name: "测试客户", contact: "客户联系人" }),
    getStatementBlockingAmount: (item) => Math.max(0, Number(item.receivable) - Number(item.received)),
    guardUiAction: () => true,
    loadAttachmentAccessAudit: async () => ({ source: "api", items: [], total: 0 }),
    openAttachmentViewer: () => {},
    openModal: (modal) => modals.push(modal),
    orderLines: [],
    readBlobAsDataUrl: async () => "",
    selectedStatementId: statement.id,
    setStatements: (updater) => {
      statements = typeof updater === "function" ? updater(statements) : updater;
    },
    setToast: (message) => toasts.push(message),
    statements,
  });
  return { controller, downloads, getStatements: () => statements, modals, toasts };
}

{
  const apiOptions = [];
  const harness = createHarness({
    api: {
      markOfficeStatementSentViaApi: async (_input, options) => {
        apiOptions.push(options);
        return { source: "local_fallback", sendRecordId: "SEND-LOCAL" };
      },
    },
  });
  await harness.controller.statementAction("标记已发送");
  assert.equal(apiOptions[0]?.serverRequired, true, "formal statement writes must require the server");
  assert.equal(harness.getStatements()[0].sent, undefined, "formal fallback must not mark a statement as sent");
  assert.match(harness.toasts.at(-1), /后端拒绝标记发送/);
}

{
  const harness = createHarness({
    api: {
      markOfficeStatementSentViaApi: async () => ({ source: "api", sendRecordId: "SEND-API-001" }),
    },
  });
  await harness.controller.statementAction("标记已发送");
  assert.equal(harness.getStatements()[0].sent, true, "API-confirmed send should update statement state");
  assert.equal(harness.getStatements()[0].sendRecordId, "SEND-API-001");
}

{
  const harness = createHarness({
    api: {
      previewOfficeStatement: async () => ({
        source: "local_fallback",
        preview: { statementId: baseStatement.id, previewType: "customer_send" },
      }),
    },
  });
  await harness.controller.statementAction("生成对账单预览");
  assert.equal(harness.modals.length, 0, "formal fallback must not open a locally generated statement preview");
  assert.match(harness.toasts.at(-1), /后端拒绝生成对账预览/);
}

{
  const harness = createHarness({
    api: {
      listOfficeStatementExports: async () => ({
        source: "local_fallback",
        items: [{ fileName: "local.xlsx" }],
        total: 1,
      }),
    },
  });
  await harness.controller.statementAction("刷新导出记录");
  assert.equal(harness.getStatements()[0].exportRecords, undefined, "formal fallback must not sync local export history");
  assert.match(harness.toasts.at(-1), /后端拒绝查询导出记录/);
}

{
  const harness = createHarness({
    api: {
      writeOffOfficeStatement: async () => ({ source: "local_fallback" }),
    },
  });
  await harness.controller.statementAction("确认核销");
  assert.equal(harness.getStatements()[0].status, "待发送", "formal fallback must not write off a statement");
  assert.match(harness.toasts.at(-1), /后端拒绝确认核销/);
}

{
  const harness = createHarness({
    api: {
      writeOffOfficeStatement: async () => ({ source: "api", status: "已核销" }),
    },
  });
  await harness.controller.statementAction("确认核销");
  assert.equal(harness.getStatements()[0].status, "已核销", "API-confirmed write-off should update statement state");
}

{
  const harness = createHarness({
    allowLocalFallback: true,
    api: {
      markOfficeStatementSentViaApi: async (_input, options) => {
        assert.equal(options.serverRequired, false, "demo mode should preserve local fallback");
        return { source: "local_fallback", sendRecordId: "SEND-DEMO" };
      },
    },
  });
  await harness.controller.statementAction("标记已发送");
  assert.equal(harness.getStatements()[0].sent, true, "demo mode should retain local fallback behavior");
}

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.match(appSource, /createOfficeStatementActions\(\{/);
assert.match(appSource, /allowLocalFallback: !runtimeServerRequired/);
assert.doesNotMatch(appSource, /async function statementAction/);
assert.doesNotMatch(appSource, /async function refreshStatementExportRecords/);

console.log("Office statement actions check passed: financial actions are isolated and formal mode rejects local fallback state changes.");
