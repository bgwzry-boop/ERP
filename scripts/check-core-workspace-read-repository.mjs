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
assert.equal(state.customerNotes[0].content, "客户备注");
assert.equal(state.colorAliases[0].standardColorId, "SC-WHITE");
assert.equal(state.sizeSpecs[0].widthMm, 300);
assert.deepEqual(state.finishedGoodsStyles[0].allowedSizeKeys, ["30*38*10"]);
assert.equal(state.priceTables[0].versionNo, 2);
assert.equal(state.priceTableItems[0].bagPrice, 0.2);
assert.equal(state.machines[0].machineType, "bag_making");
assert.equal(state.employees[0].profileStatus, "pending_admin_review");
assert.equal(state.employeeMachineAssignments[0].employeeId, "EMP-CORE-001");
assert.equal(state.machineCapacityBaselines[0].dailyCapacityQty, 12000);
assert.equal(state.productionExceptions[0].exceptionType, "机器问题");
assert.equal(state.productionExceptions[0].continuationMode, "暂停等确认");
assert.equal(state.productionExceptions[0].resolutionCode, "继续生产");
assert.equal(state.productionExceptions[0].resolvedBy, "U-MANAGER-A");
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
  "customer_notes",
  "color_aliases",
  "size_specs",
  "finished_goods_styles",
  "price_tables",
  "price_table_items",
  "machines",
  "employees",
  "employee_machine_assignments",
  "machine_capacity_baselines",
  "original_orders",
  "order_lines",
  "production_exception_records",
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

console.log("Core workspace read repository check passed: empty-state clearing, core/master-data SQL coverage, and workspace mappings are covered.");

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
    customerNotes: [
      { id: "CN-001", customer_id: "C001", note_type: "office", content: "客户备注", visible_to: "office" },
    ],
    standardColors: [{ id: "SC-WHITE", color_key: "white", name: "白色", enabled: true }],
    colorAliases: [
      { id: "CA-WHITE", alias: "白", standard_color_id: "SC-WHITE", source_type: "global", enabled: true },
    ],
    sizeSpecs: [
      { id: "SIZE-CORE-001", size_key: "30*38*10", display_name: "30*38*10", width_mm: "300", height_mm: "380", enabled: true, metadata_json: { source: "check" } },
    ],
    finishedGoodsStyles: [
      { id: "STYLE-CORE-001", style_key: "blank_bag", name: "空白袋", enabled: true, allowed_size_keys: ["30*38*10"] },
    ],
    priceTables: [
      { id: "PRICE-CORE-001", biz_no: "PRICE-CORE-001", name: "标准价格", version_no: 2, status: "active" },
    ],
    priceTableItems: [
      { id: "PTI-CORE-001", price_table_id: "PRICE-CORE-001", size_key: "30*38*10", standard_color_id: "SC-WHITE", handle_type: "普通提", style_key: "blank_bag", bag_price: "0.2", print_price: "0.05", other_fee: "1", min_qty: 100, enabled: true },
    ],
    machines: [
      { id: "MACH-CORE-001", biz_no: "MACH-CORE-001", name: "制袋机1", machine_type: "bag_making", workshop: "制袋车间", status: "active", enabled: true, settings_json: { lane: 1 } },
    ],
    employees: [
      { id: "EMP-CORE-001", biz_no: "EMP-CORE-001", name: "王师傅", role_name: "制袋机长", default_workshop: "制袋车间", default_machine_id: "MACH-CORE-001", account_enabled: false, profile_status: "pending_admin_review", requested_enabled: true },
    ],
    employeeMachineAssignments: [
      { id: "EMA-CORE-001", employee_id: "EMP-CORE-001", machine_id: "MACH-CORE-001", assignment_type: "default", workshop: "制袋车间", enabled: true },
    ],
    machineCapacityBaselines: [
      { id: "MCB-CORE-001", machine_id: "MACH-CORE-001", size_key: "30*38*10", daily_capacity_qty: 12000, hourly_capacity_qty: 1500, source_kind: "manual_estimate", confidence: "medium" },
    ],
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
    productionExceptions: [
      {
        id: "PEX-CORE-001",
        biz_no: "PEX-CORE-001",
        production_task_id: "PT-CORE-001",
        order_line_id: "OL-CORE-001",
        process_type: "制袋",
        machine_id: "BAG-01",
        operator_id: "U-OFFICE-A",
        exception_type: "机器问题",
        continuation_mode: "暂停等确认",
        status: "已恢复生产",
        resolution_code: "继续生产",
        resolution_note: "主管确认机器已调整",
        resolved_by: "U-MANAGER-A",
        resolved_at: "2026-07-02T12:20:00.000Z",
        estimated_loss_qty: 6,
        affects_delivery: true,
        remark: "机器异响",
        evidence_json: { inventoryCreated: false },
        occurred_at: "2026-07-02T12:05:00.000Z",
        created_at: "2026-07-02T12:05:00.000Z",
      },
    ],
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
