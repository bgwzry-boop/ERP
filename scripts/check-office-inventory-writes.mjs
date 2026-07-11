import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOfficeInventoryDetailReadActions } from "../src/app/useOfficeInventoryDetailReads.js";
import { createOfficeInventoryWriteActions } from "../src/app/useOfficeInventoryWrites.js";

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

const stock = {
  id: "S001",
  size: "30*38",
  color: "白色",
  handle: "普通提",
  style: "空白袋",
  inStock: 500,
};
const pendingDraft = {
  id: "ICD-1",
  correctionDraftId: "ICD-1",
  inventoryItemId: "S001",
  status: "待确认生效",
  systemQty: 500,
  actualQty: 480,
};

function createInventoryWriteCase({ api = {}, initialDrafts = [], refreshResults = {}, serverRequired = false } = {}) {
  const states = {
    drafts: createState(initialDrafts),
    queue: createState({ source: "api", items: initialDrafts, total: initialDrafts.length, confirmingId: "", error: "" }),
    selectedStockId: createState("S001"),
  };
  const draftsRef = { current: initialDrafts };
  const selectedStockIdRef = { current: "S001" };
  const refreshCalls = [];
  const refresh = (name) => async (options = {}) => {
    refreshCalls.push({ name, options });
    return refreshResults[name] ?? { source: "api" };
  };
  const actions = createOfficeInventoryWriteActions({
    api,
    authState: {},
    currentUserDisplayName: "办公室A",
    currentUserId: "U-OFFICE-A",
    inventoryCorrectionDraftsRef: draftsRef,
    loadInventoryCorrectionDetail: refresh("detail"),
    refreshInventoryCorrectionQueue: refresh("queue"),
    refreshInventoryLedgerEntries: refresh("ledger"),
    refreshInventoryRecords: refresh("inventory"),
    refreshTodos: refresh("todos"),
    selectedStockIdRef,
    serverRequired: () => serverRequired,
    setInventoryCorrectionDrafts: states.drafts.set,
    setInventoryCorrectionQueueState: states.queue.set,
    setSelectedStockId: states.selectedStockId.set,
  });
  return { actions, draftsRef, refreshCalls, selectedStockIdRef, states };
}

const createCase = createInventoryWriteCase({
  api: {
    async createOfficeInventoryCorrectionDraft(input) {
      assert.equal(input.expectedQty, 500);
      assert.equal(input.actualQty, 480);
      return { source: "api", draft: pendingDraft, todoId: "T-ICD-1" };
    },
  },
});
const createResult = await createCase.actions.createInventoryCorrectionDraft({
  stock,
  actualQty: 480,
  reason: "盘点差异",
});
assert.equal(createCase.states.drafts.value[0].id, "ICD-1");
assert.equal(createCase.states.queue.value.total, 1);
assert.deepEqual(createCase.refreshCalls.map((item) => item.name).sort(), ["queue", "todos"]);
assert.equal(createResult.projectionRefreshFailed, false);
assert.match(createResult.feedback, /未修改库存总数/);

const deniedCreateCase = createInventoryWriteCase({
  api: {
    async createOfficeInventoryCorrectionDraft() {
      return {
        source: "api_error",
        blocked: true,
        error: { requiredPermission: "inventory.correction.create", message: "forbidden" },
        draft: null,
      };
    },
  },
});
const deniedCreate = await deniedCreateCase.actions.createInventoryCorrectionDraft({ stock, actualQty: 480, reason: "盘点差异" });
assert.equal(deniedCreate.blocked, true);
assert.equal(deniedCreateCase.states.drafts.value.length, 0);
assert.match(deniedCreate.feedback, /缺少权限 inventory\.correction\.create/);

const productionFallbackCase = createInventoryWriteCase({
  serverRequired: true,
  api: {
    async createOfficeInventoryCorrectionDraft() {
      return { source: "local_fallback", draft: pendingDraft };
    },
  },
});
const productionFallback = await productionFallbackCase.actions.createInventoryCorrectionDraft({
  stock,
  actualQty: 480,
  reason: "盘点差异",
});
assert.equal(productionFallback.blocked, true);
assert.equal(productionFallback.upstreamSource, "local_fallback");
assert.equal(productionFallbackCase.states.drafts.value.length, 0);

