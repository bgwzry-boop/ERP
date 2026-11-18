import assert from "node:assert/strict";
import pg from "pg";
import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresRawMaterialInboundRepository } from "../server/rawMaterialInboundRepository.mjs";
import { createRawMaterialInboundOrchestrator } from "../server/services/rawMaterialInboundOrchestrator.mjs";
import { buildRawMaterialPickList } from "../src/domain/rawMaterialTaskPicking.js";

const runtime = await startLivePostgres();
let pool;
try {
  pool = new pg.Pool({ connectionString: runtime.resolveLiveDatabaseUrl(), statement_timeout: 15000 });
  const query = async (sql, values = []) => (await pool.query(sql, values)).rows;
  const postgres = createPostgresPoolClient({ pool });
  const validCases = [["BOUND", "PRINT-02", "SCH-BOUND"], ["POOL", "", "SCH-POOL"], ["STALE", "PRINT-02", "SCH-STALE"]];
  const cases = [...validCases, ["DRAFT", "PRINT-02", ""]];
  const workspace = { rawMaterialInbounds: [], orderLines: [], productionTasks: [], rawMaterialUntaskedIssueAllowed: false };
  await query(`INSERT INTO machines (id,biz_no,name,machine_type,workshop,status,enabled)
    VALUES ('PRINT-02','PRINT-02','2号丝印机','screen_printing','丝印车间','active',true) ON CONFLICT DO NOTHING`);
  for (const [id, machineId, publishedScheduleId] of cases) {
    const line = { id: `OL-PICK-${id}`, lineStatus: "丝印已排产", size: "30*37*10", bagColor: "红色", qty: 1000 };
    const task = { id: `PT-PICK-${id}`, orderLineId: line.id, machineId, publishedScheduleId, taskType: "丝印", taskStatus: "丝印已排产", plannedQty: 1000 };
    const inbound = { id: `RMI-PICK-${id}`, revision: 1, supplierName: "隔离供应商", materialType: "无纺布", factoryColor: "红色",
      status: "已贴标/可用库存", rollCount: 1, totalWeightKg: 40, unit: "kg",
      rolls: [{ id: `ROLL-PICK-${id}`, factoryColor: "红色", weightKg: 40, inventoryStatus: "可用", labelStatus: "已贴标/可用库存" }] };
    await query(`INSERT INTO order_lines (id,biz_no,order_id,customer_id,product_name,order_type,size,bag_color,handle_type,style,original_qty,fulfillment_method,line_status)
      VALUES ($1,$1,'ORD-0629-001','C001','印刷袋','定制印刷',$2,$3,'普通提','空白袋',1000,'自提',$4)`, [line.id,line.size,line.bagColor,line.lineStatus]);
    await query(`INSERT INTO production_tasks(id,biz_no,order_line_id,task_type,machine_id,planned_qty,task_status,published_schedule_id)
      VALUES($1,$1,$2,'丝印',NULLIF($3,''),1000,$4,NULLIF($5,''))`, [task.id,line.id,machineId,task.taskStatus,publishedScheduleId]);
    await query(`INSERT INTO raw_material_inbounds(id,delivery_note_no,supplier_name,status,payload_json,revision)
      VALUES ($1,$1,$2,$3,$4::jsonb,1)`, [inbound.id,inbound.supplierName,inbound.status,JSON.stringify(inbound)]);
    workspace.orderLines.push(line);
    workspace.productionTasks.push(task);
    workspace.rawMaterialInbounds.push(inbound);
  }
  const tasks = buildRawMaterialPickList({ workshop: "丝印车间", queueItems: workspace.productionTasks.map(task => ({
    ...task, productionTaskId: task.id, machineId: task.machineId || "PRINT-01", assignedMachineId: task.machineId,
  })) });
  assert.deepEqual(tasks.map(task => [task.productionTaskId,task.target]), [
    ["PT-PICK-BOUND","2号丝印机"], ["PT-PICK-POOL","丝印车间"], ["PT-PICK-STALE","2号丝印机"],
  ]);
  const issue = (id, machineId, key, client = postgres) => {
    const repository = createPostgresRawMaterialInboundRepository({ postgresClient: client });
    return createRawMaterialInboundOrchestrator(repository).recordInboundAction({
      workspace, inboundId: `RMI-PICK-${id}`, actionSlug: "issue_to_machine", operatorId: "U-OFFICE-A",
      body: { expectedRevision: 1, rollId: `ROLL-PICK-${id}`, productionTaskId: `PT-PICK-${id}`,
        machineId, idempotencyKey: key, issuePurpose: "印刷（先印后制袋）" },
    });
  };
  const load = async id => (await query("SELECT revision,payload_json FROM raw_material_inbounds WHERE id=$1", [`RMI-PICK-${id}`]))[0];
  const wrongMachine = await issue("BOUND", "丝印车间", "raw-pick-wrong-machine");
  assert.equal(wrongMachine.code, "RAW_MATERIAL_PRODUCTION_TASK_MACHINE_MISMATCH");
  const unpublished = await issue("DRAFT", "2号丝印机", "raw-pick-unpublished");
  assert.equal(unpublished.code, "ERP_RAW_MATERIAL_PRODUCTION_CONFLICT");
  assert.equal((await load("DRAFT")).revision,1);

  const originalStock = await load("STALE");
  // Hold the office's cancellation uncommitted until the real issue transaction
  // reaches its line lock. It has already made the decision from the active snapshot.
  const office = await pool.connect();
  let pending, result;
  try {
    await office.query("BEGIN");
    await office.query("UPDATE order_lines SET line_status='已作废',revision=revision+1 WHERE id='OL-PICK-STALE'");
    await office.query("UPDATE production_tasks SET task_status='已作废',revision=revision+1 WHERE id='PT-PICK-STALE'");
    pending = issue("STALE", "2号丝印机", "raw-pick-stale");
    await waitForOrderLineLock(query);
    await office.query("COMMIT");
  } finally {
    await office.query("ROLLBACK");
    office.release();
    if (pending) result = await pending;
  }
  assert.equal(result.statusCode,409,JSON.stringify(result));
  assert.deepEqual(await load("STALE"),originalStock,"作废后未发生领料，库存修订和原始记录完整");
  assert.equal((await query("SELECT COUNT(*)::int AS count FROM operation_logs WHERE target_id='RMI-PICK-STALE'"))[0].count,0);
  assert.equal((await query("SELECT COUNT(*)::int AS count FROM operation_idempotency_keys WHERE idempotency_key='raw-pick-stale'"))[0].count,0);

  for (const id of ["BOUND","POOL"]) {
    const task = tasks.find(item => item.productionTaskId === `PT-PICK-${id}`);
    const result = await issue(id, task.target, `raw-pick-${id}`);
    assert.equal(result.error,undefined,JSON.stringify(result));
    const saved = (await load(id)).payload_json;
    assert.equal(saved.rolls[0].inventoryStatus,"机边领用");
    assert.equal(saved.rolls[0].machineId,task.target);
    assert.equal(saved.rawMaterialIssueRecords[0].productionTaskOrderLineId,task.orderLineId);
    assert.equal(saved.rawMaterialIssueRecords[0].issuedWeightKg,40);
    const replay = await issue(id, task.target, `raw-pick-${id}`);
    assert.equal(replay.operationLogId,result.operationLogId);
    assert.equal((await load(id)).revision,2);
  }
  console.log("PASS task raw material issue against isolated PostgreSQL: assigned screen machine, published common screen pool, unpublished denial, cancelled task transaction rollback and exact replay.");
} finally {
  await pool?.end();
  await stopLivePostgres(runtime);
}

async function waitForOrderLineLock(query) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [{ count }] = await query(`SELECT count(*)::int FROM pg_stat_activity
      WHERE datname=current_database() AND wait_event_type='Lock'
        AND query LIKE '%SELECT id FROM order_lines WHERE id=ANY%'`);
    if (count > 0) return;
    await new Promise(resolve => setTimeout(resolve,50));
  }
  assert.fail("原料事务没有等待被占用的订单行锁");
}
