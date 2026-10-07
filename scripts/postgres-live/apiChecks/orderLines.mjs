import assert from "node:assert/strict";
import { postgresAssertions } from "../assertions.mjs";

export async function checkOrderLineApi(_runtime, { baseUrl, headers, getJson }) {
  const databaseOnlyOrderLineDetail = await getJson(baseUrl, "/api/order-lines/OL-LIVE-CONFIRM-001", { headers });
  postgresAssertions.assertDatabaseOnlyOrderLineDetail({ databaseOnlyOrderLineDetail });
  return { databaseOnlyOrderLineDetail };
}

export async function checkOrderLineMutationsApi(_runtime, {
  baseUrl, headers, postJson, queryJson, runPsql, sqlLiteral, assertPostgresOperationLogOperator,
}) {
  const voidCandidateDraft = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      draftId: "DRAFT-LIVE-VOID-001",
      sourceText: "张三服饰 30*38红5个 明天自提后取消",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  assert.equal(voidCandidateDraft.draft.clientRevision, 1);
  const voidCandidateOrder = await postJson(
    baseUrl,
    "/api/order-drafts/DRAFT-LIVE-VOID-001/confirm",
    {
      draftId: "DRAFT-LIVE-VOID-001",
      sourceText: "张三服饰 30*38红5个 明天自提后取消",
      customerId: "C001",
      operatorId: "U-OFFICE-A",
      confirmMode: "confirm_now",
      clientRevision: voidCandidateDraft.draft.clientRevision,
      lines: [
        {
          draftLineId: "DRAFT-LIVE-VOID-001-01",
          customerId: "C001",
          customer: "张三服饰",
          productName: "空白袋",
          size: "30*38*10",
          bagColor: "红色",
          handleType: "普通提",
          style: "空白袋",
          qty: 5,
          fulfillmentMethod: "自提",
          latestNeededAt: "明天",
          printFlag: false,
        },
      ],
    },
    { headers },
  );
  assert.equal(voidCandidateOrder.reservations.length, 1);
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1325,
  );
  const voidHeaders = { ...headers, "idempotency-key": "live-order-line-void-001" };
  const voidRequestBody = {
    reason: "order_cancelled",
    operatorId: "U-SPOOFED",
  };
  const apiVoidedOrderLine = await postJson(
    baseUrl,
    `/api/order-lines/${voidCandidateOrder.orderLines[0].id}/void`,
    voidRequestBody,
    { headers: voidHeaders },
  );
  postgresAssertions.assertApiVoidedOrderLine({ apiVoidedOrderLine, voidCandidateOrder });
  const replayedApiVoidedOrderLine = await postJson(
    baseUrl,
    `/api/order-lines/${voidCandidateOrder.orderLines[0].id}/void`,
    voidRequestBody,
    { headers: voidHeaders },
  );
  assert.deepEqual(replayedApiVoidedOrderLine, apiVoidedOrderLine);
  const rejectedVoidKeyReuse = await postJson(
    baseUrl,
    `/api/order-lines/${voidCandidateOrder.orderLines[0].id}/void`,
    { ...voidRequestBody, reason: "duplicate_order" },
    { headers: voidHeaders, expectedStatus: 409 },
  );
  assert.equal(rejectedVoidKeyReuse.code, "IDEMPOTENCY_KEY_REUSED");
  assertPostgresOperationLogOperator(queryJson, apiVoidedOrderLine.operationLogId);
  assert.equal(
    queryJson(
      `SELECT json_build_object('lineStatus', line_status, 'voidReason', void_reason) AS result FROM order_lines WHERE id = ${sqlLiteral(
        voidCandidateOrder.orderLines[0].id,
      )};`,
    ).lineStatus,
    "已关闭",
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status) AS result FROM fulfillment_records WHERE id = ${sqlLiteral(
        voidCandidateOrder.fulfillmentTasks[0].fulfillmentId,
      )};`,
    ).status,
    "已取消",
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('status', status, 'reservedQty', reserved_qty) AS result FROM inventory_reservations WHERE id = ${sqlLiteral(
        voidCandidateOrder.reservations[0].reservationId,
      )};`,
    ).status,
    "已释放",
  );
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1320,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type = 'order_line_void' AND source_id = ${sqlLiteral(
          voidCandidateOrder.orderLines[0].id,
        )};`,
        { capture: true },
      ).trim(),
    ),
    1,
  );

  const quantityCandidateDraft = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      draftId: "DRAFT-LIVE-QTY-API-001",
      sourceText: "张三服饰 30*38红10个 明天自提改量",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  assert.equal(quantityCandidateDraft.draft.clientRevision, 1);
  const quantityCandidateOrder = await postJson(
    baseUrl,
    "/api/order-drafts/DRAFT-LIVE-QTY-API-001/confirm",
    {
      draftId: "DRAFT-LIVE-QTY-API-001",
      sourceText: "张三服饰 30*38红10个 明天自提改量",
      customerId: "C001",
      operatorId: "U-OFFICE-A",
      confirmMode: "confirm_now",
      clientRevision: quantityCandidateDraft.draft.clientRevision,
      lines: [
        {
          draftLineId: "DRAFT-LIVE-QTY-API-001-01",
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
        },
      ],
    },
    { headers },
  );
  assert.equal(quantityCandidateOrder.reservations.length, 1);
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1330,
  );
  const decreaseHeaders = { ...headers, "idempotency-key": "live-order-line-qty-decrease-001" };
  const decreaseRequestBody = {
    orderLineId: quantityCandidateOrder.orderLines[0].id,
    newQty: 6,
    reason: "customer_change",
    operatorId: "U-SPOOFED",
  };
  const apiDecreasedOrderLine = await postJson(
    baseUrl,
    `/api/order-lines/${quantityCandidateOrder.orderLines[0].id}/quantity-adjustment`,
    decreaseRequestBody,
    { headers: decreaseHeaders },
  );
  postgresAssertions.assertApiDecreasedOrderLine({ apiDecreasedOrderLine, quantityCandidateOrder });
  const replayedApiDecreasedOrderLine = await postJson(
    baseUrl,
    `/api/order-lines/${quantityCandidateOrder.orderLines[0].id}/quantity-adjustment`,
    decreaseRequestBody,
    { headers: decreaseHeaders },
  );
  assert.deepEqual(replayedApiDecreasedOrderLine, apiDecreasedOrderLine);
  const rejectedQuantityKeyReuse = await postJson(
    baseUrl,
    `/api/order-lines/${quantityCandidateOrder.orderLines[0].id}/quantity-adjustment`,
    { ...decreaseRequestBody, newQty: 7 },
    { headers: decreaseHeaders, expectedStatus: 409 },
  );
  assert.equal(rejectedQuantityKeyReuse.code, "IDEMPOTENCY_KEY_REUSED");
  assertPostgresOperationLogOperator(queryJson, apiDecreasedOrderLine.operationLogId);
  assert.equal(
    queryJson(
      `SELECT json_build_object('originalQty', original_qty) AS result FROM order_lines WHERE id = ${sqlLiteral(
        quantityCandidateOrder.orderLines[0].id,
      )};`,
    ).originalQty,
    6,
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('expectedQty', expected_qty) AS result FROM fulfillment_records WHERE id = ${sqlLiteral(
        quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId,
      )};`,
    ).expectedQty,
    6,
  );
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1326,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT final_amount FROM price_snapshots WHERE id = ${sqlLiteral(apiDecreasedOrderLine.priceSnapshot.priceSnapshotId)};`,
        { capture: true },
      ).trim(),
    ),
    2.04,
  );

  const apiIncreasedOrderLine = await postJson(
    baseUrl,
    `/api/order-lines/${quantityCandidateOrder.orderLines[0].id}/quantity-adjustment`,
    {
      orderLineId: quantityCandidateOrder.orderLines[0].id,
      newQty: 8,
      reason: "customer_change",
      operatorId: "U-SPOOFED",
    },
    { headers: { ...headers, "idempotency-key": "live-order-line-qty-increase-001" } },
  );
  postgresAssertions.assertApiIncreasedOrderLine({ apiIncreasedOrderLine });
  assertPostgresOperationLogOperator(queryJson, apiIncreasedOrderLine.operationLogId);
  assert.equal(
    queryJson(
      `SELECT json_build_object('reservedQty', reserved_qty) AS result FROM inventory_reservations WHERE id = ${sqlLiteral(
        quantityCandidateOrder.reservations[0].reservationId,
      )};`,
    ).reservedQty,
    8,
  );
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1328,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT final_amount FROM price_snapshots WHERE id = ${sqlLiteral(apiIncreasedOrderLine.priceSnapshot.priceSnapshotId)};`,
        { capture: true },
      ).trim(),
    ),
    2.72,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_type = 'order_line_quantity_adjustment' AND source_id = ${sqlLiteral(
          quantityCandidateOrder.orderLines[0].id,
        )};`,
        { capture: true },
      ).trim(),
    ),
    2,
  );
  return { quantityCandidateOrder };
}

export async function checkOrderDraftConcurrencyApi(_runtime, { baseUrl, headers, postJson, queryJson, sqlLiteral }) {
  const concurrentDraftId = "DRAFT-LIVE-CONCURRENT-001";
  const concurrentRecognition = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      draftId: concurrentDraftId,
      sourceText: "张三服饰 30*38白色20个 明天自提",
      operatorId: "U-OFFICE-A",
    },
    { headers: { ...headers, "idempotency-key": "live-concurrent-recognize-001" } },
  );
  assert.equal(concurrentRecognition.draft.clientRevision, 1);
  const concurrentLine = {
    draftLineId: `${concurrentDraftId}-01`,
    customerId: "C001",
    customer: "张三服饰",
    productName: "空白袋",
    size: "30*38*10",
    bagColor: "白色",
    handleType: "普通提",
    style: "空白袋",
    qty: 20,
    fulfillmentMethod: "自提",
    latestNeededAt: "明天",
    printFlag: false,
  };
  const concurrentBody = {
    sourceText: "张三服饰 30*38白色20个 明天自提",
    customerId: "C001",
    operatorId: "U-OFFICE-A",
    clientRevision: 1,
    draftStatus: "待审核",
    lines: [concurrentLine],
  };
  const concurrentResponses = await Promise.all(
    ["live-concurrent-save-a-001", "live-concurrent-save-b-001"].map((idempotencyKey) =>
      fetch(`${baseUrl}/api/order-drafts/${concurrentDraftId}`, {
        method: "PATCH",
        headers: {
          ...headers,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(concurrentBody),
      }),
    ),
  );
  assert.deepEqual(
    concurrentResponses.map((response) => response.status).sort((left, right) => left - right),
    [200, 409],
  );
  const concurrentPayloads = await Promise.all(concurrentResponses.map((response) => response.json()));
  assert.equal(concurrentPayloads.find((payload) => payload.draft)?.draft.clientRevision, 2);
  assert.equal(concurrentPayloads.find((payload) => payload.code)?.code, "BUSINESS_WRITE_CONFLICT");
  assert.equal(
    queryJson(`SELECT json_build_object('revision', revision) AS result FROM order_drafts WHERE id = ${sqlLiteral(concurrentDraftId)};`).revision,
    2,
  );

  return { concurrentDraftId, concurrentBody };
}

export async function checkOrderDraftResumeApi(_runtime, { baseUrl, headers, patchJson, concurrentDraftId, concurrentBody }) {
  const resumedDraft = await patchJson(
    baseUrl,
    `/api/order-drafts/${concurrentDraftId}`,
    { ...concurrentBody, clientRevision: 2, sourceText: "API 重启后继续保存草稿" },
    { headers: { ...headers, "idempotency-key": "live-restart-save-001" } },
  );
  assert.equal(resumedDraft.draft.clientRevision, 3);
}
