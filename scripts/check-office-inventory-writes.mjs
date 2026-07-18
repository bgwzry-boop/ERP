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
    intent: createState({ source: "api", items: [], holds: [], loading: false, mutatingId: "", error: "" }),
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
    refreshInventoryIntents: refresh("intents"),
    refreshInventoryRecords: refresh("inventory"),
    refreshTodos: refresh("todos"),
    selectedStockIdRef,
    serverRequired: () => serverRequired,
    setInventoryCorrectionDrafts: states.drafts.set,
    setInventoryCorrectionQueueState: states.queue.set,
    setInventoryIntentState: states.intent.set,
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

const attachmentCase = createInventoryWriteCase({
  initialDrafts: [pendingDraft],
  api: {
    async readAttachmentFileAsDataUrl(file) {
      assert.equal(file.name, "count.jpg");
      return "data:image/jpeg;base64,Y291bnQ=";
    },
    createInventoryCorrectionEvidenceAttachmentInput(input) {
      assert.equal(input.correctionDraftId, "ICD-1");
      return {
        ownerType: "inventory_correction",
        ownerId: "ICD-1",
        purpose: "inventory_correction_evidence",
        fileType: "image",
        fileName: input.file.name,
        contentRef: "p0://inventory-correction/ICD-1/count.jpg",
        mimeType: input.file.type,
        fileSize: input.file.size,
        contentDataUrl: input.file.contentDataUrl,
        uploadedBy: input.operatorId,
      };
    },
    async createOfficeAttachment(input) {
      assert.equal(input.ownerId, "ICD-1");
      assert.equal(input.uploadedBy, "U-OFFICE-A");
      return { source: "api", attachment: { attachmentId: "ATT-COUNT-1", ...input } };
    },
    async linkOfficeInventoryCorrectionAttachments(input) {
      assert.equal(input.correctionDraftId, "ICD-1");
      assert.deepEqual(input.attachmentIds, ["ATT-COUNT-1"]);
      return {
        source: "api",
        linkage: {
          correctionDraftId: "ICD-1",
          attachmentIds: ["ATT-COUNT-1"],
          revision: 2,
          operationLogId: "LOG-LINK-1",
        },
      };
    },
  },
});
const attachmentResult = await attachmentCase.actions.linkInventoryCorrectionAttachment({
  draft: pendingDraft,
  file: { name: "count.jpg", type: "image/jpeg", size: 5 },
});
assert.deepEqual(attachmentResult.attachmentIds, ["ATT-COUNT-1"]);
assert.deepEqual(attachmentCase.states.drafts.value[0].attachmentIds, ["ATT-COUNT-1"]);
assert.deepEqual(attachmentCase.refreshCalls.map((item) => item.name).sort(), ["detail", "queue"]);
assert.match(attachmentResult.feedback, /不会修改库存/);

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

const temporaryHoldIntent = { intentId: "INT-1", revision: 1, intentType: "temporary_hold" };
const temporaryHold = {
  reservationId: "HOLD-1",
  inventoryItemId: "S001",
  reservedQty: 20,
  intent: { ...temporaryHoldIntent, revision: 2, intentStatus: "临时留货-生效" },
};
const holdCase = createInventoryWriteCase({
  api: {
    async createOfficeTemporaryInventoryHold(input) {
      assert.equal(input.intentId, "INT-1");
      assert.equal(input.expectedRevision, 1);
      return { source: "api", intent: temporaryHold.intent, hold: temporaryHold, inventoryItem: { inventoryItemId: "S001" } };
    },
    async extendOfficeTemporaryInventoryHold(input) {
      assert.equal(input.expectedRevision, 2);
      return { source: "api", intent: { ...temporaryHold.intent, revision: 3 }, hold: { ...temporaryHold, expiresAt: input.expiresAt } };
    },
    async releaseOfficeTemporaryInventoryHold(input) {
      assert.equal(input.expectedRevision, 2);
      return { source: "api", intent: { ...temporaryHold.intent, intentStatus: "已取消" }, hold: { ...temporaryHold, reservedQty: 0 } };
    },
  },
});
const holdCreated = await holdCase.actions.createTemporaryInventoryHold({
  intent: temporaryHoldIntent,
  candidateIndex: 0,
  inventoryItemId: "S001",
  qty: 20,
  reason: "客户明确留货",
});
assert.equal(holdCreated.blocked, undefined);
assert.deepEqual(holdCase.refreshCalls.map((item) => item.name).sort(), ["intents", "inventory", "ledger"]);
assert.match(holdCreated.feedback, /库存、流水和意图队列已同步/);

holdCase.refreshCalls.length = 0;
const holdExtended = await holdCase.actions.extendTemporaryInventoryHold({
  hold: temporaryHold,
  expiresAt: "2026-07-12T20:30:00+08:00",
  reason: "客户授权",
});
assert.equal(holdExtended.source, "api");
assert.equal(holdCase.states.intent.value.mutatingId, "");

holdCase.refreshCalls.length = 0;
const holdReleased = await holdCase.actions.releaseTemporaryInventoryHold({ hold: temporaryHold, reason: "客户取消" });
assert.equal(holdReleased.hold.reservedQty, 0);
assert.deepEqual(holdCase.refreshCalls.map((item) => item.name).sort(), ["intents", "inventory", "ledger"]);

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
  setInventoryIntentState() {},
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
  setInventoryIntentState() {},
  setInventoryLedgerState() {},
});
const blockedDetail = await blockedDetailActions.loadInventoryCorrectionDetail("ICD-1");
assert.equal(blockedDetail.blocked, true);
assert.equal(blockedDetailState.value.detail, null);

const intentReadState = createState({ items: [], holds: [], loading: false, error: "" });
const intentReadActions = createOfficeInventoryDetailReadActions({
  api: {
    async listOfficeInventoryIntents() {
      return { source: "api", items: [temporaryHoldIntent] };
    },
    async listOfficeTemporaryInventoryHolds() {
      return { source: "api", items: [temporaryHold] };
    },
  },
  authState: {},
  currentUserId: "U-OFFICE-A",
  serverRequired: () => true,
  setInventoryIntentState: intentReadState.set,
});
const intentRead = await intentReadActions.refreshInventoryIntents({ showToast: true });
assert.equal(intentReadState.value.items[0].intentId, "INT-1");
assert.equal(intentReadState.value.holds[0].reservationId, "HOLD-1");
assert.match(intentRead.feedback, /临时留货已刷新/);

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
for (const directWrite of [
  "createOfficeInventoryCorrectionDraft",
  "linkOfficeInventoryCorrectionAttachments",
  "confirmOfficeInventoryCorrectionDraft",
  "createOfficeTemporaryInventoryHold",
  "extendOfficeTemporaryInventoryHold",
  "releaseOfficeTemporaryInventoryHold",
]) {
  assert.equal(appSource.includes(directWrite), false, `App must not own ${directWrite}`);
}
const workspaceSource = readFileSync(new URL("../src/app/useOfficeWorkspace.js", import.meta.url), "utf8");
assert.match(workspaceSource, /useOfficeInventoryWrites/);
assert.match(workspaceSource, /\.\.\.inventoryWrites/);

console.log("Office inventory writes check passed: create/confirm, permission, conflict, production fail-closed, detail reads, and inventory/ledger/queue/todo refreshes are covered.");
