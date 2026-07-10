import assert from "node:assert/strict";
import {
  buildFindPackingTaskDetailQuery,
  buildFindPackingTaskDetailSql,
  buildFindProductionTaskDetailQuery,
  buildFindProductionTaskDetailSql,
  buildListPackingTasksQuery,
  buildListPackingTasksSql,
  buildListProductionTasksSql,
  createLocalProductionPackingReadRepository,
  createPostgresProductionPackingReadRepository,
} from "../server/productionPackingReadRepository.mjs";

checkLocalProductionPackingReadRepository();
await checkPostgresProductionPackingReadRepository();

console.log(
  "Production packing read repository check passed: local list/detail assembly and PostgreSQL list/detail SQL/normalization are covered.",
);

function checkLocalProductionPackingReadRepository() {
  const repository = createLocalProductionPackingReadRepository();
  const workspace = buildWorkspace();

  const productionDetail = repository.getProductionTaskDetail({
    workspace,
    productionTaskId: "WR-LOCAL-PROD-001",
  });
  assert.equal(productionDetail.productionTaskId, "PT-LOCAL-PROD-001");
  assert.equal(productionDetail.orderLine.productName, "美的空调");
  assert.equal(productionDetail.latestReport.reportId, "WR-LOCAL-PROD-001");
  assert.equal(productionDetail.latestReport.machineCount, 12345);
  assert.equal(productionDetail.latestReport.machineCountAffectsInventory, false);
  assert.equal(productionDetail.dailyProgress.cumulativeQualifiedQty, 45);
  assert.equal(productionDetail.dailyProgress.remainingQty, 35);
  assert.equal(productionDetail.dailyProgress.inventoryCreated, false);
  assert.equal(productionDetail.dailyProgress.packingTaskCreated, false);
  assert.equal(productionDetail.packingTask.packingTaskId, "PKT-LOCAL-PROD-001");
  assert.equal(productionDetail.inventoryItem.id, "INV-LOCAL-PROD-001");
  assert.equal(productionDetail.reservations[0].status, "active");
  assert.equal(productionDetail.inventoryLedgerEntries.length, 2);
  assert.equal(productionDetail.operationLogs[0].operationLogId, "LOG-LOCAL-PROD-001");

  const packingDetail = repository.getPackingTaskDetail({
    workspace,
    packingTaskId: "PKT-LOCAL-PROD-001",
  });
  assert.equal(packingDetail.packingTask.status, "已完成");
  assert.equal(packingDetail.packages.length, 2);
  assert.equal(packingDetail.packages[0].packageSeq, 1);
  assert.equal(packingDetail.fulfillment.method, "express");
  assert.equal(packingDetail.inventoryLedgerEntries[0].sourceType, "packing_complete");
  assert.equal(packingDetail.operationLogs[0].operationLogId, "LOG-LOCAL-PACK-001");
  assert.equal(packingDetail.inventoryDeducted, false);

  const productionList = repository.listProductionTasks({
    workspace,
    query: { status: "已完成", taskType: "制袋", keyword: "美的", pageSize: 1 },
  });
  assert.equal(productionList.total, 1);
  assert.equal(productionList.items.length, 1);
  assert.equal(productionList.items[0].productionTaskId, "PT-LOCAL-PROD-001");
  assert.equal(productionList.items[0].latestReport.machineCountAffectsInventory, false);
  assert.equal(productionList.items[0].dailyProgress.carryOver, true);
  assert.equal(productionList.items[0].dailyProgress.cumulativeQualifiedQty, 45);
  assert.equal(productionList.items[0].reservations[0].status, "active");

  const workshopVisibleList = repository.listProductionTasks({
    workspace,
    query: { visibility: "workshop_mobile", machineId: "BAG-01", status: "open", pageSize: 10 },
  });
  const workshopVisibleIds = new Set(workshopVisibleList.items.map((item) => item.productionTaskId));
  assert.equal(workshopVisibleList.total, 2);
  assert(workshopVisibleIds.has("PT-LOCAL-SCHEDULED-001"), "workshop list should include published same-machine task");
  assert(workshopVisibleIds.has("PT-LOCAL-CARRY-001"), "workshop list should include same-machine carry-over task");
  assert(!workshopVisibleIds.has("PT-LOCAL-HIDDEN-001"), "workshop list should exclude unpublished non-carry-over task");
  assert(!workshopVisibleIds.has("PT-LOCAL-OTHER-MACHINE-001"), "workshop list should exclude other machine task");
  assert.equal(
    workshopVisibleList.items.find((item) => item.productionTaskId === "PT-LOCAL-SCHEDULED-001")?.productionTask?.publishedScheduleId,
    "SCH-LOCAL-BAG-01-001",
  );

  const packingList = repository.listPackingTasks({
    workspace,
    query: { status: "已完成", keyword: "快递", pageSize: 1 },
  });
  assert.equal(packingList.total, 1);
  assert.equal(packingList.items[0].packingTaskId, "PKT-LOCAL-PROD-001");
  assert.equal(packingList.items[0].packageCount, 2);
  assert.equal(packingList.items[0].packingTask.packageCount, 2);
  assert.equal(packingList.items[0].inventoryDeducted, false);
}

