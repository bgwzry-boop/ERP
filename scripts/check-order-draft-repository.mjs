import assert from "node:assert/strict";
import {
  buildListOrderDraftsQuery,
  buildSaveOrderDraftTransactionQuery,
  createLocalOrderDraftRepository,
  createPostgresOrderDraftRepository,
} from "../server/orderDraftRepository.mjs";

await checkLocalRepositoryRevisionBoundary();
await checkPostgresRepositoryBoundary();

console.log(
  "Order draft repository check passed: committed revisions, stale-write rejection, idempotency locks, parameterized SQL, and ordered line replacement are covered.",
);

async function checkLocalRepositoryRevisionBoundary() {
  const repository = createLocalOrderDraftRepository();
  const workspace = { orderDrafts: [], todos: [], operationLogs: [] };
  const first = await repository.saveOrderDraft({
    workspace,
    expectedRevision: 0,
    draft: buildDraft({ revision: 0, clientRevision: 0 }),
    todos: [buildTodo()],
    operationLog: buildOperationLog("LOG-DRAFT-001"),
  });

  assert.equal(first.draft.revision, 1);
  assert.equal(first.draft.clientRevision, 1);
  assert.equal(workspace.orderDrafts[0].revision, 1);
  assert.equal(workspace.orderDrafts[0].recognitionContext.summary.messageCount, 1);
  assert.equal(workspace.todos[0].id, "T-DRAFT-001");
  assert.equal(workspace.operationLogs[0].id, "LOG-DRAFT-001");
  assert.equal((await repository.getOrderDraft({ workspace, draftId: "DRAFT-001" })).revision, 1);

  assert.throws(
    () =>
      repository.saveOrderDraft({
        workspace,
        expectedRevision: 0,
        draft: buildDraft({ status: "待补充信息", revision: 0 }),
        todos: [],
        operationLog: buildOperationLog("LOG-DRAFT-STALE"),
      }),
    (error) => error?.statusCode === 409 && error?.code === "BUSINESS_WRITE_CONFLICT",
  );
  assert.equal(workspace.orderDrafts[0].status, "待审核");

  const second = await repository.saveOrderDraft({
    workspace,
    expectedRevision: 1,
    draft: buildDraft({ status: "待补充信息", revision: 1, clientRevision: 1 }),
    todos: [],
    operationLog: buildOperationLog("LOG-DRAFT-002"),
  });
  assert.equal(second.draft.revision, 2);
  assert.equal(second.draft.clientRevision, 2);
  assert.equal(workspace.orderDrafts[0].status, "待补充信息");
}

