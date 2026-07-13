import { createLocalSeedAuthState } from "../src/services/officeAuthService.js";
import {
  confirmOfficeInventoryCorrectionDraft,
  createOfficeTemporaryInventoryHold,
  extendOfficeTemporaryInventoryHold,
  expireDueOfficeTemporaryInventoryHolds,
  createOfficeInventoryCorrectionDraft,
  getOfficeInventoryCorrectionDetail,
  listOfficeInventoryCorrectionDrafts,
  listOfficeInventoryItems,
  listOfficeInventoryLedgerEntries,
  listOfficeInventoryIntents,
  listOfficeTemporaryInventoryHolds,
  linkOfficeInventoryCorrectionAttachments,
  releaseOfficeTemporaryInventoryHold,
  mapApiInventoryCorrectionConfirmToLocal,
  mapApiInventoryCorrectionDetailToLocal,
  mapApiInventoryCorrectionDraftSummaryToLocal,
  mapApiInventoryItemToLocal,
  mapApiInventoryLedgerEntryToLocal,
  mapInventoryCorrectionReason,
} from "../src/services/officeInventoryApiClient.js";

const authState = createLocalSeedAuthState("U-OFFICE-A");
const stock = {
  id: "30*38*10-红色-普通提-空白袋-A区-30*38",
  size: "30*38*10",
  color: "红色",
  handle: "普通提",
  style: "空白袋",
  zone: "A区-30*38",
  inStock: 2480,
  reserved: 1320,
  locked: 120,
  pending: 0,
};

assert(mapInventoryCorrectionReason("盘点差异") === "cycle_count", "cycle-count reason was not mapped");
assert(mapInventoryCorrectionReason("找不到货") === "outbound_found_mismatch", "outbound mismatch reason was not mapped");
assert(mapInventoryCorrectionReason("车间报数需复核") === "workshop_report_check", "workshop reason was not mapped");
assert(mapInventoryCorrectionReason("待处理转报废") === "damaged_or_scrap", "scrap reason was not mapped");
assert(mapInventoryCorrectionReason("未知原因") === "manual_review", "unknown reason should fall back to manual_review");

const mappedInventoryItem = mapApiInventoryItemToLocal({
  inventoryItemId: stock.id,
  inventoryKey: "30*38*10|红色|普通提|空白袋|A区-30*38|仓库已清点",
  size: stock.size,
  color: stock.color,
  handleType: stock.handle,
  style: stock.style,
  zone: stock.zone,
  state: "reserved",
  quantities: {
    onHand: 2480,
    reserved: 1320,
    waitingPickupLocked: 120,
    pendingHandling: 0,
  },
  trustLevel: "counted",
  sourceSummary: "仓库已清点",
});
assert(mappedInventoryItem.id === stock.id, "inventory item mapper missed id");
assert(mappedInventoryItem.handle === stock.handle, "inventory item mapper missed handle");
assert(mappedInventoryItem.state === "已占用", "inventory item mapper did not map API state");
assert(mappedInventoryItem.inStock === 2480, "inventory item mapper missed on-hand quantity");
assert(mappedInventoryItem.reserved === 1320, "inventory item mapper missed reserved quantity");
assert(mappedInventoryItem.locked === 120, "inventory item mapper missed waiting pickup quantity");

const inventoryCalls = [];
const inventoryListResult = await listOfficeInventoryItems(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.inventory-list-check" },
    },
    operatorId: "U-OFFICE-A",
    page: 1,
    pageSize: 200,
    filters: {
      keyword: stock.id,
      color: "红色",
    },
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      inventoryCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [mappedInventoryItem],
        page: 1,
        pageSize: 200,
        total: 1,
      });
    },
  },
);
assert(inventoryListResult.source === "api", "inventory list did not use the API response");
assert(inventoryListResult.items[0].id === stock.id, "inventory list item was not mapped");
assert(
  inventoryCalls[0]?.url ===
    `http://127.0.0.1:8787/api/inventory/items?page=1&pageSize=200&keyword=${encodeURIComponent(
      stock.id,
    )}&color=${encodeURIComponent("红色")}`,
  "inventory list API URL is incorrect",
);
assert(inventoryCalls[0]?.init.method === "GET", "inventory list API method is incorrect");
assert(inventoryCalls[0]?.init.headers.authorization === "Bearer seed-session.inventory-list-check", "inventory list did not send bearer auth");

