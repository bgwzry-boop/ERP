import { createLocalSeedAuthState } from "../src/services/officeAuthService.js";
import {
  cancelOfficeFulfillment,
  completeOfficeFulfillment,
  confirmOfficeFulfillmentPickup,
  createOfficeFulfillmentException,
  getFulfillmentDocumentType,
  getFulfillmentPrintAction,
  listOfficeFulfillments,
  mapApiFulfillmentToLocal,
  mapFulfillmentExceptionReason,
  mapPrintVoidReason,
  printOfficeFulfillment,
  reviewOfficeDeliveryEvidence,
  updateOfficeFulfillmentDispatch,
  voidOfficePrintRecord,
} from "../src/services/officeFulfillmentApiClient.js";
import {
  getDeliveryEvidenceReviewStatus,
  getDeliveryEvidenceReviewTone,
  getFulfillmentActions,
  getFulfillmentNextStep,
} from "../src/domain/officeRules.js";

const authState = createLocalSeedAuthState("U-OFFICE-A");
const expressFulfillment = {
  id: "F003",
  method: "快递快运",
  lineId: "ORD-0629-010-01",
  goods: "白鲸活动袋 35*27 白印",
  qty: 1500,
  packages: "3包",
  status: "待打印标签",
  printed: false,
};
const deliveryFulfillment = {
  id: "F008",
  method: "送货",
  lineId: "ORD-0629-022-01",
  goods: "外卖活动袋 40*30 黄袋红提",
  qty: 3000,
  packages: "6包",
  status: "待出库",
  printed: true,
  watermarkedPhotoAttached: true,
  watermarkedPhotoAttachmentId: "ATT-WATERMARK-F008",
};

