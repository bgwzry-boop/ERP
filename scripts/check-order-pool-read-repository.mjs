import assert from "node:assert/strict";
import {
  buildFindOrderLineDetailQuery,
  buildFindOrderLineDetailSql,
  buildListOrderLinesQuery,
  buildListOrderLinesSql,
  createLocalOrderPoolReadRepository,
  createPostgresOrderPoolReadRepository,
} from "../server/orderPoolReadRepository.mjs";

await checkLocalOrderPoolReadRepository();
await checkPostgresOrderPoolReadRepository();

console.log(
  "Order pool read repository check passed: local list/detail normalization and PostgreSQL order-line read SQL are covered.",
);

async function checkLocalOrderPoolReadRepository() {
  const repository = createLocalOrderPoolReadRepository();
  const workspace = {
    customers: [{ id: "C001", name: "张三服饰" }],
    originalOrders: [
      {
        orderId: "ORD-LOCAL-001",
        bizNo: "ORD-LOCAL-001",
        sourceText: "张三服饰 白印黑 500个",
        summaryStatus: "处理中",
        createdBy: "U-OFFICE-A",
        createdAt: "2026-07-02T10:30:00.000Z",
      },
    ],
    orderLines: [
      {
        id: "OL-LOCAL-001",
        orderNo: "ORD-LOCAL-001",
        customerId: "C001",
        product: "定制印刷",
        size: "30*38*10",
        color: "白色",
        handle: "普通提",
        style: "空白袋",
        print: "是",
        printColor: "黑色",
        qty: 500,
        orderType: "custom_print",
        status: "待出库",
        fulfillment: "自提",
        latest: "明天",
        amount: 480,
        exceptions: ["需确认稿件"],
      },
      {
        id: "OL-LOCAL-002",
        orderNo: "ORD-LOCAL-002",
        customerId: "C001",
        product: "空白袋",
        size: "30*38*10",
        color: "红色",
        qty: 100,
        status: "已关闭",
        fulfillment: "自提",
      },
    ],
    fulfillments: [
      {
        id: "F-LOCAL-001",
        lineId: "OL-LOCAL-001",
        method: "自提",
        status: "待出库",
        qty: 500,
        latest: "明天",
      },
    ],
    inventoryReservations: [
      {
        id: "RSV-LOCAL-001",
        orderLineId: "OL-LOCAL-001",
        inventoryItemId: "INV-LOCAL-001",
        qty: 500,
        status: "生效",
      },
    ],
    inventories: [
      {
        id: "INV-LOCAL-001",
        inventoryKey: "30*38*10-白色-普通提-空白袋-A区",
        zone: "A区",
        state: "仓库已清点",
        trust: "已清点",
        available: 1200,
      },
    ],
    statements: [
      {
        id: "ST-LOCAL-001",
        period: "2026-07",
        status: "待生成",
        receivable: 480,
        received: 0,
        variance: 0,
        lineIds: ["OL-LOCAL-001"],
      },
    ],
    operationLogs: [{ id: "LOG-LOCAL-001", targetId: "OL-LOCAL-001", action: "confirm_order_draft" }],
  };

  const listed = await repository.listOrderLines({
    workspace,
    query: { keyword: "白", orderType: "custom_print", exceptionOnly: true, pageSize: 1 },
  });

  assert.equal(listed.items.length, 1);
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].id, "OL-LOCAL-001");
  assert.equal(listed.items[0].customerName, "张三服饰");
  assert.equal(listed.items[0].productName, "定制印刷");
  assert.equal(listed.items[0].bagColor, "白色");
  assert.equal(listed.items[0].printFlag, true);
  assert.deepEqual(listed.items[0].exceptionTags, ["需确认稿件"]);

  const detail = await repository.getOrderLineDetail({ workspace, orderLineId: "OL-LOCAL-001" });
  assert.equal(detail.orderLine.id, "OL-LOCAL-001");
  assert.equal(detail.originalOrder.sourceText, "张三服饰 白印黑 500个");
  assert.equal(detail.priceSnapshot.finalAmount, 480);
  assert.equal(detail.inventory[0].inventoryItemId, "INV-LOCAL-001");
  assert.equal(detail.fulfillment[0].fulfillmentId, "F-LOCAL-001");
  assert.equal(detail.statement[0].statementId, "ST-LOCAL-001");
  assert.equal(detail.operationLogs.length, 1);
  assert.equal(await repository.getOrderLineDetail({ workspace, orderLineId: "MISSING" }), null);
}