const deniedInventoryListResult = await listOfficeInventoryItems(
  {
    authState,
    operatorId: "U-FINANCE-A",
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: inventory.view",
        requiredPermission: "inventory.view",
      }),
  },
);
assert(deniedInventoryListResult.blocked === true, "inventory list API permission denial should block local fallback");
assert(deniedInventoryListResult.error.requiredPermission === "inventory.view", "inventory list permission denial was not surfaced");

const fallbackInventoryListResult = await listOfficeInventoryItems(
  {
    authState,
    operatorId: "U-OFFICE-A",
    localInventoryRecords: [stock],
    filters: { keyword: "30*38" },
  },
  {
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);
assert(fallbackInventoryListResult.source === "local_fallback", "inventory list network failure should fall back locally");
assert(fallbackInventoryListResult.items[0].id === stock.id, "inventory list fallback entries were not mapped");

const intentCalls = [];
const inventoryIntent = {
  intentId: "INT-CLIENT-001",
  intentType: "temporary_hold",
  intentStatus: "临时留货-待确认",
  revision: 1,
};
const intentList = await listOfficeInventoryIntents(
  { authState, operatorId: "U-OFFICE-A", filters: { intentType: "temporary_hold", customerId: "C001" } },
  {
    fetchImpl: async (url, init) => {
      intentCalls.push({ url, init });
      return createJsonResponse(200, { items: [inventoryIntent] });
    },
  },
);
assert(intentList.source === "api" && intentList.items[0].intentId === inventoryIntent.intentId, "inventory intent list was not read");
assert(intentCalls[0].url.includes("intentType=temporary_hold"), "inventory intent filters were not sent");

const writeCalls = [];
const writeOptions = {
  fetchImpl: async (url, init) => {
    writeCalls.push({ url, init, body: JSON.parse(init.body) });
    return createJsonResponse(200, { intent: inventoryIntent, hold: { reservationId: "HOLD-CLIENT-001" }, operationLogId: "LOG-1" });
  },
};
await createOfficeTemporaryInventoryHold(
  { authState, operatorId: "U-OFFICE-A", intentId: inventoryIntent.intentId, clientRevision: 1, candidateIndex: 0, qty: 120 },
  writeOptions,
);
await extendOfficeTemporaryInventoryHold(
  { authState, operatorId: "U-OFFICE-A", holdId: "HOLD-CLIENT-001", clientRevision: 2, expiresAt: "2026-07-12T20:30:00+08:00", reason: "客户授权" },
  writeOptions,
);
await releaseOfficeTemporaryInventoryHold(
  { authState, operatorId: "U-OFFICE-A", holdId: "HOLD-CLIENT-001", clientRevision: 3, reason: "客户取消" },
  writeOptions,
);
await expireDueOfficeTemporaryInventoryHolds({ authState, operatorId: "U-OFFICE-A" }, writeOptions);
assert(writeCalls[0].url.endsWith("/inventory/intents/INT-CLIENT-001/hold"), "temporary hold create URL is incorrect");
assert(writeCalls[0].body.operatorId === undefined, "operator identity must not be copied into the business payload");
assert(writeCalls[1].url.endsWith("/inventory/holds/HOLD-CLIENT-001/extend"), "temporary hold extend URL is incorrect");
assert(writeCalls[2].url.endsWith("/inventory/holds/HOLD-CLIENT-001/release"), "temporary hold release URL is incorrect");
assert(writeCalls[3].url.endsWith("/inventory/holds/expire-due"), "temporary hold expiry URL is incorrect");

const holds = await listOfficeTemporaryInventoryHolds(
  { authState, operatorId: "U-OFFICE-A", filters: { status: "生效" } },
  { fetchImpl: async () => createJsonResponse(200, { items: [{ reservationId: "HOLD-CLIENT-001", status: "生效" }] }) },
);
assert(holds.items[0].reservationId === "HOLD-CLIENT-001", "temporary hold list was not read");

const mappedLedgerEntry = mapApiInventoryLedgerEntryToLocal({
  ledgerId: "LEDGER-API-MAP-1",
  inventoryItemId: stock.id,
  inventoryKey: "30*38*10|红色|普通提|空白袋|A区-30*38|仓库已清点",
  size: "30*38*10",
  colorName: "红色",
  handleType: "普通提",
  style: "空白袋",
  zone: "A区-30*38",
  inventoryState: "仓库已清点",
  changeType: "correction",
  qtyBefore: 2480,
  qtyChange: 20,
  qtyAfter: 2500,
  sourceType: "inventory_correction",
  sourceId: "ADJ-API-CHECK-1",
  operatorId: "U-WAREHOUSE-A",
  operatorName: "仓库A",
  confirmedBy: "U-MANAGER-A",
  confirmedByName: "经理A",
  occurredAt: "2026-07-02T10:30:00.000Z",
  reason: "cycle_count",
});
assert(mappedLedgerEntry.ledgerId === "LEDGER-API-MAP-1", "inventory ledger mapper missed ledgerId");
assert(mappedLedgerEntry.color === "红色", "inventory ledger mapper missed compact color field");
assert(mappedLedgerEntry.qtyChange === 20, "inventory ledger mapper missed quantity change");
assert(mappedLedgerEntry.sourceId === "ADJ-API-CHECK-1", "inventory ledger mapper missed sourceId");

const mappedCorrectionDetail = mapApiInventoryCorrectionDetailToLocal({
  correctionDraftId: "ADJ-API-CHECK-1",
  inventoryItemId: stock.id,
  status: "已确认生效",
  reason: "cycle_count",
  remark: "API client detail check",
  qtyBefore: { onHand: 2480, reserved: 1320, available: 1040, waitingPickupLocked: 120, pendingHandling: 0 },
  requestedQtyAfter: { onHand: 2500, reserved: 1320, available: 1060, waitingPickupLocked: 120, pendingHandling: 0 },
  inventoryItem: {
    id: stock.id,
    size: stock.size,
    color: stock.color,
    handle: stock.handle,
    style: stock.style,
    zone: stock.zone,
  },
  operatorId: "U-WAREHOUSE-A",
  operatorName: "仓库A",
  confirmedBy: "U-MANAGER-A",
  confirmedByName: "经理A",
  ledger: mappedLedgerEntry,
  operationLogs: [
    {
      operationLogId: "LOG-INVENTORY-CHECK-1",
      targetType: "inventory_correction",
      targetId: "ADJ-API-CHECK-1",
      action: "confirm_inventory_correction_draft",
      operatorId: "U-MANAGER-A",
      createdAt: "2026-07-02T10:30:00.000Z",
    },
  ],
});
assert(mappedCorrectionDetail.id === "ADJ-API-CHECK-1", "inventory correction detail mapper missed id");
assert(mappedCorrectionDetail.status === "已确认生效", "inventory correction detail mapper missed status");
assert(mappedCorrectionDetail.diff === 20, "inventory correction detail mapper missed quantity diff");
assert(mappedCorrectionDetail.ledger.ledgerId === "LEDGER-API-MAP-1", "inventory correction detail mapper missed ledger");
assert(mappedCorrectionDetail.operationLogs[0].operationLogId === "LOG-INVENTORY-CHECK-1", "inventory correction detail mapper missed operation log");

const mappedCorrectionSummary = mapApiInventoryCorrectionDraftSummaryToLocal({
  correctionDraftId: "ADJ-API-QUEUE-1",
  inventoryItemId: stock.id,
  status: "待确认生效",
  reason: "cycle_count",
  remark: "待管理确认",
  qtyBefore: { onHand: stock.inStock, reserved: stock.reserved, available: 1040, waitingPickupLocked: stock.locked, pendingHandling: stock.pending },
  requestedQtyAfter: { onHand: stock.inStock + 9, reserved: stock.reserved, available: 1049, waitingPickupLocked: stock.locked, pendingHandling: stock.pending },
  inventoryItem: {
    id: stock.id,
    size: stock.size,
    color: stock.color,
    handle: stock.handle,
    style: stock.style,
    zone: stock.zone,
  },
  operatorId: "U-WAREHOUSE-A",
  operatorName: "仓库A",
  todoId: "T-QUEUE-1",
});
assert(mappedCorrectionSummary.id === "ADJ-API-QUEUE-1", "inventory correction queue mapper missed id");
assert(mappedCorrectionSummary.status === "待确认生效", "inventory correction queue mapper missed status");
assert(mappedCorrectionSummary.diff === 9, "inventory correction queue mapper missed quantity diff");

const correctionQueueCalls = [];
const correctionQueueResult = await listOfficeInventoryCorrectionDrafts(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.inventory-correction-queue-check" },
    },
    operatorId: "U-OFFICE-A",
    page: 1,
    pageSize: 20,
    filters: {
      status: "待确认生效",
      inventoryItemId: stock.id,
      keyword: "队列",
    },
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      correctionQueueCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [mappedCorrectionSummary],
        page: 1,
        pageSize: 20,
        total: 1,
      });
    },
  },
);
assert(correctionQueueResult.source === "api", "inventory correction queue did not use API response");
assert(correctionQueueResult.items[0].id === "ADJ-API-QUEUE-1", "inventory correction queue item was not mapped");
assert(
  correctionQueueCalls[0]?.url ===
    `http://127.0.0.1:8787/api/inventory/correction-drafts?page=1&pageSize=20&status=${encodeURIComponent(
      "待确认生效",
    )}&inventoryItemId=${encodeURIComponent(stock.id)}&keyword=${encodeURIComponent("队列")}`,
  "inventory correction queue API URL is incorrect",
);
assert(correctionQueueCalls[0]?.init.method === "GET", "inventory correction queue API method is incorrect");
assert(
  correctionQueueCalls[0]?.init.headers.authorization === "Bearer seed-session.inventory-correction-queue-check",
  "inventory correction queue API did not send bearer auth",
);

