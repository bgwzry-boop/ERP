import assert from "node:assert/strict";
import { createLocalSeedAuthState } from "../src/services/officeAuthService.js";
import {
  adjustOfficeOrderLineQuantity,
  buildOrderLineQuery,
  getOfficeOrderLineDetail,
  listOfficeOrderLines,
  mapApiOrderLineDetailToLocal,
  mapApiOrderLineToLocal,
  mapOrderTypeToLocal,
  mapQuantityAdjustmentReasonToApi,
  mapQuantityAdjustmentReasonText,
  mapVoidReasonToApi,
  mapVoidReasonText,
  voidOfficeOrderLine,
} from "../src/services/officeOrderPoolApiClient.js";

const authState = createLocalSeedAuthState("U-OFFICE-A");

const apiOrderLine = {
  id: "ORD-0630-001-01",
  orderLineId: "ORD-0630-001-01",
  orderId: "ORD-0630-001",
  orderNo: "ORD-0630-001",
  lineNo: "01",
  shortNo: "01-01",
  customerId: "C011",
  customerName: "白鲸自营店",
  productName: "白鲸活动袋",
  size: "35*27*10",
  bagColor: "白色",
  handleType: "普通提",
  style: "空白袋",
  printFlag: true,
  printColor: "黑色",
  printSide: "single",
  handleColor: "黑色",
  qty: 1500,
  orderType: "custom_print",
  lineStatus: "待出库",
  fulfillmentMethod: "快递快运",
  latestNeededAt: "今天 19:00",
  amount: 600,
  financeState: "pending_statement",
  exceptionTags: ["待打印标签"],
  inventory: "已占用",
};

const mappedLine = mapApiOrderLineToLocal(apiOrderLine);
assert.equal(mappedLine.id, "ORD-0630-001-01");
assert.equal(mappedLine.orderType, "定制印刷");
assert.equal(mappedLine.print, "是");
assert.equal(mappedLine.printSide, "单面");
assert.equal(mappedLine.color, "白色");
assert.equal(mappedLine.printColor, "黑色");
assert.equal(mappedLine.handleColor, "黑色");
assert.deepEqual(mappedLine.exceptions, ["待打印标签"]);
assert.equal(mappedLine.financeState, "待对账");

assert.equal(mapOrderTypeToLocal("stock", { inventory: "缺货 60" }), "现货缺货");
assert.equal(mapOrderTypeToLocal("stock", { inventory: "已占用" }), "现货有货");
assert.equal(mapOrderTypeToLocal("external_print"), "外加工印刷");
assert.equal(mapOrderTypeToLocal("replenishment"), "印刷通货");
assert.equal(mapQuantityAdjustmentReasonToApi("客户改量"), "customer_change");
assert.equal(mapQuantityAdjustmentReasonToApi("识别数量修正"), "recognition_error");
assert.equal(mapQuantityAdjustmentReasonText("management_approved"), "管理批准改量");
assert.equal(mapVoidReasonToApi("客户取消订单"), "order_cancelled");
assert.equal(mapVoidReasonToApi("订单改量作废重建"), "qty_changed");
assert.equal(mapVoidReasonText("stock_not_available"), "库存不足取消");

const query = buildOrderLineQuery({
  page: 2,
  pageSize: 500,
  includeHistory: true,
  filters: {
    customerId: "C011",
    orderType: "定制印刷",
    fulfillment: "快递快运",
    exception: "仅异常",
    finance: "差额/欠款",
  },
});
assert.equal(
  query,
  "?page=2&pageSize=200&includeHistory=true&customerId=C011&orderType=custom_print&fulfillmentMethod=%E5%BF%AB%E9%80%92%E5%BF%AB%E8%BF%90&exceptionOnly=true&financeState=variance",
);

const detailPayload = {
  orderLine: apiOrderLine,
  originalOrder: {
    orderId: "ORD-0630-001",
    orderNo: "ORD-0630-001",
    sourceText: "白鲸自营店 白鲸活动袋 35*27 白印黑 白袋黑提 1500",
    sourceChannel: "manual",
    summaryStatus: "处理中",
  },
  priceSnapshot: {
    priceSnapshotId: "PS-001",
    orderLineId: "ORD-0630-001-01",
    bagPrice: 0.28,
    printPrice: 0.12,
    chargeableQty: 1500,
    finalAmount: 600,
  },
  inventory: [
    {
      reservationId: "RSV-001",
      inventoryItemId: "INV-001",
      inventoryKey: "35*27-白色-普通提-空白袋",
      state: "仓库已清点",
      reservedQty: 1500,
      availableQty: 300,
    },
  ],
  fulfillment: [
    {
      fulfillmentId: "F-001",
      orderLineId: "ORD-0630-001-01",
      method: "快递快运",
      status: "待打印标签",
      expectedQty: 1500,
    },
  ],
  statement: [
    {
      statementId: "ST-001",
      period: "2026-06-30 - 2026-06-30",
      status: "待生成",
      receivable: 600,
      received: 0,
      variance: 0,
    },
  ],
  attachments: [],
  operationLogs: [{ operationLogId: "LOG-001", action: "order_confirm" }],
};

