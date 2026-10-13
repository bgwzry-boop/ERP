import assert from "node:assert/strict";
import {
  createFulfillmentReadProjectionService,
  getFulfillmentMethodLabel,
  normalizeFulfillmentMethod,
} from "../server/services/fulfillmentReadProjectionService.mjs";

assert.equal(normalizeFulfillmentMethod("快递快运"), "express_ltl");
assert.equal(normalizeFulfillmentMethod("delivery"), "delivery");
assert.equal(getFulfillmentMethodLabel("pickup"), "自提");

const workspace = {
  customers: [
    { id: "C-1", name: "白鲸自营店" },
    { customer_id: "C-2", name: "张三服饰" },
  ],
  orderLines: [
    {
      id: "OL-1",
      customerId: "C-1",
      product: "白鲸活动袋",
      size: "35*27",
      color: "白色",
      handle: "普通提",
      print: "是",
      printColor: "黑色",
      handleColor: "黑色",
      printSide: "单面",
      qty: 1500,
      note: "加急",
    },
    {
      order_line_id: "OL-2",
      customer_id: "C-2",
      productName: "空白袋",
      size: "30*38",
      color: "红色",
      handle: "普通提",
      qty: 500,
    },
  ],
  fulfillments: [
    {
      fulfillment_id: "F-1",
      order_line_id: "OL-1",
      customer_id: "C-1",
      method: "快递快运",
      expected_qty: "1500",
      actual_qty: "",
      package_summary: "第 1/3 包",
      latest_needed_at: "今天 19:00",
      status: "待打印标签",
      inventory_source: "待快运区",
      note_flags: ["加急", "加急", ""],
    },
    {
      id: "F-2",
      lineId: "OL-2",
      customerId: "C-2",
      method: "送货",
      qty: "bad",
      actualQty: "bad",
      packages: "1包",
      latest: "明天 10:00",
      status: "数量差异待处理",
    },
    {
      id: "F-3",
      lineId: "OL-2",
      customerId: "C-2",
      method: "自提",
      qty: 500,
      latest: "昨天 10:00",
      status: "已交付",
    },
  ],
  packages: [
    { packageId: "PKG-1", fulfillmentId: "F-2", orderLineId: "OL-2" },
    { packageId: "PKG-2", fulfillmentId: "F-2", orderLineId: "OL-2" },
  ],
  driverDeliveryDispatches: [
    {
      fulfillmentId: "F-2",
      driverId: "U-DRIVER",
      routeDate: "2026-07-15",
      routeNo: "R-1",
      routeSequence: "bad",
      dispatchStatus: "已派单",
    },
  ],
  warehouseOutboundExecutions: [
    {
      warehouseOutboundExecutionId: "WEX-F1-1",
      fulfillmentId: "F-1",
      paperOutboundDocumentId: "POD-F1-1",
      paperDocumentVersion: 2,
      paperDocumentRevision: 3,
      result: "实物已出库",
      expectedQty: 1500,
      actualQty: 1500,
      physicalExecutorEmployeeId: "ERP-0008",
      feedbackChannel: "纸面",
      authenticatedOperatorId: "U-OFFICE-A",
      executedAt: "2026-07-15T10:30:00.000Z",
    },
  ],
};