const fallbackCorrectionQueueResult = await listOfficeInventoryCorrectionDrafts(
  {
    authState,
    operatorId: "U-OFFICE-A",
    filters: { status: "待确认生效", keyword: "待管理" },
    localCorrectionDrafts: [
      mappedCorrectionSummary,
      { ...mappedCorrectionSummary, correctionDraftId: "ADJ-API-QUEUE-2", id: "ADJ-API-QUEUE-2", status: "已确认生效" },
    ],
  },
  {
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);
assert(fallbackCorrectionQueueResult.source === "local_fallback", "inventory correction queue should fall back locally");
assert(fallbackCorrectionQueueResult.total === 1, "inventory correction queue fallback did not apply filters");

const mappedCorrectionConfirm = mapApiInventoryCorrectionConfirmToLocal({
  correctionDraftId: "ADJ-API-QUEUE-1",
  inventoryItemId: stock.id,
  qtyBefore: { onHand: stock.inStock, reserved: stock.reserved, available: 1040, waitingPickupLocked: stock.locked, pendingHandling: stock.pending },
  qtyAfter: { onHand: stock.inStock + 9, reserved: stock.reserved, available: 1049, waitingPickupLocked: stock.locked, pendingHandling: stock.pending },
  ledger: {
    ...mappedLedgerEntry,
    ledgerId: "LEDGER-API-CONFIRM-1",
    qtyBefore: stock.inStock,
    qtyChange: 9,
    qtyAfter: stock.inStock + 9,
    sourceId: "ADJ-API-QUEUE-1",
  },
  todo: { todoId: "T-QUEUE-1", handled: true },
  operationLogId: "LOG-INVENTORY-CONFIRM-1",
});
assert(mappedCorrectionConfirm.status === "已确认生效", "inventory correction confirm mapper missed status");
assert(mappedCorrectionConfirm.ledger.ledgerId === "LEDGER-API-CONFIRM-1", "inventory correction confirm mapper missed ledger");
assert(mappedCorrectionConfirm.diff === 9, "inventory correction confirm mapper missed quantity diff");

const correctionAttachmentLinkCalls = [];
const correctionAttachmentLinkResult = await linkOfficeInventoryCorrectionAttachments(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.inventory-correction-attachment-check" },
    },
    operatorId: "U-WAREHOUSE-A",
    correctionDraftId: "ADJ-API-QUEUE-1",
    attachmentIds: ["ATT-CORRECTION-1", "ATT-CORRECTION-1"],
    remark: "盘点照片",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      correctionAttachmentLinkCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        correctionDraftId: "ADJ-API-QUEUE-1",
        attachmentIds: ["ATT-CORRECTION-1"],
        revision: 2,
        unchanged: false,
        operationLogId: "LOG-CORRECTION-ATTACHMENT-1",
      });
    },
  },
);
assert(correctionAttachmentLinkResult.source === "api", "inventory correction attachment link did not use API");
assert(
  JSON.stringify(correctionAttachmentLinkResult.linkage.attachmentIds) === JSON.stringify(["ATT-CORRECTION-1"]),
  "inventory correction attachment IDs were not mapped",
);
assert(correctionAttachmentLinkResult.linkage.revision === 2, "inventory correction attachment revision was not mapped");
assert(
  correctionAttachmentLinkCalls[0]?.url ===
    "http://127.0.0.1:8787/api/inventory/correction-drafts/ADJ-API-QUEUE-1/attachments",
  "inventory correction attachment link URL is incorrect",
);
assert(correctionAttachmentLinkCalls[0]?.body.operatorId === "U-WAREHOUSE-A", "attachment link operator was not sent");
assert(
  JSON.stringify(correctionAttachmentLinkCalls[0]?.body.attachmentIds) === JSON.stringify(["ATT-CORRECTION-1"]),
  "inventory correction attachment IDs were not sent",
);

