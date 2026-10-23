import assert from "node:assert/strict";

import {
  listMaintenanceTasks,
  createMaintenanceTask,
  updateMaintenanceTask,
} from "../src/services/maintenanceTaskApiClient.js";

const authState = {
  authenticated: true,
  source: "api_runtime",
  session: { accessToken: "maintenance-client-check-token" },
};
const createInput = { authState, operatorId: "U-OFFICE-A", idempotencyKey: "maintenance-create-client",
  machineId: "M-01", type: "设备报修", faultCategory: "电路", summary: "检查线路异常",
  priority: "今天", dueAt: "2026-09-08T10:00:00+08:00", assignedTechnicianEmployeeId: "EMP-01" };
const createTaskReceipt = { id: "MT-CREATE", revision: 1, status: "待处理", machineId: "M-01",
  type: "设备报修", faultCategory: "电路", summary: "检查线路异常", priority: "今天",
  dueAt: "2026-09-08T02:00:00.000Z", assignedTechnicianEmployeeId: "EMP-01", createdBy: "U-OFFICE-A" };
const createReceipt = { task: createTaskReceipt, todo: { id: "T-MT-CREATE" }, operationLogId: "LOG-CREATE" };
for (const patch of [{ machineId: "OTHER" }, { type: "日常巡检" }, { summary: "另一单" },
  { faultCategory: "机械" }, { priority: "普通" }, { dueAt: "" },
  { assignedTechnicianEmployeeId: "EMP-OTHER" }, { createdBy: "U-OTHER" }, { status: "处理中" }]) {
  const result = await createMaintenanceTask(createInput, { fetchImpl: async () => jsonResponse(201, { ...createReceipt, task: { ...createTaskReceipt, ...patch } }) });
  assert.equal(result.error?.code, "MAINTENANCE_TASK_SAVE_UNCONFIRMED", JSON.stringify(patch));
}
for (const replayed of [false, true]) {
  const result = await createMaintenanceTask(createInput, { fetchImpl: async (_url, init) => {
    assert.equal(init.headers["idempotency-key"], createInput.idempotencyKey);
    return jsonResponse(replayed ? 200 : 201, { ...createReceipt, replayed });
  } });
  assert.equal(result.source, "api");
  assert.equal(result.replayed, replayed);
}

const calls = [];
const fetchImpl = async (url, init) => {
  calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
  if (init.method === "GET") {
    return jsonResponse(200, {
      items: [{ taskId: "MT-001", machineId: "PRINT-01", machineName: "丝印 1 号机", type: "设备报修", status: "待处理", revision: 1 }],
      total: 1,
    });
  }
  return jsonResponse(200, {
    task: {
      taskId: "MT-001",
      machineId: "PRINT-01",
      machineName: "丝印 1 号机",
      type: "设备报修",
      status: "已恢复",
      finding: "传感器松动",
      actionTaken: "重新紧固校准",
      photoAttachmentIds: ["ATT-M-001"],
      revision: 2,
    },
    todo: { todoId: "T-MT-001", status: "已处理" },
    operationLogId: "OP-MT-001",
    replayed: false,
  });
};

const listed = await listMaintenanceTasks(
  { authState, operatorId: "U-MAINT-FORMAL", status: "all" },
  { apiBaseUrl: "http://127.0.0.1:8787/api", fetchImpl },
);
assert.equal(listed.source, "api");
assert.equal(listed.items[0].id, "MT-001");
assert.equal(calls[0].url, "http://127.0.0.1:8787/api/maintenance/tasks?status=all");
assert.equal(calls[0].init.headers.authorization, "Bearer maintenance-client-check-token");
const row={taskId:'MT-READ',revision:1,status:'待处理'};
for(const json of [{},{items:null,total:0},{items:[row],total:0},{items:[row,row],total:2},
 {items:[{...row,revision:undefined}],total:1},{items:[{...row,revision:1.5}],total:1},
 {items:[{...row,revision:'1'}],total:1},{items:[{...row,status:'unknown'}],total:1},
 {items:[{...row,id:'OTHER'}],total:1}]){
 const rejected=await listMaintenanceTasks({authState},{fetchImpl:async()=>jsonResponse(200,json)});
 assert.equal(rejected.blocked,true);
 assert.equal(rejected.error.code,'MAINTENANCE_TASK_LIST_INVALID');
}
const empty=await listMaintenanceTasks({authState},{fetchImpl:async()=>jsonResponse(200,{items:[],total:0})});
assert.deepEqual(empty.items,[]);assert.equal(empty.source,'api');

