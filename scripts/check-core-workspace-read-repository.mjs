import assert from "node:assert/strict";
import {
  buildCoreWorkspaceSnapshotQuery,
  coreWorkspaceCollectionKeys,
  createLocalCoreWorkspaceReadRepository,
  createPostgresCoreWorkspaceReadRepository,
  normalizeCoreWorkspaceState,
} from "../server/coreWorkspaceReadRepository.mjs";

const localRepository = createLocalCoreWorkspaceReadRepository();
assert.deepEqual(localRepository.loadState(), {});

const emptyState = normalizeCoreWorkspaceState(null);
for (const key of coreWorkspaceCollectionKeys) assert.deepEqual(emptyState[key], [], `${key} should default to []`);

const calls = [];
const repository = createPostgresCoreWorkspaceReadRepository({
  async queryJson(text, values) {
    calls.push({ text, values });
    return buildDatabaseSnapshot();
  },
});
const state = await repository.loadState();

assert.equal(repository.kind, "postgres");
assert.equal(state.customers[0].name, "张三服饰");
assert.equal(state.customers[0].contact, "张经理");
assert.equal(state.customers[0].address, "虎门测试地址");
assert.equal(state.customers[0].cycle, "7天一结");
assert.equal(state.customers[0].receivable, 60);
assert.equal(state.orderLines[0].orderNo, "ORD-CORE-001");
assert.equal(state.orderLines[0].amount, 100);
assert.equal(state.orderLines[0].inventory, "已占用");
assert.equal(state.inventories[0].color, "白色");
assert.equal(state.inventories[0].available, 70);
assert.equal(state.fulfillments[0].packages, "1包");
assert.equal(state.fulfillments[0].zone, "A区");
assert.equal(state.statements[0].lineIds[0], "OL-CORE-001");
assert.equal(state.statementLines[0].finalAmount, 100);
assert.equal(state.todos[0].ref, "DRAFT-CORE-001");
assert.equal(state.todos[0].notificationStatus, "话术已复制");
assert.equal(state.todos[0].lastAction, "已复制客户通知话术");
assert.equal(state.todoEvents[0].eventId, "TE-CORE-001");
assert.equal(state.operationLogs[0].targetType, "order_draft");

const query = buildCoreWorkspaceSnapshotQuery();
assert.deepEqual(query.values, []);
for (const table of [
  "customers",
  "original_orders",
  "order_lines",
  "inventory_items",
  "fulfillment_records",
  "statements",
  "todos",
  "todo_events",
  "operation_logs",
]) {
  assert.match(query.text, new RegExp(`FROM ${table} AS row_data`));
}
assert.equal(calls.length, 1);
assert.equal(calls[0].text, query.text);

console.log("Core workspace read repository check passed: empty-state clearing, SQL coverage, and workspace mappings are covered.");

function buildDatabaseSnapshot() {
  return {
    customers: [
      {
        id: "C001",
        biz_no: "CUST-001",
        name: "张三服饰",
        short_name: "张三",
        settlement_cycle: "7天一结",
        risk_status: "正常",
        debt_amount_snapshot: "10",
        enabled: true,
      },
    ],
    customerContacts: [
      { id: "CC-001", customer_id: "C001", contact_name: "张经理", phone: "13800000000", is_default: true },
    ],
    customerAddresses: [
      { id: "CA-001", customer_id: "C001", address: "虎门测试地址", is_default: true },
    ],
    standardColors: [{ id: "SC-WHITE", color_key: "white", name: "白色", enabled: true }],
    originalOrders: [
      { id: "ORD-CORE-001", biz_no: "ORD-CORE-001", source_draft_id: "DRAFT-CORE-001", customer_id: "C001", customer_snapshot: { name: "张三服饰" }, summary_status: "处理中" },
    ],
    orderLines: [
      {
        id: "OL-CORE-001",
        biz_no: "OL-CORE-001",
        order_id: "ORD-CORE-001",
        customer_id: "C001",
        product_name: "活动袋",
        order_type: "定制印刷",
        size: "30*38*10",
        bag_color: "白色",
        handle_type: "普通提",
        style: "空白袋",
        print_flag: true,
        print_color: "黑色",
        print_side: "单面",
        original_qty: 100,
        fulfillment_method: "送货",
        line_status: "待出库",
        exception_tags: [],
        revision: 2,
      },
    ],
    orderLineChangeRecords: [],
    priceSnapshots: [
      { id: "PS-CORE-001", order_line_id: "OL-CORE-001", snapshot_type: "order_confirm", version_no: 1, final_amount: "100", chargeable_qty: 100 },
    ],
    inventories: [
      { id: "INV-CORE-001", inventory_key: "core", size: "30*38*10", standard_color_id: "SC-WHITE", handle_type: "普通提", style: "空白袋", zone: "A区", inventory_state: "仓库已清点", on_hand_qty: 100, reserved_qty: 20, waiting_pickup_locked_qty: 5, pending_handling_qty: 5, trust_level: "已清点" },
    ],
    inventoryReservations: [
      { id: "RSV-CORE-001", order_line_id: "OL-CORE-001", inventory_item_id: "INV-CORE-001", reserved_qty: 20, reservation_type: "出库占用", status: "生效", revision: 1 },
    ],
    inventoryLedgers: [],
    inventoryCorrectionDrafts: [],
    productionTasks: [],
    workshopReports: [],
    packingTasks: [],
    fulfillments: [
      { id: "F-CORE-001", biz_no: "F-CORE-001", order_line_id: "OL-CORE-001", customer_id: "C001", customer_snapshot: { name: "张三服饰" }, method: "送货", expected_qty: 100, status: "待出库", revision: 1 },
    ],
    fulfillmentExceptions: [],
    packages: [
      { id: "PKG-CORE-001", biz_no: "PKG-CORE-001", order_line_id: "OL-CORE-001", fulfillment_id: "F-CORE-001", package_seq: 1, package_count: 1, packed_qty: 100, status: "待出库" },
    ],
    printRecords: [],
    statements: [
      { id: "ST-CORE-001", biz_no: "ST-CORE-001", customer_id: "C001", period_start: "2026-07-01", period_end: "2026-07-11", status: "差额待确认", receivable_amount: "100", received_amount: "40", variance_amount: "60", revision: 1 },
    ],
    statementLines: [
      { id: "SL-CORE-001", statement_id: "ST-CORE-001", order_line_id: "OL-CORE-001", fulfillment_id: "F-CORE-001", delivered_qty: 100, chargeable_qty: 100, amount: "100", final_amount: "100" },
    ],
    todos: [
      { id: "T-CORE-001", biz_no: "T-CORE-001", type: "订单草稿待确认", ref_type: "order_draft", ref_id: "DRAFT-CORE-001", priority: "普通", status: "未处理", summary: "待确认" },
    ],
    todoEvents: [
      {
        id: "TE-CORE-001",
        todo_id: "T-CORE-001",
        event_type: "handle_todo:customer_notification_copied",
        event_payload: {
          todo: {
            notificationStatus: "话术已复制",
            lastAction: "已复制客户通知话术",
          },
        },
        operator_id: "U-OFFICE-A",
        occurred_at: "2026-07-11T08:30:00.000Z",
        created_at: "2026-07-11T08:30:00.000Z",
      },
    ],
    varianceRecords: [],
    statementSendRecords: [],
    statementConfirmationRecords: [],
    operationLogs: [
      { id: "LOG-CORE-001", target_type: "order_draft", target_id: "DRAFT-CORE-001", action: "save_order_draft", before_json: {}, after_json: { status: "待审核" }, operator_id: "U-OFFICE-A" },
    ],
  };
}
