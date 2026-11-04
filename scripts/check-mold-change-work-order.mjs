import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLocalMaintenanceTaskRepository } from "../server/maintenanceTaskRepository.mjs";
import { createMaintenanceTaskCommandService } from "../server/services/maintenanceTaskCommandService.mjs";

// P2-04 换模工单（负责人 2026-11-04）：办公室或管理看订单定哪台机、什么时候换、换成什么；
// 技工收到工单，换好后拍最终试做的袋子上传就完成。
let seq = 0;
const service = createMaintenanceTaskCommandService({
  buildOperationLog: (_workspace, input) => ({ id: `OP-MOLD-${++seq}`, ...input, occurredAt: "2026-11-04T08:00:00.000Z", createdAt: "2026-11-04T08:00:00.000Z" }),
  now: () => new Date("2026-11-04T08:00:00.000Z"), // 16:00 Shanghai
});
const workspace = {
  machines: [{ id: "BAG-03", name: "3号制袋机" }, { id: "BAG-01", name: "1号制袋机" }],
  customers: [{ id: "C1", name: "李记" }],
  orderLines: [{ id: "OL-1", orderLineId: "OL-1", orderId: "ORD-1104-003", customerId: "C1", productName: "无纺布袋", size: "30*40" }],
  productionTasks: [
    { id: "PT-RUN", productionTaskId: "PT-RUN", orderLineId: "OL-1", machineId: "BAG-03", plannedQty: 5000, taskStatus: "制袋中" },
    { id: "PT-DONE", productionTaskId: "PT-DONE", orderLineId: "OL-1", machineId: "BAG-03", plannedQty: 5000, taskStatus: "已完成" },
    { id: "PT-OTHER", productionTaskId: "PT-OTHER", orderLineId: "OL-1", machineId: "BAG-01", plannedQty: 5000, taskStatus: "制袋中" },
  ],
  users: [{ userId: "U-TECH", employeeId: "EMP-TECH-01" }],
  employees: [{ id: "EMP-TECH-01", name: "技工老王", sourceType: "master_data_import_review", profileStatus: "active" }],
  maintenanceTasks: [],
  attachments: [],
  todos: [],
  operationLogs: [],
  operationIdempotencyRecords: [],
  maintenanceTaskRepository: createLocalMaintenanceTaskRepository(),
};
const create = (body) => service.createTask({ workspace, operatorId: "U-OFFICE-A", body: { idempotencyKey: `mold-create-${++seq}`, machineId: "BAG-03", type: "换模", ...body } });

// The office must say when and what to change to.
assert.equal((await create({ faultCategory: "30*40 模具" })).code, "MOLD_CHANGE_TIME_REQUIRED");
// Or "after this order on the machine is done": it must be an unfinished order on that machine.
assert.equal((await create({ faultCategory: "30*40 模具", afterProductionTaskId: "PT-OTHER" })).code, "MOLD_CHANGE_AFTER_TASK_INVALID");
assert.equal((await create({ faultCategory: "30*40 模具", afterProductionTaskId: "PT-DONE" })).code, "MOLD_CHANGE_AFTER_TASK_INVALID");
const afterOrder = await create({ faultCategory: "40*50 模具", afterProductionTaskId: "PT-RUN" });
assert.equal(afterOrder.statusCode, 201, afterOrder.message);
assert.deepEqual([afterOrder.response.task.afterProductionTaskId, afterOrder.response.task.afterProductionTaskLabel, afterOrder.response.task.dueAt],
  ["PT-RUN", "ORD-1104-003 李记 无纺布袋 30*40 5000个", ""]);
assert.match(afterOrder.response.todo.summary, /做完 ORD-1104-003 李记 无纺布袋 30\*40 5000个 后/);
assert.equal((await create({ dueAt: "2026-11-04T10:00:00.000Z" })).code, "MOLD_CHANGE_TARGET_REQUIRED");

