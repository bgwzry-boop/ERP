import { createLocalSeedAuthState, isOfficeApiServerRequired } from "../src/services/officeAuthService.js";
import {
  confirmOfficeDraftViaApi,
  confirmOfficeDraftSplit,
  getOfficeDraft,
  listOfficeDraftQueue,
  linkOfficeDraftShortageCancellation,
  mapDraftRowsToApiLines,
  mapRecognizedDraftRows,
  recognizeOfficeDraft,
  recognizeOfficeDraftQueue,
  previewOfficeDraftSplit,
  resolveOfficeOrderConfirmationStrategy,
  restoreOfficeDraftShortageCancellation,
  saveOfficeDraft,
} from "../src/services/officeOrderApiClient.js";

const authState = createLocalSeedAuthState("U-OFFICE-A");
assert(isOfficeApiServerRequired({ runtimeMode: "production" }) === true, "production runtime mode must require the server");
assert(isOfficeApiServerRequired({ runtimeMode: "prototype" }) === false, "prototype runtime mode should allow the local demo fallback");
const inventories = [
  {
    id: "INV-CHECK-1",
    size: "30*38*10",
    color: "红色",
    handle: "普通提",
    style: "空白袋",
    state: "仓库已清点",
    inStock: 1000,
    reserved: 0,
    locked: 0,
    pending: 0,
    estimated: false,
  },
];

const apiResponse = {
  draft: {
    draftId: "DRAFT-API-CHECK",
    status: "待审核",
    sourceText: "张三服饰 30*38 红500 明天自提",
    sourceChannel: "manual",
    customerId: "C001",
    customerName: "张三服饰",
    clientRevision: 1,
  },
  lines: [
    {
      draftLineId: "DRAFT-LINE-CHECK-1",
      customerId: "C001",
      customerName: "张三服饰",
      productName: "空白袋",
      orderType: "stock",
      size: "30*38*10",
      bagColor: "红色",
      handleType: "普通提",
      style: "空白袋",
      qty: 500,
      fulfillmentMethod: "自提",
      latestNeededAt: "明天",
      printFlag: false,
      printSide: "unknown",
      recognitionStatus: "high_confidence",
      missingFields: [],
      recognitionEvidence: { sourceText: "张三服饰 30*38 红500 明天自提" },
    },
  ],
  recognition: {
    version: "wechat-order-conversation-v1",
    sourceMessages: [{ id: "MSG-CHECK-1", intentType: "explicit_order" }],
    draftGroups: [{ id: "ODG-MSG-CHECK-1" }],
    nonOrderIntents: [],
    temporaryHolds: [],
    summary: { orderRowCount: 1, inventoryInquiryCount: 0, temporaryHoldCount: 0, duplicateCandidateCount: 0 },
  },
  riskHints: [],
  operationLogId: "LOG-CHECK-1",
};

const mappedRows = mapRecognizedDraftRows(apiResponse, { inventories });
assert(mappedRows.length === 1, "recognized API rows were not mapped");
assert(mappedRows[0].id === "DRAFT-LINE-CHECK-1", "draftLineId was not mapped to row id");
assert(mappedRows[0].customerId === "C001" && mappedRows[0].customer === "张三服饰", "line customer fields were not mapped");
assert(mappedRows[0].print === "否" && mappedRows[0].printSide === "非印刷", "non-print fields were mapped incorrectly");
assert(mappedRows[0].inventory === "可用", "mapped row was not enriched with local inventory snapshot");
assert(mappedRows[0].amount === 170, "mapped row amount snapshot is incorrect");

const mappedChinesePrintSideRows = mapRecognizedDraftRows({
  draft: { ...apiResponse.draft, customerId: "C004", customerName: "美的空调网店" },
  lines: [{
    ...apiResponse.lines[0],
    draftLineId: "DRAFT-LINE-CUSTOM-SIDE",
    customerId: "C004",
    customerName: "美的空调网店",
    orderType: "custom_print",
    bagColor: "白色",
    printFlag: true,
    printColor: "黑色",
    printSide: "单面",
  }],
}, { inventories: [] });
assert(
  mappedChinesePrintSideRows[0].printSide === "单面",
  "recognized Chinese print-side value should remain a valid custom-print field",
);

