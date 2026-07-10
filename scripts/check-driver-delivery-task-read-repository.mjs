import assert from "node:assert/strict";
import {
  buildFindDriverDeliveryTaskQuery,
  buildFindDriverDeliveryTaskSql,
  buildListDriverDeliveryTasksQuery,
  buildListDriverDeliveryTasksSql,
  createLocalDriverDeliveryTaskReadRepository,
  createPostgresDriverDeliveryTaskReadRepository,
  normalizeDriverDeliveryTask,
  normalizeDriverDeliveryTaskListResponse,
} from "../server/driverDeliveryTaskReadRepository.mjs";

const workspace = {
  customers: [
    {
      id: "C001",
      name: "张三服饰",
      contact: "张三",
      phone: "17700001111",
      address: "虎门仓库A区",
    },
    {
      id: "C002",
      name: "美的空调网店",
      contact: "店铺客服",
      phone: "17700002222",
      address: "广州番禺客户仓",
    },
  ],
  orderLines: [
    {
      id: "ORD-0629-010-01",
      orderNo: "ORD-0629-010",
      lineNo: "01",
      customerId: "C001",
      product: "活动袋",
      orderType: "定制印刷",
      size: "35*27",
      color: "白色",
      handle: "普通提",
      style: "空白袋",
      print: "是",
      printColor: "黑色",
      printSide: "双面",
      handleColor: "黑色",
      qty: 1500,
      latest: "今天 19:00",
      note: "加长提",
      exceptions: [],
    },
    {
      id: "ORD-0629-023-01",
      orderNo: "ORD-0629-023",
      lineNo: "01",
      customerId: "C002",
      product: "空白袋",
      orderType: "现货",
      size: "35*41",
      color: "白色",
      handle: "普通提",
      style: "空白袋",
      print: "否",
      qty: 600,
      latest: "明天",
      exceptions: ["等拉走确认"],
    },
  ],
  fulfillments: [
    {
      id: "F010",
      lineId: "ORD-0629-010-01",
      customerId: "C001",
      method: "送货",
      status: "待出库",
      qty: 1500,
      packages: "3包",
      latest: "今天 19:00",
      zone: "A区",
      source: "已备货",
      watermarkedPhotoAttached: true,
      watermarkedPhotoAttachmentId: "ATT-WATER-010",
      signaturePhotoAttached: true,
      signaturePhotoAttachmentId: "ATT-SIGN-010",
      deliveryEvidenceReviewStatus: "需重拍",
      deliveryEvidenceIssueReason: "水印不清晰",
      loadedAt: "2026-07-02T09:10:00.000Z",
      loadedBy: "U-DRIVER-A",
      driverRemark: "装车核对：3/3包",
      receiverName: "门店仓管",
      paperNoteStatus: "已交回",
      deviceFieldTestRecord: {
        recordId: "DQA-F010-LOCAL",
        fulfillmentId: "F010",
        checkedAt: "2026-07-02T09:35:00.000Z",
        summary: { label: "通过 2/6，异常 1", passedCount: 2, issueCount: 1 },
        checks: [{ key: "camera_permission", status: "passed" }],
      },
      deviceFieldTestSummary: { label: "通过 2/6，异常 1", passedCount: 2, issueCount: 1 },
    },
    {
      id: "F023",
      lineId: "ORD-0629-023-01",
      customerId: "C002",
      method: "送货",
      status: "配送中",
      qty: 600,
      packages: "2包",
      latest: "明天",
    },
    {
      id: "F099",
      lineId: "ORD-0629-023-01",
      customerId: "C002",
      method: "自提",
      status: "待出库",
      qty: 20,
    },
  ],
  printRecords: [
    {
      printRecordId: "PR-F010-1",
      targetId: "F010",
      batchNo: "DN-F010",
      status: "printed",
      printedAt: "2026-07-02T09:00:00.000Z",
    },
  ],
  driverDeliveryDispatches: [
    {
      id: "DDIS-F010",
      fulfillmentId: "F010",
      driverId: "U-DRIVER-A",
      routeDate: "2026-07-02",
      routeNo: "虎门线-A",
      stopSequence: 1,
      dispatchStatus: "已派单",
      plannedDepartureAt: "2026-07-02T08:30:00.000Z",
      assignedAt: "2026-07-02T08:00:00.000Z",
    },
    {
      id: "DDIS-F023-CANCELED",
      fulfillmentId: "F023",
      driverId: "U-DRIVER-A",
      routeDate: "2026-07-02",
      routeNo: "虎门线-A",
      stopSequence: 0,
      dispatchStatus: "已取消",
      assignedAt: "2026-07-02T08:10:00.000Z",
    },
  ],
  packages: [
    {
      packageId: "PKG-F010-1",
      bizNo: "PKG-F010-1",
      orderLineId: "ORD-0629-010-01",
      fulfillmentId: "F010",
      packageSeq: 1,
      packageCount: 3,
      packedQty: 500,
      labelPrintRecordId: "PR-F010-1",
      status: "已打印",
    },
    {
      packageId: "PKG-F010-2",
      bizNo: "PKG-F010-2",
      orderLineId: "ORD-0629-010-01",
      fulfillmentId: "F010",
      packageSeq: 2,
      packageCount: 3,
      packedQty: 500,
      labelPrintRecordId: "PR-F010-1",
      status: "已打印",
    },
    {
      packageId: "PKG-F010-3",
      bizNo: "PKG-F010-3",
      orderLineId: "ORD-0629-010-01",
      fulfillmentId: "F010",
      packageSeq: 3,
      packageCount: 3,
      packedQty: 500,
      labelPrintRecordId: "PR-F010-1",
      status: "已打印",
    },
    {
      packageId: "PKG-OTHER-FULFILLMENT",
      bizNo: "PKG-OTHER-FULFILLMENT",
      orderLineId: "ORD-0629-010-01",
      fulfillmentId: "F011",
      packageSeq: 1,
      packageCount: 1,
      packedQty: 999,
      status: "待打印标签",
    },
  ],
};

