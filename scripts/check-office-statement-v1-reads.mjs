import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeStatementReadActions } from "../src/app/useOfficeStatementReads.js";
import { createOfficeV1StatusReadActions } from "../src/app/useOfficeV1StatusReads.js";

function createState(initialValue) {
  let value = initialValue;
  return {
    get value() {
      return value;
    },
    set(nextValue) {
      value = typeof nextValue === "function" ? nextValue(value) : nextValue;
    },
  };
}

function createStatementCase({ serverRequired = false } = {}) {
  const statements = createState([{ id: "ST-LOCAL", customerId: "C-LOCAL", lineIds: ["OL-LOCAL"] }]);
  const selected = createState("ST-LOCAL");
  const meta = createState({ source: "local", loading: false });
  const actions = createOfficeStatementReadActions({
    api: {
      async listOfficeStatementCustomers() {
        return serverRequired
          ? { source: "local_fallback", items: [{ statementId: "ST-FAKE" }], total: 1, error: { message: "offline" } }
          : {
              source: "api",
              items: [{
                statementId: "ST-API",
                customerId: "C-API",
                customerName: "客户A",
                currentReceivable: 1200,
                debtAmount: 200,
                status: "debt_or_variance",
              }],
              total: 1,
            };
      },
      async getOfficeStatementDetail() {
        return serverRequired
          ? { source: "local_fallback", detail: { id: "ST-FAKE" }, error: { message: "offline" } }
          : {
              source: "api",
              detail: {
                id: "ST-API",
                customerId: "C-API",
                status: "有欠款",
                receivable: 1200,
                received: 1000,
                variance: 200,
                historicalDebt: 80,
                lineIds: ["OL-API"],
              },
            };
      },
    },
    authState: {},
    currentUserId: "U-FINANCE-A",
    selectedStatementIdRef: { current: selected.value },
    serverRequired: () => serverRequired,
    statementsRef: { current: statements.value },
    setSelectedStatementId: selected.set,
    setStatementReadMeta: meta.set,
    setStatements: statements.set,
  });
  return { actions, meta, selected, statements };
}

const statementCase = createStatementCase();
const listResult = await statementCase.actions.refreshStatements({ showToast: true });
assert.equal(statementCase.selected.value, "ST-API");
assert.equal(statementCase.statements.value[0].receivable, 1200);
assert.equal(statementCase.statements.value[0].status, "有欠款");
assert.match(listResult.feedback, /客户对账列表已通过后端 API刷新/);
const detailResult = await statementCase.actions.refreshStatementDetail({ statementId: "ST-API", showToast: true });
assert.equal(statementCase.statements.value[0].received, 1000);
assert.equal(statementCase.statements.value[0].historicalDebt, 80);
assert.deepEqual(statementCase.statements.value[0].lineIds, ["OL-API"]);
assert.match(detailResult.feedback, /对账单详情已通过后端 API刷新/);

const concurrentStatement = createState([{
  id: "ST-CONCURRENT",
  revision: 3,
  received: 1200,
  paymentAttachmentIds: ["ATT-PAY-1"],
  paymentAttachmentFiles: [{ attachmentId: "ATT-PAY-1", fileName: "payment.png" }],
  paymentEvidenceStatus: "已登记付款截图",
}]);
const concurrentActions = createOfficeStatementReadActions({
  api: {
    async getOfficeStatementDetail() {
      return { source: "api", detail: { id: "ST-CONCURRENT", revision: 2, received: 0 } };
    },
  },
  authState: {},
  currentUserId: "U-FINANCE-A",
  selectedStatementIdRef: { current: "ST-CONCURRENT" },
  serverRequired: () => true,
  statementsRef: { current: concurrentStatement.value },
  setSelectedStatementId() {},
  setStatementReadMeta() {},
  setStatements: concurrentStatement.set,
});
await concurrentActions.refreshStatementDetail({ statementId: "ST-CONCURRENT" });
assert.equal(concurrentStatement.value[0].revision, 3, "a late detail response must not overwrite a newer payment commit");
assert.equal(concurrentStatement.value[0].paymentAttachmentFiles[0].fileName, "payment.png");

