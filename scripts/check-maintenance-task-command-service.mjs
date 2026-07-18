import assert from "node:assert/strict";

import {
  buildCreateMaintenanceTaskQuery,
  buildUpdateMaintenanceTaskQuery,
  createLocalMaintenanceTaskRepository,
} from "../server/maintenanceTaskRepository.mjs";
import { createMaintenanceTaskCommandService } from "../server/services/maintenanceTaskCommandService.mjs";

let logSequence = 0;
const buildOperationLog = (_workspace, input) => ({
  id: `OP-MAINT-${++logSequence}`,
  targetType: input.targetType,
  targetId: input.targetId,
  action: input.action,
  before: input.before ?? null,
  after: input.after ?? null,
  reason: input.reason ?? "",
  operatorId: input.operatorId,
  pageKey: input.pageKey,
  occurredAt: "2026-07-18T02:00:00.000Z",
  createdAt: "2026-07-18T02:00:00.000Z",
});
const service = createMaintenanceTaskCommandService({
  buildOperationLog,
  now: () => new Date("2026-07-18T02:00:00.000Z"),
});
const workspace = {
  machines: [{ id: "PRINT-01", name: "丝印 1 号机" }],
  users: [{ userId: "U-MAINT-FORMAL", employeeId: "EMP-MAINT-01" }],
  employees: [{
    id: "EMP-MAINT-01",
    name: "正式机修员",
    sourceType: "master_data_import_review",
    profileStatus: "active",
  }],
  maintenanceTasks: [],
  attachments: [],
  todos: [],
  operationLogs: [],
  operationIdempotencyRecords: [],
  maintenanceTaskRepository: createLocalMaintenanceTaskRepository(),
};

const created = await service.createTask({
  workspace,
  operatorId: "U-OFFICE-A",
  body: {
    idempotencyKey: "maintenance-create-001",
    machineId: "PRINT-01",
    type: "设备报修",
    faultCategory: "定位传感器",
    priority: "异常",
    summary: "连续印刷时定位偏移，需要检查传感器和夹具。",
    dueAt: "2026-07-18T04:00:00.000Z",
  },
});
assert.equal(created.statusCode, 201);
assert.equal(created.response.task.status, "待处理");
assert.equal(created.response.todo.refType, "maintenance_task");
assert.equal(workspace.maintenanceTasks.length, 1);
assert.equal(workspace.todos.length, 1);

const task = created.response.task;
workspace.attachments.push({
  attachmentId: "ATT-MAINT-001",
  ownerType: "maintenance_task",
  ownerId: task.id,
  purpose: "maintenance_evidence",
  status: "uploaded",
  hasContent: true,
  uploadedBy: "U-MAINT-FORMAL",
});

const missingConfirmation = await service.updateTask({
  workspace,
  taskId: task.id,
  operatorId: "U-MAINT-FORMAL",
  body: {
    idempotencyKey: "maintenance-complete-missing-confirmation",
    expectedRevision: task.revision,
    status: "已恢复",
    finding: "定位传感器松动",
    actionTaken: "重新紧固并校准夹具",
    photoAttachmentIds: ["ATT-MAINT-001"],
  },
});
assert.equal(missingConfirmation.code, "MAINTENANCE_COMPLETION_CONFIRMATION_REQUIRED");

const completed = await service.updateTask({
  workspace,
  taskId: task.id,
  operatorId: "U-MAINT-FORMAL",
  body: {
    idempotencyKey: "maintenance-complete-001",
    expectedRevision: task.revision,
    status: "已恢复",
    finding: "定位传感器松动",
    actionTaken: "重新紧固并校准夹具",
    photoAttachmentIds: ["ATT-MAINT-001"],
    completionConfirmed: true,
  },
});
assert.equal(completed.statusCode, 200);
assert.equal(completed.response.task.status, "已恢复");
assert.equal(completed.response.task.actualTechnicianEmployeeId, "EMP-MAINT-01");
assert.equal(completed.response.task.revision, 2);
assert.equal(completed.response.todo.status, "已处理");
assert.equal(workspace.todos[0].refId, task.id);

const stale = await service.updateTask({
  workspace,
  taskId: task.id,
  operatorId: "U-MAINT-FORMAL",
  body: {
    idempotencyKey: "maintenance-stale-001",
    expectedRevision: 1,
    status: "处理中",
    finding: "旧页面结果",
    actionTaken: "旧页面措施",
  },
});
assert.equal(stale.code, "MAINTENANCE_TASK_ALREADY_COMPLETED");

const createQuery = buildCreateMaintenanceTaskQuery({
  task,
  todo: created.response.todo,
  operationLog: buildOperationLog(workspace, {
    targetType: "maintenance_task",
    targetId: task.id,
    action: "maintenance_task_created",
    operatorId: "U-OFFICE-A",
    pageKey: "maintenance_mobile",
  }),
});
assert.match(createQuery.text, /INSERT INTO maintenance_tasks/);
assert.match(createQuery.text, /INSERT INTO todos/);
assert.match(createQuery.text, /INSERT INTO operation_logs/);

const updateQuery = buildUpdateMaintenanceTaskQuery({
  task: completed.response.task,
  todo: completed.response.todo,
  expectedRevision: 1,
  operationLog: buildOperationLog(workspace, {
    targetType: "maintenance_task",
    targetId: task.id,
    action: "maintenance_task_completed",
    operatorId: "U-MAINT-FORMAL",
    pageKey: "maintenance_mobile",
  }),
});
assert.match(updateQuery.text, /FOR UPDATE/);
assert.match(updateQuery.text, /ERP_MAINTENANCE_TASK_REVISION_CONFLICT/);
assert.match(updateQuery.text, /photo_attachment_ids_json/);

console.log("Maintenance task command check passed: task/todo/audit atomicity, formal technician attribution, photo gating, completion confirmation, and SQL revision locks are covered.");
