import assert from "node:assert/strict";
import {
  buildDriverDeliveryTask,
  buildDriverPackageChecklist,
  findActiveDriverDeliveryDispatch,
  findActiveFulfillmentPrintRecord,
  findDriverDeliveryFulfillment,
  getDriverColorSpecLabel,
  getDriverDeliveryNextStep,
  getDriverDeliveryTaskResponseProjection,
  getFulfillmentSortSequence,
  inferDriverAddressArea,
  mapDriverDeliveryStatus,
} from "../server/services/driverDeliveryTaskProjectionService.mjs";

const fulfillment = {
  id: "F-DRIVER-1",
  method: "送货",
  orderLineId: "ORD-0629-010-01",
  customerId: "C-1",
  qty: 1500,
  actualQty: 1500,
  packages: "2包",
  status: "配送中",
  activePrintRecordId: "PR-VOID",
  zone: "待发区",
  source: "成品仓",
};

const workspace = {
  fulfillments: [fulfillment, { fulfillmentId: "F-ALIAS", method: "送货" }, { id: "F-PICKUP", method: "自提" }],
  orderLines: [
    {
      id: "ORD-0629-010-01",
      orderNo: "ORD-0629-010",
      lineNo: "01",
      customerId: "C-1",
      product: "白鲸活动袋",
      size: "35*27",
      color: "白色",
      print: "是",
      printColor: "黑色",
      printSide: "双面",
      handleColor: "黑色",
      qty: 1500,
      note: "加长提",
    },
  ],
  customers: [
    {
      id: "C-1",
      name: "白鲸自营店",
      contact: "店铺客服",
      phone: "17700001160",
      address: "临沂市兰山区 仓库A",
    },
  ],
  printRecords: [
    {
      printRecordId: "PR-OLD",
      targetType: "fulfillment",
      targetId: "F-DRIVER-1",
      batchNo: "PB-OLD",
      status: "printed",
      printedAt: "2026-07-13T08:00:00.000Z",
    },
    {
      printRecordId: "PR-LATEST",
      targetType: "fulfillment",
      targetId: "F-DRIVER-1",
      batchNo: "PB-LATEST",
      status: "printed",
      printedAt: "2026-07-14T08:00:00.000Z",
    },
    {
      printRecordId: "PR-VOID",
      targetType: "fulfillment",
      targetId: "F-DRIVER-1",
      batchNo: "PB-VOID",
      status: "voided",
      printedAt: "2026-07-14T09:00:00.000Z",
    },
  ],
  driverDeliveryDispatches: [
    {
      id: "DSP-CANCELED",
      fulfillmentId: "F-DRIVER-1",
      driverId: "U-WRONG",
      routeDate: "2026-07-13",
      stopSequence: 1,
      dispatchStatus: "已取消",
    },
    {
      id: "DSP-LATE",
      fulfillmentId: "F-DRIVER-1",
      driverId: "U-DRIVER-B",
      routeDate: "2026-07-15",
      routeBatchNo: "R-2",
      stopSequence: 1,
      dispatchStatus: "已派车",
    },
    {
      id: "DSP-ACTIVE",
      fulfillmentId: "F-DRIVER-1",
      driverId: "U-DRIVER-A",
      routeDate: "2026-07-14",
      routeBatchNo: "R-1",
      stopSequence: 2,
      dispatchStatus: "已派车",
      assignedAt: "2026-07-14T07:30:00.000Z",
    },
  ],
  packages: [
    {
      packageId: "PKG-2",
      fulfillmentId: "F-DRIVER-1",
      orderLineId: "ORD-0629-010-01",
      packageSeq: 2,
      packedQty: 700,
      status: "已打印",
    },
    {
      packageId: "PKG-1",
      fulfillmentId: "F-DRIVER-1",
      orderLineId: "ORD-0629-010-01",
      packageSeq: 1,
      packedQty: 800,
      status: "已打印",
      checked: true,
    },
    {
      packageId: "PKG-OTHER-FULFILLMENT",
      fulfillmentId: "F-OTHER",
      orderLineId: "ORD-0629-010-01",
      packageSeq: 1,
      packedQty: 999,
      status: "已打印",
    },
  ],
};

