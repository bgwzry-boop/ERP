import assert from "node:assert/strict";

import {
  buildCreateMiniappSubmissionTransaction,
  buildFindMiniappBindingQuery,
  buildListMiniappOrdersQuery,
  createPostgresMiniappRepository,
} from "../server/miniapp/miniappPostgresRepository.mjs";

const input = {
  sourceOrderNo: "WT20260720A1B2C3D4E5",
  bindingId: "BIND-A",
  customerId: "CUSTOMER-A",
  externalSubmissionId: "EXT-001",
  idempotencyScope: "mini_program:BIND-A:orders",
  idempotencyKey: "order-postgres-test-001",
  requestHash: "a".repeat(64),
  rawPayload: {
    customerId: "CUSTOMER-B",
    quote: { amount: 1 },
    lines: [{ clientLineId: "L1", productType: "custom_print", size: "30×37×10", quantity: 500 }],
  },
  normalizedPayload: {
    deliveryMethod: "到厂自提",
    desiredDate: "2026-07-21",
    desiredTime: "13:30",
    addressId: "ADDR-A",
    address: "地址快照",
    packagingPreference: "独立扎包",
    lines: [{
      clientLineId: "L1",
      productType: "custom_print",
      productName: "定制印刷",
      size: "30×37×10",
      colorGroup: "regular",
      colorId: "red",
      color: "红色",
      handleId: "regular",
      handle: "普通提",
      handleColorId: "yellow",
      handleColor: "黄色",
      patternId: "",
      patternName: "",
      quantity: 500,
      artworkToken: "FILE-A",
      sourceLineId: "22222222-2222-4222-8222-222222222222",
      artwork: {
        fileId: "44444444-4444-4444-8444-444444444444",
        fileName: "proof.pdf",
        mimeType: "application/pdf",
        byteSize: 128,
        sha256: "c".repeat(64),
      },
      printContent: "测试印刷",
      printColor: "黑色",
      printColors: ["黑色"],
      printColorCount: 1,
      printSide: "single",
      printSideMode: "single",
      printPositionMode: "factory_standard",
      printPositionNote: "",
      specialRequirements: ["snap_button"],
      specialRequirementNote: "",
    }],
  },
  serverQuote: { amount: 235, priceVersion: "PRICE-V1", authoritative: false, lines: [{ amount: 235 }] },
  inventory: { status: "available", label: "库存充足", lines: [{ status: "available" }] },
  receivedAt: "2026-07-20T06:00:00.000Z",
};

const ids = {
  orderId: "MP20260720TEST000001",
  intakeId: "INTAKE-TEST000001",
  draftId: "DRAFT-MP20260720TEST000001",
  todoId: "TODO-MP20260720TEST000001",
  snapshotId: "SNAP-MP20260720TEST000001",
};

const transaction = buildCreateMiniappSubmissionTransaction(input, ids);
assert.match(transaction.text, /^BEGIN;/);
assert.match(transaction.text, /pg_advisory_xact_lock/);
assert.match(transaction.text, /ERP_MINIAPP_IDEMPOTENCY_CONFLICT/);
assert.match(transaction.text, /INSERT INTO order_drafts/);
assert.match(transaction.text, /INSERT INTO order_draft_lines/);
assert.match(transaction.text, /INSERT INTO todos/);
assert.match(transaction.text, /INSERT INTO order_intake_submissions/);
assert.match(transaction.text, /INSERT INTO order_intake_lines/);
assert.match(transaction.text, /INSERT INTO order_intake_snapshots/);
assert.match(transaction.text, /INSERT INTO miniapp_artwork_transfer_jobs/);
assert.match(transaction.text, /ERP_MINIAPP_ARTWORK_JOB_CONCURRENCY_CONFLICT/);
assert.match(transaction.text, /'draft_created'/);
assert.match(transaction.text, /'待审核'/);
assert.match(transaction.text, /'小程序订单待确认'/);
assert.match(transaction.text, /'structured'/);
assert.match(transaction.text, /COMMIT;$/);
assert.doesNotMatch(transaction.text, /CUSTOMER-B|地址快照|测试印刷|30×37×10/);
assert.ok(transaction.values.includes("CUSTOMER-A"));
assert.ok(transaction.values.includes("CUSTOMER-B") === false, "client customer ID stays only inside parameterized raw JSON");
assert.ok(transaction.values.some((value) => typeof value === "string" && value.includes('"customerId":"CUSTOMER-B"')));
assert.ok(transaction.values.some((value) => typeof value === "string" && value.includes('"normalizedLine"')));

const bindingQuery = buildFindMiniappBindingQuery({ channel: "wechat_mini_program", externalSubjectFingerprint: "b".repeat(64) });
assert.match(bindingQuery.text, /customer_channel_bindings/);
assert.match(bindingQuery.text, /binding\.status = 'active'/);
assert.deepEqual(bindingQuery.values, ["wechat_mini_program", "b".repeat(64)]);

const ordersQuery = buildListMiniappOrdersQuery({ customerId: "CUSTOMER-A", orderId: ids.orderId });
assert.match(ordersQuery.text, /submission\.customer_id = \$1::text/);
assert.match(ordersQuery.text, /submission\.biz_no = \$2::text/);
assert.deepEqual(ordersQuery.values, ["CUSTOMER-A", ids.orderId]);

const calls = [];
const repository = createPostgresMiniappRepository({
  queryJson: async (text, values) => {
    calls.push({ kind: "query", text, values });
    if (/customer_channel_bindings/.test(text)) return { id: "BIND-A", customerId: "CUSTOMER-A", status: "active" };
    return [{ id: ids.orderId, status: "confirming" }];
  },
  transactionJson: async (text, values) => {
    calls.push({ kind: "transaction", text, values });
    return { orderId: ids.orderId, draftId: ids.draftId, status: "confirming", replayed: false };
  },
});

assert.equal((await repository.getActiveBinding("BIND-A")).customerId, "CUSTOMER-A");
assert.equal((await repository.createSubmissionWithDraft(input)).status, "confirming");
assert.equal((await repository.getOrderForCustomer("CUSTOMER-A", ids.orderId)).id, ids.orderId);
assert.equal(calls.filter((call) => call.kind === "transaction").length, 1);

const conflictRepository = createPostgresMiniappRepository({
  queryJson: async () => null,
  transactionJson: async () => { throw new Error("ERP_MINIAPP_IDEMPOTENCY_CONFLICT"); },
});
await assert.rejects(
  () => conflictRepository.createSubmissionWithDraft(input),
  (error) => error.statusCode === 409 && error.code === "IDEMPOTENCY_KEY_REUSED",
);

console.log("Miniapp PostgreSQL repository checks passed: parameterized customer scope and one atomic intake/draft/todo/snapshot transaction are enforced.");
