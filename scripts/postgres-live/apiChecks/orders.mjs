import assert from "node:assert/strict";
import { postgresAssertions } from "../assertions.mjs";
import { createPostgresOrderDraftRepository } from "../../../server/orderDraftRepository.mjs";
import { orderConversationCorpus } from "../../../shared/orderConversationCorpus.mjs";

export async function checkOrderApi({
  baseUrl, headers, queryJson, runPsql, sqlLiteral,
  postJson, getJson, patchJson, assertPostgresOperationLogOperator,
}) {
  const queueCorpus = orderConversationCorpus[0];
  const queueRequest = {
    sourceMessages: queueCorpus.messages,
    currentDraftStatus: queueCorpus.options.currentDraftStatus,
    idempotencyKey: "order-draft-queue-postgres-live-001",
  };
  const queuedDrafts = await postJson(baseUrl, "/api/order-draft-queues/recognize", queueRequest, { headers });
  postgresAssertions.assertQueuedDrafts({ queuedDrafts });
  const reviewLine = queuedDrafts.drafts
    .flatMap((item) => item.lines)
    .find((line) => line.recognitionEvidence?.fieldReviews?.some((review) => review.field === "size"));
  assert.equal(reviewLine?.recognitionEvidence.fieldReviews[0].status, "pending");
  const queuedDraftReplay = await postJson(baseUrl, "/api/order-draft-queues/recognize", queueRequest, { headers });
  assert.deepEqual(
    queuedDraftReplay.drafts.map((item) => item.draft.draftId),
    queuedDrafts.drafts.map((item) => item.draft.draftId),
  );
  assert.equal(
    Number(runPsql(
      `SELECT COUNT(*) FROM order_drafts
       WHERE recognition_summary->'recognitionContext'->>'queueBatchId' = '${queuedDrafts.queueBatch.batchId}';`,
      { capture: true },
    ).trim()),
    5,
  );
  assert.equal(
    Number(runPsql(
      `SELECT COUNT(*) FROM order_draft_lines AS line
       JOIN order_drafts AS draft ON draft.id = line.order_draft_id
       WHERE draft.recognition_summary->'recognitionContext'->>'queueBatchId' = '${queuedDrafts.queueBatch.batchId}'
         AND line.evidence_json->'fieldReviews' @> '[{"field":"size","status":"pending"}]'::jsonb;`,
      { capture: true },
    ).trim()),
    1,
  );
  const queuedDraftList = await getJson(
    baseUrl,
    `/api/order-drafts?queueOnly=true&queueBatchId=${encodeURIComponent(queuedDrafts.queueBatch.batchId)}&pageSize=20`,
    { headers },
  );
  postgresAssertions.assertQueuedDraftList({ queuedDraftList });

  const queuedOrderDrafts = queuedDrafts.drafts.filter((item) => item.kind === "order_draft");
  const crossDraftTarget = queuedOrderDrafts[0];
  const crossDraftSource = queuedOrderDrafts[1];
  const crossDraftIntent = crossDraftSource.inventoryIntents.find((intent) => intent.intentType === "shortage_cancellation");
  const crossDraftTargetLine = crossDraftTarget.lines[0];
  const linkedCrossDraftCancellation = await postJson(
    baseUrl,
    `/api/order-drafts/${encodeURIComponent(crossDraftTarget.draft.draftId)}/cross-draft-shortage-cancellation`,
    {
      clientRevision: crossDraftTarget.draft.clientRevision,
      draftLineId: crossDraftTargetLine.draftLineId,
      intentId: crossDraftIntent.intentId,
      reason: "办公室核对来源消息后关联到当前草稿明细",
      idempotencyKey: "postgres-live-cross-draft-cancel-001",
    },
    { headers },
  );
  assert.equal(linkedCrossDraftCancellation.line.recognitionEvidence.excludedFromConfirmation, true);
  assert.equal(linkedCrossDraftCancellation.inventoryIntent.sourceDraftId, crossDraftSource.draft.draftId);
  assert.deepEqual(
    queryJson(`SELECT json_build_object(
      'sourceDraftId', intent.source_draft_id,
      'targetDraftId', intent.candidate_json->>'targetDraftId',
      'intentStatus', intent.intent_status,
      'lineSourceDraftId', line.evidence_json->'crossDraftCancellation'->>'sourceDraftId',
      'excluded', line.evidence_json->>'excludedFromConfirmation',
      'operatorId', log.operator_id
    ) AS result
    FROM inventory_intents AS intent
    JOIN order_draft_lines AS line ON line.order_draft_id = '${crossDraftTarget.draft.draftId}' AND line.id = '${crossDraftTargetLine.draftLineId}'
    JOIN operation_logs AS log ON log.target_id = '${crossDraftTarget.draft.draftId}' AND log.action = 'link_cross_draft_shortage_cancellation'
    WHERE intent.id = '${crossDraftIntent.intentId}';`),
    {
      sourceDraftId: crossDraftSource.draft.draftId,
      targetDraftId: crossDraftTarget.draft.draftId,
      intentStatus: "库存不足取消-已关联跨草稿明细",
      lineSourceDraftId: crossDraftSource.draft.draftId,
      excluded: "true",
      operatorId: "U-OFFICE-A",
    },
  );

  const restorableCancellationDraft = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      draftId: "DRAFT-LIVE-RESTORE-CANCEL-001",
      sourceMessages: [
        {
          id: "MSG-LIVE-RESTORE-ORDER-001",
          conversationId: "GROUP-LIVE-RESTORE-001",
          customerId: "C001",
          sender: "张三服饰",
          senderRole: "customer",
          sentAt: "2099-07-12 09:20",
          text: "30*38 红色10个 明天自提",
        },
        {
          id: "MSG-LIVE-RESTORE-CANCEL-001",
          conversationId: "GROUP-LIVE-RESTORE-001",
          customerId: "C001",
          sender: "张三服饰",
          senderRole: "customer",
          sentAt: "2099-07-12 09:21",
          text: "红色缺货不要了",
        },
      ],
      customerId: "C001",
      idempotencyKey: "postgres-live-restore-cancel-recognize-001",
    },
    { headers },
  );
  const restorableLine = restorableCancellationDraft.lines.find(
    (line) => line.recognitionEvidence?.cancellationStatus === "库存不足取消",
  );
  assert.ok(restorableLine);
  const restoredCancellation = await postJson(
    baseUrl,
    "/api/order-drafts/DRAFT-LIVE-RESTORE-CANCEL-001/shortage-cancellation-restore",
    {
      clientRevision: restorableCancellationDraft.draft.clientRevision,
      draftLineId: restorableLine.draftLineId,
      reason: "客户确认恢复订购",
      idempotencyKey: "postgres-live-restore-cancel-001",
    },
    { headers },
  );
  assert.equal(restoredCancellation.draft.clientRevision, 2);
  assert.equal(restoredCancellation.line.recognitionEvidence.cancellationStatus, "");
  assert.equal(restoredCancellation.line.recognitionEvidence.cancellationRestoration.restoredBy, "U-OFFICE-A");
  assert.equal(restoredCancellation.inventoryIntents[0].intentStatus, "库存不足取消-已恢复订购");
  assert.deepEqual(
    queryJson(`SELECT json_build_object(
      'draftStatus', draft.status,
      'draftRevision', draft.revision,
      'intentStatus', intent.intent_status,
      'relatedDraftLineIds', intent.candidate_json->'relatedDraftLineIds',
      'restoredDraftLineIds', intent.candidate_json->'restoredDraftLineIds',
      'restoredBy', line.evidence_json->'cancellationRestoration'->>'restoredBy'
    ) AS result
    FROM order_drafts AS draft
    JOIN inventory_intents AS intent ON intent.source_draft_id = draft.id
    JOIN order_draft_lines AS line ON line.order_draft_id = draft.id
    WHERE draft.id = 'DRAFT-LIVE-RESTORE-CANCEL-001';`),
    {
      draftStatus: "待审核",
      draftRevision: 2,
      intentStatus: "库存不足取消-已恢复订购",
      relatedDraftLineIds: [],
      restoredDraftLineIds: [restorableLine.draftLineId],
      restoredBy: "U-OFFICE-A",
    },
  );

  const afterCutoffHoldDraft = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      draftId: "DRAFT-LIVE-HOLD-AFTER-CUTOFF-001",
      sourceMessages: [{
        id: "MSG-LIVE-HOLD-AFTER-CUTOFF-001",
        conversationId: "GROUP-LIVE-HOLD-AFTER-CUTOFF-001",
        customerId: "C001",
        sender: "张三服饰",
        senderRole: "customer",
        sentAt: "2099-07-12 20:05",
        text: "30*38 红色有的话给我留2个",
      }],
      customerId: "C001",
    },
    { headers },
  );
  const afterCutoffHoldIntent = afterCutoffHoldDraft.inventoryIntents[0];
  assert.equal(afterCutoffHoldIntent.candidate.requiresExpiryReview, true);
  const blockedAfterCutoffHold = await postJson(
    baseUrl,
    `/api/inventory/intents/${afterCutoffHoldIntent.intentId}/hold`,
    {
      clientRevision: afterCutoffHoldIntent.revision,
      candidateIndex: 0,
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      qty: 2,
    },
    { headers, expectedStatus: 409 },
  );
  assert.equal(blockedAfterCutoffHold.code, "TEMPORARY_HOLD_EXPIRY_REVIEW_REQUIRED");
  assert.deepEqual(
    queryJson(`SELECT json_build_object(
      'reservations', (SELECT COUNT(*) FROM inventory_reservations WHERE source_intent_id = '${afterCutoffHoldIntent.intentId}'),
      'ledgers', (SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_id = '${afterCutoffHoldIntent.intentId}'),
      'logs', (SELECT COUNT(*) FROM operation_logs WHERE target_id = '${afterCutoffHoldIntent.intentId}' AND action = 'create_temporary_inventory_hold')
    ) AS result;`),
    { reservations: 0, ledgers: 0, logs: 0 },
  );
  const reviewedAfterCutoffHold = await postJson(
    baseUrl,
    `/api/inventory/intents/${afterCutoffHoldIntent.intentId}/hold`,
    {
      clientRevision: afterCutoffHoldIntent.revision,
      candidateIndex: 0,
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      qty: 2,
      expiresAt: "2099-07-13T19:30:00+08:00",
      reason: "办公室确认19:30后新留货到期时间",
    },
    { headers },
  );
  assert.equal(reviewedAfterCutoffHold.hold.expiresAt, "2099-07-13T11:30:00.000Z");
  await postJson(
    baseUrl,
    `/api/inventory/holds/${reviewedAfterCutoffHold.hold.reservationId}/release`,
    { clientRevision: reviewedAfterCutoffHold.intent.revision, reason: "PostgreSQL live测试释放" },
    { headers },
  );

  const holdDraft = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      draftId: "DRAFT-LIVE-HOLD-001",
      sourceMessages: [{
        id: "MSG-LIVE-HOLD-001",
        conversationId: "GROUP-LIVE-HOLD-001",
        customerId: "C001",
        sender: "张三服饰",
        senderRole: "customer",
        sentAt: "2099-07-12 10:00",
        text: "30*38 红色有的话给我留5个",
      }],
      customerId: "C001",
    },
    { headers },
  );
  assert.equal(holdDraft.inventoryIntents.length, 1);
  const holdIntent = holdDraft.inventoryIntents[0];
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM inventory_intents WHERE id = '" + holdIntent.intentId + "';", { capture: true }).trim()),
    1,
  );
  const temporaryHold = await postJson(
    baseUrl,
    `/api/inventory/intents/${holdIntent.intentId}/hold`,
    {
      clientRevision: holdIntent.revision,
      candidateIndex: 0,
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      qty: 5,
      reason: "PostgreSQL live 临时留货",
    },
    { headers },
  );
  postgresAssertions.assertTemporaryHold({ temporaryHold, holdIntent });
  const reservedAfterHold = Number(
    runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim(),
  );
  assert.deepEqual(
    queryJson(`SELECT json_build_object(
      'type', reservation_type,
      'status', status,
      'sourceIntentId', source_intent_id,
      'inventoryItemId', inventory_item_id,
      'reservedQty', reserved_qty,
      'expiresInFuture', expires_at > now()
    ) AS result FROM inventory_reservations WHERE id = '${temporaryHold.hold.reservationId}';`),
    {
      type: "临时留货",
      status: "生效",
      sourceIntentId: holdIntent.intentId,
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      reservedQty: 5,
      expiresInFuture: true,
    },
  );

  const holdOrderDraft = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      draftId: "DRAFT-LIVE-HOLD-ORDER-001",
      sourceText: "张三服饰 30*38红5个 明天自提",
      customerId: "C001",
    },
    { headers },
  );
  const convertedHoldOrder = await postJson(
    baseUrl,
    "/api/order-drafts/DRAFT-LIVE-HOLD-ORDER-001/confirm",
    {
      draftId: "DRAFT-LIVE-HOLD-ORDER-001",
      sourceText: "张三服饰 30*38红5个 明天自提",
      customerId: "C001",
      clientRevision: holdOrderDraft.draft.clientRevision,
      lines: [{
        draftLineId: "DRAFT-LIVE-HOLD-ORDER-001-01",
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
        sourceHoldId: temporaryHold.hold.reservationId,
        sourceIntentId: holdIntent.intentId,
      }],
    },
    { headers },
  );
  assert.deepEqual(convertedHoldOrder.convertedTemporaryHoldIds, [temporaryHold.hold.reservationId]);
  assert.equal(
    Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()),
    reservedAfterHold,
    "PostgreSQL hold conversion must not reserve inventory twice",
  );
  assert.deepEqual(
    queryJson(`SELECT json_build_object(
      'status', intent_status,
      'orderLineId', related_order_line_id
    ) AS result FROM inventory_intents WHERE id = '${holdIntent.intentId}';`),
    { status: "已转订单", orderLineId: convertedHoldOrder.orderLines[0].id },
  );
  assert.equal(
    queryJson(`SELECT json_build_object(
      'type', reservation_type,
      'status', status,
      'orderLineId', order_line_id,
      'sourceIntentId', source_intent_id
    ) AS result FROM inventory_reservations WHERE id = '${temporaryHold.hold.reservationId}';`).sourceIntentId,
    holdIntent.intentId,
  );

  const releaseHoldDraft = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      draftId: "DRAFT-LIVE-HOLD-RELEASE-001",
      sourceMessages: [{
        id: "MSG-LIVE-HOLD-RELEASE-001",
        conversationId: "GROUP-LIVE-HOLD-RELEASE-001",
        customerId: "C001",
        sender: "张三服饰",
        senderRole: "customer",
        sentAt: "2099-07-12 10:20",
        text: "30*38 红色有的话给我留3个",
      }],
      customerId: "C001",
    },
    { headers },
  );
  const releaseIntent = releaseHoldDraft.inventoryIntents[0];
  const reservedBeforeReleaseHold = Number(
    runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim(),
  );
  const releasableHold = await postJson(
    baseUrl,
    `/api/inventory/intents/${releaseIntent.intentId}/hold`,
    {
      clientRevision: releaseIntent.revision,
      candidateIndex: 0,
      inventoryItemId: "INV-LIVE-CONFIRM-001",
      qty: 3,
      reason: "PostgreSQL release live 留货",
    },
    { headers },
  );
  const extendedHold = await postJson(
    baseUrl,
    `/api/inventory/holds/${releasableHold.hold.reservationId}/extend`,
    {
      clientRevision: releasableHold.intent.revision,
      expiresAt: "2099-07-12T20:30:00+08:00",
      reason: "客户授权延长一小时",
    },
    { headers },
  );
  assert.equal(extendedHold.hold.expiresAt, "2099-07-12T12:30:00.000Z");
  const releasedHold = await postJson(
    baseUrl,
    `/api/inventory/holds/${releasableHold.hold.reservationId}/release`,
    {
      clientRevision: extendedHold.intent.revision,
      reason: "客户取消留货",
    },
    { headers },
  );
  assert.equal(releasedHold.intent.intentStatus, "已取消");
  assert.equal(releasedHold.hold.reservedQty, 0);
  assert.equal(
    Number(runPsql("SELECT reserved_qty FROM inventory_items WHERE id = 'INV-LIVE-CONFIRM-001';", { capture: true }).trim()),
    reservedBeforeReleaseHold,
  );

  const confirmedOrderDraft = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      draftId: "DRAFT-LIVE-ORDER-001",
      sourceText: "张三服饰 30*38红10个 明天自提",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  assert.equal(confirmedOrderDraft.draft.clientRevision, 1);
  const replayedConfirmedOrderDraft = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      draftId: "DRAFT-LIVE-ORDER-001",
      sourceText: "张三服饰 30*38红10个 明天自提",
      operatorId: "U-SPOOFED",
    },
    { headers },
  );
  assert.equal(replayedConfirmedOrderDraft.draft.clientRevision, 1);
  assert.equal(replayedConfirmedOrderDraft.operationLogId, confirmedOrderDraft.operationLogId);
  assertPostgresOperationLogOperator(queryJson, confirmedOrderDraft.operationLogId);
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM order_drafts WHERE id = 'DRAFT-LIVE-ORDER-001';", { capture: true }).trim()),
    1,
  );
  const confirmedOrder = await postJson(
    baseUrl,
    "/api/order-drafts/DRAFT-LIVE-ORDER-001/confirm",
    {
      draftId: "DRAFT-LIVE-ORDER-001",
      sourceText: "张三服饰 30*38红10个 明天自提",
      customerId: "C001",
      operatorId: "U-SPOOFED",
      confirmMode: "confirm_now",
      clientRevision: confirmedOrderDraft.draft.clientRevision,
      lines: [
        {
          draftLineId: "DRAFT-LIVE-ORDER-001-01",
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
  postgresAssertions.assertConfirmedOrder({ confirmedOrder });
  assertPostgresOperationLogOperator(queryJson, confirmedOrder.operationLogIds[0]);
  const coldOrderDraftRepository = createPostgresOrderDraftRepository({ queryJson });
  const coldOrderDraftState = await coldOrderDraftRepository.loadState();
  const coldConfirmedDraft = coldOrderDraftState.orderDrafts.find((draft) => draft.id === "DRAFT-LIVE-ORDER-001");
  postgresAssertions.assertColdConfirmedDraft({ coldConfirmedDraft });
  const staleConfirmedDraftSave = await patchJson(
    baseUrl,
    "/api/order-drafts/DRAFT-LIVE-ORDER-001",
    {
      sourceText: "旧页面不能覆盖已确认草稿",
      customerId: "C001",
      operatorId: "U-SPOOFED",
      clientRevision: 1,
      draftStatus: "待审核",
      lines: [
        {
          draftLineId: "DRAFT-LIVE-ORDER-001-01",
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
    { headers, expectedStatus: 409 },
  );
  assert.equal(staleConfirmedDraftSave.code, "BUSINESS_WRITE_CONFLICT");
  assert.equal((await coldOrderDraftRepository.getOrderDraft({ draftId: "DRAFT-LIVE-ORDER-001" })).revision, 2);
  assert.equal(
    queryJson(
      `SELECT json_build_object('orderId', id, 'customerId', customer_id) AS result FROM original_orders WHERE id = ${sqlLiteral(
        confirmedOrder.orderId,
      )};`,
    ).customerId,
    "C001",
  );
  assert.equal(
    Number(
      runPsql(`SELECT COUNT(*) FROM order_lines WHERE order_id = ${sqlLiteral(confirmedOrder.orderId)};`, {
        capture: true,
      }).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql(`SELECT COUNT(*) FROM price_snapshots WHERE order_line_id = ${sqlLiteral(confirmedOrder.orderLines[0].id)};`, {
        capture: true,
      }).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql(`SELECT COUNT(*) FROM fulfillment_records WHERE order_line_id = ${sqlLiteral(confirmedOrder.orderLines[0].id)};`, {
        capture: true,
      }).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql(`SELECT COUNT(*) FROM inventory_reservations WHERE order_line_id = ${sqlLiteral(confirmedOrder.orderLines[0].id)};`, {
        capture: true,
      }).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql(`SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_id = ${sqlLiteral(confirmedOrder.orderLines[0].id)};`, {
        capture: true,
      }).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1330,
  );

  const apiReleasedReservation = await postJson(
    baseUrl,
    `/api/inventory/reservations/${confirmedOrder.reservations[0].reservationId}/release`,
    {
      releaseQty: 4,
      reason: "manual_release",
      operatorId: "U-OFFICE-A",
      relatedActionId: confirmedOrder.orderLines[0].id,
    },
    { headers },
  );
  assert.equal(apiReleasedReservation.status, "partially_released");
  assert.equal(apiReleasedReservation.qty, 6);
  assert.equal(apiReleasedReservation.releasedQty, 4);
  assert.ok(apiReleasedReservation.ledgerId);
  assert.equal(
    Number(
      runPsql("SELECT reserved_qty FROM inventory_items WHERE id = '30*38*10-红色-普通提-空白袋-A区-30*38';", {
        capture: true,
      }).trim(),
    ),
    1326,
  );
  return { convertedHoldOrder, confirmedOrder };
}