const projectionInputs = structuredClone({ workspace, fulfillment });
const task = buildDriverDeliveryTask(workspace, fulfillment, { driverId: "U-FALLBACK" });
assert.equal(task.driverId, "U-DRIVER-A");
assert.equal(task.routeDate, "2026-07-14");
assert.equal(task.routeNo, "R-1");
assert.equal(task.routeSequence, 2);
assert.equal(task.deliveryNoteNo, "PB-LATEST", "voided explicit print records must fall back to the latest active record");
assert.equal(task.orderTail, "#010-01");
assert.match(task.goodsSummary, /白鲸活动袋/);
assert.match(task.goodsSummary, /35\*27/);
assert.match(task.goodsSummary, /白印黑/);
assert.match(task.goodsSummary, /白袋黑提/);
assert.match(task.goodsSummary, /双面/);
assert.match(task.goodsSummary, /1500个/);
assert.match(task.goodsSummary, /加长提/);
assert.deepEqual(task.packageChecklist.map((item) => item.packageId), ["PKG-1", "PKG-2"]);
assert.equal(task.packageChecklist[0].labelText, "第 1/2 包");
assert.equal(task.packageChecklist[0].checked, true);
assert.equal(task.packageChecklist.some((item) => item.packageId === "PKG-OTHER-FULFILLMENT"), false);
assert.equal(task.status, "配送中");
assert.match(task.nextStep, /水印照片/);
assert.equal(task.addressArea, "临沂市兰山区");
assert.equal(task.inventorySource, "待发区 / 成品仓");

const fallbackPackages = buildDriverPackageChecklist(
  { packages: [] },
  {
    fulfillment: { id: "F-SPLIT", packages: "2包" },
    orderLineId: "LINE-SPLIT",
    packageCount: 2,
    qty: 5,
  },
);
assert.deepEqual(fallbackPackages.map((item) => item.packedQty), [3, 2]);
assert.deepEqual(fallbackPackages.map((item) => item.labelText), ["第 1/2 包", "第 2/2 包"]);

assert.equal(getDriverColorSpecLabel({ color: "黄色", handleColor: "红色" }), "黄袋红提");
assert.equal(mapDriverDeliveryStatus("数量差异待处理"), "送货异常");
assert.equal(mapDriverDeliveryStatus("已交付"), "已完成");
assert.match(getDriverDeliveryNextStep("送货异常"), /办公室/);
assert.equal(inferDriverAddressArea(""), "地址待补");
assert.equal(findDriverDeliveryFulfillment(workspace, "F-ALIAS")?.fulfillmentId, "F-ALIAS");
assert.equal(findDriverDeliveryFulfillment(workspace, "F-PICKUP"), null);
assert.equal(findActiveFulfillmentPrintRecord(workspace, fulfillment)?.printRecordId, "PR-LATEST");
assert.equal(findActiveDriverDeliveryDispatch(workspace, fulfillment.id)?.id, "DSP-ACTIVE");
assert.equal(getFulfillmentSortSequence(workspace, "F-ALIAS"), 2);

const repositoryTask = { driverTaskId: "F-DRIVER-1", source: "repository" };
assert.equal(
  await getDriverDeliveryTaskResponseProjection(
    {
      ...workspace,
      driverDeliveryTaskReadRepository: {
        async getDriverDeliveryTask(input) {
          assert.equal(input.fulfillmentId, "F-DRIVER-1");
          assert.equal(input.operatorId, "U-DRIVER-A");
          return repositoryTask;
        },
      },
    },
    { fulfillmentId: "F-DRIVER-1", operatorId: "U-DRIVER-A" },
  ),
  repositoryTask,
);
const fallbackTask = await getDriverDeliveryTaskResponseProjection(
  {
    ...workspace,
    driverDeliveryTaskReadRepository: { async getDriverDeliveryTask() { return null; } },
  },
  { fulfillmentId: "F-DRIVER-1", operatorId: "U-FALLBACK", fallbackFulfillment: fulfillment },
);
assert.equal(fallbackTask.fulfillmentId, "F-DRIVER-1");
assert.equal(fallbackTask.driverId, "U-DRIVER-A", "active dispatch remains authoritative over fallback operator identity");
assert.deepEqual({ workspace, fulfillment }, projectionInputs, "driver delivery task projection must not mutate its inputs");

console.log(
  "Driver delivery task projection service check passed: shared shorthand, package ownership, routing, status, and read-only boundaries are covered.",
);
