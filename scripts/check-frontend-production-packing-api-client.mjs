import { createLocalSeedAuthState } from "../src/services/officeAuthService.js";
import { getProductionPackingFocusFromLedgerEntry } from "../src/domain/productionPackingSourceFocus.js";
import {
  buildPackingTaskId,
  buildProductionTaskId,
  completeOfficePackingTask,
  findProductionInventoryItem,
  getProductionMachineId,
  getOfficePackingTaskDetail,
  getOfficeProductionTaskDetail,
  getProductionProcessType,
  listOfficePackingTasks,
  listOfficeProductionMachineQueue,
  listOfficeProductionTasks,
  moveOfficeProductionMachineQueueItem,
  publishOfficeProductionSchedule,
  resequenceOfficeProductionMachineQueue,
  reviewOfficeProductionFinishedGoodsPhoto,
  reportOfficeProductionDailyProgress,
  reportOfficeProductionComplete,
  uploadOfficeProductionFinishedGoodsPhoto,
} from "../src/services/officeProductionPackingApiClient.js";

const authState = createLocalSeedAuthState("U-OFFICE-A");
const productionLine = {
  id: "ORD-0629-003-01",
  customerId: "C004",
  product: "美的空调",
  size: "30*38*10",
  color: "白色",
  handle: "普通提",
  style: "空白袋",
  qty: 1000,
  print: "是",
  printColor: "黄色",
  printSide: "双面",
  status: "制袋中",
  fulfillment: "快递快运",
};
const productionInventory = {
  id: "30*38*10-白色-普通提-空白袋-待快运区",
  size: "30*38*10",
  color: "白色",
  handle: "普通提",
  style: "空白袋",
  zone: "待快运区",
};
const packingTask = {
  packingTaskId: "PKT-ORD-0629-003-01",
  orderLineId: productionLine.id,
  plannedQty: 1000,
  status: "待打包",
};

assert(buildProductionTaskId(productionLine) === "PT-ORD-0629-003-01", "production task ID was not derived from order line");
assert(buildPackingTaskId(productionLine) === "PKT-ORD-0629-003-01", "packing task ID was not derived from order line");
assert(getProductionProcessType(productionLine) === "制袋", "bag-making process type was not mapped");
assert(getProductionMachineId(productionLine) === "BAG-01", "bag-making machine ID was not mapped");
assert(getProductionProcessType({ ...productionLine, status: "丝印中" }) === "丝印", "printing process type was not mapped");
assert(findProductionInventoryItem(productionLine, [productionInventory])?.id === productionInventory.id, "production inventory item was not matched");

const productionListCalls = [];
const productionListResult = await listOfficeProductionTasks(
  {
    authState,
    query: { status: "open", taskType: "制袋", keyword: "美的", visibility: "workshop_mobile", machineId: "BAG-01", pageSize: 2 },
    operatorId: "U-OFFICE-A",
  },
  {
    fetchImpl: async (url, init) => {
      productionListCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [
          {
            productionTaskId: "PT-ORD-0629-003-01",
            orderLineId: productionLine.id,
            productionTask: {
              productionTaskId: "PT-ORD-0629-003-01",
              orderLineId: productionLine.id,
              taskType: "制袋",
              machineId: "BAG-01",
              publishedScheduleId: "SCH-API-BAG-01-001",
              plannedQty: 1000,
              taskStatus: "制袋中",
            },
            orderLine: {
              orderLineId: productionLine.id,
              productName: productionLine.product,
              size: productionLine.size,
              bagColor: productionLine.color,
              handleType: productionLine.handle,
              style: productionLine.style,
              originalQty: 1000,
              lineStatus: "制袋中",
            },
            latestReport: null,
            dailyProgress: {
              latestReportId: "WDP-LIST-1",
              progressDate: "2026-07-03",
              latestDailyQualifiedQty: 420,
              cumulativeQualifiedQty: 420,
              remainingQty: 580,
              plannedQty: 1000,
              carryOver: true,
              nextWorkDate: "2026-07-04",
              machineCountAffectsInventory: false,
              inventoryCreated: false,
              reservationCreated: false,
              packingTaskCreated: false,
            },
            packingTask: null,
            inventoryItem: productionInventory,
            reservations: [],
          },
        ],
        page: 1,
        pageSize: 2,
        total: 1,
      });
    },
  },
);

assert(productionListResult.source === "api", "production task list should use API response");
assert(productionListCalls[0]?.url.includes("/api/production-tasks?"), "production task list URL is incorrect");
assert(productionListCalls[0]?.url.includes("status=open"), "production task list did not include status filter");
assert(productionListCalls[0]?.url.includes("taskType=%E5%88%B6%E8%A2%8B"), "production task list did not encode task type");
assert(productionListCalls[0]?.url.includes("visibility=workshop_mobile"), "production task list did not include workshop visibility filter");
assert(productionListCalls[0]?.url.includes("machineId=BAG-01"), "production task list did not include machine filter");
assert(productionListCalls[0]?.init.method === "GET", "production task list method is incorrect");
assert(productionListResult.items[0]?.productionTask?.taskType === "制袋", "production task list did not map task summary");
assert(productionListResult.items[0]?.productionTask?.publishedScheduleId === "SCH-API-BAG-01-001", "production task list did not map published schedule id");
assert(productionListResult.items[0]?.inventoryItem?.id === productionInventory.id, "production task list did not map inventory item");
assert(productionListResult.items[0]?.dailyProgress?.remainingQty === 580, "production task list did not map daily progress");

