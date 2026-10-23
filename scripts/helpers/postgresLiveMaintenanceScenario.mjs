import assert from 'node:assert/strict';
import {createPostgresMaintenanceTaskRepository} from '../../server/maintenanceTaskRepository.mjs';
import {createMaintenanceTaskCommandService} from '../../server/services/maintenanceTaskCommandService.mjs';

export async function checkPostgresLiveMaintenanceScenario({postgresClient,pool}) {
  const repository=createPostgresMaintenanceTaskRepository({postgresClient});
  let sequence=0;
  const service=createMaintenanceTaskCommandService({buildOperationLog:(_workspace,input)=>({
    ...input,id:`LOG-MAINT-LIVE-${++sequence}`,occurredAt:'2026-09-08T00:00:00Z',createdAt:'2026-09-08T00:00:00Z',
  }),now:()=>new Date('2026-09-08T00:00:00Z')});
  const workspace={machines:[{id:'M-MAINT-LIVE',name:'合成机修测试机台'}],users:[{id:'U-OFFICE-A',employeeId:'EMP-MAINT-LIVE'}],
    employees:[{id:'EMP-MAINT-LIVE',name:'合成正式档案结构',sourceType:'master_data_import_review',profileStatus:'active'}],
    maintenanceTasks:[],todos:[],operationLogs:[],attachments:[],maintenanceTaskRepository:repository};
  const createBody={idempotencyKey:'maint-live-create-001',machineId:'M-MAINT-LIVE',type:'设备报修',faultCategory:'机械检查',summary:'隔离数据库机修验证'};
  const createWorkspaces=[0,1].map(()=>({...workspace,maintenanceTasks:[],todos:[],operationLogs:[]}));
  const creations=await Promise.all(createWorkspaces.map(workspace=>service.createTask({workspace,operatorId:'U-OFFICE-A',body:createBody})));
  assert.equal(creations.filter(result=>result.statusCode===201).length,1);
  assert.equal(creations.filter(result=>result.statusCode===200 && result.response.replayed).length,1);
  const created=creations.find(result=>result.statusCode===201);
  assert.equal(creations[0].response.task.id,creations[1].response.task.id);
  workspace.maintenanceTasks=(await repository.loadState()).maintenanceTasks;

  const taskId=created.response.task.id;
  const base={expectedRevision:1,status:'处理中',finding:'检查设备',actionTaken:'调整线路',photoAttachmentIds:[]};
  const requests=[0,1].map(index=>({...base,idempotencyKey:`maint-live-race-${index}`,actionTaken:`调整线路${index}`}));
  const contenders=requests.map(()=>({...workspace,maintenanceTasks:structuredClone(workspace.maintenanceTasks),todos:structuredClone(workspace.todos),operationLogs:[]}));
  const results=await Promise.all(requests.map((body,index)=>service.updateTask({workspace:contenders[index],taskId,operatorId:'U-OFFICE-A',body})));
  assert.equal(results.filter(result=>result.statusCode===200).length,1);
  assert.equal(results.filter(result=>result.statusCode===409).length,1);
  workspace.maintenanceTasks=(await repository.loadState()).maintenanceTasks;
  const current=workspace.maintenanceTasks.find(task=>task.id===taskId);
  assert.equal(current.revision,2);
  // Attachment metadata is synthetic here; attachment storage is tested separately.
  workspace.attachments=[{id:'ATT-MAINT-LIVE',ownerType:'maintenance_task',ownerId:taskId,purpose:'maintenance_evidence',status:'uploaded',hasContent:true,uploadedBy:'U-OFFICE-A'}];
  const body={...base,idempotencyKey:'maint-live-complete',expectedRevision:2,status:'已恢复',photoAttachmentIds:['ATT-MAINT-LIVE'],completionConfirmed:true};
  const completed=await service.updateTask({workspace,taskId,operatorId:'U-OFFICE-A',body});
  assert.equal(completed.statusCode,200);
  const snapshot=async()=>JSON.stringify((await pool.query("SELECT (SELECT row_to_json(t) FROM maintenance_tasks t WHERE id=$1) AS task, (SELECT row_to_json(t) FROM todos t WHERE id=$2) AS todo, (SELECT count(*) FROM operation_logs WHERE target_id=$1) AS audits",[taskId,`T-${taskId}`])).rows);
  const before=await snapshot();
  // Discard the original create response and replay from an empty workspace
  // after subsequent updates. Recover revision 1 as a receipt, never overwrite
  // the database's completed revision 3.
  const createColdWorkspace={maintenanceTaskRepository:repository};
  const createReplay=await service.createTask({workspace:createColdWorkspace,operatorId:'U-OFFICE-A',body:createBody});
  assert.equal(createReplay.response.replayed,true);
  assert.equal(createReplay.response.task.revision,1);
  assert.equal(createReplay.response.operationLogId,created.response.operationLogId);
  assert.equal(createColdWorkspace.maintenanceTasks,undefined);
  for(const patch of [{operatorId:'U-MISMATCH'},{body:{...createBody,summary:'另一个报修内容'}},{body:{...createBody,machineId:'M-OTHER'}}]) {
    const rejected=await service.createTask({workspace:createColdWorkspace,operatorId:'U-OFFICE-A',body:createBody,...patch});
    assert.equal(rejected.code,'IDEMPOTENCY_KEY_REUSED');
  }
  const counts=(await pool.query("SELECT (SELECT count(*) FROM maintenance_tasks WHERE id=$1) AS tasks,(SELECT count(*) FROM todos WHERE id=$2) AS todos,(SELECT count(*) FROM operation_logs WHERE target_id=$1 AND action='maintenance_task_created') AS creates",[taskId,`T-${taskId}`])).rows[0];
  assert.deepEqual(counts,{tasks:'1',todos:'1',creates:'1'});
  assert.equal(await snapshot(),before);

  const replay=await service.updateTask({workspace:{maintenanceTaskRepository:repository},taskId,operatorId:'U-OFFICE-A',body});
  assert.equal(replay.response.replayed,true);
  assert.equal(replay.response.operationLogId,completed.response.operationLogId);
  for(const patch of [{operatorId:'U-MISMATCH'},{taskId:'MT-MISMATCH'},{body:{...body,finding:'修改请求'}}]){
    const rejected=await service.updateTask({workspace,taskId,operatorId:'U-OFFICE-A',body,...patch});
    assert.equal(rejected.code,'IDEMPOTENCY_KEY_REUSED');
  }
  assert.equal(await snapshot(),before);
  console.log('PASS maintenance real PostgreSQL: concurrent same-key creation, cold creation replay after completion, concurrent revision winner/conflict, completion, cold receipt replay and identity/payload conflict without duplicate audit');
}