const localRepository = createLocalDriverDeliveryTaskReadRepository();
const localList = localRepository.listDriverDeliveryTasks({
  workspace,
  query: { driverId: "U-DRIVER-A", page: 1, pageSize: 20 },
  operatorId: "U-DRIVER-A",
});

assert.equal(localRepository.kind, "local_memory");
assert.equal(localList.total, 2);
assert.equal(localList.metrics.pendingCount, 1);
assert.equal(localList.metrics.deliveringCount, 1);
assert.equal(localList.items[0].fulfillmentId, "F010", "route sequence should sort ahead of the generic status rank");
assert.equal(localList.items[0].driverId, "U-DRIVER-A");
assert.equal(localList.items[0].routeDate, "2026-07-02");
assert.equal(localList.items[0].routeNo, "虎门线-A");
assert.equal(localList.items[0].routeSequence, 1);
assert.equal(localList.items[0].goodsSummary, "活动袋 35*27 白印黑 / 白袋黑提 双面 1500个 加长提");
assert.equal(localList.items[0].deliveryNoteNo, "DN-F010");
assert.equal(localList.items[0].packageChecklist.length, 3);
assert.equal(localList.items[0].packageChecklist[0].packageId, "PKG-F010-1");
assert.equal(localList.items[0].packageChecklist[0].labelText, "第 1/3 包");
assert.equal(localList.items[0].packageChecklist[0].quantityText, "500个");
assert.equal(localList.items[0].packageChecklist[0].labelPrintRecordId, "PR-F010-1");
assert.equal(
  localList.items[0].packageChecklist.some((item) => item.packageId === "PKG-OTHER-FULFILLMENT"),
  false,
  "driver package checklist must not include packages from another fulfillment on the same order line",
);
assert.equal(localList.items[0].watermarkedPhotoAttachmentId, "ATT-WATER-010");
assert.equal(localList.items[0].deliveryEvidenceReviewStatus, "需重拍");
assert.equal(localList.items[0].loadedAt, "2026-07-02T09:10:00.000Z");
assert.equal(localList.items[0].loadedBy, "U-DRIVER-A");
assert.equal(localList.items[0].driverRemark, "装车核对：3/3包");
assert.equal(localList.items[0].receiverName, "门店仓管");
assert.equal(localList.items[0].paperNoteStatus, "已交回");
assert.equal(localList.items[0].deviceFieldTestRecord.recordId, "DQA-F010-LOCAL");
assert.equal(localList.items[0].deviceFieldTestSummary.label, "通过 2/6，异常 1");
assert.equal(localList.items[1].status, "配送中");

const filteredLocalList = localRepository.listDriverDeliveryTasks({
  workspace,
  query: { status: "配送中" },
  operatorId: "U-DRIVER-A",
});
assert.equal(filteredLocalList.total, 1);
assert.equal(filteredLocalList.metrics.pendingCount, 1, "metrics should describe all driver tasks, not only the active tab");