async function checkPostgresRepositoryBoundary() {
  const calls = [];
  const repository = createPostgresOrderDraftRepository({
    queryJson: async (text, values) => {
      calls.push({ kind: "query", text, values });
      return [buildDraft({ revision: 3, clientRevision: 3 })];
    },
    idempotentTransactionJson: async (request) => {
      calls.push({ kind: "transaction", ...request });
      return {
        draft: buildDraft({ revision: 2, clientRevision: 2, status: "待补充信息" }),
        todos: [buildTodo()],
        operationLogId: "LOG-DRAFT-002",
      };
    },
  });
  const workspace = { orderDrafts: [], todos: [], operationLogs: [] };
  const operationLog = buildOperationLog("LOG-DRAFT-002");

  const loaded = await repository.getOrderDraft({ draftId: "DRAFT-001" });
  assert.equal(loaded.revision, 3);
  assert.match(calls[0].text, /WHERE draft\.id = \$1::text/);
  assert.deepEqual(calls[0].values, ["DRAFT-001"]);

  const saved = await repository.saveOrderDraft({
    workspace,
    expectedRevision: 1,
    idempotencyKey: "draft-save-idem-001",
    idempotencyPayload: { draftId: "DRAFT-001", clientRevision: 1 },
    draft: buildDraft({ revision: 1, clientRevision: 1, status: "待补充信息" }),
    todos: [buildTodo()],
    operationLog,
  });
  assert.equal(saved.draft.revision, 2);
  assert.equal(workspace.orderDrafts[0].revision, 2);
  assert.equal(workspace.todos[0].id, "T-DRAFT-001");
  assert.equal(workspace.operationLogs[0].id, "LOG-DRAFT-002");

  const transaction = calls.find((call) => call.kind === "transaction");
  assert.equal(transaction.scope, "order.draft.save.draft-001");
  assert.equal(transaction.idempotencyKey, "draft-save-idem-001");
  assert.ok(transaction.resourceLocks.includes("order-draft:DRAFT-001"));
  assert.match(transaction.text, /^BEGIN;/);
  assert.match(transaction.text, /FROM order_drafts[\s\S]*FOR UPDATE/);
  assert.match(transaction.text, /ERP_ORDER_DRAFT_CONCURRENCY_CONFLICT/);
  assert.match(transaction.text, /deleted_draft_lines AS/);
  assert.match(transaction.text, /draft_line_replacement_guard AS MATERIALIZED/);
  assert.match(transaction.text, /CROSS JOIN draft_line_replacement_guard/);
  assert.match(transaction.text, /INSERT INTO order_draft_lines/);
  assert.match(transaction.text, /INSERT INTO todos/);
  assert.match(transaction.text, /INSERT INTO operation_logs/);
  assert.match(transaction.text, /order_drafts\.revision \+ 1/);
  assert.match(transaction.text, /COMMIT;/);
  assert.doesNotMatch(transaction.text, /张三服饰|O'Brien/);
  assert.ok(transaction.values.includes("张三服饰 O'Brien 30*38 白袋黑提 100个"));
  assert.ok(transaction.values.some((value) => String(value).includes("wechat-order-conversation-v1")));

  const directQuery = buildSaveOrderDraftTransactionQuery({
    expectedRevision: 1,
    draft: buildDraft({ revision: 1 }),
    inventoryIntents: [buildRestoredShortageIntent()],
    todos: [buildTodo()],
    operationLog,
  });
  assert.match(directQuery.text, /\(SELECT result FROM upserted_draft\)::jsonb/);
  assert.match(directQuery.text, /INSERT INTO inventory_intents/);
  assert.match(directQuery.text, /candidate_json = EXCLUDED\.candidate_json/);
  assert.ok(directQuery.values.includes("库存不足取消-已恢复订购"));
  assert.ok(directQuery.values.some((value) => typeof value === "string" && value.includes("restoredDraftLineIds")));
  assert.ok(directQuery.values.length > 30);

  const listQuery = buildListOrderDraftsQuery();
  assert.deepEqual(listQuery.values, []);
  assert.doesNotMatch(listQuery.text, /WHERE draft\.id/);
}

function buildRestoredShortageIntent() {
  return {
    id: "INT-RESTORE-001",
    sourceDraftId: "DRAFT-001",
    sourceMessageId: "MSG-CANCEL-001",
    conversationId: "GROUP-001",
    customerId: "C001",
    intentType: "shortage_cancellation",
    intentStatus: "库存不足取消-已恢复订购",
    sourceText: "缺货不要了；后来恢复订购",
    candidate: {
      relatedDraftLineIds: [],
      restoredDraftLineIds: ["DRAFT-001-01"],
      restorationHistory: [{ draftLineId: "DRAFT-001-01", restoredBy: "U-OFFICE-A" }],
    },
    cancellationScope: "shortage_lines_only",
    revision: 2,
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-11T08:00:00.000Z",
    updatedAt: "2026-07-11T09:00:00.000Z",
  };
}

function buildDraft(overrides = {}) {
  return {
    id: "DRAFT-001",
    draftId: "DRAFT-001",
    bizNo: "DRAFT-001",
    sourceText: "张三服饰 O'Brien 30*38 白袋黑提 100个",
    sourceChannel: "manual",
    sourceMessageId: "MSG-001",
    customerId: "C001",
    customerName: "张三服饰",
    recognitionContext: {
      version: "wechat-order-conversation-v1",
      sourceMessages: [{ id: "MSG-001", text: "张三服饰 O'Brien 30*38 白袋黑提 100个" }],
      draftGroups: [{ id: "ODG-MSG-001" }],
      nonOrderIntents: [],
      temporaryHolds: [],
      summary: { messageCount: 1, orderRowCount: 1 },
    },
    status: "待审核",
    revision: 0,
    clientRevision: 0,
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-11T08:00:00.000Z",
    updatedAt: "2026-07-11T08:00:00.000Z",
    lines: [
      {
        id: "DRAFT-001-01",
        draftLineId: "DRAFT-001-01",
        customerId: "C001",
        customer: "张三服饰",
        product: "定制袋",
        size: "30*38*10",
        color: "白色",
        handle: "普通提",
        style: "定制印刷",
        print: "是",
        printColor: "黑色",
        printSide: "单面",
        handleColor: "黑色",
        qty: 100,
        fulfillment: "自提",
        latest: "2026-07-12T08:00:00.000Z",
        note: "白袋黑提",
        confidence: "high",
        missingFields: [],
      },
    ],
    ...overrides,
  };
}

function buildTodo() {
  return {
    id: "T-DRAFT-001",
    bizNo: "T-DRAFT-001",
    type: "订单草稿待确认",
    refType: "order_draft",
    refId: "DRAFT-001",
    ref: "DRAFT-001",
    priority: "普通",
    status: "未处理",
    summary: "1 行草稿需要补充信息",
    dueAt: "2026-07-12T08:00:00.000Z",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-11T08:00:00.000Z",
  };
}

function buildOperationLog(id) {
  return {
    id,
    targetType: "order_draft",
    targetId: "DRAFT-001",
    action: "save_order_draft",
    before: {},
    after: { status: "待补充信息" },
    reason: "repository check",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-11T08:00:00.000Z",
    createdAt: "2026-07-11T08:00:00.000Z",
  };
}
