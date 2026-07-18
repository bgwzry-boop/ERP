import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildInventoryLedgerApiFilters,
  createOfficeInventoryDetailReadActions,
} from "../src/app/useOfficeInventoryDetailReads.js";
import { createOfficeMasterDataReadActions } from "../src/app/useOfficeMasterDataReads.js";

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

assert.deepEqual(
  buildInventoryLedgerApiFilters(" STOCK-1 ", {
    keyword: " ORD-1 ",
    changeType: "出库",
    sourceType: "全部",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-11",
  }),
  {
    inventoryItemId: "STOCK-1",
    keyword: "ORD-1",
    changeType: "出库",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-11",
  },
);

const inventoryState = {
  ledger: createState({ items: [], total: 0, loading: false }),
  queue: createState({ items: [], total: 0, loading: false }),
  drafts: createState([{ correctionDraftId: "ADJ-LOCAL" }]),
};
const inventoryCalls = [];
const inventoryActions = createOfficeInventoryDetailReadActions({
  api: {
    async listOfficeInventoryLedgerEntries(input) {
      inventoryCalls.push({ name: "ledger", input });
      return { source: "api", items: [{ id: "LEDGER-1" }], total: 1 };
    },
    async listOfficeInventoryCorrectionDrafts(input) {
      inventoryCalls.push({ name: "queue", input });
      return { source: "api", items: [{ correctionDraftId: "ADJ-API" }], total: 1 };
    },
  },
  authState: { authenticated: true },
  currentUserId: "U-OFFICE-A",
  inventoryCorrectionDraftsRef: { current: [{ correctionDraftId: "ADJ-LOCAL" }] },
  inventoryLedgerFiltersRef: { current: { keyword: "ORD-1", changeType: "全部", sourceType: "全部" } },
  selectedStockIdRef: { current: "STOCK-1" },
  serverRequired: () => false,
  setInventoryCorrectionDrafts: inventoryState.drafts.set,
  setInventoryCorrectionQueueState: inventoryState.queue.set,
  setInventoryLedgerState: inventoryState.ledger.set,
});
const ledgerResult = await inventoryActions.refreshInventoryLedgerEntries({ showToast: true });
assert.equal(inventoryState.ledger.value.items[0].id, "LEDGER-1");
assert.equal(inventoryCalls[0].input.filters.inventoryItemId, "STOCK-1");
assert.equal(inventoryCalls[0].input.filters.keyword, "ORD-1");
assert.match(ledgerResult.feedback, /库存流水已通过后端 API刷新/);
const queueResult = await inventoryActions.refreshInventoryCorrectionQueue({ showToast: true });
assert.equal(inventoryState.queue.value.items[0].correctionDraftId, "ADJ-API");
assert.equal(inventoryState.drafts.value[0].correctionDraftId, "ADJ-API");
assert.match(queueResult.feedback, /库存修正确认队列已通过后端 API刷新/);

const emptyStockState = createState({ items: [{ id: "OLD" }], total: 1 });
const emptyStockActions = createOfficeInventoryDetailReadActions({
  api: {},
  authState: {},
  currentUserId: "U",
  inventoryCorrectionDraftsRef: { current: [] },
  inventoryLedgerFiltersRef: { current: {} },
  selectedStockIdRef: { current: "" },
  serverRequired: () => false,
  setInventoryCorrectionDrafts() {},
  setInventoryCorrectionQueueState() {},
  setInventoryLedgerState: emptyStockState.set,
});
assert.equal(await emptyStockActions.refreshInventoryLedgerEntries(), null);
assert.equal(emptyStockState.value.error, "未选择库存键。");

const productionLedgerState = createState({ items: [{ id: "OLD" }], total: 1 });
const productionInventoryActions = createOfficeInventoryDetailReadActions({
  api: {
    async listOfficeInventoryLedgerEntries() {
      return { source: "local_fallback", items: [{ id: "FAKE" }], total: 1, error: { message: "offline" } };
    },
    async listOfficeInventoryCorrectionDrafts() {
      return { source: "local_fallback", items: [{ correctionDraftId: "FAKE" }], total: 1, error: { message: "offline" } };
    },
  },
  authState: {},
  currentUserId: "U",
  inventoryCorrectionDraftsRef: { current: [] },
  inventoryLedgerFiltersRef: { current: {} },
  selectedStockIdRef: { current: "STOCK-1" },
  serverRequired: () => true,
  setInventoryCorrectionDrafts() {},
  setInventoryCorrectionQueueState() {},
  setInventoryLedgerState: productionLedgerState.set,
});
const productionLedgerResult = await productionInventoryActions.refreshInventoryLedgerEntries({ showToast: true });
assert.equal(productionLedgerResult.blocked, true);
assert.equal(productionLedgerResult.upstreamSource, "local_fallback");
assert.equal(productionLedgerState.value.items.length, 0);