const mappedDetail = mapApiOrderLineDetailToLocal(detailPayload);
assert.equal(mappedDetail.orderLine.orderType, "定制印刷");
assert.equal(mappedDetail.originalOrder.sourceText.includes("白印黑"), true);
assert.equal(mappedDetail.priceSnapshot.amount, 600);
assert.equal(mappedDetail.inventory[0].reservedQty, 1500);
assert.equal(mappedDetail.fulfillment[0].status, "待打印标签");
assert.equal(mappedDetail.statement[0].statementId, "ST-001");

const listCalls = [];
const listResult = await listOfficeOrderLines(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.order-pool-check" },
    },
    operatorId: "U-OFFICE-A",
    pageSize: 200,
    includeHistory: false,
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      listCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [apiOrderLine],
        page: 1,
        pageSize: 200,
        total: 1,
      });
    },
  },
);

assert.equal(listResult.source, "api");
assert.equal(listResult.items[0].orderType, "定制印刷");
assert.equal(listCalls[0].url, "http://127.0.0.1:8787/api/order-lines?page=1&pageSize=200&includeHistory=false");
assert.equal(listCalls[0].init.headers.authorization, "Bearer seed-session.order-pool-check");

const detailCalls = [];
const detailResult = await getOfficeOrderLineDetail(
  {
    authState,
    orderLineId: "ORD-0630-001-01",
    operatorId: "U-OFFICE-A",
  },
  {
    fetchImpl: async (url, init) => {
      detailCalls.push({ url, init });
      return createJsonResponse(200, detailPayload);
    },
  },
);

assert.equal(detailResult.source, "api");
assert.equal(detailResult.detail.orderLine.id, "ORD-0630-001-01");
assert.equal(detailCalls[0].url.endsWith("/api/order-lines/ORD-0630-001-01"), true);
assert.equal(detailCalls[0].init.headers["x-erp-user-id"], "U-OFFICE-A");

const adjustCalls = [];
const adjustResult = await adjustOfficeOrderLineQuantity(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.order-action-check" },
    },
    orderLine: mappedLine,
    newQty: 1200,
    reason: "客户改量",
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      adjustCalls.push({ url, init });
      return createJsonResponse(200, {
        orderLineId: "ORD-0630-001-01",
        previousQty: 1500,
        newQty: 1200,
        qtyDelta: -300,
        priceSnapshot: {
          priceSnapshotId: "PS-ORD-0630-001-01-QTY-1",
          orderLineId: "ORD-0630-001-01",
          snapshotType: "quantity_adjustment",
          versionNo: 1,
          chargeableQty: 1200,
          finalAmount: 480,
        },
        finalAmount: 480,
        adjustedStatements: [
          {
            statementId: "ST-001",
            receivable: 480,
            received: 0,
            variance: 480,
          },
        ],
        adjustedFulfillmentIds: ["F-001"],
        operationLogId: "LOG-QTY-1",
      });
    },
  },
);
assert.equal(adjustResult.source, "api");
assert.equal(adjustResult.newQty, 1200);
assert.equal(adjustResult.priceSnapshot.finalAmount, 480);
assert.equal(adjustResult.finalAmount, 480);
assert.equal(adjustResult.adjustedStatements[0].receivable, 480);
assert.deepEqual(adjustResult.adjustedFulfillmentIds, ["F-001"]);
assert.equal(adjustCalls[0].url, "http://127.0.0.1:8787/api/order-lines/ORD-0630-001-01/quantity-adjustment");
assert.equal(adjustCalls[0].init.method, "POST");
assert.equal(adjustCalls[0].init.headers.authorization, "Bearer seed-session.order-action-check");
const adjustBody = JSON.parse(adjustCalls[0].init.body);
assert.equal(adjustBody.orderLineId, "ORD-0630-001-01");
assert.equal(adjustBody.newQty, 1200);
assert.equal(adjustBody.reason, "customer_change");
assert.equal(adjustBody.reasonText, "客户改量");

const voidCalls = [];
const voidResult = await voidOfficeOrderLine(
  {
    authState,
    orderLine: mappedLine,
    reason: "订单改量作废重建",
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      voidCalls.push({ url, init });
      return createJsonResponse(200, {
        orderLineId: "ORD-0630-001-01",
        status: "已关闭",
        canceledFulfillmentIds: ["F-001"],
        operationLogId: "LOG-VOID-1",
      });
    },
  },
);
assert.equal(voidResult.source, "api");
assert.equal(voidResult.status, "已关闭");
assert.deepEqual(voidResult.canceledFulfillmentIds, ["F-001"]);
assert.equal(voidCalls[0].url, "http://127.0.0.1:8787/api/order-lines/ORD-0630-001-01/void");
assert.equal(voidCalls[0].init.method, "POST");
const voidBody = JSON.parse(voidCalls[0].init.body);
assert.equal(voidBody.orderLineId, "ORD-0630-001-01");
assert.equal(voidBody.reason, "qty_changed");
assert.equal(voidBody.reasonText, "订单改量作废重建");