const machineQueueCalls = [];
const machineQueueResult = await listOfficeProductionMachineQueue(
  {
    authState,
    query: { machineId: "BAG-01", status: "open", keyword: "美的" },
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      machineQueueCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [
          {
            scheduleRecordId: "SQR-SCH-API-BAG-01-001",
            queueSeq: 1,
            machineId: "BAG-01",
            machineLabel: "BAG-01",
            publishedScheduleId: "SCH-API-BAG-01-001",
            productionTaskId: "PT-ORD-0629-003-01",
            orderLineId: productionLine.id,
            taskType: "制袋",
            status: "制袋已排产",
            taskStatus: "制袋已排产",
            queueReason: "已发布排产",
            customerId: productionLine.customerId,
            customerName: "美的空调网店",
            productName: productionLine.product,
            size: productionLine.size,
            bagColor: productionLine.color,
            handleType: productionLine.handle,
            style: productionLine.style,
            plannedQty: 1000,
            remainingQty: 580,
            dailyProgress: {
              latestReportId: "WDP-LIST-1",
              progressDate: "2026-07-03",
              latestDailyQualifiedQty: 420,
              cumulativeQualifiedQty: 420,
              remainingQty: 580,
              plannedQty: 1000,
              carryOver: true,
              nextWorkDate: "2026-07-04",
              machineCountAffectsInventory: false,
              inventoryCreated: false,
              reservationCreated: false,
              packingTaskCreated: false,
            },
            createdAt: "2026-07-03T10:00:00.000Z",
          },
        ],
        machines: [
          {
            machineId: "BAG-01",
            machineLabel: "BAG-01",
            total: 1,
            plannedQty: 1000,
            remainingQty: 580,
            items: [],
          },
        ],
        total: 1,
        generatedAt: "2026-07-03T10:10:00.000Z",
        source: "derived_from_production_tasks",
        note: "derived queue",
      });
    },
  },
);

assert(machineQueueResult.source === "api", "machine queue should use API response");
assert(machineQueueCalls[0]?.url === "http://127.0.0.1:8787/api/production-schedules/machine-queue?machineId=BAG-01&status=open&keyword=%E7%BE%8E%E7%9A%84", "machine queue URL is incorrect");
assert(machineQueueCalls[0]?.init.method === "GET", "machine queue method is incorrect");
assert(machineQueueResult.items[0]?.queueSeq === 1, "machine queue did not map queue sequence");
assert(machineQueueResult.items[0]?.remainingQty === 580, "machine queue did not map remaining quantity");
assert(machineQueueResult.items[0]?.dailyProgress?.carryOver === true, "machine queue did not map daily progress");
assert(machineQueueResult.machines[0]?.machineId === "BAG-01", "machine queue did not map machine group");

const resequenceQueueCalls = [];
const resequenceQueueResult = await resequenceOfficeProductionMachineQueue(
  {
    authState,
    machineId: "BAG-01",
    orderedProductionTaskIds: ["PT-ORD-0629-003-02", "PT-ORD-0629-003-01"],
    operatorId: "U-OFFICE-A",
    remark: "frontend resequence check",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      resequenceQueueCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        machineId: "BAG-01",
        updatedCount: 2,
        updatedAt: "2026-07-03T10:20:00.000Z",
        updatedBy: "U-OFFICE-A",
        operationLogId: "LOG-SCHEDULE-SEQ-1",
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        productionScheduleRecords: [
          {
            scheduleRecordId: "SQR-SCH-API-BAG-01-002",
            productionTaskId: "PT-ORD-0629-003-02",
            orderLineId: "ORD-0629-003-02",
            publishedScheduleId: "SCH-API-BAG-01-002",
            machineId: "BAG-01",
            queueSeq: 1,
            status: "active",
            sourceKind: "manual_resequence",
            sequenceUpdatedAt: "2026-07-03T10:20:00.000Z",
            sequenceUpdatedBy: "U-OFFICE-A",
            remark: "API client resequence check",
          },
          {
            scheduleRecordId: "SQR-SCH-API-BAG-01-001",
            productionTaskId: "PT-ORD-0629-003-01",
            orderLineId: productionLine.id,
            publishedScheduleId: "SCH-API-BAG-01-001",
            machineId: "BAG-01",
            queueSeq: 2,
            status: "active",
            sourceKind: "manual_resequence",
            sequenceUpdatedAt: "2026-07-03T10:20:00.000Z",
            sequenceUpdatedBy: "U-OFFICE-A",
            remark: "API client resequence check",
          },
        ],
        items: [
          {
            scheduleRecordId: "SQR-SCH-API-BAG-01-002",
            queueSeq: 1,
            machineId: "BAG-01",
            publishedScheduleId: "SCH-API-BAG-01-002",
            productionTaskId: "PT-ORD-0629-003-02",
            orderLineId: "ORD-0629-003-02",
            taskType: "制袋",
            status: "制袋已排产",
            queueReason: "已发布排产",
            plannedQty: 800,
            remainingQty: 800,
            sequenceUpdatedAt: "2026-07-03T10:20:00.000Z",
            sequenceUpdatedBy: "U-OFFICE-A",
          },
          {
            scheduleRecordId: "SQR-SCH-API-BAG-01-001",
            queueSeq: 2,
            machineId: "BAG-01",
            publishedScheduleId: "SCH-API-BAG-01-001",
            productionTaskId: "PT-ORD-0629-003-01",
            orderLineId: productionLine.id,
            taskType: "制袋",
            status: "制袋已排产",
            queueReason: "已发布排产",
            plannedQty: 1000,
            remainingQty: 580,
            sequenceUpdatedAt: "2026-07-03T10:20:00.000Z",
            sequenceUpdatedBy: "U-OFFICE-A",
          },
        ],
        machines: [
          {
            machineId: "BAG-01",
            total: 2,
            plannedQty: 1800,
            remainingQty: 1380,
            items: [],
          },
        ],
        total: 2,
        generatedAt: "2026-07-03T10:20:00.000Z",
        source: "derived_from_production_tasks",
      });
    },
  },
);