const updated = await updateMaintenanceTask(
  {
    authState,
    operatorId: "U-MAINT-FORMAL",
    taskId: "MT-001",
    expectedRevision: 1,
    finding: "传感器松动",
    actionTaken: "重新紧固校准",
    status: "已恢复",
    photoAttachmentIds: ["ATT-M-001"],
    completionConfirmed: true,
  },
  { apiBaseUrl: "http://127.0.0.1:8787/api", fetchImpl },
);
assert.equal(updated.source, "api");
assert.equal(updated.task.revision, 2);
assert.equal(calls[1].url, "http://127.0.0.1:8787/api/maintenance/tasks/MT-001/update");
assert.equal(calls[1].body.expectedRevision, 1);
assert.equal(calls[1].body.completionConfirmed, true);
assert.ok(calls[1].init.headers["idempotency-key"], "maintenance writes must send an idempotency key");

const retryInput={authState,taskId:'MT-001',expectedRevision:1,status:'已恢复',idempotencyKey:'maintenance-frozen-retry'};
const valid={task:{taskId:'MT-001',revision:2,status:'已恢复'},todo:{todoId:'T-MT-001'},operationLogId:'LOG-VALID'};
for(const patch of [{task:{...valid.task,taskId:'MT-OTHER'}},{task:{...valid.task,revision:1}},{task:{...valid.task,revision:'2'}},{task:{...valid.task,status:'处理中'}},{operationLogId:''},{todo:{todoId:'T-OTHER'}}]){
 const result=await updateMaintenanceTask(retryInput,{fetchImpl:async()=>jsonResponse(200,{...valid,...patch})});
 assert.equal(result.blocked,true);
 assert.equal(result.error.code,'MAINTENANCE_TASK_SAVE_UNCONFIRMED');
}
for(let attempt=0;attempt<2;attempt++){
 const result=await updateMaintenanceTask(retryInput,{fetchImpl:async(_url,init)=>{
  assert.equal(init.headers['idempotency-key'],'maintenance-frozen-retry');
  return jsonResponse(200,valid);
 }});
 assert.equal(result.source,'api');
}
const unknown=await updateMaintenanceTask(retryInput,{fetchImpl:async()=>{throw new Error('connection lost');}});
assert.equal(unknown.blocked,true);
assert.match(unknown.error.message,/未能确认/);
for(const status of [408,500,502,503,504]){
 const result=await updateMaintenanceTask(retryInput,{fetchImpl:async()=>jsonResponse(status,{code:'GATEWAY_ERROR',message:'upstream unavailable'})});
 assert.equal(result.error.code,'MAINTENANCE_TASK_SAVE_UNCONFIRMED');
}
for(const status of [403,409,422]){
 const result=await updateMaintenanceTask(retryInput,{fetchImpl:async()=>jsonResponse(status,{error:{code:'EXPLICIT_REJECTION',message:'明确拒绝'}})});
 assert.notEqual(result.error.code,'MAINTENANCE_TASK_SAVE_UNCONFIRMED');
 assert.equal(result.blocked,true);
}

console.log("Frontend maintenance task API client check passed: authenticated reads, revisioned completion writes, photo IDs, and idempotency headers are covered.");

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}