assert(getFulfillmentDocumentType(expressFulfillment) === "express_ltl_label", "express/LTL document type was not mapped");
assert(getFulfillmentDocumentType(deliveryFulfillment) === "delivery_note", "delivery document type was not mapped");
assert(getFulfillmentDocumentType({ method: "自提" }) === "pickup_note", "pickup document type was not mapped");
assert(getFulfillmentPrintAction("打印预览", expressFulfillment) === "preview", "print preview action was not mapped");
assert(getFulfillmentPrintAction("重打标签", expressFulfillment) === "reprint", "explicit reprint action was not mapped");
assert(getFulfillmentPrintAction("重打送货单", deliveryFulfillment) === "reprint", "delivery reprint action was not mapped");
assert(getFulfillmentPrintAction("打印标签", { ...expressFulfillment, printed: true }) === "reprint", "reprint action was not mapped");
assert(
  getFulfillmentActions({
    ...deliveryFulfillment,
    activePrintRecordId: "PR-F008",
    printRecordStatus: "printed",
  }).some((item) => item.label === "编辑派单"),
  "delivery fulfillment should expose dispatch editing",
);
assert(
  !getFulfillmentActions(expressFulfillment).some((item) => item.label === "编辑派单"),
  "express fulfillment should not expose dispatch editing",
);
assert(
  getFulfillmentActions({
    ...deliveryFulfillment,
    activePrintRecordId: "PR-F008",
    printRecordStatus: "printed",
  }).some((item) => item.label === "作废旧单据"),
  "printed delivery note should expose document void action",
);
assert(
  !getFulfillmentActions({
    ...deliveryFulfillment,
    activePrintRecordId: "PR-F008",
    printRecordStatus: "voided",
  }).some((item) => item.label === "完成送货") &&
    getFulfillmentActions({
      ...deliveryFulfillment,
      activePrintRecordId: "PR-F008",
      printRecordStatus: "voided",
    }).some((item) => item.label === "重打送货单"),
  "voided delivery note should require reprint before completion",
);
assert(
  getFulfillmentNextStep({
    ...deliveryFulfillment,
    printRecordStatus: "voided",
  }).includes("旧送货单已作废"),
  "voided delivery note next-step text should mention the delivery note",
);
assert(
  getDeliveryEvidenceReviewStatus({
    ...deliveryFulfillment,
    status: "已交付",
    watermarkedPhotoAttachmentId: "ATT-WATERMARK-1",
  }) === "待复核",
  "delivered delivery evidence with a watermark photo should wait for office review",
);
assert(
  getFulfillmentNextStep({
    ...deliveryFulfillment,
    status: "已交付",
    watermarkedPhotoAttachmentId: "ATT-WATERMARK-1",
  }).includes("等待办公室复核"),
  "delivered delivery next-step should mention evidence review",
);
assert(getDeliveryEvidenceReviewStatus({ method: "快递快运" }) === "不适用", "non-delivery fulfillment should not require evidence review");
assert(getDeliveryEvidenceReviewStatus({ method: "送货" }) === "待提交", "delivery without watermark photo should wait for evidence submission");
assert(getDeliveryEvidenceReviewStatus({ method: "送货", deliveryEvidenceReviewStatus: "已复核" }) === "已复核", "explicit reviewed status should be preserved");
assert(getDeliveryEvidenceReviewTone("已复核") === "success", "reviewed evidence tone should be success");
assert(getDeliveryEvidenceReviewTone("待复核") === "warning", "pending evidence review tone should be warning");
assert(getDeliveryEvidenceReviewTone("需重拍") === "danger", "rejected evidence review tone should be danger");
assert(mapFulfillmentExceptionReason("库存不足") === "stock_shortage", "stock shortage reason was not mapped");
assert(mapFulfillmentExceptionReason("找不到货") === "not_found", "not-found reason was not mapped");
assert(mapFulfillmentExceptionReason("颜色/尺寸不符") === "wrong_color_or_size", "wrong-spec reason was not mapped");
assert(mapFulfillmentExceptionReason("包装/标签问题") === "packing_label_issue", "label issue reason was not mapped");
assert(mapFulfillmentExceptionReason("未知") === "other", "unknown reason should map to other");
assert(mapPrintVoidReason("信息变更需重打") === "info_changed", "print void info-change reason was not mapped");
assert(mapPrintVoidReason("包裹数量变化") === "qty_changed", "print void qty-change reason was not mapped");
assert(mapPrintVoidReason("未知") === "other", "unknown print void reason should map to other");

const mappedFulfillment = mapApiFulfillmentToLocal({
  fulfillmentId: "F-API-LIST-1",
  customerId: "C001",
  orderLineId: "ORD-API-01",
  method: "快递快运",
  goodsSpec: "白鲸活动袋 35*27 白印黑",
  expectedQty: 1500,
  actualQty: 1500,
  packageCount: 3,
  latestNeededAt: "今天 19:00",
  status: "待打印标签",
  inventorySource: "待快运区",
});
assert(mappedFulfillment?.id === "F-API-LIST-1", "fulfillment list did not map the API id");
assert(mappedFulfillment?.customerId === "C001" && mappedFulfillment?.lineId === "ORD-API-01", "fulfillment list lost trace IDs");
assert(mappedFulfillment?.packages === "3包", "fulfillment list did not map package count");

const fulfillmentListCalls = [];
const fulfillmentListResult = await listOfficeFulfillments(
  { authState, operatorId: "U-OFFICE-A", localFulfillments: [expressFulfillment] },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      fulfillmentListCalls.push({ url, init });
      return createJsonResponse(200, { items: [mappedFulfillment], total: 1, metrics: { openCount: 1 } });
    },
  },
);
assert(fulfillmentListResult.source === "api" && fulfillmentListResult.items[0]?.id === "F-API-LIST-1", "fulfillment list did not use API data");
assert(fulfillmentListCalls[0]?.url.includes("/fulfillments?page=1&pageSize=200"), "fulfillment list URL is incorrect");

