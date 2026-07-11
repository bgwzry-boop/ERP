import { createLocalSeedAuthState, isOfficeApiServerRequired } from "../src/services/officeAuthService.js";
import {
  confirmOfficeDraftViaApi,
  mapDraftRowsToApiLines,
  mapRecognizedDraftRows,
  recognizeOfficeDraft,
  resolveOfficeOrderConfirmationStrategy,
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
assert(
  resolveOfficeOrderConfirmationStrategy(confirmResult, { serverRequired: true }).kind === "server",
  "verified API confirmation should use the server transaction projection",
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

console.log("Frontend order API client check passed: recognition, save, server-authoritative confirm, denial blocking, and local fallback are covered.");

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