function createMasterCase({ serverRequired = false, actionDisabled = false } = {}) {
  const drafts = createState([{ draftId: "DR-LOCAL" }]);
  const reviews = createState([{ employeeId: "E-LOCAL" }]);
  const readiness = createState({ ready: true, coveredRoleCount: 8 });
  const assignmentOptions = createState({ workshops: ["旧车间"], machines: [{ machineId: "M-OLD" }] });
  const actions = createOfficeMasterDataReadActions({
    api: {
      async listOfficeMasterDataImportReviewDrafts() {
        return serverRequired
          ? { source: "local_fallback", items: [{ draftId: "DR-FAKE" }], total: 1, error: { message: "offline" } }
          : { source: "api", items: [{ draftId: "DR-API" }], total: 1 };
      },
      async listOfficeMasterDataEmployeeAccountReviews() {
        return serverRequired
          ? { source: "local_fallback", items: [{ employeeId: "E-FAKE" }], total: 1, error: { message: "offline" } }
          : { source: "api", items: [{ employeeId: "E-API" }], total: 1, readiness: { ready: false, coveredRoleCount: 1 } };
      },
    },
    authState: {},
    currentUserId: "U-MANAGER-A",
    getActionState: () => ({ disabled: actionDisabled, title: actionDisabled ? "无员工复核权限" : "" }),
    masterDataEmployeeAccountReviewsRef: { current: reviews.value },
    masterDataImportReviewDraftsRef: { current: drafts.value },
    permissionContext: {},
    serverRequired: () => serverRequired,
    setMasterDataEmployeeAccountReviews: reviews.set,
    setMasterDataEmployeeAccountReadiness: readiness.set,
    setMasterDataEmployeeAssignmentOptions: assignmentOptions.set,
    setMasterDataImportReviewDrafts: drafts.set,
  });
  return { actions, assignmentOptions, drafts, readiness, reviews };
}

const masterSuccess = createMasterCase();
const draftResult = await masterSuccess.actions.refreshMasterDataImportReviewDrafts();
assert.equal(masterSuccess.drafts.value[0].draftId, "DR-API");
assert.match(draftResult.feedback, /已从后端刷新导入确认草稿/);
const employeeResult = await masterSuccess.actions.refreshMasterDataEmployeeAccountReviews();
assert.equal(masterSuccess.reviews.value[0].employeeId, "E-API");
assert.equal(masterSuccess.readiness.value.coveredRoleCount, 1);
assert.match(employeeResult.feedback, /已刷新员工账号复核：1 条/);

const permissionCase = createMasterCase({ actionDisabled: true });
const permissionResult = await permissionCase.actions.refreshMasterDataEmployeeAccountReviews();
assert.equal(permissionResult.blocked, true);
assert.equal(permissionCase.readiness.value, null);
assert.deepEqual(permissionCase.reviews.value, []);
assert.deepEqual(permissionCase.assignmentOptions.value, { workshops: [], machines: [], allMachines: [] });
assert.deepEqual(permissionResult.items, []);
assert.equal(permissionResult.feedback, "无员工复核权限");

const masterProduction = createMasterCase({ serverRequired: true });
const productionDraftResult = await masterProduction.actions.refreshMasterDataImportReviewDrafts();
assert.equal(productionDraftResult.blocked, true);
assert.deepEqual(masterProduction.drafts.value, []);
const productionEmployeeResult = await masterProduction.actions.refreshMasterDataEmployeeAccountReviews();
assert.equal(productionEmployeeResult.blocked, true);
assert.deepEqual(masterProduction.reviews.value, []);
assert.equal(masterProduction.readiness.value, null);
assert.deepEqual(masterProduction.assignmentOptions.value, { workshops: [], machines: [], allMachines: [] });

const pendingEmployeeReads = [];
const concurrentReviews = createState([{ employeeId: "E-OLD" }]);
const employeeAccountRequestSequenceRef = { current: 0 };
const concurrentActions = createOfficeMasterDataReadActions({
  api: {
    async listOfficeMasterDataEmployeeAccountReviews() {
      return new Promise((resolve) => pendingEmployeeReads.push(resolve));
    },
  },
  authState: {},
  currentUserId: "U-MANAGER-A",
  getActionState: () => ({ disabled: false, title: "" }),
  masterDataEmployeeAccountReviewsRef: { current: concurrentReviews.value },
  masterDataImportReviewDraftsRef: { current: [] },
  permissionContext: {},
  serverRequired: () => false,
  employeeAccountRequestSequenceRef,
  setMasterDataEmployeeAccountReviews: concurrentReviews.set,
  setMasterDataEmployeeAccountReadiness() {},
  setMasterDataImportReviewDrafts() {},
});
const olderRead = concurrentActions.refreshMasterDataEmployeeAccountReviews();
const newerRead = concurrentActions.refreshMasterDataEmployeeAccountReviews();
pendingEmployeeReads[1]({ source: "api", items: [{ employeeId: "E-NEW" }], total: 1 });
await newerRead;
pendingEmployeeReads[0]({ source: "api", items: [{ employeeId: "E-STALE" }], total: 1 });
const staleResult = await olderRead;
assert.equal(staleResult.stale, true);
assert.equal(concurrentReviews.value[0].employeeId, "E-NEW");

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/app/useOfficeWorkspace.js", import.meta.url), "utf8");
for (const apiName of [
  "listOfficeInventoryLedgerEntries",
  "listOfficeInventoryCorrectionDrafts",
  "listOfficeMasterDataImportReviewDrafts",
  "listOfficeMasterDataEmployeeAccountReviews",
]) {
  assert.equal(appSource.includes(apiName), false, `App should not directly orchestrate ${apiName}`);
}
assert.match(workspaceSource, /useOfficeInventoryDetailReads/);
assert.match(workspaceSource, /useOfficeMasterDataReads/);
assert.match(workspaceSource, /\.\.\.inventoryDetailReads/);
assert.match(workspaceSource, /\.\.\.masterDataReads/);

console.log("Office operational reads check passed: inventory filters/queues, master-data reviews, permissions, and production fail-closed behavior are covered.");