const printCalls = [];
const printResult = await printOfficeFulfillment(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.fulfillment-check" },
    },
    fulfillment: expressFulfillment,
    action: "打印标签",
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      printCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: expressFulfillment.id,
        printRecord: {
          printRecordId: "PR-F003",
          targetType: "fulfillment",
          targetId: expressFulfillment.id,
          templateId: "tpl-p0-express-ltl-label",
          batchNo: "PB-F003",
          status: "printed",
          printAction: "first_print",
          operatorId: "U-OFFICE-A",
          createdAt: "2026-07-01T00:00:00.000Z",
        },
        printTemplate: {
          templateId: "tpl-p0-express-ltl-label",
          templateVersion: "p0-express-ltl-label-v1",
          documentType: "express_ltl_label",
          title: "快递快运包裹标签",
          priceHidden: true,
          fields: {
            goodsSummary: "白鲸活动袋 / 35*27*10 / 白印黑 / 白袋黑提 / 单面 / 1500个",
            phoneTail: "1160",
          },
        },
        nextStatus: "待确认拉走",
        operationLogId: "LOG-FULFILLMENT-PRINT-1",
      });
    },
  },
);

assert(printResult.source === "api", "print fulfillment did not use the API response");
assert(printCalls[0]?.url === "http://127.0.0.1:8787/api/fulfillments/F003/print", "print API URL is incorrect");
assert(printCalls[0]?.init.method === "POST", "print API method is incorrect");
assert(printCalls[0]?.init.headers.authorization === "Bearer seed-session.fulfillment-check", "print API did not send bearer auth");
assert(printCalls[0]?.body.documentType === "express_ltl_label", "print request documentType is incorrect");
assert(printCalls[0]?.body.printAction === "first_print", "print request printAction is incorrect");
assert(printCalls[0]?.body.operatorId === "U-OFFICE-A", "print request missed operatorId");
assert(printResult.nextStatus === "待确认拉走" && printResult.operationLogId === "LOG-FULFILLMENT-PRINT-1", "print response was not mapped");
assert(printResult.printTemplate?.priceHidden === true, "print template was not mapped");
assert(printResult.printTemplate?.fields?.goodsSummary.includes("白印黑"), "print template goods summary was not mapped");

const deliveryPrintCalls = [];
const deliveryPrintResult = await printOfficeFulfillment(
  {
    authState,
    fulfillment: deliveryFulfillment,
    action: "打印预览",
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      deliveryPrintCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: deliveryFulfillment.id,
        printRecord: {
          printRecordId: "PR-F008",
          targetType: "fulfillment",
          targetId: deliveryFulfillment.id,
          templateId: "tpl-p0-delivery-note",
          batchNo: "PB-F008",
          status: "previewed",
          printAction: "preview",
          operatorId: "U-OFFICE-A",
          createdAt: "2026-07-01T00:00:00.000Z",
        },
        printTemplate: {
          templateId: "tpl-p0-delivery-note",
          templateVersion: "p0-delivery_note-dot-matrix-v1",
          documentType: "delivery_note",
          title: "送货单",
          priceHidden: false,
          fields: {
            lineItems: [{ goodsSummary: "外卖活动袋 / 40*30*10 / 黄印黑 / 黄袋红提 / 双面 / 3000个" }],
            totalAmountText: "¥1,380",
          },
        },
        nextStatus: "待出库",
        operationLogId: "LOG-FULFILLMENT-PRINT-2",
      });
    },
  },
);
assert(deliveryPrintResult.source === "api", "delivery print preview did not use the API response");
assert(deliveryPrintCalls[0]?.body.documentType === "delivery_note", "delivery print request documentType is incorrect");
assert(deliveryPrintCalls[0]?.body.templateId === "tpl-p0-delivery-note", "delivery print request templateId is incorrect");
assert(deliveryPrintCalls[0]?.body.printAction === "preview", "delivery print request printAction is incorrect");
assert(deliveryPrintResult.printTemplate?.priceHidden === false, "delivery print template should show prices");
assert(deliveryPrintResult.printTemplate?.fields?.totalAmountText === "¥1,380", "delivery print template total was not mapped");

