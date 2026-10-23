import { createPostgresProductionPackingTransactionRepository } from "../../server/productionPackingTransactionRepository.mjs";
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
  await pool.query("UPDATE production_tasks SET task_status='制袋中', task_type='制袋' WHERE id=$1",[task.productionTaskId ?? task.id]);
  Object.assign(workspace.orderLines[0],{orderType:'特殊尺寸',size:'43*51*12'});
  Object.assign(task,{taskStatus:'制袋中',status:'制袋中',taskType:'制袋'});
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
  const completed=await production.completeProductionReport({workspace,productionTaskId:task.productionTaskId,operatorId:'U-MINIAPP-PRICE-CREATOR',body:{qualifiedQty:500,idempotencyKey:'p1-live-special-complete'}});
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

  await assert.rejects(pool.query("UPDATE fulfillment_records SET signature_status='signed' WHERE id=$1",[fulfillmentId]),/fulfillment_signature_state_check/);
  await assert.rejects(pool.query("UPDATE fulfillment_records SET signature_status='unsigned' WHERE id=$1",[fulfillmentId]),/fulfillment_signature_state_check/);
  await pool.query("UPDATE fulfillment_records SET signature_status='unsigned', unsigned_reason='客户不在场' WHERE id=$1",[fulfillmentId]);
  console.log('P1 PostgreSQL production and packing: both pauses gate resume, special completion creates no inventory, packages conserve 500, signature evidence constraints fail closed.');
  console.log('P1 locked quote -> office queue -> real command registry -> PostgreSQL confirmation: 495 preserved, source immutable, shortage production created.');
}