const emptyStatements = createStatementCase();
emptyStatements.actions = createOfficeStatementReadActions({
  api: {
    async listOfficeStatementCustomers() {
      return { source: "api", items: [], total: 0 };
    },
  },
  authState: {},
  currentUserId: "U",
  selectedStatementIdRef: { current: "ST-LOCAL" },
  serverRequired: () => false,
  statementsRef: { current: [{ id: "ST-LOCAL" }] },
  setSelectedStatementId: emptyStatements.selected.set,
  setStatementReadMeta: emptyStatements.meta.set,
  setStatements: emptyStatements.statements.set,
});
await emptyStatements.actions.refreshStatements();
assert.deepEqual(emptyStatements.statements.value, []);
assert.equal(emptyStatements.selected.value, "");

const productionStatement = createStatementCase({ serverRequired: true });
const productionList = await productionStatement.actions.refreshStatements({ showToast: true });
assert.equal(productionList.blocked, true);
assert.equal(productionStatement.statements.value[0].id, "ST-LOCAL");
const productionDetail = await productionStatement.actions.refreshStatementDetail({ statementId: "ST-LOCAL" });
assert.equal(productionDetail.blocked, true);
assert.equal(productionStatement.statements.value[0].id, "ST-LOCAL");

const v1State = createState({
  source: "local",
  statusData: { releaseGate: "OLD" },
  lastSuccessfulAt: "2026-07-10T00:00:00.000Z",
});
const v1Actions = createOfficeV1StatusReadActions({
  api: {
    async getOfficeV1GoLiveStatus() {
      return { source: "api", statusData: { releaseGate: "0/4" } };
    },
  },
  authState: {},
  currentUserId: "U-MANAGER-A",
  now: () => "2026-07-11T00:00:00.000Z",
  setV1GoLiveStatusState: v1State.set,
});
const v1Result = await v1Actions.refreshV1GoLiveStatus({ showToast: true });
assert.equal(v1State.value.statusData.releaseGate, "0/4");
assert.equal(v1State.value.lastSuccessfulAt, "2026-07-11T00:00:00.000Z");
assert.match(v1Result.feedback, /发布门禁、现场证据和签字/);

const staleV1State = createState({
  source: "api",
  statusData: { releaseGate: "0/4" },
  lastSuccessfulAt: "2026-07-11T00:00:00.000Z",
});
const staleV1Actions = createOfficeV1StatusReadActions({
  api: {
    async getOfficeV1GoLiveStatus() {
      return { source: "local_fallback", statusData: null, error: { message: "offline" } };
    },
  },
  authState: {},
  currentUserId: "U-MANAGER-A",
  now: () => "2026-07-11T01:00:00.000Z",
  setV1GoLiveStatusState: staleV1State.set,
});
const staleResult = await staleV1Actions.refreshV1GoLiveStatus({ showToast: true });
assert.equal(staleV1State.value.statusData.releaseGate, "0/4");
assert.equal(staleV1State.value.lastSuccessfulAt, "2026-07-11T00:00:00.000Z");
assert.equal(staleV1State.value.lastAttemptedAt, "2026-07-11T01:00:00.000Z");
assert.match(staleResult.feedback, /不展示固定门禁数据/);

const statementPageSource = readFileSync(new URL("../src/features/statements/StatementPage.jsx", import.meta.url), "utf8");
assert.match(statementPageSource, /当前账期暂无客户对账单/);
assert.match(statementPageSource, /后端对账/);
const appSource = [
  readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/OfficeWorkbench.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/OfficeWorkspacePages.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/useOfficeActivePageEffects.js", import.meta.url), "utf8"),
].join("\n");
assert.equal(appSource.includes("getOfficeV1GoLiveStatus"), false);
assert.equal(appSource.includes("async function refreshV1GoLiveStatus"), false);
const workspaceSource = readFileSync(new URL("../src/app/useOfficeWorkspace.js", import.meta.url), "utf8");
assert.match(workspaceSource, /useOfficeStatementReads/);
assert.match(workspaceSource, /useOfficeV1StatusReads/);
assert.match(workspaceSource, /\.\.\.statementReads/);
assert.match(workspaceSource, /\.\.\.v1StatusReads/);

console.log("Office statement/V1 reads check passed: backend summaries/details, empty state, production fail-closed, and V1 snapshot freshness are covered.");