const voidPrintCalls = [];
const voidPrintResult = await voidOfficePrintRecord(
  {
    authState,
    printRecordId: "PR-F003",
    operatorId: "U-OFFICE-A",
    reason: "信息变更需重打",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      voidPrintCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        printRecord: {
          printRecordId: "PR-F003",
          targetType: "fulfillment",
          targetId: expressFulfillment.id,
          templateId: "tpl-p0-express-ltl-label",
          batchNo: "PB-F003",
          status: "voided",
          printAction: "first_print",
          operatorId: "U-OFFICE-A",
          voidReason: "info_changed",
          voidedAt: "2026-07-01T00:10:00.000Z",
          createdAt: "2026-07-01T00:00:00.000Z",
        },
        nextStatus: "待确认拉走",
        operationLogId: "LOG-PRINT-VOID-1",
      });
    },
  },
);

assert(voidPrintCalls[0]?.url === "http://127.0.0.1:8787/api/print-records/PR-F003/void", "void print API URL is incorrect");
assert(voidPrintCalls[0]?.body.voidReason === "info_changed", "void print request reason is incorrect");
assert(voidPrintResult.printRecord?.status === "voided" && voidPrintResult.operationLogId === "LOG-PRINT-VOID-1", "void print response was not mapped");

const reprintCalls = [];
const reprintResult = await printOfficeFulfillment(
  {
    authState,
    fulfillment: {
      ...expressFulfillment,
      printed: true,
      activePrintRecordId: "PR-F003",
      printRecordStatus: "voided",
    },
    action: "重打标签",
    operatorId: "U-OFFICE-A",
    reason: "信息变更需重打",
  },
  {
    fetchImpl: async (url, init) => {
      reprintCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: expressFulfillment.id,
        printRecord: {
          printRecordId: "PR-F003-2",
          targetType: "fulfillment",
          targetId: expressFulfillment.id,
          templateId: "tpl-p0-express-ltl-label",
          batchNo: "PB-F003-2",
          status: "reprinted",
          printAction: "reprint",
          previousPrintRecordId: "PR-F003",
          reprintReason: "info_changed",
          operatorId: "U-OFFICE-A",
          createdAt: "2026-07-01T00:20:00.000Z",
        },
        nextStatus: "待确认拉走",
        operationLogId: "LOG-FULFILLMENT-REPRINT-1",
      });
    },
  },
);

assert(reprintCalls[0]?.body.printAction === "reprint", "reprint request printAction is incorrect");
assert(reprintCalls[0]?.body.previousPrintRecordId === "PR-F003", "reprint request missed previousPrintRecordId");
assert(reprintCalls[0]?.body.reprintReason === "info_changed", "reprint request reason is incorrect");
assert(reprintResult.printRecord?.status === "reprinted", "reprint response was not mapped");

const deliveryReprintCalls = [];
const deliveryReprintResult = await printOfficeFulfillment(
  {
    authState,
    fulfillment: {
      ...deliveryFulfillment,
      activePrintRecordId: "PR-F008",
      printRecordStatus: "voided",
    },
    action: "重打送货单",
    operatorId: "U-OFFICE-A",
    reason: "客户信息变化",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      deliveryReprintCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: deliveryFulfillment.id,
        printRecord: {
          printRecordId: "PR-F008-2",
          targetType: "fulfillment",
          targetId: deliveryFulfillment.id,
          templateId: "tpl-p0-delivery-note",
          batchNo: "PB-F008-2",
          status: "reprinted",
          printAction: "reprint",
          previousPrintRecordId: "PR-F008",
          reprintReason: "customer_change",
          operatorId: "U-OFFICE-A",
          createdAt: "2026-07-01T00:25:00.000Z",
        },
        printTemplate: {
          templateId: "tpl-p0-delivery-note",
          documentType: "delivery_note",
          title: "送货单",
          priceHidden: false,
          fields: {
            totalAmountText: "¥1,380",
          },
        },
        nextStatus: "待出库",
        operationLogId: "LOG-FULFILLMENT-DELIVERY-REPRINT-1",
      });
    },
  },
);