async function checkPostgresOrderPoolReadRepository() {
  const calls = [];
  const repository = createPostgresOrderPoolReadRepository({
    queryJson(text, values) {
      calls.push({ text, values });
      if (text.includes("filtered_order_lines")) {
        return {
          items: [buildPostgresListItem()],
          page: 2,
          pageSize: 20,
          total: 1,
        };
      }
      return {
        orderLine: buildPostgresListItem(),
        originalOrder: {
          orderId: "ORD-PG-001",
          orderNo: "ORD-PG-001",
          sourceText: "Postgres order pool source",
          summaryStatus: "处理中",
          createdBy: "U-OFFICE-A",
          createdAt: "2026-07-02T10:30:00.000Z",
        },
        priceSnapshot: {
          priceSnapshotId: "PS-PG-001",
          orderLineId: "OL-PG-001",
          chargeableQty: 273,
          finalAmount: 273,
        },
        inventory: [{ inventoryItemId: "INV-PG-001", inventoryKey: "30*38-白色", availableQty: 100 }],
        fulfillment: [{ fulfillmentId: "F-PG-001", orderLineId: "OL-PG-001", method: "自提", status: "待出库" }],
        statement: [{ statementId: "ST-PG-001", status: "待生成", receivable: 273, received: 0, variance: 0 }],
        operationLogs: [{ operationLogId: "LOG-PG-001", targetId: "OL-PG-001", action: "confirm_order_draft" }],
      };
    },
  });

  const listed = await repository.listOrderLines({
    query: {
      keyword: "O'Brien",
      customerId: "C001",
      status: "待出库",
      orderType: "stock",
      fulfillmentMethod: "自提",
      exceptionOnly: "true",
      financeState: "unbilled",
      page: 2,
      pageSize: 20,
    },
  });

  assert.equal(listed.page, 2);
  assert.equal(listed.pageSize, 20);
  assert.equal(listed.items[0].id, "OL-PG-001");
  assert.equal(listed.items[0].orderLineId, "OL-PG-001");
  assert.equal(listed.items[0].customerName, "Postgres 客户");
  assert.equal(listed.items[0].amount, 273);

  const listQuery = calls[0];
  assert.match(listQuery.text, /FROM order_lines AS line/);
  assert.match(listQuery.text, /JOIN original_orders AS original/);
  assert.match(listQuery.text, /LEFT JOIN LATERAL/);
  assert.match(listQuery.text, /price_snapshots AS snapshot/);
  assert.match(listQuery.text, /fulfillment_records AS fulfillment/);
  assert.match(listQuery.text, /inventory_reservations AS reservation/);
  assert.match(listQuery.text, /statement_lines AS statement_line/);
  assert.match(listQuery.text, /line.customer_id = \$1::text/);
  assert.match(listQuery.text, /line.line_status = \$2::text/);
  assert.match(listQuery.text, /line.order_type = \$3::text/);
  assert.match(listQuery.text, /COALESCE\(array_length\(line.exception_tags, 1\), 0\) > 0/);
  assert.match(listQuery.text, /LIMIT \$7::integer/);
  assert.match(listQuery.text, /OFFSET \$8::integer/);
  assert.ok(!listQuery.text.includes("O'Brien"));
  assert.deepEqual(listQuery.values, ["C001", "待出库", "stock", "自提", "unbilled", "%O'Brien%", 20, 20, 2, 20]);

  const detail = await repository.getOrderLineDetail({ orderLineId: "OL-PG-001" });
  assert.equal(detail.orderLine.id, "OL-PG-001");
  assert.equal(detail.originalOrder.orderId, "ORD-PG-001");
  assert.equal(detail.priceSnapshot.orderLineId, "OL-PG-001");
  assert.equal(detail.inventory[0].inventoryItemId, "INV-PG-001");
  assert.equal(detail.fulfillment[0].fulfillmentId, "F-PG-001");
  assert.equal(detail.statement[0].statementId, "ST-PG-001");

  const detailQuery = calls[1];
  assert.match(detailQuery.text, /WITH selected_order_line AS/);
  assert.match(detailQuery.text, /WHERE line.id = \$1::text/);
  assert.match(detailQuery.text, /selected_inventory AS/);
  assert.match(detailQuery.text, /selected_operation_logs AS/);
  assert.deepEqual(detailQuery.values, ["OL-PG-001"]);

  assert.match(buildListOrderLinesSql({ pageSize: 5 }), /'items'/);
  assert.match(buildFindOrderLineDetailSql({ orderLineId: "OL-PG-001" }), /'orderLine'/);
  assert.deepEqual(buildListOrderLinesQuery({ pageSize: 5 }).values, [5, 0, 1, 5]);
  assert.deepEqual(buildFindOrderLineDetailQuery({ orderLineId: "OL-PG-001" }).values, ["OL-PG-001"]);
}

function buildPostgresListItem() {
  return {
    id: "OL-PG-001",
    orderLineId: "OL-PG-001",
    orderId: "ORD-PG-001",
    orderNo: "ORD-PG-001",
    customerId: "C001",
    customerName: "Postgres 客户",
    productName: "Postgres 确认订单",
    size: "30*38*10",
    bagColor: "白色",
    handleType: "普通提",
    style: "空白袋",
    printFlag: false,
    qty: 273,
    orderType: "stock",
    lineStatus: "待出库",
    fulfillmentMethod: "自提",
    amount: 273,
    financeState: "unbilled",
    exceptionTags: [],
  };
}
