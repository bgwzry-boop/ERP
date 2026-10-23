import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildIdempotencyRequestHash } from "../../server/idempotency.mjs";
import { seedRepairFixture } from "./checkTodoFulfillmentRepairReplay.mjs";
import { createPostgresFulfillmentActionTransactionRepository, createLocalFulfillmentActionTransactionRepository } from "../../server/fulfillmentActionTransactionRepository.mjs";
import { createPrintJobBusinessProjectionService } from "../../server/services/printJobBusinessProjectionService.mjs";
import { createFulfillmentPrintCommandService } from "../../server/services/fulfillmentPrintCommandService.mjs";

export async function checkPrintTodoSourceCompletion({pool,postgresClient,repo,service,clock}) {
  const fixture=await seedRepairFixture(pool,repo,clock,"PRINT-SOURCE");
  const workspace=fixture.workspace;
  workspace.packages=workspace.packages.map(record=>({...record,updatedAt:"2099-01-01T00:00:00.000Z"}));
  const repaired=await service.repairMissingFulfillment({workspace,todoId:fixture.todoId,operatorId:"U-OFFICE-A",body:{reason:"打印来源验证",idempotencyKey:"pg-print-source-repair"}});
  for(const action of ["mark_handled","batch_print_confirm","customer_notification_sent"]){
    const result=await service.handleTodo({workspace,todoId:repaired.labelTodo.id,operatorId:"U-OFFICE-A",body:{action,idempotencyKey:`pg-print-source-forged-${action}`,printRecordId:"invented",printedLabelCount:999}});
    assert.equal(result.code,"TODO_PRINT_SOURCE_REQUIRED");
    assert.equal((await repo.getTodo({todoId:repaired.labelTodo.id})).handled,false);
  }
  const fulfillmentId=repaired.fulfillment.fulfillmentId;
  await pool.query("INSERT INTO todos(id,biz_no,type,ref_type,ref_id,status,summary,created_at,updated_at) VALUES('T-PG-PRINT-SECOND','T-PG-PRINT-SECOND','待打印标签','fulfillment',$1,'未处理','同一交付的另一待办',$2,$2),('T-PG-PRINT-OTHER','T-PG-PRINT-OTHER','待打印标签','fulfillment','F001','未处理','其他交付',$2,$2)",[fulfillmentId,clock]);
  const printRecordId="PR-TODO-SOURCE",printJobId="PJ-TODO-SOURCE";
  const packages=workspace.packages.filter(record=>record.fulfillmentId===fulfillmentId);
  const packageSnapshot=packages.map(record=>({packageId:record.packageId,revision:record.revision}));
  const printRecord={printRecordId,targetType:"fulfillment",targetId:fulfillmentId,documentType:"express_ltl_label",templateId:"tpl-p0-express-ltl-label",status:"submitted",printAction:"first_print",fulfillmentRevision:1,packageSnapshot,createdAt:clock};
  workspace.printRecords=[printRecord];
  await pool.query("INSERT INTO print_records(id,biz_no,target_type,target_id,template_id,print_action,status,fulfillment_revision,package_snapshot_json,created_at) VALUES($1,$1,'fulfillment',$2,'tpl-p0-express-ltl-label','first_print','submitted',1,$3,$4)",[printRecordId,fulfillmentId,JSON.stringify(packageSnapshot),clock]);
  await pool.query("INSERT INTO print_jobs(id,biz_no,print_record_id,target_type,target_id,document_type,template_id,driver_mode,job_status,revision,requested_by,created_at,updated_at) VALUES($1,$1,$2,'fulfillment',$3,'express_ltl_label','tpl-p0-express-ltl-label','system_printer','sent',1,'U-OFFICE-A',$4,$4)",[printJobId,printRecordId,fulfillmentId,clock]);
  const printJob={printJobId,printRecordId,targetType:"fulfillment",targetId:fulfillmentId,documentType:"express_ltl_label",templateId:"tpl-p0-express-ltl-label",driverMode:"system_printer",jobStatus:"printed",revision:1,requestedBy:"U-OFFICE-A",createdAt:clock,updatedAt:clock,finishedAt:clock};
  let captured;
  const transactionRepo=createPostgresFulfillmentActionTransactionRepository({postgresClient});
  workspace.fulfillmentActionTransactionRepository={...transactionRepo,recordFulfillmentPrint:async input=>{captured=input;return transactionRepo.recordFulfillmentPrint(input);}};
  const printService=createPrintJobBusinessProjectionService({
    buildFulfillmentActionRecord:(_workspace,fulfillment)=>({...fulfillment,fulfillmentId:fulfillment.fulfillmentId??fulfillment.id}),
    buildOperationLog:(_workspace,input)=>({...input,occurredAt:clock,createdAt:clock}),
  });
  const printed=await printService.persistFulfillmentPrintJobProjection({workspace,printJob,operatorId:"U-PRINT-DRIVER-A",idempotencyKey:"pg-print-source-confirmed",printJobOperationLog:{id:"LOG-PJ-TODO-SOURCE",targetType:"print_job",targetId:printJobId,action:"record_print_job_driver_status",operatorId:"U-PRINT-DRIVER-A",occurredAt:clock,createdAt:clock}});
  assert.equal(printed.physicalPrintConfirmed,true);
  const closed=await repo.getTodo({todoId:repaired.labelTodo.id});
  assert.equal(closed.handled,true);assert.equal(closed.handledBy,"U-PRINT-DRIVER-A");
  assert.equal(closed.lastAction,"可信标签打印完成");
  assert.equal(workspace.todos.find(todo=>todo.id===closed.id).handled,true);
  assert.equal((await repo.getTodo({todoId:"T-PG-PRINT-SECOND"})).handled,true);
  assert.equal((await repo.getTodo({todoId:"T-PG-PRINT-OTHER"})).handled,false);
  const audit=(await pool.query("SELECT event_payload FROM todo_events WHERE todo_id=$1 AND event_type='trusted_label_print_completed'",[closed.id])).rows;
  assert.equal(audit.length,1);assert.equal(audit[0].event_payload.printJobId,printJobId);assert.equal(audit[0].event_payload.printRecordId,printRecordId);
  await service.handleTodo({workspace,todoId:closed.id,operatorId:"U-OFFICE-A",body:{action:"reopen",idempotencyKey:"pg-print-source-reopen"}});
  const replay=await transactionRepo.recordFulfillmentPrint(captured);
  assert.equal(replay.completedPrintTodos[0].todo.status,"已处理");
  assert.equal(workspace.todos.find(todo=>todo.id===closed.id).handled,false,"Old source receipt must not close a reopened todo");
  assert.equal((await pool.query("SELECT count(*)::int n FROM todo_events WHERE todo_id=$1 AND event_type='trusted_label_print_completed'",[closed.id])).rows[0].n,1);

  const localWorkspace={fulfillments:[{...captured.fulfillment}],packages:structuredClone(packages),todos:[{...repaired.labelTodo,status:"未处理",handled:false}],todoEvents:[],operationLogs:[],printRecords:[printRecord],printJobs:[]};
  const localRepo=createLocalFulfillmentActionTransactionRepository();
  const local=await localRepo.recordFulfillmentAction({...captured,workspace:localWorkspace,idempotencyKey:"local-print-source"});
  assert.equal(local.completedPrintTodos.length,1);assert.equal(localWorkspace.todos[0].handled,true);assert.equal(localWorkspace.todoEvents.length,1);
  const localReplay=await localRepo.recordFulfillmentAction({...captured,workspace:localWorkspace,idempotencyKey:"local-print-source"});
  assert.equal(localReplay.completedPrintTodos.length,1);assert.equal(localWorkspace.todoEvents.length,1);

  const record2={...printRecord,printRecordId:"PR-TODO-COLLISION",fulfillmentRevision:2,packageSnapshot:workspace.packages.map(record=>({packageId:record.packageId,revision:record.revision}))};
  const job2={...printJob,printJobId:"PJ-TODO-COLLISION",printRecordId:record2.printRecordId};
  workspace.printRecords=[record2,...workspace.printRecords];
  await pool.query("INSERT INTO print_records(id,biz_no,target_type,target_id,template_id,print_action,status,fulfillment_revision,package_snapshot_json,created_at) VALUES($1,$1,'fulfillment',$2,'tpl-p0-express-ltl-label','first_print','submitted',2,$3,$4)",[record2.printRecordId,fulfillmentId,JSON.stringify(record2.packageSnapshot),clock]);
  await pool.query("INSERT INTO print_jobs(id,biz_no,print_record_id,target_type,target_id,document_type,template_id,driver_mode,job_status,revision,requested_by,created_at,updated_at) VALUES($1,$1,$2,'fulfillment',$3,'express_ltl_label','tpl-p0-express-ltl-label','system_printer','sent',1,'U-OFFICE-A',$4,$4)",[job2.printJobId,record2.printRecordId,fulfillmentId,clock]);
  const sourceLogId="LOG-PRINT-PROJECTION-PJ-TODO-COLLISION-printed";
  const eventId=`TE-PRINT-${createHash("md5").update(`${sourceLogId}\x1f${closed.id}`).digest("hex")}`;
  await pool.query("INSERT INTO todo_events(id,todo_id,event_type,event_payload,occurred_at,created_at) VALUES($1,$2,'synthetic_identity_collision','{}',$3,$3)",[eventId,fixture.todoId,clock]);
  const snapshot=async()=>Promise.all([
    pool.query('SELECT * FROM fulfillment_records WHERE id=$1',[fulfillmentId]),
    pool.query('SELECT * FROM packages WHERE fulfillment_id=$1 ORDER BY id',[fulfillmentId]),
    pool.query('SELECT * FROM todos WHERE id=$1',[closed.id]),
    pool.query('SELECT * FROM print_records WHERE id=$1',[record2.printRecordId]),
    pool.query('SELECT * FROM print_jobs WHERE id=$1',[job2.printJobId]),
    pool.query('SELECT * FROM todo_events WHERE todo_id=$1 ORDER BY id',[closed.id]),
    pool.query('SELECT * FROM operation_logs WHERE id=$1',[sourceLogId]),
    pool.query("SELECT * FROM operation_idempotency_keys WHERE idempotency_key='pg-print-source-collision'"),
  ]).then(results=>results.map(result=>result.rows));
  const before=await snapshot(),beforeWorkspace=JSON.stringify(workspace);
  await assert.rejects(printService.persistFulfillmentPrintJobProjection({workspace,printJob:job2,operatorId:"U-PRINT-DRIVER-A",idempotencyKey:"pg-print-source-collision",printJobOperationLog:{id:"LOG-PJ-TODO-COLLISION",targetType:"print_job",targetId:job2.printJobId,action:"record_print_job_driver_status",operatorId:"U-PRINT-DRIVER-A",occurredAt:clock,createdAt:clock}}),error=>error.code==="23505");
  assert.deepEqual(await snapshot(),before,"Todo audit failure rolls back job, record, fulfillment, packages, todo, source log and receipt");
  assert.equal(JSON.stringify(workspace),beforeWorkspace);
  const packagesBeforeVoid=structuredClone(workspace.packages.filter(record=>record.fulfillmentId===fulfillmentId && record.labelPrintRecordId===printRecordId));
  assert(packagesBeforeVoid.length>0);
  let voidInput;
  workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction=async input=>{voidInput=input;return transactionRepo.recordFulfillmentAction(input);};
  const voidService=createFulfillmentPrintCommandService({
    now:()=>new Date(clock),
    buildFulfillmentActionRecord:(_workspace,record)=>({...record,fulfillmentId:record.fulfillmentId??record.id}),
    buildOperationLog:(_workspace,input)=>({...input,id:"LOG-PG-PRINT-VOID-AUDIT",occurredAt:clock,createdAt:clock}),
    buildFulfillmentPrintTemplate:()=>{throw new Error("Void must not prepare a new print");},
    buildPrintDeviceSnapshot:()=>{throw new Error("Void must not select a device");},
    getDocumentType:()=>"express_ltl_label",getTemplateId:()=>"tpl-p0-express-ltl-label",
  });
  const voidRequest={workspace,printRecordId,operatorId:"U-OFFICE-A",body:{idempotencyKey:"pg-source-void-audit",voidedAt:"2000-01-01T00:00:00.000Z",voidReason:"标签内容已变更"}};
  const voided=await voidService.voidPrintRecord(voidRequest);
  assert.deepEqual(await voidService.voidPrintRecord(voidRequest),voided,"Already-voided state must return the same original service receipt");
  assert.equal(voided.printRecord.status,"voided");
  const storedLog=(await pool.query("SELECT before_json, after_json FROM operation_logs WHERE id='LOG-PG-PRINT-VOID-AUDIT'")).rows[0];
  assert.deepEqual(storedLog.before_json.packages,packagesBeforeVoid,"Persisted void audit retains the exact original package snapshot");
  assert(storedLog.after_json.packages.every(record=>record.labelPrintRecordId==="" && record.status==="待打印标签"));
  assert.equal(new Date(storedLog.after_json.printRecord.voidedAt).toISOString(),new Date(clock).toISOString());
  assert.equal(storedLog.after_json.printRecord.voidedBy,"U-OFFICE-A");
  assert.equal((await pool.query("SELECT status FROM print_records WHERE id=$1",[printRecordId])).rows[0].status,"voided");
  const recoveryEvents=(await pool.query("SELECT event_payload FROM todo_events WHERE event_type='label_voided_reprint_required' AND event_payload->>'printRecordId'=$1",[printRecordId])).rows;
  assert.equal(recoveryEvents.length,1);
  const recoveryId=recoveryEvents[0].event_payload.todo.id;
  assert.equal((await repo.getTodo({todoId:recoveryId})).handled,false);
  assert.equal((await repo.getTodo({todoId:"T-PG-PRINT-SECOND"})).handled,true,"Old completed print todo remains historical evidence");
  assert.equal(workspace.todos.find(todo=>todo.id===recoveryId).lastAction,"标签作废后待重打");
  const originalVoidInput=voidInput;

  // Remove only the failed-attempt scaffolding inserted above; the next print is
  // created through the real command and atomic repository, not a seeded job.
  await pool.query("DELETE FROM print_jobs WHERE id=$1",[job2.printJobId]);
  await pool.query("DELETE FROM print_records WHERE id=$1",[record2.printRecordId]);
  workspace.printRecords=workspace.printRecords.filter(record=>record.printRecordId!==record2.printRecordId);
  const device={printDeviceId:"PD-PG-LABEL",name:"Synthetic label device",status:"active",supportedDocumentTypes:["express_ltl_label"],defaultDocumentTypes:["express_ltl_label"],settings:{driverMode:"system_printer"}};
  await pool.query("INSERT INTO printer_devices(id,biz_no,name,device_type,supported_document_types,default_document_types,settings_json) VALUES($1,$1,$2,'label',ARRAY['express_ltl_label'],ARRAY['express_ltl_label'],$3)",[device.printDeviceId,device.name,JSON.stringify(device.settings)]);
  workspace.printDeviceRepository={getDefaultPrintDevice:async()=>device,listPrintDevices:async()=>[device]};
  let sequence=0;
  const commandService=createFulfillmentPrintCommandService({
    now:()=>new Date(clock),
    buildFulfillmentActionRecord:(_workspace,record)=>({...record,fulfillmentId:record.fulfillmentId??record.id}),
    buildOperationLog:(_workspace,input)=>({id:`LOG-PG-RECOVERY-${++sequence}`,...input,occurredAt:clock,createdAt:clock}),
    buildFulfillmentPrintTemplate:({printRecord})=>({documentType:"express_ltl_label",templateId:printRecord.templateId}),
    buildPrintDeviceSnapshot:record=>record,
    getDocumentType:()=>"express_ltl_label",getTemplateId:()=>"tpl-p0-express-ltl-label",
  });
  const printRequest={workspace,fulfillmentId,operatorId:"U-OFFICE-A",body:{printAction:"reprint",previousPrintRecordId:printRecordId,idempotencyKey:"pg-recovery-real-reprint"}};
  const normalPrintRepository=workspace.fulfillmentActionTransactionRepository;
  const failedPrintReadRepository=createPostgresFulfillmentActionTransactionRepository({postgresClient,queryJson:async(text,values)=>{
    if(text.includes("'printState'")) throw new Error("synthetic print committed but read failed");
    return postgresClient.queryJson(text,values);
  }});
  workspace.fulfillmentActionTransactionRepository={...normalPrintRepository,recordFulfillmentPrint:input=>{captured=input;return failedPrintReadRepository.recordFulfillmentPrint(input);}};
  const beforePrintReadFailure=JSON.stringify(workspace);
  await assert.rejects(commandService.printFulfillment(printRequest),/print committed but read failed/);
  assert.equal(JSON.stringify(workspace),beforePrintReadFailure);
  workspace.fulfillmentActionTransactionRepository=normalPrintRepository;
  const queued=await commandService.printFulfillment(printRequest);
  assert.deepEqual(await commandService.printFulfillment(printRequest),queued,"Queued print retries reuse the original job");
  assert.equal(queued.printJob.jobStatus,"queued");
  const queuedInput=captured;
  assert.equal((await repo.getTodo({todoId:recoveryId})).handled,false,"A queued reprint cannot complete the recovered todo");
  const confirmed=await printService.persistFulfillmentPrintJobProjection({workspace,printJob:{...queued.printJob,jobStatus:"printed",finishedAt:clock},operatorId:"U-PRINT-DRIVER-A",idempotencyKey:"pg-recovery-print-confirmed",printJobOperationLog:{id:"LOG-PG-RECOVERY-DRIVER",targetType:"print_job",targetId:queued.printJob.printJobId,action:"record_print_job_driver_status",operatorId:"U-PRINT-DRIVER-A",occurredAt:clock,createdAt:clock}});
  assert.equal(confirmed.physicalPrintConfirmed,true);
  const confirmedInput=captured;
  assert.equal((await repo.getTodo({todoId:recoveryId})).handled,true);
  assert.equal((await repo.getTodo({todoId:"T-PG-PRINT-OTHER"})).handled,false);
  const stateAfterReprint=structuredClone({fulfillments:workspace.fulfillments,packages:workspace.packages,printRecords:workspace.printRecords,printJobs:workspace.printJobs});
  assert.deepEqual(await commandService.printFulfillment(printRequest),queued,"Printed job retries return the original submission, not a new job or current output assertion");
  const coldPrint={fulfillmentActionTransactionRepository:transactionRepo};
  assert.deepEqual(await commandService.printFulfillment({...printRequest,workspace:coldPrint}),queued);
  assert.equal(coldPrint.printJobs.find(job=>job.printJobId===queued.printJobId).jobStatus,"printed");
  const printConflictBefore=JSON.stringify(workspace);
  for(const changed of [
    {fulfillmentId:"F001"},{operatorId:"U-OTHER"},
    ...["paperNo","printDeviceId","templateId","previousPrintRecordId","reprintReason"].map(key=>({body:{...printRequest.body,[key]:"changed"}})),
  ]) await assert.rejects(commandService.printFulfillment({...printRequest,...changed}),error=>error.code==="IDEMPOTENCY_KEY_REUSED");
  assert.equal(JSON.stringify(workspace),printConflictBefore);
  const legacyBody={...printRequest.body,idempotencyKey:"pg-legacy-print-service-replay"};
  const legacyHash=buildIdempotencyRequestHash({...legacyBody,documentType:queued.printJob.documentType,templateId:queued.printJob.templateId,packageIds:queued.printJob.payload.request.packageIds,operatorId:printRequest.operatorId});
  await pool.query("INSERT INTO operation_idempotency_keys(scope,idempotency_key,request_hash,response_json,operator_id,target_type,target_id) SELECT scope,$1,$2,response_json,operator_id,target_type,target_id FROM operation_idempotency_keys WHERE scope='fulfillment.print_fulfillment' AND idempotency_key=$3",[legacyBody.idempotencyKey,legacyHash,printRequest.body.idempotencyKey]);
  assert.deepEqual(await commandService.printFulfillment({...printRequest,body:legacyBody,workspace:coldPrint}),queued,"Legacy server-derived hash is recovered from the saved job snapshot");
  await assert.rejects(commandService.printFulfillment({...printRequest,body:legacyBody,fulfillmentId:"F001"}),error=>error.code==="IDEMPOTENCY_KEY_REUSED");
  const oldVoidReceipt=await transactionRepo.recordFulfillmentAction({...originalVoidInput,
    fulfillment:{...originalVoidInput.fulfillment,driverRemark:"untrusted retry remark"},
    operationLog:{...originalVoidInput.operationLog,after:{...originalVoidInput.operationLog.after,retryNote:"untrusted retry audit"}},
  });
  assert.equal(oldVoidReceipt.recoveredPrintTodos[0].todo.status,"未处理");
  assert.equal(workspace.todos.find(todo=>todo.id===recoveryId).handled,true,"Old void receipt cannot reopen the subsequently completed recovery todo");
  assert.deepEqual({fulfillments:workspace.fulfillments,packages:workspace.packages,printRecords:workspace.printRecords,printJobs:workspace.printJobs},stateAfterReprint,"Old void replay must retain all current print business objects without a test-side cache repair");
  assert.deepEqual(workspace.operationLogs.find(log=>log.id==="LOG-PG-PRINT-VOID-AUDIT").after,storedLog.after_json,"Audit cache restores persisted evidence, never the retry input");
  assert.deepEqual(await voidService.voidPrintRecord(voidRequest),voided);
  assert.deepEqual({fulfillments:workspace.fulfillments,packages:workspace.packages,printRecords:workspace.printRecords,printJobs:workspace.printJobs},stateAfterReprint,"Service retry after reprint retains current state");
  const replayCold={fulfillmentActionTransactionRepository:transactionRepo};
  assert.deepEqual(await voidService.voidPrintRecord({...voidRequest,workspace:replayCold}),voided,"Service replay works without cached print records");
  assert.equal(replayCold.todos.find(todo=>todo.id===recoveryId).handled,true);
  const rejectedReplayState=JSON.stringify(workspace);
  for(const changed of [
    {printRecordId:queued.printRecord.printRecordId},
    {operatorId:"U-OTHER"},
    {body:{...voidRequest.body,voidReason:"different intent"}},
  ]) await assert.rejects(voidService.voidPrintRecord({...voidRequest,...changed}),error=>error.code==="IDEMPOTENCY_KEY_REUSED");
  assert.equal(JSON.stringify(workspace),rejectedReplayState,"Rejected replay cannot hydrate or mutate cache");
  const nextRecordId=queued.printRecord.printRecordId;
  const collisionDigest=createHash("sha256").update(`${fulfillmentId}\x1f${nextRecordId}`).digest("hex");
  await pool.query("INSERT INTO todo_events(id,todo_id,event_type,event_payload,occurred_at,created_at) VALUES($1,$2,'synthetic_recovery_collision','{}',$3,$3)",[`TE-LABEL-VOID-${collisionDigest}`,fixture.todoId,clock]);
  const recoverySnapshot=async()=>Promise.all([
    pool.query("SELECT * FROM fulfillment_records WHERE id=$1",[fulfillmentId]),
    pool.query("SELECT * FROM packages WHERE fulfillment_id=$1 ORDER BY id",[fulfillmentId]),
    pool.query("SELECT * FROM print_records WHERE target_id=$1 ORDER BY id",[fulfillmentId]),
    pool.query("SELECT * FROM todos WHERE ref_id=$1 ORDER BY id",[fulfillmentId]),
    pool.query("SELECT * FROM operation_logs WHERE id LIKE 'LOG-PG-RECOVERY-%' ORDER BY id"),
    pool.query("SELECT * FROM operation_idempotency_keys WHERE idempotency_key='pg-recovery-void-collision'"),
  ]).then(results=>results.map(result=>result.rows));
  const beforeRecoveryCollision=await recoverySnapshot(),workspaceBeforeRecoveryCollision=JSON.stringify(workspace);
  await assert.rejects(commandService.voidPrintRecord({workspace,printRecordId:nextRecordId,operatorId:"U-OFFICE-A",body:{voidReason:"再次核对",idempotencyKey:"pg-recovery-void-collision"}}),error=>error.code==="23505");
  assert.deepEqual(await recoverySnapshot(),beforeRecoveryCollision);
  assert.equal(JSON.stringify(workspace),workspaceBeforeRecoveryCollision);
  const localRecoveryWorkspace={
    fulfillments:[structuredClone(originalVoidInput.operationLog.before.fulfillment)],
    packages:structuredClone(originalVoidInput.operationLog.before.packages),
    printRecords:[structuredClone(originalVoidInput.operationLog.before.printRecord)],
    printJobs:[],operationLogs:[],todoEvents:[],
    todos:[{id:"T-LOCAL-HISTORY",type:"待打印标签",refType:"fulfillment",refId:fulfillmentId,status:"已处理",handled:true}],
  };
  const localRecoveryBefore=JSON.stringify(localRecoveryWorkspace);
  localRecoveryWorkspace.todoEvents=[{eventId:recoveryEvents[0].event_payload.todo.id.replace("T-LABEL-VOID-","TE-LABEL-VOID-")}];
  const localCollisionBefore=JSON.stringify(localRecoveryWorkspace);
  assert.throws(()=>localRepo.recordFulfillmentAction({...originalVoidInput,workspace:localRecoveryWorkspace}),/identity already exists/);
  assert.equal(JSON.stringify(localRecoveryWorkspace),localCollisionBefore,"Local recovery audit failure must not commit staged business changes");
  Object.assign(localRecoveryWorkspace,JSON.parse(localRecoveryBefore));
  await localRepo.recordFulfillmentAction({...originalVoidInput,workspace:localRecoveryWorkspace});
  assert.equal(localRecoveryWorkspace.todos.find(todo=>todo.id===recoveryId).handled,false);
  await localRepo.recordFulfillmentAction({...queuedInput,workspace:localRecoveryWorkspace});
  assert.equal(localRecoveryWorkspace.todos.find(todo=>todo.id===recoveryId).handled,false);
  await localRepo.recordFulfillmentAction({...confirmedInput,workspace:localRecoveryWorkspace});
  assert.equal(localRecoveryWorkspace.todos.find(todo=>todo.id===recoveryId).handled,true);
  const localVoidReplay=await localRepo.recordFulfillmentAction({...originalVoidInput,workspace:localRecoveryWorkspace});
  assert.equal(localVoidReplay.recoveredPrintTodos[0].todo.handled,false);
  assert.equal(localRecoveryWorkspace.todos.find(todo=>todo.id===recoveryId).handled,true);
  assert.equal(localRecoveryWorkspace.todos.find(todo=>todo.id==="T-LOCAL-HISTORY").handled,true);
  assert.equal(localRecoveryWorkspace.todoEvents.filter(event=>event.eventType==="label_voided_reprint_required").length,1);
  localRecoveryWorkspace.fulfillmentActionTransactionRepository=localRepo;
  const localServiceState=JSON.stringify(localRecoveryWorkspace);
  const localServiceReplay=await voidService.voidPrintRecord({...voidRequest,workspace:localRecoveryWorkspace});
  assert.equal(localServiceReplay.operationLogId,voided.operationLogId);
  assert.equal(JSON.stringify(localRecoveryWorkspace),localServiceState);
  const legacyReceipt=localRecoveryWorkspace.operationIdempotencyRecords.find(record=>record.scope==="fulfillment.void_print_record");
  legacyReceipt.requestHash=buildIdempotencyRequestHash({...voidRequest.body,operatorId:voidRequest.operatorId});
  assert.equal((await voidService.voidPrintRecord({...voidRequest,workspace:localRecoveryWorkspace})).operationLogId,voided.operationLogId,"Legacy unbound hash still requires exact receipt target");
  for(const changed of [{printRecordId:nextRecordId},{operatorId:"U-OTHER"},{body:{...voidRequest.body,voidReason:"changed"}}]) {
    await assert.rejects(voidService.voidPrintRecord({...voidRequest,workspace:localRecoveryWorkspace,...changed}),error=>error.code==="IDEMPOTENCY_KEY_REUSED");
  }
  console.log("PASS print void service replay: already voided, later reprint, cold cache, exact target/operator/intent, legacy receipt binding; no duplicate source writes");
  // Pause an actual current-state read, advance the source, then release the
  // old read. No test-side assignment repairs workspace business collections.
  await pool.query("DELETE FROM todo_events WHERE id=$1 AND event_type='synthetic_recovery_collision'",[`TE-LABEL-VOID-${collisionDigest}`]);
  let capturedRead,releaseRead;
  const readCaptured=new Promise(resolve=>capturedRead=resolve),readRelease=new Promise(resolve=>releaseRead=resolve);
  const delayedRepo=createPostgresFulfillmentActionTransactionRepository({postgresClient,queryJson:async(text,values)=>{
    const value=await postgresClient.queryJson(text,values);
    if(text.includes("'printState'")){capturedRead();await readRelease;}
    return value;
  }});
  const delayedReplay=delayedRepo.recordFulfillmentAction(originalVoidInput);
  await readCaptured;
  const beforeNewVoid=JSON.stringify(workspace);
  let failRead=true;
  const faultRepo=createPostgresFulfillmentActionTransactionRepository({postgresClient,queryJson:async(text,values)=>{
    if(failRead&&text.includes("'printState'")){failRead=false;throw new Error("synthetic current-state read failure after commit");}
    return postgresClient.queryJson(text,values);
  }});
  workspace.fulfillmentActionTransactionRepository=faultRepo;
  const newVoidRequest={workspace,printRecordId:nextRecordId,operatorId:"U-OFFICE-A",body:{voidReason:"当前标签需重印",idempotencyKey:"pg-current-print-void-read-failure"}};
  try {
    await assert.rejects(commandService.voidPrintRecord(newVoidRequest),/current-state read failure after commit/);
    assert.equal(JSON.stringify(workspace),beforeNewVoid,"A failed current read must not partly merge a committed receipt into the cache");
    assert.equal((await pool.query("SELECT status FROM print_records WHERE id=$1",[nextRecordId])).rows[0].status,"voided");
    workspace.fulfillmentActionTransactionRepository=transactionRepo;
    await commandService.voidPrintRecord(newVoidRequest);
  } finally { releaseRead(); }
  const afterNewVoid=structuredClone({fulfillments:workspace.fulfillments,packages:workspace.packages,printRecords:workspace.printRecords,printJobs:workspace.printJobs});
  await delayedReplay;
  assert.deepEqual({fulfillments:workspace.fulfillments,packages:workspace.packages,printRecords:workspace.printRecords,printJobs:workspace.printJobs},afterNewVoid,"Delayed pre-void state cannot restore prior labels or revisions");
  assert.deepEqual(await commandService.printFulfillment(printRequest),queued,"Voided job cannot be resubmitted by an old request");
  assert.deepEqual({fulfillments:workspace.fulfillments,packages:workspace.packages,printRecords:workspace.printRecords,printJobs:workspace.printJobs},afterNewVoid);
  const latestRecoveryId=`T-LABEL-VOID-${collisionDigest}`;
  assert.equal(workspace.todos.find(todo=>todo.id===latestRecoveryId).handled,false);
  const newRecoveryCount=(await pool.query("SELECT count(*)::int n FROM todo_events WHERE todo_id=$1 AND event_type='label_voided_reprint_required'",[latestRecoveryId])).rows[0].n;
  assert.equal(newRecoveryCount,1,"Retry after a committed write and failed read cannot create a second recovery event");
  await transactionRepo.recordFulfillmentPrint(queuedInput);
  assert.deepEqual({fulfillments:workspace.fulfillments,packages:workspace.packages,printRecords:workspace.printRecords,printJobs:workspace.printJobs},afterNewVoid,"Old queued-print receipt cannot replace the later void");
  const coldWorkspace={};
  await transactionRepo.recordFulfillmentAction({...originalVoidInput,workspace:coldWorkspace});
  assert.equal(coldWorkspace.fulfillments[0].revision,afterNewVoid.fulfillments[0].revision);
  assert.equal(coldWorkspace.printRecords.find(record=>record.printRecordId===nextRecordId).status,"voided");
  assert.equal(coldWorkspace.todos.find(todo=>todo.id===latestRecoveryId).handled,false,"Cold replay recovers current linked todos created after the original receipt");
  assert.equal(coldWorkspace.todos.find(todo=>todo.id===recoveryId).handled,true);
  assert(coldWorkspace.packages.every(record=>record.labelPrintRecordId===""));
  const printSnapshot=async()=>Promise.all([
    pool.query("SELECT * FROM fulfillment_records WHERE id=$1",[fulfillmentId]),
    pool.query("SELECT * FROM packages WHERE fulfillment_id=$1 ORDER BY id",[fulfillmentId]),
    pool.query("SELECT * FROM print_records WHERE target_id=$1 ORDER BY id",[fulfillmentId]),
    pool.query("SELECT * FROM print_jobs WHERE target_id=$1 ORDER BY id",[fulfillmentId]),
    pool.query("SELECT * FROM operation_logs ORDER BY id"),
    pool.query("SELECT * FROM operation_idempotency_keys WHERE idempotency_key LIKE 'pg-print-current-log-collision-%' ORDER BY idempotency_key"),
  ]).then(results=>results.map(result=>result.rows));
  for(const slot of ["operationLog","printJobOperationLog"]){
    const beforeCollision=await printSnapshot(),beforeCache=JSON.stringify(workspace);
    workspace.fulfillmentActionTransactionRepository={...transactionRepo,recordFulfillmentPrint:input=>transactionRepo.recordFulfillmentPrint({...input,[slot]:{...input[slot],id:slot==="operationLog"?"LOG-PG-PRINT-VOID-AUDIT":"LOG-PG-RECOVERY-DRIVER"}})};
    await assert.rejects(commandService.printFulfillment({workspace,fulfillmentId,operatorId:"U-OFFICE-A",body:{printAction:"reprint",previousPrintRecordId:nextRecordId,idempotencyKey:`pg-print-current-log-collision-${slot}`}}),error=>error.code==="23505");
    assert.deepEqual(await printSnapshot(),beforeCollision,"Print/source audit identity collisions cannot overwrite history or partially write business data");
    assert.equal(JSON.stringify(workspace),beforeCache);
  }
  workspace.fulfillmentActionTransactionRepository=transactionRepo;
  const thirdRequest={workspace,fulfillmentId,operatorId:"U-OFFICE-A",body:{printAction:"reprint",previousPrintRecordId:nextRecordId,idempotencyKey:"pg-current-third-print"}};
  const concurrentPrints=await Promise.all([commandService.printFulfillment(thirdRequest),commandService.printFulfillment(thirdRequest)]);
  assert.deepEqual(concurrentPrints[0],concurrentPrints[1],"Concurrent same-key print commands converge on one original response");
  const thirdPrint=concurrentPrints[0];
  assert.equal((await pool.query("SELECT count(*)::int n FROM print_jobs WHERE print_record_id=$1",[thirdPrint.printRecord.printRecordId])).rows[0].n,1);
  const beforeCallbackRevision=workspace.fulfillments.find(record=>record.id===fulfillmentId).revision;
  const callback={workspace,printJob:{...thirdPrint.printJob,jobStatus:"printed",finishedAt:clock},operatorId:"U-PRINT-DRIVER-A",idempotencyKey:"pg-current-same-callback",printJobOperationLog:{id:"LOG-PG-CURRENT-SAME-CALLBACK",targetType:"print_job",targetId:thirdPrint.printJob.printJobId,action:"record_print_job_driver_status",operatorId:"U-PRINT-DRIVER-A",occurredAt:clock,createdAt:clock}};
  const callbacks=await Promise.all([printService.persistFulfillmentPrintJobProjection(callback),printService.persistFulfillmentPrintJobProjection(callback)]);
  assert(callbacks.every(result=>result.physicalPrintConfirmed));
  assert.equal(callbacks[0].fulfillmentOperationLogId,callbacks[1].fulfillmentOperationLogId);
  assert.equal(workspace.fulfillments.find(record=>record.id===fulfillmentId).revision,beforeCallbackRevision+1);
  assert.equal((await repo.getTodo({todoId:latestRecoveryId})).handled,true);
  assert.equal((await pool.query("SELECT count(*)::int n FROM todo_events WHERE todo_id=$1 AND event_type='trusted_label_print_completed'",[latestRecoveryId])).rows[0].n,1);
  const localAuditCollision=JSON.parse(localRecoveryBefore);
  localAuditCollision.operationLogs=[{id:originalVoidInput.operationLog.id,after:{keep:"original"}}];
  const localAuditBefore=JSON.stringify(localAuditCollision);
  assert.throws(()=>localRepo.recordFulfillmentAction({...originalVoidInput,workspace:localAuditCollision}),/Print audit identity already exists/);
  assert.equal(JSON.stringify(localAuditCollision),localAuditBefore);
  console.log("PASS print command replay: original template/job, queued/printed/voided and cold state, legacy hash, target/operator/intent rejection and concurrent same-key submission. Synthetic device only.");
  console.log("PASS print audit conflicts and same-key callbacks: both audit IDs strictly protected, all-object rollback, one revision/event for concurrent trusted callbacks, Local audit collision leaves cache untouched.");
  console.log("PASS print current-state recovery: original audit, warm/cold old receipts, queued replay, delayed read after newer void, post-commit read failure and service retry without duplicate events. No manual business-cache restoration.");
  console.log("PASS label void recovery: new source-owned todo, queued reprint remains open, trusted reprint closes it, old void replay preserves current todo, audit collision rolls back the whole void. Synthetic device only.");
  console.log("PASS persisted void audit: exact pre-release package snapshots and server-owned actor/time in operation evidence. No physical output.");
  console.log("PASS trusted label print source: three manual close aliases blocked, PostgreSQL multi-todo atomic completion/audit, foreign target isolation, replay preserves reopen, all-object audit-collision rollback, local atomic completion/replay. Synthetic jobs only.");
}