assert(deliveryReprintCalls[0]?.body.documentType === "delivery_note", "delivery reprint request documentType is incorrect");
assert(deliveryReprintCalls[0]?.body.templateId === "tpl-p0-delivery-note", "delivery reprint request templateId is incorrect");
assert(deliveryReprintCalls[0]?.body.printAction === "reprint", "delivery reprint request printAction is incorrect");
assert(deliveryReprintCalls[0]?.body.previousPrintRecordId === "PR-F008", "delivery reprint request missed previousPrintRecordId");
assert(deliveryReprintCalls[0]?.body.reprintReason === "customer_change", "delivery reprint request reason is incorrect");
assert(deliveryReprintResult.printRecord?.status === "reprinted", "delivery reprint response was not mapped");

const dispatchCalls = [];
const dispatchResult = await updateOfficeFulfillmentDispatch(
  {
    authState,
    fulfillment: deliveryFulfillment,
    operatorId: "U-OFFICE-A",
    driverId: "U-DRIVER-A",
    routeDate: "2026-07-02",
    routeNo: "虎门线-A",
    routeSequence: 2,
    plannedDepartureAt: "2026-07-02T08:30",
    remark: "前端派单客户端校验",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      dispatchCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: deliveryFulfillment.id,
        dispatch: {
          dispatchId: "DDIS-F008",
          fulfillmentId: deliveryFulfillment.id,
          driverId: "U-DRIVER-A",
          routeDate: "2026-07-02",
          routeNo: "虎门线-A",
          routeSequence: 2,
          stopSequence: 2,
          dispatchStatus: "已派单",
          plannedDepartureAt: "2026-07-02T08:30:00.000Z",
        },
        task: {
          fulfillmentId: deliveryFulfillment.id,
          routeNo: "虎门线-A",
          routeSequence: 2,
        },
        operationLogId: "LOG-DISPATCH-1",
      });
    },
  },
);

assert(dispatchCalls[0]?.url === "http://127.0.0.1:8787/api/fulfillments/F008/dispatch", "dispatch API URL is incorrect");
assert(dispatchCalls[0]?.init.method === "POST", "dispatch API method is incorrect");
assert(dispatchCalls[0]?.body.driverId === "U-DRIVER-A", "dispatch request driverId is incorrect");
assert(dispatchCalls[0]?.body.routeDate === "2026-07-02", "dispatch request routeDate is incorrect");
assert(dispatchCalls[0]?.body.routeSequence === 2, "dispatch request routeSequence is incorrect");
assert(dispatchResult.dispatch?.routeNo === "虎门线-A", "dispatch response was not mapped");
assert(dispatchResult.task?.routeSequence === 2 && dispatchResult.operationLogId === "LOG-DISPATCH-1", "dispatch task response was not mapped");

const completeCalls = [];
const completeResult = await completeOfficeFulfillment(
  {
    authState,
    fulfillment: deliveryFulfillment,
    actualQty: 3000,
    operatorId: "U-WAREHOUSE-A",
    remark: "API client check complete",
  },
  {
    fetchImpl: async (url, init) => {
      completeCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: deliveryFulfillment.id,
        status: "已交付",
        actualQty: 3000,
        statementCandidate: true,
        inventoryLedgerIds: [],
        operationLogId: "LOG-FULFILLMENT-COMPLETE-1",
      });
    },
  },
);

