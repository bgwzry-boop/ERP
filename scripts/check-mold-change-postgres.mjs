import assert from "node:assert/strict";
import pg from "pg";
import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresMaintenanceTaskRepository } from "../server/maintenanceTaskRepository.mjs";
import { createMaintenanceTaskCommandService } from "../server/services/maintenanceTaskCommandService.mjs";

// P2-04 on a database with every migration applied: a mold-change work order is stored and finished
// with its test-bag photo; the table refuses repair statuses on a mold change.
const runtime = await startLivePostgres();
const pool = new pg.Pool({ connectionString: runtime.resolveLiveDatabaseUrl(), max: 4 });
try {
  const repository = createPostgresMaintenanceTaskRepository({ postgresClient: createPostgresPoolClient({ pool }) });
  let seq = 0;
  const service = createMaintenanceTaskCommandService({
    buildOperationLog: (_w, input) => ({ id: `OP-MOLD-LIVE-${++seq}`, ...input, occurredAt: new Date().toISOString(), createdAt: new Date().toISOString() }),
  });
  await pool.query("INSERT INTO employees (id, biz_no, name, role_name) VALUES ('EMP-MOLD-LIVE', 'EMP-MOLD-LIVE', '技工', '机修') ON CONFLICT (id) DO NOTHING");
  const workspace = {
    machines: [{ id: "BAG-03", name: "3号制袋机" }],
    users: [{ id: "U-OFFICE-A", userId: "U-OFFICE-A", employeeId: "EMP-MOLD-LIVE" }],
    employees: [{ id: "EMP-MOLD-LIVE", name: "技工", sourceType: "master_data_import_review", profileStatus: "active" }],
    maintenanceTasks: [],
    attachments: [],
    maintenanceTaskRepository: repository,
  };
  const created = await service.createTask({ workspace, operatorId: "U-OFFICE-A", body: { idempotencyKey: "mold-live-create-1", machineId: "BAG-03", type: "换模", dueAt: "2026-11-05T04:00:00.000Z", faultCategory: "30*40 模具" } });
  assert.equal(created.statusCode, 201, created.message);
  const taskId = created.response.task.id;
  workspace.maintenanceTasks = [created.response.task];
  workspace.attachments = [{ id: "ATT-MOLD-LIVE", attachmentId: "ATT-MOLD-LIVE", ownerType: "maintenance_task", ownerId: taskId, purpose: "maintenance_evidence", status: "uploaded", hasContent: true, uploadedBy: "U-OFFICE-A" }];
  const done = await service.updateTask({ workspace, taskId, operatorId: "U-OFFICE-A", body: { idempotencyKey: "mold-live-done-1", expectedRevision: 1, status: "已完成", completionConfirmed: true, photoAttachmentIds: ["ATT-MOLD-LIVE"] } });
  assert.equal(done.statusCode, 200, done.message);
  const row = (await pool.query("SELECT task_type, status, fault_category, photo_attachment_ids_json FROM maintenance_tasks WHERE id = $1", [taskId])).rows[0];
  assert.deepEqual([row.task_type, row.status, row.fault_category, row.photo_attachment_ids_json], ["换模", "已完成", "30*40 模具", ["ATT-MOLD-LIVE"]]);
  await assert.rejects(pool.query("UPDATE maintenance_tasks SET status = '已恢复' WHERE id = $1", [taskId]), /maintenance_tasks_mold_change_status_check/);
  console.log("PASS mold-change work order on migrated PostgreSQL: created, finished with the test-bag photo, mold statuses enforced.");
} finally {
  await pool.end();
  await stopLivePostgres(runtime);
}