const confirmCase = createInventoryWriteCase({
  initialDrafts: [pendingDraft],
  api: {
    async confirmOfficeInventoryCorrectionDraft(input) {
      assert.equal(input.correctionDraftId, "ICD-1");
      return {
        source: "api",
        confirmation: {
          correctionDraftId: "ICD-1",
          inventoryItemId: "S001",
          ledger: { ledgerId: "LEDGER-1", inventoryItemId: "S001" },
        },
      };
    },
  },
});
const confirmResult = await confirmCase.actions.confirmInventoryCorrectionDraft(pendingDraft);
assert.equal(confirmCase.states.drafts.value[0].status, "已确认生效");
assert.equal(confirmCase.states.queue.value.total, 0);
assert.equal(confirmCase.states.queue.value.confirmingId, "");
assert.equal(confirmCase.selectedStockIdRef.current, "S001");
assert.deepEqual(
  confirmCase.refreshCalls.map((item) => item.name).sort(),
  ["detail", "inventory", "ledger", "queue", "todos"],
);
assert.equal(confirmResult.projectionRefreshFailed, false);
assert.match(confirmResult.feedback, /公共待办已同步/);

const conflictCase = createInventoryWriteCase({
  initialDrafts: [pendingDraft],
  api: {
    async confirmOfficeInventoryCorrectionDraft() {
      return {
        source: "api_error",
        blocked: true,
        error: { code: "INVENTORY_REVISION_CONFLICT", message: "库存版本冲突，请刷新后重试。" },
        confirmation: null,
      };
    },
  },
});
const conflictResult = await conflictCase.actions.confirmInventoryCorrectionDraft(pendingDraft);
assert.equal(conflictResult.blocked, true);
assert.equal(conflictCase.states.drafts.value[0].status, "待确认生效");
assert.equal(conflictCase.states.queue.value.confirmingId, "");
assert.match(conflictCase.states.queue.value.error, /版本冲突/);

const refreshFailureCase = createInventoryWriteCase({
  initialDrafts: [pendingDraft],
  refreshResults: { todos: { source: "api_error", blocked: true, error: { message: "offline" } } },
  api: {
    async confirmOfficeInventoryCorrectionDraft() {
      return { source: "api", confirmation: { correctionDraftId: "ICD-1", inventoryItemId: "S001" } };
    },
  },
});
const refreshFailure = await refreshFailureCase.actions.confirmInventoryCorrectionDraft(pendingDraft);
assert.equal(refreshFailure.projectionRefreshFailed, true);
assert.match(refreshFailure.feedback, /已通过后端 API确认.*刷新失败/);

const detailState = createState({ source: "idle", detail: null, requestedId: "", loading: false, error: "" });
const detailActions = createOfficeInventoryDetailReadActions({
  api: {
    async getOfficeInventoryCorrectionDetail() {
      return { source: "api", detail: { ...pendingDraft, operationLogs: [] } };
    },
  },
  authState: {},
  currentUserId: "U-OFFICE-A",
  inventoryCorrectionDraftsRef: { current: [pendingDraft] },
  inventoryLedgerEntriesRef: { current: [] },
  inventoryLedgerFiltersRef: { current: {} },
  selectedStockIdRef: { current: "S001" },
  serverRequired: () => true,
  setInventoryCorrectionDrafts() {},
  setInventoryCorrectionDetailState: detailState.set,
  setInventoryCorrectionQueueState() {},
  setInventoryLedgerState() {},
});
const detailResult = await detailActions.loadInventoryCorrectionDetail("ICD-1", null, { showToast: true });
assert.equal(detailState.value.detail.id, "ICD-1");
assert.match(detailResult.feedback, /后端 API.*ICD-1/);

const blockedDetailState = createState({ detail: { id: "STALE" } });
const blockedDetailActions = createOfficeInventoryDetailReadActions({
  api: {
    async getOfficeInventoryCorrectionDetail() {
      return { source: "local_fallback", detail: pendingDraft, error: { message: "offline" } };
    },
  },
  authState: {},
  currentUserId: "U-OFFICE-A",
  inventoryCorrectionDraftsRef: { current: [pendingDraft] },
  inventoryLedgerEntriesRef: { current: [] },
  inventoryLedgerFiltersRef: { current: {} },
  selectedStockIdRef: { current: "S001" },
  serverRequired: () => true,
  setInventoryCorrectionDrafts() {},
  setInventoryCorrectionDetailState: blockedDetailState.set,
  setInventoryCorrectionQueueState() {},
  setInventoryLedgerState() {},
});
const blockedDetail = await blockedDetailActions.loadInventoryCorrectionDetail("ICD-1");
assert.equal(blockedDetail.blocked, true);
assert.equal(blockedDetailState.value.detail, null);

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
for (const directWrite of ["createOfficeInventoryCorrectionDraft", "confirmOfficeInventoryCorrectionDraft"]) {
  assert.equal(appSource.includes(directWrite), false, `App must not own ${directWrite}`);
}
const workspaceSource = readFileSync(new URL("../src/app/useOfficeWorkspace.js", import.meta.url), "utf8");
assert.match(workspaceSource, /useOfficeInventoryWrites/);
assert.match(workspaceSource, /\.\.\.inventoryWrites/);

console.log("Office inventory writes check passed: create/confirm, permission, conflict, production fail-closed, detail reads, and inventory/ledger/queue/todo refreshes are covered.");