const voidDeniedResult = await voidOfficeOrderLine(
  {
    authState,
    orderLine: mappedLine,
    reason: "客户取消订单",
    operatorId: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async () => createJsonResponse(403, {
      code: "PERMISSION_DENIED",
      message: "缺少权限",
      requiredPermission: "order.void",
    }),
  },
);
assert.equal(voidDeniedResult.source, "api_error");
assert.equal(voidDeniedResult.blocked, true);
assert.equal(voidDeniedResult.error.requiredPermission, "order.void");

const deniedResult = await listOfficeOrderLines(
  {
    authState,
    operatorId: "U-WAREHOUSE-A",
    localOrderLines: [apiOrderLine],
  },
  {
    fetchImpl: async () => createJsonResponse(403, {
      code: "PERMISSION_DENIED",
      message: "缺少权限",
      requiredPermission: "order.read",
    }),
  },
);
assert.equal(deniedResult.source, "api_error");
assert.equal(deniedResult.blocked, true);
assert.equal(deniedResult.items.length, 0);
assert.equal(deniedResult.error.requiredPermission, "order.read");

const fallbackResult = await listOfficeOrderLines(
  {
    authState,
    operatorId: "U-OFFICE-A",
    localOrderLines: [apiOrderLine],
  },
  {
    fetchImpl: async () => {
      throw new Error("connection refused");
    },
  },
);
assert.equal(fallbackResult.source, "local_fallback");
assert.equal(fallbackResult.items.length, 1);
assert.equal(fallbackResult.items[0].orderType, "定制印刷");

const fallbackAdjust = await adjustOfficeOrderLineQuantity(
  {
    authState,
    orderLine: mappedLine,
    newQty: 1300,
    reason: "库存复核后改量",
    operatorId: "U-OFFICE-A",
  },
  {
    fetchImpl: async () => {
      throw new Error("connection refused");
    },
  },
);
assert.equal(fallbackAdjust.source, "local_fallback");
assert.equal(fallbackAdjust.previousQty, 1500);
assert.equal(fallbackAdjust.newQty, 1300);
assert.equal(fallbackAdjust.qtyDelta, -200);

const fallbackVoid = await voidOfficeOrderLine(
  {
    authState,
    orderLine: mappedLine,
    reason: "客户取消订单",
    operatorId: "U-OFFICE-A",
  },
  {
    fetchImpl: async () => {
      throw new Error("connection refused");
    },
  },
);
assert.equal(fallbackVoid.source, "local_fallback");
assert.equal(fallbackVoid.orderLineId, "ORD-0630-001-01");
assert.equal(fallbackVoid.status, "已关闭");

const strictFallbackAdjust = await adjustOfficeOrderLineQuantity(
  {
    authState,
    orderLine: mappedLine,
    newQty: 1300,
    operatorId: "U-OFFICE-A",
  },
  {
    serverRequired: true,
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);
assert.equal(strictFallbackAdjust.blocked, true, "strict quantity adjustment must not use the local projection");
assert.equal(strictFallbackAdjust.source, "api_error", "strict quantity adjustment should report an API error");

const strictFallbackVoid = await voidOfficeOrderLine(
  {
    authState,
    orderLine: mappedLine,
    operatorId: "U-OFFICE-A",
  },
  {
    serverRequired: true,
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);
assert.equal(strictFallbackVoid.blocked, true, "strict order void must not use the local projection");
assert.equal(strictFallbackVoid.source, "api_error", "strict order void should report an API error");

const fallbackDetail = await getOfficeOrderLineDetail(
  {
    authState,
    orderLineId: "ORD-0630-001-01",
    operatorId: "U-OFFICE-A",
    localOrderLines: [apiOrderLine],
    localFulfillments: [
      {
        id: "F-LOCAL-001",
        lineId: "ORD-0630-001-01",
        method: "快递快运",
        status: "待打印标签",
        qty: 1500,
        latest: "今天 19:00",
      },
    ],
    localStatements: [
      {
        id: "ST-LOCAL-001",
        period: "2026-06",
        status: "待生成",
        receivable: 600,
        received: 0,
        variance: 0,
        lineIds: ["ORD-0630-001-01"],
      },
    ],
  },
  {
    fetchImpl: async () => {
      throw new Error("connection refused");
    },
  },
);
assert.equal(fallbackDetail.source, "local_fallback");
assert.equal(fallbackDetail.detail.fulfillment[0].fulfillmentId, "F-LOCAL-001");
assert.equal(fallbackDetail.detail.statement[0].statementId, "ST-LOCAL-001");

console.log("frontend order pool API client check passed");

function createJsonResponse(status, json) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return json;
    },
  };
}