assert(resequenceQueueResult.source === "api", "machine queue resequence should use API response");
assert(resequenceQueueCalls[0]?.url === "http://127.0.0.1:8787/api/production-schedules/machine-queue/resequence", "machine queue resequence URL is incorrect");
assert(resequenceQueueCalls[0]?.init.method === "POST", "machine queue resequence method is incorrect");
assert(resequenceQueueCalls[0]?.body.machineId === "BAG-01", "machine queue resequence machine is incorrect");
assert(resequenceQueueCalls[0]?.body.orderedProductionTaskIds[0] === "PT-ORD-0629-003-02", "machine queue resequence order is incorrect");
assert(resequenceQueueResult.updatedCount === 2, "machine queue resequence did not map updated count");
assert(resequenceQueueResult.items[0]?.queueSeq === 1, "machine queue resequence did not map first queue seq");
assert(resequenceQueueResult.items[1]?.queueSeq === 2, "machine queue resequence did not map second queue seq");
assert(resequenceQueueResult.items[0]?.sequenceUpdatedBy === "U-OFFICE-A", "machine queue resequence did not map sequence updater");
assert(resequenceQueueResult.productionScheduleRecords[0]?.sourceKind === "manual_resequence", "machine queue resequence did not map schedule records");
assert(resequenceQueueResult.productionScheduleRecords[1]?.queueSeq === 2, "machine queue resequence did not preserve schedule record sequence");
assert(resequenceQueueResult.inventoryCreated === false, "machine queue resequence must not create inventory");
assert(resequenceQueueResult.reservationCreated === false, "machine queue resequence must not reserve inventory");
assert(resequenceQueueResult.packingTaskCreated === false, "machine queue resequence must not create packing task");

const moveQueueCalls = [];
const moveQueueResult = await moveOfficeProductionMachineQueueItem(
  {
    authState,
    productionTaskId: "PT-ORD-0629-003-02",
    targetMachineId: "BAG-02",
    targetQueueSeq: 1,
    operatorId: "U-OFFICE-A",
    remark: "frontend machine move check",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      moveQueueCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        productionTaskId: "PT-ORD-0629-003-02",
        sourceMachineId: "BAG-01",
        targetMachineId: "BAG-02",
        targetQueueSeq: 1,
        updatedCount: 3,
        updatedAt: "2026-07-03T10:30:00.000Z",
        updatedBy: "U-OFFICE-A",
        operationLogId: "LOG-SCHEDULE-MOVE-1",
        productionTask: {
          productionTaskId: "PT-ORD-0629-003-02",
          orderLineId: "ORD-0629-003-02",
          taskType: "制袋",
          machineId: "BAG-02",
          publishedScheduleId: "SCH-API-BAG-01-002",
          plannedQty: 800,
          taskStatus: "制袋已排产",
        },
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        productionScheduleRecords: [
          {
            scheduleRecordId: "SQR-SCH-API-BAG-01-002",
            productionTaskId: "PT-ORD-0629-003-02",
            orderLineId: "ORD-0629-003-02",
            publishedScheduleId: "SCH-API-BAG-01-002",
            machineId: "BAG-01",
            queueSeq: 0,
            status: "moved",
            sourceKind: "machine_reassignment",
            sequenceUpdatedAt: "2026-07-03T10:30:00.000Z",
            sequenceUpdatedBy: "U-OFFICE-A",
            remark: "frontend machine move check",
          },
          {
            scheduleRecordId: "SQR-BAG-02-SCH-API-BAG-01-002",
            productionTaskId: "PT-ORD-0629-003-02",
            orderLineId: "ORD-0629-003-02",
            publishedScheduleId: "SCH-API-BAG-01-002",
            machineId: "BAG-02",
            queueSeq: 1,
            status: "active",
            sourceKind: "machine_reassignment",
            sequenceUpdatedAt: "2026-07-03T10:30:00.000Z",
            sequenceUpdatedBy: "U-OFFICE-A",
            remark: "frontend machine move check",
          },
        ],
        items: [
          {
            scheduleRecordId: "SQR-BAG-02-SCH-API-BAG-01-002",
            queueSeq: 1,
            machineId: "BAG-02",
            publishedScheduleId: "SCH-API-BAG-01-002",
            productionTaskId: "PT-ORD-0629-003-02",
            orderLineId: "ORD-0629-003-02",
            taskType: "制袋",
            status: "制袋已排产",
            queueReason: "已发布排产",
            plannedQty: 800,
            remainingQty: 800,
            sequenceUpdatedAt: "2026-07-03T10:30:00.000Z",
            sequenceUpdatedBy: "U-OFFICE-A",
          },
        ],
        machines: [
          {
            machineId: "BAG-02",
            total: 1,
            plannedQty: 800,
            remainingQty: 800,
            items: [],
          },
        ],
        total: 1,
        generatedAt: "2026-07-03T10:30:00.000Z",
        source: "derived_from_production_tasks",
      });
    },
  },
);