async function checkPostgresProductionPackingReadRepository() {
  const productionCalls = [];
  const repository = createPostgresProductionPackingReadRepository({
    queryJson(text, values) {
      productionCalls.push({ text, values });
      return buildProductionDetailJson();
    },
  });
  const productionDetail = await repository.getProductionTaskDetail({
    productionTaskId: "PT-PG-O'Brien",
  });

  assert.equal(productionDetail.productionTaskId, "PT-PG-001");
  assert.equal(productionDetail.latestReport.machineCount, 8888);
  assert.equal(productionDetail.dailyProgress.cumulativeQualifiedQty, 45);
  assert.equal(productionDetail.dailyProgress.remainingQty, 35);
  assert.equal(productionDetail.inventoryLedgerEntries.length, 2);
  assert.equal(productionDetail.inventoryLedgerEntries[0].operatorName, "办公室A");
  assert.equal(productionDetail.reservations[0].status, "active");
  assert.match(productionCalls[0].text, /WITH direct_production_task/);
  assert.match(productionCalls[0].text, /workshop_reports/);
  assert.match(productionCalls[0].text, /source_type IN \('production_report', 'production_report_reservation'\)/);
  assert.match(productionCalls[0].text, /inventory_reservations/);
  assert.match(productionCalls[0].text, /operation_logs/);
  assert.ok(!productionCalls[0].text.includes("PT-PG-O'Brien"));
  assert.deepEqual(productionCalls[0].values, ["PT-PG-O'Brien"]);

  const packingCalls = [];
  const packingRepository = createPostgresProductionPackingReadRepository({
    queryJson(text, values) {
      packingCalls.push({ text, values });
      return buildPackingDetailJson();
    },
  });
  const packingDetail = await packingRepository.getPackingTaskDetail({
    packingTaskId: "PKT-PG-001",
  });

  assert.equal(packingDetail.packingTask.actualPackedQty, 80);
  assert.equal(packingDetail.packages.length, 2);
  assert.equal(packingDetail.packages[1].packedQty, 40);
  assert.equal(packingDetail.fulfillment.status, "待打印标签");
  assert.equal(packingDetail.inventoryDeducted, false);
  assert.match(packingCalls[0].text, /WITH selected_packing_task/);
  assert.match(packingCalls[0].text, /FROM packages AS pkg/);
  assert.match(packingCalls[0].text, /source_type = 'packing_complete'/);
  assert.match(packingCalls[0].text, /fulfillment_records/);
  assert.match(packingCalls[0].text, /operation_logs/);
  assert.deepEqual(packingCalls[0].values, ["PKT-PG-001"]);

  assert.throws(() => buildFindProductionTaskDetailSql({ productionTaskId: "" }), /productionTaskId is required/);
  assert.throws(() => buildFindPackingTaskDetailSql({ packingTaskId: "" }), /packingTaskId is required/);

  const productionListCalls = [];
  const productionListRepository = createPostgresProductionPackingReadRepository({
    queryJson(text, values) {
      productionListCalls.push({ text, values });
      return {
        items: [buildProductionDetailJson()],
        page: 1,
        pageSize: 2,
        total: 1,
      };
    },
  });
  const productionList = await productionListRepository.listProductionTasks({
    query: { status: "open", taskType: "制袋", keyword: "O'Brien", pageSize: 2 },
  });
  assert.equal(productionList.items[0].productionTaskId, "PT-PG-001");
  assert.equal(productionList.items[0].latestReport.machineCountAffectsInventory, false);
  assert.equal(productionList.items[0].dailyProgress.carryOver, true);
  assert.match(productionListCalls[0].text, /WITH filtered_production_tasks/);
  assert.match(productionListCalls[0].text, /task\.task_status <> '已完成'/);
  assert.match(productionListCalls[0].text, /task\.task_type = \$1::text/);
  assert.ok(!productionListCalls[0].text.includes("O'Brien"));
  assert.match(productionListCalls[0].text, /LIMIT \$3::integer/);
  assert.deepEqual(productionListCalls[0].values, ["制袋", "%O'Brien%", 2, 0, 1, 2]);
  const workshopMobileSql = buildListProductionTasksSql({
    query: { visibility: "workshop_mobile", machineId: "BAG-01", status: "open", pageSize: 5 },
  });
  assert.match(workshopMobileSql, /task\.machine_id = \$1::text/);
  assert.match(workshopMobileSql, /NULLIF\(task\.published_schedule_id, ''\) IS NOT NULL/);
  assert.match(workshopMobileSql, /workshop_reports AS report/);
  assert.match(workshopMobileSql, /carryOver/);
  assert.match(workshopMobileSql, /publishedScheduleId/);
  assert.match(buildListProductionTasksSql({ query: { status: "已完成" } }), /task\.task_status = '已完成'/);

  const packingListCalls = [];
  const packingListRepository = createPostgresProductionPackingReadRepository({
    queryJson(text, values) {
      packingListCalls.push({ text, values });
      return {
        items: [buildPackingDetailJson()],
        page: 1,
        pageSize: 2,
        total: 1,
      };
    },
  });
  const packingList = await packingListRepository.listPackingTasks({
    query: { status: "待打包", keyword: "白鲸", pageSize: 2 },
  });
  assert.equal(packingList.items[0].packingTaskId, "PKT-PG-001");
  assert.equal(packingList.items[0].packageCount, 2);
  assert.equal(packingList.items[0].packingTask.packageCount, 2);
  assert.match(packingListCalls[0].text, /WITH filtered_packing_tasks/);
  assert.match(packingListCalls[0].text, /task\.status = \$1::text/);
  assert.match(packingListCalls[0].text, /FROM packages AS pkg/);
  assert.match(buildListPackingTasksSql({ query: { status: "completed" } }), /task\.status = '已完成'/);
  assert.deepEqual(buildListPackingTasksQuery({ query: { status: "待打包", keyword: "白鲸", pageSize: 2 } }).values, [
    "待打包",
    "%白鲸%",
    2,
    0,
    1,
    2,
  ]);
  assert.deepEqual(buildFindProductionTaskDetailQuery({ productionTaskId: "PT-PG-O'Brien" }).values, ["PT-PG-O'Brien"]);
  assert.deepEqual(buildFindPackingTaskDetailQuery({ packingTaskId: "PKT-PG-001" }).values, ["PKT-PG-001"]);
}