const apiLineInputs = mapDraftRowsToApiLines(mappedRows, apiResponse.draft.sourceText);
assert(apiLineInputs[0].draftLineId === "DRAFT-LINE-CHECK-1", "draft row id was not mapped to API line input");
assert(apiLineInputs[0].customerId === "C001", "draft row customerId was not mapped to API line input");
assert(apiLineInputs[0].orderType === "stock" && apiLineInputs[0].printFlag === false, "stock draft line was not mapped correctly");
assert(!Object.hasOwn(apiLineInputs[0], "printSide"), "non-print draft line should not send printSide");
const heldLineInput = mapDraftRowsToApiLines([{
  ...mappedRows[0],
  sourceHoldId: "HOLD-CLIENT-1",
  sourceIntentId: "INT-CLIENT-1",
}], apiResponse.draft.sourceText)[0];
assert(heldLineInput.recognitionEvidence.sourceHoldId === "HOLD-CLIENT-1", "temporary hold id was not mapped");
assert(heldLineInput.recognitionEvidence.sourceIntentId === "INT-CLIENT-1", "inventory intent id was not mapped");

const customLineInputs = mapDraftRowsToApiLines([
  {
    id: "DRAFT-LINE-CUSTOM-1",
    customerId: "C001",
    customer: "张三服饰",
    product: "美的空调",
    size: "30*38*10",
    color: "白色",
    handle: "加长提",
    handleColor: "黑色",
    style: "美的空调",
    print: "是",
    printSide: "双面",
    printColor: "黑色",
    qty: 1000,
    fulfillment: "快递快运",
    latest: "周五",
    artworkStatus: "已上传",
    note: "白袋黑提",
  },
]);
assert(customLineInputs[0].orderType === "custom_print", "custom print line orderType was not mapped");
assert(customLineInputs[0].printSide === "double", "custom print side was not mapped to API enum");
assert(customLineInputs[0].handleColor === "黑色", "custom handle color was not mapped");
assert(customLineInputs[0].artworkStatus === "uploaded", "ready artwork status was not mapped to API enum");

const apiCalls = [];
const apiResult = await recognizeOfficeDraft(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.order-check" },
    },
    customers: [],
    inventories,
    operatorId: "U-OFFICE-A",
    sourceText: "张三服饰 30*38 红500 明天自提",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      apiCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, apiResponse);
    },
  },
);

assert(apiResult.source === "api", "recognizeOfficeDraft did not use the API response");
assert(apiResult.recognition?.version === "wechat-order-conversation-v1", "conversation recognition context was not preserved");
assert(apiCalls[0]?.url === "http://127.0.0.1:8787/api/order-drafts/recognize", "recognition API URL is incorrect");
assert(apiCalls[0]?.init.headers.authorization === "Bearer seed-session.order-check", "recognition API did not send bearer auth");
assert(apiCalls[0]?.body.operatorId === "U-OFFICE-A", "recognition API did not send operatorId");

const saveCalls = [];
const saveResult = await saveOfficeDraft(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.order-check" },
    },
    draftRows: mappedRows,
    draftId: "DRAFT-API-CHECK",
    clientRevision: 1,
    operatorId: "U-OFFICE-A",
    sourceText: "张三服饰 30*38 红500 明天自提",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      saveCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        draft: {
          draftId: "DRAFT-API-CHECK",
          status: "待补充信息",
          clientRevision: 2,
        },
        todos: [
          {
            todoId: "T-API-CHECK-1",
            type: "订单草稿待确认",
            refId: "DRAFT-API-CHECK",
            handled: false,
          },
        ],
        operationLogId: "LOG-CHECK-2",
      });
    },
  },
);

assert(saveResult.source === "api", "saveOfficeDraft did not use the API response");
assert(saveCalls[0]?.url === "http://127.0.0.1:8787/api/order-drafts/DRAFT-API-CHECK", "save draft API URL is incorrect");
assert(saveCalls[0]?.init.method === "PATCH", "save draft API method is incorrect");
assert(saveCalls[0]?.body.draftStatus === "待补充信息", "save draft did not request pending-info status");
assert(saveCalls[0]?.body.lines[0].customerId === "C001", "save draft did not send mapped line customerId");
assert(saveResult.todos[0]?.id === "T-API-CHECK-1", "save draft API todo summary was not mapped to local todo input");