assert(moveQueueResult.source === "api", "machine queue move should use API response");
assert(moveQueueCalls[0]?.url === "http://127.0.0.1:8787/api/production-schedules/machine-queue/move", "machine queue move URL is incorrect");
assert(moveQueueCalls[0]?.init.method === "POST", "machine queue move method is incorrect");
assert(moveQueueCalls[0]?.body.productionTaskId === "PT-ORD-0629-003-02", "machine queue move task is incorrect");
assert(moveQueueCalls[0]?.body.targetMachineId === "BAG-02", "machine queue move target machine is incorrect");
assert(moveQueueCalls[0]?.body.targetQueueSeq === 1, "machine queue move target sequence is incorrect");
assert(moveQueueResult.productionTaskId === "PT-ORD-0629-003-02", "machine queue move did not map task id");
assert(moveQueueResult.sourceMachineId === "BAG-01", "machine queue move did not map source machine");
assert(moveQueueResult.targetMachineId === "BAG-02", "machine queue move did not map target machine");
assert(moveQueueResult.targetQueueSeq === 1, "machine queue move did not map target sequence");
assert(moveQueueResult.productionTask.machineId === "BAG-02", "machine queue move did not map moved production task");
assert(moveQueueResult.items[0]?.machineId === "BAG-02", "machine queue move did not map target queue item");
assert(moveQueueResult.productionScheduleRecords.some((record) => record.status === "moved" && record.machineId === "BAG-01"), "machine queue move did not map moved source record");
assert(moveQueueResult.productionScheduleRecords.some((record) => record.status === "active" && record.machineId === "BAG-02"), "machine queue move did not map active target record");
assert(moveQueueResult.inventoryCreated === false, "machine queue move must not create inventory");
assert(moveQueueResult.reservationCreated === false, "machine queue move must not reserve inventory");
assert(moveQueueResult.packingTaskCreated === false, "machine queue move must not create packing task");

const publishScheduleCalls = [];
const publishScheduleResult = await publishOfficeProductionSchedule(
  {
    authState,
    orderLine: { ...productionLine, status: "待排产" },
    productionTaskId: "PT-ORD-0629-003-01",
    machineId: "BAG-01",
    processType: "制袋",
    plannedQty: 1000,
    operatorId: "U-OFFICE-A",
    remark: "frontend publish schedule check",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      publishScheduleCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        productionTaskId: "PT-ORD-0629-003-01",
        orderLineId: productionLine.id,
        publishedScheduleId: "SCH-BAG-01-PT-ORD-0629-003-01",
        status: "制袋已排产",
        taskStatus: "制袋已排产",
        orderLineStatus: "制袋已排产",
        taskType: "制袋",
        machineId: "BAG-01",
        plannedQty: 1000,
        publishedAt: "2026-07-03T10:00:00.000Z",
        productionTask: {
          productionTaskId: "PT-ORD-0629-003-01",
          orderLineId: productionLine.id,
          taskType: "制袋",
          machineId: "BAG-01",
          publishedScheduleId: "SCH-BAG-01-PT-ORD-0629-003-01",
          plannedQty: 1000,
          taskStatus: "制袋已排产",
        },
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        operationLogId: "LOG-SCHEDULE-1",
      });
    },
  },
);

assert(publishScheduleResult.source === "api", "publish schedule did not use API response");
assert(publishScheduleCalls[0]?.url === "http://127.0.0.1:8787/api/production-tasks/PT-ORD-0629-003-01/publish-schedule", "publish schedule URL is incorrect");
assert(publishScheduleCalls[0]?.init.method === "POST", "publish schedule method is incorrect");
assert(publishScheduleCalls[0]?.body.orderLineId === productionLine.id, "publish schedule order line is incorrect");
assert(publishScheduleCalls[0]?.body.machineId === "BAG-01", "publish schedule machine is incorrect");
assert(publishScheduleCalls[0]?.body.plannedQty === 1000, "publish schedule planned quantity is incorrect");
assert(publishScheduleResult.publishedScheduleId === "SCH-BAG-01-PT-ORD-0629-003-01", "publish schedule did not map published schedule id");
assert(publishScheduleResult.inventoryCreated === false, "publish schedule must not create inventory");
assert(publishScheduleResult.reservationCreated === false, "publish schedule must not reserve inventory");
assert(publishScheduleResult.packingTaskCreated === false, "publish schedule must not create packing task");

const packingListCalls = [];
const packingListResult = await listOfficePackingTasks(
  {
    authState,
    query: { status: "待打包", keyword: "美的", pageSize: 3 },
    operatorId: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async (url, init) => {
      packingListCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [
          {
            packingTaskId: packingTask.packingTaskId,
            orderLineId: productionLine.id,
            packingTask: {
              packingTaskId: packingTask.packingTaskId,
              orderLineId: productionLine.id,
              plannedQty: 1000,
              actualPackedQty: 0,
              packageCount: 0,
              status: "待打包",
            },
            orderLine: {
              orderLineId: productionLine.id,
              productName: productionLine.product,
              size: productionLine.size,
              bagColor: productionLine.color,
              handleType: productionLine.handle,
              style: productionLine.style,
              originalQty: 1000,
              lineStatus: "待打包",
            },
            packages: [
              { packageId: "PKG-LIST-1", orderLineId: productionLine.id, packageSeq: 1, packageCount: 2, packedQty: 500, status: "待打印标签" },
              { packageId: "PKG-LIST-2", orderLineId: productionLine.id, packageSeq: 2, packageCount: 2, packedQty: 500, status: "待打印标签" },
            ],
            packageCount: 2,
            fulfillment: { fulfillmentId: "F-LIST-1", orderLineId: productionLine.id, method: "快递快运", status: "待打印标签" },
            inventoryDeducted: false,
          },
        ],
        page: 1,
        pageSize: 3,
        total: 1,
      });
    },
  },
);

assert(packingListResult.source === "api", "packing task list should use API response");
assert(packingListCalls[0]?.url.includes("/api/packing-tasks?"), "packing task list URL is incorrect");
assert(packingListCalls[0]?.url.includes("status=%E5%BE%85%E6%89%93%E5%8C%85"), "packing task list did not encode status filter");
assert(packingListCalls[0]?.init.headers["x-erp-user-id"] === "U-WAREHOUSE-A", "packing task list did not send operator header");
assert(packingListResult.items[0]?.packageCount === 2, "packing task list did not map package count");
assert(packingListResult.items[0]?.packingTask?.packageCount === 2, "packing task list did not sync summary package count");

