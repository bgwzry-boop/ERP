import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createApiServer } from "../server/apiServer.mjs";
import { closeSharedPostgresPools } from "../server/postgresPoolClient.mjs";
import { getTestServerBaseUrl, listenTestServer, requestJson } from "./helpers/apiIntegrationTestHarness.mjs";
import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";

const runtime = await startLivePostgres();
const pool = new pg.Pool({ connectionString: runtime.resolveLiveDatabaseUrl() });
const query = async (sql, values = []) => (await pool.query(sql, values)).rows;
const ids = { delivery: "F-PAPER-FLOW-1", cancel: "F-PAPER-FLOW-2" };
const employee = "EMP-PAPER-WAREHOUSE";
const operator = "U-MANAGER-A";
let sequence = 0;
const key = (operation) => `stock-paper-flow-${operation}-${++sequence}`;

try {
  await query(`
    INSERT INTO employees (id,biz_no,name,role_name,profile_status)
      VALUES ('EMP-PAPER-WAREHOUSE','PAPER-WH','隔离测试库房员','库房','active'),
             ('E2E-MANAGER-001','PAPER-MGR','隔离测试负责人','管理','active');
    UPDATE users SET employee_id='E2E-MANAGER-001' WHERE id='U-MANAGER-A';
    INSERT INTO business_decision_authorizations(id,employee_id,decision_scope,active_from,status,authorization_note)
      VALUES ('AUTH-PAPER-QTY','E2E-MANAGER-001','fulfillment_quantity_variance','2020-01-01','active','隔离测试数量差异授权');
    INSERT INTO inventory_items (id,inventory_key,size,standard_color_id,handle_type,style,zone,inventory_state,
      on_hand_qty,reserved_qty,waiting_pickup_locked_qty,pending_handling_qty,trust_level)
      VALUES ('INV-PAPER-FLOW','paper-flow','40*30*10','SC-RED','普通提','空白袋','模拟备货区','仓库已清点',1000,200,0,0,'已清点');
    INSERT INTO order_lines (id,biz_no,order_id,customer_id,product_name,order_type,size,bag_color,handle_type,
      style,original_qty,fulfillment_method,line_status,created_by)
      SELECT 'OL-PAPER-FLOW-'||n,'OL-PAPER-FLOW-'||n,'ORD-0629-001','C001','空白袋','现货有货','40*30*10','红色','普通提',
      '空白袋',100,'自提','待出库','U-OFFICE-A' FROM generate_series(1,2) n;
    INSERT INTO fulfillment_records (id,biz_no,order_line_id,customer_id,customer_snapshot,method,expected_qty,status,created_by)
      SELECT 'F-PAPER-FLOW-'||n,'F-PAPER-FLOW-'||n,'OL-PAPER-FLOW-'||n,'C001','{"name":"测试客户"}'::jsonb,'自提',100,'待出库','U-OFFICE-A'
      FROM generate_series(1,2) n;
    INSERT INTO inventory_reservations (id,order_line_id,inventory_item_id,reserved_qty,status,created_by)
      SELECT 'RSV-PAPER-FLOW-'||n,'OL-PAPER-FLOW-'||n,'INV-PAPER-FLOW',100,'生效','U-OFFICE-A' FROM generate_series(1,2) n;
    INSERT INTO price_snapshots (id,order_line_id,snapshot_type,version_no,bag_price,chargeable_qty,final_amount,created_by)
      SELECT 'PRICE-PAPER-FLOW-'||n,'OL-PAPER-FLOW-'||n,'confirmation',1,0.43,100,43,'U-OFFICE-A' FROM generate_series(1,2) n;
  `);
  process.env.ERP_E2E_BUSINESS_DECISION_FIXTURES = "true";
  const server = createApiServer({
    runtimeMode: "test", seedSource: "synthetic", applyProductionEnvFile: false,
    runtimeStorageRoot: runtime.storageRoot, v1PersistenceDatabaseUrl: runtime.resolveLiveDatabaseUrl(),
    v1PersistenceProfile: { repositoryMode: "postgres" }, authMode: "prototype",
    authSecret: randomBytes(32).toString("hex"), fixedPreviewUserId: operator,
    allowLegacyIdentityHeaders: false, allowActionPermissionOverride: false, allowDefaultSeedUser: false,
    firstReleaseScope: null,
  });
  runtime.server = server;
  await server.ready;
  await listenTestServer(server);
  const origin = getTestServerBaseUrl(server);
  const json = { "content-type": "application/json" };
  const login = (await requestJson(origin, "/api/auth/prototype-login", {
    method: "POST", headers: json, body: JSON.stringify({ userId: operator }), expectedStatus: 200,
  })).body;
  const headers = { ...json, authorization: `Bearer ${login.session.accessToken}` };
  const get = (path) => requestJson(origin, `/api${path}`, { headers, expectedStatus: 200 }).then(({ body }) => body);
  const post = (path, body, expectedStatus = 200) => requestJson(origin, `/api${path}`, {
    method: "POST", headers, body: JSON.stringify(body), expectedStatus,
  }).then(result => result.body);
  const read = (id) => get(`/fulfillments/${id}`);
  const send = (id, action, body, status) => post(`/fulfillments/${id}/${action}`, body, status);
  const readStock = async () => (await query("SELECT on_hand_qty, reserved_qty FROM inventory_items WHERE id='INV-PAPER-FLOW'"))[0];
  const net = async (id) => (await query("SELECT COALESCE(-SUM(qty_change),0)::int AS qty FROM inventory_ledger_entries WHERE source_id=$1 AND inventory_item_id='INV-PAPER-FLOW'", [id]))[0].qty;
  const billing = async (id) => query("SELECT delivered_qty,chargeable_qty,amount::float AS amount FROM statement_lines WHERE fulfillment_id=$1", [id]);
  const prep = async (id, quantity) => send(id, "stock-preparation", {
    expectedRevision: (await read(id)).revision, preparedQty: quantity, employeeId: employee,
    location: "模拟备货区", note: "按实物清点", idempotencyKey: key("prep"),
  });
  const print = (id, previous, status) => send(id, "print", {
    documentType: "pickup_note", printAction: previous ? "reprint" : "first_print", idempotencyKey: key("print"),
    ...(previous ? { previousPrintRecordId: previous, reprintReason: "按实际数量重打" } : {}),
  }, status);
  const confirmPrint = (job) => post(`/print-jobs/${job}/browser-printed`, {
    confirmed: true, idempotencyKey: key("printed"),
  });
  const pdf = (ids) => fetch(`${origin}/api/print-jobs/note.pdf?ids=${encodeURIComponent(ids.join(","))}`, { headers });
  const assertPrintablePdf = async (job) => {
    const response = await pdf([job]);
    assert.equal(response.status, 200);
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  };
  const paperCommand = async (id, note) => {
    const detail = await read(id);
    const paper = note ?? detail.paperOutboundDocument;
    return { expectedRevision: detail.revision, paperOutboundDocumentId: paper.paperOutboundDocumentId,
      paperDocumentVersion: paper.documentVersion, paperDocumentRevision: paper.revision };
  };
  const execute = async (id, result, actualQty, status = 200) => send(id, "warehouse-execution", {
    ...await paperCommand(id), result, actualQty, physicalExecutorEmployeeId: employee, feedbackChannel: "当面",
    executedAt: new Date().toISOString(), note: "隔离测试按实物清点", idempotencyKey: key("warehouse"),
  }, status);
  async function approve(id, quantity) {
    await execute(id, "数量不符", quantity);
    const result = await send(id, "quantity-variance-resolution", {
      expectedRevision: (await read(id)).revision, resolutionResult: "按实际数量出库",
      reason: "隔离客户同意按实数自提", directDecisionContent: "隔离客户同意按实数自提", idempotencyKey: key("approve"),
    });
    assert.equal(result.quantityVarianceResolution.actualQty, quantity);
  }
  async function correct(id, quantity, status = 200) {
    const body = { expectedRevision: (await read(id)).revision, correctedQty: quantity, reason: "隔离测试更正纸单实数", idempotencyKey: key("correct") };
    const result = await send(id, "note-correction", body, status);
    if (status === 200) {
      assert.equal(result.preDepartureQuantityCorrection, true);
      const replay = await send(id, "note-correction", body);
      assert.equal(replay.operationLogId, result.operationLogId, "same correction returns the original receipt");
      assert.equal(await net(id), quantity, "one net debit matching physical quantity");
      assert.deepEqual(await billing(id), [], "a correction before physical delivery never bills");
    }
    return result;
  }

  await post("/print-devices", { printDeviceId: "PRN-DOT-A", connectionType: "browser_download", settings: { driverMode: "browser_download" }, idempotencyKey: key("device") });
  const { companyPrintProfile } = await get("/print-settings/company-profile");
  await post("/print-settings/company-profile", {
    ...companyPrintProfile, deductStockAtNotePrint: true, expectedRevision: companyPrintProfile.revision, idempotencyKey: key("policy"),
  });

  const id = ids.delivery;
  assert.equal((await read(id)).noteReadiness.ready, false);
  assert.equal((await print(id, null, 409)).code, "FULFILLMENT_NOTE_NOT_READY");
  assert.deepEqual(await readStock(), { on_hand_qty: 1000, reserved_qty: 200 });
  await prep(id, 98);
  assert.equal((await print(id, null, 409)).code, "FULFILLMENT_NOTE_NOT_READY", "counting 98 cannot release a 100-piece formal note");
  await prep(id, 100);
  assert.equal((await read(id)).noteReadiness.ready, true);
  assert.equal(await net(id), 0, "preparation must not write stock movements");
  assert.deepEqual(await billing(id), []);
  const initial = await print(id);
  const initialNoteId = initial.printRecord.printRecordId;
  const initialJobId = initial.printJobId ?? initial.printJob.printJobId;
  await assertPrintablePdf(initialJobId);
  assert.deepEqual(await readStock(), { on_hand_qty: 1000, reserved_qty: 200 }, "queuing does not deduct stock");
  await confirmPrint(initialJobId);
  assert.deepEqual(await readStock(), { on_hand_qty: 900, reserved_qty: 100 });
  const afterPrint = await read(id);
  assert.ok(afterPrint.stockDeductedAt, JSON.stringify({ status: afterPrint.status, actualQty: afterPrint.actualQty, note: afterPrint.stockDeductionNote }));
  assert.equal(await net(id), 100);
  const initialPaper = afterPrint.paperOutboundDocument;

  assert.equal((await correct(id, 90, 409)).code, "NOTE_CORRECTION_VARIANCE_APPROVAL_REQUIRED");
  await approve(id, 90);
  const genericVoid = await post(`/print-records/${initialNoteId}/void`, {
    expectedRevision: (await read(id)).revision, voidReason: "更正数量", idempotencyKey: key("generic-void"),
  }, 409);
  assert.equal(genericVoid.code, "FULFILLMENT_NOTE_CORRECTION_REQUIRED", "ordinary void cannot strand an unreconciled stock deduction");
  const down = await correct(id, 90);
  assert.equal(down.previousPrintRecordId, initialNoteId);
  const audit = await get(`/operation-logs?targetType=fulfillment&targetId=${id}`);
  assert.ok(audit.items.some(row => row.action === "record_stock_preparation" && row.after.stockPreparation.quantity === 100));
  assert.ok(audit.items.some(row => row.id === down.operationLogId && row.action === "correct_fulfillment_note"));
  assert.deepEqual(await readStock(), { on_hand_qty: 910, reserved_qty: 100 });
  assert.equal((await pdf([initialJobId])).status, 409, "the voided paper cannot be printed again");
  await send(id, "paper-handoff", { ...await paperCommand(id, initialPaper), idempotencyKey: key("old-paper") }, 409);
  assert.equal((await print(id, initialNoteId, 409)).code, "FULFILLMENT_NOTE_NOT_READY", "changed quantity requires fresh stock preparation");
  await prep(id, 90);
  const lower = await print(id, initialNoteId);
  assert.equal(Number(lower.printTemplate.fields.totalQuantity), 90);
  assert.equal(Number(lower.printTemplate.fields.totalAmount), 38.7);
  await confirmPrint(lower.printJobId ?? lower.printJob.printJobId);
  assert.equal(await net(id), 90, "reprint after decrease cannot deduct again");

  await approve(id, 95);
  await query("UPDATE inventory_items SET pending_handling_qty=806 WHERE id='INV-PAPER-FLOW'");
  const lowerId = lower.printRecord.printRecordId;
  await correct(id, 95, 409);
  assert.equal(await net(id), 90, "insufficient usable inventory leaves the deduction intact");
  assert.equal((await query("SELECT status FROM print_records WHERE id=$1", [lowerId]))[0].status, "reprinted");
  await query("UPDATE inventory_items SET pending_handling_qty=0 WHERE id='INV-PAPER-FLOW'");
  const up = await correct(id, 95);
  assert.equal(up.previousPrintRecordId, lowerId);
  assert.deepEqual(await readStock(), { on_hand_qty: 905, reserved_qty: 100 });
  await prep(id, 95);
  const higher = await print(id, lowerId);
  assert.equal(Number(higher.printTemplate.fields.totalQuantity), 95);
  assert.equal(Number(higher.printTemplate.fields.totalAmount), 40.85);
  const higherJob = higher.printJobId ?? higher.printJob.printJobId;
  await assertPrintablePdf(higherJob);
  await confirmPrint(higherJob);
  await execute(id, "实物已出库", 95, 409);
  await send(id, "paper-handoff", { ...await paperCommand(id), idempotencyKey: key("handoff") });
  await execute(id, "实物已出库", 95);
  assert.equal(await net(id), 95, "physical outbound cannot deduct again");
  assert.deepEqual(await billing(id), []);
  await send(id, "complete", { expectedRevision: (await read(id)).revision, actualQty: 95, confirmedFinalDelivery: true, idempotencyKey: key("pickup") });
  assert.deepEqual(await billing(id), [{ delivered_qty: 95, chargeable_qty: 95, amount: 40.85 }]);
  assert.deepEqual(await readStock(), { on_hand_qty: 905, reserved_qty: 100 });

  const cancel = ids.cancel;
  await prep(cancel, 100);
  const second = await print(cancel);
  await confirmPrint(second.printJobId ?? second.printJob.printJobId);
  await approve(cancel, 90);
  const cancelCorrection = await correct(cancel, 90);
  await prep(cancel, 90);
  const cancelReplacement = await print(cancel, cancelCorrection.previousPrintRecordId);
  const cancelJob = cancelReplacement.printJobId ?? cancelReplacement.printJob.printJobId;
  await confirmPrint(cancelJob);
  await send(cancel, "cancel", { expectedRevision: (await read(cancel)).revision, reason: "customer_cancelled", idempotencyKey: key("cancel") });
  assert.deepEqual(await readStock(), { on_hand_qty: 905, reserved_qty: 0 }, "cancelling the corrected batch returns only its 90-piece net debit");
  assert.equal(await net(cancel), 0);
  assert.deepEqual(await billing(cancel), []);
  assert.equal((await pdf([cancelJob])).status, 409, "a corrected paper cannot be printed after fulfilment cancellation");
  await send(cancel, "paper-handoff", { ...await paperCommand(cancel), idempotencyKey: key("cancelled-paper") }, 409);
  console.log("PASS signed isolated PostgreSQL: preparation gates formal printing, 100 → 90 → 95 conserves stock, old paper rejected, final 95 billed only at pickup, and cancellation returns net only.");
} finally {
  await pool.end();
  await closeSharedPostgresPools();
  await stopLivePostgres(runtime);
}
