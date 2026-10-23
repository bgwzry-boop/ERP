import { buildPublishProductionScheduleTransactionQuery, createPostgresProductionPackingTransactionRepository } from "../../server/productionPackingTransactionRepository.mjs";
import assert from 'node:assert/strict';
import { createApiSharedServiceRegistry } from '../../server/apiSharedServiceRegistry.mjs';
import { createPostgresOrderDraftRepository } from '../../server/orderDraftRepository.mjs';
import { createPostgresOrderConfirmationTransactionRepository } from '../../server/orderConfirmationTransactionRepository.mjs';
import { bagwinPayloadSha256 } from '../../server/miniapp/bagwinErpIntegrationService.mjs';
import { handleOrderReadRoutes } from '../../server/routes/orderReadRoutes.mjs';

export async function checkP1OrderConfirmationLive({ databaseUrl, pool, bagwinService, bagwinOrder }) {
  const order = structuredClone(bagwinOrder);
  order.sourceOrderNo = 'WT20261023ABCDEF1234';
  order.delivery.desiredDate = '2026-10-30';
  order.pricing.estimatedAmount = 495;
  order.pricing.confirmedAmount = 495;
  order.lines[0].estimatedAmount = 495;
  order.lines[0].quoteSnapshot = { amount: 495, quantity: 500, unitPrice: 0.99, basePrice: 0.99, handleAddon: 0, specialRequirementAddon: 0, printFee: 0, priceVersion: order.pricing.priceVersion, priceLocked: true };
  const created = await bagwinService.createOrder({ schemaVersion: 1, sourceOrderNo: order.sourceOrderNo, payloadSha256: bagwinPayloadSha256(order), order });
  const stored = (await pool.query('SELECT draft_id FROM order_intake_submissions WHERE id=$1', [created.erpOrderId])).rows[0];
  assert.ok(stored?.draft_id);
  const repository = createPostgresOrderDraftRepository({ databaseUrl });
  const transactionRepository = createPostgresOrderConfirmationTransactionRepository({ databaseUrl });
  const draft = await repository.getOrderDraft({ draftId: stored.draft_id });
  const workspace = {
    customers: [{ id: order.customer.erpCustomerId, name: '联调客户' }], users: [{ id: 'U-MINIAPP-PRICE-CREATOR' }],
    orderDrafts: [draft], orderLines: [], fulfillments: [], inventories: [], inventoryReservations: [], todos: [], operationLogs: [], inventoryIntents: [], packages: [], productionTasks: [], priceSnapshots: [],
    orderDraftRepository: repository, orderConfirmationTransactionRepository: transactionRepository,
  };
  let queue;
  await handleOrderReadRoutes({ url: new URL('http://offline.invalid/api/order-drafts?queueOnly=true&page=1&pageSize=1&draftId='+draft.id), workspace, response: {}, sendJson: (_r,_s,data) => { queue=data; } });
  assert.equal(queue.total, 1); assert.equal(queue.items[0].id, draft.id);
  const service = createApiSharedServiceRegistry().orderDraftCommandService;
  const lines = draft.lines.map(line => ({ ...line, draftLineId: line.id, productName: line.product, bagColor: line.color, handleType: line.handle, printFlag: line.print === '是', fulfillmentMethod: '自提', latestNeededAt: '2026-10-30' }));
  const original = structuredClone(lines);
  await assert.rejects(service.confirmOrderDraft({workspace,draftId:draft.id,operatorId:'U-MINIAPP-PRICE-CREATOR',body:{expectedRevision:1,lines:lines.map(line => ({...line,qty:501}))}}), {code:'MINIAPP_LOCKED_ORDER_CHANGED'});
  const realConfirm = transactionRepository.confirmOrder.bind(transactionRepository);
  transactionRepository.confirmOrder = async input => {
    await pool.query("UPDATE order_intake_submissions SET revision=revision+1 WHERE draft_id=$1",[draft.id]);
    return realConfirm(input);
  };
  await assert.rejects(service.confirmOrderDraft({workspace,draftId:draft.id,operatorId:'U-MINIAPP-PRICE-CREATOR',body:{expectedRevision:1,idempotencyKey:'p1-miniapp-source-drift',lines:original}}), {code:"BUSINESS_WRITE_CONFLICT"});
  assert.equal((await pool.query('SELECT count(*)::int n FROM original_orders')).rows[0].n,0);
  transactionRepository.confirmOrder = realConfirm;
  const confirmed = await service.confirmOrderDraft({workspace,draftId:draft.id,operatorId:'U-MINIAPP-PRICE-CREATOR',body:{expectedRevision:1,idempotencyKey:'p1-miniapp-confirm-live',lines:original}});
  assert.ok(confirmed.response, JSON.stringify(confirmed));
  const prices = (await pool.query('SELECT final_amount,source_evidence_json FROM price_snapshots WHERE source_evidence_json->>sourceOrderNo=$1'.replace('->>sourceOrderNo',"->>'sourceOrderNo'"), [order.sourceOrderNo])).rows;
  assert.equal(prices.length,1); assert.equal(Number(prices[0].final_amount),495);
  assert.equal(prices[0].source_evidence_json.priceReleaseSha256, order.pricing.priceReleaseSha256);
  assert.equal((await pool.query("SELECT count(*)::int n FROM production_tasks WHERE order_line_id IN (SELECT order_line_id FROM price_snapshots WHERE source_evidence_json->>'sourceOrderNo'=$1)",[order.sourceOrderNo])).rows[0].n,1);
  await assert.rejects(pool.query("UPDATE price_snapshots SET source_evidence_json='{}' WHERE source_evidence_json->>'sourceOrderNo'=$1",[order.sourceOrderNo]), /immutable/);
  workspace.productionPackingTransactionRepository = createPostgresProductionPackingTransactionRepository({ databaseUrl });
  const task = workspace.productionTasks[0];
  assert.ok(task);
  await pool.query("UPDATE order_lines SET order_type='特殊尺寸', size='43*51*12' WHERE id=$1",[task.orderLineId]);
  await pool.query("INSERT INTO machines (id,biz_no,name,machine_type,workshop,status,enabled) VALUES ('P1-BAG','P1-BAG','隔离制袋机','bag_making','测试','active',true) ON CONFLICT DO NOTHING");
  await pool.query("UPDATE production_tasks SET task_status='制袋中', task_type='制袋', machine_id='P1-BAG' WHERE id=$1",[task.productionTaskId ?? task.id]);
  Object.assign(workspace.orderLines[0],{orderType:'特殊尺寸',size:'43*51*12'});
  Object.assign(task,{machineId:'P1-BAG',taskStatus:'制袋中',status:'制袋中',taskType:'制袋'});
  const production = createApiSharedServiceRegistry().productionReportingCommandService;
  for (const n of [1,2]) {
    const result = await production.recordProductionException({workspace,productionTaskId:task.productionTaskId,operatorId:'U-MINIAPP-PRICE-CREATOR',body:{productionExceptionId:`PEX-LIVE-P1-${n}`,exceptionType:'机器问题',continuationMode:'暂停等确认',remark:'隔离数据库维修验证',idempotencyKey:`p1-live-pause-${n}`}});
    assert.ok(result.response,JSON.stringify(result));
  }
  for (const [n,status] of [[1,'异常暂停'],[2,'制袋中']]) {
    const result=await production.resolveProductionException({workspace,productionTaskId:task.productionTaskId,operatorId:'U-MINIAPP-PRICE-CREATOR',body:{productionExceptionId:`PEX-LIVE-P1-${n}`,resolutionCode:'继续生产',resolutionNote:'已维修',resolutionConfirmed:true,idempotencyKey:`p1-live-resolve-${n}`}});
    assert.ok(result.response,JSON.stringify(result));
    assert.equal((await pool.query('SELECT task_status FROM production_tasks WHERE id=$1',[task.productionTaskId])).rows[0].task_status,status);
  }
  await pool.query("UPDATE production_tasks SET task_type='丝印', task_status='丝印中' WHERE id=$1",[task.productionTaskId]);
  Object.assign(workspace.productionTasks.find(row=>row.productionTaskId===task.productionTaskId),{taskType:'丝印',taskStatus:'丝印中',status:'丝印中'});
  const screen=await production.completeProductionReport({workspace,productionTaskId:task.productionTaskId,operatorId:'U-MINIAPP-PRICE-CREATOR',body:{qualifiedQty:500,machineCount:505,idempotencyKey:'p1-live-screen-complete'}});
  assert.ok(screen.response,JSON.stringify(screen));assert.ok(screen.response.downstreamProductionTaskId);
  assert.equal((await pool.query('SELECT count(*)::int n FROM packing_tasks WHERE order_line_id=$1',[task.orderLineId])).rows[0].n,0);
  const downstream=workspace.productionTasks.find(row=>row.productionTaskId===screen.response.downstreamProductionTaskId);
  assert.equal(downstream.taskType,'制袋');assert.equal(downstream.taskStatus,'待排产');
  await pool.query("INSERT INTO employees (id,biz_no,name,role_name) VALUES ('P1-MANAGER','P1-MANAGER','隔离负责人','管理') ON CONFLICT DO NOTHING");
  const timestamp = new Date().toISOString();
  const scheduleQuery = buildPublishProductionScheduleTransactionQuery({
    productionTask:{...downstream,machineId:'P1-BAG',taskStatus:'制袋中',publishedScheduleId:'SCH-P1-BAG'},
    productionScheduleRecord:{scheduleRecordId:'SQR-P1-BAG',productionTaskId:downstream.productionTaskId,orderLineId:task.orderLineId,machineId:'P1-BAG',publishedScheduleId:'SCH-P1-BAG',createdBy:'U-MINIAPP-PRICE-CREATOR',createdAt:timestamp},
    orderLine:{...workspace.orderLines[0],lineStatus:'制袋中'},
    operationLog:{id:'LOG-P1-BAG',targetType:'production_task',targetId:downstream.productionTaskId,action:'publish_production_schedule',operatorId:'U-MINIAPP-PRICE-CREATOR',occurredAt:timestamp,createdAt:timestamp},
    decisionRecord:{id:'BD-P1-BAG',businessType:'production_task',businessId:downstream.productionTaskId,decisionScope:'production_schedule',decisionType:'direct',decisionMakerEmployeeId:'P1-MANAGER',decisionMakerEmployeeNoSnapshot:'P1-MANAGER',decisionMakerNameSnapshot:'隔离负责人',decisionChannel:'self_system',decidedAt:timestamp,decisionContent:{summary:'确认制袋'},authorizationSnapshot:{},authorizationBasis:'本人决定',enteredByUserId:'U-MINIAPP-PRICE-CREATOR',enteredAt:timestamp,status:'active',revision:1,operationLogId:'LOG-P1-BAG',createdAt:timestamp,updatedAt:timestamp},
  });
  const executeSchedule=()=>pool.query(scheduleQuery.text.replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;$/, ''),scheduleQuery.values);
  await pool.query("UPDATE machines SET enabled=false WHERE id='P1-BAG'");
  await assert.rejects(executeSchedule(),/PRODUCTION_MACHINE_NOT_AVAILABLE/);
  await pool.query("UPDATE machines SET enabled=true,machine_type='screen_printing' WHERE id='P1-BAG'");
  await assert.rejects(executeSchedule(),/PRODUCTION_MACHINE_NOT_AVAILABLE/);
  await pool.query("UPDATE machines SET machine_type='bag_making' WHERE id='P1-BAG'");
  const scheduled=(await executeSchedule()).rows[0].result;
  Object.assign(downstream,scheduled.productionTask,{status:scheduled.productionTask.taskStatus});
  Object.assign(workspace.orderLines[0],scheduled.orderLine,{status:scheduled.orderLine.lineStatus});

  const completed=await production.completeProductionReport({workspace,productionTaskId:downstream.productionTaskId,operatorId:'U-MINIAPP-PRICE-CREATOR',body:{qualifiedQty:500,idempotencyKey:'p1-live-special-complete'}});
  assert.ok(completed.response,JSON.stringify(completed));assert.equal(completed.response.inventoryItemId,'');
  const packing = createApiSharedServiceRegistry().packingCommandService;
  const packed=await packing.completePackingTask({workspace,packingTaskId:completed.response.packingTaskId,operatorId:'U-MINIAPP-PRICE-CREATOR',body:{actualPackedQty:500,packages:[{packedQty:300},{packedQty:200}],idempotencyKey:'p1-live-pack'}});
  assert.ok(packed.response,JSON.stringify(packed));
  assert.equal((await pool.query('SELECT sum(packed_qty)::int n FROM packages WHERE order_line_id=$1',[task.orderLineId])).rows[0].n,500);
  const fulfillmentId=workspace.fulfillments[0].id;
  const ids=workspace.packages.map(p=>p.packageId);
  assert.equal((await pool.query('SELECT erp_require_driver_packages($1,$2,$3) ok',[fulfillmentId,task.orderLineId,ids])).rows[0].ok,true);
  for (const scanned of [[],[ids[0],ids[0]],ids.concat('FOREIGN-PACKAGE')]) await assert.rejects(pool.query('SELECT erp_require_driver_packages($1,$2,$3)',[fulfillmentId,task.orderLineId,scanned]),/DRIVER_REAL_PACKAGES_CHANGED/);
  const retry=await packing.completePackingTask({workspace,packingTaskId:completed.response.packingTaskId,operatorId:'U-MINIAPP-PRICE-CREATOR',body:{actualPackedQty:500,packages:[{packedQty:300},{packedQty:200}],idempotencyKey:'p1-live-pack'}});
  assert.deepEqual(retry.response.packageIds,packed.response.packageIds);

  // A second fulfillment is fixture intake; actual package creation still uses the real service + PostgreSQL transaction.
  const stockLine = { ...workspace.orderLines[0], id: 'OL-P1-STOCK', orderLineId: 'OL-P1-STOCK', orderType: '现货通货', status: '待出库', lineStatus: '待出库', revision: 1 };
  await pool.query("INSERT INTO order_lines SELECT (jsonb_populate_record(NULL::order_lines, to_jsonb(l) || jsonb_build_object('id','OL-P1-STOCK','biz_no','OL-P1-STOCK','order_type','现货通货','line_status','待出库','revision',1))).* FROM order_lines l WHERE id=$1",[task.orderLineId]);
  await pool.query("INSERT INTO fulfillment_records SELECT (jsonb_populate_record(NULL::fulfillment_records, to_jsonb(f) || jsonb_build_object('id','F-P1-STOCK','biz_no','F-P1-STOCK','order_line_id','OL-P1-STOCK','status','待出库','revision',1))).* FROM fulfillment_records f WHERE id=$1",[fulfillmentId]);
  workspace.orderLines.push(stockLine);workspace.fulfillments.push({...workspace.fulfillments[0],id:'F-P1-STOCK',fulfillmentId:'F-P1-STOCK',orderLineId:'OL-P1-STOCK',lineId:'OL-P1-STOCK',status:'待出库',revision:1});
  const stockResult=await packing.completePackingTask({workspace,packingTaskId:'PKT-F-F-P1-STOCK',operatorId:'U-MINIAPP-PRICE-CREATOR',body:{fulfillmentId:'F-P1-STOCK',actualPackedQty:500,packages:[{packedQty:250},{packedQty:250}],idempotencyKey:'p1-live-stock-packing'}});
  assert.ok(stockResult.response,JSON.stringify(stockResult));assert.equal((await pool.query("SELECT count(*)::int n FROM packages WHERE fulfillment_id='F-P1-STOCK'")).rows[0].n,2);

  await assert.rejects(pool.query("UPDATE fulfillment_records SET signature_status='signed' WHERE id=$1",[fulfillmentId]),/fulfillment_signature_state_check/);
  await assert.rejects(pool.query("UPDATE fulfillment_records SET signature_status='unsigned' WHERE id=$1",[fulfillmentId]),/fulfillment_signature_state_check/);
  await pool.query("UPDATE fulfillment_records SET signature_status='unsigned', unsigned_reason='客户不在场' WHERE id=$1",[fulfillmentId]);
  console.log('P1 PostgreSQL production and packing: both pauses gate resume, special completion creates no inventory, packages conserve 500, signature evidence constraints fail closed.');
  console.log('P1 locked quote -> office queue -> real command registry -> PostgreSQL confirmation: 495 preserved, source immutable, shortage production created.');
}