const correctionConfirmCalls = [];
const correctionConfirmResult = await confirmOfficeInventoryCorrectionDraft(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.inventory-correction-confirm-check" },
    },
    operatorId: "U-MANAGER-A",
    correctionDraftId: "ADJ-API-QUEUE-1",
    approvalReason: "API client confirm check",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      correctionConfirmCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        correctionDraftId: "ADJ-API-QUEUE-1",
        inventoryItemId: stock.id,
        qtyBefore: { onHand: stock.inStock },
        qtyAfter: { onHand: stock.inStock + 9 },
        ledger: {
          ...mappedLedgerEntry,
          ledgerId: "LEDGER-API-CONFIRM-1",
          qtyBefore: stock.inStock,
          qtyChange: 9,
          qtyAfter: stock.inStock + 9,
          sourceId: "ADJ-API-QUEUE-1",
        },
        todo: { todoId: "T-QUEUE-1", handled: true },
        operationLogId: "LOG-INVENTORY-CONFIRM-1",
      });
    },
  },
);
assert(correctionConfirmResult.source === "api", "inventory correction confirm did not use API response");
assert(
  correctionConfirmCalls[0]?.url === "http://127.0.0.1:8787/api/inventory/correction-drafts/ADJ-API-QUEUE-1/confirm",
  "inventory correction confirm API URL is incorrect",
);
assert(correctionConfirmCalls[0]?.init.method === "POST", "inventory correction confirm API method is incorrect");
assert(
  correctionConfirmCalls[0]?.init.headers.authorization === "Bearer seed-session.inventory-correction-confirm-check",
  "inventory correction confirm API did not send bearer auth",
);
assert(correctionConfirmCalls[0]?.body.operatorId === "U-MANAGER-A", "inventory correction confirm request missed operatorId");
assert(correctionConfirmCalls[0]?.body.approvalReason === "API client confirm check", "inventory correction confirm request missed approvalReason");
assert(correctionConfirmResult.confirmation.ledger.ledgerId === "LEDGER-API-CONFIRM-1", "inventory correction confirm response was not mapped");

