import assert from "node:assert/strict";
import pg from "pg";
import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresRawMaterialInboundRepository } from "../server/rawMaterialInboundRepository.mjs";
import { createRawMaterialInboundOrchestrator } from "../server/services/rawMaterialInboundOrchestrator.mjs";
import { createPostgresInventoryReservationReleaseTransactionRepository } from "../server/inventoryReservationReleaseTransactionRepository.mjs";
import { createInventoryReservationReleaseCommandService } from "../server/services/inventoryReservationReleaseCommandService.mjs";

// Only a newly created, loopback-bound disposable container is used. No environment DB is accepted.
const runtime = await startLivePostgres();
const pool = new pg.Pool({ connectionString: runtime.resolveLiveDatabaseUrl(), max: 6 });
const client = createPostgresPoolClient({ pool });
const now = "2026-10-23T00:00:00.000Z";
const stock = (id, weightKg = 100) => ({ id, revision: 1, supplierName: "测试无纺布", status: "已贴标/可用库存", rollCount: 1, totalWeightKg: weightKg, unit: "kg", rolls: [{ id: `${id}-01`, weightKg, inventoryStatus: "可用", labelStatus: "已贴标/可用库存" }] });
async function seed(inbounds) {
  for (const item of inbounds) await pool.query("INSERT INTO raw_material_inbounds(id,delivery_note_no,supplier_name,status,payload_json,revision) VALUES ($1,$1,$2,$3,$4::jsonb,$5)", [item.id, item.supplierName, item.status, JSON.stringify(item), item.revision]);
}
const command = (repository) => createRawMaterialInboundOrchestrator(repository, { now: () => new Date(now) });
const input = (workspace, id, action, body, key) => ({ workspace, inboundId: id, actionSlug: action, operatorId: "U-OFFICE-A", body: { expectedRevision: 1, idempotencyKey: key, ...body } });
try {
  // Different receipts finish out of order against a shared workspace. Hold one committed response
  // until the other response is applied, so the stale whole-array rewrite is deterministic.
  const initial = [stock("CACHE-A"), stock("CACHE-B")];
  await seed(initial);
  const workspace = { rawMaterialInbounds: structuredClone(initial), operationLogs: [] };
  let releaseA;
  let announceA;
  const aCommitted = new Promise((resolve) => { announceA = resolve; });
  const aGate = new Promise((resolve) => { releaseA = resolve; });
  const delayedClient = { ...client, async idempotentTransactionJson(request) {
    const saved = await client.idempotentTransactionJson(request);
    if (request.targetId === "CACHE-A") { announceA(); await aGate; }
    return saved;
  } };
  const repo = createPostgresRawMaterialInboundRepository({ postgresClient: delayedClient });
  const a = command(repo).recordInboundAction(input(workspace, "CACHE-A", "issue_to_machine", { rollId: "CACHE-A-01", machineId: "1号机" }, "cache-a-issue"));
  await aCommitted;
  const b = await command(repo).recordInboundAction(input(workspace, "CACHE-B", "issue_to_machine", { rollId: "CACHE-B-01", machineId: "2号机" }, "cache-b-issue"));
  assert.equal(b.error, undefined);
  releaseA();
  assert.equal((await a).error, undefined);
  assert.deepEqual(workspace.rawMaterialInbounds.map((item) => [item.id, item.revision]), [["CACHE-A", 2], ["CACHE-B", 2]]);
  const consumed = await command(repo).recordInboundAction(input(workspace, "CACHE-A", "confirm_consumption", { expectedRevision: 2, rollId: "CACHE-A-01", consumedWeightKg: 20 }, "cache-a-consume"));
  assert.equal(consumed.inbound.revision, 3);
  const historical = await command(repo).recordInboundAction(input(workspace, "CACHE-A", "issue_to_machine", { rollId: "CACHE-A-01", machineId: "1号机" }, "cache-a-issue"));
  assert.equal(historical.inbound.revision, 2, "Replay returns the exact original receipt");
  assert.equal(workspace.rawMaterialInbounds.find((item) => item.id === "CACHE-A").revision, 3, "Replay must retain current state");
  assert.equal(workspace.rawMaterialInbounds.find((item) => item.id === "CACHE-A").rolls[0].weightKg, 80);
  const staleProcess = { rawMaterialInbounds: structuredClone(initial) };
  const freshRepo = createPostgresRawMaterialInboundRepository({ postgresClient: createPostgresPoolClient({ pool }) });
  const secondProcessResult = await command(freshRepo).recordInboundAction(input(staleProcess, "CACHE-A", "confirm_consumption", { expectedRevision: 3, rollId: "CACHE-A-01", consumedWeightKg: 10 }, "cache-a-other-process"));
  assert.equal(secondProcessResult.inbound.revision, 4, "A process with revision 1 must honor the current client/DB revision 3");
  assert.equal(secondProcessResult.inbound.rolls[0].weightKg, 70);


  // The retry's first lookup sees no receipt, then the original request commits.
  // Its later authoritative read must still return the original success, not a false conflict.
  const rawReplayInitial = [stock("RAW-REPLAY")];
  await seed(rawReplayInitial);
  let letRetryReadFinish;
  let announceRetryRead;
  let holdLookup = true;
  const retryReadHeld = new Promise((resolve) => { announceRetryRead = resolve; });
  const retryReadGate = new Promise((resolve) => { letRetryReadFinish = resolve; });
  const heldReplayClient = { ...client, async queryJson(text, values) {
    const result = await client.queryJson(text, values);
    if (holdLookup && text.includes("operation_idempotency_keys") && values.includes("raw-replay-race")) {
      holdLookup = false; announceRetryRead(); await retryReadGate;
    }
    return result;
  } };
  const rawReplayBody = { rollId: "RAW-REPLAY-01", machineId: "1号机" };
  const rawRetryWorkspace = { rawMaterialInbounds: structuredClone(rawReplayInitial) };
  const retried = command(createPostgresRawMaterialInboundRepository({ postgresClient: heldReplayClient })).recordInboundAction(input(rawRetryWorkspace, "RAW-REPLAY", "issue_to_machine", rawReplayBody, "raw-replay-race"));
  await retryReadHeld;
  const original = await command(createPostgresRawMaterialInboundRepository({ postgresClient: client })).recordInboundAction(input({ rawMaterialInbounds: structuredClone(rawReplayInitial) }, "RAW-REPLAY", "issue_to_machine", rawReplayBody, "raw-replay-race"));
  letRetryReadFinish();
  assert.deepEqual(await retried, original);
  assert.equal(rawRetryWorkspace.rawMaterialInbounds[0].revision, 2);

  // Separate repositories and stale independent workspaces emulate two API processes.
  for (const [scenario, rollCount, totalWeightKg, weightKg] of [["COUNT", 1, 200, 100], ["WEIGHT", 2, 100, 60]]) {
    const sourceId = `RETURN-${scenario}`;
    const source = { id: sourceId, revision: 1, supplierName: "测试无纺布", documentDirection: "supplier_return", status: "退货单已复核", rollCount, totalWeightKg, rolls: [] };
    const records = [stock(`STOCK-${scenario}-A`, weightKg), stock(`STOCK-${scenario}-B`, weightKg), source];
    await seed(records);
    const attempts = ["A", "B"].map((suffix) => {
      const independentRepository = createPostgresRawMaterialInboundRepository({ postgresClient: createPostgresPoolClient({ pool }) });
      return command(independentRepository).recordInboundAction(input({ rawMaterialInbounds: structuredClone(records) }, `STOCK-${scenario}-${suffix}`, "stage_supplier_return", { rollId: `STOCK-${scenario}-${suffix}-01`, sourceReturnInboundId: sourceId }, `supplier-return-${scenario}-${suffix}`));
    });
    const results = await Promise.all(attempts);
    assert.equal(results.filter((result) => !result.error).length, 1, `${scenario} cap must admit one physical roll: ${JSON.stringify(results)}`);
    assert.equal(results.find((result) => result.error).statusCode, 409);
    const used = (await pool.query("SELECT count(*)::int count, sum((record->>'weightKg')::numeric)::float8 weight FROM raw_material_inbounds CROSS JOIN LATERAL jsonb_array_elements(COALESCE(payload_json->'rawMaterialSupplierReturnRecords','[]'::jsonb)) record WHERE record->>'sourceReturnInboundId'=$1", [sourceId])).rows[0];
    assert.deepEqual(used, { count: 1, weight: weightKg });
    const untouched = (await pool.query("SELECT count(*)::int count FROM raw_material_inbounds WHERE id=ANY($1) AND revision=1", [[`STOCK-${scenario}-A`, `STOCK-${scenario}-B`]])).rows[0].count;
    assert.equal(untouched, 1, "Losing stock roll and its revision must remain unchanged");
    assert.equal((await pool.query("SELECT count(*)::int count FROM operation_logs WHERE target_id=ANY($1) AND action='stage_supplier_return'", [[`STOCK-${scenario}-A`, `STOCK-${scenario}-B`]])).rows[0].count, 1);
  }

  const service = createInventoryReservationReleaseCommandService({
    findInventoryItem: (ws, id) => ws.inventories.find((row) => row.id === id),
    findInventoryReservation: (ws, id) => ws.inventoryReservations.find((row) => row.id === id),
    nextPlainId: (prefix, value) => `${prefix}-${value}`,
    buildOperationLog: (ws, value) => ({ ...value, id: `LOG-${value.targetId}-${ws.operationLogs.length + 1}`, occurredAt: now, createdAt: now, pageKey: "api" }),
  });
  async function releaseWorkspace(scenario) {
    const inventoryItemId = `INV-P1-${scenario}`;
    await pool.query("INSERT INTO inventory_items (id, inventory_key, size, standard_color_id, handle_type, style, zone, inventory_state, on_hand_qty, reserved_qty, trust_level) VALUES ($1,$1,'30*38*10','SC-WHITE','普通提','空白袋',$1,'仓库已清点',1000,200,'已清点')", [inventoryItemId]);
    const reservations = ["A", "B"].map((suffix) => ({ id: `RSV-P1-${scenario}-${suffix}`, reservationId: `RSV-P1-${scenario}-${suffix}`, inventoryItemId, orderLineId: "ORD-0629-001-01", reservedQty: 100, reservationType: "出库占用", status: "生效", createdBy: "U-OFFICE-A", createdAt: now }));
    for (const row of reservations) await pool.query("INSERT INTO inventory_reservations(id,order_line_id,inventory_item_id,reserved_qty,reservation_type,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)", [row.id, row.orderLineId, row.inventoryItemId, row.reservedQty, row.reservationType, row.status, row.createdBy]);
    return { inventories: [{ id: inventoryItemId, reserved: 200 }], inventoryReservations: reservations, inventoryLedgers: [], operationLogs: [] };
  }
  const concurrent = await releaseWorkspace("DISTINCT");
  const attempts = ["first", "second"].map((suffix) => {
    const isolated = structuredClone(concurrent);
    isolated.inventoryReservationReleaseTransactionRepository = createPostgresInventoryReservationReleaseTransactionRepository({ postgresClient: createPostgresPoolClient({ pool }) });
    return service.releaseReservation({ workspace: isolated, reservationId: "RSV-P1-DISTINCT-A", body: { releaseQty: 100, idempotencyKey: `release-${suffix}` }, operatorId: "U-OFFICE-A" });
  });
  const releases = await Promise.allSettled(attempts);
  assert.equal(releases.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(releases.find((result) => result.status === "rejected").reason.statusCode, 409);
  assert.equal((await pool.query("SELECT reserved_qty FROM inventory_items WHERE id='INV-P1-DISTINCT'")).rows[0].reserved_qty, 100);
  assert.equal((await pool.query("SELECT reserved_qty FROM inventory_reservations WHERE id='RSV-P1-DISTINCT-B'")).rows[0].reserved_qty, 100);
  assert.equal((await pool.query("SELECT count(*)::int count FROM inventory_ledger_entries WHERE source_id='RSV-P1-DISTINCT-A'")).rows[0].count, 1);

  const replayWorkspace = await releaseWorkspace("REPLAY");
  let replayReads = 0;
  let releaseReplayReads;
  const replayReadGate = new Promise((resolve) => { releaseReplayReads = resolve; });
  const simultaneousReplayClient = { ...client, async queryJson(text, values) {
    const result = await client.queryJson(text, values);
    if (text.includes("operation_idempotency_keys") && values.includes("release-same-key") && replayReads < 2) {
      replayReads += 1;
      if (replayReads === 2) releaseReplayReads();
      await replayReadGate;
    }
    return result;
  } };
  replayWorkspace.inventoryReservationReleaseTransactionRepository = createPostgresInventoryReservationReleaseTransactionRepository({ postgresClient: simultaneousReplayClient });
  const replayInput = { workspace: replayWorkspace, reservationId: "RSV-P1-REPLAY-A", body: { releaseQty: 50, idempotencyKey: "release-same-key" }, operatorId: "U-OFFICE-A" };
  const replays = await Promise.all([service.releaseReservation(replayInput), service.releaseReservation(replayInput)]);
  assert.deepEqual(replays[0], replays[1]);
  assert.equal(replayWorkspace.inventories[0].reserved, 150, "Concurrent same-key replay cannot apply a second cache delta");
  assert.equal((await pool.query("SELECT reserved_qty FROM inventory_items WHERE id='INV-P1-REPLAY'")).rows[0].reserved_qty, 150);
  assert.equal((await pool.query("SELECT count(*)::int count FROM inventory_ledger_entries WHERE source_id='RSV-P1-REPLAY-A'")).rows[0].count, 1);
  const later = await service.releaseReservation({ ...replayInput, body: { releaseQty: 50, idempotencyKey: "release-remainder" } });
  assert.equal(later.response.qty, 0);
  assert.deepEqual(await service.releaseReservation(replayInput), replays[0]);
  assert.equal(replayWorkspace.inventories[0].reserved, 100);
  await assert.rejects(service.releaseReservation({ ...replayInput, body: { ...replayInput.body, releaseQty: 51 } }), { code: "IDEMPOTENCY_KEY_REUSED" });
  console.log("P1 material/inventory PostgreSQL passed: migrated disposable DB; delayed different-receipt commits and old replay; independent-repository shared return count/weight caps with rollback; duplicate release conservation, exact replay and immutable one-ledger evidence.");
} finally {
  await pool.end();
  await stopLivePostgres(runtime);
}