// 3号机 today after work: the technician gets a work order (and the office a shared to-do).
const tonight = await create({ dueAt: "2026-11-04T10:00:00.000Z", faultCategory: "30*40 模具" });
assert.equal(tonight.statusCode, 201, tonight.message);
const task = tonight.response.task;
assert.deepEqual([task.type, task.status, task.priority, task.faultCategory, task.summary], ["换模", "待换模", "今天", "30*40 模具", "3号制袋机换成 30*40 模具"]);
assert.equal(tonight.response.todo.type, "换模工单");
assert.match(tonight.response.todo.summary, /^3号制袋机 换模：换成 30\*40 模具 · 11\/4 18:00 · 待换模$/);
const tomorrow = await create({ dueAt: "2026-11-05T04:00:00.000Z", faultCategory: "35*45 模具", summary: "为下一单 ORD-1104-003 换的" });
assert.equal(tomorrow.response.task.priority, "普通", "tomorrow noon is not today's work");

// Technician: progress needs no notes; finishing needs the photo of the final test bag.
const update = (body) => service.updateTask({ workspace, taskId: task.id, operatorId: "U-TECH", body: { idempotencyKey: `mold-update-${++seq}`, ...body } });
assert.equal((await update({ expectedRevision: 1, status: "已恢复" })).code, "MAINTENANCE_TASK_STATUS_INVALID", "repair statuses do not apply to a mold change");
const started = await update({ expectedRevision: 1, status: "换模中" });
assert.equal(started.statusCode, 200, started.message);
assert.equal(started.response.task.status, "换模中");
assert.equal(started.response.task.startedAt, "2026-11-04T08:00:00.000Z", "the office sees when the change started");
assert.equal((await update({ expectedRevision: 2, status: "已完成", completionConfirmed: true })).code, "MOLD_CHANGE_TEST_PHOTO_REQUIRED");
workspace.attachments.push({ attachmentId: "ATT-TEST-BAG", ownerType: "maintenance_task", ownerId: task.id, purpose: "maintenance_evidence", status: "uploaded", hasContent: true, uploadedBy: "U-TECH" });
const done = await update({ expectedRevision: 2, status: "已完成", completionConfirmed: true, photoAttachmentIds: ["ATT-TEST-BAG"] });
assert.equal(done.statusCode, 200, done.message);
assert.deepEqual([done.response.task.status, done.response.task.photoAttachmentIds, done.response.task.actualTechnicianEmployeeId], ["已完成", ["ATT-TEST-BAG"], "EMP-TECH-01"]);
assert.equal(done.response.task.finding, "已换成 30*40 模具");
assert.deepEqual([done.response.task.startedAt, done.response.task.completedAt], ["2026-11-04T08:00:00.000Z", "2026-11-04T08:00:00.000Z"]);
assert.equal(done.response.todo.status, "已处理");
assert.ok(workspace.operationLogs.some((log) => log.action === "maintenance_task_completed" && log.targetId === task.id));

// Repairs keep their rules.
const repair = await service.createTask({ workspace, operatorId: "U-OFFICE-A", body: { idempotencyKey: "mold-repair-1", machineId: "BAG-03", type: "设备报修", faultCategory: "切刀", summary: "切刀不利" } });
assert.equal(repair.response.task.status, "待处理");
assert.equal((await service.updateTask({ workspace, taskId: repair.response.task.id, operatorId: "U-TECH", body: { idempotencyKey: "mold-repair-2", expectedRevision: 1, status: "换模中" } })).code, "MAINTENANCE_TASK_STATUS_INVALID");

// The database allows the new type and statuses (and only those for a mold change).
const migration = readFileSync(new URL("../db/migrations/0062_maintenance_mold_change.sql", import.meta.url), "utf8");
assert.match(migration, /task_type IN \('设备报修', '日常巡检', '预防维护', '换模'\)/);
assert.match(migration, /task_type <> '换模' OR status IN \('待换模', '换模中', '已完成'\)/);
assert.match(migration, /task_type <> '换模' OR due_at IS NOT NULL OR after_production_task_id IS NOT NULL/);
console.log("Mold-change work orders: office sets machine/time/target, technician finishes with the final test-bag photo; repairs unchanged.");