const deniedCorrectionConfirmResult = await confirmOfficeInventoryCorrectionDraft(
  {
    authState,
    operatorId: "U-WAREHOUSE-A",
    correctionDraftId: "ADJ-API-QUEUE-1",
    approvalReason: "denied",
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: inventory.correction.confirm",
        requiredPermission: "inventory.correction.confirm",
      }),
  },
);
assert(deniedCorrectionConfirmResult.blocked === true, "inventory correction confirm permission denial should block fallback");
assert(
  deniedCorrectionConfirmResult.error.requiredPermission === "inventory.correction.confirm",
  "inventory correction confirm permission denial was not surfaced",
);

const correctionDetailCalls = [];
const correctionDetailResult = await getOfficeInventoryCorrectionDetail(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.inventory-correction-detail-check" },
    },
    operatorId: "U-OFFICE-A",
    correctionDraftId: "ADJ-API-CHECK-1",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      correctionDetailCalls.push({ url, init });
      return createJsonResponse(200, {
        ...mappedCorrectionDetail,
        correctionDraftId: "ADJ-API-CHECK-1",
        qtyBefore: { onHand: 2480 },
        requestedQtyAfter: { onHand: 2500 },
      });
    },
  },
);
assert(correctionDetailResult.source === "api", "inventory correction detail did not use API response");
assert(correctionDetailResult.detail.id === "ADJ-API-CHECK-1", "inventory correction detail response was not mapped");
assert(
  correctionDetailCalls[0]?.url === "http://127.0.0.1:8787/api/inventory/correction-drafts/ADJ-API-CHECK-1",
  "inventory correction detail API URL is incorrect",
);
assert(correctionDetailCalls[0]?.init.method === "GET", "inventory correction detail API method is incorrect");
assert(
  correctionDetailCalls[0]?.init.headers.authorization === "Bearer seed-session.inventory-correction-detail-check",
  "inventory correction detail API did not send bearer auth",
);