const dailyProgressCalls = [];
const dailyProgressResult = await reportOfficeProductionDailyProgress(
  {
    authState,
    orderLine: productionLine,
    dailyQualifiedQty: 420,
    exceptionQty: 3,
    machineCount: 820,
    operatorId: "U-OFFICE-A",
    remark: "frontend production daily progress check",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      dailyProgressCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        productionTaskId: "PT-ORD-0629-003-01",
        reportId: "WDP-PT-ORD-0629-003-01-1",
        orderLineId: productionLine.id,
        status: "跨日继续",
        taskStatus: "跨日继续",
        plannedQty: 1000,
        progressDate: "2026-07-03",
        dailyQualifiedQty: 420,
        previousQualifiedQty: 0,
        cumulativeQualifiedQty: 420,
        remainingQty: 580,
        carryOver: true,
        nextWorkDate: "2026-07-04",
        machineCount: 820,
        machineCountAffectsInventory: false,
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        operationLogId: "LOG-WDP-1",
      });
    },
  },
);

assert(dailyProgressResult.source === "api", "production daily progress did not use API response");
assert(dailyProgressCalls[0]?.url === "http://127.0.0.1:8787/api/production-tasks/PT-ORD-0629-003-01/daily-progress", "production daily progress URL is incorrect");
assert(dailyProgressCalls[0]?.init.method === "POST", "production daily progress method is incorrect");
assert(dailyProgressCalls[0]?.body.dailyQualifiedQty === 420, "production daily progress quantity is incorrect");
assert(dailyProgressCalls[0]?.body.machineCount === 820, "production daily progress machine count is incorrect");
assert(!("inventoryItemId" in dailyProgressCalls[0].body), "production daily progress must not send inventory item");
assert(dailyProgressResult.inventoryCreated === false, "production daily progress must not create inventory");
assert(dailyProgressResult.reservationCreated === false, "production daily progress must not reserve inventory");
assert(dailyProgressResult.packingTaskCreated === false, "production daily progress must not create packing task");

const finishedPhotoUploadCalls = [];
const finishedPhotoUploadResult = await uploadOfficeProductionFinishedGoodsPhoto(
  {
    authState,
    orderLine: productionLine,
    productionTaskId: "PT-ORD-0629-003-01",
    attachmentId: "ATT-FINISHED-001",
    fileName: "finished-goods-001.jpg",
    operatorId: "U-OFFICE-A",
    remark: "frontend finished goods photo upload check",
  },
  {
    fetchImpl: async (url, init) => {
      finishedPhotoUploadCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        productionTaskId: "PT-ORD-0629-003-01",
        orderLineId: productionLine.id,
        productionTask: {
          productionTaskId: "PT-ORD-0629-003-01",
          orderLineId: productionLine.id,
          taskType: "制袋",
          machineId: "BAG-03",
          plannedQty: 1000,
          taskStatus: "制袋中",
          finishedGoodsPhoto: {
            status: "待确认",
            required: true,
            attachmentId: "ATT-FINISHED-001",
            fileName: "finished-goods-001.jpg",
            uploadedAt: "2026-07-03T09:00:00.000Z",
            uploadedBy: "U-OFFICE-A",
          },
        },
        finishedGoodsPhoto: {
          status: "待确认",
          required: true,
          attachmentId: "ATT-FINISHED-001",
          fileName: "finished-goods-001.jpg",
          uploadedAt: "2026-07-03T09:00:00.000Z",
          uploadedBy: "U-OFFICE-A",
        },
        customerNotificationTodoCreated: false,
        retakeTodoCreated: false,
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        operationLogId: "LOG-FINISHED-UPLOAD-1",
      });
    },
  },
);

assert(finishedPhotoUploadResult.source === "api", "finished-goods photo upload did not use API response");
assert(finishedPhotoUploadCalls[0]?.url === "http://127.0.0.1:8787/api/production-tasks/PT-ORD-0629-003-01/finished-goods-photo", "finished-goods photo upload URL is incorrect");
assert(finishedPhotoUploadCalls[0]?.init.method === "POST", "finished-goods photo upload method is incorrect");
assert(finishedPhotoUploadCalls[0]?.body.attachmentId === "ATT-FINISHED-001", "finished-goods photo upload attachment ID is incorrect");
assert(finishedPhotoUploadResult.finishedGoodsPhoto?.status === "待确认", "finished-goods photo upload status was not mapped");
assert(finishedPhotoUploadResult.customerNotificationTodoCreated === false, "uploading finished-goods photo must not create customer notification todo");

const finishedPhotoReviewCalls = [];
const finishedPhotoReviewResult = await reviewOfficeProductionFinishedGoodsPhoto(
  {
    authState,
    orderLine: productionLine,
    productionTaskId: "PT-ORD-0629-003-01",
    reviewStatus: "已接受",
    reason: "frontend finished goods photo review check",
    operatorId: "U-OFFICE-A",
  },
  {
    fetchImpl: async (url, init) => {
      finishedPhotoReviewCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        productionTaskId: "PT-ORD-0629-003-01",
        orderLineId: productionLine.id,
        finishedGoodsPhoto: {
          status: "已接受",
          required: true,
          attachmentId: "ATT-FINISHED-001",
          fileName: "finished-goods-001.jpg",
          uploadedAt: "2026-07-03T09:00:00.000Z",
          uploadedBy: "U-OFFICE-A",
          reviewedAt: "2026-07-03T09:05:00.000Z",
          reviewedBy: "U-OFFICE-A",
        },
        todo: {
          todoId: "T-FINISHED-NOTIFY-001",
          type: "待通知客户",
          refType: "order_line",
          refId: productionLine.id,
          handled: false,
        },
        customerNotificationTodoCreated: true,
        retakeTodoCreated: false,
        inventoryCreated: false,
        reservationCreated: false,
        packingTaskCreated: false,
        operationLogId: "LOG-FINISHED-REVIEW-1",
      });
    },
  },
);

