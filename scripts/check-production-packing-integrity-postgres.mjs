import {createPostgresPrinterDeviceFieldTestRepository} from "../server/printerDeviceFieldTestRepository.mjs";
import {checkPostgresLiveMaintenanceScenario} from "./helpers/postgresLiveMaintenanceScenario.mjs";
import { createPostgresCoreWorkspaceReadRepository } from '../server/coreWorkspaceReadRepository.mjs';
import { createTodoReadProjectionService } from '../server/services/todoReadProjectionService.mjs';
import assert from 'node:assert/strict';
import { createProductionFinishedGoodsPhotoProjectionService } from '../server/services/productionFinishedGoodsPhotoProjectionService.mjs';
import { buildUploadPhotoTransactionQuery, createPostgresProductionFinishedGoodsPhotoTransactionRepository } from '../server/productionFinishedGoodsPhotoTransactionRepository.mjs';
import { createPostgresProductionPackingReadRepository } from '../server/productionPackingReadRepository.mjs';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { loadMigrationFiles, validateMigrationSet } from './dbMigrationUtils.mjs';
import { postgresLiveBusinessSeedSql } from './helpers/postgresLiveBusinessSeed.mjs';
import { createPostgresPoolClient } from '../server/postgresPoolClient.mjs';
import { createPostgresProductionPackingTransactionRepository, buildRecordProductionReportTransactionQuery, buildCompletePackingTaskTransactionQuery } from '../server/productionPackingTransactionRepository.mjs';
const name = `erp-production-integrity-${process.pid}-${Date.now()}`;
const docker = args => {
  const r = spawnSync('docker', args, {
    encoding: 'utf8'
  });
  if (r.status !== 0) throw Error(r.stderr || r.stdout);
  return r.stdout.trim();
};
let pool;
try {
  docker(['run', '--rm', '-d', '--name', name, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_DB=erp', '-e', 'POSTGRES_USER=erp', '-e', 'POSTGRES_PASSWORD=erp', 'postgres:16-alpine']);
  for (let i = 0; i < 60; i++) {
    const r = spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'erp']);
    if (r.status === 0) break;
    if (i === 59) throw Error('PostgreSQL startup timeout');
    await new Promise(r => setTimeout(r, 250));
  }
  const port = Number(docker(['port', name, '5432/tcp']).split(':').at(-1));
  pool = new pg.Pool({
    host: '127.0.0.1',
    port,
    database: 'erp',
    user: 'erp',
    password: 'erp'
  });
  const migrations = loadMigrationFiles();
  validateMigrationSet(migrations);
  for (const migration of migrations) await pool.query(migration.sql);
  await pool.query(postgresLiveBusinessSeedSql);
  await pool.query("INSERT INTO machines(id,biz_no,name,machine_type,workshop,status,enabled,created_by) VALUES ('PRINT-SAFE','PRINT-SAFE','Integrity silk machine','silk_screen','丝印车间','active',true,'U-OFFICE-A')");
  await pool.query("INSERT INTO production_tasks(id,biz_no,order_line_id,task_type,machine_id,planned_qty,task_status,created_by) VALUES ('PT-SILK','PT-SILK','OL-LIVE-PROD-001','丝印','PRINT-SAFE',80,'丝印中','U-WORKSHOP-A')");
  const client = createPostgresPoolClient({
    pool
  });
  const repo = createPostgresProductionPackingTransactionRepository({
    postgresClient: client
  });
  const input = {
    productionTask: {
      productionTaskId: 'PT-SILK',
      orderLineId: 'OL-LIVE-PROD-001',
      taskType: '丝印',
      machineId: 'PRINT-SAFE',
      plannedQty: 80,
      taskStatus: '已完成',
      revision: 1,
      createdBy: 'U-WORKSHOP-A'
    },
    downstreamProductionTask: {
      productionTaskId: 'PT-SILK-BAG',
      orderLineId: 'OL-LIVE-PROD-001',
      taskType: '制袋',
      machineId: '',
      plannedQty: 70,
      taskStatus: '待排产',
      createdBy: 'U-WORKSHOP-A'
    },
    workshopReport: {
      reportId: 'WR-SILK',
      productionTaskId: 'PT-SILK',
      orderLineId: 'OL-LIVE-PROD-001',
      processType: '丝印',
      machineId: 'PRINT-SAFE',
      qualifiedQty: 70,
      exceptionQty: 10,
      machineCount: 80,
      operatorId: 'U-WORKSHOP-A'
    },
    orderLine: {
      orderLineId: 'OL-LIVE-PROD-001',
      lineStatus: '待排产',
      exceptionTags: ['数量差异待处理'],
      revision: 1
    },
    todo: {
      id: 'T-SILK-DIFF',
      type: '生产异常',
      ref: 'PT-SILK',
      refType: 'production_task',
      summary: '计划80，交给制袋70',
      status: '未处理',
      createdBy: 'U-WORKSHOP-A'
    },
    operationLog: {
      id: 'LOG-SILK',
      targetType: 'production_task',
      targetId: 'PT-SILK',
      action: 'complete_silk_screen_handoff',
      operatorId: 'U-WORKSHOP-A'
    },
    inventoryAdjustments: [],
    inventoryReservations: [],
    inventoryLedgerEntries: [],
    idempotencyKey: 'production-integrity-live-001',
    idempotencyPayload: {
      productionTaskId: 'PT-SILK',
      qualifiedQty: 70
    }
  };
  const inventoryBefore = (await pool.query('SELECT id,on_hand_qty,reserved_qty FROM inventory_items ORDER BY id')).rows;
  const results = await Promise.all([repo.recordProductionReport(input), repo.recordProductionReport(input)]);
  assert.equal(results[0].downstreamProductionTask.productionTaskId, 'PT-SILK-BAG');
  assert.equal(results[1].downstreamProductionTask.productionTaskId, 'PT-SILK-BAG');
  assert.equal((await pool.query("SELECT count(*)::int n FROM production_tasks WHERE id='PT-SILK-BAG'")).rows[0].n, 1);
  assert.equal((await pool.query("SELECT machine_id,task_status,planned_qty FROM production_tasks WHERE id='PT-SILK-BAG'")).rows[0].machine_id, null);
  assert.equal((await pool.query("SELECT count(*)::int n FROM workshop_reports WHERE production_task_id='PT-SILK'")).rows[0].n, 1);
  assert.equal((await pool.query("SELECT count(*)::int n FROM todos WHERE id='T-SILK-DIFF'")).rows[0].n, 1);
  assert.equal((await pool.query("SELECT count(*)::int n FROM packing_tasks WHERE order_line_id='OL-LIVE-PROD-001'")).rows[0].n, 0);
  assert.deepEqual((await pool.query('SELECT id,on_hand_qty,reserved_qty FROM inventory_items ORDER BY id')).rows, inventoryBefore);
  for (const [todoId, taskId] of [['T-RETAKE-SILK', 'PT-SILK'], ['T-RETAKE-BAG', 'PT-SILK-BAG']]) {
    await pool.query("INSERT INTO todos (id,biz_no,type,ref_type,ref_id,priority,status,summary,created_by) VALUES ($1,$1,'成品图需重拍','order_line','OL-LIVE-PROD-001','异常','未处理','合成重拍待办','U-OFFICE-A')", [todoId]);
    await pool.query("INSERT INTO todo_events(id,todo_id,event_type,event_payload,operator_id,occurred_at,created_at) VALUES ($1,$2,'todo_source:finished_goods_photo_retake_required',$3::jsonb,'U-OFFICE-A',NOW(),NOW())", [`TE-${todoId}`, todoId, JSON.stringify({ productionTaskId: taskId, orderLineId: 'OL-LIVE-PROD-001' })]);
  }
  // Read persisted rows through the actual cold core snapshot, not the photo command cache.
  const coldWorkspace = await createPostgresCoreWorkspaceReadRepository({ postgresClient: client }).loadState();
  const todoProjection = createTodoReadProjectionService();
  for (const [todoId, taskId] of [['T-RETAKE-SILK', 'PT-SILK'], ['T-RETAKE-BAG', 'PT-SILK-BAG']]) {
    const todo = coldWorkspace.todos.find(item => item.id === todoId);
    assert(todo, `Cold snapshot missing ${todoId}`);
    const projected = todoProjection.projectTodo({ workspace: coldWorkspace, todo });
    assert.equal(projected.productionTaskId, taskId);
    assert.equal(projected.productionTaskReferenceStatus, 'valid');
  }
  const photoRepository = createPostgresProductionFinishedGoodsPhotoTransactionRepository({ postgresClient: client });
  const photoBefore = await photoRepository.getProductionTask({ productionTaskId: 'PT-SILK' });
  const wrongPhotoQuery = buildUploadPhotoTransactionQuery({
    productionTask: { ...photoBefore, orderLineId: 'OL-LIVE-EXPORT-LINE-001', revision: photoBefore.revision + 1, finishedGoodsPhoto: { status: '待确认', attachmentId: 'TEST-WRONG-ORDER' }, updatedAt: new Date().toISOString() },
    operationLog: { id: 'LOG-WRONG-PHOTO-ORDER', targetType: 'production_task', targetId: 'PT-SILK', action: 'upload_finished_goods_photo', operatorId: 'U-OFFICE-A' },
  });
  const photoConnection = await pool.connect();
  try {
    await photoConnection.query('BEGIN');
    await assert.rejects(photoConnection.query(wrongPhotoQuery.text.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, ''), wrongPhotoQuery.values), /ERP_PRODUCTION_PHOTO_CONCURRENCY_CONFLICT/);
  } finally {
    await photoConnection.query('ROLLBACK');
    photoConnection.release();
  }
  assert.deepEqual(await photoRepository.getProductionTask({ productionTaskId: 'PT-SILK' }), photoBefore);
  assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE id='LOG-WRONG-PHOTO-ORDER'")).rows[0].n, 0);
  const stalePhotoQuery = buildUploadPhotoTransactionQuery({
    productionTask: { ...photoBefore, revision: photoBefore.revision + 1, finishedGoodsPhoto: { status: '待确认', attachmentId: 'TEST-STALE-ORDER' }, updatedAt: new Date().toISOString() },
    operationLog: { id: 'LOG-STALE-PHOTO-ORDER', targetType: 'production_task', targetId: 'PT-SILK', action: 'upload_finished_goods_photo', operatorId: 'U-OFFICE-A' },
  });
  const blocker = await pool.connect();
  const waiter = await pool.connect();
  let pendingPhoto;
  try {
    await blocker.query('BEGIN');
    await blocker.query("UPDATE production_tasks SET order_line_id='OL-LIVE-EXPORT-LINE-001' WHERE id='PT-SILK'");
    await waiter.query('BEGIN');
    const waiterPid = (await waiter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pendingPhoto = waiter.query(stalePhotoQuery.text.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, ''), stalePhotoQuery.values)
      .then(() => ({ accepted: true }), error => ({ error }));
    let observedWait = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const waiting = await pool.query('SELECT cardinality(pg_blocking_pids($1)) > 0 AS waiting', [waiterPid]);
      if (waiting.rows[0].waiting) { observedWait = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(observedWait, true, 'photo write must actually wait on the held task row');
    await blocker.query('COMMIT');
    const outcome = await pendingPhoto;
    assert.match(outcome.error?.message ?? '', /ERP_PRODUCTION_PHOTO_CONCURRENCY_CONFLICT/);
  } finally {
    await blocker.query('ROLLBACK');
    if (pendingPhoto) await pendingPhoto;
    await waiter.query('ROLLBACK');
    blocker.release(); waiter.release();
    await pool.query("UPDATE production_tasks SET order_line_id='OL-LIVE-PROD-001' WHERE id='PT-SILK'");
  }
  assert.deepEqual(await photoRepository.getProductionTask({ productionTaskId: 'PT-SILK' }), photoBefore);
  assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE id='LOG-STALE-PHOTO-ORDER'")).rows[0].n, 0);
  const photoContext = await photoRepository.getPhotoTodoContext({ orderLineId: 'OL-LIVE-PROD-001', workspace: { todos: [], productionTasks: [], todoEvents: [] } });
  assert(photoContext.productionTasks.some(task => task.productionTaskId === 'PT-SILK'));
  assert(photoContext.productionTasks.some(task => task.productionTaskId === 'PT-SILK-BAG'));
  assert(Array.isArray(photoContext.todos));
  assert(Array.isArray(photoContext.todoEvents));
  assert.deepEqual(photoContext.todos.map(todo => todo.id).sort(), ['T-RETAKE-BAG', 'T-RETAKE-SILK']);
  assert.equal(photoContext.todoEvents.find(event => event.todoId === 'T-RETAKE-SILK').eventPayload.productionTaskId, 'PT-SILK');
  assert.equal(photoContext.todoEvents.find(event => event.todoId === 'T-RETAKE-BAG').eventPayload.productionTaskId, 'PT-SILK-BAG');
  const photoProjection = createProductionFinishedGoodsPhotoProjectionService({ buildTodo: (_workspace, value) => value });
  for (const [taskId, expectedTodo] of [['PT-SILK', 'T-RETAKE-SILK'], ['PT-SILK-BAG', 'T-RETAKE-BAG']]) {
    const projected = photoProjection.buildPhotoRetakeTodo(photoContext, { id: 'OL-LIVE-PROD-001' }, { productionTaskId: taskId }, '重新拍摄', 'U-OFFICE-A', 'MUST-NOT-CREATE');
    assert.equal(projected.id, expectedTodo);
  }

  const reads = createPostgresProductionPackingReadRepository({ postgresClient: client });
  const silkRead = await reads.getProductionTaskDetail({ productionTaskId: 'PT-SILK' });
  const bagRead = await reads.getProductionTaskDetail({ productionTaskId: 'PT-SILK-BAG' });
  assert.deepEqual(silkRead.reports.map(report => report.reportId), ['WR-SILK']);
  assert.equal(silkRead.latestReport.reportId, 'WR-SILK');
  assert.deepEqual(bagRead.reports, []);
  assert.equal(bagRead.latestReport, null);
  assert.deepEqual(bagRead.inventoryLedgerEntries, []);
  const stageList = await reads.listProductionTasks({ query: { pageSize: 200 } });
  assert.equal(stageList.items.find(item => item.productionTaskId === 'PT-SILK-BAG').latestReport, null);
  assert.equal(stageList.items.find(item => item.productionTaskId === 'PT-SILK').latestReport.reportId, 'WR-SILK');
  // A fresh caller cannot change persisted task ownership even with a internally consistent payload.
  await pool.query("UPDATE production_tasks SET task_status='丝印中' WHERE id='PT-SILK'");
  const wrongLine = 'OL-LIVE-EXPORT-LINE-001';
  const malicious = {
    ...input,
    productionTask: {
      ...input.productionTask,
      orderLineId: wrongLine,
      revision: 2
    },
    workshopReport: {
      ...input.workshopReport,
      reportId: 'WR-REBIND',
      orderLineId: wrongLine
    },
    downstreamProductionTask: {
      ...input.downstreamProductionTask,
      productionTaskId: 'PT-REBIND-BAG',
      orderLineId: wrongLine
    },
    orderLine: {
      orderLineId: wrongLine,
      lineStatus: '待排产',
      revision: 1
    },
    operationLog: {
      ...input.operationLog,
      id: 'LOG-REBIND'
    },
    todo: null
  };
  const wrongQuery = buildRecordProductionReportTransactionQuery(malicious);
  await assert.rejects(client.transactionJson(wrongQuery.text, wrongQuery.values), {
    code: 'BUSINESS_WRITE_CONFLICT',
    statusCode: 409
  });
  assert.equal((await pool.query("SELECT count(*)::int n FROM workshop_reports WHERE id='WR-REBIND'")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM production_tasks WHERE id='PT-REBIND-BAG'")).rows[0].n, 0);
  await pool.query("INSERT INTO packing_tasks(id,biz_no,order_line_id,planned_qty,status,created_by) VALUES ('PK-SAFE','PK-SAFE','OL-LIVE-PROD-001',100,'待打包','U-WORKSHOP-A')");
  const packInput = {
    packingTask: {
      packingTaskId: 'PK-SAFE',
      orderLineId: 'OL-LIVE-PROD-001',
      plannedQty: 100,
      actualPackedQty: 100,
      status: '已完成',
      revision: 1
    },
    packages: [{
      packageId: 'PKG-A',
      orderLineId: 'OL-LIVE-PROD-001',
      packageSeq: 1,
      packageCount: 2,
      packedQty: 60
    }, {
      packageId: 'PKG-B',
      orderLineId: 'OL-LIVE-PROD-001',
      packageSeq: 2,
      packageCount: 2,
      packedQty: 60
    }],
    operationLog: {
      id: 'LOG-PACK',
      targetType: 'packing_task',
      targetId: 'PK-SAFE',
      action: 'complete_packing_task',
      operatorId: 'U-WORKSHOP-A'
    }
  };
  assert.throws(() => buildCompletePackingTaskTransactionQuery(packInput), {
    code: 'PACKING_PACKAGE_QUANTITY_MISMATCH'
  });
  assert.equal((await pool.query("SELECT status FROM packing_tasks WHERE id='PK-SAFE'")).rows[0].status, '待打包');
  packInput.packages[1].packedQty = 40;
  const saved = await repo.completePackingTask({
    ...packInput,
    idempotencyKey: 'packing-integrity-live-001',
    idempotencyPayload: {
      packingTaskId: 'PK-SAFE',
      actualPackedQty: 100
    }
  });
  assert.equal(saved.packages.reduce((sum, p) => sum + p.packedQty, 0), 100);
  assert.equal((await pool.query("SELECT sum(packed_qty)::int n FROM packages WHERE id IN ('PKG-A','PKG-B')")).rows[0].n, 100);
  await pool.query("UPDATE fulfillment_records SET physical_outbound_at='2026-09-05T01:00:00Z', status='已交付', final_delivery_at='2026-09-05T02:00:00Z' WHERE id='F001'");
  // A stale packing command cannot reopen an already physically delivered batch.
  await pool.query("INSERT INTO packing_tasks(id,biz_no,order_line_id,planned_qty,status,created_by) VALUES ('PK-TERMINAL','PK-TERMINAL','ORD-0629-001-01',40,'待打包','U-WORKSHOP-A')");
  const terminalPacking = buildCompletePackingTaskTransactionQuery({
    packingTask: { packingTaskId: 'PK-TERMINAL', orderLineId: 'ORD-0629-001-01', plannedQty: 40, actualPackedQty: 40, status: '已完成', revision: 1 },
    fulfillment: { fulfillmentId: 'F001', orderLineId: 'ORD-0629-001-01', expectedQty: 500, actualQty: 40, status: '已备货', revision: 1 },
    packages: [{ packageId: 'PKG-TERMINAL', orderLineId: 'ORD-0629-001-01', fulfillmentId: 'F001', packageSeq: 1, packageCount: 1, packedQty: 40 }],
    operationLog: { id: 'LOG-PACK-TERMINAL', targetType: 'packing_task', targetId: 'PK-TERMINAL', action: 'complete_packing_task', operatorId: 'U-WORKSHOP-A' },
  });
  await assert.rejects(client.transactionJson(terminalPacking.text, terminalPacking.values), { code: 'BUSINESS_WRITE_CONFLICT', statusCode: 409 });
  assert.deepEqual((await pool.query("SELECT actual_qty,status FROM fulfillment_records WHERE id='F001'")).rows[0], { actual_qty: 500, status: '已交付' });
  assert.equal((await pool.query("SELECT status FROM packing_tasks WHERE id='PK-TERMINAL'")).rows[0].status, '待打包');
  assert.equal((await pool.query("SELECT count(*)::int n FROM packages WHERE id='PKG-TERMINAL'")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE id='LOG-PACK-TERMINAL'")).rows[0].n, 0);
  console.log('PostgreSQL terminal packing guard passed: historical batch retained, task/package/log rollback');

  // A new request cannot overwrite an accepted daily segment; every side effect rolls back.
  await pool.query("INSERT INTO production_tasks(id,biz_no,order_line_id,task_type,machine_id,planned_qty,task_status,created_by) VALUES ('PT-APPEND','PT-APPEND','OL-LIVE-PROD-001','制袋','PRINT-SAFE',100,'制袋中','U-WORKSHOP-A')");
  const dailyInput = {
    productionTask: { productionTaskId: 'PT-APPEND', orderLineId: 'OL-LIVE-PROD-001', taskType: '制袋', machineId: 'PRINT-SAFE', plannedQty: 100, taskStatus: '跨日继续', revision: 1 },
    workshopReport: { reportId: 'DAY-APPEND', productionTaskId: 'PT-APPEND', orderLineId: 'OL-LIVE-PROD-001', processType: '制袋', machineId: 'PRINT-SAFE', qualifiedQty: 60, exceptionQty: 0, operatorId: 'U-WORKSHOP-A', evidence: { reportKind: 'daily_progress' } },
    operationLog: { id: 'LOG-DAY-APPEND', targetType: 'production_task', targetId: 'PT-APPEND', action: 'record_production_daily_progress', operatorId: 'U-WORKSHOP-A' },
    idempotencyKey: 'day-append-one', idempotencyPayload: { reportId: 'DAY-APPEND', qualifiedQty: 60 },
  };
  const dailySaved = await repo.recordProductionDailyProgress(dailyInput);
  const taskBeforeDuplicate = (await pool.query("SELECT revision,task_status FROM production_tasks WHERE id='PT-APPEND'")).rows[0];
  await assert.rejects(repo.recordProductionDailyProgress({ ...dailyInput,
    productionTask: { ...dailyInput.productionTask, revision: taskBeforeDuplicate.revision },
    workshopReport: { ...dailyInput.workshopReport, qualifiedQty: 10 },
    operationLog: { ...dailyInput.operationLog, id: 'LOG-DAY-OVERWRITE' },
    idempotencyKey: 'day-append-different', idempotencyPayload: { reportId: 'DAY-APPEND', qualifiedQty: 10 },
  }));
  assert.equal((await pool.query("SELECT qualified_qty FROM workshop_reports WHERE id='DAY-APPEND'")).rows[0].qualified_qty, 60);
  assert.deepEqual((await pool.query("SELECT revision,task_status FROM production_tasks WHERE id='PT-APPEND'")).rows[0], taskBeforeDuplicate);
  assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE id='LOG-DAY-OVERWRITE'")).rows[0].n, 0);
  const dailyReplay = await repo.recordProductionDailyProgress(dailyInput);
  assert.deepEqual(dailyReplay, dailySaved);
  console.log('PostgreSQL daily append-only passed: duplicate rejected, report/task/log rollback, identical replay');

  {
  await pool.query("INSERT INTO production_tasks(id,biz_no,order_line_id,task_type,planned_qty,task_status) VALUES ('PT-PHOTO-REPLAY','PT-PHOTO-REPLAY','ORD-0629-001-01','制袋',10,'待排产')");
  const photoRepository=createPostgresProductionFinishedGoodsPhotoTransactionRepository({postgresClient:client});
  const photoWorkspace={productionTasks:[{productionTaskId:'PT-PHOTO-REPLAY',orderLineId:'ORD-0629-001-01',revision:1}],todos:[],todoEvents:[],operationLogs:[]};
  const photoInput={workspace:photoWorkspace,productionTask:{productionTaskId:'PT-PHOTO-REPLAY',orderLineId:'ORD-0629-001-01',revision:2,finishedGoodsPhoto:{attachmentId:'ATT-ORIGINAL'},updatedAt:'2026-09-01T00:00:00Z'},operationLog:{id:'LOG-PHOTO-REPLAY',targetType:'production_task',targetId:'PT-PHOTO-REPLAY',action:'upload_finished_goods_photo',operatorId:'U-OFFICE-A',occurredAt:'2026-09-01T00:00:00Z',createdAt:'2026-09-01T00:00:00Z'},idempotencyKey:'photo-immutable-replay',idempotencyPayload:{productionTaskId:'PT-PHOTO-REPLAY',attachmentId:'ATT-ORIGINAL'}};
  const photoSaved=await photoRepository.uploadPhoto(photoInput);
  await pool.query("UPDATE production_tasks SET revision=3,finished_goods_photo=$1 WHERE id='PT-PHOTO-REPLAY'",[JSON.stringify({attachmentId:'ATT-NEWER'})]);
  photoWorkspace.productionTasks[0]={...photoWorkspace.productionTasks[0],revision:3,finishedGoodsPhoto:{attachmentId:'ATT-NEWER'}};
  const beforeReplay=structuredClone(photoWorkspace);
  assert.deepEqual(await photoRepository.uploadPhoto(photoInput),photoSaved);
  assert.deepEqual(photoWorkspace,beforeReplay,'Historic photo receipt must not overwrite newer task/todo/audit projections');
  assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE id='LOG-PHOTO-REPLAY'")).rows[0].n,1);
  console.log('PASS photo PostgreSQL immutable receipt: exact replay returns original result without restoring older workspace state.');
  }
  {
    await pool.query("INSERT INTO printer_devices(id,biz_no,name,device_type) VALUES ('PD-QA-RACE','PD-QA-RACE','Synthetic QA device','label')");
    const qaRepository=createPostgresPrinterDeviceFieldTestRepository({postgresClient:client});
    const qaRecord={recordId:'QA-SAME-IDENTITY',printDeviceId:'PD-QA-RACE',operatorId:'U-OFFICE-A',checkedAt:'2026-09-08T00:00:00Z',checks:[],summary:{status:'pending'},note:'Original QA evidence'};
    const qaInputs=[0,1].map(index=>({workspace:{printerDeviceFieldTests:[],printDevices:[],operationLogs:[]},record:qaRecord,operationLog:{id:'LOG-QA-RACE-'+index,targetType:'print_device',targetId:'PD-QA-RACE',action:'record_printer_device_field_test',operatorId:'U-OFFICE-A',occurredAt:'2026-09-08T00:00:00Z',createdAt:'2026-09-08T00:00:00Z'},idempotencyKey:'qa-race-'+index,idempotencyPayload:{recordId:qaRecord.recordId,note:qaRecord.note}}));
    const qaResults=await Promise.allSettled(qaInputs.map(input=>qaRepository.recordPrinterDeviceFieldTest(input)));
    assert.equal(qaResults.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(qaResults.find(result=>result.status==='rejected').reason.statusCode,409);
    assert.equal((await pool.query("SELECT count(*)::int n FROM printer_device_field_tests WHERE id='QA-SAME-IDENTITY'")).rows[0].n,1);
    assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE id IN ('LOG-QA-RACE-0','LOG-QA-RACE-1')")).rows[0].n,1,'Rejected collision cannot retain a phantom audit');
    const immutableQa=(await pool.query("SELECT to_jsonb(t) AS row FROM printer_device_field_tests t WHERE id='QA-SAME-IDENTITY'")).rows;
    const firstInput=qaInputs[qaResults.findIndex(result=>result.status==='fulfilled')];
    await qaRepository.recordPrinterDeviceFieldTest(firstInput);
    assert.deepEqual((await pool.query("SELECT to_jsonb(t) AS row FROM printer_device_field_tests t WHERE id='QA-SAME-IDENTITY'")).rows,immutableQa);
    console.log('PASS printer QA real PostgreSQL: same record identity has one concurrent winner, rejected collision rolls back audit, identical replay preserves all stored evidence.');
  }
  await checkPostgresLiveMaintenanceScenario({postgresClient:client,pool});
  console.log(`PostgreSQL production/packing integrity passed: ${migrations.length} real migrations, concurrent handoff replay, no stock/packing at silk completion, persisted ownership rollback, package conservation, packing terminal guards and append-only daily report segments. Temporary container cleaned in finally.`);
} finally {
  if (pool) await pool.end();
  spawnSync('docker', ['rm', '-f', name], {
    stdio: 'ignore'
  });
}