const fallbackCorrectionDetailResult = await getOfficeInventoryCorrectionDetail(
  {
    authState,
    operatorId: "U-OFFICE-A",
    correctionDraftId: "ADJ-FALLBACK-1",
    sourceEntry: {
      ledgerId: "LEDGER-FALLBACK-CORRECTION-1",
      inventoryItemId: stock.id,
      changeType: "correction",
      qtyBefore: 2480,
      qtyChange: 8,
      qtyAfter: 2488,
      sourceType: "inventory_correction",
      sourceId: "ADJ-FALLBACK-1",
    },
  },
  {
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);
assert(fallbackCorrectionDetailResult.source === "local_fallback", "inventory correction detail should fall back locally");
assert(fallbackCorrectionDetailResult.detail.actualQty === 2488, "inventory correction detail fallback missed ledger quantity");

const ledgerCalls = [];
const ledgerResult = await listOfficeInventoryLedgerEntries(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.inventory-ledger-check" },
    },
    operatorId: "U-OFFICE-A",
    page: 2,
    pageSize: 20,
    filters: {
      inventoryItemId: stock.id,
      changeType: "correction",
      sourceType: "inventory_correction",
      keyword: "红色",
      dateFrom: "2026-07-02",
      dateTo: "2026-07-02",
    },
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      ledgerCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [
          {
            ledgerId: "LEDGER-API-CHECK-1",
            inventoryItemId: stock.id,
            inventoryKey: "30*38*10|红色|普通提|空白袋|A区-30*38|仓库已清点",
            size: "30*38*10",
            colorName: "红色",
            handleType: "普通提",
            style: "空白袋",
            zone: "A区-30*38",
            inventoryState: "仓库已清点",
            changeType: "correction",
            qtyBefore: 2480,
            qtyChange: 20,
            qtyAfter: 2500,
            sourceType: "inventory_correction",
            sourceId: "ADJ-API-CHECK-1",
            operatorName: "仓库A",
            occurredAt: "2026-07-02T10:30:00.000Z",
          },
        ],
        page: 2,
        pageSize: 20,
        total: 1,
        filters: {
          inventoryItemId: stock.id,
          changeType: "correction",
          sourceType: "inventory_correction",
          keyword: "红色",
          dateFrom: "2026-07-02",
          dateTo: "2026-07-02",
        },
      });
    },
  },
);