assert(completeCalls[0]?.url.endsWith("/api/fulfillments/F008/complete"), "complete API URL is incorrect");
assert(completeCalls[0]?.init.headers["x-erp-user-id"] === "U-WAREHOUSE-A", "complete API did not send seed user header");
assert(completeCalls[0]?.body.actualQty === 3000, "complete request actualQty is incorrect");
assert(completeResult.status === "已交付" && completeResult.statementCandidate === true, "complete response was not mapped");

const pickupCalls = [];
const pickupResult = await confirmOfficeFulfillmentPickup(
  {
    authState,
    fulfillment: { ...expressFulfillment, status: "待确认拉走", printed: true },
    operatorId: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async (url, init) => {
      pickupCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: expressFulfillment.id,
        status: "已交付",
        actualQty: 1500,
        statementCandidate: true,
        inventoryLedgerIds: [],
        operationLogId: "LOG-FULFILLMENT-PICKUP-1",
      });
    },
  },
);

assert(pickupCalls[0]?.url.endsWith("/api/fulfillments/F003/pickup-confirm"), "pickup API URL is incorrect");
assert(pickupCalls[0]?.body.pickupBatchNo === "P0-F003", "pickup request batch number is incorrect");
assert(pickupResult.statementCandidate === true && pickupResult.operationLogId === "LOG-FULFILLMENT-PICKUP-1", "pickup response was not mapped");

const exceptionCalls = [];
const exceptionResult = await createOfficeFulfillmentException(
  {
    authState,
    fulfillment: expressFulfillment,
    modalType: "mismatch",
    actualQty: 1400,
    reason: "包装/标签问题",
    operatorId: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async (url, init) => {
      exceptionCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: expressFulfillment.id,
        status: "数量差异待处理",
        todoId: "T-FULFILLMENT-CHECK-1",
        todoType: "数量差异待处理",
        inventoryHoldStatus: "pending_review",
        operationLogId: "LOG-FULFILLMENT-EXCEPTION-1",
      });
    },
  },
);

assert(exceptionCalls[0]?.url.endsWith("/api/fulfillments/F003/exception"), "exception API URL is incorrect");
assert(exceptionCalls[0]?.body.exceptionType === "quantity_mismatch", "exception request type is incorrect");
assert(exceptionCalls[0]?.body.reasonCode === "packing_label_issue", "exception request reason is incorrect");
assert(exceptionCalls[0]?.body.actualQty === 1400, "exception request actualQty is incorrect");
assert(exceptionResult.todoId === "T-FULFILLMENT-CHECK-1" && exceptionResult.operationLogId === "LOG-FULFILLMENT-EXCEPTION-1", "exception response was not mapped");

const cancelCalls = [];
const cancelResult = await cancelOfficeFulfillment(
  {
    authState,
    fulfillment: deliveryFulfillment,
    operatorId: "U-OFFICE-A",
    reason: "office_correction",
    reasonText: "办公室取消未交付出库任务",
  },
  {
    fetchImpl: async (url, init) => {
      cancelCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: deliveryFulfillment.id,
        orderLineId: deliveryFulfillment.lineId,
        status: "已取消",
        releasedReservations: [
          {
            reservationId: "RSV-F008",
            orderLineId: deliveryFulfillment.lineId,
            inventoryItemId: "INV-F008",
            qty: 0,
            status: "released",
          },
        ],
        inventoryLedgerIds: ["LEDGER-F008-CANCEL"],
        operationLogId: "LOG-FULFILLMENT-CANCEL-1",
      });
    },
  },
);

assert(cancelCalls[0]?.url.endsWith("/api/fulfillments/F008/cancel"), "cancel API URL is incorrect");
assert(cancelCalls[0]?.body.reason === "office_correction", "cancel request reason is incorrect");
assert(cancelCalls[0]?.body.operatorId === "U-OFFICE-A", "cancel request missed operatorId");
assert(cancelResult.status === "已取消" && cancelResult.releasedReservations[0].qty === 0, "cancel response was not mapped");