function buildWorkspace() {
  return {
    users: [
      { id: "U-OFFICE-A", displayName: "办公室A" },
      { id: "U-MANAGER-A", displayName: "经理A" },
    ],
    orderLines: [
      {
        id: "OL-LOCAL-PROD-001",
        orderId: "ORD-LOCAL-PROD-001",
        customerId: "C001",
        productName: "美的空调",
        size: "30*38*10",
        bagColor: "白色",
        handleType: "普通提",
        style: "空白袋",
        originalQty: 80,
        lineStatus: "待打印标签",
        fulfillmentMethod: "快递快运",
        exceptionTags: [],
      },
      {
        id: "OL-LOCAL-SCHEDULED-001",
        orderId: "ORD-LOCAL-SCHEDULED-001",
        customerId: "C002",
        productName: "白鲸袋",
        size: "35*27*10",
        bagColor: "白色",
        handleType: "普通提",
        style: "定制印刷",
        originalQty: 1500,
        lineStatus: "制袋中",
        fulfillmentMethod: "快递快运",
        exceptionTags: [],
      },
      {
        id: "OL-LOCAL-CARRY-001",
        orderId: "ORD-LOCAL-CARRY-001",
        customerId: "C003",
        productName: "跨日袋",
        size: "30*38*10",
        bagColor: "黄色",
        handleType: "普通提",
        style: "定制印刷",
        originalQty: 1000,
        lineStatus: "跨日继续",
        fulfillmentMethod: "送货",
        exceptionTags: [],
      },
      {
        id: "OL-LOCAL-HIDDEN-001",
        orderId: "ORD-LOCAL-HIDDEN-001",
        customerId: "C004",
        productName: "未发布袋",
        size: "30*38*10",
        bagColor: "黑色",
        handleType: "普通提",
        style: "空白袋",
        originalQty: 600,
        lineStatus: "制袋中",
        fulfillmentMethod: "自提",
        exceptionTags: [],
      },
      {
        id: "OL-LOCAL-OTHER-MACHINE-001",
        orderId: "ORD-LOCAL-OTHER-MACHINE-001",
        customerId: "C005",
        productName: "二号机袋",
        size: "30*38*10",
        bagColor: "红色",
        handleType: "普通提",
        style: "空白袋",
        originalQty: 700,
        lineStatus: "制袋中",
        fulfillmentMethod: "自提",
        exceptionTags: [],
      },
    ],
    productionTasks: [
      {
        productionTaskId: "PT-LOCAL-PROD-001",
        id: "PT-LOCAL-PROD-001",
        bizNo: "PT-LOCAL-PROD-001",
        orderLineId: "OL-LOCAL-PROD-001",
        taskType: "制袋",
        machineId: "BAG-01",
        publishedScheduleId: "SCH-LOCAL-DONE-001",
        plannedQty: 80,
        taskStatus: "已完成",
        createdBy: "U-OFFICE-A",
        createdAt: "2026-07-02T09:00:00.000Z",
      },
      {
        productionTaskId: "PT-LOCAL-SCHEDULED-001",
        id: "PT-LOCAL-SCHEDULED-001",
        bizNo: "PT-LOCAL-SCHEDULED-001",
        orderLineId: "OL-LOCAL-SCHEDULED-001",
        taskType: "制袋",
        machineId: "BAG-01",
        publishedScheduleId: "SCH-LOCAL-BAG-01-001",
        plannedQty: 1500,
        taskStatus: "制袋中",
        createdBy: "U-OFFICE-A",
        createdAt: "2026-07-02T10:00:00.000Z",
      },
      {
        productionTaskId: "PT-LOCAL-CARRY-001",
        id: "PT-LOCAL-CARRY-001",
        bizNo: "PT-LOCAL-CARRY-001",
        orderLineId: "OL-LOCAL-CARRY-001",
        taskType: "制袋",
        machineId: "BAG-01",
        publishedScheduleId: "",
        plannedQty: 1000,
        taskStatus: "跨日继续",
        createdBy: "U-OFFICE-A",
        createdAt: "2026-07-02T11:00:00.000Z",
      },
      {
        productionTaskId: "PT-LOCAL-HIDDEN-001",
        id: "PT-LOCAL-HIDDEN-001",
        bizNo: "PT-LOCAL-HIDDEN-001",
        orderLineId: "OL-LOCAL-HIDDEN-001",
        taskType: "制袋",
        machineId: "BAG-01",
        publishedScheduleId: "",
        plannedQty: 600,
        taskStatus: "制袋中",
        createdBy: "U-OFFICE-A",
        createdAt: "2026-07-02T12:00:00.000Z",
      },
      {
        productionTaskId: "PT-LOCAL-OTHER-MACHINE-001",
        id: "PT-LOCAL-OTHER-MACHINE-001",
        bizNo: "PT-LOCAL-OTHER-MACHINE-001",
        orderLineId: "OL-LOCAL-OTHER-MACHINE-001",
        taskType: "制袋",
        machineId: "BAG-02",
        publishedScheduleId: "SCH-LOCAL-BAG-02-001",
        plannedQty: 700,
        taskStatus: "制袋中",
        createdBy: "U-OFFICE-A",
        createdAt: "2026-07-02T13:00:00.000Z",
      },
    ],
    workshopReports: [
      {
        reportId: "WDP-LOCAL-PROD-001",
        productionTaskId: "PT-LOCAL-PROD-001",
        orderLineId: "OL-LOCAL-PROD-001",
        processType: "制袋",
        machineId: "BAG-01",
        operatorId: "U-OFFICE-A",
        qualifiedQty: 45,
        exceptionQty: 0,
        machineCount: 7777,
        completedAt: "2026-07-01T18:00:00.000Z",
        createdAt: "2026-07-01T18:00:00.000Z",
        evidence: {
          reportKind: "daily_progress",
          progressDate: "2026-07-01",
          dailyQualifiedQty: 45,
          cumulativeQualifiedQty: 45,
          remainingQty: 35,
          carryOver: true,
          nextWorkDate: "2026-07-02",
          inventoryCreated: false,
          reservationCreated: false,
          packingTaskCreated: false,
        },
      },
      {
        reportId: "WR-LOCAL-PROD-001",
        productionTaskId: "PT-LOCAL-PROD-001",
        orderLineId: "OL-LOCAL-PROD-001",
        processType: "制袋",
        machineId: "BAG-01",
        operatorId: "U-OFFICE-A",
        qualifiedQty: 80,
        exceptionQty: 0,
        machineCount: 12345,
        completedAt: "2026-07-02T12:00:00.000Z",
        createdAt: "2026-07-02T12:00:00.000Z",
      },
      {
        reportId: "WDP-LOCAL-CARRY-001",
        productionTaskId: "PT-LOCAL-CARRY-001",
        orderLineId: "OL-LOCAL-CARRY-001",
        processType: "制袋",
        machineId: "BAG-01",
        operatorId: "U-OFFICE-A",
        qualifiedQty: 420,
        exceptionQty: 0,
        machineCount: 8888,
        completedAt: "2026-07-02T18:00:00.000Z",
        createdAt: "2026-07-02T18:00:00.000Z",
        evidence: {
          reportKind: "daily_progress",
          progressDate: "2026-07-02",
          dailyQualifiedQty: 420,
          cumulativeQualifiedQty: 420,
          remainingQty: 580,
          carryOver: true,
          nextWorkDate: "2026-07-03",
          inventoryCreated: false,
          reservationCreated: false,
          packingTaskCreated: false,
        },
      },
    ],
    packingTasks: [
      {
        packingTaskId: "PKT-LOCAL-PROD-001",
        id: "PKT-LOCAL-PROD-001",
        bizNo: "PKT-LOCAL-PROD-001",
        orderLineId: "OL-LOCAL-PROD-001",
        plannedQty: 80,
        actualPackedQty: 80,
        status: "已完成",
        createdAt: "2026-07-02T12:10:00.000Z",
      },
    ],
    packages: [
      buildPackage({ packageId: "PKG-LOCAL-PROD-001-2", packageSeq: 2 }),
      buildPackage({ packageId: "PKG-LOCAL-PROD-001-1", packageSeq: 1 }),
    ],
    fulfillments: [
      {
        id: "F-LOCAL-PROD-001",
        lineId: "OL-LOCAL-PROD-001",
        method: "快递快运",
        status: "待打印标签",
        qty: 80,
      },
    ],
    inventories: [
      {
        id: "INV-LOCAL-PROD-001",
        inventoryKey: "30*38*10|白色|普通提|空白袋|快运区|待提货锁定",
        size: "30*38*10",
        color: "白色",
        handle: "普通提",
        style: "空白袋",
        zone: "快运区",
        state: "待提货锁定",
        inStock: 100,
        reserved: 80,
      },
    ],
    inventoryReservations: [
      {
        reservationId: "RSV-LOCAL-PROD-001",
        orderLineId: "OL-LOCAL-PROD-001",
        inventoryItemId: "INV-LOCAL-PROD-001",
        reservedQty: 80,
        status: "生效",
      },
    ],
    inventoryLedgers: [
      buildLedger({ ledgerId: "LEDGER-LOCAL-PROD-RSV-001", changeType: "生产完成占用", sourceType: "production_report_reservation" }),
      buildLedger({ ledgerId: "LEDGER-LOCAL-PROD-IN-001", changeType: "生产入库", sourceType: "production_report" }),
      buildLedger({ ledgerId: "LEDGER-LOCAL-PROD-PACK-001", changeType: "打包完成确认", sourceType: "packing_complete", sourceId: "PKT-LOCAL-PROD-001" }),
    ],
    operationLogs: [
      {
        id: "LOG-LOCAL-PROD-001",
        targetType: "production_task",
        targetId: "PT-LOCAL-PROD-001",
        action: "complete_production_report",
        operatorId: "U-OFFICE-A",
        createdAt: "2026-07-02T12:00:00.000Z",
      },
      {
        id: "LOG-LOCAL-PACK-001",
        targetType: "packing_task",
        targetId: "PKT-LOCAL-PROD-001",
        action: "complete_packing_task",
        operatorId: "U-OFFICE-A",
        createdAt: "2026-07-02T12:20:00.000Z",
      },
    ],
  };
}