assert(finishedPhotoReviewResult.source === "api", "finished-goods photo review did not use API response");
assert(finishedPhotoReviewCalls[0]?.url === "http://127.0.0.1:8787/api/production-tasks/PT-ORD-0629-003-01/finished-goods-photo-review", "finished-goods photo review URL is incorrect");
assert(finishedPhotoReviewCalls[0]?.init.method === "POST", "finished-goods photo review method is incorrect");
assert(finishedPhotoReviewCalls[0]?.body.reviewStatus === "已接受", "finished-goods photo review status is incorrect");
assert(finishedPhotoReviewResult.finishedGoodsPhoto?.status === "已接受", "finished-goods photo review status was not mapped");
assert(finishedPhotoReviewResult.todo?.type === "待通知客户", "finished-goods photo review todo was not mapped");
assert(finishedPhotoReviewResult.customerNotificationTodoCreated === true, "accepted finished-goods photo should create customer notification todo");
assert(finishedPhotoReviewResult.inventoryCreated === false, "finished-goods photo review must not create inventory");

const reportCalls = [];
const reportResult = await reportOfficeProductionComplete(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.production-check" },
    },
    orderLine: productionLine,
    inventoryItem: productionInventory,
    qualifiedQty: 1000,
    exceptionQty: 0,
    machineCount: 1888,
    operatorId: "U-OFFICE-A",
    remark: "frontend production check",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      reportCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        productionTaskId: "PT-ORD-0629-003-01",
        reportId: "WR-PT-ORD-0629-003-01-1",
        orderLineId: productionLine.id,
        status: "已完成",
        orderLineStatus: "待打包",
        qualifiedQty: 1000,
        machineCount: 1888,
        machineCountAffectsInventory: false,
        capacityCalibrationCreated: true,
        capacityBaselineId: "MCB-BAG-03-30-38-10-production-report-2026-07-02",
        capacityCalibration: {
          capacityBaselineId: "MCB-BAG-03-30-38-10-production-report-2026-07-02",
          machineId: "BAG-03",
          sizeKey: "30*38*10",
          dailyCapacityQty: 1000,
          sourceKind: "production_report",
          confidence: "medium",
          effectiveFrom: "2026-07-02",
        },
        inventoryItemId: productionInventory.id,
        reservationId: "RSV-PT-ORD-0629-003-01-PROD",
        packingTaskId: "PKT-ORD-0629-003-01",
        inventoryLedgerIds: ["LEDGER-IN", "LEDGER-RESERVE"],
        operationLogId: "LOG-PROD-1",
      });
    },
  },
);

assert(reportResult.source === "api", "production report did not use API response");
assert(reportCalls[0]?.url === "http://127.0.0.1:8787/api/production-tasks/PT-ORD-0629-003-01/report-complete", "production report URL is incorrect");
assert(reportCalls[0]?.init.method === "POST", "production report method is incorrect");
assert(reportCalls[0]?.init.headers.authorization === "Bearer seed-session.production-check", "production report did not send bearer auth");
assert(reportCalls[0]?.body.qualifiedQty === 1000, "production report qualified quantity is incorrect");
assert(reportCalls[0]?.body.machineCount === 1888, "production report machine count is incorrect");
assert(reportCalls[0]?.body.inventoryItemId === productionInventory.id, "production report inventory item is incorrect");
assert(reportCalls[0]?.body.createPackingTask === true, "production report should create a packing task by default");
assert(reportResult.machineCountAffectsInventory === false, "machine count must not affect inventory");
assert(reportResult.capacityCalibrationCreated === true, "production report should surface capacity calibration creation");
assert(reportResult.capacityCalibration?.dailyCapacityQty === 1000, "production report capacity calibration quantity was not mapped");
assert(reportResult.capacityCalibration?.sourceKind === "production_report", "production report capacity calibration source was not mapped");
assert(reportResult.packingTaskId === "PKT-ORD-0629-003-01", "production report response did not map packing task");

const productionDetailCalls = [];
const productionDetailResult = await getOfficeProductionTaskDetail(
  {
    authState,
    productionTaskId: reportResult.productionTaskId,
    orderLine: productionLine,
    reportResult,
    inventoryItem: productionInventory,
    operatorId: "U-OFFICE-A",
  },
  {
    fetchImpl: async (url, init) => {
      productionDetailCalls.push({ url, init });
      return createJsonResponse(200, {
        productionTaskId: reportResult.productionTaskId,
        orderLineId: productionLine.id,
        productionTask: {
          productionTaskId: reportResult.productionTaskId,
          orderLineId: productionLine.id,
          taskType: "制袋",
          machineId: "BAG-03",
          plannedQty: 1000,
          taskStatus: "已完成",
        },
        orderLine: {
          orderLineId: productionLine.id,
          productName: productionLine.product,
          size: productionLine.size,
          bagColor: productionLine.color,
          handleType: productionLine.handle,
          style: productionLine.style,
          originalQty: 1000,
          lineStatus: "待打包",
          exceptionTags: [],
        },
        reports: [
          {
            reportId: dailyProgressResult.reportId,
            productionTaskId: reportResult.productionTaskId,
            orderLineId: productionLine.id,
            qualifiedQty: 420,
            exceptionQty: 3,
            machineCount: 820,
            machineCountAffectsInventory: false,
            evidence: {
              reportKind: "daily_progress",
              cumulativeQualifiedQty: 420,
              remainingQty: 580,
            },
          },
          {
            reportId: reportResult.reportId,
            productionTaskId: reportResult.productionTaskId,
            orderLineId: productionLine.id,
            qualifiedQty: 1000,
            exceptionQty: 0,
            machineCount: 1888,
            machineCountAffectsInventory: false,
          },
        ],
        latestReport: {
          reportId: reportResult.reportId,
          productionTaskId: reportResult.productionTaskId,
          orderLineId: productionLine.id,
          qualifiedQty: 1000,
          exceptionQty: 0,
          machineCount: 1888,
          machineCountAffectsInventory: false,
        },
        dailyProgress: {
          latestReportId: dailyProgressResult.reportId,
          progressDate: "2026-07-03",
          latestDailyQualifiedQty: 420,
          cumulativeQualifiedQty: 420,
          remainingQty: 580,
          plannedQty: 1000,
          carryOver: true,
          nextWorkDate: "2026-07-04",
          machineCount: 820,
          machineCountAffectsInventory: false,
          inventoryCreated: false,
          reservationCreated: false,
          packingTaskCreated: false,
        },
        packingTask: {
          packingTaskId: reportResult.packingTaskId,
          orderLineId: productionLine.id,
          plannedQty: 1000,
          status: "待打包",
        },
        inventoryItem: productionInventory,
        reservations: [{ reservationId: reportResult.reservationId, orderLineId: productionLine.id }],
        inventoryLedgerEntries: [{ ledgerId: "LEDGER-IN" }, { ledgerId: "LEDGER-RESERVE" }],
        operationLogs: [{ operationLogId: "LOG-PROD-1", action: "complete_production_report" }],
      });
    },
  },
);

