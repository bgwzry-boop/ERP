import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createApiServer } from "../server/apiServer.mjs";
import { closeSharedPostgresPools } from "../server/postgresPoolClient.mjs";
import { getTestServerBaseUrl, listenTestServer, requestJson } from "./helpers/apiIntegrationTestHarness.mjs";
import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";
import { mapApiOrderLineToLocal } from "../src/services/officeOrderPoolApiClient.js";
import { mapApiFulfillmentToLocal } from "../src/services/officeFulfillmentSelectors.js";
import { buildStockPickingSlip, selectConfirmedStockLines } from "../src/domain/stockPickingSlip.js";

const runtime = await startLivePostgres();
let pool;
try {
  const databaseUrl = runtime.resolveLiveDatabaseUrl();
  pool = new pg.Pool({ connectionString: databaseUrl, statement_timeout: 15000 });
  const query = async (sql, values = []) => (await pool.query(sql, values)).rows;
  await query("INSERT INTO customers(id,biz_no,name,short_name,settlement_cycle,created_by) VALUES('C-PARTIAL','C-PARTIAL','黄松','黄松','现结','U-OFFICE-A')");
  await query("UPDATE standard_colors SET enabled=false WHERE name='红色' AND id<>'SC-RED'");
  const insertStock = async (id, inStock, reserved = 0, locked = 0, pending = 0) => query(
    `INSERT INTO inventory_items(id,inventory_key,size,standard_color_id,handle_type,style,zone,inventory_state,
      on_hand_qty,reserved_qty,waiting_pickup_locked_qty,pending_handling_qty,trust_level)
      VALUES($1,$1,'30*37*10','SC-RED','普通提','空白袋',$1,'现货',$2,$3,$4,$5,'隔离合成')`, [id, inStock, reserved, locked, pending],
  );
  await insertStock("BIN-A", 360, 20, 30, 10); // 300可用
  await insertStock("BIN-B", 340, 15, 12, 13); // 300可用
  const server = createApiServer({
    runtimeMode: "test", seedSource: "synthetic", applyProductionEnvFile: false,
    runtimeStorageRoot: runtime.storageRoot, v1PersistenceDatabaseUrl: databaseUrl,
    v1PersistenceProfile: { repositoryMode: "postgres" }, authMode: "prototype",
    authSecret: randomBytes(32).toString("hex"), fixedPreviewUserId: "U-MANAGER-A",
    allowLegacyIdentityHeaders: false, allowActionPermissionOverride: false, allowDefaultSeedUser: false,
    phoneRegistrationEnabled: false, firstReleaseScope: null,
  });
  runtime.server = server;
  await server.ready;
  await listenTestServer(server);
  const origin = getTestServerBaseUrl(server);
  const { body: login } = await requestJson(origin, "/api/auth/prototype-login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "U-MANAGER-A" }), expectedStatus: 200,
  });
  const api = (path, data, expectedStatus = 200) => requestJson(origin, `/api${path}`, {
    method: data ? "POST" : "GET",
    headers: { "content-type": "application/json", authorization: `Bearer ${login.session.accessToken}` },
    ...(data ? { body: JSON.stringify(data) } : {}), expectedStatus, timeoutMs: 20000,
  }).then(result => result.body);
  async function quoteOrder(key, quantity) {
    const recognized = await api("/order-drafts/recognize", {
      sourceText: `3037 红 ${quantity} 个 黄松`, idempotencyKey: `recognize-${key}`,
    });
    assert.equal(recognized.lines.length, 1);
    const lines = recognized.lines.map(line => ({
      ...line, fulfillmentMethod: "自提", latestNeededAt: "2099-07-12",
    }));
    const draftId = recognized.draft.draftId;
    const { quote } = await api(`/order-drafts/${draftId}/price-quote`, {
      lines, expectedRevision: recognized.draft.clientRevision, idempotencyKey: `quote-${key}`,
    });
    assert.equal(quote.lines[0].chargeableQty, quantity);
    return { draftId, quote, lines };
  }
  const confirmBody = ({ quote, lines }, key, choice) => ({
    expectedRevision: quote.clientRevision, lines, pricingQuoteId: quote.quoteId,
    idempotencyKey: `confirm-${key}`, shortageDecision: { choice, note: "隔离回归已确认" },
  });
  const confirm = (draft, body, status) => api(`/order-drafts/${draft.draftId}/confirm`, body, status);
  const linesFor = id => query(
    `SELECT l.id,l.order_id,l.original_qty,l.line_status,l.split_from_order_line_id,
      p.bag_price,p.final_amount,p.source_evidence_json,
      f.id AS fulfillment_id,f.expected_qty,f.status AS fulfillment_status
    FROM order_lines l JOIN price_snapshots p ON p.order_line_id=l.id
      JOIN fulfillment_records f ON f.order_line_id=l.id
    WHERE l.order_id=$1 ORDER BY l.split_from_order_line_id NULLS FIRST`, [id],
  );
  const reservationsFor = id => query(
    `SELECT r.order_line_id,r.inventory_item_id,r.reserved_qty FROM inventory_reservations r
      INNER JOIN order_lines l ON l.id=r.order_line_id WHERE l.order_id=$1 ORDER BY r.inventory_item_id`, [id],
  );
  const partial = await quoteOrder("partial", 1000);
  const { stockQty, shortageQty } = partial.quote.stockChecks[0];
  assert.deepEqual([stockQty, shortageQty], [600,400], "报价回执给出完整库位合计");
  const unresolved = await confirm(partial, confirmBody(partial, "no-choice", ""), 409);
  assert.equal(unresolved.code, "ORDER_SHORTAGE_DECISION_REQUIRED");
  const body = confirmBody(partial, "partial", "split_produce");
  const result = await confirm(partial, body);
  assert.deepEqual(await confirm(partial, body), result, "同一确认只生成一张原单");
  const [stock, production] = await linesFor(result.orderId);
  assert.deepEqual([stock.original_qty, production.original_qty], [600, 400]);
  assert.equal(production.split_from_order_line_id, stock.id);
  assert.equal(production.order_id, stock.order_id);
  assert.notEqual(production.fulfillment_id, stock.fulfillment_id);
  assert.deepEqual([stock.expected_qty, production.expected_qty], [600, 400]);
  assert.deepEqual([stock.fulfillment_status, production.fulfillment_status], ["待出库", "待生产"]);
  const { items: poolRows } = await api("/order-lines?customerId=C-PARTIAL");
  const orderLines = poolRows.map(mapApiOrderLineToLocal);
  const { items: deliveryRows } = await api("/fulfillments?customerId=C-PARTIAL");
  const fulfillments = deliveryRows.map(mapApiFulfillmentToLocal);
  const confirmedStock = selectConfirmedStockLines({ poolLines: orderLines, confirmedLineIds: [stock.id, production.id] });
  assert.equal(confirmedStock.pending, false);
  const orderEntrySlip = buildStockPickingSlip({ orderLines: confirmedStock.lines });
  const deliverySlip = buildStockPickingSlip({ orderLines, fulfillments });
  for (const slip of [orderEntrySlip, deliverySlip]) {
    assert.deepEqual(slip.items.map(item => [item.orderLineId, item.qty]), [[stock.id, 600]]);
    assert.equal(slip.method, "自提");
  }
  const frozenPrice = partial.quote.lines[0];
  assert.equal(Number(stock.bag_price), frozenPrice.bagPrice);
  assert.equal(Number(production.bag_price), frozenPrice.bagPrice);
  assert.equal(Math.round((Number(stock.final_amount) + Number(production.final_amount))*100), Math.round(frozenPrice.amount*100));
  assert.equal(production.source_evidence_json.stockShortageAllocation.sourceOrderLineId, stock.id);
  assert.deepEqual(await query("SELECT order_line_id,planned_qty FROM production_tasks WHERE order_line_id=ANY($1)", [[stock.id, production.id]]),
    [{ order_line_id: production.id, planned_qty: 400 }]);
  assert.deepEqual(await reservationsFor(result.orderId), [
    { order_line_id: stock.id, inventory_item_id: "BIN-A", reserved_qty: 300 },
    { order_line_id: stock.id, inventory_item_id: "BIN-B", reserved_qty: 300 },
  ]);
  const [record] = await query("SELECT recognition_summary FROM order_drafts WHERE id=$1", [partial.draftId]);
  assert.equal(record.recognition_summary.recognitionContext.shortageDecision.choice, "split_produce");
  await query("UPDATE order_lines SET line_status='制袋中',revision=revision+1 WHERE id=$1", [production.id]);
  const group = await api(`/packing-groups?fulfillmentId=${stock.fulfillment_id}`);
  assert.deepEqual(group.lines.map(line => line.orderLineId), [stock.id], "先到的现货可以独立打包，制袋中批次不会进组");

  await insertStock("BIN-C", 500);
  const ship = await quoteOrder("ship", 800);
  const shipResult = await confirm(ship, confirmBody(ship, "ship", "ship_available"));
  const kept = await linesFor(shipResult.orderId);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].original_qty, 500);
  assert.equal(kept[0].source_evidence_json.stockShortageAllocation.cancelledQty, 300);
  assert.equal(Number(kept[0].final_amount), Math.round(ship.quote.lines[0].amount * 500 / 800 * 100) / 100);
  assert.equal((await query("SELECT id FROM production_tasks WHERE order_line_id=$1", [kept[0].id])).length, 0);

  await insertStock("BIN-D", 100);
  await insertStock("BIN-E", 1000);
  const whole = await quoteOrder("whole-zone", 1000);
  assert.equal(whole.quote.stockChecks[0].inventory, "可用", "库位A较少不应提前提示缺货");
  const wholeResult = await confirm(whole, confirmBody(whole, "whole-zone", ""));
  assert.deepEqual((await reservationsFor(wholeResult.orderId)).map(r => [r.inventory_item_id,r.reserved_qty]), [["BIN-E",1000]]);
  const wholeLines = await linesFor(wholeResult.orderId);
  assert.equal(wholeLines.length, 1);
  const wholeDetail = await api(`/order-lines/${encodeURIComponent(wholeLines[0].id)}`);
  const wholeSlip = buildStockPickingSlip({ orderLines: [mapApiOrderLineToLocal(wholeDetail.orderLine)] });
  assert.equal(wholeSlip.method, "自提");
  assert.equal(wholeSlip.totalQty, 1000, "正常整单自提仍可打备货小票");

  await insertStock("BIN-F", 200);
  const splitDraft = await api("/order-drafts/recognize", {
    sourceText: "黄松 3037 红200个 明天自提\n3037 红200个 后天自提",
    idempotencyKey: "recognize-split-shared",
  });
  assert.equal(splitDraft.lines.length, 2);
  const [firstSplitLine, secondSplitLine] = splitDraft.lines;
  const splitLines = [
    { ...firstSplitLine, fulfillmentMethod: "自提", latestNeededAt: "2099-07-12" },
    { ...secondSplitLine, fulfillmentMethod: "自提", latestNeededAt: "2099-07-13" },
  ];
  const splitBase = `/order-drafts/${splitDraft.draft.draftId}`;
  const splitQuote = (await api(`${splitBase}/price-quote`, {
    lines: splitLines, expectedRevision: splitDraft.draft.clientRevision, idempotencyKey: "quote-split-shared",
  })).quote;
  const splitInput = { lines: splitLines, expectedRevision: splitQuote.clientRevision };
  const splitPlan = (await api(`${splitBase}/split-preview`, splitInput)).splitPlan;
  assert.equal(splitPlan.groups.length, 2);
  const splitResult = await api(`${splitBase}/split-confirm`, {
    ...splitInput, pricingQuoteId: splitQuote.quoteId, splitPlanHash: splitPlan.planHash, idempotencyKey: "confirm-split-shared",
    shortageDecision: { choice: "split_produce", note: "隔离回归已确认" },
  });
  assert.deepEqual(splitResult.orderIds.length, 2);
  const splitOrders = await Promise.all(splitResult.orderIds.map(linesFor));
  assert.deepEqual(splitOrders.map(rows => rows.map(row => row.original_qty)).sort((a, b) => a.length-b.length),
    [[200], [100,100]], "拆单交付组共享整份草稿的300个可用量");
  assert.equal(splitOrders.flat().reduce((sum, line) => sum + Math.round(Number(line.final_amount)*100), 0),
    splitQuote.lines.reduce((sum, line) => sum + Math.round(line.amount*100), 0));

  await insertStock("BIN-G", 180);
  const [concurrentA, concurrentB] = await Promise.all([quoteOrder("concurrent-a", 120), quoteOrder("concurrent-b", 120)]);
  const confirmRace = async (draft, key) => requestJson(origin, `/api/order-drafts/${draft.draftId}/confirm`, {
    method: "POST", timeoutMs: 20000,
    headers: { "content-type": "application/json", authorization: `Bearer ${login.session.accessToken}` },
    body: JSON.stringify(confirmBody(draft, key, "split_produce")),
  });
  // Hold the real database row while both requests read the same stock snapshot.
  const lock = await pool.connect();
  let race, concurrentResults;
  try {
    await lock.query("BEGIN");
    await lock.query("SELECT id FROM inventory_items WHERE id='BIN-G' FOR UPDATE");
    race = Promise.all([confirmRace(concurrentA, "concurrent-a"), confirmRace(concurrentB, "concurrent-b")]);
    await awaitLockWaiters(query, 2);
  } finally {
    await lock.query("ROLLBACK");
    lock.release();
    if (race) concurrentResults = await race;
  }
  assert.deepEqual(concurrentResults.map(response => response.status).sort(), [200,409], "并发看到旧库存时只确认一次");
  const failure = concurrentResults.findIndex(response => response.status === 409);
  assert.equal(concurrentResults[failure].body.code, "BUSINESS_WRITE_CONFLICT");
  const retryDraft = [concurrentA, concurrentB][failure];
  const retryResult = await confirm(retryDraft, confirmBody(retryDraft, "concurrent-retry", "split_produce"));
  assert.deepEqual((await linesFor(retryResult.orderId)).map(row => row.original_qty), [60,60]);
  assert.deepEqual(await query("SELECT on_hand_qty,reserved_qty FROM inventory_items WHERE id='BIN-G'"),
    [{ on_hand_qty: 180, reserved_qty: 180 }]);
  const ledger = await query(`SELECT qty_before,qty_after FROM inventory_ledger_entries WHERE inventory_item_id='BIN-G'
    ORDER BY occurred_at`);
  assert.deepEqual(ledger.map(row => [row.qty_before,row.qty_after]), [[0,120],[120,180]]);

  console.log("Formal signed API and isolated PostgreSQL: partial shortage 600/400, both picking-slip paths and ordinary pickup, independent packing, original price conservation, multi-bin reserves, ship-available cancellation, split-group competition, and concurrent rollback passed.");
} finally {
  await pool?.end();
  await closeSharedPostgresPools();
  await stopLivePostgres(runtime);
}


async function awaitLockWaiters(query, needed) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [{ count }] = await query(`SELECT count(*)::int FROM pg_stat_activity
      WHERE datname=current_database() AND wait_event_type='Lock'
        AND (query LIKE '%locked_order_draft%' OR query LIKE '%pg_advisory_xact_lock%')`);
    if (count >= needed) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail("并发请求未同时等待库存行锁");
}