function buildProductionDetailJson() {
  return {
    productionTaskId: "PT-PG-001",
    orderLineId: "OL-PG-001",
    productionTask: {
      productionTaskId: "PT-PG-001",
      orderLineId: "OL-PG-001",
      taskType: "制袋",
      machineId: "BAG-PG-01",
      plannedQty: 80,
      taskStatus: "已完成",
      createdAt: "2026-07-02T10:00:00.000Z",
    },
    orderLine: {
      orderLineId: "OL-PG-001",
      orderId: "ORD-PG-001",
      productName: "白鲸袋",
      size: "30*38*10",
      bagColor: "白色",
      handleType: "普通提",
      style: "空白袋",
      originalQty: 80,
      lineStatus: "待打包",
    },
    reports: [
      {
        reportId: "WDP-PG-001",
        productionTaskId: "PT-PG-001",
        orderLineId: "OL-PG-001",
        qualifiedQty: 45,
        exceptionQty: 0,
        machineCount: 7777,
        completedAt: "2026-07-01T18:00:00.000Z",
        evidence: {
          reportKind: "daily_progress",
          progressDate: "2026-07-01",
          dailyQualifiedQty: 45,
          cumulativeQualifiedQty: 45,
          remainingQty: 35,
          carryOver: true,
          nextWorkDate: "2026-07-02",
        },
      },
      {
        reportId: "WR-PG-001",
        productionTaskId: "PT-PG-001",
        orderLineId: "OL-PG-001",
        qualifiedQty: 80,
        exceptionQty: 0,
        machineCount: 8888,
        completedAt: "2026-07-02T12:00:00.000Z",
      },
    ],
    latestReport: {
      reportId: "WR-PG-001",
      productionTaskId: "PT-PG-001",
      orderLineId: "OL-PG-001",
      qualifiedQty: 80,
      exceptionQty: 0,
      machineCount: 8888,
      completedAt: "2026-07-02T12:00:00.000Z",
    },
    packingTask: {
      packingTaskId: "PKT-PG-001",
      orderLineId: "OL-PG-001",
      plannedQty: 80,
      actualPackedQty: 0,
      status: "待打包",
    },
    inventoryItem: {
      id: "INV-PG-001",
      inventoryKey: "30*38*10|白色|普通提|空白袋|快运区|待提货锁定",
      size: "30*38*10",
      color: "白色",
      handleType: "普通提",
      style: "空白袋",
      zone: "快运区",
      state: "待提货锁定",
      inStock: 100,
      reserved: 80,
    },
    reservations: [
      {
        reservationId: "RSV-PG-001",
        orderLineId: "OL-PG-001",
        inventoryItemId: "INV-PG-001",
        qty: 80,
        status: "生效",
      },
    ],
    inventoryLedgerEntries: [
      buildLedgerJson({ ledgerId: "LEDGER-PG-IN-001", sourceType: "production_report" }),
      buildLedgerJson({ ledgerId: "LEDGER-PG-RSV-001", sourceType: "production_report_reservation", changeType: "生产完成占用" }),
    ],
    operationLogs: [
      {
        operationLogId: "LOG-PG-PROD-001",
        targetType: "production_task",
        targetId: "PT-PG-001",
        action: "complete_production_report",
        createdAt: "2026-07-02T12:00:00.000Z",
      },
    ],
  };
}