const reviewCalls = [];
const reviewResult = await reviewOfficeDeliveryEvidence(
  {
    authState,
    fulfillment: deliveryFulfillment,
    operatorId: "U-OFFICE-A",
    reviewerName: "办公室A",
    reviewStatus: "approved",
    remark: "API client evidence review check",
  },
  {
    fetchImpl: async (url, init) => {
      reviewCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: deliveryFulfillment.id,
        reviewStatus: "已复核",
        reviewedAt: "2026-07-02T10:10:00.000Z",
        reviewedBy: "办公室A",
        reviewedByUserId: "U-OFFICE-A",
        issueReason: "",
        operationLogId: "LOG-DELIVERY-EVIDENCE-REVIEW-1",
      });
    },
  },
);

assert(reviewCalls[0]?.url.endsWith("/api/fulfillments/F008/delivery-evidence-review"), "delivery evidence review API URL is incorrect");
assert(reviewCalls[0]?.body.reviewStatus === "approved", "delivery evidence review status is incorrect");
assert(reviewCalls[0]?.body.reviewerName === "办公室A", "delivery evidence review missed reviewer name");
assert(reviewResult.reviewStatus === "已复核" && reviewResult.operationLogId === "LOG-DELIVERY-EVIDENCE-REVIEW-1", "delivery evidence review response was not mapped");

const retakeCalls = [];
const retakeResult = await reviewOfficeDeliveryEvidence(
  {
    authState,
    fulfillment: deliveryFulfillment,
    operatorId: "U-OFFICE-A",
    reviewerName: "办公室A",
    reviewStatus: "retake_required",
    reason: "水印定位不清晰",
  },
  {
    fetchImpl: async (url, init) => {
      retakeCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        fulfillmentId: deliveryFulfillment.id,
        reviewStatus: "需重拍",
        reviewedAt: "2026-07-02T10:15:00.000Z",
        reviewedBy: "办公室A",
        reviewedByUserId: "U-OFFICE-A",
        issueReason: "水印定位不清晰",
        todoId: "T-DELIVERY-RETAKE-1",
        todoType: "照片待重拍",
        operationLogId: "LOG-DELIVERY-EVIDENCE-REJECT-1",
      });
    },
  },
);

assert(retakeCalls[0]?.body.reviewStatus === "retake_required", "delivery evidence retake status is incorrect");
assert(retakeCalls[0]?.body.reason === "水印定位不清晰", "delivery evidence retake reason is incorrect");
assert(retakeResult.reviewStatus === "需重拍" && retakeResult.todoId === "T-DELIVERY-RETAKE-1", "delivery evidence retake response was not mapped");

const deniedReviewResult = await reviewOfficeDeliveryEvidence(
  {
    authState,
    fulfillment: deliveryFulfillment,
    operatorId: "U-DRIVER-A",
    reviewStatus: "approved",
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: delivery.evidence.review",
        requiredPermission: "delivery.evidence.review",
      }),
  },
);

assert(deniedReviewResult.blocked === true, "delivery evidence review permission denial should block local fallback");
assert(deniedReviewResult.error.requiredPermission === "delivery.evidence.review", "delivery evidence review permission denial was not surfaced");

const deniedResult = await printOfficeFulfillment(
  {
    authState,
    fulfillment: expressFulfillment,
    action: "打印标签",
    operatorId: "U-FINANCE-A",
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: fulfillment.print",
        requiredPermission: "fulfillment.print",
      }),
  },
);

assert(deniedResult.blocked === true, "fulfillment API permission denial should block local fallback");
assert(deniedResult.error.requiredPermission === "fulfillment.print", "fulfillment permission denial was not surfaced");

