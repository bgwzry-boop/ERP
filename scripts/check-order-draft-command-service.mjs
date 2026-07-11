import assert from "node:assert/strict";
import { createOrderDraftCommandService } from "../server/services/orderDraftCommandService.mjs";

let confirmationMode = "success";
const calls = { draftSaves: [], confirmations: [] };
const service = createOrderDraftCommandService({
  buildCustomerSnapshot(_workspace, customerId) {
    return { customerId, name: "张三服饰" };
  },
  buildOperationLog(_workspace, input) {
    return { id: input.id ?? `LOG-${input.action}`, ...input };
  },
  buildTodo(_workspace, input) {
    return { handled: false, ...input };
  },
  confirmDraftOrder({ draftRows }) {
    if (confirmationMode === "blocked") {
      return {
        blocked: true,
        draftStatus: "待补充信息",
        checkedRows: draftRows,
        toast: "库存或关键字段需要确认",
      };
    }
    return {
      blocked: false,
      draftStatus: "已生成正式订单",
      orderNo: "ORD-SERVICE-001",
      checkedRows: draftRows.map((row) => ({ ...row, inventory: "可用", amount: 3.4 })),
      newLines: [
        {
          id: "OL-SERVICE-001",
          orderId: "ORD-SERVICE-001",
          customerId: "C001",
          qty: 10,
          amount: 3.4,
          status: "待出库",
        },
      ],
      newFulfillments: [
        {
          id: "FUL-SERVICE-001",
          lineId: "OL-SERVICE-001",
          customerId: "C001",
          method: "自提",
          qty: 10,
          status: "待出库",
        },
      ],
      shortageTodoInputs: [],
    };
  },
  findCustomerName(_workspace, customerId) {
    return customerId === "C001" ? "张三服饰" : "";
  },
  findInventoryItem(workspace, inventoryItemId) {
    return workspace.inventories.find((item) => item.id === inventoryItemId) ?? null;
  },
  findMatchingInventory(workspace, row) {
    return workspace.inventories.find(
      (item) => item.size === row.size && item.color === row.color && item.handle === row.handle,
    ) ?? null;
  },
  mapFulfillmentMethod(value) {
    return value === "自提" ? "pickup" : "delivery";
  },
  mapPrintSide(value) {
    return value === "single" ? "单面" : value === "double" ? "双面" : value || "非印刷";
  },
  nextId(prefix, rows) {
    return `${prefix}-${String(rows.length + 1).padStart(3, "0")}`;
  },
  nextPlainId(prefix, value) {
    return `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, "-")}`;
  },
  parseOrderText(sourceText) {
    return [
      {
        id: "PARSED-001",
        customerId: "C001",
        customer: "张三服饰",
        product: "空白袋",
        size: "30*38*10",
        color: "红色",
        handle: "普通提",
        style: "空白袋",
        print: "否",
        qty: 10,
        fulfillment: "自提",
        latest: "明天",
        confidence: "high",
        source: sourceText,
      },
    ];
  },
  toFulfillmentTaskSummary(fulfillment) {
    return { fulfillmentId: fulfillment.id, expectedQty: fulfillment.qty };
  },
  toInventoryCheckResult(_workspace, row, orderLine) {
    return { orderLineId: orderLine.id, status: row.inventory };
  },
  toInventoryReservationTransactionSummary(reservation) {
    return { reservationId: reservation.reservationId, qty: reservation.reservedQty };
  },
  toOrderLineSummary(line) {
    return { id: line.id, lineStatus: line.status };
  },
  toPriceSnapshot(line) {
    return {
      orderLineId: line.id,
      bagPrice: 0.34,
      printPrice: 0,
      otherFee: 0,
      amount: line.amount,
    };
  },
  toTodoSummary(todo) {
    return { todoId: todo.id, type: todo.type };
  },
  now: () => new Date("2026-07-11T13:00:00.000Z"),
});

await checkRecognition();
await checkDraftSave();
await checkConfirmation();
await checkBlockedConfirmation();
await checkValidation();

console.log(
  "Order draft command service checks passed: recognition, revisioned save, blocked confirmation, inventory/price confirmation inputs, authenticated identity, and transaction orchestration are covered.",
);

async function checkRecognition() {
  const workspace = buildWorkspace();
  const result = await service.recognizeOrderDraft({
    workspace,
    operatorId: "U-OFFICE-A",
    body: {
      sourceText: "张三服饰 30*38红10个 明天自提",
      idempotencyKey: "draft-recognize-service-001",
      operatorId: "U-SPOOFED",
    },
  });
  assert.match(result.response.draft.draftId, /^DRAFT-API-[A-F0-9]{16}$/);
  assert.equal(result.response.draft.clientRevision, 1);
  assert.equal(result.response.lines[0].recognitionStatus, "high_confidence");
  assert.equal(result.response.riskHints.length, 0);
  const input = calls.draftSaves.at(-1);
  assert.equal(input.expectedRevision, 0);
  assert.equal(input.draft.createdBy, "U-OFFICE-A");
  assert.equal(input.idempotencyPayload.operatorId, "U-OFFICE-A");
  assert.equal(input.operationLog.operatorId, "U-OFFICE-A");
}

async function checkDraftSave() {
  const workspace = buildWorkspace();
  const result = await service.saveOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: {
      clientRevision: 1,
      draftStatus: "待补充信息",
      operatorId: "U-SPOOFED",
      lines: [buildRequestLine()],
    },
  });
  assert.equal(result.response.draft.clientRevision, 2);
  assert.equal(result.response.todos[0].type, "订单草稿待确认");
  const input = calls.draftSaves.at(-1);
  assert.equal(input.expectedRevision, 1);
  assert.equal(input.todos[0].createdBy, "U-OFFICE-A");
  assert.equal(input.idempotencyPayload.operatorId, "U-OFFICE-A");
  assert.equal(input.operationLog.operatorId, "U-OFFICE-A");
}