assert(ledgerResult.source === "api", "inventory ledger list did not use the API response");
assert(
  ledgerCalls[0]?.url ===
    `http://127.0.0.1:8787/api/inventory/ledger-entries?page=2&pageSize=20&inventoryItemId=${encodeURIComponent(
      stock.id,
    )}&changeType=correction&sourceType=inventory_correction&keyword=${encodeURIComponent("红色")}&dateFrom=2026-07-02&dateTo=2026-07-02`,
  "inventory ledger API URL is incorrect",
);
assert(ledgerCalls[0]?.init.method === "GET", "inventory ledger API method is incorrect");
assert(
  ledgerCalls[0]?.init.headers.authorization === "Bearer seed-session.inventory-ledger-check",
  "inventory ledger API did not send bearer auth",
);
assert(ledgerResult.items[0].ledgerId === "LEDGER-API-CHECK-1", "inventory ledger API response ledger id was not mapped");
assert(ledgerResult.items[0].qtyAfter === 2500, "inventory ledger API response quantities were not mapped");
assert(ledgerResult.page === 2 && ledgerResult.pageSize === 20 && ledgerResult.total === 1, "inventory ledger pagination was not mapped");

const deniedLedgerResult = await listOfficeInventoryLedgerEntries(
  {
    authState,
    operatorId: "U-FINANCE-A",
    filters: { inventoryItemId: stock.id },
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: inventory.view",
        requiredPermission: "inventory.view",
      }),
  },
);
assert(deniedLedgerResult.blocked === true, "inventory ledger API permission denial should block local fallback");
assert(deniedLedgerResult.error.requiredPermission === "inventory.view", "inventory ledger permission denial was not surfaced");

const fallbackLedgerResult = await listOfficeInventoryLedgerEntries(
  {
    authState,
    operatorId: "U-OFFICE-A",
    filters: {
      inventoryItemId: stock.id,
      changeType: "release",
      sourceType: "inventory_reservation_release",
      keyword: "释放检查",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-02",
    },
    localLedgerEntries: [
      {
        ledgerId: "LEDGER-FALLBACK-1",
        inventoryItemId: stock.id,
        changeType: "release",
        sourceType: "inventory_reservation_release",
        sourceId: "RSV-FALLBACK-1",
        qtyBefore: 1200,
        qtyChange: 100,
        qtyAfter: 1100,
        remark: "释放检查",
        occurredAt: "2026-07-02T12:00:00.000Z",
      },
      {
        ledgerId: "LEDGER-FALLBACK-2",
        inventoryItemId: stock.id,
        changeType: "correction",
        sourceType: "inventory_correction",
        sourceId: "ADJ-FALLBACK-2",
        qtyBefore: 1200,
        qtyChange: 5,
        qtyAfter: 1205,
        remark: "盘点检查",
        occurredAt: "2026-07-02T13:00:00.000Z",
      },
    ],
  },
  {
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);
assert(fallbackLedgerResult.source === "local_fallback", "inventory ledger network failure should fall back locally");
assert(fallbackLedgerResult.items[0].ledgerId === "LEDGER-FALLBACK-1", "inventory ledger fallback entries were not mapped");
assert(fallbackLedgerResult.total === 1, "inventory ledger fallback did not apply filters");

const apiCalls = [];
const apiResult = await createOfficeInventoryCorrectionDraft(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.inventory-check" },
    },
    stock,
    expectedQty: stock.inStock,
    actualQty: 2500,
    reason: "盘点差异",
    operatorId: "U-OFFICE-A",
    remark: "API client check",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      apiCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        correctionDraftId: "ADJ-API-CHECK-1",
        inventoryItemId: stock.id,
        status: "待确认生效",
        qtyBefore: {
          onHand: stock.inStock,
          reserved: stock.reserved,
          available: 1040,
          waitingPickupLocked: stock.locked,
          pendingHandling: stock.pending,
        },
        requestedQtyAfter: {
          onHand: 2500,
          reserved: stock.reserved,
          available: 1060,
          waitingPickupLocked: stock.locked,
          pendingHandling: stock.pending,
        },
        todoId: "T-API-CHECK-1",
        operationLogId: "LOG-INVENTORY-CHECK-1",
      });
    },
  },
);