const service = createFulfillmentReadProjectionService();
const express = service.listFulfillments({
  workspace,
  searchParams: new URLSearchParams({ method: "express_ltl" }),
});
assert.deepEqual(express.items.map((item) => item.fulfillmentId), ["F-1"]);
assert.equal(express.items[0].method, "express_ltl");
assert.equal(express.items[0].methodLabel, "快递快运");
assert.equal(express.items[0].actualQty, null);
assert.equal(express.items[0].packageCount, 3);
assert.deepEqual(express.items[0].noteFlags, ["加急"]);
assert.match(express.items[0].goodsSpec, /白印黑/);
assert.match(express.items[0].goodsSpec, /白袋黑提/);
assert.match(express.items[0].goodsSpec, /单面/);
assert.match(express.items[0].goodsSpec, /1500个/);
assert.deepEqual(express.items[0].latestWarehouseExecution, {
  warehouseOutboundExecutionId: "WEX-F1-1",
  paperOutboundDocumentId: "POD-F1-1",
  paperDocumentVersion: 2,
  paperDocumentRevision: 3,
  result: "实物已出库",
  expectedQty: 1500,
  actualQty: 1500,
  physicalExecutorEmployeeId: "ERP-0008",
  feedbackChannel: "纸面",
  executedAt: "2026-07-15T10:30:00.000Z",
  note: "",
  authenticatedOperatorId: "U-OFFICE-A",
});

const chineseMethod = service.listFulfillments({
  workspace,
  searchParams: { method: "送货", exceptionOnly: "true" },
});
assert.deepEqual(chineseMethod.items.map((item) => item.fulfillmentId), ["F-2"]);
assert.equal(chineseMethod.items[0].method, "delivery");
assert.equal(chineseMethod.items[0].methodLabel, "送货");
assert.equal(chineseMethod.items[0].expectedQty, 500);
assert.equal(chineseMethod.items[0].actualQty, null);
assert.equal(chineseMethod.items[0].packageCount, 2);
assert.equal(chineseMethod.items[0].routeSequence, 0);

const all = service.listFulfillments({ workspace, searchParams: new URLSearchParams() });
assert.deepEqual(all.items.map((item) => item.fulfillmentId), ["F-2", "F-1", "F-3"]);
assert.deepEqual(all.metrics, {
  openCount: 2,
  todayUrgentCount: 1,
  exceptionCount: 1,
  waitingPickupCount: 0,
});
assert.equal(JSON.stringify(all).includes("NaN"), false);

const detail = service.getFulfillment({ workspace, fulfillmentId: "F-1" });
assert.deepEqual(detail, express.items[0]);
assert.equal(service.getFulfillment({ workspace, fulfillmentId: "MISSING" }), null);

const printedExpressWorkspace = structuredClone(workspace);
printedExpressWorkspace.packages.push({
  packageId: "PKG-F1-1",
  fulfillmentId: "F-1",
  orderLineId: "OL-1",
  status: "已打印标签",
  labelPrintRecordId: "PR-LABEL-F1",
  revision: 2,
});
printedExpressWorkspace.printRecords = [
  {
    printRecordId: "PR-LABEL-F1",
    targetType: "fulfillment",
    targetId: "F-1",
    documentType: "express_ltl_label",
    status: "printed",
    printedAt: "2026-07-15T10:00:00.000Z",
    packageSnapshot: [{ packageId: "PKG-F1-1", revision: 1 }],
  },
  {
    printRecordId: "PR-PAPER-F1",
    targetType: "fulfillment",
    targetId: "F-1",
    documentType: "outbound_note",
    status: "printed",
    printedAt: "2026-07-15T10:05:00.000Z",
    packageSnapshot: [{ packageId: "PKG-F1-1", revision: 2 }],
  },
];
printedExpressWorkspace.paperOutboundDocuments = [{
  paperOutboundDocumentId: "POD-F1",
  fulfillmentId: "F-1",
  printRecordId: "PR-PAPER-F1",
  documentType: "outbound_note",
  documentVersion: 1,
  status: "待打印确认",
}];
const printedExpress = service.getFulfillment({ workspace: printedExpressWorkspace, fulfillmentId: "F-1" });
assert.equal(printedExpress.labelsPrinted, true, "paper outbound records must not replace the latest label record");
assert.equal(printedExpress.labelPrintRecordId, "PR-LABEL-F1");
assert.equal(printedExpress.activePrintRecordId, "PR-PAPER-F1");
assert.equal(printedExpress.paperOutboundStatus, "已打印待交库房");

console.log("fulfillment read projection service checks passed");