assert(productionDetailResult.source === "api", "production task detail should use API response");
assert(productionDetailCalls[0]?.url.endsWith("/api/production-tasks/PT-ORD-0629-003-01"), "production detail URL is incorrect");
assert(productionDetailCalls[0]?.init.method === "GET", "production detail method is incorrect");
assert(productionDetailResult.detail.latestReport.machineCountAffectsInventory === false, "production detail machine count must not affect inventory");
assert(productionDetailResult.detail.dailyProgress.remainingQty === 580, "production detail should map daily progress");
assert(productionDetailResult.detail.inventoryLedgerEntries.length === 2, "production detail should map inventory ledger entries");

const packingCalls = [];
const packingResult = await completeOfficePackingTask(
  {
    authState,
    packingTask,
    orderLine: productionLine,
    inventoryItem: productionInventory,
    actualPackedQty: 1000,
    packageCount: 3,
    labelsPrinted: false,
    operatorId: "U-WAREHOUSE-A",
    remark: "frontend packing check",
  },
  {
    fetchImpl: async (url, init) => {
      packingCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        packingTaskId: packingTask.packingTaskId,
        orderLineId: productionLine.id,
        status: "已完成",
        actualPackedQty: 1000,
        packageIds: ["PKG-1", "PKG-2", "PKG-3"],
        fulfillmentId: "",
        fulfillmentStatus: "待打印标签",
        orderLineStatus: "待打印标签",
        inventoryDeducted: false,
        inventoryLedgerIds: ["LEDGER-PACK"],
        operationLogId: "LOG-PACK-1",
      });
    },
  },
);

assert(packingCalls[0]?.url.endsWith("/api/packing-tasks/PKT-ORD-0629-003-01/complete"), "packing complete URL is incorrect");
assert(packingCalls[0]?.init.headers["x-erp-user-id"] === "U-WAREHOUSE-A", "packing complete did not send seed user header");
assert(packingCalls[0]?.body.actualPackedQty === 1000, "packing complete actual quantity is incorrect");
assert(packingCalls[0]?.body.packageCount === 3, "packing complete package count is incorrect");
assert(packingCalls[0]?.body.labelsPrinted === false, "packing complete label flag is incorrect");
assert(packingResult.inventoryDeducted === false, "packing complete must not deduct inventory");
assert(packingResult.orderLineStatus === "待打印标签", "packing complete response did not map order status");

const packingDetailCalls = [];
const packingDetailResult = await getOfficePackingTaskDetail(
  {
    authState,
    packingTask: { ...packingTask, status: "已完成", actualPackedQty: 1000, packageCount: 3 },
    orderLine: productionLine,
    inventoryItem: productionInventory,
    operatorId: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async (url, init) => {
      packingDetailCalls.push({ url, init });
      return createJsonResponse(200, {
        packingTaskId: packingTask.packingTaskId,
        orderLineId: productionLine.id,
        packingTask: {
          packingTaskId: packingTask.packingTaskId,
          orderLineId: productionLine.id,
          plannedQty: 1000,
          actualPackedQty: 1000,
          packageCount: 3,
          status: "已完成",
        },
        orderLine: {
          orderLineId: productionLine.id,
          productName: productionLine.product,
          size: productionLine.size,
          bagColor: productionLine.color,
          handleType: productionLine.handle,
          style: productionLine.style,
          originalQty: 1000,
          lineStatus: "待打印标签",
          exceptionTags: [],
        },
        packages: [
          { packageId: "PKG-1", packageSeq: 1, packedQty: 334 },
          { packageId: "PKG-2", packageSeq: 2, packedQty: 333 },
          { packageId: "PKG-3", packageSeq: 3, packedQty: 333 },
        ],
        fulfillment: { fulfillmentId: "", status: "待打印标签" },
        inventoryItem: productionInventory,
        inventoryLedgerEntries: [{ ledgerId: "LEDGER-PACK" }],
        operationLogs: [{ operationLogId: "LOG-PACK-1", action: "complete_packing_task" }],
        inventoryDeducted: false,
      });
    },
  },
);

assert(packingDetailResult.source === "api", "packing task detail should use API response");
assert(packingDetailCalls[0]?.url.endsWith("/api/packing-tasks/PKT-ORD-0629-003-01"), "packing detail URL is incorrect");
assert(packingDetailCalls[0]?.init.method === "GET", "packing detail method is incorrect");
assert(packingDetailResult.detail.packages.length === 3, "packing detail should map package rows");
assert(packingDetailResult.detail.inventoryDeducted === false, "packing detail must preserve no-deduction rule");

