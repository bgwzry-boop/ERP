import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWorkspaceRecordService } from "../server/services/workspaceRecordService.mjs";

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
assert.match(registrySource, /createWorkspaceRecordService\(\)/);
assert.match(registrySource, /\} = workspaceRecordService;/);
assert.doesNotMatch(apiSource, /from "\.\.\/src\/data\/fixtures\.js"/);
assert.doesNotMatch(apiSource, /normalizeTodoReferenceForWrite/);

const methodNames = [
  "addOperationLog",
  "buildCustomerSnapshot",
  "buildFulfillmentActionRecord",
  "buildOperationLog",
  "buildTodo",
  "cleanServerText",
  "findAttachmentRecord",
  "findCustomerName",
  "findFulfillment",
  "findInventoryCorrectionDraft",
  "findInventoryItem",
  "findInventoryReservation",
  "findOrderLine",
  "findPrintDevice",
  "findPrintJob",
  "findProductionTask",
  "findStatement",
  "nextId",
  "nextPlainId",
  "resolvePersistableCreatedBy",
  "summarizeOrderLineForChange",
];
for (const functionName of methodNames) {
  assert.doesNotMatch(apiSource, new RegExp(`(?:async )?function ${functionName}\\(`));
}

const fixedNow = new Date("2026-07-14T12:00:00.000Z");
const repositoryCalls = [];
const workspace = {
  attachments: [{ id: "ATT-1", attachmentId: "ATT-PRIMARY" }],
  customers: [
    { id: "C001", name: "客户甲", shortName: "甲", settlementCycle: "月结" },
    { id: "C002", name: "客户乙" },
  ],
  fulfillments: [{ id: "F-1", fulfillmentId: "F-PRIMARY" }],
  inventories: [{ id: "INV-1" }],
  inventoryCorrectionDrafts: [{ id: "ADJ-1", correctionDraftId: "ADJ-PRIMARY" }],
  inventoryReservations: [{ id: "RES-1", reservationId: "RES-PRIMARY" }],
  operationLogs: [],
  orderLines: [
    {
      id: "OL-1",
      orderLineId: "OL-PRIMARY",
      orderNo: "ORD-1",
      customerId: "C001",
      product: "定制袋",
      size: "30*38*10",
      color: "白色",
      handle: "黑提",
      style: "空白袋",
      qty: 100,
      status: "待出库",
      fulfillment: "送货",
      exceptions: ["加急"],
      latest: "今天",
    },
  ],
  printDevices: [{ id: "DEVICE-LOCAL", printDeviceId: "DEVICE-PRIMARY" }],
  printJobs: [{ id: "JOB-LOCAL", printJobId: "JOB-PRIMARY" }],
  productionTasks: [{ id: "PT-1", productionTaskId: "PT-PRIMARY" }],
  statements: [{ id: "ST-1" }],
  todos: [],
  users: [{ userId: "U-KNOWN" }, { id: "U-LEGACY" }],
  printDeviceRepository: {
    async listPrintDevices(input) {
      repositoryCalls.push({ kind: "device", input });
      return [{ id: "DEVICE-REPO", printDeviceId: "DEVICE-REPO-PRIMARY" }];
    },
  },
  printJobRepository: {
    async listPrintJobs(input) {
      repositoryCalls.push({ kind: "job", input });
      return [{ id: "JOB-REPO", printJobId: "JOB-REPO-PRIMARY" }];
    },
  },
};

const service = createWorkspaceRecordService({ now: () => fixedNow });
assert.equal(Object.isFrozen(service), true);
assert.deepEqual(Object.keys(service).sort(), [...methodNames].sort());
assert.equal(service.cleanServerText("  value  "), "value");
assert.equal(service.nextId("LOG", [{}, {}]), "LOG-003");
assert.equal(service.nextPlainId("TASK", " A/B 01 "), "TASK--A-B-01-");

assert.equal(service.findAttachmentRecord(workspace, " ATT-PRIMARY "), workspace.attachments[0]);
assert.equal(service.findAttachmentRecord(workspace, "ATT-1"), workspace.attachments[0]);
assert.equal(service.findAttachmentRecord(workspace, " "), null);
assert.equal(service.findFulfillment(workspace, "F-PRIMARY"), workspace.fulfillments[0]);
assert.equal(service.findInventoryCorrectionDraft(workspace, "ADJ-PRIMARY"), workspace.inventoryCorrectionDrafts[0]);
assert.equal(service.findInventoryItem(workspace, "INV-1"), workspace.inventories[0]);
assert.equal(service.findInventoryReservation(workspace, "RES-PRIMARY"), workspace.inventoryReservations[0]);
assert.equal(service.findOrderLine(workspace, "OL-PRIMARY"), workspace.orderLines[0]);
assert.equal(service.findProductionTask(workspace, "PT-PRIMARY"), workspace.productionTasks[0]);
assert.equal(service.findStatement(workspace, "ST-1"), workspace.statements[0]);
assert.equal(service.findCustomerName(workspace, "C001"), "客户甲");
assert.equal(service.findCustomerName(workspace, "C404"), "");