const restoreCalls = [];
const restoreResult = await restoreOfficeDraftShortageCancellation(
  {
    authState,
    draftId: "DRAFT-API-CHECK",
    draftLineId: "DRAFT-LINE-CHECK-1",
    clientRevision: 2,
    operatorId: "U-OFFICE-A",
    reason: "客户确认恢复订购",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      restoreCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        draft: { ...apiResponse.draft, clientRevision: 3, status: "待审核" },
        line: {
          ...apiResponse.lines[0],
          recognitionEvidence: {
            ...apiResponse.lines[0].recognitionEvidence,
            cancellationRestoration: { reason: "客户确认恢复订购", restoredBy: "U-OFFICE-A", restoredAt: "2026-07-12T15:00:00.000Z" },
          },
        },
        inventoryIntents: [{ intentId: "INT-CANCEL-1", intentStatus: "库存不足取消-已恢复订购" }],
        operationLogId: "LOG-RESTORE-1",
      });
    },
  },
);
assert(restoreResult.source === "api", "shortage cancellation restore should use the API response");
assert(restoreResult.draft.clientRevision === 3, "restore should return the committed draft revision");
assert(restoreResult.line.cancellationRestoration.restoredBy === "U-OFFICE-A", "restore evidence was not mapped");
assert(restoreCalls[0].url.endsWith("/order-drafts/DRAFT-API-CHECK/shortage-cancellation-restore"), "restore API URL is incorrect");
assert(restoreCalls[0].body.draftLineId === "DRAFT-LINE-CHECK-1", "restore API must send the target draft line");
assert(restoreCalls[0].body.idempotencyKey === "restore-shortage:DRAFT-API-CHECK:DRAFT-LINE-CHECK-1:2", "restore API should use a stable idempotency key");

const linkCalls = [];
const linkResult = await linkOfficeDraftShortageCancellation(
  {
    authState,
    draftId: "DRAFT-API-CHECK",
    draftLineId: "DRAFT-LINE-CHECK-1",
    intentId: "INT-CROSS-CANCEL-1",
    clientRevision: 3,
    operatorId: "U-OFFICE-A",
    reason: "办公室核对来源消息后关联到当前草稿明细",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      linkCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        draft: { ...apiResponse.draft, clientRevision: 4, status: "待审核" },
        line: {
          ...apiResponse.lines[0],
          cancellationStatus: "库存不足取消",
          excludedFromConfirmation: true,
          recognitionEvidence: {
            ...apiResponse.lines[0].recognitionEvidence,
            crossDraftCancellation: { sourceIntentId: "INT-CROSS-CANCEL-1", sourceDraftId: "DRAFT-CONTEXT-1" },
          },
        },
        inventoryIntent: { intentId: "INT-CROSS-CANCEL-1", intentStatus: "库存不足取消-已关联跨草稿明细" },
        operationLogId: "LOG-CROSS-CANCEL-1",
      });
    },
  },
);
assert(linkResult.source === "api" && linkResult.draft.clientRevision === 4, "cross-draft cancellation should use the committed API response");
assert(linkResult.line.crossDraftCancellation.sourceIntentId === "INT-CROSS-CANCEL-1", "cross-draft cancellation evidence was not mapped");
assert(linkCalls[0].url.endsWith("/order-drafts/DRAFT-API-CHECK/cross-draft-shortage-cancellation"), "cross-draft cancellation API URL is incorrect");
assert(linkCalls[0].body.intentId === "INT-CROSS-CANCEL-1", "cross-draft cancellation API must send the source intent");
assert(linkCalls[0].body.idempotencyKey === "cross-draft-shortage:DRAFT-API-CHECK:DRAFT-LINE-CHECK-1:INT-CROSS-CANCEL-1:3", "cross-draft cancellation API should use a stable idempotency key");