const deniedResult = await reportOfficeProductionComplete(
  {
    authState,
    orderLine: productionLine,
    inventoryItem: productionInventory,
    qualifiedQty: 1000,
    operatorId: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: production.report.complete",
        requiredPermission: "production.report.complete",
      }),
  },
);

assert(deniedResult.blocked === true, "production report permission denial should block local fallback");
assert(deniedResult.error.requiredPermission === "production.report.complete", "production permission denial was not surfaced");

const fallbackResult = await completeOfficePackingTask(
  {
    authState,
    packingTask,
    orderLine: productionLine,
    inventoryItem: productionInventory,
    actualPackedQty: 1000,
    packageCount: 3,
    operatorId: "U-WAREHOUSE-A",
  },
  {
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);

assert(fallbackResult.source === "local_fallback", "packing network failure should fall back locally");
assert(fallbackResult.packageIds.length === 3, "packing local fallback should create package IDs");

const strictWriteChecks = [
  {
    name: "schedule publication",
    expectedCode: "PRODUCTION_SCHEDULE_PUBLISH_API_UNAVAILABLE",
    invoke: () => publishOfficeProductionSchedule({ authState, orderLine: productionLine, operatorId: "U-OFFICE-A" }, strictOfflineOptions()),
  },
  {
    name: "production completion",
    expectedCode: "PRODUCTION_REPORT_API_UNAVAILABLE",
    invoke: () => reportOfficeProductionComplete({ authState, orderLine: productionLine, inventoryItem: productionInventory, qualifiedQty: 1000, operatorId: "U-WORKSHOP-A" }, strictOfflineOptions()),
  },
  {
    name: "daily production progress",
    expectedCode: "PRODUCTION_DAILY_PROGRESS_API_UNAVAILABLE",
    invoke: () => reportOfficeProductionDailyProgress({ authState, orderLine: productionLine, dailyQualifiedQty: 100, operatorId: "U-WORKSHOP-A" }, strictOfflineOptions()),
  },
  {
    name: "finished-goods photo upload",
    expectedCode: "PRODUCTION_FINISHED_GOODS_PHOTO_API_UNAVAILABLE",
    invoke: () => uploadOfficeProductionFinishedGoodsPhoto({ authState, orderLine: productionLine, attachmentId: "ATT-FINISHED-STRICT", operatorId: "U-WORKSHOP-A" }, strictOfflineOptions()),
  },
  {
    name: "finished-goods photo review",
    expectedCode: "PRODUCTION_FINISHED_GOODS_PHOTO_REVIEW_API_UNAVAILABLE",
    invoke: () => reviewOfficeProductionFinishedGoodsPhoto({ authState, orderLine: productionLine, reviewStatus: "已接受", operatorId: "U-OFFICE-A" }, strictOfflineOptions()),
  },
  {
    name: "packing completion",
    expectedCode: "PACKING_COMPLETE_API_UNAVAILABLE",
    invoke: () => completeOfficePackingTask({ authState, packingTask, orderLine: productionLine, inventoryItem: productionInventory, actualPackedQty: 1000, packageCount: 3, operatorId: "U-PACKING-A" }, strictOfflineOptions()),
  },
];

for (const check of strictWriteChecks) {
  const result = await check.invoke();
  assert(result.blocked === true, `strict ${check.name} must not use the local projection`);
  assert(result.source === "api_error", `strict ${check.name} should report an API error`);
  assert(result.error?.code === check.expectedCode, `strict ${check.name} reported the wrong API error`);
}

function strictOfflineOptions() {
  return {
    serverRequired: true,
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  };
}

const productionPackingState = {
  reportResultsByLineId: {
    [productionLine.id]: reportResult,
  },
  packingTasks: [
    {
      ...packingTask,
      orderLineId: productionLine.id,
      plannedQty: reportResult.qualifiedQty,
    },
  ],
};
const reportFocus = getProductionPackingFocusFromLedgerEntry(
  {
    ledgerId: "LEDGER-IN",
    sourceType: "production_report",
    sourceId: reportResult.reportId,
  },
  {
    orderLines: [productionLine],
    productionPacking: productionPackingState,
    buildProductionTaskId,
    buildPackingTaskId,
  },
);

assert(reportFocus?.mode === "production", "production report ledger source should focus production detail");
assert(reportFocus.taskId === reportResult.productionTaskId, "production report focus should use production task ID");
assert(reportFocus.orderLineId === productionLine.id, "production report focus should retain order line ID");

const reservationFocus = getProductionPackingFocusFromLedgerEntry(
  {
    ledgerId: "LEDGER-RESERVE",
    sourceType: "production_report_reservation",
    sourceId: reportResult.reportId,
  },
  {
    orderLines: [{ ...productionLine, status: "待打包" }],
    productionPacking: productionPackingState,
    buildProductionTaskId,
    buildPackingTaskId,
  },
);

assert(reservationFocus?.mode === "production", "production reservation ledger source should focus production detail");
assert(reservationFocus.orderLineId === productionLine.id, "production reservation focus should resolve completed report line");

const packingFocus = getProductionPackingFocusFromLedgerEntry(
  {
    ledgerId: "LEDGER-PACK",
    sourceType: "packing_complete",
    sourceId: packingTask.packingTaskId,
  },
  {
    orderLines: [productionLine],
    productionPacking: productionPackingState,
    buildProductionTaskId,
    buildPackingTaskId,
  },
);

assert(packingFocus?.mode === "packing", "packing completion ledger source should focus packing detail");
assert(packingFocus.taskId === packingTask.packingTaskId, "packing completion focus should use packing task ID");
assert(packingFocus.orderLineId === productionLine.id, "packing completion focus should retain order line ID");

console.log(
  "Frontend production/packing API client check passed: production/packing lists, schedule queue, queue resequencing, machine move, daily progress, finished-goods photo upload/review, production report, packing complete, task detail reads, source focusing, denial blocking, and local fallback are covered.",
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