const localDetail = localRepository.getDriverDeliveryTask({
  workspace,
  fulfillmentId: "F010",
  operatorId: "U-DRIVER-A",
});
assert.equal(localDetail.orderTail, "#010-01");
assert.equal(localDetail.packageCount, 3);
assert.equal(localDetail.packageChecklist[2].packageId, "PKG-F010-3");

const normalized = normalizeDriverDeliveryTask({
  fulfillmentId: "F-PG-001",
  driverId: "U-DRIVER-A",
  orderLineId: "OL-PG-001",
  customerName: "白鲸自营店",
  address: "深圳南山仓",
  productName: "外卖活动袋",
  orderType: "定制印刷",
  size: "40*30",
  bagColor: "黄色",
  printFlag: true,
  printColor: "黑色",
  printSide: "双面",
  handleColor: "红色",
  qty: 3000,
  packageCount: 4,
  status: "已交付",
  routeDate: "2026-07-02",
  routeNo: "南山线-B",
  routeSequence: 3,
  dispatchStatus: "已派单",
  plannedDepartureAt: "2026-07-02T09:00:00.000Z",
  exceptionReasonCode: "customer_unavailable",
  exceptionReason: "客户不在",
  exceptionOccurredAt: "2026-07-02T09:40:00.000Z",
  packageChecklist: [
    {
      packageId: "PKG-PG-1",
      bizNo: "PKG-PG-1",
      packageSeq: 1,
      packageCount: 4,
      packedQty: 750,
      status: "已打印",
    },
  ],
  loadedAt: "2026-07-02T09:20:00.000Z",
  loadedBy: "U-DRIVER-A",
  driverRemark: "PG 装车核对：4/4包",
  receiverName: "仓库签收人",
  paperNoteStatus: "未交回",
  deliveryEvidenceReviewedByUserId: "U-OFFICE-A",
  deliveryEvidenceIssueReason: "O'Brien 水印不清晰",
  deviceFieldTestRecord: {
    recordId: "DQA-F-PG-001",
    fulfillmentId: "F-PG-001",
    checkedAt: "2026-07-02T10:00:00.000Z",
    summary: { label: "通过 3/6，异常 0", passedCount: 3, issueCount: 0 },
    checks: [{ key: "watermark_photo", status: "passed" }],
    nativeBridgeDiagnostics: { label: "原生 0/2", total: 2, supportedCount: 0, issueCount: 2 },
  },
  deviceFieldTestSummary: { label: "通过 3/6，异常 0", passedCount: 3, issueCount: 0 },
});
assert.equal(normalized.status, "已完成");
assert.equal(normalized.goodsSummary, "外卖活动袋 40*30 黄印黑 / 黄袋红提 双面 3000个");
assert.equal(normalized.deliveryEvidenceReviewedByUserId, "U-OFFICE-A");
assert.equal(normalized.deliveryEvidenceIssueReason, "O'Brien 水印不清晰");
assert.equal(normalized.loadedAt, "2026-07-02T09:20:00.000Z");
assert.equal(normalized.loadedBy, "U-DRIVER-A");
assert.equal(normalized.driverRemark, "PG 装车核对：4/4包");
assert.equal(normalized.exceptionReasonCode, "customer_unavailable");
assert.equal(normalized.exceptionReason, "客户不在");
assert.equal(normalized.exceptionOccurredAt, "2026-07-02T09:40:00.000Z");
assert.equal(normalized.receiverName, "仓库签收人");
assert.equal(normalized.paperNoteStatus, "未交回");
assert.equal(normalized.deviceFieldTestRecord.recordId, "DQA-F-PG-001");
assert.equal(normalized.deviceFieldTestRecord.nativeBridgeDiagnostics.label, "原生 0/2");
assert.equal(normalized.deviceFieldTestSummary.label, "通过 3/6，异常 0");
assert.equal(normalized.routeNo, "南山线-B");
assert.equal(normalized.routeSequence, 3);
assert.equal(normalized.packageChecklist[0].packageId, "PKG-PG-1");
assert.equal(normalized.packageChecklist[0].labelText, "第 1/4 包");
assert.equal(normalized.packageChecklist[0].quantityText, "750个");