const confirmCalls = [];
const confirmResult = await confirmOfficeDraftViaApi(
  {
    authState,
    draftRows: mappedRows,
    draftId: "DRAFT-API-CHECK",
    clientRevision: 2,
    operatorId: "U-OFFICE-A",
    sourceText: "张三服饰 30*38 红500 明天自提",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      confirmCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        orderId: "ORD-P0-999",
        orderSummaryStatus: "处理中",
        orderLines: [{ id: "ORD-P0-999-01", lineStatus: "待出库", exceptionTags: [] }],
        priceSnapshots: [{ orderLineId: "ORD-P0-999-01", priceVersion: "P0-PRICE-20260703", amount: 170 }],
        inventoryChecks: [],
        reservations: [],
        fulfillmentTasks: [],
        todos: [],
        operationLogIds: ["LOG-CHECK-3"],
      });
    },
  },
);

assert(confirmResult.source === "api", "confirmOfficeDraftViaApi did not use the API response");
assert(confirmCalls[0]?.url === "http://127.0.0.1:8787/api/order-drafts/DRAFT-API-CHECK/confirm", "confirm draft API URL is incorrect");
assert(confirmCalls[0]?.init.method === "POST", "confirm draft API method is incorrect");
assert(confirmCalls[0]?.body.confirmMode === "confirm_now", "confirm draft did not send confirm_now mode");
assert(confirmCalls[0]?.body.lines[0].draftLineId === "DRAFT-LINE-CHECK-1", "confirm draft did not send mapped draft lines");
assert(confirmCalls[0]?.body.lines[0].estimatedAmount === mappedRows[0].amount, "confirm draft should preserve the estimated amount snapshot");
assert(
  resolveOfficeOrderConfirmationStrategy(confirmResult, { serverRequired: true }).kind === "server",
  "verified API confirmation should use the server transaction projection",
);

const splitCalls = [];
const splitPreviewResult = await previewOfficeDraftSplit(
  {
    authState,
    draftRows: mappedRows,
    draftId: "DRAFT-API-CHECK",
    clientRevision: 2,
    operatorId: "U-OFFICE-A",
    sourceText: "两种交付方式",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      splitCalls.push({ url, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        splitPlan: {
          planHash: "split-plan-check",
          groups: [{ groupId: "SPLIT-1" }, { groupId: "SPLIT-2" }],
          canConfirm: true,
        },
      });
    },
  },
);
assert(splitPreviewResult.source === "api", "split preview should use the API response");
assert(splitPreviewResult.splitPlan.groups.length === 2, "split preview should expose backend groups");
assert(splitCalls[0].url.endsWith("/order-drafts/DRAFT-API-CHECK/split-preview"), "split preview URL is incorrect");
assert(splitCalls[0].body.lines.length === mappedRows.length, "split preview must send all draft lines");

const splitConfirmResult = await confirmOfficeDraftSplit(
  {
    authState,
    draftRows: mappedRows,
    draftId: "DRAFT-API-CHECK",
    clientRevision: 2,
    operatorId: "U-OFFICE-A",
    sourceText: "两种交付方式",
    splitPlanHash: "split-plan-check",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      splitCalls.push({ url, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        orderId: "ORD-SPLIT-001",
        orderIds: ["ORD-SPLIT-001", "ORD-SPLIT-002"],
        splitConfirmed: true,
        orderLines: [],
      });
    },
  },
);
assert(splitConfirmResult.confirmation.orderIds.length === 2, "split confirmation should expose all formal order ids");
assert(splitCalls[1].url.endsWith("/order-drafts/DRAFT-API-CHECK/split-confirm"), "split confirm URL is incorrect");
assert(splitCalls[1].body.splitPlanHash === "split-plan-check", "split confirm must send the reviewed plan hash");

assert(
  resolveOfficeOrderConfirmationStrategy({
    source: "api",
    confirmation: { orderId: "", closedWithoutOrder: true, cancelledDraftLineIds: ["DRAFT-LINE-CHECK-1"] },
  }, { serverRequired: true }).kind === "server",
  "verified all-cancelled draft closure should be accepted without an order id",
);

