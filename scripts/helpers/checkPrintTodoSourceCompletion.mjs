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
  console.log("PASS trusted label todo completion: exact source and other fulfillment isolation, replays preserve reopened state, no local partial writes.");
}