async function checkConfirmation() {
  confirmationMode = "success";
  const workspace = buildWorkspace();
  const result = await service.confirmOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: {
      sourceText: "张三服饰 30*38红10个 明天自提",
      clientRevision: 1,
      idempotencyKey: "draft-confirm-service-001",
      operatorId: "U-SPOOFED",
      lines: [buildRequestLine()],
    },
  });
  assert.equal(result.response.orderId, "ORD-SERVICE-001");
  assert.equal(result.response.reservations[0].qty, 10);
  assert.equal(result.response.fulfillmentTasks[0].expectedQty, 10);
  const input = calls.confirmations.at(-1);
  assert.equal(input.expectedDraftRevision, 1);
  assert.equal(input.idempotencyPayload.operatorId, "U-OFFICE-A");
  assert.equal(input.order.createdBy, "U-OFFICE-A");
  assert.equal(input.orderLines[0].createdBy, "U-OFFICE-A");
  assert.equal(input.priceSnapshots[0].createdBy, "U-OFFICE-A");
  assert.equal(input.fulfillmentRecords[0].createdBy, "U-OFFICE-A");
  assert.equal(input.inventoryReservations[0].inventoryItemId, "INV-001");
  assert.equal(input.inventoryReservations[0].reservationType, "待提货锁定");
  assert.equal(input.inventoryLedgerEntries[0].qtyBefore, 20);
  assert.equal(input.inventoryLedgerEntries[0].qtyAfter, 30);
  assert.equal(input.inventoryLedgerEntries[0].operatorId, "U-OFFICE-A");
  assert.equal(input.operationLog.operatorId, "U-OFFICE-A");
}

async function checkBlockedConfirmation() {
  confirmationMode = "blocked";
  const workspace = buildWorkspace();
  const beforeSaveCount = calls.draftSaves.length;
  const result = await service.confirmOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: { clientRevision: 1, lines: [buildRequestLine()] },
  });
  assert.equal(result.statusCode, 409);
  assert.equal(result.code, "ORDER_DRAFT_BLOCKED");
  assert.equal(calls.draftSaves.length, beforeSaveCount + 1);
  assert.equal(calls.draftSaves.at(-1).draft.status, "待补充信息");
  assert.equal(calls.draftSaves.at(-1).operationLog.action, "block_order_draft_confirmation");
  confirmationMode = "success";
}

async function checkValidation() {
  const workspace = buildWorkspace();
  const empty = await service.saveOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: { clientRevision: 1, lines: [] },
  });
  assert.equal(empty.statusCode, 422);
  const invalidRevision = await service.confirmOrderDraft({
    workspace,
    draftId: "DRAFT-SERVICE-001",
    operatorId: "U-OFFICE-A",
    body: { clientRevision: 0, lines: [buildRequestLine()] },
  });
  assert.equal(invalidRevision.code, "VALIDATION_ERROR");
  workspace.orderDrafts = [];
  const missing = await service.saveOrderDraft({
    workspace,
    draftId: "DRAFT-MISSING",
    operatorId: "U-OFFICE-A",
    body: { clientRevision: 1, lines: [buildRequestLine()] },
  });
  assert.equal(missing.code, "ORDER_DRAFT_NOT_FOUND");
}

function buildWorkspace() {
  const draft = {
    id: "DRAFT-SERVICE-001",
    draftId: "DRAFT-SERVICE-001",
    sourceText: "张三服饰 30*38红10个 明天自提",
    sourceChannel: "manual",
    sourceMessageId: "",
    customerId: "C001",
    customerName: "张三服饰",
    status: "待审核",
    revision: 1,
    clientRevision: 1,
    createdAt: "2026-07-11T12:00:00.000Z",
    updatedAt: "2026-07-11T12:00:00.000Z",
    lines: [],
  };
  return {
    sampleText: "张三服饰 30*38红10个 明天自提",
    customers: [{ id: "C001", name: "张三服饰" }],
    inventories: [
      {
        id: "INV-001",
        size: "30*38*10",
        color: "红色",
        handle: "普通提",
        reserved: 20,
        available: 100,
      },
    ],
    orderDrafts: [draft],
    orderLines: [],
    fulfillments: [],
    todos: [],
    operationLogs: [],
    orderDraftRepository: {
      async getOrderDraft({ workspace, draftId }) {
        return workspace.orderDrafts.find((item) => item.id === draftId) ?? null;
      },
      async saveOrderDraft(input) {
        calls.draftSaves.push(input);
        return {
          draft: {
            ...input.draft,
            revision: input.expectedRevision + 1,
            clientRevision: input.expectedRevision + 1,
          },
          todos: input.todos,
          operationLogId: input.operationLog.id,
        };
      },
    },
    orderConfirmationTransactionRepository: {
      async confirmOrder(input) {
        calls.confirmations.push(input);
        return {
          order: input.order,
          inventoryReservations: input.inventoryReservations,
          todos: input.todos,
          operationLogId: input.operationLog.id,
        };
      },
    },
  };
}

function buildRequestLine() {
  return {
    draftLineId: "DRAFT-SERVICE-001-01",
    customerId: "C001",
    customer: "张三服饰",
    productName: "空白袋",
    size: "30*38*10",
    bagColor: "红色",
    handleType: "普通提",
    style: "空白袋",
    qty: 10,
    fulfillmentMethod: "自提",
    latestNeededAt: "明天",
    printFlag: false,
  };
}