const deniedResult = await recognizeOfficeDraft(
  {
    authState,
    customers: [],
    inventories,
    operatorId: "U-FINANCE-A",
    sourceText: "张三服饰 30*38 红500 明天自提",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: order.draft.recognize",
        requiredPermission: "order.draft.recognize",
      }),
  },
);

assert(deniedResult.blocked === true, "API permission denial should block local fallback");
assert(deniedResult.rows.length === 0, "API permission denial should not return local parsed rows");

const deniedSaveResult = await saveOfficeDraft(
  {
    authState,
    draftRows: mappedRows,
    draftId: "DRAFT-API-CHECK",
    clientRevision: 2,
    operatorId: "U-FINANCE-A",
    sourceText: "张三服饰 30*38 红500 明天自提",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: order.draft.save",
        requiredPermission: "order.draft.save",
      }),
  },
);

assert(deniedSaveResult.blocked === true, "save draft API permission denial should block local fallback");
assert(deniedSaveResult.error.requiredPermission === "order.draft.save", "save draft permission denial was not surfaced");

const fallbackResult = await recognizeOfficeDraft(
  {
    authState,
    customers: [{ id: "C001", name: "张三服饰" }],
    inventories,
    operatorId: "U-OFFICE-A",
    sourceText: "张三服饰 30*38 红500 明天自提",
  },
  {
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);

assert(fallbackResult.source === "local_fallback", "network failure should fall back to local recognition");
assert(fallbackResult.rows.length === 1 && fallbackResult.rows[0].customerId === "C001", "local fallback recognition is incorrect");

const fallbackInquiry = await recognizeOfficeDraft(
  {
    authState,
    customers: [{ id: "C001", name: "张三服饰" }],
    inventories,
    operatorId: "U-OFFICE-A",
    sourceMessages: [{
      id: "MSG-FE-INQUIRY",
      conversationId: "GROUP-FE-1",
      customerId: "C001",
      text: "30*38红色100个有吗？",
    }],
    sourceText: "30*38红色100个有吗？",
  },
  {
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);
assert(fallbackInquiry.rows.length === 0, "inventory inquiry must not become a local fallback order row");
assert(fallbackInquiry.recognition.nonOrderIntents[0].status === "询库存-待客户确认", "local fallback inquiry status is incorrect");

const fallbackConfirmResult = await confirmOfficeDraftViaApi(
  {
    authState,
    draftRows: mappedRows,
    draftId: "DRAFT-API-CHECK",
    clientRevision: 2,
    operatorId: "U-OFFICE-A",
    sourceText: "张三服饰 30*38 红500 明天自提",
  },
  {
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);

assert(fallbackConfirmResult.source === "local_fallback", "confirm network failure should fall back to local projection");
assert(
  resolveOfficeOrderConfirmationStrategy(fallbackConfirmResult, { serverRequired: false }).kind === "local_fallback",
  "explicit prototype mode should retain the local confirmation fallback",
);

const strictFallbackConfirmResult = await confirmOfficeDraftViaApi(
  {
    authState,
    draftRows: mappedRows,
    draftId: "DRAFT-API-CHECK",
    clientRevision: 2,
    operatorId: "U-OFFICE-A",
    sourceText: "张三服饰 30*38 红500 明天自提",
  },
  {
    serverRequired: true,
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);
assert(strictFallbackConfirmResult.blocked === true, "strict confirmation must reject an unavailable API instead of falling back");
assert(strictFallbackConfirmResult.source === "api_error", "strict confirmation should report an API error");
assert(
  resolveOfficeOrderConfirmationStrategy(strictFallbackConfirmResult, { serverRequired: true }).kind === "blocked",
  "strict confirmation must never select the local projection",
);

const strictFallbackSaveResult = await saveOfficeDraft(
  {
    authState,
    draftRows: mappedRows,
    draftId: "DRAFT-API-CHECK",
    clientRevision: 2,
    operatorId: "U-OFFICE-A",
    sourceText: "张三服饰 30*38 红500 明天自提",
  },
  {
    serverRequired: true,
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);
assert(strictFallbackSaveResult.blocked === true, "strict save must reject an unavailable API instead of creating a local todo");

const queueCalls = [];
const queueResult = await recognizeOfficeDraftQueue(
  {
    authState,
    inventories,
    operatorId: "U-OFFICE-A",
    sourceText: "[09:00] 客户甲：30*38红色100个\n[15:00] 客户甲：30*38蓝色100个",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      queueCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        queueBatch: { batchId: "QBAT-CHECK-1", summary: { queueItemCount: 2, orderDraftCount: 2, intentDraftCount: 0 } },
        drafts: [{
          queueItemId: "QITEM-CHECK-1",
          kind: "order_draft",
          status: "待审核",
          sourceMessageIds: ["MSG-CHECK-Q-1"],
          draft: { draftId: "DRAFT-Q-CHECK-1", customerId: "C001", customerName: "张三服饰", sourceText: "30*38红色100个", clientRevision: 1 },
          lines: [apiResponse.lines[0]],
        }],
      });
    },
  },
);
assert(queueResult.source === "api", "queue recognition must use the backend response");
assert(queueResult.drafts[0].rows[0].id === "DRAFT-LINE-CHECK-1", "queue order rows were not mapped for editing");
assert(queueCalls[0].url.endsWith("/api/order-draft-queues/recognize"), "queue recognition URL is incorrect");
assert(queueCalls[0].body.idempotencyKey.startsWith("order-draft-queue:"), "queue recognition must use a stable idempotency key");

const queueListResult = await listOfficeDraftQueue(
  { authState, inventories, operatorId: "U-OFFICE-A", queueBatchId: "QBAT-CHECK-1" },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url) => {
      queueCalls.push({ url });
      return createJsonResponse(200, {
        items: [{
          id: "DRAFT-Q-CHECK-1",
          draftId: "DRAFT-Q-CHECK-1",
          customerId: "C001",
          customerName: "张三服饰",
          sourceText: "30*38红色100个",
          status: "待审核",
          clientRevision: 1,
          recognitionContext: {
            queueBatchId: "QBAT-CHECK-1",
            queueItemId: "QITEM-CHECK-1",
            queueKind: "order_draft",
            originalOrderGroupId: "ODG-CHECK-1",
            sourceMessages: [{ id: "MSG-CHECK-Q-1" }],
          },
          lines: [{
            id: "DRAFT-LINE-CHECK-1",
            customerId: "C001",
            customer: "张三服饰",
            product: "空白袋",
            size: "30*38*10",
            color: "红色",
            handle: "普通提",
            style: "空白袋",
            print: "否",
            qty: 500,
            fulfillment: "自提",
            latest: "明天",
          }],
        }],
        total: 1,
        summary: { orderDraftCount: 1, intentDraftCount: 0 },
      });
    },
  },
);
assert(queueListResult.items[0].kind === "order_draft", "queue list kind was not mapped");
assert(queueListResult.items[0].rows[0].inventory === "可用", "queued draft row was not enriched for editing");
assert(queueCalls[1].url.includes("queueBatchId=QBAT-CHECK-1"), "queue list filter is missing");

const draftReadResult = await getOfficeDraft(
  { authState, draftId: "DRAFT-Q-CHECK-1", inventories, operatorId: "U-OFFICE-A" },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url) => {
      queueCalls.push({ url });
      return createJsonResponse(200, {
        items: [{
          id: "DRAFT-Q-CHECK-1",
          draftId: "DRAFT-Q-CHECK-1",
          status: "待审核",
          sourceText: "30*38红色100个",
          lines: [{ id: "DRAFT-LINE-CHECK-1", product: "空白袋", size: "30*38*10", color: "红色", handle: "普通提", style: "空白袋", print: "否", qty: 100 }],
        }],
      });
    },
  },
);
assert(draftReadResult.item.rows[0].id === "DRAFT-LINE-CHECK-1", "single draft read was not mapped for editing");
assert(queueCalls[2].url.includes("draftId=DRAFT-Q-CHECK-1"), "single draft read filter is missing");

console.log("Frontend order API client check passed: recognition, independent draft queue, save, server-authoritative confirm, denial blocking, and local fallback are covered.");

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