function buildPackingDetailJson() {
  return {
    packingTaskId: "PKT-PG-001",
    orderLineId: "OL-PG-001",
    packingTask: {
      packingTaskId: "PKT-PG-001",
      orderLineId: "OL-PG-001",
      plannedQty: 80,
      actualPackedQty: 80,
      status: "已完成",
    },
    orderLine: {
      orderLineId: "OL-PG-001",
      orderId: "ORD-PG-001",
      productName: "白鲸袋",
      size: "30*38*10",
      bagColor: "白色",
      handleType: "普通提",
      style: "空白袋",
      originalQty: 80,
    },
    packages: [
      buildPackageJson({ packageId: "PKG-PG-001-1", packageSeq: 1 }),
      buildPackageJson({ packageId: "PKG-PG-001-2", packageSeq: 2 }),
    ],
    fulfillment: {
      fulfillmentId: "F-PG-001",
      orderLineId: "OL-PG-001",
      method: "快递快运",
      status: "待打印标签",
      expectedQty: 80,
      actualQty: 80,
    },
    inventoryItem: {
      id: "INV-PG-001",
      inventoryKey: "30*38*10|白色|普通提|空白袋|快运区|待提货锁定",
      size: "30*38*10",
      color: "白色",
      handleType: "普通提",
      style: "空白袋",
      zone: "快运区",
      state: "待提货锁定",
      inStock: 100,
      reserved: 80,
    },
    inventoryLedgerEntries: [buildLedgerJson({ ledgerId: "LEDGER-PG-PACK-001", sourceType: "packing_complete", sourceId: "PKT-PG-001" })],
    operationLogs: [
      {
        operationLogId: "LOG-PG-PACK-001",
        targetType: "packing_task",
        targetId: "PKT-PG-001",
        action: "complete_packing_task",
        createdAt: "2026-07-02T12:20:00.000Z",
      },
    ],
    inventoryDeducted: false,
  };
}