const fallbackResult = await completeOfficeFulfillment(
  {
    authState,
    fulfillment: deliveryFulfillment,
    operatorId: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);

assert(fallbackResult.source === "local_fallback", "fulfillment network failure should fall back locally");

const reviewFallbackResult = await reviewOfficeDeliveryEvidence(
  {
    authState,
    fulfillment: deliveryFulfillment,
    operatorId: "U-OFFICE-A",
    reviewStatus: "approved",
  },
  {
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);

assert(reviewFallbackResult.source === "local_fallback", "delivery evidence review network failure should fall back locally");

const strictWriteChecks = [
  {
    name: "print",
    expectedCode: "FULFILLMENT_PRINT_API_UNAVAILABLE",
    invoke: () =>
      printOfficeFulfillment(
        { authState, fulfillment: expressFulfillment, action: "打印标签", operatorId: "U-OFFICE-A" },
        strictOfflineOptions(),
      ),
  },
  {
    name: "print void",
    expectedCode: "PRINT_RECORD_VOID_API_UNAVAILABLE",
    invoke: () => voidOfficePrintRecord({ authState, printRecordId: "PR-F003", operatorId: "U-OFFICE-A" }, strictOfflineOptions()),
  },
  {
    name: "complete",
    expectedCode: "FULFILLMENT_COMPLETE_API_UNAVAILABLE",
    invoke: () => completeOfficeFulfillment({ authState, fulfillment: deliveryFulfillment, operatorId: "U-WAREHOUSE-A" }, strictOfflineOptions()),
  },
  {
    name: "pickup confirmation",
    expectedCode: "FULFILLMENT_PICKUP_API_UNAVAILABLE",
    invoke: () => confirmOfficeFulfillmentPickup({ authState, fulfillment: expressFulfillment, operatorId: "U-WAREHOUSE-A" }, strictOfflineOptions()),
  },
  {
    name: "exception",
    expectedCode: "FULFILLMENT_EXCEPTION_API_UNAVAILABLE",
    invoke: () =>
      createOfficeFulfillmentException(
        { authState, fulfillment: expressFulfillment, modalType: "unable", reason: "库存不足", operatorId: "U-WAREHOUSE-A" },
        strictOfflineOptions(),
      ),
  },
  {
    name: "dispatch",
    expectedCode: "FULFILLMENT_DISPATCH_API_UNAVAILABLE",
    invoke: () =>
      updateOfficeFulfillmentDispatch(
        { authState, fulfillment: deliveryFulfillment, operatorId: "U-OFFICE-A", driverId: "U-DRIVER-A", routeDate: "2026-07-02", routeNo: "虎门线-A", routeSequence: 1 },
        strictOfflineOptions(),
      ),
  },
  {
    name: "cancel",
    expectedCode: "FULFILLMENT_CANCEL_API_UNAVAILABLE",
    invoke: () => cancelOfficeFulfillment({ authState, fulfillment: deliveryFulfillment, operatorId: "U-OFFICE-A" }, strictOfflineOptions()),
  },
  {
    name: "delivery evidence review",
    expectedCode: "DELIVERY_EVIDENCE_REVIEW_API_UNAVAILABLE",
    invoke: () =>
      reviewOfficeDeliveryEvidence(
        { authState, fulfillment: deliveryFulfillment, operatorId: "U-OFFICE-A", reviewStatus: "approved" },
        strictOfflineOptions(),
      ),
  },
];

for (const check of strictWriteChecks) {
  const result = await check.invoke();
  assert(result.blocked === true, `strict ${check.name} must not use the local projection`);
  assert(result.source === "api_error", `strict ${check.name} should report an API error`);
  assert(result.error?.code === check.expectedCode, `strict ${check.name} reported the wrong API error`);
}

console.log(
  "Frontend fulfillment API client check passed: print, dispatch, void/reprint, complete, pickup, exception, cancel, delivery evidence review, denial blocking, and local fallback are covered.",
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

function strictOfflineOptions() {
  return {
    serverRequired: true,
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