assert(apiResult.source === "api", "inventory correction did not use the API response");
assert(apiCalls[0]?.url === "http://127.0.0.1:8787/api/inventory/correction-drafts", "inventory correction API URL is incorrect");
assert(apiCalls[0]?.init.method === "POST", "inventory correction API method is incorrect");
assert(apiCalls[0]?.init.headers.authorization === "Bearer seed-session.inventory-check", "inventory API did not send bearer auth");
assert(apiCalls[0]?.body.inventoryItemId === stock.id, "inventory correction request missed inventoryItemId");
assert(apiCalls[0]?.body.expectedQty === stock.inStock, "inventory correction request missed expectedQty");
assert(apiCalls[0]?.body.actualQty === 2500, "inventory correction request missed actualQty");
assert(apiCalls[0]?.body.reason === "cycle_count", "inventory correction request reason is incorrect");
assert(apiCalls[0]?.body.operatorId === "U-OFFICE-A", "inventory correction request missed operatorId");
assert(apiResult.draft.id === "ADJ-API-CHECK-1", "inventory correction API response draft id was not mapped");
assert(apiResult.draft.systemQty === stock.inStock && apiResult.draft.actualQty === 2500, "inventory correction quantities were not mapped");
assert(apiResult.draft.diff === 20, "inventory correction diff was not mapped");
assert(apiResult.todoId === "T-API-CHECK-1" && apiResult.operationLogId === "LOG-INVENTORY-CHECK-1", "inventory correction API metadata was not mapped");

const headerCalls = [];
await createOfficeInventoryCorrectionDraft(
  {
    authState,
    stock,
    expectedQty: stock.inStock,
    actualQty: 2400,
    reason: "找不到货",
    operatorId: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async (url, init) => {
      headerCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        correctionDraftId: "ADJ-API-CHECK-2",
        inventoryItemId: stock.id,
        status: "待确认生效",
        qtyBefore: { onHand: stock.inStock, reserved: 0, available: stock.inStock, waitingPickupLocked: 0, pendingHandling: 0 },
        requestedQtyAfter: { onHand: 2400, reserved: 0, available: 2400, waitingPickupLocked: 0, pendingHandling: 0 },
        operationLogId: "LOG-INVENTORY-CHECK-2",
      });
    },
  },
);
assert(headerCalls[0]?.init.headers["x-erp-user-id"] === "U-WAREHOUSE-A", "inventory API did not send seed user header without a bearer token");
assert(headerCalls[0]?.body.reason === "outbound_found_mismatch", "warehouse correction reason was not mapped");

const deniedResult = await createOfficeInventoryCorrectionDraft(
  {
    authState,
    stock,
    expectedQty: stock.inStock,
    actualQty: 2500,
    reason: "盘点差异",
    operatorId: "U-FINANCE-A",
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: inventory.correction.create",
        requiredPermission: "inventory.correction.create",
      }),
  },
);

assert(deniedResult.blocked === true, "inventory correction API permission denial should block local fallback");
assert(deniedResult.error.requiredPermission === "inventory.correction.create", "inventory correction permission denial was not surfaced");

const fallbackResult = await createOfficeInventoryCorrectionDraft(
  {
    authState,
    stock,
    expectedQty: stock.inStock,
    actualQty: 2501,
    reason: "其他",
    operatorId: "U-OFFICE-A",
  },
  {
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);

assert(fallbackResult.source === "local_fallback", "inventory correction network failure should fall back locally");
assert(fallbackResult.draft.id.startsWith("ADJ-FE-"), "inventory correction fallback draft id is incorrect");
assert(fallbackResult.draft.status === "待确认生效", "inventory correction fallback draft status is incorrect");
assert(fallbackResult.draft.systemQty === stock.inStock && fallbackResult.draft.actualQty === 2501, "inventory correction fallback quantities are incorrect");

const strictFallbackResult = await createOfficeInventoryCorrectionDraft(
  {
    authState,
    stock,
    expectedQty: stock.inStock,
    actualQty: 2501,
    reason: "其他",
    operatorId: "U-OFFICE-A",
  },
  {
    serverRequired: true,
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);

assert(strictFallbackResult.blocked === true, "strict inventory correction must not use the local projection");
assert(strictFallbackResult.source === "api_error", "strict inventory correction should report an API error");
assert(strictFallbackResult.error?.code === "INVENTORY_CORRECTION_API_UNAVAILABLE", "strict inventory correction reported the wrong API error");

console.log(
  "Frontend inventory API client check passed: inventory list, ledger list, correction queue/detail/confirm/draft API calls, denial blocking, and local fallback are covered.",
);

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
