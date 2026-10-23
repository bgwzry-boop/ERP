import { createTodoCommandService } from "../server/services/todoCommandService.mjs";
import { createLocalTodoActionRepository } from "../server/todoActionRepository.mjs";
import { getTodoActions } from "../src/domain/officeRules.js";
import assert from "node:assert/strict";
import { buildIdempotencyRequestHash } from "../server/idempotency.mjs";

import {
  buildCreateMaintenanceTaskQuery,
  buildUpdateMaintenanceTaskQuery,
  createLocalMaintenanceTaskRepository,
  createPostgresMaintenanceTaskRepository,
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

for (const dueAt of ['2026-02-30T09:00:00+08:00', '2026-09-08T24:00:00+08:00',
  '2026-09-08T09:00:00', '2026-09-08', '09/08/2026 09:00', true, false, 0, 123]) {
  const before = JSON.stringify(workspace);
  const rejected = await service.createTask({ workspace, operatorId: 'U-OFFICE-A', body: {
    idempotencyKey: 'maintenance-invalid-date', machineId: 'PRINT-01', type: '设备报修',
    faultCategory: '设备检查', summary: '检查设备运行', dueAt,
  } });
  assert.equal(rejected.code, 'MAINTENANCE_TASK_DUE_AT_INVALID', JSON.stringify(dueAt));
  assert.equal(JSON.stringify(workspace), before);
}
for (const [dueAt, expected] of [['2028-02-29T09:30:00+08:00', '2028-02-29T01:30:00.000Z'],
  ['2028-02-29T01:30Z', '2028-02-29T01:30:00.000Z'], ['', ''], [null, '']]) {
  const isolated = { ...workspace, maintenanceTasks: [], todos: [], operationLogs: [], operationIdempotencyRecords: [] };
  const accepted = await service.createTask({ workspace: isolated, operatorId: 'U-OFFICE-A', body: {
    idempotencyKey: 'maintenance-valid-date', machineId: 'PRINT-01', type: '设备报修',
    faultCategory: '设备检查', summary: '检查设备运行', dueAt,
  } });
  assert.equal(accepted.statusCode, 201);
  assert.equal(accepted.response.task.dueAt, expected);
}
const queueWorkspace = { maintenanceTasks: [
  { id: 'MT-NORMAL', priority: '普通' },
  { id: 'MT-URGENT-LATER', priority: '异常', dueAt: '2026-09-10T09:00:00+08:00', updatedAt: '2026-09-01T00:00:00Z' },
  { id: 'MT-URGENT-EARLY', priority: '异常', dueAt: '2026-09-09T09:00:00+08:00' },
  { id: 'MT-URGENT-NO-DATE', priority: '异常' },
  { id: 'MT-URGENT-NEW', priority: '异常', dueAt: '2026-09-10T01:00:00Z', updatedAt: '2026-09-02T00:00:00Z' },
] };
const queueBefore = JSON.stringify(queueWorkspace);
assert.deepEqual(createLocalMaintenanceTaskRepository().listTasks({ workspace: queueWorkspace }).map(task => task.id),
  ['MT-URGENT-EARLY', 'MT-URGENT-NEW', 'MT-URGENT-LATER', 'MT-URGENT-NO-DATE', 'MT-NORMAL']);
assert.equal(JSON.stringify(queueWorkspace), queueBefore);
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


// Recover the original creation even after its machine disappears from current
// master data. The receipt is historical and must never reset the live task.
const createRetryBody = {
  idempotencyKey: "maintenance-create-001", machineId: "PRINT-01", type: "设备报修",
  faultCategory: "定位传感器", priority: "异常",
  summary: "连续印刷时定位偏移，需要检查传感器和夹具。", dueAt: "2026-07-18T04:00:00.000Z",
};
const savedMachines = workspace.machines;
workspace.machines = [];
const createRecord = workspace.operationIdempotencyRecords.find(item => item.scope === "maintenance.task.create");
const modernCreateHash = createRecord.requestHash;
for (const legacy of [false, true]) {
  if (legacy) createRecord.requestHash = buildIdempotencyRequestHash({
    machineId: "PRINT-01", type: "设备报修", faultCategory: "定位传感器", priority: "异常",
    summary: createRetryBody.summary, dueAt: createRetryBody.dueAt, assignedEmployeeId: "",
  });
  const before = JSON.stringify(workspace);
  const recovered = await service.createTask({ workspace, operatorId: "U-OFFICE-A", body: createRetryBody });
  assert.equal(recovered.statusCode, 200);
  assert.equal(recovered.response.replayed, true);
  assert.equal(recovered.response.task.id, created.response.task.id);
  for (const [operatorId, patch] of [["U-OTHER", {}], ["U-OFFICE-A", { summary: "改动后的说明" }], ["U-OFFICE-A", { machineId: "OTHER" }]]) {
    const rejected = await service.createTask({ workspace, operatorId, body: { ...createRetryBody, ...patch } });
    assert.equal(rejected.code, "IDEMPOTENCY_KEY_REUSED");
  }
  assert.equal(JSON.stringify(workspace), before);
}
// Exercise the PostgreSQL receipt reader without pretending this mock proves
// a real database transaction or concurrent creation.
let createReceiptReads = 0;
const createReadRepository = createPostgresMaintenanceTaskRepository({
  queryJson: async (sql, values) => {
    assert.match(sql, /scope = 'maintenance.task.create'/);
    assert.deepEqual(values, [createRetryBody.idempotencyKey]);
    createReceiptReads += 1;
    return structuredClone(createRecord);
  },
  transactionJson: async () => { throw new Error("Replay must not write"); },
});
const localRepository = workspace.maintenanceTaskRepository;
workspace.maintenanceTaskRepository = createReadRepository;
const databaseReadReplay = await service.createTask({ workspace, operatorId: "U-OFFICE-A", body: createRetryBody });
assert.equal(databaseReadReplay.response.replayed, true);
assert.equal(createReceiptReads, 1);
workspace.maintenanceTaskRepository = localRepository;
createRecord.requestHash = modernCreateHash;
workspace.machines = savedMachines;


workspace.todoActionRepository = createLocalTodoActionRepository();
const todoService = createTodoCommandService({ buildOperationLog: () => { throw new Error("Generic closure must not build an audit"); } });
for (const action of ["mark_handled", "batch_print_confirm", "customer_notification_sent"]) {
  const before = JSON.stringify(workspace);
  const rejected = await todoService.handleTodo({ workspace, todoId: created.response.todo.id, operatorId: "U-OFFICE-A", body: { action } });
  assert.equal(rejected.code, "TODO_MAINTENANCE_RESULT_REQUIRED");
  assert.equal(JSON.stringify(workspace), before);
}
for (const referenceStatus of ["valid", "missing", "unverifiable"]) {
  assert.ok(!getTodoActions({ ...created.response.todo, referenceStatus }).some(action => action.label === "处理完成"));
}
const task = created.response.task;
for (const expectedRevision of [1.5, true, '1', null, 0, -1, Number.MAX_SAFE_INTEGER + 1]) {
  const before=JSON.stringify(workspace);
  const result=await service.updateTask({workspace,taskId:task.id,operatorId:'U-MAINT-FORMAL',body:{
    idempotencyKey:'maintenance-invalid-version',expectedRevision,status:'处理中',finding:'检查设备',actionTaken:'检查线路',
  }});
  assert.equal(result.code,'EXPECTED_REVISION_REQUIRED');
  assert.equal(JSON.stringify(workspace),before);
}
// Employee master data treats inactive_employee as departed; neither assignment
// nor a new technician update may accept that retained historical profile.
for (const patch of [
  { profileStatus: "inactive_employee" },
  { profileStatus: "void" },
  { sourceType: undefined, source_type: "seed" },
]) {
  const original = workspace.employees[0];
  workspace.employees[0] = { ...original, ...patch };
  const before = JSON.stringify(workspace);
  const assigned = await service.createTask({ workspace, operatorId: "U-OFFICE-A", body: {
    idempotencyKey: "maintenance-ineligible-assignment", machineId: "PRINT-01",
    type: "设备报修", faultCategory: "设备检查", summary: "检查设备运行",
    assignedTechnicianEmployeeId: original.id,
  } });
  assert.equal(assigned.code, "MAINTENANCE_ASSIGNEE_INVALID", JSON.stringify(patch));
  const updated = await service.updateTask({ workspace, taskId: task.id, operatorId: "U-MAINT-FORMAL", body: {
    idempotencyKey: "maintenance-ineligible-update", expectedRevision: 1,
    status: "处理中", finding: "检查设备", actionTaken: "检查线路",
  } });
  assert.equal(updated.code, "MAINTENANCE_FORMAL_TECHNICIAN_REQUIRED", JSON.stringify(patch));
  assert.equal(JSON.stringify(workspace), before);
  workspace.employees[0] = original;
}
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

// A predecessor's already-persisted evidence remains usable after handoff.
workspace.maintenanceTasks[0].photoAttachmentIds=['ATT-PREVIOUS'];
workspace.attachments.push({attachmentId:'ATT-PREVIOUS',ownerType:'maintenance_task',ownerId:task.id,purpose:'maintenance_evidence',status:'uploaded',hasContent:true,uploadedBy:'U-PREVIOUS'});
workspace.attachments.push({attachmentId:'ATT-FOREIGN-NEW',ownerType:'maintenance_task',ownerId:task.id,purpose:'maintenance_evidence',status:'uploaded',hasContent:true,uploadedBy:'U-PREVIOUS'});
const rejectedBefore=JSON.stringify(workspace);
const foreignPhoto=await service.updateTask({workspace,taskId:task.id,operatorId:'U-MAINT-FORMAL',body:{idempotencyKey:'maintenance-foreign-new',expectedRevision:1,status:'处理中',finding:'复核设备',actionTaken:'检查线路',photoAttachmentIds:['ATT-FOREIGN-NEW']}});
assert.equal(foreignPhoto.code,'MAINTENANCE_ATTACHMENT_INVALID');
assert.equal(JSON.stringify(workspace),rejectedBefore);
const historicalPhoto=workspace.attachments.find(item=>item.attachmentId==='ATT-PREVIOUS');
for(const patch of [{ownerId:'OTHER-TASK'},{status:'deleted'},{hasContent:false},{purpose:'other'}]){
  const original={...historicalPhoto};
  Object.assign(historicalPhoto,patch);
  const snapshot=JSON.stringify(workspace);
  const rejected=await service.updateTask({workspace,taskId:task.id,operatorId:'U-MAINT-FORMAL',body:{idempotencyKey:'maintenance-invalid-history',expectedRevision:1,status:'处理中',finding:'复核设备',actionTaken:'检查线路',photoAttachmentIds:[]}});
  assert.equal(rejected.code,'MAINTENANCE_ATTACHMENT_INVALID');
  assert.equal(JSON.stringify(workspace),snapshot);
  Object.assign(historicalPhoto,original);
}

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
assert.deepEqual(completed.response.task.photoAttachmentIds,['ATT-PREVIOUS','ATT-MAINT-001']);
assert.equal(completed.response.todo.status, "已处理");
assert.equal(workspace.todos[0].refId, task.id);
const completedBeforeReopen = JSON.stringify(workspace);
const rejectedReopen = await todoService.handleTodo({ workspace, todoId: completed.response.todo.id, operatorId: "U-OFFICE-A", body: { action: "reopen" } });
assert.equal(rejectedReopen.code, "TODO_MAINTENANCE_REOPEN_REQUIRES_SOURCE");
assert.equal(JSON.stringify(workspace), completedBeforeReopen);
assert.ok(!getTodoActions({ ...completed.response.todo, handled: true }).some(action => action.label === "重新打开"));

const originalBody={idempotencyKey:'maintenance-complete-001',expectedRevision:task.revision,status:'已恢复',finding:'定位传感器松动',actionTaken:'重新紧固并校准夹具',photoAttachmentIds:['ATT-MAINT-001'],completionConfirmed:true};
const savedState=JSON.stringify(workspace);
const replay=await service.updateTask({workspace,taskId:task.id,operatorId:'U-MAINT-FORMAL',body:originalBody});
assert.equal(replay.response.replayed,true);
assert.equal(replay.response.operationLogId,completed.response.operationLogId);
assert.equal(JSON.stringify(workspace),savedState);
for(const request of [{operatorId:'U-OTHER'},{taskId:'MT-OTHER'},{body:{...originalBody,actionTaken:'不同措施'}},{body:{...originalBody,photoAttachmentIds:[]}}]){
  const rejected=await service.updateTask({workspace,taskId:task.id,operatorId:'U-MAINT-FORMAL',body:originalBody,...request});
  assert.equal(rejected.code,'IDEMPOTENCY_KEY_REUSED');
  assert.equal(JSON.stringify(workspace),savedState);
}
const receipt=workspace.operationIdempotencyRecords.find(item=>item.scope==='maintenance.task.update');
const modernHash=receipt.requestHash;
receipt.requestHash=buildIdempotencyRequestHash({taskId:task.id,expectedRevision:1,status:originalBody.status,finding:originalBody.finding,actionTaken:originalBody.actionTaken,photoAttachmentIds:completed.response.task.photoAttachmentIds,completionConfirmed:true});
assert.equal((await service.updateTask({workspace,taskId:task.id,operatorId:'U-MAINT-FORMAL',body:originalBody})).response.replayed,true);
assert.equal((await service.updateTask({workspace,taskId:task.id,operatorId:'U-OTHER',body:originalBody})).code,'IDEMPOTENCY_KEY_REUSED');
for(const hash of [receipt.requestHash,modernHash]){
  let writes=0;
  const repository=createPostgresMaintenanceTaskRepository({queryJson:async()=>({...receipt,requestHash:hash}),idempotentTransactionJson:async()=>{writes++;throw new Error('Replay must not write');}});
  const fresh={maintenanceTasks:[],maintenanceTaskRepository:repository};
  const result=await service.updateTask({workspace:fresh,taskId:task.id,operatorId:'U-MAINT-FORMAL',body:originalBody});
  assert.equal(result.response.operationLogId,completed.response.operationLogId);
  assert.equal(writes,0);
  assert.deepEqual(fresh.maintenanceTasks,[]);
}
receipt.requestHash=modernHash;

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

for (const replayed of [true,false]) {
  let request;
  const repository=createPostgresMaintenanceTaskRepository({queryJson:async()=>null,idempotentTransactionJson:async input=>{
    request=input;return {value:completed.response,replayed};
  }});
  const current={...completed.response.task,revision:replayed?9:1,finding:'当前工作区记录'};
  const state={maintenanceTasks:[current],todos:[{id:completed.response.todo.id,status:'较新状态'}],operationLogs:[]};
  const before=JSON.stringify(state);
  const result=await repository.updateTask({workspace:state,task:completed.response.task,todo:completed.response.todo,expectedRevision:1,
    operationLog:buildOperationLog(workspace,{targetType:'maintenance_task',targetId:task.id,action:'maintenance_task_completed',operatorId:'U-MAINT-FORMAL'}),
    idempotencyKey:'maintenance-race-receipt',idempotencyPayload:{taskId:task.id}});
  assert.equal(request.includeReplayMetadata,true);
  assert.equal(result.replayed,replayed);
  if(replayed)assert.equal(JSON.stringify(state),before,'A transaction replay must not restore old task/todo state');
  else assert.equal(state.maintenanceTasks[0].revision,2);
}

// A fresh transaction response can arrive after another fresh commit has
// already refreshed the shared workspace; replay detection alone cannot help.
let releaseOldResponse;
const delayedRepository = createPostgresMaintenanceTaskRepository({ queryJson: async () => null,
  idempotentTransactionJson: async () => new Promise(resolve => { releaseOldResponse = resolve; }),
});
const oldProgressReceipt = { ...completed.response, task: { ...completed.response.task, status: '处理中', completedAt: '' }, todo: { ...completed.response.todo, status: '未处理', handledAt: '', handledBy: '' } };
const delayedState = { maintenanceTasks: [structuredClone(task)], todos: [structuredClone(created.response.todo)], operationLogs: [] };
const delayedLog = { ...buildOperationLog(workspace, { targetType: 'maintenance_task', targetId: task.id, action: 'maintenance_task_completed', operatorId: 'U-MAINT-FORMAL' }), id: completed.response.operationLogId };
const oldRequest = delayedRepository.updateTask({ workspace: delayedState, task: oldProgressReceipt.task,
  todo: oldProgressReceipt.todo, expectedRevision: 1, operationLog: delayedLog,
  idempotencyKey: 'maintenance-delayed-fresh-response', idempotencyPayload: { taskId: task.id },
});
const latestTask = { ...completed.response.task, revision: 3, finding: '较新已提交结果' };
const latestTodo = { ...completed.response.todo, handlingResult: '较新已提交结果' };
delayedState.maintenanceTasks = [latestTask]; delayedState.todos = [latestTodo];
releaseOldResponse({ value: oldProgressReceipt, replayed: false });
const historicalResult = await oldRequest;
assert.equal(historicalResult.task.revision, 2);
assert.deepEqual(delayedState.maintenanceTasks, [latestTask]);
assert.deepEqual(delayedState.todos, [latestTodo]);
assert.equal(delayedState.operationLogs[0].id, delayedLog.id);

console.log("Maintenance task command check passed: task/todo/audit atomicity, formal technician attribution, photo gating, completion confirmation, and SQL revision locks are covered.");