assert.equal(await service.findPrintDevice(workspace, " DEVICE-PRIMARY "), workspace.printDevices[0]);
assert.equal(await service.findPrintJob(workspace, " JOB-PRIMARY "), workspace.printJobs[0]);
assert.equal(repositoryCalls.length, 0);
assert.equal((await service.findPrintDevice(workspace, "DEVICE-REPO-PRIMARY")).id, "DEVICE-REPO");
assert.equal((await service.findPrintJob(workspace, "JOB-REPO-PRIMARY")).id, "JOB-REPO");
assert.equal(await service.findPrintDevice(workspace, ""), null);
assert.equal(await service.findPrintJob(workspace, ""), null);
assert.equal(repositoryCalls.length, 2);
assert.equal(repositoryCalls[0].input.workspace, workspace);
assert.deepEqual(repositoryCalls[0].input.filters, {});

assert.deepEqual(service.buildCustomerSnapshot(workspace, "C001"), {
  customerId: "C001",
  name: "客户甲",
  shortName: "甲",
  settlementCycle: "月结",
});
assert.deepEqual(service.buildCustomerSnapshot(workspace, "C002"), {
  customerId: "C002",
  name: "客户乙",
  shortName: "客户乙",
  settlementCycle: "",
});
assert.equal(service.resolvePersistableCreatedBy(workspace, " U-KNOWN ", "U-FALLBACK"), "U-KNOWN");
assert.equal(service.resolvePersistableCreatedBy(workspace, "U-UNKNOWN", " U-FALLBACK "), "U-FALLBACK");

const fulfillmentRecord = service.buildFulfillmentActionRecord(
  workspace,
  {
    id: "F-NEW",
    lineId: "OL-1",
    method: "送货",
    qty: 100,
    status: "待出库",
  },
  { actualQty: 96, operatorId: "U-KNOWN", confirmedAt: fixedNow.toISOString() },
);
assert.deepEqual(
  {
    fulfillmentId: fulfillmentRecord.fulfillmentId,
    bizNo: fulfillmentRecord.bizNo,
    orderLineId: fulfillmentRecord.orderLineId,
    customerId: fulfillmentRecord.customerId,
    customerSnapshot: fulfillmentRecord.customerSnapshot,
    expectedQty: fulfillmentRecord.expectedQty,
    actualQty: fulfillmentRecord.actualQty,
    latestNeededAt: fulfillmentRecord.latestNeededAt,
    confirmedBy: fulfillmentRecord.confirmedBy,
    createdBy: fulfillmentRecord.createdBy,
  },
  {
    fulfillmentId: "F-NEW",
    bizNo: "F-NEW",
    orderLineId: "OL-1",
    customerId: "C001",
    customerSnapshot: {
      customerId: "C001",
      name: "客户甲",
      shortName: "甲",
      settlementCycle: "月结",
    },
    expectedQty: 100,
    actualQty: 96,
    latestNeededAt: "今天",
    confirmedBy: "U-KNOWN",
    createdBy: "U-KNOWN",
  },
);

assert.deepEqual(service.summarizeOrderLineForChange(workspace.orderLines[0]), {
  orderLineId: "OL-PRIMARY",
  orderId: "ORD-1",
  customerId: "C001",
  productName: "定制袋",
  size: "30*38*10",
  bagColor: "白色",
  handleType: "黑提",
  style: "空白袋",
  originalQty: 100,
  lineStatus: "待出库",
  fulfillmentMethod: "送货",
  exceptionTags: ["加急"],
  voidReason: "",
  voidedBy: "",
  voidedAt: "",
});

const operationLog = service.buildOperationLog(workspace, {
  targetType: "order_line",
  targetId: "OL-1",
  action: "test",
});
assert.deepEqual(operationLog, {
  id: "LOG-001",
  targetType: "order_line",
  targetId: "OL-1",
  action: "test",
  before: null,
  after: null,
  reason: "",
  operatorId: "U-OFFICE-A",
  pageKey: "api",
  occurredAt: fixedNow.toISOString(),
  createdAt: fixedNow.toISOString(),
});
assert.equal(service.addOperationLog(workspace, { id: "LOG-CUSTOM", action: "custom" }), "LOG-CUSTOM");
assert.equal(workspace.operationLogs[0].id, "LOG-CUSTOM");

const todo = service.buildTodo(workspace, {
  id: "TODO-1",
  type: "库存修正待确认",
  refType: "inventory_correction",
  refId: "ADJ-1",
  customerId: "C001",
  summary: "库存修正",
});
assert.equal(todo.ref, "ADJ-1");
assert.equal(todo.refType, "inventory_correction");
assert.equal(todo.createdAt, fixedNow.toISOString());
assert.equal(todo.updatedAt, fixedNow.toISOString());
assert.equal(todo.wait, "刚刚");
assert.throws(
  () => service.buildTodo(workspace, { type: "库存修正待确认", refType: "inventory_correction" }),
  (error) => error?.code === "TODO_REFERENCE_REQUIRED",
);
assert.throws(
  () => createWorkspaceRecordService({ now: null }),
  /requires now to be a function/,
);

console.log(
  "Workspace record service checks passed: IDs, authoritative lookups, repository fallback, audit, todo references, customer snapshots, and fulfillment records are isolated",
);