const normalizedList = normalizeDriverDeliveryTaskListResponse({
  items: [normalized],
  page: 2,
  pageSize: 1,
  total: 5,
  metrics: {
    pendingCount: 2,
    deliveringCount: 1,
    completedCount: 1,
    exceptionCount: 1,
  },
});
assert.equal(normalizedList.page, 2);
assert.equal(normalizedList.metrics.exceptionCount, 1);

const postgresCalls = [];
const postgresRepository = createPostgresDriverDeliveryTaskReadRepository({
  queryJson(text, values) {
    postgresCalls.push({ text, values });
    if (text.includes("WHERE task.fulfillment_id")) return normalized;
    return normalizedList;
  },
});
assert.equal(postgresRepository.kind, "postgres");
assert.equal(
  (await postgresRepository.listDriverDeliveryTasks({ query: { status: "待送货", driverId: "U-DRIVER-A" } })).items[0].fulfillmentId,
  "F-PG-001",
);
assert.equal((await postgresRepository.getDriverDeliveryTask({ fulfillmentId: "F-PG-001" })).fulfillmentId, "F-PG-001");
assert.equal(postgresCalls.length, 2);

const listSql = buildListDriverDeliveryTasksSql({
  query: { status: "需'转义", driverId: "U-DRIVER-A", page: 2, pageSize: 10 },
  operatorId: "U-DRIVER-A",
});
assert.match(listSql, /FROM fulfillment_records AS fulfillment/);
assert.match(listSql, /WHERE fulfillment\.method = '送货'/);
assert.match(listSql, /customer_contacts/);
assert.match(listSql, /customer_addresses/);
assert.match(listSql, /print_records/);
assert.match(listSql, /packages/);
assert.match(listSql, /package_item\.fulfillment_id = task\.fulfillment_id/);
assert.match(listSql, /package_item\.fulfillment_id IS NULL AND package_item\.order_line_id = task\.order_line_id/);
assert.match(listSql, /package_row\.packed_qty/);
assert.match(listSql, /label_print_record_id/);
assert.match(listSql, /driver_delivery_dispatches/);
assert.match(listSql, /driver_device_field_tests/);
assert.match(listSql, /deviceFieldTestRecord/);
assert.match(listSql, /deviceFieldTestSummary/);
assert.match(listSql, /nativeBridgeDiagnostics/);
assert.match(listSql, /stop_sequence/);
assert.match(listSql, /inventory_reservations/);
assert.match(listSql, /latest_exception\.reason_code/);
assert.match(listSql, /latest_exception\.occurred_at/);
assert.match(listSql, /exceptionReasonCode/);
assert.match(listSql, /exceptionOccurredAt/);
assert.match(listSql, /delivery_evidence_review_status/);
assert.match(listSql, /watermarked_photo_attachment_id/);
assert.match(listSql, /loaded_at/);
assert.match(listSql, /loadedBy/);
assert.match(listSql, /driverRemark/);
assert.match(listSql, /receiverName/);
assert.match(listSql, /paperNoteStatus/);
assert.match(listSql, /WHERE source\.status = \$2::text/);
assert.match(listSql, /LIMIT \$3::integer/);
assert.match(listSql, /OFFSET \$4::integer/);
assert.ok(!listSql.includes("需'转义"));
assert.deepEqual(buildListDriverDeliveryTasksQuery({
  query: { status: "需'转义", driverId: "U-DRIVER-A", page: 2, pageSize: 10 },
  operatorId: "U-DRIVER-A",
}).values, ["U-DRIVER-A", "需'转义", 10, 10, 2, 10]);

const detailSql = buildFindDriverDeliveryTaskSql({ fulfillmentId: "F-PG-'001", operatorId: "U-DRIVER-A" });
assert.match(detailSql, /WHERE task\.fulfillment_id = \$2::text/);
assert.match(detailSql, /jsonb_build_object/);
assert.ok(!detailSql.includes("F-PG-'001"));
assert.deepEqual(buildFindDriverDeliveryTaskQuery({ fulfillmentId: "F-PG-'001", operatorId: "U-DRIVER-A" }).values, [
  "U-DRIVER-A",
  "F-PG-'001",
]);
assert.deepEqual(postgresCalls[0].values, ["U-DRIVER-A", "待送货", 50, 0, 1, 50]);
assert.deepEqual(postgresCalls[1].values, ["", "F-PG-001"]);

console.log("Driver delivery task read repository check passed: local driver task projection and PostgreSQL read SQL are covered.");
