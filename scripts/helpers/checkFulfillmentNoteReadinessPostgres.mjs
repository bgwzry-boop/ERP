import { queuedNoteError } from "../../server/services/queuedFulfillmentNoteReadiness.mjs";
import assert from "node:assert/strict";

// Run alongside the stock/correction contracts, in their disposable PG database.
export async function checkFulfillmentNoteReadinessPostgres({ pool, services, prepare }) {
  const command = services.fulfillmentPrintCommandService;
  const fulfillmentId = "F008", line = "ORD-0629-022-01";
  let sequence = 0;
  const print = async (workspace, options = {}, batchId = fulfillmentId) => command.printFulfillment({ workspace: workspace ?? await prepare(),
    fulfillmentId: batchId, operatorId: "U-OFFICE-A", body: { documentType: "delivery_note", idempotencyKey: `note-readiness-${++sequence}`, ...options } });
  const denied = async (reason, options) => {
    const result = await print(undefined, options);
    assert.equal(result.code, "FULFILLMENT_NOTE_NOT_READY", JSON.stringify(result));
    assert.equal(result.statusCode, 409);
    assert.match(result.message, reason);
  };
  const jobCount = async () => Number((await pool.query("SELECT count(*) FROM print_jobs WHERE target_type='fulfillment' AND target_id=$1", [fulfillmentId])).rows[0].count);
  const initialJobs = await jobCount();

  // Historical F008 says 3000 in actual_qty and even has six packages, but its order is still in silk screen.
  await denied(/完.*制袋/u);
  await denied(/完.*制袋/u, { printAction: "preview", warehouseStockConfirmation: { confirmedBy: "测试" } });
  await pool.query("UPDATE order_lines SET order_type='特殊尺寸空白袋',print_flag=false, line_status='制袋中' WHERE id=$1", [line]);
  await denied(/完.*制袋/u);
  await pool.query("UPDATE order_lines SET order_type='现货有货',line_status='待出库' WHERE id=$1", [line]);
  await pool.query("INSERT INTO production_tasks(id,biz_no,order_line_id,task_type,planned_qty,task_status) VALUES ('PT-NR','PT-NR',$1,'制袋',3000,'制袋中')", [line]);
  await denied(/完.*制袋/u); // shortage routed to production
  await pool.query("UPDATE order_lines SET fulfillment_method='补库入库' WHERE id=$1", [line]);
  await denied(/补库/u);
  await pool.query("UPDATE order_lines SET order_type='custom_special',fulfillment_method='送货',line_status='制袋中' WHERE id=$1", [line]);
  await pool.query("UPDATE production_tasks SET task_status='已完成' WHERE id='PT-NR'");
  await pool.query("INSERT INTO workshop_reports(id,production_task_id,order_line_id,process_type,qualified_qty,completed_at,evidence_json) VALUES('WR-NR','PT-NR',$1,'制袋',3000,now(),'{\"reportKind\":\"daily_progress\"}')", [line]);
  await denied(/完.*制袋/u); // daily count is not the final production report
  await pool.query("UPDATE workshop_reports SET evidence_json='{}' WHERE id='WR-NR'");
  await denied(/打包/u);
  await pool.query("INSERT INTO packing_tasks(id,biz_no,order_line_id,planned_qty,actual_packed_qty,status) VALUES('PK-NR','PK-NR',$1,3000,3000,'已完成')", [line]);
  await pool.query("UPDATE fulfillment_records SET actual_qty=NULL WHERE id=$1", [fulfillmentId]);
  await denied(/实际数量/u);
  assert.equal((await pool.query("SELECT actual_qty FROM fulfillment_records WHERE id=$1", [fulfillmentId])).rows[0].actual_qty, null);
  await pool.query("UPDATE fulfillment_records SET actual_qty=3000 WHERE id=$1", [fulfillmentId]);
  await pool.query("INSERT INTO price_snapshots(id,order_line_id,snapshot_type,version_no,bag_price,chargeable_qty,final_amount,created_by) VALUES('PRICE-NR',$1,'confirmation',1,0.5,3000,1500,'U-OFFICE-A')", [line]);

  // The office may have read a ready batch just before the last package was invalidated.
  const stale = await prepare();
  await pool.query("UPDATE packages SET status='已失效' WHERE id='PKG-LIVE-F008-6'");
  await denied(/实物包裹/u);
  await assert.rejects(() => print(stale), error => error.code === "BUSINESS_WRITE_CONFLICT");
  assert.equal(await jobCount(), initialJobs);
  assert.equal(Number((await pool.query("SELECT count(*) FROM paper_outbound_documents WHERE fulfillment_id=$1", [fulfillmentId])).rows[0].count), 0);

  // Other work can still be in production. Only this delivery's actual packages count.
  await pool.query("UPDATE packages SET status='已打包' WHERE id='PKG-LIVE-F008-6'");
  await pool.query("INSERT INTO production_tasks(id,biz_no,order_line_id,task_type,planned_qty,task_status) VALUES ('PT-NR-REST','PT-NR-REST',$1,'制袋',500,'制袋中')", [line]);
  const fullCapacity = await prepare();
  await pool.query("UPDATE workshop_reports SET qualified_qty=1 WHERE id='WR-NR'");
  await pool.query("UPDATE packing_tasks SET actual_packed_qty=1 WHERE id='PK-NR'");
  await denied(/已打包数量不足/u);
  await assert.rejects(() => print(fullCapacity), error => error.code === "BUSINESS_WRITE_CONFLICT");
  await pool.query("UPDATE packing_tasks SET actual_packed_qty=3000 WHERE id='PK-NR'");
  await denied(/完工报数不足/u);
  await assert.rejects(() => print(fullCapacity), error => error.code === "BUSINESS_WRITE_CONFLICT");

  const siblings = ["F-NR-SIB-A","F-NR-SIB-B"];
  for (const id of siblings) {
    await pool.query(`INSERT INTO fulfillment_records(id,biz_no,order_line_id,customer_id,customer_snapshot,method,expected_qty,actual_qty,status,created_by)
      SELECT $1,$1,order_line_id,customer_id,customer_snapshot,method,3000,3000,'待出库',created_by FROM fulfillment_records WHERE id=$2`, [id,fulfillmentId]);
    await pool.query(`INSERT INTO packages(id,biz_no,order_line_id,fulfillment_id,package_seq,package_count,packed_qty,status,created_by)
      VALUES($1,$1,$2,$3,1,1,3000,'已打包','U-OFFICE-A')`, [`PKG-${id}`,line,id]);
  }

  // One real receipt can override the workshop count for its own batch only.
  await pool.query(`INSERT INTO operation_logs(id,target_type,target_id,action,after_json,operator_id)
    VALUES('OP-NR-PACKED','packing_task','PK-NR','complete_packing_task',$1,'U-OFFICE-A')`, [JSON.stringify({
      packingTask:{packingTaskId:"PK-NR",actualPackedQty:3000}, fulfillment:{fulfillmentId,actualQty:3000},
    })]);
  const verifiedPacking = await prepare();
  assert.equal((await print(verifiedPacking, {}, siblings[0])).code, "FULFILLMENT_NOTE_NOT_READY");
  const verifiedPreview = await print(verifiedPacking, { printAction:"preview" });
  assert.ok(verifiedPreview.printRecord, JSON.stringify(verifiedPreview));
  await pool.query("DELETE FROM operation_logs WHERE id='OP-NR-PACKED'");
  await pool.query("UPDATE workshop_reports SET qualified_qty=3000 WHERE id='WR-NR'");

  // Legacy batches have no binding receipt. Both offices see full capacity, but after the
  // first write the independent transaction's fresh snapshot can no longer allocate it.
  const snapshots = await Promise.all(siblings.map(() => prepare()));
  const attempts = await Promise.allSettled(siblings.map((id,index) => print(snapshots[index],{},id)));
  assert.equal(attempts.filter(result => result.status === "fulfilled" && result.value.printJob).length, 1, JSON.stringify(attempts));
  assert.equal(attempts.filter(result => result.status === "rejected" && result.reason.code === "BUSINESS_WRITE_CONFLICT").length, 1, JSON.stringify(attempts));
  assert.equal(Number((await pool.query("SELECT count(*) FROM paper_outbound_documents WHERE fulfillment_id=ANY($1)", [siblings])).rows[0].count), 1);
  await denied(/已打包数量不足/u);
  await pool.query("UPDATE paper_outbound_documents SET status='已作废' WHERE fulfillment_id=ANY($1)", [siblings]);
  const beforeFirstPrint = await jobCount();
  const result = await print();
  assert.ok(result.printJob, JSON.stringify(result));
  assert.equal(Number(result.printTemplate.fields.totalQuantity), 3000);
  assert.equal(result.paperOutboundDocument.instructionQty, 3000);
  assert.equal(await jobCount(), beforeFirstPrint + 1);

  const confirm = (workspace, jobId) => services.printJobLifecycleService.confirmBrowserPrint({
    workspace, printJobId: jobId, operatorId: "U-OFFICE-A", body: { confirmed: true, idempotencyKey: `confirm-note-ready-${++sequence}` },
  });
  // Backdated workspace remains ready. No print confirmation may commit after the real package or frozen count changed.
  const readyWorkspace = await prepare();
  const jobId = result.printJob.printJobId;
  await pool.query("UPDATE packages SET status='已失效' WHERE id='PKG-LIVE-F008-6'");
  await assert.rejects(() => confirm(readyWorkspace, jobId), error => error.code === "BUSINESS_WRITE_CONFLICT");
  await pool.query("UPDATE packages SET status='已打包' WHERE id='PKG-LIVE-F008-6'");
  await pool.query("UPDATE print_jobs SET payload_json=jsonb_set(payload_json,'{printTemplate,fields,totalQuantity}','2999'::jsonb) WHERE id=$1", [jobId]);
  const changed = await confirm(readyWorkspace, jobId).catch(error => error);
  assert.ok(["FULFILLMENT_NOTE_NOT_READY","BUSINESS_WRITE_CONFLICT"].includes(changed.code));
  assert.equal((await pool.query("SELECT job_status FROM print_jobs WHERE id=$1", [jobId])).rows[0].job_status, "queued");
  await pool.query("UPDATE print_jobs SET payload_json=jsonb_set(payload_json,'{printTemplate,fields,totalQuantity}','3000'::jsonb) WHERE id=$1", [jobId]);
  assert.equal((await confirm(await prepare(), jobId)).printJob.jobStatus, "printed");

  // After the goods have left, a documented reprint is allowed without reconstructing old packages.
  const previous = result.printRecord.printRecordId;

  await pool.query("UPDATE packages SET status='已失效' WHERE id='PKG-LIVE-F008-6'");
  await pool.query("UPDATE fulfillment_records SET physical_outbound_at=now() WHERE id=$1", [fulfillmentId]);
  const correction = await command.correctFulfillmentNote({ workspace: await prepare(), fulfillmentId, operatorId: "U-OFFICE-A",
    body: { address: "客户更正的送货地址", reason: "旧单地址更正", idempotencyKey: "nr-history-correct" } });
  assert.equal(correction.response?.previousPrintRecordId, previous, JSON.stringify(correction));
  await denied(/实物包裹/u); // first_print cannot claim historical privilege
  const history = await print(undefined, { printAction: "reprint", previousPrintRecordId: previous, reprintReason: "已出库客户留档" });
  assert.ok(history.printJob, JSON.stringify(history));
  assert.equal(history.paperOutboundDocument ?? null, null);
  const reprintJobId = history.printJob.printJobId;
  const queuedResult = async () => {
    const workspace = await prepare();
    const job = workspace.printJobs.find(row => row.printJobId === reprintJobId);
    return queuedNoteError(workspace, job);
  };
  assert.equal(await queuedResult(), null);
  await pool.query("UPDATE print_jobs SET payload_json=jsonb_set(payload_json,'{request,previousPrintRecordId}',to_jsonb('WRONG-NOTE'::text)) WHERE id=$1", [reprintJobId]);
  assert.equal((await queuedResult()).code, "FULFILLMENT_NOTE_NOT_READY");
  assert.equal((await confirm(await prepare(), reprintJobId)).code, "FULFILLMENT_NOTE_NOT_READY");
  await pool.query("UPDATE print_jobs SET payload_json=payload_json #- '{request,previousPrintRecordId}' WHERE id=$1", [reprintJobId]);
  assert.equal(await queuedResult(), null, "pre-upgrade legitimate reprint with an earlier voided same-batch note");
  assert.equal((await confirm(await prepare(), history.printJob.printJobId)).printJob.jobStatus, "printed");
  assert.equal(await queuedResult(), null, "confirmed note can be retrieved from the print archive");
  assert.equal((await pool.query("SELECT status FROM print_records WHERE id=$1",[history.printRecord.printRecordId])).rows[0].status, "reprinted");
  assert.equal(Number((await pool.query("SELECT count(*) FROM warehouse_outbound_executions WHERE fulfillment_id=$1", [fulfillmentId])).rows[0].count), 0);
  console.log("PASS 生产未完、特殊空白、缺货通货、补库、无实数、包裹失效或缓存过时均拒绝纸单；已打包批次可先发，已出货可凭旧单重打。");
}
