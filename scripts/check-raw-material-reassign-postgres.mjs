// 负责人 2026-11-08「订单改了，用掉的布跟着订单走，不算错单」在装好全部迁移的真实 PostgreSQL 上：
// 机边卷转挂到实际做的订单要写原因；新订单在保存的同一事务里被作废就整笔拒绝、卷料不变；
// 转挂后剩下的消耗挂在新订单上，已经用掉的部分仍算原订单；重放不重复转挂。
import assert from "node:assert/strict";
import pg from "pg";
import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresRawMaterialInboundRepository } from "../server/rawMaterialInboundRepository.mjs";
import { createRawMaterialInboundOrchestrator } from "../server/services/rawMaterialInboundOrchestrator.mjs";
import { orderRawMaterialConsumptionAbsentSql } from "../server/orderMutationProductionGuard.mjs";

const runtime = await startLivePostgres();
const pool = new pg.Pool({ connectionString: runtime.resolveLiveDatabaseUrl(), max: 4 });
const client = createPostgresPoolClient({ pool });
const now = "2026-11-12T00:00:00.000Z";
try {
  await pool.query(`
    INSERT INTO machines (id, biz_no, name, machine_type, workshop, status, enabled) VALUES ('BAG-01', 'BAG-01', '1号机', 'bag_making', '测试', 'active', true) ON CONFLICT DO NOTHING;
    INSERT INTO order_lines (id, biz_no, order_id, customer_id, product_name, order_type, size, bag_color, handle_type, style, original_qty, fulfillment_method, line_status, created_by)
    VALUES ('OL-RE-A', 'OL-RE-A', 'ORD-0629-001', 'C001', '空白袋', '现货通货', '30*37*10', '红色', '普通提', '空白袋', 1000, '自提', '制袋中', 'U-OFFICE-A'),
           ('OL-RE-B', 'OL-RE-B', 'ORD-0629-001', 'C001', '空白袋', '现货通货', '30*37*10', '红色', '普通提', '空白袋', 2000, '自提', '制袋中', 'U-OFFICE-A');
    INSERT INTO production_tasks (id, biz_no, order_line_id, task_type, machine_id, planned_qty, task_status, created_by)
    VALUES ('PT-RE-A', 'PT-RE-A', 'OL-RE-A', '制袋', 'BAG-01', 1000, '制袋中', 'U-OFFICE-A'),
           ('PT-RE-B', 'PT-RE-B', 'OL-RE-B', '制袋', 'BAG-01', 2000, '制袋中', 'U-OFFICE-A');`);
  const inbound = { id: "RMI-RE", revision: 1, supplierName: "测试无纺布", status: "已贴标/可用库存", materialType: "无纺布", productName: "红色无纺布", factoryColor: "红色", rollCount: 1, totalWeightKg: 100, unit: "kg",
    rolls: [{ id: "RMI-RE-01", weightKg: 100, inventoryStatus: "可用", labelStatus: "已贴标/可用库存" }] };
  await pool.query("INSERT INTO raw_material_inbounds(id,delivery_note_no,supplier_name,status,payload_json,revision) VALUES ($1,$1,$2,$3,$4::jsonb,1)", [inbound.id, inbound.supplierName, inbound.status, JSON.stringify(inbound)]);
  const line = (id, status = "制袋中") => ({ id, orderLineId: id, size: "30*37*10", bagColor: "红色", qty: 1000, lineStatus: status, status, revision: 1 });
  const task = (id, lineId) => ({ productionTaskId: id, id, orderLineId: lineId, machineId: "BAG-01", taskType: "制袋", taskStatus: "制袋中", status: "制袋中", plannedQty: 1000, revision: 1 });
  const workspace = { rawMaterialInbounds: [structuredClone(inbound)], operationLogs: [], orderLines: [line("OL-RE-A"), line("OL-RE-B")], productionTasks: [task("PT-RE-A", "OL-RE-A"), task("PT-RE-B", "OL-RE-B")] };
  const repo = createPostgresRawMaterialInboundRepository({ postgresClient: client });
  const run = (action, body, key) => createRawMaterialInboundOrchestrator(repo, { now: () => new Date(now) })
    .recordInboundAction({ workspace, inboundId: "RMI-RE", actionSlug: action, operatorId: "U-OFFICE-A", body: { idempotencyKey: key, ...body } });
  const stored = async () => (await pool.query("SELECT payload_json, revision FROM raw_material_inbounds WHERE id = 'RMI-RE'")).rows[0];
  const hasConsumption = async (lineId) => !(await pool.query(`SELECT ${orderRawMaterialConsumptionAbsentSql("$1")} AS absent`, [lineId])).rows[0].absent;

  const issued = await run("issue_to_machine", { expectedRevision: 1, rollId: "RMI-RE-01", machineId: "1号机", productionTaskId: "PT-RE-A" }, "re-issue-1");
  assert.equal(issued.error, undefined, JSON.stringify(issued));
  const used = await run("confirm_consumption", { expectedRevision: 2, rollId: "RMI-RE-01", consumedWeightKg: 20 }, "re-use-a1");
  assert.equal(used.error, undefined, JSON.stringify(used));
  assert.equal(await hasConsumption("OL-RE-A"), true);

  // 新订单在同一事务里被作废 → 整笔拒绝，卷料不变
  await pool.query("UPDATE order_lines SET line_status = '已作废' WHERE id = 'OL-RE-B'");
  const beforeConflict = await stored();
  const conflict = await run("reassign_issue", { expectedRevision: 3, rollId: "RMI-RE-01", productionTaskId: "PT-RE-B", reason: "A 单改了" }, "re-move-conflict").catch((error) => error);
  assert.equal(conflict.code, "ERP_RAW_MATERIAL_PRODUCTION_CONFLICT", JSON.stringify(conflict));
  assert.deepEqual(await stored(), beforeConflict, "被拒绝时卷料一点不变");
  await pool.query("UPDATE order_lines SET line_status = '制袋中' WHERE id = 'OL-RE-B'");

  // 转挂到 B 单，再把剩下 80kg 用完：消耗挂在 B 单
  const moved = await run("reassign_issue", { expectedRevision: 3, rollId: "RMI-RE-01", productionTaskId: "PT-RE-B", reason: "A 单客户减量，剩下的布做 B 单" }, "re-move-b1");
  assert.equal(moved.error, undefined, JSON.stringify(moved));
  const afterMove = await stored();
  assert.equal(afterMove.revision, 4);
  assert.deepEqual(afterMove.payload_json.rawMaterialIssueRecords.map((row) => [row.consumptionStatus, row.productionTaskId]), [["已转挂", "PT-RE-A"], ["待生产消耗确认", "PT-RE-B"]]);
  const log = (await pool.query("SELECT reason FROM operation_logs WHERE target_id = 'RMI-RE' AND action = 'reassign_issue'")).rows;
  assert.equal(log.length, 1);
  assert.match(log[0].reason, /A 单客户减量/);
  const usedB = await run("confirm_consumption", { expectedRevision: 4, rollId: "RMI-RE-01" }, "re-use-b1");
  assert.equal(usedB.error, undefined, JSON.stringify(usedB));
  const finalPayload = (await stored()).payload_json;
  assert.deepEqual(finalPayload.rawMaterialConsumptionRecords.map((row) => [row.productionTaskId, row.consumedWeightKg]), [["PT-RE-A", 20], ["PT-RE-B", 80]]);
  assert.equal(await hasConsumption("OL-RE-B"), true, "剩下的 80kg 算 B 单");

  // 重放同一次转挂，返回原结果，不再转第二次
  const replay = await run("reassign_issue", { expectedRevision: 3, rollId: "RMI-RE-01", productionTaskId: "PT-RE-B", reason: "A 单客户减量，剩下的布做 B 单" }, "re-move-b1");
  assert.equal(replay.inbound.revision, 4);
  assert.equal((await stored()).payload_json.rawMaterialIssueRecords.length, 2);
  console.log("PASS raw material reassign PostgreSQL: 机边卷转挂要写原因、新订单作废整笔拒绝、转挂后消耗算新订单、重放不重复转挂");
} finally {
  await pool.end().catch(() => {});
  await stopLivePostgres(runtime);
}