function buildPackage(overrides = {}) {
  return {
    packageId: "PKG-LOCAL-PROD-001-1",
    orderLineId: "OL-LOCAL-PROD-001",
    fulfillmentId: "F-LOCAL-PROD-001",
    packageSeq: 1,
    packageCount: 2,
    packedQty: 40,
    status: "待打印标签",
    createdAt: "2026-07-02T12:20:00.000Z",
    ...overrides,
  };
}

function buildLedger(overrides = {}) {
  return {
    ledgerId: "LEDGER-LOCAL-PROD-IN-001",
    inventoryItemId: "INV-LOCAL-PROD-001",
    changeType: "生产入库",
    qtyBefore: 20,
    qtyChange: 80,
    qtyAfter: 100,
    sourceType: "production_report",
    sourceId: "WR-LOCAL-PROD-001",
    operatorId: "U-OFFICE-A",
    confirmedBy: "U-MANAGER-A",
    occurredAt: "2026-07-02T12:00:00.000Z",
    createdAt: "2026-07-02T12:00:00.000Z",
    ...overrides,
  };
}

function buildPackageJson(overrides = {}) {
  return {
    packageId: "PKG-PG-001-1",
    orderLineId: "OL-PG-001",
    fulfillmentId: "F-PG-001",
    packageSeq: 1,
    packageCount: 2,
    packedQty: 40,
    status: "待打印标签",
    ...overrides,
  };
}

function buildLedgerJson(overrides = {}) {
  return {
    ledgerId: "LEDGER-PG-IN-001",
    inventoryItemId: "INV-PG-001",
    inventoryKey: "30*38*10|白色|普通提|空白袋|快运区|待提货锁定",
    size: "30*38*10",
    colorName: "白色",
    handleType: "普通提",
    style: "空白袋",
    zone: "快运区",
    inventoryState: "待提货锁定",
    changeType: "生产入库",
    qtyBefore: 20,
    qtyChange: 80,
    qtyAfter: 100,
    sourceType: "production_report",
    sourceId: "WR-PG-001",
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    confirmedBy: "U-MANAGER-A",
    confirmedByName: "经理A",
    occurredAt: "2026-07-02T12:00:00.000Z",
    createdAt: "2026-07-02T12:00:00.000Z",
    ...overrides,
  };
}
